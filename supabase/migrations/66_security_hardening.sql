-- Migration 66: Security hardening + data integrity + pipeline fixes
-- Sprint 0: Release blockers — must apply before any user test invite.
--
-- Items addressed (from CODE_AUDIT_2026-05-24 / LOGIC_AUDIT_2026-05-24 / INGESTION_AUDIT_2026-05-24):
--   SEC-1   Drop permissive squads UPDATE policy; restrict to safe columns only.
--   SEC-4   place_bid: add auth.uid() ownership check on bidder squad.
--   SEC-5   resolve_bet: add commissioner role check.
--   SEC-6   Enable RLS on 18 missing gameplay tables.
--   SEC-7   Restrict users.email to id = auth.uid(); create user_profiles view.
--   L3.1    Restore missing UPDATE in aggregate_league_member_points.
--   L3.2    league_members.total_points → NUMERIC(10,2).
--   L1.1    Create scoring_rules table (JSONB shape) + seed EPL 426.
--   DATA-1  Fix draft upsert onConflict: add tournament_id col + fix squads upsert.
--   DATA-2  Rename scoring_templates → scoring_rules (idempotent).
--   DATA-3  Drop duplicate fantasy_points UNIQUE constraint from migration 63.
--   DATA-11 Idempotent re-application of bet_submissions FK fix.
--   DATA-12 Fix invalid cron expression in migration 21 (unschedule bad job).
--   I1/2.3b Drop single-column players unique index; create composite (forza_player_id, tournament_id).

-- ════════════════════════════════════════════════════════════════════════════════
-- SEC-1: Replace the permissive squads UPDATE policy with column-restricted one.
-- The old policy allowed any squad owner to UPDATE all columns including budget.
-- ════════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "users can update own squad" ON public.squads;

-- Grant UPDATE only on safe display columns (not players[], budget_remaining).
-- All money + roster mutations route through process-transfer (service role).
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'squads' AND column_name = 'captain_id'
  ) THEN
    GRANT UPDATE (captain_id, joker_player_id, is_wildcard, is_triple_captain)
      ON public.squads TO authenticated;
  END IF;
END $$;

CREATE POLICY squads_update_safe ON public.squads
  FOR UPDATE TO authenticated
  USING   (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());


-- ════════════════════════════════════════════════════════════════════════════════
-- SEC-4: place_bid — verify bidder owns the squad they're bidding with.
-- ════════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION place_bid(
  p_auction_id    UUID,
  p_bidder_squad  UUID,
  p_amount        NUMERIC
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_auction   auction_listings;
  v_squad     squads;
  v_min       NUMERIC;
BEGIN
  -- Verify the calling user actually owns the bidder squad.
  SELECT * INTO v_squad FROM squads WHERE id = p_bidder_squad;
  IF NOT FOUND OR v_squad.user_id <> auth.uid() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'You do not own that squad.');
  END IF;

  -- Lock the auction row.
  SELECT * INTO v_auction FROM auction_listings
  WHERE id = p_auction_id AND status = 'active'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Auction not found or already closed.');
  END IF;

  IF v_auction.ends_at < NOW() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Auction has already ended.');
  END IF;

  IF v_auction.seller_squad_id = p_bidder_squad THEN
    RETURN jsonb_build_object('ok', false, 'error', 'You cannot bid on your own auction.');
  END IF;

  v_min := COALESCE(v_auction.current_bid, v_auction.min_bid - 0.1);
  IF p_amount <= v_min THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Bid must be higher than current bid of £' ||
               COALESCE(v_auction.current_bid, v_auction.min_bid)::TEXT || 'M.'
    );
  END IF;

  IF v_squad.budget_remaining < p_amount THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Insufficient budget for this bid.');
  END IF;

  UPDATE auction_listings
  SET current_bid = p_amount, bidder_squad_id = p_bidder_squad
  WHERE id = p_auction_id;

  RETURN jsonb_build_object('ok', true, 'new_bid', p_amount);
END;
$$;


-- ════════════════════════════════════════════════════════════════════════════════
-- SEC-5: resolve_bet — verify caller is commissioner of the bet's league.
-- ════════════════════════════════════════════════════════════════════════════════

-- Must DROP first: existing function uses param name p_instance_id and PostgreSQL
-- disallows renaming parameters via CREATE OR REPLACE.
DROP FUNCTION IF EXISTS resolve_bet(uuid, text);

