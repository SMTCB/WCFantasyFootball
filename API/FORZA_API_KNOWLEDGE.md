# Forza Football API — Integration Knowledge Base

**Base URL:** `https://api.forzafootball.com/`  
**Auth:** `?access_token=DoRy9PNpYN4Ubg3FQkwEqxXQu2MytxzG`  
**EPL Tournament ID:** `426`  
**Docs version:** 1.0.3

---

## Confirmed Endpoints

| Endpoint | Version | Description |
|---|---|---|
| `/v1/tournaments/:id` | v1 | Tournament info (name, region, current season) |
| `/v1/tournaments/:id/teams` | v1 | All teams in active season |
| `/v1/tournaments/:id/matches` | v1 | All matches in active season (includes `round`, `kickoff_at`) |
| `/v1/matches/:id` | v1 | Match detail (scores, status, `status_detail`, `match_time`, `round`) |
| `/v1/matches/:id/lineups` | v1 | Confirmed lineups + `EventDigest` per player (no ratings) |
| `/v2/matches/:id/predicted_lineups` | v2 | Available 24-48h before kickoff |
| `/v2/matches/:id/matchday_squads` | v2 | Available 12-24h before kickoff |
| `/v2/matches/:id/unavailable_players` | v2 | Absences + suspensions per match |
| `/v2/matches/:id/periods` | v2 | **Undocumented** — full event stream by period (tested ✅) |
| `/v2/matches/:id/player_statistics` | v2 | **Undocumented** — per-match ranked player stats, 36 categories (tested ✅) |
| `/v3/matches/:id/lineups` | v3 | **Undocumented** — lineups with player ratings; no event_digest (tested ✅) |
| `/v1/players/:id` | v1 | Player basic info |
| `/v2/players/:id/availability` | v2 | Player suspensions + absences with detail |
| `/v1/teams/:id` | v1 | Team info |
| `/v1/teams/:id/squad` | v1 | Full squad roster |
| `/v2/teams/:id/unavailable_players` | v2 | Team-level absences/suspensions |

---

## EventDigest (from `/v1/matches/:id/lineups`)

Available in `LineupPlayer.event_digest`. Note: in v3 lineups, `event_digest` is null — use v1 for this.

| Field | Type | Notes |
|---|---|---|
| `goal_count` | Integer | Goals scored by player |
| `own_goal_count` | Integer | Own goals |
| `card` | `"yellow"` / `"red"` / null | Second yellow treated as red |
| `substitution` | `"in"` / `"out"` / `"in_out"` / null | — |

---

## Periods Endpoint — Event Stream (tested ✅)

`/v2/matches/:id/periods` returns an array of periods (`first_half`, `second_half`, etc.), each with:
- `score` — score at end of period
- `live` — boolean
- `events` — ordered array of event objects

### Event types confirmed in testing

| Type | Key fields | Notes |
|---|---|---|
| `match_start` / `match_end` | — | Boundary markers |
| `goal` | `player`, `assisting_player` (nullable), `detail` (`"penalty"` / null), `match_minute`, `added_minute`, `score`, `team_side` | `assisting_player` is null for penalties |
| `missed_goal` | `player`, `detail` (`"post"` etc.), `match_minute`, `team_side` | |
| `card` | `player`, `detail` (`"yellow"` / `"red"`), `match_minute`, `added_minute`, `team_side` | |
| `substitution` | `player_in`, `player_out`, `match_minute`, `added_minute`, `team_side` | Exact minute for time-on-pitch calculation |
| `stoppage_time` | `amount`, `match_minute` | |
| `injury` | `player`, `match_minute`, `team_side` | Not a scoring event |

### Scoring fields derivable from periods

| Fantasy field | How to derive |
|---|---|
| **Goals** | `type == "goal"`, `player.id` matches, not own goal |
| **Assists** | `type == "goal"` and `assisting_player` is not null |
| **Own goals** | `type == "goal"` and player's `team_side` scored against themselves (cross-ref with score delta) — or use `EventDigest.own_goal_count` from v1 lineups |
| **Yellow card** | `type == "card"`, `detail == "yellow"` |
| **Red card** | `type == "card"`, `detail == "red"` |
| **Minutes played** | Start at 0. If player started: begin at `match_start`. If subbed in: begin at substitution `match_minute`. End at `match_end` or substitution out minute. Add stoppage time if applicable. |
| **Clean sheet** | Player was on pitch for full match (or relevant period) AND opponent scored 0 goals — derive from scores + substitution timeline |

---

## Player Ratings (v3 lineups — undocumented, tested ✅)

