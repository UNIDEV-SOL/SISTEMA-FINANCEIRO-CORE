-- Perfis, permissões, parâmetros do sistema, moedas, família e auditoria.
-- A moeda do utilizador deixa de ser um enum e passa a FK para "currencies";
-- os utilizadores existentes ficam com o perfil USER. Nada se perde.

-- CreateEnum
CREATE TYPE "Action" AS ENUM ('VIEW', 'CREATE', 'EDIT', 'DELETE', 'EXPORT', 'IMPORT');

-- CreateEnum
CREATE TYPE "SettingType" AS ENUM ('STRING', 'NUMBER', 'BOOLEAN', 'SELECT', 'TEXT');

-- CreateEnum
CREATE TYPE "FamilyAccess" AS ENUM ('VIEW', 'MANAGE');

-- CreateEnum
CREATE TYPE "FamilyLinkStatus" AS ENUM ('PENDING', 'ACTIVE', 'REVOKED');

-- CreateTable
CREATE TABLE "currencies" (
    "code" VARCHAR(3) NOT NULL,
    "name" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "decimals" INTEGER NOT NULL DEFAULT 2,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "currencies_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "profiles" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "superAdmin" BOOLEAN NOT NULL DEFAULT false,
    "system" BOOLEAN NOT NULL DEFAULT false,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("id")
);

-- Moedas (antes eram o enum "CurrencyCode")
INSERT INTO "currencies" ("code", "name", "symbol", "decimals", "active", "order") VALUES
  ('MZN', 'Metical moçambicano', 'MT', 2, true, 1),
  ('AOA', 'Kwanza', 'Kz', 2, true, 2),
  ('BRL', 'Real', 'R$', 2, true, 3),
  ('EUR', 'Euro', '€', 2, true, 4),
  ('USD', 'Dólar', 'US$', 2, true, 5),
  ('ZAR', 'Rand', 'R', 2, true, 6);

-- Perfil por omissão, para os utilizadores que já existem (os restantes vêm do seed)
INSERT INTO "profiles" ("id", "code", "name", "description", "superAdmin", "system", "isDefault", "updatedAt") VALUES
  (gen_random_uuid(), 'USER', 'Utilizador', 'Acesso a todos os módulos pessoais.', false, true, true, CURRENT_TIMESTAMP);

-- Converte a moeda do enum para texto, mantendo o valor
ALTER TABLE "users" ALTER COLUMN "currency" DROP DEFAULT;
ALTER TABLE "users" ALTER COLUMN "currency" TYPE VARCHAR(3) USING "currency"::text;
DROP TYPE "CurrencyCode";

-- Novas colunas; o perfil é preenchido antes de passar a obrigatório
ALTER TABLE "users"
  ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "lastLoginAt" TIMESTAMP(3),
  ADD COLUMN "profileId" UUID;
UPDATE "users" SET "profileId" = (SELECT "id" FROM "profiles" WHERE "code" = 'USER');
ALTER TABLE "users" ALTER COLUMN "profileId" SET NOT NULL;

-- CreateTable
CREATE TABLE "functionalities" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "path" TEXT,
    "icon" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "parentId" UUID,
    "apiPaths" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "protectReads" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "functionalities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profile_functionalities" (
    "profileId" UUID NOT NULL,
    "functionalityId" UUID NOT NULL,
    "actions" "Action"[],

    CONSTRAINT "profile_functionalities_pkey" PRIMARY KEY ("profileId","functionalityId")
);

-- CreateTable
CREATE TABLE "system_settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "type" "SettingType" NOT NULL,
    "group" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "options" JSONB,
    "constraints" JSONB,
    "public" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" UUID,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "family_links" (
    "id" UUID NOT NULL,
    "guardianId" UUID NOT NULL,
    "memberId" UUID NOT NULL,
    "access" "FamilyAccess" NOT NULL,
    "status" "FamilyLinkStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "family_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actorId" UUID,
    "actorName" TEXT,
    "actingAsId" UUID,
    "action" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "statusCode" INTEGER NOT NULL,
    "functionalityCode" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "durationMs" INTEGER NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "profiles_code_key" ON "profiles"("code");

-- CreateIndex
CREATE UNIQUE INDEX "functionalities_code_key" ON "functionalities"("code");

-- CreateIndex
CREATE INDEX "functionalities_parentId_idx" ON "functionalities"("parentId");

-- CreateIndex
CREATE INDEX "family_links_memberId_status_idx" ON "family_links"("memberId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "family_links_guardianId_memberId_key" ON "family_links"("guardianId", "memberId");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_actorId_createdAt_idx" ON "audit_logs"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_action_createdAt_idx" ON "audit_logs"("action", "createdAt");

-- CreateIndex
CREATE INDEX "users_profileId_idx" ON "users"("profileId");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_currency_fkey" FOREIGN KEY ("currency") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "functionalities" ADD CONSTRAINT "functionalities_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "functionalities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_functionalities" ADD CONSTRAINT "profile_functionalities_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_functionalities" ADD CONSTRAINT "profile_functionalities_functionalityId_fkey" FOREIGN KEY ("functionalityId") REFERENCES "functionalities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "family_links" ADD CONSTRAINT "family_links_guardianId_fkey" FOREIGN KEY ("guardianId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "family_links" ADD CONSTRAINT "family_links_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Regras que o Prisma não exprime
ALTER TABLE "currencies" ADD CONSTRAINT "currencies_code_format" CHECK ("code" ~ '^[A-Z]{3}$');
ALTER TABLE "currencies" ADD CONSTRAINT "currencies_decimals_range" CHECK ("decimals" BETWEEN 0 AND 4);
ALTER TABLE "family_links" ADD CONSTRAINT "family_links_not_self" CHECK ("guardianId" <> "memberId");
