import { prisma } from "../../shared/db/prisma";
import {
  currentYearMonth,
  daysInYearMonth,
  fromIsoDate,
  lastDayOf,
  monthRange,
  shiftMonth,
  todayIso,
  type YearMonth,
} from "../../shared/lib/dates";
import { formatMoney, formatMonth, formatPercent } from "../../shared/lib/format";
import { Decimal, sum, ZERO } from "../../shared/lib/money";
import { appSettings } from "../../shared/settings/app-settings";
import { accountBalances } from "../accounts/accounts.ledger";
import { forecastService } from "../forecast/forecast.service";
import { growthService } from "../growth/growth.service";
import { investmentValueAt, loadInvestments } from "../investments/investments.service";
import { paydayService } from "./payday.service";

/**
 * O conselheiro: lê os números da pessoa e explica, em frases simples, se está a crescer, como vai o mês,
 * o que vem aí e o que fazer. Só regras sobre os dados (sem IA), por isso é sempre o mesmo para os mesmos números.
 */

export type Tone = "success" | "info" | "warning" | "danger";
export type Mood = "GROWING" | "STABLE" | "SHRINKING" | "NO_DATA";

export interface BriefingItem {
  code: "PAYDAY" | "GROWTH" | "PACE" | "FORECAST" | "GOALS" | "HABITS";
  tone: Tone;
  title: string;
  text: string;
  link?: string;
  linkLabel?: string;
}

export interface Briefing {
  generatedAt: string;
  mood: Mood;
  headline: string;
  items: BriefingItem[];
}

const monthName = (m: YearMonth) => formatMonth(m).replace(/ \d{4}$/, "");

async function netWorthAt(userId: string, date: string): Promise<Decimal> {
  const [accounts, balances, investments] = await Promise.all([
    prisma.account.findMany({ where: { userId, includeInTotal: true }, select: { id: true } }),
    accountBalances(userId, date),
    loadInvestments(userId),
  ]);
  return sum([...accounts.map((a) => balances.get(a.id) ?? ZERO), ...investments.map((i) => investmentValueAt(i, date))]);
}

