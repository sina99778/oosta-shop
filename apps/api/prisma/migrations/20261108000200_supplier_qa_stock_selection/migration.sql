ALTER TABLE "supplier_qa_attempts" ADD COLUMN "selection" JSONB;
ALTER TABLE "supplier_qa_attempts" DROP CONSTRAINT "supplier_qa_attempts_expectedCost_check";
ALTER TABLE "supplier_qa_attempts" ADD CONSTRAINT "supplier_qa_attempts_expectedCost_check" CHECK ("expectedCost" > 0 AND "expectedCost" <= 1);
