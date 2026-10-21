import { prisma } from "../src/shared/db/prisma";
import { api, setSetting, signUp, signUpAs } from "./helpers";

const put = (auth: Record<string, string>, key: string, value: unknown) => api().put(`/api/v1/admin/settings/${key}`).set(auth).send({ value });

describe("configuração pública", () => {
  it("devolve só os parâmetros públicos e as moedas activas, sem sessão", async () => {
    await prisma.currency.update({ where: { code: "ZAR" }, data: { active: false } });
    const { body } = await api().get("/api/v1/config/public").expect(200);
    expect(body.settings).toMatchObject({
      "app.name": "Finanças Smart",
      "auth.registrationEnabled": true,
      "auth.passwordMinLength": 8,
      "locale.defaultCurrency": "MZN",
      "pagination.defaultSize": 20,
      "family.enabled": true,
      "assistant.enabled": true,
      "help.showFaq": true,
    });
    expect(body.settings).not.toHaveProperty("auth.sessionDays");
    expect(body.settings).not.toHaveProperty("assistant.model");
    expect(body.currencies.map((c: { code: string }) => c.code)).toEqual(["MZN", "AOA", "BRL", "EUR", "USD"]);
    expect(body.currencies[0]).toEqual({ code: "MZN", name: "Metical moçambicano", symbol: "MT", decimals: 2, active: true, order: 1 });
  });
});

describe("admin — parâmetros", () => {
  it("lista agrupada, com as opções dinâmicas calculadas", async () => {
    const admin = await signUpAs("SUPER_ADMIN");
    const groups = (await api().get("/api/v1/admin/settings").set(admin.auth).expect(200)).body;
    expect(groups.map((g: { group: string }) => g.group)).toEqual(["app", "auth", "locale", "pagination", "alerts", "emails", "family", "assistant", "help", "periods", "growth", "recurring", "forecast", "advisor", "attachments", "site"]);
    expect(groups[1]).toMatchObject({ label: "Autenticação" });
    const currency = groups[2].items[0];
    expect(currency).toMatchObject({ key: "locale.defaultCurrency", type: "SELECT", value: "MZN", public: true, updatedBy: null });
    expect(currency.options).toContainEqual({ value: "MZN", label: "MZN — Metical moçambicano" });
    const profile = groups[6].items.find((s: { key: string }) => s.key === "family.dependentProfile");
    expect(profile.options.map((o: { value: string }) => o.value)).not.toContain("SUPER_ADMIN");
    const effort = groups[7].items.find((s: { key: string }) => s.key === "assistant.effort");
    expect(effort.options).toEqual([
      { value: "low", label: "Baixo" },
      { value: "medium", label: "Médio" },
      { value: "high", label: "Alto" },
    ]);
  });

  it("valida o valor pelo tipo e pelas regras", async () => {
    const admin = await signUpAs("SUPER_ADMIN", "Chefe");
    const error = async (key: string, value: unknown) => (await put(admin.auth, key, value).expect(422)).body.errors[0];

    expect(await error("pagination.defaultSize", "abc")).toEqual({ field: "value", message: "Indique um número." });
    expect(await error("pagination.defaultSize", 2.5)).toEqual({ field: "value", message: "Indique um número inteiro." });
    expect(await error("pagination.defaultSize", 0)).toEqual({ field: "value", message: "O valor mínimo é 1." });
    expect(await error("pagination.defaultSize", 101)).toEqual({ field: "value", message: "Não pode ser maior que o máximo de itens por página." });
    expect(await error("auth.registrationEnabled", "sim")).toEqual({ field: "value", message: "Indique sim ou não." });
    expect(await error("assistant.effort", "max")).toEqual({ field: "value", message: "Escolha uma das opções." });
    expect(await error("locale.defaultCurrency", "XYZ")).toEqual({ field: "value", message: "Escolha uma das opções." });
    expect(await error("app.supportEmail", "nao-e-email")).toEqual({ field: "value", message: "Email inválido." });
    expect(await error("app.name", "   ")).toEqual({ field: "value", message: "Indique um valor." });
    await put(admin.auth, "nao.existe", 1).expect(404);

    const saved = (await put(admin.auth, "app.name", "  Minhas Finanças ").expect(200)).body;
    expect(saved).toMatchObject({ key: "app.name", value: "Minhas Finanças", updatedBy: { id: admin.user.id, name: "Chefe" } });
    expect((await api().get("/api/v1/config/public")).body.settings["app.name"]).toBe("Minhas Finanças");
    expect((await put(admin.auth, "pagination.maxSize", "50").expect(200)).body.value).toBe(50);
  });

  it("os parâmetros controlam o registo e a duração da sessão", async () => {
    const admin = await signUpAs("SUPER_ADMIN");
    await put(admin.auth, "auth.passwordMinLength", 10).expect(200);
    const short = await api().post("/api/v1/auth/register").send({ name: "Ana", email: "ana@x.com", password: "123456789" }).expect(422);
    expect(short.body.errors).toEqual([{ field: "password", message: "A palavra-passe tem de ter pelo menos 10 caracteres." }]);
    await api().post("/api/v1/auth/register").send({ name: "Ana", email: "ana@x.com", password: "1234567890" }).expect(201);

    await put(admin.auth, "auth.registrationEnabled", false).expect(200);
    const closed = await api().post("/api/v1/auth/register").send({ name: "Rui", email: "rui@x.com", password: "1234567890" }).expect(403);
    expect(closed.body.detail).toBe("O registo de novas contas está desactivado. Contacte o administrador.");

    await put(admin.auth, "auth.sessionDays", 2).expect(200);
    const { token } = (await api().post("/api/v1/auth/login").send({ email: "ana@x.com", password: "1234567890" })).body;
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
    expect(payload.exp - payload.iat).toBe(2 * 86_400);
  });

  it("contas novas recebem a moeda e os alertas por omissão dos parâmetros", async () => {
    await setSetting("locale.defaultCurrency", "EUR");
    await setSetting("alerts.defaultBudgetThreshold", 90);
    await setSetting("alerts.defaultBillDaysAhead", 7);
    await setSetting("alerts.defaultLowBalance", 2500);
    const { auth } = await signUp();
    expect((await api().get("/api/v1/auth/me").set(auth)).body.currency).toBe("EUR");
    expect((await api().get("/api/v1/alerts/settings").set(auth)).body).toMatchObject({ budgetThreshold: 90, billDaysAhead: 7, lowBalanceAmount: "2500.00" });
  });

  it("os emails podem ser desligados", async () => {
    const { runDailyEmails } = await import("../src/modules/alerts/alerts.job");
    const { user } = await signUp();
    await setSetting("emails.enabled", false);
    await runDailyEmails("2026-11-01");
    expect(await prisma.emailLog.count({ where: { userId: user.id } })).toBe(0);
    await setSetting("emails.enabled", true);
    await runDailyEmails("2026-11-01");
    expect(await prisma.emailLog.count({ where: { userId: user.id } })).toBeGreaterThan(0);
  });
});

