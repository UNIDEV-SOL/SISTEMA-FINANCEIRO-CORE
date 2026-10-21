import type { Goal, GoalContribution, Prisma } from "../../generated/prisma";
import { prisma } from "../../shared/db/prisma";
import { NotFoundException, ValidationException, type FieldError } from "../../shared/errors/http-exceptions";
import { orderByOf, toPage, type Page, type PageRequest } from "../../shared/http/pagination";
import { throwIfInvalid, zodFieldErrors } from "../../shared/http/validation";
import { fromIsoDate, monthsBetween, todayIso, toIsoDate, toIsoDateOrUndefined } from "../../shared/lib/dates";
import { Decimal, sum, toMoney } from "../../shared/lib/money";
import { periodsService } from "../periods/periods.service";
import { goalInputSchema, type ContributionInput, type GOAL_SORTS, type GoalInput } from "./goals.schemas";
import type { GoalResponse } from "./goals.types";

type GoalWithContributions = Goal & { contributions: GoalContribution[] };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const withContributions = { contributions: { orderBy: [{ date: "desc" as const }, { createdAt: "desc" as const }] } };

export const savedIn = (goal: GoalWithContributions): Decimal => sum(goal.contributions.map((c) => c.amount));

export function toGoalResponse(goal: GoalWithContributions, today = todayIso()): GoalResponse {
  const saved = savedIn(goal);
  let monthlyNeeded: string | undefined;
  if (goal.deadline && saved.lessThan(goal.target)) {
    // Conta o mês corrente: com prazo este mês, falta tudo de uma vez
    const months = Math.max(1, monthsBetween(today, toIsoDate(goal.deadline)) + 1);
    monthlyNeeded = toMoney(goal.target.sub(saved).div(months).toDecimalPlaces(2, Decimal.ROUND_UP));
  }
  return {
    id: goal.id,
    name: goal.name,
    icon: goal.icon,
    color: goal.color,
    target: toMoney(goal.target),
    saved: toMoney(saved),
    deadline: toIsoDateOrUndefined(goal.deadline),
    accountId: goal.accountId ?? undefined,
    monthlyNeeded,
    contributions: goal.contributions.map((c) => ({
      id: c.id,
      amount: toMoney(c.amount),
      date: toIsoDate(c.date),
      note: c.note ?? undefined,
      createdAt: c.createdAt.toISOString(),
    })),
    createdAt: goal.createdAt.toISOString(),
  };
}

/** Valida o corpo e a conta juntos, para o formulário receber todos os erros de uma vez. */
async function parse(userId: string, body: unknown): Promise<GoalInput> {
  const parsed = goalInputSchema.safeParse(body);
  const accountId = (body as { accountId?: unknown } | null)?.accountId;
  const errors: FieldError[] = [];
  if (typeof accountId === "string" && accountId) {
    const account = UUID.test(accountId) && (await prisma.account.findFirst({ where: { id: accountId, userId }, select: { id: true } }));
    if (!account) errors.push({ field: "accountId", message: "Escolha uma conta." });
  }
  throwIfInvalid(parsed.success ? [] : zodFieldErrors(parsed.error), errors);
  return parsed.data!;
}

const fields = (input: GoalInput) => ({
  name: input.name,
  icon: input.icon,
  color: input.color,
  target: input.target,
  deadline: input.deadline ? fromIsoDate(input.deadline) : null,
  accountId: input.accountId ?? null,
});

export const goalsService = {
  /** Por omissão, pela ordem de criação; `search` procura no nome. */
  async list(userId: string, page: PageRequest<(typeof GOAL_SORTS)[number]>): Promise<Page<GoalResponse>> {
    const where: Prisma.GoalWhereInput = { userId };
    if (page.search) where.name = { contains: page.search, mode: "insensitive" };
    const [goals, total] = await Promise.all([
      prisma.goal.findMany({ where, include: withContributions, orderBy: orderByOf(page.sort, [{ createdAt: "asc" }]), skip: page.skip, take: page.size }),
      prisma.goal.count({ where }),
    ]);
    return toPage(goals.map((g) => toGoalResponse(g)), total, page);
  },

  async findOwned(userId: string, id: string): Promise<Goal> {
    const goal = await prisma.goal.findFirst({ where: { id, userId } });
    if (!goal) throw new NotFoundException("A meta");
    return goal;
  },

  async create(userId: string, body: unknown): Promise<GoalResponse> {
    const input = await parse(userId, body);
    const goal = await prisma.goal.create({ data: { userId, ...fields(input) }, include: withContributions });
    return toGoalResponse(goal);
  },

  async update(userId: string, id: string, body: unknown): Promise<GoalResponse> {
    await this.findOwned(userId, id);
    const input = await parse(userId, body);
    const goal = await prisma.goal.update({ where: { id }, data: fields(input), include: withContributions });
    return toGoalResponse(goal);
  },

  async remove(userId: string, id: string): Promise<void> {
    await this.findOwned(userId, id);
    await prisma.goal.delete({ where: { id } });
  },

  async contribute(userId: string, id: string, input: ContributionInput): Promise<GoalResponse> {
    await this.findOwned(userId, id);
    if (input.date > todayIso()) throw ValidationException.field("date", "Data inválida.");
    await periodsService.assertWritable(input.date, "date");

    const goal = await prisma.$transaction(async (tx) => {
      // Bloqueia a meta para duas retiradas em simultâneo não deixarem o saldo negativo
      await tx.$queryRaw`SELECT 1 FROM "goals" WHERE "id" = ${id}::uuid FOR UPDATE`;
      const { _sum } = await tx.goalContribution.aggregate({ where: { goalId: id }, _sum: { amount: true } });
      if (new Decimal(_sum.amount ?? 0).add(input.amount).isNegative())
        throw ValidationException.field("amount", "Não pode retirar mais do que o que está guardado.");
      await tx.goalContribution.create({ data: { goalId: id, amount: input.amount, date: fromIsoDate(input.date), note: input.note ?? null } });
      return tx.goal.findUniqueOrThrow({ where: { id }, include: withContributions });
    });
    return toGoalResponse(goal);
  },
};
