import { requiredText, z } from "../../shared/http/schemas";

export const emailSchema = z
  .string({ error: "Indique o email." })
  .trim()
  .toLowerCase()
  .pipe(z.email({ message: "Email inválido." }))
  .openapi({ example: "ana@exemplo.com" });

/** O mínimo vem do parâmetro `auth.passwordMinLength`. */
export const passwordSchema = (minLength: number) =>
  z
    .string({ error: "Indique a palavra-passe." })
    .min(minLength, { message: `A palavra-passe tem de ter pelo menos ${minLength} caracteres.` })
    .max(72, { message: "Máximo de 72 caracteres." });

export const nameSchema = requiredText("Indique o nome.", 80);

export const registerSchema = (minLength: number) =>
  z
    .object({
      name: requiredText("Indique o seu nome.", 80),
      email: emailSchema,
      password: passwordSchema(minLength),
    })
    .openapi("RegisterInput");

export const loginSchema = z
  .object({
    email: emailSchema,
    password: z.string({ error: "Indique a palavra-passe." }).min(1, { message: "Indique a palavra-passe." }),
  })
  .openapi("LoginInput");

export type RegisterInput = z.infer<ReturnType<typeof registerSchema>>;
export type LoginInput = z.infer<typeof loginSchema>;

const actionSchema = z.enum(["VIEW", "CREATE", "EDIT", "DELETE", "EXPORT", "IMPORT"]).openapi("Action");
export { actionSchema };

export const familyAccessSchema = z.enum(["VIEW", "MANAGE"], { error: "Escolha o tipo de acesso." }).openapi("FamilyAccess");

export const actingViaSchema = z.enum(["FAMILY", "ADMIN"]).openapi("ActingVia", { description: "Ligação familiar ou permissão de administração (ADMIN_USER_DATA)." });

export const actingAsSchema = z
  .object({ id: z.uuid(), name: z.string(), email: z.string(), access: familyAccessSchema, via: actingViaSchema })
  .openapi("ActingAs");

export const authUserSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    email: z.string(),
    currency: z.string().openapi({ example: "MZN" }),
    active: z.boolean(),
    profile: z.object({ id: z.uuid(), code: z.string(), name: z.string(), superAdmin: z.boolean() }).openapi("ProfileRef"),
    actingAs: actingAsSchema
      .nullable()
      .openapi({ description: "Pessoa por quem está a agir (cabeçalho X-Acting-As válido), ou null. `via`: ligação familiar ou permissão de administração (ADMIN_USER_DATA)." }),
  })
  .openapi("AuthUser");

export const sessionSchema = z.object({ token: z.string(), user: authUserSchema }).openapi("Session");
