import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

extendZodWithOpenApi(z);

// Mensagens por omissão em português; os campos de negócio têm mensagens próprias.
z.config(z.locales.pt());

const MONEY = /^-?\d{1,13}(\.\d{1,2})?$/;

/** Aceita "1250.5", "1250,50" ou número; devolve string normalizada com ponto. */
const moneyBase = (message: string) =>
  z
    .union([z.string(), z.number()], { error: message })
    .transform((v) => String(v).trim().replace(",", "."))
    .refine((v) => MONEY.test(v), { message });

export const moneySchema = (message = "Valor inválido.") => moneyBase(message).openapi({ type: "string", example: "1250.00" });

export const positiveMoneySchema = (message: string) =>
  moneyBase(message)
    .refine((v) => Number(v) > 0, { message })
    .openapi({ type: "string", example: "1250.00" });

export const isoDateSchema = (message = "Data inválida.") =>
  z
    .string({ error: message })
    .regex(/^\d{4}-\d{2}-\d{2}$/, { message })
    .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().startsWith(v), { message })
    .openapi({ example: "2026-10-20" });

export const yearMonthSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, { message: "Mês inválido (formato AAAA-MM)." })
  .openapi({ example: "2026-10" });

export const colorSchema = z
  .string({ error: "Escolha uma cor." })
  .regex(/^#[0-9a-fA-F]{6}$/, { message: "Cor inválida (ex.: #2563eb)." })
  .openapi({ example: "#2563eb" });

/** Texto opcional: string vazia ou só espaços passa a undefined. */
export const optionalText = (max = 500) =>
  z
    .string()
    .max(max, { message: `Máximo de ${max} caracteres.` })
    .optional()
    .nullable()
    .transform((v) => (v?.trim() ? v.trim() : undefined));

export const requiredText = (message: string, max = 120) =>
  z
    .string({ error: message })
    .trim()
    .min(1, { message })
    .max(max, { message: `Máximo de ${max} caracteres.` });

export const idParamSchema = z.object({
  id: z.uuid({ message: "Identificador inválido." }).openapi({ example: "3f1c9a52-7d0e-4b8a-9b0e-2b5f3f1d6c11" }),
});

export const problemSchema = z
  .object({
    type: z.string().openapi({ example: "about:blank" }),
    title: z.string().openapi({ example: "Dados inválidos" }),
    status: z.number().int().openapi({ example: 422 }),
    detail: z.string().optional().openapi({ example: "Corrija os campos assinalados." }),
    errors: z.array(z.object({ field: z.string(), message: z.string() })).optional(),
  })
  .openapi("Problem");

export { z };

/** Booleano na query string ("true" / "false"). */
export const queryBoolean = (message = "Use true ou false.") =>
  z
    .enum(["true", "false"], { error: message })
    .transform((v) => v === "true")
    .openapi({ type: "boolean" });

/** Código em maiúsculas com sublinhados, ex.: "ADMIN_USERS". */
export const upperSnakeSchema = (message: string) =>
  z
    .string({ error: message })
    .trim()
    .toUpperCase()
    .regex(/^[A-Z][A-Z0-9_]{1,39}$/, { message })
    .openapi({ example: "GESTOR" });
