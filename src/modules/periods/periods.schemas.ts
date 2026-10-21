import { z } from "../../shared/http/schemas";

const YEAR_MESSAGE = "Indique um ano entre 2000 e 2100.";

export const periodStatusSchema = z.enum(["OPEN", "CLOSED"], { error: "Escolha aberto ou fechado." }).openapi("PeriodStatus");

const yearSchema = z.coerce
  .number({ error: YEAR_MESSAGE })
  .int({ message: YEAR_MESSAGE })
  .min(2000, { message: YEAR_MESSAGE })
  .max(2100, { message: YEAR_MESSAGE })
  .openapi({ example: 2026 });

export const periodYearParamSchema = z.object({ year: yearSchema });

export const periodCreateSchema = z
  .object({ year: yearSchema, status: periodStatusSchema.optional().default("OPEN") })
  .openapi("PeriodCreateInput");

export const periodUpdateSchema = z
  .object({
    status: periodStatusSchema.optional(),
    isCurrent: z.boolean({ error: "Valor inválido." }).optional().openapi({ description: "Só `true` muda o ano corrente (há sempre um)." }),
  })
  .openapi("PeriodUpdateInput");

export type PeriodCreateInput = z.infer<typeof periodCreateSchema>;
export type PeriodUpdateInput = z.infer<typeof periodUpdateSchema>;

export const periodSchema = z
  .object({
    year: z.number().int().openapi({ example: 2026 }),
    status: periodStatusSchema,
    isCurrent: z.boolean(),
    createdAt: z.string(),
    updatedAt: z.string(),
    updatedBy: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  })
  .openapi("Period");

export const adminPeriodSchema = periodSchema
  .extend({ hasData: z.boolean().openapi({ description: "Há registos com data neste ano (não pode ser apagado)." }) })
  .openapi("AdminPeriod");

export const periodListSchema = z
  .object({ items: z.array(periodSchema), current: z.number().int().openapi({ example: 2026 }) })
  .openapi("PeriodList");
