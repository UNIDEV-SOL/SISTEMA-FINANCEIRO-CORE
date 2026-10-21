-- AlterTable
ALTER TABLE "transactions" ADD COLUMN     "importRef" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "transactions_userId_importRef_key" ON "transactions"("userId", "importRef");
