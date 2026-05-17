# E2E Test Overhaul Prompt: Forza Fantasy League

## Context & Assessment

### Current State
- **Existing E2E Suite**: 116 tests in `e2e/tests/` using Playwright
- **Current Coverage**: Basic user flows (auth, squad building, basic transfers, league creation, chat basics, live scores)
- **Limitations**: 
  - Single-league, single-user scenarios predominate
  - Happy-path only (missing edge cases, error states)
  - Shallow testing (e.g., chat tested as "can send a message" not "conversation threads work across users")
  - No fixture/real-data simulation
  - No performance baselines or load characteristics
  - Draft/auction/betting logic barely covered (if at all)
  - Multi-manager scenarios absent

### The Problem
E2E tests that don't exercise the **complex, real-world scenarios** become a false sense of security. Users will find the bugs in production. This overhaul aims to:
1. **Test complexity where it lives** — multi-league management, concurrent actions, state consistency
2. **Catch silent failures** — stale data, partial state updates, missed notifications
3. **Validate business logic** — draft allocation rules, auction mechanics, betting payouts
4. **Ensure edge cases don't ship** — connection drops mid-transfer, overlapping bids, clock skew

---

## Testing Philosophy & Approach

### User Journey → Test Design
Tests should mirror **real user workflows**, not isolated feature checks.

**Bad E2E:**
```javascript
test('user can send message', async () => {
  await page.fill('textarea', 'hello');
  await page.click('button[type=submit]');
  await expect(page.locator('text=hello')).toBeVisible();
});
```

**Good E2E:**
```javascript
test('two managers exchange tactical discussion in league chat, one offline then returns, sees full history', async () => {
  // Manager 1 opens league chat
  // Manager 1 sends message about squad changes
  // Manager 2 logs in, reads message, replies with counter-argument
  // Manager 1 logs out
  // Manager 2 continues typing for 2 minutes, sends follow-up
  // Manager 1 logs back in → sees both messages + timestamps
  // Both managers see identical conversation state
  // Notifications were sent (if enabled) for each new message
});
```

### Test Structure (Arrange-Act-Assert + Observers)
```javascript
test('scenario description', async ({ page, context }) => {
  // ARRANGE: Set up initial state (users, data, logged-in sessions)
  const manager1 = await createTestUser('manager1@test.com');
  const manager2 = await createTestUser('manager2@test.com');
  const league = await createTestLeague([manager1.id, manager2.id]);
  
  // ACT: Perform multi-step user actions
  const page1 = await context.newPage();
  await page1.goto(appUrl);
  await loginAs(page1, manager1);
  
  const page2 = await context.newPage();
  await page2.goto(appUrl);
  await loginAs(page2, manager2);
  
  // Both pages open league chat
  await page1.click('[data-testid="league-chat"]');
  await page2.click('[data-testid="league-chat"]');
  
  // Manager 1 sends message
  await page1.fill('[data-testid="chat-input"]', 'Best squad ever');
  await page1.press('[data-testid="chat-input"]', 'Enter');
  
  // ASSERT: Verify state from both perspectives
  // - Manager 1 sees message sent immediately
  // - Manager 2 receives message in real-time (no page refresh)
  // - Message timestamp is reasonable
  // - Message is persisted (check DB or refresh)
  
  // OBSERVE: Check side effects
  // - Did notification trigger? (if enabled)
  // - Is message idempotent? (no duplicates on retry)
  // - Does conversation history load correctly on next login?
});
```

### Data Fixtures & Test Data Management
Create **reusable, realistic test data**:

```javascript
// fixtures/managers.js
export const managers = {
  aggressive_trader: {
    email: 'aggressive@test.com',
    name: 'Aggressive Trader',
    risk_profile: 'high_risk',
  },
  conservative_player: {
    email: 'conservative@test.com',
    name: 'Conservative Player',
    risk_profile: 'low_risk',
  },
  active_competitor: {
    email: 'active@test.com',
    name: 'Active Competitor',
    risk_profile: 'balanced',
  },
};

// fixtures/leagues.js
export const leagueScenarios = {
  four_managers_balanced: {
    name: 'Test League',
    mode: 'h2h',
    managers: ['aggressive_trader', 'conservative_player', 'active_competitor', ...],
    draft_mode: 'allocation',
    transfer_window_open: true,
  },
};

// fixtures/squads.js
export const squadSnapshots = {
  aggressive_complete: {
    gk: ['player_id_1', 'player_id_2'],
    def: ['player_id_3', 'player_id_4', 'player_id_5'],
    mid: ['player_id_6', 'player_id_7', 'player_id_8', 'player_id_9'],
    fwd: ['player_id_10', 'player_id_11'],
    bench: ['player_id_12'],
    budget_remaining: 0.5, // in millions
  },
};
```

---

## Test Scenarios by Feature

### 1️⃣ MULTI-LEAGUE MANAGER SCENARIOS

**Goal**: Verify a manager can operate in multiple leagues simultaneously with isolated squad/budget/performance state.

#### Test: Manager in 3 Leagues with Different Squads

