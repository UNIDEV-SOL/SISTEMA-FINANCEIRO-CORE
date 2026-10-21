import { colorSchema, moneySchema, optionalText, requiredText, z } from "../../shared/http/schemas";

export const accountTypeSchema = z
  .enum(["BANK", "MOBILE_WALLET", "CASH", "SAVINGS", "INVESTMENT"], { error: "Escolha o tipo de conta." })
  .openapi("AccountType");

export const accountInputSchema = z
  .object({
    name: requiredText("Indique um nome.", 60),
    type: accountTypeSchema,
    institution: optionalText(60),
    color: colorSchema,
    initialBalance: moneySchema("Saldo inicial inválido.").optional().default("0"),
    includeInTotal: z.boolean({ error: "Valor inválido." }).optional().default(true),
  })
  .openapi("AccountInput");

export type AccountInput = z.infer<typeof accountInputSchema>;

export const ACCOUNT_SORTS = ["createdAt", "name", "type"] as const;

export const accountSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    type: accountTypeSchema,
    institution: z.string().optional(),
    color: z.string(),
    initialBalance: z.string().openapi({ example: "18500.00" }),
    balance: z.string().openapi({ example: "21340.50" }),
    includeInTotal: z.boolean(),
    archived: z.boolean(),
  })
  .openapi("Account");
