import { documentPath } from "../../shared/docs/registry";
import { z } from "../../shared/http/schemas";
import { publicConfigSchema, settingGroupSchema, settingKeyParamSchema, settingUpdateSchema, systemSettingSchema } from "./system-settings.schemas";

documentPath({
  method: "get",
  path: "/config/public",
  tag: "Configuração",
  public: true,
  summary: "Parâmetros públicos e moedas activas",
  description: "Sem sessão. `settings` é um mapa chave → valor só com os parâmetros marcados como públicos.",
  response: { schema: publicConfigSchema },
});

const tag = "Administração — parâmetros";

documentPath({
  method: "get",
  path: "/admin/settings",
  tag,
  summary: "Todos os parâmetros do sistema, agrupados",
  description: "As opções dos SELECT dinâmicos (moedas, perfis) já vêm calculadas.",
  response: { schema: z.array(settingGroupSchema) },
});

documentPath({
  method: "put",
  path: "/admin/settings/{key}",
  tag,
  summary: "Altera o valor de um parâmetro",
  description: "Validado pelo `type`, `options` e `constraints`; os erros vêm no campo `value`. Tem efeito imediato.",
  params: settingKeyParamSchema,
  body: settingUpdateSchema,
  response: { schema: systemSettingSchema },
});
