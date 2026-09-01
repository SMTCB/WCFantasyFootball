# How to Add a New F1 Season

Unlike tennis (see [ADDING_A_NEW_TENNIS_TOURNAMENT.md](ADDING_A_NEW_TENNIS_TOURNAMENT.md)), F1 is genuinely close to the "mostly configuration" ideal — there is no external per-event onboarding flow, no draw/roster to sync, and no daily API-budget constraint. The entire season is one `INSERT` batch of up to 24 `f1_races` rows, seeded once, before the first race weekend. From then on, results fill themselves in automatically (see [Architecture](#architecture-in-one-paragraph)) and the only recurring admin action is entering the 3 fields OpenF1 can't give you.

---

## Architecture in one paragraph

F1 data comes from `api.openf1.org` — a **free, unauthenticated public API**, unlike football/tennis's paid RapidAPI-style providers. There is no daily request budget to protect, so unlike tennis's `sync-tennis-results` (throttled to 3×/day), `sync-f1-race-results` — deployed and cron-scheduled every 30 minutes as of 2026-09-01 (this doc's PR) — simply polls: any `f1_races` row whose `race_at` is more than 2 hours in the past and still has `result_p1 IS NULL` gets checked against OpenF1, and P1/P2/P3 are filled in automatically the moment a session result is available. No per-race admin click, no per-race migration or cron entry — it's tournament-agnostic the same way `sync-tennis-results` is tournament-agnostic, just against a query with no daily-budget ceiling.

**What still can't be automated, ever:** OpenF1 doesn't expose DNF classification, doesn't know which team you'd credit with "most points," and has no concept of this app's ad-hoc `special_category_question` per race. Those 3 fields — plus final scoring — are always a manual step on [`F1AdminScreen`](../../src/screens/f1/F1AdminScreen.jsx), after the podium has auto-filled.

---

## Step 1 — Seed the season's races

There is no admin UI for this — it's a direct `INSERT`, same as tennis's pre-seeded calendar (migration 197). Model it on the existing 2026 season (migration 191/192): one row per round, `season`, `round_number` (1–24), `gp_name`, `circuit`, `race_date`, `race_at` (the race's scheduled start, in UTC — this is the timestamp `sync-f1-race-results` waits 2 hours past before checking OpenF1), and optionally `special_category_question`/`special_category_type`/`special_category_options` if that round has a bonus prediction.

```sql
INSERT INTO f1_races (season, round_number, gp_name, circuit, race_date, is_saturday, qualifying_at, race_at)
VALUES
  (2027, 1, 'Australian Grand Prix', 'Albert Park', '2027-03-14', false, '2027-03-13T05:00:00Z', '2027-03-14T04:00:00Z');
  -- ... one row per round
```

`UNIQUE(season, round_number)` on the table means a re-run is safe to retry per-row but will reject an exact duplicate — check what's already there first:

```bash
npx supabase db query --linked "SELECT round_number, gp_name, race_at FROM f1_races WHERE season = 2027 ORDER BY round_number;"
```

That's the entire onboarding step. No `external_id` lookup, no draw sync, no RapidAPI budget math — OpenF1 indexes sessions by `year` + `round_number` + `session_name`, both of which you already set above.

---

## Step 2 — Let results fill automatically

Once a race's `race_at` has passed by 2+ hours, `sync-f1-race-results` (running every 30 minutes) will:

1. Query OpenF1 for that `(season, round_number)`'s `Race` session.
2. If found, pull the top-3 finishing positions and driver names.
3. Write `result_p1`/`result_p2`/`result_p3` and flip `status` to `'finished'`.

Nothing to trigger — check progress any time with:

```bash
npx supabase db query --linked "SELECT round_number, gp_name, status, result_p1, result_p2, result_p3 FROM f1_races WHERE season = 2027 ORDER BY round_number;"
```

### Step 2b — Manual fallback (cron miss, delayed/rescheduled race, or OpenF1 gap)

The P1/P2/P3 dropdowns on `F1AdminScreen` are always manual-entry-capable — if OpenF1 has no session yet (delayed race) or the cron simply hasn't ticked yet, just open the admin screen, select the race, and pick the drivers directly. `sync-f1-race-results` will not overwrite a `result_p1` that's already set (its query filters `WHERE result_p1 IS NULL`), so a manual entry is never clobbered by a late cron run.

---

## Step 3 — Fill the manual-only fields and score

On [`F1AdminScreen`](../../src/screens/f1/F1AdminScreen.jsx), for the race in question:

1. **DNF drivers** — not exposed by OpenF1's position endpoint in a form this app consumes; select manually.
2. **Team — most points** — computed nowhere upstream; select manually.
3. **Special category answer** — if `special_category_question` was set in Step 1, enter the answer.
4. Click **SAVE RESULT** (safe even though P1/P2/P3 are already filled — it just re-writes the same values plus the 3 manual fields).
5. Click **SCORE RACE →**, which invokes `score-f1-race` and computes fantasy points for every bet on that round.

Scoring is deliberately **not** part of the automated pipeline — `is_scored` should only flip once an admin has confirmed all 4 fields (including the fields OpenF1 can never supply) are correct.

---

## Season bets

`f1_bets_year` / `f1_year_results` (Driver Champion, Constructor Champion, etc.) are entered and locked entirely through `F1AdminScreen`'s "SEASON BETS" tab at season end — this has no OpenF1 equivalent (no single endpoint gives you "most podiums with no win" or "first driver replaced") and stays fully manual, same as tennis's ATP Finals.

---

## Summary checklist

```
[ ] Step 1 — season's f1_races rows inserted (season, round_number, gp_name, circuit, race_at, ...)
[ ] Step 2 — results auto-fill via sync-f1-race-results (30 min after race_at + 2h buffer)
[ ]         (if cron misses / OpenF1 gap) Step 2b — fill P1/P2/P3 manually on F1AdminScreen
[ ] Step 3 — DNF / team-most-points / special-category answer entered manually, SAVE RESULT
[ ] Step 3 — SCORE RACE clicked once all 4 fields are confirmed correct
[ ] Season end — season bets entered + locked via the SEASON BETS tab
```

---

## Known Limitations

**🟡 2-hour buffer is a fixed assumption.** A race delayed by red flags/weather beyond 2 hours after its scheduled `race_at` will simply be picked up on a later 30-minute tick once OpenF1 actually has the session — no admin action needed, but don't expect an instant fill exactly at the 2-hour mark for a disrupted race.

**🟡 14-day retry window.** `sync-f1-race-results` only considers races within the last 14 days (`race_at > now() - 14 days`) to avoid retrying a permanently-unfillable historical race forever. A race older than that with no result needs Step 2b (manual entry) — this should never come up in normal operation since races are ~2 weeks apart and get filled well within the window.

**🟡 No admin-role check gap here** — unlike `TennisAdminScreen` (see that doc's Known Limitations), `F1AdminScreen`'s admin RPCs already go through `is_competition_admin` and `requireServiceRoleOrAdmin` correctly; this doc's automation doesn't change that.

---

Last Updated: **2026-09-01** — initial version, written alongside `sync-f1-race-results` (this PR), which replaced `F1AdminScreen`'s manual "⚡ FETCH FROM OPENF1" button with a 30-minute cron.
