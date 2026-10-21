import type { Prisma, SystemSetting } from "../../generated/prisma";
import { env } from "../../config/env";
import { prisma } from "../../shared/db/prisma";
import { NotFoundException, ValidationException } from "../../shared/errors/http-exceptions";
import { appSettings } from "../../shared/settings/app-settings";
import { SETTING_GROUPS, type SettingConstraints } from "../../shared/settings/definitions";
import { currenciesService } from "../currencies/currencies.service";
import type { PublicConfig, SettingGroupResponse, SettingOption, SystemSettingResponse } from "./system-settings.types";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DEFAULT_MAX_LENGTH = { STRING: 200, TEXT: 5000 } as const;
const FAQ_QUESTION_MAX = 200;
const FAQ_ANSWER_MAX = 1000;

function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** JSON: aceita o valor já estruturado ou em texto; valida a forma indicada em `constraints.shape`. */
function normalizeJson(raw: unknown, rules: SettingConstraints, fail: (message: string) => never): unknown {
  let value = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return fail("JSON inválido.");
    }
  }
  if (value === undefined || value === null) return fail("Indique um valor.");
  if (rules.shape !== "faq") return value;

  if (!Array.isArray(value)) return fail("Indique uma lista de perguntas e respostas.");
  if (rules.minItems !== undefined && value.length < rules.minItems) fail(`Indique pelo menos ${rules.minItems} pergunta(s).`);
  if (rules.maxItems !== undefined && value.length > rules.maxItems) fail(`Máximo de ${rules.maxItems} perguntas.`);
  return value.map((item, i) => {
    const n = i + 1;
    const question = typeof item?.question === "string" ? item.question.trim() : "";
    const answer = typeof item?.answer === "string" ? item.answer.trim() : "";
    if (!question || !answer) fail(`A pergunta ${n} precisa de pergunta e resposta.`);
    if (question.length > FAQ_QUESTION_MAX) fail(`A pergunta ${n} tem mais de ${FAQ_QUESTION_MAX} caracteres.`);
    if (answer.length > FAQ_ANSWER_MAX) fail(`A resposta ${n} tem mais de ${FAQ_ANSWER_MAX} caracteres.`);
    return { question, answer };
  });
}

const constraintsOf = (s: SystemSetting) => (s.constraints ?? null) as SettingConstraints | null;

/** Opções de um SELECT: as fixas ou as calculadas (moedas activas, perfis sem super administração). */
async function optionsOf(s: SystemSetting): Promise<SettingOption[] | null> {
  if (s.type !== "SELECT") return null;
  switch (constraintsOf(s)?.source) {
    case "currencies":
      return (await currenciesService.active()).map((c) => ({ value: c.code, label: `${c.code} — ${c.name}` }));
    case "profiles":
      return (await prisma.profile.findMany({ where: { superAdmin: false }, orderBy: { name: "asc" } })).map((p) => ({ value: p.code, label: p.name }));
    default:
      return (s.options as SettingOption[] | null) ?? [];
  }
}

async function toResponse(s: SystemSetting, names: Map<string, string>): Promise<SystemSettingResponse> {
  return {
    key: s.key,
    value: s.value,
    type: s.type,
    group: s.group,
    label: s.label,
    description: s.description,
    options: await optionsOf(s),
    constraints: constraintsOf(s),
    public: s.public,
    order: s.order,
    updatedAt: s.updatedAt.toISOString(),
    updatedBy: s.updatedById ? { id: s.updatedById, name: names.get(s.updatedById) ?? "Utilizador removido" } : null,
  };
}

async function namesOf(settings: SystemSetting[]) {
  const ids = [...new Set(settings.map((s) => s.updatedById).filter((id): id is string => !!id))];
  const users = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : [];
  return new Map(users.map((u) => [u.id, u.name]));
}