```
Scenario: Manager Alice joins 3 leagues (EPL Casual, EPL Competitive, La Liga Experiment)
  - Each league has different manager competition, scoring rules, transfer deadlines
  - Verify squad state is independent (transfer in League A doesn't affect League B)
  - Verify standings show correct data per league
  - Verify chat/notifications isolate by league
  - Verify transfer budget is per-league
  - Verify chip/power-tool state is per-league (e.g., Free Hit used in League A not available in League B)

Key Assertions:
  - Squad in League A and Squad in League B are completely distinct
  - Transfer budget in League A independent of League B
  - When viewing League A standings, data is correct for League A only
  - Chat messages posted in League A don't appear in League B chat
  - Switching between leagues shows correct UI state instantly
  - Notifications route to correct league context
  - Manager can perform concurrent actions (e.g., transfer in League A while reviewing League B)

Edge Cases:
  - Manager transfers same player in 2 leagues (same player, different instances in each league)
  - Manager hits transfer deadline in League A but still has window in League B
  - Manager receives offer to trade in League A while completing transfer in League B
  - Network error during switch between leagues → stale cache check
  - All 3 leagues active in tabs, rapid switching between them

Test Data:
  - 3 separate leagues with different rule sets
  - Managers in each league with varying squads
  - Active transfers/trades in at least 2 leagues
  - Notifications pending in different leagues
```

#### Test: Manager Updates Squad While In-Game in Another League

```
Scenario: Manager is viewing LIVE screen (League A, match in progress), receives trade offer in League B
  - Manager is watching live points accumulating for League A
  - Mid-match, receives notification of trade in League B
  - Can click notification, switch to League B, review trade without losing League A context
  - Approve trade in League B
  - Switch back to League A → live updates still flowing, no data loss

Key Assertions:
  - League A live data continues updating while manager in League B
  - League A context restored perfectly when switching back
  - Trade execution doesn't affect League A squad/standings
  - No double-scoring if player appears in both leagues
```

---

### 2️⃣ DRAFT ALLOCATION MODE

**Goal**: Verify the draft allocation workflow works correctly with multiple managers, proper rule enforcement, and no state inconsistencies.

#### Test: Draft Allocation with 4 Managers

```
Scenario: 4 managers in league, each selects 30-player roster, admin triggers allocation
  - League starts in "squad selection" mode
  - Each manager has 30-player pool to select from
  - Manager 1 selects roster (30 players)
  - Manager 2 selects roster (30 players, may overlap with Manager 1)
  - Manager 3, 4 do same
  - All 4 complete selection
  - Admin clicks "Trigger Draft Allocation"
    - System runs allocation algorithm
    - Each manager receives 11-player starting XI (distributed fairly)
    - Bench roster allocated
    - Budget calculated based on allocation
    - League transitions to "active" state
    - Each manager can see their allocated squad

Key Assertions:
  - Each manager can only select up to 30 players
  - Can't select more than league size allows (30 total)
  - Removing a player updates count immediately
  - Once 30 selected, "Finalize Selection" button enabled
  - After all managers finalize, "Trigger Allocation" available to admin only
  - Allocation produces 11-player valid formation (1 GK, 3–5 DEF, 2–4 MID, 1–2 FWD)
  - Bench allocation correct (total squad = 14 or configured max)
  - Budget = sum of allocated player values
  - No player allocated to 2 managers simultaneously
  - League state transitions correctly → can't select/allocate twice
  - Each manager sees their own allocated squad in detail
  - Standings reflect allocated squads (not selection phase)

Edge Cases:
  - Manager 1 finalizes early, Manager 2–4 late → allocation doesn't start until all ready
  - Manager changes selection 10 times → final selection is what gets allocated
  - Admin clicks "Allocate" twice (race condition) → idempotent, no duplicate allocations
  - Manager clicks "Finalize" but network drops → retries don't re-finalize (idempotent)
  - Allocation algorithm produces invalid formation for a manager (shouldn't happen, but verify) → logged as critical
  - One manager has 0 players selected when allocation triggers → error handling, clear message
  - Manager tries to select player already in bench/squad → prevents duplicate
  - Player selected by 3+ managers → allocation algorithm distributes fairly (verify fairness metric)

Test Data:
  - 4 test managers with distinct risk profiles
  - 30-player pool (clearly defined, known values)
  - Predictable allocation algorithm (for deterministic test assertions)
  - League rules: EPL-only, standard scoring, 14-player max squad
```

#### Test: Reallocation (If Manager Forfeits)

```
Scenario: After allocation complete, Manager 2 quits → remaining 3 managers get rebalanced
  - League allocated, Manager 2 squad assigned
  - Manager 2 leaves league
  - Admin triggers "Reallocate Remaining Squads"
  - Remaining 3 managers' squads rebalanced (fairness check)
  - Manager 2's squad returned to pool
  - No orphaned players
```

---

### 3️⃣ LIVE SCREEN ACTIVITY & REAL-TIME DATA

**Goal**: Verify live score ingestion, event parsing, and correct user visibility (only relevant players/events).

#### Test: Live Match Events with Real API Data Simulation

