import { prisma } from "../src/shared/db/prisma";
import { fromIsoDate } from "../src/shared/lib/dates";
import { accountBalances } from "../src/modules/accounts/accounts.ledger";
import { api, signUp } from "./helpers";

const bank = { name: "Conta ordenado", type: "BANK", institution: "BCI", color: "#2563eb", initialBalance: "18500,50", includeInTotal: true };

describe("accounts", () => {
  it("cria, lista, actualiza e arquiva", async () => {
    const { auth } = await signUp();

    const created = await api().post("/api/v1/accounts").set(auth).send(bank).expect(201);
    expect(created.body).toMatchObject({ name: "Conta ordenado", initialBalance: "18500.50", balance: "18500.50", archived: false });

    const id = created.body.id;
    const updated = await api()
      .put(`/api/v1/accounts/${id}`)
      .set(auth)
      .send({ ...bank, name: "BCI", institution: "", initialBalance: "100" })
      .expect(200);
    expect(updated.body).toMatchObject({ name: "BCI", initialBalance: "100.00", balance: "100.00" });
    expect(updated.body.institution).toBeUndefined();

    await api().delete(`/api/v1/accounts/${id}`).set(auth).expect(204);
    const list = await api().get("/api/v1/accounts").set(auth).expect(200);
    expect(list.body.content).toEqual([]);
    expect(list.body.totalItems).toBe(0);
    await api().put(`/api/v1/accounts/${id}`).set(auth).send(bank).expect(404);
  });

  it("não deixa mexer em contas de outro utilizador", async () => {
    const ana = await signUp();
    const rui = await signUp();
    const { body } = await api().post("/api/v1/accounts").set(ana.auth).send(bank).expect(201);
    await api().put(`/api/v1/accounts/${body.id}`).set(rui.auth).send(bank).expect(404);
    await api().delete(`/api/v1/accounts/${body.id}`).set(rui.auth).expect(404);
  });

  it("valida o corpo com erros por campo", async () => {
    const { auth } = await signUp();
    const res = await api().post("/api/v1/accounts").set(auth).send({ name: "", type: "XPTO", color: "azul", initialBalance: "1.234" }).expect(422);
    const fields = res.body.errors.map((e: { field: string }) => e.field).sort();
    expect(fields).toEqual(["color", "initialBalance", "name", "type"]);
  });

  it("calcula o saldo só com transações liquidadas, incluindo transferências", async () => {
    const { auth, user } = await signUp();
    const a = (await api().post("/api/v1/accounts").set(auth).send({ ...bank, initialBalance: "1000" })).body;
    const b = (await api().post("/api/v1/accounts").set(auth).send({ ...bank, name: "M-Pesa", initialBalance: "50" })).body;
    const [salary, food] = await Promise.all([
      prisma.category.findFirstOrThrow({ where: { userId: user.id, name: "Salário" } }),
      prisma.category.findFirstOrThrow({ where: { userId: user.id, name: "Supermercado" } }),
    ]);

    const base = { userId: user.id, description: "x" };
    await prisma.transaction.createMany({
      data: [
        { ...base, type: "INCOME", amount: "500.25", date: fromIsoDate("2026-10-01"), accountId: a.id, categoryId: salary.id, status: "CLEARED" },
        { ...base, type: "EXPENSE", amount: "120.10", date: fromIsoDate("2026-10-05"), accountId: a.id, categoryId: food.id, status: "CLEARED" },
        { ...base, type: "EXPENSE", amount: "999.00", date: fromIsoDate("2026-10-06"), accountId: a.id, categoryId: food.id, status: "PENDING" },
        { ...base, type: "TRANSFER", amount: "200.00", date: fromIsoDate("2026-10-10"), accountId: a.id, destinationAccountId: b.id, status: "CLEARED" },
      ],
    });

    const list = await api().get("/api/v1/accounts").set(auth).expect(200);
    const byId = Object.fromEntries(list.body.content.map((acc: { id: string; balance: string }) => [acc.id, acc.balance]));
    expect(byId[a.id]).toBe("1180.15"); // 1000 + 500.25 − 120.10 − 200
    expect(byId[b.id]).toBe("250.00");

    const before = await accountBalances(user.id, "2026-10-05");
    expect(before.get(a.id)?.toFixed(2)).toBe("1380.15");
    expect(before.get(b.id)?.toFixed(2)).toBe("50.00");
  });

  it("a base de dados recusa transferências para a própria conta", async () => {
    const { auth, user } = await signUp();
    const a = (await api().post("/api/v1/accounts").set(auth).send(bank)).body;
    await expect(
      prisma.transaction.create({
        data: { userId: user.id, description: "x", type: "TRANSFER", amount: "1", date: new Date(), accountId: a.id, destinationAccountId: a.id },
      }),
    ).rejects.toThrow();
  });
});
