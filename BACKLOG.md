# Forza Fantasy League - Open Issues & Backlog

**Last Updated**: 2026-04-23
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

### 🔴 Known Blockers
- MarketScreen player data loading (2 E2E tests) — Supabase connectivity in E2E environment
- `get_server_time` RPC missing — draft deadline server-side validation falls back to client clock

---

## 🔴 P0 — Blocking

### #001: E2E — MarketScreen Player Rendering (2 tests failing)
- **Status**: OPEN
- **Description**: `MarketScreen › renders player list with names` failing on desktop-chrome + mobile-chrome. Player array empty despite fallback data existing.
- **Root Cause**: Unclear — Supabase connectivity in E2E, re-render timing, or fallback logic
- **Attempts**: Error handling added, fallback consolidated, test made lenient — still failing
- **Next Steps**:
  1. Check Supabase RLS + connectivity in test environment
  2. Add detailed state-change logging
  3. Consider mocking Supabase client for deterministic tests
- **Effort**: 1–2 hours

### #014: Missing `get_server_time` RPC
- **Status**: OPEN
- **Description**: `DraftScreen` (S4) and `MarketScreen` both call `supabase.rpc('get_server_time')` for server-side deadline validation. RPC does not exist — calls silently fall back to client clock, which can be spoofed.
- **Fix**: One migration line:
  ```sql
  CREATE OR REPLACE FUNCTION get_server_time()
  RETURNS TIMESTAMPTZ AS $$ SELECT NOW(); $$ LANGUAGE sql STABLE;
  ```
- **Effort**: 5 minutes

---

## 🟠 P1 — High (Draft system not fully usable without these)

### #015: Draft Entry Point in LeagueScreen
- **Status**: NOT STARTED
- **Description**: Routes `/league/:leagueId/draft` and `/league/:leagueId/draft/recover` exist but there is no button or banner in `LeagueScreen` to reach them. Managers cannot start their draft without direct URL access.
- **Fix**: Add a "Draft Open — Submit Your List" banner (green, same style as the recovery gap banner) shown when `draft_deadline` is in the future and the manager has no processed submission yet.
- **Effort**: 30 minutes

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
- **Description**: Trade builder in `LeagueScreen` still uses `MOCK_SQUAD_PLAYERS` (MY PLAYER selector) and `MOCK_PLAYERS_POOL` (THEIR PLAYER selector). Until replaced with live data from `draft_allocations`, the position-cap pre-check (`validateAndSendProposal`) cannot be completed and the `TODO` on line ~122 remains open.
- **Fix**: On trade builder open, fetch current manager's allocated players + target manager's allocated players from `draft_allocations`.
- **Effort**: 1–2 hours

### #006: Database Seeding — Insufficient Test Data
- **Status**: OPEN
- **Description**: Only 7 players seeded. Draft system requires 30+ players to test realistically (auto-complete, conflict resolution, cup pool restrictions).
- **Data needed**: Full player roster (50+ players, all positions), match fixtures with dates, fantasy points history
- **Reference**: `FANTASY_POINTS_SCORING_LAYER.md`
- **Effort**: 2–3 hours

### #018: Configure Supabase Cron Settings
- **Status**: NOT STARTED
- **Description**: Cron migrations (`03_draft_lottery_cron.sql`, `08_reverse_draft_cron.sql`) reference `current_setting('app.supabase_url')` and `current_setting('app.service_role_key')`. These PostgreSQL settings must be configured on the Supabase instance or the cron jobs will fail silently.
- **Fix**: Set via Supabase dashboard → Database → Extensions → pg_cron, or via `ALTER DATABASE ... SET app.supabase_url = '...'`
- **Effort**: 15 minutes (config, not code)

---

## 🟡 P2 — Medium

### #003: Squad Screen — Desktop Enhancement (Phase 4)
- **Status**: NOT STARTED
- **Description**: Enhance desktop sidebar Chips tab to use `PowerToolCard` components for visual parity with mobile.
- **Location**: `src/screens/SquadScreen.jsx` ~lines 1092–1098
- **Effort**: 45 minutes

### #004: Squad Screen — Onboarding Tour Update (Phase 5)
- **Status**: NOT STARTED
- **Description**: Add tour step for `data-tour="squad-power-tools"` highlighting the 3 power tool cards.
- **Location**: `src/screens/SquadScreen.jsx` ~lines 77–93 (`SQUAD_TOUR_STEPS`)
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

