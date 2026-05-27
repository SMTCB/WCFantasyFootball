# Bug Tracker — Forza Fantasy League
**Last updated**: 2026-05-27 (post true E2E session)  
**Total bugs**: 20 (20 fixed, 0 open)

---

## 🔴 CRITICAL — Fixed

### BUG-01 · run-draft-lottery: wrong column names → 0 players allocated
- **File**: `supabase/functions/run-draft-lottery/index.js`
- **Symptom**: All 8 managers get empty squads after the lottery runs.
- **Root cause**: Leagues SELECT included non-existent columns `budget` (→ `budget_total`) and `league_config` (separate table, not a column). PostgREST returns `data: null` silently. `tournament_id` = undefined → `.eq('tournament_id', undefined)` filters for NULL → 0 players returned → empty playerMap → 0 allocations.
- **Fix**: Changed to `budget_total`, removed `league_config`, changed `draft_list_size` to read directly from column. ✅ **Fixed PR #201, deployed**

### BUG-02 · run-draft-lottery: inserts non-existent `tournament_id` column into squads
- **File**: `supabase/functions/run-draft-lottery/index.js`
- **Symptom**: Even after BUG-01 fix, no squads written to DB.
- **Root cause**: Squad upsert payload included `tournament_id` field but that column doesn't exist on `squads`.
- **Fix**: Removed `tournament_id` from squad upsert payload. ✅ **Fixed PR #201, deployed**

### BUG-06 · fantasy_points.total INTEGER rejects decimal scores
- **File**: DB schema + `supabase/functions/calculate-scores/index.js`
- **Symptom**: All fantasy_points upserts fail with `22P02 invalid input syntax for type integer: "20.45"`. No scores ever written.
- **Root cause**: Scoring rules use fractional points (tackles=0.5, interceptions=0.25) producing decimal totals. Column type was `INTEGER`.
- **Fix**: Migration 79 — `ALTER TABLE fantasy_points ALTER COLUMN total TYPE numeric`. ✅ **Fixed PR #201, migration 79 applied**

### BUG-NEW-04 · submit_bet: missing user_id + no UNIQUE index
- **File**: DB function `submit_bet`
- **Symptom**: Clicking a bet option appears to work but nothing is written to `bet_submissions`. Silent failure.
- **Root cause 1**: `INSERT INTO bet_submissions (...) VALUES (...)` omitted `user_id` but that column is NOT NULL.
- **Root cause 2**: `ON CONFLICT (squad_id, bet_instance_id)` had no backing UNIQUE index.
- **Fix**: Migration 83 — added `user_id = auth.uid()`, created UNIQUE index. ✅ **Fixed PR #204, migration 83 applied**

### BUG-NEW-05 · resolve_bet: wrong column names, void return
- **File**: DB function `resolve_bet`
- **Symptom**: Admin panel resolution always fails with "Internal Server Error" or column not found.
- **Root cause**: Used `resolution_answer` (doesn't exist, correct: `correct_answer`) and `resolved_at` (doesn't exist). Return type was `void` but client expects `{ submissions_updated: N }`.
- **Fix**: Migration 84 — corrected columns, changed return type to JSONB. ✅ **Fixed PR #204, migration 84 applied**

### BUG-NEW-06 · process-transfer CORS blocked localhost
- **File**: `supabase/functions/process-transfer/index.js`
- **Symptom**: All buy/sell operations from local dev server (`http://localhost:5173`) silently fail with "Failed to send a request to the Edge Function".
- **Root cause**: Sprint 3 hardcoded CORS origin to `https://wc-fantasy-football.vercel.app` only. Local dev requests rejected.
- **Fix**: Check `Origin` header, allow `localhost` alongside production. ✅ **Fixed PR #204, deployed**

---

## 🔴 CRITICAL — Open

None remaining.

---

## 🟠 HIGH — Fixed

### BUG-05 · auction_bids FK wrong table; auction_listings never populated
- **Files**: DB schema, `src/hooks/useAuctions.js`
- **Symptom**: Auctions tab always shows "NO ACTIVE AUCTIONS" even when listings exist. Attempting to insert a bid via SQL fails with FK constraint error referencing `trade_listings`.
- **Root cause**: `auction_bids.listing_id` FK points to `trade_listings.id` instead of `auction_listings.id`. The UI's full auction system (list/bid/sell) uses `auction_listings`. `auction_bids` was wired to the wrong table.
- **Fix**: Migration 80 — changed FK to `auction_listings(id)`, updated `place_bid` RPC to write bid history. ✅ **Fixed PR #202, migration 80 applied**
- **Verified**: Auctions tab now shows listings and bids update correctly via the UI.

