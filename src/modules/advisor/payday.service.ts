import { prisma } from "../../shared/db/prisma";
import { NotFoundException } from "../../shared/errors/http-exceptions";
import { addDays, daysBetween, fromIsoDate, todayIso, toIsoDate, type IsoDate } from "../../shared/lib/dates";
import { formatMoney } from "../../shared/lib/format";
import { toMoney } from "../../shared/lib/money";
import { appSettings } from "../../shared/settings/app-settings";
import { forecastService } from "../forecast/forecast.service";
import { growthService } from "../growth/growth.service";
import { occurrenceDate, occurrenceOrEnd } from "../recurring/recurring.schedule";

/**
 * Plano do salário: quando entra o salário (ou outra receita grande), propõe como o distribuir até ao
 * próximo — contas a pagar (prestações primeiro), poupança para as metas (ajustada ao que sobra) e o
 * dia-a-dia — e mostra o que fica livre. Só propõe: não cria nem debita nada.
 */

export type BillStatus = "PAID" | "PENDING" | "UPCOMING";

export interface PaydayBill {
  label: string;
  amount: string;
  date: IsoDate;
  /** PAID: já paga desde o salário; PENDING: prevista (pode marcar como paga); UPCOMING: recorrente ainda por gerar. */
  status: BillStatus;
  commitment: boolean;
  transactionId?: string;
  categoryId?: string;
  accountId: string;
}

export interface PaydaySaving {
  goalId: string;
  name: string;
  color: string;
  icon: string;
  /** O que ainda falta guardar neste salário (já descontado o que guardou desde que entrou). */
  amount: string;
  /** O que o plano mensal propunha; menos que isto = ajustado ao que o salário deixa. */
  planned: string;
  /** Já guardado nesta meta desde que o salário entrou. */
  saved: string;
  reduced: boolean;
}

export interface PaydayPlan {
  income: { id: string; description: string; amount: string; date: IsoDate; accountId: string };
  /** A receita é grande o suficiente para contar como salário (`advisor.paydayShare`). */
  isPayday: boolean;
  /** Até quando o salário tem de chegar (o próximo, ou um mês). */
  until: IsoDate;
  days: number;
  bills: PaydayBill[];
  savings: PaydaySaving[];
  dayToDay: string;
  margin: string;
  totals: { bills: string; paid: string; savings: string };
  /** O que fica livre depois de tudo (negativo = não chega). */
  free: string;
  notes: string[];
}

const n = (v: { toString(): string } | string | number) => Number(v);
const money = (v: number) => toMoney(v.toFixed(2));


