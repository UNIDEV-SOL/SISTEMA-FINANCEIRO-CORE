import type { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { currentActor } from "../../shared/middleware/authenticate";
import { periodCreateSchema, periodUpdateSchema, periodYearParamSchema } from "./periods.schemas";
import { periodsService } from "./periods.service";

export const periodsController = {
  async list(_req: Request, res: Response) {
    res.json(await periodsService.list());
  },

  async adminList(_req: Request, res: Response) {
    res.json(await periodsService.adminList());
  },

  async create(req: Request, res: Response) {
    const input = periodCreateSchema.parse(req.body);
    res.status(StatusCodes.CREATED).json(await periodsService.create(input, currentActor(req).actorId));
  },

  async update(req: Request, res: Response) {
    const { year } = periodYearParamSchema.parse(req.params);
    const input = periodUpdateSchema.parse(req.body);
    res.json(await periodsService.update(year, input, currentActor(req).actorId));
  },

  async remove(req: Request, res: Response) {
    const { year } = periodYearParamSchema.parse(req.params);
    await periodsService.remove(year);
    res.status(StatusCodes.NO_CONTENT).end();
  },
};
