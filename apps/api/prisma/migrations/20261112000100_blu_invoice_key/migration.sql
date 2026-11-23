ALTER TABLE "orders" ADD COLUMN "bluInvoiceKey" TEXT;
CREATE UNIQUE INDEX "orders_bluInvoiceKey_key" ON "orders"("bluInvoiceKey");
