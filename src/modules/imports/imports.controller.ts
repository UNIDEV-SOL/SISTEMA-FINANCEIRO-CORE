import type { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { BadRequestException } from "../../shared/errors/http-exceptions";
import { currentUserId } from "../../shared/middleware/authenticate";
import { parseBimStatement, parseMessages } from "./imports.parsers";
import { pdfLines } from "./imports.pdf";
import { importCommitSchema, importTextSchema } from "./imports.schemas";
import { importsService } from "./imports.service";

/** A auditoria guarda o corpo do pedido: fica só o tamanho, nunca o conteúdo das mensagens ou do PDF. */
function summarizeForAudit(req: Request, details: Record<string, unknown>) {
  req.body = details;
}

export const importsController = {
  async previewText(req: Request, res: Response) {
    const { text } = importTextSchema.parse(req.body);
    summarizeForAudit(req, { characters: text.length });
    res.json(await importsService.preview(currentUserId(req), parseMessages(text)));
  },

  async previewPdf(req: Request, res: Response) {
    if (!Buffer.isBuffer(req.body) || !req.body.length) throw new BadRequestException("Envie um ficheiro PDF (Content-Type: application/pdf).");
    const data = new Uint8Array(req.body);
    summarizeForAudit(req, { pdfBytes: data.length });
    const movement = parseBimStatement(await pdfLines(data));
    if (!movement) throw new BadRequestException("Este PDF não foi reconhecido. Por agora lê as notas de lançamento do BIM.");
    res.json(await importsService.preview(currentUserId(req), { items: [movement], unrecognized: [] }));
  },

  async commit(req: Request, res: Response) {
    const { items, balances } = importCommitSchema.parse(req.body);
    summarizeForAudit(req, { items: items.length });
    res.status(StatusCodes.CREATED).json(await importsService.commit(currentUserId(req), items, balances));
  },
};
