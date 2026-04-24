# Preliminary Scoring Mechanism: Player Historical Baselines

## Overview

The "preliminary scoring" mechanism provides baseline expected points for each player based on historical performance. This is used for:
- **Squad projections** during live matches (for players not yet playing)
- **Player valuations** (cost = base + historical_avg × multiplier)
- **Initial form assessment** before season data exists

This document outlines all viable approaches, their trade-offs, and recommended implementation paths.

---

## Approach 1: StatsBomb Open Data (Data-Driven, Recommended for PoC)

### Summary
Parse StatsBomb's public World Cup and club season event data to calculate player statistics, then aggregate into historical baselines.

### Data Availability

✅ **World Cup:** 2022, 2018, 1990, 1986, 1974, 1970, 1962, 1958  
✅ **Club Leagues:** Premier League (2003-2021), La Liga (2004-2021), Serie A, Bundesliga, Ligue 1  
✅ **International:** Champions League (2003-2019), Copa America, Euro  
📅 **2026 World Cup:** Not available until after tournament (Q12 2026)

### Data Structure

**Format:** Event-level JSON (not pre-aggregated)
- Each match file contains ~2,000-3,000 events
- Events include: passes, shots, fouls, tackles, goals, substitutions
- Each event tagged with player ID and outcome

**Example event:**
```json
{
  "id": "goal_12345",
  "type": "Shot",
  "player": {"id": 5203, "name": "Cristiano Ronaldo"},
  "possession_team": {"id": 676, "name": "Portugal"},
  "shot": {"outcome": "Goal", "xG": 0.45},
  "timestamp": "45:23"
}
```

### Implementation Steps

| Phase | Task | Effort | Dependencies |
|-------|------|--------|---|
| 1 | Download StatsBomb 2022 World Cup JSON (~150MB) | 2 hours | None |
| 2 | Build event parser + aggregator script (Python/Node) | 2-3 days | None |
| 3 | Calculate per-player stats (goals, assists, clean sheets, minutes) | 1-2 days | Phase 2 complete |
| 4 | **Player ID mapping** (StatsBomb ↔ Forza ↔ Internal) | 2-3 days | Critical blocker |
| 5 | Merge World Cup + recent club season data (optional) | 2-3 days | Phase 4 partial |
| 6 | Calculate preliminary avg points per match | 1 day | Phase 3 complete |
| 7 | Validate against manual spot-checks (30-40 players) | 1 day | Phase 6 complete |
| 8 | Store in PostgreSQL `player_season_baseline` table | 1 day | Phase 7 complete |

**Total Effort: 10-15 days**

### Baseline Calculation Formula

```
For each player:
  goals_scored = count(shots where outcome='Goal')
  assists = count(passes leading to goal)
  clean_sheets = count(matches where player_team_conceded=0)
  minutes_played = sum(minutes in lineup)
  matches_played = count(matches where player in lineup)

  preliminary_avg_points = (
    (goals_scored × 5) +
    (assists × 2) +
    (clean_sheets × 1)  # GK/DEF only
  ) / matches_played
```

### Pros & Cons

✅ **Pros:**
- Real data from actual competition
- Defensible and traceable to source
- Can blend multiple seasons for more accuracy
- Free (no API costs)
- Granular (can analyze by tournament, opponent, phase)

❌ **Cons:**
- Requires custom parsing script (not a simple CSV download)
- Player ID mapping is complex and error-prone
- 2026 World Cup data won't exist until after tournament
- Small sample size (WC players: 4-7 matches per team in 2022)
- Club data coverage varies by league (Premier League complete, others partial)

### Player ID Mapping Problem (Critical)

**Issue:** Same player has different IDs across sources
- StatsBomb: 5203 (Cristiano Ronaldo)
- Forza API: 845621 (Cristiano Ronaldo)
- Your internal DB: uuid-abc123

**Solutions:**

**Option A: Manual Mapping CSV**
```csv
statsbomb_id,forza_id,player_name,position,team
5203,845621,Cristiano Ronaldo,FWD,Portugal
...
```
- Effort: 3-4 hours for key 200 players
- Pros: 100% accurate
- Cons: Doesn't scale, must maintain manually

