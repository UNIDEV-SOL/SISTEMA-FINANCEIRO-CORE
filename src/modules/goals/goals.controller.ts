import type { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { parsePage } from "../../shared/http/pagination";
import { idParamSchema } from "../../shared/http/schemas";
import { currentUserId } from "../../shared/middleware/authenticate";
import { contributionInputSchema, GOAL_SORTS } from "./goals.schemas";
import { goalsService } from "./goals.service";

export const goalsController = {
  async list(req: Request, res: Response) {
    const page = await parsePage(req.query, GOAL_SORTS);
    res.json(await goalsService.list(currentUserId(req), page));
  },

  async create(req: Request, res: Response) {
    // O serviço valida o corpo junto com a conta
    res.status(StatusCodes.CREATED).json(await goalsService.create(currentUserId(req), req.body));
  },

  async update(req: Request, res: Response) {
    const { id } = idParamSchema.parse(req.params);
    res.json(await goalsService.update(currentUserId(req), id, req.body));
  },

  async remove(req: Request, res: Response) {
    const { id } = idParamSchema.parse(req.params);
    await goalsService.remove(currentUserId(req), id);
    res.status(StatusCodes.NO_CONTENT).end();
  },

  async contribute(req: Request, res: Response) {
    const { id } = idParamSchema.parse(req.params);
    const input = contributionInputSchema.parse(req.body);
    res.status(StatusCodes.CREATED).json(await goalsService.contribute(currentUserId(req), id, input));
  },
};
