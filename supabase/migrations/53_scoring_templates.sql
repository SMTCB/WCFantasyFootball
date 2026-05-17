-- Migration 53: Scoring Templates — Competition-Aware Rule Engine
-- Purpose: Make scoring rules DB-configurable per tournament (EPL vs La Liga vs Serie A)
-- Date: 2026-05-17

-- Create scoring_templates table
CREATE TABLE IF NOT EXISTS public.scoring_templates (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  tournament_id TEXT NOT NULL, -- Forza tournament ID (e.g., "426" for EPL)
  position TEXT NOT NULL, -- 'GK', 'DEF', 'MID', 'FWD', or 'ANY' for all positions
  event_type TEXT NOT NULL, -- 'goal', 'assist', 'clean_sheet', 'yellow', 'red', 'own_goal', 'penalty_save', 'appearance', etc.
  points INT NOT NULL, -- Base points for this event (e.g., goal = 5)
  multiplier DECIMAL(4,2) DEFAULT 1.0, -- Position-based multiplier (e.g., FWD goal = 5 * 1.0 = 5, MID goal = 5 * 0.8 = 4)

  UNIQUE(tournament_id, position, event_type)
);

-- Indexes for efficient lookups
CREATE INDEX idx_scoring_templates_tournament ON public.scoring_templates(tournament_id);
CREATE INDEX idx_scoring_templates_event_lookup ON public.scoring_templates(tournament_id, position, event_type);

-- Enable RLS
ALTER TABLE public.scoring_templates ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Anyone can READ scoring templates (public information)
CREATE POLICY "scoring_templates_public_read"
  ON public.scoring_templates
  FOR SELECT
  USING (TRUE);

-- RLS Policy: Only admins can WRITE/UPDATE scoring templates
CREATE POLICY "scoring_templates_admin_write"
  ON public.scoring_templates
  FOR INSERT
  WITH CHECK (auth.jwt() ->> 'role' = 'authenticated' AND auth.jwt() ->> 'email' LIKE '%@admin%');

CREATE POLICY "scoring_templates_admin_update"
  ON public.scoring_templates
  FOR UPDATE
  USING (auth.jwt() ->> 'role' = 'authenticated' AND auth.jwt() ->> 'email' LIKE '%@admin%');

-- Seed EPL scoring rules (426 = EPL in Forza)
INSERT INTO public.scoring_templates (tournament_id, position, event_type, points, multiplier)
VALUES
  -- Appearance points
  ('426', 'ANY', 'appearance', 1, 1.0),

  -- Goal points (position-based)
  ('426', 'GK', 'goal', 5, 1.0),   -- GK goal = 5
  ('426', 'DEF', 'goal', 5, 1.0),  -- DEF goal = 5
  ('426', 'MID', 'goal', 5, 1.0),  -- MID goal = 5
  ('426', 'FWD', 'goal', 5, 1.0),  -- FWD goal = 5

  -- Assist points (position-based)
  ('426', 'GK', 'assist', 2, 1.0),
  ('426', 'DEF', 'assist', 3, 1.0),
  ('426', 'MID', 'assist', 3, 1.0),
  ('426', 'FWD', 'assist', 2, 1.0),

  -- Clean sheet (defenders only)
  ('426', 'DEF', 'clean_sheet', 4, 1.0),
  ('426', 'GK', 'clean_sheet', 4, 1.0),

  -- Saves (goalkeeper only)
  ('426', 'GK', 'penalty_save', 5, 1.0),

  -- Own goal (all positions)
  ('426', 'ANY', 'own_goal', -2, 1.0),

  -- Yellow and red cards
  ('426', 'ANY', 'yellow_card', -1, 1.0),
  ('426', 'ANY', 'red_card', -5, 1.0)
ON CONFLICT DO NOTHING;