export const paydayService = {
  /**
   * A receita mais recente que conta como salário, nos últimos `advisor.paydayDays` dias (para o Dashboard).
   * null se não houver.
   */
  async latest(userId: string): Promise<string | null> {
    const [share, days, profile] = await Promise.all([appSettings.get("advisor.paydayShare"), appSettings.get("advisor.paydayDays"), growthService.profile(userId)]);
    const threshold = (n(profile.avgIncome) * share) / 100;
    const since = addDays(todayIso(), -days);
    const income = await prisma.transaction.findFirst({
      where: { userId, type: "INCOME", status: "CLEARED", date: { gte: fromIsoDate(since), lte: fromIsoDate(todayIso()) }, amount: { gte: threshold } },
      orderBy: [{ amount: "desc" }, { date: "desc" }],
      select: { id: true },
    });
    return income?.id ?? null;
  },

  async plan(userId: string, transactionId: string): Promise<PaydayPlan> {
    const income = await prisma.transaction.findFirst({ where: { id: transactionId, userId, type: "INCOME" } });
    if (!income) throw new NotFoundException("A receita");
    const [share, tightRate, profile, forecast, user] = await Promise.all([
      appSettings.get("advisor.paydayShare"),
      appSettings.get("forecast.tightRate"),
      growthService.profile(userId),
      forecastService.forecast(userId),
      prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { currencyRef: { select: { symbol: true } } } }),
    ]);
    const fmt = (v: number) => formatMoney(v.toFixed(2), user.currencyRef.symbol);
    const amount = n(income.amount);
    const start = toIsoDate(income.date);
    const isPayday = n(profile.avgIncome) === 0 || amount >= (n(profile.avgIncome) * share) / 100;

    // Até ao próximo salário: a próxima ocorrência de uma receita recorrente grande, ou um mês
    const rules = await prisma.recurringTransaction.findMany({ where: { userId, active: true, nextDate: { not: null }, account: { archived: false } } });
    const schedule = (r: (typeof rules)[number]) => ({ frequency: r.frequency, interval: r.interval, startDate: toIsoDate(r.startDate), endDate: r.endDate ? toIsoDate(r.endDate) : null });
    const nextIncome = rules
      .filter((r) => r.type === "INCOME" && n(r.amount) >= amount * 0.5)
      .flatMap((r) => {
        for (let i = r.generated, d = occurrenceOrEnd(schedule(r), i); d; d = occurrenceOrEnd(schedule(r), ++i)) if (d > start) return [d];
        return [];
      })
      .sort()[0];
    // Um mês depois, no mesmo dia (ou no último dia, nos meses mais curtos)
    const monthLater = occurrenceDate({ frequency: "MONTHLY", interval: 1, startDate: start }, 1);
    const until = nextIncome && nextIncome <= addDays(monthLater, 7) ? nextIncome : monthLater;

    // Contas: já pagas desde o salário, previstas e recorrentes ainda por gerar
    const inRange = await prisma.transaction.findMany({
      where: { userId, type: "EXPENSE", date: { gte: income.date, lt: fromIsoDate(until) }, OR: [{ status: "PENDING" }, { recurringId: { not: null } }] },
      include: { recurring: { select: { commitment: true } } },
    });
    const bills: PaydayBill[] = inRange.map((t) => ({
      label: t.description,
      amount: toMoney(t.amount),
      date: toIsoDate(t.date),
      status: t.status === "PENDING" ? "PENDING" : "PAID",
      commitment: t.recurring?.commitment ?? false,
      transactionId: t.id,
      categoryId: t.categoryId ?? undefined,
      accountId: t.accountId,
    }));
    for (const r of rules) {
      if (r.type !== "EXPENSE") continue;
      for (let i = r.generated, d = occurrenceOrEnd(schedule(r), i); d && d < until; d = occurrenceOrEnd(schedule(r), ++i)) {
        if (d < start) continue;
        bills.push({ label: r.description, amount: toMoney(r.amount), date: d, status: "UPCOMING", commitment: r.commitment, categoryId: r.categoryId ?? undefined, accountId: r.accountId });
      }
    }
    bills.sort((a, b) => Number(b.commitment) - Number(a.commitment) || a.date.localeCompare(b.date));

    const days = Math.max(1, daysBetween(start, until));
    const dayToDay = (n(forecast.basis.variableExpense) * days) / 30;
    const billsTotal = bills.reduce((acc, b) => acc + n(b.amount), 0);
    const paid = bills.filter((b) => b.status === "PAID").reduce((acc, b) => acc + n(b.amount), 0);
    const margin = (amount * tightRate) / 100;

    // Poupança: o plano do mês (Previsão), sem passar o que o salário deixa depois das contas, do dia-a-dia e da margem
    const planned = forecast.months[0]?.savings.goals ?? [];
    // O que já guardou em cada meta desde que o salário entrou conta para o plano deste salário
    const contributed = new Map(
      (
        await prisma.goalContribution.groupBy({
          by: ["goalId"],
          where: { goal: { userId }, date: { gte: income.date }, amount: { gt: 0 } },
          _sum: { amount: true },
        })
      ).map((c) => [c.goalId, n(c._sum.amount ?? 0)]),
    );
    const plannedTotal = planned.reduce((acc, g) => acc + n(g.amount), 0);
    const room = Math.max(0, amount - billsTotal - dayToDay - margin);
    const scale = plannedTotal > room && plannedTotal > 0 ? room / plannedTotal : 1;
    const savings: PaydaySaving[] = planned
      .filter((g) => n(g.amount) > 0 || contributed.has(g.goalId))
      .map((g) => {
        const goal = forecast.goals.find((x) => x.goalId === g.goalId)!;
        const saved = contributed.get(g.goalId) ?? 0;
        const value = Math.max(0, Math.floor(n(g.amount) * scale * 100) / 100 - saved);
        return { goalId: g.goalId, name: goal.name, color: goal.color, icon: goal.icon, amount: money(value), planned: g.amount, saved: money(saved), reduced: scale < 1 || g.reduced };
      });
    const savingsTotal = savings.reduce((acc, s) => acc + n(s.amount), 0);
    const free = amount - billsTotal - dayToDay - savingsTotal;

    const notes: string[] = [];
    const commitments = bills.filter((b) => b.commitment && b.status !== "PAID");
    if (commitments.length) notes.push(`Pague primeiro ${commitments.length === 1 ? "a prestação" : "as prestações"}: ${commitments.map((b) => `${b.label} (${fmt(n(b.amount))})`).join(", ")}.`);
    if (free < 0) notes.push(`O salário não chega para tudo: faltam ${fmt(-free)}. Adie uma despesa que não seja urgente ou gaste menos no dia-a-dia.`);
    else if (scale < 1) notes.push(`Este salário está apertado: guarde ${fmt(savingsTotal)} para as metas em vez de ${fmt(plannedTotal)}; o resto fica para os próximos meses.`);
    else notes.push(`Depois das contas, da poupança e do dia-a-dia, ficam livres ${fmt(free)} até ao próximo salário (dia ${Number(until.slice(8, 10))}).`);

    return {
      income: { id: income.id, description: income.description, amount: toMoney(income.amount), date: start, accountId: income.accountId },
      isPayday,
      until,
      days,
      bills,
      savings,
      dayToDay: money(dayToDay),
      margin: money(margin),
      totals: { bills: money(billsTotal), paid: money(paid), savings: money(savingsTotal) },
      free: money(free),
      notes,
    };
  },
};
