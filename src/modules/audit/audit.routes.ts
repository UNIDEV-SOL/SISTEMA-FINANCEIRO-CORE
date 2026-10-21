import { Router } from "express";
import { auditController } from "./audit.controller";

/** Montado em /admin/audit. */
export const auditRoutes = Router();

auditRoutes.get("/", auditController.list);
