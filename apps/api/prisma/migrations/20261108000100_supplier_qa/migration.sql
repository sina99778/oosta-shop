CREATE TABLE "supplier_qa_attempts" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "authorizationId" TEXT NOT NULL,
 "requestKey" TEXT NOT NULL,
 "reference" TEXT NOT NULL,
 "userId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "requestedById" TEXT NOT NULL,
 "expectedCost" DECIMAL(18,6) NOT NULL CHECK ("expectedCost" > 0 AND "expectedCost" <= 0.05),
 "chargedCost" DECIMAL(18,6),
 "currency" TEXT NOT NULL DEFAULT 'USD' CHECK ("currency" = 'USD'),
 "state" TEXT NOT NULL DEFAULT 'SENDING' CHECK ("state" IN ('SENDING','UNCERTAIN','PENDING','DELIVERED','FAILED_NO_CHARGE','REVIEW')),
 "supplierOrderId" TEXT,
 "orderId" TEXT REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "supplier_qa_attempts_requestKey_key" ON "supplier_qa_attempts"("requestKey");
CREATE UNIQUE INDEX "supplier_qa_attempts_reference_key" ON "supplier_qa_attempts"("reference");
CREATE UNIQUE INDEX "supplier_qa_attempts_orderId_key" ON "supplier_qa_attempts"("orderId");
CREATE INDEX "supplier_qa_attempts_authorizationId_idx" ON "supplier_qa_attempts"("authorizationId");
