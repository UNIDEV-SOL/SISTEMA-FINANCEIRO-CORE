import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { BudgetGroup, Prisma } from "../../generated/prisma";
import { prisma } from "../../shared/db/prisma";
import type { PageRequest } from "../../shared/http/pagination";
import { currentYearMonth, daysBetween, todayIso } from "../../shared/lib/dates";
import { Decimal, ratio, toMoney } from "../../shared/lib/money";
import { accountsService } from "../accounts/accounts.service";
import { alertsService } from "../alerts/alerts.service";
import { budgetsService } from "../budgets/budgets.service";
import { dashboardService } from "../dashboard/dashboard.service";
import { goalsService } from "../goals/goals.service";
import { bestSection, tokenize } from "../help/help.search";
import { helpService } from "../help/help.service";
import { investmentsService } from "../investments/investments.service";
import { transactionsService } from "../transactions/transactions.service";

/**
 * Ferramentas só de leitura do assistente. Correm sempre com o utilizador efectivo
 * (o próprio, ou o dependente por quem o responsável está a agir) e reutilizam os serviços
 * dos módulos — nenhuma regra de negócio é duplicada aqui.
 * Valores monetários vão como strings ("1250.00") com a moeda à parte.
 */
export interface ToolContext {
  userId: string;
  currency: { code: string; symbol: string };
}

const month = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Mês no formato AAAA-MM")
  .describe("Mês no formato AAAA-MM (por omissão, o mês corrente).");

const INPUTS = {
  get_accounts: z.object({}).strict(),
  get_month_summary: z.object({ month: month.optional() }).strict(),
  list_transactions: z
    .object({
      month: month.optional(),
      type: z.enum(["INCOME", "EXPENSE", "TRANSFER"]).optional(),
      category: z.string().trim().min(1).max(80).optional(),
      search: z.string().trim().min(1).max(100).optional(),
      limit: z.number().int().min(1).max(50).optional(),
    })
    .strict(),
  get_budgets: z.object({ month: month.optional() }).strict(),
  get_goals: z.object({}).strict(),
  get_investments: z.object({}).strict(),
  get_alerts: z.object({}).strict(),
  search_help: z.object({ query: z.string().trim().min(1).max(200) }).strict(),
} as const;

export type ToolName = keyof typeof INPUTS;

/** Texto do evento SSE `tool` enquanto a ferramenta corre. */
export const TOOL_LABELS: Record<ToolName, string> = {
  get_accounts: "A consultar contas e saldos…",
  get_month_summary: "A consultar o resumo do mês…",
  list_transactions: "A consultar transações…",
  get_budgets: "A consultar orçamentos…",
  get_goals: "A consultar metas…",
  get_investments: "A consultar investimentos…",
  get_alerts: "A consultar alertas…",
  search_help: "A pesquisar no manual…",
};

const objectSchema = (properties: Record<string, unknown> = {}, required: string[] = []): Anthropic.Tool["input_schema"] => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});

const monthProp = { type: "string", pattern: "^\\d{4}-(0[1-9]|1[0-2])$", description: "Mês no formato AAAA-MM. Por omissão, o mês corrente." };

