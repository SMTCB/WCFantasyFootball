# Forza Fantasy League - Open Issues & Backlog

**Last Updated**: 2026-05-02
**E2E Test Suite**: 84/84 passing (100%) — platform.spec.js (84)
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

### #001-E2E: MarketScreen E2E Tests ✅ RESOLVED
- **Status**: DONE — `page.route('**/rest/v1/players**')` intercepts Supabase REST in E2E and returns fixture PL player data. Test now looks for `Salah|Haaland|Kane|De Bruyne|Saka`. DB-independent.

---

## 🟠 P1 — High

### #016: League Commissioner Panel
- **Status**: ✅ DONE — Commissioner-only tab in LeagueScreen (visible to `leagues.created_by`). Covers: transfer window open/close (with datetime inputs), draft deadline setter, score recalculation by fixture ID, cup phase seed trigger.
- **Description**: Several backend capabilities have no admin surface:
  - Open/close transfer windows (insert rows into `transfer_windows`)
  - Advance cup phase (`cup_phase` enum transitions)
  - Eliminate a cup club (calls `eliminate-cup-club` Edge Function)
  - Seed cup clubs when entering cup mode (calls `seed_cup_clubs()`)
  - Set draft deadline on a league
- **Suggested approach**: A commissioner-only tab inside `LeagueScreen` (visible only to `leagues.created_by`).
- **Effort**: 2–3 hours

### #017: Wire Trade Builder to Real Squad Data
- **Status**: ✅ DONE — All mock player arrays removed from LeagueScreen. `loadTradeSquads()` fetches both managers' `draft_allocations` and resolves via `players` table. `loadManagerRoster()` populates the roster sheet.

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
- **Status**: ✅ DONE — Full rewrite. Fetches real fixtures from Supabase, grouped by gameweek. Fixture Challenge mini-game: Home/Draw/Away predictions per match, stored in localStorage. Result feedback (✓/✗) on finished matches. Accuracy % in header. Falls back to 8 PL fixture rows if DB empty.

### #108: HomeScreen — PL Club Fallback Data
- **Status**: ✅ DONE — Header label updated ("World Cup 2026" → "Premier League 2025/26"). TEAM_COLORS replaced (9 national teams → 12 PL clubs with real brand colours). Fallback fixtures updated to PL clubs.

### #019: Pool Pressure Indicator in Draft & Squad Screens
- **Status**: ✅ DONE — Colour-coded banner (green/amber/red at 70%/90%) added to `DraftScreen` and `DraftRecoveryScreen`. Shows pressure %, repeat allowance count, and pool size. Hidden for non-cup leagues (`availablePool === null`).

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
- **Status**: ✅ DONE — Root cause was `<div onClick>` in `PlayerCard` (both pitch + row variants). Converted to `<button type="button">`. Also added dismiss backdrop behind action sheet. iOS Safari touch events now fire reliably.

---

## 🟡 P2 — Data Pipeline (added 2026-05-02)

### #113: Player uniqueness was global, not per-tournament ✅ FIXED 2026-05-02
- **Status**: RESOLVED
- **Description**: `players_forza_player_id_idx` enforced `UNIQUE(forza_player_id)` globally. Forza player IDs are real-person identifiers — Bukayo Saka has the same ID whether appearing in EPL (Arsenal) or WC (England). Syncing both would overwrite EPL players with WC data.
- **Fix**: Migration 18 drops the global index and adds `UNIQUE(forza_player_id, tournament_id)`. `sync-players` now sets `id = 'fp-{forza_player_id}-{tournament_id}'` and upserts on `forza_player_id,tournament_id`. `ingest-match-events` player lookup now also filters by `tournament_id`.

### #109: BPS pass-completion term is always zero
- **Status**: NOT STARTED
- **Description**: `calcBPS()` in `calculate-scores` computes `(accurate_passes / total_passes) * 100 * 0.1` but `player_match_stats` has no `accurate_passes` or `total_passes` columns, and `ingest-match-events` never fetches them from E10. The term always evaluates to 0.
- **Impact**: Low — BPS ranking is still correct in relative terms (same handicap for all players). Bonus allocation (+3/+2/+1) may occasionally favour the wrong player at the margin. No effect on base points.
- **Fix**: (a) Confirm E10 stat key names for passes (likely `accurate_passes` and `passes`). (b) Add columns to `player_match_stats` via migration. (c) Map in `flattenPlayerStats()` in `ingest-match-events`. (d) Remove the dead-code check in `calcBPS`.
- **Effort**: 1 hour
- **Dependency**: Confirm E10 field names with Forza (quick API test)

### #110: `rollupSquads` recalculates all squads regardless of tournament
- **Status**: NOT STARTED
- **Description**: `rollupSquads()` in `calculate-scores` fetches every row from `squads` with no `WHERE` clause. When EPL dry run and World Cup are live simultaneously, a Matchday 36 EPL goal triggers a `fantasy_points` upsert for every WC squad (writing 0 pts, harmless but noisy) and a sequential `league_members` update loop across all leagues.
- **Impact**: None during single-tournament dry run. Becomes a performance and cost issue once two tournaments are live concurrently.
- **Fix**: Pass `tournament_id` from the fixture into `rollupSquads`, then filter via `squads → league_id → leagues.tournament_id`.
- **Effort**: 30 minutes
- **Blocking**: Before World Cup launch (not before dry run)

