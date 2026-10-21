import cron from "node-cron";
import { env } from "../../config/env";
import { logger } from "../../shared/logger";
import { recurringService } from "./recurring.service";

async function run() {
  try {
    await recurringService.materialize();
  } catch (error) {
    logger.error("Falha a gerar as transações recorrentes", { error });
  }
}

/** Ao arrancar e todos os dias às 00:10 no fuso da aplicação, depois da passagem de ano (a lista também gera). */
export function scheduleRecurring() {
  void run();
  return cron.schedule("10 0 * * *", () => void run(), { timezone: env.APP_TZ });
}
