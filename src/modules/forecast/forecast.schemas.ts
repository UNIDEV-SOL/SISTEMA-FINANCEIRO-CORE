import { positiveMoneySchema, queryBoolean, requiredText, yearMonthSchema, z } from "../../shared/http/schemas";

/**
 * GET /forecast. Com `scenarioAmount`, junta uma receita ou despesa mensal hipotética ("e se eu começar o
 * ginásio em Novembro?", "e se pedir um crédito de 8.000 por mês?") para comparar com a previsão normal.
 */
export const forecastQuerySchema = z
  .object({
    scenarioLabel: requiredText("Indique o que quer simular.", 60).optional(),
    scenarioType: z.enum(["INCOME", "EXPENSE"], { error: "Tipo inválido." }).optional().default("EXPENSE"),
    scenarioAmount: positiveMoneySchema("O valor tem de ser maior que zero.").optional(),
    scenarioFrom: yearMonthSchema.optional(),
    scenarioMonths: z.coerce
      .number({ error: "Indique os meses." })
      .int({ message: "Indique os meses." })
      .min(1, { message: "Indique os meses." })
      .max(600, { message: "Indique os meses." })
      .optional(),
    scenarioCommitment: queryBoolean().optional(),
  })
  .openapi("ForecastQuery");

export type ForecastQuery = z.infer<typeof forecastQuerySchema>;

const money = z.string().openapi({ example: "12500.00" });
const event = z.object({
  date: z.string(),
  type: z.enum(["INCOME", "EXPENSE"]),
  amount: money,
  label: z.string(),
  source: z.enum(["RECURRING", "PLANNED", "SCENARIO"]),
  commitment: z.boolean(),
  categoryId: z.uuid().optional(),
});

export const forecastSchema = z
  .object({
    generatedAt: z.string(),
    startCash: money.openapi({ description: "Dinheiro hoje nas contas do dia-a-dia (banco, carteiras, dinheiro vivo)." }),
    basis: z.object({ months: z.number().int(), variableIncome: money, variableExpense: money, includeVariableIncome: z.boolean(), tightRate: z.number() }),
    scenario: z
      .object({ label: z.string(), type: z.enum(["INCOME", "EXPENSE"]), amount: money, from: z.string(), months: z.number().int().optional(), commitment: z.boolean() })
      .nullable(),
    months: z.array(
      z.object({
        month: z.string(),
        current: z.boolean(),
        status: z.enum(["OK", "TIGHT", "NEGATIVE"]),
        income: z.object({ actual: money, fixed: money, variable: money, total: money }),
        expenses: z.object({ actual: money, commitments: money, fixed: money, variable: money, total: money }),
        balance: money.openapi({ description: "Receita menos despesa, antes de guardar para as metas." }),
        margin: money,
        savings: z.object({ total: money, goals: z.array(z.object({ goalId: z.uuid(), amount: money, ideal: money, reduced: z.boolean() })) }),
        free: money,
        cash: money.openapi({ description: "Dinheiro previsto nas contas do dia-a-dia no fim do mês." }),
        events: z.array(event),
        notes: z.array(z.string()),
      }),
    ),
    goals: z.array(
      z.object({
        goalId: z.uuid(),
        name: z.string(),
        color: z.string(),
        icon: z.string(),
        remaining: money,
        deadline: z.string().optional(),
        monthlyIdeal: money.nullable(),
        planned: money,
        completesIn: z.string().nullable(),
        onTrack: z.boolean(),
        shortfall: money,
      }),
    ),
  })
  .openapi("Forecast");
