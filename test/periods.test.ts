import { periodsService } from "../src/modules/periods/periods.service";
import { seedReferenceData } from "../src/seed/reference-data";
import { prisma } from "../src/shared/db/prisma";
import { clock } from "../src/shared/lib/clock";
import { currentYear } from "../src/shared/lib/dates";
import { addTransaction, api, auditRows, openYear, setSetting, setup, signUpAs } from "./helpers";

type Auth = Record<string, string>;

const Y = currentYear();
const closedDetail = (year: number) => `O ano ${year} está fechado: pode consultar, mas não alterar.`;

afterEach(() => clock.reset());

const expense = (bank: { id: string }, cat: (n: string) => string, date: string) => ({
  type: "EXPENSE",
  amount: "100",
  date,
  accountId: bank.id,
  categoryId: cat("Saúde"),
  description: "Farmácia",
  status: "CLEARED",
});

describe("períodos — leitura e seed", () => {
  it("o seed abre o ano corrente; GET /periods lista do mais recente para o mais antigo", async () => {
    const { auth } = await setup();
    await prisma.period.create({ data: { year: Y - 1, status: "CLOSED" } });
    const { body } = await api().get("/api/v1/periods").set(auth).expect(200);
    expect(body.current).toBe(Y);
    expect(body.items).toEqual([
      expect.objectContaining({ year: Y, status: "OPEN", isCurrent: true, updatedBy: null }),
      expect.objectContaining({ year: Y - 1, status: "CLOSED", isCurrent: false }),
    ]);
  });

  it("o seed regista os anos com dados: os anteriores fechados, os seguintes abertos", async () => {
    const { user, bank, cat } = await setup();
    const row = (date: string) => ({ ...expense(bank, cat, date), userId: user.id, date: new Date(`${date}T00:00:00Z`), type: "EXPENSE" as const, status: "CLEARED" as const });
    await prisma.transaction.createMany({ data: [row(`${Y - 2}-03-01`), row(`${Y + 1}-01-05`)] });
    await seedReferenceData();
    const periods = await prisma.period.findMany({ orderBy: { year: "asc" } });
    expect(periods.map((p) => [p.year, p.status, p.isCurrent])).toEqual([
      [Y - 2, "CLOSED", false],
      [Y, "OPEN", true],
      [Y + 1, "OPEN", false],
    ]);
  });
});

