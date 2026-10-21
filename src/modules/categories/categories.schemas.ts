import { colorSchema, requiredText, z } from "../../shared/http/schemas";

export const categoryKindSchema = z.enum(["INCOME", "EXPENSE"], { error: "Escolha receita ou despesa." }).openapi("CategoryKind");

export const budgetGroupSchema = z.enum(["NEEDS", "WANTS", "SAVINGS"], { error: "Grupo inválido." }).openapi("BudgetGroup");

export const categoryInputSchema = z
  .object({
    name: requiredText("Indique um nome.", 60),
    kind: categoryKindSchema,
    icon: z.string({ error: "Escolha um ícone." }).trim().min(1, { message: "Escolha um ícone." }).max(40),
    color: colorSchema,
    group: budgetGroupSchema.optional().nullable(),
  })
  .openapi("CategoryInput");

export type CategoryInput = z.infer<typeof categoryInputSchema>;

export const CATEGORY_SORTS = ["createdAt", "name", "kind"] as const;

export const categoryFiltersSchema = z.object({ kind: categoryKindSchema.optional() });

export const categorySchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    kind: categoryKindSchema,
    icon: z.string(),
    color: z.string(),
    group: budgetGroupSchema.optional(),
  })
  .openapi("Category");
