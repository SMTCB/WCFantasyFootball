# How to Add a New Tournament

**Adding a competition (e.g. Champions League, La Liga, Copa América) to the platform is mostly configuration — no code deploys required.**

All core tables (`fixtures`, `players`, `squads`, `leagues`, `scoring_rules`, `matchday_deadlines`) are scoped by `tournament_id`. The steps below cover both **group/league-format** competitions (EPL, La Liga) and **knockout-stage** competitions (World Cup, UCL, domestic cups). Read the format note in Step 2 before proceeding.

---

## Step 1 — Register the tournament

```sql
INSERT INTO tournaments (forza_id, name, slug, environment, sync_enabled, status, starts_at, ends_at)
VALUES (
  '999',                              -- Forza tournament ID (confirm with provider)
  'UEFA Champions League 2026-27',   -- Display name
  'ucl-2627',                        -- URL slug (unique)
  'dry_run',                         -- 'dry_run' until ready to go live
  false,                             -- Keep false until all steps below are complete
  'upcoming',
  '2026-09-16T00:00:00Z',
  '2027-05-31T23:59:59Z'
);
```

> Keep `sync_enabled = false` until you've completed all steps. This is the master switch — nothing syncs until it's true.

---

## Step 2 — Sync fixtures

Enable sync temporarily to populate the `fixtures` table, then verify:

```sql
UPDATE tournaments SET sync_enabled = true WHERE forza_id = '999';
```

```bash
curl -X POST https://<project>.supabase.co/functions/v1/sync-fixtures \
  -H "Content-Type: application/json" \
  -d '{"forza_id": "999"}'
```

Verify:
```sql
SELECT round_number, status, COUNT(*), MIN(kickoff_at)::date, MAX(kickoff_at)::date
FROM fixtures
WHERE tournament_id = '999'
GROUP BY round_number, status
ORDER BY round_number NULLS FIRST;
```

**Understand what `sync-fixtures` does and does NOT do:**

