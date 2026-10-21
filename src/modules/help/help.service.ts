import type { Faq, HelpArticle, Prisma } from "../../generated/prisma";
import { prisma } from "../../shared/db/prisma";
import { NotFoundException, ValidationException } from "../../shared/errors/http-exceptions";
import { orderByOf, toPage, type Page, type PageRequest } from "../../shared/http/pagination";
import { appSettings } from "../../shared/settings/app-settings";
import type { ARTICLE_SORTS, ArticleInput, FAQ_SORTS, FaqInput, ReorderInput } from "./help.schemas";
import { normalize, scoreDocument, snippetOf, tokenize } from "./help.search";
import type { FaqResponse, HelpArticleResponse, HelpArticleSummary, HelpSearchItem, HelpSearchResult } from "./help.types";

export const toArticleSummary = (a: HelpArticle): HelpArticleSummary => ({
  id: a.id,
  slug: a.slug,
  title: a.title,
  summary: a.summary,
  category: a.category,
  order: a.order,
});

export const toArticleResponse = (a: HelpArticle): HelpArticleResponse => ({
  ...toArticleSummary(a),
  content: a.content,
  published: a.published,
  createdAt: a.createdAt.toISOString(),
  updatedAt: a.updatedAt.toISOString(),
});

export const toFaqResponse = (f: Faq): FaqResponse => ({
  id: f.id,
  question: f.question,
  answer: f.answer,
  category: f.category,
  order: f.order,
  published: f.published,
  createdAt: f.createdAt.toISOString(),
  updatedAt: f.updatedAt.toISOString(),
});

export const articleHref = (slug: string) => `/ajuda/${slug}`;
export const faqHref = (id: string) => `/ajuda#faq-${id}`;

/** "Orçamentos e metas!" → "orcamentos-e-metas". */
export function slugify(text: string): string {
  return (
    normalize(text)
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80)
      .replace(/-+$/g, "") || "artigo"
  );
}

const ARTICLE_ORDER: Prisma.HelpArticleOrderByWithRelationInput[] = [{ order: "asc" }, { title: "asc" }];
const FAQ_ORDER: Prisma.FaqOrderByWithRelationInput[] = [{ order: "asc" }, { question: "asc" }];

async function articleOrThrow(id: string): Promise<HelpArticle> {
  const article = await prisma.helpArticle.findUnique({ where: { id } });
  if (!article) throw new NotFoundException("O artigo");
  return article;
}

async function faqOrThrow(id: string): Promise<Faq> {
  const faq = await prisma.faq.findUnique({ where: { id } });
  if (!faq) throw new NotFoundException("A pergunta");
  return faq;
}

/** Slug pedido (validado como único) ou gerado do título, com sufixo se já existir. */
async function resolveSlug(input: ArticleInput, currentId?: string): Promise<string> {
  const taken = async (slug: string) => !!(await prisma.helpArticle.findFirst({ where: { slug, id: currentId ? { not: currentId } : undefined }, select: { id: true } }));
  if (input.slug) {
    if (await taken(input.slug)) throw ValidationException.field("slug", "Já existe um artigo com este endereço.");
    return input.slug;
  }
  const base = slugify(input.title);
  let slug = base;
  for (let i = 2; await taken(slug); i += 1) slug = `${base}-${i}`;
  return slug;
}

const nextOrder = async (model: "article" | "faq") => {
  const max =
    model === "article"
      ? (await prisma.helpArticle.aggregate({ _max: { order: true } }))._max.order
      : (await prisma.faq.aggregate({ _max: { order: true } }))._max.order;
  return (max ?? 0) + 10;
};

function adminWhere<W>(search: string | undefined, fields: string[], filters: { published?: boolean; category?: string }): W {
  const where: Record<string, unknown> = { published: filters.published };
  if (filters.category) where.category = { equals: filters.category, mode: "insensitive" };
  if (search) where.OR = fields.map((field) => ({ [field]: { contains: search, mode: "insensitive" } }));
  return where as W;
}