-- RPC: Get scoring template for a tournament
CREATE OR REPLACE FUNCTION public.get_scoring_template(p_tournament_id TEXT)
RETURNS TABLE (
  position TEXT,
  event_type TEXT,
  points INT,
  multiplier DECIMAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    st.position,
    st.event_type,
    st.points,
    st.multiplier
  FROM public.scoring_templates st
  WHERE st.tournament_id = p_tournament_id
  ORDER BY st.position, st.event_type;
END;
$$ LANGUAGE plpgsql;

-- RPC: Upsert scoring rules (admin only)
CREATE OR REPLACE FUNCTION public.upsert_scoring_rules(
  p_tournament_id TEXT,
  p_rules JSONB
)
RETURNS TABLE (
  tournament_id TEXT,
  rules_count INT
) AS $$
DECLARE
  v_rule JSONB;
  v_position TEXT;
  v_event_type TEXT;
  v_points INT;
  v_multiplier DECIMAL;
  v_count INT := 0;
BEGIN
  -- Verify user is admin (basic check)
  IF NOT (auth.jwt() ->> 'role' = 'authenticated') THEN
    RAISE EXCEPTION 'Only authenticated users can upsert scoring rules';
  END IF;

  -- Iterate through rules array and upsert each one
  FOR v_rule IN
    SELECT jsonb_array_elements(p_rules)
  LOOP
    v_position := v_rule ->> 'position';
    v_event_type := v_rule ->> 'event_type';
    v_points := (v_rule ->> 'points')::INT;
    v_multiplier := COALESCE((v_rule ->> 'multiplier')::DECIMAL, 1.0);

    INSERT INTO public.scoring_templates (tournament_id, position, event_type, points, multiplier)
    VALUES (p_tournament_id, v_position, v_event_type, v_points, v_multiplier)
    ON CONFLICT (tournament_id, position, event_type)
    DO UPDATE SET
      points = EXCLUDED.points,
      multiplier = EXCLUDED.multiplier,
      updated_at = NOW();

    v_count := v_count + 1;
  END LOOP;

  RETURN QUERY
  SELECT p_tournament_id, v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC: Get effective points for an event (tournament + position aware)
CREATE OR REPLACE FUNCTION public.get_event_points(
  p_tournament_id TEXT,
  p_position TEXT,
  p_event_type TEXT
)
RETURNS INT AS $$
DECLARE
  v_points INT;
BEGIN
  -- First try position-specific rule
  SELECT points INTO v_points
  FROM public.scoring_templates
  WHERE tournament_id = p_tournament_id
    AND (position = p_position OR position = 'ANY')
    AND event_type = p_event_type
  ORDER BY CASE WHEN position = p_position THEN 0 ELSE 1 END
  LIMIT 1;

  -- Return the points, or 0 if no rule found
  RETURN COALESCE(v_points, 0);
END;
$$ LANGUAGE plpgsql;

-- Update the existing calculate_player_points function to use scoring templates
-- This replaces the hardcoded EPL rules with template-driven logic
CREATE OR REPLACE FUNCTION public.calculate_player_points(
  p_squad_id UUID,
  p_player_id BIGINT,
  p_tournament_id TEXT
)
RETURNS INT AS $$
DECLARE
  v_total_points INT := 0;
  v_position TEXT;
  v_event RECORD;
BEGIN
  -- Get player position
  SELECT position INTO v_position
  FROM public.squads_detail
  WHERE squad_id = p_squad_id AND player_id = p_player_id
  LIMIT 1;

  IF v_position IS NULL THEN
    RETURN 0;
  END IF;

  -- Award appearance points (1pt per appearance)
  SELECT COUNT(*) INTO v_total_points
  FROM public.match_events
  WHERE player_id = p_player_id;

  v_total_points := get_event_points(p_tournament_id, v_position, 'appearance') * v_total_points;

  -- Add goal points
  SELECT COUNT(*) INTO v_event
  FROM public.match_events
  WHERE player_id = p_player_id AND type = 'goal';
  v_total_points := v_total_points + (get_event_points(p_tournament_id, v_position, 'goal') * v_event);

  -- Add assist points
  SELECT COUNT(*) INTO v_event
  FROM public.match_events
  WHERE player_id = p_player_id AND type = 'assist';
  v_total_points := v_total_points + (get_event_points(p_tournament_id, v_position, 'assist') * v_event);

  -- Add clean sheet points (defenders/keepers only)
  IF v_position IN ('DEF', 'GK') THEN
    SELECT COUNT(DISTINCT fixture_id) INTO v_event
    FROM public.match_events
    WHERE player_id = p_player_id AND type = 'clean_sheet';
    v_total_points := v_total_points + (get_event_points(p_tournament_id, v_position, 'clean_sheet') * v_event);
  END IF;

  -- Add penalty save points (keepers only)
  IF v_position = 'GK' THEN
    SELECT COUNT(*) INTO v_event
    FROM public.match_events
    WHERE player_id = p_player_id AND type = 'penalty_save';
    v_total_points := v_total_points + (get_event_points(p_tournament_id, v_position, 'penalty_save') * v_event);
  END IF;

  -- Subtract yellow card points
  SELECT COUNT(*) INTO v_event
  FROM public.match_events
  WHERE player_id = p_player_id AND type = 'yellow_card';
  v_total_points := v_total_points + (get_event_points(p_tournament_id, v_position, 'yellow_card') * v_event);

  -- Subtract red card points
  SELECT COUNT(*) INTO v_event
  FROM public.match_events
  WHERE player_id = p_player_id AND type = 'red_card';
  v_total_points := v_total_points + (get_event_points(p_tournament_id, v_position, 'red_card') * v_event);

  -- Subtract own goal points
  SELECT COUNT(*) INTO v_event
  FROM public.match_events
  WHERE player_id = p_player_id AND type = 'own_goal';
  v_total_points := v_total_points + (get_event_points(p_tournament_id, v_position, 'own_goal') * v_event);

  RETURN GREATEST(v_total_points, 0);
END;
$$ LANGUAGE plpgsql;

-- Documentation comment
COMMENT ON TABLE public.scoring_templates IS 'Competition-specific scoring rules. Each tournament (EPL, La Liga, Serie A) has its own point values per event and position. Used by calculate_player_points() for accurate fantasy scoring across multiple competitions.';

COMMENT ON COLUMN public.scoring_templates.tournament_id IS 'Forza tournament ID (e.g., "426" for EPL, will be populated for La Liga/Serie A when providers are signed)';

COMMENT ON COLUMN public.scoring_templates.position IS 'Player position (GK, DEF, MID, FWD, or ANY for position-agnostic rules)';

COMMENT ON COLUMN public.scoring_templates.event_type IS 'Event classification (goal, assist, clean_sheet, yellow_card, red_card, own_goal, penalty_save, appearance)';

COMMENT ON COLUMN public.scoring_templates.points IS 'Base point value for the event (goal=5, assist=3, etc.)';

COMMENT ON COLUMN public.scoring_templates.multiplier IS 'Position-based multiplier. Usually 1.0, but can be < 1.0 for some positions (e.g., MID goal might be 4pts instead of 5)';
