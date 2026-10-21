import { Router } from "express";
import { dashboardController } from "./dashboard.controller";

export const dashboardRoutes = Router();

dashboardRoutes.get("/", dashboardController.summary);
// O conselheiro vive no Dashboard (mesma permissão)
dashboardRoutes.get("/advisor", dashboardController.advisor);
// Plano do salário: de uma receita, ou da mais recente que conta como salário
dashboardRoutes.get("/payday", dashboardController.paydayLatest);
dashboardRoutes.get("/payday/:id", dashboardController.payday);