### #111: `matchday_id` null fallback may cause silent points overwrite
- **Status**: NEEDS VERIFICATION
- **Description**: `rollupSquads` writes `fantasy_points` rows keyed on `(squad_id, matchday_id)`. If a squad has `matchday_id = null`, the fallback `'current'` is used — meaning every fixture for that squad writes to the same row and overwrites rather than accumulates. League totals would reflect only the most recent fixture's contribution.
- **Impact**: Silent — scores would look plausible but be wrong.
- **Fix**: Verify no squads have `matchday_id = null` before dry run go-live. Query: `SELECT id, matchday_id FROM squads WHERE matchday_id IS NULL;`. If any exist, trace how `matchday_id` is assigned at squad creation.
- **Effort**: 15-minute verification; fix depends on root cause

### #112: Projected score is position-average only — no per-player historical data
- **Status**: BY DESIGN (pending Forza endpoint)
- **Description**: `src/lib/projections.js` uses `player.seasonAvg ?? POSITION_AVG[position]` to project remaining points. The `seasonAvg` field is intended to be populated from Forza's per-player season statistics endpoint, which the provider confirmed is "coming soon" but has not been delivered. Until it arrives, all projections fall back to the same position-wide average (GK 2.1 / DEF 2.8 / MID 3.2 / FWD 4.1 pts per 90 min).
- **Impact**: Projections work and display correctly. They are less personalized — Haaland and a 5th-choice striker project identically. Users may notice star players project lower than expected.
- **Fix**: When Forza delivers the season stats endpoint, map `pts_per_90` per player into a lookup and pass as `seasonAvg` into `calculateProjection()`. The engine is already wired to use it — no structural changes needed.
- **Effort**: ~2 hours once the endpoint is live
- **Dependency**: Forza season stats endpoint (ETA unknown)

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
- **Steps**: `/squad` on 375px → Tools tab → confirm 3 cards render with descriptions, interactions work, confirm modals appear
- **Effort**: 20 minutes

### #007: Mobile Tab Icon Refinement
- **Status**: REVIEW
- **Description**: Current: ⚽ Pitch, 📋 Squad, ⚙️ Tools. Consider: ⚽ Pitch, 👥 Squad, ⚡ Tools
- **Effort**: 15 minutes

### #008: Onboarding Tour — Hardcoded Delays
- **Status**: ✅ DONE — Replaced 3× setTimeout retry (100/300/600ms) with `waitForElement()` using MutationObserver. Fires the exact tick the target element appears. Removed unused rafRef.

### #009: PowerToolCard — Description Prop
- **Status**: ✅ DONE — Description prop added to all 5 PowerToolCard usages (mobile × 3, desktop × 2): Wildcard "Unlimited free transfers this matchday", Triple Cap "3× captain points — or 0 if they don't play", Roulette "Random captain picker — spin to decide".

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

### Unblock the product
1. **#018** Configure Supabase cron settings (15 min — dashboard config only)
2. **#105** Transfer cost lock at kickoff — Edge Function update
3. **#106** Wire scoring cron or confirm commissioner button calls Edge Function

### Polish / roadmap
4. **#005** Verify mobile PowerToolCard rendering at 375px (visual check)
5. **#021** Transfer window auto-scheduler (Edge Function + cron)
6. **#020** Draft deadline push notifications

---

## 📊 Metrics

| Category | Current | Target |
|---|---|---|
| E2E Tests Passed | 116/116 (100%) ✅ | 116/116 |
| Draft System Stories | 12/12 ✅ | 12/12 |
| DB Migrations | 17 | — |
| Edge Functions | 10 | — |
| Blocking Issues | 0 ✅ | 0 |
| High Priority Open | 3 | 0 |
| Medium Priority Open | 6 | TBD |
| Low Priority Open | 2 | TBD |

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
| `supabase/functions/sync-fixtures/` | Forza → fixtures + matchday_deadlines tables |
| `supabase/functions/sync-players/` | Forza → teams + players tables |
| `supabase/functions/sync-player-status/` | Forza → player_status (injury/suspension) |
| `supabase/functions/ingest-match-events/` | Live match data → player_match_stats + match_events |
| `supabase/functions/calculate-scores/` | Fantasy points engine (BPS, chips, Realtime broadcast) |
| `supabase/migrations/` | 17 migrations (schema → crons → players seed → Forza integration) |
| `DATA_PIPELINE_RUNBOOK.md` | End-to-end runbook: activation steps, cron setup, WC launch |
| `API/FIT_GAP_ANALYSIS.md` | Scoring rule vs Forza API data availability audit |
| `API/FORZA_API_KNOWLEDGE.md` | Full API endpoint reference with field documentation |
| `DRAFT_SYSTEM_DESIGN.md` | Full design doc with decision log |
| `APP_STORE_ASSESSMENT.md` | Mobile app strategy |
| `e2e/platform.spec.js` | E2E test suite (84 tests, 82 passing) |
