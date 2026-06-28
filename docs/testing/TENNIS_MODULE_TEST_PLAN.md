# Tennis Module — Test Plan

**Acceptance test specification for the Player's Box tennis game (v2 branch).**
All scenarios must pass before Phase 3B smoke tests and v2 → main merge.

> **Source of truth for tennis game rules:** [TENNIS_MODULE_IMPLEMENTATION_PLAN.md](../platform_revision/modules/TENNIS_MODULE_IMPLEMENTATION_PLAN.md)
> **Tracking:** [TRACKER.md](../platform_revision/TRACKER.md) — Phase 3B Smoke Tests section

---

## Test Environment

| Item | Status | Notes |
|------|--------|-------|
| Tennis DB tables (migrations 197–201) | ✅ Applied to prod | `tennis_tournaments`, `player_boxes`, `tennis_rosters`, etc. |
| `sync-tennis-players` Edge Function | ✅ Deployed + working | TRACKER row 7. Deployed earlier, but unreachable until the 2026-06-28 auth fix below — see note |
| `score-tennis-tournament` Edge Function | ✅ Deployed | TRACKER row 5. Same auth fix applies — untested live yet, fix verified via `sync-tennis-players` |
| `score-atp-finals` Edge Function | ✅ Deployed | TRACKER row 6. Same auth fix applies — not yet exercised live |
| `RAPIDAPI_TENNIS_KEY` secret | ✅ Confirmed set | Verified working — real RapidAPI call succeeded 2026-06-28 (Wimbledon draw synced) |
| `ADMIN_TRIGGER_KEY` secret | ✅ Added 2026-06-28 | New secret — see "Auth fix" note below. Required to call any of the 4 admin-only tennis/F1 functions from outside Supabase's own infra |
| `VITE_AUTH_ENABLED` (Vercel Preview, `v2` branch) | ✅ Added 2026-06-28 | Preview-only, scoped to the `v2` git branch. Production untouched. Needed so this dry run exercises real Supabase Auth + RLS instead of demo mode — see "Preview auth" note below |

### ⚠️ Auth fix required before this dry run could even start (2026-06-28)

`sync-tennis-players`, `score-tennis-tournament`, `score-atp-finals`, and `score-f1-race` all share `requireServiceRole()` in `supabase/functions/_shared/auth.ts`, which on this project's new Supabase API key system could not be satisfied by anyone outside Supabase's own infra — neither the exact-match path (masked `sb_secret_...` keys) nor the legacy-JWT HMAC path (no `SUPABASE_JWT_SECRET` configured) worked. All 4 functions were effectively uncallable in production despite TRACKER.md showing them as "✅ deployed" — deployed is not the same as reachable. Fixed in two parts:
1. **PR #662** — added a third auth path to `requireServiceRole`: exact match against a new `ADMIN_TRIGGER_KEY` secret, for manual/admin-triggered calls only.
2. **PR #663** — discovered a second, gateway-level blocker: these 4 functions had no entry in `supabase/config.toml`, so the Supabase API Gateway defaulted `verify_jwt=true` and rejected the non-JWT-shaped `ADMIN_TRIGGER_KEY` bearer token before the function even ran. Added explicit `verify_jwt = false` entries for all 4 functions, matching the existing `calculate-scores` pattern.

Both fixes are additive and scoped to exactly these 4 v2-only functions (confirmed via grep — no other function imports `_shared/auth.ts`). Zero impact on `main`/pilot functions. **Implication for future sessions:** any new admin-triggered Edge Function using `requireServiceRole` must also get a `verify_jwt = false` entry in `config.toml`, or it will silently 401 at the gateway regardless of what the function code does.

### Preview auth note (2026-06-28)

`VITE_AUTH_ENABLED` was set only for Vercel **Production** (confirmed via `vercel env ls`) — Preview deployments (incl. any `v2` PR preview) ran in demo mode with no real Supabase Auth session, meaning RLS-gated RPCs like `submit_tennis_roster` were never actually exercised by preview testing. Added `VITE_AUTH_ENABLED=true` scoped to Preview + `v2` branch only (not all Preview branches, not Production) so this dry run hits the real `auth.uid()`-gated path. Takes effect on the next push to `v2`.

