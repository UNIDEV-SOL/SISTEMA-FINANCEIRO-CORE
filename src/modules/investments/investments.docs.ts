import { documentPath } from "../../shared/docs/registry";
import { pageQuerySchema, pageSchema } from "../../shared/http/pagination";
import { idParamSchema } from "../../shared/http/schemas";
import { INVESTMENT_SORTS, investmentFiltersSchema, investmentInputSchema, investmentSchema, valuationInputSchema } from "./investments.schemas";

const tag = "Investimentos";

documentPath({
  method: "get",
  path: "/investments",
  tag,
  summary: "Lista os investimentos com o histórico de avaliações (paginado)",
  description: "Filtro `type`; `search` procura no nome e na instituição. Por omissão, pela data de início.",
  query: pageQuerySchema(INVESTMENT_SORTS).extend(investmentFiltersSchema.shape),
  response: { schema: pageSchema(investmentSchema, "InvestmentPage") },
});

documentPath({
  method: "post",
  path: "/investments",
  tag,
  summary: "Regista um investimento",
  description: "Cria uma avaliação inicial igual ao capital aplicado, na data de início.",
  body: investmentInputSchema,
  response: { status: 201, schema: investmentSchema },
});

documentPath({
  method: "put",
  path: "/investments/{id}",
  tag,
  summary: "Actualiza um investimento",
  params: idParamSchema,
  body: investmentInputSchema,
  response: { schema: investmentSchema },
});

documentPath({ method: "delete", path: "/investments/{id}", tag, summary: "Apaga um investimento", params: idParamSchema });

documentPath({
  method: "post",
  path: "/investments/{id}/valuations",
  tag,
  summary: "Regista uma avaliação",
  description: "Uma por dia: a nova substitui a do mesmo dia. A data tem de estar entre o início e hoje.",
  params: idParamSchema,
  body: valuationInputSchema,
  response: { status: 201, schema: investmentSchema },
});
