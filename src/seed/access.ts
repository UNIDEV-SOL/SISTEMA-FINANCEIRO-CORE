import type { Action } from "../generated/prisma";
import { ACTIONS } from "../shared/access/actions";

export interface MenuSeed {
  code: string;
  label: string;
  path?: string;
  icon?: string;
  apiPaths?: string[];
  protectReads?: boolean;
  children?: MenuSeed[];
}

/** Menu inicial. Os `code` são estáveis: a front usa-os como chave. */
export const MENU: MenuSeed[] = [
  {
    code: "MAIN",
    label: "Principal",
    children: [
      { code: "DASHBOARD", label: "Dashboard", path: "/painel", icon: "layout-dashboard", apiPaths: ["/dashboard/**"] },
      { code: "TRANSACTIONS", label: "Transações", path: "/transacoes", icon: "arrow-left-right", apiPaths: ["/transactions/**"] },
      { code: "RECURRING", label: "Recorrentes", path: "/recorrentes", icon: "repeat", apiPaths: ["/recurring/**"] },
      { code: "ACCOUNTS", label: "Contas", path: "/contas", icon: "wallet", apiPaths: ["/accounts/**"] },
    ],
  },
  {
    code: "PLANNING",
    label: "Planeamento",
    children: [
      { code: "BUDGETS", label: "Orçamentos", path: "/orcamentos", icon: "target", apiPaths: ["/budgets/**"] },
      { code: "GOALS", label: "Metas", path: "/metas", icon: "piggy-bank", apiPaths: ["/goals/**"] },
      { code: "INVESTMENTS", label: "Investimentos", path: "/investimentos", icon: "trending-up", apiPaths: ["/investments/**"] },
      { code: "FORECAST", label: "Previsão", path: "/previsao", icon: "calendar", apiPaths: ["/forecast/**"] },
      { code: "GROWTH", label: "Crescer", path: "/crescer", icon: "sprout", apiPaths: ["/growth/**"] },
    ],
  },
  {
    code: "ANALYSIS",
    label: "Análise",
    children: [
      { code: "REPORTS", label: "Relatórios", path: "/relatorios", icon: "bar-chart-3", apiPaths: ["/reports/**"] },
      { code: "ALERTS", label: "Alertas", path: "/alertas", icon: "bell", apiPaths: ["/alerts/**"] },
    ],
  },
  {
    code: "SYSTEM",
    label: "Sistema",
    children: [
      { code: "CATEGORIES", label: "Categorias", path: "/categorias", icon: "tags", apiPaths: ["/categories/**"] },
      { code: "FAMILY", label: "Família", path: "/familia", icon: "users", apiPaths: ["/family/**"] },
      { code: "HELP", label: "Ajuda", path: "/ajuda", icon: "life-buoy", apiPaths: ["/help/**", "/assistant/**"] },
      { code: "SETTINGS", label: "Configurações", path: "/configuracoes", icon: "settings", apiPaths: ["/settings/**", "/export/**", "/demo/reset"] },
    ],
  },
  {
    code: "ADMINISTRATION",
    label: "Administração",
    protectReads: true,
    children: [
      { code: "ADMIN_USERS", label: "Utilizadores", path: "/admin/utilizadores", icon: "user-cog", apiPaths: ["/admin/users/**", "GET /admin/profiles"], protectReads: true },
      { code: "ADMIN_PROFILES", label: "Perfis e permissões", path: "/admin/perfis", icon: "shield-check", apiPaths: ["/admin/profiles/**", "GET /admin/functionalities"], protectReads: true },
      { code: "ADMIN_MENUS", label: "Menus", path: "/admin/menus", icon: "list-tree", apiPaths: ["/admin/functionalities/**"], protectReads: true },
      {
        code: "ADMIN_SETTINGS",
        label: "Parâmetros",
        path: "/admin/parametros",
        icon: "sliders-horizontal",
        apiPaths: ["/admin/settings/**", "/admin/currencies/**"],
        protectReads: true,
      },
      { code: "ADMIN_HELP", label: "Manual e FAQ", path: "/admin/ajuda", icon: "book-open", apiPaths: ["/admin/help/**"], protectReads: true },
      { code: "ADMIN_AUDIT", label: "Auditoria", path: "/admin/auditoria", icon: "scroll-text", apiPaths: ["/admin/audit/**", "GET /admin/users"], protectReads: true },
      { code: "ADMIN_PERIODS", label: "Períodos", path: "/admin/periodos", icon: "calendar-range", apiPaths: ["/admin/periods/**"], protectReads: true },
      {
        code: "ADMIN_GROWTH",
        label: "Planos de crescimento",
        path: "/admin/crescimento",
        icon: "sprout",
        apiPaths: ["/admin/growth-plans/**"],
        protectReads: true,
      },
      // Só permissão, sem página: VIEW = ver as contas de qualquer utilizador activo (X-Acting-As); EDIT = também alterar
      { code: "ADMIN_USER_DATA", label: "Contas dos utilizadores", icon: "building-2" },
    ],
  },
];

