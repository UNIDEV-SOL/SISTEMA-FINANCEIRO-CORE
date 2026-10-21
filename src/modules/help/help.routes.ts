import { Router } from "express";
import { adminHelpController, helpController } from "./help.controller";

/** Montado em /help: manual e FAQ publicados (funcionalidade HELP). */
export const helpRoutes = Router();

helpRoutes.get("/articles", helpController.articles);
helpRoutes.get("/articles/:slug", helpController.article);
helpRoutes.get("/faqs", helpController.faqs);
helpRoutes.get("/search", helpController.search);

/** Montado em /admin/help (funcionalidade ADMIN_HELP). */
export const adminHelpRoutes = Router();

adminHelpRoutes.get("/articles", adminHelpController.listArticles);
adminHelpRoutes.post("/articles", adminHelpController.createArticle);
adminHelpRoutes.put("/articles/order", adminHelpController.reorderArticles);
adminHelpRoutes.get("/articles/:id", adminHelpController.getArticle);
adminHelpRoutes.put("/articles/:id", adminHelpController.updateArticle);
adminHelpRoutes.patch("/articles/:id/published", adminHelpController.publishArticle);
adminHelpRoutes.delete("/articles/:id", adminHelpController.removeArticle);

adminHelpRoutes.get("/faqs", adminHelpController.listFaqs);
adminHelpRoutes.post("/faqs", adminHelpController.createFaq);
adminHelpRoutes.put("/faqs/order", adminHelpController.reorderFaqs);
adminHelpRoutes.get("/faqs/:id", adminHelpController.getFaq);
adminHelpRoutes.put("/faqs/:id", adminHelpController.updateFaq);
adminHelpRoutes.patch("/faqs/:id/published", adminHelpController.publishFaq);
adminHelpRoutes.delete("/faqs/:id", adminHelpController.removeFaq);
