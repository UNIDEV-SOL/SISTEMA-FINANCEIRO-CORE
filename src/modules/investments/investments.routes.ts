import { Router } from "express";
import { investmentsController } from "./investments.controller";

export const investmentsRoutes = Router();

investmentsRoutes.get("/", investmentsController.list);
investmentsRoutes.post("/", investmentsController.create);
investmentsRoutes.put("/:id", investmentsController.update);
investmentsRoutes.delete("/:id", investmentsController.remove);
investmentsRoutes.post("/:id/valuations", investmentsController.addValuation);
