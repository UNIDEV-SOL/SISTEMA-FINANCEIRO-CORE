import express, { Router } from "express";
import { ATTACHMENT_TYPES } from "../attachments/attachments.service";
import { attachmentsController } from "../attachments/attachments.controller";
import { transactionsController } from "./transactions.controller";

export const transactionsRoutes = Router();

transactionsRoutes.get("/", transactionsController.list);
// Arquivo de todos os comprovativos (antes de "/:id/…")
transactionsRoutes.get("/attachments", attachmentsController.archive);
transactionsRoutes.post("/", transactionsController.create);
transactionsRoutes.put("/:id", transactionsController.update);
transactionsRoutes.delete("/:id", transactionsController.remove);
// Altera a transação (acção EDIT, ver shared/access/actions.ts)
transactionsRoutes.post("/:id/confirm", transactionsController.confirm);

// Comprovativos: SMS em JSON ou o ficheiro no corpo (o limite fino é o parâmetro attachments.maxFileMb)
transactionsRoutes.get("/:id/attachments", attachmentsController.list);
transactionsRoutes.post("/:id/attachments", express.raw({ type: [...ATTACHMENT_TYPES], limit: "20mb" }), attachmentsController.create);
transactionsRoutes.get("/:id/attachments/:attachmentId/file", attachmentsController.file);
transactionsRoutes.delete("/:id/attachments/:attachmentId", attachmentsController.remove);
