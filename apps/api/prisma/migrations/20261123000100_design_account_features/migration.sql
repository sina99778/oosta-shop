-- Device sessions: one row per browser login; tokens reference it by id.
CREATE TABLE "user_sessions" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "userAgent" TEXT,
  "ipPrefix" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "user_sessions_userAgent_length_check" CHECK ("userAgent" IS NULL OR char_length("userAgent") <= 200),
  CONSTRAINT "user_sessions_ipPrefix_length_check" CHECK ("ipPrefix" IS NULL OR char_length("ipPrefix") <= 64)
);
CREATE INDEX "user_sessions_userId_revokedAt_idx" ON "user_sessions"("userId", "revokedAt");
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Tickets may reference one of the owner's orders.
ALTER TABLE "tickets" ADD COLUMN "orderId" TEXT;
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "tickets_orderId_idx" ON "tickets"("orderId");

-- Optional private screenshot per ticket message (5 MB raster images only).
ALTER TABLE "ticket_messages"
  ADD COLUMN "attachmentData" BYTEA,
  ADD COLUMN "attachmentMime" TEXT,
  ADD COLUMN "attachmentName" TEXT,
  ADD COLUMN "attachmentSize" INTEGER,
  ADD CONSTRAINT "ticket_messages_attachment_check" CHECK (
    ("attachmentData" IS NULL AND "attachmentMime" IS NULL AND "attachmentSize" IS NULL)
    OR ("attachmentData" IS NOT NULL
      AND "attachmentMime" IN ('image/jpeg', 'image/png', 'image/webp')
      AND "attachmentSize" BETWEEN 1 AND 5242880
      AND octet_length("attachmentData") = "attachmentSize")
  ),
  ADD CONSTRAINT "ticket_messages_attachmentName_length_check"
    CHECK ("attachmentName" IS NULL OR char_length("attachmentName") <= 120);

-- Journal topic for filters and related posts.
ALTER TABLE "blog_posts"
  ADD COLUMN "tag" TEXT,
  ADD CONSTRAINT "blog_posts_tag_length_check" CHECK ("tag" IS NULL OR char_length("tag") BETWEEN 1 AND 40);
CREATE INDEX "blog_posts_tag_idx" ON "blog_posts"("tag");
