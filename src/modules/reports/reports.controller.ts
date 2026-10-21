import type { Request, Response } from "express";
import { currentUserId } from "../../shared/middleware/authenticate";
import { annualQuerySchema } from "./reports.schemas";
import { reportsService } from "./reports.service";

export const reportsController = {
  async annual(req: Request, res: Response) {
    const { year } = annualQuerySchema.parse(req.query);
    res.json(await reportsService.annual(currentUserId(req), year));
  },
};
