# Clubhouse-Centric Redesign — Information Architecture & UX

**Target architecture for the multi-sport platform: make the Clubhouse the room, sports the tables in it. Eliminates the "fantasy-sports frankenstein" feel by enforcing one organizing concept across navigation, state, and the data model.**

---

## Quick Navigation

- **For the why** → [The Problem](#the-problem) · [The Unifying Concept](#the-unifying-concept)
- **For the what** → [Target Information Architecture](#target-information-architecture) · [The Shared Spine](#the-shared-spine-the-guiding-thread)
- **For the how** → [Navigation Model](#navigation-model) · [State Model](#state-model) · [Data Model](#data-model)
- **For sequencing** → [Phased Delivery](#phased-delivery)

---

## Context / Overview

The v2 platform is feature-complete across Football, F1, Tennis, P2P betting, and a Clubhouse social layer. The modules work, but they read as three separate fantasy apps sharing a skin rather than one product designed multi-sport from the ground up.

This document defines the **target information architecture** that gives the platform a single organizing concept — the **Clubhouse** — and a shared **spine** every sport renders against. It is the authoritative reference for the IA/UX redesign workstream tracked in [TRACKER.md](../TRACKER.md).

> **Building it?** This doc is the *why/what*. The phase-by-phase *how* — exact files, new components, contracts, migrations, gotchas, and acceptance criteria, written to be executed cold in dedicated sessions — is in the companion **[CLUBHOUSE_CENTRIC_REDESIGN_IMPLEMENTATION_PLAN.md](CLUBHOUSE_CENTRIC_REDESIGN_IMPLEMENTATION_PLAN.md)**.

**Scope:** navigation shell, routing, location state, the competition→clubhouse data relationship, and the shared per-competition layout template. **Not in scope:** sport-specific scoring, betting economics, or any backend logic that isn't part of enforcing the clubhouse invariant.

**Guiding principle (from product):** never let the platform feel like a merge of different fantasy sports. The goal is a place where friends gather to follow sports together. The Clubhouse is the central, critical surface — it must be at the top, not buried.

---

## The Problem

The "frankenstein" feeling is not caused by missing features. It is caused by **no single organizing concept being enforced** in the IA, the state, or the data model. Six concrete causes, as they exist today:

| # | Symptom | Where it lives today |
|---|---------|----------------------|
| 1 | **The sidebar morphs per sport** — it swaps between `FOOTBALL_NAV`, `buildF1Nav()`, and a Tennis nav keyed off `activeSport`. The whole shell reconfigures depending on which sport you're in. | `src/components/AppLayout.jsx` (`FOOTBALL_NAV`, `buildF1Nav`, Tennis nav; switch at `NAV_ITEMS = isF1 ? ... : FOOTBALL_NAV`) |
| 2 | **Two competing front doors** — `/` (`MultiSportHomeScreen`) and `/clubhouse` (`ClubhouseScreen`) both show cross-sport overviews. The Clubhouse is buried under "COMMUNITY → My Group" at the bottom of the sidebar. | `src/App.jsx` routes; `AppLayout.jsx` COMMUNITY section |
| 3 | **Clubhouse is optional plumbing** — `circle_id` is nullable; competitions are born orphaned and linked later via owner-only `link_league_to_circle`. | migration 215; `useClubhouse.js` (`linkLeague`, `getOwnerLinkableLeagues`) |
| 4 | **Two disconnected state models** — `SportContext` (activeSport/activePaddockId/activePlayerBoxId) and `useClubhouse` (activeCircleId/competitions/feed) never reference each other. The app has no single notion of "where am I." | `src/context/SportContext.jsx`; `src/hooks/useClubhouse.js` |
| 5 | **Each sport reinvents its entry/lobby** — Football: picker inside `LeagueScreen`; F1: `PaddockLobbyScreen`; Tennis: `/tennis/box`. Three create/join flows for one conceptual act. | `LeagueScreen.jsx`, `f1/PaddockLobbyScreen.jsx`, `tennis/PlayerBoxScreen.jsx` |
| 6 | **Taxonomy drift** — "My Group" (nav) = "Clubhouse" (screen) = "circle" (code/DB); competitive unit is league / paddock / player box. | throughout |

---

## The Unifying Concept

> **The Clubhouse is the room. Sports are the tables in it.**

You are always *inside a clubhouse*. Inside it you see its competitions — any sport, any number, including **multiple competitions of the same sport** running concurrently. **You cannot reach a competition except through a clubhouse.**

This single rule converts the product invariant ("every competition is always assigned to a clubhouse") from a guideline people must remember into a **structural fact** of the IA, the state, and the schema. It is the mechanism that removes the frankenstein feeling.

### Invariants this redesign enforces

1. Every competition (football league, F1 paddock, tennis player box) belongs to exactly one clubhouse. No orphans. (`circle_id NOT NULL`.)
2. A clubhouse may hold many competitions across many sports, concurrently — including multiple competitions of the *same* sport (e.g. two football leagues + a football cup at once).
3. The only way to create or join a competition is from within a clubhouse.
4. The clubhouse-level surfaces (overview, FrontRow, recap, chat, members, trophies, coins) are identical regardless of which sports are present.

---

## The Shared Spine (the "Guiding Thread")

Every competition, regardless of sport, renders against the **same three-tier template**. The sports are allowed to diverge in exactly one tier.

| Tier | Surface | Shared or divergent | Sport differences |
|------|---------|---------------------|-------------------|
| **1 — Clubhouse** | Overview · The FrontRow · Recap · Chat · Members · Trophy Cabinet · Coins | **Identical** across all sports | none — this is the social + results spine |
| **2 — Competition results header** | Standings / leaderboard of competing members, sitting **above** the unit | **Same component skeleton** | columns only: GW pts / race pts / tournament pts |
| **3 — My unit** | the manager's own entry | **Divergence lives here, and only here** | football squad+formation · F1 race/season picks · tennis box roster+captain |

This mirrors the product's described contact points: **results sit above the competitive unit; sports diverge inside the unit.** Tiers 1 and 2 are the thread (shared components, sport-accent colors); Tier 3 is where each sport is itself.

**Implication for code:** Tier 2 should become a single shared component (`<CompetitionResultsHeader sport=... />`) that each sport's competition screen composes, rather than three bespoke standings views. Tier 3 stays sport-specific.

---

## Target Information Architecture

```
Platform
└── Clubhouse  ← you are always inside one (switchable)
    ├── Tier 1 — Clubhouse surfaces (sport-agnostic, identical everywhere)
    │   ├── Overview        (the single home — merges today's MultiSportHome + Clubhouse HOME)
    │   ├── The FrontRow     (AI newspaper)
    │   ├── Recap            (cross-sport activity)
    │   ├── Chat
    │   ├── Members
    │   ├── Trophy Cabinet
    │   └── Coins / Challenges
    │
    └── Competitions (top-bar tabs, one per active competition, sport-colored)
        ├── ⚽ Premier League Fantasy   → Tier 2 results header → Tier 3 squad
        ├── ⚽ The Gaffer's Cup          → Tier 2 results header → Tier 3 squad   (another football comp — any number allowed)
        ├── ⚽ Sunday Sweat League       → Tier 2 results header → Tier 3 squad   (and another — same sport, concurrent)
        ├── 🏁 Formula Fun               → Tier 2 results header → Tier 3 F1 picks
        └── 🎾 Wimbledon '26             → Tier 2 results header → Tier 3 tennis box
```

The reference mock for this structure is `docs/platform_revision/design/screens/Multi-Sport - Coin Challenges v2.html` — **Screen 7 "Group Hub"** is the Clubhouse overview; its color-accent system (football=accent blue, F1=`--f1` red, tennis=`--ten` green, gold for coins/trophies) is the canonical sport-coding for the top bar and all Tier 2 headers.

---

## Navigation Model

Two rails mapped to the two stable axes of "where am I":

### Left sidebar = the Clubhouse spine (sport-agnostic, never morphs)

- **Top:** a **Clubhouse switcher** (the user belongs to several).
- **Below:** the Tier-1 destinations — Overview · The FrontRow · Recap · Chat · Members · Trophy Cabinet · Coins.
- This rail **stops changing per sport.** It is the single constant — the gathering place. This directly replaces today's `activeSport`-driven nav swapping.

### Top bar = the competitions inside the active clubhouse (the sport context)

- A row of tabs, **one per active competition**, color-coded by sport.
- **Critical refinement:** the tabs are the **actual named competitions**, not the sport categories "Football / F1 / Tennis." This is what lets a clubhouse with two football leagues + one F1 paddock feel natural instead of being forced into three sport buckets. Same colors, but the unit is the competition.
- Selecting a tab enters that competition; the competition's own screens (Squad/Market/Live, or Picks/Standings/Report) hang off a **secondary strip beneath the top bar**.

### How a user travels between sports

Inside the active clubhouse, **every competition associated with it is visible and one click away**, in two complementary places:

1. **Clubhouse Overview** — a grid of competition cards, all sports together (sport-colored), each showing live status + your rank/next action, with an "ENTER →" affordance. This is the lobby view of "what's on at this clubhouse." (The current `ClubhouseScreen` HOME tab already does a version of this — it lists football/F1/tennis cards with ENTER buttons; the redesign promotes it to the primary home and unifies the styling.)
2. **Top-bar competition tabs** — the same competitions as persistent tabs, so you can hop directly between, say, a football league and an F1 paddock **without returning to the Overview**. The tabs stay visible while you're inside any competition.

So: open the clubhouse → see all its sports/competitions → click any card or tab → you're in that competition's Tier 2/Tier 3 view → switch to another via the top bar at any time. No sport is hidden; nothing is more than one click from anything else in the same room.

### Why this split

The sidebar answers *"where are we gathering"* (stable); the top bar answers *"what are we playing"* (contextual). It makes the clubhouse invariant **visible** — a competition can only ever appear as a tab inside a clubhouse — and removes the three-swapping-sidebars problem because sport-specific nav leaves the sidebar entirely.

### Consolidations required

- **One front door.** Merge `MultiSportHomeScreen` into the Clubhouse Overview. `/` lands in the user's active clubhouse Overview. Retire the duplicate home.
- **One entry flow.** Replace the three lobbies (`PaddockLobbyScreen`, the `LeagueScreen` picker, `PlayerBoxScreen`) with a single **"+ New competition"** action launched from the clubhouse, with a sport picker; auto-sets `circle_id`.

---

## State Model

Collapse the two independent models into a single **current-location** model so the app knows where the user is in one place:

```js
// today: SportContext { activeSport, activePaddockId, activePlayerBoxId }
//        + useClubhouse { activeCircleId, ... }   ← disconnected

// target: one location context
{
  clubhouseId,      // which room — the primary axis, persisted
  competitionId,    // which competition tab within it (nullable = on a Tier-1 surface)
  sport,            // derived from the active competition; drives accent color only
}
```

- `clubhouseId` is the primary persisted axis (localStorage today's `activeCircleId`).
- `sport` becomes **derived** from the active competition rather than an independent selector — it should only drive theming/accent, never navigation structure.
- The per-sport active IDs (`activePaddockId`, `activePlayerBoxId`) fold into `competitionId`.

---

## Data Model

The schema groundwork is already partly laid by **migration 215** (nullable `circle_id` on `leagues`, `paddocks`, `player_boxes`). To complete the invariant:

1. **Make `circle_id NOT NULL`** on `leagues`, `paddocks`, `player_boxes` — *after* the entry-flow change guarantees every new competition is created with a clubhouse, and after backfilling any remaining orphans.
2. **Creation RPCs always set `circle_id`** — `create_league` (6-param overload with `p_circle_id`), `create_paddock`, `create_player_box` already accept it (migration 215); the new entry flow must always pass it.
3. **Deprecate optional linking** — `link_league_to_circle` / `getOwnerLinkableLeagues` become migration/repair tooling only, not a normal user flow.
4. **Junction tables** (`circle_leagues`, `circle_paddocks`, `circle_player_boxes`) remain for backwards compatibility but `circle_id` on the row is the source of truth.

> ⚠️ All schema changes touch the **shared production Supabase project** and follow the [TRACKER approval gate](../TRACKER.md#-pending-db--deploy-actions). The `NOT NULL` migration must be backed up and orphan-checked first (no Docker → `SELECT` orphans to `backups/*.json`).

---

## Taxonomy

Settle on one vocabulary across UI, code, and docs:

| Concept | Use in UI | Notes |
|---------|-----------|-------|
| The room | **Clubhouse** | Retire "My Group" (nav) and "circle" (UI strings). `circle`/`circle_id` may stay in DB/code internals. |
| A contest within it | **Competition** (umbrella) | Use on all shared/Tier-1/Tier-2 surfaces. |
| Sport flavor names | League (⚽) · Paddock (🏁) · Player Box (🎾) | Keep *only* as sport-colored labels inside Tier 3, where divergence is expected. |

---

## Phased Delivery

Sequenced so the **feeling** changes first (Phase A), before the deeper data/state work — to validate direction early.

| Phase | Goal | Primary surface | Notes |
|-------|------|-----------------|-------|
| **A — Shell & IA** | New sidebar spine + top-bar competition tabs; `/` → active clubhouse; merge the two homes | `AppLayout.jsx`, `App.jsx`, `ClubhouseScreen`, `MultiSportHomeScreen` | Mostly frontend. Highest perceived impact. No schema changes. |
| **B — Entry unification** | Single "+ New competition" flow; one location-state model; `circle_id NOT NULL` | new entry component; `SportContext`→location context; migration 216+ | Schema change gated by TRACKER approval. Backfill orphans first. |
| **C — Shared spine template** | Extract Tier 2 `CompetitionResultsHeader`; refactor each sport's competition view onto Tier 2 + Tier 3 | football/F1/tennis competition screens | Component refactor; behavior-preserving. |
| **D — Taxonomy & polish** | Naming pass; top-nav-bar visual treatment from the mock | global strings; `AppLayout` styling | Apply Kit Light + mock accent system. |

Each phase ships as its own PR(s) into `v2`, lint + build + `platform.spec.js` green, and updates [TRACKER.md](../TRACKER.md).

---

## Related Documents

- [TRACKER.md](../TRACKER.md) — open-items source of truth; this redesign is a tracked workstream
- [MULTI_SPORT_PLATFORM_ARCHITECTURE.md](MULTI_SPORT_PLATFORM_ARCHITECTURE.md) — existing multi-sport architecture
- [design/screens/Multi-Sport - Coin Challenges v2.html](../design/screens/Multi-Sport%20-%20Coin%20Challenges%20v2.html) — reference mock (Screen 7 = Clubhouse overview; canonical accent system)
- [design/Kit Design System.html](../design/Kit%20Design%20System.html) — Kit Light tokens
- Live F1 reference (external): `https://fantasy-f1-p3jq.vercel.app/` — the working F1 fantasy app whose structure informs the F1 competition's Tier 2/3 layout

---

Last Updated: **2026-06-29**
