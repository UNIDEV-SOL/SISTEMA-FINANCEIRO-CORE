import type { GrowthPlanType, Prisma } from "../../generated/prisma";
import { prisma } from "../../shared/db/prisma";
import { NotFoundException } from "../../shared/errors/http-exceptions";
import { currentYearMonth, fromIsoDate, monthOf, shiftMonth, todayIso, toIsoDate, type YearMonth } from "../../shared/lib/dates";
import { formatMoney, formatPercent } from "../../shared/lib/format";
import { Decimal, ratio, sum, toMoney, ZERO } from "../../shared/lib/money";
import { appSettings } from "../../shared/settings/app-settings";
import { accountBalances } from "../accounts/accounts.ledger";
import { investmentValueAt, loadInvestments } from "../investments/investments.service";
import { toPlanTypeResponse } from "./growth-plans.service";
import { MAX_MONTHS, type SimulateQuery } from "./growth.schemas";
import type { FitStatus, GrowthOverview, GrowthProfile, GrowthProposal, GrowthSimulation, PlanProjection } from "./growth.types";

const SAVINGS_TYPES = new Set(["SAVINGS", "INVESTMENT"]);

/** Taxa mensal equivalente a um rendimento anual em %. */
const monthlyRate = (annualPercent: number) => (annualPercent > 0 ? (1 + annualPercent / 100) ** (1 / 12) - 1 : 0);

/** Valor acumulado ao fim de `months` meses, com depósito no fim de cada mês. */
function futureValue(initial: number, monthly: number, months: number, rate: number): number {
  if (rate === 0) return initial + monthly * months;
  const growth = (1 + rate) ** months;
  return initial * growth + (monthly * (growth - 1)) / rate;
}

/** Prestação para chegar a `target` em `months` meses (0 se o valor inicial já lá chega). */
function requiredMonthly(target: number, initial: number, months: number, rate: number): number {
  const missing = rate === 0 ? target - initial : target - initial * (1 + rate) ** months;
  if (missing <= 0) return 0;
  return rate === 0 ? missing / months : (missing * rate) / ((1 + rate) ** months - 1);
}

/** Meses até `target` com uma prestação fixa; null se não chegar em MAX_MONTHS. */
function monthsToReach(target: number, initial: number, monthly: number, rate: number): number | null {
  if (initial >= target) return 0;
  let balance = initial;
  for (let m = 1; m <= MAX_MONTHS; m++) {
    balance = balance * (1 + rate) + monthly;
    if (balance >= target - 0.005) return m;
  }
  return null;
}

const cents = (v: number) => toMoney(Math.max(0, Math.round(v * 100) / 100));
const round1 = (v: number | null) => (v === null ? null : Math.round(v * 10) / 10);

async function symbolOf(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { currencyRef: { select: { symbol: true } } } });
  return user.currencyRef.symbol;
}

async function settings() {
  const [lookback, emergencyMonths, savingsRate, wantsMaxRate, comfortableShare] = await Promise.all([
    appSettings.get("growth.lookbackMonths"),
    appSettings.get("growth.emergencyMonths"),
    appSettings.get("growth.targetSavingsRate"),
    appSettings.get("growth.wantsMaxRate"),
    appSettings.get("growth.comfortableShare"),
  ]);
  return { lookback, emergencyMonths, savingsRate, wantsMaxRate, comfortableShare };
}

/**
 * Médias mensais dos últimos meses completos com movimentos (os meses sem nada não puxam a média para baixo)
 * e as reservas actuais. Sem meses completos, usa o mês actual.
 */
