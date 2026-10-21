import type { Prisma } from "../../generated/prisma";
import { adminUserDataAccess, findActingAs, type ActingAs, type Actor } from "../../shared/access/acting-as";
import { accessPolicy, type FunctionalityEntry, type ProfileRef } from "../../shared/access/policy";
import { prisma } from "../../shared/db/prisma";
import { ForbiddenException } from "../../shared/errors/http-exceptions";
import { orderByOf, toPage, type Page, type PageRequest } from "../../shared/http/pagination";
import { appSettings } from "../../shared/settings/app-settings";
import type { ACTING_CANDIDATE_SORTS } from "./access.schemas";
import type { ActingCandidate, MenuNode } from "./access.types";

export const NO_ACCESS_TO_PERSON = "Não tem acesso às contas desta pessoa.";

const byOrder = (a: { order: number; label: string }, b: { order: number; label: string }) => a.order - b.order || a.label.localeCompare(b.label, "pt");

export const accessService = {
  /**
   * Menu do perfil: entradas com página que o perfil pode ver; secções só com filhos visíveis.
   * O super administrador vê tudo, incluindo o que está desactivado.
   */
  async menu(profile: ProfileRef): Promise<MenuNode[]> {
    const items = await accessPolicy.tree(profile);
    const childrenOf = new Map<string | null, typeof items>();
    for (const item of items) {
      const list = childrenOf.get(item.entry.parentId) ?? [];
      list.push(item);
      childrenOf.set(item.entry.parentId, list);
    }
    const visible = (entry: FunctionalityEntry, actions: unknown[]) => profile.superAdmin || (entry.active && actions.length > 0);

    const build = (parentId: string | null, seen: Set<string>): MenuNode[] =>
      (childrenOf.get(parentId) ?? [])
        .filter((item) => !seen.has(item.entry.id))
        .sort((a, b) => byOrder(a.entry, b.entry))
        .flatMap((item) => {
          const { entry, actions } = item;
          // Uma secção desactivada esconde tudo o que está dentro
          if (!profile.superAdmin && !entry.active) return [];
          const children = build(entry.id, new Set(seen).add(entry.id));
          // Entradas sem página dentro de uma secção (ex.: ADMIN_USER_DATA) são só permissões: aparecem com path null
          const shown = entry.path || entry.parentId ? visible(entry, actions) || children.length > 0 : children.length > 0;
          if (!shown) return [];
          return [{ code: entry.code, label: entry.label, path: entry.path, icon: entry.icon, order: entry.order, actions, children }];
        });

    return build(null, new Set());
  },

  /**
   * Pessoas por quem quem iniciou sessão pode agir (para o selector com scroll infinito), por nome:
   * dependentes com ligação ACTIVE e, com a permissão ADMIN_USER_DATA, todos os utilizadores activos
   * (excepto o próprio e, para quem não é super administrador, os super administradores).
   */
  async actingCandidates(actor: Actor, page: PageRequest<(typeof ACTING_CANDIDATE_SORTS)[number]>): Promise<Page<ActingCandidate>> {
    const [familyOn, adminAccess] = await Promise.all([appSettings.get("family.enabled"), adminUserDataAccess(actor.profile)]);
    if (!familyOn && !adminAccess) return toPage([], 0, page);

    const linked: Prisma.UserWhereInput = { guardians: { some: { guardianId: actor.id, status: "ACTIVE" } } };
    const and: Prisma.UserWhereInput[] = [{ active: true }, { id: { not: actor.id } }];
    if (!adminAccess) and.push(linked);
    else if (!actor.profile.superAdmin) and.push({ OR: [{ profile: { superAdmin: false } }, ...(familyOn ? [linked] : [])] });
    if (page.search) and.push({ OR: [{ name: { contains: page.search, mode: "insensitive" } }, { email: { contains: page.search, mode: "insensitive" } }] });
    const where: Prisma.UserWhereInput = { AND: and };

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: { id: true, name: true, email: true, guardians: { where: { guardianId: actor.id, status: "ACTIVE" }, select: { access: true } } },
        orderBy: orderByOf<Prisma.UserOrderByWithRelationInput>(page.sort, [{ name: "asc" }], { id: "asc" }),
        skip: page.skip,
        take: page.size,
      }),
      prisma.user.count({ where }),
    ]);
    return toPage(
      users.map((u) => {
        const link = familyOn ? u.guardians[0] : undefined;
        return link
          ? { id: u.id, name: u.name, email: u.email, via: "FAMILY" as const, access: link.access }
          : { id: u.id, name: u.name, email: u.email, via: "ADMIN" as const, access: adminAccess! };
      }),
      total,
      page,
    );
  },

  /** Valida a mudança de conta (o front chama-a ao escolher a pessoa); a auditoria regista VIEW_AS. */
  async startActingAs(actor: Actor, userId: string): Promise<ActingAs> {
    const actingAs = await findActingAs(actor, userId);
    if (!actingAs) throw new ForbiddenException(NO_ACCESS_TO_PERSON);
    return actingAs;
  },
};
