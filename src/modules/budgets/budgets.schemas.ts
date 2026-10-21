import { positiveMoneySchema, yearMonthSchema, z } from "../../shared/http/schemas";

export const budgetInputSchema = z.object({ limit: positiveMoneySchema("O limite tem de ser maior que zero.") }).openapi("BudgetInput");

export const budgetQuerySchema = z.object({ month: yearMonthSchema.optional() });

export const categoryIdParamSchema = z.object({ categoryId: z.uuid({ message: "Identificador inválido." }) });

const money = z.string().openapi({ example: "9000.00" });

export const budgetOverviewSchema = z
  .object({
    month: z.string().openapi({ example: "2026-10" }),
    lines: z.array(
      z.object({ categoryId: z.uuid(), limit: money.optional(), spent: money, pending: money, suggested: money }).openapi("BudgetLine"),
    ),
    totalLimit: money,
    totalSpent: money,
    daysLeft: z.number().int(),
  })
  .openapi("BudgetOverview");
