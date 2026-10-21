import cron from "node-cron";
import { env } from "../../config/env";
import type { Currency, EmailKind, User } from "../../generated/prisma";
import { prisma } from "../../shared/db/prisma";
import { addDays, currentYearMonth, fromIsoDate, monthRange, shiftMonth, todayIso, type IsoDate } from "../../shared/lib/dates";
import { formatDate, formatMoney, formatMonth } from "../../shared/lib/format";
import { ratio, sum } from "../../shared/lib/money";
import { logger } from "../../shared/logger";
import { sendMail } from "../../shared/mail/mailer";
import { appSettings } from "../../shared/settings/app-settings";
import { alertsEmail, summaryEmail } from "../../shared/mail/templates";
import { computeAlerts } from "./alerts.rules";
import { loadAlertSettings } from "./alerts.service";

type UserWithCurrency = User & { currencyRef: Currency };

/** Envia e regista; `ref` garante que o mesmo email não sai duas vezes. */
async function deliver(user: User, kind: EmailKind, refs: string[], to: string, subject: string, html: string) {
  try {
    await sendMail(to, subject, html);
    await prisma.emailLog.createMany({ data: refs.map((ref) => ({ userId: user.id, kind, ref, to, subject, status: "SENT" as const })) });
  } catch (error) {
    logger.error("Falha ao enviar email", { userId: user.id, kind, error });
    await prisma.emailLog.create({ data: { userId: user.id, kind, ref: refs[0], to, subject, status: "FAILED", error: String(error) } });
  }
}

async function alreadySent(userId: string, kind: EmailKind, refs: string[]): Promise<Set<string>> {
  const sent = await prisma.emailLog.findMany({ where: { userId, kind, status: "SENT", ref: { in: refs } }, select: { ref: true } });
  return new Set(sent.map((s) => s.ref));
}

/** Resumo de receitas e despesas liquidadas num intervalo [from, to). */
async function periodSummary(user: UserWithCurrency, range: { gte: Date; lt: Date }) {
  const transactions = await prisma.transaction.findMany({
    where: { userId: user.id, status: "CLEARED", type: { in: ["INCOME", "EXPENSE"] }, date: range },
    include: { category: { select: { name: true } } },
  });
  const income = sum(transactions.filter((t) => t.type === "INCOME").map((t) => t.amount));
  const expenses = transactions.filter((t) => t.type === "EXPENSE");
  const expense = sum(expenses.map((t) => t.amount));
  const byCategory = new Map<string, ReturnType<typeof sum>>();
  for (const t of expenses) byCategory.set(t.category!.name, (byCategory.get(t.category!.name) ?? sum([])).add(t.amount));
  const money = (v: Parameters<typeof formatMoney>[0]) => formatMoney(v, user.currencyRef.symbol);
  return {
    rows: [
      { label: "Receitas", value: money(income) },
      { label: "Despesas", value: money(expense) },
      { label: "Saldo", value: money(income.sub(expense)) },
    ],
    categories: [...byCategory.entries()]
      .sort(([, a], [, b]) => b.comparedTo(a))
      .slice(0, 5)
      .map(([name, value]) => ({ name, value: money(value) })),
    overspent: expense.greaterThan(income),
  };
}

function isoWeek(iso: IsoDate): string {
  const d = fromIsoDate(iso);
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - yearStart) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

async function emailsFor(user: UserWithCurrency, today: IsoDate) {
  const settings = await loadAlertSettings(user.id);

  // Alertas novos (os informativos não justificam email)
  const alerts = (await computeAlerts(user.id, settings, user.currencyRef.symbol, today)).filter((a) => a.severity !== "info");
  if (alerts.length) {
    const sent = await alreadySent(user.id, "ALERT", alerts.map((a) => a.id));
    const fresh = alerts.filter((a) => !sent.has(a.id));
    if (fresh.length) {
      const subject = fresh.length === 1 ? fresh[0].title : `${fresh.length} alertas nas suas finanças`;
      await deliver(user, "ALERT", fresh.map((a) => a.id), settings.email, subject, alertsEmail(user.name, fresh));
    }
  }

  // Resumo semanal à segunda-feira, da semana anterior
  if (settings.weeklySummary && fromIsoDate(today).getUTCDay() === 1) {
    const ref = `weekly:${isoWeek(addDays(today, -7))}`;
    if (!(await alreadySent(user.id, "WEEKLY_SUMMARY", [ref])).size) {
      const from = addDays(today, -7);
      const summary = await periodSummary(user, { gte: fromIsoDate(from), lt: fromIsoDate(today) });
      const heading = `Resumo de ${formatDate(from)} a ${formatDate(addDays(today, -1))}`;
      const notes = summary.overspent ? ["Nesta semana as despesas passaram as receitas."] : [];
      await deliver(user, "WEEKLY_SUMMARY", [ref], settings.email, "O seu resumo semanal", summaryEmail(user.name, { heading, ...summary, notes }));
    }
  }

  // Relatório mensal no dia 1, do mês anterior
  if (settings.monthlyReport && today.endsWith("-01")) {
    const month = shiftMonth(currentYearMonth(fromIsoDate(today)), -1);
    const ref = `monthly:${month}`;
    if (!(await alreadySent(user.id, "MONTHLY_REPORT", [ref])).size) {
      const summary = await periodSummary(user, monthRange(month));
      const budgets = await prisma.budget.findMany({ where: { userId: user.id }, include: { category: { select: { name: true } } } });
      const spent = await prisma.transaction.groupBy({
        by: ["categoryId"],
        where: { userId: user.id, type: "EXPENSE", status: "CLEARED", date: monthRange(month) },
        _sum: { amount: true },
      });
      const notes = budgets
        .map((b) => ({ name: b.category.name, used: ratio(spent.find((s) => s.categoryId === b.categoryId)?._sum.amount ?? 0, b.limit) ?? 0 }))
        .filter((b) => b.used > 100)
        .map((b) => `Ultrapassou o orçamento de ${b.name} (${Math.round(b.used)}%).`);
      const heading = `Relatório de ${formatMonth(month)}`;
      await deliver(user, "MONTHLY_REPORT", [ref], settings.email, heading, summaryEmail(user.name, { heading, ...summary, notes }));
    }
  }
}

/** Corre os emails de todos os utilizadores. Seguro de repetir no mesmo dia. */
export async function runDailyEmails(today = todayIso()) {
  if (!(await appSettings.get("emails.enabled"))) {
    logger.info("Emails desligados nos parâmetros do sistema (emails.enabled)");
    return;
  }
  // Contas desactivadas não recebem emails
  const users = await prisma.user.findMany({ where: { active: true }, include: { currencyRef: true } });
  for (const user of users) {
    try {
      await emailsFor(user, today);
    } catch (error) {
      logger.error("Falha nos emails do utilizador", { userId: user.id, error });
    }
  }
  logger.info(`Emails diários processados para ${users.length} utilizador(es)`);
}

/** Todos os dias às 08:00 no fuso da aplicação. */
export function scheduleDailyEmails() {
  return cron.schedule("0 8 * * *", () => void runDailyEmails(), { timezone: env.APP_TZ });
}
