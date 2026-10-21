import { documentPath } from "../../shared/docs/registry";
import { forecastQuerySchema, forecastSchema } from "./forecast.schemas";

documentPath({
  method: "get",
  path: "/forecast",
  tag: "Previsão",
  summary: "Previsão dos próximos meses: o que entra, o que sai, quanto guardar e quanto sobra",
  description:
    "Junta as recorrentes por gerar, as transações previstas e a média do dia-a-dia (meses completos, sem o que é recorrente). " +
    "A poupança das metas adapta-se: num mês apertado guarda-se menos e a diferença passa para os meses com folga, até ao prazo. " +
    "`notes` explica cada mês. Com `scenarioAmount`, simula uma receita ou despesa mensal nova. Parâmetros no grupo `forecast`.",
  query: forecastQuerySchema,
  response: { schema: forecastSchema },
});
