import { env } from "../src/config/env";
import { resetDemoData } from "../src/modules/settings/demo-data";
import { seedReferenceData } from "../src/seed/reference-data";
import { seedDemoUser, seedSuperAdmin } from "../src/seed/users";
import { prisma } from "../src/shared/db/prisma";

/**
 * Dados de referência (moedas, parâmetros, menus, perfis), super administrador e
 * utilizador de demonstração com seis meses de dados. Uso: yarn seed (pode repetir-se).
 */
const DEMO = { name: "Igor Tobias", email: "demo@financas.local", password: "demo12345" };

async function main() {
  await seedReferenceData();
  console.log("Dados de referência prontos (moedas, parâmetros, menus, perfis e permissões)");

  const admin = await seedSuperAdmin();
  console.log(
    admin.created
      ? `Super administrador criado: ${admin.email} / ${env.ADMIN_PASSWORD}`
      : `Super administrador já existia: ${admin.email} (palavra-passe mantida)`,
  );

  const userId = await seedDemoUser(DEMO);
  await resetDemoData(userId);
  console.log(`Utilizador de demonstração pronto: ${DEMO.email} / ${DEMO.password}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
