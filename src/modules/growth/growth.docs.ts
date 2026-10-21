import { documentPath } from "../../shared/docs/registry";
import { pageQuerySchema, pageSchema } from "../../shared/http/pagination";
import {
  overviewSchema,
  PLAN_SORTS,
  planCreateSchema,
  planFiltersSchema,
  planIdParamSchema,
  planTypeSchema,
  planUpdateSchema,
  simulateQuerySchema,
  simulationSchema,
} from "./growth.schemas";

const tag = "Crescer";

documentPath({
  method: "get",
  path: "/growth/overview",
  tag,
  summary: "Retrato financeiro, propostas e planos com projecção",
  description:
    "Médias dos últimos `growth.lookbackMonths` meses completos com movimentos (ou do mês actual, se ainda não houver). " +
    "As propostas e as projecções usam os parâmetros do grupo `growth`. Respeita o X-Acting-As.",
  response: { schema: overviewSchema },
});

documentPath({
  method: "get",
  path: "/growth/simulate",
  tag,
  summary: "Simula um plano: prestação para um prazo, ou prazo para uma prestação",
  description: "Com `months`, calcula a prestação; com `monthly`, os meses. Sem nenhum, usa o prazo sugerido do plano. `fit` compara com a poupança média.",
  query: simulateQuerySchema,
  response: { schema: simulationSchema },
});

const adminTag = "Administração — planos de crescimento";

documentPath({
  method: "get",
  path: "/admin/growth-plans",
  tag: adminTag,
  summary: "Lista os tipos de plano (paginado)",
  description: "Filtro `active`; `search` procura no código e no nome.",
  query: pageQuerySchema(PLAN_SORTS).extend(planFiltersSchema.shape),
  response: { schema: pageSchema(planTypeSchema, "GrowthPlanTypePage") },
});

documentPath({ method: "post", path: "/admin/growth-plans", tag: adminTag, summary: "Cria um tipo de plano", body: planCreateSchema, response: { status: 201, schema: planTypeSchema } });

documentPath({
  method: "put",
  path: "/admin/growth-plans/{id}",
  tag: adminTag,
  summary: "Actualiza um tipo de plano (o código não muda)",
  params: planIdParamSchema,
  body: planUpdateSchema,
  response: { schema: planTypeSchema },
});

documentPath({ method: "delete", path: "/admin/growth-plans/{id}", tag: adminTag, summary: "Apaga um tipo de plano", params: planIdParamSchema });
