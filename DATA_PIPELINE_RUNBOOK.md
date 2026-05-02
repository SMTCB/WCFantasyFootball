# Data Pipeline Runbook
**Everything needed to go from zero to live scoring for any tournament.**

---

## Architecture Overview

```
Forza API
   │
   ├─ sync-fixtures        → fixtures + matchday_deadlines tables
   ├─ sync-players         → teams + players tables
   ├─ sync-player-status   → player_status table        (pre-match, per matchday)
   │
   └─ ingest-match-events  → player_match_stats         (live, per match)
          │                   match_events (activity feed)
          │
          └─ calculate-scores → fantasy_points          (auto-called by ingest)
                                 league_members.total_points
                                 Supabase Realtime broadcast
```

All sync functions are **inert until `sync_enabled = true`** on the tournament row.
No data is ever fetched automatically — each function must be called explicitly
(POST request). Scheduling/cron wiring is a separate step done when you're ready to go live.

---

## Environments

| Tournament | Forza ID | Slug | Environment | Purpose |
|---|---|---|---|---|
| Premier League 2025-26 | `426` | `epl-2526` | `dry_run` | Internal testing — final rounds |
| FIFA World Cup 2026 | TBD | `wc2026` | `production` | Public launch |

Both use the **same Supabase project and codebase**. Leagues in the dry run use `tournament_id = '426'` and should be set with `is_dry_run = true`. World Cup leagues use the WC tournament ID and are public-facing.

---

## Gaps Before Going Live

### Must resolve before dry run
- [x] **Scoring rule discrepancy** — Resolved. `PIPELINE.md` Appendix A was a superseded draft. `FANTASY_POINTS_SCORING_LAYER.md` is the settled spec. `calculate-scores/index.js` POINTS constants now match it exactly, including three previously missing rules (tackle +0.5, interception +0.25 for DEF/MID; penalty_scored +1 for FWD). See `API/FIT_GAP_ANALYSIS.md` for the full breakdown.
- [x] **Player valuations** — `17_epl_player_valuations.sql` created. Also adds `penalty_scored` column to `player_match_stats`. Covers ~40 named EPL players with tiered pricing (4.0–14.0M) plus position-based defaults for the rest. World Cup valuations will be seeded at WC data load time.
- [ ] **`FORZA_ACCESS_TOKEN` env var** — Add to Supabase Edge Function secrets in the Supabase Dashboard (Settings → Edge Functions → Secrets). Value: `DoRy9PNpYN4Ubg3FQkwEqxXQu2MytxzG`.

### Must resolve before World Cup launch
- [ ] **World Cup tournament ID** — Confirm with Forza provider. Insert the row (see migration 16 commented block) before running any WC sync.
- [ ] **National team squad scoping** — Confirm with Forza how `/v1/teams/{id}/squad` behaves for international tournaments. Two possible models: (A) each WC team registration has its own tournament-scoped `team_id` and squad of 26, or (B) national teams have a global `team_id` and the squad reflects their current roster at sync time. Model A means `sync-players` can run any time after squads are submitted (June 2026). Model B means timing matters — run after the final squad announcement deadline. **Ask the provider before opening WC squad-building.**
- [ ] **Season statistics endpoint** — Awaiting Forza. Will be used for the live projections engine (`projected = current_pts + player_avg × remaining_min / 90`). Currently uses position averages as fallback (GK 2.1 / DEF 2.8 / MID 3.2 / FWD 4.1 pts per 90 min). The engine (`src/lib/projections.js`) already accepts a per-player `seasonAvg` field — no structural changes needed when the endpoint arrives. Tracked as backlog #112.

---

## Step-by-Step: Activating the EPL Dry Run

Run these steps in order. Each is a one-time setup task.

### Step 0 — Run migrations
```sql
-- Apply migrations 16, 17, and 18 to your Supabase project
-- Via Supabase Dashboard → SQL Editor, or via CLI: supabase db push
--
-- Migration 16: tournaments, teams, fixtures/players/matchday_deadlines schema additions
-- Migration 17: player_match_stats.penalty_scored column + EPL player price seeds
-- Migration 18: player uniqueness fixed to (forza_player_id, tournament_id) composite
--               so EPL and WC players with the same Forza player ID coexist correctly
```

### Step 1 — Add Forza token to Edge Function secrets
```
Supabase Dashboard → Settings → Edge Functions → Secrets
Add: FORZA_ACCESS_TOKEN = DoRy9PNpYN4Ubg3FQkwEqxXQu2MytxzG
```

### Step 2 — Deploy the four new Edge Functions
```bash
supabase functions deploy sync-fixtures
supabase functions deploy sync-players
supabase functions deploy sync-player-status
supabase functions deploy ingest-match-events
supabase functions deploy calculate-scores
```

### Step 3 — Flip the plug
```sql
UPDATE tournaments SET sync_enabled = true WHERE forza_id = '426';
```

### Step 4 — Sync fixtures (one-time, repeat before each round)
```bash
curl -X POST https://<project>.supabase.co/functions/v1/sync-fixtures \
  -H "Authorization: Bearer <SUPABASE_ANON_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"forza_id": "426"}'
# Response: { ok: true, fixtures_upserted: N, deadlines_upserted: N }
```

