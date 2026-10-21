import { currentYearMonth, shiftMonth } from "../src/shared/lib/dates";
import { addTransaction, api, openYear, setSetting, setup, signUp, signUpAs } from "./helpers";

const lastMonth = () => shiftMonth(currentYearMonth(), -1);

/**
 * Um mês completo: recebe 40 000, gasta 10 000 em necessidades e 15 000 em desejos.
 * Poupança média 15 000 (37,5%), desejos 37,5% (acima dos 30%), sem poupança guardada.
 */
async function withLastMonth() {
  const ctx = await setup("1000");
  const month = lastMonth();
  await openYear(Number(month.slice(0, 4)));
  const tx = (body: Record<string, unknown>) => addTransaction(ctx.auth, { accountId: ctx.bank.id, description: "x", status: "CLEARED", ...body });
  await tx({ type: "INCOME", amount: "40000", date: `${month}-05`, categoryId: ctx.cat("Salário") });
  await tx({ type: "EXPENSE", amount: "10000", date: `${month}-06`, categoryId: ctx.cat("Supermercado") });
  await tx({ type: "EXPENSE", amount: "15000", date: `${month}-07`, categoryId: ctx.cat("Lazer e passeios") });
  return ctx;
}

describe("growth overview", () => {
  it("sem movimentos, propõe registar um mês e não projecta planos", async () => {
    const { auth } = await signUp();
    const { body } = await api().get("/api/v1/growth/overview").set(auth).expect(200);
    expect(body.profile).toMatchObject({ basis: "NONE", months: 0, avgSaving: "0.00" });
    expect(body.proposals.map((p: { code: string }) => p.code)).toEqual(["NO_DATA"]);
    expect(body.plans.length).toBeGreaterThan(0);
    expect(body.plans.every((p: { projection: unknown }) => p.projection === null)).toBe(true);
  });

  it("calcula as médias do último mês completo e gera propostas à medida", async () => {
    const { auth, cat } = await withLastMonth();
    const { body } = await api().get("/api/v1/growth/overview").set(auth).expect(200);

    expect(body.profile).toMatchObject({
      basis: "LOOKBACK",
      months: 1,
      avgIncome: "40000.00",
      avgExpense: "25000.00",
      avgSaving: "15000.00",
      savingsRate: 37.5,
      avgWants: "15000.00",
      wantsRate: 37.5,
      savings: "0.00",
      emergencyTarget: "150000.00",
      emergencyCoverage: 0,
    });
    expect(body.profile.topWants).toEqual([{ categoryId: cat("Lazer e passeios"), name: "Lazer e passeios", avg: "15000.00" }]);

    const codes = body.proposals.map((p: { code: string }) => p.code);
    expect(codes).toEqual(["WANTS_HIGH", "EMERGENCY_FUND"]);
    const wants = body.proposals.find((p: { code: string }) => p.code === "WANTS_HIGH");
    // 15 000 − 30% de 40 000
    expect(wants.amount).toBe("3000.00");
    const emergency = body.proposals.find((p: { code: string }) => p.code === "EMERGENCY_FUND");
    expect(emergency).toMatchObject({ amount: "150000.00", planCode: "EMERGENCY_FUND" });
    expect(emergency.message).toContain("12.500,00");

    // Prestação confortável = 50% de 15 000; o carro (24 meses, sem rendimento) junta 180 000
    const car = body.plans.find((p: { code: string }) => p.code === "CAR");
    expect(car.projection).toEqual({ monthly: "7500.00", months: 24, amount: "180000.00" });
    const invest = body.plans.find((p: { code: string }) => p.code === "INVEST");
    expect(Number(invest.projection.amount)).toBeGreaterThan(7500 * 60);
  });

  it("os limites vêm dos parâmetros do sistema", async () => {
    const { auth } = await withLastMonth();
    await setSetting("growth.wantsMaxRate", 40);
    await setSetting("growth.targetSavingsRate", 50);
    const { body } = await api().get("/api/v1/growth/overview").set(auth).expect(200);
    const codes = body.proposals.map((p: { code: string }) => p.code);
    expect(codes).not.toContain("WANTS_HIGH");
    // 50% de 40 000 − 15 000
    expect(body.proposals.find((p: { code: string }) => p.code === "SAVINGS_RATE").amount).toBe("5000.00");
  });

  it("com o fundo de emergência feito, propõe investir o excedente", async () => {
    const ctx = await withLastMonth();
    await api()
      .post("/api/v1/accounts")
      .set(ctx.auth)
      .send({ name: "Poupança", type: "SAVINGS", color: "#9333ea", initialBalance: "200000", includeInTotal: false })
      .expect(201);
    const { body } = await api().get("/api/v1/growth/overview").set(ctx.auth).expect(200);
    const codes = body.proposals.map((p: { code: string }) => p.code);
    expect(codes).toContain("EMERGENCY_OK");
    expect(codes).toContain("INVEST_SURPLUS");
    expect(body.proposals.find((p: { code: string }) => p.code === "INVEST_SURPLUS").planCode).toBe("INVEST");
  });

  it("gasta mais do que recebe: proposta de alerta", async () => {
    const ctx = await setup("1000");
    const month = lastMonth();
    await openYear(Number(month.slice(0, 4)));
    await addTransaction(ctx.auth, { accountId: ctx.bank.id, type: "INCOME", amount: "1000", date: `${month}-05`, categoryId: ctx.cat("Salário"), status: "CLEARED", description: "x" });
    await addTransaction(ctx.auth, { accountId: ctx.bank.id, type: "EXPENSE", amount: "3000", date: `${month}-06`, categoryId: ctx.cat("Roupa"), status: "CLEARED", description: "x" });
    const { body } = await api().get("/api/v1/growth/overview").set(ctx.auth).expect(200);
    expect(body.proposals[0]).toMatchObject({ code: "OVERSPENDING", tone: "danger", amount: "2000.00" });
    expect(body.plans.every((p: { projection: unknown }) => p.projection === null)).toBe(true);
  });
});