```
Scenario: EPL match Man United vs Arsenal live, 3 managers tracking players from both teams
  - Manager 1: has Salah (Liverpool) + Saka (Arsenal) in their squad
  - Manager 2: has Rodri (Man City) — NOT in this match
  - Manager 3: has Bruno (Man United) + Martinelli (Arsenal)
  
  Match timeline (simulated via API mock):
    45:10 — Goal: Bruno scores (2-0 Man United)
    45:45 — Yellow Card: Saka (Arsenal)
    60:00 — Substitution: Salah OUT, Diaz IN (Liverpool — different match)
    62:30 — Goal: Martinelli scores (2-1 Man United)
    75:00 — Goal: Bruno scores again (3-1 Man United)
    90:00 — Match ends
  
  Manager 1's LIVE screen should show:
    - Bruno goal (2-0, 45:10) ← NOT HIS PLAYER, don't show
    - Saka yellow (45:45) ← HIS PLAYER, show + points update
    - Salah substitution OUT (60:00) ← HIS PLAYER, show
    - Martinelli goal (62:30) ← NOT HIS PLAYER, don't show
    - Bruno goal (75:00) ← NOT HIS PLAYER, don't show
    - Points: Saka -1 (yellow), Salah 0 (sub out), Total = -1
  
  Manager 2's LIVE screen:
    - No events (Rodri not playing, or playing in different match)
    - Points: 0
  
  Manager 3's LIVE screen:
    - Bruno goals (45:10, 75:00) ← HIS PLAYER, show both
    - Saka yellow (45:45) ← NOT HIS PLAYER, don't show
    - Martinelli goal (62:30) ← HIS PLAYER, show
    - Points: Bruno +10 (2 goals), Martinelli +5 (1 goal), Total = +15

Key Assertions:
  - Only events for players IN manager's squad are displayed
  - Points calculated correctly per event (goals, assists, yellow/red, clean sheet, etc.)
  - Event timestamps accurate
  - No duplicate events on Realtime re-subscription
  - Live points match post-match finalized points
  - Manager can see other managers' events in league standings (but not their full activity stream)
  - Real-time updates push to multiple tabs simultaneously (same manager, different browser tabs)

Edge Cases:
  - Event arrives out-of-order (goal at 75:00 arrives before substitution at 60:00) → sort & display correctly
  - Event arrives twice (Realtime duplicate) → deduplicate, no double-scoring
  - Match starts but no events for 10 minutes → show "Match in progress" with no action yet
  - Match ends, but points calculated in separate event → both displayed, final points correct
  - Manager has player on bench who comes on as substitute → bench player contributes points
  - Player gets injured mid-match → receives injury flag + points frozen
  - VAR review takes 5 minutes before goal confirmed → goal held pending, then confirmed
  - Red card revoked after check → points need adjustment (rare, but test it)
  - Fixture cancelled/postponed mid-match → all points voided? (Business logic decision)
  - Network drops during live match → reconnect, no events lost, catch-up works

Test Data:
  - Realistic EPL fixture (e.g., Man United vs Arsenal)
  - 3 managers with squads including 2-4 players per team
  - Pre-recorded API responses (from real Forza Football API if possible) or deterministic mock
  - Match events with realistic timestamps, player IDs, action types
  - Scoring rules aligned with published rules (5 pts goal, 1 pt appearance, -1 pt yellow, etc.)
```

#### Test: Cross-Match Scoring with Multiple Leagues

```
Scenario: Same manager in EPL and La Liga leagues, both have matches live simultaneously
  - League A (EPL): Manager has 4 EPL players
  - League B (La Liga): Manager has 3 La Liga players
  - EPL fixtures start at 15:00 UTC
  - La Liga matches at 16:00 UTC
  - Manager viewing LIVE screen → which league?
  - Can switch between leagues and see correct players/points

Key Assertions:
  - LIVE screen filters by selected league
  - Points accumulate correctly per league
  - Standings updated per league, not globally
  - No scoring bleed (EPL player points don't count in La Liga league)
```

---

### 4️⃣ CHAT FUNCTIONALITY — DETAILED MULTI-USER COVERAGE

**Goal**: Verify chat works as a fully functional real-time communication channel across all user states.

#### Test: Five-Manager Chat Conversation with Mixed Participation

