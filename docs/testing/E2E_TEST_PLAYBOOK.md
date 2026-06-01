# E2E Test Playbook — Forza Fantasy League

**Version**: 2.0 (2026-06-01)  
**Audience**: Fresh test session — this document is self-contained. No prior context required.  
**App URL**: `http://localhost:5173` (run `npm run dev` first)  
**Auth**: `VITE_AUTH_ENABLED=true` must be set in `.env.local`

---

## ⚠️ THREE RULES BEFORE STARTING

### RULE 1 — Use Real API Data
All player names, club names, fixture details, and scores must come from the live `players` and `fixtures` tables (populated by the Forza Football API). Do not invent or hard-code player names in test steps. If a flow asks you to "pick a FWD", query the DB or browse the market for an actual FWD from the tournament.

### RULE 2 — Price Check Before Any Transfer or Auction
Player prices are **not** provided by the Forza API. If any player in the test tournament has `price IS NULL`, budget enforcement is silently bypassed — all buys succeed regardless of cost, producing false confidence. **Run the price check query (Appendix D) before any flow in PART B, C, D, or E that involves buying, selling, or bidding.** If prices are missing, seed them with Appendix D's random query before proceeding.

### RULE 3 — Minimum 4 Participants Per League
Each test league must have all 4 test accounts as members before testing begins. Standings, trades, auctions, chat mentions, and draft conflicts all require multiple managers. The setup SQL in Appendix B creates all 4 leagues with all 4 members.

---

## Test Matrix — What This Playbook Covers

The platform has two independent axes that produce four game paths. Every section of this playbook maps to one path.

| | **League format** (EPL-style, season-long) | **Cup format** (WC/UCL-style, knockout) |
|---|---|---|
| **Classic mode** (shared player ownership, no draft) | **PART B** | **PART C** |
| **Draft mode** (one player per manager, draft required) | **PART D** | **PART E** |

**Shared flows** (identical across all paths) are in **PART A** — run once, reference from other parts.

**Scoring flows** (mode-agnostic) are in **PART F**.

---

## Prerequisites — One-Time Setup

### Step 1 — Start the Dev Server
```bash
npm run dev   # http://localhost:5173
```
Confirm the app loads and login page appears.

### Step 2 — Create 4 Test Accounts
Run **Appendix A** SQL once in the Supabase dashboard → SQL Editor.

| Handle | Email | Password | Role |
|---|---|---|---|
| TestComm | `e2e_test1@fantasykit.test` | `Test2026!!` | Commissioner (all leagues) |
| TestMgr2 | `e2e_test2@fantasykit.test` | `Test2026!!` | Member |
| TestMgr3 | `e2e_test3@fantasykit.test` | `Test2026!!` | Member |
| TestMgr4 | `e2e_test4@fantasykit.test` | `Test2026!!` | Member |

### Step 3 — Create 4 Test Leagues + Seed Data
Run **Appendix B** SQL. This creates:

| League | ID | Mode | Tournament |
|---|---|---|---|
| `CLASSIC_EPL_E2E` | `c1a5501e-0000-4000-a000-000000000001` | classic | 426 (EPL) |
| `CLASSIC_WC_E2E` | `c1a5502e-0000-4000-a000-000000000002` | classic | 429 (WC 2026) |
| `DRAFT_EPL_E2E` | `daf7e001-0000-4000-a000-000000000001` | noduplicate | 426 (EPL) |
| `DRAFT_WC_E2E` | `daf7e002-0000-4000-a000-000000000002` | noduplicate | 429 (WC 2026) |

All 4 managers are added to all 4 leagues.

### Step 4 — Seed Squads
Run **Appendix C** SQL to give each manager a seeded 15-player squad in each league. This uses real players from the `players` table — not hardcoded IDs.

### Step 5 — Price Check (HARD STOP)
Run **Appendix D** before any test flow that involves budget. Seed prices if missing.

---

## ⛔ PRICE CHECK — Run Before Any Budget Flow

```sql
-- Run once for each tournament under test
SELECT
  tournament_id,
  COUNT(*)                                                 AS total,
  COUNT(*) FILTER (WHERE price IS NOT NULL)                AS with_price,
  COUNT(*) FILTER (WHERE price IS NULL)                    AS no_price,
  ROUND(100.0 * COUNT(*) FILTER (WHERE price IS NOT NULL)
        / COUNT(*), 1)                                     AS pct_priced
FROM players
WHERE tournament_id IN ('426', '429')
GROUP BY tournament_id;
```

**Pass condition**: `no_price = 0` for every tournament row.

**If prices are missing** — run this, then re-check:
```sql
-- Seed £4.0–£7.0 randomly for any unpriced player
UPDATE players
SET price = ROUND((RANDOM() * 3 + 4)::NUMERIC, 1)
WHERE price IS NULL AND tournament_id IN ('426', '429');
```

**Why this exists**: In session 50 (2026-05-27), all WC transfer tests appeared to pass with 1,480 null-priced players. Budget enforcement was never triggered. Null prices cause `process-transfer` to default to £0, bypassing all budget checks. See TESTING_STRATEGY.md §Principle 2.

---

## PART A — Shared Flows (All Modes)

These flows are **identical regardless of league mode or tournament type**. Run once against `CLASSIC_EPL_E2E`, then confirm the same behaviour in other leagues during those parts' runs.

---

### A-1: Auth & Onboarding

**Purpose**: Login, session persistence, onboarding wizard dismiss.

1. Open `http://localhost:5173` — confirm redirect to login.
2. Log in as `e2e_test1@fantasykit.test` / `Test2026!!`.
3. **Assert**: redirected to home; user avatar or username visible.
4. Refresh the page — **Assert**: still logged in (session persisted).
5. If onboarding wizard appears: click **Skip** or **Got it** on each step.
6. Log out. Log in as `e2e_test2@fantasykit.test` — **Assert**: different username shown.
7. Log out. Log back in as `e2e_test1`.

**Pass**: Both accounts log in; session persists after refresh. ✓

---

### A-2: League Chat — Send, Mention, Hashtag

**URL**: `/league/c1a5501e-0000-4000-a000-000000000001?tab=chat`

1. As TestComm — navigate to chat tab.
2. **Assert**: any previously sent messages from other managers are visible.
3. Type: `E2E test message #worldcup @TestMgr2 — looks good!`
4. Press **Send** (or click **SEND +**).
5. **Assert**: message appears immediately with:
   - Correct username (TestComm)
   - `#worldcup` rendered in cyan/highlighted colour
   - `@TestMgr2` highlighted as a mention
6. **Assert**: input clears after sending.
7. Hover your own message — **Assert**: EDIT and DEL buttons appear.
8. Open a second browser tab as TestMgr2 — **Assert**: message appears in real-time without refresh.

**Pass**: Message delivered, hashtag + mention formatted, real-time delivery confirmed. ✓

---

### A-3: Captain Selection & Triple Captain Chip

**URL**: `/squad?leagueId=c1a5501e-0000-4000-a000-000000000001`

1. Squad screen loads with 15/15 and player list visible.
2. Click any outfield player row — action panel expands.
3. **Assert**: options include **MAKE CAPTAIN**, **SUB OUT**, **SELL**.
4. Click **MAKE CAPTAIN**.
5. **Assert**: gold **C** badge appears next to that player's name.
6. Navigate to Chips tab (or sub-section).
7. **Assert**: three chip cards visible — Wildcard (or equivalent), Triple Captain, Daily Joker.
8. Click **Activate** under Triple Captain → confirm dialog appears.
9. Click **Activate** in the dialog.
10. **Assert**: Triple Captain card shows **ACTIVE** badge (gold tone).
11. Navigate to squad pitch view — **Assert**: captain row shows triple-captain indicator (C×3 or similar).
12. Deactivate Triple Captain via the chip card.

```sql
-- Verify captain set
SELECT captain_id, is_triple_captain FROM squads
WHERE league_id = 'c1a5501e-0000-4000-a000-000000000001'
  AND user_id = 'aaaae001-0000-4000-a000-000000000001'
ORDER BY created_at DESC LIMIT 1;
-- captain_id: matches player clicked; is_triple_captain: false (after deactivation)
```

**Pass**: Captain badge set, Triple Captain activates and deactivates cleanly. ✓

---

### A-4: Starting XI / Bench Swap

**URL**: `/squad?leagueId=c1a5501e-0000-4000-a000-000000000001`

**Pre-condition**: Squad has 15 players and `starting_xi` is populated (run Appendix C Step 2 to set it).