export interface ProfileSeed {
  code: string;
  name: string;
  description: string;
  superAdmin?: boolean;
  isDefault?: boolean;
  permissions: Record<string, readonly Action[]>;
}

const PERSONAL = ["DASHBOARD", "TRANSACTIONS", "RECURRING", "ACCOUNTS", "BUDGETS", "GOALS", "INVESTMENTS", "FORECAST", "GROWTH", "REPORTS", "ALERTS", "CATEGORIES", "FAMILY", "HELP", "SETTINGS"];

const all = (codes: string[]) => Object.fromEntries(codes.map((c) => [c, ACTIONS]));

/**
 * Permissões em funcionalidades acrescentadas depois da primeira versão: dadas aos perfis de sistema
 * que já existiam quando a funcionalidade é criada (nunca repostas depois de o admin as retirar).
 */
export const LATER_GRANTS: { profile: string; functionality: string; actions: Action[] }[] = [
  { profile: "ADMIN", functionality: "ADMIN_USER_DATA", actions: ["VIEW"] },
  ...["ADMIN", "USER", "DEPENDENT"].map((profile) => ({ profile, functionality: "GROWTH", actions: [...ACTIONS] })),
  ...["ADMIN", "USER", "DEPENDENT"].map((profile) => ({ profile, functionality: "RECURRING", actions: [...ACTIONS] })),
  ...["ADMIN", "USER", "DEPENDENT"].map((profile) => ({ profile, functionality: "FORECAST", actions: [...ACTIONS] })),
];

/** Perfis de sistema (não apagáveis). */
export const PROFILES: ProfileSeed[] = [
  {
    code: "SUPER_ADMIN",
    name: "Super administrador",
    description: "Acesso total, incluindo parâmetros do sistema. Não é configurável.",
    superAdmin: true,
    permissions: {},
  },
  {
    code: "ADMIN",
    name: "Administrador",
    description: "Gere utilizadores, o manual e a auditoria. Sem acesso aos parâmetros do sistema.",
    permissions: {
      ...all(PERSONAL),
      ...all(["ADMIN_USERS", "ADMIN_HELP"]),
      // Precisa de ver os perfis para os atribuir aos utilizadores
      ADMIN_PROFILES: ["VIEW"],
      ADMIN_AUDIT: ["VIEW", "EXPORT"],
      // Pode consultar as contas de qualquer utilizador, sem as alterar
      ADMIN_USER_DATA: ["VIEW"],
    },
  },
  {
    code: "USER",
    name: "Utilizador",
    description: "Acesso a todos os módulos pessoais.",
    isDefault: true,
    permissions: all(PERSONAL),
  },
  {
    code: "DEPENDENT",
    name: "Dependente",
    description: "Contas criadas por um responsável: sem investimentos nem gestão familiar.",
    permissions: all(PERSONAL.filter((c) => c !== "INVESTMENTS" && c !== "FAMILY")),
  },
];
