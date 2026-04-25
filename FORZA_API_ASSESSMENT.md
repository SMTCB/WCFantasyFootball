# Forza Football API - Data Requirements Assessment

## App Functionalities vs API Capabilities

### Core Features & Data Requirements

| Feature | Data Required | Forza API | Status | Notes |
|---------|---|---|---|---|
| **Squad Management** | | | | |
| Build 11-player squad | Player ID, name, position, team, shirt number | ✅ | Ready | LineupPlayer object provides all needed fields |
| Position validation (3-5 DEF, 5 MID+FWD, etc.) | Player position enum | ✅ | Ready | position field: "goalkeeper", "defender", "midfielder", "attacker" |
| Budget enforcement | Player cost/value | ❌ | **MISSING** | No player valuation/cost in API |
| **Player Status** | | | | |
| Injury/suspension alerts | Player availability status | ✅ | Ready | `/v2/players/:id/availability` returns suspensions & absences |
| Lineup prediction | Predicted XI before kickoff | ✅ | Ready | `/v2/matches/:id/predicted_lineups` available |
| **Live Scoring** | | | | |
| Live match events | Goals, assists, cards (real-time) | ❓ | **NEEDS CONFIRMATION** | `event_digest` in LineupPlayer — contents not yet verified |
| Player point breakdown | Per-player fantasy points calculation | ❌ | **MISSING** | No explicit fantasy points in API; only raw events |
| Season averages | Player avg points per match (for projections) | ❌ | **MISSING** | Critical for LiveScreen projections; not in API |
| **Match Fixtures** | | | | |
| Fixture list | Matches, teams, kickoff times | ✅ | Ready | `/v1/tournaments/:id/matches` + `/v1/matches/:id` |
| Live scores & status | Real-time match status | ✅ | Ready | MatchScores in `/v1/matches/:id` |
| **Transfers & Deadlines** | | | | |
| Deadline enforcement | Matchday deadline timestamps | ❓ | **UNCLEAR** | Not documented; may be in tournament metadata |
| Transfer window lock | Window lock status | ❓ | **UNCLEAR** | Not documented |
| **Predictions** | | | | |
| Top scorer predictions | Player prediction data | ❌ | **MISSING** | No prediction endpoints found |
| Form/momentum data | Player recent performance trend | ❌ | **MISSING** | No form/trend data in API |

---

## Data Gap Summary

### 🟢 **Green Light — Fully Supported**
- ✅ Player master data (names, positions, teams)
- ✅ Match fixtures & schedules
- ✅ Live match scores & status
- ✅ Team lineups & squad rosters
- ✅ Player suspensions & injury status
- ✅ Predicted lineups (pre-match)

### 🟡 **Yellow Light — Needs Confirmation**
- ❓ Match event details (goals, assists, cards) — in `event_digest` but structure unknown
- ❓ Matchday deadlines — not documented in API spec
- ❓ Transfer window metadata — not documented

### 🔴 **Red Light — Missing Critical Data**
- ❌ **Fantasy points per player per match** — Not available; must calculate from raw events
- ❌ **Season average points per player** — Required for LiveScreen projections; not available
- ❌ **Player costs/squad budget** — Required for squad building; not available
- ❌ **Player predictions** — Top scorer, form data; not available
- ❌ **Real-time streaming** — API is snapshot-based; no WebSocket/Realtime support (we handle this via Supabase Realtime, but data must be written to our DB by you)

---

## PoC Requirements vs Forza Capabilities

### What We Can Do Immediately (PoC-Ready)
1. ✅ Build squads from player roster + validate formations
2. ✅ Display live match scores & fixture lists
3. ✅ Show player injury/suspension warnings
4. ✅ Predict lineups before matches

### What Requires Clarification (Next Steps)
1. ❓ Extract match events (goals, assists) from `event_digest`
2. ❓ Confirm deadline/window lock data availability

### What Requires Additional Solution
1. ❌ **Squad budget system** — Need player valuations
   - Option A: Forza provides player costs
   - Option B: We implement a custom valuation system
   - Option C: This feature deferred from PoC

2. ❌ **Fantasy points calculation** — Need to define rules
   - Option A: Forza has a formula endpoint (unlikely)
   - Option B: We implement FPL-style calculation on top of raw events
   - Option C: Forza calculates and provides `fantasy_points` in event_digest (need to confirm)

3. ❌ **Player season averages** — For LiveScreen projections
   - Need historical player stats or a separate stats provider
   - Forza may have these in an undocumented endpoint

4. ❌ **Predictions** — Top scorer, form data
   - This is a separate feature; not blocking PoC

---

## Questions for Forza Support

**Priority 1 (Blocking PoC):**
1. What fields are in the `event_digest` response? (goals, assists, cards, minutes, etc.?)
2. Does your API provide player valuations/costs?
3. Do you have an endpoint for matchday deadlines/window lock times?
4. Do you have player season statistics (avg points, minutes, goals, assists)?

**Priority 2 (Nice to Have):**
5. Do you have a top scorer or player prediction endpoint?
6. Do you support WebSocket/real-time data streaming, or snapshots only?
7. Are there any undocumented endpoints for player stats or tournament metadata?

---

## Data Flow for MVP

```
Forza API
├── /v1/tournaments/426/matches          → Fixture list
├── /v1/matches/{id}                     → Match details (score, status)
├── /v1/matches/{id}/lineups             → Actual lineups + event_digest [NEED CONTENT]
├── /v1/matches/{id}/predicted_lineups   → Pre-match predictions
├── /v2/players/{id}/availability        → Injury/suspension status
└── /v1/teams/{id}/squad                 → Team roster

→ Our Supabase
├── fixtures (from /v1/tournaments/*/matches)
├── players (from /v1/teams/*/squad)
├── player_status (from /v2/players/*/availability)
├── match_events (from event_digest + manual mapping) [NEED STRUCTURE]
├── fantasy_points (calculated from event_digest or provided by Forza?)
└── player_stats (from Forza OR external source)

→ Our App
├── SquadScreen (squad building, formation validation)
├── LiveScreen (match events, player point breakdown, projections)
├── MarketScreen (player list, availability)
└── RecapScreen (historical performance)
```

---

## Recommendation

**Go ahead with integration, but:**
1. Get detailed responses to the 7 questions above
2. Focus MVP on PoC features marked "✅ Green Light"
3. Defer features requiring missing data (budget, predictions) to Phase 2
4. Plan fallback: if Forza lacks critical data, have budget for alternate provider (StatsBomb, Opta, or data enrichment service)
