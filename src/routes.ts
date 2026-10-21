import { Router } from "express";
import { accessRoutes } from "./modules/access/access.routes";
import { accountsRoutes } from "./modules/accounts/accounts.routes";
import { adminUsersRoutes } from "./modules/admin-users/admin-users.routes";
import { assistantRoutes } from "./modules/assistant/assistant.routes";
import { alertsRoutes } from "./modules/alerts/alerts.routes";
import { auditRoutes } from "./modules/audit/audit.routes";
import { authRoutes } from "./modules/auth/auth.routes";
import { budgetsRoutes } from "./modules/budgets/budgets.routes";
import { categoriesRoutes } from "./modules/categories/categories.routes";
import { currenciesRoutes } from "./modules/currencies/currencies.routes";
import { dashboardRoutes } from "./modules/dashboard/dashboard.routes";
import { familyRoutes } from "./modules/family/family.routes";
import { functionalitiesRoutes } from "./modules/functionalities/functionalities.routes";
import { goalsRoutes } from "./modules/goals/goals.routes";
import { adminHelpRoutes, helpRoutes } from "./modules/help/help.routes";
import { investmentsRoutes } from "./modules/investments/investments.routes";
import { adminPeriodsRoutes, periodsRoutes } from "./modules/periods/periods.routes";
import { profilesRoutes } from "./modules/profiles/profiles.routes";
import { reportsRoutes } from "./modules/reports/reports.routes";
import { settingsRoutes } from "./modules/settings/settings.routes";
import { publicConfigRoutes, systemSettingsRoutes } from "./modules/system-settings/system-settings.routes";
import { transactionsRoutes } from "./modules/transactions/transactions.routes";
import { audit } from "./shared/middleware/audit";
import { authenticate } from "./shared/middleware/authenticate";
import { authorize } from "./shared/middleware/authorize";

export const routes = Router();

// Antes de tudo, para registar também logins e pedidos recusados
routes.use(audit);

routes.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

routes.use("/config", publicConfigRoutes);
routes.use("/auth", authRoutes);

// Daqui para baixo tudo exige sessão e permissão na funcionalidade da rota
routes.use(authenticate, authorize);
routes.use("/access", accessRoutes);
routes.use("/periods", periodsRoutes);
routes.use("/accounts", accountsRoutes);
routes.use("/categories", categoriesRoutes);
routes.use("/transactions", transactionsRoutes);
routes.use("/dashboard", dashboardRoutes);
routes.use("/budgets", budgetsRoutes);
routes.use("/goals", goalsRoutes);
routes.use("/investments", investmentsRoutes);
routes.use("/reports", reportsRoutes);
routes.use("/alerts", alertsRoutes);
routes.use("/family", familyRoutes);
routes.use("/help", helpRoutes);
routes.use("/assistant", assistantRoutes);
routes.use("/admin/users", adminUsersRoutes);
routes.use("/admin/profiles", profilesRoutes);
routes.use("/admin/functionalities", functionalitiesRoutes);
routes.use("/admin/settings", systemSettingsRoutes);
routes.use("/admin/currencies", currenciesRoutes);
routes.use("/admin/audit", auditRoutes);
routes.use("/admin/help", adminHelpRoutes);
routes.use("/admin/periods", adminPeriodsRoutes);
routes.use(settingsRoutes);
