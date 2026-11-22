# F1 Module — Test Plan

**Acceptance test specification for the Paddock F1 prediction game.**
Every scenario below states what the code does today, checked line by line on 2026-11-22. Where the code and the promise to the player differ, the scenario says so and points to the backlog row.

> **Source of truth for F1 rules:** the deployed code itself:
> [`supabase/functions/score-f1-race/index.ts`](../../supabase/functions/score-f1-race/index.ts),
> [`score-f1-race/scoring-logic.js`](../../supabase/functions/score-f1-race/scoring-logic.js) (the points table),
> [`supabase/functions/sync-f1-race-results/index.ts`](../../supabase/functions/sync-f1-race-results/index.ts) (results auto-fill),
> [`191_f1_paddocks_schema.sql`](../../supabase/migrations/191_f1_paddocks_schema.sql) (tables and RLS),
> [`192_f1_rpcs_and_seed.sql`](../../supabase/migrations/192_f1_rpcs_and_seed.sql) (Paddock RPCs, leaderboard),
> [`250_f1_seasons_rls.sql`](../../supabase/migrations/250_f1_seasons_rls.sql),
> [`251_paddock_playerbox_archive_toggle.sql`](../../supabase/migrations/251_paddock_playerbox_archive_toggle.sql),
> [`260_fix_paddock_playerbox_members_rls_recursion.sql`](../../supabase/migrations/260_fix_paddock_playerbox_members_rls_recursion.sql) (**not applied in production**, DB-260),
> [`276_schedule_sync_f1_race_results.sql`](../../supabase/migrations/276_schedule_sync_f1_race_results.sql) (the 30-minute cron),
> [`286_fix_invite_code_case_sensitivity.sql`](../../supabase/migrations/286_fix_invite_code_case_sensitivity.sql) (join by code ignores case).
> Screens: `src/screens/f1/` (PaddockLobbyScreen, F1HomeScreen, F1RacePickForm, F1SeasonBetsScreen, F1StandingsScreen, F1ReportScreen, F1AdminScreen). Driver and team names: `src/lib/f1/f1-data.js`.

---

## How the game works (one paragraph)

A player joins one or more **Paddocks** (private groups with an invite code). Before each Grand Prix the player picks P1, P2 and P3, and optionally a driver who will not finish (DNF), the team that scores most points, and an answer to the race's special question. The picks belong to the **player, not the Paddock**: one set per race (`f1_bets_race`, unique on user + season + round), shown in every Paddock the player is in. After the race an admin saves the result and presses SCORE RACE; points go into `f1_scores`, which is also per player. Each Paddock's leaderboard is the sum of its members' scores. Separately, before the season locks, each player makes 10 **season bets** (driver champion, P2, P3, constructor champion, last constructor, and five others).

---

## Test environment

| Where | How | What it can prove |
|---|---|---|
| Local full stack | `npm run test:e2e:local` (Docker; `scripts/e2e-local.mjs` loads `supabase/schema.sql` + `supabase/seed.sql`) | Everything, including RLS as a signed-in user and the Edge Functions. The only place to try writes |
| Production, read-only | `npx supabase db query --linked --read-only "…"` | Data state only. Never write to production to test |
| Browser | `npm run dev`, then `/f1` | The screens |

**Seed data** (`supabase/seed.sql`, section 8): Paddock `f1000000-0000-4000-a000-000000000001`, invite code `F1SEED01`, owner `e2e_a@fantasykit.test`; `e2e_b@fantasykit.test` is not a member. Round 1 is a week away (open for picks). Round 2 finished three days ago, no result yet, one pick by user A (Verstappen / Leclerc / Hamilton, team Red Bull). Round 3 is finished and scored. The round 3 scores (25 and 14) are hand-set for the standings screen and do **not** follow the points table; do not use them to check scoring. The season-bets row `f1_year_results` 2026 is unlocked.

---

## Real-data status (production, 2026-11-22)

