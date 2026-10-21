import type { InvestmentType } from "../../generated/prisma";
import type { IsoDate } from "../../shared/lib/dates";
import type { Money } from "../../shared/lib/money";

export interface ValuationResponse {
  date: IsoDate;
  value: Money;
}

export interface InvestmentResponse {
  id: string;
  name: string;
  type: InvestmentType;
  institution?: string;
  /** Capital aplicado. */
  invested: Money;
  /** Última avaliação conhecida. */
  currentValue: Money;
  /** Taxa anual contratada, em % (ex.: "9.5"). */
  annualRate?: string;
  startDate: IsoDate;
  maturityDate?: IsoDate;
  /** Mais antiga primeiro. */
  valuations: ValuationResponse[];
}
