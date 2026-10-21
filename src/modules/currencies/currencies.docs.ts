import { documentPath } from "../../shared/docs/registry";
import { pageQuerySchema, pageSchema } from "../../shared/http/pagination";
import {
  adminCurrencySchema,
  CURRENCY_SORTS,
  currencyCodeParamSchema,
  currencyCreateSchema,
  currencyFiltersSchema,
  currencyUpdateSchema,
} from "./currencies.schemas";

const tag = "Administração — moedas";

documentPath({
  method: "get",
  path: "/admin/currencies",
  tag,
  summary: "Lista as moedas (paginado)",
  description: "Filtro `active`; `search` procura no código e no nome. Por omissão, pela ordem definida.",
  query: pageQuerySchema(CURRENCY_SORTS).extend(currencyFiltersSchema.shape),
  response: { schema: pageSchema(adminCurrencySchema, "AdminCurrencyPage") },
});

documentPath({
  method: "post",
  path: "/admin/currencies",
  tag,
  summary: "Cria uma moeda",
  description: "Sem `order`, fica no fim.",
  body: currencyCreateSchema,
  response: { status: 201, schema: adminCurrencySchema },
});

documentPath({
  method: "put",
  path: "/admin/currencies/{code}",
  tag,
  summary: "Actualiza uma moeda (o código não muda)",
  description: "409 ao desactivar a moeda por omissão.",
  params: currencyCodeParamSchema,
  body: currencyUpdateSchema,
  response: { schema: adminCurrencySchema },
});

documentPath({
  method: "delete",
  path: "/admin/currencies/{code}",
  tag,
  summary: "Apaga uma moeda",
  description: "409 se estiver em uso ou for a moeda por omissão: nesse caso desactive-a.",
  params: currencyCodeParamSchema,
});
