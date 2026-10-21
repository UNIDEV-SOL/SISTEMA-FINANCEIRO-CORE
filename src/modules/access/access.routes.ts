import { Router } from "express";
import { accessController } from "./access.controller";

/** O X-Acting-As é ignorado aqui: tudo é de quem iniciou sessão. */
export const accessRoutes = Router();

accessRoutes.get("/menu", accessController.menu);
accessRoutes.get("/acting-candidates", accessController.actingCandidates);
accessRoutes.post("/acting-as", accessController.startActingAs);
