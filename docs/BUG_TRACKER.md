# Bug Tracker — Forza Fantasy League
**Last updated**: 2026-05-28 (session 50 — WC E2E browser test)  
**Live app**: https://wc-fantasy-football.vercel.app  
**Next migration**: `88_`

---

## HOW TO USE THIS DOCUMENT (new session onboarding)

1. **Start with the Open Bugs section** — these are the only things that need fixing.
2. Each bug has a **Priority**, **Where to look**, and **Re-test steps** so you can verify the fix without re-reading the session history.
3. The **Improvements** section is separate — these are UX/DX polish items, not breakage.
4. The **Closed Bugs Log** at the bottom is reference only — don't re-open unless regression.

---

## ⚡ OPEN BUGS — PRIORITIZED

### Priority rationale
- **P1 — Fix before WC kicks off (June 11, 2026)**: user-visible breakage on the WC flow
- **P2 — Fix soon**: noticeable but workaround exists
- **P3 — Defer**: cosmetic / low impact

---

### P1-A · WC-05 · Roster modal stuck on "Loading roster..." — HIGH
**Every WC league is affected. Blocks the trade proposal flow for all users.**

- **Screen**: BOARD tab → click any manager row → modal shows "Loading roster..." forever
- **Root cause**: The modal fetches `draft_allocations.allocated_players` to render the player list. Leagues created normally (not via draft lottery — e.g. all WC E2E leagues) have no `draft_allocations` rows. No fallback to `squads.players`.
- **Where to look**: `src/screens/LeagueScreen.jsx` — the section that opens the roster sheet when a manager row is clicked. Find the `draft_allocations` fetch and add a fallback to `squads.players` if the result is empty.
- **Fix direction**: If `draft_allocations` returns 0 rows for a `(league_id, user_id)` pair, re-query `squads.players` for that user and render from there.
- **Workaround (applied to WC E2E test league only)**:
  ```sql
  INSERT INTO draft_allocations (league_id, user_id, allocated_players, unresolved_slots, allocated_at)
  SELECT s.league_id, s.user_id, s.players, 0, NOW()
  FROM squads s WHERE s.league_id = '<league_id>'
  ON CONFLICT (league_id, user_id) DO UPDATE SET allocated_players = EXCLUDED.allocated_players;
  ```

**Re-test steps**:
1. Log in as e2e_test1 → WC_OVERALL_E2E → BOARD tab
2. Click on **DragonMgr** row (any manager other than yourself)
3. ✅ Pass: roster modal loads with player names within 3 seconds
4. ✅ Pass: each player row has a 🔄 trade button
5. Click 🔄 on any player → ✅ Pass: Trade Negotiation Table opens

---

### P1-B · WC-02 · Bets tab shows "GW—" for WC tournament — MEDIUM
**Every WC user sees this on every visit to the Bets tab.**

- **Screen**: BETS tab header shows "BETS & PREDICTIONS · GW—" (dash instead of round number)
- **Root cause**: The round-number extractor likely parses `matchday_id` assuming a fixed prefix (e.g. `'426-r'`) instead of splitting on `-r`. WC matchdays use `'429-r1'` etc. — the parser may hardcode tournament 426 or do `matchday_id.replace('426-r','')`.
- **Where to look**: Search `src/` for where `GW` label is composed in the Bets tab context. Look for string manipulation on `matchday_id` — the fix is to split on `-r` and take the last part regardless of tournament prefix: `matchday_id.split('-r')[1]`.

**Re-test steps**:
1. Log in → WC_OVERALL_E2E → **BETS** tab
2. ✅ Pass: header reads "BETS & PREDICTIONS · GW 2" (or current round number — not a dash)
3. Switch to EPL_OVERALL_E2E → BETS tab → ✅ Pass: still shows correct GW number for EPL

---

### P1-C · WC-03 · Auction bid placeholder shows wrong minimum — MEDIUM
**Users type the placeholder value, get rejected — confusing UX.**

