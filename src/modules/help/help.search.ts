/**
 * Pesquisa simples no manual e nas perguntas frequentes: sem acentos, sem maiúsculas,
 * por palavras, com pesos por campo. O conteúdo é pequeno (dezenas de documentos), por isso
 * corre em memória sobre o que vem da base de dados.
 */

const STOPWORDS = new Set(
  (
    "a o as os um uma uns umas de do da dos das d e ou em no na nos nas num numa por pelo pela pelos pelas para pra " +
    "com sem que se ao aos à às é ser sao são foi esta este isto isso esse essa aquele aquela ja já nao não sim mais " +
    "menos muito muita como onde quando qual quais quanto quanta quantos quantas porque porquê eu tu ele ela nós vos " +
    "me te lhe meu minha meus minhas seu sua seus suas tem ter tenho há ha posso pode podem fazer faço faz consigo " +
    "quero queria gostaria saber ver app aplicacao aplicação the ola olá bom boa tarde noite obrigado obrigada"
  )
    .split(/\s+/)
    .map((w) => normalize(w)),
);

/** Minúsculas e sem acentos ("Orçamento" → "orcamento"). */
export function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

const SUFFIX = /(ando|endo|indo|ado|ada|ido|ida|ar|er|ir|ei|ou|am|em|o|a|e)$/;

/**
 * Radical simples, para "arquivo"/"arquivar"/"arquivada" ou "orçamento"/"orçamentos" se encontrarem:
 * tira o plural e, em palavras compridas, a terminação verbal ou a vogal final (procura-se por "contém").
 */
function stem(word: string): string {
  let w = word.length > 4 && word.endsWith("s") ? word.slice(0, -1) : word;
  if (w.length >= 6) {
    const cut = w.replace(SUFFIX, "");
    if (cut.length >= 4) w = cut;
  } else if (/^[a-z]{4,5}$/.test(w) && /(ar|er|ir|o)$/.test(w)) {
    // Verbos curtos: "crio"/"criar", "uso"/"usar" encontram-se pelo radical de 3+ letras
    const cut = w.replace(/(ar|er|ir|o)$/, "");
    if (cut.length >= 3) w = cut;
  }
  return w;
}

/** Palavras relevantes da pergunta, normalizadas e sem repetições. */
export function tokenize(query: string): string[] {
  const words = normalize(query)
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 2 && !STOPWORDS.has(w))
    .map(stem);
  return [...new Set(words)];
}

/** Markdown em texto corrido (para excertos). */
export function plainText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/^\s*([-*+]|\d+\.)\s+/gm, "")
    .replace(/[*_`|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const count = (haystack: string, needle: string) => {
  let n = 0;
  let i = haystack.indexOf(needle);
  while (i !== -1 && n < 20) {
    n += 1;
    i = haystack.indexOf(needle, i + needle.length);
  }
  return n;
};

export interface SearchField {
  text: string;
  /** Peso de cada ocorrência (os títulos valem mais do que o corpo). */
  weight: number;
  /** Conta ocorrências (corpo) ou só presença (títulos). */
  repeat?: boolean;
}

/**
 * Pontuação de um documento: soma, por palavra, dos pesos dos campos onde aparece
 * (as repetições no corpo contam com rendimento decrescente), mais bónus quando todas as
 * palavras aparecem e quando a frase inteira aparece no primeiro campo (título/pergunta).
 */
export function scoreDocument(tokens: string[], fields: SearchField[], phrase?: string): number {
  if (!tokens.length) return 0;
  const normalized = fields.map((f) => ({ ...f, text: normalize(f.text) }));
  let score = 0;
  let matched = 0;
  for (const token of tokens) {
    let tokenScore = 0;
    for (const field of normalized) {
      const n = count(field.text, token);
      if (!n) continue;
      tokenScore += field.repeat ? field.weight * (1 + Math.log2(n)) : field.weight;
    }
    if (tokenScore > 0) matched += 1;
    score += tokenScore;
  }
  if (!matched) return 0;
  score *= matched / tokens.length;
  if (matched === tokens.length && tokens.length > 1) score += 3;
  if (phrase && phrase.length > 3 && normalized[0]?.text.includes(normalize(phrase))) score += 6;
  return Math.round(score * 100) / 100;
}

/** Todas as posições (até 50) de uma palavra no texto normalizado. */
function positionsOf(norm: string, token: string): number[] {
  const out: number[] = [];
  for (let i = norm.indexOf(token); i !== -1 && out.length < 50; i = norm.indexOf(token, i + token.length)) out.push(i);
  return out;
}

/**
 * Excerto (~`size` caracteres) na zona com mais palavras diferentes da pesquisa
 * (desempate: a primeira); sem correspondência, o início.
 */
export function snippetOf(text: string, tokens: string[], size = 180): string {
  const plain = plainText(text);
  if (plain.length <= size) return plain;
  const norm = normalize(plain);
  const byToken = tokens.map((t) => positionsOf(norm, t));
  let at = 0;
  let bestCount = 0;
  for (const p of byToken.flat().sort((a, b) => a - b)) {
    const count = byToken.filter((list) => list.some((q) => q >= p && q < p + size * 0.6)).length;
    if (count > bestCount) {
      bestCount = count;
      at = p;
    }
  }
  let start = Math.max(0, at - Math.floor(size / 3));
  // Começa no início de uma palavra
  if (start > 0) {
    const space = plain.indexOf(" ", start);
    start = space > -1 && space < at ? space + 1 : start;
  }
  let end = Math.min(plain.length, start + size);
  if (end < plain.length) {
    const space = plain.lastIndexOf(" ", end);
    if (space > start) end = space;
  }
  return `${start > 0 ? "…" : ""}${plain.slice(start, end).trim()}${end < plain.length ? "…" : ""}`;
}

/** Secções "## …" de um artigo em markdown (o texto antes da primeira fica como introdução). */
export function sectionsOf(markdown: string): { heading: string | null; body: string }[] {
  const sections: { heading: string | null; body: string }[] = [];
  let current: { heading: string | null; lines: string[] } = { heading: null, lines: [] };
  for (const line of markdown.split("\n")) {
    const match = /^##\s+(.+)$/.exec(line);
    if (match) {
      sections.push({ heading: current.heading, body: current.lines.join("\n").trim() });
      current = { heading: match[1].trim(), lines: [] };
    } else {
      current.lines.push(line);
    }
  }
  sections.push({ heading: current.heading, body: current.lines.join("\n").trim() });
  return sections.filter((s) => s.body || s.heading);
}

/** A secção do artigo que melhor responde às palavras (para o assistente offline). */
export function bestSection(markdown: string, tokens: string[]): { heading: string | null; body: string } | null {
  let best: { heading: string | null; body: string; score: number } | null = null;
  for (const section of sectionsOf(markdown)) {
    if (!section.body) continue;
    const score = scoreDocument(tokens, [
      { text: section.heading ?? "", weight: 4 },
      { text: section.body, weight: 1, repeat: true },
    ]);
    if (score > 0 && (!best || score > best.score)) best = { ...section, score };
  }
  return best && { heading: best.heading, body: best.body };
}
