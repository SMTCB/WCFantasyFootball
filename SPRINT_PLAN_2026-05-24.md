# Consolidated Correction Plan — Sprint Allocation
**Date:** 2026-05-24 (updated 2026-05-24 with Draft + Relaxation + Observability findings)
**Total findings:** ~310 across five audits.

## How to read this document

- Each item is referenced by its **ID** from one of the source audits:
  - **SEC-** / **DATA-** / **DEPLOY-** / **FRONT-** / **LOW-** → [`CODE_AUDIT_2026-05-24.md`](CODE_AUDIT_2026-05-24.md)
  - **L1.x** / **L2.x** / **L3.x** / **L4.x** / **L5.x** (draft) / **L6.x** (relaxation) → [`LOGIC_AUDIT_2026-05-24.md`](LOGIC_AUDIT_2026-05-24.md)
  - **I1-I5**, **2.x.y**, **3.x** → [`INGESTION_AUDIT_2026-05-24.md`](INGESTION_AUDIT_2026-05-24.md)
  - **U1-U120** → [`UI_AUDIT_2026-05-24.md`](UI_AUDIT_2026-05-24.md)
  - **O1-O5** → [`OBSERVABILITY_STRATEGY_2026-05-24.md`](OBSERVABILITY_STRATEGY_2026-05-24.md)
- When you pick up an item, open the source audit, find the ID, and follow the fix + test steps documented there.

## Prioritization mindset

> **What prevents shipping to test users, or breaks within days of release?**

The plan is ordered so each sprint either (a) removes a release blocker or (b) closes a path that turns into a production fire fast. Polish and hygiene come last.

## Cross-sprint dependencies

A small number of items must land in a specific order:
- **L3.2 (column type) → L3.1 (UPDATE restored)** in the same migration. Restoring the UPDATE without widening the column re-truncates decimals.
- **I1 (constraint fix) → 2.3.c (drop price overwrite)** — sync-players needs the constraint to work before the price-preservation logic matters.
- **L1.1 (scoring_rules table) → L1.2 / L1.4 / DATA-6** — tournament-aware scoring fixes only become visible once the rules table is in place.
- **SEC-1 / SEC-3 / SEC-2 / SEC-4 / SEC-5 / SEC-6 / SEC-7** can be shipped as **one** migration (`66_security_hardening.sql`) — see Sprint 0.
- **DATA-1 → SEC-2** — auth gates on `run-draft-lottery` are pointless until the upsert works; ship together.

---

# Sprint 0 — Release blockers (≈8-10 hours)

**Goal: nothing here can be live when test users touch the platform.** Failing any of these = test users will hit it on day 1.

## Security holes anyone could exploit from devtools

- **SEC-1** · Drop `squads` UPDATE policy (anyone can self-mint budget)
- **SEC-2** · Auth gate `run-draft-lottery`, `run-reverse-standings-draft`, `eliminate-cup-club`
- **SEC-3** · `process-transfer` reads price server-side, validates membership
- **SEC-4** · `place_bid` validates squad owner
- **SEC-5** · `resolve_bet` validates commissioner role
- **SEC-6** · RLS on 18 gameplay tables (`fantasy_points`, `transfers`, `draft_submissions`, etc.)
- **SEC-7** · `users.email` policy → restrict to `id = auth.uid()`; expose `user_profiles` view
- **DEPLOY-1** · Relocate `e2e-setup.mjs` to `scripts/`, redact prod credentials

## Data integrity that will silently corrupt records

- **L3.1** · `aggregate_league_member_points` — restore the missing `UPDATE league_members` (standings are frozen right now)
- **L3.2** · `league_members.total_points` → `NUMERIC(10,2)`
- **L1.1** · Create `scoring_rules` table with the schema `calculate-scores` expects; seed EPL
- **DATA-1** · Fix draft upsert `onConflict` target + include `tournament_id`
- **DATA-3** · Drop duplicate `fantasy_points` UNIQUE constraint from migration 63
- **DATA-11** · Idempotent re-application of `bet_submissions` FK fix (migration 16 vs 28 ordering)
- **DATA-12** · Fix invalid cron expression in migration 21