export const helpService = {
  // ---------- Leitura (qualquer utilizador com a funcionalidade HELP) ----------

  async publishedArticles(): Promise<HelpArticleSummary[]> {
    const articles = await prisma.helpArticle.findMany({ where: { published: true }, orderBy: ARTICLE_ORDER });
    return articles.map(toArticleSummary);
  },

  async publishedArticle(slug: string): Promise<HelpArticleResponse> {
    const article = await prisma.helpArticle.findFirst({ where: { slug: slug.toLowerCase(), published: true } });
    if (!article) throw new NotFoundException("O artigo");
    return toArticleResponse(article);
  },

  /** Vazio quando o parâmetro `help.showFaq` está desligado. */
  async publishedFaqs(): Promise<FaqResponse[]> {
    if (!(await appSettings.get("help.showFaq"))) return [];
    const faqs = await prisma.faq.findMany({ where: { published: true }, orderBy: FAQ_ORDER });
    return faqs.map(toFaqResponse);
  },

  /** Artigos completos publicados, pela ordem do manual (para o prompt do assistente). */
  async manual(): Promise<HelpArticle[]> {
    return prisma.helpArticle.findMany({ where: { published: true }, orderBy: ARTICLE_ORDER });
  },

  /**
   * Pesquisa por palavras (sem acentos nem maiúsculas) em artigos e FAQ publicados.
   * Pesos: título/pergunta 6, resumo 3, resposta 2, corpo 1 (com rendimento decrescente).
   */
  async search(query: string, limit = 8): Promise<HelpSearchResult> {
    const tokens = tokenize(query);
    if (!tokens.length) return { query, items: [] };
    const [articles, faqs] = await Promise.all([
      prisma.helpArticle.findMany({ where: { published: true }, orderBy: ARTICLE_ORDER }),
      appSettings.get("help.showFaq").then((show) => (show ? prisma.faq.findMany({ where: { published: true }, orderBy: FAQ_ORDER }) : [])),
    ]);

    const items: HelpSearchItem[] = [];
    for (const a of articles) {
      const score = scoreDocument(
        tokens,
        [
          { text: a.title, weight: 6 },
          { text: `${a.summary} ${a.category}`, weight: 3 },
          { text: a.content, weight: 1, repeat: true },
        ],
        query,
      );
      if (score > 0) {
        const inBody = tokens.some((t) => normalize(a.content).includes(t));
        items.push({
          kind: "article",
          id: a.id,
          slug: a.slug,
          title: a.title,
          category: a.category,
          snippet: inBody ? snippetOf(a.content, tokens) : a.summary,
          href: articleHref(a.slug),
          score,
        });
      }
    }
    for (const f of faqs) {
      const score = scoreDocument(
        tokens,
        [
          { text: f.question, weight: 6 },
          { text: f.category, weight: 2 },
          { text: f.answer, weight: 2, repeat: true },
        ],
        query,
      );
      if (score > 0) {
        items.push({ kind: "faq", id: f.id, title: f.question, category: f.category, snippet: snippetOf(f.answer, tokens), href: faqHref(f.id), score });
      }
    }
    items.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, "pt"));
    return { query, items: items.slice(0, limit) };
  },

  // ---------- Administração (ADMIN_HELP) ----------

  async listArticles(
    page: PageRequest<(typeof ARTICLE_SORTS)[number]>,
    filters: { published?: boolean; category?: string },
  ): Promise<Page<HelpArticleResponse>> {
    const where = adminWhere<Prisma.HelpArticleWhereInput>(page.search, ["title", "summary", "slug", "content", "category"], filters);
    const [items, total] = await Promise.all([
      prisma.helpArticle.findMany({ where, orderBy: orderByOf(page.sort, ARTICLE_ORDER), skip: page.skip, take: page.size }),
      prisma.helpArticle.count({ where }),
    ]);
    return toPage(items.map(toArticleResponse), total, page);
  },

  async getArticle(id: string): Promise<HelpArticleResponse> {
    return toArticleResponse(await articleOrThrow(id));
  },

  async createArticle(input: ArticleInput): Promise<HelpArticleResponse> {
    const slug = await resolveSlug(input);
    const order = input.order ?? (await nextOrder("article"));
    const article = await prisma.helpArticle.create({ data: { ...input, slug, order } });
    return toArticleResponse(article);
  },

  async updateArticle(id: string, input: ArticleInput): Promise<HelpArticleResponse> {
    const current = await articleOrThrow(id);
    const slug = input.slug ? await resolveSlug(input, id) : current.slug;
    const article = await prisma.helpArticle.update({ where: { id }, data: { ...input, slug, order: input.order ?? current.order } });
    return toArticleResponse(article);
  },

  async setArticlePublished(id: string, published: boolean): Promise<HelpArticleResponse> {
    await articleOrThrow(id);
    return toArticleResponse(await prisma.helpArticle.update({ where: { id }, data: { published } }));
  },

  async removeArticle(id: string): Promise<void> {
    await articleOrThrow(id);
    await prisma.helpArticle.delete({ where: { id } });
  },

  async reorderArticles(input: ReorderInput): Promise<HelpArticleSummary[]> {
    const ids = input.items.map((i) => i.id);
    const found = await prisma.helpArticle.count({ where: { id: { in: ids } } });
    if (found !== new Set(ids).size) throw ValidationException.field("items", "Há artigos que não existem.");
    await prisma.$transaction(input.items.map((i) => prisma.helpArticle.update({ where: { id: i.id }, data: { order: i.order } })));
    const all = await prisma.helpArticle.findMany({ orderBy: ARTICLE_ORDER });
    return all.map(toArticleSummary);
  },

  async listFaqs(page: PageRequest<(typeof FAQ_SORTS)[number]>, filters: { published?: boolean; category?: string }): Promise<Page<FaqResponse>> {
    const where = adminWhere<Prisma.FaqWhereInput>(page.search, ["question", "answer", "category"], filters);
    const [items, total] = await Promise.all([
      prisma.faq.findMany({ where, orderBy: orderByOf(page.sort, FAQ_ORDER), skip: page.skip, take: page.size }),
      prisma.faq.count({ where }),
    ]);
    return toPage(items.map(toFaqResponse), total, page);
  },

  async getFaq(id: string): Promise<FaqResponse> {
    return toFaqResponse(await faqOrThrow(id));
  },

  async createFaq(input: FaqInput): Promise<FaqResponse> {
    const order = input.order ?? (await nextOrder("faq"));
    return toFaqResponse(await prisma.faq.create({ data: { ...input, order } }));
  },

  async updateFaq(id: string, input: FaqInput): Promise<FaqResponse> {
    const current = await faqOrThrow(id);
    return toFaqResponse(await prisma.faq.update({ where: { id }, data: { ...input, order: input.order ?? current.order } }));
  },

  async setFaqPublished(id: string, published: boolean): Promise<FaqResponse> {
    await faqOrThrow(id);
    return toFaqResponse(await prisma.faq.update({ where: { id }, data: { published } }));
  },

  async removeFaq(id: string): Promise<void> {
    await faqOrThrow(id);
    await prisma.faq.delete({ where: { id } });
  },

  async reorderFaqs(input: ReorderInput): Promise<FaqResponse[]> {
    const ids = input.items.map((i) => i.id);
    const found = await prisma.faq.count({ where: { id: { in: ids } } });
    if (found !== new Set(ids).size) throw ValidationException.field("items", "Há perguntas que não existem.");
    await prisma.$transaction(input.items.map((i) => prisma.faq.update({ where: { id: i.id }, data: { order: i.order } })));
    const all = await prisma.faq.findMany({ orderBy: FAQ_ORDER });
    return all.map(toFaqResponse);
  },
};
