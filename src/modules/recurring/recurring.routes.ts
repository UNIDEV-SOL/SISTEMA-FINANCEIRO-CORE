import { Router } from "express";
import { recurringController } from "./recurring.controller";

/** Montado em /recurring (funcionalidade RECURRING). */
export const recurringRoutes = Router();

recurringRoutes.get("/", recurringController.list);
recurringRoutes.post("/", recurringController.create);
recurringRoutes.get("/:id", recurringController.get);
recurringRoutes.put("/:id", recurringController.update);
recurringRoutes.delete("/:id", recurringController.remove);
// Altera a recorrente (acção EDIT, ver shared/access/actions.ts)
recurringRoutes.post("/:id/skip", recurringController.skip);
