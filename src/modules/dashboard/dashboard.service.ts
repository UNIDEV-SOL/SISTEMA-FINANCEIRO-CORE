import type { BudgetGroup, Transaction, TransactionType } from "../../generated/prisma";
import { prisma } from "../../shared/db/prisma";
import { currentYearMonth, daysInYearMonth, fromIsoDate, monthOf, shiftMonth, todayIso, toIsoDate, type YearMonth } from "../../shared/lib/dates";
import { Decimal, sum, toMoney, ZERO } from "../../shared/lib/money";
import { accountBalances } from "../accounts/accounts.ledger";
import { investmentValueAt, loadInvestments } from "../investments/investments.service";
import { toTransactionResponse } from "../transactions/transactions.service";
import type { DashboardSummary } from "./dashboard.types";

const SAVINGS_TYPES = new Set(["SAVINGS", "INVESTMENT"]);

/** Receitas ou despesas liquidadas de um mês. */
export const clearedTotal = (transactions: Transaction[], type: TransactionType, month: YearMonth): Decimal =>
  sum(transactions.filter((t) => t.type === type && t.status === "CLEARED" && monthOf(toIsoDate(t.date)) === month).map((t) => t.amount));

export const dashboardService = {
  async summary(userId: string, month = currentYearMonth()): Promise<DashboardSummary> {
    const today = todayIso();
    const previousMonth = shiftMonth(month, -1);
    const firstMonth = shiftMonth(month, -5);

    const [accounts, balances, categories, budgets, investments, transactions] = await Promise.all([
      prisma.account.findMany({ where: { userId, archived: false } }),
      accountBalances(userId),
      prisma.category.findMany({ where: { userId } }),
      prisma.budget.findMany({ where: { userId } }),
      loadInvestments(userId),
      prisma.transaction.findMany({
        where: { userId, date: { gte: fromIsoDate(`${firstMonth}-01`), lt: fromIsoDate(`${shiftMonth(month, 1)}-01`) } },
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      }),
    ]);

    const inMonth = transactions.filter((t) => monthOf(toIsoDate(t.date)) === month);
    const balanceOf = (id: string) => balances.get(id) ?? ZERO;
    const savingsIds = new Set(accounts.filter((a) => SAVINGS_TYPES.has(a.type)).map((a) => a.id));
    const groupOf = new Map(categories.map((c) => [c.id, c.group]));
    const budgetOf = new Map(budgets.map((b) => [b.categoryId, b.limit]));

    // Despesas do mês por categoria e por grupo 50/30/20 (incluindo as previstas).
    // Por ordem de registo, para categorias com o mesmo valor ficarem pela primeira despesa.
    const expenses = inMonth.filter((t) => t.type === "EXPENSE").sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const byCategory = new Map<string, Decimal>();
    const groups: Record<BudgetGroup, Decimal> = { NEEDS: ZERO, WANTS: ZERO, SAVINGS: ZERO };
    for (const t of expenses) {
      byCategory.set(t.categoryId!, (byCategory.get(t.categoryId!) ?? ZERO).add(t.amount));
      const group = groupOf.get(t.categoryId!) ?? "WANTS";
      groups[group] = groups[group].add(t.amount);
    }
    // O que vai para contas de poupança/investimento conta como poupado
    for (const t of inMonth) {
      if (t.type === "TRANSFER" && savingsIds.has(t.destinationAccountId!) && !savingsIds.has(t.accountId))
        groups.SAVINGS = groups.SAVINGS.add(t.amount);
    }

    const cumulative = (m: YearMonth) => {
      const days = daysInYearMonth(m);
      const perDay = Array.from({ length: days + 1 }, () => ZERO);
      for (const t of transactions) {
        const iso = toIsoDate(t.date);
        if (t.type === "EXPENSE" && t.status === "CLEARED" && monthOf(iso) === m) {
          const d = Number(iso.slice(8, 10));
          perDay[d] = perDay[d].add(t.amount);
        }
      }
      let acc = ZERO;
      return perDay.map((v) => (acc = acc.add(v)));
    };
    const days = daysInYearMonth(month);
    const prevDays = daysInYearMonth(previousMonth);
    const cur = cumulative(month);
    const prev = cumulative(previousMonth);
    const isCurrent = month === currentYearMonth();
    const todayDay = Number(today.slice(8, 10));

    const invested = sum(investments.map((i) => investmentValueAt(i, today)));

    return {
      month,
      netWorth: toMoney(invested.add(sum(accounts.filter((a) => a.includeInTotal).map((a) => balanceOf(a.id))))),
      invested: toMoney(invested),
      savings: toMoney(sum([...savingsIds].map(balanceOf))),
      income: toMoney(clearedTotal(transactions, "INCOME", month)),
      expense: toMoney(clearedTotal(transactions, "EXPENSE", month)),
      previousIncome: toMoney(clearedTotal(transactions, "INCOME", previousMonth)),
      previousExpense: toMoney(clearedTotal(transactions, "EXPENSE", previousMonth)),
      pendingExpense: toMoney(sum(expenses.filter((t) => t.status === "PENDING").map((t) => t.amount))),
      byCategory: [...byCategory.entries()]
        .sort(([, a], [, b]) => b.comparedTo(a))
        .map(([categoryId, amount]) => {
          const budget = budgetOf.get(categoryId);
          return { categoryId, amount: toMoney(amount), budget: budget && toMoney(budget) };
        }),
      byGroup: (Object.keys(groups) as BudgetGroup[]).map((group) => ({ group, amount: toMoney(groups[group]) })),
      cashflow: Array.from({ length: 6 }, (_, i) => {
        const m = shiftMonth(month, i - 5);
        return { month: m, income: toMoney(clearedTotal(transactions, "INCOME", m)), expense: toMoney(clearedTotal(transactions, "EXPENSE", m)) };
      }),
      daily: Array.from({ length: days }, (_, i) => ({
        day: i + 1,
        current: isCurrent && i + 1 > todayDay ? null : toMoney(cur[i + 1]),
        previous: toMoney(prev[Math.min(i + 1, prevDays)]),
      })),
      recent: inMonth.filter((t) => t.status === "CLEARED").slice(0, 6).map(toTransactionResponse),
      upcoming: inMonth
        .filter((t) => t.status === "PENDING")
        .sort((a, b) => a.date.getTime() - b.date.getTime())
        .slice(0, 5)
        .map(toTransactionResponse),
    };
  },
};
