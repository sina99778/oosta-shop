ALTER TABLE "supplier_qa_attempts" DROP CONSTRAINT "supplier_qa_attempts_state_check";
ALTER TABLE "supplier_qa_attempts" ADD CONSTRAINT "supplier_qa_attempts_state_check"
CHECK ("state" IN ('SENDING','UNCERTAIN','PENDING','DELIVERED','FAILED_NO_CHARGE','REVIEW','STOCK_READY','AWAITING_PAYMENT'));
