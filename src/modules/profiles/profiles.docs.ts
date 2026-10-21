import { documentPath } from "../../shared/docs/registry";
import { pageQuerySchema, pageSchema } from "../../shared/http/pagination";
import { idParamSchema, z } from "../../shared/http/schemas";
import { permissionSchema, permissionsInputSchema, PROFILE_SORTS, profileCreateSchema, profileSchema, profileUpdateSchema } from "./profiles.schemas";

const tag = "Administração — perfis";

documentPath({
  method: "get",
  path: "/admin/profiles",
  tag,
  summary: "Lista os perfis (paginado)",
  description: "`search` procura no nome e no código. Por omissão, por nome.",
  query: pageQuerySchema(PROFILE_SORTS),
  response: { schema: pageSchema(profileSchema, "ProfilePage") },
});

documentPath({
  method: "post",
  path: "/admin/profiles",
  tag,
  summary: "Cria um perfil",
  description: "Sem `code`, é gerado a partir do nome (ex.: \"Gestor de equipa\" → GESTOR_DE_EQUIPA). Com `isDefault`, deixa de haver outro por omissão.",
  body: profileCreateSchema,
  response: { status: 201, schema: profileSchema },
});

documentPath({ method: "get", path: "/admin/profiles/{id}", tag, summary: "Um perfil", params: idParamSchema, response: { schema: profileSchema } });

documentPath({
  method: "put",
  path: "/admin/profiles/{id}",
  tag,
  summary: "Actualiza nome, descrição e perfil por omissão",
  description: "O código não muda. Tem de haver sempre um perfil por omissão, e não pode ser de super administrador.",
  params: idParamSchema,
  body: profileUpdateSchema,
  response: { schema: profileSchema },
});

documentPath({
  method: "delete",
  path: "/admin/profiles/{id}",
  tag,
  summary: "Apaga um perfil",
  description: "409 se for de sistema, tiver utilizadores, for o perfil por omissão ou o das contas de dependentes.",
  params: idParamSchema,
});

documentPath({
  method: "get",
  path: "/admin/profiles/{id}/permissions",
  tag,
  summary: "Permissões atribuídas directamente ao perfil",
  description: "Os filhos herdam as acções das secções-pai a que o perfil está ligado.",
  params: idParamSchema,
  response: { schema: z.array(permissionSchema) },
});

documentPath({
  method: "put",
  path: "/admin/profiles/{id}/permissions",
  tag,
  summary: "Substitui as permissões do perfil",
  description: "Funcionalidades com `actions` vazio ficam sem ligação. 409 para o super administrador. Tem efeito imediato.",
  params: idParamSchema,
  body: permissionsInputSchema,
  response: { schema: z.array(permissionSchema) },
});
