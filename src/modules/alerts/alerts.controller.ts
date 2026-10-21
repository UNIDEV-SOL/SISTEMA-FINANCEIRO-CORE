import type { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { currentUserId } from "../../shared/middleware/authenticate";
import { alertIdParamSchema, alertSettingsInputSchema } from "./alerts.schemas";
import { alertsService } from "./alerts.service";

export const alertsController = {
  async list(req: Request, res: Response) {
    res.json(await alertsService.list(currentUserId(req)));
  },

  async markRead(req: Request, res: Response) {
    const { id } = alertIdParamSchema.parse(req.params);
    await alertsService.markRead(currentUserId(req), id);
    res.status(StatusCodes.NO_CONTENT).end();
  },

  async markAllRead(req: Request, res: Response) {
    await alertsService.markAllRead(currentUserId(req));
    res.status(StatusCodes.NO_CONTENT).end();
  },

  async getSettings(req: Request, res: Response) {
    res.json(await alertsService.getSettings(currentUserId(req)));
  },

  async updateSettings(req: Request, res: Response) {
    const input = alertSettingsInputSchema.parse(req.body);
    res.json(await alertsService.updateSettings(currentUserId(req), input));
  },
};