**Naming note:** The user-facing card called "Qualifier Insurance" in these test scenarios maps to the code/DB name `dark_horse_insurance`. Both names refer to the same card: +50 pts per round a Tier 4 player advances past R32.

---

## Wimbledon 2026 — Dry Run Checklist

Wimbledon 2026 starts 2026-06-29. Use this as the live integration test for the tennis module.

### Pre-conditions (run in order, each needs explicit approval)

| Step | Action | Command / Notes | Status |
|------|--------|-----------------|--------|
| 1 | Deploy `sync-tennis-players` EF | `npx supabase functions deploy sync-tennis-players --project-ref sssmvihxtqtohisghjet` | ✅ Done — redeployed 2026-06-28 after the `config.toml` fix |
| 2 | Confirm `RAPIDAPI_TENNIS_KEY` secret is set | `npx supabase secrets list --project-ref sssmvihxtqtohisghjet` | ✅ Confirmed working |
| 3 | Find Wimbledon row in `tennis_tournaments` | `SELECT id, name, external_id, status FROM tennis_tournaments WHERE name ILIKE '%wimbledon%';` | ✅ Done — `id = 9bf04949-49af-4d92-b523-3ba15757fba8` |
| 4 | Open the tournament (sets external_id + status='upcoming') | Call `admin_open_tournament` RPC with the Wimbledon `id` and its RapidAPI external_id | ✅ Done — real `external_id = 21337`, status now `roster_open` |
| 5 | Sync the Wimbledon draw from RapidAPI (1 API call) | Call `sync-tennis-players` EF with `{ tournament_id: <id> }` — uses 1 of 50 daily API credits | ✅ Done — `pageSize=300` returned the full R1 draw (64 fixtures) in 1 call |
| 6 | Verify player tiers seeded correctly | `SELECT tier, COUNT(*) FROM tennis_tournament_players WHERE tournament_id='<id>' GROUP BY tier;` — expect T1=4, T2=12, T3=16, T4=unseeded remainder | ✅ Confirmed `{T1:4, T2:12, T3:16, T4:96}` = 128, after deleting 2 stale placeholder rows + 1 stale test roster that referenced them (see note below) |
| 7 | Create a test Player Box | Via UI: TennisHomeScreen → Create Box (or call `create_player_box` RPC) | ⬜ Not started |
| 8 | Submit a test roster | Via UI: TennisTournamentScreen → submit 7 players (1 T1, 2 T2, 2 T3, 2 T4) | ⬜ Not started |

**Stale data cleanup (2026-06-28):** initial tier count was 130, not 128 — two leftover placeholder rows (fake "Carlos Alcaraz" and fake "Christopher Eubanks", both `external_player_id IS NULL`) were not deduped against the real synced data because the unique index `tennis_ttp_external_id_idx` is a partial index (`WHERE external_player_id IS NOT NULL`). One pre-existing test `tennis_rosters` row referenced both via FK and had to be deleted first. **Lesson for future syncs:** any tournament with prior manual/test player rows should be checked for `external_player_id IS NULL` stragglers before trusting a tier-count match.

### Post-tournament validation (after Wimbledon completes)
- Call `admin_enter_round_results` for each round as results come in
- Call `admin_open_qf_window` at QF stage to unlock captain selection
- After final: call `admin_set_champion` + `admin_complete_tournament`
- Call `score-tennis-tournament` EF and verify leaderboard matches expected points

---

## Module 1 — Roster Validation Rules

### Scenario 1.1: Valid Roster Submission ✅

**Context:** User submits a valid 7-player Grand Slam roster.

**Given:**
- 1 player from Tier 1 (seeded 1–4)
- 2 players from Tier 2 (seeded 5–16)
- 2 players from Tier 3 (seeded 17–32)
- 2 players from Tier 4 (unseeded)

**When:** User saves their roster via `submit_tennis_roster` RPC.

**Then:** System accepts the roster, locks it in for the tournament.

**Status:** ⬜ Not tested

---

### Scenario 1.2: Invalid Tier 1 Seeding ❌

**Context:** User tries to submit a player seeded 6 as their Tier 1 pick.

**Given:** Roster where the nominated Tier 1 slot contains a player whose actual seed is 6 (Tier 2).

