# How to Add a New Tournament

This guide covers every step required to onboard a new competition (e.g. Champions League, La Liga, Copa América) into the Forza Fantasy League platform.

The system is fully tournament-agnostic. All core tables (`fixtures`, `players`, `squads`, `leagues`, `scoring_rules`, `matchday_deadlines`) are scoped by `tournament_id`. Adding a tournament is purely configuration — no code changes required.

---

## Prerequisites

- Confirm the Forza Football API `tournament_id` for the competition with the provider
- Confirm the competition is accessible via the standard endpoints (`/v1/tournaments/:id/matches`, `/v1/teams/:id/squad`, `/v2/teams/:id/unavailable_players`)

---

## Step 1 — Register the tournament in the DB

```sql
INSERT INTO tournaments (forza_id, name, slug, environment, sync_enabled, status, starts_at, ends_at)
VALUES (
  '999',                              -- Forza tournament ID (confirm with provider)
  'UEFA Champions League 2026-27',   -- Display name
  'ucl-2627',                        -- URL slug (unique)
  'dry_run',                         -- 'dry_run' until ready to go live
  false,                             -- Keep false until all steps are complete
  'upcoming',                        -- 'upcoming' | 'active' | 'completed'
  '2026-09-16T00:00:00Z',
  '2027-05-31T23:59:59Z'
);
```

> Keep `sync_enabled = false` until you've completed all steps below. This is the master switch — nothing syncs until it's true.

---

## Step 2 — Sync fixtures

Once `sync_enabled = true`, run `sync-fixtures` to populate the `fixtures` and `matchday_deadlines` tables:

```bash
curl -X POST https://<project>.supabase.co/functions/v1/sync-fixtures \
  -H "Content-Type: application/json" \
  -d '{"forza_id": "999"}'
```

**Verify:**
```sql
SELECT round_number, status, COUNT(*) FROM fixtures
WHERE tournament_id = '999'
GROUP BY round_number, status ORDER BY round_number;

SELECT matchday_id, deadline_at FROM matchday_deadlines
WHERE tournament_id = '999' ORDER BY deadline_at;
```

The `matchday_deadlines` entries are auto-derived as `MIN(kickoff_at)` per round — these become the squad-lock deadlines shown in the app.

---

## Step 3 — Sync players

```bash
curl -X POST https://<project>.supabase.co/functions/v1/sync-players \
  -H "Content-Type: application/json" \
  -d '{"forza_id": "999"}'
```

**Verify:**
```sql
SELECT position, COUNT(*) FROM players
WHERE tournament_id = '999'
GROUP BY position;
```

---

## Step 4 — Seed scoring rules

The scoring engine reads from `scoring_rules` keyed by `tournament_id`. If no rules exist, it falls back to hardcoded EPL defaults. To make scoring explicit and adjustable:

```sql
-- Copy from an existing tournament (e.g. EPL = '426')
INSERT INTO scoring_rules (tournament_id, position, rules)
SELECT '999', position, rules
FROM scoring_rules
WHERE tournament_id = '426'
ON CONFLICT DO NOTHING;
```

To use custom rules, insert them directly:

```sql
INSERT INTO scoring_rules (tournament_id, position, rules) VALUES
  ('999', 'GK',        '{"goal":5,"assist":0,"clean_sheet":4,"conceded_per_goal":-1,"penalty_saved":5,"tackle":0,"interception":0,"penalty_scored":0}'),
  ('999', 'DEF',       '{"goal":4,"assist":1,"clean_sheet":4,"conceded_per_goal":0,"penalty_saved":0,"tackle":0.5,"interception":0.25,"penalty_scored":0}'),
  ('999', 'MID',       '{"goal":5,"assist":1,"clean_sheet":1,"conceded_per_goal":0,"penalty_saved":0,"tackle":0.5,"interception":0.25,"penalty_scored":0}'),
  ('999', 'FWD',       '{"goal":3,"assist":1,"clean_sheet":0,"conceded_per_goal":0,"penalty_saved":0,"tackle":0,"interception":0,"penalty_scored":1}'),
  ('999', 'UNIVERSAL', '{"minute_per_90":1,"yellow_card":-1,"red_card":-3,"own_goal":-2,"penalty_missed":-1}')
ON CONFLICT DO NOTHING;
```

---

## Step 5 — Add cron jobs

The following jobs need to exist per tournament. The **live scoring jobs** (`ingest-match-events-live`, `calculate-scores-live`, `ingest-match-events`, `calculate-scores-daily`) are **already tournament-agnostic** — they run for all fixtures. Only the **sync jobs** are per-tournament.

