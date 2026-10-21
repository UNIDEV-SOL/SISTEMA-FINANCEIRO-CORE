import type { Prisma, Profile } from "../../generated/prisma";
import { ACTIONS } from "../../shared/access/actions";
import { accessPolicy } from "../../shared/access/policy";
import { prisma } from "../../shared/db/prisma";
import { ConflictException, NotFoundException, ValidationException, type FieldError } from "../../shared/errors/http-exceptions";
import { orderByOf, toPage, type Page, type PageRequest } from "../../shared/http/pagination";
import { throwIfInvalid } from "../../shared/http/validation";
import { appSettings } from "../../shared/settings/app-settings";
import type { PermissionsInput, PROFILE_SORTS, ProfileCreateInput, ProfileUpdateInput } from "./profiles.schemas";
import type { PermissionResponse, ProfileResponse } from "./profiles.types";

type WithCount = Profile & { _count: { users: number } };
const withCount = { _count: { select: { users: true } } } as const;

const toResponse = (p: WithCount): ProfileResponse => ({
  id: p.id,
  code: p.code,
  name: p.name,
  description: p.description,
  superAdmin: p.superAdmin,
  system: p.system,
  isDefault: p.isDefault,
  userCount: p._count.users,
  createdAt: p.createdAt.toISOString(),
  updatedAt: p.updatedAt.toISOString(),
});

/** "Gestor de equipa" → "GESTOR_DE_EQUIPA". */
export function codeFromName(name: string): string {
  const base = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 36);
  return /^[A-Z]/.test(base) ? base : `P_${base}`.replace(/_+$/, "");
}

async function uniqueCode(base: string): Promise<string> {
  const taken = new Set((await prisma.profile.findMany({ where: { code: { startsWith: base } }, select: { code: true } })).map((p) => p.code));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}_${n}`)) n += 1;
  return `${base}_${n}`;
}

async function findOrThrow(id: string): Promise<WithCount> {
  const profile = await prisma.profile.findUnique({ where: { id }, include: withCount });
  if (!profile) throw new NotFoundException("O perfil");
  return profile;
}

/** Marca como perfil por omissão (só um de cada vez). */
async function makeDefault(tx: Prisma.TransactionClient, id: string) {
  await tx.profile.updateMany({ where: { isDefault: true, id: { not: id } }, data: { isDefault: false } });
}

export const profilesService = {
  async list(page: PageRequest<(typeof PROFILE_SORTS)[number]>): Promise<Page<ProfileResponse>> {
    const where: Prisma.ProfileWhereInput = page.search
      ? { OR: [{ name: { contains: page.search, mode: "insensitive" } }, { code: { contains: page.search, mode: "insensitive" } }] }
      : {};
    const [items, total] = await Promise.all([
      prisma.profile.findMany({ where, include: withCount, orderBy: orderByOf(page.sort, [{ name: "asc" }]), skip: page.skip, take: page.size }),
      prisma.profile.count({ where }),
    ]);
    return toPage(items.map(toResponse), total, page);
  },

  async get(id: string): Promise<ProfileResponse> {
    return toResponse(await findOrThrow(id));
  },

  async create(input: ProfileCreateInput): Promise<ProfileResponse> {
    let code: string;
    if (input.code) {
      if (await prisma.profile.findUnique({ where: { code: input.code }, select: { id: true } }))
        throw ValidationException.field("code", "Já existe um perfil com este código.");
      code = input.code;
    } else {
      code = await uniqueCode(codeFromName(input.name));
    }
    const profile = await prisma.$transaction(async (tx) => {
      const created = await tx.profile.create({ data: { code, name: input.name, description: input.description ?? null } });
      if (input.isDefault) {
        await makeDefault(tx, created.id);
        await tx.profile.update({ where: { id: created.id }, data: { isDefault: true } });
      }
      return tx.profile.findUniqueOrThrow({ where: { id: created.id }, include: withCount });
    });
    return toResponse(profile);
  },

  async update(id: string, input: ProfileUpdateInput): Promise<ProfileResponse> {
    const current = await findOrThrow(id);
    if (input.isDefault && current.superAdmin)
      throw ValidationException.field("isDefault", "O perfil de super administrador não pode ser dado no registo.");
    if (input.isDefault === false && current.isDefault)
      throw ValidationException.field("isDefault", "Tem de existir um perfil por omissão: marque outro perfil como omissão.");
    const profile = await prisma.$transaction(async (tx) => {
      if (input.isDefault) await makeDefault(tx, id);
      return tx.profile.update({
        where: { id },
        data: { name: input.name, description: input.description ?? null, isDefault: input.isDefault },
        include: withCount,
      });
    });
    return toResponse(profile);
  },

  async remove(id: string): Promise<void> {
    const profile = await findOrThrow(id);
    if (profile.system) throw new ConflictException("Os perfis de sistema não podem ser apagados.");
    if (profile._count.users > 0) throw new ConflictException(`O perfil está atribuído a ${profile._count.users} utilizador(es). Mude-lhes o perfil primeiro.`);
    if (profile.isDefault) throw new ConflictException("É o perfil por omissão. Marque outro perfil como omissão primeiro.");
    if ((await appSettings.get("family.dependentProfile")) === profile.code)
      throw new ConflictException("É o perfil das contas de dependentes (parâmetro family.dependentProfile). Escolha outro primeiro.");
    await prisma.profile.delete({ where: { id } });
    accessPolicy.invalidate();
  },

  async permissions(id: string): Promise<PermissionResponse[]> {
    await findOrThrow(id);
    const links = await prisma.profileFunctionality.findMany({
      where: { profileId: id },
      include: { functionality: { select: { code: true, order: true } } },
    });
    return links
      .sort((a, b) => a.functionality.code.localeCompare(b.functionality.code))
      .map((l) => ({ functionalityId: l.functionalityId, code: l.functionality.code, actions: ACTIONS.filter((a) => l.actions.includes(a)) }));
  },

  /** Substitui todas as permissões do perfil. Funcionalidades sem acções ficam sem ligação. */
  async replacePermissions(id: string, input: PermissionsInput): Promise<PermissionResponse[]> {
    const profile = await findOrThrow(id);
    if (profile.superAdmin) throw new ConflictException("O perfil de super administrador tem acesso total e não é configurável.");

    const ids = input.items.map((i) => i.functionalityId);
    const existing = new Set((await prisma.functionality.findMany({ where: { id: { in: ids } }, select: { id: true } })).map((f) => f.id));
    const errors: FieldError[] = [];
    const seen = new Set<string>();
    input.items.forEach((item, i) => {
      if (!existing.has(item.functionalityId)) errors.push({ field: `items.${i}.functionalityId`, message: "A funcionalidade não existe." });
      else if (seen.has(item.functionalityId)) errors.push({ field: `items.${i}.functionalityId`, message: "Funcionalidade repetida." });
      seen.add(item.functionalityId);
    });
    throwIfInvalid(errors);

    const rows = input.items
      .map((i) => ({ profileId: id, functionalityId: i.functionalityId, actions: ACTIONS.filter((a) => i.actions.includes(a)) }))
      .filter((r) => r.actions.length > 0);
    await prisma.$transaction([
      prisma.profileFunctionality.deleteMany({ where: { profileId: id } }),
      prisma.profileFunctionality.createMany({ data: rows }),
      prisma.profile.update({ where: { id }, data: { updatedAt: new Date() } }),
    ]);
    accessPolicy.invalidate();
    return this.permissions(id);
  },
};
