import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().default(4000),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32, "JWT_SECRET tem de ter pelo menos 32 caracteres"),
  // Super administrador inicial, criado pelo `yarn seed` (a duração da sessão é o parâmetro auth.sessionDays)
  ADMIN_NAME: z.string().default("Administrador"),
  ADMIN_EMAIL: z.email().default("admin@financas.local"),
  ADMIN_PASSWORD: z.string().min(8, "ADMIN_PASSWORD tem de ter pelo menos 8 caracteres").default("admin12345"),
  CORS_ORIGINS: z.string().default("http://localhost:3000"),
  APP_TZ: z.string().default("Africa/Maputo"),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  MAIL_FROM: z.string().default("Finanças <no-reply@localhost>"),
  // Assistente: sem chave, responde em modo offline (pesquisa no manual e nas FAQ). Nunca registar no log.
  ANTHROPIC_API_KEY: z
    .string()
    .optional()
    .transform((v) => v?.trim() || undefined),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const problems = parsed.error.issues.map((issue) => `  ${issue.path.join(".")}: ${issue.message}`).join("\n");
  throw new Error(`Configuração inválida no ambiente:\n${problems}`);
}

export const env = parsed.data;
