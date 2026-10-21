import type { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { parsePage } from "../../shared/http/pagination";
import { idParamSchema } from "../../shared/http/schemas";
import { currentUserId } from "../../shared/middleware/authenticate";
import { CATEGORY_SORTS, categoryFiltersSchema, categoryInputSchema } from "./categories.schemas";
import { categoriesService } from "./categories.service";

export const categoriesController = {
  async list(req: Request, res: Response) {
    const { kind } = categoryFiltersSchema.parse(req.query);
    const page = await parsePage(req.query, CATEGORY_SORTS);
    res.json(await categoriesService.list(currentUserId(req), page, kind));
  },

  async create(req: Request, res: Response) {
    const input = categoryInputSchema.parse(req.body);
    res.status(StatusCodes.CREATED).json(await categoriesService.create(currentUserId(req), input));
  },

  async update(req: Request, res: Response) {
    const { id } = idParamSchema.parse(req.params);
    const input = categoryInputSchema.parse(req.body);
    res.json(await categoriesService.update(currentUserId(req), id, input));
  },
};
