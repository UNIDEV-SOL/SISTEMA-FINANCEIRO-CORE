import { StatusCodes } from "http-status-codes";
import type { Period } from "../../generated/prisma";
import { prisma } from "../../shared/db/prisma";
import { ConflictException, HttpException, NotFoundException, ValidationException } from "../../shared/errors/http-exceptions";
import { currentYear, toIsoDate, yearOf, type IsoDate } from "../../shared/lib/dates";
import { logger } from "../../shared/logger";
import { appSettings } from "../../shared/settings/app-settings";
import type { PeriodCreateInput, PeriodUpdateInput } from "./periods.schemas";
import type { AdminPeriodResponse, PeriodList, PeriodResponse } from "./periods.types";

/** Escrita num ano que não está aberto: 409, com erro no campo quando a data veio no corpo. */
export class PeriodClosedException extends HttpException {
  constructor(year: number, exists: boolean, field?: string) {
    const detail = exists
      ? `O ano ${year} está fechado: pode consultar, mas não alterar.`
      : `O ano ${year} ainda não está aberto: pode consultar, mas não alterar.`;
    super(StatusCodes.CONFLICT, "Ano fechado", detail, field ? [{ field, message: detail }] : undefined);
  }
}

// Chave do bloqueio da passagem de ano (várias instâncias/pedidos ao mesmo tempo)
const ROLLOVER_LOCK = 724_001;

async function namesOf(periods: Period[]) {
  const ids = [...new Set(periods.map((p) => p.updatedById).filter((id): id is string => !!id))];
  const users = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : [];
  return new Map(users.map((u) => [u.id, u.name]));
}

const toResponse = (p: Period, names: Map<string, string>): PeriodResponse => ({
  year: p.year,
  status: p.status,
  isCurrent: p.isCurrent,
  createdAt: p.createdAt.toISOString(),
  updatedAt: p.updatedAt.toISOString(),
  updatedBy: p.updatedById ? { id: p.updatedById, name: names.get(p.updatedById) ?? "Utilizador removido" } : null,
});

/** Anos com registos datados de qualquer utilizador. */
async function yearsWithData(): Promise<Set<number>> {
  const rows = await prisma.$queryRaw<{ year: number }[]>`
    SELECT DISTINCT EXTRACT(YEAR FROM "date")::int AS year FROM "transactions"
    UNION SELECT DISTINCT EXTRACT(YEAR FROM "date")::int FROM "goal_contributions"
    UNION SELECT DISTINCT EXTRACT(YEAR FROM "date")::int FROM "valuations"
    UNION SELECT DISTINCT EXTRACT(YEAR FROM "startDate")::int FROM "investments"`;
  return new Set(rows.map((r) => Number(r.year)));
}

async function findOrThrow(year: number): Promise<Period> {
  const period = await prisma.period.findUnique({ where: { year } });
  if (!period) throw new NotFoundException("O ano");
  return period;
}

async function toAdmin(periods: Period[]): Promise<AdminPeriodResponse[]> {
  const [names, years] = await Promise.all([namesOf(periods), yearsWithData()]);
  return periods.map((p) => ({ ...toResponse(p, names), hasData: years.has(p.year) }));
}