1. Squad screen shows two zones: Pitch (11 starters) and Bench (4 players).
2. Identify a bench player whose fixture has not yet kicked off.
3. Click that bench player → action panel shows **BRING INTO XI** (or equivalent swap action).
4. Select an XI player to swap out.
5. **Assert**: the two players switch zones immediately.
6. **Assert**: formation display updates (e.g. 4-3-3 → 3-4-3 if DEF swapped for MID).

```sql
-- Verify starting_xi updated
SELECT starting_xi FROM squads
WHERE league_id = 'c1a5501e-0000-4000-a000-000000000001'
  AND user_id = 'aaaae001-0000-4000-a000-000000000001'
ORDER BY created_at DESC LIMIT 1;
-- starting_xi should now include the bench player and exclude the swapped-out player
```

**Pass**: Players swap between XI and bench; `starting_xi` DB column updated. ✓

---

### A-5: Daily Joker (16th Man) Chip

**URL**: `/squad?leagueId=c1a5501e-0000-4000-a000-000000000001`

1. In Chips tab — locate Daily Joker card.
2. Click **Choose 16th Man** (or equivalent).
3. **Assert**: player picker shows players from clubs with today's fixture.
4. Select any player from the list.
5. **Assert**: Joker card shows **LOCKED FOR THIS MATCHDAY**.
6. Attempt to set a second joker by refreshing and opening Chips tab again.
7. **Assert**: button is disabled — cannot set a second joker for the same matchday.

```sql
SELECT player_id, matchday_id FROM daily_jokers
WHERE user_id = 'aaaae001-0000-4000-a000-000000000001'
ORDER BY created_at DESC LIMIT 1;
-- matchday_id should match the current matchday
```

**Pass**: Joker locks after selection; second selection blocked. ✓

---

### A-6: Live Centre

**URL**: `/live`

1. Navigate to Live Centre.
2. **Assert**: league tile for `CLASSIC_EPL_E2E` is visible showing league name and your total points.
3. **Assert**: GW label is correct for the EPL tournament (e.g. "GW 38" not "GW —").
4. **Assert**: NEXT fixture strip shows EPL match (not WC match).

**Pass**: Correct league tile displayed with real tournament GW. ✓

---

### A-7: Roster Modal

**URL**: `/league/c1a5501e-0000-4000-a000-000000000001`

1. Navigate to BOARD tab (default).
2. **Assert**: all 4 managers listed with their total points.
3. Click on any manager row other than your own.
4. **Assert**: roster modal opens with that manager's squad player list.
5. Confirm player names and positions are shown (real players from DB).
6. Press Escape — **Assert**: modal closes.

**Pass**: Modal opens with real player data; closes cleanly. ✓

---

### A-8: Bets — Manager Places a Pick

**Pre-condition**: An open bet must exist in the league (created by commissioner in A-9 or seeded in Appendix B).

**URL**: `/league/c1a5501e-0000-4000-a000-000000000001?tab=bets`

1. Navigate to BETS tab.
2. **Assert**: "OPEN" section shows at least 1 bet.
3. Click one of the options (e.g. **Home Win**).
4. **Assert**: option highlights; "Your pick · [option]" confirmation shown.

```sql
SELECT answer FROM bet_submissions
WHERE user_id = 'aaaae001-0000-4000-a000-000000000001'
  AND bet_instance_id IN (
    SELECT id FROM bet_instances
    WHERE league_id = 'c1a5501e-0000-4000-a000-000000000001'
      AND status = 'open' LIMIT 1
  );
-- Should return the option key you clicked
```

**Pass**: Submission written to DB; option highlighted. ✓

---

## PART B — Classic × League Format (EPL)

**League**: `CLASSIC_EPL_E2E` · ID `c1a5501e-0000-4000-a000-000000000001` · Tournament 426

Classic mode: any player can be in multiple squads simultaneously. No draft. Transfer window is manually controlled (not deadline-controlled). Admin stepper shows 2 stages.

---

### B-1: League Creation and Mode Verification

1. Log in as TestComm.
2. Navigate to `/league` → click **Initialize Campaign**.
3. Select tournament **Premier League 2025-26**.
4. Select **Classic** mode (NOT Draft).
5. Enter league name: `CLASSIC_TEST_VERIFY`.
6. Click **Start Season**.
7. **Assert**: invite card shown with join code.
8. Navigate to the new league's **ADMIN tab**.
9. **Assert**: Season Stepper shows **exactly 2 stages**: TRANSFER WINDOW and IN SEASON. No DRAFT DEADLINE or ALLOCATION stage.
10. **Assert**: LIFECYCLE OPERATIONS section shows **no Draft card** — only Transfer Window, League News, Score Recalculation.
11. Navigate to **FRONTPAGE tab**.
12. **Assert**: secondary newspaper column shows "LEAGUE ACTIVITY" (not "DRAFT REPORT").

> **Note**: This verification league is for UI checks only. All functional tests use `CLASSIC_EPL_E2E`.

**Pass**: Classic league created; draft UI absent; 2-stage stepper; LEAGUE ACTIVITY column. ✓

---

### B-2: Market — Open Buy/Sell + Classic No-Block Verification

**URL**: `/market?leagueId=c1a5501e-0000-4000-a000-000000000001`

**Price check**: Confirm EPL prices seeded (Appendix D) before this flow.

#### B-2a: Sell a Player

1. As TestComm — market loads with your squad (15/15).
2. **Assert**: your owned players show a **SELL** button.
3. **Assert**: budget displayed (should be ~£58–62M depending on squad setup).
4. Click **SELL** on any owned player — confirm modal appears.
5. Confirm the sell.
6. **Assert**: squad drops to 14/15; budget increases by that player's price.

```sql
SELECT array_length(players,1) AS squad_size, budget_remaining FROM squads
WHERE league_id = 'c1a5501e-0000-4000-a000-000000000001'
  AND user_id = 'aaaae001-0000-4000-a000-000000000001'
ORDER BY created_at DESC LIMIT 1;
-- squad_size: 14; budget_remaining: original + sold player price
```

#### B-2b: Buy a Player (same player as another manager owns — Classic uniqueness test)

