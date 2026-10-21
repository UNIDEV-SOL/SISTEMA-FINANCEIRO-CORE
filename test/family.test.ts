import { prisma } from "../src/shared/db/prisma";
import { api, login, setSetting, setup, signUp } from "./helpers";

type Auth = Record<string, string>;

async function addDependent(auth: Auth, access: "VIEW" | "MANAGE", email = "filho@exemplo.com") {
  return (await api().post("/api/v1/family/dependents").set(auth).send({ name: "Filho", email, password: "segredo123", access }).expect(201)).body;
}

const as = (auth: Auth, memberId: string) => ({ ...auth, "X-Acting-As": memberId });

describe("família — ligações", () => {
  it("cria um dependente com o perfil DEPENDENT e a ligação activa", async () => {
    const { auth, user } = await signUp();
    const link = await addDependent(auth, "MANAGE");
    expect(link).toMatchObject({ access: "MANAGE", status: "ACTIVE", person: { name: "Filho", email: "filho@exemplo.com" } });

    const member = await prisma.user.findUniqueOrThrow({ where: { id: link.person.id }, include: { profile: true } });
    expect(member.profile.code).toBe("DEPENDENT");
    expect(await prisma.category.count({ where: { userId: member.id } })).toBe(14);

    const overview = (await api().get("/api/v1/family").set(auth).expect(200)).body;
    expect(overview.dependents).toHaveLength(1);
    expect(overview.guardians).toEqual([]);

    // O dependente vê o responsável e consegue iniciar sessão
    const child = await login("filho@exemplo.com");
    const theirs = (await api().get("/api/v1/family").set(child.auth)).body;
    expect(theirs.guardians).toEqual([expect.objectContaining({ person: { id: user.id, name: "Ana Teste", email: user.email }, status: "ACTIVE" })]);

    const dup = await api().post("/api/v1/family/dependents").set(auth).send({ name: "X", email: "FILHO@exemplo.com", password: "segredo123", access: "VIEW" }).expect(422);
    expect(dup.body.errors).toEqual([{ field: "email", message: "Já existe uma conta com este email." }]);
  });

  it("respeita os parâmetros da família", async () => {
    const { auth } = await signUp();
    await setSetting("family.maxDependents", 1);
    await addDependent(auth, "VIEW");
    const limit = await api().post("/api/v1/family/dependents").set(auth).send({ name: "Outro", email: "outro@exemplo.com", password: "segredo123", access: "VIEW" }).expect(409);
    expect(limit.body.detail).toBe("Atingiu o limite de 1 dependente(s).");

    await setSetting("family.enabled", false);
    await api().post("/api/v1/family/invitations").set(auth).send({ email: "x@exemplo.com", access: "VIEW" }).expect(403);
  });

  it("convites: validação, aceitar, recusar e mudar o acesso", async () => {
    const ana = await signUp();
    const rui = await signUp();
    const invite = (email: string, access = "VIEW") => api().post("/api/v1/family/invitations").set(ana.auth).send({ email, access });

    expect((await invite("ninguem@exemplo.com").expect(422)).body.errors[0]).toEqual({ field: "email", message: "Não existe nenhuma conta activa com este email." });
    expect((await invite(ana.user.email).expect(422)).body.errors[0].message).toBe("Não se pode convidar a si próprio.");

    const sent = (await invite(rui.user.email).expect(201)).body;
    expect(sent).toMatchObject({ status: "PENDING", access: "VIEW", person: { id: rui.user.id } });
    expect((await invite(rui.user.email).expect(422)).body.errors[0].message).toBe("Já enviou um convite a esta pessoa.");

    const received = (await api().get("/api/v1/family").set(rui.auth)).body;
    expect(received.invitations.map((l: { id: string }) => l.id)).toEqual([sent.id]);

    // Só a pessoa convidada responde
    await api().post(`/api/v1/family/invitations/${sent.id}/accept`).set(ana.auth).expect(404);
    const accepted = (await api().post(`/api/v1/family/invitations/${sent.id}/accept`).set(rui.auth).expect(200)).body;
    expect(accepted).toMatchObject({ status: "ACTIVE", person: { id: ana.user.id } });
    await api().post(`/api/v1/family/invitations/${sent.id}/decline`).set(rui.auth).expect(409);

    // Só o responsável muda o acesso
    await api().patch(`/api/v1/family/links/${sent.id}`).set(rui.auth).send({ access: "MANAGE" }).expect(403);
    expect((await api().patch(`/api/v1/family/links/${sent.id}`).set(ana.auth).send({ access: "MANAGE" }).expect(200)).body.access).toBe("MANAGE");

    // Qualquer lado termina; depois pode ser convidado de novo e recusar
    await api().delete(`/api/v1/family/links/${sent.id}`).set(rui.auth).expect(204);
    expect((await api().get("/api/v1/family").set(ana.auth)).body.dependents).toEqual([]);
    const again = (await invite(rui.user.email).expect(201)).body;
    expect(again.id).toBe(sent.id);
    expect((await api().post(`/api/v1/family/invitations/${again.id}/decline`).set(rui.auth).expect(200)).body.status).toBe("REVOKED");
  });
});

