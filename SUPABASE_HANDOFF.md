# Supabase Handoff — Sprint 1 Deployments (Session 38)

**Date**: 2026-05-25  
**Latest branch**: `claude/s1-pipe` (pending merge)  
**Migrations applied**: 66, 67, 68, 69, 70, 71, 72 ✅ ALL APPLIED  
**Next to apply**: 73

---

## Session 38 — PENDING DEPLOY

### Migration 73 — pending ⏳
```sql
-- File: supabase/migrations/73_pipeline_cleanup.sql
-- Paste and run in the Supabase SQL editor
```
**What it does:**
- Unschedules duplicate EPL sync crons from migration 63 (`sync-player-status`, `sync-players-daily`, `sync-fixtures`) — the `sync-all-active-tournaments` orchestrator (migration 51) already handles these
- Deletes `fantasy_points` rows where `matchday_id = 'current'` (seed artifact)
- Adds `CHECK (matchday_id ~ '^[0-9]+-r[0-9]+$')` constraint to `fantasy_points`

### Edge Functions to deploy (session 38)

```bash
# Updated in session 38:
supabase functions deploy calculate-scores        # L3.5: captain-on-bench fallback
supabase functions deploy sync-player-status      # 2.4.b: _type='suspension' fix
supabase functions deploy auto-open-transfer-window  # DATA-9: idempotent + correct closes_at

# Still pending from sessions 36-37:
supabase functions deploy ingest-match-events
supabase functions deploy process-transfer
supabase functions deploy run-draft-lottery
supabase functions deploy run-reverse-standings-draft
supabase functions deploy sync-fixtures
supabase functions deploy sync-players
supabase functions deploy calculate-relaxation
supabase functions deploy eliminate-cup-club
supabase functions deploy resolve-bets
```

---

## Session 37 — ✅ DEPLOYED

### Migration 71 — applied ✅
- `client_errors` table + `report_client_error` RPC + `prune-error-logs` cron

### Migration 72 — applied ✅
- `resolve_bet` hardened (options validation + `{winners, total}` return)
- `resolve-finished-bets` cron every 15 min

---

## Session 36 — What to Deploy Now (NEW)

### 1. SQL Migration (run in Supabase dashboard SQL editor)

```sql
-- File: supabase/migrations/71_observability.sql
-- Paste and run this file's contents in the Supabase SQL editor
```

**What migration 71 does:**
- Creates `client_errors` table (RLS enabled, no client SELECT, indexed by time/url)
- Creates `report_client_error` SECURITY DEFINER function — anon/authenticated can call it without bypassing RLS
- Schedules `prune-error-logs` cron: deletes edge_function_errors older than 30d and client_errors older than 14d

### 2. Edge Functions to Redeploy (ALL 11)

```bash
# From the project root, after git pull origin main:
supabase functions deploy calculate-scores
supabase functions deploy ingest-match-events
supabase functions deploy process-transfer
supabase functions deploy run-draft-lottery
supabase functions deploy run-reverse-standings-draft
supabase functions deploy sync-fixtures
supabase functions deploy sync-players
supabase functions deploy sync-player-status
supabase functions deploy calculate-relaxation
supabase functions deploy eliminate-cup-club
supabase functions deploy auto-open-transfer-window
```

**What changed:** All 11 functions now import `logError` from `_shared/log.ts` (O1/O2). Previously `calculate-scores` and `ingest-match-events` had local copies; now all functions share the same helper. Critical catch-blocks in `process-transfer`, `run-draft-lottery`, and the sync functions now write to `edge_function_errors`.

---

## Session 35 — Still Pending (if not done yet)

### SQL Migration 70

```sql
-- File: supabase/migrations/70_scoring_fixes.sql
```

**What migration 70 does:**
- Fixes `aggregate_league_member_points` signature (UUID, UUID) + correct join path
- Filters reward rows by `reward_type = 'points'`

### Edge Functions from Session 35

```bash
supabase functions deploy calculate-scores
supabase functions deploy ingest-match-events
supabase functions deploy process-transfer
```

---

## Previous Sprint 0 Deployments (already done)

**Branch merged**: `claude/sprint-0-release-blockers` → `main`  
**SQL migrations applied**: `66_security_hardening.sql`, `67_ingest_events_cron.sql`, `68_wc_cron_key_fix.sql`, `69_rank_trigger.sql`

### Functions deployed in Sprint 0

```bash
supabase functions deploy run-draft-lottery
supabase functions deploy run-reverse-standings-draft
supabase functions deploy eliminate-cup-club
supabase functions deploy process-transfer
supabase functions deploy sync-players
```

### What Changed in Sprint 0 Functions

| Function | Change | Why |
|----------|--------|-----|
| `run-draft-lottery` | Added `relaxation_state` upsert after each draft round | Keeps pool pressure current so transfer enforcement works |
| `run-reverse-standings-draft` | Same — upserts `relaxation_state` on round completion | Same reason |
| `eliminate-cup-club` | Added safe squad query (only real columns) | Previous version referenced non-existent `formation` column |
| `process-transfer` | Fixed no-repeat check: reads `relaxation_state.current_repeats_allowed` | Previously blocked all transfers if any squad held the player |
| `sync-players` | Fixed cron — ingest now fires per-fixture after match completion | Was incorrectly scheduled |

---

## Verify Deployment

After deploying, confirm functions are live:

```bash
supabase functions list
```

Expected: all deployed functions show a recent `deployed_at` timestamp (today's date).

---

## Remaining Sprint 1 Items (not yet deployed)

See `SPRINT_PLAN_2026-05-24.md` for full detail. Key open items:

- **L2.1**: `resolve_bet` validates `p_correct_answer` against options
- **L2.4**: Auto-resolver edge function + cron
- **U3**: `/join?code=` route handler
- **U6**: LiveScreen Realtime subscription (replaces 5-min poll)
- **U7**: Joker chip UI (scoring done; UI wiring needed)
- **U8**: Trade proposals — hide or wire to DB
- **U13**: RecapScreen captain math (×2 display)
- **U30**: Realtime standings handles INSERT (new members invisible)
- **O1-O5**: Observability (logError helper, client_errors table, admin view)

**Next migration**: `73_`
