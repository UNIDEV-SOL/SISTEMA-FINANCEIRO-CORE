import { format } from "date-fns";
import { pt } from "date-fns/locale";
import type { Prisma } from "../../generated/prisma";
import { fromIsoDate, type IsoDate, type YearMonth } from "./dates";
import { Decimal } from "./money";

/** Mesmas regras de formatação do front, para os textos dos alertas e emails. */

/** "1250.00" → "1.250,00 MT". O símbolo vem da tabela de moedas. */
export function formatMoney(value: Prisma.Decimal.Value, symbol: string): string {
  const str = new Decimal(value).toFixed(2);
  const negative = str.startsWith("-");
  const [int, frac] = str.replace(/^-/, "").split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${negative ? "−" : ""}${grouped},${frac} ${symbol}`;
}

export const formatPercent = (value: number, digits = 0) => `${value.toFixed(digits).replace(".", ",")}%`;

// As datas @db.Date estão à meia-noite UTC; formatar em UTC evita mudar de dia
const utc = (iso: IsoDate) => {
  const d = fromIsoDate(iso);
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
};

export const formatDayMonth = (iso: IsoDate) => format(utc(iso), "d 'de' MMM", { locale: pt });

export const formatDate = (iso: IsoDate) => format(utc(iso), "d 'de' MMM yyyy", { locale: pt });

export const formatMonth = (month: YearMonth) => format(utc(`${month}-01`), "MMMM yyyy", { locale: pt });
