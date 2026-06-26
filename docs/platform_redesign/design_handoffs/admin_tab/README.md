# Handoff — Admin Tab redesign (Leagues area)

## Overview

This bundle is a redesign of the **ADMIN tab** inside the Leagues / Competitive Center area of the FORZAKIT fantasy-football app. The ADMIN tab is the commissioner's control panel: they trigger season-stage programs (transfer windows, drafts, allocation, cup seeding), create bets for the league, resolve pending bets, and run utilities like score recalculation.

The redesign prioritises **functional clarity over decoration**. Every control says *what it does*, *when it's safe to run*, and *what changes after* it runs. The headline workflow — **creating a bet** — has been reorganised from a single dense form into a guided 4-step wizard with a live preview of exactly what managers will see.

Two layouts are included:
- **Desktop** — 1440 wide. Two-column body: Create-Bet wizard (left, 60%) + Resolve-Pending list (right, 40%). Lifecycle ops as a 4-up card grid below.
- **Mobile** — 390 wide. Everything stacks vertically. Wizard becomes an accordion (only the active step expanded). Lifecycle ops are collapsible cards.

---

## About the design files

The files in this bundle are **design references created in HTML/JSX prototypes**, not production code to copy line-for-line. The task is to **recreate these designs in the target codebase's existing environment** (React, Vue, SwiftUI, native, etc.) using its established patterns, libraries, and design tokens — or, if no environment exists yet, to choose the most appropriate framework for the project and implement the designs there.

The JSX in these files uses inline `style={…}` objects and design tokens declared as CSS variables (`var(--cyan)`, etc.). When you implement, prefer the codebase's own styling primitives (Tailwind, styled-components, CSS modules, native equivalents…). The tokens are listed in **Design Tokens** below.

---

## Fidelity

**High-fidelity.** Pixel-perfect mockups with final colours, typography, spacing, copy, and interaction states. The developer should recreate the UI pixel-perfectly using the codebase's existing libraries and patterns, mapping the tokens listed below to the codebase's own design-system equivalents.

---

## Files in this bundle

| File | Purpose |
|---|---|
| `Admin Tab Preview.html` | Open this in a browser to see desktop + mobile artboards rendered side-by-side. |
| `league-admin.jsx` | Desktop admin tab. Defines `<AdminTab/>` and all its subcomponents. **Primary reference.** |
| `league-mobile-admin.jsx` | Mobile admin tab. Defines `<MobAdmin/>` and its subcomponents. **Primary reference.** |
| `league-shared.jsx` | Shared chrome used by the desktop admin (`HubTopbar`, `HubActionBar`, `HubTabs`, `MgrTag`, `HubSectionLabel`). The admin tab inherits these so changes are scoped. |
| `league-mobile-shared.jsx` | Shared chrome for mobile (`PhoneShell`, `AppTopbar`, `HubLeagueHeader`, `HubTabPills`, `MobSection`). The admin tab inherits these too. |
| `league-data.jsx` | Mock data — `LH_BETS`, `LH_MANAGERS`, `lhMgrById` — referenced by the Resolve-Bets list. |
| `tokens.css` | Design tokens (colours, spacing, radii). The canonical source for hex values. |
| `squad-shared.css` | Utility classes used across the app (`.fk-display`, `.fk-mono`, `.fk-eyebrow`). |
| `design-canvas.jsx` | The canvas component that frames the artboards in the preview. Not part of the design itself. |
| `LOGIC.md` | **Behaviour spec.** New rules, state transitions, validation, and changed semantics introduced by the redesign. Read this before implementing. |

---

## Screens / Views

### 1. Desktop — `<AdminTab/>`

**1440 × 1640. Single scrollable view, no internal scrolls.**

The tab inherits the shared chrome (`HubTopbar` + `HubActionBar` + `HubTabs` with `active="admin"`) and adds three zones, top to bottom:

