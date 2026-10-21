import { Router } from "express";
import { periodsController } from "./periods.controller";

/** Montado em /periods (qualquer sessão). */
export const periodsRoutes = Router();

periodsRoutes.get("/", periodsController.list);

/** Montado em /admin/periods (funcionalidade ADMIN_PERIODS). */
export const adminPeriodsRoutes = Router();

adminPeriodsRoutes.get("/", periodsController.adminList);
adminPeriodsRoutes.post("/", periodsController.create);
adminPeriodsRoutes.patch("/:year", periodsController.update);
adminPeriodsRoutes.delete("/:year", periodsController.remove);
