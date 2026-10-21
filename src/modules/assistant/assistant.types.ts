export type ChatMode = "ai" | "offline";

export interface ConversationSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  createdAt: string;
}

export interface ConversationDetail extends ConversationSummary {
  messages: ConversationMessage[];
}

/** Eventos SSE de POST /assistant/chat. */
export interface ChatEvents {
  meta: { conversationId: string; mode: ChatMode };
  delta: { text: string };
  tool: { name: string; label: string };
  done: { messageId: string };
  error: { message: string };
}
