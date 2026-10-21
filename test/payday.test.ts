import { clock } from "../src/shared/lib/clock";
import { currentYear } from "../src/shared/lib/dates";
import { addTransaction, api, setup } from "./helpers";

const Y = currentYear();

afterEach(() => clock.reset());

describe("plano do salário", () => {
  it("propõe contas (prestações primeiro), poupança e dia-a-dia até ao próximo salário", async () => {
    clock.set(`${Y}-09-25T10:00:00Z`);
    const { auth, bank, cat } = await setup("0");
    for (const m of ["06", "07", "08"]) {
      await addTransaction(auth, { type: "INCOME", description: "Salário", amount: "20000", date: `${Y}-${m}-25`, accountId: bank.id, categoryId: cat("Salário") });
      await addTransaction(auth, { type: "EXPENSE", description: "Supermercado", amount: "6000", date: `${Y}-${m}-26`, accountId: bank.id, categoryId: cat("Supermercado") });
    }
    const recurring = (body: Record<string, unknown>) => api().post("/api/v1/recurring").set(auth).send({ accountId: bank.id, frequency: "MONTHLY", ...body }).expect(201);
    await recurring({ type: "INCOME", description: "Salário", amount: "20000", categoryId: cat("Salário"), startDate: `${Y}-10-25` });
    await recurring({ type: "EXPENSE", description: "Prestação do carro", amount: "5000", categoryId: cat("Transporte"), startDate: `${Y}-10-15`, commitment: true });
    await recurring({ type: "EXPENSE", description: "Renda", amount: "4000", categoryId: cat("Renda e casa"), startDate: `${Y}-09-28` });
    await addTransaction(auth, { type: "EXPENSE", description: "Propinas", amount: "1500", date: `${Y}-10-10`, accountId: bank.id, categoryId: cat("Saúde"), status: "PENDING" });
    await api().post("/api/v1/goals").set(auth).send({ name: "Férias", color: "#2563eb", icon: "plane", target: "12000", deadline: `${Y + 1}-02-28` }).expect(201);

    const salary = await addTransaction(auth, { type: "INCOME", description: "Salário setembro", amount: "20000", date: `${Y}-09-25`, accountId: bank.id, categoryId: cat("Salário") });
    const { body } = await api().get(`/api/v1/dashboard/payday/${salary.id}`).set(auth).expect(200);

    expect(body).toMatchObject({ isPayday: true, until: `${Y}-10-25`, days: 30, income: { id: salary.id, amount: "20000.00" } });
    expect(body.bills.map((b: { label: string; status: string; commitment: boolean }) => [b.label, b.status, b.commitment])).toEqual([
      ["Prestação do carro", "UPCOMING", true],
      ["Renda", "PENDING", false],
      ["Propinas", "PENDING", false],
    ]);
    expect(body.totals.bills).toBe("10500.00");
    expect(body.dayToDay).toBe("6000.00");
    // O plano do mês pedia 2.000, mas depois das contas, do dia-a-dia e da margem (10%) só cabem 1.500
    expect(body.savings).toEqual([expect.objectContaining({ name: "Férias", amount: "1500.00", planned: "2000.00", reduced: true })]);
    expect(body.free).toBe("2000.00");
    expect(body.notes[0]).toBe("Pague primeiro a prestação: Prestação do carro (5.000,00 MT).");

    // O Dashboard encontra-o sozinho e o conselheiro fala dele
    expect((await api().get("/api/v1/dashboard/payday").set(auth).expect(200)).body.income.id).toBe(salary.id);
    const advisor = (await api().get("/api/v1/dashboard/advisor").set(auth).expect(200)).body;
    expect(advisor.items[0]).toMatchObject({ code: "PAYDAY", link: `/painel?plano=${salary.id}`, title: "Recebeu 20.000,00 MT: o plano até ao próximo salário" });
  });

  it("um salário que não chega reduz a poupança e diz quanto falta", async () => {
    clock.set(`${Y}-09-25T10:00:00Z`);
    const { auth, bank, cat } = await setup("0");
    for (const m of ["07", "08"]) {
      await addTransaction(auth, { type: "INCOME", description: "Salário", amount: "10000", date: `${Y}-${m}-25`, accountId: bank.id, categoryId: cat("Salário") });
      await addTransaction(auth, { type: "EXPENSE", description: "Supermercado", amount: "4000", date: `${Y}-${m}-26`, accountId: bank.id, categoryId: cat("Supermercado") });
    }
    await addTransaction(auth, { type: "EXPENSE", description: "Obras", amount: "9000", date: `${Y}-10-01`, accountId: bank.id, categoryId: cat("Renda e casa"), status: "PENDING" });
    await api().post("/api/v1/goals").set(auth).send({ name: "Carro", color: "#2563eb", icon: "car", target: "50000", deadline: `${Y}-12-31` }).expect(201);
    const salary = await addTransaction(auth, { type: "INCOME", description: "Salário", amount: "10000", date: `${Y}-09-25`, accountId: bank.id, categoryId: cat("Salário") });

    const { body } = await api().get(`/api/v1/dashboard/payday/${salary.id}`).set(auth).expect(200);
    expect(body.totals.savings).toBe("0.00");
    expect(Number(body.free)).toBeLessThan(0);
    expect(body.notes).toEqual([expect.stringMatching(/^O salário não chega para tudo: faltam/)]);
  });

  it("receitas pequenas não contam como salário; só receitas próprias", async () => {
    clock.set(`${Y}-02-10T10:00:00Z`);
    const { auth, bank, cat } = await setup("0");
    const other = await setup();
    await addTransaction(auth, { type: "INCOME", description: "Salário", amount: "20000", date: `${Y}-01-25`, accountId: bank.id, categoryId: cat("Salário") });
    await addTransaction(auth, { type: "EXPENSE", description: "Pão", amount: "100", date: `${Y}-01-26`, accountId: bank.id, categoryId: cat("Pão e mercearia") });
    const small = await addTransaction(auth, { type: "INCOME", description: "Venda", amount: "500", date: `${Y}-02-02`, accountId: bank.id, categoryId: cat("Negócios extra") });
    expect((await api().get(`/api/v1/dashboard/payday/${small.id}`).set(auth).expect(200)).body.isPayday).toBe(false);
    await api().get(`/api/v1/dashboard/payday/${small.id}`).set(other.auth).expect(404);
  });
});

