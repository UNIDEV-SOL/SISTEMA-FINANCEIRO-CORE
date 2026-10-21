import type { Request, Response } from "express";
import { parsePage } from "../../shared/http/pagination";
import { auditAs } from "../../shared/middleware/audit";
import { currentActor } from "../../shared/middleware/authenticate";
import { ACTING_CANDIDATE_SORTS, actingAsInputSchema } from "./access.schemas";
import { accessService } from "./access.service";

const actorOf = (req: Request) => {
  const { actorId, profile } = currentActor(req);
  return { id: actorId, profile };
};

export const accessController = {
  async menu(req: Request, res: Response) {
    // As permissões são sempre as de quem iniciou sessão, mesmo a agir por outra pessoa
    res.json(await accessService.menu(currentActor(req).profile));
  },

  async actingCandidates(req: Request, res: Response) {
    const page = await parsePage(req.query, ACTING_CANDIDATE_SORTS);
    res.json(await accessService.actingCandidates(actorOf(req), page));
  },

  async startActingAs(req: Request, res: Response) {
    const { userId } = actingAsInputSchema.parse(req.body);
    const actingAs = await accessService.startActingAs(actorOf(req), userId);
    auditAs(res, "VIEW_AS", actingAs.id);
    res.json(actingAs);
  },
};