- **Screen**: AUCTIONS tab → any listing's bid input field
- **Symptom**: Placeholder shows `£5.1M+` when `current_bid = 5.0` and `min_increment = 0.5`. Actual validation rejects anything below £5.5M with "Bid too low. Minimum: 5.5". The placeholder suggests 5.1 is acceptable.
- **Root cause**: Placeholder calculation uses `current_bid + 0.1` instead of `current_bid + listing.min_increment`.
- **Where to look**: `src/components/AuctionCard.jsx` — the `<input type="number">` element. Change `placeholder` and `min` from `current_bid + 0.1` to `current_bid + min_increment`.

**Re-test steps**:
1. Log in → WC_OVERALL_E2E → **AUCTIONS** tab
2. Find any listing (e.g. Achraf Hakimi, current bid £5.6M, min_increment 0.5)
3. ✅ Pass: input placeholder shows `£6.1M+` (not `£5.7M+`)
4. Type `5.7` → ✅ Pass: BID button stays disabled or shows validation error before submit
5. Type `6.1` → ✅ Pass: bid accepted

---

### P1-D · WC-07 · Same player proposable in multiple simultaneous trade proposals — MEDIUM
**Data integrity issue — if accepted by both counterparties near-simultaneously, cascade-cancel may race.**

- **Screen**: BOARD → Trade proposal modal
- **Symptom**: Proposing player X to Manager A (pending) and then also proposing player X to Manager B (pending) both succeed. Both show in DB as `status='pending'`.
- **Root cause**: `submit_trade_proposal` RPC has no guard against proposing a player already in an active pending proposal. Relies entirely on `accept_trade_proposal`'s cascade-cancel, which only fires on acceptance.
- **Where to look**: `supabase/migrations/85_trade_proposals.sql` → `submit_trade_proposal` function. Add before the INSERT:
  ```sql
  IF EXISTS (
    SELECT 1 FROM trade_proposals
    WHERE proposer_squad_id = p_proposer_squad_id
      AND proposer_player_id = p_proposer_player_id
      AND status = 'pending'
  ) THEN
    RAISE EXCEPTION 'PLAYER_ALREADY_PROPOSED';
  END IF;
  ```
  Then handle the error in `src/hooks/useTradeProposals.js` to show a user-visible message.
- **Migration needed**: `88_`

**Re-test steps**:
1. Log in → WC_OVERALL_E2E → BOARD → click TestMgr → select player A → propose trade → submit
2. Return to BOARD → click DragonMgr → select **same player A** → try to submit
3. ✅ Pass: error shown — "This player already has a pending proposal. Cancel it first."
4. Verify DB: `SELECT COUNT(*) FROM trade_proposals WHERE proposer_player_id = '<player_id>' AND status = 'pending'` → returns 1, not 2

---

### P2-A · WC-01 · `get_league_stats` RPC returns 404 — MEDIUM
**Console error on every page load in any league. STATS tab renders without per-round breakdown.**

- **Screen**: Every league page — console shows `Failed to load resource: 404 @ /rest/v1/rpc/get_league_stats`
- **Root cause**: The frontend calls `get_league_stats(p_league_id)` but this PostgreSQL function was never created. The STATS tab still renders using `league_members.total_points` as fallback, so the tab is not blank — but per-round breakdown data is missing.
- **Where to look**: Search `src/` for `get_league_stats` to find what the function is expected to return. Then create the function in a new migration (`88_`). Likely returns per-squad, per-matchday point totals from `fantasy_points`.
- **Migration needed**: `88_`

**Re-test steps**:
1. Log in → any league → open browser DevTools → Network tab
2. Navigate to STATS tab
3. ✅ Pass: no 404 on `get_league_stats` in Network requests
4. ✅ Pass: STATS tab shows per-round breakdown in addition to season totals (if the function returns that data)

---

### P2-B · WC-06 · Chat Realtime subscription fails for new leagues — MEDIUM
**New messages from other managers don't appear until page refresh.**