describe("admin — moedas", () => {
  it("lista, cria, actualiza e apaga", async () => {
    const admin = await signUpAs("SUPER_ADMIN");
    const list = (await api().get("/api/v1/admin/currencies").set(admin.auth).expect(200)).body;
    expect(list.totalItems).toBe(6);
    expect(list.content[0]).toEqual({ code: "MZN", name: "Metical moçambicano", symbol: "MT", decimals: 2, active: true, order: 1, userCount: 1 });

    const created = (await api().post("/api/v1/admin/currencies").set(admin.auth).send({ code: "gbp", name: "Libra", symbol: "£" }).expect(201)).body;
    expect(created).toEqual({ code: "GBP", name: "Libra", symbol: "£", decimals: 2, active: true, order: 7, userCount: 0 });
    const dup = await api().post("/api/v1/admin/currencies").set(admin.auth).send({ code: "GBP", name: "Libra", symbol: "£" }).expect(422);
    expect(dup.body.errors).toEqual([{ field: "code", message: "Já existe uma moeda com este código." }]);
    await api().post("/api/v1/admin/currencies").set(admin.auth).send({ code: "GB", name: "", symbol: "", decimals: 9 }).expect(422);

    const updated = (await api().put("/api/v1/admin/currencies/GBP").set(admin.auth).send({ name: "Libra esterlina", symbol: "£", active: false }).expect(200)).body;
    expect(updated).toMatchObject({ name: "Libra esterlina", active: false, order: 7 });
    const inactive = (await api().get("/api/v1/admin/currencies?active=false&search=libra").set(admin.auth)).body;
    expect(inactive.content.map((c: { code: string }) => c.code)).toEqual(["GBP"]);

    await api().delete("/api/v1/admin/currencies/GBP").set(admin.auth).expect(204);
    await api().put("/api/v1/admin/currencies/GBP").set(admin.auth).send({ name: "X", symbol: "X" }).expect(404);
  });

  it("não apaga moedas em uso nem a moeda por omissão", async () => {
    const admin = await signUpAs("SUPER_ADMIN");
    const { auth } = await signUp();
    await api().put("/api/v1/settings").set(auth).send({ name: "Ana", email: "ana@exemplo.com", currency: "USD" }).expect(200);

    const used = await api().delete("/api/v1/admin/currencies/USD").set(admin.auth).expect(409);
    expect(used.body.detail).toBe("A moeda é usada por 1 utilizador(es). Desactive-a em vez de a apagar.");
    await api().delete("/api/v1/admin/currencies/MZN").set(admin.auth).expect(409);
    await api().put("/api/v1/admin/currencies/MZN").set(admin.auth).send({ name: "Metical", symbol: "MT", active: false }).expect(409);
    await api().delete("/api/v1/admin/currencies/ZAR").set(admin.auth).expect(204);
  });

  it("as definições pessoais só aceitam moedas activas (ou a que já usa)", async () => {
    const { auth } = await signUp();
    const body = { name: "Ana", email: "ana@exemplo.com" };
    const unknown = await api().put("/api/v1/settings").set(auth).send({ ...body, currency: "XYZ" }).expect(422);
    expect(unknown.body.errors).toEqual([{ field: "currency", message: "Moeda não suportada." }]);

    await api().put("/api/v1/settings").set(auth).send({ ...body, currency: "brl" }).expect(200);
    await prisma.currency.update({ where: { code: "BRL" }, data: { active: false } });
    await prisma.currency.update({ where: { code: "AOA" }, data: { active: false } });
    // Mantém a moeda desactivada que já usava, mas não muda para outra desactivada
    await api().put("/api/v1/settings").set(auth).send({ ...body, currency: "BRL" }).expect(200);
    await api().put("/api/v1/settings").set(auth).send({ ...body, currency: "AOA" }).expect(422);
  });
});
