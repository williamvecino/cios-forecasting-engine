-- Migration: Add scope and timing enum columns to signals table
-- Date: 2026-03-15
-- Description: Replace flat LR formula with type-aware, attribute-driven system.
--              Adds scope (local/regional/national/global) and timing (early/current/late)
--              as PostgreSQL enum types on the signals table.

CREATE TYPE "signal_scope" AS ENUM ('local', 'regional', 'national', 'global');
CREATE TYPE "signal_timing" AS ENUM ('early', 'current', 'late');

ALTER TABLE "signals"
  ADD COLUMN "scope" "signal_scope" DEFAULT 'national',
  ADD COLUMN "timing" "signal_timing" DEFAULT 'current';