## Pipeline that's currently a no-op

- **I1** · `sync-players` upsert constraint — drop single-column unique, create `(forza_player_id, tournament_id)` composite
- **I3** · Replace empty-body `ingest-match-events` cron with a working live-fixture iterator
- **2.3.b** · Drop `players_forza_player_id_idx`; create composite — enables cross-tournament players
- **2.3.c** · Remove `price: null` from `sync-players` upsert payload
- **2.6.a** · Fix WC tournament_id mismatch (UUID vs '429' across consumers and valuations)

## Production crash risk

- **FRONT-1** · TDZ time-bomb on 7 `HubShared` imports — split to leaf constants module
- **U4** · `HashRouter` for Capacitor + Android `backButton` listener
- **U9** · `loadLeagueById` redirect on null result (deep link hangs forever)

## Primary tasks completely blocked

- **U1** · `SettingsScreen` `logout` → `signOut` (no working sign-out exists)
- **U2** · Gate `OnboardingWizard` behind auth (currently renders over login)
- **U5** · Replace `'md1'` hardcoded matchday in `useDeadlineCountdown` + MarketScreen; mount `TransferWindowBanner` on Squad + Market; gate buttons on `isLocked`

## Draft fairness blockers

- **L5.2** · `run-draft-lottery` idempotency gate + transaction wrapping (cron retry currently produces conflicting allocations)
- **L5.4** · `run-reverse-standings-draft` per-league config (currently hardcoded 15)
- **L6.1** · Decide policy: enforce `repeats_allowed` in `process-transfer` OR remove the relaxation UI banner until enforcement ships
- **L6.2** · Fix pressure percentage display (currently shows "1%" instead of "75%")

---

# Sprint 1 — Will break within the first week (≈10-12 hours)

**Goal: close paths that turn into bug reports or data drift as soon as real usage starts.**

## Pipeline correctness

- **I2** · WC sync crons send wrong key (`tournament_id` instead of `forza_id`)
- **I4** · Unschedule duplicate orchestrator + hardcoded sync crons
- **DATA-2** · Reconcile `scoring_rules` vs `scoring_templates` (rename or drop the dead one)
- **DATA-7** · Unschedule duplicate cron jobs causing double Forza calls
- **DATA-8** · Document canonical schedules for `run-draft-lottery` / `auto-open-transfer-window`
- **DATA-9** · `auto-open-transfer-window` idempotency + correct `closes_at`
- **DATA-10** · Normalize `matchday_id` format; remove `'current'` rows; add format check
- **2.4.b** · `sync-player-status` — set `_type='suspension'` so mapping isn't dead code
- **3.2** · Bet `TEMPLATE_UUID` — slug→id runtime lookup

## Scoring math

- **L1.4** · Resolve wildcard chip semantics (stacks with captain ×2 currently)
- **L1.5** · Joker chip — either ship scoring or remove from UI (links to U7)
- **L1.2** · GK `conceded_per_goal` — decide per-goal vs per-2-goals
- **L1.3** · Replace `||` with `??` in `rollupSquads`; add NaN guard
- **L1.6** · Path B accept both `'sub'` and `'sub_off'` event types
- **L1.7** · `penalty_missed` events tagged correctly in `match_events`
- **L1.8** · Apply `mins >= 60` at clean_sheet derivation in Path B
- **DATA-6** · `calculate-scores` tournament-id fallback fix
- **DATA-5** · `process-transfer` filter squad by active `matchday_id`
- **DATA-4** · `process-transfer` deadline scoped to tournament

## Aggregation

- **L3.3** · `recompute_league_ranks` function + trigger on `total_points` change
- **L3.4** · `rollupSquads` hard-fail on missing `round_number` / `tournament_id`
- **L3.5** · Captain-on-bench policy — DB constraint or vice-captain logic
- **L3.7** · `aggregate_league_member_points` filter to `reward_type='points'` only

## Bet resolution

- **L2.1** · `resolve_bet` validates `p_correct_answer` is in options
- **L2.4** · Add bet auto-resolver edge function + cron (or remove `resolves_at`)
- **3.3** · BetCreatorPanel writes `scope_ref = fixture.id` for match_result
- **3.4** · Schedule `resolve-bets` cron

