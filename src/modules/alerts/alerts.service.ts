import type { AlertSettings } from "../../generated/prisma";
import { prisma } from "../../shared/db/prisma";
import { toMoney } from "../../shared/lib/money";
import { appSettings } from "../../shared/settings/app-settings";
import { computeAlerts } from "./alerts.rules";
import type { AlertSettingsInput } from "./alerts.schemas";
import type { AlertList, AlertSettingsResponse } from "./alerts.types";

export const toAlertSettingsResponse = (s: AlertSettings): AlertSettingsResponse => ({
  email: s.email,
  budgetThreshold: s.budgetThreshold,
  budgetAlerts: s.budgetAlerts,
  billAlerts: s.billAlerts,
  billDaysAhead: s.billDaysAhead,
  lowBalanceAlerts: s.lowBalanceAlerts,
  lowBalanceAmount: toMoney(s.lowBalanceAmount),
  goalAlerts: s.goalAlerts,
  forecastAlerts: s.forecastAlerts,
  weeklySummary: s.weeklySummary,
  monthlyReport: s.monthlyReport,
});

/** As definições são criadas no registo; isto cobre utilizadores antigos sem elas. */
export async function loadAlertSettings(userId: string): Promise<AlertSettings> {
  const existing = await prisma.alertSettings.findUnique({ where: { userId } });
  if (existing) return existing;
  const [user, defaults] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true } }),
    appSettings.many("alerts.defaultBudgetThreshold", "alerts.defaultBillDaysAhead", "alerts.defaultLowBalance"),
  ]);
  return prisma.alertSettings.create({
    data: {
      userId,
      email: user.email,
      budgetThreshold: defaults["alerts.defaultBudgetThreshold"],
      billDaysAhead: defaults["alerts.defaultBillDaysAhead"],
      lowBalanceAmount: defaults["alerts.defaultLowBalance"],
    },
  });
}

export const alertsService = {
  async list(userId: string): Promise<AlertList> {
    const [settings, user, reads] = await Promise.all([
      loadAlertSettings(userId),
      prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { currencyRef: { select: { symbol: true } } } }),
      prisma.alertRead.findMany({ where: { userId }, select: { alertId: true } }),
    ]);
    const read = new Set(reads.map((r) => r.alertId));
    const items = (await computeAlerts(userId, settings, user.currencyRef.symbol)).map((a) => ({ ...a, read: read.has(a.id) }));
    return { items, unread: items.filter((a) => !a.read).length };
  },

  async markRead(userId: string, alertId: string): Promise<void> {
    await prisma.alertRead.upsert({ where: { userId_alertId: { userId, alertId } }, create: { userId, alertId }, update: {} });
  },

  async markAllRead(userId: string): Promise<void> {
    const { items } = await this.list(userId);
    await prisma.alertRead.createMany({ data: items.map((a) => ({ userId, alertId: a.id })), skipDuplicates: true });
  },

  async getSettings(userId: string): Promise<AlertSettingsResponse> {
    return toAlertSettingsResponse(await loadAlertSettings(userId));
  },

  async updateSettings(userId: string, input: AlertSettingsInput): Promise<AlertSettingsResponse> {
    await loadAlertSettings(userId);
    return toAlertSettingsResponse(await prisma.alertSettings.update({ where: { userId }, data: input }));
  },
};
