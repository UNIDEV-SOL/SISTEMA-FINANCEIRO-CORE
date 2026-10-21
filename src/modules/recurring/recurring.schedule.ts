import type { Prisma, RecurrenceFrequency } from "../../generated/prisma";
import { addDays, daysInYearMonth, type IsoDate, shiftMonth } from "../../shared/lib/dates";
import { Decimal } from "../../shared/lib/money";

export interface Schedule {
  frequency: RecurrenceFrequency;
  interval: number;
  startDate: IsoDate;
  endDate?: IsoDate | null;
}

/**
 * Data da ocorrência `n` (0 = a primeira). Calcula-se sempre a partir do início: uma recorrente no dia 31
 * cai a 28/29 de Fevereiro e volta a 31 em Março, em vez de ficar presa no dia 28.
 */
export function occurrenceDate(s: Schedule, n: number): IsoDate {
  if (s.frequency === "WEEKLY") return addDays(s.startDate, 7 * s.interval * n);
  const months = (s.frequency === "YEARLY" ? 12 : 1) * s.interval * n;
  const month = shiftMonth(s.startDate.slice(0, 7), months);
  const day = Math.min(Number(s.startDate.slice(8, 10)), daysInYearMonth(month));
  return `${month}-${String(day).padStart(2, "0")}`;
}

/** Data da ocorrência `n`, ou null se já passou do fim. */
export function occurrenceOrEnd(s: Schedule, n: number): IsoDate | null {
  const date = occurrenceDate(s, n);
  return s.endDate && date > s.endDate ? null : date;
}

/** Primeiro índice com data depois de `after` (ou a partir do início, se `after` for anterior). */
export function firstIndexAfter(s: Schedule, after: IsoDate): number {
  if (after < s.startDate) return 0;
  // Estimativa pelo calendário e acerto fino (fins de mês)
  const step = s.frequency === "WEEKLY" ? 7 * s.interval : (s.frequency === "YEARLY" ? 365 : 30) * s.interval;
  let n = Math.max(0, Math.floor((Date.parse(after) - Date.parse(s.startDate)) / 86_400_000 / step) - 1);
  while (occurrenceDate(s, n) <= after) n++;
  while (n > 0 && occurrenceDate(s, n - 1) > after) n--;
  return n;
}

/** Valor equivalente por mês: semanal × 52 / 12, anual / 12, sempre dividido pelo intervalo. */
export function monthlyEquivalent(amount: Prisma.Decimal.Value, frequency: RecurrenceFrequency, interval: number): Decimal {
  const value = new Decimal(amount);
  const perMonth = frequency === "WEEKLY" ? value.mul(52).div(12) : frequency === "YEARLY" ? value.div(12) : value;
  return perMonth.div(interval).toDecimalPlaces(2);
}
