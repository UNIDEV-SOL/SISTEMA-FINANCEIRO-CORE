import { prisma } from "../../shared/db/prisma";
import { NotFoundException } from "../../shared/errors/http-exceptions";
import { currentYearMonth, daysInYearMonth, fromIsoDate, monthOf, shiftMonth, todayIso, toIsoDate, type YearMonth } from "../../shared/lib/dates";
import { Decimal, ratio, sum, toMoney, ZERO } from "../../shared/lib/money";
import type { BudgetLine, BudgetOverview } from "./budgets.types";

function daysLeft(month: YearMonth): number {
  const current = currentYearMonth();
  if (month < current) return 0;
  if (month > current) return daysInYearMonth(month);
  return daysInYearMonth(month) - Number(todayIso().slice(8, 10)) + 1;
}

export const budgetsService = {
  async overview(userId: string, month = currentYearMonth()): Promise<BudgetOverview> {
    const from = shiftMonth(month, -3);
    const [categories, budgets, expenses] = await Promise.all([
      prisma.category.findMany({ where: { userId, kind: "EXPENSE" }, orderBy: { createdAt: "asc" } }),
      prisma.budget.findMany({ where: { userId } }),
      prisma.transaction.findMany({
        where: { userId, type: "EXPENSE", date: { gte: fromIsoDate(`${from}-01`), lt: fromIsoDate(`${shiftMonth(month, 1)}-01`) } },
        select: { categoryId: true, amount: true, date: true, status: true },
      }),
    ]);

    const limits = new Map(budgets.map((b) => [b.categoryId, b.limit]));
    const total = (categoryId: string, m: YearMonth, status: "CLEARED" | "PENDING") =>
      sum(expenses.filter((t) => t.categoryId === categoryId && t.status === status && monthOf(toIsoDate(t.date)) === m).map((t) => t.amount));

    const rows = categories.map((c) => {
      const limit = limits.get(c.id);
      const spent = total(c.id, month, "CLEARED");
      const lastThree = sum([1, 2, 3].map((n) => total(c.id, shiftMonth(month, -n), "CLEARED")));
      const suggested = lastThree.div(3).div(50).ceil().mul(50);
      const used = limit ? (ratio(spent, limit) ?? 0) : -1;
      return { used, limit, spent, line: { categoryId: c.id, limit: limit && toMoney(limit), spent: toMoney(spent), pending: toMoney(total(c.id, month, "PENDING")), suggested: toMoney(suggested) } satisfies BudgetLine };
    });

    rows.sort((a, b) => b.used - a.used || b.spent.comparedTo(a.spent));
    const budgeted = rows.filter((r) => r.limit);

    return {
      month,
      lines: rows.map((r) => r.line),
      totalLimit: toMoney(sum(budgeted.map((r) => r.limit as Decimal))),
      totalSpent: toMoney(budgeted.reduce((acc, r) => acc.add(r.spent), ZERO)),
      daysLeft: daysLeft(month),
    };
  },

  async setLimit(userId: string, categoryId: string, limit: string): Promise<void> {
    const category = await prisma.category.findFirst({ where: { id: categoryId, userId, kind: "EXPENSE" } });
    if (!category) throw new NotFoundException("A categoria");
    await prisma.budget.upsert({ where: { categoryId }, create: { categoryId, userId, limit }, update: { limit } });
  },

  async removeLimit(userId: string, categoryId: string): Promise<void> {
    await prisma.budget.deleteMany({ where: { categoryId, userId } });
  },
};