- **Console**: `[useChatMessages] ✗ Subscription failed or closed for league: <uuid>`
- **Symptom**: Chat loads correctly via REST (historical messages visible). But Supabase Realtime subscription fails to establish, so live updates from other managers require a manual page refresh.
- **Root cause**: Unknown — candidates: (a) Realtime concurrent channel limit reached, (b) `chat_messages` table Realtime publication filter not matching `league_id` UUID type, (c) RLS on the Realtime channel blocking subscription for new leagues.
- **Where to look**: `src/hooks/useChatMessages.js` — the subscription setup. Check the channel filter and whether it reconnects on failure. Also check Supabase dashboard → Database → Replication → `chat_messages` is included.

**Re-test steps**:
1. Open two browser tabs — Tab A: e2e_test1 logged in, Tab B: e2e_test2 logged in
2. Both navigate to WC_OVERALL_E2E → CHAT tab
3. Tab B: send a message
4. ✅ Pass: message appears in Tab A **without refreshing** (within 3 seconds)
5. Check browser console → ✅ Pass: no `✗ Subscription failed` warning

---

### P3-A · WC-04 · Auctions "LIVE" counter stays 0 after placing winning bids — LOW
**Cosmetic — auctions function correctly, counter just doesn't update.**

- **Screen**: AUCTIONS tab header shows "LIVE: 0" even after placing 3 winning bids
- **Root cause**: "LIVE" count likely queries `highest_bidder_id = my_squad_id` but either: (a) `highest_bidder_id` isn't being updated when a bid is placed, or (b) the UI subscription doesn't re-query the KPI after a successful bid.
- **Where to look**: `src/hooks/useAuctions.js` — after `place_bid` succeeds, check if the listings refetch includes `highest_bidder_id`. Also check `src/components/AuctionCard.jsx` for how the KPI chip counts "LIVE".

**Re-test steps**:
1. Log in → WC_OVERALL_E2E → AUCTIONS
2. Place a bid above the minimum on any listing you don't own
3. ✅ Pass: "LIVE" counter increments to 1 (or however many winning bids you have)

---

### P3-B · WC-09 · LiveScreen shows wrong GW number for WC — LOW
**Shows "GW 3" when the next upcoming round is round 2.**

- **Screen**: LIVE → switch to WC tile → header shows "MATCH DAY · GW 3"
- **Root cause**: With `429-r1` (past), `429-r2` (future), `429-r3` (future), the screen shows GW 3 instead of GW 2. Likely the query for "next upcoming deadline" is returning the second result, or the round extraction adds 1.
- **Where to look**: `src/screens/LiveScreen.jsx` — find where the GW label is derived from `matchday_deadlines`. Check the query order and the round-number extraction logic.

**Re-test steps**:
1. Log in → LIVE → click WC_OVERALL_E2E tile
2. ✅ Pass: header shows "MATCH DAY · GW 2" (the next upcoming deadline is `429-r2`)

---

### P3-C · WC-08 · `get_transfer_window_status` called 20+ times per session — LOW
**Performance overhead — no user-visible breakage.**

- **Network**: 20+ POST calls to `/rest/v1/rpc/get_transfer_window_status` observed in a single session  
- **Root cause**: Called in a component that re-renders frequently (possibly triggered by every auction bid state update or every tab switch). Should be called once on mount or fetched from context.
- **Where to look**: Search `src/` for `get_transfer_window_status` → find all call sites → wrap in a context provider or `useMemo` with a stable dependency array.

**Re-test steps**:
1. Log in → WC_OVERALL_E2E → navigate through all tabs (BOARD, BETS, AUCTIONS, CHAT, STATS)
2. Open DevTools → Network → filter by `transfer_window`
3. ✅ Pass: fewer than 5 calls total across all tab navigations

---

## 🔧 IMPROVEMENTS (not bugs — polish items)

These are not blocking anything but worth doing before WC launch or shortly after.

---

