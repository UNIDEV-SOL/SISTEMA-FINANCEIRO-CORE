import type { Investment, InvestmentType, Prisma, Valuation } from "../../generated/prisma";
import { prisma } from "../../shared/db/prisma";
import { NotFoundException, ValidationException } from "../../shared/errors/http-exceptions";
import { orderByOf, toPage, type Page, type PageRequest } from "../../shared/http/pagination";
import { fromIsoDate, todayIso, toIsoDate, toIsoDateOrUndefined, type IsoDate } from "../../shared/lib/dates";
import { toMoney, ZERO, type Decimal } from "../../shared/lib/money";
import { periodsService } from "../periods/periods.service";
import type { INVESTMENT_SORTS, InvestmentInput, ValuationInput } from "./investments.schemas";
import type { InvestmentResponse } from "./investments.types";

export type InvestmentWithValuations = Investment & { valuations: Valuation[] };

const withValuations = { valuations: { orderBy: { date: "asc" as const } } };

/** Valor numa data: a última avaliação até lá (zero antes de começar). Avaliações por ordem crescente. */
export function investmentValueAt(investment: InvestmentWithValuations, date: IsoDate): Decimal {
  if (toIsoDate(investment.startDate) > date) return ZERO;
  const known = investment.valuations.filter((v) => toIsoDate(v.date) <= date);
  return known.length ? known[known.length - 1].value : investment.invested;
}

export const loadInvestments = (userId: string) =>
  prisma.investment.findMany({ where: { userId }, include: withValuations, orderBy: { startDate: "asc" } });

export function toInvestmentResponse(i: InvestmentWithValuations): InvestmentResponse {
  return {
    id: i.id,
    name: i.name,
    type: i.type,
    institution: i.institution ?? undefined,
    invested: toMoney(i.invested),
    currentValue: toMoney(i.valuations.at(-1)?.value ?? i.invested),
    annualRate: i.annualRate?.toString(),
    startDate: toIsoDate(i.startDate),
    maturityDate: toIsoDateOrUndefined(i.maturityDate),
    valuations: i.valuations.map((v) => ({ date: toIsoDate(v.date), value: toMoney(v.value) })),
  };
}

const fields = (input: InvestmentInput) => ({
  name: input.name,
  type: input.type,
  institution: input.institution ?? null,
  invested: input.invested,
  annualRate: input.annualRate ?? null,
  startDate: fromIsoDate(input.startDate),
  maturityDate: input.maturityDate ? fromIsoDate(input.maturityDate) : null,
});

export const investmentsService = {
  /** Por omissão, pela data de início; `search` procura no nome e na instituição. */
  async list(userId: string, page: PageRequest<(typeof INVESTMENT_SORTS)[number]>, type?: InvestmentType): Promise<Page<InvestmentResponse>> {
    const where: Prisma.InvestmentWhereInput = { userId, type };
    if (page.search)
      where.OR = [{ name: { contains: page.search, mode: "insensitive" } }, { institution: { contains: page.search, mode: "insensitive" } }];
    const [investments, total] = await Promise.all([
      prisma.investment.findMany({ where, include: withValuations, orderBy: orderByOf(page.sort, [{ startDate: "asc" }]), skip: page.skip, take: page.size }),
      prisma.investment.count({ where }),
    ]);
    return toPage(investments.map(toInvestmentResponse), total, page);
  },

  async findOwned(userId: string, id: string): Promise<InvestmentWithValuations> {
    const investment = await prisma.investment.findFirst({ where: { id, userId }, include: withValuations });
    if (!investment) throw new NotFoundException("O investimento");
    return investment;
  },

  async create(userId: string, input: InvestmentInput): Promise<InvestmentResponse> {
    await periodsService.assertWritable(input.startDate, "startDate");
    const data = fields(input);
    const investment = await prisma.investment.create({
      // A primeira avaliação é o capital aplicado na data de início
      data: { userId, ...data, valuations: { create: { date: data.startDate, value: data.invested } } },
      include: withValuations,
    });
    return toInvestmentResponse(investment);
  },

  async update(userId: string, id: string, input: InvestmentInput): Promise<InvestmentResponse> {
    const current = await this.findOwned(userId, id);
    const data = fields(input);
    // A data de início e o capital mexem na avaliação inicial: só com os dois anos abertos
    if (toIsoDate(current.startDate) !== input.startDate || !current.invested.equals(input.invested)) {
      await periodsService.assertWritable(current.startDate);
      await periodsService.assertWritable(input.startDate, "startDate");
    }
    const investment = await prisma.$transaction(async (tx) => {
      await tx.investment.update({ where: { id }, data });
      // Sem avaliações posteriores, a avaliação inicial acompanha o capital e a data de início
      if (current.valuations.length <= 1) {
        await tx.valuation.deleteMany({ where: { investmentId: id } });
        await tx.valuation.create({ data: { investmentId: id, date: data.startDate, value: data.invested } });
      } else {
        // Avaliações anteriores ao novo início deixam de fazer sentido
        await tx.valuation.deleteMany({ where: { investmentId: id, date: { lt: data.startDate } } });
      }
      return tx.investment.findUniqueOrThrow({ where: { id }, include: withValuations });
    });
    return toInvestmentResponse(investment);
  },

  async remove(userId: string, id: string): Promise<void> {
    await this.findOwned(userId, id);
    await prisma.investment.delete({ where: { id } });
  },

  async addValuation(userId: string, id: string, input: ValuationInput): Promise<InvestmentResponse> {
    const investment = await this.findOwned(userId, id);
    if (input.date < toIsoDate(investment.startDate) || input.date > todayIso())
      throw ValidationException.field("date", "A data tem de estar entre o início e hoje.");
    await periodsService.assertWritable(input.date, "date");
    const date = fromIsoDate(input.date);
    // Uma avaliação por dia: a nova substitui a do mesmo dia
    await prisma.valuation.upsert({
      where: { investmentId_date: { investmentId: id, date } },
      create: { investmentId: id, date, value: input.value },
      update: { value: input.value },
    });
    return toInvestmentResponse(await this.findOwned(userId, id));
  },
};
