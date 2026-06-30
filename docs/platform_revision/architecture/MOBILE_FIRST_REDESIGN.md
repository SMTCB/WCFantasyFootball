# Mobile-First Redesign — Experience, Flow & Interaction

**Target experience for the multi-sport platform on phones and tablets: stop treating mobile as a CSS afterthought of a desktop DOM. Make the thumb the primary input, the deadline the primary message, and one card-based, bottom-sheet-driven pattern language the single way every screen renders below `lg`. Most fantasy management happens on a phone during a commute — the most-used breakpoint currently gets the least-considered layout.**

---

## Quick Navigation

- **For the why** → [The Problem](#the-problem) · [The Real Root Cause](#the-real-root-cause)
- **For the what** → [The Unifying Concept](#the-unifying-concept) · [The Mobile Pattern Language](#the-mobile-pattern-language-the-shared-spine) · [Invariants](#invariants-this-redesign-enforces)
- **For the where** → [Surface-by-Surface State](#surface-by-surface-current-state)
- **For sequencing** → [Phased Delivery](#phased-delivery)

---

## Context / Overview

The v2 platform is feature-complete and, after the [Clubhouse-Centric Redesign](CLUBHOUSE_CENTRIC_REDESIGN.md), structurally coherent on desktop. This document is the **mobile counterpart** to that work. It is grounded in two inputs:

1. **The design audit** — [FantasyKit UX Analysis](../design/screens/FantasyKit%20UX%20Analysis.html), Finding **06 "Mobile is a shrunk desktop"** and the three behavioural principles it opens with (every screen answers *"what now?"*; teach in context; one number leads). That audit proposed the *direction* (cards, bottom tab bar, strip tabs, thumb-reachable action). This document turns the direction into an **architecture**, anchored to the actual code.
2. **A current-state survey** (2026-06-30) across the navigation shell, the football core screens, the multi-sport screens, and the design-system layer. Every claim below cites a real file.

**Scope:** the responsive strategy, the mobile navigation model, the reusable mobile primitives, and the per-surface layout/interaction patterns below the `lg` breakpoint (phones + tablets). **Not in scope:** scoring, betting economics, or any backend logic; sport rules; the desktop layouts (they stay as-is except where a shared component gains a mobile mode).

**Guiding principle (from the audit):** *rebuild for the thumb, not the spreadsheet.* Mobile gets its own patterns **from the same Kit Light system** — not a scaled-down table.

---

## The Problem

The survey found that mobile quality is **inconsistent by screen, not uniformly bad** — and that inconsistency is itself the headline problem. Three distinct tiers coexist, with no shared contract between them:

| Tier | Screens | What they do on a phone | Verdict |
|------|---------|--------------------------|---------|
| **A — Genuinely mobile-adapted** | `SquadScreen`, `LiveScreen`, `LeagueDetailView` | Dedicated mobile DOM (`lg:hidden` / `hidden lg:block`), card rows instead of tables, `createPortal` bottom sheets for actions | ✅ This is the quality bar — it already exists |
| **B — Mobile-first column that never scales up** | `ClubhouseScreen`, all F1 screens, all Tennis screens | Single inline-styled column capped at `maxWidth: 480–700px`, centred. Reads fine on a phone but is a narrow ribbon on desktop. **The critique is *inverted* here: desktop is a stretched phone.** | ⚠️ Works on mobile, wrong on desktop |
| **C — Desktop-first, broken on a phone** | `ChallengeScreen` (P2P/coins), `TrophyCabinetScreen` | Hard-coded two-column layout: flexed main column **+ fixed `width: 256px` sidebar**, nested `1fr 1fr` / `1fr 1fr 1fr` grids, `height:100%; overflow:hidden` desktop-shell assumption. **No mobile fallback at all.** | 🔴 Literally broken at 375px |

> **Scope note on Tier B:** the Tier B screens' *desktop* deficiency (a narrow centred ribbon that wastes a wide screen) is **logged as a follow-up, not addressed by this workstream** — it is the inverse of mobile optimization and would mean editing F1/Tennis/Clubhouse *desktop* DOM. This redesign touches Tier B only to fix its *mobile* gaps (collapsing tab strips, card standings, thumb-anchored actions). Desktop scale-up is a separate, future decision.

Concrete causes, as they exist today:

| # | Symptom | Where it lives |
|---|---------|----------------|
| 1 | **No mobile DOM on the P2P/Trophy screens.** A fixed 256px sidebar + flexed main + gap leaves ~95px for content at 375px. The single most important P2P action — **"⚔ New Challenge"** — is buried *inside that desktop-only sidebar*, effectively unreachable on a phone. | `ChallengeScreen.jsx` (sidebar `width:256`, "New Challenge" button in it); `TrophyCabinetScreen.jsx` (same `width:256` sidebar pattern) |
| 2 | **The shared standings spine has no mobile card mode.** `CompetitionResultsHeader` (extracted in the Clubhouse redesign's Phase C, now used by all three sports) is a **fixed multi-column CSS grid, identical at every width**. It doesn't scroll — it compresses the flexible name column. Tennis pushes it to **4 numeric columns** (`SLAMS/MASTERS/FINALS/TOTAL`); on a 375px phone the manager name is crushed to ~50px and truncates. The redesign's own shared component propagates the dense-table problem to every sport. | `CompetitionResultsHeader.jsx` (grid template, no breakpoint); consumers `F1StandingsScreen.jsx`, `TennisLeaderboardScreen.jsx` |
| 3 | **One genuine horizontal-scroll wide table.** Tennis per-tournament breakdown is a real `<table>` in `overflow-x:auto` with up to **14 columns** (one per ATP event). The classic "pinch-and-scroll to reach the numbers" anti-pattern. | `TennisLeaderboardScreen.jsx` (per-tournament `<table>`) |
| 4 | **Primary actions live at the top, the thumb zone holds only navigation.** There is **no FAB anywhere** in the app. The deadline countdown — the most consequential thing in fantasy — is surfaced top-of-page (League draft banner) or **desktop-only** (`SquadScreen` `windowKpi` is `hidden lg:block`, so mobile users never see the transfer countdown in the header). The bottom 64px is occupied purely by tab links. | `AppLayout.jsx` bottom bar (nav-only); `SquadScreen.jsx` (`windowKpi` desktop-only); `CompetitionTopBar.jsx` (`+` is a top-strip button, not a FAB) |
| 5 | **Tab strips don't collapse.** Clubhouse's main `TabBar` renders **8 equal-flex tabs** (HOME / THE FRONTROW / RECAP / CHAT / INBOX / MEMBERS / FIND / SETTINGS) with **no horizontal scroll** at `fontSize:10` — labels clip on a phone. League's `HubTabPills` puts up to **6 scrolling pills** with no priority-collapse, so key tabs sit off-screen behind a sideways scroll. | `ClubhouseScreen.jsx` (`TabBar`, no scroll); `HubShared.jsx` (`HubTabPills`) |
| 6 | **Two divergent bottom-sheet implementations.** A clean, reusable one (`messages/ActionSheet.jsx` + the `.fk-mob-sheet*` CSS system, portaled, safe-area, semantic variants) **and** a hand-rolled `PlayerPickerSheet.jsx` that does **not** use `createPortal` (exposed to the iOS stacking-context bug) and still uses stale dark-theme `rgba(255,255,255,…)` styling. `NewCompetitionFlow` is a *centred* dialog while `CreateChallengeModal` is a *bottom sheet* — same job, different pattern. | `messages/ActionSheet.jsx`, `PlayerPickerSheet.jsx`, `NewCompetitionFlow.jsx`, `ChallengeScreen.jsx` |
| 7 | **Sub-44px tap targets** in hot paths: Market per-row BUY/SELL (~32px), Recap `MatchdayNav` buttons (~18px), Market FILL (`fontSize:8`), Squad action-sheet buttons (`py-2.5` ≈ 40px). Touch-target sizing is codified **only** inside the `.ffl-btn` system (44/52px), unused by most inline-styled controls. | `MarketScreen.jsx`, `RecapView.jsx`, `SquadScreen.jsx` |
| 8 | **Latent token bugs that disproportionately hurt mobile surfaces.** Sport accents `--f1` / `--ten` (and `--f1bg` / `--tenbg`) are **referenced by 8+ components but defined nowhere** — they resolve to invalid CSS and silently fall back. The notched-device **top safe-area inset is not handled** (`env(safe-area-inset-top)` absent) so the sticky mobile top bar collides with the status bar. Skeletons reference undefined `--r-sm`/`--r-md`. | `index.css` (missing `--f1`/`--ten`, no top inset); `AppLayout.jsx` (sticky top bar) |

---

## The Real Root Cause

The problem is **not** "we wrote bad mobile layouts." Tier A proves the team can build excellent mobile UX. The problem is that **the good mobile patterns were never extracted into an enforced, reusable pattern language** — so mobile quality is *accidental*, decided screen-by-screen by whoever built it and when.

> **There is no shared mobile contract. Each screen — or each era of development — invented its own width strategy.**

The mature football screens (Tier A) discovered the right patterns organically: dedicated mobile DOM, cards not tables, portaled bottom sheets, thumb-anchored actions. But because those patterns live as **inline-styled, copy-pasted markup inside each screen** rather than as primitives, three things followed:

1. Newer multi-sport screens (Tier B) couldn't *reuse* them, so they reinvented — and landed on a mobile-first column that forgot the desktop.
2. The newest P2P/Trophy screens (Tier C) reinvented again and **regressed all the way to desktop-first**, breaking on phones.
3. The one component that *was* extracted and shared — `CompetitionResultsHeader` — was extracted from the **desktop** grid, so it now propagates the desktop dense-table pattern to all three sports' mobile views.

This is the exact shape of the Clubhouse problem ("no single organizing concept enforced"), one layer down. The fix is the same shape too: **define the mobile pattern language once, build it as reusable primitives, and route every screen through them** — so quality stops being a per-screen accident and becomes a structural default.

The data backs this up: `lg:` appears in only **13 files** (73 occurrences); there is **no `useMediaQuery`/`useIsMobile` hook**; responsiveness is a binary `lg:` (1024px) split with **no tablet tier** (768–1023px devices get the phone layout). There is no system — only scattered conventions.

---

## The Unifying Concept

> **The thumb is the primary input. The deadline is the primary message. One card-based, sheet-driven pattern language is the only way to render below `lg`.**

Below the `lg` breakpoint, every screen is composed from the same small set of primitives, and obeys the same three behavioural rules (lifted directly from the audit and made structural):

1. **Every screen answers "what now?"** — one unmissable, thumb-reachable next action per view, anchored to the live deadline. Everything else is navigation.
2. **One number leads** — lists are cards with a single lead figure; supporting numbers are demoted, not equal-weight. No five-column grid on a phone.
3. **Reach beats density** — primary actions and the deadline live in the bottom (thumb) third; the top is for orientation, not decisions.

### Invariants this redesign enforces

1. **No screen renders a desktop multi-column data grid below `lg`.** Standings/lists become cards (rank · name · one lead number) or a stacked single-column form. Mechanism: the shared `CompetitionResultsHeader` gains a built-in mobile card mode, fixing all three sports at the source.
2. **Every primary screen surfaces exactly one thumb-anchored primary action**, tied to its deadline/next-step, via a shared `PrimaryActionBar` (a fixed, safe-area, portaled bottom bar) — never a top-of-page button as the only entry to the key task.
3. **There is one bottom-sheet primitive.** All modals/pickers/action menus below `lg` use it; it is portaled to `document.body`, honours `env(safe-area-inset-bottom)`, and is Kit Light. The two divergent sheets converge onto it.
4. **All interactive targets are ≥44×44px** below `lg`. Enforced by routing controls through sized primitives, not inline styles.
5. **Three breakpoint tiers exist** — mobile (`<640`), tablet (`640–1023`), desktop (`≥1024`) — and a `useViewport()` hook lets JS branch on them where CSS classes can't (e.g. choosing the *card* data shape vs the *grid* data shape).

---

## The Mobile Pattern Language (the "Shared Spine")

Eight primitives. Most already exist in part; the redesign consolidates and completes them, then enforces their use. This is the mobile analogue of the Clubhouse redesign's three-tier spine.

| # | Primitive | Status today | Target |
|---|-----------|--------------|--------|
| 1 | **`useViewport()` / `useIsMobile()` hook** | ❌ none — zero JS viewport detection | New hook returning `{ isMobile, isTablet, isDesktop }` from a single `matchMedia`. Lets components pick *card vs grid* data shapes, not just CSS visibility. |
| 2 | **`<BottomSheet>`** | ⚠️ two divergent impls (`ActionSheet` ✅ clean; `PlayerPickerSheet` ❌ un-portaled, stale) | One portaled, safe-area, Kit Light sheet. `PlayerPickerSheet`, `NewCompetitionFlow`, all pickers migrate onto it. |
| 3 | **`<MobileCard>` / standings card mode** | ⚠️ `.fz-card` CSS class only; cards composed ad-hoc per screen; `CompetitionResultsHeader` has no card mode | A card row (rank · name · lead number · optional sub-line) + a **mobile mode inside `CompetitionResultsHeader`** so Football/F1/Tennis standings all fix in one change. |
| 4 | **`<PrimaryActionBar>` / FAB** | ❌ no FAB; primary actions top-of-page or in desktop-only sidebars | A fixed, thumb-zone, deadline-aware bar (countdown + the exact task, e.g. "Set your GW13 squad"), state-aware ("Squad locked ✓"). Portaled, sits above the bottom nav. |
| 5 | **Collapsing `<TabStrip>`** | ⚠️ Clubhouse 8-tab no-scroll (clips); `HubTabPills` 6-pill scroll, no collapse | One strip primitive: scroll-with-edge-fade + optional priority-overflow "More" for long tab sets. Clubhouse + League adopt it. |
| 6 | **Touch-target sizing** | ⚠️ only in `.ffl-btn` (44/52px) | Codified minimums applied via primitives; sweep the sub-44px hot-path controls. |
| 7 | **Sport-accent tokens + top safe-area** | ❌ `--f1`/`--ten`/`--f1bg`/`--tenbg` undefined; no `env(safe-area-inset-top)` | Define the sport tokens in `index.css`; add a top inset to the sticky mobile top bar. (Also fixes a latent desktop bug.) |
| 8 | **Tablet tier** | ❌ binary `lg:` only; tablets get the phone layout | A `md`-tier pass: two-up cards / wider sheets where a tablet has the room, without the desktop sidebar. |

**Implication for code:** the redesign is mostly *extraction + adoption*, not greenfield. Tier A's patterns become primitives 2–4; the multi-sport screens (Tier B) and broken screens (Tier C) are then re-pointed onto those primitives. The Kit Light token system, the `.fk-mob-sheet*` CSS, the safe-area helpers, the `.ffl-btn` sizing, and the sport-aware bottom bar all already exist and are reused.

---

## Surface-by-Surface Current State

A map of where each surface sits today, so a planning session knows what it's walking into. (Line numbers drift — confirm with `grep`.)

### Navigation shell — `AppLayout.jsx`
- Binary `hidden lg:flex` desktop sidebar / `lg:hidden` mobile top + bottom bars. No tablet tier. No JS viewport detection.
- Mobile **bottom bar** (64px, `var(--shell)`): `MOBILE_NAV` derived from route (`useActiveCompetition()`), three sets — football 5 / F1 5 / tennis 3 items. Live-pulse + unread badge handled.
- **Redundancy:** the bottom bar and `CompetitionScreenNav` (a scrollable top strip) surface the *same* screen links — a mobile user sees them twice. `CompetitionTopBar` is a third scrollable strip (cross-competition switcher).
- **Bottom safe-area:** handled thoroughly. **Top safe-area:** not handled (notch collision on the sticky top bar).
- **`#main-content`** has `WebkitOverflowScrolling:'touch'` + `100dvh` — the documented iOS stacking-context trap; the standing mitigation is `createPortal` for all fixed overlays.

### Tier A — already mobile-adapted (preserve, then extract)
- **`SquadScreen.jsx`** — dedicated mobile DOM; pitch tab is a position-grouped card list (not the graphical pitch); action menu is a portaled fixed-bottom sheet. *Gap:* deadline `windowKpi` is `hidden lg:block` (invisible on mobile); action-sheet buttons ~40px; fixture sub-labels at `fontSize:7`.
- **`LiveScreen.jsx`** — the best adaptive layout; desktop 2-col grid vs mobile simplified card rows; horizontal-scroll league card row (140px cards). No dense mobile grid.
- **`LeagueDetailView.jsx`** — desktop standings via `CompetitionResultsHeader`; **mobile standings are bespoke card rows** with H2H stacked inline. Whole row is a ~48px tap target. This is the card pattern `CompetitionResultsHeader` should absorb.

### Tier B — mobile-first column, doesn't scale up (re-point onto primitives)
- **`ClubhouseScreen.jsx`** — `maxWidth:640` column. Overview competition grid (`minmax(240px,1fr)`) → one column on a phone ✅. **8-tab `TabBar` does not scroll** ❌ (the adjacent `CircleSelector` already shows the `overflow-x:auto` fix to copy).
- **F1** (`F1StandingsScreen`, `F1HomeScreen`, `F1RaceBetScreen`, `PaddockLobbyScreen`) — single columns, native `<select>` form controls (✅ ideal on mobile), bottom-of-form submits (✅). `F1StandingsScreen` inherits the `CompetitionResultsHeader` grid (3 numeric cols — tolerable). `F1RaceBetScreen` is the best primary-action placement in the app (full-width bottom submit).
- **Tennis** (`TennisLeaderboardScreen`, `TennisHomeScreen`, `TennisTournamentScreen`, `PlayerBoxScreen`) — single columns, native pickers, good cards on Home. **`TennisLeaderboardScreen` is the worst standings case** (4-col `CompetitionResultsHeader` + the 14-col horizontal `<table>`).

### Tier C — desktop-first, broken on a phone (rebuild mobile DOM)
- **`ChallengeScreen.jsx`** (P2P/coins) — flex main + **fixed `width:256` sidebar**, nested `1fr 1fr` grids, non-wrapping stat header, `height:100%; overflow:hidden`. **"New Challenge" lives in the sidebar** → unreachable on mobile. (`CreateChallengeModal` *is* a correct bottom sheet — the modal works, the screen behind it doesn't.)
- **`TrophyCabinetScreen.jsx`** — same `width:256` sidebar pattern; non-wrapping 4-stat header; `repeat(3,1fr)` sport grid squeezed to ~110px cells. "Export image →" lives in the unreachable sidebar.

### Design-system layer — `index.css` (reuse, don't rebuild)
- **Exists:** two Kit Light token systems (Tailwind `@theme` + `:root` inline vars); a complete `.fk-mob-sheet*` bottom-sheet CSS + `messages/ActionSheet.jsx` React wrapper; safe-area helpers (`.safe-bottom`, `.pb-safe`); `.ffl-btn` 44/52px sizing; toast/banner/skeleton systems; reduced-motion guards.
- **Net-new:** `useViewport` hook; `<PrimaryActionBar>`/FAB; a generic `<BottomSheet>` (consolidating the two impls); `--f1`/`--ten`/`--f1bg`/`--tenbg` tokens; top safe-area inset.
- The `mk-*` mockup classes in the design HTML are **docs-only** — never imported by the app. Adopting their look is net-new (but the *tokens* are shared).

---

## Phased Delivery

Sequenced so the **worst breakage is fixed first**, the **highest-leverage shared component lands early**, and the *feeling* of "built for the thumb" is validated before the long tail of polish — the same philosophy as the Clubhouse redesign's A→D.

| Phase | Goal | Primary surfaces | Why here |
|-------|------|------------------|----------|
| **M0 — Foundations** | `useViewport()` hook; define `--f1`/`--ten`(`bg`) + fix token mismatches; add top safe-area; consolidate the **one `<BottomSheet>`**; build `<PrimaryActionBar>`/FAB + standings **card mode** scaffolding | `index.css`, new hook, new primitives, `ActionSheet`/`PlayerPickerSheet` | Unblocks every later phase; fixes latent token bugs that also hurt desktop. Low user-visible risk. |
| **M1 — The shared spine on mobile** | `CompetitionResultsHeader` mobile card mode (fixes Football/F1/Tennis standings in **one** change); kill the Tennis 14-col horizontal table; collapsing `<TabStrip>` for Clubhouse (8-tab) + League (`HubTabPills`) | `CompetitionResultsHeader.jsx`, `TennisLeaderboardScreen.jsx`, `ClubhouseScreen.jsx`, `HubShared.jsx` | Highest perceived impact per line changed — it rides the shared components, so three sports improve at once. |
| **M2 — Fix the broken screens** | Give `ChallengeScreen` + `TrophyCabinetScreen` real mobile DOM: single column, sidebar content folds inline, primary action ("New Challenge" / export) moves to the thumb zone | `ChallengeScreen.jsx`, `TrophyCabinetScreen.jsx` | These are genuinely broken at 375px — Tier C. Self-contained, no shared-component risk. |
| **M3 — Primary-action pass** | Every key screen gets one thumb-anchored `<PrimaryActionBar>` tied to its deadline/next-step; surface the deadline countdown on mobile (currently desktop-only on Squad) | `SquadScreen`, `MarketScreen`, `LeagueScreen`, F1 picks, Tennis roster | Delivers Principle 01 ("what now?") platform-wide once the primitive (M0) exists. |
| **M4 — Parity & polish** | `MarketScreen` mobile DOM (tall sticky header → progressive disclosure); 44px tap-target sweep; `PlayerPickerSheet`→`<BottomSheet>` migration; **tablet tier** (`md` two-up); reduce dual-render cost | `MarketScreen.jsx`, sweep across screens | The long tail; lowest individual impact, done once the system is in place. |

Each phase ships as its own PR(s) into `v2`; lint + build (Rolldown TDZ) + `platform.spec.js` + `madge --circular` green; updates [TRACKER.md](../TRACKER.md). Per project rules, all work is on `v2` — never `main`, never deployed until the Week-12 merge gate.

> **Companion document:** the phase-by-phase *how* — exact files, new component contracts, the `useViewport` API, the `<BottomSheet>`/`<PrimaryActionBar>` props, the Rolldown-TDZ and `createPortal` gotchas, and per-phase acceptance criteria — lives in **[MOBILE_FIRST_REDESIGN_IMPLEMENTATION_PLAN.md](MOBILE_FIRST_REDESIGN_IMPLEMENTATION_PLAN.md)**, mirroring the Clubhouse implementation plan.

---

## Cross-cutting rules (carried from the codebase's hard-won history)

1. **Rolldown TDZ.** A new shared primitive imported by a large screen *and* transitively through its child crashes only in the production build. Grep the parent's imports before adding one to a child; run `npm run build` (not just dev) + `npx madge --circular src/` before every PR.
2. **`createPortal` for every `position:fixed` overlay.** `#main-content`'s `WebkitOverflowScrolling:'touch'` traps fixed children on iOS. The new `<BottomSheet>` and `<PrimaryActionBar>` must portal to `document.body`. (`PlayerPickerSheet`'s current bug is precisely this.)
3. **Kit Light tokens only.** `--paper` = primary text (there is **no `--text`**); `--bg`/`--card`/`--elev`/`--rule`/`--mute`/`--gold`/`--accent`; sport accents `--f1`/`--ten` (to be **defined** in M0); `--shell` is the one dark element (the bars). No hard-coded `rgba` scrims — tokenise them.
4. **Definition of done per PR:** lint clean, build clean (TDZ), `platform.spec.js` green (keep `data-testid="desktop-nav"`/`"mobile-nav"`), no new madge cycles, TRACKER updated.

---

## Related Documents

- [CLUBHOUSE_CENTRIC_REDESIGN.md](CLUBHOUSE_CENTRIC_REDESIGN.md) — the desktop IA redesign this mirrors (read for the method)
- [FantasyKit UX Analysis](../design/screens/FantasyKit%20UX%20Analysis.html) — the design audit; Finding 06 + the three principles are the seed of this doc
- [Kit Design System.html](../design/Kit%20Design%20System.html) — Kit Light tokens
- [TRACKER.md](../TRACKER.md) — open-items source of truth; tracked as the [Mobile-First Redesign workstream](../TRACKER.md#mobile-first-redesign-workstream) (and `UX-DESKTOP-1` for the deferred Tier B desktop scale-up)
- [MOBILE_FIRST_REDESIGN_IMPLEMENTATION_PLAN.md](MOBILE_FIRST_REDESIGN_IMPLEMENTATION_PLAN.md) — the phase-by-phase build plan

---

Last Updated: **2026-06-30** — **Workstream complete.** All phases M0–M4 shipped (PRs #682–689). The eight primitives are in place; every screen meets the ≥44px tap-target floor; one `<BottomSheet>`/`createPortal` pattern is consistent; tablet tier added. Deferred: `MarketScreen` full progressive-disclosure header (logged as P3); Tier B desktop scale-up (logged as `UX-DESKTOP-1` in [TRACKER.md](../TRACKER.md)).
