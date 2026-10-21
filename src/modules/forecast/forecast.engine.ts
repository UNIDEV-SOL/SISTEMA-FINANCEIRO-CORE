import type { IsoDate, YearMonth } from "../../shared/lib/dates";
import { monthsBetween } from "../../shared/lib/dates";

/**
 * Motor da Previsão: contas puras sobre números (projecções, não contabilidade), arredondadas ao cêntimo
 * só na saída. Recebe o que já se sabe (recorrentes, previstas, médias) e devolve mês a mês o que entra,
 * o que sai, quanto guardar para as metas e quanto sobra.
 */

export type EventSource = "RECURRING" | "PLANNED" | "SCENARIO";

export interface ForecastEvent {
  date: IsoDate;
  type: "INCOME" | "EXPENSE";
  amount: number;
  label: string;
  source: EventSource;
  /** Prestação ou compromisso obrigatório. */
  commitment: boolean;
  categoryId?: string;
}

export interface GoalInput {
  id: string;
  name: string;
  color: string;
  icon: string;
  remaining: number;
  deadline?: YearMonth;
}

export interface EngineInput {
  months: YearMonth[];
  /** Dinheiro disponível hoje nas contas do dia-a-dia (banco, carteiras, dinheiro vivo). */
  startCash: number;
  /** Parte da receita a deixar livre (%): abaixo disso o mês está apertado. */
  tightRate: number;
  /** Parte da folga que vai para uma meta sem prazo (%). */
  openGoalShare: number;
  /** Médias mensais do que não é recorrente (dia-a-dia). */
  variableIncome: number;
  variableExpense: number;
  /** O que já aconteceu no mês actual (liquidado). */
  actual: { income: number; expense: number; variableIncome: number; variableExpense: number };
  events: ForecastEvent[];
  goals: GoalInput[];
}

export type MonthStatus = "OK" | "TIGHT" | "NEGATIVE";

export interface GoalAllocation {
  goalId: string;
  amount: number;
  /** O que seria preciso guardar este mês para cumprir o prazo (ou a parte da folga, sem prazo). */
  ideal: number;
  /** Guardou-se menos do que o ideal porque o mês está apertado: a diferença passa para os meses seguintes. */
  reduced: boolean;
}

export interface MonthForecast {
  month: YearMonth;
  current: boolean;
  income: { actual: number; fixed: number; variable: number; total: number };
  expenses: { actual: number; commitments: number; fixed: number; variable: number; total: number };
  /** Receita menos despesa, antes de guardar para as metas. */
  balance: number;
  margin: number;
  savings: { total: number; goals: GoalAllocation[] };
  /** O que fica livre depois de guardar. */
  free: number;
  /** Dinheiro previsto nas contas do dia-a-dia no fim do mês. */
  cash: number;
  status: MonthStatus;
  events: ForecastEvent[];
}

export interface GoalPlan {
  goalId: string;
  name: string;
  color: string;
  icon: string;
  remaining: number;
  deadline?: YearMonth;
  /** Ao ritmo de hoje, o que seria preciso por mês até ao prazo. */
  monthlyIdeal: number | null;
  planned: number;
  /** Mês em que fica completa dentro do horizonte; null se não chega lá. */
  completesIn: YearMonth | null;
  onTrack: boolean;
  /** Quanto falta no fim do prazo (ou do horizonte) com este plano. */
  shortfall: number;
}

export interface EngineResult {
  months: MonthForecast[];
  goals: GoalPlan[];
}

const round = (v: number) => Math.round(v * 100) / 100;

/** Meses do prazo contando com o mês `month` (mínimo 1: prazo passado = tudo agora). */
const monthsLeft = (month: YearMonth, deadline: YearMonth) => Math.max(1, monthsBetween(`${month}-01`, `${deadline}-01`) + 1);

