# Pre-Dry-Run Verification & Cleanup Checklist

**Last updated:** 2026-05-04  
**Status:** Ready for cleanup and onboarding verification

---

## 1️⃣ DOCUMENTATION — VERIFIED ✅

### Summary
All documentation has been updated and is competition-agnostic:

#### New (created this session)
- ✅ **docs/PIPELINE.md** — Backend architecture, Edge Functions, DB schema. Dated 2026-05-03.
- ✅ **docs/APP_DYNAMICS.md** — App features, matchday cycle, scoring mechanics. Dated 2026-05-03.

#### Updated (this session)
- ✅ **README.md** — Now says "Competition-agnostic fantasy football platform" instead of "EPL fantasy football web app"
- ✅ **README.md** — Project docs section reorganized to highlight `docs/` folder as primary reference

#### Existing reference docs (still accurate)
- ✅ **DATA_PIPELINE_RUNBOOK.md** — Runbook for activating any tournament (EPL, WC, UCL, etc.)
- ✅ **DRAFT_SYSTEM_DESIGN.md** — Draft mechanics (competition-agnostic)
- ✅ **FANTASY_POINTS_SCORING_LAYER.md** — Scoring rules engine (DB-driven, no hardcoded values)

### Notes
- No WC-specific or EPL-specific language in any public-facing documentation
- All competition config is referenced as "DB-driven" with "EPL fallback defaults"
- Scoring rules, budget, squad size, position limits all documented as configurable per tournament

---

## 2️⃣ HARDCODED BRANDING — FIXED ✅

### Fixed this session
- ✅ **LeagueInviteCard.jsx Line 29** — Changed `"World Cup 2026 fantasy league"` → dynamic `${tournamentName}`
- ✅ **LeagueInviteCard.jsx Line 113** — Changed `"ForzaKit · WC 2026"` → dynamic `"ForzaKit · ${tournamentName}"`
  - Now loads tournament name from `leagues.tournament_id` → `tournaments.name`
  - Falls back to "Fantasy Football" if no tournament is found

### Previously fixed
- ✅ **AuthScreen.jsx Line 274** — "World Cup 2026 Fantasy" → "Fantasy Football League"
- ✅ **AppLayout.jsx Line 71** — "World Cup 2026" → "Fantasy Football"
- ✅ **LeagueScreen.jsx** — Demo league name "World Cup Official" → "My League"
- ✅ **LeagueScreen.jsx** — Placeholder "e.g. World Cup Legends" → "e.g. Champions Draft League"
- ✅ **fixtures.js** — Removed dead World Cup fixture stubs, replaced with `export const fixtures = []`

### Result
**No remaining hardcoded competition branding in user-facing code.**

---

## 3️⃣ MOCK DATA CLEANUP — ACTION REQUIRED

### Current Database State
```
Tournaments:  1 (Premier League 2025-26) ✅
Leagues:      4 (3 "World Cup" test leagues + 1 "TEST") ❌ DELETE THESE
Users:        8 (test users) ❌ DELETE THESE
Squads:       0 ✅
Fixtures:     46 (Rounds 34-38 + 1 stray Round 31) ✅ (clean up Round 31)
Players:      654 (EPL roster) ✅
```

### Leagues to DELETE
All 4 existing leagues are test/demo data created during development:

| League ID | Name | Tournament | Members | Action |
|-----------|------|-----------|---------|--------|
| 744e430f | World Cup Official | null | 4 | 🗑️ DELETE |
| 11111111 | World Cup Legends | wc2026 | 1 | 🗑️ DELETE |
| aa3e80c4 | World Cup Official | null | 4 | 🗑️ DELETE |
| b74a508f | TEST | null | 1 | 🗑️ DELETE |

### Users to DELETE
All 8 users are test accounts. For the dry run, only **real users with whom you share the link** should join.

### Fixtures to CLEAN
- Rounds 34-38: Keep ✅ (current season, needed for dry run)
- Round 31: Delete ❌ (1 stray fixture, likely test data)

### SQL Commands to Run

```sql
-- Delete all test leagues (cascade deletes league_members)
DELETE FROM leagues 
WHERE id IN (
  '744e430f-7f11-452e-ad02-daf4ae569c14',
  '11111111-1111-1111-1111-111111111111',
  'aa3e80c4-23e5-400a-88ef-2a18e3fda301',
  'b74a508f-9a28-4eb1-8dbe-1458048e9a28'
);

-- Delete all test users
DELETE FROM users 
WHERE id IN (
  SELECT user_id FROM auth.users 
  WHERE email LIKE '%test%' OR email LIKE '%demo%' OR email LIKE '%world%'
);

-- Delete stray Round 31 fixture
DELETE FROM fixtures WHERE round_number = 31;

-- Verify cleanup
SELECT 
  (SELECT COUNT(*) FROM leagues) as leagues_remaining,
  (SELECT COUNT(*) FROM users) as users_remaining,
  (SELECT COUNT(*) FROM fixtures WHERE round_number = 31) as round_31_count;
```

