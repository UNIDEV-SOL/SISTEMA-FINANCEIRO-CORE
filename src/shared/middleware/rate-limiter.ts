import rateLimit from "express-rate-limit";
import { env } from "../../config/env";

/** Limita tentativas de login/registo por IP. */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  skip: () => env.NODE_ENV === "test",
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).type("application/problem+json").json({
      type: "about:blank",
      title: "Demasiados pedidos",
      status: 429,
      detail: "Fez demasiadas tentativas. Aguarde alguns minutos e tente de novo.",
    });
  },
});
