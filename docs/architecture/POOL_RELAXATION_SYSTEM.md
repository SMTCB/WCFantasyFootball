# Pool Relaxation System

**Two automatic relaxation formulas that prevent draft-mode leagues from becoming unplayable as the available player pool shrinks during a cup competition.**

---

## Overview

In draft-mode cup leagues, two hard constraints can become impossible to satisfy as clubs are eliminated:

1. **No-repeat rule** — each player belongs to exactly one manager. As the pool shrinks, managers may not be able to build or maintain a 15-player squad without repeating players already held by someone else.
2. **Club cap** — by default no more than 3 players from the same club. As clubs are eliminated, the remaining clubs get disproportionately large relative to the shrinking pool.

Both formulas fire automatically and are announced via gazette entries. Neither requires commissioner intervention.

---

## 1. Player-Repeat Relaxation (Draft mode + Cup format only)

### What it controls

`current_repeats_allowed` in `league_config` — the maximum number of squads that may simultaneously hold the same player. At Tier 0 (strict) this is 0 extra copies, meaning each player can be in exactly one squad.

### Formula

```
pressure  = (n_active_managers × squad_size) / available_pool_size
threshold = relaxation_base + (n_active_managers / relaxation_scale)
```

Where:
- `n_active_managers` — league members who have a squad (inactive members excluded — migration 75)
- `squad_size` — `leagues.squad_size`, default 15
- `available_pool_size` — players from clubs still active in the cup (not eliminated)
- `relaxation_base` — league_config key, default **0.6**
- `relaxation_scale` — league_config key, default **40**

### Tier table

| Tier | Condition | `repeats_allowed` | Effect |
|------|-----------|-------------------|--------|
| 0 | `pressure ≤ threshold` | `0` | Strict — each player held by at most 1 manager |
| 1 | `pressure > threshold` | `1` | 1 extra copy allowed (2 managers can hold the same player) |
| 2 | `pressure > threshold × tier2_mult` | `3` | Up to 4 managers can hold the same player |
| 3 | `pressure > threshold × tier3_mult` | `NULL` | No-repeat rule lifted entirely |

Default multipliers (configurable per league in `league_config`):
- `relaxation_tier2_mult` = **1.4**
- `relaxation_tier3_mult` = **1.8**
- `relaxation_repeats` = `[0, 1, 3, null]`

### When it fires

`apply_relaxation_state()` is called by the `calculate-relaxation` Edge Function, which is triggered by `eliminate-cup-club` after each club elimination. The gazette entry is written **only when the tier actually changes** — not on every elimination.

### Enforcement point

`process-transfer` Edge Function (lines 386–432):
1. Counts how many squads in the league already hold the player being bought
2. Reads `current_repeats_allowed` from `league_config`
3. Compares: if `existing_holders > repeats_allowed` → reject with error
4. `NULL` = no check (Tier 3)
5. Missing key → treated as `0` (fail-closed)

### SQL functions

| Function | Purpose | Side effects |
|----------|---------|--------------|
| `calculate_relaxation_state(p_league_id)` | Pure read — returns pressure/tier/state as JSON | None |
| `apply_relaxation_state(p_league_id)` | Calculates then persists result to `league_config` | Writes `current_relaxation_tier` + `current_repeats_allowed` |

### `league_config` keys written by `apply_relaxation_state`

| Key | Type | Description |
|-----|------|-------------|
| `current_relaxation_tier` | integer (0–3) | Current tier for display |
| `current_repeats_allowed` | integer or `null` | Enforcement value read by `process-transfer` |

### React hook: `useRelaxationState`

**File:** `src/hooks/useRelaxationState.js`

Two-query pattern:
1. Calls `calculate_relaxation_state()` RPC — live pressure/threshold for display
2. Reads `current_repeats_allowed` + `current_relaxation_tier` from `league_config` — authoritative enforcement values

Subscribes to `gazette_entries` INSERT events via Supabase Realtime to re-fetch when tier changes.

Returns:
```js
{
  loading: boolean,
  repeatsAllowed: 0 | 1 | 3 | null,
  tier: 0 | 1 | 2 | 3,
  pressure: number,        // e.g. 0.72
  threshold: number,       // e.g. 0.63
  availablePool: number    // player count from active clubs
}
```

### UI display

Pool pressure banner shown on `DraftScreen` and `DraftRecoveryScreen`:

| Pressure | Colour | Message |
|----------|--------|---------|
| ≥ 0.9 | Red | Pool critical — up to N repeats allowed |
| ≥ 0.7 | Orange | Pool under pressure |
| < 0.7 | Green | Pool healthy |

---

## 2. Club-Cap Relaxation (all leagues, cup format only)

### What it controls