export function runForecast(input: EngineInput): EngineResult {
  const remaining = new Map(input.goals.map((g) => [g.id, g.remaining]));
  const planned = new Map(input.goals.map((g) => [g.id, 0]));
  const completesIn = new Map<string, YearMonth>();
  const reducedSomewhere = new Set<string>();
  const order = [...input.goals].sort((a, b) => (a.deadline ?? "9999-12").localeCompare(b.deadline ?? "9999-12"));
  let cash = input.startCash;

  const months = input.months.map((month, index): MonthForecast => {
    const current = index === 0;
    const events = input.events.filter((e) => e.date.startsWith(month)).sort((a, b) => a.date.localeCompare(b.date));
    const sum = (list: ForecastEvent[]) => list.reduce((acc, e) => acc + e.amount, 0);
    const fixedIncome = sum(events.filter((e) => e.type === "INCOME"));
    const expenseEvents = events.filter((e) => e.type === "EXPENSE");
    const commitments = sum(expenseEvents.filter((e) => e.commitment));
    const fixedExpense = sum(expenseEvents) - commitments;

    // No mês actual, o dia-a-dia que falta é a média menos o que já aconteceu
    const variableIncome = current ? Math.max(0, input.variableIncome - input.actual.variableIncome) : input.variableIncome;
    const variableExpense = current ? Math.max(0, input.variableExpense - input.actual.variableExpense) : input.variableExpense;
    const actualIncome = current ? input.actual.income : 0;
    const actualExpense = current ? input.actual.expense : 0;

    const incomeTotal = actualIncome + fixedIncome + variableIncome;
    const expenseTotal = actualExpense + commitments + fixedExpense + variableExpense;
    const balance = incomeTotal - expenseTotal;
    const margin = (incomeTotal * input.tightRate) / 100;

    // Poupança: nunca mais do que a folga acima da margem; o que não cabe passa para os meses seguintes
    let capacity = Math.max(0, balance - margin);
    const allocations: GoalAllocation[] = [];
    for (const goal of order) {
      const left = remaining.get(goal.id)!;
      if (left <= 0.005) continue;
      if (goal.deadline && month > goal.deadline) continue;
      const ideal = goal.deadline ? left / monthsLeft(month, goal.deadline) : Math.min(left, (capacity * input.openGoalShare) / 100);
      const amount = Math.min(ideal, capacity, left);
      capacity -= amount;
      remaining.set(goal.id, left - amount);
      planned.set(goal.id, planned.get(goal.id)! + amount);
      if (left - amount <= 0.005 && !completesIn.has(goal.id)) completesIn.set(goal.id, month);
      const reduced = !!goal.deadline && amount < ideal - 0.5;
      if (reduced) reducedSomewhere.add(goal.id);
      allocations.push({ goalId: goal.id, amount: round(amount), ideal: round(ideal), reduced });
    }
    const savings = allocations.reduce((acc, a) => acc + a.amount, 0);

    // O saldo de hoje já inclui o que aconteceu este mês: só se soma o que falta
    cash += fixedIncome + variableIncome - commitments - fixedExpense - variableExpense - savings;

    return {
      month,
      current,
      income: { actual: round(actualIncome), fixed: round(fixedIncome), variable: round(variableIncome), total: round(incomeTotal) },
      expenses: {
        actual: round(actualExpense),
        commitments: round(commitments),
        fixed: round(fixedExpense),
        variable: round(variableExpense),
        total: round(expenseTotal),
      },
      balance: round(balance),
      margin: round(margin),
      savings: { total: round(savings), goals: allocations },
      free: round(balance - savings),
      cash: round(cash),
      status: balance < 0 ? "NEGATIVE" : balance < margin ? "TIGHT" : "OK",
      events: events.map((e) => ({ ...e, amount: round(e.amount) })),
    };
  });

  const last = input.months.at(-1)!;
  const goals = input.goals.map((g): GoalPlan => {
    const done = completesIn.get(g.id) ?? null;
    return {
      goalId: g.id,
      name: g.name,
      color: g.color,
      icon: g.icon,
      remaining: round(g.remaining),
      deadline: g.deadline,
      monthlyIdeal: g.deadline ? round(g.remaining / monthsLeft(input.months[0], g.deadline)) : null,
      planned: round(planned.get(g.id)!),
      completesIn: done,
      // Prazo dentro do horizonte: tem de acabar a tempo; depois dele: basta nunca ter ficado aquém do ideal
      onTrack: !g.deadline || (done !== null ? done <= g.deadline : g.deadline > last && !reducedSomewhere.has(g.id)),
      shortfall: round(Math.max(0, remaining.get(g.id)!)),
    };
  });
  return { months, goals };
}
