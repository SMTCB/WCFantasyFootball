# Forza Fantasy League - Open Issues & Backlog

**Last Updated**: 2026-04-25
**E2E Test Suite**: 82/84 passing (97.6%)
**Priority Levels**: P0 (Blocking), P1 (High — needed before feature is usable), P2 (Medium), P3 (Low/Polish)

---

## 📋 Current Status Summary

### ✅ Completed
- Squad Screen UX phases 1–3 (mobile tabs, power tools, feature discoverability)
- PowerToolCard component (reusable, active/inactive states)
- E2E test infrastructure synced (82/84 passing)
- Mobile responsive design verified (375px → 1440px)
- App Store / Play Store readiness assessment
- **Draft System — full implementation (S1–S12)**:
  - DB schema: `draft_submissions`, `draft_allocations`, `transfer_windows`, `transfers`, `cup_active_clubs`, `league_config`, `gazette_entries`, `trade_listings`
  - Draft submission screen with ranked list, auto-complete, server-time deadline enforcement, auto-save
  - `run-draft-lottery` Edge Function (random conflict resolution, sequential allocation, gazette report)
  - `run-reverse-standings-draft` Edge Function (worst-rank wins conflicts, cup group → elimination transition)
  - Incomplete squad recovery screen (FCFS, Supabase realtime, optimistic UI)
  - Transfer window enforcement (DB triggers on position caps + window validity)
  - Trade UI extensions (window gating, position pre-check, "list for trade" toggle)
  - Cup pool management (`get_cup_available_players`, `eliminate-cup-club` Edge Function)
  - No-repeat relaxation formula (`calculate_relaxation_state`, `apply_relaxation_state`, `calculate-relaxation` Edge Function)
  - `GazetteDraftReport` component (hybrid headline + bullets + collapsible table)
  - `useTransferWindow` hook + `TransferWindowBanner` component
  - `useRelaxationState` hook
- **#014**: `get_server_time` RPC — migration applied ✅
- **#015**: Draft entry banner in LeagueScreen ✅
- **#006**: Database seeding — 829 EPL players loaded (98 GK / 275 DEF / 379 MID / 97 FWD, 31 clubs) ✅
- **#001**: MarketScreen player loading fixed (isolated fetch, resilient error handling) ✅
- **CI fix**: Replaced `npm ci` → `npm install` in all workflow jobs (lock file sync error resolved) ✅
- **Buy/sell flow redesign** (new — full implementation):
  - `process-transfer` Edge Function: server-side no-repeat check per league, budget credit on sell, position limits, auto-creates squad row on first transfer
  - `useTransfer(leagueId)` hook: `takenMap`, `buy()`, `sell()`, `isTaken()`, `takenBy()`, `isOwnedBy()`
  - `PlayerPickerSheet` component: bottom sheet picker, pre-filtered by position, shows available/taken/over-budget, search
  - SquadScreen: empty slot placeholders per position, tap to open picker sheet, sell now credits budget via Edge Function
  - MarketScreen: league picker (auto-selects if only one), taken-by-manager badge + row dimming, empty slots counter
  - LeagueScreen: "Manage Squad" + "Market" shortcut buttons, both link with `leagueId` context
