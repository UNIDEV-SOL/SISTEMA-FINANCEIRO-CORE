import type { Prisma, Transaction } from "../../generated/prisma";
import { prisma } from "../../shared/db/prisma";
import { ConflictException, NotFoundException, type FieldError } from "../../shared/errors/http-exceptions";
import { orderByOf, toPage, type PageRequest } from "../../shared/http/pagination";
import { throwIfInvalid, zodFieldErrors } from "../../shared/http/validation";
import { currentYearMonth, fromIsoDate, monthRange, toIsoDate, type YearMonth } from "../../shared/lib/dates";
import { toMoney, ZERO } from "../../shared/lib/money";
import { periodsService } from "../periods/periods.service";
import { transactionInputSchema, type TRANSACTION_SORTS, type TransactionInput } from "./transactions.schemas";
import type { TransactionList, TransactionResponse } from "./transactions.types";

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const toTransactionResponse = (t: Transaction & { _count?: { attachments: number } }): TransactionResponse => ({
  id: t.id,
  type: t.type,
  description: t.description,
  amount: toMoney(t.amount),
  date: toIsoDate(t.date),
  accountId: t.accountId,
  destinationAccountId: t.destinationAccountId ?? undefined,
  categoryId: t.categoryId ?? undefined,
  status: t.status,
  notes: t.notes ?? undefined,
  recurringId: t.recurringId ?? undefined,
  attachments: t._count?.attachments ?? 0,
  createdAt: t.createdAt.toISOString(),
});

/** Mais recentes primeiro; no mesmo dia, a última registada primeiro. */
export const NEWEST_FIRST: Prisma.TransactionOrderByWithRelationInput[] = [{ date: "desc" }, { createdAt: "desc" }];

interface Filters {
  month?: YearMonth;
  type?: Transaction["type"];
  accountId?: string;
  categoryId?: string;
  q?: string;
}

export type References = Partial<Pick<TransactionInput, "type" | "accountId" | "destinationAccountId" | "categoryId">>;

/** Lê as referências do corpo em bruto, para as validar mesmo quando outros campos falham. */
export function referencesOf(body: unknown): References {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);
  const type = ["INCOME", "EXPENSE", "TRANSFER"].includes(b.type as string) ? (b.type as TransactionInput["type"]) : undefined;
  return { type, accountId: str(b.accountId), destinationAccountId: str(b.destinationAccountId), categoryId: str(b.categoryId) };
}

/**
 * Regras que dependem da base de dados.
 * Uma conta arquivada só é aceite se a transação já a usava (editar transações antigas).
 */
export async function validateReferences(
  userId: string,
  input: References,
  current?: Pick<Transaction, "accountId" | "destinationAccountId">,
): Promise<FieldError[]> {
  const errors: FieldError[] = [];
  const accountIds = [input.accountId, input.destinationAccountId].filter((id): id is string => !!id && UUID.test(id));
  const [accounts, category] = await Promise.all([
    prisma.account.findMany({ where: { userId, id: { in: accountIds } } }),
    input.categoryId && UUID.test(input.categoryId) ? prisma.category.findFirst({ where: { userId, id: input.categoryId } }) : null,
  ]);
  const usable = (id: string | undefined, previous: string | null | undefined) => {
    const account = accounts.find((a) => a.id === id);
    return !!account && (!account.archived || account.id === previous);
  };

  if (!usable(input.accountId, current?.accountId)) errors.push({ field: "accountId", message: "Escolha uma conta." });

  if (!input.type) return errors;
  if (input.type === "TRANSFER") {
    if (!usable(input.destinationAccountId, current?.destinationAccountId))
      errors.push({ field: "destinationAccountId", message: "Escolha a conta de destino." });
    else if (input.destinationAccountId === input.accountId)
      errors.push({ field: "destinationAccountId", message: "A conta de destino tem de ser diferente." });
  } else if (!category) {
    errors.push({ field: "categoryId", message: "Escolha uma categoria." });
  } else if (category.kind !== input.type) {
    errors.push({ field: "categoryId", message: "A categoria não corresponde ao tipo." });
  }
  return errors;
}

function fields(input: TransactionInput) {
  const transfer = input.type === "TRANSFER";
  return {
    type: input.type,
    description: input.description,
    amount: input.amount,
    date: fromIsoDate(input.date),
    accountId: input.accountId,
    destinationAccountId: transfer ? input.destinationAccountId! : null,
    categoryId: transfer ? null : input.categoryId!,
    status: input.status,
    notes: input.notes ?? null,
  };
}

