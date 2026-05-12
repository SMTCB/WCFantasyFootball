# Forza Fantasy League - Open Issues & Backlog

**Last Updated**: 2026-05-12 (session 9)  
**Audit Completed**: 2026-05-12 — Git history + codebase verification of all 37 backlog items  
**E2E Test Suite**: 129/129 passing (100%) — all tests green ✅  
**Code Shipping Complete**: 33/37 features (4 not yet started)
**Key Finding**: 3 stale BACKLOG entries corrected (#007, #020, #037 actually DONE)

---

## 📊 AUDIT SUMMARY (2026-05-12)

**ITEMS CORRECTED (Were marked NOT STARTED, Actually DONE):**
- ✅ #007 Mobile tab icons — DONE (commit a10a982)
- ✅ #020 Draft deadline notifications — DONE (commit 25a9d7f)  
- ✅ #037 Auto-fill squad — DONE (commits 45ca0f0+, autoFilling in code)

**ITEMS NOT STARTED (Ready for next session):**
- ❌ #034 Move special bets to League — 1h
- ❌ #035 Point Boost section — Medium (blocked on category defs)
- ❌ #036 Chips revamp (3 parts) — 3-4h total
- ❌ #027-Extended Chat enhancements — 1-2h each (5 options)

**COMPLETED FEATURES (28/37):**
All P0, P1, P3 items verified done. Major systems: Auction, Chat, Scoring, Draft, Transfers.

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

**If time permits this session:**
1. #027-Extended Chat Unread Badge (1h) — leverages chat just built
2. #034 Move bets to League (1h) — UI clarity
3. #036 Part 1: Remove Roulette (1-1.5h) — clean up Chips tab

**Next session priorities (if needed):**
- #035 Point Boost (Medium effort, high value)
- #036 Parts 2-3: Joker + Opponent Block (complex, split into 3 PRs)
- Infrastructure: #018 cron, #023 player sync, #027 realtime

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

