import type { SettingType } from "../../generated/prisma";

/** Valores dos parâmetros do sistema, por chave. */
export interface SettingValues {
  "app.name": string;
  "app.tagline": string;
  "app.supportEmail": string;
  "auth.registrationEnabled": boolean;
  "auth.passwordMinLength": number;
  "auth.sessionDays": number;
  "locale.defaultCurrency": string;
  "locale.timezone": string;
  "pagination.defaultSize": number;
  "pagination.maxSize": number;
  "alerts.defaultBudgetThreshold": number;
  "alerts.defaultBillDaysAhead": number;
  "alerts.defaultLowBalance": number;
  "emails.enabled": boolean;
  "family.enabled": boolean;
  "family.maxDependents": number;
  "family.dependentProfile": string;
  "assistant.enabled": boolean;
  "assistant.model": string;
  "assistant.effort": string;
  "assistant.dailyLimit": number;
  "assistant.welcome": string;
  "help.showFaq": boolean;
  "periods.autoCreate": boolean;
  "periods.autoClosePrevious": boolean;
  "growth.lookbackMonths": number;
  "growth.emergencyMonths": number;
  "growth.targetSavingsRate": number;
  "growth.wantsMaxRate": number;
  "growth.comfortableShare": number;
  "recurring.daysAhead": number;
  "forecast.horizonMonths": number;
  "forecast.tightRate": number;
  "forecast.includeVariableIncome": boolean;
  "forecast.alertMonths": number;
  "advisor.trendMonths": number;
  "advisor.fastPaceRate": number;
  "advisor.paydayShare": number;
  "advisor.paydayDays": number;
  "attachments.maxFileMb": number;
  "attachments.maxPerTransaction": number;
  "site.headline": string;
  "site.subheadline": string;
  "site.ctaLabel": string;
  "site.faq": SiteFaqItem[];
}

/** Pergunta do site público (parâmetro `site.faq`). */
export interface SiteFaqItem {
  question: string;
  answer: string;
}

export type SettingKey = keyof SettingValues;

export interface SettingConstraints {
  min?: number;
  max?: number;
  integer?: boolean;
  maxLength?: number;
  /** Opções do SELECT calculadas: moedas activas ou perfis (sem super administradores). */
  source?: "currencies" | "profiles";
  /** Formato do texto: email ou fuso horário IANA (ex.: "Africa/Maputo"). */
  format?: "email" | "timezone";
  /** JSON: forma esperada do valor. `faq` = lista de { question, answer }. */
  shape?: "faq";
  /** JSON com lista: número mínimo e máximo de itens. */
  minItems?: number;
  maxItems?: number;
}

export interface SettingDefinition<K extends SettingKey = SettingKey> {
  key: K;
  value: SettingValues[K];
  type: SettingType;
  group: string;
  label: string;
  description?: string;
  options?: { value: string; label: string }[];
  constraints?: SettingConstraints;
  public?: boolean;
}

/** Nomes dos grupos, pela ordem em que aparecem no painel. */
export const SETTING_GROUPS: { group: string; label: string }[] = [
  { group: "app", label: "Aplicação" },
  { group: "auth", label: "Autenticação" },
  { group: "locale", label: "Região e moeda" },
  { group: "pagination", label: "Listagens" },
  { group: "alerts", label: "Alertas" },
  { group: "emails", label: "Emails" },
  { group: "family", label: "Família" },
  { group: "assistant", label: "Assistente" },
  { group: "help", label: "Ajuda" },
  { group: "periods", label: "Períodos" },
  { group: "growth", label: "Crescimento" },
  { group: "recurring", label: "Recorrentes" },
  { group: "forecast", label: "Previsão" },
  { group: "advisor", label: "Conselheiro" },
  { group: "attachments", label: "Comprovativos" },
  { group: "site", label: "Site público" },
];

const def = <K extends SettingKey>(d: SettingDefinition<K>) => d;

/**
 * Valores iniciais (seed) e de recurso: se a linha faltar na base, usa-se o valor daqui.
 * Mudar um valor aqui não altera bases já criadas — isso faz-se no painel.
 */
