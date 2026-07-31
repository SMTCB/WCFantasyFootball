-- Migration 247: lock down award_trophy() to service_role only
--
-- Postgres grants EXECUTE on new functions to PUBLIC by default unless
-- explicitly revoked. Migration 246 granted award_trophy() to service_role
-- but didn't revoke the default PUBLIC grant, which authenticated/anon
-- inherit through — verified live: has_function_privilege('authenticated',
-- 'award_trophy(...)', 'EXECUTE') returned true immediately after 246 ran.
--
-- award_trophy is SECURITY DEFINER and takes p_user_id/p_trophy_type/p_tier/
-- p_meta as plain parameters with no internal ownership check (by design —
-- it's an internal helper meant to be called only from trusted service-role
-- scoring code, matching the _log_squad_event pattern in migration 183).
-- Left open, any authenticated user could call it directly and forge
-- themselves (or anyone) trophies in any circle, corrupting
-- get_circle_meta_standings() for every member. Explicit lockout closes
-- that gap, matching the execute_transfer_atomic precedent (migration 183).

BEGIN;

REVOKE EXECUTE ON FUNCTION award_trophy(uuid, uuid, uuid, uuid, uuid, text, text, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION award_trophy(uuid, uuid, uuid, uuid, uuid, text, text, jsonb) FROM authenticated;
REVOKE EXECUTE ON FUNCTION award_trophy(uuid, uuid, uuid, uuid, uuid, text, text, jsonb) FROM anon;

COMMIT;
