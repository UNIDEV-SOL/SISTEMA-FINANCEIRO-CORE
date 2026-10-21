import type { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { parsePage } from "../../shared/http/pagination";
import { CURRENCY_SORTS, currencyCodeParamSchema, currencyCreateSchema, currencyFiltersSchema, currencyUpdateSchema } from "./currencies.schemas";
import { currenciesService } from "./currencies.service";

export const currenciesController = {
  async list(req: Request, res: Response) {
    const { active } = currencyFiltersSchema.parse(req.query);
    const page = await parsePage(req.query, CURRENCY_SORTS);
    res.json(await currenciesService.list(page, active));
  },

  async create(req: Request, res: Response) {
    const input = currencyCreateSchema.parse(req.body);
    res.status(StatusCodes.CREATED).json(await currenciesService.create(input));
  },

  async update(req: Request, res: Response) {
    const { code } = currencyCodeParamSchema.parse(req.params);
    const input = currencyUpdateSchema.parse(req.body);
    res.json(await currenciesService.update(code, input));
  },

  async remove(req: Request, res: Response) {
    const { code } = currencyCodeParamSchema.parse(req.params);
    await currenciesService.remove(code);
    res.status(StatusCodes.NO_CONTENT).end();
  },
};
