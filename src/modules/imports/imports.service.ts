import type { AccountType, Prisma, TransactionType } from "../../generated/prisma";
import { prisma } from "../../shared/db/prisma";
import { HttpException, type FieldError, ValidationException } from "../../shared/errors/http-exceptions";
import { zodFieldErrors } from "../../shared/http/validation";
import { addDays, fromIsoDate, toIsoDate } from "../../shared/lib/dates";
import { Decimal, toMoney } from "../../shared/lib/money";
import { accountBalances } from "../accounts/accounts.ledger";
import { periodsService } from "../periods/periods.service";
import { transactionsService } from "../transactions/transactions.service";
import { type ImportKind, type ImportSource, normalize, type ParsedMovement, type ParseResult } from "./imports.parsers";
import { importItemSchema } from "./imports.schemas";

export type PreviewStatus = "NEW" | "DUPLICATE" | "POSSIBLE_DUPLICATE";

export interface PreviewItem extends ParsedMovement {
  type: TransactionType;
  status: PreviewStatus;
  /** Transação já registada que parece ser a mesma (mesmo tipo e valor, até um dia de diferença). */
  match?: { id: string; description: string; date: string; amount: string };
  categoryId?: string;
}

export type Origin = ImportSource | "CASH";

/** Conta proposta para uma origem sem conta: criada ao importar, se o utilizador aceitar. */
export interface NewAccountProposal {
  origin: Origin;
  name: string;
  type: AccountType;
  institution?: string;
  number?: string;
  color: string;
}

/** Saldo que a mensagem mais recente de uma origem indica (depois desse movimento). */
export interface ReportedBalance {
  source: ImportSource;
  balance: string;
  date: string;
  time?: string;
}

export interface ImportPreview {
  items: PreviewItem[];
  unrecognized: string[];
  accounts: Partial<Record<Origin, string>>;
  newAccounts: NewAccountProposal[];
  balances: ReportedBalance[];
}

/** Depois de importar: o saldo da conta na aplicação (no fim desse dia) não bate com o da mensagem. */
export interface BalanceDifference {
  accountId: string;
  date: string;
  reported: string;
  actual: string;
  /** reportado − aplicação: somar ao saldo inicial para acertar. */
  difference: string;
}

const TYPE_OF: Record<ImportKind, TransactionType> = {
  INCOME: "INCOME",
  EXPENSE: "EXPENSE",
  FEE: "EXPENSE",
  DEPOSIT: "TRANSFER",
  WITHDRAWAL: "TRANSFER",
};

/** Como reconhecer, pelo nome ou pela instituição, a conta de cada origem. */
const SOURCE_ACCOUNT: Record<ImportSource, RegExp> = {
  MPESA: /m-?pesa|vodacom/,
  EMOLA: /e-?mola|movitel/,
  BIM: /\bbim\b|millennium/,
};

/** Dados da conta a criar quando falta; o nome e a cor mudam-se depois em Contas. */
const PROPOSALS: Record<Origin, Omit<NewAccountProposal, "origin" | "number">> = {
  MPESA: { name: "M-Pesa", type: "MOBILE_WALLET", institution: "Vodacom", color: "#dc2626" },
  EMOLA: { name: "e-Mola", type: "MOBILE_WALLET", institution: "Movitel", color: "#f59e0b" },
  BIM: { name: "Millennium bim", type: "BANK", institution: "Millennium bim", color: "#db2777" },
  CASH: { name: "Dinheiro", type: "CASH", color: "#16a34a" },
};

/**
 * Conta de cada origem: pelo número da conta (BIM), senão pelo nome ou pela instituição; o dinheiro vivo é a
 * primeira conta do tipo CASH. As origens sem conta recebem uma proposta de conta nova.
 */
