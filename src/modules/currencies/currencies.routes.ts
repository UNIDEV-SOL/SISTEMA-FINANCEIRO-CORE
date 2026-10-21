import { Router } from "express";
import { currenciesController } from "./currencies.controller";

/** Montado em /admin/currencies. */
export const currenciesRoutes = Router();

currenciesRoutes.get("/", currenciesController.list);
currenciesRoutes.post("/", currenciesController.create);
currenciesRoutes.put("/:code", currenciesController.update);
currenciesRoutes.delete("/:code", currenciesController.remove);
