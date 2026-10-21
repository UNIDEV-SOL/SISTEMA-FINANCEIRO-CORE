-- CreateEnum
CREATE TYPE "TextSize" AS ENUM ('NORMAL', 'LARGE', 'XLARGE');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "highContrast" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reduceMotion" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "textSize" "TextSize" NOT NULL DEFAULT 'NORMAL';

-- CreateTable
CREATE TABLE "growth_plan_types" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "annualReturn" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "defaultMonths" INTEGER NOT NULL DEFAULT 12,
    "tips" TEXT NOT NULL DEFAULT '',
    "order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "growth_plan_types_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "growth_plan_types_code_key" ON "growth_plan_types"("code");

-- CreateIndex
CREATE INDEX "growth_plan_types_active_order_idx" ON "growth_plan_types"("active", "order");
