import type { Account, Prisma } from "../../generated/prisma";
import { prisma } from "../../shared/db/prisma";
import { NotFoundException } from "../../shared/errors/http-exceptions";
import { orderByOf, toPage, type Page, type PageRequest } from "../../shared/http/pagination";
import { toMoney, ZERO, type Decimal } from "../../shared/lib/money";
import { accountBalances } from "./accounts.ledger";
import type { ACCOUNT_SORTS, AccountInput } from "./accounts.schemas";
import type { AccountResponse } from "./accounts.types";

export const toAccountResponse = (a: Account, balance: Decimal): AccountResponse => ({
  id: a.id,
  name: a.name,
  type: a.type,
  institution: a.institution ?? undefined,
  number: a.number ?? undefined,
  color: a.color,
  initialBalance: toMoney(a.initialBalance),
  balance: toMoney(balance),
  includeInTotal: a.includeInTotal,
  archived: a.archived,
});

async function withBalance(account: Account): Promise<AccountResponse> {
  const balances = await accountBalances(account.userId);
  return toAccountResponse(account, balances.get(account.id) ?? ZERO);
}

const fields = (input: AccountInput) => ({
  name: input.name,
  type: input.type,
  institution: input.institution ?? null,
  number: input.number ?? null,
  color: input.color,
  initialBalance: input.initialBalance,
  includeInTotal: input.includeInTotal,
});

export const accountsService = {
  /** Contas activas (ou só as arquivadas); `search` procura no nome e na instituição. Por omissão, pela ordem de criação. */
  async list(userId: string, page: PageRequest<(typeof ACCOUNT_SORTS)[number]>, archived = false): Promise<Page<AccountResponse>> {
    const where: Prisma.AccountWhereInput = { userId, archived };
    if (page.search)
      where.OR = [{ name: { contains: page.search, mode: "insensitive" } }, { institution: { contains: page.search, mode: "insensitive" } }];
    const [accounts, total, balances] = await Promise.all([
      prisma.account.findMany({ where, orderBy: orderByOf(page.sort, [{ createdAt: "asc" }]), skip: page.skip, take: page.size }),
      prisma.account.count({ where }),
      accountBalances(userId),
    ]);
    return toPage(accounts.map((a) => toAccountResponse(a, balances.get(a.id) ?? ZERO)), total, page);
  },

  /** Conta do utilizador; por omissão as arquivadas contam como inexistentes. */
  async findOwned(userId: string, id: string, { includeArchived = false } = {}): Promise<Account> {
    const account = await prisma.account.findFirst({ where: { id, userId, ...(includeArchived ? {} : { archived: false }) } });
    if (!account) throw new NotFoundException("A conta");
    return account;
  },

  async create(userId: string, input: AccountInput): Promise<AccountResponse> {
    const account = await prisma.account.create({ data: { userId, ...fields(input) } });
    return toAccountResponse(account, account.initialBalance);
  },

  async update(userId: string, id: string, input: AccountInput): Promise<AccountResponse> {
    await this.findOwned(userId, id);
    const account = await prisma.account.update({ where: { id }, data: fields(input) });
    return withBalance(account);
  },

  /** Arquivar em vez de apagar: as transações antigas continuam a apontar para a conta. */
  async archive(userId: string, id: string): Promise<void> {
    await this.findOwned(userId, id);
    await prisma.account.update({ where: { id }, data: { archived: true } });
  },

  /** Desarquiva: a conta volta às listas, com o saldo e as transações de sempre. */
  async restore(userId: string, id: string): Promise<AccountResponse> {
    await this.findOwned(userId, id, { includeArchived: true });
    return withBalance(await prisma.account.update({ where: { id }, data: { archived: false } }));
  },
};