**Option B: Fuzzy Matching (Recommended)**
```python
def match_player(sb_player, forza_roster):
  candidates = forza_roster.filter(
    position == sb_player.position,
    team == sb_player.team
  )
  best_match = max(candidates, key=similarity_score(name))
  return best_match if confidence > 0.85 else MANUAL_REVIEW
```
- Effort: 2-3 days dev
- Pros: Scales, handles misspellings
- Cons: Some false positives require manual review

**Option C: Wyscout / Understat Pre-Built Mapping**
- Effort: 1-2 days integration
- Pros: Professional, maintained
- Cons: Another dependency, potential API costs

### Recommended Approach for PoC

1. **Weeks 1-2:** Download StatsBomb 2022 World Cup data
2. **Weeks 2-3:** Build fuzzy matcher for 832 World Cup players (fuzzy match + spot-check top 100)
3. **Week 3:** Merge with 2024-25 club season data (if available):
   - Blend: 40% World Cup 2022 + 60% recent club (more relevant)
4. **Week 4:** Validate and store in `player_season_baseline`
5. **Phase 2+:** When real World Cup 2026 data arrives, retrain with actual results

---

## Approach 2: FPL (Fantasy Premier League) API

### Summary
Use FPL's public API, which provides pre-calculated player statistics and points.

### Data Availability

✅ **Seasons:** 2003-present  
✅ **Players:** Complete Premier League + all historical transfers  
✅ **Statistics:** Goals, assists, clean sheets, bonus points, minutes  
✅ **Updates:** Daily during season

❌ **World Cup:** Not covered (FPL only tracks Premier League)  
❌ **Other Leagues:** Not available

### Implementation

```python
import requests

# Get all players
players = requests.get('https://fantasy.premierleague.com/api/bootstrap-static/').json()

# For each player, extract:
player_stats = {
  'name': player['first_name'] + ' ' + player['second_name'],
  'position': POSITION_MAP[player['element_type']],
  'team': TEAM_MAP[player['team']],
  'total_points': player['total_points'],
  'minutes': player['minutes'],
  'goals': player['goals_scored'],
  'assists': player['assists'],
  'clean_sheets': player['clean_sheets'],
  'avg_points_per_match': player['total_points'] / (player['minutes'] / 90)
}
```

**Effort: 1-2 days** (data fetch + normalization)

### Pros & Cons

✅ **Pros:**
- Pre-calculated points (no aggregation needed)
- Proven fantasy scoring rules (familiar to users)
- Complete historical data (20+ years)
- Simple API, well-documented
- Easy player ID mapping (FPL player IDs are stable)

❌ **Cons:**
- **No World Cup data** (major blocker for your PoC)
- Only Premier League players (missing ~60% of World Cup squad)
- ToS violation risk (FPL explicitly forbids scraping)
- Not customizable to your scoring rules
- World Cup players playing abroad may have stale PL stats

### Recommended Use

**Not recommended for PoC.** Only viable if:
1. You defer World Cup data until after tournament
2. You use PL 2023-24 season as fallback for non-PL players
3. You're willing to accept ToS risk

### Alternative: Official FPL World Cup (Closed Data)

FPL doesn't publish World Cup data publicly, but you could:
- Request data directly from FPL (enterprise partnership)
- Wait until after 2026 World Cup to use actual results

---

## Approach 3: Understat / Wyscout (Professional Data)

### Summary
Use commercial football data providers with complete coverage and advanced metrics.

### Data Availability

**Understat:**
✅ Top 5 European leagues (Premier League, La Liga, Serie A, Bundesliga, Ligue 1)  
✅ European competitions (Champions League, Europa League)  
❓ World Cup (varies by year)  
✅ Advanced metrics (xG, xA, pressures, tackles, etc.)

**Wyscout:**
✅ All major tournaments (World Cup, Euro, Copa America, African Cup of Nations)  
✅ All professional leagues  
✅ Video + data integration  
❌ Most data behind paywall (limited free tier)

### Implementation

```python
# Understat example (requires subscription)
from understat import Understat

async with Understat() as understat:
  player_data = await understat.get_player_data(
    season=2022,
    league='WC'  # World Cup
  )
  for player in player_data:
    baseline = {
      'player': player['player_name'],
      'goals': player['goals'],
      'assists': player['assists'],
      'xG': player['xG'],
      'xA': player['xA']
    }
```

