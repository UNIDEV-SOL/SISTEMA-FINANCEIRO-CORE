import type { Request, Response } from "express";
import { currentUserId } from "../../shared/middleware/authenticate";
import { dashboardQuerySchema } from "./dashboard.schemas";
import { dashboardService } from "./dashboard.service";

export const dashboardController = {
  async summary(req: Request, res: Response) {
    const { month } = dashboardQuerySchema.parse(req.query);
    res.json(await dashboardService.summary(currentUserId(req), month));
  },
};
