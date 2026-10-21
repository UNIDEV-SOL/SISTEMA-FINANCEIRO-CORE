import type { Currency, Prisma } from "../../generated/prisma";
import { prisma } from "../../shared/db/prisma";
import { ConflictException, NotFoundException, ValidationException } from "../../shared/errors/http-exceptions";
import { orderByOf, toPage, type Page, type PageRequest } from "../../shared/http/pagination";
import { appSettings } from "../../shared/settings/app-settings";
import type { CURRENCY_SORTS, CurrencyCreateInput, CurrencyUpdateInput } from "./currencies.schemas";
import type { AdminCurrencyResponse, CurrencyResponse } from "./currencies.types";

type WithCount = Currency & { _count: { users: number } };

export const toCurrencyResponse = (c: Currency): CurrencyResponse => ({
  code: c.code,
  name: c.name,
  symbol: c.symbol,
  decimals: c.decimals,
  active: c.active,
  order: c.order,
});

const toAdmin = (c: WithCount): AdminCurrencyResponse => ({ ...toCurrencyResponse(c), userCount: c._count.users });
const withCount = { _count: { select: { users: true } } } as const;

async function findOrThrow(code: string): Promise<WithCount> {
  const currency = await prisma.currency.findUnique({ where: { code }, include: withCount });
  if (!currency) throw new NotFoundException("A moeda");
  return currency;
}

async function isDefault(code: string) {
  return (await appSettings.get("locale.defaultCurrency")) === code;
}

export const currenciesService = {
  /** Moedas activas, pela ordem definida (para selects e `/config/public`). */
  async active(): Promise<CurrencyResponse[]> {
    const currencies = await prisma.currency.findMany({ where: { active: true }, orderBy: [{ order: "asc" }, { code: "asc" }] });
    return currencies.map(toCurrencyResponse);
  },

  async list(page: PageRequest<(typeof CURRENCY_SORTS)[number]>, active?: boolean): Promise<Page<AdminCurrencyResponse>> {
    const where: Prisma.CurrencyWhereInput = { active };
    if (page.search) where.OR = [{ code: { contains: page.search, mode: "insensitive" } }, { name: { contains: page.search, mode: "insensitive" } }];
    const [items, total] = await Promise.all([
      prisma.currency.findMany({
        where,
        include: withCount,
        // A tabela não tem `id`: o desempate é pelo código
        orderBy: orderByOf<Prisma.CurrencyOrderByWithRelationInput>(page.sort, [{ order: "asc" }], { code: "asc" }),
        skip: page.skip,
        take: page.size,
      }),
      prisma.currency.count({ where }),
    ]);
    return toPage(items.map(toAdmin), total, page);
  },

  async create(input: CurrencyCreateInput): Promise<AdminCurrencyResponse> {
    if (await prisma.currency.findUnique({ where: { code: input.code }, select: { code: true } }))
      throw ValidationException.field("code", "Já existe uma moeda com este código.");
    const order = input.order ?? ((await prisma.currency.aggregate({ _max: { order: true } }))._max.order ?? 0) + 1;
    const currency = await prisma.currency.create({ data: { ...input, order }, include: withCount });
    return toAdmin(currency);
  },

  async update(code: string, input: CurrencyUpdateInput): Promise<AdminCurrencyResponse> {
    const current = await findOrThrow(code);
    if (!input.active && current.active && (await isDefault(code)))
      throw new ConflictException("É a moeda por omissão (parâmetro locale.defaultCurrency). Escolha outra antes de a desactivar.");
    const currency = await prisma.currency.update({ where: { code }, data: { ...input, order: input.order ?? current.order }, include: withCount });
    return toAdmin(currency);
  },

  /** Só se apaga uma moeda que ninguém usa; caso contrário, desactiva-se. */
  async remove(code: string): Promise<void> {
    const current = await findOrThrow(code);
    if (await isDefault(code)) throw new ConflictException("É a moeda por omissão (parâmetro locale.defaultCurrency) e não pode ser apagada.");
    if (current._count.users > 0)
      throw new ConflictException(`A moeda é usada por ${current._count.users} utilizador(es). Desactive-a em vez de a apagar.`);
    await prisma.currency.delete({ where: { code } });
  },
};
