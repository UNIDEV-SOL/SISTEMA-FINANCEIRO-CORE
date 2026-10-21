import bcrypt from "bcryptjs";
import { env } from "../../config/env";
import type { Prisma, User } from "../../generated/prisma";
import { prisma } from "../../shared/db/prisma";
import { ValidationException } from "../../shared/errors/http-exceptions";
import { appSettings } from "../../shared/settings/app-settings";
import { defaultCategoryRows } from "../categories/default-categories";

// Nos testes o custo baixo poupa segundos por utilizador criado
export const BCRYPT_ROUNDS = env.NODE_ENV === "test" ? 4 : 12;

export const hashPassword = (password: string) => bcrypt.hash(password, BCRYPT_ROUNDS);

export interface NewAccount {
  name: string;
  email: string;
  password: string;
  profileId: string;
  active?: boolean;
}

type Db = Prisma.TransactionClient | typeof prisma;

export async function ensureEmailFree(email: string, exceptId?: string, db: Db = prisma) {
  const clash = await db.user.findFirst({ where: { email, id: exceptId ? { not: exceptId } : undefined }, select: { id: true } });
  if (clash) throw ValidationException.field("email", "Já existe uma conta com este email.");
}

/** Perfil dado a quem se regista (`isDefault`). */
export async function defaultProfileId(db: Db = prisma): Promise<string> {
  const profile =
    (await db.profile.findFirst({ where: { isDefault: true }, select: { id: true } })) ??
    (await db.profile.findUnique({ where: { code: "USER" }, select: { id: true } }));
  if (!profile) throw new Error("Não existe perfil por omissão: corra `yarn seed`.");
  return profile.id;
}

/** Moeda das contas novas: o parâmetro, se a moeda estiver activa; senão a primeira activa. */
async function defaultCurrency(db: Db): Promise<string> {
  const code = await appSettings.get("locale.defaultCurrency");
  const currency =
    (await db.currency.findFirst({ where: { code, active: true }, select: { code: true } })) ??
    (await db.currency.findFirst({ where: { active: true }, orderBy: { order: "asc" }, select: { code: true } }));
  if (!currency) throw new Error("Não há moedas activas: corra `yarn seed`.");
  return currency.code;
}

/**
 * Cria a conta com as categorias por omissão e as definições de alertas iniciais (dos parâmetros).
 * Usado no registo, no painel de administração, na família e no seed.
 */
export async function createUserAccount(input: NewAccount, db: Db = prisma): Promise<User> {
  await ensureEmailFree(input.email, undefined, db);
  const alerts = await appSettings.many("alerts.defaultBudgetThreshold", "alerts.defaultBillDaysAhead", "alerts.defaultLowBalance");
  return db.user.create({
    data: {
      name: input.name,
      email: input.email,
      password: await hashPassword(input.password),
      currency: await defaultCurrency(db),
      profileId: input.profileId,
      active: input.active ?? true,
      alertSettings: {
        create: {
          email: input.email,
          budgetThreshold: alerts["alerts.defaultBudgetThreshold"],
          billDaysAhead: alerts["alerts.defaultBillDaysAhead"],
          lowBalanceAmount: alerts["alerts.defaultLowBalance"],
        },
      },
      categories: { createMany: { data: defaultCategoryRows() } },
    },
  });
}