```
Scenario: League of 5 managers, varying engagement over 24 hours
  Timeline:
    00:00 — Manager A posts "Final squad locked. GL!"
    01:30 — Manager B: "Going for defensive approach this week"
    06:00 — Manager C: "Night shift, just checking in. Nice squads everyone"
    08:00 — Manager A: @Manager C "Thanks mate"
    12:00 — Manager D (offline since start): Logs in, reads full history, posts "Caught up! Good luck!"
    12:15 — Manager E: "Who's got the highest score so far?" [tagged to all or @everyone]
    12:20 — Manager B: "I'm down 200 pts"
    14:00 — Manager C: Deletes their message from 06:00
    14:15 — Manager A: Edits message from 00:00 to "Final squad locked. GL! Will update after deadline."
    20:00 — Manager D: Posts long message with transfer analysis (500 chars)
    23:00 — Manager E + A: Rapid back-and-forth about trade (5 messages in 1 min)
    23:30 — Manager B offline (network issues) — retry logic queues message

Key Assertions:
  - All 5 managers see full chat history in correct order
  - New message appears instantly for online users (Realtime)
  - Offline user (Manager D) sees full history when logging back in
  - Message timestamps consistent across all clients
  - Edited message shows "edited" indicator, content updated
  - Deleted message shows "message deleted" placeholder (or removed, depending on policy)
  - @mentions (if implemented) highlight correctly
  - Long messages (500+ chars) don't truncate visually
  - Rapid messages (5 in 1 sec) don't cause race conditions
  - User typing indicator (if implemented) shows correct user + disappears on send
  - Message reactions (if implemented) work across users
  - Image/media uploads (if implemented) preview correctly

Edge Cases:
  - Manager A and B post simultaneously → both appear, one gets deterministic order
  - Manager posts to closed league chat (after league ended) → error or read-only?
  - Manager A posts, then immediately gets ejected from league → message posted still visible?
  - Network drops mid-typing, user reconnects → draft saved? Message queued?
  - Manager posts offensive content, then admin deletes it → audit trail?
  - Chat message contains emoji, special chars, links → render correctly, no HTML injection
  - Chat overflows to 10,000+ messages → pagination works, performance doesn't degrade
  - Manager posts to chat at exact moment league transfer window closes → message accepted or rejected?
  - Two managers post identical message simultaneously → both appear, no deduplication
  - Message posted, chat page closed, reopened → message still there (persistence)
  - Same manager in 2 browser tabs posting simultaneously → no duplicate messages

Test Data:
  - 5 test managers with distinct personalities
  - League context (name, rules, managers)
  - Pre-populated message history (optional, for slow-burn scenarios)
  - Timestamps with realistic intervals
  - Realistic message content (team strategy, banter, analysis)
```

#### Test: Chat Notifications

```
Scenario: Manager gets notified when league chat has new message while app in background
  - Manager A has notifications enabled
  - Manager B posts message
  - Manager A should receive in-app notification (if in-app) or push notification (if mobile)
  - Manager A clicks notification → opens league chat, message visible
  - Chat marked as read
  - Badge count decrements

Key Assertions:
  - Notification sent only to managers in that league
  - Notification only sent if settings allow
  - Notification shows league name + preview of message
  - Clicking opens correct league
  - Read/unread state consistent across devices
```

---

### 5️⃣ FRONTPAGE (LEAGUES TAB)

**Goal**: Verify the leagues overview page shows correct data and navigation works.

#### Test: Leagues Tab with 4 Active Leagues

```
Scenario: Manager is in 4 leagues (EPL Casual, EPL Competitive, La Liga Experiment, Draft League)
  Frontpage should display:
    - League 1: Position 1/4, 1500 pts, next match Friday
    - League 2: Position 3/5, 980 pts, transfer deadline tomorrow
    - League 3: Position 2/3, 720 pts, league inactive (no matches this week)
    - League 4: Position pending (draft not yet allocated)

Key Assertions:
  - All 4 leagues listed
  - Standing per league correct (1/4, 3/5, 2/3, pending)
  - Points accurate
  - Next fixture date shown correctly
  - Deadline warnings shown (e.g., "Transfer deadline in 6 hours")
  - League modes indicated (H2H vs League)
  - Can click league → navigates to that league's standings
  - Can filter leagues (active, archived, by season)
  - Search leagues by name
  - Invite code visible (or copy button) for each league
  - Leave league option available (with confirmation)

Edge Cases:
  - Manager in 10+ leagues → pagination or infinite scroll works
  - League settings changed (deadline moved) → page reflects instantly
  - Manager removed from league while viewing page → league disappears
  - League transitions from "pending draft" to "active" while viewing → UI updates
  - Sorting by points → ranks update if new points calculated
  - Manager joins new league → appears in list without refresh
  - Archived league hidden by default, can show with filter
  - League with deleted/inactive admin → still accessible to members
```

---

### 6️⃣ PLAYER AUCTIONS — EXTENSIVE CORNER CASE COVERAGE

**Goal**: Verify auction mechanics work correctly, with proper state transitions, fairness, and reconciliation.

#### Test: 3-Manager Auction for Premium Player (Extended)

