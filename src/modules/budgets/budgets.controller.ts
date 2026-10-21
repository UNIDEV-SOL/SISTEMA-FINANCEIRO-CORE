import type { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { currentUserId } from "../../shared/middleware/authenticate";
import { budgetInputSchema, budgetQuerySchema, categoryIdParamSchema } from "./budgets.schemas";
import { budgetsService } from "./budgets.service";

export const budgetsController = {
  async overview(req: Request, res: Response) {
    const { month } = budgetQuerySchema.parse(req.query);
    res.json(await budgetsService.overview(currentUserId(req), month));
  },

  async setLimit(req: Request, res: Response) {
    const { categoryId } = categoryIdParamSchema.parse(req.params);
    const { limit } = budgetInputSchema.parse(req.body);
    await budgetsService.setLimit(currentUserId(req), categoryId, limit);
    res.status(StatusCodes.NO_CONTENT).end();
  },

  async removeLimit(req: Request, res: Response) {
    const { categoryId } = categoryIdParamSchema.parse(req.params);
    await budgetsService.removeLimit(currentUserId(req), categoryId);
    res.status(StatusCodes.NO_CONTENT).end();
  },
};
