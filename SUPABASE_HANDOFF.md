# Supabase Handoff — Sprint 1 Deployments (Session 35)

**Date**: 2026-05-24  
**Branch merged**: `claude/sprint-1-scoring-math-transfer-fixes` → `main` (PR #171)  
**Previous migrations applied**: 66, 67, 68, 69

---

## Sprint 1 — What to Deploy Now

### 1. SQL Migration (run in Supabase dashboard SQL editor)

```sql
-- File: supabase/migrations/70_scoring_fixes.sql
-- Paste and run this file's contents in the Supabase SQL editor
```

**What migration 70 does:**
- Drops the old `aggregate_league_member_points(UUID, TEXT)` overload (wrong signature — broke season standings)
- Creates `aggregate_league_member_points(UUID, UUID)` with correct join path through `squads` (since `bet_submissions` has no `user_id` column)
- Filters reward rows by `reward_type = 'points'` only

### 2. Edge Functions to Redeploy

```bash
# From the project root, after git pull origin main:
supabase functions deploy calculate-scores
supabase functions deploy ingest-match-events
supabase functions deploy process-transfer
```

**What changed in each:**

| Function | Change |
|----------|--------|
| `calculate-scores` | L1.2: GK conceded FPL-style (floor(n/2)); L1.3: `??` + NaN guard; L1.4: wildcard 1.1× once after loop; L1.5: joker doubling; L1.6: both 'sub'/'sub_off'; L1.8: mins≥60 for clean sheet; L3.4/DATA-6: hard-fail if round_number missing |
| `ingest-match-events` | L1.7: penalty_missed typeMap fix (was stored as 'goal') |
| `process-transfer` | DATA-4/5: deadline + squad scoped to league's tournament_id; new squads use real matchday_id not 'current' |

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

**Next migration**: `71_`
