-- AlterEnum
ALTER TYPE "InventoryStatus" ADD VALUE 'REVOKED';

-- AlterEnum
ALTER TYPE "PaymentStatus" ADD VALUE 'PAID_UNFULFILLED';

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "expiresAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "orders_paymentStatus_expiresAt_idx" ON "orders"("paymentStatus", "expiresAt");
