import type { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { parsePage } from "../../shared/http/pagination";
import { idParamSchema } from "../../shared/http/schemas";
import { currentUserId } from "../../shared/middleware/authenticate";
import { TRANSACTION_SORTS, transactionFiltersSchema } from "./transactions.schemas";
import { transactionsService } from "./transactions.service";

export const transactionsController = {
  async list(req: Request, res: Response) {
    const filters = transactionFiltersSchema.parse(req.query);
    const page = await parsePage(req.query, TRANSACTION_SORTS);
    res.json(await transactionsService.list(currentUserId(req), filters, page));
  },

  async create(req: Request, res: Response) {
    // O serviço valida o corpo junto com as contas e a categoria
    res.status(StatusCodes.CREATED).json(await transactionsService.create(currentUserId(req), req.body));
  },

  async update(req: Request, res: Response) {
    const { id } = idParamSchema.parse(req.params);
    res.json(await transactionsService.update(currentUserId(req), id, req.body));
  },

  async remove(req: Request, res: Response) {
    const { id } = idParamSchema.parse(req.params);
    await transactionsService.remove(currentUserId(req), id);
    res.status(StatusCodes.NO_CONTENT).end();
  },
};
