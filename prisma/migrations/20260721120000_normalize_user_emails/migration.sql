-- Data-only migration: canonicalise existing account emails to trimmed lowercase.
--
-- Background: Postgres compares strings case-SENSITIVELY, so a student who
-- signed up as "Ali@Gmail.com" (phone keyboards auto-capitalise the first
-- letter) could never log in again by typing "ali@gmail.com" — the lookup
-- found no row and the API answered "wrong email or password". New sign-ups are
-- normalised at the DTO layer from now on; this fixes the rows already stored.
--
-- Deliberately conservative: a row is only rewritten when NO OTHER row would
-- collapse onto the same address. If two accounts really do differ only by case
-- (e.g. "A@x.com" and "a@x.com"), both are left untouched — rewriting either
-- would violate the UNIQUE constraint and abort the whole deploy. Those rare
-- rows keep working because UsersService.findByEmail falls back to a
-- case-insensitive lookup. Re-running this statement is a no-op.
UPDATE "users" u
SET "email" = lower(btrim(u."email"))
WHERE u."email" <> lower(btrim(u."email"))
  AND NOT EXISTS (
    SELECT 1
    FROM "users" other
    WHERE other."id" <> u."id"
      AND lower(btrim(other."email")) = lower(btrim(u."email"))
  );
