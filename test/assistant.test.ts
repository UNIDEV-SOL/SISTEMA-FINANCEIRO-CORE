import type Anthropic from "@anthropic-ai/sdk";
import { assistantRuntime } from "../src/modules/assistant/assistant.controller";
import { createAssistantRunner, type AssistantClient, type AssistantStream } from "../src/modules/assistant/assistant.runner";
import { ASSISTANT_TOOLS, executeTool, TOOL_HANDLERS, type ToolContext } from "../src/modules/assistant/assistant.tools";
import { prisma } from "../src/shared/db/prisma";
import { currentYearMonth, todayIso } from "../src/shared/lib/dates";
import { addTransaction, api, setSetting, setup, signUp } from "./helpers";

type Auth = Record<string, string>;

interface SseEvent {
  event: string;
  data: Record<string, unknown>;
}

function parseSse(body: string): SseEvent[] {
  return body
    .split("\n\n")
    .map((block) => block.trim())
    .filter((block) => block && !block.startsWith(":"))
    .map((block) => {
      const event = /^event: (.+)$/m.exec(block)?.[1] ?? "message";
      const data = /^data: (.+)$/m.exec(block)?.[1] ?? "{}";
      return { event, data: JSON.parse(data) };
    });
}

async function chat(auth: Auth, body: Record<string, unknown>) {
  const res = await api().post("/api/v1/assistant/chat").set(auth).send(body).buffer(true).parse((r, cb) => {
    let text = "";
    r.setEncoding("utf8");
    r.on("data", (chunk: string) => (text += chunk));
    r.on("end", () => cb(null, text));
  });
  return { res, events: res.status === 200 ? parseSse(res.body as string) : [] };
}

const textOf = (events: SseEvent[]) =>
  events
    .filter((e) => e.event === "delta")
    .map((e) => e.data.text)
    .join("");

// ---------- cliente falso (sem chamadas à API) ----------

type FakeTurn = { text?: string; content: Anthropic.ContentBlock[]; stop_reason: Anthropic.StopReason };

function fakeMessage(turn: FakeTurn): Anthropic.Message {
  return {
    id: "msg_fake",
    type: "message",
    role: "assistant",
    model: "claude-opus-5-5",
    content: turn.content,
    stop_reason: turn.stop_reason,
    stop_sequence: null,
    usage: { input_tokens: 1, output_tokens: 1 },
  } as unknown as Anthropic.Message;
}

function fakeClient(turns: FakeTurn[]) {
  const calls: Anthropic.MessageStreamParams[] = [];
  const client: AssistantClient = {
    messages: {
      stream(params) {
        // Cópia: o ciclo continua a acrescentar mensagens ao mesmo array
        calls.push(JSON.parse(JSON.stringify(params)));
        const turn = turns.shift();
        if (!turn) throw new Error("sem mais turnos");
        let listener: ((delta: string) => void) | undefined;
        const stream: AssistantStream = {
          on(_event, l) {
            listener = l;
            return stream;
          },
          async finalMessage() {
            for (const word of (turn.text ?? "").split(/(?<= )/)) if (word) listener?.(word);
            return fakeMessage(turn);
          },
        };
        return stream;
      },
    },
  };
  return { client, calls };
}

const textBlock = (text: string) => ({ type: "text", text, citations: null }) as unknown as Anthropic.ContentBlock;
const toolUse = (id: string, name: string, input: unknown) => ({ type: "tool_use", id, name, input }) as unknown as Anthropic.ContentBlock;