- **Scoring Layer — Sprint 1**:
  - Migration 09: `daily_jokers`, `matchday_deadlines`, `player_match_stats` tables + `get_server_time()` RPC + `calculate_player_points()` SQL
  - `calculate-scores` Edge Function: full scoring pipeline (BPS, captain/chip multipliers, Realtime broadcast)
  - Migrations 13–15: scoring columns on `player_match_stats`, unique constraints, PL fixture data, player status alerts
  - SquadScreen (#101): reads live squads table with real player points from `player_match_stats`
  - LiveScreen (#102): real goal scores in ticker, real player points, real event feed with player names
  - RecapScreen (#103): derived from real `fantasy_points` + `player_match_stats` (no `matchday_recaps` table needed)
  - DangerZone (#104): 4 real player alerts seeded (doubt/out/returning) for current squad
  - Fixtures: all World Cup dummy data replaced with Premier League clubs (md1–md6 + test-live)

---

## 🔴 P0 — Blocking

### #017: E2E Regression — SquadScreen + MarketScreen ✅ RESOLVED
- **Fixed**: 2026-04-24
- **Root causes fixed**:
  1. SquadScreen: missing `setSquadData(fallbackSquad)` on no-squad early return
  2. MarketScreen + DraftScreen: `.single().catch()` invalid on Supabase SDK thenable
  3. E2E: `getByText('⚙ Tools')` selector didn't match split icon/label elements

### #001-E2E: MarketScreen E2E Tests (2 tests still failing)
- **Status**: OPEN (UX bug fixed; E2E environment issue persists)
- **Description**: `MarketScreen › renders player list with names` failing on desktop-chrome + mobile-chrome in E2E. The actual app now loads players correctly. The E2E failure is a Supabase connectivity issue in the test environment.
- **Next Steps**:
  1. Mock the Supabase players query in E2E for deterministic results
  2. Or add a `data-testid` fixture bypass in test setup
- **Effort**: 1–2 hours

---

## 🟠 P1 — High

### #016: League Commissioner Panel
- **Status**: NOT STARTED
- **Description**: Several backend capabilities have no admin surface:
  - Open/close transfer windows (insert rows into `transfer_windows`)
  - Advance cup phase (`cup_phase` enum transitions)
  - Eliminate a cup club (calls `eliminate-cup-club` Edge Function)
  - Seed cup clubs when entering cup mode (calls `seed_cup_clubs()`)
  - Set draft deadline on a league
- **Suggested approach**: A commissioner-only tab inside `LeagueScreen` (visible only to `leagues.created_by`).
- **Effort**: 2–3 hours

### #017: Wire Trade Builder to Real Squad Data
- **Status**: NOT STARTED
- **Description**: Trade builder in `LeagueScreen` still uses `MOCK_SQUAD_PLAYERS` (MY PLAYER selector) and `MOCK_PLAYERS_POOL` (THEIR PLAYER selector). Now that `useTransfer` exists and `draft_allocations` is populated, this can be wired to real data. The `TODO` on the position-cap pre-check (`validateAndSendProposal`) also remains open.
- **Fix**: On trade builder open, fetch current manager's allocated players + target manager's allocated players from `draft_allocations` (or `squads` for the current league).
- **Effort**: 1–2 hours

### #018: Configure Supabase Cron Settings
- **Status**: NOT STARTED
- **Description**: Cron migrations (`03_draft_lottery_cron.sql`, `08_reverse_draft_cron.sql`) reference `current_setting('app.supabase_url')` and `current_setting('app.service_role_key')`. These PostgreSQL settings must be configured on the Supabase instance or the cron jobs will fail silently.
- **Fix**: Set via Supabase dashboard → Database → Extensions → pg_cron, or via `ALTER DATABASE ... SET app.supabase_url = '...'`
- **Effort**: 15 minutes (config, not code)

### #105: Transfer Cost Lock at Kickoff
- **Status**: NOT STARTED
- **Description**: Player transfer costs should lock at kickoff of their first fixture each matchday. Currently no enforcement — players can be bought/sold at any price during live matches.
- **Fix**: `process-transfer` Edge Function should check `fixtures` table for kickoff time; reject transfers for in-progress fixture players.
- **Effort**: 1 hour

### #106: Manual Scoring Trigger
- **Status**: NOT STARTED
- **Description**: `calculate-scores` Edge Function exists but is not on a cron. Needs a commissioner UI button in LeagueScreen or a pg_cron job.
- **Fix**: Add "Recalculate Scores" button to commissioner panel (#016), or add pg_cron job calling every 5 minutes during live matchdays.
- **Effort**: 30 minutes (if combined with #016)

---

## 🟡 P2 — Medium

### #003: Squad Screen — Desktop Enhancement (Phase 4)
- **Status**: ✅ COMPLETE (2026-04-25)
- **Description**: Desktop sidebar Chips tab now uses `PowerToolCard` components for visual parity with mobile.

### #004: Squad Screen — Onboarding Tour Update (Phase 5)
- **Status**: ✅ COMPLETE (2026-04-25)
- **Description**: Tour step added for `data-tour="squad-power-tools"` highlighting the 3 power tool cards.

### #107: BracketScreen — Wire to Real Fixtures
- **Status**: NOT STARTED
- **Description**: BracketScreen uses hardcoded placeholder data. Should read from `fixtures` table filtered by cup phase.
- **Effort**: 1–2 hours

### #108: HomeScreen — PL Club Fallback Data
- **Status**: NOT STARTED
- **Description**: HomeScreen may still reference World Cup team names in fallback/static data. Needs alignment with PL clubs.
- **Effort**: 30 minutes

### #019: Pool Pressure Indicator in Draft & Squad Screens
- **Status**: NOT STARTED
- **Description**: `useRelaxationState` hook is built and functional but not surfaced anywhere. Managers in cup leagues have no visibility into the current no-repeat rule status.
- **Fix**: Small banner or badge on `DraftScreen` and `DraftRecoveryScreen`: e.g. "Pool pressure 94% — 1 repeated player allowed per squad."
- **Effort**: 45 minutes

### #020: Draft Deadline Notifications
- **Status**: NOT STARTED
- **Description**: No push notification or email when a draft deadline is approaching or when lottery results are published. Managers may miss the draft entirely.
- **Suggested**: Push notification 48h before deadline + gazette entry on lottery completion (already written by Edge Function — notification layer missing).
- **Effort**: 2 hours (depends on push notification infrastructure)

### #021: Transfer Window Auto-Scheduler
- **Status**: NOT STARTED
- **Description**: `transfer_windows` table exists and enforcement is wired, but rows must currently be created manually by the commissioner (#016). For league format, windows should open/close automatically based on fixture schedule.
- **Logic**: After each matchday's last fixture ends, open a standard window for 48h with `transfers_remaining = 5` (or null for unlimited windows).
- **Effort**: 2 hours (Edge Function + cron)

### #022: Squad Screen — Player Click Bottom Sheet (Mobile)
- **Status**: NOT VERIFIED
- **Description**: Tapping a player on mobile Squad screen should open the action bottom sheet (Set Captain, Sub, Sell). Reported as not working. May be a z-index or event propagation issue introduced by the empty slot placeholders.
- **Effort**: 30 minutes investigation

---

## 🔵 Roadmap — Future Features

### #012: Gazette — Extended Dynamic Content
- **Status**: PARTIALLY IMPLEMENTED
- **Description**: `GazetteDraftReport` component built and wired. Gazette now shows draft reports with headline + bullets + collapsible table. Remaining: design treatment for `breaking_news` entries (club eliminations, rule changes) and `auction_result` type once #013 is built.
- **Dependency**: #013 for auction entries
- **Effort**: Medium

### #013: In-League Player Auction System
- **Status**: OPEN — high-level spec in `DRAFT_SYSTEM_DESIGN.md`
- **Description**: Manager lists a player for auction within their league. Others bid using budget and/or points. Time-boxed, only during transfer windows. Seller must acquire a replacement for the vacated position before auction closes.
- **Dependency**: #016 (transfer window infrastructure must be live)
- **Effort**: Medium-large — new UI flow + bidding state machine + resolution logic

---

## 🟢 P3 — Polish

### #005: Verify Mobile PowerToolCard Rendering
- **Status**: NEEDS VERIFICATION
- **Steps**: `/squad` on 375px → Tools tab → confirm 3 cards render, interactions work, confirm modals appear
- **Effort**: 20 minutes

### #007: Mobile Tab Icon Refinement
- **Status**: REVIEW
- **Description**: Current: ⚽ Pitch, 📋 Squad, ⚙️ Tools. Consider: ⚽ Pitch, 👥 Squad, ⚡ Tools
- **Effort**: 15 minutes

### #008: Onboarding Tour — Hardcoded Delays
- **Status**: OPEN
- **Location**: `src/components/OnboardingTour.jsx` line ~56
- **Fix**: Replace `setTimeout` with `waitFor()`
- **Effort**: 20 minutes

### #009: PowerToolCard — Description Prop
- **Status**: NOT USED
- **Description**: Component supports `description` prop — add: Wildcard "Unlimited free transfers", Triple Captain "3× captain points", Roulette "Random captain picker"
- **Effort**: 15 minutes

### #010: CSS Animation Performance
- **Status**: REVIEW
- **Description**: PowerToolCard pulse animation defined inline. Move to global CSS, add `prefers-reduced-motion` support.
- **Effort**: 30 minutes

---

## ✅ Completed This Cycle

**Session 4 — Bug Fixes & Player Data**:
- Fixed MarketScreen empty player list (isolated fetch blocks)
- Fixed SquadScreen Tools tab crash (`isLocked` undefined)
- Applied DB migrations 04–07 + `get_server_time` RPC
- Seeded 829 EPL players from CSV
- Added draft entry banner to LeagueScreen (#015)

**Session 5 — Buy/Sell Flow Redesign**:
- `process-transfer` Edge Function (no-repeat, budget, position limits)
- `useTransfer(leagueId)` hook
- `PlayerPickerSheet` component
- SquadScreen empty slots + picker
- MarketScreen taken-by-manager display + league picker
- LeagueScreen squad/market shortcut buttons
- CI fix: `npm ci` → `npm install`

**Session 6 — ESLint / CI Lint Fix**:
- `eslint.config.js`: excluded `supabase/functions/**`, `.claude/**`, `e2e-report/**`, `Skills/**` from linting — fixes Deno `'Deno' is not defined` errors and stray p5.js file errors
- `playwright.config.js`: added `/* global process */` declaration
- `PowerToolCard.jsx`: removed unused `actionLabel`/`colorClass` props from destructure
- `DraftScreen.jsx`: removed unused `autoSaveTimer` state; named auto-save catch variable
- `LeagueScreen.jsx`: prefixed unreferenced `leagueListings` state with `_`
- `MarketScreen.jsx`: removed stale `takenMap`/`reloadTaken` from `useTransfer` destructure
- `SquadScreen.jsx`: added missing `handleChipToggle` and `handleRouletteStart` handler implementations
- `useTransfer.js`: fixed `useCallback` dependency arrays (`user?.id` → `user`) to satisfy React Compiler

---

## 🎯 Recommended Next Cycle

### Unblock the product (~3 hours)
1. **#016** Commissioner panel — transfer windows + cup phase management
2. **#017** Wire trade builder to real squad data
3. **#018** Configure Supabase cron settings (15 min)

### Polish the experience (~2 hours)
4. **#022** Verify/fix player click bottom sheet on mobile Squad screen
5. **#001-E2E** Mock Supabase in E2E for deterministic market tests
6. **#019** Pool pressure indicator on Draft screens

---

## 📊 Metrics

| Category | Current | Target |
|---|---|---|
| E2E Tests Passed | 82/84 (97.6%) | 84/84 (100%) |
| Draft System Stories | 12/12 ✅ | 12/12 |
| DB Migrations | 9 | — |
| Edge Functions | 5 | — |
| Blocking Issues | 1 | 0 |
| High Priority | 3 | 0 |
| Medium Priority | 5 | TBD |
| Low Priority | 5 | TBD |

---

## 📁 Key Files

| File | Purpose |
|---|---|
| `src/screens/DraftScreen.jsx` | Draft submission UI (ranked list, auto-complete, submit) |
| `src/screens/DraftRecoveryScreen.jsx` | Post-lottery gap filling (FCFS, realtime) |
| `src/screens/LeagueScreen.jsx` | League hub (gazette, trade builder, standings, squad shortcuts) |
| `src/screens/SquadScreen.jsx` | Squad management — empty slots, picker sheet, sell via Edge Function |
| `src/screens/MarketScreen.jsx` | Player market — league-scoped, taken-by-manager display |
| `src/components/PlayerPickerSheet.jsx` | Bottom sheet picker (position-filtered, taken/available states) |
| `src/hooks/useTransfer.js` | League-scoped buy/sell hook with takenMap |
| `src/components/GazetteDraftReport.jsx` | Draft report in The Official Gazette |
| `src/components/TransferWindowBanner.jsx` | Live window status banner |
| `src/hooks/useTransferWindow.js` | Transfer window state hook |
| `src/hooks/useRelaxationState.js` | Cup no-repeat relaxation state hook |
| `src/components/PowerToolCard.jsx` | Reusable power tools card |
| `supabase/functions/process-transfer/` | Buy/sell Edge Function (no-repeat, budget, position limits) |
| `supabase/functions/run-draft-lottery/` | Random lottery Edge Function |
| `supabase/functions/run-reverse-standings-draft/` | Reverse-standings draft Edge Function |
| `supabase/functions/eliminate-cup-club/` | Club elimination + gazette + relaxation trigger |
| `supabase/functions/calculate-relaxation/` | No-repeat formula + gazette on tier change |
| `supabase/migrations/` | 9 migrations (schema → crons → players seed) |
| `DRAFT_SYSTEM_DESIGN.md` | Full design doc with decision log |
| `APP_STORE_ASSESSMENT.md` | Mobile app strategy |
| `e2e/platform.spec.js` | E2E test suite (84 tests, 82 passing) |
