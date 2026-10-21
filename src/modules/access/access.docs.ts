import { documentPath } from "../../shared/docs/registry";
import { pageQuerySchema, pageSchema } from "../../shared/http/pagination";
import { z } from "../../shared/http/schemas";
import { actingAsSchema } from "../auth/auth.schemas";
import { ACTING_CANDIDATE_SORTS, actingAsInputSchema, actingCandidateSchema, menuNodeSchema } from "./access.schemas";

documentPath({
  method: "get",
  path: "/access/menu",
  tag: "Acesso",
  summary: "Menu do utilizador, com as acções permitidas em cada entrada",
  description:
    "Árvore só com o que o perfil de quem iniciou sessão pode ver (as secções aparecem se tiverem filhos visíveis). " +
    "Os filhos herdam as acções da secção-pai. O super administrador vê tudo, com todas as acções. " +
    "Entradas com `path: null` dentro de uma secção (ex.: `ADMIN_USER_DATA`) são só permissões, sem página no menu.",
  response: { schema: z.array(menuNodeSchema) },
});

documentPath({
  method: "get",
  path: "/access/acting-candidates",
  tag: "Acesso",
  summary: "Pessoas cujas contas pode ver (selector de conta, paginado)",
  description:
    "Dependentes com ligação ACTIVE (`via: FAMILY`, com o acesso da ligação) e, com a permissão ADMIN_USER_DATA no perfil, " +
    "todos os utilizadores activos excepto o próprio (`via: ADMIN`; VIEW → acesso VIEW, EDIT → MANAGE; super administrador → MANAGE). " +
    "Quem não é super administrador não vê super administradores (salvo ligação familiar). Ordenado por nome; `search` procura no nome e no email.",
  query: pageQuerySchema(ACTING_CANDIDATE_SORTS),
  response: { schema: pageSchema(actingCandidateSchema, "ActingCandidatePage") },
});

documentPath({
  method: "post",
  path: "/access/acting-as",
  tag: "Acesso",
  summary: "Começa a ver as contas de outra pessoa",
  description:
    "Valida o acesso (família ou ADMIN_USER_DATA) e regista na auditoria a acção VIEW_AS com a pessoa visada. " +
    "Depois, o front envia `X-Acting-As: <userId>` em cada pedido. 403 `Não tem acesso às contas desta pessoa.` se não puder (incluindo contas desactivadas).",
  body: actingAsInputSchema,
  response: { schema: actingAsSchema },
});
