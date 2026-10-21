import type { IsoDate } from "../../shared/lib/dates";
import type { Money } from "../../shared/lib/money";

/**
 * Leitura de SMS e comprovativos (M-Pesa, e-Mola, BIM). Funções puras: recebem texto e devolvem movimentos,
 * sem tocar na base de dados. O que não se reconhece volta em `unrecognized` para o utilizador ver.
 */

export type ImportSource = "MPESA" | "EMOLA" | "BIM";

/** DEPOSIT/WITHDRAWAL: dinheiro vivo a entrar/sair da carteira móvel (transferências); FEE: taxa cobrada. */
export type ImportKind = "INCOME" | "EXPENSE" | "DEPOSIT" | "WITHDRAWAL" | "FEE";

export interface ParsedMovement {
  source: ImportSource;
  kind: ImportKind;
  /** Estável entre importações do mesmo movimento (SMS e comprovativo podem diferir: ver duplicados prováveis). */
  reference: string;
  amount: Money;
  date: IsoDate;
  /** "21:28" */
  time?: string;
  description: string;
  counterparty?: string;
  /** Número da conta de onde vem o movimento (BIM), para reconhecer ou criar a conta. */
  accountNumber?: string;
  /** Saldo depois do movimento, quando a mensagem o indica. */
  balance?: Money;
  notes?: string;
  /** Texto original. */
  raw: string;
}

export interface ParseResult {
  items: ParsedMovement[];
  unrecognized: string[];
}

export const SOURCE_LABELS: Record<ImportSource, string> = { MPESA: "M-Pesa", EMOLA: "e-Mola", BIM: "BIM" };

// ---------- Valores, datas e texto ----------

/** "1,000.00", "15000.00", "15000", "15.000,00", "1 000,50" → "1000.00"; null se não for um valor. */
export function parseAmount(raw: string): Money | null {
  let v = raw.replace(/\s/g, "");
  if (!/^\d[\d.,]*$/.test(v)) return null;
  const lastDot = v.lastIndexOf(".");
  const lastComma = v.lastIndexOf(",");
  if (lastDot >= 0 && lastComma >= 0) {
    // O último separador é o decimal
    v = lastDot > lastComma ? v.replace(/,/g, "") : v.replace(/\./g, "").replace(",", ".");
  } else if (lastComma >= 0) {
    // Só vírgulas: decimal se tiver 1–2 casas no fim, senão milhares
    v = /,\d{1,2}$/.test(v) && v.indexOf(",") === lastComma ? v.replace(",", ".") : v.replace(/,/g, "");
  } else if (lastDot >= 0 && !/\.\d{1,2}$/.test(v)) {
    v = v.replace(/\./g, "");
  }
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n.toFixed(2) : null;
}