async function suggestAccounts(userId: string, items: PreviewItem[]): Promise<Pick<ImportPreview, "accounts" | "newAccounts">> {
  const accounts = await prisma.account.findMany({ where: { userId, archived: false }, orderBy: { createdAt: "asc" } });
  const out: ImportPreview["accounts"] = {};
  const numberOf = (source: ImportSource) => items.find((i) => i.source === source && i.accountNumber)?.accountNumber;
  for (const [source, re] of Object.entries(SOURCE_ACCOUNT) as [ImportSource, RegExp][]) {
    const number = numberOf(source);
    const account =
      (number && accounts.find((a) => a.number?.replace(/\D/g, "") === number)) ||
      accounts.find((a) => re.test(normalize(`${a.name} ${a.institution ?? ""}`)) && (!number || !a.number));
    if (account) out[source] = account.id;
  }
  const cash = accounts.find((a) => a.type === "CASH");
  if (cash) out.CASH = cash.id;

  const needed = new Set<Origin>(items.flatMap((i): Origin[] => (i.type === "TRANSFER" ? [i.source, "CASH"] : [i.source])));
  const newAccounts = (Object.keys(PROPOSALS) as Origin[])
    .filter((origin) => needed.has(origin) && !out[origin])
    .map((origin): NewAccountProposal => {
      const number = origin === "CASH" ? undefined : numberOf(origin);
      const base = PROPOSALS[origin];
      return { origin, ...base, name: number && origin === "BIM" ? `${base.name} ${number}` : base.name, number };
    });
  return { accounts: out, newAccounts };
}

/** O saldo indicado na mensagem mais recente de cada origem. */
function reportedBalances(items: PreviewItem[]): ReportedBalance[] {
  const latest = new Map<ImportSource, PreviewItem>();
  for (const item of items) {
    if (!item.balance) continue;
    const current = latest.get(item.source);
    const key = (i: PreviewItem) => `${i.date}T${i.time ?? "00:00"}`;
    if (!current || key(item) > key(current)) latest.set(item.source, item);
  }
  return [...latest.values()].map((i) => ({ source: i.source, balance: i.balance!, date: i.date, time: i.time }));
}

/**
 * Categoria sugerida: a da última transação com a mesma descrição e tipo; senão, uma categoria do tipo
 * cujo nome (sem acentos) aparece na descrição — "Salário" em "SALARIO SETEMBRO 2026".
 */
async function suggestCategories(userId: string, items: PreviewItem[]): Promise<void> {
  const typed = items.filter((i) => i.type !== "TRANSFER");
  if (!typed.length) return;
  const descriptions = [...new Set(typed.map((i) => i.description))];
  const [previous, categories] = await Promise.all([
    prisma.transaction.findMany({
      where: { userId, categoryId: { not: null }, OR: descriptions.map((d) => ({ description: { equals: d, mode: "insensitive" as const } })) },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      select: { description: true, type: true, categoryId: true },
    }),
    prisma.category.findMany({ where: { userId }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, kind: true } }),
  ]);
  for (const item of typed) {
    const learned = previous.find((t) => t.type === item.type && normalize(t.description) === normalize(item.description));
    if (learned?.categoryId) {
      item.categoryId = learned.categoryId;
      continue;
    }
    const text = normalize(item.description);
    item.categoryId = categories.find(
      (c) => c.kind === item.type && normalize(c.name).split(/[^a-z0-9]+/).some((word) => word.length >= 4 && new RegExp(`\\b${word}`).test(text)),
    )?.id;
  }
}

/** Marca as já importadas (mesma referência) e as que parecem já registadas à mão. */
async function markDuplicates(userId: string, items: PreviewItem[]): Promise<void> {
  const imported = new Set(
    (
      await prisma.transaction.findMany({ where: { userId, importRef: { in: items.map((i) => i.reference) } }, select: { importRef: true } })
    ).map((t) => t.importRef),
  );
  const fresh = items.filter((i) => !imported.has(i.reference));
  const near = fresh.length
    ? await prisma.transaction.findMany({
        where: {
          userId,
          OR: fresh.map((i) => ({ type: i.type, amount: i.amount, date: { gte: fromIsoDate(addDays(i.date, -1)), lte: fromIsoDate(addDays(i.date, 1)) } })),
        },
        select: { id: true, type: true, amount: true, date: true, description: true },
      })
    : [];
  for (const item of items) {
    if (imported.has(item.reference)) {
      item.status = "DUPLICATE";
      continue;
    }
    const match = near.find(
      (t) => t.type === item.type && toMoney(t.amount) === item.amount && Math.abs(fromIsoDate(item.date).getTime() - t.date.getTime()) <= 86_400_000,
    );
    if (match) {
      item.status = "POSSIBLE_DUPLICATE";
      item.match = { id: match.id, description: match.description, date: toIsoDate(match.date), amount: toMoney(match.amount) };
    }
  }
}

/** Erros de um item com o caminho no corpo ("items.2.categoryId"), para a tabela de pré-visualização. */
const prefixed = (index: number, errors: FieldError[] = []) => errors.map((e) => ({ field: `items.${index}.${e.field}`, message: e.message }));

