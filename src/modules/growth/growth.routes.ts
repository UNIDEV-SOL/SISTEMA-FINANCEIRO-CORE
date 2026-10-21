import { Router } from "express";
import { growthController, growthPlansController } from "./growth.controller";

/** Montado em /growth (funcionalidade GROWTH). O simulador é GET: só calcula, nunca grava. */
export const growthRoutes = Router();

growthRoutes.get("/overview", growthController.overview);
growthRoutes.get("/simulate", growthController.simulate);

/** Montado em /admin/growth-plans (funcionalidade ADMIN_GROWTH). */
export const adminGrowthPlansRoutes = Router();

adminGrowthPlansRoutes.get("/", growthPlansController.list);
adminGrowthPlansRoutes.post("/", growthPlansController.create);
adminGrowthPlansRoutes.put("/:id", growthPlansController.update);
adminGrowthPlansRoutes.delete("/:id", growthPlansController.remove);
