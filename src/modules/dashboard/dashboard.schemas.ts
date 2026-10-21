import { yearMonthSchema, z } from "../../shared/http/schemas";
import { budgetGroupSchema } from "../categories/categories.schemas";
import { transactionSchema } from "../transactions/transactions.schemas";

export const dashboardQuerySchema = z.object({ month: yearMonthSchema.optional() });

const money = z.string().openapi({ example: "45000.00" });

export const dashboardSummarySchema = z
  .object({
    month: z.string(),
    netWorth: money,
    invested: money,
    savings: money,
    income: money,
    expense: money,
    previousIncome: money,
    previousExpense: money,
    pendingExpense: money,
    byCategory: z.array(z.object({ categoryId: z.uuid(), amount: money, budget: money.optional() })),
    byGroup: z.array(z.object({ group: budgetGroupSchema, amount: money })),
    cashflow: z.array(z.object({ month: z.string(), income: money, expense: money })),
    daily: z.array(z.object({ day: z.number().int(), current: money.nullable(), previous: money })),
    recent: z.array(transactionSchema),
    upcoming: z.array(transactionSchema),
  })
  .openapi("DashboardSummary");
