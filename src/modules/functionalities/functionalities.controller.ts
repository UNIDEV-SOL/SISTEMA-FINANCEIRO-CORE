import type { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { idParamSchema } from "../../shared/http/schemas";
import { functionalityCreateSchema, functionalityOrderSchema, functionalityUpdateSchema } from "./functionalities.schemas";
import { functionalitiesService } from "./functionalities.service";

export const functionalitiesController = {
  async tree(_req: Request, res: Response) {
    res.json(await functionalitiesService.tree());
  },

  async create(req: Request, res: Response) {
    const input = functionalityCreateSchema.parse(req.body);
    res.status(StatusCodes.CREATED).json(await functionalitiesService.create(input));
  },

  async update(req: Request, res: Response) {
    const { id } = idParamSchema.parse(req.params);
    const input = functionalityUpdateSchema.parse(req.body);
    res.json(await functionalitiesService.update(id, input));
  },

  async remove(req: Request, res: Response) {
    const { id } = idParamSchema.parse(req.params);
    await functionalitiesService.remove(id);
    res.status(StatusCodes.NO_CONTENT).end();
  },

  async reorder(req: Request, res: Response) {
    const input = functionalityOrderSchema.parse(req.body);
    res.json(await functionalitiesService.reorder(input));
  },
};
