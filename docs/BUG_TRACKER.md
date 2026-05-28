# Bug Tracker — Forza Fantasy League
**Last updated**: 2026-05-28 (session 51 — WC P1/P2/P3 bug fixes)  
**Live app**: https://wc-fantasy-football.vercel.app  
**Next migration**: `89_`

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

### P3-C · WC-08 · `get_transfer_window_status` called 20+ times per session — LOW
**Performance overhead — no user-visible breakage.**

- **Network**: 20+ POST calls to `/rest/v1/rpc/get_transfer_window_status` observed in a single session  
- **Root cause**: `useTransferWindow` is mounted in both `LeagueScreen` and `SquadScreen`. In `LeagueScreen`, switching between the BOARD/BETS/AUCTIONS/CHAT tabs triggers remounts of child components — each remount recreates the interval and fires an immediate fetch. The fix is to lift the hook to a context provider shared across tab views.
- **Where to look**: Create a `TransferWindowContext` provider in `LeagueScreen` and pass the result down via context instead of calling `useTransferWindow` per-tab.

**Re-test steps**:
1. Log in → WC_OVERALL_E2E → navigate through all tabs (BOARD, BETS, AUCTIONS, CHAT, STATS)
2. Open DevTools → Network → filter by `transfer_window`
3. ✅ Pass: fewer than 5 calls total across all tab navigations

---

## 🔧 IMPROVEMENTS (not bugs — polish items)

These are not blocking anything but worth doing before WC launch or shortly after.

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
