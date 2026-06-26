# Handoff — Live Centre (Forza Fantasy League)

## Overview

The **Live Centre** is the in-match view of the Forza Fantasy League ("FORZAKIT") app. It shows:

1. A **miniature pitch** of the user's starting XI (not the full pitch — the full tactical sheet lives in *My Squad*).
2. A **cross-league match-events feed** — every fantasy-relevant event happening to any of the user's players in any of the leagues they're playing in.
3. A **league selector** that lets the user focus a single Forza Fantasy League. The pitch's *captain* marker, *chip* badge, and *live total* all reflect the focused league. The events feed itself is always cross-league and never filters.

The screen exists because a user is typically enrolled in several Forza Fantasy Leagues (Office Heroes, Mates Only, a public league, etc.), the same player can earn different points in different leagues (chips and captains diverge), and the user wants both perspectives in one place: "who is my captain in *this* league?" and "what's happening to all my players right now?".

The current production screen — which this design replaces — had a tiny pitch and an empty events column. The redesign keeps the same chrome but tightens the relationship between the two halves and adds the league mechanic explicitly.

## About the Design Files

The files in this bundle are **design references created in HTML/React** — prototypes showing intended look and behaviour, **not production code to copy directly**. The task is to recreate these designs in the target codebase's environment (the live app — presumably React/Next.js based on the prototype, but verify against the real repo) using its established patterns and libraries.

If the live app is not yet React, choose the framework already in use; the design system is portable.

The HTML prototype `Live Center Redesigns.html` opens in a "design canvas" (a Figma-ish pannable surface with multiple artboards). Open it in a browser to interact with it; everything inside the artboards is real React.

## Fidelity

**High-fidelity.** Exact colours, typography, spacing, border treatments, and interaction states are specified below and implemented in the prototype. Recreate pixel-perfectly using the codebase's component primitives.

---

## Screens / Views

There are **two surfaces**: Desktop (≥1024px) and Mobile (<768px). A tablet breakpoint is not designed; treat it as one of the two extremes — recommend mobile layout up to 900px.

### 1. Desktop — Live Centre

**Purpose:** during a match window, the user lands here from the side nav's *Live* item (which carries a red dot when there's an active fixture). They want to (a) see all match events across all their leagues and (b) glance at the squad in any specific league with its captain/chips correctly shown.

**Layout (1440 design width):**
- Left rail: **220px** persistent `SideNav` (already exists in `_reference_sidenav.jsx`).
- Main column: vertical stack —
  1. Header strip (`padding: 24px 32px 16px; border-bottom: 1px solid var(--rule)`). Left: `MATCH DAY · GW 28` eyebrow + "Live Centre" display title + pulsing **LIVE** pill. Right: focused-league readout (dot + name + rank + chip).
  2. Fixtures strip — one row per live fixture. `border-bottom: 1px solid var(--rule)`. Each cell: LIVE pill, clock, then `HOME 1–0 AWAY` with the score in cyan.
  3. **League selector bar** — flex row, one button per league (4 equal columns). `padding: 14px 18px; border-left: 1px solid var(--rule)` between cells, `border-bottom: 1px solid var(--rule)` overall. Active card: `background: <leagueTone>10` (i.e. 10/255 alpha hex), `border-bottom: 2px solid <leagueTone>`. Contents per card: tone dot + league name (mono, .18em tracking) + member count (right-aligned mono); below, big total in Archivo Black 26px + delta pill + optional chip tag.
  4. Body grid: `grid-template-columns: minmax(0, 520px) 1fr` —
     - **Left column (520px max)**: 20/24 padding, `border-right: 1px solid var(--rule)`. Header row: 3px tone bar in the focused league's colour, `MY XI` mono label, `· <LEAGUE NAME>` mute mono. Right: "3 ACTIVE NOW" mono. Then the **mini pitch** (`flex: 1`). Footer caption mono: `● PULSE = PLAYER IN A LIVE FIXTURE · C = CAPTAIN FOR <LEAGUE> · NUMBERS ARE NEUTRAL GW POINTS`.
     - **Right column (fill)**: header `padding: 14px 20px; border-bottom: 1px solid var(--rule)`. Gold 3px bar + `MATCH EVENTS` + ` · EVERY PLAYER · EVERY LEAGUE` mute mono. Right: "<n> TOTAL". Then a scrollable list of event rows (see component below).

**Components and treatments**: see the §Components section.

### 2. Mobile — Live Centre

**Purpose:** same job, single column, no pitch. Per product direction, mobile uses the same list pattern as *My Squad* mobile (`final-squad-mobile.jsx`).

