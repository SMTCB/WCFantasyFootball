# Supabase Handoff — Consolidated Deploy Guide

**Last updated**: 2026-05-25 (session 39)  
**Main branch**: all code is on `main` — do a `git pull origin main` before deploying  
**Migrations applied in production**: 66, 67, 68, 69, 70, 71, 72

---

## ✅ DO THIS ONCE — Deploy Everything Pending

Run the steps below in order. Each section is self-contained; you can stop and resume safely.

---

### Step 1 — SQL Migrations 73 and 74

Open the **Supabase dashboard SQL editor** and run each file in order:

**`supabase/migrations/73_pipeline_cleanup.sql`**
- Unschedules 3 duplicate EPL sync crons left by migration 63 (`sync-player-status`, `sync-players-daily`, `sync-fixtures`) — the `sync-all-active-tournaments` orchestrator from migration 51 already covers these; running both caused every Forza API call to fire twice per schedule
- Deletes any `fantasy_points` rows where `matchday_id = 'current'` (leftover seed artifact that would corrupt rollup queries)
- Adds `CHECK (matchday_id ~ '^[0-9]+-r[0-9]+$')` to enforce the canonical format (e.g. `'426-r35'`) going forward

**`supabase/migrations/74_draft_cup_fixes.sql`**
- **L6.4**: `seed_cup_clubs` now accepts `p_tournament_id TEXT DEFAULT NULL` — scopes club seeding to the league's tournament (EPL ≠ WC)
- **L6.3**: trigger `_trigger_seed_cup_clubs` auto-seeds `cup_active_clubs` when a league's `cup_phase` transitions out of `'pre_cup'`
- **L6.6**: `calculate_relaxation_state` uses `leagues.squad_size` instead of hardcoded `15.0` in the pool pressure formula

**Next migration to create**: `75_`

---

### Step 2 — Deploy All Edge Functions

From the project root (`git pull origin main` first):

```bash
# Core scoring + ingestion
supabase functions deploy calculate-scores
supabase functions deploy ingest-match-events

# Transfers + draft
supabase functions deploy process-transfer
supabase functions deploy run-draft-lottery
supabase functions deploy run-reverse-standings-draft
supabase functions deploy auto-open-transfer-window

# Data sync
supabase functions deploy sync-fixtures
supabase functions deploy sync-players
supabase functions deploy sync-player-status

# Cup + relaxation
supabase functions deploy calculate-relaxation
supabase functions deploy eliminate-cup-club

# Bet resolution (new — session 37)
supabase functions deploy resolve-bets
```

**Why each function needs to be deployed:**

| Function | Last changed | What changed |
|---|---|---|
| `calculate-scores` | Session 38 | L3.5: captain on bench → highest-scoring starter gets bonus |
| `ingest-match-events` | Session 36 | Shared `logError` from `_shared/log.ts` (was local copy) |
| `process-transfer` | Session 36 | Shared `logError`; buy/sell/create failures now written to `edge_function_errors` |
| `run-draft-lottery` | Session 39 | L5.1: two-pass allocation — dropped players offered to runner-up wanters |
| `run-reverse-standings-draft` | Session 36 | Shared `logError` |
| `auto-open-transfer-window` | Session 38 | DATA-9: idempotent upsert; `closes_at` capped at 1h before next kickoff |
| `sync-fixtures` | Session 36 | Shared `logError` |
| `sync-players` | Session 36 | Shared `logError` |
| `sync-player-status` | Session 38 | 2.4.b: suspension rows now call `mapStatus`/`mapConfidence` (dead code eliminated) |
| `calculate-relaxation` | Session 36 | Shared `logError` |
| `eliminate-cup-club` | Session 36 | Shared `logError` |
| `resolve-bets` | Session 37 | **New function**: auto-resolves `match_result` bets from fixture scores on 15-min cron |

---

### Step 3 — Verify

```bash
supabase functions list
```

All 12 functions should show a `deployed_at` timestamp from today.

To verify cron health, run this in the SQL editor:

```sql
SELECT jobname, schedule, active FROM cron.job ORDER BY jobname;
```

After migration 73, you should see `sync-player-status`, `sync-players-daily`, and `sync-fixtures` are **absent** from this list (removed). The canonical active crons are:

| Cron job | Schedule | Purpose |
|---|---|---|
| `auto-open-transfer-window` | every 2h | Opens new transfer windows after matchday completes |
| `calculate-scores-post-match` | 22:30 UTC | Scores all fixtures finished in last 24h |
| `ingest-match-events-live` | every 5 min | Ingests live events for fixtures with `status='live'` |
| `resolve-finished-bets` | every 15 min | Auto-resolves `match_result` bets from finished fixtures |
| `run-draft-lottery` | every 15 min | Runs allocation for leagues past draft deadline |
| `sync-all-active-tournaments` | every 6h | Syncs player status + players + fixtures for all `sync_enabled` tournaments |
| `sync-wc-players-6h` | 2 */6 | WC-specific player sync (until WC set to `sync_enabled=true`) |
| `sync-wc-fixtures-6h` | 4 */6 | WC-specific fixture sync |
| `prune-error-logs` | daily | Deletes edge errors >30d + client errors >14d |

---

## Sprint 1 Remaining (code not yet written)

All L5.x and L6.x items are now complete. Sprint 1 is fully coded and merged to `main`.

---

## Deployment History

| Session | Migrations applied | Notes |
|---|---|---|
| Sprint 0 | 66, 67, 68, 69 | Security hardening, ingest cron, WC key fix, rank trigger |
| Session 35 | 70 | `aggregate_league_member_points` UUID signature + reward_type filter |
| Session 36 | 71 | Observability: `client_errors` table, `report_client_error` RPC, prune cron |
| Session 37 | 72 | `resolve_bet` hardened + `resolve-finished-bets` cron |
| Session 38 | 73 (PENDING) | Cron dedup, `matchday_id` constraint, `fantasy_points` cleanup |
| **Session 39** | **74 (PENDING)** | Cup pool tournament scoping, auto-seed trigger, relaxation squad_size fix |