| Fact | Value |
|---|---|
| Paddocks | 2 |
| Races with a result and scored | Rounds 1, 2, 3, 6 to 13 (rounds 4 and 5 have no result) |
| Races already run with **no result** | Rounds 14 to 21 (Dutch GP 23 Aug to São Paulo GP 8 Nov). Nobody has been scored for 8 races (F1-SYNC-1) |
| Picks per race | 5 in rounds 12 and 13, 3 in round 14, none after |
| Race score rows / season score rows | 56 / 6 |
| Season bets | Locked (`is_bets_locked` true), results entered, `is_final` false |
| `is_locked` set on any pick row | 0 rows (nothing ever sets it) |

The 6 season score rows were written outside the app: no code writes `score_type = 'year'`. Their breakdowns hold 100 or 200 points per correct item, while the screens promise 10 (F1-YEAR-1).

---

## Module 1 — Paddock create, join, archive

### Scenario 1.1: Create a Paddock ✅
1. Signed in, open `/f1`, CREATE tab, enter a name, submit.

**Expected:** `create_paddock(p_name)` returns the new id; the creator is in `paddock_members` with role `owner`; an 8-character invite code is shown (letters a–f and digits); the Paddock opens at `/f1/:paddockId`.

### Scenario 1.2: Join by invite code ✅
1. As user B, `/f1`, JOIN tab, enter `f1seed01` (lower case on purpose).

**Expected:** `join_paddock_by_code` compares both sides in lower case (`lower(invite_code) = lower(p_code)`, migration 286) and adds user B as a member. Codes are the first 8 characters of a UUID, so they mix letters and digits. Covered by `f1-screens.spec.js` 3.1.

### Scenario 1.3: Wrong invite code ❌
1. JOIN with `NOPE0000`.

**Expected:** the RPC raises `PADDOCK_NOT_FOUND`; the screen shows an error and stays on the lobby.

### Scenario 1.4: Archive a Paddock ✅
1. As the owner or an admin, archive the Paddock (`useCompetitionArchive`).

**Expected:** `set_competition_archived` flips it; `get_my_paddocks()` (redefined in 251) moves it to the archived list; un-archiving brings it back. A non-admin member does not see the control.

### Scenario 1.5: Member list loads for a second member ❌ until DB-260
1. With user B joined, open the Paddock as user B.

**Expected after DB-260:** the member list and leaderboard load. **Today in production:** the `paddock_members` policy refers to itself, which can fail with an infinite-recursion error; migration 260 fixes it with `is_paddock_member()` but is not applied. Local runs apply it through `PENDING_MIGRATIONS`, so a local pass does not prove production.

---

## Module 2 — Race picks and the deadline

The lock time is the race start minus 5 minutes (`race_at - 5 min`), unless an admin sets `is_manual_unlock` on that race.

### Scenario 2.1: Submit picks before the deadline ✅
1. As user A, open round 1, pick three different drivers, optionally DNF / team / special, SAVE.

**Expected:** one row in `f1_bets_race` for (user A, 2026, 1). Saving again updates the same row. Covered by `f1-screens.spec.js` 2.1.

### Scenario 2.2: Form validation ❌
1. Leave P3 empty, or pick the same driver twice.

**Expected:** the form refuses to save. P1, P2 and P3 are required and must be different.

### Scenario 2.3: The screen locks at the deadline ❌
1. Open a race whose start is under 5 minutes away (or past) with `is_manual_unlock` false.

**Expected:** the form is read-only with "Picks are locked — qualifying has started." Note the text says qualifying, but the actual lock is race start minus 5 minutes.

### Scenario 2.4: The database refuses a new pick after the deadline ❌
1. Locally, as user B (no pick yet for round 2), insert a pick for round 2 through the REST API with user B's token.

**Expected:** refused by `f1_bets_race_own_insert` (race start minus 5 minutes has passed, no manual unlock).

### Scenario 2.5: The database refuses a changed pick after the deadline ❌ **fails today** (F1-LOCK-1)
1. Locally, as user A, update the existing round 2 pick (change P1) through the REST API.

**Expected:** refused. **Today:** accepted. `f1_bets_race_own_update` checks only `auth.uid() = user_id AND NOT is_locked`, and nothing ever sets `is_locked`, so a player who knows the API can change a pick after the race. The screens hide this; the database does not stop it. 16 production rows were edited after their race started; rounds 2 to 9 were back-filled when the module launched on 2026-06-22, so they are not evidence of cheating.

