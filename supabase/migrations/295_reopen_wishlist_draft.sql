-- Migration 295: commissioner can reopen the wishlist draft for the current round
--
-- Problem: after a round's wishlist draft has run (status='done'), the window is
-- terminal. submit_wishlist_draft rejects it, request_wishlist_draft_run and
-- set_wishlist_draft_mode only act on a pending window, and
-- create_wishlist_draft_round only fires when a round finishes. So a league
-- that wants a second draft before the same round's first kickoff had no way to
-- get one.
--
-- reopen_wishlist_draft(league) puts the latest done window back to
-- 'scheduled' as a Manual round (kickoff − 8h safety net), closes the open
-- market (the draft's commit reopens it), and re-arms the round's submissions
-- with the targets the manager does not own yet. Everything after that is the
-- existing flow: edit wishlists, Run now / switch to Auto, commit.
--
-- Additive: one new function. No table or existing function is changed.

CREATE OR REPLACE FUNCTION public.reopen_wishlist_draft(p_league_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user          uuid := auth.uid();
  v_row           wishlist_draft_windows;
  v_tournament_id text;
  v_kickoff       timestamptz;
  v_deadline      timestamptz;
  v_reset         int := 0;
BEGIN
  IF v_user IS NULL OR NOT EXISTS (
    SELECT 1 FROM league_members WHERE league_id = p_league_id AND user_id = v_user AND role = 'commissioner'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'error', 'Commissioner only');
  END IF;

  IF NOT _wishlist_is_draft_league(p_league_id) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_DRAFT', 'error', 'Wishlist draft only exists in draft-mode leagues');
  END IF;

  IF (_wishlist_pending_window(p_league_id)).id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ALREADY_PENDING', 'error', 'A wishlist draft is already waiting to run');
  END IF;

  -- The most recent round's window, locked.
  SELECT * INTO v_row FROM wishlist_draft_windows
   WHERE league_id = p_league_id
   ORDER BY round_number DESC LIMIT 1
   FOR UPDATE;

  IF v_row.id IS NULL OR v_row.status <> 'done' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOTHING_TO_REOPEN',
      'error', 'There is no finished draft to reopen — the next round''s draft opens when the current round finishes');
  END IF;

  SELECT tournament_id INTO v_tournament_id FROM leagues WHERE id = p_league_id;
  SELECT MIN(kickoff_at) INTO v_kickoff
    FROM fixtures WHERE tournament_id = v_tournament_id AND round_number = v_row.round_number;

  IF v_kickoff IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_KICKOFF',
      'error', 'Round ' || v_row.round_number || ' has no kickoff date, so the draft cannot be given a safety-net deadline');
  END IF;

  v_deadline := v_kickoff - interval '8 hours';
  IF v_deadline < NOW() + interval '6 hours' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'TOO_LATE',
      'error', 'Kickoff is too close to hold another draft for this round (needs 6h+ before the kickoff − 8h deadline)',
      'first_kickoff_at', v_kickoff);
  END IF;

  UPDATE wishlist_draft_windows
     SET status                = 'scheduled',
         mode                  = 'manual',
         processed_at          = NULL,
         run_token             = NULL,
         run_trigger           = NULL,
         run_requested_at      = NULL,
         run_requested_by      = NULL,
         started_at            = NULL,
         participant_count     = 0,
         scheduled_at          = NULL,
         first_kickoff_at      = v_kickoff,
         hard_deadline_at      = v_deadline,
         reminder_sent_at      = NULL,
         kickoff_alert_sent_at = NULL,
         created_at            = NOW()
   WHERE id = v_row.id;

  -- Close the round's open market. commit_wishlist_draft → _wishlist_open_market
  -- extends closes_at back out to kickoff − 1h when the draft completes.
  UPDATE transfer_windows
     SET closes_at = NOW()
   WHERE league_id = p_league_id AND round_number = v_row.round_number AND closes_at > NOW();

  -- Re-arm submissions: keep only targets the manager does not already own;
  -- the drops they asked for were executed by the previous run.
  UPDATE wishlist_draft_submissions s
     SET target_ids = ARRAY(
           SELECT t FROM unnest(s.target_ids) WITH ORDINALITY AS u(t, ord)
            WHERE NOT (t = ANY (COALESCE(
                    (SELECT q.players FROM squads q
                      WHERE q.league_id = s.league_id AND q.user_id = s.user_id
                      ORDER BY q.created_at DESC LIMIT 1), ARRAY[]::text[])))
            ORDER BY ord),
         drop_ids   = ARRAY[]::text[],
         status     = 'pending'
   WHERE s.league_id = p_league_id AND s.round_number = v_row.round_number;
  GET DIAGNOSTICS v_reset = ROW_COUNT;

  INSERT INTO wishlist_draft_mode_changes
    (league_id, round_number, scope, from_mode, to_mode, changed_by)
  VALUES (p_league_id, v_row.round_number, 'round', v_row.mode, 'manual', v_user);

  PERFORM _wishlist_notify_members(
    p_league_id, 'wishlist_draft_mode', 'Wishlist draft reopened',
    'Round ' || v_row.round_number || ' has another wishlist draft. Update your wishlist now — the market is closed until the commissioner runs it (latest '
      || to_char(v_deadline AT TIME ZONE 'UTC', 'Dy DD Mon HH24:MI') || ' UTC). Trades are still allowed.',
    v_user);

  RETURN jsonb_build_object(
    'ok', true, 'round_number', v_row.round_number, 'mode', 'manual',
    'first_kickoff_at', v_kickoff, 'hard_deadline_at', v_deadline, 'submissions_reset', v_reset
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reopen_wishlist_draft(uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.reopen_wishlist_draft(uuid) TO authenticated;
