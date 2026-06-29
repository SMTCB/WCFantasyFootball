# Platform Revision — Central Tracker

**Read this at the start of every v2 session. Everything that is open, pending, or blocked lives here.**

> **Goal:** ship a multi-sport platform (Football + F1 + Tennis + P2P betting) that can be presented to a buyer with all features implemented — not on a roadmap. Target buyout score: **8/10**.
>
> **Branch:** `v2` — not deployed until Week 12. Live pilot runs on `main` and is completely untouched.
>
> **Detailed sprint history (archived):** [SALE_READY_PROJECT_PLAN.md](../../docs/archive/session-audits/SALE_READY_PROJECT_PLAN.md) — read-only historical record of all sprint notes, architecture decisions, and task breakdowns. **This file is no longer updated.** All open activities live in this TRACKER.

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

**Next session options (choose one):**
- **Phase 3B smoke tests** → deploy sequence — see [Phase 3B checklist](#phase-3b-pre-merge-checklist) below
- **DD items** — TEST-1 (Vitest coverage), CODE-3 (error boundaries), OPS-2 (Sentry)
- **Row 11** — Add `VITE_SENTRY_DSN` to Vercel (can be done from any machine)

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

**Rows 10, 11, 16 deferred** — not Supabase actions (10/11) or blocked on source access (16). Pick up in a future session.

**Next migration on v2:** `216_`

**Session 2026-06-28 (migration 215 applied):** `215_clubhouse_centric_model.sql` applied to prod from the Supabase-linked PC (this session's local `v2` was 4 commits behind `origin/v2` — pulled first). Backed up `leagues`/`paddocks`/`player_boxes` id+name snapshots before running (`backups/*_pre_migration215_20260628_231738.json`). Verified: `circle_id` column live on all 3 tables (NULL on existing rows — no junction-table data to backfill yet); `create_league` 6-arg overload, `create_paddock` (2-arg), `create_player_box` (3-arg) all updated and present in `pg_proc`.

---

## Phase 3B Pre-Merge Checklist

These must all be green before opening the v2 → main PR.

### Smoke Tests
- [ ] `platform.spec.js` green on v2 (84 tests × 1 browser) — last confirmed 84/84 on 2026-06-23
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
| Item | Description | Effort |
|------|-------------|--------|
| TEST-1 | Coverage metrics — integrate Vitest + `@vitest/coverage-v8`; target 60% line coverage on hooks and RPCs | ~6h |
| DATA-2 | GDPR deletion RPC — `delete_user_data(p_user_id)` cascades PII columns; admin-only | ~3h |
| DATA-3 | Data classification doc — label each table column (PII / financial / game data / public) | ~2h |
| CODE-3 | Error boundaries — `ErrorBoundary` wrapper on each major screen; fallback UI + Sentry capture | ~2h |
| OPS-2 | Sentry for Edge Functions (frontend DSN deployed via row 11): (a) add Deno Sentry SDK to each Edge Function; (b) wire `edge_function_error_log` into alert path; (c) add failed-cron threshold alerting (≥3 consecutive failures → alert) | ~4h |
| P2P-LOAD | Load test — 50 concurrent P2P challenges to verify coin ledger atomicity under contention. Deferred from Sprint P2P-6. Requires `MOCK_PAYMENTS=true` environment. | ~2h |

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
| Valuation framework + negotiation levers | [VALUATION_ANALYSIS.md](due_diligence/VALUATION_ANALYSIS.md) |
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

1. **Migrations are append-only.** Next free number on v2: `215_`. Never edit an applied migration.
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

Last Updated: **2026-06-28** (PR #666: UX-3/5/7 + ARCH-1/2/3 complete; migration 215 committed, pending DB apply; next migration `216_`)
