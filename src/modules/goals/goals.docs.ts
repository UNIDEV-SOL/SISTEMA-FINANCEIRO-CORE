import { documentPath } from "../../shared/docs/registry";
import { pageQuerySchema, pageSchema } from "../../shared/http/pagination";
import { idParamSchema } from "../../shared/http/schemas";
import { contributionInputSchema, GOAL_SORTS, goalInputSchema, goalSchema } from "./goals.schemas";

const tag = "Metas";

documentPath({
  method: "get",
  path: "/goals",
  tag,
  summary: "Lista as metas com o valor guardado (paginado)",
  description: "`search` procura no nome. Por omissão, pela ordem de criação.",
  query: pageQuerySchema(GOAL_SORTS),
  response: { schema: pageSchema(goalSchema, "GoalPage") },
});

documentPath({ method: "post", path: "/goals", tag, summary: "Cria uma meta", body: goalInputSchema, response: { status: 201, schema: goalSchema } });

documentPath({
  method: "put",
  path: "/goals/{id}",
  tag,
  summary: "Actualiza uma meta",
  params: idParamSchema,
  body: goalInputSchema,
  response: { schema: goalSchema },
});

documentPath({ method: "delete", path: "/goals/{id}", tag, summary: "Apaga uma meta e as contribuições", params: idParamSchema });

documentPath({
  method: "post",
  path: "/goals/{id}/contributions",
  tag,
  summary: "Regista uma contribuição (ou retirada, com valor negativo)",
  description: "Não pode deixar o valor guardado negativo. Devolve a meta actualizada.",
  params: idParamSchema,
  body: contributionInputSchema,
  response: { status: 201, schema: goalSchema },
});
