import { actionOf } from "../src/shared/access/actions";
import { accessPolicy, isValidApiPattern } from "../src/shared/access/policy";
import { prisma } from "../src/shared/db/prisma";
import { api, setup, signUp, signUpAs } from "./helpers";

type MenuNode = { code: string; path: string | null; actions: string[]; children: MenuNode[] };

const codes = (nodes: MenuNode[]): string[] => nodes.flatMap((n) => [n.code, ...codes(n.children)]);

const functionalityId = async (code: string) => (await prisma.functionality.findUniqueOrThrow({ where: { code } })).id;

/** Cria um perfil pela API do super administrador e devolve o id. */
async function createProfile(admin: Record<string, string>, name: string, permissions: Record<string, string[]>) {
  const profile = (await api().post("/api/v1/admin/profiles").set(admin).send({ name }).expect(201)).body;
  const items = await Promise.all(Object.entries(permissions).map(async ([code, actions]) => ({ functionalityId: await functionalityId(code), actions })));
  await api().put(`/api/v1/admin/profiles/${profile.id}/permissions`).set(admin).send({ items }).expect(200);
  return profile.id as string;
}

async function moveUserToProfile(userId: string, profileId: string) {
  await prisma.user.update({ where: { id: userId }, data: { profileId } });
}

describe("acções e padrões", () => {
  it("deriva a acção do método e do caminho", () => {
    expect(actionOf("GET", "/transactions")).toBe("VIEW");
    expect(actionOf("GET", "/export")).toBe("EXPORT");
    expect(actionOf("POST", "/transactions")).toBe("CREATE");
    expect(actionOf("POST", "/assistant/chat")).toBe("VIEW");
    expect(actionOf("POST", "/help/search")).toBe("VIEW");
    expect(actionOf("POST", "/data/import")).toBe("IMPORT");
    expect(actionOf("POST", "/admin/users/1/password")).toBe("EDIT");
    expect(actionOf("PUT", "/accounts/1")).toBe("EDIT");
    expect(actionOf("PATCH", "/family/links/1")).toBe("EDIT");
    expect(actionOf("DELETE", "/goals/1")).toBe("DELETE");
  });

  it("valida padrões e escolhe o mais específico", async () => {
    expect(isValidApiPattern("/budgets/**")).toBe(true);
    expect(isValidApiPattern("/a/*/b")).toBe(true);
    expect(isValidApiPattern("budgets")).toBe(false);
    expect(isValidApiPattern("/a/**/b")).toBe(false);

    expect((await accessPolicy.match("/transactions"))?.code).toBe("TRANSACTIONS");
    expect((await accessPolicy.match("/transactions/abc"))?.code).toBe("TRANSACTIONS");
    expect((await accessPolicy.match("/admin/currencies/MZN"))?.code).toBe("ADMIN_SETTINGS");
    expect((await accessPolicy.match("/settings"))?.code).toBe("SETTINGS");
    expect((await accessPolicy.match("/auth/me"))).toBeUndefined();

    // Um padrão mais específico ganha a um mais genérico
    await prisma.functionality.create({ data: { code: "REPORT_EXPORT", label: "Exportar relatórios", apiPaths: ["/reports/export"] } });
    accessPolicy.invalidate();
    expect((await accessPolicy.match("/reports/export"))?.code).toBe("REPORT_EXPORT");
    expect((await accessPolicy.match("/reports/monthly"))?.code).toBe("REPORTS");
  });
});

