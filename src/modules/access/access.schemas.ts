import { z } from "../../shared/http/schemas";
import { actingViaSchema, actionSchema, familyAccessSchema } from "../auth/auth.schemas";

export const menuNodeSchema: z.ZodType = z
  .object({
    code: z.string().openapi({ example: "TRANSACTIONS" }),
    label: z.string().openapi({ example: "Transações" }),
    path: z.string().nullable().openapi({ example: "/transacoes" }),
    icon: z.string().nullable().openapi({ example: "arrow-left-right" }),
    order: z.number().int(),
    actions: z.array(actionSchema),
    children: z.array(z.lazy(() => menuNodeSchema)),
  })
  .openapi("MenuNode");

export const ACTING_CANDIDATE_SORTS = ["name", "email"] as const;

export const actingCandidateSchema = z
  .object({
    id: z.uuid(),
    name: z.string().openapi({ example: "Igor Tobias" }),
    email: z.string().openapi({ example: "demo@financas.local" }),
    via: actingViaSchema,
    access: familyAccessSchema,
  })
  .openapi("ActingCandidate");

export const actingAsInputSchema = z
  .object({ userId: z.uuid({ error: "Escolha uma pessoa." }) })
  .openapi("ActingAsInput");
