# Forza Football API — Integration Reference

> **Purpose:** Complete field-by-field reference for building the data integration layer. Every field available from the API is listed, mapped to its endpoint and fetch logic, and cross-referenced against the scoring engine requirements. Intended as the single source of truth before development starts.

**Base URL:** `https://api.forzafootball.com/`  
**Auth:** append `?access_token=DoRy9PNpYN4Ubg3FQkwEqxXQu2MytxzG` to all requests  
**EPL Tournament ID:** `426`  
**Last updated:** 2026-04-23 (after live API testing)

---

## 1. Endpoint Map

| ID | Endpoint | Method | Description | Documented? |
|---|---|---|---|---|
| E1 | `/v1/tournaments/:id` | GET | Tournament info + current season | ✅ |
| E2 | `/v1/tournaments/:id/matches` | GET | All matches in active season | ✅ |
| E3 | `/v1/tournaments/:id/teams` | GET | All teams in active season | ✅ |
| E4 | `/v1/matches/:id` | GET | Match detail (scores, status, time) | ✅ |
| E5 | `/v1/matches/:id/lineups` | GET | Confirmed lineups + EventDigest | ✅ |
| E6 | `/v2/matches/:id/predicted_lineups` | GET | Predicted lineups (24-48h pre-match) | ✅ |
| E7 | `/v2/matches/:id/matchday_squads` | GET | 18-man squad (12-24h pre-match) | ✅ |
| E8 | `/v2/matches/:id/unavailable_players` | GET | Absences + suspensions per match | ✅ |
| E9 | `/v2/matches/:id/periods` | GET | Full event stream by period | ❌ Undocumented |
| E10 | `/v2/matches/:id/player_statistics` | GET | Per-match ranked stats, 35 categories | ❌ Undocumented |
| E11 | `/v3/matches/:id/lineups` | GET | Lineups with player ratings (3.0–10.0) | ❌ Undocumented |
| E12 | `/v1/players/:id` | GET | Player basic info | ✅ |
| E13 | `/v2/players/:id/availability` | GET | Player suspensions + absences | ✅ |
| E14 | `/v1/teams/:id` | GET | Team info | ✅ |
| E15 | `/v1/teams/:id/squad` | GET | Full squad roster | ✅ |
| E16 | `/v2/teams/:id/unavailable_players` | GET | Team-level unavailability | ✅ |

---

## 2. Scoring Engine Requirements vs API Coverage

> Fields required by the scoring rules in `FANTASY_POINTS_SCORING_LAYER.md`, checked against what the API provides.

### 2.1 Core Scoring Fields

| Scoring field | Used by | API field | Endpoint | Notes |
|---|---|---|---|---|
| `minutes_played` | All positions — +1pt per 90min (pro-rated); also gates clean sheet and goal conceded penalties | `minutes_played` | **E10** `/v2/matches/:id/player_statistics` | ✅ Direct. Top value tested = 90. |
| `goals` (outfield) | GK +5, DEF +4, MID +5, FWD +3 | `goals` | **E10** | ✅ Direct. |
| `goals` (outfield, detail) | FWD +1 bonus for penalty scored | `goal.detail == "penalty"` | **E9** `/v2/matches/:id/periods` | ✅ Each goal event has a `detail` field: `"penalty"` or null. Use periods to distinguish penalty vs. open-play goal. |
| `assists` | All positions +1 | `assists` | **E10** | ✅ Direct. Cross-confirmed via `assisting_player` in **E9** goal events. |
| `own_goals` | All positions -2 | `own_goal_count` | **E5** `/v1/matches/:id/lineups` → `event_digest` | ✅ Direct via EventDigest. Not separately listed in E10 — use E5. |
| `yellow_cards` | All positions -1 | `yellow_cards` | **E10** | ✅ Direct. Also in `event_digest.card == "yellow"` (E5). |
| `red_cards` | All positions -3 | `card` event `detail == "red"` | **E9** | ⚠️ Not a separate E10 category. Derive from E9 card events with `detail == "red"`, OR from `event_digest.card == "red"` in **E5**. |
| `clean_sheet` | GK +4, DEF +4, MID +1 (all require ≥60 min played) | *Derived* | **E4** + **E10** | ⚠️ No direct field. Derive: player `minutes_played >= 60` (E10) AND opponent team scored 0 goals (from `MatchScores.current` in E4). |
| `goals_conceded` | GK -1 per goal conceded (if ≥60 min) | *Derived* | **E4** + **E10** | ⚠️ No direct field. Derive: player `minutes_played >= 60` (E10) AND count of goals scored by opposing team from `MatchScores` (E4). |
| `penalty_save` | GK +5 | *Derived* | **E9** | ⚠️ No direct field. Derive: look for `missed_goal` event with `detail == "penalty"` from the opposing team while GK was on pitch. |
| `penalty_missed` | FWD -1 | *Derived* | **E9** | ⚠️ No direct field. Derive: look for `missed_goal` event with `detail == "penalty"` for that player in E9. |
| `bonus_points` | Top 3 per match: +3, +2, +1 | *Calculated* | **E10** (BPS inputs) | ✅ All BPS inputs available. See Section 3. |

