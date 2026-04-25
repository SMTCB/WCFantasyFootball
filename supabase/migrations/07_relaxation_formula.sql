-- No-Repeat Relaxation Formula (S11)
-- Calculates how many repeated players are allowed per squad based on
-- pool pressure and league size. All constants live in league_config
-- so they can be adjusted with a single SQL update, no code changes.
--
-- Formula:
--   pressure  = (n_managers * 15) / available_pool_size
--   threshold = relaxation_base + (n_managers / relaxation_scale)
--   tier1: pressure > threshold          → repeats_allowed = repeats[1]  (1)
--   tier2: pressure > threshold * mult2  → repeats_allowed = repeats[2]  (3)
--   tier3: pressure > threshold * mult3  → repeats_allowed = repeats[3]  (null = unlimited)

-- 1. Core formula function — pure calculation, no side effects
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

  -- Get manager count
  SELECT COUNT(*) INTO n_managers
  FROM league_members WHERE league_id = p_league_id;

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

-- 2. Apply and persist: writes result to league_config + returns delta
--    Returns whether the tier changed (so callers can decide to gazette)
CREATE OR REPLACE FUNCTION apply_relaxation_state(p_league_id UUID)
RETURNS JSON AS $$
DECLARE
  new_state   JSON;
  prev_tier   INT;
  new_tier    INT;
  tier_changed BOOLEAN;
BEGIN
  new_state := calculate_relaxation_state(p_league_id);
  new_tier  := (new_state->>'tier')::int;

  -- Read previous tier from config
  SELECT (config_value::text)::int INTO prev_tier
  FROM   league_config
  WHERE  league_id  = p_league_id
  AND    config_key = 'current_relaxation_tier';

  tier_changed := (prev_tier IS DISTINCT FROM new_tier);

  -- Persist new tier
  INSERT INTO league_config (league_id, config_key, config_value)
  VALUES (p_league_id, 'current_relaxation_tier', to_json(new_tier))
  ON CONFLICT (league_id, config_key)
  DO UPDATE SET config_value = EXCLUDED.config_value, updated_at = NOW();

  -- Persist repeats_allowed (NULL stored as JSON null)
  INSERT INTO league_config (league_id, config_key, config_value)
  VALUES (p_league_id, 'current_repeats_allowed',
          COALESCE(to_json((new_state->>'repeats_allowed')::int), 'null'::json))
  ON CONFLICT (league_id, config_key)
  DO UPDATE SET config_value = EXCLUDED.config_value, updated_at = NOW();

  RETURN json_build_object(
    'state',        new_state,
    'tier_changed', tier_changed,
    'prev_tier',    prev_tier,
    'new_tier',     new_tier
  );
END;
$$ LANGUAGE plpgsql;
