import { documentPath } from "../../shared/docs/registry";
import { pageQuerySchema, pageSchema } from "../../shared/http/pagination";
import { AUDIT_SORTS, auditFiltersSchema, auditLogSchema } from "./audit.schemas";

documentPath({
  method: "get",
  path: "/admin/audit",
  tag: "Administração — auditoria",
  summary: "Registo de auditoria (paginado)",
  description:
    "Escritas, exportações, inícios de sessão (com e sem sucesso) e acessos recusados. Filtros `action`, `actorId`, `from`, `to`; " +
    "`search` procura no nome e no caminho. Por omissão, os mais recentes primeiro.",
  query: pageQuerySchema(AUDIT_SORTS).extend(auditFiltersSchema.shape),
  response: { schema: pageSchema(auditLogSchema, "AuditLogPage") },
});
