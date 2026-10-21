import { Router } from "express";
import { alertsController } from "./alerts.controller";

export const alertsRoutes = Router();

alertsRoutes.get("/", alertsController.list);
alertsRoutes.post("/read-all", alertsController.markAllRead);
alertsRoutes.get("/settings", alertsController.getSettings);
alertsRoutes.put("/settings", alertsController.updateSettings);
alertsRoutes.post("/:id/read", alertsController.markRead);
