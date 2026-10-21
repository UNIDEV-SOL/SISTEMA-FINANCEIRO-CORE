import { addTransaction, api, setup } from "./helpers";

describe("transactions", () => {
  it("lista por mês com totais e filtros", async () => {
    const { auth, bank, cat } = await setup();
    const mpesa = (await api().post("/api/v1/accounts").set(auth).send({ name: "M-Pesa", type: "MOBILE_WALLET", color: "#dc2626" })).body;

    await addTransaction(auth, { type: "INCOME", description: "Salário", amount: "45000", date: "2026-09-05", accountId: bank.id, categoryId: cat("Salário"), status: "CLEARED" });
    await addTransaction(auth, { type: "EXPENSE", description: "Renda", amount: "12000,50", date: "2026-09-07", accountId: bank.id, categoryId: cat("Renda e casa"), status: "PENDING", notes: "  Setembro " });
    await addTransaction(auth, { type: "TRANSFER", description: "Carregamento", amount: "3000", date: "2026-09-06", accountId: bank.id, destinationAccountId: mpesa.id, status: "CLEARED" });
    await addTransaction(auth, { type: "EXPENSE", description: "Outro mês", amount: "1", date: "2026-08-31", accountId: bank.id, categoryId: cat("Saúde"), status: "CLEARED" });

    const all = (await api().get("/api/v1/transactions?month=2026-09").set(auth).expect(200)).body;
    expect(all.content.map((t: { description: string }) => t.description)).toEqual(["Renda", "Carregamento", "Salário"]);
    expect(all.totals).toEqual({ income: "45000.00", expense: "12000.50", net: "32999.50" });
    expect(all.content[0]).toMatchObject({ amount: "12000.50", date: "2026-09-07", status: "PENDING", notes: "Setembro" });
    expect(all.content[1].categoryId).toBeUndefined();

    const toMpesa = (await api().get(`/api/v1/transactions?month=2026-09&accountId=${mpesa.id}`).set(auth)).body;
    expect(toMpesa.content).toHaveLength(1);

    const search = (await api().get("/api/v1/transactions?month=2026-09&q=setem").set(auth)).body;
    expect(search.content.map((t: { description: string }) => t.description)).toEqual(["Renda"]);

    const expenses = (await api().get("/api/v1/transactions?month=2026-09&type=EXPENSE").set(auth)).body;
    expect(expenses.content).toHaveLength(1);
  });

  it("valida as regras de negócio por campo", async () => {
    const { auth, bank, cat } = await setup();
    const base = { description: "x", amount: "10", date: "2026-09-01", accountId: bank.id, status: "CLEARED" };

    const wrongKind = await api().post("/api/v1/transactions").set(auth).send({ ...base, type: "EXPENSE", categoryId: cat("Salário") }).expect(422);
    expect(wrongKind.body.errors).toEqual([{ field: "categoryId", message: "A categoria não corresponde ao tipo." }]);

    const noCategory = await api().post("/api/v1/transactions").set(auth).send({ ...base, type: "INCOME" }).expect(422);
    expect(noCategory.body.errors).toEqual([{ field: "categoryId", message: "Escolha uma categoria." }]);

    const sameAccount = await api().post("/api/v1/transactions").set(auth).send({ ...base, type: "TRANSFER", destinationAccountId: bank.id }).expect(422);
    expect(sameAccount.body.errors).toEqual([{ field: "destinationAccountId", message: "A conta de destino tem de ser diferente." }]);

    const bad = await api().post("/api/v1/transactions").set(auth).send({ type: "EXPENSE", description: "", amount: "0", date: "2026-02-30", accountId: "x" }).expect(422);
    // Erros do corpo e das referências na mesma resposta, como no mock
    expect(bad.body.errors.map((e: { field: string }) => e.field).sort()).toEqual(["accountId", "amount", "categoryId", "date", "description"]);
  });

  it("não aceita contas nem categorias de outro utilizador", async () => {
    const ana = await setup();
    const rui = await setup();
    const res = await api()
      .post("/api/v1/transactions")
      .set(rui.auth)
      .send({ type: "EXPENSE", description: "x", amount: "10", date: "2026-09-01", accountId: ana.bank.id, categoryId: ana.cat("Saúde") })
      .expect(422);
    expect(res.body.errors.map((e: { field: string }) => e.field).sort()).toEqual(["accountId", "categoryId"]);
  });

  it("actualiza, limpa campos que não se aplicam ao tipo e apaga", async () => {
    const { auth, bank, cat } = await setup();
    const other = (await api().post("/api/v1/accounts").set(auth).send({ name: "Carteira", type: "CASH", color: "#16a34a" })).body;
    const t = await addTransaction(auth, { type: "EXPENSE", description: "Pão", amount: "50", date: "2026-09-01", accountId: bank.id, categoryId: cat("Pão e mercearia") });

    const updated = await api()
      .put(`/api/v1/transactions/${t.id}`)
      .set(auth)
      .send({ type: "TRANSFER", description: "Levantamento", amount: "500", date: "2026-09-02", accountId: bank.id, destinationAccountId: other.id, categoryId: cat("Saúde"), status: "CLEARED" })
      .expect(200);
    expect(updated.body.categoryId).toBeUndefined();
    expect(updated.body.destinationAccountId).toBe(other.id);
    expect(updated.body.createdAt).toBe(t.createdAt);

    await api().delete(`/api/v1/transactions/${t.id}`).set(auth).expect(204);
    await api().delete(`/api/v1/transactions/${t.id}`).set(auth).expect(404);
  });

  it("conta arquivada não aceita transações novas, mas as antigas continuam editáveis", async () => {
    const { auth, bank, cat } = await setup();
    const t = await addTransaction(auth, { type: "EXPENSE", description: "Pão", amount: "50", date: "2026-09-01", accountId: bank.id, categoryId: cat("Pão e mercearia") });
    await api().delete(`/api/v1/accounts/${bank.id}`).set(auth).expect(204);

    const body = { type: "EXPENSE", description: "Pão", amount: "60", date: "2026-09-01", accountId: bank.id, categoryId: cat("Pão e mercearia"), status: "CLEARED" };
    await api().post("/api/v1/transactions").set(auth).send(body).expect(422);
    await api().put(`/api/v1/transactions/${t.id}`).set(auth).send(body).expect(200);
  });
});
