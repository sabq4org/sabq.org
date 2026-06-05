-- Case-insensitive uniqueness on users.email
--
-- Background: the column-level UNIQUE on users.email is case-sensitive, so
-- "Ahmad@x.com" (reader) and "ahmad@x.com" (writer, minted by the application
-- approval flow when its lookup missed the existing reader) could coexist as
-- two accounts with the "same" email. That is the reader-vs-writer duplicate
-- login bug. This index forbids it at the database level.
--
-- ORDERING: this index will FAIL to create while case-only duplicates still
-- exist. Run the merge tool FIRST, then apply this migration:
--
--   npx tsx scripts/merge-duplicate-accounts.ts            # dry-run, see the plan
--   npx tsx scripts/merge-duplicate-accounts.ts --apply    # against the BACKUP db
--   psql "$DATABASE_URL" -f migrations/0006_users_email_lower_unique.sql
--
-- CONCURRENTLY avoids locking the table; it cannot run inside a transaction
-- block, so apply this file on its own (not wrapped in BEGIN/COMMIT).

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS users_email_lower_unique
  ON users (lower(email));
