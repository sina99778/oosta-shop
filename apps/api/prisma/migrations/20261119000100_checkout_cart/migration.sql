CREATE TABLE "cart_lines" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "planId" TEXT NOT NULL REFERENCES "product_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "amount" DECIMAL(12,2) NOT NULL CHECK ("amount" > 0),
  "currency" TEXT NOT NULL, "signature" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL, "orderId" TEXT,
  UNIQUE ("userId","planId")
);
CREATE INDEX "cart_lines_expiresAt_idx" ON "cart_lines"("expiresAt");
ALTER TABLE "inventory_items" ADD COLUMN "cartLineId" TEXT REFERENCES "cart_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_items" ADD CONSTRAINT "cart_stock_reservation_check" CHECK ("cartLineId" IS NULL OR (status = 'RESERVED' AND "orderItemId" IS NULL));
CREATE INDEX "inventory_items_cartLineId_idx" ON "inventory_items"("cartLineId");
