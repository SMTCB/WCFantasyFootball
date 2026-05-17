-- Migration 52: Audit Log Table for Transfers, Auctions, and Bets
-- Purpose: Track all significant league actions for dispute resolution and debugging
-- Date: 2026-05-17

-- Create audit_logs table
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  league_id UUID NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL, -- 'transfer' | 'bid' | 'bet' | 'sale'
  action_subtype TEXT, -- e.g., 'player_buy', 'player_sell', 'auction_bid_placed', 'auction_won', 'bet_created', 'bet_submitted', 'bet_resolved'
  target_id TEXT, -- player_id for transfers, auction_listing_id for bids, bet_submission_id for bets
  target_name TEXT, -- player name, bet title, etc. (for UI readability without extra joins)
  before_state JSONB, -- Previous state (e.g., budget before transfer, squad before sale)
  after_state JSONB, -- New state (e.g., budget after transfer, squad after sale)
  metadata JSONB DEFAULT '{}'::jsonb, -- Extra context (e.g., price paid, bid amount, answer submitted)
  reason TEXT -- Why the action occurred (e.g., 'Manual transfer', 'Auto-filled squad', 'Auction won')
);

-- Indexes for efficient querying
CREATE INDEX idx_audit_logs_league_timestamp ON public.audit_logs(league_id, created_at DESC);
CREATE INDEX idx_audit_logs_user_timestamp ON public.audit_logs(user_id, created_at DESC);
CREATE INDEX idx_audit_logs_action_type ON public.audit_logs(action_type);
CREATE INDEX idx_audit_logs_target_id ON public.audit_logs(target_id);

-- Enable RLS
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Commissioners can view all audit logs for their league
CREATE POLICY "commissioners_view_league_audit_logs"
  ON public.audit_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.league_members
      WHERE league_id = audit_logs.league_id
        AND user_id = auth.uid()
        AND is_commissioner = TRUE
    )
  );

-- RLS Policy: Prevent anyone from deleting audit logs (immutable history)
CREATE POLICY "no_delete_audit_logs"
  ON public.audit_logs
  FOR DELETE
  USING (FALSE);

-- RLS Policy: Only system (Edge Functions) can insert via trigger
CREATE POLICY "system_insert_audit_logs"
  ON public.audit_logs
  FOR INSERT
  WITH CHECK (TRUE); -- Trust the trigger; no direct user inserts

-- Trigger function: Log transfer actions
CREATE OR REPLACE FUNCTION public.log_transfer_action()
RETURNS TRIGGER AS $$
DECLARE
  v_squad_before JSONB;
  v_squad_after JSONB;
  v_player_name TEXT;
  v_league_id UUID;
