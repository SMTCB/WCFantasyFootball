# Fantasy Points Scoring Layer

## Overview

The scoring layer transforms raw match events (goals, assists, cards, etc.) into fantasy points for each player. This is the core engine powering:
- **Live score updates** (real-time point calculation during matches)
- **Recap cards** (final matchday performance summary)
- **Squad projections** (expected points for players still in upcoming matches)
- **Player performance analytics** (historical points tracking)

This document details the scoring rules, implementation architecture, and data flow.

---

## Scoring Rules

### Base Scoring System

The scoring system is designed to be modular so it can be swapped for different rulesets (FPL, Sleeper, custom, etc.).

#### Goalkeeper (GK)

| Event | Points | Conditions |
|-------|--------|-----------|
| **Minute Played** | +1 | Per 90 minutes (pro-rated) |
| **Goal Scored** | +5 | Rare for GK |
| **Goal Conceded** | -1 | Per goal (if played min 60 min) |
| **Clean Sheet** | +4 | If 0 goals conceded (min 60 min) |
| **Own Goal** | -2 | - |
| **Penalty Save** | +5 | Successful penalty save |
| **Yellow Card** | -1 | - |
| **Red Card** | -3 | - |
| **Bonus Points** | +3, +2, +1 | Top 3 performers (BPS system) |

**Example:**
```
Player: Alisson (GK, Liverpool)
Minutes: 90
Goals conceded: 1
Clean sheet: No
Yellow card: 0
Bonus: +2 (second-best player)

Points = 90/90×1 + (-1) + 0 + (-2) = 1 point
```

#### Defender (DEF)

| Event | Points | Conditions |
|-------|--------|-----------|
| **Minute Played** | +1 | Per 90 minutes (pro-rated) |
| **Goal Scored** | +4 | Rare but valuable |
| **Assist** | +1 | Counted if player touched ball before final pass |
| **Goal Conceded** | 0 | No penalty (but clean sheet bonus denied) |
| **Clean Sheet** | +4 | Team conceded 0 goals (min 60 min) |
| **Tackle** | +0.5 | Per tackle won (Understat/Opta counts) |
| **Interception** | +0.25 | Per interception |
| **Own Goal** | -2 | - |
| **Yellow Card** | -1 | - |
| **Red Card** | -3 | - |
| **Bonus Points** | +3, +2, +1 | Top 3 performers (BPS system) |

**Example:**
```
Player: Van Dijk (DEF, Liverpool)
Minutes: 90
Goals conceded: 1 (clean sheet denied)
Assist: 0
Tackles: 3
Yellow card: 0
Bonus: +3 (best player)

Points = 90/90×1 + 0 + 0 + 0 + 3×0.5 + 0 + 0 + 3 = 1 + 1.5 + 3 = 5.5 points
```

#### Midfielder (MID)

| Event | Points | Conditions |
|-------|--------|-----------|
| **Minute Played** | +1 | Per 90 minutes (pro-rated) |
| **Goal Scored** | +5 | Key metric for midfielders |
| **Assist** | +1 | Final pass before goal |
| **Clean Sheet** | +1 | Team conceded 0 goals (min 60 min) |
| **Tackle** | +0.5 | Per tackle won |
| **Interception** | +0.25 | Per interception |
| **Own Goal** | -2 | - |
| **Yellow Card** | -1 | - |
| **Red Card** | -3 | - |
| **Bonus Points** | +3, +2, +1 | Top 3 performers (BPS system) |

**Example:**
```
Player: Bruno Fernandes (MID, Manchester United)
Minutes: 90
Goals: 1
Assists: 1
Clean sheet: No (conceded 2)
Yellow: 0
Bonus: +2

Points = 90/90×1 + 1×5 + 1×1 + 0 + 0 + 2 = 1 + 5 + 1 + 2 = 9 points
```

#### Forward (FWD)

| Event | Points | Conditions |
|-------|--------|-----------|
| **Minute Played** | +1 | Per 90 minutes (pro-rated) |
| **Goal Scored** | +3 | Primary responsibility |
| **Assist** | +1 | Final pass before goal |
| **Penalty Scored** | +1 | Bonus on top of goal |
| **Penalty Missed** | -1 | Failed penalty |
| **Own Goal** | -2 | - |
| **Yellow Card** | -1 | - |
| **Red Card** | -3 | - |
| **Bonus Points** | +3, +2, +1 | Top 3 performers (BPS system) |