export const periodsService = {
  /**
   * Passagem de ano (preguiçosa): se o ano corrente ficou para trás e `periods.autoCreate` está ligado,
   * abre o ano do calendário, passa-o a corrente e fecha o anterior (`periods.autoClosePrevious`).
   * Corre antes de cada verificação de escrita, em `GET /periods` e na tarefa diária.
   */
  async ensureCurrent(): Promise<void> {
    const year = currentYear();
    const current = await prisma.period.findFirst({ where: { isCurrent: true }, select: { year: true } });
    if (current && current.year >= year) return;
    const { "periods.autoCreate": autoCreate, "periods.autoClosePrevious": closePrevious } = await appSettings.many(
      "periods.autoCreate",
      "periods.autoClosePrevious",
    );
    if (!autoCreate) return;

    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${ROLLOVER_LOCK})`;
      const again = await tx.period.findFirst({ where: { isCurrent: true } });
      if (again && again.year >= year) return;
      if (again) await tx.period.update({ where: { year: again.year }, data: { isCurrent: false, ...(closePrevious ? { status: "CLOSED" as const } : {}) } });
      await tx.period.upsert({ where: { year }, create: { year, status: "OPEN", isCurrent: true }, update: { isCurrent: true } });
      logger.info(`Ano ${year} passou a corrente${again ? ` (${again.year} ${closePrevious ? "fechado" : "continua aberto"})` : ""}`);
    });
  },

  /**
   * Garante o ano corrente e um período para cada ano com registos: os anteriores ao corrente ficam
   * fechados e os seguintes abertos. Nunca altera anos que já existem. Usado no seed e no reset da demo.
   */
  async syncWithData(): Promise<void> {
    if (!(await prisma.period.findFirst({ where: { isCurrent: true }, select: { year: true } }))) {
      const year = currentYear();
      await prisma.period.upsert({ where: { year }, create: { year, status: "OPEN", isCurrent: true }, update: { isCurrent: true } });
    }
    await this.ensureCurrent();
    const current = (await prisma.period.findFirstOrThrow({ where: { isCurrent: true }, select: { year: true } })).year;
    const years = [...(await yearsWithData())];
    if (years.length)
      await prisma.period.createMany({ data: years.map((year) => ({ year, status: year < current ? ("CLOSED" as const) : ("OPEN" as const) })), skipDuplicates: true });
  },

  /**
   * Recusa (409) alterar registos com data num ano que não está aberto (ou sem período).
   * `field` é o campo do corpo com a data, para o erro aparecer no formulário.
   */
  async assertWritable(date: IsoDate | Date | number, field?: string): Promise<void> {
    await this.ensureCurrent();
    const year = typeof date === "number" ? date : yearOf(typeof date === "string" ? date : toIsoDate(date));
    const period = await prisma.period.findUnique({ where: { year }, select: { status: true } });
    if (period?.status !== "OPEN") throw new PeriodClosedException(year, !!period, field);
  },

  /** Todos os anos, do mais recente para o mais antigo, e o corrente. */
  async list(): Promise<PeriodList> {
    await this.ensureCurrent();
    const periods = await prisma.period.findMany({ orderBy: { year: "desc" } });
    const names = await namesOf(periods);
    return { items: periods.map((p) => toResponse(p, names)), current: periods.find((p) => p.isCurrent)?.year ?? currentYear() };
  },

  async adminList(): Promise<AdminPeriodResponse[]> {
    await this.ensureCurrent();
    return toAdmin(await prisma.period.findMany({ orderBy: { year: "desc" } }));
  },

  async create(input: PeriodCreateInput, actorId: string): Promise<AdminPeriodResponse> {
    if (await prisma.period.findUnique({ where: { year: input.year }, select: { year: true } }))
      throw ValidationException.field("year", `O ano ${input.year} já existe.`);
    const period = await prisma.period.create({ data: { year: input.year, status: input.status, updatedById: actorId } });
    return (await toAdmin([period]))[0];
  },

  async update(year: number, input: PeriodUpdateInput, actorId: string): Promise<AdminPeriodResponse> {
    const current = await findOrThrow(year);
    if (input.isCurrent === false && current.isCurrent)
      throw ValidationException.field("isCurrent", "Tem de haver um ano corrente: marque outro ano como corrente.");
    const makeCurrent = input.isCurrent === true && !current.isCurrent;
    if (makeCurrent && year < currentYear() && (await appSettings.get("periods.autoCreate")))
      throw new ConflictException(
        `Com a abertura automática de anos ligada (parâmetro periods.autoCreate), o ano corrente não pode ser anterior a ${currentYear()}.`,
      );

    const period = await prisma.$transaction(async (tx) => {
      if (makeCurrent) await tx.period.updateMany({ where: { isCurrent: true }, data: { isCurrent: false } });
      return tx.period.update({
        where: { year },
        data: { status: input.status ?? current.status, isCurrent: current.isCurrent || makeCurrent, updatedById: actorId },
      });
    });
    return (await toAdmin([period]))[0];
  },

  /** Só se apaga um ano sem registos e que não é o corrente. */
  async remove(year: number): Promise<void> {
    const period = await findOrThrow(year);
    if (period.isCurrent) throw new ConflictException(`O ano ${year} é o corrente e não pode ser apagado.`);
    if ((await yearsWithData()).has(year)) throw new ConflictException(`O ano ${year} tem registos e não pode ser apagado. Feche-o em vez de o apagar.`);
    await prisma.period.delete({ where: { year } });
  },
};
