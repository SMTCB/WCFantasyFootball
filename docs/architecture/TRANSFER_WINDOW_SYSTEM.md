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

**Only BUYs count** against the per-round free transfer limit. Sells are always free.

Free buy counts are tracked in `squads.round_transfers[current_matchday_id]` (a JSONB key per round), incremented atomically inside `execute_transfer_atomic`. A new round key starts at 0 — no manual reset needed.

Enforcement flow (inside `execute_transfer_atomic`):
```
SELL: skip limit check entirely — sells are free, counter never touched.

BUY:
1. If p_matchday_id is null or not a real '-rN' round → skip limit (pre-competition bypass)
2. If squads.initial_build_complete is false → skip limit (initial build exemption, see below)
3. Read transfers_per_round from league_config (default 3)
4. If current round = transfer_wildcard_round → skip limit, allow
5. Read squads.round_transfers[current_matchday_id]
6a. If count < transfers_per_round → proceed, increment round_transfers counter
6b. If count >= transfers_per_round → PENALTY BUY: proceed, increment
    squads.penalty_transfers[current_matchday_id] instead (no rejection)
```

**Penalty transfers** — buys beyond the free limit are allowed but incur a point deduction at end-of-round scoring. Cost is in `league_config.transfer_penalty` (default `4`; supports flat number or escalating array like `[1,2,4]`). See [TRANSFERS_AND_LINEUP_GUIDE.md](TRANSFERS_AND_LINEUP_GUIDE.md) for full details.

### Initial build exemption

**Table**: `squads` · **Column**: `initial_build_complete boolean NOT NULL DEFAULT false`

Managers whose draft allocation produced fewer than 15 players (due to wish-list overlaps with other managers) are not penalised by the per-round limit while they complete their squad.

**When the latch flips**: inside `execute_transfer_atomic`, in the same atomic `UPDATE` that adds the 15th player. The check is `array_length(v_new_players, 1) >= 15` after a buy — the moment it is true, `initial_build_complete` is set to `true` in the same DB write.

**It never resets**. Selling players back below 15 does not flip the latch back to `false`. This prevents the abuse case where a manager deliberately sells a full squad down to claim unlimited transfers.

```
initial_build_complete = false  →  no transfer limit (squad never been full)
initial_build_complete = true   →  normal 3/round limit applies permanently
```

Backfill (migration 141): any squad already at 15+ players at migration time was set to `true` immediately.

---

## Commissioner Free Window (Unlimited Override)

The commissioner can open a time-bounded unlimited transfer window at any point during the season. When active it bypasses:
- The matchday deadline lock (`WINDOW_CLOSED`)
- The live-fixture lock (`WINDOW_LOCKED`)
- The 3/round transfer limit

Normal constraints still apply: budget, position cap, club cap, draft ownership.

### Typical use cases
- Between group stage and knockout stage (the most common need)
- After a draft runs late and managers need time to adjust
- Any period where the league dynamics call for a "free pass"

### How it works

**Creating**: Commissioner opens Admin → Lifecycle Ops → **FREE TRANSFER WINDOW** card → sets a close time → clicks OPEN FREE WINDOW. This inserts a `transfer_windows` row with `window_type = 'unlimited'` and `transfers_remaining = NULL`.

**Enforcement in `process-transfer`**: At the start of the window check, the function queries for an active `transfer_windows` row with `window_type = 'unlimited'`, `opens_at <= NOW()`, `closes_at >= NOW()`. If found, all deadline/live-fixture checks are skipped and `limitMatchdayId` is set to `null` (no limit enforcement).

**UI via `get_transfer_window_status`**: The DB function reads manual `transfer_windows` rows first (priority over matchday deadlines). An active unlimited window returns `status: 'open'`, `transfers_remaining: null`. `TransferWindowBanner` shows **WINDOW OPEN · UNLIMITED** automatically.

**Closing**: Commissioner clicks CLOSE NOW in the admin panel, or the window expires at `closes_at` automatically.

**Data**: `transfer_windows(window_type='unlimited', transfers_remaining=NULL, round_number=NULL)`. `round_number` is nullable (migration 144) since free windows are not tied to a specific round. PostgreSQL treats multiple NULLs as distinct in unique constraints, so multiple windows can be created over the season.

---

## Additional Buy Locks

`process-transfer` enforces extra locks on the BUY path. **All are bypassed when a free window is active.**

| Lock | Trigger | Error code |
|---|---|---|
| Any live fixture | `fixtures.status = 'live'` within last 3h | `WINDOW_LOCKED` |
| Player's team in live fixture | Player's `forza_team_id` in a live fixture | `TRANSFER_LOCKED` |
| Eliminated club | Player's club is in `cup_active_clubs` with `eliminated_at IS NOT NULL` | `CLUB_ELIMINATED` |

SELL is never blocked by live fixture state or deadline lock — you can always offload a player.

---

## Recovery Window — Squad Lookup (process-transfer)

During the 6h recovery window (after a deadline passes, before the next round opens), `activeMatchdayId` resolves to the **next** round because `matchday_deadlines` filters `deadline_at >= now`. The user's existing squad was created for the **current** round.

**Without the fix (DD-H4):** Squad lookup with `matchday_id = nextRound` found nothing → a new empty squad (£100M, no players) was created for the next round → the manager effectively lost their roster for that transfer.

**Fix (session 66, `process-transfer/index.js`):** After the primary squad lookup fails, a fallback query fetches `ORDER BY created_at DESC LIMIT 1` (no matchday filter). If a previous-round squad is found, it is used — no empty squad is created. `execute_transfer_atomic` is called with `squad.matchday_id` (not `activeMatchdayId`) so transfer limit counts track against the correct round.

```
Transfer in recovery window:
  activeMatchdayId = '429-r3'  (next round)
  Squad lookup with matchday_id = '429-r3' → not found
  Fallback: ORDER BY created_at DESC → finds squad matchday_id = '429-r2'  ← use this
  execute_transfer_atomic(p_matchday_id: '429-r2')  ← limits checked against r2
```

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
| `transfers_per_round` | INT | `3` | Free BUY transfers per manager per round (sells are free) |
| `transfer_penalty` | INT or ARRAY | `4` | Point cost per BUY beyond the free limit (flat or escalating) |
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
| Pre-competition bypass (no configured matchday has started) | ✅ Migration 140 / PR #386 |
| Initial build exemption (`initial_build_complete` latch) | ✅ Migration 141 / PR #387 |
| Commissioner free window (unlimited override, any period) | ✅ Migration 144 / PR #393 |

---

## Related Documents

- [DRAFT_SYSTEM_DESIGN.md](DRAFT_SYSTEM_DESIGN.md) — Draft mode mechanics and allocation engine
- [STARTING_XI_AND_BENCH.md](STARTING_XI_AND_BENCH.md) — Lineup change rules (distinct from transfers)
- [docs/brand/admin-tab/LIFECYCLE_OPERATIONS.md](../brand/admin-tab/LIFECYCLE_OPERATIONS.md) — Commissioner panel controls

---

Last Updated: **2026-06-08** (migration 157 — sells are free; penalty transfers replace hard block; enforcement flow updated; transfer_penalty config key added)
