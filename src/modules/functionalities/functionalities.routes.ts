import { Router } from "express";
import { functionalitiesController } from "./functionalities.controller";

/** Montado em /admin/functionalities. */
export const functionalitiesRoutes = Router();

functionalitiesRoutes.get("/", functionalitiesController.tree);
functionalitiesRoutes.post("/", functionalitiesController.create);
// Antes de /:id
functionalitiesRoutes.put("/order", functionalitiesController.reorder);
functionalitiesRoutes.put("/:id", functionalitiesController.update);
functionalitiesRoutes.delete("/:id", functionalitiesController.remove);
