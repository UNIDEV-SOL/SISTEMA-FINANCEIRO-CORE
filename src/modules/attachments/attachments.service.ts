import type { Prisma, TransactionAttachment } from "../../generated/prisma";
import { prisma } from "../../shared/db/prisma";
import { BadRequestException, ConflictException, NotFoundException, ValidationException } from "../../shared/errors/http-exceptions";
import { toPage, type Page, type PageRequest } from "../../shared/http/pagination";
import { toIsoDate } from "../../shared/lib/dates";
import { toMoney } from "../../shared/lib/money";
import { appSettings } from "../../shared/settings/app-settings";
import { periodsService } from "../periods/periods.service";
import { transactionsService } from "../transactions/transactions.service";

/** Ficheiros aceites como comprovativo: recibos em PDF e fotografias. */
export const ATTACHMENT_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const;

export interface AttachmentResponse {
  id: string;
  kind: "MESSAGE" | "FILE";
  name: string;
  mimeType?: string;
  size: number;
  /** O texto da mensagem (só MESSAGE). */
  text?: string;
  createdAt: string;
}

const toResponse = (a: Omit<TransactionAttachment, "data">): AttachmentResponse => ({
  id: a.id,
  kind: a.kind,
  name: a.name,
  mimeType: a.mimeType ?? undefined,
  size: a.size,
  text: a.text ?? undefined,
  createdAt: a.createdAt.toISOString(),
});

const WITHOUT_DATA = { id: true, transactionId: true, kind: true, name: true, mimeType: true, size: true, text: true, createdAt: true } as const;

/** A transação da pessoa, num ano aberto (anexar ou retirar é alterar a transação). */
async function writable(userId: string, transactionId: string) {
  const transaction = await transactionsService.findOwned(userId, transactionId);
  await periodsService.assertWritable(toIsoDate(transaction.date));
  const [count, max] = await Promise.all([prisma.transactionAttachment.count({ where: { transactionId } }), appSettings.get("attachments.maxPerTransaction")]);
  return { transaction, count, max };
}

/** No arquivo: o comprovativo e a transação a que pertence. */
export interface ArchivedAttachment extends AttachmentResponse {
  transaction: { id: string; type: string; description: string; amount: string; date: string; accountId: string };
}

export const attachmentsService = {
  /** Todos os comprovativos da pessoa, os mais recentes primeiro; `search` procura no nome, no texto e na transação. */
  async archive(userId: string, page: PageRequest, kind?: "MESSAGE" | "FILE"): Promise<Page<ArchivedAttachment>> {
    const where: Prisma.TransactionAttachmentWhereInput = { transaction: { userId }, kind };
    if (page.search)
      where.OR = [
        { name: { contains: page.search, mode: "insensitive" } },
        { text: { contains: page.search, mode: "insensitive" } },
        { transaction: { description: { contains: page.search, mode: "insensitive" } } },
      ];
    const [rows, total] = await Promise.all([
      prisma.transactionAttachment.findMany({
        where,
        select: { ...WITHOUT_DATA, transaction: { select: { id: true, type: true, description: true, amount: true, date: true, accountId: true } } },
        orderBy: [{ transaction: { date: "desc" } }, { createdAt: "desc" }, { id: "asc" }],
        skip: page.skip,
        take: page.size,
      }),
      prisma.transactionAttachment.count({ where }),
    ]);
    return toPage(
      rows.map((r) => ({
        ...toResponse(r),
        transaction: { ...r.transaction, amount: toMoney(r.transaction.amount), date: toIsoDate(r.transaction.date) },
      })),
      total,
      page,
    );
  },

  async list(userId: string, transactionId: string): Promise<AttachmentResponse[]> {
    await transactionsService.findOwned(userId, transactionId);
    const rows = await prisma.transactionAttachment.findMany({ where: { transactionId }, select: WITHOUT_DATA, orderBy: { createdAt: "asc" } });
    return rows.map(toResponse);
  },

  /** Guarda o texto de um SMS de confirmação. */
  async addMessage(userId: string, transactionId: string, text: string, name = "Mensagem de confirmação"): Promise<AttachmentResponse> {
    const { count, max } = await writable(userId, transactionId);
    if (count >= max) throw new ConflictException(`Esta transação já tem ${max} comprovativos.`);
    const row = await prisma.transactionAttachment.create({
      data: { transactionId, kind: "MESSAGE", name, size: text.length, text },
      select: WITHOUT_DATA,
    });
    return toResponse(row);
  },

  /** Guarda um PDF ou uma fotografia (o corpo do pedido, já lido). */
  async addFile(userId: string, transactionId: string, data: Buffer, mimeType: string, name: string): Promise<AttachmentResponse> {
    if (!ATTACHMENT_TYPES.includes(mimeType as (typeof ATTACHMENT_TYPES)[number]))
      throw new BadRequestException("Envie um PDF ou uma fotografia (JPEG, PNG ou WebP).");
    if (!data.length) throw new BadRequestException("O ficheiro está vazio.");
    const maxMb = await appSettings.get("attachments.maxFileMb");
    if (data.length > maxMb * 1024 * 1024) throw ValidationException.field("file", `O ficheiro tem mais de ${maxMb} MB.`);
    const { count, max } = await writable(userId, transactionId);
    if (count >= max) throw new ConflictException(`Esta transação já tem ${max} comprovativos.`);
    const row = await prisma.transactionAttachment.create({
      data: { transactionId, kind: "FILE", name: name.slice(0, 120) || "Comprovativo", mimeType, size: data.length, data: new Uint8Array(data) },
      select: WITHOUT_DATA,
    });
    return toResponse(row);
  },

  /** O conteúdo para abrir ou descarregar: o ficheiro, ou o texto da mensagem. */
  async content(userId: string, transactionId: string, id: string): Promise<{ name: string; mimeType: string; body: Buffer }> {
    await transactionsService.findOwned(userId, transactionId);
    const row = await prisma.transactionAttachment.findFirst({ where: { id, transactionId } });
    if (!row) throw new NotFoundException("O comprovativo");
    if (row.kind === "MESSAGE") return { name: `${row.name}.txt`, mimeType: "text/plain; charset=utf-8", body: Buffer.from(row.text ?? "", "utf8") };
    return { name: row.name, mimeType: row.mimeType ?? "application/octet-stream", body: Buffer.from(row.data ?? new Uint8Array()) };
  },

  async remove(userId: string, transactionId: string, id: string): Promise<void> {
    await writable(userId, transactionId);
    const { count } = await prisma.transactionAttachment.deleteMany({ where: { id, transactionId } });
    if (!count) throw new NotFoundException("O comprovativo");
  },
};
