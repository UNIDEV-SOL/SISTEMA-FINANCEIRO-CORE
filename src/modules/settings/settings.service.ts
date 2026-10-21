import type { User } from "../../generated/prisma";
import { prisma } from "../../shared/db/prisma";
import type { FieldError } from "../../shared/errors/http-exceptions";
import { throwIfInvalid } from "../../shared/http/validation";
import { toMoney, ZERO } from "../../shared/lib/money";
import { accountBalances } from "../accounts/accounts.ledger";
import { toAccountResponse } from "../accounts/accounts.service";
import { toCategoryResponse } from "../categories/categories.service";
import { toGoalResponse } from "../goals/goals.service";
import { loadInvestments, toInvestmentResponse } from "../investments/investments.service";
import { toTransactionResponse } from "../transactions/transactions.service";
import { resetDemoData } from "./demo-data";
import type { SettingsInput } from "./settings.schemas";
import type { ExportResponse, SettingsResponse } from "./settings.types";

const toSettingsResponse = (u: User): SettingsResponse => ({ name: u.name, email: u.email, currency: u.currency });

export const settingsService = {
  async get(userId: string): Promise<SettingsResponse> {
    return toSettingsResponse(await prisma.user.findUniqueOrThrow({ where: { id: userId } }));
  },

  async update(userId: string, input: SettingsInput): Promise<SettingsResponse> {
    const [clash, currency, current] = await Promise.all([
      prisma.user.findFirst({ where: { email: input.email, id: { not: userId } }, select: { id: true } }),
      prisma.currency.findUnique({ where: { code: input.currency }, select: { active: true } }),
      prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { currency: true } }),
    ]);
    const errors: FieldError[] = [];
    if (clash) errors.push({ field: "email", message: "Já existe uma conta com este email." });
    // Quem já usa uma moeda entretanto desactivada pode mantê-la
    if (!currency || (!currency.active && current.currency !== input.currency)) errors.push({ field: "currency", message: "Moeda não suportada." });
    throwIfInvalid(errors);
    return toSettingsResponse(await prisma.user.update({ where: { id: userId }, data: input }));
  },

  /** Cópia de todos os dados do utilizador, incluindo contas arquivadas. */
  async export(userId: string): Promise<ExportResponse> {
    const [user, accounts, balances, categories, transactions, budgets, goals, investments] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: userId } }),
      prisma.account.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
      accountBalances(userId),
      prisma.category.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
      prisma.transaction.findMany({ where: { userId }, orderBy: [{ date: "asc" }, { createdAt: "asc" }] }),
      prisma.budget.findMany({ where: { userId } }),
      prisma.goal.findMany({ where: { userId }, include: { contributions: { orderBy: { date: "desc" } } }, orderBy: { createdAt: "asc" } }),
      loadInvestments(userId),
    ]);
    return {
      exportedAt: new Date().toISOString(),
      settings: toSettingsResponse(user),
      accounts: accounts.map((a) => toAccountResponse(a, balances.get(a.id) ?? ZERO)),
      categories: categories.map(toCategoryResponse),
      transactions: transactions.map(toTransactionResponse),
      budgets: budgets.map((b) => ({ categoryId: b.categoryId, limit: toMoney(b.limit) })),
      goals: goals.map((g) => toGoalResponse(g)),
      investments: investments.map(toInvestmentResponse),
    };
  },

  resetDemo: resetDemoData,
};
