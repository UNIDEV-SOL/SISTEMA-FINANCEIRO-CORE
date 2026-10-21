import { TZDate } from "@date-fns/tz";
import { env } from "../../config/env";
import type { AuditLog, Prisma } from "../../generated/prisma";
import { prisma } from "../../shared/db/prisma";
import { orderByOf, toPage, type Page, type PageRequest } from "../../shared/http/pagination";
import type { AUDIT_ACTIONS, AUDIT_SORTS } from "./audit.schemas";
import type { AuditLogResponse } from "./audit.types";

interface Filters {
  action?: (typeof AUDIT_ACTIONS)[number];
  actorId?: string;
  from?: string;
  to?: string;
}

/** Início do dia `iso` no fuso da aplicação. */
const startOfDay = (iso: string, days = 0) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(new TZDate(y, m - 1, d + days, env.APP_TZ).getTime());
};

const toResponse = (log: AuditLog, names: Map<string, string>): AuditLogResponse => ({
  id: log.id,
  actorId: log.actorId,
  actorName: log.actorName,
  actingAsId: log.actingAsId,
  actingAsName: log.actingAsId ? (names.get(log.actingAsId) ?? null) : null,
  action: log.action,
  method: log.method,
  path: log.path,
  statusCode: log.statusCode,
  functionalityCode: log.functionalityCode,
  ip: log.ip,
  userAgent: log.userAgent,
  durationMs: log.durationMs,
  details: log.details ?? null,
  createdAt: log.createdAt.toISOString(),
});

export const auditService = {
  /** Mais recentes primeiro; `search` procura no nome de quem fez e no caminho. */
  async list(page: PageRequest<(typeof AUDIT_SORTS)[number]>, filters: Filters): Promise<Page<AuditLogResponse>> {
    const where: Prisma.AuditLogWhereInput = { action: filters.action, actorId: filters.actorId };
    if (filters.from || filters.to)
      where.createdAt = { gte: filters.from ? startOfDay(filters.from) : undefined, lt: filters.to ? startOfDay(filters.to, 1) : undefined };
    if (page.search) where.OR = [{ actorName: { contains: page.search, mode: "insensitive" } }, { path: { contains: page.search, mode: "insensitive" } }];

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({ where, orderBy: orderByOf(page.sort, [{ createdAt: "desc" }]), skip: page.skip, take: page.size }),
      prisma.auditLog.count({ where }),
    ]);
    const ids = [...new Set(logs.map((l) => l.actingAsId).filter((id): id is string => !!id))];
    const users = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : [];
    const names = new Map(users.map((u) => [u.id, u.name]));
    return toPage(logs.map((l) => toResponse(l, names)), total, page);
  },
};