### Scenario 2.6: Manual unlock ✅
1. As admin, set `is_manual_unlock` on round 2. As user B, submit a pick.

**Expected:** both the screen and the insert policy allow it.

---

## Module 3 — Race scoring

Points table (`SCORING` in `scoring-logic.js`):

| Item | Points |
|---|---|
| P1 exact / P2 exact / P3 exact | 10 / 8 / 6 |
| A podium pick in the wrong podium place | 3 |
| DNF driver did not finish | 5 |
| Team with most points | 5 |
| Special question (trimmed, case ignored) | 5 |
| Every pick made was right (bonus) | 3 |

The bonus needs every pick that was **made** to be right and a total above 0. Leaving DNF, team or special empty does not cost the bonus. A DNF pick when the race had no DNFs, or a team pick when no team result was saved, scores 0 **and** loses the bonus. Unit tests: `tests/unit/f1-scoring-logic.test.js` (14 tests).

### Scenario 3.1: Exact podium only (the seed case) ✅
Result: Verstappen / Leclerc / Hamilton, team Red Bull. User A picked exactly that plus Red Bull.

**Expected:** 10 + 8 + 6 + 5 + 3 bonus = **32**. Covered by `f1-screens.spec.js` 4.1.

### Scenario 3.2: The maximum ✅
Everything right including DNF and special.

**Expected:** 10 + 8 + 6 + 5 + 5 + 5 + 3 = **42**.

### Scenario 3.3: Podium in the wrong order ✅
Result Norris / Piastri / Leclerc. Pick Piastri / Norris / Leclerc.

**Expected:** 3 + 3 + 6 = **12**, no bonus.

### Scenario 3.4: One driver off the podium ✅
Result Norris / Piastri / Leclerc. Pick Norris / Piastri / Russell.

**Expected:** 10 + 8 + 0 = **18**, no bonus.

### Scenario 3.5: DNF picked, nobody retired ❌
Exact podium, DNF pick Sainz, `result_dnf_drivers` empty.

**Expected:** 24 + 0, bonus lost = **24** (not 27).

### Scenario 3.6: Special answer with different case and spaces ✅
Result special `Safety Car`, pick ` safety car `.

**Expected:** +5.

### Scenario 3.7: Scoring before a result is saved ❌
1. SCORE RACE on a race with no P1.

**Expected:** the function answers 400 "Race has no result — save result first"; nothing is written.

### Scenario 3.8: Score twice ✅
1. Score round 2, change the result, score again.

**Expected:** `f1_scores` is upserted on (user, season, round, type), so the second run replaces the first; no duplicate rows. The admin screen shows "✓ Already scored" after the first run but the function itself accepts a re-run.

### Scenario 3.9: Who may score ❌
1. As user B (a member, not an admin), invoke `score-f1-race` with the Paddock id.

**Expected:** refused. Only the service role or an admin of that Paddock (`is_competition_admin('paddock', id)`) may score. Note: scoring a race scores **every** player's pick for it, in every Paddock, because picks and scores are per player.

---

## Module 4 — Results auto-fill from OpenF1

`sync-f1-race-results` runs every 30 minutes. It looks at races that started more than 2 hours and less than 14 days ago with no P1 (a one-off call can pass `{"days": N}` to look further back). It finds the OpenF1 race session by date, takes each driver's final position, maps the top 3 to the pick-list spelling, fills P1 to P3, and sets the status to `finished`. It never scores; DNF, team and special stay manual (SAVE RESULT, then SCORE RACE in `/f1/:id/admin`). Each race comes back as `NO_SESSION_YET`, `RESULT_INCOMPLETE`, `NAME_UNMATCHED`, `FILLED`, `OPENF1_LIVE_LOCK` or `ERROR`. The matching rules live in `openf1-logic.js` and are covered by `tests/unit/f1-openf1-logic.test.js`.

### Scenario 4.1: A finished race fills in ⏳ deployed 2026-11-22, waiting for a real race to confirm (F1-SYNC-1)
1. After a race, wait for the next run (or call it with the service role).