/** Ordem fixa (faz parte do prefixo em cache). */
export const ASSISTANT_TOOLS: Anthropic.Tool[] = [
  {
    name: "get_accounts",
    description: "Contas activas do utilizador com o saldo actual (transações liquidadas), tipo e se contam para o património total.",
    input_schema: objectSchema(),
  },
  {
    name: "get_month_summary",
    description:
      "Resumo de um mês, como no Dashboard: receitas e despesas liquidadas (e do mês anterior), despesas previstas por pagar, património, " +
      "despesas por categoria (com orçamento), distribuição 50/30/20 e próximas despesas previstas.",
    input_schema: objectSchema({ month: monthProp }),
  },
  {
    name: "list_transactions",
    description:
      "Transações de um mês (mais recentes primeiro), com filtros opcionais por tipo, categoria (nome) e texto na descrição/notas. " +
      "Devolve também os totais de todo o filtro. No máximo 50 linhas.",
    input_schema: objectSchema({
      month: monthProp,
      type: { type: "string", enum: ["INCOME", "EXPENSE", "TRANSFER"], description: "INCOME = receita, EXPENSE = despesa, TRANSFER = transferência." },
      category: { type: "string", description: "Nome (ou parte do nome) da categoria, ex.: Supermercado." },
      search: { type: "string", description: "Texto a procurar na descrição e nas notas." },
      limit: { type: "integer", minimum: 1, maximum: 50, description: "Número máximo de transações (20 por omissão)." },
    }),
  },
  {
    name: "get_budgets",
    description:
      "Orçamentos de um mês por categoria de despesa: limite, gasto liquidado, previsto, quanto resta, sugestão (média dos últimos 3 meses) " +
      "e quanto pode gastar por dia no resto do mês.",
    input_schema: objectSchema({ month: monthProp }),
  },
  {
    name: "get_goals",
    description: "Metas de poupança: objectivo, valor guardado, prazo, quanto guardar por mês e últimos reforços/levantamentos.",
    input_schema: objectSchema(),
  },
  {
    name: "get_investments",
    description: "Investimentos: capital aplicado, valor actual (última avaliação), rendimento, taxa anual e vencimento.",
    input_schema: objectSchema(),
  },
  {
    name: "get_alerts",
    description: "Alertas actuais (orçamentos a acabar, contas por pagar, saldo baixo, metas, gastos acima das receitas).",
    input_schema: objectSchema(),
  },
  {
    name: "search_help",
    description: "Pesquisa no manual de utilizador e nas perguntas frequentes da aplicação. Devolve títulos, ligações e o excerto mais relevante.",
    input_schema: objectSchema({ query: { type: "string", description: "Palavras a procurar, ex.: \"arquivar conta\"." } }, ["query"]),
  },
];

const ALL: PageRequest<never> = { page: 0, size: 200, skip: 0 };

const GROUP_LABELS: Record<BudgetGroup, string> = { NEEDS: "Necessidades (50%)", WANTS: "Desejos (30%)", SAVINGS: "Poupança e investimento (20%)" };

async function namesOf(userId: string) {
  const [categories, accounts] = await Promise.all([
    prisma.category.findMany({ where: { userId }, select: { id: true, name: true, group: true } }),
    prisma.account.findMany({ where: { userId }, select: { id: true, name: true } }),
  ]);
  return {
    category: new Map(categories.map((c) => [c.id, c.name])),
    account: new Map(accounts.map((a) => [a.id, a.name])),
    categories,
  };
}

const pct = (part: Prisma.Decimal.Value, total: Prisma.Decimal.Value) => {
  const r = ratio(part, total);
  return r === null ? null : Math.round(r * 10) / 10;
};

type Handlers = { [K in ToolName]: (input: z.infer<(typeof INPUTS)[K]>, ctx: ToolContext) => Promise<unknown> };