### Step 5 — Sync players (one-time, re-run if roster changes)
```bash
curl -X POST https://<project>.supabase.co/functions/v1/sync-players \
  -H "Authorization: Bearer <SUPABASE_ANON_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"forza_id": "426"}'
# Response: { ok: true, teams_upserted: N, players_upserted: N }
# Note: players.price will be null — seed valuations separately (see gap above)
```

### Step 6 — Seed player valuations
```sql
-- Create 17_player_valuations.sql
-- UPDATE players SET price = X WHERE forza_player_id = 'Y';
-- Until automated pricing exists, manually curate for the top ~50 players
-- and assign position averages (GK 5.5, DEF 5.0, MID 6.0, FWD 7.0) to the rest
```

**At this point the app is ready for squad-building with real EPL players.**

---

## Pre-Matchday Checklist (run before each round)

| When | Action | Command |
|---|---|---|
| T-24h | Sync latest fixtures (kickoffs, status) | `sync-fixtures { forza_id: '426' }` |
| T-24h | Sync player availability | `sync-player-status { forza_id: '426' }` |
| T-24h | Re-sync players if transfers happened | `sync-players { forza_id: '426' }` |
| T-0 | Squad lock happens automatically via `matchday_deadlines` rows | — |

---

## Live Match Operations (per fixture)

When a match kicks off, call `ingest-match-events` repeatedly:

```bash
curl -X POST https://<project>.supabase.co/functions/v1/ingest-match-events \
  -H "Authorization: Bearer <SUPABASE_ANON_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"forza_match_id": "1218672985"}'
```

`ingest-match-events` automatically calls `calculate-scores` at the end.
`calculate-scores` automatically broadcasts via Supabase Realtime.

**Suggested polling interval:** every 60 seconds while match status = `live`.
**Final run:** once after status = `after` (full-time settlement).

To find forza_match_id for a fixture:
```sql
SELECT id, forza_match_id, home_team, away_team, kickoff_at
FROM fixtures
WHERE tournament_id = '426' AND round_number = 35
ORDER BY kickoff_at;
```

---

## Setting Up the Cron (when ready)

The functions exist and work. Adding a cron is the only remaining step to make ingestion fully automated. Two options:

**Option A — Supabase pg_cron (recommended):**
```sql
-- Poll all live fixtures every 60 seconds
-- Requires pg_cron extension enabled in Supabase Dashboard → Extensions
SELECT cron.schedule(
  'ingest-live-matches',
  '* * * * *',   -- every minute
  $$
    SELECT net.http_post(
      url := current_setting('app.supabase_url') || '/functions/v1/ingest-match-events',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.supabase_anon_key')
      ),
      body := jsonb_build_object(
        'forza_match_id', forza_match_id
      )
    )
    FROM fixtures
    WHERE status = 'live'
      AND tournament_id IN (SELECT forza_id FROM tournaments WHERE sync_enabled = true);
  $$
);
```

**Option B — External cron (Vercel Cron, GitHub Actions, etc.):**
Loop over live fixtures from your backend and POST to `ingest-match-events`.

---

## Activating the World Cup (when ready)

```sql
-- 1. Insert WC tournament (replace TBD with confirmed Forza ID)
INSERT INTO tournaments (forza_id, name, slug, environment, sync_enabled, status, starts_at, ends_at)
VALUES ('<WC_FORZA_ID>', 'FIFA World Cup 2026', 'wc2026', 'production', false, 'upcoming',
        '2026-06-08T00:00:00Z', '2026-07-15T23:59:59Z');

-- 2. Flip the plug when ready (after running sync-fixtures + sync-players)
UPDATE tournaments SET sync_enabled = true WHERE forza_id = '<WC_FORZA_ID>';
```

Then follow the same Steps 4–6 above with `forza_id = '<WC_FORZA_ID>'`.

---

## Dry Run vs Production — What's Different

| | EPL Dry Run | World Cup |
|---|---|---|
| Tournament ID | `426` | TBD |
| `environment` | `dry_run` | `production` |
| `leagues.is_dry_run` | `true` | `false` |
| Access | Invite-only internal leagues | Public |
| Player pool | ~500 EPL players | ~832 WC players |
| Scoring | Same engine — confirm rule values before dry run | Same engine |
| Squad deadline | Round 35 (May 2), 37 (May 17), 38 (May 24) | June 8 (Group A kickoff) |

---

## What Each Function Does (quick reference)

| Function | Input | Frequency | Writes to |
|---|---|---|---|
| `sync-fixtures` | `{ forza_id }` | Once per tournament + before each round | `fixtures`, `matchday_deadlines` |
| `sync-players` | `{ forza_id }` | Once per tournament + if rosters change | `teams`, `players` |
| `sync-player-status` | `{ forza_id }` | Daily (T-24h each matchday) | `player_status` |
| `ingest-match-events` | `{ forza_match_id }` | Every 60s per live match | `player_match_stats`, `match_events` |
| `calculate-scores` | `{ fixture_id }` | Auto-called by ingest; also callable directly | `player_match_stats`, `fantasy_points`, `league_members` |