## Frontend stability hot spots

- **FRONT-2** · `useChatMessages` channel leak fix (subscriptions degrade hourly)
- **FRONT-3** · `LeagueScreen` use `removeChannel` not `unsubscribe()`
- **FRONT-4** · `LeagueScreen` `user.id` dep instead of `user` object (re-render loop)
- **FRONT-7** · `SquadScreen.fetchSquad` race + `useCallback` wrapping
- **FRONT-9** · `useNotifications` `removeChannel` fix
- **FRONT-10** · `useAuctions` no-abort + duplicate mount
- **FRONT-11** · `loadLeagueById` guard on `user?.id`
- **U10** · `DraftRecoveryScreen` stop writing `matchday_id='current'`
- **U11** · `SquadScreen.fetchSquad` filter by active matchday
- **U12** · `RecapScreen` resolve matchday from `matchday_deadlines` (drop `'md2'`)
- **U13** · `RecapScreen` captain math convention (pick base or effective)
- **U6** · `LiveScreen` Realtime subscription (replaces 5-min poll)

## Catastrophic UX gaps

- **U3** · `/join?code=` route handler
- **U7** · Joker — ship or remove (paired with L1.5)
- **U8** · Trade proposals — hide ("coming soon") or wire to DB
- **U33** · Replace `CreateBetWizard` mock data with `BetCreatorPanel`
- **U34** · `TEMPLATE_UUID` slug→id lookup (paired with 3.2)
- **U30** · Realtime standings handles INSERT (new members invisible otherwise)

## Draft fairness & relaxation

- **L5.1** · Two-pass allocation so capacity/budget skips don't drop awarded players
- **L5.3** · Crypto-random + audit log for lottery rolls
- **L5.6** · Deterministic tiebreaker in reverse-standings
- **L5.7** · Null guard on `playerRows` in reverse-standings
- **L5.8** · Per-league budget (drop hardcoded 100)
- **L5.9** · Draft writes canonical `matchday_id` (links to U10/DATA-1)
- **L5.11** · Disable `Edit` after `processed` (links to U25)
- **L6.3** · Auto-seed `cup_active_clubs` on cup-league creation
- **L6.4** · Tournament scoping in `seed_cup_clubs`
- **L6.5** · Tournament scoping in `get_cup_pool_stats`
- **L6.6** · Honor `squad_size` in pressure formula
- **L6.7** · Standardize `calculate_relaxation_state` vs `apply_relaxation_state` between UI and enforcement
- **L6.8** · `useRelaxationState` Realtime subscription
- **L6.9** · Drop `.single()` on scalar RPC

## Observability (foundation — informs all later debugging)

- **O1** · Extract `_shared/log.ts` helper
- **O2** · Apply `logError` across remaining 11 edge functions
- **O3** · `client_errors` table + RPC + frontend `unhandledrejection` / `window.error` listeners
- **O4** · Auto-prune cron for error logs (30d / 14d)
- **O5** · Read-only admin error view (3 panels)

---

# Sprint 2 — Core flows users will notice (≈10-12 hours)

**Goal: every promised feature actually does what it looks like it does.**

## Auth / onboarding polish

- **U14** · Recovery mode flag persistence across token refresh
- **U15** · Sign-up success message + existing-email detection
- **U16** · Replay tour wrong localStorage key
- **U17** · `ProtectedRoute` preserve query + hash in redirect

## Squad + Market + Draft

- **U18** · Squad swap-mode toast on no-op
- **U19** · Captain button label distinguishes states (`'CURRENT'` vs `'MAKE CAPTAIN'`)
- **U20** · Joker activation debounce
- **U21** · Delete `_handleChipToggle` dead code
- **U22** · Currency symbol standardization (`£` global)
- **U23** · Draft auto-save fires on idle + 2-min heartbeat
- **U24** · Draft `autoComplete` respects position caps
- **U25** · Disable edit for `processed` submissions
- **U26** · Club cap (3/club) UI guard
- **U27** · `PowerToolCard` confirm modal `body` prop fix
- **DATA-13** · `run-reverse-standings-draft` per-league config (mirror lottery)
- **DATA-15** · `sync-player-status` N+1 query batching

