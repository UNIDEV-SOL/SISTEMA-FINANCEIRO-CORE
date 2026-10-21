import type { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { env } from "../../config/env";
import { currentActor } from "../../shared/middleware/authenticate";
import { parsePage } from "../../shared/http/pagination";
import { idParamSchema } from "../../shared/http/schemas";
import { logger } from "../../shared/logger";
import { appSettings } from "../../shared/settings/app-settings";
import { chunksOf, offlineAnswer } from "./assistant.offline";
import { contextPrompt, stableSystemPrompt, systemBlocks } from "./assistant.prompt";
import { anthropicClient, createAssistantRunner, friendlyError, isAbort, type AssistantClient, type Effort } from "./assistant.runner";
import { chatInputSchema, CONVERSATION_SORTS } from "./assistant.schemas";
import { assistantService, type Owner } from "./assistant.service";
import { openSse } from "./assistant.sse";
import type { ChatMode } from "./assistant.types";

/** Pontos de substituição para os testes (cliente falso, modo IA sem chave real). */
export const assistantRuntime = {
  hasApiKey: (): boolean => !!env.ANTHROPIC_API_KEY,
  client: (): AssistantClient => anthropicClient(),
  /** Pausa entre pedaços da resposta offline (0 nos testes). */
  offlineDelayMs: env.NODE_ENV === "test" ? 0 : 12,
};

const EFFORTS: Effort[] = ["low", "medium", "high"];

function ownerOf(req: Request): Owner {
  const user = currentActor(req);
  return { userId: user.id, actorId: user.actorId };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const assistantController = {
  async list(req: Request, res: Response) {
    const page = await parsePage(req.query, CONVERSATION_SORTS);
    res.json(await assistantService.list(ownerOf(req), page));
  },

  async get(req: Request, res: Response) {
    const { id } = idParamSchema.parse(req.params);
    res.json(await assistantService.get(ownerOf(req), id));
  },

  async remove(req: Request, res: Response) {
    const { id } = idParamSchema.parse(req.params);
    await assistantService.remove(ownerOf(req), id);
    res.status(StatusCodes.NO_CONTENT).end();
  },

  /**
   * POST /assistant/chat → text/event-stream: meta, delta…, tool…, done | error.
   * Validação, 403 (desligado), 429 (limite diário) e 404 (conversa) saem como problem+json antes do stream.
   */
  async chat(req: Request, res: Response) {
    const input = chatInputSchema.parse(req.body);
    const user = currentActor(req);
    const owner = ownerOf(req);
    await assistantService.assertCanChat(owner.userId);
    const conversation = await assistantService.open(owner, input.conversationId, input.message);
    await assistantService.addUserMessage(conversation.id, user.actorId, input.message);

    const mode: ChatMode = assistantRuntime.hasApiKey() ? "ai" : "offline";
    const sse = openSse(res);
    const abort = new AbortController();
    // Cliente fechou a ligação antes do fim: pára o pedido ao modelo
    res.on("close", () => {
      if (!res.writableEnded) abort.abort();
    });
    sse.send("meta", { conversationId: conversation.id, mode });

    let text = "";
    try {
      if (mode === "offline") {
        text = await offlineAnswer(input.message);
        for (const chunk of chunksOf(text)) {
          if (abort.signal.aborted) break;
          sse.send("delta", { text: chunk });
          if (assistantRuntime.offlineDelayMs) await sleep(assistantRuntime.offlineDelayMs);
        }
        const saved = await assistantService.addAssistantMessage(conversation.id, text);
        sse.send("done", { messageId: saved.id });
        return;
      }

      const [history, stable, context, settings] = await Promise.all([
        assistantService.history(conversation.id),
        stableSystemPrompt(),
        contextPrompt({ id: user.id, actor: user.actingAs ? { name: user.actorName, access: user.actingAs.access } : undefined }),
        appSettings.many("assistant.model", "assistant.effort"),
      ]);
      const effort = EFFORTS.includes(settings["assistant.effort"] as Effort) ? (settings["assistant.effort"] as Effort) : "low";
      const runner = createAssistantRunner({ client: assistantRuntime.client() });
      const result = await runner.run({
        model: settings["assistant.model"],
        effort,
        system: systemBlocks(stable, context.text),
        messages: history,
        context: { userId: user.id, currency: context.currency },
        signal: abort.signal,
        onText: (delta) => {
          text += delta;
          sse.send("delta", { text: delta });
        },
        onTool: (name, label) => sse.send("tool", { name, label }),
      });
      const saved = await assistantService.addAssistantMessage(conversation.id, result.text, result.complete ? result.turns : undefined);
      sse.send("done", { messageId: saved.id });
    } catch (error) {
      if (isAbort(error) || abort.signal.aborted) {
        // Guarda o que já tinha sido escrito, para a conversa não ficar sem resposta
        if (text.trim()) await assistantService.addAssistantMessage(conversation.id, text).catch(() => undefined);
        return;
      }
      logger.error("Falha no assistente", { conversationId: conversation.id, mode, error: error instanceof Error ? error.message : String(error) });
      if (text.trim()) await assistantService.addAssistantMessage(conversation.id, text).catch(() => undefined);
      sse.send("error", { message: friendlyError(error) });
    } finally {
      sse.end();
    }
  },
};
