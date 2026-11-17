-- Server-side session revocation: JWTs carry this value and are rejected once it changes.
ALTER TABLE "users" ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;
