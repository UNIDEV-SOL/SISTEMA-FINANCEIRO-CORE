import type { PeriodStatus } from "../../generated/prisma";

export interface PeriodResponse {
  year: number;
  status: PeriodStatus;
  isCurrent: boolean;
  createdAt: string;
  updatedAt: string;
  updatedBy: { id: string; name: string } | null;
}

export interface AdminPeriodResponse extends PeriodResponse {
  /** Há registos (transações, contribuições, avaliações, investimentos) com data neste ano. */
  hasData: boolean;
}

export interface PeriodList {
  items: PeriodResponse[];
  /** Ano corrente (o selecionado por omissão). */
  current: number;
}