### 2.2 BPS (Bonus Points System) Inputs

All inputs to the simplified BPS formula (`FANTASY_POINTS_SCORING_LAYER.md`) are available directly from **E10**:

| BPS input | API field | Endpoint |
|---|---|---|
| `goals` | `goals` | E10 |
| `assists` | `assists` | E10 |
| `shots_on_target` | `shots_on_target` | E10 |
| `tackles_won` | `won_tackles` | E10 |
| `interceptions` | `interceptions` | E10 |
| `minutes_played` | `minutes_played` | E10 |
| `pass_completion` | *Derived:* `accurate_passes / total_passes` | E10 |

### 2.3 Per-Position Extras (scoring logic)

| Position | Extra field | API field | Endpoint |
|---|---|---|---|
| DEF | `tackles_won` +0.5/tackle | `won_tackles` | E10 |
| DEF | `interceptions` +0.25/interception | `interceptions` | E10 |
| MID | `tackles_won` +0.5/tackle | `won_tackles` | E10 |
| MID | `interceptions` +0.25/interception | `interceptions` | E10 |

---

## 3. Field Reference by Endpoint

### E4 — `/v1/matches/:id` — Match Detail

| Field | Type | Used for |
|---|---|---|
| `id` | Integer | Match identifier |
| `kickoff_at` | ISO-8601 | Matchday deadline derivation (MIN per round) |
| `round` | Integer | Matchday number; group matches by this to derive squad lock |
| `status` | `"before"` / `"live"` / `"after"` | Know when to start polling events |
| `status_detail` | String / null | Fine-grained state (e.g. `"first_half"`, `"halftime_pause"`) |
| `scores.current` | [home, away] Integer | **Clean sheet derivation** — if opponent score = 0 |
| `scores.first_half` | [home, away] Integer | Half-time score |
| `scores.second_half` | [home, away] Integer | Full-time score |
| `match_time.current` | Integer | Current minute (for live display) |
| `match_time.added` | Integer | Added time minute |
| `match_time.length` | Integer | Expected match length (90 or 120 in ET) |
| `home_team` / `away_team` | Team object | Team identification |
| `tournament.id` | Integer | Tournament context |

### E5 — `/v1/matches/:id/lineups` — Confirmed Lineups + EventDigest

> Best source for: who played, substitution summary, own goals, cards. Use alongside E10 for scoring.

**Lineup object:**

| Field | Type | Used for |
|---|---|---|
| `team.id` | Integer | Identify which side |
| `formation` | [Integer] | Display only |
| `pitch_players` | [LineupPlayer] | Starting XI |
| `bench_players` | [LineupPlayer] | Bench — needed to know who was available |

**LineupPlayer fields:**

| Field | Type | Used for |
|---|---|---|
| `player_id` | Integer | Primary player identifier |
| `first_name` / `last_name` / `nickname` | String | Display |
| `position` | `"goalkeeper"` / `"defender"` / `"midfielder"` / `"attacker"` | **Critical** — drives entire scoring ruleset |
| `shirt_number` | Integer | Display |
| `event_digest.goal_count` | Integer | Goals (use alongside E10 for confirmation) |
| `event_digest.own_goal_count` | Integer | ✅ **Own goals — primary source** |
| `event_digest.card` | `"yellow"` / `"red"` / null | Card status (use E10 for yellow count, E9 for red) |
| `event_digest.substitution` | `"in"` / `"out"` / `"in_out"` / null | Substitution summary |

