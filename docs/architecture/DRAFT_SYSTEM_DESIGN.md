# Draft System Design
**Status**: Revised — Aligned with Session 61 product decisions  
**Last Updated**: 2026-05-31  
**Scope**: Per-league only. All mechanics described here are strictly isolated to a single fantasy league.

---

## 1. Two Axes: Mode × Format

Every league is defined by the intersection of two independent choices made at creation time.

### League Mode

| | Classic | Draft |
|---|---|---|
| **Player repeats across managers** | Allowed — any manager can hold the same player | Forbidden — each player belongs to one manager at a time |
| **Draft runs** | None | 1 per phase (see Format below) |
| **Player-repeat relaxation** | N/A | Active in Cup format as pool shrinks |
| **Market** | Open pool, any player, any time | FCFS from unallocated players only; eliminated-club restriction applies in Cup |

### Tournament Format

| | League | Cup |
|---|---|---|
| **Structure** | Season-long, round-robin | Group stage → knockout rounds |
| **Draft phases** | One draft at season start (Draft mode only) | Two drafts: group start + group→knockout transition (Draft mode only) |
| **Club cap relaxation** | Fixed at 3 (no shrinkage) | Active — cap rises as clubs are eliminated |
| **Player-repeat relaxation** | N/A | Active in Draft mode |
| **Eliminated club restriction** | N/A | Active in both modes — cannot buy from eliminated clubs |

---

## 2. Rules That Always Apply (mode- and format-agnostic)

**Position constraints** — enforced at all times, no exceptions:
- Exactly 1 GK in the starting 11
- 3–5 DEF
- 2–4 MID
- 1–2 FWD
- Allocation engine: GK ≤ 2, DEF ≤ 5, MID ≤ 5, FWD ≤ 3 in full squad of 15

**Club cap** — maximum players from the same club in a squad, enforced on buys and at allocation:
- Default: **3**
- In Cup format, relaxes as clubs are eliminated (see Section 6.2)

---

## 3. Draft Submission — No Constraints by Design

When a draft is open, managers submit a ranked list of up to 30 players. **There are no constraints during submission.** Managers can select:
- Any number of players from the same position
- Any number of players from the same club
- Players of any price
- Any combination of value, position, and club

**Why this is correct:** Managers use the submission strategically. Over-selecting a popular position (e.g. 8 midfielders) increases the odds of securing multiple contested picks from that group. Picking 5 players from the same club hedges against the club-cap restriction — the engine will allocate up to the cap and ignore the rest. Constraints applied during submission would limit strategic depth.

**What happens at allocation time** is where constraints are enforced (see Section 4).

---

## 4. Draft Allocation Engine

### Trigger
Runs at the draft deadline. If the admin has not manually triggered it, a cron job fires automatically **4 hours before the first match of the relevant phase** (group stage or knockout stage). The job is idempotent: if allocation has already run for this league and phase, the cron does nothing and the admin trigger is disabled.

### Algorithm

```
1. Fetch all draft_submissions for the league
2. Build conflict map: player_id → [managers who listed them]
3. For each contested player: randomly select one winner
4. Per manager, walk ranked list sequentially:
   a. Skip: player already taken by another manager
   b. Skip: position cap would be exceeded (GK ≤ 2, DEF ≤ 5, MID ≤ 5, FWD ≤ 3)
   c. Skip: adding this player would exceed the club cap (default: 3)
   d. Skip: cumulative value of already-allocated players exceeds £100M
   e. Stop: when 15 players allocated or list exhausted
5. Write results → draft_allocations
6. Flag unresolved_slots for managers with < 15 players
7. Write gazette_entry (headline + bullets + full table)
8. Push notification to all managers
```

### Incomplete Squads
If a manager's ranked list is exhausted before 15 players are allocated (e.g. they listed only attackers and ran out of valid FWD slots), they enter the **Squad Recovery** screen. Here, FCFS applies: available unallocated players are shown filtered by needed positions, and the normal £100M budget applies.

