import { documentPath } from "../../shared/docs/registry";
import { pageQuerySchema } from "../../shared/http/pagination";
import { idParamSchema } from "../../shared/http/schemas";
import { RECURRING_SORTS, recurringFiltersSchema, recurringInputSchema, recurringListSchema, recurringSchema } from "./recurring.schemas";

const tag = "Recorrentes";

documentPath({
  method: "get",
  path: "/recurring",
  tag,
  summary: "Lista as transações recorrentes (paginado), com os compromissos mensais",
  description:
    "Antes de responder, gera as ocorrências em falta (até `recurring.daysAhead` dias à frente). `search` procura na descrição e nas notas. " +
    "Por omissão: activas primeiro, pela próxima data. `totals` soma o equivalente mensal das receitas e despesas activas.",
  query: pageQuerySchema(RECURRING_SORTS).extend(recurringFiltersSchema.shape),
  response: { schema: recurringListSchema },
});

documentPath({
  method: "post",
  path: "/recurring",
  tag,
  summary: "Cria uma transação recorrente",
  description:
    "Mesmas regras de contas e categorias das transações. Com `startDate` no passado, gera logo as ocorrências em falta nos anos abertos. " +
    "Com `autoConfirm`, cada ocorrência fica liquidada no dia; senão fica prevista até ser confirmada.",
  body: recurringInputSchema,
  response: { status: 201, schema: recurringSchema },
});

documentPath({ method: "get", path: "/recurring/{id}", tag, summary: "Uma transação recorrente", params: idParamSchema, response: { schema: recurringSchema } });

documentPath({
  method: "put",
  path: "/recurring/{id}",
  tag,
  summary: "Actualiza uma transação recorrente",
  description: "Vale daqui para a frente: as ocorrências futuras ainda previstas são refeitas; as passadas ficam como estão.",
  params: idParamSchema,
  body: recurringInputSchema,
  response: { schema: recurringSchema },
});

documentPath({
  method: "delete",
  path: "/recurring/{id}",
  tag,
  summary: "Apaga uma transação recorrente",
  description: "Apaga também as ocorrências futuras ainda previstas; as outras transações ficam, sem ligação.",
  params: idParamSchema,
});

documentPath({
  method: "post",
  path: "/recurring/{id}/skip",
  tag,
  summary: "Salta a próxima ocorrência",
  description: "Apaga a próxima ocorrência prevista ou, se ainda não foi gerada, passa à seguinte. Exige a acção EDIT.",
  params: idParamSchema,
  response: { schema: recurringSchema },
});
