CREATE TYPE "RecoveryChallengeKind" AS ENUM ('RESET', 'VERIFY');

ALTER TABLE "users" ADD COLUMN "verifiedRecoveryEmail" TEXT;

CREATE TABLE "password_resets" (
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "kind" "RecoveryChallengeKind" NOT NULL,
    "email" TEXT NOT NULL,
    "sessionVersion" INTEGER NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    CONSTRAINT "password_resets_pkey" PRIMARY KEY ("userId"),
    CONSTRAINT "password_resets_userId_fkey" FOREIGN KEY ("userId")
        REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "password_resets_tokenHash_key" ON "password_resets"("tokenHash");
