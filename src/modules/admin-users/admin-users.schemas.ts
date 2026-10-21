import { queryBoolean, z } from "../../shared/http/schemas";
import { emailSchema, nameSchema, passwordSchema } from "../auth/auth.schemas";

const profileIdSchema = z.uuid({ message: "Escolha um perfil." });

export const adminUserCreateSchema = (minLength: number) =>
  z
    .object({
      name: nameSchema,
      email: emailSchema,
      password: passwordSchema(minLength),
      profileId: profileIdSchema,
      active: z.boolean({ error: "Valor inválido." }).optional().default(true),
    })
    .openapi("AdminUserCreateInput");

export const adminUserUpdateSchema = z.object({ name: nameSchema, email: emailSchema, profileId: profileIdSchema }).openapi("AdminUserUpdateInput");

export const adminUserActiveSchema = z.object({ active: z.boolean({ error: "Valor inválido." }) }).openapi("AdminUserActiveInput");

export const adminUserPasswordSchema = (minLength: number) => z.object({ password: passwordSchema(minLength) }).openapi("AdminUserPasswordInput");

export type AdminUserCreateInput = z.infer<ReturnType<typeof adminUserCreateSchema>>;
export type AdminUserUpdateInput = z.infer<typeof adminUserUpdateSchema>;

export const ADMIN_USER_SORTS = ["name", "email", "createdAt", "lastLoginAt"] as const;

export const adminUserFiltersSchema = z.object({
  profileId: z.uuid({ message: "Perfil inválido." }).optional(),
  active: queryBoolean().optional(),
});

export const adminUserSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    email: z.string(),
    active: z.boolean(),
    profile: z.object({ id: z.uuid(), code: z.string(), name: z.string(), superAdmin: z.boolean() }),
    currency: z.string().openapi({ example: "MZN" }),
    createdAt: z.string(),
    lastLoginAt: z.string().nullable(),
  })
  .openapi("AdminUser");