Add these three cron jobs (replace `999` with the actual Forza tournament ID):

```sql
-- 1. Sync fixtures daily (updates statuses, scores, and matchday deadlines)
SELECT cron.schedule(
  'sync-<slug>-fixtures-daily',
  '0 21 * * *',
  $CMD$
  SELECT net.http_post(
    url     := 'https://<project>.supabase.co/functions/v1/sync-fixtures',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer <anon-key>'),
    body    := jsonb_build_object('forza_id','999')
  );
$CMD$
);

-- 2. Sync players daily (roster changes, new signings)
SELECT cron.schedule(
  'sync-<slug>-players-daily',
  '0 9 * * *',
  $CMD$
  SELECT net.http_post(
    url     := 'https://<project>.supabase.co/functions/v1/sync-players',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer <anon-key>'),
    body    := jsonb_build_object('forza_id','999')
  );
$CMD$
);

-- 3. Sync player status every 6h (injuries, suspensions)
SELECT cron.schedule(
  'sync-<slug>-player-status',
  '0 */6 * * *',
  $CMD$
  SELECT net.http_post(
    url     := 'https://<project>.supabase.co/functions/v1/sync-player-status',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer <anon-key>'),
    body    := jsonb_build_object('forza_id','999')
  );
$CMD$
);
```

**These jobs are already tournament-agnostic — no action needed:**

| Job | Scope | Why |
|---|---|---|
| `ingest-match-events-live` | All tournaments | Fires for any `status='live'` fixture |
| `calculate-scores-live` | All tournaments | Fires for any `status='live'` fixture |
| `ingest-match-events` | All tournaments | Fires for any `status='finished'` fixture (last 48h) |
| `calculate-scores-daily` | All tournaments | Fires for any `status='finished'` fixture (last 48h) |
| `run-draft-lottery` | All tournaments | No tournament filter |
| `resolve-expired-auctions` | All tournaments | No tournament filter |
| `auto-close-bets` | All tournaments | No tournament filter |

---

## Step 6 — Enable sync

Once steps 1–5 are complete and verified, flip the switch:

```sql
UPDATE tournaments SET sync_enabled = true WHERE forza_id = '999';
```

For a **dry run** (testing without affecting production leagues), keep `environment = 'dry_run'`. When ready for real users, set `environment = 'production'`.

---

## Step 7 — Verify the full pipeline

Run a quick end-to-end check using any recently-finished fixture from the tournament:

```bash
# 1. Ingest a finished match
curl -X POST .../functions/v1/ingest-match-events \
  -d '{"forza_match_id": "<a finished match id>"}'

# 2. Score it
curl -X POST .../functions/v1/calculate-scores \
  -d '{"fixture_id": "f-<forza_match_id>"}'
```

Then verify in the DB:

```sql
-- Player stats written with correct goals_conceded (not all zero)
SELECT p.name, p.position, pms.goals, pms.goals_conceded, pms.clean_sheet, pms.fantasy_points
FROM player_match_stats pms
JOIN players p ON p.id = pms.player_id
WHERE pms.fixture_id = 'f-<id>'
ORDER BY pms.fantasy_points DESC
LIMIT 10;
```

---

## Step 8 — Create leagues

Create leagues via the app UI (or directly via the `create_league` RPC), ensuring `tournament_id` matches the new tournament's `forza_id`.

```sql
SELECT create_league('My UCL League', 'classic', '<user_id>', '999');
```

---

## Summary checklist

```
[ ] Confirmed forza_id with provider
[ ] INSERT into tournaments (sync_enabled = false)
[ ] sync-fixtures → fixtures + matchday_deadlines populated
[ ] sync-players → players populated
[ ] scoring_rules seeded for tournament_id
[ ] 3 cron jobs added (sync-fixtures, sync-players, sync-player-status)
[ ] UPDATE tournaments SET sync_enabled = true
[ ] End-to-end pipeline test with a finished fixture
[ ] Leagues created in the app
```

---

## Reference: existing tournaments

| Tournament | forza_id | slug | Crons |
|---|---|---|---|
| Premier League 2025-26 | `426` | `epl-2526` | `sync-fixtures` (daily), `sync-players-daily`, `sync-player-status` |
| FIFA World Cup 2026 | `429` | `wc-2026` | `sync-wc-fixtures-6h`, `sync-wc-players-6h`, `sync-wc-player-status` |
