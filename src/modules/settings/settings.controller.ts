import type { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { currentUserId } from "../../shared/middleware/authenticate";
import { settingsInputSchema } from "./settings.schemas";
import { settingsService } from "./settings.service";

export const settingsController = {
  async get(req: Request, res: Response) {
    res.json(await settingsService.get(currentUserId(req)));
  },

  async update(req: Request, res: Response) {
    const input = settingsInputSchema.parse(req.body);
    res.json(await settingsService.update(currentUserId(req), input));
  },

  async export(req: Request, res: Response) {
    res.json(await settingsService.export(currentUserId(req)));
  },

  async resetDemo(req: Request, res: Response) {
    await settingsService.resetDemo(currentUserId(req));
    res.status(StatusCodes.NO_CONTENT).end();
  },
};
