# MD1 Correction Runbook — v29 Bug (2026-06-19)

**Purpose**: Record of the process, errors, and decisions made when correcting `fantasy_points` for `matchday_id='429-r1'` after the calculate-scores v29 `live_xi` overwrite bug.

---

## Root Cause

`calculate-scores` v29 wrote `live_xi` on **every** live scoring pass (every 2 min, 05:00–16:29 UTC June 18). At `roundComplete`, `base_xi` and `effective_xi` were frozen from `live_xi` — which by then reflected the post-R2-transfer squad, not the R1 squad. Managers who bought R2 players AND moved them into their XI during the corruption window had wrong `effective_xi` in their R1 `fantasy_points` row.

**Why `effective_xi` matters**: `RecapView.jsx` uses `bd.effective_xi` (from `points_breakdown`) as the authoritative starter list when the field is set (`settled = !!bd?.effective_xi?.length`). It does NOT fall back to `squads.starting_xi`. Fixing `points_breakdown` is sufficient — `squads` table is never touched.

---

## Invariants

- **Only `fantasy_points` rows for `matchday_id='429-r1'` may be modified**
- **`squads` table is never touched**
- **v31 guard** (blocks Edge Function rescoring of settled rounds) is bypassed via direct SQL UPDATE — this is intentional

---

## Scoring Formula (for manual recalculation)

```
total = SUM(ROUND(player_pts) for each player in effective_xi)
      + ROUND(captain_pts)    ← captain counted twice: once as starter, once as bonus
```

JavaScript `Math.round` = round-half-up. PostgreSQL `ROUND()` = banker's rounding (half-to-even). When computing manually, use Python's `math.floor(v + 0.5)` or test with `SELECT ROUND(x::numeric, 0)`.

---

## Process Followed (Manual, Per-Manager)

1. **Identify affected leagues** — All tournament 429 leagues (World Cup pilot)
2. **Identify affected managers** — Squads with `round_transfers->'429-r2' > 0` AND those R2 buys present in `effective_xi` for R1
3. **For each manager**:
   a. Get correct squad_id (must filter by league name — see "Wrong squad_id" error below)
   b. Identify R2 buys: last N entries in `squads.players` where N = `round_transfers->>'429-r2'::int`
   c. Check which R2 buys leaked into `effective_xi`
   d. Reconstruct correct R1 XI: remove R2 buys, fill from bench (array order in `players`)
   e. Resolve player IDs for captain (see "Player ID format" below)
   f. Manually compute correct `total` using the formula above
   g. Write UPDATE: `points_breakdown || jsonb_build_object('effective_xi', [...], 'effective_captain_id', '...', 'base_captain_id', '...', 'bench_players', [...])`
4. **After all UPDATEs**: run `aggregate_league_member_points(league_id::uuid, user_id::uuid)` for every affected manager — this refreshes `league_members.total_points` and rank

---

## Errors Encountered

### 1. Wrong squad_id from cross-join without league filter

**Query that failed:**
```sql
SELECT fp.squad_id FROM fantasy_points fp
JOIN squads s ON s.id = fp.squad_id
JOIN league_members lm ON lm.user_id = s.user_id
WHERE fp.matchday_id = '429-r1' AND lm.username = 'GBruschy'
```
**Problem**: `league_members` join without `WHERE lm.league_id = ?` returned the manager's squad from a **different league**. squad_id ended in `-8ad2-...` instead of the correct `-7aad-...`.

**Fix**: Always add `JOIN leagues l ON l.id = s.league_id WHERE l.name = 'League Name'` (or use `lm.league_id = 'known-uuid'`).

---

### 2. Player ID format mismatch

**Problem**: Querying `players WHERE forza_player_id = 'fp-2859358-429'` → 0 rows.

**Fix**: The `players` table stores only the numeric part: `forza_player_id = '2859358'`. Squad and fantasy_points JSON uses the `fp-{numeric}-{tournament_id}` format. Strip prefix/suffix when joining:

```sql
WHERE forza_player_id = split_part(split_part('fp-2859358-429', '-', 2), '-', 1)
-- or equivalently:
WHERE 'fp-' || forza_player_id || '-429' = 'fp-2859358-429'
```

