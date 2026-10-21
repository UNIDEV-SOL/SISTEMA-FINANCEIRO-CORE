import type { Request } from "express";
import type { Prisma, Profile, User } from "../../generated/prisma";
import { prisma } from "../../shared/db/prisma";
import { ConflictException, ForbiddenException, NotFoundException, ValidationException } from "../../shared/errors/http-exceptions";
import { orderByOf, toPage, type Page, type PageRequest } from "../../shared/http/pagination";
import { createUserAccount, ensureEmailFree, hashPassword } from "../auth/user-accounts";
import type { ADMIN_USER_SORTS, AdminUserCreateInput, AdminUserUpdateInput } from "./admin-users.schemas";
import type { AdminUserResponse } from "./admin-users.types";

type Actor = NonNullable<Request["user"]>;
type UserWithProfile = User & { profile: Profile };

const toResponse = (u: UserWithProfile): AdminUserResponse => ({
  id: u.id,
  name: u.name,
  email: u.email,
  active: u.active,
  profile: { id: u.profile.id, code: u.profile.code, name: u.profile.name, superAdmin: u.profile.superAdmin },
  currency: u.currency,
  createdAt: u.createdAt.toISOString(),
  lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
});

async function findOrThrow(id: string): Promise<UserWithProfile> {
  const user = await prisma.user.findUnique({ where: { id }, include: { profile: true } });
  if (!user) throw new NotFoundException("O utilizador");
  return user;
}

async function profileOrFail(profileId: string): Promise<Profile> {
  const profile = await prisma.profile.findUnique({ where: { id: profileId } });
  if (!profile) throw ValidationException.field("profileId", "O perfil não existe.");
  return profile;
}

/** Só um super administrador mexe noutro super administrador ou atribui esse perfil. */
function guardSuperAdmin(actor: Actor, target?: UserWithProfile, profile?: Profile) {
  if (actor.profile.superAdmin) return;
  if (target?.profile.superAdmin) throw new ForbiddenException("Só um super administrador pode alterar outro super administrador.");
  if (profile?.superAdmin) throw new ForbiddenException("Só um super administrador pode atribuir este perfil.");
}

/** Impede ficar sem nenhum super administrador activo. */
async function guardLastSuperAdmin(target: UserWithProfile) {
  if (!target.profile.superAdmin || !target.active) return;
  const others = await prisma.user.count({ where: { id: { not: target.id }, active: true, profile: { superAdmin: true } } });
  if (others === 0) throw new ConflictException("Tem de existir pelo menos um super administrador activo.");
}

export const adminUsersService = {
  async list(page: PageRequest<(typeof ADMIN_USER_SORTS)[number]>, filters: { profileId?: string; active?: boolean }): Promise<Page<AdminUserResponse>> {
    const where: Prisma.UserWhereInput = { profileId: filters.profileId, active: filters.active };
    if (page.search) where.OR = [{ name: { contains: page.search, mode: "insensitive" } }, { email: { contains: page.search, mode: "insensitive" } }];
    const [users, total] = await Promise.all([
      prisma.user.findMany({ where, include: { profile: true }, orderBy: orderByOf(page.sort, [{ name: "asc" }]), skip: page.skip, take: page.size }),
      prisma.user.count({ where }),
    ]);
    return toPage(users.map(toResponse), total, page);
  },

  async get(id: string): Promise<AdminUserResponse> {
    return toResponse(await findOrThrow(id));
  },

  async create(actor: Actor, input: AdminUserCreateInput): Promise<AdminUserResponse> {
    const profile = await profileOrFail(input.profileId);
    guardSuperAdmin(actor, undefined, profile);
    const user = await createUserAccount(input);
    return this.get(user.id);
  },

  async update(actor: Actor, id: string, input: AdminUserUpdateInput): Promise<AdminUserResponse> {
    const target = await findOrThrow(id);
    const profile = await profileOrFail(input.profileId);
    guardSuperAdmin(actor, target, profile);
    if (!profile.superAdmin) await guardLastSuperAdmin(target);
    await ensureEmailFree(input.email, id);
    const user = await prisma.user.update({ where: { id }, data: input, include: { profile: true } });
    return toResponse(user);
  },

  async setActive(actor: Actor, id: string, active: boolean): Promise<AdminUserResponse> {
    const target = await findOrThrow(id);
    guardSuperAdmin(actor, target);
    if (!active) {
      if (id === actor.actorId) throw new ConflictException("Não pode desactivar a sua própria conta.");
      await guardLastSuperAdmin(target);
    }
    const user = await prisma.user.update({ where: { id }, data: { active }, include: { profile: true } });
    return toResponse(user);
  },

  async resetPassword(actor: Actor, id: string, password: string): Promise<void> {
    const target = await findOrThrow(id);
    guardSuperAdmin(actor, target);
    await prisma.user.update({ where: { id }, data: { password: await hashPassword(password) } });
  },
};
