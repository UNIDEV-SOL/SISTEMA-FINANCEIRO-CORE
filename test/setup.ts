import { seedReferenceData } from "../src/seed/reference-data";
import { prisma } from "../src/shared/db/prisma";
import { flushAudit } from "../src/shared/middleware/audit";

beforeEach(async () => {
  // Escritas de auditoria do teste anterior não podem cair no seguinte
  await flushAudit();
  // Os dados de referência também são apagados: os testes alteram parâmetros e permissões
  await prisma.$executeRawUnsafe(
    `TRUNCATE "users", "audit_logs", "profile_functionalities", "profiles", "functionalities", "system_settings", "currencies", "help_articles", "faqs", "periods", "growth_plan_types" CASCADE`,
  );
  await seedReferenceData();
});

afterAll(async () => {
  await flushAudit();
  await prisma.$disconnect();
});
