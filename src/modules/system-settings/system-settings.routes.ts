import { Router } from "express";
import { systemSettingsController } from "./system-settings.controller";

/** Montado em /admin/settings. */
export const systemSettingsRoutes = Router();

systemSettingsRoutes.get("/", systemSettingsController.list);
systemSettingsRoutes.put("/:key", systemSettingsController.update);

/** Montado em /config, sem sessão. */
export const publicConfigRoutes = Router();

publicConfigRoutes.get("/public", systemSettingsController.publicConfig);
