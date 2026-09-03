-- Migration 279: Admin on/off switch for the player-repeat relaxation formula
--
-- Pilot feedback on draft leagues was negative for the auto-relaxing no-repeat
-- rule (see docs/architecture/POOL_RELAXATION_SYSTEM.md). Rather than deleting
-- the mechanism, it's now gated behind a per-league config flag,
-- 'relaxation_formula_enabled' (league_config), so it can be re-enabled later
-- without re-writing any code.
--
-- Default is OFF for every league, current and future — a missing key is
-- treated as disabled (fail-closed, matching the existing missing-key=0
-- pattern in process-transfer's repeat check). While disabled,
-- apply_relaxation_state() no longer lets tier/repeats_allowed advance past 0
-- (strict, no shared ownership) regardless of pool pressure.
--
-- Once a league's pool pressure has actually pushed it past tier 0 (i.e.
-- shared ownership already exists on live squads), the flag is locked ON —
-- a trigger blocks any attempt to flip it back to false/off for that league.
-- This is a deliberate one-way door: per-product decision, there is no
-- "undo shared ownership" path once players are already double-owned.

CREATE OR REPLACE FUNCTION apply_relaxation_state(p_league_id UUID)
RETURNS JSON AS $$
DECLARE
  new_state    JSON;
  prev_tier    INT;
  new_tier     INT;
  tier_changed BOOLEAN;
  formula_on   BOOLEAN;
BEGIN
  SELECT (config_value::text)::boolean INTO formula_on
  FROM   league_config
  WHERE  league_id  = p_league_id
  AND    config_key = 'relaxation_formula_enabled';

  formula_on := COALESCE(formula_on, false);

  IF NOT formula_on THEN
    new_state := json_build_object('repeats_allowed', 0, 'tier', 0);
  ELSE
    new_state := calculate_relaxation_state(p_league_id);
  END IF;

  new_tier := (new_state->>'tier')::int;

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

-- ── One-way lock: once shared ownership exists, the flag can't be turned off ──
CREATE OR REPLACE FUNCTION prevent_relaxation_disable_after_shared_ownership()
RETURNS TRIGGER AS $$
DECLARE
  current_tier INT;
BEGIN
  IF NEW.config_key = 'relaxation_formula_enabled'
     AND (NEW.config_value::text)::boolean IS DISTINCT FROM true THEN
    SELECT (config_value::text)::int INTO current_tier
    FROM   league_config
    WHERE  league_id  = NEW.league_id
    AND    config_key = 'current_relaxation_tier';

    IF COALESCE(current_tier, 0) > 0 THEN
      RAISE EXCEPTION 'Cannot disable relaxation formula: league % already has shared ownership (tier %)', NEW.league_id, current_tier;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_relaxation_disable ON league_config;
CREATE TRIGGER trg_prevent_relaxation_disable
  BEFORE INSERT OR UPDATE ON league_config
  FOR EACH ROW
  EXECUTE FUNCTION prevent_relaxation_disable_after_shared_ownership();
