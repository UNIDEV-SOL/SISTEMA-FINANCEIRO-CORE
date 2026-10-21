import { firstIndexAfter, monthlyEquivalent, occurrenceDate } from "../src/modules/recurring/recurring.schedule";
import { recurringService } from "../src/modules/recurring/recurring.service";
import { accessPolicy } from "../src/shared/access/policy";
import { prisma } from "../src/shared/db/prisma";
import { clock } from "../src/shared/lib/clock";
import { currentYear } from "../src/shared/lib/dates";
import { api, openYear, setSetting, setup } from "./helpers";

type Auth = Record<string, string>;

const Y = currentYear();

afterEach(() => clock.reset());

/** "Hoje" a meio do dia em Maputo, para o fuso não mudar a data. */
const today = (iso: string) => clock.set(`${iso}T10:00:00Z`);

const salary = (bank: { id: string }, cat: (n: string) => string, extra: Record<string, unknown> = {}) => ({
  type: "INCOME",
  description: "Salário",
  amount: "15000",
  accountId: bank.id,
  categoryId: cat("Salário"),
  frequency: "MONTHLY",
  startDate: `${Y}-01-25`,
  ...extra,
});

async function occurrences(id: string) {
  const rows = await prisma.transaction.findMany({ where: { recurringId: id }, orderBy: { date: "asc" } });
  return rows.map((t) => [t.date.toISOString().slice(0, 10), t.status, t.amount.toFixed(2)]);
}

const create = async (auth: Auth, body: Record<string, unknown>) => (await api().post("/api/v1/recurring").set(auth).send(body).expect(201)).body;

describe("recorrentes — calendário", () => {
  const monthly = { frequency: "MONTHLY" as const, interval: 1, startDate: "2028-01-31" };

  it("o dia 31 cai no último dia dos meses curtos e volta a 31 depois", () => {
    expect([0, 1, 2, 3].map((n) => occurrenceDate(monthly, n))).toEqual(["2028-01-31", "2028-02-29", "2028-03-31", "2028-04-30"]);
  });

  it("semanal, de 2 em 2 meses e anual (29 de Fevereiro)", () => {
    expect(occurrenceDate({ frequency: "WEEKLY", interval: 1, startDate: "2026-12-28" }, 1)).toBe("2027-01-04");
    expect(occurrenceDate({ frequency: "MONTHLY", interval: 2, startDate: "2026-11-15" }, 1)).toBe("2027-01-15");
    expect(occurrenceDate({ frequency: "YEARLY", interval: 1, startDate: "2028-02-29" }, 1)).toBe("2029-02-28");
  });

  it("primeira ocorrência depois de uma data", () => {
    expect(firstIndexAfter(monthly, "2027-12-01")).toBe(0);
    expect(firstIndexAfter(monthly, "2028-02-29")).toBe(2);
    expect(firstIndexAfter(monthly, "2028-03-30")).toBe(2);
    expect(firstIndexAfter({ frequency: "WEEKLY", interval: 1, startDate: "2026-01-01" }, "2026-12-31")).toBe(53);
  });

  it("equivalente mensal", () => {
    expect(monthlyEquivalent("1000", "WEEKLY", 1).toFixed(2)).toBe("4333.33");
    expect(monthlyEquivalent("1200", "YEARLY", 1).toFixed(2)).toBe("100.00");
    expect(monthlyEquivalent("3000", "MONTHLY", 3).toFixed(2)).toBe("1000.00");
  });
});

