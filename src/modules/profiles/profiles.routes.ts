import { Router } from "express";
import { profilesController } from "./profiles.controller";

/** Montado em /admin/profiles. */
export const profilesRoutes = Router();

profilesRoutes.get("/", profilesController.list);
profilesRoutes.post("/", profilesController.create);
profilesRoutes.get("/:id", profilesController.get);
profilesRoutes.put("/:id", profilesController.update);
profilesRoutes.delete("/:id", profilesController.remove);
profilesRoutes.get("/:id/permissions", profilesController.permissions);
profilesRoutes.put("/:id/permissions", profilesController.replacePermissions);