### BUG-09 · Draft screen shows wrong tournament players (WC players in EPL league)
- **File**: DB function `get_cup_available_players`, `src/screens/DraftScreen.jsx`
- **Symptom**: EPL draft managers see Côte d'Ivoire, Morocco, etc. players. "2250 players available" instead of 661.
- **Root cause**: `get_cup_available_players` returned `SELECT * FROM players` (all tournaments) when no cup clubs seeded. Missing tournament filter for non-cup leagues.
- **Fix**: Migration 81 — when `cup_active_clubs` is empty, filter by `leagues.tournament_id`. ✅ **Fixed PR #202, migration 81 applied**
- **Verified**: EPL league now shows exactly 661 players in the draft screen.

### BUG-NEW-01 · mySquadId queries non-existent 'budget' column
- **File**: `src/screens/LeagueScreen.jsx`
- **Symptom**: `mySquadId = null` for all authenticated users. Consequences: bet widget disabled (can't submit picks), `useAuctions` has no `squadId` so bids can't be placed.
- **Root cause**: `supabase.from('squads').select('id, budget')` — `squads` table has `budget_remaining` not `budget`. PostgREST returns `data: null` silently.
- **Fix**: Changed to `budget_remaining`, added `order('created_at', desc).limit(1)`. ✅ **Fixed PR #204**

### BUG-NEW-02 · isCommissioner checks only created_by, misses role column
- **File**: `src/screens/LeagueScreen.jsx`
- **Symptom**: Commissioners added via `league_members.role = 'commissioner'` (not the original creator) never see the ADMIN tab.
- **Root cause**: `isCommissioner = activeLeague?.leagues?.created_by === currentUser?.id` — only checks who created the league, ignores the `role` field.
- **Fix**: Added `|| activeLeague?.role === 'commissioner'` check; fetches `role` in the league_members select. ✅ **Fixed PR #204**

### BUG-NEW-03 · useCommissioner calls resolve_bet with wrong param name
- **File**: `src/hooks/useCommissioner.js`
- **Symptom**: Admin tab resolution returns "Could not find the function public.resolve_bet(p_correct_answer, p_instance_id) in the schema cache". Nothing resolves.
- **Root cause**: Client sends `p_correct_answer` but DB function expects `p_answer`.
- **Fix**: Changed to `p_answer`. ✅ **Fixed PR #204**

---

## 🟠 HIGH — Fixed (continued)

### BUG-13 · Admin panel edge function calls fail with publishable key
- **Files**: `src/screens/AdminSeedScreen.jsx`, `src/lib/supabase.js`
- **Symptom**: From the admin panel, clicking Sync Fixtures / Sync Players / Sync Player Status / Discover Tournament / Resolve Bets returns auth errors.
- **Root cause**: Admin panel was always sending `Authorization: Bearer sb_publishable_IQF1...` — not a valid JWT. Functions with `verify_jwt=true` reject it.
- **Fix**: `callFunction` now calls `supabase.auth.getSession()` and uses `session.access_token` as the bearer token. Fails fast (throws) if not authenticated. ✅ **Fixed — session 46, PR #206**

---

## 🟡 MEDIUM — Open

None remaining.

---

## 🟡 MEDIUM — Fixed

### BUG-07 / BUG-08 / BUG-10 · Squad/Recap/Draft blank in demo mode (VITE_AUTH_ENABLED not set)
- **Symptom**: In demo mode (no login required), Squad screen shows "NO SQUAD BUILT YET", Recap shows "NO RECAPS YET", Draft screen shows 0/30 list.
- **Root cause**: Multiple — RLS policies (fixed by migration 82 public SELECT), SquadScreen matchday filter (fixed by PR #203 fallback), RecapScreen missing `setLoading(false)` before early return when no leagues found (fixed in this session).
- **Fix**: Migration 82 public read policies + PR #203 matchday fallback + session 46 RecapScreen `setLoading(false)` fix. ✅ **Fixed — session 46, PR #206**

### BUG-12 · Live screen shows wrong tournament's next fixture
- **File**: `src/screens/LiveScreen.jsx`
- **Symptom**: "NEXT MEX vs SOU" shown for EPL league managers (WC fixture appears instead of EPL).
- **Root cause**: On first render `activeLeague` is null → `activeTournamentId` is null → next-fixture query has no tournament filter → returns nearest fixture in DB (often WC).
- **Fix**: After loading memberships inside `fetchAll`, if `activeTournamentId` was null on entry, re-run the next-fixture query with the resolved tournament ID from `enrichedLeagues[0]`. ✅ **Fixed — session 46, PR #206**

### BUG-14 · `supabase.functions.invoke()` silently fails with publishable key
- **Files**: `src/hooks/useTransfer.js`
- **Symptom**: BUY transfers appeared to succeed but squad didn't update. Silent failure.
- **Root cause**: `supabase.functions.invoke()` with `sb_publishable_*` key doesn't correctly surface the response body. `sell` appeared to work due to optimistic UI.
- **Fix**: Replaced both `buy` and `sell` with raw `fetch()` via `invokeTransfer` helper using session JWT. ✅ **Fixed — session 46, PR #206**

---

## 🟢 LOW / IMPROVEMENTS — Open

### IMP-01 · "GW —" label in league header when season ends
- **File**: `src/screens/LeagueScreen.jsx`, `src/components/league/LeagueDetailView.jsx`
- **Symptom**: After a season ends (all matchday deadlines past), the GW label shows "GW —" instead of the last completed round.
- **Fix**: Code fix in PR #203 tries upcoming deadline first, falls back to most recent past. Set to "GW 38" correctly after fix.
- **Status**: Fixed in code, ✅ verified.

### IMP-02 · Draft lottery squads get `matchday_id = 'active'` after season ends
- **File**: `supabase/functions/run-draft-lottery/index.js`
- **Symptom**: Squads created post-lottery have `matchday_id = 'active'` when all EPL deadlines are in the past. This makes them invisible to `process-transfer` and the scoring pipeline.
- **Fix**: Code fix in PR #203 — falls back to most recent past deadline. ✅ Fixed.

### IMP-03 · Resolved bets show no history/results initially
- **Symptom**: Before the RLS/mySquadId fixes, resolved bets didn't appear in the Bets tab. After the fixes (migrations 82, 83), the RESULTS section correctly shows resolved bets with correct answers and "X/Y correct" counts.
- **Status**: ✅ Resolved as side effect of other fixes.

### IMP-04 · calculate-scores reports success when upsert fails
- **File**: `supabase/functions/calculate-scores/index.js`
- **Symptom**: `updated_squads: N` returned even when the fantasy_points upsert failed.
- **Fix**: Returns `0` instead of `squads.length` when `fpErr` is set. ✅ Fixed PR #203.

### IMP-05 · Auction listing UI unreachable (dead code)
- **File**: `src/screens/SquadScreen.jsx`
- **Symptom**: The "List for Auction" button never appeared for any user.
- **Root cause**: Button rendered only for `format === 'auction' || format === 'hybrid'`. The `leagues` table only has `classic` and `noduplicate` — neither ever matched.
- **Fix**: Removed the dead format condition. Auction listing button now shows for all league formats. ✅ **Fixed — session 46, PR #206**

---

## Summary Table

| ID | Title | Severity | Status | PR |
|----|-------|----------|--------|----|
| BUG-01 | Lottery: wrong column names → 0 players | 🔴 CRITICAL | ✅ Fixed | #201 |
| BUG-02 | Lottery: inserts non-existent tournament_id column | 🔴 CRITICAL | ✅ Fixed | #201 |
| BUG-06 | fantasy_points INTEGER rejects decimal scores | 🔴 CRITICAL | ✅ Fixed | #201 |
| BUG-05 | auction_bids FK points to wrong table | 🟠 HIGH | ✅ Fixed | #202 |
| BUG-09 | Draft shows WC players for EPL league | 🟠 HIGH | ✅ Fixed | #202 |
| BUG-NEW-01 | mySquadId selects non-existent 'budget' column | 🟠 HIGH | ✅ Fixed | #204 |
| BUG-NEW-02 | isCommissioner ignores role column | 🟠 HIGH | ✅ Fixed | #204 |
| BUG-NEW-03 | resolve_bet called with wrong param name | 🟠 HIGH | ✅ Fixed | #204 |
| BUG-NEW-04 | submit_bet missing user_id + no UNIQUE index | 🔴 CRITICAL | ✅ Fixed | #204 |
| BUG-NEW-05 | resolve_bet uses non-existent columns | 🔴 CRITICAL | ✅ Fixed | #204 |
| BUG-NEW-06 | process-transfer CORS blocks localhost | 🟠 HIGH | ✅ Fixed | #204 |
| BUG-13 | Admin panel functions fail with publishable key | 🟠 HIGH | ✅ Fixed | #206 |
| BUG-14 | functions.invoke() silent fail on BUY | 🟡 MEDIUM | ✅ Fixed | #206 |
| BUG-07/08/10 | Squad/Recap/Draft blank in demo mode | 🟡 MEDIUM | ✅ Fixed | #206 |
| BUG-12 | Live screen shows WC fixture for EPL users | 🟡 MEDIUM | ✅ Fixed | #206 |
| IMP-05 | Auction listing UI unreachable (dead code) | 🟢 LOW | ✅ Fixed | #206 |

**Migrations applied to production**: 79, 80, 81, 82, 83, 84  
*(no new migrations for session 46 — all fixes were frontend-only)*
