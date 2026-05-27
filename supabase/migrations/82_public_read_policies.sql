-- BUG-07/08/10: Squad/Recap/Draft screens blank in demo mode — RLS blocks anon reads
-- BUG-11: Admin panel "Tournament not found" — RLS blocks anon reads on tournaments
--
-- Tournament data is public metadata. Squad and draft_submission data within a league
-- is competitive but not sensitive — all managers can see each other's squads (standings).
-- Adding public SELECT policies so the app functions in demo mode (no session / anon key).
-- Write operations (INSERT/UPDATE/DELETE) remain protected by existing policies.

-- tournaments: fully public reference data
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='tournaments' AND policyname='tournaments_public_read'
  ) THEN
    CREATE POLICY "tournaments_public_read" ON public.tournaments
      FOR SELECT USING (true);
  END IF;
END $$;

-- squads: public read (league standings, manager squad display)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='squads' AND policyname='squads_public_read'
  ) THEN
    CREATE POLICY "squads_public_read" ON public.squads
      FOR SELECT USING (true);
  END IF;
END $$;

-- draft_submissions: public read (processed submissions are visible post-lottery)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='draft_submissions' AND policyname='draft_submissions_public_read'
  ) THEN
    CREATE POLICY "draft_submissions_public_read" ON public.draft_submissions
      FOR SELECT USING (true);
  END IF;
END $$;
