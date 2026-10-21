import type { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import type { AuditActor } from "../../shared/middleware/audit";
import { ACTING_AS_HEADER, currentActor } from "../../shared/middleware/authenticate";
import { appSettings } from "../../shared/settings/app-settings";
import { loginSchema, preferencesSchema, registerSchema } from "./auth.schemas";
import { authService } from "./auth.service";

const auditAs = (res: Response, actor: AuditActor) => {
  res.locals.auditActor = actor;
};

export const authController = {
  async register(req: Request, res: Response) {
    // Recusa antes de validar: com o registo fechado, os erros de campo não interessam
    await authService.ensureRegistrationOpen();
    const input = registerSchema(await appSettings.get("auth.passwordMinLength")).parse(req.body);
    const session = await authService.register(input);
    auditAs(res, session.user);
    res.status(StatusCodes.CREATED).json(session);
  },

  async login(req: Request, res: Response) {
    const input = loginSchema.parse(req.body);
    const session = await authService.login(input);
    auditAs(res, session.user);
    res.json(session);
  },

  async me(req: Request, res: Response) {
    res.json(await authService.me(currentActor(req).actorId, req.header(ACTING_AS_HEADER)));
  },

  async updatePreferences(req: Request, res: Response) {
    const input = preferencesSchema.parse(req.body);
    res.json(await authService.updatePreferences(currentActor(req).actorId, input));
  },
};
