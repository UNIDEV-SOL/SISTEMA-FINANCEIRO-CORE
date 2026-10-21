import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../../config/env";
import { findActingAs, ignoresActingAs } from "../access/acting-as";
import { actionOf, apiPathOf, isReadAction } from "../access/actions";
import { prisma } from "../db/prisma";
import { ForbiddenException, UnauthorizedException } from "../errors/http-exceptions";
import { appSettings } from "../settings/app-settings";

interface TokenPayload {
  sub: string;
}

export const ACTING_AS_HEADER = "x-acting-as";
export const INACTIVE_ACCOUNT = "Conta desactivada. Contacte o administrador.";
const EXPIRED = "A sessão expirou ou é inválida. Inicie sessão novamente.";

/** A duração vem do parâmetro `auth.sessionDays`. */
export async function signToken(userId: string): Promise<string> {
  const days = await appSettings.get("auth.sessionDays");
  return jwt.sign({}, env.JWT_SECRET, { subject: userId, expiresIn: `${days}d` });
}

/**
 * Valida o Bearer token e preenche `req.user`.
 * Com `X-Acting-As: <id>`, o utilizador efectivo passa a ser essa pessoa — por ligação familiar activa
 * ou pela permissão ADMIN_USER_DATA do perfil; com acesso VIEW, qualquer escrita é recusada.
 * Ignorado em /admin, /family, /auth e /access.
 */
export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  const [scheme, token] = req.headers.authorization?.split(" ") ?? [];
  if (scheme !== "Bearer" || !token) throw new UnauthorizedException();

  let payload: TokenPayload;
  try {
    payload = jwt.verify(token, env.JWT_SECRET) as TokenPayload;
  } catch {
    throw new UnauthorizedException(EXPIRED);
  }

  // Conta apagada ou desactivada depois de o token ter sido emitido
  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { id: true, name: true, active: true, profile: { select: { id: true, code: true, name: true, superAdmin: true } } },
  });
  if (!user) throw new UnauthorizedException(EXPIRED);
  if (!user.active) throw new UnauthorizedException(INACTIVE_ACCOUNT);

  req.user = { id: user.id, actorId: user.id, actorName: user.name, profile: user.profile };

  const target = req.header(ACTING_AS_HEADER)?.trim();
  const path = apiPathOf(req);
  if (target && target !== user.id && !ignoresActingAs(path)) {
    const actingAs = await findActingAs({ id: user.id, profile: user.profile }, target);
    if (!actingAs) throw new ForbiddenException("Não tem acesso às contas desta pessoa.");
    req.user.id = actingAs.id;
    req.user.actingAs = actingAs;
    if (actingAs.access === "VIEW" && !isReadAction(actionOf(req.method, path)))
      throw new ForbiddenException(`Só tem acesso de leitura às contas de ${actingAs.name}.`);
  }
  next();
}

/** Id do utilizador efectivo; só usar em rotas atrás de `authenticate`. */
export function currentUserId(req: Request): string {
  if (!req.user) throw new UnauthorizedException();
  return req.user.id;
}

/** Quem iniciou sessão (ignora o X-Acting-As). */
export function currentActor(req: Request): NonNullable<Request["user"]> {
  if (!req.user) throw new UnauthorizedException();
  return req.user;
}
