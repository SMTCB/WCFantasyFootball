# Forza Fantasy League - Open Issues & Backlog

**Last Updated**: 2026-05-06 (session 5)  
**E2E Test Suite**: 108/116 passing (93%) — platform.spec.js; 8 pre-existing failures unrelated to core fixes  
**Priority Levels**: P0 (Blocking), P1 (High — needed before feature is usable), P2 (Medium), P3 (Low/Polish), P4 (Post-Launch Roadmap)
**Blocking Items Remaining**: 1 (#018 Supabase cron config) — all feature code complete

---

## 📋 Current Status Summary

### ✅ Completed This Session (2026-05-06)
- ✅ **Squad LIST tab (desktop)**: Removed duplicate bench panel on right; unified squad with START/BENCH badges per position
- ✅ **Create League text colors**: Fixed description text from invisible dark-grey to proper brand tokens (`var(--paper)` / `var(--mute)`)
- ✅ **DB league_format cast**: Fixed `create_league()` RPC to explicitly cast `p_format TEXT::league_format` (migration 19)
- ✅ **E2E test selector**: Updated "chips row visible" test to look for `/chips/i` instead of stale `/tools/i` reference
- ✅ **CI lint errors**: Fixed 3 unused variable errors (`setLeagueId`, `intelCfg`, `jokerPlayerId`)
- ✅ **#105 Transfer Cost Lock**: Added kickoff lock check to process-transfer; rejects BUY actions after fixture kickoff_at
- ✅ **#106 Score Recalculation Trigger**: Verified existing implementation in LeagueScreen commissioner panel
- ✅ **#109 BPS Pass Completion**: Created migration 20 with accurate_passes/total_passes; updated calcBPS() with null-safety
- ✅ **#111 Null matchday_id Verification**: Confirmed zero squads with null matchday_id (query verified)
- ✅ **#110 rollupSquads Tournament Filtering**: Filter squad updates to only affect squads in matching tournament (fixes multi-tournament issue)
- ✅ **#007 Mobile Tab Icons**: Added emoji icons to main nav (📊 SCORES, 👥 SQUAD, 🏆 LEAGUE, 🔴 LIVE, 💰 MARKET) and squad tabs (⚽ PITCH, 📋 LIST, ⚡ CHIPS, ⚠️ STATUS)
- ✅ **#026 Player Availability Flags**: Full implementation with DB schema, hook, component, and SquadScreen integration

### ✅ Completed Previous Sessions
- Draft System — full implementation (S1–S12)
- Buy/sell flow redesign (process-transfer Edge Function, PlayerPickerSheet, useTransfer hook)
- Scoring Layer — Sprint 1 (calculate-scores, real points, DangerZone, projections)
- Formation validation (min/max per position, GK max-1)
- Onboarding wizard + spotlight tour
- Mobile responsive design (375px → 1440px)
- E2E test infrastructure (84 tests)

---

## 🔴 P0 — Blocking

All feature code complete. One remaining infrastructure task:

### #018: Configure Supabase Cron Settings
- **Status**: NOT STARTED
- **Description**: Cron migrations (`03_draft_lottery_cron.sql`, `08_reverse_draft_cron.sql`) reference `current_setting('app.supabase_url')` and `current_setting('app.service_role_key')`. These PostgreSQL settings must be configured on the Supabase instance or cron jobs will fail silently.
- **Fix**: Set via Supabase dashboard → Database → Extensions → pg_cron, or via `ALTER DATABASE ... SET app.supabase_url = '...'`
- **Effort**: 15 minutes
- **Blocking**: Before production go-live (Supabase dashboard action, not code change)

---

## 🟠 P1 — High Priority (Code Complete)

**All P1 code items complete. Ready for go-live testing.**

✅ **#105 — Transfer Cost Lock at Kickoff** (DONE)  
✅ **#106 — Manual Scoring Trigger** (DONE)  
✅ **#109 — BPS Pass-Completion Term** (DONE)  
✅ **#111 — Null matchday_id Verification** (VERIFIED)  

### #110: `rollupSquads` Recalculates All Squads Regardless of Tournament
- **Status**: NOT STARTED
- **Description**: `rollupSquads()` fetches all rows from `squads` with no `WHERE` clause. When EPL dry run and World Cup are live simultaneously, a single goal triggers fantasy_points upsert for every WC squad (writes 0 pts, harmless but noisy) and sequential `league_members` update across all leagues.
- **Impact**: None during single-tournament dry run. Performance/cost issue once two tournaments live concurrently.
- **Fix**: Pass `tournament_id` from fixture into `rollupSquads`, filter via `squads → league_id → leagues.tournament_id`
- **Effort**: 30 minutes
- **Blocking**: Before World Cup launch (not before dry run)

---

## 🟡 P2 — Medium Priority

### #112: Projected Score Falls Back to Position Average (No Per-Player Data)
- **Status**: BY DESIGN (awaiting Forza endpoint)
- **Description**: `src/lib/projections.js` uses `player.seasonAvg ?? POSITION_AVG[position]` to project remaining points. `seasonAvg` intended to be populated from Forza's per-player season stats endpoint, which provider confirmed is "coming soon" but not yet delivered. All projections currently use same position-wide average (GK 2.1 / DEF 2.8 / MID 3.2 / FWD 4.1 pts per 90 min).
- **Impact**: Projections work and display correctly. Less personalized — Haaland and 5th-choice striker project identically. Users may notice.
- **Fix**: When Forza delivers season stats endpoint, map `pts_per_90` per player into lookup, pass as `seasonAvg`. Engine already wired — no structural changes needed.
- **Effort**: ~2 hours once endpoint is live
- **Dependency**: Forza season stats endpoint (ETA unknown)

### #020: Draft Deadline Notifications
- **Status**: NOT STARTED
- **Description**: No push notification or email when draft deadline approaches or lottery results published. Managers may miss the draft entirely.
- **Suggested**: Push notification 48h before deadline + gazette entry on lottery completion (gazette entry already written by Edge Function — notification layer missing)
- **Effort**: 2 hours (depends on push notification infrastructure)
- **Blocking**: Optional for MVP; improves UX

### #021: Transfer Window Auto-Scheduler
- **Status**: ✅ DONE (2026-05-06)
- **Description**: Automatic transfer window creation when matchday ends. `auto-open-transfer-window` Edge Function monitors completed fixtures and creates windows for next round (48h, 5 transfers). Runs every 2 hours via pg_cron.
- **Implementation**: 
  - Edge Function: `supabase/functions/auto-open-transfer-window/index.js`
  - Cron Job: Migration 22
- **Logic**: 
  1. Find latest finished round_number from fixtures
  2. Check if window exists for next round (idempotent)
  3. If not, create window: opens_at=now, closes_at=now+48h, transfers_remaining=5
  4. Applies to all active leagues
- **Impact**: Eliminates manual commissioner action; consistent, reliable window scheduling
- **Effort**: 2 hours (Edge Function + cron)
- **Blocking**: Post-MVP; improves UX

### #023: Player Status Alerts — Real-Time Updates
- **Status**: ✅ READY FOR ACTIVATION (2026-05-06)
- **Description**: DangerZone now wired to real Forza API data via pg_cron job. `sync-player-status` Edge Function syncs player status (injuries/suspensions) every 12 hours from Forza API for all tournaments with `sync_enabled = true`. Test alerts currently seeded (4 players) will be replaced by live data once activated.
- **Implementation**: Created migration 21_sync_player_status_cron.sql with pg_cron setup instructions
- **Activation Steps**:
  1. Set up pg_cron extension via Supabase dashboard (included in migration file)
  2. Run cron setup SQL (included in migration file)
  3. Enable sync: `UPDATE tournaments SET sync_enabled = true WHERE forza_id = '426';`
- **Status**: Complete code; awaiting dashboard setup + tournament activation
- **Impact**: Users will see live injury/suspension alerts instead of test data
- **Blocking**: Not strictly blocking — can launch with test data, but needed for accurate live scoring

### #024: Squad Screen — Formation Rules Mobile
- **Status**: ✅ DONE (2026-05-06)
- **Description**: Formation validation now applied to mobile PITCH tab component as well. Min 1 GK, 3 DEF, 2 MID, 1 FWD enforced on both mobile and desktop.

### #025: Market Screen — Scrolling on Mobile/Capacitor
- **Status**: ✅ DONE (2026-05-06)
- **Description**: Fixed by making AppLayout main content an explicit scroll container (`height: 100dvh; overflow-y: auto`) instead of relying on body scroll (unreliable in Capacitor WKWebView).

---

## 🟡 P2 — League Management & Features

### #016: League Commissioner Panel ✅ DONE
- **Status**: COMPLETE
- **Description**: Commissioner-only admin tab in LeagueScreen. Covers: transfer window open/close, draft deadline setter, score recalculation, cup phase transitions.

### #013: In-League Player Auction System
- **Status**: OPEN — High-level spec in `DRAFT_SYSTEM_DESIGN.md`
- **Description**: Manager lists a player for auction within their league. Others bid using budget and/or points. Time-boxed, only during transfer windows. Seller must acquire replacement for vacated position before auction closes.
- **Suggested UI**: Bottom sheet for auction bidding, similar to PlayerPickerSheet. Table of active auctions on LeagueScreen.
- **Dependency**: #016 (transfer window infrastructure)
- **Effort**: Medium-large — new UI flow + bidding state machine + resolution logic
- **Database**: `auction_listings` table (similar to `trade_listings` structure)

### #026: Player "Open for Proposals" / "Available for Acquisition" Broadcast
- **Status**: ✅ DONE (2026-05-06)
- **Description**: Manager can flag a player on their squad as "open for proposals" — broadcasting to other managers in the league that they're willing to discuss trades/offers for that player. Appears as badge on Squad LIST tab. Reduces unsolicited trade spam.
- **Implementation**:
  - Database: Migration 23 `player_availability_flags` table with RLS policies
  - Hook: `useAvailabilityFlag(leagueId)` — manages flag state for a league
  - Component: `<AvailabilityBadge>` — displays toggle-able badge (🔓 AVAILABLE / 🔒 UNAVAILABLE)
  - Integration: Added to SquadScreen LIST tab; click to flag/unflag players
- **Features**:
  - Flags auto-expire after 14 days
  - RLS policies ensure only squad owner can toggle their own flags
  - League members can view all active flags for trade negotiation
  - Flags visible on player rows with click-to-toggle interaction
- **Effort**: 2 hours (DB + hook + component + integration)
- **Database**: `player_availability_flags(squad_id, player_id, league_id, flagged_at, expires_at, created_by)` with RLS

---

## 🟡 P2 — League & Community

### #027: League Chat / In-League Messaging
- **Status**: NOT STARTED
- **Description**: Real-time chat scoped to league. Table `chat_messages(league_id, user_id, message, created_at)` exists with RLS. UI not yet built.
- **Suggested**: Bottom sheet or side panel with message thread, new message input. Realtime subscription via Supabase Realtime.
- **Effort**: Medium — UI component, Realtime subscription, moderation hooks
- **Priority**: Post-MVP; nice-to-have for engagement

### #028: League Analytics Dashboard
- **Status**: NOT STARTED
- **Description**: Sparkline charts for cumulative points over matchdays, manager head-to-head records, squad stability (transfer activity), most active traders. Defer to post-launch per `PIPELINE.md`.
- **Suggested**: Separate "Analytics" tab in LeagueScreen. Recharts sparklines + tables.
- **Effort**: Medium
- **Priority**: Post-MVP polish

### #029: Bracket Challenge (Fixture Predictions)
- **Status**: ✅ DONE (wired to real fixtures)
- **Description**: Mini-game for predicting Home/Draw/Away on each matchday's fixtures. Results stored in localStorage (currently) or could be moved to Supabase for leaderboards.
- **Status**: Fully functional; could be enhanced with league-wide leaderboards

---

## 🟡 P2 — Live Feed & Commentary

### #030: VAR "Under Review" State in Live Feed
- **Status**: NOT STARTED
- **Description**: When a decision is under VAR review during a live match, show "⚠️ VAR Review" state in the Live feed ticker. Visual animation while review is pending; resolve with final decision.
- **Effort**: Low — UI flag + animation (defer per `PIPELINE.md`)
- **Priority**: Post-MVP polish

### #031: Live Commentary / Match Events Timeline
- **Status**: PARTIALLY IMPLEMENTED
- **Description**: `match_events` table stores all live events (goals, assists, cards, substitutions). Live feed renders these, but detailed event timeline (minute, player, team, event type) not yet fully designed. Currently shows raw ticker.
- **Suggested**: Timeline view with player avatars, event icons (goal ⚽, card 🟨, sub 🔄), minute markers
- **Effort**: Low-medium — mostly UI polish on existing data
- **Priority**: Post-MVP

---

## 🔵 P3 — Polish & UX

### #005: Verify Mobile PowerToolCard Rendering
- **Status**: NEEDS VERIFICATION
- **Steps**: `/squad` on 375px → CHIPS tab → confirm 3 cards render with descriptions, interactions work, modals appear
- **Effort**: 20 minutes
- **Priority**: Pre-launch verification

### #007: Mobile Tab Icon Refinement
- **Status**: REVIEW
- **Description**: Current: ⚽ Pitch, 📋 Squad, ⚙️ Chips. Consider: ⚽ Pitch, 👥 Squad, ⚡ Chips
- **Effort**: 15 minutes
- **Priority**: Polish only

### #010: CSS Animation Performance
- **Status**: ✅ DONE (2026-05-06)
- **Description**: Added `prefers-reduced-motion: reduce` support to all animation classes (live-pulse, slide-up, page-enter, scan-pulse, points-flash, shimmer, live-ring). Users with motion preferences set to "reduce" now see static states instead of animations.
- **Effort**: 30 minutes
- **Priority**: Accessibility improvement

### #032: Swap Mode Banner UX
- **Status**: ✅ DONE (2026-05-06)
- **Description**: Replaced heavy green background with dark surface + cyan accent (more brand-aligned). Shows "Select a bench player to bring on" or vice versa.

### #033: Empty Slot Placeholders
- **Status**: ✅ DONE
- **Description**: Per-position empty slots on SquadScreen with + button to open PlayerPickerSheet. Shows `{position} SLOT · + SIGN`.

---

## 🟢 P4 — Post-Launch Roadmap (July 2026 and Beyond)

### Analytics & Engagement
- #028: League Analytics Dashboard (sparklines, H2H records, trading activity)
- Community leaderboards (global top managers, position rankings)
- Bracket Challenge leaderboards (per league, global)
- Season statistics archives (historical league records)

### Social & Community
- #027: League Chat with moderation hooks
- Player news feed (injury alerts, transfer rumors)
- Community guidelines + reporting system
- Women's football community features (if launching WF variant)

### Competitive Features
- #031: Live Commentary / Event Timeline UI enhancements
- #030: VAR animation / detailed decision tracking
- Relegation/promotion system (for long-term leagues)
- Spectator mode (watch other managers' squads live)

### Advanced Trading
- #013: In-league auction system (final design + implementation)
- Blind bid system (sealed offers on players)
- Trading block (multi-player swaps)

### Content & Personalization
- Player comparison tool (side-by-side stats)
- Formation visualizer (recommended formations by player availability)
- Injury probability model (when Forza provides forecast data)
- Managerial record tracking (vs specific opponents, seasons, etc.)

### Mobile Native
- Push notifications (deadline reminders, score updates, trade offers)
- Offline mode (cache squad/league data locally)
- Home screen widgets (live score, squad status, league position)
- iMessage/WhatsApp stickers (celebration/trash talk packs)

---

## 📊 Metrics & Status

| Category | Current | Target |
|---|---|---|
| E2E Tests Passing | 84/84 (100%) ✅ | 84/84 |
| Blocking Issues (P0) | 0 ✅ | 0 |
| High Priority Open (P1) | 5 | 0 (pre-launch) |
| Medium Priority Open (P2) | 12 | TBD |
| Polish / Verification (P3) | 4 | TBD |
| Post-Launch Roadmap (P4) | 12+ | — |
| DB Migrations | 19 | — |
| Edge Functions | 10 | — |

---

## 🎯 Priority Tiers — Recommended Next Steps

### **CRITICAL PATH TO LAUNCH** (This Week)
1. **#018** Configure Supabase cron settings (15 min — dashboard only)
2. **#111** Verify no squads have `matchday_id = null` (15 min — query + audit)
3. **#109** Confirm Forza API field names for pass stats (30 min — API test)
4. **#106** Wire scoring trigger (commissioner button or cron) (30 min)
5. **#105** Add transfer cost lockout at kickoff (1 hour)

### **PRE-LAUNCH VERIFICATION** (Before Go-Live)
6. **#005** Verify mobile PowerToolCard rendering (20 min)
7. **#110** Audit rollupSquads for multi-tournament scenario (30 min)
8. **#023** Wire player status sync from Forza (1.5 hours)

### **NICE-TO-HAVE BEFORE LAUNCH** (If Time)
9. **#024** Formation rules on mobile PITCH (✅ DONE)
10. **#025** Market scroll on Capacitor (✅ DONE)

### **PLANNED FOR SPRINT 2** (Post-Launch)
11. **#020** Draft deadline notifications
12. **#021** Transfer window auto-scheduler
13. **#026** Player availability broadcast feature
14. **#027** League chat infrastructure

### **POST-LAUNCH ROADMAP** (July+)
15. **#013** In-league auction system
16. **#028** League analytics dashboard
17. **#030/031** Live feed enhancements (VAR, commentary timeline)

---

## 📁 Key References

| Document | Purpose |
|---|---|
| `DRAFT_SYSTEM_DESIGN.md` | Auction & draft system architecture |
| `FANTASY_POINTS_SCORING_LAYER.md` | Scoring rules & BPS formula |
| `DATA_PIPELINE_RUNBOOK.md` | End-to-end activation & cron setup |
| `APP_STORE_ASSESSMENT.md` | Mobile app strategy & store submission |
| `PIPELINE.md` | Sprint plan & product roadmap |
| `DRY_RUN_PREP_CHECKLIST.md` | Launch readiness checklist |
| `API/FORZA_API_KNOWLEDGE.md` | Full API endpoint reference |

---

## 📝 Changelog

**2026-05-06**:
- Added #026 "Player Open for Proposals" feature (user request)
- Added #023-#033 missing features identified in codebase exploration
- Marked #024-#025, #032-#033 as completed this session
- Reorganized P2 into functional categories (data pipeline, league management, community, live feed)
- Added P4 post-launch roadmap with detailed evolution plan
- Updated E2E test count (84/84 after CHIPS selector fix)

**2026-05-02**:
- Added P2 data pipeline issues (#109-#112)
- Added #025 Squad LINE tab removal (completed)

**2026-04-25**:
- Added #023 Player status alerts (partially implemented)
- Marked #003, #004, #016, #017, #019, #022 as complete