**Example:**
```
Player: Haaland (FWD, Manchester City)
Minutes: 87
Goals: 2
Assists: 0
Penalty: Scored 1 (included in 2 goals)
Yellow: 1
Bonus: +3

Points = 87/90×1 + 2×3 + 1×1 + 1 + (-1) + 3 = 0.97 + 6 + 1 + 1 - 1 + 3 = 9.97 ≈ 10 points
```

---

## Bonus Points System (BPS)

The Bonus Points System (BPS) awards up to 3 bonus points to the top 3 performers in each match, based on a proprietary algorithm that weights:
- Shots on target
- Tackles
- Interceptions
- Clearances
- Dribbles
- Key passes
- Successful passes (%)
- Minutes played
- Goals
- Assists
- Clean sheets

### Simplified BPS Calculation (for MVP)

If you don't have access to StatsBomb's BPS algorithm, use a simplified version:

```python
def calculate_bps_score(player):
  """Calculate a basic BPS-like score for ranking"""
  score = 0
  score += player['goals'] * 30
  score += player['assists'] * 10
  score += player['shots_on_target'] * 3
  score += player['tackles_won'] * 1.5
  score += player['interceptions'] * 1
  score += player['minutes_played'] / 5
  score += player['pass_completion'] * 0.1
  return score

# Rank all players in match by BPS
players_bps = [(p, calculate_bps_score(p)) for p in match_players]
players_bps.sort(key=lambda x: x[1], reverse=True)

# Assign bonus
bonus_allocation = {0: 3, 1: 2, 2: 1}  # Top 3 get +3, +2, +1
for rank, (player, score) in enumerate(players_bps[:3]):
  player['bonus_points'] = bonus_allocation[rank]
```

---

## Data Flow: Event → Points

### Pipeline Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│ MATCH STARTS (Forza API or Realtime subscription)               │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
        ┌────────────────────────┐
        │ Raw Match Events       │
        │ (goals, assists, cards)│ ← From Forza API event_digest
        └────────────┬───────────┘
                     │
                     ▼
        ┌────────────────────────────┐
        │ Parse Event Digest         │
        │ • Goal: (player_id, min)   │
        │ • Assist: (player_id, min) │
        │ • Card: (type, player_id)  │
        └────────────┬───────────────┘
                     │
                     ▼
        ┌────────────────────────────────────┐
        │ Normalize to Internal Format       │
        │ INSERT INTO match_events (        │
        │   match_id, player_id,            │
        │   event_type, event_time,         │
        │   outcome                         │
        │ )                                 │
        └────────────┬───────────────────────┘
                     │
                     ▼
        ┌────────────────────────────────────────┐
        │ Aggregate Player Stats per Match       │
        │ SELECT player_id,                      │
        │   COUNT(*) as goals,                   │
        │   COUNT(*) as assists,                 │
        │   ... etc                             │
        │ GROUP BY player_id                     │
        └────────────┬─────────────────────────┘
                     │
                     ▼
        ┌────────────────────────────────────────┐
        │ Calculate Fantasy Points per Player    │
        │ points = apply_scoring_rules(stats)   │
        │ + apply_bonus(bps_ranking)             │
        │ + apply_chip_multipliers()             │
        └────────────┬─────────────────────────┘
                     │
                     ▼
        ┌────────────────────────────────────────┐
        │ Aggregate to Squad Level               │
        │ squad_points = SUM(player_points)     │
        │ by (squad_id)                          │
        └────────────┬─────────────────────────┘
                     │
                     ▼
        ┌────────────────────────────────────────┐
        │ Apply Captain / Chip Multipliers       │
        │ • Captain: ×2 pts                      │
        │ • Wildcard: +10% to all               │
        │ • Bench boost: All bench count        │
        │ • Triple captain: ×3 pts              │
        └────────────┬─────────────────────────┘
                     │
                     ▼
        ┌────────────────────────────────────────┐
        │ Final Squad Points                     │
        │ UPSERT INTO fantasy_points (          │
        │   squad_id, matchday_id,              │
        │   final_points, breakdown             │
        │ )                                     │
        └────────────┬─────────────────────────┘
                     │
                     ▼
        ┌────────────────────────────────────────┐
        │ Broadcast via Supabase Realtime       │
        │ supabase.channel('points')            │
        │   .send('broadcast', {squad_points})  │
        └────────────────────────────────────────┘
