-- 309 follow-up: Supabase grants new functions to anon by default, so revoke it
-- explicitly. accept_bet_invite already returns UNAUTHENTICATED for anon; this
-- just makes the permission match the intent.
REVOKE ALL ON FUNCTION public.accept_bet_invite(uuid) FROM anon;
