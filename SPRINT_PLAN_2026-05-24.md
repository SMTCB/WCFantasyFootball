# Consolidated Correction Plan — Sprint Allocation
**Date:** 2026-05-24 (updated 2026-05-25 — Sprint 0, 1, 2 complete; migrations 66-76 in production)
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

# Sprint 0 — Release blockers ✅ COMPLETE (2026-05-24)

**PR:** `claude/sprint-0-release-blockers` — merged to main  
**Migrations applied:** `66_security_hardening.sql`, `67_ingest_events_cron.sql`, `68_wc_cron_key_fix.sql`

## Security holes anyone could exploit from devtools

- ✅ **SEC-1** · Column-restricted `squads` UPDATE policy (captain, formation, joker only)
- ✅ **SEC-2** · JWT + commissioner auth gate on `run-draft-lottery`, `run-reverse-standings-draft`, `eliminate-cup-club`
- ✅ **SEC-3** · `process-transfer` reads price from DB, validates league membership
- ✅ **SEC-4** · `place_bid` validates squad owner via `auth.uid()`
- ✅ **SEC-5** · `resolve_bet` validates commissioner role
- ✅ **SEC-6** · RLS enabled on 18 gameplay tables
- ✅ **SEC-7** · `users` SELECT restricted to own row; `user_profiles` view exposes only safe fields
- ✅ **DEPLOY-1** · `e2e-setup.mjs` credentials moved to env vars; canonical version at `scripts/e2e-setup.mjs`

## Data integrity that will silently corrupt records

- ✅ **L3.1** · `aggregate_league_member_points` now includes UPDATE clause — season totals accumulate
- ✅ **L3.2** · `league_members.total_points` → `NUMERIC(10,2)`
- ✅ **L1.1** · `scoring_rules` table created with JSONB shape; EPL (426) seeded
- ✅ **DATA-1** · Draft upsert `onConflict` target fixed; `tournament_id` included
- ✅ **DATA-3** · Duplicate `fantasy_points` UNIQUE constraint dropped
- ✅ **DATA-11** · `bet_submissions` FK fix re-applied idempotently
- ✅ **DATA-12** · Invalid cron expression in migration 21 unscheduled

## Pipeline that's currently a no-op

- ✅ **I1** · Composite `(forza_player_id, tournament_id)` unique constraint on `players`
- ✅ **I3** · `ingest-match-events` cron iterates live fixtures per `forza_match_id`; `calculate-scores-post-match` added at 22:30 UTC
- ✅ **2.3.b** · Single-column `players_forza_player_id_idx` dropped; composite index created
- ✅ **2.3.c** · `price: null` removed from `sync-players` upsert payload
- ✅ **2.6.a** · WC crons corrected to send `forza_id` key (were sending `tournament_id`)

## Production crash risk

- ✅ **FRONT-1** · TDZ fix — `MONO`/`DISPLAY`/`mgrMono`/`miniBtnStyle` in `HubConstants.js` leaf module; all child panels import from there
- ✅ **U4** · `HashRouter` for Capacitor native; Android `backButton` listener
- ✅ **U9** · `loadLeagueById` null guard prevents infinite deep-link hang

## Primary tasks completely blocked