async function buildProfile(userId: string): Promise<GrowthProfile> {
  const s = await settings();
  const current = currentYearMonth();
  const first = shiftMonth(current, -s.lookback);
  const today = todayIso();

  const [accounts, balances, categories, investments, transactions] = await Promise.all([
    prisma.account.findMany({ where: { userId, archived: false }, select: { id: true, type: true } }),
    accountBalances(userId),
    prisma.category.findMany({ where: { userId }, select: { id: true, name: true, group: true } }),
    loadInvestments(userId),
    prisma.transaction.findMany({
      where: { userId, status: "CLEARED", type: { in: ["INCOME", "EXPENSE"] }, date: { gte: fromIsoDate(`${first}-01`), lt: fromIsoDate(`${shiftMonth(current, 1)}-01`) } },
      select: { type: true, amount: true, date: true, categoryId: true },
    }),
  ]);

  const byMonth = new Map<YearMonth, typeof transactions>();
  for (const t of transactions) {
    const m = monthOf(toIsoDate(t.date));
    byMonth.set(m, [...(byMonth.get(m) ?? []), t]);
  }
  const complete = [...byMonth.keys()].filter((m) => m < current);
  const basis: GrowthProfile["basis"] = complete.length ? "LOOKBACK" : byMonth.has(current) ? "CURRENT_MONTH" : "NONE";
  const months = basis === "LOOKBACK" ? complete : basis === "CURRENT_MONTH" ? [current] : [];
  const used = months.flatMap((m) => byMonth.get(m) ?? []);
  const n = Math.max(months.length, 1);

  const avg = (v: Decimal) => v.div(n);
  const income = avg(sum(used.filter((t) => t.type === "INCOME").map((t) => t.amount)));
  const expense = avg(sum(used.filter((t) => t.type === "EXPENSE").map((t) => t.amount)));
  const saving = income.sub(expense);

  const groupOf = new Map(categories.map((c) => [c.id, c]));
  const wantsByCategory = new Map<string, Decimal>();
  for (const t of used) {
    if (t.type !== "EXPENSE" || !t.categoryId || groupOf.get(t.categoryId)?.group !== "WANTS") continue;
    wantsByCategory.set(t.categoryId, (wantsByCategory.get(t.categoryId) ?? ZERO).add(t.amount));
  }
  const wants = avg(sum([...wantsByCategory.values()]));
  const topWants = [...wantsByCategory.entries()]
    .sort(([, a], [, b]) => b.comparedTo(a))
    .slice(0, 3)
    .map(([categoryId, total]) => ({ categoryId, name: groupOf.get(categoryId)!.name, avg: toMoney(avg(total)) }));

  const savings = sum(accounts.filter((a) => SAVINGS_TYPES.has(a.type)).map((a) => balances.get(a.id) ?? ZERO));
  const invested = sum(investments.map((i) => investmentValueAt(i, today)));
  const emergencyTarget = expense.mul(s.emergencyMonths);

  return {
    months: months.length,
    basis,
    avgIncome: toMoney(income),
    avgExpense: toMoney(expense),
    avgSaving: toMoney(saving),
    savingsRate: round1(ratio(saving, income)),
    avgWants: toMoney(wants),
    wantsRate: round1(ratio(wants, income)),
    topWants,
    savings: toMoney(savings),
    invested: toMoney(invested),
    emergencyTarget: toMoney(emergencyTarget),
    emergencyCoverage: expense.isZero() ? null : round1(savings.div(expense).toNumber()),
    targets: { savingsRate: s.savingsRate, wantsMaxRate: s.wantsMaxRate, emergencyMonths: s.emergencyMonths, comfortableShare: s.comfortableShare },
  };
}

