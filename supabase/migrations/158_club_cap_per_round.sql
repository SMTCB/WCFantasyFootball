-- Migration 158: Club cap per round (table-driven, easy to change)
--
-- Creates club_cap_rules table keyed by (tournament_id, round_suffix).
-- Updates get_club_cap() to accept an optional p_matchday_id and look up the table
-- before falling back to the existing cup-based logic.
--
-- Cap schedule (seeded below):
--   Group stage (r1-r3): 3 · R32 (r4): 3 · R16 (r5): 4 · QF (r6): 5 · SF (r7): 5 · Final (r8): 6

-- ── 1. club_cap_rules table ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS club_cap_rules (
  id            SERIAL PRIMARY KEY,
  tournament_id TEXT NOT NULL,
  round_suffix  TEXT NOT NULL,  -- e.g. 'r1', 'r4', 'r8'
  cap           INT  NOT NULL,
  label         TEXT,           -- human-readable, e.g. 'Group Stage', 'Final'
  UNIQUE (tournament_id, round_suffix)
);

-- Allow league members to read the cap rules (needed for front-end display)
ALTER TABLE club_cap_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "club_cap_rules_read_all" ON club_cap_rules
  FOR SELECT USING (true);

-- ── 2. Seed for tournament 623 (int'l friendly pilot) ────────────────────────
INSERT INTO club_cap_rules (tournament_id, round_suffix, cap, label) VALUES
  ('623', 'r1', 3, 'Group Stage'),
  ('623', 'r2', 3, 'Group Stage'),
  ('623', 'r3', 3, 'Group Stage'),
  ('623', 'r4', 3, 'Round of 32'),
  ('623', 'r5', 4, 'Round of 16'),
  ('623', 'r6', 5, 'Quarter-Final'),
  ('623', 'r7', 5, 'Semi-Final'),
  ('623', 'r8', 6, 'Final')
ON CONFLICT (tournament_id, round_suffix) DO UPDATE SET cap = EXCLUDED.cap, label = EXCLUDED.label;

-- ── 3. Seed for tournament 429 (WC 2026) ─────────────────────────────────────
INSERT INTO club_cap_rules (tournament_id, round_suffix, cap, label) VALUES
  ('429', 'r1', 3, 'Group Stage'),
  ('429', 'r2', 3, 'Group Stage'),
  ('429', 'r3', 3, 'Group Stage'),
  ('429', 'r4', 3, 'Round of 32'),
  ('429', 'r5', 4, 'Round of 16'),
  ('429', 'r6', 5, 'Quarter-Final'),
  ('429', 'r7', 5, 'Semi-Final'),
  ('429', 'r8', 6, 'Final')
ON CONFLICT (tournament_id, round_suffix) DO UPDATE SET cap = EXCLUDED.cap, label = EXCLUDED.label;

-- ── 4. Updated get_club_cap function ─────────────────────────────────────────
-- Added optional p_matchday_id TEXT DEFAULT NULL.
-- When provided, extracts round_suffix and looks up club_cap_rules first.
-- Falls back to existing cup-based logic when no rule found or matchday_id is null.
CREATE OR REPLACE FUNCTION get_club_cap(
  p_league_id   UUID,
  p_matchday_id TEXT DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_tournament_id  TEXT;
  v_round_suffix   TEXT;
  v_cap            INT;
  v_active_count   INT;
  v_default_cap    INT := 3;
  v_t1_threshold   INT := 8;
  v_t1_value       INT := 4;
  v_t2_threshold   INT := 4;
  v_t2_value       INT := 5;
  v_t3_threshold   INT := 2;
BEGIN
  -- ── Path A: table-driven per-round cap ──────────────────────────────────────
  IF p_matchday_id IS NOT NULL THEN
    SELECT tournament_id INTO v_tournament_id
      FROM leagues WHERE id = p_league_id;

    -- matchday_id format: '{tournament_id}-{round_suffix}' e.g. '623-r4'
    v_round_suffix := split_part(p_matchday_id, '-', 2);

    SELECT cap INTO v_cap
      FROM club_cap_rules
     WHERE tournament_id = v_tournament_id
       AND round_suffix  = v_round_suffix;

    IF v_cap IS NOT NULL THEN
      RETURN v_cap;
    END IF;
  END IF;

  -- ── Path B: legacy cup-based logic (fallback) ───────────────────────────────
  SELECT (config_value #>> '{}')::int INTO v_default_cap    FROM league_config WHERE league_id = p_league_id AND config_key = 'club_cap_default';
  SELECT (config_value #>> '{}')::int INTO v_t1_threshold   FROM league_config WHERE league_id = p_league_id AND config_key = 'club_cap_tier1_threshold';
  SELECT (config_value #>> '{}')::int INTO v_t1_value       FROM league_config WHERE league_id = p_league_id AND config_key = 'club_cap_tier1_value';
  SELECT (config_value #>> '{}')::int INTO v_t2_threshold   FROM league_config WHERE league_id = p_league_id AND config_key = 'club_cap_tier2_threshold';
  SELECT (config_value #>> '{}')::int INTO v_t2_value       FROM league_config WHERE league_id = p_league_id AND config_key = 'club_cap_tier2_value';
  SELECT (config_value #>> '{}')::int INTO v_t3_threshold   FROM league_config WHERE league_id = p_league_id AND config_key = 'club_cap_tier3_threshold';

  IF v_default_cap  IS NULL THEN v_default_cap  := 3; END IF;
  IF v_t1_threshold IS NULL THEN v_t1_threshold := 8; END IF;
  IF v_t1_value     IS NULL THEN v_t1_value     := 4; END IF;
  IF v_t2_threshold IS NULL THEN v_t2_threshold := 4; END IF;
  IF v_t2_value     IS NULL THEN v_t2_value     := 5; END IF;
  IF v_t3_threshold IS NULL THEN v_t3_threshold := 2; END IF;

  SELECT COUNT(*) INTO v_active_count
    FROM cup_active_clubs
   WHERE league_id = p_league_id
     AND eliminated_at IS NULL;

  IF v_active_count = 0 THEN
    RETURN v_default_cap;
  ELSIF v_active_count > v_t1_threshold THEN
    RETURN v_default_cap;
  ELSIF v_active_count > v_t2_threshold THEN
    RETURN v_t1_value;
  ELSIF v_active_count > v_t3_threshold THEN
    RETURN v_t2_value;
  ELSE
    RETURN NULL;  -- final: no cap
  END IF;
END;
$$;
