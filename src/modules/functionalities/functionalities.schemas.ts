import { isValidApiPattern } from "../../shared/access/policy";
import { requiredText, upperSnakeSchema, z } from "../../shared/http/schemas";

const optionalNullable = <T extends z.ZodType>(schema: T) =>
  z
    .union([schema, z.literal(""), z.null()])
    .optional()
    .transform((v) => (v === "" || v === undefined ? null : v));

const fields = {
  label: requiredText("Indique o nome.", 60),
  path: optionalNullable(
    z.string().trim().max(200, { message: "Máximo de 200 caracteres." }).regex(/^\//, { message: "O caminho começa por / (ex.: /transacoes)." }),
  ).openapi({ type: "string", description: "Página na front; vazio para secções." }),
  icon: optionalNullable(z.string().trim().max(60, { message: "Máximo de 60 caracteres." })).openapi({
    type: "string",
    description: "Nome do ícone lucide, ex.: arrow-left-right.",
  }),
  order: z.number({ error: "Ordem inválida." }).int({ message: "Ordem inválida." }).min(0, { message: "Ordem inválida." }).optional(),
  parentId: optionalNullable(z.uuid({ message: "Secção inválida." })).openapi({ type: "string" }),
  apiPaths: z
    .array(
      z
        .string()
        .trim()
        .refine(isValidApiPattern, { message: "Padrão inválido (ex.: /transactions, /budgets/** ou GET /admin/users para só leitura)." }),
      { error: "Lista de rotas inválida." },
    )
    .max(20)
    .optional()
    .default([])
    .openapi({ example: ["/transactions/**"] }),
  protectReads: z.boolean({ error: "Valor inválido." }).optional().default(false),
  active: z.boolean({ error: "Valor inválido." }).optional().default(true),
};

export const functionalityCreateSchema = z
  .object({ code: upperSnakeSchema("Código inválido: letras maiúsculas, números e _ (ex.: TRANSACTIONS)."), ...fields })
  .openapi("FunctionalityCreateInput");

/** O código não muda: a front usa-o como chave. */
export const functionalityUpdateSchema = z.object(fields).openapi("FunctionalityUpdateInput");

export const functionalityOrderSchema = z
  .object({
    items: z
      .array(
        z.object({
          id: z.uuid({ message: "Funcionalidade inválida." }),
          order: z.number({ error: "Ordem inválida." }).int({ message: "Ordem inválida." }).min(0, { message: "Ordem inválida." }),
          parentId: z.uuid({ message: "Secção inválida." }).nullable(),
        }),
      )
      .min(1, { message: "Indique a nova ordem." })
      .max(500),
  })
  .openapi("FunctionalityOrderInput");

export type FunctionalityCreateInput = z.infer<typeof functionalityCreateSchema>;
export type FunctionalityUpdateInput = z.infer<typeof functionalityUpdateSchema>;
export type FunctionalityOrderInput = z.infer<typeof functionalityOrderSchema>;

export const functionalityNodeSchema: z.ZodType = z
  .object({
    id: z.uuid(),
    code: z.string().openapi({ example: "TRANSACTIONS" }),
    label: z.string().openapi({ example: "Transações" }),
    path: z.string().nullable(),
    icon: z.string().nullable(),
    order: z.number().int(),
    parentId: z.uuid().nullable(),
    apiPaths: z.array(z.string()),
    protectReads: z.boolean(),
    active: z.boolean(),
    profileCount: z.number().int().openapi({ description: "Perfis ligados directamente." }),
    children: z.array(z.lazy(() => functionalityNodeSchema)),
  })
  .openapi("FunctionalityNode");
