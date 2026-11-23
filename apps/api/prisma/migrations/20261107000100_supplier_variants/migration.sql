ALTER TABLE "product_plans" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'INTERNAL',
 ADD COLUMN "variant" JSONB,
 ADD COLUMN "supplierMappings" JSONB;
ALTER TABLE "order_items" ADD COLUMN "planSnapshot" JSONB;
ALTER TABLE "product_plans" ADD CONSTRAINT "product_plan_source_check" CHECK ("source" IN ('INTERNAL','SUPPLIER'));
