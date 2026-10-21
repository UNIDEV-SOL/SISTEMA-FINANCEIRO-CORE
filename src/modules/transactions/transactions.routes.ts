import { Router } from "express";
import { transactionsController } from "./transactions.controller";

export const transactionsRoutes = Router();

transactionsRoutes.get("/", transactionsController.list);
transactionsRoutes.post("/", transactionsController.create);
transactionsRoutes.put("/:id", transactionsController.update);
transactionsRoutes.delete("/:id", transactionsController.remove);
