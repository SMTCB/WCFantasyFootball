-- Failsafe for the "no standalone competition" invariant (2026-08-26).
--
-- leagues.circle_id / paddocks.circle_id / player_boxes.circle_id are already
-- NOT NULL, so a circle-less competition can never actually be persisted today.
-- But create_league / create_paddock / create_player_box all default p_circle_id
-- to NULL and never check it, so a UI bug (already found and fixed separately —
-- see BACKLOG.md) surfaces a raw, confusing NOT NULL constraint-violation string
-- to the client instead of failing cleanly. This migration adds an explicit guard
-- in each RPC so any future UI regression fails with a clear, intentional error
-- instead of a raw Postgres error leaking through.
--
-- Also closes a related gap found while reading these functions: none of the three
-- verified the caller is actually a member of the p_circle_id they passed in, so a
-- user could link a new competition to a Clubhouse they don't belong to. Both RPCs
-- that create a circle_leagues/circle_paddocks/circle_player_boxes junction row now
-- require caller membership in that circle.

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

  IF p_circle_id IS NULL THEN
    RAISE EXCEPTION 'CIRCLE_REQUIRED: a league must be linked to a Clubhouse';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM circle_members WHERE circle_id = p_circle_id AND user_id = v_caller) THEN
    RAISE EXCEPTION 'NOT_CIRCLE_MEMBER: you are not a member of this Clubhouse';
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
  INSERT INTO circle_leagues (circle_id, league_id)
  VALUES (p_circle_id, v_league.id)
  ON CONFLICT DO NOTHING;

  RETURN row_to_json(v_league);
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_paddock(p_name text, p_circle_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_paddock_id uuid;
  v_sport_id   uuid;
  v_caller     uuid := auth.uid();
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;

  IF p_circle_id IS NULL THEN
    RAISE EXCEPTION 'CIRCLE_REQUIRED: a paddock must be linked to a Clubhouse';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM circle_members WHERE circle_id = p_circle_id AND user_id = v_caller) THEN
    RAISE EXCEPTION 'NOT_CIRCLE_MEMBER: you are not a member of this Clubhouse';
  END IF;

  SELECT id INTO v_sport_id FROM sports WHERE slug = 'f1';
  IF v_sport_id IS NULL THEN RAISE EXCEPTION 'F1_SPORT_NOT_FOUND'; END IF;

  INSERT INTO paddocks (name, created_by, sport_id, circle_id)
    VALUES (p_name, v_caller, v_sport_id, p_circle_id)
    RETURNING id INTO v_paddock_id;

  INSERT INTO paddock_members (paddock_id, user_id, role)
    VALUES (v_paddock_id, v_caller, 'owner');

  INSERT INTO circle_paddocks (circle_id, paddock_id)
    VALUES (p_circle_id, v_paddock_id)
    ON CONFLICT DO NOTHING;

  RETURN v_paddock_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_player_box(p_name text, p_season_year integer, p_circle_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_box_id uuid;
  v_invite text;
  v_caller uuid := auth.uid();
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;

  IF p_circle_id IS NULL THEN
    RAISE EXCEPTION 'CIRCLE_REQUIRED: a player box must be linked to a Clubhouse';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM circle_members WHERE circle_id = p_circle_id AND user_id = v_caller) THEN
    RAISE EXCEPTION 'NOT_CIRCLE_MEMBER: you are not a member of this Clubhouse';
  END IF;

  INSERT INTO player_boxes (name, season_year, created_by, circle_id)
  VALUES (p_name, p_season_year, v_caller, p_circle_id)
  RETURNING id, invite_code INTO v_box_id, v_invite;

  INSERT INTO player_box_members (player_box_id, user_id)
  VALUES (v_box_id, v_caller);

  INSERT INTO circle_player_boxes (circle_id, player_box_id)
  VALUES (p_circle_id, v_box_id)
  ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object('player_box_id', v_box_id, 'invite_code', v_invite);
END;
$function$;