## League hub

- **U28** · `isCommissioner` include `created_by` in initial query
- **U29** · Reset league-scoped state on `leagueId` change
- **U31** · Chat unread badge bumps on INSERT from other tabs
- **U32** · Tab state in URL (`?tab=chat` or nested route)
- **U35** · `resolve_bet` returns winners + total separately (links to L2.2)
- **U36** · AuctionCard preflight budget check
- **U37** · Verify `auction.seller_id` semantics
- **U38** · Bet leaderboard `!inner` modifier (links to L2.6) + filter Realtime (links to L2.7)
- **U40** · Mention dropdown default index 0
- **U41** · Hashtags vs mentions visual distinction
- **U42** · `clearAllNotifications` scoped to bet type
- **U43** · Notifications deep-link on click

## Live / Recap / Bracket

- **U44** · Rename `/bracket` to `/predictions` or build the actual cup bracket
- **U45** · Add navigation entries to `/recap` and `/bracket`
- **U46** · Live deltas computed from real `scoring_rules` or `player_match_stats`
- **U47** · Match status transitions (halftime banner, FT card, postponed banner)
- **U48** · Per-league chip state — pick a data model and stop showing fake per-league chips
- **U49** · `RecapScreen` topScorers math consistency
- **U50** · "ACTIVE NOW" excludes 0-minute benched players
- **U51** · Bench section on Live screen
- **U52** · Captain DNP banner
- **U53** · Historic matchday selector in Recap
- **U54** · Derive `currentGW` from `matchday_deadlines`
- **U55** · Live scoreboard from `fixtures.home_score/away_score` first

## Cross-cutting safety nets

- **U57** · `<NotFoundScreen>` instead of silent root redirect
- **U58** · `ConfirmModal` awaitable `onConfirm` + loading state
- **U59** · `ConfirmModal` focus trap + ARIA dialog role
- **U60** · Global `unhandledrejection` toast (covered by **O3**)
- **U61** · Move `id="main-content"` to AppLayout (fix SkipToContent)

## Draft polish + relaxation polish

- **L5.5** · Deterministic submission ordering in draft
- **L5.10** · Free-agency auto-window for `unresolved_slots > 0`
- **L5.12** · Tournament-scoped player validation in submission
- **L5.13** · Cap player_ids length at `draft_list_size`
- **L5.16** · Cup phase transition UI banner
- **L6.10** · `await` or `waitUntil` on `calculate-relaxation` invoke (links to DATA-14)
- **L6.11** · Recalibrate tier multipliers post squad_size fix
- **L6.12** · Filter `n_managers` by active members
- **L6.13** · Tie gazette wording to actual enforcement

## Bet polish

- **L2.2** · `resolve_bet` winners vs total
- **L2.5** · `submit_bet` resets `is_correct/reward_awarded` on answer change
- **L2.6** · `useBettingLeaderboard` `!inner`
- **L2.7** · `useBettingLeaderboard` Realtime filter
- **L3.6** · `points_breakdown` cumulative across fixtures
- **L3.9** · Bet `reward_awarded` NULL for losers

## Pipeline polish

- **DATA-14** · `eliminate-cup-club` `EdgeRuntime.waitUntil`
- **DATA-16** · `discover-tournament` batched concurrency
- **DATA-17** · Redact access_token in `discover-tournament` / `test-forza-api` logs
- **DATA-19** · `sync-fixtures` Date comparison (drop string compare)
- **DATA-20** · `clean_sheet` consistency across paths (links to L1.8)
- **2.2.b** · `sync-fixtures` timestamp parsing
- **2.2.c** · Fixture status mapping for `postponed` / `cancelled` / `abandoned`
- **2.5.c** · `parseInt('45+2')` added-time parser
- **2.5.d** · Player lookup widened beyond two-team filter

---

# Sprint 3 — Quality, a11y, performance (≈6-8 hours)

**Goal: production-quality polish — accessibility, error UX, performance hot spots.**

## Build / CI / Deploy

