import type { Request, Response } from "express";
import { ValidationException } from "../../shared/errors/http-exceptions";
import { currentYearMonth } from "../../shared/lib/dates";
import { currentUserId } from "../../shared/middleware/authenticate";
import { forecastQuerySchema } from "./forecast.schemas";
import { forecastService } from "./forecast.service";

export const forecastController = {
  async forecast(req: Request, res: Response) {
    const q = forecastQuerySchema.parse(req.query);
    if (q.scenarioAmount && !q.scenarioLabel) throw ValidationException.field("scenarioLabel", "Indique o que quer simular.");
    const scenario = q.scenarioAmount
      ? {
          label: q.scenarioLabel!,
          type: q.scenarioType,
          amount: Number(q.scenarioAmount),
          from: q.scenarioFrom ?? currentYearMonth(),
          months: q.scenarioMonths,
          commitment: q.scenarioCommitment ?? false,
        }
      : undefined;
    res.json(await forecastService.forecast(currentUserId(req), scenario));
  },
};
