import type { BudgetGroup } from "../../generated/prisma";
import type { YearMonth } from "../../shared/lib/dates";
import type { Money } from "../../shared/lib/money";
import type { TransactionResponse } from "../transactions/transactions.types";

export interface DashboardSummary {
  month: YearMonth;
  /** Saldos das contas incluídas no total mais o valor actual dos investimentos. */
  netWorth: Money;
  invested: Money;
  /** Saldo das contas de poupança e investimento. */
  savings: Money;
  income: Money;
  expense: Money;
  previousIncome: Money;
  previousExpense: Money;
  /** Despesas previstas e ainda não pagas neste mês. */
  pendingExpense: Money;
  byCategory: { categoryId: string; amount: Money; budget?: Money }[];
  byGroup: { group: BudgetGroup; amount: Money }[];
  cashflow: { month: YearMonth; income: Money; expense: Money }[];
  /** Despesa acumulada por dia, no mês escolhido e no anterior. */
  daily: { day: number; current: Money | null; previous: Money }[];
  recent: TransactionResponse[];
  upcoming: TransactionResponse[];
}
