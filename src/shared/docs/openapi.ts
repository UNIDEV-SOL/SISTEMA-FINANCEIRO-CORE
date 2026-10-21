import { OpenApiGeneratorV3 } from "@asteasolutions/zod-to-openapi";
import "../../modules/auth/auth.docs";
import "../../modules/accounts/accounts.docs";
import "../../modules/categories/categories.docs";
import "../../modules/transactions/transactions.docs";
import "../../modules/dashboard/dashboard.docs";
import "../../modules/budgets/budgets.docs";
import "../../modules/goals/goals.docs";
import "../../modules/investments/investments.docs";
import "../../modules/reports/reports.docs";
import "../../modules/alerts/alerts.docs";
import "../../modules/settings/settings.docs";
import "../../modules/access/access.docs";
import "../../modules/family/family.docs";
import "../../modules/system-settings/system-settings.docs";
import "../../modules/admin-users/admin-users.docs";
import "../../modules/profiles/profiles.docs";
import "../../modules/functionalities/functionalities.docs";
import "../../modules/currencies/currencies.docs";
import "../../modules/audit/audit.docs";
import "../../modules/help/help.docs";
import "../../modules/assistant/assistant.docs";
import "../../modules/periods/periods.docs";
import { registry } from "./registry";

export const openApiDocument = new OpenApiGeneratorV3(registry.definitions).generateDocument({
  openapi: "3.0.0",
  info: {
    title: "Sistema Financeiro API",
    version: "1.0.0",
    description:
      "API do sistema financeiro pessoal. Valores monetários são strings decimais (\"1250.00\"); datas são \"AAAA-MM-DD\" e meses \"AAAA-MM\". " +
      "Os erros seguem application/problem+json, com `errors[]` por campo nos 422. " +
      "As listas são paginadas (`page` a começar em 0, `size`, `sort=campo,asc|desc`, `search`) e devolvem `{ content, page, size, totalItems, totalPages, hasNext, hasPrevious }`. " +
      "Cada rota pertence a uma funcionalidade do menu; sem permissão no perfil, a resposta é 403. " +
      "Com `X-Acting-As: <id>` um responsável age pelas contas de um dependente (ver /family).",
  },
  servers: [{ url: "/api/v1" }],
});