```
Scenario: League has auction mode enabled. 3 managers bid on Salah (EPL) over 5 minutes.
  
  Timeline:
    T+00s — Auction starts. Manager A: 10.0M (opening bid)
    T+30s — Manager B: 10.5M (outbid)
    T+45s — Manager C: 11.0M (outbid B)
    T+60s — Manager A: 11.2M (outbid C)
    T+90s — Manager B: 12.0M (outbid A)
    T+120s — Manager C: 12.5M (outbid B)
    T+180s — Manager C: 13.0M (current bid, 2 mins left)
    T+210s — Manager A: 13.5M (outbid C, 90 secs left, extends deadline to T+300s)
    T+270s — Manager B: 14.0M (outbid A)
    T+300s — Auction ends. Manager B wins at 14.0M

  Post-Auction State:
    - Manager B squad: +Salah, -14.0M budget
    - Manager A squad: unchanged, budget unchanged
    - Manager C squad: unchanged, budget unchanged
    - League standings: Manager B squad value increased
    - Player transfer log: Salah transferred to Manager B at 14.0M
    - Notification sent to all 3 managers (lost, outbid final, won)

Key Assertions:
  - Each bid increments by minimum amount (0.1M or configured)
  - Bid must exceed current bid + minimum
  - Only manager with sufficient budget can bid
  - Lowest-bid-timestamp used for tiebreaker (if bids same amount, first bid wins)
  - Auction countdown accurate (5-min timer, extends on final-minute bid)
  - Bid persists if network drops mid-submission (idempotent)
  - Can't bid on own player (or business rule applies)
  - Winning bid immediately updates winner's squad (no manual acceptance)
  - Winning bid deducts from budget instantly
  - Losing bidders' budgets unchanged
  - Auction can't be cancelled once started (or admin-only)
  - All bids logged for audit trail

Edge Cases:
  - Manager A bids 14.0M, B simultaneously bids 14.0M at same instant → A wins (first by timestamp)
  - Manager A bids with exactly 14.0M budget (no buffer) → bid accepted, budget goes negative? (Safeguard needed)
  - Auction auto-extends 3 times due to final-minute bids → final deadline respected
  - Manager A wins auction, then league's transfer window closes 1 sec later → bid still valid?
  - Manager A wins, but then is removed from league → does player transfer? Or refund?
  - Auction player is on injury list → auction still proceeds? (Business rule decision)
  - Auction player already in a manager's squad (error in setup) → no duplicate bids allowed
  - Auction starts, then is manually cancelled by admin → refund all bids, return to pool
  - Auction ends in a draw (due to clock skew, same-second bids) → deterministic winner (DB ordering)
  - Manager tries to bid after auction ended (race condition, late request arrives) → rejected gracefully
  - Auction with 2 managers, one bids max budget → other can't outbid → first bid wins

Test Data:
  - 3 test managers with different budgets (A: 80M, B: 90M, C: 100M)
  - Premium player (Salah, 15M starting value)
  - Auction parameters: 5-min duration, 0.1M minimum increment, final-minute extension
  - Opening bid set at 10.0M (below market value, to encourage bidding)
```

#### Test: Simultaneous Auctions for Scarce Resources

```
Scenario: 4 managers, 2 simultaneous auctions (Salah vs Haaland)
  - Manager A interested in Salah
  - Manager B interested in Haaland
  - Manager C interested in Salah
  - Manager D interested in Haaland
  - Both auctions run 0-5 mins
  - Managers can bid on both simultaneously

Key Assertions:
  - Budgets managed correctly across both auctions
  - Win in one auction doesn't affect ability to bid in other
  - Manager A wins Salah, budget deducted
  - Manager D wins Haaland, budget deducted
  - No budget bleed between auctions
  - Standings reflect both transfers
```

#### Test: Auction with Budget Constraints

```
Scenario: Manager A has 5.0M left, player's minimum bid is 4.0M
  - Manager A bids 4.5M (valid, has 5.0M)
  - Manager B bids 5.0M (outbids A)
  - Manager A tries to re-bid 5.5M → error, insufficient budget

Key Assertions:
  - System prevents overbidding (no negative budget)
  - Error message clear ("Insufficient budget: need 5.5M, have 5.0M")
  - Failed bid doesn't alter league state
```

#### Test: Auction Completion & Squad Integration

```
Scenario: Manager wins auction for Salah, squad must remain valid
  - Before: Manager has 1 GK, 3 DEF, 2 MID, 1 FWD (11 players)
  - Wins Salah (MID) in auction at 14.0M
  - After: Must decide where Salah goes (starting XI or bench)
  
  Two paths:
    Path 1: Salah added to bench (auto-promotion later if slot opens)
    Path 2: Salah forces a swap (manager must drop a player)

Key Assertions:
  - Squad rules enforced (e.g., can't have 6 mids if max is 4)
  - Transfer logged correctly
  - Budget deducted
  - Auction entry shows final price
```

#### Test: Auction Reversal / Cancellation Audit Trail

```
Scenario: Admin discovers fraud in auction (collusion between 2 managers)
  - Admin can cancel auction
  - Transfers reversed
  - Budgets refunded
  - Audit log shows who, when, why

Key Assertions:
  - Reversal is atomic (all-or-nothing)
  - No orphaned transfers
  - Notification sent to affected managers
  - Audit trail immutable
```

---

### 7️⃣ BETTING SECTION — EXTENSIVE CORNER CASE COVERAGE

**Goal**: Verify betting mechanics, payout logic, and no financial inconsistencies.

#### Test: Multi-Outcome Bet with Different Odds

