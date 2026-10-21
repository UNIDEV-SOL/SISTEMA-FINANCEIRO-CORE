import { TZDate } from "@date-fns/tz";
import type Anthropic from "@anthropic-ai/sdk";
import { env } from "../../config/env";
import type { AssistantConversation, Prisma } from "../../generated/prisma";
import { prisma } from "../../shared/db/prisma";
import { ForbiddenException, NotFoundException, TooManyRequestsException } from "../../shared/errors/http-exceptions";
import { orderByOf, toPage, type Page, type PageRequest } from "../../shared/http/pagination";
import { todayIso } from "../../shared/lib/dates";
import { appSettings } from "../../shared/settings/app-settings";
import type { CONVERSATION_SORTS } from "./assistant.schemas";
import type { ConversationDetail, ConversationSummary } from "./assistant.types";

/**
 * Dono de uma conversa: o utilizador efectivo (cujos dados o assistente lê) e quem iniciou sessão.
 * Um responsável a agir por um dependente vê só as conversas que ele próprio teve nessa qualidade;
 * o dependente vê só as suas.
 */
export interface Owner {
  userId: string;
  actorId: string;
}

/** Mensagens do histórico enviadas ao modelo (as mais recentes). */
const HISTORY_LIMIT = 20;
const TITLE_MAX = 80;

const ownedBy = (owner: Owner): Prisma.AssistantConversationWhereInput => ({ userId: owner.userId, actorId: owner.actorId });

const toSummary = (c: AssistantConversation): ConversationSummary => ({
  id: c.id,
  title: c.title,
  createdAt: c.createdAt.toISOString(),
  updatedAt: c.updatedAt.toISOString(),
});

export function titleOf(message: string): string {
  const flat = message.replace(/\s+/g, " ").trim();
  return flat.length <= TITLE_MAX ? flat : `${flat.slice(0, TITLE_MAX - 1).replace(/\s+\S*$/, "")}…`;
}

const startOfToday = () => {
  const [y, m, d] = todayIso().split("-").map(Number);
  return new Date(new TZDate(y, m - 1, d, env.APP_TZ).getTime());
};

async function findOwned(owner: Owner, id: string) {
  const conversation = await prisma.assistantConversation.findFirst({ where: { id, ...ownedBy(owner) } });
  if (!conversation) throw new NotFoundException("A conversa");
  return conversation;
}

export const assistantService = {
  /** 403 com o assistente desligado; 429 acima do limite diário (0 = sem limite) do utilizador efectivo. */
  async assertCanChat(userId: string): Promise<void> {
    const { "assistant.enabled": enabled, "assistant.dailyLimit": limit } = await appSettings.many("assistant.enabled", "assistant.dailyLimit");
    if (!enabled) throw new ForbiddenException("O assistente está desligado. Contacte o administrador.");
    if (!limit) return;
    const used = await prisma.assistantMessage.count({
      where: { role: "user", createdAt: { gte: startOfToday() }, conversation: { userId } },
    });
    if (used >= limit) throw new TooManyRequestsException(`Atingiu o limite de ${limit} mensagens ao assistente por dia. Volte a tentar amanhã.`);
  },

  async list(owner: Owner, page: PageRequest<(typeof CONVERSATION_SORTS)[number]>): Promise<Page<ConversationSummary>> {
    const where: Prisma.AssistantConversationWhereInput = ownedBy(owner);
    if (page.search) where.title = { contains: page.search, mode: "insensitive" };
    const [items, total] = await Promise.all([
      prisma.assistantConversation.findMany({ where, orderBy: orderByOf(page.sort, [{ updatedAt: "desc" }]), skip: page.skip, take: page.size }),
      prisma.assistantConversation.count({ where }),
    ]);
    return toPage(items.map(toSummary), total, page);
  },

  async get(owner: Owner, id: string): Promise<ConversationDetail> {
    const conversation = await findOwned(owner, id);
    const messages = await prisma.assistantMessage.findMany({ where: { conversationId: id }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
    return {
      ...toSummary(conversation),
      messages: messages.map((m) => ({ id: m.id, role: m.role, text: m.text, createdAt: m.createdAt.toISOString() })),
    };
  },

  async remove(owner: Owner, id: string): Promise<void> {
    await findOwned(owner, id);
    await prisma.assistantConversation.delete({ where: { id } });
  },

  /** Conversa existente (do dono) ou nova, com o título a partir da primeira pergunta. */
  async open(owner: Owner, conversationId: string | undefined, message: string): Promise<AssistantConversation> {
    if (conversationId) return findOwned(owner, conversationId);
    return prisma.assistantConversation.create({ data: { userId: owner.userId, actorId: owner.actorId, title: titleOf(message) } });
  },

  /** Histórico para o modelo: perguntas em texto; respostas com os turnos completos quando os há. */
  async history(conversationId: string): Promise<Anthropic.MessageParam[]> {
    const rows = (
      await prisma.assistantMessage.findMany({ where: { conversationId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: HISTORY_LIMIT })
    ).reverse();
    // O histórico tem de começar numa pergunta
    while (rows.length && rows[0].role !== "user") rows.shift();
    const messages: Anthropic.MessageParam[] = [];
    for (const row of rows) {
      const turns = (row.content as { turns?: Anthropic.MessageParam[] } | null)?.turns;
      if (row.role === "assistant" && Array.isArray(turns) && turns.length) messages.push(...turns);
      else if (row.text.trim()) messages.push({ role: row.role, content: row.text });
    }
    return messages;
  },

  async addUserMessage(conversationId: string, actorId: string, text: string) {
    return prisma.assistantMessage.create({ data: { conversationId, role: "user", text, actorId } });
  },

  async addAssistantMessage(conversationId: string, text: string, turns?: Anthropic.MessageParam[]) {
    const [message] = await prisma.$transaction([
      prisma.assistantMessage.create({
        data: { conversationId, role: "assistant", text, content: turns?.length ? ({ turns } as unknown as Prisma.InputJsonValue) : undefined },
      }),
      prisma.assistantConversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } }),
    ]);
    return message;
  },
};
