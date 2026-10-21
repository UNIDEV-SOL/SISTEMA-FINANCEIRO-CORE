import { runDailyEmails } from "../modules/alerts/alerts.job";
import { prisma } from "../shared/db/prisma";

/** Corre já a tarefa diária de emails (a mesma que corre às 08:00). Uso: yarn emails:run [AAAA-MM-DD] */
runDailyEmails(process.argv[2])
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