| | Group/league formats (EPL, La Liga…) | Knockout formats (WC, UCL, cups…) |
|---|---|---|
| `round_number` | ✅ Auto-populated — Forza returns a numbered round for every match | ❌ Always `NULL` — Forza returns `round: null` for every knockout fixture |
| `matchday_id` | ✅ Auto-derived: `'{forza_id}-r{round}'` (PR #326) | ❌ Not set — skipped because `m.round` is null |
| `matchday_deadlines` | ✅ Auto-derived: `MIN(kickoff_at)` per round | ❌ Never created — skipped because `m.round` is null |

**If your tournament has a knockout stage, continue to Step 2b before proceeding.**

> **Note on international friendlies**: Forza does not always provide a `round` field for non-competitive matches. When `round` is absent, `round_number` and `matchday_id` both remain `NULL`. You must assign them manually — see [Step 2c](#step-2c----friendly--test-tournaments-only).

---

## Step 2b — Knockout stage (⚠️ required for UCL, World Cup, cups, or any competition with elimination rounds)

### Why this is needed

`calculate-scores` derives the scoring matchday as `{tournament_id}-r{round_number}` and **hard-fails** (`'critical'`, rollup skipped) when `round_number` is null — so knockout matches silently never score without this step.

A one-off `UPDATE fixtures SET round_number = …` is **not durable**: the `sync-*-fixtures` cron re-upserts `round_number: null` on every run (Forza keeps returning null for knockouts) and reverts the fix within minutes.

### How the durable mechanism works

Migration 126 deployed `derive_fixture_round_number()`, a BEFORE INSERT/UPDATE trigger on `fixtures`. It fires whenever a row is written with `round_number NULL` but a canonical `{tournament}-rN` `matchday_id` present, and re-fills `round_number` from `matchday_id`. Since `sync-fixtures` never writes the `matchday_id` column, whatever you seed there survives every sync — and the trigger ensures `round_number` always matches it.

**You only need to seed `fixtures.matchday_id` correctly. The trigger handles `round_number` forever after.**

### Step 2b-i — Identify each knockout stage and its round number

Decide how knockout matches group into fantasy gameweeks. Convention: continue numbering after the group stage.

Example for a group (rounds 1–3) + knockout competition:

| Fantasy round | Stage | Typical match count |
|---|---|---|
| r4 | Round of 32 / Round of 16 (first KO round) | varies |
| r5 | Next KO round | varies |
| r6 | Quarter-finals | 4 |
| r7 | Semi-finals | 2 |
| r8 | Final + 3rd place | 1–2 |

> For competitions with no group stage, start at r1 for the first KO round.

### Step 2b-ii — Identify which fixtures belong to each stage

While the bracket is unresolved, Forza uses placeholder team labels like `W73` ("winner of match 73"), `RU101` ("runner-up/loser of match 101"), or group codes like `1A`, `2B`, `3A/3B/3C`. You can classify fixtures by the highest internal match number referenced in their team placeholders.

Run this query to see the placeholder patterns in your tournament's knockout fixtures:

```sql
SELECT id, home_team, away_team, kickoff_at::date AS d
FROM fixtures
WHERE tournament_id = '999' AND round_number IS NULL
ORDER BY kickoff_at;
```

From the output:
- Fixtures with **group codes only** (`1A`, `2B`, `3A/3B/…`) — these are the **first KO round** (Round of 32 / Round of 16).
- Fixtures referencing **`W##` or `RU##`** — the number is the source match. Group them by the max match number to identify stage:
  - Low match numbers → earlier KO round (first W## batch = second KO round)
  - Higher match numbers → later rounds (QF, SF, Final)

Use the query results to write the `matchday_id` for each group. Here is the general pattern — **adjust the CASE ranges to match your tournament's actual match numbers**:

```sql
-- Replace '999' and adjust the CASE match-number ranges to your tournament.
-- The ref = 0 branch catches group-code fixtures (no W|RU|L prefix).
WITH ko AS (
  SELECT id,
         GREATEST(
           COALESCE((substring(home_team FROM '^(?:W|RU|L)(\d+)$'))::int, 0),
           COALESCE((substring(away_team FROM '^(?:W|RU|L)(\d+)$'))::int, 0)
         ) AS ref
  FROM fixtures
  WHERE tournament_id = '999' AND round_number IS NULL
)
-- DRY RUN first — verify counts are what you expect before the UPDATE:
SELECT CASE
  WHEN ref = 0              THEN 4   -- first KO round (group qualifiers)
  WHEN ref BETWEEN 1 AND 50 THEN 5   -- second KO round — adjust range to your tournament
  WHEN ref BETWEEN 51 AND 75 THEN 6  -- quarter-finals — adjust
  WHEN ref BETWEEN 76 AND 90 THEN 7  -- semi-finals — adjust
  WHEN ref > 90             THEN 8   -- final + 3rd place — adjust
END AS derived_round,
COUNT(*)
FROM ko GROUP BY 1 ORDER BY 1;
```

Once the counts look right, apply:

```sql
WITH ko AS (
  SELECT id,
         GREATEST(
           COALESCE((substring(home_team FROM '^(?:W|RU|L)(\d+)$'))::int, 0),
           COALESCE((substring(away_team FROM '^(?:W|RU|L)(\d+)$'))::int, 0)
         ) AS ref
  FROM fixtures
  WHERE tournament_id = '999' AND round_number IS NULL
)
UPDATE fixtures f
SET matchday_id = '999-r' || CASE
  WHEN ref = 0              THEN 4
  WHEN ref BETWEEN 1 AND 50 THEN 5
  WHEN ref BETWEEN 51 AND 75 THEN 6
  WHEN ref BETWEEN 76 AND 90 THEN 7
  WHEN ref > 90             THEN 8
END,
competition = 'Your Tournament Name · Round ' || CASE
  WHEN ref = 0              THEN '4'
  WHEN ref BETWEEN 1 AND 50 THEN '5'
  WHEN ref BETWEEN 51 AND 75 THEN '6'
  WHEN ref BETWEEN 76 AND 90 THEN '7'
  WHEN ref > 90             THEN '8'
END
FROM ko WHERE f.id = ko.id;
-- The trigger derives round_number from matchday_id automatically on this UPDATE.
```

Verify the trigger fired and round numbers are correct:

```sql
SELECT round_number, matchday_id, COUNT(*) FROM fixtures
WHERE tournament_id = '999'
GROUP BY round_number, matchday_id
ORDER BY round_number NULLS FIRST;
-- round_number should now match the N in matchday_id for all rows; no NULLs in KO fixtures.
```

### Step 2b-iii — Seed knockout matchday deadlines

`sync-fixtures` skips knockout rounds when building deadlines (it only processes rounds where `m.round` is non-null). Seed them manually — squad lock = first kickoff of each stage:

```sql
INSERT INTO matchday_deadlines (matchday_id, tournament_id, deadline_at)
SELECT '999-r' || round_number, '999', MIN(kickoff_at)
FROM fixtures
WHERE tournament_id = '999' AND round_number >= 4   -- adjust lower bound to your first KO round
GROUP BY round_number
ON CONFLICT (matchday_id) DO UPDATE SET deadline_at = EXCLUDED.deadline_at;
```

Verify:
```sql
SELECT matchday_id, deadline_at FROM matchday_deadlines
WHERE tournament_id = '999' ORDER BY matchday_id;
```

> ⚠️ **Never clear `fixtures.matchday_id` on knockout rows.** That column is the trigger's source of truth. Note: `sync-fixtures` now writes `matchday_id` for fixtures where `m.round` is non-null (PR #326) — but knockout fixtures have `m.round = null`, so `sync-fixtures` writes `matchday_id = null` for them. The trigger corrects this on every upsert by re-deriving `round_number` from the existing `matchday_id`. The net result: the seeded `matchday_id` survives every sync run.

---

## Step 2c — Friendly / test tournaments only

Skip this step for competitive tournaments — `sync-players` handles them in Step 3.

For **international friendlies or test tournaments** where `sync-players` returns no players (Forza's team endpoint is blocked or the tournament has no player data), copy players from an existing competitive tournament instead:

```sql
-- Example: copy France + CIV from WC (429) into the friendly tournament (623)
-- id format: 'fp-{forza_player_id}-{target_tournament_id}'
INSERT INTO players (
  id, name, position, nationality, club,
  price, photo_url, forza_player_id, forza_team_id,
  tournament_id, birthdate, height, season_avg
)
SELECT
  'fp-' || forza_player_id || '-623',
  name, position, nationality, club,
  price, photo_url, forza_player_id, forza_team_id,
  '623',
  birthdate, height, season_avg
FROM players
WHERE tournament_id = '429'
  AND club IN ('France', 'Côte d''Ivoire')
ON CONFLICT (id) DO NOTHING;
```

Also assign `round_number` and `matchday_id` manually for each friendly fixture you want to test:

```sql
-- Assign the next available round number and set the matchday deadline
UPDATE fixtures SET round_number = 6, matchday_id = '623-r6' WHERE id = 'f-1220119072';

INSERT INTO matchday_deadlines (matchday_id, tournament_id, deadline_at)
VALUES ('623-r6', '623', '2026-06-04 19:00:00+00')   -- 10 min before kickoff
ON CONFLICT (matchday_id) DO NOTHING;
```

Verify:
```sql
SELECT id, home_team, away_team, round_number, matchday_id, kickoff_at
FROM fixtures WHERE tournament_id = '623' AND round_number IS NOT NULL ORDER BY kickoff_at;

SELECT matchday_id, deadline_at FROM matchday_deadlines WHERE tournament_id = '623' ORDER BY deadline_at;

SELECT club, COUNT(*) FROM players WHERE tournament_id = '623' GROUP BY club ORDER BY club;
```

---

## Step 3 — Sync players

```bash
curl -X POST https://<project>.supabase.co/functions/v1/sync-players \
  -H "Content-Type: application/json" \
  -d '{"forza_id": "999"}'
```

Verify:
```sql
SELECT position, COUNT(*) FROM players WHERE tournament_id = '999' GROUP BY position;
```

---

## Step 4 — Seed scoring rules

The scoring engine reads from `scoring_rules` keyed by `tournament_id`. Copy from an existing tournament (EPL = `426`) or insert custom rules:

```sql
-- Copy EPL rules
INSERT INTO scoring_rules (tournament_id, position, rules)
SELECT '999', position, rules FROM scoring_rules WHERE tournament_id = '426'
ON CONFLICT DO NOTHING;
```

---

## Step 5 — Add cron jobs

The live scoring jobs (`ingest-match-events-live`, `calculate-scores-live`, `calculate-scores-post-match`, `calculate-scores-late-finishers`) are **tournament-agnostic** — they run for all fixtures. Only the **sync jobs** are per-tournament:

```sql
-- 1. Sync fixtures (updates statuses, scores; frequency depends on competition pace)
SELECT cron.schedule(
  'sync-<slug>-fixtures-daily',
  '0 21 * * *',
  $$SELECT net.http_post(
    url     := current_setting('app.supabase_url') || '/functions/v1/sync-fixtures',
    headers := jsonb_build_object('Content-Type','application/json',
                 'Authorization','Bearer ' || current_setting('app.service_role_key')),
    body    := jsonb_build_object('forza_id','999')
  );$$
);

-- 2. Sync players daily (roster changes)
SELECT cron.schedule(
  'sync-<slug>-players-daily',
  '0 9 * * *',
  $$SELECT net.http_post(
    url     := current_setting('app.supabase_url') || '/functions/v1/sync-players',
    headers := jsonb_build_object('Content-Type','application/json',
                 'Authorization','Bearer ' || current_setting('app.service_role_key')),
    body    := jsonb_build_object('forza_id','999')
  );$$
);

-- 3. Sync player status every 6h (injuries, suspensions)
SELECT cron.schedule(
  'sync-<slug>-player-status',
  '0 */6 * * *',
  $$SELECT net.http_post(
    url     := current_setting('app.supabase_url') || '/functions/v1/sync-player-status',
    headers := jsonb_build_object('Content-Type','application/json',
                 'Authorization','Bearer ' || current_setting('app.service_role_key')),
    body    := jsonb_build_object('forza_id','999')
  );$$
);
```

> Use `current_setting(…)` instead of hardcoded URLs/keys — prior crons that used hardcoded values had to be patched manually when keys rotated (see migrations 90–91).

**Tournament-agnostic jobs — no action needed:**

| Job | Scope |
|---|---|
| `ingest-match-events-live` | All `status='live'` fixtures |
| `calculate-scores-live` | All `status='live'` fixtures |
| `calculate-scores-post-match` | Finished fixtures, 22:30 UTC daily, 24h window |
| `calculate-scores-late-finishers` | Finished fixtures, 23:30+00:30 UTC, 3h window |
| `run-draft-lottery` | All leagues |
| `resolve-expired-auctions` | All leagues |
| `auto-close-bets` | All leagues |

---

## Step 6 — Enable sync

```sql
UPDATE tournaments SET sync_enabled = true WHERE forza_id = '999';
```

For a dry run (testing without affecting production leagues), keep `environment = 'dry_run'`. When ready for real users: `environment = 'production'`.

---

## Step 7 — Verify the full pipeline

Use any recently-finished fixture from the tournament:

```bash
# 1. Ingest match events
curl -X POST .../functions/v1/ingest-match-events \
  -d '{"forza_match_id": "<a finished match id>"}'

# 2. Score it
curl -X POST .../functions/v1/calculate-scores \
  -d '{"fixture_id": "f-<forza_match_id>"}'
```

```sql
-- Verify points computed correctly
SELECT p.name, p.position, pms.goals, pms.goals_conceded, pms.clean_sheet, pms.fantasy_points
FROM player_match_stats pms
JOIN players p ON p.id = pms.player_id
WHERE pms.fixture_id = 'f-<id>'
ORDER BY pms.fantasy_points DESC LIMIT 10;
```

---

## Step 8 — Create leagues

```sql
SELECT create_league('My UCL League', 'classic', '<user_id>', '999');
```

> ⚠️ **Cup leagues and the cross-tournament player pool bug (fixed in migration 131)**
>
> If a league has rows in `cup_active_clubs`, `get_cup_available_players` joins by club name (e.g. "France") with **no tournament filter**. Before migration 131 this caused players from other tournaments with matching club names (WC 429, UCL, etc.) to appear in the draft pool as duplicates. Migration 131 adds `AND p.tournament_id = v_tournament_id` to the cup path.
>
> **This is already fixed in production.** But if you ever debug a draft pool showing duplicates or an inflated player count, check whether `cup_active_clubs` is seeded for the league and whether the `get_cup_available_players` function has the `tournament_id` guard.

---

## Step 9 — Set up squads for live scoring (dry run / test only)

For a live test, squads need `starting_xi` and `captain_id` set — otherwise scoring falls back to `players[0..10]` which may produce an invalid formation (e.g. two GKs).

**Check current state:**
```sql
SELECT s.id, s.user_id, s.matchday_id, s.captain_id,
       array_length(s.players, 1)    AS squad_size,
       array_length(s.starting_xi, 1) AS xi_size
FROM squads s
WHERE s.league_id = '<league_id>'
ORDER BY s.created_at;
```

**If `starting_xi` is null, set it manually** — pick 11 players in a valid formation (1 GK, 3–5 DEF, 2–5 MID, 1–3 FWD):

```sql
-- Example: 1-4-3-3 formation
UPDATE squads
SET
  starting_xi = ARRAY[
    'fp-<gk_id>-623',
    'fp-<def1>-623', 'fp-<def2>-623', 'fp-<def3>-623', 'fp-<def4>-623',
    'fp-<mid1>-623', 'fp-<mid2>-623', 'fp-<mid3>-623',
    'fp-<fwd1>-623', 'fp-<fwd2>-623', 'fp-<fwd3>-623'
  ],
  captain_id = 'fp-<captain_id>-623'
WHERE id = '<squad_id>';
```

> All player IDs must exist in the `players` table for the target `tournament_id`. Use the player list from Step 2c or Step 3 to pick valid IDs.

---

## Step 10 — Live test dry run checklist

Run this before each live test match to confirm everything is wired up:

```sql
-- 1. Fixture is scheduled and has round_number + matchday_id
SELECT id, home_team, away_team, status, round_number, matchday_id, kickoff_at
FROM fixtures WHERE id = 'f-<forza_match_id>';

-- 2. matchday_deadline exists for this round
SELECT matchday_id, deadline_at FROM matchday_deadlines
WHERE tournament_id = '<forza_id>' AND matchday_id = '<tournament_id>-r<N>';

-- 3. Players exist for both teams in the target tournament
SELECT club, COUNT(*) FROM players WHERE tournament_id = '<forza_id>'
AND club IN ('<home_team>', '<away_team>') GROUP BY club;

-- 4. All squads in the test league have starting_xi and captain set
SELECT s.user_id, array_length(s.starting_xi,1) AS xi, s.captain_id
FROM squads s WHERE s.league_id = '<league_id>';

-- 5. sync cron is active for the tournament
SELECT jobname, schedule, active FROM cron.job
WHERE jobname LIKE 'sync-%<slug>%';

-- 6. scoring_rules exist for the tournament
SELECT position, COUNT(*) FROM scoring_rules WHERE tournament_id = '<forza_id>' GROUP BY position;
```

All six checks should return data. Any NULL or empty result = fix it before kickoff.

---

## Summary checklist

```
[ ] INSERT into tournaments (sync_enabled = false)
[ ] sync-fixtures run → verify fixtures populated; matchday_id auto-derived for competitive rounds
[ ] (knockout tournament) seed fixtures.matchday_id by stage → trigger auto-derives round_number
[ ] (knockout tournament) seed matchday_deadlines for KO rounds
[ ] (friendly/test) manually set round_number + matchday_id on each fixture to test
[ ] (friendly/test) manually seed matchday_deadlines for each round
[ ] sync-players → verify player counts by position
[ ] (friendly/test) copy players from existing tournament if sync-players returns nothing
[ ] scoring_rules seeded for tournament_id
[ ] 3 cron jobs added (sync-fixtures, sync-players, sync-player-status)
[ ] UPDATE tournaments SET sync_enabled = true
[ ] Leagues created in the app
[ ] Squads have valid starting_xi (11 players, valid formation) + captain_id set
[ ] Run Step 10 dry run checklist — all 6 queries return data
[ ] End-to-end pipeline test: manually trigger ingest + calculate-scores on a finished fixture
```

---

## Reference: active tournaments

| Tournament | forza_id | slug | Sync crons |
|---|---|---|---|
| Premier League 2025-26 | `426` | `epl-2526` | `sync-fixtures` daily, `sync-players-daily`, `sync-player-status` |
| FIFA World Cup 2026 | `429` | `wc-2026` | `sync-wc-fixtures-30m`, `sync-wc-players-6h`, `sync-wc-player-status` |
| UCL 2025-26 | `1593` | `ucl-2526` | `sync_enabled = false` (competition over) |

**WC 429 knockout mapping** (for reference — derivable from migration 126):

| Fantasy round | Stage | Count | Squad-lock deadline |
|---|---|---|---|
| r4 | Round of 32 | 16 | 2026-06-28 19:00 UTC |
| r5 | Round of 16 | 8 | 2026-07-04 17:00 UTC |
| r6 | Quarter-finals | 4 | 2026-07-09 20:00 UTC |
| r7 | Semi-finals | 2 | 2026-07-14 19:00 UTC |
| r8 | Final + 3rd place | 2 | 2026-07-18 21:00 UTC |

---

Last Updated: **2026-06-04**
- Step 2 table updated: `sync-fixtures` now writes `matchday_id` for competitive rounds (PR #326)
- Step 2b note updated: trigger + sync-fixtures interaction clarified
- Step 2c added: friendly/test tournament player copy + manual fixture setup pattern
- Step 9 added: squad `starting_xi` + `captain_id` setup for live tests
- Step 10 added: live test dry run checklist (6 SQL checks)
- Summary checklist updated with all new steps
