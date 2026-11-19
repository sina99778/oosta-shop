ALTER TABLE "supplier_fulfillments" ADD COLUMN "walletExposure" DECIMAL(18,6);
ALTER TABLE "supplier_fulfillments" ADD CONSTRAINT "supplier_wallet_exposure_check" CHECK ("walletExposure" IS NULL OR "walletExposure" > 0);
ALTER TABLE "inventory_items" ADD COLUMN "deliveryInstructions" TEXT;
CREATE TABLE "supplier_wallet_budgets" (
  "supplier" TEXT PRIMARY KEY,
  "currency" TEXT NOT NULL CHECK ("currency" IN ('USD','USDT')),
  "authorizedAmount" DECIMAL(18,6) NOT NULL CHECK ("authorizedAmount" >= 0),
  "remainingAmount" DECIMAL(18,6) NOT NULL CHECK ("remainingAmount" >= 0 AND "remainingAmount" <= "authorizedAmount"),
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "activeReference" TEXT UNIQUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "supplier_wallet_active_check" CHECK ("activeReference" IS NULL OR "remainingAmount" = 0)
);