/** Valida e normaliza o valor pelo tipo e regras do parâmetro; lança 422 no campo `value`. */
async function normalize(setting: SystemSetting, raw: unknown): Promise<unknown> {
  const fail = (message: string): never => {
    throw ValidationException.field("value", message);
  };
  const rules = constraintsOf(setting) ?? {};

  switch (setting.type) {
    case "BOOLEAN":
      if (typeof raw !== "boolean") fail("Indique sim ou não.");
      return raw;

    case "NUMBER": {
      const value = typeof raw === "string" && raw.trim() !== "" ? Number(raw.replace(",", ".")) : raw;
      if (typeof value !== "number" || !Number.isFinite(value)) return fail("Indique um número.");
      if (rules.integer && !Number.isInteger(value)) fail("Indique um número inteiro.");
      if (rules.min !== undefined && value < rules.min) fail(`O valor mínimo é ${rules.min}.`);
      if (rules.max !== undefined && value > rules.max) fail(`O valor máximo é ${rules.max}.`);
      return value;
    }

    case "SELECT": {
      if (typeof raw !== "string") return fail("Escolha uma das opções.");
      const options = (await optionsOf(setting)) ?? [];
      if (!options.some((o) => o.value === raw)) fail("Escolha uma das opções.");
      return raw;
    }

    case "STRING":
    case "TEXT": {
      if (typeof raw !== "string") return fail("Indique um texto.");
      const value = raw.trim();
      const max = rules.maxLength ?? DEFAULT_MAX_LENGTH[setting.type];
      if (!value) fail("Indique um valor.");
      if (value.length > max) fail(`Máximo de ${max} caracteres.`);
      if (rules.format === "email" && !EMAIL.test(value)) fail("Email inválido.");
      if (rules.format === "timezone" && !isTimeZone(value)) fail("Fuso horário inválido (ex.: Africa/Maputo).");
      return value;
    }

    case "JSON":
      return normalizeJson(raw, rules, fail);
  }
}

/** Regras entre parâmetros. */
async function checkCrossRules(key: string, value: unknown) {
  if (key === "pagination.defaultSize" && (value as number) > (await appSettings.get("pagination.maxSize")))
    throw ValidationException.field("value", "Não pode ser maior que o máximo de itens por página.");
  if (key === "pagination.maxSize" && (value as number) < (await appSettings.get("pagination.defaultSize")))
    throw ValidationException.field("value", "Não pode ser menor que os itens por página.");
}

export const systemSettingsService = {
  /** Todos os parâmetros, agrupados pela ordem dos grupos. */
  async list(): Promise<SettingGroupResponse[]> {
    const settings = await prisma.systemSetting.findMany({ orderBy: [{ order: "asc" }, { key: "asc" }] });
    const names = await namesOf(settings);
    const items = await Promise.all(settings.map((s) => toResponse(s, names)));
    const known = SETTING_GROUPS.map((g) => g.group);
    const groups = [...new Set(items.map((i) => i.group))].sort((a, b) => {
      const ia = known.indexOf(a);
      const ib = known.indexOf(b);
      return (ia < 0 ? Infinity : ia) - (ib < 0 ? Infinity : ib) || a.localeCompare(b);
    });
    return groups.map((group) => ({
      group,
      label: SETTING_GROUPS.find((g) => g.group === group)?.label ?? group,
      items: items.filter((i) => i.group === group),
    }));
  },

  async update(key: string, raw: unknown, actorId: string): Promise<SystemSettingResponse> {
    const setting = await prisma.systemSetting.findUnique({ where: { key } });
    if (!setting) throw new NotFoundException("O parâmetro");
    const value = await normalize(setting, raw);
    await checkCrossRules(key, value);
    const updated = await prisma.systemSetting.update({ where: { key }, data: { value: value as Prisma.InputJsonValue, updatedById: actorId } });
    appSettings.invalidate();
    return toResponse(updated, await namesOf([updated]));
  },

  /** Parâmetros públicos e moedas activas, sem sessão (ecrã de entrada, formatação). */
  async publicConfig(): Promise<PublicConfig> {
    const [settings, currencies] = await Promise.all([
      prisma.systemSetting.findMany({ where: { public: true }, orderBy: { order: "asc" }, select: { key: true, value: true } }),
      currenciesService.active(),
    ]);
    return {
      settings: Object.fromEntries(settings.map((s) => [s.key, s.value])),
      currencies,
      assistant: { mode: env.ANTHROPIC_API_KEY ? "ai" : "offline" },
    };
  },
};