```
Scenario: Week 5, Man United vs Arsenal. Manager A places 3 bets:
  Bet 1: Man United Win @ 1.85 odds, stake 100 pts
  Bet 2: Over 2.5 Goals @ 1.60 odds, stake 50 pts
  Bet 3: Salah 1+ Goals @ 2.00 odds, stake 75 pts
  Total stake: 225 pts

  Match Result: Man United 2-1 Arsenal, Salah scores
    Bet 1 (Win): ✅ WON → Payout: 100 × 1.85 = 185 pts (profit 85)
    Bet 2 (Over 2.5): ✅ WON → Payout: 50 × 1.60 = 80 pts (profit 30)
    Bet 3 (Salah goals): ✅ WON → Payout: 75 × 2.00 = 150 pts (profit 75)
  Total Payout: 415 pts
  Net Result: -225 (stake) + 415 (payout) = +190 pts

Key Assertions:
  - Odds are correct (pulled from betting provider)
  - Payouts calculated correctly (stake × odds)
  - Each bet settles independently
  - Winning bets increase manager score/points
  - Losing bets decrease score
  - Parlay bets (if supported): odds multiply correctly
  - Partial cash-out (if supported): reduces payout proportionally
  - Bet confirmation shows odds locked in at time of placement
  - Bet history shows final result, payout, timestamp

Edge Cases:
  - Bet placed 5 secs before match starts → accepted or rejected?
  - Odds change during match (sportsbook updates) → locked in or updated?
  - Match abandoned/voided → bets voided, stakes refunded
  - Bet placed with fractional points (e.g., 75.5 pts) → rounded or rejected?
  - Manager places bet, then transfer window closes → bet still settles
  - Manager removed from league while bet pending → stake returned? Payout forfeited?
  - Bet for player who doesn't play (injury) → automatically lost or voided?
  - Salah scores 2 goals but bet was "1+ goals" → WON (covers "1 or more")
  - Multiple managers bet same outcome → independent payouts (no pooling)
  - Odds displayed as fractional (1/2) vs decimal (1.50) vs American (-200) → correct conversion

Test Data:
  - Real odds from sportsbook (or deterministic mock)
  - Multiple bet types (win/loss/draw, over/under, player props)
  - Manager A with 1000 pts budget, places bets totaling 225 pts
  - Real match result (or simulated)
  - Clear pass/fail outcomes (not ambiguous)
```

#### Test: Bet Limits & Safeguards

```
Scenario: Manager A has 500 pts, tries to place bets exceeding budget
  Bet 1: 200 pts (valid, has 500)
  Bet 2: 200 pts (valid, has 300 remaining)
  Bet 3: 150 pts (valid, has 100 remaining) → REJECTED, insufficient budget

Key Assertions:
  - Bets can't exceed total budget (configurable, e.g., 50% of points)
  - Per-bet limit enforced (e.g., max 100 pts per bet)
  - Single bet on multiple outcomes prevented (e.g., can't bet "Man U Win" AND "Arsenal Win" same match)
  - Rejected bets show clear reason
  - Budget shows running total after each successful bet
```

#### Test: Bet Settlement Timing & Race Conditions

```
Scenario: Manager bids on Team A to Win. Match ends 2-1 Team A.
  T+0s — Match ends
  T+5s — Odds provider sends result (Team A won)
  T+6s — Bet settles, payout calculated
  T+7s — Manager views settled bet
  
  Race Condition: Manager tries to cash out at T+2s (before settlement)
    - Cash-out option available? (Depends on business rule)
    - If yes: Partial payout based on current odds
    - If no: Must wait for settlement

Key Assertions:
  - Bets settle within seconds of match end
  - No double-settlement (idempotent)
  - Manager notified when bet settles
  - Payout visible in points immediately
  - Settlement logged immutably
  - Clock skew (sportsbook time vs app time) handled
```

#### Test: Bet on Multi-Leg Parlay

```
Scenario: Manager places parlay (if supported):
  - Leg 1: Man U Win @ 1.85
  - Leg 2: Liverpool Over 1.5 Goals @ 1.60
  - Parlay odds: 1.85 × 1.60 = 2.96
  - Stake: 100 pts
  - Potential payout: 296 pts
  
  Results:
    - Leg 1: ✅ WON
    - Leg 2: ✅ WON
    - Parlay: ✅ WON, Payout 296 pts
  
  Alternative (one leg loses):
    - Leg 1: ✅ WON
    - Leg 2: ❌ LOST
    - Parlay: ❌ LOST, Payout 0 pts (stake lost)

Key Assertions:
  - Parlay odds multiply correctly
  - All legs must win for parlay to win
  - One leg lost = entire parlay lost
  - Can't modify parlay once placed
  - Early cash-out (if supported) calculated on live odds
```

#### Test: Bet on Live-Game Events

```
Scenario: In-game betting: Man U vs Arsenal, score 1-1 at 60 mins
  - Manager places bet "Next goal by Man U" @ 2.50 odds
  - At 65 mins, Man U scores
  - Bet settles immediately
  - Payout: stake × 2.50

Key Assertions:
  - Live bets have same safeguards as pre-match
  - Settlement instant when event occurs
  - Can't bet after event occurred (e.g., bet "next goal" after goal scored)
  - Odds change during live match → new odds for new bets
```

#### Test: Bet Ledger & Audit Trail