describe("recorrentes — geração", () => {
  it("com início no passado, gera logo as ocorrências até hoje, liquidadas e ligadas à recorrente", async () => {
    today(`${Y}-03-10`);
    const { auth, bank, cat } = await setup();
    const rule = await create(auth, salary(bank, cat));
    expect(rule).toMatchObject({ nextDate: `${Y}-03-25`, occurrences: 2, monthlyAmount: "15000.00", active: true, autoConfirm: true, interval: 1 });
    expect(await occurrences(rule.id)).toEqual([
      [`${Y}-01-25`, "CLEARED", "15000.00"],
      [`${Y}-02-25`, "CLEARED", "15000.00"],
    ]);

    const { body } = await api().get(`/api/v1/transactions?month=${Y}-02`).set(auth).expect(200);
    expect(body.content).toEqual([expect.objectContaining({ description: "Salário", recurringId: rule.id, status: "CLEARED" })]);
  });

  it("aparece como prevista `recurring.daysAhead` dias antes e liquida-se no dia", async () => {
    today(`${Y}-03-10`);
    const { auth, bank, cat } = await setup();
    const rule = await create(auth, salary(bank, cat, { startDate: `${Y}-03-25` }));
    expect(rule.occurrences).toBe(0);

    today(`${Y}-03-18`);
    await recurringService.materialize();
    expect(await occurrences(rule.id)).toEqual([[`${Y}-03-25`, "PENDING", "15000.00"]]);

    today(`${Y}-03-25`);
    await recurringService.materialize();
    expect(await occurrences(rule.id)).toEqual([[`${Y}-03-25`, "CLEARED", "15000.00"]]);
  });

  it("sem autoConfirm, fica prevista até ser confirmada; a antecedência vem dos parâmetros", async () => {
    await setSetting("recurring.daysAhead", 0);
    today(`${Y}-03-10`);
    const { auth, bank, cat } = await setup();
    const rule = await create(auth, salary(bank, cat, { startDate: `${Y}-03-12`, autoConfirm: false }));

    today(`${Y}-03-11`);
    await recurringService.materialize();
    expect(await occurrences(rule.id)).toEqual([]);

    today(`${Y}-03-14`);
    await recurringService.materialize();
    expect(await occurrences(rule.id)).toEqual([[`${Y}-03-12`, "PENDING", "15000.00"]]);
  });

  it("corridas em simultâneo não duplicam ocorrências", async () => {
    today(`${Y}-06-10`);
    const { auth, bank, cat } = await setup();
    const rule = await create(auth, salary(bank, cat, { startDate: `${Y}-07-01`, frequency: "WEEKLY" }));
    await prisma.recurringTransaction.update({ where: { id: rule.id }, data: { startDate: new Date(`${Y}-01-01T00:00:00Z`), nextDate: new Date(`${Y}-01-01T00:00:00Z`) } });
    await Promise.all([recurringService.materialize(), recurringService.materialize(), recurringService.materialize()]);
    const dates = (await occurrences(rule.id)).map(([d]) => d);
    expect(new Set(dates).size).toBe(dates.length);
    expect(dates.at(-1)! <= `${Y}-06-17`).toBe(true);
  });

  it("ocorrências em anos fechados são saltadas; acaba na data de fim", async () => {
    today(`${Y}-02-10`);
    const { auth, bank, cat } = await setup();
    const rule = await create(auth, salary(bank, cat, { startDate: `${Y - 1}-12-05`, endDate: `${Y}-02-05` }));
    expect(await occurrences(rule.id)).toEqual([
      [`${Y}-01-05`, "CLEARED", "15000.00"],
      [`${Y}-02-05`, "CLEARED", "15000.00"],
    ]);
    expect(rule.nextDate).toBeNull();
  });

  it("recorrentes inactivas ou com conta arquivada não geram", async () => {
    today(`${Y}-03-10`);
    const { auth, bank, cat } = await setup();
    const inactive = await create(auth, salary(bank, cat, { active: false }));
    expect(inactive.occurrences).toBe(0);

    const active = await create(auth, salary(bank, cat, { startDate: `${Y}-04-01` }));
    await api().delete(`/api/v1/accounts/${bank.id}`).set(auth).expect(204);
    today(`${Y}-04-02`);
    await recurringService.materialize();
    expect(await occurrences(active.id)).toEqual([]);
  });
});

