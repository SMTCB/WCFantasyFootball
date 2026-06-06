# Draft System Design
**Status**: Current — aligned with migrations 141–143 and sessions 55–present  
**Last Updated**: 2026-06-06  
**Scope**: Per-league only. All mechanics described here are strictly isolated to a single fantasy league.

---

## 1. Two Axes: Mode × Format

Every league is defined by the intersection of two independent choices made at creation time.

### League Mode

| | Classic | Draft |
|---|---|---|
| **Player repeats across managers** | Allowed — any manager can hold the same player | Forbidden — each player belongs to one manager at a time |
| **Draft runs** | None | 1 per phase (see Format below) |
| **Player-repeat relaxation** | N/A | Active as pool shrinks (cup phase only) |
| **Market** | Open pool, any player, any time | FCFS from unallocated players only; eliminated-club restriction applies |

### Competition Format

| | Season (League) | Cup |
|---|---|---|
| **Structure** | Season-long, round-robin | Group stage → knockout rounds |
| **Draft phases** | One draft at season start (Draft mode only) | Two drafts: group start + group→knockout transition (Draft mode only) |
| **Knockout keep window** | Not applicable | Active — managers protect players between the two drafts |
| **Club cap relaxation** | Fixed at 3 (no shrinkage) | Active — cap rises as clubs are eliminated |
| **Player-repeat relaxation** | N/A | Active in Draft mode |

### Important: How Format Is Stored in the Database

Both Season and Cup leagues in Draft mode use `format = 'noduplicate'`. There is **no separate `format = 'cup'` value** in the current data model. The cup/season distinction is tracked via `cup_phase` and `knockout_draft_deadline`:

- `cup_phase = 'pre_cup'` → pre-draft (any league, before group lottery runs)
- `cup_phase = 'group_stage'` → after group draft, before knockout draft
- `cup_phase = 'pre_elimination'` / `'round_of_16'` / etc. → after knockout draft

