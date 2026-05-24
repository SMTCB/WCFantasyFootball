# API Ingestion & Scheduling Audit — Forza Fantasy League
**Date:** 2026-05-24
**Scope:**
1. Forza API → Supabase data pipeline consistency.
2. Inventory of every cron job: scheduled / broken / duplicated / missing.
3. Bet data flow: what data must be present and where the wiring is broken.
4. Hard-coded / placeholder data still in the production codepath.

Companion to [CODE_AUDIT_2026-05-24.md](CODE_AUDIT_2026-05-24.md) and [LOGIC_AUDIT_2026-05-24.md](LOGIC_AUDIT_2026-05-24.md).

---

## TL;DR — The five things that mean "you don't actually have live data"

| # | Severity | What's broken | Symptom |
|---|---|---|---|
| **I1** | 🔴 CRITICAL | `sync-players` upserts with `onConflict: 'forza_player_id,tournament_id'` — **that index doesn't exist**. Only `UNIQUE (forza_player_id)` exists (migration 16). Postgres rejects every upsert with `42P10`. | Every daily 9 AM `sync-players-daily` cron silently fails. Player master data has been frozen since first successful run. No new signings, no name updates. |
| **I2** | 🔴 CRITICAL | WC sync crons (migrations 60, 63) send `{tournament_id: '429'}` — but every ingestion function destructures `{forza_id}` and 400s on missing key. | Every WC sync cron returns 400 immediately. No WC fixtures, players, or status data has ever been ingested. |
| **I3** | 🔴 CRITICAL | The only `ingest-match-events` cron (migration 63) sends `body: '{}'::jsonb` but the function requires `{forza_match_id}`. | Live match data is **never automatically ingested**. The entire live pipeline depends on someone manually invoking the function. BACKLOG mentions a `ingest-match-events-live` cron — **it doesn't exist in any migration**. |
| **I4** | 🔴 CRITICAL | Two competing schedulers run the same syncs at the same time: orchestrator `sync-all-active-tournaments` (migration 51, every 6h) + hardcoded `sync-player-status`/`sync-players-daily`/`sync-fixtures` (migration 63). Migration 63 never unschedules the orchestrator. | Double Forza API calls every 6h. Hits rate limit faster, doubles DB write contention. |
| **I5** | 🟠 HIGH | Hardcoded `'426'` EPL fallback throughout: cron bodies, `useCommissioner.autoGenerateBetOptions`, `LeagueScreen.leagueTournament`, every named-pricing migration. The "competition-agnostic" architecture is fiction. | A non-EPL league still pulls EPL players for bet auto-generation, sets `tournament_id=426` by default, and inherits EPL pricing. |

---

## 1. Cron Job Inventory

I enumerated every `cron.schedule(...)` across migrations and traced final state (which `unschedule` reverts which). The active set after all migrations apply:

