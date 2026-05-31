-- Migration 104: league_mode, knockout_draft_deadline, phase columns,
-- get_club_cap() function, and league_config default seeds.
-- Session 61 — Draft/Cup system redesign.

-- ── 1. leagues: add league_mode and knockout_draft_deadline ──────────────────

ALTER TABLE leagues
  ADD COLUMN IF NOT EXISTS league_mode           TEXT NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS knockout_draft_deadline TIMESTAMPTZ;

-- ── 2. draft_submissions: add phase column ───────────────────────────────────

ALTER TABLE draft_submissions
  ADD COLUMN IF NOT EXISTS phase TEXT NOT NULL DEFAULT 'group';

-- Drop old unique constraint (league_id, user_id) and replace with
-- (league_id, user_id, phase) so the same user can submit once per phase.
DO $$
BEGIN
  ALTER TABLE draft_submissions
    DROP CONSTRAINT IF EXISTS draft_submissions_league_id_user_id_key;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE draft_submissions
    ADD CONSTRAINT draft_submissions_league_id_user_id_phase_key
    UNIQUE (league_id, user_id, phase);
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

-- ── 3. draft_allocations: add phase column ───────────────────────────────────

ALTER TABLE draft_allocations
  ADD COLUMN IF NOT EXISTS phase TEXT NOT NULL DEFAULT 'group';

-- Drop old unique constraint (league_id, user_id) and replace with
-- (league_id, user_id, phase) so allocations are tracked per phase.
DO $$
BEGIN
  ALTER TABLE draft_allocations
    DROP CONSTRAINT IF EXISTS draft_allocations_league_id_user_id_key;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE draft_allocations
    ADD CONSTRAINT draft_allocations_league_id_user_id_phase_key
    UNIQUE (league_id, user_id, phase);
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

-- ── 4. get_club_cap(p_league_id) ─────────────────────────────────────────────
-- Returns the per-manager club cap based on how many clubs are still active
-- in the cup pool for this league.
--
-- Tier logic:
--   active_count = 0  → return 3 (no cup data, use safe default)
--   active_count > 8  → 3  (early rounds, many clubs still alive)
--   active_count > 4  → 4  (quarter-final stage)
--   active_count > 2  → 5  (semi-final stage)
--   active_count <= 2 → NULL (final — no cap, managers pick freely)

CREATE OR REPLACE FUNCTION get_club_cap(p_league_id UUID)
RETURNS INT
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_active_count INT;
BEGIN
  SELECT COUNT(*)
    INTO v_active_count
    FROM cup_active_clubs
   WHERE league_id = p_league_id
     AND eliminated_at IS NULL;

  IF v_active_count = 0 THEN
    RETURN 3;  -- No cup data; return safe default
  ELSIF v_active_count > 8 THEN
    RETURN 3;
  ELSIF v_active_count > 4 THEN
    RETURN 4;
  ELSIF v_active_count > 2 THEN
    RETURN 5;
  ELSE
    RETURN NULL;  -- Final (2 clubs left): no cap
  END IF;
END;
$$;

-- ── 5. Seed league_config defaults for all existing leagues ──────────────────
-- These rows configure the club-cap tiers used by get_club_cap() fallbacks
-- and any front-end config reads.  ON CONFLICT DO NOTHING so re-runs are safe.

INSERT INTO league_config (league_id, config_key, config_value)
SELECT l.id, cfg.config_key, cfg.config_value
FROM leagues l
CROSS JOIN (
  VALUES
    ('club_cap_default',        '3'::jsonb),
    ('club_cap_tier1_threshold', '8'::jsonb),
    ('club_cap_tier1_value',     '4'::jsonb),
    ('club_cap_tier2_threshold', '4'::jsonb),
    ('club_cap_tier2_value',     '5'::jsonb),
    ('club_cap_tier3_threshold', '2'::jsonb),
    ('club_cap_tier3_value',     'null'::jsonb)
) AS cfg(config_key, config_value)
ON CONFLICT (league_id, config_key) DO NOTHING;
