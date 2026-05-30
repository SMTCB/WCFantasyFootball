# E2E Test Playbook — Forza Fantasy League
**Version**: 1.2 (2026-05-29)  
**Coverage**: Full user journey — draft (manual + auto) → scoring → bets (place + create + resolve) → transfers → auctions → squad interactions → chat → stats → roster modal  
**Auth**: Real Supabase auth required (`VITE_AUTH_ENABLED=true` in `.env`)  
**Test league**: `EPL_OVERALL_E2E` · Tournament 426 (Premier League) · 8 managers · noduplicate

---

## ⛔ HARD STOP — Price Check (run before any transfer/auction/budget test)

Before executing any flow that involves player transfers, auctions, or budget mechanics, verify that prices are seeded for the tournament under test. If they are not, **stop immediately and flag the session** — do not proceed until the user explicitly approves continuing without prices.

```sql
-- Run this for the tournament you are testing (replace '426' with your tournament_id)
SELECT
  COUNT(*)                                          AS total_players,
  COUNT(*) FILTER (WHERE price IS NOT NULL)         AS with_price,
  COUNT(*) FILTER (WHERE price IS NULL)             AS no_price,
  ROUND(100.0 * COUNT(*) FILTER (WHERE price IS NOT NULL) / COUNT(*), 1) AS pct_priced
FROM players
WHERE tournament_id = '426';
```

**Pass condition**: `no_price = 0` (or `pct_priced = 100`).

**If prices are missing**: Do NOT continue with FLOW 5 (Transfers), FLOW 6 (Auctions), or any test that asserts budget changes. The `process-transfer` function defaults null prices to £0, meaning all budget enforcement is silently bypassed — buy/sell transactions will succeed regardless of squad budget, making those test results meaningless.

**Why this matters**: In session 50 (2026-05-27), a full WC E2E test was run with 1,480 of 1,589 WC players having null prices. All transfer and auction flows appeared to pass, but budget enforcement was never exercised. This is the canonical example of a test that produced false confidence.

**To fix missing prices**: Prices are not provided by the Forza API. They must be seeded manually via a migration. Example:
```sql
-- Assign prices to all unpriced players in a tournament (adjust ranges as needed)
UPDATE players
SET price = ROUND((RANDOM() * 3 + 4)::NUMERIC, 1)  -- £4.0–£7.0
WHERE tournament_id = '429' AND price IS NULL;
```
Run this, confirm `no_price = 0`, then proceed.

---

## Prerequisites

### 1. Enable auth
```
# .env must have:
VITE_AUTH_ENABLED=true
```
Start dev server: `npm run dev`

### 2. Test credentials
Two test accounts with known passwords are required.  
Create them via Supabase SQL if they don't exist (see Appendix A).

| Role | Email | Password |
|------|-------|----------|
| Commissioner | `e2e_test1@fantasykit.test` | `Test2026!!` |
| Member (for bidding) | `e2e_test2@fantasykit.test` | `Test2026!!` |

### 3. Data setup
Run the SQL setup script in Appendix B to create:
- League `EPL_OVERALL_E2E` (id: `e2e00000-0000-0000-0000-000000000001`)
- 8 managers with squads
- GW38 deadline set to future (unblocks transfers)
- Transfer window open (round 31)

---

## Test Flows

### FLOW 1: Draft — Manual Selection + Auto-Fill
**Purpose**: Verify a manager can manually pick players then use Auto-Complete to fill remaining slots. Submission must persist to DB.

**URL**: `http://localhost:5173/league/aaaad001-0000-4000-a000-000000000001/draft`  
(EPL_DRAFT_TEST league — has a 2-day future deadline)

**Steps:**
1. Log in as `e2e_test1@fantasykit.test`
2. Navigate to the draft URL above
3. Confirm: "CLOSES IN Xh" countdown visible, "0/30" list, "661 players available"
4. Click on **Wataru Endo** → click **ADD TO LIST**
5. Click on **Randal Kolo Muani** → click **ADD TO LIST**
6. Click on **Lucas Perri** → click **ADD TO LIST**
7. Click on **Dan Burn** → click **ADD TO LIST**
8. Click on **Ármin Pécsi** → click **ADD TO LIST**
9. Confirm list shows **5/30**
10. Click **Auto-Complete** button
11. Confirm list jumps to **30/30**, position counters updated (4 GK, 9 DEF, 10 MID, 7 FWD)
12. Click **SUBMIT LIST (30)**
13. Confirm submission screen shows all 30 players with "EDIT LIST" and "BACK TO LEAGUE" buttons

**Expected in DB**:
```sql
SELECT array_length(player_ids,1), status FROM draft_submissions
WHERE league_id = 'aaaad001-0000-4000-a000-000000000001'
  AND user_id = 'aaaae001-0000-4000-a000-000000000001';
-- Should return: 30, 'pending'
```

**Pass criteria**: List = 30 players, status = pending in DB ✓

---

### FLOW 2a: Open Bet — Manager Places Pick
**Purpose**: Verify a manager can submit a prediction on an open bet.

**URL**: `http://localhost:5173/league/e2e00000-0000-0000-0000-000000000001?tab=bets`