A "season format" draft league is one where the commissioner never sets `knockout_draft_deadline` and never triggers the knockout draft. The platform cannot technically prevent this — it is a commissioner convention, not a hard constraint. In practice all current pilot leagues are tournament-based (WC, int'l friendlies) and use the full cup lifecycle.

---

## 2. Rules That Always Apply (mode- and format-agnostic)

**Position constraints** — enforced at all times, no exceptions:
- Exactly 1 GK in the starting 11
- 3–5 DEF; 2–4 MID; 1–2 FWD
- Allocation engine: GK ≤ 2, DEF ≤ 5, MID ≤ 5, FWD ≤ 3 in full squad of 15

**Club cap** — maximum players from the same club in a squad, enforced on buys AND at allocation:
- Default: **3**
- Relaxes in cup format as clubs are eliminated (see Section 6.2)
- **The allocation engine enforces the club cap** (fixed in migration 142 — was missing before)

---

## 3. Draft Submission — No Constraints by Design

When a draft is open, managers submit a ranked list of up to 30 players. **There are no constraints during submission.** Managers can select:
- Any number of players from the same position
- Any number of players from the same club
- Players of any price
- Any combination of value, position, and club

**Why this is correct:** Managers use the submission strategically. Over-selecting a popular position increases the odds of securing multiple picks from that group. The allocation engine resolves constraints fairly.

**What happens at allocation time** is where constraints are enforced (see Section 4).

---

## 4. Draft Allocation Engine

### Trigger
**Always manually triggered by the league commissioner** via Admin → Lifecycle Ops → Run Allocation. There is no automatic cron trigger. The `run-draft-lottery` pg_cron job is permanently disabled (`active = false`). The Edge Function hard-rejects cron-mode calls (no `league_id` in the request body) with a 405 response. Each league's timing is unique and sensitive to manager readiness.

### Algorithm

```
Pass 0 (knockout phase only — see Section 8):
  Pre-allocate kept players before the lottery

Pass 1 — Lottery allocation:
  1. Fetch all draft_submissions for the league
  2. Build conflict map: player_id → [managers who listed them]
  3. For each contested player: randomly select one winner (crypto-random)
  4. Per manager, walk ranked list sequentially:
     a. Skip: already handled in Pass 0 (kept player)
     b. Skip: player already taken by another manager
     c. Skip: position cap would be exceeded (GK ≤ 2, DEF ≤ 5, MID ≤ 5, FWD ≤ 3)
     d. Skip: adding this player would exceed the club cap (default: 3; relaxed in cup)
     e. Skip: cumulative value of already-allocated players exceeds £100M budget
     f. Stop: when 15 players allocated or list exhausted → record as dropped
  5. Write results → draft_allocations (commit point)

Pass 2 — Runner-up offers for dropped players:
  Dropped players are offered (in shuffled order) to other managers who listed them,
  subject to the same position/budget/club cap checks. Kept players are never in
  the dropped pool (they were resolved in Pass 0).

6. Write squads (upsert by league_id, user_id, matchday_id)
7. Flag unresolved_slots for managers with < 15 players
8. Write gazette_entry (headline + bullets + full table)
9. Push notification to all managers
```

### Club Cap Enforcement at Allocation

The allocation engine fetches `forza_team_id` for each player and tracks `clubCounts` per manager alongside `posCounts`. The cap is read from `get_club_cap()` which returns the relaxed value during cup knockout phases. This was missing before migration 142 — a manager could have received 6+ players from the same club. Now enforced identically to the market transfer cap.

### Incomplete Squads

If a manager's ranked list is exhausted before 15 players are allocated (e.g. they listed only attackers and ran out of FWD slots), they enter the **Squad Recovery** screen. FCFS applies: unallocated players are shown filtered by needed positions, normal £100M budget applies.

**Squad Recovery** calls `claim_draft_player(league_id, player_id, phase)`:
- Advisory lock per `league_id:phase` — prevents concurrent double-claims
- Validates: league membership, player ownership check (not already in another squad), position/budget caps
- **Updates the existing squad row** (created by the lottery with the correct `matchday_id`) — does NOT create a new squad row at a different matchday. Fixed in migration 142.
- Flips `squads.initial_build_complete = true` on the pick that reaches 15 players

### Idempotency Guard

Once allocation has run for a given `league_id + phase`, the "Run Allocation" button is replaced by a status label in the admin panel. No second run is possible through the UI. The function itself checks for pending submissions and returns `skipped: true` if none remain.

---

## 5. Post-Draft Market (First-Come-First-Served)

After allocation, managers adjust squads through the open market. Rules differ by mode:

### Classic Mode
- Any player can be bought or sold at any time within transfer windows
- No uniqueness constraint — two managers can hold the same player

### Draft Mode
- Only unallocated players (not held by any manager in this league) are available to buy
- No-repeat rule enforced at buy time via `current_repeats_allowed`
- In cup format: cannot buy players from eliminated clubs (existing holdings kept)

### Transfer constraints (both modes)
- Position limits enforced on every buy
- Club cap enforced on every buy (with cup relaxation if applicable)
- Budget enforced on every buy
- Transfer window must be open
- Per-round limit: 3 transfers (buy or sell) per matchday — see [TRANSFER_WINDOW_SYSTEM.md](TRANSFER_WINDOW_SYSTEM.md)

---

## 6. Cup Format Relaxation Formulas

### 6.1 Player-Repeat Relaxation (Draft mode only)

As clubs are eliminated, the available player pool shrinks. The no-repeat rule can become impossible to satisfy. This formula auto-relaxes based on pool pressure.

```
pressure  = (n_managers × 15) / available_pool_size
threshold = relaxation_base + (n_managers / relaxation_scale)
```

| Tier | Condition | Repeats allowed |
|---|---|---|
| 0 | pressure ≤ threshold | 0 (strict) |
| 1 | pressure > threshold | 1 |
| 2 | pressure > threshold × 1.4 | 3 |
| 3 | pressure > threshold × 1.8 | Unlimited |

### 6.2 Club-Cap Relaxation (both modes)

| Active clubs remaining | Club cap |
|---|---|
| > 8 | 3 (default) |
| ≤ 8 | 4 |
| ≤ 4 | 5 |
| ≤ 2 (final) | No cap |

Applies to: buys on the market AND the knockout allocation engine.

---

## 7. Club Elimination Detection

A club is eliminated when the API shows no remaining fixtures for that club in the tournament while at least one other club has upcoming fixtures. Runs as part of the cron pipeline after each round's results are ingested.

**Benefit of doubt:** if no club has upcoming fixtures (fixtures for the next round not yet published), no eliminations are recorded.

---

## 8. Cup Format — Two-Phase Draft (Draft mode only)

### Phase 1 — Group Stage Draft
Standard flow. Commissioner sets a deadline → managers submit 30 picks → commissioner runs the allocation manually.

### The Keep Window (Between Phases)

After the group-stage lottery runs and before the knockout lottery, managers can **protect up to N players** from their current squad. These players bypass the lottery entirely and are guaranteed in the knockout squad.

**Window conditions** (all must be true):
- League is `format = 'noduplicate'` + `league_mode = 'draft'`
- `cup_phase = 'group_stage'` — only set after group lottery runs; impossible to submit keeps during group-stage draft selection
- `knockout_draft_deadline` is set by the commissioner

**How it works:**
1. Commissioner sets the `knockout_draft_deadline` in the Admin panel (this also opens the keep window for managers)
2. Managers open their Squad screen → a purple "KNOCKOUT KEEP WINDOW" banner appears
3. Each player in the squad is shown with a shield toggle — greyed out if their club is eliminated
4. Managers select up to `knockout_keep_slots` players (default 5, configurable per league in `league_config`)
5. Submissions can be revised at any time until the knockout lottery runs

**Validation** (enforced by `submit_knockout_keeps` RPC):
- `cup_phase` must be `'group_stage'` — server-side guard matching the UI guard
- Player must be in the manager's current squad
- Player's club must not be eliminated
- Count must not exceed `knockout_keep_slots`

**During the knockout allocation (Pass 0)**:
- Kept players are pre-allocated into each manager's knockout squad
- Same position/budget/club cap checks apply — if a keep fails (e.g. cap exceeded), it is silently skipped and the manager fills that slot via their wish list
- `awardedTo[pid] = uid` locks the player out for all other managers
- Pass 1 and Pass 2 skip any player in `keptPlayerIds`
- If no keep submissions exist for a league, Pass 0 is a complete no-op

**Isolation guarantee**: The keep mechanic is entirely additive to the existing draft flow. If no keep rows exist in `knockout_keep_submissions` for a league, the knockout allocation runs byte-for-byte identically to before migration 143.

### Phase 2 — Knockout Stage Draft

Same flow as Phase 1, but:
- **Precondition**: `cup_phase = 'group_stage'` (group allocation must have run)
- Commissioner sets a new `knockout_draft_deadline`
- **Before the lottery runs**: managers submit up to N keep picks (the keep window, above) AND a 30-pick wish list for remaining slots
- Same allocation engine runs with Pass 0 + Passes 1 and 2
- After allocation: group-stage squad player arrays are cleared so stale rows don't pollute the no-repeat check for the knockout market (migration 142)
- `cup_phase` is set to `'pre_elimination'` by `run-draft-lottery`

### Season Format Draft Leagues

Only Phase 1 exists. The commissioner never sets `knockout_draft_deadline` and never triggers the knockout lottery. The keep window banner never appears. The admin panel shows the Knockout Draft section (the UI cannot distinguish season from cup format), but it remains "Locked" until the group allocation runs, and the commissioner simply never uses it for a season league.

---

## 9. Admin Panel — Draft Controls

**Classic mode:** The Draft section is hidden from the admin panel entirely (`isDraft = league.format === 'noduplicate'` check).

**Draft mode — Group Draft section:**
- Shows when `format = 'noduplicate'`
- Locked while `cup_phase = 'pre_cup'` (before any allocation)
- Deadline input → Run Allocation button (commissioner-triggered only)
- After allocation: replaced by `"Allocation complete — [timestamp]"`

**Draft mode — Knockout Draft section:**
- Shows when `format = 'noduplicate'` AND (`cup_phase` is set and not `'pre_cup'` OR `knockout_draft_deadline` is set)
- **Locked** while `!allocationDone` (i.e., group lottery hasn't run yet) — shows "Locked — complete group allocation first"
- Once `allocationDone = true` (group draft ran → `cup_phase = 'group_stage'`): reveals deadline input + Run Allocation button
- Keep submission count chip: shown when `cup_phase = 'group_stage'` — shows how many managers have protected players
- After knockout allocation: replaced by `"✓ Knockout squads allocated"`

---

## 10. Data Model

### Tables

```sql
-- Manager's ranked preference submission (up to 30 players, no constraints)
draft_submissions (
  id UUID PRIMARY KEY,
  league_id UUID REFERENCES leagues(id),
  user_id UUID REFERENCES auth.users(id),
  phase TEXT DEFAULT 'group',         -- 'group' | 'knockout'
  player_ids TEXT[],                  -- ordered, index 0 = highest priority
  submitted_at TIMESTAMPTZ,
  status ENUM('pending', 'processed'),
  UNIQUE(league_id, user_id, phase)
)

-- Knockout phase keep picks — managers protect players from their group-stage squad
knockout_keep_submissions (
  id UUID PRIMARY KEY,
  league_id UUID REFERENCES leagues(id),
  user_id UUID REFERENCES auth.users(id),
  player_ids TEXT[],                  -- player IDs to carry into knockout squad
  submitted_at TIMESTAMPTZ,
  UNIQUE(league_id, user_id)          -- one submission per manager per league
)

-- Allocated squad post-lottery
draft_allocations (
  id UUID PRIMARY KEY,
  league_id UUID REFERENCES leagues(id),
  user_id UUID REFERENCES auth.users(id),
  phase TEXT DEFAULT 'group',
  allocated_players TEXT[],
  unresolved_slots INT DEFAULT 0,
  allocated_at TIMESTAMPTZ
)

-- Config: all tunable parameters, readable at runtime
league_config (
  id UUID PRIMARY KEY,
  league_id UUID REFERENCES leagues(id),
  config_key VARCHAR NOT NULL,
  config_value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(league_id, config_key)
)
```

### Relevant `league_config` keys for Draft

| Key | Default | Description |
|---|---|---|
| `draft_list_size` | `30` | Max players in a wish list submission |
| `knockout_keep_slots` | `5` | Max players a manager can protect per keep submission |

### `squads` table — draft-related columns

```sql
initial_build_complete  boolean  DEFAULT false
-- One-way latch: set true when squad first reaches 15 players (either via
-- run-draft-lottery for full allocations, or claim_draft_player on the final pick).
-- While false: per-round transfer limit is bypassed (manager is still building
-- their initial squad). Selling back below 15 does NOT reset this to false.
```

---

## 11. Gazette Integration

**Draft report** fires from the allocation engine after each phase:

```
HEADLINE:  "DRAFT SETTLED: 3 battles decided by the lottery"

BULLETS:
• [player] (wanted by 4 managers) → allocated to [Manager X]
• [player] (3 managers) → allocated to [Manager Y]
• 2 managers enter with incomplete squads — first available picks now open
```

**Relaxation tier changes** (player-repeat) and **club-cap tier changes** also fire gazette entries automatically.

---

## 12. Decision Log

| # | Decision | Alternatives | Why |
|---|---|---|---|
| 1 | No constraints during draft submission | Enforce at submission | Strategic depth — managers hedge by over-selecting |
| 2 | Constraints at allocation time only | Client-side validation | Allocation is the authoritative resolution point |
| 3 | Two relaxation formulas: player-repeat + club-cap | Single unified formula | They solve different problems and apply in different conditions |
| 4 | Club elimination from Forza API | Admin manual | Self-maintaining; benefit-of-doubt guard prevents false eliminations |
| 5 | Draft always manually triggered | Automatic cron | Timing is league-specific; admin must control the moment |
| 6 | Knockout draft same flow as group draft | Auction, reverse-standings | Consistency — managers know the mechanic |
| 7 | Phase 2 locked until Phase 1 complete | Admin override | One-way lifecycle integrity; prevents data corruption |
| 8 | Keep mechanic: additive Pass 0 | Separate code path | If no keeps exist, allocation is byte-for-byte identical to before |
| 9 | Keep window opens when knockout_draft_deadline is set | Separate "open window" admin action | Single control point; admin setting the deadline implies the window is open |
| 10 | All draft league formats stored as `noduplicate` | Separate `cup` format value | Simpler data model; `cup_phase` tracks the competition stage instead |

---

## Related Documents

- [TRANSFER_WINDOW_SYSTEM.md](TRANSFER_WINDOW_SYSTEM.md) — Transfer windows, per-round limits, initial build exemption
- [STARTING_XI_AND_BENCH.md](STARTING_XI_AND_BENCH.md) — Lineup changes (distinct from transfers)
- [FANTASY_POINTS_SCORING_LAYER.md](FANTASY_POINTS_SCORING_LAYER.md) — Scoring formula reference
- [H2H_COMPETITION_DESIGN.md](H2H_COMPETITION_DESIGN.md) — Head-to-head scheduling and standings

---

Last Updated: **2026-06-06** (migration 143 — knockout keep mechanic; club cap at allocation; claim_draft_player fix; format/mode axis clarification)
