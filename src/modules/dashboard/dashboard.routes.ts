import { Router } from "express";
import { dashboardController } from "./dashboard.controller";

export const dashboardRoutes = Router();

dashboardRoutes.get("/", dashboardController.summary);
