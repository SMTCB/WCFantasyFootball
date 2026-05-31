-- Migration 109: Fix create_league + join_league_by_code to use auth.uid() (DD-H11)
-- Previously both functions trusted client-supplied p_user_id, allowing any user
-- to create or join a league as someone else. Now auth.uid() is authoritative.
-- p_user_id parameter is retained in the signature for API backward-compat but ignored.

-- ── create_league (basic overload — no tournament_id) ────────────────────────

CREATE OR REPLACE FUNCTION create_league(
  p_name    text,
  p_format  text,
  p_user_id uuid   -- ignored; auth.uid() used instead
) RETURNS json LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_caller    uuid := auth.uid();
  v_league    leagues%ROWTYPE;
  v_join_code text;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: must be authenticated to create a league';
  END IF;

  v_join_code := upper(substring(md5(random()::text) for 6));

  INSERT INTO leagues (name, format, created_by, join_code)
  VALUES (p_name, p_format::league_format, v_caller, v_join_code)
  RETURNING * INTO v_league;

  INSERT INTO league_members (league_id, user_id, role)
  VALUES (v_league.id, v_caller, 'commissioner')
  ON CONFLICT (league_id, user_id) DO NOTHING;

  RETURN row_to_json(v_league);
END;
$$;

-- ── create_league (full overload — with tournament_id) ────────────────────────
-- Must DROP first because the existing overload has a DEFAULT on p_tournament_id
-- which CREATE OR REPLACE cannot change.

DROP FUNCTION IF EXISTS create_league(text, text, uuid, text);

CREATE FUNCTION create_league(
  p_name          text,
  p_format        text,
  p_user_id       uuid,  -- ignored; auth.uid() used instead
  p_tournament_id text
) RETURNS json LANGUAGE plpgsql SECURITY DEFINER AS $$
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

  INSERT INTO leagues (name, format, tournament_id, created_by, join_code)
  VALUES (p_name, p_format::league_format, p_tournament_id, v_caller, v_join_code)
  RETURNING * INTO v_league;

  INSERT INTO league_members (league_id, user_id, role)
  VALUES (v_league.id, v_caller, 'commissioner')
  ON CONFLICT (league_id, user_id) DO NOTHING;

  -- Seed all league_config defaults for this new league
  INSERT INTO league_config (league_id, config_key, config_value)
  VALUES
    (v_league.id, 'transfers_per_round',      '3'::jsonb),
    (v_league.id, 'transfer_reopen_hours',    '6'::jsonb),
    (v_league.id, 'transfer_wildcard_round',  'null'::jsonb),
    (v_league.id, 'club_cap_default',         '3'::jsonb),
    (v_league.id, 'club_cap_tier1_threshold', '8'::jsonb),
    (v_league.id, 'club_cap_tier1_value',     '4'::jsonb),
    (v_league.id, 'club_cap_tier2_threshold', '4'::jsonb),
    (v_league.id, 'club_cap_tier2_value',     '5'::jsonb),
    (v_league.id, 'club_cap_tier3_threshold', '2'::jsonb),
    (v_league.id, 'club_cap_tier3_value',     'null'::jsonb),
    (v_league.id, 'lineup_lock_per_fixture',  'true'::jsonb)
  ON CONFLICT (league_id, config_key) DO NOTHING;

  RETURN row_to_json(v_league);
END;
$$;

-- ── join_league_by_code ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION join_league_by_code(
  p_code    text,
  p_user_id uuid   -- ignored; auth.uid() used instead
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_caller       uuid := auth.uid();
  v_league_id    uuid;
  v_member_count int;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('error', 'UNAUTHORIZED');
  END IF;

  SELECT id INTO v_league_id
  FROM public.leagues
  WHERE join_code = UPPER(p_code);

  IF v_league_id IS NULL THEN
    RETURN jsonb_build_object('error', 'LEAGUE_NOT_FOUND');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.league_members
    WHERE league_id = v_league_id AND user_id = v_caller
  ) THEN
    RETURN jsonb_build_object('error', 'ALREADY_MEMBER');
  END IF;

  SELECT COUNT(*) INTO v_member_count
  FROM public.league_members
  WHERE league_id = v_league_id;

  IF v_member_count >= 20 THEN
    RETURN jsonb_build_object('error', 'LEAGUE_FULL');
  END IF;

  INSERT INTO public.league_members (league_id, user_id, role)
  VALUES (v_league_id, v_caller, 'member');

  RETURN jsonb_build_object('league_id', v_league_id, 'name',
    (SELECT name FROM public.leagues WHERE id = v_league_id),
    'success', true
  );
END;
$$;
