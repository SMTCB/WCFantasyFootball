-- Migration 74: Draft fairness + cup pool correctness
--
-- L6.4: seed_cup_clubs — add tournament_id parameter so seeding is scoped to
--   the league's tournament. Previously inserted clubs from ALL players in the DB,
--   causing EPL cup leagues to pick up WC clubs and vice versa.
--   DEFAULT NULL preserves backward-compat for any caller that doesn't pass it.
--
-- L6.3: Trigger — auto-seed cup_active_clubs when a league enters cup mode.
--   seed_cup_clubs() was only called manually; now fires on INSERT (if already in
--   cup mode) and on UPDATE when cup_phase transitions out of 'pre_cup'.
--
-- L6.5: get_cup_available_players / get_cup_pool_stats auto-resolve — seeding is
--   now tournament-scoped so the join on cac.club_id = p.club correctly returns
--   only same-tournament players. No function-body changes needed.
--
-- L6.6: calculate_relaxation_state — replace hardcoded 15.0 squad size with
--   leagues.squad_size so pool pressure is accurate for leagues with non-default
--   squad sizes.

-- ── L6.4 ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION seed_cup_clubs(
  p_league_id    UUID,
  p_tournament_id TEXT DEFAULT NULL
)
RETURNS void AS $$
BEGIN
  INSERT INTO cup_active_clubs (league_id, club_id)
  SELECT DISTINCT p_league_id, club
  FROM   players
  WHERE  club IS NOT NULL AND club <> ''
  AND    (p_tournament_id IS NULL OR tournament_id = p_tournament_id)
  ON CONFLICT (league_id, club_id) DO NOTHING;
END;
$$ LANGUAGE plpgsql;

-- ── L6.3 ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION _trigger_seed_cup_clubs()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.cup_phase <> 'pre_cup' THEN
    PERFORM seed_cup_clubs(NEW.id, NEW.tournament_id);
  ELSIF TG_OP = 'UPDATE'
        AND OLD.cup_phase = 'pre_cup'
        AND NEW.cup_phase <> 'pre_cup' THEN
    PERFORM seed_cup_clubs(NEW.id, NEW.tournament_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS leagues_cup_seed ON leagues;
CREATE TRIGGER leagues_cup_seed
  AFTER INSERT OR UPDATE OF cup_phase ON leagues
  FOR EACH ROW
  EXECUTE FUNCTION _trigger_seed_cup_clubs();

-- ── L6.6 ─────────────────────────────────────────────────────────────────────
-- Re-create calculate_relaxation_state replacing the hardcoded 15.0 multiplier
-- with leagues.squad_size. The STABLE marker is kept — squad_size changes are
-- rare and the function is pure-read.
CREATE OR REPLACE FUNCTION calculate_relaxation_state(p_league_id UUID)
RETURNS JSON AS $$
DECLARE
  cfg              RECORD;
  pool_stats       JSON;
  available        INT;
  n_managers       INT;
  squad_sz         INT;
  pressure         NUMERIC;
  base_threshold   NUMERIC;
  repeats_allowed  INT;   -- NULL = unlimited
  tier             INT;   -- 0, 1, 2, 3
  repeats_arr      JSON;
BEGIN
  -- Load relaxation config keys from league_config
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

  -- Resolve squad size from the leagues row; default 15 if NULL
  SELECT COALESCE(squad_size, 15) INTO squad_sz
  FROM   leagues
  WHERE  id = p_league_id;

  -- Get pool size from cup active clubs
  SELECT get_cup_pool_stats(p_league_id) INTO pool_stats;
  available := COALESCE((pool_stats->>'available_players')::int, 0);

  -- Get manager count
  SELECT COUNT(*) INTO n_managers
  FROM   league_members
  WHERE  league_id = p_league_id;

  -- No pool data → league not in cup mode; no restriction
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

  pressure       := (n_managers::numeric * squad_sz) / available;
  base_threshold := cfg.base + (n_managers::numeric / cfg.scale);

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
