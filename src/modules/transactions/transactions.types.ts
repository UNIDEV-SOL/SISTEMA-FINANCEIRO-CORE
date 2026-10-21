import type { TransactionStatus, TransactionType } from "../../generated/prisma";
import type { IsoDate } from "../../shared/lib/dates";
import type { Page } from "../../shared/http/pagination";
import type { Money } from "../../shared/lib/money";

export interface TransactionResponse {
  id: string;
  type: TransactionType;
  description: string;
  /** Sempre positivo; o sentido vem do `type`. */
  amount: Money;
  date: IsoDate;
  accountId: string;
  destinationAccountId?: string;
  categoryId?: string;
  status: TransactionStatus;
  notes?: string;
  createdAt: string;
}

export interface TransactionTotals {
  income: Money;
  expense: Money;
  net: Money;
}

/** Página de transações com os totais de todo o filtro. */
export type TransactionList = Page<TransactionResponse> & { totals: TransactionTotals };
