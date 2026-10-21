import { Router } from "express";
import { goalsController } from "./goals.controller";

export const goalsRoutes = Router();

goalsRoutes.get("/", goalsController.list);
goalsRoutes.post("/", goalsController.create);
goalsRoutes.put("/:id", goalsController.update);
goalsRoutes.delete("/:id", goalsController.remove);
goalsRoutes.post("/:id/contributions", goalsController.contribute);