- ✅ **U1** · `SettingsScreen` `logout` → `signOut`
- ✅ **U2** · `OnboardingWizard` gated behind auth (doesn't render over login)
- ✅ **U5** · `useDeadlineCountdown` dynamic by `tournamentId`; `TransferWindowBanner` on SquadScreen; MarketScreen deadline dynamic

## Draft fairness blockers

- ✅ **L5.2** · `run-draft-lottery` idempotency gate; crypto-random allocation
- ✅ **L5.4** · `run-reverse-standings-draft` uses per-league config (budget, squad_size, tournament_id)
- ✅ **L6.1** · `process-transfer` enforces `relaxation_state.current_repeats_allowed` — banner is no longer a lie
- ✅ **L6.2** · Pool pressure thresholds corrected to 0–1 ratio; `pressure * 100`% so "75%" renders correctly

---

# Sprint 1 — Will break within the first week ✅ COMPLETE (2026-05-25)

**PRs:** #171, #173, #174, #175 (sessions 34–38) · #176 `claude/s1-draft` (session 39) — all merged to main  
**Migrations applied:** 69 (rank trigger), 70 (scoring fixes), 71 (observability), 72 (resolve-bets), 73 (cron dedup), 74 (draft/cup fixes)  
**Goal: close paths that turn into bug reports or data drift as soon as real usage starts.**

## Pipeline correctness

- **I2** · WC sync crons send wrong key (`tournament_id` instead of `forza_id`)
- ✅ **I4** · Unschedule duplicate orchestrator + hardcoded sync crons — migration 73 (session 38)
- ✅ **DATA-2** · Reconcile `scoring_rules` vs `scoring_templates` — handled in migration 66 (applied)
- ✅ **DATA-7** · Unschedule duplicate cron jobs causing double Forza calls — migration 73 (session 38)
- ✅ **DATA-8** · Canonical schedule documented in migration 73 header comment (session 38)
- ✅ **DATA-9** · `auto-open-transfer-window` idempotency + `closes_at` capped at next kickoff (session 38)
- ✅ **DATA-10** · Delete `matchday_id='current'` rows; CHECK constraint added — migration 73 (session 38)
- ✅ **2.4.b** · `sync-player-status` — `_type='suspension'` + `mapStatus`/`mapConfidence` unified (session 38)
- ✅ **3.2** · Bet `TEMPLATE_UUID` — slug→id runtime lookup (session 37)

## Scoring math

- ✅ **L1.4** · Wildcard 1.1× applied to squad total once (not per-player stacking)
- ✅ **L1.5** · Joker chip wired: joker_player_id doubles that player's points
- ✅ **L1.2** · GK conceded_per_goal → floor(n/2)×rule (FPL-style)
- ✅ **L1.3** · `||` → `??` + NaN guard in `rollupSquads`
- ✅ **L1.6** · Path B handles both `'sub'` and `'sub_off'` event types
- ✅ **L1.7** · `ingest-match-events` typeMap: penalty_missed → 'penalty_missed'
- ✅ **L1.8** · Path B clean_sheet includes mins≥60 gate
- ✅ **DATA-6** · `rollupSquads` hard-fail on missing round_number/tournament_id; never writes 'current'
- ✅ **DATA-5** · `process-transfer` squad query filtered by active matchday_id
- ✅ **DATA-4** · `process-transfer` deadline scoped to league's tournament_id

## Aggregation

- ✅ **L3.3** · `recompute_league_ranks` function + trigger on `total_points` change — migration 69 applied to production
- ✅ **L3.4** · `rollupSquads` hard-fail on missing `round_number` / `tournament_id` — same fix as DATA-6 (session 35)
- ✅ **L3.5** · Captain-on-bench → highest-scoring starter gets bonus (session 38)
- ✅ **L3.7** · `aggregate_league_member_points` filter to `reward_type='points'` only — migration 70 (pending deploy)

## Bet resolution

- ✅ **L2.1** · `resolve_bet` validates `p_correct_answer` against options — migration 72 (session 37)
- ✅ **L2.4** · `resolve-bets` edge function + `resolve-finished-bets` cron every 15 min — migration 72 (session 37)
- ✅ **3.3** · BetCreatorPanel writes `scope_ref = fixture.id` for match_result (session 37)
- ✅ **3.4** · `resolve-finished-bets` cron scheduled — migration 72 (session 37)

## Frontend stability hot spots

- ✅ **FRONT-2** · `useChatMessages` channel leak fix (subscriptions degrade hourly)
- ✅ **FRONT-3** · `LeagueScreen` use `removeChannel` not `unsubscribe()`
- ✅ **FRONT-4** · `LeagueScreen` `user.id` dep instead of `user` object (re-render loop)
- ✅ **FRONT-7** · `SquadScreen.fetchSquad` `useCallback` wrapping + `user?.id` dep (full AbortController race fix deferred to Sprint 3)
- ✅ **FRONT-9** · `useNotifications` `removeChannel` fix
- ✅ **FRONT-10** · `useAuctions` cancelRef added (Realtime subscription replacing polling deferred to Sprint 2)
- ✅ **FRONT-11** · `loadLeagueById` guard on `user?.id`
- ✅ **U10** · `DraftRecoveryScreen` derives active matchday_id from matchday_deadlines
- ✅ **U11** · `SquadScreen.fetchSquad` scoped to active matchday_id
- ✅ **U12** · `RecapScreen` resolves matchday from `matchday_deadlines` via tournament_id
- ✅ **U13** · `RecapScreen` captain math — `effectivePoints()` mirrors `calculate-scores` (session 36/37)
- ✅ **U6** · `LiveScreen` Realtime subscription — `match_events INSERT` + `player_match_stats UPDATE` on live fixture IDs; 60s safety-net poll (session 37)

## Catastrophic UX gaps

- ✅ **U3** · `/join?code=` route handler — `LeagueScreen` reads `?joinCode=` from URL (session 36)
- ✅ **U7** · Joker UI wired — RecapScreen `effectivePoints()` applies ×2; `recap.joker` set from `squads.joker_player_id` (session 37)
- ✅ **U8** · Trade proposals → "coming soon" toast (session 36)
- ✅ **U33** · `CommissionerPanel` now renders `BetCreatorPanel` (desktop + mobile); dead wizard removed (session 38)
- ✅ **U34** · `TEMPLATE_UUID` slug→id lookup — runtime lookup in `BetCreatorPanel` + `useCommissioner` (session 37)
- ✅ **U30** · Realtime standings handles INSERT — new members appear immediately (session 36)

## Draft fairness & relaxation

- ✅ **L5.1** · Two-pass allocation — dropped players offered to runner-up contestants in crypto-random order (session 39)
- ✅ **L5.3** · Crypto-random lottery rolls + audit log — already in code; verified session 38
- ✅ **L5.6** · Deterministic tiebreaker in reverse-standings — verified in code session 38
- ✅ **L5.7** · Null guard on `playerRows` in reverse-standings — verified in code session 38
- ✅ **L5.8** · Per-league budget used in allocation — verified in code session 38
- ✅ **L5.9** · Draft writes canonical `matchday_id` from `matchday_deadlines` — verified in code session 38
- ✅ **L5.11** · Disable `Edit` after `processed` — "Lottery complete — list locked" shown (session 39)
- ✅ **L6.3** · Auto-seed `cup_active_clubs` trigger on `cup_phase` transition — migration 74 (session 39)
- ✅ **L6.4** · Tournament scoping in `seed_cup_clubs` (p_tournament_id param) — migration 74 (session 39)
- ✅ **L6.5** · Tournament scoping in `get_cup_pool_stats` — auto-resolves with L6.4 (session 39)
- ✅ **L6.6** · `squad_size` used in pressure formula instead of hardcoded 15 — migration 74 (session 39)
- ✅ **L6.7** · `useRelaxationState` reads persisted `current_repeats_allowed` from `league_config` (session 39)
- ✅ **L6.8** · `useRelaxationState` Realtime subscription on `gazette_entries INSERT` (session 39)
- ✅ **L6.9** · Dropped `.single()` from `calculate_relaxation_state` RPC call (session 39)

## Observability (foundation — informs all later debugging)

- ✅ **O1** · Extract `_shared/log.ts` helper (session 36)
- ✅ **O2** · Apply `logError` across all 11 edge functions (session 36)
- ✅ **O3** · `client_errors` table + RPC + frontend listeners — migration 71 (session 36)
- ✅ **O4** · Auto-prune cron — migration 71 (session 36)
- ✅ **O5** · `AdminSeedScreen` ObservabilityPanel — edge + client error panels (session 36)

---

# Sprint 2 — Core flows users will notice ✅ COMPLETE (2026-05-25)

**PRs:** `claude/s2-auth-squad-ui` (#178) · `claude/s2-league-hub` (#179) · `claude/s2-live-pipeline` (#180) — all merged to main  
**Migrations applied:** 75 (relaxation fixes), 76 (bet logic fixes)  
**Goal: every promised feature actually does what it looks like it does.**

## Auth / onboarding polish

- ✅ **U14** · Recovery mode flag persistence across token refresh
- ✅ **U15** · Sign-up success message + existing-email detection
- ✅ **U16** · Replay tour wrong localStorage key
- ✅ **U17** · `ProtectedRoute` preserve query + hash in redirect

## Squad + Market + Draft

- ✅ **U18** · Squad swap-mode toast on no-op
- ✅ **U19** · Captain button label distinguishes states (`'CURRENT'` vs `'MAKE CAPTAIN'`)
- ✅ **U20** · Joker activation debounce
- ✅ **U21** · Delete `_handleChipToggle` dead code
- ✅ **U22** · Currency symbol standardization (`£` global)
- ✅ **U23** · Draft auto-save fires on idle + 2-min heartbeat
- ✅ **U24** · Draft `autoComplete` respects position caps
- ✅ **U25** · Disable edit for `processed` submissions
- ✅ **U26** · Club cap (3/club) UI guard
- ✅ **U27** · `PowerToolCard` confirm modal `body` prop fix
- ✅ **DATA-13** · `run-reverse-standings-draft` per-league config (mirror lottery)
- ✅ **DATA-15** · `sync-player-status` N+1 query batching

## League hub

- ✅ **U28** · `isCommissioner` include `created_by` in initial query
- ✅ **U29** · Reset league-scoped state on `leagueId` change
- ✅ **U31** · Chat unread badge bumps on INSERT from other tabs
- ✅ **U32** · Tab state in URL (`?tab=chat` or nested route)
- ✅ **U35** · `resolve_bet` returns winners + total separately (links to L2.2)
- ✅ **U36** · AuctionCard preflight budget check
- ✅ **U37** · Verify `auction.seller_id` semantics
- ✅ **U38** · Bet leaderboard `!inner` modifier (links to L2.6) + filter Realtime (links to L2.7)
- ✅ **U40** · Mention dropdown default index 0
- ✅ **U41** · Hashtags vs mentions visual distinction
- ✅ **U42** · `clearAllNotifications` scoped to bet type
- ✅ **U43** · Notifications deep-link on click

## Live / Recap / Bracket

- ✅ **U44** · Rename `/bracket` to `/predictions` + backward-compat redirect
- ✅ **U45** · Add navigation entries to `/recap` and `/predictions` (desktop sidebar, `desktopOnly` flag keeps mobile bottom bar at 5 items)
- **U46** · Live deltas computed from real `scoring_rules` or `player_match_stats` — deferred to Sprint 3
- ✅ **U47** · Match status transitions (halftime banner, FT card, postponed banner)
- **U48** · Per-league chip state — pick a data model and stop showing fake per-league chips — deferred to Sprint 3
- ✅ **U49** · `RecapScreen` topScorers math consistency — verified already correct, no change needed
- ✅ **U50** · "ACTIVE NOW" excludes 0-minute benched players
- ✅ **U51** · Bench section on Live screen
- ✅ **U52** · Captain DNP banner
- ✅ **U53** · Historic matchday selector in Recap
- ✅ **U54** · Derive `currentGW` from `matchday_deadlines`
- ✅ **U55** · Live scoreboard from `fixtures.home_score/away_score` first

## Cross-cutting safety nets

- ✅ **U57** · `<NotFoundScreen>` instead of silent root redirect
- ✅ **U58** · `ConfirmModal` awaitable `onConfirm` + loading state
- ✅ **U59** · `ConfirmModal` focus trap + ARIA dialog role
- ✅ **U60** · Global `unhandledrejection` toast (covered by **O3**)
- ✅ **U61** · Move `id="main-content"` to AppLayout (fix SkipToContent)

## Draft polish + relaxation polish

- **L5.5** · Deterministic submission ordering in draft — deferred to Sprint 3
- **L5.10** · Free-agency auto-window for `unresolved_slots > 0` — deferred to Sprint 3
- **L5.12** · Tournament-scoped player validation in submission — deferred to Sprint 3
- **L5.13** · Cap player_ids length at `draft_list_size` — deferred to Sprint 3
- **L5.16** · Cup phase transition UI banner — deferred to Sprint 3
- **L6.10** · `await` or `waitUntil` on `calculate-relaxation` invoke (links to DATA-14) — deferred to Sprint 3
- **L6.11** · Recalibrate tier multipliers post squad_size fix — deferred to Sprint 3
- **L6.12** · Filter `n_managers` by active members — deferred to Sprint 3
- **L6.13** · Tie gazette wording to actual enforcement — deferred to Sprint 3

## Bet polish

- ✅ **L2.2** · `resolve_bet` winners vs total — migration 76
- ✅ **L2.5** · `submit_bet` resets `is_correct/reward_awarded` on answer change — migration 76
- ✅ **L2.6** · `useBettingLeaderboard` `!inner`
- ✅ **L2.7** · `useBettingLeaderboard` Realtime filter
- ✅ **L3.6** · `points_breakdown` cumulative across fixtures
- ✅ **L3.9** · Bet `reward_awarded` NULL for losers — migration 76

## Pipeline polish

- **DATA-14** · `eliminate-cup-club` `EdgeRuntime.waitUntil` — deferred to Sprint 3
- ✅ **DATA-16** · `discover-tournament` batched concurrency
- ✅ **DATA-17** · Redact access_token in `discover-tournament` / `test-forza-api` logs
- ✅ **DATA-19** · `sync-fixtures` Date comparison (drop string compare)
- **DATA-20** · `clean_sheet` consistency across paths (links to L1.8) — deferred to Sprint 3
- ✅ **2.2.b** · `sync-fixtures` timestamp parsing
- ✅ **2.2.c** · Fixture status mapping for `postponed` / `cancelled` / `abandoned`
- ✅ **2.5.c** · `parseInt('45+2')` added-time parser
- ✅ **2.5.d** · Player lookup widened beyond two-team filter

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
