import fs from "node:fs";
import path from "node:path";
import { prisma } from "../shared/db/prisma";

/**
 * Manual de utilizador e perguntas frequentes em `content/` (markdown no repositório):
 * - `content/manual/*.md` — um artigo por ficheiro, com front-matter `slug`, `title`, `summary`, `category`, `order`;
 * - `content/faq.md` — secções `## Pergunta?` seguidas de `<!-- key: …; category: … -->` e da resposta.
 *
 * O seed só cria o que falta (pela chave `seedKey`): nunca sobrescreve o que foi editado no painel.
 * Para retirar um artigo do seed sem que volte a aparecer, despublique-o em vez de o apagar.
 */
export const CONTENT_DIR = path.resolve(__dirname, "..", "..", "content");

export interface ManualArticleSeed {
  seedKey: string;
  slug: string;
  title: string;
  summary: string;
  category: string;
  order: number;
  content: string;
}

export interface FaqSeed {
  seedKey: string;
  question: string;
  answer: string;
  category: string;
  order: number;
}

function parseFrontMatter(raw: string, file: string): { data: Record<string, string>; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw);
  if (!match) throw new Error(`Front-matter em falta em ${file}`);
  const data: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const kv = /^([a-zA-Z]+):\s*(.*)$/.exec(line);
    if (kv) data[kv[1]] = kv[2].trim().replace(/^"(.*)"$/, "$1");
  }
  return { data, body: match[2].trim() };
}

export function loadManual(dir = path.join(CONTENT_DIR, "manual")): ManualArticleSeed[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .map((file) => {
      const { data, body } = parseFrontMatter(fs.readFileSync(path.join(dir, file), "utf8"), file);
      for (const key of ["slug", "title", "summary", "category"]) if (!data[key]) throw new Error(`"${key}" em falta em ${file}`);
      return {
        seedKey: `manual/${file.replace(/\.md$/, "")}`,
        slug: data.slug,
        title: data.title,
        summary: data.summary,
        category: data.category,
        order: Number(data.order ?? 0),
        content: body,
      };
    });
}

export function loadFaqs(file = path.join(CONTENT_DIR, "faq.md")): FaqSeed[] {
  if (!fs.existsSync(file)) return [];
  const raw = fs.readFileSync(file, "utf8");
  return raw
    .split(/^##\s+/m)
    .slice(1)
    .map((block, i) => {
      const [first, ...rest] = block.split("\n");
      const text = rest.join("\n");
      const meta = /<!--\s*key:\s*([a-z0-9-]+)\s*;\s*category:\s*([^>]+?)\s*-->/.exec(text);
      if (!meta) throw new Error(`Pergunta sem <!-- key: …; category: … --> em faq.md: ${first}`);
      return {
        seedKey: `faq/${meta[1]}`,
        question: first.trim(),
        answer: text.replace(meta[0], "").trim(),
        category: meta[2].trim(),
        order: (i + 1) * 10,
      };
    });
}

let cached: { manual: ManualArticleSeed[]; faqs: FaqSeed[] } | null = null;

/** Cria os artigos e perguntas que faltam (idempotente). */
export async function seedHelpContent() {
  cached ??= { manual: loadManual(), faqs: loadFaqs() };
  const { manual, faqs } = cached;

  // Um slug já usado por um artigo criado no painel não é duplicado
  const existingSlugs = new Set((await prisma.helpArticle.findMany({ select: { slug: true, seedKey: true } })).filter((a) => !a.seedKey).map((a) => a.slug));
  await prisma.helpArticle.createMany({
    data: manual.filter((a) => !existingSlugs.has(a.slug)).map((a) => ({ ...a, published: true })),
    skipDuplicates: true,
  });
  await prisma.faq.createMany({ data: faqs.map((f) => ({ ...f, published: true })), skipDuplicates: true });
}
