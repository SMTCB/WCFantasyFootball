-- Migration 282: Drop stale 4-arg update_circle_settings overload
-- Migration 281 added a p_archived param to update_circle_settings via
-- CREATE OR REPLACE FUNCTION, but Postgres treats a changed parameter list as
-- a new function identity — it left the original 4-arg version (from migration
-- 195) in place as a second overload instead of replacing it. Two overloads
-- makes RPC calls ambiguous to PostgREST, so drop the stale one, keeping only
-- the 5-arg version that supports archiving.
-- FULLY ADDITIVE in effect (removes dead code, not live data): the 4-arg
-- overload was never callable correctly once the 5-arg version shipped.

BEGIN;

DROP FUNCTION IF EXISTS update_circle_settings(uuid, text, boolean, boolean);

COMMIT;