### Idempotency Guard
Once allocation has run for a given league + phase:
- The admin "Run Allocation" button is replaced by a status label: `"Allocation complete — [timestamp]"`
- No API pathway allows a second run
- The cron skips the job silently

---

## 5. Post-Draft Market (First-Come-First-Served)

After allocation, managers adjust squads through the open market. Rules differ by mode:

### Classic Mode
- Any player can be bought or sold at any time within transfer windows
- No uniqueness constraint — two managers can hold the same player
- In Cup format: cannot buy players from eliminated clubs (existing holdings kept)

### Draft Mode
- Only unallocated players (not held by any manager in this league) are available to buy
- In Cup format: cannot buy players from eliminated clubs (existing holdings kept)
- Player-repeat relaxation applies (see Section 6.1)

### Transfer constraints (both modes)
- Position limits enforced on every buy
- Club cap enforced on every buy (with cup relaxation if applicable)
- Budget enforced on every buy
- Transfer window must be open

---

## 6. Cup Format Relaxation Formulas

Two separate formulas exist for Cup format. They are independent of each other.

### 6.1 Player-Repeat Relaxation (Draft mode only)

As clubs are eliminated, the pool of available players shrinks. In Draft mode, the no-repeat rule can become impossible to satisfy near the final. This formula auto-relaxes the rule based on pool pressure.

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

When the tier changes, a gazette entry is published automatically.

**Formula examples:**

| Scenario | Managers | Pool | Pressure | Result |
|---|---|---|---|---|
| QF, 12 managers | 12 | 200 | 0.90 | 1 repeat |
| SF, 12 managers | 12 | 100 | 1.80 | 3 repeats |
| SF, 4 managers | 4 | 100 | 0.60 | No repeats |
| Final, 12 managers | 12 | 50 | 3.60 | Rule dropped |

All constants live in `league_config` and can be adjusted per-league without a code change.

### 6.2 Club-Cap Relaxation (both modes)

As clubs are knocked out, the maximum 3-players-per-club rule becomes overly restrictive — fewer clubs means managers naturally concentrate on survivors. This formula raises the cap in tiers.

| Active clubs remaining | Club cap |
|---|---|
| > 8 | 3 (default) |
| ≤ 8 | 4 |
| ≤ 4 | 5 |
| ≤ 2 (final) | No cap |

Applies to: buys on the market, and to the knockout-stage allocation engine.

---

## 7. Club Elimination Detection

### Source of truth: Forza Football API

A club is considered eliminated when the API shows no remaining fixtures for that club in the tournament. Specifically:

```
eliminated_at = NOW()  when:
  API returns 0 future fixtures for this club in this tournament
  AND the tournament has advanced at least one completed round
  AND at least 1 other club has future fixtures in the same tournament
```

