import type { Prisma } from "../generated/prisma";
import { accessPolicy } from "../shared/access/policy";
import { prisma } from "../shared/db/prisma";
import { appSettings } from "../shared/settings/app-settings";
import { SETTING_DEFINITIONS } from "../shared/settings/definitions";
import { periodsService } from "../modules/periods/periods.service";
import { LATER_GRANTS, MENU, PROFILES, type MenuSeed } from "./access";
import { seedGrowthPlans } from "./growth-plans";
import { seedHelpContent } from "./help-content";

/** Moedas iniciais (as mesmas da migração que substituiu o enum). */
export const CURRENCIES = [
  { code: "MZN", name: "Metical moçambicano", symbol: "MT", decimals: 2, order: 1 },
  { code: "AOA", name: "Kwanza", symbol: "Kz", decimals: 2, order: 2 },
  { code: "BRL", name: "Real", symbol: "R$", decimals: 2, order: 3 },
  { code: "EUR", name: "Euro", symbol: "€", decimals: 2, order: 4 },
  { code: "USD", name: "Dólar", symbol: "US$", decimals: 2, order: 5 },
  { code: "ZAR", name: "Rand", symbol: "R", decimals: 2, order: 6 },
];

const json = (v: unknown) => v as Prisma.InputJsonValue;

/**
 * Dados de referência: moedas, parâmetros, menus, perfis, permissões e o manual/FAQ (`content/`).
 * Idempotente e só cria o que falta — nunca sobrescreve o que foi alterado no painel.
 * Corre no `yarn seed` e no arranque de cada teste.
 */
export async function seedReferenceData() {
  await prisma.currency.createMany({ data: CURRENCIES, skipDuplicates: true });

  await prisma.systemSetting.createMany({
    data: SETTING_DEFINITIONS.map((d, i) => ({
      key: d.key,
      value: json(d.value),
      type: d.type,
      group: d.group,
      label: d.label,
      description: d.description ?? null,
      options: "options" in d && d.options ? json(d.options) : undefined,
      constraints: "constraints" in d && d.constraints ? json(d.constraints) : undefined,
      public: "public" in d ? !!d.public : false,
      order: (i + 1) * 10,
    })),
    skipDuplicates: true,
  });

  // Menus: primeiro as secções, depois os filhos (precisam do id do pai)
  const rows = (items: MenuSeed[], parentId: string | null) =>
    items.map((item, i) => ({
      code: item.code,
      label: item.label,
      path: item.path ?? null,
      icon: item.icon ?? null,
      order: i + 1,
      parentId,
      apiPaths: item.apiPaths ?? [],
      protectReads: item.protectReads ?? false,
    }));
  const existingCodes = new Set((await prisma.functionality.findMany({ select: { code: true } })).map((f) => f.code));
  await prisma.functionality.createMany({ data: rows(MENU, null), skipDuplicates: true });
  const sections = await prisma.functionality.findMany({ where: { code: { in: MENU.map((m) => m.code) } }, select: { id: true, code: true } });
  await prisma.functionality.createMany({
    data: MENU.flatMap((section) => rows(section.children ?? [], sections.find((s) => s.code === section.code)!.id)),
    skipDuplicates: true,
  });

  // Caminhos de leitura acrescentados depois: junta-os aos menus de sistema que ainda não os têm
  for (const item of MENU.flatMap((section) => section.children ?? [])) {
    const readPaths = (item.apiPaths ?? []).filter((p) => p.startsWith("GET "));
    if (!readPaths.length) continue;
    const current = await prisma.functionality.findUnique({ where: { code: item.code }, select: { apiPaths: true } });
    const missing = readPaths.filter((p) => !current?.apiPaths.includes(p));
    if (current && missing.length) await prisma.functionality.update({ where: { code: item.code }, data: { apiPaths: [...current.apiPaths, ...missing] } });
  }

  // O Dashboard passou de "/" para "/painel" ("/" é agora o site público); só muda se ninguém o alterou
  await prisma.functionality.updateMany({ where: { code: "DASHBOARD", path: "/" }, data: { path: "/painel" } });

  // Só há um perfil por omissão: o do seed só o é se ainda não houver nenhum
  const hasDefault = await prisma.profile.count({ where: { isDefault: true } });
  await prisma.profile.createMany({
    data: PROFILES.map((p) => ({
      code: p.code,
      name: p.name,
      description: p.description,
      superAdmin: !!p.superAdmin,
      system: true,
      isDefault: !!p.isDefault && !hasDefault,
    })),
    skipDuplicates: true,
  });

  // Permissões só para perfis acabados de criar ou sem nenhuma (não repõe o que o admin retirou)
  const [profiles, functionalities] = await Promise.all([
    prisma.profile.findMany({ where: { code: { in: PROFILES.map((p) => p.code) } }, select: { id: true, code: true, _count: { select: { permissions: true } } } }),
    prisma.functionality.findMany({ select: { id: true, code: true } }),
  ]);
  const idOf = new Map(functionalities.map((f) => [f.code, f.id]));
  await prisma.profileFunctionality.createMany({
    data: profiles
      .filter((p) => p._count.permissions === 0)
      .flatMap((p) =>
        Object.entries(PROFILES.find((s) => s.code === p.code)!.permissions)
          .filter(([code]) => idOf.has(code))
          .map(([code, actions]) => ({ profileId: p.id, functionalityId: idOf.get(code)!, actions: [...actions] })),
      ),
    skipDuplicates: true,
  });

  // Funcionalidades novas nesta execução: dá as permissões previstas aos perfis de sistema que já existiam
  const fresh = LATER_GRANTS.filter((g) => !existingCodes.has(g.functionality) && existingCodes.size > 0 && idOf.has(g.functionality));
  if (fresh.length) {
    const byCode = new Map((await prisma.profile.findMany({ where: { code: { in: fresh.map((g) => g.profile) } }, select: { id: true, code: true } })).map((p) => [p.code, p.id]));
    await prisma.profileFunctionality.createMany({
      data: fresh
        .filter((g) => byCode.has(g.profile))
        .map((g) => ({ profileId: byCode.get(g.profile)!, functionalityId: idOf.get(g.functionality)!, actions: g.actions })),
      // Não mexe numa linha que já exista
      skipDuplicates: true,
    });
  }

  await seedHelpContent();
  await seedGrowthPlans();

  appSettings.invalidate();
  accessPolicy.invalidate();

  // Ano corrente aberto e anos com dados registados (os anteriores fechados)
  await periodsService.syncWithData();
}
