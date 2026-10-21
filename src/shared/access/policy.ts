import type { Action } from "../../generated/prisma";
import { prisma } from "../db/prisma";
import { ACTION_VERBS, ACTIONS } from "./actions";

/**
 * Índice em memória das funcionalidades (menus) e das permissões dos perfis.
 * É invalidado sempre que menus ou permissões mudam; o TTL cobre outras instâncias da API.
 */

export interface FunctionalityEntry {
  id: string;
  code: string;
  label: string;
  path: string | null;
  icon: string | null;
  order: number;
  parentId: string | null;
  apiPaths: string[];
  protectReads: boolean;
  active: boolean;
}

interface Matcher {
  regex: RegExp;
  /** Padrão "GET /…": só dá leitura (ex.: os perfis lêem a lista de menus para a matriz). */
  readOnly: boolean;
  /** [segmentos literais, -"**", -"*", comprimento]: maior ganha. */
  score: number[];
  entry: FunctionalityEntry;
}

interface Snapshot {
  functionalities: Map<string, FunctionalityEntry>;
  matchers: Matcher[];
  /** profileId → functionalityId → acções atribuídas directamente. */
  permissions: Map<string, Map<string, Set<Action>>>;
}

export interface ProfileRef {
  id: string;
  superAdmin: boolean;
}

const TTL_MS = 30_000;

let snapshot: { data: Snapshot; loadedAt: number } | null = null;
let loading: Promise<Snapshot> | null = null;
let generation = 0;

const SEGMENT = /^([a-z0-9._-]+|\*|\*\*)$/i;
const READ_ONLY_PREFIX = "GET ";

/** Padrão válido: "/a/b", "/a/*", "/a/**" ("**" só no fim), opcionalmente "GET /a" (só leitura). */
export function isValidApiPattern(raw: string): boolean {
  const pattern = raw.startsWith(READ_ONLY_PREFIX) ? raw.slice(READ_ONLY_PREFIX.length) : raw;
  if (!pattern.startsWith("/") || pattern.length > 200) return false;
  const segments = pattern.slice(1).split("/");
  return segments.every((s, i) => SEGMENT.test(s) && (s !== "**" || i === segments.length - 1));
}

function compile(raw: string, entry: FunctionalityEntry): Matcher | null {
  if (!isValidApiPattern(raw)) return null;
  const readOnly = raw.startsWith(READ_ONLY_PREFIX);
  const pattern = readOnly ? raw.slice(READ_ONLY_PREFIX.length) : raw;
  const segments = pattern.slice(1).split("/");
  let regex = "";
  let literals = 0;
  let singles = 0;
  let doubles = 0;
  for (const s of segments) {
    if (s === "**") {
      regex += "(?:/.*)?";
      doubles += 1;
    } else if (s === "*") {
      regex += "/[^/]+";
      singles += 1;
    } else {
      regex += `/${s.replace(/[.]/g, "\\.")}`;
      literals += 1;
    }
  }
  return { regex: new RegExp(`^${regex}$`, "i"), readOnly, score: [literals, -doubles, -singles, pattern.length], entry };
}

const byScore = (a: Matcher, b: Matcher) => {
  for (let i = 0; i < a.score.length; i++) if (a.score[i] !== b.score[i]) return b.score[i] - a.score[i];
  return 0;
};

async function build(): Promise<Snapshot> {
  const [rows, links] = await Promise.all([prisma.functionality.findMany(), prisma.profileFunctionality.findMany()]);
  const functionalities = new Map<string, FunctionalityEntry>();
  const matchers: Matcher[] = [];
  for (const row of rows) {
    const entry: FunctionalityEntry = {
      id: row.id,
      code: row.code,
      label: row.label,
      path: row.path,
      icon: row.icon,
      order: row.order,
      parentId: row.parentId,
      apiPaths: row.apiPaths,
      protectReads: row.protectReads,
      active: row.active,
    };
    functionalities.set(row.id, entry);
    for (const pattern of row.apiPaths) {
      const matcher = compile(pattern, entry);
      if (matcher) matchers.push(matcher);
    }
  }
  matchers.sort(byScore);

  const permissions = new Map<string, Map<string, Set<Action>>>();
  for (const link of links) {
    const byFunctionality = permissions.get(link.profileId) ?? new Map<string, Set<Action>>();
    byFunctionality.set(link.functionalityId, new Set(link.actions));
    permissions.set(link.profileId, byFunctionality);
  }
  return { functionalities, matchers, permissions };
}

