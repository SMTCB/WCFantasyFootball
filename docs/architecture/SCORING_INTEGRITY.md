# Scoring Integrity — The v29 Bug, the Failsafe, and Manual Correction

**How we protect XI/bench/captain snapshots from scoring pipeline mutations, and what to do when they go wrong.**

---

## The v29 Bug (2026-06-18, MD1)

### What happened

`calculate-scores` v29 introduced a guard to prevent rescoring of settled rounds (`roundComplete=true`). In doing so, it also changed the `live_xi` field — writing it on **every** live-scoring pass (every 2 min, from ~05:00 UTC until roundComplete at ~16:29 UTC).

At `roundComplete`, `calculate-scores` freezes `base_xi`, `effective_xi`, and `bench_players` from `live_xi`. Because `live_xi` had been overwritten throughout the day, it reflected the **post-transfer squad** of any manager who made R2 transfers while their R1 round was still open — not the squad they actually fielded.

**Consequence**: any manager who (a) made transfers between rounds AND (b) moved one of those new R2 buys into their starting XI during the v29 corruption window had their R1 `effective_xi` frozen with the wrong players. The RecapView uses `effective_xi` as the authoritative XI, so their R1 Recap showed the wrong lineup and inflated/deflated points.

### Root cause (code-level)

In `calculate-scores`, the `live_xi` snapshot was rebuilt from `squad.players` (the current squad) on every pass, instead of being frozen from the `squad.starting_xi` (the actual set lineup). There was no "already snapshotted, skip" guard.

### Why it was hard to detect

- The bug only manifested at `roundComplete` — not during live passes
- Only affected managers who (a) made transfers between rounds AND (b) manually moved R2 buys into their XI during the ~11-hour window
- The `total` in `fantasy_points` also became wrong, not just the `effective_xi`

---

## The Fix (v30 + Migration 182)

### Code fix: calculate-scores v30

`live_xi` is now frozen once per squad per round. The logic:

```js
// v30 freeze logic (pseudo-code)
if (!breakdown.live_xi_frozen) {
  breakdown.live_xi = currentStartingXi;
  breakdown.live_xi_frozen = true;
}
// subsequent passes: live_xi is read-only
```

`live_xi` is set once (first live-scoring pass per squad per round) and never overwritten. At `roundComplete`, `effective_xi` is derived from this frozen snapshot — not from the current squad state.

**Effect**: even if a manager transfers 5 players during R2 scoring, their R1 `effective_xi` remains anchored to what was set when R1 started scoring.

### Database failsafe: squad_matchday_snapshots (Migration 182)

An immutable snapshot table created at the moment each round's **first fixture kicks off** (BEFORE any scoring pass runs).

**Table**: `squad_matchday_snapshots`

| Column | Type | Purpose |
|--------|------|---------|
| `league_id` | UUID | Which league |
| `user_id` | UUID | Which manager |
| `matchday_id` | TEXT | e.g. `'429-r2'` |
| `squad_id` | UUID | Squad row at snapshot time |
| `starting_xi` | TEXT[] | The 11 players the manager had set at kickoff |
| `players` | TEXT[] | Full 15-player roster (XI + bench) at kickoff |
| `captain_id` | TEXT | Captain at kickoff |
| `snapshotted_at` | TIMESTAMPTZ | When the snapshot was taken |
| `snapshot_reason` | TEXT | `'fixture_live'` (automatic) or `'manual_backup_YYYYMMDD'` |

**Key invariant**: `ON CONFLICT (league_id, user_id, matchday_id) DO NOTHING`. The first write wins. Subsequent fixture kickoffs in the same round or manual calls do not overwrite. This makes the table append-only per round per manager.

**Trigger**: `trg_snapshot_squads_on_kickoff` fires AFTER any `fixtures` row transitions `status: scheduled/pre_game/tbd → live`. Calls `snapshot_squads_for_matchday(matchday_id, 'fixture_live')`.

```sql
-- Manual call (for backfill or mid-round safety nets):
SELECT snapshot_squads_for_matchday('429-r2', 'manual_backup_20260619');
-- Returns: number of rows inserted (0 if all already exist)
```

### Coverage by round

| Round | `live_xi` freeze (v30) | Snapshot (migration 182) | Notes |
|-------|------------------------|--------------------------|-------|
| 429-r1 | ❌ | ❌ | Bug round. Pre-fix. 13 managers manually corrected. |
| 429-r2 | ✅ (deployed before scoring started) | ✅ (manually backfilled 2026-06-19 15:45 UTC) | Protected on both axes. |
| 429-r3+ | ✅ | ✅ (trigger fires at first kickoff) | Fully automatic. |

