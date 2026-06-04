-- Migration 132: create_late_joiner_allocation RPC
--
-- Called when a user joins a draft league AFTER the lottery has run.
-- Creates an empty draft_allocations row with unresolved_slots = draft_list_size
-- so the existing DraftRecoveryScreen can guide them through picking their squad
-- from the remaining (unallocated) player pool.

CREATE OR REPLACE FUNCTION create_late_joiner_allocation(p_league_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
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

GRANT EXECUTE ON FUNCTION create_late_joiner_allocation(uuid) TO authenticated;