**When:** User saves their roster.

**Then:** System rejects with error — "Tier 1 player must be seeded between 1 and 4."

**Status:** ⬜ Not tested

---

### Scenario 1.3: Wrong Squad Size ❌

**Context:** User submits with 6 or 8 players instead of exactly 7.

**Given (a):** Roster containing only 6 players.
**Given (b):** Roster containing 8 players.

**When:** User saves.

**Then:** System rejects with error — "Your roster must contain exactly 7 players."

**Status:** ⬜ Not tested

---

## Module 2 — Standard Tournament Scoring & Captain Multipliers

> **Grand Slam points reference (no captain, no ace card):**
>
> | Round | Points |
> |-------|--------|
> | Champion | 2,000 |
> | Runner-up (Final) | 1,200 |
> | Semifinal | 720 |
> | Quarterfinal | 360 |
> | Round of 16 | 180 |
> | Round of 32 / Early | 90 |
> | Did Not Play | 0 |

### Scenario 2.1: Grand Slam Base Points Calculation

**Context:** No captain or ace cards active.

**Given:**

| Player | Tier | Result | Expected Points |
|--------|------|--------|----------------|
| Player 1 | T1 | Champion | 2,000 |
| Player 2 | T2 | Semifinalist | 720 |
| Player 3 | T2 | Round of 16 | 180 |
| Player 4 | T3 | Early Rounds (R32) | 90 |
| Player 5 | T3 | Did Not Play | 0 |
| Player 6 | T4 | Early Rounds (R32) | 90 |
| Player 7 | T4 | Early Rounds (R32) | 90 |

**When:** Scoring engine runs via `score-tennis-tournament`.

**Then:** Total = **3,170 points.**

**Status:** ⬜ Not tested

---

### Scenario 2.2: Eligible Captain Multiplier (×2)

**Context:** Captain reached QF or better — multiplier applies.

**Given:** Tournament at QF stage. User nominates Player 1 (T1) as Captain. Player 1 goes on to win (Champion, 2,000 base pts).

**When:** Scoring engine resolves.

**Then:**
- Player 1 points: **4,000** (2,000 × 2 captain multiplier)
- All other players: standard base points

**Status:** ⬜ Not tested

---

### Scenario 2.3: Ineligible Captain (exits before QF)

**Context:** Captain knocked out before QF — no multiplier.

**Given:** Tournament at QF stage. User nominates Player 2 (T2) as Captain. Player 2 was knocked out in R16 (before QF).

**When:** Scoring engine resolves.

**Then:**
- Player 2 points: **180** (standard R16 points, no multiplier)
- No captain bonus applied

**Status:** ⬜ Not tested

---

## Module 3 — Ace Cards (Boosters)

> **One card per tournament, one of each type per season. Cards cannot stack.**

### Scenario 3.1: Underdog Boost Card

**Context:** Doubles points for both Tier 4 players.

**Given:** Underdog Boost active.
- T4 Player A reaches R16 (180 base pts)
- T4 Player B reaches QF (360 base pts)

**When:** Scoring engine resolves.

**Then:**
- T4 Player A: **360 pts** (180 × 2)
- T4 Player B: **720 pts** (360 × 2)
- All other tiers: standard base points

**Status:** ⬜ Not tested

---

### Scenario 3.2: Safety Net Card — Triggered

**Context:** Tier 1 player crashes out in R1 or R2.

**Given:** Safety Net active. T1 player exits in the first main-draw round (90 pts base).

**When:** Scoring engine resolves.

**Then:**
- T1 player: **90 pts** (standard R32/early base)
- **+200 pts** flat consolation bonus added
- Total contribution from T1 slot: **290 pts**

**Status:** ⬜ Not tested

---

### Scenario 3.3: Safety Net Card — Not Triggered

**Context:** Card was played but T1 player performed well — no bonus.

**Given:** Safety Net active. T1 player reaches Semifinal (720 base pts).

**When:** Scoring engine resolves.

**Then:**
- T1 player: **720 pts** (standard SF base — no bonus)
- Card counts as used for the season

**Status:** ⬜ Not tested

---

### Scenario 3.4: Surface Specialist Card

**Context:** Doubles the ENTIRE roster aggregate for the tournament.

