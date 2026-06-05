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

## Matchday Joker (16th Man)

### What it does

The Matchday Joker lets you pick a **16th player** outside your 15-man squad for this matchday only. That player scores ×2 fantasy points, added on top of your regular squad score.

### How to use it

1. Go to **Squad → Chips** and tap **Choose 16th Man** (or tap the chip card button).
2. A picker shows all players from today's active fixtures — sorted by price.
3. Select any player. They're locked in immediately.
4. The joker is shown in the Chips section and in the Live/Points views.

### Rules

| Rule | Detail |
|---|---|
| **Once per matchday** | One joker per matchday, per league. The unique constraint on `daily_jokers` prevents a second pick. |
| **Must be set before deadline** | A trigger (`trg_guard_daily_joker_deadline`) blocks all inserts after `matchday_deadlines.deadline_at` for the active matchday. There is no way around this from the client. |
| **Not limited to your squad** | You can pick any player from the active matchday's fixtures — they do not need to be in your 15-man squad. |
| **Ignores country/club limits** | The joker selection is completely independent of squad composition rules. |
| **Does not need to be in starting XI** | The joker player scores regardless of your lineup selection. They are always counted. |
| **Scoring effect: ×2** | The joker player's fantasy points are doubled and added to your round total. |
| **Selling the joker player** | If you sell the joker player from your squad (they are in both your squad and selected as joker), a warning is shown. After selling, the joker boost is cleared for that matchday. |
| **Multi-day matchdays** | The joker is matchday-scoped, not day-scoped. If your matchday runs across 4-5 days, your joker scores across ALL fixtures in that matchday — including ones played on later days. The deadline gate is tied to the matchday deadline (before the first fixture), so you set the joker once for the whole block. |

### Who can you pick as joker?

The joker picker shows all players whose `club` (national team or club team) is playing today. The picker is divided into two sections:
- **Your squad — playing today**: players from your 15-man squad who are in today's fixtures (highlighted)
- **All other active players**: everyone else from today's fixtures sorted by price

There is no restriction on who you can pick.

### Draft mode (noduplicate/H2H) — important limitation

**In draft mode, the Matchday Joker does NOT check the no-repeat rule.**

You can pick a player already owned by another manager in your league as your joker. This is intentional — the joker is a bonus scorer that sits outside the squad ownership model. The no-repeat rule applies only to buying players into your 15-man squad, not to the joker pick.

**Practical implication**: In a 5-manager draft league, all 5 managers could technically pick the same top forward as their joker on the same matchday. There is no server-side guard against this. The joker pick is purely personal — it does not transfer ownership or affect other managers' squads.

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
| Joker on non-captain player | ×2 |
| Joker AND captain on same player (no TC) | max(2, 2) = ×2 |
| Triple Captain + Joker on same player | max(3, 2) = ×3 |
| Joker on bench player | ×2 regardless (joker always scores) |

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
