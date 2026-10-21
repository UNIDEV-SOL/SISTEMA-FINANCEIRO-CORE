import type { Prisma, RecurringTransaction } from "../../generated/prisma";
import { prisma } from "../../shared/db/prisma";
import { NotFoundException } from "../../shared/errors/http-exceptions";
import { orderByOf, toPage, type PageRequest } from "../../shared/http/pagination";
import { throwIfInvalid, zodFieldErrors } from "../../shared/http/validation";
import { addDays, fromIsoDate, todayIso, toIsoDate, toIsoDateOrUndefined, yearOf, type IsoDate } from "../../shared/lib/dates";
import { logger } from "../../shared/logger";
import { sum, toMoney } from "../../shared/lib/money";
import { appSettings } from "../../shared/settings/app-settings";
import { periodsService } from "../periods/periods.service";
import { referencesOf, validateReferences } from "../transactions/transactions.service";
import { firstIndexAfter, monthlyEquivalent, occurrenceOrEnd, type Schedule } from "./recurring.schedule";
import { recurringInputSchema, type RECURRING_SORTS, type RecurringInput } from "./recurring.schemas";
import type { RecurringList, RecurringResponse } from "./recurring.types";

// Uma recorrente semanal com início muito antigo não gera tudo de uma vez: o resto fica para a próxima corrida
const MAX_PER_RUN = 400;

type Rule = RecurringTransaction & { _count?: { transactions: number } };

const scheduleOf = (r: Pick<RecurringTransaction, "frequency" | "interval" | "startDate" | "endDate">): Schedule => ({
  frequency: r.frequency,
  interval: r.interval,
  startDate: toIsoDate(r.startDate),
  endDate: toIsoDateOrUndefined(r.endDate),
});

const toResponse = (r: Rule): RecurringResponse => ({
  id: r.id,
  type: r.type,
  description: r.description,
  amount: toMoney(r.amount),
  accountId: r.accountId,
  destinationAccountId: r.destinationAccountId ?? undefined,
  categoryId: r.categoryId ?? undefined,
  notes: r.notes ?? undefined,
  frequency: r.frequency,
  interval: r.interval,
  startDate: toIsoDate(r.startDate),
  endDate: toIsoDateOrUndefined(r.endDate),
  nextDate: r.nextDate ? toIsoDate(r.nextDate) : null,
  autoConfirm: r.autoConfirm,
  commitment: r.commitment,
  active: r.active,
  monthlyAmount: toMoney(monthlyEquivalent(r.amount, r.frequency, r.interval)),
  occurrences: r._count?.transactions ?? 0,
  createdAt: r.createdAt.toISOString(),
  updatedAt: r.updatedAt.toISOString(),
});

function fields(input: RecurringInput) {
  const transfer = input.type === "TRANSFER";
  return {
    type: input.type,
    description: input.description,
    amount: input.amount,
    accountId: input.accountId,
    destinationAccountId: transfer ? input.destinationAccountId! : null,
    categoryId: transfer ? null : input.categoryId!,
    notes: input.notes ?? null,
    frequency: input.frequency,
    interval: input.interval,
    startDate: fromIsoDate(input.startDate),
    endDate: input.endDate ? fromIsoDate(input.endDate) : null,
    autoConfirm: input.autoConfirm,
    commitment: input.commitment,
    active: input.active,
  };
}

const openYears = async () => new Set((await prisma.period.findMany({ where: { status: "OPEN" }, select: { year: true } })).map((p) => p.year));

/** Ocorrências ainda por acontecer (previstas e com data futura): são as que se refazem ao alterar a recorrente. */
const futureOccurrences = (recurringId: string, today: IsoDate): Prisma.TransactionWhereInput => ({
  recurringId,
  status: "PENDING",
  date: { gt: fromIsoDate(today) },
});

/**
 * Gera as ocorrências de uma recorrente até `horizon`. As de anos fechados são saltadas (sem as criar).
 * Só grava se ninguém gerou entretanto (o `generated` serve de versão), para o job e um pedido não duplicarem.
 */
