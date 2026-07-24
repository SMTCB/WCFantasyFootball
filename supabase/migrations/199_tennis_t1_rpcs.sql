-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 199 — Tennis Sprint T-1: Roster, Ace Card & QF Captain RPCs
-- (v2 branch only — not deployed to main until Week 12)
--
-- RPCs in this migration:
--   submit_tennis_roster             — pick 7 players (tier-validated) + optional ace card
--   set_tennis_qf_captain            — assign captain from surviving roster players
--   submit_atp_finals_group_picks    — 12 group-stage predictions
--   submit_atp_finals_knockout_picks — 3 SF/Final predictions
--   get_tennis_tournament_for_user   — rich read for the tournament screen
--   issue_season_ace_cards           — service-role: issue 4 cards per Player's Box member
-- ─────────────────────────────────────────────────────────────────────────────


-- ── 1. submit_tennis_roster ──────────────────────────────────────────────────
-- Validates tier slots, ace card eligibility, then upserts tennis_rosters.
-- Re-submitting while status='roster_open' is allowed — overwrites previous picks
-- and swaps the ace card (releases old card, marks new one used).
-- ATP Finals uses a different mechanic — call submit_atp_finals_group_picks instead.

CREATE OR REPLACE FUNCTION submit_tennis_roster(
  p_tournament_id  uuid,
  p_tier1          uuid,   -- must be tier=1 player from this tournament
  p_tier2a         uuid,   -- must be tier=2
  p_tier2b         uuid,   -- must be tier=2
  p_tier3a         uuid,   -- must be tier=3
  p_tier3b         uuid,   -- must be tier=3
  p_tier4a         uuid,   -- must be tier=4 (Dark Horse 1)
  p_tier4b         uuid,   -- must be tier=4 (Dark Horse 2)
  p_ace_card       text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_uid           uuid := auth.uid();
  v_tournament    tennis_tournaments%ROWTYPE;
  v_player_ids    uuid[];
  v_existing_card text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;

  SELECT * INTO v_tournament FROM tennis_tournaments WHERE id = p_tournament_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'TOURNAMENT_NOT_FOUND'; END IF;
  IF v_tournament.tournament_type = 'atp_finals' THEN
    RAISE EXCEPTION 'USE_ATP_FINALS_SUBMISSION';
  END IF;
  IF v_tournament.status <> 'roster_open' THEN
    RAISE EXCEPTION 'ROSTER_LOCKED';
  END IF;

  -- All 7 slots required
  IF p_tier1 IS NULL OR p_tier2a IS NULL OR p_tier2b IS NULL
     OR p_tier3a IS NULL OR p_tier3b IS NULL
     OR p_tier4a IS NULL OR p_tier4b IS NULL
  THEN
    RAISE EXCEPTION 'ALL_SLOTS_REQUIRED';
  END IF;

  -- No duplicate players across the 7 slots
  v_player_ids := ARRAY[p_tier1, p_tier2a, p_tier2b, p_tier3a, p_tier3b, p_tier4a, p_tier4b];
  IF (SELECT COUNT(DISTINCT x) FROM UNNEST(v_player_ids) AS t(x)) < 7 THEN
    RAISE EXCEPTION 'DUPLICATE_PLAYERS';
  END IF;

  -- Tier validation: each player must belong to this tournament AND the expected tier
  IF NOT EXISTS (SELECT 1 FROM tennis_tournament_players WHERE id = p_tier1  AND tournament_id = p_tournament_id AND tier = 1) THEN RAISE EXCEPTION 'INVALID_PLAYER_TIER1';  END IF;
  IF NOT EXISTS (SELECT 1 FROM tennis_tournament_players WHERE id = p_tier2a AND tournament_id = p_tournament_id AND tier = 2) THEN RAISE EXCEPTION 'INVALID_PLAYER_TIER2A'; END IF;
  IF NOT EXISTS (SELECT 1 FROM tennis_tournament_players WHERE id = p_tier2b AND tournament_id = p_tournament_id AND tier = 2) THEN RAISE EXCEPTION 'INVALID_PLAYER_TIER2B'; END IF;
  IF NOT EXISTS (SELECT 1 FROM tennis_tournament_players WHERE id = p_tier3a AND tournament_id = p_tournament_id AND tier = 3) THEN RAISE EXCEPTION 'INVALID_PLAYER_TIER3A'; END IF;
  IF NOT EXISTS (SELECT 1 FROM tennis_tournament_players WHERE id = p_tier3b AND tournament_id = p_tournament_id AND tier = 3) THEN RAISE EXCEPTION 'INVALID_PLAYER_TIER3B'; END IF;
  IF NOT EXISTS (SELECT 1 FROM tennis_tournament_players WHERE id = p_tier4a AND tournament_id = p_tournament_id AND tier = 4) THEN RAISE EXCEPTION 'INVALID_PLAYER_TIER4A'; END IF;
  IF NOT EXISTS (SELECT 1 FROM tennis_tournament_players WHERE id = p_tier4b AND tournament_id = p_tournament_id AND tier = 4) THEN RAISE EXCEPTION 'INVALID_PLAYER_TIER4B'; END IF;

  -- Ace card validation
  IF p_ace_card IS NOT NULL THEN
    IF p_ace_card NOT IN ('underdog_boost','safety_net','surface_specialist','dark_horse_insurance') THEN
      RAISE EXCEPTION 'INVALID_ACE_CARD_TYPE';
    END IF;
    -- Card is available if unused OR already used for THIS tournament (re-submit idempotency)
    IF NOT EXISTS (
      SELECT 1 FROM tennis_ace_cards
      WHERE user_id = v_uid AND season_year = v_tournament.season_year
        AND card_type = p_ace_card
        AND (used_tournament_id IS NULL OR used_tournament_id = p_tournament_id)
    ) THEN
      RAISE EXCEPTION 'ACE_CARD_UNAVAILABLE';
    END IF;
  END IF;

  -- If re-submitting with a different ace card, release the previously-used card first
  SELECT ace_card_type INTO v_existing_card
  FROM tennis_rosters
  WHERE user_id = v_uid AND tournament_id = p_tournament_id;

  IF v_existing_card IS NOT NULL AND v_existing_card IS DISTINCT FROM p_ace_card THEN
    UPDATE tennis_ace_cards
    SET used_tournament_id = NULL, used_at = NULL
    WHERE user_id = v_uid AND season_year = v_tournament.season_year
      AND card_type = v_existing_card;
  END IF;

  -- Mark new ace card as used
  IF p_ace_card IS NOT NULL THEN
    UPDATE tennis_ace_cards
    SET used_tournament_id = p_tournament_id, used_at = now()
    WHERE user_id = v_uid AND season_year = v_tournament.season_year
      AND card_type = p_ace_card;
  END IF;

  -- Upsert roster
  INSERT INTO tennis_rosters (
    user_id, tournament_id,
    tier1_player_id, tier2a_player_id, tier2b_player_id,
    tier3a_player_id, tier3b_player_id,
    tier4a_player_id, tier4b_player_id,
    ace_card_type, locked_at
  ) VALUES (
    v_uid, p_tournament_id,
    p_tier1, p_tier2a, p_tier2b,
    p_tier3a, p_tier3b,
    p_tier4a, p_tier4b,
    p_ace_card, now()
  )
  ON CONFLICT (user_id, tournament_id) DO UPDATE SET
    tier1_player_id  = EXCLUDED.tier1_player_id,
    tier2a_player_id = EXCLUDED.tier2a_player_id,
    tier2b_player_id = EXCLUDED.tier2b_player_id,
    tier3a_player_id = EXCLUDED.tier3a_player_id,
    tier3b_player_id = EXCLUDED.tier3b_player_id,
    tier4a_player_id = EXCLUDED.tier4a_player_id,
    tier4b_player_id = EXCLUDED.tier4b_player_id,
    ace_card_type    = EXCLUDED.ace_card_type,
    locked_at        = EXCLUDED.locked_at;

  RETURN jsonb_build_object('locked_at', now(), 'ace_card', p_ace_card);
END;
$$;


-- ── 2. set_tennis_qf_captain ─────────────────────────────────────────────────
-- Assigns a captain from the user's surviving roster players during the 48h window.
-- The captain earns 2× points IF they reach QF or beyond (enforced at scoring time).

CREATE OR REPLACE FUNCTION set_tennis_qf_captain(
  p_tournament_id     uuid,
  p_captain_player_id uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_uid        uuid := auth.uid();
  v_tournament tennis_tournaments%ROWTYPE;
  v_roster     tennis_rosters%ROWTYPE;
  v_roster_ids uuid[];
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;

  SELECT * INTO v_tournament FROM tennis_tournaments WHERE id = p_tournament_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'TOURNAMENT_NOT_FOUND'; END IF;
  IF v_tournament.status <> 'qf_captain_open' THEN RAISE EXCEPTION 'QF_WINDOW_NOT_OPEN'; END IF;
  IF now() > v_tournament.qf_window_closes_at THEN RAISE EXCEPTION 'QF_WINDOW_CLOSED'; END IF;

  SELECT * INTO v_roster
  FROM tennis_rosters
  WHERE user_id = v_uid AND tournament_id = p_tournament_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'NO_ROSTER'; END IF;

  -- Captain must be one of the 7 rostered players
  v_roster_ids := ARRAY[
    v_roster.tier1_player_id,  v_roster.tier2a_player_id, v_roster.tier2b_player_id,
    v_roster.tier3a_player_id, v_roster.tier3b_player_id,
    v_roster.tier4a_player_id, v_roster.tier4b_player_id
  ];
  IF NOT (p_captain_player_id = ANY(v_roster_ids)) THEN
    RAISE EXCEPTION 'PLAYER_NOT_IN_ROSTER';
  END IF;

  -- Captain must still be alive
  IF EXISTS (
    SELECT 1 FROM tennis_tournament_players
    WHERE id = p_captain_player_id AND eliminated = true
  ) THEN
    RAISE EXCEPTION 'PLAYER_ELIMINATED';
  END IF;

  INSERT INTO tennis_qf_captains (user_id, tournament_id, captain_player_id, set_at)
  VALUES (v_uid, p_tournament_id, p_captain_player_id, now())
  ON CONFLICT (user_id, tournament_id) DO UPDATE SET
    captain_player_id = EXCLUDED.captain_player_id,
    set_at            = EXCLUDED.set_at;

  RETURN jsonb_build_object(
    'success', true,
    'captain_player_id', p_captain_player_id,
    'set_at', now()
  );
END;
$$;


-- ── 3. submit_atp_finals_group_picks ────────────────────────────────────────
-- Submit predictions for all 12 group-stage matches (Login 1).
-- p_picks: [{match_number: 1..12, picked_player_id: uuid}, ...]
-- Idempotent — re-submitting while status='roster_open' overwrites all 12.

CREATE OR REPLACE FUNCTION submit_atp_finals_group_picks(
  p_season_year int,
  p_picks       jsonb
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_status    text;
  v_pick      jsonb;
  v_match_num int;
  v_picked_id uuid;
  v_match     tennis_atp_finals_matches%ROWTYPE;
  v_count     int := 0;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;

  SELECT status INTO v_status
  FROM tennis_tournaments
  WHERE season_year = p_season_year AND tournament_type = 'atp_finals';
  IF NOT FOUND THEN RAISE EXCEPTION 'ATP_FINALS_NOT_FOUND'; END IF;
  -- 'roster_open' is repurposed as "group picks open" for ATP Finals
  IF v_status <> 'roster_open' THEN RAISE EXCEPTION 'GROUP_PICKS_LOCKED'; END IF;

  IF jsonb_array_length(p_picks) <> 12 THEN
    RAISE EXCEPTION 'EXACTLY_12_PICKS_REQUIRED';
  END IF;

  FOR v_pick IN SELECT * FROM jsonb_array_elements(p_picks) LOOP
    v_match_num := (v_pick->>'match_number')::int;
    v_picked_id := (v_pick->>'picked_player_id')::uuid;

    IF v_match_num < 1 OR v_match_num > 12 THEN
      RAISE EXCEPTION 'INVALID_MATCH_NUMBER';
    END IF;

    SELECT * INTO v_match
    FROM tennis_atp_finals_matches
    WHERE season_year = p_season_year AND match_number = v_match_num;
    IF NOT FOUND THEN RAISE EXCEPTION 'MATCH_NOT_SEEDED'; END IF;

    IF v_picked_id IS DISTINCT FROM v_match.player_a_id
       AND v_picked_id IS DISTINCT FROM v_match.player_b_id
    THEN
      RAISE EXCEPTION 'INVALID_PICK_FOR_MATCH';
    END IF;

    INSERT INTO tennis_atp_finals_picks (user_id, season_year, match_number, picked_player_id, locked_at)
    VALUES (v_uid, p_season_year, v_match_num, v_picked_id, now())
    ON CONFLICT (user_id, season_year, match_number) DO UPDATE SET
      picked_player_id = EXCLUDED.picked_player_id,
      locked_at        = EXCLUDED.locked_at;

    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('locked_count', v_count, 'locked_at', now());
END;
$$;


-- ── 4. submit_atp_finals_knockout_picks ─────────────────────────────────────
-- Submit SF + Final predictions once all 12 group matches are resolved (Login 2).
-- p_picks: [{match_number: 13|14|15, picked_player_id: uuid}] — exactly 3 entries.
-- Status 'qf_captain_open' is repurposed as "knockout picks open" for ATP Finals.

CREATE OR REPLACE FUNCTION submit_atp_finals_knockout_picks(
  p_season_year int,
  p_picks       jsonb
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_uid            uuid := auth.uid();
  v_status         text;
  v_unresolved_grp int;
  v_pick           jsonb;
  v_match_num      int;
  v_picked_id      uuid;
  v_match          tennis_atp_finals_matches%ROWTYPE;
  v_count          int := 0;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;

  SELECT status INTO v_status
  FROM tennis_tournaments
  WHERE season_year = p_season_year AND tournament_type = 'atp_finals';
  IF NOT FOUND THEN RAISE EXCEPTION 'ATP_FINALS_NOT_FOUND'; END IF;
  IF v_status <> 'qf_captain_open' THEN RAISE EXCEPTION 'KNOCKOUT_PICKS_LOCKED'; END IF;

  -- All 12 group matches must have results before knockout picks open
  SELECT COUNT(*) INTO v_unresolved_grp
  FROM tennis_atp_finals_matches
  WHERE season_year = p_season_year AND match_type = 'group' AND result_entered_at IS NULL;
  IF v_unresolved_grp > 0 THEN RAISE EXCEPTION 'GROUP_STAGE_INCOMPLETE'; END IF;

  IF jsonb_array_length(p_picks) <> 3 THEN
    RAISE EXCEPTION 'EXACTLY_3_PICKS_REQUIRED';
  END IF;

  FOR v_pick IN SELECT * FROM jsonb_array_elements(p_picks) LOOP
    v_match_num := (v_pick->>'match_number')::int;
    v_picked_id := (v_pick->>'picked_player_id')::uuid;

    IF v_match_num < 13 OR v_match_num > 15 THEN
      RAISE EXCEPTION 'INVALID_KNOCKOUT_MATCH_NUMBER';
    END IF;

    SELECT * INTO v_match
    FROM tennis_atp_finals_matches
    WHERE season_year = p_season_year AND match_number = v_match_num;
    IF NOT FOUND THEN RAISE EXCEPTION 'KNOCKOUT_MATCH_NOT_SEEDED'; END IF;

    IF v_picked_id IS DISTINCT FROM v_match.player_a_id
       AND v_picked_id IS DISTINCT FROM v_match.player_b_id
    THEN
      RAISE EXCEPTION 'INVALID_PICK_FOR_KNOCKOUT_MATCH';
    END IF;

    INSERT INTO tennis_atp_finals_picks (user_id, season_year, match_number, picked_player_id, locked_at)
    VALUES (v_uid, p_season_year, v_match_num, v_picked_id, now())
    ON CONFLICT (user_id, season_year, match_number) DO UPDATE SET
      picked_player_id = EXCLUDED.picked_player_id,
      locked_at        = EXCLUDED.locked_at;

    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('locked_count', v_count, 'locked_at', now());
END;
$$;


-- ── 5. get_tennis_tournament_for_user ───────────────────────────────────────
-- Single read RPC for the tournament screen. Returns in one call:
--   tournament metadata, full player pool, user's roster, ace card inventory,
--   QF captain (if set), list of surviving player IDs.
-- Read-only — safe to call on every page load.

CREATE OR REPLACE FUNCTION get_tennis_tournament_for_user(p_tournament_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_uid         uuid := auth.uid();
  v_season_year int;
  v_tournament  jsonb;
  v_players     jsonb;
  v_roster      jsonb;
  v_captain     jsonb;
  v_ace_cards   jsonb;
  v_surviving   jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;

  -- Load season_year alongside tournament metadata (needed for ace card query)
  SELECT
    season_year,
    jsonb_build_object(
      'id',                  id,
      'name',                name,
      'season_year',         season_year,
      'tournament_type',     tournament_type,
      'surface',             surface,
      'draw_size',           draw_size,
      'start_date',          start_date,
      'end_date',            end_date,
      'status',              status,
      'roster_lock_at',      roster_lock_at,
      'qf_window_opens_at',  qf_window_opens_at,
      'qf_window_closes_at', qf_window_closes_at,
      'sort_order',          sort_order
    )
  INTO v_season_year, v_tournament
  FROM tennis_tournaments WHERE id = p_tournament_id;

  IF v_tournament IS NULL THEN RAISE EXCEPTION 'TOURNAMENT_NOT_FOUND'; END IF;

  -- Full player pool ordered by tier then seed
  SELECT jsonb_agg(jsonb_build_object(
    'id',           id,
    'player_name',  player_name,
    'nationality',  nationality,
    'seed',         seed,
    'tier',         tier,
    'round_reached',round_reached,
    'rounds_won',   rounds_won,
    'eliminated',   eliminated
  ) ORDER BY tier, seed NULLS LAST, player_name)
  INTO v_players
  FROM tennis_tournament_players
  WHERE tournament_id = p_tournament_id;

  -- User's roster (NULL if not yet submitted)
  SELECT jsonb_build_object(
    'tier1_player_id',  tier1_player_id,
    'tier2a_player_id', tier2a_player_id,
    'tier2b_player_id', tier2b_player_id,
    'tier3a_player_id', tier3a_player_id,
    'tier3b_player_id', tier3b_player_id,
    'tier4a_player_id', tier4a_player_id,
    'tier4b_player_id', tier4b_player_id,
    'ace_card_type',    ace_card_type,
    'locked_at',        locked_at
  ) INTO v_roster
  FROM tennis_rosters
  WHERE user_id = v_uid AND tournament_id = p_tournament_id;

  -- QF Captain (NULL if not set or window not open yet)
  SELECT jsonb_build_object(
    'captain_player_id', captain_player_id,
    'set_at',            set_at
  ) INTO v_captain
  FROM tennis_qf_captains
  WHERE user_id = v_uid AND tournament_id = p_tournament_id;

  -- Ace card inventory for this season
  SELECT jsonb_agg(jsonb_build_object(
    'card_type',          card_type,
    'used_tournament_id', used_tournament_id,
    'used_at',            used_at,
    'available',          used_tournament_id IS NULL
  ) ORDER BY card_type)
  INTO v_ace_cards
  FROM tennis_ace_cards
  WHERE user_id = v_uid AND season_year = v_season_year;

  -- Surviving player IDs (used to gate QF captain picker to live players only)
  SELECT jsonb_agg(id)
  INTO v_surviving
  FROM tennis_tournament_players
  WHERE tournament_id = p_tournament_id AND eliminated = false;

  RETURN jsonb_build_object(
    'tournament',        v_tournament,
    'players',           COALESCE(v_players,    '[]'::jsonb),
    'roster',            v_roster,
    'captain',           v_captain,
    'ace_cards',         COALESCE(v_ace_cards,  '[]'::jsonb),
    'surviving_players', COALESCE(v_surviving,  '[]'::jsonb)
  );
END;
$$;


-- ── 6. issue_season_ace_cards ────────────────────────────────────────────────
-- Service-role utility: issue 4 ace cards (one of each type) to every user
-- who belongs to at least one Player's Box in the given season year.
-- Idempotent — ON CONFLICT DO NOTHING makes it safe to re-run.
-- Called once before the Australian Open roster window opens.

CREATE OR REPLACE FUNCTION issue_season_ace_cards(p_season_year int)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_issued int := 0;
BEGIN
  INSERT INTO tennis_ace_cards (user_id, season_year, card_type)
  SELECT DISTINCT pbm.user_id, p_season_year, cards.card_type
  FROM player_box_members pbm
  JOIN player_boxes pb ON pb.id = pbm.player_box_id AND pb.season_year = p_season_year
  CROSS JOIN (VALUES
    ('underdog_boost'::text),
    ('safety_net'::text),
    ('surface_specialist'::text),
    ('dark_horse_insurance'::text)
  ) AS cards(card_type)
  ON CONFLICT (user_id, season_year, card_type) DO NOTHING;

  GET DIAGNOSTICS v_issued = ROW_COUNT;
  RETURN jsonb_build_object('cards_issued', v_issued, 'season_year', p_season_year);
END;
$$;

-- Restrict to service role — must not be callable by authenticated users
REVOKE ALL ON FUNCTION issue_season_ace_cards(int) FROM public, authenticated, anon;
GRANT EXECUTE ON FUNCTION issue_season_ace_cards(int) TO service_role;