**Expected:** status `FILLED`, P1 to P3 set with the same spelling as `f1-data.js`. **Before the fix:** every run returned `ERROR: OpenF1 404` for `/sessions?year=2026&session_name=Race&round_number=21` (seen in `net._http_response` on 2026-11-22), because OpenF1 sessions have no round number. Rounds 14 to 21 never filled. The fix finds the session by date instead (the Race session whose start is closest to `race_at`, within 36 hours). Check with the next finished race, or with a one-off `{"days": 120}` call for rounds 14 to 21.

### Scenario 4.2: Driver names match the pick list ⏳ deployed 2026-11-22, waiting for a real race to confirm (F1-SYNC-1)
OpenF1's `full_name` is written with the surname in capitals (for example `Max VERSTAPPEN`), and first names differ (`Andrea Kimi`, `Alexander`), while picks use `Max Verstappen`, `Kimi Antonelli`, `Alex Albon`. Scoring compares strings exactly. The fix matches OpenF1's `last_name` (accents ignored) against the pick list and leaves the race untouched with `NAME_UNMATCHED` when a top-3 driver is not on the list, so a wrong name is never saved. Rounds 1 to 13 in production use the pick-list spelling, so they were entered by hand.

### Scenario 4.3: Race in progress ⏳ deployed 2026-11-22, waiting for a real race to confirm
**Expected:** during a live session OpenF1 answers 401 to callers without a key (seen 2026-11-22, Las Vegas weekend). The function returns `OPENF1_LIVE_LOCK`, fills nothing, and tries again on the next run.

### Scenario 4.4: A driver who fell back from third ⏳ deployed 2026-11-22, waiting for a real race to confirm
**Expected:** the podium uses each driver's last recorded position. The old code asked OpenF1 only for rows with position 3 or better, so a driver who ran third and later dropped back could keep a stale third place.

### Scenario 4.5: Nothing to do ✅
**Expected:** with no candidate races the function makes one database query and no OpenF1 call.

---

## Module 5 — Race win trophies

After scoring, `score-f1-race` gives a gold `event_win` trophy ("Race Win") to the top scorer **within each Paddock**, using that Paddock's members only. Best-effort: a trophy failure never stops scoring.

### Scenario 5.1: Clear winner ✅
**Expected:** one `trophy_ledger` row per Paddock for its top scorer. Covered by `f1-screens.spec.js` 4.1 (user A alone in the seed Paddock).

### Scenario 5.2: Tie at the top ❌
Two members of the same Paddock score 18 each.

**Expected:** no trophy for that Paddock.

### Scenario 5.3: Everyone scores 0 ❌
**Expected:** no trophy.

### Scenario 5.4: Player in two Paddocks ✅
**Expected:** the player can win the race in one Paddock and not in the other, because each Paddock is ranked on its own members.

---

## Module 6 — Season bets

Ten picks per player in `f1_bets_year`: driver champion, driver P2, driver P3, constructor champion, last constructor, the race with fewest finishers, the driver with most DNFs, the first driver replaced, most poles, most podiums without a win.

### Scenario 6.1: Submit and change before the lock ✅
**Expected:** one row per player per season; saving again updates it.

### Scenario 6.2: Locked screen ❌
1. Admin locks season bets (`f1_year_results.is_bets_locked` true).

**Expected:** the screen shows the locked banner and no SAVE button. In the report, other players' season picks become visible once locked.

### Scenario 6.3: The database refuses a change after the lock ❌ **fails today** (F1-LOCK-1)
1. Locally, lock season bets, then update your own row through the REST API.

**Expected:** refused. **Today:** accepted. The policies check the row's own `is_locked`, not `f1_year_results.is_bets_locked`.

### Scenario 6.4: Season bets are scored ❌ **not built** (F1-YEAR-1)
1. Admin enters season results and marks them final.

**Expected:** each correct pick gives the points the screen promises ("10 pts per correct prediction", "✓ +10" in the report). **Today:** no code writes season scores. The 6 rows in production were inserted by hand with 100 or 200 points per item, so the season total on the standings screen does not match what players were told.

---

## Module 7 — Leaderboard and standings

`get_paddock_leaderboard(p_paddock_id)` sums `f1_scores` for the Paddock's members: total, race points, season points, races scored, and `RANK()`.

### Scenario 7.1: Only members count ✅
**Expected:** a player not in the Paddock never appears, even though their scores are in the same table.

