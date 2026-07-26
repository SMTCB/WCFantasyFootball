# Tennis Module — Test Plan

**Acceptance test specification for the Player's Box tennis game.**
All scenarios must pass before the tennis module is considered smoke-tested in prod.

> **Source of truth for tennis game rules:** the deployed code itself —
> [`supabase/functions/score-tennis-tournament/index.ts`](../../supabase/functions/score-tennis-tournament/index.ts),
> [`supabase/functions/score-atp-finals/index.ts`](../../supabase/functions/score-atp-finals/index.ts),
> [`supabase/migrations/197_tennis_core_schema.sql`](../../supabase/migrations/197_tennis_core_schema.sql),
> [`198_tennis_game_tables.sql`](../../supabase/migrations/198_tennis_game_tables.sql),
> [`199_tennis_t1_rpcs.sql`](../../supabase/migrations/199_tennis_t1_rpcs.sql),
> [`200_tennis_admin_rpcs.sql`](../../supabase/migrations/200_tennis_admin_rpcs.sql),
> [`201_tennis_leaderboard_rpcs.sql`](../../supabase/migrations/201_tennis_leaderboard_rpcs.sql).
> `docs/platform_revision/modules/TENNIS_MODULE_IMPLEMENTATION_PLAN.md` (the original design doc) describes an
> **earlier design intent** for scoring (round-table points, big ace-card multipliers, ATP Finals threshold
> tiers) that was **not what got built**. This revision replaces that content with the actual shipped mechanic,
> verified line-by-line against the Edge Function source on 2026-07-26. Treat the implementation plan doc as
> historical context only, not as ground truth for expected point values.
>
> **Tracking:** [TRACKER.md](../platform_revision/TRACKER.md) — Phase 3B Smoke Tests section

---

## ⚠️ Correction note (2026-07-26)

The previous version of this document (last updated 2026-06-28) specified scoring scenarios using a
"round → flat points" table (Champion = 2,000, Runner-up = 1,200, etc.), ace-card bonuses that doubled or
added hundreds of points, and an ATP Finals threshold/label system (250–7,500 pts across 5 tiers). **None of
that matches the deployed `score-tennis-tournament` / `score-atp-finals` Edge Functions.** The real mechanic:

- Points are **per-round-won, tier-based** (`TIER_PTS = {1:2, 2:3, 3:4, 4:6}`), not a flat lookup by furthest round.
- Captain bonus **doubles that captain's own points** (base + equal bonus), gated structurally by the QF-window
  eligibility rule (captain must be alive/non-eliminated when nominated, which by the time the QF window opens
  means they already reached at least QF) — not a runtime "did they reach QF" check inside the scoring function.
- Ace cards are small flat bonuses (+15 / +8 / +12) or a floor mechanic (dark_horse_insurance), not multipliers.
- The Masters Drop Rule drops exactly **one** worst standard-tournament score once ≥5 standard tournaments are
  complete — it is not a "best 4 of 9" selection restricted to Masters 1000 events.
- ATP Finals scoring is a flat per-correct-pick sum (`group=3, sf=5, final=8`, max 54) — there are no threshold
  bands or "Unforced Error / Deuce / Match Point" labels anywhere in the code.

All scenarios below have been rewritten to match the real implementation. Nothing about the roster-composition
rules (Module 1) needed correcting — those already matched `submit_tennis_roster`.

---

## Test Environment

| Item | Status | Notes |
|------|--------|-------|
| Tennis DB tables (migrations 197–201) | ✅ Applied to prod | `tennis_tournaments`, `player_boxes`, `tennis_rosters`, etc. |
| `sync-tennis-players` Edge Function | ✅ Deployed + working | Confirmed reachable after the 2026-06-28 auth fix (PRs #662/#663) |
| `score-tennis-tournament` Edge Function | ✅ Deployed | Confirmed reachable; exercised live 2026-07 (see Test Run Log) |
| `score-atp-finals` Edge Function | ✅ Deployed | Confirmed reachable; not yet exercised against real ATP Finals data |
| `RAPIDAPI_TENNIS_KEY` secret | ✅ Confirmed set | Real RapidAPI call succeeded 2026-06-28 (Wimbledon draw synced) |
| `ADMIN_TRIGGER_KEY` secret | ✅ Confirmed set | Required to call any of the 4 admin-only tennis/F1 functions from outside Supabase's own infra |
| `VITE_AUTH_ENABLED` | ✅ Production | Repo is single-branch (`main`) since the 2026-07-24 cutover — no separate Preview/branch auth config needed anymore |

### ⚠️ Auth fix required before functions were callable (2026-06-28, historical)

`sync-tennis-players`, `score-tennis-tournament`, `score-atp-finals`, and `score-f1-race` all share
`requireServiceRole()` in `supabase/functions/_shared/auth.ts`. Fixed via PR #662 (added `ADMIN_TRIGGER_KEY`
exact-match auth path) + PR #663 (added `verify_jwt = false` gateway entries in `supabase/config.toml` for all
4 functions). Any new admin-triggered Edge Function using `requireServiceRole` needs the same `config.toml`
entry or it will silently 401 at the gateway.

