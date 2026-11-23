CREATE TABLE "blu_bank_observations" (
    "transactionDigest" TEXT NOT NULL,
    "invoiceKey" TEXT NOT NULL,
    "trackingDigest" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "matchedOrderId" TEXT,
    "reviewRequired" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "blu_bank_observations_pkey" PRIMARY KEY ("transactionDigest")
);
CREATE UNIQUE INDEX "blu_bank_observations_matchedOrderId_key" ON "blu_bank_observations"("matchedOrderId");
CREATE INDEX "blu_bank_observations_invoiceKey_idx" ON "blu_bank_observations"("invoiceKey");
ALTER TABLE "blu_bank_observations" ADD CONSTRAINT "blu_bank_observations_matchedOrderId_fkey" FOREIGN KEY ("matchedOrderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