### IMP-A · Trade cash sweetener defaults to £5.0M (should be £0)
**Priority: P1 — small change, high user confusion if left**

- **Screen**: BOARD → click manager → 🔄 on any player → Negotiation Table modal
- **Issue**: The cash sweetener slider opens at £5.0M (halfway across its 0–10M range). The vast majority of trades are straight swaps. Users who don't notice the slider will accidentally offer £5M cash along with their player.
- **Fix**: Set the slider's initial `value` state to `0` in the trade modal component.
- **Where to look**: `src/screens/LeagueScreen.jsx` — the trade modal state initialization. Search for `cashSweetener` or the slider's default value.

---

### IMP-B · WC matchday deadlines not auto-created by sync pipeline
**Priority: P1 — must resolve before WC Round 1 (June 11, 2026)**

- **Issue**: The `sync-wc-fixtures-6h` cron syncs WC fixture data (teams, scores, kickoff times) but does NOT create `matchday_deadlines` rows. WC fixtures have `matchday_id = null` in production. Without deadlines: GW labels show "GW—", transfer windows don't open, and scoring can't run per-round.
- **Options**:
  1. Extend `sync-fixtures` edge function to upsert `matchday_deadlines` when it detects a new round — automatic going forward.
  2. Create a one-off migration or SQL script to insert the WC round deadlines before June 11.
- **Suggested approach**: Option 1 is cleaner long-term. Option 2 is a safe quick fix for the immediate launch.
- **WC Round schedule reference**: Round 1 starts June 11 2026; group stage runs to ~June 30 (Rounds 1–3); knockouts July 2 onwards.
- **SQL for option 2 (temporary)**:
  ```sql
  INSERT INTO matchday_deadlines (tournament_id, matchday_id, deadline_at) VALUES
    ('429','429-r1','2026-06-11 17:00:00+00'),
    ('429','429-r2','2026-06-22 17:00:00+00'),
    ('429','429-r3','2026-06-26 17:00:00+00')
  ON CONFLICT (matchday_id) DO NOTHING;
  ```

---

### IMP-C · WC scoring rules are a copy of EPL — validate before launch
**Priority: P2**

- **Issue**: The WC scoring rules (tournament_id='429') were created by copying the EPL rules verbatim. EPL rules may not match WC tournament-specific events. For example: penalty shootouts aren't in EPL, WC has different clean-sheet patterns (knockout stage vs group stage), and assists may have different significance.
- **Action**: Review the `scoring_rules` for tournament 429 before the WC starts. Decide whether the EPL copy is acceptable or needs tuning.
- **Current rules** (both EPL and WC have identical):
  ```sql
  SELECT * FROM scoring_rules WHERE tournament_id = '429';
  -- GK: goal=5, assist=0, clean_sheet=4, conceded_per_2_goals=-1, penalty_saved=5, minute_per_90=1
  -- DEF: goal=4, assist=1, clean_sheet=4, tackle=0.5, interception=0.25, minute_per_90=1
  -- MID: goal=5, assist=1, clean_sheet=1, tackle=0.5, interception=0.25, minute_per_90=1
  -- FWD: goal=5, assist=1, minute_per_90=1
  ```

---

### IMP-D · Player Block bet type untested end-to-end
**Priority: P3**

- **Issue**: The ADMIN → CREATE BET section shows "Player Block" as a third bet type alongside Top Scorer and Match Result. It exists in `bet_templates` and renders in the UI, but was never exercised in any E2E session. Unknown whether the submission, resolution, and rewards flow works.
- **Action**: Create a Player Block bet instance via admin, have a manager submit a pick, then resolve it — verify points are awarded correctly.

---

## ✅ CLOSED BUGS — Summary Log

All bugs below are fixed and merged to `main`. Detail is preserved in git history. Do not re-open unless you observe a regression.

