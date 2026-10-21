import type { Category, CategoryKind, Prisma } from "../../generated/prisma";
import { prisma } from "../../shared/db/prisma";
import { NotFoundException, ValidationException } from "../../shared/errors/http-exceptions";
import { orderByOf, toPage, type Page, type PageRequest } from "../../shared/http/pagination";
import type { CATEGORY_SORTS, CategoryInput } from "./categories.schemas";
import type { CategoryResponse } from "./categories.types";

export const toCategoryResponse = (c: Category): CategoryResponse => ({
  id: c.id,
  name: c.name,
  kind: c.kind,
  icon: c.icon,
  color: c.color,
  group: c.group ?? undefined,
});

async function ensureUniqueName(userId: string, input: CategoryInput, kind: Category["kind"], exceptId?: string) {
  const clash = await prisma.category.findFirst({
    where: { userId, kind, name: { equals: input.name, mode: "insensitive" }, id: exceptId ? { not: exceptId } : undefined },
    select: { id: true },
  });
  if (clash) throw ValidationException.field("name", "Já existe uma categoria com este nome.");
}

export const categoriesService = {
  /** Por omissão, pela ordem de criação; `search` procura no nome. */
  async list(userId: string, page: PageRequest<(typeof CATEGORY_SORTS)[number]>, kind?: CategoryKind): Promise<Page<CategoryResponse>> {
    const where: Prisma.CategoryWhereInput = { userId, kind };
    if (page.search) where.name = { contains: page.search, mode: "insensitive" };
    const [categories, total] = await Promise.all([
      prisma.category.findMany({ where, orderBy: orderByOf(page.sort, [{ createdAt: "asc" }]), skip: page.skip, take: page.size }),
      prisma.category.count({ where }),
    ]);
    return toPage(categories.map(toCategoryResponse), total, page);
  },

  async findOwned(userId: string, id: string): Promise<Category> {
    const category = await prisma.category.findFirst({ where: { id, userId } });
    if (!category) throw new NotFoundException("A categoria");
    return category;
  },

  async create(userId: string, input: CategoryInput): Promise<CategoryResponse> {
    await ensureUniqueName(userId, input, input.kind);
    const category = await prisma.category.create({
      data: {
        userId,
        name: input.name,
        kind: input.kind,
        icon: input.icon,
        color: input.color,
        group: input.kind === "EXPENSE" ? (input.group ?? "WANTS") : null,
      },
    });
    return toCategoryResponse(category);
  },

  async update(userId: string, id: string, input: CategoryInput): Promise<CategoryResponse> {
    const current = await this.findOwned(userId, id);
    // O tipo não muda: as transações antigas ficariam incoerentes
    const kind = current.kind;
    await ensureUniqueName(userId, input, kind, id);
    const category = await prisma.category.update({
      where: { id },
      data: {
        name: input.name,
        icon: input.icon,
        color: input.color,
        group: kind === "EXPENSE" ? (input.group ?? current.group ?? "WANTS") : null,
      },
    });
    return toCategoryResponse(category);
  },
};
