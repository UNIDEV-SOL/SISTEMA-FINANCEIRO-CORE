import type { Request, Response } from "express";
import { currentActor } from "../../shared/middleware/authenticate";
import { settingKeyParamSchema, settingUpdateSchema } from "./system-settings.schemas";
import { systemSettingsService } from "./system-settings.service";

export const systemSettingsController = {
  async list(_req: Request, res: Response) {
    res.json(await systemSettingsService.list());
  },

  async update(req: Request, res: Response) {
    const { key } = settingKeyParamSchema.parse(req.params);
    const { value } = settingUpdateSchema.parse(req.body);
    res.json(await systemSettingsService.update(key, value, currentActor(req).actorId));
  },

  async publicConfig(_req: Request, res: Response) {
    res.json(await systemSettingsService.publicConfig());
  },
};
