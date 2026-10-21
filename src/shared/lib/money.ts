import { Prisma } from "../../generated/prisma";

export const Decimal = Prisma.Decimal;
export type Decimal = Prisma.Decimal;

/** Valor monetário em JSON: string com duas casas ("1250.00"), nunca float. */
export type Money = string;

export const ZERO = new Decimal(0);

export const toMoney = (value: Prisma.Decimal.Value): Money => new Decimal(value).toFixed(2);

export const toMoneyOrUndefined = (value: Prisma.Decimal.Value | null | undefined): Money | undefined =>
  value === null || value === undefined ? undefined : toMoney(value);

export const sum = (values: Prisma.Decimal.Value[]): Decimal => values.reduce<Decimal>((acc, v) => acc.add(v), ZERO);

/** Percentagem de `part` em `total` (0–∞), ou null se o total for zero. */
export function ratio(part: Prisma.Decimal.Value, total: Prisma.Decimal.Value): number | null {
  const t = new Decimal(total);
  return t.isZero() ? null : new Decimal(part).div(t).mul(100).toNumber();
}
