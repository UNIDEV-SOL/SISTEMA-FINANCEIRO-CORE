import { documentPath } from "../../shared/docs/registry";
import { idParamSchema, z } from "../../shared/http/schemas";
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

documentPath({
  method: "get",
  path: "/dashboard/advisor",
  tag: "Dashboard",
  summary: "O conselheiro: um resumo em linguagem simples das finanças",
  description:
    "Diz se o património está a crescer (parâmetro `advisor.trendMonths`), como vai o ritmo de gastos do mês (`advisor.fastPaceRate`), " +
    "o que vem nos próximos meses (Previsão), como estão as metas e a proposta mais urgente do Crescer. Só regras sobre os dados, sem IA.",
  response: {
    schema: z
      .object({
        generatedAt: z.string(),
        mood: z.enum(["GROWING", "STABLE", "SHRINKING", "NO_DATA"]),
        headline: z.string(),
        items: z.array(
          z.object({
            code: z.enum(["PAYDAY", "GROWTH", "PACE", "FORECAST", "GOALS", "HABITS"]),
            tone: z.enum(["success", "info", "warning", "danger"]),
            title: z.string(),
            text: z.string(),
            link: z.string().optional(),
            linkLabel: z.string().optional(),
          }),
        ),
      })
      .openapi("AdvisorBriefing"),
  },
});

documentPath({
  method: "get",
  path: "/dashboard/payday/{id}",
  tag: "Dashboard",
  summary: "Plano do salário: como distribuir uma receita até à próxima",
  description:
    "Contas a pagar até ao próximo salário (já pagas, previstas e recorrentes por gerar; prestações primeiro), poupança para as metas " +
    "(o plano do mês, sem passar o que o salário deixa), dia-a-dia (média) e o que fica livre. Só propõe, não grava nada. " +
    "`isPayday` diz se a receita conta como salário (`advisor.paydayShare`).",
  params: idParamSchema,
  response: { schema: z.object({}).passthrough().openapi("PaydayPlan") },
});

documentPath({
  method: "get",
  path: "/dashboard/payday",
  tag: "Dashboard",
  summary: "O plano do salário mais recente (últimos `advisor.paydayDays` dias), ou null",
  response: { schema: z.object({}).passthrough().nullable() },
});
