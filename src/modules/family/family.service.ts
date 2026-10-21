import type { FamilyAccess, FamilyLink } from "../../generated/prisma";
import { prisma } from "../../shared/db/prisma";
import { ConflictException, ForbiddenException, NotFoundException, ValidationException } from "../../shared/errors/http-exceptions";
import { appSettings } from "../../shared/settings/app-settings";
import { createUserAccount, defaultProfileId } from "../auth/user-accounts";
import type { DependentCreateInput, InvitationCreateInput } from "./family.schemas";
import type { FamilyLinkView, FamilyOverview } from "./family.types";

type Person = { id: string; name: string; email: string };
type LinkWithPeople = FamilyLink & { guardian: Person; member: Person };

const people = { guardian: { select: { id: true, name: true, email: true } }, member: { select: { id: true, name: true, email: true } } } as const;

/** Vista de quem pergunta: `person` é sempre o outro lado. */
const toView = (link: LinkWithPeople, viewerId: string): FamilyLinkView => ({
  id: link.id,
  access: link.access,
  status: link.status,
  createdAt: link.createdAt.toISOString(),
  respondedAt: link.respondedAt?.toISOString() ?? null,
  person: link.guardianId === viewerId ? link.member : link.guardian,
});

async function ensureEnabled() {
  if (!(await appSettings.get("family.enabled"))) throw new ForbiddenException("A gestão familiar está desactivada.");
}

/** Limite de pessoas a cargo (ligações activas e convites pendentes). */
async function ensureBelowLimit(guardianId: string) {
  const [max, count] = await Promise.all([
    appSettings.get("family.maxDependents"),
    prisma.familyLink.count({ where: { guardianId, status: { in: ["PENDING", "ACTIVE"] } } }),
  ]);
  if (count >= max) throw new ConflictException(`Atingiu o limite de ${max} dependente(s).`);
}

async function findLink(id: string): Promise<LinkWithPeople> {
  const link = await prisma.familyLink.findUnique({ where: { id }, include: people });
  if (!link) throw new NotFoundException("A ligação");
  return link;
}

/** Perfil das contas de dependentes (parâmetro), ou o por omissão se tiver sido apagado. */
async function dependentProfileId(): Promise<string> {
  const code = await appSettings.get("family.dependentProfile");
  const profile = await prisma.profile.findFirst({ where: { code, superAdmin: false }, select: { id: true } });
  return profile?.id ?? defaultProfileId();
}

export const familyService = {
  async overview(userId: string): Promise<FamilyOverview> {
    const links = await prisma.familyLink.findMany({
      where: { OR: [{ guardianId: userId }, { memberId: userId }], status: { not: "REVOKED" } },
      include: people,
      orderBy: { createdAt: "asc" },
    });
    return {
      dependents: links.filter((l) => l.guardianId === userId).map((l) => toView(l, userId)),
      guardians: links.filter((l) => l.memberId === userId && l.status === "ACTIVE").map((l) => toView(l, userId)),
      invitations: links.filter((l) => l.memberId === userId && l.status === "PENDING").map((l) => toView(l, userId)),
    };
  },

  /** Cria a conta do dependente (com categorias e alertas) e a ligação já activa. */
  async createDependent(guardianId: string, input: DependentCreateInput): Promise<FamilyLinkView> {
    await ensureEnabled();
    await ensureBelowLimit(guardianId);
    const profileId = await dependentProfileId();
    const link = await prisma.$transaction(async (tx) => {
      const member = await createUserAccount({ name: input.name, email: input.email, password: input.password, profileId }, tx);
      return tx.familyLink.create({
        data: { guardianId, memberId: member.id, access: input.access, status: "ACTIVE", respondedAt: new Date() },
        include: people,
      });
    });
    return toView(link, guardianId);
  },

  /** Convida uma conta que já existe; fica pendente até a pessoa aceitar. */
  async invite(guardianId: string, input: InvitationCreateInput): Promise<FamilyLinkView> {
    await ensureEnabled();
    const member = await prisma.user.findUnique({ where: { email: input.email }, select: { id: true, active: true } });
    if (!member || !member.active) throw ValidationException.field("email", "Não existe nenhuma conta activa com este email.");
    if (member.id === guardianId) throw ValidationException.field("email", "Não se pode convidar a si próprio.");
    const existing = await prisma.familyLink.findUnique({ where: { guardianId_memberId: { guardianId, memberId: member.id } } });
    if (existing && existing.status !== "REVOKED")
      throw ValidationException.field("email", existing.status === "PENDING" ? "Já enviou um convite a esta pessoa." : "Já está ligado a esta pessoa.");
    await ensureBelowLimit(guardianId);

    // Uma ligação revogada é reaproveitada (há uma por par)
    const data = { access: input.access, status: "PENDING" as const, createdAt: new Date(), respondedAt: null };
    const link = await prisma.familyLink.upsert({
      where: { guardianId_memberId: { guardianId, memberId: member.id } },
      create: { guardianId, memberId: member.id, ...data },
      update: data,
      include: people,
    });
    return toView(link, guardianId);
  },

  /** Só a pessoa convidada responde, e só a convites pendentes. */
  async respond(memberId: string, id: string, accept: boolean): Promise<FamilyLinkView> {
    if (accept) await ensureEnabled();
    const link = await findLink(id);
    if (link.memberId !== memberId) throw new NotFoundException("O convite");
    if (link.status !== "PENDING") throw new ConflictException("Este convite já foi respondido.");
    const updated = await prisma.familyLink.update({
      where: { id },
      data: { status: accept ? "ACTIVE" : "REVOKED", respondedAt: new Date() },
      include: people,
    });
    return toView(updated, memberId);
  },

  async updateAccess(guardianId: string, id: string, access: FamilyAccess): Promise<FamilyLinkView> {
    const link = await findLink(id);
    if (link.guardianId !== guardianId) {
      // O membro vê a ligação, mas não pode mudar o acesso que deu
      if (link.memberId === guardianId) throw new ForbiddenException("Só o responsável pode alterar o tipo de acesso.");
      throw new NotFoundException("A ligação");
    }
    if (link.status === "REVOKED") throw new ConflictException("A ligação foi terminada.");
    const updated = await prisma.familyLink.update({ where: { id }, data: { access }, include: people });
    return toView(updated, guardianId);
  },

  /** Qualquer dos lados pode terminar a ligação. */
  async revoke(userId: string, id: string): Promise<void> {
    const link = await findLink(id);
    if (link.guardianId !== userId && link.memberId !== userId) throw new NotFoundException("A ligação");
    if (link.status === "REVOKED") return;
    await prisma.familyLink.update({ where: { id }, data: { status: "REVOKED", respondedAt: new Date() } });
  },
};
