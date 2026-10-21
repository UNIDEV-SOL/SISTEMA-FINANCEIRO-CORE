import { addTransaction, api, setSetting, setup } from "./helpers";

const names = (page: { content: { name: string }[] }) => page.content.map((i) => i.name);

describe("paginação", () => {
  it("devolve a forma Page e respeita page/size", async () => {
    const { auth } = await setup();
    const first = (await api().get("/api/v1/categories?size=5").set(auth).expect(200)).body;
    expect(first).toEqual({
      content: expect.any(Array),
      page: 0,
      size: 5,
      totalItems: 14,
      totalPages: 3,
      hasNext: true,
      hasPrevious: false,
    });
    expect(first.content).toHaveLength(5);
    expect(first.content[0].name).toBe("Salário");

    const last = (await api().get("/api/v1/categories?size=5&page=2").set(auth)).body;
    expect(last).toMatchObject({ page: 2, hasNext: false, hasPrevious: true });
    expect(last.content).toHaveLength(4);

    const beyond = (await api().get("/api/v1/categories?size=5&page=9").set(auth)).body;
    expect(beyond).toMatchObject({ content: [], totalItems: 14, hasNext: false });
  });

  it("usa o tamanho por omissão e limita ao máximo dos parâmetros", async () => {
    const { auth } = await setup();
    await setSetting("pagination.defaultSize", 3);
    expect((await api().get("/api/v1/categories").set(auth)).body.size).toBe(3);
    await setSetting("pagination.maxSize", 10);
    const clamped = (await api().get("/api/v1/categories?size=500").set(auth)).body;
    expect(clamped).toMatchObject({ size: 10, totalPages: 2 });
    expect(clamped.content).toHaveLength(10);
  });

  it("valida page, size e sort", async () => {
    const { auth } = await setup();
    const bad = await api().get("/api/v1/categories?page=-1&size=0&sort=password,asc").set(auth).expect(422);
    expect(bad.body.errors.map((e: { field: string }) => e.field).sort()).toEqual(["page", "size", "sort"]);
    expect(bad.body.errors.find((e: { field: string }) => e.field === "sort").message).toBe(
      "Ordenação inválida. Use um destes campos: createdAt, name, kind (ex.: createdAt,desc).",
    );
    await api().get("/api/v1/categories?sort=name,sideways").set(auth).expect(422);
    await api().get("/api/v1/categories?kind=OUTRO").set(auth).expect(422);
  });

  it("ordena pelos campos permitidos e filtra por tipo e pesquisa", async () => {
    const { auth } = await setup();
    const byName = (await api().get("/api/v1/categories?kind=INCOME&sort=name,desc").set(auth)).body;
    expect(names(byName)).toEqual(["Salário", "Outros rendimentos", "Negócios extra"]);
    const asc = (await api().get("/api/v1/categories?kind=INCOME&sort=name").set(auth)).body;
    expect(names(asc)).toEqual(["Negócios extra", "Outros rendimentos", "Salário"]);
    const search = (await api().get("/api/v1/categories?kind=EXPENSE&search=PÃO").set(auth)).body;
    expect(names(search)).toEqual(["Pão e mercearia"]);
  });

  it("pesquisa contas pelo nome e instituição", async () => {
    const { auth } = await setup();
    await api().post("/api/v1/accounts").set(auth).send({ name: "Carteira M-Pesa", type: "MOBILE_WALLET", color: "#dc2626", institution: "Vodacom" });
    await api().post("/api/v1/accounts").set(auth).send({ name: "Poupança", type: "SAVINGS", color: "#9333ea", institution: "BCI" });
    expect(names((await api().get("/api/v1/accounts?search=mpesa").set(auth)).body)).toEqual([]);
    expect(names((await api().get("/api/v1/accounts?search=m-pe").set(auth)).body)).toEqual(["Carteira M-Pesa"]);
    expect(names((await api().get("/api/v1/accounts?search=bci").set(auth)).body)).toEqual(["Poupança"]);
    expect(names((await api().get("/api/v1/accounts?sort=name,asc").set(auth)).body)).toEqual(["Banco", "Carteira M-Pesa", "Poupança"]);
  });

  it("pesquisa metas e investimentos", async () => {
    const { auth } = await setup();
    for (const name of ["Férias", "Carro", "Fundo de emergência"])
      await api().post("/api/v1/goals").set(auth).send({ name, color: "#2563eb", target: "1000" }).expect(201);
    expect(names((await api().get("/api/v1/goals?search=fundo").set(auth)).body)).toEqual(["Fundo de emergência"]);
    expect(names((await api().get("/api/v1/goals?sort=name,asc&size=2").set(auth)).body)).toEqual(["Carro", "Férias"]);

    await api().post("/api/v1/investments").set(auth).send({ name: "OT 2026", type: "TREASURY_BONDS", institution: "BVM", invested: "1000", startDate: "2026-01-01" }).expect(201);
    await api().post("/api/v1/investments").set(auth).send({ name: "Depósito", type: "TERM_DEPOSIT", institution: "BCI", invested: "500", startDate: "2026-02-01" }).expect(201);
    expect(names((await api().get("/api/v1/investments?search=bvm").set(auth)).body)).toEqual(["OT 2026"]);
    expect(names((await api().get("/api/v1/investments?type=TERM_DEPOSIT").set(auth)).body)).toEqual(["Depósito"]);
    expect(names((await api().get("/api/v1/investments?sort=invested,asc").set(auth)).body)).toEqual(["Depósito", "OT 2026"]);
  });

  it("transações: os totais cobrem todo o filtro, não só a página", async () => {
    const { auth, bank, cat } = await setup();
    const base = { accountId: bank.id, status: "CLEARED" };
    for (let day = 1; day <= 5; day++)
      await addTransaction(auth, { ...base, type: "EXPENSE", description: `Despesa ${day}`, amount: "100", date: `2026-09-0${day}`, categoryId: cat("Supermercado") });
    await addTransaction(auth, { ...base, type: "INCOME", description: "Salário", amount: "1000", date: "2026-09-10", categoryId: cat("Salário"), notes: "mensal" });

    const page = (await api().get("/api/v1/transactions?month=2026-09&size=2").set(auth).expect(200)).body;
    expect(page).toMatchObject({ page: 0, size: 2, totalItems: 6, totalPages: 3, hasNext: true });
    expect(page.content.map((t: { description: string }) => t.description)).toEqual(["Salário", "Despesa 5"]);
    expect(page.totals).toEqual({ income: "1000.00", expense: "500.00", net: "500.00" });

    const second = (await api().get("/api/v1/transactions?month=2026-09&size=2&page=1").set(auth)).body;
    expect(second.content.map((t: { description: string }) => t.description)).toEqual(["Despesa 4", "Despesa 3"]);
    expect(second.totals).toEqual(page.totals);

    const byAmount = (await api().get("/api/v1/transactions?month=2026-09&sort=amount,desc&size=1").set(auth)).body;
    expect(byAmount.content[0].description).toBe("Salário");

    const search = (await api().get("/api/v1/transactions?month=2026-09&search=MENSAL").set(auth)).body;
    expect(search).toMatchObject({ totalItems: 1, totals: { income: "1000.00", expense: "0.00", net: "1000.00" } });
    // `q` continua a funcionar
    expect((await api().get("/api/v1/transactions?month=2026-09&q=despesa").set(auth)).body.totalItems).toBe(5);
    await api().get("/api/v1/transactions?sort=categoryId,asc").set(auth).expect(422);

    const badId = (await api().get("/api/v1/transactions?accountId=lixo").set(auth).expect(200)).body;
    expect(badId).toMatchObject({ content: [], totalItems: 0, totals: { income: "0.00" } });
  });
});
