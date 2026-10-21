import type { FamilyAccess } from "../../generated/prisma";
import { prisma } from "../db/prisma";
import { appSettings } from "../settings/app-settings";
import { accessPolicy, type ProfileRef } from "./policy";

/** Como se chegou à conta: ligação familiar ou permissão de administração (ADMIN_USER_DATA). */
export type ActingVia = "FAMILY" | "ADMIN";

export interface ActingAs {
  id: string;
  name: string;
  email: string;
  access: FamilyAccess;
  via: ActingVia;
}

/** Quem iniciou sessão. */
export interface Actor {
  id: string;
  profile: ProfileRef;
}

/** Funcionalidade-permissão: VIEW = ver as contas de qualquer utilizador activo; EDIT = também alterar. */
export const ADMIN_USER_DATA = "ADMIN_USER_DATA";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Rotas que usam sempre o próprio utilizador, mesmo com o cabeçalho X-Acting-As. */
const IGNORES_ACTING_AS = /^\/(admin|family|auth|access)(\/|$)/;

export const ignoresActingAs = (path: string) => IGNORES_ACTING_AS.test(path);

/** Acesso às contas de qualquer utilizador dado pelo perfil (null se não tiver). O super administrador gere tudo. */
export async function adminUserDataAccess(profile: ProfileRef): Promise<FamilyAccess | null> {
  if (profile.superAdmin) return "MANAGE";
  const actions = await accessPolicy.actionsOn(profile, ADMIN_USER_DATA);
  if (actions.has("EDIT")) return "MANAGE";
  return actions.size > 0 ? "VIEW" : null;
}

/**
 * Pessoa por quem quem iniciou sessão pode agir, ou null.
 * Primeiro a ligação familiar ACTIVE (com `family.enabled`); senão a permissão ADMIN_USER_DATA,
 * que dá acesso a qualquer utilizador activo (excepto super administradores, para quem não o é).
 */
export async function findActingAs(actor: Actor, targetId: string): Promise<ActingAs | null> {
  if (!UUID.test(targetId) || targetId === actor.id) return null;

  if (await appSettings.get("family.enabled")) {
    const link = await prisma.familyLink.findUnique({
      where: { guardianId_memberId: { guardianId: actor.id, memberId: targetId } },
      select: { status: true, access: true, member: { select: { id: true, name: true, email: true, active: true } } },
    });
    if (link?.status === "ACTIVE" && link.member.active)
      return { id: link.member.id, name: link.member.name, email: link.member.email, access: link.access, via: "FAMILY" };
  }

  const access = await adminUserDataAccess(actor.profile);
  if (!access) return null;
  const user = await prisma.user.findUnique({
    where: { id: targetId },
    select: { id: true, name: true, email: true, active: true, profile: { select: { superAdmin: true } } },
  });
  if (!user?.active || (user.profile.superAdmin && !actor.profile.superAdmin)) return null;
  return { id: user.id, name: user.name, email: user.email, access, via: "ADMIN" };
}
