import { Router } from "express";
import { adminUsersController } from "./admin-users.controller";

/** Montado em /admin/users. */
export const adminUsersRoutes = Router();

adminUsersRoutes.get("/", adminUsersController.list);
adminUsersRoutes.post("/", adminUsersController.create);
adminUsersRoutes.get("/:id", adminUsersController.get);
adminUsersRoutes.put("/:id", adminUsersController.update);
adminUsersRoutes.patch("/:id/active", adminUsersController.setActive);
adminUsersRoutes.post("/:id/password", adminUsersController.resetPassword);
