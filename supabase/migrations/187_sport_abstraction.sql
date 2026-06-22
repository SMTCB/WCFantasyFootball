-- Migration 187: Sport abstraction
-- Phase 0 of the v2 sale-ready build.
-- Adds a `sports` table (football/f1/tennis) and wires it to `tournaments`
-- via two new nullable columns (sport_id, provider).
-- FULLY ADDITIVE: no existing table structure is changed in a breaking way,
-- no existing row data is modified except adding two nullable columns to
-- `tournaments` and setting them via a backfill UPDATE.
-- All existing queries on `tournaments` are unaffected.

BEGIN;

-- ─── 1. sports table ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sports (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text        NOT NULL UNIQUE
                          CHECK (slug IN ('football', 'f1', 'tennis')),
  name        text        NOT NULL,
  game_model  text        NOT NULL
                          CHECK (game_model IN ('fantasy_squad', 'prediction', 'bracket')),
  provider    text        NOT NULL
                          CHECK (provider IN ('forza', 'openf1', 'thesportsdb', 'manual')),
  active      boolean     NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Public read — any authenticated or anon client can list available sports.
-- No direct client writes — sports are seeded via migrations only.
ALTER TABLE sports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sports_public_read" ON sports
  FOR SELECT USING (true);

-- ─── 2. Seed the three sports ─────────────────────────────────────────────────
-- Deterministic IDs so these rows can be referenced by future migrations
-- without a sub-select.

INSERT INTO sports (id, slug, name, game_model, provider, active) VALUES
  ('10000000-0000-4000-8000-000000000001', 'football', 'Football',  'fantasy_squad', 'forza',   true),
  ('10000000-0000-4000-8000-000000000002', 'f1',       'Formula 1', 'prediction',    'openf1',  false),
  ('10000000-0000-4000-8000-000000000003', 'tennis',   'Tennis',    'bracket',       'manual',  false)
ON CONFLICT (slug) DO NOTHING;

-- ─── 3. Extend tournaments ────────────────────────────────────────────────────
-- Both columns are nullable so every existing INSERT on this table
-- (e.g. create_league RPC) continues to work without modification.

ALTER TABLE tournaments
  ADD COLUMN IF NOT EXISTS sport_id uuid REFERENCES sports(id),
  ADD COLUMN IF NOT EXISTS provider  text;

-- Index — joins from leagues → tournaments → sports will be common.
CREATE INDEX IF NOT EXISTS idx_tournaments_sport_id ON tournaments (sport_id);

-- ─── 4. Backfill existing tournaments ────────────────────────────────────────
-- All 4 current tournaments are football / forza.
-- Only rows where sport_id IS NULL are touched (idempotent).

UPDATE tournaments
SET
  sport_id = '10000000-0000-4000-8000-000000000001',
  provider  = 'forza'
WHERE sport_id IS NULL;

COMMIT;
