import type { Prisma, TransactionStatus, TransactionType } from "../../generated/prisma";
import { prisma } from "../../shared/db/prisma";
import { currentYearMonth, daysInYearMonth, fromIsoDate, shiftMonth, todayIso, type IsoDate } from "../../shared/lib/dates";
import { Decimal } from "../../shared/lib/money";
import { defaultCategoryRows } from "../categories/default-categories";
import { periodsService } from "../periods/periods.service";

/** Gerador pseudo-aleatório com semente, para os dados serem sempre iguais (o mesmo do mock do front). */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const BUDGETS: Record<string, string> = {
  Supermercado: "9000",
  "Pão e mercearia": "1800",
  Transporte: "2500",
  "Restaurantes e lanches": "3500",
  Roupa: "3000",
  "Lazer e passeios": "4000",
};

/**
 * Substitui todos os dados financeiros do utilizador por seis meses de exemplo.
 * Mantém a conta de utilizador e o histórico de emails. Escreve directamente (sem a regra dos períodos):
 * no início do ano os seis meses entram no ano anterior, que fica registado como fechado.
 */
export async function resetDemoData(userId: string) {
  const rand = mulberry32(42);
  const between = (min: number, max: number) => Math.round((min + rand() * (max - min)) / 10) * 10;
  const today = todayIso();
  const thisMonth = currentYearMonth();
  const dayOf = (month: string, day: number): IsoDate => `${month}-${String(Math.min(day, daysInYearMonth(month))).padStart(2, "0")}`;
  const monthsAgo = (n: number, day = 6) => dayOf(shiftMonth(thisMonth, -n), day);
  const year = Number(thisMonth.slice(0, 4));

  await prisma.$transaction(async (tx) => {
    await tx.transaction.deleteMany({ where: { userId } });
    await tx.goal.deleteMany({ where: { userId } });
    await tx.investment.deleteMany({ where: { userId } });
    await tx.budget.deleteMany({ where: { userId } });
    await tx.category.deleteMany({ where: { userId } });
    await tx.account.deleteMany({ where: { userId } });
    await tx.alertRead.deleteMany({ where: { userId } });

    // Um segundo entre contas: criadas no mesmo milissegundo, a ordem da lista ficava ao acaso
    const createdFrom = Date.now();
    let created = 0;
    const account = (name: string, type: "BANK" | "MOBILE_WALLET" | "CASH" | "SAVINGS", color: string, initialBalance: string, institution?: string) =>
      tx.account.create({ data: { userId, name, type, color, initialBalance, institution, createdAt: new Date(createdFrom + created++ * 1000) } });
    const bank = await account("Conta ordenado", "BANK", "#2563eb", "18500", "BCI");
    const mpesa = await account("M-Pesa", "MOBILE_WALLET", "#dc2626", "1200", "Vodacom");
    const cash = await account("Carteira", "CASH", "#16a34a", "1500");
    const savings = await account("Poupança", "SAVINGS", "#9333ea", "32000", "BCI");

    await tx.category.createMany({ data: defaultCategoryRows().map((c) => ({ ...c, userId })) });
    const categories = new Map((await tx.category.findMany({ where: { userId } })).map((c) => [c.name, c.id]));
    const cat = (name: string) => categories.get(name)!;

    await tx.budget.createMany({ data: Object.entries(BUDGETS).map(([name, limit]) => ({ userId, categoryId: cat(name), limit })) });

    const transactions: Prisma.TransactionCreateManyInput[] = [];
    const add = (type: TransactionType, date: IsoDate, description: string, amount: number, accountId: string, extra: { categoryId?: string; destinationAccountId?: string; status?: TransactionStatus } = {}) => {
      transactions.push({
        userId,
        type,
        description,
        amount: new Decimal(amount),
        date: fromIsoDate(date),
        accountId,
        categoryId: extra.categoryId,
        destinationAccountId: extra.destinationAccountId,
        // Tudo o que é futuro fica como previsto
        status: extra.status ?? (date > today ? "PENDING" : "CLEARED"),
        // Um segundo por registo: a ordem "mais recente primeiro" fica igual à de inserção
        createdAt: new Date(Date.parse(`${date}T12:00:00Z`) + transactions.length * 1000),
      });
    };

    for (let offset = -5; offset <= 0; offset++) {
      const month = shiftMonth(thisMonth, offset);
      const days = daysInYearMonth(month);
      const at = (day: number) => dayOf(month, day);
      const isCurrent = offset === 0;
      // No mês actual só se gera o dia-a-dia até hoje; as contas fixas aparecem como previstas
      const lastDay = isCurrent ? Number(today.slice(8, 10)) : days;

      add("INCOME", at(5), "Salário", 45000, bank.id, { categoryId: cat("Salário") });
      add("TRANSFER", at(6), "Reforço da poupança", 5000, bank.id, { destinationAccountId: savings.id });
      add("TRANSFER", at(6), "Carregamento M-Pesa", 3000, bank.id, { destinationAccountId: mpesa.id });
      add("TRANSFER", at(6), "Levantamento", 4500, bank.id, { destinationAccountId: cash.id });
      add("EXPENSE", at(7), "Renda do apartamento", 12000, bank.id, { categoryId: cat("Renda e casa") });
      add("EXPENSE", at(10), "Credelec", between(1200, 1800), mpesa.id, { categoryId: cat("Energia e água") });
      add("EXPENSE", at(12), "Água (FIPAG)", between(450, 650), mpesa.id, { categoryId: cat("Energia e água") });
      add("EXPENSE", at(22), "Internet de casa", 2000, bank.id, { categoryId: cat("Internet e telemóvel") });

      const sideJobs = 1 + Math.floor(rand() * 3);
      for (let i = 0; i < sideJobs; i++) {
        const day = 3 + Math.floor(rand() * (days - 3));
        if (!isCurrent || day <= lastDay) {
          add("INCOME", at(day), ["Serviço de design", "Venda de equipamento", "Consultoria"][i % 3], between(2500, 9000), mpesa.id, {
            categoryId: cat("Negócios extra"),
          });
        }
      }

      for (let day = 1; day <= lastDay; day++) {
        const weekday = fromIsoDate(at(day)).getUTCDay();
        if (rand() < 0.55) add("EXPENSE", at(day), "Padaria", between(50, 180), cash.id, { categoryId: cat("Pão e mercearia") });
        if (weekday >= 1 && weekday <= 5 && rand() < 0.6) {
          add("EXPENSE", at(day), rand() < 0.7 ? "Chapa" : "Táxi", between(40, 350), cash.id, { categoryId: cat("Transporte") });
        }
        if (weekday === 6) add("EXPENSE", at(day), "Compras do mês · Shoprite", between(1800, 3200), bank.id, { categoryId: cat("Supermercado") });
        if ((weekday === 5 || weekday === 6) && rand() < 0.45) {
          add("EXPENSE", at(day), ["Jantar fora", "Lanche", "Pizza"][Math.floor(rand() * 3)], between(350, 1600), mpesa.id, {
            categoryId: cat("Restaurantes e lanches"),
          });
        }
        if (weekday === 0 && rand() < 0.4) add("EXPENSE", at(day), "Passeio de domingo", between(600, 2200), mpesa.id, { categoryId: cat("Lazer e passeios") });
        if (rand() < 0.08) add("EXPENSE", at(day), "Recarga de saldo", between(100, 400), mpesa.id, { categoryId: cat("Internet e telemóvel") });
        if (rand() < 0.04) add("EXPENSE", at(day), "Farmácia", between(300, 1400), mpesa.id, { categoryId: cat("Saúde") });
      }

      if (rand() < 0.7) add("EXPENSE", at(Math.min(15 + Math.floor(rand() * 10), lastDay)), "Roupa", between(1200, 4500), bank.id, { categoryId: cat("Roupa") });
      if (rand() < 0.3) add("EXPENSE", at(Math.min(18, lastDay)), "Presente de aniversário", between(800, 2500), mpesa.id, { categoryId: cat("Presentes") });
      // O que sobra no M-Pesa dos negócios extra vai para o banco no fim do mês
      add("TRANSFER", at(28), "M-Pesa para o banco", 6000, mpesa.id, { destinationAccountId: bank.id });
    }
    await tx.transaction.createMany({ data: transactions });

    const contribution = (amount: number, date: IsoDate, note?: string) => ({ amount, date: fromIsoDate(date), note, createdAt: new Date(`${date}T12:00:00Z`) });
    await tx.goal.create({
      data: {
        userId,
        name: "Fundo de emergência",
        icon: "health",
        color: "#0d9488",
        target: 150000,
        accountId: savings.id,
        createdAt: new Date(`${monthsAgo(6, 1)}T12:00:00Z`),
        contributions: {
          create: [contribution(32000, monthsAgo(6, 1), "Saldo que já estava na poupança"), ...[5, 4, 3, 2, 1, 0].map((n) => contribution(5000, monthsAgo(n), "Reforço mensal"))],
        },
      },
    });
    await tx.goal.create({
      data: {
        userId,
        name: "Férias em Inhambane",
        icon: "plane",
        color: "#2563eb",
        target: 25000,
        deadline: fromIsoDate(`${year}-12-20`),
        createdAt: new Date(`${monthsAgo(3, 10)}T12:00:00Z`),
        contributions: { create: [contribution(4000, monthsAgo(3, 10)), contribution(3000, monthsAgo(2, 10)), contribution(2000, monthsAgo(1, 10))] },
      },
    });
    await tx.goal.create({
      data: {
        userId,
        name: "Portátil novo",
        icon: "phone",
        color: "#7c3aed",
        target: 60000,
        deadline: fromIsoDate(`${year + 1}-03-31`),
        createdAt: new Date(`${monthsAgo(2, 15)}T12:00:00Z`),
        contributions: { create: [contribution(10000, monthsAgo(2, 15)), contribution(5000, monthsAgo(1, 15))] },
      },
    });

    /** Avaliações mensais: juro simples para taxa fixa, passeio aleatório para acções. */
    const valuations = (invested: number, startDate: IsoDate, startMonthsAgo: number, monthly: (v: number) => number) => {
      let value = invested;
      const later = Array.from({ length: startMonthsAgo }, (_, i) => {
        value = monthly(value);
        const n = startMonthsAgo - 1 - i;
        return { date: fromIsoDate(n === 0 ? today : monthsAgo(n, 28)), value: new Decimal(value).toDecimalPlaces(2) };
      });
      return [{ date: fromIsoDate(startDate), value: new Decimal(invested) }, ...later];
    };
    const maturity = (monthsAhead: number, day: number) => dayOf(shiftMonth(thisMonth, monthsAhead), day);

    await tx.investment.create({
      data: {
        userId,
        name: "Depósito a prazo 12 meses",
        type: "TERM_DEPOSIT",
        institution: "BCI",
        invested: 50000,
        annualRate: 9.5,
        startDate: fromIsoDate(monthsAgo(8, 1)),
        maturityDate: fromIsoDate(maturity(4, 1)),
        valuations: { create: valuations(50000, monthsAgo(8, 1), 8, (v) => v + (50000 * 0.095) / 12) },
      },
    });
    await tx.investment.create({
      data: {
        userId,
        name: "Obrigações do Tesouro 2025 – 1.ª série",
        type: "TREASURY_BONDS",
        institution: "BVM",
        invested: 30000,
        annualRate: 12,
        startDate: fromIsoDate(monthsAgo(5, 15)),
        maturityDate: fromIsoDate(`${year + 3}-05-15`),
        valuations: { create: valuations(30000, monthsAgo(5, 15), 5, (v) => v + (30000 * 0.12) / 12) },
      },
    });
    await tx.investment.create({
      data: {
        userId,
        name: "Acções CMH",
        type: "STOCKS",
        institution: "BVM",
        invested: 20000,
        startDate: fromIsoDate(monthsAgo(6, 3)),
        valuations: { create: valuations(20000, monthsAgo(6, 3), 6, (v) => v * (0.97 + rand() * 0.08)) },
      },
    });

    await tx.alertSettings.updateMany({
      where: { userId },
      data: { budgetThreshold: 85, billDaysAhead: 5, lowBalanceAmount: 1000, weeklySummary: true, monthlyReport: true },
    });
  }, { timeout: 30_000 });

  await periodsService.syncWithData();
}
