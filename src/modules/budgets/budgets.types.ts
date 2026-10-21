import type { YearMonth } from "../../shared/lib/dates";
import type { Money } from "../../shared/lib/money";

export interface BudgetLine {
  categoryId: string;
  /** Sem limite definido, a categoria aparece só com o gasto e a sugestão. */
  limit?: Money;
  /** Despesas liquidadas no mês. */
  spent: Money;
  /** Despesas previstas no mês, ainda por pagar. */
  pending: Money;
  /** Média dos últimos 3 meses completos, arredondada para cima aos 50. */
  suggested: Money;
}

export interface BudgetOverview {
  month: YearMonth;
  lines: BudgetLine[];
  totalLimit: Money;
  /** Gasto nas categorias com orçamento. */
  totalSpent: Money;
  /** Dias que faltam até ao fim do mês (0 em meses passados). */
  daysLeft: number;
}
