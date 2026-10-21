import type { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { parsePage } from "../../shared/http/pagination";
import { idParamSchema } from "../../shared/http/schemas";
import { permissionsInputSchema, PROFILE_SORTS, profileCreateSchema, profileUpdateSchema } from "./profiles.schemas";
import { profilesService } from "./profiles.service";

export const profilesController = {
  async list(req: Request, res: Response) {
    res.json(await profilesService.list(await parsePage(req.query, PROFILE_SORTS)));
  },

  async get(req: Request, res: Response) {
    const { id } = idParamSchema.parse(req.params);
    res.json(await profilesService.get(id));
  },

  async create(req: Request, res: Response) {
    const input = profileCreateSchema.parse(req.body);
    res.status(StatusCodes.CREATED).json(await profilesService.create(input));
  },

  async update(req: Request, res: Response) {
    const { id } = idParamSchema.parse(req.params);
    const input = profileUpdateSchema.parse(req.body);
    res.json(await profilesService.update(id, input));
  },

  async remove(req: Request, res: Response) {
    const { id } = idParamSchema.parse(req.params);
    await profilesService.remove(id);
    res.status(StatusCodes.NO_CONTENT).end();
  },

  async permissions(req: Request, res: Response) {
    const { id } = idParamSchema.parse(req.params);
    res.json(await profilesService.permissions(id));
  },

  async replacePermissions(req: Request, res: Response) {
    const { id } = idParamSchema.parse(req.params);
    const input = permissionsInputSchema.parse(req.body);
    res.json(await profilesService.replacePermissions(id, input));
  },
};
