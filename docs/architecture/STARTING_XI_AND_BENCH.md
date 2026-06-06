# Starting XI and Bench — Design & Rules

**Defines how managers select their starting lineup, how points are scored, and what rules govern substitutions during a matchday.**

---

## Core Concept

Every manager has a squad of 15 players. At any given matchday, 11 of those players form the **starting XI** — only these 11 score points. The remaining 4 are the **bench** — they hold their place in the squad but score 0 for the round.

There are no automatic substitutions. If a starting XI player doesn't play, their slot simply scores 0. Bench players never automatically enter the XI.

---

## Two Separate Operations

| | Transfer | Lineup change |
|---|---|---|
| What | Buy or sell a player on the market | Move a player between starting XI and bench |
| Counts against limit | Yes — `transfers_per_round` | No — free, no limit |
| Budget check | Yes | No |
| Deadline | Matchday deadline (`matchday_deadlines.deadline_at`) | Per-fixture kickoff |
| Points impact | None directly | Points deducted if subbing out a player who has already scored |

These are completely independent. A lineup change is **not** a transfer.

---

## Points Scoring

`calculate-scores` sums points only for players in `squads.starting_xi`.

```
round_total = SUM(player_match_stats.total_pts)
              WHERE player_id IN squads.starting_xi
              AND   matchday_id = current_round
```

For squads with no `starting_xi` set (legacy rows before this feature shipped): fall back to `squads.players` so existing squads are not broken.

---

## Lineup Change Rules

### What you can do

| Action | Allowed? | Condition |
|---|---|---|
| Move bench player into XI | ✅ | Player's fixture has not yet started |
| Move XI player to bench | ✅ | Always allowed; points deducted if player already scored |
| Move XI player to bench then back to XI | ❌ | Once subbed out, stays on bench until next matchday |
| Move bench player into XI after their fixture completed | ❌ | Cannot sub in a player who has already played this round |

### The points deduction rule

When a player is moved from XI to bench:
1. Check if their fixture this round is `completed`
2. If yes: query `player_match_stats` for their points in this round
3. Deduct that amount from `fantasy_points.total` for this manager + matchday
4. Add the player to `squads.lineup_locks[matchday_id]`

**The deduction is permanent for the round** — it cannot be reversed by moving the player back (which is blocked anyway).

### The lock rule (Reading A — player-specific, not round-wide)

When a player is subbed out (moved to bench), they are added to `squads.lineup_locks[matchday_id]`. A locked player cannot re-enter the XI until the next matchday.

Other bench players are not affected — you can still make other lineup changes, as long as the players being subbed in have not already played.

### Per-fixture kickoff lock

When a player's fixture kicks off (`fixtures.status` changes to `live`), that player is locked in their current position (XI or bench) for the duration of their fixture. A cron running every 5 minutes applies these locks.

A locked-in player (fixture started, still in XI) can be moved to bench, but:
- Their points will be deducted (since their fixture is in progress / will complete)
- They will be added to `lineup_locks` and cannot return until next matchday

A locked-out player (fixture started, currently on bench) cannot be subbed in.

---

## Data Model

### `squads` table additions

```sql
starting_xi             TEXT[]   DEFAULT '{}'   -- 11 player IDs, subset of players[]
lineup_locks            JSONB    DEFAULT '{}'   -- { "matchday_id": ["player_id", ...] }
round_transfers         JSONB    DEFAULT '{}'   -- { "matchday_id": count } (transfer counting)
initial_build_complete  boolean  DEFAULT false  -- one-way latch; see Transfer Window doc
```

### `starting_xi` validity constraints (enforced at `set_lineup`)

The resulting `starting_xi` after any change must satisfy:
- Exactly 11 players
- All players are in `squads.players` (owned by this manager)
- Position rules: 1 GK minimum, valid formation (3–5 DEF, 2–4 MID, 1–2 FWD)

---

## `set_lineup` Operation

Atomic DB function. Parameters: `p_squad_id`, `p_player_out` (to bench), `p_player_in` (to XI).

Validation sequence:
```
1. p_player_in is in squads.players (owned)
2. p_player_in is NOT in lineup_locks[current_matchday] (not locked out)
3. p_player_in's fixture has NOT completed this round
4. p_player_out is in starting_xi
5. Resulting starting_xi is formation-valid
6. IF p_player_out's fixture is completed → compute points → deduct from fantasy_points
7. Add p_player_out to lineup_locks[current_matchday]
8. Swap: remove p_player_out from starting_xi, add p_player_in
```

All steps execute inside a single transaction with `SELECT FOR UPDATE` on the squad row.

---

## Lineup Lock Cron

Runs every 5 minutes (piggyback on `ingest-match-events-live` cron).

Logic:
1. Find all fixtures that just moved to `live` or `completed`
2. For each affected league: find managers with those players in `starting_xi`
3. Set per-player lock: add to `lineup_locks[matchday_id]` for any player whose fixture has started
4. Do NOT auto-sub any bench player — no auto-sub mechanic exists

---

## UI Behaviour (Squad Screen)

- **Two zones**: starting XI (pitch view, 11 slots) and bench (bottom row, 4 slots)
- **Lock indicator**: padlock icon on players whose fixture has started
- **Tap to swap**: tap a bench player → select an XI player to swap with → confirm
- **Points deduction warning**: if the selected XI player has already scored this round, show: `"Moving [Name] to bench will deduct [X] pts from your round total. Continue?"`
- **Greyed out bench players**: cannot be tapped for sub-in if their fixture is completed
- **Locked XI players**: can still be tapped to sub out (with deduction warning), but a lock icon shows they've played

---

## Applies Equally to Both Competition Formats

These rules are identical for tournament-format (WC, UCL) and league-format (EPL, La Liga) competitions. No code branches. Any difference in timing is purely a function of when fixtures kick off — the same logic applies.

---

## Implementation Status

| Component | Status |
|---|---|
| `squads.starting_xi` column | ✅ Migration 107 |
| `squads.lineup_locks` column | ✅ Migration 107 |
| `set_lineup` DB function | ✅ Migration 107 |
| `calculate-scores` uses `starting_xi` | ✅ v19 (with `players[0..10]` fallback) |
| Lineup lock cron | ✅ `lock_lineups_for_fixture()` called by `ingest-match-events` |
| Squad screen UI split view | ✅ `SquadScreen.jsx` — lock icons, deduction warning |
| Points deduction logic | ✅ Inside `set_lineup` DB function |

---

## Related Documents

- [TRANSFER_WINDOW_SYSTEM.md](TRANSFER_WINDOW_SYSTEM.md) — Transfer windows and per-round limits
- [DRAFT_SYSTEM_DESIGN.md](DRAFT_SYSTEM_DESIGN.md) — Draft mode and squad allocation
- [FANTASY_POINTS_SCORING_LAYER.md](FANTASY_POINTS_SCORING_LAYER.md) — Full scoring formula

---

Last Updated: **2026-06-06** (transfer audit — initial_build_complete column added to squads schema reference)
