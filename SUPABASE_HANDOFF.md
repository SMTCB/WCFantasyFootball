# Supabase Handoff — Sprint 0 Edge Function Deployments

**Date**: 2026-05-24  
**Branch merged**: `claude/sprint-0-release-blockers` → `main`  
**SQL migrations already applied** (user ran these in Supabase dashboard): `66_security_hardening.sql`, `67_scoring_rules_seed.sql`, `68_cron_and_ingest_fixes.sql`

---

## Edge Functions to Deploy

Run these commands from the main PC (must have Supabase CLI + project linked):

```bash
# From the project root, after git pull origin main:
supabase functions deploy run-draft-lottery
supabase functions deploy run-reverse-standings-draft
supabase functions deploy eliminate-cup-club
supabase functions deploy process-transfer
supabase functions deploy sync-players
```

### What Changed in Each Function

| Function | Change | Why |
|----------|--------|-----|
| `run-draft-lottery` | Added `relaxation_state` upsert after each draft round | Keeps pool pressure current so transfer enforcement works |
| `run-reverse-standings-draft` | Same — upserts `relaxation_state` on round completion | Same reason |
| `eliminate-cup-club` | Added safe squad query (only real columns: `captain_id`, `joker_player_id`, `is_wildcard`, `is_triple_captain`) | Previous version referenced non-existent `formation` column |
| `process-transfer` | Fixed no-repeat check: now reads `relaxation_state.current_repeats_allowed` and enforces tier | Previously blocked all transfers if any squad held the player |
| `sync-players` | Fixed cron — ingest now fires per-fixture after match completion | Was incorrectly scheduled |

---

## Verify Deployment

After deploying, confirm functions are live:

```bash
supabase functions list
```

Expected: all 5 functions show a recent `deployed_at` timestamp (today's date).

---

## No Additional SQL Needed

Migrations 66–68 are already applied. Nothing else to run in Supabase.

---

## What's NOT Done Yet (Sprint 1)

These are deferred to the next sprint — do NOT act on these now:

- **FRONT-2**: Channel leak in `useLeague.js` (Supabase Realtime subscription not cleaned up on unmount)
- **FRONT-3**: Channel leak in `useChatMessages.js`
- **FRONT-4**: Channel leak in `useLiveScores.js`
- **L3.3**: Missing DB trigger to maintain `league_members.rank` after each scoring run
- **L1.x**: Scoring math issues (captain multiplier, GK scoring edge cases)
- **DATA-4/5**: Fixture sync gaps (cancelled/postponed matches not handled)
- **L2.1/L2.4**: Transfer window enforcement edge cases

See `SPRINT_PLAN_2026-05-24.md` for full Sprint 1 detail.
