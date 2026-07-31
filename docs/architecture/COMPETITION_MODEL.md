# The Competition Model — League / Paddock / Player Box

**One concept, three sport-flavored names. Read this before assuming any sport-specific competition container is "different" from a League — it almost certainly isn't.**

---

## Context / Overview

This doc exists because of a recurring mistake: assuming Formula 1 and Tennis are "global" competitions with no league-equivalent, when in fact **every sport has one**. A session in 2026-07 nearly shipped `trophy_ledger` changes on that wrong assumption before the confusion was caught. This doc is the fix — read it first, before reasoning about circles, leaderboards, or trophies for any sport other than football.

---

## The core fact

**League (⚽), Paddock (🏁), and Player Box (🎾) are the same concept, named per sport.** Each is:

- A real, standalone competition container — not a metaphor, not a UI grouping.
- Scoped to one **Clubhouse** via its own `circle_id` column (`leagues.circle_id`, `paddocks.circle_id`, `player_boxes.circle_id`).
- Owned by a commissioner (`created_by`), with its own invite-code join flow.
- Backed by its own membership table (`league_members`, `paddock_members`, `player_box_members`) that determines who appears on that container's leaderboard.

None of the three is "global" or "platform-wide." A user who is in one Paddock does not automatically see or compete with users in a different Paddock, exactly like leagues.