```

---

## Implementation: SQL-Based Scoring Engine

### Database Schema

```sql
-- Store raw events from Forza
CREATE TABLE match_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id INTEGER NOT NULL,
  player_id INTEGER NOT NULL,
  event_type VARCHAR(50),  -- 'goal', 'assist', 'yellow_card', etc.
  event_time INTEGER,       -- minute (e.g., 45)
  outcome JSONB,            -- additional details
  created_at TIMESTAMP DEFAULT now()
);

-- Player statistics aggregated per match
CREATE TABLE player_match_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id INTEGER NOT NULL,
  player_id INTEGER NOT NULL,
  minutes_played INTEGER DEFAULT 0,
  goals INTEGER DEFAULT 0,
  assists INTEGER DEFAULT 0,
  own_goals INTEGER DEFAULT 0,
  yellow_cards INTEGER DEFAULT 0,
  red_cards INTEGER DEFAULT 0,
  tackles_won INTEGER DEFAULT 0,
  interceptions INTEGER DEFAULT 0,
  bps_score DECIMAL(10, 2) DEFAULT 0,
  bonus_points INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT now()
);

-- Fantasy points per player per match
CREATE TABLE fantasy_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id INTEGER NOT NULL,
  player_id INTEGER NOT NULL,
  squad_id UUID NOT NULL,
  base_points DECIMAL(10, 2) DEFAULT 0,  -- Before chips
  bonus_points INTEGER DEFAULT 0,
  final_points DECIMAL(10, 2) DEFAULT 0, -- After chips
  breakdown JSONB,  -- {goals: 15, assists: 5, clean_sheet: 4, bonus: 3}
  created_at TIMESTAMP DEFAULT now(),
  UNIQUE(match_id, player_id, squad_id)
);

-- Squad-level aggregation
CREATE TABLE squad_matchday_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  squad_id UUID NOT NULL,
  matchday_id INTEGER NOT NULL,
  players_playing INTEGER DEFAULT 0,
  base_points DECIMAL(10, 2) DEFAULT 0,
  chip_bonus DECIMAL(10, 2) DEFAULT 0,
  final_points DECIMAL(10, 2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT now(),
  UNIQUE(squad_id, matchday_id)
);
```

### Scoring SQL Functions

```sql
-- 1. Calculate points for a single player's performance
CREATE OR REPLACE FUNCTION calculate_player_points(
  p_minutes INTEGER,
  p_position VARCHAR,
  p_goals INTEGER DEFAULT 0,
  p_assists INTEGER DEFAULT 0,
  p_own_goals INTEGER DEFAULT 0,
  p_yellow_cards INTEGER DEFAULT 0,
  p_red_cards INTEGER DEFAULT 0,
  p_penalty_saved INTEGER DEFAULT 0,
  p_penalty_missed INTEGER DEFAULT 0,
  p_bonus_points INTEGER DEFAULT 0
) RETURNS DECIMAL AS $$
DECLARE
  v_points DECIMAL := 0;
BEGIN
  -- Minutes played (1 point per 90)
  v_points := v_points + (p_minutes::DECIMAL / 90);
  
  -- Position-based scoring
  CASE p_position
    WHEN 'GK' THEN
      v_points := v_points + (p_goals * 5);
      v_points := v_points + (p_own_goals * -2);
      v_points := v_points + (p_penalty_saved * 5);
      v_points := v_points + (p_yellow_cards * -1);
      v_points := v_points + (p_red_cards * -3);
    WHEN 'DEF' THEN
      v_points := v_points + (p_goals * 4);
      v_points := v_points + (p_assists * 1);
      v_points := v_points + (p_own_goals * -2);
      v_points := v_points + (p_yellow_cards * -1);
      v_points := v_points + (p_red_cards * -3);
    WHEN 'MID' THEN
      v_points := v_points + (p_goals * 5);
      v_points := v_points + (p_assists * 1);
      v_points := v_points + (p_own_goals * -2);
      v_points := v_points + (p_yellow_cards * -1);
      v_points := v_points + (p_red_cards * -3);
    WHEN 'FWD' THEN
      v_points := v_points + (p_goals * 3);
      v_points := v_points + (p_assists * 1);
      v_points := v_points + (p_own_goals * -2);
      v_points := v_points + (p_penalty_missed * -1);
      v_points := v_points + (p_yellow_cards * -1);
      v_points := v_points + (p_red_cards * -3);
  END CASE;
  
  -- Bonus points
  v_points := v_points + p_bonus_points;
  
  RETURN ROUND(v_points, 2);
