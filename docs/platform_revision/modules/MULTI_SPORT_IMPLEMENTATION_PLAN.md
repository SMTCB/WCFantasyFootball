# Multi-Sport Expansion — Implementation Plan

**The sprint-by-sprint delivery plan for the multi-sport infrastructure layer. A pickup-ready roadmap: what gets built, in what order, and why.**

> Scope note: this plan delivers **infrastructure** — the containers, contracts, and seams. Game dynamics (scoring weights, prediction categories, pick counts, captain rules) are explicitly carved out of every sprint and handled in dedicated dynamics sessions. Where a sprint touches a module, it builds the *plumbing* and stubs the *rules*.
>
> Built on [the platform architecture](../architecture/MULTI_SPORT_PLATFORM_ARCHITECTURE.md) and [the technical assessment](../architecture/MULTI_SPORT_TECHNICAL_ASSESSMENT.md).

---

## Delivery Shape: Foundation-First, Then Parallel Modules

**Not pure waterfall, not pure agile — a constrained hybrid, and the constraint is deliberate.**

The foundation (sport abstraction, circle layer, module contract, trophy ledger) is **load-bearing**: F1, Tennis, the feed, and the meta-league all depend on it. It must land first, and it must land **sequentially**, because the live DB is the pilot DB (no staging, no PITR) and the changes are schema-level. This part is waterfall *by necessity* — you cannot safely build two sports on a foundation that is still shifting under them.

