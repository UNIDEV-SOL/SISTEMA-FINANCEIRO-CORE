import type { Money } from "../../shared/lib/money";

export interface GrowthPlanTypeResponse {
  id: string;
  code: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  /** Rendimento anual de referência (%). */
  annualReturn: number;
  defaultMonths: number;
  /** Markdown. */
  tips: string;
  order: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Retrato financeiro usado nas propostas: médias mensais dos últimos meses e reservas actuais. */
export interface GrowthProfile {
  /** Meses com movimentos usados nas médias (0 = ainda sem dados). */
  months: number;
  /** LOOKBACK = meses completos anteriores; CURRENT_MONTH = só há dados do mês actual. */
  basis: "LOOKBACK" | "CURRENT_MONTH" | "NONE";
  avgIncome: Money;
  avgExpense: Money;
  avgSaving: Money;
  /** % da receita que fica (null sem receita). */
  savingsRate: number | null;
  avgWants: Money;
  wantsRate: number | null;
  topWants: { categoryId: string; name: string; avg: Money }[];
  /** Saldo em contas de poupança e investimento. */
  savings: Money;
  invested: Money;
  emergencyTarget: Money;
  /** Meses de despesa que a poupança cobre (null sem despesas). */
  emergencyCoverage: number | null;
  /** Parâmetros usados (para a front explicar as contas). */
  targets: { savingsRate: number; wantsMaxRate: number; emergencyMonths: number; comfortableShare: number };
}

export type ProposalTone = "danger" | "warning" | "info" | "success";

export interface GrowthProposal {
  code: "NO_DATA" | "NO_INCOME" | "OVERSPENDING" | "WANTS_HIGH" | "SAVINGS_RATE" | "EMERGENCY_FUND" | "EMERGENCY_OK" | "INVEST_SURPLUS";
  tone: ProposalTone;
  title: string;
  message: string;
  /** Valor principal da proposta (mensal ou total, conforme o texto). */
  amount?: Money;
  /** Tipo de plano a abrir no simulador. */
  planCode?: string;
  /** Ecrã da app onde agir. */
  link?: string;
}

export interface PlanProjection {
  /** Prestação confortável: parte da poupança média definida em growth.comfortableShare. */
  monthly: Money;
  months: number;
  amount: Money;
}

export interface GrowthOverview {
  profile: GrowthProfile;
  proposals: GrowthProposal[];
  plans: (GrowthPlanTypeResponse & { projection: PlanProjection | null })[];
}

export type FitStatus = "REACHED" | "COMFORTABLE" | "TIGHT" | "OUT_OF_REACH" | "NO_SAVINGS";

export interface GrowthSimulation {
  planCode: string | null;
  target: Money;
  initial: Money;
  annualReturn: number;
  /** Meses até ao alvo (null se não chegar em MAX_MONTHS). */
  months: number | null;
  monthly: Money;
  /** Mês em que o alvo é atingido (AAAA-MM). */
  reachedIn: string | null;
  totalContributed: Money;
  interest: Money;
  finalAmount: Money;
  schedule: { month: string; balance: Money; contributed: Money }[];
  fit: {
    status: FitStatus;
    avgSaving: Money;
    /** % da poupança média que a prestação usa (null sem poupança). */
    share: number | null;
    /** Meses necessários com a prestação confortável (null sem poupança ou se não chegar). */
    comfortableMonths: number | null;
    comfortableMonthly: Money;
  };
}