**Safety guard — benefit of doubt:** If the API returns no future fixtures for **all** clubs (e.g. fixtures for the next round haven't been published yet), no club is treated as eliminated. The system only eliminates a club when there is positive evidence it is out — i.e. other clubs demonstrably have upcoming fixtures while this one does not.

This check runs as part of the cron pipeline after each round's results are ingested.

---

## 8. Cup Format — Two-Phase Draft (Draft mode only)

### Phase 1 — Group Stage
Standard draft flow. Admin sets a deadline → managers submit 30 picks → allocation runs.

### Phase 2 — Knockout Stage
Same flow as Phase 1, but:
- Admin sets a new deadline
- **Precondition enforced:** Phase 2 allocation cannot run until Phase 1 allocation is confirmed complete
- **Idempotency enforced:** Cannot run if Phase 2 allocation has already run for this league
- Managers submit 30 new picks from the surviving club pool (club-cap relaxation already in effect)
- Same allocation engine runs, rebuilding squads for the knockout phase
- After allocation: FCFS market with player-repeat relaxation + club-cap relaxation

### League Format
Only Phase 1 exists. No second draft concept applies.

---

## 9. Admin Panel — Mode-Driven Display

**Classic mode:** The Draft section is hidden from the admin panel entirely. No draft lifecycle steps are shown.

**Draft mode, League format:** One draft section — set deadline, run allocation, status.

**Draft mode, Cup format:** Two draft sections shown sequentially:
- "Group Stage Draft" — always available
- "Knockout Draft" — locked with a status indicator until Group Stage allocation is confirmed complete

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

-- Transfer window state per league per round
transfer_windows (
  id UUID PRIMARY KEY,
  league_id UUID REFERENCES leagues(id),
  round_number INT,
  opens_at TIMESTAMPTZ,
  closes_at TIMESTAMPTZ,
  window_type ENUM('standard', 'unlimited', 'cup_group', 'cup_elimination'),
  transfers_remaining INT      -- NULL = unlimited
)

-- Cup pool: clubs still active in the cup (derived from Forza API)
cup_active_clubs (
  id UUID PRIMARY KEY,
  league_id UUID REFERENCES leagues(id),
  club_id TEXT,
  eliminated_at TIMESTAMPTZ    -- NULL = still active; set by cron after each round
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

### Default `league_config` rows (seeded on league creation)

```json
{ "draft_list_size": 30 }
{ "transfer_limit_per_round": 5 }
{ "cup_transfer_limit": 3 }
{ "swap_window_hours": 48 }
{ "club_cap_default": 3 }
{ "club_cap_tier1_threshold": 8, "club_cap_tier1_value": 4 }
{ "club_cap_tier2_threshold": 4, "club_cap_tier2_value": 5 }
{ "club_cap_tier3_threshold": 2, "club_cap_tier3_value": null }
{ "relaxation_base": 0.6 }
{ "relaxation_scale": 40 }
{ "relaxation_tier2_mult": 1.4 }
{ "relaxation_tier3_mult": 1.8 }
{ "relaxation_repeats": [0, 1, 3, null] }
```

---

## 11. Gazette Integration

**Draft report** fires automatically from the allocation engine and writes a `gazette_entries` row:

```
HEADLINE:  "DRAFT SETTLED: Salah, Haaland & Mbappé decided by the lottery gods"

BULLETS:
• Salah (wanted by 4 managers) → allocated to [Manager X]
• Haaland (3 managers) → allocated to [Manager Y]
• 2 managers enter with incomplete squads — first-come picks now open
```

**Relaxation tier changes** (player-repeat) also fire a gazette entry:
> *"RULE UPDATE: Pool pressure has reached 90% — managers may now hold up to 1 repeated player."*

**Club-cap tier changes** fire a gazette entry:
> *"RULE UPDATE: 6 clubs remain — the 3-player club limit has been raised to 4."*

---

## 12. Decision Log

| # | Decision | Alternatives | Why |
|---|---|---|---|
| 1 | No constraints during draft submission | Enforce position/club/budget at submission | Strategic depth — managers hedge by over-selecting positions/clubs; allocation engine resolves constraints fairly |
| 2 | Constraints enforced only at allocation | Client-side validation during submission | Allocation is the authoritative resolution point; pre-submission validation limits strategic choices |
| 3 | Two relaxation formulas: player-repeat + club-cap | Single unified formula | They solve different problems — player-repeat applies only in Draft mode; club-cap applies in both |
| 4 | Club elimination derived from Forza API | Admin-triggered manual elimination | Removes admin burden; self-maintaining; safety guard prevents false eliminations |
| 5 | 4-hour cron fallback before first match | 2-hour, 6-hour | Enough buffer for managers to act on incomplete squads; not so early it's disruptive |
| 6 | Second draft (knockout) same flow as first | Reverse-standings draft, auction | Consistency — managers know the mechanic; simpler to build and explain |
| 7 | Phase 2 draft locked until Phase 1 complete | Admin override allowed | Prevents data corruption; one-way lifecycle integrity |
| 8 | Classic mode: draft section hidden (not greyed) | Greyed out | Greyed controls imply "coming soon"; hidden is cleaner when the feature genuinely does not apply |
| 9 | All constants in `league_config` DB table | Hardcoded, env vars | Runtime-adjustable without redeploy; per-league tunable |

---

Last Updated: **2026-05-31**
