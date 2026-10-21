import { prisma } from "../src/shared/db/prisma";
import { runDailyEmails } from "../src/modules/alerts/alerts.job";
import { addDays, currentYearMonth, shiftMonth, todayIso } from "../src/shared/lib/dates";
import { addTransaction, api, openYear, setup } from "./helpers";

describe("dashboard", () => {
  it("resume o mês: património, grupos, fluxo, diário, recentes e previstas", async () => {
    const { auth, bank, cat } = await setup("10000");
    const savings = (await api().post("/api/v1/accounts").set(auth).send({ name: "Poupança", type: "SAVINGS", color: "#9333ea", initialBalance: "5000", includeInTotal: false })).body;
    const month = "2026-09";
    const tx = (body: Record<string, unknown>) => addTransaction(auth, { accountId: bank.id, description: "x", status: "CLEARED", ...body });

    await tx({ type: "INCOME", amount: "40000", date: "2026-09-05", categoryId: cat("Salário") });
    await tx({ type: "EXPENSE", amount: "1000", date: "2026-09-02", categoryId: cat("Supermercado") });
    await tx({ type: "EXPENSE", amount: "500", date: "2026-09-03", categoryId: cat("Lazer e passeios") });
    await tx({ type: "EXPENSE", amount: "700", date: "2026-09-25", categoryId: cat("Supermercado"), status: "PENDING" });
    await tx({ type: "TRANSFER", amount: "3000", date: "2026-09-06", destinationAccountId: savings.id });
    await tx({ type: "EXPENSE", amount: "200", date: "2026-08-02", categoryId: cat("Supermercado") });
    await api().put(`/api/v1/budgets/${cat("Supermercado")}`).set(auth).send({ limit: "1500" });
    await api().post("/api/v1/investments").set(auth).send({ name: "OT", type: "TREASURY_BONDS", invested: "20000", startDate: "2026-01-01" });

    const { body } = await api().get(`/api/v1/dashboard?month=${month}`).set(auth).expect(200);
    // Banco: 10000 − 200 + 40000 − 1000 − 500 − 3000 = 45300; poupança fora do total
    expect(body.netWorth).toBe("65300.00");
    expect(body.invested).toBe("20000.00");
    expect(body.savings).toBe("8000.00");
    expect(body).toMatchObject({ income: "40000.00", expense: "1500.00", previousIncome: "0.00", previousExpense: "200.00", pendingExpense: "700.00" });
    expect(body.byCategory[0]).toEqual({ categoryId: cat("Supermercado"), amount: "1700.00", budget: "1500.00" });
    expect(body.byGroup).toEqual([
      { group: "NEEDS", amount: "1700.00" },
      { group: "WANTS", amount: "500.00" },
      { group: "SAVINGS", amount: "3000.00" },
    ]);
    expect(body.cashflow).toHaveLength(6);
    expect(body.cashflow.at(-1)).toEqual({ month, income: "40000.00", expense: "1500.00" });
    expect(body.daily).toHaveLength(30);
    expect(body.daily[2]).toEqual({ day: 3, current: "1500.00", previous: "200.00" });
    expect(body.recent).toHaveLength(4);
    expect(body.upcoming.map((t: { amount: string }) => t.amount)).toEqual(["700.00"]);
  });

  it("no mês corrente, os dias futuros vêm a null", async () => {
    const { auth } = await setup();
    const { body } = await api().get("/api/v1/dashboard").set(auth).expect(200);
    const today = Number(todayIso().slice(8, 10));
    expect(body.daily[today - 1].current).not.toBeNull();
    if (body.daily[today]) expect(body.daily[today].current).toBeNull();
  });
});

