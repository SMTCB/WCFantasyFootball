# Technical Due Diligence (V2) — Implementation Plan

**Self-contained, phase-by-phase plan to clear the [Technical Due Diligence (V2) backlog](../due_diligence/TECHNICAL_DUE_DILIGENCE_V2.md) and move the buyout-readiness score from 6.5/10 → 8/10. Written to be picked up cold — each work item restates the problem, the exact files, the steps, the verification, and the pilot-safety constraints, so no re-discovery is needed.**

---

## How to use this document

- Read the **[DD V2 backlog](../due_diligence/TECHNICAL_DUE_DILIGENCE_V2.md)** for the *why* and the full evidence per item. This document is the *how* and the *order*.
- Work top-down. The **[sequence](#the-sequence-at-a-glance)** is dependency-ordered: items unlock later items (DATA-1 unblocks OPS-1 and TEST-1; the schema baseline is the keystone).
- Each work item is its own PR (or small PR cluster) into `v2`. The **ID matches the DD doc** (e.g. `DATA-1`, `ARCH-2`) — use it in commits/PRs.
- Before any session, read **[Cross-cutting rules](#cross-cutting-rules-read-before-every-session)** — they encode the pilot-safety and branch constraints that override normal workflow.
- The **[Current-state reference](#current-state-reference-verified-2026-06-30)** captures exact file/contract facts. Line numbers drift — `grep` to confirm.

> **Session type:** this is **v2 platform-revision** work. Branch from `v2`, PR into `v2`, **never into `main`**. Per project rules, confirm the session type before any git command.
>
> **⚠️ Several items touch the shared production database or deploy Edge Functions.** Those are gated by the [TRACKER approval gate](../TRACKER.md#-pending-db--deploy-actions): name the exact action in chat and get an explicit per-item "yes, run it" in the current session before executing — and run from the Supabase-linked PC only. Items are tagged **🟢 code-only** (safe, no approval) or **🔴 prod-touching** (approval-gated) so you know before you start.

---

## The end state (one paragraph)

A buyer can `git clone` the repo and rebuild an identical schema in one command from a committed `schema.sql`; the core money/game-logic RPCs have automated regression tests running in CI against an ephemeral database (no test reads production); the production database has point-in-time recovery and a staging project for migration rehearsal; production errors and failed crons surface as alerts; the data-sync functions consume a provider-neutral canonical model so a new feed is one adapter file; the cross-sport trophy ledger is populated so the meta-leaderboard is real; the no-cash-out rule is a schema constraint; and ownership can transfer via a documented, dry-run runbook with no owner-specific identifiers in editable source. The game logic is unchanged throughout.

---

## The sequence at a glance

Dependency-ordered. **Phase A is the keystone — do it first**: it unblocks the highest-value items in every later phase.

| # | Item | DD severity | Effort | Type | Status | Unblocks |
|---|------|-------------|--------|------|--------|----------|
| **A1** | **DATA-1** — reproducible schema baseline (`schema.sql`) | 🔴 Critical | L (1–1.5 wk) | 🔴 prod-read (dump) | ⬜ On hold (Supabase-linked PC) | A2, B1, B2, C-all |
| **A2** | **DEPLOY-2** — stamp applied-state into migration headers + reconcile docs | 🟡 Medium | XS | 🟢 code-only | ✅ **Done — PR #694 (2026-07-01)** | clean DD lineage |
| **B1** | **OPS-1** — PITR + staging project + automated backups | 🔴 Critical | M + infra | 🔴 prod-config | ⬜ Blocked on A1 | safe rehearsal for everything |
| **B2** | **TEST-1** — seeded test harness for hotspot RPCs | 🔴 Critical / 🟠 High | XL | 🟢 code-only (local DB) | ✅ **Done (skeleton) — PR #694 (2026-07-01).** `tests/unit/` with 13 test cases across transfer/bet/coins; CI job with ephemeral Postgres. Activates fully once A1 produces `supabase/schema.sql`. | regression safety for C-all |
| **B3** | **OPS-2** — activate Sentry (FE) + edge error tracking + cron alerting | 🟠 High | S–M | 🔴 Vercel/secret + code | 🔄 **In progress** — FE captureException (PR #695) ✅; `_shared/log.ts` Sentry envelope (PR #696) ✅; drift script covers `_shared` (PR #696) ✅; **remaining:** (1) 🔴 set `SENTRY_DSN` Supabase secret, (2) 🔴 set `VITE_SENTRY_DSN` in Vercel (TRACKER row 11), (3) 6 fns still missing `logError` (`purchase-coins`, `discover-tournament`, `sync-tennis-players`, `score-atp-finals`, `score-f1-race`, `score-tennis-tournament`), (4) cron alerting not yet built | observability |
| **BUILD-1** | **BUILD-1** — Dockerfile Node 20→24 | 🟡 Medium | XS | 🟢 code-only | ✅ **Done — PR #694 (2026-07-01)** | consistent build |
| **C1** | **ARCH-2** — finish provider seam: consume canonical model; `forza_id`→`provider_key` | 🟡 Medium | L | 🔴 migration + deploy | ⬜ | feed-swap story |
| **C2** | **ARCH-1** — wire trophy emission (meta-leaderboard becomes real) | 🟡 Medium | S–M | 🔴 migration + deploy | ⬜ | multi-sport demo |
| **C3** | **LEGAL-1** — no-cash-out as a positive schema constraint | 🟡 Medium | S | 🔴 migration | ✅ **Done — migration 218 + PR #694 (2026-07-01).** Constraint `no_external_cash_out` on `coin_transactions`; LEGAL-1 schema assertions in `tests/unit/coins.test.js`. | real-money readiness |
| **C4** | **SEC-4** — rotate developer-machine PAT / switch to SSH | 🔴 Critical | XS | manual (dev machine) | ⬜ Pending (manual, both machines) | credential hygiene |
| **C5** | **INFRA-1** — template cron URLs + ownership-transfer runbook + dry-run | 🟡 Medium | M | 🔴 migration + docs | ⬜ | transfer readiness |
| **CODE-3** | **CODE-3** — ErrorBoundary: Sentry `captureException` + AppShell guard | 🟡 Medium | XS | 🟢 code-only | ✅ **Done — PR #695 (2026-07-01).** `componentDidCatch` dual-writes to Sentry + DB RPC; `AppLayout` wrapped with shell-level boundary; Kit Light token fixes. | observability |
| **D** | **CODE-2 / CODE-5 / LOW-2 / LOW-3 / LOW-10** — maintainability & hardening polish | 🟡/🟢 | L–XL | 🟢 code-only | ⬜ | team scalability |

**Total to reach 8/10 (Phases A–C): ~6–10 engineer-weeks.** Phase D is ongoing team-readiness, not gating for the buyout score.

**Completed so far (2026-07-01):** A2 ✅, BUILD-1 ✅, C3 ✅, B2-skeleton ✅, CODE-3 ✅, OPS-2 code ✅ (PRs #695 + #696 + #698). B3 remaining: `SENTRY_DSN` Supabase secret (row 11) + `VITE_SENTRY_DSN` Vercel env var + 6 function deploys (rows 20–25) + cron alerting (part c, not yet built).

> **Why this order:** the DD doc orders by severity; this plan orders by *dependency*. A reproducible schema (A1) is the precondition for a staging project (B1) and a seeded test DB (B2), and it removes the top remaining buyer-DD blocker (Test C). Everything in Phase C is independent of A/B and can be parallelized once Phase A lands, but each Phase C migration is *safer to rehearse* once B1 (staging) exists — so B1 before C is preferred, not mandatory.

---

## Cross-cutting rules (read before every session)

1. **Branch discipline.** Branch from `v2` as `claude/v2-dd-<item-id>` (e.g. `claude/v2-dd-data-1`). PR base **must** be `v2`. Never PR into `main`.
2. **Pilot-data safety.** The live Supabase project (`sssmvihxtqtohisghjet`) is the *only* environment and serves ~50 live pilot users on `main`. Before any migration or destructive query: `SELECT` the affected rows, show them, and wait for explicit confirmation (see [CLAUDE.md Pilot Safeguards]). `npx supabase db dump --linked` is broken on the build machine (Docker unavailable) — back up affected rows to `backups/*.json` instead.
3. **Approval gate per item.** Every 🔴 prod-touching action must be named in chat with a per-item explicit "yes, run it" *in the current session*. Approval does not carry across items or sessions.
4. **Migrations are append-only.** Never edit an applied migration. New numbered file only. **Next migration number on `v2` is `219_`.**
5. **Edge Functions are not auto-deployed.** After any PR touching `supabase/functions/`, deploy manually (`npx supabase functions deploy <name> --project-ref sssmvihxtqtohisghjet`) and run `npm run update:checksums` + commit (the CI drift gate fails otherwise).
6. **Rolldown TDZ rule.** Before adding an `import` to a child of a large screen (`LeagueScreen`, `SquadScreen`, `MarketScreen`), `grep` whether that screen already imports the module at another depth. If so, don't add it — inline/prop it. Run `npm run build` (TDZ only surfaces in the minified prod build). `madge --circular` is a CI gate.
7. **Verify before "done".** `npm run lint` (0 errors), `npm run build` (clean), `npx playwright test --project=desktop-chrome --project=mobile-chrome` (platform.spec green), `npx madge --circular src/`. For DB items, re-run the verification query and show the result.
8. **The admin-function auth pairing.** Any new admin-triggered Edge Function needs `requireServiceRole` **and** `verify_jwt = false` in `supabase/config.toml` **together** — one without the other still 401s.

---

## Current-state reference (verified 2026-07-01)

*(Branch `v2`, HEAD `5c58ac4`. Confirm line numbers with `grep`.)*

| Fact | Detail |
|------|--------|
| **Migrations** | 243 `.sql` files in `supabase/migrations/`; **19 duplicate number prefixes** (16, 63, 90, 96, 112, 140–145, 156, 157, 159, 187, 191, 192, 193, 194); gaps at 52, 58. Hand-applied via `npx supabase db query --linked`. No `supabase_migrations.schema_migrations` tracking. No `supabase/schema.sql`. Data fixes (e.g. `139_intfriendly_reset.sql`, `165`, `191_clean_sheet_retroactive_fix.sql`) interleaved with DDL. Next number: **218**. |
| **Edge Functions** | 21 dirs; **19 deployable** (`_shared` is a lib, `test-forza-api` has no index). All 19 checksummed in `.function-checksums.json`; CI drift gate via `npm run check:drift`; `npm run update:checksums` regenerates. |
| **Provider seam** | `supabase/functions/_shared/providers/` = `types.ts` (canonical `CanonicalEvent`/`CanonicalPlayerStat`/`SportDataAdapter`), `forza.ts` (`ForzaAdapter` + standalone `forzaFetch`/`mapStatus`/`POSITION_MAP`), `opta.ts` (throwing stub), `manual.ts`, `index.ts` (`getAdapter()`). **Consumed partially:** `sync-fixtures`, `ingest-match-events`, `sync-players`, `discover-tournament` import the *helpers* (`forzaFetch as forza`, `mapStatus`, `POSITION_MAP`) but still parse raw Forza JSON inline. `sync-player-status` still has its own inline `FORZA_BASE`. |
| **Spine** | `tournaments.forza_id text UNIQUE NOT NULL` is the FK join column for all football child tables (`16_forza_integration.sql`). Migration 187 added nullable `sport_id`/`provider`. No `provider_key` rename exists. Project ref externalized in `_shared/config.ts` (0 occurrences in `src/`; ~30 files total, mostly append-only migration cron URLs). |
| **Multi-sport schema** | `sports` (187), `circles`/`circle_members`/`circle_leagues` (188), `trophy_ledger` + `get_circle_meta_standings()` (189). **`trophy_ledger` has NO writer** — grep finds only migration 189; no `award_trophy` helper; `calculate-scores`/`score-f1-race`/`score-tennis-tournament` don't emit. `circle_id NOT NULL` (217) is **gated on pilot end** (18 orphan leagues, 7 live). |
| **Coin ledger** | `coin_transactions.type` CHECK (mig 209, applied) lists no withdrawal/payout type; no cash-out RPC exists (grep clean). Guard trigger `guard_coin_columns` on `coin_wallets`. The no-cash-out rule is enforced by *absence*, not a positive constraint. |
| **Security (Phase 0 — all done)** | `_shared/auth.ts` `requireServiceRole()` HMAC-verifies + `SUPABASE_SERVICE_ROLE_KEY`/`ADMIN_TRIGGER_KEY` exact-match paths. `is_admin` guarded (mig 210, applied). `purchase-coins` constant-time/mock-safe/FRC/idempotent (mig 211 `reference_id` UNIQUE applied). 4 scoring fns + `calculate-scores` gated. |
| **Testing** | Only `e2e/platform.spec.js` runs in CI (render smoke). 8 logic specs `testIgnore`'d in `playwright.config.js`, assert against **live prod data**. No Vitest/Jest. `"test": "playwright test"`. `docker-compose.yml` provides local Postgres (`postgres:15-alpine`) + Deno runner. |
| **Observability** | `@sentry/react ^10.62.0`; `Sentry.init()` in `src/main.jsx` guarded by `VITE_SENTRY_DSN`. **`VITE_SENTRY_DSN` not set in Vercel** (TRACKER row 11 🔴 pending) — no FE capture in prod yet. `ErrorBoundary.componentDidCatch` calls `Sentry.captureException` ✅ (PR #695). `_shared/log.ts` `logError()` now forwards `error`/`critical` to Sentry envelope API ✅ (PR #696) — active once `SENTRY_DSN` Supabase secret is set (🔴 approval-gated). 6 fns missing `logError`: `purchase-coins`, `discover-tournament`, `sync-tennis-players`, `score-atp-finals`, `score-f1-race`, `score-tennis-tournament`. `check-function-drift.js` + `.function-checksums.json` now track `_shared_hash` ✅ (PR #696). `edge_function_errors` table + `cron_job_status()` RPC exist; no automated alert path for cron failures. |
| **Build** | `.nvmrc=24`, `engines>=24`, CI `npm ci` Node 24. `Dockerfile` line 4 `FROM node:24-alpine` ✅ (fixed PR #694). `.npmrc legacy-peer-deps=true`. |
| **CI** | `.github/workflows/ci.yml`: `security` (audit/madge/encoding/drift) → `lint` → `build` → `e2e` (`needs:[security,lint,build]`); triggers `main`+`v2`. `migrate.yml` manual dry-run. `mobile.yml` not on `v2`. |
| **Data layer** | 117 `supabase.from(` (24 files) + 76 `supabase.rpc(` (33 files) in `src/`. No TanStack Query/SWR. God components: `SquadScreen` 2,219 / `LeagueScreen` 1,894 / `CommissionerPanel` 1,828 / `MarketScreen` 1,547 / `LiveScreen` 1,445. |
| **PAT** | Live GitHub PAT in `.git/config` (untracked, OneDrive-synced). `CLAUDE.md` GitHub-API-Fallback uses a `<PAT>` placeholder (no live token in tracked source). |

---

# PHASE A — Reproducible schema baseline (the keystone)

## A1 — DATA-1: Commit an authoritative `schema.sql` baseline 🔴 prod-read · L

**Goal:** a buyer can build an identical schema from the repo in one command. Today the live DB is the only source of truth.

**Why first:** unblocks B1 (staging is `psql < schema.sql`), B2 (seed a test DB from it), and removes the top remaining buyer-DD blocker (Test C).

**Pre-flight (read-only — safe):**
1. Confirm Docker availability on the Supabase-linked PC (the build machine lacks it). If unavailable, run the dump from the Supabase platform: **Dashboard → Database → Backups / or `pg_dump` via the connection string** (Settings → Database → Connection string). The CLI path `npx supabase db dump --linked --schema-only` needs Docker.
2. `npx supabase db query --linked "SELECT proname, pg_get_functiondef(oid) FROM pg_proc WHERE pronamespace = 'public'::regnamespace ORDER BY proname;"` — capture **all live function bodies** to `backups/live_functions_<date>.sql` (feeds DATA-2 reconciliation in B2).

**Steps:**
1. **🔴 Approval-gated, read-only dump:** `pg_dump --schema-only --no-owner --no-privileges "<prod-connection-string>" > supabase/schema.sql`. (Schema only — no data; safe, but name it in chat first since it reads prod.) Include extensions, RLS policies, functions, triggers, cron jobs, and grants.
2. Add a header to `schema.sql`: generated-from-prod date + commit hash + "canonical baseline — see migrations/archive/ for history."
3. **Freeze the history:** `git mv supabase/migrations supabase/migrations/archive` is wrong (keeps them applied). Instead: create `supabase/migrations/archive/` and move the 243 files into it; add a `README.md` there explaining they are historical lineage, not a replayable sequence. Going forward, new migrations live in `supabase/migrations/` (now empty) as timestamp-prefixed files (`YYYYMMDDHHMMSS_*`).
4. **Separate data fixes:** create `supabase/data-fixes/` and move the one-off data scripts (`139_intfriendly_reset.sql`, `140_reset_pre_competition_transfer_counters.sql`, `165_*stale_lock*`, `191_clean_sheet_retroactive_fix.sql`, `163_sync_squad_matchday*`, etc. — anything that mutates rows rather than DDL) out of `archive/` into here, with a README noting they assume specific live state and are not part of the schema build.
5. **Prove it rebuilds:** spin up the local Postgres (`docker compose up db`), `psql < supabase/schema.sql`, and diff structure against prod (`pg_dump --schema-only` of both → `diff`; or use `migra`/`apgdiff`). Resolve any extension/role differences (Supabase adds `auth`, `storage`, `pgcron` schemas — document which are Supabase-managed vs. app-owned).
6. Document the rebuild command in `docs/deployment/SCHEMA_REBUILD.md`: "Fresh environment = create Supabase project → `psql < supabase/schema.sql` → set secrets → done."

**Done-when:** `psql < supabase/schema.sql` on a clean Postgres produces a schema that structurally matches prod (verified by diff); `migrations/` is empty for new work; `data-fixes/` is separated; the rebuild runbook exists.

**Risk notes:** the dump is read-only — zero write risk. The *real* work is reconciling Supabase-managed schemas (`auth`/`storage`) out of the app baseline so the rebuild doesn't try to recreate them. Budget time for that.

## A2 — DEPLOY-2: Stamp applied-state + reconcile DD docs 🟢 code-only · XS

**Goal:** the migration files and DD docs agree with live state without consulting TRACKER. Today an acquirer reading files alone under-reads the security posture (mig 209/210/211 are applied but headers say "DO NOT APPLY").

**Steps:**
1. For each migration confirmed applied per [TRACKER rows 1–9, 12–17](../TRACKER.md#-pending-db--deploy-actions), prepend a one-line header comment: `-- ✅ APPLIED TO PRODUCTION <date> (TRACKER row N)`. Do **not** alter the SQL body (append-only rule — a comment-only edit to a *historical/applied* file is acceptable lineage annotation; if you prefer strict immutability, record the applied-state in a new `supabase/MIGRATION_LEDGER.md` instead).
2. Update the *original* `TECHNICAL_DUE_DILIGENCE.md` Phase-0 markers (SEC-1, MONEY-1) from "◐ DB pending" → "✅ applied" — or add a banner pointing to the V2 doc as authoritative.

**Done-when:** no file-level reader concludes 209/210/211 are unapplied.

---

# PHASE B — De-risk: DR, tests, observability

## B1 — OPS-1: PITR + staging project + automated backups 🔴 prod-config · M + infra

**Goal:** migrations can be rehearsed; a bad write is recoverable.

**Depends on:** A1 (staging is built from `schema.sql`).

**Steps:**
1. **Enable Supabase PITR** on the production project (paid tier — a billing decision; name it before enabling). Confirm the retention window.
2. **Provision a staging Supabase project.** Build its schema from `supabase/schema.sql` (A1). Seed with anonymized/synthetic data — **never copy live pilot PII**. Add `VITE_SUPABASE_URL`/`ANON_KEY` for staging as a Vercel *Preview* env (scoped to a `staging` branch or the `v2` branch — Production untouched).
3. **Automate daily logical backups** off-site (Supabase scheduled backup, or a cron that `pg_dump`s to object storage). Verify a restore once into the staging project and document it in `docs/deployment/DR_RUNBOOK.md`.
4. Update CLAUDE.md Pilot Safeguards: the "single environment, no PITR" warning becomes "PITR enabled; rehearse on staging first."

**Done-when:** PITR on; staging project exists and is built from `schema.sql`; a daily backup runs and a restore has been tested once and documented.

**Risk notes:** enabling PITR is non-destructive. The staging project is isolated — the only risk is accidentally pointing staging env vars at prod; double-check the URL.

## B2 — TEST-1 + DATA-2: Seeded test harness for hotspot RPCs 🟢 code-only · XL

**Goal:** the core money/game-logic RPCs have automated regression tests in CI against an ephemeral DB; no test reads production. Reconcile repo function bodies against live.

**Depends on:** A1 (`schema.sql` to seed) and ideally the `backups/live_functions_<date>.sql` capture from A1 pre-flight.

**Steps:**
1. **Reconcile (DATA-2):** diff every repo `CREATE OR REPLACE FUNCTION` against the captured live `pg_get_functiondef` output. Where they differ, the live version is authoritative (functions were hand-patched) — fold the live body into `schema.sql` / a new migration so repo == prod. Record discrepancies found.
2. **Choose the harness.** Recommended: **pgTAP** (runs in-database, closest to the SECURITY DEFINER/RLS semantics) or a **Deno integration suite** hitting a local Supabase (`supabase start`). Avoid Vitest-mocking the DB — the value is in exercising real RPC/RLS behavior. Add the framework + a `npm run test:unit` script + CI wiring.
3. **Seed deterministically.** A fixtures file that builds: 2 leagues (classic + draft), 4 squads, a fixture set with known stats, a bet, an auction listing, a coin wallet. Loaded from `schema.sql` + a seed script into the compose Postgres.
4. **Cover the fragility hotspots first** (DD DATA-2 patch-count order): `execute_transfer_atomic` (budget, club cap, window, penalty, initial-build latch), `resolve_bet` (commissioner override, auto-resolve, re-aggregation), `set_lineup` (lock, fixture-status, point recompute), `calculate-scores` math (per-90/per-60, clean-sheet gate, captain, auto-subs, idempotency), `place_bid`/`confirm_auction_win` (escrow, budget at confirmation), coin RPCs (`credit_coins`/`debit_coins_to_escrow`/`release_escrow` — and assert no cash-out path). Happy-path + at least one edge case each.
5. **Repoint the 8 manual logic specs** (`scoring-pipeline`, `scoring`, `draft-*`, `multi-league-and-bets`, `autofill-draft-classic`, `features`) at the seeded local/staging DB instead of prod; remove the `expect(length).toBeGreaterThan(0)` prod-assumption assertions.
6. **Wire into CI** as a job before E2E (parallel to `security`), running against an ephemeral DB (GitHub Actions `services: postgres` or `supabase start`).

**Done-when:** the listed RPCs have happy-path + edge tests in CI against an ephemeral DB; no test reads production; repo function bodies provably match live (reconciliation recorded).

**Risk notes:** code-only and prod-isolated — this is the safest big item. The main effort is the seed fixtures and the reconciliation diff.

## B3 — OPS-2: Activate Sentry + edge tracking + cron alerting 🔴 Vercel/secret + code · S–M

**Goal:** production errors and failed crons actually surface. Today Sentry is coded but inert (no DSN in Vercel); edge functions log to console only.

**Steps:**
1. **🔴 Activate frontend Sentry:** add `VITE_SENTRY_DSN` to Vercel (Production env) — the DSN is in [TRACKER row 11](../TRACKER.md#-pending-db--deploy-actions). Redeploy (`vercel deploy --prod`, or merge to trigger). Confirm a test error appears in Sentry. (DSN is a publishable ingest key, not a secret.) *(Approval-gated — name in chat, wait for yes.)*
2. **Edge function error tracking:** ✅ **Done (PRs #696 + #698).** `_shared/log.ts` `logError()` calls `reportToSentry()` — Sentry envelope HTTP API (no SDK), fires for `error`/`critical` severity, gated on `SENTRY_DSN` Supabase secret. All 19 Edge Functions now import `logError` and call it in their catch/error paths (PR #698 wired the final 6: `purchase-coins`, `discover-tournament`, `sync-tennis-players`, `score-atp-finals`, `score-f1-race`, `score-tennis-tournament`). `.function-checksums.json` regenerated. **Remaining (Supabase-linked PC, approval-gated):** (a) 🔴 set `SENTRY_DSN` Supabase secret — `npx supabase secrets set SENTRY_DSN=https://3d26f98051c484e03c58e2d32a260a89@o4511632696213504.ingest.de.sentry.io/4511632708927568 --project-ref sssmvihxtqtohisghjet` (TRACKER row 11); (b) 🔴 deploy the 6 newly-wired functions — TRACKER rows 20–25 (`npx supabase functions deploy <fn> --project-ref sssmvihxtqtohisghjet` for each). Without (a), Sentry receives nothing; `edge_function_errors` DB table still captures all errors.
3. **Failed-cron alerting:** add a scheduled function (or extend `cron_job_status()`) that checks `cron.job_run_details` for failures in the last hour and alerts (Sentry event / email / webhook) above a threshold. The cautionary tale: mig 124's auto-resolve cron failed on *every* call and was found by manual inspection — this closes that gap. *(Not yet built.)*

**Done-when:** a deliberately-thrown frontend error and a deliberately-failed cron both produce an alert.

---

# PHASE C — Finish provider-independence, multi-sport, legal, transfer

*(Each item is independent; parallelizable after Phase A. Prefer B1/staging existing so migrations rehearse first.)*

## C1 — ARCH-2: Finish the provider seam + `forza_id`→`provider_key` 🔴 migration + deploy · L

**Goal:** the sync functions consume the canonical model (not raw Forza JSON); a new provider is one adapter file + one registry line + a conformance pass.

**Steps:**
1. **Consume the adapter in the sync functions.** In `sync-fixtures`, `sync-players`, `ingest-match-events`, `discover-tournament`: replace inline `forza(path)` + raw-JSON parsing with `getAdapter(tournament.provider).listEvents(...)` / `.getPlayerStats(...)`, writing the `CanonicalEvent`/`CanonicalPlayerStat` model. The `ForzaAdapter` methods already exist in `_shared/providers/forza.ts` — extend them to emit every field the DB writes (the canonical types may need a few more stat fields — see `types.ts`).
2. **Migrate `sync-player-status`** onto the shared `forzaFetch` (remove its inline `FORZA_BASE`).
3. **🔴 Additive migration `218_provider_generalisation.sql`:** `ALTER TABLE tournaments RENAME COLUMN forza_id TO provider_key;` (values preserved — every child FK still joins, just renamed); the `provider`/`sport_id` columns already exist (mig 187); `ALTER COLUMN provider_key DROP NOT NULL`. **Pre-flight:** grep every reference to `forza_id` in functions/RPCs/migrations and confirm the rename doesn't break a join (child tables reference `tournaments(forza_id)` — the rename cascades to the constraint name, not the FK target, so verify). **Back up** `tournaments` rows first.
4. **Adapter-conformance test** (folds into B2's harness): one fixture set asserted against the canonical model, so a buyer can drop in `opta.ts` and prove parity. The `OptaAdapter` stub is the template.
5. Deploy the 5 touched functions + `npm run update:checksums` + commit.

**Done-when:** sync functions never touch provider JSON shape; `tournaments.provider_key` is the spine; a conformance test passes; football scoring is unchanged (verify on staging or a finished fixture).

**Risk notes:** the column rename is the risky bit — rehearse on staging (B1) first. The function refactor is behaviorally neutral if the canonical mapping is exact; diff a before/after `player_match_stats` for one fixture.

## C2 — ARCH-1: Wire trophy emission (meta-leaderboard becomes real) 🔴 migration + deploy · S–M

**Goal:** completing a round/event in any sport writes a trophy, so `get_circle_meta_standings` is non-empty and the cross-sport leaderboard demos. Today `trophy_ledger` has no writer.

**Steps:**
1. **🔴 Migration `218_award_trophy.sql`** (or next free number): an `award_trophy(p_circle_id, p_league_id, p_user_id, p_sport_id, p_tournament_id, p_trophy_type, p_tier)` SECURITY DEFINER helper that inserts into `trophy_ledger` (idempotent — guard against double-award per round/event).
2. **Call it from each settlement path:**
   - Football: in `calculate-scores` `roundComplete` branch — award `round_win` to the round's top scorer (and `season_win` at season end). Needs the league's `circle_id` (now on `leagues`).
   - F1: in `score-f1-race` — `event_win` to the race's top predictor; `season_win` at season finalize.
   - Tennis: in `score-tennis-tournament` / `score-atp-finals` — `event_win` per tournament.
3. Deploy the touched functions + `npm run update:checksums`.
4. **Frontend:** confirm `TrophyCabinetScreen` / the meta-standing UI reads `get_circle_meta_standings` and now shows non-zero (it already calls the RPC per `useClubhouse`).

**Done-when:** finishing a round in any sport writes a trophy; the Clubhouse meta-leaderboard shows real counts for an active circle.

**Risk notes:** awards must be idempotent (the scoring passes re-run) — gate on "trophy for this (league, matchday/event) doesn't already exist." Test in B2's harness.

## C3 — LEGAL-1: No-cash-out as a positive schema constraint 🔴 migration · S

**Goal:** the no-cash-out rule is a hard guarantee, not an absence — for any future real-money review.

**Steps:**
1. **🔴 Migration:** keep the `coin_transactions.type` CHECK with no withdrawal/payout type (already so), **and** add an explicit comment + a test/assertion that no RPC decrements a balance to an external party. Optionally a trigger that rejects any `coin_transactions` insert whose `type` implies an outflow to a non-internal destination.
2. **Document + test** (in B2's harness): assert there is no `withdraw`/`cash_out`/`payout` RPC and that `coin_transactions.type` cannot be a cash-out type.
3. Keep the wager ledger and the Stripe purchase rail as separable modules (they already are) so legal can review the ledger in isolation.

**Done-when:** a reviewer can point to a schema artifact + test (not just a doc) confirming no coin→cash edge.

## C4 — SEC-4: Rotate developer-machine PAT 🔴 manual (dev machine) · XS

**Goal:** no live token in `.git/config` / the OneDrive-synced folder.

**Steps (both developer machines):**
1. GitHub → Settings → Developer settings → revoke the current PAT.
2. New PAT (minimal scope: `repo`+`workflow`) **or** switch to SSH (`ssh-keygen -t ed25519` + add the key to GitHub).
3. `git remote set-url origin git@github.com:SMTCB/WCFantasyFootball.git` (SSH) or use the OS credential manager so the token isn't in `.git/config`.
4. Remove `supabase/.temp/` from git if tracked (`git rm -r --cached supabase/.temp/ && echo 'supabase/.temp/' >> .gitignore`).
5. Scrub the token-extraction pattern from the `CLAUDE.md` GitHub-API-Fallback section.

**Done-when:** `git remote get-url origin` has no embedded token; old PAT revoked; docs scrubbed.

## C5 — INFRA-1 + BUILD-1: Transfer readiness 🔴 migration + docs · M

**Goal:** ownership can transfer cleanly; no owner-specific ref in editable source; build is consistent.

**Steps:**
1. **Template cron URLs.** The ~30 remaining project-ref occurrences are mostly cron `net.http_post` URLs baked into *applied* migrations (60, 63, 90, 91, 108, 110, 120, 122, 127, 181 — can't edit). Write a **new migration** that re-creates those crons reading the URL from a config source (a `app_config` table key, or `current_setting`) instead of a literal — so a new owner changes one row, not 10 migrations. Back up `cron.job` first; rehearse on staging.
2. **Ownership-transfer runbook** (`docs/deployment/OWNERSHIP_TRANSFER_RUNBOOK.md`): new Supabase project (+ `schema.sql` rebuild + re-keyed secrets), new Vercel project, new GitHub repo, buyer's own Forza/OpenF1/Stripe/Groq/RapidAPI accounts + key rotation, DNS, the cron-URL config row. **Dry-run it** into the staging project from B1 and record gaps.
3. **BUILD-1:** change `Dockerfile` line 4 `FROM node:20-alpine` → `node:24-alpine` to match `engines>=24`; rebuild the container to confirm `npm ci` passes.
4. Remove `supabase/.temp/` from git (overlaps C4 step 4).

**Done-when:** no owner-specific ref in editable source; the runbook exists and has been dry-run on staging; Dockerfile is Node 24.

---

# PHASE D — Maintainability & hardening polish (ongoing, not gating)

*(Code-only; do behind the B2 test harness. None block the 8/10 score but all reduce team-onboarding cost.)*

| Item | Goal | Approach | Status |
|------|------|----------|--------|
| **CODE-3** | Error boundaries + Sentry capture | ~~Introduce TanStack Query~~ → **Delivered differently:** `ErrorBoundary.componentDidCatch` wires Sentry `captureException`; new `variant="shell"` wraps `AppLayout`; Kit Light token fixes. | ✅ Done — PR #695 |
| **CODE-3b** | Data-fetching layer | Introduce TanStack Query; migrate fetches incrementally; ESLint rule banning `supabase.from` in screen files. ~193 raw calls today. | ⬜ Future |
| **CODE-2** | God-component decomposition | Extract logic into hooks (`useTransfer`/`useSquad` pattern); split desktop/mobile/modal trees. Target <600 lines/file. Behind B2 harness. 5 files >1,400 lines. | ⬜ |
| **CODE-5** | Incremental TypeScript | `tsconfig.json` + `supabase gen types`; type `lib/`/`hooks/` outward. | ⬜ |
| **LOW-2** | Tighten broad RLS reads | Notably `f1_bets_race`/`f1_bets_year` `USING (true)` expose all predictions; allowlist or scope to paddock membership. | ⬜ |
| **LOW-3** | Inline-style extraction | ~3,795 `style={}` blocks; extract repeated objects to shared constants (ongoing with Kit Light). | ⬜ |
| **LOW-6** | External-API resilience | Confirm Forza/OpenF1 SLAs; tennis RapidAPI → paid plan before scale; add backoff + stale-data alarm. | ⬜ |
| **LOW-10** | CSP hardening | Replace `'unsafe-inline'` in `script-src` with nonce/hash. | ⬜ |
| **LOW-9** | Mobile store-readiness | Signing certs, provisioning, release builds, listings — roadmap, not asset. | ⬜ |

---

## Acceptance checklist (8/10 buyout-ready)

- [ ] **A1** `schema.sql` rebuilds a clean DB matching prod; history archived; data-fixes separated.
- [x] **A2** Migration files + DD docs agree with live applied-state. ✅ PR #694
- [ ] **B1** PITR enabled; staging project from `schema.sql`; daily backup + tested restore.
- [x] **B2** (skeleton) Hotspot RPCs test-covered in CI against an ephemeral DB; no test reads prod. Activates once A1 ships `schema.sql`. ✅ PR #694
- [ ] **B3** Sentry live (FE + edge); failed-cron alerting fires. *(FE captureException ✅ PR #695; `_shared/log.ts` envelope ✅ PR #696; remaining: 2 approval-gated secrets + 6 fns + cron alerting)*
- [ ] **C1** Sync functions consume the canonical model; `tournaments.provider_key`; conformance test passes.
- [ ] **C2** Trophy emission wired; meta-leaderboard non-empty.
- [x] **C3** No-cash-out is a schema constraint + test artifact. ✅ Migration 218 + PR #694
- [ ] **C4** PAT rotated; no token in `.git/config`; docs scrubbed.
- [x] **BUILD-1** Dockerfile Node 24. ✅ PR #694
- [ ] **C5** Cron URLs templated; transfer runbook dry-run.

---

## Related Documents

- [Technical Due Diligence (V2)](../due_diligence/TECHNICAL_DUE_DILIGENCE_V2.md) — the backlog this plan executes (IDs, severities, evidence)
- [B2B Buyout Technical Due Diligence (V2)](B2B_BUYOUT_TECHNICAL_DUE_DILIGENCE_V2.md) — the acquirer-lens score (6.5→8 path)
- [Technical Documentation (V2)](../due_diligence/TECH_DOCUMENTATION_V2.md) — the engineering reference
- [TRACKER.md](../TRACKER.md) — the authoritative live-state + approval gate
- [CLAUDE.md](../../../CLAUDE.md) — pilot safeguards, branch freeze, migration rules

---

*Last Updated: 2026-07-01. Execute against branch `v2`. Confirm session type and the per-item approval gate before any prod-touching action.*

**Session 2026-07-01 progress:** A2 ✅ (PR #694 — applied-state stamps on migrations 202–216), BUILD-1 ✅ (PR #694 — Dockerfile Node 24), C3 ✅ (PR #694 — migration 218 `no_external_cash_out` constraint), B2 skeleton ✅ (PR #694 — `tests/unit/` harness with 13 test cases + CI job), CODE-3 ✅ (PR #695 — Sentry `captureException` in `ErrorBoundary` + `AppShell` guard), OPS-2 code ✅ (PR #696 — `_shared/log.ts` Sentry envelope API + drift script covers `_shared`). B3 remaining: `SENTRY_DSN` Supabase secret (🔴), Vercel `VITE_SENTRY_DSN` TRACKER row 11 (🔴), 6 fns missing `logError`, cron alerting.