**Layout (390 design width):**
1. iOS-style status bar (32px).
2. Topbar: `FORZAKIT` wordmark left (Archivo Black 18, cyan "KIT"), `LIVE` pill right. `padding: 8px 18px 12px`.
3. Tab row: SCORES / SQUAD / LEAGUE / **LIVE** / MARKET (mono 10, .18em). LIVE has the cyan underline indicator + red dot.
4. Hero: `MATCH DAY · GW 28` eyebrow, "Live Centre" display 24.
5. **League selector** — horizontal-scroll row of cards. Each card: 140px min-width, `padding: 10px 12px`, `background: var(--ink-2)` (active: `<tone>14` wash), `border: 1px solid var(--rule)` (active: 1px solid `<tone>`), always `border-left: 2px solid <tone>`. Contents: short name (mono 9), full name (Archivo Black 12), total (Archivo Black 22) + delta pill, rank + chip footer (mono 8).
6. **Segmented tabs**: `MY XI · <LEAGUE_SHORT>` | `EVENTS · <count>`. `padding: 10px 0`, equal flex, 2px cyan underline on active. `border-bottom: 1px solid var(--rule)`.
7. **Tab body** — scrollable:
   - **MY XI**: position rows separated by `border-top: 1px solid var(--rule)`. Each player row: 22px position pip (mono 9) | name + live dot + captain badge + club | points (Archivo Black 14, cyan if positive, danger red if negative).
   - **EVENTS**: column of `MobEventRow`s — see component.

States to ship: (default = Office Heroes, Events tab), Squad tab, league switched to Sunday League Kings (shows Abraham as `3×C` for Triple Captain).

---

## Components

### `SideNav`
Already exists. 220px, `background: var(--ink-2)`, items: Scores / My Squad / League / **Live** (red dot when live) / Market. Active item: 2px cyan left border, cyan label, faint cyan wash.

### `LivePill`
- Red dot (6px, `var(--danger)`) with `fkPulse` animation (1.4s ease-in-out infinite, opacity 1→.35→1).
- Mono label "LIVE" in `var(--danger)`, .22em tracking, size 10–11.