describe("autorização", () => {
  it("o super administrador passa em tudo; o USER não entra na administração", async () => {
    const admin = await signUpAs("SUPER_ADMIN");
    await api().get("/api/v1/admin/users").set(admin.auth).expect(200);
    await api().get("/api/v1/admin/settings").set(admin.auth).expect(200);

    const { auth } = await signUp();
    const denied = await api().get("/api/v1/admin/users").set(auth).expect(403);
    expect(denied.headers["content-type"]).toContain("application/problem+json");
    expect(denied.body).toMatchObject({ status: 403, title: "Acesso negado", detail: 'O seu perfil não pode consultar em "Utilizadores".' });
    await api().put("/api/v1/admin/settings/app.name").set(auth).send({ value: "X" }).expect(403);
    // Os módulos pessoais continuam acessíveis
    await api().get("/api/v1/transactions").set(auth).expect(200);
  });

  it("o ADMIN gere utilizadores mas não os parâmetros do sistema", async () => {
    const admin = await signUpAs("ADMIN");
    await api().get("/api/v1/admin/users").set(admin.auth).expect(200);
    await api().get("/api/v1/admin/profiles").set(admin.auth).expect(200);
    await api().post("/api/v1/admin/profiles").set(admin.auth).send({ name: "X" }).expect(403);
    await api().get("/api/v1/admin/settings").set(admin.auth).expect(403);
    // Lê os menus (precisa deles na matriz de permissões) mas não os altera
    await api().get("/api/v1/admin/functionalities").set(admin.auth).expect(200);
    await api().post("/api/v1/admin/functionalities").set(admin.auth).send({ code: "TESTE", label: "Teste", apiPaths: [] }).expect(403);
  });

  it("perfil só com VIEW lê mas recebe 403 ao criar", async () => {
    const admin = await signUpAs("SUPER_ADMIN");
    const { auth, user, bank, cat } = await setup();
    const readOnly = await createProfile(admin.auth, "Só leitura", { TRANSACTIONS: ["VIEW"], ACCOUNTS: ["VIEW"] });
    await moveUserToProfile(user.id, readOnly);

    await api().get("/api/v1/transactions").set(auth).expect(200);
    const res = await api()
      .post("/api/v1/transactions")
      .set(auth)
      .send({ type: "EXPENSE", description: "x", amount: "10", date: "2026-09-01", accountId: bank.id, categoryId: cat("Saúde") })
      .expect(403);
    expect(res.body.detail).toBe('O seu perfil não pode criar em "Transações".');
    await api().delete(`/api/v1/accounts/${bank.id}`).set(auth).expect(403);
    // Sem `protectReads`, as leituras de módulos sem ligação continuam livres
    await api().get("/api/v1/goals").set(auth).expect(200);
    await api().post("/api/v1/goals").set(auth).send({ name: "Meta", color: "#2563eb", target: "100" }).expect(403);
  });

  it("alterar permissões tem efeito imediato", async () => {
    const admin = await signUpAs("SUPER_ADMIN");
    const { auth, user } = await setup();
    const profileId = await createProfile(admin.auth, "Gestor", { ACCOUNTS: ["VIEW"] });
    await moveUserToProfile(user.id, profileId);
    const body = { name: "Carteira", type: "CASH", color: "#16a34a" };

    await api().post("/api/v1/accounts").set(auth).send(body).expect(403);
    await api()
      .put(`/api/v1/admin/profiles/${profileId}/permissions`)
      .set(admin.auth)
      .send({ items: [{ functionalityId: await functionalityId("ACCOUNTS"), actions: ["VIEW", "CREATE"] }] })
      .expect(200);
    await api().post("/api/v1/accounts").set(auth).send(body).expect(201);

    // E retirar também
    await api().put(`/api/v1/admin/profiles/${profileId}/permissions`).set(admin.auth).send({ items: [] }).expect(200);
    await api().post("/api/v1/accounts").set(auth).send(body).expect(403);
  });

  it("as entradas herdam as acções da secção-pai", async () => {
    const admin = await signUpAs("SUPER_ADMIN");
    const { auth, user } = await setup();
    const profileId = await createProfile(admin.auth, "Planeador", { PLANNING: ["VIEW", "CREATE"] });
    await moveUserToProfile(user.id, profileId);

    await api().post("/api/v1/goals").set(auth).send({ name: "Férias", color: "#2563eb", target: "1000" }).expect(201);
    await api().post("/api/v1/accounts").set(auth).send({ name: "Carteira", type: "CASH", color: "#16a34a" }).expect(403);

    const menu: MenuNode[] = (await api().get("/api/v1/access/menu").set(auth).expect(200)).body;
    expect(menu.map((n) => n.code)).toEqual(["PLANNING"]);
    expect(menu[0].children.map((n) => n.code)).toEqual(["BUDGETS", "GOALS", "INVESTMENTS"]);
    expect(menu[0].children[1].actions).toEqual(["VIEW", "CREATE"]);
  });

  it("funcionalidade desactivada dá 403 a todos menos ao super administrador", async () => {
    const admin = await signUpAs("SUPER_ADMIN");
    const { auth } = await signUp();
    const id = await functionalityId("REPORTS");
    const current = (await api().get("/api/v1/admin/functionalities").set(admin.auth)).body;
    const reports = current.flatMap((s: { children: unknown[] }) => s.children).find((f: { code: string }) => f.code === "REPORTS");
    await api()
      .put(`/api/v1/admin/functionalities/${id}`)
      .set(admin.auth)
      .send({ ...reports, active: false })
      .expect(200);

    const res = await api().get("/api/v1/reports/annual?year=2026").set(auth).expect(403);
    expect(res.body.detail).toBe('A funcionalidade "Relatórios" está desactivada.');
    await api().get("/api/v1/reports/annual?year=2026").set(admin.auth).expect(200);
    const menu: MenuNode[] = (await api().get("/api/v1/access/menu").set(auth)).body;
    expect(codes(menu)).not.toContain("REPORTS");
  });

  it("protectReads exige ligação também para ler", async () => {
    const { auth } = await signUp();
    await api().get("/api/v1/budgets?month=2026-09").set(auth).expect(200);
    await prisma.profileFunctionality.deleteMany({ where: { profile: { code: "USER" }, functionality: { code: "BUDGETS" } } });
    await prisma.functionality.update({ where: { code: "BUDGETS" }, data: { protectReads: true } });
    accessPolicy.invalidate();
    await api().get("/api/v1/budgets?month=2026-09").set(auth).expect(403);
  });

  it('caminhos "GET …" dão só leitura a outra funcionalidade', async () => {
    const admin = await signUpAs("SUPER_ADMIN");
    const { auth, user } = await signUp();
    const profilesOnly = await createProfile(admin.auth, "Gestor de perfis", { ADMIN_PROFILES: ["VIEW", "EDIT"] });
    await moveUserToProfile(user.id, profilesOnly);

    // Lê a lista de menus para a matriz de permissões, mas não mexe nos menus
    await api().get("/api/v1/admin/functionalities").set(auth).expect(200);
    await api()
      .post("/api/v1/admin/functionalities")
      .set(auth)
      .send({ code: "TESTE", label: "Teste", apiPaths: [] })
      .expect(403);
    // Nem lê os utilizadores, que não lhe estão atribuídos
    await api().get("/api/v1/admin/users").set(auth).expect(403);
    expect(isValidApiPattern("GET /admin/users")).toBe(true);
    expect(isValidApiPattern("POST /admin/users")).toBe(false);
  });

  it("contas desactivadas perdem a sessão", async () => {
    const { auth, user } = await signUp();
    await prisma.user.update({ where: { id: user.id }, data: { active: false } });
    const res = await api().get("/api/v1/accounts").set(auth).expect(401);
    expect(res.body.detail).toBe("Conta desactivada. Contacte o administrador.");
  });
});