describe("assistente — conversa (SSE)", () => {
  it("sem IA, perguntas sobre os números apontam para os ecrãs certos", async () => {
    const { auth } = await signUp();
    const { events } = await chat(auth, { message: "Quanto gastei este mês?" });
    const answer = textOf(events);
    expect(answer).toContain("Não consulto os seus números");
    expect(answer).toContain("[Dashboard](/)");
    const config = await api().get("/api/v1/config/public").expect(200);
    expect(config.body.assistant).toEqual({ mode: "offline" });
  });

  it("modo offline: meta → delta+ → done, com a conversa guardada", async () => {
    const { auth, user } = await signUp();
    const { res, events } = await chat(auth, { message: "Como defino um orçamento para o supermercado?" });
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/event-stream");
    expect(res.headers["cache-control"]).toContain("no-cache");
    expect(res.headers["x-accel-buffering"]).toBe("no");

    expect(events[0]).toEqual({ event: "meta", data: { conversationId: expect.any(String), mode: "offline" } });
    expect(events.at(-1)).toEqual({ event: "done", data: { messageId: expect.any(String) } });
    const deltas = events.slice(1, -1);
    expect(deltas.length).toBeGreaterThan(3);
    expect(deltas.every((e) => e.event === "delta")).toBe(true);

    const answer = textOf(events);
    expect(answer).toContain("[Orçamentos](/ajuda/orcamentos)");
    expect(answer).not.toContain("Não consulto os seus números");

    const conversationId = events[0].data.conversationId as string;
    const conversation = await prisma.assistantConversation.findUniqueOrThrow({ where: { id: conversationId }, include: { messages: { orderBy: { createdAt: "asc" } } } });
    expect(conversation).toMatchObject({ userId: user.id, title: "Como defino um orçamento para o supermercado?" });
    expect(conversation.messages.map((m) => [m.role, m.text])).toEqual([
      ["user", "Como defino um orçamento para o supermercado?"],
      ["assistant", answer],
    ]);
    expect(conversation.messages[1].id).toBe(events.at(-1)!.data.messageId);

    // Continua a mesma conversa
    const second = await chat(auth, { conversationId, message: "e como arquivo uma conta?" });
    expect(second.events[0].data.conversationId).toBe(conversationId);
    expect(textOf(second.events)).toContain("/ajuda/contas");

    const detail = (await api().get(`/api/v1/assistant/conversations/${conversationId}`).set(auth).expect(200)).body;
    expect(detail).toMatchObject({ id: conversationId, title: conversation.title });
    expect(detail.messages.map((m: { role: string }) => m.role)).toEqual(["user", "assistant", "user", "assistant"]);
    expect(detail.messages[0]).toEqual({ id: expect.any(String), role: "user", text: "Como defino um orçamento para o supermercado?", createdAt: expect.any(String) });

    const page = (await api().get("/api/v1/assistant/conversations").set(auth).expect(200)).body;
    expect(page).toMatchObject({ totalItems: 1, page: 0, hasNext: false });
    expect(page.content[0]).toEqual({ id: conversationId, title: conversation.title, createdAt: expect.any(String), updatedAt: expect.any(String) });
  });

  it("offline sem correspondência sugere temas do manual", async () => {
    const { auth } = await signUp();
    const { events } = await chat(auth, { message: "xyzzy quasar" });
    const answer = textOf(events);
    expect(answer).toContain("Não encontrei nada no manual");
    expect(answer).toContain("](/ajuda/");
  });

  it("validação, conversa de outra pessoa e apagar", async () => {
    const ana = await signUp();
    const rui = await signUp();
    const invalid = await api().post("/api/v1/assistant/chat").set(ana.auth).send({ message: "  " }).expect(422);
    expect(invalid.body.errors).toEqual([{ field: "message", message: "Escreva a sua pergunta." }]);

    const { events } = await chat(ana.auth, { message: "Olá, como crio uma meta?" });
    const id = events[0].data.conversationId as string;

    expect((await chat(rui.auth, { conversationId: id, message: "olá" })).res.status).toBe(404);
    await api().get(`/api/v1/assistant/conversations/${id}`).set(rui.auth).expect(404);
    await api().delete(`/api/v1/assistant/conversations/${id}`).set(rui.auth).expect(404);
    expect((await api().get("/api/v1/assistant/conversations").set(rui.auth)).body.totalItems).toBe(0);

    await api().delete(`/api/v1/assistant/conversations/${id}`).set(ana.auth).expect(204);
    await api().get(`/api/v1/assistant/conversations/${id}`).set(ana.auth).expect(404);
    expect(await prisma.assistantMessage.count({ where: { conversationId: id } })).toBe(0);
  });

  it("assistente desligado → 403 antes do stream", async () => {
    const { auth } = await signUp();
    await setSetting("assistant.enabled", false);
    const res = await api().post("/api/v1/assistant/chat").set(auth).send({ message: "olá" }).expect(403);
    expect(res.headers["content-type"]).toContain("application/problem+json");
    expect(res.body.detail).toBe("O assistente está desligado. Contacte o administrador.");
    expect(await prisma.assistantConversation.count()).toBe(0);
  });

  it("limite diário por utilizador → 429", async () => {
    const ana = await signUp();
    const rui = await signUp();
    await setSetting("assistant.dailyLimit", 2);
    await chat(ana.auth, { message: "orçamentos" });
    await chat(ana.auth, { message: "metas" });
    const res = await api().post("/api/v1/assistant/chat").set(ana.auth).send({ message: "contas" }).expect(429);
    expect(res.body).toMatchObject({ status: 429, detail: "Atingiu o limite de 2 mensagens ao assistente por dia. Volte a tentar amanhã." });
    // Outra pessoa tem o seu próprio limite
    expect((await chat(rui.auth, { message: "contas" })).res.status).toBe(200);
    // 0 = sem limite
    await setSetting("assistant.dailyLimit", 0);
    expect((await chat(ana.auth, { message: "contas" })).res.status).toBe(200);
  });

  it("agir como: as conversas são do dependente e de quem as iniciou", async () => {
    const guardian = await signUp();
    const link = (
      await api().post("/api/v1/family/dependents").set(guardian.auth).send({ name: "Filho", email: "filho@exemplo.com", password: "segredo123", access: "VIEW" }).expect(201)
    ).body;
    const childId = link.person.id as string;
    const asChild = { ...guardian.auth, "X-Acting-As": childId };

    // POST /chat conta como leitura: permitido com acesso VIEW
    const { events } = await chat(asChild, { message: "como vejo os relatórios?" });
    const id = events[0].data.conversationId as string;
    const conversation = await prisma.assistantConversation.findUniqueOrThrow({ where: { id } });
    expect(conversation).toMatchObject({ userId: childId, actorId: guardian.user.id });

    expect((await api().get("/api/v1/assistant/conversations").set(asChild)).body.totalItems).toBe(1);
    expect((await api().get("/api/v1/assistant/conversations").set(guardian.auth)).body.totalItems).toBe(0);
    await api().get(`/api/v1/assistant/conversations/${id}`).set(guardian.auth).expect(404);

    // O próprio dependente não vê as conversas do responsável
    const { login } = await import("./helpers");
    const child = await login("filho@exemplo.com");
    expect((await api().get("/api/v1/assistant/conversations").set(child.auth)).body.totalItems).toBe(0);

    // Com acesso de leitura não pode apagar
    await api().delete(`/api/v1/assistant/conversations/${id}`).set(asChild).expect(403);

    // O limite diário é do utilizador efectivo (o dependente)
    await setSetting("assistant.dailyLimit", 2);
    await chat(child.auth, { message: "metas" });
    await api().post("/api/v1/assistant/chat").set(asChild).send({ message: "contas" }).expect(429);
  });

  it("modo IA com cliente falso: tool → resposta, histórico guardado e reenviado", async () => {
    const { auth, user } = await setup("2500");
    const fake = fakeClient([
      { text: "Vou ver as suas contas. ", content: [textBlock("Vou ver as suas contas. "), toolUse("tu_1", "get_accounts", {})], stop_reason: "tool_use" },
      { text: "Tem **2.500,00 MT** no Banco.", content: [textBlock("Tem **2.500,00 MT** no Banco.")], stop_reason: "end_turn" },
      { text: "De nada!", content: [textBlock("De nada!")], stop_reason: "end_turn" },
    ]);
    const original = { ...assistantRuntime };
    assistantRuntime.hasApiKey = () => true;
    assistantRuntime.client = () => fake.client;
    try {
      const { events } = await chat(auth, { message: "Quanto tenho nas contas?" });
      const names = events.map((e) => e.event);
      expect(names[0]).toBe("meta");
      expect(names.at(-1)).toBe("done");
      expect(names.filter((n) => n === "tool")).toHaveLength(1);
      // Texto antes e depois da consulta
      expect(names.indexOf("tool")).toBeGreaterThan(1);
      expect(names.lastIndexOf("delta")).toBeGreaterThan(names.indexOf("tool"));
      expect(events[0].data).toMatchObject({ mode: "ai" });
      expect(events.find((e) => e.event === "tool")!.data).toEqual({ name: "get_accounts", label: "A consultar contas e saldos…" });
      expect(textOf(events)).toBe("Vou ver as suas contas. \n\nTem **2.500,00 MT** no Banco.");

      // Pedido: modelo e effort dos parâmetros, sem `thinking`, prompt estável em cache e contexto fora dela
      const first = fake.calls[0];
      expect(first).toMatchObject({ model: "claude-opus-5-5", output_config: { effort: "low" }, max_tokens: 4000 });
      expect(first).not.toHaveProperty("thinking");
      expect(first).not.toHaveProperty("tool_choice");
      expect(first.tools!.map((t) => (t as Anthropic.Tool).name)).toEqual(ASSISTANT_TOOLS.map((t) => t.name));
      const system = first.system as Anthropic.TextBlockParam[];
      expect(system[0].cache_control).toEqual({ type: "ephemeral" });
      expect(system[0].text).toContain('<artigo titulo="Orçamentos" ligacao="/ajuda/orcamentos"');
      expect(system[0].text).not.toContain(todayIso());
      expect(system[1].cache_control).toBeUndefined();
      expect(system[1].text).toContain(todayIso());
      expect(system[1].text).toContain("Ana Teste");

      // Segunda volta: assistant (tool_use) + um user com todos os tool_result
      const second = fake.calls[1];
      expect(second.messages.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
      const results = second.messages[2].content as Anthropic.ToolResultBlockParam[];
      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({ type: "tool_result", tool_use_id: "tu_1" });
      expect(JSON.parse(results[0].content as string)).toMatchObject({ currency: "MZN", accounts: [{ name: "Banco", balance: "2500.00" }] });

      // Guardado com os turnos completos; a pergunta seguinte reenvia o histórico
      const id = events[0].data.conversationId as string;
      const saved = await prisma.assistantMessage.findFirstOrThrow({ where: { conversationId: id, role: "assistant" } });
      expect((saved.content as { turns: unknown[] }).turns).toHaveLength(3);
      expect(saved.text).toBe(textOf(events));

      await chat(auth, { conversationId: id, message: "Obrigado" });
      expect(fake.calls[2].messages.map((m) => m.role)).toEqual(["user", "assistant", "user", "assistant", "user"]);
      expect(fake.calls[2].messages.at(-1)).toEqual({ role: "user", content: "Obrigado" });
      expect(await prisma.assistantMessage.count({ where: { conversation: { userId: user.id } } })).toBe(4);
    } finally {
      Object.assign(assistantRuntime, original);
    }
  });

  it("modo IA: erro da API vira evento error e a pergunta fica guardada", async () => {
    const { auth } = await signUp();
    const original = { ...assistantRuntime };
    assistantRuntime.hasApiKey = () => true;
    assistantRuntime.client = () => ({
      messages: {
        stream() {
          return {
            on() {
              return this;
            },
            finalMessage: () => Promise.reject(new Error("rede em baixo")),
          };
        },
      },
    });
    try {
      const { events } = await chat(auth, { message: "olá" });
      expect(events.map((e) => e.event)).toEqual(["meta", "error"]);
      expect(events[1].data).toEqual({ message: "Ocorreu um erro inesperado no assistente. Tente novamente." });
      expect(await prisma.assistantMessage.count({ where: { role: "user" } })).toBe(1);
    } finally {
      Object.assign(assistantRuntime, original);
    }
  });
});

describe("assistente — ciclo com ferramentas (runner)", () => {
  const ctx = async (): Promise<ToolContext & { auth: Auth; cat: (n: string) => string; bank: { id: string } }> => {
    const s = await setup("1000");
    return { ...s, userId: s.user.id, currency: { code: "MZN", symbol: "MT" } };
  };

  it("corre a ferramenta pedida, devolve erros de validação como is_error e termina em end_turn", async () => {
    const c = await ctx();
    const fake = fakeClient([
      {
        content: [toolUse("a", "get_budgets", { month: currentYearMonth() }), toolUse("b", "list_transactions", { limit: 500 }), toolUse("c", "apagar_tudo", {})],
        stop_reason: "tool_use",
      },
      { text: "Pronto.", content: [textBlock("Pronto.")], stop_reason: "end_turn" },
    ]);
    const tools: string[] = [];
    const result = await createAssistantRunner({ client: fake.client }).run({
      model: "claude-opus-5-5",
      effort: "low",
      system: [{ type: "text", text: "s" }],
      messages: [{ role: "user", content: "Como estão os orçamentos?" }],
      context: c,
      onText: () => undefined,
      onTool: (name) => tools.push(name),
    });
    expect(result).toMatchObject({ text: "Pronto.", complete: true, stopReason: "end_turn" });
    expect(tools).toEqual(["get_budgets", "list_transactions"]);
    const results = fake.calls[1].messages.at(-1)!.content as Anthropic.ToolResultBlockParam[];
    expect(results.map((r) => [r.tool_use_id, !!r.is_error])).toEqual([
      ["a", false],
      ["b", true],
      ["c", true],
    ]);
    expect(result.turns.map((t) => t.role)).toEqual(["assistant", "user", "assistant"]);
  });

  it("recusa: não corre ferramentas e responde em pt-PT", async () => {
    const c = await ctx();
    const fake = fakeClient([{ content: [toolUse("a", "get_accounts", {})], stop_reason: "refusal" }]);
    const tools: string[] = [];
    const result = await createAssistantRunner({ client: fake.client }).run({
      model: "m",
      effort: "low",
      system: [],
      messages: [{ role: "user", content: "x" }],
      context: c,
      onText: () => undefined,
      onTool: (name) => tools.push(name),
    });
    expect(tools).toEqual([]);
    expect(result.complete).toBe(false);
    expect(result.text).toContain("Não posso ajudar com esse pedido");
  });

  it("max_tokens com tool_use: não corre a ferramenta truncada", async () => {
    const c = await ctx();
    const fake = fakeClient([{ text: "A ver", content: [textBlock("A ver"), toolUse("a", "get_goals", {})], stop_reason: "max_tokens" }]);
    const tools: string[] = [];
    const result = await createAssistantRunner({ client: fake.client }).run({
      model: "m",
      effort: "low",
      system: [],
      messages: [{ role: "user", content: "x" }],
      context: c,
      onText: () => undefined,
      onTool: (name) => tools.push(name),
    });
    expect(tools).toEqual([]);
    expect(fake.calls).toHaveLength(1);
    expect(result.text).toContain("incompleta");
  });
});

describe("assistente — ferramentas (dados reais da base)", () => {
  it("devolvem os dados do utilizador com dinheiro em string e a moeda", async () => {
    const { auth, user, bank, cat } = await setup("1000");
    const ctx: ToolContext = { userId: user.id, currency: { code: "MZN", symbol: "MT" } };
    const today = todayIso();
    const month = currentYearMonth();
    await addTransaction(auth, { type: "INCOME", description: "Salário", amount: "30000", date: today, accountId: bank.id, categoryId: cat("Salário") });
    await addTransaction(auth, { type: "EXPENSE", description: "Compras Shoprite", amount: "1250.50", date: today, accountId: bank.id, categoryId: cat("Supermercado") });
    await addTransaction(auth, { type: "EXPENSE", description: "Renda", amount: "8000", date: today, accountId: bank.id, categoryId: cat("Renda e casa"), status: "PENDING" });
    await api().put(`/api/v1/budgets/${cat("Supermercado")}`).set(auth).send({ limit: "5000" });
    await api().post("/api/v1/goals").set(auth).send({ name: "Fundo de emergência", target: "60000", color: "#2563eb", icon: "piggy" }).expect(201);
    await api()
      .post("/api/v1/investments")
      .set(auth)
      .send({ name: "Depósito 12 meses", type: "TERM_DEPOSIT", invested: "10000", annualRate: "9.5", startDate: today })
      .expect(201);

    const accounts = (await TOOL_HANDLERS.get_accounts({}, ctx)) as Record<string, unknown>;
    expect(accounts).toEqual({
      currency: "MZN",
      accounts: [{ name: "Banco", type: "BANK", institution: null, balance: "29749.50", includeInTotal: true }],
      totalIncluded: "29749.50",
    });

    const summary = (await TOOL_HANDLERS.get_month_summary({}, ctx)) as Record<string, unknown>;
    expect(summary).toMatchObject({ currency: "MZN", month, income: "30000.00", expense: "1250.50", net: "28749.50", pendingExpense: "8000.00" });
    expect(summary.expensesByCategory).toEqual(
      expect.arrayContaining([{ category: "Supermercado", amount: "1250.50", budget: "5000.00" }, { category: "Renda e casa", amount: "8000.00", budget: null }]),
    );
    expect(summary.upcoming).toEqual([{ date: today, description: "Renda", amount: "8000.00", type: "EXPENSE" }]);

    const list = (await TOOL_HANDLERS.list_transactions({ category: "super" }, ctx)) as { transactions: Record<string, unknown>[]; totalItems: number };
    expect(list.totalItems).toBe(1);
    expect(list.transactions[0]).toMatchObject({ description: "Compras Shoprite", amount: "1250.50", status: "liquidado", category: "Supermercado", account: "Banco" });
    const missing = await executeTool("list_transactions", { category: "Ginásio" }, ctx);
    expect(missing.isError).toBe(true);
    expect(JSON.parse(missing.content).categories).toContain("Supermercado");
    expect((await executeTool("list_transactions", { search: "renda", limit: 5 }, ctx)).isError).toBe(false);

    const budgets = (await TOOL_HANDLERS.get_budgets({}, ctx)) as { withBudget: Record<string, unknown>[]; totalLimit: string; daysLeft: number };
    expect(budgets.totalLimit).toBe("5000.00");
    expect(budgets.withBudget).toEqual([
      expect.objectContaining({ category: "Supermercado", limit: "5000.00", spent: "1250.50", remaining: "3749.50", percentUsed: 25 }),
    ]);
    expect(budgets.daysLeft).toBeGreaterThan(0);

    const goals = (await TOOL_HANDLERS.get_goals({}, ctx)) as { goals: Record<string, unknown>[] };
    expect(goals.goals[0]).toMatchObject({ name: "Fundo de emergência", target: "60000.00", saved: "0.00", remaining: "60000.00", completed: false });

    const investments = (await TOOL_HANDLERS.get_investments({}, ctx)) as { investments: Record<string, unknown>[] };
    expect(investments.investments[0]).toMatchObject({ name: "Depósito 12 meses", invested: "10000.00", currentValue: "10000.00", gain: "0.00", annualRatePercent: "9.5" });

    const alerts = (await TOOL_HANDLERS.get_alerts({}, ctx)) as { alerts: { title: string }[] };
    expect(alerts.alerts.map((a) => a.title)).toContain("Renda vence hoje");

    const help = (await TOOL_HANDLERS.search_help({ query: "arquivar conta" }, ctx)) as { results: { link: string; section?: { text: string } }[] };
    expect(help.results[0].link).toBe("/ajuda/contas");
    expect(help.results[0].section?.text).toContain("Arquivar");

    // Outro utilizador não vê nada disto
    const other = await signUp();
    const theirs = (await TOOL_HANDLERS.get_accounts({}, { userId: other.user.id, currency: ctx.currency })) as { accounts: unknown[] };
    expect(theirs.accounts).toEqual([]);

    // Entrada inválida
    expect((await executeTool("get_budgets", { month: "2026-13" }, ctx)).isError).toBe(true);
  });
});