### E9 — `/v2/matches/:id/periods` — Event Stream *(undocumented)*

> Best source for: event timing, assists, penalty detection, red cards, exact substitution minutes.

**Period object:**

| Field | Type | Notes |
|---|---|---|
| `type` | `"first_half"` / `"second_half"` / etc. | Period identifier |
| `live` | Boolean | Whether period is in progress |
| `score` | [home, away] | Score at end of period |
| `events` | [Event] | Ordered list of events |

**Event fields (all types share):**

| Field | Type | Notes |
|---|---|---|
| `id` | Integer | Event identifier |
| `type` | String | See event types below |
| `event_index` | Integer | Global ordering |
| `match_minute` | Integer | Minute of event |
| `added_minute` | Integer | Stoppage time minute |
| `team_side` | `"home"` / `"away"` | Team who triggered event |

**Event types and their specific fields:**

| Event type | Extra fields | Scoring use |
|---|---|---|
| `match_start` / `match_end` | — | Boundary markers for minutes calculation |
| `goal` | `player` (scorer), `assisting_player` (nullable), `detail` (`"penalty"` / null), `score` [h,a] | **Goals + Assists + Penalty bonus** |
| `missed_goal` | `player`, `detail` (`"penalty"` / `"post"` / etc.) | **Penalty missed / Penalty save derivation** |
| `card` | `player`, `detail` (`"yellow"` / `"red"`) | **Red card** (yellow count better from E10) |
| `substitution` | `player_in`, `player_out` | **Minutes played derivation if not using E10** |
| `stoppage_time` | `amount` | Adjust minutes calculation |
| `injury` | `player` | Informational only |

**Minutes played logic (if not using E10 direct field):**
```
start_minute = 0 (if starting) OR substitution.match_minute (if coming on)
end_minute   = match_end OR substitution.match_minute (if going off)
              + stoppage_time.amount if in added time
minutes = end_minute - start_minute
```
> ⚡ Prefer E10 `minutes_played` directly — it is simpler and already computed.

### E10 — `/v2/matches/:id/player_statistics` — Per-Match Stats *(undocumented)*

> **Primary source for the scoring engine.** Returns a `player_statistics` object where each key is a stat category. Each category is a ranked array of `{ player_id, team_id, value, rank }`. Players with 0 for a category do not appear in it.

**Fetch pattern:**
```javascript
// Build a per-player stat map
const raw = await fetch(`/v2/matches/${matchId}/player_statistics?access_token=...`).then(r => r.json())
const byPlayer = {}
for (const [stat, entries] of Object.entries(raw.player_statistics)) {
  for (const entry of entries) {
    if (!byPlayer[entry.player_id]) byPlayer[entry.player_id] = { player_id: entry.player_id, team_id: entry.team_id }
    byPlayer[entry.player_id][stat] = entry.value
  }
}
// byPlayer[player_id] now has all stats, defaulting to 0 for missing categories
```

**All 35 available stat categories:**

