-- Migration 75: L6.12 — calculate_relaxation_state counts active members only
-- "Active" = a member who has a squad in this league (i.e. has completed onboarding/draft).
-- league_members has no status column, so we proxy via squads presence.

CREATE OR REPLACE FUNCTION calculate_relaxation_state(p_league_id UUID)
RETURNS JSON AS $$
DECLARE
  cfg              RECORD;
  pool_stats       JSON;
  available        INT;
  n_managers       INT;
  pressure         NUMERIC;
  base_threshold   NUMERIC;
  repeats_allowed  INT;   -- NULL = unlimited
  tier             INT;   -- 0, 1, 2, 3
  repeats_arr      JSON;
BEGIN
  -- Load config values (with sane defaults if not seeded)
  SELECT
    COALESCE(MAX(CASE WHEN config_key = 'relaxation_base'       THEN (config_value::text)::numeric END), 0.6)  AS base,
    COALESCE(MAX(CASE WHEN config_key = 'relaxation_scale'      THEN (config_value::text)::numeric END), 40)   AS scale,
    COALESCE(MAX(CASE WHEN config_key = 'relaxation_tier2_mult' THEN (config_value::text)::numeric END), 1.4)  AS tier2_mult,
    COALESCE(MAX(CASE WHEN config_key = 'relaxation_tier3_mult' THEN (config_value::text)::numeric END), 1.8)  AS tier3_mult,
    MAX(CASE WHEN config_key = 'relaxation_repeats' THEN config_value::text END)                               AS repeats_json
  INTO cfg
  FROM league_config
  WHERE league_id = p_league_id;

  repeats_arr := COALESCE(cfg.repeats_json, '[0,1,3,null]')::json;

  -- Get pool size
  SELECT get_cup_pool_stats(p_league_id) INTO pool_stats;
  available := COALESCE((pool_stats->>'available_players')::int, 0);

  -- L6.12: count only active members (those who have a squad in this league)
  SELECT COUNT(*) INTO n_managers
  FROM league_members
  WHERE league_id = p_league_id
    AND user_id IN (
      SELECT DISTINCT user_id FROM squads WHERE league_id = p_league_id
    );

  -- Edge case: no pool data (league not in cup mode) → no restriction
  IF available = 0 OR n_managers = 0 THEN
    RETURN json_build_object(
      'repeats_allowed', 0,
      'tier',            0,
      'pressure',        0,
      'threshold',       cfg.base + (n_managers::numeric / cfg.scale),
      'n_managers',      n_managers,
      'available_pool',  available
    );
  END IF;

  pressure        := (n_managers * 15.0) / available;
  base_threshold  := cfg.base + (n_managers::numeric / cfg.scale);

  -- Determine tier
  IF pressure > base_threshold * cfg.tier3_mult THEN
    tier            := 3;
    repeats_allowed := NULL;  -- unlimited
  ELSIF pressure > base_threshold * cfg.tier2_mult THEN
    tier            := 2;
    repeats_allowed := (repeats_arr->>2)::int;  -- 3
  ELSIF pressure > base_threshold THEN
    tier            := 1;
    repeats_allowed := (repeats_arr->>1)::int;  -- 1
  ELSE
    tier            := 0;
    repeats_allowed := (repeats_arr->>0)::int;  -- 0
  END IF;

  RETURN json_build_object(
    'repeats_allowed', repeats_allowed,
    'tier',            tier,
    'pressure',        ROUND(pressure, 3),
    'threshold',       ROUND(base_threshold, 3),
    'n_managers',      n_managers,
    'available_pool',  available
  );
END;
$$ LANGUAGE plpgsql STABLE;
