import type { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { parsePage } from "../../shared/http/pagination";
import { idParamSchema } from "../../shared/http/schemas";
import { currentUserId } from "../../shared/middleware/authenticate";
import { RECURRING_SORTS, recurringFiltersSchema } from "./recurring.schemas";
import { recurringService } from "./recurring.service";

export const recurringController = {
  async list(req: Request, res: Response) {
    const filters = recurringFiltersSchema.parse(req.query);
    const page = await parsePage(req.query, RECURRING_SORTS);
    res.json(await recurringService.list(currentUserId(req), filters, page));
  },

  async get(req: Request, res: Response) {
    const { id } = idParamSchema.parse(req.params);
    res.json(await recurringService.get(currentUserId(req), id));
  },

  async create(req: Request, res: Response) {
    // O serviço valida o corpo junto com as contas e a categoria
    res.status(StatusCodes.CREATED).json(await recurringService.create(currentUserId(req), req.body));
  },

  async update(req: Request, res: Response) {
    const { id } = idParamSchema.parse(req.params);
    res.json(await recurringService.update(currentUserId(req), id, req.body));
  },

  async remove(req: Request, res: Response) {
    const { id } = idParamSchema.parse(req.params);
    await recurringService.remove(currentUserId(req), id);
    res.status(StatusCodes.NO_CONTENT).end();
  },

  async skip(req: Request, res: Response) {
    const { id } = idParamSchema.parse(req.params);
    res.json(await recurringService.skip(currentUserId(req), id));
  },
};
