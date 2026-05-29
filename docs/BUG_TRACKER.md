# Bug Tracker — Forza Fantasy League
**Last updated**: 2026-05-29 (session 52 — BUG-15 added)  
**Live app**: https://wc-fantasy-football.vercel.app  
**Next migration**: `90_`

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

### BUG-15 — WC players have no prices; budget enforcement completely bypassed
**Priority**: P1 (must fix before June 11 WC launch)  
**Severity**: 🔴 HIGH — core gameplay mechanic silently broken  

**What happens**: 1,480 of 1,589 WC players (tournament `429`) have `price = NULL`. `process-transfer` uses `Number(playerData.price ?? 0)`, so all null-priced players cost £0M to buy and return £0M on sale. A manager can fill an entire squad without spending any budget. Budget standings are meaningless.

**Root cause**: Prices are not provided by the Forza API and are never written by `sync-players` (intentionally omitted on upsert to preserve manual valuations). Nobody seeded prices for the WC tournament.

**Where to look**:  
- `supabase/functions/sync-players/index.js` line 169 — confirms price is deliberately excluded from sync  
- `supabase/functions/process-transfer/index.js` — `Number(playerData.price ?? 0)` is the bypass  
- DB: `SELECT COUNT(*) FILTER (WHERE price IS NULL) FROM players WHERE tournament_id = '429'`

**Fix**: Seed prices for all WC players before launch. Create migration `90_seed_wc_player_prices.sql`:
```sql
UPDATE players
SET price = ROUND((RANDOM() * 3 + 4)::NUMERIC, 1)  -- £4.0–£7.0 range
WHERE tournament_id = '429' AND price IS NULL;
```
Then validate: confirm `no_price = 0`. Optionally apply position-based pricing (GK/DEF lower, FWD higher).

**Re-test**: Buy a player worth £6.5M with a squad that has only £3.0M remaining — transfer should be rejected with INSUFFICIENT_FUNDS. Currently it silently succeeds.

**Effort**: ~1h (migration + validation query + one transfer rejection test)

---

### BUG-16 — `process-transfer` accepts null-priced players as free (security gap)
**Priority**: P1 (fix alongside BUG-15 before June 11 WC launch)  
**Severity**: 🟠 HIGH — exploitable window between player sync and price seeding  

**What happens**: If a player's `price` is NULL at the time of transfer, `process-transfer` evaluates `Number(playerData.price ?? 0)` → £0M. The budget check always passes. A manager who knows prices haven't been seeded yet (e.g. immediately after a tournament sync) can acquire unlimited players for free.

**Root cause**: Defensive default in `process-transfer` treats missing price as £0 rather than rejecting the transaction.

**Where to look**:  
- `supabase/functions/process-transfer/index.js` — find `playerData.price ?? 0`

**Fix**: Reject the transfer if price is null. Replace the default with an explicit guard:
```js
const price = playerData.price;
if (price === null || price === undefined) {
  return respond(400, { error: 'PLAYER_PRICE_UNAVAILABLE' });
}
```
Surface a user-facing message: "This player's price hasn't been set yet — contact your commissioner."

**Re-test**: Manually null a player's price in DB, attempt to buy them — should receive an error, not a successful transfer.

**Effort**: ~30 min (one-line guard + error message + re-test)  
**Depends on**: BUG-15 must also be fixed so legitimate players aren't blocked

---

## ✅ CLOSED BUGS — Summary Log

All bugs below are fixed and merged to `main`. Detail is preserved in git history. Do not re-open unless you observe a regression.

| ID | Title | Severity | Fixed in | PR/Migration |
|----|-------|----------|----------|-------------|
| IMP-D | `notify_league_on_bet_creation` trigger missing SECURITY DEFINER — all bet creation 403d | 🔴 HIGH | Session 51 | PR #216, Mig 89 |
| WC-08 | `get_transfer_window_status` called 20+ times/session — module-level TTL cache + 5min poll | 🟢 LOW | Session 51 | PR #216 |
| IMP-C | WC scoring rules review — EPL copy confirmed acceptable, identical rules for all positions | 🟢 LOW | Session 51 | Verified, no change |
| WC-05 | Roster modal stuck "Loading roster..." for non-draft leagues — no fallback to `squads.players` | 🔴 HIGH | Session 51 | PR #215 |
| WC-07 | Same player proposable in multiple simultaneous trade proposals | 🟠 HIGH | Session 51 | PR #215, Mig 88 |
| WC-02 | Bets tab showed "GW—" for WC (hardcoded label, not passed `currentGW` prop) | 🟡 MEDIUM | Session 51 | PR #215 |
| WC-03 | Auction bid placeholder used `+0.1` instead of `min_increment` from DB | 🟡 MEDIUM | Session 51 | PR #215 |
| WC-01 | `get_league_stats` RPC returned 404 — function never created | 🟡 MEDIUM | Session 51 | PR #215, Mig 88 |
| WC-06 | Chat Realtime `warn()` fired on normal SUBSCRIBING/CLOSED lifecycle states | 🟡 MEDIUM | Session 51 | PR #215 |
| WC-04 | Auctions "LIVE" counter always 0 — filtered `a.status === 'active'` (should be `highest_bidder_id`) | 🟢 LOW | Session 51 | PR #215 |
| WC-09 | LiveScreen showed wrong GW for WC — queried latest deadline instead of next upcoming | 🟢 LOW | Session 51 | PR #215 |
| IMP-A | Trade cash sweetener defaulted to £5M (should be £0) | 🟢 LOW | Session 51 | PR #215 |
| IMP-B | WC matchday deadlines not seeded — rounds 4–7 added; sync pipeline gap noted | 🟡 MEDIUM | Session 51 | PR #215, Mig 88 |
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