**MD1 has no snapshot** — the round completed before migration 182 was deployed. If an MD1 issue surfaces in the future, the only source of truth is the manual correction runbook and the backup JSON files in `backups/`.

---

## What Gets Backed Up and When

### Automatic (in production)

1. **`squad_matchday_snapshots` trigger** — fires at each round's first fixture kickoff. Captures XI + bench + captain + full roster. Immutable per (league, user, matchday). From R3 onwards, this fires automatically within seconds of the first kickoff.

2. **`fantasy_points.points_breakdown`** — the scoring pipeline writes `base_xi`, `effective_xi`, `bench_players`, `effective_captain_id` at `roundComplete`. Once written (`effective_xi` populated), the RecapView uses this as the authoritative source. The v30 fix ensures this matches the actual R-start XI.

### Manual (per-session)

Before any migration or significant change, the standard backup is:
```bash
# Replace YYYYMMDD_HHMMSS with actual timestamp
npx supabase db query --linked "SELECT ..." > backups/NAME_YYYYMMDD_HHMMSS.json
```

Files saved to `backups/` (gitignored). A companion `BACKUP_README_YYYYMMDD_HHMMSS.md` describes what each file contains and why it was taken.

**Standard backup set before any scoring-related work:**
1. `fantasy_points_429_r1_TIMESTAMP.json` — settled MD points with `effective_xi`
2. `fantasy_points_429_r2_TIMESTAMP.json` — in-progress MD points
3. `squad_matchday_snapshots_429_TIMESTAMP.json` — snapshot table state
4. `squads_429_current_TIMESTAMP.json` — live roster + starting_xi + captain

---

## Manual Correction Procedure

If `effective_xi` is again corrupted after a future `roundComplete`, follow `docs/ops/MD1_CORRECTION_RUNBOOK.md`. Key steps:

1. **Detect**: query `fantasy_points` for squads where `effective_xi` contains player IDs that weren't in the squad at the start of the round (compare against `squad_matchday_snapshots`)
2. **Identify correct XI**: use `squad_matchday_snapshots.starting_xi` as the authoritative starting lineup; apply best-XI scoring optimization if needed
3. **Compute correct total**: `SUM(ROUND(player_pts) for each player in correct_xi) + ROUND(captain_pts)`
4. **Write correction**:
```sql
UPDATE fantasy_points SET
  total = <correct>,
  points_breakdown = points_breakdown || jsonb_build_object(
    'effective_xi',       '<array>'::jsonb,
    'effective_captain_id', '<fp-ID>',
    'base_captain_id',    '<fp-ID>',
    'bench_players',      '<array>'::jsonb
  )
WHERE squad_id = '<id>' AND matchday_id = '<429-rN>';
```
5. **Refresh leaderboard**: `SELECT aggregate_league_member_points('<league_id>'::uuid, '<user_id>'::uuid)`
6. **Verify**: re-query `fantasy_points` and `league_members` to confirm totals and ranks

**Invariants to never break:**
- Only `fantasy_points` rows for the affected `matchday_id` are modified
- `squads` table is NEVER touched during manual correction
- The v31 guard (blocks Edge Function rescoring of settled rounds) is bypassed by the direct SQL UPDATE — this is intentional and documented

---

## BACKLOG — What's Still Missing

### P1 — High priority

| Item | Status | Notes |
|------|--------|-------|
| RecapView should use `squad_matchday_snapshots` as fallback | Not built | Currently relies solely on `points_breakdown.effective_xi`. If that field is missing or corrupted and no manual correction has been applied, Recap shows wrong data. `squad_matchday_snapshots` should be the primary source going forward — it's the most trustworthy record (written at kickoff, immutable). |
| R1 missing from `squad_matchday_snapshots` | Data gap | Migration 182 was applied after MD1 completed. No R1 snapshots exist. The manual correction runbook + `backups/` JSON files are the only R1 record. No automated recovery path. |
| R2 snapshot only covers 15:45 UTC 2026-06-19 state | Data gap | Manual backfill captures XI/bench/captain as they were at that moment — NOT at the moment R2 fixtures kicked off (which was earlier). If managers changed lineup between first kickoff and 15:45 UTC, the snapshot may not match the actual filed XI. The v30 live_xi freeze protects the actual score, but the snapshot may still differ from reality. |

### P2 — Medium priority

| Item | Status | Notes |
|------|--------|-------|
| Bench scores display in Recap (B-09) | Not built | `bench_players` in `points_breakdown` now correctly captures the bench. The display layer just needs to be built in `RecapView.jsx`. See BACKLOG item B-09. |
| Automated pre-roundComplete backup | Not built | A cron that exports `squad_matchday_snapshots` and `fantasy_points` to a storage bucket immediately before the post-match scoring cron runs would eliminate the need for manual backups. |

---

Last Updated: 2026-06-19