export const TOOL_HANDLERS: Handlers = {
  async get_accounts(_input, { userId, currency }) {
    const page = await accountsService.list(userId, ALL);
    const included = page.content.filter((a) => a.includeInTotal);
    return {
      currency: currency.code,
      accounts: page.content.map((a) => ({ name: a.name, type: a.type, institution: a.institution ?? null, balance: a.balance, includeInTotal: a.includeInTotal })),
      totalIncluded: toMoney(included.reduce((acc, a) => acc.add(a.balance), new Decimal(0))),
    };
  },

  async get_month_summary(input, { userId, currency }) {
    const s = await dashboardService.summary(userId, input.month ?? currentYearMonth());
    const names = await namesOf(userId);
    return {
      currency: currency.code,
      month: s.month,
      income: s.income,
      expense: s.expense,
      net: toMoney(new Decimal(s.income).sub(s.expense)),
      previousIncome: s.previousIncome,
      previousExpense: s.previousExpense,
      pendingExpense: s.pendingExpense,
      netWorth: s.netWorth,
      invested: s.invested,
      savingsAccounts: s.savings,
      expensesByCategory: s.byCategory.map((c) => ({ category: names.category.get(c.categoryId) ?? "?", amount: c.amount, budget: c.budget ?? null })),
      rule503020: s.byGroup.map((g) => ({ group: GROUP_LABELS[g.group], amount: g.amount, percentOfIncome: pct(g.amount, s.income) })),
      upcoming: s.upcoming.map((t) => ({ date: t.date, description: t.description, amount: t.amount, type: t.type })),
    };
  },

  async list_transactions(input, { userId, currency }) {
    const names = await namesOf(userId);
    let categoryId: string | undefined;
    if (input.category) {
      const wanted = input.category.toLowerCase();
      const match =
        names.categories.find((c) => c.name.toLowerCase() === wanted) ?? names.categories.find((c) => c.name.toLowerCase().includes(wanted));
      if (!match) return { error: `Não existe a categoria "${input.category}".`, categories: names.categories.map((c) => c.name) };
      categoryId = match.id;
    }
    const size = input.limit ?? 20;
    const list = await transactionsService.list(
      userId,
      { month: input.month ?? currentYearMonth(), type: input.type, categoryId },
      { page: 0, size, skip: 0, search: input.search },
    );
    return {
      currency: currency.code,
      month: input.month ?? currentYearMonth(),
      totalItems: list.totalItems,
      shown: list.content.length,
      totals: list.totals,
      transactions: list.content.map((t) => ({
        date: t.date,
        type: t.type,
        description: t.description,
        amount: t.amount,
        status: t.status === "PENDING" ? "previsto" : "liquidado",
        category: t.categoryId ? (names.category.get(t.categoryId) ?? null) : null,
        account: names.account.get(t.accountId) ?? null,
        toAccount: t.destinationAccountId ? (names.account.get(t.destinationAccountId) ?? null) : undefined,
        notes: t.notes,
      })),
    };
  },

  async get_budgets(input, { userId, currency }) {
    const o = await budgetsService.overview(userId, input.month ?? currentYearMonth());
    const names = await namesOf(userId);
    const lines = o.lines.map((l) => {
      const remaining = l.limit ? new Decimal(l.limit).sub(l.spent) : null;
      return {
        category: names.category.get(l.categoryId) ?? "?",
        limit: l.limit ?? null,
        spent: l.spent,
        pending: l.pending,
        remaining: remaining ? toMoney(remaining) : null,
        percentUsed: l.limit ? pct(l.spent, l.limit) : null,
        perDayLeft: remaining && o.daysLeft > 0 && remaining.greaterThan(0) ? toMoney(remaining.div(o.daysLeft).toDecimalPlaces(2, Decimal.ROUND_DOWN)) : null,
        suggested: l.suggested,
      };
    });
    const available = new Decimal(o.totalLimit).sub(o.totalSpent);
    return {
      currency: currency.code,
      month: o.month,
      daysLeft: o.daysLeft,
      totalLimit: o.totalLimit,
      totalSpent: o.totalSpent,
      available: toMoney(available),
      perDayAvailable: o.daysLeft > 0 && available.greaterThan(0) ? toMoney(available.div(o.daysLeft).toDecimalPlaces(2, Decimal.ROUND_DOWN)) : null,
      withBudget: lines.filter((l) => l.limit),
      withoutBudget: lines.filter((l) => !l.limit).map(({ category, spent, pending, suggested }) => ({ category, spent, pending, suggested })),
    };
  },

  async get_goals(_input, { userId, currency }) {
    const page = await goalsService.list(userId, ALL);
    const today = todayIso();
    return {
      currency: currency.code,
      goals: page.content.map((g) => ({
        name: g.name,
        target: g.target,
        saved: g.saved,
        remaining: toMoney(Decimal.max(0, new Decimal(g.target).sub(g.saved))),
        percent: pct(g.saved, g.target),
        deadline: g.deadline ?? null,
        daysLeft: g.deadline ? daysBetween(today, g.deadline) : null,
        monthlyNeeded: g.monthlyNeeded ?? null,
        completed: new Decimal(g.saved).greaterThanOrEqualTo(g.target),
        recentMovements: g.contributions.slice(0, 3).map((c) => ({ date: c.date, amount: c.amount, note: c.note ?? null })),
      })),
    };
  },

  async get_investments(_input, { userId, currency }) {
    const page = await investmentsService.list(userId, ALL);
    return {
      currency: currency.code,
      investments: page.content.map((i) => {
        const gain = new Decimal(i.currentValue).sub(i.invested);
        return {
          name: i.name,
          type: i.type,
          institution: i.institution ?? null,
          invested: i.invested,
          currentValue: i.currentValue,
          gain: toMoney(gain),
          gainPercent: pct(gain, i.invested),
          annualRatePercent: i.annualRate ?? null,
          startDate: i.startDate,
          maturityDate: i.maturityDate ?? null,
          lastValuationDate: i.valuations.at(-1)?.date ?? null,
        };
      }),
    };
  },

  async get_alerts(_input, { userId }) {
    const list = await alertsService.list(userId);
    return {
      unread: list.unread,
      alerts: list.items.map((a) => ({ severity: a.severity, title: a.title, message: a.message, date: a.date, read: a.read, page: a.href })),
    };
  },

  async search_help(input) {
    const { items } = await helpService.search(input.query, 5);
    const articles = await prisma.helpArticle.findMany({ where: { id: { in: items.filter((i) => i.kind === "article").slice(0, 2).map((i) => i.id) } } });
    const faqs = await prisma.faq.findMany({ where: { id: { in: items.filter((i) => i.kind === "faq").slice(0, 2).map((i) => i.id) } } });
    const tokens = tokenize(input.query);
    return {
      results: items.map((i) => {
        const article = articles.find((a) => a.id === i.id);
        const faq = faqs.find((f) => f.id === i.id);
        const section = article ? bestSection(article.content, tokens) : null;
        return {
          kind: i.kind,
          title: i.title,
          link: i.href,
          snippet: i.snippet,
          section: section ? { heading: section.heading, text: section.body.slice(0, 1500) } : undefined,
          answer: faq ? faq.answer.slice(0, 1500) : undefined,
        };
      }),
    };
  },
};

export const isToolName = (name: string): name is ToolName => name in INPUTS;

export interface ToolOutcome {
  content: string;
  isError: boolean;
}

/** Valida a entrada com zod e corre a ferramenta; erros voltam ao modelo como `is_error`. */
export async function executeTool(name: string, input: unknown, ctx: ToolContext): Promise<ToolOutcome> {
  if (!isToolName(name)) return { content: JSON.stringify({ error: `Ferramenta desconhecida: ${name}` }), isError: true };
  const parsed = INPUTS[name].safeParse(input ?? {});
  if (!parsed.success) {
    return { content: JSON.stringify({ error: "Parâmetros inválidos.", issues: parsed.error.issues.map((i) => `${i.path.join(".") || "(entrada)"}: ${i.message}`) }), isError: true };
  }
  try {
    const handler = TOOL_HANDLERS[name] as (input: unknown, ctx: ToolContext) => Promise<unknown>;
    const result = await handler(parsed.data, ctx);
    const isError = !!result && typeof result === "object" && "error" in result;
    return { content: JSON.stringify(result), isError };
  } catch (error) {
    return { content: JSON.stringify({ error: "Não foi possível obter os dados.", detail: error instanceof Error ? error.message : String(error) }), isError: true };
  }
}