describe("confirmar uma prevista", () => {
  it("passa a liquidada sem mexer no resto; exige EDIT", async () => {
    const { auth, bank, cat } = await setup("1000");
    const t = await addTransaction(auth, { type: "EXPENSE", description: "Renda", amount: "300", date: `${Y}-01-10`, accountId: bank.id, categoryId: cat("Renda e casa"), status: "PENDING", notes: "Senhorio" });
    const { body } = await api().post(`/api/v1/transactions/${t.id}/confirm`).set(auth).expect(200);
    expect(body).toMatchObject({ status: "CLEARED", notes: "Senhorio", amount: "300.00" });
    const accounts = (await api().get("/api/v1/accounts").set(auth).expect(200)).body.content;
    expect(accounts[0].balance).toBe("700.00");
  });
});

describe("plano do salário — o que já guardou", () => {
  it("desconta das metas o que guardou desde que o salário entrou", async () => {
    clock.set(`${Y}-09-25T10:00:00Z`);
    const { auth, bank, cat } = await setup("0");
    for (const m of ["07", "08"]) {
      await addTransaction(auth, { type: "INCOME", description: "Salário", amount: "20000", date: `${Y}-${m}-25`, accountId: bank.id, categoryId: cat("Salário") });
      await addTransaction(auth, { type: "EXPENSE", description: "Supermercado", amount: "6000", date: `${Y}-${m}-26`, accountId: bank.id, categoryId: cat("Supermercado") });
    }
    const goal = (await api().post("/api/v1/goals").set(auth).send({ name: "Férias", color: "#2563eb", icon: "plane", target: "12000", deadline: `${Y + 1}-02-28` }).expect(201)).body;
    const salary = await addTransaction(auth, { type: "INCOME", description: "Salário", amount: "20000", date: `${Y}-09-25`, accountId: bank.id, categoryId: cat("Salário") });
    const before = (await api().get(`/api/v1/dashboard/payday/${salary.id}`).set(auth).expect(200)).body.savings[0];
    expect(before).toMatchObject({ amount: "2000.00", saved: "0.00" });

    await api().post(`/api/v1/goals/${goal.id}/contributions`).set(auth).send({ amount: "2000", date: `${Y}-09-25` }).expect(201);
    const after = (await api().get(`/api/v1/dashboard/payday/${salary.id}`).set(auth).expect(200)).body.savings[0];
    expect(after).toMatchObject({ amount: "0.00", saved: "2000.00" });
  });
});
