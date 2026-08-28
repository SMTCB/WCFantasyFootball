-- Migration 260: fix infinite recursion in paddock_members / player_box_members RLS policies
--
-- Bug found during Tier 3 F1/tennis e2e coverage pass: joining a paddock by
-- invite code (PaddockLobbyScreen) and joining a player box by invite code
-- (PlayerBoxScreen) both fail with Postgres error 42P17 "infinite recursion
-- detected in policy for relation paddock_members" / "player_box_members" on
-- every query that touches those tables.
--
-- Root cause: same bug class as migration 230 (circle_members), never applied
-- to F1/tennis's own membership tables when they were added afterwards.
--
--   paddock_members_member_read (migration 191) subqueries paddock_members
--   from within its own USING clause:
--     EXISTS (SELECT 1 FROM paddock_members pm WHERE pm.paddock_id = paddock_members.paddock_id
--             AND pm.user_id = auth.uid())
--   player_box_members_select (migration 197) does the same via an IN subquery:
--     player_box_id IN (SELECT player_box_id FROM player_box_members WHERE user_id = auth.uid())
--
-- Evaluating either subquery re-applies the same RLS policy on the same
-- table, which recurses forever. paddocks_member_read also subqueries
-- paddock_members, so it inherits the same failure the moment
-- paddock_members' own policy is broken.
--
-- Fix: identical pattern to migration 230's is_circle_member() — a
-- SECURITY DEFINER function that runs as table owner and therefore bypasses
-- RLS on the underlying table, avoiding the self-reference. Add
-- is_paddock_member() / is_player_box_member() and repoint the affected
-- policies at them. FULLY ADDITIVE/CORRECTIVE: no schema changes, no data
-- changes.

CREATE OR REPLACE FUNCTION public.is_paddock_member(p_paddock_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.paddock_members
    WHERE paddock_id = p_paddock_id
      AND user_id    = auth.uid()
  );
$$;

DROP POLICY IF EXISTS paddock_members_member_read ON public.paddock_members;
CREATE POLICY paddock_members_member_read ON public.paddock_members
  FOR SELECT
  USING (public.is_paddock_member(paddock_id));

DROP POLICY IF EXISTS paddocks_member_read ON public.paddocks;
CREATE POLICY paddocks_member_read ON public.paddocks
  FOR SELECT
  USING (public.is_paddock_member(id));

CREATE OR REPLACE FUNCTION public.is_player_box_member(p_player_box_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.player_box_members
    WHERE player_box_id = p_player_box_id
      AND user_id        = auth.uid()
  );
$$;

DROP POLICY IF EXISTS player_box_members_select ON public.player_box_members;
CREATE POLICY player_box_members_select ON public.player_box_members
  FOR SELECT TO authenticated
  USING (public.is_player_box_member(player_box_id));
