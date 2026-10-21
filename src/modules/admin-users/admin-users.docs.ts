import { documentPath } from "../../shared/docs/registry";
import { pageQuerySchema, pageSchema } from "../../shared/http/pagination";
import { idParamSchema } from "../../shared/http/schemas";
import {
  ADMIN_USER_SORTS,
  adminUserActiveSchema,
  adminUserCreateSchema,
  adminUserFiltersSchema,
  adminUserPasswordSchema,
  adminUserSchema,
  adminUserUpdateSchema,
} from "./admin-users.schemas";

const tag = "Administração — utilizadores";

documentPath({
  method: "get",
  path: "/admin/users",
  tag,
  summary: "Lista os utilizadores (paginado)",
  description: "Filtros `profileId` e `active`; `search` procura no nome e no email. Por omissão, por nome.",
  query: pageQuerySchema(ADMIN_USER_SORTS).extend(adminUserFiltersSchema.shape),
  response: { schema: pageSchema(adminUserSchema, "AdminUserPage") },
});

documentPath({
  method: "post",
  path: "/admin/users",
  tag,
  summary: "Cria um utilizador",
  description: "Com categorias por omissão e alertas iniciais. Só um super administrador pode atribuir um perfil de super administrador (403).",
  body: adminUserCreateSchema(8),
  response: { status: 201, schema: adminUserSchema },
});

documentPath({ method: "get", path: "/admin/users/{id}", tag, summary: "Um utilizador", params: idParamSchema, response: { schema: adminUserSchema } });

documentPath({
  method: "put",
  path: "/admin/users/{id}",
  tag,
  summary: "Actualiza nome, email e perfil",
  description: "409 se deixar de haver um super administrador activo.",
  params: idParamSchema,
  body: adminUserUpdateSchema,
  response: { schema: adminUserSchema },
});

documentPath({
  method: "patch",
  path: "/admin/users/{id}/active",
  tag,
  summary: "Activa ou desactiva a conta",
  description: "Contas desactivadas não iniciam sessão e as sessões abertas deixam de funcionar. 409 ao desactivar-se a si próprio ou ao último super administrador activo.",
  params: idParamSchema,
  body: adminUserActiveSchema,
  response: { schema: adminUserSchema },
});

documentPath({
  method: "post",
  path: "/admin/users/{id}/password",
  tag,
  summary: "Define uma nova palavra-passe",
  params: idParamSchema,
  body: adminUserPasswordSchema(8),
});
