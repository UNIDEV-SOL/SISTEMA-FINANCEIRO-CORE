import { prisma } from "../src/shared/db/prisma";
import { api, signUp, signUpAs } from "./helpers";

const profile = (code: string) => prisma.profile.findUniqueOrThrow({ where: { code } });
const functionalityId = async (code: string) => (await prisma.functionality.findUniqueOrThrow({ where: { code } })).id;

type Node = { id: string; code: string; children: Node[] };
const find = (nodes: Node[], code: string): Node | undefined => nodes.flatMap((n) => [n, ...n.children]).find((n) => n.code === code);

describe("admin — perfis", () => {
  it("lista os perfis de sistema e cria perfis com código gerado", async () => {
    const admin = await signUpAs("SUPER_ADMIN");
    const list = (await api().get("/api/v1/admin/profiles?sort=code,asc").set(admin.auth).expect(200)).body;
    expect(list.content.map((p: { code: string }) => p.code)).toEqual(["ADMIN", "DEPENDENT", "SUPER_ADMIN", "USER"]);
    expect(list.content.find((p: { code: string }) => p.code === "SUPER_ADMIN")).toMatchObject({ superAdmin: true, system: true, isDefault: false, userCount: 1 });
    expect(list.content.find((p: { code: string }) => p.code === "USER")).toMatchObject({ isDefault: true, system: true });

    const created = (await api().post("/api/v1/admin/profiles").set(admin.auth).send({ name: "Gestor de equipa", description: "Equipa" }).expect(201)).body;
    expect(created).toMatchObject({ code: "GESTOR_DE_EQUIPA", name: "Gestor de equipa", description: "Equipa", superAdmin: false, system: false, isDefault: false, userCount: 0 });
    const again = (await api().post("/api/v1/admin/profiles").set(admin.auth).send({ name: "Gestor de Equipa" }).expect(201)).body;
    expect(again.code).toBe("GESTOR_DE_EQUIPA_2");
    const accents = (await api().post("/api/v1/admin/profiles").set(admin.auth).send({ name: "Técnico Financeiro" }).expect(201)).body;
    expect(accents.code).toBe("TECNICO_FINANCEIRO");

    const clash = await api().post("/api/v1/admin/profiles").set(admin.auth).send({ name: "X", code: "user" }).expect(422);
    expect(clash.body.errors).toEqual([{ field: "code", message: "Já existe um perfil com este código." }]);
    await api().post("/api/v1/admin/profiles").set(admin.auth).send({ name: "X", code: "1 mau" }).expect(422);

    const search = (await api().get("/api/v1/admin/profiles?search=gestor").set(admin.auth)).body;
    expect(search.totalItems).toBe(2);
  });

  it("muda o perfil por omissão usado no registo", async () => {
    const admin = await signUpAs("SUPER_ADMIN");
    const created = (await api().post("/api/v1/admin/profiles").set(admin.auth).send({ name: "Convidado", isDefault: true }).expect(201)).body;
    expect(created.isDefault).toBe(true);
    expect((await profile("USER")).isDefault).toBe(false);

    const { auth } = await signUp();
    expect((await api().get("/api/v1/auth/me").set(auth)).body.profile.code).toBe("CONVIDADO");

    const user = await profile("USER");
    const off = await api().put(`/api/v1/admin/profiles/${created.id}`).set(admin.auth).send({ name: "Convidado", isDefault: false }).expect(422);
    expect(off.body.errors[0].field).toBe("isDefault");
    await api().put(`/api/v1/admin/profiles/${user.id}`).set(admin.auth).send({ name: "Utilizador", isDefault: true }).expect(200);
    expect((await profile("CONVIDADO")).isDefault).toBe(false);

    const sa = await profile("SUPER_ADMIN");
    await api().put(`/api/v1/admin/profiles/${sa.id}`).set(admin.auth).send({ name: "Super", isDefault: true }).expect(422);
  });

  it("não apaga perfis de sistema nem com utilizadores", async () => {
    const admin = await signUpAs("SUPER_ADMIN");
    const user = await profile("USER");
    const system = await api().delete(`/api/v1/admin/profiles/${user.id}`).set(admin.auth).expect(409);
    expect(system.body.detail).toBe("Os perfis de sistema não podem ser apagados.");

    const custom = (await api().post("/api/v1/admin/profiles").set(admin.auth).send({ name: "Temporário" }).expect(201)).body;
    const { user: someone } = await signUp();
    await prisma.user.update({ where: { id: someone.id }, data: { profileId: custom.id } });
    await api().delete(`/api/v1/admin/profiles/${custom.id}`).set(admin.auth).expect(409);
    await prisma.user.update({ where: { id: someone.id }, data: { profileId: user.id } });
    await api().delete(`/api/v1/admin/profiles/${custom.id}`).set(admin.auth).expect(204);
    await api().get(`/api/v1/admin/profiles/${custom.id}`).set(admin.auth).expect(404);
  });

  it("lê e substitui permissões; o super administrador não é configurável", async () => {
    const admin = await signUpAs("SUPER_ADMIN");
    const user = await profile("USER");
    const current = (await api().get(`/api/v1/admin/profiles/${user.id}/permissions`).set(admin.auth).expect(200)).body;
    expect(current).toHaveLength(12);
    expect(current.find((p: { code: string }) => p.code === "TRANSACTIONS").actions).toEqual(["VIEW", "CREATE", "EDIT", "DELETE", "EXPORT", "IMPORT"]);

    const custom = (await api().post("/api/v1/admin/profiles").set(admin.auth).send({ name: "Leitor" }).expect(201)).body;
    const saved = (
      await api()
        .put(`/api/v1/admin/profiles/${custom.id}/permissions`)
        .set(admin.auth)
        .send({
          items: [
            { functionalityId: await functionalityId("TRANSACTIONS"), actions: ["EXPORT", "VIEW", "VIEW"] },
            { functionalityId: await functionalityId("GOALS"), actions: [] },
          ],
        })
        .expect(200)
    ).body;
    expect(saved).toEqual([{ functionalityId: await functionalityId("TRANSACTIONS"), code: "TRANSACTIONS", actions: ["VIEW", "EXPORT"] }]);

    const bad = await api()
      .put(`/api/v1/admin/profiles/${custom.id}/permissions`)
      .set(admin.auth)
      .send({ items: [{ functionalityId: "3f1c9a52-7d0e-4b8a-9b0e-2b5f3f1d6c11", actions: ["VIEW"] }, { functionalityId: "x", actions: ["FLY"] }] })
      .expect(422);
    expect(bad.body.errors.map((e: { field: string }) => e.field)).toEqual(expect.arrayContaining(["items.1.functionalityId", "items.1.actions.0"]));
    const missing = await api()
      .put(`/api/v1/admin/profiles/${custom.id}/permissions`)
      .set(admin.auth)
      .send({ items: [{ functionalityId: "3f1c9a52-7d0e-4b8a-9b0e-2b5f3f1d6c11", actions: ["VIEW"] }] })
      .expect(422);
    expect(missing.body.errors).toEqual([{ field: "items.0.functionalityId", message: "A funcionalidade não existe." }]);

    const sa = await profile("SUPER_ADMIN");
    await api().put(`/api/v1/admin/profiles/${sa.id}/permissions`).set(admin.auth).send({ items: [] }).expect(409);
  });
});

