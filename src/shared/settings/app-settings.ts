import { prisma } from "../db/prisma";
import { SETTING_DEFAULTS, type SettingKey, type SettingValues } from "./definitions";

/** As escritas invalidam a cache; o TTL cobre outras instâncias da API. */
const TTL_MS = 30_000;

let cache: { values: Map<string, unknown>; loadedAt: number } | null = null;
let loading: Promise<Map<string, unknown>> | null = null;
// Uma leitura iniciada antes de uma invalidação não pode repor valores antigos
let generation = 0;

async function load(): Promise<Map<string, unknown>> {
  if (cache && Date.now() - cache.loadedAt < TTL_MS) return cache.values;
  if (loading) return loading;
  const started = generation;
  const current = prisma.systemSetting
    .findMany({ select: { key: true, value: true } })
    .then((rows) => {
      const values = new Map(rows.map((r) => [r.key, r.value as unknown]));
      if (started === generation) cache = { values, loadedAt: Date.now() };
      return values;
    })
    .finally(() => {
      if (loading === current) loading = null;
    });
  loading = current;
  return current;
}

/** Parâmetros do sistema (tabela `system_settings`), com cache em memória. */
export const appSettings = {
  async get<K extends SettingKey>(key: K): Promise<SettingValues[K]> {
    const values = await load();
    return (values.has(key) ? values.get(key) : SETTING_DEFAULTS[key]) as SettingValues[K];
  },

  async many<K extends SettingKey>(...keys: K[]): Promise<Pick<SettingValues, K>> {
    const values = await load();
    return Object.fromEntries(keys.map((k) => [k, values.has(k) ? values.get(k) : SETTING_DEFAULTS[k]])) as Pick<SettingValues, K>;
  },

  invalidate() {
    generation += 1;
    cache = null;
    loading = null;
  },
};
