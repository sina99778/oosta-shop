ALTER TABLE "supplier_fulfillments" DROP CONSTRAINT "supplier_fulfillments_state_check";
ALTER TABLE "supplier_fulfillments" ADD COLUMN "approvedCost" DECIMAL(18,6) CHECK ("approvedCost" > 0);
ALTER TABLE "supplier_fulfillments" ADD CONSTRAINT "supplier_fulfillments_state_check"
CHECK ("state" IN ('AWAITING_PAYMENT','AWAITING_FUNDS','READY','SENDING','PENDING','UNCERTAIN','DELIVERED','NO_CHARGE','REVIEW','REJECTED','REFUNDED'));

CREATE TABLE "email_outbox" (
  "id" TEXT PRIMARY KEY, "orderId" TEXT NOT NULL, "kind" TEXT NOT NULL, "to" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING', "attempts" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "nextAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "sentAt" TIMESTAMP(3)
);
CREATE UNIQUE INDEX "email_outbox_orderId_kind_key" ON "email_outbox"("orderId","kind");
CREATE INDEX "email_outbox_status_nextAt_idx" ON "email_outbox"("status","nextAt");
