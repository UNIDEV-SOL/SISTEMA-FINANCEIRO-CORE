import cron from "node-cron";
import { env } from "../../config/env";
import { logger } from "../../shared/logger";
import { periodsService } from "./periods.service";

async function rollover() {
  try {
    await periodsService.ensureCurrent();
  } catch (error) {
    logger.error("Falha na passagem de ano dos períodos", { error });
  }
}

/** Passagem de ano: ao arrancar e todos os dias às 00:05 no fuso da aplicação (os pedidos também a fazem). */
export function schedulePeriodsRollover() {
  void rollover();
  return cron.schedule("5 0 * * *", () => void rollover(), { timezone: env.APP_TZ });
}
