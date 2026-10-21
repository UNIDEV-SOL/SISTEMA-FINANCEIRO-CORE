import { Router } from "express";
import { forecastController } from "./forecast.controller";

/** Montado em /forecast (funcionalidade FORECAST). Só calcula, nunca grava. */
export const forecastRoutes = Router();

forecastRoutes.get("/", forecastController.forecast);
