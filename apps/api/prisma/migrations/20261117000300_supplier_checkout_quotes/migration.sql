CREATE TABLE "supplier_checkout_quotes" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "planId" TEXT NOT NULL REFERENCES "product_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "signature" TEXT NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL CHECK ("amount" > 0),
  "selection" JSONB NOT NULL,
  "snapshot" JSONB NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "orderId" TEXT REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "supplier_checkout_quotes_orderId_key" ON "supplier_checkout_quotes"("orderId");
CREATE INDEX "supplier_checkout_quotes_userId_expiresAt_idx" ON "supplier_checkout_quotes"("userId", "expiresAt");
ALTER TABLE "supplier_fulfillments" DROP CONSTRAINT "supplier_fulfillments_state_check";
ALTER TABLE "supplier_fulfillments" ADD CONSTRAINT "supplier_fulfillments_state_check" CHECK ("state" IN ('AWAITING_PAYMENT','READY','SENDING','PENDING','UNCERTAIN','DELIVERED','NO_CHARGE','REVIEW'));