export const transactionsService = {
  /** Página das transações de um mês; os totais são de todo o filtro. `search` (ou `q`) procura na descrição e nas notas. */
  async list(userId: string, filters: Filters, page: PageRequest<(typeof TRANSACTION_SORTS)[number]>): Promise<TransactionList> {
    // Filtros com ids mal formados não encontram nada (em vez de erro do Postgres)
    if ([filters.accountId, filters.categoryId].some((id) => id && !UUID.test(id))) {
      return { ...toPage([], 0, page), totals: { income: "0.00", expense: "0.00", net: "0.00" } };
    }

    const month = filters.month ?? currentYearMonth();
    const where: Prisma.TransactionWhereInput = { userId, date: monthRange(month), type: filters.type };
    const and: Prisma.TransactionWhereInput[] = [];
    if (filters.accountId) and.push({ OR: [{ accountId: filters.accountId }, { destinationAccountId: filters.accountId }] });
    if (filters.categoryId) and.push({ categoryId: filters.categoryId });
    const search = page.search ?? (filters.q?.trim() || undefined);
    if (search) and.push({ OR: [{ description: { contains: search, mode: "insensitive" } }, { notes: { contains: search, mode: "insensitive" } }] });
    if (and.length) where.AND = and;

    const [items, total, sums] = await Promise.all([
      prisma.transaction.findMany({
        where,
        include: { _count: { select: { attachments: true } } },
        orderBy: orderByOf(page.sort, NEWEST_FIRST),
        skip: page.skip,
        take: page.size,
      }),
      prisma.transaction.count({ where }),
      prisma.transaction.groupBy({ by: ["type"], where, _sum: { amount: true } }),
    ]);
    const totalOf = (type: Transaction["type"]) => sums.find((s) => s.type === type)?._sum.amount ?? ZERO;
    const income = totalOf("INCOME");
    const expense = totalOf("EXPENSE");
    return {
      ...toPage(items.map(toTransactionResponse), total, page),
      totals: { income: toMoney(income), expense: toMoney(expense), net: toMoney(income.sub(expense)) },
    };
  },

  async findOwned(userId: string, id: string): Promise<Transaction> {
    const transaction = await prisma.transaction.findFirst({ where: { id, userId } });
    if (!transaction) throw new NotFoundException("A transação");
    return transaction;
  },

  /** Valida o corpo e as referências juntos, para o formulário receber todos os erros de uma vez. */
  async parse(userId: string, body: unknown, current?: Transaction): Promise<TransactionInput> {
    const parsed = transactionInputSchema.safeParse(body);
    const referenceErrors = await validateReferences(userId, referencesOf(body), current);
    throwIfInvalid(parsed.success ? [] : zodFieldErrors(parsed.error), referenceErrors);
    return parsed.data!;
  },

  async create(userId: string, body: unknown): Promise<TransactionResponse> {
    const input = await this.parse(userId, body);
    await periodsService.assertWritable(input.date, "date");
    // Com importRef (lançada a partir de um SMS colado), a mesma mensagem não entra duas vezes
    if (input.importRef && (await prisma.transaction.findUnique({ where: { userId_importRef: { userId, importRef: input.importRef } }, select: { id: true } })))
      throw new ConflictException("Esta mensagem já foi registada.");
    const transaction = await prisma.transaction.create({ data: { userId, ...fields(input), importRef: input.importRef ?? null } });
    return toTransactionResponse(transaction);
  },

  async update(userId: string, id: string, body: unknown): Promise<TransactionResponse> {
    const current = await this.findOwned(userId, id);
    const input = await this.parse(userId, body, current);
    // Nem sair de um ano fechado nem entrar num
    await periodsService.assertWritable(current.date);
    await periodsService.assertWritable(input.date, "date");
    const transaction = await prisma.transaction.update({ where: { id }, data: fields(input), include: { _count: { select: { attachments: true } } } });
    return toTransactionResponse(transaction);
  },

  /** Confirma uma prevista: passa a liquidada (entra no saldo), sem mexer no resto. */
  async confirm(userId: string, id: string): Promise<TransactionResponse> {
    const current = await this.findOwned(userId, id);
    await periodsService.assertWritable(current.date);
    const transaction = await prisma.transaction.update({ where: { id }, data: { status: "CLEARED" }, include: { _count: { select: { attachments: true } } } });
    return toTransactionResponse(transaction);
  },

  async remove(userId: string, id: string): Promise<void> {
    const current = await this.findOwned(userId, id);
    await periodsService.assertWritable(current.date);
    await prisma.transaction.delete({ where: { id } });
  },
};