**Steps:**
1. (Still logged in as e2e_test1 / commissioner)
2. Navigate to Bets tab
3. Confirm: **GW 38** visible in header, **OPEN: 1** counter
4. Locate "Admin Tab Test Bet — Arsenal vs Everton" in OPEN section
5. Click **Arsenal Win**
6. Confirm: button highlights cyan, "Your pick · Arsenal Win" shown, "Tap below to change" appears
7. Check RESULTS section shows 3 previously resolved bets with correct answers

**Expected in DB**:
```sql
SELECT answer FROM bet_submissions
WHERE user_id = 'aaaae001-0000-4000-a000-000000000001'
  AND bet_instance_id = (SELECT id FROM bet_instances WHERE title LIKE 'Admin Tab Test Bet%' LIMIT 1);
-- Should return: 'home'
```

**Pass criteria**: Bet submission written to DB, option highlighted in UI ✓

---

### FLOW 2b: Bet Resolution — Commissioner Admin Tab
**Purpose**: Verify a commissioner can mark the correct answer via the ADMIN tab and that submissions are graded.

**URL**: `http://localhost:5173/league/e2e00000-0000-0000-0000-000000000001?tab=admin`

**Steps:**
1. (Still logged in as e2e_test1)
2. Navigate to Admin tab
3. Confirm: **ADMIN** tab visible in header, **COMMISSIONER** label in panel
4. In **RESOLVE BETS** section, confirm 1 pending bet visible
5. Click on the pending bet to expand it
6. Confirm "WHO PICKED WHAT" shows managers and their picks
7. Click **Arsenal Win** in the ANSWER section
8. Click **RESOLVE →**
9. Confirm green success banner: "Bet resolved — N submissions graded."
10. Confirm RESOLVE BETS section shows "NOTHING TO RESOLVE · ALL CAUGHT UP"

**Expected in DB**:
```sql
SELECT status, correct_answer, winners_count FROM bet_instances
WHERE title LIKE 'Admin Tab Test Bet%' ORDER BY created_at DESC LIMIT 1;
-- Should return: 'resolved', 'home', N
```

**Pass criteria**: Bet resolved, banner shown, DB updated ✓

---

### FLOW 3a: Transfer Market — Sell a Player
**Purpose**: Verify a manager can sell a player from their squad via the Transfer Market.

**URL**: `http://localhost:5173/market?league=e2e00000-0000-0000-0000-000000000001`

**Steps:**
1. Navigate to Transfer Market, select EPL_OVERALL_E2E
2. Confirm: **15/15** squad, transfer window open, SELL buttons on owned players
3. Confirm budget shown (should be ~£58.5M)
4. Click **SELL** on any owned player (those showing SELL button, not OWNED)
5. Confirm sell confirmation modal: "SELL [PLAYER NAME]? You will receive £XM back"
6. Click **Sell** in the modal to confirm
7. Confirm: squad drops to **14/15**, budget increases by player's value, player no longer shows SELL (shows BUY)

**Expected in DB**:
```sql
SELECT array_length(players,1), budget_remaining FROM squads
WHERE league_id = 'e2e00000-0000-0000-0000-000000000001'
  AND user_id = 'aaaae001-0000-4000-a000-000000000001';
-- Should return: 14, ~64.5
```

**Pass criteria**: Squad = 14, budget increased ✓

---

### FLOW 3b: Transfer Market — Buy a Player
**Purpose**: Verify a manager can buy an available player to fill an empty slot.

**Still on Transfer Market page from Flow 3a**

**Steps:**
1. Squad shows 14/15, "1 empty" badge visible
2. Navigate FWD tab (or scroll to find an available FWD)
3. Find a FWD with no "TAKEN" tag and from a club you have <3 players from
4. Click **BUY** on that player
5. Confirm: squad counter updates to **15/15**, budget decreases by player's price

> **Note (BUG-14)**: `supabase.functions.invoke()` silently fails with `sb_publishable_*` key.  
> If BUY click doesn't update the UI, call process-transfer directly:
> ```js
> // In browser console:
> const token = JSON.parse(localStorage.getItem('sb-sssmvihxtqtohisghjet-auth-token')).access_token;
> fetch('https://sssmvihxtqtohisghjet.supabase.co/functions/v1/process-transfer', {
>   method: 'POST',
>   headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, 'Origin': 'http://localhost:5173' },
>   body: JSON.stringify({ action: 'buy', player_id: 'fp-653617-426', league_id: 'e2e00000-0000-0000-0000-000000000001' })
> }).then(r => r.json()).then(console.log);
> ```

**Pass criteria**: Squad = 15/15, budget decreased ✓

---

### FLOW 4: Auctions — Bid on Listed Player
**Purpose**: Verify the Auctions tab shows active listings and managers can place bids.

**URL**: `http://localhost:5173/league/e2e00000-0000-0000-0000-000000000001?tab=auctions`

**Steps:**
1. Navigate to Auctions tab
2. Confirm: **LISTED: 2**, **STATUS: LIVE**, two player cards visible
3. On the first listing (Randal Kolo Muani), note the current bid amount
4. Click in the bid input field and type a value above the minimum (shown as "£X.XM+")
5. Click **Bid** (button becomes enabled once a value is entered)
6. Confirm: current bid amount on the listing updates to your bid value, minimum input increases

