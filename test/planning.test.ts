import { addDays, currentYearMonth, shiftMonth, todayIso } from "../src/shared/lib/dates";
import { addTransaction, api, setup } from "./helpers";

describe("budgets", () => {
  it("define limites, calcula gasto, previsto, sugestão e ordena pela % usada", async () => {
    const { auth, bank, cat } = await setup();
    const month = "2026-09";
    const expense = (category: string, amount: string, date: string, status = "CLEARED") =>
      addTransaction(auth, { type: "EXPENSE", description: "x", amount, date, accountId: bank.id, categoryId: cat(category), status });

    await expense("Supermercado", "900", "2026-09-10");
    await expense("Supermercado", "300", "2026-09-20", "PENDING");
    await expense("Transporte", "2400", "2026-09-11");
    // Três meses anteriores: 1000 + 1100 + 0 → média 700 → sugestão 700
    await expense("Transporte", "1000", "2026-08-11");
    await expense("Transporte", "1100", "2026-07-11");
    await expense("Transporte", "5000", "2026-05-11"); // fora da janela

    await api().put(`/api/v1/budgets/${cat("Supermercado")}`).set(auth).send({ limit: "1000" }).expect(204);
    await api().put(`/api/v1/budgets/${cat("Transporte")}`).set(auth).send({ limit: "2000,00" }).expect(204);
    await api().put(`/api/v1/budgets/${cat("Salário")}`).set(auth).send({ limit: "1" }).expect(404);
    await api().put(`/api/v1/budgets/${cat("Roupa")}`).set(auth).send({ limit: "0" }).expect(422);

    const { body } = await api().get(`/api/v1/budgets?month=${month}`).set(auth).expect(200);
    expect(body.month).toBe(month);
    expect(body.daysLeft).toBe(0);
    expect(body.lines).toHaveLength(11);
    expect(body.lines[0]).toEqual({ categoryId: cat("Transporte"), limit: "2000.00", spent: "2400.00", pending: "0.00", suggested: "700.00" });
    expect(body.lines[1]).toEqual({ categoryId: cat("Supermercado"), limit: "1000.00", spent: "900.00", pending: "300.00", suggested: "0.00" });
    expect(body.lines[2].limit).toBeUndefined();
    expect(body.totalLimit).toBe("3000.00");
    expect(body.totalSpent).toBe("3300.00");

    await api().delete(`/api/v1/budgets/${cat("Transporte")}`).set(auth).expect(204);
    const after = (await api().get(`/api/v1/budgets?month=${month}`).set(auth)).body;
    expect(after.totalLimit).toBe("1000.00");
  });

  it("conta os dias que faltam no mês corrente", async () => {
    const { auth } = await setup();
    const { body } = await api().get("/api/v1/budgets").set(auth).expect(200);
    expect(body.month).toBe(currentYearMonth());
    expect(body.daysLeft).toBeGreaterThan(0);
  });
});

