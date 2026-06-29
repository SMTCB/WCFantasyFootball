# Clubhouse-Centric Redesign — Implementation Plan

**Self-contained, phase-by-phase build plan for the [Clubhouse-Centric Redesign](CLUBHOUSE_CENTRIC_REDESIGN.md). Written to be executed in separate, dedicated sessions with no memory of the design conversation — every fact a session needs is restated here.**

---

## How to use this document

- Read the **[design doc](CLUBHOUSE_CENTRIC_REDESIGN.md)** first for the *why* (the vision, the 3-tier spine, the navigation model). This document is the *how*.
- Each phase below is independently shippable as its own PR(s) into `v2`. Do phases in order (A → B → C → D) — later phases assume earlier ones landed.
- Before touching code in any session, read **[Cross-cutting rules](#cross-cutting-rules-read-before-any-session)** — they encode crash patterns this codebase has hit repeatedly.
- The **[Current-state reference](#current-state-reference)** captures exact file/line/contract facts as of 2026-06-29 so a session doesn't have to re-discover them. Verify they still hold (`grep`) before relying on a line number.

> **Session type:** this is **v2 platform-revision** work. Branch from `v2`, PR into `v2`, never into `main`. Per project rules, confirm session type before any git command.

---

## The end state (one paragraph)

You are always inside a **Clubhouse**. The **left sidebar** is the Clubhouse spine — a clubhouse switcher plus the sport-agnostic destinations (Overview · The FrontRow · Recap · Chat · Members · Trophy Cabinet · Coins · Settings) — and it **never changes between sports**. A **top bar** shows one tab per **competition** in the active clubhouse (any sport, any number, including multiple of the same sport), color-coded by sport. Selecting a competition enters it; a **secondary strip** beneath the top bar carries that competition's own screens (Squad/Market/Live for football; Picks/Standings/Report for F1; etc.). Every competition is created **from inside a clubhouse** and is permanently bound to it (`circle_id NOT NULL`). There is one home — the Clubhouse Overview — reached at `/`.

---

## Current-state reference

*(Facts a session needs, verified 2026-06-29. File line numbers may drift — confirm with grep.)*

### Shell & routing

| File | What it is now |
|------|----------------|
| `src/components/AppLayout.jsx` | The shell. Desktop **left sidebar** with 3 sections: **PLATFORM** (Home `/`), **SPORTS** (Football + subs, Formula 1 + subs, Tennis + subs), **COMMUNITY** (My Group `/clubhouse`, The FrontRow, Trophy Cabinet, Coin Challenges, Settings). The sidebar **morphs per sport**: `const NAV_ITEMS = isF1 ? buildF1Nav(activePaddockId) : FOOTBALL_NAV;` (line ~119), where `isF1 = activeSport === 'f1'`. `FOOTBALL_NAV` (lines 24–31) and `buildF1Nav()` (lines 33–43) define per-sport items; the Tennis nav is inline in the sidebar JSX. Mobile bottom bar renders `NAV_ITEMS.filter(i => !i.desktopOnly)`. `NavItem` component at line 59. `isMainRoute` regex block (lines 134–152) controls the mobile back button. Consumes `unreadCount` from `ClubhouseNotifContext`. |
| `src/App.jsx` | Router. `/` → `MultiSportHomeScreen`. All screens lazy-loaded (`lazy(() => import(...))`) and wrapped per-route in `<ErrorBoundary screen="...">`. Provider nesting: `AuthProvider → SportProvider → ClubhouseNotifProvider → Router → ToastProvider → AppRoutes`. Football screens are **global routes** (`/squad`, `/market`, `/live`, `/recap`, `/league`, `/league/:leagueId`) — the active league is implicit. F1 screens are **paddock-scoped** (`/f1/:paddockId`, `/f1/:paddockId/picks`, `/standings`, `/report`, `/season`). Tennis: `/tennis`, `/tennis/box`, `/tennis/tournament/:id`, `/tennis/leaderboard`, `/tennis/finals`. Clubhouse: `/clubhouse`, `/clubhouse/:circleId`. |
| `src/context/SportContext.jsx` | Tiny localStorage-backed context: `{ activeSport, activePaddockId, activePlayerBoxId }` + setters. `activeSport` drives which sidebar nav shows. |
| `src/hooks/useClubhouse.js` | **A hook, not a provider.** Each screen that calls `useClubhouse()` gets its own independent state + fetches. Exposes: `myCircles`, `activeCircle`, `activeCircleId`, `setActiveCircleId` (localStorage `activeCircleId`), `competitions` (`{football,f1,tennis}`), `feed`, `members`, `metaStandings`, `notifications`, `unreadCount`, and RPC actions: `create_circle`, `join_circle_by_code`, `search_clubhouses`, `update_circle_settings`, `kick_circle_member`, `link_league_to_circle`, `get_owner_linkable_leagues`. On mount it fetches `circle_members → circles`; on `activeCircleId` change it fires 5 parallel RPCs (`get_clubhouse_competitions`, `get_circle_feed`, members query, `clubhouse_notifications` query, `get_circle_meta_standings`). Realtime channels per circle for feed + notifications. |
| `src/context/ClubhouseNotifContext.js` + `ClubhouseNotifProvider.jsx` | Lightweight cross-circle unread badge counter (`unreadCount`) used by AppLayout. Separate from `useClubhouse`'s per-circle `unreadCount`. |

### The two home screens (Phase A merges these)

| File | What it renders | Data |
|------|------------------|------|
| `src/screens/MultiSportHomeScreen.jsx` | Header (active-sports count / trophies / group rank); **sport module cards** (`SportModuleCard`, CTA paths `/squad`, `/f1`, `/tennis`); **Activity Gazette** (feed, 8 items); trophy teaser + **meta-rank table** (top 6). No-circle welcome state. | `useClubhouse()` — `activeCircle`, `competitions`, `feed`, `metaStandings` |
| `src/screens/ClubhouseScreen.jsx` | Tabs: **HOME** (per-sport `SportSection` cards from `competitions`), **THE FRONTROW**, **RECAP**, **CHAT**, **INBOX (n)**, **MEMBERS**, **FIND**, **SETTINGS** (owner). Multi-circle selector pills. No-circle → `ClubhouseLobby` (CREATE/JOIN tabs). HOME card ENTER targets: football → `navigate('/league/${id}')`; F1 → set sport ctx + `navigate('/f1/${id}')`; tennis → `navigate('/tennis/${id}')`. | `useClubhouse()` |

> These two screens are near-duplicates of the same data. **The merge target is: one Clubhouse home, reached at `/`.**

### Competition surfaces (Phase C extracts a shared header from these)

| Sport | Results/standings surface (Tier 2) | Columns | Per-manager unit (Tier 3) |
|-------|-----------------------------------|---------|---------------------------|
| Football | `src/components/league/LeagueDetailView.jsx` (standings table). Tabs defined in `src/components/league/HubShared.jsx` `HubTabs`: leaderboard, h2h?, recap, trading?, stats, admin. | rank, manager, TOT, (H2H?) | Squad (via VIEW button → squad view) |
| F1 | `src/screens/f1/F1StandingsScreen.jsx` (RPC `get_paddock_leaderboard`) | rank/medal, driver/display_name, race_points, year_points, total_points | Race picks (`F1RaceBetScreen`), season bets |
| Tennis | `src/screens/tennis/TennisLeaderboardScreen.jsx` (`useTennisLeaderboard`) | rank/medal, username, slam_points, masters_points, finals_points, season_total | Roster (`TennisTournamentScreen`) |

All three are **bespoke** grid/flex tables with rank + name + sport-specific point columns — structurally similar, parameterizable.

### Creation RPCs (Phase B unifies the entry into these)

| Sport | RPC | Frontend call site | Params | circle binding |
|-------|-----|--------------------|--------|----------------|
| Football | `create_league` | direct `supabase.rpc` in `LeagueScreen.jsx` (~line 675) | `p_name`, `p_format`, `p_user_id`, `p_tournament_id`, `p_h2h_enabled`, **`p_circle_id`** (optional) | 6-param overload added in migration 215; inserts `leagues.circle_id` + `circle_leagues` junction row |
| F1 | `create_paddock` | `usePaddock().createPaddock(name, circleId)` (`src/hooks/f1/usePaddock.js`) | `p_name`, **`p_circle_id`** (optional) | migration 215; writes `paddocks.circle_id` + junction |
| Tennis | `create_player_box` | `usePlayerBox().createPlayerBox(name, circleId)` (`src/hooks/tennis/usePlayerBox.js`) | `p_name`, `p_season_year` (=2026), **`p_circle_id`** (optional) | migration 215; writes `player_boxes.circle_id` + junction |

`get_clubhouse_competitions` (clubhouse-social migration) currently returns `{ football:[{id,name,format,sport}], f1:[{id,name,sport}], tennis:[] }` — **tennis is stubbed empty** (no tennis branch wired yet). Phase B/C must wire tennis.

### Schema groundwork already in place

- **Migration 215** added nullable `circle_id uuid REFERENCES circles(id)` to `leagues`, `paddocks`, `player_boxes`; backfilled from junction tables; updated the 3 creation RPCs to write `circle_id` directly; added the `create_league` 6-param overload. Applied to production 2026-06-28.
- **Next migration number on v2: `216_`.**

---

## Cross-cutting rules (read before any session)

1. **Rolldown TDZ rule.** Vite v8/Rolldown crashes with `Cannot access 'X' before initialization` (production only, not dev) when the *same module* is imported both directly by a large screen and transitively through one of its children. Before adding an `import` to a child of `AppLayout`/`ClubhouseScreen`/`LeagueScreen`, grep whether the parent already imports it; if so, inline/pass-as-prop instead. Run `npm run build` (not just dev) and `npx madge --circular src/` before every PR.
2. **`createPortal` for every `position:fixed` modal/sheet.** `#main-content` has `WebkitOverflowScrolling:'touch'`, creating an iOS stacking context that traps fixed children. All new modals/drawers (e.g. the "+ New competition" flow, the clubhouse switcher dropdown if it overlays) must `createPortal(node, document.body)`.
3. **Kit Light tokens only.** `--bg` page, `--card` surface, `--elev` input bg, **`--paper` = primary text (there is NO `--text`)**, `--text-2` secondary, `--mute` labels, `--rule` borders, `--gold` accent, `--accent` blue, sport accents `--f1` (red) / `--ten` (green). `--shell` (#18202E) is the **one** dark element (the sidebar) — never a page/card bg.
4. **RLS / auth.** New RPCs that write must use `auth.uid()` (never trust a client-passed user id) and be `SECURITY DEFINER` only where they legitimately bypass RLS. Filter all reads by membership.
5. **Production DB approval gate.** Any migration or `db query --linked` write hits the **shared production project** (`sssmvihxtqtohisghjet`) that also serves the live pilot. Name the exact action in chat and get explicit per-item approval in that session before running. No Docker on the dev PC → for backups, `SELECT` affected rows to `backups/*.json` rather than `db dump`.
6. **Definition of done per PR:** `npm run lint` clean, `npm run build` clean (TDZ check), `npx playwright test` (`platform.spec.js`) green, `npx madge --circular src/` no new cycles. Update [TRACKER.md](../TRACKER.md) workstream checkboxes + session note.

---

## Phase A — Shell & IA (frontend only, no schema)

**Goal:** the *feel* changes. Sidebar becomes the sport-agnostic Clubhouse spine; competitions move to a top bar; one home at `/`. No data-model or RPC changes.

### Functional spec

- Opening the app lands on the **active Clubhouse Overview** (`/`). If the user is in no clubhouse, show the existing CREATE/JOIN lobby.
- The **left sidebar** shows, top to bottom: brand → **Clubhouse switcher** (current clubhouse name; opens a list when the user is in ≥2) → Tier-1 destinations: **Overview, The FrontRow, Recap, Chat, Members, Trophy Cabinet, Coins, Settings**. It does **not** change when the user enters a football vs F1 vs tennis competition.
- A **top bar** (below any existing mobile top strip, above page content) shows one tab per competition in the active clubhouse, color-coded by sport (⚽ `--accent` / 🏁 `--f1` / 🎾 `--ten`), labelled with the competition's name. A `+` affordance sits at the end (wired in Phase B; in Phase A it can route to the existing per-sport create flows).
- Selecting a competition tab navigates into that competition and reveals a **secondary strip** of that competition's screens (the content of today's `FOOTBALL_NAV` / `buildF1Nav` / tennis nav, rendered horizontally, scoped to the selected competition).
- On mobile: the sidebar collapses as today; the competition top bar becomes a horizontally scrollable strip; the bottom bar carries the **active competition's** screens (replacing today's sport-keyed bottom bar — same content, sourced from the selected competition's sport instead of `activeSport`).

### Technical steps

1. **Promote `useClubhouse` to a provider.** Create `src/context/ClubhouseProvider.jsx` exposing the current `useClubhouse` return value once, app-wide. Wrap in `App.jsx` (alongside `SportProvider`). Replace the per-screen `useClubhouse()` instantiations in `MultiSportHomeScreen` and `ClubhouseScreen` with the context consumer. *Why:* AppLayout needs `competitions` + `activeCircle` to render the top bar, and today two screens double-fetch. Keep the existing hook file as the implementation the provider calls.
2. **Merge the two homes.** Make the Clubhouse Overview the single home: point `/` at `ClubhouseScreen` (Overview tab) and **delete `MultiSportHomeScreen`** after folding its unique pieces (trophy teaser, meta-rank table, active-sports/trophies/group-rank header stats) into the Overview tab. Remove the `MultiSportHomeScreen` route + lazy import in `App.jsx`. Update the `ErrorBoundary screen=` label.
3. **Rebuild the sidebar in `AppLayout.jsx`.** Remove the **SPORTS** section and the `NAV_ITEMS = isF1 ? buildF1Nav : FOOTBALL_NAV` switch. New sidebar = brand → Clubhouse switcher → Tier-1 items (Overview `/`, The FrontRow `/clubhouse?tab=frontrow`, Recap, Chat, Members, Trophy `/trophy`, Coins `/challenges`, Settings `/settings`). Keep `NavItem`, `NavSectionLabel`, the unread badge.
4. **Add the competition top bar.** New `src/components/CompetitionTopBar.jsx`, rendered by `AppLayout` from `ClubhouseProvider.competitions`. Flatten `{football,f1,tennis}` into one ordered tab list, each `{ id, name, sport }`. Tab → navigate to the competition entry route (football `/league/${id}`, F1 `/f1/${id}`, tennis `/tennis/tournament/${id}`). Mark the active tab from the current route.
5. **Add the secondary screen strip.** New `src/components/CompetitionScreenNav.jsx` — given the active competition's sport + id, render its screens horizontally. Reuse the existing `FOOTBALL_NAV` and `buildF1Nav(paddockId)` arrays (move them into this component or a shared `navConfig.js`); add a tennis array. This is where the *per-sport* nav now lives (it left the sidebar).
6. **Repoint sport state off `activeSport` for nav.** The secondary strip + mobile bottom bar derive their sport from the **selected competition** (route-derived), not the global `activeSport`. Keep `SportContext` for now (Phase B collapses it) but stop using `activeSport` to choose the sidebar.
7. **Mobile parity.** Update the mobile bottom bar to render the active competition's screens; competition top bar becomes a scrollable strip; preserve the Clubhouse unread badge.

### Files touched
`App.jsx`, `AppLayout.jsx`, `ClubhouseScreen.jsx`, delete `MultiSportHomeScreen.jsx`, new `ClubhouseProvider.jsx` + `CompetitionTopBar.jsx` + `CompetitionScreenNav.jsx` (+ optional `navConfig.js`).

### Acceptance criteria
- `/` renders the Clubhouse Overview; no `MultiSportHomeScreen` remains.
- Sidebar is identical whether you're in football, F1, or tennis — it no longer swaps.
- All competitions in the active clubhouse appear as top-bar tabs; clicking each enters the correct competition.
- Each competition's own screens are reachable from the secondary strip; deep links (`/squad`, `/f1/:id/picks`, etc.) still resolve.
- A clubhouse with **two football leagues** shows two football tabs that open the correct league each.
- Build/lint/`platform.spec.js`/madge all green. (Expect `platform.spec.js` selectors keyed to `data-testid="desktop-nav"`/`"mobile-nav"` to need updates — keep those testids.)

---

## Phase B — Entry unification + single location state + schema

**Goal:** there is one way to create/join a competition (from the clubhouse), one location-state model, and the clubhouse binding is enforced in the DB.

### Functional spec

- The top-bar `+` opens a **"New competition"** flow (a portal modal) launched from within the active clubhouse: pick a sport → fill the sport's form → create. The competition is created already bound to the current clubhouse. A **Join by code** path lives in the same flow.
- The three standalone lobbies (`PaddockLobbyScreen`, the `LeagueScreen` picker, `PlayerBoxScreen`) are no longer the entry points — they become redirects into the clubhouse flow (or are removed once nothing links to them).
- A competition can no longer exist without a clubhouse.

### Technical steps

1. **Unified create flow.** New `src/components/NewCompetitionFlow.jsx` (portal modal). Step 1: sport picker. Step 2: sport-specific form. On submit, call — with the active `circle_id` always passed:
   - Football → `create_league` with `p_circle_id` (reuse the field set already in `LeagueScreen`).
   - F1 → `usePaddock().createPaddock(name, circleId)`.
   - Tennis → `usePlayerBox().createPlayerBox(name, circleId)`.
   Then refresh `ClubhouseProvider.competitions` and navigate into the new competition.
2. **Wire tennis into `get_clubhouse_competitions`.** Migration `216_`: extend the RPC's tennis branch to read `player_boxes WHERE circle_id = p_circle_id` (and/or the `circle_player_boxes` junction). Today it returns `[]`. Return `{id,name,sport:'tennis'}` shape consistent with the others.
3. **Single location model.** Introduce a `useActiveCompetition()` selector (derive `{ clubhouseId, competitionId, sport }` from `ClubhouseProvider.activeCircleId` + the current route). Migrate `activePaddockId`/`activePlayerBoxId` consumers to read `competitionId` from it. Retire `SportContext.activeSport` (sport is now derived). Keep localStorage persistence of `clubhouseId`.
4. **Enforce the invariant in the schema.** Migration `217_` (separate from the RPC change): after (a) the create flow guarantees new competitions always carry `circle_id`, and (b) a one-off orphan backfill, set `circle_id NOT NULL` on `leagues`, `paddocks`, `player_boxes`. **Approval-gated.** First `SELECT` orphan rows (`WHERE circle_id IS NULL`) to `backups/orphans_pre_217_*.json`; resolve them (assign to a clubhouse or archive) before adding the constraint.
5. **Demote optional linking.** `link_league_to_circle` / `getOwnerLinkableLeagues` stay as repair/migration tooling but are removed from the normal user UI (the SETTINGS "link existing league" affordance).

### Files touched
new `NewCompetitionFlow.jsx`, `ClubhouseProvider.jsx` (refresh after create), `AppLayout`/`CompetitionTopBar` (`+` wiring), `usePaddock.js`/`usePlayerBox.js` (unchanged signatures — already accept circleId), redirect or remove `PaddockLobbyScreen.jsx`/`PlayerBoxScreen.jsx` and the `LeagueScreen` picker; migrations `216_` (RPC) and `217_` (NOT NULL).

### Acceptance criteria
- Every create/join goes through the clubhouse flow; the three old lobbies no longer appear as primary entry points.
- A newly created competition immediately appears as a top-bar tab in the current clubhouse.
- Tennis competitions appear in `get_clubhouse_competitions` and as tabs.
- `SELECT count(*) FROM leagues WHERE circle_id IS NULL` (and paddocks/player_boxes) = 0; `NOT NULL` constraints live.
- No code path can create a competition without a `circle_id`.

---

## Phase C — Shared spine template

**Goal:** every competition renders the same Tier-2 results header above its Tier-3 unit; the header is one component, not three.

### Functional spec

- Inside any competition, the top region is a standings/leaderboard with a consistent layout (rank · member · points), color-accented by sport, with only the point columns differing. Below it sits the sport's own unit (squad / picks / roster).

### Technical steps

1. **Extract `src/components/competition/CompetitionResultsHeader.jsx`** — a parameterized standings table taking `{ rows, columns, accent, highlightUserId }` where `columns` is a config of `{ key, label, accessor }`. Model it on `LeagueDetailView`'s grid (it's the most general — rank/name/total/optional-extra).
2. **Adopt it in all three sports:**
   - Football: replace `LeagueDetailView`'s hand-rolled standings grid with `CompetitionResultsHeader` (columns: TOT, optional H2H).
   - F1: replace `F1StandingsScreen`'s grid (columns: RACE, SEASON, TOTAL; accent `--f1`).
   - Tennis: replace `TennisLeaderboardScreen`'s grid (columns: SLAMS, MASTERS, FINALS, TOTAL; accent `--ten`).
   Keep each sport's secondary tables (e.g. tennis per-tournament breakdown, F1 race/year toggle) as-is.
3. **Behavior-preserving.** No scoring or data changes — same RPCs (`get_h2h_standings`/members, `get_paddock_leaderboard`, `useTennisLeaderboard`), same numbers, just one rendering component.

### Files touched
new `competition/CompetitionResultsHeader.jsx`; `LeagueDetailView.jsx`, `F1StandingsScreen.jsx`, `TennisLeaderboardScreen.jsx`.

### Acceptance criteria
- All three standings render via the shared component; visual diff is intentional (consistent layout) but numbers/sorting unchanged.
- TDZ check passes (the shared component is imported by three screens — verify it isn't also pulled transitively into a parent that imports it directly).

---

## Phase D — Taxonomy & polish

**Goal:** one vocabulary; the top-nav-bar visual treatment from the reference mock.

### Steps

1. **Naming pass.** Replace "My Group" (sidebar) and user-facing "circle" strings with **"Clubhouse"**. Use **"Competition"** as the umbrella word on shared surfaces; keep League/Paddock/Player Box only as sport-colored labels inside Tier-3. `circle`/`circle_id` may remain in DB/code internals (don't rename the schema).
2. **Visual treatment.** Apply the reference mock's accent system and top-bar styling: `docs/platform_revision/design/screens/Multi-Sport - Coin Challenges v2.html` (Screen 7 "Group Hub" = the Clubhouse overview; canonical sport accents football `--accent`, F1 `--f1`, tennis `--ten`, gold for coins/trophies). Keep Kit Light tokens.
3. **Copy/empty states.** Single cross-sport invite ("bring a friend into the whole clubhouse"), consistent empty states.

### Acceptance criteria
- No "My Group" / user-facing "circle" strings remain (grep).
- Top bar + Overview match the mock's accent system; all Kit Light compliant.

---

## Suggested PR breakdown

| PR | Scope | Phase |
|----|-------|-------|
| 1 | `ClubhouseProvider` + merge homes (`/` → Clubhouse Overview, delete `MultiSportHomeScreen`) | A |
| 2 | Sidebar rebuild (remove SPORTS section, add Clubhouse switcher + Tier-1) | A |
| 3 | `CompetitionTopBar` + `CompetitionScreenNav` + mobile parity | A |
| 4 | `NewCompetitionFlow` + `+` wiring + demote old lobbies | B |
| 5 | Migration 216 (tennis in `get_clubhouse_competitions`) + `useActiveCompetition` location model | B |
| 6 | Migration 217 (`circle_id NOT NULL`, orphan backfill) — **approval-gated** | B |
| 7 | `CompetitionResultsHeader` extraction + adopt in 3 sports | C |
| 8 | Taxonomy + visual polish | D |

Each PR: lint + build + `platform.spec.js` + madge green; update [TRACKER.md](../TRACKER.md).

---

## Related Documents

- [CLUBHOUSE_CENTRIC_REDESIGN.md](CLUBHOUSE_CENTRIC_REDESIGN.md) — the design/vision (read first)
- [TRACKER.md](../TRACKER.md) — workstream checkboxes + approval gate
- [MULTI_SPORT_PLATFORM_ARCHITECTURE.md](MULTI_SPORT_PLATFORM_ARCHITECTURE.md) — existing multi-sport architecture
- `docs/platform_revision/design/screens/Multi-Sport - Coin Challenges v2.html` — reference mock (Screen 7 = Clubhouse)

---

Last Updated: **2026-06-29**