| Category key | Sample value | Scoring engine use | Relevance |
|---|---|---|---|
| `minutes_played` | 90 | ✅ **Core** — minutes × (1/90) points | Primary |
| `goals` | 3 | ✅ **Core** — position-weighted points | Primary |
| `assists` | 1 | ✅ **Core** — +1 all positions | Primary |
| `yellow_cards` | 1 | ✅ **Core** — -1 all positions | Primary |
| `won_tackles` | 5 | ✅ **Core** — +0.5 DEF/MID per tackle | Primary |
| `interceptions` | 3 | ✅ **Core** — +0.25 DEF/MID | Primary |
| `saves` | 3 | ✅ **Core** — GK scoring (no direct pts rule yet — see Section 4) | Primary |
| `shots_on_target` | 3 | ✅ **BPS input** | BPS |
| `accurate_passes` | 97 | ✅ **BPS input** (pass completion numerator) | BPS |
| `total_passes` | 101 | ✅ **BPS input** (pass completion denominator) | BPS |
| `expected_goals` | 1.7945 | ⭐ **Projection** — useful for squad projections | Projection |
| `expected_assists` | 0.434256 | ⭐ **Projection** — useful for squad projections | Projection |
| `expected_goal_involvement` | 1.806551 | ⭐ **Projection** — xG + xA combined | Projection |
| `big_chances_created` | 1 | ⭐ **Bonus candidate** — quality creative metric | Bonus |
| `key_passes` | 3 | ⭐ **Bonus candidate** — similar to big chances | Bonus |
| `total_shots` | 3 | ⭐ **Bonus candidate** — attacking involvement | Bonus |
| `total_clearances` | 6 | ⭐ **Bonus candidate** — defensive output | Bonus |
| `aerial_duels_won` | 4 | ⭐ **Bonus candidate** — physical dominance | Bonus |
| `won_dribbles` | 4 | ⭐ **Bonus candidate** — progressive play | Bonus |
| `total_tackles` | 7 | ℹ️ Volume metric (won_tackles is better for scoring) | Info |
| `duels_won` | 8 | ℹ️ Physical stat | Info |
| `duels_lost` | 8 | ℹ️ Physical stat | Info |
| `aerial_duels_lost` | 3 | ℹ️ Physical stat | Info |
| `total_dribbles` | 5 | ℹ️ Dribble volume | Info |
| `total_crosses` | 5 | ℹ️ Wide play volume | Info |
| `accurate_crosses` | 2 | ℹ️ Wide play quality | Info |
| `total_long_balls` | 10 | ℹ️ Distribution volume | Info |
| `accurate_long_balls` | 5 | ℹ️ Distribution quality | Info |
| `touches` | 116 | ℹ️ Involvement metric | Info |
| `fouls` | 2 | ℹ️ Negative stat candidate | Info |
| `corners_taken` | 3 | ℹ️ Set piece involvement | Info |
| `penalty_area_entries` | 8 | ℹ️ Attacking threat | Info |
| `hit_woodwork` | 1 | ℹ️ Attacking misfortune | Info |
| `keeper_throws` | 7 | ℹ️ GK distribution volume | Info |
| `accurate_keeper_throws` | 7 | ℹ️ GK distribution quality | Info |

### E11 — `/v3/matches/:id/lineups` — Lineups with Ratings *(undocumented)*

> Same structure as E5 but adds a `rating` field per player. `event_digest` is null in v3 — use E5 for that.

| Field | Type | Used for |
|---|---|---|
| `pitch_players[].rating` | Float (3.0–10.0) / null | Player match rating; null for unused players |
| `pitch_players[].birthdate` | Date | Player enrichment |
| `pitch_players[].height` | Integer (cm) | Player enrichment |
| `pitch_players[].region` | Object | Player nationality |
| `pitch_players[].teams` | [Team] | Player's club(s) |
| `team.abbreviation` | String | Display |
| `team.main_color` | [R, G, B] | UI theming |

### E13 — `/v2/players/:id/availability` — Player Availability

| Field | Type | Used for |
|---|---|---|
| `suspensions[].type` | `"tournaments"` / `"period"` | Type of suspension |
| `suspensions[].total_matches_left` | Integer | Matches remaining in ban |
| `suspensions[].upcoming_matches` | [Match] | Specific matches affected |
| `suspensions[].reason` | String (SuspensionReason) | e.g. `"straight_red_card"`, `"disciplinary_points"` |
| `suspensions[].suspended_until` | Date (period type only) | End date of ban |
| `absences[].type` | `"injury"` / `"sickness"` / `"other"` | Absence category |
| `absences[].reason` | String (AbsenceReason) | Specific injury/illness |
| `absences[].expected_return.type` | `"estimated_date"` / `"day_to_day"` / etc. | Return expectation |
| `absences[].expected_return.returns_on` | Date | Expected return date |

---

## 4. Derived Field Logic (Fields Not Directly in API)

### Clean Sheet

```javascript
function hasCleanSheet(playerId, matchData, playerStats) {
  const mins = getPlayerStat(playerStats, playerId, 'minutes_played') ?? 0
  if (mins < 60) return false

  // Determine player's team side
  const teamId = getPlayerTeamId(playerStats, playerId)
  const isHome = matchData.home_team.id === teamId

  // Opponent score
  const opponentScore = isHome
    ? matchData.scores.current[1]   // away scored against home
    : matchData.scores.current[0]   // home scored against away

  return opponentScore === 0
}
```
**Sources:** E10 (`minutes_played`) + E4 (`scores.current`, `home_team.id`, `away_team.id`)

### Goals Conceded (GK only)

