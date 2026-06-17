-- Migration 179: B-02 — round-aware transfer reopen hours
--
-- Previously get_transfer_window_status() always used 6h (transfer_reopen_hours
-- league_config key, default 6) for the scoring/reopen window after the last
-- kickoff, giving 8h total from last kickoff before the market reopens.
--
-- 6h was sized for knockout rounds (r4–r8) which can run to 120min + penalties.
-- Group-stage rounds (r1–r3) are capped at ~95min, so the existing 2h hardcoded
-- match buffer already covers full-time + settling. Dropping the scoring window
-- to 1h for group-stage rounds gives 3h total — freeing ~5h of transfer time
-- that managers previously lost waiting for a window that didn't need to be closed.
--
-- Logic (applied when transfer_reopen_hours is NOT explicitly set in league_config):
--   r1–r3 (group stage) : v_reopen_hours = 1  → 3h total from last kickoff
--   r4–r8 (knockouts)   : v_reopen_hours = 6  → 8h total from last kickoff
--
-- Commissioners can still override with league_config key 'transfer_reopen_hours'
-- which takes precedence over the round-derived default.

-- Remove the default-seeded transfer_reopen_hours = 6 entries from all leagues.
-- All 12 leagues had this value seeded by create_league as a hardcoded default,
-- not as a real commissioner override. Deleting them lets the function use the
-- round-derived default (1h group stage / 6h knockouts) for these leagues.
-- Commissioners who intentionally want to override can re-add the config key.
DELETE FROM league_config WHERE config_key = 'transfer_reopen_hours' AND (config_value #>> '{}')::int = 6;

CREATE OR REPLACE FUNCTION public.get_transfer_window_status(p_league_id uuid)
RETURNS json
LANGUAGE plpgsql
STABLE SECURITY DEFINER
AS $function$
DECLARE
  win                   transfer_windows;
  v_tournament_id       text;
  v_prev_deadline       timestamptz;
  v_prev_matchday_id    text;
  v_next_deadline       timestamptz;
  v_reopen_hours        int;   -- NULL until resolved (either config or round-derived)
  v_round_number        int;
  v_last_kickoff        timestamptz;
  v_reopen_at           timestamptz;
BEGIN
  -- Commissioner override: explicit transfer_reopen_hours in league_config
  SELECT (config_value #>> '{}')::int INTO v_reopen_hours
    FROM league_config
   WHERE league_id = p_league_id AND config_key = 'transfer_reopen_hours';
  -- v_reopen_hours stays NULL here if not configured — resolved later from round suffix

  -- 1. Active manual transfer_windows row (including emergency/unlimited windows)
  win := get_active_transfer_window(p_league_id);
  IF win.id IS NOT NULL THEN
    RETURN json_build_object(
      'status',              'open',
      'closes_at',           win.closes_at,
      'transfers_remaining', win.transfers_remaining,
      'window_type',         win.window_type
    );
  END IF;

  -- 2. Future manual transfer_windows row
  SELECT * INTO win
    FROM transfer_windows
   WHERE league_id = p_league_id AND opens_at > NOW()
   ORDER BY opens_at ASC LIMIT 1;
  IF win.id IS NOT NULL THEN
    RETURN json_build_object('status', 'upcoming', 'opens_at', win.opens_at, 'window_type', win.window_type);
  END IF;

  -- 3. Matchday-deadline path
  SELECT tournament_id INTO v_tournament_id FROM leagues WHERE id = p_league_id;
  IF v_tournament_id IS NULL THEN RETURN json_build_object('status', 'no_window'); END IF;

  -- Most recent past deadline and its matchday_id
  SELECT deadline_at, matchday_id
    INTO v_prev_deadline, v_prev_matchday_id
    FROM matchday_deadlines
   WHERE tournament_id = v_tournament_id AND deadline_at <= NOW()
   ORDER BY deadline_at DESC LIMIT 1;

  -- Next future deadline
  SELECT deadline_at INTO v_next_deadline
    FROM matchday_deadlines
   WHERE tournament_id = v_tournament_id AND deadline_at > NOW()
   ORDER BY deadline_at ASC LIMIT 1;

  -- No past deadline yet: open until first matchday
  IF v_prev_deadline IS NULL THEN
    IF v_next_deadline IS NOT NULL THEN
      RETURN json_build_object(
        'status', 'open', 'closes_at', v_next_deadline,
        'transfers_remaining', NULL, 'window_type', 'matchday'
      );
    END IF;
    RETURN json_build_object('status', 'no_window');
  END IF;

  -- Resolve reopen hours now that we know the round.
  -- Format: '{tournament_id}-r{N}' — extract N from the suffix after '-r'.
  IF v_reopen_hours IS NULL THEN
    IF v_prev_matchday_id IS NOT NULL THEN
      v_round_number := split_part(v_prev_matchday_id, '-r', 2)::int;
    END IF;
    IF v_round_number IS NOT NULL AND v_round_number <= 3 THEN
      v_reopen_hours := 1;   -- group stage: 3h total from last kickoff
    ELSE
      v_reopen_hours := 6;   -- knockouts or unknown: 8h total from last kickoff
    END IF;
  END IF;

  -- Find the last kickoff of the current matchday
  IF v_prev_matchday_id IS NOT NULL THEN
    SELECT MAX(kickoff_at) INTO v_last_kickoff
      FROM fixtures
     WHERE matchday_id   = v_prev_matchday_id
       AND tournament_id = v_tournament_id;
  END IF;

  -- reopen_at = last kickoff + 2h match buffer + v_reopen_hours scoring window
  -- Fallback: deadline + v_reopen_hours if no fixtures found for this matchday_id
  IF v_last_kickoff IS NOT NULL THEN
    v_reopen_at := v_last_kickoff
                 + interval '2 hours'
                 + (v_reopen_hours || ' hours')::interval;
  ELSE
    v_reopen_at := v_prev_deadline + (v_reopen_hours || ' hours')::interval;
  END IF;

  -- Past reopen_at → open until next deadline
  IF NOW() >= v_reopen_at THEN
    IF v_next_deadline IS NOT NULL THEN
      RETURN json_build_object(
        'status', 'open', 'closes_at', v_next_deadline,
        'transfers_remaining', NULL, 'window_type', 'matchday'
      );
    END IF;
    RETURN json_build_object('status', 'no_window');
  END IF;

  -- Still within the scoring window — closed, show estimated reopen time
  RETURN json_build_object(
    'status',      'upcoming',
    'opens_at',    v_reopen_at,
    'window_type', 'matchday'
  );
END;
$function$;