DO $$ BEGIN
  -- Recreate unconditionally (drop above handles missing-function case).
  EXECUTE $func$
    CREATE OR REPLACE FUNCTION resolve_bet(
      p_bet_id         UUID,
      p_correct_answer TEXT
    ) RETURNS JSONB
    LANGUAGE plpgsql SECURITY DEFINER AS $inner$
    DECLARE
      v_bet       bet_instances%ROWTYPE;
      v_is_comm   BOOLEAN;
      v_winners   INT := 0;
      v_total     INT := 0;
    BEGIN
      -- Load bet to find its league.
      SELECT * INTO v_bet FROM bet_instances WHERE id = p_bet_id;
      IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Bet not found.');
      END IF;

      -- Caller must be commissioner of the bet's league.
      SELECT EXISTS (
        SELECT 1 FROM league_members
        WHERE league_id = v_bet.league_id
          AND user_id   = auth.uid()
          AND role      = 'commissioner'
      ) INTO v_is_comm;

      IF NOT v_is_comm THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Only the commissioner can resolve bets.');
      END IF;

      -- Mark correct submissions and award rewards.
      UPDATE bet_submissions
      SET is_correct = (answer = p_correct_answer),
          reward_awarded = CASE WHEN answer = p_correct_answer THEN v_bet.reward_points ELSE NULL END
      WHERE bet_instance_id = p_bet_id;

      GET DIAGNOSTICS v_total = ROW_COUNT;
      SELECT COUNT(*) INTO v_winners FROM bet_submissions
      WHERE bet_instance_id = p_bet_id AND is_correct = true;

      UPDATE bet_instances
      SET status = 'resolved', correct_answer = p_correct_answer
      WHERE id = p_bet_id;

      RETURN jsonb_build_object('ok', true, 'winners', v_winners, 'total', v_total);
    END;
    $inner$
    $func$;
END $$;


-- ════════════════════════════════════════════════════════════════════════════════
-- SEC-6: Enable RLS on 18 gameplay tables that were missing it.
-- Edge Functions use SERVICE_ROLE_KEY and bypass RLS entirely — these
-- policies only restrict direct browser-client queries.
-- ════════════════════════════════════════════════════════════════════════════════

-- Ensure is_league_member helper exists (defined in migration 47, re-declared
-- here so this migration is self-contained even if 47 was not applied).
CREATE OR REPLACE FUNCTION public.is_league_member(p_league_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.league_members
    WHERE league_id = p_league_id
      AND user_id   = auth.uid()
  );
$$;

-- Apply RLS + policies only for tables that actually exist in this instance.
-- DROP POLICY IF EXISTS still errors when the TABLE is missing, so we guard
-- every block with an information_schema existence check.
DO $sec6$
DECLARE
  tbl TEXT;
