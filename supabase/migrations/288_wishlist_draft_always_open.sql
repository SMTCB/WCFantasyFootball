-- Migration 288: Wishlist Draft — make the window permanently open
--
-- Product decision (2026-09-08): the wishlist should behave like a standing
-- watchlist, not a per-round submission window. Managers can add/reorder
-- targets and drops at any time; the automated snake-draft allocation
-- (_shared/wishlistDraft.ts, called from auto-open-transfer-window right
-- before the market opens) is the only thing that resolves it, on its own
-- schedule (once the current matchday's fixtures finish). Once the market is
-- open, transfers are free/direct, so nobody needs the wishlist screen then
-- anyway — no explicit "close during an open market" gate is needed.
--
-- Previously (migrations 253/278), `get_wishlist_draft_status` reported
-- `available: false` the instant a round's window was processed
-- (wishlist_draft_windows.processed_at set), and stayed false until that
-- round's fixtures actually finished and the "next round" calculation
-- (MAX(finished round)+1) rolled forward to catch up — a dead window between
-- "draft just ran" and "matchday actually over" where the screen vanished
-- entirely for no reason.
--
-- Fix: once the base fixture-derived round is at or behind the highest round
-- this league has already processed, treat the *next* round after that as
-- current instead. This keeps `available` true continuously (once the
-- league has played at least one round — no point opening it before that)
-- and always exposes an unprocessed round number to submit against.
-- submit_wishlist_draft's own WINDOW_CLOSED guard (migration 252) is
-- untouched and still correct — it's just no longer reachable in the normal
-- flow, since the round number the client submits against is always the one
-- this function just proved is still open.
--
-- "Clean per round" requirement: no extra clearing logic needed.
-- wishlist_draft_submissions is already keyed UNIQUE(league_id, user_id,
-- round_number) — the moment the effective round advances, there is no row
-- for the new round_number yet, so useWishlistDraft.js's existing-targets
-- query naturally comes back empty. Old rows stay put under their old
-- round_number as history (read by the gazette report), never resurface in
-- the UI.
--
-- auto-open-transfer-window/index.js and run-wishlist-draft/index.js are
-- untouched: both compute the round they actually resolve purely from
-- fixtures (lastFinishedRound + 1), same as this function's base
-- calculation. A submission filed under a round number this function
-- advanced early (before that round's fixtures are even finished) just sits
-- pending until the cron's own fixture-based round number catches up to it —
-- no mismatch, no double-processing.

CREATE OR REPLACE FUNCTION public.get_wishlist_draft_status(p_league_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_tournament_id      text;
  v_format             text;
  v_league_mode        text;
  v_round              int;
  v_max_processed_round int;
  v_max_targets        int := 10;
  v_max_drops          int := 5;
  v_enabled            text;
BEGIN
  SELECT tournament_id, format, league_mode INTO v_tournament_id, v_format, v_league_mode
    FROM leagues WHERE id = p_league_id;

  IF v_tournament_id IS NULL THEN
    RETURN jsonb_build_object('available', false, 'reason', 'league not found');
  END IF;

  IF v_format IS DISTINCT FROM 'noduplicate' AND v_league_mode IS DISTINCT FROM 'draft' THEN
    RETURN jsonb_build_object('available', false, 'reason', 'not a draft-mode league');
  END IF;

  SELECT (config_value #>> '{}') INTO v_enabled
    FROM league_config WHERE league_id = p_league_id AND config_key = 'wishlist_draft_enabled';
  IF v_enabled = 'false' THEN
    RETURN jsonb_build_object('available', false, 'reason', 'disabled for this league');
  END IF;

  SELECT MAX(round_number) INTO v_round
    FROM fixtures WHERE tournament_id = v_tournament_id AND status = 'finished';

  IF v_round IS NULL THEN
    RETURN jsonb_build_object('available', false, 'reason', 'no completed round yet');
  END IF;
  v_round := v_round + 1;

  -- Roll forward past any round(s) already resolved ahead of real-world
  -- fixture progress, so the wishlist is never shown as closed in between.
  SELECT MAX(round_number) INTO v_max_processed_round
    FROM wishlist_draft_windows
   WHERE league_id = p_league_id AND processed_at IS NOT NULL;

  IF v_max_processed_round IS NOT NULL AND v_max_processed_round >= v_round THEN
    v_round := v_max_processed_round + 1;
  END IF;

  SELECT (config_value #>> '{}')::int INTO v_max_targets
    FROM league_config WHERE league_id = p_league_id AND config_key = 'wishlist_draft_max_targets';
  IF v_max_targets IS NULL THEN v_max_targets := 10; END IF;

  SELECT (config_value #>> '{}')::int INTO v_max_drops
    FROM league_config WHERE league_id = p_league_id AND config_key = 'wishlist_draft_max_drops';
  IF v_max_drops IS NULL THEN v_max_drops := 5; END IF;

  RETURN jsonb_build_object(
    'available',    true,
    'round_number', v_round,
    'max_targets',  v_max_targets,
    'max_drops',    v_max_drops
  );
END;
$function$;