---

## 4️⃣ ONBOARDING EXPERIENCE — READY ✅

The onboarding experience is clear and competition-agnostic. Here's what new users see:

### Auth Flow
1. **Sign In / Sign Up** — Generic "Fantasy Football League" branding (no WC mentions)
2. **Email verification** — Standard Supabase flow
3. **Redirect to home** — No competition-specific content

### Home Screen (Onboarding Wizard)
1. **Create or Join League** — Clear league setup UX
   - Input: League name, join code, draft/classic format
   - No WC-specific copy
2. **Build Your Squad** — Market screen tour
   - Shows budget, position limits, player list
   - Tooltip: "Every player you buy deducts from your budget"
   - Dynamic budget loaded from `leagues.budget_total` (defaults to EPL £100M)
3. **Select Captain** — Squad management
4. **Make a Prediction** — Daily top-scorer prediction (optional)

### Market Screen
- ✅ Budget shown dynamically from `leagues.budget_total`
- ✅ Position counts shown dynamically from `leagues.position_limits`
- ✅ Squad size shown dynamically from `leagues.squad_size`
- ✅ All onboarding tour copy is generic (no EPL/WC mentions)

### League Creation
- ✅ Share invite card shows **dynamic tournament name** (just fixed)
- ✅ WhatsApp message: "Join my ForzaKit [Tournament Name] fantasy league!"
- ✅ Invite card badge: "ForzaKit · [Tournament Name]"

### Result
**Onboarding is clear and ready for any competition. New users will see only generic "Fantasy Football League" language.**

---

## 5️⃣ NEXT STEPS (In Order)

### Immediate (Before Dry Run)
- [ ] **SQL Cleanup** — Run the DELETE statements above in Supabase SQL Editor
  - Deletes 4 test leagues (cascade-deletes all league_members)
  - Deletes all test users
  - Deletes 1 stray Round 31 fixture
- [ ] **Verify Database** — Run the verification SELECT to confirm cleanup
- [ ] **Deploy fixes** — Push the LeagueInviteCard.jsx and README.md changes to main
  - ⚠️ This is critical for the invite card to show the correct tournament name

### Before First Dry-Run User Joins
- [ ] **Create a new league** — For the dry run (EPL 2025-26, remaining matches)
  - Name: "EPL Dry Run 2026" (or similar)
  - Tournament: Premier League 2025-26
  - Format: Classic
  - Max members: 5-10 (adjust as needed)
- [ ] **Share the join link** — with your dry-run testers
- [ ] **Verify onboarding flow** — as a new user:
  1. Sign up
  2. Verify email
  3. Join the dry-run league
  4. View the market
  5. Build a squad
  6. View live scoring (once matches start)

### After Dry Run Completes
- [ ] **Set up pg_cron scheduled jobs** (deferred from earlier)
  - Auto-sync fixtures nightly
  - Auto-ingest match events (polling every 60s during live matches)
  - Auto-calculate scores

---

## 📋 Verification Checklist (For You)

Use this to verify the platform is ready:

- [ ] **Documentation** — Read through `docs/APP_DYNAMICS.md` and `docs/PIPELINE.md`
  - Are they complete?
  - Do they match the current state of the code?
  - Any WC/EPL-specific language?

- [ ] **Branding** — Walk through the app as a new user (sign up → join league → market)
  - See any hardcoded tournament names?
  - See any WC or EPL mentions?
  - Is the league invite card showing the correct tournament name?

- [ ] **Database** — After cleanup
  - Are there only EPL fixtures (Rounds 34-38)?
  - Are there 0 test leagues?
  - Are there 0 test users?
  - Is there 0 squads (expected — users build squads on their first visit)?

- [ ] **Dry Run Ready** — Create a test league and verify
  - Can you sign up as a new user?
  - Can you join the league with a code?
  - Can you see the market with dynamic budget/squad size?
  - Does the invite card show "Premier League 2025-26" (not "WC 2026")?

---

## 🚀 After All Three Items Are Done

Once you've verified all three (docs, branding, mock data), the platform is ready for the full dry run:

1. **Create your dry-run league** — EPL 2025-26, remaining matches
2. **Share the link** with your testers
3. **Run end-to-end flow** — sign up, build squad, watch live scoring
4. **Set up pg_cron** for automated fixture/score syncing
5. **Launch to production** with World Cup setup

---

## Summary Table

| Item | Status | Notes |
|------|--------|-------|
| **Documentation** | ✅ Complete | docs/PIPELINE.md, docs/APP_DYNAMICS.md, README.md updated |
| **Hardcoded Branding** | ✅ Fixed | LeagueInviteCard now dynamic; all other references removed |
| **Mock Data** | ❌ Ready to clean | 4 test leagues + 8 test users + 1 stray fixture waiting for DELETE |
| **Onboarding** | ✅ Clear | Auth → Market → Squad → Prediction; all generic language |
| **Next Step** | 🔄 SQL cleanup | Run the DELETE statements, then deploy code changes |