async function generate(rule: RecurringTransaction, today: IsoDate, horizon: IsoDate, open: Set<number>): Promise<number> {
  const schedule = scheduleOf(rule);
  let n = rule.generated;
  let next = rule.nextDate ? toIsoDate(rule.nextDate) : null;
  const rows: Prisma.TransactionCreateManyInput[] = [];
  for (let i = 0; next && next <= horizon && i < MAX_PER_RUN; i++) {
    if (open.has(yearOf(next))) {
      rows.push({
        userId: rule.userId,
        type: rule.type,
        description: rule.description,
        amount: rule.amount,
        date: fromIsoDate(next),
        accountId: rule.accountId,
        destinationAccountId: rule.destinationAccountId,
        categoryId: rule.categoryId,
        notes: rule.notes,
        status: rule.autoConfirm && next <= today ? "CLEARED" : "PENDING",
        recurringId: rule.id,
      });
    }
    n++;
    next = occurrenceOrEnd(schedule, n);
  }
  if (n === rule.generated) return 0;

  return prisma.$transaction(async (tx) => {
    const claimed = await tx.recurringTransaction.updateMany({
      where: { id: rule.id, generated: rule.generated },
      data: { generated: n, nextDate: next ? fromIsoDate(next) : null },
    });
    if (!claimed.count) return 0;
    await tx.transaction.createMany({ data: rows });
    return rows.length;
  });
}

/** Volta a apontar a recorrente para a primeira ocorrência depois de `after` (ou para o início, se nunca gerou). */
function restartAt(rule: Parameters<typeof scheduleOf>[0], after: IsoDate | null) {
  const schedule = scheduleOf(rule);
  const n = after ? firstIndexAfter(schedule, after) : 0;
  const next = occurrenceOrEnd(schedule, n);
  return { generated: n, nextDate: next ? fromIsoDate(next) : null };
}

async function findOwned(userId: string, id: string): Promise<RecurringTransaction> {
  const rule = await prisma.recurringTransaction.findFirst({ where: { id, userId } });
  if (!rule) throw new NotFoundException("A recorrente");
  return rule;
}

async function withCount(id: string): Promise<RecurringResponse> {
  return toResponse(await prisma.recurringTransaction.findUniqueOrThrow({ where: { id }, include: { _count: { select: { transactions: true } } } }));
}

async function parse(userId: string, body: unknown, current?: RecurringTransaction): Promise<RecurringInput> {
  const parsed = recurringInputSchema.safeParse(body);
  const referenceErrors = await validateReferences(userId, referencesOf(body), current);
  throwIfInvalid(parsed.success ? [] : zodFieldErrors(parsed.error), referenceErrors);
  return parsed.data!;
}

