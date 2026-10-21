import { app } from "./app";
import { env } from "./config/env";
import { scheduleDailyEmails } from "./modules/alerts/alerts.job";
import { schedulePeriodsRollover } from "./modules/periods/periods.job";
import { scheduleRecurring } from "./modules/recurring/recurring.job";
import { seedReferenceData } from "./seed/reference-data";
import { prisma } from "./shared/db/prisma";
import { logger } from "./shared/logger";

async function start() {
  // Menus, permissões, parâmetros e conteúdos novos de uma versão chegam às bases já existentes.
  // Idempotente: só cria o que falta e nunca sobrescreve o que foi alterado no painel.
  try {
    await seedReferenceData();
  } catch (error) {
    logger.error("Falha ao actualizar os dados de referência", { error });
  }

  const server = app.listen(env.PORT, () => {
    logger.info(`API a correr na porta ${env.PORT} (docs em /api-docs)`);
  });

  const emailsJob = scheduleDailyEmails();
  const periodsJob = schedulePeriodsRollover();
  const recurringJob = scheduleRecurring();

  async function shutdown(signal: string) {
    logger.info(`${signal} recebido, a terminar`);
    await emailsJob.stop();
    await periodsJob.stop();
    await recurringJob.stop();
    server.close(async () => {
      await prisma.$disconnect();
      process.exit(0);
    });
  }

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

void start();
