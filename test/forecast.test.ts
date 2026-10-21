import { type EngineInput, runForecast } from "../src/modules/forecast/forecast.engine";
import { clock } from "../src/shared/lib/clock";
import { currentYear } from "../src/shared/lib/dates";
import { addTransaction, api, setSetting, setup } from "./helpers";

const Y = currentYear();

afterEach(() => clock.reset());

const base: EngineInput = {
  months: ["2026-10", "2026-11", "2026-12", "2027-01"],
  startCash: 1000,
  tightRate: 10,
  openGoalShare: 50,
  variableIncome: 0,
  variableExpense: 0,
  actual: { income: 0, expense: 0, variableIncome: 0, variableExpense: 0 },
  events: [],
  goals: [],
};

const salary = (month: string) => ({ date: `${month}-05`, type: "INCOME" as const, amount: 10000, label: "Salário", source: "RECURRING" as const, commitment: false });

describe("previsão — motor", () => {
  it("soma o que entra e sai, a margem e o dinheiro no fim de cada mês", () => {
    const { months } = runForecast({
      ...base,
      variableExpense: 3000,
      events: [
        ...base.months.map(salary),
        { date: "2026-11-02", type: "EXPENSE", amount: 1500, label: "Ginásio", source: "PLANNED", commitment: false },
        { date: "2026-12-10", type: "EXPENSE", amount: 6500, label: "Prestação do carro", source: "RECURRING", commitment: true },
      ],
    });
    expect(months.map((m) => [m.month, m.income.total, m.expenses.total, m.balance, m.status, m.cash])).toEqual([
      ["2026-10", 10000, 3000, 7000, "OK", 8000],
      ["2026-11", 10000, 4500, 5500, "OK", 13500],
      ["2026-12", 10000, 9500, 500, "TIGHT", 14000],
      ["2027-01", 10000, 3000, 7000, "OK", 21000],
    ]);
    expect(months[2].expenses.commitments).toBe(6500);
  });

  it("no mês actual, conta o que já aconteceu e só o dia-a-dia que falta", () => {
    const [october] = runForecast({
      ...base,
      variableExpense: 3000,
      actual: { income: 10000, expense: 2000, variableIncome: 0, variableExpense: 2000 },
    }).months;
    expect(october.income.total).toBe(10000);
    expect(october.expenses).toMatchObject({ actual: 2000, variable: 1000, total: 3000 });
    // O saldo inicial já tem o salário e os 2.000 gastos: só falta tirar os 1.000 do dia-a-dia
    expect(october.cash).toBe(0);
  });

  it("num mês apertado guarda menos para a meta e recupera nos meses seguintes, até ao prazo", () => {
    const { months, goals } = runForecast({
      ...base,
      events: [
        ...base.months.map(salary),
        { date: "2026-11-20", type: "EXPENSE", amount: 9000, label: "Propinas", source: "PLANNED", commitment: false },
      ],
      goals: [{ id: "g1", name: "Férias", color: "#000", icon: "plane", remaining: 12000, deadline: "2027-01" }],
    });
    expect(months.map((m) => [m.month, m.savings.total, m.savings.goals[0]?.reduced])).toEqual([
      ["2026-10", 3000, false],
      ["2026-11", 0, true],
      ["2026-12", 4500, false],
      ["2027-01", 4500, false],
    ]);
    expect(goals[0]).toMatchObject({ planned: 12000, completesIn: "2027-01", onTrack: true, shortfall: 0, monthlyIdeal: 3000 });
  });

  it("sem folga suficiente até ao prazo, diz quanto fica a faltar", () => {
    const { goals } = runForecast({
      ...base,
      months: ["2026-10", "2026-11"],
      events: [salary("2026-10"), salary("2026-11")],
      goals: [{ id: "g1", name: "Carro", color: "#000", icon: "car", remaining: 30000, deadline: "2026-11" }],
    });
    expect(goals[0]).toMatchObject({ planned: 18000, completesIn: null, onTrack: false, shortfall: 12000 });
  });

  it("uma meta sem prazo leva parte da folga e as metas com prazo vêm primeiro", () => {
    const { months } = runForecast({
      ...base,
      months: ["2026-10"],
      events: [salary("2026-10")],
      goals: [
        { id: "open", name: "Reserva", color: "#000", icon: "piggy", remaining: 50000 },
        { id: "dated", name: "Portátil", color: "#000", icon: "phone", remaining: 4000, deadline: "2026-11" },
      ],
    });
    // Folga 9.000: 2.000 para o portátil (4.000 em 2 meses) e metade do resto (3.500) para a reserva
    expect(months[0].savings.goals).toEqual([
      { goalId: "dated", amount: 2000, ideal: 2000, reduced: false },
      { goalId: "open", amount: 3500, ideal: 3500, reduced: false },
    ]);
  });
});