**Expected in DB**:
```sql
SELECT amount FROM auction_bids
WHERE league_id = 'e2e00000-0000-0000-0000-000000000001'
ORDER BY placed_at DESC LIMIT 1;
-- Should return your bid amount
```

**Pass criteria**: Bid recorded, current_bid on listing updated ✓

---

### FLOW 5: League Board — Standings & Frontpage
**Purpose**: Verify the league board shows correct standings and the Frontpage renders the gazette.

**URL**: `http://localhost:5173/league/e2e00000-0000-0000-0000-000000000001`

**Steps:**
1. Navigate to league
2. Confirm BOARD tab (default):
   - "GW 38" in header (not "GW —")
   - 8 managers listed with their total points
   - Your rank and points shown at top
   - Leader name and score shown
3. Click **FRONTPAGE** tab
4. Confirm "Forza Times" newspaper renders with:
   - Headline referencing the league leader by name
   - Correct points in the headline (e.g. "52.56 points")
   - Draft report section below

**Pass criteria**: GW label shows real round number, standings correct, frontpage renders ✓

---

### FLOW 6: Squad Screen — View Formation
**Purpose**: Verify a manager's squad loads with players and correct GW.

**URL**: `http://localhost:5173/squad`

**Steps:**
1. Navigate to Squad, select EPL_OVERALL_E2E
2. Confirm: 
   - "15/15" squad counter
   - Budget displayed
   - Formation (e.g. "5-2-2")
   - "GW 426-r38" or current round shown
   - "WINDOW OPEN · X transfers left" banner
   - Player names and clubs visible

**Pass criteria**: Squad loads with real players, no "NO SQUAD BUILT YET" ✓

---

### FLOW 7: Live Centre — League Tiles
**Purpose**: Verify Live screen shows the correct league tile with real points.

**URL**: `http://localhost:5173/live`

**Steps:**
1. Navigate to Live Centre
2. Confirm: EPL_OVERALL_E2E tile visible with your total points
3. Confirm: GW label is correct for EPL tournament (not WC round)
4. Confirm: "NEXT" fixture strip shows EPL match (not WC match)

**Pass criteria**: Correct league tile, correct tournament's next fixture ✓

---

### FLOW 8: Admin Panel — Data Sync (requires deployed Forza API key)
**Purpose**: Verify admin panel loads correctly and data sync functions work.

**URL**: `http://localhost:5173/admin`

**Steps:**
1. Navigate to Admin panel (must be logged in as commissioner)
2. Select EPL_OVERALL_E2E
3. Confirm: no "Tournament not found" error (RLS fix confirmed)
4. Expand **Matchday Deadlines** section — verify GW30-38 deadlines listed
5. Expand **Data Sync** → click **Sync Fixtures** → confirm success response
6. Expand **Match Ingestion** → filter to Round 30 → click **Ingest** on one fixture
7. Click **Score** on same fixture → confirm "updated_squads: N" in response
8. Navigate to League BOARD → verify scores updated

**Pass criteria**: Admin panel accessible, functions execute without error ✓

---

### FLOW 9: Squad Screen — Player Interactions
**Purpose**: Verify a manager can click a player, access actions, and set a captain. Confirms the squad pitch list renders with real points.

**URL**: `http://localhost:5173/squad` → select WC_OVERALL_E2E

**Steps:**
1. Select WC_OVERALL_E2E — squad loads 15/15
2. Confirm: `WINDOW OPEN · Unlimited · Closes in Xh` banner visible
3. Confirm: Players from finished WC r1 fixtures show non-zero points (e.g. VAGNOMAN 6.25, OUNAHI 8.75)
4. Confirm: Players from non-r1-fixture clubs show 0
5. Click on a player row (e.g. OUNAHI) — action panel expands showing MAKE CAPTAIN, SUB OUT, SELL, ACTIVATE JOKER
6. Click **MAKE CAPTAIN** — gold `C` badge appears next to player name
7. Scroll to bottom — SUBSTITUTES section shows bench players with position badges

**Pass criteria**: Action panel opens, captain badge set, bench section visible ✓

---

### FLOW 10: Roster Modal — Click Manager in Standings
**Purpose**: Verify clicking a manager in BOARD standings opens their allocated squad roster.

**URL**: `http://localhost:5173/league/<wc_league_id>`

**Steps:**
1. Navigate to WC_OVERALL_E2E BOARD tab
2. Click on any manager row (e.g. DragonMgr, rank 2)
3. Modal opens: "DragonMgr's Roster · FULL 11-MAN TACTICAL SQUAD"
4. Confirm: Player cards visible with photo, position badge, club, price, READY status
5. Press Escape to close

**Pass criteria**: Modal opens with full player list pulled from `draft_allocations` ✓

---

### FLOW 11: Chat — Send and Receive Message
**Purpose**: Verify a manager can send a chat message and it appears in real-time.

**URL**: `http://localhost:5173/league/<wc_league_id>?tab=chat`