**Given:** Surface Specialist active. All 7 players combined earn **1,500 base points**.

**When:** Scoring engine resolves.

**Then:** Total tournament score: **3,000 pts** (1,500 × 2)

**Status:** ⬜ Not tested

---

### Scenario 3.5: Qualifier Insurance (Dark Horse Insurance) Card

**Context:** +50 pts for each round a T4 player advances past R32.

**Given:** Qualifier Insurance active. One T4 player reaches Semifinals (3 rounds past R32: R16 → QF → SF). Semifinal base = 720 pts.

**When:** Scoring engine resolves.

**Then:**
- Base points: **720 pts** (standard SF)
- Bonus: **150 pts** (3 rounds × 50 pts)
- Total from that player: **870 pts**

> **Code name:** `dark_horse_insurance` — "Qualifier Insurance" is the user-facing label in these test scenarios.

**Status:** ⬜ Not tested

---

## Module 4 — Masters 1000 Season Rollup

> **Masters Drop Rule:** When ≥5 standard tournaments are complete, only the **best 4 of 9** Masters 1000 scores count. Grand Slams and ATP Finals are always counted in full.

### Scenario 4.1: Best 4 of 9 Aggregate (Full Season)

**Context:** User has completed all 9 Masters 1000 events.

**Given:** Scores = `[100, 800, 450, 50, 60, 950, 0, 1200, 300]`

**When:** Leaderboard RPC (`get_player_box_leaderboard`) calculates.

**Then:**
- Sorted descending: `[1200, 950, 800, 450, 300, 100, 60, 50, 0]`
- Top 4 taken: `[1200, 950, 800, 450]`
- **Expected total: 3,400 pts**

**Status:** ⬜ Not tested

---

### Scenario 4.2: Incomplete Season Rollup (Fewer Than 5 Events)

**Context:** User has only participated in 2 Masters events.

**Given:** Scores = `[450, 900]`

**When:** Leaderboard calculates.

**Then:** Masters Drop Rule does not trigger (fewer than 5 completed). Sum all available scores.
**Expected total: 1,350 pts**

**Status:** ⬜ Not tested

---

## Module 5 — ATP Finals Aggregated Predictor

> **Format:** 15 total picks across two phases. Group Stage (12 picks) + Knockout (3 picks). Scoring is purely by correct-predictions threshold.

### Scenario 5.1: Two-Phase Input Flow

**Context:** Validating that the two submission windows enforce sequential lock.

**Given:** ATP Finals starts, Phase 1 (Group Stage) is active.

**When Phase 1 active:**
- User can submit all 12 Group Stage predictions
- The 3 Knockout picks are locked/disabled

**When Phase 2 active (group stage finished):**
- All 12 Group Stage picks are frozen (read-only)
- User can submit 3 Knockout predictions

**Status:** ⬜ Not tested

---

### Scenario 5.2: Aggregated Prediction Evaluation

**Context:** Full 15-pick scoring against correct-predictions thresholds.

**Given:** Tournament over. System resolves via `score-atp-finals`.

**Then — threshold mapping:**

| Correct Picks | Range | Points | Label |
|--------------|-------|--------|-------|
| 1–5 correct | 3 in scenario | 250 | Unforced Error |
| 6–9 correct | 8 in scenario | 750 | Deuce |
| 10–12 correct | 11 in scenario | 1,800 | Match Point |
| 13–14 correct | 14 in scenario | 3,500 | Championship Point |
| 15 correct | Perfect | 7,500 | The Perfect Slate |

**Status:** ⬜ Not tested

---

## Test Run Log

| Date | Tester | Module | Scenario | Result | Notes |
|------|--------|--------|----------|--------|-------|
| 2026-06-28 | Claude | Pre-conditions | Steps 1–6 (deploy, secret, find, open, sync, verify tiers) | ✅ Pass | Required an unplanned auth fix (PRs #662/#663) before any function call would succeed — see notes above |
| — | — | Module 1–5 | All scenarios | ⬜ Pending | Awaiting Player Box creation + roster submission (steps 7–8) |

---

Last Updated: **2026-06-28** (pre-condition steps 1–6 complete; auth fix for 4 admin functions; Preview env auth enabled for v2)