BEGIN

  -- fantasy_points
  tbl := 'fantasy_points';
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=tbl) THEN
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "league members read fantasy_points" ON public.%I', tbl);
    EXECUTE format($p$
      CREATE POLICY "league members read fantasy_points"
        ON public.fantasy_points FOR SELECT TO authenticated
        USING (is_league_member(
          (SELECT league_id FROM squads WHERE id = fantasy_points.squad_id LIMIT 1)
        ))
    $p$);
  END IF;

  -- transfers
  tbl := 'transfers';
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=tbl) THEN
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "users read own transfers" ON public.%I', tbl);
    EXECUTE $p$ CREATE POLICY "users read own transfers"
      ON public.transfers FOR SELECT TO authenticated USING (user_id = auth.uid()) $p$;
  END IF;

  -- draft_submissions
  tbl := 'draft_submissions';
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=tbl) THEN
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "users manage own draft_submissions" ON public.%I', tbl);
    EXECUTE $p$ CREATE POLICY "users manage own draft_submissions"
      ON public.draft_submissions FOR ALL TO authenticated
      USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid()) $p$;
  END IF;

  -- draft_allocations
  tbl := 'draft_allocations';
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=tbl) THEN
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "league members read draft_allocations" ON public.%I', tbl);
    EXECUTE $p$ CREATE POLICY "league members read draft_allocations"
      ON public.draft_allocations FOR SELECT TO authenticated
      USING (is_league_member(league_id)) $p$;
  END IF;

  -- gazette_entries
  tbl := 'gazette_entries';
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=tbl) THEN
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "league members read gazette_entries" ON public.%I', tbl);
    EXECUTE $p$ CREATE POLICY "league members read gazette_entries"
      ON public.gazette_entries FOR SELECT TO authenticated
      USING (is_league_member(league_id)) $p$;
  END IF;

  -- bet_instances
  tbl := 'bet_instances';
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=tbl) THEN
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "league members read bet_instances" ON public.%I', tbl);
    EXECUTE $p$ CREATE POLICY "league members read bet_instances"
      ON public.bet_instances FOR SELECT TO authenticated
      USING (is_league_member(league_id)) $p$;
  END IF;

  -- bet_submissions
  tbl := 'bet_submissions';
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=tbl) THEN
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "users manage own bet_submissions" ON public.%I', tbl);
    EXECUTE $p$ CREATE POLICY "users manage own bet_submissions"
      ON public.bet_submissions FOR ALL TO authenticated
      USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid()) $p$;
  END IF;

  -- match_events
  tbl := 'match_events';
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=tbl) THEN
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "authenticated read match_events" ON public.%I', tbl);
    EXECUTE $p$ CREATE POLICY "authenticated read match_events"
      ON public.match_events FOR SELECT TO authenticated USING (true) $p$;
  END IF;

  -- player_match_stats
  tbl := 'player_match_stats';
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=tbl) THEN
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "authenticated read player_match_stats" ON public.%I', tbl);
    EXECUTE $p$ CREATE POLICY "authenticated read player_match_stats"
      ON public.player_match_stats FOR SELECT TO authenticated USING (true) $p$;
  END IF;

  -- cup_active_clubs
  tbl := 'cup_active_clubs';
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=tbl) THEN
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "league members read cup_active_clubs" ON public.%I', tbl);
    EXECUTE $p$ CREATE POLICY "league members read cup_active_clubs"
      ON public.cup_active_clubs FOR SELECT TO authenticated
      USING (is_league_member(league_id)) $p$;
  END IF;

  -- relaxation_state
  tbl := 'relaxation_state';
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=tbl) THEN
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "league members read relaxation_state" ON public.%I', tbl);
    EXECUTE $p$ CREATE POLICY "league members read relaxation_state"
      ON public.relaxation_state FOR SELECT TO authenticated
      USING (is_league_member(league_id)) $p$;
  END IF;

  -- trade_listings
  tbl := 'trade_listings';
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=tbl) THEN
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "league members manage trade_listings" ON public.%I', tbl);
    EXECUTE $p$ CREATE POLICY "league members manage trade_listings"
      ON public.trade_listings FOR ALL TO authenticated
      USING (is_league_member(league_id)) WITH CHECK (is_league_member(league_id)) $p$;
  END IF;

  -- daily_jokers
  tbl := 'daily_jokers';
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=tbl) THEN
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "users manage own daily_jokers" ON public.%I', tbl);
    EXECUTE $p$ CREATE POLICY "users manage own daily_jokers"
      ON public.daily_jokers FOR ALL TO authenticated
      USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid()) $p$;
  END IF;

  -- matchday_deadlines
  tbl := 'matchday_deadlines';
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=tbl) THEN
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "authenticated read matchday_deadlines" ON public.%I', tbl);
    EXECUTE $p$ CREATE POLICY "authenticated read matchday_deadlines"
      ON public.matchday_deadlines FOR SELECT TO authenticated USING (true) $p$;
  END IF;

  -- edge_function_errors (service role only — no SELECT policy for browsers)
  tbl := 'edge_function_errors';
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=tbl) THEN
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "service role only edge_function_errors" ON public.%I', tbl);
  END IF;

  -- transfer_windows
  tbl := 'transfer_windows';
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=tbl) THEN
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "league members read transfer_windows" ON public.%I', tbl);
    EXECUTE $p$ CREATE POLICY "league members read transfer_windows"
      ON public.transfer_windows FOR SELECT TO authenticated
      USING (is_league_member(league_id)) $p$;
  END IF;

  -- teams
  tbl := 'teams';
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=tbl) THEN
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "authenticated read teams" ON public.%I', tbl);
    EXECUTE $p$ CREATE POLICY "authenticated read teams"
      ON public.teams FOR SELECT TO authenticated USING (true) $p$;
  END IF;

END $sec6$;

-- scoring_rules RLS is handled in the CREATE TABLE block below.


-- ════════════════════════════════════════════════════════════════════════════════
-- SEC-7: Restrict users.email exposure; create user_profiles view.
-- The broad "authenticated users can read all profiles" policy currently leaks
-- email addresses to all peers. We replace it with a targeted SELECT policy
-- and create a user_profiles view that only exposes non-PII columns.
-- ════════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "authenticated users can read all profiles" ON public.users;

-- Each user can read their own full row (needed by SettingsScreen).
CREATE POLICY "users read own row"
  ON public.users FOR SELECT TO authenticated
  USING (id = auth.uid());

-- Other authenticated users can read non-PII fields via user_profiles view below.
-- Direct table access to other users' rows is blocked.