**Session 1 — E2E Fixes & Sync**: localStorage timing fix, skipOnboarding helper, MarketScreen fallback, code sync (commits 7fd1ee3, 51d4643)

**Session 2 — App Store Assessment**: Store readiness, cost estimate ($64K MVP), Capacitor architecture, phase 1–3 roadmap

**Session 3 — Draft System Design**: Full brainstorming → design → decision log → `DRAFT_SYSTEM_DESIGN.md`

**Session 3 — Draft System Implementation (S1–S12)**:
- S1: DB schema (7 tables, 4 enums, `league_config` with all formula constants)
- S2–S4: `DraftScreen` (ranked list, auto-complete, server-time submit, auto-save)
- S5: `run-draft-lottery` Edge Function + pg_cron
- S6: `GazetteDraftReport` component
- S7: `DraftRecoveryScreen` (FCFS, realtime, optimistic UI)
- S8: Transfer window DB triggers + `useTransferWindow` hook + `TransferWindowBanner`
- S9: Trade UI extensions (window gating, position check, listing toggle, `trade_listings` table)
- S10: Cup pool management (`get_cup_available_players`, `eliminate-cup-club` Edge Function)
- S11: Relaxation formula (`calculate_relaxation_state`, `apply_relaxation_state`, `calculate-relaxation` Edge Function)
- S12: `run-reverse-standings-draft` Edge Function + pg_cron

---

## 🎯 Recommended Next Cycle

### Immediate (unblock draft system — ~4 hours total)
1. **#014** `get_server_time` RPC — 5 min
2. **#018** Configure cron settings — 15 min
3. **#006** Database seeding — 2–3 hours
4. **#015** Draft entry banner — 30 min

### Make it usable (~4–5 hours)
5. **#016** Commissioner panel (transfer windows + cup phase management)
6. **#017** Wire trade builder to real squad data

### Polish the experience (~2 hours)
7. **#001** Resolve MarketScreen E2E blocker
8. **#019** Pool pressure indicator
9. **#003** Desktop Squad Screen Phase 4
10. **#004** Onboarding tour Phase 5

---

## 📊 Metrics

| Category | Current | Target |
|---|---|---|
| E2E Tests Passed | 82/84 (97.6%) | 84/84 (100%) |
| Draft System Stories | 12/12 ✅ | 12/12 |
| DB Migrations | 8 | — |
| Edge Functions | 4 | — |
| Blocking Issues | 2 | 0 |
| High Priority | 5 | 0 |
| Medium Priority | 5 | TBD |
| Low Priority | 5 | TBD |

---

## 📁 Key Files

| File | Purpose |
|---|---|
| `src/screens/DraftScreen.jsx` | Draft submission UI (ranked list, auto-complete, submit) |
| `src/screens/DraftRecoveryScreen.jsx` | Post-lottery gap filling (FCFS, realtime) |
| `src/screens/LeagueScreen.jsx` | League hub (gazette, trade builder, standings) |
| `src/screens/SquadScreen.jsx` | Squad management (1,290+ lines, mobile-focused) |
| `src/components/GazetteDraftReport.jsx` | Draft report in The Official Gazette |
| `src/components/TransferWindowBanner.jsx` | Live window status banner |
| `src/hooks/useTransferWindow.js` | Transfer window state hook |
| `src/hooks/useRelaxationState.js` | Cup no-repeat relaxation state hook |
| `src/components/PowerToolCard.jsx` | Reusable power tools card |
| `supabase/functions/run-draft-lottery/` | Random lottery Edge Function |
| `supabase/functions/run-reverse-standings-draft/` | Reverse-standings draft Edge Function |
| `supabase/functions/eliminate-cup-club/` | Club elimination + gazette + relaxation trigger |
| `supabase/functions/calculate-relaxation/` | No-repeat formula + gazette on tier change |
| `supabase/migrations/` | 8 migrations (schema → crons) |
| `DRAFT_SYSTEM_DESIGN.md` | Full design doc with decision log |
| `APP_STORE_ASSESSMENT.md` | Mobile app strategy |
| `e2e/platform.spec.js` | E2E test suite (84 tests, 82 passing) |
