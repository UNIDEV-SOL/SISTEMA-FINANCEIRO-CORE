import type { Request, Response } from "express";
import { parsePage } from "../../shared/http/pagination";
import { AUDIT_SORTS, auditFiltersSchema } from "./audit.schemas";
import { auditService } from "./audit.service";

export const auditController = {
  async list(req: Request, res: Response) {
    const filters = auditFiltersSchema.parse(req.query);
    const page = await parsePage(req.query, AUDIT_SORTS);
    res.json(await auditService.list(page, filters));
  },
};
