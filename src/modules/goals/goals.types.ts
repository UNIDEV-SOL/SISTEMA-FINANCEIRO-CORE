import type { IsoDate } from "../../shared/lib/dates";
import type { Money } from "../../shared/lib/money";

export interface GoalContributionResponse {
  id: string;
  /** Negativo quando se retira dinheiro da meta. */
  amount: Money;
  date: IsoDate;
  note?: string;
  createdAt: string;
}

export interface GoalResponse {
  id: string;
  name: string;
  icon: string;
  color: string;
  target: Money;
  /** Soma das contribuições. */
  saved: Money;
  deadline?: IsoDate;
  accountId?: string;
  /** Quanto falta guardar por mês até ao prazo; ausente sem prazo ou já cumprida. */
  monthlyNeeded?: Money;
  contributions: GoalContributionResponse[];
  createdAt: string;
}
