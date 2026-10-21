import { prisma } from "../../shared/db/prisma";
import { currentYearMonth, fromIsoDate, lastDayOf, monthOf, shiftMonth, todayIso, toIsoDate, type YearMonth } from "../../shared/lib/dates";
import { formatMoney } from "../../shared/lib/format";
import { toMoney } from "../../shared/lib/money";
import { appSettings } from "../../shared/settings/app-settings";
import { accountBalances } from "../accounts/accounts.ledger";
import { savedIn } from "../goals/goals.service";
import { normalize } from "../imports/imports.parsers";
import { occurrenceOrEnd } from "../recurring/recurring.schedule";
import { type ForecastEvent, type GoalPlan, type MonthForecast, runForecast } from "./forecast.engine";

/** Contas do dia-a-dia: o dinheiro que se pode gastar (a poupança e os investimentos ficam de fora). */
const SPENDING_TYPES = ["BANK", "MOBILE_WALLET", "CASH"] as const;

export interface Scenario {
  label: string;
  type: "INCOME" | "EXPENSE";
  amount: number;
  from: YearMonth;
  /** Meses que dura; sem valor, até ao fim da previsão. */
  months?: number;
  commitment: boolean;
}

const money = (v: number) => toMoney(v.toFixed(2));

/**
 * Explicação de um mês, em frases curtas: o que pesa e o que fazer. `startedBefore(label, month)` diz se uma
 * recorrente com essa descrição já existia antes do mês (não é "nova", mesmo que o mês anterior já esteja pago).
 */
function explain(m: MonthForecast, symbol: string, previous: MonthForecast | undefined, startedBefore: (label: string, month: string) => boolean): string[] {
  const fmt = (v: number) => formatMoney(v.toFixed(2), symbol);
  const notes: string[] = [];
  if (m.status === "NEGATIVE") {
    notes.push(`Vai sair mais ${fmt(-m.balance)} do que entra.`);
    if (m.expenses.commitments > 0) notes.push(`As prestações deste mês (${fmt(m.expenses.commitments)}) ficam em risco: reveja as outras despesas primeiro.`);
  } else if (m.status === "TIGHT") {
    notes.push(`Mês apertado: sobram só ${fmt(m.balance)}, menos do que a margem de segurança (${fmt(m.margin)}).`);
  }
  const reduced = m.savings.goals.filter((g) => g.reduced);
  if (reduced.length) notes.push(`A poupança para as metas baixa para ${fmt(m.savings.total)} este mês; a diferença passa para os meses com mais folga.`);
  const newOnes = m.events.filter((e) => e.type === "EXPENSE" && !previous?.events.some((p) => p.label === e.label) && !startedBefore(e.label, m.month));
  if (previous && newOnes.length) notes.push(`Novo neste mês: ${newOnes.map((e) => `${e.label} (${fmt(e.amount)})`).join(", ")}.`);
  if (m.cash < 0) notes.push(`O dinheiro nas contas do dia-a-dia acabaria a ${fmt(m.cash)}: vai faltar dinheiro antes do fim do mês.`);
  return notes;
}

