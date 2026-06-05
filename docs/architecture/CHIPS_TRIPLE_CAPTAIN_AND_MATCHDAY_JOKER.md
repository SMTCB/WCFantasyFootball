# Chips — Triple Captain & Matchday Joker

**Complete reference for the two active chips in Forza Fantasy League, covering mechanics, scoring rules, restrictions, and draft-mode behaviour.**

---

## Overview

Chips are special one-time (or once-per-matchday) boosts that give a scoring advantage. There are currently two active chips:

| Chip | When | Effect | Limit |
|---|---|---|---|
| **Triple Captain** | Any matchday | Your captain scores ×3 instead of ×2 | Once per season |
| **Matchday Joker** | Any matchday | A 16th player outside your squad scores ×2 for this matchday | Once per matchday |

A retired chip (Wildcard, ×10% budget boost) was removed in session 78 and is not available.

---

## Triple Captain

### What it does

Normally your captain scores ×2. With Triple Captain active, they score ×3.

### How to use it

1. Make sure you have a captain set on your squad.
2. Go to **Squad → Chips** and tap **Triple Captain** before the matchday deadline.
3. The chip activates immediately. The toggle shows ✓ active.
4. You can **deactivate** it again — but only before the deadline. After the deadline it is locked and the chip is consumed.

### Rules

| Rule | Detail |
|---|---|
| **One per season** | Once used in any round, it cannot be re-used for the rest of the season. Checking is per-league, not globally across all your leagues. |
| **Deadline lock** | Must be activated before `matchday_deadlines.deadline_at` for the active round. After the deadline you cannot change it. |
| **Toggle before deadline** | You can turn it on and off freely before the deadline — but the moment the deadline passes the chip is consumed and locked. |
| **Requires a captain** | If you haven't set a captain, the ×3 applies to no one. Always set a captain first. |
| **Applies to starting XI only** | The ×3 multiplier applies to your captain's actual match stats. If your captain is on the bench (not in starting XI), they score 0 that round — and so does the Triple Captain boost. |

### Captain reassignment (edge case)

If your captain isn't in the auto-resolved starting XI at the end of the round (e.g. they scored 0 minutes and were auto-subbed out), the scoring engine can reassign the captain bonus to the highest-scoring starter — but **only if that starter has > 0 points**. The Triple Captain multiplier moves with the reassigned captain.

### Stacking with Matchday Joker

If you set the Triple Captain AND make your captain your Matchday Joker:
- The multiplier is `Math.max(3, 2) = ×3` — it does **not** stack to ×6.
- Triple Captain always wins over Joker when both apply to the same player.

---

## Matchday Joker

### What it does

Pick **one player outside your 15-man squad** for this matchday. They score their real fantasy points as a bonus added on top of your XI total. No multiplier — just their actual stats.

The player does not need to be in your starting XI, does not take a squad slot, and does not count toward any formation rule. They simply contribute their matchday points as a straight addition.

### How to use it

1. Go to **Squad → Chips** and tap **Choose Matchday Joker**.
2. A picker shows all players from today's active fixtures who are **not in your squad** — sorted by price.
3. Select a player. They're locked in immediately.
4. Their points are added to your round total when scoring runs.

### Rules

| Rule | Detail |
|---|---|
| **Must be outside your squad** | You cannot pick one of your own 15 players. The picker only shows external players. A DB trigger (`trg_guard_daily_joker_external_player`) also enforces this at the server level. |
| **Once per matchday** | One joker per matchday per league. Unique index on `(user_id, league_id, matchday_id)` prevents a second pick. |
| **Once per player per season** | Each player can only be your joker once per season per league. After using Mbappé in round 1, you cannot pick him again in round 3. Unique index on `(user_id, league_id, player_id)`. |
| **Must be set before deadline** | Trigger `trg_guard_daily_joker_deadline` blocks inserts after `matchday_deadlines.deadline_at`. No way around this from the client. |
| **Matchday-scoped, not day-scoped** | If a matchday runs across 4–5 days (e.g. WC group stage), the joker picks up points from ALL fixtures in that matchday. You set it once before the deadline and it applies to the whole block. |
| **Scoring: real points, no multiplier** | The joker's full-matchday fantasy points are added directly. If they score 15 pts, you get +15 pts. |
| **Ignores draft no-repeat rule** | In draft leagues, other managers may own your joker player. This is allowed — the joker does not transfer ownership. |

### Who can you pick?

Any player from today's active fixtures who is **not in your 15-man squad**. The picker filters out your own players automatically.

### Draft mode

The no-repeat rule (each player belongs to one manager) applies to squad ownership only. For the joker, you can pick any player playing today, even if they are exclusively owned by another manager in your league. All 5 managers in a draft league can pick the same player as their joker simultaneously — there is no server guard against this.

---

## How chips affect scoring (technical)

The `calculate-scores` edge function reads chips **per round** from the database — not from the persistent squad columns:

```
Triple Captain → chips_used WHERE chip_type='triple_captain' AND matchday_id = current_round
Matchday Joker → daily_jokers WHERE matchday_id = current_round AND league_id + user_id match
```

The persistent columns `squads.is_triple_captain` and `squads.joker_player_id` are **never used by scoring**. They are UI mirrors only and are never reset between rounds. This means:
- Historical chips do not carry forward and re-fire in later rounds.
- If a chip was accidentally left on the squad row, it has no effect on scoring.

### Multiplier rule

```
captain_mult = captain? (triple_captain? 3 : 2) : 1
joker_mult   = joker?   2 : 1
final_mult   = Math.max(captain_mult, joker_mult)
```

Chips do not multiply each other. The highest applicable multiplier wins.

| Scenario | Result |
|---|---|
| Normal captain | ×2 |
| Triple Captain on captain | ×3 |
| Joker (external player) | +their real pts (×1 bonus) |
| Triple Captain on captain, no joker | ×3 on captain |

---

## What is retired / not available

| Chip | Status |
|---|---|
| **Wildcard** | ❌ Retired. All wildcard flags on squads were cleared in session 78. The +10% budget multiplier is no longer applied anywhere. `activate_chip('wildcard')` returns an error. |
| **Bench Boost** | ❌ Never implemented. Bench players always score 0 (unless joker). |
| **Free Hit** | ❌ Never implemented. |

---

## Data model reference

```
chips_used          → Triple Captain records. Unique per (user_id, league_id, chip_type).
daily_jokers        → Matchday Joker records. Unique per (user_id, league_id, matchday_id).
squads.is_triple_captain  → UI mirror only. Not read by scoring.
squads.joker_player_id    → UI mirror only. Not read by scoring.
```

---

## Related documents

- [STARTING_XI_AND_BENCH.md](STARTING_XI_AND_BENCH.md) — How the starting XI is picked and how auto-substitution works
- [FANTASY_POINTS_SCORING_LAYER.md](FANTASY_POINTS_SCORING_LAYER.md) — Full scoring formula
- [TRANSFERS_AND_LINEUP_GUIDE.md](TRANSFERS_AND_LINEUP_GUIDE.md) — Transfer windows and lineup changes

---

Last Updated: **2026-06-06**
