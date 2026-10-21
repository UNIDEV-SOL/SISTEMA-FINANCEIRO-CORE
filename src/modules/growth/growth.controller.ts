import type { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { parsePage } from "../../shared/http/pagination";
import { currentUserId } from "../../shared/middleware/authenticate";
import { growthPlansService } from "./growth-plans.service";
import { PLAN_SORTS, planCreateSchema, planFiltersSchema, planIdParamSchema, planUpdateSchema, simulateQuerySchema } from "./growth.schemas";
import { growthService } from "./growth.service";

export const growthController = {
  async overview(req: Request, res: Response) {
    res.json(await growthService.overview(currentUserId(req)));
  },

  async simulate(req: Request, res: Response) {
    const query = simulateQuerySchema.parse(req.query);
    res.json(await growthService.simulate(currentUserId(req), query));
  },
};

export const growthPlansController = {
  async list(req: Request, res: Response) {
    const { active } = planFiltersSchema.parse(req.query);
    const page = await parsePage(req.query, PLAN_SORTS);
    res.json(await growthPlansService.list(page, active));
  },

  async create(req: Request, res: Response) {
    const input = planCreateSchema.parse(req.body);
    res.status(StatusCodes.CREATED).json(await growthPlansService.create(input));
  },

  async update(req: Request, res: Response) {
    const { id } = planIdParamSchema.parse(req.params);
    const input = planUpdateSchema.parse(req.body);
    res.json(await growthPlansService.update(id, input));
  },

  async remove(req: Request, res: Response) {
    const { id } = planIdParamSchema.parse(req.params);
    await growthPlansService.remove(id);
    res.status(StatusCodes.NO_CONTENT).end();
  },
};
