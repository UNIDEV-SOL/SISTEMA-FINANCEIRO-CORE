import request from "supertest";
import { app } from "../src/app";
import { createUserAccount } from "../src/modules/auth/user-accounts";
import { prisma } from "../src/shared/db/prisma";
import { flushAudit } from "../src/shared/middleware/audit";
import { appSettings } from "../src/shared/settings/app-settings";

export const api = () => request(app);

type Auth = Record<string, string>;

let counter = 0;

/** Regista um utilizador novo (perfil por omissão, USER) e devolve o cabeçalho Authorization. */
export async function signUp() {
  counter += 1;
  const res = await api()
    .post("/api/v1/auth/register")
    .send({ name: "Ana Teste", email: `ana${counter}@exemplo.com`, password: "segredo123" })
    .expect(201);
  return { auth: { Authorization: `Bearer ${res.body.token}` } as Auth, user: res.body.user as { id: string; email: string; name: string } };
}

/** Cria um utilizador com o perfil indicado (pelo código) e inicia sessão. */
export async function signUpAs(profileCode: string, name = "Utilizador Teste") {
  counter += 1;
  const email = `${profileCode.toLowerCase()}${counter}@exemplo.com`;
  const { id: profileId } = await prisma.profile.findUniqueOrThrow({ where: { code: profileCode } });
  const user = await createUserAccount({ name, email, password: "segredo123", profileId });
  return { ...(await login(email)), user: { id: user.id, email, name } };
}

export async function login(email: string, password = "segredo123") {
  const res = await api().post("/api/v1/auth/login").send({ email, password }).expect(200);
  return { auth: { Authorization: `Bearer ${res.body.token}` } as Auth, token: res.body.token as string };
}

/** Utilizador com uma conta bancária e ids das categorias por nome. */
export async function setup(initialBalance = "1000") {
  const session = await signUp();
  const bank = (
    await api()
      .post("/api/v1/accounts")
      .set(session.auth)
      .send({ name: "Banco", type: "BANK", color: "#2563eb", initialBalance, includeInTotal: true })
      .expect(201)
  ).body;
  const categories = await prisma.category.findMany({ where: { userId: session.user.id } });
  const cat = (name: string) => categories.find((c) => c.name === name)!.id;
  return { ...session, bank, cat };
}

export async function addTransaction(auth: Auth, body: Record<string, unknown>) {
  return (await api().post("/api/v1/transactions").set(auth).send(body).expect(201)).body;
}

/** Altera um parâmetro do sistema directamente (sem passar pela API). */
export async function setSetting(key: string, value: unknown) {
  await prisma.systemSetting.update({ where: { key }, data: { value: value as never } });
  appSettings.invalidate();
}

/** Abre um ano (cria-o se faltar); por omissão só o ano corrente está aberto. */
export async function openYear(year: number) {
  await prisma.period.upsert({ where: { year }, create: { year, status: "OPEN" }, update: { status: "OPEN" } });
}

/** Linhas de auditoria, depois de as escritas pendentes terminarem. */
export async function auditRows() {
  await flushAudit();
  return prisma.auditLog.findMany({ orderBy: { createdAt: "asc" } });
}