### Scenario 7.2: Ties share a rank ✅
Two members on 25.

**Expected:** both rank 1, the next player rank 3 (`RANK()`, not `DENSE_RANK()`).

### Scenario 7.3: Numbers match the race scores ✅
**Expected:** for each member, total = sum of their `race` rows + their `year` row. Check with a read-only query against the screen.

### Scenario 7.4: Next season ❌ **fails from 2027** (F1-SEASON-1)
The leaderboard RPC filters `s.season = 2026`, and every F1 screen hard-codes 2026 (24 places). From 2027 the game will keep showing 2026.

---

## Module 8 — UI end to end (desktop 1440 and phone 375)

| Step | Route | Check |
|---|---|---|
| 8.1 | `/f1` | Lobby lists my Paddocks; CREATE and JOIN tabs work |
| 8.2 | `/f1/:id` | Calendar, countdown to the next race, my pick status per race |
| 8.3 | `/f1/:id` race pick | Form opens, drivers and teams from `f1-data.js`, lock state right |
| 8.4 | `/f1/:id/season` | Ten season picks, locked banner when locked |
| 8.5 | `/f1/:id/standings` | Total / Race pts / Season pts, ranks |
| 8.6 | `/f1/:id/report` | Race bets and Year bets tabs, other players' picks visible only after the lock |
| 8.7 | `/f1/:id/admin` | Admins only; SAVE RESULT, SCORE RACE, season results, lock and unlock |
| 8.8 | `/f1/:id/picks/3` | Redirects to the Paddock home |

At 375 px: no sideways scroll, the pick form fits, sheets close with the back gesture. Smoke for all 7 routes: `f1-screens.spec.js` suite 1; demo-mode render: `e2e/platform.spec.js`.

---

## Automated coverage today

| What | Where |
|---|---|
| Points table, 14 cases | `tests/unit/f1-scoring-logic.test.js` |
| OpenF1 matching (race by date, surname to pick name, final top 3), 13 cases | `tests/unit/f1-openf1-logic.test.js` |
| 7 routes load, pick submit, join by code, save result + score + trophy | `e2e/f1-screens.spec.js` (local stack, CI job `e2e-tier3`) |
| Screens render in demo mode | `e2e/platform.spec.js` |

Not automated: scenarios 1.3 to 1.5, 2.2 to 2.6, 3.7 to 3.9, all of module 4, 5.2 to 5.4, all of module 6, 7.2 to 7.4.

---

## Known issues (2026-11-22)

| Backlog | Issue | Fix needs |
|---|---|---|
| F1-SYNC-1 | Results auto-fill has never worked (OpenF1 404); rounds 14 to 21 have no results or scores | Fixed in code (session by date, surname mapping, 401 handling); deployed 2026-11-22, waiting for the first real race to confirm |
| F1-LOCK-1 | The database does not stop a changed race pick after the deadline, or a changed season bet after the lock | Migration (approval) |
| F1-YEAR-1 | Season bets are never scored by the app; production rows use 100/200 points per item against a promised 10 | Owner decides the points value, then code and a deploy (approval) |
| DB-260 | `paddock_members` policy recursion; fix in migration 260 not applied | Migration (approval) |
| F1-SEASON-1 | Season 2026 hard-coded in the leaderboard RPC and 24 places in the screens | Migration (approval) and screen changes |

---

## Test run log

| Date | Who | Where | Result |
|---|---|---|---|
| 2026-11-22 | Claude | Code read + production read-only | Plan written. Found F1-SYNC-1 and F1-YEAR-1; confirmed F1-LOCK-1 from the policies |

---

## Related

- [README.md](README.md) — index of test docs and test files
- [TESTING_STRATEGY.md](TESTING_STRATEGY.md) — test tiers and CI jobs
- [TENNIS_MODULE_TEST_PLAN.md](TENNIS_MODULE_TEST_PLAN.md) — the matching plan for tennis
- [../architecture/COMPETITION_MODEL.md](../architecture/COMPETITION_MODEL.md) — how Paddocks fit the competition model
- [../../BACKLOG.md](../../BACKLOG.md) — F1-SYNC-1, F1-LOCK-1, F1-YEAR-1, F1-SEASON-1, DB-260

Last Updated: 2026-11-22