### `DeltaPill`
- `delta === 0` → mono "±0" in var(--mute).
- `delta > 0` → Archivo Black, colour `var(--positive)` (#22C55E), prefix `+`.
- `delta < 0` → Archivo Black, colour `var(--danger)` (#EF4444), prefix `−` (Unicode minus, not hyphen).
- Two sizes: regular (14px) and `big` (18px).

### `LeagueChip`
- Inline-flex pill, `padding: 3px 7px 3px 6px`, `border: 1px solid <leagueTone>55`, `background: <leagueTone>12`, `border-radius: 2px`.
- Contents: 5px dot in league tone + mono league name (compact mode: 9px + short code; default: 10px + full name), letter-spacing .14em, colour = league tone.

### `MiniPitch` (desktop only)
- `position: relative`, `background: linear-gradient(180deg, #0E1218 0%, #0A0D12 100%)`, `border-radius: 6px`, `box-shadow: inset 0 0 0 1px var(--rule)`.
- Four faint horizontal position rules at y = 14/38/64/88%, `background: rgba(0,180,216,.08)`, `height: 1px`, inset 18px.
- Position labels left-anchored at the same y values: mono 8, `color: rgba(0,180,216,.45)`, tiny ink chip background.
- Faint centre-circle hint: 30% of width, aspect 1, circle border `rgba(242,238,229,.04)`.
- Header strip top: left = `STARTING XI · 5-4-1` mute mono; right = `<LEAGUE NAME> · GW 28` in league tone when scoped.
- 11 `MiniTok`s positioned absolutely by normalized x/y (see `LIVE_SQUAD`).

### `MiniTok` (player token on the pitch)
- Absolute positioned at `<x>% / <y>%`, `translate(-50%, -50%)`.
- Inner box: `padding: 4px 8px`, `background: rgba(15,18,24,.94)`, `border: 1px solid var(--rule)` (or `var(--danger)` if live), `border-left: 2px solid <POS_TONE[pos]>`, `border-radius: 2px`, `min-width: 78px`, centred text.
- When live: extra `box-shadow: 0 0 0 2px rgba(239,68,68,.18)` and a 6px pulsing red dot at top-right (3px offset).
- When captain: 16×16 gold circle at top-left (-7,-7), 2px ink border, Archivo Black 9, content `C` (or `3` for Triple Captain).
- Body: name (Archivo Black 10, -0.01em tracking), then row [club (mono 8 mute) · 2px dot · GW points (Archivo Black 10; danger red if negative)].

### `EventRow` (desktop events feed)
- `display: grid; grid-template-columns: 44px 22px 1fr auto auto; gap: 14px; padding: 12px 16px; align-items: center; border-bottom: 1px solid var(--rule)`.
- Negative-delta rows get `background: rgba(239,68,68,.04)` (subtle danger wash).
- Cols: time mono (e.g. `82'`, `HT`) → event glyph (Archivo Black 12, coloured per `EVENT_KIND.tone`) → name + club + " · " + event label (+ optional note like "Triple Captain" in gold, + captain `C` badge if applicable) → `LeagueChip` → `DeltaPill`.

### `MobEventRow` (mobile events feed)
- `display: grid; grid-template-columns: 36px 1fr auto; gap: 10px; padding: 10px 18px; align-items: center; border-top: 1px solid var(--rule)`.
- Left cell stacks time mono over event glyph.
- Middle cell: row 1 = name (Archivo Black 13) + club mono + optional `C` badge. Row 2 = event label + `LeagueChip compact` + optional note in gold mono.
- Right cell: `DeltaPill`.

### `MobSquadRow`
- `display: grid; grid-template-columns: 22px 1fr auto; gap: 10px; padding: 8px 0`.
- Position pip (mono 9 mute) | live dot + name + optional captain badge (`C` or `3×C`) + club mono right-aligned | points (Archivo Black 14, cyan if ≥0, danger red if <0).

### `FixturesStrip`
- Flex row, equal-flex cells, `border-bottom: 1px solid var(--rule)`, cells separated by `border-left: 1px solid var(--rule)`.
- Each cell `padding: 10px 16px; display: flex; gap: 14px`. `LivePill`, clock mono, right-aligned score (`{home}<cyan>{hs}–{as}</cyan>{away}` in Archivo Black 14).

### `LiveTotalsBar` (used in V2 only — reference)
- Flex row, equal-flex, `border-top + border-bottom: 1px solid var(--rule)`.
- Per league: tone dot + league name mono, then Archivo Black 24 total + delta pill, member count right-aligned.

---

## Interactions & Behavior

### League switching (desktop)
- Source of truth: a single `activeLeague` React state on the page (or scoped store). Default to the user's primary league.
- Clicking a card in the league selector bar sets `activeLeague`.
- On change:
  - Pitch's title strip swaps to the league's name and tone colour.
  - The captain marker on the pitch moves to the player who is captain for that league. Triple Captain renders as `3` inside the same gold circle.
  - The header's "Focused league" indicator updates.
  - The mini-pitch footer caption replaces the league short-code (e.g. "CAPTAIN FOR OFC").
  - **The events feed does NOT change.** It always shows every event across every league.
- Animation: 120ms ease on the active wash background and bottom-edge tint. The captain badge does not animate position (it just disappears from old, appears on new); no FLIP needed.

### League switching (mobile)
- Same state model. Tapping a card in the horizontal scroll row sets `activeLeague`.
- On change:
  - The tab labels update (`MY XI · <SHORT>`).
  - The MY XI tab's captain markers move; chip badge changes if relevant.
  - The events tab is unaffected.

### Tab switching (mobile)
- `tab` state, values `'squad' | 'events'`. Default = `'events'`.
- Cyan 2px underline indicator on the active tab. `border-bottom: 1px solid var(--rule)` on the row.
- No transition — content swaps instantly.

### Live updates
- The feed is reverse-chronological (newest first).
- New events should slide in from the top — recommend a 240ms ease-out enter with a 1.2s soft cyan flash on the row background. (Detail; ship without flash if simpler.)
- When an event lands for a player on the pitch:
  - That player's token gains the live-pulse outline (or keeps it).
  - The token's points number updates with the same flash treatment.
- Polling cadence: per the app's existing match-event service. The design assumes events arrive in real time but does not specify transport — use existing infra.

### Pulse animation
```css
@keyframes fkPulse {
  0%, 100% { opacity: 1; }
  50%      { opacity: 0.35; }
}
```
Applied 1.4s ease-in-out infinite on live dots.

---

## State Management

Local state on the Live Centre page:
- `activeLeague: string` — the focused Forza Fantasy League id. Default to user's primary league. Persist to URL query string (`?league=office`) so a refresh / share keeps focus.
- `tab: 'squad' | 'events'` — mobile only. Default `'events'`. URL hash optional.

Data the page needs from upstream services (whatever the real data layer is — substitute the right service names):
- `useUserLeagues()` → `{ id, name, shortName, tone, members, captainPlayerId, chip, rank }[]` — one entry per Forza Fantasy League the user is in. (`tone` should be assigned client-side from a palette so a new league always gets a colour.)
- `useGameweekFixtures({ live: true })` → fixtures currently live (for the strip).
- `useStartingXI()` → the user's starting XI for the current gameweek. The XI may be league-independent (one squad shared across leagues) or league-specific — confirm with the data model. The prototype assumes shared XI and per-league captain/chip.
- `useLiveEvents()` → all match events for any player the user owns in any league. Each event has `{ id, playerId, kind, minute, displayTime, leagueId, delta, captainBonus, chipApplied, note }`. The `delta` is per-league because chips/captains affect it; the same real event produces multiple `LiveEvent` records, one per league it affects.
- `useLiveTotals()` → per-league running total + delta for the gameweek.

If the back-end currently emits one event per real-world action (not per league), the front-end should fan it out into per-league rows using the user's league memberships + captain/chip settings.

---

## Design Tokens

All defined in `src/tokens.css` and `src/squad-shared.css`.

### Colours
| Token | Hex | Usage |
|---|---|---|
| `--ink` | `#080A0E` | Page background |
| `--ink-2` | `#0F1218` | Card background / side nav |
| `--ink-3` | `#161B25` | Deeper layered surface |
| `--rule` | `#1E2530` | Dividers, borders |
| `--paper` | `#F2EEE5` | Primary foreground |
| `--mute` | `#8B95A1` | Secondary foreground |
| `--cyan` | `#00B4D8` | Primary accent (FORZAKIT) |
| `--gold` | `#E0A800` | Captain, chip warning, midfield tone |
| `--positive` | `#22C55E` | Positive delta |
| `--warn` | `#F59E0B` | Doubt status |
| `--danger` | `#EF4444` | Negative delta, live indicator |
| `--purple` (a.k.a. `--pos-gk`) | `#A855F7` | Goalkeeper position tone |

**Position tones** (used on token left-edge):
- FWD → `--danger`
- MID → `--gold`
- DEF → `--cyan`
- GK → `--purple`

**League tones** — assigned per league in the data model (`live-data.jsx`). Used at full opacity for active borders / dots, and at hex-alpha suffixes `10` / `12` / `14` / `55` for washes and chip borders. Current placeholders:
- Office Heroes → `#00B4D8`
- Mates Only → `#E0A800`
- Sunday League Kings → `#A855F7`
- Global · Open → `#8B95A1`

When a new league is created, assign it the next colour from a palette (recommend: cyan, gold, purple, green, orange, magenta, then derive more with oklch hue rotation).

### Spacing (4px base)
`--s-1: 4px`, `--s-2: 8px`, `--s-3: 12px`, `--s-4: 16px`, `--s-5: 20px`, `--s-6: 24px`, `--s-7: 32px`, `--s-8: 40px`.

### Radii (intentionally sharp)
`--r-sm: 2px`, `--r-md: 4px`, `--r-lg: 8px`. The pitch itself is 6px (between md and lg).

### Typography
Three families loaded from Google Fonts:
- **Archivo Black** — display titles, names, numerals. Weight 900, letter-spacing -0.02em on big sizes, uppercase for headings.
- **Archivo** (400–900) — body, labels.
- **JetBrains Mono** (400–600) — eyebrows, monospace metadata, league chips. Letter-spacing .14em–.22em depending on size, uppercase.

Utility classes already present:
- `.display` — Archivo Black 900, -0.02em tracking, line-height 0.9, uppercase.
- `.mono` — JetBrains Mono, uppercase, .14em tracking.
- `.eyebrow` — JetBrains Mono 11px, .22em tracking, uppercase, `var(--mute)`, weight 500.

### Sizes used in this screen
- Display title (page): 34 desktop / 24 mobile.
- Section eyebrow: 10 (.22em).
- League card big total: 26 desktop / 22 mobile.
- Player token name: 10.
- Event row name: 13.
- Delta pill: 14 (regular) / 18 (big).
- Score in fixtures strip: 14.

### Borders / decoration patterns
- Section header bar: 3px tall, 14px wide, colour = section tone (gold for events, cyan or league tone for the pitch).
- Active tab/card edge: 2px solid in tone colour, no glow.
- Token left edge: 2px solid in position tone.
- Negative-event row: subtle danger wash `rgba(239,68,68,.04)`.

---

## Copy

All copy is in the prototype files; treat it as the source of truth. Key strings:

- Eyebrow: "MATCH DAY · GW 28" (`GW 28` is gameweek-dynamic).
- Page title: "Live Centre".
- Section labels: "MY XI", "MATCH EVENTS", "ALL EVENTS" (mobile).
- Sub-label desktop feed: "· EVERY PLAYER · EVERY LEAGUE".
- Pitch caption: "● PULSE = PLAYER IN A LIVE FIXTURE · C = CAPTAIN FOR <SHORT> · NUMBERS ARE NEUTRAL GW POINTS".
- League selector intro (mobile): "YOUR LEAGUES — TAP TO SWITCH".
- Triple Captain badge: renders as `3×C` on mobile squad row, `3` inside the gold circle on pitch tokens.

Tone: terse, sports-magazine, all caps for meta. Avoid emoji.

---

## Assets

No raster assets. All visuals are CSS + Unicode glyphs:

- Event kind glyphs (Archivo Black single character): `●` goal, `◆` assist, `▲` clean sheet, `■` card (gold or danger), `★` penalty save, `✕` penalty miss, `+` bonus pts, `↓` subbed off, `↑` subbed on, `−` conceded.
- Pulsing live dot — pure CSS animation.
- Pitch lines — inline divs (no SVG required at the small size; an optional `PitchLines` SVG exists in `squad-data.jsx` for higher-fidelity surfaces).

If your icon system already has a fantasy-events set, prefer those over the Unicode glyphs — but match the tone-per-event-type mapping defined in `EVENT_KIND`.

---

## Files

```
design_handoff_live_centre/
├── README.md                       ← you are here
├── Live Center Redesigns.html      ← open in a browser to interact with the live prototype
├── design-canvas.jsx               ← the design-canvas wrapper (host shell, not part of the product)
├── squad-data.jsx                  ← reference squad data (different to live-data; keep for context)
├── screenshots/                    ← static reference renders of the chosen direction
│   ├── 01-desktop-overview.png            ← full V1 desktop with Office Heroes focused
│   ├── 02-mobile-events.png               ← mobile Events tab (cross-league feed)
│   ├── 03-mobile-squad.png                ← mobile MY XI tab — Office Heroes (Abraham C)
│   └── 04-mobile-squad-triple-captain.png ← mobile MY XI tab — Sunday League Kings (Abraham 3×C)
└── src/
    ├── live-data.jsx               ← the squad, leagues, event taxonomy, sample events
    ├── live-desktop.jsx            ← LiveV1Desktop (chosen), plus V2/V3 reference variants and shared primitives
    ├── live-mobile.jsx             ← LiveMobileFinal (chosen), plus M1/M3 reference variants
    ├── tokens.css                  ← canonical CSS custom properties
    ├── squad-shared.css            ← shared chrome classes
    └── _reference_sidenav.jsx      ← contains the existing SideNav component for context
```

**Implement these** (the rest is reference):
- `LiveV1Desktop` (in `live-desktop.jsx`) — the chosen desktop layout.
- `LiveMobileFinal` (in `live-mobile.jsx`) — the chosen mobile layout.
- The shared primitives at the top of `live-desktop.jsx`: `LivePill`, `DeltaPill`, `LeagueChip`, `MiniPitch`, `MiniTok`, `EventRow`, `FixturesStrip`, `LiveTopHeader`.

**Reference only** (don't ship):
- `LiveV2Desktop`, `LiveV3Desktop` — earlier explorations.
- `LiveMobileV1`, `LiveMobileV3` — earlier mobile explorations.
- `design-canvas.jsx` — that's the canvas wrapper for presentation only.

---

## Notes / Open questions

1. **Captain-per-league source.** The prototype assumes one shared squad with per-league captain + chip overrides. If the back-end models full per-league squads, the pitch should still work — just pass the league-specific XI into `MiniPitch` instead of the shared one.
2. **Empty states.** Not designed yet — needed: "no leagues yet" (rare), "no live fixtures right now" (replace fixtures strip with a mute "Next kickoff in 2h 14m" caption), "no events yet" (the empty-feed copy is currently `AWAITING KICKOFF…` per the original screen).
3. **Performance.** The events feed can grow unbounded over a gameweek. Recommend virtualised list (e.g. `react-virtual`) for the desktop right column and a windowed render on mobile if more than ~60 events are loaded.
4. **Accessibility.** Add `aria-pressed` to league selector buttons, `role="tablist"` on the mobile tab row, and ensure the `fkPulse` animation respects `prefers-reduced-motion` (clamp opacity to 1).
