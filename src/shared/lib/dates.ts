import { env } from "../../config/env";
import { clock } from "./clock";

/** Data de calendário "2026-10-20". */
export type IsoDate = string;
/** Mês de referência "2026-10". */
export type YearMonth = string;

/**
 * As colunas @db.Date chegam do Prisma como Date à meia-noite UTC.
 * Toda a aritmética de calendário é feita em UTC para não haver saltos de fuso.
 */
export const fromIsoDate = (iso: IsoDate): Date => new Date(`${iso}T00:00:00.000Z`);

export const toIsoDate = (date: Date): IsoDate => date.toISOString().slice(0, 10);

export const toIsoDateOrUndefined = (date: Date | null | undefined): IsoDate | undefined => (date ? toIsoDate(date) : undefined);

/** Hoje no fuso da aplicação (APP_TZ). */
export const todayIso = (now = clock.now()): IsoDate =>
  new Intl.DateTimeFormat("en-CA", { timeZone: env.APP_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);

export const currentYearMonth = (now = clock.now()): YearMonth => todayIso(now).slice(0, 7);

/** Ano de calendário corrente no fuso da aplicação. */
export const currentYear = (now = clock.now()): number => Number(todayIso(now).slice(0, 4));

export const yearOf = (iso: IsoDate): number => Number(iso.slice(0, 4));

export const monthOf = (iso: IsoDate): YearMonth => iso.slice(0, 7);

export function shiftMonth(month: YearMonth, delta: number): YearMonth {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

export function daysInYearMonth(month: YearMonth): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export const lastDayOf = (month: YearMonth): IsoDate => `${month}-${String(daysInYearMonth(month)).padStart(2, "0")}`;

/** Intervalo [início do mês, início do mês seguinte) para filtros `date`. */
export const monthRange = (month: YearMonth) => ({ gte: fromIsoDate(`${month}-01`), lt: fromIsoDate(`${shiftMonth(month, 1)}-01`) });

export function addDays(iso: IsoDate, days: number): IsoDate {
  const d = fromIsoDate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return toIsoDate(d);
}

export const daysBetween = (from: IsoDate, to: IsoDate): number =>
  Math.round((fromIsoDate(to).getTime() - fromIsoDate(from).getTime()) / 86_400_000);

/** Meses de calendário entre duas datas (ex.: 2026-10-31 → 2026-11-01 = 1). */
export function monthsBetween(from: IsoDate, to: IsoDate): number {
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  return (ty - fy) * 12 + (tm - fm);
}
