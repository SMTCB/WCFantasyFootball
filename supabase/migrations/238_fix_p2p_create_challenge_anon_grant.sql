-- Fix over-broad grant left by migration 237.
--
-- 237's REVOKE ALL ... FROM PUBLIC only revokes the PUBLIC pseudo-role. It does not
-- touch the direct per-role grants Supabase's public-schema default privileges apply
-- to anon/authenticated/service_role at CREATE FUNCTION time. Every prior P2P migration
-- (204, 205, 207) explicitly revoked "FROM public, authenticated, anon" before
-- re-granting to authenticated only -- 237 dropped the ", authenticated, anon" part,
-- leaving anon (unauthenticated) with live EXECUTE on both new function signatures.
-- Confirmed via has_function_privilege('anon', ..., 'EXECUTE') = true immediately after
-- 237 was applied. No rows were affected in the window between 237 and this fix (no new
-- p2p_challenges since 237 landed), but this closes the hole immediately.

REVOKE ALL ON FUNCTION public.create_p2p_challenge(uuid, uuid, text, integer, text, uuid, text, text) FROM public, authenticated, anon;
GRANT  EXECUTE ON FUNCTION public.create_p2p_challenge(uuid, uuid, text, integer, text, uuid, text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.get_my_challenges(uuid) FROM public, authenticated, anon;
GRANT  EXECUTE ON FUNCTION public.get_my_challenges(uuid) TO authenticated;