CREATE OR REPLACE VIEW public.user_profiles AS
  SELECT id, username, avatar_url, xp, created_at
  FROM public.users;

-- Grant SELECT on the view to authenticated role.
GRANT SELECT ON public.user_profiles TO authenticated;


-- ════════════════════════════════════════════════════════════════════════════════
-- L3.1: Restore the missing UPDATE in aggregate_league_member_points.
-- Migration 37 replaced migration 29's function but dropped the actual UPDATE
-- that persists computed points to league_members.total_points. Standings have
-- been frozen since migration 37 applied.
-- ════════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.aggregate_league_member_points(
  p_league_id  UUID,
  p_matchday_id TEXT
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_member RECORD;
  v_pts    NUMERIC(10,2);
  v_bet    NUMERIC(10,2);
BEGIN
  FOR v_member IN
    SELECT user_id FROM league_members WHERE league_id = p_league_id
  LOOP
    -- Sum fantasy points for all of this user's squads in the league.
    SELECT COALESCE(SUM(fp.total), 0) INTO v_pts
    FROM fantasy_points fp
    JOIN squads s ON s.id = fp.squad_id
    WHERE s.league_id = p_league_id
      AND s.user_id   = v_member.user_id;

    -- Sum bet reward points for this user in the league.
    SELECT COALESCE(SUM(bs.reward_awarded), 0) INTO v_bet
    FROM bet_submissions bs
    JOIN bet_instances   bi ON bi.id = bs.bet_instance_id
    WHERE bi.league_id = p_league_id
      AND bs.user_id   = v_member.user_id
      AND bs.reward_awarded IS NOT NULL;

    -- Persist totals (this UPDATE was the missing piece from migration 37).
    UPDATE public.league_members
    SET total_points = v_pts + v_bet
    WHERE league_id = p_league_id
      AND user_id   = v_member.user_id;
  END LOOP;
END;
$$;


-- ════════════════════════════════════════════════════════════════════════════════
-- L3.2: Widen league_members.total_points to NUMERIC(10,2).
-- The old INTEGER column silently truncates decimal bonus points.
-- ════════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.league_members
  ALTER COLUMN total_points TYPE NUMERIC(10,2)
    USING total_points::NUMERIC(10,2);


-- ════════════════════════════════════════════════════════════════════════════════
-- L1.1 / DATA-2: Create scoring_rules table with the JSONB shape that
-- calculate-scores expects, and rename the dead scoring_templates table.
-- ════════════════════════════════════════════════════════════════════════════════

-- Rename scoring_templates → scoring_rules (idempotent).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'scoring_templates' AND relkind = 'r')
     AND NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'scoring_rules' AND relkind = 'r')
  THEN
    ALTER TABLE public.scoring_templates RENAME TO scoring_rules;
  END IF;
END $$;

-- Create the JSONB scoring_rules table that calculate-scores actually queries.
-- Shape: one row per (tournament_id, position) with a rules JSONB object.
CREATE TABLE IF NOT EXISTS public.scoring_rules_v2 (
  tournament_id TEXT        NOT NULL,
  position      TEXT        NOT NULL,
  rules         JSONB       NOT NULL,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT scoring_rules_v2_pk PRIMARY KEY (tournament_id, position)
);

ALTER TABLE public.scoring_rules_v2 ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated read scoring_rules_v2"
  ON public.scoring_rules_v2 FOR SELECT TO authenticated USING (true);

