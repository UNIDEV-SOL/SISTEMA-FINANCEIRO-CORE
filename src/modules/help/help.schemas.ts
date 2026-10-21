import { queryBoolean, requiredText, z } from "../../shared/http/schemas";

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const slugSchema = z
  .string({ error: "Endereço inválido." })
  .trim()
  .toLowerCase()
  .max(80, { message: "Máximo de 80 caracteres." })
  .regex(SLUG, { message: "Use só letras minúsculas, números e hífenes (ex.: primeiros-passos)." })
  .openapi({ example: "orcamentos" });

export const slugParamSchema = z.object({ slug: z.string().max(120).openapi({ example: "orcamentos" }) });

const orderSchema = z
  .number({ error: "Ordem inválida." })
  .int({ message: "Ordem inválida." })
  .min(0, { message: "Ordem inválida." })
  .max(100_000, { message: "Ordem inválida." });

const markdownSchema = (message: string) =>
  z
    .string({ error: message })
    .trim()
    .min(1, { message })
    .max(100_000, { message: "Texto demasiado longo (máximo de 100 000 caracteres)." });

export const articleInputSchema = z
  .object({
    slug: slugSchema.optional().openapi({ description: "Gerado a partir do título se omitido." }),
    title: requiredText("Indique o título.", 160),
    summary: requiredText("Indique um resumo.", 400),
    content: markdownSchema("Escreva o conteúdo do artigo.").openapi({ description: "Markdown." }),
    category: requiredText("Indique a categoria.", 80),
    order: orderSchema.optional().openapi({ description: "Sem ordem, fica no fim." }),
    published: z.boolean({ error: "Valor inválido." }).optional().default(true),
  })
  .openapi("HelpArticleInput");

export const faqInputSchema = z
  .object({
    question: requiredText("Indique a pergunta.", 300),
    answer: markdownSchema("Escreva a resposta.").openapi({ description: "Markdown." }),
    category: requiredText("Indique a categoria.", 80),
    order: orderSchema.optional().openapi({ description: "Sem ordem, fica no fim." }),
    published: z.boolean({ error: "Valor inválido." }).optional().default(true),
  })
  .openapi("FaqInput");

export const publishedInputSchema = z.object({ published: z.boolean({ error: "Indique true ou false." }) }).openapi("PublishedInput");

export const reorderInputSchema = z
  .object({
    items: z
      .array(z.object({ id: z.uuid({ message: "Identificador inválido." }), order: orderSchema }), { error: "Lista inválida." })
      .min(1, { message: "Indique pelo menos um item." })
      .max(1000),
  })
  .openapi("HelpReorderInput");

export type ArticleInput = z.infer<typeof articleInputSchema>;
export type FaqInput = z.infer<typeof faqInputSchema>;
export type ReorderInput = z.infer<typeof reorderInputSchema>;

export const ARTICLE_SORTS = ["order", "title", "category", "updatedAt", "createdAt"] as const;
export const FAQ_SORTS = ["order", "question", "category", "updatedAt", "createdAt"] as const;

export const helpFiltersSchema = z.object({
  published: queryBoolean().optional(),
  category: z.string().trim().max(80).optional(),
});

export const searchQuerySchema = z.object({
  q: z.string({ error: "Indique o que procura." }).trim().max(200, { message: "Máximo de 200 caracteres." }).default("").openapi({ example: "orçamento" }),
  limit: z.coerce.number().int().min(1).max(20).default(8).openapi({ example: 8 }),
});

export const articleSummarySchema = z
  .object({
    id: z.uuid(),
    slug: z.string().openapi({ example: "orcamentos" }),
    title: z.string().openapi({ example: "Orçamentos" }),
    summary: z.string(),
    category: z.string().openapi({ example: "Planeamento" }),
    order: z.number().int(),
  })
  .openapi("HelpArticleSummary");

export const articleSchema = articleSummarySchema
  .extend({
    content: z.string().openapi({ description: "Markdown." }),
    published: z.boolean(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("HelpArticle");

export const faqSchema = z
  .object({
    id: z.uuid(),
    question: z.string().openapi({ example: "Porque é que o saldo não mudou?" }),
    answer: z.string().openapi({ description: "Markdown." }),
    category: z.string(),
    order: z.number().int(),
    published: z.boolean(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("Faq");

export const searchResultSchema = z
  .object({
    query: z.string(),
    items: z.array(
      z.object({
        kind: z.enum(["article", "faq"]),
        id: z.uuid(),
        slug: z.string().optional().openapi({ description: "Só nos artigos." }),
        title: z.string().openapi({ description: "Título do artigo ou a pergunta." }),
        category: z.string(),
        snippet: z.string().openapi({ description: "Excerto em texto simples." }),
        href: z.string().openapi({ example: "/ajuda/orcamentos" }),
        score: z.number(),
      }),
    ),
  })
  .openapi("HelpSearchResult");
