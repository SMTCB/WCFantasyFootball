# Multi-Sport Platform Architecture

**The target technical design for turning a single-sport football app into a multi-sport social platform — the infrastructure layer only.**

> Scope note: this is the **infrastructure** design. It specifies the containers, contracts, seams, and data model that let any sport plug in. It deliberately does **not** specify game dynamics (scoring weights, prediction categories, pick counts, captain rules) — those are tuned per sport in dedicated sessions. It also stops at the data/contract/routing level: a parallel **design revamp** owns all component and visual decisions, so this document only defines the seams the UI must hang on.
>
> Read [the technical assessment](MULTI_SPORT_TECHNICAL_ASSESSMENT.md) first for the current-state grounding this builds on.

---

## Quick Navigation

- **The five building blocks** → [Target Architecture Overview](#target-architecture-overview)
- **The schema spine change** → [1. The Sport Abstraction](#1-the-sport-abstraction)
- **The friend-group container** → [2. The Circle Layer](#2-the-circle-layer)
- **How sports plug in uniformly** → [3. The Sport Module Contract](#3-the-sport-module-contract)
- **The trophy ledger (model-agnostic)** → [4. The Meta-League Engine](#4-the-meta-league-engine)
- **Forza / OpenF1 / manual seam** → [5. The Data Provider Adapter](#5-the-data-provider-adapter)
- **Frontend shape (revamp-tolerant)** → [6. Frontend Architecture](#6-frontend-architecture)

---

## Design Principles

Carried from the [strategy brainstorm](../product/MULTI_SPORT_EXPANSION.md), translated into engineering constraints:

1. **Sport modules are isolated.** Each sport owns its tables, Edge Functions, and scoring. No forced schema unification. The shared layer reads *from* modules through a thin contract; it never reaches into a module's internals.
2. **The shared layer is thin and sport-neutral.** Identity, the circle/group container, the activity feed, and the trophy cabinet know nothing about positions, drivers, or surfaces. They speak only the module contract's vocabulary (members, standings, results, trophies).
3. **Additive, football-safe, reversible.** Every foundation change is a new migration that leaves football untouched. The football module is simply re-cast as "module #1" with zero behaviour change.
4. **Defer the formula, build the ledger.** The meta-league *scoring model* is an open product decision. The *infrastructure* (a trophy/achievement ledger every sport writes to) is buildable now; the aggregation formula is a swappable function on top.
5. **Revamp-tolerant.** The frontend exposes a module screen registry and a sport context. The design revamp can replace every pixel without touching the data contracts.

---

## Target Architecture Overview

Five building blocks, layered. Foundation at the bottom; sports plug in at the top.

```
┌──────────────────────────────────────────────────────────────┐
│  SPORT MODULES (isolated — own tables, functions, scoring)    │
│   ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐      │
│   │ Football │  │   F1     │  │  Tennis  │  │  Golf…   │      │
│   │ (Forza)  │  │ (OpenF1) │  │ (manual) │  │  (Y2)    │      │
│   └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘      │
│        │  each implements the SPORT MODULE CONTRACT (§3)      │
└────────┼─────────────┼─────────────┼─────────────┼───────────┘
         │             │             │             │
┌────────▼─────────────▼─────────────▼─────────────▼───────────┐
│  SHARED PLATFORM LAYER (thin, sport-neutral)                  │
│   • Sport registry & generalised tournaments        (§1)      │
│   • Circle / Group container + circle-wide feed     (§2)      │
│   • Meta-League engine: trophy ledger + agg view    (§4)      │
│   • Data provider adapters (Forza/OpenF1/manual)    (§5)      │
│   • Identity (users/auth), gazette engine  [EXISTS, reused]   │
└──────────────────────────────────────────────────────────────┘
```

Each block is specified below: the data model, the contract, and the football-safety note.

---

## 1. The Sport Abstraction

**Goal:** introduce a `sport` dimension above `tournaments`, and generalise the `tournaments.forza_id` spine so non-football competitions can exist — without re-keying the football schema.

### New table: `sports`

```sql
create table sports (
  id           uuid primary key default gen_random_uuid(),
  slug         text unique not null,          -- 'football' | 'f1' | 'tennis' | 'golf'
  name         text not null,                 -- 'Football'
  game_model   text not null,                 -- 'squad' | 'prediction' | 'pick_n'  (taxonomy, not rules)
  data_provider text,                         -- 'forza' | 'openf1' | 'thesportsdb' | 'manual'
  active       boolean not null default false,-- per-module master switch (like sync_enabled, but per sport)
  created_at   timestamptz default now()
);
```

`game_model` is a **coarse taxonomy** (how a sport is played at the structural level), not the rules. It tells the frontend which screen family to render and the meta-league which "win condition" vocabulary applies. The actual scoring lives in each module + `league_config`.

### Generalise `tournaments`

```sql
alter table tournaments
  add column sport_id  uuid references sports(id),
  add column provider  text;                  -- 'forza' | 'openf1' | 'thesportsdb' | 'manual'

-- Backfill: every existing tournament is football/Forza.
update tournaments set sport_id = (select id from sports where slug='football'),
                       provider = 'forza';
```

**On `forza_id`:** keep the column and the FK chain exactly as-is (football rows unchanged). Re-interpret it semantically as a **generic provider key**: F1/tennis tournaments are inserted with a synthetic key (`f1-2027`, `ao-2027`) in `forza_id`. The `NOT NULL UNIQUE` constraint is satisfied by these synthetic keys, so **no constraint change and no FK churn is required**. (A future cosmetic rename `forza_id → provider_key` is optional and non-urgent; the full re-key to the uuid PK is explicitly *deferred* — it is months of risk for no user-facing benefit, mirroring the Next.js decision in the strategy doc.)

### Why this is the right seam

- `leagues.tournament_id`, `squads.tournament_id`, etc. all keep working — they still point at `tournaments.forza_id`, now just a generic key.
- A league discovers its sport via `tournaments.sport_id` → `sports`. One join, no data migration of leagues.
- The football product sees **zero behaviour change**: same key, same rows, new metadata columns it can ignore.

### Football-safety

Pure additions + one backfill `UPDATE` that only fills new columns. No football read path changes. ✅

---

## 2. The Circle Layer

**Goal:** create the social container that spans sports — the "group of friends" that the vision calls the actual product. This is net-new; today the league is the only social unit.

This addresses [open question #2](../product/MULTI_SPORT_EXPANSION.md#open-questions) (the group/circle concept) at the **infrastructure** level. It makes the container explicit rather than emergent, which keeps every downstream feature (feed, trophies, invites) simple.

### New tables

```sql
create table circles (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_by  uuid references users(id),
  invite_code text unique not null,           -- same model as leagues.join_code
  created_at  timestamptz default now()
);

create table circle_members (
  circle_id  uuid references circles(id) on delete cascade,
  user_id    uuid references users(id) on delete cascade,
  role       text not null default 'member',  -- 'owner' | 'member'
  joined_at  timestamptz default now(),
  primary key (circle_id, user_id)
);

-- A circle holds N leagues/competitions across sports.
-- Each existing per-sport league optionally belongs to one circle.
create table circle_leagues (
  circle_id  uuid references circles(id) on delete cascade,
  league_id  uuid references leagues(id) on delete cascade,
  primary key (circle_id, league_id)
);
```

### Relationship to existing leagues

A `league` stays the **per-sport competition** unit (a football EPL league, an F1 season league, a tennis event league). The `circle` is the **friend-group umbrella** that links those leagues so the same group of people compete across sports under one identity and one feed.

- A circle has many leagues (one per sport, or several per sport).
- A league belongs to at most one circle (nullable association via `circle_leagues`; standalone leagues without a circle remain valid → **football today keeps working with no circle**).
- Membership: joining a circle can fan out to its leagues (invite-to-the-whole-experience), or a user can join individual leagues directly. Both flows are supported; the circle invite is the new "front door."

### Circle-wide activity feed

The gazette is currently league-scoped (`gazette_entries.league_id`). Elevate it to circle scope **by aggregation, not by moving data**:

```sql
-- A read-side view/RPC: union of gazette_entries across all leagues in a circle.
create or replace function get_circle_feed(p_circle_id uuid, p_limit int default 50)
returns setof gazette_entries language sql stable as $$
  select g.* from gazette_entries g
  join circle_leagues cl on cl.league_id = g.league_id
  where cl.circle_id = p_circle_id
  order by g.published_at desc
  limit p_limit;
$$;
```

No change to how modules write gazette entries — they keep writing per-league. The circle feed is a pure read aggregation. (A future optimisation can add an optional `circle_id` denormalised onto `gazette_entries` if feed reads get hot; not needed initially.)

### Football-safety

All new tables. Existing leagues function identically whether or not they are attached to a circle. The gazette write path is unchanged. ✅

---

## 3. The Sport Module Contract

**Goal:** define the thin interface every sport implements, so the shared layer can read standings, results, and wins uniformly without knowing the sport's internals. This is what makes "isolated modules" actually composable.

A sport module is: *its own tables + its own Edge Functions + its own scoring* that satisfy a small read/emit contract.

### The contract (four obligations)

| # | Obligation | Shape | Consumed by |
|---|---|---|---|
| **C1** | **Standings reader** | `get_module_standings(league_id) → [{user_id, points, rank}]` | League standings UI, circle leaderboard |
| **C2** | **Round/event lifecycle** | A module-owned notion of "rounds/events" with a `status` (upcoming/active/complete) readable per league | Hub status chips, scheduling |
| **C3** | **Results event emitter** | On round/event completion, write a `gazette_entries` row (narrative) **and** a `trophy_ledger` row when a win condition is met | Activity feed, meta-league |
| **C4** | **Module config** | All tunables live in `league_config` JSONB keys namespaced by sport (`f1.*`, `tennis.*`) | Commissioner admin, scoring |

The contract is intentionally **read-and-emit**, not "implement this base class." Each module is free to model its domain however it wants (F1 predictions, tennis picks, football squads) as long as it can answer C1–C2 and emit C3 using the shared keys (`league_id`, `user_id`).

### Standings convention

Football already follows the template: a per-member aggregate (`league_members.total_points`) plus a rank recompute (migration 69). Each new module provides an equivalent `get_module_standings(league_id)` RPC over its own tables. The shared leaderboard component calls the contract function for whichever sport the league belongs to (resolved via `tournaments.sport_id`).

> **Game-dynamics boundary:** *how* points are computed inside a module (the weights, the prediction accuracy rules, the round-advancement values) is out of scope here and set in the per-sport dynamics sessions. The contract only fixes the *shape* of what comes out.

### Football re-cast (zero behaviour change)

Football becomes "module #1" by simply **documenting** that its existing pieces already satisfy the contract:
- C1 = `aggregate_league_member_points` + `league_members.total_points`
- C2 = matchdays / `matchday_deadlines` + fixture statuses
- C3 = `calculate-scores` already writes `gazette_entries` on `roundComplete` (just add a `trophy_ledger` write — see §4)
- C4 = `league_config` (already in use)

No football code is rewritten to "fit" the contract; the contract is *defined to describe what football already does*, then F1/Tennis are built to match.

---

## 4. The Meta-League Engine

**Goal:** build the infrastructure for the cross-sport standing **without committing to a scoring model** ([open question #1](../product/MULTI_SPORT_EXPANSION.md#the-overarching-meta-league-open--decision-deferred) — Trophy Cabinet vs Olympic Points vs Season Championships vs Hybrid is a deferred product decision).

The key insight: **build the ledger now, defer the formula.** All four candidate models are aggregations over the same primitive — "who won what, when." So we persist that primitive and make the aggregation swappable.

### New table: `trophy_ledger`

```sql
create table trophy_ledger (
  id            uuid primary key default gen_random_uuid(),
  circle_id     uuid references circles(id) on delete cascade,
  league_id     uuid references leagues(id) on delete cascade,
  user_id       uuid references users(id) on delete cascade,
  sport_id      uuid references sports(id),
  tournament_id text,                          -- generic provider key (matches tournaments.forza_id)
  trophy_type   text not null,                 -- 'round_win' | 'event_win' | 'season_win'
  tier          text,                          -- 'bronze' | 'silver' | 'gold'  (for the hybrid model; nullable)
  awarded_at    timestamptz default now(),
  meta          jsonb default '{}'             -- {matchday_id, event_name, points, ...} for narrative
);
```

Each sport module emits a `trophy_ledger` row when a win condition fires (C3 above): football → a round/GW win; F1 → a race win; tennis → an event win. The `tier` column pre-positions the hybrid bronze/silver/gold model without forcing it.

### The meta-standing is a swappable view

```sql
-- v1 stub: trophy count (the leading "Trophy Cabinet" candidate).
-- Swap the body later for Olympic-points or gold-first without schema change.
create or replace function get_circle_meta_standings(p_circle_id uuid)
returns table(user_id uuid, score numeric, rank int) language sql stable as $$
  with tally as (
    select user_id, count(*)::numeric as score
    from trophy_ledger where circle_id = p_circle_id
    group by user_id
  )
  select user_id, score,
         rank() over (order by score desc)::int
  from tally;
$$;
```

When the product decision lands, only this function's body changes (count → weighted points → gold-first ordering). The ledger, the emit path, and every UI binding stay put.

### Trophy cabinet (profile)

The profile/trophy-cabinet screen reads `trophy_ledger` filtered by `user_id` (across circles or per circle). The `users` table already has `badges[]` and `xp` for lighter achievements; `trophy_ledger` is the structured, sport-attributed record. No schema beyond the ledger is needed for the cabinet.

### Football-safety

New table + new functions only. Football starts emitting `trophy_ledger` rows via a *small addition* to `calculate-scores` (one insert on round-win), which does not alter existing scoring or gazette behaviour. ✅

---

## 5. The Data Provider Adapter

**Goal:** a seam so each sport ingests from its own data source (Forza / OpenF1 / TheSportsDB / manual) behind a common shape — without touching football's proven Forza pipeline.

### Pattern

Introduce `supabase/functions/_shared/providers/` with one adapter per source, each exposing a small common surface the module's sync function calls:

```
_shared/providers/
  forza.ts        ← extracted from existing sync-* functions (football)
  openf1.ts       ← F1: sessions, results, classifications
  thesportsdb.ts  ← Tennis Phase 2 (deferred)
  manual.ts       ← Tennis Phase 1: reads commissioner-entered results from a staging table
```

Common adapter surface (illustrative, infra-level — not the data contents):

```ts
interface SportDataAdapter {
  listEvents(tournamentKey: string): Promise<ProviderEvent[]>;     // rounds/races/tournaments
  getResults(eventKey: string): Promise<ProviderResult[]>;          // outcomes to score against
  health(): Promise<{ ok: boolean; detail?: string }>;
}
```

### Football is extracted, not rewritten

The Forza specifics currently inline in `sync-fixtures` / `sync-players` / `ingest-match-events` are *moved* into `providers/forza.ts` behind the adapter surface. Football's functions call the adapter instead of inline `fetch`. This is a refactor with no behaviour change — and it is **optional for Phase 0** (football can stay as-is; only new modules strictly need the adapter). Recommend doing it lazily: build `openf1.ts` and `manual.ts` to the interface first; retrofit `forza.ts` only when convenient.

### Manual entry (Tennis Phase 1)

The vision's manual result-entry strategy (commissioner enters who advanced each day) is modelled as a **staging table** the `manual` adapter reads:

```sql
create table manual_results (
  id            uuid primary key default gen_random_uuid(),
  tournament_id text,                          -- generic provider key
  event_key     text,                          -- e.g. 'ao-2027-day3'
  entered_by    uuid references users(id),
  payload       jsonb not null,                -- module-defined: {player, round_reached, eliminated}
  entered_at    timestamptz default now()
);
```

Manual entry doubles as a gazette moment (the commissioner "announcing" results) — exactly as the strategy doc intends.

### Football-safety

Adapter is new code. Football's pipeline is only touched if/when we choose to retrofit `forza.ts`, and that retrofit is behaviour-preserving and independently testable. ✅

---

## 6. Frontend Architecture

**Goal:** make the SPA sport-aware and module-extensible, while leaving all visual/component decisions to the parallel design revamp.

This section stops at **routing + context + registration seams**. It intentionally does not specify screens, layouts, or components — those are owned by the revamp and the per-sport design sessions. (New screens being explored with Claude Design are tracked separately; this only defines the wiring they slot into.)

### Three seams

1. **`SportContext`** — a provider that resolves the active sport from the active league/circle (via `tournaments.sport_id`) and exposes it to screens. Screens ask "which sport am I?" instead of assuming football.

2. **Module screen registry** — each sport module registers its route subtree and its screens through a small manifest, rather than hard-coding routes in `App.jsx`:

   ```js
   // illustrative shape — revamp owns the actual components
   const footballModule = {
     sport: 'football',
     routes: [
       { path: 'squad',  screen: SquadScreen },
       { path: 'market', screen: MarketScreen },
       { path: 'live',   screen: LiveScreen },
       // …
     ],
   };
   // App composes routes from registered modules: /:sport/:leagueId/<route>
   ```

   This lets the revamp add/replace/reorder screens per sport without central edits, and lets F1/Tennis ship their screen sets independently.

3. **Shared shell stays shared** — `AppLayout`, the circle hub, the activity feed, the trophy cabinet, auth, and settings are sport-neutral and live above the module registry. The revamp restyles the shell once; all modules inherit it.

### Routing shape (indicative)

```
/                         → Circle hub (multi-sport home)        [shared shell]
/circle/:id               → Circle detail: cross-sport feed + meta-standings
/profile/:userId          → Trophy cabinet                       [shared shell]
/:sport/:leagueId/...     → module-registered screens (football today; f1/tennis later)
```

> **Rolldown TDZ caution** (CLAUDE.md): `SportContext` and the registry are cross-cutting and will be imported at multiple depths. Follow the import-depth rule — provide values via context/props, don't import a shared module both directly in a large screen and transitively through its children. This is the known production crash class.

### Football-safety

Football's existing routes are wrapped in the registry as "module #1" with the same screens. URL-compat shims (`/squad` → `/football/:leagueId/squad`) preserve existing links during transition. ✅

---

## Consolidated Data Model Changes

Everything new, in one place. All additive; football reads unaffected.

| Object | Type | Block | Purpose |
|---|---|---|---|
| `sports` | new table | §1 | Sport registry + per-module master switch |
| `tournaments.sport_id`, `.provider` | new columns | §1 | Tag each competition with its sport + data source |
| `circles` | new table | §2 | Friend-group container |
| `circle_members` | new table | §2 | Circle membership + roles |
| `circle_leagues` | new table | §2 | Link leagues (any sport) to a circle |
| `get_circle_feed()` | new RPC | §2 | Circle-wide activity aggregation |
| `get_module_standings()` (per module) | new RPC convention | §3 | Uniform standings reader |
| `trophy_ledger` | new table | §4 | Sport-attributed win ledger (meta-league primitive) |
| `get_circle_meta_standings()` | new RPC (swappable) | §4 | Cross-sport standing; formula deferred |
| `manual_results` | new table | §5 | Commissioner result entry (Tennis Phase 1) |
| `_shared/providers/*` | new functions | §5 | Data-source adapters |
| `f1_*`, `tennis_*` | new module tables | modules | Per-sport isolated schemas (shapes set in dynamics sessions) |

**Not changed in Phase 0:** `leagues`, `squads`, `players`, `fixtures`, `fantasy_points`, `league_members`, `gazette_entries`, all football RPCs and Edge Functions. They are *read from* by new code, not modified.

---

## Open Architecture Questions (for dynamics/product sessions)

These are deliberately left for later — flagged so they are not lost:

1. **Meta-league formula** — the body of `get_circle_meta_standings()`. Deferred product decision (open question #1).
2. **Circle ↔ league fan-out on invite** — does joining a circle auto-join its leagues, or is each league opt-in? (UX decision; both are supported by the schema.)
3. **F1 private-league granularity** — one F1 league per circle, or can an F1 league span circles? (open question #4; schema via `circle_leagues` supports either.)
4. **Per-sport screen sets** — owned by the design revamp + per-sport dynamics sessions; the registry seam is sport-agnostic.

---

## Related Documents

- [Multi-Sport Technical Assessment](MULTI_SPORT_TECHNICAL_ASSESSMENT.md) — current-state grounding
- [Multi-Sport Expansion — Strategy & Decisions](../product/MULTI_SPORT_EXPANSION.md) — vision and open questions
- [Multi-Sport Implementation Plan](../product/MULTI_SPORT_IMPLEMENTATION_PLAN.md) — sprint sequencing
- [H2H Competition Design](H2H_COMPETITION_DESIGN.md) — example of an isolated competition layer added cleanly

---

Last Updated: **2026-06-20**
