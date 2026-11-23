ALTER TABLE "product_plans"
    ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0,
    ADD CONSTRAINT "product_plans_sortOrder_check" CHECK ("sortOrder" BETWEEN 0 AND 1000);

-- Prefer the approved one-month Plus variant. Keep all plan rows and terms intact.
WITH preferred AS (
    SELECT plan."id"
    FROM "product_plans" plan
    JOIN "products" product ON product."id" = plan."productId"
    WHERE product."slug" = 'chatgpt'
      AND plan."isActive"
      AND plan."durationDays" = 30
      AND lower(plan."variant" ->> 'plan') = 'chatgpt plus'
      AND plan."variant" ->> 'access' = 'PERSONAL'
      AND plan."variant" ->> 'fulfillment' = 'ACCOUNT'
      AND plan."variant" ->> 'delivery' = 'AUTOMATIC'
      AND plan."variant" #>> '{warranty,kind}' = 'WARRANTED'
      AND plan."variant" #>> '{warranty,days}' = '30'
      AND plan."variant" #>> '{warranty,coverage}' = 'FULL'
    ORDER BY (plan."supplierMappings" @> '[{"supplier":"canboso2","externalId":"6a7347f6b1446d1a93c12cdf"}]'::jsonb)
        DESC NULLS LAST, plan."id"
    LIMIT 1
)
UPDATE "product_plans" AS plan
SET "sortOrder" = 100
FROM preferred
WHERE plan."id" = preferred."id";