/** Propostas a partir do retrato, da mais urgente para a mais ambiciosa. */
function buildProposals(p: GrowthProfile, plans: GrowthPlanType[], symbol: string): GrowthProposal[] {
  const money = (v: Prisma.Decimal.Value) => formatMoney(v, symbol);
  const plan = (code: string) => plans.find((t) => t.code === code);
  const income = new Decimal(p.avgIncome);
  const expense = new Decimal(p.avgExpense);
  const saving = new Decimal(p.avgSaving);
  const savings = new Decimal(p.savings);
  const period = p.basis === "CURRENT_MONTH" ? "este mês" : p.months === 1 ? "no último mês" : `nos últimos ${p.months} meses`;
  const wantsNames = p.topWants.map((w) => w.name).join(", ");

  if (p.basis === "NONE") {
    return [
      {
        code: "NO_DATA",
        tone: "info",
        title: "Registe um mês de movimentos",
        message: "Com as suas receitas e despesas registadas, calculamos quanto pode poupar e o que consegue alcançar.",
        link: "/transacoes",
      },
    ];
  }

  const out: GrowthProposal[] = [];
  if (income.isZero()) {
    out.push({
      code: "NO_INCOME",
      tone: "warning",
      title: "Ainda não há receitas registadas",
      message: `Registou despesas ${period}, mas nenhuma receita. Registe o salário e outros rendimentos para as propostas fazerem sentido.`,
      link: "/transacoes",
    });
  } else if (saving.isNegative()) {
    out.push({
      code: "OVERSPENDING",
      tone: "danger",
      title: "Está a gastar mais do que recebe",
      message: `Em média, ${period}, saiu mais ${money(saving.neg())} por mês do que entrou.${wantsNames ? ` Comece por rever: ${wantsNames}.` : ""}`,
      amount: toMoney(saving.neg()),
      link: "/orcamentos",
    });
  }

  if (!income.isZero() && p.wantsRate !== null && p.wantsRate > p.targets.wantsMaxRate) {
    const excess = new Decimal(p.avgWants).sub(income.mul(p.targets.wantsMaxRate).div(100));
    out.push({
      code: "WANTS_HIGH",
      tone: "warning",
      title: "Os desejos estão a pesar no orçamento",
      message: `${formatPercent(p.wantsRate)} da receita vai para desejos (o recomendado é até ${formatPercent(p.targets.wantsMaxRate)}). Cortar ${money(excess)} por mês${wantsNames ? ` em ${wantsNames}` : ""} liberta esse valor para os seus planos.`,
      amount: toMoney(excess),
      link: "/orcamentos",
    });
  }

  if (!income.isZero() && !saving.isNegative() && (p.savingsRate ?? 0) < p.targets.savingsRate) {
    const gap = income.mul(p.targets.savingsRate).div(100).sub(saving);
    out.push({
      code: "SAVINGS_RATE",
      tone: "warning",
      title: `Guarde ${formatPercent(p.targets.savingsRate)} do que recebe`,
      message: `Hoje guarda ${formatPercent(p.savingsRate ?? 0)}. Mais ${money(gap)} por mês chega aos ${formatPercent(p.targets.savingsRate)} recomendados.`,
      amount: toMoney(gap),
    });
  }

  const emergency = plan("EMERGENCY_FUND");
  const target = new Decimal(p.emergencyTarget);
  if (!expense.isZero() && savings.lessThan(target)) {
    const missing = target.sub(savings);
    const months = emergency?.defaultMonths ?? 12;
    out.push({
      code: "EMERGENCY_FUND",
      tone: savings.isZero() ? "warning" : "info",
      title: "Construa o seu fundo de emergência",
      message: `O recomendado é ter ${p.targets.emergencyMonths} meses de despesa guardados (${money(target)}). Faltam ${money(missing)}: ${money(missing.div(months))} por mês durante ${months} meses.`,
      amount: toMoney(missing),
      planCode: emergency?.code,
    });
  } else if (!expense.isZero()) {
    out.push({
      code: "EMERGENCY_OK",
      tone: "success",
      title: "O fundo de emergência está feito",
      message: `A sua poupança cobre ${String(p.emergencyCoverage ?? 0).replace(".", ",")} meses de despesa. Pode pôr o excedente a crescer.`,
    });
  }

  const invest = plan("INVEST");
  if (invest && saving.greaterThan(0) && !savings.lessThan(target)) {
    const total = futureValue(0, saving.toNumber(), invest.defaultMonths, monthlyRate(invest.annualReturn.toNumber()));
    const contributed = saving.mul(invest.defaultMonths);
    out.push({
      code: "INVEST_SURPLUS",
      tone: "success",
      title: "Ponha a poupança a render",
      message: `Investir ${money(saving)} por mês durante ${invest.defaultMonths} meses, a ${formatPercent(invest.annualReturn.toNumber(), 1)} ao ano, dá cerca de ${money(total.toFixed(2))} (${money(new Decimal(total.toFixed(2)).sub(contributed))} de rendimento).`,
      amount: toMoney(total.toFixed(2)),
      planCode: invest.code,
      link: "/investimentos",
    });
  }

  return out;
}

