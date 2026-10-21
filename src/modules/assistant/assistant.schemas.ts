import { z } from "../../shared/http/schemas";

export const chatInputSchema = z
  .object({
    conversationId: z.uuid({ message: "Conversa inválida." }).optional().nullable().transform((v) => v ?? undefined),
    message: z
      .string({ error: "Escreva a sua pergunta." })
      .trim()
      .min(1, { message: "Escreva a sua pergunta." })
      .max(4000, { message: "Máximo de 4000 caracteres." })
      .openapi({ example: "Quanto gastei em supermercado este mês?" }),
  })
  .openapi("AssistantChatInput");

export type ChatInput = z.infer<typeof chatInputSchema>;

export const CONVERSATION_SORTS = ["updatedAt", "createdAt", "title"] as const;

export const conversationSummarySchema = z
  .object({
    id: z.uuid(),
    title: z.string().openapi({ example: "Quanto gastei em supermercado este mês?" }),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("AssistantConversation");

export const conversationDetailSchema = z
  .object({
    id: z.uuid(),
    title: z.string(),
    createdAt: z.string(),
    updatedAt: z.string(),
    messages: z.array(
      z.object({
        id: z.uuid(),
        role: z.enum(["user", "assistant"]),
        text: z.string().openapi({ description: "Markdown nas respostas do assistente." }),
        createdAt: z.string(),
      }),
    ),
  })
  .openapi("AssistantConversationDetail");
