# Live Centre — Design & Fixture Filtering

**How the Live Centre decides which matches to show, and how the squad display works.**

Last Updated: **2026-06-06**

---

## Match Filtering Logic

The Live Centre (`LiveScreen.jsx`) shows only fixtures relevant to the user's leagues. The filtering is a three-layer cascade that runs each time the screen loads or the active league changes.

### Layer 1 — User tournaments

```
user → league_members → leagues.tournament_id
```

The screen starts by fetching all leagues the user belongs to and extracting their `tournament_id` values. This produces `userTournamentIds` — the set of competitions the user cares about.

### Layer 2 — Active matchday IDs (primary scope)

```
matchday_deadlines WHERE tournament_id IN userTournamentIds
                   AND deadline_at <= NOW()
ORDER BY deadline_at DESC (one per tournament)
```

For each of the user's tournaments, the most recent **past** deadline is resolved to a `matchday_id` (e.g. `623-r1`). These `activeMatchdayIds` are the narrowest scope — only fixtures tagged with these exact matchday IDs are shown.

**Why this matters:** A tournament can have many rounds running concurrently (qualifiers, friendlies). Without matchday scoping, switching to a new round would still show old fixtures until they disappeared from the API. The matchday ID pins the view to exactly the current round.

### Layer 3 — Fallback to tournament filter

If `activeMatchdayIds` is empty (no deadline has passed yet for any user tournament — e.g. before the first matchday lock), the query falls back to:

```
fixtures WHERE tournament_id IN userTournamentIds AND status = 'live'
```

This is broader: it shows any live fixture from the user's tournaments, regardless of matchday. This is the state that caused unrelated matches to appear **before the MD1 deadline (17:00 UTC) passed** — the deadline hadn't triggered yet, so the system showed all live fixtures in tournament 623 (which included r7 games seeded from the previous test reset).

Once the deadline passes, the system switches to Layer 2 and the view narrows to only the current round's fixtures.

### Score strip (top bar) vs. pitch view

The score strip at the top of the screen shows live scores for the active matchday. The pitch/squad view is additionally filtered to **the active league's tournament only** (using `activeTournamentId` from the selected league), so switching leagues updates both the squad on the pitch and the match strip.

---

## Squad Display Logic

The squad shown in Live Centre ("MY XI") is the **active league's squad** — the one whose `league_id` matches the currently selected league chip. There is no cross-league fallback; if the active league has no squad, the pitch is empty.

### Starter selection

From migration 107 onwards, squads have a `starting_xi TEXT[]` column that records the user's explicitly set lineup. Live Centre uses this as the authoritative source:

| Condition | Behaviour |
|-----------|-----------|
| `starting_xi` is populated | Starters = exactly those player IDs, in array order |
| `starting_xi` is empty / null | Fallback: `pickValidStarters()` — takes the first positionally legal 11 from the `players` array (1 GK + ≥1 DEF/MID/FWD) |

The fallback exists for legacy squads created before `set_lineup` was introduced, and for squads where the GK auto-init ran but the user hasn't opened the lineup editor.

### Why LiveScreen and SquadScreen could show different XIs (pre-fix)

Before migration 107 and the Live Centre fix (2026-06-06), `LiveScreen` fetched `players, captain_id, is_triple_captain` from `squads` but **did not fetch `starting_xi`**. It always used `pickValidStarters()`, which picks starters by position-order from the `players` array — not the user's actual lineup.

`SquadScreen` did fetch `starting_xi` and displayed the correct XI. This created the visible inconsistency:

- A player set as starter in SquadScreen (via `set_lineup`) but not in the first 11 of the `players` array would appear on the pitch in SquadScreen but be shown on the bench (or absent) in Live Centre.
- Bench players in SquadScreen might appear as starters in Live Centre if they happened to be earlier in the `players` array.

The fix: `LiveScreen` now fetches `starting_xi` alongside `players` and applies the same logic as SquadScreen.

---

## Bench ordering

Bench players are displayed in the order they appear in `squads.players` after position 11 (index 0–10 are typically starters). The Live Centre bench strip shows up to 4 bench players with their GW points.

---

## Related Documents

- [FANTASY_POINTS_SCORING_LAYER.md](FANTASY_POINTS_SCORING_LAYER.md) — How points are calculated and when
- [STARTING_XI_AND_BENCH.md](STARTING_XI_AND_BENCH.md) — set_lineup RPC and lineup locking
- [APP_DYNAMICS.md](APP_DYNAMICS.md) — Full matchday lifecycle