describe("goals", () => {
  const goal = (extra: Record<string, unknown> = {}) => ({ name: "Férias", icon: "plane", color: "#2563eb", target: "12000", ...extra });

  it("cria, contribui, retira e calcula quanto falta por mês", async () => {
    const { auth, bank } = await setup();
    const deadline = `${shiftMonth(currentYearMonth(), 2)}-15`; // mês corrente + 2 → 3 meses
    const created = (await api().post("/api/v1/goals").set(auth).send(goal({ deadline, accountId: bank.id })).expect(201)).body;
    expect(created).toMatchObject({ saved: "0.00", monthlyNeeded: "4000.00", accountId: bank.id, contributions: [] });

    const today = todayIso();
    const after = (await api().post(`/api/v1/goals/${created.id}/contributions`).set(auth).send({ amount: "1000", date: today, note: "Primeira" }).expect(201)).body;
    expect(after.saved).toBe("1000.00");
    expect(after.monthlyNeeded).toBe("3666.67");

    const withdraw = await api().post(`/api/v1/goals/${created.id}/contributions`).set(auth).send({ amount: "-1500", date: today }).expect(422);
    expect(withdraw.body.errors).toEqual([{ field: "amount", message: "Não pode retirar mais do que o que está guardado." }]);
    await api().post(`/api/v1/goals/${created.id}/contributions`).set(auth).send({ amount: "-400", date: today }).expect(201);
    await api().post(`/api/v1/goals/${created.id}/contributions`).set(auth).send({ amount: "0", date: today }).expect(422);
    await api().post(`/api/v1/goals/${created.id}/contributions`).set(auth).send({ amount: "10", date: addDays(today, 1) }).expect(422);

    const done = (await api().post(`/api/v1/goals/${created.id}/contributions`).set(auth).send({ amount: "11400", date: today }).expect(201)).body;
    expect(done.saved).toBe("12000.00");
    expect(done.monthlyNeeded).toBeUndefined();
    expect(done.contributions).toHaveLength(3);
  });

  it("valida prazo no passado, conta alheia e apaga", async () => {
    const ana = await setup();
    const rui = await setup();
    const past = await api().post("/api/v1/goals").set(ana.auth).send(goal({ deadline: "2020-01-01", accountId: rui.bank.id })).expect(422);
    expect(past.body.errors.map((e: { field: string }) => e.field).sort()).toEqual(["accountId", "deadline"]);

    const created = (await api().post("/api/v1/goals").set(ana.auth).send(goal()).expect(201)).body;
    expect(created.monthlyNeeded).toBeUndefined();
    await api().put(`/api/v1/goals/${created.id}`).set(rui.auth).send(goal()).expect(404);
    await api().delete(`/api/v1/goals/${created.id}`).set(ana.auth).expect(204);
    expect((await api().get("/api/v1/goals").set(ana.auth)).body.content).toEqual([]);
  });
});

describe("investments", () => {
  const input = (extra: Record<string, unknown> = {}) => ({
    name: "Depósito a prazo",
    type: "TERM_DEPOSIT",
    institution: "BCI",
    invested: "50000",
    annualRate: "9,5",
    startDate: "2026-01-10",
    maturityDate: "2027-01-10",
    ...extra,
  });

  it("cria com avaliação inicial, regista avaliações e actualiza", async () => {
    const { auth } = await setup();
    const created = (await api().post("/api/v1/investments").set(auth).send(input()).expect(201)).body;
    expect(created).toMatchObject({ invested: "50000.00", currentValue: "50000.00", annualRate: "9.5", valuations: [{ date: "2026-01-10", value: "50000.00" }] });

    // Antes de haver avaliações, a inicial acompanha capital e data
    const edited = (await api().put(`/api/v1/investments/${created.id}`).set(auth).send(input({ invested: "60000", startDate: "2026-02-01" })).expect(200)).body;
    expect(edited.valuations).toEqual([{ date: "2026-02-01", value: "60000.00" }]);

    await api().post(`/api/v1/investments/${created.id}/valuations`).set(auth).send({ date: "2026-06-30", value: "62000" }).expect(201);
    const replaced = (await api().post(`/api/v1/investments/${created.id}/valuations`).set(auth).send({ date: "2026-06-30", value: "62500,25" }).expect(201)).body;
    expect(replaced.valuations).toEqual([
      { date: "2026-02-01", value: "60000.00" },
      { date: "2026-06-30", value: "62500.25" },
    ]);
    expect(replaced.currentValue).toBe("62500.25");

    await api().post(`/api/v1/investments/${created.id}/valuations`).set(auth).send({ date: "2026-01-01", value: "1" }).expect(422);
    await api().delete(`/api/v1/investments/${created.id}`).set(auth).expect(204);
  });

  it("valida datas, taxa e valores", async () => {
    const { auth } = await setup();
    const res = await api()
      .post("/api/v1/investments")
      .set(auth)
      .send(input({ invested: "0", annualRate: "abc", startDate: addDays(todayIso(), 1), maturityDate: "2020-01-01", type: "OURO" }))
      .expect(422);
    // Todos os erros de uma vez, incluindo as regras entre datas
    expect(res.body.errors.map((e: { field: string }) => e.field).sort()).toEqual(["annualRate", "invested", "maturityDate", "startDate", "type"]);
  });
});
