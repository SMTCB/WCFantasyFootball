#!/bin/bash
# Local Docker schema-rehearsal workflow.
#
# Rehearses the full supabase/migrations/ set against a local Docker Postgres
# replica (via `supabase start`), so schema/migration changes can be verified
# before touching the live pilot DB. See:
#   docs/deployment/DOCKER_LOCAL_DEV.md#schema-rehearsal-workflow
#
# Usage:
#   npx supabase start          # once, if the local stack isn't already up
#   bash scripts/rehearse-schema.sh
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIGDIR="$REPO_ROOT/supabase/migrations"
LOGDIR="$REPO_ROOT/.rehearsal"
mkdir -p "$LOGDIR"

echo "=== Step 1: npx supabase db reset (applies migrations via the CLI) ==="
RESET_LOG="$LOGDIR/db-reset.log"
if npx supabase db reset 2>&1 | tee "$RESET_LOG"; then
  echo ""
  echo "db reset succeeded cleanly — schema is fully rehearsed, no fallback needed."
  exit 0
fi

echo ""
echo "!!! db reset failed partway. Falling back to a continue-on-error replay."
echo "Known issue in this repo: migration filenames sort lexicographically, so"
echo "e.g. 100_x.sql sorts before 90_y.sql. 'db reset' aborts the whole run on"
echo "the first failing file even when a LATER migration (in numeric terms)"
echo "fixes that exact bug. The fallback below keeps applying every remaining"
echo "file and reports which ones genuinely failed, so you can spot-check them"
echo "instead of losing the whole rehearsal to one ordering artifact."

FAILED_FILE=$(grep -oE '[0-9]+_[a-zA-Z0-9_]+\.sql' "$RESET_LOG" | tail -1)
if [ -z "$FAILED_FILE" ]; then
  echo "Could not detect the failing migration filename from db reset output."
  echo "Check $RESET_LOG manually, then re-run this script after editing"
  echo "FAILED_FILE below to the correct starting point."
  exit 1
fi
echo "Detected first failure at: $FAILED_FILE"

CONTAINER=$(docker ps --filter "name=supabase_db_" --format '{{.Names}}' | head -1)
if [ -z "$CONTAINER" ]; then
  echo "Could not find a running supabase_db_* container. Is 'supabase start' running?"
  exit 1
fi
echo "Using container: $CONTAINER"

echo ""
echo "=== Step 2: continue-on-error replay from $FAILED_FILE onward ==="
REPLAY_LOG="$LOGDIR/replay.log"
> "$REPLAY_LOG"
> "$REPLAY_LOG.failures"
apply=false
while IFS= read -r f; do
  [ "$f" = "$FAILED_FILE" ] && apply=true
  [ "$apply" = false ] && continue
  echo "--- $f ---" | tee -a "$REPLAY_LOG"
  OUT=$(docker exec -i "$CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 < "$MIGDIR/$f" 2>&1)
  RC=$?
  echo "$OUT" >> "$REPLAY_LOG"
  if [ $RC -ne 0 ]; then
    echo "FAILED: $f" | tee -a "$REPLAY_LOG"
    echo "$f" >> "$REPLAY_LOG.failures"
  fi
done < <(ls "$MIGDIR" | sort)

FAIL_COUNT=0
[ -f "$REPLAY_LOG.failures" ] && FAIL_COUNT=$(wc -l < "$REPLAY_LOG.failures")
echo ""
echo "Replay complete: $FAIL_COUNT file(s) failed (see $REPLAY_LOG.failures)."
echo "Spot-check each listed failure manually before trusting the rehearsed"
echo "schema for your task — most are ordering artifacts (a later-numbered"
echo "fix ran before the migration it was meant to fix, so it found nothing"
echo "to do) or expected-empty-local-DB conditions, but confirm rather than"
echo "assume, especially for any failure touching the table(s) you're testing."

echo ""
echo "=== Step 3: restore CRUD grants for anon/authenticated/service_role ==="
# The CLI's normal `db reset` flow re-applies these after migrations; the raw
# psql replay above bypasses that step, so every table touched by the replay
# ends up with only TRUNCATE/REFERENCES/TRIGGER/MAINTAIN for these roles
# (SELECT/INSERT/UPDATE/DELETE missing). PostgREST then returns
# `42501 permission denied` on any of those tables, including via the
# service_role key that Edge Functions use locally.
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
echo "Local schema rehearsed. $FAIL_COUNT migration(s) need manual review — see $REPLAY_LOG.failures."
echo "Serve an Edge Function against it with:"
echo "  npx supabase functions serve <function-name>"
