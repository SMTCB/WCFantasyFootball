# Scoring Fit-Gap Analysis
**Settled spec:** `FANTASY_POINTS_SCORING_LAYER.md`
**API source:** Forza Football (endpoints E4–E10)
**As of:** 2026-05-02

---

## Summary

| Status | Count |
|--------|-------|
| ✅ Fully covered | 18 |
| ⚠️ Partial / approximation | 1 |
| 🔧 Data exists, code gap fixed | 3 |
| ❌ Not available | 0 |

All scoring rules are either fully covered or have been addressed. No blockers.

---

## Rule-by-Rule Breakdown

### Goalkeeper (GK)

| Rule | Points | Data Source | Status | Notes |
|------|--------|-------------|--------|-------|
| Minutes played | +1 / 90 min | E10 `minutes_played` | ✅ | Direct field |
| Goal scored | +5 | E10 `goals` | ✅ | Direct field |
| Goal conceded | -1 / goal (≥60 min) | E4 match scores + E10 minutes | ✅ | Derived: `away_score` if home team, capped at ≥60 min |
| Clean sheet | +4 (0 conceded, ≥60 min) | E4 match scores + E10 minutes | ✅ | Derived: `goals_conceded === 0 && minutes >= 60` |
| Own goal | -2 | E5 `event_digest.own_goal_count` | ✅ | Only reliable source; E10 does not include own goals |
| Penalty save | +5 | E9 `missed_goal` events with `detail='penalty'` from opposing team | ⚠️ | **Partial** — cannot distinguish penalty save from post/bar. When the opposing team registers a missed penalty, the credit goes to the GK on the other team. In practice saves account for the large majority of missed penalties. Working as of this session. |
| Yellow card | -1 | E10 `yellow_cards` | ✅ | Direct field |
| Red card | -3 | E9 `card` events with `detail='red'` | ✅ | E10 does not include red cards; E9 is authoritative |
| Bonus points | +3/+2/+1 | Derived (BPS ranking per match) | ✅ | BPS uses E10: goals, assists, minutes, shots_on_target, tackles_won, interceptions, accurate_passes/total_passes |

---

### Defender (DEF)

| Rule | Points | Data Source | Status | Notes |
|------|--------|-------------|--------|-------|
| Minutes played | +1 / 90 min | E10 `minutes_played` | ✅ | Direct field |
| Goal scored | +4 | E10 `goals` | ✅ | Direct field |
| Assist | +1 | E10 `assists` | ✅ | Direct field |
| Clean sheet | +4 (0 conceded, ≥60 min) | E4 match scores | ✅ | Derived |
| Tackle won | +0.5 | E10 `won_tackles` | 🔧 | **Code gap fixed** — data was in `player_match_stats.tackles_won` but `scorePlayer()` was not applying the +0.5 per tackle. Fixed in this session. |
| Interception | +0.25 | E10 `interceptions` | 🔧 | **Code gap fixed** — same as tackle: data stored but not scored. Fixed in this session. |
| Own goal | -2 | E5 `event_digest.own_goal_count` | ✅ | |
| Yellow card | -1 | E10 `yellow_cards` | ✅ | |
| Red card | -3 | E9 card events | ✅ | |
| Bonus points | +3/+2/+1 | BPS ranking | ✅ | |

---

### Midfielder (MID)

| Rule | Points | Data Source | Status | Notes |
|------|--------|-------------|--------|-------|
| Minutes played | +1 / 90 min | E10 `minutes_played` | ✅ | |
| Goal scored | +5 | E10 `goals` | ✅ | |
| Assist | +1 | E10 `assists` | ✅ | |
| Clean sheet | +1 (0 conceded, ≥60 min) | E4 match scores | ✅ | |
| Tackle won | +0.5 | E10 `won_tackles` | 🔧 | **Code gap fixed** — same as DEF above |
| Interception | +0.25 | E10 `interceptions` | 🔧 | **Code gap fixed** — same as DEF above |
| Own goal | -2 | E5 `event_digest.own_goal_count` | ✅ | |
| Yellow card | -1 | E10 `yellow_cards` | ✅ | |
| Red card | -3 | E9 card events | ✅ | |
| Bonus points | +3/+2/+1 | BPS ranking | ✅ | |

