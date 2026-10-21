import { documentPath } from "../../shared/docs/registry";
import { idParamSchema } from "../../shared/http/schemas";
import { pageQuerySchema } from "../../shared/http/pagination";
import { TRANSACTION_SORTS, transactionFiltersSchema, transactionInputSchema, transactionListSchema, transactionSchema } from "./transactions.schemas";

const tag = "Transações";

documentPath({
  method: "get",
  path: "/transactions",
  tag,
  summary: "Lista as transações de um mês (paginado), com totais",
  description:
    "Sem `month`, usa o mês corrente. `accountId` encontra também as transferências que entram na conta. " +
    "`search` (ou `q`) procura na descrição e nas notas. Por omissão, as mais recentes primeiro. `totals` cobre todo o filtro, não só a página.",
  query: pageQuerySchema(TRANSACTION_SORTS).extend(transactionFiltersSchema.shape),
  response: { schema: transactionListSchema },
});

documentPath({
  method: "post",
  path: "/transactions",
  tag,
  summary: "Regista uma transação",
  description: "Transferências exigem `destinationAccountId`; receitas e despesas exigem `categoryId` do mesmo tipo. Pendentes não mexem no saldo.",
  body: transactionInputSchema,
  response: { status: 201, schema: transactionSchema },
});

documentPath({
  method: "put",
  path: "/transactions/{id}",
  tag,
  summary: "Actualiza uma transação",
  params: idParamSchema,
  body: transactionInputSchema,
  response: { schema: transactionSchema },
});

documentPath({ method: "delete", path: "/transactions/{id}", tag, summary: "Apaga uma transação", params: idParamSchema });
