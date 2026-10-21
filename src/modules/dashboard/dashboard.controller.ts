import type { Request, Response } from "express";
import { currentUserId } from "../../shared/middleware/authenticate";
import { dashboardQuerySchema } from "./dashboard.schemas";
import { idParamSchema } from "../../shared/http/schemas";
import { advisorService } from "../advisor/advisor.service";
import { paydayService } from "../advisor/payday.service";
import { dashboardService } from "./dashboard.service";

export const dashboardController = {
  async summary(req: Request, res: Response) {
    const { month } = dashboardQuerySchema.parse(req.query);
    res.json(await dashboardService.summary(currentUserId(req), month));
  },

  async payday(req: Request, res: Response) {
    const { id } = idParamSchema.parse(req.params);
    res.json(await paydayService.plan(currentUserId(req), id));
  },

  /** O plano do salário mais recente (dos últimos `advisor.paydayDays` dias), ou null. */
  async paydayLatest(req: Request, res: Response) {
    const userId = currentUserId(req);
    const id = await paydayService.latest(userId);
    res.json(id ? await paydayService.plan(userId, id) : null);
  },

  async advisor(req: Request, res: Response) {
    res.json(await advisorService.briefing(currentUserId(req)));
  },
};
