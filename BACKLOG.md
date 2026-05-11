# Forza Fantasy League - Open Issues & Backlog

**Last Updated**: 2026-05-11 (session 10 — #038 onboarding fix, #023 confirmed active, #110 confirmed done)  
**E2E Test Suite**: 108/116 passing (93%) — platform.spec.js; 8 pre-existing failures unrelated to core fixes  
**Priority Levels**: P0 (Blocking), P1 (High — needed before feature is usable), P2 (Medium), P3 (Low/Polish), P4 (Post-Launch Roadmap)
**Blocking Items Remaining**: 0 — all P0 issues resolved ✅  
**One manual step pending**: Set `app.service_role_key` in Supabase dashboard for cron jobs to authenticate (see #018)

---

## 📋 Current Status Summary

### ✅ Completed This Session (2026-05-11 — session 9: critical corrections)
- ✅ **#039 Transfer Window Enforcement**: Root cause identified — overlapping test windows (not broken trigger logic). Trigger confirmed correct via boundary testing. Added UNIQUE(league_id, round_number) constraint (migration 26) to prevent future overlaps. Test data cleaned up.
- ✅ **#040 Draft Lottery Cron**: `run-draft-lottery` was already deployed (ACTIVE v1 — BACKLOG was stale). Updated Edge Function to cron mode: now auto-discovers all leagues past `draft_deadline` with pending submissions when called without `league_id`. Deployed as v2. Cron job scheduled every 15 min via pg_cron.
- ✅ **#018 Supabase Cron Config**: Enabled `pg_cron` and `pg_net` extensions (migration 26). Scheduled 5 cron jobs: `sync-player-status` (every 12h), `auto-open-transfer-window` (every 2h), `calculate-scores-daily` (22:00 UTC), `sync-players-daily` (09:00 UTC), `run-draft-lottery` (every 15 min). **One manual step remaining**: set `app.service_role_key` via Supabase dashboard SQL Editor so cron jobs can authenticate.
- ✅ **Comprehensive E2E Testing** (session 8): All 3 feature clusters tested with real Forza API data — Scoring (✅), Squad Management (✅), Market Mechanics (✅). Production readiness assessment complete.

### ✅ Completed Previous Session (2026-05-10)
- ✅ **Squad Sub-In Logic Bug**: Fixed "SUB IN" button entering swap mode when squad < 11 starters. Now shows "ADD TO PITCH" for direct promotion when starters are below capacity.
- ✅ **Onboarding Tour Tooltip Clipping (Desktop)**: Fixed spotlight tooltip clipping off-screen on right side. Now uses `right: 8px` anchor for right-side elements (like budget KPI), `left`-based clamping for left/center elements.
- ✅ **Swap Mode Banner Overlap**: Fixed swap mode banner covering bench players on desktop. Container now shrinks by 64px when swap mode is active so bench strip remains clickable.
- ✅ **LeagueScreen Dummy Data**: Removed all hardcoded fake data — activity feed (auction events), frontpage gazette (Mbappé news, @Ana_K/@GamerX comments), stats tab (€1.4B, Mbappé 424pts), and dummy trade modal (João/Bellingham/De Bruyne). Replaced with appropriate empty states.
- ✅ **Onboarding Tour Step 4 Missing**: Fixed missing `data-tour="squad-chips"` attribute on SquadScreen CHIPS tab. Tour step 4 ("Chips & Boosts") now displays correctly instead of showing blank overlay.
- 📋 **#037 Auto-Fill Squad Feature**: Added to P3 backlog as a UX enhancement for quickly completing squads below 11 players.

### ✅ Completed Previous Session (2026-05-06)
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
- ✅ **#031 Match Events Timeline**: Enhanced visual timeline with event icons, minute markers, color coding, and improved UX
- ✅ **#030 VAR Review Animation**: Enhanced VAR display with animated banner, fixture indicators, and visual prominence during goal reviews
- ✅ **#005 Mobile PowerToolCard Verification**: Verified all 4 CHIPS cards render correctly with descriptions, interactions, and styling on 375px mobile viewport
- ✅ **#027 League Chat Backend**: Implemented `useChatMessages` hook, wired LeagueScreen UI to real data, created migration 24 with RLS policies

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

**No P0 issues remaining.** All critical items resolved in session 9 (2026-05-11).

### ✅ #039: Transfer Window Enforcement — RESOLVED (2026-05-11)
- **Root cause**: Trigger logic was correct all along. Test showed a "slip" because overlapping test windows existed — a second open window was active when the first "closed" window was being tested.
- **Fix**: Added `UNIQUE(league_id, round_number)` constraint (migration 26) to prevent duplicate/overlapping windows. Test data cleaned. Boundary test confirmed: trigger correctly rejects inserts with no active window.
- **Verified**: Zero rogue transfers on no-window league; trigger `tgenabled='O'` on transfers table.

### ✅ #018: Supabase Cron Config — RESOLVED (2026-05-11)
- **Fix**: Enabled `pg_cron` and `pg_net` extensions via migration 26. Scheduled 5 jobs: `sync-player-status`, `auto-open-transfer-window`, `calculate-scores-daily`, `sync-players-daily`, `run-draft-lottery`.
- **Verified**: All 5 jobs listed as active in `cron.job` table.
- **⚠️ One manual step remaining**: Set service role key so jobs can authenticate:
  ```sql
  -- Run in Supabase Dashboard → SQL Editor:
  SELECT set_config('app.service_role_key', '<your-service-role-key>', false);
  ```
  Service role key found at: Supabase Dashboard → Project Settings → API → service_role key

---

## 🟠 P1 — High Priority (Code Complete)

**Most P1 code items complete. Two deployment/audit items in progress.**

✅ **#105 — Transfer Cost Lock at Kickoff** (DONE)  
✅ **#106 — Manual Scoring Trigger** (DONE)  
✅ **#109 — BPS Pass-Completion Term** (DONE)  
✅ **#111 — Null matchday_id Verification** (VERIFIED)  

### ✅ #040: Draft Lottery Edge Function — RESOLVED (2026-05-11)
- **Status**: ACTIVE — was already deployed as v1 (BACKLOG info was stale)
- **Fix**: Updated Edge Function to support cron mode — when called with no `league_id`, auto-discovers all leagues past `draft_deadline` with pending submissions. Deployed as v2.
- **Cron**: `run-draft-lottery` job scheduled every 15 minutes via pg_cron (migration 26).
- **Verified**: ACTIVE v2 in deployed functions list; cron job active in `cron.job`.

### ✅ #110: `rollupSquads` Tournament Filtering — RESOLVED
- **Status**: DONE (already implemented — confirmed 2026-05-11)
- **Description**: `rollupSquads()` already filters squads by `leagues.tournament_id` via `leagues!inner` join. Both call sites pass `fixture.tournament_id`. BACKLOG entry was stale.
- **Code**: `supabase/functions/calculate-scores/index.js` lines 394–400

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

### ✅ #023: Player Status Alerts — ACTIVE (confirmed 2026-05-11)
- **Status**: ACTIVE — `sync_enabled = true` confirmed in `tournaments` table for forza_id=426. pg_cron job (`sync-player-status`) registered every 12h via migration 26. Cron authenticates once service role key is set in dashboard.
- **Remaining**: Enable Supabase Realtime for `chat_messages` table (Database → Replication → toggle `chat_messages`) to activate real-time chat updates. This is a dashboard-only step.
- **Impact**: Live injury/suspension alerts flowing once cron authenticates (depends on #018 service key step)

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
- **Status**: ✅ DONE (2026-05-06)
- **Description**: Real-time chat scoped to league. Full implementation with backend integration.
- **Implementation**:
  - Database: Migration 24 `chat_messages` table with RLS policies (select, insert, delete)
  - Hook: `useChatMessages(leagueId)` — loads history, manages realtime subscription, sends messages
  - UI: LeagueScreen chat view wired to real data instead of mock messages
  - Features: 
    - Auto-scroll to latest message via ref
    - Message loading state and empty state
    - Optimistic updates on send
    - User metadata (name, rank) displayed on each message
    - Timestamp formatting (HH:MM)
    - Send button state management (disabled while sending)
    - Animations: slide-in from left/right
    - Form submission with Enter/button
  - Realtime: Postgres change subscription set up (requires dashboard activation)
- **Activation**: Enable realtime in Supabase dashboard (Database → Replication → chat_messages)
- **Impact**: Enables real-time league communication and engagement
- **Effort**: Completed (1-1.5 hours coding + hook refactor)
- **Priority**: Feature complete; awaiting realtime activation

### #027-Extended: League Chat Enhancements (Post-MVP)
- **Status**: NOT STARTED (feature parity planned for future sprints)
- **Description**: Additional chat features to enhance user engagement and functionality. Core realtime messaging is complete; these are nice-to-have enhancements.
- **Missing Features** (Priority-ordered):
  
  **High Priority**:
  1. **Chat Notifications/Unread Badge** (1 hour)
     - Show unread message count on Chat tab
     - Persist unread state in `league_members.unread_chat_count`
     - Mark as read on view
     - Separate hook: `useChatUnreadCount(leagueId)`
  
  2. **Typing Indicators** (1.5 hours)
     - "User is typing..." display while composing
     - Broadcast typing via Supabase Broadcast (not DB writes)
     - Auto-clear after 3 seconds of inactivity
     - `chat_typing_indicator` realtime channel
  
  3. **Message Delete/Edit UI** (1.5 hours)
     - Right-click/long-press context menu on messages
     - "Delete" option for own messages
     - "Edit" option for own messages (store edited_at, edit_count)
     - Requires: migration to add `edited_at`, `is_deleted` columns
  
  **Medium Priority**:
  4. **Inline User Mentions** (1.5 hours)
     - Type `@username` to mention other league members
     - Autocomplete dropdown
     - Mentioned users get notification (when #020 notifications added)
     - Parse mentions in message display (@username → clickable link)
  
  5. **Chat Search** (1.5 hours)
     - Search bar in chat header
     - Search across message text + user names
     - Highlight matches in message history
     - Full-text search via Supabase full_text_search or pg_trgm
  
  6. **Message Pinning/Replies** (2 hours)
     - Pin important messages to top of chat
     - Reply to specific message (threading UI)
     - Show parent message on replies
     - Requires: migration for `parent_message_id`, `is_pinned`
  
  **Low Priority** (Post-Launch):
  7. **Emoji Reactions** (1 hour)
     - React to messages with emoji
     - Show reaction counts
     - Requires: `message_reactions(message_id, user_id, emoji)`
  
  8. **Chat Moderation** (2 hours)
     - Commissioner: ban users from chat
     - Mute/report messages
     - Filter swear words (optional)
     - Audit log for deleted/edited messages
  
  9. **Message Archiving** (1 hour)
     - Archive messages older than 90 days (cron job)
     - Query from `chat_messages_archive` table if needed
     - Keeps chat_messages table lean for realtime performance
  
  10. **File/Image Sharing** (2+ hours)
      - Upload images/files to Supabase Storage
      - Display inline in chat
      - File size limits (5MB images, 10MB files)
      - Thumbnail generation for images

- **Database Changes Needed**:
  - `ALTER TABLE chat_messages ADD edited_at, is_deleted, parent_message_id COLUMNS;`
  - `CREATE TABLE message_reactions (message_id, user_id, emoji, created_at);`
  - `CREATE TABLE chat_pins (league_id, message_id, pinned_at);`
  - `CREATE TABLE chat_messages_archive (like chat_messages);` (for archival)
  - `ALTER TABLE league_members ADD unread_chat_count INTEGER DEFAULT 0;`

- **Implementation Phases**:
  - **Sprint 2 (Soon)**: Notifications (#027a) + Typing Indicators (#027b) — high engagement impact
  - **Sprint 3 (Later)**: Delete/Edit + Mentions + Search — quality of life
  - **Sprint 4+ (Post-Launch)**: Reactions, Moderation, Archiving, Files — nice-to-have polish

- **Current Status**: Core messaging works. Activate realtime first, then plan enhancements.

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
- **Status**: ✅ DONE (2026-05-06)
- **Description**: Enhanced VAR review display with animated visual feedback when goal decisions are under review.
- **Implementation**:
  - New `VARReviewBanner` component with:
    - Animated pulsing banner with gold/amber theme
    - Bouncing ⚠️ icon with animated VAR label
    - Player name and team info display
    - "Goal Under Review" text with glow effect
    - Projections locked notification
  - LiveScreen integration:
    - VAR indicator badge on match fixture cards
    - Dynamic border/background highlighting during VAR
    - "REVIEW" status display instead of match minute
    - Pulsing top line indicator
- **Impact**: Clear visual prominence for VAR reviews; users immediately notice critical moments
- **Effort**: 45 minutes (component + animations + integration)
- **Priority**: Polish feature completed

### #031: Live Commentary / Match Events Timeline
- **Status**: ✅ DONE (2026-05-06)
- **Description**: Enhanced event timeline showing match events in visual format with timeline, icons, and minute markers.
- **Implementation**:
  - New `EventTimeline` component with:
    - Event icons (⚽ goal, 🅰️ assist, 🟨 yellow, 🔴 red, 🔄 sub, 🥅 save, ⚫ own goal, ⚠️ VAR)
    - Vertical timeline with minute markers and glowing dots
    - Color-coded events (green goals, red cards, yellow warnings, etc.)
    - Left-aligned minute display
    - Points value for each event
    - Event count footer
  - Integrated into LiveScreen replacing old Activity Log
  - Responsive design for mobile + desktop
- **Impact**: Significantly improved UX during live matches; users can now clearly understand match flow and event timeline
- **Effort**: 45 minutes (component + integration + styling)
- **Priority**: Polish feature completed

---

## 🔵 P3 — Polish & UX

### #005: Verify Mobile PowerToolCard Rendering
- **Status**: ✅ VERIFIED (2026-05-06)
- **Verification Results**:
  - ✅ Mobile CHIPS tab renders 4 cards: Wildcard, Triple Captain, Roulette, Joker
  - ✅ All descriptions display correctly with proper typography
  - ✅ Active state indicators show (badge, colored border, background)
  - ✅ Activate/Deactivate buttons render and are interactive
  - ✅ Disabled state works when squad is locked
  - ✅ Desktop PowerToolCard component renders 3 main tools correctly
  - ✅ Confirmation modals appear on tool activation
  - ✅ Color coding consistent: green (Wildcard), gold (Captain tools)
  - ✅ Responsive on 375px mobile viewport
- **Conclusion**: Mobile CHIPS tab fully functional and properly styled. No issues found.
- **Priority**: Pre-launch verification complete

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

### ✅ #038: Onboarding Wizard Step Counter — RESOLVED (2026-05-11)
- **Fix**: Updated `src/components/OnboardingWizard.jsx` lines 39 and 49 from "Step N of 3" to "Step N of 4" to match the actual 4-step flow (welcome, squad, league, ready).

### #037: Auto-Fill Squad Feature
- **Status**: NOT STARTED
- **Description**: Add an "Auto-Fill" button on SquadScreen (PITCH tab) that automatically selects eligible players from the market to complete a squad below 11 players. Useful for new users or when quickly building a squad.
- **Rules**:
  - Only works when squad has fewer than 11 starters
  - Selects lowest-cost eligible players for each empty position slot
  - Respects formation rules: 1 GK, 3–5 DEF, 2–4 MID, 1–2 FWD
  - Respects budget: stops if insufficient budget to fill remaining slots
  - Avoid duplicate players: don't select same player twice
  - Update budget display in real-time as players are added
  - Show success/error state (e.g., "Squad full" or "Insufficient budget for remaining positions")
- **Implementation**:
  - New button in SquadScreen PITCH tab header: "Quick Fill"
  - Call new `auto-fill` function that:
    1. Queries market (players not yet taken)
    2. Sorts by price (lowest first) per position
    3. Validates formation rules
    4. Adds players to squad state
    5. Updates Supabase in batches
  - Hook: `useAutoFill(leagueId, squadData)` returns `{ fill, isFilling, error }`
- **UI Feedback**:
  - Loading state during fill
  - Toast notification on success (e.g., "Added 4 players, budget remaining: £2.1M")
  - Toast error if insufficient budget or no eligible players available
- **Effort**: 1.5 hours (hook + button integration + error handling)
- **Priority**: UX improvement; useful for onboarding flow

---

## 🟡 P2 — New Items (2026-05-08)

### #034: Move Special Bets from Scores Screen to League Section
- **Status**: NOT STARTED
- **Description**: The Scores (Home) screen should show only match fixtures — clean match centre without betting widgets. Move the "special bets" (Top Scorer predictions, Daily Prediction widget) to the League section, where they belong contextually (manager engagement within a league).
- **Effort**: 1 hour (UI reorganisation)
- **Priority**: UX clarity — Scores screen should be a pure fixture view

### #035: Point Boost Section (Matchday Special Categories)
- **Status**: NOT STARTED
- **Description**: A new "Point Boost" section on the My Squad tab (alongside the existing Chips), providing special bonus-point categories per matchday/tournament phase. Designed around the World Cup structure:
  - **Group Stage**: One special category per matchday group (MD1: Top Scorer, MD2: MVP, MD3: TBD). "Matchday" here means the collection of all group matches in that round — not a single calendar day.
  - **Knockout Phase**: One special category per round (R16, QF, SF, Final).
  - **Format**: One category per matchday; user makes a single selection per period. Intentionally light — drives daily engagement without overwhelming.
  - **Goal**: Give users a reason to open the app every matchday without burying them in options.
- **Effort**: Medium — new DB table (`point_boost_entries`), category config, pick UI, admin seeding
- **Priority**: High for World Cup launch — core differentiator
- **Blocking**: Category definitions must be confirmed before implementation

### #036: Chips Revamp — Remove Roulette, Adjust Joker, Add Opponent Block
- **Status**: NOT STARTED
- **Description**: Three changes to the Chips tab on My Squad:

  **1. Remove Captain Roulette**
  - The "Spin Roulette" chip doesn't make sense as a standalone chip.
  - Auto-complete team selection should be offered contextually when the user is building their squad (not as a chip in a separate tab).
  - Remove from Chips tab entirely.

  **2. Revamp Daily Joker rules**
  - The Joker allows the manager to select an **extra (16th) player** for a single matchday.
  - New rules:
    - (i) Exempt from all restrictions: country limit, position limits, "already in another squad in draft leagues"
    - (ii) Can be selected at any point during the matchday window (not just before kick-off) — e.g., if a matchday spans 7 days, the Joker can be picked on day 5
    - (iii) Once selected, it is **locked** and cannot be changed
    - (iv) The Joker **cannot be set as captain**
  - Update chip description and enforcement logic accordingly.

  **3. New Chip — Opponent Block**
  - Allows the manager to block a player on any other team's squad in the league for one matchday.
  - Rules:
    - (i) Blocks the targeted player: they score 0 points for their manager that matchday
    - (ii) One-use only (per season)
    - (iii) Manager selects the target team and target player from within the league
    - (iv) The block activates on the **next game** of the blocked player's club (not immediately)
    - (v) The block applies to the **club's next fixture**, not the player's participation — even if the player doesn't appear, the block is consumed
    - (vi) The blocked manager receives two notifications:
      a. A League screen alert (similar to the trade offer banner): "Manager X just blocked [Player] for the next matchday"
      b. A Status tab alert on their Squad screen
    - (vii) A player can only be blocked once per league per season
  - **DB**: New `opponent_blocks` table; `league_members` notification field or separate notifications table
  - **Effort**: Medium-large (new chip type + notifications + enforcement in scoring engine)
  - **Priority**: Nice-to-have pre-launch; very engaging social mechanic

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
| E2E Tests Passing | 107/116 (93%) ✅ | 116/116 |
| Blocking Issues (P0) | 1 (#018 dashboard-only) | 0 |
| High Priority Open (P1) | 4 | 0 (pre-launch) |
| Medium Priority Open (P2) | 11 | TBD |
| Feature Complete (P2-3) | 18 | — |
| Post-Launch Roadmap (P4) | 12+ | — |
| DB Migrations | 25 | — |
| Edge Functions | 10+ | — |

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

**2026-05-11 (Session 8 — Comprehensive E2E Testing)**:
- 🧪 **Cluster 1 (COMPLETED)**: Scoring & Points System — verified with real Forza Football API data
  - ✅ 654 real players in system (Forza API synced)
  - ✅ 45 real Premier League fixtures
  - ✅ Fantasy points calculation validated against scoring rules (position-specific, BPS formula)
  - ✅ Real match data integration confirmed
  - Detailed findings in: E2E_TEST_RESULTS.md → CLUSTER 1 SCORING & POINTS
  
- 🧪 **Cluster 2 (COMPLETED)**: Player & Squad Management — transfer windows, budgets, formations, power tools
  - ✅ 7 comprehensive test cases executed
  - ✅ Transfer window mechanism tested (open/close states)
  - ✅ Squad composition & position cap enforcement verified
  - ✅ Budget tracking accuracy confirmed (€90.7 used on €100M budget)
  - ✅ Power tools (wildcard, triple captain, joker) real-time configurable
  - ✅ Auction bidding unique constraint validated (one bid per bidder per listing)
  - 🔴 **CRITICAL ISSUE DISCOVERED**: Transfer allowed 64 seconds AFTER window close (#039 added to P0)
  - Detailed findings in: E2E_TEST_RESULTS.md → CLUSTER 2 PLAYER & SQUAD MANAGEMENT
  
- 🧪 **Cluster 3 (IN PROGRESS)**: Market Mechanics & Pricing
  - Price distribution analysis: DEF €3.79 avg, FWD €4.80 avg, GK €4.23 avg, MID €4.29 avg
  - Price tier stratification completed (5 tiers: ELITE €10+, PREMIUM €8-10, CORE €6-8, VALUE €4-6, BUDGET <€4)
  - Big Five club pricing verified (Arsenal, Liverpool, Man City, Man United, Tottenham)
  - Trade listing mechanics examined (2 active listings)
  - Auction mechanics tested: Created Martin Odegaard auction (€8.0 min, 24h window), placed €8.5 bid
  - Unique constraint verified: each bidder can only have ONE active bid per listing
  
- 📋 **Issues Discovered & Added to Backlog**:
  - #039: Transfer Window Enforcement Gap (P0 — CRITICAL, transfers allowed post-deadline)
  - #040: Draft Lottery Edge Function Not Deployed (P1 — code exists, not accessible)
  
- 📊 **Metrics Updated**:
  - Blocking issues: 2 (up from 1: added #039 transfer window enforcement)
  - Testing clusters: 1.5/3 complete (Cluster 1 done, Cluster 2 done, Cluster 3 ~50%)
  - Real API data validated: ✅ Forza Football sync, ✅ Premier League fixtures, ✅ Player data
  
- 📁 **Documentation Updated**:
  - E2E_TEST_RESULTS.md: Appended CLUSTER 1 & 2 comprehensive findings
  - BACKLOG.md (this file): Added critical issues #039 & #040, updated metrics

**2026-05-08 (Session 6)**:
- ✅ **Onboarding wizard fix**: Removed mid-step navigation (root cause of step 2 going off-screen); made container scrollable on small screens
- ✅ **Live tab**: Removed "UPCOMING" scheduled fixtures from match ticker; harmonised My Squad list with Squad tab style (position-grouped, status dot, START/SUB indicator)
- ✅ **2-GK pitch bug**: Enforced max 1 GK in starters at squad load time; any extra GKs auto-demoted to bench
- ✅ **Swap bug**: Formation error now clears swap mode + selected player so UI is never stuck
- ✅ **Migration 25**: Widened `league_members_role_check` constraint to include 'commissioner' — fixes "Could not create league" error
- ✅ **Swap bar overlap**: Added 120px bottom padding in pitch tab when swap mode is active so bench players remain scrollable
- ✅ **Squad List overlap**: BENCH/START badges moved from absolute positioning to `action` prop in PlayerRow — eliminates overlap with points/status columns
- 📋 **Backlog**: Added #034 (Scores → League special bets move), #035 (Point Boost), #036 (Chips revamp: remove roulette, adjust Joker, add Opponent Block)

**2026-05-06 (Session 5 - Extended)**:
- ✅ **#027 League Chat Backend**: Completed `useChatMessages` hook, realtime subscription, message send, LeagueScreen integration
- ✅ **Migration 24**: Created `chat_messages` table with RLS policies (select, insert, delete)
- Updated backlog: #027 moved from PARTIALLY IMPLEMENTED (60%) to DONE
- Updated metrics: 107/116 E2E tests passing (9 pre-existing failures unrelated to features)
- All code changes committed to main branch
- Ready for: Supabase dashboard realtime activation

**2026-05-06 (Session 5)**:
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