export const SETTING_DEFINITIONS = [
  def({ key: "app.name", value: "Finanças Smart", type: "STRING", group: "app", label: "Nome da aplicação", public: true, constraints: { maxLength: 60 } }),
  def({ key: "app.tagline", value: "Controlo pessoal", type: "STRING", group: "app", label: "Subtítulo", public: true, constraints: { maxLength: 120 } }),
  def({
    key: "app.supportEmail",
    value: "suporte@financas.local",
    type: "STRING",
    group: "app",
    label: "Email de suporte",
    description: "Mostrado aos utilizadores para pedirem ajuda.",
    public: true,
    constraints: { format: "email", maxLength: 120 },
  }),
  def({
    key: "auth.registrationEnabled",
    value: true,
    type: "BOOLEAN",
    group: "auth",
    label: "Permitir registo de novas contas",
    description: "Desligado, só o administrador cria contas.",
    public: true,
  }),
  def({
    key: "auth.passwordMinLength",
    value: 8,
    type: "NUMBER",
    group: "auth",
    label: "Tamanho mínimo da palavra-passe",
    public: true,
    constraints: { min: 6, max: 72, integer: true },
  }),
  def({
    key: "auth.sessionDays",
    value: 7,
    type: "NUMBER",
    group: "auth",
    label: "Duração da sessão (dias)",
    description: "Aplica-se às sessões iniciadas depois da alteração.",
    constraints: { min: 1, max: 90, integer: true },
  }),
  def({
    key: "locale.defaultCurrency",
    value: "MZN",
    type: "SELECT",
    group: "locale",
    label: "Moeda por omissão",
    description: "Moeda das contas novas.",
    public: true,
    constraints: { source: "currencies" },
  }),
  def({
    key: "locale.timezone",
    value: "Africa/Maputo",
    type: "STRING",
    group: "locale",
    label: "Fuso horário",
    description: "Usado na saudação do painel (bom dia, boa tarde, boa noite). Formato IANA, ex.: Africa/Maputo.",
    public: true,
    constraints: { format: "timezone", maxLength: 60 },
  }),
  def({
    key: "pagination.defaultSize",
    value: 20,
    type: "NUMBER",
    group: "pagination",
    label: "Itens por página",
    public: true,
    constraints: { min: 1, max: 500, integer: true },
  }),
  def({
    key: "pagination.maxSize",
    value: 100,
    type: "NUMBER",
    group: "pagination",
    label: "Máximo de itens por página",
    constraints: { min: 1, max: 500, integer: true },
  }),
  def({
    key: "alerts.defaultBudgetThreshold",
    value: 80,
    type: "NUMBER",
    group: "alerts",
    label: "Aviso de orçamento (%)",
    description: "Valor inicial para contas novas.",
    constraints: { min: 50, max: 100, integer: true },
  }),
  def({
    key: "alerts.defaultBillDaysAhead",
    value: 3,
    type: "NUMBER",
    group: "alerts",
    label: "Dias de antecedência das contas a pagar",
    description: "Valor inicial para contas novas.",
    constraints: { min: 1, max: 30, integer: true },
  }),
  def({
    key: "alerts.defaultLowBalance",
    value: 1000,
    type: "NUMBER",
    group: "alerts",
    label: "Saldo baixo",
    description: "Valor inicial para contas novas, na moeda do utilizador.",
    constraints: { min: 0, max: 1_000_000_000 },
  }),
  def({ key: "emails.enabled", value: true, type: "BOOLEAN", group: "emails", label: "Enviar emails", description: "Alertas, resumo semanal e relatório mensal." }),
  def({ key: "family.enabled", value: true, type: "BOOLEAN", group: "family", label: "Gestão familiar", public: true }),
  def({
    key: "family.maxDependents",
    value: 10,
    type: "NUMBER",
    group: "family",
    label: "Máximo de dependentes por responsável",
    constraints: { min: 0, max: 100, integer: true },
  }),
  def({
    key: "family.dependentProfile",
    value: "DEPENDENT",
    type: "SELECT",
    group: "family",
    label: "Perfil das contas de dependentes",
    constraints: { source: "profiles" },
  }),
  def({ key: "assistant.enabled", value: true, type: "BOOLEAN", group: "assistant", label: "Assistente ligado", public: true }),
  def({ key: "assistant.model", value: "claude-opus-5-5", type: "STRING", group: "assistant", label: "Modelo", constraints: { maxLength: 80 } }),
  def({
    key: "assistant.effort",
    value: "low",
    type: "SELECT",
    group: "assistant",
    label: "Esforço de raciocínio",
    options: [
      { value: "low", label: "Baixo" },
      { value: "medium", label: "Médio" },
      { value: "high", label: "Alto" },
    ],
  }),
  def({
    key: "assistant.dailyLimit",
    value: 50,
    type: "NUMBER",
    group: "assistant",
    label: "Mensagens por utilizador por dia",
    constraints: { min: 0, max: 10_000, integer: true },
  }),
  def({
    key: "assistant.welcome",
    value: "Olá! Sou o assistente da aplicação. Pergunte-me como fazer qualquer coisa — registar transações, criar orçamentos e metas, acompanhar a família — e respondo com base no manual.",
    type: "TEXT",
    group: "assistant",
    label: "Mensagem de boas-vindas",
    public: true,
    constraints: { maxLength: 2000 },
  }),
  def({ key: "help.showFaq", value: true, type: "BOOLEAN", group: "help", label: "Mostrar perguntas frequentes", public: true }),
  def({
    key: "periods.autoCreate",
    value: true,
    type: "BOOLEAN",
    group: "periods",
    label: "Abrir o novo ano automaticamente",
    description: "Na passagem de ano, cria o novo ano aberto e passa-o a corrente.",
  }),
  def({
    key: "periods.autoClosePrevious",
    value: true,
    type: "BOOLEAN",
    group: "periods",
    label: "Fechar o ano anterior automaticamente",
    description: "Quando o novo ano é aberto automaticamente, o anterior fica só para consulta.",
  }),
  def({
    key: "growth.lookbackMonths",
    value: 6,
    type: "NUMBER",
    group: "growth",
    label: "Meses usados nas médias",
    description: "Meses completos (antes do actual) usados para calcular a receita, a despesa e a poupança médias.",
    constraints: { min: 1, max: 24, integer: true },
  }),
  def({
    key: "growth.emergencyMonths",
    value: 6,
    type: "NUMBER",
    group: "growth",
    label: "Fundo de emergência (meses de despesa)",
    description: "Quantos meses de despesa a poupança deve cobrir antes de propor investimentos.",
    constraints: { min: 1, max: 24, integer: true },
  }),
  def({
    key: "growth.targetSavingsRate",
    value: 20,
    type: "NUMBER",
    group: "growth",
    label: "Taxa de poupança recomendada (%)",
    description: "Parte da receita que se recomenda guardar todos os meses (regra 50/30/20).",
    constraints: { min: 1, max: 90, integer: true },
  }),
  def({
    key: "growth.wantsMaxRate",
    value: 30,
    type: "NUMBER",
    group: "growth",
    label: "Máximo em desejos (%)",
    description: "Parte da receita a partir da qual os gastos em desejos (lazer, compras…) geram uma proposta de corte.",
    constraints: { min: 5, max: 90, integer: true },
  }),
  def({
    key: "growth.comfortableShare",
    value: 50,
    type: "NUMBER",
    group: "growth",
    label: "Esforço confortável de um plano (%)",
    description: "Um plano é confortável se a prestação mensal usar até esta parte da poupança média.",
    constraints: { min: 10, max: 100, integer: true },
  }),
  def({
    key: "recurring.daysAhead",
    value: 7,
    type: "NUMBER",
    group: "recurring",
    label: "Antecedência das recorrentes (dias)",
    description: "Quantos dias antes da data cada transação recorrente aparece como prevista (entra nos alertas de contas a pagar).",
    constraints: { min: 0, max: 60, integer: true },
  }),
  def({
    key: "forecast.horizonMonths",
    value: 12,
    type: "NUMBER",
    group: "forecast",
    label: "Meses da previsão",
    description: "Quantos meses à frente (a contar com o actual) a Previsão mostra.",
    constraints: { min: 3, max: 24, integer: true },
  }),
  def({
    key: "forecast.tightRate",
    value: 10,
    type: "NUMBER",
    group: "forecast",
    label: "Margem de segurança (%)",
    description: "Um mês fica apertado se sobrar menos do que esta parte da receita. A poupança das metas respeita esta margem.",
    constraints: { min: 0, max: 50, integer: true },
  }),
  def({
    key: "forecast.includeVariableIncome",
    value: true,
    type: "BOOLEAN",
    group: "forecast",
    label: "Contar com as receitas variáveis",
    description: "Inclui na previsão a média das receitas que não são recorrentes (negócios extra, vendas). Desligado, a previsão é mais prudente.",
  }),
  def({
    key: "forecast.alertMonths",
    value: 3,
    type: "NUMBER",
    group: "forecast",
    label: "Meses vigiados pelos alertas",
    description: "Avisa quando um destes próximos meses (além do actual) fica no vermelho na Previsão.",
    constraints: { min: 0, max: 12, integer: true },
  }),
  def({
    key: "advisor.trendMonths",
    value: 3,
    type: "NUMBER",
    group: "advisor",
    label: "Meses para medir o crescimento",
    description: "O conselheiro compara o património de hoje com o do fim deste número de meses atrás.",
    constraints: { min: 1, max: 24, integer: true },
  }),
  def({
    key: "advisor.fastPaceRate",
    value: 110,
    type: "NUMBER",
    group: "advisor",
    label: "Ritmo de gastos acelerado (%)",
    description: "Acima desta parte do gasto normal para o dia do mês, o conselheiro avisa que o mês está a correr depressa.",
    constraints: { min: 100, max: 200, integer: true },
  }),
  def({
    key: "advisor.paydayShare",
    value: 40,
    type: "NUMBER",
    group: "advisor",
    label: "Receita que conta como salário (%)",
    description: "Uma receita a partir desta parte da receita média mensal abre o plano do salário: contas a pagar, poupança e dia-a-dia até ao próximo.",
    constraints: { min: 5, max: 100, integer: true },
  }),
  def({
    key: "advisor.paydayDays",
    value: 7,
    type: "NUMBER",
    group: "advisor",
    label: "Dias a mostrar o plano do salário",
    description: "Durante quantos dias depois de entrar o salário o Dashboard mostra o plano.",
    constraints: { min: 1, max: 31, integer: true },
  }),
  def({
    key: "attachments.maxFileMb",
    value: 5,
    type: "NUMBER",
    group: "attachments",
    label: "Tamanho máximo de um comprovativo (MB)",
    description: "PDF ou fotografia anexados a uma transação.",
    constraints: { min: 1, max: 20, integer: true },
  }),
  def({
    key: "attachments.maxPerTransaction",
    value: 10,
    type: "NUMBER",
    group: "attachments",
    label: "Comprovativos por transação",
    constraints: { min: 1, max: 50, integer: true },
  }),
  def({
    key: "site.headline",
    value: "As suas finanças, simples e em ordem",
    type: "STRING",
    group: "site",
    label: "Título principal",
    public: true,
    constraints: { maxLength: 120 },
  }),
  def({
    key: "site.subheadline",
    value:
      "Registe o que entra e o que sai, planeie o mês com orçamentos, junte dinheiro para as suas metas e acompanhe a família — em meticais, no telemóvel ou no computador.",
    type: "TEXT",
    group: "site",
    label: "Texto de apresentação",
    public: true,
    constraints: { maxLength: 400 },
  }),
  def({
    key: "site.ctaLabel",
    value: "Criar conta grátis",
    type: "STRING",
    group: "site",
    label: "Texto do botão principal",
    public: true,
    constraints: { maxLength: 40 },
  }),
  def({
    key: "site.faq",
    value: [
      {
        question: "Quanto custa?",
        answer: "Nada. Criar conta e usar todas as funcionalidades é grátis.",
      },
      {
        question: "Preciso de ligar a minha conta do banco ou do M-Pesa?",
        answer:
          "Não. Regista os movimentos à mão, em poucos segundos, e a aplicação calcula os saldos. Nunca pedimos códigos nem palavras-passe do banco ou da carteira móvel.",
      },
      {
        question: "Os meus dados ficam seguros?",
        answer:
          "As suas contas só são vistas por si, pelos familiares a quem der acesso e, quando é preciso dar apoio, pela administração (cada consulta fica registada). A palavra-passe nunca é guardada em texto simples e pode exportar os seus dados quando quiser.",
      },
      {
        question: "Funciona no telemóvel?",
        answer: "Sim. O site adapta-se a qualquer ecrã e é leve, para funcionar bem mesmo com pouca rede ou em telemóveis mais simples.",
      },
      {
        question: "Posso ajudar a gerir as finanças de um familiar?",
        answer:
          "Sim. Na área Família convida um familiar (ou cria uma conta para ele) e escolhe se pode só consultar ou também registar movimentos. A pessoa pode retirar o acesso quando quiser.",
      },
    ],
    type: "JSON",
    group: "site",
    label: "Perguntas frequentes do site",
    description: "Lista de perguntas e respostas mostrada na página inicial pública.",
    public: true,
    constraints: { shape: "faq", minItems: 0, maxItems: 10 },
  }),
] satisfies SettingDefinition[];

export const SETTING_DEFAULTS = Object.fromEntries(SETTING_DEFINITIONS.map((d) => [d.key, d.value])) as unknown as SettingValues;