describe("menu", () => {
  it("o USER vê os módulos pessoais, sem administração", async () => {
    const { auth } = await signUp();
    const menu: MenuNode[] = (await api().get("/api/v1/access/menu").set(auth).expect(200)).body;
    expect(menu.map((n) => n.code)).toEqual(["MAIN", "PLANNING", "ANALYSIS", "SYSTEM"]);
    expect(menu[0]).toMatchObject({ label: "Principal", path: null, icon: null, actions: [] });
    expect(menu[0].children[0]).toEqual({
      code: "DASHBOARD",
      label: "Dashboard",
      path: "/painel",
      icon: "layout-dashboard",
      order: 1,
      actions: ["VIEW", "CREATE", "EDIT", "DELETE", "EXPORT", "IMPORT"],
      children: [],
    });
    expect(codes(menu)).toEqual(expect.arrayContaining(["TRANSACTIONS", "FAMILY", "HELP", "SETTINGS"]));
    expect(codes(menu).some((c) => c.startsWith("ADMIN"))).toBe(false);
  });

  it("o super administrador vê tudo, com todas as acções", async () => {
    const admin = await signUpAs("SUPER_ADMIN");
    const menu: MenuNode[] = (await api().get("/api/v1/access/menu").set(admin.auth)).body;
    expect(menu.map((n) => n.code)).toEqual(["MAIN", "PLANNING", "ANALYSIS", "SYSTEM", "ADMINISTRATION"]);
    expect(menu[4].children.map((n) => n.code)).toEqual([
      "ADMIN_USERS",
      "ADMIN_PROFILES",
      "ADMIN_MENUS",
      "ADMIN_SETTINGS",
      "ADMIN_HELP",
      "ADMIN_AUDIT",
      "ADMIN_PERIODS",
      "ADMIN_USER_DATA",
    ]);
    expect(menu[4].children.find((n) => n.code === "ADMIN_PERIODS")).toMatchObject({ path: "/admin/periodos", icon: "calendar-range" });
    // Só permissão: sem página
    expect(menu[4].children.find((n) => n.code === "ADMIN_USER_DATA")).toMatchObject({ path: null, icon: "building-2", children: [] });
    expect(menu[4].actions).toHaveLength(6);
  });

  it("o dependente não vê investimentos nem família", async () => {
    const dependent = await signUpAs("DEPENDENT");
    const menu: MenuNode[] = (await api().get("/api/v1/access/menu").set(dependent.auth)).body;
    expect(codes(menu)).not.toContain("INVESTMENTS");
    expect(codes(menu)).not.toContain("FAMILY");
    expect(codes(menu)).toContain("GOALS");
  });

  it("/auth/me inclui o perfil", async () => {
    const admin = await signUpAs("ADMIN", "Gestora");
    const me = (await api().get("/api/v1/auth/me").set(admin.auth).expect(200)).body;
    expect(me).toMatchObject({ name: "Gestora", active: true, profile: { code: "ADMIN", name: "Administrador", superAdmin: false }, actingAs: null });
  });
});