#### Zone A — Season-state stepper (`<SeasonStepper/>`)
- Full-width bar at the top of the tab body. Background `--ink-2`, bottom rule `--rule`.
- Heading row (height ~30px): purple 3×14 accent + mono label `"COMMISSIONER CONTROLS"` (paper, 11px, .22em tracking) + dim subtitle `"· ADMIN ONLY · CHANGES TAKE EFFECT IMMEDIATELY"` + right-aligned league summary `"OFFICE HEROES · 14 MGRS · GW28"`.
- 5 phases laid out as equal columns: `TRANSFER WINDOW`, `DRAFT DEADLINE`, `ALLOCATION`, `CUP SEEDED`, `IN SEASON · GW28`.
- Each phase: 28×28 circle (filled-positive for done, outline-cyan for active, outline-mute for todo) → 1px connecting line at circle-centre → mono label coloured to match → sub-status in mute.
- Active phase shows a `● YOU ARE HERE` chip below.

#### Zone B — Bet management (two columns, 1.4fr / 1fr)

**Left column — `<CreateBetWizard/>`**
1. Section header (`HubSectionLabel`): cyan accent, label `"CREATE BET"`, sub `"A new prediction for the league"`, right-side `"↻ RESET"` ghost button.
2. **Step rail** — 4 equal cells. Each cell: numbered circle (filled-positive if done, outline-cyan if active, outline-mute if locked) + `STEP n` eyebrow + step label. Active step shows a 2px underline in cyan. Clicking a reached step jumps to it.
3. **Body** — two columns inside this column (`1fr 320px`):
   - **Form** (left, padded 22/24): only the active step's content is shown.
     - **Step 1 — TYPE.** Three bet-type cards in a 3-column grid: each card is 30×30 monogram (cyan ◉ / positive ◈ / danger ⛌) over Archivo-Black label, short hint, and `● SELECTED` / `CHOOSE →` footer chip. Selecting populates the rest of the wizard's defaults.
     - **Step 2 — CONFIGURE.** A 2-column fixture grid (radio behaviour), then type-specific extras (Top-Scorer = player chip pool; Player-Block = single-select dropdown; Match-Result = auto-options notice).
     - **Step 3 — REWARD.** Two-column row: reward stepper (minus / +N / plus, +N in positive 18px Archivo Black) and a Picks-Lock-At text input. Below: title input with the auto-derived title as placeholder.
     - **Step 4 — PUBLISH.** Stacked summary rows (140px label + value). Then a gold note about the 14-manager notification. Then the action row: ghost `← BACK` + full-width positive `PUBLISH BET →`.
   - **Preview** (right, 320px wide, background `--ink-2`): `<BetCardPreview/>` — a miniature of the BetRow managers will see in their BETS tab. Updates live as the form fills.