- **DEPLOY-2** · CI E2E runs against `vite preview` of `dist/` with auth enabled
- **DEPLOY-3** · Replace silent `test.skip` with `test.fixme` + skip-count CI gate
- **DEPLOY-4** · `npm ci` everywhere
- **DEPLOY-5** · Deno lint step for `supabase/functions/**`; revisit downgraded hook rules
- **DEPLOY-6** · `vite.config.js` `manualChunks` + sourcemaps
- **DEPLOY-7** · `.gitignore` `*.png` scope + `!.env.example` space fix

## Accessibility / UX hygiene

- **U62** · HomeScreen empty-state CTAs for new users
- **U63** · Mobile bottom nav exposes Settings
- **U64** · Onboarding wizard copy matches real formation rules
- **U65** · Remove `maximum-scale=1.0` / `user-scalable=no` from `index.html`
- **U66** · Auth submit double-click guard
- **U67** · Inline error on short league join code
- **U68** · Wizard step CTAs honest copy
- **U69** · Demo mode documented as read-only (or mock RPCs client-side)
- **U70-U80** · Squad/Market medium UX cluster (memoization, header height, picker confirms, status defaults, post-buy refetch, search persistence, Joker UX)
- **U81-U95** · League hub medium UX cluster (Forza Times polish, dead MD/Trend columns, dead `*_REMOVED` JSX, chat handle casing, H2H empty state, cancel-listing confirm, mobile row click parity, tab overflow, member-limit selector)
- **U96-U105** · Live/Recap medium UX cluster (event ordering ties, share image size, hardcoded transfers count, error banner auto-clear, focus-resume refresh, captain badge × chip type)
- **U106-U120** · Cross-cutting medium cluster (ESC stacking, leader-key conflicts, toast safe-area, hover latch on touch, nav aria-current, native deep-link handler, scrollbar visibility, modal z-index, status bar style)

## Frontend stability remainders

- **FRONT-5** · `useDeadlineCountdown` hook signature (parameterized) — completes U5
- **FRONT-6** · `useOnboarding` global helper clobber
- **FRONT-8** · `useChatMessages.sendMessage` deps cleanup
- **FRONT-13** · `useChatMessages.broadcastTyping` deps cleanup
- **FRONT-14** · `ErrorBoundary` insert via SECURITY DEFINER RPC
- **FRONT-15** · `useAutoFill` setTimeout cleanup
- **FRONT-16** · `useLeagueConfig` latent TDZ pattern (pass `cfg` as prop)
- **FRONT-17** · `useAvailabilityFlag` flagMap deps via ref
- **FRONT-12** · `SquadScreen` two tournament-id effects merge

## Auth & SQL polish

- **SEC-8** · `auction_listings` direct UPDATE bypass — drop policy
- **SEC-9** · Drop fake `scoring_templates` admin policy
- **SEC-10** · `chat_messages` length cap + rate limit
- **SEC-11** · Tighten CORS from `*` to Vercel domain
- **SEC-12** · `AuthContext.signUp` race — switch to `handle_new_user()` trigger
- **L4.3** · Drop duplicate `bet_submissions` unique constraint

---

# Sprint 4 — Hygiene, dead code, docs (≈4-6 hours)

**Goal: leave the codebase in a state where the next contributor isn't tripped by zombies.**

## Dead code purge

- **LOW-1** · Move `CHAT_DEBUG_FINDINGS.md`, `CLEANUP_REPORT.md`, `GIT_AND_CODE_WALKTHROUGH.md`, `code_quality_analysis_V2.md` to `docs/archive/`
- **LOW-2** · Rename `docs/brand/ADMIN TAB/` (space) → `admin-tab`
- **L1.9** · Drop broken `calculate_player_points` SQL function and helpers
- **L1.10** · Position default logging in scorePlayer
- **U106** · Adopt `PageHeader` (or delete)
- **U117** · Delete `src/App.css` (dead Vite scaffold)
- **U56** · Delete `VARReviewBanner` or wire it
- **U103** · Delete `EventTimeline` or wire it
- **U85** · Delete `view === '*_REMOVED'` blocks (~270 lines in LeagueScreen)
- **`src/data/squad.js`** and `src/data/fixtures.js` deletion
- **2.6.b** · Cleanup `tournament_id` UUID vs Forza-id confusion (already addressed by 2.6.a + I1)