describe("growth simulate", () => {
  it("com prazo, calcula a prestação e compara com a poupança média", async () => {
    const { auth } = await withLastMonth();
    const { body } = await api().get("/api/v1/growth/simulate").query({ plan: "CAR", target: "120000", months: 12 }).set(auth).expect(200);
    expect(body).toMatchObject({ planCode: "CAR", months: 12, monthly: "10000.00", finalAmount: "120000.00", interest: "0.00", reachedIn: shiftMonth(currentYearMonth(), 12) });
    expect(body.schedule).toHaveLength(12);
    // 10 000 de 15 000 = 66,7%: acima dos 50% confortáveis
    expect(body.fit).toMatchObject({ status: "TIGHT", share: 66.7, comfortableMonthly: "7500.00", comfortableMonths: 16 });
  });

  it("com prestação e rendimento, calcula os meses", async () => {
    const { auth } = await withLastMonth();
    const { body } = await api().get("/api/v1/growth/simulate").query({ target: "100000", monthly: "10000", annualReturn: 12 }).set(auth).expect(200);
    expect(body.months).toBe(10);
    expect(Number(body.finalAmount)).toBeGreaterThan(100000);
    expect(Number(body.interest)).toBeGreaterThan(0);
    expect(body.fit.status).toBe("TIGHT");
  });

  it("sem prazo nem prestação usa o prazo sugerido do plano", async () => {
    const { auth } = await withLastMonth();
    const { body } = await api().get("/api/v1/growth/simulate").query({ plan: "HOUSE", target: "60000" }).set(auth).expect(200);
    expect(body).toMatchObject({ months: 60, monthly: "1000.00" });
    expect(body.fit.status).toBe("COMFORTABLE");
  });

  it("valor inicial que já chega e casos sem poupança", async () => {
    const { auth } = await withLastMonth();
    const reached = await api().get("/api/v1/growth/simulate").query({ target: "1000", initial: "2000" }).set(auth).expect(200);
    expect(reached.body).toMatchObject({ months: 0, monthly: "0.00", schedule: [], fit: { status: "REACHED" } });

    const fresh = await signUp();
    const none = await api().get("/api/v1/growth/simulate").query({ target: "1000", months: 10 }).set(fresh.auth).expect(200);
    expect(none.body.fit).toMatchObject({ status: "NO_SAVINGS", share: null, comfortableMonths: null });
  });

  it("valida os parâmetros", async () => {
    const { auth } = await signUp();
    await api().get("/api/v1/growth/simulate").query({ target: "1000", months: 12, monthly: "100" }).set(auth).expect(422);
    await api().get("/api/v1/growth/simulate").query({ target: "0" }).set(auth).expect(422);
    await api().get("/api/v1/growth/simulate").query({ target: "1000", months: 9999 }).set(auth).expect(422);
    await api().get("/api/v1/growth/simulate").query({ plan: "NAO_EXISTE", target: "1000" }).set(auth).expect(404);
  });
});

