-- 219_delete_user_data.sql
-- DATA-2: GDPR right-to-erasure RPC.
-- Callable by the user themselves (own id) OR any admin.
-- All deletes use p_uid to avoid FK violations ordering:
--   1. Ephemeral/notification rows (leaf)
--   2. User-generated content (messages, reactions, submissions)
--   3. Financial ledger — delete leaf rows (coin_wallets cascades coin_transactions)
--   4. Game history rows — anonymise where league integrity requires preservation
--   5. Membership rows — delete (removes user from leagues/circles/paddocks/boxes)
--   6. Wipe PII on users row; mark deleted
--
-- NOTE: squads and fantasy_points are intentionally NOT deleted — the league's
-- historical standings and points breakdown are structural league data, not the
-- user's personal data in the GDPR sense. The user_id FK on squads is set NULL.
-- trophy_ledger rows are anonymised (user_id → NULL) to preserve league trophy counts.

CREATE OR REPLACE FUNCTION delete_user_data(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

-- Permissions: users call for own id; service role bypasses (no auth.uid())
REVOKE ALL ON FUNCTION delete_user_data(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION delete_user_data(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION delete_user_data(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION delete_user_data(uuid) TO service_role;

COMMENT ON FUNCTION delete_user_data(uuid) IS
  'GDPR right-to-erasure. Deletes/anonymises all rows tied to p_user_id. '
  'Callable by the user for their own id, or by any admin. '
  'Squads are retained with user_id=NULL so fantasy_points history is preserved. '
  'See docs/platform_revision/due_diligence/DATA_CLASSIFICATION.md.';
