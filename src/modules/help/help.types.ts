export interface HelpArticleSummary {
  id: string;
  slug: string;
  title: string;
  summary: string;
  category: string;
  order: number;
}

export interface HelpArticleResponse extends HelpArticleSummary {
  /** Markdown. */
  content: string;
  published: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface FaqResponse {
  id: string;
  question: string;
  /** Markdown. */
  answer: string;
  category: string;
  order: number;
  published: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface HelpSearchItem {
  kind: "article" | "faq";
  id: string;
  /** Só nos artigos. */
  slug?: string;
  /** Título do artigo ou a pergunta. */
  title: string;
  category: string;
  /** Excerto em texto simples. */
  snippet: string;
  /** Página do front: `/ajuda/<slug>` ou `/ajuda#faq-<id>`. */
  href: string;
  score: number;
}

export interface HelpSearchResult {
  query: string;
  items: HelpSearchItem[];
}