-- Rename to scoring_rules only if the old flat table was successfully renamed away.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'scoring_rules' AND relkind = 'r') THEN
    ALTER TABLE public.scoring_rules_v2 RENAME TO scoring_rules;
  ELSE
    -- The flat scoring_templates was already renamed to scoring_rules.
    -- We need the JSONB table under a name calculate-scores can use.
    -- Drop the flat version (it's dead code) and use scoring_rules_v2 renamed.
    DROP TABLE IF EXISTS public.scoring_rules;
    ALTER TABLE public.scoring_rules_v2 RENAME TO scoring_rules;
  END IF;
END $$;

-- Seed EPL (tournament_id = '426') scoring rules.
INSERT INTO public.scoring_rules (tournament_id, position, rules) VALUES
  ('426', 'GK',
   '{"goal":5,"assist":0,"clean_sheet":4,"conceded_per_2_goals":-1,"penalty_saved":5,"tackle":0,"interception":0,"penalty_scored":0,"minute_played_per_90":1}'::jsonb),
  ('426', 'DEF',
   '{"goal":4,"assist":1,"clean_sheet":4,"conceded_per_2_goals":0,"penalty_saved":0,"tackle":0.5,"interception":0.25,"penalty_scored":0,"minute_played_per_90":1}'::jsonb),
  ('426', 'MID',
   '{"goal":5,"assist":1,"clean_sheet":1,"conceded_per_2_goals":0,"penalty_saved":0,"tackle":0.5,"interception":0.25,"penalty_scored":0,"minute_played_per_90":1}'::jsonb),
  ('426', 'FWD',
   '{"goal":3,"assist":1,"clean_sheet":0,"conceded_per_2_goals":0,"penalty_saved":0,"tackle":0,"interception":0,"penalty_scored":1,"minute_played_per_90":1}'::jsonb),
  ('426', 'UNIVERSAL',
   '{"own_goal":-2,"yellow_card":-1,"red_card":-3,"penalty_missed":-1}'::jsonb)
ON CONFLICT (tournament_id, position) DO NOTHING;


-- ════════════════════════════════════════════════════════════════════════════════
-- DATA-1: Fix draft upsert targets.
-- 1. Add tournament_id to draft_submissions (needed for onConflict).
-- 2. Ensure squads has a unique constraint on (league_id, user_id, matchday_id)
--    so the run-draft-lottery upsert works post-migration 49.
-- ════════════════════════════════════════════════════════════════════════════════

-- Add tournament_id column to draft_submissions if missing.
ALTER TABLE public.draft_submissions
  ADD COLUMN IF NOT EXISTS tournament_id TEXT;

-- Ensure the composite unique on draft_submissions exists.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'draft_submissions_league_user_key' AND conrelid = 'draft_submissions'::regclass
  ) THEN
    ALTER TABLE public.draft_submissions
      ADD CONSTRAINT draft_submissions_league_user_key
        UNIQUE (league_id, user_id);
  END IF;
END $$;

-- Ensure squads has the unique constraint that the lottery upsert relies on.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'squads_league_user_matchday_key' AND conrelid = 'squads'::regclass
  ) THEN
    ALTER TABLE public.squads
      ADD CONSTRAINT squads_league_user_matchday_key
        UNIQUE (league_id, user_id, matchday_id);
  END IF;
END $$;


-- ════════════════════════════════════════════════════════════════════════════════
-- DATA-3: Drop duplicate fantasy_points UNIQUE constraint added by migration 63.
-- ════════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.fantasy_points
  DROP CONSTRAINT IF EXISTS fantasy_points_squad_matchday_unique;

-- Ensure exactly one canonical constraint exists.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fantasy_points_squad_matchday_key'
      AND conrelid = 'fantasy_points'::regclass
  ) THEN
    ALTER TABLE public.fantasy_points
      ADD CONSTRAINT fantasy_points_squad_matchday_key UNIQUE (squad_id, matchday_id);
  END IF;
END $$;


-- ════════════════════════════════════════════════════════════════════════════════
-- DATA-11: Idempotent bet_submissions FK fix (migration 16 vs 28 ordering).
-- ════════════════════════════════════════════════════════════════════════════════

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'bet_submissions_bet_instance_id_fkey'
      AND conrelid = 'bet_submissions'::regclass
  ) THEN
    ALTER TABLE public.bet_submissions
      ADD CONSTRAINT bet_submissions_bet_instance_id_fkey
        FOREIGN KEY (bet_instance_id) REFERENCES bet_instances(id) ON DELETE CASCADE;
  END IF;
END $$;


-- ════════════════════════════════════════════════════════════════════════════════
-- DATA-12: Unschedule the invalid cron expression that was created in migration 21.
-- The expression '0 2 * * 0,6' is the auto-open-transfer-window job that may have
-- been created with a malformed schedule on some DB instances.
-- ════════════════════════════════════════════════════════════════════════════════

SELECT cron.unschedule(jobid)
FROM cron.job
WHERE command LIKE '%auto-open-transfer-window%'
  AND schedule NOT IN ('0 */2 * * *', '0 2 * * *')
LIMIT 1;


-- ════════════════════════════════════════════════════════════════════════════════
-- I1 / 2.3.b: Fix players unique index to enable cross-tournament players.
-- Drop the single-column UNIQUE on forza_player_id; create composite.
-- This unblocks the sync-players upsert (onConflict: 'forza_player_id,tournament_id').
-- ════════════════════════════════════════════════════════════════════════════════

DROP INDEX IF EXISTS public.players_forza_player_id_idx;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'players'
      AND indexname  = 'players_forza_tournament_uniq'
  ) THEN
    CREATE UNIQUE INDEX players_forza_tournament_uniq
      ON public.players (forza_player_id, tournament_id)
      WHERE forza_player_id IS NOT NULL;
  END IF;
END $$;