/** "14/10/26", "15/09/2026" ou "28-09-2026" → "2026-10-14"; null se não for uma data válida. */
export function parseDate(raw: string): IsoDate | null {
  const m = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/);
  if (!m) return null;
  const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  const iso = `${year}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso ? null : iso;
}

/** "9:28 PM" → "21:28", "14:18:46" → "14:18". */
export function parseTime(raw: string, meridiem?: string): string | undefined {
  const m = raw.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return undefined;
  let h = Number(m[1]);
  const pm = meridiem?.toUpperCase() === "PM";
  if (meridiem && h === 12) h = pm ? 12 : 0;
  else if (pm) h += 12;
  return h > 23 ? undefined : `${String(h).padStart(2, "0")}:${m[2]}`;
}

/** Sem acentos e em minúsculas, para comparar. */
export const normalize = (v: string) => v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const SMALL_WORDS = new Set(["de", "da", "do", "das", "dos", "e"]);

/** "SIMIAO JULIO TIVANE" → "Simiao Julio Tivane" (nomes em maiúsculas nos SMS). */
export function titleCase(v: string): string {
  return v
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((w, i) => (i > 0 && SMALL_WORDS.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

/** "SALARIO SETEMBRO 2026" → "Salario setembro 2026". */
const sentenceCase = (v: string) => {
  const lower = v.trim().replace(/\s+/g, " ").toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
};

const MONEY = String.raw`(\d[\d.,]*)\s*(?:MT|MZN)`;
const DATE = String.raw`(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})`;
const TIME = String.raw`(\d{1,2}:\d{2}(?::\d{2})?)\s*(AM|PM)?`;

const firstMatch = (text: string, re: RegExp) => text.match(re)?.slice(1);

function dateAndTime(text: string): { date: IsoDate; time?: string } | null {
  const dateRaw = firstMatch(text, new RegExp(DATE))?.[0];
  const date = dateRaw ? parseDate(dateRaw) : null;
  if (!date) return null;
  const t = firstMatch(text, new RegExp(String.raw`(?:as|às)\s+${TIME}`, "i")) ?? firstMatch(text, new RegExp(TIME, "i"));
  return { date, time: t ? parseTime(t[0], t[1]) : undefined };
}

// ---------- Separar mensagens ----------

const MESSAGE_START = /(?=\bConfirmado\s+[A-Z0-9]{6,}\.)|(?=\bID da transac\S*\s)|(?=\bA conta \d+ (?:recebeu|foi))/gi;

/** Separa o texto colado em mensagens: por linhas em branco e pelo início típico de cada SMS. */
export function splitMessages(text: string): string[] {
  return text
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n/)
    .flatMap((block) => block.split(MESSAGE_START))
    .map((m) => m.replace(/\s+/g, " ").trim())
    .filter((m) => m.length >= 20);
}

// ---------- Carteiras móveis (M-Pesa, e-Mola) ----------

const VERBS: [RegExp, ImportKind][] = [
  [/\bdepositaste\b/i, "DEPOSIT"],
  [/\blevantaste\b/i, "WITHDRAWAL"],
  [/\brecebeste\b/i, "INCOME"],
  [/\b(?:transferiste|enviaste)\b/i, "EXPENSE"],
  [/\bpagaste\b/i, "EXPENSE"],
  [/\bcompraste\b/i, "EXPENSE"],
];

function walletCounterparty(text: string): string | undefined {
  const patterns = [
    /nome:\s*(.+?)(?:\s+(?:as|às|aos)\s|[,.](?:\s|$))/i,
    /\bno agente\s+(?:\d+\s*-\s*)?(.+?)\s+(?:aos|as|às)\s/i,
    /\b(?:de|para)\s+\d{9,12}\s*-\s*(.+?)\s+(?:aos|as|às)\s/i,
    /\bpagaste\b.*?\b(?:a|ao|à|para)\s+(.+?)\s+(?:aos|as|às|referente)\s/i,
  ];
  for (const re of patterns) {
    const m = text.match(re)?.[1]?.trim();
    if (m) return titleCase(m);
  }
  return undefined;
}

function walletDescription(kind: ImportKind, label: string, verb: string, counterparty?: string): string {
  const to = counterparty ? ` · ${counterparty}` : "";
  switch (kind) {
    case "DEPOSIT":
      return `Depósito ${label}${to}`;
    case "WITHDRAWAL":
      return `Levantamento ${label}${to}`;
    case "INCOME":
      return counterparty ? `Recebido de ${counterparty}` : `Recebido (${label})`;
    default:
      if (/compraste/i.test(verb)) return `Compra ${label}${to}`;
      if (/pagaste/i.test(verb)) return counterparty ? `Pagamento a ${counterparty}` : `Pagamento ${label}`;
      return counterparty ? `Transferência para ${counterparty}` : `Transferência ${label}`;
  }
}

function parseWallet(text: string, source: "MPESA" | "EMOLA"): ParsedMovement[] | null {
  const label = SOURCE_LABELS[source];
  const ref = firstMatch(text, /\bConfirmado\s+([A-Z0-9]{6,})\./)?.[0] ?? firstMatch(text, /\bID da transac\S*\s+(\S+?)\.?\s/i)?.[0];
  const verbEntry = VERBS.find(([re]) => re.test(text));
  if (!ref || !verbEntry) return null;
  const [verbRe, kind] = verbEntry;
  const verb = text.match(verbRe)![0];
  const afterVerb = text.slice(text.search(verbRe));
  const amountRaw = firstMatch(afterVerb, new RegExp(MONEY, "i"))?.[0];
  const amount = amountRaw ? parseAmount(amountRaw) : null;
  const when = dateAndTime(text);
  if (!amount || !when) return null;

  const counterparty = walletCounterparty(text);
  const balanceRaw = [...text.matchAll(new RegExp(String.raw`saldo[^0-9]{0,40}?${MONEY}`, "gi"))].at(-1)?.[1];
  const content = firstMatch(text, /Conte[uú]do:\s*(.+?)\.\s/i)?.[0];
  const base = {
    source,
    date: when.date,
    time: when.time,
    counterparty,
    balance: balanceRaw ? (parseAmount(balanceRaw) ?? undefined) : undefined,
    raw: text,
  };
  const movement: ParsedMovement = {
    ...base,
    kind,
    reference: `${source}:${ref}`,
    amount,
    description: walletDescription(kind, label, verb, counterparty),
    notes: content ? `Conteúdo: ${content}` : undefined,
  };

  const feeRaw = firstMatch(text, new RegExp(String.raw`\btaxa(?:\s+foi\s+de|\s+de|:)?\s*${MONEY}`, "i"))?.[0];
  const fee = feeRaw ? parseAmount(feeRaw) : null;
  return fee
    ? [movement, { ...base, kind: "FEE", reference: `${source}:${ref}:TAXA`, amount: fee, description: `Taxa ${label} · ${movement.description}` }]
    : [movement];
}

// ---------- BIM (SMS) ----------

function parseBimSms(text: string): ParsedMovement[] | null {
  const account = firstMatch(text, /\bconta\s+(\d{6,})/i)?.[0];
  const credit = /\b(?:recebeu|creditad[ao])\b/i.test(text);
  const debit = /\b(?:debitad[ao]|levantamento|compra|pagamento)\b/i.test(text);
  if (credit === debit) return null;
  const amountRaw = firstMatch(text, new RegExp(MONEY, "i"))?.[0];
  const amount = amountRaw ? parseAmount(amountRaw) : null;
  const when = dateAndTime(text);
  if (!account || !amount || !when) return null;
  const kind: ImportKind = credit ? "INCOME" : "EXPENSE";
  return [
    {
      source: "BIM",
      kind,
      reference: `BIM:${account}:${when.date}:${when.time ?? ""}:${amount}`,
      amount,
      date: when.date,
      time: when.time,
      accountNumber: account,
      description: credit ? "Crédito na conta BIM" : "Débito na conta BIM",
      raw: text,
    },
  ];
}

/** Reconhece um SMS e devolve os movimentos (o principal e, se houver, a taxa); null se não o conhecer. */
export function parseMessage(text: string): ParsedMovement[] | null {
  const n = normalize(text);
  if (/m-?pesa/.test(n) || /^confirmado [a-z0-9]{6,}\./.test(n)) return parseWallet(text, "MPESA");
  if (/e-?mola|movitel/.test(n) || /^id da transac/.test(n)) return parseWallet(text, "EMOLA");
  if (/millennium|\bbim\b/.test(n) || /^a conta \d+ /.test(n)) return parseBimSms(text);
  return null;
}

export function parseMessages(text: string): ParseResult {
  const items: ParsedMovement[] = [];
  const unrecognized: string[] = [];
  for (const message of splitMessages(text)) {
    const parsed = parseMessage(message);
    if (parsed) items.push(...parsed);
    else unrecognized.push(message);
  }
  return { items, unrecognized };
}

// ---------- BIM (comprovativo em PDF) ----------

/**
 * Nota de lançamento do BIM, já em linhas "etiqueta valor" (ver imports.pdf.ts).
 * Devolve null se o documento não for uma nota de lançamento.
 */
export function parseBimStatement(lines: string[]): ParsedMovement | null {
  const text = lines.join("\n");
  if (!/nota de lan[cç]amento/i.test(text)) return null;
  const field = (label: string) => text.match(new RegExp(String.raw`^${label}\s+(.+)$`, "im"))?.[1]?.trim();

  const account = field(String.raw`Conta Dep\. [aà] Ordem Nr`)?.match(/\d+/)?.[0];
  const dateRaw = field("Data Valor") ?? field(String.raw`Data da transac\S*`);
  const date = dateRaw ? parseDate(dateRaw.split(/\s/)[0]) : null;
  const amountRaw = field("Montante")?.match(/^([\d.,\s]+?)\s*(?:MZN|MT)?$/i)?.[1];
  const amount = amountRaw ? parseAmount(amountRaw) : null;
  const type = field(String.raw`Tipo de transac\S*`);
  const description = field(String.raw`Descri\S* da transac\S*`);
  const ref = field(String.raw`Ref\.`);
  if (!account || !date || !amount || !type) return null;
  const credit = /^cr[eé]dito/i.test(type);
  if (!credit && !/^d[eé]bito/i.test(type)) return null;

  return {
    source: "BIM",
    kind: credit ? "INCOME" : "EXPENSE",
    reference: `BIM:${account}:${date}:${amount}:${ref ?? ""}`,
    amount,
    date,
    accountNumber: account,
    description: description ? sentenceCase(description) : credit ? "Crédito na conta BIM" : "Débito na conta BIM",
    notes: field(String.raw`Opera\S*:`) ? `Operação: ${field(String.raw`Opera\S*:`)}` : undefined,
    raw: lines.filter((l) => /^(Data Valor|Montante|Tipo de|Descri|Ref\.|Opera)/i.test(l)).join("\n"),
  };
}