describe("períodos — regra de escrita", () => {
  it("ano fechado ou inexistente → 409 com erro no campo; reabrir permite", async () => {
    const { auth, bank, cat } = await setup();
    const admin = await signUpAs("SUPER_ADMIN");
    await api().post("/api/v1/admin/periods").set(admin.auth).send({ year: Y - 1, status: "CLOSED" }).expect(201);

    const closed = await api().post("/api/v1/transactions").set(auth).send(expense(bank, cat, `${Y - 1}-06-01`)).expect(409);
    expect(closed.headers["content-type"]).toContain("application/problem+json");
    expect(closed.body).toMatchObject({ status: 409, detail: closedDetail(Y - 1), errors: [{ field: "date", message: closedDetail(Y - 1) }] });

    const missing = await api().post("/api/v1/transactions").set(auth).send(expense(bank, cat, `${Y - 2}-06-01`)).expect(409);
    expect(missing.body.detail).toBe(`O ano ${Y - 2} ainda não está aberto: pode consultar, mas não alterar.`);

    // Validação primeiro: o formulário recebe os 422 antes da regra do ano
    await api().post("/api/v1/transactions").set(auth).send({ ...expense(bank, cat, `${Y - 1}-06-01`), amount: "0" }).expect(422);

    await api().patch(`/api/v1/admin/periods/${Y - 1}`).set(admin.auth).send({ status: "OPEN" }).expect(200);
    const old = await addTransaction(auth, expense(bank, cat, `${Y - 1}-06-01`));

    const closedAgain = (await api().patch(`/api/v1/admin/periods/${Y - 1}`).set(admin.auth).send({ status: "CLOSED" }).expect(200)).body;
    expect(closedAgain).toMatchObject({ year: Y - 1, status: "CLOSED", isCurrent: false, hasData: true, updatedBy: { id: admin.user.id } });

    // Mover para o ano aberto também é proibido (a data actual está fechada), sem erro de campo
    const moved = await api().put(`/api/v1/transactions/${old.id}`).set(auth).send(expense(bank, cat, `${Y}-01-15`)).expect(409);
    expect(moved.body.detail).toBe(closedDetail(Y - 1));
    expect(moved.body.errors).toBeUndefined();
    await api().delete(`/api/v1/transactions/${old.id}`).set(auth).expect(409);

    // E entrar num ano fechado a partir do aberto
    const recent = await addTransaction(auth, expense(bank, cat, `${Y}-01-15`));
    const into = await api().put(`/api/v1/transactions/${recent.id}`).set(auth).send(expense(bank, cat, `${Y - 1}-12-31`)).expect(409);
    expect(into.body.errors).toEqual([{ field: "date", message: closedDetail(Y - 1) }]);

    // As leituras não mudam
    const list = (await api().get(`/api/v1/transactions?month=${Y - 1}-06`).set(auth).expect(200)).body;
    expect(list.content).toHaveLength(1);

    await api().patch(`/api/v1/admin/periods/${Y - 1}`).set(admin.auth).send({ status: "OPEN" }).expect(200);
    await api().delete(`/api/v1/transactions/${old.id}`).set(auth).expect(204);
  });

  it("o super administrador também respeita os anos fechados", async () => {
    const admin = await signUpAs("SUPER_ADMIN");
    const bank = (await api().post("/api/v1/accounts").set(admin.auth).send({ name: "Banco", type: "BANK", color: "#2563eb", initialBalance: "0" }).expect(201)).body;
    const categories = await prisma.category.findMany({ where: { userId: admin.user.id } });
    const cat = (n: string) => categories.find((c) => c.name === n)!.id;
    await api().post("/api/v1/admin/periods").set(admin.auth).send({ year: Y - 1, status: "CLOSED" }).expect(201);
    await api().post("/api/v1/transactions").set(admin.auth).send(expense(bank, cat, `${Y - 1}-02-01`)).expect(409);
  });

  it("aplica-se a contribuições, avaliações e início de investimentos", async () => {
    const { auth } = await setup();
    await prisma.period.create({ data: { year: Y - 1, status: "CLOSED" } });

    const goal = (await api().post("/api/v1/goals").set(auth).send({ name: "Carro", icon: "car", color: "#2563eb", target: "1000" }).expect(201)).body;
    const contribution = await api().post(`/api/v1/goals/${goal.id}/contributions`).set(auth).send({ amount: "10", date: `${Y - 1}-05-01` }).expect(409);
    expect(contribution.body.errors).toEqual([{ field: "date", message: closedDetail(Y - 1) }]);

    const investment = { name: "Depósito", type: "TERM_DEPOSIT", invested: "1000", startDate: `${Y - 1}-03-01` };
    const start = await api().post("/api/v1/investments").set(auth).send(investment).expect(409);
    expect(start.body.errors).toEqual([{ field: "startDate", message: closedDetail(Y - 1) }]);

    // Criado com o ano aberto; depois de fechado, só muda o que não toca no ano fechado
    await openYear(Y - 1);
    const created = (await api().post("/api/v1/investments").set(auth).send(investment).expect(201)).body;
    await prisma.period.update({ where: { year: Y - 1 }, data: { status: "CLOSED" } });
    await api().put(`/api/v1/investments/${created.id}`).set(auth).send({ ...investment, name: "Depósito BCI" }).expect(200);
    await api().put(`/api/v1/investments/${created.id}`).set(auth).send({ ...investment, invested: "2000" }).expect(409);
    await api().put(`/api/v1/investments/${created.id}`).set(auth).send({ ...investment, startDate: `${Y}-01-02` }).expect(409);
    const valuation = await api().post(`/api/v1/investments/${created.id}/valuations`).set(auth).send({ date: `${Y - 1}-12-31`, value: "1050" }).expect(409);
    expect(valuation.body.errors).toEqual([{ field: "date", message: closedDetail(Y - 1) }]);
  });
});

