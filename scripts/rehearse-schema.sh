#!/bin/bash
# Local Docker schema-rehearsal workflow.
#
# Rebuilds the local Docker Postgres public schema from supabase/schema.sql —
# a direct pg_dump of the live prod schema (refresh it first if it might be
# stale: npx supabase db dump --linked --schema public > supabase/schema.sql)
# — so the local replica is a *verified* match of prod, not an inferred one.
# See: docs/deployment/DOCKER_LOCAL_DEV.md#schema-rehearsal-workflow
#
# Earlier version of this script rebuilt the local schema by replaying every
# file in supabase/migrations/ from scratch instead. That was found (2026-08-01,
# by diffing the result against a real prod dump) to NOT reproduce prod: 75 of
# ~271 migration files fail to apply cleanly on a from-scratch replay, leaving
# 8 tables, 14 functions, and 63 RLS policies missing/mismatched versus prod.
# Root cause of at least the largest chunk: 27_auction_listings.sql declares
# a UUID FK against players.id, which has always been TEXT in both prod and
# local — yet prod's live auction_listings.player_id is TEXT and no later
# migration file ever fixes the mismatch. That means prod's actual schema and
# a clean replay of this repo's migration history have already diverged for
# reasons the migration files don't capture (most likely a manual/ad-hoc fix
# applied directly to prod at some point without ever being committed as a
# migration file) — replaying "the migration history" is not equivalent to
# "what prod looks like today," so it cannot be trusted as a rehearsal
# baseline. Building from schema.sql sidesteps that gap entirely — it's the
# same approach tests/unit/ already uses successfully (bootstrap.sql ->
# schema.sql -> seed.sql, verified to match prod).
#
# Usage:
#   npx supabase start                                    # once, if the local stack isn't already up
#   bash scripts/rehearse-schema.sh                                     # rebuild local schema from schema.sql as-is
#   bash scripts/rehearse-schema.sh path/to/new_migration.sql   # + apply ONE new migration on top, to rehearse it
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOGDIR="$REPO_ROOT/.rehearsal"
mkdir -p "$LOGDIR"
NEW_MIGRATION="${1:-}"

CONTAINER=$(docker ps --filter "name=supabase_db_" --format '{{.Names}}' | head -1)
if [ -z "$CONTAINER" ]; then
  echo "Could not find a running supabase_db_* container. Run 'npx supabase start' first."
  exit 1
fi
echo "Using container: $CONTAINER"

echo ""
echo "=== Step 1: reset public schema to empty ==="
docker exec "$CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO postgres;
GRANT ALL ON SCHEMA public TO public;
" > "$LOGDIR/reset-public.log" 2>&1

echo ""
echo "=== Step 2: load supabase/schema.sql (verified snapshot of prod) ==="
SCHEMA_LOG="$LOGDIR/schema-load.log"
docker exec -i "$CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 < "$REPO_ROOT/supabase/schema.sql" > "$SCHEMA_LOG" 2>&1
SCHEMA_RC=$?
ERR_COUNT=$(grep -c "^ERROR" "$SCHEMA_LOG" || true)
echo "schema.sql load finished (exit $SCHEMA_RC, $ERR_COUNT ERROR line(s) — see $SCHEMA_LOG)."
echo "Expected error class: managed-platform features schema.sql references but"
echo "a local Docker Postgres doesn't have (pg_net, pg_cron, http, supabase_vault,"
echo "the supabase_realtime publication). Anything else is a real problem —"
echo "read $SCHEMA_LOG before trusting this rehearsal."

if [ -n "$NEW_MIGRATION" ]; then
  echo ""
  echo "=== Step 3: apply new migration on top: $NEW_MIGRATION ==="
  NEWMIG_LOG="$LOGDIR/new-migration.log"
  if docker exec -i "$CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 < "$NEW_MIGRATION" > "$NEWMIG_LOG" 2>&1; then
    echo "Applied cleanly on top of the real prod schema — see $NEWMIG_LOG."
  else
    echo "!!! FAILED to apply $NEW_MIGRATION — see $NEWMIG_LOG"
    cat "$NEWMIG_LOG"
    exit 1
  fi
fi

echo ""
echo "=== Step 4: restore CRUD grants for anon/authenticated/service_role ==="
# schema.sql's own GRANT statements cover most of this already, but PostgREST
# needs default privileges set explicitly for objects created after the load
# (e.g. the new migration in step 3), otherwise it can return
# `42501 permission denied` — including for the service_role key that Edge
# Functions use locally.
docker exec "$CONTAINER" psql -U postgres -d postgres -c "
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres, anon, authenticated, service_role;
NOTIFY pgrst, 'reload schema';
" > "$LOGDIR/grants.log" 2>&1

echo ""
echo "=== Done ==="
echo "Local public schema rebuilt from supabase/schema.sql — a verified match of prod"
echo "(refresh schema.sql first via 'npx supabase db dump --linked --schema public'"
echo "if it might be stale; this script does not do that for you, since it's a"
echo "write-adjacent network call best kept explicit rather than automatic)."
echo "Serve an Edge Function against it with:"
echo "  npx supabase functions serve <function-name>"
