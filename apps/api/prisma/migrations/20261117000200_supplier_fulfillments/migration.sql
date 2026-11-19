CREATE TABLE "supplier_fulfillments" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "reference" TEXT NOT NULL,
  "supplier" TEXT NOT NULL,
  "externalId" TEXT NOT NULL,
  "variantKey" TEXT NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "quoteId" TEXT NOT NULL,
  "maximumCost" DECIMAL(18,6) NOT NULL,
  "currency" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'READY',
  "supplierOrderId" TEXT,
  "chargedCost" DECIMAL(18,6),
  "result" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "supplier_fulfillments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "supplier_fulfillments_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "supplier_fulfillments_state_check" CHECK ("state" IN ('READY','SENDING','PENDING','UNCERTAIN','DELIVERED','NO_CHARGE','REVIEW')),
  CONSTRAINT "supplier_fulfillments_currency_check" CHECK ("currency" IN ('USD','USDT')),
  CONSTRAINT "supplier_fulfillments_cost_check" CHECK ("maximumCost" > 0 AND ("chargedCost" IS NULL OR "chargedCost" > 0))
);
CREATE UNIQUE INDEX "supplier_fulfillments_orderId_key" ON "supplier_fulfillments"("orderId");
CREATE UNIQUE INDEX "supplier_fulfillments_reference_key" ON "supplier_fulfillments"("reference");
CREATE UNIQUE INDEX "supplier_fulfillments_supplier_supplierOrderId_key" ON "supplier_fulfillments"("supplier", "supplierOrderId");
