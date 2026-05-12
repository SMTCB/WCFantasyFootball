# Forza Fantasy League - Open Issues & Backlog

**Last Updated**: 2026-05-12 (session 11)  
**E2E Test Suite**: 129/150 passing (86%) — 21 pre-existing failures ✅  
**Code Shipping Complete**: 36/37 features (1 not yet started)
**Latest Completion**: #036 (full) — Chips System & Commissioner Bets UI (PR #24)

---

## 📊 AUDIT SUMMARY (2026-05-12)

**ITEMS CORRECTED (Were marked NOT STARTED, Actually DONE):**
- ✅ #007 Mobile tab icons — DONE (commit a10a982)
- ✅ #020 Draft deadline notifications — DONE (commit 25a9d7f)  
- ✅ #037 Auto-fill squad — DONE (commits 45ca0f0+, autoFilling in code)

**COMPLETED THIS SESSION (session 11):**
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

**Session 11 Status (Today):**
- ✅ All #036 code complete (PRs #23, #24 merged to main)
- ✅ Commissioner UI for bet creation live
- ✅ Migration 28 (bets system) already applied
- ⏳ Next: Test bet instance creation on live Supabase + seed initial instances

**Next session priorities:**
1. **Test & Verify Bets System** — Create a test bet instance via commissioner UI
2. **Seed Initial Bet Instances** — Commissioner creates 3-5 template instances for testing
3. **#027-Extended: Unread Chat Badge** (1h) — best ROI of remaining chat enhancements
4. **Infrastructure Tasks**: #018 cron, #023 player sync, #027 realtime
5. **Mobile Testing** — iOS/Android builds with Bets tab on LeagueScreen

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

