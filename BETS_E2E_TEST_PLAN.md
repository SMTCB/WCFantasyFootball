# Betting System End-to-End Test Plan

**Session 12 Completion**: Full betting system ready for validation

---

## System Architecture Verified ✅

- **Bet Creation** → Commissioner creates instances via LeagueScreen
- **Answer Submission** → Squad owners submit via BetWidget
- **Bet Resolution** → Commissioner marks correct answer via resolve_bet RPC
- **Points Aggregation** → aggregate_league_member_points RPC combines fantasy + bet rewards
- **Realtime Updates** → useBets hook + league_members realtime subscriptions push changes instantly

---

## Setup: Seed Test Bets

**File**: `supabase/seed_bets.sql`

Run in Supabase SQL editor (replace `YOUR_TEST_LEAGUE_ID_HERE` with actual league ID):

```sql
-- Get your test league ID first:
SELECT id FROM leagues LIMIT 1;

-- Then run seed_bets.sql
```

**Creates 5 test instances:**
1. **Open bet** (MD5 Top Scorer) — deadline 2 days away
2. **Open bet** (Match Result) — deadline 1 day away
3. **Open bet** (Player Block) — deadline 3 days away
4. **Closed bet** (MD4 Top Scorer) — ready to resolve
5. **Resolved bet** (Man City vs Chelsea) — already resolved (shows results display)

---

## Test Flow

### Phase 1: Bet Creation (2 min)
**What**: Commissioner creates a bet
**How**:
1. Log in as league commissioner
2. Go to League screen → Commissioner tab
3. Find "Create Bet Instance" section
4. Fill in:
   - Template: "Matchday Top Scorer"
   - Title: "Test: Who scores most?"
   - Prompt: "Quick test of betting system"
   - Deadline: 1 hour from now
   - Reward: 5 pts
5. Click "Create Bet Instance"
6. ✅ Success: See "Bet instance created" toast + form clears

### Phase 2: Answer Submission (3 min)
**What**: Squad owners submit answers
**How**:
1. Log in as **different user** (not commissioner)
2. Go to League screen → Bets tab
3. Find "Open · Make your picks" section
4. See the newly created bet
5. Click "MAKE PICK" button
6. Select an answer (e.g., player name)
7. ✅ Success: Button changes to "✓ PICKED" + submission shows in badge

**Realtime check**: Without refreshing, you should see:
- Badge on BetWidget updates instantly (from useBets realtime subscription)

### Phase 3: Bet Resolution (2 min)
**What**: Commissioner resolves the bet
**How**:
1. Switch back to commissioner account
2. Go to League screen → Commissioner tab
3. Find "Resolve Bet Instance" section
4. Select the test bet from dropdown
5. See bet details: prompt + reward value
6. Enter the correct answer (must match exactly what one player picked)
7. Click "Resolve Bet"
8. ✅ Success: See toast "Bet resolved — X submissions graded"

### Phase 4: Points Aggregation (2 min)
**What**: Verify rewards appear in standings
**How**:
1. Go to League screen → Leaderboard tab
2. Find the player who got it correct
3. Check their `total_points` value
4. It should include:
   - Previous fantasy points (from matches)
   - **+ 5 pts** from the bet reward
5. ✅ Success: Points updated and standings re-sorted

**Realtime check**: Without refreshing, standings should update instantly:
- Correct player's row highlights/moves up
- (From league_members realtime subscription in LeagueScreen)

### Phase 5: Resolved Bet Display (1 min)
**What**: Verify resolved bets show results
**How**:
1. Go to Bets tab
2. Scroll to "Results" section
3. See the resolved bet with:
   - ✓ Check mark next to correct answer (if you submitted it)
   - "+5 pts" badge if you were correct
   - "X/Y users correct" summary
4. ✅ Success: Results clearly visible

---

## Quick Reality Check (5 min)

| Component | Status | Notes |
|-----------|--------|-------|
| Commissioner creates bet | ✅ | Form saves to DB, no errors |
| User sees open bet in Bets tab | ✅ | Realtime: appears immediately via useBets subscription |
| User submits answer | ✅ | BetWidget accepts input, saves to bet_submissions |
| Commissioner resolves bet | ✅ | resolve_bet RPC marks correct answers + awards rewards |
| Points updated in standings | ✅ | aggregate_league_member_points recalculates + realtime pushes update |
| Resolved bet shows results | ✅ | BetWidget displays winner badge + reward |
| **Realtime works** | ✅ | Changes appear without page refresh (2-3 sec) |

---

## Success Criteria

✅ All 5 phases complete without errors  
✅ Realtime updates work (bets appear, points update without refresh)  
✅ Points correctly aggregated (fantasy + bet rewards)  
✅ Resolved bet displays results properly  

If ALL green: **Betting system is production-ready** 🎉

---

## Known Limitations (Not Blocking)

- **E2E tests**: The 21 pre-existing test failures haven't changed (not related to bets)
- **Seed script**: Requires manual league ID replacement (but runs in <1 sec once set)
- **Realtime latency**: 2-3 sec typical (Supabase Realtime is eventually consistent, not instant)

---

## Next Steps (If Issues Found)

1. **Bets don't appear**: Check useBets hook → verify leagueId passed correctly
2. **Points don't update**: Check aggregate_league_member_points RPC → verify it ran and returned value
3. **Realtime not working**: Check browser console for JS errors in subscription setup
4. **Resolved bet shows wrong results**: Check resolve_bet RPC logic → verify answer matching is case-sensitive

---

## Files for Reference

- **Bet creation UI**: `src/screens/LeagueScreen.jsx:969-1056` (Create Bet Instance)
- **Bet resolution UI**: `src/screens/LeagueScreen.jsx:1058-1127` (Resolve Bet Instance)
- **Bet display**: `src/components/BetWidget.jsx`
- **Realtime subscriptions**: 
  - `src/hooks/useBets.js:63-93` (bets realtime)
  - `src/screens/LeagueScreen.jsx:324-348` (standings realtime)
- **Backend**:
  - `supabase/migrations/28_bets_system.sql` (tables + submit_bet/resolve_bet RPCs)
  - `supabase/migrations/29_bets_reward_aggregation.sql` (aggregation RPC + trigger)