async function load(): Promise<Snapshot> {
  if (snapshot && Date.now() - snapshot.loadedAt < TTL_MS) return snapshot.data;
  if (loading) return loading;
  const started = generation;
  const current = build()
    .then((data) => {
      if (started === generation) snapshot = { data, loadedAt: Date.now() };
      return data;
    })
    .finally(() => {
      if (loading === current) loading = null;
    });
  loading = current;
  return current;
}

/** Acções do perfil numa funcionalidade, incluindo as herdadas das secções-pai. */
function effectiveActions(data: Snapshot, profile: ProfileRef, functionalityId: string): Set<Action> {
  if (profile.superAdmin) return new Set(ACTIONS);
  const own = data.permissions.get(profile.id);
  const result = new Set<Action>();
  const seen = new Set<string>();
  let current: string | null = functionalityId;
  while (current && !seen.has(current)) {
    seen.add(current);
    for (const action of own?.get(current) ?? []) result.add(action);
    current = data.functionalities.get(current)?.parentId ?? null;
  }
  return result;
}

export interface AccessDecision {
  functionality?: FunctionalityEntry;
  allowed: boolean;
  /** Motivo da recusa, pronto para o cliente. */
  detail?: string;
}

export const accessPolicy = {
  /** Funcionalidade do padrão mais específico que corresponde ao caminho. */
  async match(path: string): Promise<FunctionalityEntry | undefined> {
    const data = await load();
    return (data.matchers.find((m) => !m.readOnly && m.regex.test(path)) ?? data.matchers.find((m) => m.regex.test(path)))?.entry;
  },

  async decide(profile: ProfileRef, action: Action, path: string): Promise<AccessDecision> {
    const data = await load();
    const matches = data.matchers.filter((m) => m.regex.test(path));
    // A funcionalidade "dona" do caminho é a do padrão completo mais específico
    const functionality = (matches.find((m) => !m.readOnly) ?? matches[0])?.entry;
    // Rotas não mapeadas ficam livres para quem tem sessão
    if (!functionality || profile.superAdmin) return { functionality, allowed: true };

    const canRead = (entry: FunctionalityEntry) =>
      entry.active && (!entry.protectReads || effectiveActions(data, profile, entry.id).size > 0);
    if (action === "VIEW" && matches.some((m) => canRead(m.entry))) return { functionality, allowed: true };
    if (!functionality.active) return { functionality, allowed: false, detail: `A funcionalidade "${functionality.label}" está desactivada.` };

    const allowed = action !== "VIEW" && effectiveActions(data, profile, functionality.id).has(action);
    return allowed
      ? { functionality, allowed }
      : { functionality, allowed, detail: `O seu perfil não pode ${ACTION_VERBS[action]} em "${functionality.label}".` };
  },

  /** Todas as funcionalidades com as acções efectivas do perfil (para o menu). */
  async tree(profile: ProfileRef): Promise<{ entry: FunctionalityEntry; actions: Action[] }[]> {
    const data = await load();
    return [...data.functionalities.values()].map((entry) => ({
      entry,
      actions: ACTIONS.filter((a) => effectiveActions(data, profile, entry.id).has(a)),
    }));
  },

  /** Acções efectivas do perfil numa funcionalidade, pelo código (vazio se não existir ou estiver desactivada). */
  async actionsOn(profile: ProfileRef, code: string): Promise<Set<Action>> {
    const data = await load();
    const entry = [...data.functionalities.values()].find((f) => f.code === code);
    if (profile.superAdmin) return new Set(ACTIONS);
    if (!entry?.active) return new Set();
    return effectiveActions(data, profile, entry.id);
  },

  invalidate() {
    generation += 1;
    snapshot = null;
    loading = null;
  },
};
