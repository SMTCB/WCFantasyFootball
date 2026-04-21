# ForzaKit — Supabase RLS Policy Reference
**Applied:** 2026-04-21 via migration `enable_rls_all_tables`
**Status:** Active on all 16 public tables

---

## Policy Design Principles

1. **Public data** (players, fixtures, match events, player status, deadlines) → `SELECT` for everyone — anon and authenticated.
2. **User-owned data** (squads, jokers, recaps, predictions) → only the owning user can read/write, matched on `auth.uid() = user_id`.
3. **Demo mode bypass** — while `VITE_AUTH_ENABLED=false`, the app has no real Supabase session so requests arrive as the `anon` role. User-owned tables include an extra policy clause: `auth.role() = 'anon' AND user_id = '00000000-0000-0000-0000-000000000000'`. This lets the demo user work without auth. **Remove these clauses when auth is permanently activated.**
4. **Scoring engine writes** (fantasy_points, matchday_recaps, projection_snapshots, h2h_records) → written via the Supabase `service_role` key (bypasses RLS). No client INSERT policies needed.
5. **error_logs** → INSERT for everyone (crash reporting), no SELECT (read via Supabase dashboard only).

---

## Table-by-Table Policy Summary

### Public Read — No Auth Required

| Table | SELECT | INSERT | UPDATE | DELETE |
|-------|--------|--------|--------|--------|
| `players` | ✅ Everyone | ❌ | ❌ | ❌ |
| `fixtures` | ✅ Everyone | ❌ | ❌ | ❌ |
| `match_events` | ✅ Everyone | ❌ | ❌ | ❌ |
| `player_status` | ✅ Everyone | ❌ | ❌ | ❌ |
| `matchday_deadlines` | ✅ Everyone | ❌ | ❌ | ❌ |
| `fantasy_points` | ✅ Everyone | ❌ (service role) | ❌ | ❌ |
| `league_members` | ✅ Everyone | ✅ Self only | ❌ | ✅ Self only |

### User-Owned — Auth Required (+ demo bypass)

| Table | SELECT | INSERT | UPDATE | DELETE |
|-------|--------|--------|--------|--------|
| `squads` | ✅ Owner + demo | ✅ Owner + demo | ✅ Owner + demo | ✅ Owner + demo |
| `daily_jokers` | ✅ Owner + demo | ✅ Owner + demo | ❌ | ✅ Owner + demo |
| `matchday_recaps` | ✅ Owner + demo | ❌ (service role) | ❌ | ❌ |
| `top_scorer_predictions` | ✅ Owner + demo | ✅ Owner + demo | ❌ | ❌ |
| `projection_snapshots` | ✅ Owner + demo | ❌ (service role) | ❌ | ❌ |
| `h2h_records` | ✅ Both participants | ❌ (service role) | ❌ | ❌ |

### Special

| Table | SELECT | INSERT | UPDATE | DELETE |
|-------|--------|--------|--------|--------|
| `users` | ✅ Everyone (standings) | ✅ Self only | ✅ Self only | ❌ |
| `leagues` | ✅ Everyone | ✅ Creator only | ✅ Creator only | ✅ Creator only |
| `error_logs` | ❌ (dashboard only) | ✅ Everyone | ❌ | ❌ |

---

## Demo Mode Bypass Clauses

The following tables have an extra policy clause for demo mode:
`squads`, `daily_jokers`, `matchday_recaps`, `top_scorer_predictions`, `projection_snapshots`, `h2h_records`

**Clause pattern:**
```sql
OR (auth.role() = 'anon' AND user_id = '00000000-0000-0000-0000-000000000000'::uuid)
```

**When to remove:** Once `VITE_AUTH_ENABLED=true` is set in Vercel and all users are authenticated, run a migration to drop these anon clauses. At that point, unauthenticated requests will correctly receive 0 rows on user-owned tables.

---

## Pre-Launch Security Checklist

- [x] RLS enabled on all 16 tables (2026-04-21)
- [x] User-owned tables blocked from cross-user reads
- [x] Public tables readable without auth (supports Realtime subscriptions)
- [x] Service role reserved for scoring engine writes
- [x] error_logs insert-only (no client reads)
- [ ] Demo bypass clauses removed (do when auth activated)
- [ ] Penetration test: attempt cross-user squad read with a second real account
- [ ] Confirm Realtime works correctly with RLS (enable Realtime publication per-table in Supabase dashboard)
- [ ] Supabase Advisors scan reviewed (no critical findings)

---

## Activating Realtime with RLS

After enabling RLS, Supabase Realtime requires explicit publication of tables.
Run in the Supabase SQL editor when setting up FB-011:

```sql
-- Add tables to the realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE fantasy_points;
ALTER PUBLICATION supabase_realtime ADD TABLE match_events;
ALTER PUBLICATION supabase_realtime ADD TABLE fixtures;
```
