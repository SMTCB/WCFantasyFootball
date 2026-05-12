# Forza Fantasy League - Open Issues & Backlog

**Last Updated**: 2026-05-12 (session 10)  
**Audit Completed**: 2026-05-12 — Git history + codebase verification of all 37 backlog items  
**E2E Test Suite**: 129/129 passing (100%) — all tests green ✅  
**Code Shipping Complete**: 35/37 features (2 not yet started)
**Key Finding**: #034, #035, #036 replaced by unified Bets System (PR #22, migration 28)

---

## 📊 AUDIT SUMMARY (2026-05-12)

**ITEMS CORRECTED (Were marked NOT STARTED, Actually DONE):**
- ✅ #007 Mobile tab icons — DONE (commit a10a982)
- ✅ #020 Draft deadline notifications — DONE (commit 25a9d7f)  
- ✅ #037 Auto-fill squad — DONE (commits 45ca0f0+, autoFilling in code)

**COMPLETED THIS SESSION (session 10):**
- ✅ **#034 + #035 + #036 (merged)** — Replaced with unified Flexible Bets System (PR #22, migration 28):
  - `bet_templates` + `bet_instances` + `bet_submissions` — competition-agnostic, per-league
  - `submit_bet` + `resolve_bet` RPCs with full RLS
  - 3 starter templates: top_scorer, match_result, player_block
  - New **Bets tab** on LeagueScreen with `BetWidget` + `BetsSection` components
  - Removed Daily Prediction widget from HomeScreen + deleted PredictionModal
  - Player Block is now a bet widget, not a standalone chip

**ITEMS NOT STARTED (Ready for next session):**
- ❌ #027-Extended Chat enhancements — 1-2h each (5 options: unread badge, typing indicators, edit/delete, mentions, search)
- ❌ #036 Part 1: Remove Roulette chip from SquadScreen (1-1.5h) — 27 code references remain, independent PR

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

**Next session priorities:**
1. **Merge PR #22** — CI must pass first; then merge to deploy to Vercel
2. **Apply migration 28** via Supabase dashboard (new tables don't auto-apply on Vercel deploy)
3. **Seed first bet instances** — commissioner can create via Supabase dashboard INSERT or we build a commissioner UI widget
4. **#036 Part 1: Remove Roulette** (1-1.5h) — 27 code references in SquadScreen, independent PR
5. **#027-Extended: Unread Chat Badge** (1h) — best ROI of chat enhancements
6. **Infrastructure**: #018 cron settings, #023 player sync activation, #027 realtime enable

**Architecture note for bets seeding:**
Commissioner creates `bet_instances` rows. Either:
- Via Supabase dashboard (SQL INSERT) — no code change
- Or add a small Create Bet form to the Commissioner tab in LeagueScreen (1-2h, not started)

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

