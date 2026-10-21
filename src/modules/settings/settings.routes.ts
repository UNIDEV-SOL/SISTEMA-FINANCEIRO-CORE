import { Router } from "express";
import { env } from "../../config/env";
import { settingsController } from "./settings.controller";

/** Montado na raiz: /settings, /export e /demo/reset. */
export const settingsRoutes = Router();

settingsRoutes.get("/settings", settingsController.get);
settingsRoutes.put("/settings", settingsController.update);
settingsRoutes.get("/export", settingsController.export);

// Apaga os dados do utilizador: só fora de produção
if (env.NODE_ENV !== "production") settingsRoutes.post("/demo/reset", settingsController.resetDemo);