**Steps:**
1. Navigate to CHAT tab
2. Confirm: existing messages from other managers visible, right sidebar shows all 8 members with @handles
3. Type a message in the input (e.g. "WC E2E test — #worldcup @TestMgr")
4. Click **SEND +**
5. Confirm: message appears immediately at the bottom of the chat list with correct username, timestamp, and `#worldcup` in cyan, `@TestMgr` highlighted
6. Confirm: input field clears automatically
7. EDIT / DEL buttons visible on your own messages

**Pass criteria**: Message sent, rendered with @mention and #hashtag formatting ✓

---

### FLOW 12: Stats and Betting Tabs
**Purpose**: Verify STATS and BETTING tabs render real season data.

**URL**: `http://localhost:5173/league/<wc_league_id>?tab=stats` then `?tab=betting`

**STATS Steps:**
1. Click STATS tab
2. Confirm: "LEAGUE STATS · X GAMEWEEKS" header
3. Confirm: TOTAL, AVG, LEAD numbers are populated (not zero)
4. Confirm: SEASON TOTALS · TOP SCORERS bar chart shows all 8 managers with coloured bars

**BETTING Steps:**
1. Click BETTING tab
2. Confirm: YOUR BETTING section shows: pts earned, rank, played, won, win %, rewards
3. Confirm: BETTING LEADERBOARD shows at least 1 manager with record and rewards

**Pass criteria**: Both tabs load without errors, data is populated ✓

---

### FLOW 13: Admin — Create Bet via UI
**Purpose**: Commissioner creates a Match Result bet using the admin form (not SQL).

**URL**: `http://localhost:5173/league/<wc_league_id>?tab=admin`

**Steps:**
1. Navigate to ADMIN tab → CREATE BET section
2. Click **Match Result** bet type — it highlights as selected
3. Confirm: Step 3 "SELECT MATCH" shows upcoming WC fixtures **immediately** (no deadline needed)
4. Click on a fixture (e.g. Mexico vs South Africa, Thu 11 Jun, 20:00) — checkmark appears, "1 match · 3 options" counter updates
5. OPTIONS CREATED box shows: `· Mexico Win · Draw · South Africa Win`
6. Set a DEADLINE (optional — fixture list already populated)
7. Click **CREATE BET · 3 OPTIONS** button
8. Confirm: success — CREATE BET form resets, new bet appears in RESOLVE BETS as PENDING

**Pass criteria**: Bet created with correct fixture-linked options, appears in resolve list ✓

> **Note**: This flow requires the `BUG-E2E-07` fix (merged in session 52). Prior to that fix, `tournamentId` was always `undefined` and the fixture list was never populated.

---

### FLOW 14: Admin — Score Latest Round Button
**Purpose**: Commissioner triggers scoring for the most recently completed round via the new one-click button.

**URL**: `http://localhost:5173/league/<wc_league_id>?tab=admin`

**Steps:**
1. Navigate to ADMIN tab → LIFECYCLE OPERATIONS → SCORE RECALCULATION section (click `+` to expand)
2. Confirm: **SCORE LATEST ROUND ↯** green button visible
3. Click it
4. Confirm: success message appears: `"429-r1 scored — 3 fixtures, 12 squads, 25 stats."`
5. Navigate to BOARD — verify standings updated

> **Note (Playwright limitation)**: The button correctly calls `calculate-scores` per fixture but the Playwright MCP browser cannot reach Supabase Edge Functions via raw fetch (BUG-F8-01). Test this in a real browser, or verify via `curl`:
> ```bash
> curl -s -X POST "https://sssmvihxtqtohisghjet.supabase.co/functions/v1/calculate-scores" \
>   -H "Content-Type: application/json" -H "Authorization: Bearer nokey" \
>   -d '{"fixture_id":"f-1219435455"}'
> # Expected: {"ok":true,"source":"forza","player_stats":15,"updated_squads":12}
> ```

**Pass criteria**: Button triggers scoring for all r1 fixtures, board standings update ✓

---

## Verification Queries

### Confirm GW30+31 scores exist for all 8 managers:
```sql
SELECT u.email, 
  MAX(CASE WHEN fp.matchday_id='426-r30' THEN fp.total END) as gw30,
  MAX(CASE WHEN fp.matchday_id='426-r31' THEN fp.total END) as gw31
FROM squads s
JOIN auth.users u ON u.id = s.user_id
LEFT JOIN fantasy_points fp ON fp.squad_id = s.id
WHERE s.league_id = 'e2e00000-0000-0000-0000-000000000001'
GROUP BY u.email ORDER BY gw30 DESC NULLS LAST;
```

### Confirm no player overlap across squads:
```sql
SELECT player_id, COUNT(*) FROM (
  SELECT unnest(players) as player_id FROM squads 
  WHERE league_id='e2e00000-0000-0000-0000-000000000001'
) x GROUP BY player_id HAVING COUNT(*) > 1;
-- Should return 0 rows
```

### Confirm bet resolution worked:
```sql
SELECT bi.title, bi.correct_answer, bi.winners_count, bi.total_submissions,
  bs.answer, bs.is_correct
FROM bet_instances bi
JOIN bet_submissions bs ON bs.bet_instance_id = bi.id
WHERE bi.league_id = 'e2e00000-0000-0000-0000-000000000001'
  AND bi.status = 'resolved'
ORDER BY bi.created_at, bs.submitted_at;
```

