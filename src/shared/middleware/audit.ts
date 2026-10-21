import type { NextFunction, Request, Response } from "express";
import type { Prisma } from "../../generated/prisma";
import { actionOf, apiPathOf } from "../access/actions";
import { prisma } from "../db/prisma";
import { logger } from "../logger";

/** Quem fez o pedido, quando não vem do token (login e registo). */
export interface AuditActor {
  id: string;
  name: string;
}

const SECRET_KEY = /pass(word)?|token|secret|authorization|api[-_]?key|credential/i;
const MASK = "***";
const MAX_STRING = 500;
const MAX_DETAILS = 8_000;

/** Copia o corpo com os segredos mascarados e os textos longos cortados. */
export function maskSecrets(value: unknown, depth = 0): unknown {
  if (depth > 5) return "[…]";
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => maskSecrets(v, depth + 1));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, SECRET_KEY.test(k) ? MASK : maskSecrets(v, depth + 1)]),
    );
  }
  if (typeof value === "string" && value.length > MAX_STRING) return `${value.slice(0, MAX_STRING)}…`;
  return value;
}

function detailsOf(req: Request): Prisma.InputJsonValue | undefined {
  if (!req.body || typeof req.body !== "object" || !Object.keys(req.body).length) return undefined;
  const masked = maskSecrets(req.body);
  return JSON.stringify(masked).length > MAX_DETAILS ? { truncated: true } : (masked as Prisma.InputJsonValue);
}

/** O que registar; null quando o pedido não interessa à auditoria. */
function auditAction(req: Request, res: Response, path: string, status: number): string | null {
  if (path === "/auth/login") return status < 400 ? "LOGIN" : "LOGIN_FAILED";
  // Acção indicada pela rota (ex.: VIEW_AS quando o administrador passa a ver outra conta)
  if (typeof res.locals.auditAction === "string" && status < 400) return res.locals.auditAction;
  if (status === 403) return "ACCESS_DENIED";
  // Pedidos sem sessão válida não têm autor
  if (status === 401) return null;
  const action = actionOf(req.method, path);
  if (action === "VIEW") return null;
  if (action === "EXPORT") return status < 400 ? "EXPORT" : null;
  return action;
}

const pending = new Set<Promise<unknown>>();

/** Espera pelas escritas de auditoria em curso (testes e encerramento). */
export async function flushAudit() {
  await Promise.allSettled([...pending]);
}

/** Rotas podem fixar a acção registada e a pessoa visada (ex.: `POST /access/acting-as`). */
export function auditAs(res: Response, action: string, actingAsId?: string) {
  res.locals.auditAction = action;
  if (actingAsId) res.locals.auditActingAsId = actingAsId;
}

/**
 * Regista escritas, exportações, logins (com e sem sucesso) e acessos recusados.
 * Montado antes das rotas; grava depois de a resposta sair, sem atrasar o pedido.
 */
export function audit(req: Request, res: Response, next: NextFunction) {
  const started = process.hrtime.bigint();
  const path = apiPathOf(req);

  res.on("finish", () => {
    const action = auditAction(req, res, path, res.statusCode);
    if (!action) return;
    const actor = (res.locals.auditActor as AuditActor | undefined) ?? (req.user ? { id: req.user.actorId, name: req.user.actorName } : undefined);
    // No login falhado, o email tentado ajuda a detectar ataques
    const attemptedEmail = action === "LOGIN_FAILED" && typeof req.body?.email === "string" ? String(req.body.email).slice(0, 120) : undefined;

    const write = prisma.auditLog
      .create({
        data: {
          actorId: actor?.id ?? null,
          actorName: actor?.name ?? attemptedEmail ?? null,
          actingAsId: (res.locals.auditActingAsId as string | undefined) ?? req.user?.actingAs?.id ?? null,
          action,
          method: req.method,
          path,
          statusCode: res.statusCode,
          functionalityCode: req.functionalityCode ?? null,
          ip: req.ip ?? null,
          userAgent: req.get("user-agent")?.slice(0, 300) ?? null,
          durationMs: Number((process.hrtime.bigint() - started) / 1_000_000n),
          details: req.method === "GET" ? undefined : detailsOf(req),
        },
      })
      .catch((error) => logger.error("Falha ao gravar auditoria", { path, error }))
      .finally(() => pending.delete(write));
    pending.add(write);
  });

  next();
}
