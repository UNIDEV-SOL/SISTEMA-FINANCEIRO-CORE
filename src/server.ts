import { app } from "./app";
import { env } from "./config/env";
import { scheduleDailyEmails } from "./modules/alerts/alerts.job";
import { schedulePeriodsRollover } from "./modules/periods/periods.job";
import { prisma } from "./shared/db/prisma";
import { logger } from "./shared/logger";

const server = app.listen(env.PORT, () => {
  logger.info(`API a correr na porta ${env.PORT} (docs em /api-docs)`);
});

const emailsJob = scheduleDailyEmails();
const periodsJob = schedulePeriodsRollover();

async function shutdown(signal: string) {
  logger.info(`${signal} recebido, a terminar`);
  await emailsJob.stop();
  await periodsJob.stop();
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
