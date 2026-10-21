import { Router } from "express";
import { familyController } from "./family.controller";

export const familyRoutes = Router();

familyRoutes.get("/", familyController.overview);
familyRoutes.post("/dependents", familyController.createDependent);
familyRoutes.post("/invitations", familyController.invite);
familyRoutes.post("/invitations/:id/accept", familyController.accept);
familyRoutes.post("/invitations/:id/decline", familyController.decline);
familyRoutes.patch("/links/:id", familyController.updateAccess);
familyRoutes.delete("/links/:id", familyController.revoke);
