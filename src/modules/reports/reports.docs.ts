import { documentPath } from "../../shared/docs/registry";
import { annualQuerySchema, annualReportSchema } from "./reports.schemas";

documentPath({
  method: "get",
  path: "/reports/annual",
  tag: "Relatórios",
  summary: "Relatório anual: 12 meses, despesas por categoria e comparação com o ano anterior",
  description: "Sem `year`, usa o ano corrente. Só conta transações liquidadas.",
  query: annualQuerySchema,
  response: { schema: annualReportSchema },
});
