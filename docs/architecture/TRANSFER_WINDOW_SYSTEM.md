# Transfer Window System — Design & Rules

**Unified transfer window model for all league types (tournament + league-format) and league modes (Classic + Draft).**

---

## Core Principle

League mode (Classic vs Draft) has no effect on transfer window logic. Competition format (tournament vs league) has no effect either. **One code path handles everything.** The only differences are config values stored per-league in `league_config`.

---

## How Windows Open and Close

All leagues — tournament and league-format — use `matchday_deadlines` as the single source of window timing.

```
Window OPEN
    │
    ▼
deadline_at hits  →  Window CLOSED (recovery period)
    │
    ▼  (transfer_reopen_hours later)
Window OPEN again
    │
    ▼
next deadline_at hits  →  Window CLOSED ...
```

| Moment | Status shown to manager | Source |
|---|---|---|
| Between deadlines (after reopen) | OPEN · closes at next deadline | `matchday_deadlines.deadline_at` |
| 0 → `transfer_reopen_hours` after deadline | CLOSED · reopens at deadline + N hours | Config key |
| No future deadlines | CLOSED (season over) | — |

`deadline_at` is set when fixtures are synced:
- **Tournament-format** (WC, UCL): single deadline per round, typically ~2h before first match
- **League-format** (EPL, La Liga): deadline = kickoff of the first fixture of the round

Both use the same `get_transfer_window_status(p_league_id)` function which reads `transfer_reopen_hours` from `league_config`.

---

## Transfer Limits

```
transfers_per_round  →  max transfers between any two deadlines (config, default 3)
transfer_wildcard_round  →  one round with unlimited transfers (config; NULL = none)
```

Limits apply equally to Classic and Draft mode. There is no separate limit by mode.

### Wildcard round

At league creation, `transfer_wildcard_round` is auto-calculated:
- **Tournament-format (cup)**: `null` — no wildcard (cup rounds are too few)
- **League-format**: `CEIL(total_rounds / 2)` — halfway point of the season

Commissioner can override at any time by updating `league_config`.

### Counting transfers used

Each buy or sell increments `squads.round_transfers[current_matchday_id]` atomically inside `execute_transfer_atomic`. The counter is naturally reset when a new matchday opens a new squad row.

Enforcement flow (inside `execute_transfer_atomic`):
```
1. Read transfers_per_round from league_config
2. If current round = transfer_wildcard_round → skip limit, allow
3. Read squads.round_transfers[current_matchday_id]
4. If count >= transfers_per_round → reject with TRANSFER_LIMIT_REACHED
5. Otherwise → proceed, increment counter
```

---

## Additional Buy Locks

`process-transfer` enforces two extra locks on the BUY path only:

| Lock | Trigger | Error code |
|---|---|---|
| Any live fixture | `fixtures.status = 'live'` within last 3h | `WINDOW_LOCKED` |
| Player's team in live fixture | Player's `forza_team_id` in a live fixture | `TRANSFER_LOCKED` |
| Eliminated club | Player's club is in `cup_active_clubs` with `eliminated_at IS NOT NULL` | `CLUB_ELIMINATED` |

SELL is never blocked by live fixture state — you can always offload a player.

---

## DB Trigger — Silent Failure Guard

The `enforce_transfer_window` trigger on the `transfers` table is the old manual-window enforcement path. It is skipped for tournament leagues (those with `tournament_id`) via an early-exit condition:

```sql
IF EXISTS (SELECT 1 FROM leagues WHERE id = NEW.league_id AND tournament_id IS NOT NULL) THEN
  RETURN NEW;  -- tournament leagues use matchday_deadlines, not transfer_windows
END IF;
```

This prevents false exceptions if anything ever inserts into `transfers` for a tournament league while no `transfer_windows` row is active.

---

## Config Table Reference

All keys live in `league_config` keyed by `(league_id, config_key)`.

| Key | Type | Default | Description |
|---|---|---|---|
| `transfers_per_round` | INT | `3` | Max transfers per manager per round |
| `transfer_reopen_hours` | INT | `6` | Hours after deadline before window reopens |
| `transfer_wildcard_round` | INT or null | `null` (cup) / `ceil(n/2)` (league) | Round with unlimited transfers |
| `lineup_lock_per_fixture` | BOOL | `true` | Players lock individually at their fixture's kickoff |

Override any key per-league with a single SQL update — no code change or redeploy needed:
```sql
UPDATE league_config
SET config_value = '5'
WHERE league_id = 'your-league-id' AND config_key = 'transfers_per_round';
```

---

## What the Admin Panel Shows

| League type | Transfer controls |
|---|---|
| Any league with `tournament_id` | DEADLINE-CONTROLLED label. OPEN/CLOSE buttons hidden — they have no enforcement effect. |
| No `tournament_id` (rare) | Manual OPEN/CLOSE buttons. Commissioner sets dates explicitly. |

In practice all current leagues have a `tournament_id`, so the manual path is inactive.

---

## Implementation Status

| Component | Status |
|---|---|
| `get_transfer_window_status` reads config | ✅ Migration 106 |
| `execute_transfer_atomic` enforces `transfers_per_round` | ✅ Migration 106 |
| `round_transfers` counter on `squads` | ✅ Migration 106 |
| `transfer_wildcard_round` seeded null at creation | ✅ Migration 106 |
| `enforce_transfer_window` trigger guard | ✅ Migration 106 |
| `sync-fixtures` sets `deadline_at` for league-format | ✅ Already correct (MIN kickoff per round) |
| Manual window path (`transfer_windows` table) | ✅ Exists (fallback only) |
| Eliminated club restriction on buy | ✅ PR #262 |
| Dynamic club cap on buy | ✅ PR #262 |

---

## Related Documents

- [DRAFT_SYSTEM_DESIGN.md](DRAFT_SYSTEM_DESIGN.md) — Draft mode mechanics and allocation engine
- [STARTING_XI_AND_BENCH.md](STARTING_XI_AND_BENCH.md) — Lineup change rules (distinct from transfers)
- [docs/brand/admin-tab/LIFECYCLE_OPERATIONS.md](../brand/admin-tab/LIFECYCLE_OPERATIONS.md) — Commissioner panel controls

---

Last Updated: **2026-06-01** (session 62 — Phase A fully implemented)
