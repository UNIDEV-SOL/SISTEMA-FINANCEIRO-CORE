import type { IsoDate } from "../../shared/lib/dates";
import type { Money } from "../../shared/lib/money";

export type AlertSeverity = "info" | "warning" | "critical";

export type AlertKind = "BUDGET" | "BILL" | "LOW_BALANCE" | "GOAL" | "OVERSPENDING";

export interface Alert {
  /** Determinístico (ex.: budget:<categoria>:2026-10:over), para o estado "lido" sobreviver ao recálculo. */
  id: string;
  kind: AlertKind;
  severity: AlertSeverity;
  title: string;
  message: string;
  date: IsoDate;
  /** Página do front onde se resolve o assunto. */
  href: string;
  read: boolean;
}

export interface AlertList {
  items: Alert[];
  unread: number;
}

export interface AlertSettingsResponse {
  email: string;
  budgetThreshold: number;
  budgetAlerts: boolean;
  billAlerts: boolean;
  billDaysAhead: number;
  lowBalanceAlerts: boolean;
  lowBalanceAmount: Money;
  goalAlerts: boolean;
  weeklySummary: boolean;
  monthlyReport: boolean;
}
