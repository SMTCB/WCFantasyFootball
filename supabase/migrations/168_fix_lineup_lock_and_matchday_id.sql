-- Migration 168: Fix lineup-lock write condition (per-player, not per-round)
--                 + active-round helper to stop squads.matchday_id skipping ahead
--
-- BUG #1 (reported: Cristian Romero, "Draft Mundial 26" + classic leagues):
--   set_lineup() (migration 164) wrote the benched player into
--   lineup_locks[matchday_id] whenever v_round_started = true (ANY fixture in the
--   round is live/finished) — not whether THAT PLAYER's own fixture had started.
--   Once one WC Round-1 fixture went live, every subsequent sub-out across every
--   league got locked, even for players whose match is days away. The client
--   (SquadScreen) then blocked subbing them back in with "already subbed out this
--   round and cannot return", well before the round-level server check would even
--   fire again.
--
-- FIX:
--   The function already computes v_pout_status (the benched player's own fixture
--   status this round). Use v_pout_status IN ('live','finished') as the lock
--   condition for both the write (lineup_locks) and the read (PLAYER_LOCKED) guard.
--   This is strictly more precise than v_round_started and subsumes migration 162's
--   pre-competition bypass (a player whose match hasn't started — NULL or
--   'scheduled' — is never locked, regardless of round state). v_round_started is
--   removed entirely.
--
-- BACKFILL #1 (self-healing, all tournaments):
--   Rebuild squads.lineup_locks for every squad with a non-empty value, keeping
--   only (matchday_id -> player_id) entries where that player's own fixture for
--   that round is live/finished — i.e. exactly what the fixed set_lineup would
--   have written. Removes 21 stale entries across 7 squads / 6 leagues (incl. the
--   reported Romero entry); the 18 legitimately-locked entries are preserved.
--
-- BUG #2 (reported: squad pitch showing GW2 dates while WC Round 1 is still
--   active):
--   run-draft-lottery's canonicalMatchdayId and process-transfer's
--   activeMatchdayId both pick the "nearest upcoming matchday_deadlines.deadline_at"
--   — once a round's deadline passes (even if its fixtures are still mostly
--   'scheduled'), both jump straight to the NEXT round. 429-r1's deadline passed
--   at ~19:00 UTC on 2026-06-11 while round 1 was still 23/24 'scheduled'; 6 squads
--   created by the lottery shortly after were stamped matchday_id='429-r2'.
--   process-transfer has the identical flaw — any future transfer in a classic
--   429 league would reproduce this via migration 161's advance-on-transfer.
--
-- FIX:
--   get_active_matchday_id(p_tournament_id) — same logic as sync_squad_matchdays()
--   (lowest round with a 'scheduled'/'live' fixture, else the highest finished
--   round). Both Edge Functions now call this RPC instead of the deadline lookup.
--
-- BACKFILL #2:
--   6 squads stuck at '429-r2' (created post-lottery on 2026-06-11 while round 1
--   was still active) corrected back to '429-r1'.

-- ── 1. Active-round helper (shared by run-draft-lottery + process-transfer) ──────
CREATE OR REPLACE FUNCTION public.get_active_matchday_id(p_tournament_id text)
RETURNS text
LANGUAGE plpgsql
AS $function$
DECLARE
  v_active_round int;
BEGIN
  SELECT MIN(f.round_number) INTO v_active_round
  FROM fixtures f
  WHERE f.tournament_id = p_tournament_id
    AND f.status IN ('scheduled', 'live')
    AND f.round_number IS NOT NULL;

  IF v_active_round IS NULL THEN
    SELECT MAX(f.round_number) INTO v_active_round
    FROM fixtures f
    WHERE f.tournament_id = p_tournament_id
      AND f.round_number IS NOT NULL;
  END IF;

  IF v_active_round IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN p_tournament_id || '-r' || v_active_round::text;
END;
$function$;