describe("períodos — administração", () => {
  it("cria, marca o corrente e apaga com as regras", async () => {
    const admin = await signUpAs("SUPER_ADMIN");
    const user = await setup();
    await api().get("/api/v1/admin/periods").set(user.auth).expect(403);
    await api().post("/api/v1/admin/periods").set(user.auth).send({ year: Y + 1 }).expect(403);

    const next = (await api().post("/api/v1/admin/periods").set(admin.auth).send({ year: Y + 1 }).expect(201)).body;
    expect(next).toMatchObject({ year: Y + 1, status: "OPEN", isCurrent: false, hasData: false });
    const dup = await api().post("/api/v1/admin/periods").set(admin.auth).send({ year: Y + 1, status: "CLOSED" }).expect(422);
    expect(dup.body.errors).toEqual([{ field: "year", message: `O ano ${Y + 1} já existe.` }]);
    await api().post("/api/v1/admin/periods").set(admin.auth).send({ year: 1999 }).expect(422);

    const list = (await api().get("/api/v1/admin/periods").set(admin.auth).expect(200)).body;
    expect(list.map((p: { year: number }) => p.year)).toEqual([Y + 1, Y]);

    const keep = await api().patch(`/api/v1/admin/periods/${Y}`).set(admin.auth).send({ isCurrent: false }).expect(422);
    expect(keep.body.errors[0].field).toBe("isCurrent");
    await api().delete(`/api/v1/admin/periods/${Y}`).set(admin.auth).expect(409);

    // Ano anterior como corrente: só sem a abertura automática
    await api().post("/api/v1/admin/periods").set(admin.auth).send({ year: Y - 1 }).expect(201);
    await api().patch(`/api/v1/admin/periods/${Y - 1}`).set(admin.auth).send({ isCurrent: true }).expect(409);
    await setSetting("periods.autoCreate", false);
    await api().patch(`/api/v1/admin/periods/${Y - 1}`).set(admin.auth).send({ isCurrent: true }).expect(200);
    expect(await prisma.period.findMany({ where: { isCurrent: true } })).toEqual([expect.objectContaining({ year: Y - 1 })]);
    expect((await api().get("/api/v1/periods").set(user.auth)).body.current).toBe(Y - 1);
    await api().patch(`/api/v1/admin/periods/${Y}`).set(admin.auth).send({ isCurrent: true }).expect(200);

    // Com registos não se apaga
    await addTransaction(user.auth, expense(user.bank, user.cat, `${Y + 1}-01-05`));
    const used = await api().delete(`/api/v1/admin/periods/${Y + 1}`).set(admin.auth).expect(409);
    expect(used.body.detail).toBe(`O ano ${Y + 1} tem registos e não pode ser apagado. Feche-o em vez de o apagar.`);
    await api().delete(`/api/v1/admin/periods/${Y - 1}`).set(admin.auth).expect(204);
    await api().delete(`/api/v1/admin/periods/${Y - 1}`).set(admin.auth).expect(404);

    const rows = await auditRows();
    expect(rows.find((r) => r.method === "PATCH" && r.statusCode === 200)).toMatchObject({ action: "EDIT", functionalityCode: "ADMIN_PERIODS", actorId: admin.user.id });
  });
});

describe("períodos — passagem de ano", () => {
  const newYear = () => clock.set(`${Y + 1}-01-02T08:00:00Z`);

  it("abre o novo ano, passa-o a corrente e fecha o anterior no primeiro pedido", async () => {
    const { auth, bank, cat } = await setup();
    const before = await addTransaction(auth, expense(bank, cat, `${Y}-12-01`));
    newYear();

    const { body } = await api().get("/api/v1/periods").set(auth).expect(200);
    expect(body.current).toBe(Y + 1);
    expect(body.items.map((p: { year: number; status: string; isCurrent: boolean }) => [p.year, p.status, p.isCurrent])).toEqual([
      [Y + 1, "OPEN", true],
      [Y, "CLOSED", false],
    ]);
    expect(await prisma.period.count({ where: { isCurrent: true } })).toBe(1);

    await api().delete(`/api/v1/transactions/${before.id}`).set(auth).expect(409);
    await addTransaction(auth, expense(bank, cat, `${Y + 1}-01-02`));

    // Várias verificações em simultâneo não criam dois correntes
    await Promise.all([periodsService.ensureCurrent(), periodsService.ensureCurrent(), periodsService.ensureCurrent()]);
    expect(await prisma.period.count({ where: { isCurrent: true } })).toBe(1);
  });

  it("a escrita também faz a passagem; respeita periods.autoClosePrevious", async () => {
    const { auth, bank, cat } = await setup();
    await setSetting("periods.autoClosePrevious", false);
    newYear();
    await addTransaction(auth, expense(bank, cat, `${Y}-12-30`));
    const periods = await prisma.period.findMany({ orderBy: { year: "asc" } });
    expect(periods.map((p) => [p.year, p.status, p.isCurrent])).toEqual([
      [Y, "OPEN", false],
      [Y + 1, "OPEN", true],
    ]);
  });

  it("com periods.autoCreate desligado, nada muda", async () => {
    const { auth, bank, cat } = await setup();
    await setSetting("periods.autoCreate", false);
    newYear();
    expect((await api().get("/api/v1/periods").set(auth)).body.current).toBe(Y);
    const res = await api().post("/api/v1/transactions").set(auth).send(expense(bank, cat, `${Y + 1}-01-02`)).expect(409);
    expect(res.body.detail).toBe(`O ano ${Y + 1} ainda não está aberto: pode consultar, mas não alterar.`);
  });
});

