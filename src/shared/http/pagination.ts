import { appSettings } from "../settings/app-settings";
import { z } from "./schemas";

export type SortDirection = "asc" | "desc";

export interface PageRequest<F extends string = string> {
  page: number;
  size: number;
  skip: number;
  sort?: { field: F; direction: SortDirection };
  search?: string;
}

export interface Page<T> {
  content: T[];
  /** Começa em 0. */
  page: number;
  size: number;
  totalItems: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

/** `page`, `size`, `sort` ("campo,asc|desc", campos da allowlist) e `search`. */
export function pageQuerySchema<F extends string>(sortFields: readonly F[]) {
  const sortMessage = `Ordenação inválida. Use um destes campos: ${sortFields.join(", ")} (ex.: ${sortFields[0]},desc).`;
  return z.object({
    page: z.coerce
      .number({ error: "Página inválida." })
      .int({ message: "Página inválida." })
      .min(0, { message: "Página inválida." })
      .default(0)
      .openapi({ description: "Página, a começar em 0.", example: 0 }),
    size: z.coerce
      .number({ error: "Tamanho de página inválido." })
      .int({ message: "Tamanho de página inválido." })
      .min(1, { message: "Tamanho de página inválido." })
      .optional()
      .openapi({ description: "Itens por página (por omissão `pagination.defaultSize`, no máximo `pagination.maxSize`).", example: 20 }),
    sort: z
      .string()
      .trim()
      .optional()
      .transform((v, ctx) => {
        if (!v) return undefined;
        const [field, direction = "asc"] = v.split(",").map((p) => p.trim());
        if (!sortFields.includes(field as F) || !["asc", "desc"].includes(direction.toLowerCase())) {
          ctx.addIssue({ code: "custom", message: sortMessage });
          return z.NEVER;
        }
        return { field: field as F, direction: direction.toLowerCase() as SortDirection };
      })
      .openapi({ type: "string", description: `Campos: ${sortFields.join(", ")}.`, example: `${sortFields[0]},asc` }),
    search: z
      .string()
      .max(100, { message: "Máximo de 100 caracteres." })
      .optional()
      .transform((v) => v?.trim() || undefined)
      .openapi({ description: "Texto livre, sem distinguir maiúsculas." }),
  });
}

/** Lê a paginação da query; o tamanho é limitado pelos parâmetros do sistema. */
export async function parsePage<F extends string>(query: unknown, sortFields: readonly F[]): Promise<PageRequest<F>> {
  const q = pageQuerySchema(sortFields).parse(query);
  const limits = await appSettings.many("pagination.defaultSize", "pagination.maxSize");
  const size = Math.min(q.size ?? limits["pagination.defaultSize"], limits["pagination.maxSize"]);
  return { page: q.page, size, skip: q.page * size, sort: q.sort, search: q.search };
}

export function toPage<T>(content: T[], totalItems: number, req: Pick<PageRequest, "page" | "size">): Page<T> {
  const totalPages = Math.ceil(totalItems / req.size);
  return {
    content,
    page: req.page,
    size: req.size,
    totalItems,
    totalPages,
    hasNext: req.page + 1 < totalPages,
    hasPrevious: req.page > 0,
  };
}

/** Pagina uma lista já em memória (quando o valor ordenado é calculado). */
export const pageOf = <T>(items: T[], req: PageRequest): Page<T> => toPage(items.slice(req.skip, req.skip + req.size), items.length, req);

/** Ordenação pedida (com desempate estável) ou a ordem por omissão. */
export function orderByOf<O extends object>(sort: PageRequest["sort"], fallback: O[], tiebreak = { id: "asc" } as O): O[] {
  if (!sort) return [...fallback, tiebreak];
  return [{ [sort.field]: sort.direction } as O, ...fallback.filter((o) => !(sort.field in o)), tiebreak];
}

export const pageSchema = <T extends z.ZodType>(item: T, name: string) =>
  z
    .object({
      content: z.array(item),
      page: z.number().int().openapi({ example: 0 }),
      size: z.number().int().openapi({ example: 20 }),
      totalItems: z.number().int().openapi({ example: 42 }),
      totalPages: z.number().int().openapi({ example: 3 }),
      hasNext: z.boolean(),
      hasPrevious: z.boolean(),
    })
    .openapi(name);
