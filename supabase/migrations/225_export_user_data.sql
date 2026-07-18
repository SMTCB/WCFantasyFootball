-- 225_export_user_data.sql
-- GDPR-2: right-to-portability RPC (Article 20). Read-only — no INSERT/UPDATE/DELETE.
-- Mirrors the exact table/column set audited in migration 219 (delete_user_data)
-- and docs/platform_revision/due_diligence/DATA_CLASSIFICATION.md, plus the
-- financial ledger detail (coin_transactions) and full trade_proposals history
-- (not just pending) since those are meaningful for a portability export even
-- though migration 219 only needs the pending subset for erasure.
--
-- Callable by the user themselves (own id) OR any admin. Returns one jsonb
-- object keyed by table/category name; conditional v2-only tables are omitted
-- entirely (not present as an empty key) when the table doesn't exist, so the
-- same function works unmodified on both `main` and `v2`.

CREATE OR REPLACE FUNCTION export_user_data(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

-- Permissions: users call for own id; service role/admin bypass. Read-only — no
-- write grants needed anywhere.
REVOKE ALL ON FUNCTION export_user_data(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION export_user_data(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION export_user_data(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION export_user_data(uuid) TO service_role;

COMMENT ON FUNCTION export_user_data(uuid) IS
  'GDPR right-to-portability (Art. 20). Read-only — returns one jsonb object '
  'with every row tied to p_user_id, keyed by table/category name. Callable '
  'by the user for their own id, or by any admin. Mirrors the table set '
  'audited in migration 219 (delete_user_data) plus the coin_transactions '
  'ledger and full trade_proposals history. See '
  'docs/platform_revision/due_diligence/DATA_CLASSIFICATION.md.';