**Naming note:** the user-facing card labels shown in the UI may differ slightly from the DB `card_type`
values. Confirmed mapping: `underdog_boost`, `safety_net`, `surface_specialist`, `dark_horse_insurance`.

---

## Real-data status (as of 2026-07-26)

| Item | Status |
|------|--------|
| Wimbledon 2026 tournament row | ✅ Opened, real draw synced (`external_id=21337`, 128 players, tiers `{T1:4,T2:12,T3:16,T4:96}`) |
| Player Box + roster + scoring loop | ✅ Verified end-to-end with a real Player Box, real roster submission, and a live `score-tennis-tournament` call (see Task #11 in session history / Test Run Log below) |
| ATP Finals full 15-match cycle | ⬜ Not yet exercised against real fixtures — season hasn't reached ATP Finals |

---

## Module 1 — Roster Validation Rules

Enforced by `submit_tennis_roster` (migration 199). A roster is always exactly 7 players: 1×Tier1, 2×Tier2,
2×Tier3, 2×Tier4 — the RPC signature has one fixed positional parameter per slot, so "wrong squad size" isn't
a runtime case, it's a fixed 7-parameter call; the only size-shaped failure is omitting one of the 7.

### Scenario 1.1: Valid Roster Submission ✅

**Given:** 1 Tier1 + 2 Tier2 + 2 Tier3 + 2 Tier4 player, all distinct, all belonging to the target tournament,
tournament `status = 'roster_open'`.

**When:** `submit_tennis_roster(...)` called (no ace card).

**Then:** Roster upserted, `locked_at` set to `now()`. Returns `{ locked_at, ace_card: null }`.

**Status:** ✅ Verified live (Wimbledon dry run, Task #11).

---

### Scenario 1.2: Tier Mismatch ❌

**Given:** `p_tier1` points to a player whose `tier` column is actually `2` (not `1`).

**When:** `submit_tennis_roster(...)` called.

**Then:** RPC raises `INVALID_PLAYER_TIER1`. No row written/updated.

**Status:** ⬜ Not tested

**Note:** the RPC checks the player's stored `tier` column, not a seed-number range — tier is assigned
explicitly by admin during `admin_seed_tournament_players`, independent of seed number.

---

### Scenario 1.3: Missing Slot ❌

**Given:** Any one of the 7 positional player-id arguments passed as `NULL`.

**When:** `submit_tennis_roster(...)` called.

**Then:** RPC raises `ALL_SLOTS_REQUIRED`.

**Status:** ⬜ Not tested

---

### Scenario 1.4: Duplicate Player Across Slots ❌

**Given:** The same player id passed for two different slots (e.g. `p_tier2a == p_tier2b`).

**When:** `submit_tennis_roster(...)` called.

**Then:** RPC raises `DUPLICATE_PLAYERS` (distinct-count check across all 7 ids < 7).

**Status:** ⬜ Not tested

---

### Scenario 1.5: Re-submission Overwrites Prior Roster ✅

**Given:** User already has a roster locked for this tournament; tournament still `roster_open`.

**When:** User calls `submit_tennis_roster(...)` again with different players and/or a different ace card.

**Then:** Existing row is overwritten (`ON CONFLICT (user_id, tournament_id) DO UPDATE`). If the ace card
changed, the previously-used card is released (`used_tournament_id = NULL`) and the new one is marked used.

**Status:** ⬜ Not tested

---

### Scenario 1.6: Roster Locked After Deadline ❌

**Given:** Tournament `status` has moved past `roster_open` (e.g. `in_progress`).

**When:** User calls `submit_tennis_roster(...)`.

**Then:** RPC raises `ROSTER_LOCKED`.

**Status:** ⬜ Not tested

---

## Module 2 — Standard Tournament Scoring (Grand Slam / Masters 1000)

> **Real scoring model** (`score-tennis-tournament/index.ts`):
>
> ```
> TIER_PTS = { 1: 2, 2: 3, 3: 4, 4: 6 }     // pts per round won, by player tier
> player_points = rounds_won * TIER_PTS[tier]
> ```
>
> `rounds_won` is an admin-entered integer (via `admin_enter_round_results`), independent of the
> `round_reached` label — the two are recorded together but `rounds_won` is what scoring actually reads.
> Round labels available: `r128, r64, r32, r16, qf, sf, runner_up, champion`.

### Scenario 2.1: Base Points, No Captain, No Ace Card

**Given:**

| Player | Tier | rounds_won | Points (rounds_won × TIER_PTS) |
|--------|------|-----------|----------------------------------|
| Player 1 | T1 | 7 (champion) | 14 |
| Player 2 | T2 | 5 (SF exit) | 15 |
| Player 3 | T2 | 3 (R16 exit) | 9 |
| Player 4 | T3 | 2 (R32 exit) | 8 |
| Player 5 | T3 | 0 (R1 exit) | 0 |
| Player 6 | T4 | 1 | 6 |
| Player 7 | T4 | 1 | 6 |

**When:** `score-tennis-tournament` runs for this roster (no `ace_card_type`, no captain set).

**Then:** `base_points = 58`, `captain_bonus = 0`, `ace_card_bonus = 0`, `total_points = 58`.

**Status:** ⬜ Not tested

---

### Scenario 2.2: Captain Bonus (Doubles Captain's Own Points)

**Given:** Same roster as 2.1. Player 1 (T1, 7 rounds won → 14 base pts) is nominated QF captain via
`set_tennis_qf_captain` while `status = 'qf_captain_open'` and Player 1 is not yet eliminated.

**When:** Scoring runs.

**Then:**
- Player 1 contributes `14` to `base_points` (counted once, as normal) **plus** `14` to `captain_bonus`
  (the code adds an equal amount for the captain slot) — net effect: Player 1's total contribution is `28`.
- `base_points = 58` (unchanged — captain's base points still counted normally in the base sum)
- `captain_bonus = 14`
- `total_points = 72`

**Status:** ⬜ Not tested

**Note:** there is no explicit "captain must have reached QF+" check inside the scoring function itself — the
guarantee comes structurally from `set_tennis_qf_captain`, which only allows nominating a captain who is not
yet `eliminated` at the moment the QF window is open (i.e., they've already survived to at least QF by
definition of when that window opens).

---

### Scenario 2.3: Captain Eliminated Before Nomination Window ❌ (rejected earlier, not a scoring case)

**Given:** Attempt to nominate a player as captain who is already `eliminated = true`.

**When:** `set_tennis_qf_captain(...)` called.

**Then:** RPC raises `PLAYER_ELIMINATED` — nomination itself is rejected, so this never reaches scoring.

**Status:** ⬜ Not tested

---

## Module 3 — Ace Cards

> One card per tournament (optional), one of each of the 4 types available per season per user
> (`tennis_ace_cards`, issued via `issue_season_ace_cards`). Real bonuses, per `score-tennis-tournament`:

| Card | Trigger | Bonus |
|------|---------|-------|
| `underdog_boost` | Any T3 or T4 player reaches SF, runner_up, or champion | Flat **+15** |
| `safety_net` | The roster's T1 player's `round_reached` is `r128` or `r64` (early exit) | Flat **+8** |
| `surface_specialist` | The nominated captain's `round_reached` is SF or better | Flat **+12** |
| `dark_horse_insurance` | Either T4 player has `rounds_won = 0` (0 base pts) | That player's points floored to **6** (per player, applied in `scorePlayer`, not a separate bonus line) |

### Scenario 3.1: `underdog_boost` Triggered

**Given:** Ace card = `underdog_boost`. T4 Player A reaches `round_reached='sf'`. Other players: standard.

**When:** Scoring runs.

**Then:** `ace_card_bonus = 15`, added once (flat, not per-player) on top of `base_points`.

**Status:** ⬜ Not tested

---

### Scenario 3.2: `underdog_boost` Not Triggered

**Given:** Ace card = `underdog_boost`. Best T3/T4 finish is `round_reached='r16'` (below SF).

**When:** Scoring runs.

**Then:** `ace_card_bonus = 0`. Card still marked used for the season (spent regardless of outcome).

**Status:** ⬜ Not tested

---

### Scenario 3.3: `safety_net` Triggered

**Given:** Ace card = `safety_net`. Roster's T1 player `round_reached = 'r64'`.

**When:** Scoring runs.

**Then:** `ace_card_bonus = 8`.

**Status:** ⬜ Not tested

---

### Scenario 3.4: `safety_net` Not Triggered

**Given:** Ace card = `safety_net`. T1 player `round_reached = 'qf'` (past the early-exit window).

**When:** Scoring runs.

**Then:** `ace_card_bonus = 0`.

**Status:** ⬜ Not tested

---

### Scenario 3.5: `surface_specialist`

**Given:** Ace card = `surface_specialist`. Captain's `round_reached = 'runner_up'`.

**When:** Scoring runs.

**Then:** `ace_card_bonus = 12` (in addition to any separate captain doubling from Module 2 — the two are
independent line items: `captain_bonus` and `ace_card_bonus`).

**Status:** ⬜ Not tested

---

### Scenario 3.6: `dark_horse_insurance` Floor

**Given:** Ace card = `dark_horse_insurance`. Tier4a player has `rounds_won = 0` (would score 0). Tier4b
player has `rounds_won = 2` (scores `2 × 6 = 12`, above the floor, untouched).

**When:** Scoring runs.

**Then:** Tier4a contributes `6` (floored) instead of `0` to `base_points`; Tier4b contributes its normal `12`.
No separate `ace_card_bonus` line — the floor is applied per-player inside `scorePlayer()`, folded into
`base_points` directly.

**Status:** ⬜ Not tested

---

## Module 4 — Masters Drop Rule (Season Rollup)

> Real rule (`get_player_box_leaderboard`, migration 201): once **≥5 standard tournaments**
> (`tournament_type IN ('grand_slam','masters_1000')`) reach `status='completed'` in the season, each user's
> **single worst** standard-tournament score is dropped from their season total. ATP Finals is never dropped
> and is always summed in full. This is a "drop-worst-1", not "best-N-of-M".

### Scenario 4.1: Drop Rule Active (≥5 Standard Tournaments Completed)

**Given:** 5 standard tournaments completed this season. A user's `tennis_tournament_scores.total_points`
across them: `[100, 800, 450, 50, 300]`. (Plus an ATP Finals score of `40`, separate and always counted.)

**When:** `get_player_box_leaderboard(...)` runs.

**Then:**
- `worst_dropped = 50` (the single minimum among the 5 standard scores)
- Standard total: `100+800+450+50+300 = 1700`, minus dropped `50` = `1650`
- `total_points = 1650 + 40 (ATP Finals, never dropped) = 1690`
- `tournaments_played = 6` (still counts all 6 rows, including the dropped one, in the played count)

**Status:** ⬜ Not tested

---

### Scenario 4.2: Drop Rule Inactive (Fewer Than 5 Standard Tournaments Completed)

**Given:** Only 2 standard tournaments completed this season. Scores: `[450, 900]`.

**When:** Leaderboard calculates.

**Then:** `worst_dropped = 0`. `total_points = 1350` (nothing dropped — the ≥5 threshold counts *completed
standard tournaments league-wide this season*, not per-user participation).

**Status:** ⬜ Not tested

---

## Module 5 — ATP Finals Predictor

> Real scoring model (`score-atp-finals/index.ts`): flat points per **correct** pick, summed. No thresholds,
> no tier labels.
>
> | Match type | Matches | Pts per correct pick | Max |
> |---|---|---|---|
> | Group | 1–12 | 3 | 36 |
> | Semifinal | 13–14 | 5 | 10 |
> | Final | 15 | 8 | 8 |
> | **Total possible** | 15 | — | **54** |

### Scenario 5.1: Two-Phase Submission Lock

**Given:** ATP Finals tournament `status = 'roster_open'` (repurposed as "group picks open" for this
tournament type).

**When (Phase 1):** User calls `submit_atp_finals_group_picks` with exactly 12 picks.

**Then:** Accepted. Calling `submit_atp_finals_knockout_picks` at this stage raises `KNOCKOUT_PICKS_LOCKED`
(requires `status = 'qf_captain_open'`, repurposed as "knockout picks open").

**When (Phase 2, after admin opens qf_captain_open AND all 12 group results entered):** User calls
`submit_atp_finals_knockout_picks` with exactly 3 picks (`match_number` 13–15).

**Then:** Accepted. If any group match still lacks a result, raises `GROUP_STAGE_INCOMPLETE`.

**Status:** ⬜ Not tested

---

### Scenario 5.2: Partial Correct Picks

**Given:** All 15 results entered. User got 8 of 12 group picks right, 1 of 2 SF picks right, missed the Final.

**When:** `score-atp-finals` runs.

**Then:** `total_points = (8 × 3) + (1 × 5) + (0 × 8) = 24 + 5 + 0 = 29`. `correct = 9` (stored in `breakdown`).

**Status:** ⬜ Not tested

---

### Scenario 5.3: Perfect Slate

**Given:** All 15 picks correct.

**When:** Scoring runs.

**Then:** `total_points = (12×3) + (2×5) + (1×8) = 36+10+8 = 54`. `correct = 15`.

**Status:** ⬜ Not tested

---

## Module 6 — UI End-to-End Flow

Real screens (no dedicated design doc names — actual files under `src/screens/tennis/`):
`TennisHomeScreen`, `TennisTournamentScreen`, `PlayerBoxScreen`, `TennisAdminScreen`,
`TennisAtpFinalsScreen`, `TennisProfileView`, `TennisLeaderboardScreen`.

A tennis Player Box is created the same way an F1 paddock is (verified 2026-07-26): Clubhouse home →
"Add competition" → SPORT selector → **Tennis** → simplified form (name only, no tournament/format dropdowns
for non-football sports) → "Create competition".

### Scenario 6.1: Create a Player Box

**Given:** User is a Clubhouse member, on `/clubhouse`.

**When:** Click "Add competition" → select Tennis → enter a name → "Create competition".

**Then:** `create_player_box` RPC (migration 197) fires; user is routed into `PlayerBoxScreen`/`TennisHomeScreen`
for the new box; box appears in the Clubhouse's competition list.

**Status:** ⬜ Not tested (F1 equivalent verified 2026-07-26; tennis not yet exercised via this exact UI path —
prior tennis verification in Task #11 used direct RPC calls, not the "Add competition" modal)

---

### Scenario 6.2: Submit a Roster via UI

**Given:** A Player Box exists, a tournament inside it is `roster_open`.

**When:** Navigate to `TennisTournamentScreen`, pick 1 T1 / 2 T2 / 2 T3 / 2 T4 player, optionally select an ace
card, save.

**Then:** `submit_tennis_roster` fires; UI reflects "roster locked" state; re-opening the screen shows the
saved picks via `get_tennis_tournament_for_user`.

**Status:** ⬜ Not tested

---

### Scenario 6.3: QF Captain Selection Window

**Given:** Tournament `status = 'qf_captain_open'`.

**When:** User opens `TennisTournamentScreen`, selects a captain from their surviving roster players.

**Then:** `set_tennis_qf_captain` fires; UI shows the captain badge; picker excludes eliminated players
(via `surviving_players` from `get_tennis_tournament_for_user`).

**Status:** ⬜ Not tested

---

### Scenario 6.4: Leaderboard Display

**Given:** At least one standard tournament `completed` and scored for the Player Box.

**When:** Navigate to `TennisLeaderboardScreen`.

**Then:** Standings render via `get_player_box_leaderboard`; per-tournament breakdown via
`get_tennis_season_summary` matches the `tennis_tournament_scores` rows.

**Status:** ⬜ Not tested

---

### Scenario 6.5: ATP Finals Two-Login Picker UI

**Given:** ATP Finals tournament exists for the season, `status='roster_open'`.

**When:** Navigate to `TennisAtpFinalsScreen`, submit 12 group picks.

**Then:** UI locks the 12 group picks as read-only once phase changes to knockout; 3 knockout pickers unlock
only after admin opens `qf_captain_open` and all 12 group results are entered.

**Status:** ⬜ Not tested

---

## Test Run Log

| Date | Tester | Module | Scenario | Result | Notes |
|------|--------|--------|----------|--------|-------|
| 2026-06-28 | Claude | Pre-conditions | Deploy, secret, find, open, sync, verify tiers | ✅ Pass | Required an unplanned auth fix (PRs #662/#663) before any function call would succeed |
| 2026-07 | Claude | Scoring loop | Real Player Box + roster + `score-tennis-tournament` call (session Task #11) | ✅ Pass | Verified via direct RPC/API calls, not yet via the "Add competition" UI path |
| 2026-07-26 | Claude | Doc correction | Reconciled this document's scoring scenarios against actual `score-tennis-tournament`/`score-atp-finals` source | ✅ Done | Prior version's point values (round-table, ace-card multipliers, ATP threshold tiers) were fictional — did not match deployed code. See "Correction note" above |
| — | — | Modules 1–6 | All numbered scenarios above | ⬜ Pending | Awaiting a dedicated tennis smoke pass exercising each scenario individually (roster edge cases, ace card variants, drop rule, ATP Finals full cycle, UI flow) |

---

Last Updated: **2026-07-26** (scoring model corrected to match deployed code; UI E2E module added; roster validation scenarios expanded)
