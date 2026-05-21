-- Migration 16: Fix bet_submissions FK + remove dead trigger
--
-- Problem 1: bet_submissions.user_id references auth.users(id), which excludes
--   seeded/mock users (TacticsTom, GoalMachine, Zidane_99 etc.) that live in
--   public.users but not auth.users. These users appear in league standings but
--   can never submit a bet pick, causing silent FK violations.
--   Fix: re-point the FK to public.users(id) — the canonical user table.
--
-- Problem 2: The trigger bet_submissions_reward_update calls
--   trigger_bet_reward_update(), which runs PERFORM aggregate_league_member_points()
--   but discards the result without updating league_members.total_points.
--   The real points update is handled by the separate bet_resolution_update_points
--   trigger (calls trigger_update_league_member_points()). The second trigger is
--   a no-op that fires a full aggregate calculation and throws it away on every
--   bet resolution. Fix: drop the dead trigger and its orphan function.

-- ── Fix 1: FK from auth.users → public.users ─────────────────────────────────

ALTER TABLE public.bet_submissions
  DROP CONSTRAINT IF EXISTS bet_submissions_user_id_fkey;

ALTER TABLE public.bet_submissions
  ADD CONSTRAINT bet_submissions_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

-- ── Fix 2: Drop dead trigger and orphan function ──────────────────────────────

DROP TRIGGER IF EXISTS bet_submissions_reward_update ON public.bet_submissions;

DROP FUNCTION IF EXISTS public.trigger_bet_reward_update();
