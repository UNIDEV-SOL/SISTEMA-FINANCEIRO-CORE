import type { Response } from "express";
import type { ChatEvents } from "./assistant.types";

/**
 * Server-Sent Events sobre a resposta HTTP. Os cabeçalhos evitam buffering e compressão
 * em proxies (Next.js, nginx: X-Accel-Buffering) para os deltas chegarem logo.
 */
export function openSse(res: Response) {
  res.status(200);
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();
  // Comentário inicial: alguns proxies só começam a encaminhar depois do primeiro byte
  res.write(": ok\n\n");

  return {
    send<E extends keyof ChatEvents>(event: E, data: ChatEvents[E]) {
      if (res.writableEnded || res.destroyed) return;
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    },
    end() {
      if (!res.writableEnded) res.end();
    },
  };
}