```javascript
function goalsConceded(playerId, matchData, playerStats) {
  const mins = getPlayerStat(playerStats, playerId, 'minutes_played') ?? 0
  if (mins < 60) return 0

  const teamId = getPlayerTeamId(playerStats, playerId)
  const isHome = matchData.home_team.id === teamId

  return isHome
    ? matchData.scores.current[1]
    : matchData.scores.current[0]
}
```
**Sources:** E10 + E4

### Red Cards

```javascript
// Option A — from periods (most accurate, includes exact minute)
const redCards = periods.flatMap(p => p.events)
  .filter(e => e.type === 'card' && e.detail === 'red' && e.player?.id === playerId)

// Option B — from EventDigest (simpler, post-match only)
const hasRedCard = lineup.event_digest?.card === 'red'
```
**Sources:** E9 (preferred for timing) or E5 (simpler)

### Penalty Missed (FWD -1)

```javascript
const penaltyMissed = periods.flatMap(p => p.events)
  .filter(e =>
    e.type === 'missed_goal' &&
    e.detail === 'penalty' &&
    e.player?.id === playerId
  ).length
```
**Sources:** E9

### Penalty Save (GK +5)

```javascript
// A saved penalty = missed_goal type="penalty" by the opposing team, while GK was on pitch
const opponentPenaltiesMissed = periods.flatMap(p => p.events)
  .filter(e =>
    e.type === 'missed_goal' &&
    e.detail === 'penalty' &&
    e.team_side !== gkTeamSide
  ).length
// Note: this counts posts/over-bar as well as saves — cross-check with saves count from E10 to isolate GK saves
```
**Sources:** E9 + E10 (`saves`)

### Pass Completion % (BPS input)

```javascript
const passCompletion = accurate_passes / total_passes  // both from E10
```

### Matchday Deadline

```javascript
// Group all matches by round, take earliest kickoff per round
const deadlineByRound = {}
for (const match of allMatches) {
  if (!deadlineByRound[match.round] || match.kickoff_at < deadlineByRound[match.round]) {
    deadlineByRound[match.round] = match.kickoff_at
  }
}
// deadlineByRound[roundNumber] = squad lock timestamp
```
**Source:** E2 (`round`, `kickoff_at`)

---

## 5. Recommended API Call Sequence (Per Match, Scoring Engine)

### Pre-match (T-48h)
```
1. E2  GET /v1/tournaments/426/matches          → Fixture list, kickoff times, round numbers
2. E6  GET /v2/matches/:id/predicted_lineups    → Expected XI for display
```

### Pre-match (T-12h)
```
3. E7  GET /v2/matches/:id/matchday_squads      → Confirmed 18-man squad
4. E8  GET /v2/matches/:id/unavailable_players  → Late injury/suspension updates
```

### Match confirmed (lineups released, ~60min before kickoff)
```
5. E5  GET /v1/matches/:id/lineups              → Starting XI + bench + position data
6. E11 GET /v3/matches/:id/lineups              → Player ratings (post-match) + extra metadata
```

### Live (poll every 60s while status = "live")
```
7. E4  GET /v1/matches/:id                      → Score + match time + status
8. E9  GET /v2/matches/:id/periods              → Event stream (goals, cards, subs in real time)
```

### Post-match (status = "after")
```
9. E10 GET /v2/matches/:id/player_statistics    → Final stats for scoring engine
10. E11 GET /v3/matches/:id/lineups             → Final player ratings
```

> **Scoring engine recommendation:** Run final point calculation from E10 (authoritative stats), cross-check goals/assists against E9 for penalty detail and red card timing. Use E5 event_digest only for own goals (not in E10).

---

## 6. Fields Required by Scoring Logic — Coverage Summary

