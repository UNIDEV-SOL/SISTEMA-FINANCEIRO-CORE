import { pageSchema } from "../../shared/http/pagination";
import { isoDateSchema, optionalText, positiveMoneySchema, requiredText, yearMonthSchema, z } from "../../shared/http/schemas";

export const transactionTypeSchema = z.enum(["INCOME", "EXPENSE", "TRANSFER"], { error: "Tipo inválido." }).openapi("TransactionType");

export const transactionStatusSchema = z.enum(["CLEARED", "PENDING"], { error: "Estado inválido." }).openapi("TransactionStatus");

/** Ids opcionais: string vazia conta como ausente; o formato é verificado no serviço. */
const optionalId = z
  .string()
  .optional()
  .nullable()
  .transform((v) => v || undefined);

export const transactionInputSchema = z
  .object({
    type: transactionTypeSchema,
    description: requiredText("Indique uma descrição.", 120),
    amount: positiveMoneySchema("O valor tem de ser maior que zero."),
    date: isoDateSchema("Data inválida."),
    accountId: z.string({ error: "Escolha uma conta." }),
    destinationAccountId: optionalId,
    categoryId: optionalId,
    status: transactionStatusSchema.optional().default("CLEARED"),
    notes: optionalText(500),
  })
  .openapi("TransactionInput");

export type TransactionInput = z.infer<typeof transactionInputSchema>;

export const TRANSACTION_SORTS = ["date", "amount", "description", "createdAt"] as const;

export const transactionFiltersSchema = z.object({
  month: yearMonthSchema.optional(),
  type: transactionTypeSchema.optional(),
  accountId: z.string().optional(),
  categoryId: z.string().optional(),
  q: z.string().max(100).optional().openapi({ description: "Igual a `search` (mantido por compatibilidade)." }),
});

export const transactionSchema = z
  .object({
    id: z.uuid(),
    type: transactionTypeSchema,
    description: z.string(),
    amount: z.string().openapi({ example: "1250.00" }),
    date: z.string().openapi({ example: "2026-10-20" }),
    accountId: z.uuid(),
    destinationAccountId: z.uuid().optional(),
    categoryId: z.uuid().optional(),
    status: transactionStatusSchema,
    notes: z.string().optional(),
    createdAt: z.string().openapi({ example: "2026-10-20T13:45:00.000Z" }),
  })
  .openapi("Transaction");

const totalsSchema = z.object({ income: z.string(), expense: z.string(), net: z.string() });

export const transactionListSchema = pageSchema(transactionSchema, "TransactionPageBase")
  .extend({ totals: totalsSchema.openapi({ description: "Totais de todas as transações filtradas (não só da página)." }) })
  .openapi("TransactionPage");
