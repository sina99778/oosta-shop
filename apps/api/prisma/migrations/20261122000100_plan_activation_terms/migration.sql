ALTER TABLE "product_plans"
  ADD COLUMN "activationTerms" TEXT,
  ADD CONSTRAINT "product_plans_activationTerms_length_check"
    CHECK ("activationTerms" IS NULL OR char_length("activationTerms") <= 4000);
