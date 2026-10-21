import { z } from "../../shared/http/schemas";
import { emailSchema, familyAccessSchema, nameSchema, passwordSchema } from "../auth/auth.schemas";

export const dependentCreateSchema = (minLength: number) =>
  z
    .object({ name: nameSchema, email: emailSchema, password: passwordSchema(minLength), access: familyAccessSchema })
    .openapi("DependentCreateInput");

export const invitationCreateSchema = z.object({ email: emailSchema, access: familyAccessSchema }).openapi("FamilyInvitationInput");

export const linkAccessSchema = z.object({ access: familyAccessSchema }).openapi("FamilyLinkAccessInput");

export type DependentCreateInput = z.infer<ReturnType<typeof dependentCreateSchema>>;
export type InvitationCreateInput = z.infer<typeof invitationCreateSchema>;

export const familyLinkSchema = z
  .object({
    id: z.uuid(),
    access: familyAccessSchema,
    status: z.enum(["PENDING", "ACTIVE", "REVOKED"]).openapi("FamilyLinkStatus"),
    createdAt: z.string(),
    respondedAt: z.string().nullable(),
    person: z.object({ id: z.uuid(), name: z.string(), email: z.string() }).openapi({ description: "A outra pessoa da ligação." }),
  })
  .openapi("FamilyLink");

export const familyOverviewSchema = z
  .object({
    dependents: z.array(familyLinkSchema).openapi({ description: "Pessoas que ajudo a gerir (activas e convites enviados)." }),
    guardians: z.array(familyLinkSchema).openapi({ description: "Quem me ajuda a gerir (activas)." }),
    invitations: z.array(familyLinkSchema).openapi({ description: "Convites recebidos, pendentes." }),
  })
  .openapi("FamilyOverview");
