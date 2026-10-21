import { Router } from "express";
import { reportsController } from "./reports.controller";

export const reportsRoutes = Router();

reportsRoutes.get("/annual", reportsController.annual);