Once the foundation is stable, the sport modules (F1, Tennis) are **isolated by design** (architecture principle #1) and can proceed **in parallel** if resourcing allows — they share no tables and only touch the foundation through the read-and-emit contract.

The meta-league scoring formula comes **last**, because it depends on (a) ≥2 sports actually emitting trophies, and (b) the deferred product decision.

```
PHASE 0 — FOUNDATION          PHASE 1/2 — MODULES         PHASE 3 — META
(sequential, football-safe)   (parallelisable)            (last)
  S1 Sport abstraction   ──┐
  S2 Circle layer          ├──►  S4–S5 F1 module     ──┐
  S3 Contract + trophy   ──┘     S6–S7 Tennis module ──┴──►  S8 Meta-league
                                                              + trophy cabinet
                                                              + unified feed
```

**Eight sprints, ~16 weeks** at a notional 2-week cadence (Phase 0 strictly sequential ≈ 6 weeks; Phases 1–2 overlap to ≈ 8 weeks combined; Phase 3 ≈ 2 weeks). Timeline maps comfortably onto the strategy doc's targets (F1 ready for the 2027 season; Tennis for the Australian Open, Jan 2027).

---

## Cross-Cutting Rules (every sprint)

1. **Additive migrations only.** New numbered files (next is `186_`). Football read paths must be unaffected at every merge. Backup before each migration ([Pilot Safeguards](../../CLAUDE.md#️-pilot-safeguards--read-before-every-db-operation)).
2. **Football stays green.** `platform.spec.js` and a manual football smoke pass at the end of every Phase-0 sprint. The football pilot must never regress.
3. **Dynamics are stubbed, not invented.** Where a sprint needs a scoring/rules decision, it ships a documented stub + a `league_config` key, and flags it for a dynamics session. No game-rule decisions are made here.
4. **Revamp-tolerant.** Frontend work stops at routing/context/registry seams. No component or visual decisions — those belong to the design revamp.
5. **Each sprint has an explicit exit check** so it is pickup-ready and verifiable.

---

## PHASE 0 — Foundation (sequential)

### Sprint 1 — Sport Abstraction

**Goal:** introduce the `sport` dimension and generalise the `tournaments` spine so non-football competitions can exist.

**Build**
- `sports` table; seed `football` (active), and placeholder rows for `f1` / `tennis` (inactive). [Arch §1]
- `tournaments.sport_id` + `tournaments.provider` columns; backfill all existing rows to football/Forza.
- Confirm synthetic-key strategy for `forza_id` (e.g. `f1-2027`) — write a one-page note + a test insert of a dummy non-football tournament, then remove it.
- No FK churn, no constraint changes.

**Stub / defer**
- Cosmetic `forza_id → provider_key` rename (optional, later).
- Full uuid re-key (explicitly out of scope — documented as deferred).

**Exit check:** a non-football tournament row can be inserted and read; every football query returns identical results to pre-sprint; `platform.spec.js` green; football smoke pass clean.

---

### Sprint 2 — Circle Layer

**Goal:** create the friend-group container and the circle-wide feed.

**Build**
- `circles`, `circle_members`, `circle_leagues` tables + RLS (mirror the `leagues`/`league_members` policy patterns). [Arch §2]
- Circle create + invite-code join RPCs (model on `create_league` / `join_league_by_code`, using `auth.uid()`).
- `get_circle_feed()` aggregation RPC over member leagues' `gazette_entries`.
- Associate existing football leagues with an (optional) circle — standalone leagues remain valid.

**Stub / defer**
- Invite fan-out policy (auto-join member leagues vs opt-in) — ship opt-in default, flag for product.
- Circle hub UI — only the data layer + RPCs here; screens are revamp/Claude-Design territory.

**Exit check:** a circle can be created, joined by code, linked to ≥2 leagues; `get_circle_feed()` returns merged gazette entries across those leagues; football leagues with no circle behave exactly as before.

---

### Sprint 3 — Module Contract + Trophy Ledger

**Goal:** lock the interface every sport implements, and stand up the meta-league primitive (model-agnostic).

**Build**
- Document the **Sport Module Contract** (C1 standings reader, C2 round lifecycle, C3 results emitter, C4 config) as the canonical spec. [Arch §3]
- Re-cast football as "module #1": map its existing pieces to C1–C4 (no football code rewrite).
- `trophy_ledger` table. [Arch §4]
- `get_circle_meta_standings()` v1 stub (trophy-count aggregation — swappable later).
- Add the football trophy emit: a single `trophy_ledger` insert in `calculate-scores` on a round win (additive; no scoring change).

**Stub / defer**
- The meta-league **formula** — v1 is trophy-count; final model is the deferred product decision (Phase 3).
- `tier` (bronze/silver/gold) population — column exists, left null until the hybrid model is chosen.

**Exit check:** football round completion writes a `trophy_ledger` row; `get_circle_meta_standings()` returns a sensible count-based ranking for a multi-league circle; contract doc is complete enough for an F1/Tennis dev to build against cold.

**End of Phase 0:** the foundation is frozen. A new sport can now be added without touching shared schema.

---

## PHASE 1 — F1 Module (port; lower complexity)

> F1 is sequenced first because it is a **port** of an existing, working app ([github.com/SMTCB/FantasyF1](https://github.com/SMTCB/FantasyF1)) — lower novelty, and the prediction model maps closely onto the existing `bet_instances` engine. Game dynamics (which predictions, point values) are tuned in a dedicated F1 dynamics session; these sprints build the plumbing.

### Sprint 4 — F1 Data Layer + Provider Adapter

**Build**
- `_shared/providers/openf1.ts` adapter to the common surface (`listEvents`/`getResults`/`health`). [Arch §5]
- F1 module tables (`f1_predictions`, `f1_race_results`, or equivalent — final shape from the dynamics session; build the storage + keys now).
- F1 sync Edge Function (races/sessions/results from OpenF1) + cron.
- Bind an F1 league to a circle via the foundation; resolve sport via `tournaments.sport_id`.

**Stub / defer**
- Prediction categories + point values → F1 dynamics session (ship config keys `f1.*` in `league_config`).

**Exit check:** OpenF1 races/results sync into F1 tables for a 2027 test event; an F1 league exists, is sport-tagged, and is attached to a circle.

---

### Sprint 5 — F1 Prediction + Scoring + Emission

**Build**
- F1 prediction submission + lock-at-deadline (reuse the `bet_instances` submit/resolve pattern where it fits). Satisfies contract C2.
- F1 scoring function → writes F1 standings; expose `get_module_standings(league_id)` for F1 (C1).
- On race completion: emit `gazette_entries` (narrative) + `trophy_ledger` (race win) (C3).
- Private F1 leagues replace the legacy single global leaderboard (the core addition from the strategy doc).

**Stub / defer**
- Accuracy/scoring weights → F1 dynamics session (function reads config, ships with placeholder weights).
- Prediction form UI → revamp / Claude Design (this sprint exposes the submit/read RPCs).

**Exit check:** end-to-end on a test race — predict → lock → resolve → standings update → gazette + trophy emitted; F1 appears in the circle feed and meta-standings.

---

## PHASE 2 — Tennis Module (build new)

> Tennis is a from-scratch build with a **manual-entry Phase 1** (commissioner enters daily results) per the strategy doc. These sprints build the pick/track/score plumbing; the pick count, round point values, and captain rule come from the Tennis dynamics session.

### Sprint 6 — Tennis Schema + Manual Result Entry

**Build**
- Tennis module tables (`tennis_picks`, `tennis_results`, or equivalent — storage + keys now; exact shape from dynamics session).
- `manual_results` staging table + commissioner entry RPC; `_shared/providers/manual.ts` adapter reads it. [Arch §5]
- Pick submission infra (manager selects N players for a tournament) + deadline lock. Satisfies C2.
- Tennis tournament rows as sport-tagged `tournaments` (synthetic keys: `ao-2027`, `rg-2027`, …); attach a tennis league to a circle.

**Stub / defer**
- Pick count, captain multiplier → Tennis dynamics session (config keys `tennis.*`).
- TheSportsDB automation (Phase 2 data strategy) → deferred; `thesportsdb.ts` adapter stubbed only.

**Exit check:** a commissioner can enter daily results for a test event; manager picks submit and lock; a tennis league is sport-tagged and circle-attached.

---

### Sprint 7 — Tennis Scoring + Standings + Emission

**Build**
- Round-advancement scoring engine: score picks as players progress (reads `manual_results`; values from config). Exposes `get_module_standings(league_id)` for tennis (C1).
- On event completion: emit `gazette_entries` + `trophy_ledger` (event win) (C3).
- Manual-entry-as-gazette-moment (commissioner announcement) wired into the feed.

**Stub / defer**
- Exact round point ladder → Tennis dynamics session.
- Live/automated data → Phase 2 (post-pilot), via `thesportsdb.ts`.

**Exit check:** end-to-end on a test tournament — pick → manual results entered → standings advance → event win emits gazette + trophy; tennis appears in circle feed and meta-standings.

**End of Phases 1–2:** two non-football sports emit trophies into the shared ledger. The meta-league now has real cross-sport data.

---

## PHASE 3 — Meta-League + Cross-Sport Surfaces

### Sprint 8 — Meta-League Engine + Trophy Cabinet + Unified Feed

> Prerequisite: the deferred [meta-league model decision](../architecture/MULTI_SPORT_PLATFORM_ARCHITECTURE.md#open-architecture-questions) (Trophy Cabinet vs Olympic vs Season vs Hybrid) must be made before/at the start of this sprint — it is a dedicated product session, not an engineering call.

**Build**
- Swap `get_circle_meta_standings()` body to the chosen model (count → weighted/olympic/gold-first). Schema unchanged — only the function body. [Arch §4]
- Populate `tier` on `trophy_ledger` emits if the hybrid model is chosen (update each module's C3 emit).
- Trophy cabinet data layer: `trophy_ledger` reads per user (cross-circle + per-circle).
- Unified cross-sport activity feed: `get_circle_feed()` surfaced as the circle's home feed across football + F1 + tennis.
- Year-end climax data (the meta-standing "season" view).

**Stub / defer**
- Trophy cabinet + circle hub + meta-standings **UI** → revamp / Claude Design (this sprint delivers the data layer + RPCs they bind to).

**Exit check:** a circle running football + F1 + tennis shows a single cross-sport standing under the chosen model, a unified activity feed, and per-user trophy cabinets — all from the shared ledger and feed RPCs.

---

## Dependency Map

```
S1 Sport abstraction ──► S2 Circle layer ──► S3 Contract + trophy ledger
                                                   │
                          ┌────────────────────────┼────────────────────────┐
                          ▼                         ▼                         │
                    S4 F1 data/adapter        S6 Tennis schema/manual        │
                          ▼                         ▼                         │
                    S5 F1 predict/score       S7 Tennis score/standings      │
                          └────────────┬────────────┘                        │
                                       ▼                                      │
                              S8 Meta-league + cabinet + unified feed ◄───────┘
                              (also gated on: meta-model product decision)
```

- **Hard sequential:** S1 → S2 → S3 (foundation; football-safety demands it).
- **Parallelisable:** {S4,S5} and {S6,S7} after S3, if resourcing allows.
- **Gated:** S8 needs S5 + S7 done *and* the meta-model decision made.

---

## Decision Gates (must resolve before the dependent sprint)

| Gate | Blocks | Owner | When |
|---|---|---|---|
| Synthetic-key vs rename for `forza_id` | S1 close | Eng | Sprint 1 |
| Circle invite fan-out (auto vs opt-in) | S2 polish (default opt-in unblocks) | Product | Sprint 2 |
| F1 prediction categories + weights | S5 dynamics (plumbing unblocked) | Product/dynamics | Before S5 |
| Tennis pick count + round ladder + captain | S7 dynamics (plumbing unblocked) | Product/dynamics | Before S7 |
| **Meta-league model** (Cabinet/Olympic/Season/Hybrid) | **S8** | Product | Before S8 |
| TheSportsDB vs alt for Tennis Phase 2 | post-pilot automation | Eng | After AO pilot |

Note: every *dynamics* gate blocks only the **rules**, not the **plumbing** — the sprints build and ship the infrastructure with stubbed config regardless, so engineering is never idle waiting on a game-design decision.

---

## What This Plan Deliberately Does NOT Decide

- **Any scoring weight, prediction category, pick count, captain rule, or point ladder** — all deferred to per-sport dynamics sessions.
- **Any component, layout, or visual design** — owned by the parallel design revamp and Claude Design.
- **The meta-league formula** — deferred product decision (gate before S8).
- **Golf / Cricket / UFC** — Year 2; the foundation supports them with no further platform work (add a `sports` row + a module).

---

## Related Documents

- [Multi-Sport Platform Architecture](../architecture/MULTI_SPORT_PLATFORM_ARCHITECTURE.md) — the target design each sprint builds
- [Multi-Sport Technical Assessment](../architecture/MULTI_SPORT_TECHNICAL_ASSESSMENT.md) — current-state grounding
- [Multi-Sport Expansion — Strategy & Decisions](MULTI_SPORT_EXPANSION.md) — vision, sports roadmap, targets
- [CLAUDE.md — Pilot Safeguards](../../CLAUDE.md#️-pilot-safeguards--read-before-every-db-operation) — migration safety rules

---

Last Updated: **2026-06-20**
