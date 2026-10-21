import { colorSchema, moneySchema, positiveMoneySchema, queryBoolean, requiredText, z } from "../../shared/http/schemas";

/** Limite do simulador: 50 anos. */
export const MAX_MONTHS = 600;

const MONTHS_MESSAGE = `Indique um prazo entre 1 e ${MAX_MONTHS} meses.`;
const RETURN_MESSAGE = "Indique um rendimento anual entre 0 e 100%.";

const monthsSchema = z.coerce
  .number({ error: MONTHS_MESSAGE })
  .int({ message: MONTHS_MESSAGE })
  .min(1, { message: MONTHS_MESSAGE })
  .max(MAX_MONTHS, { message: MONTHS_MESSAGE });

const returnSchema = z.coerce.number({ error: RETURN_MESSAGE }).min(0, { message: RETURN_MESSAGE }).max(100, { message: RETURN_MESSAGE });

export const planCodeSchema = z
  .string({ error: "Código inválido." })
  .trim()
  .toUpperCase()
  .regex(/^[A-Z][A-Z0-9_]{1,39}$/, { message: "Use letras maiúsculas, números e _ (ex.: CAR)." })
  .openapi({ example: "CAR" });

/**
 * GET /growth/simulate. Com `months`, calcula a prestação; com `monthly`, quantos meses demora.
 * Sem nenhum dos dois, usa o prazo sugerido do plano.
 */
export const simulateQuerySchema = z
  .object({
    plan: planCodeSchema.optional(),
    target: positiveMoneySchema("Indique quanto quer juntar."),
    initial: moneySchema("Valor inválido.")
      .refine((v) => Number(v) >= 0, { message: "O valor inicial não pode ser negativo." })
      .optional(),
    months: monthsSchema.optional(),
    monthly: positiveMoneySchema("A prestação tem de ser maior que zero.").optional(),
    annualReturn: returnSchema.optional(),
  })
  .refine((v) => !(v.months && v.monthly), { message: "Indique o prazo ou a prestação, não os dois.", path: ["monthly"] })
  .openapi("GrowthSimulateQuery");

export type SimulateQuery = z.infer<typeof simulateQuerySchema>;

const planFields = {
  name: requiredText("Indique o nome.", 60),
  description: requiredText("Indique uma descrição curta.", 200),
  icon: requiredText("Escolha um ícone.", 40),
  color: colorSchema,
  annualReturn: z.number({ error: RETURN_MESSAGE }).min(0, { message: RETURN_MESSAGE }).max(100, { message: RETURN_MESSAGE }).optional().default(0),
  defaultMonths: z
    .number({ error: MONTHS_MESSAGE })
    .int({ message: MONTHS_MESSAGE })
    .min(1, { message: MONTHS_MESSAGE })
    .max(MAX_MONTHS, { message: MONTHS_MESSAGE })
    .optional()
    .default(12),
  tips: z.string().max(4000, { message: "Máximo de 4000 caracteres." }).optional().default(""),
  active: z.boolean({ error: "Valor inválido." }).optional().default(true),
  order: z.number({ error: "Ordem inválida." }).int({ message: "Ordem inválida." }).min(0, { message: "Ordem inválida." }).optional(),
};

export const planCreateSchema = z.object({ code: planCodeSchema, ...planFields }).openapi("GrowthPlanCreateInput");
export const planUpdateSchema = z.object(planFields).openapi("GrowthPlanUpdateInput");

export type PlanCreateInput = z.infer<typeof planCreateSchema>;
export type PlanUpdateInput = z.infer<typeof planUpdateSchema>;

export const PLAN_SORTS = ["order", "name", "code"] as const;
export const planFiltersSchema = z.object({ active: queryBoolean().optional() });

// ---------- Respostas (documentação) ----------

const money = z.string().openapi({ example: "15000.00" });

export const planTypeSchema = z
  .object({
    id: z.uuid(),
    code: z.string().openapi({ example: "CAR" }),
    name: z.string(),
    description: z.string(),
    icon: z.string(),
    color: z.string(),
    annualReturn: z.number(),
    defaultMonths: z.number().int(),
    tips: z.string(),
    order: z.number().int(),
    active: z.boolean(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("GrowthPlanType");

const proposalSchema = z
  .object({
    code: z.string(),
    tone: z.enum(["danger", "warning", "info", "success"]),
    title: z.string(),
    message: z.string(),
    amount: money.optional(),
    planCode: z.string().optional(),
    link: z.string().optional(),
  })
  .openapi("GrowthProposal");

export const overviewSchema = z
  .object({
    profile: z
      .object({
        months: z.number().int(),
        basis: z.enum(["LOOKBACK", "CURRENT_MONTH", "NONE"]),
        avgIncome: money,
        avgExpense: money,
        avgSaving: money,
        savingsRate: z.number().nullable(),
        avgWants: money,
        wantsRate: z.number().nullable(),
        topWants: z.array(z.object({ categoryId: z.uuid(), name: z.string(), avg: money })),
        savings: money,
        invested: money,
        emergencyTarget: money,
        emergencyCoverage: z.number().nullable(),
        targets: z.object({ savingsRate: z.number(), wantsMaxRate: z.number(), emergencyMonths: z.number(), comfortableShare: z.number() }),
      })
      .openapi("GrowthProfile"),
    proposals: z.array(proposalSchema),
    plans: z.array(planTypeSchema.extend({ projection: z.object({ monthly: money, months: z.number().int(), amount: money }).nullable() })),
  })
  .openapi("GrowthOverview");

export const simulationSchema = z
  .object({
    planCode: z.string().nullable(),
    target: money,
    initial: money,
    annualReturn: z.number(),
    months: z.number().int().nullable(),
    monthly: money,
    reachedIn: z.string().nullable(),
    totalContributed: money,
    interest: money,
    finalAmount: money,
    schedule: z.array(z.object({ month: z.string(), balance: money, contributed: money })),
    fit: z.object({
      status: z.enum(["REACHED", "COMFORTABLE", "TIGHT", "OUT_OF_REACH", "NO_SAVINGS"]),
      avgSaving: money,
      share: z.number().nullable(),
      comfortableMonths: z.number().int().nullable(),
      comfortableMonthly: money,
    }),
  })
  .openapi("GrowthSimulation");

export const planIdParamSchema = z.object({ id: z.uuid({ message: "Identificador inválido." }) });
