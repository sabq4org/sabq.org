-- Migration: Add missing unique constraints and cleanup
-- Created: 2025-11-14
-- Purpose: Prepare database for production deployment
-- 
-- This migration:
-- 1. Adds missing unique constraints on short_links.short_code and users.apple_id
-- 2. Removes obsolete trend_cache table (no code references found)
-- 
-- Pre-migration validation:
-- - Verified no duplicate values exist in short_links.short_code
-- - Verified no duplicate values exist in users.apple_id
-- - Verified trend_cache table is not referenced in codebase

-- Add unique constraint for short_links.short_code (if not exists)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'short_links_short_code_unique' 
      AND table_name = 'short_links'
  ) THEN
    ALTER TABLE short_links ADD CONSTRAINT short_links_short_code_unique UNIQUE (short_code);
  END IF;
END $$;

-- Add unique constraint for users.apple_id (if not exists)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'users_apple_id_unique' 
      AND table_name = 'users'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT users_apple_id_unique UNIQUE (apple_id);
  END IF;
END $$;

-- Drop obsolete trend_cache table (verified: no code references)
-- This table was removed from shared/schema.ts and is no longer used
DROP TABLE IF EXISTS trend_cache CASCADE;

-- Verification queries (run post-migration to confirm success):
-- SELECT constraint_name FROM information_schema.table_constraints WHERE table_name = 'short_links' AND constraint_name = 'short_links_short_code_unique';
-- SELECT constraint_name FROM information_schema.table_constraints WHERE table_name = 'users' AND constraint_name = 'users_apple_id_unique';
-- SELECT table_name FROM information_schema.tables WHERE table_name = 'trend_cache'; -- Should return 0 rows