---

## Appendix A: Create Test Auth Users
Run once in Supabase SQL editor when test users don't exist:
```sql
INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, confirmation_token, recovery_token, email_change_token_new,
  email_change, is_super_admin, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
('00000000-0000-0000-0000-000000000000', 'aaaae001-0000-4000-a000-000000000001'::uuid,
 'authenticated', 'authenticated', 'e2e_test1@fantasykit.test',
 crypt('Test2026!!', gen_salt('bf', 10)), NOW(), '', '', '', '', false,
 '{"provider":"email","providers":["email"]}', '{"username":"TestComm"}', NOW(), NOW()),
('00000000-0000-0000-0000-000000000000', 'aaaae002-0000-4000-a000-000000000002'::uuid,
 'authenticated', 'authenticated', 'e2e_test2@fantasykit.test',
 crypt('Test2026!!', gen_salt('bf', 10)), NOW(), '', '', '', '', false,
 '{"provider":"email","providers":["email"]}', '{"username":"TestMgr"}', NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET
  encrypted_password = crypt('Test2026!!', gen_salt('bf', 10)), email_confirmed_at = NOW();

INSERT INTO auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
VALUES
('aaaae001-0000-4000-a000-000000000001', 'aaaae001-0000-4000-a000-000000000001'::uuid,
 '{"sub":"aaaae001-0000-4000-a000-000000000001","email":"e2e_test1@fantasykit.test","email_verified":true}',
 'email', NOW(), NOW(), NOW()),
('aaaae002-0000-4000-a000-000000000002', 'aaaae002-0000-4000-a000-000000000002'::uuid,
 '{"sub":"aaaae002-0000-4000-a000-000000000002","email":"e2e_test2@fantasykit.test","email_verified":true}',
 'email', NOW(), NOW(), NOW())
ON CONFLICT (provider, provider_id) DO NOTHING;

INSERT INTO public.users (id, username) VALUES
  ('aaaae001-0000-4000-a000-000000000001'::uuid, 'TestComm'),
  ('aaaae002-0000-4000-a000-000000000002'::uuid, 'TestMgr')
ON CONFLICT (id) DO NOTHING;
```

## Appendix B: Data Reset for Re-run
Run before each test cycle to reset E2E data to a clean state:
```sql
-- Add test users to E2E league
INSERT INTO league_members (league_id, user_id, role, joined_at) VALUES
  ('e2e00000-0000-0000-0000-000000000001', 'aaaae001-0000-4000-a000-000000000001'::uuid, 'commissioner', NOW()),
  ('e2e00000-0000-0000-0000-000000000002', 'aaaae001-0000-4000-a000-000000000001'::uuid, 'commissioner', NOW())
ON CONFLICT (league_id, user_id) DO UPDATE SET role = EXCLUDED.role;

-- Update league created_by so ADMIN tab is accessible
UPDATE leagues SET created_by = 'aaaae001-0000-4000-a000-000000000001'::uuid
WHERE id = 'e2e00000-0000-0000-0000-000000000001';

-- Open transfer window (move GW38 deadline to future)
UPDATE matchday_deadlines SET deadline_at = NOW() + INTERVAL '2 days'
WHERE tournament_id = '426' AND matchday_id = '426-r38';

-- Update TestComm's squad matchday_id to match
UPDATE squads SET matchday_id = '426-r38'
WHERE league_id = 'e2e00000-0000-0000-0000-000000000001'
  AND user_id = 'aaaae001-0000-4000-a000-000000000001'::uuid;

-- Create a fresh open bet for admin-tab resolution test
INSERT INTO bet_instances (league_id, template_id, title, prompt, options, reward_type, reward_value,
  deadline_at, resolves_at, scope_type, scope_ref, status)
VALUES ('e2e00000-0000-0000-0000-000000000001',
  '63a7de4f-5153-4e12-b6c5-4d5f3fc199fc',
  'Admin Tab Test Bet — Arsenal vs Everton',
  'Who wins the GW30 Arsenal vs Everton match?',
  '[{"key":"home","label":"Arsenal Win"},{"key":"draw","label":"Draw"},{"key":"away","label":"Everton Win"}]'::jsonb,
  'points', 3, NOW() + INTERVAL '1 hour', NOW() + INTERVAL '2 hours',
  'match', 'f-1218672944', 'open');

-- Ensure auction listings exist
INSERT INTO auction_listings (league_id, player_id, seller_id, starting_bid, current_bid,
  deadline_at, status, min_increment)
VALUES
  ('e2e00000-0000-0000-0000-000000000001', 'fp-1708306-426',
   (SELECT id FROM squads WHERE league_id='e2e00000-0000-0000-0000-000000000001'
    AND user_id='cb76c523-dfd9-4eaa-babf-79845867b9d1' LIMIT 1),
   5.0, 5.0, NOW() + INTERVAL '24 hours', 'open', 0.5),
  ('e2e00000-0000-0000-0000-000000000001', 'fp-1141225-426',
   (SELECT id FROM squads WHERE league_id='e2e00000-0000-0000-0000-000000000001'
    AND user_id='a9574b86-4842-4596-961a-3d91d95a21c9' LIMIT 1),
   5.5, 5.5, NOW() + INTERVAL '24 hours', 'open', 0.5)
ON CONFLICT DO NOTHING;
```