---

### 3. Multi-statement SQL with `--` comments fails

```bash
npx supabase db query --linked "SELECT 1; -- comment"
# Error: "String must contain at least 1 character(s)"
```

**Fix**: Run one statement per `db query` call. No inline comments in the SQL string.

---

### 4. Player misidentification (critical — required manual lookup)

When assuming player IDs from name/position, two critical errors were made:

| fp-ID | Assumed | Actual |
|-------|---------|--------|
| fp-2420806-429 | Martin Baturina | **Maxi Araújo** (URU MID) |
| fp-1132117236-429 | ? | Martin Baturina (CRO MID) |
| fp-1423322-429 | Jude Bellingham | **Jordan Pickford** (ENG GK) |
| fp-793480455-429 | ? | Jude Bellingham (ENG MID) |

**Lesson**: Never assume a player ID from name alone. Always verify with:
```sql
SELECT forza_player_id, name, nationality, position
FROM players
WHERE name ILIKE '%bellingham%' AND tournament_id = '429'
```

---

### 5. `bench_players` field may contain R2 buys

When setting `bench_players` in the corrected `points_breakdown`, R2-bought players naturally end up in the bench list (they're in `squads.players` but not in the corrected `effective_xi`). This is acceptable because:
- The bench section in RecapView is BACKLOG item B-09 (not yet rendered)
- Even when rendered, bench players are display-only and never affect the total
- The coach's intent was to buy them for R2, not R1

---

## Mundial do Eder — Corrections Applied

| Manager | Squad ID | Corrupt total | Correct total | Change |
|---------|----------|---------------|---------------|--------|
| GBruschy | ce8b9ed3-7aad-... | 82 (captain Messi) | **77** (captain Kane) | R2 captain |
| SB7 | 09afe5e1-3a91-... | 66 (captain wrong) | **68** (captain Maxi Araújo) | R2 captain |
| gunza | 7b4e85bf-b82c-... | 80 (captain Raphinha) | **69** (captain Mbappé, XI corrected) | 2 R2 buys in XI |
| Mister Trocado | 115a3928-5e92-... | 62 | **75** (captain Havertz) | 2 R2 buys removed |
| RTrocado | f9018ef6-0fb3-... | 56 | **62** (captain Kimmich) | 2 R2 buys removed |
| tommyazcue | 42633a86-14fa-... | 79 | **81** (captain Haaland) | 1 R2 buy replaced |

Final leaderboard (post-correction): Mister Trocado 93 · tommy 84 · GBruschy 77 · FPdS 75 · X Maquina 74 · RTrocado 72 · SB7 71 · gunza 69.

---

## Munaial '26 — Corrections Applied (2026-06-19, session 2)

league_id: `da4ef2e2-f099-4120-abe0-2087369a4163`

| Manager | Squad ID | Corrupt | Correct | Key decision |
|---------|----------|---------|---------|--------------|
| SdB | 92458538-... | 47 | **59** | R2 buys removed; Kane cap |
| Kiko | 4e486a01-... | 38 | **35** | R2 buy (Anderson) removed; KDB R1 holdover restored; NunoMendes cap |
| BernasLima | d81003e9-... | 73 | **77** | R2 buys removed; Cucurella+Gakpo (both sold R2) restored to XI; Vitinha cap |
| Joao Lisboa | 1b322a2f-... | 65 | **64** | R2 buys leaking replaced; Rabiot (R2 buy, 5 pts) added to XI as user-confirmed proxy; Aursnes (R2 sell, 2 pts) kept as R1 starter; Mbappe cap |
| ZeP | 3762f3ef-... | 66 | **54** | 3 R2 buys removed; Havertz (R2 buy, 10 pts) used as 11th XI player per user request (4th R2 sell unknown); ViniJr cap |

Post-correction leaderboard (R1+R2 cumulative): BernasLima 79 · joaolisboa 72 · SdB 69 · ZeP 61 · Fonzinho 49 · Kiko 35.

---

## Draft Mundial 26 — Corrections Applied (2026-06-19, session 2)

league_id: `a4c59f59-40ce-424b-a4ae-d4b7b5c256ab`

| Manager | Squad ID | Corrupt | Correct | Key decision |
|---------|----------|---------|---------|--------------|
| RTrocado (HotRod) | 38dd9c94-... | 64 | **60** | 4 R2 buys removed; Kimmich (R2 sell) cap restored; Balogun (R2 buy, 10 pts) appears in bench display |

Not corrected (verified clean): X Maquina (70 ✓), zecoliveira (52 ✓), Tommy (76 ✓).

Post-correction leaderboard (R1+R2 cumulative): Tommy 76 · X Maquina 70 · RTrocado 62 · Francisco Gomes 61 · spva 59 · [null] 55 · zecoliveira 52.

---

## Streamlined Approach for Remaining Leagues

The manual per-manager process was ~6 SQL round-trips per manager plus manual arithmetic. The correct bulk approach:

### Step 1 — Detect corrupted squads in one query

```sql
-- Find squads in tournament 429 leagues that:
-- (a) made R2 buys, AND
-- (b) have those R2 buys in their R1 effective_xi
WITH r2_buys AS (
  SELECT
    s.id AS squad_id,
    s.league_id,
    s.user_id,
    s.players,
    (s.round_transfers->>'429-r2')::int AS r2_buy_count,
    -- R2 buys are the LAST N elements of the players array
    -- (execute_transfer_atomic appends new buys; sells remove from array)
    s.players[array_length(s.players, 1) - (s.round_transfers->>'429-r2')::int + 1
              : array_length(s.players, 1)] AS r2_player_ids,
    fp.total AS current_r1_total,
    fp.points_breakdown->'effective_xi' AS current_effective_xi,
    fp.points_breakdown->>'effective_captain_id' AS current_captain
  FROM squads s
  JOIN leagues l ON l.id = s.league_id
  JOIN fantasy_points fp ON fp.squad_id = s.id AND fp.matchday_id = '429-r1'
  WHERE l.tournament_id = '429'
    AND (s.round_transfers->>'429-r2')::int > 0
)
SELECT squad_id, user_id, league_id, r2_buy_count, r2_player_ids,
       current_effective_xi, current_captain, current_r1_total
FROM r2_buys
WHERE EXISTS (
  SELECT 1 FROM jsonb_array_elements_text(current_effective_xi) pid
  WHERE pid = ANY(r2_player_ids)
);
```

### Step 2 — Get R1 points for all players in affected squads

```sql
SELECT pms.player_id, SUM(pms.fantasy_points) AS r1_pts
FROM player_match_stats pms
JOIN fixtures f ON f.id = pms.fixture_id
WHERE f.matchday_id LIKE '429-r1%'  -- or use round_number
GROUP BY pms.player_id;
```

### Step 3 — Compute correct XI (application logic)

For each corrupted squad:
1. `r1_players = players - r2_player_ids` (R1-era squad)
2. `correct_xi = current_effective_xi - r2_player_ids` (remove R2 leakers)
3. Fill XI gaps from `r1_players` not already in `correct_xi` (bench-order priority from `players` array)
4. Maintain formation (1 GK, 3-5 DEF, 2-5 MID, 1-3 FWD) — may need position lookups
5. `correct_total = SUM(ROUND(pts[p]) for p in correct_xi) + ROUND(pts[captain])` (captain double-counted)

### Step 4 — Batch UPDATE + aggregate

Run one UPDATE per corrupted squad (still needs to be individual SQL calls due to `npx supabase db query` limitations), then batch-aggregate.

### Key time-savers vs the manual approach

| Manual | Streamlined |
|--------|-------------|
| Identify R2 buys by conversation with manager | `players` array tail heuristic |
| Look up each player ID by name query | Bulk player table join |
| Manually sum points with calculator | SQL SUM + ROUND |
| Verify captain by asking manager | Use `captain_id` from snapshot or infer from non-R2 player with highest pts |
| 6+ round-trips per manager | ~3 SQL queries for all squads |

---

Last Updated: 2026-06-19 (session 2 — Munaial '26 + Draft Mundial 26 corrected)