export const recurringService = {
  /**
   * Gera o que falta (até `recurring.daysAhead` dias à frente) e liquida as previstas cujo dia chegou
   * nas recorrentes com `autoConfirm`. Sem `userId`, corre para todos (job diário).
   */
  async materialize(userId?: string): Promise<number> {
    await periodsService.ensureCurrent();
    const today = todayIso();
    const horizon = addDays(today, await appSettings.get("recurring.daysAhead"));
    const open = await openYears();

    const rules = await prisma.recurringTransaction.findMany({
      where: {
        userId,
        active: true,
        nextDate: { lte: fromIsoDate(horizon) },
        account: { archived: false },
        OR: [{ destinationAccountId: null }, { destinationAccount: { archived: false } }],
      },
    });
    let created = 0;
    for (const rule of rules) created += await generate(rule, today, horizon, open);

    const due = await prisma.transaction.findMany({
      where: { userId, status: "PENDING", date: { lte: fromIsoDate(today) }, recurring: { autoConfirm: true, active: true } },
      select: { id: true, date: true },
    });
    const confirm = due.filter((t) => open.has(t.date.getUTCFullYear())).map((t) => t.id);
    if (confirm.length) await prisma.transaction.updateMany({ where: { id: { in: confirm } }, data: { status: "CLEARED" } });
    if (!userId && (created || confirm.length)) logger.info(`Recorrentes: ${created} transações geradas, ${confirm.length} liquidadas`);
    return created;
  },

  async list(
    userId: string,
    filters: { active?: boolean; type?: RecurringTransaction["type"] },
    page: PageRequest<(typeof RECURRING_SORTS)[number]>,
  ): Promise<RecurringList> {
    await this.materialize(userId);
    const where: Prisma.RecurringTransactionWhereInput = { userId, active: filters.active, type: filters.type };
    if (page.search)
      where.OR = [{ description: { contains: page.search, mode: "insensitive" } }, { notes: { contains: page.search, mode: "insensitive" } }];

    const [items, total, active] = await Promise.all([
      prisma.recurringTransaction.findMany({
        where,
        include: { _count: { select: { transactions: true } } },
        orderBy: orderByOf<Prisma.RecurringTransactionOrderByWithRelationInput>(page.sort, [
          { active: "desc" },
          { nextDate: { sort: "asc", nulls: "last" } },
          { description: "asc" },
        ]),
        skip: page.skip,
        take: page.size,
      }),
      prisma.recurringTransaction.count({ where }),
      prisma.recurringTransaction.findMany({
        where: { userId, active: true, nextDate: { not: null }, type: { in: ["INCOME", "EXPENSE"] } },
        select: { type: true, amount: true, frequency: true, interval: true },
      }),
    ]);
    const monthly = (type: RecurringTransaction["type"]) =>
      toMoney(sum(active.filter((r) => r.type === type).map((r) => monthlyEquivalent(r.amount, r.frequency, r.interval))));
    return { ...toPage(items.map(toResponse), total, page), totals: { monthlyIncome: monthly("INCOME"), monthlyExpense: monthly("EXPENSE") } };
  },

  async get(userId: string, id: string): Promise<RecurringResponse> {
    await findOwned(userId, id);
    return withCount(id);
  },

  /** Com início no passado, gera logo as ocorrências em falta (nos anos abertos). */
  async create(userId: string, body: unknown): Promise<RecurringResponse> {
    const input = await parse(userId, body);
    const first = occurrenceOrEnd({ ...input, endDate: input.endDate ?? null }, 0);
    const rule = await prisma.recurringTransaction.create({
      data: { userId, ...fields(input), generated: 0, nextDate: first ? fromIsoDate(first) : null },
    });
    await this.materialize(userId);
    return withCount(rule.id);
  },

  /**
   * As alterações valem daqui para a frente: as ocorrências futuras ainda previstas são refeitas com os
   * novos dados; as passadas ficam como estão.
   */
  async update(userId: string, id: string, body: unknown): Promise<RecurringResponse> {
    const current = await findOwned(userId, id);
    const input = await parse(userId, body, current);
    const today = todayIso();
    await prisma.$transaction(async (tx) => {
      await tx.transaction.deleteMany({ where: futureOccurrences(id, today) });
      const last = await tx.transaction.findFirst({ where: { recurringId: id }, orderBy: { date: "desc" }, select: { date: true } });
      // Nunca gerou nada: recomeça do início; senão, continua depois de hoje (ou da última que ficou)
      const after = current.generated === 0 && !last ? null : [today, last ? toIsoDate(last.date) : today].sort().at(-1)!;
      await tx.recurringTransaction.update({ where: { id }, data: { ...fields(input), ...restartAt(fields(input), after) } });
    });
    await this.materialize(userId);
    return withCount(id);
  },

  /** Apaga a recorrente e as ocorrências futuras ainda previstas; as outras ficam, sem ligação. */
  async remove(userId: string, id: string): Promise<void> {
    await findOwned(userId, id);
    await prisma.$transaction([
      prisma.transaction.deleteMany({ where: futureOccurrences(id, todayIso()) }),
      prisma.recurringTransaction.delete({ where: { id } }),
    ]);
  },

  /** Salta a próxima ocorrência: apaga-a se já foi gerada (prevista), senão avança a recorrente. */
  async skip(userId: string, id: string): Promise<RecurringResponse> {
    const rule = await findOwned(userId, id);
    const today = todayIso();
    const upcoming = await prisma.transaction.findFirst({
      where: { recurringId: id, status: "PENDING", date: { gte: fromIsoDate(today) } },
      orderBy: { date: "asc" },
    });
    if (upcoming) {
      await periodsService.assertWritable(upcoming.date);
      await prisma.transaction.delete({ where: { id: upcoming.id } });
    } else if (rule.nextDate) {
      await periodsService.assertWritable(rule.nextDate);
      const next = occurrenceOrEnd(scheduleOf(rule), rule.generated + 1);
      await prisma.recurringTransaction.update({ where: { id }, data: { generated: rule.generated + 1, nextDate: next ? fromIsoDate(next) : null } });
    }
    return withCount(id);
  },
};
