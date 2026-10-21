import type { AlertSettings } from "../../generated/prisma";
import { prisma } from "../../shared/db/prisma";
import { addDays, currentYearMonth, daysBetween, fromIsoDate, monthRange, todayIso, toIsoDate } from "../../shared/lib/dates";
import { formatDayMonth, formatMoney, formatMonth, formatPercent } from "../../shared/lib/format";
import { ratio, sum, ZERO } from "../../shared/lib/money";
import { accountBalances } from "../accounts/accounts.ledger";
import { forecastService } from "../forecast/forecast.service";
import { appSettings } from "../../shared/settings/app-settings";
import type { Alert } from "./alerts.types";

const SEVERITY_ORDER = { critical: 0, warning: 1, info: 2 };
const SPENDING_ACCOUNTS = ["BANK", "MOBILE_WALLET", "CASH"] as const;

/**
 * Alertas recalculados a partir dos dados actuais; só o estado "lido" é guardado (AlertRead).
 * Os textos seguem os do front, com a moeda do utilizador.
 */
export async function computeAlerts(userId: string, settings: AlertSettings, currencySymbol: string, today = todayIso()): Promise<Omit<Alert, "read">[]> {
  const month = currentYearMonth(fromIsoDate(today));
  const money = (v: Parameters<typeof formatMoney>[0]) => formatMoney(v, currencySymbol);
  const alerts: Omit<Alert, "read">[] = [];

  const [budgets, monthTransactions, bills, accounts, balances, goals] = await Promise.all([
    settings.budgetAlerts ? prisma.budget.findMany({ where: { userId }, include: { category: { select: { name: true } } } }) : [],
    prisma.transaction.findMany({
      where: { userId, status: "CLEARED", type: { in: ["INCOME", "EXPENSE"] }, date: monthRange(month) },
      select: { type: true, amount: true, categoryId: true },
    }),
    settings.billAlerts
      ? prisma.transaction.findMany({
          where: { userId, status: "PENDING", type: { not: "INCOME" }, date: { lte: fromIsoDate(addDays(today, settings.billDaysAhead)) } },
          orderBy: { date: "asc" },
        })
      : [],
    settings.lowBalanceAlerts ? prisma.account.findMany({ where: { userId, archived: false, type: { in: [...SPENDING_ACCOUNTS] } } }) : [],
    settings.lowBalanceAlerts ? accountBalances(userId) : new Map(),
    settings.goalAlerts ? prisma.goal.findMany({ where: { userId }, include: { contributions: { select: { amount: true } } } }) : [],
  ]);

  for (const budget of budgets) {
    const name = budget.category.name;
    const spent = sum(monthTransactions.filter((t) => t.type === "EXPENSE" && t.categoryId === budget.categoryId).map((t) => t.amount));
    const used = ratio(spent, budget.limit) ?? 0;
    if (used > 100) {
      alerts.push({
        id: `budget:${budget.categoryId}:${month}:over`,
        kind: "BUDGET",
        severity: "critical",
        title: `Orçamento de ${name} ultrapassado`,
        message: `Gastou ${money(spent)} de ${money(budget.limit)} (${formatPercent(used)}) em ${formatMonth(month)}.`,
        date: today,
        href: "/orcamentos",
      });
    } else if (used >= settings.budgetThreshold) {
      alerts.push({
        id: `budget:${budget.categoryId}:${month}:near`,
        kind: "BUDGET",
        severity: "warning",
        title: `${name} a ${formatPercent(used)} do orçamento`,
        message: `Restam ${money(budget.limit.sub(spent))} para o resto do mês.`,
        date: today,
        href: "/orcamentos",
      });
    }
  }

  for (const t of bills) {
    const date = toIsoDate(t.date);
    if (date < today) {
      alerts.push({
        id: `bill:${t.id}:late`,
        kind: "BILL",
        severity: "critical",
        title: `${t.description} em atraso`,
        message: `${money(t.amount)} previsto para ${formatDayMonth(date)} ainda não foi marcado como pago.`,
        date,
        href: "/transacoes",
      });
    } else {
      const days = daysBetween(today, date);
      alerts.push({
        id: `bill:${t.id}:due`,
        kind: "BILL",
        severity: "warning",
        title: `${t.description} ${days === 0 ? "vence hoje" : days === 1 ? "vence amanhã" : `vence em ${days} dias`}`,
        message: `${money(t.amount)} a ${formatDayMonth(date)}.`,
        date: today,
        href: "/transacoes",
      });
    }
  }

  for (const account of accounts) {
    const balance = balances.get(account.id) ?? ZERO;
    if (balance.lessThan(settings.lowBalanceAmount)) {
      alerts.push({
        id: `low:${account.id}:${month}`,
        kind: "LOW_BALANCE",
        severity: balance.isNegative() ? "critical" : "warning",
        title: `Saldo baixo em ${account.name}`,
        message: `O saldo está em ${money(balance)}, abaixo do mínimo de ${money(settings.lowBalanceAmount)}.`,
        date: today,
        href: "/contas",
      });
    }
  }

  for (const goal of goals) {
    const saved = sum(goal.contributions.map((c) => c.amount));
    if (saved.greaterThanOrEqualTo(goal.target)) {
      alerts.push({
        id: `goal:${goal.id}:done`,
        kind: "GOAL",
        severity: "info",
        title: `Meta "${goal.name}" cumprida`,
        message: `Juntou ${money(saved)} de ${money(goal.target)}. Parabéns!`,
        date: today,
        href: "/metas",
      });
    } else if (goal.deadline && daysBetween(today, toIsoDate(goal.deadline)) <= 30) {
      alerts.push({
        id: `goal:${goal.id}:deadline`,
        kind: "GOAL",
        severity: "info",
        title: `Prazo da meta "${goal.name}" a aproximar-se`,
        message: `Faltam ${money(goal.target.sub(saved))} até ${formatDayMonth(toIsoDate(goal.deadline))}.`,
        date: today,
        href: "/metas",
      });
    }
  }

  // Próximos meses no vermelho (a Previsão), com tempo para agir: o mês actual e os `forecast.alertMonths` seguintes
  if (settings.forecastAlerts) {
    const [forecast, ahead] = await Promise.all([forecastService.forecast(userId), appSettings.get("forecast.alertMonths")]);
    for (const m of forecast.months.slice(0, ahead + 1)) {
      if (m.status !== "NEGATIVE") continue;
      const atRisk = Number(m.expenses.commitments) > 0;
      alerts.push({
        id: `forecast:${m.month}:negative`,
        kind: "FORECAST",
        severity: atRisk ? "critical" : "warning",
        title: `${formatMonth(m.month).replace(/^./, (c) => c.toUpperCase())} vai ficar no vermelho`,
        message: m.notes.join(" "),
        date: today,
        href: "/previsao",
      });
    }
  }

  const income = sum(monthTransactions.filter((t) => t.type === "INCOME").map((t) => t.amount));
  const expense = sum(monthTransactions.filter((t) => t.type === "EXPENSE").map((t) => t.amount));
  if (expense.greaterThan(income)) {
    alerts.push({
      id: `overspend:${month}`,
      kind: "OVERSPENDING",
      severity: "critical",
      title: "Está a gastar mais do que recebe",
      message: `Em ${formatMonth(month)} as despesas (${money(expense)}) já passam as receitas (${money(income)}).`,
      date: today,
      href: "/",
    });
  }

  return alerts.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || b.date.localeCompare(a.date));
}
