-- Migration 121: Session 78 final pre-pilot DD corrections (DB-side)
-- Companion to edge-function changes in the same session:
--   calculate-scores  — C1 (per-round chips from chips_used/daily_jokers), C2 (drop wildcard),
--                        C3 (one squad row per manager per round)
--   process-transfer  — DR1 (relaxation read from league_config, null = unlimited)
--   run-reverse-standings-draft — DR2 (cron-batch mode), DR3 (phase), P0-4 (column names)
--   ingest-match-events — D2 (logError severity + outer-catch logging)
--
-- This migration covers the fixes that belong in the database:
--   C5  — starting_xi must stay a subset of players (no ghost scorers)
--   DR4 — league_mode must always track format
--   C2  — lock out the retired wildcard chip at the RPC layer

-- ── C5: keep starting_xi ⊆ players on every write ────────────────────────────
-- execute_transfer_atomic / draft / recovery paths update squads.players but never
-- touched starting_xi, so selling a starter left a "ghost" id in starting_xi that
-- calculate-scores then scored as 0 — a silent points loss. A BEFORE trigger that
-- filters starting_xi against players covers every write path, not just one RPC.

CREATE OR REPLACE FUNCTION sanitize_starting_xi()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.starting_xi IS NOT NULL AND array_length(NEW.starting_xi, 1) > 0 THEN
    SELECT COALESCE(array_agg(x), ARRAY[]::text[])
      INTO NEW.starting_xi
      FROM unnest(NEW.starting_xi) AS x
      WHERE x = ANY(COALESCE(NEW.players, ARRAY[]::text[]));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sanitize_starting_xi ON squads;
CREATE TRIGGER trg_sanitize_starting_xi
  BEFORE INSERT OR UPDATE OF players, starting_xi ON squads
  FOR EACH ROW EXECUTE FUNCTION sanitize_starting_xi();

-- One-time backfill: drop existing ghost ids from any squad already in this state.
UPDATE squads
SET starting_xi = (
  SELECT COALESCE(array_agg(x), ARRAY[]::text[])
  FROM unnest(starting_xi) AS x
  WHERE x = ANY(players)
)
WHERE starting_xi IS NOT NULL
  AND array_length(starting_xi, 1) > 0
  AND NOT (starting_xi <@ COALESCE(players, ARRAY[]::text[]));

-- ── DR4: league_mode always tracks format ────────────────────────────────────
-- The migration-105 sync_league_mode() function is absent from production (the
-- trigger therefore never fired), and even as designed it only fired on UPDATE
-- *OF format* — so league_mode drifted from format (observed: format='classic' rows
-- carrying league_mode='draft'). Recreate the function and fire on every insert/update.

CREATE OR REPLACE FUNCTION sync_league_mode()
RETURNS TRIGGER AS $$
BEGIN
  NEW.league_mode := CASE
    WHEN NEW.format::text = 'noduplicate' THEN 'draft'
    ELSE 'classic'
  END;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_league_mode ON leagues;
CREATE TRIGGER trg_sync_league_mode
  BEFORE INSERT OR UPDATE ON leagues
  FOR EACH ROW EXECUTE FUNCTION sync_league_mode();

-- Re-assert correct league_mode for any currently-mismatched rows.
UPDATE leagues
SET league_mode = CASE WHEN format::text = 'noduplicate' THEN 'draft' ELSE 'classic' END
WHERE league_mode <> CASE WHEN format::text = 'noduplicate' THEN 'draft' ELSE 'classic' END;

-- ── C2: lock out the retired wildcard chip ───────────────────────────────────
-- The wildcard chip was removed from the UI but activate_chip still accepted it and
-- scoring still applied a hidden +10%. Scoring no longer reads is_wildcard; here we
-- also reject 'wildcard' at the RPC layer and clear any flag still set, so the chip
-- can neither be activated nor silently persist.

CREATE OR REPLACE FUNCTION public.activate_chip(
  p_user_id   uuid,
  p_league_id uuid,
  p_chip_type text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_squad      record;
  v_cur_val    boolean;
  v_db_field   text;
BEGIN
  -- C2: the wildcard chip is retired — refuse to activate it.
  IF p_chip_type = 'wildcard' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'CHIP_RETIRED',
      'error', 'The wildcard chip is no longer available');
  END IF;

  CASE p_chip_type
    WHEN 'triple_captain' THEN v_db_field := 'is_triple_captain';
    ELSE RETURN jsonb_build_object('ok', false, 'error', 'Unknown chip type: ' || p_chip_type);
  END CASE;

  SELECT * INTO v_squad
  FROM squads
  WHERE user_id = p_user_id AND league_id = p_league_id
  ORDER BY created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Squad not found');
  END IF;

  -- DD-M11: deadline check — cannot activate after the matchday deadline
  IF v_squad.matchday_id IS NOT NULL AND v_squad.matchday_id <> 'active' THEN
    IF EXISTS (
      SELECT 1 FROM matchday_deadlines
      WHERE matchday_id = v_squad.matchday_id AND deadline_at < NOW()
    ) THEN
      RETURN jsonb_build_object('ok', false, 'code', 'DEADLINE_PASSED',
        'error', 'Matchday deadline has passed — chips cannot be changed.');
    END IF;
  END IF;

  v_cur_val := v_squad.is_triple_captain;

  IF NOT v_cur_val THEN
    IF EXISTS (
      SELECT 1 FROM chips_used
      WHERE user_id = p_user_id AND league_id = p_league_id
        AND chip_type = p_chip_type AND matchday_id <> v_squad.matchday_id
    ) THEN
      RETURN jsonb_build_object('ok', false, 'code', 'CHIP_ALREADY_USED',
        'error', 'This chip has already been used this season');
    END IF;

    INSERT INTO chips_used (user_id, league_id, chip_type, matchday_id)
    VALUES (p_user_id, p_league_id, p_chip_type, v_squad.matchday_id)
    ON CONFLICT (user_id, league_id, chip_type) DO UPDATE
      SET matchday_id = excluded.matchday_id, used_at = now();
  END IF;

  UPDATE squads SET is_triple_captain = NOT v_cur_val WHERE id = v_squad.id;

  RETURN jsonb_build_object('ok', true, 'active', NOT v_cur_val);
END;
$$;

-- Clear any wildcard flag still set so it cannot influence anything downstream.
UPDATE squads SET is_wildcard = false WHERE is_wildcard;
