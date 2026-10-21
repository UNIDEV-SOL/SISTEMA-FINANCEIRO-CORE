import { documentPath } from "../../shared/docs/registry";
import { budgetInputSchema, budgetOverviewSchema, budgetQuerySchema, categoryIdParamSchema } from "./budgets.schemas";

const tag = "Orçamentos";

documentPath({
  method: "get",
  path: "/budgets",
  tag,
  summary: "Orçamento do mês por categoria de despesa",
  description: "Inclui todas as categorias de despesa, com ou sem limite, ordenadas pela % usada.",
  query: budgetQuerySchema,
  response: { schema: budgetOverviewSchema },
});

documentPath({
  method: "put",
  path: "/budgets/{categoryId}",
  tag,
  summary: "Define o limite mensal de uma categoria",
  description: "O limite repete-se todos os meses até ser alterado.",
  params: categoryIdParamSchema,
  body: budgetInputSchema,
});

documentPath({ method: "delete", path: "/budgets/{categoryId}", tag, summary: "Remove o limite de uma categoria", params: categoryIdParamSchema });
