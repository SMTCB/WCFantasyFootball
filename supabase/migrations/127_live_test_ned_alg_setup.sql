-- Migration 127: Live test setup — NED vs ALG (2026-06-03, tournament 623, round 5)
-- Also fixes WC 429 group stage fixtures.matchday_id (rounds 1-3) which were never set.
--
-- Issues resolved:
--   A) fixtures.matchday_id NULL for all 429 group-stage games + 623 test fixture
--      → sync-fixtures only writes matchday_deadlines, not fixtures.matchday_id
--      → Fix: bulk UPDATE using tournament_id + round_number
--   B) tournament 623 has sync_enabled=false → sync-fixtures rejects calls
--   C) No sync cron for tournament 623 → fixture never flips to 'live'
--   D) starting_xi NULL on all 3 NED_ALG squads → scoring falls back to players[0..10] (invalid GK×2 on squad 1)
--   E) captain_id NULL on all 3 squads → no 2× captain multiplier during test

-- ─── A. Backfill fixtures.matchday_id for all rounds with round_number set ──────
-- Idempotent: only touches rows where matchday_id IS NULL.
-- Affects: WC 429 rounds 1-3 (72 games) and tournament 623 fixture f-1219834126.
UPDATE fixtures
SET    matchday_id = tournament_id || '-r' || round_number::text
WHERE  matchday_id IS NULL
  AND  round_number IS NOT NULL
  AND  tournament_id IN ('429', '623');

-- ─── B. Enable sync for tournament 623 ──────────────────────────────────────────
UPDATE tournaments
SET    sync_enabled = true
WHERE  forza_id = '623';

-- ─── C. Add sync cron for tournament 623 (runs every 5 min) ─────────────────────
-- This flips the fixture status from 'scheduled' → 'live' at kickoff,
-- which triggers ingest-match-events-live and calculate-scores-live.
-- Can be unscheduled after the test: SELECT cron.unschedule('sync-test-623-fixtures');
SELECT cron.schedule(
  'sync-test-623-fixtures',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url     := 'https://sssmvihxtqtohisghjet.supabase.co/functions/v1/sync-fixtures',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNzc212aWh4dHF0b2hpc2doamV0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjQ4OTIyNywiZXhwIjoyMDkyMDY1MjI3fQ.rJZLTLnrgTjwMv3vHgUIyY48GrJ7dp5vhjWlkpWyWzg'
    ),
    body    := jsonb_build_object('forza_id', '623')
  );
  $$
);

-- ─── D+E. Set starting_xi (1-4-3-3) and captain on all 3 NED_ALG squads ─────────

-- Squad 1 — user aaaae001 (15 players: NED-heavy, mixed)
--   GK:  Flekken (NED)
--   DEF: Van Dijk, Frimpong, Dumfries, van Hecke (all NED)
--   MID: De Jong, Gravenberch, Reijnders (all NED)
--   FWD: Gakpo ★, Summerville (NED), Mahrez (ALG)
UPDATE squads
SET
  starting_xi = ARRAY[
    'fp-668633-623',      -- Mark Flekken       GK  NED
    'fp-667929-623',      -- Virgil van Dijk    DEF NED
    'fp-1071690575-623',  -- Jeremie Frimpong   DEF NED
    'fp-1394870-623',     -- Denzel Dumfries    DEF NED
    'fp-1687652-623',     -- Jan Paul van Hecke DEF NED
    'fp-1709127-623',     -- Frenkie de Jong    MID NED
    'fp-1709220-623',     -- Ryan Gravenberch   MID NED
    'fp-545113-623',      -- Tijjani Reijnders  MID NED
    'fp-1644704-623',     -- Cody Gakpo         FWD NED  ← captain
    'fp-631498-623',      -- Crysencio Summerville FWD NED
    'fp-443567-623'       -- Riyad Mahrez       FWD ALG
  ],
  captain_id = 'fp-1644704-623'   -- Cody Gakpo
WHERE id = '7d9ff601-4a6a-4ec7-8984-041b8234e45d';

-- Squad 2 — user aaaae002 (13 players: NED/ALG mix)
--   GK:  Roefs (NED)
--   DEF: van de Ven, Geertruida (NED), Aït-Nouri, Belghali (ALG)
--   MID: Quinten Timber, Wieffer (NED), Boudaoui (ALG)
--   FWD: Ghedjemis, Chiakha, Amoura ★ (all ALG)
UPDATE squads
SET
  starting_xi = ARRAY[
    'fp-1096883182-623',  -- Robin Roefs            GK  NED
    'fp-1096689045-623',  -- Micky van de Ven       DEF NED
    'fp-2218839-623',     -- Lutsharel Geertruida   DEF NED
    'fp-2110485-623',     -- Rayan Aït-Nouri        DEF ALG
    'fp-1214282733-623',  -- Rafik Belghali         DEF ALG
    'fp-1082519762-623',  -- Quinten Timber         MID NED
    'fp-464140-623',      -- Mats Wieffer           MID NED
    'fp-198133035-623',   -- Hicham Boudaoui        MID ALG
    'fp-1213695233-623',  -- Farès Ghedjemis        FWD ALG
    'fp-1216689831-623',  -- Amin Chiakha           FWD ALG
    'fp-1174695786-623'   -- Mohammed Amoura        FWD ALG  ← captain
  ],
  captain_id = 'fp-1174695786-623'   -- Mohammed Amoura
WHERE id = 'd07adf3f-a9fd-4d7d-bb51-29004ef9d92f';

-- Squad 3 — user d0f0cb5a (15 players: NED-heavy, 2 ALG)
--   GK:  Verbruggen (NED)
--   DEF: Hato, Aké, de Vrij, Timber (all NED)
--   MID: Koopmeiners, Xavi Simons ★ (NED), Chaïbi (ALG)
--   FWD: Weghorst, Brobbey, Malen (all NED)
UPDATE squads
SET
  starting_xi = ARRAY[
    'fp-918776295-623',   -- Bart Verbruggen    GK  NED
    'fp-1212883667-623',  -- Jorrel Hato        DEF NED
    'fp-590737-623',      -- Nathan Aké         DEF NED
    'fp-1552984-623',     -- Stefan de Vrij     DEF NED
    'fp-1524142-623',     -- Jurriën Timber     DEF NED
    'fp-2030215-623',     -- Teun Koopmeiners   MID NED
    'fp-1096659603-623',  -- Xavi Simons        MID NED  ← captain
    'fp-1205268289-623',  -- Farès Chaïbi       MID ALG
    'fp-679219-623',      -- Wout Weghorst      FWD NED
    'fp-1692972-623',     -- Brian Brobbey      FWD NED
    'fp-1681129-623'      -- Donyell Malen      FWD NED
  ],
  captain_id = 'fp-1096659603-623'   -- Xavi Simons
WHERE id = '5ea561fc-a44d-4144-b620-985b96848338';
