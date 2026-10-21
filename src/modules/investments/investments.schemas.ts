import { isoDateSchema, moneySchema, optionalText, positiveMoneySchema, requiredText, z } from "../../shared/http/schemas";
import { todayIso } from "../../shared/lib/dates";

export const investmentTypeSchema = z
  .enum(["TERM_DEPOSIT", "TREASURY_BONDS", "CORPORATE_BONDS", "STOCKS", "FUNDS", "REAL_ESTATE", "OTHER"], { error: "Escolha o tipo." })
  .openapi("InvestmentType");

export const investmentInputSchema = z
  .object({
    name: requiredText("Indique um nome.", 120),
    type: investmentTypeSchema,
    institution: optionalText(60),
    invested: positiveMoneySchema("O valor aplicado tem de ser maior que zero."),
    annualRate: z
      .union([z.string(), z.number()])
      .optional()
      .nullable()
      .transform((v) => (v === undefined || v === null || v === "" ? undefined : String(v).trim().replace(",", ".")))
      .refine((v) => v === undefined || /^\d{1,3}(\.\d{1,2})?$/.test(v), { message: "Taxa inválida (ex.: 9,5)." })
      .openapi({ type: "string", example: "9.5" }),
    startDate: isoDateSchema("Indique a data de início.").refine((v) => v <= todayIso(), { message: "A data de início não pode ser futura." }),
    maturityDate: z
      .union([isoDateSchema("Data de vencimento inválida."), z.literal(""), z.null()])
      .optional()
      .transform((v) => v || undefined),
  })
  .refine((v) => !v.maturityDate || v.maturityDate > v.startDate, {
    path: ["maturityDate"],
    message: "O vencimento tem de ser depois do início.",
    // Corre mesmo quando outros campos falham, para mostrar todos os erros de uma vez
    when: (payload) => typeof (payload.value as { startDate?: unknown })?.startDate === "string",
  })
  .openapi("InvestmentInput");

export type InvestmentInput = z.infer<typeof investmentInputSchema>;

export const INVESTMENT_SORTS = ["startDate", "name", "invested", "maturityDate", "createdAt"] as const;

export const investmentFiltersSchema = z.object({ type: investmentTypeSchema.optional() });

export const valuationInputSchema = z
  .object({
    date: isoDateSchema("A data tem de estar entre o início e hoje."),
    value: moneySchema("Valor inválido.").refine((v) => Number(v) >= 0, { message: "Valor inválido." }),
  })
  .openapi("ValuationInput");

export type ValuationInput = z.infer<typeof valuationInputSchema>;

const money = z.string().openapi({ example: "50000.00" });

export const investmentSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    type: investmentTypeSchema,
    institution: z.string().optional(),
    invested: money,
    currentValue: money,
    annualRate: z.string().optional().openapi({ example: "9.5" }),
    startDate: z.string(),
    maturityDate: z.string().optional(),
    valuations: z.array(z.object({ date: z.string(), value: money }).openapi("Valuation")),
  })
  .openapi("Investment");
