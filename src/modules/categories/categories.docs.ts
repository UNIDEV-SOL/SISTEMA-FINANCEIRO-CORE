import { documentPath } from "../../shared/docs/registry";
import { pageQuerySchema, pageSchema } from "../../shared/http/pagination";
import { idParamSchema } from "../../shared/http/schemas";
import { CATEGORY_SORTS, categoryFiltersSchema, categoryInputSchema, categorySchema } from "./categories.schemas";

const tag = "Categorias";

documentPath({
  method: "get",
  path: "/categories",
  tag,
  summary: "Lista as categorias (paginado)",
  description: "Filtro `kind`; `search` procura no nome. Por omissão, pela ordem de criação.",
  query: pageQuerySchema(CATEGORY_SORTS).extend(categoryFiltersSchema.shape),
  response: { schema: pageSchema(categorySchema, "CategoryPage") },
});

documentPath({
  method: "post",
  path: "/categories",
  tag,
  summary: "Cria uma categoria",
  description: "O grupo 50/30/20 só se aplica a despesas (por omissão WANTS).",
  body: categoryInputSchema,
  response: { status: 201, schema: categorySchema },
});

documentPath({
  method: "put",
  path: "/categories/{id}",
  tag,
  summary: "Actualiza uma categoria",
  description: "O tipo (receita/despesa) não pode ser alterado; o valor enviado é ignorado.",
  params: idParamSchema,
  body: categoryInputSchema,
  response: { schema: categorySchema },
});