describe("migrações aditivas", () => {
  it("o Dashboard passa de / para /painel só se ainda estiver em /", async () => {
    await prisma.functionality.update({ where: { code: "DASHBOARD" }, data: { path: "/" } });
    await seedReferenceData();
    expect((await prisma.functionality.findUniqueOrThrow({ where: { code: "DASHBOARD" } })).path).toBe("/painel");

    await prisma.functionality.update({ where: { code: "DASHBOARD" }, data: { path: "/inicio" } });
    await seedReferenceData();
    expect((await prisma.functionality.findUniqueOrThrow({ where: { code: "DASHBOARD" } })).path).toBe("/inicio");
  });

  it("funcionalidades novas dão VIEW ao ADMIN só quando são criadas", async () => {
    const admin = await prisma.profile.findUniqueOrThrow({ where: { code: "ADMIN" } });
    const userData = await prisma.functionality.findUniqueOrThrow({ where: { code: "ADMIN_USER_DATA" } });
    expect(await prisma.profileFunctionality.findUnique({ where: { profileId_functionalityId: { profileId: admin.id, functionalityId: userData.id } } })).toMatchObject({
      actions: ["VIEW"],
    });

    // Base antiga: a funcionalidade ainda não existia
    await prisma.profileFunctionality.deleteMany({ where: { functionalityId: userData.id } });
    await prisma.functionality.delete({ where: { id: userData.id } });
    await seedReferenceData();
    const recreated = await prisma.functionality.findUniqueOrThrow({ where: { code: "ADMIN_USER_DATA" } });
    const grant = () => prisma.profileFunctionality.findUnique({ where: { profileId_functionalityId: { profileId: admin.id, functionalityId: recreated.id } } });
    expect(await grant()).toMatchObject({ actions: ["VIEW"] });

    // Retirada pelo admin: o seed seguinte não a repõe
    await prisma.profileFunctionality.delete({ where: { profileId_functionalityId: { profileId: admin.id, functionalityId: recreated.id } } });
    await seedReferenceData();
    expect(await grant()).toBeNull();
  });

  it("parâmetros públicos novos: fuso horário e site", async () => {
    const { body } = await api().get("/api/v1/config/public").expect(200);
    expect(body.settings).toMatchObject({
      "locale.timezone": "Africa/Maputo",
      "site.headline": expect.any(String),
      "site.subheadline": expect.any(String),
      "site.ctaLabel": "Criar conta grátis",
    });
    expect(body.settings["site.faq"]).toHaveLength(5);
    expect(body.settings["site.faq"][0]).toEqual({ question: expect.any(String), answer: expect.any(String) });
    expect(body.settings["periods.autoCreate"]).toBeUndefined();
  });

  it("valida o fuso horário e a lista de perguntas do site", async () => {
    const admin = await signUpAs("SUPER_ADMIN");
    const put = (key: string, value: unknown) => api().put(`/api/v1/admin/settings/${key}`).set(admin.auth as Auth).send({ value });

    expect((await put("locale.timezone", "Marte/Base").expect(422)).body.errors).toEqual([{ field: "value", message: "Fuso horário inválido (ex.: Africa/Maputo)." }]);
    expect((await put("locale.timezone", "Europe/Lisbon").expect(200)).body).toMatchObject({ value: "Europe/Lisbon", constraints: { format: "timezone" } });

    expect((await put("site.faq", [{ question: "Sim?", answer: "" }]).expect(422)).body.errors[0].message).toBe("A pergunta 1 precisa de pergunta e resposta.");
    await put("site.faq", "não é json").expect(422);
    await put("site.faq", { question: "a", answer: "b" }).expect(422);
    const ok = (await put("site.faq", JSON.stringify([{ question: " Grátis? ", answer: "Sim.", extra: 1 }])).expect(200)).body;
    expect(ok).toMatchObject({ type: "JSON", value: [{ question: "Grátis?", answer: "Sim." }] });
    expect((await api().get("/api/v1/config/public")).body.settings["site.faq"]).toEqual([{ question: "Grátis?", answer: "Sim." }]);
  });
});
