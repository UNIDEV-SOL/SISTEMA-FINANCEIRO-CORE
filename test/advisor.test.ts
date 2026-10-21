import { offlineAnswer } from "../src/modules/assistant/assistant.offline";
import { clock } from "../src/shared/lib/clock";
import { currentYear } from "../src/shared/lib/dates";
import { addTransaction, api, setup } from "./helpers";

const Y = currentYear();

afterEach(() => clock.reset());

type Auth = Record<string, string>;

/** Três meses completos de salário e despesas, e o mês actual a meio. */
async function history(auth: Auth, bank: { id: string }, cat: (n: string) => string, monthlyExpense = "8000") {
  for (const m of ["06", "07", "08"]) {
    await addTransaction(auth, { type: "INCOME", description: "Salário", amount: "20000", date: `${Y}-${m}-05`, accountId: bank.id, categoryId: cat("Salário") });
    await addTransaction(auth, { type: "EXPENSE", description: "Supermercado", amount: monthlyExpense, date: `${Y}-${m}-12`, accountId: bank.id, categoryId: cat("Supermercado") });
  }
}

describe("conselheiro", () => {
  it("sem movimentos, pede para começar a registar", async () => {
    const { auth } = await setup();
    const { body } = await api().get("/api/v1/dashboard/advisor").set(auth).expect(200);
    expect(body).toMatchObject({ mood: "NO_DATA", items: [{ code: "HABITS", link: "/transacoes" }] });
  });

  it("diz que está a crescer, como vai o mês e o que vem aí", async () => {
    clock.set(`${Y}-09-15T10:00:00Z`);
    const { auth, bank, cat } = await setup("0");
    await history(auth, bank, cat);
    await addTransaction(auth, { type: "EXPENSE", description: "Supermercado", amount: "2000", date: `${Y}-09-10`, accountId: bank.id, categoryId: cat("Supermercado") });

    const { body } = await api().get("/api/v1/dashboard/advisor").set(auth).expect(200);
    expect(body.mood).toBe("GROWING");
    expect(body.headline).toBe("Está a crescer e os próximos meses têm folga.");
    const byCode = Object.fromEntries(body.items.map((i: { code: string }) => [i.code, i]));
    expect(byCode.GROWTH).toMatchObject({ tone: "success", title: "Está a crescer" });
    expect(byCode.GROWTH.text).toContain("subiu 22.000,00 MT (+183,3%) e está em 34.000,00 MT");
    // Meio do mês: o normal seriam 4.000; gastou 2.000
    expect(byCode.PACE).toMatchObject({ tone: "success", title: "Este mês vai dentro do ritmo" });
    expect(byCode.FORECAST).toMatchObject({ tone: "success", link: "/previsao" });
  });

  it("avisa do mês no vermelho, nos alertas e no assistente", async () => {
    clock.set(`${Y}-09-15T10:00:00Z`);
    const { auth, bank, cat } = await setup("0");
    await history(auth, bank, cat, "18000");
    await api()
      .post("/api/v1/recurring")
      .set(auth)
      .send({ type: "EXPENSE", description: "Prestação do carro", amount: "6000", accountId: bank.id, categoryId: cat("Transporte"), frequency: "MONTHLY", startDate: `${Y}-10-20`, commitment: true })
      .expect(201);

    const { body } = await api().get("/api/v1/dashboard/advisor").set(auth).expect(200);
    const forecast = body.items.find((i: { code: string }) => i.code === "FORECAST");
    expect(forecast).toMatchObject({ tone: "danger", title: "Outubro fica no vermelho" });
    expect(forecast.text).toContain("As prestações deste mês (6.000,00 MT) ficam em risco");

    const alerts = (await api().get("/api/v1/alerts").set(auth).expect(200)).body.items;
    expect(alerts).toEqual(expect.arrayContaining([expect.objectContaining({ id: `forecast:${Y}-10:negative`, kind: "FORECAST", severity: "critical", href: "/previsao" })]));

    // Desligado nas definições, o alerta desaparece
    const settings = (await api().get("/api/v1/alerts/settings").set(auth).expect(200)).body;
    await api().put("/api/v1/alerts/settings").set(auth).send({ ...settings, forecastAlerts: false }).expect(200);
    const after = (await api().get("/api/v1/alerts").set(auth).expect(200)).body.items;
    expect(after.some((a: { kind: string }) => a.kind === "FORECAST")).toBe(false);

    const me = (await api().get("/api/v1/auth/me").set(auth).expect(200)).body;
    const answer = await offlineAnswer("Como estão as minhas finanças?", me.id);
    expect(answer).toContain("🔴 **Outubro fica no vermelho.**");
    expect(answer).toContain("[Ver previsão](/previsao)");
  });
});