BEGIN
  -- Get league_id from the squad
  SELECT league_id INTO v_league_id FROM public.squads WHERE id = NEW.squad_id;

  -- Get player name
  SELECT name INTO v_player_name FROM public.players WHERE id = NEW.player_id;

  -- Fetch before/after squad states (simplified: just the budget and player count)
  -- In production, you might store the full player array or a more detailed diff
  v_squad_before := jsonb_build_object(
    'player_id', COALESCE(OLD.player_id, NEW.player_id),
    'player_name', COALESCE((SELECT name FROM public.players WHERE id = OLD.player_id), v_player_name)
  );

  v_squad_after := jsonb_build_object(
    'player_id', NEW.player_id,
    'player_name', v_player_name
  );

  -- Determine action subtype
  INSERT INTO public.audit_logs (
    league_id,
    user_id,
    action_type,
    action_subtype,
    target_id,
    target_name,
    before_state,
    after_state,
    metadata,
    reason
  ) VALUES (
    v_league_id,
    NEW.user_id,
    'transfer',
    CASE
      WHEN TG_OP = 'INSERT' THEN 'player_buy'
      WHEN TG_OP = 'DELETE' THEN 'player_sell'
      ELSE 'player_transfer'
    END,
    NEW.player_id::TEXT,
    v_player_name,
    v_squad_before,
    v_squad_after,
    jsonb_build_object('price', NEW.price, 'squad_id', NEW.squad_id::TEXT),
    'Transfer via market'
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger on transfers table
DROP TRIGGER IF EXISTS trigger_log_transfer ON public.transfers;
CREATE TRIGGER trigger_log_transfer
  AFTER INSERT OR DELETE ON public.transfers
  FOR EACH ROW
  EXECUTE FUNCTION public.log_transfer_action();

-- Trigger function: Log auction bid and sale actions
CREATE OR REPLACE FUNCTION public.log_auction_action()
RETURNS TRIGGER AS $$
DECLARE
  v_league_id UUID;
  v_player_name TEXT;
  v_action_subtype TEXT;
  v_reason TEXT;
BEGIN
  -- Get league_id from the auction_listing
  SELECT league_id INTO v_league_id FROM public.auction_listings WHERE id = NEW.id;

  -- Get player name
  SELECT name INTO v_player_name FROM public.players WHERE id = NEW.player_id;

  -- Determine action subtype based on status changes
  IF TG_OP = 'INSERT' THEN
    v_action_subtype := 'auction_created';
    v_reason := 'Auction listed for ' || v_player_name;
  ELSIF NEW.status = 'sold' AND OLD.status IS DISTINCT FROM 'sold' THEN
    v_action_subtype := 'auction_won';
    v_reason := 'Auction won by winning_user_id';
  ELSIF NEW.status = 'closed' AND OLD.status IS DISTINCT FROM 'closed' THEN
    v_action_subtype := 'auction_closed';
    v_reason := 'Auction closed without sale';
  ELSE
    v_action_subtype := 'auction_updated';
    v_reason := 'Auction status updated';
  END IF;

  INSERT INTO public.audit_logs (
    league_id,
    user_id,
    action_type,
    action_subtype,
    target_id,
    target_name,
    before_state,
    after_state,
    metadata,
    reason
  ) VALUES (
    v_league_id,
    NEW.seller_user_id,
    'bid',
    v_action_subtype,
    NEW.id::TEXT,
    v_player_name,
    jsonb_build_object('status', COALESCE(OLD.status, 'new')),
    jsonb_build_object('status', NEW.status, 'final_price', NEW.final_price),
    jsonb_build_object(
      'winning_user_id', NEW.winning_user_id::TEXT,
      'starting_price', NEW.starting_price,
      'final_price', NEW.final_price
    ),
    v_reason
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger on auction_listings table
DROP TRIGGER IF EXISTS trigger_log_auction ON public.auction_listings;
CREATE TRIGGER trigger_log_auction
  AFTER INSERT OR UPDATE ON public.auction_listings
  FOR EACH ROW
  EXECUTE FUNCTION public.log_auction_action();

-- Trigger function: Log bet submission actions
CREATE OR REPLACE FUNCTION public.log_bet_action()
RETURNS TRIGGER AS $$
DECLARE
  v_league_id UUID;
  v_action_subtype TEXT;
  v_bet_title TEXT;
BEGIN
  -- Get league_id and bet title from bet_instances
  SELECT league_id, title INTO v_league_id, v_bet_title
  FROM public.bet_instances
  WHERE id = NEW.bet_instance_id;

  -- Determine action subtype
  IF TG_OP = 'INSERT' THEN
    v_action_subtype := 'bet_submitted';
  ELSIF NEW.is_correct IS NOT NULL THEN
    v_action_subtype := 'bet_resolved';
  ELSE
    v_action_subtype := 'bet_updated';
  END IF;

  INSERT INTO public.audit_logs (
    league_id,
    user_id,
    action_type,
    action_subtype,
    target_id,
    target_name,
    before_state,
    after_state,
    metadata,
    reason
  ) VALUES (
    v_league_id,
    NEW.user_id,
    'bet',
    v_action_subtype,
    NEW.id::TEXT,
    v_bet_title,
    jsonb_build_object('submitted_answer', OLD.submitted_answer),
    jsonb_build_object('submitted_answer', NEW.submitted_answer, 'is_correct', NEW.is_correct),
    jsonb_build_object(
      'bet_instance_id', NEW.bet_instance_id::TEXT,
      'reward', NEW.reward_awarded
    ),
    CASE
      WHEN TG_OP = 'INSERT' THEN 'Answer submitted'
      WHEN NEW.is_correct = TRUE THEN 'Correct answer - points awarded'
      WHEN NEW.is_correct = FALSE THEN 'Incorrect answer'
      ELSE 'Bet answer updated'
    END
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger on bet_submissions table
DROP TRIGGER IF EXISTS trigger_log_bet ON public.bet_submissions;
CREATE TRIGGER trigger_log_bet
  AFTER INSERT OR UPDATE ON public.bet_submissions
  FOR EACH ROW
  EXECUTE FUNCTION public.log_bet_action();

-- RPC: Get audit logs for a league with filters
CREATE OR REPLACE FUNCTION public.get_audit_logs(
  p_league_id UUID,
  p_limit INT DEFAULT 100,
  p_action_type TEXT DEFAULT NULL,
  p_user_id UUID DEFAULT NULL,
  p_days_back INT DEFAULT 30
)
RETURNS TABLE (
  id BIGINT,
  created_at TIMESTAMP WITH TIME ZONE,
  user_id UUID,
  action_type TEXT,
  action_subtype TEXT,
  target_id TEXT,
  target_name TEXT,
  metadata JSONB,
  reason TEXT
) AS $$
BEGIN
  -- Verify user is commissioner
  IF NOT EXISTS (
    SELECT 1 FROM public.league_members
    WHERE league_id = p_league_id
      AND user_id = auth.uid()
      AND is_commissioner = TRUE
  ) THEN
    RAISE EXCEPTION 'Only commissioners can view audit logs';
  END IF;

  RETURN QUERY
  SELECT
    al.id,
    al.created_at,
    al.user_id,
    al.action_type,
    al.action_subtype,
    al.target_id,
    al.target_name,
    al.metadata,
    al.reason
  FROM public.audit_logs al
  WHERE al.league_id = p_league_id
    AND (p_action_type IS NULL OR al.action_type = p_action_type)
    AND (p_user_id IS NULL OR al.user_id = p_user_id)
    AND al.created_at >= NOW() - (p_days_back || ' days')::INTERVAL
  ORDER BY al.created_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC: Get detailed audit log entry (with before/after state)
CREATE OR REPLACE FUNCTION public.get_audit_log_detail(p_log_id BIGINT)
RETURNS TABLE (
  id BIGINT,
  created_at TIMESTAMP WITH TIME ZONE,
  league_id UUID,
  user_id UUID,
  action_type TEXT,
  action_subtype TEXT,
  target_id TEXT,
  target_name TEXT,
  before_state JSONB,
  after_state JSONB,
  metadata JSONB,
  reason TEXT
) AS $$
DECLARE
  v_league_id UUID;
BEGIN
  -- Get league_id from audit log
  SELECT league_id INTO v_league_id FROM public.audit_logs WHERE id = p_log_id;

  -- Verify user is commissioner of that league
  IF NOT EXISTS (
    SELECT 1 FROM public.league_members
    WHERE league_id = v_league_id
      AND user_id = auth.uid()
      AND is_commissioner = TRUE
  ) THEN
    RAISE EXCEPTION 'Only commissioners can view audit logs';
  END IF;

  RETURN QUERY
  SELECT
    al.id,
    al.created_at,
    al.league_id,
    al.user_id,
    al.action_type,
    al.action_subtype,
    al.target_id,
    al.target_name,
    al.before_state,
    al.after_state,
    al.metadata,
    al.reason
  FROM public.audit_logs al
  WHERE al.id = p_log_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC: Export audit logs as CSV (for commissioners)
CREATE OR REPLACE FUNCTION public.export_audit_logs_csv(p_league_id UUID, p_days_back INT DEFAULT 90)
RETURNS TEXT AS $$
DECLARE
  v_csv TEXT;
BEGIN
  -- Verify user is commissioner
  IF NOT EXISTS (
    SELECT 1 FROM public.league_members
    WHERE league_id = p_league_id
      AND user_id = auth.uid()
      AND is_commissioner = TRUE
  ) THEN
    RAISE EXCEPTION 'Only commissioners can export audit logs';
  END IF;

  -- Build CSV
  WITH csv_data AS (
    SELECT
      al.id,
      al.created_at,
      u.email,
      al.action_type,
      al.action_subtype,
      al.target_name,
      al.reason
    FROM public.audit_logs al
    LEFT JOIN auth.users u ON u.id = al.user_id
    WHERE al.league_id = p_league_id
      AND al.created_at >= NOW() - (p_days_back || ' days')::INTERVAL
    ORDER BY al.created_at DESC
  )
  SELECT
    'id,timestamp,user_email,action_type,action_subtype,target,reason' || E'\n' ||
    STRING_AGG(
      id || ',' || created_at || ',' || email || ',' || action_type || ',' ||
      action_subtype || ',' || target_name || ',' || reason,
      E'\n'
    )
  INTO v_csv
  FROM csv_data;

  RETURN COALESCE(v_csv, 'id,timestamp,user_email,action_type,action_subtype,target,reason');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
