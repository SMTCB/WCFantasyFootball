# Handoff: Tennis Module (Player's Box, Tournament, Leaderboard, ATP Finals)

## Overview
Design pass for FantasyKit/Frontrow's Tennis module — a season-long prediction game (tiered roster picks, no live squad management) that plugs into a Clubhouse alongside Football and F1. Covers: Tennis Home (season calendar + action banner), the Tournament screen in each of its states (roster picker, locked squad, QF Captain picker, final score, waiting states), the season Leaderboard, and the ATP Finals prediction slate. Aligned to the same Kit Light system already shipped for the Clubhouse core (sidebar, top bar, card language, type system) — nothing about global chrome changes for Tennis; only a 2-item in-competition nav (Home / Leaderboard) is new.

## About the Design Files
The file in this bundle — `Tennis Module Redesign.html` — is a **design reference built in HTML**, a pannable canvas of static, high-fidelity mockups (open it in a browser; pan/scroll to see all 7 screen sections). It is **not production code**. The task is to recreate these designs in the target codebase's existing environment (a React codebase per the product's other handoffs) using its existing component patterns and data — not to ship this HTML directly.

## Fidelity
**High-fidelity.** Exact colors, typography, spacing, and component states are final. Copy (player names, scores, dates) is placeholder/sample data — wire to real data sources. Player names are intentionally fictional (not real ATP players).

## Screens

