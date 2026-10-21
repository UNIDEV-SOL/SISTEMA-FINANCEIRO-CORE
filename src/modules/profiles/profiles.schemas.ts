import { optionalText, requiredText, upperSnakeSchema, z } from "../../shared/http/schemas";
import { actionSchema } from "../auth/auth.schemas";

export const profileCreateSchema = z
  .object({
    code: upperSnakeSchema("Código inválido: letras maiúsculas, números e _ (ex.: GESTOR).").optional().openapi({ description: "Gerado a partir do nome se omitido." }),
    name: requiredText("Indique o nome.", 60),
    description: optionalText(300),
    isDefault: z.boolean({ error: "Valor inválido." }).optional().default(false),
  })
  .openapi("ProfileCreateInput");

/** O código não muda depois de criado (é referido por parâmetros como family.dependentProfile). */
export const profileUpdateSchema = z
  .object({
    name: requiredText("Indique o nome.", 60),
    description: optionalText(300),
    isDefault: z.boolean({ error: "Valor inválido." }).optional().openapi({ description: "Omisso: mantém-se." }),
  })
  .openapi("ProfileUpdateInput");

export type ProfileCreateInput = z.infer<typeof profileCreateSchema>;
export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;

export const PROFILE_SORTS = ["name", "code", "createdAt"] as const;

export const permissionsInputSchema = z
  .object({
    items: z
      .array(
        z.object({
          functionalityId: z.uuid({ message: "Funcionalidade inválida." }),
          actions: z.array(actionSchema, { error: "Acções inválidas." }).max(6),
        }),
        { error: "Indique a lista de permissões." },
      )
      .max(500),
  })
  .openapi("PermissionsInput");

export type PermissionsInput = z.infer<typeof permissionsInputSchema>;

export const profileSchema = z
  .object({
    id: z.uuid(),
    code: z.string().openapi({ example: "USER" }),
    name: z.string().openapi({ example: "Utilizador" }),
    description: z.string().nullable(),
    superAdmin: z.boolean(),
    system: z.boolean().openapi({ description: "Perfis de sistema não podem ser apagados." }),
    isDefault: z.boolean().openapi({ description: "Perfil dado a quem se regista." }),
    userCount: z.number().int(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("Profile");

export const permissionSchema = z
  .object({ functionalityId: z.uuid(), code: z.string().openapi({ example: "TRANSACTIONS" }), actions: z.array(actionSchema) })
  .openapi("Permission");