1. Note the player you just sold (or any player in TestMgr2's squad).
2. Search for that player in the market.
3. **Assert**: the player shows **NO "TAKEN" indicator** and has a **BUY** button — Classic mode allows shared ownership.
4. Click **BUY**.
5. **Assert**: squad returns to 15/15; budget decreases by player's price.

> **Key Classic assertion**: In Draft mode this player would show as "taken" and be unselectable. In Classic mode, it must be freely buyable even if owned by another manager.

```sql
-- Verify both managers can own the same player
SELECT s.user_id, s.players FROM squads s
WHERE s.league_id = 'c1a5501e-0000-4000-a000-000000000001'
  AND <bought_player_id> = ANY(s.players);
-- Should return at least 2 rows (TestComm + TestMgr2)
```

#### B-2c: Transfer Limit Enforcement

1. Make 3 buy/sell operations (the default `transfers_per_round` is 3).
2. Attempt a 4th transfer.
3. **Assert**: error shown — "Transfer limit reached for this round."

```sql
SELECT round_transfers FROM squads
WHERE league_id = 'c1a5501e-0000-4000-a000-000000000001'
  AND user_id = 'aaaae001-0000-4000-a000-000000000001'
ORDER BY created_at DESC LIMIT 1;
-- round_transfers JSONB should show count = 3 for the current matchday_id
```

**Pass**: Sell works; Classic allows buying a "taken" player; transfer limit enforced. ✓

---

### B-3: Auctions — List + Bid

#### B-3a: List a Player for Auction (as TestComm)

**URL**: `/squad?leagueId=c1a5501e-0000-4000-a000-000000000001`

1. Click a player row — action panel expands.
2. **Assert**: **AUCTION** button visible.
3. Click **AUCTION**.
4. Set minimum bid (e.g. £5.0M).
5. Confirm listing.
6. **Assert**: player card shows **ON AUCTION** badge.

```sql
SELECT id, player_id, starting_bid, current_bid, status, deadline_at
FROM auction_listings
WHERE league_id = 'c1a5501e-0000-4000-a000-000000000001'
  AND status = 'open'
ORDER BY created_at DESC LIMIT 1;
-- status: 'open'; starting_bid: 5.0
```

#### B-3b: Bid on Listing (as TestMgr2)

**URL**: `/league/c1a5501e-0000-4000-a000-000000000001?tab=auctions`

1. Log in as TestMgr2.
2. Navigate to AUCTIONS tab — **Assert**: listing created by TestComm is visible.
3. Enter a bid amount above the minimum (e.g. £5.5M).
4. Click **Bid**.
5. **Assert**: current bid on the listing updates to £5.5M.

```sql
SELECT current_bid, highest_bidder_id FROM auction_listings
WHERE league_id = 'c1a5501e-0000-4000-a000-000000000001'
  AND status = 'open'
ORDER BY created_at DESC LIMIT 1;
-- current_bid: 5.5; highest_bidder_id: TestMgr2's squad_id
```

#### B-3c: Cancel Listing (as TestComm, before any bids)

1. Seed a fresh listing with no bids (Appendix B, auction section).
2. Log in as TestComm → AUCTIONS tab → find the unbid listing.
3. Click **Cancel** (only available when no bids have been placed).
4. **Assert**: listing disappears from AUCTIONS tab.

```sql
SELECT status FROM auction_listings
WHERE league_id = 'c1a5501e-0000-4000-a000-000000000001'
ORDER BY created_at DESC LIMIT 1;
-- status: 'cancelled'
```

**Pass**: Player listed; second manager bids; listing updates; cancellation works when no bids. ✓

---

### B-4: Trade Proposal — Propose, View, Accept

**URL**: `/league/c1a5501e-0000-4000-a000-000000000001`

#### B-4a: Propose a Trade (as TestComm)

1. Click on TestMgr2 in BOARD standings → Roster modal opens.
2. Note a player in TestMgr2's squad you want.
3. Close modal. Click **TRADE** button (or navigate to trade flow).
4. Select a player from your squad to offer.
5. Select TestMgr2's player you want in return.
6. Optionally set a cash sweetener (default is £5.0M — reset to £0 for a straight swap).
7. Click **Broadcast Proposal** (or equivalent submit button).
8. **Assert**: proposal sent; "Trade proposal sent!" toast appears.

```sql
SELECT id, status, proposer_player_id, target_player_id FROM trade_proposals
WHERE league_id = 'c1a5501e-0000-4000-a000-000000000001'
ORDER BY created_at DESC LIMIT 1;
-- status: 'pending'
```

#### B-4b: Accept the Trade (as TestMgr2)

1. Log in as TestMgr2.
2. Navigate to league — **Assert**: notification badge on league icon.
3. Open incoming trade proposals — **Assert**: the proposal from TestComm is visible.
4. Click **Accept**.
5. **Assert**: success message; squads swap the players.

```sql
-- Verify players swapped
SELECT players FROM squads
WHERE league_id = 'c1a5501e-0000-4000-a000-000000000001'
  AND user_id = 'aaaae001-0000-4000-a000-000000000001'
ORDER BY created_at DESC LIMIT 1;
-- Should now contain TestMgr2's player and NOT contain TestComm's offered player
```

**Pass**: Proposal sent, accepted, players swapped in both squads. ✓

---

### B-5: Admin — Bets (Create + Resolve + Void)

**URL**: `/league/c1a5501e-0000-4000-a000-000000000001?tab=admin`

#### B-5a: Create a Bet (Commissioner)

1. Log in as TestComm → Admin tab.
2. **Assert**: Admin tab visible only for TestComm (not for TestMgr2).
3. In **BET MANAGEMENT → CREATE BET** section:
4. Click **MATCH RESULT** bet type.
5. **Assert**: Step 2 shows upcoming EPL fixtures (real fixtures from `fixtures` table, status = 'scheduled').
6. Click any upcoming fixture.
7. **Assert**: Options auto-set to HOME WIN, DRAW, AWAY WIN.
8. Click **NEXT** → Step 3.
9. Set reward: **5 pts**. Set picks-close deadline: 1 hour from now.
10. Click **NEXT** → Step 4.
11. Review summary — click **PUBLISH BET →**.
12. **Assert**: wizard resets to Step 1; new bet appears in RESOLVE BETS as PENDING.

```sql
SELECT title, status, options FROM bet_instances
WHERE league_id = 'c1a5501e-0000-4000-a000-000000000001'
ORDER BY created_at DESC LIMIT 1;
-- status: 'open'; options: array with 3 entries
```

#### B-5b: Manager Places a Pick

Switch to TestMgr2 → BETS tab → pick **Home Win** on the newly created bet.

#### B-5c: Resolve the Bet

1. Back as TestComm → Admin tab → RESOLVE BETS section.
2. Expand the pending bet — **Assert**: WHO PICKED WHAT shows TestMgr2's pick.
3. Select the correct answer chip.
4. **Assert**: footer shows "AWARDS +5 PTS TO N MANAGERS".
5. Click **RESOLVE →**.
6. **Assert**: bet moves to NOTHING TO RESOLVE; success banner.

```sql
SELECT status, correct_answer, winners_count FROM bet_instances
WHERE league_id = 'c1a5501e-0000-4000-a000-000000000001'
ORDER BY created_at DESC LIMIT 1;
-- status: 'resolved'
```

#### B-5d: Void a Bet

1. Seed a fresh open bet (Appendix B).
2. As TestComm → Admin → RESOLVE BETS.
3. Expand the bet → click **VOID** (with confirm dialog).
4. **Assert**: bet disappears from PENDING; status = 'voided' in DB.

```sql
SELECT status FROM bet_instances
WHERE league_id = 'c1a5501e-0000-4000-a000-000000000001'
ORDER BY created_at DESC LIMIT 1;
-- status: 'voided'
```

**Pass**: Bet created (real fixture), picked by manager, resolved with points, voided bet confirmed. ✓

---

### B-6: Admin — Transfer Window, League News, Score Recalculation

**URL**: `/league/c1a5501e-0000-4000-a000-000000000001?tab=admin`

#### B-6a: Transfer Window Open/Close (Classic EPL — manual control)

1. In LIFECYCLE OPERATIONS → TRANSFER WINDOW card.
2. **Assert**: card shows **OPEN** or **CLOSED** status (NOT "DEADLINE-CONTROLLED" — EPL leagues use manual windows).
3. **Assert**: **OPEN** and **CLOSE NOW** buttons are visible and enabled.
4. Click **CLOSE NOW** → confirm dialog → window closes.
5. **Assert**: status pill changes to CLOSED (danger tone).
6. Navigate to Market — **Assert**: "WINDOW CLOSED" banner appears; BUY buttons disabled.
7. Return to Admin → click **OPEN** → status changes to OPEN.
8. Return to Market — **Assert**: window open; BUY buttons enabled again.

#### B-6b: League News Post

1. Admin tab → LEAGUE NEWS section.
2. **Assert**: HEADLINE input + optional DETAILS textarea + POST TO LEAGUE button.
3. Enter headline: `GW 38 transfer window now open — get your transfers in!`
4. Enter details (one per line): `Window closes Sunday 22:00` + `Check injuries before buying`
5. Click **POST TO LEAGUE →**.
6. **Assert**: success message.
7. Navigate to RECAP tab → **Assert**: breaking-news entry appears at top of activity feed.

```sql
SELECT headline, bullets FROM gazette_entries
WHERE league_id = 'c1a5501e-0000-4000-a000-000000000001'
  AND entry_type = 'breaking_news'
ORDER BY published_at DESC LIMIT 1;
-- headline: the text entered; bullets: array of detail lines
```

#### B-6c: Score Recalculation

1. Admin tab → LIFECYCLE OPERATIONS → SCORE RECALCULATION card.
2. Click **SCORE LATEST ROUND ↯** (green button).
3. **Assert**: success message mentioning the round and number of squads scored.
4. Navigate to BOARD → **Assert**: standings show updated points.

**Pass**: Transfer window toggles; news posted to Gazette; scoring triggered. ✓

---

### B-7: Standings, FrontPage, Stats, Betting Leaderboard

**URL**: `/league/c1a5501e-0000-4000-a000-000000000001`

#### B-7a: BOARD Tab

1. **Assert**: BOARD tab (default) shows all 4 managers ranked by total points.
2. **Assert**: GW label in header shows real round number (not "GW —").
3. **Assert**: your rank and points match the DB.

#### B-7b: FrontPage Tab

1. Click **FRONTPAGE**.
2. **Assert**: "Forza Times" newspaper renders.
3. **Assert**: Lead article references the league leader by name.
4. **Assert**: Secondary column header reads "LEAGUE ACTIVITY" (Classic mode — NOT "DRAFT REPORT").
5. **Assert**: Right sidebar shows top-6 standings table with real points.

#### B-7c: Stats Tab

1. Click **STATS**.
2. **Assert**: "LEAGUE STATS · N GAMEWEEKS" header visible.
3. **Assert**: TOTAL, AVG, LEAD point numbers populated (not zero or "—").
4. **Assert**: SEASON TOTALS bar chart shows all 4 managers with coloured bars.

#### B-7d: Betting Leaderboard Tab

1. Click **BETTING**.
2. **Assert**: YOUR BETTING section shows: pts earned, rank, played, won, win%.
3. **Assert**: BETTING LEADERBOARD shows at least 1 manager row with record.

**Pass**: All tabs load with real data; FrontPage secondary column = LEAGUE ACTIVITY. ✓

---

## PART C — Classic × Cup Format (WC 2026)

**League**: `CLASSIC_WC_E2E` · ID `c1a5502e-0000-4000-a000-000000000002` · Tournament 429

Classic mode + cup format. Differences from PART B:
- Transfer window is **DEADLINE-CONTROLLED** (not manual open/close)
- Cannot buy players from eliminated clubs
- Club cap relaxes as clubs exit
- No draft section in admin

Flows identical to PART B (bets, chat, roster modal, stats, trade, auction, captain, chips, lineup) are skipped here — reference PART A and B. Only cup-specific and deadline-controlled behaviours are tested.

---

### C-1: Verify No Draft UI in Admin

**URL**: `/league/c1a5502e-0000-4000-a000-000000000002?tab=admin`

1. Log in as TestComm → Admin tab.
2. **Assert**: Season Stepper shows **2 stages** (TRANSFER WINDOW + IN SEASON).
3. **Assert**: LIFECYCLE OPERATIONS has **no DRAFT card** and **no KNOCKOUT DRAFT card**.

**Pass**: No draft UI for Classic mode, regardless of cup format. ✓

---

### C-2: Transfer Window — DEADLINE-CONTROLLED

**URL**: `/league/c1a5502e-0000-4000-a000-000000000002?tab=admin`

1. In LIFECYCLE OPERATIONS → TRANSFER WINDOW card.
2. **Assert**: status pill shows **DEADLINE-CONTROLLED** (warn/amber tone).
3. **Assert**: **no OPEN button** and **no CLOSE NOW button** — these are replaced by the explanatory label.
4. Navigate to Market — **Assert**: banner reflects the current matchday deadline status (OPEN or CLOSED based on `matchday_deadlines`).

**Pass**: WC league shows DEADLINE-CONTROLLED; no manual open/close buttons. ✓

---

### C-3: Eliminated Club Restriction

**Pre-condition**: At least one club must be marked eliminated in `cup_active_clubs`. Run Appendix C-3 SQL to simulate this.

**URL**: `/market?leagueId=c1a5502e-0000-4000-a000-000000000002`

1. Navigate to market for the WC league.
2. Search for a player from the eliminated club.
3. **Assert**: that player's card shows **ELIMINATED CLUB** label or BUY button is disabled.
4. Attempt to buy a non-eliminated player — **Assert**: buy succeeds normally.

```sql
-- Verify the eliminated club player cannot be bought
SELECT club, COUNT(*) FROM players
WHERE tournament_id = '429'
  AND club = (
    SELECT c.club_name FROM cup_active_clubs c
    WHERE c.league_id = 'c1a5502e-0000-4000-a000-000000000002'
      AND c.eliminated_at IS NOT NULL LIMIT 1
  )
GROUP BY club;
```

**Pass**: Eliminated club players cannot be purchased; others can. ✓

---

### C-4: Club Cap Relaxation Display

**Pre-condition**: Simulate 7 clubs remaining (club cap = 4) via Appendix C-4 SQL.

**URL**: `/market?leagueId=c1a5502e-0000-4000-a000-000000000002`

1. Buy 4 players from the same club (which is only possible when cap = 4).
2. **Assert**: 4th player from that club is purchasable (buy succeeds).
3. Attempt a 5th player from the same club — **Assert**: error "Club cap exceeded".

**Pass**: Club cap reflects remaining active clubs (4 per club when ≤8 active). ✓

---

## PART D — Draft × League Format (EPL)

**League**: `DRAFT_EPL_E2E` · ID `daf7e001-0000-4000-a000-000000000001` · Tournament 426

Draft mode + league format. One initial draft. No knockout phase. After allocation, FCFS market (only unallocated players available to buy). Admin shows 4-stage stepper and Draft card (no Knockout Draft card).

---

### D-1: Draft Submission — Manual + Auto-Fill

**Pre-condition**: Draft deadline must be in the future. Run Appendix D-1 SQL.

**URL**: `/league/daf7e001-0000-4000-a000-000000000001/draft`

1. Log in as TestComm.
2. **Assert**: "CLOSES IN Xh" countdown visible; "0/30" list; player pool shows real EPL players.
3. **Assert**: no position or budget constraints during submission (page allows any combination).
4. Search for a specific player by name (use a real EPL player from the DB).
5. Click the player row → click **Add to List**.
6. Repeat for 4 more players of different positions.
7. **Assert**: list shows "5/30" and position counters updated.
8. Click **Auto-Complete**.
9. **Assert**: list jumps to "30/30"; all position counters show totals.
10. Click **Submit List (30)**.
11. **Assert**: submission confirmation screen shows all 30 players ranked.
12. **Assert**: "Edit List" button available (submission not yet processed).

```sql
SELECT array_length(player_ids,1) AS list_length, status
FROM draft_submissions
WHERE league_id = 'daf7e001-0000-4000-a000-000000000001'
  AND user_id = 'aaaae001-0000-4000-a000-000000000001';
-- list_length: 30; status: 'pending'
```

**Repeat** for TestMgr2, TestMgr3, TestMgr4: each submits their own list. At least 3 players must appear in multiple lists (to test lottery conflict resolution).

**Pass**: All 4 managers submit 30-player lists; persisted as 'pending' in DB. ✓

---

### D-2: Admin — Draft Deadline + Run Allocation

**URL**: `/league/daf7e001-0000-4000-a000-000000000001?tab=admin`

#### D-2a: Verify 4-Stage Stepper

1. Log in as TestComm → Admin tab.
2. **Assert**: Season Stepper shows **4 stages**: TRANSFER WINDOW → DRAFT DEADLINE → ALLOCATION → IN SEASON.
3. Current stage should be **DRAFT DEADLINE** (deadline is set but in future).

#### D-2b: Set Draft Deadline (Already Past — Simulate)

Run Appendix D-2 SQL to move the deadline to 1 minute ago (simulates deadline passing).

Refresh admin tab.
- **Assert**: DRAFT card status changes to **DEADLINE PASSED** (warn tone).
- **Assert**: **RUN ALLOCATION ↯** button becomes enabled.

#### D-2c: Run Allocation

1. Click **RUN ALLOCATION ↯**.
2. **Assert**: confirm dialog: "This allocates squads for all N managers. It can't be undone. Continue?"
3. Click confirm.
4. **Assert**: success message; button becomes disabled with status **ALLOCATED**.
5. **Assert**: Season Stepper advances — ALLOCATION stage is now complete (green ✓).
6. Navigate to FRONTPAGE tab — **Assert**: secondary column now shows **DRAFT REPORT** with contested picks summary.

```sql
-- Verify allocation ran for all 4 managers
SELECT user_id, array_length(allocated_players,1), unresolved_slots
FROM draft_allocations
WHERE league_id = 'daf7e001-0000-4000-a000-000000000001';
-- Should return 4 rows; most with 15 players; some may have unresolved_slots > 0
```

**Pass**: Allocation runs; squads built; stepper advances; gazette entry created. ✓

---

### D-3: Squad Recovery — Incomplete Allocation

If any manager in D-2 has `unresolved_slots > 0`:

**URL**: `/league/daf7e001-0000-4000-a000-000000000001/draft/recover`

1. Log in as the manager with incomplete allocation.
2. **Assert**: Recovery screen shows empty slots filtered by needed position.
3. **Assert**: only unallocated players are shown (no player currently in another manager's squad).
4. Select a player for each empty slot.
5. **Assert**: squad reaches 15/15; recovery screen closes.

```sql
-- Verify all slots filled
SELECT array_length(players,1) FROM squads
WHERE league_id = 'daf7e001-0000-4000-a000-000000000001'
  AND user_id = '<manager_with_gaps>';
-- Should return 15
```

**Pass**: Recovery screen fills remaining slots with FCFS picks. ✓

---

### D-4: Market — Draft FCFS, takenByOther Blocking

**URL**: `/market?leagueId=daf7e001-0000-4000-a000-000000000001`

**Price check**: Confirm EPL prices seeded (Appendix D) before this flow.

#### D-4a: Sell and FCFS Buy

1. Log in as TestComm — squad shows 15/15.
2. Sell one player (from your allocated squad).
3. **Assert**: squad drops to 14/15.
4. Browse the market — **Assert**: your sold player now appears as available (unowned after sell).
5. Buy a player who was NOT allocated to any manager.
6. **Assert**: squad returns to 15/15.

#### D-4b: Draft takeLock (takenByOther)

1. Note a player in TestMgr2's squad.
2. Search for that player in the market as TestComm.
3. **Assert**: that player's card shows **"Taken by TestMgr2"** indicator and the BUY button is disabled (greyed out, cannot be clicked).

> **Key Draft assertion**: Unlike Classic mode (PART B-2b), Draft mode enforces player uniqueness. A player in another squad must be blocked.

```sql
-- Confirm the player is in TestMgr2's squad
SELECT user_id FROM squads
WHERE league_id = 'daf7e001-0000-4000-a000-000000000001'
  AND '<player_id>' = ANY(players);
-- Should return TestMgr2's user_id only
```

**Pass**: FCFS buy works for unowned players; takenByOther correctly blocks Draft-mode buys. ✓

---

### D-5: Admin — No Knockout Draft Card (League Format)

**URL**: `/league/daf7e001-0000-4000-a000-000000000001?tab=admin`

1. Admin tab → LIFECYCLE OPERATIONS.
2. **Assert**: **NO Knockout Draft card is visible** — this is a League format league; cup phases never occur.
3. Only Transfer Window, (Group Stage) Draft, League News, and Score Recalculation cards are present.

**Pass**: Knockout Draft correctly hidden for Draft × League format. ✓

---

### D-6: FrontPage — Draft Report Column

**URL**: `/league/daf7e001-0000-4000-a000-000000000001?tab=frontpage`

1. Navigate to FRONTPAGE tab (after allocation has run).
2. **Assert**: secondary column header reads **"DRAFT REPORT"** (not "LEAGUE ACTIVITY").
3. **Assert**: `GazetteDraftReport` shows contested picks with manager names.

**Pass**: Draft mode shows DRAFT REPORT in Gazette. ✓

---

## PART E — Draft × Cup Format (WC 2026)

**League**: `DRAFT_WC_E2E` · ID `daf7e002-0000-4000-a000-000000000002` · Tournament 429

Draft mode + cup format. Two-phase draft (group stage + knockout). Club cap relaxes. Eliminated club restriction. Player-repeat relaxation. Transfer window is DEADLINE-CONTROLLED. Admin shows 4-stage stepper + Knockout Draft card (after cup phase starts).

---

### E-1: Group Stage Draft Submission

Same as D-1 but for tournament 429.

**URL**: `/league/daf7e002-0000-4000-a000-000000000002/draft`

1. All 4 managers submit 30-player WC lists.
2. **Assert**: player pool shows real WC players (from `players WHERE tournament_id = '429'`).
3. **Assert** (if pool pressure is high — simulate via Appendix E-1 SQL): pool pressure banner shows pressure percentage and current relaxation tier.

```sql
-- Confirm all 4 submitted
SELECT user_id, array_length(player_ids,1), status
FROM draft_submissions
WHERE league_id = 'daf7e002-0000-4000-a000-000000000002'
  AND phase = 'group';
-- 4 rows; each 30 players; status 'pending'
```

**Pass**: All 4 managers submit group-stage wishlists. ✓

---

### E-2: Admin — Group Stage Allocation + Cup Phase Transition

**URL**: `/league/daf7e002-0000-4000-a000-000000000002?tab=admin`

1. Move deadline to past (Appendix E-2 SQL).
2. Refresh admin → **RUN ALLOCATION ↯** becomes enabled.
3. Click it → confirm → allocation runs.
4. **Assert**: `cup_phase` transitions to `group_stage` in DB.

```sql
SELECT cup_phase FROM leagues
WHERE id = 'daf7e002-0000-4000-a000-000000000002';
-- cup_phase: 'group_stage'
```

5. **Assert**: Knockout Draft card NOW APPEARS in LIFECYCLE OPERATIONS (it was hidden before cup_phase advanced).
6. **Assert**: Knockout Draft card status = **NOT SET** (warn tone) — waiting for a deadline.

**Pass**: Group allocation completes; cup_phase advances; Knockout Draft card appears. ✓

---

### E-3: Market — Eliminated Club + Draft takenByOther

**Pre-condition**: Simulate a club elimination (Appendix E-3 SQL).

**URL**: `/market?leagueId=daf7e002-0000-4000-a000-000000000002`

1. Search for a player from the eliminated club.
2. **Assert**: player shows **ELIMINATED CLUB** indicator; BUY is disabled.
3. Search for a player allocated to another manager.
4. **Assert**: player shows **takenByOther** indicator; BUY is disabled.
5. Search for an unallocated player from a surviving club.
6. **Assert**: BUY is enabled; buy succeeds.

**Pass**: Both Draft uniqueness AND Cup club elimination restrictions enforced simultaneously. ✓

---

### E-4: Admin — Knockout Draft (Set Deadline + Run Allocation)

**URL**: `/league/daf7e002-0000-4000-a000-000000000002?tab=admin`

**Pre-condition**: Group allocation has run (E-2 completed), `cup_phase = 'group_stage'`.

#### E-4a: Managers Submit Knockout Wishlists

**URL**: `/league/daf7e002-0000-4000-a000-000000000002/draft`

1. Each of the 4 managers visits the draft screen again.
2. **Assert**: draft screen resets (new submission for `phase = 'knockout'`).
3. Each submits a 30-player wishlist from the surviving club pool.

```sql
SELECT user_id, phase, array_length(player_ids,1)
FROM draft_submissions
WHERE league_id = 'daf7e002-0000-4000-a000-000000000002'
  AND phase = 'knockout';
-- 4 rows
```

#### E-4b: Set Knockout Deadline + Run Allocation

1. Admin tab → KNOCKOUT DRAFT card.
2. Enter a deadline datetime in the KNOCKOUT DEADLINE input.
3. Set it 1 minute in the past to simulate it passing (or use current datetime and wait).
4. Click **RUN KNOCKOUT ALLOCATION ↯**.
5. **Assert**: confirm dialog → allocation runs.
6. **Assert**: Knockout Draft card shows **ALLOCATED** (positive tone).

```sql
SELECT phase, array_length(allocated_players,1), unresolved_slots
FROM draft_allocations
WHERE league_id = 'daf7e002-0000-4000-a000-000000000002'
  AND phase = 'knockout';
-- 4 rows; 15 players each (or < 15 if unresolved)
```

**Pass**: Knockout draft runs; squads rebuilt for knockout phase. ✓

---

### E-5: Player-Repeat Relaxation Banner

**Pre-condition**: Pool pressure must be > threshold. Run Appendix E-5 SQL to simulate high pressure (reduce `available_pool_size` in `relaxation_state` or reduce the `relaxation_base` config).

**URL**: `/league/daf7e002-0000-4000-a000-000000000002/draft`

1. Open the draft screen.
2. **Assert**: coloured banner appears at top (🟡 or 🔴 indicator).
3. **Assert**: banner shows pressure percentage and current repeat allowance (e.g. "1 repeat allowed per squad").

**Pass**: Pool pressure banner displays correctly when pressure threshold exceeded. ✓

---

### E-6: Admin — DEADLINE-CONTROLLED Transfer Window (WC League)

**URL**: `/league/daf7e002-0000-4000-a000-000000000002?tab=admin`

1. Admin tab → LIFECYCLE OPERATIONS → TRANSFER WINDOW card.
2. **Assert**: status = **DEADLINE-CONTROLLED** (warn tone).
3. **Assert**: no OPEN or CLOSE NOW buttons — only an explanatory label.

**Pass**: WC draft league correctly shows deadline-controlled window. ✓

---

## PART F — Scoring & Points (All Modes)

Run against `DRAFT_EPL_E2E` (`daf7e001-0000-4000-a000-000000000001`). Scoring logic is identical across modes — only the league matters for squad scoping.

**Pre-condition**: At least one EPL fixture must have `status = 'finished'` and have `player_match_stats` rows. Run Appendix F SQL to seed a finished fixture and stats if no real finished fixture exists yet.

---

### F-1: Score Latest Round (Admin Button)

**URL**: `/league/daf7e001-0000-4000-a000-000000000001?tab=admin`

1. Admin tab → LIFECYCLE OPERATIONS → SCORE RECALCULATION card.
2. Click **SCORE LATEST ROUND ↯**.
3. **Assert**: success message showing round ID, fixture count, and squads scored.
4. Navigate to BOARD → **Assert**: standings show updated total points for all 4 managers.

```sql
-- Verify fantasy_points written
SELECT s.user_id, fp.matchday_id, fp.total
FROM fantasy_points fp
JOIN squads s ON s.id = fp.squad_id
WHERE s.league_id = 'daf7e001-0000-4000-a000-000000000001'
ORDER BY s.user_id, fp.matchday_id;
-- Should return rows for each manager+matchday combination
```

**Pass**: Button triggers scoring; `fantasy_points` rows written; standings updated. ✓

---

### F-2: Points Breakdown View

**URL**: `/squad?leagueId=daf7e001-0000-4000-a000-000000000001`

1. Squad screen loads with player list.
2. **Assert**: players who played in the finished fixture show non-zero points next to their name.
3. Click a player row → **Assert**: scoring breakdown visible (goals, assists, clean sheet, etc.).

**Pass**: Breakdown shows per-event contribution from real match stats. ✓

---

### F-3: Fixture-Specific Recalculation

**URL**: `/league/daf7e001-0000-4000-a000-000000000001?tab=admin`

1. Admin tab → SCORE RECALCULATION card.
2. Enter the ID of the finished fixture in the FIXTURE ID input (get from DB via Appendix F).
3. Click **RECALCULATE ↯**.
4. **Assert**: success message for that specific fixture.
5. Navigate to BOARD → points unchanged (idempotent re-run produces same result).

**Pass**: Fixture-specific recalculation is idempotent and scoped correctly. ✓

---

## Appendix A — Create 4 Test Accounts

Run once in Supabase dashboard → SQL Editor.

```sql
-- Test users
INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, confirmation_token, recovery_token,
  email_change_token_new, email_change, is_super_admin,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000000000',
   'aaaae001-0000-4000-a000-000000000001'::uuid,
   'authenticated','authenticated','e2e_test1@fantasykit.test',
   crypt('Test2026!!',gen_salt('bf',10)),NOW(),'','','','',false,
   '{"provider":"email","providers":["email"]}','{"username":"TestComm"}',NOW(),NOW()),
  ('00000000-0000-0000-0000-000000000000',
   'aaaae002-0000-4000-a000-000000000002'::uuid,
   'authenticated','authenticated','e2e_test2@fantasykit.test',
   crypt('Test2026!!',gen_salt('bf',10)),NOW(),'','','','',false,
   '{"provider":"email","providers":["email"]}','{"username":"TestMgr2"}',NOW(),NOW()),
  ('00000000-0000-0000-0000-000000000000',
   'aaaae003-0000-4000-a000-000000000003'::uuid,
   'authenticated','authenticated','e2e_test3@fantasykit.test',
   crypt('Test2026!!',gen_salt('bf',10)),NOW(),'','','','',false,
   '{"provider":"email","providers":["email"]}','{"username":"TestMgr3"}',NOW(),NOW()),
  ('00000000-0000-0000-0000-000000000000',
   'aaaae004-0000-4000-a000-000000000004'::uuid,
   'authenticated','authenticated','e2e_test4@fantasykit.test',
   crypt('Test2026!!',gen_salt('bf',10)),NOW(),'','','','',false,
   '{"provider":"email","providers":["email"]}','{"username":"TestMgr4"}',NOW(),NOW())
ON CONFLICT (id) DO UPDATE SET
  encrypted_password = crypt('Test2026!!',gen_salt('bf',10)),
  email_confirmed_at = NOW();

INSERT INTO auth.identities (provider_id, user_id, identity_data, provider,
  last_sign_in_at, created_at, updated_at)
VALUES
  ('aaaae001-0000-4000-a000-000000000001',
   'aaaae001-0000-4000-a000-000000000001'::uuid,
   '{"sub":"aaaae001-0000-4000-a000-000000000001","email":"e2e_test1@fantasykit.test","email_verified":true}',
   'email',NOW(),NOW(),NOW()),
  ('aaaae002-0000-4000-a000-000000000002',
   'aaaae002-0000-4000-a000-000000000002'::uuid,
   '{"sub":"aaaae002-0000-4000-a000-000000000002","email":"e2e_test2@fantasykit.test","email_verified":true}',
   'email',NOW(),NOW(),NOW()),
  ('aaaae003-0000-4000-a000-000000000003',
   'aaaae003-0000-4000-a000-000000000003'::uuid,
   '{"sub":"aaaae003-0000-4000-a000-000000000003","email":"e2e_test3@fantasykit.test","email_verified":true}',
   'email',NOW(),NOW(),NOW()),
  ('aaaae004-0000-4000-a000-000000000004',
   'aaaae004-0000-4000-a000-000000000004'::uuid,
   '{"sub":"aaaae004-0000-4000-a000-000000000004","email":"e2e_test4@fantasykit.test","email_verified":true}',
   'email',NOW(),NOW(),NOW())
ON CONFLICT (provider, provider_id) DO NOTHING;

INSERT INTO public.users (id, username) VALUES
  ('aaaae001-0000-4000-a000-000000000001'::uuid, 'TestComm'),
  ('aaaae002-0000-4000-a000-000000000002'::uuid, 'TestMgr2'),
  ('aaaae003-0000-4000-a000-000000000003'::uuid, 'TestMgr3'),
  ('aaaae004-0000-4000-a000-000000000004'::uuid, 'TestMgr4')
ON CONFLICT (id) DO NOTHING;
```

---

## Appendix B — Create 4 Test Leagues + Seed Members + Open Bets

Run before each test cycle. Creates all 4 leagues with all 4 members.

```sql
-- ── 1. Leagues ────────────────────────────────────────────────────────────────
INSERT INTO leagues (id, name, format, tournament_id, created_by,
  cup_phase, transfers_open, join_code)
VALUES
  ('c1a5501e-0000-4000-a000-000000000001','CLASSIC_EPL_E2E',
   'classic','426','aaaae001-0000-4000-a000-000000000001'::uuid,
   'pre_cup', true, 'CLSE1'),
  ('c1a5502e-0000-4000-a000-000000000002','CLASSIC_WC_E2E',
   'classic','429','aaaae001-0000-4000-a000-000000000001'::uuid,
   'pre_cup', true, 'CLWC2'),
  ('daf7e001-0000-4000-a000-000000000001','DRAFT_EPL_E2E',
   'noduplicate','426','aaaae001-0000-4000-a000-000000000001'::uuid,
   'pre_cup', true, 'DREP1'),
  ('daf7e002-0000-4000-a000-000000000002','DRAFT_WC_E2E',
   'noduplicate','429','aaaae001-0000-4000-a000-000000000001'::uuid,
   'pre_cup', true, 'DRWC2')
ON CONFLICT (id) DO UPDATE SET
  transfers_open = EXCLUDED.transfers_open,
  created_by = EXCLUDED.created_by;

-- ── 2. Members ────────────────────────────────────────────────────────────────
DO $$
DECLARE
  league_ids UUID[] := ARRAY[
    'c1a5501e-0000-4000-a000-000000000001'::uuid,
    'c1a5502e-0000-4000-a000-000000000002'::uuid,
    'daf7e001-0000-4000-a000-000000000001'::uuid,
    'daf7e002-0000-4000-a000-000000000002'::uuid
  ];
  user_ids   UUID[] := ARRAY[
    'aaaae001-0000-4000-a000-000000000001'::uuid,
    'aaaae002-0000-4000-a000-000000000002'::uuid,
    'aaaae003-0000-4000-a000-000000000003'::uuid,
    'aaaae004-0000-4000-a000-000000000004'::uuid
  ];
  lid UUID; uid UUID;
BEGIN
  FOREACH lid IN ARRAY league_ids LOOP
    FOREACH uid IN ARRAY user_ids LOOP
      INSERT INTO league_members (league_id, user_id, role, joined_at, total_points)
      VALUES (lid, uid,
        CASE WHEN uid = 'aaaae001-0000-4000-a000-000000000001'::uuid
             THEN 'commissioner' ELSE 'member' END,
        NOW(), 0)
      ON CONFLICT (league_id, user_id) DO UPDATE SET role = EXCLUDED.role;
    END LOOP;
  END LOOP;
END $$;

-- ── 3. Transfer window open: push EPL deadlines to future ─────────────────────
UPDATE matchday_deadlines
SET deadline_at = NOW() + INTERVAL '14 days'
WHERE tournament_id = '426'
  AND deadline_at > NOW() - INTERVAL '30 days'
  AND deadline_at < NOW() + INTERVAL '1 day';

-- ── 4. Seed open bets (one per league, for PART A-8 and B-5) ─────────────────
-- Uses the first upcoming EPL fixture for CLASSIC_EPL_E2E
INSERT INTO bet_instances (
  league_id, title, prompt, options, reward_type, reward_value,
  deadline_at, resolves_at, scope_type, scope_ref, status
)
SELECT
  'c1a5501e-0000-4000-a000-000000000001',
  'E2E Bet — ' || home_team || ' vs ' || away_team,
  'Who wins?',
  jsonb_build_array(
    jsonb_build_object('key','home','label', home_team || ' Win'),
    jsonb_build_object('key','draw','label','Draw'),
    jsonb_build_object('key','away','label', away_team || ' Win')
  ),
  'points', 5,
  NOW() + INTERVAL '2 hours',
  NOW() + INTERVAL '4 hours',
  'match', id::text, 'open'
FROM fixtures
WHERE tournament_id = '426'
  AND status = 'scheduled'
  AND kickoff_at > NOW()
ORDER BY kickoff_at ASC
LIMIT 1
ON CONFLICT DO NOTHING;

-- ── 5. Open auction listings for B-3 ─────────────────────────────────────────
-- Created dynamically during B-3a by the commissioner via the squad screen.
-- This step is intentionally left for the UI flow, not pre-seeded.
-- If a fresh listing is needed: delete existing open listings first.
DELETE FROM auction_listings
WHERE league_id = 'c1a5501e-0000-4000-a000-000000000001';
```

---

## Appendix C — Seed 15-Player Squads for Each Manager

```sql
-- Seeds squads using real players from the DB.
-- Strategy: pick the top-priced players by position to ensure variety.
-- This does NOT enforce draft uniqueness — that is enforced by the draft flow itself.
-- For Classic leagues, shared player ownership is intentional.

DO $$
DECLARE
  r RECORD;
  squad_players TEXT[];
  gk_ids  TEXT[];
  def_ids TEXT[];
  mid_ids TEXT[];
  fwd_ids TEXT[];
  t_id    TEXT;
  l_id    UUID;
  u_id    UUID;
BEGIN
  FOR r IN (
    SELECT lm.league_id, lm.user_id, l.tournament_id::TEXT AS t_id
    FROM league_members lm
    JOIN leagues l ON l.id = lm.league_id
    WHERE lm.league_id IN (
      'c1a5501e-0000-4000-a000-000000000001',
      'c1a5502e-0000-4000-a000-000000000002',
      'daf7e001-0000-4000-a000-000000000001',
      'daf7e002-0000-4000-a000-000000000002'
    )
  ) LOOP
    t_id := r.t_id;

    -- Pick 2 GKs, 5 DEFs, 5 MIDs, 3 FWDs by highest price (real players)
    SELECT ARRAY(
      SELECT id FROM players WHERE tournament_id = t_id AND position = 'GK'
      ORDER BY price DESC NULLS LAST LIMIT 2
    ) INTO gk_ids;

    SELECT ARRAY(
      SELECT id FROM players WHERE tournament_id = t_id AND position = 'DEF'
      ORDER BY price DESC NULLS LAST LIMIT 5
    ) INTO def_ids;

    SELECT ARRAY(
      SELECT id FROM players WHERE tournament_id = t_id AND position = 'MID'
      ORDER BY price DESC NULLS LAST LIMIT 5
    ) INTO mid_ids;

    SELECT ARRAY(
      SELECT id FROM players WHERE tournament_id = t_id AND position = 'FWD'
      ORDER BY price DESC NULLS LAST LIMIT 3
    ) INTO fwd_ids;

    squad_players := gk_ids || def_ids || mid_ids || fwd_ids;

    INSERT INTO squads (
      league_id, user_id, players, starting_xi,
      budget_remaining, matchday_id
    )
    SELECT
      r.league_id, r.user_id,
      squad_players,
      -- starting XI: 1 GK + 4 DEF + 4 MID + 2 FWD (4-4-2)
      ARRAY[gk_ids[1], def_ids[1], def_ids[2], def_ids[3], def_ids[4],
            mid_ids[1], mid_ids[2], mid_ids[3], mid_ids[4],
            fwd_ids[1], fwd_ids[2]],
      -- Budget: £100M minus sum of top 15 prices
      100 - COALESCE((
        SELECT SUM(p.price) FROM players p
        WHERE p.id = ANY(squad_players) AND p.price IS NOT NULL
      ), 0),
      -- Active matchday
      (SELECT matchday_id FROM matchday_deadlines
       WHERE tournament_id = t_id
         AND deadline_at > NOW()
       ORDER BY deadline_at ASC LIMIT 1)
    ON CONFLICT (league_id, user_id, matchday_id) DO UPDATE
      SET players = EXCLUDED.players,
          starting_xi = EXCLUDED.starting_xi,
          budget_remaining = EXCLUDED.budget_remaining;
  END LOOP;
END $$;

-- Also seed draft_allocations (required for roster modal in Draft leagues)
INSERT INTO draft_allocations (league_id, user_id, allocated_players,
  unresolved_slots, allocated_at, phase)
SELECT s.league_id, s.user_id, s.players, 0, NOW(), 'group'
FROM squads s
WHERE s.league_id IN (
  'daf7e001-0000-4000-a000-000000000001',
  'daf7e002-0000-4000-a000-000000000002'
)
ON CONFLICT (league_id, user_id, phase)
  DO UPDATE SET allocated_players = EXCLUDED.allocated_players;
```

---

## Appendix D — Price Check + Random Seeding

```sql
-- 1. Check coverage
SELECT
  tournament_id,
  COUNT(*)                                               AS total,
  COUNT(*) FILTER (WHERE price IS NOT NULL)              AS with_price,
  COUNT(*) FILTER (WHERE price IS NULL)                  AS no_price,
  ROUND(100.0 * COUNT(*) FILTER (WHERE price IS NOT NULL)
        / NULLIF(COUNT(*), 0), 1)                        AS pct_priced
FROM players
WHERE tournament_id IN ('426', '429')
GROUP BY tournament_id;

-- 2. If no_price > 0 for either tournament: seed random prices
-- EPL (tournament 426): tighter spread (established valuations)
UPDATE players
SET price = ROUND((RANDOM() * 4 + 4)::NUMERIC, 1)  -- £4.0–£8.0
WHERE tournament_id = '426' AND price IS NULL;

-- WC (tournament 429): slightly lower base (fewer data points)
UPDATE players
SET price = ROUND((RANDOM() * 3 + 4)::NUMERIC, 1)  -- £4.0–£7.0
WHERE tournament_id = '429' AND price IS NULL;

-- 3. Confirm
SELECT tournament_id, COUNT(*) FILTER (WHERE price IS NULL) AS still_null
FROM players WHERE tournament_id IN ('426','429')
GROUP BY tournament_id;
-- Both rows must show still_null = 0 before proceeding
```

---

## Appendix D-1 — Set Draft Deadline (Future)

```sql
-- Give all 4 managers 48 hours to submit draft lists
UPDATE leagues
SET draft_deadline = NOW() + INTERVAL '48 hours'
WHERE id IN (
  'daf7e001-0000-4000-a000-000000000001',
  'daf7e002-0000-4000-a000-000000000002'
);
```

---

## Appendix D-2 — Move Draft Deadline to Past (Trigger Allocation)

```sql
-- Simulate deadline passing
UPDATE leagues
SET draft_deadline = NOW() - INTERVAL '1 minute'
WHERE id = 'daf7e001-0000-4000-a000-000000000001';
-- (Also do for DRAFT_WC_E2E if testing E-2)
```

---

## Appendix C-3 — Simulate Club Elimination (Cup Tests)

```sql
-- Mark one club as eliminated in CLASSIC_WC_E2E
-- Use a real club from the WC player pool
WITH eliminated AS (
  SELECT DISTINCT club FROM players
  WHERE tournament_id = '429'
  ORDER BY club LIMIT 1
)
INSERT INTO cup_active_clubs (league_id, club_id, eliminated_at)
SELECT 'c1a5502e-0000-4000-a000-000000000002', club, NOW()
FROM eliminated
ON CONFLICT (league_id, club_id) DO UPDATE SET eliminated_at = NOW();

-- Same for DRAFT_WC_E2E
INSERT INTO cup_active_clubs (league_id, club_id, eliminated_at)
SELECT 'daf7e002-0000-4000-a000-000000000002', club_id, NOW()
FROM cup_active_clubs
WHERE league_id = 'c1a5502e-0000-4000-a000-000000000002'
ON CONFLICT (league_id, club_id) DO UPDATE SET eliminated_at = NOW();
```

---

## Appendix C-4 — Simulate ≤8 Active Clubs (Cap = 4)

```sql
-- Eliminate enough clubs so ≤8 remain active
-- First: count distinct WC clubs
SELECT COUNT(DISTINCT club) FROM players WHERE tournament_id = '429';

-- Then mark all but 7 as eliminated (leaving 7 active → cap = 4)
INSERT INTO cup_active_clubs (league_id, club_id, eliminated_at)
SELECT 'c1a5502e-0000-4000-a000-000000000002', club, NOW()
FROM (
  SELECT DISTINCT club FROM players WHERE tournament_id = '429'
  ORDER BY club
  OFFSET 7 -- keep the first 7 clubs active
) elim
ON CONFLICT (league_id, club_id) DO UPDATE SET eliminated_at = NOW();
```

---

## Appendix E-2 — Move WC Draft Deadline to Past

```sql
UPDATE leagues
SET draft_deadline = NOW() - INTERVAL '1 minute'
WHERE id = 'daf7e002-0000-4000-a000-000000000002';
```

---

## Appendix E-5 — Simulate High Pool Pressure (Player-Repeat Relaxation)

```sql
-- Reduce relaxation_base so pressure threshold is hit with fewer clubs remaining
UPDATE league_config
SET config_value = '0.1'  -- very low threshold → pressure triggers easily
WHERE league_id = 'daf7e002-0000-4000-a000-000000000002'
  AND config_key = 'relaxation_base';
```

---

## Appendix F — Seed Finished Fixture + Stats for Scoring Tests

```sql
-- Only needed if no real finished EPL fixture exists yet.

-- 1. Get a scheduled fixture to use
SELECT id, home_team, away_team FROM fixtures
WHERE tournament_id = '426' AND status = 'scheduled'
ORDER BY kickoff_at ASC LIMIT 1;
-- Note the fixture ID (e.g. 'f-1234567890') and team names

-- 2. Mark it finished
UPDATE fixtures
SET status = 'finished', home_score = 2, away_score = 1
WHERE id = '<fixture_id_from_above>';

-- 3. Seed match stats for players in test squads
-- Run this for each player in the squads you want to score
-- Replace player_id and fixture_id with real values from your DB
INSERT INTO player_match_stats (
  fixture_id, player_id,
  minutes_played, goals, assists, clean_sheet,
  own_goals, yellow_cards, red_cards,
  penalty_saved, penalty_missed,
  fantasy_points, breakdown
)
SELECT
  '<fixture_id>',
  p.id,
  90,
  CASE p.position WHEN 'FWD' THEN 1 ELSE 0 END,  -- FWDs score 1 goal
  CASE p.position WHEN 'MID' THEN 1 ELSE 0 END,  -- MIDs get 1 assist
  CASE p.position WHEN 'GK'  THEN true
                  WHEN 'DEF' THEN true ELSE false END,  -- back line clean sheet
  0, 0, 0, 0, 0,
  CASE p.position
    WHEN 'GK'  THEN 6   -- clean sheet + 1pt/min approx
    WHEN 'DEF' THEN 6
    WHEN 'MID' THEN 5   -- assist
    WHEN 'FWD' THEN 5   -- goal
    ELSE 1
  END,
  '{}'::jsonb
FROM players p
WHERE p.id = ANY(
  ARRAY(SELECT unnest(players) FROM squads
        WHERE league_id = 'daf7e001-0000-4000-a000-000000000001'
          AND user_id = 'aaaae001-0000-4000-a000-000000000001'
        ORDER BY created_at DESC LIMIT 1)
)
AND p.tournament_id = '426'
ON CONFLICT (fixture_id, player_id) DO UPDATE
  SET fantasy_points = EXCLUDED.fantasy_points, updated_at = NOW();
```

---

## Appendix E — Verification Queries (Run After Key Steps)

```sql
-- 1. Price coverage (run before any budget flow)
SELECT tournament_id,
  COUNT(*) FILTER (WHERE price IS NULL) AS no_price
FROM players WHERE tournament_id IN ('426','429')
GROUP BY tournament_id;

-- 2. Confirm all 4 managers have squads in each league
SELECT l.name, lm.user_id, array_length(s.players,1) AS squad_size
FROM league_members lm
JOIN leagues l ON l.id = lm.league_id
LEFT JOIN squads s ON s.league_id = lm.league_id AND s.user_id = lm.user_id
WHERE l.id IN (
  'c1a5501e-0000-4000-a000-000000000001',
  'c1a5502e-0000-4000-a000-000000000002',
  'daf7e001-0000-4000-a000-000000000001',
  'daf7e002-0000-4000-a000-000000000002'
)
ORDER BY l.name, lm.user_id;

-- 3. No player overlap across Draft league squads (uniqueness check)
SELECT player_id, COUNT(DISTINCT user_id) AS owner_count
FROM (
  SELECT unnest(players) AS player_id, user_id FROM squads
  WHERE league_id IN (
    'daf7e001-0000-4000-a000-000000000001',
    'daf7e002-0000-4000-a000-000000000002'
  )
) x
GROUP BY player_id HAVING COUNT(DISTINCT user_id) > 1;
-- Must return 0 rows for Draft leagues

-- 4. Confirm bet resolution wrote points
SELECT lm.user_id, lm.total_points FROM league_members lm
WHERE lm.league_id = 'c1a5501e-0000-4000-a000-000000000001'
ORDER BY lm.total_points DESC;

-- 5. Draft submissions across all 4 managers
SELECT user_id, phase, array_length(player_ids,1) AS picks, status
FROM draft_submissions
WHERE league_id IN (
  'daf7e001-0000-4000-a000-000000000001',
  'daf7e002-0000-4000-a000-000000000002'
)
ORDER BY league_id, phase, user_id;

-- 6. Auction state
SELECT al.id, p.name, al.current_bid, al.status, al.deadline_at
FROM auction_listings al
JOIN players p ON p.id = al.player_id
WHERE al.league_id IN (
  'c1a5501e-0000-4000-a000-000000000001',
  'daf7e001-0000-4000-a000-000000000001'
)
ORDER BY al.created_at DESC;

-- 7. Gazette entries (league news + draft report)
SELECT entry_type, headline, published_at FROM gazette_entries
WHERE league_id IN (
  'c1a5501e-0000-4000-a000-000000000001',
  'daf7e001-0000-4000-a000-000000000001'
)
ORDER BY published_at DESC LIMIT 10;

-- 8. Fantasy points after scoring
SELECT s.user_id, fp.matchday_id, fp.total
FROM fantasy_points fp
JOIN squads s ON s.id = fp.squad_id
WHERE s.league_id = 'daf7e001-0000-4000-a000-000000000001'
ORDER BY s.user_id, fp.matchday_id;
```

---

## Known Limitations & Notes

| Issue | Scope | Note |
|---|---|---|
| Lineup lock cron (5 min interval) | Starting XI tests (A-4) | Manually set `fixtures.status = 'live'` in SQL to trigger locks immediately |
| Player prices not from Forza API | All budget flows | Seed via Appendix D — the only permitted use of synthetic data |
| process-transfer JWT | BUY action | Use user's JWT from localStorage if the edge function call silently fails |
| WC fixtures may not exist | Cup tests | Run Appendix C-3/C-4 to simulate cup state; seed stats via Appendix F |
| Draft relaxation config | Pool pressure test (E-5) | Requires tweaking `league_config.relaxation_base` — revert after test |
| Real-time chat test | A-2 (two browsers) | Use two separate browser profiles or incognito + normal window |
| Auction min-increment validation | B-3b | Bid must be ≥ `current_bid + min_increment`; `0.1` increments will be rejected; use `0.5` |

---

Last Updated: **2026-06-01**
