import { documentPath } from "../../shared/docs/registry";
import { pageQuerySchema, pageSchema } from "../../shared/http/pagination";
import { idParamSchema, z } from "../../shared/http/schemas";
import { chatInputSchema, conversationDetailSchema, conversationSummarySchema, CONVERSATION_SORTS } from "./assistant.schemas";

const tag = "Assistente";

documentPath({
  method: "post",
  path: "/assistant/chat",
  tag,
  summary: "Pergunta ao assistente (resposta em Server-Sent Events)",
  description:
    "Resposta `text/event-stream` com os eventos `meta` {conversationId, mode: \"ai\"|\"offline\"}, `delta` {text} (vários), " +
    "`tool` {name, label} (quando consulta dados), `done` {messageId} ou `error` {message}. " +
    "Sem `conversationId` cria uma conversa (título = início da pergunta). Antes do stream: 403 com o parâmetro `assistant.enabled` desligado, " +
    "429 acima de `assistant.dailyLimit` mensagens por dia (0 = sem limite), 404 se a conversa não for sua, 422 de validação. " +
    "Sem ANTHROPIC_API_KEY no servidor, o modo é `offline` (responde a partir do manual e das FAQ). Respeita o X-Acting-As: o assistente só lê os dados dessa pessoa.",
  body: chatInputSchema,
  response: { schema: z.string().openapi({ description: "Stream SSE", example: 'event: delta\ndata: {"text":"Olá"}\n\n' }), description: "text/event-stream" },
});

documentPath({
  method: "get",
  path: "/assistant/conversations",
  tag,
  summary: "As suas conversas (paginado, mais recentes primeiro)",
  description: "Só as do utilizador efectivo iniciadas por quem tem a sessão. `search` no título.",
  query: pageQuerySchema(CONVERSATION_SORTS),
  response: { schema: pageSchema(conversationSummarySchema, "AssistantConversationPage") },
});

documentPath({
  method: "get",
  path: "/assistant/conversations/{id}",
  tag,
  summary: "Conversa com as mensagens",
  params: idParamSchema,
  response: { schema: conversationDetailSchema },
});

documentPath({ method: "delete", path: "/assistant/conversations/{id}", tag, summary: "Apaga uma conversa", params: idParamSchema });