describe("recorrentes — alterar, saltar e apagar", () => {
  it("alterar refaz as futuras previstas e mantém as passadas", async () => {
    today(`${Y}-03-20`);
    const { auth, bank, cat } = await setup();
    const rule = await create(auth, salary(bank, cat, { startDate: `${Y}-02-25` }));
    expect(await occurrences(rule.id)).toEqual([
      [`${Y}-02-25`, "CLEARED", "15000.00"],
      [`${Y}-03-25`, "PENDING", "15000.00"],
    ]);

    const { body } = await api().put(`/api/v1/recurring/${rule.id}`).set(auth).send(salary(bank, cat, { startDate: `${Y}-02-25`, amount: "16500" })).expect(200);
    expect(body).toMatchObject({ amount: "16500.00", nextDate: `${Y}-04-25`, occurrences: 2 });
    expect(await occurrences(rule.id)).toEqual([
      [`${Y}-02-25`, "CLEARED", "15000.00"],
      [`${Y}-03-25`, "PENDING", "16500.00"],
    ]);
  });

  it("desactivar apaga as futuras previstas; reactivar continua depois de hoje, sem recuperar o intervalo", async () => {
    today(`${Y}-03-20`);
    const { auth, bank, cat } = await setup();
    const rule = await create(auth, salary(bank, cat, { startDate: `${Y}-02-25` }));
    await api().put(`/api/v1/recurring/${rule.id}`).set(auth).send(salary(bank, cat, { startDate: `${Y}-02-25`, active: false })).expect(200);
    expect(await occurrences(rule.id)).toEqual([[`${Y}-02-25`, "CLEARED", "15000.00"]]);

    today(`${Y}-06-20`);
    const { body } = await api().put(`/api/v1/recurring/${rule.id}`).set(auth).send(salary(bank, cat, { startDate: `${Y}-02-25` })).expect(200);
    expect(body.nextDate).toBe(`${Y}-07-25`);
    expect(await occurrences(rule.id)).toEqual([
      [`${Y}-02-25`, "CLEARED", "15000.00"],
      [`${Y}-06-25`, "PENDING", "15000.00"],
    ]);
  });

  it("saltar apaga a próxima prevista, ou avança se ainda não foi gerada", async () => {
    today(`${Y}-03-20`);
    const { auth, bank, cat } = await setup();
    const rule = await create(auth, salary(bank, cat, { startDate: `${Y}-03-25` }));
    expect(await occurrences(rule.id)).toEqual([[`${Y}-03-25`, "PENDING", "15000.00"]]);

    const first = await api().post(`/api/v1/recurring/${rule.id}/skip`).set(auth).expect(200);
    expect(first.body).toMatchObject({ nextDate: `${Y}-04-25`, occurrences: 0 });
    const second = await api().post(`/api/v1/recurring/${rule.id}/skip`).set(auth).expect(200);
    expect(second.body.nextDate).toBe(`${Y}-05-25`);
  });

  it("apagar remove as futuras previstas e deixa as outras sem ligação", async () => {
    today(`${Y}-03-20`);
    const { auth, bank, cat } = await setup();
    const rule = await create(auth, salary(bank, cat, { startDate: `${Y}-02-25` }));
    await api().delete(`/api/v1/recurring/${rule.id}`).set(auth).expect(204);
    const left = await prisma.transaction.findMany({ where: { description: "Salário", accountId: bank.id } });
    expect(left.map((t) => [t.date.toISOString().slice(0, 10), t.recurringId])).toEqual([[`${Y}-02-25`, null]]);
    await api().get(`/api/v1/recurring/${rule.id}`).set(auth).expect(404);
  });
});

