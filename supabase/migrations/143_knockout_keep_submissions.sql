-- Migration 143: Knockout keep submissions
--
-- Allows managers in a cup+draft league to designate up to N players from their
-- current (group-stage) squad to carry into the knockout phase without going
-- through the lottery. Kept players are pre-allocated in run-draft-lottery's
-- new Pass 0 and excluded from the lottery pool for all other managers.
--
-- Guard: submit_knockout_keeps rejects calls when cup_phase <> 'group_stage',
-- making it impossible to submit keeps during the group-stage draft selection.
-- The keep window is only open between group allocation (cup_phase='group_stage')
-- and the commissioner running the knockout lottery.
--
-- Isolation: entirely additive. If no keep rows exist for a league, Pass 0 in
-- run-draft-lottery is a no-op and behaviour is identical to pre-migration.

-- ── 1. Table ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS knockout_keep_submissions (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id    uuid        NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  user_id      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  player_ids   text[]      NOT NULL DEFAULT '{}',
  submitted_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (league_id, user_id)
);

-- ── 2. RLS ───────────────────────────────────────────────────────────────────

ALTER TABLE knockout_keep_submissions ENABLE ROW LEVEL SECURITY;

-- Members can read all submissions for their league (commissioner needs the count).
CREATE POLICY "keep_submissions_select"
  ON knockout_keep_submissions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM league_members
      WHERE league_id = knockout_keep_submissions.league_id
        AND user_id   = auth.uid()
    )
  );

-- Managers write their own row only; server-side validation happens in the RPC.
CREATE POLICY "keep_submissions_insert"
  ON knockout_keep_submissions FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "keep_submissions_update"
  ON knockout_keep_submissions FOR UPDATE
  USING  (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ── 3. submit_knockout_keeps RPC ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION submit_knockout_keeps(
  p_league_id  uuid,
  p_player_ids text[]
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user          uuid := auth.uid();
  v_cup_phase     text;
  v_format        text;
  v_league_mode   text;
  v_tournament    text;
  v_max_slots     int  := 5;   -- default; override via league_config 'knockout_keep_slots'
  v_squad_players text[];
  v_elim_clubs    text[];
  pid             text;
  v_player        players%ROWTYPE;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;

  -- League membership + league metadata
  IF NOT EXISTS (
    SELECT 1 FROM league_members WHERE league_id = p_league_id AND user_id = v_user
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not a league member');
  END IF;

  SELECT format, league_mode, cup_phase, tournament_id
    INTO v_format, v_league_mode, v_cup_phase, v_tournament
    FROM leagues WHERE id = p_league_id;

  -- Feature only applies to cup + draft leagues
  IF v_format NOT IN ('cup', 'noduplicate') OR v_league_mode NOT IN ('draft', 'noduplicate') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Keep submissions only available in cup draft leagues');
  END IF;

  -- Guard: only open during the group stage (after group lottery, before knockout lottery).
  -- This is the key isolation guard — prevents the banner from appearing or accepting
  -- submissions during the group-stage draft selection period.
  IF v_cup_phase IS DISTINCT FROM 'group_stage' THEN
    RETURN jsonb_build_object(
      'ok',    false,
      'code',  'WRONG_PHASE',
      'error', 'Keep submissions are only open after the group draft has run and before the knockout draft'
    );
  END IF;

  -- Read per-league slot limit from config (falls back to 5)
  SELECT (config_value #>> '{}')::int INTO v_max_slots
    FROM league_config
   WHERE league_id = p_league_id AND config_key = 'knockout_keep_slots';
  IF v_max_slots IS NULL THEN v_max_slots := 5; END IF;

  -- Count check
  IF array_length(p_player_ids, 1) > v_max_slots THEN
    RETURN jsonb_build_object(
      'ok',    false,
      'code',  'TOO_MANY_KEEPS',
      'error', 'Maximum ' || v_max_slots || ' players can be protected'
    );
  END IF;

  -- Manager's current squad (most recent squad row for this league)
  SELECT players INTO v_squad_players
    FROM squads
   WHERE league_id = p_league_id AND user_id = v_user
   ORDER BY created_at DESC LIMIT 1;

  IF v_squad_players IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No squad found for this league');
  END IF;

  -- Eliminated clubs (cannot keep a player from a knocked-out club)
  SELECT ARRAY_AGG(club_id) INTO v_elim_clubs
    FROM cup_active_clubs
   WHERE league_id = p_league_id AND eliminated_at IS NOT NULL;

  -- Validate each player
  FOREACH pid IN ARRAY COALESCE(p_player_ids, ARRAY[]::text[]) LOOP
    -- Must be in the manager's squad
    IF NOT (v_squad_players @> ARRAY[pid]) THEN
      RETURN jsonb_build_object(
        'ok',    false,
        'code',  'NOT_IN_SQUAD',
        'error', 'Player ' || pid || ' is not in your squad'
      );
    END IF;

    -- Must be from an active (non-eliminated) club
    SELECT * INTO v_player FROM players WHERE id = pid;
    IF v_player.forza_team_id IS NOT NULL
       AND v_elim_clubs IS NOT NULL
       AND v_player.forza_team_id = ANY(v_elim_clubs) THEN
      RETURN jsonb_build_object(
        'ok',    false,
        'code',  'CLUB_ELIMINATED',
        'error', 'Cannot protect ' || COALESCE(v_player.name, pid) || ' — their club has been eliminated'
      );
    END IF;
  END LOOP;

  -- Upsert — managers can revise their list until the commissioner runs the knockout draft
  INSERT INTO knockout_keep_submissions (league_id, user_id, player_ids, submitted_at)
  VALUES (p_league_id, v_user, COALESCE(p_player_ids, ARRAY[]::text[]), NOW())
  ON CONFLICT (league_id, user_id) DO UPDATE
    SET player_ids   = EXCLUDED.player_ids,
        submitted_at = EXCLUDED.submitted_at;

  RETURN jsonb_build_object(
    'ok',         true,
    'kept_count', COALESCE(array_length(p_player_ids, 1), 0),
    'max_slots',  v_max_slots
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION submit_knockout_keeps(uuid, text[]) FROM anon;
GRANT  EXECUTE ON FUNCTION submit_knockout_keeps(uuid, text[]) TO authenticated;