describe("previsão — API", () => {
  it("projecta as recorrentes futuras, explica os meses e simula uma despesa nova", async () => {
    clock.set(`${Y}-09-10T10:00:00Z`);
    const { auth, bank, cat } = await setup("5000");
    await setSetting("forecast.horizonMonths", 4);
    const recurring = (body: Record<string, unknown>) => api().post("/api/v1/recurring").set(auth).send({ accountId: bank.id, frequency: "MONTHLY", ...body }).expect(201);
    await recurring({ type: "INCOME", description: "Salário", amount: "20000", categoryId: cat("Salário"), startDate: `${Y}-09-25` });
    await recurring({ type: "EXPENSE", description: "Ginásio", amount: "1500", categoryId: cat("Saúde"), startDate: `${Y}-11-01` });
    await recurring({ type: "EXPENSE", description: "Prestação do carro", amount: "9000", categoryId: cat("Transporte"), startDate: `${Y}-09-28`, commitment: true });
    // Dia-a-dia de Agosto (mês completo): 6.000
    await addTransaction(auth, { type: "EXPENSE", description: "Supermercado", amount: "6000", date: `${Y}-08-15`, accountId: bank.id, categoryId: cat("Supermercado") });

    const { body } = await api().get("/api/v1/forecast").set(auth).expect(200);
    expect(body.basis).toMatchObject({ months: 1, variableExpense: "6000.00" });
    expect(body.startCash).toBe("-1000.00");
    expect(body.months.map((m: { month: string }) => m.month)).toEqual([`${Y}-09`, `${Y}-10`, `${Y}-11`, `${Y}-12`]);
    const november = body.months[2];
    // Sobram 3.500, acima da margem de 10% (2.000)
    expect(november).toMatchObject({
      status: "OK",
      income: { total: "20000.00" },
      expenses: { commitments: "9000.00", fixed: "1500.00", variable: "6000.00", total: "16500.00" },
      balance: "3500.00",
    });
    expect(november.notes).toEqual(expect.arrayContaining([expect.stringContaining("Novo neste mês: Ginásio")]));

    const scenario = await api()
      .get(`/api/v1/forecast?scenarioLabel=Crédito%20casa&scenarioAmount=5000&scenarioFrom=${Y}-11&scenarioCommitment=true`)
      .set(auth)
      .expect(200);
    expect(scenario.body.scenario).toMatchObject({ label: "Crédito casa", amount: "5000.00", from: `${Y}-11`, commitment: true });
    expect(scenario.body.months[2]).toMatchObject({ status: "NEGATIVE", balance: "-1500.00", expenses: { commitments: "14000.00" } });
    expect(scenario.body.months[2].notes[1]).toMatch(/prestações deste mês .* ficam em risco/);
  });

  it("valida o cenário", async () => {
    const { auth } = await setup();
    const { body } = await api().get("/api/v1/forecast?scenarioAmount=0&scenarioFrom=2026-13").set(auth).expect(422);
    expect(body.errors.map((e: { field: string }) => e.field)).toEqual(expect.arrayContaining(["scenarioAmount", "scenarioFrom"]));
  });
});
