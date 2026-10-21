import type { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { parsePage } from "../../shared/http/pagination";
import { idParamSchema } from "../../shared/http/schemas";
import { currentActor } from "../../shared/middleware/authenticate";
import { appSettings } from "../../shared/settings/app-settings";
import {
  ADMIN_USER_SORTS,
  adminUserActiveSchema,
  adminUserCreateSchema,
  adminUserFiltersSchema,
  adminUserPasswordSchema,
  adminUserUpdateSchema,
} from "./admin-users.schemas";
import { adminUsersService } from "./admin-users.service";

const minLength = () => appSettings.get("auth.passwordMinLength");

export const adminUsersController = {
  async list(req: Request, res: Response) {
    const filters = adminUserFiltersSchema.parse(req.query);
    const page = await parsePage(req.query, ADMIN_USER_SORTS);
    res.json(await adminUsersService.list(page, filters));
  },

  async get(req: Request, res: Response) {
    const { id } = idParamSchema.parse(req.params);
    res.json(await adminUsersService.get(id));
  },

  async create(req: Request, res: Response) {
    const input = adminUserCreateSchema(await minLength()).parse(req.body);
    res.status(StatusCodes.CREATED).json(await adminUsersService.create(currentActor(req), input));
  },

  async update(req: Request, res: Response) {
    const { id } = idParamSchema.parse(req.params);
    const input = adminUserUpdateSchema.parse(req.body);
    res.json(await adminUsersService.update(currentActor(req), id, input));
  },

  async setActive(req: Request, res: Response) {
    const { id } = idParamSchema.parse(req.params);
    const { active } = adminUserActiveSchema.parse(req.body);
    res.json(await adminUsersService.setActive(currentActor(req), id, active));
  },

  async resetPassword(req: Request, res: Response) {
    const { id } = idParamSchema.parse(req.params);
    const { password } = adminUserPasswordSchema(await minLength()).parse(req.body);
    await adminUsersService.resetPassword(currentActor(req), id, password);
    res.status(StatusCodes.NO_CONTENT).end();
  },
};