| ID | Title | Severity | Fixed in | PR/Migration |
|----|-------|----------|----------|-------------|
| WC-10 | `calculate-scores-post-match` cron used `status='after'` — never fired | 🔴 CRITICAL | Session 50 | Migration 87 |
| BUG-01 | Draft lottery: wrong column names (`budget`, `league_config`) → 0 players | 🔴 CRITICAL | Session 44 | PR #201 |
| BUG-02 | Draft lottery: inserts non-existent `tournament_id` into squads | 🔴 CRITICAL | Session 44 | PR #201 |
| BUG-06 | `fantasy_points.total` INTEGER rejects decimal scores | 🔴 CRITICAL | Session 44 | Mig 79, PR #201 |
| BUG-NEW-04 | `submit_bet` missing `user_id` + no UNIQUE index | 🔴 CRITICAL | Session 44–45 | Mig 83, PR #204 |
| BUG-NEW-05 | `resolve_bet` uses non-existent columns, void return | 🔴 CRITICAL | Session 44–45 | Mig 84, PR #204 |
| BUG-05 | `auction_bids` FK points to `trade_listings` instead of `auction_listings` | 🟠 HIGH | Session 44–45 | Mig 80, PR #202 |
| BUG-09 | Draft shows WC players for EPL league | 🟠 HIGH | Session 44–45 | Mig 81, PR #202 |
| BUG-NEW-01 | `mySquadId` queries non-existent `budget` column (→ `budget_remaining`) | 🟠 HIGH | Session 44–45 | PR #204 |
| BUG-NEW-02 | `isCommissioner` checks only `created_by`, ignores `role` column | 🟠 HIGH | Session 44–45 | PR #204 |
| BUG-NEW-03 | `useCommissioner` calls `resolve_bet` with wrong param name | 🟠 HIGH | Session 44–45 | PR #204 |
| BUG-NEW-06 | `process-transfer` CORS hardcoded to Vercel origin, blocks localhost | 🟠 HIGH | Session 44–45 | PR #204 |
| BUG-13 | Admin panel edge function calls sent publishable key (not JWT) | 🟠 HIGH | Session 46 | PR #206 |
| BUG-NEW-07 | Commissioner could create duplicate `bet_instances` (rapid submit + no dedup guard) | 🟠 HIGH | Session 48 | PR #211 |
| BUG-12 | LiveScreen showed WC fixture for EPL league (tournament filter missing on first render) | 🟡 MEDIUM | Session 46 | PR #206 |
| BUG-14 | `supabase.functions.invoke()` silently failed with publishable key on transfers | 🟡 MEDIUM | Session 46 | PR #206 |
| BUG-07/08/10 | Squad/Recap/Draft blank in demo mode (RLS + matchday fallback + early return) | 🟡 MEDIUM | Session 46 | Mig 82, PR #206 |
| E2E-01 | E2E CI cancelled: timeout + SquadScreen picker + 404 test + scoring-pipeline spec | 🟡 MEDIUM | Session 48 | PR #210 |
| IMP-05 | Auction listing button unreachable (dead `format === 'auction'` guard) | 🟢 LOW | Session 46 | PR #206 |
| U92 | `html2canvas` invite card had transparent background — replaced with `modern-screenshot` | 🟢 LOW | Session 47 | PR #209 |
| U82/U83 | Standings: dead MD column + hardcoded `TrendPill(0)` removed | 🟢 LOW | Session 47 | PR #209 |
| U88 | AuctionCard cancel button needed two-tap confirmation | 🟢 LOW | Session 47 | PR #209 |
| U93 | `+ INVITE` button active before `join_code` loaded (showed `undefined`) | 🟢 LOW | Session 47 | PR #209 |
| U98 | RecapCard showed misleading `transfersMade: 0` hardcoded stat | 🟢 LOW | Session 47 | PR #209 |
| U101 | LiveScreen didn't refresh on tab focus | 🟢 LOW | Session 47 | PR #209 |
| U105 | Triple Captain badge showed ×2 instead of ×3 | 🟢 LOW | Session 47 | PR #209 |