```
Scenario: Manager reviews their betting history
  - Last 50 bets shown with: date, bet type, odds, stake, result, payout
  - Filter by: settled, pending, won, lost
  - Export bet history (CSV, PDF)
  - ROI calculated (total wins / total stake)

Key Assertions:
  - Bet history immutable (can't edit past bets)
  - All bets linked to match results (traceable)
  - ROI calculation accurate
  - No gaps in history (no missing bets)
```

---

## Test Architecture & Infrastructure

### Test Environment Setup
```javascript
// setupTests.js or fixtures
export async function setupTestLeague(context, managers = 3) {
  // Create test managers
  const users = await Promise.all(
    Array(managers).fill(null).map((_, i) =>
      createTestUser(`manager${i}@test.com`)
    )
  );
  
  // Create league with those managers
  const league = await createTestLeague({
    name: 'Test League',
    managers: users.map(u => u.id),
    rules: defaultRules,
  });
  
  // Seed test squads for each manager
  const squads = await Promise.all(
    users.map(user =>
      createTestSquad(user.id, league.id, standardFormation)
    )
  );
  
  return { users, league, squads };
}

// Mock API responses (Forza Football)
export function mockMatchEvents() {
  return [
    { type: 'goal', player_id: 'salah_id', minute: 45, team: 'LIV' },
    { type: 'yellow_card', player_id: 'saka_id', minute: 45, team: 'ARS' },
    // ... more events
  ];
}

// Mock Realtime subscriptions
export async function subscribeToLiveUpdates(page, leagueId) {
  // Ensure Realtime listener is attached, return cleanup
}
```

### Multi-Tab / Multi-User Testing
```javascript
// Simulate 2 managers in same league, different tabs
test('two managers concurrent actions', async ({ context }) => {
  const page1 = await context.newPage();
  const page2 = await context.newPage();
  
  // Login manager A on page1, B on page2
  const managerA = await loginAs(page1, 'manager_a@test.com');
  const managerB = await loginAs(page2, 'manager_b@test.com');
  
  // Concurrent actions
  // ...
  
  // Verify both pages show consistent state
  const standingsA = await getStandings(page1);
  const standingsB = await getStandings(page2);
  expect(standingsA).toEqual(standingsB);
});
```

### Network Condition Simulation
```javascript
// Test retry logic, offline behavior
test('message queues while offline', async ({ page }) => {
  await page.context().setOffline(true);
  await page.fill('[data-testid="chat-input"]', 'Test message');
  await page.press('[data-testid="chat-input"]', 'Enter');
  // Message should be queued
  await expect(page.locator('text=Sending...')).toBeVisible();
  
  // Come back online
  await page.context().setOffline(false);
  // Message should send
  await expect(page.locator('text=Test message')).toBeVisible();
});
```

### Database State Verification
```javascript
// After E2E action, verify database state directly
test('transfer updates budget in DB', async ({ page, pool }) => {
  // Perform transfer via UI
  await transferPlayer(page, 'salah', 'henderson');
  
  // Verify DB state
  const managerRow = await pool.query(
    'SELECT budget_remaining FROM managers WHERE id = $1',
    [managerId]
  );
  expect(managerRow.rows[0].budget_remaining).toBeLessThan(originalBudget);
});
```

### Performance Baselines
```javascript
// Measure key metrics
test('chat loads < 200ms with 1000 messages', async ({ page }) => {
  const startTime = Date.now();
  await page.goto(`${appUrl}/league/${leagueId}/chat`);
  await page.waitForSelector('[data-testid="message"]', { timeout: 1000 });
  const loadTime = Date.now() - startTime;
  
  expect(loadTime).toBeLessThan(200);
});

// Live score update latency
test('live goal appears within 500ms of API event', async ({ page }) => {
  const eventTime = Date.now();
  triggerLiveGoal(); // Mock API event
  const appearTime = await page.waitForSelector(
    '[data-testid="goal-event"]'
  );
  expect(appearTime - eventTime).toBeLessThan(500);
});
```

### Test Data Cleanup
```javascript
// After each test, clean up
afterEach(async ({ pool }) => {
  await pool.query('DELETE FROM leagues WHERE id = ANY($1)', [
    testLeagueIds,
  ]);
  await pool.query('DELETE FROM users WHERE email LIKE $1', ['%@test.com']);
});
```

---

## Test Organization & Naming

### File Structure
```
e2e/
├── tests/
│   ├── auth.spec.js                 # Login/signup (existing, minimal change)
│   ├── multi-league.spec.js         # NEW: Multi-league manager scenarios
│   ├── draft-allocation.spec.js     # NEW: Draft allocation workflow
│   ├── live-activity.spec.js        # EXPANDED: Live scores + real data
│   ├── chat.spec.js                 # EXPANDED: Multi-user chat (current is thin)
│   ├── leagues-frontpage.spec.js    # NEW: Leagues tab/overview
│   ├── auctions.spec.js             # NEW: Auction mechanics
│   ├── betting.spec.js              # NEW: Betting workflows
│   └── (existing files: squad.spec.js, transfer.spec.js, league.spec.js)
├── fixtures/
│   ├── managers.js                  # Test manager profiles
│   ├── leagues.js                   # Test league configs
│   ├── squads.js                    # Test squad snapshots
│   ├── matches.js                   # Test match/fixture data
│   └── api-mocks.js                 # Mock Forza Football responses
├── helpers/
│   ├── auth-helpers.js              # loginAs, createTestUser
│   ├── league-helpers.js            # createTestLeague, etc.
│   ├── data-helpers.js              # DB queries for assertions
│   └── timing-helpers.js            # Wait for conditions, debounce
├── playwright.config.js             # (existing, may need adjustments)
└── README.md                         # Test guide, how to run, CI/CD notes
```

