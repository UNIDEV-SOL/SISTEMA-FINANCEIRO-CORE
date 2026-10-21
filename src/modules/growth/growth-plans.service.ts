import type { GrowthPlanType, Prisma } from "../../generated/prisma";
import { prisma } from "../../shared/db/prisma";
import { NotFoundException, ValidationException } from "../../shared/errors/http-exceptions";
import { orderByOf, toPage, type Page, type PageRequest } from "../../shared/http/pagination";
import type { PLAN_SORTS, PlanCreateInput, PlanUpdateInput } from "./growth.schemas";
import type { GrowthPlanTypeResponse } from "./growth.types";

export const toPlanTypeResponse = (t: GrowthPlanType): GrowthPlanTypeResponse => ({
  id: t.id,
  code: t.code,
  name: t.name,
  description: t.description,
  icon: t.icon,
  color: t.color,
  annualReturn: t.annualReturn.toNumber(),
  defaultMonths: t.defaultMonths,
  tips: t.tips,
  order: t.order,
  active: t.active,
  createdAt: t.createdAt.toISOString(),
  updatedAt: t.updatedAt.toISOString(),
});

async function findOrThrow(id: string) {
  const plan = await prisma.growthPlanType.findUnique({ where: { id } });
  if (!plan) throw new NotFoundException("O plano");
  return plan;
}

/** Tipos de plano do módulo Crescer (administração). */
export const growthPlansService = {
  async list(page: PageRequest<(typeof PLAN_SORTS)[number]>, active?: boolean): Promise<Page<GrowthPlanTypeResponse>> {
    const where: Prisma.GrowthPlanTypeWhereInput = { active };
    if (page.search) where.OR = [{ code: { contains: page.search, mode: "insensitive" } }, { name: { contains: page.search, mode: "insensitive" } }];
    const [items, total] = await Promise.all([
      prisma.growthPlanType.findMany({
        where,
        orderBy: orderByOf<Prisma.GrowthPlanTypeOrderByWithRelationInput>(page.sort, [{ order: "asc" }, { name: "asc" }]),
        skip: page.skip,
        take: page.size,
      }),
      prisma.growthPlanType.count({ where }),
    ]);
    return toPage(items.map(toPlanTypeResponse), total, page);
  },

  async create(input: PlanCreateInput): Promise<GrowthPlanTypeResponse> {
    if (await prisma.growthPlanType.findUnique({ where: { code: input.code }, select: { id: true } }))
      throw ValidationException.field("code", "Já existe um plano com este código.");
    const order = input.order ?? ((await prisma.growthPlanType.aggregate({ _max: { order: true } }))._max.order ?? 0) + 1;
    return toPlanTypeResponse(await prisma.growthPlanType.create({ data: { ...input, order } }));
  },

  /** O código não muda: as propostas usam-no (EMERGENCY_FUND, INVEST). */
  async update(id: string, input: PlanUpdateInput): Promise<GrowthPlanTypeResponse> {
    const current = await findOrThrow(id);
    return toPlanTypeResponse(await prisma.growthPlanType.update({ where: { id }, data: { ...input, order: input.order ?? current.order } }));
  },

  async remove(id: string): Promise<void> {
    await findOrThrow(id);
    await prisma.growthPlanType.delete({ where: { id } });
  },
};
