import type { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { parsePage } from "../../shared/http/pagination";
import { idParamSchema } from "../../shared/http/schemas";
import { currentUserId } from "../../shared/middleware/authenticate";
import { ACCOUNT_SORTS, accountFiltersSchema, accountInputSchema } from "./accounts.schemas";
import { accountsService } from "./accounts.service";

export const accountsController = {
  async list(req: Request, res: Response) {
    const { archived } = accountFiltersSchema.parse(req.query);
    const page = await parsePage(req.query, ACCOUNT_SORTS);
    res.json(await accountsService.list(currentUserId(req), page, archived));
  },

  async create(req: Request, res: Response) {
    const input = accountInputSchema.parse(req.body);
    res.status(StatusCodes.CREATED).json(await accountsService.create(currentUserId(req), input));
  },

  async update(req: Request, res: Response) {
    const { id } = idParamSchema.parse(req.params);
    const input = accountInputSchema.parse(req.body);
    res.json(await accountsService.update(currentUserId(req), id, input));
  },

  async archive(req: Request, res: Response) {
    const { id } = idParamSchema.parse(req.params);
    await accountsService.archive(currentUserId(req), id);
    res.status(StatusCodes.NO_CONTENT).end();
  },

  async restore(req: Request, res: Response) {
    const { id } = idParamSchema.parse(req.params);
    res.json(await accountsService.restore(currentUserId(req), id));
  },
};
