import { documentPath } from "../../shared/docs/registry";
import { z } from "../../shared/http/schemas";
import { adminPeriodSchema, periodCreateSchema, periodListSchema, periodUpdateSchema, periodYearParamSchema } from "./periods.schemas";

const closedRule =
  "Criar, editar ou apagar registos com data num ano que não esteja aberto (ou sem período) devolve 409 " +
  '`"O ano 2025 está fechado: pode consultar, mas não alterar."`, com erro no campo da data quando ela vem no corpo. ' +
  "Aplica-se a transações (data actual e nova), contribuições de metas, avaliações e data de início de investimentos.";

documentPath({
  method: "get",
  path: "/periods",
  tag: "Períodos",
  summary: "Anos disponíveis (do mais recente para o mais antigo) e o ano corrente",
  description:
    "Para o selector de ano. Os anos fechados são só de consulta. " +
    closedRule +
    " Na passagem de ano, com `periods.autoCreate`, o novo ano é aberto automaticamente (e o anterior fechado com `periods.autoClosePrevious`).",
  response: { schema: periodListSchema },
});

const tag = "Administração — períodos";

documentPath({
  method: "get",
  path: "/admin/periods",
  tag,
  summary: "Lista os anos, com indicação de terem registos",
  response: { schema: z.array(adminPeriodSchema) },
});

documentPath({
  method: "post",
  path: "/admin/periods",
  tag,
  summary: "Cria um ano (aberto por omissão)",
  description: "422 no campo `year` se já existir. Útil para abrir o ano seguinte antes do tempo (ex.: contas de Janeiro registadas em Dezembro).",
  body: periodCreateSchema,
  response: { status: 201, schema: adminPeriodSchema },
});

documentPath({
  method: "patch",
  path: "/admin/periods/{year}",
  tag,
  summary: "Abre/fecha um ano ou marca-o como corrente",
  description:
    "Marcar um ano como corrente desmarca o anterior (há sempre exactamente um). " +
    "`isCurrent: false` no ano corrente → 422. Com `periods.autoCreate` ligado, um ano anterior ao do calendário não pode ser o corrente (409).",
  params: periodYearParamSchema,
  body: periodUpdateSchema,
  response: { schema: adminPeriodSchema },
});

documentPath({
  method: "delete",
  path: "/admin/periods/{year}",
  tag,
  summary: "Apaga um ano",
  description: "409 se for o corrente ou tiver registos (nesse caso, feche-o).",
  params: periodYearParamSchema,
});
