import { isoDateSchema, z } from "../../shared/http/schemas";

export const AUDIT_ACTIONS = ["LOGIN", "LOGIN_FAILED", "CREATE", "EDIT", "DELETE", "IMPORT", "EXPORT", "ACCESS_DENIED", "VIEW_AS"] as const;

export const AUDIT_SORTS = ["createdAt", "durationMs", "statusCode"] as const;

export const auditFiltersSchema = z
  .object({
    action: z.enum(AUDIT_ACTIONS, { error: "Acção inválida." }).optional(),
    actorId: z.uuid({ message: "Utilizador inválido." }).optional(),
    from: isoDateSchema("Data inválida.").optional().openapi({ description: "Desde este dia (inclusive), no fuso da aplicação." }),
    to: isoDateSchema("Data inválida.").optional().openapi({ description: "Até este dia (inclusive), no fuso da aplicação." }),
  })
  .refine((v) => !v.from || !v.to || v.from <= v.to, { path: ["to"], message: "Tem de ser depois da data inicial." });

export const auditLogSchema = z
  .object({
    id: z.uuid(),
    actorId: z.uuid().nullable(),
    actorName: z.string().nullable().openapi({ description: "Nome de quem fez o pedido (no LOGIN_FAILED, o email tentado)." }),
    actingAsId: z.uuid().nullable(),
    actingAsName: z.string().nullable(),
    action: z.enum(AUDIT_ACTIONS).openapi("AuditAction"),
    method: z.string().openapi({ example: "POST" }),
    path: z.string().openapi({ example: "/transactions" }),
    statusCode: z.number().int(),
    functionalityCode: z.string().nullable(),
    ip: z.string().nullable(),
    userAgent: z.string().nullable(),
    durationMs: z.number().int(),
    details: z.unknown().nullable().openapi({ description: "Corpo do pedido, com palavras-passe e tokens mascarados (\"***\")." }),
    createdAt: z.string(),
  })
  .openapi("AuditLog");