- Endpoint: `/v3/matches/:id/lineups`
- `rating` field present on all players who played (null for unused bench)
- Range: 3.0–10.0 for players with >10 minutes
- v3 does **not** include `event_digest` — must use v1 lineups for that
- v3 includes extra player enrichment: `birthdate`, `height`, `region`, `teams` (player's clubs), `abbreviation`, `main_color`

---

## Matchday Deadlines (confirmed ✅)

No dedicated field. Fully derivable from `/v1/tournaments/426/matches`:
- Both `round` and `kickoff_at` (ISO-8601 UTC) are present on every match
- Logic: group matches by `round`, take `MIN(kickoff_at)` per round → this is the squad lock deadline
- Confirmed working across multiple rounds in live data

---

## Data Gap Analysis vs Fantasy App Requirements

| Requirement | Status | Detail |
|---|---|---|
| Match fixtures & schedules | ✅ Confirmed | `/v1/tournaments/426/matches` |
| Live scores & match status | ✅ Confirmed | `/v1/matches/:id` |
| Player names, positions, shirt numbers | ✅ Confirmed | Lineups + squad endpoints |
| Confirmed & predicted lineups | ✅ Confirmed | v1 + v2 endpoints |
| Injury & suspension status | ✅ Confirmed | `/v2/players/:id/availability` etc. |
| Goals | ✅ Confirmed | `EventDigest` + `periods` event stream |
| Own goals | ✅ Confirmed | `EventDigest.own_goal_count` |
| Yellow / Red cards | ✅ Confirmed | `EventDigest.card` + `periods` |
| Substitution events | ✅ Confirmed | `EventDigest.substitution` + `periods` |
| **Assists** | ✅ Confirmed | `periods` — `assisting_player` on goal events (null for penalties) |
| **Minutes played** | ✅ Derivable | `periods` substitution events with exact `match_minute` |
| **Clean sheets** | ✅ Derivable | Derive from scores + player time on pitch (no direct field) |
| **Matchday deadlines** | ✅ Derivable | `MIN(kickoff_at)` per `round` from tournament matches |
| Player match ratings | ✅ Confirmed | `/v3/matches/:id/lineups` — rating field (>10 min played) |
| **Player valuations / costs** | ❌ Not available | Provider confirmed — may come post-World Cup. Must manage independently. |
| **Season statistics (averages)** | ⚠️ Coming soon | Provider says soon; no endpoint yet |
| Per-match player stats (extended) | ✅ Confirmed | `/v2/matches/:id/player_statistics` — 36 stat categories incl. xG, xA, saves, tackles, minutes |

---

## Per-Match Player Statistics (tested ✅)

`/v2/matches/:id/player_statistics` returns a `player_statistics` object where each key is a stat category. Each category contains a ranked array of `{ player_id, team_id, value, rank }` entries — only players who registered a non-zero value appear.

**Structure note:** this is a ranked leaderboard per category, not a flat per-player record. To build a full player stat line, iterate all categories and index by `player_id`.

### All 36 available stat categories

| Category | Fantasy relevance |
|---|---|
| `goals` | ✅ Core scoring — direct |
| `assists` | ✅ Core scoring — direct |
| `minutes_played` | ✅ Core scoring — direct (simpler than deriving from periods) |
| `yellow_cards` | ✅ Core scoring — direct |
| `saves` | ✅ Core scoring for GKs |
| `shots_on_target` | ⭐ Bonus points candidate |
| `big_chances_created` | ⭐ Bonus points candidate |
| `expected_goals` | ⭐ xG — useful for projections |
| `expected_assists` | ⭐ xA — useful for projections |
| `expected_goal_involvement` | ⭐ xGI — useful for projections |
| `key_passes` | ℹ️ Midfield quality metric |
| `won_tackles` | ℹ️ Defensive bonus candidate |
| `total_clearances` | ℹ️ Defensive stat |
| `interceptions` | ℹ️ Defensive stat |
| `aerial_duels_won` | ℹ️ Physical stat |
| `aerial_duels_lost` | ℹ️ Physical stat |
| `accurate_passes` | ℹ️ Passing quality |
| `total_passes` | ℹ️ Passing volume |
| `accurate_long_balls` | ℹ️ Passing quality |
| `total_long_balls` | ℹ️ Passing volume |
| `accurate_crosses` | ℹ️ Wide play quality |
| `total_crosses` | ℹ️ Wide play volume |
| `won_dribbles` | ℹ️ Attacking threat |
| `total_dribbles` | ℹ️ Attacking volume |
| `total_shots` | ℹ️ Attacking volume |
| `total_tackles` | ℹ️ Defensive volume |
| `duels_won` | ℹ️ Physical stat |
| `duels_lost` | ℹ️ Physical stat |
| `touches` | ℹ️ Involvement metric |
| `fouls` | ℹ️ Negative stat candidate |
| `penalty_area_entries` | ℹ️ Attacking threat |
| `corners_taken` | ℹ️ Set piece involvement |
| `hit_woodwork` | ℹ️ Attacking bad luck |
| `saves` | ✅ GK stat |
| `keeper_throws` | ℹ️ GK distribution |
| `accurate_keeper_throws` | ℹ️ GK distribution quality |

**Key insight:** `minutes_played` is directly available here — **no need to derive from substitution events in the periods endpoint**. This simplifies the scoring engine significantly.

---

## Key Decisions & Workarounds

### Player valuations
Not available from API. Must be defined and maintained independently (e.g., seed from FPL public data or manual curation). No confirmed timeline from provider.

### v1 vs v3 lineups — use both
- v1 (`/v1/matches/:id/lineups`): use for `event_digest` (goals, cards, substitution summary)
- v3 (`/v3/matches/:id/lineups`): use for player `rating` and enriched player metadata
- Periods endpoint is the most granular source for scoring engine events

### Clean sheets
Derive in the scoring engine: player was on pitch for the full match (or a defined minimum, e.g. 60 min) AND the opposing team scored 0 goals according to `MatchScores`.

---

## Provider Communication Log

### Round 1 — Initial outreach (us)
Sent questions on: EventDigest structure, player valuations, season statistics, matchday deadlines.

### Round 2 — Provider reply
- ✅ Shared undocumented events endpoint: `/v2/matches/:id/periods`
- ✅ Shared undocumented v3 lineups with ratings: `/v3/matches/:id/lineups`
- ❌ Valuations: not available, possibly post-World Cup
- ⚠️ Season stats: coming soon; per-match stats available now (endpoint not shared)
- ❓ Matchday deadlines: provider misunderstood — thought we asked about squad at season start

### Round 3 — Our reply (sent)
After our own testing, asked two questions:
1. Per-match player stats endpoint
2. Season statistics timeline

### Round 4 — Provider reply
- ✅ Shared `/v2/matches/:id/player_statistics` — 36 stat categories (tested immediately)

### Open items
1. **Season statistics** — timeline still unknown, not answered yet
