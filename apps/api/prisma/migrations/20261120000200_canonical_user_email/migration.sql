BEGIN;

-- Take the write lock before checking for legacy collisions.
LOCK TABLE "users" IN SHARE ROW EXCLUSIVE MODE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "users"
    WHERE "email" IS NOT NULL
    GROUP BY lower(btrim("email") COLLATE "C")
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Canonical email migration blocked by legacy account collisions'
      USING HINT = 'Resolve colliding accounts before retrying. No accounts were modified.';
  END IF;
END
$$;

UPDATE "users"
SET "email" = lower(btrim("email") COLLATE "C")
WHERE "email" <> lower(btrim("email") COLLATE "C");

-- The existing unique index now enforces uniqueness of canonical addresses.
ALTER TABLE "users" ADD CONSTRAINT "users_email_canonical_check"
  CHECK ("email" = lower(btrim("email") COLLATE "C"));

COMMIT;