describe("admin growth plans", () => {
  it("só a administração gere os planos; os inactivos saem do Crescer", async () => {
    const { auth } = await signUp();
    await api().get("/api/v1/admin/growth-plans").set(auth).expect(403);

    const admin = await signUpAs("SUPER_ADMIN");
    const list = await api().get("/api/v1/admin/growth-plans").set(admin.auth).expect(200);
    expect(list.body.totalItems).toBeGreaterThanOrEqual(6);

    const created = await api()
      .post("/api/v1/admin/growth-plans")
      .set(admin.auth)
      .send({ code: "travel", name: "Viagem", description: "Férias em família", icon: "plane", color: "#0891b2", defaultMonths: 10 })
      .expect(201);
    expect(created.body).toMatchObject({ code: "TRAVEL", annualReturn: 0, defaultMonths: 10, active: true });
    await api()
      .post("/api/v1/admin/growth-plans")
      .set(admin.auth)
      .send({ code: "TRAVEL", name: "Outra", description: "x", icon: "plane", color: "#0891b2" })
      .expect(422);

    const { id, ...rest } = created.body;
    const updated = await api()
      .put(`/api/v1/admin/growth-plans/${id}`)
      .set(admin.auth)
      .send({ name: rest.name, description: rest.description, icon: rest.icon, color: rest.color, annualReturn: 5, active: false })
      .expect(200);
    expect(updated.body).toMatchObject({ code: "TRAVEL", annualReturn: 5, active: false });

    const overview = await api().get("/api/v1/growth/overview").set(auth).expect(200);
    expect(overview.body.plans.map((p: { code: string }) => p.code)).not.toContain("TRAVEL");
    await api().get("/api/v1/growth/simulate").query({ plan: "TRAVEL", target: "1000" }).set(auth).expect(404);

    await api().delete(`/api/v1/admin/growth-plans/${id}`).set(admin.auth).expect(204);
    await api().delete(`/api/v1/admin/growth-plans/${id}`).set(admin.auth).expect(404);
  });
});

describe("accessibility preferences", () => {
  it("grava as preferências de quem iniciou sessão e devolve-as no /auth/me", async () => {
    const { auth } = await signUp();
    const me = await api().get("/api/v1/auth/me").set(auth).expect(200);
    expect(me.body.preferences).toEqual({ textSize: "NORMAL", highContrast: false, reduceMotion: false });

    const saved = await api().put("/api/v1/auth/preferences").set(auth).send({ textSize: "LARGE", highContrast: true }).expect(200);
    expect(saved.body).toEqual({ textSize: "LARGE", highContrast: true, reduceMotion: false });
    expect((await api().get("/api/v1/auth/me").set(auth).expect(200)).body.preferences.textSize).toBe("LARGE");

    await api().put("/api/v1/auth/preferences").set(auth).send({ textSize: "ENORME" }).expect(422);
    await api().put("/api/v1/auth/preferences").send({ textSize: "LARGE" }).expect(401);
  });
});
