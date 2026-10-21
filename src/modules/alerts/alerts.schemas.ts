import { moneySchema, z } from "../../shared/http/schemas";

export const alertSettingsInputSchema = z
  .object({
    email: z
      .string({ error: "Email inválido." })
      .trim()
      .toLowerCase()
      .pipe(z.email({ message: "Email inválido." })),
    budgetThreshold: z.number({ error: "Entre 50% e 100%." }).int({ message: "Entre 50% e 100%." }).min(50, { message: "Entre 50% e 100%." }).max(100, { message: "Entre 50% e 100%." }),
    budgetAlerts: z.boolean(),
    billAlerts: z.boolean(),
    billDaysAhead: z.number({ error: "Entre 1 e 30 dias." }).int({ message: "Entre 1 e 30 dias." }).min(1, { message: "Entre 1 e 30 dias." }).max(30, { message: "Entre 1 e 30 dias." }),
    lowBalanceAlerts: z.boolean(),
    lowBalanceAmount: moneySchema("Valor inválido.").refine((v) => Number(v) >= 0, { message: "Valor inválido." }),
    goalAlerts: z.boolean(),
    // Opcional: clientes antigos não o enviam (fica como está)
    forecastAlerts: z.boolean().optional(),
    weeklySummary: z.boolean(),
    monthlyReport: z.boolean(),
  })
  .openapi("AlertSettingsInput");

export type AlertSettingsInput = z.infer<typeof alertSettingsInputSchema>;

export const alertIdParamSchema = z.object({ id: z.string().min(1).max(200) });

export const alertSettingsSchema = alertSettingsInputSchema.extend({ lowBalanceAmount: z.string().openapi({ example: "1000.00" }) }).openapi("AlertSettings");

export const alertListSchema = z
  .object({
    items: z.array(
      z
        .object({
          id: z.string().openapi({ example: "budget:3f1c9a52-7d0e-4b8a-9b0e-2b5f3f1d6c11:2026-10:over" }),
          kind: z.enum(["BUDGET", "BILL", "LOW_BALANCE", "GOAL", "OVERSPENDING"]),
          severity: z.enum(["info", "warning", "critical"]),
          title: z.string(),
          message: z.string(),
          date: z.string(),
          href: z.string(),
          read: z.boolean(),
        })
        .openapi("Alert"),
    ),
    unread: z.number().int(),
  })
  .openapi("AlertList");