export const importsService = {
  /** Pré-visualização: nada é gravado. Movimentos repetidos no mesmo texto aparecem uma vez. */
  async preview(userId: string, parsed: ParseResult): Promise<ImportPreview> {
    const seen = new Set<string>();
    const items: PreviewItem[] = parsed.items
      .filter((m) => !seen.has(m.reference) && seen.add(m.reference))
      .map((m) => ({ ...m, type: TYPE_OF[m.kind], status: "NEW" }));
    const [accounts] = await Promise.all([suggestAccounts(userId, items), markDuplicates(userId, items), suggestCategories(userId, items)]);
    items.sort((a, b) => b.date.localeCompare(a.date) || (b.time ?? "").localeCompare(a.time ?? ""));
    return { items, unrecognized: parsed.unrecognized, ...accounts, balances: reportedBalances(items) };
  },

  /**
   * Grava os movimentos escolhidos, todos ou nenhum. Cada um é validado como uma transação (contas, categoria,
   * ano aberto); os erros voltam por item. Os que já foram importados (mesma referência) são ignorados.
   */
  async commit(
    userId: string,
    rawItems: unknown[],
    balances: { accountId: string; balance: string; date: string }[] = [],
  ): Promise<{ created: number; skipped: number; differences: BalanceDifference[]; transactions: Record<string, string> }> {
    const errors: FieldError[] = [];
    const rows: { data: Prisma.TransactionUncheckedCreateInput; message?: string }[] = [];
    for (const [index, raw] of rawItems.entries()) {
      const shape = importItemSchema.safeParse(raw);
      if (!shape.success) {
        errors.push(...prefixed(index, zodFieldErrors(shape.error)));
        continue;
      }
      const item = shape.data;
      try {
        const input = await transactionsService.parse(userId, { ...item, status: "CLEARED" });
        await periodsService.assertWritable(input.date, "date");
        rows.push({
          message: item.message,
          data: {
            userId,
            type: input.type,
            description: input.description,
            amount: input.amount,
            date: fromIsoDate(input.date),
            accountId: input.accountId,
            destinationAccountId: input.type === "TRANSFER" ? input.destinationAccountId! : null,
            categoryId: input.type === "TRANSFER" ? null : input.categoryId!,
            status: "CLEARED",
            notes: input.notes ?? null,
            importRef: item.importRef,
          },
        });
      } catch (error) {
        if (!(error instanceof HttpException) || !error.errors) throw error;
        errors.push(...prefixed(index, error.errors));
      }
    }
    if (errors.length) throw new ValidationException(errors);

    // Uma a uma (para saber os ids e guardar o SMS como comprovativo); as já importadas ficam de fora
    const refs = rows.map((r) => r.data.importRef!);
    const existing = new Set((await prisma.transaction.findMany({ where: { userId, importRef: { in: refs } }, select: { importRef: true } })).map((t) => t.importRef));
    const fresh = rows.filter((r, i) => !existing.has(r.data.importRef!) && refs.indexOf(r.data.importRef!) === i);
    const transactions: Record<string, string> = {};
    await prisma.$transaction(async (tx) => {
      for (const row of fresh) {
        const created = await tx.transaction.create({ data: row.data, select: { id: true } });
        transactions[row.data.importRef!] = created.id;
        if (row.message)
          await tx.transactionAttachment.create({
            data: { transactionId: created.id, kind: "MESSAGE", name: "Mensagem de confirmação", size: row.message.length, text: row.message },
          });
      }
    });
    return { created: fresh.length, skipped: rows.length - fresh.length, differences: await this.compareBalances(userId, balances), transactions };
  },

  /** Compara o saldo indicado nas mensagens com o da aplicação no fim desse dia (só contas do utilizador). */
  async compareBalances(userId: string, balances: { accountId: string; balance: string; date: string }[]): Promise<BalanceDifference[]> {
    const out: BalanceDifference[] = [];
    for (const b of balances) {
      const actual = (await accountBalances(userId, b.date)).get(b.accountId);
      if (!actual) continue;
      const difference = new Decimal(b.balance).sub(actual);
      if (!difference.isZero())
        out.push({ accountId: b.accountId, date: b.date, reported: toMoney(b.balance), actual: toMoney(actual), difference: toMoney(difference) });
    }
    return out;
  },
};
