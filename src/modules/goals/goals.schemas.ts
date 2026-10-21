import { colorSchema, isoDateSchema, moneySchema, optionalText, positiveMoneySchema, requiredText, z } from "../../shared/http/schemas";
import { todayIso } from "../../shared/lib/dates";

const optionalDate = (message: string) =>
  z
    .union([isoDateSchema(message), z.literal(""), z.null()])
    .optional()
    .transform((v) => v || undefined);

export const goalInputSchema = z
  .object({
    name: requiredText("Indique um nome.", 80),
    icon: z
      .string()
      .max(40)
      .optional()
      .transform((v) => v?.trim() || "piggy"),
    color: colorSchema,
    target: positiveMoneySchema("O valor alvo tem de ser maior que zero."),
    deadline: optionalDate("O prazo tem de ser uma data futura.").refine((v) => !v || v >= todayIso(), {
      message: "O prazo tem de ser uma data futura.",
    }),
    accountId: z
      .string()
      .optional()
      .nullable()
      .transform((v) => v || undefined),
  })
  .openapi("GoalInput");

export type GoalInput = z.infer<typeof goalInputSchema>;

export const GOAL_SORTS = ["createdAt", "name", "deadline", "target"] as const;

export const contributionInputSchema = z
  .object({
    amount: moneySchema("Indique um valor diferente de zero.").refine((v) => Number(v) !== 0, { message: "Indique um valor diferente de zero." }),
    date: isoDateSchema("Data inválida."),
    note: optionalText(200),
  })
  .openapi("ContributionInput");

export type ContributionInput = z.infer<typeof contributionInputSchema>;

const money = z.string().openapi({ example: "5000.00" });

export const goalSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    icon: z.string(),
    color: z.string(),
    target: money,
    saved: money,
    deadline: z.string().optional(),
    accountId: z.uuid().optional(),
    monthlyNeeded: money.optional(),
    contributions: z.array(
      z
        .object({ id: z.uuid(), amount: money, date: z.string(), note: z.string().optional(), createdAt: z.string() })
        .openapi("GoalContribution"),
    ),
    createdAt: z.string(),
  })
  .openapi("Goal");
