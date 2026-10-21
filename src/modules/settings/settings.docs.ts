import { documentPath } from "../../shared/docs/registry";
import { exportSchema, settingsInputSchema } from "./settings.schemas";

const tag = "Definições";

documentPath({ method: "get", path: "/settings", tag, summary: "Nome, email e moeda do utilizador", response: { schema: settingsInputSchema } });

documentPath({
  method: "put",
  path: "/settings",
  tag,
  summary: "Actualiza nome, email e moeda",
  description: "O email é também o de início de sessão.",
  body: settingsInputSchema,
  response: { schema: settingsInputSchema },
});

documentPath({ method: "get", path: "/export", tag, summary: "Exporta todos os dados do utilizador em JSON", response: { schema: exportSchema } });

documentPath({
  method: "post",
  path: "/demo/reset",
  tag,
  summary: "Substitui os dados do utilizador por dados de exemplo",
  description: "Só disponível fora de produção. Apaga contas, transações, orçamentos, metas e investimentos do utilizador.",
});
