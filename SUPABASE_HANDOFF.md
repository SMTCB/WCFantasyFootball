# Supabase Handoff — Sprint 1 Deployments (Session 37)

**Date**: 2026-05-25  
**Latest branch merged**: `claude/s1-live-bets` → `main`  
**Previous migrations applied**: 66, 67, 68, 69, 70

---

## Session 37 — What to Deploy Now (NEW)

### 1. SQL Migration (run in Supabase dashboard SQL editor)

```sql
-- File: supabase/migrations/72_bet_resolution.sql
-- Paste and run this file's contents in the Supabase SQL editor
```

**What migration 72 does:**
- Replaces `resolve_bet` function with hardened version: validates `p_correct_answer` against declared options before marking submissions; returns `{ winners, total }` instead of misleading `submissions_updated`
- Schedules `resolve-finished-bets` cron (every 15 min): invokes `resolve-bets` edge function to auto-resolve closed `match_result` bets from `fixtures.home_score/away_score`

### 2. New Edge Function to Deploy

```bash
supabase functions deploy resolve-bets
```

**What `resolve-bets` does:** Queries all `status='closed'` bet_instances where `resolves_at < NOW()`, looks up fixture result for `match_result` type bets, calls `resolve_bet` RPC. Runs hands-free every 15 min via cron.

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
