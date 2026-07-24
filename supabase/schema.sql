


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";






CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "extensions";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "http" WITH SCHEMA "public";






CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."bid_status" AS ENUM (
    'pending',
    'won',
    'lost'
);


ALTER TYPE "public"."bid_status" OWNER TO "postgres";


CREATE TYPE "public"."cup_phase" AS ENUM (
    'pre_cup',
    'group_stage',
    'pre_elimination',
    'round_of_16',
    'quarter_final',
    'semi_final',
    'final'
);


ALTER TYPE "public"."cup_phase" OWNER TO "postgres";


CREATE TYPE "public"."draft_status" AS ENUM (
    'pending',
    'processed'
);


ALTER TYPE "public"."draft_status" OWNER TO "postgres";


CREATE TYPE "public"."event_type" AS ENUM (
    'goal',
    'yellow',
    'red',
    'sub',
    'var',
    'assist',
    'own_goal',
    'penalty_saved',
    'penalty_missed',
    'sub_off'
);


ALTER TYPE "public"."event_type" OWNER TO "postgres";


CREATE TYPE "public"."gazette_entry_type" AS ENUM (
    'draft_report',
    'breaking_news',
    'activity',
    'auction_result',
    'trade_result',
    'classified',
    'tennis_result',
    'p2p_challenge',
    'p2p_result'
);


ALTER TYPE "public"."gazette_entry_type" OWNER TO "postgres";


CREATE TYPE "public"."league_format" AS ENUM (
    'classic',
    'auction',
    'noduplicate',
    'hybrid'
);


ALTER TYPE "public"."league_format" OWNER TO "postgres";


CREATE TYPE "public"."match_status" AS ENUM (
    'scheduled',
    'live',
    'finished'
);


ALTER TYPE "public"."match_status" OWNER TO "postgres";


CREATE TYPE "public"."player_status_type" AS ENUM (
    'fit',
    'doubt',
    'out',
    'returning'
);


ALTER TYPE "public"."player_status_type" OWNER TO "postgres";


CREATE TYPE "public"."tennis_surface" AS ENUM (
    'hard',
    'clay',
    'grass',
    'hard_indoor'
);


ALTER TYPE "public"."tennis_surface" OWNER TO "postgres";


CREATE TYPE "public"."tennis_tournament_type" AS ENUM (
    'grand_slam',
    'masters_1000',
    'atp_finals'
);


ALTER TYPE "public"."tennis_tournament_type" OWNER TO "postgres";


CREATE TYPE "public"."transfer_window_type" AS ENUM (
    'standard',
    'unlimited',
    'cup_group',
    'cup_elimination'
);


ALTER TYPE "public"."transfer_window_type" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_create_user_wallet"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$ BEGIN PERFORM credit_coins(NEW.id, 500, 'admin', NULL, '{"reason":"welcome_bonus"}'::jsonb); RETURN NEW; END; $$;


ALTER FUNCTION "public"."_create_user_wallet"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_debit_entry_fee"("p_user_id" "uuid", "p_amount" integer, "p_league_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_wallet coin_wallets;
BEGIN
  SELECT * INTO v_wallet FROM coin_wallets WHERE user_id = p_user_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'WALLET_NOT_FOUND';
  END IF;

  IF v_wallet.balance < p_amount THEN
    RAISE EXCEPTION 'INSUFFICIENT_BALANCE';
  END IF;

  UPDATE coin_wallets
  SET balance    = balance - p_amount,
      updated_at = now()
  WHERE user_id = p_user_id;

  INSERT INTO coin_transactions (user_id, type, amount, meta, created_at)
  VALUES (
    p_user_id, 'entry_fee', p_amount,
    jsonb_build_object('reason', 'league_entry', 'league_id', p_league_id),
    now()
  );
END;
$$;


ALTER FUNCTION "public"."_debit_entry_fee"("p_user_id" "uuid", "p_amount" integer, "p_league_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_log_squad_event"("p_event_type" "text", "p_league_id" "uuid" DEFAULT NULL::"uuid", "p_user_id" "uuid" DEFAULT NULL::"uuid", "p_squad_id" "uuid" DEFAULT NULL::"uuid", "p_matchday_id" "text" DEFAULT NULL::"text", "p_player_in" "text" DEFAULT NULL::"text", "p_player_out" "text" DEFAULT NULL::"text", "p_meta" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  INSERT INTO squad_events
    (event_type, league_id, user_id, squad_id, matchday_id, player_in, player_out, meta)
  VALUES
    (p_event_type, p_league_id, p_user_id, p_squad_id, p_matchday_id, p_player_in, p_player_out, p_meta);
EXCEPTION WHEN OTHERS THEN
  NULL;  -- non-fatal: audit failure must never block a squad mutation
END;
$$;


ALTER FUNCTION "public"."_log_squad_event"("p_event_type" "text", "p_league_id" "uuid", "p_user_id" "uuid", "p_squad_id" "uuid", "p_matchday_id" "text", "p_player_in" "text", "p_player_out" "text", "p_meta" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_trigger_seed_cup_clubs"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
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
$$;


ALTER FUNCTION "public"."_trigger_seed_cup_clubs"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."accept_p2p_challenge"("p_challenge_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_user_id  uuid := auth.uid();
  v_ch       p2p_challenges;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;

  SELECT * INTO v_ch FROM p2p_challenges WHERE id = p_challenge_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CHALLENGE_NOT_FOUND'; END IF;
  IF v_ch.opponent_id <> v_user_id THEN RAISE EXCEPTION 'NOT_OPPONENT'; END IF;
  IF v_ch.status <> 'pending' THEN RAISE EXCEPTION 'CHALLENGE_NOT_PENDING'; END IF;
  IF v_ch.expires_at < now() THEN RAISE EXCEPTION 'CHALLENGE_EXPIRED'; END IF;

  -- Deduct opponent stake to escrow
  PERFORM debit_coins_to_escrow(
    v_user_id,
    v_ch.stake_coins,
    p_challenge_id,
    jsonb_build_object('reason', 'challenge_stake', 'matchday_id', v_ch.matchday_id)
  );

  UPDATE p2p_challenges
  SET status = 'accepted', updated_at = now()
  WHERE id = p_challenge_id;

  RETURN jsonb_build_object('status', 'accepted');
END;
$$;


ALTER FUNCTION "public"."accept_p2p_challenge"("p_challenge_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."accept_trade_proposal"("p_proposal_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_proposal          trade_proposals%ROWTYPE;
  v_target_user_id    UUID;
  v_proposer_user_id  UUID;
  v_proposer_budget   NUMERIC;
  v_target_budget     NUMERIC;
  v_prop_players      TEXT[];
  v_tgt_players       TEXT[];
  v_prop_player_name  TEXT;
  v_tgt_player_name   TEXT;
  v_proposer_username TEXT;
  v_target_username   TEXT;
  v_proposer_position TEXT;
  v_target_position   TEXT;
  v_window_status     JSON;
BEGIN
  SELECT * INTO v_proposal FROM trade_proposals WHERE id = p_proposal_id FOR UPDATE;
  IF v_proposal.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'PROPOSAL_NOT_FOUND');
  END IF;
  IF v_proposal.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'PROPOSAL_NOT_PENDING');
  END IF;
  IF v_proposal.expires_at < NOW() THEN
    UPDATE trade_proposals SET status = 'expired', resolved_at = NOW() WHERE id = p_proposal_id;
    RETURN jsonb_build_object('ok', false, 'error', 'PROPOSAL_EXPIRED');
  END IF;

  SELECT user_id INTO v_target_user_id   FROM squads WHERE id = v_proposal.target_squad_id;
  SELECT user_id INTO v_proposer_user_id FROM squads WHERE id = v_proposal.proposer_squad_id;

  IF v_target_user_id <> auth.uid() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NOT_TARGET_SQUAD_OWNER');
  END IF;

  SELECT get_transfer_window_status(v_proposal.league_id) INTO v_window_status;
  IF (v_window_status->>'status') <> 'open' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'WINDOW_CLOSED');
  END IF;

  IF v_proposal.proposer_squad_id < v_proposal.target_squad_id THEN
    SELECT players, budget_remaining INTO v_prop_players, v_proposer_budget FROM squads WHERE id = v_proposal.proposer_squad_id FOR UPDATE;
    SELECT players, budget_remaining INTO v_tgt_players,  v_target_budget   FROM squads WHERE id = v_proposal.target_squad_id   FOR UPDATE;
  ELSE
    SELECT players, budget_remaining INTO v_tgt_players,  v_target_budget   FROM squads WHERE id = v_proposal.target_squad_id   FOR UPDATE;
    SELECT players, budget_remaining INTO v_prop_players, v_proposer_budget FROM squads WHERE id = v_proposal.proposer_squad_id FOR UPDATE;
  END IF;

  IF NOT (v_proposal.proposer_player_id = ANY(v_prop_players)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'PROPOSER_PLAYER_NO_LONGER_IN_SQUAD');
  END IF;
  IF NOT (v_proposal.target_player_id = ANY(v_tgt_players)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'TARGET_PLAYER_NO_LONGER_IN_SQUAD');
  END IF;

  SELECT position INTO v_proposer_position FROM players WHERE id = v_proposal.proposer_player_id;
  SELECT position INTO v_target_position   FROM players WHERE id = v_proposal.target_player_id;
  IF v_proposer_position IS DISTINCT FROM v_target_position THEN
    RETURN jsonb_build_object('ok', false, 'error', 'POSITION_MISMATCH');
  END IF;

  IF v_proposal.cash_sweetener > 0 AND v_proposer_budget < v_proposal.cash_sweetener THEN
    RETURN jsonb_build_object('ok', false, 'error', 'PROPOSER_INSUFFICIENT_BUDGET');
  END IF;

  UPDATE squads
    SET players          = array_remove(players, v_proposal.proposer_player_id) || ARRAY[v_proposal.target_player_id],
        budget_remaining = budget_remaining - v_proposal.cash_sweetener
    WHERE id = v_proposal.proposer_squad_id;

  UPDATE squads
    SET players          = array_remove(players, v_proposal.target_player_id) || ARRAY[v_proposal.proposer_player_id],
        budget_remaining = budget_remaining + v_proposal.cash_sweetener
    WHERE id = v_proposal.target_squad_id;

  IF v_proposal.points_sweetener > 0 THEN
    UPDATE league_members
      SET total_points = total_points - v_proposal.points_sweetener
      WHERE league_id = v_proposal.league_id AND user_id = v_proposer_user_id;
    UPDATE league_members
      SET total_points = total_points + v_proposal.points_sweetener
      WHERE league_id = v_proposal.league_id AND user_id = v_target_user_id;
  END IF;

  UPDATE trade_proposals SET status = 'accepted', resolved_at = NOW() WHERE id = p_proposal_id;
  UPDATE trade_proposals SET status = 'cancelled', resolved_at = NOW()
    WHERE id <> p_proposal_id AND status = 'pending'
      AND (proposer_player_id IN (v_proposal.proposer_player_id, v_proposal.target_player_id)
        OR target_player_id  IN (v_proposal.proposer_player_id, v_proposal.target_player_id))
      AND (proposer_squad_id IN (v_proposal.proposer_squad_id, v_proposal.target_squad_id)
        OR target_squad_id   IN (v_proposal.proposer_squad_id, v_proposal.target_squad_id));

  INSERT INTO league_notifications (
    league_id, user_id, notification_type, triggered_by_user_id,
    title, description, related_entity_id, related_entity_type
  )
  SELECT v_proposal.league_id, s.user_id, 'trade_accepted', auth.uid(),
    'Trade Accepted',
    (SELECT name FROM players WHERE id = v_proposal.target_player_id) || ' is now in your squad',
    p_proposal_id, 'trade_proposal'
  FROM squads s WHERE s.id = v_proposal.proposer_squad_id;

  SELECT name INTO v_prop_player_name FROM players WHERE id = v_proposal.proposer_player_id;
  SELECT name INTO v_tgt_player_name  FROM players WHERE id = v_proposal.target_player_id;
  SELECT username INTO v_proposer_username FROM users WHERE id = v_proposer_user_id;
  SELECT username INTO v_target_username   FROM users WHERE id = v_target_user_id;

  INSERT INTO gazette_entries (league_id, entry_type, headline, bullets, published_at)
  VALUES (
    v_proposal.league_id,
    'trade_result',
    chr(129309) || ' ' || COALESCE(v_proposer_username, 'Manager')
      || ' ' || chr(8644) || ' ' || COALESCE(v_target_username, 'Manager')
      || ' ' || chr(8212) || ' deal done',
    jsonb_build_array(
      COALESCE(v_proposer_username, 'Manager') || ' sends ' || COALESCE(v_prop_player_name, '?')
        || ' to ' || COALESCE(v_target_username, 'Manager')
        || ' for ' || COALESCE(v_tgt_player_name, '?')
        || CASE WHEN v_proposal.cash_sweetener <> 0
                THEN ' + ' || chr(8364) || ABS(v_proposal.cash_sweetener) || 'M'
                ELSE '' END
        || CASE WHEN v_proposal.points_sweetener > 0
                THEN ' + ' || v_proposal.points_sweetener || 'pts'
                ELSE '' END
    ),
    NOW()
  );

  -- Log for proposer squad (gives proposer_player, receives target_player)
  PERFORM _log_squad_event('trade_accept', v_proposal.league_id, v_proposer_user_id,
    v_proposal.proposer_squad_id, NULL,
    v_proposal.target_player_id, v_proposal.proposer_player_id,
    jsonb_build_object('proposal_id', p_proposal_id,
                       'cash_sweetener', v_proposal.cash_sweetener,
                       'points_sweetener', v_proposal.points_sweetener,
                       'counterparty_user_id', v_target_user_id));

  -- Log for target squad (gives target_player, receives proposer_player)
  PERFORM _log_squad_event('trade_accept', v_proposal.league_id, v_target_user_id,
    v_proposal.target_squad_id, NULL,
    v_proposal.proposer_player_id, v_proposal.target_player_id,
    jsonb_build_object('proposal_id', p_proposal_id,
                       'cash_sweetener', -v_proposal.cash_sweetener,
                       'points_sweetener', -v_proposal.points_sweetener,
                       'counterparty_user_id', v_proposer_user_id));

  RETURN jsonb_build_object('ok', true);
END;
$$;


ALTER FUNCTION "public"."accept_trade_proposal"("p_proposal_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."activate_chip"("p_user_id" "uuid", "p_league_id" "uuid", "p_chip_type" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_squad      record;
  v_cur_val    boolean;
BEGIN
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RETURN jsonb_build_object('ok', false, 'code', 'UNAUTHORIZED',
      'error', 'You can only activate your own chips');
  END IF;

  IF p_chip_type = 'wildcard' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'CHIP_RETIRED',
      'error', 'The wildcard chip is no longer available');
  END IF;
  IF p_chip_type <> 'triple_captain' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Unknown chip type: ' || p_chip_type);
  END IF;

  SELECT * INTO v_squad FROM squads
   WHERE user_id = p_user_id AND league_id = p_league_id
   ORDER BY created_at DESC LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Squad not found');
  END IF;

  IF v_squad.matchday_id IS NOT NULL AND v_squad.matchday_id <> 'active' THEN
    IF EXISTS (SELECT 1 FROM matchday_deadlines
                WHERE matchday_id = v_squad.matchday_id AND deadline_at < NOW()) THEN
      RETURN jsonb_build_object('ok', false, 'code', 'DEADLINE_PASSED',
        'error', 'Matchday deadline has passed — chips cannot be changed.');
    END IF;
  END IF;

  v_cur_val := v_squad.is_triple_captain;
  IF NOT v_cur_val THEN
    IF EXISTS (SELECT 1 FROM chips_used
                WHERE user_id = p_user_id AND league_id = p_league_id
                  AND chip_type = p_chip_type AND matchday_id <> v_squad.matchday_id) THEN
      RETURN jsonb_build_object('ok', false, 'code', 'CHIP_ALREADY_USED',
        'error', 'This chip has already been used this season');
    END IF;
    INSERT INTO chips_used (user_id, league_id, chip_type, matchday_id)
    VALUES (p_user_id, p_league_id, p_chip_type, v_squad.matchday_id)
    ON CONFLICT (user_id, league_id, chip_type) DO UPDATE
      SET matchday_id = excluded.matchday_id, used_at = now();
  END IF;

  UPDATE squads SET is_triple_captain = NOT v_cur_val WHERE id = v_squad.id;
  RETURN jsonb_build_object('ok', true, 'active', NOT v_cur_val);
END;
$$;


ALTER FUNCTION "public"."activate_chip"("p_user_id" "uuid", "p_league_id" "uuid", "p_chip_type" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_complete_tournament"("p_tournament_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  UPDATE tennis_tournaments
  SET status = 'completed'
  WHERE id = p_tournament_id AND status IN ('qf_captain_open', 'in_progress');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TOURNAMENT_NOT_IN_SCOREABLE_STATE';
  END IF;

  RETURN jsonb_build_object('ok', true, 'status', 'completed');
END;
$$;


ALTER FUNCTION "public"."admin_complete_tournament"("p_tournament_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_enter_atp_finals_result"("p_season_year" integer, "p_match_number" integer, "p_winner_player_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  UPDATE tennis_atp_finals_matches
  SET
    winner_player_id  = p_winner_player_id,
    result_entered_at = now()
  WHERE season_year = p_season_year AND match_number = p_match_number;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'MATCH_NOT_FOUND';
  END IF;

  RETURN jsonb_build_object('ok', true, 'match_number', p_match_number,
    'winner_player_id', p_winner_player_id);
END;
$$;


ALTER FUNCTION "public"."admin_enter_atp_finals_result"("p_season_year" integer, "p_match_number" integer, "p_winner_player_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_enter_round_results"("p_tournament_id" "uuid", "p_eliminations" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_entry      jsonb;
  v_player_id  uuid;
  v_round      text;
  v_rounds_won int;
  v_count      int := 0;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM tennis_tournaments
    WHERE id = p_tournament_id AND status IN ('in_progress', 'qf_captain_open')
  ) THEN
    RAISE EXCEPTION 'TOURNAMENT_NOT_IN_PROGRESS';
  END IF;

  FOR v_entry IN SELECT * FROM jsonb_array_elements(p_eliminations) LOOP
    v_player_id  := (v_entry->>'player_id')::uuid;
    v_round      := v_entry->>'round_reached';
    v_rounds_won := ((v_entry->>'rounds_won')::int);

    UPDATE tennis_tournament_players
    SET
      eliminated   = true,
      round_reached = v_round,
      rounds_won   = v_rounds_won
    WHERE id = v_player_id AND tournament_id = p_tournament_id;

    v_count := v_count + 1;
  END LOOP;

  -- Mark champion (rounds_won highest player, not eliminated)
  -- Champion is set separately by admin_set_champion when tournament ends
  RETURN jsonb_build_object('ok', true, 'eliminations_recorded', v_count);
END;
$$;


ALTER FUNCTION "public"."admin_enter_round_results"("p_tournament_id" "uuid", "p_eliminations" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_grant_coins"("p_user_id" "uuid", "p_amount" integer, "p_reason" "text" DEFAULT 'admin_grant'::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- Only callable from service-role context (auth.uid() IS NULL)
  IF auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'ADMIN_ONLY';
  END IF;
  PERFORM credit_coins(p_user_id, p_amount, 'admin', NULL,
    json_build_object('reason', p_reason)::jsonb);
END;
$$;


ALTER FUNCTION "public"."admin_grant_coins"("p_user_id" "uuid", "p_amount" integer, "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_open_qf_window"("p_tournament_id" "uuid", "p_opens_at" timestamp with time zone, "p_closes_at" timestamp with time zone) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  UPDATE tennis_tournaments
  SET
    status              = 'qf_captain_open',
    qf_window_opens_at  = p_opens_at,
    qf_window_closes_at = p_closes_at
  WHERE id = p_tournament_id AND status = 'in_progress';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TOURNAMENT_NOT_IN_PROGRESS';
  END IF;

  RETURN jsonb_build_object('ok', true, 'status', 'qf_captain_open',
    'opens_at', p_opens_at, 'closes_at', p_closes_at);
END;
$$;


ALTER FUNCTION "public"."admin_open_qf_window"("p_tournament_id" "uuid", "p_opens_at" timestamp with time zone, "p_closes_at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_open_tournament"("p_tournament_id" "uuid", "p_roster_lock_at" timestamp with time zone, "p_external_id" integer DEFAULT NULL::integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_name text;
BEGIN
  SELECT name INTO v_name
  FROM tennis_tournaments
  WHERE id = p_tournament_id AND status = 'upcoming';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND_OR_ALREADY_OPEN';
  END IF;

  UPDATE tennis_tournaments
  SET
    status          = 'roster_open',
    roster_lock_at  = p_roster_lock_at,
    external_id     = COALESCE(p_external_id, external_id)
  WHERE id = p_tournament_id;

  RETURN jsonb_build_object('ok', true, 'name', v_name, 'status', 'roster_open');
END;
$$;


ALTER FUNCTION "public"."admin_open_tournament"("p_tournament_id" "uuid", "p_roster_lock_at" timestamp with time zone, "p_external_id" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_seed_atp_finals_matches"("p_season_year" integer, "p_matches" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_entry   jsonb;
  v_count   int := 0;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM tennis_seasons WHERE year = p_season_year) THEN
    RAISE EXCEPTION 'SEASON_NOT_FOUND';
  END IF;

  FOR v_entry IN SELECT * FROM jsonb_array_elements(p_matches) LOOP
    INSERT INTO tennis_atp_finals_matches (
      season_year, match_number, match_type, player_a_id, player_b_id
    ) VALUES (
      p_season_year,
      (v_entry->>'match_number')::int,
      v_entry->>'match_type',
      (v_entry->>'player_a_id')::uuid,
      (v_entry->>'player_b_id')::uuid
    )
    ON CONFLICT (season_year, match_number) DO UPDATE SET
      match_type  = EXCLUDED.match_type,
      player_a_id = EXCLUDED.player_a_id,
      player_b_id = EXCLUDED.player_b_id;

    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'matches_seeded', v_count);
END;
$$;


ALTER FUNCTION "public"."admin_seed_atp_finals_matches"("p_season_year" integer, "p_matches" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_seed_tournament_players"("p_tournament_id" "uuid", "p_players" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_count   int := 0;
  v_player  jsonb;
  v_tid     uuid := p_tournament_id;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM tennis_tournaments WHERE id = v_tid AND status != 'completed') THEN
    RAISE EXCEPTION 'TOURNAMENT_COMPLETED_OR_NOT_FOUND';
  END IF;

  FOR v_player IN SELECT * FROM jsonb_array_elements(p_players) LOOP
    INSERT INTO tennis_tournament_players (
      tournament_id, player_name, nationality, seed, tier, external_player_id
    ) VALUES (
      v_tid,
      v_player->>'player_name',
      v_player->>'nationality',
      (v_player->>'seed')::int,
      (v_player->>'tier')::int,
      (v_player->>'external_player_id')::int
    )
    ON CONFLICT (tournament_id, player_name) DO UPDATE SET
      nationality        = EXCLUDED.nationality,
      seed               = EXCLUDED.seed,
      tier               = EXCLUDED.tier,
      external_player_id = COALESCE(EXCLUDED.external_player_id, tennis_tournament_players.external_player_id);

    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'upserted', v_count);
END;
$$;


ALTER FUNCTION "public"."admin_seed_tournament_players"("p_tournament_id" "uuid", "p_players" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_set_champion"("p_tournament_id" "uuid", "p_player_id" "uuid", "p_rounds_won" integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_name text;
BEGIN
  UPDATE tennis_tournament_players
  SET
    round_reached = 'champion',
    rounds_won    = p_rounds_won,
    eliminated    = false
  WHERE id = p_player_id AND tournament_id = p_tournament_id
  RETURNING player_name INTO v_name;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PLAYER_NOT_FOUND';
  END IF;

  RETURN jsonb_build_object('ok', true, 'champion', v_name);
END;
$$;


ALTER FUNCTION "public"."admin_set_champion"("p_tournament_id" "uuid", "p_player_id" "uuid", "p_rounds_won" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_start_tournament"("p_tournament_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  UPDATE tennis_tournaments
  SET status = 'in_progress'
  WHERE id = p_tournament_id AND status = 'roster_open';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_IN_ROSTER_OPEN_STATUS';
  END IF;

  RETURN jsonb_build_object('ok', true, 'status', 'in_progress');
END;
$$;


ALTER FUNCTION "public"."admin_start_tournament"("p_tournament_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."aggregate_league_member_points"("p_league_id" "uuid", "p_user_id" "uuid") RETURNS numeric
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_fantasy_points NUMERIC(10,2) := 0;
  v_bet_rewards    NUMERIC(10,2) := 0;
  v_total          NUMERIC(10,2);
BEGIN
  -- Sum fantasy_points for all squads owned by this user in this league.
  SELECT COALESCE(SUM(fp.total), 0)
  INTO v_fantasy_points
  FROM fantasy_points fp
  JOIN squads s ON s.id = fp.squad_id
  WHERE s.league_id = p_league_id
    AND s.user_id   = p_user_id;

  -- Sum resolved 'points'-type bet rewards only (L3.7: exclude 'budget' rewards).
  -- bet_submissions links to the manager through squad_id → squads.user_id.
  SELECT COALESCE(SUM(bs.reward_awarded), 0)
  INTO v_bet_rewards
  FROM bet_submissions bs
  JOIN bet_instances   bi ON bi.id = bs.bet_instance_id
  JOIN squads          s  ON s.id  = bs.squad_id
  WHERE bi.league_id      = p_league_id
    AND s.user_id          = p_user_id
    AND bs.reward_awarded IS NOT NULL
    AND bi.status          = 'resolved'
    AND bi.reward_type     = 'points';

  v_total := ROUND((v_fantasy_points + v_bet_rewards)::numeric, 2);

  UPDATE public.league_members
  SET total_points = v_total
  WHERE league_id = p_league_id
    AND user_id   = p_user_id;

  RETURN v_total;
END;
$$;


ALTER FUNCTION "public"."aggregate_league_member_points"("p_league_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."aggregate_league_member_points"("p_league_id" "uuid", "p_user_id" "uuid") IS 'Recalculates league_members.total_points by summing fantasy points + bet rewards.
   Called after scoring updates or bet resolution. Returns combined total.';



CREATE OR REPLACE FUNCTION "public"."apply_relaxation_state"("p_league_id" "uuid") RETURNS json
    LANGUAGE "plpgsql"
    AS $$
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
$$;


ALTER FUNCTION "public"."apply_relaxation_state"("p_league_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."auto_resolve_p2p_challenges"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_ch     p2p_challenges;
  v_count  int := 0;
  v_result jsonb;
BEGIN
  FOR v_ch IN
    SELECT DISTINCT c.*
    FROM p2p_challenges c
    WHERE c.status = 'accepted'
      AND EXISTS (
        -- Matchday settled for this league
        SELECT 1 FROM gazette_entries ge
        WHERE ge.league_id  = c.league_id
          AND ge.entry_type = 'activity'
          AND ge.full_data->>'matchday_id' = c.matchday_id
      )
    ORDER BY c.created_at
    FOR UPDATE SKIP LOCKED
  LOOP
    BEGIN
      v_result := resolve_p2p_challenge(v_ch.id);
      v_count  := v_count + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'auto_resolve_p2p_challenges: failed for challenge %: %', v_ch.id, SQLERRM;
    END;
  END LOOP;

  RETURN v_count;
END;
$$;


ALTER FUNCTION "public"."auto_resolve_p2p_challenges"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."calculate_relaxation_state"("p_league_id" "uuid") RETURNS json
    LANGUAGE "plpgsql" STABLE
    AS $$
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
$$;


ALTER FUNCTION "public"."calculate_relaxation_state"("p_league_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cancel_p2p_challenge"("p_challenge_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_ch      p2p_challenges;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;

  SELECT * INTO v_ch FROM p2p_challenges WHERE id = p_challenge_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CHALLENGE_NOT_FOUND'; END IF;
  IF v_ch.challenger_id <> v_user_id THEN RAISE EXCEPTION 'NOT_CHALLENGER'; END IF;
  IF v_ch.status NOT IN ('pending') THEN RAISE EXCEPTION 'CANNOT_CANCEL'; END IF;

  -- Refund challenger's stake
  PERFORM release_escrow(
    v_ch.challenger_id,
    v_ch.stake_coins,
    p_challenge_id,
    jsonb_build_object('reason', 'challenge_cancelled')
  );
  PERFORM credit_coins(
    v_ch.challenger_id,
    v_ch.stake_coins,
    'refund',
    p_challenge_id,
    jsonb_build_object('reason', 'challenge_cancelled')
  );

  UPDATE p2p_challenges
  SET status = 'cancelled', updated_at = now()
  WHERE id = p_challenge_id;

  RETURN jsonb_build_object('status', 'cancelled');
END;
$$;


ALTER FUNCTION "public"."cancel_p2p_challenge"("p_challenge_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cancel_trade_proposal"("p_proposal_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_proposal          trade_proposals%ROWTYPE;
  v_proposer_user_id  UUID;
BEGIN
  SELECT * INTO v_proposal FROM trade_proposals WHERE id = p_proposal_id;

  IF v_proposal.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'PROPOSAL_NOT_FOUND');
  END IF;

  IF v_proposal.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'PROPOSAL_NOT_PENDING');
  END IF;

  SELECT user_id INTO v_proposer_user_id FROM squads WHERE id = v_proposal.proposer_squad_id;

  IF v_proposer_user_id <> auth.uid() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NOT_PROPOSER');
  END IF;

  UPDATE trade_proposals
    SET status = 'cancelled', resolved_at = NOW()
    WHERE id = p_proposal_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;


ALTER FUNCTION "public"."cancel_trade_proposal"("p_proposal_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_chat_rate_limit"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM public.chat_messages
  WHERE user_id   = NEW.user_id
    AND league_id = NEW.league_id
    AND created_at > NOW() - INTERVAL '10 seconds';

  IF v_count >= 5 THEN
    RAISE EXCEPTION 'Rate limit: max 5 messages per 10 seconds';
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."check_chat_rate_limit"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_draft_submission_deadline"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_deadline timestamptz;
BEGIN
  SELECT draft_deadline INTO v_deadline
  FROM leagues
  WHERE id = NEW.league_id;

  IF v_deadline IS NOT NULL AND NOW() > v_deadline THEN
    RAISE EXCEPTION 'Draft deadline has passed for league %', NEW.league_id
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."check_draft_submission_deadline"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."claim_draft_player"("p_league_id" "uuid", "p_player_id" "text", "p_phase" "text" DEFAULT 'group'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_user         uuid := auth.uid();
  v_squad_size   int;
  v_pos_caps     jsonb;
  v_budget_total numeric;
  v_tournament   text;
  v_alloc        draft_allocations%ROWTYPE;
  v_player       players%ROWTYPE;
  v_pos          text;
  v_pos_count    int;
  v_spent        numeric;
  v_matchday     text;
  v_new_players  text[];
  v_squad_id     uuid;
  v_new_budget   numeric;
  v_is_complete  bool;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_league_id::text || ':' || p_phase));

  IF NOT EXISTS (SELECT 1 FROM league_members WHERE league_id = p_league_id AND user_id = v_user) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not a league member');
  END IF;

  SELECT squad_size, position_limits, budget_total, tournament_id
    INTO v_squad_size, v_pos_caps, v_budget_total, v_tournament
    FROM leagues WHERE id = p_league_id;
  v_squad_size   := COALESCE(v_squad_size, 15);
  v_budget_total := COALESCE(v_budget_total, 100);

  SELECT * INTO v_player FROM players WHERE id = p_player_id;
  IF v_player.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Player not found');
  END IF;
  IF v_tournament IS NOT NULL AND v_player.tournament_id IS DISTINCT FROM v_tournament THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Player not in league tournament');
  END IF;

  IF EXISTS (
    SELECT 1 FROM draft_allocations
     WHERE league_id = p_league_id AND phase = p_phase
       AND p_player_id = ANY(allocated_players)
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'PLAYER_TAKEN', 'error', 'Player already drafted');
  END IF;

  SELECT * INTO v_alloc FROM draft_allocations
   WHERE league_id = p_league_id AND user_id = v_user AND phase = p_phase
   FOR UPDATE;
  IF v_alloc.user_id IS NULL THEN
    INSERT INTO draft_allocations (league_id, user_id, phase, allocated_players, unresolved_slots, allocated_at)
    VALUES (p_league_id, v_user, p_phase, ARRAY[]::text[], v_squad_size, NOW())
    RETURNING * INTO v_alloc;
  END IF;

  IF p_player_id = ANY(COALESCE(v_alloc.allocated_players, ARRAY[]::text[])) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Already in your squad');
  END IF;
  IF COALESCE(array_length(v_alloc.allocated_players, 1), 0) >= v_squad_size THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SQUAD_FULL', 'error', 'Squad is full');
  END IF;

  v_pos := upper(COALESCE(v_player.position, 'MID'));
  IF v_pos NOT IN ('GK','DEF','MID','FWD') THEN v_pos := 'MID'; END IF;
  IF v_pos_caps ? v_pos THEN
    SELECT count(*) INTO v_pos_count FROM players
      WHERE id = ANY(v_alloc.allocated_players) AND upper(position) = v_pos;
    IF v_pos_count >= (v_pos_caps ->> v_pos)::int THEN
      RETURN jsonb_build_object('ok', false, 'code', 'POSITION_LIMIT', 'error', 'Position limit reached');
    END IF;
  END IF;

  SELECT COALESCE(SUM(price), 0) INTO v_spent FROM players WHERE id = ANY(v_alloc.allocated_players);
  IF v_spent + COALESCE(v_player.price, 0) > v_budget_total THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INSUFFICIENT_BUDGET', 'error', 'Over budget');
  END IF;

  v_new_players := COALESCE(v_alloc.allocated_players, ARRAY[]::text[]) || ARRAY[p_player_id];
  v_new_budget  := GREATEST(0, v_budget_total - (v_spent + COALESCE(v_player.price, 0)));
  v_is_complete := array_length(v_new_players, 1) >= v_squad_size;

  UPDATE draft_allocations
     SET allocated_players = v_new_players,
         unresolved_slots  = GREATEST(0, v_squad_size - array_length(v_new_players, 1)),
         allocated_at      = NOW()
   WHERE league_id = p_league_id AND user_id = v_user AND phase = p_phase;

  SELECT id INTO v_squad_id
    FROM squads
   WHERE league_id = p_league_id AND user_id = v_user
   ORDER BY created_at DESC
   LIMIT 1;

  IF v_squad_id IS NOT NULL THEN
    UPDATE squads
       SET players                = v_new_players,
           budget_remaining       = v_new_budget,
           initial_build_complete = v_is_complete
     WHERE id = v_squad_id;
  ELSE
    SELECT matchday_id INTO v_matchday
      FROM matchday_deadlines
     WHERE tournament_id = v_tournament AND deadline_at > NOW()
     ORDER BY deadline_at ASC LIMIT 1;

    IF v_matchday IS NULL THEN
      SELECT matchday_id INTO v_matchday
        FROM matchday_deadlines
       WHERE tournament_id = v_tournament
       ORDER BY deadline_at DESC LIMIT 1;
    END IF;

    INSERT INTO squads (league_id, user_id, matchday_id, players, budget_remaining, initial_build_complete)
    VALUES (p_league_id, v_user, COALESCE(v_matchday, 'current'),
            v_new_players, v_new_budget, v_is_complete)
    ON CONFLICT (league_id, user_id, matchday_id) DO UPDATE
      SET players                = EXCLUDED.players,
          budget_remaining       = EXCLUDED.budget_remaining,
          initial_build_complete = EXCLUDED.initial_build_complete;

    SELECT id INTO v_squad_id
      FROM squads
     WHERE league_id = p_league_id AND user_id = v_user
     ORDER BY created_at DESC LIMIT 1;
  END IF;

  PERFORM _log_squad_event('draft_pick', p_league_id, v_user, v_squad_id, NULL,
    p_player_id, NULL,
    jsonb_build_object('phase', p_phase, 'pick_number', array_length(v_new_players, 1)));

  RETURN jsonb_build_object(
    'ok',              true,
    'allocated_count', array_length(v_new_players, 1),
    'done',            v_is_complete
  );
END;
$$;


ALTER FUNCTION "public"."claim_draft_player"("p_league_id" "uuid", "p_player_id" "text", "p_phase" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."confirm_auction_win"("p_listing_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_listing      auction_listings;
  v_seller       squads;
  v_buyer        squads;
  v_tournament   TEXT;
  v_matchday_id  TEXT;
  v_squad_size   INT;
  v_window       JSON;
  v_player_name  TEXT;
  v_buyer_name   TEXT;
  v_seller_name  TEXT;
BEGIN
  SELECT * INTO v_listing
  FROM auction_listings
  WHERE id = p_listing_id AND status = 'pending_confirmation'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Auction not found or not awaiting confirmation.');
  END IF;

  IF v_listing.highest_bidder_id <> auth.uid() THEN
    RETURN jsonb_build_object('ok', false, 'code', 'UNAUTHORIZED',
      'error', 'Only the winning bidder can confirm this purchase.');
  END IF;

  SELECT get_transfer_window_status(v_listing.league_id) INTO v_window;
  IF (v_window->>'status') <> 'open' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'WINDOW_CLOSED',
      'error', 'The transfer window is not open. Come back when it opens to confirm.');
  END IF;

  SELECT COALESCE(squad_size, 15) INTO v_squad_size
  FROM leagues WHERE id = v_listing.league_id;

  SELECT l.tournament_id INTO v_tournament
  FROM leagues l WHERE l.id = v_listing.league_id;

  IF v_tournament IS NOT NULL THEN
    SELECT matchday_id INTO v_matchday_id
    FROM matchday_deadlines
    WHERE tournament_id = v_tournament AND deadline_at >= NOW()
    ORDER BY deadline_at ASC LIMIT 1;
  END IF;

  SELECT * INTO v_seller FROM squads WHERE id = v_listing.seller_id FOR UPDATE;
  IF NOT FOUND THEN
    UPDATE auction_listings SET status = 'cancelled', updated_at = NOW() WHERE id = p_listing_id;
    RETURN jsonb_build_object('ok', false, 'code', 'SELLER_GONE',
      'error', 'Seller squad no longer exists. Purchase cancelled.');
  END IF;

  SELECT * INTO v_buyer FROM squads
  WHERE league_id = v_listing.league_id AND user_id = auth.uid()
  ORDER BY created_at DESC LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    UPDATE auction_listings SET status = 'cancelled', updated_at = NOW() WHERE id = p_listing_id;
    RETURN jsonb_build_object('ok', false, 'code', 'BUYER_GONE',
      'error', 'Your squad was not found. Purchase cancelled.');
  END IF;

  IF COALESCE(array_length(v_buyer.players, 1), 0) >= v_squad_size THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SQUAD_FULL',
      'error', 'Your squad is full. Sell a player first, then come back to confirm.');
  END IF;

  IF v_buyer.budget_remaining < v_listing.current_bid THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INSUFFICIENT_BUDGET',
      'error', 'Not enough budget. Sell a player to free up funds, then confirm again.',
      'required', v_listing.current_bid,
      'available', v_buyer.budget_remaining);
  END IF;

  IF v_listing.player_id = ANY(v_buyer.players) THEN
    UPDATE auction_listings SET status = 'cancelled', updated_at = NOW() WHERE id = p_listing_id;
    RETURN jsonb_build_object('ok', false, 'code', 'DUPLICATE',
      'error', 'You already own this player. Purchase cancelled.');
  END IF;

  UPDATE squads
  SET players          = array_remove(players, v_listing.player_id),
      budget_remaining = budget_remaining + v_listing.current_bid
  WHERE id = v_seller.id;

  UPDATE squads
  SET players          = array_append(players, v_listing.player_id),
      budget_remaining = budget_remaining - v_listing.current_bid
  WHERE id = v_buyer.id;

  UPDATE auction_listings SET status = 'sold', updated_at = NOW()
  WHERE id = p_listing_id;

  SELECT name INTO v_player_name FROM players WHERE id = v_listing.player_id;
  SELECT username INTO v_buyer_name  FROM users WHERE id = auth.uid();
  SELECT username INTO v_seller_name FROM users WHERE id = v_seller.user_id;

  INSERT INTO gazette_entries (
    league_id, entry_type, headline, bullets, full_data, published_at
  ) VALUES (
    v_listing.league_id,
    'auction_result',
    chr(128296) || ' ' || COALESCE(v_player_name, 'Player') || ' sold ' || chr(8212) || ' ' || chr(8364) || v_listing.current_bid || 'M',
    jsonb_build_array(
      COALESCE(v_buyer_name,  'Buyer')  || ' signed '   ||
      COALESCE(v_player_name, 'Player') || ' from '     ||
      COALESCE(v_seller_name, 'Seller') || ' for ' || chr(8364) ||
      v_listing.current_bid || 'M'
    ),
    jsonb_build_object(
      'player_id',   v_listing.player_id,
      'player_name', v_player_name,
      'buyer_id',    v_buyer.id,
      'buyer_name',  v_buyer_name,
      'seller_id',   v_listing.seller_id,
      'seller_name', v_seller_name,
      'amount',      v_listing.current_bid
    ),
    NOW()
  );

  PERFORM _log_squad_event('auction_win', v_listing.league_id, auth.uid(), v_buyer.id, NULL,
    v_listing.player_id, NULL,
    jsonb_build_object('amount', v_listing.current_bid, 'listing_id', p_listing_id,
                       'seller_squad_id', v_seller.id));

  RETURN jsonb_build_object(
    'ok',        true,
    'result',    'sold',
    'amount',    v_listing.current_bid,
    'player_id', v_listing.player_id
  );
END;
$$;


ALTER FUNCTION "public"."confirm_auction_win"("p_listing_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_circle"("p_name" "text") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_user_id   uuid := auth.uid();
  v_circle_id uuid;
  v_code      text;
  v_channel_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN json_build_object('error', 'UNAUTHENTICATED');
  END IF;

  IF length(trim(p_name)) = 0 THEN
    RETURN json_build_object('error', 'NAME_REQUIRED');
  END IF;

  INSERT INTO circles (name, created_by)
  VALUES (trim(p_name), v_user_id)
  RETURNING id, invite_code INTO v_circle_id, v_code;

  INSERT INTO circle_members (circle_id, user_id, role)
  VALUES (v_circle_id, v_user_id, 'owner');

  -- Auto-create the General channel every new Clubhouse gets
  INSERT INTO clubhouse_channels (circle_id, name, is_default, created_by)
  VALUES (v_circle_id, 'General', true, v_user_id)
  RETURNING id INTO v_channel_id;

  RETURN json_build_object(
    'circle_id',      v_circle_id,
    'invite_code',    v_code,
    'general_channel_id', v_channel_id
  );
END;
$$;


ALTER FUNCTION "public"."create_circle"("p_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_late_joiner_allocation"("p_league_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_caller       uuid := auth.uid();
  v_list_size    int;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  -- Must be a league member
  IF NOT EXISTS (
    SELECT 1 FROM league_members WHERE league_id = p_league_id AND user_id = v_caller
  ) THEN
    RAISE EXCEPTION 'NOT_MEMBER';
  END IF;

  -- Lottery must have already run for at least one other member
  IF NOT EXISTS (
    SELECT 1 FROM draft_allocations
    WHERE league_id = p_league_id AND allocated_players IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'LOTTERY_NOT_RUN';
  END IF;

  -- No-op if this user already has an allocation
  IF EXISTS (
    SELECT 1 FROM draft_allocations WHERE league_id = p_league_id AND user_id = v_caller
  ) THEN
    RETURN;
  END IF;

  -- Read draft_list_size from league config; default 30
  SELECT COALESCE((config->>'draft_list_size')::int, 30)
  INTO v_list_size
  FROM leagues WHERE id = p_league_id;

  INSERT INTO draft_allocations (league_id, user_id, unresolved_slots, allocated_players, phase)
  VALUES (p_league_id, v_caller, v_list_size, '{}', 'group');
END;
$$;


ALTER FUNCTION "public"."create_late_joiner_allocation"("p_league_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_league"("p_name" "text", "p_format" "text", "p_user_id" "uuid") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
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


ALTER FUNCTION "public"."create_league"("p_name" "text", "p_format" "text", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_league"("p_name" "text", "p_format" "text", "p_user_id" "uuid", "p_tournament_id" "text", "p_h2h_enabled" boolean DEFAULT false) RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
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
$$;


ALTER FUNCTION "public"."create_league"("p_name" "text", "p_format" "text", "p_user_id" "uuid", "p_tournament_id" "text", "p_h2h_enabled" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_league"("p_name" "text", "p_format" "text", "p_user_id" "uuid", "p_tournament_id" "text", "p_h2h_enabled" boolean DEFAULT false, "p_circle_id" "uuid" DEFAULT NULL::"uuid") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
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
$$;


ALTER FUNCTION "public"."create_league"("p_name" "text", "p_format" "text", "p_user_id" "uuid", "p_tournament_id" "text", "p_h2h_enabled" boolean, "p_circle_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_p2p_challenge"("p_league_id" "uuid", "p_opponent_id" "uuid", "p_matchday_id" "text", "p_stake_coins" integer, "p_message" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_challenger_id uuid := auth.uid();
  v_challenge_id  uuid;
  v_min_stake     int  := 10;
  v_max_stake     int  := 500;
  v_enabled       boolean := true;
  v_daily_limit   int  := 5;
  v_today_count   int  := 0;
  v_cfg           p2p_config;
BEGIN
  IF v_challenger_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  -- Load league p2p config (use defaults if no row)
  SELECT * INTO v_cfg FROM p2p_config WHERE league_id = p_league_id;
  IF FOUND THEN
    v_min_stake   := v_cfg.min_stake;
    v_max_stake   := v_cfg.max_stake;
    v_daily_limit := v_cfg.daily_challenge_limit;
    v_enabled     := v_cfg.challenges_enabled;
  END IF;

  IF NOT v_enabled THEN
    RAISE EXCEPTION 'CHALLENGES_DISABLED';
  END IF;

  IF p_stake_coins < v_min_stake THEN
    RAISE EXCEPTION 'STAKE_TOO_LOW (min=%)', v_min_stake;
  END IF;

  IF p_stake_coins > v_max_stake THEN
    RAISE EXCEPTION 'STAKE_TOO_HIGH (max=%)', v_max_stake;
  END IF;

  -- Daily challenge limit (challenges created today by this user in this league)
  SELECT COUNT(*) INTO v_today_count
  FROM p2p_challenges
  WHERE challenger_id = v_challenger_id
    AND league_id     = p_league_id
    AND created_at    > now() - interval '24 hours';

  IF v_today_count >= v_daily_limit THEN
    RAISE EXCEPTION 'DAILY_LIMIT_REACHED (limit=%)', v_daily_limit;
  END IF;

  -- Both parties must be league members
  IF NOT EXISTS (
    SELECT 1 FROM league_members
    WHERE league_id = p_league_id AND user_id = v_challenger_id
  ) THEN
    RAISE EXCEPTION 'NOT_LEAGUE_MEMBER';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM league_members
    WHERE league_id = p_league_id AND user_id = p_opponent_id
  ) THEN
    RAISE EXCEPTION 'OPPONENT_NOT_MEMBER';
  END IF;

  -- No duplicate pending/accepted challenge between same pair in same matchday
  IF EXISTS (
    SELECT 1 FROM p2p_challenges
    WHERE league_id = p_league_id
      AND matchday_id = p_matchday_id
      AND status IN ('pending', 'accepted')
      AND (
        (challenger_id = v_challenger_id AND opponent_id = p_opponent_id)
        OR (challenger_id = p_opponent_id AND opponent_id = v_challenger_id)
      )
  ) THEN
    RAISE EXCEPTION 'DUPLICATE_CHALLENGE';
  END IF;

  -- Deduct challenger stake to escrow
  PERFORM debit_coins_to_escrow(
    v_challenger_id,
    p_stake_coins,
    NULL,
    jsonb_build_object('reason', 'challenge_stake', 'matchday_id', p_matchday_id)
  );

  INSERT INTO p2p_challenges (
    league_id, challenger_id, opponent_id, matchday_id,
    stake_coins, message, status
  ) VALUES (
    p_league_id, v_challenger_id, p_opponent_id, p_matchday_id,
    p_stake_coins, p_message, 'pending'
  )
  RETURNING id INTO v_challenge_id;

  -- Back-fill challenge_id on the stake transaction
  UPDATE coin_transactions
  SET challenge_id = v_challenge_id
  WHERE user_id    = v_challenger_id
    AND type       = 'stake'
    AND challenge_id IS NULL
    AND created_at > now() - interval '5 seconds';

  RETURN jsonb_build_object('challenge_id', v_challenge_id);
END;
$$;


ALTER FUNCTION "public"."create_p2p_challenge"("p_league_id" "uuid", "p_opponent_id" "uuid", "p_matchday_id" "text", "p_stake_coins" integer, "p_message" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_paddock"("p_name" "text", "p_circle_id" "uuid" DEFAULT NULL::"uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_paddock_id uuid;
  v_sport_id   uuid;
BEGIN
  SELECT id INTO v_sport_id FROM sports WHERE slug = 'f1';
  IF v_sport_id IS NULL THEN RAISE EXCEPTION 'F1_SPORT_NOT_FOUND'; END IF;

  INSERT INTO paddocks (name, created_by, sport_id, circle_id)
    VALUES (p_name, auth.uid(), v_sport_id, p_circle_id)
    RETURNING id INTO v_paddock_id;

  INSERT INTO paddock_members (paddock_id, user_id, role)
    VALUES (v_paddock_id, auth.uid(), 'owner');

  IF p_circle_id IS NOT NULL THEN
    INSERT INTO circle_paddocks (circle_id, paddock_id)
      VALUES (p_circle_id, v_paddock_id)
      ON CONFLICT DO NOTHING;
  END IF;

  RETURN v_paddock_id;
END;
$$;


ALTER FUNCTION "public"."create_paddock"("p_name" "text", "p_circle_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_player_box"("p_name" "text", "p_season_year" integer, "p_circle_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_box_id uuid;
  v_invite text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;

  INSERT INTO player_boxes (name, season_year, created_by, circle_id)
  VALUES (p_name, p_season_year, auth.uid(), p_circle_id)
  RETURNING id, invite_code INTO v_box_id, v_invite;

  INSERT INTO player_box_members (player_box_id, user_id)
  VALUES (v_box_id, auth.uid());

  IF p_circle_id IS NOT NULL THEN
    INSERT INTO circle_player_boxes (circle_id, player_box_id)
    VALUES (p_circle_id, v_box_id)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN jsonb_build_object('player_box_id', v_box_id, 'invite_code', v_invite);
END;
$$;


ALTER FUNCTION "public"."create_player_box"("p_name" "text", "p_season_year" integer, "p_circle_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."credit_coins"("p_user_id" "uuid", "p_amount" integer, "p_type" "text" DEFAULT 'admin'::"text", "p_challenge_id" "uuid" DEFAULT NULL::"uuid", "p_meta" "jsonb" DEFAULT '{}'::"jsonb", "p_currency" character DEFAULT 'FRC'::"bpchar", "p_reference_id" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  IF p_amount <= 0 THEN RAISE EXCEPTION 'AMOUNT_MUST_BE_POSITIVE'; END IF;
  IF p_type NOT IN ('purchase','win','refund','admin') THEN
    RAISE EXCEPTION 'INVALID_CREDIT_TYPE';
  END IF;

  INSERT INTO coin_wallets (user_id, balance)
  VALUES (p_user_id, p_amount)
  ON CONFLICT (user_id) DO UPDATE
    SET balance    = coin_wallets.balance + p_amount,
        updated_at = now();

  INSERT INTO coin_transactions
    (user_id, type, amount, challenge_id, meta, currency, reference_id)
  VALUES
    (p_user_id, p_type, p_amount, p_challenge_id, p_meta, p_currency, p_reference_id);
END;
$$;


ALTER FUNCTION "public"."credit_coins"("p_user_id" "uuid", "p_amount" integer, "p_type" "text", "p_challenge_id" "uuid", "p_meta" "jsonb", "p_currency" character, "p_reference_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."debit_coins_to_escrow"("p_user_id" "uuid", "p_amount" integer, "p_challenge_id" "uuid" DEFAULT NULL::"uuid", "p_meta" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_balance     int;
  v_daily_staked int;
BEGIN
  IF p_amount <= 0 THEN RAISE EXCEPTION 'AMOUNT_MUST_BE_POSITIVE'; END IF;

  -- Lock row to prevent concurrent double-spend
  SELECT balance INTO v_balance
  FROM coin_wallets WHERE user_id = p_user_id FOR UPDATE;

  IF NOT FOUND     THEN RAISE EXCEPTION 'WALLET_NOT_FOUND'; END IF;
  IF v_balance < p_amount THEN RAISE EXCEPTION 'INSUFFICIENT_BALANCE'; END IF;

  -- Daily spend cap: 1,000 coins per 24-hour rolling window
  SELECT COALESCE(SUM(amount), 0) INTO v_daily_staked
  FROM coin_transactions
  WHERE user_id = p_user_id
    AND type = 'stake'
    AND created_at > now() - interval '24 hours';

  IF v_daily_staked + p_amount > 1000 THEN
    RAISE EXCEPTION 'DAILY_STAKE_CAP_EXCEEDED';
  END IF;

  UPDATE coin_wallets
  SET balance    = balance - p_amount,
      escrow     = escrow  + p_amount,
      updated_at = now()
  WHERE user_id = p_user_id;

  INSERT INTO coin_transactions (user_id, type, amount, challenge_id, meta)
  VALUES (p_user_id, 'stake', p_amount, p_challenge_id, p_meta);
END;
$$;


ALTER FUNCTION "public"."debit_coins_to_escrow"("p_user_id" "uuid", "p_amount" integer, "p_challenge_id" "uuid", "p_meta" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."decline_p2p_challenge"("p_challenge_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_ch      p2p_challenges;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;

  SELECT * INTO v_ch FROM p2p_challenges WHERE id = p_challenge_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CHALLENGE_NOT_FOUND'; END IF;
  IF v_ch.opponent_id <> v_user_id THEN RAISE EXCEPTION 'NOT_OPPONENT'; END IF;
  IF v_ch.status <> 'pending' THEN RAISE EXCEPTION 'CHALLENGE_NOT_PENDING'; END IF;

  -- Refund challenger's stake from escrow
  PERFORM release_escrow(
    v_ch.challenger_id,
    v_ch.stake_coins,
    p_challenge_id,
    jsonb_build_object('reason', 'challenge_declined')
  );
  -- Log refund transaction
  PERFORM credit_coins(
    v_ch.challenger_id,
    v_ch.stake_coins,
    'refund',
    p_challenge_id,
    jsonb_build_object('reason', 'challenge_declined')
  );

  UPDATE p2p_challenges
  SET status = 'declined', updated_at = now()
  WHERE id = p_challenge_id;

  RETURN jsonb_build_object('status', 'declined');
END;
$$;


ALTER FUNCTION "public"."decline_p2p_challenge"("p_challenge_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_chat_message"("p_message_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  UPDATE chat_messages
  SET is_deleted = true, edited_at = now()
  WHERE id = p_message_id AND user_id = auth.uid();

  RETURN FOUND;
END;
$$;


ALTER FUNCTION "public"."delete_chat_message"("p_message_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_user_data"("p_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
BEGIN
  -- Auth check: must be the user themselves or an admin
  IF auth.uid() IS NOT NULL
     AND auth.uid() <> p_user_id
     AND NOT EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_admin = true)
  THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  -- ── 1. Ephemeral / notification rows (no integrity concern) ──────────────

  DELETE FROM league_notifications       WHERE user_id = p_user_id;
  DELETE FROM league_chat_read_status    WHERE user_id = p_user_id;

  -- Clubhouse notifications (v2 only — table may not exist on main branch yet)
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'clubhouse_notifications') THEN
    EXECUTE 'DELETE FROM clubhouse_notifications WHERE user_id = $1' USING p_user_id;
  END IF;

  -- Client error logs referencing this user
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'client_errors') THEN
    EXECUTE 'DELETE FROM client_errors WHERE user_id = $1' USING p_user_id;
  END IF;

  -- ── 2. User-generated content ────────────────────────────────────────────

  -- Football chat
  DELETE FROM chat_messages              WHERE user_id = p_user_id;

  -- Frontpage interactions
  DELETE FROM frontpage_reactions        WHERE user_id = p_user_id;
  DELETE FROM frontpage_comments         WHERE user_id = p_user_id;

  -- Clubhouse/DM (v2 only)
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'clubhouse_messages') THEN
    EXECUTE 'DELETE FROM clubhouse_messages WHERE user_id = $1' USING p_user_id;
  END IF;
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'direct_messages') THEN
    EXECUTE 'DELETE FROM direct_messages WHERE from_user_id = $1 OR to_user_id = $1' USING p_user_id;
  END IF;

  -- Draft wish list and allocations
  DELETE FROM draft_submissions          WHERE user_id = p_user_id;
  DELETE FROM knockout_keep_submissions  WHERE user_id = p_user_id;

  -- Betting submissions
  DELETE FROM bet_submissions            WHERE user_id = p_user_id;

  -- Trade proposals (proposer side — acceptances already completed and may have gazette entries)
  -- Delete only pending proposals; accepted/declined are historical record
  DELETE FROM trade_proposals
  WHERE status = 'pending'
    AND (
      proposer_squad_id IN (SELECT id FROM squads WHERE user_id = p_user_id)
      OR target_squad_id IN (SELECT id FROM squads WHERE user_id = p_user_id)
    );

  -- Player availability flags
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'player_availability_flags') THEN
    EXECUTE 'DELETE FROM player_availability_flags WHERE user_id = $1' USING p_user_id;
  END IF;

  -- Draft/knockout submissions
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'top_scorer_predictions') THEN
    EXECUTE 'DELETE FROM top_scorer_predictions WHERE user_id = $1' USING p_user_id;
  END IF;
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'projection_snapshots') THEN
    EXECUTE 'DELETE FROM projection_snapshots WHERE user_id = $1' USING p_user_id;
  END IF;

  -- Audit log — remove user linkage (non-fatal if user_id is NOT NULL constrained,
  -- which it isn't — column is nullable per migration 183)
  UPDATE squad_events SET user_id = NULL WHERE user_id = p_user_id;

  -- ── 3. Sport-specific (v2 only) ──────────────────────────────────────────

  -- Tennis
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tennis_rosters') THEN
    EXECUTE 'DELETE FROM tennis_rosters WHERE user_id = $1' USING p_user_id;
  END IF;
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tennis_qf_captains') THEN
    EXECUTE 'DELETE FROM tennis_qf_captains WHERE user_id = $1' USING p_user_id;
  END IF;
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tennis_atp_finals_picks') THEN
    EXECUTE 'DELETE FROM tennis_atp_finals_picks WHERE user_id = $1' USING p_user_id;
  END IF;
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tennis_ace_cards') THEN
    EXECUTE 'DELETE FROM tennis_ace_cards WHERE user_id = $1' USING p_user_id;
  END IF;
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tennis_tournament_scores') THEN
    EXECUTE 'DELETE FROM tennis_tournament_scores WHERE user_id = $1' USING p_user_id;
  END IF;

  -- F1
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'f1_bets_race') THEN
    EXECUTE 'DELETE FROM f1_bets_race WHERE user_id = $1' USING p_user_id;
  END IF;
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'f1_bets_year') THEN
    EXECUTE 'DELETE FROM f1_bets_year WHERE user_id = $1' USING p_user_id;
  END IF;
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'f1_scores') THEN
    EXECUTE 'DELETE FROM f1_scores WHERE user_id = $1' USING p_user_id;
  END IF;

  -- P2P challenges (v2 only) — delete pending; settled are ledger history
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'p2p_challenges') THEN
    EXECUTE '
      DELETE FROM p2p_challenges
      WHERE status NOT IN (''settled'', ''cancelled'')
        AND (challenger_id = $1 OR opponent_id = $1)
    ' USING p_user_id;
    -- Anonymise settled challenges (null the user's side, keep the record)
    EXECUTE '
      UPDATE p2p_challenges
      SET challenger_id = NULL
      WHERE challenger_id = $1 AND status IN (''settled'', ''cancelled'')
    ' USING p_user_id;
    EXECUTE '
      UPDATE p2p_challenges
      SET opponent_id = NULL
      WHERE opponent_id = $1 AND status IN (''settled'', ''cancelled'')
    ' USING p_user_id;
  END IF;

  -- ── 4. Financial ledger ──────────────────────────────────────────────────

  -- coin_wallets has ON DELETE CASCADE → coin_transactions; delete wallet deletes both
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'coin_wallets') THEN
    EXECUTE 'DELETE FROM coin_wallets WHERE user_id = $1' USING p_user_id;
  END IF;

  -- Daily chips (no integrity concern)
  DELETE FROM daily_jokers WHERE user_id = p_user_id;
  DELETE FROM chips_used    WHERE user_id = p_user_id;

  -- ── 5. Game history — anonymise, preserve structure ──────────────────────

  -- squad_matchday_snapshots — no direct user_id; tied via squad FK — leave alone
  -- fantasy_points — tied via squad FK; squad user_id is nulled below — no action needed
  -- matchday_recaps — has user_id, but ON DELETE CASCADE means removing league_members
  --   (step 6) will cascade-delete these. No explicit action required.
  -- transfers log
  UPDATE transfers SET user_id = NULL WHERE user_id = p_user_id;
  -- draft_allocations
  UPDATE draft_allocations SET user_id = NULL WHERE user_id = p_user_id;
  -- h2h_schedule (v2) — null the user's slot, preserve schedule structure
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'h2h_schedule') THEN
    EXECUTE '
      UPDATE h2h_schedule
      SET home_user_id = NULL
      WHERE home_user_id = $1
    ' USING p_user_id;
    EXECUTE '
      UPDATE h2h_schedule
      SET away_user_id = NULL
      WHERE away_user_id = $1
    ' USING p_user_id;
    EXECUTE '
      UPDATE h2h_schedule
      SET bye_user_id = NULL
      WHERE bye_user_id = $1
    ' USING p_user_id;
  END IF;
  -- h2h_records (legacy table from 00_schema) — null out user refs
  UPDATE h2h_records
  SET
    user_a_id = CASE WHEN user_a_id = p_user_id THEN NULL ELSE user_a_id END,
    user_b_id = CASE WHEN user_b_id = p_user_id THEN NULL ELSE user_b_id END,
    winner_id = CASE WHEN winner_id = p_user_id THEN NULL ELSE winner_id END
  WHERE user_a_id = p_user_id OR user_b_id = p_user_id;
  -- Trophy ledger (v2) — null user_id, preserve trophy counts for circle history
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'trophy_ledger') THEN
    EXECUTE 'UPDATE trophy_ledger SET user_id = NULL WHERE user_id = $1' USING p_user_id;
  END IF;

  -- Null user_id on squads — preserves league standings history via fantasy_points
  -- The squad row remains so fantasy_points.squad_id FK is intact
  UPDATE squads SET user_id = NULL WHERE user_id = p_user_id;

  -- ── 6. Membership rows ───────────────────────────────────────────────────

  -- league_members ON DELETE CASCADE from users, but we also want to ensure
  -- any matchday_recaps (ON DELETE CASCADE on user_id FK) are removed.
  DELETE FROM league_members WHERE user_id = p_user_id;

  -- Circle / paddock / player-box membership (v2 only)
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'circle_members') THEN
    EXECUTE 'DELETE FROM circle_members WHERE user_id = $1' USING p_user_id;
  END IF;
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'paddock_members') THEN
    EXECUTE 'DELETE FROM paddock_members WHERE user_id = $1' USING p_user_id;
  END IF;
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'player_box_members') THEN
    EXECUTE 'DELETE FROM player_box_members WHERE user_id = $1' USING p_user_id;
  END IF;

  -- ── 7. Wipe PII on users row ─────────────────────────────────────────────

  UPDATE users
  SET
    username   = '[deleted-' || left(p_user_id::text, 8) || ']',
    avatar_url = NULL
  WHERE id = p_user_id;

END;
$_$;


ALTER FUNCTION "public"."delete_user_data"("p_user_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."delete_user_data"("p_user_id" "uuid") IS 'GDPR right-to-erasure. Deletes/anonymises all rows tied to p_user_id. Callable by the user for their own id, or by any admin. Squads are retained with user_id=NULL so fantasy_points history is preserved. See docs/platform_revision/due_diligence/DATA_CLASSIFICATION.md.';



CREATE OR REPLACE FUNCTION "public"."derive_fixture_round_number"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $_$
BEGIN
  IF NEW.round_number IS NULL
     AND NEW.matchday_id ~ '^[0-9]+-r[0-9]+$' THEN
    NEW.round_number := (substring(NEW.matchday_id FROM '-r([0-9]+)$'))::int;
  END IF;
  RETURN NEW;
END;
$_$;


ALTER FUNCTION "public"."derive_fixture_round_number"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."edit_chat_message"("p_message_id" "uuid", "p_new_text" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  UPDATE chat_messages
  SET message = p_new_text, edited_at = now(), edited_by = auth.uid()
  WHERE id = p_message_id AND user_id = auth.uid() AND NOT is_deleted;

  RETURN FOUND;
END;
$$;


ALTER FUNCTION "public"."edit_chat_message"("p_message_id" "uuid", "p_new_text" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."eliminate_cup_club"("p_league_id" "uuid", "p_club_id" "text") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  UPDATE cup_active_clubs
  SET    eliminated_at = NOW()
  WHERE  league_id = p_league_id
  AND    club_id   = p_club_id
  AND    eliminated_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'club_not_found'
      USING DETAIL = format('Club %s is not active in league %s.', p_club_id, p_league_id);
  END IF;
END;
$$;


ALTER FUNCTION "public"."eliminate_cup_club"("p_league_id" "uuid", "p_club_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_position_limit"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  pos_caps  JSONB := '{"GK":2,"DEF":5,"MID":5,"FWD":3}'::jsonb;
  in_pos    TEXT;
  out_pos   TEXT;
  cur_squad TEXT[];
  pos_count INT;
  cap       INT;
BEGIN
  -- Get player_in position, scoped to this transfer's tournament
  SELECT UPPER(TRIM(position)) INTO in_pos
  FROM   players
  WHERE  id            = NEW.player_in
    AND  tournament_id = NEW.tournament_id;

  -- Normalise FW → FWD
  IF in_pos = 'FW' THEN in_pos := 'FWD'; END IF;

  -- Get current squad for this user in this league
  SELECT allocated_players INTO cur_squad
  FROM   draft_allocations
  WHERE  league_id = NEW.league_id AND user_id = NEW.user_id;

  IF cur_squad IS NULL THEN RETURN NEW; END IF;

  -- Count existing players of the same position, excluding the player going out,
  -- filtered by tournament_id to avoid cross-competition conflicts
  SELECT COUNT(*) INTO pos_count
  FROM   unnest(cur_squad) pid
  JOIN   players p ON p.id = pid AND p.tournament_id = NEW.tournament_id
  WHERE  UPPER(TRIM(p.position)) IN (in_pos, REPLACE(in_pos,'FWD','FW'))
    AND  pid <> NEW.player_out;

  cap := (pos_caps ->> in_pos)::int;

  IF cap IS NOT NULL AND pos_count >= cap THEN
    RAISE EXCEPTION 'position_limit_reached'
      USING DETAIL = format('Position %s is already at maximum (%s).', in_pos, cap);
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."enforce_position_limit"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_transfer_window"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  win transfer_windows;
BEGIN
  -- Tournament leagues use matchday_deadlines, not transfer_windows — skip.
  IF EXISTS (
    SELECT 1 FROM leagues WHERE id = NEW.league_id AND tournament_id IS NOT NULL
  ) THEN
    RETURN NEW;
  END IF;

  -- Lock the window row to prevent concurrent decrement races (migration 45).
  SELECT * INTO win
  FROM   transfer_windows
  WHERE  league_id = NEW.league_id
    AND  opens_at  <= NOW()
    AND  closes_at  > NOW()
  ORDER  BY opens_at DESC
  LIMIT  1
  FOR UPDATE;

  IF win IS NULL THEN
    RAISE EXCEPTION 'transfer_window_closed'
      USING DETAIL = 'No transfer window is currently open for this league.';
  END IF;

  IF win.transfers_remaining IS NOT NULL THEN
    IF win.transfers_remaining <= 0 THEN
      RAISE EXCEPTION 'transfer_limit_reached'
        USING DETAIL = 'You have used all transfers for this window.';
    END IF;
    UPDATE transfer_windows
    SET    transfers_remaining = transfers_remaining - 1
    WHERE  id = win.id;
  END IF;

  IF NEW.round_number IS NULL THEN
    NEW.round_number := win.round_number;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."enforce_transfer_window"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."execute_transfer_atomic"("p_squad_id" "uuid", "p_action" "text", "p_player_id" "uuid", "p_price" numeric) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_squad      squads;
  v_new_players uuid[];
  v_new_budget  numeric;
BEGIN
  -- Acquire row lock; blocks any concurrent transfer on the same squad.
  SELECT * INTO v_squad FROM squads WHERE id = p_squad_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Squad not found');
  END IF;

  IF p_action = 'buy' THEN
    -- Re-validate inside the lock (guard against double-spend).
    IF v_squad.players @> ARRAY[p_player_id] THEN
      RETURN jsonb_build_object('ok', false, 'code', 'ALREADY_OWNED',
                                'error', 'You already own this player');
    END IF;
    IF v_squad.budget_remaining < p_price THEN
      RETURN jsonb_build_object('ok', false, 'code', 'INSUFFICIENT_BUDGET',
                                'error', 'Insufficient budget');
    END IF;
    v_new_players := array_append(v_squad.players, p_player_id);
    v_new_budget  := round((v_squad.budget_remaining - p_price)::numeric, 1);

  ELSIF p_action = 'sell' THEN
    IF NOT (v_squad.players @> ARRAY[p_player_id]) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Player not in your squad');
    END IF;
    v_new_players := array_remove(v_squad.players, p_player_id);
    v_new_budget  := round((v_squad.budget_remaining + p_price)::numeric, 1);

  ELSE
    RETURN jsonb_build_object('ok', false, 'error', 'Unknown action');
  END IF;

  UPDATE squads
    SET players          = v_new_players,
        budget_remaining = v_new_budget
  WHERE id = p_squad_id;

  RETURN jsonb_build_object(
    'ok',              true,
    'players',         to_jsonb(v_new_players),
    'budget_remaining', v_new_budget
  );
END;
$$;


ALTER FUNCTION "public"."execute_transfer_atomic"("p_squad_id" "uuid", "p_action" "text", "p_player_id" "uuid", "p_price" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."execute_transfer_atomic"("p_squad_id" "uuid", "p_action" "text", "p_player_id" "uuid", "p_price" numeric, "p_pos_limit" integer DEFAULT 99, "p_squad_max" integer DEFAULT 15) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_squad        squads;
  v_new_players  uuid[];
  v_new_budget   numeric;
  v_player_pos   text;
  v_pos_count    int;
BEGIN
  -- Acquire row lock; blocks any concurrent transfer on the same squad.
  SELECT * INTO v_squad FROM squads WHERE id = p_squad_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Squad not found');
  END IF;

  IF p_action = 'buy' THEN
    -- Re-validate inside the lock (guard against all concurrent-buy races).
    IF v_squad.players @> ARRAY[p_player_id] THEN
      RETURN jsonb_build_object('ok', false, 'code', 'ALREADY_OWNED',
                                'error', 'You already own this player');
    END IF;
    IF array_length(v_squad.players, 1) >= p_squad_max THEN
      RETURN jsonb_build_object('ok', false, 'code', 'SQUAD_FULL',
                                'error', 'Squad is full — sell a player first');
    END IF;
    IF v_squad.budget_remaining < p_price THEN
      RETURN jsonb_build_object('ok', false, 'code', 'INSUFFICIENT_BUDGET',
                                'error', 'Insufficient budget');
    END IF;
    -- Position cap check (only when a meaningful cap is passed).
    IF p_pos_limit < 99 THEN
      SELECT p.position INTO v_player_pos FROM players p WHERE p.id = p_player_id;
      SELECT COUNT(*) INTO v_pos_count
        FROM players p
        WHERE p.id = ANY(v_squad.players) AND p.position = v_player_pos;
      IF v_pos_count >= p_pos_limit THEN
        RETURN jsonb_build_object('ok', false, 'code', 'POSITION_LIMIT',
          'error', 'Maximum ' || v_player_pos || ' players reached (' || p_pos_limit || ')');
      END IF;
    END IF;
    v_new_players := array_append(v_squad.players, p_player_id);
    v_new_budget  := round((v_squad.budget_remaining - p_price)::numeric, 1);

  ELSIF p_action = 'sell' THEN
    IF NOT (v_squad.players @> ARRAY[p_player_id]) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Player not in your squad');
    END IF;
    v_new_players := array_remove(v_squad.players, p_player_id);
    v_new_budget  := round((v_squad.budget_remaining + p_price)::numeric, 1);

  ELSE
    RETURN jsonb_build_object('ok', false, 'error', 'Unknown action');
  END IF;

  UPDATE squads
    SET players          = v_new_players,
        budget_remaining = v_new_budget
  WHERE id = p_squad_id;

  RETURN jsonb_build_object(
    'ok',              true,
    'players',         to_jsonb(v_new_players),
    'budget_remaining', v_new_budget
  );
END;
$$;


ALTER FUNCTION "public"."execute_transfer_atomic"("p_squad_id" "uuid", "p_action" "text", "p_player_id" "uuid", "p_price" numeric, "p_pos_limit" integer, "p_squad_max" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."execute_transfer_atomic"("p_squad_id" "uuid", "p_action" "text", "p_player_id" "uuid", "p_price" numeric, "p_pos_limit" integer DEFAULT 99, "p_squad_max" integer DEFAULT 15, "p_club_max" integer DEFAULT 99) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_squad         squads;
  v_new_players   uuid[];
  v_new_budget    numeric;
  v_player_pos    text;
  v_player_team   text;   -- forza_team_id of the incoming player
  v_pos_count     int;
  v_club_count    int;
BEGIN
  -- Acquire row lock; blocks any concurrent transfer on the same squad.
  SELECT * INTO v_squad FROM squads WHERE id = p_squad_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Squad not found');
  END IF;

  IF p_action = 'buy' THEN
    -- ── Already owned ──────────────────────────────────────────────────────────
    IF v_squad.players @> ARRAY[p_player_id] THEN
      RETURN jsonb_build_object('ok', false, 'code', 'ALREADY_OWNED',
                                'error', 'You already own this player');
    END IF;

    -- ── Squad size ─────────────────────────────────────────────────────────────
    IF array_length(v_squad.players, 1) >= p_squad_max THEN
      RETURN jsonb_build_object('ok', false, 'code', 'SQUAD_FULL',
                                'error', 'Squad is full — sell a player first');
    END IF;

    -- ── Budget ─────────────────────────────────────────────────────────────────
    IF v_squad.budget_remaining < p_price THEN
      RETURN jsonb_build_object('ok', false, 'code', 'INSUFFICIENT_BUDGET',
                                'error', 'Insufficient budget');
    END IF;

    -- ── Position cap (inside lock to block concurrent same-position buys) ──────
    IF p_pos_limit < 99 THEN
      SELECT p.position INTO v_player_pos FROM players p WHERE p.id = p_player_id;
      SELECT COUNT(*) INTO v_pos_count
        FROM players p
        WHERE p.id = ANY(v_squad.players) AND p.position = v_player_pos;
      IF v_pos_count >= p_pos_limit THEN
        RETURN jsonb_build_object('ok', false, 'code', 'POSITION_LIMIT',
          'error', 'Maximum ' || v_player_pos || ' players reached (' || p_pos_limit || ')');
      END IF;
    END IF;

    -- ── Club cap (inside lock to block concurrent same-club buys) ──────────────
    IF p_club_max < 99 THEN
      SELECT p.forza_team_id INTO v_player_team FROM players p WHERE p.id = p_player_id;
      IF v_player_team IS NOT NULL THEN
        SELECT COUNT(*) INTO v_club_count
          FROM players p
          WHERE p.id = ANY(v_squad.players)
            AND p.forza_team_id = v_player_team;
        IF v_club_count >= p_club_max THEN
          RETURN jsonb_build_object('ok', false, 'code', 'CLUB_LIMIT',
            'error', 'Maximum ' || p_club_max || ' players from the same club');
        END IF;
      END IF;
    END IF;

    v_new_players := array_append(v_squad.players, p_player_id);
    v_new_budget  := round((v_squad.budget_remaining - p_price)::numeric, 1);

  ELSIF p_action = 'sell' THEN
    IF NOT (v_squad.players @> ARRAY[p_player_id]) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Player not in your squad');
    END IF;
    v_new_players := array_remove(v_squad.players, p_player_id);
    v_new_budget  := round((v_squad.budget_remaining + p_price)::numeric, 1);

  ELSE
    RETURN jsonb_build_object('ok', false, 'error', 'Unknown action');
  END IF;

  UPDATE squads
    SET players          = v_new_players,
        budget_remaining = v_new_budget
  WHERE id = p_squad_id;

  RETURN jsonb_build_object(
    'ok',              true,
    'players',         to_jsonb(v_new_players),
    'budget_remaining', v_new_budget
  );
END;
$$;


ALTER FUNCTION "public"."execute_transfer_atomic"("p_squad_id" "uuid", "p_action" "text", "p_player_id" "uuid", "p_price" numeric, "p_pos_limit" integer, "p_squad_max" integer, "p_club_max" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."execute_transfer_atomic"("p_squad_id" "uuid", "p_action" "text", "p_player_id" "text", "p_price" numeric, "p_pos_limit" integer DEFAULT 99, "p_squad_max" integer DEFAULT 99, "p_club_max" integer DEFAULT 99, "p_league_id" "uuid" DEFAULT NULL::"uuid", "p_matchday_id" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $_$
DECLARE
  v_squad               squads;
  v_new_players         text[];
  v_new_budget          numeric;
  v_new_round_transfers jsonb;
  v_new_penalty_transfers jsonb;
  v_player_pos          text;
  v_player_team         text;
  v_pos_count           int;
  v_club_count          int;
  v_transfers_per_round int  := 3;
  v_wildcard_round      int  := NULL;
  v_used_transfers      int  := 0;
  v_used_penalty        int  := 0;
  v_matchday_round      int;
  v_enforce_buy_limit   bool := false;
  v_penalty_buy         bool := false;
  v_server_price        numeric;
  v_flip_latch          bool := false;
BEGIN
  SELECT * INTO v_squad FROM squads WHERE id = p_squad_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Squad not found');
  END IF;

  IF auth.uid() IS NOT NULL AND v_squad.user_id IS DISTINCT FROM auth.uid() THEN
    RETURN jsonb_build_object('ok', false, 'code', 'UNAUTHORIZED', 'error', 'Not your squad');
  END IF;

  SELECT price INTO v_server_price FROM players WHERE id = p_player_id;
  IF v_server_price IS NULL AND p_action = 'buy' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'PLAYER_NOT_FOUND', 'error', 'Player not found');
  END IF;
  IF v_server_price IS NULL THEN v_server_price := 0; END IF;

  IF p_action = 'buy'
     AND p_league_id IS NOT NULL
     AND p_matchday_id IS NOT NULL THEN

    v_matchday_round := (regexp_match(p_matchday_id, '-r(\d+)$'))[1]::int;

    IF v_matchday_round IS NOT NULL AND v_squad.initial_build_complete THEN

      SELECT (config_value #>> '{}')::int INTO v_transfers_per_round
        FROM league_config
       WHERE league_id = p_league_id AND config_key = 'transfers_per_round';
      IF v_transfers_per_round IS NULL THEN v_transfers_per_round := 3; END IF;

      SELECT (config_value #>> '{}')::int INTO v_wildcard_round
        FROM league_config
       WHERE league_id = p_league_id AND config_key = 'transfer_wildcard_round';

      IF v_wildcard_round IS NULL OR v_matchday_round IS DISTINCT FROM v_wildcard_round THEN
        v_used_transfers := COALESCE(
          (v_squad.round_transfers ->> p_matchday_id)::int, 0
        );

        IF v_used_transfers < v_transfers_per_round THEN
          v_enforce_buy_limit := true;
        ELSE
          v_penalty_buy := true;
          v_used_penalty := COALESCE(
            (v_squad.penalty_transfers ->> p_matchday_id)::int, 0
          );
        END IF;
      END IF;
    END IF;
  END IF;

  IF p_action = 'buy' THEN
    IF v_squad.players @> ARRAY[p_player_id] THEN
      RETURN jsonb_build_object('ok', false, 'code', 'ALREADY_OWNED',
                                'error', 'You already own this player');
    END IF;

    IF array_length(v_squad.players, 1) >= p_squad_max THEN
      RETURN jsonb_build_object('ok', false, 'code', 'SQUAD_FULL',
                                'error', 'Squad is full — sell a player first');
    END IF;

    IF v_squad.budget_remaining < v_server_price THEN
      RETURN jsonb_build_object('ok', false, 'code', 'INSUFFICIENT_BUDGET',
                                'error', 'Insufficient budget');
    END IF;

    IF p_pos_limit < 99 THEN
      SELECT p.position INTO v_player_pos FROM players p WHERE p.id = p_player_id;
      SELECT COUNT(*) INTO v_pos_count
        FROM players p
        WHERE p.id = ANY(v_squad.players) AND p.position = v_player_pos;
      IF v_pos_count >= p_pos_limit THEN
        RETURN jsonb_build_object('ok', false, 'code', 'POSITION_LIMIT',
          'error', 'Maximum ' || v_player_pos || ' players reached (' || p_pos_limit || ')');
      END IF;
    END IF;

    IF p_club_max < 99 THEN
      SELECT p.forza_team_id INTO v_player_team FROM players p WHERE p.id = p_player_id;
      IF v_player_team IS NOT NULL THEN
        SELECT COUNT(*) INTO v_club_count
          FROM players p
          WHERE p.id = ANY(v_squad.players)
            AND p.forza_team_id = v_player_team;
        IF v_club_count >= p_club_max THEN
          RETURN jsonb_build_object('ok', false, 'code', 'CLUB_LIMIT',
            'error', 'Maximum ' || p_club_max || ' players from the same club');
        END IF;
      END IF;
    END IF;

    v_new_players := array_append(v_squad.players, p_player_id);
    v_new_budget  := round((v_squad.budget_remaining - v_server_price)::numeric, 1);

    IF NOT v_squad.initial_build_complete AND array_length(v_new_players, 1) >= 15 THEN
      v_flip_latch := true;
    END IF;

  ELSIF p_action = 'sell' THEN
    IF NOT (v_squad.players @> ARRAY[p_player_id]) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Player not in your squad');
    END IF;
    v_new_players := array_remove(v_squad.players, p_player_id);
    v_new_budget  := round((v_squad.budget_remaining + v_server_price)::numeric, 1);

  ELSE
    RETURN jsonb_build_object('ok', false, 'error', 'Unknown action');
  END IF;

  IF v_enforce_buy_limit THEN
    v_new_round_transfers := jsonb_set(
      COALESCE(v_squad.round_transfers, '{}'::jsonb),
      ARRAY[p_matchday_id],
      to_jsonb(v_used_transfers + 1)
    );
  ELSE
    v_new_round_transfers := COALESCE(v_squad.round_transfers, '{}'::jsonb);
  END IF;

  IF v_penalty_buy THEN
    v_new_penalty_transfers := jsonb_set(
      COALESCE(v_squad.penalty_transfers, '{}'::jsonb),
      ARRAY[p_matchday_id],
      to_jsonb(v_used_penalty + 1)
    );
  ELSE
    v_new_penalty_transfers := COALESCE(v_squad.penalty_transfers, '{}'::jsonb);
  END IF;

  UPDATE squads
    SET players                = v_new_players,
        budget_remaining       = v_new_budget,
        round_transfers        = v_new_round_transfers,
        penalty_transfers      = v_new_penalty_transfers,
        initial_build_complete = initial_build_complete OR v_flip_latch,
        matchday_id            = COALESCE(p_matchday_id, matchday_id)
  WHERE id = p_squad_id;

  IF p_action = 'buy' THEN
    PERFORM _log_squad_event('transfer_buy', p_league_id, v_squad.user_id, p_squad_id, p_matchday_id,
      p_player_id, NULL,
      jsonb_build_object('price', v_server_price, 'penalty_buy', v_penalty_buy));
  ELSE
    PERFORM _log_squad_event('transfer_sell', p_league_id, v_squad.user_id, p_squad_id, p_matchday_id,
      NULL, p_player_id,
      jsonb_build_object('price', v_server_price));
  END IF;

  RETURN jsonb_build_object(
    'ok',                  true,
    'players',             to_jsonb(v_new_players),
    'budget_remaining',    v_new_budget,
    'penalty_buy',         v_penalty_buy,
    'free_transfers_used', CASE WHEN v_enforce_buy_limit THEN v_used_transfers + 1 ELSE v_used_transfers END,
    'penalty_count',       CASE WHEN v_penalty_buy THEN v_used_penalty + 1 ELSE v_used_penalty END
  );
END;
$_$;


ALTER FUNCTION "public"."execute_transfer_atomic"("p_squad_id" "uuid", "p_action" "text", "p_player_id" "text", "p_price" numeric, "p_pos_limit" integer, "p_squad_max" integer, "p_club_max" integer, "p_league_id" "uuid", "p_matchday_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."expire_stale_challenges"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_ch    p2p_challenges;
  v_count int := 0;
BEGIN
  FOR v_ch IN
    SELECT * FROM p2p_challenges
    WHERE status = 'pending' AND expires_at < now()
    FOR UPDATE SKIP LOCKED
  LOOP
    -- Refund challenger stake
    BEGIN
      PERFORM release_escrow(
        v_ch.challenger_id,
        v_ch.stake_coins,
        v_ch.id,
        jsonb_build_object('reason', 'challenge_expired')
      );
      PERFORM credit_coins(
        v_ch.challenger_id,
        v_ch.stake_coins,
        'refund',
        v_ch.id,
        jsonb_build_object('reason', 'challenge_expired')
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'expire_stale_challenges: refund failed for challenge %: %', v_ch.id, SQLERRM;
    END;

    UPDATE p2p_challenges
    SET status = 'expired', updated_at = now()
    WHERE id = v_ch.id;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;


ALTER FUNCTION "public"."expire_stale_challenges"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."export_user_data"("p_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
DECLARE
  v_result jsonb := '{}'::jsonb;
  v_tmp    jsonb;
BEGIN
  -- Auth check: must be the user themselves or an admin (same pattern as delete_user_data)
  IF auth.uid() IS NOT NULL
     AND auth.uid() <> p_user_id
     AND NOT EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_admin = true)
  THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  -- ── Identity ───────────────────────────────────────────────────────────
  SELECT to_jsonb(u) INTO v_tmp FROM users u WHERE u.id = p_user_id;
  v_result := jsonb_set(v_result, '{identity}', COALESCE(v_tmp, 'null'::jsonb));

  -- ── Gameplay ───────────────────────────────────────────────────────────
  SELECT jsonb_agg(to_jsonb(t)) INTO v_tmp FROM squads t WHERE t.user_id = p_user_id;
  v_result := jsonb_set(v_result, '{squads}', COALESCE(v_tmp, '[]'::jsonb));

  SELECT jsonb_agg(to_jsonb(t)) INTO v_tmp FROM league_members t WHERE t.user_id = p_user_id;
  v_result := jsonb_set(v_result, '{league_members}', COALESCE(v_tmp, '[]'::jsonb));

  SELECT jsonb_agg(to_jsonb(t)) INTO v_tmp FROM transfers t WHERE t.user_id = p_user_id;
  v_result := jsonb_set(v_result, '{transfers}', COALESCE(v_tmp, '[]'::jsonb));

  SELECT jsonb_agg(to_jsonb(t)) INTO v_tmp FROM draft_allocations t WHERE t.user_id = p_user_id;
  v_result := jsonb_set(v_result, '{draft_allocations}', COALESCE(v_tmp, '[]'::jsonb));

  SELECT jsonb_agg(to_jsonb(t)) INTO v_tmp FROM squad_events t WHERE t.user_id = p_user_id;
  v_result := jsonb_set(v_result, '{squad_events}', COALESCE(v_tmp, '[]'::jsonb));

  -- ── Communications ─────────────────────────────────────────────────────
  SELECT jsonb_agg(to_jsonb(t)) INTO v_tmp FROM chat_messages t WHERE t.user_id = p_user_id;
  v_result := jsonb_set(v_result, '{chat_messages}', COALESCE(v_tmp, '[]'::jsonb));

  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'clubhouse_messages') THEN
    EXECUTE 'SELECT jsonb_agg(to_jsonb(t)) FROM clubhouse_messages t WHERE t.user_id = $1'
      INTO v_tmp USING p_user_id;
    v_result := jsonb_set(v_result, '{clubhouse_messages}', COALESCE(v_tmp, '[]'::jsonb));
  END IF;

  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'direct_messages') THEN
    EXECUTE 'SELECT jsonb_agg(to_jsonb(t)) FROM direct_messages t WHERE t.from_user_id = $1 OR t.to_user_id = $1'
      INTO v_tmp USING p_user_id;
    v_result := jsonb_set(v_result, '{direct_messages}', COALESCE(v_tmp, '[]'::jsonb));
  END IF;

  -- ── Social interactions ────────────────────────────────────────────────
  SELECT jsonb_agg(to_jsonb(t)) INTO v_tmp FROM frontpage_reactions t WHERE t.user_id = p_user_id;
  v_result := jsonb_set(v_result, '{frontpage_reactions}', COALESCE(v_tmp, '[]'::jsonb));

  SELECT jsonb_agg(to_jsonb(t)) INTO v_tmp FROM frontpage_comments t WHERE t.user_id = p_user_id;
  v_result := jsonb_set(v_result, '{frontpage_comments}', COALESCE(v_tmp, '[]'::jsonb));

  -- ── Predictions / submissions ──────────────────────────────────────────
  SELECT jsonb_agg(to_jsonb(t)) INTO v_tmp FROM draft_submissions t WHERE t.user_id = p_user_id;
  v_result := jsonb_set(v_result, '{draft_submissions}', COALESCE(v_tmp, '[]'::jsonb));

  SELECT jsonb_agg(to_jsonb(t)) INTO v_tmp FROM knockout_keep_submissions t WHERE t.user_id = p_user_id;
  v_result := jsonb_set(v_result, '{knockout_keep_submissions}', COALESCE(v_tmp, '[]'::jsonb));

  SELECT jsonb_agg(to_jsonb(t)) INTO v_tmp FROM bet_submissions t WHERE t.user_id = p_user_id;
  v_result := jsonb_set(v_result, '{bet_submissions}', COALESCE(v_tmp, '[]'::jsonb));

  -- Trade proposals — full history (not just pending) via the user's own squads
  SELECT jsonb_agg(to_jsonb(tp)) INTO v_tmp
  FROM trade_proposals tp
  WHERE tp.proposer_squad_id IN (SELECT id FROM squads WHERE user_id = p_user_id)
     OR tp.target_squad_id   IN (SELECT id FROM squads WHERE user_id = p_user_id);
  v_result := jsonb_set(v_result, '{trade_proposals}', COALESCE(v_tmp, '[]'::jsonb));

  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'player_availability_flags') THEN
    EXECUTE 'SELECT jsonb_agg(to_jsonb(t)) FROM player_availability_flags t WHERE t.user_id = $1'
      INTO v_tmp USING p_user_id;
    v_result := jsonb_set(v_result, '{player_availability_flags}', COALESCE(v_tmp, '[]'::jsonb));
  END IF;

  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'top_scorer_predictions') THEN
    EXECUTE 'SELECT jsonb_agg(to_jsonb(t)) FROM top_scorer_predictions t WHERE t.user_id = $1'
      INTO v_tmp USING p_user_id;
    v_result := jsonb_set(v_result, '{top_scorer_predictions}', COALESCE(v_tmp, '[]'::jsonb));
  END IF;

  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'projection_snapshots') THEN
    EXECUTE 'SELECT jsonb_agg(to_jsonb(t)) FROM projection_snapshots t WHERE t.user_id = $1'
      INTO v_tmp USING p_user_id;
    v_result := jsonb_set(v_result, '{projection_snapshots}', COALESCE(v_tmp, '[]'::jsonb));
  END IF;

  -- ── Sport-specific (v2 only) ───────────────────────────────────────────
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tennis_rosters') THEN
    EXECUTE 'SELECT jsonb_agg(to_jsonb(t)) FROM tennis_rosters t WHERE t.user_id = $1'
      INTO v_tmp USING p_user_id;
    v_result := jsonb_set(v_result, '{tennis_rosters}', COALESCE(v_tmp, '[]'::jsonb));
  END IF;

  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tennis_qf_captains') THEN
    EXECUTE 'SELECT jsonb_agg(to_jsonb(t)) FROM tennis_qf_captains t WHERE t.user_id = $1'
      INTO v_tmp USING p_user_id;
    v_result := jsonb_set(v_result, '{tennis_qf_captains}', COALESCE(v_tmp, '[]'::jsonb));
  END IF;

  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tennis_atp_finals_picks') THEN
    EXECUTE 'SELECT jsonb_agg(to_jsonb(t)) FROM tennis_atp_finals_picks t WHERE t.user_id = $1'
      INTO v_tmp USING p_user_id;
    v_result := jsonb_set(v_result, '{tennis_atp_finals_picks}', COALESCE(v_tmp, '[]'::jsonb));
  END IF;

  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tennis_ace_cards') THEN
    EXECUTE 'SELECT jsonb_agg(to_jsonb(t)) FROM tennis_ace_cards t WHERE t.user_id = $1'
      INTO v_tmp USING p_user_id;
    v_result := jsonb_set(v_result, '{tennis_ace_cards}', COALESCE(v_tmp, '[]'::jsonb));
  END IF;

  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tennis_tournament_scores') THEN
    EXECUTE 'SELECT jsonb_agg(to_jsonb(t)) FROM tennis_tournament_scores t WHERE t.user_id = $1'
      INTO v_tmp USING p_user_id;
    v_result := jsonb_set(v_result, '{tennis_tournament_scores}', COALESCE(v_tmp, '[]'::jsonb));
  END IF;

  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'f1_bets_race') THEN
    EXECUTE 'SELECT jsonb_agg(to_jsonb(t)) FROM f1_bets_race t WHERE t.user_id = $1'
      INTO v_tmp USING p_user_id;
    v_result := jsonb_set(v_result, '{f1_bets_race}', COALESCE(v_tmp, '[]'::jsonb));
  END IF;

  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'f1_bets_year') THEN
    EXECUTE 'SELECT jsonb_agg(to_jsonb(t)) FROM f1_bets_year t WHERE t.user_id = $1'
      INTO v_tmp USING p_user_id;
    v_result := jsonb_set(v_result, '{f1_bets_year}', COALESCE(v_tmp, '[]'::jsonb));
  END IF;

  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'f1_scores') THEN
    EXECUTE 'SELECT jsonb_agg(to_jsonb(t)) FROM f1_scores t WHERE t.user_id = $1'
      INTO v_tmp USING p_user_id;
    v_result := jsonb_set(v_result, '{f1_scores}', COALESCE(v_tmp, '[]'::jsonb));
  END IF;

  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'p2p_challenges') THEN
    EXECUTE 'SELECT jsonb_agg(to_jsonb(t)) FROM p2p_challenges t WHERE t.challenger_id = $1 OR t.opponent_id = $1'
      INTO v_tmp USING p_user_id;
    v_result := jsonb_set(v_result, '{p2p_challenges}', COALESCE(v_tmp, '[]'::jsonb));
  END IF;

  -- ── Financial ledger ───────────────────────────────────────────────────
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'coin_wallets') THEN
    EXECUTE 'SELECT to_jsonb(t) FROM coin_wallets t WHERE t.user_id = $1'
      INTO v_tmp USING p_user_id;
    v_result := jsonb_set(v_result, '{coin_wallet}', COALESCE(v_tmp, 'null'::jsonb));
  END IF;

  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'coin_transactions') THEN
    EXECUTE 'SELECT jsonb_agg(to_jsonb(t)) FROM coin_transactions t WHERE t.user_id = $1'
      INTO v_tmp USING p_user_id;
    v_result := jsonb_set(v_result, '{coin_transactions}', COALESCE(v_tmp, '[]'::jsonb));
  END IF;

  SELECT jsonb_agg(to_jsonb(t)) INTO v_tmp FROM daily_jokers t WHERE t.user_id = p_user_id;
  v_result := jsonb_set(v_result, '{daily_jokers}', COALESCE(v_tmp, '[]'::jsonb));

  SELECT jsonb_agg(to_jsonb(t)) INTO v_tmp FROM chips_used t WHERE t.user_id = p_user_id;
  v_result := jsonb_set(v_result, '{chips_used}', COALESCE(v_tmp, '[]'::jsonb));

  -- ── Competitive records ────────────────────────────────────────────────
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'h2h_schedule') THEN
    EXECUTE 'SELECT jsonb_agg(to_jsonb(t)) FROM h2h_schedule t WHERE t.home_user_id = $1 OR t.away_user_id = $1 OR t.bye_user_id = $1'
      INTO v_tmp USING p_user_id;
    v_result := jsonb_set(v_result, '{h2h_schedule}', COALESCE(v_tmp, '[]'::jsonb));
  END IF;

  SELECT jsonb_agg(to_jsonb(t)) INTO v_tmp
  FROM h2h_records t
  WHERE t.user_a_id = p_user_id OR t.user_b_id = p_user_id OR t.winner_id = p_user_id;
  v_result := jsonb_set(v_result, '{h2h_records}', COALESCE(v_tmp, '[]'::jsonb));

  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'trophy_ledger') THEN
    EXECUTE 'SELECT jsonb_agg(to_jsonb(t)) FROM trophy_ledger t WHERE t.user_id = $1'
      INTO v_tmp USING p_user_id;
    v_result := jsonb_set(v_result, '{trophy_ledger}', COALESCE(v_tmp, '[]'::jsonb));
  END IF;

  -- ── Notifications ──────────────────────────────────────────────────────
  SELECT jsonb_agg(to_jsonb(t)) INTO v_tmp FROM league_notifications t WHERE t.user_id = p_user_id;
  v_result := jsonb_set(v_result, '{league_notifications}', COALESCE(v_tmp, '[]'::jsonb));

  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'clubhouse_notifications') THEN
    EXECUTE 'SELECT jsonb_agg(to_jsonb(t)) FROM clubhouse_notifications t WHERE t.user_id = $1'
      INTO v_tmp USING p_user_id;
    v_result := jsonb_set(v_result, '{clubhouse_notifications}', COALESCE(v_tmp, '[]'::jsonb));
  END IF;

  -- ── Membership ─────────────────────────────────────────────────────────
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'circle_members') THEN
    EXECUTE 'SELECT jsonb_agg(to_jsonb(t)) FROM circle_members t WHERE t.user_id = $1'
      INTO v_tmp USING p_user_id;
    v_result := jsonb_set(v_result, '{circle_members}', COALESCE(v_tmp, '[]'::jsonb));
  END IF;

  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'paddock_members') THEN
    EXECUTE 'SELECT jsonb_agg(to_jsonb(t)) FROM paddock_members t WHERE t.user_id = $1'
      INTO v_tmp USING p_user_id;
    v_result := jsonb_set(v_result, '{paddock_members}', COALESCE(v_tmp, '[]'::jsonb));
  END IF;

  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'player_box_members') THEN
    EXECUTE 'SELECT jsonb_agg(to_jsonb(t)) FROM player_box_members t WHERE t.user_id = $1'
      INTO v_tmp USING p_user_id;
    v_result := jsonb_set(v_result, '{player_box_members}', COALESCE(v_tmp, '[]'::jsonb));
  END IF;

  v_result := jsonb_set(v_result, '{exported_at}', to_jsonb(now()));

  RETURN v_result;
END;
$_$;


ALTER FUNCTION "public"."export_user_data"("p_user_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."export_user_data"("p_user_id" "uuid") IS 'GDPR right-to-portability (Art. 20). Read-only — returns one jsonb object with every row tied to p_user_id, keyed by table/category name. Callable by the user for their own id, or by any admin. Mirrors the table set audited in migration 219 (delete_user_data) plus the coin_transactions ledger and full trade_proposals history. See docs/platform_revision/due_diligence/DATA_CLASSIFICATION.md.';



CREATE OR REPLACE FUNCTION "public"."generate_h2h_schedule"("p_league_id" "uuid", "p_start_matchday_id" "text") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_caller        uuid := auth.uid();
  v_is_comm       bool;
  v_members       uuid[];
  v_n             int;
  v_n_eff         int;
  v_half          int;
  v_cycle_rounds  int;
  v_matchday_ids  text[];
  v_n_matchdays   int;
  v_tournament_id text;
  v_md_idx        int;
  v_r             int;
  v_i             int;
  v_home          uuid;
  v_away          uuid;
  v_is_bye        bool;
  v_bye_uid       uuid;
  v_home_idx      int;
  v_away_idx      int;
  v_start_round   int;
BEGIN
  IF v_caller IS NOT NULL THEN
    SELECT (created_by = v_caller) INTO v_is_comm FROM leagues WHERE id = p_league_id;
    IF NOT v_is_comm THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  END IF;

  -- Sort by user_id for deterministic ordering (league_members has no created_at)
  SELECT array_agg(user_id ORDER BY user_id)
  INTO v_members
  FROM league_members
  WHERE league_id = p_league_id;

  v_n := coalesce(array_length(v_members, 1), 0);
  IF v_n < 2 THEN RAISE EXCEPTION 'LEAGUE_TOO_SMALL'; END IF;

  v_n_eff := v_n + (v_n % 2);
  v_half := v_n_eff / 2;
  v_cycle_rounds := v_n_eff - 1;

  IF v_n % 2 = 1 THEN v_members := array_append(v_members, NULL::uuid); END IF;

  SELECT tournament_id INTO v_tournament_id FROM leagues WHERE id = p_league_id;
  v_start_round := (regexp_replace(p_start_matchday_id, '^.*-r', ''))::int;

  SELECT array_agg(matchday_id ORDER BY round_num)
  INTO v_matchday_ids
  FROM (
    SELECT DISTINCT matchday_id,
           (regexp_replace(matchday_id, '^.*-r', ''))::int AS round_num
    FROM fixtures
    WHERE tournament_id = v_tournament_id
      AND matchday_id IS NOT NULL
      AND (regexp_replace(matchday_id, '^.*-r', ''))::int >= v_start_round
  ) t;

  v_n_matchdays := coalesce(array_length(v_matchday_ids, 1), 0);
  IF v_n_matchdays = 0 THEN RAISE EXCEPTION 'NO_MATCHDAYS'; END IF;

  DELETE FROM h2h_schedule
  WHERE league_id = p_league_id
    AND resolved_at IS NULL
    AND (regexp_replace(matchday_id, '^.*-r', ''))::int >= v_start_round;

  v_md_idx := 1;

  <<outer_loop>>
  WHILE v_md_idx <= v_n_matchdays LOOP
    FOR v_r IN 0..v_cycle_rounds-1 LOOP
      EXIT outer_loop WHEN v_md_idx > v_n_matchdays;

      v_home := v_members[v_n_eff];
      v_away := v_members[(v_r % (v_n_eff - 1)) + 1];

      IF v_home IS NULL THEN v_is_bye := true; v_bye_uid := v_away;
      ELSIF v_away IS NULL THEN v_is_bye := true; v_bye_uid := v_home;
      ELSE v_is_bye := false; v_bye_uid := NULL; END IF;

      INSERT INTO h2h_schedule (league_id, matchday_id, home_user_id, away_user_id, is_bye, bye_user_id)
      VALUES (p_league_id, v_matchday_ids[v_md_idx],
        CASE WHEN NOT v_is_bye THEN v_home ELSE NULL END,
        CASE WHEN NOT v_is_bye THEN v_away ELSE NULL END,
        v_is_bye, v_bye_uid);

      FOR v_i IN 1..v_half-1 LOOP
        v_home_idx := ((v_r + v_i) % (v_n_eff - 1)) + 1;
        v_away_idx := (((v_r - v_i) % (v_n_eff - 1)) + (v_n_eff - 1)) % (v_n_eff - 1) + 1;
        v_home := v_members[v_home_idx];
        v_away := v_members[v_away_idx];

        IF v_home IS NULL THEN v_is_bye := true; v_bye_uid := v_away;
        ELSIF v_away IS NULL THEN v_is_bye := true; v_bye_uid := v_home;
        ELSE v_is_bye := false; v_bye_uid := NULL; END IF;

        INSERT INTO h2h_schedule (league_id, matchday_id, home_user_id, away_user_id, is_bye, bye_user_id)
        VALUES (p_league_id, v_matchday_ids[v_md_idx],
          CASE WHEN NOT v_is_bye THEN v_home ELSE NULL END,
          CASE WHEN NOT v_is_bye THEN v_away ELSE NULL END,
          v_is_bye, v_bye_uid);
      END LOOP;

      v_md_idx := v_md_idx + 1;
    END LOOP;
  END LOOP;

  RETURN json_build_object(
    'ok', true,
    'matchdays_scheduled', v_md_idx - 1,
    'total_matchdays', v_n_matchdays,
    'managers', v_n,
    'cycle_length', v_cycle_rounds
  );
END;
$$;


ALTER FUNCTION "public"."generate_h2h_schedule"("p_league_id" "uuid", "p_start_matchday_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_active_matchday_id"("p_tournament_id" "text") RETURNS "text"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_active_round int;
BEGIN
  SELECT MIN(f.round_number) INTO v_active_round
  FROM fixtures f
  WHERE f.tournament_id = p_tournament_id
    AND f.status IN ('scheduled', 'live')
    AND f.round_number IS NOT NULL;

  IF v_active_round IS NULL THEN
    SELECT MAX(f.round_number) INTO v_active_round
    FROM fixtures f
    WHERE f.tournament_id = p_tournament_id
      AND f.round_number IS NOT NULL;
  END IF;

  IF v_active_round IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN p_tournament_id || '-r' || v_active_round::text;
END;
$$;


ALTER FUNCTION "public"."get_active_matchday_id"("p_tournament_id" "text") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."transfer_windows" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "league_id" "uuid",
    "round_number" integer,
    "opens_at" timestamp with time zone NOT NULL,
    "closes_at" timestamp with time zone NOT NULL,
    "window_type" "public"."transfer_window_type" DEFAULT 'standard'::"public"."transfer_window_type" NOT NULL,
    "transfers_remaining" integer,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."transfer_windows" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_active_transfer_window"("p_league_id" "uuid", "p_at" timestamp with time zone DEFAULT "now"()) RETURNS "public"."transfer_windows"
    LANGUAGE "sql" STABLE
    AS $$
  SELECT *
  FROM   transfer_windows
  WHERE  league_id = p_league_id
  AND    opens_at  <= p_at
  AND    closes_at  > p_at
  ORDER  BY opens_at DESC
  LIMIT  1;
$$;


ALTER FUNCTION "public"."get_active_transfer_window"("p_league_id" "uuid", "p_at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_circle_feed"("p_circle_id" "uuid", "p_limit" integer DEFAULT 50) RETURNS TABLE("id" "uuid", "league_id" "uuid", "league_name" "text", "entry_type" "public"."gazette_entry_type", "headline" "text", "bullets" "jsonb", "full_data" "jsonb", "created_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM circle_members
    WHERE circle_id = p_circle_id AND user_id = auth.uid()
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    ge.id,
    ge.league_id,
    l.name AS league_name,
    ge.entry_type,
    ge.headline,
    ge.bullets,
    ge.full_data,
    ge.created_at
  FROM gazette_entries ge
  JOIN circle_leagues cl ON cl.league_id = ge.league_id
  JOIN leagues l         ON l.id = ge.league_id
  WHERE cl.circle_id = p_circle_id
  ORDER BY ge.created_at DESC
  LIMIT GREATEST(1, LEAST(p_limit, 200));
END;
$$;


ALTER FUNCTION "public"."get_circle_feed"("p_circle_id" "uuid", "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_circle_meta_standings"("p_circle_id" "uuid") RETURNS TABLE("user_id" "uuid", "username" "text", "trophy_count" bigint, "gold_count" bigint, "silver_count" bigint, "bronze_count" bigint, "rank" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- Caller must be a member of this circle
  IF NOT EXISTS (
    SELECT 1 FROM circle_members
    WHERE circle_id = p_circle_id AND user_id = auth.uid()
  ) THEN
    RETURN;
  END IF;

  -- v1 formula: count trophies per user, break ties by gold → silver → bronze
  RETURN QUERY
  SELECT
    cm.user_id,
    u.username,
    COUNT(tl.id)                                              AS trophy_count,
    COUNT(tl.id) FILTER (WHERE tl.tier = 'gold')             AS gold_count,
    COUNT(tl.id) FILTER (WHERE tl.tier = 'silver')           AS silver_count,
    COUNT(tl.id) FILTER (WHERE tl.tier = 'bronze')           AS bronze_count,
    RANK() OVER (
      ORDER BY
        COUNT(tl.id)                                          DESC,
        COUNT(tl.id) FILTER (WHERE tl.tier = 'gold')         DESC,
        COUNT(tl.id) FILTER (WHERE tl.tier = 'silver')       DESC,
        COUNT(tl.id) FILTER (WHERE tl.tier = 'bronze')       DESC
    )                                                         AS rank
  FROM circle_members cm
  JOIN users u ON u.id = cm.user_id
  LEFT JOIN trophy_ledger tl
    ON  tl.circle_id = p_circle_id
    AND tl.user_id   = cm.user_id
  WHERE cm.circle_id = p_circle_id
  GROUP BY cm.user_id, u.username
  ORDER BY rank, u.username;
END;
$$;


ALTER FUNCTION "public"."get_circle_meta_standings"("p_circle_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_club_cap"("p_league_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" STABLE
    AS $$
DECLARE
  v_active_count   INT;
  v_default_cap    INT := 3;
  v_t1_threshold   INT := 8;
  v_t1_value       INT := 4;
  v_t2_threshold   INT := 4;
  v_t2_value       INT := 5;
  v_t3_threshold   INT := 2;
BEGIN
  -- Read config overrides; fall back to hardcoded defaults if keys are absent
  SELECT (config_value #>> '{}')::int INTO v_default_cap    FROM league_config WHERE league_id = p_league_id AND config_key = 'club_cap_default';
  SELECT (config_value #>> '{}')::int INTO v_t1_threshold   FROM league_config WHERE league_id = p_league_id AND config_key = 'club_cap_tier1_threshold';
  SELECT (config_value #>> '{}')::int INTO v_t1_value       FROM league_config WHERE league_id = p_league_id AND config_key = 'club_cap_tier1_value';
  SELECT (config_value #>> '{}')::int INTO v_t2_threshold   FROM league_config WHERE league_id = p_league_id AND config_key = 'club_cap_tier2_threshold';
  SELECT (config_value #>> '{}')::int INTO v_t2_value       FROM league_config WHERE league_id = p_league_id AND config_key = 'club_cap_tier2_value';
  SELECT (config_value #>> '{}')::int INTO v_t3_threshold   FROM league_config WHERE league_id = p_league_id AND config_key = 'club_cap_tier3_threshold';

  IF v_default_cap  IS NULL THEN v_default_cap  := 3; END IF;
  IF v_t1_threshold IS NULL THEN v_t1_threshold := 8; END IF;
  IF v_t1_value     IS NULL THEN v_t1_value     := 4; END IF;
  IF v_t2_threshold IS NULL THEN v_t2_threshold := 4; END IF;
  IF v_t2_value     IS NULL THEN v_t2_value     := 5; END IF;
  IF v_t3_threshold IS NULL THEN v_t3_threshold := 2; END IF;

  SELECT COUNT(*)
    INTO v_active_count
    FROM cup_active_clubs
   WHERE league_id = p_league_id
     AND eliminated_at IS NULL;

  IF v_active_count = 0 THEN
    RETURN v_default_cap;                          -- no cup data: safe default
  ELSIF v_active_count > v_t1_threshold THEN
    RETURN v_default_cap;                          -- early rounds
  ELSIF v_active_count > v_t2_threshold THEN
    RETURN v_t1_value;                             -- quarter-final stage
  ELSIF v_active_count > v_t3_threshold THEN
    RETURN v_t2_value;                             -- semi-final stage
  ELSE
    RETURN NULL;                                   -- final: no cap
  END IF;
END;
$$;


ALTER FUNCTION "public"."get_club_cap"("p_league_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_club_cap"("p_league_id" "uuid", "p_matchday_id" "text" DEFAULT NULL::"text") RETURNS integer
    LANGUAGE "plpgsql" STABLE
    AS $$
DECLARE
  v_tournament_id  TEXT;
  v_round_suffix   TEXT;
  v_cap            INT;
  v_active_count   INT;
  v_default_cap    INT := 3;
  v_t1_threshold   INT := 8;
  v_t1_value       INT := 4;
  v_t2_threshold   INT := 4;
  v_t2_value       INT := 5;
  v_t3_threshold   INT := 2;
BEGIN
  -- ── Path A: table-driven per-round cap ──────────────────────────────────────
  IF p_matchday_id IS NOT NULL THEN
    SELECT tournament_id INTO v_tournament_id
      FROM leagues WHERE id = p_league_id;

    -- matchday_id format: '{tournament_id}-{round_suffix}' e.g. '623-r4'
    v_round_suffix := split_part(p_matchday_id, '-', 2);

    SELECT cap INTO v_cap
      FROM club_cap_rules
     WHERE tournament_id = v_tournament_id
       AND round_suffix  = v_round_suffix;

    IF v_cap IS NOT NULL THEN
      RETURN v_cap;
    END IF;
  END IF;

  -- ── Path B: legacy cup-based logic (fallback) ───────────────────────────────
  SELECT (config_value #>> '{}')::int INTO v_default_cap    FROM league_config WHERE league_id = p_league_id AND config_key = 'club_cap_default';
  SELECT (config_value #>> '{}')::int INTO v_t1_threshold   FROM league_config WHERE league_id = p_league_id AND config_key = 'club_cap_tier1_threshold';
  SELECT (config_value #>> '{}')::int INTO v_t1_value       FROM league_config WHERE league_id = p_league_id AND config_key = 'club_cap_tier1_value';
  SELECT (config_value #>> '{}')::int INTO v_t2_threshold   FROM league_config WHERE league_id = p_league_id AND config_key = 'club_cap_tier2_threshold';
  SELECT (config_value #>> '{}')::int INTO v_t2_value       FROM league_config WHERE league_id = p_league_id AND config_key = 'club_cap_tier2_value';
  SELECT (config_value #>> '{}')::int INTO v_t3_threshold   FROM league_config WHERE league_id = p_league_id AND config_key = 'club_cap_tier3_threshold';

  IF v_default_cap  IS NULL THEN v_default_cap  := 3; END IF;
  IF v_t1_threshold IS NULL THEN v_t1_threshold := 8; END IF;
  IF v_t1_value     IS NULL THEN v_t1_value     := 4; END IF;
  IF v_t2_threshold IS NULL THEN v_t2_threshold := 4; END IF;
  IF v_t2_value     IS NULL THEN v_t2_value     := 5; END IF;
  IF v_t3_threshold IS NULL THEN v_t3_threshold := 2; END IF;

  SELECT COUNT(*) INTO v_active_count
    FROM cup_active_clubs
   WHERE league_id = p_league_id
     AND eliminated_at IS NULL;

  IF v_active_count = 0 THEN
    RETURN v_default_cap;
  ELSIF v_active_count > v_t1_threshold THEN
    RETURN v_default_cap;
  ELSIF v_active_count > v_t2_threshold THEN
    RETURN v_t1_value;
  ELSIF v_active_count > v_t3_threshold THEN
    RETURN v_t2_value;
  ELSE
    RETURN NULL;  -- final: no cap
  END IF;
END;
$$;


ALTER FUNCTION "public"."get_club_cap"("p_league_id" "uuid", "p_matchday_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_clubhouse_competitions"("p_circle_id" "uuid") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM circle_members
    WHERE circle_id = p_circle_id AND user_id = auth.uid()
  ) THEN
    RETURN json_build_object('error', 'NOT_MEMBER');
  END IF;

  RETURN json_build_object(
    'football', (
      SELECT COALESCE(json_agg(json_build_object(
        'id',     l.id,
        'name',   l.name,
        'format', l.format,
        'sport',  'football'
      ) ORDER BY l.name), '[]'::json)
      FROM circle_leagues cl
      JOIN leagues l ON l.id = cl.league_id
      WHERE cl.circle_id = p_circle_id
    ),
    'f1', (
      SELECT COALESCE(json_agg(json_build_object(
        'id',    p.id,
        'name',  p.name,
        'sport', 'f1'
      ) ORDER BY p.name), '[]'::json)
      FROM circle_paddocks cp
      JOIN paddocks p ON p.id = cp.paddock_id
      WHERE cp.circle_id = p_circle_id
    ),
    'tennis', (
      SELECT COALESCE(json_agg(json_build_object(
        'id',   pb.id,
        'name', pb.name,
        'sport','tennis'
      ) ORDER BY pb.name), '[]'::json)
      FROM circle_player_boxes cpb
      JOIN player_boxes pb ON pb.id = cpb.player_box_id
      WHERE cpb.circle_id = p_circle_id
    )
  );
END;
$$;


ALTER FUNCTION "public"."get_clubhouse_competitions"("p_circle_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_coin_economy_stats"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_circulating    bigint;
  v_in_escrow      bigint;
  v_available      bigint;
  v_purchase_vol   bigint;
  v_entry_fees     bigint;
  v_rake_burned    bigint;
  v_challenges_won int;
  v_challenges_tie int;
BEGIN
  SELECT
    COALESCE(SUM(balance + escrow), 0),
    COALESCE(SUM(escrow), 0),
    COALESCE(SUM(balance), 0)
  INTO v_circulating, v_in_escrow, v_available
  FROM coin_wallets;

  SELECT COALESCE(SUM(amount), 0) INTO v_purchase_vol
  FROM coin_transactions WHERE type = 'purchase';

  SELECT COALESCE(SUM(amount), 0) INTO v_entry_fees
  FROM coin_transactions WHERE type = 'entry_fee';

  -- Rake is the difference between total pot and prize awarded on resolved non-tie challenges
  SELECT COALESCE(SUM(FLOOR(stake_coins * 2 * 0.05)), 0) INTO v_rake_burned
  FROM p2p_challenges WHERE status = 'resolved' AND winner_id IS NOT NULL;

  SELECT COUNT(*) INTO v_challenges_won
  FROM p2p_challenges WHERE status = 'resolved' AND winner_id IS NOT NULL;

  SELECT COUNT(*) INTO v_challenges_tie
  FROM p2p_challenges WHERE status = 'resolved' AND winner_id IS NULL;

  RETURN jsonb_build_object(
    'circulating',      v_circulating,
    'in_escrow',        v_in_escrow,
    'available',        v_available,
    'purchase_volume',  v_purchase_vol,
    'entry_fees',       v_entry_fees,
    'rake_burned',      v_rake_burned,
    'challenges_won',   v_challenges_won,
    'challenges_tie',   v_challenges_tie,
    'challenges_total', v_challenges_won + v_challenges_tie
  );
END;
$$;


ALTER FUNCTION "public"."get_coin_economy_stats"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_cron_failure_streaks"("p_threshold" integer DEFAULT 3) RETURNS TABLE("jobname" "text", "consecutive_failures" integer, "last_run" timestamp with time zone, "last_message" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'cron'
    AS $$
  WITH ranked AS (
    SELECT
      d.jobid,
      d.status,
      d.start_time,
      d.return_message,
      ROW_NUMBER() OVER (PARTITION BY d.jobid ORDER BY d.start_time DESC) AS rn
    FROM cron.job_run_details d
  ),
  first_success AS (
    SELECT jobid, MIN(rn) AS first_ok_rn
    FROM ranked
    WHERE status <> 'failed'
    GROUP BY jobid
  ),
  run_counts AS (
    SELECT jobid, COUNT(*) AS total_runs
    FROM ranked
    GROUP BY jobid
  ),
  latest AS (
    SELECT DISTINCT ON (jobid) jobid, start_time AS last_run, return_message AS last_message
    FROM ranked
    WHERE rn = 1
  ),
  streaks AS (
    SELECT
      j.jobid,
      j.jobname,
      COALESCE(fs.first_ok_rn - 1, rc.total_runs, 0) AS consecutive_failures
    FROM cron.job j
    LEFT JOIN first_success fs ON fs.jobid = j.jobid
    LEFT JOIN run_counts rc    ON rc.jobid = j.jobid
    WHERE j.active = true
  )
  SELECT
    s.jobname,
    s.consecutive_failures::int,
    l.last_run,
    l.last_message
  FROM streaks s
  LEFT JOIN latest l ON l.jobid = s.jobid
  WHERE s.consecutive_failures >= p_threshold
  ORDER BY s.consecutive_failures DESC, s.jobname;
$$;


ALTER FUNCTION "public"."get_cron_failure_streaks"("p_threshold" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_cron_status"() RETURNS TABLE("jobname" "text", "schedule" "text", "active" boolean, "last_run" timestamp with time zone, "status" "text", "message" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'cron'
    AS $$
  SELECT
    j.jobname,
    j.schedule,
    j.active,
    d.start_time       AS last_run,
    d.status,
    d.return_message   AS message
  FROM cron.job j
  LEFT JOIN LATERAL (
    SELECT start_time, status, return_message
    FROM cron.job_run_details
    WHERE jobid = j.jobid
    ORDER BY start_time DESC
    LIMIT 1
  ) d ON true
  ORDER BY j.jobname;
$$;


ALTER FUNCTION "public"."get_cron_status"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."players" (
    "id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "position" "text" NOT NULL,
    "nationality" "text",
    "club" "text",
    "price" numeric(4,1),
    "photo_url" "text",
    "season_avg" numeric(5,2),
    "forza_player_id" "text",
    "forza_team_id" "text",
    "tournament_id" "text",
    "birthdate" "date",
    "height" integer,
    "is_active" boolean DEFAULT true NOT NULL
);


ALTER TABLE "public"."players" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_cup_available_players"("p_league_id" "uuid") RETURNS SETOF "public"."players"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    AS $$
DECLARE
  cup_rows        INT;
  v_tournament_id TEXT;
BEGIN
  -- Always resolve the league's tournament first (needed in both paths)
  SELECT tournament_id INTO v_tournament_id FROM leagues WHERE id = p_league_id;

  SELECT COUNT(*) INTO cup_rows
  FROM   cup_active_clubs
  WHERE  league_id = p_league_id;

  IF cup_rows = 0 THEN
    -- Non-cup league: return full tournament player pool
    IF v_tournament_id IS NOT NULL THEN
      RETURN QUERY
        SELECT * FROM players
        WHERE  tournament_id = v_tournament_id
        ORDER  BY price DESC;
    ELSE
      RETURN QUERY SELECT * FROM players ORDER BY price DESC;
    END IF;
    RETURN;
  END IF;

  -- Cup league: restrict to active clubs AND this tournament's players
  RETURN QUERY
    SELECT p.*
    FROM   players p
    JOIN   cup_active_clubs cac ON cac.club_id = p.club
    WHERE  cac.league_id     = p_league_id
    AND    cac.eliminated_at IS NULL
    AND    p.tournament_id   = v_tournament_id
    ORDER  BY p.price DESC;
END;
$$;


ALTER FUNCTION "public"."get_cup_available_players"("p_league_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_cup_pool_stats"("p_league_id" "uuid") RETURNS json
    LANGUAGE "plpgsql" STABLE
    AS $$
DECLARE
  total_players  INT;
  active_clubs   INT;
  total_clubs    INT;
BEGIN
  SELECT COUNT(*) INTO total_players
  FROM   get_cup_available_players(p_league_id);

  SELECT COUNT(*) FILTER (WHERE eliminated_at IS NULL),
         COUNT(*)
  INTO   active_clubs, total_clubs
  FROM   cup_active_clubs
  WHERE  league_id = p_league_id;

  RETURN json_build_object(
    'available_players', total_players,
    'active_clubs',      active_clubs,
    'total_clubs',       total_clubs
  );
END;
$$;


ALTER FUNCTION "public"."get_cup_pool_stats"("p_league_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_event_points"("p_tournament_id" "text", "p_position" "text", "p_event_type" "text") RETURNS integer
    LANGUAGE "plpgsql"
    AS $$
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
$$;


ALTER FUNCTION "public"."get_event_points"("p_tournament_id" "text", "p_position" "text", "p_event_type" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_h2h_standings"("p_league_id" "uuid") RETURNS TABLE("user_id" "uuid", "username" "text", "wins" integer, "draws" integer, "losses" integer, "total_h2h_pts" integer, "h2h_rank" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_caller   uuid := auth.uid();
  v_win_pts  int;
  v_draw_pts int;
  v_loss_pts int;
BEGIN
  -- Only league members (or service-role) may call this
  IF v_caller IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM league_members lm
    WHERE lm.league_id = p_league_id AND lm.user_id = v_caller
  ) THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  SELECT coalesce((config_value)::int, 5) INTO v_win_pts
  FROM league_config WHERE league_id = p_league_id AND config_key = 'h2h_win_pts';
  v_win_pts := coalesce(v_win_pts, 5);

  SELECT coalesce((config_value)::int, 2) INTO v_draw_pts
  FROM league_config WHERE league_id = p_league_id AND config_key = 'h2h_draw_pts';
  v_draw_pts := coalesce(v_draw_pts, 2);

  SELECT coalesce((config_value)::int, 0) INTO v_loss_pts
  FROM league_config WHERE league_id = p_league_id AND config_key = 'h2h_loss_pts';
  v_loss_pts := coalesce(v_loss_pts, 0);

  RETURN QUERY
  WITH all_rows AS (
    SELECT home_user_id AS uid, home_h2h_pts AS pts
    FROM h2h_schedule
    WHERE league_id = p_league_id AND resolved_at IS NOT NULL AND is_bye = false AND home_user_id IS NOT NULL
    UNION ALL
    SELECT away_user_id, away_h2h_pts
    FROM h2h_schedule
    WHERE league_id = p_league_id AND resolved_at IS NOT NULL AND is_bye = false AND away_user_id IS NOT NULL
    UNION ALL
    SELECT bye_user_id, home_h2h_pts
    FROM h2h_schedule
    WHERE league_id = p_league_id AND resolved_at IS NOT NULL AND is_bye = true AND bye_user_id IS NOT NULL
  ),
  agg AS (
    SELECT
      r.uid,
      COUNT(*) FILTER (WHERE r.pts = v_win_pts)::int AS wins,
      COUNT(*) FILTER (WHERE r.pts = v_draw_pts AND v_draw_pts <> v_win_pts)::int AS draws,
      COUNT(*) FILTER (WHERE r.pts = v_loss_pts AND v_loss_pts <> v_win_pts AND v_loss_pts <> v_draw_pts)::int AS losses,
      COALESCE(SUM(r.pts), 0)::int AS total
    FROM all_rows r
    GROUP BY r.uid
  )
  SELECT
    a.uid,
    u.username::text,
    a.wins,
    a.draws,
    a.losses,
    a.total AS total_h2h_pts,
    RANK() OVER (ORDER BY a.total DESC, a.wins DESC)::int AS h2h_rank
  FROM agg a
  JOIN users u ON u.id = a.uid
  ORDER BY h2h_rank, a.wins DESC;
END;
$$;


ALTER FUNCTION "public"."get_h2h_standings"("p_league_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_league_stats"("p_league_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_member_count INT;
  v_avg_points   NUMERIC;
BEGIN
  SELECT
    COUNT(*)::INT,
    ROUND(AVG(total_points)::NUMERIC, 0)
  INTO v_member_count, v_avg_points
  FROM league_members
  WHERE league_id = p_league_id;

  RETURN jsonb_build_object(
    'member_count', v_member_count,
    'avg_points',   COALESCE(v_avg_points, 0)
  );
END;
$$;


ALTER FUNCTION "public"."get_league_stats"("p_league_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_challenges"("p_league_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_result  jsonb;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'id',                   c.id,
      'league_id',            c.league_id,
      'challenger_id',        c.challenger_id,
      'challenger_username',  cu.username,
      'opponent_id',          c.opponent_id,
      'opponent_username',    ou.username,
      'bet_type',             c.bet_type,
      'matchday_id',          c.matchday_id,
      'stake_coins',          c.stake_coins,
      'message',              c.message,
      'status',               c.status,
      'winner_id',            c.winner_id,
      'challenger_pts',       c.challenger_pts,
      'opponent_pts',         c.opponent_pts,
      'expires_at',           c.expires_at,
      'resolved_at',          c.resolved_at,
      'created_at',           c.created_at,
      'updated_at',           c.updated_at
    )
    ORDER BY c.created_at DESC
  )
  INTO v_result
  FROM p2p_challenges c
  LEFT JOIN users cu ON cu.id = c.challenger_id
  LEFT JOIN users ou ON ou.id = c.opponent_id
  WHERE (c.challenger_id = v_user_id OR c.opponent_id = v_user_id)
    AND (p_league_id IS NULL OR c.league_id = p_league_id)
    AND (
      c.status IN ('pending', 'accepted')
      OR c.created_at > now() - interval '30 days'
    );

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;


ALTER FUNCTION "public"."get_my_challenges"("p_league_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_paddocks"() RETURNS TABLE("paddock_id" "uuid", "name" "text", "invite_code" "text", "role" "text", "member_count" bigint, "season" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.name,
    p.invite_code,
    pm.role,
    COUNT(*) OVER (PARTITION BY p.id) AS member_count,
    p.season
  FROM paddock_members pm
  JOIN paddocks p ON p.id = pm.paddock_id
  WHERE pm.user_id = auth.uid()
  ORDER BY pm.joined_at;
END;
$$;


ALTER FUNCTION "public"."get_my_paddocks"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_player_boxes"("p_season_year" integer DEFAULT NULL::integer) RETURNS TABLE("player_box_id" "uuid", "name" "text", "invite_code" "text", "member_count" bigint, "season_year" integer, "is_owner" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    pb.id,
    pb.name,
    pb.invite_code,
    COUNT(pbm2.user_id),
    pb.season_year,
    (pb.created_by = auth.uid())
  FROM player_boxes pb
  JOIN player_box_members pbm  ON pbm.player_box_id = pb.id AND pbm.user_id = auth.uid()
  LEFT JOIN player_box_members pbm2 ON pbm2.player_box_id = pb.id
  WHERE (p_season_year IS NULL OR pb.season_year = p_season_year)
  GROUP BY pb.id
  ORDER BY pb.created_at DESC;
END;
$$;


ALTER FUNCTION "public"."get_my_player_boxes"("p_season_year" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_wallet"() RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_wallet  coin_wallets;
  v_txns    json;
BEGIN
  SELECT * INTO v_wallet FROM coin_wallets WHERE user_id = auth.uid();

  IF NOT FOUND THEN
    RETURN json_build_object('balance', 0, 'escrow', 0, 'transactions', '[]'::json);
  END IF;

  SELECT json_agg(t ORDER BY t.created_at DESC) INTO v_txns
  FROM (
    SELECT type, amount, status, currency, reference_id, challenge_id, meta, created_at
    FROM coin_transactions
    WHERE user_id = auth.uid()
    ORDER BY created_at DESC
    LIMIT 50
  ) t;

  RETURN json_build_object(
    'balance',      v_wallet.balance,
    'escrow',       v_wallet.escrow,
    'transactions', COALESCE(v_txns, '[]'::json)
  );
END;
$$;


ALTER FUNCTION "public"."get_my_wallet"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_owner_linkable_leagues"("p_circle_id" "uuid") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RETURN json_build_object('error', 'UNAUTHENTICATED');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM circle_members
    WHERE circle_id = p_circle_id
      AND user_id   = v_user_id
      AND role      = 'owner'
  ) THEN
    RETURN json_build_object('error', 'NOT_OWNER');
  END IF;

  RETURN COALESCE(
    (
      SELECT json_agg(json_build_object(
        'id',     l.id,
        'name',   l.name,
        'format', l.format
      ) ORDER BY l.name)
      FROM leagues l
      JOIN league_members lm ON lm.league_id = l.id
      WHERE lm.user_id = v_user_id
        AND lm.role    = 'commissioner'
        AND NOT EXISTS (
          SELECT 1 FROM circle_leagues cl
          WHERE cl.circle_id = p_circle_id
            AND cl.league_id  = l.id
        )
    ),
    '[]'::json
  );
END;
$$;


ALTER FUNCTION "public"."get_owner_linkable_leagues"("p_circle_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_p2p_config"("p_league_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_cfg    p2p_config;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('error', 'UNAUTHORIZED');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM league_members
    WHERE league_id = p_league_id AND user_id = v_caller
  ) THEN
    RETURN jsonb_build_object('error', 'NOT_LEAGUE_MEMBER');
  END IF;

  SELECT * INTO v_cfg FROM p2p_config WHERE league_id = p_league_id;

  IF NOT FOUND THEN
    -- Return defaults if no row exists yet
    RETURN jsonb_build_object(
      'league_id',             p_league_id,
      'min_stake',             10,
      'max_stake',             500,
      'daily_challenge_limit', 5,
      'challenges_enabled',    true
    );
  END IF;

  RETURN jsonb_build_object(
    'league_id',             v_cfg.league_id,
    'min_stake',             v_cfg.min_stake,
    'max_stake',             v_cfg.max_stake,
    'daily_challenge_limit', v_cfg.daily_challenge_limit,
    'challenges_enabled',    v_cfg.challenges_enabled,
    'updated_at',            v_cfg.updated_at
  );
END;
$$;


ALTER FUNCTION "public"."get_p2p_config"("p_league_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_paddock_leaderboard"("p_paddock_id" "uuid") RETURNS TABLE("user_id" "uuid", "display_name" "text", "avatar_url" "text", "total_points" bigint, "race_points" bigint, "year_points" bigint, "races_scored" bigint, "rank" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    pm.user_id,
    u.username                              AS display_name,
    u.avatar_url,
    COALESCE(SUM(s.total_points), 0)        AS total_points,
    COALESCE(SUM(s.total_points) FILTER (WHERE s.score_type = 'race'), 0) AS race_points,
    COALESCE(SUM(s.total_points) FILTER (WHERE s.score_type = 'year'), 0) AS year_points,
    COUNT(s.id) FILTER (WHERE s.score_type = 'race')                       AS races_scored,
    RANK() OVER (ORDER BY COALESCE(SUM(s.total_points), 0) DESC)           AS rank
  FROM paddock_members pm
  JOIN public.users u ON u.id = pm.user_id
  LEFT JOIN f1_scores s ON s.user_id = pm.user_id AND s.season = 2026
  WHERE pm.paddock_id = p_paddock_id
  GROUP BY pm.user_id, u.username, u.avatar_url;
END;
$$;


ALTER FUNCTION "public"."get_paddock_leaderboard"("p_paddock_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_player_box_leaderboard"("p_player_box_id" "uuid", "p_season_year" integer DEFAULT 2026) RETURNS TABLE("user_id" "uuid", "username" "text", "total_points" integer, "tournaments_played" integer, "best_tournament_pts" integer, "worst_dropped" integer, "rank" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_completed_standard_count int;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM player_box_members WHERE player_box_id = p_player_box_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'NOT_A_MEMBER';
  END IF;

  -- Count completed standard tournaments this season
  SELECT COUNT(*) INTO v_completed_standard_count
  FROM tennis_tournaments
  WHERE season_year = p_season_year
    AND tournament_type IN ('grand_slam', 'masters_1000')
    AND status = 'completed';

  RETURN QUERY
  WITH box_members AS (
    SELECT pbm.user_id
    FROM player_box_members pbm
    WHERE pbm.player_box_id = p_player_box_id
  ),
  user_scores AS (
    SELECT
      bm.user_id,
      tt.tournament_type,
      tts.total_points,
      -- rank of score per user: 1 = highest (best), N = lowest (worst to drop)
      ROW_NUMBER() OVER (
        PARTITION BY bm.user_id
        ORDER BY tts.total_points ASC   -- ASC so rank 1 = worst score
      ) AS score_rank_asc
    FROM box_members bm
    JOIN tennis_tournament_scores tts ON tts.user_id = bm.user_id
    JOIN tennis_tournaments tt ON tt.id = tts.tournament_id
      AND tt.season_year = p_season_year
  ),
  user_totals AS (
    SELECT
      us.user_id,
      COUNT(*)::int                                     AS tournaments_played,
      MAX(us.total_points)                              AS best_tournament_pts,
      -- Drop worst standard tournament if ≥ 5 completed standard events
      CASE
        WHEN v_completed_standard_count >= 5 THEN
          MIN(CASE WHEN us.tournament_type != 'atp_finals' THEN us.total_points END)
        ELSE 0
      END                                               AS worst_dropped,
      SUM(us.total_points) -
        CASE
          WHEN v_completed_standard_count >= 5 THEN
            COALESCE(MIN(CASE WHEN us.tournament_type != 'atp_finals' THEN us.total_points END), 0)
          ELSE 0
        END                                             AS total_points
    FROM user_scores us
    GROUP BY us.user_id
  )
  SELECT
    ut.user_id,
    u.username,
    ut.total_points::int,
    ut.tournaments_played,
    ut.best_tournament_pts::int,
    COALESCE(ut.worst_dropped, 0)::int,
    RANK() OVER (ORDER BY ut.total_points DESC, ut.tournaments_played DESC)::int AS rank
  FROM user_totals ut
  JOIN users u ON u.id = ut.user_id
  ORDER BY rank;
END;
$$;


ALTER FUNCTION "public"."get_player_box_leaderboard"("p_player_box_id" "uuid", "p_season_year" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_scoring_template"("p_tournament_id" "text") RETURNS TABLE("position" "text", "event_type" "text", "points" integer, "multiplier" numeric)
    LANGUAGE "plpgsql"
    AS $$
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
$$;


ALTER FUNCTION "public"."get_scoring_template"("p_tournament_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_server_time"() RETURNS timestamp with time zone
    LANGUAGE "sql" STABLE
    AS $$
  select now();
$$;


ALTER FUNCTION "public"."get_server_time"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_snapshot_bench"("p_starting_xi" "text"[], "p_players" "text"[]) RETURNS "text"[]
    LANGUAGE "sql" IMMUTABLE
    AS $$
  SELECT ARRAY(
    SELECT pid FROM unnest(p_players) pid
    WHERE pid != ALL(p_starting_xi)
  );
$$;


ALTER FUNCTION "public"."get_snapshot_bench"("p_starting_xi" "text"[], "p_players" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_tennis_season_summary"("p_player_box_id" "uuid", "p_season_year" integer DEFAULT 2026) RETURNS TABLE("user_id" "uuid", "username" "text", "tournament_id" "uuid", "tournament_name" "text", "tournament_type" "text", "sort_order" integer, "total_points" integer, "base_points" integer, "captain_bonus" integer, "ace_card_bonus" integer, "breakdown" "jsonb")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM player_box_members WHERE player_box_id = p_player_box_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'NOT_A_MEMBER';
  END IF;

  RETURN QUERY
  SELECT
    pbm.user_id,
    u.username,
    tt.id,
    tt.name,
    tt.tournament_type::text,
    tt.sort_order,
    COALESCE(tts.total_points, 0)::int,
    COALESCE(tts.base_points, 0)::int,
    COALESCE(tts.captain_bonus, 0)::int,
    COALESCE(tts.ace_card_bonus, 0)::int,
    tts.breakdown
  FROM player_box_members pbm
  JOIN users u ON u.id = pbm.user_id
  CROSS JOIN tennis_tournaments tt
  LEFT JOIN tennis_tournament_scores tts
    ON tts.user_id = pbm.user_id AND tts.tournament_id = tt.id
  WHERE pbm.player_box_id = p_player_box_id
    AND tt.season_year = p_season_year
    AND tt.status IN ('in_progress', 'qf_captain_open', 'completed')
  ORDER BY u.username, tt.sort_order;
END;
$$;


ALTER FUNCTION "public"."get_tennis_season_summary"("p_player_box_id" "uuid", "p_season_year" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_tennis_tournament_for_user"("p_tournament_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
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


ALTER FUNCTION "public"."get_tennis_tournament_for_user"("p_tournament_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_tennis_tournament_list"("p_season_year" integer DEFAULT 2026) RETURNS TABLE("tournament_id" "uuid", "name" "text", "tournament_type" "text", "surface" "text", "draw_size" integer, "start_date" "date", "end_date" "date", "roster_lock_at" timestamp with time zone, "status" "text", "sort_order" integer, "player_count" bigint, "has_my_roster" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED';
  END IF;

  RETURN QUERY
  SELECT
    tt.id,
    tt.name,
    tt.tournament_type::text,
    tt.surface::text,
    tt.draw_size,
    tt.start_date,
    tt.end_date,
    tt.roster_lock_at,
    tt.status,
    tt.sort_order,
    COUNT(DISTINCT ttp.id)                               AS player_count,
    EXISTS (
      SELECT 1 FROM tennis_rosters tr
      WHERE tr.tournament_id = tt.id AND tr.user_id = auth.uid()
    )                                                    AS has_my_roster
  FROM tennis_tournaments tt
  LEFT JOIN tennis_tournament_players ttp ON ttp.tournament_id = tt.id
  WHERE tt.season_year = p_season_year
  GROUP BY tt.id
  ORDER BY tt.sort_order;
END;
$$;


ALTER FUNCTION "public"."get_tennis_tournament_list"("p_season_year" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_transfer_window_status"("p_league_id" "uuid") RETURNS json
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    AS $$
DECLARE
  win                   transfer_windows;
  v_tournament_id       text;
  v_league_mode         text;
  v_prev_deadline       timestamptz;
  v_prev_matchday_id    text;
  v_next_deadline       timestamptz;
  v_next_matchday_id    text;
  v_reopen_hours        int;
  v_round_number        int;
  v_last_kickoff        timestamptz;
  v_reopen_at           timestamptz;
  v_active_round_suffix text;
  v_knockout_unlimited  boolean := false;
BEGIN
  SELECT (config_value #>> '{}')::int INTO v_reopen_hours
    FROM league_config
   WHERE league_id = p_league_id AND config_key = 'transfer_reopen_hours';

  win := get_active_transfer_window(p_league_id);
  IF win.id IS NOT NULL THEN
    RETURN json_build_object(
      'status',              'open',
      'closes_at',           win.closes_at,
      'transfers_remaining', win.transfers_remaining,
      'window_type',         win.window_type
    );
  END IF;

  SELECT * INTO win
    FROM transfer_windows
   WHERE league_id = p_league_id AND opens_at > NOW()
   ORDER BY opens_at ASC LIMIT 1;
  IF win.id IS NOT NULL THEN
    RETURN json_build_object('status', 'upcoming', 'opens_at', win.opens_at, 'window_type', win.window_type);
  END IF;

  SELECT tournament_id, league_mode INTO v_tournament_id, v_league_mode FROM leagues WHERE id = p_league_id;
  IF v_tournament_id IS NULL THEN RETURN json_build_object('status', 'no_window'); END IF;

  SELECT deadline_at, matchday_id
    INTO v_prev_deadline, v_prev_matchday_id
    FROM matchday_deadlines
   WHERE tournament_id = v_tournament_id AND deadline_at <= NOW()
   ORDER BY deadline_at DESC LIMIT 1;

  SELECT deadline_at, matchday_id INTO v_next_deadline, v_next_matchday_id
    FROM matchday_deadlines
   WHERE tournament_id = v_tournament_id AND deadline_at > NOW()
   ORDER BY deadline_at ASC LIMIT 1;

  -- Active round for the unlimited-transfers check: the round about to be played
  -- (next deadline's matchday_id) if known, else the round that just closed.
  v_active_round_suffix := split_part(COALESCE(v_next_matchday_id, v_prev_matchday_id, ''), '-', 2);
  IF v_league_mode = 'classic' AND v_active_round_suffix <> '' THEN
    SELECT unlimited_transfers INTO v_knockout_unlimited
      FROM club_cap_rules
     WHERE tournament_id = v_tournament_id AND round_suffix = v_active_round_suffix;
    v_knockout_unlimited := COALESCE(v_knockout_unlimited, false);
  END IF;

  IF v_prev_deadline IS NULL THEN
    IF v_next_deadline IS NOT NULL THEN
      RETURN json_build_object(
        'status', 'open', 'closes_at', v_next_deadline,
        'transfers_remaining', NULL,
        'window_type', CASE WHEN v_knockout_unlimited THEN 'unlimited' ELSE 'matchday' END
      );
    END IF;
    RETURN json_build_object('status', 'no_window');
  END IF;

  IF v_reopen_hours IS NULL THEN
    IF v_prev_matchday_id IS NOT NULL THEN
      v_round_number := split_part(v_prev_matchday_id, '-r', 2)::int;
    END IF;
    IF v_round_number IS NOT NULL AND v_round_number <= 3 THEN
      v_reopen_hours := 1;
    ELSE
      v_reopen_hours := 6;
    END IF;
  END IF;

  IF v_prev_matchday_id IS NOT NULL THEN
    SELECT MAX(kickoff_at) INTO v_last_kickoff
      FROM fixtures
     WHERE matchday_id   = v_prev_matchday_id
       AND tournament_id = v_tournament_id;
  END IF;

  IF v_last_kickoff IS NOT NULL THEN
    v_reopen_at := v_last_kickoff
                 + interval '2 hours'
                 + (v_reopen_hours || ' hours')::interval;
  ELSE
    v_reopen_at := v_prev_deadline + (v_reopen_hours || ' hours')::interval;
  END IF;

  IF NOW() >= v_reopen_at THEN
    IF v_next_deadline IS NOT NULL THEN
      RETURN json_build_object(
        'status', 'open', 'closes_at', v_next_deadline,
        'transfers_remaining', NULL,
        'window_type', CASE WHEN v_knockout_unlimited THEN 'unlimited' ELSE 'matchday' END
      );
    END IF;
    RETURN json_build_object('status', 'no_window');
  END IF;

  RETURN json_build_object(
    'status',      'upcoming',
    'opens_at',    v_reopen_at,
    'window_type', 'matchday'
  );
END;
$$;


ALTER FUNCTION "public"."get_transfer_window_status"("p_league_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_unread_chat_count"("p_league_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_unread_count integer;
  v_last_read_at timestamp with time zone;
BEGIN
  -- Get user's last read timestamp for this league
  SELECT last_read_at INTO v_last_read_at
  FROM league_chat_read_status
  WHERE league_id = p_league_id AND user_id = auth.uid();

  -- If no read status exists, all messages are unread
  IF v_last_read_at IS NULL THEN
    SELECT COUNT(*) INTO v_unread_count
    FROM chat_messages
    WHERE league_id = p_league_id;
  ELSE
    -- Count messages created after last read time
    SELECT COUNT(*) INTO v_unread_count
    FROM chat_messages
    WHERE league_id = p_league_id AND created_at > v_last_read_at;
  END IF;

  RETURN COALESCE(v_unread_count, 0);
END;
$$;


ALTER FUNCTION "public"."get_unread_chat_count"("p_league_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_unread_mentions"("p_league_id" "uuid") RETURNS TABLE("message_id" "uuid", "sender_id" "uuid", "sender_name" "text", "message_text" "text", "created_at" timestamp with time zone, "message_timestamp" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.id,
    m.user_id,
    u.user_metadata->>'display_name' as sender_name,
    m.message,
    m.created_at,
    to_char(m.created_at, 'HH24:MI') as message_timestamp
  FROM chat_messages m
  JOIN users u ON m.user_id = u.id
  WHERE
    m.league_id = p_league_id
    AND auth.uid() = ANY(m.mentioned_user_ids)
    AND m.created_at > COALESCE(
      (SELECT last_read_at FROM league_chat_read_status WHERE league_id = p_league_id AND user_id = auth.uid()),
      now() - interval '30 days'
    )
  ORDER BY m.created_at DESC
  LIMIT 50;
END;
$$;


ALTER FUNCTION "public"."get_unread_mentions"("p_league_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_unread_notification_count"("p_league_id" "uuid") RETURNS integer
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
SELECT COUNT(*)::INT
FROM league_notifications
WHERE user_id = auth.uid()
  AND league_id = p_league_id
  AND is_read = false;
$$;


ALTER FUNCTION "public"."get_unread_notification_count"("p_league_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."guard_coin_columns"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    RAISE EXCEPTION 'DIRECT_WRITE_BLOCKED: coin balance can only change via credit_coins() / debit_coins_to_escrow() RPCs';
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."guard_coin_columns"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."guard_daily_joker_deadline"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon')
     AND EXISTS (
       SELECT 1 FROM matchday_deadlines
        WHERE matchday_id = NEW.matchday_id
          AND deadline_at < NOW()
     ) THEN
    RAISE EXCEPTION 'Joker cannot be set after the matchday deadline';
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."guard_daily_joker_deadline"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."guard_daily_joker_external_player"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- Check if the chosen joker player is already in the manager's squad
  -- for this league (any squad row — covers multiple-round squads).
  IF EXISTS (
    SELECT 1 FROM squads s
    WHERE s.user_id   = NEW.user_id
      AND s.league_id = NEW.league_id
      AND s.players   @> ARRAY[NEW.player_id]::text[]
  ) THEN
    RAISE EXCEPTION 'JOKER_OWN_SQUAD'
      USING DETAIL = 'The Matchday Joker must be a player outside your 15-man squad.';
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."guard_daily_joker_external_player"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."guard_squad_protected_columns"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_budget_cap numeric;
BEGIN
  -- Only guard direct PostgREST client writes. SECURITY DEFINER RPCs run as the
  -- owner (postgres) and the service-role key runs as service_role — both trusted.
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- A client may only create an EMPTY starting squad with a non-inflated budget.
    -- Roster is populated via transfers / the draft RPC (server side).
    IF COALESCE(array_length(NEW.players, 1), 0) <> 0 THEN
      RAISE EXCEPTION 'squad roster can only be populated via transfers or the draft (server-side)';
    END IF;
    SELECT COALESCE(budget_total, 100) INTO v_budget_cap FROM leagues WHERE id = NEW.league_id;
    IF NEW.budget_remaining > COALESCE(v_budget_cap, 100) THEN
      RAISE EXCEPTION 'squad budget cannot exceed the league starting budget';
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE: budget + identity columns are immutable from the client.
  IF NEW.budget_remaining IS DISTINCT FROM OLD.budget_remaining
     OR NEW.user_id        IS DISTINCT FROM OLD.user_id
     OR NEW.league_id      IS DISTINCT FROM OLD.league_id
     OR NEW.matchday_id    IS DISTINCT FROM OLD.matchday_id
     OR NEW.round_transfers IS DISTINCT FROM OLD.round_transfers THEN
    RAISE EXCEPTION 'protected squad columns (budget/identity/transfers) can only change via server RPCs';
  END IF;

  -- captain_id can only be REASSIGNED via set_captain() (migration 166), which
  -- validates the candidate's fixture hasn't already started this round. The
  -- initial null -> first-player auto-default (SquadScreen first load) is still
  -- allowed directly since no fixture result can have been "seen" yet.
  IF NEW.captain_id IS DISTINCT FROM OLD.captain_id AND OLD.captain_id IS NOT NULL THEN
    RAISE EXCEPTION 'captain can only be changed via set_captain (server-side)';
  END IF;

  -- players may be REORDERED (pitch/bench swap of the same set) but not added to or
  -- removed from — roster changes must go through transfers.
  IF NOT ( COALESCE(NEW.players, '{}') <@ COALESCE(OLD.players, '{}')
       AND COALESCE(OLD.players, '{}') <@ COALESCE(NEW.players, '{}') ) THEN
    RAISE EXCEPTION 'squad roster changes must go through transfers (server-side)';
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."guard_squad_protected_columns"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."guard_users_privilege_columns"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- Service-role and internal calls are always permitted
  IF current_setting('role', true) NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  -- Block privilege escalation via is_admin
  IF (NEW.is_admin IS DISTINCT FROM OLD.is_admin) THEN
    RAISE EXCEPTION 'Forbidden: direct writes to is_admin are not permitted.';
  END IF;

  -- Block identity mutation
  IF (NEW.id IS DISTINCT FROM OLD.id) THEN
    RAISE EXCEPTION 'Forbidden: user id is immutable.';
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."guard_users_privilege_columns"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  INSERT INTO public.users (id, username)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data ->> 'username',
      split_part(NEW.email, '@', 1)
    )
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";



-- Not present in the `public`-schema-only dump this file was generated from —
-- the real trigger lives on auth.users in prod. Added here so the local test
-- harness replicates the auth.users → public.users sync that handle_new_user()
-- implements but that nothing in this file otherwise invokes.
CREATE TRIGGER "on_auth_user_created" AFTER INSERT ON "auth"."users" FOR EACH ROW EXECUTE FUNCTION "public"."handle_new_user"();


CREATE OR REPLACE FUNCTION "public"."is_league_member"("p_league_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.league_members
    WHERE league_id = p_league_id
      AND user_id   = auth.uid()
  );
$$;


ALTER FUNCTION "public"."is_league_member"("p_league_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."issue_season_ace_cards"("p_season_year" integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
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


ALTER FUNCTION "public"."issue_season_ace_cards"("p_season_year" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."join_circle_by_code"("p_code" "text") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_user_id   uuid := auth.uid();
  v_circle_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN json_build_object('error', 'UNAUTHENTICATED');
  END IF;

  SELECT id INTO v_circle_id
  FROM circles
  WHERE invite_code = trim(p_code);

  IF v_circle_id IS NULL THEN
    RETURN json_build_object('error', 'INVALID_CODE');
  END IF;

  IF EXISTS (
    SELECT 1 FROM circle_members
    WHERE circle_id = v_circle_id AND user_id = v_user_id
  ) THEN
    RETURN json_build_object('error', 'ALREADY_MEMBER');
  END IF;

  INSERT INTO circle_members (circle_id, user_id, role)
  VALUES (v_circle_id, v_user_id, 'member');

  RETURN json_build_object('circle_id', v_circle_id);
END;
$$;


ALTER FUNCTION "public"."join_circle_by_code"("p_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."join_league_by_code"("p_code" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_caller       uuid := auth.uid();
  v_league_id    uuid;
  v_member_count int;
  v_entry_fee    int  := 0;
  v_fee_cfg      text;
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

  -- Check for coin entry fee in league_config
  SELECT config_value INTO v_fee_cfg
  FROM public.league_config
  WHERE league_id = v_league_id AND config_key = 'coin_entry_fee';

  IF v_fee_cfg IS NOT NULL THEN
    v_entry_fee := COALESCE(v_fee_cfg::int, 0);
  END IF;

  -- Debit entry fee before inserting member (atomic: fee fails → no join)
  IF v_entry_fee > 0 THEN
    BEGIN
      PERFORM _debit_entry_fee(v_caller, v_entry_fee, v_league_id);
    EXCEPTION
      WHEN OTHERS THEN
        RETURN jsonb_build_object(
          'error',      SQLERRM,
          'entry_fee',  v_entry_fee
        );
    END;
  END IF;

  INSERT INTO public.league_members (league_id, user_id, role)
  VALUES (v_league_id, v_caller, 'member');

  RETURN jsonb_build_object(
    'league_id',  v_league_id,
    'name',       (SELECT name FROM public.leagues WHERE id = v_league_id),
    'entry_fee',  v_entry_fee,
    'success',    true
  );
END;
$$;


ALTER FUNCTION "public"."join_league_by_code"("p_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."join_league_by_code"("p_code" "text", "p_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
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


ALTER FUNCTION "public"."join_league_by_code"("p_code" "text", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."join_paddock_by_code"("p_code" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_paddock_id uuid;
BEGIN
  SELECT id INTO v_paddock_id FROM paddocks WHERE invite_code = upper(p_code);
  IF v_paddock_id IS NULL THEN RAISE EXCEPTION 'PADDOCK_NOT_FOUND'; END IF;

  INSERT INTO paddock_members (paddock_id, user_id, role)
    VALUES (v_paddock_id, auth.uid(), 'member')
    ON CONFLICT (paddock_id, user_id) DO NOTHING;

  RETURN v_paddock_id;
END;
$$;


ALTER FUNCTION "public"."join_paddock_by_code"("p_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."join_player_box_by_code"("p_invite_code" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_box player_boxes%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED';
  END IF;

  SELECT * INTO v_box
  FROM player_boxes
  WHERE invite_code = upper(trim(p_invite_code));

  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVALID_CODE';
  END IF;

  IF EXISTS (
    SELECT 1 FROM player_box_members
    WHERE player_box_id = v_box.id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'ALREADY_MEMBER';
  END IF;

  INSERT INTO player_box_members (player_box_id, user_id)
  VALUES (v_box.id, auth.uid());

  RETURN jsonb_build_object('player_box_id', v_box.id, 'name', v_box.name);
END;
$$;


ALTER FUNCTION "public"."join_player_box_by_code"("p_invite_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."kick_circle_member"("p_circle_id" "uuid", "p_user_id" "uuid") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_caller uuid := auth.uid();
BEGIN
  IF v_caller IS NULL THEN
    RETURN json_build_object('error', 'UNAUTHENTICATED');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM circle_members
    WHERE circle_id = p_circle_id
      AND user_id   = v_caller
      AND role      = 'owner'
  ) THEN
    RETURN json_build_object('error', 'NOT_OWNER');
  END IF;

  IF v_caller = p_user_id THEN
    RETURN json_build_object('error', 'CANNOT_KICK_SELF');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM circle_members
    WHERE circle_id = p_circle_id AND user_id = p_user_id
  ) THEN
    RETURN json_build_object('error', 'NOT_MEMBER');
  END IF;

  DELETE FROM circle_members
  WHERE circle_id = p_circle_id AND user_id = p_user_id;

  RETURN json_build_object('ok', true);
END;
$$;


ALTER FUNCTION "public"."kick_circle_member"("p_circle_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."link_competition_to_clubhouse"("p_circle_id" "uuid", "p_type" "text", "p_competition_id" "uuid") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RETURN json_build_object('error', 'UNAUTHENTICATED');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM circle_members
    WHERE circle_id = p_circle_id
      AND user_id = v_user_id
      AND role = 'owner'
  ) THEN
    RETURN json_build_object('error', 'NOT_OWNER');
  END IF;

  IF p_type = 'league' THEN
    INSERT INTO circle_leagues (circle_id, league_id)
    VALUES (p_circle_id, p_competition_id)
    ON CONFLICT DO NOTHING;

  ELSIF p_type = 'paddock' THEN
    INSERT INTO circle_paddocks (circle_id, paddock_id)
    VALUES (p_circle_id, p_competition_id)
    ON CONFLICT DO NOTHING;

  ELSE
    RETURN json_build_object('error', 'INVALID_TYPE');
  END IF;

  RETURN json_build_object('ok', true);
END;
$$;


ALTER FUNCTION "public"."link_competition_to_clubhouse"("p_circle_id" "uuid", "p_type" "text", "p_competition_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."link_league_to_circle"("p_circle_id" "uuid", "p_league_id" "uuid") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RETURN json_build_object('error', 'UNAUTHENTICATED');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM circle_members
    WHERE circle_id = p_circle_id
      AND user_id   = v_user_id
      AND role      = 'owner'
  ) THEN
    RETURN json_build_object('error', 'NOT_OWNER');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM league_members
    WHERE league_id = p_league_id
      AND user_id   = v_user_id
      AND role      = 'commissioner'
  ) THEN
    RETURN json_build_object('error', 'NOT_COMMISSIONER');
  END IF;

  INSERT INTO circle_leagues (circle_id, league_id)
  VALUES (p_circle_id, p_league_id)
  ON CONFLICT DO NOTHING;

  RETURN json_build_object('ok', true);
END;
$$;


ALTER FUNCTION "public"."link_league_to_circle"("p_circle_id" "uuid", "p_league_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."lock_lineups_for_fixture"("p_fixture_id" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_fixture       fixtures;
  v_matchday_id   text;
  v_pids          text[];
  v_squad_row     RECORD;
  v_existing_lock jsonb;
  v_new_lock_arr  jsonb;
BEGIN
  SELECT * INTO v_fixture FROM fixtures WHERE id = p_fixture_id;
  IF NOT FOUND THEN RETURN; END IF;

  -- Only lock when fixture is live or finished
  IF v_fixture.status NOT IN ('live', 'finished') THEN RETURN; END IF;

  -- Both team IDs must be set for the join to work
  IF v_fixture.home_team_forza_id IS NULL OR v_fixture.away_team_forza_id IS NULL THEN
    RETURN;
  END IF;

  v_matchday_id := v_fixture.tournament_id || '-r' || v_fixture.round_number;

  -- All players on both teams for this fixture
  SELECT ARRAY_AGG(DISTINCT id::text)
    INTO v_pids
    FROM players
   WHERE forza_team_id IN (v_fixture.home_team_forza_id, v_fixture.away_team_forza_id);

  IF v_pids IS NULL OR array_length(v_pids, 1) = 0 THEN RETURN; END IF;

  -- For each squad pinned to this matchday that has any of these players in starting_xi,
  -- add those players to lineup_locks[matchday_id]
  FOR v_squad_row IN
    SELECT id, starting_xi, lineup_locks
    FROM   squads
    WHERE  matchday_id = v_matchday_id
      AND  starting_xi && v_pids    -- overlap operator: true if any element in common
  LOOP
    v_existing_lock := COALESCE(v_squad_row.lineup_locks -> v_matchday_id, '[]'::jsonb);

    -- Union existing locks with players from this fixture that are in the XI
    SELECT jsonb_agg(DISTINCT val) INTO v_new_lock_arr
    FROM (
      SELECT jsonb_array_elements_text(v_existing_lock) AS val
      UNION ALL
      SELECT xi FROM unnest(v_squad_row.starting_xi) AS xi
      WHERE  xi = ANY(v_pids)
    ) t;

    UPDATE squads
    SET lineup_locks = jsonb_set(
      COALESCE(lineup_locks, '{}'::jsonb),
      ARRAY[v_matchday_id],
      COALESCE(v_new_lock_arr, '[]'::jsonb)
    )
    WHERE id = v_squad_row.id;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."lock_lineups_for_fixture"("p_fixture_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_all_notifications_read"("p_league_id" "uuid") RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    AS $$
UPDATE league_notifications
SET is_read = true, updated_at = NOW()
WHERE user_id = auth.uid()
  AND league_id = p_league_id
  AND is_read = false;
$$;


ALTER FUNCTION "public"."mark_all_notifications_read"("p_league_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_league_chat_read"("p_league_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  INSERT INTO league_chat_read_status (league_id, user_id, last_read_at)
  VALUES (p_league_id, auth.uid(), now())
  ON CONFLICT (league_id, user_id)
  DO UPDATE SET last_read_at = now();
END;
$$;


ALTER FUNCTION "public"."mark_league_chat_read"("p_league_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_mention_read"("p_message_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- Update the message to remove current user from mentioned_user_ids
  UPDATE chat_messages
  SET mentioned_user_ids = array_remove(mentioned_user_ids, auth.uid())
  WHERE id = p_message_id;
END;
$$;


ALTER FUNCTION "public"."mark_mention_read"("p_message_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_notification_read"("p_notification_id" "uuid") RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    AS $$
UPDATE league_notifications
SET is_read = true, updated_at = NOW()
WHERE id = p_notification_id
  AND user_id = auth.uid();
$$;


ALTER FUNCTION "public"."mark_notification_read"("p_notification_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_league_on_bet_creation"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO league_notifications (
    league_id,
    user_id,
    notification_type,
    triggered_by_user_id,
    title,
    description,
    related_entity_id,
    related_entity_type
  )
  SELECT
    NEW.league_id,
    lm.user_id,
    'bet_created',
    auth.uid(),
    NEW.title,
    CONCAT('Deadline: ', to_char(NEW.deadline_at, 'HH24:MI UTC')),
    NEW.id,
    'bet_instance'
  FROM league_members lm
  WHERE lm.league_id = NEW.league_id
    AND lm.user_id != auth.uid();

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."notify_league_on_bet_creation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_on_direct_message"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO clubhouse_notifications (circle_id, user_id, source_type, source_id, type, payload)
  VALUES (
    NEW.circle_id,
    NEW.to_user_id,
    'clubhouse',
    NEW.circle_id,
    'direct_message',
    jsonb_build_object(
      'from_user_id', NEW.from_user_id,
      'preview',      left(NEW.content, 100)
    )
  );

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."notify_on_direct_message"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_on_frontpage_edition"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.circle_id IS NULL THEN RETURN NEW; END IF;

  INSERT INTO clubhouse_notifications (circle_id, user_id, source_type, source_id, type, payload)
  SELECT
    NEW.circle_id,
    cm.user_id,
    'clubhouse',
    NEW.circle_id,
    'frontpage_edition',
    jsonb_build_object('edition_date', NEW.edition_date, 'headline', NEW.headline)
  FROM circle_members cm
  WHERE cm.circle_id = NEW.circle_id;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."notify_on_frontpage_edition"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_on_gazette_breaking_news"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.entry_type <> 'breaking_news' THEN RETURN NEW; END IF;
  IF NEW.league_id IS NULL THEN RETURN NEW; END IF;

  INSERT INTO clubhouse_notifications (circle_id, user_id, source_type, source_id, type, payload)
  SELECT DISTINCT
    cl.circle_id,
    cm.user_id,
    'league',
    NEW.league_id,
    'breaking_news',
    jsonb_build_object('headline', NEW.headline, 'league_id', NEW.league_id)
  FROM circle_leagues cl
  JOIN circle_members cm ON cm.circle_id = cl.circle_id
  WHERE cl.league_id = NEW.league_id;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."notify_on_gazette_breaking_news"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."place_bid"("p_listing_id" "uuid", "p_bid_amount" numeric) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_listing    auction_listings;
  v_min_bid    NUMERIC;
  v_squad_id   UUID;
BEGIN
  SELECT * INTO v_listing FROM auction_listings WHERE id = p_listing_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Listing not found');
  END IF;

  IF v_listing.status <> 'open' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Auction is not open');
  END IF;

  IF v_listing.deadline_at < NOW() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Auction deadline passed');
  END IF;

  v_min_bid := GREATEST(v_listing.starting_bid, v_listing.current_bid + v_listing.min_increment);

  IF p_bid_amount < v_min_bid THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Bid too low. Minimum: ' || v_min_bid);
  END IF;

  SELECT id INTO v_squad_id
  FROM squads
  WHERE league_id = v_listing.league_id
    AND user_id   = auth.uid()
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_squad_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Squad not found');
  END IF;

  IF v_listing.seller_id = v_squad_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'You cannot bid on your own listing');
  END IF;

  UPDATE auction_listings
  SET current_bid        = p_bid_amount,
      highest_bidder_id  = auth.uid(),
      updated_at         = NOW()
  WHERE id = p_listing_id;

  INSERT INTO auction_bids (listing_id, league_id, bidder_id, amount, placed_at)
  VALUES (p_listing_id, v_listing.league_id, auth.uid(), p_bid_amount, NOW())
  ON CONFLICT (listing_id, bidder_id)
    DO UPDATE SET amount = EXCLUDED.amount, placed_at = EXCLUDED.placed_at;

  PERFORM _log_squad_event('auction_bid', v_listing.league_id, auth.uid(), v_squad_id, NULL,
    v_listing.player_id, NULL,
    jsonb_build_object('amount', p_bid_amount, 'listing_id', p_listing_id));

  RETURN jsonb_build_object('ok', true);
END;
$$;


ALTER FUNCTION "public"."place_bid"("p_listing_id" "uuid", "p_bid_amount" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."preserve_manual_matchday_id"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- If the existing matchday_id is set and the incoming value is NULL, keep the old one.
  IF OLD.matchday_id IS NOT NULL AND NEW.matchday_id IS NULL THEN
    NEW.matchday_id  := OLD.matchday_id;
    NEW.round_number := OLD.round_number;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."preserve_manual_matchday_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_auction_deadlines"() RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_voided INT;
BEGIN
  -- Step 1: open listings past deadline → pending_confirmation (or cancelled if no bids)
  -- (calls the updated resolve_auction_listing for each expired open listing)
  PERFORM public.resolve_auction_listing(id)
  FROM public.auction_listings
  WHERE status = 'open' AND deadline_at < NOW();

  -- Step 2: pending listings whose window has come and gone → cancelled
  v_voided := public.sweep_void_auction_confirmations();

  RETURN 'ok: voided=' || v_voided;
END;
$$;


ALTER FUNCTION "public"."process_auction_deadlines"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."recompute_league_ranks"("p_league_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  WITH ranked AS (
    SELECT user_id,
           DENSE_RANK() OVER (ORDER BY total_points DESC NULLS LAST) AS new_rank
    FROM league_members
    WHERE league_id = p_league_id
  )
  UPDATE league_members lm
  SET rank = r.new_rank
  FROM ranked r
  WHERE lm.league_id = p_league_id
    AND lm.user_id = r.user_id
    AND lm.rank IS DISTINCT FROM r.new_rank;
END;
$$;


ALTER FUNCTION "public"."recompute_league_ranks"("p_league_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reject_trade_proposal"("p_proposal_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_proposal       trade_proposals%ROWTYPE;
  v_target_user_id UUID;
BEGIN
  SELECT * INTO v_proposal FROM trade_proposals WHERE id = p_proposal_id;

  IF v_proposal.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'PROPOSAL_NOT_FOUND');
  END IF;

  IF v_proposal.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'PROPOSAL_NOT_PENDING');
  END IF;

  SELECT user_id INTO v_target_user_id FROM squads WHERE id = v_proposal.target_squad_id;

  IF v_target_user_id <> auth.uid() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NOT_TARGET_SQUAD_OWNER');
  END IF;

  UPDATE trade_proposals
    SET status = 'rejected', resolved_at = NOW()
    WHERE id = p_proposal_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;


ALTER FUNCTION "public"."reject_trade_proposal"("p_proposal_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."release_escrow"("p_user_id" "uuid", "p_amount" integer, "p_challenge_id" "uuid" DEFAULT NULL::"uuid", "p_meta" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_escrow int;
BEGIN
  IF p_amount <= 0 THEN RAISE EXCEPTION 'AMOUNT_MUST_BE_POSITIVE'; END IF;

  SELECT escrow INTO v_escrow
  FROM coin_wallets WHERE user_id = p_user_id FOR UPDATE;

  IF NOT FOUND      THEN RAISE EXCEPTION 'WALLET_NOT_FOUND'; END IF;
  IF v_escrow < p_amount THEN RAISE EXCEPTION 'INSUFFICIENT_ESCROW'; END IF;

  UPDATE coin_wallets
  SET balance    = balance + p_amount,
      escrow     = escrow  - p_amount,
      updated_at = now()
  WHERE user_id = p_user_id;

  INSERT INTO coin_transactions (user_id, type, amount, challenge_id, meta)
  VALUES (p_user_id, 'refund', p_amount, p_challenge_id, p_meta);
END;
$$;


ALTER FUNCTION "public"."release_escrow"("p_user_id" "uuid", "p_amount" integer, "p_challenge_id" "uuid", "p_meta" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."report_client_error"("p_message" "text", "p_stack" "text" DEFAULT NULL::"text", "p_url" "text" DEFAULT NULL::"text", "p_user_agent" "text" DEFAULT NULL::"text", "p_context" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  INSERT INTO client_errors (user_id, message, stack, url, user_agent, context)
  VALUES (
    auth.uid(),
    LEFT(p_message, 2000),
    LEFT(p_stack,   8000),
    LEFT(p_url,      500),
    LEFT(p_user_agent, 500),
    p_context
  );
END;
$$;


ALTER FUNCTION "public"."report_client_error"("p_message" "text", "p_stack" "text", "p_url" "text", "p_user_agent" "text", "p_context" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."resolve_auction_listing"("p_listing_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_listing auction_listings;
BEGIN
  SELECT * INTO v_listing
  FROM auction_listings
  WHERE id = p_listing_id AND status = 'open'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Listing not found or already resolved.');
  END IF;

  -- No bids → cancel as before
  IF v_listing.highest_bidder_id IS NULL THEN
    UPDATE auction_listings SET status = 'cancelled', updated_at = NOW()
    WHERE id = p_listing_id;
    RETURN jsonb_build_object('ok', true, 'result', 'cancelled');
  END IF;

  -- Has a winner → pending confirmation (buyer must act within the transfer window)
  UPDATE auction_listings
  SET status = 'pending_confirmation', won_at = NOW(), updated_at = NOW()
  WHERE id = p_listing_id;

  RETURN jsonb_build_object('ok', true, 'result', 'pending_confirmation');
END;
$$;


ALTER FUNCTION "public"."resolve_auction_listing"("p_listing_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."resolve_bet"("p_instance_id" "uuid", "p_answers" "text"[]) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_league_id            UUID;
  v_reward_value         NUMERIC;
  v_reward_type          TEXT;
  v_status               TEXT;
  v_deadline_at          TIMESTAMPTZ;
  v_winners              INT := 0;
  v_total                INT := 0;
  v_is_commissioner      BOOLEAN;
  v_no_winner            BOOLEAN;
  v_user_id              UUID;
  v_title                TEXT;
  r                      RECORD;
  v_old_points_user_ids  UUID[];
BEGIN
  SELECT league_id, reward_value, reward_type, status, deadline_at, title
    INTO v_league_id, v_reward_value, v_reward_type, v_status, v_deadline_at, v_title
    FROM bet_instances WHERE id = p_instance_id;

  IF v_league_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'BET_NOT_FOUND');
  END IF;

  -- Check commissioner status first — needed to decide whether ALREADY_RESOLVED
  -- is a hard block (non-commissioner) or an overrideable state (commissioner).
  v_is_commissioner := auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM league_members
     WHERE league_id = v_league_id AND user_id = auth.uid() AND role = 'commissioner'
  );

  IF v_status = 'resolved' THEN
    IF NOT v_is_commissioner THEN
      RETURN jsonb_build_object('ok', false, 'error', 'ALREADY_RESOLVED');
    END IF;

    -- Commissioner override: reverse old rewards before re-resolving.
    IF v_reward_type = 'budget' THEN
      -- Subtract the old reward from previously-winning squads (floor at 0).
      UPDATE squads
         SET budget_remaining = GREATEST(0, budget_remaining - v_reward_value)
       WHERE id IN (
         SELECT squad_id FROM bet_submissions
          WHERE bet_instance_id = p_instance_id AND is_correct = true
       );
    ELSIF v_reward_type = 'points' THEN
      -- Capture old winner user IDs — must re-aggregate them after the override
      -- so their total_points no longer reflects the now-invalid reward.
      SELECT COALESCE(array_agg(DISTINCT s.user_id), '{}')
        INTO v_old_points_user_ids
        FROM bet_submissions bs
        JOIN squads s ON s.id = bs.squad_id
       WHERE bs.bet_instance_id = p_instance_id AND bs.is_correct = true;
    END IF;

    -- Reset to 'closed' so normal processing proceeds (including final status update
    -- back to 'resolved' with the new correct_answers).
    UPDATE bet_instances SET status = 'closed' WHERE id = p_instance_id;
    v_status := 'closed';
  END IF;

  -- Non-commissioner authenticated users are blocked
  IF auth.uid() IS NOT NULL AND NOT v_is_commissioner THEN
    RETURN jsonb_build_object('ok', false, 'error', 'UNAUTHORIZED');
  END IF;

  -- BET_STILL_OPEN only blocks the auto-resolve cron (auth.uid() IS NULL).
  -- Commissioners can resolve at any time — the deadline is for submissions only.
  IF NOT v_is_commissioner
     AND v_status = 'open'
     AND v_deadline_at IS NOT NULL
     AND v_deadline_at > NOW() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'BET_STILL_OPEN');
  END IF;

  -- NULL or empty array = "no winner" resolution
  v_no_winner := (p_answers IS NULL OR array_length(p_answers, 1) IS NULL OR array_length(p_answers, 1) = 0);

  SELECT COUNT(*) INTO v_total FROM bet_submissions WHERE bet_instance_id = p_instance_id;

  IF v_no_winner THEN
    UPDATE bet_submissions
       SET is_correct = false, reward_awarded = NULL
     WHERE bet_instance_id = p_instance_id;
    v_winners := 0;
  ELSE
    SELECT COUNT(*) FILTER (WHERE answer = ANY(p_answers))
      INTO v_winners
      FROM bet_submissions WHERE bet_instance_id = p_instance_id;

    UPDATE bet_submissions
       SET is_correct     = (answer = ANY(p_answers)),
           reward_awarded = CASE WHEN answer = ANY(p_answers) THEN v_reward_value ELSE NULL END
     WHERE bet_instance_id = p_instance_id;

    IF v_reward_type = 'budget' THEN
      UPDATE squads
         SET budget_remaining = budget_remaining + v_reward_value
       WHERE id IN (
         SELECT squad_id FROM bet_submissions
          WHERE bet_instance_id = p_instance_id AND answer = ANY(p_answers)
       );
    ELSIF v_reward_type = 'points' THEN
      -- Refresh total_points for new winners immediately
      FOR v_user_id IN
        SELECT DISTINCT s.user_id
          FROM bet_submissions bs
          JOIN squads s ON s.id = bs.squad_id
         WHERE bs.bet_instance_id = p_instance_id
           AND bs.answer = ANY(p_answers)
      LOOP
        PERFORM aggregate_league_member_points(v_league_id, v_user_id);
      END LOOP;
    END IF;

    -- Audit: log bet_win event for every winning submission
    FOR r IN
      SELECT bs.squad_id, bs.answer, s.user_id
        FROM bet_submissions bs
        JOIN squads s ON s.id = bs.squad_id
       WHERE bs.bet_instance_id = p_instance_id
         AND bs.answer = ANY(p_answers)
    LOOP
      PERFORM _log_squad_event(
        'bet_win',
        v_league_id,
        r.user_id,
        r.squad_id,
        NULL, NULL, NULL,
        jsonb_build_object(
          'bet_instance_id', p_instance_id,
          'bet_title',       v_title,
          'reward_type',     v_reward_type,
          'reward_value',    v_reward_value,
          'answer',          r.answer
        )
      );
    END LOOP;
  END IF;

  UPDATE bet_instances
     SET status            = 'resolved',
         correct_answer    = CASE WHEN v_no_winner THEN NULL ELSE p_answers[1] END,
         correct_answers   = COALESCE(p_answers, '{}'),
         winners_count     = v_winners,
         total_submissions = v_total
   WHERE id = p_instance_id;

  -- Commissioner override: after the new correct_answers are written and status
  -- is back to 'resolved', re-aggregate old points-type winners so that managers
  -- who are NO LONGER correct lose their reward from the leaderboard.
  IF v_old_points_user_ids IS NOT NULL AND array_length(v_old_points_user_ids, 1) > 0 THEN
    FOREACH v_user_id IN ARRAY v_old_points_user_ids LOOP
      PERFORM aggregate_league_member_points(v_league_id, v_user_id);
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'ok',                  true,
    'winners',             v_winners,
    'total',               v_total,
    'no_winner',           v_no_winner,
    'submissions_updated', v_total
  );
END;
$$;


ALTER FUNCTION "public"."resolve_bet"("p_instance_id" "uuid", "p_answers" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."resolve_bet"("p_instance_id" "uuid", "p_answer" "text") RETURNS "jsonb"
    LANGUAGE "sql" SECURITY DEFINER
    AS $$
  SELECT resolve_bet(p_instance_id, ARRAY[p_answer]::text[]);
$$;


ALTER FUNCTION "public"."resolve_bet"("p_instance_id" "uuid", "p_answer" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."resolve_p2p_challenge"("p_challenge_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_ch              p2p_challenges;
  v_challenger_pts  numeric;
  v_opponent_pts    numeric;
  v_winner_id       uuid;
  v_is_tie          boolean := false;
  v_total_pot       int;
  v_rake            int;
  v_prize           int;
  v_loser_id        uuid;
  v_challenger_name text;
  v_opponent_name   text;
  v_loser_escrow    int;
BEGIN
  -- Service role / cron check — authenticated users cannot call this
  IF auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'ADMIN_ONLY';
  END IF;

  SELECT * INTO v_ch FROM p2p_challenges WHERE id = p_challenge_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CHALLENGE_NOT_FOUND'; END IF;
  IF v_ch.status <> 'accepted' THEN
    RAISE EXCEPTION 'CHALLENGE_NOT_ACCEPTED (status=%)', v_ch.status;
  END IF;

  -- Guard: only resolve when the matchday is settled (gazette activity entry exists for this league+round)
  IF NOT EXISTS (
    SELECT 1 FROM gazette_entries
    WHERE league_id   = v_ch.league_id
      AND entry_type  = 'activity'
      AND full_data->>'matchday_id' = v_ch.matchday_id
  ) THEN
    RAISE EXCEPTION 'MATCHDAY_NOT_SETTLED';
  END IF;

  -- Get pts for both managers (latest squad in this league for each user)
  SELECT fp.total INTO v_challenger_pts
  FROM fantasy_points fp
  JOIN squads s ON s.id = fp.squad_id
  WHERE fp.matchday_id = v_ch.matchday_id
    AND s.league_id    = v_ch.league_id
    AND s.user_id      = v_ch.challenger_id
  ORDER BY s.created_at DESC
  LIMIT 1;

  SELECT fp.total INTO v_opponent_pts
  FROM fantasy_points fp
  JOIN squads s ON s.id = fp.squad_id
  WHERE fp.matchday_id = v_ch.matchday_id
    AND s.league_id    = v_ch.league_id
    AND s.user_id      = v_ch.opponent_id
  ORDER BY s.created_at DESC
  LIMIT 1;

  -- Default missing pts to 0 (no squad / no score yet)
  v_challenger_pts := COALESCE(v_challenger_pts, 0);
  v_opponent_pts   := COALESCE(v_opponent_pts, 0);

  -- Determine outcome
  IF v_challenger_pts > v_opponent_pts THEN
    v_winner_id := v_ch.challenger_id;
    v_loser_id  := v_ch.opponent_id;
  ELSIF v_opponent_pts > v_challenger_pts THEN
    v_winner_id := v_ch.opponent_id;
    v_loser_id  := v_ch.challenger_id;
  ELSE
    v_is_tie := true;
  END IF;

  -- Coin math
  v_total_pot := v_ch.stake_coins * 2;
  v_rake      := FLOOR(v_total_pot * 0.05);
  v_prize     := v_total_pot - v_rake;  -- winner's total payout (or each party gets stake back on tie)

  IF v_is_tie THEN
    -- Each player's own stake goes back to their own balance — release_escrow()
    -- already logs its own 'refund' transaction, so nothing further to credit.
    PERFORM release_escrow(v_ch.challenger_id, v_ch.stake_coins, p_challenge_id,
      jsonb_build_object('reason', 'challenge_tie'));
    PERFORM release_escrow(v_ch.opponent_id, v_ch.stake_coins, p_challenge_id,
      jsonb_build_object('reason', 'challenge_tie'));
  ELSE
    -- Winner: their own escrowed stake is unlocked back to their balance...
    PERFORM release_escrow(v_winner_id, v_ch.stake_coins, p_challenge_id,
      jsonb_build_object('reason', 'challenge_resolved'));
    -- ...then the net winnings (loser's stake minus rake) are credited on top,
    -- so the winner's total gain is stake*2 - rake, sourced from the loser.
    PERFORM credit_coins(v_winner_id, v_prize - v_ch.stake_coins, 'win', p_challenge_id,
      jsonb_build_object(
        'reason',        'challenge_won',
        'stake',         v_ch.stake_coins,
        'prize',         v_prize,
        'rake',          v_rake,
        'opponent_pts',  CASE WHEN v_winner_id = v_ch.challenger_id THEN v_opponent_pts ELSE v_challenger_pts END,
        'winner_pts',    CASE WHEN v_winner_id = v_ch.challenger_id THEN v_challenger_pts ELSE v_opponent_pts END
      ));

    -- Loser: stake is forfeited — decrement escrow directly (never released back
    -- to their balance), then log an audit-only transaction. Not routed through
    -- credit_coins(): it rejects non-positive amounts, and this is not a credit.
    SELECT escrow INTO v_loser_escrow FROM coin_wallets WHERE user_id = v_loser_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'WALLET_NOT_FOUND'; END IF;
    IF v_loser_escrow < v_ch.stake_coins THEN RAISE EXCEPTION 'INSUFFICIENT_ESCROW'; END IF;

    UPDATE coin_wallets
    SET escrow     = escrow - v_ch.stake_coins,
        updated_at = now()
    WHERE user_id = v_loser_id;

    INSERT INTO coin_transactions (user_id, type, amount, challenge_id, meta)
    VALUES (v_loser_id, 'loss', v_ch.stake_coins, p_challenge_id,
      jsonb_build_object('reason', 'challenge_lost', 'stake_lost', v_ch.stake_coins));
  END IF;

  -- Update challenge row
  UPDATE p2p_challenges SET
    status          = 'resolved',
    winner_id       = v_winner_id,  -- NULL on tie
    challenger_pts  = v_challenger_pts,
    opponent_pts    = v_opponent_pts,
    resolved_at     = now(),
    updated_at      = now()
  WHERE id = p_challenge_id;

  -- Write gazette entry (p2p_result) so it shows in league activity feed
  SELECT username INTO v_challenger_name FROM users WHERE id = v_ch.challenger_id;
  SELECT username INTO v_opponent_name   FROM users WHERE id = v_ch.opponent_id;

  INSERT INTO gazette_entries (league_id, entry_type, headline, bullets, full_data, published_at)
  VALUES (
    v_ch.league_id,
    'p2p_result',
    CASE
      WHEN v_is_tie THEN
        v_challenger_name || ' vs ' || v_opponent_name || ' — ' ||
        'DRAW · ' || v_ch.stake_coins || ' coins each returned'
      ELSE
        (CASE WHEN v_winner_id = v_ch.challenger_id THEN v_challenger_name ELSE v_opponent_name END) ||
        ' beat ' ||
        (CASE WHEN v_winner_id = v_ch.challenger_id THEN v_opponent_name ELSE v_challenger_name END) ||
        ' — ' || v_prize || ' coins won'
    END,
    jsonb_build_array(
      v_challenger_name || ' · ' || v_challenger_pts || ' pts',
      v_opponent_name   || ' · ' || v_opponent_pts   || ' pts',
      'GW: ' || v_ch.matchday_id || ' · Stake: ' || v_ch.stake_coins || ' coins'
    ),
    jsonb_build_object(
      'challenge_id',    p_challenge_id,
      'matchday_id',     v_ch.matchday_id,
      'is_tie',          v_is_tie,
      'winner_id',       v_winner_id,
      'prize',           v_prize,
      'rake',            v_rake
    ),
    now()
  );

  RETURN jsonb_build_object(
    'status',          'resolved',
    'is_tie',          v_is_tie,
    'winner_id',       v_winner_id,
    'challenger_pts',  v_challenger_pts,
    'opponent_pts',    v_opponent_pts,
    'prize',           v_prize,
    'rake',            v_rake
  );
END;
$$;


ALTER FUNCTION "public"."resolve_p2p_challenge"("p_challenge_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."restore_cup_club"("p_league_id" "uuid", "p_club_id" "text") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  UPDATE cup_active_clubs
  SET    eliminated_at = NULL
  WHERE  league_id = p_league_id AND club_id = p_club_id;
END;
$$;


ALTER FUNCTION "public"."restore_cup_club"("p_league_id" "uuid", "p_club_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sanitize_starting_xi"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.starting_xi IS NOT NULL AND array_length(NEW.starting_xi, 1) > 0 THEN
    SELECT COALESCE(array_agg(x), ARRAY[]::text[])
      INTO NEW.starting_xi
      FROM unnest(NEW.starting_xi) AS x
      WHERE x = ANY(COALESCE(NEW.players, ARRAY[]::text[]));
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sanitize_starting_xi"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."search_clubhouses"("p_query" "text") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('error', 'UNAUTHENTICATED');
  END IF;

  IF length(trim(p_query)) < 2 THEN
    RETURN json_build_object('error', 'QUERY_TOO_SHORT');
  END IF;

  RETURN COALESCE(
    (
      SELECT json_agg(json_build_object(
        'id',             c.id,
        'name',           c.name,
        'invite_code',    c.invite_code,
        'member_count',   (SELECT COUNT(*) FROM circle_members cm WHERE cm.circle_id = c.id),
        'already_member', EXISTS (
          SELECT 1 FROM circle_members cm2
          WHERE cm2.circle_id = c.id AND cm2.user_id = auth.uid()
        )
      ) ORDER BY c.name)
      FROM circles c
      WHERE c.is_public = true
        AND c.name ILIKE '%' || trim(p_query) || '%'
      LIMIT 20
    ),
    '[]'::json
  );
END;
$$;


ALTER FUNCTION "public"."search_clubhouses"("p_query" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."seed_cup_clubs"("p_league_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_tournament_id text;
BEGIN
  SELECT tournament_id INTO v_tournament_id FROM leagues WHERE id = p_league_id;
  INSERT INTO cup_active_clubs (league_id, club_id)
  SELECT DISTINCT p_league_id, club
  FROM   players
  WHERE  club IS NOT NULL AND club <> ''
    AND  (v_tournament_id IS NULL OR tournament_id = v_tournament_id)
  ON CONFLICT (league_id, club_id) DO NOTHING;
END;
$$;


ALTER FUNCTION "public"."seed_cup_clubs"("p_league_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."seed_cup_clubs"("p_league_id" "uuid", "p_tournament_id" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  INSERT INTO cup_active_clubs (league_id, club_id)
  SELECT DISTINCT p_league_id, club
  FROM   players
  WHERE  club IS NOT NULL AND club <> ''
  AND    (p_tournament_id IS NULL OR tournament_id = p_tournament_id)
  ON CONFLICT (league_id, club_id) DO NOTHING;
END;
$$;


ALTER FUNCTION "public"."seed_cup_clubs"("p_league_id" "uuid", "p_tournament_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sell_now"("p_listing_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_listing auction_listings;
BEGIN
  SELECT * INTO v_listing FROM auction_listings WHERE id = p_listing_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Listing not found.');
  END IF;

  IF v_listing.status <> 'open' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Auction is not open.');
  END IF;

  -- Caller must own the seller squad
  IF NOT EXISTS (
    SELECT 1 FROM squads WHERE id = v_listing.seller_id AND user_id = auth.uid()
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authorised — you are not the seller.');
  END IF;

  IF v_listing.highest_bidder_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No bids yet — nothing to sell.');
  END IF;

  RETURN public.resolve_auction_listing(p_listing_id);
END;
$$;


ALTER FUNCTION "public"."sell_now"("p_listing_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_captain"("p_squad_id" "uuid", "p_player_id" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $_$
DECLARE
  v_squad          squads;
  v_matchday_id    text;
  v_round_number   int;
  v_tournament_id  text;
  v_fixture_status text;
  v_is_triple      boolean;
  v_mult           int;
  v_new_total      numeric;
  v_old_total      numeric;
  v_old_captain_id text;
BEGIN
  SELECT * INTO v_squad FROM squads WHERE id = p_squad_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Squad not found');
  END IF;

  IF auth.uid() IS NOT NULL AND v_squad.user_id IS DISTINCT FROM auth.uid() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not your squad');
  END IF;

  v_old_captain_id := v_squad.captain_id;

  SELECT tournament_id INTO v_tournament_id
  FROM leagues WHERE id = v_squad.league_id;

  SELECT COALESCE(
    (SELECT f.round_number
     FROM fixtures f
     WHERE f.tournament_id = v_tournament_id
       AND f.status IN ('scheduled', 'live')
     ORDER BY f.round_number ASC
     LIMIT 1),
    (regexp_match(v_squad.matchday_id, '-r(\d+)$'))[1]::int
  ) INTO v_round_number;

  SELECT f.status INTO v_fixture_status
  FROM fixtures f
  JOIN players pl ON (
    pl.forza_team_id = f.home_team_forza_id
    OR pl.forza_team_id = f.away_team_forza_id
  )
  WHERE pl.id = p_player_id
    AND f.round_number  = v_round_number
    AND f.tournament_id = v_tournament_id
  LIMIT 1;

  IF v_fixture_status IN ('live', 'finished') THEN
    RETURN jsonb_build_object(
      'ok',   false,
      'code', 'FIXTURE_STARTED',
      'error', 'Cannot make this player captain — their match has already started or finished this round'
    );
  END IF;

  UPDATE squads SET captain_id = p_player_id WHERE id = p_squad_id;

  v_matchday_id := v_tournament_id || '-r' || v_round_number;

  SELECT EXISTS (
    SELECT 1 FROM chips_used
    WHERE user_id     = v_squad.user_id
      AND league_id   = v_squad.league_id
      AND chip_type   = 'triple_captain'
      AND matchday_id = v_matchday_id
  ) INTO v_is_triple;

  v_mult := CASE WHEN v_is_triple THEN 3 ELSE 2 END;

  -- Capture old total before recompute
  SELECT COALESCE(total, 0) INTO v_old_total
  FROM fantasy_points
  WHERE squad_id    = p_squad_id
    AND matchday_id = v_matchday_id
    AND player_id IS NULL;

  SELECT COALESCE(SUM(
    ROUND(per_player.player_total) * (CASE WHEN per_player.pid = p_player_id THEN v_mult ELSE 1 END)
  ), 0)
  INTO v_new_total
  FROM (
    SELECT pms.player_id AS pid, SUM(pms.fantasy_points) AS player_total
    FROM player_match_stats pms
    JOIN fixtures f ON f.id = pms.fixture_id
    WHERE pms.player_id = ANY(v_squad.starting_xi)
      AND f.tournament_id = v_tournament_id
      AND f.round_number  = v_round_number
    GROUP BY pms.player_id
  ) per_player;

  UPDATE fantasy_points
  SET total = v_new_total
  WHERE squad_id    = p_squad_id
    AND matchday_id = v_matchday_id
    AND player_id IS NULL;

  PERFORM aggregate_league_member_points(v_squad.league_id, v_squad.user_id);

  PERFORM _log_squad_event('captain_change', v_squad.league_id, v_squad.user_id, p_squad_id, v_matchday_id,
    p_player_id, v_old_captain_id,
    jsonb_build_object('delta_pts', v_new_total - v_old_total));

  RETURN jsonb_build_object('ok', true, 'captain_id', p_player_id);
END;
$_$;


ALTER FUNCTION "public"."set_captain"("p_squad_id" "uuid", "p_player_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_lineup"("p_squad_id" "uuid", "p_player_out" "text", "p_player_in" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $_$
DECLARE
  v_squad          squads;
  v_matchday_id    text;
  v_round_number   int;
  v_tournament_id  text;
  v_lock_array     text[];
  v_new_xi         text[];
  v_pin_status     text;
  v_pout_status    text;
  v_is_triple      boolean;
  v_mult           int;
  v_old_total      numeric;
  v_new_total      numeric;
  v_deduction      numeric := 0;
  v_gk_count       int;
  v_def_count      int;
  v_mid_count      int;
  v_fwd_count      int;
BEGIN
  SELECT * INTO v_squad FROM squads WHERE id = p_squad_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Squad not found');
  END IF;

  IF auth.uid() IS NOT NULL AND v_squad.user_id IS DISTINCT FROM auth.uid() THEN
    RETURN jsonb_build_object('ok', false, 'code', 'UNAUTHORIZED', 'error', 'Not your squad');
  END IF;

  SELECT tournament_id INTO v_tournament_id
  FROM leagues WHERE id = v_squad.league_id;

  SELECT COALESCE(
    (SELECT f.round_number
     FROM fixtures f
     WHERE f.tournament_id = v_tournament_id
       AND f.status IN ('scheduled', 'live')
     ORDER BY f.round_number ASC
     LIMIT 1),
    (regexp_match(v_squad.matchday_id, '-r(\d+)$'))[1]::int
  ) INTO v_round_number;

  v_matchday_id := v_tournament_id || '-r' || v_round_number::text;
  IF NOT EXISTS (
    SELECT 1 FROM matchday_deadlines
    WHERE tournament_id = v_tournament_id AND matchday_id = v_matchday_id
  ) THEN
    v_matchday_id  := v_squad.matchday_id;
    v_round_number := (regexp_match(v_matchday_id, '-r(\d+)$'))[1]::int;
  END IF;

  IF array_length(v_squad.starting_xi, 1) IS NULL OR array_length(v_squad.starting_xi, 1) = 0 THEN
    SELECT ARRAY_AGG(id) INTO v_squad.starting_xi
    FROM (
      SELECT id FROM players
      WHERE id = ANY(v_squad.players)
      ORDER BY (position = 'GK') DESC, array_position(v_squad.players, id)
      LIMIT 11
    ) sub;
    UPDATE squads SET starting_xi = v_squad.starting_xi WHERE id = p_squad_id;
  END IF;

  v_lock_array := ARRAY(
    SELECT jsonb_array_elements_text(
      COALESCE(v_squad.lineup_locks -> v_matchday_id, '[]'::jsonb)
    )
  );

  IF NOT (v_squad.players @> ARRAY[p_player_in]) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Player not in your squad');
  END IF;

  IF p_player_in = ANY(v_lock_array) THEN
    RETURN jsonb_build_object(
      'ok',   false,
      'code', 'PLAYER_LOCKED',
      'error', 'This player was already subbed out this round and cannot return until next matchday'
    );
  END IF;

  IF p_player_in = ANY(v_squad.starting_xi) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Player is already in the starting XI');
  END IF;

  IF NOT (p_player_out = ANY(v_squad.starting_xi)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Player to move to bench is not in the starting XI');
  END IF;

  SELECT f.status INTO v_pin_status
  FROM fixtures f
  JOIN players pl ON (
    pl.forza_team_id = f.home_team_forza_id
    OR pl.forza_team_id = f.away_team_forza_id
  )
  WHERE pl.id = p_player_in
    AND f.round_number  = v_round_number
    AND f.tournament_id = v_tournament_id
  LIMIT 1;

  IF v_pin_status IN ('live', 'finished') THEN
    RETURN jsonb_build_object(
      'ok',   false,
      'code', 'FIXTURE_COMPLETED',
      'error', 'Cannot sub in a player whose fixture has started or finished this round'
    );
  END IF;

  SELECT ARRAY_AGG(CASE WHEN x = p_player_out THEN p_player_in ELSE x END ORDER BY ord)
    INTO v_new_xi
    FROM unnest(v_squad.starting_xi) WITH ORDINALITY AS t(x, ord);

  SELECT
    COUNT(*) FILTER (WHERE position = 'GK'),
    COUNT(*) FILTER (WHERE position = 'DEF'),
    COUNT(*) FILTER (WHERE position = 'MID'),
    COUNT(*) FILTER (WHERE position = 'FWD')
  INTO v_gk_count, v_def_count, v_mid_count, v_fwd_count
  FROM players
  WHERE id = ANY(v_new_xi);

  IF v_gk_count != 1 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Starting XI must include exactly 1 goalkeeper (got ' || v_gk_count || ')');
  END IF;
  IF v_def_count < 1 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Starting XI must have at least 1 defender');
  END IF;
  IF v_mid_count < 1 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Starting XI must have at least 1 midfielder');
  END IF;
  IF v_fwd_count < 1 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Starting XI must have at least 1 forward');
  END IF;

  SELECT f.status INTO v_pout_status
  FROM fixtures f
  JOIN players pl ON (
    pl.forza_team_id = f.home_team_forza_id
    OR pl.forza_team_id = f.away_team_forza_id
  )
  WHERE pl.id = p_player_out
    AND f.round_number  = v_round_number
    AND f.tournament_id = v_tournament_id
  LIMIT 1;

  SELECT EXISTS (
    SELECT 1 FROM chips_used
    WHERE user_id     = v_squad.user_id
      AND league_id   = v_squad.league_id
      AND chip_type   = 'triple_captain'
      AND matchday_id = v_matchday_id
  ) INTO v_is_triple;

  v_mult := CASE WHEN v_is_triple THEN 3 ELSE 2 END;

  SELECT COALESCE(SUM(
    ROUND(per_player.player_total) * (CASE WHEN per_player.pid = v_squad.captain_id THEN v_mult ELSE 1 END)
  ), 0)
  INTO v_new_total
  FROM (
    SELECT pms.player_id AS pid, SUM(pms.fantasy_points) AS player_total
    FROM player_match_stats pms
    JOIN fixtures f ON f.id = pms.fixture_id
    WHERE pms.player_id = ANY(v_new_xi)
      AND f.tournament_id = v_tournament_id
      AND f.round_number  = v_round_number
    GROUP BY pms.player_id
  ) per_player;

  SELECT total INTO v_old_total
  FROM fantasy_points
  WHERE squad_id    = p_squad_id
    AND matchday_id = v_matchday_id
    AND player_id IS NULL;

  IF v_old_total IS NOT NULL THEN
    v_deduction := GREATEST(v_old_total - v_new_total, 0);

    UPDATE fantasy_points
       SET total = v_new_total
     WHERE squad_id    = p_squad_id
       AND matchday_id = v_matchday_id
       AND player_id IS NULL;
  END IF;

  UPDATE squads
  SET
    starting_xi  = v_new_xi,
    lineup_locks = CASE
      WHEN v_pout_status IN ('live', 'finished') THEN
        jsonb_set(
          COALESCE(lineup_locks, '{}'::jsonb),
          ARRAY[v_matchday_id],
          (
            SELECT jsonb_agg(DISTINCT val)
            FROM (
              SELECT jsonb_array_elements_text(
                COALESCE(lineup_locks -> v_matchday_id, '[]'::jsonb)
              ) AS val
              UNION ALL
              SELECT p_player_out
            ) t
          )
        )
      ELSE
        COALESCE(lineup_locks, '{}'::jsonb)
    END
  WHERE id = p_squad_id;

  PERFORM aggregate_league_member_points(v_squad.league_id, v_squad.user_id);

  PERFORM _log_squad_event('lineup_swap', v_squad.league_id, v_squad.user_id, p_squad_id, v_matchday_id,
    p_player_in, p_player_out,
    jsonb_build_object('deduction_pts', v_deduction));

  RETURN jsonb_build_object(
    'ok',         true,
    'starting_xi', to_jsonb(v_new_xi),
    'deduction',   v_deduction,
    'locked',      (v_pout_status IN ('live', 'finished'))
  );
END;
$_$;


ALTER FUNCTION "public"."set_lineup"("p_squad_id" "uuid", "p_player_out" "text", "p_player_in" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_tennis_qf_captain"("p_tournament_id" "uuid", "p_captain_player_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
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


ALTER FUNCTION "public"."set_tennis_qf_captain"("p_tournament_id" "uuid", "p_captain_player_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."snapshot_squads_for_matchday"("p_matchday_id" "text", "p_reason" "text" DEFAULT 'fixture_live'::"text") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_tournament_id text;
  v_inserted      int;
BEGIN
  -- Derive tournament_id from matchday_id format '{tournament_id}-r{N}'
  v_tournament_id := split_part(p_matchday_id, '-r', 1);
  IF v_tournament_id = p_matchday_id OR v_tournament_id = '' THEN
    -- matchday_id does not follow the expected format; skip silently
    RETURN 0;
  END IF;

  -- Insert one snapshot row per (league, user), preferring the most recently
  -- created squad row when multiple exist (edge case: multiple squad rows).
  -- ON CONFLICT DO NOTHING: the first fixture kickoff locks the snapshot;
  -- subsequent fixtures in the same round do not overwrite it.
  WITH ranked_squads AS (
    SELECT DISTINCT ON (s.league_id, s.user_id)
      s.league_id,
      s.user_id,
      s.id                                                               AS squad_id,
      COALESCE(NULLIF(s.starting_xi, ARRAY[]::text[]),
               (s.players)[1:11],
               ARRAY[]::text[])                                          AS starting_xi,
      COALESCE(s.players, ARRAY[]::text[])                               AS players,
      s.captain_id
    FROM squads     s
    JOIN leagues    l ON l.id = s.league_id
    WHERE l.tournament_id = v_tournament_id
    ORDER BY s.league_id, s.user_id, s.created_at DESC
  )
  INSERT INTO squad_matchday_snapshots
    (league_id, user_id, matchday_id, squad_id, starting_xi, players, captain_id, snapshot_reason)
  SELECT
    rs.league_id,
    rs.user_id,
    p_matchday_id,
    rs.squad_id,
    rs.starting_xi,
    rs.players,
    rs.captain_id,
    p_reason
  FROM ranked_squads rs
  ON CONFLICT (league_id, user_id, matchday_id) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$;


ALTER FUNCTION "public"."snapshot_squads_for_matchday"("p_matchday_id" "text", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."submit_atp_finals_group_picks"("p_season_year" integer, "p_picks" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
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


ALTER FUNCTION "public"."submit_atp_finals_group_picks"("p_season_year" integer, "p_picks" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."submit_atp_finals_knockout_picks"("p_season_year" integer, "p_picks" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
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


ALTER FUNCTION "public"."submit_atp_finals_knockout_picks"("p_season_year" integer, "p_picks" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."submit_bet"("p_squad_id" "uuid", "p_instance_id" "uuid", "p_answer" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_status   TEXT;
  v_deadline TIMESTAMPTZ;
BEGIN
  -- Caller must own the squad they're submitting for
  IF NOT EXISTS (
    SELECT 1 FROM squads WHERE id = p_squad_id AND user_id = auth.uid()
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'UNAUTHORIZED');
  END IF;

  SELECT status, deadline_at INTO v_status, v_deadline
    FROM bet_instances WHERE id = p_instance_id;

  IF v_status IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'BET_NOT_FOUND');
  END IF;

  IF v_status NOT IN ('open') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'BET_CLOSED');
  END IF;

  IF v_deadline IS NOT NULL AND NOW() > v_deadline THEN
    RETURN jsonb_build_object('ok', false, 'error', 'DEADLINE_PASSED');
  END IF;

  INSERT INTO bet_submissions (squad_id, bet_instance_id, user_id, answer, is_correct, reward_awarded)
  VALUES (p_squad_id, p_instance_id, auth.uid(), p_answer, NULL, NULL)
  ON CONFLICT (squad_id, bet_instance_id)
  DO UPDATE SET
    answer         = EXCLUDED.answer,
    submitted_at   = NOW(),
    is_correct     = NULL,
    reward_awarded = NULL;

  RETURN jsonb_build_object('ok', true);
END;
$$;


ALTER FUNCTION "public"."submit_bet"("p_squad_id" "uuid", "p_instance_id" "uuid", "p_answer" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."submit_knockout_keeps"("p_league_id" "uuid", "p_player_ids" "text"[]) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_user          uuid := auth.uid();
  v_cup_phase     text;
  v_format        text;
  v_league_mode   text;
  v_tournament    text;
  v_max_slots     int  := 5;   -- default; override via league_config 'knockout_keep_slots'
  v_squad_players text[];
  v_elim_clubs    text[];
  pid             text;
  v_player        players%ROWTYPE;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;

  -- League membership + league metadata
  IF NOT EXISTS (
    SELECT 1 FROM league_members WHERE league_id = p_league_id AND user_id = v_user
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not a league member');
  END IF;

  SELECT format, league_mode, cup_phase, tournament_id
    INTO v_format, v_league_mode, v_cup_phase, v_tournament
    FROM leagues WHERE id = p_league_id;

  -- Feature only applies to cup + draft leagues
  IF v_format NOT IN ('cup', 'noduplicate') OR v_league_mode NOT IN ('draft', 'noduplicate') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Keep submissions only available in cup draft leagues');
  END IF;

  -- Guard: only open during the group stage (after group lottery, before knockout lottery).
  -- This is the key isolation guard — prevents the banner from appearing or accepting
  -- submissions during the group-stage draft selection period.
  IF v_cup_phase IS DISTINCT FROM 'group_stage' THEN
    RETURN jsonb_build_object(
      'ok',    false,
      'code',  'WRONG_PHASE',
      'error', 'Keep submissions are only open after the group draft has run and before the knockout draft'
    );
  END IF;

  -- Read per-league slot limit from config (falls back to 5)
  SELECT (config_value #>> '{}')::int INTO v_max_slots
    FROM league_config
   WHERE league_id = p_league_id AND config_key = 'knockout_keep_slots';
  IF v_max_slots IS NULL THEN v_max_slots := 5; END IF;

  -- Count check
  IF array_length(p_player_ids, 1) > v_max_slots THEN
    RETURN jsonb_build_object(
      'ok',    false,
      'code',  'TOO_MANY_KEEPS',
      'error', 'Maximum ' || v_max_slots || ' players can be protected'
    );
  END IF;

  -- Manager's current squad (most recent squad row for this league)
  SELECT players INTO v_squad_players
    FROM squads
   WHERE league_id = p_league_id AND user_id = v_user
   ORDER BY created_at DESC LIMIT 1;

  IF v_squad_players IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No squad found for this league');
  END IF;

  -- Eliminated clubs (cannot keep a player from a knocked-out club)
  SELECT ARRAY_AGG(club_id) INTO v_elim_clubs
    FROM cup_active_clubs
   WHERE league_id = p_league_id AND eliminated_at IS NOT NULL;

  -- Validate each player
  FOREACH pid IN ARRAY COALESCE(p_player_ids, ARRAY[]::text[]) LOOP
    -- Must be in the manager's squad
    IF NOT (v_squad_players @> ARRAY[pid]) THEN
      RETURN jsonb_build_object(
        'ok',    false,
        'code',  'NOT_IN_SQUAD',
        'error', 'Player ' || pid || ' is not in your squad'
      );
    END IF;

    -- Must be from an active (non-eliminated) club
    SELECT * INTO v_player FROM players WHERE id = pid;
    IF v_player.forza_team_id IS NOT NULL
       AND v_elim_clubs IS NOT NULL
       AND v_player.forza_team_id = ANY(v_elim_clubs) THEN
      RETURN jsonb_build_object(
        'ok',    false,
        'code',  'CLUB_ELIMINATED',
        'error', 'Cannot protect ' || COALESCE(v_player.name, pid) || ' — their club has been eliminated'
      );
    END IF;
  END LOOP;

  -- Upsert — managers can revise their list until the commissioner runs the knockout draft
  INSERT INTO knockout_keep_submissions (league_id, user_id, player_ids, submitted_at)
  VALUES (p_league_id, v_user, COALESCE(p_player_ids, ARRAY[]::text[]), NOW())
  ON CONFLICT (league_id, user_id) DO UPDATE
    SET player_ids   = EXCLUDED.player_ids,
        submitted_at = EXCLUDED.submitted_at;

  RETURN jsonb_build_object(
    'ok',         true,
    'kept_count', COALESCE(array_length(p_player_ids, 1), 0),
    'max_slots',  v_max_slots
  );
END;
$$;


ALTER FUNCTION "public"."submit_knockout_keeps"("p_league_id" "uuid", "p_player_ids" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."submit_tennis_roster"("p_tournament_id" "uuid", "p_tier1" "uuid", "p_tier2a" "uuid", "p_tier2b" "uuid", "p_tier3a" "uuid", "p_tier3b" "uuid", "p_tier4a" "uuid", "p_tier4b" "uuid", "p_ace_card" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
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


ALTER FUNCTION "public"."submit_tennis_roster"("p_tournament_id" "uuid", "p_tier1" "uuid", "p_tier2a" "uuid", "p_tier2b" "uuid", "p_tier3a" "uuid", "p_tier3b" "uuid", "p_tier4a" "uuid", "p_tier4b" "uuid", "p_ace_card" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."submit_trade_proposal"("p_league_id" "uuid", "p_proposer_squad_id" "uuid", "p_target_squad_id" "uuid", "p_proposer_player_id" "text", "p_target_player_id" "text", "p_cash_sweetener" numeric DEFAULT 0, "p_points_sweetener" integer DEFAULT 0) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_proposer_user_id  UUID;
  v_proposer_players  TEXT[];
  v_target_players    TEXT[];
  v_proposer_budget   NUMERIC;
  v_proposer_points   NUMERIC;
  v_new_proposal_id   UUID;
  v_proposer_position TEXT;
  v_target_position   TEXT;
BEGIN
  SELECT user_id, players, budget_remaining
    INTO v_proposer_user_id, v_proposer_players, v_proposer_budget
    FROM squads WHERE id = p_proposer_squad_id AND league_id = p_league_id;

  IF v_proposer_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'SQUAD_NOT_FOUND');
  END IF;

  IF v_proposer_user_id <> auth.uid() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NOT_YOUR_SQUAD');
  END IF;

  SELECT players INTO v_target_players
    FROM squads WHERE id = p_target_squad_id AND league_id = p_league_id;

  IF v_target_players IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'TARGET_SQUAD_NOT_FOUND');
  END IF;

  IF NOT (p_proposer_player_id = ANY(v_proposer_players)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'PROPOSER_PLAYER_NOT_IN_SQUAD');
  END IF;

  IF NOT (p_target_player_id = ANY(v_target_players)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'TARGET_PLAYER_NOT_IN_SQUAD');
  END IF;

  SELECT position INTO v_proposer_position FROM players WHERE id = p_proposer_player_id;
  SELECT position INTO v_target_position   FROM players WHERE id = p_target_player_id;
  IF v_proposer_position IS DISTINCT FROM v_target_position THEN
    RETURN jsonb_build_object('ok', false, 'error', 'POSITION_MISMATCH');
  END IF;

  IF p_cash_sweetener < 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INVALID_SWEETENER');
  END IF;

  IF p_cash_sweetener > 0 AND v_proposer_budget < p_cash_sweetener THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INSUFFICIENT_BUDGET');
  END IF;

  IF p_points_sweetener > 0 THEN
    SELECT total_points INTO v_proposer_points
      FROM league_members WHERE league_id = p_league_id AND user_id = auth.uid();
    IF v_proposer_points < p_points_sweetener THEN
      RETURN jsonb_build_object('ok', false, 'error', 'INSUFFICIENT_POINTS');
    END IF;
  END IF;

  INSERT INTO trade_proposals (
    league_id, proposer_squad_id, target_squad_id,
    proposer_player_id, target_player_id,
    cash_sweetener, points_sweetener
  ) VALUES (
    p_league_id, p_proposer_squad_id, p_target_squad_id,
    p_proposer_player_id, p_target_player_id,
    p_cash_sweetener, p_points_sweetener
  ) RETURNING id INTO v_new_proposal_id;

  INSERT INTO league_notifications (
    league_id, user_id, notification_type,
    triggered_by_user_id, title, description,
    related_entity_id, related_entity_type
  )
  SELECT
    p_league_id, s.user_id, 'trade_proposal', auth.uid(),
    'New Trade Offer',
    (SELECT name FROM players WHERE id = p_proposer_player_id)
      || ' for '
      || (SELECT name FROM players WHERE id = p_target_player_id),
    v_new_proposal_id, 'trade_proposal'
  FROM squads s WHERE s.id = p_target_squad_id;

  PERFORM _log_squad_event('trade_propose', p_league_id, auth.uid(), p_proposer_squad_id, NULL,
    p_target_player_id, p_proposer_player_id,
    jsonb_build_object('proposal_id', v_new_proposal_id,
                       'cash_sweetener', p_cash_sweetener,
                       'points_sweetener', p_points_sweetener));

  RETURN jsonb_build_object('ok', true);
END;
$$;


ALTER FUNCTION "public"."submit_trade_proposal"("p_league_id" "uuid", "p_proposer_squad_id" "uuid", "p_target_squad_id" "uuid", "p_proposer_player_id" "text", "p_target_player_id" "text", "p_cash_sweetener" numeric, "p_points_sweetener" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sweep_void_auction_confirmations"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_cancelled INT;
BEGIN
  WITH voided AS (
    UPDATE auction_listings al
    SET status = 'cancelled', updated_at = NOW()
    WHERE al.status = 'pending_confirmation'
      -- Window is currently CLOSED for this league — buyer has no open opportunity
      AND (get_transfer_window_status(al.league_id) ->> 'status') <> 'open'
      AND (
        -- Matchday-type: a deadline that opened after the win has since passed
        EXISTS (
          SELECT 1
          FROM matchday_deadlines md
          JOIN leagues l ON l.id = al.league_id AND l.tournament_id = md.tournament_id
          WHERE md.deadline_at > al.won_at
            AND md.deadline_at < NOW()
        )
        OR
        -- Explicit transfer window: a window that was open after the win has since closed
        EXISTS (
          SELECT 1 FROM transfer_windows tw
          WHERE tw.league_id = al.league_id
            AND tw.closes_at > al.won_at
            AND tw.closes_at < NOW()
        )
      )
    RETURNING id
  )
  SELECT COUNT(*) INTO v_cancelled FROM voided;

  RETURN v_cancelled;
END;
$$;


ALTER FUNCTION "public"."sweep_void_auction_confirmations"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_all_active_tournaments"() RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  t          RECORD;
  base_url   TEXT;
  auth_hdr   JSONB;
  body_text  TEXT;
BEGIN
  base_url := current_setting('app.supabase_url');
  auth_hdr := jsonb_build_object(
    'Content-Type',  'application/json',
    'Authorization', 'Bearer ' || current_setting('app.service_role_key')
  );

  FOR t IN SELECT forza_id FROM tournaments WHERE sync_enabled = true LOOP
    body_text := '{"forza_id":"' || t.forza_id || '"}';

    -- Sync player availability (injuries, suspensions)
    PERFORM net.http_post(
      url     := base_url || '/functions/v1/sync-player-status',
      headers := auth_hdr,
      body    := body_text
    );

    -- Sync player master data (squads, valuations)
    PERFORM net.http_post(
      url     := base_url || '/functions/v1/sync-players',
      headers := auth_hdr,
      body    := body_text
    );

    -- Sync fixtures and matchday deadlines
    PERFORM net.http_post(
      url     := base_url || '/functions/v1/sync-fixtures',
      headers := auth_hdr,
      body    := body_text
    );
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."sync_all_active_tournaments"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_cup_eliminations"("p_league_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_tournament_id     TEXT;
  v_active_count      INT;
  v_clubs_with_future INT;
  v_eliminated_count  INT := 0;
  rec                 RECORD;
  v_future_count      INT;
  v_last_result       RECORD;
  v_last_matchday_id  TEXT;
  v_pending_in_matchday INT;
  v_club_shootout     INT;
  v_opp_shootout      INT;
BEGIN
  SELECT tournament_id INTO v_tournament_id FROM leagues WHERE id = p_league_id;

  -- Self-heal: reinstate any club already marked eliminated that now has a real
  -- future fixture (catches the race where sync ran before Forza published next round).
  UPDATE cup_active_clubs cac
  SET eliminated_at = NULL
  WHERE cac.league_id = p_league_id
    AND cac.eliminated_at IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM fixtures f
       WHERE (f.home_team = cac.club_id OR f.away_team = cac.club_id
           OR f.home_team_forza_id::text = cac.club_id
           OR f.away_team_forza_id::text = cac.club_id)
         AND f.status != 'finished'
         AND f.kickoff_at > NOW()
         AND (v_tournament_id IS NULL OR f.tournament_id = v_tournament_id)
    );

  SELECT COUNT(*) INTO v_active_count FROM cup_active_clubs WHERE league_id = p_league_id AND eliminated_at IS NULL;
  IF v_active_count = 0 THEN RETURN 0; END IF;

  SELECT COUNT(DISTINCT cac.club_id) INTO v_clubs_with_future
    FROM cup_active_clubs cac
   WHERE cac.league_id = p_league_id AND cac.eliminated_at IS NULL
     AND EXISTS (
       SELECT 1 FROM fixtures f
        WHERE (f.home_team = cac.club_id OR f.away_team = cac.club_id
            OR f.home_team_forza_id::text = cac.club_id
            OR f.away_team_forza_id::text = cac.club_id)
          AND f.status != 'finished'
          AND f.kickoff_at > NOW()
          AND (v_tournament_id IS NULL OR f.tournament_id = v_tournament_id)
     );
  IF v_clubs_with_future = 0 THEN RETURN 0; END IF;

  FOR rec IN SELECT cac.club_id FROM cup_active_clubs cac WHERE cac.league_id = p_league_id AND cac.eliminated_at IS NULL LOOP
    -- Count future fixtures for this club
    SELECT COUNT(*) INTO v_future_count FROM fixtures f
     WHERE (f.home_team = rec.club_id OR f.away_team = rec.club_id
         OR f.home_team_forza_id::text = rec.club_id
         OR f.away_team_forza_id::text = rec.club_id)
       AND f.status != 'finished'
       AND f.kickoff_at > NOW()
       AND (v_tournament_id IS NULL OR f.tournament_id = v_tournament_id);

    IF v_future_count = 0 THEN
      -- Find this club's last finished fixture
      SELECT f.home_team, f.away_team, f.home_score, f.away_score, f.matchday_id, f.id AS fixture_id
        INTO v_last_result
        FROM fixtures f
       WHERE (f.home_team = rec.club_id OR f.away_team = rec.club_id
           OR f.home_team_forza_id::text = rec.club_id
           OR f.away_team_forza_id::text = rec.club_id)
         AND f.status = 'finished'
         AND (v_tournament_id IS NULL OR f.tournament_id = v_tournament_id)
       ORDER BY f.kickoff_at DESC
       LIMIT 1;

      IF v_last_result IS NULL THEN CONTINUE; END IF;

      -- Guard: only eliminate once all other fixtures in the same matchday are also
      -- finished. This replaces the old 6h timer — once the round is completely
      -- settled, Forza has published the next round's bracket.
      v_last_matchday_id := v_last_result.matchday_id;
      IF v_last_matchday_id IS NOT NULL THEN
        SELECT COUNT(*) INTO v_pending_in_matchday
          FROM fixtures f
         WHERE f.matchday_id = v_last_matchday_id
           AND f.status != 'finished'
           AND (v_tournament_id IS NULL OR f.tournament_id = v_tournament_id);
        IF v_pending_in_matchday > 0 THEN CONTINUE; END IF;
      END IF;

      -- Check if this club LOST (clear loss: scores differ, club was on lower side)
      IF (v_last_result.home_team = rec.club_id AND v_last_result.home_score < v_last_result.away_score)
      OR (v_last_result.away_team = rec.club_id AND v_last_result.away_score < v_last_result.home_score)
      THEN
        PERFORM eliminate_cup_club(p_league_id, rec.club_id);
        v_eliminated_count := v_eliminated_count + 1;

      -- Check penalty-shootout loss: draw on the scoreboard, but shootout data shows
      -- one team scored more. player_match_stats.shootout_scored was added in migration 192.
      ELSIF v_last_result.home_score = v_last_result.away_score THEN
        -- Sum shootout_scored for club's players vs opponent's players in this fixture
        SELECT
          COALESCE(SUM(pms.shootout_scored) FILTER (WHERE p.nationality = rec.club_id OR p.club = rec.club_id), 0),
          COALESCE(SUM(pms.shootout_scored) FILTER (WHERE p.nationality != rec.club_id AND p.club != rec.club_id), 0)
        INTO v_club_shootout, v_opp_shootout
        FROM player_match_stats pms
        JOIN players p ON p.id = pms.player_id
        WHERE pms.fixture_id = v_last_result.fixture_id
          AND (v_tournament_id IS NULL OR p.tournament_id = v_tournament_id);

        -- Eliminate only if there was a shootout AND this club scored fewer
        IF v_opp_shootout > 0 AND v_club_shootout < v_opp_shootout THEN
          PERFORM eliminate_cup_club(p_league_id, rec.club_id);
          v_eliminated_count := v_eliminated_count + 1;
        END IF;
        -- If no shootout data (genuine draw / incomplete data), leave active
      END IF;
    END IF;
  END LOOP;

  RETURN v_eliminated_count;
END;
$$;


ALTER FUNCTION "public"."sync_cup_eliminations"("p_league_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_league_mode"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.league_mode := CASE
    WHEN NEW.format::text = 'noduplicate' THEN 'draft'
    ELSE 'classic'
  END;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sync_league_mode"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_squad_matchdays"() RETURNS "void"
    LANGUAGE "plpgsql"
    AS $_$
DECLARE
  v_tournament_id  text;
  v_active_round   int;
  v_active_md      text;
BEGIN
  FOR v_tournament_id IN
    SELECT DISTINCT tournament_id FROM leagues WHERE tournament_id IS NOT NULL
  LOOP
    -- Active round = lowest round with a fixture still scheduled or live.
    SELECT MIN(f.round_number) INTO v_active_round
    FROM fixtures f
    WHERE f.tournament_id = v_tournament_id
      AND f.status IN ('scheduled', 'live')
      AND f.round_number IS NOT NULL;

    -- Everything finished -> active round is the last one played.
    IF v_active_round IS NULL THEN
      SELECT MAX(f.round_number) INTO v_active_round
      FROM fixtures f
      WHERE f.tournament_id = v_tournament_id
        AND f.round_number IS NOT NULL;
    END IF;

    IF v_active_round IS NULL THEN
      CONTINUE;
    END IF;

    v_active_md := v_tournament_id || '-r' || v_active_round::text;

    -- Only advance squads to a matchday that's an actual configured round.
    IF NOT EXISTS (
      SELECT 1 FROM matchday_deadlines
      WHERE tournament_id = v_tournament_id AND matchday_id = v_active_md
    ) THEN
      CONTINUE;
    END IF;

    UPDATE squads s
    SET matchday_id = v_active_md
    FROM leagues l
    WHERE s.league_id = l.id
      AND l.tournament_id = v_tournament_id
      AND s.matchday_id ~ ('^' || v_tournament_id || '-r[0-9]+$')
      AND (regexp_match(s.matchday_id, '-r([0-9]+)$'))[1]::int < v_active_round;
  END LOOP;
END;
$_$;


ALTER FUNCTION "public"."sync_squad_matchdays"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."tg_recompute_ranks"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  PERFORM recompute_league_ranks(NEW.league_id);
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."tg_recompute_ranks"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_fn_snapshot_squads_on_kickoff"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF OLD.status = 'scheduled'
     AND NEW.status = 'live'
     AND NEW.matchday_id IS NOT NULL THEN
    PERFORM snapshot_squads_for_matchday(NEW.matchday_id, 'fixture_live');
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trg_fn_snapshot_squads_on_kickoff"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trigger_bet_reward_update"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_league_id UUID;
BEGIN
  -- Get league_id from bet_instance
  SELECT league_id INTO v_league_id
  FROM bet_instances
  WHERE id = NEW.bet_instance_id;

  -- Trigger aggregation for this user in this league
  PERFORM aggregate_league_member_points(v_league_id, NEW.user_id);

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trigger_bet_reward_update"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_circle_settings"("p_circle_id" "uuid", "p_name" "text" DEFAULT NULL::"text", "p_is_public" boolean DEFAULT NULL::boolean, "p_p2p_enabled" boolean DEFAULT NULL::boolean) RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RETURN json_build_object('error', 'UNAUTHENTICATED');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM circle_members
    WHERE circle_id = p_circle_id
      AND user_id   = v_user_id
      AND role      = 'owner'
  ) THEN
    RETURN json_build_object('error', 'NOT_OWNER');
  END IF;

  -- Only update columns whose parameter was supplied (non-NULL).
  UPDATE circles
  SET
    name               = COALESCE(NULLIF(trim(p_name), ''),   name),
    is_public          = COALESCE(p_is_public,                is_public),
    p2p_betting_enabled= COALESCE(p_p2p_enabled,             p2p_betting_enabled)
  WHERE id = p_circle_id;

  RETURN json_build_object('ok', true);
END;
$$;


ALTER FUNCTION "public"."update_circle_settings"("p_circle_id" "uuid", "p_name" "text", "p_is_public" boolean, "p_p2p_enabled" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_p2p_config"("p_league_id" "uuid", "p_min_stake" integer DEFAULT NULL::integer, "p_max_stake" integer DEFAULT NULL::integer, "p_daily_challenge_limit" integer DEFAULT NULL::integer, "p_challenges_enabled" boolean DEFAULT NULL::boolean) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_caller uuid := auth.uid();
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('error', 'UNAUTHORIZED');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM league_members
    WHERE league_id = p_league_id
      AND user_id   = v_caller
      AND role      = 'commissioner'
  ) THEN
    RETURN jsonb_build_object('error', 'NOT_COMMISSIONER');
  END IF;

  INSERT INTO p2p_config (
    league_id,
    min_stake,
    max_stake,
    daily_challenge_limit,
    challenges_enabled,
    updated_at
  ) VALUES (
    p_league_id,
    COALESCE(p_min_stake,             10),
    COALESCE(p_max_stake,             500),
    COALESCE(p_daily_challenge_limit, 5),
    COALESCE(p_challenges_enabled,    true),
    now()
  )
  ON CONFLICT (league_id) DO UPDATE SET
    min_stake             = COALESCE(p_min_stake,             p2p_config.min_stake),
    max_stake             = COALESCE(p_max_stake,             p2p_config.max_stake),
    daily_challenge_limit = COALESCE(p_daily_challenge_limit, p2p_config.daily_challenge_limit),
    challenges_enabled    = COALESCE(p_challenges_enabled,    p2p_config.challenges_enabled),
    updated_at            = now();

  RETURN get_p2p_config(p_league_id);
END;
$$;


ALTER FUNCTION "public"."update_p2p_config"("p_league_id" "uuid", "p_min_stake" integer, "p_max_stake" integer, "p_daily_challenge_limit" integer, "p_challenges_enabled" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."upsert_scoring_rules"("p_tournament_id" "text", "p_rules" "jsonb") RETURNS TABLE("tournament_id" "text", "rules_count" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
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
$$;


ALTER FUNCTION "public"."upsert_scoring_rules"("p_tournament_id" "text", "p_rules" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."void_bet"("p_instance_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_league_id   UUID;
  v_reward_type TEXT;
  v_status      TEXT;
  v_cleared     INT;
BEGIN
  SELECT league_id, reward_type, status INTO v_league_id, v_reward_type, v_status
    FROM bet_instances WHERE id = p_instance_id;
  IF v_league_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'BET_NOT_FOUND'); END IF;
  IF NOT EXISTS (
    SELECT 1 FROM league_members
     WHERE league_id = v_league_id AND user_id = auth.uid() AND role = 'commissioner'
  ) THEN RETURN jsonb_build_object('ok', false, 'error', 'UNAUTHORIZED'); END IF;
  -- DD-L5: reverse budget credits if already resolved as a budget-type bet.
  -- #11: floor at 0 so a spent reward can't create negative budget.
  IF v_status = 'resolved' AND v_reward_type = 'budget' THEN
    UPDATE squads s
       SET budget_remaining = GREATEST(budget_remaining - bs.reward_awarded, 0)
      FROM bet_submissions bs
     WHERE bs.bet_instance_id = p_instance_id
       AND bs.is_correct = true
       AND bs.reward_awarded IS NOT NULL
       AND s.id = bs.squad_id;
  END IF;
  UPDATE bet_submissions SET is_correct = false, reward_awarded = NULL WHERE bet_instance_id = p_instance_id;
  GET DIAGNOSTICS v_cleared = ROW_COUNT;
  UPDATE bet_instances SET status = 'cancelled' WHERE id = p_instance_id;
  RETURN jsonb_build_object('ok', true, 'submissions_cleared', v_cleared);
END;
$$;


ALTER FUNCTION "public"."void_bet"("p_instance_id" "uuid") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."auction_bids" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "listing_id" "uuid" NOT NULL,
    "league_id" "uuid" NOT NULL,
    "bidder_id" "uuid" NOT NULL,
    "amount" numeric(6,2) NOT NULL,
    "placed_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."auction_bids" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."auction_listings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "league_id" "uuid" NOT NULL,
    "player_id" "text" NOT NULL,
    "seller_id" "uuid" NOT NULL,
    "current_bid" numeric DEFAULT 0 NOT NULL,
    "highest_bidder_id" "uuid",
    "starting_bid" numeric NOT NULL,
    "min_increment" numeric DEFAULT 0.5 NOT NULL,
    "deadline_at" timestamp with time zone NOT NULL,
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "won_at" timestamp with time zone,
    CONSTRAINT "auction_listings_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'pending_confirmation'::"text", 'sold'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."auction_listings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."bet_instances" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "league_id" "uuid" NOT NULL,
    "template_id" "uuid",
    "title" "text" NOT NULL,
    "prompt" "text" NOT NULL,
    "options" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "correct_answer" "text",
    "reward_type" "text" DEFAULT 'points'::"text" NOT NULL,
    "reward_value" numeric DEFAULT 5 NOT NULL,
    "deadline_at" timestamp with time zone NOT NULL,
    "resolves_at" timestamp with time zone,
    "scope_type" "text" DEFAULT 'matchday'::"text" NOT NULL,
    "scope_ref" "text",
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "winners_count" integer,
    "total_submissions" integer,
    "correct_answers" "text"[] DEFAULT '{}'::"text"[],
    CONSTRAINT "bet_instances_reward_type_check" CHECK (("reward_type" = ANY (ARRAY['points'::"text", 'budget'::"text"]))),
    CONSTRAINT "bet_instances_status_check" CHECK (("status" = ANY (ARRAY['upcoming'::"text", 'open'::"text", 'closed'::"text", 'resolved'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."bet_instances" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."bet_submissions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "bet_instance_id" "uuid" NOT NULL,
    "squad_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "answer" "text" NOT NULL,
    "is_correct" boolean,
    "reward_awarded" numeric,
    "submitted_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."bet_submissions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."bet_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slug" "text" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "answer_type" "text" NOT NULL,
    "scope_type" "text" NOT NULL,
    "reward_type" "text" DEFAULT 'points'::"text" NOT NULL,
    "default_reward" numeric DEFAULT 5,
    "is_active" boolean DEFAULT true NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "category" "text" DEFAULT 'match'::"text",
    CONSTRAINT "bet_templates_answer_type_check" CHECK (("answer_type" = ANY (ARRAY['player_pick'::"text", 'team_pick'::"text", 'number'::"text", 'yes_no'::"text"]))),
    CONSTRAINT "bet_templates_reward_type_check" CHECK (("reward_type" = ANY (ARRAY['points'::"text", 'budget'::"text"]))),
    CONSTRAINT "bet_templates_scope_type_check" CHECK (("scope_type" = ANY (ARRAY['match'::"text", 'matchday'::"text", 'season'::"text"])))
);


ALTER TABLE "public"."bet_templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chat_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "league_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "message" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "is_deleted" boolean DEFAULT false,
    "edited_at" timestamp with time zone,
    "edited_by" "uuid",
    "mentioned_user_ids" "uuid"[] DEFAULT '{}'::"uuid"[],
    CONSTRAINT "chat_msg_len" CHECK (("char_length"("message") <= 2000))
);


ALTER TABLE "public"."chat_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chips_used" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "league_id" "uuid" NOT NULL,
    "chip_type" "text" NOT NULL,
    "matchday_id" "text" NOT NULL,
    "used_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."chips_used" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."circle_leagues" (
    "circle_id" "uuid" NOT NULL,
    "league_id" "uuid" NOT NULL,
    "added_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."circle_leagues" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."circle_members" (
    "circle_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'member'::"text" NOT NULL,
    "joined_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "circle_members_role_check" CHECK (("role" = ANY (ARRAY['owner'::"text", 'member'::"text"])))
);


ALTER TABLE "public"."circle_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."circle_paddocks" (
    "circle_id" "uuid" NOT NULL,
    "paddock_id" "uuid" NOT NULL,
    "added_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."circle_paddocks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."circle_player_boxes" (
    "circle_id" "uuid" NOT NULL,
    "player_box_id" "uuid" NOT NULL
);


ALTER TABLE "public"."circle_player_boxes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."circles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "invite_code" "text" DEFAULT "substring"(("gen_random_uuid"())::"text", 1, 8) NOT NULL,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "p2p_betting_enabled" boolean DEFAULT false NOT NULL,
    "is_public" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."circles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."client_errors" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "url" "text",
    "message" "text" NOT NULL,
    "stack" "text",
    "user_agent" "text",
    "context" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."client_errors" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."club_cap_rules" (
    "id" integer NOT NULL,
    "tournament_id" "text" NOT NULL,
    "round_suffix" "text" NOT NULL,
    "cap" integer NOT NULL,
    "label" "text",
    "unlimited_transfers" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."club_cap_rules" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."club_cap_rules_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."club_cap_rules_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."club_cap_rules_id_seq" OWNED BY "public"."club_cap_rules"."id";



CREATE TABLE IF NOT EXISTS "public"."clubhouse_channels" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "circle_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "is_default" boolean DEFAULT false NOT NULL,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "clubhouse_channels_name_check" CHECK (("length"(TRIM(BOTH FROM "name")) > 0))
);


ALTER TABLE "public"."clubhouse_channels" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."clubhouse_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "channel_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "content" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "clubhouse_messages_content_check" CHECK ((("length"(TRIM(BOTH FROM "content")) > 0) AND ("length"("content") <= 2000)))
);


ALTER TABLE "public"."clubhouse_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."clubhouse_notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "circle_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "source_type" "text" NOT NULL,
    "source_id" "uuid",
    "type" "text" NOT NULL,
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "read_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "clubhouse_notifications_source_type_check" CHECK (("source_type" = ANY (ARRAY['league'::"text", 'paddock'::"text", 'box'::"text", 'clubhouse'::"text"])))
);


ALTER TABLE "public"."clubhouse_notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."coin_packs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "coins" integer NOT NULL,
    "price_pence" integer NOT NULL,
    "stripe_price_id" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "display_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "coin_packs_coins_check" CHECK (("coins" > 0)),
    CONSTRAINT "coin_packs_price_pence_check" CHECK (("price_pence" > 0))
);


ALTER TABLE "public"."coin_packs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."coin_transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "amount" integer NOT NULL,
    "challenge_id" "uuid",
    "meta" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "status" "text" DEFAULT 'completed'::"text" NOT NULL,
    "currency" character(3) DEFAULT 'FRC'::"bpchar" NOT NULL,
    "reference_id" "text",
    CONSTRAINT "coin_transactions_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'completed'::"text", 'failed'::"text", 'reversed'::"text"]))),
    CONSTRAINT "no_external_cash_out" CHECK (("type" = ANY (ARRAY['purchase'::"text", 'admin'::"text", 'stake'::"text", 'wager_placement'::"text", 'win'::"text", 'wager_win'::"text", 'loss'::"text", 'rake'::"text", 'refund'::"text", 'wager_refund'::"text", 'entry_fee'::"text"])))
);


ALTER TABLE "public"."coin_transactions" OWNER TO "postgres";


COMMENT ON TABLE "public"."coin_transactions" IS 'Frontrow Coin (FRC) ledger. FRC is an internal virtual token only — it cannot be converted to cash, transferred externally, or redeemed for real-world value. No withdrawal, payout, or cash-out flow exists or is permitted. See: LEGAL-1 / docs/platform_revision/due_diligence/TECHNICAL_DUE_DILIGENCE_V2.md';



COMMENT ON COLUMN "public"."coin_transactions"."currency" IS 'Internal virtual token code. FRC = Frontrow Coin. NOT ISO 4217.';



COMMENT ON CONSTRAINT "no_external_cash_out" ON "public"."coin_transactions" IS 'Enforces the no-cash-out rule at schema level. Permitted types are exhaustively listed. Any real-money outflow type (withdrawal, payout, cash_out) is intentionally omitted and will be rejected by this constraint.';



CREATE TABLE IF NOT EXISTS "public"."coin_wallets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "balance" integer DEFAULT 0 NOT NULL,
    "escrow" integer DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "coin_wallets_balance_check" CHECK (("balance" >= 0)),
    CONSTRAINT "coin_wallets_escrow_check" CHECK (("escrow" >= 0))
);


ALTER TABLE "public"."coin_wallets" OWNER TO "postgres";


COMMENT ON TABLE "public"."coin_wallets" IS 'Per-user Frontrow Coin balance. FRC is internal-only — no cash withdrawal path exists.';



CREATE TABLE IF NOT EXISTS "public"."cup_active_clubs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "league_id" "uuid",
    "club_id" "text" NOT NULL,
    "eliminated_at" timestamp with time zone
);


ALTER TABLE "public"."cup_active_clubs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."daily_jokers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "league_id" "uuid" NOT NULL,
    "player_id" "text" NOT NULL,
    "joker_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "points_earned" numeric(6,2) DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "matchday_id" "text"
);


ALTER TABLE "public"."daily_jokers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."direct_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "circle_id" "uuid" NOT NULL,
    "from_user_id" "uuid" NOT NULL,
    "to_user_id" "uuid" NOT NULL,
    "content" "text" NOT NULL,
    "read_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "direct_messages_check" CHECK (("from_user_id" <> "to_user_id")),
    CONSTRAINT "direct_messages_content_check" CHECK ((("length"(TRIM(BOTH FROM "content")) > 0) AND ("length"("content") <= 2000)))
);


ALTER TABLE "public"."direct_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."draft_allocations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "league_id" "uuid",
    "user_id" "uuid",
    "allocated_players" "text"[] DEFAULT '{}'::"text"[],
    "unresolved_slots" integer DEFAULT 0,
    "allocated_at" timestamp with time zone,
    "phase" "text" DEFAULT 'group'::"text" NOT NULL
);


ALTER TABLE "public"."draft_allocations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."draft_submissions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "league_id" "uuid",
    "user_id" "uuid",
    "player_ids" "text"[] DEFAULT '{}'::"text"[],
    "submitted_at" timestamp with time zone,
    "status" "public"."draft_status" DEFAULT 'pending'::"public"."draft_status",
    "tournament_id" "text",
    "phase" "text" DEFAULT 'group'::"text" NOT NULL
);


ALTER TABLE "public"."draft_submissions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."edge_function_errors" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "function" "text" NOT NULL,
    "severity" "text" DEFAULT 'error'::"text" NOT NULL,
    "message" "text" NOT NULL,
    "context" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "edge_function_errors_severity_check" CHECK (("severity" = ANY (ARRAY['warning'::"text", 'error'::"text", 'critical'::"text"])))
);


ALTER TABLE "public"."edge_function_errors" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."f1_bets_race" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "season" integer DEFAULT 2026 NOT NULL,
    "round_number" integer NOT NULL,
    "p1" "text" NOT NULL,
    "p2" "text" NOT NULL,
    "p3" "text" NOT NULL,
    "dnf_driver" "text",
    "team_most_points" "text",
    "special_category_answer" "text",
    "is_locked" boolean DEFAULT false NOT NULL,
    "submitted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."f1_bets_race" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."f1_bets_year" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "season" integer DEFAULT 2026 NOT NULL,
    "driver_champion" "text",
    "driver_p2" "text",
    "driver_p3" "text",
    "constructor_champion" "text",
    "last_constructor" "text",
    "fewest_finishers_race" "text",
    "most_dnfs_driver" "text",
    "first_driver_replaced" "text",
    "most_poles" "text",
    "most_podiums_no_win" "text",
    "is_locked" boolean DEFAULT false NOT NULL,
    "submitted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."f1_bets_year" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."f1_races" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "season" integer DEFAULT 2026 NOT NULL,
    "round_number" integer NOT NULL,
    "gp_name" "text" NOT NULL,
    "circuit" "text" NOT NULL,
    "race_date" "date" NOT NULL,
    "is_saturday" boolean DEFAULT false NOT NULL,
    "qualifying_at" timestamp with time zone,
    "race_at" timestamp with time zone,
    "status" "text" DEFAULT 'scheduled'::"text" NOT NULL,
    "special_category_question" "text",
    "special_category_type" "text",
    "special_category_options" "text"[],
    "result_p1" "text",
    "result_p2" "text",
    "result_p3" "text",
    "result_dnf_drivers" "text"[],
    "result_team_most_points" "text",
    "special_category_answer" "text",
    "is_scored" boolean DEFAULT false NOT NULL,
    "is_manual_unlock" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "f1_races_round_number_check" CHECK ((("round_number" >= 1) AND ("round_number" <= 24))),
    CONSTRAINT "f1_races_special_category_type_check" CHECK (("special_category_type" = ANY (ARRAY['driver'::"text", 'team'::"text", 'options'::"text"]))),
    CONSTRAINT "f1_races_status_check" CHECK (("status" = ANY (ARRAY['scheduled'::"text", 'qualifying'::"text", 'race'::"text", 'finished'::"text"])))
);


ALTER TABLE "public"."f1_races" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."f1_scores" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "season" integer DEFAULT 2026 NOT NULL,
    "round_number" integer,
    "score_type" "text" NOT NULL,
    "breakdown" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "total_points" integer DEFAULT 0 NOT NULL,
    "is_override" boolean DEFAULT false NOT NULL,
    "override_reason" "text",
    "scored_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "f1_scores_score_type_check" CHECK (("score_type" = ANY (ARRAY['race'::"text", 'year'::"text"])))
);


ALTER TABLE "public"."f1_scores" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."f1_year_results" (
    "id" integer NOT NULL,
    "season" integer NOT NULL,
    "driver_champion" "text",
    "driver_p2" "text",
    "driver_p3" "text",
    "constructor_champion" "text",
    "last_constructor" "text",
    "fewest_finishers_race" "text",
    "most_dnfs_driver" "text",
    "first_driver_replaced" "text",
    "most_poles" "text",
    "most_podiums_no_win" "text",
    "is_final" boolean DEFAULT false NOT NULL,
    "is_bets_locked" boolean DEFAULT false NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."f1_year_results" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."f1_year_results_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."f1_year_results_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."f1_year_results_id_seq" OWNED BY "public"."f1_year_results"."id";



CREATE TABLE IF NOT EXISTS "public"."fantasy_points" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "squad_id" "uuid",
    "player_id" "text",
    "points_breakdown" "jsonb" DEFAULT '{}'::"jsonb",
    "total" numeric DEFAULT 0,
    "matchday_id" "text",
    CONSTRAINT "fantasy_points_matchday_id_format" CHECK (("matchday_id" ~ '^[0-9]+-r[0-9]+$'::"text"))
);


ALTER TABLE "public"."fantasy_points" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fixtures" (
    "id" "text" NOT NULL,
    "home_team" "text" NOT NULL,
    "away_team" "text" NOT NULL,
    "kickoff_at" timestamp with time zone NOT NULL,
    "competition" "text" NOT NULL,
    "status" "public"."match_status" DEFAULT 'scheduled'::"public"."match_status",
    "minute" "text",
    "forza_match_id" "text",
    "tournament_id" "text",
    "round_number" integer,
    "home_team_forza_id" "text",
    "away_team_forza_id" "text",
    "scores" "jsonb",
    "status_detail" "text",
    "home_score" integer,
    "away_score" integer,
    "matchday_id" "text"
);


ALTER TABLE "public"."fixtures" OWNER TO "postgres";


COMMENT ON COLUMN "public"."fixtures"."home_score" IS 'Final score for home team (null until match finishes)';



COMMENT ON COLUMN "public"."fixtures"."away_score" IS 'Final score for away team (null until match finishes)';



CREATE TABLE IF NOT EXISTS "public"."frontpage_comments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "league_id" "uuid",
    "edition_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "section_key" "text" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "text" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "circle_id" "uuid",
    CONSTRAINT "comments_scope_check" CHECK ((("league_id" IS NOT NULL) OR ("circle_id" IS NOT NULL))),
    CONSTRAINT "frontpage_comments_section_key_check" CHECK (("section_key" = ANY (ARRAY['lead'::"text", 'hot_take'::"text", 'transfers'::"text", 'scores'::"text", 'commissioner'::"text"]))),
    CONSTRAINT "frontpage_comments_text_check" CHECK ((("char_length"("text") >= 1) AND ("char_length"("text") <= 140)))
);


ALTER TABLE "public"."frontpage_comments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."frontpage_editions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "league_id" "uuid",
    "edition_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "edition_number" integer DEFAULT 1 NOT NULL,
    "headline" "text",
    "deck" "text",
    "hot_take" "text",
    "wooden_spoon" "text",
    "transfer_rumour" "text",
    "raw_input" "jsonb",
    "is_manual" boolean DEFAULT false NOT NULL,
    "generated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "circle_id" "uuid",
    CONSTRAINT "editions_scope_check" CHECK ((("league_id" IS NOT NULL) OR ("circle_id" IS NOT NULL)))
);


ALTER TABLE "public"."frontpage_editions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."frontpage_reactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "league_id" "uuid",
    "edition_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "section_key" "text" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "emoji" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "circle_id" "uuid",
    CONSTRAINT "frontpage_reactions_emoji_check" CHECK (("emoji" = ANY (ARRAY['🔥'::"text", '💀'::"text", '😂'::"text", '👑'::"text", '😤'::"text"]))),
    CONSTRAINT "frontpage_reactions_section_key_check" CHECK (("section_key" = ANY (ARRAY['lead'::"text", 'hot_take'::"text", 'transfers'::"text", 'scores'::"text", 'commissioner'::"text"]))),
    CONSTRAINT "reactions_scope_check" CHECK ((("league_id" IS NOT NULL) OR ("circle_id" IS NOT NULL)))
);


ALTER TABLE "public"."frontpage_reactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."gazette_entries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "league_id" "uuid",
    "entry_type" "public"."gazette_entry_type" DEFAULT 'activity'::"public"."gazette_entry_type" NOT NULL,
    "headline" "text",
    "bullets" "jsonb",
    "full_data" "jsonb",
    "published_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."gazette_entries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."h2h_records" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "league_id" "uuid",
    "user_a_id" "uuid",
    "user_b_id" "uuid",
    "matchday_id" "text" NOT NULL,
    "user_a_points" integer,
    "user_b_points" integer,
    "winner_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."h2h_records" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."h2h_schedule" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "league_id" "uuid" NOT NULL,
    "matchday_id" "text" NOT NULL,
    "home_user_id" "uuid",
    "away_user_id" "uuid",
    "is_bye" boolean DEFAULT false NOT NULL,
    "bye_user_id" "uuid",
    "home_score" numeric,
    "away_score" numeric,
    "home_h2h_pts" integer,
    "away_h2h_pts" integer,
    "resolved_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."h2h_schedule" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."knockout_keep_submissions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "league_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "player_ids" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "submitted_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."knockout_keep_submissions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."league_chat_read_status" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "league_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "last_read_at" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."league_chat_read_status" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."league_config" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "league_id" "uuid",
    "config_key" character varying NOT NULL,
    "config_value" "jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."league_config" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."league_members" (
    "league_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "rank" integer DEFAULT 1,
    "total_points" numeric(10,2) DEFAULT 0,
    "joined_at" timestamp with time zone DEFAULT "now"(),
    "role" "text" DEFAULT 'member'::"text",
    CONSTRAINT "league_members_role_check" CHECK (("role" = ANY (ARRAY['member'::"text", 'admin'::"text", 'commissioner'::"text"])))
);


ALTER TABLE "public"."league_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."league_notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "league_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "notification_type" "text" NOT NULL,
    "triggered_by_user_id" "uuid",
    "title" "text" NOT NULL,
    "description" "text",
    "related_entity_id" "uuid",
    "related_entity_type" "text",
    "is_read" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE ONLY "public"."league_notifications" REPLICA IDENTITY FULL;


ALTER TABLE "public"."league_notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."leagues" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "format" "public"."league_format" DEFAULT 'classic'::"public"."league_format" NOT NULL,
    "max_members" integer DEFAULT 10,
    "tournament_id" "text" DEFAULT '426'::"text" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "cup_phase" "public"."cup_phase" DEFAULT 'pre_cup'::"public"."cup_phase",
    "draft_deadline" timestamp with time zone,
    "is_dry_run" boolean DEFAULT false NOT NULL,
    "squad_size" integer DEFAULT 15,
    "draft_list_size" integer DEFAULT 45,
    "draft_position_caps" "jsonb" DEFAULT '{"GK": 6, "DEF": 15, "FWD": 9, "MID": 15}'::"jsonb",
    "position_limits" "jsonb" DEFAULT '{"GK": 2, "DEF": 5, "FWD": 3, "MID": 5}'::"jsonb",
    "min_formation" "jsonb" DEFAULT '{"GK": 1, "DEF": 3, "FWD": 1, "MID": 2}'::"jsonb",
    "league_mode" "text" DEFAULT 'draft'::"text" NOT NULL,
    "knockout_draft_deadline" timestamp with time zone,
    "h2h_enabled" boolean DEFAULT false NOT NULL,
    "circle_id" "uuid",
    "join_code" "text"
);


ALTER TABLE "public"."leagues" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."match_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "fixture_id" "text",
    "type" "public"."event_type" NOT NULL,
    "player_id" "text",
    "minute" "text" NOT NULL,
    "team" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."match_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."matchday_deadlines" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "matchday_id" "text" NOT NULL,
    "label" "text",
    "deadline_at" timestamp with time zone NOT NULL,
    "unlocks_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "tournament_id" "text"
);


ALTER TABLE "public"."matchday_deadlines" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."matchday_recaps" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "league_id" "uuid",
    "matchday_id" "text" NOT NULL,
    "final_rank" integer,
    "final_points" integer,
    "rank_change" integer,
    "best_player_id" "text",
    "captain_id" "text",
    "joker_player_id" "text",
    "transfers_made" integer DEFAULT 0,
    "image_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."matchday_recaps" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."p2p_challenges" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "league_id" "uuid" NOT NULL,
    "challenger_id" "uuid" NOT NULL,
    "opponent_id" "uuid" NOT NULL,
    "bet_type" "text" DEFAULT 'gw_total'::"text" NOT NULL,
    "matchday_id" "text" NOT NULL,
    "stake_coins" integer NOT NULL,
    "message" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "winner_id" "uuid",
    "resolved_at" timestamp with time zone,
    "expires_at" timestamp with time zone DEFAULT ("now"() + '48:00:00'::interval) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "challenger_pts" numeric,
    "opponent_pts" numeric,
    CONSTRAINT "no_self_challenge" CHECK (("challenger_id" <> "opponent_id")),
    CONSTRAINT "p2p_challenges_bet_type_check" CHECK (("bet_type" = 'gw_total'::"text")),
    CONSTRAINT "p2p_challenges_message_check" CHECK (("char_length"("message") <= 140)),
    CONSTRAINT "p2p_challenges_stake_coins_check" CHECK (("stake_coins" > 0)),
    CONSTRAINT "p2p_challenges_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'declined'::"text", 'cancelled'::"text", 'resolved'::"text", 'expired'::"text"])))
);


ALTER TABLE "public"."p2p_challenges" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."p2p_config" (
    "league_id" "uuid" NOT NULL,
    "min_stake" integer DEFAULT 10 NOT NULL,
    "max_stake" integer DEFAULT 500 NOT NULL,
    "daily_challenge_limit" integer DEFAULT 5 NOT NULL,
    "challenges_enabled" boolean DEFAULT true NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "max_stake_hard_cap" CHECK (("max_stake" <= 10000)),
    CONSTRAINT "p2p_config_check" CHECK (("max_stake" >= "min_stake")),
    CONSTRAINT "p2p_config_daily_challenge_limit_check" CHECK (("daily_challenge_limit" >= 1)),
    CONSTRAINT "p2p_config_min_stake_check" CHECK (("min_stake" >= 1))
);


ALTER TABLE "public"."p2p_config" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."paddock_members" (
    "paddock_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'member'::"text" NOT NULL,
    "joined_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "paddock_members_role_check" CHECK (("role" = ANY (ARRAY['owner'::"text", 'member'::"text"])))
);


ALTER TABLE "public"."paddock_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."paddocks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "season" integer DEFAULT 2026 NOT NULL,
    "invite_code" "text" DEFAULT "substring"(("gen_random_uuid"())::"text", 1, 8) NOT NULL,
    "created_by" "uuid" NOT NULL,
    "sport_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "circle_id" "uuid"
);


ALTER TABLE "public"."paddocks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."player_availability_flags" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "squad_id" "uuid" NOT NULL,
    "player_id" "text" NOT NULL,
    "league_id" "uuid" NOT NULL,
    "flagged_at" timestamp without time zone DEFAULT "now"(),
    "expires_at" timestamp without time zone DEFAULT ("now"() + '14 days'::interval),
    "created_by" "uuid" NOT NULL,
    CONSTRAINT "valid_expiry" CHECK (("expires_at" > "flagged_at"))
);


ALTER TABLE "public"."player_availability_flags" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."player_box_members" (
    "player_box_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "joined_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."player_box_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."player_boxes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "invite_code" "text" DEFAULT "upper"("substring"(("gen_random_uuid"())::"text", 1, 8)) NOT NULL,
    "created_by" "uuid" NOT NULL,
    "season_year" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "circle_id" "uuid"
);


ALTER TABLE "public"."player_boxes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."player_match_stats" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "fixture_id" "text" NOT NULL,
    "player_id" "text" NOT NULL,
    "minutes_played" integer DEFAULT 0 NOT NULL,
    "goals" integer DEFAULT 0 NOT NULL,
    "assists" integer DEFAULT 0 NOT NULL,
    "own_goals" integer DEFAULT 0 NOT NULL,
    "yellow_cards" integer DEFAULT 0 NOT NULL,
    "red_cards" integer DEFAULT 0 NOT NULL,
    "penalty_saved" integer DEFAULT 0 NOT NULL,
    "penalty_missed" integer DEFAULT 0 NOT NULL,
    "clean_sheet" boolean DEFAULT false NOT NULL,
    "tackles_won" integer DEFAULT 0 NOT NULL,
    "interceptions" integer DEFAULT 0 NOT NULL,
    "bps_score" numeric(8,2) DEFAULT 0,
    "bonus_points" integer DEFAULT 0 NOT NULL,
    "fantasy_points" numeric(6,2) DEFAULT 0,
    "breakdown" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "forza_match_id" "text",
    "shots_on_target" integer DEFAULT 0 NOT NULL,
    "saves" integer DEFAULT 0 NOT NULL,
    "xg" numeric(6,4) DEFAULT 0 NOT NULL,
    "xa" numeric(6,4) DEFAULT 0 NOT NULL,
    "goals_conceded" integer DEFAULT 0 NOT NULL,
    "penalty_scored" integer DEFAULT 0,
    "accurate_passes" integer DEFAULT 0 NOT NULL,
    "total_passes" integer DEFAULT 0 NOT NULL,
    "key_passes" integer DEFAULT 0 NOT NULL,
    "big_chances_created" integer DEFAULT 0 NOT NULL,
    "shootout_scored" integer DEFAULT 0,
    "shootout_missed" integer DEFAULT 0,
    "shootout_saved" integer DEFAULT 0
);


ALTER TABLE "public"."player_match_stats" OWNER TO "postgres";


COMMENT ON COLUMN "public"."player_match_stats"."accurate_passes" IS 'Number of successful passes (from Forza E11 API)';



COMMENT ON COLUMN "public"."player_match_stats"."total_passes" IS 'Total number of pass attempts (from Forza E11 API)';



CREATE TABLE IF NOT EXISTS "public"."player_status" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "player_id" "text",
    "status" "public"."player_status_type" DEFAULT 'fit'::"public"."player_status_type",
    "confidence" integer DEFAULT 100,
    "reason" "text",
    "return_date" "date",
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."player_status" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."projection_snapshots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "league_id" "uuid",
    "matchday_id" "text" NOT NULL,
    "projected_points" integer,
    "recorded_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."projection_snapshots" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."round_backups" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "matchday_id" "text" NOT NULL,
    "backed_up_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "squads_snapshot" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "fantasy_points_snapshot" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "league_members_snapshot" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL
);


ALTER TABLE "public"."round_backups" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."scoring_rules" (
    "tournament_id" "text" NOT NULL,
    "position" "text" NOT NULL,
    "rules" "jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."scoring_rules" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slug" "text" NOT NULL,
    "name" "text" NOT NULL,
    "game_model" "text" NOT NULL,
    "provider" "text" NOT NULL,
    "active" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "sports_game_model_check" CHECK (("game_model" = ANY (ARRAY['fantasy_squad'::"text", 'prediction'::"text", 'bracket'::"text"]))),
    CONSTRAINT "sports_provider_check" CHECK (("provider" = ANY (ARRAY['forza'::"text", 'openf1'::"text", 'thesportsdb'::"text", 'manual'::"text"]))),
    CONSTRAINT "sports_slug_check" CHECK (("slug" = ANY (ARRAY['football'::"text", 'f1'::"text", 'tennis'::"text"])))
);


ALTER TABLE "public"."sports" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."squad_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "event_type" "text" NOT NULL,
    "league_id" "uuid",
    "user_id" "uuid",
    "squad_id" "uuid",
    "matchday_id" "text",
    "player_in" "text",
    "player_out" "text",
    "meta" "jsonb" DEFAULT '{}'::"jsonb",
    "event_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."squad_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."squad_matchday_snapshots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "league_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "matchday_id" "text" NOT NULL,
    "squad_id" "uuid" NOT NULL,
    "starting_xi" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "players" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "captain_id" "text",
    "snapshotted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "snapshot_reason" "text" DEFAULT 'fixture_live'::"text" NOT NULL
);


ALTER TABLE "public"."squad_matchday_snapshots" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."squads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "league_id" "uuid",
    "user_id" "uuid",
    "matchday_id" "text" NOT NULL,
    "players" "text"[] DEFAULT '{}'::"text"[],
    "captain_id" "text",
    "joker_player_id" "text",
    "is_wildcard" boolean DEFAULT false,
    "is_triple_captain" boolean DEFAULT false,
    "locked_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "budget_remaining" numeric(6,1) DEFAULT 100,
    "tournament_id" "text" NOT NULL,
    "round_transfers" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "starting_xi" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "lineup_locks" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "initial_build_complete" boolean DEFAULT false NOT NULL,
    "penalty_transfers" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "squads_captain_not_joker" CHECK ((("captain_id" IS DISTINCT FROM "joker_player_id") OR ("captain_id" IS NULL) OR ("joker_player_id" IS NULL)))
);


ALTER TABLE "public"."squads" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."teams" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "forza_team_id" "text" NOT NULL,
    "tournament_id" "text",
    "name" "text" NOT NULL,
    "abbreviation" "text",
    "region" "text",
    "main_color" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."teams" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tennis_ace_cards" (
    "user_id" "uuid" NOT NULL,
    "season_year" integer NOT NULL,
    "card_type" "text" NOT NULL,
    "used_tournament_id" "uuid",
    "used_at" timestamp with time zone,
    CONSTRAINT "tennis_ace_cards_card_type_check" CHECK (("card_type" = ANY (ARRAY['underdog_boost'::"text", 'safety_net'::"text", 'surface_specialist'::"text", 'dark_horse_insurance'::"text"])))
);


ALTER TABLE "public"."tennis_ace_cards" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tennis_atp_finals_matches" (
    "season_year" integer NOT NULL,
    "match_number" integer NOT NULL,
    "match_type" "text" NOT NULL,
    "player_a_id" "uuid",
    "player_b_id" "uuid",
    "winner_player_id" "uuid",
    "result_entered_at" timestamp with time zone,
    CONSTRAINT "tennis_atp_finals_matches_match_number_check" CHECK ((("match_number" >= 1) AND ("match_number" <= 15))),
    CONSTRAINT "tennis_atp_finals_matches_match_type_check" CHECK (("match_type" = ANY (ARRAY['group'::"text", 'sf'::"text", 'final'::"text"])))
);


ALTER TABLE "public"."tennis_atp_finals_matches" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tennis_atp_finals_picks" (
    "user_id" "uuid" NOT NULL,
    "season_year" integer NOT NULL,
    "match_number" integer NOT NULL,
    "picked_player_id" "uuid" NOT NULL,
    "locked_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "tennis_atp_finals_picks_match_number_check" CHECK ((("match_number" >= 1) AND ("match_number" <= 15)))
);


ALTER TABLE "public"."tennis_atp_finals_picks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tennis_qf_captains" (
    "user_id" "uuid" NOT NULL,
    "tournament_id" "uuid" NOT NULL,
    "captain_player_id" "uuid" NOT NULL,
    "set_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."tennis_qf_captains" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tennis_rosters" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "tournament_id" "uuid" NOT NULL,
    "tier1_player_id" "uuid",
    "tier2a_player_id" "uuid",
    "tier2b_player_id" "uuid",
    "tier3a_player_id" "uuid",
    "tier3b_player_id" "uuid",
    "tier4a_player_id" "uuid",
    "tier4b_player_id" "uuid",
    "ace_card_type" "text",
    "locked_at" timestamp with time zone,
    CONSTRAINT "tennis_rosters_ace_card_type_check" CHECK (("ace_card_type" = ANY (ARRAY['underdog_boost'::"text", 'safety_net'::"text", 'surface_specialist'::"text", 'dark_horse_insurance'::"text"])))
);


ALTER TABLE "public"."tennis_rosters" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tennis_seasons" (
    "year" integer NOT NULL,
    "ace_cards_per_user" integer DEFAULT 4 NOT NULL
);


ALTER TABLE "public"."tennis_seasons" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tennis_tournament_players" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tournament_id" "uuid" NOT NULL,
    "player_name" "text" NOT NULL,
    "nationality" "text",
    "seed" integer,
    "tier" integer NOT NULL,
    "round_reached" "text",
    "rounds_won" integer DEFAULT 0 NOT NULL,
    "eliminated" boolean DEFAULT false NOT NULL,
    "external_player_id" integer,
    CONSTRAINT "tennis_tournament_players_round_reached_check" CHECK (("round_reached" = ANY (ARRAY['r128'::"text", 'r64'::"text", 'r32'::"text", 'r16'::"text", 'qf'::"text", 'sf'::"text", 'runner_up'::"text", 'champion'::"text"]))),
    CONSTRAINT "tennis_tournament_players_tier_check" CHECK (("tier" = ANY (ARRAY[1, 2, 3, 4])))
);


ALTER TABLE "public"."tennis_tournament_players" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tennis_tournament_scores" (
    "user_id" "uuid" NOT NULL,
    "tournament_id" "uuid" NOT NULL,
    "base_points" integer DEFAULT 0 NOT NULL,
    "ace_card_bonus" integer DEFAULT 0 NOT NULL,
    "captain_bonus" integer DEFAULT 0 NOT NULL,
    "total_points" integer DEFAULT 0 NOT NULL,
    "breakdown" "jsonb",
    "scored_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."tennis_tournament_scores" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tennis_tournaments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "season_year" integer NOT NULL,
    "name" "text" NOT NULL,
    "tournament_type" "public"."tennis_tournament_type" NOT NULL,
    "surface" "public"."tennis_surface" NOT NULL,
    "draw_size" integer DEFAULT 128 NOT NULL,
    "start_date" "date" NOT NULL,
    "end_date" "date" NOT NULL,
    "roster_lock_at" timestamp with time zone,
    "qf_window_opens_at" timestamp with time zone,
    "qf_window_closes_at" timestamp with time zone,
    "status" "text" DEFAULT 'upcoming'::"text" NOT NULL,
    "sort_order" integer NOT NULL,
    "external_id" integer,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "tennis_tournaments_status_check" CHECK (("status" = ANY (ARRAY['upcoming'::"text", 'roster_open'::"text", 'in_progress'::"text", 'qf_captain_open'::"text", 'completed'::"text"])))
);


ALTER TABLE "public"."tennis_tournaments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."top_scorer_predictions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "matchday_id" "text" NOT NULL,
    "predicted_player_id" "text",
    "actual_top_scorer_id" "text",
    "is_correct" boolean,
    "points_awarded" integer,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."top_scorer_predictions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tournaments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "forza_id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "environment" "text" DEFAULT 'dry_run'::"text" NOT NULL,
    "sync_enabled" boolean DEFAULT false NOT NULL,
    "status" "text" DEFAULT 'upcoming'::"text" NOT NULL,
    "starts_at" timestamp with time zone,
    "ends_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "available_for_league_creation" boolean DEFAULT false NOT NULL,
    "sport_id" "uuid",
    "provider" "text"
);


ALTER TABLE "public"."tournaments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."trade_listings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "league_id" "uuid",
    "user_id" "uuid",
    "player_id" "text",
    "listed_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."trade_listings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."trade_proposals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "league_id" "uuid" NOT NULL,
    "proposer_squad_id" "uuid" NOT NULL,
    "target_squad_id" "uuid" NOT NULL,
    "proposer_player_id" "text" NOT NULL,
    "target_player_id" "text" NOT NULL,
    "cash_sweetener" numeric(6,1) DEFAULT 0 NOT NULL,
    "points_sweetener" integer DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone DEFAULT ("now"() + '48:00:00'::interval) NOT NULL,
    "resolved_at" timestamp with time zone,
    CONSTRAINT "trade_proposals_cash_sweetener_check" CHECK (("cash_sweetener" >= (0)::numeric)),
    CONSTRAINT "trade_proposals_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'rejected'::"text", 'cancelled'::"text", 'expired'::"text"])))
);


ALTER TABLE "public"."trade_proposals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."transfers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "league_id" "uuid",
    "user_id" "uuid",
    "round_number" integer NOT NULL,
    "player_out" "text",
    "player_in" "text",
    "transferred_at" timestamp with time zone DEFAULT "now"(),
    "tournament_id" "text"
);


ALTER TABLE "public"."transfers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."trophy_ledger" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "circle_id" "uuid" NOT NULL,
    "league_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "sport_id" "uuid" NOT NULL,
    "tournament_id" "uuid" NOT NULL,
    "trophy_type" "text" NOT NULL,
    "tier" "text",
    "awarded_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "meta" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "trophy_ledger_tier_check" CHECK ((("tier" IS NULL) OR ("tier" = ANY (ARRAY['bronze'::"text", 'silver'::"text", 'gold'::"text"])))),
    CONSTRAINT "trophy_ledger_trophy_type_check" CHECK (("trophy_type" = ANY (ARRAY['round_win'::"text", 'event_win'::"text", 'season_win'::"text"])))
);


ALTER TABLE "public"."trophy_ledger" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."users" (
    "id" "uuid" NOT NULL,
    "username" "text" NOT NULL,
    "avatar_url" "text",
    "xp" integer DEFAULT 0,
    "badges" "text"[] DEFAULT '{}'::"text"[],
    "created_at" timestamp with time zone DEFAULT "now"(),
    "is_admin" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."users" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."user_profiles" AS
 SELECT "id",
    "username",
    "avatar_url",
    "xp",
    "created_at"
   FROM "public"."users";


ALTER VIEW "public"."user_profiles" OWNER TO "postgres";


ALTER TABLE ONLY "public"."club_cap_rules" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."club_cap_rules_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."f1_year_results" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."f1_year_results_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."auction_bids"
    ADD CONSTRAINT "auction_bids_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."auction_listings"
    ADD CONSTRAINT "auction_listings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bet_instances"
    ADD CONSTRAINT "bet_instances_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bet_submissions"
    ADD CONSTRAINT "bet_submissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bet_submissions"
    ADD CONSTRAINT "bet_submissions_unique_squad_bet" UNIQUE ("bet_instance_id", "squad_id");



ALTER TABLE ONLY "public"."bet_templates"
    ADD CONSTRAINT "bet_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bet_templates"
    ADD CONSTRAINT "bet_templates_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."chat_messages"
    ADD CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chips_used"
    ADD CONSTRAINT "chips_used_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chips_used"
    ADD CONSTRAINT "chips_used_user_id_league_id_chip_type_key" UNIQUE ("user_id", "league_id", "chip_type");



ALTER TABLE ONLY "public"."circle_leagues"
    ADD CONSTRAINT "circle_leagues_pkey" PRIMARY KEY ("circle_id", "league_id");



ALTER TABLE ONLY "public"."circle_members"
    ADD CONSTRAINT "circle_members_pkey" PRIMARY KEY ("circle_id", "user_id");



ALTER TABLE ONLY "public"."circle_paddocks"
    ADD CONSTRAINT "circle_paddocks_pkey" PRIMARY KEY ("circle_id", "paddock_id");



ALTER TABLE ONLY "public"."circle_player_boxes"
    ADD CONSTRAINT "circle_player_boxes_pkey" PRIMARY KEY ("circle_id", "player_box_id");



ALTER TABLE ONLY "public"."circles"
    ADD CONSTRAINT "circles_invite_code_key" UNIQUE ("invite_code");



ALTER TABLE ONLY "public"."circles"
    ADD CONSTRAINT "circles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."client_errors"
    ADD CONSTRAINT "client_errors_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."club_cap_rules"
    ADD CONSTRAINT "club_cap_rules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."club_cap_rules"
    ADD CONSTRAINT "club_cap_rules_tournament_id_round_suffix_key" UNIQUE ("tournament_id", "round_suffix");



ALTER TABLE ONLY "public"."clubhouse_channels"
    ADD CONSTRAINT "clubhouse_channels_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."clubhouse_messages"
    ADD CONSTRAINT "clubhouse_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."clubhouse_notifications"
    ADD CONSTRAINT "clubhouse_notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."coin_packs"
    ADD CONSTRAINT "coin_packs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."coin_transactions"
    ADD CONSTRAINT "coin_transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."coin_transactions"
    ADD CONSTRAINT "coin_transactions_reference_id_unique" UNIQUE ("reference_id");



ALTER TABLE ONLY "public"."coin_wallets"
    ADD CONSTRAINT "coin_wallets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."coin_wallets"
    ADD CONSTRAINT "coin_wallets_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."cup_active_clubs"
    ADD CONSTRAINT "cup_active_clubs_league_id_club_id_key" UNIQUE ("league_id", "club_id");



ALTER TABLE ONLY "public"."cup_active_clubs"
    ADD CONSTRAINT "cup_active_clubs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."daily_jokers"
    ADD CONSTRAINT "daily_jokers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."direct_messages"
    ADD CONSTRAINT "direct_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."draft_allocations"
    ADD CONSTRAINT "draft_allocations_league_id_user_id_phase_key" UNIQUE ("league_id", "user_id", "phase");



ALTER TABLE ONLY "public"."draft_allocations"
    ADD CONSTRAINT "draft_allocations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."draft_submissions"
    ADD CONSTRAINT "draft_submissions_league_id_user_id_phase_key" UNIQUE ("league_id", "user_id", "phase");



ALTER TABLE ONLY "public"."draft_submissions"
    ADD CONSTRAINT "draft_submissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."edge_function_errors"
    ADD CONSTRAINT "edge_function_errors_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."f1_bets_race"
    ADD CONSTRAINT "f1_bets_race_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."f1_bets_race"
    ADD CONSTRAINT "f1_bets_race_user_id_season_round_number_key" UNIQUE ("user_id", "season", "round_number");



ALTER TABLE ONLY "public"."f1_bets_year"
    ADD CONSTRAINT "f1_bets_year_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."f1_bets_year"
    ADD CONSTRAINT "f1_bets_year_user_id_season_key" UNIQUE ("user_id", "season");



ALTER TABLE ONLY "public"."f1_races"
    ADD CONSTRAINT "f1_races_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."f1_races"
    ADD CONSTRAINT "f1_races_season_round_number_key" UNIQUE ("season", "round_number");



ALTER TABLE ONLY "public"."f1_scores"
    ADD CONSTRAINT "f1_scores_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."f1_scores"
    ADD CONSTRAINT "f1_scores_user_id_season_round_number_score_type_key" UNIQUE ("user_id", "season", "round_number", "score_type");



ALTER TABLE ONLY "public"."f1_year_results"
    ADD CONSTRAINT "f1_year_results_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."f1_year_results"
    ADD CONSTRAINT "f1_year_results_season_key" UNIQUE ("season");



ALTER TABLE ONLY "public"."fantasy_points"
    ADD CONSTRAINT "fantasy_points_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."fantasy_points"
    ADD CONSTRAINT "fantasy_points_squad_matchday_key" UNIQUE ("squad_id", "matchday_id");



ALTER TABLE ONLY "public"."fixtures"
    ADD CONSTRAINT "fixtures_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."frontpage_comments"
    ADD CONSTRAINT "frontpage_comments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."frontpage_editions"
    ADD CONSTRAINT "frontpage_editions_league_id_edition_date_key" UNIQUE ("league_id", "edition_date");



ALTER TABLE ONLY "public"."frontpage_editions"
    ADD CONSTRAINT "frontpage_editions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."frontpage_reactions"
    ADD CONSTRAINT "frontpage_reactions_league_id_edition_date_section_key_user_key" UNIQUE ("league_id", "edition_date", "section_key", "user_id", "emoji");



ALTER TABLE ONLY "public"."frontpage_reactions"
    ADD CONSTRAINT "frontpage_reactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."gazette_entries"
    ADD CONSTRAINT "gazette_entries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."h2h_records"
    ADD CONSTRAINT "h2h_records_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."h2h_schedule"
    ADD CONSTRAINT "h2h_schedule_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."knockout_keep_submissions"
    ADD CONSTRAINT "knockout_keep_submissions_league_id_user_id_key" UNIQUE ("league_id", "user_id");



ALTER TABLE ONLY "public"."knockout_keep_submissions"
    ADD CONSTRAINT "knockout_keep_submissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."league_chat_read_status"
    ADD CONSTRAINT "league_chat_read_status_league_id_user_id_key" UNIQUE ("league_id", "user_id");



ALTER TABLE ONLY "public"."league_chat_read_status"
    ADD CONSTRAINT "league_chat_read_status_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."league_config"
    ADD CONSTRAINT "league_config_league_id_config_key_key" UNIQUE ("league_id", "config_key");



ALTER TABLE ONLY "public"."league_config"
    ADD CONSTRAINT "league_config_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."league_members"
    ADD CONSTRAINT "league_members_pkey" PRIMARY KEY ("league_id", "user_id");



ALTER TABLE ONLY "public"."league_notifications"
    ADD CONSTRAINT "league_notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."leagues"
    ADD CONSTRAINT "leagues_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."match_events"
    ADD CONSTRAINT "match_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."matchday_deadlines"
    ADD CONSTRAINT "matchday_deadlines_matchday_id_key" UNIQUE ("matchday_id");



ALTER TABLE ONLY "public"."matchday_deadlines"
    ADD CONSTRAINT "matchday_deadlines_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."matchday_recaps"
    ADD CONSTRAINT "matchday_recaps_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."matchday_recaps"
    ADD CONSTRAINT "matchday_recaps_user_id_league_id_matchday_id_key" UNIQUE ("user_id", "league_id", "matchday_id");



ALTER TABLE ONLY "public"."p2p_challenges"
    ADD CONSTRAINT "p2p_challenges_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."p2p_config"
    ADD CONSTRAINT "p2p_config_pkey" PRIMARY KEY ("league_id");



ALTER TABLE ONLY "public"."paddock_members"
    ADD CONSTRAINT "paddock_members_pkey" PRIMARY KEY ("paddock_id", "user_id");



ALTER TABLE ONLY "public"."paddocks"
    ADD CONSTRAINT "paddocks_invite_code_key" UNIQUE ("invite_code");



ALTER TABLE ONLY "public"."paddocks"
    ADD CONSTRAINT "paddocks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."player_availability_flags"
    ADD CONSTRAINT "player_availability_flags_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."player_box_members"
    ADD CONSTRAINT "player_box_members_pkey" PRIMARY KEY ("player_box_id", "user_id");



ALTER TABLE ONLY "public"."player_boxes"
    ADD CONSTRAINT "player_boxes_invite_code_key" UNIQUE ("invite_code");



ALTER TABLE ONLY "public"."player_boxes"
    ADD CONSTRAINT "player_boxes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."player_match_stats"
    ADD CONSTRAINT "player_match_stats_fixture_id_player_id_key" UNIQUE ("fixture_id", "player_id");



ALTER TABLE ONLY "public"."player_match_stats"
    ADD CONSTRAINT "player_match_stats_fixture_player_key" UNIQUE ("fixture_id", "player_id");



ALTER TABLE ONLY "public"."player_match_stats"
    ADD CONSTRAINT "player_match_stats_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."player_status"
    ADD CONSTRAINT "player_status_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."player_status"
    ADD CONSTRAINT "player_status_player_id_key" UNIQUE ("player_id");



ALTER TABLE ONLY "public"."players"
    ADD CONSTRAINT "players_forza_player_id_tournament_id_key" UNIQUE ("forza_player_id", "tournament_id");



ALTER TABLE ONLY "public"."players"
    ADD CONSTRAINT "players_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."projection_snapshots"
    ADD CONSTRAINT "projection_snapshots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."round_backups"
    ADD CONSTRAINT "round_backups_matchday_id_key" UNIQUE ("matchday_id");



ALTER TABLE ONLY "public"."round_backups"
    ADD CONSTRAINT "round_backups_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."scoring_rules"
    ADD CONSTRAINT "scoring_rules_v2_pk" PRIMARY KEY ("tournament_id", "position");



ALTER TABLE ONLY "public"."sports"
    ADD CONSTRAINT "sports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sports"
    ADD CONSTRAINT "sports_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."squad_events"
    ADD CONSTRAINT "squad_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."squad_matchday_snapshots"
    ADD CONSTRAINT "squad_matchday_snapshots_league_id_user_id_matchday_id_key" UNIQUE ("league_id", "user_id", "matchday_id");



ALTER TABLE ONLY "public"."squad_matchday_snapshots"
    ADD CONSTRAINT "squad_matchday_snapshots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."squads"
    ADD CONSTRAINT "squads_league_user_matchday_key" UNIQUE ("league_id", "user_id", "matchday_id");



ALTER TABLE ONLY "public"."squads"
    ADD CONSTRAINT "squads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."teams"
    ADD CONSTRAINT "teams_forza_team_id_key" UNIQUE ("forza_team_id");



ALTER TABLE ONLY "public"."teams"
    ADD CONSTRAINT "teams_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tennis_ace_cards"
    ADD CONSTRAINT "tennis_ace_cards_pkey" PRIMARY KEY ("user_id", "season_year", "card_type");



ALTER TABLE ONLY "public"."tennis_atp_finals_matches"
    ADD CONSTRAINT "tennis_atp_finals_matches_pkey" PRIMARY KEY ("season_year", "match_number");



ALTER TABLE ONLY "public"."tennis_atp_finals_picks"
    ADD CONSTRAINT "tennis_atp_finals_picks_pkey" PRIMARY KEY ("user_id", "season_year", "match_number");



ALTER TABLE ONLY "public"."tennis_qf_captains"
    ADD CONSTRAINT "tennis_qf_captains_pkey" PRIMARY KEY ("user_id", "tournament_id");



ALTER TABLE ONLY "public"."tennis_rosters"
    ADD CONSTRAINT "tennis_rosters_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tennis_rosters"
    ADD CONSTRAINT "tennis_rosters_user_id_tournament_id_key" UNIQUE ("user_id", "tournament_id");



ALTER TABLE ONLY "public"."tennis_seasons"
    ADD CONSTRAINT "tennis_seasons_pkey" PRIMARY KEY ("year");



ALTER TABLE ONLY "public"."tennis_tournament_players"
    ADD CONSTRAINT "tennis_tournament_players_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tennis_tournament_players"
    ADD CONSTRAINT "tennis_tournament_players_tournament_id_player_name_key" UNIQUE ("tournament_id", "player_name");



ALTER TABLE ONLY "public"."tennis_tournament_scores"
    ADD CONSTRAINT "tennis_tournament_scores_pkey" PRIMARY KEY ("user_id", "tournament_id");



ALTER TABLE ONLY "public"."tennis_tournaments"
    ADD CONSTRAINT "tennis_tournaments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."top_scorer_predictions"
    ADD CONSTRAINT "top_scorer_predictions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."top_scorer_predictions"
    ADD CONSTRAINT "top_scorer_predictions_user_id_matchday_id_key" UNIQUE ("user_id", "matchday_id");



ALTER TABLE ONLY "public"."tournaments"
    ADD CONSTRAINT "tournaments_forza_id_key" UNIQUE ("forza_id");



ALTER TABLE ONLY "public"."tournaments"
    ADD CONSTRAINT "tournaments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tournaments"
    ADD CONSTRAINT "tournaments_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."trade_listings"
    ADD CONSTRAINT "trade_listings_league_id_user_id_player_id_key" UNIQUE ("league_id", "user_id", "player_id");



ALTER TABLE ONLY "public"."trade_listings"
    ADD CONSTRAINT "trade_listings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."trade_proposals"
    ADD CONSTRAINT "trade_proposals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."transfer_windows"
    ADD CONSTRAINT "transfer_windows_league_round_unique" UNIQUE ("league_id", "round_number");



ALTER TABLE ONLY "public"."transfer_windows"
    ADD CONSTRAINT "transfer_windows_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."transfers"
    ADD CONSTRAINT "transfers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."trophy_ledger"
    ADD CONSTRAINT "trophy_ledger_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."player_availability_flags"
    ADD CONSTRAINT "unique_player_flag_per_squad" UNIQUE ("squad_id", "player_id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_auction_listings_league_status" ON "public"."auction_listings" USING "btree" ("league_id", "status");



CREATE UNIQUE INDEX "auction_bids_listing_id_bidder_id_key" ON "public"."auction_bids" USING "btree" ("listing_id", "bidder_id");



CREATE INDEX "bet_instances_league_status" ON "public"."bet_instances" USING "btree" ("league_id", "status");



CREATE INDEX "bet_submissions_instance" ON "public"."bet_submissions" USING "btree" ("bet_instance_id");



CREATE INDEX "ch_channels_circle_idx" ON "public"."clubhouse_channels" USING "btree" ("circle_id");



CREATE INDEX "ch_messages_channel_idx" ON "public"."clubhouse_messages" USING "btree" ("channel_id", "created_at" DESC);



CREATE INDEX "ch_notif_user_unread_idx" ON "public"."clubhouse_notifications" USING "btree" ("user_id", "read_at", "created_at" DESC) WHERE ("read_at" IS NULL);



CREATE UNIQUE INDEX "daily_jokers_user_league_matchday_uq" ON "public"."daily_jokers" USING "btree" ("user_id", "league_id", "matchday_id") WHERE ("matchday_id" IS NOT NULL);



CREATE UNIQUE INDEX "daily_jokers_user_league_player_uq" ON "public"."daily_jokers" USING "btree" ("user_id", "league_id", "player_id");



CREATE INDEX "dm_thread_idx" ON "public"."direct_messages" USING "btree" ("circle_id", "from_user_id", "to_user_id", "created_at" DESC);



CREATE INDEX "dm_unread_idx" ON "public"."direct_messages" USING "btree" ("to_user_id", "read_at") WHERE ("read_at" IS NULL);



CREATE UNIQUE INDEX "fixtures_forza_match_id_idx" ON "public"."fixtures" USING "btree" ("forza_match_id") WHERE ("forza_match_id" IS NOT NULL);



CREATE INDEX "frontpage_comments_circle_lookup" ON "public"."frontpage_comments" USING "btree" ("circle_id", "edition_date", "section_key", "created_at") WHERE ("circle_id" IS NOT NULL);



CREATE INDEX "frontpage_comments_lookup" ON "public"."frontpage_comments" USING "btree" ("league_id", "edition_date", "section_key", "created_at");



CREATE UNIQUE INDEX "frontpage_editions_circle_date" ON "public"."frontpage_editions" USING "btree" ("circle_id", "edition_date") WHERE ("circle_id" IS NOT NULL);



CREATE INDEX "frontpage_editions_league_date" ON "public"."frontpage_editions" USING "btree" ("league_id", "edition_date" DESC);



CREATE INDEX "frontpage_reactions_circle_lookup" ON "public"."frontpage_reactions" USING "btree" ("circle_id", "edition_date", "section_key") WHERE ("circle_id" IS NOT NULL);



CREATE UNIQUE INDEX "frontpage_reactions_circle_unique" ON "public"."frontpage_reactions" USING "btree" ("circle_id", "edition_date", "section_key", "user_id", "emoji") WHERE ("circle_id" IS NOT NULL);



CREATE UNIQUE INDEX "frontpage_reactions_league_unique" ON "public"."frontpage_reactions" USING "btree" ("league_id", "edition_date", "section_key", "user_id", "emoji") WHERE ("league_id" IS NOT NULL);



CREATE INDEX "frontpage_reactions_lookup" ON "public"."frontpage_reactions" USING "btree" ("league_id", "edition_date", "section_key");



CREATE INDEX "idx_ce_time" ON "public"."client_errors" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_ce_url" ON "public"."client_errors" USING "btree" ("url", "created_at" DESC);



CREATE INDEX "idx_chat_messages_created_at" ON "public"."chat_messages" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_chat_messages_deleted" ON "public"."chat_messages" USING "btree" ("is_deleted", "league_id");



CREATE INDEX "idx_chat_messages_league_id" ON "public"."chat_messages" USING "btree" ("league_id");



CREATE INDEX "idx_chat_messages_mentions" ON "public"."chat_messages" USING "gin" ("mentioned_user_ids");



CREATE INDEX "idx_daily_jokers_user_date" ON "public"."daily_jokers" USING "btree" ("user_id", "joker_date");



CREATE INDEX "idx_daily_jokers_user_matchday" ON "public"."daily_jokers" USING "btree" ("user_id", "matchday_id") WHERE ("matchday_id" IS NOT NULL);



CREATE INDEX "idx_efe_function_time" ON "public"."edge_function_errors" USING "btree" ("function", "created_at" DESC);



CREATE INDEX "idx_fantasy_points_squad_matchday" ON "public"."fantasy_points" USING "btree" ("squad_id", "matchday_id");



CREATE INDEX "idx_fixtures_tournament_round" ON "public"."fixtures" USING "btree" ("tournament_id", "round_number");



CREATE INDEX "idx_league_chat_read_status_user_league" ON "public"."league_chat_read_status" USING "btree" ("user_id", "league_id");



CREATE INDEX "idx_league_notifications_league_created" ON "public"."league_notifications" USING "btree" ("league_id", "created_at" DESC);



CREATE INDEX "idx_league_notifications_read" ON "public"."league_notifications" USING "btree" ("user_id", "is_read");



CREATE INDEX "idx_league_notifications_user_league" ON "public"."league_notifications" USING "btree" ("user_id", "league_id");



CREATE INDEX "idx_match_events_fixture_player" ON "public"."match_events" USING "btree" ("fixture_id", "player_id");



CREATE INDEX "idx_matchday_deadlines_deadline" ON "public"."matchday_deadlines" USING "btree" ("deadline_at" DESC);



CREATE INDEX "idx_matchday_deadlines_tournament" ON "public"."matchday_deadlines" USING "btree" ("tournament_id");



CREATE INDEX "idx_p2p_challenges_challenger" ON "public"."p2p_challenges" USING "btree" ("challenger_id");



CREATE INDEX "idx_p2p_challenges_league" ON "public"."p2p_challenges" USING "btree" ("league_id");



CREATE INDEX "idx_p2p_challenges_matchday" ON "public"."p2p_challenges" USING "btree" ("matchday_id");



CREATE INDEX "idx_p2p_challenges_opponent" ON "public"."p2p_challenges" USING "btree" ("opponent_id");



CREATE INDEX "idx_p2p_challenges_status" ON "public"."p2p_challenges" USING "btree" ("status");



CREATE INDEX "idx_player_flags_active" ON "public"."player_availability_flags" USING "btree" ("expires_at");



CREATE INDEX "idx_player_flags_league_id" ON "public"."player_availability_flags" USING "btree" ("league_id");



CREATE INDEX "idx_player_flags_player_id" ON "public"."player_availability_flags" USING "btree" ("player_id");



CREATE INDEX "idx_player_flags_squad_id" ON "public"."player_availability_flags" USING "btree" ("squad_id");



CREATE INDEX "idx_player_match_stats_fixture" ON "public"."player_match_stats" USING "btree" ("fixture_id");



CREATE INDEX "idx_player_match_stats_forza_match" ON "public"."player_match_stats" USING "btree" ("forza_match_id") WHERE ("forza_match_id" IS NOT NULL);



CREATE INDEX "idx_players_forza_team" ON "public"."players" USING "btree" ("forza_team_id");



CREATE INDEX "idx_players_tournament" ON "public"."players" USING "btree" ("tournament_id");



CREATE INDEX "idx_teams_tournament" ON "public"."teams" USING "btree" ("tournament_id");



CREATE INDEX "idx_tournaments_sport_id" ON "public"."tournaments" USING "btree" ("sport_id");



CREATE INDEX "idx_trade_proposals_league" ON "public"."trade_proposals" USING "btree" ("league_id", "created_at" DESC);



CREATE INDEX "idx_trade_proposals_proposer" ON "public"."trade_proposals" USING "btree" ("proposer_squad_id", "status");



CREATE INDEX "idx_trade_proposals_target" ON "public"."trade_proposals" USING "btree" ("target_squad_id", "status");



CREATE INDEX "idx_trophy_ledger_circle_user" ON "public"."trophy_ledger" USING "btree" ("circle_id", "user_id");



CREATE UNIQUE INDEX "match_events_ingest_unique" ON "public"."match_events" USING "btree" ("fixture_id", "type", "minute", "player_id") WHERE ("player_id" IS NOT NULL);



CREATE UNIQUE INDEX "players_forza_player_tournament_idx" ON "public"."players" USING "btree" ("forza_player_id", "tournament_id") WHERE (("forza_player_id" IS NOT NULL) AND ("tournament_id" IS NOT NULL));



CREATE UNIQUE INDEX "players_forza_tournament_uniq" ON "public"."players" USING "btree" ("forza_player_id", "tournament_id") WHERE ("forza_player_id" IS NOT NULL);



CREATE INDEX "squad_events_at_idx" ON "public"."squad_events" USING "btree" ("event_at" DESC);



CREATE INDEX "squad_events_league_idx" ON "public"."squad_events" USING "btree" ("league_id");



CREATE INDEX "squad_events_squad_idx" ON "public"."squad_events" USING "btree" ("squad_id");



CREATE INDEX "squad_events_type_idx" ON "public"."squad_events" USING "btree" ("event_type");



CREATE INDEX "squad_events_user_idx" ON "public"."squad_events" USING "btree" ("user_id");



CREATE UNIQUE INDEX "squads_league_tournament_user_matchday_unique" ON "public"."squads" USING "btree" ("league_id", "tournament_id", "user_id", "matchday_id");



CREATE UNIQUE INDEX "tennis_ttp_external_id_idx" ON "public"."tennis_tournament_players" USING "btree" ("tournament_id", "external_player_id") WHERE ("external_player_id" IS NOT NULL);



CREATE OR REPLACE TRIGGER "bet_submissions_reward_update" AFTER UPDATE OF "reward_awarded" ON "public"."bet_submissions" FOR EACH ROW WHEN ((("new"."reward_awarded" IS NOT NULL) AND ("old"."reward_awarded" IS NULL))) EXECUTE FUNCTION "public"."trigger_bet_reward_update"();



CREATE OR REPLACE TRIGGER "chat_rate_limit" BEFORE INSERT ON "public"."chat_messages" FOR EACH ROW EXECUTE FUNCTION "public"."check_chat_rate_limit"();



CREATE OR REPLACE TRIGGER "guard_users_privilege_columns" BEFORE UPDATE ON "public"."users" FOR EACH ROW EXECUTE FUNCTION "public"."guard_users_privilege_columns"();



CREATE OR REPLACE TRIGGER "league_members_rank_recompute" AFTER UPDATE OF "total_points" ON "public"."league_members" FOR EACH ROW WHEN (("new"."total_points" IS DISTINCT FROM "old"."total_points")) EXECUTE FUNCTION "public"."tg_recompute_ranks"();



CREATE OR REPLACE TRIGGER "leagues_cup_seed" AFTER INSERT OR UPDATE OF "cup_phase" ON "public"."leagues" FOR EACH ROW EXECUTE FUNCTION "public"."_trigger_seed_cup_clubs"();



CREATE OR REPLACE TRIGGER "trg_derive_fixture_round_number" BEFORE INSERT OR UPDATE ON "public"."fixtures" FOR EACH ROW EXECUTE FUNCTION "public"."derive_fixture_round_number"();



CREATE OR REPLACE TRIGGER "trg_enforce_position_limit" BEFORE INSERT ON "public"."transfers" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_position_limit"();



CREATE OR REPLACE TRIGGER "trg_enforce_transfer_window" BEFORE INSERT ON "public"."transfers" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_transfer_window"();



CREATE OR REPLACE TRIGGER "trg_guard_coin_wallets" BEFORE INSERT OR DELETE OR UPDATE ON "public"."coin_wallets" FOR EACH ROW EXECUTE FUNCTION "public"."guard_coin_columns"();



CREATE OR REPLACE TRIGGER "trg_guard_daily_joker_deadline" BEFORE INSERT OR UPDATE ON "public"."daily_jokers" FOR EACH ROW EXECUTE FUNCTION "public"."guard_daily_joker_deadline"();



CREATE OR REPLACE TRIGGER "trg_guard_daily_joker_external_player" BEFORE INSERT OR UPDATE ON "public"."daily_jokers" FOR EACH ROW EXECUTE FUNCTION "public"."guard_daily_joker_external_player"();



CREATE OR REPLACE TRIGGER "trg_guard_squad_protected_columns" BEFORE INSERT OR UPDATE ON "public"."squads" FOR EACH ROW EXECUTE FUNCTION "public"."guard_squad_protected_columns"();



CREATE OR REPLACE TRIGGER "trg_notify_direct_message" AFTER INSERT ON "public"."direct_messages" FOR EACH ROW EXECUTE FUNCTION "public"."notify_on_direct_message"();



CREATE OR REPLACE TRIGGER "trg_notify_frontpage_edition" AFTER INSERT ON "public"."frontpage_editions" FOR EACH ROW EXECUTE FUNCTION "public"."notify_on_frontpage_edition"();



CREATE OR REPLACE TRIGGER "trg_notify_gazette_breaking_news" AFTER INSERT ON "public"."gazette_entries" FOR EACH ROW EXECUTE FUNCTION "public"."notify_on_gazette_breaking_news"();



CREATE OR REPLACE TRIGGER "trg_preserve_manual_matchday_id" BEFORE UPDATE ON "public"."fixtures" FOR EACH ROW EXECUTE FUNCTION "public"."preserve_manual_matchday_id"();



CREATE OR REPLACE TRIGGER "trg_sanitize_starting_xi" BEFORE INSERT OR UPDATE OF "players", "starting_xi" ON "public"."squads" FOR EACH ROW EXECUTE FUNCTION "public"."sanitize_starting_xi"();



CREATE OR REPLACE TRIGGER "trg_snapshot_squads_on_kickoff" AFTER UPDATE ON "public"."fixtures" FOR EACH ROW EXECUTE FUNCTION "public"."trg_fn_snapshot_squads_on_kickoff"();



CREATE OR REPLACE TRIGGER "trg_sync_league_mode" BEFORE INSERT OR UPDATE ON "public"."leagues" FOR EACH ROW EXECUTE FUNCTION "public"."sync_league_mode"();



CREATE OR REPLACE TRIGGER "trigger_bet_creation_notification" AFTER INSERT ON "public"."bet_instances" FOR EACH ROW WHEN (("new"."status" = 'open'::"text")) EXECUTE FUNCTION "public"."notify_league_on_bet_creation"();



ALTER TABLE ONLY "public"."auction_bids"
    ADD CONSTRAINT "auction_bids_bidder_id_fkey" FOREIGN KEY ("bidder_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."auction_bids"
    ADD CONSTRAINT "auction_bids_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."auction_bids"
    ADD CONSTRAINT "auction_bids_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "public"."auction_listings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."auction_listings"
    ADD CONSTRAINT "auction_listings_highest_bidder_id_fkey" FOREIGN KEY ("highest_bidder_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."auction_listings"
    ADD CONSTRAINT "auction_listings_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."auction_listings"
    ADD CONSTRAINT "auction_listings_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."auction_listings"
    ADD CONSTRAINT "auction_listings_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "public"."squads"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bet_instances"
    ADD CONSTRAINT "bet_instances_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bet_instances"
    ADD CONSTRAINT "bet_instances_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."bet_templates"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."bet_submissions"
    ADD CONSTRAINT "bet_submissions_bet_instance_id_fkey" FOREIGN KEY ("bet_instance_id") REFERENCES "public"."bet_instances"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bet_submissions"
    ADD CONSTRAINT "bet_submissions_squad_id_fkey" FOREIGN KEY ("squad_id") REFERENCES "public"."squads"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bet_submissions"
    ADD CONSTRAINT "bet_submissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_messages"
    ADD CONSTRAINT "chat_messages_edited_by_fkey" FOREIGN KEY ("edited_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."chat_messages"
    ADD CONSTRAINT "chat_messages_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_messages"
    ADD CONSTRAINT "chat_messages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chips_used"
    ADD CONSTRAINT "chips_used_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chips_used"
    ADD CONSTRAINT "chips_used_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."circle_leagues"
    ADD CONSTRAINT "circle_leagues_circle_id_fkey" FOREIGN KEY ("circle_id") REFERENCES "public"."circles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."circle_leagues"
    ADD CONSTRAINT "circle_leagues_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."circle_members"
    ADD CONSTRAINT "circle_members_circle_id_fkey" FOREIGN KEY ("circle_id") REFERENCES "public"."circles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."circle_members"
    ADD CONSTRAINT "circle_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."circle_paddocks"
    ADD CONSTRAINT "circle_paddocks_circle_id_fkey" FOREIGN KEY ("circle_id") REFERENCES "public"."circles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."circle_paddocks"
    ADD CONSTRAINT "circle_paddocks_paddock_id_fkey" FOREIGN KEY ("paddock_id") REFERENCES "public"."paddocks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."circle_player_boxes"
    ADD CONSTRAINT "circle_player_boxes_circle_id_fkey" FOREIGN KEY ("circle_id") REFERENCES "public"."circles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."circle_player_boxes"
    ADD CONSTRAINT "circle_player_boxes_player_box_id_fkey" FOREIGN KEY ("player_box_id") REFERENCES "public"."player_boxes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."circles"
    ADD CONSTRAINT "circles_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."clubhouse_channels"
    ADD CONSTRAINT "clubhouse_channels_circle_id_fkey" FOREIGN KEY ("circle_id") REFERENCES "public"."circles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."clubhouse_channels"
    ADD CONSTRAINT "clubhouse_channels_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."clubhouse_messages"
    ADD CONSTRAINT "clubhouse_messages_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "public"."clubhouse_channels"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."clubhouse_messages"
    ADD CONSTRAINT "clubhouse_messages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."clubhouse_notifications"
    ADD CONSTRAINT "clubhouse_notifications_circle_id_fkey" FOREIGN KEY ("circle_id") REFERENCES "public"."circles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."clubhouse_notifications"
    ADD CONSTRAINT "clubhouse_notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."coin_transactions"
    ADD CONSTRAINT "coin_transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."coin_wallets"
    ADD CONSTRAINT "coin_wallets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cup_active_clubs"
    ADD CONSTRAINT "cup_active_clubs_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."daily_jokers"
    ADD CONSTRAINT "daily_jokers_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."daily_jokers"
    ADD CONSTRAINT "daily_jokers_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."daily_jokers"
    ADD CONSTRAINT "daily_jokers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."direct_messages"
    ADD CONSTRAINT "direct_messages_circle_id_fkey" FOREIGN KEY ("circle_id") REFERENCES "public"."circles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."direct_messages"
    ADD CONSTRAINT "direct_messages_from_user_id_fkey" FOREIGN KEY ("from_user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."direct_messages"
    ADD CONSTRAINT "direct_messages_to_user_id_fkey" FOREIGN KEY ("to_user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."draft_allocations"
    ADD CONSTRAINT "draft_allocations_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."draft_allocations"
    ADD CONSTRAINT "draft_allocations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."draft_submissions"
    ADD CONSTRAINT "draft_submissions_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."draft_submissions"
    ADD CONSTRAINT "draft_submissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."f1_bets_race"
    ADD CONSTRAINT "f1_bets_race_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."f1_bets_year"
    ADD CONSTRAINT "f1_bets_year_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."f1_scores"
    ADD CONSTRAINT "f1_scores_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."fantasy_points"
    ADD CONSTRAINT "fantasy_points_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id");



ALTER TABLE ONLY "public"."fantasy_points"
    ADD CONSTRAINT "fantasy_points_squad_id_fkey" FOREIGN KEY ("squad_id") REFERENCES "public"."squads"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."fixtures"
    ADD CONSTRAINT "fixtures_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("forza_id");



ALTER TABLE ONLY "public"."coin_transactions"
    ADD CONSTRAINT "fk_coin_transactions_challenge" FOREIGN KEY ("challenge_id") REFERENCES "public"."p2p_challenges"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."frontpage_comments"
    ADD CONSTRAINT "frontpage_comments_circle_id_fkey" FOREIGN KEY ("circle_id") REFERENCES "public"."circles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."frontpage_comments"
    ADD CONSTRAINT "frontpage_comments_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."frontpage_comments"
    ADD CONSTRAINT "frontpage_comments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."frontpage_editions"
    ADD CONSTRAINT "frontpage_editions_circle_id_fkey" FOREIGN KEY ("circle_id") REFERENCES "public"."circles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."frontpage_editions"
    ADD CONSTRAINT "frontpage_editions_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."frontpage_reactions"
    ADD CONSTRAINT "frontpage_reactions_circle_id_fkey" FOREIGN KEY ("circle_id") REFERENCES "public"."circles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."frontpage_reactions"
    ADD CONSTRAINT "frontpage_reactions_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."frontpage_reactions"
    ADD CONSTRAINT "frontpage_reactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."gazette_entries"
    ADD CONSTRAINT "gazette_entries_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."h2h_records"
    ADD CONSTRAINT "h2h_records_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."h2h_records"
    ADD CONSTRAINT "h2h_records_user_a_id_fkey" FOREIGN KEY ("user_a_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."h2h_records"
    ADD CONSTRAINT "h2h_records_user_b_id_fkey" FOREIGN KEY ("user_b_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."h2h_records"
    ADD CONSTRAINT "h2h_records_winner_id_fkey" FOREIGN KEY ("winner_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."h2h_schedule"
    ADD CONSTRAINT "h2h_schedule_away_user_id_fkey" FOREIGN KEY ("away_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."h2h_schedule"
    ADD CONSTRAINT "h2h_schedule_bye_user_id_fkey" FOREIGN KEY ("bye_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."h2h_schedule"
    ADD CONSTRAINT "h2h_schedule_home_user_id_fkey" FOREIGN KEY ("home_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."h2h_schedule"
    ADD CONSTRAINT "h2h_schedule_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."knockout_keep_submissions"
    ADD CONSTRAINT "knockout_keep_submissions_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."knockout_keep_submissions"
    ADD CONSTRAINT "knockout_keep_submissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."league_chat_read_status"
    ADD CONSTRAINT "league_chat_read_status_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."league_chat_read_status"
    ADD CONSTRAINT "league_chat_read_status_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."league_config"
    ADD CONSTRAINT "league_config_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."league_members"
    ADD CONSTRAINT "league_members_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."league_members"
    ADD CONSTRAINT "league_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."league_notifications"
    ADD CONSTRAINT "league_notifications_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."league_notifications"
    ADD CONSTRAINT "league_notifications_triggered_by_user_id_fkey" FOREIGN KEY ("triggered_by_user_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."league_notifications"
    ADD CONSTRAINT "league_notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."leagues"
    ADD CONSTRAINT "leagues_circle_id_fkey" FOREIGN KEY ("circle_id") REFERENCES "public"."circles"("id");



ALTER TABLE ONLY "public"."leagues"
    ADD CONSTRAINT "leagues_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."leagues"
    ADD CONSTRAINT "leagues_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("forza_id");



ALTER TABLE ONLY "public"."match_events"
    ADD CONSTRAINT "match_events_fixture_id_fkey" FOREIGN KEY ("fixture_id") REFERENCES "public"."fixtures"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."match_events"
    ADD CONSTRAINT "match_events_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id");



ALTER TABLE ONLY "public"."matchday_deadlines"
    ADD CONSTRAINT "matchday_deadlines_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("forza_id");



ALTER TABLE ONLY "public"."matchday_recaps"
    ADD CONSTRAINT "matchday_recaps_best_player_id_fkey" FOREIGN KEY ("best_player_id") REFERENCES "public"."players"("id");



ALTER TABLE ONLY "public"."matchday_recaps"
    ADD CONSTRAINT "matchday_recaps_captain_id_fkey" FOREIGN KEY ("captain_id") REFERENCES "public"."players"("id");



ALTER TABLE ONLY "public"."matchday_recaps"
    ADD CONSTRAINT "matchday_recaps_joker_player_id_fkey" FOREIGN KEY ("joker_player_id") REFERENCES "public"."players"("id");



ALTER TABLE ONLY "public"."matchday_recaps"
    ADD CONSTRAINT "matchday_recaps_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."matchday_recaps"
    ADD CONSTRAINT "matchday_recaps_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."p2p_challenges"
    ADD CONSTRAINT "p2p_challenges_challenger_id_fkey" FOREIGN KEY ("challenger_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."p2p_challenges"
    ADD CONSTRAINT "p2p_challenges_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."p2p_challenges"
    ADD CONSTRAINT "p2p_challenges_opponent_id_fkey" FOREIGN KEY ("opponent_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."p2p_challenges"
    ADD CONSTRAINT "p2p_challenges_winner_id_fkey" FOREIGN KEY ("winner_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."p2p_config"
    ADD CONSTRAINT "p2p_config_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."paddock_members"
    ADD CONSTRAINT "paddock_members_paddock_id_fkey" FOREIGN KEY ("paddock_id") REFERENCES "public"."paddocks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."paddock_members"
    ADD CONSTRAINT "paddock_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."paddocks"
    ADD CONSTRAINT "paddocks_circle_id_fkey" FOREIGN KEY ("circle_id") REFERENCES "public"."circles"("id");



ALTER TABLE ONLY "public"."paddocks"
    ADD CONSTRAINT "paddocks_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."paddocks"
    ADD CONSTRAINT "paddocks_sport_id_fkey" FOREIGN KEY ("sport_id") REFERENCES "public"."sports"("id");



ALTER TABLE ONLY "public"."player_availability_flags"
    ADD CONSTRAINT "player_availability_flags_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."player_availability_flags"
    ADD CONSTRAINT "player_availability_flags_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."player_availability_flags"
    ADD CONSTRAINT "player_availability_flags_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."player_availability_flags"
    ADD CONSTRAINT "player_availability_flags_squad_id_fkey" FOREIGN KEY ("squad_id") REFERENCES "public"."squads"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."player_box_members"
    ADD CONSTRAINT "player_box_members_player_box_id_fkey" FOREIGN KEY ("player_box_id") REFERENCES "public"."player_boxes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."player_box_members"
    ADD CONSTRAINT "player_box_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."player_boxes"
    ADD CONSTRAINT "player_boxes_circle_id_fkey" FOREIGN KEY ("circle_id") REFERENCES "public"."circles"("id");



ALTER TABLE ONLY "public"."player_boxes"
    ADD CONSTRAINT "player_boxes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."player_match_stats"
    ADD CONSTRAINT "player_match_stats_fixture_id_fkey" FOREIGN KEY ("fixture_id") REFERENCES "public"."fixtures"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."player_match_stats"
    ADD CONSTRAINT "player_match_stats_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."player_status"
    ADD CONSTRAINT "player_status_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."players"
    ADD CONSTRAINT "players_forza_team_id_fkey" FOREIGN KEY ("forza_team_id") REFERENCES "public"."teams"("forza_team_id");



ALTER TABLE ONLY "public"."players"
    ADD CONSTRAINT "players_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("forza_id");



ALTER TABLE ONLY "public"."projection_snapshots"
    ADD CONSTRAINT "projection_snapshots_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."projection_snapshots"
    ADD CONSTRAINT "projection_snapshots_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."squad_events"
    ADD CONSTRAINT "squad_events_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id");



ALTER TABLE ONLY "public"."squad_events"
    ADD CONSTRAINT "squad_events_squad_id_fkey" FOREIGN KEY ("squad_id") REFERENCES "public"."squads"("id");



ALTER TABLE ONLY "public"."squad_matchday_snapshots"
    ADD CONSTRAINT "squad_matchday_snapshots_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."squad_matchday_snapshots"
    ADD CONSTRAINT "squad_matchday_snapshots_squad_id_fkey" FOREIGN KEY ("squad_id") REFERENCES "public"."squads"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."squad_matchday_snapshots"
    ADD CONSTRAINT "squad_matchday_snapshots_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."squads"
    ADD CONSTRAINT "squads_captain_id_fkey" FOREIGN KEY ("captain_id") REFERENCES "public"."players"("id");



ALTER TABLE ONLY "public"."squads"
    ADD CONSTRAINT "squads_joker_player_id_fkey" FOREIGN KEY ("joker_player_id") REFERENCES "public"."players"("id");



ALTER TABLE ONLY "public"."squads"
    ADD CONSTRAINT "squads_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."squads"
    ADD CONSTRAINT "squads_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("forza_id");



ALTER TABLE ONLY "public"."squads"
    ADD CONSTRAINT "squads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."teams"
    ADD CONSTRAINT "teams_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("forza_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tennis_ace_cards"
    ADD CONSTRAINT "tennis_ace_cards_season_year_fkey" FOREIGN KEY ("season_year") REFERENCES "public"."tennis_seasons"("year");



ALTER TABLE ONLY "public"."tennis_ace_cards"
    ADD CONSTRAINT "tennis_ace_cards_used_tournament_id_fkey" FOREIGN KEY ("used_tournament_id") REFERENCES "public"."tennis_tournaments"("id");



ALTER TABLE ONLY "public"."tennis_ace_cards"
    ADD CONSTRAINT "tennis_ace_cards_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."tennis_atp_finals_matches"
    ADD CONSTRAINT "tennis_atp_finals_matches_player_a_id_fkey" FOREIGN KEY ("player_a_id") REFERENCES "public"."tennis_tournament_players"("id");



ALTER TABLE ONLY "public"."tennis_atp_finals_matches"
    ADD CONSTRAINT "tennis_atp_finals_matches_player_b_id_fkey" FOREIGN KEY ("player_b_id") REFERENCES "public"."tennis_tournament_players"("id");



ALTER TABLE ONLY "public"."tennis_atp_finals_matches"
    ADD CONSTRAINT "tennis_atp_finals_matches_season_year_fkey" FOREIGN KEY ("season_year") REFERENCES "public"."tennis_seasons"("year");



ALTER TABLE ONLY "public"."tennis_atp_finals_matches"
    ADD CONSTRAINT "tennis_atp_finals_matches_winner_player_id_fkey" FOREIGN KEY ("winner_player_id") REFERENCES "public"."tennis_tournament_players"("id");



ALTER TABLE ONLY "public"."tennis_atp_finals_picks"
    ADD CONSTRAINT "tennis_atp_finals_picks_picked_player_id_fkey" FOREIGN KEY ("picked_player_id") REFERENCES "public"."tennis_tournament_players"("id");



ALTER TABLE ONLY "public"."tennis_atp_finals_picks"
    ADD CONSTRAINT "tennis_atp_finals_picks_season_year_fkey" FOREIGN KEY ("season_year") REFERENCES "public"."tennis_seasons"("year");



ALTER TABLE ONLY "public"."tennis_atp_finals_picks"
    ADD CONSTRAINT "tennis_atp_finals_picks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."tennis_qf_captains"
    ADD CONSTRAINT "tennis_qf_captains_captain_player_id_fkey" FOREIGN KEY ("captain_player_id") REFERENCES "public"."tennis_tournament_players"("id");



ALTER TABLE ONLY "public"."tennis_qf_captains"
    ADD CONSTRAINT "tennis_qf_captains_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "public"."tennis_tournaments"("id");



ALTER TABLE ONLY "public"."tennis_qf_captains"
    ADD CONSTRAINT "tennis_qf_captains_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."tennis_rosters"
    ADD CONSTRAINT "tennis_rosters_tier1_player_id_fkey" FOREIGN KEY ("tier1_player_id") REFERENCES "public"."tennis_tournament_players"("id");



ALTER TABLE ONLY "public"."tennis_rosters"
    ADD CONSTRAINT "tennis_rosters_tier2a_player_id_fkey" FOREIGN KEY ("tier2a_player_id") REFERENCES "public"."tennis_tournament_players"("id");



ALTER TABLE ONLY "public"."tennis_rosters"
    ADD CONSTRAINT "tennis_rosters_tier2b_player_id_fkey" FOREIGN KEY ("tier2b_player_id") REFERENCES "public"."tennis_tournament_players"("id");



ALTER TABLE ONLY "public"."tennis_rosters"
    ADD CONSTRAINT "tennis_rosters_tier3a_player_id_fkey" FOREIGN KEY ("tier3a_player_id") REFERENCES "public"."tennis_tournament_players"("id");



ALTER TABLE ONLY "public"."tennis_rosters"
    ADD CONSTRAINT "tennis_rosters_tier3b_player_id_fkey" FOREIGN KEY ("tier3b_player_id") REFERENCES "public"."tennis_tournament_players"("id");



ALTER TABLE ONLY "public"."tennis_rosters"
    ADD CONSTRAINT "tennis_rosters_tier4a_player_id_fkey" FOREIGN KEY ("tier4a_player_id") REFERENCES "public"."tennis_tournament_players"("id");



ALTER TABLE ONLY "public"."tennis_rosters"
    ADD CONSTRAINT "tennis_rosters_tier4b_player_id_fkey" FOREIGN KEY ("tier4b_player_id") REFERENCES "public"."tennis_tournament_players"("id");



ALTER TABLE ONLY "public"."tennis_rosters"
    ADD CONSTRAINT "tennis_rosters_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "public"."tennis_tournaments"("id");



ALTER TABLE ONLY "public"."tennis_rosters"
    ADD CONSTRAINT "tennis_rosters_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."tennis_tournament_players"
    ADD CONSTRAINT "tennis_tournament_players_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "public"."tennis_tournaments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tennis_tournament_scores"
    ADD CONSTRAINT "tennis_tournament_scores_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "public"."tennis_tournaments"("id");



ALTER TABLE ONLY "public"."tennis_tournament_scores"
    ADD CONSTRAINT "tennis_tournament_scores_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."tennis_tournaments"
    ADD CONSTRAINT "tennis_tournaments_season_year_fkey" FOREIGN KEY ("season_year") REFERENCES "public"."tennis_seasons"("year");



ALTER TABLE ONLY "public"."top_scorer_predictions"
    ADD CONSTRAINT "top_scorer_predictions_actual_top_scorer_id_fkey" FOREIGN KEY ("actual_top_scorer_id") REFERENCES "public"."players"("id");



ALTER TABLE ONLY "public"."top_scorer_predictions"
    ADD CONSTRAINT "top_scorer_predictions_predicted_player_id_fkey" FOREIGN KEY ("predicted_player_id") REFERENCES "public"."players"("id");



ALTER TABLE ONLY "public"."tournaments"
    ADD CONSTRAINT "tournaments_sport_id_fkey" FOREIGN KEY ("sport_id") REFERENCES "public"."sports"("id");



ALTER TABLE ONLY "public"."trade_listings"
    ADD CONSTRAINT "trade_listings_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trade_listings"
    ADD CONSTRAINT "trade_listings_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trade_listings"
    ADD CONSTRAINT "trade_listings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trade_proposals"
    ADD CONSTRAINT "trade_proposals_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trade_proposals"
    ADD CONSTRAINT "trade_proposals_proposer_player_id_fkey" FOREIGN KEY ("proposer_player_id") REFERENCES "public"."players"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trade_proposals"
    ADD CONSTRAINT "trade_proposals_proposer_squad_id_fkey" FOREIGN KEY ("proposer_squad_id") REFERENCES "public"."squads"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trade_proposals"
    ADD CONSTRAINT "trade_proposals_target_player_id_fkey" FOREIGN KEY ("target_player_id") REFERENCES "public"."players"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trade_proposals"
    ADD CONSTRAINT "trade_proposals_target_squad_id_fkey" FOREIGN KEY ("target_squad_id") REFERENCES "public"."squads"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."transfer_windows"
    ADD CONSTRAINT "transfer_windows_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."transfers"
    ADD CONSTRAINT "transfers_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."transfers"
    ADD CONSTRAINT "transfers_player_in_fkey" FOREIGN KEY ("player_in") REFERENCES "public"."players"("id");



ALTER TABLE ONLY "public"."transfers"
    ADD CONSTRAINT "transfers_player_out_fkey" FOREIGN KEY ("player_out") REFERENCES "public"."players"("id");



ALTER TABLE ONLY "public"."transfers"
    ADD CONSTRAINT "transfers_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("forza_id");



ALTER TABLE ONLY "public"."transfers"
    ADD CONSTRAINT "transfers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trophy_ledger"
    ADD CONSTRAINT "trophy_ledger_circle_id_fkey" FOREIGN KEY ("circle_id") REFERENCES "public"."circles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trophy_ledger"
    ADD CONSTRAINT "trophy_ledger_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id");



ALTER TABLE ONLY "public"."trophy_ledger"
    ADD CONSTRAINT "trophy_ledger_sport_id_fkey" FOREIGN KEY ("sport_id") REFERENCES "public"."sports"("id");



ALTER TABLE ONLY "public"."trophy_ledger"
    ADD CONSTRAINT "trophy_ledger_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id");



ALTER TABLE ONLY "public"."trophy_ledger"
    ADD CONSTRAINT "trophy_ledger_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



CREATE POLICY "Authenticated users can read tournaments" ON "public"."tournaments" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Delete own chat messages" ON "public"."chat_messages" FOR DELETE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Edit own messages" ON "public"."chat_messages" FOR UPDATE USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Insert own chat messages" ON "public"."chat_messages" FOR INSERT WITH CHECK ((("user_id" = "auth"."uid"()) AND ("league_id" IN ( SELECT "league_members"."league_id"
   FROM "public"."league_members"
  WHERE ("league_members"."user_id" = "auth"."uid"())))));



CREATE POLICY "Insert own chat read status" ON "public"."league_chat_read_status" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Members read snapshots" ON "public"."squad_matchday_snapshots" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."league_members" "lm"
  WHERE (("lm"."league_id" = "squad_matchday_snapshots"."league_id") AND ("lm"."user_id" = "auth"."uid"())))));



CREATE POLICY "Seller can cancel own listing (no bids)" ON "public"."auction_listings" FOR UPDATE USING (((EXISTS ( SELECT 1
   FROM "public"."squads" "s"
  WHERE (("s"."id" = "auction_listings"."seller_id") AND ("s"."user_id" = "auth"."uid"())))) AND ("highest_bidder_id" IS NULL)));



CREATE POLICY "Update own chat read status" ON "public"."league_chat_read_status" FOR UPDATE USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can update own notification read status" ON "public"."league_notifications" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own notifications" ON "public"."league_notifications" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "View league chat messages" ON "public"."chat_messages" FOR SELECT USING (("league_id" IN ( SELECT "league_members"."league_id"
   FROM "public"."league_members"
  WHERE ("league_members"."user_id" = "auth"."uid"()))));



CREATE POLICY "View own chat read status" ON "public"."league_chat_read_status" FOR SELECT USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."auction_listings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "authenticated members read gazette_entries" ON "public"."gazette_entries" FOR SELECT USING ((("auth"."role"() = 'authenticated'::"text") AND "public"."is_league_member"("league_id")));



CREATE POLICY "authenticated read match_events" ON "public"."match_events" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "authenticated read matchday_deadlines" ON "public"."matchday_deadlines" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "authenticated read player_match_stats" ON "public"."player_match_stats" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "authenticated read scoring_rules_v2" ON "public"."scoring_rules" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "authenticated read teams" ON "public"."teams" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "authenticated users can read fixtures" ON "public"."fixtures" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "authenticated users can read players" ON "public"."players" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "authenticated users view bet templates" ON "public"."bet_templates" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



ALTER TABLE "public"."bet_instances" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."bet_submissions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."bet_templates" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ch_channels_member_read" ON "public"."clubhouse_channels" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."circle_members"
  WHERE (("circle_members"."circle_id" = "clubhouse_channels"."circle_id") AND ("circle_members"."user_id" = "auth"."uid"())))));



CREATE POLICY "ch_channels_owner_insert" ON "public"."clubhouse_channels" FOR INSERT WITH CHECK ((("auth"."uid"() = "created_by") AND (EXISTS ( SELECT 1
   FROM "public"."circle_members"
  WHERE (("circle_members"."circle_id" = "clubhouse_channels"."circle_id") AND ("circle_members"."user_id" = "auth"."uid"()) AND ("circle_members"."role" = 'owner'::"text"))))));



CREATE POLICY "ch_messages_member_insert" ON "public"."clubhouse_messages" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") AND (EXISTS ( SELECT 1
   FROM ("public"."clubhouse_channels" "cc"
     JOIN "public"."circle_members" "cm" ON (("cm"."circle_id" = "cc"."circle_id")))
  WHERE (("cc"."id" = "clubhouse_messages"."channel_id") AND ("cm"."user_id" = "auth"."uid"()))))));



CREATE POLICY "ch_messages_member_read" ON "public"."clubhouse_messages" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."clubhouse_channels" "cc"
     JOIN "public"."circle_members" "cm" ON (("cm"."circle_id" = "cc"."circle_id")))
  WHERE (("cc"."id" = "clubhouse_messages"."channel_id") AND ("cm"."user_id" = "auth"."uid"())))));



CREATE POLICY "ch_messages_own_delete" ON "public"."clubhouse_messages" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "ch_notif_own_read" ON "public"."clubhouse_notifications" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "ch_notif_own_update" ON "public"."clubhouse_notifications" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."chat_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."circle_leagues" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "circle_leagues_member_read" ON "public"."circle_leagues" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."circle_members"
  WHERE (("circle_members"."circle_id" = "circle_leagues"."circle_id") AND ("circle_members"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."circle_members" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "circle_members_member_read" ON "public"."circle_members" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."circle_members" "cm"
  WHERE (("cm"."circle_id" = "circle_members"."circle_id") AND ("cm"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."circle_paddocks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "circle_paddocks_member_read" ON "public"."circle_paddocks" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."circle_members" "cm"
  WHERE (("cm"."circle_id" = "circle_paddocks"."circle_id") AND ("cm"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."circle_player_boxes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "circle_player_boxes_select" ON "public"."circle_player_boxes" FOR SELECT TO "authenticated" USING (("circle_id" IN ( SELECT "circle_members"."circle_id"
   FROM "public"."circle_members"
  WHERE ("circle_members"."user_id" = "auth"."uid"()))));



ALTER TABLE "public"."circles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "circles_member_read" ON "public"."circles" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."circle_members"
  WHERE (("circle_members"."circle_id" = "circles"."id") AND ("circle_members"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."client_errors" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."club_cap_rules" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "club_cap_rules_read_all" ON "public"."club_cap_rules" FOR SELECT USING (true);



ALTER TABLE "public"."clubhouse_channels" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."clubhouse_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."clubhouse_notifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."coin_packs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "coin_packs_select" ON "public"."coin_packs" FOR SELECT USING (("is_active" = true));



ALTER TABLE "public"."coin_transactions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "coin_transactions_own_read" ON "public"."coin_transactions" FOR SELECT USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."coin_wallets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "coin_wallets_own_read" ON "public"."coin_wallets" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "commissioner manages bet instances" ON "public"."bet_instances" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."league_members" "lm"
  WHERE (("lm"."league_id" = "bet_instances"."league_id") AND ("lm"."user_id" = "auth"."uid"()) AND ("lm"."role" = 'commissioner'::"text")))));



CREATE POLICY "commissioner updates bet instances" ON "public"."bet_instances" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."league_members" "lm"
  WHERE (("lm"."league_id" = "bet_instances"."league_id") AND ("lm"."user_id" = "auth"."uid"()) AND ("lm"."role" = 'commissioner'::"text")))));



CREATE POLICY "commissioners can insert gazette_entries" ON "public"."gazette_entries" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."league_members"
  WHERE (("league_members"."league_id" = "gazette_entries"."league_id") AND ("league_members"."user_id" = "auth"."uid"()) AND ("league_members"."role" = 'commissioner'::"text")))));



CREATE POLICY "commissioners can insert transfer_windows" ON "public"."transfer_windows" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."league_members"
  WHERE (("league_members"."league_id" = "transfer_windows"."league_id") AND ("league_members"."user_id" = "auth"."uid"()) AND ("league_members"."role" = 'commissioner'::"text")))));



CREATE POLICY "commissioners can update transfer_windows" ON "public"."transfer_windows" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."league_members"
  WHERE (("league_members"."league_id" = "transfer_windows"."league_id") AND ("league_members"."user_id" = "auth"."uid"()) AND ("league_members"."role" = 'commissioner'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."league_members"
  WHERE (("league_members"."league_id" = "transfer_windows"."league_id") AND ("league_members"."user_id" = "auth"."uid"()) AND ("league_members"."role" = 'commissioner'::"text")))));



CREATE POLICY "creator can update league" ON "public"."leagues" FOR UPDATE TO "authenticated" USING (("created_by" = "auth"."uid"())) WITH CHECK (("created_by" = "auth"."uid"()));



ALTER TABLE "public"."cup_active_clubs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."daily_jokers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."direct_messages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "dm_member_send" ON "public"."direct_messages" FOR INSERT WITH CHECK ((("auth"."uid"() = "from_user_id") AND (EXISTS ( SELECT 1
   FROM "public"."circle_members"
  WHERE (("circle_members"."circle_id" = "direct_messages"."circle_id") AND ("circle_members"."user_id" = "auth"."uid"())))) AND (EXISTS ( SELECT 1
   FROM "public"."circle_members"
  WHERE (("circle_members"."circle_id" = "direct_messages"."circle_id") AND ("circle_members"."user_id" = "direct_messages"."to_user_id"))))));



CREATE POLICY "dm_participants_read" ON "public"."direct_messages" FOR SELECT USING ((("auth"."uid"() = "from_user_id") OR ("auth"."uid"() = "to_user_id")));



CREATE POLICY "dm_recipient_update" ON "public"."direct_messages" FOR UPDATE USING (("auth"."uid"() = "to_user_id")) WITH CHECK (("auth"."uid"() = "to_user_id"));



ALTER TABLE "public"."draft_allocations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."draft_submissions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "draft_submissions_public_read" ON "public"."draft_submissions" FOR SELECT USING (true);



ALTER TABLE "public"."edge_function_errors" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."f1_bets_race" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "f1_bets_race_own_insert" ON "public"."f1_bets_race" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") AND (NOT (EXISTS ( SELECT 1
   FROM "public"."f1_races" "r"
  WHERE (("r"."season" = "f1_bets_race"."season") AND ("r"."round_number" = "f1_bets_race"."round_number") AND ("r"."is_manual_unlock" = false) AND ("r"."race_at" IS NOT NULL) AND (("r"."race_at" - '00:05:00'::interval) <= "now"())))))));



CREATE POLICY "f1_bets_race_own_update" ON "public"."f1_bets_race" FOR UPDATE USING ((("auth"."uid"() = "user_id") AND (NOT "is_locked")));



CREATE POLICY "f1_bets_race_public_read" ON "public"."f1_bets_race" FOR SELECT USING (true);



ALTER TABLE "public"."f1_bets_year" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "f1_bets_year_own_insert" ON "public"."f1_bets_year" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") AND (NOT "is_locked")));



CREATE POLICY "f1_bets_year_own_update" ON "public"."f1_bets_year" FOR UPDATE USING ((("auth"."uid"() = "user_id") AND (NOT "is_locked")));



CREATE POLICY "f1_bets_year_public_read" ON "public"."f1_bets_year" FOR SELECT USING (true);



ALTER TABLE "public"."f1_races" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "f1_races_admin_write" ON "public"."f1_races" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true)))));



CREATE POLICY "f1_races_public_read" ON "public"."f1_races" FOR SELECT USING (true);



ALTER TABLE "public"."f1_scores" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "f1_scores_admin_write" ON "public"."f1_scores" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true)))));



CREATE POLICY "f1_scores_public_read" ON "public"."f1_scores" FOR SELECT USING (true);



ALTER TABLE "public"."f1_year_results" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "f1_year_results_admin_write" ON "public"."f1_year_results" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true)))));



CREATE POLICY "f1_year_results_public_read" ON "public"."f1_year_results" FOR SELECT USING (true);



ALTER TABLE "public"."fantasy_points" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."fixtures" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "flag_own_players" ON "public"."player_availability_flags" FOR INSERT WITH CHECK ((("created_by" = "auth"."uid"()) AND ("squad_id" IN ( SELECT "squads"."id"
   FROM "public"."squads"
  WHERE ("squads"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."frontpage_comments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "frontpage_comments_circle_delete" ON "public"."frontpage_comments" FOR DELETE USING ((("circle_id" IS NULL) OR ("auth"."uid"() = "user_id") OR (EXISTS ( SELECT 1
   FROM "public"."circle_members" "cm"
  WHERE (("cm"."circle_id" = "frontpage_comments"."circle_id") AND ("cm"."user_id" = "auth"."uid"()) AND ("cm"."role" = 'owner'::"text"))))));



CREATE POLICY "frontpage_comments_circle_insert" ON "public"."frontpage_comments" FOR INSERT WITH CHECK ((("circle_id" IS NULL) OR (("auth"."uid"() = "user_id") AND (EXISTS ( SELECT 1
   FROM "public"."circle_members" "cm"
  WHERE (("cm"."circle_id" = "frontpage_comments"."circle_id") AND ("cm"."user_id" = "auth"."uid"())))))));



CREATE POLICY "frontpage_comments_circle_select" ON "public"."frontpage_comments" FOR SELECT USING ((("circle_id" IS NULL) OR (EXISTS ( SELECT 1
   FROM "public"."circle_members" "cm"
  WHERE (("cm"."circle_id" = "frontpage_comments"."circle_id") AND ("cm"."user_id" = "auth"."uid"()))))));



CREATE POLICY "frontpage_comments_delete" ON "public"."frontpage_comments" FOR DELETE USING ((("auth"."uid"() = "user_id") OR (EXISTS ( SELECT 1
   FROM "public"."league_members" "lm"
  WHERE (("lm"."league_id" = "frontpage_comments"."league_id") AND ("lm"."user_id" = "auth"."uid"()) AND ("lm"."role" = 'commissioner'::"text"))))));



CREATE POLICY "frontpage_comments_insert" ON "public"."frontpage_comments" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") AND (EXISTS ( SELECT 1
   FROM "public"."league_members" "lm"
  WHERE (("lm"."league_id" = "frontpage_comments"."league_id") AND ("lm"."user_id" = "auth"."uid"()))))));



CREATE POLICY "frontpage_comments_select" ON "public"."frontpage_comments" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."league_members" "lm"
  WHERE (("lm"."league_id" = "frontpage_comments"."league_id") AND ("lm"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."frontpage_editions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "frontpage_editions_circle_select" ON "public"."frontpage_editions" FOR SELECT USING ((("circle_id" IS NULL) OR (EXISTS ( SELECT 1
   FROM "public"."circle_members" "cm"
  WHERE (("cm"."circle_id" = "frontpage_editions"."circle_id") AND ("cm"."user_id" = "auth"."uid"()))))));



CREATE POLICY "frontpage_editions_member_select" ON "public"."frontpage_editions" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."league_members" "lm"
  WHERE (("lm"."league_id" = "frontpage_editions"."league_id") AND ("lm"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."frontpage_reactions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "frontpage_reactions_circle_insert" ON "public"."frontpage_reactions" FOR INSERT WITH CHECK ((("circle_id" IS NULL) OR (("auth"."uid"() = "user_id") AND (EXISTS ( SELECT 1
   FROM "public"."circle_members" "cm"
  WHERE (("cm"."circle_id" = "frontpage_reactions"."circle_id") AND ("cm"."user_id" = "auth"."uid"())))))));



CREATE POLICY "frontpage_reactions_circle_select" ON "public"."frontpage_reactions" FOR SELECT USING ((("circle_id" IS NULL) OR (EXISTS ( SELECT 1
   FROM "public"."circle_members" "cm"
  WHERE (("cm"."circle_id" = "frontpage_reactions"."circle_id") AND ("cm"."user_id" = "auth"."uid"()))))));



CREATE POLICY "frontpage_reactions_delete" ON "public"."frontpage_reactions" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "frontpage_reactions_insert" ON "public"."frontpage_reactions" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") AND (EXISTS ( SELECT 1
   FROM "public"."league_members" "lm"
  WHERE (("lm"."league_id" = "frontpage_reactions"."league_id") AND ("lm"."user_id" = "auth"."uid"()))))));



CREATE POLICY "frontpage_reactions_select" ON "public"."frontpage_reactions" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."league_members" "lm"
  WHERE (("lm"."league_id" = "frontpage_reactions"."league_id") AND ("lm"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."gazette_entries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."h2h_schedule" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "h2h_schedule_league_members_select" ON "public"."h2h_schedule" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."league_members" "lm"
  WHERE (("lm"."league_id" = "h2h_schedule"."league_id") AND ("lm"."user_id" = "auth"."uid"())))));



CREATE POLICY "keep_submissions_insert" ON "public"."knockout_keep_submissions" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "keep_submissions_select" ON "public"."knockout_keep_submissions" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."league_members"
  WHERE (("league_members"."league_id" = "knockout_keep_submissions"."league_id") AND ("league_members"."user_id" = "auth"."uid"())))));



CREATE POLICY "keep_submissions_update" ON "public"."knockout_keep_submissions" FOR UPDATE USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."knockout_keep_submissions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "league members can read squads in their leagues" ON "public"."squads" FOR SELECT TO "authenticated" USING ("public"."is_league_member"("league_id"));



CREATE POLICY "league members manage trade_listings" ON "public"."trade_listings" TO "authenticated" USING ("public"."is_league_member"("league_id")) WITH CHECK ("public"."is_league_member"("league_id"));



CREATE POLICY "league members read bet_instances" ON "public"."bet_instances" FOR SELECT TO "authenticated" USING ("public"."is_league_member"("league_id"));



CREATE POLICY "league members read cup_active_clubs" ON "public"."cup_active_clubs" FOR SELECT TO "authenticated" USING ("public"."is_league_member"("league_id"));



CREATE POLICY "league members read draft_allocations" ON "public"."draft_allocations" FOR SELECT TO "authenticated" USING ("public"."is_league_member"("league_id"));



CREATE POLICY "league members read fantasy_points" ON "public"."fantasy_points" FOR SELECT TO "authenticated" USING ("public"."is_league_member"(( SELECT "squads"."league_id"
   FROM "public"."squads"
  WHERE ("squads"."id" = "fantasy_points"."squad_id")
 LIMIT 1)));



CREATE POLICY "league members read gazette_entries" ON "public"."gazette_entries" FOR SELECT TO "authenticated" USING ("public"."is_league_member"("league_id"));



CREATE POLICY "league members read transfer_windows" ON "public"."transfer_windows" FOR SELECT TO "authenticated" USING ("public"."is_league_member"("league_id"));



CREATE POLICY "league members view auctions" ON "public"."auction_listings" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."league_members" "lm"
  WHERE (("lm"."league_id" = "auction_listings"."league_id") AND ("lm"."user_id" = "auth"."uid"())))));



CREATE POLICY "league members view bet instances" ON "public"."bet_instances" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."league_members" "lm"
  WHERE (("lm"."league_id" = "bet_instances"."league_id") AND ("lm"."user_id" = "auth"."uid"())))));



CREATE POLICY "league members view submissions" ON "public"."bet_submissions" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."bet_instances" "bi"
     JOIN "public"."league_members" "lm" ON (("lm"."league_id" = "bi"."league_id")))
  WHERE (("bi"."id" = "bet_submissions"."bet_instance_id") AND ("lm"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."league_chat_read_status" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "league_config_commissioner_write" ON "public"."league_config" USING ((EXISTS ( SELECT 1
   FROM "public"."league_members" "lm"
  WHERE (("lm"."league_id" = "league_config"."league_id") AND ("lm"."user_id" = "auth"."uid"()) AND ("lm"."role" = 'commissioner'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."league_members" "lm"
  WHERE (("lm"."league_id" = "league_config"."league_id") AND ("lm"."user_id" = "auth"."uid"()) AND ("lm"."role" = 'commissioner'::"text")))));



CREATE POLICY "league_config_member_read" ON "public"."league_config" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."league_members" "lm"
  WHERE (("lm"."league_id" = "league_config"."league_id") AND ("lm"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."league_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."league_notifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."leagues" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "leagues: commissioner update" ON "public"."leagues" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."league_members"
  WHERE (("league_members"."league_id" = "leagues"."id") AND ("league_members"."user_id" = "auth"."uid"()) AND ("league_members"."role" = 'commissioner'::"text")))));



ALTER TABLE "public"."match_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."matchday_deadlines" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "members can read league rosters" ON "public"."league_members" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR "public"."is_league_member"("league_id")));



CREATE POLICY "members can read their leagues" ON "public"."leagues" FOR SELECT TO "authenticated" USING ("public"."is_league_member"("id"));



CREATE POLICY "no client access to error log" ON "public"."edge_function_errors" USING (false);



CREATE POLICY "no client reads" ON "public"."client_errors" USING (false);



ALTER TABLE "public"."p2p_challenges" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "p2p_challenges_select" ON "public"."p2p_challenges" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."league_members"
  WHERE (("league_members"."league_id" = "p2p_challenges"."league_id") AND ("league_members"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."p2p_config" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "p2p_config_select" ON "public"."p2p_config" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."league_members"
  WHERE (("league_members"."league_id" = "p2p_config"."league_id") AND ("league_members"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."paddock_members" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "paddock_members_member_read" ON "public"."paddock_members" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."paddock_members" "pm"
  WHERE (("pm"."paddock_id" = "paddock_members"."paddock_id") AND ("pm"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."paddocks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "paddocks_member_read" ON "public"."paddocks" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."paddock_members" "pm"
  WHERE (("pm"."paddock_id" = "paddocks"."id") AND ("pm"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."player_availability_flags" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."player_box_members" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "player_box_members_select" ON "public"."player_box_members" FOR SELECT TO "authenticated" USING (("player_box_id" IN ( SELECT "player_box_members_1"."player_box_id"
   FROM "public"."player_box_members" "player_box_members_1"
  WHERE ("player_box_members_1"."user_id" = "auth"."uid"()))));



ALTER TABLE "public"."player_boxes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "player_boxes_insert" ON "public"."player_boxes" FOR INSERT TO "authenticated" WITH CHECK (("created_by" = "auth"."uid"()));



CREATE POLICY "player_boxes_select" ON "public"."player_boxes" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "player_boxes_update" ON "public"."player_boxes" FOR UPDATE TO "authenticated" USING (("created_by" = "auth"."uid"()));



ALTER TABLE "public"."player_match_stats" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."players" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "remove_own_flags" ON "public"."player_availability_flags" FOR DELETE USING (("created_by" = "auth"."uid"()));



ALTER TABLE "public"."round_backups" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."scoring_rules" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "seller owns squad and is league member" ON "public"."auction_listings" FOR INSERT WITH CHECK ((("auth"."uid"() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."squads" "s"
  WHERE (("s"."id" = "auction_listings"."seller_id") AND ("s"."user_id" = "auth"."uid"())))) AND (EXISTS ( SELECT 1
   FROM "public"."league_members" "lm"
  WHERE (("lm"."league_id" = "auction_listings"."league_id") AND ("lm"."user_id" = "auth"."uid"()))))));



ALTER TABLE "public"."sports" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "sports_public_read" ON "public"."sports" FOR SELECT USING (true);



CREATE POLICY "squad owner submits bet" ON "public"."bet_submissions" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") AND (EXISTS ( SELECT 1
   FROM "public"."squads" "s"
  WHERE (("s"."id" = "bet_submissions"."squad_id") AND ("s"."user_id" = "auth"."uid"())))) AND (EXISTS ( SELECT 1
   FROM "public"."bet_instances" "bi"
  WHERE (("bi"."id" = "bet_submissions"."bet_instance_id") AND ("bi"."status" = 'open'::"text") AND ("bi"."deadline_at" > "now"()))))));



CREATE POLICY "squad owner updates own bet" ON "public"."bet_submissions" FOR UPDATE USING ((("auth"."uid"() = "user_id") AND (EXISTS ( SELECT 1
   FROM "public"."bet_instances" "bi"
  WHERE (("bi"."id" = "bet_submissions"."bet_instance_id") AND ("bi"."status" = 'open'::"text") AND ("bi"."deadline_at" > "now"()))))));



ALTER TABLE "public"."squad_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "squad_events_commissioner_read" ON "public"."squad_events" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."league_members"
  WHERE (("league_members"."league_id" = "squad_events"."league_id") AND ("league_members"."user_id" = "auth"."uid"()) AND ("league_members"."role" = 'commissioner'::"text")))));



CREATE POLICY "squad_events_own_read" ON "public"."squad_events" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."squad_matchday_snapshots" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."squads" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "squads_update_safe" ON "public"."squads" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."teams" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tennis_ace_cards" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tennis_ace_cards_select" ON "public"."tennis_ace_cards" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."tennis_atp_finals_matches" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tennis_atp_finals_matches_select" ON "public"."tennis_atp_finals_matches" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."tennis_atp_finals_picks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tennis_atp_finals_picks_select" ON "public"."tennis_atp_finals_picks" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."tennis_qf_captains" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tennis_qf_captains_select" ON "public"."tennis_qf_captains" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."tennis_rosters" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tennis_rosters_select" ON "public"."tennis_rosters" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."tennis_seasons" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tennis_seasons_select" ON "public"."tennis_seasons" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."tennis_tournament_players" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tennis_tournament_scores" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tennis_tournament_scores_select" ON "public"."tennis_tournament_scores" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."player_box_members" "pbm"
  WHERE (("pbm"."user_id" = "auth"."uid"()) AND ("pbm"."player_box_id" IN ( SELECT "player_box_members"."player_box_id"
           FROM "public"."player_box_members"
          WHERE ("player_box_members"."user_id" = "tennis_tournament_scores"."user_id"))))))));



ALTER TABLE "public"."tennis_tournaments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tennis_tournaments_select" ON "public"."tennis_tournaments" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "tennis_tournaments_service_update" ON "public"."tennis_tournaments" FOR UPDATE TO "service_role" USING (true);



CREATE POLICY "tournaments_public_read" ON "public"."tournaments" FOR SELECT USING (true);



ALTER TABLE "public"."trade_listings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."trade_proposals" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "trade_proposals_insert_denied" ON "public"."trade_proposals" FOR INSERT WITH CHECK (false);



CREATE POLICY "trade_proposals_select" ON "public"."trade_proposals" FOR SELECT USING (("league_id" IN ( SELECT "league_members"."league_id"
   FROM "public"."league_members"
  WHERE ("league_members"."user_id" = "auth"."uid"()))));



CREATE POLICY "trade_proposals_update_denied" ON "public"."trade_proposals" FOR UPDATE USING (false);



ALTER TABLE "public"."transfer_windows" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."transfers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."trophy_ledger" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "trophy_ledger_member_read" ON "public"."trophy_ledger" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."circle_members"
  WHERE (("circle_members"."circle_id" = "trophy_ledger"."circle_id") AND ("circle_members"."user_id" = "auth"."uid"())))));



CREATE POLICY "ttp_select" ON "public"."tennis_tournament_players" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "users can create own profile" ON "public"."users" FOR INSERT TO "authenticated" WITH CHECK (("id" = "auth"."uid"()));



CREATE POLICY "users can create own squad" ON "public"."squads" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "users can join leagues as themselves" ON "public"."league_members" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "users can update own profile" ON "public"."users" FOR UPDATE TO "authenticated" USING (("id" = "auth"."uid"())) WITH CHECK (("id" = "auth"."uid"()));



CREATE POLICY "users manage own bet_submissions" ON "public"."bet_submissions" TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "users manage own daily_jokers" ON "public"."daily_jokers" TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "users manage own draft_submissions" ON "public"."draft_submissions" TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "users read own row" ON "public"."users" FOR SELECT TO "authenticated" USING (("id" = "auth"."uid"()));



CREATE POLICY "users read own transfers" ON "public"."transfers" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "view_league_flags" ON "public"."player_availability_flags" FOR SELECT USING (("league_id" IN ( SELECT DISTINCT "lm"."league_id"
   FROM "public"."league_members" "lm"
  WHERE ("lm"."user_id" = "auth"."uid"()))));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."chat_messages";









GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";




















































































































































































GRANT ALL ON FUNCTION "public"."_create_user_wallet"() TO "anon";
GRANT ALL ON FUNCTION "public"."_create_user_wallet"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."_create_user_wallet"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."_debit_entry_fee"("p_user_id" "uuid", "p_amount" integer, "p_league_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."_debit_entry_fee"("p_user_id" "uuid", "p_amount" integer, "p_league_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."_debit_entry_fee"("p_user_id" "uuid", "p_amount" integer, "p_league_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_debit_entry_fee"("p_user_id" "uuid", "p_amount" integer, "p_league_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."_log_squad_event"("p_event_type" "text", "p_league_id" "uuid", "p_user_id" "uuid", "p_squad_id" "uuid", "p_matchday_id" "text", "p_player_in" "text", "p_player_out" "text", "p_meta" "jsonb") TO "service_role";
GRANT ALL ON FUNCTION "public"."_log_squad_event"("p_event_type" "text", "p_league_id" "uuid", "p_user_id" "uuid", "p_squad_id" "uuid", "p_matchday_id" "text", "p_player_in" "text", "p_player_out" "text", "p_meta" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."_log_squad_event"("p_event_type" "text", "p_league_id" "uuid", "p_user_id" "uuid", "p_squad_id" "uuid", "p_matchday_id" "text", "p_player_in" "text", "p_player_out" "text", "p_meta" "jsonb") TO "authenticated";



GRANT ALL ON FUNCTION "public"."_trigger_seed_cup_clubs"() TO "anon";
GRANT ALL ON FUNCTION "public"."_trigger_seed_cup_clubs"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."_trigger_seed_cup_clubs"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."accept_p2p_challenge"("p_challenge_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."accept_p2p_challenge"("p_challenge_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."accept_p2p_challenge"("p_challenge_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."accept_p2p_challenge"("p_challenge_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."accept_trade_proposal"("p_proposal_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."accept_trade_proposal"("p_proposal_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."accept_trade_proposal"("p_proposal_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."activate_chip"("p_user_id" "uuid", "p_league_id" "uuid", "p_chip_type" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."activate_chip"("p_user_id" "uuid", "p_league_id" "uuid", "p_chip_type" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."activate_chip"("p_user_id" "uuid", "p_league_id" "uuid", "p_chip_type" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_complete_tournament"("p_tournament_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_complete_tournament"("p_tournament_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."admin_complete_tournament"("p_tournament_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."admin_complete_tournament"("p_tournament_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."admin_enter_atp_finals_result"("p_season_year" integer, "p_match_number" integer, "p_winner_player_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_enter_atp_finals_result"("p_season_year" integer, "p_match_number" integer, "p_winner_player_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."admin_enter_atp_finals_result"("p_season_year" integer, "p_match_number" integer, "p_winner_player_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."admin_enter_atp_finals_result"("p_season_year" integer, "p_match_number" integer, "p_winner_player_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."admin_enter_round_results"("p_tournament_id" "uuid", "p_eliminations" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_enter_round_results"("p_tournament_id" "uuid", "p_eliminations" "jsonb") TO "service_role";
GRANT ALL ON FUNCTION "public"."admin_enter_round_results"("p_tournament_id" "uuid", "p_eliminations" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."admin_enter_round_results"("p_tournament_id" "uuid", "p_eliminations" "jsonb") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."admin_grant_coins"("p_user_id" "uuid", "p_amount" integer, "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_grant_coins"("p_user_id" "uuid", "p_amount" integer, "p_reason" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."admin_grant_coins"("p_user_id" "uuid", "p_amount" integer, "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_grant_coins"("p_user_id" "uuid", "p_amount" integer, "p_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_open_qf_window"("p_tournament_id" "uuid", "p_opens_at" timestamp with time zone, "p_closes_at" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_open_qf_window"("p_tournament_id" "uuid", "p_opens_at" timestamp with time zone, "p_closes_at" timestamp with time zone) TO "service_role";
GRANT ALL ON FUNCTION "public"."admin_open_qf_window"("p_tournament_id" "uuid", "p_opens_at" timestamp with time zone, "p_closes_at" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."admin_open_qf_window"("p_tournament_id" "uuid", "p_opens_at" timestamp with time zone, "p_closes_at" timestamp with time zone) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."admin_open_tournament"("p_tournament_id" "uuid", "p_roster_lock_at" timestamp with time zone, "p_external_id" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_open_tournament"("p_tournament_id" "uuid", "p_roster_lock_at" timestamp with time zone, "p_external_id" integer) TO "service_role";
GRANT ALL ON FUNCTION "public"."admin_open_tournament"("p_tournament_id" "uuid", "p_roster_lock_at" timestamp with time zone, "p_external_id" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."admin_open_tournament"("p_tournament_id" "uuid", "p_roster_lock_at" timestamp with time zone, "p_external_id" integer) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."admin_seed_atp_finals_matches"("p_season_year" integer, "p_matches" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_seed_atp_finals_matches"("p_season_year" integer, "p_matches" "jsonb") TO "service_role";
GRANT ALL ON FUNCTION "public"."admin_seed_atp_finals_matches"("p_season_year" integer, "p_matches" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."admin_seed_atp_finals_matches"("p_season_year" integer, "p_matches" "jsonb") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."admin_seed_tournament_players"("p_tournament_id" "uuid", "p_players" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_seed_tournament_players"("p_tournament_id" "uuid", "p_players" "jsonb") TO "service_role";
GRANT ALL ON FUNCTION "public"."admin_seed_tournament_players"("p_tournament_id" "uuid", "p_players" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."admin_seed_tournament_players"("p_tournament_id" "uuid", "p_players" "jsonb") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."admin_set_champion"("p_tournament_id" "uuid", "p_player_id" "uuid", "p_rounds_won" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_set_champion"("p_tournament_id" "uuid", "p_player_id" "uuid", "p_rounds_won" integer) TO "service_role";
GRANT ALL ON FUNCTION "public"."admin_set_champion"("p_tournament_id" "uuid", "p_player_id" "uuid", "p_rounds_won" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."admin_set_champion"("p_tournament_id" "uuid", "p_player_id" "uuid", "p_rounds_won" integer) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."admin_start_tournament"("p_tournament_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_start_tournament"("p_tournament_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."admin_start_tournament"("p_tournament_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."admin_start_tournament"("p_tournament_id" "uuid") TO "authenticated";



GRANT ALL ON FUNCTION "public"."aggregate_league_member_points"("p_league_id" "uuid", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."aggregate_league_member_points"("p_league_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."aggregate_league_member_points"("p_league_id" "uuid", "p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."apply_relaxation_state"("p_league_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."apply_relaxation_state"("p_league_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."apply_relaxation_state"("p_league_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."auto_resolve_p2p_challenges"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."auto_resolve_p2p_challenges"() TO "anon";
GRANT ALL ON FUNCTION "public"."auto_resolve_p2p_challenges"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."auto_resolve_p2p_challenges"() TO "service_role";



GRANT ALL ON FUNCTION "public"."bytea_to_text"("data" "bytea") TO "postgres";
GRANT ALL ON FUNCTION "public"."bytea_to_text"("data" "bytea") TO "anon";
GRANT ALL ON FUNCTION "public"."bytea_to_text"("data" "bytea") TO "authenticated";
GRANT ALL ON FUNCTION "public"."bytea_to_text"("data" "bytea") TO "service_role";



GRANT ALL ON FUNCTION "public"."calculate_relaxation_state"("p_league_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."calculate_relaxation_state"("p_league_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_relaxation_state"("p_league_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."cancel_p2p_challenge"("p_challenge_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cancel_p2p_challenge"("p_challenge_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cancel_p2p_challenge"("p_challenge_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."cancel_p2p_challenge"("p_challenge_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."cancel_trade_proposal"("p_proposal_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."cancel_trade_proposal"("p_proposal_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cancel_trade_proposal"("p_proposal_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."check_chat_rate_limit"() TO "anon";
GRANT ALL ON FUNCTION "public"."check_chat_rate_limit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_chat_rate_limit"() TO "service_role";



GRANT ALL ON FUNCTION "public"."check_draft_submission_deadline"() TO "anon";
GRANT ALL ON FUNCTION "public"."check_draft_submission_deadline"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_draft_submission_deadline"() TO "service_role";



GRANT ALL ON FUNCTION "public"."claim_draft_player"("p_league_id" "uuid", "p_player_id" "text", "p_phase" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."claim_draft_player"("p_league_id" "uuid", "p_player_id" "text", "p_phase" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."claim_draft_player"("p_league_id" "uuid", "p_player_id" "text", "p_phase" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."confirm_auction_win"("p_listing_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."confirm_auction_win"("p_listing_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."confirm_auction_win"("p_listing_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_circle"("p_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_circle"("p_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_circle"("p_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_late_joiner_allocation"("p_league_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_late_joiner_allocation"("p_league_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."create_late_joiner_allocation"("p_league_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_league"("p_name" "text", "p_format" "text", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."create_league"("p_name" "text", "p_format" "text", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_league"("p_name" "text", "p_format" "text", "p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_league"("p_name" "text", "p_format" "text", "p_user_id" "uuid", "p_tournament_id" "text", "p_h2h_enabled" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."create_league"("p_name" "text", "p_format" "text", "p_user_id" "uuid", "p_tournament_id" "text", "p_h2h_enabled" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_league"("p_name" "text", "p_format" "text", "p_user_id" "uuid", "p_tournament_id" "text", "p_h2h_enabled" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."create_league"("p_name" "text", "p_format" "text", "p_user_id" "uuid", "p_tournament_id" "text", "p_h2h_enabled" boolean, "p_circle_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."create_league"("p_name" "text", "p_format" "text", "p_user_id" "uuid", "p_tournament_id" "text", "p_h2h_enabled" boolean, "p_circle_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_league"("p_name" "text", "p_format" "text", "p_user_id" "uuid", "p_tournament_id" "text", "p_h2h_enabled" boolean, "p_circle_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_p2p_challenge"("p_league_id" "uuid", "p_opponent_id" "uuid", "p_matchday_id" "text", "p_stake_coins" integer, "p_message" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_p2p_challenge"("p_league_id" "uuid", "p_opponent_id" "uuid", "p_matchday_id" "text", "p_stake_coins" integer, "p_message" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_p2p_challenge"("p_league_id" "uuid", "p_opponent_id" "uuid", "p_matchday_id" "text", "p_stake_coins" integer, "p_message" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_p2p_challenge"("p_league_id" "uuid", "p_opponent_id" "uuid", "p_matchday_id" "text", "p_stake_coins" integer, "p_message" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_paddock"("p_name" "text", "p_circle_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_paddock"("p_name" "text", "p_circle_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."create_paddock"("p_name" "text", "p_circle_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_player_box"("p_name" "text", "p_season_year" integer, "p_circle_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."create_player_box"("p_name" "text", "p_season_year" integer, "p_circle_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_player_box"("p_name" "text", "p_season_year" integer, "p_circle_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."credit_coins"("p_user_id" "uuid", "p_amount" integer, "p_type" "text", "p_challenge_id" "uuid", "p_meta" "jsonb", "p_currency" character, "p_reference_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."credit_coins"("p_user_id" "uuid", "p_amount" integer, "p_type" "text", "p_challenge_id" "uuid", "p_meta" "jsonb", "p_currency" character, "p_reference_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."credit_coins"("p_user_id" "uuid", "p_amount" integer, "p_type" "text", "p_challenge_id" "uuid", "p_meta" "jsonb", "p_currency" character, "p_reference_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."credit_coins"("p_user_id" "uuid", "p_amount" integer, "p_type" "text", "p_challenge_id" "uuid", "p_meta" "jsonb", "p_currency" character, "p_reference_id" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."debit_coins_to_escrow"("p_user_id" "uuid", "p_amount" integer, "p_challenge_id" "uuid", "p_meta" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."debit_coins_to_escrow"("p_user_id" "uuid", "p_amount" integer, "p_challenge_id" "uuid", "p_meta" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."debit_coins_to_escrow"("p_user_id" "uuid", "p_amount" integer, "p_challenge_id" "uuid", "p_meta" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."debit_coins_to_escrow"("p_user_id" "uuid", "p_amount" integer, "p_challenge_id" "uuid", "p_meta" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."decline_p2p_challenge"("p_challenge_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."decline_p2p_challenge"("p_challenge_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."decline_p2p_challenge"("p_challenge_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."decline_p2p_challenge"("p_challenge_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."delete_chat_message"("p_message_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."delete_chat_message"("p_message_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_chat_message"("p_message_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."delete_user_data"("p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_user_data"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_user_data"("p_user_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."delete_user_data"("p_user_id" "uuid") TO "anon";



GRANT ALL ON FUNCTION "public"."derive_fixture_round_number"() TO "anon";
GRANT ALL ON FUNCTION "public"."derive_fixture_round_number"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."derive_fixture_round_number"() TO "service_role";



GRANT ALL ON FUNCTION "public"."edit_chat_message"("p_message_id" "uuid", "p_new_text" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."edit_chat_message"("p_message_id" "uuid", "p_new_text" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."edit_chat_message"("p_message_id" "uuid", "p_new_text" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."eliminate_cup_club"("p_league_id" "uuid", "p_club_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."eliminate_cup_club"("p_league_id" "uuid", "p_club_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."eliminate_cup_club"("p_league_id" "uuid", "p_club_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_position_limit"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_position_limit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_position_limit"() TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_transfer_window"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_transfer_window"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_transfer_window"() TO "service_role";



GRANT ALL ON FUNCTION "public"."execute_transfer_atomic"("p_squad_id" "uuid", "p_action" "text", "p_player_id" "uuid", "p_price" numeric) TO "service_role";
GRANT ALL ON FUNCTION "public"."execute_transfer_atomic"("p_squad_id" "uuid", "p_action" "text", "p_player_id" "uuid", "p_price" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."execute_transfer_atomic"("p_squad_id" "uuid", "p_action" "text", "p_player_id" "uuid", "p_price" numeric) TO "authenticated";



GRANT ALL ON FUNCTION "public"."execute_transfer_atomic"("p_squad_id" "uuid", "p_action" "text", "p_player_id" "uuid", "p_price" numeric, "p_pos_limit" integer, "p_squad_max" integer) TO "service_role";
GRANT ALL ON FUNCTION "public"."execute_transfer_atomic"("p_squad_id" "uuid", "p_action" "text", "p_player_id" "uuid", "p_price" numeric, "p_pos_limit" integer, "p_squad_max" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."execute_transfer_atomic"("p_squad_id" "uuid", "p_action" "text", "p_player_id" "uuid", "p_price" numeric, "p_pos_limit" integer, "p_squad_max" integer) TO "authenticated";



GRANT ALL ON FUNCTION "public"."execute_transfer_atomic"("p_squad_id" "uuid", "p_action" "text", "p_player_id" "uuid", "p_price" numeric, "p_pos_limit" integer, "p_squad_max" integer, "p_club_max" integer) TO "service_role";
GRANT ALL ON FUNCTION "public"."execute_transfer_atomic"("p_squad_id" "uuid", "p_action" "text", "p_player_id" "uuid", "p_price" numeric, "p_pos_limit" integer, "p_squad_max" integer, "p_club_max" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."execute_transfer_atomic"("p_squad_id" "uuid", "p_action" "text", "p_player_id" "uuid", "p_price" numeric, "p_pos_limit" integer, "p_squad_max" integer, "p_club_max" integer) TO "authenticated";



GRANT ALL ON FUNCTION "public"."execute_transfer_atomic"("p_squad_id" "uuid", "p_action" "text", "p_player_id" "text", "p_price" numeric, "p_pos_limit" integer, "p_squad_max" integer, "p_club_max" integer, "p_league_id" "uuid", "p_matchday_id" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."execute_transfer_atomic"("p_squad_id" "uuid", "p_action" "text", "p_player_id" "text", "p_price" numeric, "p_pos_limit" integer, "p_squad_max" integer, "p_club_max" integer, "p_league_id" "uuid", "p_matchday_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."execute_transfer_atomic"("p_squad_id" "uuid", "p_action" "text", "p_player_id" "text", "p_price" numeric, "p_pos_limit" integer, "p_squad_max" integer, "p_club_max" integer, "p_league_id" "uuid", "p_matchday_id" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."expire_stale_challenges"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."expire_stale_challenges"() TO "anon";
GRANT ALL ON FUNCTION "public"."expire_stale_challenges"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."expire_stale_challenges"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."export_user_data"("p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."export_user_data"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."export_user_data"("p_user_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."export_user_data"("p_user_id" "uuid") TO "anon";



GRANT ALL ON FUNCTION "public"."generate_h2h_schedule"("p_league_id" "uuid", "p_start_matchday_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_h2h_schedule"("p_league_id" "uuid", "p_start_matchday_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."generate_h2h_schedule"("p_league_id" "uuid", "p_start_matchday_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_active_matchday_id"("p_tournament_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_active_matchday_id"("p_tournament_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_active_matchday_id"("p_tournament_id" "text") TO "service_role";



GRANT ALL ON TABLE "public"."transfer_windows" TO "anon";
GRANT ALL ON TABLE "public"."transfer_windows" TO "authenticated";
GRANT ALL ON TABLE "public"."transfer_windows" TO "service_role";



GRANT ALL ON FUNCTION "public"."get_active_transfer_window"("p_league_id" "uuid", "p_at" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."get_active_transfer_window"("p_league_id" "uuid", "p_at" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_active_transfer_window"("p_league_id" "uuid", "p_at" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_circle_feed"("p_circle_id" "uuid", "p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_circle_feed"("p_circle_id" "uuid", "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_circle_feed"("p_circle_id" "uuid", "p_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_circle_meta_standings"("p_circle_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_circle_meta_standings"("p_circle_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_circle_meta_standings"("p_circle_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_club_cap"("p_league_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_club_cap"("p_league_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_club_cap"("p_league_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_club_cap"("p_league_id" "uuid", "p_matchday_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_club_cap"("p_league_id" "uuid", "p_matchday_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_club_cap"("p_league_id" "uuid", "p_matchday_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_clubhouse_competitions"("p_circle_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_clubhouse_competitions"("p_circle_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_clubhouse_competitions"("p_circle_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_coin_economy_stats"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_coin_economy_stats"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_coin_economy_stats"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_coin_economy_stats"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_cron_failure_streaks"("p_threshold" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_cron_failure_streaks"("p_threshold" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_cron_failure_streaks"("p_threshold" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_cron_status"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_cron_status"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_cron_status"() TO "service_role";



GRANT ALL ON TABLE "public"."players" TO "anon";
GRANT ALL ON TABLE "public"."players" TO "authenticated";
GRANT ALL ON TABLE "public"."players" TO "service_role";



GRANT ALL ON FUNCTION "public"."get_cup_available_players"("p_league_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_cup_available_players"("p_league_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_cup_available_players"("p_league_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_cup_pool_stats"("p_league_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_cup_pool_stats"("p_league_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_cup_pool_stats"("p_league_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_event_points"("p_tournament_id" "text", "p_position" "text", "p_event_type" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_event_points"("p_tournament_id" "text", "p_position" "text", "p_event_type" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_event_points"("p_tournament_id" "text", "p_position" "text", "p_event_type" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_h2h_standings"("p_league_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_h2h_standings"("p_league_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_h2h_standings"("p_league_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_league_stats"("p_league_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_league_stats"("p_league_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_league_stats"("p_league_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_my_challenges"("p_league_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_my_challenges"("p_league_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_challenges"("p_league_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_my_challenges"("p_league_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_my_paddocks"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_paddocks"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_my_paddocks"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_my_player_boxes"("p_season_year" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_my_player_boxes"("p_season_year" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_player_boxes"("p_season_year" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_my_wallet"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_wallet"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_my_wallet"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_owner_linkable_leagues"("p_circle_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_owner_linkable_leagues"("p_circle_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_owner_linkable_leagues"("p_circle_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_p2p_config"("p_league_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_p2p_config"("p_league_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_p2p_config"("p_league_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_p2p_config"("p_league_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_paddock_leaderboard"("p_paddock_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_paddock_leaderboard"("p_paddock_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_paddock_leaderboard"("p_paddock_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_player_box_leaderboard"("p_player_box_id" "uuid", "p_season_year" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_player_box_leaderboard"("p_player_box_id" "uuid", "p_season_year" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_player_box_leaderboard"("p_player_box_id" "uuid", "p_season_year" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_scoring_template"("p_tournament_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_scoring_template"("p_tournament_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_scoring_template"("p_tournament_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_server_time"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_server_time"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_server_time"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_snapshot_bench"("p_starting_xi" "text"[], "p_players" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_snapshot_bench"("p_starting_xi" "text"[], "p_players" "text"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."get_snapshot_bench"("p_starting_xi" "text"[], "p_players" "text"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_tennis_season_summary"("p_player_box_id" "uuid", "p_season_year" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_tennis_season_summary"("p_player_box_id" "uuid", "p_season_year" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_tennis_season_summary"("p_player_box_id" "uuid", "p_season_year" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_tennis_tournament_for_user"("p_tournament_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_tennis_tournament_for_user"("p_tournament_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_tennis_tournament_for_user"("p_tournament_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_tennis_tournament_list"("p_season_year" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_tennis_tournament_list"("p_season_year" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_tennis_tournament_list"("p_season_year" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_transfer_window_status"("p_league_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_transfer_window_status"("p_league_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_transfer_window_status"("p_league_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_unread_chat_count"("p_league_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_unread_chat_count"("p_league_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_unread_chat_count"("p_league_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_unread_mentions"("p_league_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_unread_mentions"("p_league_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_unread_mentions"("p_league_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_unread_notification_count"("p_league_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_unread_notification_count"("p_league_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_unread_notification_count"("p_league_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."guard_coin_columns"() TO "anon";
GRANT ALL ON FUNCTION "public"."guard_coin_columns"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."guard_coin_columns"() TO "service_role";



GRANT ALL ON FUNCTION "public"."guard_daily_joker_deadline"() TO "anon";
GRANT ALL ON FUNCTION "public"."guard_daily_joker_deadline"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."guard_daily_joker_deadline"() TO "service_role";



GRANT ALL ON FUNCTION "public"."guard_daily_joker_external_player"() TO "anon";
GRANT ALL ON FUNCTION "public"."guard_daily_joker_external_player"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."guard_daily_joker_external_player"() TO "service_role";



GRANT ALL ON FUNCTION "public"."guard_squad_protected_columns"() TO "anon";
GRANT ALL ON FUNCTION "public"."guard_squad_protected_columns"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."guard_squad_protected_columns"() TO "service_role";



GRANT ALL ON FUNCTION "public"."guard_users_privilege_columns"() TO "anon";
GRANT ALL ON FUNCTION "public"."guard_users_privilege_columns"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."guard_users_privilege_columns"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."http"("request" "public"."http_request") TO "postgres";
GRANT ALL ON FUNCTION "public"."http"("request" "public"."http_request") TO "anon";
GRANT ALL ON FUNCTION "public"."http"("request" "public"."http_request") TO "authenticated";
GRANT ALL ON FUNCTION "public"."http"("request" "public"."http_request") TO "service_role";



GRANT ALL ON FUNCTION "public"."http_delete"("uri" character varying) TO "postgres";
GRANT ALL ON FUNCTION "public"."http_delete"("uri" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."http_delete"("uri" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."http_delete"("uri" character varying) TO "service_role";



GRANT ALL ON FUNCTION "public"."http_delete"("uri" character varying, "content" character varying, "content_type" character varying) TO "postgres";
GRANT ALL ON FUNCTION "public"."http_delete"("uri" character varying, "content" character varying, "content_type" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."http_delete"("uri" character varying, "content" character varying, "content_type" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."http_delete"("uri" character varying, "content" character varying, "content_type" character varying) TO "service_role";



GRANT ALL ON FUNCTION "public"."http_get"("uri" character varying) TO "postgres";
GRANT ALL ON FUNCTION "public"."http_get"("uri" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."http_get"("uri" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."http_get"("uri" character varying) TO "service_role";



GRANT ALL ON FUNCTION "public"."http_get"("uri" character varying, "data" "jsonb") TO "postgres";
GRANT ALL ON FUNCTION "public"."http_get"("uri" character varying, "data" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."http_get"("uri" character varying, "data" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."http_get"("uri" character varying, "data" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."http_head"("uri" character varying) TO "postgres";
GRANT ALL ON FUNCTION "public"."http_head"("uri" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."http_head"("uri" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."http_head"("uri" character varying) TO "service_role";



GRANT ALL ON FUNCTION "public"."http_header"("field" character varying, "value" character varying) TO "postgres";
GRANT ALL ON FUNCTION "public"."http_header"("field" character varying, "value" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."http_header"("field" character varying, "value" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."http_header"("field" character varying, "value" character varying) TO "service_role";



GRANT ALL ON FUNCTION "public"."http_list_curlopt"() TO "postgres";
GRANT ALL ON FUNCTION "public"."http_list_curlopt"() TO "anon";
GRANT ALL ON FUNCTION "public"."http_list_curlopt"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."http_list_curlopt"() TO "service_role";



GRANT ALL ON FUNCTION "public"."http_patch"("uri" character varying, "content" character varying, "content_type" character varying) TO "postgres";
GRANT ALL ON FUNCTION "public"."http_patch"("uri" character varying, "content" character varying, "content_type" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."http_patch"("uri" character varying, "content" character varying, "content_type" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."http_patch"("uri" character varying, "content" character varying, "content_type" character varying) TO "service_role";



GRANT ALL ON FUNCTION "public"."http_post"("uri" character varying, "data" "jsonb") TO "postgres";
GRANT ALL ON FUNCTION "public"."http_post"("uri" character varying, "data" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."http_post"("uri" character varying, "data" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."http_post"("uri" character varying, "data" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."http_post"("uri" character varying, "content" character varying, "content_type" character varying) TO "postgres";
GRANT ALL ON FUNCTION "public"."http_post"("uri" character varying, "content" character varying, "content_type" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."http_post"("uri" character varying, "content" character varying, "content_type" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."http_post"("uri" character varying, "content" character varying, "content_type" character varying) TO "service_role";



GRANT ALL ON FUNCTION "public"."http_put"("uri" character varying, "content" character varying, "content_type" character varying) TO "postgres";
GRANT ALL ON FUNCTION "public"."http_put"("uri" character varying, "content" character varying, "content_type" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."http_put"("uri" character varying, "content" character varying, "content_type" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."http_put"("uri" character varying, "content" character varying, "content_type" character varying) TO "service_role";



GRANT ALL ON FUNCTION "public"."http_reset_curlopt"() TO "postgres";
GRANT ALL ON FUNCTION "public"."http_reset_curlopt"() TO "anon";
GRANT ALL ON FUNCTION "public"."http_reset_curlopt"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."http_reset_curlopt"() TO "service_role";



GRANT ALL ON FUNCTION "public"."http_set_curlopt"("curlopt" character varying, "value" character varying) TO "postgres";
GRANT ALL ON FUNCTION "public"."http_set_curlopt"("curlopt" character varying, "value" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."http_set_curlopt"("curlopt" character varying, "value" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."http_set_curlopt"("curlopt" character varying, "value" character varying) TO "service_role";



GRANT ALL ON FUNCTION "public"."is_league_member"("p_league_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_league_member"("p_league_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_league_member"("p_league_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."issue_season_ace_cards"("p_season_year" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."issue_season_ace_cards"("p_season_year" integer) TO "service_role";
GRANT ALL ON FUNCTION "public"."issue_season_ace_cards"("p_season_year" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."issue_season_ace_cards"("p_season_year" integer) TO "authenticated";



GRANT ALL ON FUNCTION "public"."join_circle_by_code"("p_code" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."join_circle_by_code"("p_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."join_circle_by_code"("p_code" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."join_league_by_code"("p_code" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."join_league_by_code"("p_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."join_league_by_code"("p_code" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."join_league_by_code"("p_code" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."join_league_by_code"("p_code" "text", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."join_league_by_code"("p_code" "text", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."join_league_by_code"("p_code" "text", "p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."join_paddock_by_code"("p_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."join_paddock_by_code"("p_code" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."join_paddock_by_code"("p_code" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."join_player_box_by_code"("p_invite_code" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."join_player_box_by_code"("p_invite_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."join_player_box_by_code"("p_invite_code" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."kick_circle_member"("p_circle_id" "uuid", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."kick_circle_member"("p_circle_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."kick_circle_member"("p_circle_id" "uuid", "p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."link_competition_to_clubhouse"("p_circle_id" "uuid", "p_type" "text", "p_competition_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."link_competition_to_clubhouse"("p_circle_id" "uuid", "p_type" "text", "p_competition_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."link_competition_to_clubhouse"("p_circle_id" "uuid", "p_type" "text", "p_competition_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."link_league_to_circle"("p_circle_id" "uuid", "p_league_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."link_league_to_circle"("p_circle_id" "uuid", "p_league_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."link_league_to_circle"("p_circle_id" "uuid", "p_league_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."lock_lineups_for_fixture"("p_fixture_id" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."lock_lineups_for_fixture"("p_fixture_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."lock_lineups_for_fixture"("p_fixture_id" "text") TO "authenticated";



GRANT ALL ON FUNCTION "public"."mark_all_notifications_read"("p_league_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."mark_all_notifications_read"("p_league_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_all_notifications_read"("p_league_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."mark_league_chat_read"("p_league_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."mark_league_chat_read"("p_league_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_league_chat_read"("p_league_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."mark_mention_read"("p_message_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."mark_mention_read"("p_message_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_mention_read"("p_message_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."mark_notification_read"("p_notification_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."mark_notification_read"("p_notification_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_notification_read"("p_notification_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_league_on_bet_creation"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_league_on_bet_creation"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_league_on_bet_creation"() TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_on_direct_message"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_on_direct_message"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_on_direct_message"() TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_on_frontpage_edition"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_on_frontpage_edition"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_on_frontpage_edition"() TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_on_gazette_breaking_news"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_on_gazette_breaking_news"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_on_gazette_breaking_news"() TO "service_role";



GRANT ALL ON FUNCTION "public"."place_bid"("p_listing_id" "uuid", "p_bid_amount" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."place_bid"("p_listing_id" "uuid", "p_bid_amount" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."place_bid"("p_listing_id" "uuid", "p_bid_amount" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."preserve_manual_matchday_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."preserve_manual_matchday_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."preserve_manual_matchday_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."process_auction_deadlines"() TO "anon";
GRANT ALL ON FUNCTION "public"."process_auction_deadlines"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."process_auction_deadlines"() TO "service_role";



GRANT ALL ON FUNCTION "public"."recompute_league_ranks"("p_league_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."recompute_league_ranks"("p_league_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."recompute_league_ranks"("p_league_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."reject_trade_proposal"("p_proposal_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."reject_trade_proposal"("p_proposal_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."reject_trade_proposal"("p_proposal_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."release_escrow"("p_user_id" "uuid", "p_amount" integer, "p_challenge_id" "uuid", "p_meta" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."release_escrow"("p_user_id" "uuid", "p_amount" integer, "p_challenge_id" "uuid", "p_meta" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."release_escrow"("p_user_id" "uuid", "p_amount" integer, "p_challenge_id" "uuid", "p_meta" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."release_escrow"("p_user_id" "uuid", "p_amount" integer, "p_challenge_id" "uuid", "p_meta" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."report_client_error"("p_message" "text", "p_stack" "text", "p_url" "text", "p_user_agent" "text", "p_context" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."report_client_error"("p_message" "text", "p_stack" "text", "p_url" "text", "p_user_agent" "text", "p_context" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."report_client_error"("p_message" "text", "p_stack" "text", "p_url" "text", "p_user_agent" "text", "p_context" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."resolve_auction_listing"("p_listing_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."resolve_auction_listing"("p_listing_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."resolve_auction_listing"("p_listing_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."resolve_bet"("p_instance_id" "uuid", "p_answers" "text"[]) TO "service_role";
GRANT ALL ON FUNCTION "public"."resolve_bet"("p_instance_id" "uuid", "p_answers" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."resolve_bet"("p_instance_id" "uuid", "p_answers" "text"[]) TO "anon";



GRANT ALL ON FUNCTION "public"."resolve_bet"("p_instance_id" "uuid", "p_answer" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."resolve_bet"("p_instance_id" "uuid", "p_answer" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."resolve_bet"("p_instance_id" "uuid", "p_answer" "text") TO "anon";



REVOKE ALL ON FUNCTION "public"."resolve_p2p_challenge"("p_challenge_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."resolve_p2p_challenge"("p_challenge_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."resolve_p2p_challenge"("p_challenge_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."resolve_p2p_challenge"("p_challenge_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."restore_cup_club"("p_league_id" "uuid", "p_club_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."restore_cup_club"("p_league_id" "uuid", "p_club_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."restore_cup_club"("p_league_id" "uuid", "p_club_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."sanitize_starting_xi"() TO "anon";
GRANT ALL ON FUNCTION "public"."sanitize_starting_xi"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sanitize_starting_xi"() TO "service_role";



GRANT ALL ON FUNCTION "public"."search_clubhouses"("p_query" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."search_clubhouses"("p_query" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."search_clubhouses"("p_query" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."seed_cup_clubs"("p_league_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."seed_cup_clubs"("p_league_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."seed_cup_clubs"("p_league_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."seed_cup_clubs"("p_league_id" "uuid", "p_tournament_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."seed_cup_clubs"("p_league_id" "uuid", "p_tournament_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."seed_cup_clubs"("p_league_id" "uuid", "p_tournament_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."sell_now"("p_listing_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."sell_now"("p_listing_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sell_now"("p_listing_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_captain"("p_squad_id" "uuid", "p_player_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_captain"("p_squad_id" "uuid", "p_player_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."set_captain"("p_squad_id" "uuid", "p_player_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_lineup"("p_squad_id" "uuid", "p_player_out" "text", "p_player_in" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_lineup"("p_squad_id" "uuid", "p_player_out" "text", "p_player_in" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."set_lineup"("p_squad_id" "uuid", "p_player_out" "text", "p_player_in" "text") TO "anon";



GRANT ALL ON FUNCTION "public"."set_tennis_qf_captain"("p_tournament_id" "uuid", "p_captain_player_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."set_tennis_qf_captain"("p_tournament_id" "uuid", "p_captain_player_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_tennis_qf_captain"("p_tournament_id" "uuid", "p_captain_player_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."snapshot_squads_for_matchday"("p_matchday_id" "text", "p_reason" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."snapshot_squads_for_matchday"("p_matchday_id" "text", "p_reason" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."snapshot_squads_for_matchday"("p_matchday_id" "text", "p_reason" "text") TO "authenticated";



GRANT ALL ON FUNCTION "public"."submit_atp_finals_group_picks"("p_season_year" integer, "p_picks" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."submit_atp_finals_group_picks"("p_season_year" integer, "p_picks" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."submit_atp_finals_group_picks"("p_season_year" integer, "p_picks" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."submit_atp_finals_knockout_picks"("p_season_year" integer, "p_picks" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."submit_atp_finals_knockout_picks"("p_season_year" integer, "p_picks" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."submit_atp_finals_knockout_picks"("p_season_year" integer, "p_picks" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."submit_bet"("p_squad_id" "uuid", "p_instance_id" "uuid", "p_answer" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."submit_bet"("p_squad_id" "uuid", "p_instance_id" "uuid", "p_answer" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."submit_bet"("p_squad_id" "uuid", "p_instance_id" "uuid", "p_answer" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."submit_knockout_keeps"("p_league_id" "uuid", "p_player_ids" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."submit_knockout_keeps"("p_league_id" "uuid", "p_player_ids" "text"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."submit_knockout_keeps"("p_league_id" "uuid", "p_player_ids" "text"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."submit_tennis_roster"("p_tournament_id" "uuid", "p_tier1" "uuid", "p_tier2a" "uuid", "p_tier2b" "uuid", "p_tier3a" "uuid", "p_tier3b" "uuid", "p_tier4a" "uuid", "p_tier4b" "uuid", "p_ace_card" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."submit_tennis_roster"("p_tournament_id" "uuid", "p_tier1" "uuid", "p_tier2a" "uuid", "p_tier2b" "uuid", "p_tier3a" "uuid", "p_tier3b" "uuid", "p_tier4a" "uuid", "p_tier4b" "uuid", "p_ace_card" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."submit_tennis_roster"("p_tournament_id" "uuid", "p_tier1" "uuid", "p_tier2a" "uuid", "p_tier2b" "uuid", "p_tier3a" "uuid", "p_tier3b" "uuid", "p_tier4a" "uuid", "p_tier4b" "uuid", "p_ace_card" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."submit_trade_proposal"("p_league_id" "uuid", "p_proposer_squad_id" "uuid", "p_target_squad_id" "uuid", "p_proposer_player_id" "text", "p_target_player_id" "text", "p_cash_sweetener" numeric, "p_points_sweetener" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."submit_trade_proposal"("p_league_id" "uuid", "p_proposer_squad_id" "uuid", "p_target_squad_id" "uuid", "p_proposer_player_id" "text", "p_target_player_id" "text", "p_cash_sweetener" numeric, "p_points_sweetener" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."submit_trade_proposal"("p_league_id" "uuid", "p_proposer_squad_id" "uuid", "p_target_squad_id" "uuid", "p_proposer_player_id" "text", "p_target_player_id" "text", "p_cash_sweetener" numeric, "p_points_sweetener" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."sweep_void_auction_confirmations"() TO "anon";
GRANT ALL ON FUNCTION "public"."sweep_void_auction_confirmations"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sweep_void_auction_confirmations"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_all_active_tournaments"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_all_active_tournaments"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_all_active_tournaments"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_cup_eliminations"("p_league_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."sync_cup_eliminations"("p_league_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."sync_cup_eliminations"("p_league_id" "uuid") TO "authenticated";



GRANT ALL ON FUNCTION "public"."sync_league_mode"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_league_mode"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_league_mode"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_squad_matchdays"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_squad_matchdays"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_squad_matchdays"() TO "service_role";



GRANT ALL ON FUNCTION "public"."text_to_bytea"("data" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."text_to_bytea"("data" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."text_to_bytea"("data" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."text_to_bytea"("data" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."tg_recompute_ranks"() TO "anon";
GRANT ALL ON FUNCTION "public"."tg_recompute_ranks"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."tg_recompute_ranks"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trg_fn_snapshot_squads_on_kickoff"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_fn_snapshot_squads_on_kickoff"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_fn_snapshot_squads_on_kickoff"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trigger_bet_reward_update"() TO "anon";
GRANT ALL ON FUNCTION "public"."trigger_bet_reward_update"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trigger_bet_reward_update"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_circle_settings"("p_circle_id" "uuid", "p_name" "text", "p_is_public" boolean, "p_p2p_enabled" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."update_circle_settings"("p_circle_id" "uuid", "p_name" "text", "p_is_public" boolean, "p_p2p_enabled" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_circle_settings"("p_circle_id" "uuid", "p_name" "text", "p_is_public" boolean, "p_p2p_enabled" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_p2p_config"("p_league_id" "uuid", "p_min_stake" integer, "p_max_stake" integer, "p_daily_challenge_limit" integer, "p_challenges_enabled" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_p2p_config"("p_league_id" "uuid", "p_min_stake" integer, "p_max_stake" integer, "p_daily_challenge_limit" integer, "p_challenges_enabled" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_p2p_config"("p_league_id" "uuid", "p_min_stake" integer, "p_max_stake" integer, "p_daily_challenge_limit" integer, "p_challenges_enabled" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."update_p2p_config"("p_league_id" "uuid", "p_min_stake" integer, "p_max_stake" integer, "p_daily_challenge_limit" integer, "p_challenges_enabled" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."upsert_scoring_rules"("p_tournament_id" "text", "p_rules" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."upsert_scoring_rules"("p_tournament_id" "text", "p_rules" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."upsert_scoring_rules"("p_tournament_id" "text", "p_rules" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."urlencode"("string" "bytea") TO "postgres";
GRANT ALL ON FUNCTION "public"."urlencode"("string" "bytea") TO "anon";
GRANT ALL ON FUNCTION "public"."urlencode"("string" "bytea") TO "authenticated";
GRANT ALL ON FUNCTION "public"."urlencode"("string" "bytea") TO "service_role";



GRANT ALL ON FUNCTION "public"."urlencode"("data" "jsonb") TO "postgres";
GRANT ALL ON FUNCTION "public"."urlencode"("data" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."urlencode"("data" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."urlencode"("data" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."urlencode"("string" character varying) TO "postgres";
GRANT ALL ON FUNCTION "public"."urlencode"("string" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."urlencode"("string" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."urlencode"("string" character varying) TO "service_role";



GRANT ALL ON FUNCTION "public"."void_bet"("p_instance_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."void_bet"("p_instance_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."void_bet"("p_instance_id" "uuid") TO "service_role";
























GRANT ALL ON TABLE "public"."auction_bids" TO "anon";
GRANT ALL ON TABLE "public"."auction_bids" TO "authenticated";
GRANT ALL ON TABLE "public"."auction_bids" TO "service_role";



GRANT ALL ON TABLE "public"."auction_listings" TO "anon";
GRANT ALL ON TABLE "public"."auction_listings" TO "authenticated";
GRANT ALL ON TABLE "public"."auction_listings" TO "service_role";



GRANT ALL ON TABLE "public"."bet_instances" TO "anon";
GRANT ALL ON TABLE "public"."bet_instances" TO "authenticated";
GRANT ALL ON TABLE "public"."bet_instances" TO "service_role";



GRANT ALL ON TABLE "public"."bet_submissions" TO "anon";
GRANT ALL ON TABLE "public"."bet_submissions" TO "authenticated";
GRANT ALL ON TABLE "public"."bet_submissions" TO "service_role";



GRANT ALL ON TABLE "public"."bet_templates" TO "anon";
GRANT ALL ON TABLE "public"."bet_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."bet_templates" TO "service_role";



GRANT ALL ON TABLE "public"."chat_messages" TO "anon";
GRANT ALL ON TABLE "public"."chat_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."chat_messages" TO "service_role";



GRANT ALL ON TABLE "public"."chips_used" TO "anon";
GRANT ALL ON TABLE "public"."chips_used" TO "authenticated";
GRANT ALL ON TABLE "public"."chips_used" TO "service_role";



GRANT ALL ON TABLE "public"."circle_leagues" TO "anon";
GRANT ALL ON TABLE "public"."circle_leagues" TO "authenticated";
GRANT ALL ON TABLE "public"."circle_leagues" TO "service_role";



GRANT ALL ON TABLE "public"."circle_members" TO "anon";
GRANT ALL ON TABLE "public"."circle_members" TO "authenticated";
GRANT ALL ON TABLE "public"."circle_members" TO "service_role";



GRANT ALL ON TABLE "public"."circle_paddocks" TO "anon";
GRANT ALL ON TABLE "public"."circle_paddocks" TO "authenticated";
GRANT ALL ON TABLE "public"."circle_paddocks" TO "service_role";



GRANT ALL ON TABLE "public"."circle_player_boxes" TO "anon";
GRANT ALL ON TABLE "public"."circle_player_boxes" TO "authenticated";
GRANT ALL ON TABLE "public"."circle_player_boxes" TO "service_role";



GRANT ALL ON TABLE "public"."circles" TO "anon";
GRANT ALL ON TABLE "public"."circles" TO "authenticated";
GRANT ALL ON TABLE "public"."circles" TO "service_role";



GRANT ALL ON TABLE "public"."client_errors" TO "anon";
GRANT ALL ON TABLE "public"."client_errors" TO "authenticated";
GRANT ALL ON TABLE "public"."client_errors" TO "service_role";



GRANT ALL ON TABLE "public"."club_cap_rules" TO "anon";
GRANT ALL ON TABLE "public"."club_cap_rules" TO "authenticated";
GRANT ALL ON TABLE "public"."club_cap_rules" TO "service_role";



GRANT ALL ON SEQUENCE "public"."club_cap_rules_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."club_cap_rules_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."club_cap_rules_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."clubhouse_channels" TO "anon";
GRANT ALL ON TABLE "public"."clubhouse_channels" TO "authenticated";
GRANT ALL ON TABLE "public"."clubhouse_channels" TO "service_role";



GRANT ALL ON TABLE "public"."clubhouse_messages" TO "anon";
GRANT ALL ON TABLE "public"."clubhouse_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."clubhouse_messages" TO "service_role";



GRANT ALL ON TABLE "public"."clubhouse_notifications" TO "anon";
GRANT ALL ON TABLE "public"."clubhouse_notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."clubhouse_notifications" TO "service_role";



GRANT ALL ON TABLE "public"."coin_packs" TO "anon";
GRANT ALL ON TABLE "public"."coin_packs" TO "authenticated";
GRANT ALL ON TABLE "public"."coin_packs" TO "service_role";



GRANT ALL ON TABLE "public"."coin_transactions" TO "anon";
GRANT ALL ON TABLE "public"."coin_transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."coin_transactions" TO "service_role";



GRANT ALL ON TABLE "public"."coin_wallets" TO "anon";
GRANT ALL ON TABLE "public"."coin_wallets" TO "authenticated";
GRANT ALL ON TABLE "public"."coin_wallets" TO "service_role";



GRANT ALL ON TABLE "public"."cup_active_clubs" TO "anon";
GRANT ALL ON TABLE "public"."cup_active_clubs" TO "authenticated";
GRANT ALL ON TABLE "public"."cup_active_clubs" TO "service_role";



GRANT ALL ON TABLE "public"."daily_jokers" TO "anon";
GRANT ALL ON TABLE "public"."daily_jokers" TO "authenticated";
GRANT ALL ON TABLE "public"."daily_jokers" TO "service_role";



GRANT ALL ON TABLE "public"."direct_messages" TO "anon";
GRANT ALL ON TABLE "public"."direct_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."direct_messages" TO "service_role";



GRANT ALL ON TABLE "public"."draft_allocations" TO "anon";
GRANT ALL ON TABLE "public"."draft_allocations" TO "authenticated";
GRANT ALL ON TABLE "public"."draft_allocations" TO "service_role";



GRANT ALL ON TABLE "public"."draft_submissions" TO "anon";
GRANT ALL ON TABLE "public"."draft_submissions" TO "authenticated";
GRANT ALL ON TABLE "public"."draft_submissions" TO "service_role";



GRANT ALL ON TABLE "public"."edge_function_errors" TO "anon";
GRANT ALL ON TABLE "public"."edge_function_errors" TO "authenticated";
GRANT ALL ON TABLE "public"."edge_function_errors" TO "service_role";



GRANT ALL ON TABLE "public"."f1_bets_race" TO "anon";
GRANT ALL ON TABLE "public"."f1_bets_race" TO "authenticated";
GRANT ALL ON TABLE "public"."f1_bets_race" TO "service_role";



GRANT ALL ON TABLE "public"."f1_bets_year" TO "anon";
GRANT ALL ON TABLE "public"."f1_bets_year" TO "authenticated";
GRANT ALL ON TABLE "public"."f1_bets_year" TO "service_role";



GRANT ALL ON TABLE "public"."f1_races" TO "anon";
GRANT ALL ON TABLE "public"."f1_races" TO "authenticated";
GRANT ALL ON TABLE "public"."f1_races" TO "service_role";



GRANT ALL ON TABLE "public"."f1_scores" TO "anon";
GRANT ALL ON TABLE "public"."f1_scores" TO "authenticated";
GRANT ALL ON TABLE "public"."f1_scores" TO "service_role";



GRANT ALL ON TABLE "public"."f1_year_results" TO "anon";
GRANT ALL ON TABLE "public"."f1_year_results" TO "authenticated";
GRANT ALL ON TABLE "public"."f1_year_results" TO "service_role";



GRANT ALL ON SEQUENCE "public"."f1_year_results_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."f1_year_results_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."f1_year_results_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."fantasy_points" TO "anon";
GRANT ALL ON TABLE "public"."fantasy_points" TO "authenticated";
GRANT ALL ON TABLE "public"."fantasy_points" TO "service_role";



GRANT ALL ON TABLE "public"."fixtures" TO "anon";
GRANT ALL ON TABLE "public"."fixtures" TO "authenticated";
GRANT ALL ON TABLE "public"."fixtures" TO "service_role";



GRANT ALL ON TABLE "public"."frontpage_comments" TO "anon";
GRANT ALL ON TABLE "public"."frontpage_comments" TO "authenticated";
GRANT ALL ON TABLE "public"."frontpage_comments" TO "service_role";



GRANT ALL ON TABLE "public"."frontpage_editions" TO "anon";
GRANT ALL ON TABLE "public"."frontpage_editions" TO "authenticated";
GRANT ALL ON TABLE "public"."frontpage_editions" TO "service_role";



GRANT ALL ON TABLE "public"."frontpage_reactions" TO "anon";
GRANT ALL ON TABLE "public"."frontpage_reactions" TO "authenticated";
GRANT ALL ON TABLE "public"."frontpage_reactions" TO "service_role";



GRANT ALL ON TABLE "public"."gazette_entries" TO "anon";
GRANT ALL ON TABLE "public"."gazette_entries" TO "authenticated";
GRANT ALL ON TABLE "public"."gazette_entries" TO "service_role";



GRANT ALL ON TABLE "public"."h2h_records" TO "anon";
GRANT ALL ON TABLE "public"."h2h_records" TO "authenticated";
GRANT ALL ON TABLE "public"."h2h_records" TO "service_role";



GRANT ALL ON TABLE "public"."h2h_schedule" TO "anon";
GRANT ALL ON TABLE "public"."h2h_schedule" TO "authenticated";
GRANT ALL ON TABLE "public"."h2h_schedule" TO "service_role";



GRANT ALL ON TABLE "public"."knockout_keep_submissions" TO "anon";
GRANT ALL ON TABLE "public"."knockout_keep_submissions" TO "authenticated";
GRANT ALL ON TABLE "public"."knockout_keep_submissions" TO "service_role";



GRANT ALL ON TABLE "public"."league_chat_read_status" TO "anon";
GRANT ALL ON TABLE "public"."league_chat_read_status" TO "authenticated";
GRANT ALL ON TABLE "public"."league_chat_read_status" TO "service_role";



GRANT ALL ON TABLE "public"."league_config" TO "anon";
GRANT ALL ON TABLE "public"."league_config" TO "authenticated";
GRANT ALL ON TABLE "public"."league_config" TO "service_role";



GRANT ALL ON TABLE "public"."league_members" TO "anon";
GRANT ALL ON TABLE "public"."league_members" TO "authenticated";
GRANT ALL ON TABLE "public"."league_members" TO "service_role";



GRANT ALL ON TABLE "public"."league_notifications" TO "anon";
GRANT ALL ON TABLE "public"."league_notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."league_notifications" TO "service_role";



GRANT ALL ON TABLE "public"."leagues" TO "anon";
GRANT ALL ON TABLE "public"."leagues" TO "authenticated";
GRANT ALL ON TABLE "public"."leagues" TO "service_role";



GRANT ALL ON TABLE "public"."match_events" TO "anon";
GRANT ALL ON TABLE "public"."match_events" TO "authenticated";
GRANT ALL ON TABLE "public"."match_events" TO "service_role";



GRANT ALL ON TABLE "public"."matchday_deadlines" TO "anon";
GRANT ALL ON TABLE "public"."matchday_deadlines" TO "authenticated";
GRANT ALL ON TABLE "public"."matchday_deadlines" TO "service_role";



GRANT ALL ON TABLE "public"."matchday_recaps" TO "anon";
GRANT ALL ON TABLE "public"."matchday_recaps" TO "authenticated";
GRANT ALL ON TABLE "public"."matchday_recaps" TO "service_role";



GRANT ALL ON TABLE "public"."p2p_challenges" TO "anon";
GRANT ALL ON TABLE "public"."p2p_challenges" TO "authenticated";
GRANT ALL ON TABLE "public"."p2p_challenges" TO "service_role";



GRANT ALL ON TABLE "public"."p2p_config" TO "anon";
GRANT ALL ON TABLE "public"."p2p_config" TO "authenticated";
GRANT ALL ON TABLE "public"."p2p_config" TO "service_role";



GRANT ALL ON TABLE "public"."paddock_members" TO "anon";
GRANT ALL ON TABLE "public"."paddock_members" TO "authenticated";
GRANT ALL ON TABLE "public"."paddock_members" TO "service_role";



GRANT ALL ON TABLE "public"."paddocks" TO "anon";
GRANT ALL ON TABLE "public"."paddocks" TO "authenticated";
GRANT ALL ON TABLE "public"."paddocks" TO "service_role";



GRANT ALL ON TABLE "public"."player_availability_flags" TO "anon";
GRANT ALL ON TABLE "public"."player_availability_flags" TO "authenticated";
GRANT ALL ON TABLE "public"."player_availability_flags" TO "service_role";



GRANT ALL ON TABLE "public"."player_box_members" TO "anon";
GRANT ALL ON TABLE "public"."player_box_members" TO "authenticated";
GRANT ALL ON TABLE "public"."player_box_members" TO "service_role";



GRANT ALL ON TABLE "public"."player_boxes" TO "anon";
GRANT ALL ON TABLE "public"."player_boxes" TO "authenticated";
GRANT ALL ON TABLE "public"."player_boxes" TO "service_role";



GRANT ALL ON TABLE "public"."player_match_stats" TO "anon";
GRANT ALL ON TABLE "public"."player_match_stats" TO "authenticated";
GRANT ALL ON TABLE "public"."player_match_stats" TO "service_role";



GRANT ALL ON TABLE "public"."player_status" TO "anon";
GRANT ALL ON TABLE "public"."player_status" TO "authenticated";
GRANT ALL ON TABLE "public"."player_status" TO "service_role";



GRANT ALL ON TABLE "public"."projection_snapshots" TO "anon";
GRANT ALL ON TABLE "public"."projection_snapshots" TO "authenticated";
GRANT ALL ON TABLE "public"."projection_snapshots" TO "service_role";



GRANT ALL ON TABLE "public"."round_backups" TO "anon";
GRANT ALL ON TABLE "public"."round_backups" TO "authenticated";
GRANT ALL ON TABLE "public"."round_backups" TO "service_role";



GRANT ALL ON TABLE "public"."scoring_rules" TO "anon";
GRANT ALL ON TABLE "public"."scoring_rules" TO "authenticated";
GRANT ALL ON TABLE "public"."scoring_rules" TO "service_role";



GRANT ALL ON TABLE "public"."sports" TO "anon";
GRANT ALL ON TABLE "public"."sports" TO "authenticated";
GRANT ALL ON TABLE "public"."sports" TO "service_role";



GRANT ALL ON TABLE "public"."squad_events" TO "anon";
GRANT ALL ON TABLE "public"."squad_events" TO "authenticated";
GRANT ALL ON TABLE "public"."squad_events" TO "service_role";



GRANT ALL ON TABLE "public"."squad_matchday_snapshots" TO "anon";
GRANT ALL ON TABLE "public"."squad_matchday_snapshots" TO "authenticated";
GRANT ALL ON TABLE "public"."squad_matchday_snapshots" TO "service_role";



GRANT ALL ON TABLE "public"."squads" TO "anon";
GRANT ALL ON TABLE "public"."squads" TO "authenticated";
GRANT ALL ON TABLE "public"."squads" TO "service_role";



GRANT UPDATE("captain_id") ON TABLE "public"."squads" TO "authenticated";



GRANT ALL ON TABLE "public"."teams" TO "anon";
GRANT ALL ON TABLE "public"."teams" TO "authenticated";
GRANT ALL ON TABLE "public"."teams" TO "service_role";



GRANT ALL ON TABLE "public"."tennis_ace_cards" TO "anon";
GRANT ALL ON TABLE "public"."tennis_ace_cards" TO "authenticated";
GRANT ALL ON TABLE "public"."tennis_ace_cards" TO "service_role";



GRANT ALL ON TABLE "public"."tennis_atp_finals_matches" TO "anon";
GRANT ALL ON TABLE "public"."tennis_atp_finals_matches" TO "authenticated";
GRANT ALL ON TABLE "public"."tennis_atp_finals_matches" TO "service_role";



GRANT ALL ON TABLE "public"."tennis_atp_finals_picks" TO "anon";
GRANT ALL ON TABLE "public"."tennis_atp_finals_picks" TO "authenticated";
GRANT ALL ON TABLE "public"."tennis_atp_finals_picks" TO "service_role";



GRANT ALL ON TABLE "public"."tennis_qf_captains" TO "anon";
GRANT ALL ON TABLE "public"."tennis_qf_captains" TO "authenticated";
GRANT ALL ON TABLE "public"."tennis_qf_captains" TO "service_role";



GRANT ALL ON TABLE "public"."tennis_rosters" TO "anon";
GRANT ALL ON TABLE "public"."tennis_rosters" TO "authenticated";
GRANT ALL ON TABLE "public"."tennis_rosters" TO "service_role";



GRANT ALL ON TABLE "public"."tennis_seasons" TO "anon";
GRANT ALL ON TABLE "public"."tennis_seasons" TO "authenticated";
GRANT ALL ON TABLE "public"."tennis_seasons" TO "service_role";



GRANT ALL ON TABLE "public"."tennis_tournament_players" TO "anon";
GRANT ALL ON TABLE "public"."tennis_tournament_players" TO "authenticated";
GRANT ALL ON TABLE "public"."tennis_tournament_players" TO "service_role";



GRANT ALL ON TABLE "public"."tennis_tournament_scores" TO "anon";
GRANT ALL ON TABLE "public"."tennis_tournament_scores" TO "authenticated";
GRANT ALL ON TABLE "public"."tennis_tournament_scores" TO "service_role";



GRANT ALL ON TABLE "public"."tennis_tournaments" TO "anon";
GRANT ALL ON TABLE "public"."tennis_tournaments" TO "authenticated";
GRANT ALL ON TABLE "public"."tennis_tournaments" TO "service_role";



GRANT ALL ON TABLE "public"."top_scorer_predictions" TO "anon";
GRANT ALL ON TABLE "public"."top_scorer_predictions" TO "authenticated";
GRANT ALL ON TABLE "public"."top_scorer_predictions" TO "service_role";



GRANT ALL ON TABLE "public"."tournaments" TO "anon";
GRANT ALL ON TABLE "public"."tournaments" TO "authenticated";
GRANT ALL ON TABLE "public"."tournaments" TO "service_role";



GRANT ALL ON TABLE "public"."trade_listings" TO "anon";
GRANT ALL ON TABLE "public"."trade_listings" TO "authenticated";
GRANT ALL ON TABLE "public"."trade_listings" TO "service_role";



GRANT ALL ON TABLE "public"."trade_proposals" TO "anon";
GRANT ALL ON TABLE "public"."trade_proposals" TO "authenticated";
GRANT ALL ON TABLE "public"."trade_proposals" TO "service_role";



GRANT ALL ON TABLE "public"."transfers" TO "anon";
GRANT ALL ON TABLE "public"."transfers" TO "authenticated";
GRANT ALL ON TABLE "public"."transfers" TO "service_role";



GRANT ALL ON TABLE "public"."trophy_ledger" TO "anon";
GRANT ALL ON TABLE "public"."trophy_ledger" TO "authenticated";
GRANT ALL ON TABLE "public"."trophy_ledger" TO "service_role";



GRANT ALL ON TABLE "public"."users" TO "anon";
GRANT ALL ON TABLE "public"."users" TO "authenticated";
GRANT ALL ON TABLE "public"."users" TO "service_role";



GRANT ALL ON TABLE "public"."user_profiles" TO "anon";
GRANT ALL ON TABLE "public"."user_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."user_profiles" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT UPDATE ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT UPDATE ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT UPDATE ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