4. **NextBar** at the bottom of each step: shows ghost back button + filled cyan `NEXT →` (or disabled inkblock if the step isn't complete).

**Right column — `<ResolvePendingBets/>`**
1. Section header (`HubSectionLabel`): gold accent, label `"RESOLVE BETS"`, sub `"N PENDING · WAITING ON YOU"`, right `"AUTO-RESOLVE IS OFF"`.
2. Inline help paragraph (mute, 11px).
3. Stack of bet cards, one per pending bet. Each card: 3px left border tinted to the bet type, expandable header. Expanded state reveals:
   - **Who picked what** — option label + monogram badges (`<MgrTag/>`) for each manager that picked it + right-aligned count.
   - **Answer** field — chip buttons (one per option). Picked = positive border + check.
   - Footer row: `AWARDS +N PTS TO M MANAGERS` lead-in (mute, mono) + ghost `VOID` + filled gold `RESOLVE →`.

#### Zone C — Lifecycle operations (`<LifecycleOps/>`)
- Section header: purple accent, label `"LIFECYCLE OPERATIONS"`, sub `"SEASON-STAGE CONTROLS"`.
- 4-column grid of cards, each ~240px min height:
  1. **TRANSFER WINDOW** (status `CLOSED`, danger tone) — Opens/Closes inputs side-by-side, Limit input, paired buttons `OPEN` (positive) and `CLOSE NOW` (danger outline).
  2. **DRAFT** (status `DEADLINE SET · 15 MAR`, positive) — Deadline input, ghost `SET DEADLINE` button, divider, mono spec line, gold `RUN ALLOCATION ↯` button.
  3. **CUP PHASE** (status `UNSEEDED`, warn) — Mono info block (`20 CLUBS · 14 MGRS`), purple `SEED CUP CLUBS ↯` button.
  4. **SCORE RECALCULATION** (status `UTILITY · ON-DEMAND`, mute) — Fixture ID input, last-run info block, warn `RECALCULATE SCORES ↯` button.
- Every card carries a `WHEN TO RUN · …` hint block above the primary button.

### 2. Mobile — `<MobAdmin/>`

**390 × 2400. One scrollable column.** Inherits `<PhoneShell/>` → `<AppTopbar/>` → `<HubLeagueHeader/>` → `<HubTabPills active="admin"/>` (admin pill added to the existing 7-tab pill row).

Vertical sequence:
1. **`<MobSeasonStepper/>`** — same 5-phase stepper, compressed: 22×22 dots, 8px labels, no "you are here" chip.
2. **`<MobCreateBet/>`** — accordion wizard. Each step is a button-header (step number + label + summary of completed value) that toggles to reveal the form. Only the active step is expanded. Same rules and defaults as desktop. The preview lives inside Step 4.
3. **`<MobResolveBets/>`** — vertical list of pending bets. Each card expands inline to show monograms + answer chips + RESOLVE button.
4. **`<MobLifecycle/>`** — 4 stacked collapsible cards (`<MobLifecycleCard/>`). Each card shows title + status pill in the header; expanded body shows inputs, a `WHEN · …` hint, and the action button.

Hit targets are ≥44px tall throughout. Inputs span full width.

---

## Interactions & Behaviour

See **`LOGIC.md`** for the full behaviour spec — state transitions, validation, preconditions, side effects.

Quick summary:
- **Create Bet wizard** is linear with backward-jumping allowed. Forward steps unlock as preconditions are met (e.g. Step 3 requires a fixture; Step 4 requires reward & lock time).
- **Bet types** drive Step 2's content: Top-Scorer shows a player chip pool, Match-Result auto-generates options, Player-Block requires a single block target.
- **Live preview** updates on every keystroke / pick. Title falls back to an auto-derived string when the title input is empty.
- **Resolve flow**: only one card expanded at a time; selecting an answer enables the `RESOLVE` button; `RESOLVE` awards points and notifies the league.
- **Lifecycle ops** are independent and idempotent except where noted in LOGIC.md (`RUN ALLOCATION` and `SEED CUP CLUBS` are one-way per season and must show a confirm dialog before firing).

---

## State Management

Per-component React state used in the prototype:

**`<CreateBetWizard/>`** (and `<MobCreateBet/>`)
- `step: number` — 1..4
- `type: 'top-scorer' | 'match-result' | 'player-block' | null`
- `fixture: string` (fixture id) | ''
- `players: string[]` (top-scorer pool; default: 5 popular forwards)
- `blockPlayer: string` (block target) | ''
- `reward: number` (default 5)
- `closes: string` (locks-at, free-text in the prototype; in production should be a `Date`)
- `title: string` ('' falls back to auto-derived title)

**`<ResolvePendingBets/>`** (and `<MobResolveBets/>`)
- `open: string | null` — id of the currently expanded bet
- `answer: Record<betId, optionString>` — selected winning option per bet

**`<MobLifecycleCard/>`** — local `open: boolean` per card.

In production these should map to whatever state container the codebase uses (Redux slice, Zustand store, React Query mutations, etc.). The wizard state is local until the final PUBLISH — it does not need to be persisted between sessions.

---

## Design Tokens

Source of truth: `tokens.css`. The redesign uses only tokens already declared there — no new colours or scales.

### Colours

| Token | Hex | Role in the admin tab |
|---|---|---|
| `--ink` | `#080A0E` | Page background |
| `--ink-2` | `#0F1218` | Card / panel background |
| `--ink-3` | `#161B25` | Disabled button surface |
| `--rule` | `#1E2530` | All borders, dividers, separators |
| `--paper` | `#F2EEE5` | Primary text, filled-button text on light buttons |
| `--mute` | `#8B95A1` | Secondary text, hint copy, disabled label |
| `--cyan` | `#00B4D8` | Configure / safe-action / active wizard step / Top-Scorer type |
| `--gold` | `#E0A800` | One-way / season-changing actions (RUN ALLOCATION, RESOLVE) |
| `--positive` | `#22C55E` | Open / publish / completed states / Match-Result type |
| `--warn` | `#F59E0B` | Caution / unseeded / utility action |
| `--danger` | `#EF4444` | Close / halt / Player-Block type |
| `--pos-gk` / `var(--purple)` | `#A855F7` | Lifecycle / cup-phase / commissioner accent |

### Typography

Three families. **Do not introduce others.**

| Family | Usage |
|---|---|
| `Archivo Black` | Display headings, button labels, value emphasis. Letter-spacing `-0.02em` for titles, `-0.01em` for labels. |
| `Archivo` (400/500/600/700/800/900) | Body copy. 11–14px for cards, 13–16px for prominent content. Line-height 1.4–1.5. |
| `JetBrains Mono` (400/500/600) | All eyebrows, status pills, mono ticks, table headers. Letter-spacing `.14em`–`.22em`. Uppercase. |

### Spacing

4px base scale (from `tokens.css`): `--s-1: 4`, `--s-2: 8`, `--s-3: 12`, `--s-4: 16`, `--s-5: 20`, `--s-6: 24`, `--s-7: 32`, `--s-8: 40`.

Common patterns:
- Section header padding: `12px 20px–24px`.
- Card body padding (desktop): `14px–22px`.
- Card body padding (mobile): `12px–16px`.
- Gap inside stacked groups: `8–14px`.

### Radii

**Sharp UI.** `--r-sm: 2px`, `--r-md: 4px`, `--r-lg: 8px`. The redesign uses **no radius at all** on most surfaces — borders are hard. Only avatar/monogram chips and circular step indicators use `border-radius: 50%`.

### Borders & accents

- Hairline rules: `1px solid var(--rule)`.
- Card "type accents": `border-left: 3px solid <tone>` (the bet-card preview, resolve cards, lifecycle cards on mobile).
- Section header accents: `3 × 12–14px` solid vertical bar in the section's tone colour.

### No shadows

The system is explicitly flat. No box-shadows are used in the admin tab. Depth is communicated by surface (ink → ink-2 → ink-3) and borders.

---

## Assets

No raster assets, icons, or fonts are bundled. Glyphs used in the prototype:
- `◉` (top-scorer) — Unicode `U+25C9`
- `◈` (match-result) — Unicode `U+25C8`
- `⛌` (player-block) — Unicode `U+26CC`
- `✓` (completed step / picked option) — Unicode `U+2713`
- `↯` (action lightning) — Unicode `U+21AF`
- `●` (status pulse) — Unicode `U+25CF`

If your codebase has an icon system, substitute equivalent icons. Suggested replacements: `target`, `flag`, `shield-off`, `check`, `zap`, `circle-filled`.

---

## Open questions for the developer

1. **Date/time pickers.** The prototype uses plain text inputs for `OPENS`, `CLOSES`, `DEADLINE`, and `LOCKS AT` to stay framework-agnostic. Wire these to the codebase's native date-time picker.
2. **Fixture / player lookup.** The prototype hard-codes `MOCK_FIXTURES` and `MOCK_PLAYERS`. In production, these should fetch the current gameweek's fixtures and an active-player roster from the data layer.
3. **Confirmations.** `RUN ALLOCATION`, `SEED CUP CLUBS`, and `CLOSE NOW` are not yet wrapped in a confirm dialog in the prototype. The behaviour spec (LOGIC.md) requires them to be.
4. **Permissions.** The tab assumes the viewer is the commissioner. The route should guard on role; non-admins should not see the tab at all (the `⚙ ADMIN` pill should not render for them).
