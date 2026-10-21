import { Router } from "express";
import { accountsController } from "./accounts.controller";

export const accountsRoutes = Router();

accountsRoutes.get("/", accountsController.list);
accountsRoutes.post("/", accountsController.create);
accountsRoutes.put("/:id", accountsController.update);
accountsRoutes.delete("/:id", accountsController.archive);