The maximum number of players from the same club a manager may hold. Enforced at: market buys (`process-transfer`), auction wins (`confirm_auction_win`), and draft allocation (`run-draft-lottery`).

### Formula

Determined by `get_club_cap(p_league_id, p_matchday_id DEFAULT NULL)`.

**Round-specific lookup (migration 158):**

First queries `club_cap_rules(tournament_id, round_suffix, cap, label)`. `round_suffix` is extracted as `split_part(matchday_id, '-', 2)` (e.g. `'429-r6'` → `'r6'`).

**Seeded values for WC 429 + int'l friendly 623:**

| Round suffix | Stage | Club cap |
|---|---|---|
| r1 – r4 | Group stage | 3 |
| r5 | Round of 16 | 4 |
| r6 – r7 | QF / SF | 5 |
| r8 | Final + 3rd place | No cap |

**Fallback (cup-based, for older leagues without `club_cap_rules` rows):**

| Active clubs remaining | Club cap |
|---|---|
| > 8 | 3 |
| ≤ 8 | 4 |
| ≤ 4 | 5 |
| ≤ 2 (Final) | No cap |

### Gazette notifications

Club-cap tier changes also fire gazette entries (same trigger path as player-repeat — `eliminate-cup-club` → `calculate-relaxation` Edge Function).

---

## 3. Implementation Map

```
Club eliminated
    └─► eliminate-cup-club (Edge Function)
            └─► calculate-relaxation (Edge Function)
                    ├─► apply_relaxation_state() [SQL]
                    │       ├─► Writes current_relaxation_tier to league_config
                    │       └─► Writes current_repeats_allowed to league_config
                    └─► gazette_entries INSERT (only if tier changed)
                            └─► Realtime → useRelaxationState re-fetches

Player buy attempted
    └─► process-transfer (Edge Function)
            ├─► Counts existing_holders for this player in this league
            ├─► Reads current_repeats_allowed from league_config
            └─► Rejects if existing_holders > repeats_allowed

Club cap check (buy / allocation / auction win)
    └─► get_club_cap(league_id, matchday_id) [SQL]
            ├─► Queries club_cap_rules by (tournament_id, round_suffix)
            └─► Falls back to cup active-clubs count
```

---

## 4. Configuration Reference

All keys live in `league_config (league_id, config_key, config_value JSONB)`.

### Seeded at league creation (migration 02)

| Key | Default | Description |
|-----|---------|-------------|
| `relaxation_base` | `0.6` | Base threshold before manager-count adjustment |
| `relaxation_scale` | `40` | Divisor for manager-count adjustment |
| `relaxation_tier2_mult` | `1.4` | Pressure multiplier to enter Tier 2 |
| `relaxation_tier3_mult` | `1.8` | Pressure multiplier to enter Tier 3 |
| `relaxation_repeats` | `[0, 1, 3, null]` | Values for each tier (index = tier) |

### Written at runtime by `apply_relaxation_state`

| Key | Type | Description |
|-----|------|-------------|
| `current_relaxation_tier` | integer | Current active tier (0–3) |
| `current_repeats_allowed` | integer or `null` | Enforced by process-transfer |

### Written at league creation (cup leagues, migration 158)

`club_cap_rules` table rows keyed by `(tournament_id, round_suffix)`.

---

## 5. Migration History

| Migration | Change |
|-----------|--------|
| `07_relaxation_formula.sql` | `calculate_relaxation_state` + `apply_relaxation_state` SQL functions; initial config seeds |
| `06_cup_pool_management.sql` | `get_cup_pool_stats(league_id)` — available players + active clubs count |
| `74_draft_cup_fixes.sql` | Pressure formula uses `leagues.squad_size` instead of hardcoded 15 |
| `75_active_members_relaxation.sql` | `n_managers` counts only members with a squad (inactive members excluded) |
| `121_session78_dd_corrections.sql` | DR1: `process-transfer` reads from `league_config` not the non-existent `relaxation_state` table |
| `158_club_cap_per_round.sql` | `club_cap_rules` table; `get_club_cap()` updated to accept `p_matchday_id`; seeded for 429 + 623 |

---

## Related Documents

- [DRAFT_SYSTEM_DESIGN.md](DRAFT_SYSTEM_DESIGN.md) — Draft allocation algorithm; relaxation in context of draft flow
- [TRANSFER_WINDOW_SYSTEM.md](TRANSFER_WINDOW_SYSTEM.md) — Transfer windows and per-round limits
- [FANTASY_POINTS_SCORING_LAYER.md](FANTASY_POINTS_SCORING_LAYER.md) — Scoring reference

---

Last Updated: **2026-06-08** (migration 158 — club_cap_rules table; get_club_cap matchday-aware)
