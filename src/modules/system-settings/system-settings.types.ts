import type { SettingType } from "../../generated/prisma";
import type { SettingConstraints } from "../../shared/settings/definitions";
import type { CurrencyResponse } from "../currencies/currencies.types";

export interface SettingOption {
  value: string;
  label: string;
}

export interface SystemSettingResponse {
  key: string;
  value: unknown;
  type: SettingType;
  group: string;
  label: string;
  description: string | null;
  options: SettingOption[] | null;
  constraints: SettingConstraints | null;
  public: boolean;
  order: number;
  updatedAt: string;
  updatedBy: { id: string; name: string } | null;
}

export interface SettingGroupResponse {
  group: string;
  label: string;
  items: SystemSettingResponse[];
}

export interface PublicConfig {
  settings: Record<string, unknown>;
  currencies: CurrencyResponse[];
  /** "ai" com ANTHROPIC_API_KEY no servidor; "offline" responde só a partir do manual e das FAQ. */
  assistant: { mode: "ai" | "offline" };
}