describe("reports", () => {
  it("gera 12 meses com património, categorias e anos disponíveis", async () => {
    const { auth, bank, cat } = await setup("1000");
    // Só o ano corrente está aberto: abre 2025 para registar o movimento do ano anterior
    await openYear(2025);
    const tx = (body: Record<string, unknown>) => addTransaction(auth, { accountId: bank.id, description: "x", status: "CLEARED", ...body });
    await tx({ type: "INCOME", amount: "5000", date: "2025-12-10", categoryId: cat("Salário") });
    await tx({ type: "INCOME", amount: "3000", date: "2026-02-10", categoryId: cat("Salário") });
    await tx({ type: "EXPENSE", amount: "800", date: "2026-02-11", categoryId: cat("Saúde") });
    await tx({ type: "EXPENSE", amount: "100", date: "2026-03-11", categoryId: cat("Saúde"), status: "PENDING" });

    const { body } = await api().get("/api/v1/reports/annual?year=2026").set(auth).expect(200);
    expect(body.months).toHaveLength(12);
    expect(body.months[0]).toMatchObject({ month: "2026-01", income: "0.00", netWorth: "6000.00", empty: false, future: false });
    expect(body.months[1]).toMatchObject({ income: "3000.00", expense: "800.00", net: "2200.00", netWorth: "8200.00" });
    expect(body.months[11]).toMatchObject({ future: true, netWorth: "0.00" });
    expect(body.expenseByCategory).toEqual([{ categoryId: cat("Saúde"), months: expect.any(Array), total: "800.00" }]);
    expect(body.totals).toEqual({ income: "3000.00", expense: "800.00", net: "2200.00" });
    expect(body.previousTotals).toEqual({ income: "5000.00", expense: "0.00", net: "5000.00" });
    expect(body.availableYears).toEqual([2026, 2025]);

    const old = (await api().get("/api/v1/reports/annual?year=2025").set(auth)).body;
    expect(old.months[0]).toMatchObject({ empty: true, netWorth: "0.00" });
    await api().get("/api/v1/reports/annual?year=abc").set(auth).expect(422);
  });
});

describe("alerts", () => {
  it("gera os alertas do mock e guarda o estado lido", async () => {
    const { auth, bank, cat } = await setup("500");
    const month = currentYearMonth();
    const today = todayIso();
    const tx = (body: Record<string, unknown>) => addTransaction(auth, { accountId: bank.id, description: "Renda", status: "CLEARED", date: today, ...body });

    await tx({ type: "EXPENSE", amount: "120", categoryId: cat("Supermercado") });
    await api().put(`/api/v1/budgets/${cat("Supermercado")}`).set(auth).send({ limit: "100" });
    // Na passagem de ano, ontem/amanhã caem noutro ano
    await openYear(Number(addDays(today, 1).slice(0, 4)));
    await openYear(Number(addDays(today, -1).slice(0, 4)));
    await tx({ type: "EXPENSE", amount: "300", categoryId: cat("Renda e casa"), status: "PENDING", date: addDays(today, 1) });
    await tx({ type: "EXPENSE", amount: "50", categoryId: cat("Renda e casa"), status: "PENDING", date: addDays(today, -1), description: "Água" });

    const { body } = await api().get("/api/v1/alerts").set(auth).expect(200);
    const ids = body.items.map((a: { id: string }) => a.id);
    expect(ids).toEqual(
      expect.arrayContaining([`budget:${cat("Supermercado")}:${month}:over`, `low:${bank.id}:${month}`, `overspend:${month}`]),
    );
    const due = body.items.find((a: { title: string }) => a.title === "Renda vence amanhã");
    expect(due).toMatchObject({ kind: "BILL", severity: "warning", message: expect.stringContaining("300,00 MT") });
    expect(body.items.find((a: { title: string }) => a.title === "Água em atraso")).toMatchObject({ severity: "critical" });
    expect(body.items[0].severity).toBe("critical");
    expect(body.unread).toBe(body.items.length);

    await api().post(`/api/v1/alerts/${encodeURIComponent(ids[0])}/read`).set(auth).expect(204);
    expect((await api().get("/api/v1/alerts").set(auth)).body.unread).toBe(body.items.length - 1);
    await api().post("/api/v1/alerts/read-all").set(auth).expect(204);
    expect((await api().get("/api/v1/alerts").set(auth)).body.unread).toBe(0);
  });

  it("lê e valida as definições; desligar um tipo remove os alertas", async () => {
    const { auth, user } = await setup("10");
    const settings = (await api().get("/api/v1/alerts/settings").set(auth).expect(200)).body;
    expect(settings).toMatchObject({ email: user.email, budgetThreshold: 80, lowBalanceAmount: "1000.00" });

    const bad = await api().put("/api/v1/alerts/settings").set(auth).send({ ...settings, email: "x", budgetThreshold: 20, billDaysAhead: 40 }).expect(422);
    expect(bad.body.errors.map((e: { field: string }) => e.field).sort()).toEqual(["billDaysAhead", "budgetThreshold", "email"]);

    expect((await api().get("/api/v1/alerts").set(auth)).body.items.some((a: { kind: string }) => a.kind === "LOW_BALANCE")).toBe(true);
    const saved = (await api().put("/api/v1/alerts/settings").set(auth).send({ ...settings, lowBalanceAlerts: false, lowBalanceAmount: "250,5" }).expect(200)).body;
    expect(saved.lowBalanceAmount).toBe("250.50");
    expect((await api().get("/api/v1/alerts").set(auth)).body.items.some((a: { kind: string }) => a.kind === "LOW_BALANCE")).toBe(false);
  });

  it("envia cada alerta por email uma só vez, e os resumos no dia certo", async () => {
    const { user } = await setup("10");
    const monday = "2026-11-02"; // segunda-feira e não dia 1
    await runDailyEmails(monday);
    await runDailyEmails(monday);
    const alerts = await prisma.emailLog.findMany({ where: { userId: user.id, kind: "ALERT" } });
    expect(alerts.length).toBeGreaterThan(0);
    expect(new Set(alerts.map((a) => a.ref)).size).toBe(alerts.length);

    await prisma.alertSettings.update({ where: { userId: user.id }, data: { weeklySummary: true } });
    await runDailyEmails(monday);
    await runDailyEmails("2026-11-01");
    const kinds = (await prisma.emailLog.findMany({ where: { userId: user.id, kind: { not: "ALERT" } } })).map((e) => `${e.kind}:${e.ref}`);
    expect(kinds.sort()).toEqual(["MONTHLY_REPORT:monthly:2026-10", "WEEKLY_SUMMARY:weekly:2026-W44"]);
  });
});