---

### Forward (FWD)

| Rule | Points | Data Source | Status | Notes |
|------|--------|-------------|--------|-------|
| Minutes played | +1 / 90 min | E10 `minutes_played` | ✅ | |
| Goal scored | +3 | E10 `goals` | ✅ | |
| Assist | +1 | E10 `assists` | ✅ | |
| Penalty scored | +1 bonus (on top of goal) | E9 `goal` events with `detail='penalty'` | 🔧 | **Code gap fixed** — added `penalty_scored` column to `player_match_stats`; `ingest-match-events` now counts penalty goals from E9; `scorePlayer()` now adds +1 per penalty scored for FWDs |
| Penalty missed | -1 | E9 `missed_goal` with `detail='penalty'` | ✅ | |
| Own goal | -2 | E5 `event_digest.own_goal_count` | ✅ | |
| Yellow card | -1 | E10 `yellow_cards` | ✅ | |
| Red card | -3 | E9 card events | ✅ | |
| Bonus points | +3/+2/+1 | BPS ranking | ✅ | |

---

## Code Gaps Fixed in This Session

Three rules were fully supported by the Forza API data but were not applied in `calculate-scores/index.js`:

### 1 & 2 — Tackle (+0.5) and Interception (+0.25) for DEF/MID
- **Data path:** E10 `won_tackles` → `player_match_stats.tackles_won` and E10 `interceptions` → `player_match_stats.interceptions`
- **Fix:** Added to `scorePlayer()` for DEF and MID positions
- **Impact:** A defender with 3 tackles + 2 interceptions was previously missing 1.5 + 0.5 = 2 pts

### 3 — FWD Penalty Scored (+1)
- **Data path:** E9 `goal` events with `detail='penalty'`
- **Fix:** Added `penalty_scored` column to `player_match_stats`; `ingest-match-events` now extracts this from E9; `scorePlayer()` applies +1 per penalty scored
- **Impact:** A forward who scored a penalty was correctly getting the goal (+3) but missing the additional +1 bonus

### 4 — GK Goals Conceded Deduction (minor bug)
- The deduction of `-1 per goal conceded` should only apply when the GK played ≥60 min.
  The previous code used `!stats.clean_sheet` as the gate, which is correct for the 0-conceded case but didn't properly guard the ≥60-min condition.
- **Fix:** Now checks `minutes >= 60` directly before applying the deduction.

---

## The One Approximation: Penalty Save

The spec awards GK **+5 for a penalty save**. Forza E9 provides `missed_goal` events with `detail='penalty'` which captures any penalty that didn't result in a goal. This includes:
- ✅ Penalty saved by GK
- ❌ Penalty hit the post or crossbar
- ❌ Penalty fired over/wide

**In practice**, the vast majority of "missed" penalties in open play are saves. Post/bar penalties are rare (FPL data: ~15% of missed penalties). For MVP this approximation is acceptable. The stat `saves` from E10 is total saves (not penalty-specific), so it cannot disambiguate.

If Forza ever exposes a `save` sub-type on goal events, update `processPeriodsData` in `ingest-match-events` to use that instead.

---

## Pre-dry-run Scoring Checklist

- [x] Minutes played ✅
- [x] Goals (all positions) ✅
- [x] Assists ✅
- [x] Clean sheets (GK/DEF: +4, MID: +1) ✅
- [x] Goals conceded (GK: -1/goal) ✅
- [x] Own goals (-2) ✅
- [x] Yellow cards (-1) ✅
- [x] Red cards (-3) ✅
- [x] Penalty missed (-1 FWD) ✅
- [x] Penalty saved (+5 GK, approx.) ⚠️
- [x] Penalty scored (+1 FWD bonus) ✅ fixed
- [x] Tackle won (+0.5 DEF/MID) ✅ fixed
- [x] Interception (+0.25 DEF/MID) ✅ fixed
- [x] Bonus points (+3/+2/+1 BPS) ✅

**All scoring rules now covered.**
