import type { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { idParamSchema } from "../../shared/http/schemas";
import { currentUserId } from "../../shared/middleware/authenticate";
import { appSettings } from "../../shared/settings/app-settings";
import { dependentCreateSchema, invitationCreateSchema, linkAccessSchema } from "./family.schemas";
import { familyService } from "./family.service";

// As rotas /family ignoram o X-Acting-As: `currentUserId` é sempre quem iniciou sessão
export const familyController = {
  async overview(req: Request, res: Response) {
    res.json(await familyService.overview(currentUserId(req)));
  },

  async createDependent(req: Request, res: Response) {
    const input = dependentCreateSchema(await appSettings.get("auth.passwordMinLength")).parse(req.body);
    res.status(StatusCodes.CREATED).json(await familyService.createDependent(currentUserId(req), input));
  },

  async invite(req: Request, res: Response) {
    const input = invitationCreateSchema.parse(req.body);
    res.status(StatusCodes.CREATED).json(await familyService.invite(currentUserId(req), input));
  },

  async accept(req: Request, res: Response) {
    const { id } = idParamSchema.parse(req.params);
    res.json(await familyService.respond(currentUserId(req), id, true));
  },

  async decline(req: Request, res: Response) {
    const { id } = idParamSchema.parse(req.params);
    res.json(await familyService.respond(currentUserId(req), id, false));
  },

  async updateAccess(req: Request, res: Response) {
    const { id } = idParamSchema.parse(req.params);
    const { access } = linkAccessSchema.parse(req.body);
    res.json(await familyService.updateAccess(currentUserId(req), id, access));
  },

  async revoke(req: Request, res: Response) {
    const { id } = idParamSchema.parse(req.params);
    await familyService.revoke(currentUserId(req), id);
    res.status(StatusCodes.NO_CONTENT).end();
  },
};
