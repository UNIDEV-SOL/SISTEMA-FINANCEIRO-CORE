import { z } from "../../shared/http/schemas";

export const annualQuerySchema = z.object({
  year: z.coerce.number({ error: "Ano inválido." }).int({ message: "Ano inválido." }).min(2000, { message: "Ano inválido." }).max(2100, { message: "Ano inválido." }).optional(),
});

const money = z.string().openapi({ example: "45000.00" });
const totals = z.object({ income: money, expense: money, net: money });

export const annualReportSchema = z
  .object({
    year: z.number().int(),
    months: z.array(
      z.object({ month: z.string(), income: money, expense: money, net: money, netWorth: money, future: z.boolean(), empty: z.boolean() }),
    ),
    expenseByCategory: z.array(z.object({ categoryId: z.uuid(), months: z.array(money), total: money })),
    totals,
    previousTotals: totals,
    availableYears: z.array(z.number().int()),
  })
  .openapi("AnnualReport");
