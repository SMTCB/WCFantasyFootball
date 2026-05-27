# Supabase Handoff — Consolidated Deploy Guide

**Last updated**: 2026-05-27 (session 46 — all BUG_TRACKER bugs fixed; no new migrations)  
**Main branch**: all code is on `main` — do a `git pull origin main` before deploying  
**Migrations applied in production**: 66–84 (next: `85_`)  
**Edge Functions**: ✅ ALL 14 DEPLOYED (2026-05-26 via `npx supabase functions deploy --use-api`)  
**⚠️ NO PENDING SUPABASE TASKS** — everything is deployed and up to date

---

## ✅ DO THIS ONCE — Deploy Everything Pending

Run the steps below in order. Each section is self-contained; you can stop and resume safely.

---

### ~~Step 1a — SQL Migration 78~~ ✅ DONE (2026-05-25)

**`supabase/migrations/78_dead_code_cleanup.sql`** — applied to production.
- Dropped `public.calculate_player_points` in all overload signatures (superseded by `calculate-scores` Edge Function since migration 53)

---

### ~~Step 1b — SQL Migrations 73, 74, 75, 76, 77~~ ✅ DONE (sessions 38-42)

Open the **Supabase dashboard SQL editor** and run each file in order:

**`supabase/migrations/73_pipeline_cleanup.sql`**
- Unschedules 3 duplicate EPL sync crons left by migration 63 (`sync-player-status`, `sync-players-daily`, `sync-fixtures`) — the `sync-all-active-tournaments` orchestrator from migration 51 already covers these; running both caused every Forza API call to fire twice per schedule
- Deletes any `fantasy_points` rows where `matchday_id = 'current'` (leftover seed artifact that would corrupt rollup queries)
- Adds `CHECK (matchday_id ~ '^[0-9]+-r[0-9]+$')` to enforce the canonical format (e.g. `'426-r35'`) going forward

**`supabase/migrations/74_draft_cup_fixes.sql`**
- **L6.4**: `seed_cup_clubs` now accepts `p_tournament_id TEXT DEFAULT NULL` — scopes club seeding to the league's tournament (EPL ≠ WC)
- **L6.3**: trigger `_trigger_seed_cup_clubs` auto-seeds `cup_active_clubs` when a league's `cup_phase` transitions out of `'pre_cup'`
- **L6.6**: `calculate_relaxation_state` uses `leagues.squad_size` instead of hardcoded `15.0` in the pool pressure formula

**`supabase/migrations/75_active_members_relaxation.sql`**
- Sprint 2: various relaxation + active member fixes (see migration file for details)

**`supabase/migrations/76_bet_logic_fixes.sql`**
- **L2.2**: `bet_instances` gets `winners_count INT` and `total_submissions INT` columns; `resolve_bet` populates them
- **L2.5**: `submit_bet` resets `is_correct = NULL` and `reward_awarded = NULL` on re-submit after resolution
- **L3.9**: `resolve_bet` sets `reward_awarded = NULL` (not 0) for losing submissions

**Next migration to create**: `85_`  
*(79–84 applied — see Deployment History below)*

---

### ~~Step 2 — Deploy All Edge Functions~~ ✅ DONE (2026-05-26)

All 14 functions deployed via `npx supabase functions deploy <name> --use-api`.  
`supabase/config.toml` created with explicit `.js` entrypoints for all functions (CLI defaults to `.ts`).

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
supabase functions deploy discover-tournament
supabase functions deploy test-forza-api

# Cup + relaxation
supabase functions deploy calculate-relaxation
supabase functions deploy eliminate-cup-club

# Bet resolution (new — session 37)
supabase functions deploy resolve-bets
```

**Why each function needs to be deployed:**

| Function | Last changed | What changed |
|---|---|---|
| `calculate-scores` | Session 40 | L3.6: `points_breakdown` now cumulative across fixtures per round |
| `ingest-match-events` | Session 40 | 2.5.c: `parseMinute` for added-time; 2.5.d: tournament-wide player lookup fallback |
| `sync-fixtures` | Session 40 | 2.2.b: date comparison via `new Date()`; 2.2.c: postponed/cancelled/abandoned status mapping |
| `sync-player-status` | Session 40 | DATA-15: N+1 per-player lookups replaced with single batch query |
| `discover-tournament` | Session 40 | DATA-16: concurrent batch probing; DATA-17: access_token redacted from logs |
| `test-forza-api` | Session 40 | DATA-17: access_token redacted from log output and HTTP response |
| `process-transfer` | Session 36 | Shared `logError`; buy/sell/create failures now written to `edge_function_errors` |
| `run-draft-lottery` | Session 43 | Sprint 4: `Math.max(0,…)` guard on `unresolved_slots`; removed `JSON.stringify` double-serialization for JSONB `bullets`/`full_data` columns |
| `run-reverse-standings-draft` | Session 36 | Shared `logError` |
| `auto-open-transfer-window` | Session 38 | DATA-9: idempotent upsert; `closes_at` capped at 1h before next kickoff |
| `sync-players` | Session 36 | Shared `logError` |
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

## All Sprints + E2E Fixes Complete

Sprints 0–4 and the full E2E bug-fix pass (sessions 44–45) are merged to `main`. There are no pending code or Supabase tasks. The next work is fixing the open bugs listed in `docs/BUG_TRACKER.md`.

---

## Deployment History

| Session | Migrations applied | Notes |
|---|---|---|
| Sprint 0 | 66, 67, 68, 69 | Security hardening, ingest cron, WC key fix, rank trigger |
| Session 35 | 70 | `aggregate_league_member_points` UUID signature + reward_type filter |
| Session 36 | 71 | Observability: `client_errors` table, `report_client_error` RPC, prune cron |
| Session 37 | 72 | `resolve_bet` hardened + `resolve-finished-bets` cron |
| Session 38 | 73 ✅ | Cron dedup, `matchday_id` constraint, `fantasy_points` cleanup |
| Session 39 | 74 ✅ | Cup pool tournament scoping, auto-seed trigger, relaxation squad_size fix |
| Session 40–41 | 75, 76 ✅ | Relaxation fixes; bet logic fixes (L2.2, L2.5, L3.9) |
| Session 42 | 77 ✅ | Security polish: stale auction policy, fake @admin, chat rate-limit, handle_new_user trigger |
| Session 43 | 78 ✅ | Dead code: drop `calculate_player_points` SQL function (all overloads) |
| Session 44 | 79 ✅ | `fantasy_points.total` → NUMERIC; `verify_jwt=false` on cron functions |
| Session 44–45 | 80 ✅ | `auction_bids` FK fix |
| Session 44–45 | 81 ✅ | Draft pool tournament filter |
| Session 44–45 | 82 ✅ | Public read RLS policies |
| Session 44–45 | 83 ✅ | `submit_bet` RPC fix |
| Session 44–45 | 84 ✅ | `resolve_bet` RPC fix |