---

## Known Limitations / Notes

1. **BUG-14**: `supabase.functions.invoke()` silently fails with the `sb_publishable_*` key format. Buy transfers require calling the edge function directly with the user's JWT from localStorage. Monitor if this is fixed in future Supabase JS SDK versions.

2. **Auction listing UI**: The "List for Auction" button in the squad screen is gated to `format === 'auction' || format === 'hybrid'`. These formats don't exist in the DB. Auction listings must be created directly via SQL or via the API.

3. **Season-end state**: After the EPL season ends (all matchday deadlines in the past), transfer windows and GW labels behave differently. The matchday_deadlines dates must be set to the future for testing.

4. **Draft lottery**: After running the lottery, squad `matchday_id` must match the current matchday deadline for transfers/scoring to work. Run the matchday update in Appendix B when re-testing.

---

## WC E2E Addendum (session 50 — 2026-05-28)

### BETS tab vs BETTING tab — they are different

The league navigation has two separate tabs:
- **BETS** — where managers place picks on open bet instances. Shows OPEN/PENDING/BANKED counters and the live pick UI.
- **BETTING** — the **prediction performance leaderboard**. Shows season-long stats: total pts earned from bets, win rate, record, rewards. Sorted by rewards earned. Only updates after bets are resolved.

### WC Tournament Setup Prerequisites

When creating a WC test league (tournament_id = '429') the following must be done manually — they are NOT auto-configured:

```sql
-- 1. Copy scoring rules from EPL to WC (no scoring rules exist for WC by default)
INSERT INTO scoring_rules (tournament_id, position, rules)
SELECT '429', position, rules FROM scoring_rules WHERE tournament_id = '426'
ON CONFLICT (tournament_id, position) DO NOTHING;

-- 2. Create matchday deadlines (WC has no deadlines pre-loaded)
INSERT INTO matchday_deadlines (tournament_id, matchday_id, deadline_at) VALUES
  ('429','429-r1', NOW() - INTERVAL '3 days'),   -- past round (scores already in)
  ('429','429-r2', NOW() + INTERVAL '14 days'),   -- current open window
  ('429','429-r3', NOW() + INTERVAL '21 days');   -- future

-- 3. Mark some fixtures 'finished' for scoring (WC fixtures default to 'scheduled')
--    Note: use 'finished' NOT 'after' — 'after' is not a valid match_status enum value
UPDATE fixtures SET status = 'finished', home_score = 2, away_score = 1, matchday_id = '429-r1'
WHERE id = 'f-1219435455';  -- Brazil vs Morocco
```

### Roster modal requires `draft_allocations`

The "XYZ's Roster" modal (opened by clicking a manager in BOARD standings) fetches `draft_allocations.allocated_players` to render the player list. If the league was created via direct SQL (not via the draft lottery), `draft_allocations` rows don't exist and the modal shows "Loading roster..." indefinitely.

**Workaround**: copy squads → draft_allocations before testing the roster/trade flow:
```sql
INSERT INTO draft_allocations (league_id, user_id, allocated_players, unresolved_slots, allocated_at)
SELECT s.league_id, s.user_id, s.players, 0, NOW()
FROM squads s WHERE s.league_id = '<your_league_id>'
ON CONFLICT (league_id, user_id) DO UPDATE SET allocated_players = EXCLUDED.allocated_players;
```

### Trade proposal UX notes

- Cash sweetener **defaults to £5.0M** (slider halfway), not £0. Reset to 0 for straight swap.
- The same player can be offered in **multiple simultaneous pending proposals** — the system allows this. The `accept_trade_proposal` RPC cascade-cancels competing proposals, but no UI warning is shown.
- The trade submit button is labelled **"Broadcast Proposal"** (not "Send" or "Submit").

### Auction bid input placeholder is misleading

The placeholder shows `£X.XM+` using a 0.1 increment from the current bid, but actual validation enforces the listing's `min_increment` (typically 0.5). A bid of `current_bid + 0.1` will be rejected with "Bid too low. Minimum: X.X". Always bid at least `current_bid + min_increment`. (Bug WC-03.)

### Admin tab — "Player Block" bet type

The ADMIN tab CREATE BET section shows three bet types: **Top Scorer**, **Match Result**, and **Player Block**. Player Block lets managers pick a player to "block" — if that player underperforms, the picker earns points. This is documented in `bet_templates` but not yet fully tested in E2E flows.

---

## Appendix C: WC Data Reset (session 52 — 2026-05-29)

Run before each WC test cycle to reset `WC_OVERALL_E2E` (id: `fca00001-0000-4000-a000-000000000001`, tournament 429) to a known state.

### Step 1 — Seed player prices (if not already done)
```sql
-- Assign £4.0–£7.0 to all unpriced WC players
UPDATE players
SET price = ROUND((RANDOM() * 3 + 4)::NUMERIC, 1)
WHERE tournament_id = '429' AND price IS NULL;

-- Verify
SELECT COUNT(*) FILTER (WHERE price IS NULL) AS no_price FROM players WHERE tournament_id = '429';
-- Must be 0
```