-- ── 2. set_lineup: lock condition keyed on the benched player's own fixture ──────
CREATE OR REPLACE FUNCTION public.set_lineup(p_squad_id uuid, p_player_out text, p_player_in text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_squad          squads;
  v_matchday_id    text;
  v_round_number   int;
  v_tournament_id  text;
  v_lock_array     text[];
  v_new_xi         text[];
  v_pin_status     text;
  v_pout_status    text;
  v_pout_pts       numeric := 0;
  v_deduction      numeric := 0;
  v_gk_count       int;
  v_def_count      int;
  v_mid_count      int;
  v_fwd_count      int;
BEGIN
  SELECT * INTO v_squad FROM squads WHERE id = p_squad_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Squad not found');
  END IF;

  IF auth.uid() IS NOT NULL AND v_squad.user_id IS DISTINCT FROM auth.uid() THEN
    RETURN jsonb_build_object('ok', false, 'code', 'UNAUTHORIZED', 'error', 'Not your squad');
  END IF;

  -- Fetch tournament first — needed to resolve the active round.
  SELECT tournament_id INTO v_tournament_id
  FROM leagues WHERE id = v_squad.league_id;

  -- Active round = lowest round_number with any scheduled or live fixture.
  -- Avoids relying on squad.matchday_id which may be stale (never advanced if
  -- no transfers made since the draft).
  SELECT COALESCE(
    (SELECT f.round_number
     FROM fixtures f
     WHERE f.tournament_id = v_tournament_id
       AND f.status IN ('scheduled', 'live')
     ORDER BY f.round_number ASC
     LIMIT 1),
    (regexp_match(v_squad.matchday_id, '-r(\d+)$'))[1]::int
  ) INTO v_round_number;

  -- Resolve matchday_id string from round number.
  -- Format is always '{tournament_id}-r{N}' — verify it exists, else fall back.
  v_matchday_id := v_tournament_id || '-r' || v_round_number::text;
  IF NOT EXISTS (
    SELECT 1 FROM matchday_deadlines
    WHERE tournament_id = v_tournament_id AND matchday_id = v_matchday_id
  ) THEN
    v_matchday_id  := v_squad.matchday_id;
    v_round_number := (regexp_match(v_matchday_id, '-r(\d+)$'))[1]::int;
  END IF;

  IF array_length(v_squad.starting_xi, 1) IS NULL OR array_length(v_squad.starting_xi, 1) = 0 THEN
    SELECT ARRAY_AGG(id) INTO v_squad.starting_xi
    FROM (
      SELECT id FROM players
      WHERE id = ANY(v_squad.players)
      ORDER BY (position = 'GK') DESC, array_position(v_squad.players, id)
      LIMIT 11
    ) sub;
    UPDATE squads SET starting_xi = v_squad.starting_xi WHERE id = p_squad_id;
  END IF;

  v_lock_array := ARRAY(
    SELECT jsonb_array_elements_text(
      COALESCE(v_squad.lineup_locks -> v_matchday_id, '[]'::jsonb)
    )
  );

  IF NOT (v_squad.players @> ARRAY[p_player_in]) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Player not in your squad');
  END IF;

  IF p_player_in = ANY(v_lock_array) THEN
    RETURN jsonb_build_object(
      'ok',   false,
      'code', 'PLAYER_LOCKED',
      'error', 'This player was already subbed out this round and cannot return until next matchday'
    );
  END IF;

  IF p_player_in = ANY(v_squad.starting_xi) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Player is already in the starting XI');
  END IF;

  IF NOT (p_player_out = ANY(v_squad.starting_xi)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Player to move to bench is not in the starting XI');
  END IF;

  SELECT f.status INTO v_pin_status
  FROM fixtures f
  JOIN players pl ON (
    pl.forza_team_id = f.home_team_forza_id
    OR pl.forza_team_id = f.away_team_forza_id
  )
  WHERE pl.id = p_player_in
    AND f.round_number  = v_round_number
    AND f.tournament_id = v_tournament_id
  LIMIT 1;

  IF v_pin_status IN ('live', 'finished') THEN
    RETURN jsonb_build_object(
      'ok',   false,
      'code', 'FIXTURE_COMPLETED',
      'error', 'Cannot sub in a player whose fixture has started or finished this round'
    );
  END IF;

  SELECT ARRAY_AGG(CASE WHEN x = p_player_out THEN p_player_in ELSE x END ORDER BY ord)
    INTO v_new_xi
    FROM unnest(v_squad.starting_xi) WITH ORDINALITY AS t(x, ord);

  SELECT
    COUNT(*) FILTER (WHERE position = 'GK'),
    COUNT(*) FILTER (WHERE position = 'DEF'),
    COUNT(*) FILTER (WHERE position = 'MID'),
    COUNT(*) FILTER (WHERE position = 'FWD')
  INTO v_gk_count, v_def_count, v_mid_count, v_fwd_count
  FROM players
  WHERE id = ANY(v_new_xi);

  IF v_gk_count < 1 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Starting XI must include at least 1 goalkeeper');
  END IF;
  IF v_def_count < 3 OR v_def_count > 5 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Starting XI must have 3–5 defenders (got ' || v_def_count || ')');
  END IF;
  IF v_mid_count < 2 OR v_mid_count > 5 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Starting XI must have 2–5 midfielders (got ' || v_mid_count || ')');
  END IF;
  IF v_fwd_count < 1 OR v_fwd_count > 3 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Starting XI must have 1–3 forwards (got ' || v_fwd_count || ')');
  END IF;

  SELECT f.status INTO v_pout_status
  FROM fixtures f
  JOIN players pl ON (
    pl.forza_team_id = f.home_team_forza_id
    OR pl.forza_team_id = f.away_team_forza_id
  )
  WHERE pl.id = p_player_out
    AND f.round_number  = v_round_number
    AND f.tournament_id = v_tournament_id
  LIMIT 1;

  IF v_pout_status = 'finished' THEN
    SELECT COALESCE(pms.fantasy_points, 0) INTO v_pout_pts
    FROM player_match_stats pms
    JOIN fixtures f ON pms.fixture_id = f.id
    WHERE pms.player_id = p_player_out
      AND f.round_number  = v_round_number
      AND f.tournament_id = v_tournament_id
    LIMIT 1;

    v_deduction := v_pout_pts;

    UPDATE fantasy_points
       SET total = GREATEST(total - ROUND(v_deduction::numeric), 0)
     WHERE squad_id    = p_squad_id
       AND matchday_id = v_matchday_id;
  END IF;

  UPDATE squads
  SET
    starting_xi  = v_new_xi,
    lineup_locks = CASE
      WHEN v_pout_status IN ('live', 'finished') THEN
        jsonb_set(
          COALESCE(lineup_locks, '{}'::jsonb),
          ARRAY[v_matchday_id],
          (
            SELECT jsonb_agg(DISTINCT val)
            FROM (
              SELECT jsonb_array_elements_text(
                COALESCE(lineup_locks -> v_matchday_id, '[]'::jsonb)
              ) AS val
              UNION ALL
              SELECT p_player_out
            ) t
          )
        )
      ELSE
        COALESCE(lineup_locks, '{}'::jsonb)
    END
  WHERE id = p_squad_id;

  RETURN jsonb_build_object(
    'ok',         true,
    'starting_xi', to_jsonb(v_new_xi),
    'deduction',   v_deduction,
    'locked',      (v_pout_status IN ('live', 'finished'))
  );
END;
$function$;

-- ── 3. Backfill #1: self-heal lineup_locks for every squad ───────────────────────
-- Keep only (matchday -> player) entries where that player's own fixture for that
-- round is live/finished — exactly what the fixed set_lineup above would write.
UPDATE squads s
SET lineup_locks = (
  SELECT COALESCE(jsonb_object_agg(mk.key, filtered.arr), '{}'::jsonb)
  FROM jsonb_each(s.lineup_locks) AS mk(key, value)
  CROSS JOIN LATERAL (
    SELECT jsonb_agg(val) AS arr
    FROM jsonb_array_elements_text(mk.value) AS val
    WHERE EXISTS (
      SELECT 1 FROM fixtures f
      JOIN players p ON p.id = val
      WHERE f.tournament_id = split_part(mk.key, '-', 1)
        AND f.round_number  = (regexp_match(mk.key, '-r([0-9]+)$'))[1]::int
        AND (f.home_team_forza_id = p.forza_team_id OR f.away_team_forza_id = p.forza_team_id)
        AND f.status IN ('live', 'finished')
    )
  ) AS filtered
  WHERE filtered.arr IS NOT NULL
)
WHERE s.lineup_locks != '{}'::jsonb;

-- ── 4. Backfill #2: 6 squads stuck at '429-r2' (created post-lottery while
--      WC Round 1 was still active) corrected back to '429-r1' ───────────────────
UPDATE squads
SET matchday_id = '429-r1'
WHERE matchday_id = '429-r2'
  AND id IN (
    '1d9b3de6-1383-4fd2-b219-35bbca13b8ae', -- Goat
    '439de36a-668a-4bac-af94-a1a83c58ae90', -- zecoliveira
    '88a3a9af-b559-425b-a663-0a82ff69f1c2', -- Sadzburg
    '891d378f-71d6-4c69-ac10-00075d1e8219', -- Cody S
    '677d002d-2b1c-4275-9a94-654bd3f730c8', -- tommyazcue
    '8311a921-a7a6-4069-9172-519a7a52e265'  -- MariWin
  );
