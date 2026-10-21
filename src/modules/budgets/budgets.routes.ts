import { Router } from "express";
import { budgetsController } from "./budgets.controller";

export const budgetsRoutes = Router();

budgetsRoutes.get("/", budgetsController.overview);
budgetsRoutes.put("/:categoryId", budgetsController.setLimit);
budgetsRoutes.delete("/:categoryId", budgetsController.removeLimit);