### T-01 — Tennis Home (`/tennis`)
**Purpose:** season overview, the tab a user lands on daily.
**Layout, desktop:** existing 220px sidebar + top competition-pill bar (Wimbledon '26 Box pill active, green dot + 2px green bottom border) → `seashdr` header (4px green left accent bar, eyebrow "🎾 TENNIS · 2026 ATP SEASON", box name as H1, member count + invite chip) → 2-item secondary nav (`Home` / `Leaderboard`, green underline on active) → body: **action banner** (only rendered when a roster/captain window is open — solid `--ten` fill, white text, disappears entirely otherwise) → season standings snapshot (top 5, Slams/Masters/Total columns, medals top 3, "View full table" link) → 14-row season calendar.
**Calendar row anatomy:** surface-colour dot (hard `--hard` #3D6EA5 / clay `--clay` #C1622D / grass `--ten` / indoor `--indoor` #6B5B95) → tournament name → type badge (Grand Slam = gold tint, Masters 1000 = neutral `--elev` tint, Season Finale = green tint) → dates (mono) → status pill (`upcoming` = muted grey, `open` = solid green "Pick your squad", `progress` = accent-tinted "In progress", `captain` = solid gold "Pick Captain", `done` = outlined "Completed" + a result tag, e.g. "QF", "🏆 Champion") → "✓ Squad set" chip once picked. Upcoming (not-yet-open) rows are dimmed to 42% opacity and non-interactive.
**Mobile (390px):** sticky top strip → competition pill bar → light season header → 2-item nav pills → single scrolling column (banner, condensed standings, condensed calendar) → 3-item bottom nav (`Home · Table · Club` — notably fewer than Football/F1, no live/market tab).

### T-02 — Tournament: Roster Picker
**Purpose:** build the 7-player tiered squad before a tournament starts. The richest interaction in the module.
**Layout:** tournament header (name, surface dot, dates, live countdown to picks-close) → body: **four independent tier blocks** (never one long scrolling list) — Tier 1 (Seeds 1–4, 1 slot), Tier 2 (Seeds 5–16, 2 slots), Tier 3 (Seeds 17–32, 2 slots), Tier 4 "Dark Horses" (unseeded, 2 slots). Each tier block: header (tier number, seed range, "N of N picked" counter) + player rows (seed badge, country swatch, name, Pick/Picked button). A player already picked in another tier shows `used elsewhere` at 38% opacity and is not selectable. Right rail (300px, sticky): **roster summary** — a progress bar, then each tier's filled/empty slots, then the **Ace Card** grid below the tiers (4 cards: Underdog Boost, Safety Net, Surface Specialist, Dark Horse Insurance — single-select, a card already used once this season shows `used` at 35% opacity), then a full-width "Lock in squad →" primary CTA (solid `--ten`).
**Mobile:** roster summary collapses to a compact chip row pinned above the tier lists; Ace Card grid and Lock CTA appear at the end of the scroll.

### T-03 — Tournament: Locked Squad (read-only) + waiting states
**Purpose:** once picks lock, the same 4-tier structure becomes read-only status tracking.
**Layout:** same tier blocks, but each player row now shows a round-reached tag instead of a pick button — `alive` (green tint, mid-tournament), `out` (red-outline, e.g. "Out · R16"), or `champ` (gold tint, "🏆 Champion"). A gold star marks the captain if one was set. The played Ace Card surfaces as a tag in the tournament header, not buried in a row.
**Two quiet waiting states** (shown as their own small artboards): "roster not yet open" (players haven't been seeded yet) and "in progress, no QF window yet" (squad locked, waiting for 8 players to remain) — both a single centered card, muted icon + one-line explanation, deliberately low-key.

### T-04 — Tournament: QF Captain Picker
**Purpose:** once 8 players remain in a non-Grand-Slam-final-format tournament, a 48-hour window opens to pick one surviving roster player as captain (2× points for the rest of the tournament).
**Layout:** urgent banner — **gold, not red/danger** (danger is reserved for destructive actions elsewhere in the product) — with a live countdown ("48 hours" window) → radio-style list of only the surviving roster players (name, seed, tier, "Alive · QF" tag) → full-width gold "Confirm captain →" CTA. High-stakes and time-boxed without borrowing the danger-red vocabulary.

### T-05 — Tournament: Final Score Card
**Purpose:** once a tournament completes, show the total broken into its components.
**Layout:** centered hero card — big total number in `--ten`, then three breakdown pills side by side: `BASE`, `ACE CARD BONUS`, `CAPTAIN BONUS`.

### T-06 — Leaderboard (`/tennis/leaderboard`)
**Purpose:** full season standings.
**Layout, desktop:** standings table — columns `#`, Manager, Slams, Masters, Finals, Total, Played — medals for top 3, the user's own row tinted green. A **Masters Drop Rule note** (gold-tinted banner, not a tooltip) sits directly above the table once 5+ of the 9 Masters 1000 events are complete: "only your best 4 Masters results count toward Total."
**Mobile:** the matrix table is replaced — not just reflowed — with per-manager cards, each showing a row of colour-tinted round-reached chips (gold = final/champion, green = deep run, accent = mid-tournament, red = early exit) instead of table cells.

### T-07 — ATP Finals (`/tennis/finals`)
**Purpose:** the season's one-off format — 8 players, group stage into knockout, predict every match winner rather than pick a squad.
**Layout:** left rail — a standing **scoring tiers reference card**, always visible while picking: 5 named, escalating tiers from "Unforced Error" (1–5/15 correct → 250 pts) to "🏆 The Perfect Slate" (15/15 → 7,500 pts). Right column — Group Stage (12 two-player match-toggle picks, submitted together; once results land, options show `correct` green / `wrong` red-and-faded states) then Knockout (2 semis + final, greyed out and locked until the group stage locks).

## Interactions & Behavior
- **Action banner** on Home: conditionally rendered only when a roster-pick window or QF-captain window is currently open for any tournament in the box; otherwise omitted entirely (not hidden via `display:none` — genuinely absent).
- **Calendar rows**: only rows with status `open`, `progress`, or `captain` are clickable/interactive; `upcoming` rows are inert.
- **Roster picker**: selecting a player fills the corresponding tier slot in the sticky summary immediately; picking a player already used in a different tier is prevented (button reads "Used elsewhere", not clickable). Ace Card is single-select across the 4 types; a type already played once this season is disabled.
- **QF Captain picker**: only players still alive in the draw appear as options; confirming replaces any previously-set captain for that tournament.
- **ATP Finals**: knockout picks are locked (visually greyed, non-interactive) until all 12 group-stage picks are submitted and the group stage's own lock time passes.
- **Naming:** use "Dark Horse Insurance" exactly — do not use "Qualifier Insurance," which appears in some QA docs but not the shipped UI.

## State Management
Tournament-level state machine (per tournament, drives which of T-02/T-03/T-04/T-05 renders): `upcoming` (locked out) → `roster_open` (T-02) → `in_progress_locked` (T-03 waiting state) → `qf_captain_open` (T-04, only for non-Grand-Slam-final formats, opens once 8 players remain, 48h window) → `completed` (T-03 read-only + T-05 score card). ATP Finals runs its own parallel state: `not_seeded` → `group_open` → `group_locked_knockout_open` → `complete`.
Per-user state needed: `roster: {tier1: [...], tier2: [...], tier3: [...], tier4: [...]}`, `aceCard: {type, tournamentId} | null` (validate one-per-type per season), `captain: {playerId, tournamentId} | null`, `finalsGroupPicks: [...]`, `finalsKnockoutPicks: [...]`.

## Design Tokens
Same reconciled Kit Light tokens as the Clubhouse Core handoff — see that bundle's README for the full table. Values used directly in this module:

| Token | Hex | Usage here |
|---|---|---|
| `--bg` | `#F7F3ED` | Page background |
| `--card` | `#FFFFFF` | Card surfaces |
| `--elev` | `#EDEAE2` | Elevated chips, upcoming-status pills |
| `--shell` | `#18202E` | Sidebar (global chrome, unchanged) |
| `--paper` | `#18202E` | Primary text |
| `--mute` | `#8A97A8` | Secondary text, dates, labels |
| `--rule` | `#E2DDD5` | Borders/dividers |
| `--accent` | `#1A6FA8` | "In progress" status only (kept neutral/blue here on purpose) |
| `--gold` | `#B8720E` | Captain, QF Captain urgency, Grand Slam badge, Perfect Slate tier |
| `--positive` | `#166534` | Alive/positive round-reached tags |
| `--danger` | `#B91C1C` | Eliminated tags, wrong-pick states (never used for urgency here) |
| `--ten` | `#1B7A52` | Tennis primary identity — action banner, pick buttons, active nav, roster progress fill |

New, module-local (not in the shared token table — add alongside `--ten` if adopted elsewhere):
| Token | Hex | Usage |
|---|---|---|
| `--hard` | `#3D6EA5` | Hard-court surface indicator |
| `--clay` | `#C1622D` | Clay-court surface indicator |
| `--indoor` | `#6B5B95` | Indoor-court surface indicator |

**Design decision on green usage:** the brief asked whether Tennis should lean into `--ten` throughout (the way F1 leans into red) or stay quieter. We chose quieter — green is reserved for primary actions and identity (action banner, pick buttons, active nav underline, progress fill), never for dense data or decoration. Captain/urgency states use gold instead, so QF Captain reads as its own distinct moment.

**Type:** Archivo Black (headings), Archivo 400–600 (body), JetBrains Mono (eyebrows/labels, uppercase, letter-spaced). Radius 6px throughout.

## Assets
No raster assets. Surface indicators, seed badges, medals, and round-reached tags are all CSS + Unicode glyphs (🏆, ★, ✓). Country indicators in the roster picker are flat colour swatches, not real flags — replace with an actual flag/country-code component in production.

## Files
- `Tennis Module Redesign.html` — all 7 screen sections (T-01…T-07), desktop + mobile where applicable, on a pannable canvas. Open directly in a browser.

## Related
This bundle assumes the Clubhouse Core handoff (sidebar, top bar, card system, Frontrow rebrand) is already implemented — Tennis screens sit inside that same shell and do not redefine it.
