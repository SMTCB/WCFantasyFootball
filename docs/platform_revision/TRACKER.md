# Platform Revision — Central Tracker

**Read this at the start of every v2 session. Everything that is open, pending, or blocked lives here.**

> **Goal:** ship a multi-sport platform (Football + F1 + Tennis + P2P betting) that can be presented to a buyer with all features implemented — not on a roadmap. Target buyout score: **8/10**.
>
> **Branch:** `v2` — not deployed until Week 12. Live pilot runs on `main` and is completely untouched.
>
> **Detailed sprint history (archived):** [SALE_READY_PROJECT_PLAN.md](../../docs/archive/session-audits/SALE_READY_PROJECT_PLAN.md) — read-only historical record of all sprint notes, architecture decisions, and task breakdowns. **This file is no longer updated.** All open activities live in this TRACKER.

---

## ▶️ Execution Queue — every open item, tagged by where it runs

**This is the pick-up-and-run list.** Each row says *where* it executes so you can batch work per machine. Tags:

- **`[SUPABASE-PC]`** — must run from the Supabase-linked PC (`db query --linked`, `functions deploy`, `secrets set`). **Every one is approval-gated** — Claude names the row and waits for an explicit "yes, run row N" before executing (see [Pending DB & Deploy Actions](#️-pending-db--deploy-actions)).
- **`[CODE]`** — code/docs work; any PC with the repo. Normal branch → PR into `v2`.
- **`[VERCEL]`** — Vercel dashboard/CLI (env vars, redeploy).
- **`[BUSINESS]`** — a human/legal/product decision, no code. See [Open Product Decisions](#open-product-decisions).
- **`[BLOCKED]`** — do not start; blocker noted.

Order within each group is dependency-ordered. Detail for each item is in the linked section below — this table is the index, not a replacement.

### 🔴 Approval-gated Supabase actions (do on the Supabase-linked PC)
| Do | Tag | Item | Detail |
|----|-----|------|--------|
| ⬜ | `[SUPABASE-PC]` | Apply migration **219** — GDPR `delete_user_data` RPC (pure DDL, safe, deletes nothing) | [row 19](#️-pending-db--deploy-actions) |
| ⬜ | `[SUPABASE-PC]` | Apply migration **218** — `no_external_cash_out` constraint (LEGAL-1, pure DDL) | [row 26](#️-pending-db--deploy-actions) |
| ⬜ | `[SUPABASE-PC]` | `secrets set SENTRY_DSN=...` (OPS-2 edge activation) | [row 11 note](#️-pending-db--deploy-actions) |
| ⬜ | `[SUPABASE-PC]` | Deploy 6 fns for OPS-2 `logError`: `purchase-coins`, `discover-tournament`, `sync-tennis-players`, `score-atp-finals`, `score-f1-race`, `score-tennis-tournament` | [rows 20–25](#️-pending-db--deploy-actions) |
| ⬜ | `[SUPABASE-PC]` | F1 data migration — copy FantasyF1 DB into v2 tables | [row 16](#️-pending-db--deploy-actions) |
| 🛑 | `[BLOCKED]` | Migration **217** (`circle_id NOT NULL`) — **DO NOT RUN until World Cup pilot ends** | [row 18 banner](#-migration-217--do-not-run-until-the-world-cup-pilot-ends-) |

### 🖥️ Frontend/infra config
| Do | Tag | Item | Detail |
|----|-----|------|--------|
| ⬜ | `[VERCEL]` | Add `VITE_SENTRY_DSN` env var (Production) then redeploy (OPS-2 frontend activation) | [row 11](#️-pending-db--deploy-actions) |

### 💻 Code / docs work (any repo PC → PR into `v2`)
| Do | Tag | Item | Detail |
|----|-----|------|--------|
| ⬜ | `[CODE]` | **OPS-2 part (c)** — failed-cron alerting (≥3 consecutive failures → alert). *Last code piece of OPS-2.* | [Phase 2 DD](#phase-2--post-3b-before-buyer-demos) |
| ⬜ | `[CODE]` | **P2P-LOAD** — 50-concurrent-challenge load test (needs `MOCK_PAYMENTS=true`) | [Phase 2 DD](#phase-2--post-3b-before-buyer-demos) |
| ⬜ | `[CODE]` | **GDPR-2** — build user-data export (portability) | [Phase 3 DD](#phase-3--before-sale-close) |
| ⬜ | `[CODE]` | **DATA-RECON** — diff repo RPC bodies vs live prod; reconcile *(needs A1/DATA-1 first)* | [Phase 1 DD](#phase-1--complex-currently-deferred) |
| ⬜ | `[CODE]` | **CODE-3 / CODE-2 / CODE-4 / CODE-5 / CODE-6 / DEPS-2 / INFRA-1 / LOW-2/3/6/9** — maintainability & polish backlog | [Phase 3 DD](#phase-3--before-sale-close) |
| ⬜ | `[CODE]` | **UX-DESKTOP-1** — Tier B multi-sport screens desktop scale-up | [Phase 3 DD](#phase-3--before-sale-close) |
| ⬜ | `[BLOCKED]` | **A1 / DATA-1** — schema baseline (`schema.sql`) — the keystone. *Blocked: needs a `[SUPABASE-PC]` prod dump (approval-gated) first, then code.* Unblocks B1, DATA-RECON, staging. | [Phase 1 DD](#phase-1--complex-currently-deferred) |
| ⬜ | `[BLOCKED]` | **OPS-1 / B1** — PITR + staging project. *Blocked on A1.* | [Phase 1 DD](#phase-1--complex-currently-deferred) |

### ⚖️ Business / legal decisions (no code)
| Do | Tag | Item | Detail |
|----|-----|------|--------|
| ⬜ | `[BUSINESS]` | **SEC-4** — rotate GitHub PAT + switch to SSH (also touches `[CODE]`: remove token pattern from CLAUDE.md) | [row 10](#️-pending-db--deploy-actions) |
| ⬜ | `[BUSINESS]` | **GDPR-1** — Groq DPA / data-minimisation review before real-PII launch | [Phase 3 DD](#phase-3--before-sale-close) |
| ⬜ | `[BUSINESS]` | **GDPR-3** — objection-handling automation (or document manual process) | [Phase 3 DD](#phase-3--before-sale-close) |
| ⬜ | `[BUSINESS]` | Stripe account confirmation · Forza API licence transferability · football-competition expansion · staging env · meta-league formula · non-playing-member UX | [Open Product Decisions](#open-product-decisions) |

### 🚦 Then: Phase 3B ship sequence
Once the above are cleared, run the [Phase 3B Pre-Merge Checklist](#phase-3b-pre-merge-checklist) (smoke tests → final main→v2 merge → apply pending DB actions → v2→main PR → deploy all Edge Functions → verify crons). **This is the gate to going live — needs its own explicit go-ahead.**

---

## Phase Status

| Phase | Track | Status | Notes |
|---|---|---|---|
| **0** | Foundation seams (sport abstraction, circle layer, trophy ledger) | ✅ Done | Migrations 187–189 applied |
| **1A** | P2P Betting (coin ledger, challenges, auto-resolution, economy) | ✅ Done | Sprints P2P-0 through P2P-6 (PRs #627–#629, migrations 202–207) |
| **1B** | F1 Module (paddocks, picks, scoring, OpenF1) | ✅ Done | Sprints F1-0 through F1-3 (PR #606) |
| **1C** | UX Redesign (Kit Light token pass, multi-sport shell) | ✅ Done | Sprints UX-0, UX-1, UX-2 (PRs #632–#633) |
| **1D-A** | HMAC-SHA256 JWT fix (requireServiceRole) | ⚠️ Insufficient — see 2026-06-28 note | The legacy-JWT HMAC path this fix added cannot be satisfied on this project's new Supabase key system (no `SUPABASE_JWT_SECRET` configured). A third auth path (`ADMIN_TRIGGER_KEY`) was added 2026-06-28 (PR #662) to actually make the 4 admin functions callable. |
| **1D-B** | Schema reproducibility baseline (000_baseline.sql) | ⏸ On hold | Do as final step before 3B merge |
| **1E** | Clubhouse social architecture (channels, DMs, frontpage, inbox) | ✅ Done | Sprints CH-0 through CH-9 (PRs #607–#615) |
| **2** | Tennis Module (Player's Box, roster picks, Ace Cards, ATP Finals) | ✅ Done | Sprints T-0 through T-4 (PRs #617–#620, #625) |
| **3A** | Buyout hygiene batch 2 (provider adapter, containerisation, envs) | ✅ Done | PRs #634–#636 |
| **3B** | v2 integration & deploy | 🔄 In progress | Code quality gates ✅ — smoke tests + deploy remaining |
| **R** | Clubhouse-Centric Redesign (IA/UX) | ✅ Done — Phase D closed | Phase A PR #671, Phase B PR #675, Phase C PR #676, Phase D PR #677. Migration 217 deferred (blocked by live pilot). Design: [CLUBHOUSE_CENTRIC_REDESIGN.md](architecture/CLUBHOUSE_CENTRIC_REDESIGN.md). See [workstream](#clubhouse-centric-redesign-workstream) below. |
| **M** | Mobile-First Redesign (sub-`lg` UX) | ✅ Done — all phases complete | M0 (PRs #682–684), M1 (PRs #685–686), M2 (PR #687), M3 (PR #688), M4 (PR #689). Design: [MOBILE_FIRST_REDESIGN.md](architecture/MOBILE_FIRST_REDESIGN.md). See [workstream](#mobile-first-redesign-workstream) below. |

**Next session options (choose one):**
- **DD items** — P2P-LOAD (load test script), OPS-2 part (c) (failed-cron alerting — ≥3 consecutive failures → alert)
- **Phase 3B smoke tests** → deploy sequence — see [Phase 3B checklist](#phase-3b-pre-merge-checklist) below
- **Approval-gated deploys** — rows 19–26 (GDPR RPC + LEGAL-1 constraint + 6 OPS-2 function deploys), requires Supabase-linked PC

**Session 2026-07-01 (docs audit + DD-doc consolidation):** Full audit of `docs/platform_revision/architecture/` + `due_diligence/` against this TRACKER and git/code state. **Finding:** tracking discipline is strong — TRACKER, git history, and on-disk migration/code state all agree (migrations through 219 present, next 220_, 217 blocked, `tests/unit/` harness present). The one real tracking gap was a **V1/V2 doc duplication with inconsistent git-tracking**: four authoritative `_V2` DD docs were superseding stale V1 files but were sitting *uncommitted* on disk (only `TECHNICAL_DUE_DILIGENCE_V2.md` was tracked). **Resolved this session:** the 5 stale V1 docs (`TECHNICAL_DUE_DILIGENCE`, `TECH_DOCUMENTATION`, `TECH_OVERVIEW`, `VALUATION_ANALYSIS` in due_diligence/ + `B2B_BUYOUT_TECHNICAL_DUE_DILIGENCE` in architecture/) moved to `docs/archive/superseded-dd-2026-06-30/`; each `_V2` doc promoted to the canonical (no-suffix) name and committed; all internal `_V2.md` cross-links repaired; `(V2)` dropped from titles. Also refreshed stale status in two architecture plans: Clubhouse redesign plan Phase D marked ✅ done (PR #677, was showing ⬜/"Next: Phase D"); P2P design "Open Decisions (Sprint 0)" marked resolved (module shipped, migrations 202–207). **Known residual:** migration `218_no_cash_out_constraint.sql` line 29 has a comment pointing at the old `TECHNICAL_DUE_DILIGENCE_V2.md` path — left as-is (append-only migration rule; harmless comment). Added GDPR-1/2/3 from `DATA_CLASSIFICATION.md` to the DD backlog below (Groq DPA, data-portability, objection automation). **Second pass same session:** (1) synced the DD backlog + implementation plan with today's #697/#698 — DATA-2 (GDPR delete_user_data), LEGAL-1 (mig 218), DEPLOY-2 (applied-state stamps) and OPS-2 logError all moved from open→done. (2) **Resolved a DATA-2 ID collision:** the RPC repo↔prod reconciliation task (previously also called "DATA-2") was renamed **DATA-RECON** everywhere; "DATA-2" now means only the GDPR deletion RPC. (3) Added the **▶️ Execution Queue** at the top of this file — every open item tagged `[SUPABASE-PC]`/`[CODE]`/`[VERCEL]`/`[BUSINESS]`/`[BLOCKED]` in dependency order, so work can be batched per machine. No code touched.

**Session 2026-07-01 (DD — OPS-2 code complete, PR #698):** Wired `logError` from `_shared/log.ts` into the 6 remaining Edge Functions that were using bare `console.error` or no error logging: `purchase-coins` (2 error paths: missing webhook metadata + credit_coins webhook failure), `discover-tournament` (outer catch), `sync-tennis-players` (outer catch), `score-atp-finals` (outer catch), `score-f1-race` (outer catch), `score-tennis-tournament` (outer catch). All errors now flow to `edge_function_errors` DB table + Sentry envelope (once `SENTRY_DSN` secret is set, row 11). `.function-checksums.json` regenerated. **Still pending:** rows 11 + 20–25 (Sentry secret + 6 function deploys, each needs per-item approval). OPS-2 part (c) — failed-cron alerting — not yet built.

**Session 2026-07-01 (DD — DATA-2 + DATA-3):** **DATA-2:** Migration `219_delete_user_data.sql` written — `delete_user_data(p_user_id uuid)` SECURITY DEFINER RPC. Covers 27 tables across 7 categories: (1) ephemeral/notifications deleted (`league_notifications`, `league_chat_read_status`, `clubhouse_notifications`, `client_errors`); (2) user content deleted (`chat_messages`, `frontpage_reactions`, `frontpage_comments`, `clubhouse_messages`, `direct_messages`, `draft_submissions`, `knockout_keep_submissions`, `bet_submissions`, pending `trade_proposals`, `player_availability_flags`); (3) sport picks deleted (`tennis_rosters`, `tennis_qf_captains`, `tennis_atp_finals_picks`, `tennis_ace_cards`, `tennis_tournament_scores`, `f1_bets_race`, `f1_bets_year`, `f1_scores`); (4) financial — `coin_wallets` deleted (cascades `coin_transactions`), `daily_jokers`/`chips_used` deleted; (5) game history anonymised — `squad_events`/`transfers`/`draft_allocations` set `user_id=NULL`; `h2h_schedule`/`h2h_records` user slots nulled; `trophy_ledger` `user_id` nulled; `squads.user_id` nulled (FK preserved so `fantasy_points` history intact); settled `p2p_challenges` `challenger_id`/`opponent_id` nulled; (6) membership deleted (`league_members` cascades `matchday_recaps`, `circle_members`, `paddock_members`, `player_box_members`); (7) users row PII wiped (`username → '[deleted-{uid8}]'`, `avatar_url → NULL`). Auth check: `auth.uid() = p_user_id` or `is_admin=true`. v2-only tables guarded by `IF EXISTS` checks. **Row 19 in pending table** = approval-gated apply. **DATA-3:** [`DATA_CLASSIFICATION.md`](due_diligence/DATA_CLASSIFICATION.md) written — field-level PII inventory for all 27 tables, retention schedule, GDPR rights implementation matrix, third-party data flows (Supabase/Vercel/Forza/Sentry/Groq with DPA status). ⚠️ Groq flagged as needing DPA review before launch (receives league + chat excerpt data for frontpage generation).

**Session 2026-07-01 (DD — CODE-3 + OPS-2, PRs #695 + #696):** **CODE-3 (PR #695):** `ErrorBoundary.jsx` fully rewired — `reportError()` dual-writes to Sentry (`Sentry.captureException` via `@sentry/react`, gated on `VITE_SENTRY_DSN`) and the DB RPC; Kit Light fixes (`var(--bg)` background, `var(--paper)` text, `var(--rule)` border); `variant="shell"` prop adds full-page height for AppShell crashes. `App.jsx` wraps `<AppLayout>` in `<ErrorBoundary screen="AppShell" variant="shell">`. **OPS-2 (PR #696):** `_shared/log.ts` gains `reportToSentry()` — uses Sentry envelope HTTP API directly (no SDK), fires for `error`/`critical` severity only, gated on `SENTRY_DSN` Supabase secret (approval-gated, row 11 + separate Supabase secret). `check-function-drift.js` + `update-function-checksums.js` both updated to hash all `_shared/*.ts` files combined into `_shared_hash` — CI now catches any `_shared` change and flags all functions for redeployment. `.function-checksums.json` regenerated with new `_shared_hash` field. Note: `SENTRY_DSN` Supabase secret + Vercel `VITE_SENTRY_DSN` (row 11) still pending approval before Sentry events appear in the dashboard. 6 functions without `logError` imports still need wiring: `purchase-coins`, `discover-tournament`, `sync-tennis-players`, `score-atp-finals`, `score-f1-race`, `score-tennis-tournament`.

**Session 2026-07-01 (DD — A2, BUILD-1, C3, B2, PR #694):** Four DD items shipped into v2. **A2 (DEPLOY-2):** Applied-state stamps (`-- ✅ APPLIED TO PRODUCTION ...`) added as first line to migrations 202–216 — any file reader now knows what is live without consulting TRACKER. **BUILD-1:** `Dockerfile` `node:20-alpine` → `node:24-alpine`, matching `package.json` `engines>=24` and `.nvmrc`. **C3 (LEGAL-1):** New migration `218_no_cash_out_constraint.sql` — renames the anonymous `coin_transactions` CHECK to the named constraint `no_external_cash_out` (same allowed-type scope, explicit legal label), adds `COMMENT ON CONSTRAINT` and `COMMENT ON TABLE` for coin_transactions and coin_wallets documenting the FRC internal-only rule, includes a `DO $$ ... $$` audit block that asserts zero existing rows have a disallowed type (withdrawal/cash_out/payout/redeem/transfer_out). **B2 (TEST-1):** RPC regression test harness skeleton in `tests/unit/` — `helpers.js` (pg Client wrapper, `callRpc` with JWT-claim simulation, begin/rollback transaction helpers), `setup.js` (schema + seed loader with graceful exit if `supabase/schema.sql` absent — Phase A1 dependency), `seed.sql` (fixed UUIDs for 2 leagues, 3 squads, 16 players across 5 clubs/nations, 1 bet, 1 auction, 1 matchday), `transfer.test.js` (6 cases: happy path, over-budget, club cap, closed window, over-round-limit penalty, initial-build latch), `bet.test.js` (4 cases: commissioner resolve, cron blocked while open, double-resolve guard, points re-aggregated), `coins.test.js` (3 RPC cases + 5 LEGAL-1 schema assertions including pg error code 23514 on cash_out INSERT). CI `unit-tests` job added in `ci.yml` (Postgres 15 service, parallel to `security`/`lint`, graceful skip if `supabase/schema.sql` absent, gates `e2e`). `package.json`: `test:unit` + `test:unit:watch` scripts + `pg@^8.13.3` devDep. `eslint.config.js`: Node globals block for `tests/**`. Lint: 0 errors. Build: clean, no TDZ. Next migration: `219_`.

**Session 2026-06-30 (Phase M4 — parity & polish, PR #689):** Phase M4 complete — closes the Mobile-First Redesign workstream. Four target areas: **(1) Tap-target sweep (≥44px):** RecapView `MatchdayNav` buttons `padding: 4→8px + minHeight:44`; SquadScreen action-sheet buttons `py-2.5→py-3`; MarketScreen per-row action buttons (LOCKED/SELLING/BUYING/SELL/CLUB FULL/BUY) `padding: 6→10px + minHeight:44`. **(2) PlayerPickerSheet portal fix:** added `createPortal(…, document.body)` — fixes iOS WebKit `WebkitOverflowScrolling:touch` stacking context trap that was causing the sheet's backdrop and taps to render incorrectly; updated stale dark-theme tokens (`var(--ink-2)` → `var(--card)`, `rgba(255,255,255,0.05)` → `var(--elev)`, `rgba(255,255,255,0.1)` → `var(--rule)`, handle `rgba(255,255,255,0.15)` → `var(--rule)`, X button bg `rgba(255,255,255,0.06)` → `var(--elev)`, row divider `rgba(255,255,255,0.04)` → `var(--rule)`). **(3) Tablet tier:** `index.css` `@media (640–1023px)` block — `.fk-mob-sheet-wrap` centred at max 520px wide with `border-radius:12px 12px 0 0`; `[data-sheet-tablet]` generic selector for any future sheet that opts in; `.fk-competition-grid` class for two-up card layout (ClubhouseScreen `AllCompetitions` already uses `auto-fill minmax(240px, 1fr)` which naturally gives 2-col at 640px — CSS class is a future hook). Lint: 0 errors. Build: clean (2.00s). Madge: no circular deps. platform.spec.js: running.

**Session 2026-06-29 (Clubhouse-centric redesign — assessment + design):** Product assessment of the multi-sport platform's "common vision." Diagnosed 6 concrete causes of the "fantasy-sports frankenstein" feel: (1) sidebar morphs per sport (`activeSport`-driven `FOOTBALL_NAV`/`buildF1Nav`/Tennis nav swap), (2) two competing home screens (`/` MultiSportHome + `/clubhouse`), Clubhouse buried under COMMUNITY, (3) `circle_id` nullable / competitions born orphaned, (4) two disconnected state models (`SportContext` ⊥ `useClubhouse`), (5) three reinvented sport lobbies, (6) taxonomy drift (My Group/Clubhouse/circle). Agreed unifying concept: **Clubhouse is the room, sports are tables in it** — every competition always belongs to a clubhouse (structural invariant), shared 3-tier spine (Tier 1 clubhouse surfaces = identical / Tier 2 results header = same skeleton / Tier 3 unit = sport divergence). Nav model: **sidebar = clubhouse spine (sport-agnostic, never morphs), top bar = competition tabs (named comps, sport-colored)**. User approved **full A–D redesign**. Two docs written, no code touched: [CLUBHOUSE_CENTRIC_REDESIGN.md](architecture/CLUBHOUSE_CENTRIC_REDESIGN.md) (vision/why-what) + [CLUBHOUSE_CENTRIC_REDESIGN_IMPLEMENTATION_PLAN.md](architecture/CLUBHOUSE_CENTRIC_REDESIGN_IMPLEMENTATION_PLAN.md) (self-contained phase-by-phase build plan with current-state reference, cross-cutting rules, per-phase functional+technical specs, acceptance criteria, and an 8-PR breakdown — written to be executed cold in dedicated sessions). Key finding embedded in the plan: `useClubhouse` is a hook not a provider (MultiSportHomeScreen + ClubhouseScreen double-fetch) → Phase A promotes it to `ClubhouseProvider`; football screens are global routes while F1/tennis are id-scoped → secondary screen strip is built per selected competition's sport; `get_clubhouse_competitions` stubs tennis as `[]` → Phase B wires it (migration 216); `circle_id NOT NULL` is migration 217 (approval-gated, orphan-backfill first). Next: Redesign Phase A (Shell & IA), PR 1.

**Session 2026-06-29 (Redesign Phase C, PR #676):** Phase C complete. New `useActiveCompetition()` hook (`src/hooks/useActiveCompetition.js`) derives `{sport, competitionId}` from pathname alone — no context, no global state; football routes matched by `/league/`, `/live`, `/squad`, `/market`, `/recap`; F1 by `/f1/`; tennis by `/tennis/tournament/`. `SportContext` `activeSport`/`setActiveSport` removed entirely — only `activePaddockId`/`activePlayerBoxId` remain (still used by usePaddock/usePlayerBox for localStorage persistence). `AppLayout` switched from `isF1`/`isTennis` path checks to `useActiveCompetition()`. `ClubhouseScreen`, `F1HomeScreen`, `PaddockLobbyScreen`, `PlayerBoxScreen` — all `setActiveSport()` calls removed. New `CompetitionResultsHeader` component (`src/components/competition/CompetitionResultsHeader.jsx`) — CSS-grid standings table, configurable columns `{key, label, width, accessor, color?, activeAccent?}`, global `accent` prop + per-column `activeAccent` override, `highlightUserId` row highlight with `color-mix` bg, medals for top-3, `renderName`/`renderActions` callbacks, `loading`/`emptyMessage` states. Adopted in: `F1StandingsScreen` (RACE/SEASON/TOTAL view toggle, `--f1` accent, per-column activeAccent for TOTAL active = `--paper`), `TennisLeaderboardScreen` (SLAMS/MASTERS/FINALS/TOTAL, `--ten` accent), `LeagueDetailView` desktop standings grid (TOT + optional H2H, `--cyan` accent, `MgrTag`/`miniBtnStyle` via renderName/renderActions callbacks). All checks: lint 0 errors, build TDZ-free, madge no circular deps, 84/84 platform tests green. No DB changes.

**Session 2026-06-29 (Redesign Phase B, PR TBD):** Phase B frontend complete. New `NewCompetitionFlow.jsx` — portal modal (createPortal to body per rule), sport picker step + per-sport create forms (Football: name+tournament+format+H2H; F1/Tennis: name only) + join-by-code section with sport selector. Calls RPCs directly via supabase client (no hook imports — avoids TDZ since AppLayout imports useClubhouseContext and SportContext which usePaddock/usePlayerBox transitively pull in). `refreshCompetitions` added to `useClubhouse` return (calls `fetchCircleData(activeCircleId)`). `CompetitionTopBar` `+` button enabled with `onAdd` prop. `AppLayout` manages `showNewCompFlow` state, passes `circleId` + `refreshCompetitions` as props (not context — TDZ safe). Two migration files committed but NOT yet applied: `216_wire_tennis_competitions.sql` (replaces hardcoded tennis `[]` with `circle_player_boxes` join, row 17 in pending table) and `217_circle_id_not_null.sql` (approval-gated, orphan pre-flight required, row 18). `useActiveCompetition` location-model collapse deferred to next Phase B PR. Build: 0 errors, 1 pre-existing lint warning. Madge: no new cycles. 84/84 platform tests passing.

**Session 2026-06-29 (Redesign Phase A, PR #671):** Implemented Phase A of the Clubhouse-Centric Redesign (frontend-only, no schema). New files: `ClubhouseContext.js` (context + hook, split to avoid Rolldown TDZ), `ClubhouseProvider.jsx` (singleton at app root), `CompetitionTopBar.jsx` (prop-only flat competition tabs, sport-colored, returns null with zero competitions), `CompetitionScreenNav.jsx` (secondary strip per active sport — football/F1/tennis, returns null on non-sport routes). Modified: `AppLayout.jsx` rewritten — static clubhouse spine sidebar (never morphs), uses `useClubhouseContext()`, renders both new components; `App.jsx` — `ClubhouseProvider` added, `<Route path="/" element={<Navigate to="/clubhouse" replace />}>`; `ClubhouseScreen.jsx` — switched to `useClubhouseContext()`. Deleted `MultiSportHomeScreen.jsx`. Test infra fix: `playwright.config.js` added `channel: 'chrome'` (system Chrome) because `chromium_headless_shell-1217` binary is missing on this machine (headless shell install fails). Two `platform.spec.js` assertion fixes: `.first()` on strict-mode sidebar `getByText(/clubhouse/i)`, URL pattern `/\/(clubhouse)?$/` for 404 redirect test. **84/84 tests passing.** Key architecture note: `NavIcons.jsx` is imported both by `AppLayout` (depth 1) and `CompetitionScreenNav` (depth 2 via AppLayout) — safe because NavIcons is a leaf module (no local imports); Rolldown evaluates it first with no TDZ. Next: Phase B (entry unification + migration 216/217, requires Supabase-linked PC for DB actions).

**Session 2026-06-29:** v2 ← main sync (PRs #650–653, #658, #667, #668) — 3 merge conflicts resolved (BACKLOG.md header, MarketScreen Kit Light color kept, generate-frontpage-edition chat `is_deleted.is.null` bug fix taken). Full codebase audit confirmed all phases are feature-complete with no implementation gaps. Two Clubhouse nav bugs fixed (PR #669): (1) creating a Clubhouse bounced back to empty lobby — root cause was background `fetchMyCircles()` in `createCircle` racing with RLS visibility, returning empty, and calling `setActiveCircleId(null)` to wipe the optimistic state; fixed by removing the background fetch and guarding the `setActiveCircleId(null)` branch in `fetchMyCircles`; (2) The FrontRow had no sidebar entry — added sub-NavItem linking to `/clubhouse?tab=frontrow`; `ClubhouseScreen` now reads `?tab=` query param on mount. Next migration: `216_`.

**Session 2026-06-27/28 (docs):** Repo mine map — DOCS_INDEX.html expanded to full repo explorer (source code, backend, mobile sections + architecture clustered into 5 topic groups). TRACKER.md consolidated as single SOT: 11 gaps filled from scattered docs (4 missing HMAC deploy rows, F1 data migration, SEC-4 steps inline, OPS-2 detail, P2P load test, CODE-6, 2 product decisions). SALE_READY_PROJECT_PLAN.md archived (read-only history). PR #648 merged.

**Session 2026-06-28 (v2 sync + tennis test plan):** Vercel v2 build fixed via `.npmrc` `legacy-peer-deps=true` (PR #654 — madge@8.0.0 peer dep conflict). Tennis module test plan created at `docs/testing/TENNIS_MODULE_TEST_PLAN.md` with 13 scenarios across 5 modules + Wimbledon dry-run checklist (PR #655). v2 ← main sync: PRs #616/#622–624/#626/#630/#637/#650–653 merged via PR #656 — 1 conflict in MarketScreen.jsx resolved (v2 Kit Light color kept, main `clubEliminated` logic adopted). Incoming main migrations 192–194 renamed → 212–214 to avoid collision with existing v2 migrations. Next migration: `215_`.

**Session 2026-06-28 (Wimbledon dry run + auth bug fix):** Used Wimbledon 2026 (real tournament, started 2026-06-29) as a live dry run of the Tennis module per `docs/testing/TENNIS_MODULE_TEST_PLAN.md`. **Discovered `requireServiceRole()` (`_shared/auth.ts`) was unreachable in practice** for all 4 functions that import it (`sync-tennis-players`, `score-tennis-tournament`, `score-atp-finals`, `score-f1-race`) — neither its exact-match path (masked `sb_secret_...` keys) nor its legacy-JWT HMAC path (no `SUPABASE_JWT_SECRET` secret configured) could be satisfied by anything outside Supabase's own infra. Rows 5–7 above had been "deployed" in an earlier session but were never actually callable. Fixed in two PRs: **#662** added a third auth path — exact match against a new `ADMIN_TRIGGER_KEY` secret, additive only, scoped to these 4 functions (confirmed via grep no other function imports this module). **#663** fixed a second, separate blocker found immediately after #662 shipped: none of the 4 functions had a `supabase/config.toml` entry, so the API Gateway defaulted `verify_jwt=true` and rejected the non-JWT `ADMIN_TRIGGER_KEY` bearer token before the function code ran; added explicit `verify_jwt = false` for all 4, matching the existing `calculate-scores` pattern. **Rule for future admin-triggered functions:** `requireServiceRole` + `verify_jwt = false` in `config.toml` must always be added together — one without the other still 401s. After the fix: opened Wimbledon 2026 via `admin_open_tournament` (real RapidAPI `external_id=21337`, tournament row `9bf04949-49af-4d92-b523-3ba15757fba8`), synced the full 128-player R1 draw via `sync-tennis-players` in 1 API call (`pageSize=300`), confirmed correct tier breakdown `{T1:4, T2:12, T3:16, T4:96}` after deleting 2 stale placeholder player rows + 1 stale test roster that FK'd to them (pre-existing dev/test leftovers, not caused by this session — partial unique index on `external_player_id` doesn't dedupe NULL-keyed rows). Also added `VITE_AUTH_ENABLED=true` to Vercel Preview scoped to the `v2` git branch only (Production untouched) — Preview had been running in demo mode (no `VITE_AUTH_ENABLED` set there at all), which would have skipped real Supabase Auth/RLS checks during the dry run. Remaining: create test Player Box + submit real roster, run through scoring once Wimbledon results land. Full detail in `docs/testing/TENNIS_MODULE_TEST_PLAN.md`.

**Session 2026-06-28 (deploy catch-up, rows 1–9 + 12–15):** Rows 1–9 and 12–15 above applied/deployed from the Supabase-linked PC. **Unplanned find:** migration 208 (`coin_transactions_schema_v2`) had never actually run against production — 209 failed on first attempt with `column "currency" does not exist` because it assumed 208 was already live. Applied 208 first (approved), then 209. **Bug found in both 208 and 209:** the trailing `REVOKE ALL ON FUNCTION credit_coins FROM ...` was a bare reference with no arg-type list; once `CREATE OR REPLACE FUNCTION credit_coins(...)` introduced a 7-arg overload alongside prod's original 5-arg version, the bare `REVOKE` became ambiguous (`function name "credit_coins" is not unique`) and rolled back the whole transaction. Fixed by qualifying the `REVOKE` with the explicit 7-arg signature in both files; verified all existing 5-arg callers (`purchase-coins`, migrations 202/204/205) still resolve unambiguously. Fix merged via [PR #659](https://github.com/SMTCB/WCFantasyFootball/pull/659). Migration 210 (touches shared `public.users` table) was backed up first per the pilot-data safety rule — see `backups/users_pre_migration210_20260628_153715.json` (75 rows). Row 8 (`calculate-scores`) deploy preceded by a live-fixture check on tournaments 429/623 — confirmed empty before deploying. **Cleanup:** found and deleted an orphaned Edge Function (`slug: swift-responder`, actually an old `discover-tournament` deploy under the wrong slug) — the correctly-slugged `discover-tournament` was unaffected and remains active.

**Session 2026-06-28 (UX-3/5/7 + ARCH-1/2/3, PR #666):** Completed all 6 remaining dry-run items from the deferred table. **UX-3**: OnboardingWizard full Kit Light token pass — overlay var(--bg), card var(--card)/var(--rule), all near-white/dark rgba values replaced; also fixed undefined `var(--text)` → `var(--paper)`. **UX-5**: PitchView green field — `linear-gradient(#3d6e4a → #2a5035)` pitch surface, white `rgba(255,255,255,0.18)` lane lines and markings, depth-shading bands at 34/58/81%, outer container `var(--bg)`. **UX-7**: PaddockLobbyScreen `var(--ink)` → `var(--bg)`, header `var(--shell)` → `var(--card)`, tab strip background added. **ARCH-1**: Migration 215 committed — nullable `circle_id uuid REFERENCES circles(id)` added to leagues/paddocks/player_boxes, backfill from junction tables, `create_paddock`/`create_player_box` updated to write `circle_id` directly, new `create_league` 6-param overload with `p_circle_id DEFAULT NULL`; NOT yet applied to DB (requires Supabase-linked PC). **ARCH-2**: PaddockLobbyScreen CREATE tab — `get_my_circles` RPC on mount, `<select>` picker above name field (renders only when user has circles), `createPaddock(name, circleId)` call updated. **ARCH-3**: New Clubhouse step in OnboardingWizard — CREATE/JOIN toggle, name/code inputs, calls `create_circle`/`join_circle_by_code` RPCs, falls through on skip, inserted between welcome and squad steps; `clubhouseStepDone` key added to useOnboarding. All 6 items: lint clean, build clean (1.74s, 0 errors).

**Session 2026-06-28 (dry-run UX fixes, PR #665):** Tennis/platform dry run surfaced 7 UX/bug items. **Completed in this session (PR #665, merged into v2):** (1) **Clubhouse creation bug** — clicking Create cleared the form without showing the new clubhouse. Root cause: `fetchMyCircles()` inside `createCircle` set `loading=true`, which unmounted `ClubhouseLobby`, then remounted with blank form if RLS timing returned empty. Fix: optimistic state update adds the new circle to `myCircles` immediately; `fetchMyCircles` runs in the background without triggering the loading state. (2) **SCORES + LIVE merged** — SCORES tab removed from mobile nav; LIVE becomes the primary mobile tab (first position, no longer `desktopOnly`). `/scores` routes now redirect to `/live`. Desktop Football sub-nav "Scores" → "Live". LiveScreen gained a third mobile tab **FIXTURES** (alongside MY XI and POINTS) that fetches all matchday fixtures (`live` + `finished` + `scheduled`) and displays them with status indicator, scoreline, and kickoff time. (3) **The FrontRow** — ClubhouseScreen `FORZA TIMES` tab renamed to `THE FRONTROW`; RECAP cross-sport tab added; Tennis SportSection added to HOME tab. (4) **F1HomeScreen restructured** — CALENDAR | PADDOCKS two-section top bar; PADDOCKS section has 2×2 card grid (Championship Standings, Year Bets, Race Bets, Report) + ADMIN button in header + leaderboard preview; background uses `var(--bg)` Kit Light. **Remaining dry-run items deferred to dedicated sessions:** UX-2 (pitch view redesign), UX-3 (onboarding Kit Light), UX-5 (Clubhouse frontend validation gate), UX-7 (F1 harmonisation), ARCH-1–3 (Clubhouse-centric DB migration).

---

## ⚠️ Pending DB & Deploy Actions

> **APPROVAL GATE — read before running anything**
>
> Every row below writes to the **shared production Supabase project** (`sssmvihxtqtohisghjet`) — the same DB that serves the live pilot. Claude must:
> 1. State which specific row(s) it intends to run in plain language in chat.
> 2. Wait for explicit "yes, proceed" before executing. A prior approval does NOT carry over.
> 3. Never batch-run multiple rows on one approval.
>
> These must run from the **Supabase-linked PC only**.

| # | Status | Action | Command |
|---|--------|--------|---------|
| 1 | ✅ | Apply migration 209 — coin currency compliance | `npx supabase db query --linked --file supabase/migrations/209_coin_ledger_compliance.sql` |
| 2 | ✅ | Apply migration 210 — SEC-1 is_admin guard trigger | `npx supabase db query --linked --file supabase/migrations/210_guard_users_is_admin.sql` |
| 3 | ✅ | Apply migration 211 — MONEY-1 reference_id UNIQUE | `npx supabase db query --linked --file supabase/migrations/211_coin_reference_id_unique.sql` |
| 4 | ✅ | Deploy `score-f1-race` (SEC-2) | `npx supabase functions deploy score-f1-race --project-ref sssmvihxtqtohisghjet` |
| 5 | ✅ | Deploy `score-tennis-tournament` (SEC-2) | `npx supabase functions deploy score-tennis-tournament --project-ref sssmvihxtqtohisghjet` — deployed but **unreachable until 2026-06-28 auth fix**, see session note below |
| 6 | ✅ | Deploy `score-atp-finals` (SEC-2) | `npx supabase functions deploy score-atp-finals --project-ref sssmvihxtqtohisghjet` — same caveat as row 5 |
| 7 | ✅ | Deploy `sync-tennis-players` (SEC-2) | `npx supabase functions deploy sync-tennis-players --project-ref sssmvihxtqtohisghjet` — same caveat; confirmed working end-to-end 2026-06-28 after the fix |
| 8 | ✅ | Deploy `calculate-scores` (SEC-3) | `npx supabase functions deploy calculate-scores --project-ref sssmvihxtqtohisghjet` |
| 9 | ✅ | Set FRONTEND_URL secret (MONEY-1 CORS) | `npx supabase secrets set FRONTEND_URL=https://wc-fantasy-football.vercel.app --project-ref sssmvihxtqtohisghjet` |
| 10 | ⬜ | SEC-4: Rotate GitHub PAT + switch to SSH | **5 steps:** (1) Revoke current PAT in GitHub → Settings → Developer settings. (2) Generate a new PAT (SSH key preferred) with `repo` + `workflow` scopes only. (3) `git remote set-url origin https://<new-token>@github.com/SMTCB/WCFantasyFootball.git`. (4) Delete `supabase/.temp/` from git history if present. (5) Remove the "GitHub API Fallback" section in `CLAUDE.md` that embeds the token pattern. |
| 11 | ⬜ | Add `VITE_SENTRY_DSN` to Vercel (OPS-2 frontend) | Vercel dashboard → Settings → Env vars (Production only): `https://3d26f98051c484e03c58e2d32a260a89@o4511632696213504.ingest.de.sentry.io/4511632708927568` |
| 12 | ✅ | Deploy `discover-tournament` (Phase 1D-A HMAC fix) | `npx supabase functions deploy discover-tournament --project-ref sssmvihxtqtohisghjet` |
| 13 | ✅ | Deploy `sync-fixtures` (Phase 1D-A HMAC fix) | `npx supabase functions deploy sync-fixtures --project-ref sssmvihxtqtohisghjet` |
| 14 | ✅ | Deploy `sync-player-status` (Phase 1D-A HMAC fix) | `npx supabase functions deploy sync-player-status --project-ref sssmvihxtqtohisghjet` |
| 15 | ✅ | Deploy `sync-players` (Phase 1D-A HMAC fix) | `npx supabase functions deploy sync-players --project-ref sssmvihxtqtohisghjet` |
| 16 | ⬜ | F1 data migration — copy FantasyF1 DB contents into v2 tables | Manual — see [F1_MODULE_IMPLEMENTATION_PLAN.md](modules/F1_MODULE_IMPLEMENTATION_PLAN.md) → "Data Migration from FantasyF1" section. Requires Supabase-linked PC. |
| 17 | ✅ | Apply migration 216 — wire tennis into `get_clubhouse_competitions` | Applied 2026-06-29. `npx supabase db query --linked --file supabase/migrations/216_wire_tennis_competitions.sql` — replaces hardcoded `'[]'::json` tennis branch with live `circle_player_boxes` junction query. Pure function replace, zero data touched. |
| 18 | 🛑 **DO NOT RUN — see banner below** | Apply migration 217 — `circle_id NOT NULL` on leagues/paddocks/player_boxes | **Pre-flight run 2026-06-29 — orphans found, NOT cleared for apply.** `leagues`: 18 NULL rows (7 are real live pilot leagues: Mundial do Eder, Mundial Gordo Vai a Baliza, RANKS FC World Cup Fantasy, Draft Mundial 26, Munaial '26, FIXO DRAFT MUNDIAL 26, Miami WC Fantasy Testers; remaining 11 are test/E2E leftovers). `paddocks`: 1 NULL (`TEST_1_F1`, test only). `player_boxes`: 1 NULL (`TEST_WIMBLEDON_1`, test only). Snapshot saved: `backups/orphans_pre_217_20260629.json`. **User decision 2026-06-29: hold off entirely — do not run 217, do not touch any orphan rows (real or test) until there's a clubhouse-mapping plan for the 7 real leagues.** Do not re-attempt without a fresh explicit go-ahead that addresses those 7 leagues specifically. |
| 19 | ⬜ | Apply migration 219 — GDPR `delete_user_data` RPC (DATA-2) | `npx supabase db query --linked --file supabase/migrations/219_delete_user_data.sql` — **Pure DDL: creates the `delete_user_data(uuid)` function + grants only. Deletes zero rows from prod. The function only runs when explicitly called with a user's ID (e.g. on an account-deletion request) — applying this migration has no effect on any existing data.** No backup needed. |
| 20 | ⬜ | Deploy `purchase-coins` (OPS-2 logError, PR #698) | `npx supabase functions deploy purchase-coins --project-ref sssmvihxtqtohisghjet` |
| 21 | ⬜ | Deploy `discover-tournament` (OPS-2 logError, PR #698) | `npx supabase functions deploy discover-tournament --project-ref sssmvihxtqtohisghjet` |
| 22 | ⬜ | Deploy `sync-tennis-players` (OPS-2 logError, PR #698) | `npx supabase functions deploy sync-tennis-players --project-ref sssmvihxtqtohisghjet` |
| 23 | ⬜ | Deploy `score-atp-finals` (OPS-2 logError, PR #698) | `npx supabase functions deploy score-atp-finals --project-ref sssmvihxtqtohisghjet` |
| 24 | ⬜ | Deploy `score-f1-race` (OPS-2 logError, PR #698) | `npx supabase functions deploy score-f1-race --project-ref sssmvihxtqtohisghjet` |
| 25 | ⬜ | Deploy `score-tennis-tournament` (OPS-2 logError, PR #698) | `npx supabase functions deploy score-tennis-tournament --project-ref sssmvihxtqtohisghjet` |
| 26 | ⬜ | Apply migration 218 — LEGAL-1 `no_external_cash_out` constraint (PR #694) | `npx supabase db query --linked --file supabase/migrations/218_no_cash_out_constraint.sql` — **Pure DDL: renames the anonymous `coin_transactions` type-CHECK to a named constraint + adds table/constraint comments + a `DO $$..$$` audit assert that no existing row uses a cash-out type. No rows deleted/changed. Safe to bundle with row 19.** |

> ## 🛑🛑🛑 MIGRATION 217 — DO NOT RUN UNTIL THE WORLD CUP PILOT ENDS 🛑🛑🛑
>
> **`217_circle_id_not_null.sql` touches the SAME PRODUCTION DATABASE that runs the live World Cup pilot** (`sssmvihxtqtohisghjet` — there is no dev/staging split). The 18 orphan `leagues` rows it would lock down include **7 real, currently-active pilot leagues with real users mid-tournament** (Mundial do Eder, Mundial Gordo Vai a Baliza, RANKS FC World Cup Fantasy, Draft Mundial 26, Munaial '26, FIXO DRAFT MUNDIAL 26, Miami WC Fantasy Testers). Applying this `NOT NULL` constraint while those leagues have no `circle_id` will either fail outright or corrupt live pilot data mid-competition.
>
> **Rule: do not run this migration — and do not backfill/assign `circle_id` on any pilot league — until the World Cup pilot has ended (target ~July 2026, per [SALE_READY_PROJECT_PLAN.md](architecture/SALE_READY_PROJECT_PLAN.md) Week-12 gate) and an explicit clubhouse-mapping decision has been made for those 7 leagues.** This is not a "needs Supabase-linked PC" task — it is a deep-impact, pilot-blocking action. Any session that reaches this row should stop and flag it, not run it.

**Rows 10, 11, 16, 19–26 pending** — 10/11 are not Supabase actions; 16 blocked on source access; 19 + 26 are pure DDL (safe, no approval needed beyond "yes, run row N"); 20–25 are OPS-2 function deploys (each needs per-item approval). **Row 17 done. Row 18 — see 🛑 banner above, do not run.**

**Next migration on v2:** `220_`

**Session 2026-06-28 (migration 215 applied):** `215_clubhouse_centric_model.sql` applied to prod from the Supabase-linked PC (this session's local `v2` was 4 commits behind `origin/v2` — pulled first). Backed up `leagues`/`paddocks`/`player_boxes` id+name snapshots before running (`backups/*_pre_migration215_20260628_231738.json`). Verified: `circle_id` column live on all 3 tables (NULL on existing rows — no junction-table data to backfill yet); `create_league` 6-arg overload, `create_paddock` (2-arg), `create_player_box` (3-arg) all updated and present in `pg_proc`.

---

## Clubhouse-Centric Redesign Workstream

**Approved 2026-06-29 (full A–D). Design doc:** [architecture/CLUBHOUSE_CENTRIC_REDESIGN.md](architecture/CLUBHOUSE_CENTRIC_REDESIGN.md) (why/what). **Build plan:** [architecture/CLUBHOUSE_CENTRIC_REDESIGN_IMPLEMENTATION_PLAN.md](architecture/CLUBHOUSE_CENTRIC_REDESIGN_IMPLEMENTATION_PLAN.md) (phase-by-phase how, self-contained for dedicated sessions, 8-PR breakdown).

**Concept:** the Clubhouse is the room, sports are tables in it. Sidebar = clubhouse spine (never morphs); top bar = named competition tabs (sport-colored). Shared 3-tier spine: Tier 1 clubhouse surfaces (identical) → Tier 2 results header (same skeleton) → Tier 3 unit (sport divergence).

Sequenced so the *feel* changes first (Phase A) before deeper data/state work.

### Phase A — Shell & IA (frontend, no schema) ✅ Done — PR #671
- [x] Sidebar becomes the sport-agnostic clubhouse spine + clubhouse switcher; `activeSport`-driven nav swapping removed
- [x] Top bar = competition tabs (one per active competition in the clubhouse, sport-colored, named comps not sport categories); secondary strip for competition screens
- [x] `/` → `/clubhouse` redirect; `MultiSportHomeScreen` deleted (merged into ClubhouseScreen)
- [x] `ClubhouseProvider` singleton at app root; `ClubhouseContext` split to avoid Rolldown TDZ
- [x] `playwright.config.js` channel:chrome (system Chrome; chromium_headless_shell missing on this machine)
- [x] `platform.spec.js`: 84/84 passing

### Phase B — Entry unification + state/schema ✅ Done — PR #675 (2026-06-29)
- [x] Single "+ New competition" flow (`NewCompetitionFlow.jsx`) — portal modal, sport picker, per-sport create form, join-by-code; `+` button wired in `CompetitionTopBar`; self-portals to `document.body` (createPortal rule). Props-only design (no local hook imports from AppLayout's dep tree — TDZ safe)
- [x] `refreshCompetitions()` added to `useClubhouse` return — calls `fetchCircleData(activeCircleId)`; consumed in AppLayout to refresh top bar after create/join
- [x] Migration 216: wire tennis into `get_clubhouse_competitions` — applied 2026-06-29 (row 17)
- ➡️ `useActiveCompetition()` location model collapse — **carried into Phase C** (no blocker, just sequencing)
- 🛑 Migration 217: `circle_id NOT NULL` — **blocked until World Cup pilot ends** — see row 18 banner (7 live pilot leagues have no `circle_id`; applying the constraint now would require a pilot-impacting backfill decision)

### Phase C — Shared spine template ✅ Done — PR #676 (2026-06-29)
- [x] `useActiveCompetition()` location model collapse — `{sport, competitionId}` from pathname; `SportContext.activeSport` removed entirely
- [x] Extract `CompetitionResultsHeader` (Tier 2) as one shared component (`src/components/competition/CompetitionResultsHeader.jsx`)
- [x] Adopted in football (`LeagueDetailView` desktop standings), F1 (`F1StandingsScreen`), tennis (`TennisLeaderboardScreen`)

### Phase D — Taxonomy & polish ✅ Done — PR #677 (2026-06-29)
- [x] Naming pass: "Clubhouse" everywhere (retire "My Group"/"circle" in UI); "Competition" on shared surfaces
- [x] Competition card visual treatment from the reference mock (sport-coloured top bar + pill badge, member avatar strip, stats panel)

---

## Mobile-First Redesign Workstream

**Assessment validated 2026-06-30. Design doc:** [architecture/MOBILE_FIRST_REDESIGN.md](architecture/MOBILE_FIRST_REDESIGN.md) (why/what). **Build plan:** [architecture/MOBILE_FIRST_REDESIGN_IMPLEMENTATION_PLAN.md](architecture/MOBILE_FIRST_REDESIGN_IMPLEMENTATION_PLAN.md) (phase-by-phase how).

**Concept:** below `lg` the thumb is the primary input, the deadline is the primary message, and one card-based, sheet-driven pattern language is the only way to render. Root cause diagnosed: mobile quality is *accidental* — the good patterns exist in the mature football screens (Tier A: SquadScreen/LiveScreen/LeagueDetailView) but were never extracted into reusable primitives, so newer multi-sport screens reinvented (Tier B: mobile-first column) and the P2P/Trophy screens regressed to desktop-first (Tier C: broken at 375px). Fix = define + build the mobile pattern-language primitives once, then route every screen through them. **Scope: sub-`lg` only.**

Sequenced worst-breakage-first, highest-leverage shared component early.

### Phase M0 — Foundations (primitives + token fixes) ✅ Done — PR #684, content re-landed via #685 (2026-06-30)
> **Correction (2026-07-01 audit):** PRs #682/#683 were false-positive "merged" reports and never landed on v2 — their content (useViewport, tokens, safe-area) was re-landed via **PR #685 ("M0 recovery")**. #682/#683 have been closed as superseded. **One item did NOT survive the recovery:** the shared `<BottomSheet>` primitive (#683) was never built — see the struck-through line below. No code is broken (the two sheets portal standalone), but the "one consolidated primitive" doesn't exist yet.
- [x] `useViewport()` / `useIsMobile()` hook — re-landed PR #685 (`src/hooks/useViewport.js`)
- [x] Define `--f1`/`--ten`/`--f1bg`/`--tenbg` tokens; fix `--r-sm`/`--r-md` skeleton mismatch; add `env(safe-area-inset-top)` to the sticky mobile top bar — re-landed PR #685 (`src/index.css`, `AppLayout.jsx`)
- [ ] ~~Consolidate the **one** `<BottomSheet>` (portaled, safe-area, Kit Light) — `ActionSheet` + `PlayerPickerSheet` migrated~~ **NOT BUILT** — `src/components/shared/BottomSheet.jsx` does not exist; #683 (which introduced it) never merged and #685's recovery omitted it. `ActionSheet.jsx` + `PlayerPickerSheet.jsx` each `createPortal` directly onto the `.fk-mob-sheet-*` CSS classes and work fine standalone. Extracting the shared React primitive is now backlog item **M0-BOTTOMSHEET** (see [Phase 3 DD](#phase-3--before-sale-close)) — a nice-to-have, not a bug.
- [x] Build `<PrimaryActionBar>`/FAB primitive + `CompetitionResultsHeader` card-mode scaffolding — PR #684 (`src/components/shared/PrimaryActionBar.jsx`, `CompetitionResultsHeader.jsx`)

### Phase M1 — The shared spine on mobile ✅
- [x] Wire `CompetitionResultsHeader` card-mode at consumers (Football/F1/Tennis standings) — `useIsMobile` real import; `leadColumnKey="total"` per sport — PR #685
- [x] Kill the Tennis 14-column horizontal `<table>` — `hidden lg:block` / `lg:hidden` chip-card split — PR #685
- [x] Collapsing `<TabStrip>` for Clubhouse (8-tab) + League (`HubTabPills` 6-pill) — `src/components/shared/TabStrip.jsx`; Clubhouse `flex:1` → scrollable underline; League delegates to TabStrip pill variant — PR #686

**M0 recovery (PRs #682/#683 content re-landed in PR #685):** `useViewport.js`, `--f1`/`--ten` tokens, `.safe-top`/`.pt-safe`, AppLayout iOS notch padding.

### Phase M2 — Fix the broken screens (Tier C) ✅ Done — PR #687 (2026-06-30)
- [x] `ChallengeScreen` mobile DOM — sidebar folds inline above challenges, ⚔ New Challenge to PrimaryActionBar in thumb zone, Sent+Live grid stacks, page scrolls naturally
- [x] `TrophyCabinetScreen` mobile DOM — dark header stats wrap, sport grid auto-fill collapses to 1-col, sidebar folds inline, Export button moved to body with ≥44px touch target

### Phase M3 — Primary-action pass ✅ (PR #688)
- [x] Surface the deadline countdown on mobile — `windowKpi` was `hidden lg:block` on SquadScreen; now shown via `<PrimaryActionBar>` with state-aware accent colour (green/amber/red)
- [x] Fix MarketScreen transfer basket on mobile — was anchored at `bottom:0`, hidden behind 64px nav; now `calc(64px + env(safe-area-inset-bottom))` on mobile

### Phase M4 — Parity & polish ✅ (PR #689)
- [x] 44px tap-target sweep — RecapView MatchdayNav, SquadScreen action sheet, MarketScreen per-row buttons (all six variants)
- [x] `PlayerPickerSheet` `createPortal` fix + Kit Light token pass (was rendering inside WebkitOverflowScrolling scroll container — fixed to portal to body)
- [x] Tablet tier — `@media (640–1023px)` in index.css: bottom sheets capped 520px + centred; `fk-competition-grid` class; competition card grid naturally 2-col via existing `auto-fill minmax(240px,1fr)`
- [x] MarketScreen `mobile DOM` — per-row button heights fixed to 44px; progressive disclosure of full header deferred (existing `auto-fill` header is acceptable; full BottomSheet filter rewrite is a future P3 item)

> **Deferred follow-up (NOT in this workstream):** [UX-DESKTOP-1](#phase-3--before-sale-close) — the Tier B multi-sport screens (Clubhouse/F1/Tennis) render as a narrow centred ribbon on desktop (they're mobile-first columns that don't scale *up*). This is the inverse of mobile optimization and would mean editing desktop DOM, so it's logged in the Phase 3 DD table for a later, separate decision. Captured here so it isn't lost.

---

## Phase 3B Pre-Merge Checklist

These must all be green before opening the v2 → main PR.

### Smoke Tests
- [ ] `platform.spec.js` green on v2 (84 tests × 1 browser) — last confirmed 84/84 on 2026-06-29
- [ ] Football smoke pass: login → squad → transfer → league → live → recap
- [ ] P2P smoke pass: create wallet → purchase test coins (`MOCK_PAYMENTS=true`) → create challenge → resolve
- [ ] F1 smoke pass: create paddock → submit picks → enter test result → verify scores
- [ ] Tennis smoke pass: submit picks → enter result → verify scores
- [ ] `npx madge --circular src/` — no new cycles

### Final Steps (do last, in order)
- [ ] Phase 1D-B: generate `000_baseline.sql` schema snapshot (on hold until schema settled)
- [ ] Merge `main` into `v2` one final time (pick up any last pilot fixes)
- [ ] Apply all pending DB actions (rows 1–16 in table above)
- [ ] Run `platform.spec.js` one final time after the merge

### Deploy Sequence
- [ ] Open PR: `v2` → `main`
- [ ] Review diff — confirm no football data or auth paths broken
- [ ] Merge PR (squash)
- [ ] Vercel auto-deploys → verify deployment succeeds
- [ ] Post-deploy pilot smoke: login with a real pilot user, verify squad/points intact
- [ ] Deploy ALL Edge Functions manually:
  ```bash
  npx supabase functions deploy calculate-scores discover-tournament sync-fixtures sync-players sync-player-status ingest-match-events generate-frontpage-edition purchase-coins score-f1-race score-tennis-tournament score-atp-finals sync-tennis-players score-f1-race --project-ref sssmvihxtqtohisghjet
  ```
- [ ] Verify all crons running: `SELECT jobname, schedule, active FROM cron.job ORDER BY jobname;`

---

## Dry Run Feedback — UX / Product Items

Captured 2026-06-28 during Tennis dry run. These are the open items from that session's feedback.

### Completed
| Item | Description | Status | PR |
|------|-------------|--------|----|
| BUG-1 | Clubhouse creation bug (click Create → screen clears, nothing created) | ✅ Done | #665 |
| UX-1 | "The FrontRow" — Gazette renamed, moved to Clubhouse nav; RECAP cross-sport tab added | ✅ Done | #665 |
| UX-2 | RECAP moved to Clubhouse level (cross-sport tab in ClubhouseScreen) | ✅ Done | #665 |
| UX-4 | Football SCORES tab merged into LIVE tab — LIVE is primary mobile tab; FIXTURES sub-tab added to LiveScreen | ✅ Done | #665 |
| UX-6 | F1 nav restructured: CALENDAR / PADDOCKS top-bar sections; 2×2 card grid; ADMIN in header | ✅ Done | #665 |

### Completed (this session — PR #666)
| Item | Description | Status | PR |
|------|-------------|--------|----|
| UX-3 | OnboardingWizard Kit Light — all dark inline colours replaced with var(--bg)/var(--card)/var(--paper)/var(--rule)/var(--mute) tokens | ✅ Done | #666 |
| UX-5 | PitchView green field — linear-gradient green surface, white lane lines, depth bands, outer bg var(--bg) | ✅ Done | #666 |
| UX-7 | PaddockLobbyScreen Kit Light — var(--ink)/var(--shell) → var(--bg)/var(--card); tab strip background added | ✅ Done | #666 |
| ARCH-1 | Migration 215 — circle_id FK (nullable) on leagues/paddocks/player_boxes; backfill from junction tables; create_paddock + create_player_box write circle_id directly; new create_league 6-param overload | ✅ Code done — DB apply pending Supabase-linked PC | #666 |
| ARCH-2 | Clubhouse picker in PaddockLobbyScreen CREATE tab — get_my_circles RPC, select dropdown, wired to createPaddock circleId param | ✅ Done | #666 |
| ARCH-3 | OnboardingWizard Clubhouse step — create/join flow (create_circle / join_circle_by_code RPCs) inserted between welcome and squad steps | ✅ Done | #666 |

### Product vision note (2026-06-28)
The overarching goal is for this to feel like **a place where friends gather to watch sports together**, not a "fantasy sports frankenstein". The Clubhouse is the central, most distinctive element. Every sport module (Football, F1, Tennis) should feel like an activity that happens *within* a Clubhouse — not a separate product stitched together. This should inform every design decision: navigation, naming, onboarding, and how competitions are created and discovered.

---

## Remaining DD Items

From [TECHNICAL_DUE_DILIGENCE.md](due_diligence/TECHNICAL_DUE_DILIGENCE.md). Sequenced by phase.

### Phase 1 — Complex, currently deferred
| Item | Description | Effort |
|------|-------------|--------|
| DATA-1 | PII audit — map all columns storing PII, add `pg_audit` event logging | ~4h |
| OPS-1 | Structured logging — replace ad-hoc `console.log` in Edge Functions with a uniform `log(level, msg, context)` helper | ~3h |

### Phase 2 — Post-3B, before buyer demos
| Item | Description | Effort | Status |
|------|-------------|--------|--------|
| TEST-1 | ~~Coverage metrics — integrate Vitest + `@vitest/coverage-v8`~~. **B2 delivered instead:** RPC regression test harness (`tests/unit/`) with Node built-in runner + ephemeral Postgres; 13 test cases across transfer/bet/coins. Activates fully once Phase A1 produces `supabase/schema.sql`. | ~6h | ✅ Done (PR #694) |
| DATA-2 | GDPR deletion RPC — `delete_user_data(p_user_id)` cascades PII columns; admin-only | ~3h | ✅ Code done (PR #697). **⚠️ Migration NOT yet applied to prod** — `supabase/migrations/219_delete_user_data.sql` written but the function does not exist in the DB until row 19 in the pending table is run. Safe to apply (pure DDL, no data touched). |
| DATA-3 | Data classification doc — label each table column (PII / financial / game data / public) | ~2h | ✅ Done — [`DATA_CLASSIFICATION.md`](due_diligence/DATA_CLASSIFICATION.md) (PR #697) |
| CODE-3 | Error boundaries — `ErrorBoundary` wrapper on each major screen; fallback UI + Sentry capture | ~2h | ✅ Done (PR #695) |
| OPS-2 | Sentry for Edge Functions (frontend DSN deployed via row 11): (a) add Deno Sentry SDK to each Edge Function; (b) wire `edge_function_error_log` into alert path; (c) add failed-cron threshold alerting (≥3 consecutive failures → alert) | ~4h | ✅ Code done (PR #698). **⚠️ 6 function deploys + `SENTRY_DSN` Supabase secret + Vercel `VITE_SENTRY_DSN` (rows 11, 20–25) still pending approval.** Failed-cron alerting (part c) not yet built. |
| P2P-LOAD | Load test — 50 concurrent P2P challenges to verify coin ledger atomicity under contention. Deferred from Sprint P2P-6. Requires `MOCK_PAYMENTS=true` environment. | ~2h | ⬜ |

### Phase 3 — Before sale close
| Item | Description |
|------|-------------|
| CODE-2 | TypeScript migration — convert `src/lib/`, `src/hooks/`, `src/context/` to `.ts`/`.tsx` |
| CODE-4 | Component tests — Storybook or Playwright component tests for the 5 most complex components |
| CODE-5 | Analytics instrumentation — replace stub `// TODO` in `src/hooks/useOnboarding.js:36` with Mixpanel/PostHog/Amplitude; all key flows (onboarding, draft, transfer, bet) tracked |
| DEPS-2 | Supply chain hardening — `npm ci` with `--ignore-scripts`; `package-lock.json` integrity hash |
| INFRA-1 | Multi-region readiness — document Supabase region selection rationale; buyer can migrate |
| LOW-2 | Storybook or Ladle component catalogue |
| LOW-3 | API rate-limit headers (429 with `Retry-After`) on all Edge Functions |
| LOW-6 | Mobile push notifications (Capacitor + FCM/APNs) |
| LOW-9 | Accessibility audit (WCAG 2.1 AA minimum) |
| CODE-6 | Consolidate shared UI primitives (`LivePill`, `DeltaPill`, `LeagueChip`, `MiniTok`) into `src/components/shared/` — currently duplicated across Football/F1/Tennis screens |
| M0-BOTTOMSHEET | Extract the shared `<BottomSheet>` primitive (portaled, safe-area, Kit Light) that Mobile M0 intended but never landed — `ActionSheet.jsx` + `PlayerPickerSheet.jsx` currently `createPortal` onto the `.fk-mob-sheet-*` CSS classes independently. Nice-to-have DRY cleanup, not a bug. Pairs with CODE-6. Surfaced 2026-07-01 audit. |
| UX-DESKTOP-1 | **Tier B desktop scale-up** — the multi-sport screens (Clubhouse, all F1, all Tennis) are mobile-first columns capped at `maxWidth: 480–700px`, so on a wide desktop they render as a narrow centred ribbon that wastes the screen. The inverse of the [Mobile-First Redesign](architecture/MOBILE_FIRST_REDESIGN.md) (which is sub-`lg` only). Give these screens proper desktop layouts (multi-column / use the width). Surfaced 2026-06-30 during the mobile assessment; deferred as a separate, future decision. |
| GDPR-1 | **Groq DPA / data-minimisation** — `generate-frontpage-edition` sends league + chat-excerpt data to Groq. Flagged in [`DATA_CLASSIFICATION.md`](due_diligence/DATA_CLASSIFICATION.md) as needing a DPA review or data-minimisation before any real-PII launch. Business/legal + possible code (minimise the payload). Surfaced 2026-07-01. |
| GDPR-2 | **Data portability (Right to Access/Portability)** — no export endpoint exists; `DATA_CLASSIFICATION.md` marks Access (`GET /api/me`) and Portability as "future". Build a user-data export (JSON) covering the same tables `delete_user_data` touches. Surfaced 2026-07-01. |
| GDPR-3 | **Objection automation** — Right-to-Object is currently a manual flow per `DATA_CLASSIFICATION.md`; no automation. Low priority; document the manual process or automate. Surfaced 2026-07-01. |

---

## Open Product Decisions

These require a human decision before the relevant sprint can continue.

| Decision | Blocks | Status |
|----------|--------|--------|
| Staging environment — second Supabase project for buyer demos | Phase 3A (noted), buyer demos | ⬜ Not decided |
| Meta-league scoring formula (trophy count vs Olympic points vs hybrid) | Phase 3B leaderboard | ⬜ Deferred — ledger built, formula is a swappable function |
| Non-playing member UX (user in Clubhouse with no leagues) | Clubhouse empty state | ⬜ Needs design |
| F1 scoring weights (pts per correct round pick) | F1 admin scoring | ⬜ Not decided (F1-4 deferred) |
| Clubhouse admin responsibility scope | CH-8 follow-up | ⬜ Will surface during next Clubhouse iteration |
| **Clubhouse-centric model** — every sport element (league, paddock, player box) must belong to a Clubhouse; only Clubhouse admins can create them | ARCH-1/2/3 | ✅ **Decided 2026-06-28** — implement via migration 215 in next dedicated session; frontend-only validation added as bridge |
| The FrontRow — Gazette is rebranded "The FrontRow", lives at Clubhouse level in nav (below My Group) | UX-1 | ✅ **Decided 2026-06-28** |
| Stripe account confirmation | P2P Sprint P2P-2 completion | ⬜ Business decision — zero code changes needed when ready |
| Football competition expansion — EPL, Champions League, La Liga (~3–5 weeks to seed per competition) | Phase 4+ revenue & retention | ⬜ Product decision — which competitions, which season, priority order |
| Forza API licence transferability — confirm commercial terms transfer on acquisition; an unresolved dependency materially caps the sale price | Sale close / buyer diligence | ⬜ Business/legal — no code changes needed, but needs a written confirmation |

---

## Module Status Summary

| Module | Screens | Hooks | DB (migrations) | Edge Functions | Status |
|--------|---------|-------|----------------|----------------|--------|
| **Football** | 11 screens | 10 hooks | 191 migrations (main) | `calculate-scores`, `process-transfer`, `process-trade`, `update-player-status`, `handle-chat-notifications`, `generate-frontpage-edition` | ✅ Live on main |
| **Clubhouse** | `ClubhouseScreen` + tabs | `useClubhouse`, `useClubhouseChat`, `useDirectMessages`, `useClubhouseFrontpage` | Migrations 188, 193–196 (v2) | `generate-frontpage-edition` (extended) | ✅ v2 only |
| **P2P Betting** | `WalletScreen`, `ChallengeScreen` | `useWallet`, `useChallenges` | Migrations 202–207 (v2) | `purchase-coins`, `resolve-p2p-challenges` | ✅ v2 only — Stripe plug-in ready |
| **F1** | 7 screens | `usePaddock`, `useF1Bets`, `useF1Standings` | Migrations 190–192 (v2) | `score-f1-race` | ✅ v2 only — deploy pending |
| **Tennis** | 7 screens | `usePlayerBox`, `useTennisCalendar`, `useTennisTournament`, `useTennisLeaderboard`, `useAtpFinalsPicks` | Migrations 197–201 (v2) | `score-tennis-tournament`, `score-atp-finals`, `sync-tennis-players` | ✅ v2 only — deploy pending |

---

## Key Documents

| Purpose | File |
|---------|------|
| **THIS FILE** — all open activities, pending deploys, DD items, product decisions | `TRACKER.md` ← you are here |
| Sprint history (read-only archive) | [SALE_READY_PROJECT_PLAN.md](../../docs/archive/session-audits/SALE_READY_PROJECT_PLAN.md) — moved to archive 2026-06-27; do not update |
| Buyout assessment (what an acquirer tests) | [B2B_BUYOUT_TECHNICAL_DUE_DILIGENCE.md](architecture/B2B_BUYOUT_TECHNICAL_DUE_DILIGENCE.md) |
| DD remediation detail (SEC-/DATA-/CODE- full specs + file paths) | [TECHNICAL_DUE_DILIGENCE.md](due_diligence/TECHNICAL_DUE_DILIGENCE.md) — item IDs mirror this tracker; go here for acceptance criteria |
| Tech documentation for buyers | [TECH_DOCUMENTATION.md](due_diligence/TECH_DOCUMENTATION.md) |
| Executive tech briefing (short) | [TECH_OVERVIEW.md](due_diligence/TECH_OVERVIEW.md) |
| Valuation framework + negotiation levers (🔒 **INTERNAL ONLY** — has target price/floor; never share with valuers/buyers) | [VALUATION_ANALYSIS.md](due_diligence/VALUATION_ANALYSIS.md) |
| **Platform brief for independent valuation** (🤝 **shareable** — functional + technical, price-free, for handing to a valuer/expert) | [PLATFORM_VALUATION_BRIEF.md](due_diligence/PLATFORM_VALUATION_BRIEF.md) |
| P2P betting data model + security | [P2P_BETTING_SYSTEM_DESIGN.md](architecture/P2P_BETTING_SYSTEM_DESIGN.md) |
| Multi-sport platform architecture | [MULTI_SPORT_PLATFORM_ARCHITECTURE.md](architecture/MULTI_SPORT_PLATFORM_ARCHITECTURE.md) |
| Football competition expansion roadmap | [MULTI_SPORT_EXPANSION.md](modules/MULTI_SPORT_EXPANSION.md) |
| F1 module — full spec + data migration notes | [F1_MODULE_IMPLEMENTATION_PLAN.md](modules/F1_MODULE_IMPLEMENTATION_PLAN.md) |
| Tennis module — full spec (authoritative) | [TENNIS_MODULE_IMPLEMENTATION_PLAN.md](modules/TENNIS_MODULE_IMPLEMENTATION_PLAN.md) |
| Design system tokens + screen handoffs | [design/](design/) |
| v2 branch rules (what must NOT merge) | [V2_BRANCH_PROTECTION.md](architecture/V2_BRANCH_PROTECTION.md) |
| Claude Code session instructions | [CLAUDE.md](../../CLAUDE.md) |
| Football pilot session log (completed PRs, bugs) | [BACKLOG.md](../../BACKLOG.md) |

---

## Cross-Cutting Rules (Every Sprint)

1. **Migrations are append-only.** Next free number on v2: `220_`. Never edit an applied migration.
2. **Backup before every migration.** Docker unavailable — `SELECT` affected rows and save to `backups/*.json` first.
3. **Football stays green.** `platform.spec.js` + manual smoke pass after any sprint touching shared infrastructure.
4. **Value moves only through `SECURITY DEFINER` RPCs.** Clients never write directly to coin or budget columns.
5. **All non-ASCII in SQL via `chr()`.** Windows encoding corrupts literal emoji/arrows — see migration 154.
6. **`gazette_entry_type` new values require `ALTER TYPE ... ADD VALUE IF NOT EXISTS`** + registration in `ENTRY_META` in `LeagueDetailView.jsx`.
7. **All modals/bottom-sheets use `createPortal(node, document.body)`.** `AppLayout#main-content` breaks `position:fixed`.
8. **Never `.catch()` on a Supabase query builder** — use `.then(null, handler)`.
9. **Rolldown TDZ rule:** grep before adding any import to a child of a large screen. Run `npm run build` before merging.
10. **Stripe keys are Edge Function secrets only** — never `VITE_`-prefixed, never in git.
11. **Edge Functions are NOT auto-deployed by Vercel** — manually deploy after every PR touching `supabase/functions/`.

---

**Session 2026-06-30 (Mobile-First Redesign — assessment + plan):** Mobile/tablet UX assessment mirroring the Clubhouse exercise. Four parallel survey agents mapped the current sub-`lg` reality across the shell, football screens, multi-sport screens, and design system. Diagnosed three tiers with no shared contract: **Tier A** (SquadScreen/LiveScreen/LeagueDetailView) is genuinely mobile-adapted (dedicated `lg:hidden` DOM, card rows, portaled bottom sheets — the quality bar); **Tier B** (Clubhouse/F1/Tennis) is mobile-first columns that don't scale up (desktop = stretched phone); **Tier C** (ChallengeScreen/TrophyCabinetScreen) is desktop-first with a fixed 256px sidebar, **broken at 375px**. Root cause: mobile quality is *accidental* — good patterns never extracted into reusable primitives, so `CompetitionResultsHeader` (the Phase-C shared component) propagates a desktop dense-grid to all 3 sports' mobile standings; no `useViewport` hook; binary `lg:` (1024px) split, no tablet tier; `--f1`/`--ten` tokens referenced-but-undefined; no top safe-area inset; two divergent bottom-sheet impls; no FAB anywhere. Fix = an 8-primitive mobile pattern language + 5-phase delivery (M0 foundations → M1 shared spine → M2 fix broken screens → M3 primary-action pass → M4 parity/polish), worst-breakage-first, **sub-`lg` scope only**. User validated the assessment; Tier B desktop-ribbon logged as UX-DESKTOP-1 (Phase 3 DD, separate future decision). Two docs written, **no code touched**: [MOBILE_FIRST_REDESIGN.md](architecture/MOBILE_FIRST_REDESIGN.md) + [MOBILE_FIRST_REDESIGN_IMPLEMENTATION_PLAN.md](architecture/MOBILE_FIRST_REDESIGN_IMPLEMENTATION_PLAN.md). Next: Mobile Phase M0.

**Session 2026-06-30 (Mobile-First Redesign — Phase M0 implementation):** All Phase M0 foundation primitives shipped in 3 sequential PRs into `v2`. PR #682: `src/hooks/useViewport.js` (`useViewport`/`useIsMobile` hook, SSR-safe matchMedia); `--f1`/`--ten`/`--f1bg`/`--tenbg` tokens defined in `index.css` (8+ components were referencing them undefined); `--r-sm`/`--r-md` skeleton alias fixed; `env(safe-area-inset-top)` added to the sticky mobile top bar in `AppLayout`. PR #683: `src/components/shared/BottomSheet.jsx` (portaled thin shell over `.fk-mob-sheet-*` CSS); `ActionSheet` migrated to use it; `PlayerPickerSheet` rewritten to use `<BottomSheet>` + full Kit Light token pass. PR #684: `src/components/shared/PrimaryActionBar.jsx` (thumb-zone FAB portaled to `document.body`, hidden on desktop via `lg:hidden`, state-aware props); `CompetitionResultsHeader.jsx` mobile card-mode branch added (`leadColumnKey` prop, private `useIsMobile` hook, card layout < 640px, desktop grid pixel-identical). All 3 PRs: lint 0 errors, Rolldown TDZ build clean, madge 0 circular deps. Next: **Mobile Phase M1** — wire `CompetitionResultsHeader` card-mode at Football/F1/Tennis consumer screens; kill Tennis 14-column table; collapsing TabStrip.

Last Updated: **2026-07-01** (Docs audit + DD-doc consolidation: 5 stale V1 DD docs archived to `docs/archive/superseded-dd-2026-06-30/`, `_V2` docs promoted to canonical names + committed, all cross-links repaired; Clubhouse plan Phase D + P2P open-decisions status refreshed; GDPR-1/2/3 added to Phase 3 DD backlog; **▶️ Execution Queue added at top** (open items tagged by machine); DD backlog + impl plan synced with #697/#698; DATA-2 ID collision resolved → reconciliation task renamed DATA-RECON. **Audit pass 3:** verified all pending Supabase actions map to their originating item (added migration 218/LEGAL-1 as pending row 26); closed stale never-merged PRs #682/#683 (superseded by #685 M0 recovery); corrected Phase M0 record — the `<BottomSheet>` primitive was never built (logged as backlog M0-BOTTOMSHEET; no code broken). Earlier same day: OPS-2 logError code done — PR #698; CODE-3 — PR #695; A2+BUILD-1+C3+B2 — PR #694; DATA-2 migration `219_delete_user_data.sql` written, apply pending row 19; DATA-3 `DATA_CLASSIFICATION.md` written. Next migration: 220_. Next: OPS-2 remaining deploys/secret, P2P-LOAD, or Phase 3B smoke tests.)