describe("recorrentes — validação, listagem e acesso", () => {
  it("valida o corpo e as referências juntos", async () => {
    const { auth, bank, cat } = await setup();
    const { body } = await api()
      .post("/api/v1/recurring")
      .set(auth)
      .send({ type: "EXPENSE", description: "", amount: "0", accountId: bank.id, categoryId: cat("Salário"), frequency: "DAILY", interval: 0, startDate: `${Y}-05-10`, endDate: `${Y}-05-01` })
      .expect(422);
    const fields = Object.fromEntries(body.errors.map((e: { field: string; message: string }) => [e.field, e.message]));
    expect(fields).toMatchObject({
      description: "Indique uma descrição.",
      amount: "O valor tem de ser maior que zero.",
      frequency: "Escolha a frequência.",
      interval: "Indique um intervalo entre 1 e 52.",
      categoryId: "A categoria não corresponde ao tipo.",
    });

    const transfer = await api()
      .post("/api/v1/recurring")
      .set(auth)
      .send({ type: "TRANSFER", description: "Poupança", amount: "500", accountId: bank.id, destinationAccountId: bank.id, frequency: "MONTHLY", startDate: `${Y}-05-10`, endDate: `${Y}-05-01` })
      .expect(422);
    expect(transfer.body.errors).toEqual(
      expect.arrayContaining([
        { field: "destinationAccountId", message: "A conta de destino tem de ser diferente." },
        { field: "endDate", message: "O fim tem de ser depois da primeira vez." },
      ]),
    );
  });

  it("lista activas primeiro pela próxima data, com pesquisa, filtros e compromissos mensais", async () => {
    today(`${Y}-03-10`);
    const { auth, bank, cat } = await setup();
    await create(auth, salary(bank, cat, { startDate: `${Y}-03-25` }));
    await create(auth, { type: "EXPENSE", description: "Renda", amount: "12000", accountId: bank.id, categoryId: cat("Renda e casa"), frequency: "MONTHLY", startDate: `${Y}-04-01` });
    await create(auth, { type: "EXPENSE", description: "Pão", amount: "300", accountId: bank.id, categoryId: cat("Pão e mercearia"), frequency: "WEEKLY", startDate: `${Y}-03-12` });
    await create(auth, { type: "EXPENSE", description: "Ginásio", amount: "1500", accountId: bank.id, categoryId: cat("Saúde"), frequency: "MONTHLY", startDate: `${Y}-03-15`, active: false });

    const { body } = await api().get("/api/v1/recurring").set(auth).expect(200);
    expect(body.content.map((r: { description: string }) => r.description)).toEqual(["Pão", "Salário", "Renda", "Ginásio"]);
    expect(body.totals).toEqual({ monthlyIncome: "15000.00", monthlyExpense: "13300.00" });

    const search = await api().get("/api/v1/recurring?search=renda").set(auth).expect(200);
    expect(search.body.totalItems).toBe(1);
    const inactive = await api().get("/api/v1/recurring?active=false").set(auth).expect(200);
    expect(inactive.body.content.map((r: { description: string }) => r.description)).toEqual(["Ginásio"]);
  });

  it("cada pessoa só vê as suas", async () => {
    const a = await setup();
    const b = await setup();
    const rule = await create(a.auth, salary(a.bank, a.cat));
    await api().get(`/api/v1/recurring/${rule.id}`).set(b.auth).expect(404);
    await api().post(`/api/v1/recurring/${rule.id}/skip`).set(b.auth).expect(404);
    expect((await api().get("/api/v1/recurring").set(b.auth).expect(200)).body.totalItems).toBe(0);
  });

  it("saltar exige a acção EDIT na funcionalidade RECURRING", async () => {
    const { auth, bank, cat, user } = await setup();
    const rule = await create(auth, salary(bank, cat));
    const profile = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { profileId: true } });
    const functionality = await prisma.functionality.findUniqueOrThrow({ where: { code: "RECURRING" } });
    await prisma.profileFunctionality.update({
      where: { profileId_functionalityId: { profileId: profile.profileId, functionalityId: functionality.id } },
      data: { actions: ["VIEW", "CREATE"] },
    });
    accessPolicy.invalidate();
    await api().post(`/api/v1/recurring/${rule.id}/skip`).set(auth).expect(403);
  });
});

// Garante que o ano anterior não foi aberto por engano noutro teste deste ficheiro
it("por omissão só o ano corrente está aberto", async () => {
  await openYear(Y);
  expect((await prisma.period.findMany({ where: { status: "OPEN" } })).map((p) => p.year)).toEqual([Y]);
});
