# Transfers & Lineup Changes — Complete Manager Guide

**Single reference covering transfer windows, per-round limits, lineup sub-in/sub-out, and live-match locks across all league modes (Classic / Draft) and competition formats (Tournament / Season).**

---

## Quick Navigation

- **When can I transfer?** → [Transfer Windows](#transfer-windows)
- **How many transfers do I get?** → [Per-Round Limits](#per-round-limits)
- **Classic vs Draft differences** → [Mode Differences](#classic-vs-draft-mode-differences)
- **Tournament vs Season differences** → [Format Differences](#tournament-vs-season-format-differences)
- **Sub-in / sub-out within a matchday** → [Lineup Changes](#lineup-changes-sub-inout)
- **Why am I blocked by a live game I don't care about?** → [Live-Game Locks](#live-game-locks)
- **Transfer limit does not apply for new teams** → [Initial Squad Build Exemption](#initial-squad-build-exemption)

---

## Transfer Windows

A **transfer** is a buy or sell on the market. It consumes budget and counts against your per-round limit. A **lineup change** (sub-in/sub-out) is entirely separate — see [Lineup Changes](#lineup-changes-sub-inout).

### When the window is open

The window is open between matchday deadlines:

```
  deadline_at (round N closes)
       │
       ├─── CLOSED for transfer_reopen_hours (default 6h)
       │    (scoring and stats are written during this period)
       │
       ▼
  reopen_at = deadline_at + 6h
       │
       ├─── OPEN — buy and sell freely
       │    (subject to live-game locks — see below)
       │
       ▼
  next deadline_at (round N+1 closes)
       │
       └─── CLOSED again ...
```

The exact reopen delay is configurable per league (`transfer_reopen_hours` in `league_config`, default 6h).

### What closes the window

| Trigger | Status | Who it affects |
|---|---|---|
| Matchday deadline reached | `CLOSED` | All managers in the league |
| Within `transfer_reopen_hours` after a deadline | `CLOSED` | All managers in the league |
| Any fixture with `status='live'` exists | Transfer blocked mid-window | **ALL leagues, any tournament** (see Live-Game Locks) |

---

## Per-Round Limits

Every manager gets **3 free buy transfers per round** by default.

| Config key | Default | Effect |
|---|---|---|
| `transfers_per_round` | `3` | Free BUY transfers allowed between two consecutive deadlines |
| `transfer_wildcard_round` | `null` | If set: the specified round has unlimited transfers |
| `transfer_penalty` | `4` | Point cost per extra buy beyond the free limit (see below) |

### What counts

**Only BUYs count against the free transfer limit. Sells are always free.**

This matches standard FPL behaviour — a "transfer" is conceptually a player-in, not player-out. Selling a player to free up a slot does not consume a transfer credit.

Free buy counts are tracked in `squads.round_transfers` (JSON: `{ "423-r2": 3 }`). A new round key starts at 0 — there's no manual reset needed.

### Penalty transfers (buys beyond the free limit)

Once the free allowance is exhausted, additional **buys** are still permitted but incur a **point deduction** at the end of the round (applied by `calculate-scores`). The cost is configured per league via `league_config.transfer_penalty`:

| Config value | Behaviour |
|---|---|
| `4` (default) | Flat 4 pts per extra buy — FPL standard |
| `1` | Flat 1 pt per extra buy |
| `[1, 2, 4]` | Escalating: 1st extra buy = 1 pt, 2nd = 2 pts, 3rd+ = 4 pts |

Penalty buys are tracked separately in `squads.penalty_transfers` (same JSON format as `round_transfers`). The deduction is applied once on the final scoring pass (`roundComplete = true`), not mid-round.

### Operations that are **exempt** from the transfer limit

The following player movements bypass `execute_transfer_atomic` entirely and **never** count against the free transfer limit or trigger penalty charges:

| Operation | Why exempt |
|---|---|
| Selling a player (market sell) | Only BUYS count |
| Auction win (`confirm_auction_win`) | Uses raw SQL UPDATE, bypasses counter |
| Auction sell (`sell_now` / cron expiry) | Uses raw SQL UPDATE, bypasses counter |
| Trade acceptance (`accept_trade_proposal`) | Uses raw SQL UPDATE, bypasses counter |
| Initial squad build (before 15-player latch) | `initial_build_complete = false` exempts all actions |
| Commissioner free window | `transfer_windows` row with `window_type = 'unlimited'` bypasses all limits |

### Commissioner Free Window

The commissioner can open a time-bounded **unlimited** transfer window at any point. When active:
- The transfer window banner shows **WINDOW OPEN · UNLIMITED**
- The matchday deadline lock is bypassed
- Live-fixture locks are bypassed (you can buy even during live matches)
- The 3/round transfer limit is bypassed

Budget, position caps, club caps, and draft ownership rules still apply.

This is used between the group stage and knockout stage, after a draft runs late, or whenever the league dynamics call for a free adjustment period. The window closes automatically at the time the commissioner set.

---

### Initial Squad Build Exemption

If your squad has **never reached 15 players**, transfer limits are not enforced. This covers:
- A manager whose draft allocation was fewer than 15 players (wish-list overlaps reduced their haul)
- A manager who joins after the round has started and needs to build their initial squad

The exemption uses a **one-way latch** (`squads.initial_build_complete`). The moment your squad first reaches 15 players, the latch flips permanently to true and the per-round limit applies from that point on. Selling players back down below 15 afterwards does **not** re-open the exemption — the latch never resets.

---

## Classic vs Draft Mode Differences

The transfer window timing and limits work **identically** in both modes. The only differences are in who can hold a player.

| Rule | Classic | Draft/Noduplicate |
|---|---|---|
| Can multiple managers hold the same player? | ✅ Yes | ❌ No — once bought, only you can hold them |
| No-repeat rule | None | Enforced at buy time via `current_repeats_allowed` |
| No-repeat relaxation | N/A | Automatic as cup clubs are eliminated (0 → 1 → 2 → unlimited) |
| Transfer window timing | Same | Same |
| Per-round transfer limit | Same | Same |
| Initial squad: how players are allocated | Self-select from market | Draft lottery first; market-style after allocation |

### Draft mode: before and after allocation

| Phase | How you get players |
|---|---|
| Before lottery runs | Submit a wish list of up to 30 players (no constraints during submission). Conflicts resolved by lottery. |
| After allocation | Normal transfer market. Buy = no-repeat rule applies. Sell = player returns to unallocated pool, anyone can buy. |

---

## Tournament vs Season Format Differences

Both formats share the same code path. The only practical difference is how deadlines are set.

| | Tournament (WC, UCL, Int'l Friendlies) | Season (EPL, La Liga) |
|---|---|---|
| Deadlines | Set per round, typically 2h before first match | Set at first fixture kickoff of the round |
| Admin transfer window UI | Shows "DEADLINE-CONTROLLED" — OPEN/CLOSE buttons have no enforcement effect | Commissioner uses manual OPEN/CLOSE controls |
| Reopen after scoring | `deadline_at + transfer_reopen_hours` | Same |
| Mid-round cup elimination | Club cap auto-adjusts; eliminated club's players cannot be bought | N/A (no elimination) |

---

## Lineup Changes (Sub-in/Sub-out)

A lineup change moves a player between your starting XI (11 players who score) and your bench (4 players who hold their spot but score 0). This is **NOT a transfer** — it does not consume a transfer credit, does not cost budget, and has no market interaction.

### When you can make lineup changes

| Condition | Can you change? |
|---|---|
| Transfer window is open, no live fixtures | ✅ Yes |
| Transfer window is open, some fixtures live | ✅ Yes — but only for players whose fixture hasn't started yet |
| Player's specific fixture is live or finished | ❌ Player is locked in current position |
| Player is in `lineup_locks[matchday_id]` (already been moved to bench this round) | ❌ Cannot re-enter XI until next matchday |

**Key point:** lineup changes work on a per-player, per-fixture basis. A player from Tuesday's game can be swapped even while Wednesday's games are live, as long as Tuesday's game is over.

### How sub-in/sub-out works within a multi-day matchday

For matchdays spread over 4–5 days (like WC group rounds), you can swap between day-groups as each day's fixtures finish:

```
Day 1 fixtures finish → Day 1 players in XI are locked, bench players cannot be brought in
Day 2 fixtures start → Day 2 players lock at their kickoffs
Day 2 fixtures finish → Day 2 players locked; you can swap any player from Day 3/4 still to come
```

You can make as many lineup changes as you want (no count limit), as long as each sub-in candidate's fixture hasn't started yet.

### The points deduction rule

If you move a player from your XI to bench **after their fixture has already completed**:
- Their scored points are deducted from your round total
- They enter `lineup_locks` — they cannot re-enter your XI until next matchday
- The deduction is permanent for that round (no undo)

### Bench priority (for scoring fallback)

If `starting_xi` is empty (legacy squad) or a player in `starting_xi` has no stats, the scoring engine uses `squads.players[0..10]` as a fallback. The order of players in `squads.players` determines bench priority for the auto-sub mechanic (highest-priority bench player = closest to index 10).

---

## Live-Game Locks

The `process-transfer` edge function applies two locks during buy actions.

### Lock 1 — Any live fixture blocks all buys (WINDOW_LOCKED)

```
While any fixture in your league's tournament has status='live' (kickoff within last 3h):
  → ALL buy actions are blocked for that league
  → Error: "Transfers locked while [Team A] vs [Team B] is in progress"
```

The check is scoped to `tournament_id` — only fixtures belonging to your league's competition can lock your window. Matches from unrelated tournaments in the database have no effect.

**Sells are never blocked** by live fixture state — you can always offload a player during a live game.

### Lock 2 — Player's own fixture blocks their buy (TRANSFER_LOCKED)

```
While the specific player you are buying has forza_team_id in a live fixture (last 3h):
  → That player's buy is blocked (price is frozen at kickoff)
  → Error: "Transfer cost locked — [Team A] vs [Team B] has started"
```

This is player-specific (you can still buy players from teams not currently playing) and is scoped to your league's `tournament_id`.

### Lock 3 — Eliminated club (CLUB_ELIMINATED)

```
In cup-format leagues only:
While the player's club appears in cup_active_clubs with eliminated_at IS NOT NULL:
  → Buy is blocked permanently for the remainder of the competition
  → Error: "[Club] has been knocked out — you cannot buy their players"
```

Existing holdings of eliminated-club players are kept — they score 0 going forward.

### Summary table

| Lock | Scope | Affects sells? | When it fires |
|---|---|---|---|
| `WINDOW_LOCKED` | All leagues, any tournament, any live game | No | Any `status='live'` fixture in DB |
| `TRANSFER_LOCKED` | Player-specific | No | Player's team is in a live fixture |
| `CLUB_ELIMINATED` | Cup leagues only | No | Player's club is eliminated |
| `WINDOW_CLOSED` | League-specific | Yes | After deadline, before reopen |
| ~~`TRANSFER_LIMIT_REACHED`~~ (retired) | — | — | **Buys beyond the free limit are no longer blocked.** They succeed as penalty transfers (see [Per-Round Limits](#per-round-limits)). |

---

## Live Screen — What Matches Appear

The LIVE tab shows fixtures filtered as follows:

1. **Determine your active matchday IDs** — for each tournament you have a league in, the most recent past `matchday_deadlines.deadline_at` identifies the current active round (`matchday_id`).

2. **Fixtures shown** — live (`status='live'`) fixtures whose `matchday_id` is in the active set computed in step 1. If no active matchday IDs can be resolved, falls back to all live fixtures across all your tournament IDs.

3. **Multi-league scenario (EPL + La Liga + Primeira Liga)** — if you have leagues for all three, fixtures from all three tournaments appear simultaneously on the live strip and on the main LIVE view, scoped to the current round of each.

The focused league selector (top right on the LIVE screen) controls which league's squad appears on the pitch and which Points Log is shown. It does not filter the fixture strip — all your leagues' active matches always appear there.

---

## Points Log — What It Shows

The POINTS LOG sub-screen is your **personal scoring tracker**, not a full match event log:

- Shows only players **in your squad** (the active league's `squads.players` array)
- Filtered to fixtures in the current active matchday (`player_match_stats WHERE player_id IN your_squad AND fixture_id IN active_fixtures`)
- Updates every 60 seconds while any fixture is live
- After full-time: stays visible for 6 hours post-kickoff using `status='finished'` fixtures as the data source
- If you have no squad for the active league, or no players in active fixtures, the log is empty

---

## Related Documents

- [TRANSFER_WINDOW_SYSTEM.md](TRANSFER_WINDOW_SYSTEM.md) — Deep technical spec (DB functions, config table)
- [STARTING_XI_AND_BENCH.md](STARTING_XI_AND_BENCH.md) — `set_lineup` RPC details, lock cron
- [DRAFT_SYSTEM_DESIGN.md](DRAFT_SYSTEM_DESIGN.md) — Draft lottery mechanics
- [FANTASY_POINTS_SCORING_LAYER.md](FANTASY_POINTS_SCORING_LAYER.md) — Scoring formula reference

---

Last Updated: **2026-06-08** (migration 157 — sells are now free (only BUYs count); penalty transfers beyond free limit; exempt operations table added; `TRANSFER_LIMIT_REACHED` retired)
