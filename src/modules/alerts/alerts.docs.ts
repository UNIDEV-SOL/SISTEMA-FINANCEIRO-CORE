import { documentPath } from "../../shared/docs/registry";
import { alertIdParamSchema, alertListSchema, alertSettingsInputSchema, alertSettingsSchema } from "./alerts.schemas";

const tag = "Alertas";

documentPath({
  method: "get",
  path: "/alerts",
  tag,
  summary: "Alertas actuais",
  description: "Recalculados a cada pedido a partir dos dados (orçamentos, contas a pagar, saldo baixo, metas, gastos acima das receitas).",
  response: { schema: alertListSchema },
});

documentPath({ method: "post", path: "/alerts/read-all", tag, summary: "Marca todos os alertas actuais como lidos" });

documentPath({ method: "post", path: "/alerts/{id}/read", tag, summary: "Marca um alerta como lido", params: alertIdParamSchema });

documentPath({ method: "get", path: "/alerts/settings", tag, summary: "Definições dos alertas e emails", response: { schema: alertSettingsSchema } });

documentPath({
  method: "put",
  path: "/alerts/settings",
  tag,
  summary: "Actualiza as definições dos alertas e emails",
  body: alertSettingsInputSchema,
  response: { schema: alertSettingsSchema },
});
