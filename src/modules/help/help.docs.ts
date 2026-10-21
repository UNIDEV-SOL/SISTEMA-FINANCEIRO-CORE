import { documentPath } from "../../shared/docs/registry";
import { pageQuerySchema, pageSchema } from "../../shared/http/pagination";
import { idParamSchema, z } from "../../shared/http/schemas";
import {
  ARTICLE_SORTS,
  articleInputSchema,
  articleSchema,
  articleSummarySchema,
  FAQ_SORTS,
  faqInputSchema,
  faqSchema,
  helpFiltersSchema,
  publishedInputSchema,
  reorderInputSchema,
  searchQuerySchema,
  searchResultSchema,
  slugParamSchema,
} from "./help.schemas";

const tag = "Ajuda";
const admin = "Administração — manual e FAQ";

documentPath({
  method: "get",
  path: "/help/articles",
  tag,
  summary: "Índice do manual (artigos publicados, sem o conteúdo)",
  description: "Pela ordem definida no painel; o front agrupa por `category`.",
  response: { schema: z.array(articleSummarySchema) },
});

documentPath({
  method: "get",
  path: "/help/articles/{slug}",
  tag,
  summary: "Artigo publicado completo (markdown)",
  params: slugParamSchema,
  response: { schema: articleSchema },
});

documentPath({
  method: "get",
  path: "/help/faqs",
  tag,
  summary: "Perguntas frequentes publicadas",
  description: "Lista vazia quando o parâmetro `help.showFaq` está desligado.",
  response: { schema: z.array(faqSchema) },
});

documentPath({
  method: "get",
  path: "/help/search",
  tag,
  summary: "Pesquisa no manual e nas FAQ",
  description:
    "Por palavras, sem acentos nem maiúsculas (ignora palavras como \"como\", \"de\", \"o\"). Ordenado por relevância: " +
    "título/pergunta pesam mais do que o resumo e o corpo. `limit` 1–20 (8 por omissão).",
  query: searchQuerySchema,
  response: { schema: searchResultSchema },
});

const articleQuery = pageQuerySchema(ARTICLE_SORTS).extend(helpFiltersSchema.shape);
const faqQuery = pageQuerySchema(FAQ_SORTS).extend(helpFiltersSchema.shape);

documentPath({
  method: "get",
  path: "/admin/help/articles",
  tag: admin,
  summary: "Lista os artigos (paginado, inclui não publicados)",
  description: "`search` no título, resumo, endereço, conteúdo e categoria; filtros `published` e `category`. Por omissão, pela ordem.",
  query: articleQuery,
  response: { schema: pageSchema(articleSchema, "HelpArticlePage") },
});
documentPath({ method: "get", path: "/admin/help/articles/{id}", tag: admin, summary: "Artigo (qualquer estado)", params: idParamSchema, response: { schema: articleSchema } });
documentPath({
  method: "post",
  path: "/admin/help/articles",
  tag: admin,
  summary: "Cria um artigo",
  description: "Sem `slug`, é gerado do título (com sufixo se já existir); sem `order`, fica no fim.",
  body: articleInputSchema,
  response: { status: 201, schema: articleSchema },
});
documentPath({
  method: "put",
  path: "/admin/help/articles/order",
  tag: admin,
  summary: "Reordena artigos",
  body: reorderInputSchema,
  response: { schema: z.array(articleSummarySchema) },
});
documentPath({
  method: "put",
  path: "/admin/help/articles/{id}",
  tag: admin,
  summary: "Actualiza um artigo",
  description: "Sem `slug` mantém o actual; sem `order` mantém a ordem.",
  params: idParamSchema,
  body: articleInputSchema,
  response: { schema: articleSchema },
});
documentPath({
  method: "patch",
  path: "/admin/help/articles/{id}/published",
  tag: admin,
  summary: "Publica ou retira um artigo",
  params: idParamSchema,
  body: publishedInputSchema,
  response: { schema: articleSchema },
});
documentPath({ method: "delete", path: "/admin/help/articles/{id}", tag: admin, summary: "Apaga um artigo", params: idParamSchema });

documentPath({
  method: "get",
  path: "/admin/help/faqs",
  tag: admin,
  summary: "Lista as perguntas frequentes (paginado, inclui não publicadas)",
  description: "`search` na pergunta, resposta e categoria; filtros `published` e `category`.",
  query: faqQuery,
  response: { schema: pageSchema(faqSchema, "FaqPage") },
});
documentPath({ method: "get", path: "/admin/help/faqs/{id}", tag: admin, summary: "Pergunta frequente", params: idParamSchema, response: { schema: faqSchema } });
documentPath({ method: "post", path: "/admin/help/faqs", tag: admin, summary: "Cria uma pergunta frequente", body: faqInputSchema, response: { status: 201, schema: faqSchema } });
documentPath({ method: "put", path: "/admin/help/faqs/order", tag: admin, summary: "Reordena perguntas", body: reorderInputSchema, response: { schema: z.array(faqSchema) } });
documentPath({ method: "put", path: "/admin/help/faqs/{id}", tag: admin, summary: "Actualiza uma pergunta frequente", params: idParamSchema, body: faqInputSchema, response: { schema: faqSchema } });
documentPath({
  method: "patch",
  path: "/admin/help/faqs/{id}/published",
  tag: admin,
  summary: "Publica ou retira uma pergunta",
  params: idParamSchema,
  body: publishedInputSchema,
  response: { schema: faqSchema },
});
documentPath({ method: "delete", path: "/admin/help/faqs/{id}", tag: admin, summary: "Apaga uma pergunta frequente", params: idParamSchema });
