BEGIN;

-- f1_seasons was created in migration 248 without RLS enabled, leaving it the
-- only table in the public schema writable by the anon key with no restriction
-- (confirmed empirically pre-pilot DD, 2026-08-01 — see BACKLOG.md DD-P0-1).
-- Mirror f1_races' existing policy shape (migration 191): public read,
-- admin-only write.
ALTER TABLE f1_seasons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "f1_seasons_public_read" ON f1_seasons FOR SELECT USING (true);
CREATE POLICY "f1_seasons_admin_write" ON f1_seasons FOR ALL
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true));

COMMIT;