export const advisorService = {
  async briefing(userId: string): Promise<Briefing> {
    const today = todayIso();
    const current = currentYearMonth();
    const [trendMonths, fastPace] = await Promise.all([appSettings.get("advisor.trendMonths"), appSettings.get("advisor.fastPaceRate")]);
    const since = shiftMonth(current, -trendMonths);
    const [user, profile, growth, forecast, nowWorth, beforeWorth, monthExpenses] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { currencyRef: { select: { symbol: true } } } }),
      growthService.profile(userId),
      growthService.overview(userId),
      forecastService.forecast(userId),
      netWorthAt(userId, today),
      netWorthAt(userId, lastDayOf(since)),
      prisma.transaction.findMany({
        where: { userId, status: "CLEARED", type: "EXPENSE", date: { ...monthRange(current), lte: fromIsoDate(today) } },
        select: { amount: true, category: { select: { name: true } } },
      }),
    ]);
    const fmt = (v: Parameters<typeof formatMoney>[0]) => formatMoney(v, user.currencyRef.symbol);
    const items: BriefingItem[] = [];

    if (profile.basis === "NONE") {
      return {
        generatedAt: new Date().toISOString(),
        mood: "NO_DATA",
        headline: "Ainda estou a conhecer as suas finanças.",
        items: [
          {
            code: "HABITS",
            tone: "info",
            title: "Comece por registar o mês",
            text: "Registe o salário e as despesas (ou importe os SMS do banco e da carteira). Com um mês de movimentos, digo-lhe se está a crescer, o que vem aí e quanto pode guardar.",
            link: "/transacoes",
            linkLabel: "Registar movimentos",
          },
        ],
      };
    }

    // 0. Acabou de entrar o salário: a proposta de como o distribuir
    const paydayId = await paydayService.latest(userId);
    if (paydayId) {
      const plan = await paydayService.plan(userId, paydayId);
      const due = plan.bills.filter((b) => b.status !== "PAID").reduce((acc, b) => acc + Number(b.amount), 0);
      items.push({
        code: "PAYDAY",
        tone: Number(plan.free) < 0 ? "warning" : "info",
        title: `Recebeu ${fmt(plan.income.amount)}: o plano até ao próximo salário`,
        text:
          `Contas a pagar ${fmt(due.toFixed(2))}, guardar ${fmt(plan.totals.savings)} para as metas e ${fmt(plan.dayToDay)} para o dia-a-dia. ` +
          (Number(plan.free) < 0 ? `Não chega para tudo: faltam ${fmt(Math.abs(Number(plan.free)).toFixed(2))}.` : `Ficam livres ${fmt(plan.free)}.`),
        link: `/painel?plano=${plan.income.id}`,
        linkLabel: "Ver o plano",
      });
    }

    // 1. Está a crescer? O património de hoje contra o de há uns meses
    const change = nowWorth.sub(beforeWorth);
    const pct = beforeWorth.isZero() ? null : change.div(beforeWorth.abs()).mul(100).toNumber();
    const growing = change.greaterThan(0);
    items.push({
      code: "GROWTH",
      tone: change.isZero() ? "info" : growing ? "success" : "warning",
      title: change.isZero() ? "Património estável" : growing ? "Está a crescer" : "O património está a descer",
      text: change.isZero()
        ? `O seu património está igual ao do fim de ${monthName(since)} (${fmt(nowWorth)}).`
        : `Desde o fim de ${monthName(since)}, o seu património ${growing ? "subiu" : "desceu"} ${fmt(change.abs())}${pct === null ? "" : ` (${growing ? "+" : "−"}${formatPercent(Math.abs(pct), 1)})`} e está em ${fmt(nowWorth)}.` +
          (growing
            ? profile.savingsRate !== null
              ? ` Guarda, em média, ${formatPercent(profile.savingsRate)} do que recebe.`
              : ""
            : " Os meses recentes saíram mais do que entraram: veja onde gasta mais em Orçamentos."),
      link: growing ? "/relatorios" : "/orcamentos",
      linkLabel: growing ? "Ver relatórios" : "Ver orçamentos",
    });

    // 2. Este mês: o ritmo de gastos contra o normal para esta altura do mês
    const spent = sum(monthExpenses.map((t) => t.amount));
    const day = Number(today.slice(8, 10));
    const expected = new Decimal(profile.avgExpense).mul(day).div(daysInYearMonth(current));
    if (!expected.isZero()) {
      const pace = spent.div(expected).mul(100).toNumber();
      const byCategory = new Map<string, Decimal>();
      for (const t of monthExpenses) {
        const name = t.category?.name ?? "Sem categoria";
        byCategory.set(name, (byCategory.get(name) ?? ZERO).add(t.amount));
      }
      const top = [...byCategory.entries()].sort(([, a], [, b]) => b.comparedTo(a))[0];
      items.push({
        code: "PACE",
        tone: pace > fastPace ? "warning" : "success",
        title: pace > fastPace ? "Este mês está a gastar depressa" : "Este mês vai dentro do ritmo",
        text:
          `Até hoje gastou ${fmt(spent)}; num mês normal, por esta altura, seriam cerca de ${fmt(expected.toFixed(2))}.` +
          (pace > fastPace && top ? ` O que mais pesa é ${top[0]} (${fmt(top[1])}).` : "") +
          (pace > fastPace ? " Abrandar nos próximos dias evita apertar o fim do mês." : ""),
        link: "/orcamentos",
        linkLabel: "Ver orçamentos",
      });
    }

    // 3. O que vem aí: o primeiro mês no vermelho (ou apertado) da Previsão
    const negative = forecast.months.find((m) => m.status === "NEGATIVE");
    const tight = forecast.months.find((m) => m.status === "TIGHT");
    const last = forecast.months.at(-1)!;
    const problem = negative ?? tight;
    items.push({
      code: "FORECAST",
      tone: negative ? "danger" : tight ? "warning" : "success",
      title: negative ? `${capitalize(monthName(negative.month))} fica no vermelho` : tight ? `${capitalize(monthName(tight.month))} vai ser apertado` : "Os próximos meses têm folga",
      text: problem
        ? `${problem.notes.slice(0, 2).join(" ")} ${negative ? "Reveja as despesas desse mês ou adie o que puder." : "A poupança das metas ajusta-se sozinha nesse mês."}`.trim()
        : `Com o que já sabe e o seu ritmo de gastos, no fim de ${monthName(last.month)} terá cerca de ${fmt(last.cash)} nas contas do dia-a-dia.`,
      link: "/previsao",
      linkLabel: "Ver previsão",
    });

    // 4. Metas: as que não chegam a tempo e o ajuste deste mês
    const late = forecast.goals.filter((g) => g.deadline && !g.onTrack);
    const reducedNow = forecast.months[0]?.savings.goals.filter((g) => g.reduced) ?? [];
    if (late.length) {
      const g = late[0];
      items.push({
        code: "GOALS",
        tone: "warning",
        title: late.length === 1 ? `A meta "${g.name}" não chega a tempo` : `${late.length} metas não chegam a tempo`,
        text: `Com o que lhe sobra, no prazo ainda faltariam ${fmt(g.shortfall)} para "${g.name}". Pode alargar o prazo, reduzir o valor ou cortar numa despesa.`,
        link: "/metas",
        linkLabel: "Ver metas",
      });
    } else if (reducedNow.length) {
      items.push({
        code: "GOALS",
        tone: "info",
        title: "Este mês guarda um pouco menos",
        text: `O mês está apertado, por isso guardar ${fmt(forecast.months[0].savings.total)} para as metas chega; a diferença passa para os meses com mais folga, sem falhar os prazos.`,
        link: "/metas",
        linkLabel: "Ver metas",
      });
    } else if (forecast.goals.length) {
      items.push({
        code: "GOALS",
        tone: "success",
        title: "As metas estão no bom caminho",
        text: `Este mês, guarde ${fmt(forecast.months[0]?.savings.total ?? "0")} no total e todas as metas com prazo chegam a tempo.`,
        link: "/metas",
        linkLabel: "Ver metas",
      });
    }

    // 5. Hábitos: a proposta mais urgente do Crescer
    const proposal = growth.proposals.find((p) => p.tone === "danger" || p.tone === "warning") ?? growth.proposals[0];
    if (proposal && proposal.code !== "NO_DATA")
      items.push({
        code: "HABITS",
        tone: proposal.tone === "danger" ? "danger" : proposal.tone === "warning" ? "warning" : proposal.tone === "success" ? "success" : "info",
        title: proposal.title,
        text: proposal.message,
        link: proposal.link ?? "/crescer",
        linkLabel: proposal.link ? "Ver" : "Ver no Crescer",
      });

    const mood: Mood = growing ? "GROWING" : change.isZero() ? "STABLE" : "SHRINKING";
    const headline =
      mood === "GROWING"
        ? tight
          ? "Está a crescer, mas há um mês apertado à frente."
          : "Está a crescer e os próximos meses têm folga."
        : mood === "SHRINKING"
          ? negative
            ? "Atenção: o património está a descer e há um mês no vermelho à frente."
            : "Atenção: o património está a descer. Vamos travar isso."
          : negative
            ? "Há um mês no vermelho à frente: vale a pena preparar já."
            : "As finanças estão estáveis.";

    return { generatedAt: new Date().toISOString(), mood, headline, items };
  },

  /** O resumo em Markdown, para o assistente responder a "como estão as minhas finanças?". */
  toMarkdown(b: Briefing): string {
    const icon: Record<Tone, string> = { success: "✅", info: "ℹ️", warning: "⚠️", danger: "🔴" };
    return [`**${b.headline}**`, ...b.items.map((i) => `${icon[i.tone]} **${i.title}.** ${i.text}${i.link ? ` [${i.linkLabel ?? "Ver"}](${i.link})` : ""}`)].join(
      "\n\n",
    );
  },
};

const capitalize = (v: string) => v.charAt(0).toUpperCase() + v.slice(1);
