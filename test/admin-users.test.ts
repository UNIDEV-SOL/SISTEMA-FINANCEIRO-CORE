import { prisma } from "../src/shared/db/prisma";
import { api, login, signUp, signUpAs } from "./helpers";

const profileId = async (code: string) => (await prisma.profile.findUniqueOrThrow({ where: { code } })).id;

describe("admin — utilizadores", () => {
  it("lista paginada com filtros e pesquisa", async () => {
    const admin = await signUpAs("SUPER_ADMIN", "Zé Admin");
    await signUp();
    await signUp();
    const dependent = await signUpAs("DEPENDENT", "Bia Dependente");
    await prisma.user.update({ where: { id: dependent.user.id }, data: { active: false } });

    const all = (await api().get("/api/v1/admin/users?page=0&size=2").set(admin.auth).expect(200)).body;
    expect(all).toMatchObject({ page: 0, size: 2, totalItems: 4, totalPages: 2, hasNext: true, hasPrevious: false });
    expect(all.content[0]).toEqual({
      id: expect.any(String),
      name: "Ana Teste",
      email: expect.stringContaining("@exemplo.com"),
      active: true,
      profile: { id: expect.any(String), code: "USER", name: "Utilizador", superAdmin: false },
      currency: "MZN",
      createdAt: expect.any(String),
      lastLoginAt: expect.any(String),
    });

    const byProfile = (await api().get(`/api/v1/admin/users?profileId=${await profileId("USER")}`).set(admin.auth)).body;
    expect(byProfile.totalItems).toBe(2);
    const inactive = (await api().get("/api/v1/admin/users?active=false").set(admin.auth)).body;
    expect(inactive.content.map((u: { name: string }) => u.name)).toEqual(["Bia Dependente"]);
    const search = (await api().get("/api/v1/admin/users?search=ZÉ&sort=email,desc").set(admin.auth)).body;
    expect(search.content.map((u: { name: string }) => u.name)).toEqual(["Zé Admin"]);
    await api().get("/api/v1/admin/users?active=talvez").set(admin.auth).expect(422);
  });

  it("cria, actualiza e redefine a palavra-passe", async () => {
    const admin = await signUpAs("SUPER_ADMIN");
    const created = (
      await api()
        .post("/api/v1/admin/users")
        .set(admin.auth)
        .send({ name: "Rui", email: "RUI@exemplo.com", password: "segredo123", profileId: await profileId("ADMIN") })
        .expect(201)
    ).body;
    expect(created).toMatchObject({ name: "Rui", email: "rui@exemplo.com", active: true, profile: { code: "ADMIN" }, lastLoginAt: null });
    // Fica com as categorias por omissão, como no registo
    expect(await prisma.category.count({ where: { userId: created.id } })).toBe(14);

    const clash = await api()
      .post("/api/v1/admin/users")
      .set(admin.auth)
      .send({ name: "Outro", email: "rui@exemplo.com", password: "curta", profileId: "x" })
      .expect(422);
    expect(clash.body.errors.map((e: { field: string }) => e.field).sort()).toEqual(["password", "profileId"]);

    const updated = (
      await api()
        .put(`/api/v1/admin/users/${created.id}`)
        .set(admin.auth)
        .send({ name: "Rui Silva", email: "rui.silva@exemplo.com", profileId: await profileId("USER") })
        .expect(200)
    ).body;
    expect(updated).toMatchObject({ name: "Rui Silva", email: "rui.silva@exemplo.com", profile: { code: "USER" } });

    await api().post(`/api/v1/admin/users/${created.id}/password`).set(admin.auth).send({ password: "nova-senha-1" }).expect(204);
    await login("rui.silva@exemplo.com", "nova-senha-1");
    await api().post("/api/v1/auth/login").send({ email: "rui.silva@exemplo.com", password: "segredo123" }).expect(401);
    expect((await api().get(`/api/v1/admin/users/${created.id}`).set(admin.auth).expect(200)).body.lastLoginAt).not.toBeNull();
    await api().get("/api/v1/admin/users/3f1c9a52-7d0e-4b8a-9b0e-2b5f3f1d6c11").set(admin.auth).expect(404);
  });

  it("conta desactivada não inicia sessão", async () => {
    const admin = await signUpAs("SUPER_ADMIN");
    const { user } = await signUp();
    const res = (await api().patch(`/api/v1/admin/users/${user.id}/active`).set(admin.auth).send({ active: false }).expect(200)).body;
    expect(res.active).toBe(false);

    const denied = await api().post("/api/v1/auth/login").send({ email: user.email, password: "segredo123" }).expect(401);
    expect(denied.body.detail).toBe("Conta desactivada. Contacte o administrador.");
    // Com a palavra-passe errada não se revela que a conta existe
    const wrong = await api().post("/api/v1/auth/login").send({ email: user.email, password: "errada123" }).expect(401);
    expect(wrong.body.detail).toBe("Email ou palavra-passe incorrectos.");

    await api().patch(`/api/v1/admin/users/${user.id}/active`).set(admin.auth).send({ active: true }).expect(200);
    await login(user.email);
  });

  it("não se desactiva a si próprio nem ao último super administrador", async () => {
    const admin = await signUpAs("SUPER_ADMIN");
    const self = await api().patch(`/api/v1/admin/users/${admin.user.id}/active`).set(admin.auth).send({ active: false }).expect(409);
    expect(self.body.detail).toBe("Não pode desactivar a sua própria conta.");

    // Outro super administrador pode tentar, mas é o último activo
    const other = await signUpAs("SUPER_ADMIN");
    await prisma.user.update({ where: { id: other.user.id }, data: { active: true } });
    await api().patch(`/api/v1/admin/users/${other.user.id}/active`).set(admin.auth).send({ active: false }).expect(200);
    const last = await api().patch(`/api/v1/admin/users/${admin.user.id}/active`).set(other.auth);
    // O outro já está desactivado: a sessão dele deixou de valer
    expect(last.status).toBe(401);

    const demote = await api()
      .put(`/api/v1/admin/users/${admin.user.id}`)
      .set(admin.auth)
      .send({ name: "Admin", email: admin.user.email, profileId: await profileId("USER") })
      .expect(409);
    expect(demote.body.detail).toBe("Tem de existir pelo menos um super administrador activo.");
  });

  it("só um super administrador mexe em super administradores", async () => {
    const superAdmin = await signUpAs("SUPER_ADMIN");
    const admin = await signUpAs("ADMIN");
    const { user } = await signUp();

    const escalate = await api()
      .post("/api/v1/admin/users")
      .set(admin.auth)
      .send({ name: "Eu", email: "eu@exemplo.com", password: "segredo123", profileId: await profileId("SUPER_ADMIN") })
      .expect(403);
    expect(escalate.body.detail).toBe("Só um super administrador pode atribuir este perfil.");
    await api()
      .put(`/api/v1/admin/users/${user.id}`)
      .set(admin.auth)
      .send({ name: "X", email: user.email, profileId: await profileId("SUPER_ADMIN") })
      .expect(403);
    await api().patch(`/api/v1/admin/users/${superAdmin.user.id}/active`).set(admin.auth).send({ active: false }).expect(403);
    await api().post(`/api/v1/admin/users/${superAdmin.user.id}/password`).set(admin.auth).send({ password: "segredo999" }).expect(403);

    // Utilizadores normais o ADMIN gere
    await api().patch(`/api/v1/admin/users/${user.id}/active`).set(admin.auth).send({ active: false }).expect(200);
  });
});
