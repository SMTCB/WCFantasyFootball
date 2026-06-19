-- Migration 183: squad_events append-only audit table (BI-03)
--
-- Creates an audit log for every squad mutation.  All writes go through
-- a SECURITY DEFINER helper function called from inside the existing
-- SECURITY DEFINER RPCs — no direct client INSERT is permitted.
--
-- Covered events:
--   transfer_buy / transfer_sell → execute_transfer_atomic
--   auction_bid                  → place_bid
--   auction_win                  → confirm_auction_win
--   trade_propose                → submit_trade_proposal
--   trade_accept                 → accept_trade_proposal (two events per call)
--   lineup_swap                  → set_lineup
--   captain_change               → set_captain
--   draft_pick                   → claim_draft_player

-- ── Table ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS squad_events (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  event_type  text        NOT NULL,
  league_id   uuid        REFERENCES leagues(id),
  user_id     uuid,
  squad_id    uuid        REFERENCES squads(id),
  matchday_id text,
  player_in   text,
  player_out  text,
  meta        jsonb       DEFAULT '{}'::jsonb,
  event_at    timestamptz DEFAULT now()
);

CREATE INDEX squad_events_league_idx ON squad_events (league_id);
CREATE INDEX squad_events_user_idx   ON squad_events (user_id);
CREATE INDEX squad_events_squad_idx  ON squad_events (squad_id);
CREATE INDEX squad_events_type_idx   ON squad_events (event_type);
CREATE INDEX squad_events_at_idx     ON squad_events (event_at DESC);

ALTER TABLE squad_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "squad_events_commissioner_read" ON squad_events
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM league_members
      WHERE league_id = squad_events.league_id
        AND user_id   = auth.uid()
        AND role      = 'commissioner'
    )
  );

CREATE POLICY "squad_events_own_read" ON squad_events
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- ── Internal helper ───────────────────────────────────────────────────────────
-- Called from SECURITY DEFINER RPCs only; never exposed to clients.
-- EXCEPTION block makes it non-fatal: audit failure must never break a transfer.

CREATE OR REPLACE FUNCTION _log_squad_event(
  p_event_type  text,
  p_league_id   uuid    DEFAULT NULL,
  p_user_id     uuid    DEFAULT NULL,
  p_squad_id    uuid    DEFAULT NULL,
  p_matchday_id text    DEFAULT NULL,
  p_player_in   text    DEFAULT NULL,
  p_player_out  text    DEFAULT NULL,
  p_meta        jsonb   DEFAULT '{}'::jsonb
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO squad_events
    (event_type, league_id, user_id, squad_id, matchday_id, player_in, player_out, meta)
  VALUES
    (p_event_type, p_league_id, p_user_id, p_squad_id, p_matchday_id, p_player_in, p_player_out, p_meta);
EXCEPTION WHEN OTHERS THEN
  NULL;  -- non-fatal: audit failure must never block a squad mutation
END;
$$;

GRANT EXECUTE ON FUNCTION _log_squad_event(text, uuid, uuid, uuid, text, text, text, jsonb) TO service_role;

-- ── execute_transfer_atomic — transfer_buy / transfer_sell ────────────────────

DROP FUNCTION IF EXISTS execute_transfer_atomic(uuid, text, text, numeric, int, int, int, uuid, text);

CREATE OR REPLACE FUNCTION execute_transfer_atomic(
  p_squad_id    uuid,
  p_action      text,
  p_player_id   text,
  p_price       numeric,
  p_pos_limit   int  DEFAULT 99,
  p_squad_max   int  DEFAULT 99,
  p_club_max    int  DEFAULT 99,
  p_league_id   uuid DEFAULT NULL,
  p_matchday_id text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
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
$$;

GRANT EXECUTE ON FUNCTION execute_transfer_atomic(uuid, text, text, numeric, int, int, int, uuid, text) TO service_role;
REVOKE EXECUTE ON FUNCTION execute_transfer_atomic(uuid, text, text, numeric, int, int, int, uuid, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION execute_transfer_atomic(uuid, text, text, numeric, int, int, int, uuid, text) FROM anon;

-- ── place_bid — auction_bid ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.place_bid(
  p_listing_id UUID,
  p_bid_amount NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
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

-- ── confirm_auction_win — auction_win ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.confirm_auction_win(p_listing_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
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

-- ── submit_trade_proposal — trade_propose ─────────────────────────────────────

CREATE OR REPLACE FUNCTION submit_trade_proposal(
  p_league_id          UUID,
  p_proposer_squad_id  UUID,
  p_target_squad_id    UUID,
  p_proposer_player_id TEXT,
  p_target_player_id   TEXT,
  p_cash_sweetener     NUMERIC DEFAULT 0,
  p_points_sweetener   INT     DEFAULT 0
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
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

-- ── accept_trade_proposal — trade_accept (two events: proposer + target) ──────

CREATE OR REPLACE FUNCTION public.accept_trade_proposal(p_proposal_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
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

-- ── set_lineup — lineup_swap ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_lineup(p_squad_id uuid, p_player_out text, p_player_in text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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

  IF v_gk_count < 1 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Starting XI must include at least 1 goalkeeper');
  END IF;
  IF v_def_count < 3 OR v_def_count > 5 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Starting XI must have 3–5 defenders (got ' || v_def_count || ')');
  END IF;
  IF v_mid_count < 2 OR v_mid_count > 5 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Starting XI must have 2–5 midfielders (got ' || v_mid_count || ')');
  END IF;
  IF v_fwd_count < 1 OR v_fwd_count > 3 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Starting XI must have 1–3 forwards (got ' || v_fwd_count || ')');
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
$function$
;

-- ── set_captain — captain_change ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_captain(p_squad_id uuid, p_player_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_squad          squads;
  v_matchday_id    text;
  v_round_number   int;
  v_tournament_id  text;
  v_fixture_status text;
  v_is_triple      boolean;
  v_mult           int;
  v_new_total      numeric;
  v_old_captain_id text;
BEGIN
  SELECT * INTO v_squad FROM squads WHERE id = p_squad_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Squad not found');
  END IF;

  IF auth.uid() IS NOT NULL AND v_squad.user_id IS DISTINCT FROM auth.uid() THEN
    RETURN jsonb_build_object('ok', false, 'code', 'UNAUTHORIZED', 'error', 'Not your squad');
  END IF;

  IF NOT (p_player_id = ANY(COALESCE(v_squad.starting_xi, '{}'))) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Only players in your starting XI can be captain');
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
    '{}'::jsonb);

  RETURN jsonb_build_object('ok', true, 'captain_id', p_player_id);
END;
$function$
;

-- ── claim_draft_player — draft_pick ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION claim_draft_player(
  p_league_id uuid,
  p_player_id text,
  p_phase     text DEFAULT 'group'
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
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

REVOKE EXECUTE ON FUNCTION claim_draft_player(uuid, text, text) FROM anon;
GRANT  EXECUTE ON FUNCTION claim_draft_player(uuid, text, text) TO authenticated;
