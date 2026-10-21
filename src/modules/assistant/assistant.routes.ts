import { Router } from "express";
import { assistantController } from "./assistant.controller";

/** Montado em /assistant (funcionalidade HELP). POST /chat conta como leitura (VIEW). */
export const assistantRoutes = Router();

assistantRoutes.post("/chat", assistantController.chat);
assistantRoutes.get("/conversations", assistantController.list);
assistantRoutes.get("/conversations/:id", assistantController.get);
assistantRoutes.delete("/conversations/:id", assistantController.remove);
