import type { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { BadRequestException } from "../../shared/errors/http-exceptions";
import { parsePage } from "../../shared/http/pagination";
import { idParamSchema, requiredText, z } from "../../shared/http/schemas";
import { currentUserId } from "../../shared/middleware/authenticate";
import { attachmentsService } from "./attachments.service";

export const attachmentParamsSchema = idParamSchema.extend({
  attachmentId: z.uuid({ message: "Identificador inválido." }),
});

export const messageAttachmentSchema = z
  .object({
    text: requiredText("Cole a mensagem.", 5000),
    name: z.string().trim().max(120).optional(),
  })
  .openapi("MessageAttachmentInput");

/** Nome do ficheiro no cabeçalho X-File-Name (codificado com encodeURIComponent, por causa dos acentos). */
function fileName(req: Request): string {
  const raw = req.header("x-file-name");
  if (!raw) return "Comprovativo";
  try {
    return decodeURIComponent(raw).trim() || "Comprovativo";
  } catch {
    return "Comprovativo";
  }
}

/** A auditoria guarda o corpo do pedido: fica só o tamanho e o tipo, nunca o conteúdo. */
const summarizeForAudit = (req: Request, details: Record<string, unknown>) => {
  req.body = details;
};

export const archiveFiltersSchema = z.object({ kind: z.enum(["MESSAGE", "FILE"], { error: "Tipo inválido." }).optional() });

export const attachmentsController = {
  async archive(req: Request, res: Response) {
    const { kind } = archiveFiltersSchema.parse(req.query);
    const page = await parsePage(req.query, [] as const);
    res.json(await attachmentsService.archive(currentUserId(req), page, kind));
  },

  async list(req: Request, res: Response) {
    const { id } = idParamSchema.parse(req.params);
    res.json(await attachmentsService.list(currentUserId(req), id));
  },

  /** JSON {text} guarda um SMS; um PDF ou imagem no corpo (Content-Type do ficheiro) guarda o ficheiro. */
  async create(req: Request, res: Response) {
    const { id } = idParamSchema.parse(req.params);
    if (Buffer.isBuffer(req.body)) {
      const data = req.body;
      const mimeType = (req.header("content-type") ?? "").split(";")[0].trim();
      summarizeForAudit(req, { file: mimeType, bytes: data.length });
      res.status(StatusCodes.CREATED).json(await attachmentsService.addFile(currentUserId(req), id, data, mimeType, fileName(req)));
      return;
    }
    if (!req.is("application/json")) throw new BadRequestException("Envie a mensagem em JSON ou o ficheiro (PDF ou fotografia).");
    const input = messageAttachmentSchema.parse(req.body);
    summarizeForAudit(req, { message: input.text.length });
    res.status(StatusCodes.CREATED).json(await attachmentsService.addMessage(currentUserId(req), id, input.text, input.name));
  },

  async file(req: Request, res: Response) {
    const { id, attachmentId } = attachmentParamsSchema.parse(req.params);
    const file = await attachmentsService.content(currentUserId(req), id, attachmentId);
    res.setHeader("Content-Type", file.mimeType);
    res.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(file.name)}`);
    res.setHeader("Cache-Control", "private, no-store");
    res.send(file.body);
  },

  async remove(req: Request, res: Response) {
    const { id, attachmentId } = attachmentParamsSchema.parse(req.params);
    await attachmentsService.remove(currentUserId(req), id, attachmentId);
    res.status(StatusCodes.NO_CONTENT).end();
  },
};
