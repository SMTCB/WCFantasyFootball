# Mobile-First Redesign — Implementation Plan

**Self-contained, phase-by-phase build plan for the [Mobile-First Redesign](MOBILE_FIRST_REDESIGN.md). Written to be executed in separate, dedicated sessions with no memory of the design conversation — every fact a session needs is restated here.**

---

## How to use this document

- Read the **[design doc](MOBILE_FIRST_REDESIGN.md)** first for the *why* (three tiers, the root cause, the pattern language, the invariants). This document is the *how*.
- Each phase is independently shippable as its own PR(s) into `v2`. Do phases in order (M0 → M4) — later phases assume the primitives from M0 exist.
- Before touching code in any session, read **[Cross-cutting rules](#cross-cutting-rules-read-before-any-session)** — they encode crash patterns this codebase has hit repeatedly.
- The **[Current-state reference](#current-state-reference)** captures exact file/contract facts as of 2026-06-30. Line numbers drift — `grep` to confirm before relying on one.

> **Session type:** this is **v2 platform-revision** work. Branch from `v2`, PR into `v2`, never into `main`. Per project rules, confirm session type before any git command.
>
> **Schema:** this workstream is **frontend-only — no migrations, no Edge Function changes, no DB writes.** It does not touch the [pending DB approval gate](../TRACKER.md#-pending-db--deploy-actions). If a phase ever appears to need a schema change, stop and re-scope.

---

## The end state (one paragraph)

Below the `lg` breakpoint (1024px), every screen is composed from one small set of mobile primitives and obeys three rules: **the thumb is the primary input, the deadline is the primary message, one number leads.** A `useViewport()` hook lets components choose card-vs-grid *data shapes*, not just CSS visibility. Standings and lists render as **cards** (rank · name · one lead number), never as a desktop multi-column grid — including inside the shared `CompetitionResultsHeader`, which gains a mobile card mode so all three sports fix at once. Every primary screen surfaces **one thumb-anchored primary action** tied to its deadline via a shared `<PrimaryActionBar>`. All modals and pickers use **one** `<BottomSheet>` primitive (portaled, safe-area, Kit Light). Tab strips collapse gracefully. The genuinely-broken desktop-first screens (`ChallengeScreen`, `TrophyCabinetScreen`) get real mobile DOM. Touch targets are ≥44px. The desktop layouts are untouched except where a shared component gains a mobile branch.

---

## Current-state reference

*(As of 2026-06-30, from a four-area survey. Confirm line numbers with `grep`.)*

### Responsive strategy — the whole picture

| Fact | Detail |
|------|--------|
| **Breakpoint model** | Binary `lg:` (Tailwind default **1024px**) only. `hidden lg:flex` / `lg:hidden` dual-rendering. **No `md:` tablet tier** — 768–1023px devices get the *phone* layout. Tailwind 4, no `tailwind.config.js`; theme is CSS `@theme` in `src/index.css`. |
| **JS viewport detection** | **None.** No `useMediaQuery` / `useIsMobile` / `matchMedia` anywhere in `src/`. All responsiveness is CSS `lg:` (13 files, 73 occurrences) or route-based. |
| **Route→nav** | `useActiveCompetition()` (`src/hooks/useActiveCompetition.js`) derives `{sport, competitionId}` from `pathname`. `AppLayout` picks `MOBILE_NAV` from it (football 5 / F1 5 / tennis 3 items). |
| **iOS stacking trap** | `#main-content` (`AppLayout.jsx`) has `WebkitOverflowScrolling:'touch'` + `height:'100dvh'` + `overflow-y:auto`. This creates an iOS stacking context that traps `position:fixed` children — the standing fix is `createPortal(node, document.body)` for every fixed overlay. |
| **Safe areas** | Bottom handled (`#main-content` `paddingBottom: calc(64px + env(safe-area-inset-bottom))`; bottom bar `env(safe-area-inset-bottom)`; `body` likewise; `.safe-bottom`/`.pb-safe` helpers). **Top NOT handled** — sticky mobile top bar has no `env(safe-area-inset-top)`, collides with the notch. |

### Navigation shell — `src/components/AppLayout.jsx`
- Desktop sidebar `hidden lg:flex` (static clubhouse spine, never morphs). Mobile top bar `lg:hidden sticky top-0`. Mobile bottom bar `lg:hidden fixed bottom-0` (64px, `var(--shell)`, live-pulse + unread badge).
- `MOBILE_NAV` chosen at ~line 129 from `useActiveCompetition()`. Nav arrays `FOOTBALL_NAV` / `buildF1Nav` / `TENNIS_NAV` (~lines 27–50) are **duplicated** in `CompetitionScreenNav.jsx` (`FOOTBALL_SCREENS` / `buildF1Screens` / `TENNIS_SCREENS`).
- **Redundancy:** bottom bar + `CompetitionScreenNav` (a scrollable top strip) surface the *same* screen links on mobile; `CompetitionTopBar` is a third scrollable strip (cross-competition switcher). The `+` add-competition button lives in `CompetitionTopBar` (top-of-screen, not a FAB).

### The shared standings component — `src/components/competition/CompetitionResultsHeader.jsx`
- CSS grid, **identical at all widths**. Grid template built from `[rankWidth, '1fr', ...columns.map(c => c.width ?? '52px'), actionsWidth]`. Props: `{ rows, columns, accent, highlightUserId, renderName, renderActions, loading, emptyMessage }`; each column `{ key, label, width, accessor, color?, activeAccent? }`.
- Does **not** scroll horizontally — compresses the `1fr` name column. Worst case **Tennis** (4 numeric columns `60/70/60/70` → name crushed). Consumers: `F1StandingsScreen.jsx` (3 cols, `--f1`), `TennisLeaderboardScreen.jsx` (4 cols, `--ten`), `LeagueDetailView.jsx` (desktop standings; mobile already uses bespoke cards — see below).

### Per-screen state

| Screen | Mobile today | Notes |
|--------|--------------|-------|
| `SquadScreen.jsx` | ✅ dedicated `lg:hidden` DOM; pitch tab = card list (not `PitchView`); player action menu = portaled fixed-bottom sheet | Deadline `windowKpi` is `hidden lg:block` (**invisible on mobile**); action-sheet buttons `py-2.5` ≈ 40px; fixture sub-labels `fontSize:7` |
| `LiveScreen.jsx` | ✅ best adaptive layout; desktop 2-col grid vs mobile card rows; horizontal-scroll league card strip | none major |
| `LeagueDetailView.jsx` | ✅ desktop grid via `CompetitionResultsHeader`; **mobile = bespoke card rows** (`gridTemplateColumns:'28px auto 1fr auto auto'`, H2H stacked inline) | the card pattern `CompetitionResultsHeader` should absorb |
| `LeagueScreen.jsx` | desktop `HubTabs` `hidden lg:block` / mobile `HubTabPills` `lg:hidden`; portaled roster sheet | draft deadline = top banner; no FAB |
| `HubShared.jsx` | `HubTabPills` = up to **6 scrolling pills**, `overflow-x:auto`, no priority-collapse | tabs sit off-screen behind scroll |
| `MarketScreen.jsx` | ❌ **no mobile DOM** — single responsive tree; very tall dense sticky header (KPIs + quota + search + price inputs + position tabs) | basket bar **is** a portaled fixed-bottom bar ✅; per-row BUY/SELL ~32px ❌ |
| `RecapScreen.jsx` / `RecapView.jsx` | `RecapView` has `isMobile = window.innerWidth < 1024` + separate blocks; **PlayerBreakdown table is shared & dense** (`'32px 1fr 50px 50px'`, 8–11px) | `MatchdayNav` buttons ~18px ❌ |
| `ClubhouseScreen.jsx` | `maxWidth:640` column; Overview grid `minmax(240px,1fr)` → 1 col ✅; **8-tab `TabBar` does NOT scroll** ❌ | adjacent `CircleSelector` already does `overflow-x:auto` (copy it) |
| F1 (`F1StandingsScreen`, `F1HomeScreen`, `F1RaceBetScreen`, `PaddockLobbyScreen`) | mobile-first column; native `<select>` controls ✅; bottom-of-form submits ✅ | `F1RaceBetScreen` = best primary-action placement (full-width bottom submit) |
| Tennis (`TennisLeaderboardScreen`, `TennisHomeScreen`, `TennisTournamentScreen`, `PlayerBoxScreen`) | mobile-first column; native pickers ✅ | **`TennisLeaderboardScreen`** = worst standings (4-col header + **14-col horizontal `<table>`** in `overflow-x:auto`) |
| `ChallengeScreen.jsx` (P2P) | 🔴 **no mobile DOM** — flex main + **fixed `width:256` sidebar**, nested `1fr 1fr`/`1fr 1fr 1fr` grids, `height:100%; overflow:hidden` | **"⚔ New Challenge" lives in the sidebar → unreachable on mobile.** `CreateChallengeModal` **is** a correct bottom sheet |
| `TrophyCabinetScreen.jsx` | 🔴 **no mobile DOM** — same `width:256` sidebar; non-wrapping 4-stat header; `repeat(3,1fr)` grid | "Export image →" in the sidebar |

### Design-system layer — `src/index.css`
- **Kit Light tokens** (two systems): Tailwind `@theme` (`--color-*`) + `:root` inline vars. Primary text = `--paper` (**no `--text`**). `--bg`/`--card`/`--elev`/`--rule`/`--mute`/`--gold`/`--accent`/`--shell` (the one dark element).
- **Bottom-sheet CSS already exists:** `.fk-mob-sheet` + `.fk-mob-sheet-overlay` (`position:fixed; inset:0; rgba(0,0,0,.55); z-index:9998`) + `.fk-mob-sheet-wrap` (`position:fixed; bottom:0; z-index:9999; slideUpFade`) + head/icon/title/btns sub-classes, semantic `.success/.warning/.error/.info` variants, `env(safe-area-inset-bottom)` padding. React wrapper: `src/components/messages/ActionSheet.jsx` (portaled).
- **`.ffl-btn`** sizes enforce touch targets: `--md` min-height 44px, `--lg` 52px, `--icon` 44px. The only place sizing is codified.
- **Gaps:** `--f1` / `--ten` / `--f1bg` / `--tenbg` are **referenced by 8+ components but defined nowhere** (silent invalid-CSS fallback). Skeletons reference undefined `--r-sm`/`--r-md` (defined names are `--radius-sm`/`--radius-md`). No `env(safe-area-inset-top)`.
- **Duplicate sheet:** `src/components/PlayerPickerSheet.jsx` is a second, hand-rolled bottom sheet — `className="fixed bottom-0 left-0 right-0"`, own backdrop + drag-handle, **does NOT use `createPortal`** (exposed to the iOS trap) and **does NOT use `.fk-mob-sheet`**; still uses stale dark-theme `rgba(255,255,255,…)`.
- **`createPortal` users today:** `messages/ActionSheet.jsx`, `ConfirmModal.jsx`, `ScoringInfoModal.jsx`, `NewCompetitionFlow.jsx`, `player/PlayerStatsDashboard.jsx`, `SquadScreen.jsx`, `MarketScreen.jsx`, `LeagueScreen.jsx`, `ChallengeScreen.jsx`. (`NewCompetitionFlow` is a *centred* dialog; `CreateChallengeModal` is a *bottom sheet* — same job, different pattern.)
- The `mk-*` mockup classes live only in `docs/platform_revision/design/` — never imported by the app.

---

## Cross-cutting rules (read before any session)

1. **Rolldown TDZ.** Vite v8/Rolldown crashes with `Cannot access 'X' before initialization` (production build only, not dev) when the *same module* is imported both directly by a large screen and transitively through one of its children. The new primitives (`useViewport`, `<BottomSheet>`, `<PrimaryActionBar>`, `<TabStrip>`) will be imported widely — keep each a **leaf module** (no local imports beyond React/`createPortal`), and grep a parent's imports before adding one to its child. Run `npm run build` + `npx madge --circular src/` before every PR.
2. **`createPortal` for every `position:fixed` overlay.** `#main-content`'s `WebkitOverflowScrolling:'touch'` traps fixed children on iOS. The `<BottomSheet>` and `<PrimaryActionBar>` MUST `createPortal(node, document.body)`. This is the bug `PlayerPickerSheet` currently has.
3. **Kit Light tokens only.** `--paper` = primary text (no `--text`); `--bg`/`--card`/`--elev`/`--rule`/`--mute`/`--gold`/`--accent`; sport accents `--f1`/`--ten` (define in M0); `--shell` = the one dark element. No hard-coded `rgba` scrims in new code — use/define tokens.
4. **Never `.catch()` on a Supabase query builder** — use `.then(null, handler)`.
5. **`platform.spec.js` selectors** key on `data-testid="desktop-nav"` / `"mobile-nav"` — preserve those testids when touching `AppLayout`.
6. **Behaviour-preserving where stated.** M1's `CompetitionResultsHeader` change must not alter desktop rendering, numbers, or sorting — only add a mobile branch.
7. **Definition of done per PR:** `npm run lint` clean, `npm run build` clean (TDZ check), `npx playwright test` (`platform.spec.js`) green, `npx madge --circular src/` no new cycles. Update the [Mobile-First workstream checkboxes](../TRACKER.md#mobile-first-redesign-workstream) + add a session note.

---

## Phase M0 — Foundations (primitives + token fixes)

**Goal:** build/repair the shared mobile primitives every later phase needs. Low user-visible change; high enablement. No screen is re-laid-out yet (except wiring the new sheet where the old ones already live).

### Functional spec
- A single source of truth for "what viewport am I on" usable in JS.
- One bottom-sheet component used everywhere; the two divergent implementations converge onto it.
- A reusable thumb-zone action bar + a standings card primitive, ready for M1/M3 to consume.
- The latent token/safe-area bugs are fixed (these also affect desktop, so they're safe wins).

### Technical steps

1. **`useViewport()` hook** — new `src/hooks/useViewport.js`. Single `matchMedia` per tier; returns `{ isMobile, isTablet, isDesktop, width }`. Tiers: `isMobile` `< 640`, `isTablet` `640–1023`, `isDesktop` `≥ 1024`. SSR/initial-render safe (default to desktop if `window` undefined, then correct on mount). Leaf module (imports only React). Also export `useIsMobile()` convenience (`= useViewport().isMobile`). **Use this for *data-shape* decisions** (card vs grid); keep pure show/hide as Tailwind `lg:` where a second DOM tree is cheap.

2. **Token + safe-area fixes** in `src/index.css`:
   - Define the sport accents (canonical values from the reference mock / Clubhouse redesign): `--f1: #E10600;` `--ten: #1F7A52;` (or the existing mock values — confirm against `docs/platform_revision/design/` tokens) plus `--f1bg`/`--tenbg` as `color-mix(in srgb, var(--f1) 8%, transparent)` / `…--ten…`. Grep every consumer (`CompetitionTopBar`, `CompetitionScreenNav`, `ClubhouseScreen`, `NewCompetitionFlow`, `F1StandingsScreen`, `TennisLeaderboardScreen`, `TrophyCabinetScreen`) to confirm names match.
   - Fix skeleton vars: either define `--r-sm`/`--r-md` as aliases of `--radius-sm`/`--radius-md`, or update `.ffl-skeleton--*` to the correct names.
   - Add `env(safe-area-inset-top)` handling to the sticky mobile top bar (`AppLayout.jsx`) — e.g. `paddingTop: env(safe-area-inset-top)` and bump `minHeight` accordingly. Add a `.safe-top` helper mirroring `.safe-bottom`.

3. **`<BottomSheet>` primitive** — new `src/components/shared/BottomSheet.jsx`. Wraps the existing `.fk-mob-sheet*` CSS. Contract:
   ```jsx
   <BottomSheet
     open={bool}
     onClose={fn}
     title={string}            // optional header
     variant="default|success|warning|error|info"
     dismissOnBackdrop={true}  // default
   >{children}</BottomSheet>
   ```
   - `createPortal(node, document.body)` (rule 2). Renders `null` when `!open`.
   - Overlay `.fk-mob-sheet-overlay` (backdrop click → `onClose` when `dismissOnBackdrop`), wrap `.fk-mob-sheet-wrap`, body `.fk-mob-sheet` (+ variant). Honours `env(safe-area-inset-bottom)` (already in the CSS).
   - Optional drag-handle element at top (visual). Leaf module (React + `createPortal` only).
   - **Migrate the two existing sheets onto it:** refactor `messages/ActionSheet.jsx` to render via `<BottomSheet>` (keep its public API so callers don't change), and convert `PlayerPickerSheet.jsx` to use `<BottomSheet>` (this fixes its missing-portal bug and the stale dark-theme styling). *If `PlayerPickerSheet` migration risks scope-creep, defer it to M4 and only do `ActionSheet` here — but build the primitive now.*

4. **`<PrimaryActionBar>` / FAB primitive** — new `src/components/shared/PrimaryActionBar.jsx`. A fixed, thumb-zone bar that sits **above** the 64px bottom nav on mobile. Contract:
   ```jsx
   <PrimaryActionBar
     label="Set your GW13 squad"   // the exact task
     countdown="2d 4h"             // optional deadline string
     state="action|done|locked"   // done → "Squad locked ✓", muted
     onPress={fn}
     accent="var(--accent)"       // sport color
   />
   ```
   - `createPortal(node, document.body)`; `position:fixed; bottom: calc(64px + env(safe-area-inset-bottom)); left/right:0`. Min-height 56px, full-width button ≥44px. Hidden on `lg` (this is a mobile affordance) — render only when `useIsMobile()` or via `lg:hidden` wrapper inside the portal.
   - State-aware styling per the audit (Principle 01): filled/accent when `action`, muted/check when `done`/`locked`.
   - This phase only **builds** it; M3 wires it into screens.

5. **Standings card primitive / card-mode scaffolding** — add a `variant`-aware path to `src/components/competition/CompetitionResultsHeader.jsx` *without changing desktop*: introduce an internal `isMobile = useViewport().isMobile` branch that, when true, renders each row as a **card** (rank chip · name + sub-line · one lead number, with the remaining numeric columns as small supporting chips) instead of the grid. Drive which column is the "lead" via a new optional prop `leadColumnKey` (defaults to the last column / TOTAL). Desktop path unchanged. *(M1 turns this on for all three sports and tunes per-sport.)* Keep the component a non-circular import — verify with madge since three screens import it.

### Files touched
new `src/hooks/useViewport.js`, `src/components/shared/BottomSheet.jsx`, `src/components/shared/PrimaryActionBar.jsx`; `src/index.css`; `src/components/AppLayout.jsx` (top safe-area); `src/components/messages/ActionSheet.jsx` (+ optionally `PlayerPickerSheet.jsx`); `src/components/competition/CompetitionResultsHeader.jsx` (card-mode scaffolding, off by default behaviour-preserving).

### Acceptance criteria
- `useViewport()` returns correct tiers; no `matchMedia` listener leaks (cleanup on unmount).
- `--f1`/`--ten`/`--f1bg`/`--tenbg` resolve to real colors everywhere they're referenced (inspect a rendered F1/Tennis tab); skeletons have radii; mobile top bar clears the notch on a notched device/emulator.
- `<BottomSheet>` opens/closes, portals to body, dismisses on backdrop, respects safe-area; `ActionSheet` callers behave exactly as before.
- `<PrimaryActionBar>` renders in isolation (a Storybook-less manual mount or a temporary route) in all three states; sits above the bottom nav; never overlaps it.
- `CompetitionResultsHeader` desktop output is **pixel-identical** to before (card mode not yet enabled in consumers).
- lint / build (TDZ) / `platform.spec.js` / madge all green.

---

## Phase M1 — The shared spine on mobile

**Goal:** the highest-leverage change. Turn on `CompetitionResultsHeader`'s card mode so Football, F1, and Tennis standings all become mobile cards in one stroke; kill the one true horizontal table; make tab strips collapse.

### Functional spec
- On a phone, every standings/leaderboard is a vertical stack of cards: rank · name · **one lead number**, with supporting numbers as small chips — no compression of the name column, no horizontal scroll.
- Tennis per-tournament breakdown no longer requires sideways scrolling.
- Long tab sets (Clubhouse 8, League 6) are reachable without hidden off-screen tabs.

### Technical steps

1. **Enable card mode in the three consumers** of `CompetitionResultsHeader` (scaffolding built in M0):
   - **F1** (`F1StandingsScreen.jsx`): lead = TOTAL; supporting = RACE, SEASON. Accent `--f1`.
   - **Tennis** (`TennisLeaderboardScreen.jsx`): lead = TOTAL; supporting = SLAMS, MASTERS, FINALS. Accent `--ten`.
   - **Football** (`LeagueDetailView.jsx`): it already renders bespoke mobile cards — **reconcile**: either point its mobile branch at the shared card mode (preferred, removes duplication) or leave its bespoke cards and ensure the shared card mode visually matches them. Choose one; don't ship two football card styles.
   Desktop grids stay exactly as they are.
2. **Kill the Tennis horizontal `<table>`** (`TennisLeaderboardScreen.jsx`, the per-tournament breakdown in `overflow-x:auto`, up to 14 columns). On mobile, replace with either (a) a per-player expandable card showing that player's per-tournament points as a wrapped chip list, or (b) a "select a tournament" picker that shows one tournament's column at a time. Keep the wide table on desktop if useful (gate behind `useViewport`/`lg:`).
3. **Collapsing `<TabStrip>` primitive** — new `src/components/shared/TabStrip.jsx` (leaf module). Horizontal, scroll-with-edge-fade; optional `maxVisible` → overflow tabs fold into a "More ▾" `<BottomSheet>` menu. Contract: `{ tabs: [{key,label,badge?}], activeKey, onSelect, maxVisible? }`.
   - Adopt in **`ClubhouseScreen.jsx`** `TabBar` (8 tabs — currently no scroll, clips): replace with `<TabStrip>`. This is the most visible win.
   - Adopt in **`HubShared.jsx`** `HubTabPills` (6 pills — scrolls but no collapse): replace with `<TabStrip>` so key tabs aren't stranded off-screen.

### Files touched
`F1StandingsScreen.jsx`, `TennisLeaderboardScreen.jsx`, `LeagueDetailView.jsx`, `CompetitionResultsHeader.jsx` (finalise card mode), new `src/components/shared/TabStrip.jsx`, `ClubhouseScreen.jsx`, `HubShared.jsx`.

### Acceptance criteria
- At 375px: all three sports' standings show as cards, name never truncates below readability, no horizontal scroll; numbers/sorting unchanged from desktop (same RPCs/data).
- Tennis per-tournament data is reachable on a phone without pinch/sideways-scroll.
- Clubhouse's 8 tabs and League's 6 tabs are all reachable on a phone (scroll affordance and/or "More" menu); no tab is silently clipped.
- Desktop unchanged. lint / build / `platform.spec.js` / madge green. **TDZ check matters here** — `CompetitionResultsHeader` and `TabStrip` are imported by multiple screens; confirm no new cycles and no parent/child double-import.

---

## Phase M2 — Fix the broken screens (Tier C)

**Goal:** give the two desktop-first screens real mobile DOM. These are genuinely broken at 375px today.

### Functional spec
- `ChallengeScreen` and `TrophyCabinetScreen` render as a single readable column on a phone; the fixed 256px sidebar's content folds inline (below or in a sheet); the primary action moves to the thumb zone.

### Technical steps

1. **`ChallengeScreen.jsx`:**
   - Replace the `display:flex` main + `width:256` sidebar with a responsive layout: on mobile (`useViewport`/`lg:hidden`+`hidden lg:flex`), single column; the right-sidebar content (wallet summary, "New Challenge" CTA) folds **above** or **below** the main list, or behind a `<BottomSheet>`.
   - Move the **"⚔ New Challenge"** action to a thumb-anchored `<PrimaryActionBar>` (or FAB) on mobile — it currently lives in the unreachable sidebar.
   - Collapse the nested `1fr 1fr` / `1fr 1fr 1fr` bet/stat grids to single-column (or `useViewport`-gated 2-up only on tablet+).
   - Remove the desktop-shell `height:100%; overflow:hidden` assumption on mobile so the page scrolls in document flow.
   - `CreateChallengeModal` is already a correct bottom sheet — leave it, or migrate to the shared `<BottomSheet>` for consistency.
2. **`TrophyCabinetScreen.jsx`:** same pattern — fold the `width:256` sidebar inline on mobile; make the non-wrapping 4-stat header wrap or stack; collapse the `repeat(3,1fr)` sport grid to one column (or 2-up on tablet); move "Export image →" to a reachable position.

### Files touched
`ChallengeScreen.jsx`, `TrophyCabinetScreen.jsx`. (Consumes M0's `<PrimaryActionBar>` and `useViewport`.)

### Acceptance criteria
- At 375px both screens are fully usable: no element wider than the viewport, no clipped sidebar, no horizontal scroll.
- "New Challenge" (P2P) and the trophy primary action are reachable in the thumb zone on mobile.
- Desktop layout unchanged. lint / build / `platform.spec.js` / madge green.

---

## Phase M3 — Primary-action pass

**Goal:** deliver Principle 01 ("every screen answers *what now?*") platform-wide, now that `<PrimaryActionBar>` exists.

### Functional spec
- Each key screen surfaces exactly one thumb-anchored primary action tied to its live deadline/next-step; secondary actions are demoted to tabs/inline.

### Technical steps
1. Wire `<PrimaryActionBar>` into each key screen on mobile, state-aware:
   - **`SquadScreen`** — "Set your GW{n} squad · {countdown}" → "Squad locked ✓". **Also surface the deadline countdown on mobile** — today `windowKpi` is `hidden lg:block` (invisible on phones).
   - **`MarketScreen`** — keep the existing portaled basket bar; ensure it follows the `<PrimaryActionBar>` pattern/position (it's already a good fixed-bottom bar).
   - **`LeagueScreen`** — promote the draft/transfer deadline from the top banner into the action bar (or keep the banner *and* add the bar for the action — decide per the audit's "one action" rule).
   - **F1 picks** (`F1RaceBetScreen` already bottom-submits — align it to the shared bar or leave as the reference example) and **Tennis roster** (`TennisTournamentScreen` bottom-submit — same).
2. Audit each screen for competing equal-weight CTAs; demote all but one to tabs/inline per Principle 01.

### Files touched
`SquadScreen.jsx`, `MarketScreen.jsx`, `LeagueScreen.jsx`, F1/Tennis pick screens as needed.

### Acceptance criteria
- Each listed screen shows one unmistakable thumb-zone primary action on mobile, tied to its deadline, state-aware (flips to done/locked).
- Squad deadline countdown is visible on mobile.
- No regression to desktop. lint / build / `platform.spec.js` / madge green.

---

## Phase M4 — Parity & polish

**Goal:** the long tail — the one screen with no mobile DOM, the tap-target sweep, the tablet tier, and finishing the sheet consolidation.

### Technical steps
1. **`MarketScreen.jsx` mobile DOM.** Give it a dedicated mobile layout: the very tall sticky header (KPIs + transfer quota + search + club filter + price inputs + position tabs) → progressive disclosure (e.g. a compact KPI row + a "Filters" `<BottomSheet>`), so the player list is near the top on a phone. Per-row BUY/SELL buttons → ≥44px.
2. **Tap-target sweep (≥44px).** Fix the known offenders: `RecapView` `MatchdayNav` (~18px), `MarketScreen` FILL (`fontSize:8`) and per-row buttons, `SquadScreen` action-sheet buttons (~40px). Prefer routing through `.ffl-btn` sizes or a sized primitive rather than inline styles.
3. **Finish sheet consolidation.** If not done in M0, migrate `PlayerPickerSheet` (and any remaining ad-hoc fixed sheets) to `<BottomSheet>`; standardise `NewCompetitionFlow` from a centred dialog to the bottom-sheet pattern on mobile.
4. **Tablet tier (`md`).** Add a `640–1023px` pass where it pays: two-up competition/standings cards, wider sheets, two-column forms — without showing the desktop sidebar. Use `useViewport().isTablet` for data-shape choices.
5. **Reduce dual-render cost** where cheap (optional): the hidden desktop sidebar mounts on mobile and vice-versa — not a correctness issue, just noted.

### Files touched
`MarketScreen.jsx`, `RecapView.jsx`, `PlayerPickerSheet.jsx`, `NewCompetitionFlow.jsx`, sweep across screens, `index.css`/components for tablet tier.

### Acceptance criteria
- `MarketScreen` is one-thumb usable at 375px; the list is reachable without scrolling past a full-screen header.
- No interactive target below 44px on the audited screens.
- One bottom-sheet pattern across the app.
- Tablet (768px) shows a layout that uses the width without the desktop sidebar.
- lint / build / `platform.spec.js` / madge green.

---

## Suggested PR breakdown

| PR | Scope | Phase |
|----|-------|-------|
| 1 | `useViewport` + token/safe-area fixes (`--f1`/`--ten`, `--r-*`, top inset) | M0 |
| 2 | `<BottomSheet>` primitive + `ActionSheet` migration | M0 |
| 3 | `<PrimaryActionBar>` primitive + `CompetitionResultsHeader` card-mode scaffolding (off) | M0 |
| 4 | Enable standings card mode in F1/Tennis/Football + kill Tennis horizontal table | M1 |
| 5 | `<TabStrip>` + adopt in Clubhouse + League | M1 |
| 6 | `ChallengeScreen` mobile DOM | M2 |
| 7 | `TrophyCabinetScreen` mobile DOM | M2 |
| 8 | Primary-action pass (Squad deadline on mobile + bar wiring across screens) | M3 |
| 9 | `MarketScreen` mobile DOM + tap-target sweep | M4 |
| 10 | Sheet consolidation finish + tablet tier | M4 |

Each PR: lint + build (TDZ) + `platform.spec.js` + madge green; update the [Mobile-First workstream checkboxes](../TRACKER.md#mobile-first-redesign-workstream).

---

## Related Documents

- [MOBILE_FIRST_REDESIGN.md](MOBILE_FIRST_REDESIGN.md) — the design/why-what (read first)
- [CLUBHOUSE_CENTRIC_REDESIGN_IMPLEMENTATION_PLAN.md](CLUBHOUSE_CENTRIC_REDESIGN_IMPLEMENTATION_PLAN.md) — the sibling plan this mirrors
- [FantasyKit UX Analysis](../design/screens/FantasyKit%20UX%20Analysis.html) — Finding 06 + the three principles
- [TRACKER.md](../TRACKER.md) — workstream checkboxes; `UX-DESKTOP-1` (the deferred Tier B desktop scale-up)

---

Last Updated: **2026-06-30**
