import { pageSchema } from "../../shared/http/pagination";
import { isoDateSchema, optionalText, positiveMoneySchema, queryBoolean, requiredText, z } from "../../shared/http/schemas";
import { transactionTypeSchema } from "../transactions/transactions.schemas";

export const MAX_INTERVAL = 52;

export const frequencySchema = z.enum(["WEEKLY", "MONTHLY", "YEARLY"], { error: "Escolha a frequência." }).openapi("RecurrenceFrequency");

/** Ids opcionais: string vazia conta como ausente; o formato é verificado no serviço. */
const optionalId = z
  .string()
  .optional()
  .nullable()
  .transform((v) => v || undefined);

const INTERVAL_MESSAGE = `Indique um intervalo entre 1 e ${MAX_INTERVAL}.`;

export const recurringInputSchema = z
  .object({
    type: transactionTypeSchema,
    description: requiredText("Indique uma descrição.", 120),
    amount: positiveMoneySchema("O valor tem de ser maior que zero."),
    accountId: z.string({ error: "Escolha uma conta." }),
    destinationAccountId: optionalId,
    categoryId: optionalId,
    notes: optionalText(500),
    frequency: frequencySchema,
    interval: z
      .number({ error: INTERVAL_MESSAGE })
      .int({ message: INTERVAL_MESSAGE })
      .min(1, { message: INTERVAL_MESSAGE })
      .max(MAX_INTERVAL, { message: INTERVAL_MESSAGE })
      .optional()
      .default(1),
    startDate: isoDateSchema("Indique a data da primeira vez."),
    endDate: isoDateSchema("Data inválida.").optional().nullable().or(z.literal("")).transform((v) => v || undefined),
    autoConfirm: z.boolean({ error: "Valor inválido." }).optional().default(true),
    commitment: z.boolean({ error: "Valor inválido." }).optional().default(false),
    active: z.boolean({ error: "Valor inválido." }).optional().default(true),
  })
  .refine((v) => !v.endDate || v.endDate >= v.startDate, { message: "O fim tem de ser depois da primeira vez.", path: ["endDate"] })
  .openapi("RecurringInput");

export type RecurringInput = z.infer<typeof recurringInputSchema>;

export const RECURRING_SORTS = ["nextDate", "description", "amount", "createdAt"] as const;

export const recurringFiltersSchema = z.object({
  active: queryBoolean().optional(),
  type: transactionTypeSchema.optional(),
});

export const recurringSchema = z
  .object({
    id: z.uuid(),
    type: transactionTypeSchema,
    description: z.string(),
    amount: z.string().openapi({ example: "45000.00" }),
    accountId: z.uuid(),
    destinationAccountId: z.uuid().optional(),
    categoryId: z.uuid().optional(),
    notes: z.string().optional(),
    frequency: frequencySchema,
    interval: z.number().int(),
    startDate: z.string().openapi({ example: "2026-10-25" }),
    endDate: z.string().optional(),
    nextDate: z.string().nullable().openapi({ description: "Próxima ocorrência por gerar; null quando acabou." }),
    autoConfirm: z.boolean(),
    commitment: z.boolean().openapi({ description: "Prestação ou compromisso obrigatório (crédito, financiamento)." }),
    active: z.boolean(),
    monthlyAmount: z.string().openapi({ description: "Valor equivalente por mês (ex.: semanal × 52 / 12)." }),
    occurrences: z.number().int().openapi({ description: "Transações geradas que ainda existem." }),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("Recurring");

const totalsSchema = z
  .object({ monthlyIncome: z.string(), monthlyExpense: z.string() })
  .openapi({ description: "Compromissos por mês das recorrentes activas (de todo o utilizador, não só da página)." });

export const recurringListSchema = pageSchema(recurringSchema, "RecurringPageBase").extend({ totals: totalsSchema }).openapi("RecurringPage");
