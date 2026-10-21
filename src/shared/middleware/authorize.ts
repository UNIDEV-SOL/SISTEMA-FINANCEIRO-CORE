import type { NextFunction, Request, Response } from "express";
import { actionOf, apiPathOf } from "../access/actions";
import { accessPolicy } from "../access/policy";
import { ForbiddenException } from "../errors/http-exceptions";
import { currentActor } from "./authenticate";

/**
 * Verifica a permissão do perfil de quem iniciou sessão na funcionalidade da rota.
 * Vem depois do `authenticate`. Rotas sem funcionalidade ficam livres.
 */
export async function authorize(req: Request, _res: Response, next: NextFunction) {
  const { profile } = currentActor(req);
  const path = apiPathOf(req);
  const decision = await accessPolicy.decide(profile, actionOf(req.method, path), path);
  req.functionalityCode = decision.functionality?.code;
  if (!decision.allowed) throw new ForbiddenException(decision.detail);
  next();
}