/** O que cada plano permite juntar no prazo sugerido, com a prestação confortável. */
function projectionOf(type: GrowthPlanType, p: GrowthProfile): PlanProjection | null {
  const saving = Number(p.avgSaving);
  if (saving <= 0) return null;
  const monthly = (saving * p.targets.comfortableShare) / 100;
  return {
    monthly: cents(monthly),
    months: type.defaultMonths,
    amount: cents(futureValue(0, monthly, type.defaultMonths, monthlyRate(type.annualReturn.toNumber()))),
  };
}

const activePlans = () => prisma.growthPlanType.findMany({ where: { active: true }, orderBy: [{ order: "asc" }, { name: "asc" }] });

export const growthService = {
  profile: buildProfile,

  async overview(userId: string): Promise<GrowthOverview> {
    const [profile, plans, symbol] = await Promise.all([buildProfile(userId), activePlans(), symbolOf(userId)]);
    return {
      profile,
      proposals: buildProposals(profile, plans, symbol),
      plans: plans.map((t) => ({ ...toPlanTypeResponse(t), projection: projectionOf(t, profile) })),
    };
  },

  async simulate(userId: string, q: SimulateQuery): Promise<GrowthSimulation> {
    const plan = q.plan ? await prisma.growthPlanType.findUnique({ where: { code: q.plan } }) : null;
    if (q.plan && (!plan || !plan.active)) throw new NotFoundException("O plano");
    const profile = await buildProfile(userId);

    const target = Number(q.target);
    const initial = Number(q.initial ?? 0);
    const annualReturn = q.annualReturn ?? plan?.annualReturn.toNumber() ?? 0;
    const rate = monthlyRate(annualReturn);

    let months: number | null;
    let monthly: number;
    if (q.monthly) {
      monthly = Number(q.monthly);
      months = monthsToReach(target, initial, monthly, rate);
    } else {
      months = initial >= target ? 0 : (q.months ?? plan?.defaultMonths ?? 12);
      monthly = months ? requiredMonthly(target, initial, months, rate) : 0;
    }

    // A tabela cobre o prazo (ou, sem prazo possível, o máximo do simulador)
    const horizon = months ?? MAX_MONTHS;
    const start = currentYearMonth();
    const schedule: GrowthSimulation["schedule"] = [];
    let balance = initial;
    for (let m = 1; m <= horizon; m++) {
      balance = balance * (1 + rate) + monthly;
      schedule.push({ month: shiftMonth(start, m), balance: cents(balance), contributed: cents(initial + monthly * m) });
    }
    const finalAmount = horizon ? balance : initial;
    const contributed = monthly * horizon;

    const avgSaving = Number(profile.avgSaving);
    const comfortableMonthly = avgSaving > 0 ? (avgSaving * profile.targets.comfortableShare) / 100 : 0;
    const share = avgSaving > 0 ? Math.round((monthly / avgSaving) * 1000) / 10 : null;
    let status: FitStatus;
    if (months === 0) status = "REACHED";
    else if (avgSaving <= 0) status = "NO_SAVINGS";
    else if (months === null || (share ?? Infinity) > 100) status = "OUT_OF_REACH";
    else status = (share ?? 0) <= profile.targets.comfortableShare ? "COMFORTABLE" : "TIGHT";

    return {
      planCode: plan?.code ?? null,
      target: cents(target),
      initial: cents(initial),
      annualReturn,
      months,
      monthly: cents(monthly),
      reachedIn: months === null ? null : shiftMonth(start, months),
      totalContributed: cents(contributed),
      interest: cents(finalAmount - initial - contributed),
      finalAmount: cents(finalAmount),
      schedule,
      fit: {
        status,
        avgSaving: profile.avgSaving,
        share,
        comfortableMonths: comfortableMonthly > 0 ? monthsToReach(target, initial, comfortableMonthly, rate) : null,
        comfortableMonthly: cents(comfortableMonthly),
      },
    };
  },
};
