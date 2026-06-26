# Multi-Sport Expansion — Technical Assessment

**A grounded assessment of the current codebase against the multi-sport vision: what already generalises, what is football-coupled, and where the load-bearing changes are.**

> Scope note: this document assesses **infrastructure** only. Game dynamics (scoring weights, prediction categories, captain rules, pick counts) are deliberately out of scope and are tuned in dedicated sessions. See the [strategy brainstorm](../product/MULTI_SPORT_EXPANSION.md) for vision and [the architecture roadmap](MULTI_SPORT_PLATFORM_ARCHITECTURE.md) for the target design.

---

## Quick Navigation

- **For the verdict** → [Headline Assessment](#headline-assessment)
- **For what's reusable** → [What Already Generalises](#what-already-generalises)
- **For what blocks us** → [Football-Coupled Surfaces](#football-coupled-surfaces)
- **For the single biggest blocker** → [The `tournaments.forza_id` Spine](#the-tournamentsforza_id-spine)

---

## Headline Assessment

The platform is a **single-sport application with one strong generalising abstraction** (`tournaments`) that was designed for *multiple football competitions*, not multiple *sports*. The distinction matters: the `tournament_id` indirection lets us add EPL / Champions League / La Liga with zero code change (as the strategy doc correctly states), but every layer below `tournaments` — fixtures, players, squads, scoring, the data-sync pipeline — assumes a football shape and a single data provider (Forza).

Three structural facts define the work ahead:

1. **There is no `sport` dimension anywhere.** Football is implicit. Adding F1/Tennis is not "more rows in `tournaments`" — it requires a sport concept that sits *above* tournaments and a way for each sport to bring its own data model and scoring.

2. **There is no social container above the league.** The friend-group ("circle"/"group") that the vision centres on does not exist as an entity. Today the league *is* the social unit, and a league is bound 1:1 to a single football competition. The cross-sport group, the unified activity feed, and the trophy cabinet all need a new container.

3. **The data pipeline is Forza-shaped end to end.** Edge Functions, cron jobs, and the `tournaments.forza_id` key all assume Forza Football. F1 (OpenF1) and Tennis (manual → TheSportsDB) need a provider-adapter seam that does not exist yet.

None of this is a rewrite. The good news (below) is substantial: the registry pattern, the per-league JSONB config, the gazette/narrative engine, the bet/prediction engine, and the shared auth/user layer are all reusable foundations. The work is **additive generalisation**, sequenced carefully because the live DB is the pilot DB (no staging, no PITR — see [Pilot Safeguards in CLAUDE.md](../../CLAUDE.md#️-pilot-safeguards--read-before-every-db-operation)).

---

## What Already Generalises

These assets carry forward to multi-sport with little or no change. They are the reason this is an extension, not a rebuild.

| Asset | Where | Why it carries forward |
|---|---|---|
| **`tournaments` registry** | `16_forza_integration.sql` | Already decouples "a competition instance" from code. The right seam to hang a `sport_id` on. `sync_enabled` "plug" pattern generalises to per-module activation. |
| **`league_config` (JSONB k/v per league)** | `16_forza_integration.sql` | Schema-less per-league configuration. Any sport's tunables (pick counts, scoring keys, deadlines) fit here with no DDL. Already RLS-guarded (migration 184). |
| **Shared `users` / auth** | `00_schema.sql` + Supabase Auth | Identity is already global and sport-agnostic. Profiles, XP, badges columns already exist (`xp`, `badges[]`). The trophy cabinet builds directly on this. |
| **Gazette / narrative engine** | `gazette_entries` (`02_draft_system.sql`), `frontpage_editions` (migration 180–181), `generate-frontpage-edition` Edge Function | The social storytelling layer. `entry_type` is an extensible enum; `bullets`/`full_data` are JSONB. This is *the* differentiator and it is already generic enough to carry every sport's results narrative. |
| **Bet / prediction engine** | `bet_instances`, `bet_submissions` (`28_bets_system.sql`), `resolve-bets` | A submit-then-resolve prediction system already exists and is conceptually 80% of the F1 prediction model (pick → lock → resolve → award). Strong reuse candidate for F1. |
| **Per-league standings + ranks** | `league_members.total_points`, `recompute_league_ranks()` (migration 69) | A working standings/rank engine. The pattern (per-member aggregate + rank trigger) is the template every sport module's standings will follow. |
| **Cron + Edge Function platform** | `supabase/functions/`, pgcron | The scheduled-sync + scheduled-scoring machinery is proven. New modules add their own functions/crons alongside; the platform is multi-tenant-ready. |
| **Single SPA shell** | `AppLayout.jsx`, route table in `App.jsx` | One React/Vite app with a route table and a shared layout shell. Adding sport-namespaced routes and a module screen registry is additive. |
| **`top_scorer_predictions`** | `00_schema.sql` | A real (non-toy) per-user, per-matchday prediction-with-resolution table. Proves the prediction-ledger pattern the F1 module needs. |

---

## Football-Coupled Surfaces

These assume football and/or Forza. Each is a place the multi-sport work must add a seam. None need deletion; all need generalising *around*.

### Data model

- **`leagues.tournament_id` is a single text FK** → `tournaments.forza_id`. A league belongs to exactly one football competition. There is no concept of a league that is "an F1 season" or "a tennis Grand Slam" except by reusing this same column with a non-football key — which works mechanically but carries no sport metadata.
- **`squads`, `fixtures`, `players`, `player_match_stats`, `fantasy_points`** are all football-shaped: positions (GK/DEF/MID/FWD), formations, captains/jokers, 11-a-side, club caps. F1 has no squad; tennis has a 5-pick model with no formation. These tables must **not** be forced onto other sports — each new sport gets its own tables (the vision's "isolated modules" principle is correct and the schema should honour it).
- **`league_members.total_points` is a single integer** in football's scoring units. It cannot be the cross-sport meta-standing. A separate, sport-neutral aggregate (trophy ledger / meta-points) is required.
- **No `sport` entity, no `circle`/`group` entity, no `trophy`/`achievement` entity.** These are the three net-new containers.

### Data pipeline (Edge Functions + crons)

Every sync/scoring function is Forza-coupled:

- `sync-fixtures`, `sync-players`, `sync-player-status`, `ingest-match-events`, `discover-tournament` → all call `https://api.forzafootball.com` with `FORZA_ACCESS_TOKEN`.
- `calculate-scores` → reads football `player_match_stats` and `scoring_rules` keyed by `tournament_id`.
- The cron fleet (`sync-wc-fixtures-30m`, `calculate-scores-live`, `flip-fixtures-live`, etc.) is football-match-timing-shaped.

There is **no provider-adapter abstraction** — Forza specifics are inline in each function. F1 (OpenF1) and Tennis (TheSportsDB / manual) need their own ingestion + scoring functions behind a common contract.

### Frontend

- **Routing is flat and single-sport.** `/squad`, `/market`, `/live`, `/recap` are all football screens with no sport namespace. `HomeScreen` assumes a football league context.
- **No sport context provider.** The app implicitly operates in "the football world." There is no `SportContext` or module registry to let a screen know which sport it is rendering.
- **`BracketScreen` (`/predictions`) is a decoy.** It looks like a prediction feature but is a localStorage-only fixture-result toy, unconnected to leagues, users, or scoring. It is **not** a reusable basis for the F1 prediction module (despite the route name) — the real reuse candidate is the `bet_instances` engine.

---

## The `tournaments.forza_id` Spine

This deserves its own section because it is the **single highest-leverage decision** in the whole expansion.

```sql
-- 16_forza_integration.sql
create table tournaments (
  id          uuid primary key default gen_random_uuid(),
  forza_id    text unique not null,   -- ← the spine
  ...
);

-- leagues.tournament_id  →  tournaments.forza_id   (text FK, not the uuid PK)
-- squads.tournament_id, players.tournament_id, fixtures.tournament_id  → same
```

The entire app keys off `forza_id` (a text provider id), **not** the uuid primary key. `leagues`, `squads`, `players`, `fixtures`, `transfers`, `scoring_rules`, and ~30 RPCs/functions join on it. Two consequences:

1. **`forza_id NOT NULL UNIQUE` is the literal blocker.** An F1 season or a tennis Grand Slam has no Forza id. Until this column is generalised, no non-football tournament can be inserted.

2. **Re-keying to the uuid PK is a large, risky refactor** (every FK and every RPC). Given the pilot-is-prod constraint, a full re-key is the wrong first move.

**Recommended path (low blast radius):** keep `forza_id` as the FK key but *re-interpret it generically* — treat it as `provider_key` (any provider's external id, or a synthetic key like `f1-2027` / `ao-2027` for manual/non-Forza sports), drop the football-implied `NOT NULL` semantics via a clean rename + add `provider` and `sport_id` columns. Football rows are untouched (their `forza_id` stays valid). This is detailed in [the architecture roadmap](MULTI_SPORT_PLATFORM_ARCHITECTURE.md#1-the-sport-abstraction). The full uuid re-key is documented there as a deferred option, not a prerequisite.

---

## Risk & Constraint Summary

| Constraint | Implication for the expansion |
|---|---|
| **Live DB = pilot DB, no PITR** (CLAUDE.md) | Every foundation migration must be **additive and backward-compatible**. Football must keep working at every step. No destructive re-keys in Phase 0. |
| **Migrations are append-only** | Generalisation happens through new numbered migrations (next is `186_`), never edits. Backfills are explicit and reversible-by-design. |
| **Design revamp in parallel** | All proposals here stop at the **data / contract / routing-architecture** level. No component or pixel decisions. A "module screen registry" seam lets the revamp swap UI freely. |
| **Forza inline in Edge Functions** | New sports must not extend Forza functions. They get their own functions behind a shared provider contract, so football's pipeline is never destabilised. |
| **Single SPA, Rolldown TDZ sensitivity** (CLAUDE.md) | New cross-cutting modules (SportContext, circle hub) must respect the import-depth rule to avoid the known production TDZ crash class. |

---

## Bottom Line

The expansion is **three new containers** (`sport`, `circle`, `trophy/achievement`), **one generalised spine** (`tournaments` → sport-aware), **one new seam** (provider adapters), and **two new isolated modules** (F1, Tennis) — all sitting on a social/narrative/identity foundation that already exists and already generalises. The football product is not refactored; it becomes the first of N sport modules under a shared roof.

The sequencing is constrained by the pilot-is-prod reality into a **foundation-first, then parallel-modules** shape. That sequencing is specified in [the implementation plan](../product/MULTI_SPORT_IMPLEMENTATION_PLAN.md).

---

## Related Documents

- [Multi-Sport Expansion — Strategy & Decisions](../product/MULTI_SPORT_EXPANSION.md) — vision, sports roadmap, open questions
- [Multi-Sport Platform Architecture](MULTI_SPORT_PLATFORM_ARCHITECTURE.md) — the target technical design
- [Multi-Sport Implementation Plan](../product/MULTI_SPORT_IMPLEMENTATION_PLAN.md) — sprint-by-sprint delivery
- [CLAUDE.md — Pilot Safeguards](../../CLAUDE.md#️-pilot-safeguards--read-before-every-db-operation) — DB operation rules

---

Last Updated: **2026-06-20**
