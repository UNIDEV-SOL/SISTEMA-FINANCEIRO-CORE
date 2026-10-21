import type { Functionality } from "../../generated/prisma";
import { accessPolicy } from "../../shared/access/policy";
import { prisma } from "../../shared/db/prisma";
import { ConflictException, NotFoundException, ValidationException, type FieldError } from "../../shared/errors/http-exceptions";
import { throwIfInvalid } from "../../shared/http/validation";
import type { FunctionalityCreateInput, FunctionalityOrderInput, FunctionalityUpdateInput } from "./functionalities.schemas";
import type { FunctionalityNode } from "./functionalities.types";

type Row = Functionality & { _count: { permissions: number } };
const withCount = { _count: { select: { permissions: true } } } as const;

function buildTree(rows: Row[], parentId: string | null = null, seen = new Set<string>()): FunctionalityNode[] {
  return rows
    .filter((r) => r.parentId === parentId && !seen.has(r.id))
    .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label, "pt"))
    .map((r) => ({
      id: r.id,
      code: r.code,
      label: r.label,
      path: r.path,
      icon: r.icon,
      order: r.order,
      parentId: r.parentId,
      apiPaths: r.apiPaths,
      protectReads: r.protectReads,
      active: r.active,
      profileCount: r._count.permissions,
      children: buildTree(rows, r.id, new Set(seen).add(r.id)),
    }));
}

const findNode = (nodes: FunctionalityNode[], id: string): FunctionalityNode | undefined => {
  for (const n of nodes) {
    if (n.id === id) return n;
    const found = findNode(n.children, id);
    if (found) return found;
  }
  return undefined;
};

/** Verifica que, com os pais dados, nenhuma funcionalidade fica dentro de si própria. */
function hasCycle(parents: Map<string, string | null>): boolean {
  for (const start of parents.keys()) {
    const seen = new Set<string>();
    let current: string | null | undefined = start;
    while (current) {
      if (seen.has(current)) return true;
      seen.add(current);
      current = parents.get(current);
    }
  }
  return false;
}

async function parentMap(): Promise<Map<string, string | null>> {
  const rows = await prisma.functionality.findMany({ select: { id: true, parentId: true } });
  return new Map(rows.map((r) => [r.id, r.parentId]));
}

async function findOrThrow(id: string) {
  const row = await prisma.functionality.findUnique({ where: { id }, include: withCount });
  if (!row) throw new NotFoundException("A funcionalidade");
  return row;
}

async function nextOrder(parentId: string | null) {
  return ((await prisma.functionality.aggregate({ where: { parentId }, _max: { order: true } }))._max.order ?? 0) + 1;
}

export const functionalitiesService = {
  /** Árvore completa, incluindo o que está desactivado. */
  async tree(): Promise<FunctionalityNode[]> {
    return buildTree(await prisma.functionality.findMany({ include: withCount }));
  },

  async node(id: string): Promise<FunctionalityNode> {
    return findNode(await this.tree(), id)!;
  },

  async create(input: FunctionalityCreateInput): Promise<FunctionalityNode> {
    const errors: FieldError[] = [];
    if (await prisma.functionality.findUnique({ where: { code: input.code }, select: { id: true } }))
      errors.push({ field: "code", message: "Já existe uma funcionalidade com este código." });
    if (input.parentId && !(await prisma.functionality.findUnique({ where: { id: input.parentId }, select: { id: true } })))
      errors.push({ field: "parentId", message: "A secção não existe." });
    throwIfInvalid(errors);

    const created = await prisma.functionality.create({
      data: { ...input, order: input.order ?? (await nextOrder(input.parentId)), apiPaths: [...new Set(input.apiPaths)] },
    });
    accessPolicy.invalidate();
    return this.node(created.id);
  },

  async update(id: string, input: FunctionalityUpdateInput): Promise<FunctionalityNode> {
    const current = await findOrThrow(id);
    if (input.parentId) {
      const parents = await parentMap();
      if (!parents.has(input.parentId)) throw ValidationException.field("parentId", "A secção não existe.");
      parents.set(id, input.parentId);
      if (hasCycle(parents)) throw ValidationException.field("parentId", "Uma funcionalidade não pode ficar dentro de si própria.");
    }
    await prisma.functionality.update({
      where: { id },
      data: { ...input, order: input.order ?? current.order, apiPaths: [...new Set(input.apiPaths)] },
    });
    accessPolicy.invalidate();
    return this.node(id);
  },

  /** Só se apaga o que não tem filhos nem está atribuído a perfis. */
  async remove(id: string): Promise<void> {
    const current = await findOrThrow(id);
    const children = await prisma.functionality.count({ where: { parentId: id } });
    if (children > 0) throw new ConflictException("A secção tem entradas. Mova-as ou apague-as primeiro.");
    if (current._count.permissions > 0)
      throw new ConflictException(`Está atribuída a ${current._count.permissions} perfil(is). Retire-a das permissões primeiro, ou desactive-a.`);
    await prisma.functionality.delete({ where: { id } });
    accessPolicy.invalidate();
  },

  /** Reordena e/ou move entradas entre secções, de uma vez. */
  async reorder(input: FunctionalityOrderInput): Promise<FunctionalityNode[]> {
    const parents = await parentMap();
    const errors: FieldError[] = [];
    input.items.forEach((item, i) => {
      if (!parents.has(item.id)) errors.push({ field: `items.${i}.id`, message: "A funcionalidade não existe." });
      if (item.parentId && !parents.has(item.parentId)) errors.push({ field: `items.${i}.parentId`, message: "A secção não existe." });
    });
    throwIfInvalid(errors);
    for (const item of input.items) parents.set(item.id, item.parentId);
    if (hasCycle(parents)) throw ValidationException.field("items", "Uma funcionalidade não pode ficar dentro de si própria.");

    await prisma.$transaction(
      input.items.map((item) => prisma.functionality.update({ where: { id: item.id }, data: { order: item.order, parentId: item.parentId } })),
    );
    accessPolicy.invalidate();
    return this.tree();
  },
};
