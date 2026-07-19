-- Migration 230: fix infinite recursion in circle_members RLS policy
--
-- Bug found during v2 cutover dry-run (Clubhouse Chat UI pass): opening
-- CLUBHOUSE -> CHAT -> CHANNELS on a freshly created Clubhouse fails with
-- Postgres error 42P17 "infinite recursion detected in policy for relation
-- circle_members" on every query that touches circles / circle_members /
-- clubhouse_channels (reproduced live: GET .../clubhouse_channels?circle_id=eq...
-- -> 500).
--
-- Root cause: circle_members_member_read (SELECT policy on circle_members)
-- subqueries circle_members from within its own USING clause:
--   EXISTS (SELECT 1 FROM circle_members cm WHERE cm.circle_id = circle_members.circle_id
--           AND cm.user_id = auth.uid())
-- Evaluating that subquery re-applies the same RLS policy on circle_members,
-- which recurses forever. circles_member_read and ch_channels_member_read
-- both subquery circle_members too, so they inherit the same failure the
-- moment circle_members' own policy is broken -- this breaks reads on all
-- three tables, not just circle_members.
--
-- Fix: same pattern already used for leagues (is_league_member, SECURITY
-- DEFINER function that runs as table owner and therefore bypasses RLS on
-- the underlying table, avoiding the self-reference). Add is_circle_member()
-- and repoint all three affected policies at it. FULLY ADDITIVE/CORRECTIVE:
-- no schema changes, no data changes.

CREATE OR REPLACE FUNCTION public.is_circle_member(p_circle_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.circle_members
    WHERE circle_id = p_circle_id
      AND user_id   = auth.uid()
  );
$$;

DROP POLICY IF EXISTS circle_members_member_read ON public.circle_members;
CREATE POLICY circle_members_member_read ON public.circle_members
  FOR SELECT
  USING (public.is_circle_member(circle_id));

DROP POLICY IF EXISTS circles_member_read ON public.circles;
CREATE POLICY circles_member_read ON public.circles
  FOR SELECT
  USING (public.is_circle_member(id));

DROP POLICY IF EXISTS ch_channels_member_read ON public.clubhouse_channels;
CREATE POLICY ch_channels_member_read ON public.clubhouse_channels
  FOR SELECT
  USING (public.is_circle_member(circle_id));
