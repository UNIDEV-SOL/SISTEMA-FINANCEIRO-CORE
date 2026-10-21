import { prisma } from "../../shared/db/prisma";
import { currentYearMonth, fromIsoDate, lastDayOf, monthOf, todayIso, toIsoDate } from "../../shared/lib/dates";
import { sum, toMoney, ZERO, type Decimal } from "../../shared/lib/money";
import { accountBalances } from "../accounts/accounts.ledger";
import { clearedTotal } from "../dashboard/dashboard.service";
import { investmentValueAt, loadInvestments } from "../investments/investments.service";
import type { AnnualReport, ReportMonth, Totals } from "./reports.types";

const monthsOf = (year: number) => Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);

export const reportsService = {
  async annual(userId: string, year = Number(todayIso().slice(0, 4))): Promise<AnnualReport> {
    const today = todayIso();
    const current = currentYearMonth();

    const [accounts, investments, first, transactions] = await Promise.all([
      prisma.account.findMany({ where: { userId, archived: false, includeInTotal: true }, select: { id: true } }),
      loadInvestments(userId),
      prisma.transaction.findFirst({ where: { userId }, orderBy: { date: "asc" }, select: { date: true } }),
      prisma.transaction.findMany({
        where: { userId, status: "CLEARED", type: { not: "TRANSFER" }, date: { gte: fromIsoDate(`${year - 1}-01-01`), lt: fromIsoDate(`${year + 1}-01-01`) } },
      }),
    ]);

    const firstDate = first ? toIsoDate(first.date) : today;
    const firstMonth = (firstDate < today ? firstDate : today).slice(0, 7);
    const included = new Set(accounts.map((a) => a.id));

    const yearTotals = (y: number): { income: Decimal; expense: Decimal } => ({
      income: sum(monthsOf(y).map((m) => clearedTotal(transactions, "INCOME", m))),
      expense: sum(monthsOf(y).map((m) => clearedTotal(transactions, "EXPENSE", m))),
    });
    const toTotals = ({ income, expense }: { income: Decimal; expense: Decimal }): Totals => ({
      income: toMoney(income),
      expense: toMoney(expense),
      net: toMoney(income.sub(expense)),
    });

    const months: ReportMonth[] = await Promise.all(
      monthsOf(year).map(async (month) => {
        const future = month > current;
        const empty = month < firstMonth;
        const income = future ? ZERO : clearedTotal(transactions, "INCOME", month);
        const expense = future ? ZERO : clearedTotal(transactions, "EXPENSE", month);
        let netWorth = ZERO;
        if (!future && !empty) {
          const end = month === current ? today : lastDayOf(month);
          const balances = await accountBalances(userId, end);
          netWorth = sum([...balances].filter(([id]) => included.has(id)).map(([, b]) => b)).add(sum(investments.map((i) => investmentValueAt(i, end))));
        }
        return { month, income: toMoney(income), expense: toMoney(expense), net: toMoney(income.sub(expense)), netWorth: toMoney(netWorth), future, empty };
      }),
    );

    const categories = await prisma.category.findMany({ where: { userId, kind: "EXPENSE" }, orderBy: { createdAt: "asc" }, select: { id: true } });
    const yearMonths = monthsOf(year);
    const expenseByCategory = categories
      .map((c) => {
        const values = yearMonths.map((m) =>
          sum(transactions.filter((t) => t.type === "EXPENSE" && t.categoryId === c.id && monthOf(toIsoDate(t.date)) === m).map((t) => t.amount)),
        );
        return { categoryId: c.id, values, total: sum(values) };
      })
      .filter((c) => c.total.greaterThan(0))
      .sort((a, b) => b.total.comparedTo(a.total))
      .map((c) => ({ categoryId: c.categoryId, months: c.values.map(toMoney), total: toMoney(c.total) }));

    const lastYear = Number(today.slice(0, 4));
    const firstYear = Math.min(Number(firstDate.slice(0, 4)), lastYear);

    return {
      year,
      months,
      expenseByCategory,
      totals: toTotals(yearTotals(year)),
      previousTotals: toTotals(yearTotals(year - 1)),
      availableYears: Array.from({ length: lastYear - firstYear + 1 }, (_, i) => lastYear - i),
    };
  },
};
