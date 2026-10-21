import Anthropic from "@anthropic-ai/sdk";
import { ASSISTANT_TOOLS, executeTool, isToolName, TOOL_LABELS, type ToolContext } from "./assistant.tools";

/**
 * Ciclo manual com streaming (client.messages.stream + finalMessage), como na documentação do SDK:
 * os deltas de texto seguem para o SSE; em `tool_use` corre as ferramentas (validadas com zod) e
 * devolve todos os resultados numa única mensagem do utilizador; trata `pause_turn`, `max_tokens` e `refusal`.
 *
 * O cliente é injectado (`createAssistantRunner({ client })`) para os testes usarem um falso.
 */

/** O que o ciclo usa de `MessageStream`. */
export interface AssistantStream {
  on(event: "text", listener: (delta: string) => void): unknown;
  finalMessage(): Promise<Anthropic.Message>;
}

/** O que o ciclo usa do cliente Anthropic (o real satisfaz esta interface). */
export interface AssistantClient {
  messages: {
    stream(params: Anthropic.MessageStreamParams, options?: { signal?: AbortSignal }): AssistantStream;
  };
}

export type Effort = "low" | "medium" | "high";

export interface RunParams {
  model: string;
  effort: Effort;
  system: Anthropic.TextBlockParam[];
  /** Histórico já com a pergunta nova no fim. */
  messages: Anthropic.MessageParam[];
  context: ToolContext;
  onText: (delta: string) => void;
  onTool: (name: string, label: string) => void;
  signal?: AbortSignal;
  maxTokens?: number;
}

export interface RunResult {
  /** Todo o texto mostrado ao utilizador. */
  text: string;
  /** Turnos gerados nesta resposta (assistant/tool_result…), para guardar e reconstruir o histórico. */
  turns: Anthropic.MessageParam[];
  stopReason: Anthropic.StopReason | null;
  /** true quando terminou normalmente (end_turn) e os turnos podem voltar a ser enviados. */
  complete: boolean;
}

/** Limite de idas e voltas com ferramentas numa só resposta. */
const MAX_ITERATIONS = 8;

export const REFUSAL_TEXT = "Não posso ajudar com esse pedido. Posso explicar como usar a aplicação ou analisar as suas finanças.";
const TRUNCATED_TEXT = "\n\n_(A resposta ficou incompleta por ser demasiado longa. Faça uma pergunta mais específica.)_";
const TOO_MANY_STEPS = "\n\n_(Não consegui concluir a análise. Tente uma pergunta mais simples.)_";

export function createAssistantRunner({ client }: { client: AssistantClient }) {
  return {
    async run(params: RunParams): Promise<RunResult> {
      const conversation: Anthropic.MessageParam[] = [...params.messages];
      const turns: Anthropic.MessageParam[] = [];
      let text = "";
      let stopReason: Anthropic.StopReason | null = null;

      const emit = (delta: string) => {
        if (!delta) return;
        text += delta;
        params.onText(delta);
      };

      for (let iteration = 0; iteration < MAX_ITERATIONS; iteration += 1) {
        const stream = client.messages.stream(
          {
            model: params.model,
            max_tokens: params.maxTokens ?? 4000,
            // Sem `thinking`: no claude-opus-5-5 o raciocínio é adaptativo e controla-se pelo effort
            output_config: { effort: params.effort },
            system: params.system,
            tools: ASSISTANT_TOOLS,
            messages: conversation,
          },
          { signal: params.signal },
        );

        // Texto de turnos anteriores (antes de uma ferramenta) fica separado do seguinte
        let first = true;
        stream.on("text", (delta) => {
          if (first && text && !text.endsWith("\n")) emit("\n\n");
          first = false;
          emit(delta);
        });

        const message = await stream.finalMessage();
        stopReason = message.stop_reason;

        if (message.stop_reason === "end_turn" || message.stop_reason === "stop_sequence") {
          turns.push({ role: "assistant", content: message.content });
          return { text, turns, stopReason, complete: true };
        }

        // Uma recusa pode cortar um tool_use a meio: nunca correr as ferramentas desse turno
        if (message.stop_reason === "refusal") {
          emit(text ? `\n\n${REFUSAL_TEXT}` : REFUSAL_TEXT);
          return { text, turns: [], stopReason, complete: false };
        }

        if (message.stop_reason === "pause_turn") {
          conversation.push({ role: "assistant", content: message.content });
          turns.push({ role: "assistant", content: message.content });
          continue;
        }

        const toolUses = message.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");

        // Entrada de ferramenta truncada pode parecer válida: não correr
        if (message.stop_reason === "max_tokens" || toolUses.length === 0) {
          if (message.stop_reason === "max_tokens") emit(TRUNCATED_TEXT);
          return { text, turns: [], stopReason, complete: false };
        }

        conversation.push({ role: "assistant", content: message.content });
        turns.push({ role: "assistant", content: message.content });

        const results: Anthropic.ToolResultBlockParam[] = [];
        for (const use of toolUses) {
          if (isToolName(use.name)) params.onTool(use.name, TOOL_LABELS[use.name]);
          const outcome = await executeTool(use.name, use.input, params.context);
          results.push({ type: "tool_result", tool_use_id: use.id, content: outcome.content, ...(outcome.isError ? { is_error: true } : {}) });
        }
        const toolTurn: Anthropic.MessageParam = { role: "user", content: results };
        conversation.push(toolTurn);
        turns.push(toolTurn);
      }

      emit(TOO_MANY_STEPS);
      return { text, turns: [], stopReason, complete: false };
    },
  };
}

let defaultClient: Anthropic | null = null;

/** Cliente real; lê ANTHROPIC_API_KEY do ambiente (nunca registada nem escrita no código). */
export function anthropicClient(): Anthropic {
  defaultClient ??= new Anthropic();
  return defaultClient;
}

/** Mensagem amigável (pt-PT) para os erros tipados do SDK. */
export function friendlyError(error: unknown): string {
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError)
    return "O assistente não está bem configurado (chave da API inválida). Contacte o administrador.";
  if (error instanceof Anthropic.RateLimitError) return "O assistente está a receber muitos pedidos. Tente novamente dentro de instantes.";
  if (error instanceof Anthropic.APIConnectionError) return "Não foi possível contactar o serviço do assistente. Verifique a ligação e tente novamente.";
  if (error instanceof Anthropic.InternalServerError) return "O serviço do assistente está sobrecarregado ou indisponível. Tente novamente dentro de instantes.";
  if (error instanceof Anthropic.BadRequestError) return "O pedido ao assistente foi recusado. Experimente começar uma conversa nova.";
  if (error instanceof Anthropic.APIError) return "O serviço do assistente devolveu um erro. Tente novamente.";
  return "Ocorreu um erro inesperado no assistente. Tente novamente.";
}

export const isAbort = (error: unknown) => error instanceof Anthropic.APIUserAbortError || (error instanceof Error && error.name === "AbortError");
