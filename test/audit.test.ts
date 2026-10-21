import { maskSecrets } from "../src/shared/middleware/audit";
import { prisma } from "../src/shared/db/prisma";
import { api, auditRows, signUp, signUpAs } from "./helpers";

describe("auditoria", () => {
  it("mascara segredos em qualquer nível", () => {
    expect(maskSecrets({ email: "a@b.c", password: "x", nested: { apiKey: "k", list: [{ token: "t", ok: 1 }] } })).toEqual({
      email: "a@b.c",
      password: "***",
      nested: { apiKey: "***", list: [{ token: "***", ok: 1 }] },
    });
  });

  it("regista logins, com e sem sucesso", async () => {
    const { user } = await signUp();
    await api().post("/api/v1/auth/login").send({ email: user.email, password: "segredo123" }).expect(200);
    await api().post("/api/v1/auth/login").send({ email: user.email, password: "errada123" }).expect(401);

    const rows = (await auditRows()).filter((r) => r.path === "/auth/login");
    expect(rows.map((r) => r.action)).toEqual(["LOGIN", "LOGIN_FAILED"]);
    expect(rows[0]).toMatchObject({ actorId: user.id, actorName: "Ana Teste", method: "POST", statusCode: 200 });
    expect(rows[1]).toMatchObject({ actorId: null, actorName: user.email, statusCode: 401 });
    expect(rows[1].details).toEqual({ email: user.email, password: "***" });
    expect(rows.every((r) => r.durationMs >= 0)).toBe(true);
  });

  it("regista escritas com a funcionalidade e o corpo mascarado; leituras não", async () => {
    const admin = await signUpAs("SUPER_ADMIN", "Chefe");
    const profile = await prisma.profile.findUniqueOrThrow({ where: { code: "USER" } });
    const created = (
      await api()
        .post("/api/v1/admin/users")
        .set(admin.auth)
        .send({ name: "Rui", email: "rui@exemplo.com", password: "segredo-muito-secreto", profileId: profile.id })
        .expect(201)
    ).body;
    await api().get("/api/v1/admin/users").set(admin.auth).expect(200);
    await api().patch(`/api/v1/admin/users/${created.id}/active`).set(admin.auth).send({ active: false }).expect(200);

    const rows = (await auditRows()).filter((r) => r.actorId === admin.user.id && r.action !== "LOGIN");
    expect(rows.map((r) => [r.action, r.method, r.path, r.statusCode, r.functionalityCode])).toEqual([
      ["CREATE", "POST", "/admin/users", 201, "ADMIN_USERS"],
      ["EDIT", "PATCH", `/admin/users/${created.id}/active`, 200, "ADMIN_USERS"],
    ]);
    expect(rows[0]).toMatchObject({ actorName: "Chefe", details: { name: "Rui", email: "rui@exemplo.com", password: "***", profileId: profile.id } });
    expect(JSON.stringify(rows)).not.toContain("segredo-muito-secreto");
  });

  it("regista acessos recusados e quem agia por outra pessoa", async () => {
    const { auth, user } = await signUp();
    await api().get("/api/v1/admin/audit").set(auth).expect(403);
    const child = (
      await api().post("/api/v1/family/dependents").set(auth).send({ name: "Filho", email: "filho@exemplo.com", password: "segredo123", access: "MANAGE" }).expect(201)
    ).body;
    await api().post("/api/v1/accounts").set({ ...auth, "X-Acting-As": child.person.id }).send({ name: "Mesada", type: "CASH", color: "#16a34a" }).expect(201);

    const rows = await auditRows();
    expect(rows.find((r) => r.action === "ACCESS_DENIED")).toMatchObject({ actorId: user.id, method: "GET", path: "/admin/audit", statusCode: 403, functionalityCode: "ADMIN_AUDIT" });
    expect(rows.find((r) => r.path === "/accounts")).toMatchObject({ action: "CREATE", actorId: user.id, actingAsId: child.person.id, functionalityCode: "ACCOUNTS" });
    // O registo também tem a password mascarada
    expect(rows.find((r) => r.path === "/auth/register")?.details).toMatchObject({ password: "***" });
  });

  it("lista com filtros e pesquisa", async () => {
    const admin = await signUpAs("SUPER_ADMIN", "Chefe");
    const { auth } = await signUp();
    await api().post("/api/v1/accounts").set(auth).send({ name: "Carteira", type: "CASH", color: "#16a34a" }).expect(201);
    await api().post("/api/v1/auth/login").send({ email: "ninguem@exemplo.com", password: "x" }).expect(401);
    await auditRows();

    const all = (await api().get("/api/v1/admin/audit?size=50").set(admin.auth).expect(200)).body;
    expect(all.content[0].createdAt >= all.content.at(-1).createdAt).toBe(true);
    expect(all.content[0]).toEqual(
      expect.objectContaining({ id: expect.any(String), action: expect.any(String), path: expect.any(String), actingAsName: null, ip: expect.any(String) }),
    );

    const failed = (await api().get("/api/v1/admin/audit?action=LOGIN_FAILED").set(admin.auth)).body;
    expect(failed.content.map((r: { actorName: string }) => r.actorName)).toEqual(["ninguem@exemplo.com"]);
    const search = (await api().get("/api/v1/admin/audit?search=accounts").set(admin.auth)).body;
    expect(search.content.map((r: { path: string }) => r.path)).toEqual(["/accounts"]);

    const today = new Date().toISOString().slice(0, 10);
    const future = (await api().get("/api/v1/admin/audit?from=2099-01-01").set(admin.auth)).body;
    expect(future.totalItems).toBe(0);
    const range = (await api().get(`/api/v1/admin/audit?from=2020-01-01&to=2099-12-31&action=CREATE`).set(admin.auth)).body;
    expect(range.totalItems).toBeGreaterThan(0);
    await api().get(`/api/v1/admin/audit?from=${today}&to=2020-01-01`).set(admin.auth).expect(422);
    await api().get("/api/v1/admin/audit?action=HACK").set(admin.auth).expect(422);
  });
});