| Job name | Schedule (UTC) | Defined in | Sends | Status |
|---|---|---|---|---|
| `calculate-scores-live` | `*/2 * * * *` | 10 | `{fixture_id: live_fixture.id}` for each live row | **OK** |
| `run-draft-lottery` | `*/15 * * * *` | 26 (overwrote 03's `*/5`) | `{}` | OK (gates by deadline inside fn) |
| `auto-open-transfer-window` | `0 */2 * * *` | 22 (re-confirmed in 26) | `{}` | OK |
| `sync-player-status` | `0 */6 * * *` | 63 (final overwrite) | `{forza_id: '426'}` | **OK** for EPL only |
| `sync-players-daily` | `0 9 * * *` | 63 (final overwrite) | `{forza_id: '426'}` | **🔴 hits 42P10 — see I1** |
| `sync-fixtures` | `0 21 * * *` | 63 (final overwrite) | `{forza_id: '426'}` | OK |
| `ingest-match-events` | `15 21 * * *` | 63 | `{}` | **🔴 400 every run — see I3** |
| `calculate-scores-daily` | `0 22 * * *` | 63 | `{}` | **🔴 400 every run — see I3** |
| `sync-wc-players-6h` | `0 */6 * * *` | 63 (re-overwrite of 60) | `{tournament_id: '429'}` | **🔴 400 every run — see I2** |
| `sync-wc-fixtures-6h` | `0 */6 * * *` | 63 (re-overwrite of 60) | `{tournament_id: '429'}` | **🔴 400 every run — see I2** |
| `sync-all-active-tournaments` | `0 */6 * * *` | 51 | calls 3 syncs per active tournament | OK in isolation — duplicates I4 |
| `auto-close-bets` | `0 */6 * * *` | 34 | inline SQL UPDATE | OK |
| `resolve-expired-auctions` | (per migration 36) | 36 | inline SQL | OK if RPC exists |

### Missing crons (claimed in BACKLOG but no migration creates them)

- **`ingest-match-events-live`** — BACKLOG (line 22) describes it firing at even minutes alternating with `calculate-scores-live`. No migration creates it. Either it lives in the Supabase dashboard out-of-band or it was never created.
- **Bet auto-resolver** — `bet_instances.resolves_at` column exists; nothing schedules resolution. `auto-close-bets` only flips `open→closed`. Final `closed→resolved` is purely manual.
- **Rank recompute** — see LOGIC_AUDIT L3.3.

### Conflict: 5 separate sync-* jobs fire at minute `0` of every 6h slot

```
00:00, 06:00, 12:00, 18:00 UTC:
  sync-player-status        (EPL only)
  sync-wc-players-6h        (WC, broken)
  sync-wc-fixtures-6h       (WC, broken)
  sync-all-active-tournaments (calls EVERYTHING — duplicates the others)
  auto-close-bets
```

This is a self-induced thundering-herd. Forza will rate-limit. **Fix:** stagger by 1-2 minutes each.

---

## 2. Forza API → Schema → Consumer Trace

Tracing each Forza endpoint through to where its data lives and which consumer reads it.

### 2.1 `/v1/tournaments/{id}` — Tournament discovery
- **Used by:** `discover-tournament/index.js` (manual exploration), `test-forza-api/index.js` (diagnostic).
- **Writes to:** Nothing — discovery is read-only. Tournament rows seeded manually via migrations 16, 59.
- **Issue:** `discover-tournament` is **sequential** over 130 IDs, each with retries+timeout=10s → up to 65 min wall time → edge timeout (150-400s). Found in CODE_AUDIT (DATA-16).
- **Issue:** Both functions log the URL containing `access_token` (CODE_AUDIT DATA-17).

### 2.2 `/v1/tournaments/{id}/matches` — Fixtures
- **Used by:** `sync-fixtures/index.js`
- **Writes to:** `fixtures` (id, forza_match_id, tournament_id, round_number, home_team, away_team, kickoff_at, status, status_detail, home_score, away_score, scores).
- **Derived:** `matchday_deadlines` row per round (MIN kickoff per round).
- **Consumer:** Everywhere — calculate-scores joins on `fixtures.round_number, .tournament_id`; ingest-match-events looks up `forza_match_id`; transfer window logic reads deadlines.

**Issues found:**
| ID | Severity | Issue |
|---|---|---|
| **2.2.a** | HIGH | `sync-fixtures` gates on `tournament.sync_enabled = true`. Per migration 16, EPL is seeded with `sync_enabled = false`. Production has presumably flipped it; this isn't enforced by the cron. **A fresh DB will have crons firing that immediately return 403** — invisible breakage. |
| **2.2.b** | HIGH | `m.kickoff_at < deadlineMap[round]` is string comparison (CODE_AUDIT DATA-19). Works for UTC ISO; breaks on offset timezones if Forza ever returns them. |
| **2.2.c** | MEDIUM | Fixture status mapping is binary (`'live' / 'after' / scheduled`). `'before'`, `'postponed'`, `'cancelled'`, `'abandoned'` all become `'scheduled'` — postponed fixtures stay on the schedule indefinitely. |
| **2.2.d** | MEDIUM | Fixture id format `'f-{m.id}'`. Mock data uses `'md1-f1'`. There's no collision protection (the `f-` prefix prevents prefix collisions but not arbitrary collisions). Coexistence of mock + Forza fixtures in the same fixtures table risks ambiguity. Recommend a `data_source TEXT` column. |
| **2.2.e** | LOW | If Forza returns 0 matches, the function returns `fixtures_upserted: 0` and the deadlines are not refreshed — old `matchday_deadlines` rows persist. No cleanup. |

### 2.3 `/v1/teams/{id}/squad` — Players per team
- **Used by:** `sync-players/index.js` (called per-team in a 5-concurrent loop).
- **Writes to:** `teams` (forza_team_id, tournament_id, name); `players` (id, forza_player_id, forza_team_id, tournament_id, name, position, nationality, club, birthdate, height, **price: null**).
- **Consumer:** Squad selection, transfers, draft lottery, ingest-match-events position lookup.

**Issues found:**
| ID | Severity | Issue |
|---|---|---|
| **2.3.a** | 🔴 CRITICAL | **`onConflict: 'forza_player_id,tournament_id'`** at line 173 references a constraint that doesn't exist. Migration 16 only creates `UNIQUE INDEX players_forza_player_id_idx ON players(forza_player_id) WHERE forza_player_id IS NOT NULL` — single column. Postgres returns `42P10 no unique or exclusion constraint matching the ON CONFLICT specification`. Sync silently fails on every conflict. **Fix:** Add a proper composite unique constraint, then drop the single-column one (or drop the single-column to allow cross-tournament). |
| **2.3.b** | 🔴 CRITICAL | Even if 2.3.a is fixed, the `players_forza_player_id_idx` UNIQUE INDEX **prevents the same Forza player ID existing in two tournaments**. Saka (EPL) and Saka (England/WC2026) can't coexist in `players`. The whole `tournament_id` strategy is undermined by this index. **Fix:** Drop `players_forza_player_id_idx`, create `UNIQUE INDEX ON players(forza_player_id, tournament_id) WHERE forza_player_id IS NOT NULL`. |
| **2.3.c** | 🔴 CRITICAL | Player rows are upserted with `price: null` (line 167). Once 2.3.a is fixed, every daily sync overwrites the carefully-curated valuations from migrations 17 & 65. **Fix:** Either (a) `ON CONFLICT ... DO UPDATE SET name = EXCLUDED.name, position = ..., DO NOT UPDATE price` (PostgREST doesn't support this directly; need a raw SQL view or write each column explicitly), or (b) drop `price` from the upsert payload and use `DO UPDATE` clause manually. Recommended: use `.upsert(..., { ignoreDuplicates: false })` and customize by manually composing the upsert via `rpc('upsert_players_preserve_price', ...)`. |
| **2.3.d** | HIGH | `/v1/tournaments/:id/teams` is "CloudFront-blocked from outside Supabase IPs" (per the function comment). Teams are derived from `fixtures.home_team_forza_id, away_team_forza_id`. If a team is referenced in fixtures but only as `home_team_forza_id` with no real team name (`'TBD'`, placeholder), it's silently dropped by `isRealTeam`. New WC qualifiers ("Winner of Group A") never get player data. |
| **2.3.e** | HIGH | `isRealTeam` filter (line 61-68) is fragile. It rejects `'W101'` and short names but accepts `'QFa'`, `'TBD'`, `'RUE3'`, etc. WC bracket placeholders leak through. |
| **2.3.f** | MEDIUM | `players.height: p.height ?? null` — Forza returns height in cm; if missing, null. But there's no fallback for nationality (`p.region?.name ?? null`). For WC players, nationality IS the team — getting `nationality: null` for WC players because their region.name doesn't match the team in Forza's schema. |

### 2.4 `/v2/teams/{id}/unavailable_players` — Injury / suspension status
- **Used by:** `sync-player-status/index.js`
- **Writes to:** `player_status` (player_id, status, confidence, reason, return_date).
- **Consumer:** DangerZone component, squad pickers, availability badges.

**Issues found:**
| ID | Severity | Issue |
|---|---|---|
| **2.4.a** | HIGH | N+1 query per absence (CODE_AUDIT DATA-15). 1000+ sequential round trips per cron run. |
| **2.4.b** | MEDIUM | `mapStatus` returns `'doubt'` if `absence._type !== 'suspension'` AND `expected_return.type` is unknown. But this fallback assumes any `absence._type === 'suspension'` exits via the early branch on line 62. The `_type` is set manually at line 165 — for `suspensions` it's never set (line 122 doesn't assign `_type`). So the suspension branch in `mapStatus` is **dead code** — every suspension hits the absences path mapping with `_type` undefined. Result: suspensions are marked `'doubt'` instead of `'out'`. **Fix:** Set `s._type = 'suspension'` at line 122 before pushing. |
| **2.4.c** | MEDIUM | Pass 2 (reset to 'fit') only looks at players whose `player_status` row exists AND is non-fit. A player who was once 'out', got reset to 'fit' last week, is now injured again — they're not in the "non-fit" set, so a fresh injury doesn't show up. Wait — Pass 1 inserts/upserts new status rows for them. OK actually fine. But: if a player has NEVER had a `player_status` row, Pass 1 creates one via upsert (`onConflict: 'player_id'`). For brand new injuries, this works. |
| **2.4.d** | LOW | `mapReason(forza_reason, type)` ignores the `type` param — `mapReason(a.reason, a.type)` and `mapReason(s.reason, 'suspension')` produce the same string. Confusing API surface. |
| **2.4.e** | LOW | `data.suspensions || []` and `data.absences || []` — if `data` itself is null (HTTP 204), `data.suspensions` would throw. Need `(data?.suspensions || [])`. |

### 2.5 `/v1/matches/{id}` + `/v1/matches/{id}/lineups` + `/v2/matches/{id}/periods` + `/v2/matches/{id}/player_statistics` — Live match data
- **Used by:** `ingest-match-events/index.js` (4 endpoints in parallel).
- **Writes to:** `fixtures.status / .home_score / .away_score / .scores`; `player_match_stats` (rich stats); `match_events` (event feed).
- **Consumer:** `calculate-scores` Path A reads `player_match_stats` where `forza_match_id IS NOT NULL`; LiveScreen reads `match_events` for activity feed.

**Issues found:**
| ID | Severity | Issue |
|---|---|---|
| **2.5.a** | 🔴 CRITICAL | **Never called by any cron** (see I3). Only triggered by manual invocation. |
| **2.5.b** | HIGH | `penalty_missed` events stored as `type:'goal'` (LOGIC_AUDIT L1.7). Live feed shows misses as goals; Path B would count them as goals. |
| **2.5.c** | HIGH | `parseInt(ev.minute)` truncates added-time minutes silently (`'45+2'` → `45`) — sub at min `90+3` becomes `90`. |
| **2.5.d** | MEDIUM | `playerLookup` is built only from players in the 2 teams playing this fixture. If a player was traded mid-season and is now on team C but the fixture file still has them on team A (Forza data lag), they're dropped. Net effect: their stats for this match are lost. |
| **2.5.e** | MEDIUM | `concededByTeam` uses match scores rather than team_id from events. If a goal's `team_side` is wrong in Forza data, clean_sheet may be miscalculated. Acceptable risk. |
| **2.5.f** | MEDIUM | Penalty save derivation is by team-level approximation: GK on team X is credited 1 penalty_saved for every penalty MISSED by team Y. This conflates posts/bars with saves. Acceptable upstream of Forza exposing actual `penalty_save` events. |

### 2.6 Cross-pipeline issues

| ID | Severity | Issue |
|---|---|---|
| **2.6.a** | HIGH | **Tournament ID mismatch for WC**. Migration 59 creates WC with `forza_id='429'`, `id='30b6ad7a-...'`. WC pricing migration 65 targets `tournament_id = '30b6ad7a-...'` (the UUID). But every other consumer (sync-fixtures, sync-players, sync-player-status, ingest-match-events, calculate-scores) uses `tournament_id = forza_id = '429'`. WC players synced under `tournament_id='429'` won't match the `'30b6ad7a-...'` valuations migration. **Result: every WC player has price=null forever.** |
| **2.6.b** | HIGH | The `forza_id` vs `tournament_id` naming confusion runs deep. `players.tournament_id` is sometimes a UUID (squads via leagues.tournament_id), sometimes a Forza ID string (`'426'`). Inconsistent FK referencing — `players.tournament_id REFERENCES tournaments(forza_id)` (migration 16:77), so it should ALWAYS be the Forza ID. Migration 65 violates this contract. |
| **2.6.c** | HIGH | `LeagueScreen.jsx:163` — `const [leagueTournament, setLeagueTournament] = useState('426')`. Hard-coded EPL default. New leagues get '426' until manually changed. |
| **2.6.d** | MEDIUM | `useCommissioner.autoGenerateBetOptions` uses `tournament_id || '426'`. If commissioner is in a WC league but the prop isn't loaded yet, they get EPL bet options. |

---

## 3. Bet Data — Incoming + Processing

### 3.1 Required data presence

For a bet to be **resolvable**, the following data must be in the DB:

| Bet template | Data needed | Source | Status |
|---|---|---|---|
| `match_result` | `fixtures.home_score`, `fixtures.away_score`, `fixtures.status='finished'` | `sync-fixtures` or `ingest-match-events` | ✓ data path exists, ✗ no auto-resolver |
| `top_scorer` | `player_match_stats.goals` aggregated per matchday | `ingest-match-events` (Forza) or `calculate-scores` Path B | ✓ data path exists, ✗ no auto-resolver |
| `player_block` | `fantasy_points.total` for the picked player (<5) | `calculate-scores` | ✓ data path exists, ✗ no auto-resolver |

**Conclusion:** the data IS present (when ingestion works), but nothing automatically resolves bets. Commissioners must manually pick the correct answer for every bet.

### 3.2 Bet template UUID hardcoding
**File:** `src/components/league/BetCreatorPanel.jsx:9-13`

```js
const TEMPLATE_UUID = {
  top_scorer:   '912e7b5f-1c15-4747-bc0b-2da9678627ea',
  match_result: '63a7de4f-5153-4e12-b6c5-4d5f3fc199fc',
  player_block: 'b1828846-4ed6-47d6-9430-944768d87ae8',
};
```

These UUIDs are pre-determined values. But migration 28 seeds `bet_templates` with `gen_random_uuid()` defaults — IDs are random per environment. On any DB that hasn't had these specific UUIDs manually inserted, every bet gets `template_id: null`.

**Fix:** Either seed migration 28 with specific UUIDs:
```sql
INSERT INTO bet_templates (id, slug, ...) VALUES
  ('912e7b5f-1c15-4747-bc0b-2da9678627ea', 'top_scorer', ...),
  ...
```
Or look up the template by slug at runtime:
```js
const { data: tpl } = await supabase
  .from('bet_templates').select('id').eq('slug', template).maybeSingle();
const template_id = tpl?.id ?? null;
```

The slug→id lookup is the right call — environment-portable, type-safe.

### 3.3 Bet scope_ref not populated for match_result
**File:** `src/components/league/BetCreatorPanel.jsx:283-290`

The insert doesn't set `scope_ref`. For `match_result` bets, `scope_ref` should be the `fixture_id` so an auto-resolver can find which match drives the answer. Currently, the fixture id is embedded only in the option keys (`${f.id}_home`). The auto-resolver would have to parse the keys.

**Fix:** When a fixture is selected for a `match_result` bet, set `scope_ref = fixture.id`.

### 3.4 Bet auto-resolver — design

Suggested cron + function pair (currently missing):

```sql
-- new migration
SELECT cron.schedule(
  'resolve-finished-bets',
  '*/15 * * * *',
  $$ SELECT net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/resolve-bets',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.service_role_key')
    ),
    body := '{}'::jsonb
  ) $$
);
```

Function `resolve-bets/index.js` pseudocode:
```js
// For each bet_instance where status='closed' AND resolves_at IS NULL OR resolves_at < NOW():
//   case 'match_result':
//     fx = fixtures.where(id = scope_ref).single()
//     if fx.status !== 'finished' continue
//     correct = fx.home_score > fx.away_score ? `${fx.id}_home`
//             : fx.home_score < fx.away_score ? `${fx.id}_away`
//             : `${fx.id}_draw`
//     rpc.resolve_bet(p_instance_id=..., p_correct_answer=correct)
//   case 'top_scorer':
//     // Aggregate goals across the matchday window
//     ...
//   case 'player_block':
//     // Look up fantasy_points for the picked player in this matchday
//     ...
```

This unlocks the entire bet flow without commissioner intervention.

### 3.5 Bet realtime / channel mismatches
- `useBets` subscribes to `bet_instances` filtered by `league_id`. ✓
- `useBets` subscribes to `bet_submissions` filtered by `squad_id` server-side. ✓
- `useBettingLeaderboard` subscribes to ALL `bet_submissions` UPDATE — no filter (LOGIC_AUDIT L2.7).

### 3.6 Bet RLS — already covered in CODE_AUDIT
- SEC-5 — `resolve_bet` no commissioner check.
- LOGIC_AUDIT L2.1 — no validation of `p_correct_answer`.
- LOGIC_AUDIT L2.6 — `!inner` missing in leaderboard query.

---

## 4. Hardcoded / Dummy / Placeholder Data Still in Code

### 4.1 Demo / Mock data
| File | What's hardcoded | Path | Resolution |
|---|---|---|---|
| `src/context/AuthContext.jsx:21-27` | `DEMO_USER` with hardcoded id `'00000000-...'` and `VITE_AUTH_ENABLED` flag | Production has auth enabled, but the demo user is what every E2E test runs against. CI runs with `VITE_AUTH_ENABLED=false` (CODE_AUDIT DEPLOY-2). | **Keep but gate by env**; ensure production deploy sets `VITE_AUTH_ENABLED=true`. |
| `src/data/squad.js` | 15 hardcoded WC players with prices/positions/clubs/intel | Comment claims it's only a "fallback when DB returns no data". Grep confirms **no file imports it**. Dead file. | **Delete `src/data/squad.js` and `src/data/fixtures.js`**. |
| `src/data/fixtures.js` | Empty `[]`; comment notes it's "a reference stub only" | Dead. | Delete. |

### 4.2 Hardcoded EPL tournament ID `'426'`
| Location | Use |
|---|---|
| `src/screens/LeagueScreen.jsx:163` | `useState('426')` default for `leagueTournament` |
| `src/hooks/useCommissioner.js:171` | `tournament_id || '426'` in `autoGenerateBetOptions` for player_pick / top_scorer |
| `src/hooks/useCommissioner.js:182` | `tournament_id || '426'` for match_result fixture fetch |
| `supabase/migrations/63_fix_http_cron_signatures.sql:32, 45, 58` | All EPL crons hard-pin `'426'` |
| `supabase/migrations/26_transfer_window_constraint_and_cron.sql:45, 93` | Old EPL cron bodies (overwritten by 63) |
| `supabase/migrations/32_update_cron_schedules.sql:27, 44` | Same |
| `supabase/functions/test-forza-api/index.js:14` | Diagnostic — fine |

**Risk:** WC league users land on an EPL default at multiple points. The frontend `leagueTournament` state, when undefined briefly during loading, falls back to `'426'`, and the bet options auto-generated then are EPL players.

**Fix:**
- Remove the `|| '426'` fallback in `useCommissioner` — if no `tournament_id` is provided, refuse to generate options (return error).
- `LeagueScreen.leagueTournament` should default to `null` and only set after `loadLeagueById` resolves.
- Crons should be derived from `tournaments WHERE sync_enabled = true` — which is exactly what migration 51's orchestrator does. **Delete the hardcoded EPL/WC crons from migration 63**; rely on the orchestrator.

### 4.3 Hardcoded Supabase project URL in migrations
| Location | Value |
|---|---|
| `supabase/migrations/26_transfer_window_constraint_and_cron.sql:19` | `ALTER DATABASE postgres SET app.supabase_url = 'https://sssmvihxtqtohisghjet.supabase.co'` |
| `supabase/migrations/60_setup_wc_sync_cron.sql:15, 31` | URL embedded inline |
| `supabase/migrations/63_fix_http_cron_signatures.sql:31, 44, 57, 70, 83, 96, 109` | URL embedded inline in every cron |

**Issue:** Project ref leaks into the public repo. If you ever migrate Supabase projects (e.g. for staging), every cron continues pointing at the old project. Migrations 51 correctly uses `current_setting('app.supabase_url')` — migration 63 regressed it.

**Fix:** Replace every `'https://sssmvihxtqtohisghjet.supabase.co'` with `current_setting('app.supabase_url')`. The setting is already configured in migration 26. Net result: one source of truth.

### 4.4 Hardcoded service role setting names
- Migration 51, 63: `current_setting('app.service_role_key')` ✓
- Migration 60: `current_setting('app.settings.service_role_key')` ✗ — different setting name

The WC sync crons (migration 60) will send `Authorization: Bearer null` because the dotted setting isn't set. Migration 63 fixes this for the EPL crons but **the WC overwrites still use the wrong name**. Actually wait — migration 63 overwrites both 60's WC jobs. Let me recheck: 63 line 91 (`sync-wc-players-6h`) and line 104 (`sync-wc-fixtures-6h`) use `current_setting('app.service_role_key')` ✓. So migration 60's wrong setting is dead code (overwritten).

**Fix:** Drop migration 60 entirely (or leave; it's superseded). Document that the canonical setting is `app.service_role_key`.

### 4.5 Hardcoded bet template UUIDs
Covered in §3.2.

### 4.6 Hardcoded player valuations via `ILIKE`
| Migration | Players priced |
|---|---|
| 17 (EPL) | ~40 named players via `name ILIKE '%Foo%'` |
| 65 (WC) | ~30 named players, but **targets wrong tournament_id** (see 2.6.a) |

These are necessary fallback for the dry-run phase, but they're brittle:
- A player's nickname change in Forza (e.g., `'Bukayo Saka'` → `'B. Saka'`) breaks the ILIKE.
- New signings get the position default; mid-tier players get over-priced (5.5M for all defenders is lazy).

**Fix:** Long-term, valuations should come from an external data feed (FPL JSON, Sky Sports). Short-term, keep the migration-based approach but make the WC version target the correct `tournament_id` (= `'429'`, the forza_id, not the UUID).

### 4.7 Hardcoded matchday IDs
| Location | Hardcoded value |
|---|---|
| `src/hooks/useDeadlineCountdown.js:29` | `const MATCHDAY_ID = 'md1'` (LOGIC_AUDIT FRONT-5 / FRONT-C5) |
| `supabase/functions/process-transfer/index.js:116` | New squad rows insert `matchday_id: 'current'` |
| `supabase/migrations/13_scoring_schema_align.sql:34` | Backfill default `'current'` for fantasy_points |

The format diverges from canonical `'{tournament_id}-rN'` (LOGIC_AUDIT L4.1).

### 4.8 Dummy fixture data
| Location | What |
|---|---|
| `supabase/migrations/00_schema.sql` | Mock fixtures with ids like `md1-f1`, `md2-f3` |
| `supabase/migrations/12_dummy_matchday.sql` | Dummy matchday2 |
| `supabase/migrations/63_fix_dummy_fixture_live_status.sql` | Fixes status on demo row `md2-f3` |
| `e2e-seed.sql` (uncommitted) | More mock data |

**Risk:** Mock fixtures still in `fixtures` table interleave with Forza fixtures. Filter logic in `useBets`, `calculate-scores`, etc. doesn't distinguish.

**Fix:** Either purge mock rows in a dedicated migration once Forza data is live, or add a `data_source TEXT` column to fixtures and filter consumers by `data_source = 'forza'`.

---

## 5. Correction Plan

### Phase A — Unblock the live pipeline (≈2 hours)
A single new migration `66_ingestion_fixes.sql`:

```sql
-- I1: Fix sync-players upsert constraint
DROP INDEX IF EXISTS players_forza_player_id_idx;
CREATE UNIQUE INDEX IF NOT EXISTS players_forza_player_tournament_idx
  ON players(forza_player_id, tournament_id)
  WHERE forza_player_id IS NOT NULL;

-- I4: Remove duplicate sync crons (rely on orchestrator from migration 51)
SELECT cron.unschedule('sync-player-status') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='sync-player-status');
SELECT cron.unschedule('sync-players-daily') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='sync-players-daily');
SELECT cron.unschedule('sync-fixtures')      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='sync-fixtures');
SELECT cron.unschedule('sync-wc-players-6h') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='sync-wc-players-6h');
SELECT cron.unschedule('sync-wc-fixtures-6h')WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='sync-wc-fixtures-6h');

-- Remove broken crons sending empty bodies
SELECT cron.unschedule('ingest-match-events') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='ingest-match-events');
SELECT cron.unschedule('calculate-scores-daily') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='calculate-scores-daily');

-- I3: Add a working live ingest cron — iterates every live fixture
SELECT cron.schedule(
  'ingest-match-events-live',
  '*/2 * * * *',
  $$
    SELECT net.http_post(
      url := current_setting('app.supabase_url') || '/functions/v1/ingest-match-events',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.service_role_key')
      ),
      body := json_build_object('forza_match_id', f.forza_match_id)::jsonb
    )
    FROM fixtures f
    WHERE f.status = 'live' AND f.forza_match_id IS NOT NULL;
  $$
);

-- I3: Daily backfill (catches finished fixtures that were missed live)
SELECT cron.schedule(
  'ingest-match-events-daily-backfill',
  '15 22 * * *',  -- after calculate-scores-live has time to clean up
  $$
    SELECT net.http_post(
      url := current_setting('app.supabase_url') || '/functions/v1/ingest-match-events',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.service_role_key')
      ),
      body := json_build_object('forza_match_id', f.forza_match_id)::jsonb
    )
    FROM fixtures f
    WHERE f.status = 'finished'
      AND f.forza_match_id IS NOT NULL
      AND f.updated_at > NOW() - INTERVAL '12 hours';
  $$
);

-- 2.6.a: WC valuation migration targeted wrong tournament_id
UPDATE players SET price = NULL
  WHERE tournament_id = '30b6ad7a-7503-409e-b10f-0c74eeb46968';
-- Re-run migration 65 logic but with tournament_id = '429':
-- (replicate the named overrides from migration 65 with tournament_id = '429')
```

And update `sync-players/index.js`:
```js
// I1 follow-up: drop `price` from the upsert so daily sync doesn't wipe prices
const playerRows = squad.map(p => ({
  // ... keep id, forza_player_id, tournament_id, name, position, club, nationality, birthdate, height
  // REMOVE: price: null,
}));
// Existing prices stay intact on conflict.
```

### Phase B — Bet auto-resolver (≈3 hours)
1. Add a new edge function `supabase/functions/resolve-bets/index.js` that handles `match_result`, `top_scorer`, `player_block` (see §3.4).
2. Add a migration `67_bet_resolver_cron.sql` scheduling it every 15 minutes.
3. Add the `scope_ref = fixture.id` writing in `BetCreatorPanel.jsx` for match_result bets.
4. Replace `TEMPLATE_UUID` hardcoded lookup in `BetCreatorPanel.jsx` + `useCommissioner.js` with a slug→id lookup against `bet_templates`.
5. Re-seed `bet_templates` in migration 28 (or a new one) with deterministic UUIDs that match the frontend's expectations — OR delete the hardcoded UUIDs entirely.

### Phase C — Hardcoded data cleanup (≈90 min)
1. Delete `src/data/squad.js`, `src/data/fixtures.js`.
2. Remove `|| '426'` fallbacks in `useCommissioner.js`. Surface error if `tournamentId` missing.
3. Change `LeagueScreen.leagueTournament` default to `null`.
4. Migration `68_use_setting_for_cron_url.sql` that re-schedules every cron from migration 63 using `current_setting('app.supabase_url')` instead of the hardcoded literal.
5. Verify `app.supabase_url` and `app.service_role_key` are set in the DB (migration 26 sets the URL; service role key is set manually per CLAUDE.md).

### Phase D — Robustness (≈1-2 hours)
1. Fix `sync-player-status` `_type` assignment for suspensions (2.4.b).
2. Stagger crons that currently all fire at `0 */6 * * *` (I4 mitigation).
3. Add `data_source TEXT` column to fixtures; mark seed rows as `'mock'`, Forza-synced as `'forza'`; filter consumers.
4. Add the `_type = 'suspension'` fix in sync-player-status.
5. Add minute-parser helper for added-time (`45+2`).

---

## 6. Verification After Phase A

```sql
-- 1. Player sync now works
SELECT count(*) FROM players WHERE tournament_id = '426' AND forza_player_id IS NOT NULL;
-- After running sync-players manually, expect > 0 and growing.

-- 2. Cross-tournament players coexist
SELECT forza_player_id, count(DISTINCT tournament_id)
FROM players WHERE forza_player_id IS NOT NULL
GROUP BY forza_player_id HAVING count(DISTINCT tournament_id) > 1;
-- After sync runs for both EPL (426) and WC (429), some star players (Mbappé, Bellingham, Salah) should appear twice — once per tournament.

-- 3. No duplicate cron firings
SELECT jobname, schedule FROM cron.job WHERE jobname LIKE 'sync-%' OR jobname LIKE 'ingest-%' ORDER BY schedule;
-- Expect: one orchestrator job, plus the live + backfill ingest jobs. No duplicate sync-*.

-- 4. Live ingest fires for live fixtures
-- After kickoff:
SELECT count(*) FROM player_match_stats WHERE forza_match_id IS NOT NULL AND updated_at > NOW() - INTERVAL '10 minutes';
-- Expect > 0 during a live match.

-- 5. WC players priced
SELECT position, count(*), avg(price) FROM players WHERE tournament_id = '429' GROUP BY position;
-- Expect non-null avg price per position.

-- 6. Prices not wiped by sync
-- Note Haaland's price, manually run sync-players, then:
SELECT price FROM players WHERE forza_player_id = '<HAALAND_ID>' AND tournament_id = '426';
-- Expect: unchanged from 14.0.
```

```sh
# 7. Manual ingest test
curl -X POST 'https://<project>.supabase.co/functions/v1/ingest-match-events' \
  -H "Authorization: Bearer $SERVICE_KEY" \
  -d '{"forza_match_id": "<live_match_id>"}'
# Expect: 200, players_ingested > 0, events_written > 0
```

---

## 7. Improvement Opportunities (non-blocking)

1. **Forza fetch helper extracted to `_shared/forza.ts`** — currently 4 functions duplicate it. Centralizing also makes redaction (logs without access_token) a single change.
2. **Rate-limit aware Forza client** — honour `Retry-After` headers, exponential backoff with jitter. The current `attempt * 1000ms` is naive.
3. **`tournaments.sync_enabled` self-check in cron orchestrator** — already in migration 51. But the EPL/WC hardcoded crons in migration 63 bypass this check. After Phase A, only the orchestrator runs and the check is honored everywhere.
4. **`data_source` column on fixtures/players** — distinguishes mock vs Forza. Allows safely purging mock data later, and filtering UI/scoring by source.
5. **`bet_instances.scope_type='season'`** is a documented option but no template uses it. Either add a "Season top scorer" template that auto-resolves at the season end, or remove the option.
6. **Bet outcomes table** — instead of stuffing `is_correct` and `reward_awarded` into `bet_submissions`, have a separate `bet_outcomes (bet_instance_id, correct_answer, resolved_at, source)` table. Cleaner audit trail; better support for re-resolving on dispute.
7. **Forza endpoint version pinning** — code mixes `/v1/` and `/v2/`. Migrating one endpoint to v2 (e.g. v1/matches → v2/matches with richer payload) is undocumented. Add a constants module with endpoint paths.
8. **Webhook from Supabase fixtures status change → ingest-match-events** — instead of `*/2 *` polling, a DB trigger on `fixtures.status = 'live'` could fire the ingest. Reduces latency by up to 2 min on goals.
9. **Forza API mock for tests** — currently CI E2E runs with `VITE_AUTH_ENABLED=false` (demo mode) and no Forza calls. Adding a mock would let CI exercise the ingestion code paths without burning Forza quota.
10. **Single source of truth for tournament resolution** — replace `tournament_id || '426'` with a centralized `resolveTournamentId(league)` util that throws if not set, never silently defaults.

End of ingestion audit.