describe("admin — menus", () => {
  it("devolve a árvore completa", async () => {
    const admin = await signUpAs("SUPER_ADMIN");
    const tree: Node[] = (await api().get("/api/v1/admin/functionalities").set(admin.auth).expect(200)).body;
    expect(tree.map((n) => n.code)).toEqual(["MAIN", "PLANNING", "ANALYSIS", "SYSTEM", "ADMINISTRATION"]);
    expect(find(tree, "SETTINGS")).toMatchObject({
      path: "/configuracoes",
      icon: "settings",
      apiPaths: ["/settings/**", "/export/**", "/demo/reset"],
      protectReads: false,
      active: true,
      profileCount: 3,
    });
    expect(find(tree, "ADMIN_AUDIT")).toMatchObject({ protectReads: true, apiPaths: ["/admin/audit/**", "GET /admin/users"] });
  });

  it("cria, edita (sem mudar o código), reordena e apaga", async () => {
    const admin = await signUpAs("SUPER_ADMIN");
    const system = await functionalityId("SYSTEM");
    const created = (
      await api()
        .post("/api/v1/admin/functionalities")
        .set(admin.auth)
        .send({ code: "imports", label: "Importações", path: "/importacoes", icon: "upload", parentId: system, apiPaths: ["/imports/**"] })
        .expect(201)
    ).body;
    expect(created).toMatchObject({ code: "IMPORTS", order: 5, parentId: system, active: true, protectReads: false, children: [] });

    const dup = await api().post("/api/v1/admin/functionalities").set(admin.auth).send({ code: "IMPORTS", label: "X" }).expect(422);
    expect(dup.body.errors[0].field).toBe("code");
    const badPath = await api().post("/api/v1/admin/functionalities").set(admin.auth).send({ code: "X_Y", label: "X", apiPaths: ["sem-barra"] }).expect(422);
    expect(badPath.body.errors[0].field).toBe("apiPaths.0");

    const updated = (
      await api()
        .put(`/api/v1/admin/functionalities/${created.id}`)
        .set(admin.auth)
        .send({ code: "OUTRO", label: "Importar", path: "/importar", icon: "upload", parentId: system, apiPaths: ["/imports/**"], protectReads: true })
        .expect(200)
    ).body;
    expect(updated).toMatchObject({ code: "IMPORTS", label: "Importar", protectReads: true });

    // Não pode ficar dentro de si própria (nem de um descendente)
    const cycle = await api()
      .put(`/api/v1/admin/functionalities/${system}`)
      .set(admin.auth)
      .send({ label: "Sistema", parentId: created.id })
      .expect(422);
    expect(cycle.body.errors[0].field).toBe("parentId");

    const main = await functionalityId("MAIN");
    const tree: Node[] = (
      await api()
        .put("/api/v1/admin/functionalities/order")
        .set(admin.auth)
        .send({ items: [{ id: created.id, order: 0, parentId: main }] })
        .expect(200)
    ).body;
    expect(tree[0].children.map((n) => n.code)).toEqual(["IMPORTS", "DASHBOARD", "TRANSACTIONS", "ACCOUNTS"]);

    await api().delete(`/api/v1/admin/functionalities/${main}`).set(admin.auth).expect(409);
    await api().delete(`/api/v1/admin/functionalities/${await functionalityId("TRANSACTIONS")}`).set(admin.auth).expect(409);
    await api().delete(`/api/v1/admin/functionalities/${created.id}`).set(admin.auth).expect(204);
  });

  it("um menu novo com permissão aparece no menu do perfil", async () => {
    const admin = await signUpAs("SUPER_ADMIN");
    const { auth } = await signUp();
    const system = await functionalityId("SYSTEM");
    const created = (
      await api()
        .post("/api/v1/admin/functionalities")
        .set(admin.auth)
        .send({ code: "IMPORTS", label: "Importações", path: "/importacoes", parentId: system })
        .expect(201)
    ).body;
    const user = await profile("USER");
    const items = (await api().get(`/api/v1/admin/profiles/${user.id}/permissions`).set(admin.auth)).body;
    await api()
      .put(`/api/v1/admin/profiles/${user.id}/permissions`)
      .set(admin.auth)
      .send({ items: [...items, { functionalityId: created.id, actions: ["VIEW"] }] })
      .expect(200);

    const menu = (await api().get("/api/v1/access/menu").set(auth)).body as Node[];
    expect(find(menu, "IMPORTS")).toMatchObject({ path: "/importacoes", actions: ["VIEW"] });
  });
});
