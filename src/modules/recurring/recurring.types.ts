import type { RecurrenceFrequency, TransactionType } from "../../generated/prisma";
import type { Page } from "../../shared/http/pagination";
import type { IsoDate } from "../../shared/lib/dates";
import type { Money } from "../../shared/lib/money";

export interface RecurringResponse {
  id: string;
  type: TransactionType;
  description: string;
  amount: Money;
  accountId: string;
  destinationAccountId?: string;
  categoryId?: string;
  notes?: string;
  frequency: RecurrenceFrequency;
  interval: number;
  startDate: IsoDate;
  endDate?: IsoDate;
  /** Próxima ocorrência por gerar; null quando acabou. */
  nextDate: IsoDate | null;
  autoConfirm: boolean;
  /** Prestação ou compromisso obrigatório (crédito, financiamento). */
  commitment: boolean;
  active: boolean;
  /** Valor equivalente por mês. */
  monthlyAmount: Money;
  /** Transações geradas que ainda existem. */
  occurrences: number;
  createdAt: string;
  updatedAt: string;
}

export interface RecurringTotals {
  monthlyIncome: Money;
  monthlyExpense: Money;
}

export type RecurringList = Page<RecurringResponse> & { totals: RecurringTotals };