### Naming Convention
```javascript
// Describe the user journey, not the feature
// BAD:
test('chat works', async () => {});

// GOOD:
test('manager joins league chat, misses messages while offline, sees full history on return', async () => {});

// Include scenario context
test('[5-manager auction] concurrent bidding on Salah with bid at final minute extends deadline', async () => {});

// Include business rule being tested
test('[draft allocation] prevents manager from selecting >30 players', async () => {});
```

---

## Continuous Integration & Coverage

### CI Pipeline Changes
```yaml
# .github/workflows/ci.yml (updated)
- name: Run E2E tests
  run: npx playwright test
  env:
    TEST_DATABASE_URL: ${{ secrets.TEST_DB_URL }}
    MOCK_API_RESPONSES: true
    FORZA_API_MOCK_DATA: fixtures/forza-responses.json
```

### Coverage Target
- **Current**: ~116 tests, ~60% coverage
- **Target**: ~250+ tests, ~85% coverage
  - Multi-league: +15 tests
  - Draft allocation: +10 tests
  - Live activity: +20 tests
  - Chat: +15 tests
  - Leagues frontpage: +8 tests
  - Auctions: +30 tests
  - Betting: +25 tests
  - Edge cases/flakiness: +20 tests

### Flakiness Reduction
```javascript
// Avoid race conditions with explicit waits
// BAD:
await page.click('button');
await expect(page.locator('text=Success')).toBeVisible();

// GOOD:
await page.click('button');
// Wait for specific state, not just UI
await page.waitForFunction(
  () => document.querySelector('[data-testid="success"]') !== null,
  { timeout: 5000 }
);
```

### Parallel Execution
```javascript
// Run tests in parallel by default
// playwright.config.js
module.exports = {
  workers: 4, // Adjust based on CI capacity
  timeout: 30000,
  expect: { timeout: 5000 },
};
```

---

## Debugging & Reporting

### Debug Mode
```bash
# Run specific test with headed browser
npx playwright test auctions.spec.js --headed --debug

# Run with trace
npx playwright test --trace on
# View trace: npx playwright show-trace trace.zip
```

### Test Report
```bash
# Generate HTML report after failures
npx playwright test
npx playwright show-report

# Screenshot on failure (auto in config)
# Videos of failed tests (auto in config)
```

### Logging & Assertions
```javascript
// Log meaningful context for debugging
test('example', async ({ page }) => {
  console.log(`Starting test in league: ${leagueId}`);
  
  await performAction();
  
  const state = await page.evaluate(() => window.__appState);
  console.log(`App state after action:`, state);
  
  expect(state.points).toBe(100);
});
```

---

## Success Criteria

### Coverage
- [ ] 250+ E2E tests (up from 116)
- [ ] Each feature has happy path + 2–5 edge cases
- [ ] Auctions & betting: 30+ tests each (complex domain)
- [ ] Multi-league & draft: 25+ tests each

### Quality
- [ ] < 2% flakiness (tests re-run reliably)
- [ ] All tests have `data-testid` selectors (not brittle CSS)
- [ ] Database state verified, not just UI checked
- [ ] Network conditions tested (offline, slow, timeout)

### Documentation
- [ ] Each test file has README explaining scenarios
- [ ] Fixture data clearly commented
- [ ] Helper functions self-documenting (good names, JSDoc)
- [ ] CI failures produce diagnostic logs (trace, screenshot, logs)

### Performance
- [ ] Full suite runs in < 15 mins (CI)
- [ ] Can run in parallel without conflicts
- [ ] Database cleanup between tests (no state leakage)
- [ ] Fixture setup reusable (DRY)

---

## Deliverables

**Expected Output from Review/Implementation:**

1. **Test Files** (7 new/expanded specs, ~250 total tests)
2. **Fixture Data** (managers, leagues, squads, API mocks)
3. **Helper Functions** (auth, league, data, timing utilities)
4. **Test Report** (coverage metrics, flakiness analysis, edge cases discovered)
5. **CI/CD Updates** (parallel execution, reporting, debug artifacts)
6. **Documentation** (test guide, how-tos, known issues)

---

## Notes & Open Questions

- **Offline Mode**: Should tests include PWA/offline squad updates? (Design decision)
- **Performance**: What are acceptable latencies? (Define baselines per feature)
- **Mocking**: Should we test against real Forza API (slower) or mocks (fast)? (Recommend: mocks in CI, nightly full integration test)
- **Data Setup**: Should test DB be production copy or minimal schema? (Recommend: minimal schema, deterministic fixtures)
- **Flakiness Budget**: How many re-runs acceptable in CI? (Recommend: zero, fix root cause)

Good luck with the overhaul! 🚀