### Step 2 — Seed match events for finished WC fixtures
The Forza API does not backfill historical match events for WC. Seed `player_match_stats` manually for the 3 finished r1 fixtures:

**Fixture IDs (tournament 429, round r1):**
| Fixture | Result | ID |
|---------|--------|----|
| Brazil vs Morocco | 2-1 | `f-1219435455` |
| Germany vs Curaçao | 3-0 | `f-1219435591` |
| Qatar vs Switzerland | 1-1 | `f-1219435449` |

Sample insert (adapt player_ids as needed from the test league's squads):
```sql
-- Example: Richarlison (Brazil FWD) scored in Brazil 2-1 Morocco
INSERT INTO player_match_stats
  (fixture_id, player_id, minutes_played, goals, assists, own_goals, yellow_cards,
   red_cards, penalty_saved, penalty_missed, clean_sheet, tackles_won, interceptions,
   bps_score, bonus_points, fantasy_points, breakdown, shots_on_target, saves,
   xg, xa, goals_conceded, accurate_passes, total_passes, forza_match_id)
VALUES
  ('f-1219435455','fp-1411531-429',90,1,0,0,0,0,0,0,false,0,0,
   27.00,2,6.00,
   '{"minutes":1,"goals":4,"assists":0,"clean_sheet":0,"yellow_cards":0,"red_cards":0,"own_goals":0,"penalty_scored":0,"penalty_saved":0,"penalty_missed":0,"tackles":0,"interceptions":0,"bonus":2}'::jsonb,
   2,0,'0.70','0.20',0,0,0,'1219435455')
ON CONFLICT (fixture_id, player_id) DO UPDATE SET
  fantasy_points=EXCLUDED.fantasy_points, updated_at=NOW();
```

### Step 3 — Reset league, members, deadlines
```sql
-- Add test accounts to WC E2E league
INSERT INTO league_members (league_id, user_id, role, joined_at) VALUES
  ('fca00001-0000-4000-a000-000000000001','aaaae001-0000-4000-a000-000000000001'::uuid,'commissioner',NOW()),
  ('fca00001-0000-4000-a000-000000000001','aaaae002-0000-4000-a000-000000000002'::uuid,'member',NOW())
ON CONFLICT (league_id, user_id) DO UPDATE SET role = EXCLUDED.role;

-- Set created_by so ADMIN tab is accessible
UPDATE leagues SET created_by = 'aaaae001-0000-4000-a000-000000000001'::uuid
WHERE id = 'fca00001-0000-4000-a000-000000000001';

-- Open transfer window (move r2 deadline to future)
UPDATE matchday_deadlines SET deadline_at = NOW() + INTERVAL '14 days'
WHERE tournament_id = '429' AND matchday_id = '429-r2';

-- Sync squad matchday to open window
UPDATE squads SET matchday_id = '429-r2'
WHERE league_id = 'fca00001-0000-4000-a000-000000000001'
  AND user_id = 'aaaae001-0000-4000-a000-000000000001'::uuid;

-- Sync draft_allocations (required for roster modal)
INSERT INTO draft_allocations (league_id, user_id, allocated_players, unresolved_slots, allocated_at)
SELECT s.league_id, s.user_id, s.players, 0, NOW()
FROM squads s WHERE s.league_id = 'fca00001-0000-4000-a000-000000000001'
ON CONFLICT (league_id, user_id) DO UPDATE SET allocated_players = EXCLUDED.allocated_players;

-- Create a fresh open bet for admin-tab resolution test
DELETE FROM bet_instances
WHERE league_id = 'fca00001-0000-4000-a000-000000000001'
  AND title LIKE 'WC Admin Tab Test Bet%'
  AND status = 'open';

INSERT INTO bet_instances (league_id, template_id, title, prompt, options, reward_type, reward_value,
  deadline_at, resolves_at, scope_type, scope_ref, status)
VALUES ('fca00001-0000-4000-a000-000000000001',
  '63a7de4f-5153-4e12-b6c5-4d5f3fc199fc',
  'WC Admin Tab Test Bet - Brazil vs Morocco',
  'Who wins the WC Round 1 Brazil vs Morocco match?',
  '[{"key":"home","label":"Brazil Win"},{"key":"draw","label":"Draw"},{"key":"away","label":"Morocco Win"}]'::jsonb,
  'points', 3, NOW() + INTERVAL '1 hour', NOW() + INTERVAL '2 hours',
  'match', 'f-1219435455', 'open');
```

### Step 4 — Score round 1 via admin panel
After setup, log in as TestComm → League → ADMIN tab → LIFECYCLE OPERATIONS → SCORE RECALCULATION → click **SCORE LATEST ROUND ↯**. This runs `calculate-scores` for all 3 r1 fixtures and populates `fantasy_points` + `league_members.total_points`.

### Notes
- **`?league=` URL param**: The market URL `?league=fca00001-...` now correctly pre-selects the league (fixed in session 52).
- **Tour pop-ups**: Clicking "Skip intro" on the onboarding wizard now dismisses ALL per-screen tours. First-time test accounts will show the wizard once, then no tours.
- **process-transfer matchday**: The Edge Function now picks the nearest future `matchday_deadline` (not the furthest), so sells/buys work correctly for multi-round WC leagues.
- **Auction bids**: Re-bidding on the same listing now upserts the `auction_bids` row — each user always has their latest bid recorded.

---

## FLOW 12 — Chips (Wildcard, Triple Captain, 16th Man)

**Scope**: Verify the three squad chips activate correctly, enforce their rules, and respect matchday scope for the Daily Joker.

**Pre-conditions**:
- Logged in as `e2e_test1@fantasykit.test`
- Squad has at least 11 players signed (chips are disabled without a squad)
- No chips currently active (reset via SQL if needed: `UPDATE squads SET is_wildcard=false, is_triple_captain=false WHERE user_id=<uid>`)
- No Daily Joker row for the current matchday (reset: `DELETE FROM daily_jokers WHERE user_id=<uid>`)

### Step 1 — Navigate to Chips tab

1. Open `/squad` → select your league.
2. On mobile: tap the **⚡ CHIPS** tab strip. On desktop: click **Chips** sub-tab.
3. **Assert**: Three sections visible — Wildcard, Triple Captain, Daily Joker.
4. **Assert**: "CHIP GUIDE" button is visible at the top-right of the chips tab.

### Step 2 — Open the Chip Guide wizard

1. Tap / click **CHIP GUIDE**.
2. **Assert**: Modal slides up (mobile) or appears centered (desktop).
3. **Assert**: Three chip entries visible — Wildcard, Triple Captain, 16th Man — each with What/When/Restrictions/Tip sections.
4. **Assert**: "REPLAY TUTORIAL" and "GOT IT" buttons visible at the bottom.
5. Click **GOT IT** → modal closes.

### Step 3 — Activate Wildcard chip

1. In the Chips tab, tap **Activate Chip** under Wildcard.
2. **Assert**: Confirmation modal appears: "Use Wildcard?" + "This cannot be undone for this matchday."
3. Click **Activate**.
4. **Assert**: Wildcard card turns green and shows **ACTIVE** badge.
5. **Assert**: Button now reads "Deactivate".
6. Click **Deactivate** → Wildcard deactivates without a confirmation dialog.

```sql
-- Verify the DB flag toggled correctly
SELECT is_wildcard FROM squads WHERE user_id = '<test1_uid>' AND league_id = '<league_id>' ORDER BY created_at DESC LIMIT 1;
-- Expected: false after deactivation
```

### Step 4 — Activate Triple Captain chip

1. In the Chips tab, tap **Activate Chip** under Triple Captain.
2. **Assert**: Confirmation modal appears with "All-or-Nothing" warning.
3. Click **Activate**.
4. **Assert**: Triple Captain card turns gold and shows **ACTIVE** badge.
5. Navigate to Pitch tab → **Assert**: Captain badge shows a "C×3" or triple visual indicator.

```sql
SELECT is_triple_captain FROM squads WHERE user_id = '<test1_uid>' AND league_id = '<league_id>' ORDER BY created_at DESC LIMIT 1;
-- Expected: true
```

### Step 5 — Daily Joker (16th Man) — once per matchday enforcement

**Pre-condition**: No joker set yet. Squad has at least one player whose club is playing today.

1. In Chips tab, click **Choose 16th Man**.
2. **Assert**: Player picker appears, filtered to players from clubs playing today.
3. Select any player.
4. **Assert**: JokerCard now shows "JOKER LOCKED FOR TODAY" / "JOKER LOCKED FOR THIS MATCHDAY".
5. Attempt to set joker again by refreshing and opening the Chips tab.
6. **Assert**: Button is disabled / locked — cannot set a second joker.

```sql
-- Confirm joker row exists with matchday_id populated
SELECT player_id, joker_date, matchday_id FROM daily_jokers WHERE user_id = '<test1_uid>' ORDER BY created_at DESC LIMIT 1;
-- Expected: matchday_id matches the active matchday (e.g. '426-r35'), joker_date = today's date
```

**Matchday scope test** (manual): If today has multiple match fixtures on different calendar days, confirm the joker remains locked across both days without resetting at midnight (since constraint is now per matchday_id, not per joker_date).

### Step 6 — Validate chip chip already-used protection

1. Set Wildcard to active.
2. Via SQL: manually update `is_wildcard = false` to simulate "already used this season" without deactivating (or simulate `CHIP_ALREADY_USED` from `activate_chip` RPC by inserting a record).
3. **Assert**: Attempting to re-activate shows error: "Wildcard has already been used this season."

### Expected Results

| Step | Assert | Pass/Fail |
|------|--------|-----------|
| 1 | Chips tab visible with all three sections | |
| 2 | Chip Guide modal opens with all chip details | |
| 3 | Wildcard activates → turns green → deactivates cleanly | |
| 4 | Triple Captain activates → turns gold → captain pitch indicator updates | |
| 5 | 16th Man locked after selection, matchday_id populated in DB | |
| 6 | Already-used protection fires correctly | |

### Reset after test

```sql
UPDATE squads
  SET is_wildcard = false, is_triple_captain = false
  WHERE user_id = '<test1_uid>' AND league_id = '<league_id>';

DELETE FROM daily_jokers WHERE user_id = '<test1_uid>';
```

---

Last Updated: **2026-05-30**