describe("settings", () => {
  it("actualiza nome, email (também de login) e moeda", async () => {
    const { auth } = await setup();
    const other = await setup();
    const clash = await api().put("/api/v1/settings").set(auth).send({ name: "Ana", email: other.user.email, currency: "EUR" }).expect(422);
    expect(clash.body.errors[0].field).toBe("email");

    const saved = (await api().put("/api/v1/settings").set(auth).send({ name: " Ana Maria ", email: "NOVA@exemplo.com", currency: "EUR" }).expect(200)).body;
    expect(saved).toEqual({ name: "Ana Maria", email: "nova@exemplo.com", currency: "EUR" });
    await api().post("/api/v1/auth/login").send({ email: "nova@exemplo.com", password: "segredo123" }).expect(200);
    await api().put("/api/v1/settings").set(auth).send({ name: "A", email: "a@b.co", currency: "XYZ" }).expect(422);
  });

  it("repõe os dados de exemplo e exporta tudo", async () => {
    const { auth } = await setup();
    await api().post("/api/v1/demo/reset").set(auth).expect(204);

    const accounts = (await api().get("/api/v1/accounts").set(auth)).body.content;
    expect(accounts.map((a: { name: string }) => a.name)).toEqual(["Conta ordenado", "M-Pesa", "Carteira", "Poupança"]);
    const goals = (await api().get("/api/v1/goals").set(auth)).body.content;
    expect(goals).toHaveLength(3);
    expect(goals[0].saved).toBe("62000.00");
    expect((await api().get("/api/v1/investments").set(auth)).body.content).toHaveLength(3);

    const month = (await api().get(`/api/v1/transactions?month=${shiftMonth(currentYearMonth(), -1)}`).set(auth)).body;
    expect(month.totalItems).toBeGreaterThan(30);
    expect(month.totals.income).not.toBe("0.00");

    // Pode repetir-se sem erros (apaga e volta a criar)
    await api().post("/api/v1/demo/reset").set(auth).expect(204);
    const exported = (await api().get("/api/v1/export").set(auth).expect(200)).body;
    expect(exported.accounts).toHaveLength(4);
    expect(exported.budgets).toHaveLength(6);
    expect(Object.keys(exported).sort()).toEqual(["accounts", "budgets", "categories", "exportedAt", "goals", "investments", "settings", "transactions"]);
  });
});
