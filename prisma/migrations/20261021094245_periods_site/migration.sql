-- CreateEnum
CREATE TYPE "PeriodStatus" AS ENUM ('OPEN', 'CLOSED');

-- AlterEnum
ALTER TYPE "SettingType" ADD VALUE 'JSON';

-- CreateTable
CREATE TABLE "periods" (
    "year" INTEGER NOT NULL,
    "status" "PeriodStatus" NOT NULL,
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" UUID,

    CONSTRAINT "periods_pkey" PRIMARY KEY ("year")
);

-- Só um ano corrente
CREATE UNIQUE INDEX "periods_single_current" ON "periods" ("isCurrent") WHERE "isCurrent";
