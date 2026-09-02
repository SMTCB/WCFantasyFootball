-- Fix get_wishlist_draft_status(): v_tournament_id was declared uuid, but
-- leagues.tournament_id and fixtures.tournament_id are both text (Forza
-- tournament IDs, e.g. '429'). Every call to this RPC threw
-- "invalid input syntax for type uuid" and was silently swallowed by
-- useWishlistDraft.js (it discards the RPC error), so WishlistDraftBanner
-- never rendered for any user in any draft-mode league since PR #841.

CREATE OR REPLACE FUNCTION public.get_wishlist_draft_status(p_league_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_tournament_id text;
  v_format        text;
  v_league_mode   text;
  v_round         int;
  v_processed_at  timestamptz;
  v_max_targets   int := 10;
  v_max_drops     int := 5;
  v_enabled       text;
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

  SELECT processed_at INTO v_processed_at
    FROM wishlist_draft_windows
   WHERE league_id = p_league_id AND round_number = v_round;

  SELECT (config_value #>> '{}')::int INTO v_max_targets
    FROM league_config WHERE league_id = p_league_id AND config_key = 'wishlist_draft_max_targets';
  IF v_max_targets IS NULL THEN v_max_targets := 10; END IF;

  SELECT (config_value #>> '{}')::int INTO v_max_drops
    FROM league_config WHERE league_id = p_league_id AND config_key = 'wishlist_draft_max_drops';
  IF v_max_drops IS NULL THEN v_max_drops := 5; END IF;

  RETURN jsonb_build_object(
    'available',    v_processed_at IS NULL,
    'round_number', v_round,
    'max_targets',  v_max_targets,
    'max_drops',    v_max_drops
  );
END;
$function$;
