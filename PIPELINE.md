# ForzaKit — Data Pipeline & Backend Architecture

This document describes the live data pipeline, Edge Function contracts, and DB schema conventions.  
Last updated: 2026-05-03

---

## Overview

```
Forza Football API
       │
       ▼
 Supabase Edge Functions  (Deno, deployed per function)
       │
       ▼
 Supabase Postgres DB  ──► React Frontend (Vercel)
```

All competition data flows from the [Forza Football API](https://api.forzafootball.com) into Supabase via four Edge Functions. The frontend reads only from the DB — it never calls Forza directly.

---

## Edge Functions

### `sync-fixtures` (v3)
**Trigger:** Manual POST or future pg_cron job  
**Input:** `{ forza_id: string }` — Forza tournament ID (e.g. `"426"` for EPL 2025-26)  
**Guard:** Requires `tournaments.sync_enabled = true` for the given `forza_id`

**What it does:**
1. Fetches all matches for the tournament from `/v1/tournaments/:id/matches`
2. Upserts into `fixtures` (keyed on `id = f-{forza_match_id}`)
3. Stamps `matchday_id` as `{tournament.slug}-r{round}` (e.g. `epl-2526-r34`)
4. Derives one deadline per round (earliest kickoff) and upserts into `matchday_deadlines`

**matchday_id convention:** Always `{tournament.slug}-r{round}`. The slug comes from `tournaments.slug` — e.g. `epl-2526`, `wc-2026`. This is stable, human-readable, and competition-agnostic.

---

### `ingest-match-events` (v4)
**Trigger:** Manual POST per fixture (after final whistle)  
**Input:** `{ forza_match_id: string }`  
**Auth:** `verify_jwt: false` (open, relies on Forza token in env)

**What it does:**
1. Looks up the fixture row to get `fixture_id`, `tournament_id`, team Forza IDs
2. Fetches 4 Forza endpoints in parallel:
   - `E4` `/v1/matches/:id` — score, status
   - `E5` `/v1/matches/:id/lineups` — positions, own goals
   - `E9` `/v2/matches/:id/periods` — event feed (goals, cards, subs, penalties)
   - `E10` `/v2/matches/:id/player_statistics` — authoritative stats
3. Upserts `player_match_stats` (one row per player per fixture)
4. Writes `match_events` (activity feed rows)
5. Fire-and-forgets `calculate-scores` for this fixture

**Returns:** `{ ok, players_ingested, events_written, fixture_id, forza_match_id }`

---

### `calculate-scores` (v6)
**Trigger:** Called by `ingest-match-events` (fire-and-forget), or manually  
**Input:** `{ fixture_id: string }`

**What it does:**
1. Loads the fixture to get `tournament_id`
2. **Loads scoring rules from DB** (`scoring_rules` table, keyed by `tournament_id + position`) — falls back to hardcoded EPL defaults if no rows found
3. For each squad that has a player in this fixture:
   - Looks up `player_match_stats`
   - Calculates fantasy points per player using the loaded rules
   - Applies captain multiplier (2×)
   - Applies bench auto-substitution logic
4. Upserts `squad_scores` (matchday totals per squad) and `player_scores` (per-player breakdown)

**Scoring rules:** Stored in the `scoring_rules` table. Editable via the admin panel without a code deploy. Each row: `(tournament_id, position, rules JSONB)`. Positions: `GK`, `DEF`, `MID`, `FWD`, `UNIVERSAL`.

---

### `sync-players` / `sync-player-status`
- `sync-players`: Syncs the player roster from Forza for a tournament
- `sync-player-status`: Updates injury/fitness status per player

---

## Database Tables (key ones)

| Table | Purpose |
|-------|---------|
| `tournaments` | One row per competition. `forza_id`, `slug`, `name`, `sync_enabled` |
| `fixtures` | All matches. `matchday_id = {slug}-r{round}`, `tournament_id` |
| `matchday_deadlines` | Transfer window cutoff per round. Keyed by `matchday_id` |
| `players` | Player roster. `forza_player_id`, `tournament_id`, `position`, `forza_team_id` |
| `player_match_stats` | Raw stats per player per fixture (goals, assists, minutes, etc.) |
| `match_events` | Activity feed: goals, cards, subs |
| `scoring_rules` | Fantasy points per action, per position, per tournament |
| `leagues` | League config: `budget_total`, `squad_size`, `position_limits`, `min_formation` |
| `squads` | User squads. FK to `leagues` and `users` |
| `squad_scores` | Fantasy points per squad per matchday |
| `player_scores` | Per-player fantasy points per matchday (with breakdown) |
| `matchday_deadlines` | Transfer deadline per round |

---

## Competition-Agnostic Design

The app is designed to support **any football competition** without code changes. To add a new competition:

1. **DB:** `INSERT INTO tournaments (forza_id, name, slug, sync_enabled) VALUES (...)` 
2. **Sync fixtures:** POST to `sync-fixtures` with `{ forza_id }` — auto-populates `fixtures` + `matchday_deadlines`
3. **Sync players:** POST to `sync-players` with `{ forza_id }`
4. **Scoring rules:** Use the admin panel → Scoring Rules editor to configure fantasy points per position. Falls back to EPL defaults if omitted.
5. **Leagues:** Create a `leagues` row with `tournament_id` + custom `budget_total`, `squad_size`, `position_limits`, `min_formation` (JSONB). Falls back to EPL defaults if columns are null.

The frontend resolves `competitionName` and `currentMatchday` dynamically from the DB at runtime — no hardcoded labels or round numbers.

---

## matchday_id Format

**Pattern:** `{tournament.slug}-r{round_number}`  
**Examples:**
- `epl-2526-r34` — EPL 2025-26, Round 34
- `wc-2026-r3` — World Cup 2026, Group Stage Round 3
- `ucl-2526-r6` — UCL 2025-26, Round 6

This format is used as the join key between `fixtures`, `matchday_deadlines`, and transfer-window logic. Never use the raw `forza_id` (e.g. `426`) as a matchday_id prefix.

---

## Environment Variables (Supabase Edge Functions)

| Variable | Purpose |
|----------|---------|
| `SUPABASE_URL` | Auto-injected by runtime |
| `SUPABASE_SERVICE_ROLE_KEY` | Auto-injected by runtime |
| `FORZA_ACCESS_TOKEN` | Forza Football API bearer token |

---

## Ingestion Runbook (manual, per matchday)

After the last match of a round finishes:

```bash
# For each finished fixture in the round:
curl -X POST https://sssmvihxtqtohisghjet.supabase.co/functions/v1/ingest-match-events \
  -H "Content-Type: application/json" \
  -d '{"forza_match_id": "1218672902"}'
```

`calculate-scores` fires automatically after each ingestion. Check `squad_scores` to confirm points landed.

---

## Planned: Automated Ingestion (pg_cron)

Scheduled jobs are designed but not yet activated. When enabled:
- `sync-fixtures` runs nightly to keep fixture list fresh
- `ingest-match-events` triggers for each finished match (polling Forza status)
- `calculate-scores` runs after each ingestion

Activation: set up `pg_cron` via Supabase dashboard → Database → Cron Jobs.
