import { documentPath } from "../../shared/docs/registry";
import { pageQuerySchema, pageSchema } from "../../shared/http/pagination";
import { idParamSchema } from "../../shared/http/schemas";
import { ACCOUNT_SORTS, accountFiltersSchema, accountInputSchema, accountSchema } from "./accounts.schemas";

const tag = "Contas";

documentPath({
  method: "get",
  path: "/accounts",
  tag,
  summary: "Lista as contas com o saldo actual (paginado)",
  description: "Por omissão só as activas; `archived=true` lista as arquivadas. `search` procura no nome e na instituição. Por omissão, pela ordem de criação.",
  query: pageQuerySchema(ACCOUNT_SORTS).extend(accountFiltersSchema.shape),
  response: { schema: pageSchema(accountSchema, "AccountPage") },
});

documentPath({
  method: "post",
  path: "/accounts",
  tag,
  summary: "Cria uma conta",
  body: accountInputSchema,
  response: { status: 201, schema: accountSchema },
});

documentPath({
  method: "put",
  path: "/accounts/{id}",
  tag,
  summary: "Actualiza uma conta",
  params: idParamSchema,
  body: accountInputSchema,
  response: { schema: accountSchema },
});

documentPath({
  method: "delete",
  path: "/accounts/{id}",
  tag,
  summary: "Arquiva uma conta",
  description: "A conta deixa de aparecer, mas as transações antigas continuam associadas a ela. Pode ser restaurada.",
  params: idParamSchema,
});

documentPath({
  method: "post",
  path: "/accounts/{id}/restore",
  tag,
  summary: "Desarquiva uma conta",
  description: "A conta volta às listas e aos totais, com o saldo e as transações de sempre. Exige a acção EDIT.",
  params: idParamSchema,
  response: { schema: accountSchema },
});
