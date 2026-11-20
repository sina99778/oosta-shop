CREATE TABLE "welcome_gifts" (
  "userId" TEXT PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "code" TEXT NOT NULL UNIQUE
);
ALTER TABLE "orders" ADD COLUMN "welcomeGift" BOOLEAN NOT NULL DEFAULT false;
CREATE UNIQUE INDEX "orders_one_active_welcome_gift_idx" ON "orders"("userId")
  WHERE "welcomeGift" AND "paymentStatus" <> 'EXPIRED';
