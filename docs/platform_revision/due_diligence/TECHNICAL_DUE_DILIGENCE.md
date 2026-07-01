# Technical Due Diligence — Remediation Backlog & Current State

**Platform:** Forza Fantasy League (multi-sport fantasy: Football + F1 + Tennis + P2P coins)
**Branch reviewed:** `v2` (2026-07-01 — incorporates DD remediation PRs #694–#698)
**Scope:** ~41K LOC React/Vite frontend · 21 Supabase Edge Functions (19 deployable) · 243 SQL migrations · Capacitor iOS/Android
**Purpose:** Internal action document AND buyer-DD simulation. This is a **re-verification** of the original 2026-06-26 due-diligence pass (archived at [docs/archive/superseded-dd-2026-06-30/TECHNICAL_DUE_DILIGENCE.md](../../archive/superseded-dd-2026-06-30/TECHNICAL_DUE_DILIGENCE.md)) against the current codebase. Every claim below was re-greped/re-read on 2026-06-30 (item statuses refreshed through 2026-07-01); status reflects what is actually on disk, cross-checked against the project's own [TRACKER.md](../TRACKER.md) "Pending DB & Deploy Actions" table — **the TRACKER is the live single source of truth for open items.**
**Status legend:** ☐ Not started · ◐ In progress · ☑ Done · ✅ Verified-done-and-live

---

## 0. What changed since the last DD (2026-06-26 → 2026-06-30)

The original DD documents predate (or only partially reflect) a large remediation push (PRs #634–#648) plus the multi-sport build-out (migrations 187–217). **The asset has moved materially.** Re-verified headline deltas:

| Theme | Original DD said | Verified now (2026-06-30) | Delta |
|-------|------------------|----------------------------|-------|
| **Phase 0 security** | SEC-1 / MONEY-1 "◐ DB pending" | ✅ All applied — migrations 209/210/211 live, 5 function deploys done, `FRONTEND_URL` secret set (per TRACKER rows 1–9) | **Closed** |
| **JWT signature gap** | 🔴 Critical (unsigned Path B) | ✅ HMAC-verified + `ADMIN_TRIGGER_KEY` path added | **Closed** |
| **Containerization** | "Zero — no Dockerfile/IaC" | ✅ `Dockerfile` (multi-stage), `docker-compose.yml` (app+pg+deno), `infra/nginx.conf`, `DOCKER_LOCAL_DEV.md` | **Closed (app surface)** |
| **Provider lock-in (Forza)** | "No abstraction seam" | ◐ `_shared/providers/` seam BUILT (types/forza/opta/manual/registry); 4/5 sync fns use the shared client | **Partially closed** |
| **Project-ref hardcoding** | "119 files" | ✅ ~0 in `src/`, externalized via `_shared/config.ts`; 30 files total (mostly append-only migrations + docs) | **Closed (source)** |
| **Multi-sport "designed not built"** | F1/Tennis/circle/trophy = paper | ✅ sport dim (187), circle layer (188), trophy_ledger (189) built; F1 (7 screens) + Tennis (7 screens) routed; clubhouse is default landing | **Largely closed** |
| **npm audit** | 8 vulns (4 high) | ✅ 0 vulnerabilities | **Closed** |
| **CI hardening** | lint+build only | ✅ `security` job (audit/madge/encoding/drift) + gated E2E + `v2` trigger | **Closed** |
| **Route code-splitting** | 0 `React.lazy` | ✅ 27 screens lazy-loaded + `Suspense` | **Closed** |
| **Node pinning** | unpinned | ✅ `.nvmrc=24`, `engines>=24`, CI `npm ci` (⚠️ Dockerfile pins node:20) | **Closed w/ caveat** |
| **God components** | SquadScreen 2,879 ln | 2,219 ln (dead code removed) — still 5 files >1,400 | **Improved, not done** |
| **Schema reproducibility (DATA-1)** | open | ❌ Still no `schema.sql`; 243 files / 19 dup prefixes | **Unchanged** |
| **Test coverage (TEST-1)** | open | ◐ `tests/unit/` skeleton ✅ PR #694 — 13 test cases (transfer/bet/coins), CI ephemeral Postgres job; activates fully once A1 ships `schema.sql` | **Skeleton done, full activation blocked on DATA-1** |
| **Data-fetching layer (CODE-3)** | open | ❌ Still raw Supabase (117 `.from` / 76 `.rpc` in `src/`) | **Unchanged** |
| **PITR / staging / backups (OPS-1)** | open | ❌ Unchanged (single env, no PITR, manual JSON backups) | **Unchanged** |
| **Sentry / alerting (OPS-2)** | ◐ FE done | ◐ FE `captureException` ✅ PR #695; Edge `_shared/log.ts` envelope ✅ PR #696; `logError` wired into all 6 remaining fns ✅ PR #698; **not active** — `VITE_SENTRY_DSN` + `SENTRY_DSN` secrets not yet set (rows 11, 20–25); cron alerting (part c) not built | **Code complete, activation + cron-alerting pending** |

**Net assessment:** the deal-blocking Phase 0 security gate is **closed**, and the two structural buyer-DD blockers the B2B report called fatal (no containerization, provider lock-in) are **closed / substantially de-risked**. The remaining open items are concentrated in **data-layer reproducibility, automated testing, observability activation, and operational DR** — exactly the "transition-to-scale" cluster, none of which require re-architecture.

---

## How to read this document

Items are ordered **in the sequence they should be tackled** (Section 1 = do first). Each carries: stable **ID** · **Severity** (acquirer's risk lens) · **Estimate** · **Where** (verified file/line) · **Problem** · **Fix** · **Done-when**.

**Effort key:** XS = <0.5 day · S = 0.5–1 day · M = 2–4 days · L = 1–2 weeks · XL = 3+ weeks

---

# SEQUENCE OF WORK (at a glance)

| Order | Phase | Items | Status | Rationale |
|-------|-------|-------|--------|-----------|
| 1 | **Phase 0 — Pre-close security gate** | SEC-1, SEC-2, SEC-3, MONEY-1 | ✅ **DONE** | Closed in code + applied to prod. SEC-4 (PAT rotation) still open. |
| 2 | **Phase 1 — Stabilize foundations** | DATA-1, OPS-1, DEPLOY-1, CI-1, DEPS-1, OPS-2, CODE-1 | ◐ **Mostly done** | DEPLOY-1/CI-1/DEPS-1/CODE-1 ✅. DATA-1, OPS-1 still open; OPS-2 code ✅, activation pending (2 secrets). |
| 3 | **Phase 2 — De-risk core logic** | TEST-1, DATA-2, DATA-3, DATA-RECON, CODE-3 | ◐ **Partial** | DATA-3 ✅ (mig 209 applied) + `DATA_CLASSIFICATION.md` ✅ (PR #697). LEGAL-1 ✅ (mig 218, named constraint, PR #694). DATA-2 (GDPR `delete_user_data`) code ✅ PR #697 (apply pending row 19). TEST-1 skeleton ✅ PR #694 (blocks on DATA-1 for full activation). DATA-RECON (repo↔prod RPC diff), CODE-3 open. |
| 4 | **Phase 3 — Team-ready & scale** | CODE-2, CODE-4, CODE-5, DEPS-2, BUILD-1, INFRA-1, polish | ◐ **Partial** | CODE-5/BUILD-1 ✅ PR #694. CODE-2 improved. INFRA-1 partly done (project-ref externalized). |

**Remaining indicative effort to "acquirer-ready":** down from ~5–6 engineer-months to **~3–4 engineer-months**, now concentrated on schema baseline + test harness + DR/staging rather than security.

---

# PHASE 0 — Pre-close security gate ✅ DONE (one residual: SEC-4)

> These were live, verified privilege-escalation / integrity holes. **All four are now closed in code and applied to production** (verified against `_shared/auth.ts`, the four scoring functions, `purchase-coins`, and TRACKER rows 1–9). The single residual is the developer-machine PAT rotation (SEC-4).

## SEC-1 — Admin privilege escalation: `is_admin` is client-writable 🔴 CRITICAL ✅ DONE
- **Where:** `supabase/migrations/210_guard_users_is_admin.sql` — `guard_users_privilege_columns()` SECURITY DEFINER + `BEFORE UPDATE` trigger on `public.users`.
- **Verified:** Trigger passes through non-client roles (`current_setting('role') NOT IN ('authenticated','anon')`), `RAISE EXCEPTION` on any client change to `is_admin` or `id`. Migration applied to prod per [TRACKER.md](../TRACKER.md) row 2.
- **⚠️ Doc-drift to fix:** The migration's own file header still reads "APPLY FROM SUPABASE-LINKED PC" and the *original* DD doc still says "◐ DB pending." Only TRACKER records it as applied. **An acquirer reading the migration files alone would wrongly conclude it is unapplied.** Recommend stamping "APPLIED <date>" into the migration header.
- **Done-when:** ✅ A simulated authenticated JWT cannot set `is_admin=true`; service-role path still can.

## SEC-2 — Scoring Edge Functions caller authorization 🔴 CRITICAL ✅ DONE
- **Where:** `score-f1-race`, `score-tennis-tournament`, `score-atp-finals`, `sync-tennis-players`.
- **Verified:** All four import `requireServiceRole` (line 2) and call it as the first check after the OPTIONS short-circuit, before any DB client is created (`const authErr = await requireServiceRole(req); if (authErr) return authErr;`). Deployed per TRACKER rows 4–7.
- **⚠️ Operational nuance:** As shipped, `requireServiceRole`'s HMAC path was **unreachable** on this project's current Supabase key system (no `SUPABASE_JWT_SECRET` configured), so these four functions were deployed-but-uncallable until a third `ADMIN_TRIGGER_KEY` exact-match path was added (PR #662) plus `verify_jwt = false` in `config.toml` (PR #663). **Rule recorded:** admin-triggered functions need `requireServiceRole` + `verify_jwt=false` together.
- **Done-when:** ✅ Authenticated non-service-role calls return 401; service-role/admin-key calls succeed (confirmed end-to-end on `sync-tennis-players` during the Wimbledon dry run, 2026-06-28).

## SEC-3 — `calculate-scores` trusted an unsigned `service_role` claim 🔴 CRITICAL ✅ DONE
- **Where:** `supabase/functions/calculate-scores/index.js:205-217`.
- **Verified:** The unverified claim-decode is replaced. Two real auth paths now: (a) HMAC-verified service-role via `requireServiceRole`; (b) fallback to a **Supabase-verified** authenticated user (`supabase.auth.getUser()` — a genuine signature check, for the admin manual-rescore button). Deployed per TRACKER row 8.
- **Done-when:** ✅ Forged/unsigned `service_role` tokens are rejected.

## SEC-4 — GitHub PAT embedded in git remote URL 🔴 CRITICAL ☐ STILL OPEN (developer-machine action)
- **Where:** `git remote get-url origin` on both OneDrive-synced developer machines. The token is in `.git/config` (not tracked — correctly excluded from git). The repo's `CLAUDE.md` GitHub-API-Fallback section uses a `<PAT>` *placeholder*, not a live token (verified clean).
- **Remaining steps (TRACKER row 10):** revoke current PAT → new PAT (or SSH) with minimal scope → `git remote set-url` → remove `supabase/.temp/` if tracked → scrub the token-extraction pattern from `CLAUDE.md`.
- **Done-when:** `git remote get-url origin` returns a URL with no embedded token; old PAT revoked; docs updated.

## MONEY-1 — `purchase-coins` revenue path hardening 🔴 CRITICAL ✅ DONE
- **Where:** `supabase/functions/purchase-coins/index.ts`.
- **Verified, all four sub-items:** (a) `verifyStripeSignature()` uses constant-time `crypto.subtle.verify('HMAC',…)` + 5-min replay tolerance; (b) `MOCK_PAYMENTS && STRIPE_SECRET_KEY` hard-fails with 500 `MOCK_PAYMENTS_IN_PROD`; (c) CORS origin reads `FRONTEND_URL` (set in prod per TRACKER row 9); (d) coin ledger credited as `'FRC'` (the Stripe PaymentIntent itself stays `'gbp'` — correct fiat charge vs. virtual-token split). DB-level idempotency via migration 211 `UNIQUE (reference_id)` (applied).
- **Remaining (pre-Stripe-go-live only):** integration tests for charge→credit→idempotent-replay (TEST-1 scope); compliance sign-off (DATA-3).
- **Done-when:** ✅ All four code/config sub-items verified; DB uniqueness live.

---

# PHASE 1 — Stabilize foundations ◐ MOSTLY DONE

## DATA-1 — No reproducible schema; DB cannot be rebuilt from the repo 🔴 CRITICAL ☐ STILL OPEN
- **Estimate:** L (1–2 weeks)
- **Where:** `supabase/migrations/` — **now 243 files with 19 duplicate number prefixes** (16, 63, 90, 96, 112, 140–145, 156, 157, 159, 187, 191, 192, 193, 194). Up from "229 / ~14 dup" in the original DD — **the drift has worsened.** No `supabase/schema.sql`, no `supabase/data-fixes/` folder, no `supabase_migrations.schema_migrations` tracking; CLAUDE.md still states "Supabase migration history is not used in this project." Data fixes (e.g. `139_intfriendly_reset.sql`, `165_…stale_lock.sql`, `191_clean_sheet_retroactive_fix.sql`) remain interleaved with DDL. Numbering gaps at 52, 58.
- **Problem:** The migration directory is a *changelog*, not a *build script*. Replaying `00→217` would error or corrupt (data fixes assume live state). **This is now the single highest-leverage open item** — it is both a reproducibility failure and the precondition for a clean staging env (OPS-1) and a test harness (TEST-1).
- **Fix:** (1) `pg_dump --schema-only` from prod → commit as `supabase/schema.sql` (canonical baseline). (2) Freeze the 243-file history as `migrations/archive/`. (3) Move data-fix scripts into `supabase/data-fixes/`. (4) Adopt timestamp-based migration IDs + `supabase db push` going forward. **This is TRACKER item 1D-B ("000_baseline.sql"), parked "on hold — do as final step before 3B merge."**
- **Done-when:** A fresh Supabase project builds from `schema.sql` in one command and matches prod structurally.

## OPS-1 — Single environment, no PITR, manual backups 🔴 CRITICAL ☐ STILL OPEN
- **Estimate:** M (provisioning) + ongoing
- **Where:** CLAUDE.md Pilot Safeguards (unchanged): live DB is the only DB; no PITR; `npx supabase db dump` broken locally (Docker unavailable); backups are hand-`SELECT`ed JSON in gitignored `backups/`.
- **Note — partial mitigant:** `docker-compose.yml` now provides a **local** Postgres + Deno runner for dev/test, and the audit/recovery tables (`round_backups`, `squad_events`, `squad_matchday_snapshots`) cover game-state recovery. Neither substitutes for managed PITR or a true staging project.
- **Fix:** Enable Supabase PITR (paid tier). Provision a staging project (the schema baseline from DATA-1 makes this one command). Automate daily off-site backups with a verified restore test.
- **Done-when:** PITR enabled; staging project exists; an automated daily backup runs and a restore has been tested once.

## DEPLOY-1 — Edge Function & migration deploys gating 🟠 HIGH ✅ DONE
- **Verified:** `scripts/check-function-drift.js` SHA-256-checksums all **19 deployable** Edge Function entry points against `.function-checksums.json`; `npm run check:drift` is a CI step in the `security` job and fails on un-deployed code changes; `npm run update:checksums` regenerates after deploy. **PR #696 (2026-07-01):** drift check now also hashes all `_shared/*.ts` files into a combined `_shared_hash` entry — changing any shared library now flags all 19 functions as needing redeployment, closing the previously invisible gap where `_shared/log.ts` changes went undetected by CI.
- **Done-when:** ✅ No path ships frontend code whose backend dependency isn't deployed; drift runs on every PR; `_shared` changes are fully covered.

## CI-1 — CI security/dep/secret/build gates 🟠 HIGH ✅ DONE
- **Verified:** `.github/workflows/ci.yml` has a `security` job (runs before E2E) executing `npm audit --audit-level=high`, `npx madge --circular src/`, a non-UTF-8 encoding scan, and `npm run check:drift`. E2E `needs: [security, lint, build]`. **`v2` is now a trigger branch** (push + PR). Dead `typecheck` script removed.
- **Done-when:** ✅ PRs fail on high vulns, circular deps, encoding breakage, and function drift.

## DEPS-1 — Known-vulnerable dependencies 🟠 HIGH ✅ DONE
- **Verified:** `npm audit` reports **0 vulnerabilities** (was 8 / 4 high). `npm audit --audit-level=high` is a blocking CI gate.
- **Done-when:** ✅ 0 high/critical.

## OPS-2 — Production error tracking & alerting 🟠 HIGH ◐ CODE DONE, ACTIVATION PENDING
- **Estimate:** M (remaining: approval-gated secrets + 6 fn wires + cron alerting)
- **Where:** `src/main.jsx:13-22` — `Sentry.init()` present, guarded by `VITE_SENTRY_DSN`, `tracesSampleRate: 0.1`, `browserTracingIntegration()`. `@sentry/react ^10.62.0` in deps.
- **PR #695 (2026-07-01):** `ErrorBoundary.componentDidCatch` now calls `Sentry.captureException` (gated on `VITE_SENTRY_DSN`); `AppLayout` wrapped with shell-level `variant="shell"` boundary; Kit Light token fixes. FE capture code is complete.
- **PR #696 (2026-07-01):** `_shared/log.ts` `logError()` now calls `reportToSentry()` — Sentry envelope HTTP API (no SDK, no Deno dep issues), fires for `error`/`critical` severity only, gated on `SENTRY_DSN` Supabase secret. Never throws.
- **⚠️ Still not active in production:** (1) `VITE_SENTRY_DSN` not yet set in Vercel (TRACKER row 11 = ⬜) — FE `init()` is still a no-op; (2) `SENTRY_DSN` Supabase secret not yet set (🔴 approval-gated) — edge envelope calls will no-op; (3) 6 functions still missing `logError` import: `purchase-coins`, `discover-tournament`, `sync-tennis-players`, `score-atp-finals`, `score-f1-race`, `score-tennis-tournament`; (4) failed-cron alerting not yet built.
- **Fix:** Set the two secrets (approval-gated). Wire `logError` into the 6 remaining fns + deploy. Build cron alerting (extend `cron_job_status()` to alert on failures).
- **Done-when:** A deliberately-failed cron and a frontend crash both surface as alerts.

## CODE-1 — Rolldown (Vite 8) TDZ trap CI guard 🟠 HIGH ✅ DONE
- **Verified:** `madge ^8.0.0` in devDeps; `npx madge --circular src/` in the CI `security` job. All 27 screens are `React.lazy` (dynamic imports don't join the static module graph — structurally eliminates the shared-module TDZ surface).
- **Done-when:** ✅ CI fails on circular deps; the manual grep ritual is automated.

---

# PHASE 2 — De-risk core logic ◐ PARTIAL

## TEST-1 — ~0% automated coverage of money/game logic; tests run against production 🔴 CRITICAL ☐ STILL OPEN
- **Estimate:** XL (3+ weeks for the first meaningful harness)
- **Where (re-verified):** No unit-test framework (no Vitest/Jest config; only `"test": "playwright test"`). CI runs only `platform.spec.js` (render smoke — asserts `bodyText.length > N`). **8 logic specs** (`scoring-pipeline`, `scoring`, `draft-*`, `multi-league-and-bets`, `features`, `autofill-draft-classic`) are `testIgnore`'d in `playwright.config.js` and **still assert against live production data** (e.g. `scoring-pipeline.spec.js:49` `expect(rows?.length).toBeGreaterThan(0)`; `autofill-draft-classic.spec.js:465` `expect(pool?.length).toBeGreaterThanOrEqual(DRAFT_LIST_SIZE)`).
- **Problem:** The 243-migration history *is* the bug log — core financial/game logic has no regression protection; regressions were caught by live users, not tests.
- **Fix:** Stand up local Postgres (the new `docker-compose.yml`/`supabase start` makes this trivial now) with deterministic seed data. Build a pgTAP/Deno suite covering the fragility-hotspot RPCs (DATA-2): `resolve_bet`, `execute_transfer_atomic`, `set_lineup`, `place_bid`, `confirm_auction_win`, the coin RPCs, and the `calculate-scores` math. Repoint Playwright logic specs at seeded local/staging. Wire into CI. **This is now the highest-value engineering investment** — its main precondition (a local DB) is already in place via DATA-1's containerization sibling.
- **Done-when:** Core RPCs have happy-path + edge-case tests in CI against an ephemeral DB; no test reads production.

## DATA-2 — GDPR `delete_user_data` RPC 🟠 HIGH ✅ CODE DONE (apply pending)
- **Estimate:** ~3h
- **Where:** `supabase/migrations/219_delete_user_data.sql` (PR #697). `delete_user_data(p_user_id uuid)` SECURITY DEFINER RPC covering 27 tables across 7 categories (delete / anonymise / PII-wipe); auth gate `auth.uid() = p_user_id OR is_admin`.
- **Status:** Migration file written; **NOT yet applied to prod** — pure DDL, safe (deletes zero rows on apply; runs only when explicitly called). Apply is TRACKER row 19. Companion doc: [`DATA_CLASSIFICATION.md`](DATA_CLASSIFICATION.md).
- **Done-when:** ✅ migration written (PR #697); ⬜ migration 219 applied (TRACKER row 19).

## DATA-RECON — Core RPCs are fragility hotspots (repo↔prod reconciliation) 🟠 HIGH ☐ STILL OPEN
> **Note:** this item was previously labelled "DATA-2" in earlier drafts. Renamed to **DATA-RECON** to avoid an ID collision with the GDPR deletion item above (which the TRACKER + this backlog both now call DATA-2). Same rename applied in [TECHNICAL_DUE_DILIGENCE_V2_IMPLEMENTATION_PLAN.md](../architecture/TECHNICAL_DUE_DILIGENCE_V2_IMPLEMENTATION_PLAN.md).
- **Estimate:** L (overlaps TEST-1; part of implementation-plan phase B2)
- **Where:** Patch counts high: `resolve_bet`, `execute_transfer_atomic`, `set_lineup`, `place_bid`, `accept_trade_proposal`, `get_transfer_window_status`, `set_captain` each patched many times across migrations 130–192. Migration 161 still records "logic was patched into the live function ahead of this file being committed."
- **Problem:** Hand-patching means repo function bodies may not match live; the volume of total-failure bugs (mig 153 every trade errored; mig 124 bets never auto-resolved; mig 168 one live fixture locked every sub-out) indicates the logic was hardened by trial-and-error in prod.
- **Fix:** Diff every repo `CREATE OR REPLACE FUNCTION` against live `pg_get_functiondef`; reconcile into the DATA-1 baseline. Front-load these RPCs' test coverage.
- **Done-when:** Repo function bodies provably match prod; hotspot RPCs are test-covered.

## DATA-3 — Coin/P2P ledger compliance + data classification 🟠 HIGH ✅ DONE (compliance review still external)
- **Where:** `supabase/migrations/209_coin_ledger_compliance.sql` — **applied** (TRACKER row 1). `coin_transactions.type` CHECK now `('purchase','stake','win','loss','rake','refund','admin','entry_fee','wager_placement','wager_win','wager_refund')` — **no withdrawal/payout type**. Currency corrected GBP→FRC. Field-level data classification delivered in [`DATA_CLASSIFICATION.md`](DATA_CLASSIFICATION.md) (PR #697).
- **Residual (now closed by LEGAL-1):** the no-cash-out rule was previously enforced by *absence* only; migration 218 (PR #694) added the positive `no_external_cash_out` schema constraint. Legal/compliance sign-off on the virtual-token model remains an external gate before enabling Stripe at scale.
- **Done-when:** ✅ 209 applied; ledger no longer represents tokens as fiat; ✅ `DATA_CLASSIFICATION.md` written.

## CODE-3 — No data-fetching layer (raw Supabase scattered) 🟡 MEDIUM ☐ STILL OPEN
- **Estimate:** L→XL
- **Where (re-verified):** **117 `supabase.from(` across 24 files; 76 `supabase.rpc(` across 33 files** (~193 raw calls). No TanStack Query/SWR in `package.json`.
- **Problem:** Every component hand-rolls loading/error/refetch; no caching/dedup/consistent error contract — the root cause of state-density in the god-components.
- **Fix:** Introduce TanStack Query (or a thin typed data-access module per table); migrate incrementally; add an ESLint rule banning `supabase.from` in screen components.
- **Done-when:** Screens consume data via hooks/query; no raw `supabase.from` in screen files.

---

# PHASE 3 — Team-ready & scale ◐ PARTIAL

## CODE-2 — God-components 🟠 HIGH ◐ IMPROVED
- **Where (re-verified):** `SquadScreen.jsx` **2,219** (was 2,879 — ~660 lines of dead chip code removed in PR #645), `LeagueScreen.jsx` 1,894, `CommissionerPanel.jsx` 1,828, `MarketScreen.jsx` 1,547, `LiveScreen.jsx` 1,445. Five files still exceed 1,400 lines.
- **Problem:** Data fetching + business rules + 500-line JSX still interleaved; high-traffic surfaces remain hard to test/onboard.
- **Fix:** Extract logic into hooks (pattern exists — `useTransfer`, `useSquad` — under-used); split desktop/mobile/modal trees; do it behind the TEST-1 harness.
- **Done-when:** No screen file exceeds ~600 lines; business logic in tested hooks.

## CODE-4 — Multi-sport abstraction 🟡 MEDIUM ◐ MEANINGFULLY IMPROVED
- **Where:** `src/screens/f1/` (7 screens) and `src/screens/tennis/` (7 screens) are still separate trees, **but** shared primitives now exist: `CompetitionResultsHeader` (CSS-grid standings adopted by F1 + Tennis + Football), `useActiveCompetition` (pathname-derived sport), the providers seam (`_shared/providers/`), and the `sports`/`circles`/`trophy_ledger` schema dimension. The "full 7-screen clone per sport" cost is partially bought down.
- **Remaining:** No `SportModule` runtime contract; admin-result-entry and scoring/gazette plumbing still per-sport. The cross-sport `trophy_ledger` is a **stub** (see new item ARCH-1).
- **Done-when:** Adding a new sport reuses shared primitives; only sport-specific screens are net-new.

## CODE-5 — `typecheck` dead; codebase untyped 🟡 MEDIUM ◐ NEAR-TERM DONE
- **Verified:** Dead `typecheck` script removed; no root `tsconfig.json`; `src/` is 100% `.js`/`.jsx` (Edge Functions are `.ts`/Deno, separate). Strategic incremental TS adoption remains deferred.
- **Done-when (near-term):** ✅ No misleading dead script. **(strategic):** core `lib`/`hooks` typed; `supabase gen types` — deferred.

## DEPS-2 — Bleeding-edge dependency stack 🟡 MEDIUM ◐ PARTIAL
- **Where:** Vite 8/Rolldown, React 19, react-router 7, Tailwind 4, Capacitor 8; Node pinned to 24 (CI) but **Dockerfile pins node:20-alpine** (BUILD-1 caveat — inconsistency vs. `engines>=24`). `.npmrc` `legacy-peer-deps=true` added (PR #654) to resolve a madge@8 peer conflict.
- **Fix:** Reconcile Dockerfile to node:24; document a dependency-stability policy.
- **Done-when:** Versions reconciled; stability policy documented.

## BUILD-1 — Deterministic build; Node pinning 🟡 MEDIUM ✅ DONE (one caveat)
- **Verified:** `.nvmrc` (`24`), `engines: {node: ">=24.0.0"}`, all CI jobs use `node-version: 24` + `npm ci`.
- **⚠️ Caveat:** `Dockerfile` line 4 = `FROM node:20-alpine` — contradicts `engines>=24`; `npm ci` inside the container could warn/fail on the engine check. `mobile.yml` uses `npm install` (not `npm ci`). Recommend bumping the Dockerfile to node:24.
- **Done-when:** ✅ Node pinned, CI uses `npm ci`; (caveat) Dockerfile reconciled to 24.

## INFRA-1 — Owner-tied infrastructure 🟡 MEDIUM ◐ PARTIALLY DONE
- **Where:** Project ref `sssmvihxtqtohisghjet` is now **externalized in source** (`_shared/config.ts` derives it from `SUPABASE_URL`; 0 occurrences in `src/`). It remains in **30 files total** — almost all append-only migration cron URLs (60, 63, 90, 91, 108, 110, 120, 122, 127, 181) + docs, which by the append-only rule cannot be edited in place.
- **Remaining:** Template the cron URLs (new migration that re-creates the crons reading `config`), remove `supabase/.temp/` from git, and write a full ownership-transfer runbook (new Supabase + Vercel + GitHub + Forza/Stripe/Groq/RapidAPI accounts + key rotation) and dry-run it.
- **Done-when:** No owner-specific ref in editable source; transfer runbook exists and has been dry-run.

---

# NEW ITEMS surfaced by the 2026-06-30 re-verification

## ARCH-1 — Cross-sport meta-standing (`trophy_ledger`) is an unwired stub 🟡 MEDIUM ☐ NEW
- **Where:** `supabase/migrations/189_trophy_ledger.sql` creates the `trophy_ledger` table + `get_circle_meta_standings()` RPC, but **no module ever writes to it** (grep: only migration 189 references it; no `award_trophy` helper; `calculate-scores`, `score-f1-race`, `score-tennis-tournament` do not emit trophy rows).
- **Problem:** The headline "Meta-League / cross-sport leaderboard" is **structurally present but functionally empty** — it would always render zero trophies. A buyer demo of "one master leaderboard across football + F1 + tennis" cannot be shown today.
- **Fix:** Add an `award_trophy()` SECURITY DEFINER helper; call it from each sport's round/season-settlement path (football `roundComplete`, F1 race/season finalize, tennis tournament/ATP-finals score) with the right `trophy_type`/`tier`. Backfill is optional.
- **Done-when:** Completing a round/event in any sport writes a trophy; `get_circle_meta_standings` returns non-zero for an active circle.

## ARCH-2 — Provider abstraction is "shared client", not full canonical-model consumption 🟡 MEDIUM ☐ NEW (refines B2B Objective 1)
- **Where:** `_shared/providers/` has `types.ts` (canonical model), `forza.ts` (`ForzaAdapter` + standalone `forzaFetch`/`mapStatus`/`POSITION_MAP`), `opta.ts` (stub that throws), `manual.ts`, and `index.ts` registry. **But** `sync-fixtures`, `ingest-match-events`, `sync-players`, `discover-tournament` import the *standalone helpers* (`forzaFetch as forza`, `mapStatus`, `POSITION_MAP`) and **still parse raw Forza JSON inline** (`m.status`, `m.home_team.name`); they do **not** call `adapter.listEvents()`/`getPlayerStats()` to consume `CanonicalEvent`/`CanonicalPlayerStat`. `sync-player-status` still has its **own inline `FORZA_BASE`** (not yet migrated).
- **Plus DB Depth-3 (unchanged):** the spine is still `tournaments.forza_id text UNIQUE NOT NULL` (no `provider_key` migration exists). F1/Tennis rows synthesize keys but the football join column is provider-named.
- **Problem:** The copy-paste hazard (B2B Depth 1) is **resolved** and the canonical types exist, but a provider swap still touches every sync call-site's inline mapping (B2B Depth 2) and the schema spine (Depth 3). The `OptaAdapter` is a deliberately-throwing stub.
- **Fix:** (1) Refactor the 4 sync functions to call `getAdapter(tournament.provider).listEvents(...)` and write the canonical model (the `ForzaAdapter` methods already exist). (2) Migrate `sync-player-status` onto the shared client. (3) Additive migration: rename `forza_id`→`provider_key`, add `provider`/`sport_id`, drop the football-implied `NOT NULL`. (4) Write an adapter-conformance test so a buyer can prove an `opta.ts` reaches parity.
- **Done-when:** Sync functions never touch provider JSON shape; a new provider = one new adapter file + registry line + conformance pass.

## LEGAL-1 — No-cash-out invariant is structural, not schema-enforced 🟡 MEDIUM ✅ DONE — migration 218 (PR #694)
- **Where:** `supabase/migrations/218_no_cash_out_constraint.sql` (PR #694) renames the anonymous `coin_transactions` type-CHECK to the named `no_external_cash_out` constraint, adds `COMMENT ON CONSTRAINT`/`COMMENT ON TABLE` documenting the FRC internal-only rule, and a `DO $$...$$` audit block asserting zero existing rows use a disallowed type. Backed by LEGAL-1 schema assertions in `tests/unit/coins.test.js` (pg error code 23514 on a cash_out INSERT).
- **Status:** Migration file written; apply pending (bundle with the next approved migration batch — pure DDL, safe). Compliance sign-off on the virtual-token model remains an external legal gate before enabling Stripe at scale.
- **Done-when:** ✅ named constraint + comments + test artifact exist (a reviewer can point to schema/test, not just a doc).

## DEPLOY-2 — Migration files do not record their applied state 🟡 MEDIUM ✅ DONE — A2 (PR #694)
- **Where:** Migrations 209/210/211 (and the 5 function deploys) are marked ✅ applied in `TRACKER.md`, but the **migration file headers** still read "DO NOT APPLY from this machine" / "APPLY FROM SUPABASE-LINKED PC", and the *original* `TECHNICAL_DUE_DILIGENCE.md` still says "◐ DB pending."
- **Problem:** Live state is recorded **only** in a prose tracker, not in the artifacts themselves. An acquirer doing file-level DD (the normal mode) would mis-read the security posture as worse than it is — the inverse of the usual risk, but still a diligence-friction red flag (it signals "source of truth is out-of-band," reinforcing DATA-1).
- **Fix:** ✅ Applied-state stamps (`-- ✅ APPLIED TO PRODUCTION ...`) added as the first line of migrations 202–216 (A2, PR #694). Live state is now legible from the artifacts, not only from TRACKER prose.
- **Done-when:** Migration files + DD docs agree with live state without consulting an external tracker.

---

# LOW / POLISH (tackle opportunistically)

| ID | Item | Status | Note |
|----|------|--------|------|
| LOW-1 | Route-level code-splitting | ✅ Done | 27 screens `React.lazy` + `Suspense`. Initial bundle ~1,042 kB → ~102 kB. |
| LOW-2 | Broad `USING (true)` RLS reads | ◐ Low risk | No PII in any. **Notable:** `f1_bets_race`/`f1_bets_year` expose all users' F1 predictions to any reader; `player_boxes` authenticated-read. `squads_public_read` correctly dropped (mig 95); `gazette_entries`/frontpage are membership-scoped. |
| LOW-3 | ~3,795 inline `style={}` blocks | ◐ Open | Kit Light token migration ongoing (dark→light tokens replaced screen-by-screen across the redesign). Extract repeated style objects. |
| LOW-4 | Feature-flag dead code | ✅ Done | ~973 lines removed (chips/knockout-draft) from SquadScreen + CommissionerPanel. |
| LOW-5 | Source-file encoding mojibake | ✅ Done | `.editorconfig` (UTF-8/LF) + CI non-UTF-8 byte scan. |
| LOW-6 | External-API SPOF | ◐ Open | Forza sole football feed; tennis on RapidAPI 50 req/day free tier (admin-triggered, ~28 calls/season). Confirm commercial SLAs; tennis→paid before scale; add backoff + stale-data alarm. |
| LOW-7 | Recovery tables are game-state only | — | `round_backups`/`squad_events`/`squad_matchday_snapshots` are solid for game state; not a PITR substitute (OPS-1). |
| LOW-8 | Transitive license scan | ✅ Done | At `docs/reference/license-summary.txt` (note: not `docs/license-summary.txt` as the original DD claimed). 386 pkgs: MIT 306, ISC 23, Apache-2.0 22, BSD 15; 1 UNLICENSED = the project itself. |
| LOW-9 | Mobile (Capacitor) not store-ready | ◐ Open | Simulator/debug only, unsigned, no certs/listings; `mobile.yml` builds iOS sim + Android debug. Roadmap, not a shipped asset. |
| LOW-10 | CSP allows `'unsafe-inline'` | ☐ New | `script-src`/`style-src 'unsafe-inline'` (Vite/Tailwind inline). Residual XSS-hardening gap, not a blocker; consider nonce/hash for scripts. |

---

## What is genuinely solid (the buyer narrative — re-verified)

- **Phase 0 security is closed.** `_shared/auth.ts` `requireServiceRole()` HMAC-verifies; all four scoring functions + `calculate-scores` gate on it; `purchase-coins` is constant-time, mock-safe, CORS-locked, FRC-denominated, and DB-idempotent. The `is_admin` self-promotion hole is closed by a trigger.
- **The two structural buyer-DD blockers are substantially closed.** Containerization now exists (multi-stage Dockerfile + compose + nginx + local-dev guide); the project ref is externalized out of source; the provider-adapter seam is built; and the multi-sport schema dimension (sports/circles/trophy_ledger) is live — directly answering the B2B report's Tests A and (partly) B/Objective 3.
- **Coin ledger** has RLS + guard trigger; `credit_coins`/`debit_coins_to_escrow`/`release_escrow`/`admin_grant_coins` are REVOKE'd from client roles; **no cash-out path exists** (legally clean).
- **`squads` + `coin_wallets` column guards** intact — clients cannot write budget/roster/balance/identity.
- **Scoring pipeline is idempotent** (upserts keyed on `fixture_id,player_id` and `squad_id,matchday_id`), with overlapping cron windows and a settled-round guard.
- **Per-route `ErrorBoundary`** + client crash reporter; **27 lazy-loaded screens**; **0 npm vulnerabilities**; **CI security gate**; **strong CSP/headers**.
- **Audit/recovery tables** (`round_backups`, `squad_events`, `squad_matchday_snapshots`) provide a real game-state recovery story.
- **Exceptional institutional memory** — CLAUDE.md + TRACKER.md document every migration, every sharp edge, every architectural decision.

---

*Last Updated: 2026-07-01. Re-verified against branch `v2` and cross-checked with [TRACKER.md](../TRACKER.md) (the live SOT for open items). The prior 2026-06-26 edition is archived at [docs/archive/superseded-dd-2026-06-30/TECHNICAL_DUE_DILIGENCE.md](../../archive/superseded-dd-2026-06-30/TECHNICAL_DUE_DILIGENCE.md).*