| Scoring rule field | Available? | Primary source | Fallback | Notes |
|---|---|---|---|---|
| `minutes_played` | ✅ | E10 `minutes_played` | E9 substitution events | Prefer E10 |
| `goals` | ✅ | E10 `goals` | E5 `event_digest.goal_count` | — |
| `goal_is_penalty` | ✅ | E9 `goal.detail == "penalty"` | — | Needed for FWD +1 bonus |
| `assists` | ✅ | E10 `assists` | E9 `assisting_player` | — |
| `own_goals` | ✅ | E5 `event_digest.own_goal_count` | — | Not in E10 |
| `yellow_cards` | ✅ | E10 `yellow_cards` | E5 `event_digest.card` | — |
| `red_cards` | ✅ | E9 card event `detail == "red"` | E5 `event_digest.card == "red"` | E10 has no red card field |
| `clean_sheet` | ✅ (derived) | E4 `scores.current` + E10 `minutes_played` | — | No direct field |
| `goals_conceded` | ✅ (derived) | E4 `scores.current` + E10 `minutes_played` | — | GK only, no direct field |
| `penalty_save` | ✅ (derived) | E9 `missed_goal` + E10 `saves` | — | No direct field |
| `penalty_missed` | ✅ (derived) | E9 `missed_goal.detail == "penalty"` | — | No direct field |
| `tackles_won` | ✅ | E10 `won_tackles` | — | DEF/MID |
| `interceptions` | ✅ | E10 `interceptions` | — | DEF/MID |
| `shots_on_target` (BPS) | ✅ | E10 `shots_on_target` | — | — |
| `pass_completion` (BPS) | ✅ (derived) | E10 `accurate_passes / total_passes` | — | — |
| `position` | ✅ | E5 `position` | — | **Must come from E5 — not in E10** |
| `player_id` | ✅ | All endpoints | — | Consistent across all |

---

## 7. Additional API Fields Worth Considering (Not in Current Scoring Logic)

These fields exist in the API and are relevant to a fantasy platform, but are not yet used in the scoring rules. Consider adding them to scoring or BPS in future iterations.

| Field | Source | Category | Why it matters |
|---|---|---|---|
| `saves` | E10 | GK scoring | The GK scoring rule awards +5 for penalty saves but has no general save points. Adding +0.5/save (as FPL does) would better reward active GKs. |
| `total_clearances` | E10 | DEF bonus | Rewards defensive work beyond tackles/interceptions — already a BPS component in FPL. |
| `big_chances_created` | E10 | MID/FWD bonus | High-quality chance creation — stronger signal than key passes. |
| `expected_goals` (xG) | E10 | Projections | Use as a projection weight for players yet to play in the matchday. |
| `expected_assists` (xA) | E10 | Projections | Same as xG — useful for live score projections. |
| `expected_goal_involvement` (xGI) | E10 | Projections | Combined xG+xA — single metric for squad projection engine. |
| `shots_on_target` | E10 | Bonus | Currently only in BPS. Consider +1 per SoT as a direct scoring rule for FWD/MID (common in alternative fantasy formats). |
| `aerial_duels_won` | E10 | DEF bonus | Physical dominance — relevant for set-piece defenders. |
| `won_dribbles` | E10 | MID/FWD bonus | Progressive play metric — rewarding skilful players. |
| `key_passes` | E10 | MID bonus | Chance creation volume — complements assists. |
| `accurate_passes` / `total_passes` | E10 | MID bonus | Pass completion already used in BPS; could be a direct scoring category for volume midfielders. |
| `rating` | E11 | Alternative scoring | Provider's own match rating (3.0–10.0). Could be used as an alternative simpler scoring system, or as a BPS tiebreaker. |
| `fouls` | E10 | Negative | Persistent fouling could be penalised in more punitive rulesets. |

---

## 8. What the API Cannot Provide

| Data point | Status | Recommended solution |
|---|---|---|
| **Player valuations / transfer costs** | ❌ Not available | Define and maintain independently. Seed from FPL public API or manual curation. |
| **Season statistics (career averages)** | ⏳ Coming soon | Use StatsBomb open data (see `PRELIMINARY_SCORING_MECHANISM.md`) as interim source. Re-sync when Forza endpoint ships. |
| **Real-time streaming / webhooks** | ❌ Not available | API is poll-based only. Use Supabase Realtime as the streaming layer: poll Forza every 60s → write to DB → broadcast via Supabase channels. |
| **Fantasy points calculation** | ❌ Not applicable | Intentionally our logic — implement in Supabase SQL functions (see `FANTASY_POINTS_SCORING_LAYER.md`). |
| **Player predictions / form scores** | ❌ Not available | Derive from xG/xA fields in E10 + season averages when available. |
| **Penalty shootout granularity** | ⚠️ Partial | Shootout goals appear in event stream but scoring rules for them are not yet defined. |