## Dependency / config hygiene

- **LOW-3** · Move `@capacitor/cli` to devDependencies
- **LOW-4** · Replace `html2canvas` 1.4.1 (unmaintained)
- **LOW-5** · `index.html` viewport accessibility (handled in U65)
- **LOW-6** · Add Vercel security headers (`CSP`, `X-Frame-Options`, `Referrer-Policy`)
- **LOW-7** · Document migration gaps (52, 58) in BACKLOG.md
- **LOW-8** · `players.id` BIGINT vs TEXT cleanup (tied to L1.9)
- **LOW-9** · `tournament_id` body key in cron migrations — standardize (already addressed in I2)
- **LOW-10** · Remove unused `user_id` field from `useTransfer` body
- **LOW-11** · `useChatMessages` `.catch` on PostgrestBuilder → `maybeSingle()`
- **LOW-12** · Deduplicate `.gitignore` entries
- **LOW-13** · Add `format`, `typecheck`, `test` npm scripts
- **LOW-14** · Extract `_shared/forza.ts` helper
- **LOW-15** · Added-time minute parser helper

## Logging / observability

- Strip `console.log` in `useChatMessages` (gate behind `import.meta.env.DEV`)
- Apply `edge_function_errors` logging to all critical paths (drafts, transfers)
- Document `app.supabase_url` + `app.service_role_key` settings in CLAUDE.md
- Update CLAUDE.md tests-pass claim with real Playwright count (from DEPLOY-3 outcome)

## Misc low-priority UI

- Brand color token deduplication
- `Intl.NumberFormat` / `Intl.DateTimeFormat` wrapper module
- Consolidate `LiveDot` / `StatusDot`
- `BrandMark` accessibility wrapper
- ProtectedRoute use `100dvh` instead of `100vh`
- Mobile nav label font-size bump from 8px → 10px

## Draft / relaxation hygiene

- **L5.14** · Optional global-fairness weighting in lottery
- **L5.15** · Drop `JSON.stringify` for JSONB columns (gazette entries)
- **L5.17** · Embed names in gazette bullets
- **L5.18** · `Math.max(0, ...)` guard in lottery `unresolved_slots`
- **L6.14** · Stop parsing tier labels by regex
- **L6.15** · Decide tier-0 transition gazette policy
- **L6.16** · Standardize NULL vs 0 in `repeats_allowed`

## Observability optional

- **O6** · Daily digest gazette entry (deferred; admin view from O5 is sufficient for test phase)

---

# Sprint cadence recommendation

| Sprint | Hours | Owner profile | Block status |
|---|---|---|---|
| **0** | 10-12 | 1 senior dev | **Must complete before any user test invite** |
| **1** | 16-18 | 1 dev + DBA review on migration | **Must complete before public soft launch** (includes observability foundation O1-O5) |
| **2** | 12-14 | 1 dev | Should complete within 1 sprint after launch |
| **3** | 6-8 | 1 dev + a11y review | Background sprint, parallel to feature work |
| **4** | 5-7 | Anyone | Carry-along; no urgency |

**Total: ~50-60 hours of focused work** to bring the platform from current state to production-quality.

After Sprint 0 + Sprint 1 ship, the platform is technically fit for invited test users with the understanding that some advertised features (Joker, Bracket, Recap historic, etc.) are temporarily hidden rather than fixed. Sprint 2 closes the "looks like it works but doesn't" surface.

**Why observability moved to Sprint 1:** Sprint 0 fixes silent failure modes (draft idempotency, RLS, scoring rules, etc.). Without observability landing in Sprint 1, test-user bug reports during initial use will lack the context to debug — defeating the point of having a test cohort.

---

# Verification per sprint

Each sprint's verification SQL / commands live in the source audit files under the relevant ID. After each sprint completes:

- Re-run the verification block from the source audit
- Update **BACKLOG.md** with the IDs marked done
- Note in each source audit which IDs are addressed (strikethrough or "✅" marker)
- For Sprint 0 & 1 migrations, run `supabase db reset` on a staging DB end-to-end to verify clean apply