| Concept | Sport | Table | Membership table | Season/event anchor |
|---|---|---|---|---|
| **League** | Football ⚽ | `leagues` | `league_members` | `tournaments` (e.g. "FIFA World Cup 2026") |
| **Paddock** | F1 🏁 | `paddocks` | `paddock_members` | `f1_seasons` (migration 248) |
| **Player Box** | Tennis 🎾 | `player_boxes` | `player_box_members` | many `tennis_tournaments` rows sharing a `season_year` — **no season-level table exists for tennis** (see [Gotcha 4](#4-tennis-has-no-season-level-table)) |

UI taxonomy (from [CLUBHOUSE_CENTRIC_REDESIGN.md](../platform_revision/architecture/CLUBHOUSE_CENTRIC_REDESIGN.md#taxonomy)):

| Concept | Use in UI | Notes |
|---|---|---|
| The room | **Clubhouse** | One per friend group, sport-agnostic. `circle`/`circle_id` in DB/code. |
| A contest within it | **Competition** (umbrella term) | Use on all shared/Tier-1/Tier-2 surfaces. |
| Sport-flavored names | League · Paddock · Player Box | Only where sport divergence is expected (Tier 3). |

---

## Why the "global" confusion happens

Football, F1, and tennis scoring tables are **globally keyed by design** — one row per user per race/tournament/matchday, not one row per league. There is no `paddock_id` column on `f1_scores`, no `player_box_id` column on `tennis_tournament_scores`. A per-competition leaderboard is computed as a **membership-filtered read at query time**, joining the global scores against that specific container's membership table.

This is *exactly* what leagues already do — `league_members` scopes who's "in" a league, and standings are computed by filtering `fantasy_points`/matchday scores down to those members. F1 and tennis follow the identical pattern; they just don't have a UI screen that makes it as obvious as `LeagueScreen.jsx` does.

**The existing membership-filtered-leaderboard functions** (the pattern to copy for any new per-sport aggregate):

- `get_paddock_leaderboard(p_paddock_id)` — migration 192. No internal `auth.uid()` check → **safe to call from a service-role/cron/edge-function context.**
- `get_player_box_leaderboard(p_player_box_id, p_season_year)` — migration 201. **Unconditionally raises `NOT_A_MEMBER`** if `auth.uid()` isn't a member — since `auth.uid()` is always `NULL` under service-role auth, **this RPC can never be called from a cron/edge-function context.** Any server-side tennis aggregation must reimplement the logic inline (see `award-season-trophies/index.ts` for a worked example — it reimplements the Masters Drop Rule directly rather than calling this RPC).
- `get_h2h_standings(p_league_id)` — migration 138. Safe under service-role: its auth check is `IF v_caller IS NOT NULL AND NOT EXISTS(...)`, so a null `auth.uid()` short-circuits past it.

**Before writing any new cron/edge-function code that needs a sport's standings, check whether the RPC you're about to call has an `auth.uid()` gate that assumes an authenticated user session — it may silently be uncallable from a service-role context.**

---

## `trophy_ledger` — the cross-sport meta-layer

`trophy_ledger` (migration 189, `award_trophy()` helper added migration 246) is the **one genuinely shared, sport-neutral table** — it's what powers the cross-sport Trophy Cabinet and `get_circle_meta_standings()`. Everything else (scoring, standings, membership) stays inside each sport's own tables; `trophy_ledger` is the seam where a sport module "reports up" an achievement.

As originally built (migration 189), `trophy_ledger.tournament_id`/`league_id` were **hard FKs to `tournaments`/`leagues`** — football-only tables. This silently made it impossible to award an F1 or tennis trophy at all (the insert would fail with a FK violation), which is what surfaced the "wait, do Paddocks even have a season?" confusion in the first place.

**Migration 248 fixed this**: both columns are still `uuid`, but are no longer FK-enforced. They're interpreted per `sport_id` instead:

| `sport_id` | `trophy_ledger.tournament_id` means | `trophy_ledger.league_id` means |
|---|---|---|
| Football | `tournaments.id` | `leagues.id` |
| F1 | `f1_seasons.id` | `paddocks.id` |
| Tennis | `tennis_tournaments.id` | `player_boxes.id` |

This is safe because **nothing reads these two raw columns directly.** `TrophyCabinetScreen.jsx` only selects `(id, tier, awarded_at, meta)` and renders entirely off the denormalized `meta` jsonb (`label`, `reason`, `league_name`, `sport_type` — all populated by `award_trophy()` at insert time). `get_circle_meta_standings()` only groups by `(circle_id, user_id)`. If you're about to add a new consumer that reads `trophy_ledger.tournament_id`/`league_id` directly expecting it to always mean "a `tournaments` row," stop — it doesn't, per-sport.

**Trophy types in use**: `round_win` (football H2H matchday, non-fatal hook in `calculate-scores`), `event_win` (per-race/per-tournament winner, hooked in `score-f1-race` and `score-tennis-tournament`), `season_win` (swept by `award-season-trophies`, migration 249's cron). All three award **per competition container** (per league/paddock/player box), never a single platform-wide winner — ties and non-participants are skipped, matching the existing "draws don't award" precedent.

---

## Non-obvious gotchas (read before writing sport-crossing code)

### 1. `leagues.tournament_id` is `text`, not a `tournaments.id` join

`leagues.tournament_id` stores `tournaments.forza_id` (e.g. `"429"`), **not** `tournaments.id` (uuid). Any football season-boundary or champion-lookup code must join `leagues.tournament_id = tournaments.forza_id` — joining against `tournaments.id` directly silently matches zero rows.

### 2. `paddocks` has `sport_id`; `player_boxes` does not

`paddocks` carries its own `sport_id` column (redundant but present). `player_boxes` doesn't — tennis is identified structurally, not by an FK on the table.

### 3. F1 previously had no season-level identity at all

Before migration 248's `f1_seasons` table, F1 had no uuid row representing "the 2026 season" the way `tournaments` does for football. `f1_year_results` only keyed off a plain `season integer`. If you need to anchor anything season-scoped for F1 (a trophy, a cross-season summary), use `f1_seasons`, not a raw integer.

### 4. Tennis has no season-level table

Unlike football (`tournaments`) and F1 (`f1_seasons`), tennis has no single row representing "the 2026 season." A tennis season is **many `tennis_tournaments` rows sharing a `season_year`**. Season-boundary detection has to check that *every* tournament for that `season_year` has reached `status = 'completed'` — there's no single `ends_at` to watch. When something needs a season-level anchor id anyway (e.g. `trophy_ledger.tournament_id` for a `season_win` row), the established convention (see `award-season-trophies/index.ts`) is to use that season's **last-completed tournament by `end_date`** as a stand-in — justified only because `tournament_id` is already documented as opaque/sport-scoped (see above), not because it's semantically "one tournament."

### 5. `get_player_box_leaderboard` can't be called under service-role

Covered above, repeated because it's the gotcha most likely to cause a silent runtime failure: any cron/edge-function tennis aggregation must reimplement the Masters Drop Rule (drop the worst non-`atp_finals` score once ≥5 standard tournaments are `completed` for that `season_year`) inline against `tennis_tournament_scores` — it cannot call the RPC.

---

## Related Documents

- [MULTI_SPORT_PLATFORM_ARCHITECTURE.md](../platform_revision/architecture/MULTI_SPORT_PLATFORM_ARCHITECTURE.md) — the original target design for the circle layer, sport module contract, and trophy ledger (§2, §3, §4). This doc (COMPETITION_MODEL.md) is the concrete, current-schema companion — read that one for the *why* of the architecture, this one for the *what exists today and how not to misread it*.
- [CLUBHOUSE_CENTRIC_REDESIGN.md](../platform_revision/architecture/CLUBHOUSE_CENTRIC_REDESIGN.md) — the Clubhouse/Competition UI taxonomy this doc's naming table is drawn from.
- `supabase/migrations/248_trophy_ledger_multisport.sql` — the migration that made `trophy_ledger` sport-polymorphic; its header comment is the original source for most of this doc.
- `supabase/functions/award-season-trophies/index.ts` — worked example of correctly reading all three competition types' season boundaries and champions, including the tennis/`get_player_box_leaderboard` workaround.

---

Last Updated: **2026-07-31**
