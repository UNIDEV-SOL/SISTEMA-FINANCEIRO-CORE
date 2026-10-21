import type { AccountType } from "../../generated/prisma";
import type { Money } from "../../shared/lib/money";

export interface AccountResponse {
  id: string;
  name: string;
  type: AccountType;
  institution?: string;
  color: string;
  initialBalance: Money;
  /** Saldo actual, a partir das transações liquidadas. */
  balance: Money;
  includeInTotal: boolean;
  archived: boolean;
}
