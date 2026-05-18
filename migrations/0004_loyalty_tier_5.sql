-- Migration: widen user_points_total.rank_level constraint from 1..4 to 1..5
-- Created: 2026-05-18
-- Purpose: Phase 1 of the loyalty overhaul — add a 5th tier
--          ("القارئ الموثوق" slots in at level 4; the legacy top
--          "سفير سبق" moves to level 5).
--
-- Order of operations (DO NOT REORDER):
--   1. THIS SQL — widen the CHECK constraint so the migration script
--      can write rank_level = 5 without violating the old 1..4 check.
--   2. scripts/migrate-loyalty-tiers.ts --apply — backfills rank_level
--      and grandfathers existing "سفير سبق" users to level 5.
--   3. Deploy code that uses LOYALTY_TIERS (shared/loyalty.ts) for
--      future point awards.
--
-- Re-runnable: the DO block checks whether the old constraint exists
-- before dropping it, and creates the new one only if not already
-- present.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_name = 'user_points_total'
      AND constraint_name = 'rank_level_check'
  ) THEN
    ALTER TABLE user_points_total DROP CONSTRAINT rank_level_check;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_name = 'user_points_total'
      AND constraint_name = 'rank_level_check'
  ) THEN
    ALTER TABLE user_points_total
      ADD CONSTRAINT rank_level_check CHECK (rank_level BETWEEN 1 AND 5);
  END IF;
END $$;
