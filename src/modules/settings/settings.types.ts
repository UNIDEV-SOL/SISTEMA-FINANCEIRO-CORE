import type { AccountResponse } from "../accounts/accounts.types";
import type { CategoryResponse } from "../categories/categories.types";
import type { GoalResponse } from "../goals/goals.types";
import type { InvestmentResponse } from "../investments/investments.types";
import type { TransactionResponse } from "../transactions/transactions.types";

/** O email é também o de início de sessão. */
export interface SettingsResponse {
  name: string;
  email: string;
  /** Código da moeda, ex.: "MZN". */
  currency: string;
}

export interface ExportResponse {
  exportedAt: string;
  settings: SettingsResponse;
  accounts: AccountResponse[];
  categories: CategoryResponse[];
  transactions: TransactionResponse[];
  budgets: { categoryId: string; limit: string }[];
  goals: GoalResponse[];
  investments: InvestmentResponse[];
}
