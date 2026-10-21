import { Router } from "express";
import { authenticate } from "../../shared/middleware/authenticate";
import { authRateLimiter } from "../../shared/middleware/rate-limiter";
import { authController } from "./auth.controller";

export const authRoutes = Router();

authRoutes.post("/register", authRateLimiter, authController.register);
authRoutes.post("/login", authRateLimiter, authController.login);
authRoutes.get("/me", authenticate, authController.me);
// Preferências de quem iniciou sessão (ignora o X-Acting-As); não depende de permissões
authRoutes.put("/preferences", authenticate, authController.updatePreferences);
