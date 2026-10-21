import type { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { parsePage } from "../../shared/http/pagination";
import { idParamSchema } from "../../shared/http/schemas";
import { currentUserId } from "../../shared/middleware/authenticate";
import { INVESTMENT_SORTS, investmentFiltersSchema, investmentInputSchema, valuationInputSchema } from "./investments.schemas";
import { investmentsService } from "./investments.service";

export const investmentsController = {
  async list(req: Request, res: Response) {
    const { type } = investmentFiltersSchema.parse(req.query);
    const page = await parsePage(req.query, INVESTMENT_SORTS);
    res.json(await investmentsService.list(currentUserId(req), page, type));
  },

  async create(req: Request, res: Response) {
    const input = investmentInputSchema.parse(req.body);
    res.status(StatusCodes.CREATED).json(await investmentsService.create(currentUserId(req), input));
  },

  async update(req: Request, res: Response) {
    const { id } = idParamSchema.parse(req.params);
    const input = investmentInputSchema.parse(req.body);
    res.json(await investmentsService.update(currentUserId(req), id, input));
  },

  async remove(req: Request, res: Response) {
    const { id } = idParamSchema.parse(req.params);
    await investmentsService.remove(currentUserId(req), id);
    res.status(StatusCodes.NO_CONTENT).end();
  },

  async addValuation(req: Request, res: Response) {
    const { id } = idParamSchema.parse(req.params);
    const input = valuationInputSchema.parse(req.body);
    res.status(StatusCodes.CREATED).json(await investmentsService.addValuation(currentUserId(req), id, input));
  },
};