describe("família — agir como", () => {
  it("com MANAGE, lê e escreve nos dados do dependente", async () => {
    const guardian = await setup();
    const link = await addDependent(guardian.auth, "MANAGE");
    const memberId = link.person.id;

    const created = (
      await api().post("/api/v1/accounts").set(as(guardian.auth, memberId)).send({ name: "Mesada", type: "CASH", color: "#16a34a" }).expect(201)
    ).body;
    const accounts = await prisma.account.findMany({ where: { name: "Mesada" } });
    expect(accounts.map((a) => a.userId)).toEqual([memberId]);

    const theirs = (await api().get("/api/v1/accounts").set(as(guardian.auth, memberId)).expect(200)).body;
    expect(theirs.content.map((a: { id: string }) => a.id)).toEqual([created.id]);
    // Sem o cabeçalho, continua a ver as suas
    const mine = (await api().get("/api/v1/accounts").set(guardian.auth)).body;
    expect(mine.content.map((a: { name: string }) => a.name)).toEqual(["Banco"]);

    const me = (await api().get("/api/v1/auth/me").set(as(guardian.auth, memberId)).expect(200)).body;
    expect(me).toMatchObject({ id: guardian.user.id, actingAs: { id: memberId, name: "Filho", email: "filho@exemplo.com", access: "MANAGE" } });
  });

  it("com VIEW, só lê", async () => {
    const guardian = await signUp();
    const link = await addDependent(guardian.auth, "VIEW");
    const headers = as(guardian.auth, link.person.id);

    await api().get("/api/v1/transactions").set(headers).expect(200);
    await api().get("/api/v1/dashboard").set(headers).expect(200);
    const res = await api().post("/api/v1/accounts").set(headers).send({ name: "X", type: "CASH", color: "#16a34a" }).expect(403);
    expect(res.body.detail).toBe("Só tem acesso de leitura às contas de Filho.");
    await api().put("/api/v1/settings").set(headers).send({ name: "Hack", email: "h@x.com", currency: "MZN" }).expect(403);
  });

  it("recusa pessoas sem ligação activa", async () => {
    const guardian = await signUp();
    const stranger = await signUp();
    const denied = await api().get("/api/v1/accounts").set(as(guardian.auth, stranger.user.id)).expect(403);
    expect(denied.body.detail).toBe("Não tem acesso às contas desta pessoa.");
    await api().get("/api/v1/accounts").set(as(guardian.auth, "nao-e-uuid")).expect(403);

    // Ligação terminada deixa de dar acesso
    const link = await addDependent(guardian.auth, "MANAGE");
    await api().get("/api/v1/accounts").set(as(guardian.auth, link.person.id)).expect(200);
    await api().delete(`/api/v1/family/links/${link.id}`).set(guardian.auth).expect(204);
    await api().get("/api/v1/accounts").set(as(guardian.auth, link.person.id)).expect(403);
    expect((await api().get("/api/v1/auth/me").set(as(guardian.auth, link.person.id))).body.actingAs).toBeNull();

    // O dependente não pode agir pelo responsável (a ligação é num só sentido)
    const other = await addDependent(guardian.auth, "MANAGE", "neta@exemplo.com");
    const child = await login("neta@exemplo.com");
    await api().get("/api/v1/accounts").set(as(child.auth, guardian.user.id)).expect(403);
    expect(other.status).toBe("ACTIVE");

    // Família desligada: o cabeçalho deixa de valer
    await setSetting("family.enabled", false);
    await api().get("/api/v1/accounts").set(as(guardian.auth, other.person.id)).expect(403);
  });

  it("/admin, /family, /auth e /access ignoram o cabeçalho", async () => {
    const guardian = await signUp();
    const link = await addDependent(guardian.auth, "VIEW");
    const headers = as(guardian.auth, link.person.id);

    // Na família continua a ser o próprio (e pode escrever, mesmo com acesso VIEW ao dependente)
    expect((await api().get("/api/v1/family").set(headers).expect(200)).body.dependents).toHaveLength(1);
    await api().patch(`/api/v1/family/links/${link.id}`).set(headers).send({ access: "MANAGE" }).expect(200);
    // O menu é o do responsável (USER tem investimentos, o dependente não)
    const menu = (await api().get("/api/v1/access/menu").set(headers).expect(200)).body;
    expect(JSON.stringify(menu)).toContain("INVESTMENTS");
    // Um cabeçalho inválido também não estraga estas rotas
    await api().get("/api/v1/access/menu").set(as(guardian.auth, "lixo")).expect(200);
    await api().get("/api/v1/admin/users").set(as(guardian.auth, "lixo")).expect(403);
  });
});
