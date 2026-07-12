-- Migration 196: raise the classic-mode free transfer allowance from 5→6.
--
-- transfers_per_round (league_config) drives the per-round free-transfer
-- limit inside execute_transfer_atomic() (migration 157) — draft-mode
-- leagues bypass this check entirely (limitMatchdayId=null in
-- process-transfer), so it only has a real effect on classic leagues.
-- Real pilot classic leagues were previously bumped from the 3 default to 5
-- in an earlier session; this raises them (and the remaining leagues still
-- on the 3 default) to 6.
--
-- Pre-change snapshot: backups/pre_migration196_classic_transfers_per_round_20260712.json

UPDATE league_config
SET config_value = '6'::jsonb
WHERE config_key = 'transfers_per_round'
  AND league_id IN (SELECT id FROM leagues WHERE league_mode = 'classic');

-- New leagues: create_league() seeds transfers_per_round for every league
-- regardless of mode (draft ignores the value). Bump the seed to 6 for
-- classic-format leagues so future classic leagues start at the new default;
-- draft-format ('noduplicate') leagues keep seeding 3, matching prior
-- behaviour (irrelevant to them either way).

CREATE OR REPLACE FUNCTION public.create_league(p_name text, p_format text, p_user_id uuid, p_tournament_id text, p_h2h_enabled boolean DEFAULT false)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_caller    uuid := auth.uid();
  v_league    leagues%ROWTYPE;
  v_join_code text;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: must be authenticated to create a league';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM tournaments WHERE forza_id = p_tournament_id) THEN
    RAISE EXCEPTION 'TOURNAMENT_NOT_FOUND: tournament % does not exist', p_tournament_id;
  END IF;

  v_join_code := upper(substring(md5(random()::text) for 6));

  INSERT INTO leagues (name, format, tournament_id, created_by, join_code, h2h_enabled)
  VALUES (p_name, p_format::league_format, p_tournament_id, v_caller, v_join_code, p_h2h_enabled)
  RETURNING * INTO v_league;

  INSERT INTO league_members (league_id, user_id, role)
  VALUES (v_league.id, v_caller, 'commissioner')
  ON CONFLICT (league_id, user_id) DO NOTHING;

  -- Seed league_config defaults (existing keys + H2H scoring keys)
  INSERT INTO league_config (league_id, config_key, config_value)
  VALUES
    (v_league.id, 'transfers_per_round',      CASE WHEN p_format = 'noduplicate' THEN '3'::jsonb ELSE '6'::jsonb END),
    (v_league.id, 'transfer_reopen_hours',    '6'::jsonb),
    (v_league.id, 'transfer_wildcard_round',  'null'::jsonb),
    (v_league.id, 'club_cap_default',         '3'::jsonb),
    (v_league.id, 'club_cap_tier1_threshold', '8'::jsonb),
    (v_league.id, 'club_cap_tier1_value',     '4'::jsonb),
    (v_league.id, 'club_cap_tier2_threshold', '4'::jsonb),
    (v_league.id, 'club_cap_tier2_value',     '5'::jsonb),
    (v_league.id, 'club_cap_tier3_threshold', '2'::jsonb),
    (v_league.id, 'club_cap_tier3_value',     'null'::jsonb),
    (v_league.id, 'lineup_lock_per_fixture',  'true'::jsonb),
    (v_league.id, 'h2h_win_pts',              '5'::jsonb),
    (v_league.id, 'h2h_draw_pts',             '2'::jsonb),
    (v_league.id, 'h2h_loss_pts',             '0'::jsonb)
  ON CONFLICT (league_id, config_key) DO NOTHING;

  RETURN row_to_json(v_league);
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_league(p_name text, p_format text, p_user_id uuid, p_tournament_id text, p_h2h_enabled boolean DEFAULT false, p_circle_id uuid DEFAULT NULL::uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_caller    uuid := auth.uid();
  v_league    leagues%ROWTYPE;
  v_join_code text;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: must be authenticated to create a league';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM tournaments WHERE forza_id = p_tournament_id) THEN
    RAISE EXCEPTION 'TOURNAMENT_NOT_FOUND: tournament % does not exist', p_tournament_id;
  END IF;

  v_join_code := upper(substring(md5(random()::text) for 6));

  INSERT INTO leagues (name, format, tournament_id, created_by, join_code, h2h_enabled, circle_id)
  VALUES (p_name, p_format::league_format, p_tournament_id, v_caller, v_join_code, p_h2h_enabled, p_circle_id)
  RETURNING * INTO v_league;

  INSERT INTO league_members (league_id, user_id, role)
  VALUES (v_league.id, v_caller, 'commissioner')
  ON CONFLICT (league_id, user_id) DO NOTHING;

  -- Seed league_config defaults (existing keys + H2H scoring keys)
  INSERT INTO league_config (league_id, config_key, config_value)
  VALUES
    (v_league.id, 'transfers_per_round',      CASE WHEN p_format = 'noduplicate' THEN '3'::jsonb ELSE '6'::jsonb END),
    (v_league.id, 'transfer_reopen_hours',    '6'::jsonb),
    (v_league.id, 'transfer_wildcard_round',  'null'::jsonb),
    (v_league.id, 'club_cap_default',         '3'::jsonb),
    (v_league.id, 'club_cap_tier1_threshold', '8'::jsonb),
    (v_league.id, 'club_cap_tier1_value',     '4'::jsonb),
    (v_league.id, 'club_cap_tier2_threshold', '4'::jsonb),
    (v_league.id, 'club_cap_tier2_value',     '5'::jsonb),
    (v_league.id, 'club_cap_tier3_threshold', '2'::jsonb),
    (v_league.id, 'club_cap_tier3_value',     'null'::jsonb),
    (v_league.id, 'lineup_lock_per_fixture',  'true'::jsonb),
    (v_league.id, 'h2h_win_pts',              '5'::jsonb),
    (v_league.id, 'h2h_draw_pts',             '2'::jsonb),
    (v_league.id, 'h2h_loss_pts',             '0'::jsonb)
  ON CONFLICT (league_id, config_key) DO NOTHING;

  -- Also insert into junction table for backwards compatibility
  IF p_circle_id IS NOT NULL THEN
    INSERT INTO circle_leagues (circle_id, league_id)
    VALUES (p_circle_id, v_league.id)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN row_to_json(v_league);
END;
$function$;
