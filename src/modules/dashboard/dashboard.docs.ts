import { documentPath } from "../../shared/docs/registry";
import { dashboardQuerySchema, dashboardSummarySchema } from "./dashboard.schemas";

documentPath({
  method: "get",
  path: "/dashboard",
  tag: "Dashboard",
  summary: "Resumo do mês: património, fluxo, gastos por categoria e grupo 50/30/20",
  description: "Sem `month`, usa o mês corrente. Receitas e despesas do mês contam só as liquidadas.",
  query: dashboardQuerySchema,
  response: { schema: dashboardSummarySchema },
});