END;
$$ LANGUAGE plpgsql;

-- 2. Aggregate player stats from raw events
CREATE OR REPLACE FUNCTION aggregate_match_events(p_match_id INTEGER)
RETURNS TABLE (
  player_id INTEGER,
  goals INTEGER,
  assists INTEGER,
  own_goals INTEGER,
  yellow_cards INTEGER,
  red_cards INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    me.player_id,
    COUNT(*) FILTER (WHERE me.event_type = 'goal') AS goals,
    COUNT(*) FILTER (WHERE me.event_type = 'assist') AS assists,
    COUNT(*) FILTER (WHERE me.event_type = 'own_goal') AS own_goals,
    COUNT(*) FILTER (WHERE me.event_type = 'yellow_card') AS yellow_cards,
    COUNT(*) FILTER (WHERE me.event_type = 'red_card') AS red_cards
  FROM match_events me
  WHERE me.match_id = p_match_id
  GROUP BY me.player_id;
END;
$$ LANGUAGE plpgsql;

-- 3. Calculate squad points from player points
CREATE OR REPLACE FUNCTION calculate_squad_points(p_squad_id UUID, p_matchday_id INTEGER)
RETURNS DECIMAL AS $$
DECLARE
  v_points DECIMAL := 0;
  v_captain_multiplier INT := 1;
  v_chip RECORD;
BEGIN
  -- Sum all player points in squad (excluding subs)
  SELECT COALESCE(SUM(fp.final_points), 0)
  INTO v_points
  FROM fantasy_points fp
  JOIN squad_players sp ON fp.player_id = sp.player_id
  WHERE sp.squad_id = p_squad_id
    AND sp.matchday_id = p_matchday_id
    AND sp.position_in_squad = 'PITCH';  -- Only playing players
  
  -- Apply captain multiplier (if in squad)
  SELECT sp.multiplier
  INTO v_captain_multiplier
  FROM squad_players sp
  WHERE sp.squad_id = p_squad_id
    AND sp.is_captain = true
    AND sp.matchday_id = p_matchday_id;
  
  IF v_captain_multiplier > 1 THEN
    -- Re-add captain points with multiplier
    -- This is simplified; real implementation needs careful handling
    v_points := v_points * v_captain_multiplier;
  END IF;
  
  RETURN ROUND(v_points, 2);
END;
$$ LANGUAGE plpgsql;
```

### Real-Time Update Trigger (Edge Function)

```typescript
// Supabase Edge Function: poll-forza-and-update-points
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_KEY'))

export default async (req: Request) => {
  try {
    // 1. Poll Forza API for latest match events
    const matches = await fetch('https://api.forzafootball.com/v1/tournaments/426/matches', {
      headers: { access_token: Deno.env.get('FORZA_TOKEN') }
    }).then(r => r.json())

    // 2. For each live match, fetch events
    for (const match of matches.filter(m => m.status === 'live')) {
      const lineups = await fetch(
        `https://api.forzafootball.com/v1/matches/${match.id}/lineups`,
        { headers: { access_token: Deno.env.get('FORZA_TOKEN') } }
      ).then(r => r.json())

      // 3. Parse events from lineups → match_events table
      const events = parseEventDigest(lineups)
      await supabase.from('match_events').upsert(events)

      // 4. Aggregate stats
      await supabase.rpc('aggregate_match_events', { p_match_id: match.id })

      // 5. Calculate fantasy points
      await supabase.rpc('calculate_player_points_for_match', { p_match_id: match.id })

      // 6. Broadcast updates via Realtime
      supabase.channel(`match:${match.id}`).send('broadcast', {
        type: 'points_updated',
        timestamp: new Date(),
        match_id: match.id
      })
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}
```

---

## Implementation Timeline

| Phase | Task | Effort | Blocking? |
|-------|------|--------|-----------|
| **Phase 1** | Define scoring rules (review FPL / Sleeper rules) | 1 day | No |
| | Build SQL scoring functions | 2-3 days | No |
| | Implement BPS approximation | 1-2 days | No |
| | Wire Forza event_digest parsing | 2-3 days | **Yes** (needs Forza confirmation) |
| | Test with historical data (mock events) | 1-2 days | No |
| **Phase 2** | Deploy Edge Function for live polling | 1-2 days | No |
| | Set up Supabase Realtime broadcasts | 1 day | No |
| | Test with live matches | 2-3 days | No |
| | Build LiveScreen component to consume points | 2-3 days | No |
| **Total** | | **14-21 days** | ~5 days blocked on Forza |

---

## Handling Edge Cases

### Substitutions

When a player is substituted:
- Minutes stop accruing at substitution time
- Goal/assist after substitution don't count for that player
- Clean sheet bonus still counts (team achievement)

### VAR / Goal Review

If a goal is overturned:
- Remove goal from player stats
- Recalculate points immediately
- Broadcast correction to users

### Red Card in Match

If a player is sent off:
- Minutes stop at red card time
- -3 points applied
- Clean sheet bonus denied for that match

### Penalty Shootout Goals

In knockout matches with penalties:
- Penalties in open play count as regular goals
- Penalty shootout goals/saves count toward BPS but not toward base points (varies by rule)

---

## Testing Strategy

### Unit Tests

```python
# Test scoring rules
def test_goalkeeper_clean_sheet():
  points = calculate_player_points(
    p_minutes=90,
    p_position='GK',
    p_goals=0,
    p_assists=0,
    p_own_goals=0,
    p_yellow_cards=0,
    p_red_cards=0,
    p_bonus_points=3  # Clean sheet + bonus
  )
  assert points == 7  # 1 (min) + 4 (clean sheet) + 3 (bonus) - (0 conceded, so no deduction)

def test_forward_with_goals():
  points = calculate_player_points(
    p_minutes=87,
    p_position='FWD',
    p_goals=2,
    p_assists=0,
    p_own_goals=0,
    p_yellow_cards=0,
    p_red_cards=0,
    p_bonus_points=3
  )
  assert points == 10  # 0.97 (min) + 6 (goals) + 3 (bonus) ≈ 10
```

### Integration Tests

Test with 2022 World Cup historical data:
- Download full match data from StatsBomb
- Simulate goals/assists/cards
- Verify final points match expected values
- Compare against FPL's published points (if available for comparison)

### Live Testing

During live matches:
- Monitor Forza API for real events
- Track calculated points vs. official FPL points
- Identify discrepancies and rule mismatches
- Iterate on scoring rules

---

## Rule Customization

The scoring system should be configurable to support different rulesets:

```typescript
type ScoringRule = {
  position: 'GK' | 'DEF' | 'MID' | 'FWD'
  event: 'goal' | 'assist' | 'minute' | 'yellow_card' | 'red_card'
  points: number
  conditions?: string  // e.g., "if minutes >= 60"
}

const fplRules: ScoringRule[] = [
  { position: 'GK', event: 'minute', points: 1 },
  { position: 'GK', event: 'goal', points: 5 },
  // ...
]

const sleeperRules: ScoringRule[] = [
  // Different scoring system
]

function calculatePoints(stats, rules: ScoringRule[]): number {
  let points = 0
  for (const rule of rules) {
    if (rule.position === stats.position && rule.event === 'goal') {
      points += stats.goals * rule.points
    }
    // ... etc
  }
  return points
}
```

---

## Performance Considerations

### Real-Time Scoring at Scale

For 832 World Cup players + multiple matches:
- Use batch inserts to `match_events` (not row-by-row)
- Aggregate stats once per event batch (not per event)
- Cache BPS calculations (don't recalculate every 30 seconds)
- Use partial indexes on `(match_id, player_id)` for fast lookups

### Database Optimization

```sql
CREATE INDEX idx_match_events_match_player 
ON match_events(match_id, player_id);

CREATE INDEX idx_fantasy_points_squad_matchday 
ON fantasy_points(squad_id, matchday_id);

CREATE INDEX idx_player_match_stats_match 
ON player_match_stats(match_id);
```

---

## Document History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-04-22 | Initial document: Scoring rules, data flow, SQL implementation, testing strategy |
