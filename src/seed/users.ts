import { env } from "../config/env";
import { prisma } from "../shared/db/prisma";
import { createUserAccount } from "../modules/auth/user-accounts";

async function profileId(code: string) {
  return (await prisma.profile.findUniqueOrThrow({ where: { code }, select: { id: true } })).id;
}

/**
 * Super administrador inicial (ADMIN_NAME / ADMIN_EMAIL / ADMIN_PASSWORD).
 * Se já existir, garante o perfil e a conta activa, sem mudar a palavra-passe.
 */
export async function seedSuperAdmin() {
  const email = env.ADMIN_EMAIL.trim().toLowerCase();
  const superAdmin = await profileId("SUPER_ADMIN");
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) {
    await prisma.user.update({ where: { id: existing.id }, data: { profileId: superAdmin, active: true } });
    return { email, created: false };
  }
  await createUserAccount({ name: env.ADMIN_NAME, email, password: env.ADMIN_PASSWORD, profileId: superAdmin });
  return { email, created: true };
}

/** Utilizador de demonstração com o perfil USER; devolve o id. */
export async function seedDemoUser(demo: { name: string; email: string; password: string }) {
  const existing = await prisma.user.findUnique({ where: { email: demo.email }, select: { id: true } });
  if (existing) return existing.id;
  return (await createUserAccount({ ...demo, profileId: await profileId("USER") })).id;
}
