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
| `sync-tennis-players` Edge Function | ⬜ Deploy pending | TRACKER row 7 — must deploy before any live dry run |
| `score-tennis-tournament` Edge Function | ⬜ Deploy pending | TRACKER row 5 |
| `score-atp-finals` Edge Function | ⬜ Deploy pending | TRACKER row 6 |
| `RAPIDAPI_TENNIS_KEY` secret | ❓ Confirm set | Check: `npx supabase secrets list --project-ref sssmvihxtqtohisghjet` |

**Naming note:** The user-facing card called "Qualifier Insurance" in these test scenarios maps to the code/DB name `dark_horse_insurance`. Both names refer to the same card: +50 pts per round a Tier 4 player advances past R32.

---

## Wimbledon 2026 — Dry Run Checklist

Wimbledon 2026 starts 2026-06-29. Use this as the live integration test for the tennis module.

### Pre-conditions (run in order, each needs explicit approval)

| Step | Action | Command / Notes |
|------|--------|-----------------|
| 1 | Deploy `sync-tennis-players` EF | `npx supabase functions deploy sync-tennis-players --project-ref sssmvihxtqtohisghjet` |
| 2 | Confirm `RAPIDAPI_TENNIS_KEY` secret is set | `npx supabase secrets list --project-ref sssmvihxtqtohisghjet` |
| 3 | Find Wimbledon row in `tennis_tournaments` | `SELECT id, name, external_id, status FROM tennis_tournaments WHERE name ILIKE '%wimbledon%';` |
| 4 | Open the tournament (sets external_id + status='upcoming') | Call `admin_open_tournament` RPC with the Wimbledon `id` and its RapidAPI external_id |
| 5 | Sync the Wimbledon draw from RapidAPI (1 API call) | Call `sync-tennis-players` EF with `{ tournament_id: <id> }` — uses 1 of 50 daily API credits |
| 6 | Verify player tiers seeded correctly | `SELECT tier, COUNT(*) FROM tennis_tournament_players WHERE tournament_id='<id>' GROUP BY tier;` — expect T1=4, T2=12, T3=16, T4=unseeded remainder |
| 7 | Create a test Player Box | Via UI: TennisHomeScreen → Create Box (or call `create_player_box` RPC) |
| 8 | Submit a test roster | Via UI: TennisTournamentScreen → submit 7 players (1 T1, 2 T2, 2 T3, 2 T4) |

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
| — | — | — | — | — | Awaiting Wimbledon dry run |

---

Last Updated: **2026-06-28** (initial version — Wimbledon 2026 dry run)
