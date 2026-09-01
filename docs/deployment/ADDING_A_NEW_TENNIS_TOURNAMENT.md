# How to Add a New Tennis Tournament

**Unlike football's [ADDING_A_NEW_TOURNAMENT.md](ADDING_A_NEW_TOURNAMENT.md), this is NOT a "mostly configuration" cookbook yet.** The full 2026 ATP calendar (14 events) is already pre-seeded in `tennis_tournaments` (migration 197) — you are almost never inserting a new row. What you *are* doing, every time, is manually walking one pre-seeded row through its lifecycle, because **[`TennisAdminScreen`](../../src/screens/TennisAdminScreen.jsx) is not usable by any real logged-in user today** (see [Known Limitations](#known-limitations) below). Every step in this doc is the direct-SQL/curl workaround for what should eventually be a few button clicks.

Read [Known Limitations](#known-limitations) once before your first tournament — it explains *why* every step below is manual, and flags one silent-failure mode (non-power-of-two draws) you need to check before you rely on automated scoring.

---

## Architecture in one paragraph

Tennis data comes from `tennis-api-atp-wta-itf.p.rapidapi.com` (secret: `RAPIDAPI_TENNIS_KEY`, budget: **50 requests/day**), a completely separate provider from football's Forza feed. `sync-tennis-results` — deployed and cron-scheduled 3×/day as of 2026-09-01 (PR #900) — is **tournament-agnostic**: it queries `tennis_tournaments WHERE status IN ('in_progress','qf_captain_open') AND tournament_type IN ('grand_slam','masters_1000')` with no hardcoded ID, so once a tournament reaches `in_progress` with the right `external_id`/`draw_size`, results sync automatically — no new migration or cron job needed per tournament (a real improvement over football's pre-#897 hardcoded-cron pattern). Getting a tournament *to* `in_progress` correctly is the part that's still all manual, below.

---

## Reference: tennis_tournaments status lifecycle

```
upcoming → roster_open → in_progress → qf_captain_open → completed
```

All 4 forward transitions are admin RPCs (migration 200), `SECURITY DEFINER`, `GRANT`ed to `service_role` only. Run them with `npx supabase db query --linked` (executes as DB owner, bypasses the `service_role`-only grant) — this is the standard workaround used throughout this doc:

```bash
npx supabase db query --linked "SELECT admin_open_tournament('<tournament_id>', '2026-09-10T00:00:00Z', 21349);"
```

| RPC | Transition | Signature |
|---|---|---|
| `admin_open_tournament` | `upcoming → roster_open` | `(p_tournament_id uuid, p_roster_lock_at timestamptz, p_external_id int DEFAULT NULL)` |
| `admin_start_tournament` | `roster_open → in_progress` | `(p_tournament_id uuid)` |
| `admin_open_qf_window` | `in_progress → qf_captain_open` | `(p_tournament_id uuid, p_opens_at timestamptz, p_closes_at timestamptz)` |
| `admin_complete_tournament` | `qf_captain_open/in_progress → completed` | `(p_tournament_id uuid)` — also called automatically by the scoring Edge Function |
| `admin_seed_tournament_players` | (no status change) | `(p_tournament_id uuid, p_players jsonb)` — batch upsert, idempotent on `(tournament_id, player_name)` |
| `admin_enter_round_results` | (no status change) | `(p_tournament_id uuid, p_eliminations jsonb)` — manual fallback, see [Step 5b](#step-5b--manual-results-entry-non-power-of-two-draws-or-if-the-cron-misses-a-day) |
| `admin_set_champion` | (no status change) | `(p_tournament_id uuid, p_player_id uuid, p_rounds_won int)` |

---

## Step 1 — Find the tournament's `external_id`

Every pre-seeded row starts with `external_id = NULL`. RapidAPI's tennis provider indexes each *edition* of a tournament by a numeric "season ID" that has no fixed relationship to the tournament's name — you have to look it up.

Use the diagnostic function already deployed for exactly this (`lookup-tennis-tournament` — thin authenticated passthrough to arbitrary RapidAPI paths):

```bash
curl -X POST https://sssmvihxtqtohisghjet.supabase.co/functions/v1/lookup-tennis-tournament \
  -H "Authorization: Bearer <ADMIN_TRIGGER_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"path": "atp/tournaments/search?name=French+Open"}'
```

(Path shape depends on what the provider's search/list endpoints actually expose — treat this as a starting point and adjust `path` based on the raw response; there's no fixed lookup contract documented yet.) Confirmed real IDs so far: Wimbledon 2026 `21337`, US Open 2026 `21349`.

> **Ask the user or check the Supabase dashboard secrets page for `ADMIN_TRIGGER_KEY`'s value — never print it or commit it.**

---

## Step 2 — Open the tournament (`upcoming → roster_open`)

```bash
npx supabase db query --linked "SELECT id, name, status, draw_size, tournament_type FROM tennis_tournaments WHERE name = 'French Open';"
```

```bash
npx supabase db query --linked "SELECT admin_open_tournament('<tournament_id>', '<roster_lock_timestamptz>', <external_id>);"
```

`p_roster_lock_at` is when user roster submissions close — typically the tournament's first-round start time. This also stamps `external_id` onto the row (or pass `NULL` here and set it separately with an `UPDATE` if you found it after opening).

---

## Step 3 — Sync the draw / player field

```bash
curl -X POST https://sssmvihxtqtohisghjet.supabase.co/functions/v1/sync-tennis-players \
  -H "Authorization: Bearer <ADMIN_TRIGGER_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"tournament_id": "<tournament_id>"}'
```

This is **admin-triggered only, never cron** — it costs 1 RapidAPI call and should be run once per tournament (re-running is safe/idempotent, but burns budget). It infers tier from seed (T1 = seeds 1–4, T2 = 5–16, T3 = 17–32, T4 = unseeded "Dark Horses") and upserts via `admin_seed_tournament_players`.

**Known gap:** the draw endpoint has been observed incomplete (US Open 2026: only 82/128 players came back from this call — the other 46 were only recoverable later, from the *results* feed once matches started). `sync-tennis-results` auto-seeds any player it finds in results but not in the roster, as tier 4 — so a low initial count here isn't necessarily wrong, but don't be alarmed by it.

Verify:
```sql
SELECT tier, COUNT(*) FROM tennis_tournament_players WHERE tournament_id = '<tournament_id>' GROUP BY tier ORDER BY tier;
```

**Check for stale placeholder rows first** if this tournament reused test data — `tennis_ttp_external_id_idx` is a *partial* unique index (`WHERE external_player_id IS NOT NULL`), so `NULL`-keyed dev/test rows from earlier sessions won't get deduped against real synced players:
```sql
SELECT id, player_name FROM tennis_tournament_players
WHERE tournament_id = '<tournament_id>' AND external_player_id IS NULL;
```

---

## Step 4 — ⚠️ Check `draw_size` is a power of two before going further

This is the **single most important check in this document** and it is not enforced anywhere in the UI or the seed data. `sync-tennis-results` assumes a bye-less single-elimination bracket (`draw_size` an exact power of 2: 128, 64, 32…) to derive `round_reached` from win/loss counts. If `draw_size` is **not** a power of two, the function **silently skips that tournament every single run** (`NON_POWER_OF_TWO_DRAW` warning, logged but not surfaced anywhere a human will see it) — meaning results never sync, with no error visible short of reading Edge Function logs.

**As seeded (migration 197), 4 of the 12 non-ATP-Finals tournaments already have this problem:**

| Tournament | `draw_size` | Power of two? |
|---|---|---|
| Indian Wells | 96 | ❌ |
| Miami Open | 96 | ❌ |
| Italian Open | 96 | ❌ |
| Shanghai | 96 | ❌ |
| *(all 8 others — Australian Open, Monte-Carlo, Madrid, French Open, Wimbledon, Canadian Open, Cincinnati, US Open)* | 128 or 64 | ✅ |

These 4 events genuinely use a 96-player Masters 1000 draw with byes for top seeds in real life — `draw_size = 96` may be *factually correct* and the seed data isn't wrong, it's the sync function's bye-less assumption that doesn't cover this format. **Confirm the real bracket size close to each event** (byes are sometimes adjusted tournament-to-tournament) and if it's still non-power-of-two when the tournament goes live, plan on [Step 5b](#step-5b--manual-results-entry-non-power-of-two-draws-or-if-the-cron-misses-a-day) (manual `admin_enter_round_results`) for that entire tournament rather than expecting the cron to carry it.

---

## Step 5 — Start the tournament (`roster_open → in_progress`)

```bash
npx supabase db query --linked "SELECT admin_start_tournament('<tournament_id>');"
```

Locks all submitted rosters. From this point, if `draw_size` is a power of two, the existing 3×/day cron picks this tournament up automatically — no further action needed until QF time (Step 6).

### Step 5b — Manual results entry (non-power-of-two draws, or if the cron misses a day)

```bash
npx supabase db query --linked "SELECT admin_enter_round_results('<tournament_id>', '[
  {\"player_id\": \"<uuid>\", \"round_reached\": \"r64\", \"rounds_won\": 1}
]'::jsonb);"
```

Valid `round_reached` values (matches the `tennis_tournament_players` CHECK constraint): `r128, r64, r32, r16, qf, sf, runner_up, champion`. This only marks losers — the champion is set separately via `admin_set_champion` once the final is decided.

---

## Step 6 — Open the QF captain window (`in_progress → qf_captain_open`)

Once all 4 quarter-final losers are recorded (`round_reached = 'qf'`, whether by the cron or Step 5b), open the 48h captain-selection window:

```bash
npx supabase db query --linked "SELECT admin_open_qf_window('<tournament_id>', '<opens_at>', '<closes_at>');"
```

`sync-tennis-results` still runs for tournaments in this status too (it's included in its `IN ('in_progress','qf_captain_open')` filter), so SF/final results keep syncing automatically through this window.

---

## Step 7 — Champion + completion

```bash
npx supabase db query --linked "SELECT admin_set_champion('<tournament_id>', '<champion_player_id>', <rounds_won>);"
```

Then either let `score-tennis-tournament` (triggered separately, computes fantasy points and calls `admin_complete_tournament` itself when done) run, or call completion directly if you're not scoring through that path:

```bash
npx supabase db query --linked "SELECT admin_complete_tournament('<tournament_id>');"
```

---

## ATP Finals — different format, different RPCs

`ATP Finals` (`tournament_type = 'atp_finals'`) is round-robin + knockout, not single-elimination — it's explicitly excluded from `sync-tennis-results`'s query (`tournament_type IN ('grand_slam','masters_1000')` only). It uses its own admin RPCs and is **entirely manual, always**:

```bash
# Seed the 15-match prediction slate (before the tournament starts)
npx supabase db query --linked "SELECT admin_seed_atp_finals_matches(2026, '[
  {\"match_number\": 1, \"match_type\": \"round_robin\", \"player_a_id\": \"<uuid>\", \"player_b_id\": \"<uuid>\"}
]'::jsonb);"

# Enter each result as it happens
npx supabase db query --linked "SELECT admin_enter_atp_finals_result(2026, 1, '<winner_player_id>');"
```

See `score-atp-finals` for how these feed scoring — not covered further here since this doc is about tournament *onboarding*, not the scoring layer.

---

## Summary checklist

```
[ ] Step 1 — external_id found via lookup-tennis-tournament (or already known)
[ ] Step 2 — admin_open_tournament called (status → roster_open, external_id set)
[ ] Step 3 — sync-tennis-players run once → verify tier breakdown; check for stale NULL-external_id rows
[ ] Step 4 — draw_size confirmed accurate AND checked against the power-of-two requirement
[ ]         (if non-power-of-two) plan to use Step 5b manual entry for this entire tournament
[ ] Step 5 — admin_start_tournament called (status → in_progress)
[ ] Results syncing — confirm via: SELECT eliminated, round_reached, COUNT(*) FROM tennis_tournament_players
                                    WHERE tournament_id = '<id>' GROUP BY 1,2;
[ ] Step 6 — admin_open_qf_window called once all 4 QF losers are recorded
[ ] Step 7 — admin_set_champion + admin_complete_tournament (or via score-tennis-tournament)
```

---

## Known Limitations

**🔴 `TennisAdminScreen` is unusable by any real logged-in user.** All 9 admin RPCs (migration 200) are `REVOKE`d from `authenticated`/`anon` and `GRANT`ed only to `service_role`, with no admin-role check anywhere in between. Every button on the actual admin screen fails with a Postgres permission-denied error, for any account, no matter how privileged — which is *why* this entire document is `db query --linked` calls instead of a UI walkthrough. This has been true since the screen was built and is tracked as an open item (not a one-line fix — it's a product/security decision about who counts as "admin").

**The fix pattern already exists elsewhere in this codebase**, just not applied here yet: `requireServiceRoleOrAdmin()` (`supabase/functions/_shared/auth.ts`) is a dual-mode guard used by `score-f1-race` / `score-tennis-tournament` / `score-atp-finals` that accepts either the service-role/admin-key path (cron, curl) *or* a real user JWT whose identity passes a `checkAdmin` callback (mirrors `run-draft-lottery`'s DD-C4 fix, PR #270). Migration 200's admin RPCs would need either (a) Edge Function wrappers using this same guard, or (b) an equivalent `is_admin`-style check added inside each `SECURITY DEFINER` function before the grant is opened past `service_role`.

**🟡 Non-power-of-two draws silently skip automated scoring** — see [Step 4](#step-4--️-check-draw_size-is-a-power-of-two-before-going-further). Currently affects Indian Wells, Miami, Italian Open, and Shanghai as seeded.

**🟡 `external_id` lookup is fully manual and undocumented beyond this doc** — there's no registration form, just the `lookup-tennis-tournament` diagnostic function (itself labeled "TEMPORARY / DIAGNOSTIC — delete after use" in its own source) and trial-and-error against RapidAPI's endpoints.

**🟡 RapidAPI budget is 50 requests/day, shared across every tournament and every admin action.** Steady-state cron usage is small (~3–6/day with 1–2 active tournaments), but `sync-tennis-players` and `lookup-tennis-tournament` both draw from the same budget — avoid re-running them speculatively.

**🟡 No durable season-rollover story yet.** The 2026 calendar is pre-seeded once (migration 197); there is no equivalent of football's `forza_id`-reuse problem since each tennis tournament row is already a distinct one-off, but there is also no established pattern yet for what happens when 2027's calendar needs seeding — likely a straightforward new `INSERT` batch modeled on migration 197, but not yet exercised in practice.

---

Last Updated: **2026-09-01** — initial version, written after the `sync-tennis-results` cron-credential fix (PR #900) prompted a review of what's actually automated vs. manual in the tennis pipeline. See [tennis-wimbledon-dry-run](../../BACKLOG.md) session history and `docs/testing/TENNIS_MODULE_TEST_PLAN.md`'s "Known Issues" section for the underlying bug reports this doc consolidates.