**Effort: 3-5 days** (API integration + credential setup)

### Pros & Cons

✅ **Pros:**
- Complete World Cup coverage
- Professional data quality
- Advanced metrics (xG, xA, pressure, tackles)
- Stable APIs and documentation
- No ToS violations

❌ **Cons:**
- **Cost: $$$** (typically $100-1000+/month)
- Not free
- Overkill for PoC (you don't need xG yet)
- Additional dependency on external service
- May require contract negotiation

### Recommended Use

**Phase 2+, not PoC.** Only consider if:
1. You have budget for data licensing
2. You need advanced metrics for sophisticated models
3. You want professional SLA guarantees

---

## Approach 4: Manual Data Curation + Hardcoded Baseline

### Summary
Manually research and hardcode player averages for the 832 World Cup squad.

### Data Sources

- **Wikipedia World Cup squad lists** (names, positions, clubs)
- **ESPN / Sky Sports player stats** (season statistics)
- **Club websites** (limited, inconsistent)
- **Transfermarkt** (player profiles, basic stats)

### Implementation

```javascript
// Hardcoded baseline (example)
const playerBaselines = {
  'Cristiano Ronaldo': {
    position: 'FWD',
    team: 'Portugal',
    career_avg_points: 7.2,
    confidence: 'HIGH'  // 100+ matches in international
  },
  'Unknown Young Player': {
    position: 'DEF',
    team: 'Small Nation',
    career_avg_points: 4.5,
    confidence: 'LOW'  // 3 matches in international
  }
  // ... 830 more players
}
```

**Effort: 20-30 hours** (research + manual entry)

### Pros & Cons

✅ **Pros:**
- Fast to bootstrap
- Fully under your control
- No external dependencies
- Can cherry-pick best sources

❌ **Cons:**
- **Not scalable** (must redo for each tournament)
- Error-prone (manual data entry)
- No defensibility (where did you get these numbers?)
- Inconsistent data quality (some players have better stats than others)
- Not reproducible

### Recommended Use

**Not recommended for PoC.** Only as a temporary fallback if all other approaches fail.

---

## Approach 5: Hybrid (Recommended for Production)

### Summary
Combine multiple approaches for robustness and accuracy.

### Implementation

```
Phase 1 (PoC):
├─ Primary: StatsBomb 2022 World Cup (real tournament data)
├─ Fallback: FPL 2023-24 for non-WC players
└─ Gap-filler: Position average (GK:6, DEF:5, MID:7, FWD:8)

Phase 2 (Live Season):
├─ Primary: Real World Cup 2026 events (as tournament progresses)
├─ Recent club form: 2024-25 club season data (blended)
├─ Secondary: Historical baseline (weighted lower over time)
└─ ML model: Learn player performance patterns (per-player adjustment)

Phase 3+ (Mature):
├─ Primary: Real seasonal data + form trends
├─ Historical: Kept for low-confidence players only
└─ External: Understat/Wyscout for advanced metrics (optional)
```

### Blending Formula

```python
# Dynamic weighting based on data recency and confidence
def get_player_baseline(player_id, current_week):
  historical_avg = fetch_statsbomb_avg(player_id)
  current_season_avg = fetch_forza_events_avg(player_id)
  recent_form = calculate_last_5_matches(player_id)
  
  if current_week < 2:
    # Season just started, trust history
    return 0.8 * historical_avg + 0.2 * current_season_avg
  elif current_week < 10:
    # Some data, blend it
    return 0.5 * historical_avg + 0.4 * current_season_avg + 0.1 * recent_form
  else:
    # Plenty of current data, weight it heavily
    return 0.2 * historical_avg + 0.6 * current_season_avg + 0.2 * recent_form
```

**Effort: 15-20 days** (bootstrap StatsBomb + architecture for Phase 2)

### Pros & Cons

✅ **Pros:**
- Robust (multiple fallbacks)
- Improves over time
- Defensible (traceable to sources)
- Scales across multiple tournaments
- Adaptable to rule changes

❌ **Cons:**
- Complex to implement
- Requires ongoing maintenance
- Multiple dependencies

### Recommended Use

**Best for production.** Start with StatsBomb in PoC, evolve to hybrid over seasons.

---

## Comparison Matrix

| Approach | Effort | Cost | Data Quality | World Cup Coverage | Scalability | ToS Risk | Recommended |
|----------|--------|------|--------------|-------------------|-------------|----------|-------------|
| **StatsBomb** | 10-15 days | Free | ⭐⭐⭐⭐ | ✅ (2022) | ⭐⭐⭐ | None | **PoC** |
| **FPL API** | 1-2 days | Free | ⭐⭐⭐⭐ | ❌ | ⭐ | High | Not recommended |
| **Understat** | 3-5 days | $$$$ | ⭐⭐⭐⭐⭐ | ✅ | ⭐⭐⭐⭐ | None | Phase 2+ |
| **Manual** | 20-30 hrs | Free | ⭐⭐ | ✅ (effort) | ⭐ | None | Fallback only |
| **Hybrid** | 15-20 days | Free→$$ | ⭐⭐⭐⭐⭐ | ✅ | ⭐⭐⭐⭐⭐ | None | **Production** |

---

## Recommendation for Your PoC

### Primary Path: StatsBomb + Manual Validation

**Timeline:**
- **Weeks 1-2:** Download and parse StatsBomb 2022 World Cup
- **Weeks 2-3:** Build fuzzy matcher + validate top 100 players
- **Week 3:** Merge with 2024-25 club season (if available)
- **Week 4:** Calculate baselines, store in DB

**Fallback:**
- If StatsBomb mapping fails: Use position averages (GK:6, DEF:5, MID:7, FWD:8)
- For unmapped players: Interpolate from teammates of same position/team

**Phase 2 (Post-PoC):**
- When Forza event_digest is confirmed: Start capturing real World Cup 2026 data
- Build ML model to predict player points from events
- Gradually replace historical baseline with learned model

### Key Success Factor

**Player ID mapping is critical.** Invest 2-3 days in fuzzy matching + manual validation of the top 100 players. This is more important than having perfect data for 832 players.

---

## Next Steps

1. ✅ **Confirm** which approach you want to start with (recommend StatsBomb)
2. ✅ **Scope** player ID mapping approach (fuzzy match vs. manual)
3. ✅ **Begin** downloading StatsBomb data in parallel with Forza API clarification
4. ✅ **Plan** Phase 2 transition to real event data once Forza confirms event_digest

---

## Appendix: Code Skeleton

### Python Script: StatsBomb Data Ingestion

```python
import json
import requests
from pathlib import Path

# 1. Download StatsBomb data
def download_statsbomb_data():
    url = "https://raw.githubusercontent.com/statsbomb/open-data/master/data/matches/67_2022.json"
    response = requests.get(url)
    matches = response.json()
    return matches

# 2. Parse match events
def parse_match_events(match_id):
    url = f"https://raw.githubusercontent.com/statsbomb/open-data/master/data/events/{match_id}.json"
    response = requests.get(url)
    events = response.json()
    return events

# 3. Aggregate player stats
def aggregate_player_stats(events):
    player_stats = {}
    
    for event in events:
        if 'player' not in event:
            continue
        
        player_id = event['player']['id']
        player_name = event['player']['name']
        
        if player_id not in player_stats:
            player_stats[player_id] = {
                'name': player_name,
                'goals': 0,
                'assists': 0,
                'minutes': 0,
                'matches': set()
            }
        
        # Count goals
        if event['type']['name'] == 'Shot' and event['shot']['outcome']['name'] == 'Goal':
            player_stats[player_id]['goals'] += 1
        
        # Count assists
        if 'assist' in event and event['assist'] is not None:
            player_stats[player_id]['assists'] += 1
    
    return player_stats

# 4. Fuzzy match players
from difflib import SequenceMatcher

def fuzzy_match_player(statsbomb_name, forza_roster):
    best_match = None
    best_ratio = 0
    
    for forza_player in forza_roster:
        ratio = SequenceMatcher(None, statsbomb_name.lower(), forza_player['name'].lower()).ratio()
        if ratio > best_ratio:
            best_ratio = ratio
            best_match = forza_player
    
    if best_ratio > 0.85:
        return best_match
    else:
        return None  # Requires manual review
```

---

## Document History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-04-22 | Initial document: StatsBomb, FPL, Understat, Manual, and Hybrid approaches |
