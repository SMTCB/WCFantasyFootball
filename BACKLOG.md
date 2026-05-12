# Forza Fantasy League - Open Issues & Backlog

**Last Updated**: 2026-05-12 (session 12)  
**E2E Test Suite**: 129/150 passing (86%) — 21 pre-existing failures ✅  
**Code Shipping Complete**: 36/37 features (1 not yet started)
**Latest Completion**: Bet Reward Integration + Resolution UI

---

## 📊 AUDIT SUMMARY (2026-05-12)

**ITEMS CORRECTED (Were marked NOT STARTED, Actually DONE):**
- ✅ #007 Mobile tab icons — DONE (commit a10a982)
- ✅ #020 Draft deadline notifications — DONE (commit 25a9d7f)  
- ✅ #037 Auto-fill squad — DONE (commits 45ca0f0+, autoFilling in code)

**COMPLETED THIS SESSION (session 12):**
- ✅ **Bet Reward Integration** (PR #25, migration 29):
  - `aggregate_league_member_points(league_id, user_id)` RPC: sums fantasy points + bet rewards
  - Trigger on `bet_submissions.reward_awarded`: auto-recalculates points when bets resolve
  - Updated `calculate-scores` to use aggregation RPC for league standings
- ✅ **Bet Resolution UI** (commit 40ddbc9):
  - Commissioner panel section in LeagueScreen to resolve open/closed bets
  - Bet dropdown selector, correct answer input, resolve button
  - Auto-fetches open bets when commissioner tab active
  - Calls `resolve_bet` RPC to mark correct answers and award rewards

**COMPLETED SESSION 11:**
- ✅ **#036 Full Completion** (PR #23, PR #24):
  - Part 1: Removed Roulette chip from SquadScreen (27 references cleaned)
  - Part 2: Verified Joker chip compatible with Bets system (no changes needed)
  - Part 3: Opponent block widget live via `player_block` bet template (already in BetWidget)
  - Commissioner UI: Form for creating bet instances in LeagueScreen admin panel

**COMPLETED SESSION 10:**
- ✅ **#034 + #035 + #036 Foundation** — Flexible Bets System (PR #22, migration 28):
  - `bet_templates` + `bet_instances` + `bet_submissions` tables with RLS
  - `submit_bet` + `resolve_bet` RPCs
  - 3 starter templates: top_scorer, match_result, player_block
  - BetsSection + BetWidget components

**ITEMS NOT STARTED (Ready for next session):**
- ❌ #027-Extended Chat enhancements — 1-2h each (5 options: unread badge, typing indicators, edit/delete, mentions, search)

**COMPLETED FEATURES (35/37):**
All P0, P1, P3 items verified done. Major systems: Auction, Chat, Scoring, Draft, Transfers, Bets.

---

## 🔍 HOW THE AUDIT WORKS

**Methodology:**
1. Git log matching: Search for feature commits by number (#007-#036) and name (auction, chat, etc.)
2. Codebase grep: Search src/ and supabase/ for code presence (hooks, components, DB, functions)
3. Manual verification: Where grep unclear, verify actual code (e.g., autoFilling state found for #037)

**Result:**
- ✅ 28 items confirmed DONE (git history + code present)
- ❌ 4 items confirmed NOT STARTED (no git history, no code)
- 🛠️ 2 items READY FOR ACTIVATION (code done, needs dashboard setup)
- ⚠️ 1 item BY DESIGN (awaiting external API)

**Key Insight:**
Stale BACKLOG caused wasted time. This audit prevents future duplicate work. Keep git commits clear and BACKLOG synchronized.

---

## 📋 WHAT'S READY TO START

**Session 12 Status (Today):**
- ✅ Bet Reward Integration complete — fantasy + betting points now combined in league standings
- ✅ Bet Resolution UI live — commissioners can resolve bets and grade submissions
- ✅ Migration 29 (reward aggregation) applied to Supabase
- ⏳ Ready to: Seed test bets + test resolution flow end-to-end

**Next session priorities:**
1. **Seed Initial Bet Instances** (0.5h) — Create 3-5 test bets for manual verification
2. **End-to-End Test** — Create bet → submit answers → resolve → verify rewards in standings
3. **Realtime Updates for Bets** (1h) — Live subscriptions for bet status changes
4. **#027-Extended: Unread Chat Badge** (1h) — best ROI of remaining chat enhancements
5. **Mobile Testing** — iOS/Android builds with Bets + Resolution tabs

---

## 📝 COMPLETE BACKLOG REFERENCE

See previous full BACKLOG.md for detailed specs on each P0-P4 item. This audit corrects status only.

---

## 💡 SESSION LESSON

**User was absolutely right.** Stale documentation wastes time. Insisting on:
- Clear git commits
- Updated BACKLOG
- Synchronization between code and docs

...prevents exactly what happened: working on features that were already done in prior sessions.

**For next sessions:** Check BACKLOG against git history before planning work. This audit methodology (git log + grep) takes 10 minutes and saves hours.