export const forecastService = {
  async forecast(userId: string, scenario?: Scenario) {
    const [horizon, tightRate, includeVariableIncome, lookback, openGoalShare] = await Promise.all([
      appSettings.get("forecast.horizonMonths"),
      appSettings.get("forecast.tightRate"),
      appSettings.get("forecast.includeVariableIncome"),
      appSettings.get("growth.lookbackMonths"),
      appSettings.get("growth.comfortableShare"),
    ]);
    const today = todayIso();
    const current = currentYearMonth();
    const months = Array.from({ length: horizon }, (_, i) => shiftMonth(current, i));
    const end = lastDayOf(months.at(-1)!);

    const [user, accounts, balances, rules, pending, history, goals] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { currencyRef: { select: { symbol: true } } } }),
      prisma.account.findMany({ where: { userId, archived: false, includeInTotal: true, type: { in: [...SPENDING_TYPES] } }, select: { id: true } }),
      accountBalances(userId),
      prisma.recurringTransaction.findMany({
        where: { userId, active: true, nextDate: { not: null }, type: { in: ["INCOME", "EXPENSE"] }, account: { archived: false } },
      }),
      prisma.transaction.findMany({
        where: { userId, status: "PENDING", type: { in: ["INCOME", "EXPENSE"] }, date: { gte: fromIsoDate(`${current}-01`), lte: fromIsoDate(end) } },
        include: { recurring: { select: { commitment: true } } },
      }),
      prisma.transaction.findMany({
        where: {
          userId,
          status: "CLEARED",
          recurringId: null,
          type: { in: ["INCOME", "EXPENSE"] },
          date: { gte: fromIsoDate(`${shiftMonth(current, -lookback)}-01`), lte: fromIsoDate(lastDayOf(current)) },
        },
        select: { type: true, amount: true, date: true, description: true },
      }),
      prisma.goal.findMany({ where: { userId }, include: { contributions: true }, orderBy: { createdAt: "asc" } }),
    ]);
    const symbol = user.currencyRef.symbol;
    const startedBefore = (label: string, month: string) => rules.some((r) => r.description === label && toIsoDate(r.startDate) < `${month}-01`);

    // Recorrentes ainda por gerar, até ao fim da previsão (as já geradas estão nas previstas)
    const events: ForecastEvent[] = [];
    for (const rule of rules) {
      const schedule = { frequency: rule.frequency, interval: rule.interval, startDate: toIsoDate(rule.startDate), endDate: rule.endDate ? toIsoDate(rule.endDate) : null };
      for (let n = rule.generated, date = occurrenceOrEnd(schedule, n); date && date <= end; date = occurrenceOrEnd(schedule, ++n)) {
        events.push({
          date,
          type: rule.type as "INCOME" | "EXPENSE",
          amount: Number(rule.amount),
          label: rule.description,
          source: "RECURRING",
          commitment: rule.commitment,
          categoryId: rule.categoryId ?? undefined,
        });
      }
    }
    for (const t of pending) {
      events.push({
        date: toIsoDate(t.date),
        type: t.type as "INCOME" | "EXPENSE",
        amount: Number(t.amount),
        label: t.description,
        source: t.recurringId ? "RECURRING" : "PLANNED",
        commitment: t.recurring?.commitment ?? false,
        categoryId: t.categoryId ?? undefined,
      });
    }
    if (scenario) {
      const count = scenario.months ?? horizon;
      for (let i = 0; i < count; i++) {
        const month = shiftMonth(scenario.from, i);
        if (month > months.at(-1)!) break;
        if (month >= current) events.push({ date: `${month}-01`, type: scenario.type, amount: scenario.amount, label: scenario.label, source: "SCENARIO", commitment: scenario.commitment });
      }
    }

    // Dia-a-dia: média dos meses completos com movimentos, sem o que já é recorrente (mesma descrição e tipo)
    const recurringKeys = new Set(rules.map((r) => `${r.type}:${normalize(r.description)}`));
    const variable = history.filter((t) => !recurringKeys.has(`${t.type}:${normalize(t.description)}`));
    const past = variable.filter((t) => monthOf(toIsoDate(t.date)) < current);
    const pastMonths = new Set(past.map((t) => monthOf(toIsoDate(t.date)))).size;
    const total = (list: typeof variable, type: "INCOME" | "EXPENSE") => list.filter((t) => t.type === type).reduce((acc, t) => acc + Number(t.amount), 0);
    const avg = (type: "INCOME" | "EXPENSE") => (pastMonths ? total(past, type) / pastMonths : 0);
    const thisMonth = history.filter((t) => monthOf(toIsoDate(t.date)) === current);
    const thisVariable = variable.filter((t) => monthOf(toIsoDate(t.date)) === current);

    const startCash = accounts.reduce((acc, a) => acc + Number(balances.get(a.id) ?? 0), 0);
    // O que as recorrentes já liquidaram este mês também é "actual"
    const clearedRecurring = await prisma.transaction.findMany({
      where: { userId, status: "CLEARED", recurringId: { not: null }, type: { in: ["INCOME", "EXPENSE"] }, date: { gte: fromIsoDate(`${current}-01`), lte: fromIsoDate(today) } },
      select: { type: true, amount: true },
    });
    const actualOf = (type: "INCOME" | "EXPENSE") =>
      total(thisMonth, type) + clearedRecurring.filter((t) => t.type === type).reduce((acc, t) => acc + Number(t.amount), 0);

    const result = runForecast({
      months,
      startCash,
      tightRate,
      openGoalShare,
      variableIncome: includeVariableIncome ? avg("INCOME") : 0,
      variableExpense: avg("EXPENSE"),
      actual: {
        income: actualOf("INCOME"),
        expense: actualOf("EXPENSE"),
        variableIncome: includeVariableIncome ? total(thisVariable, "INCOME") : 0,
        variableExpense: total(thisVariable, "EXPENSE"),
      },
      events,
      goals: goals
        .map((g) => ({
          id: g.id,
          name: g.name,
          color: g.color,
          icon: g.icon,
          remaining: Number(g.target) - Number(savedIn(g)),
          deadline: g.deadline ? monthOf(toIsoDate(g.deadline)) : undefined,
        }))
        .filter((g) => g.remaining > 0.005),
    });

    return {
      generatedAt: new Date().toISOString(),
      startCash: money(startCash),
      basis: {
        months: pastMonths,
        variableIncome: money(includeVariableIncome ? avg("INCOME") : 0),
        variableExpense: money(avg("EXPENSE")),
        includeVariableIncome,
        tightRate,
      },
      scenario: scenario ? { ...scenario, amount: money(scenario.amount) } : null,
      months: result.months.map((m, i) => toMonthResponse(m, explain(m, symbol, result.months[i - 1], startedBefore))),
      goals: result.goals.map(toGoalResponse),
    };
  },
};

function toMonthResponse(m: MonthForecast, notes: string[]) {
  return {
    month: m.month,
    current: m.current,
    status: m.status,
    income: { actual: money(m.income.actual), fixed: money(m.income.fixed), variable: money(m.income.variable), total: money(m.income.total) },
    expenses: {
      actual: money(m.expenses.actual),
      commitments: money(m.expenses.commitments),
      fixed: money(m.expenses.fixed),
      variable: money(m.expenses.variable),
      total: money(m.expenses.total),
    },
    balance: money(m.balance),
    margin: money(m.margin),
    savings: { total: money(m.savings.total), goals: m.savings.goals.map((g) => ({ ...g, amount: money(g.amount), ideal: money(g.ideal) })) },
    free: money(m.free),
    cash: money(m.cash),
    events: m.events.map((e) => ({ ...e, amount: money(e.amount) })),
    notes,
  };
}

const toGoalResponse = (g: GoalPlan) => ({
  ...g,
  remaining: money(g.remaining),
  monthlyIdeal: g.monthlyIdeal === null ? null : money(g.monthlyIdeal),
  planned: money(g.planned),
  shortfall: money(g.shortfall),
});

export type ForecastResponse = Awaited<ReturnType<typeof forecastService.forecast>>;
