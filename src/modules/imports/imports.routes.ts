import express, { Router } from "express";
import { importsController } from "./imports.controller";
import { MAX_PDF_BYTES } from "./imports.schemas";

/**
 * Montado em /transactions/import (funcionalidade TRANSACTIONS, acção IMPORT em todas as rotas).
 * A pré-visualização não grava nada; só o POST /transactions/import cria transações.
 */
export const importsRoutes = Router();

importsRoutes.post("/preview", importsController.previewText);
importsRoutes.post("/pdf", express.raw({ type: "application/pdf", limit: MAX_PDF_BYTES }), importsController.previewPdf);
importsRoutes.post("/", importsController.commit);
