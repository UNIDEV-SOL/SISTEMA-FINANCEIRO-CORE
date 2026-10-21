import type { YearMonth } from "../../shared/lib/dates";
import type { Money } from "../../shared/lib/money";

export interface ReportMonth {
  month: YearMonth;
  income: Money;
  expense: Money;
  net: Money;
  /** Contas + investimentos no último dia do mês (ou hoje, no mês corrente). */
  netWorth: Money;
  /** Meses futuros vêm a zeros e marcados, para a tabela ter sempre 12 linhas. */
  future: boolean;
  /** Meses anteriores ao primeiro registo. */
  empty: boolean;
}

export interface Totals {
  income: Money;
  expense: Money;
  net: Money;
}

export interface AnnualReport {
  year: number;
  months: ReportMonth[];
  /** Um valor por mês, de Janeiro a Dezembro. */
  expenseByCategory: { categoryId: string; months: Money[]; total: Money }[];
  totals: Totals;
  previousTotals: Totals;
  /** Anos com dados, do mais recente para o mais antigo. */
  availableYears: number[];
}
