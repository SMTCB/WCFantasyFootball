# Scoring Approach V2 — Additive Performance Scoring

**Replaces**: FPL-style scoring (BPS bonus + tier multipliers)  
**Decision date**: 2026-06-02  
**Status**: Approved — pending implementation

---

## Overview

Approach 1 — additive, position-aware scoring with no bonus multipliers. Every point comes directly from a stat. Players (and managers) can audit their score in seconds: count the goals, count the saves, add them up. That's the total.

**Why we changed**: FPL-style scoring overweights goals and assists, causing squad homogeneity. Managers converge on the same elite forwards; defenders and goalkeepers are undervalued. The BPS bonus (3/2/1 per match) added complexity without clarity. The new system rewards every position for what it actually contributes.

---

## Scoring Rules

### Goalkeeper (GK)

| Metric | Points |
|---|---|
| Minutes played (per 90) | +1.0 |
| Save | +0.5 |
| Clean Sheet (0 goals conceded, ≥60 min played) | +4.0 |
| Goal scored | +5.0 |
| Assist | +3.0 |
| Penalty Saved | +5.0 |
| Yellow Card | −1.0 |
| Red Card | −3.0 |
| Own Goal | −2.0 |

**Example**: Alisson — 7 saves, clean sheet, 90 min
`(90/90 × 1) + (7 × 0.5) + 4 = 1 + 3.5 + 4 = 8.5 pts`

---

### Defender (DEF)

| Metric | Points |
|---|---|
| Minutes played (per 90) | +1.0 |
| Clean Sheet (0 goals conceded, ≥60 min played) | +4.0 |
| Goal scored | +5.0 |
| Assist | +2.0 |
| Tackle won | +0.5 |
| Interception | +0.25 |
| Yellow Card | −1.0 |
| Red Card | −3.0 |
| Own Goal | −2.0 |

**Example**: Van Dijk — clean sheet, 5 tackles, 2 interceptions, 90 min
`1 + 4 + (5 × 0.5) + (2 × 0.25) = 1 + 4 + 2.5 + 0.5 = 8 pts`

---

### Midfielder (MID)

| Metric | Points |
|---|---|
| Minutes played (per 90) | +1.0 |
| Goal scored | +4.0 |
| Assist | +2.0 |
| Key Pass | +0.25 |
| Shot on Target | +0.5 |
| Yellow Card | −1.0 |
| Red Card | −3.0 |
| Own Goal | −2.0 |

**Example**: De Bruyne — 1 goal, 1 assist, 4 key passes, 2 SoT, 88 min
`(88/90) + 4 + 2 + (4 × 0.25) + (2 × 0.5) = 0.98 + 4 + 2 + 1 + 1 = 8.98 pts`

---

### Forward (FWD)

| Metric | Points |
|---|---|
| Minutes played (per 90) | +1.0 |
| Goal scored | +4.0 |
| Assist | +2.0 |
| Shot on Target | +0.25 |
| Big Chance Created | +1.0 |
| Yellow Card | −1.0 |
| Red Card | −3.0 |
| Own Goal | −2.0 |
| Penalty Missed | −1.0 |

**Example**: Haaland — 1 goal, 5 SoT, 87 min
`(87/90) + 4 + (5 × 0.25) = 0.97 + 4 + 1.25 = 6.22 pts`

---

## What Changed vs V1

| Rule | V1 (FPL-style) | V2 |
|---|---|---|
| GK goal | +5 | +5 (unchanged) |
| GK assist | 0 | **+3 (new)** |
| GK saves | 0 | **+0.5 each (new)** |
| GK goals conceded penalty | −1 per 2 conceded | **Removed** |
| DEF goal | +4 | **+5** |
| DEF assist | +1 | **+2** |
| MID goal | +5 | **+4** |
| MID assist | +1 | **+2** |
| MID clean sheet | +1 | **Removed** |
| MID key passes | 0 | **+0.25 each (new)** |
| MID shots on target | 0 | **+0.5 each (new)** |
| FWD goal | +3 | **+4** |
| FWD assist | +1 | **+2** |
| FWD shots on target | 0 | **+0.25 each (new)** |
| FWD big chances created | 0 | **+1.0 each (new)** |
| FWD penalty scored bonus | +1 | **Removed** |
| BPS bonus (3/2/1) | Yes | **Removed** |
| Tier multipliers | No (V1 never had) | **Not added** |

---

## Failsafe Levels

If Forza API data is unavailable, scoring degrades gracefully in three tiers:

### Level 1 — Field missing (default)
Any stat field absent from `player_match_stats` is treated as `0` via `?? 0` guards.  
Player still scores for the fields that are present (goals, assists, minutes, cards).  
No crash, no corruption.

### Level 2 — All Forza stats missing (Path B)
If `forza_match_id IS NULL` on all rows for a fixture, `calculate-scores` switches to Path B:  
aggregates from `match_events` table (manually entered events).  
Fields covered: goals, assists, own goals, cards, minutes, penalty saved/missed.  
Fields **not** available: saves, key passes, shots on target, big chances.  
Player scores for the core stats only — fair but reduced.

### Level 3 — Complete data failure (emergency)
If both API and match_events are empty, scoring is skipped.  
No points written — preferable to fabricating 0-point rounds.  
Score calculated retroactively when data becomes available.

---

## API Data Availability

All fields verified present in `/v2/matches/:id/player_statistics` across 3 recent EPL matches:

| Field | API stat key | Availability |
|---|---|---|
| Goals | `goals` | Confirmed |
| Assists | `assists` | Confirmed |
| Minutes played | `minutes_played` | Confirmed |
| Saves | `saves` | Confirmed |
| Yellow cards | `yellow_cards` | Confirmed |
| Red cards | `red_cards` (via periods endpoint) | Confirmed |
| Tackles won | `won_tackles` | Confirmed |
| Interceptions | `interceptions` | Confirmed |
| Key passes | `key_passes` | Confirmed |
| Shots on target | `shots_on_target` | Confirmed |
| Big chances created | `big_chances_created` | Confirmed |
| Clean sheet | Derived: goals conceded = 0 + ≥60 min | Confirmed |

---

## Captain & Chip Multipliers

Chips apply on top of base scoring as before. No change to chip logic.

| Chip | Effect |
|---|---|
| Captain | ×2 on captain's base score |
| Triple Captain | ×3 on captain's base score |
| Joker | ×2 on selected player's base score |
| Captain + Joker on same player | `Math.max(×2, ×2)` = ×2 (no stacking) |
| Triple Captain + Joker on same player | `Math.max(×3, ×2)` = ×3 |

---

Last Updated: **2026-06-02**
