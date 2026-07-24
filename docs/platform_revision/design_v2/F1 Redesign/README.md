# Handoff: F1 Module Redesign

## Overview
Visual redesign of Frontrow's F1 module — the per-race and season-long prediction game (podium picks, DNF, team, rotating special question) that plugs into a Clubhouse alongside Football and Tennis. The module is feature-complete in production; this pass is UI/layout only — no scoring or game-design changes. The core problem addressed: today F1 renders almost entirely in the platform's generic blue accent with no F1-red identity outside nav chrome and Standings. This redesign gives F1 a real, consistent red identity across all its screens.

## About the Design Files
`F1 Module Redesign.html` is a **design reference built in HTML** — a pannable canvas (`design_doc_mode="canvas"`) of static, high-fidelity mockups. Open it in a browser and pan/scroll to see all screens. **It is not production code.** The task is to recreate these designs in the target codebase's existing environment (a React codebase — see file paths below) using its existing component patterns, not to ship this HTML directly.

## Fidelity
**High-fidelity.** Exact colors, typography, spacing, and component states are final and should be recreated pixel-accurately. Copy (driver/team/paddock names, numbers) is placeholder/sample data — wire to real data sources. Driver and team names used throughout (e.g. "L. Voss", "Meridian") are fictional placeholders, not real F1 entities — substitute real driver/team data from the app's existing data layer.

## Design System Context
This module must match two companion handoffs already implemented/designed against the same tokens:
- **Clubhouse Core** (`docs/platform_revision/design/design_handoffs/clubhouse_core/README_CLUBHOUSE.md`) — global chrome: sidebar, competition top bar, card language.
- **Tennis module** (`docs/platform_revision/design/design_handoffs/tennis_module/README.md`) — same brief format, same token set; F1 reuses its shared-chrome markup verbatim (sidebar, top bar, card system) and its dimming/status-pill conventions, but diverges deliberately in two places: F1's Home header is a **dark shell** (not Tennis's cream header) and F1 keeps its own 5-item secondary tab row (Calendar/Picks/Standings/Report/Season) rather than Tennis's 2-tab pattern.

## The Core Design Decision: Where F1 Red Goes
Previously `var(--f1)` red only appeared in nav chrome and Standings. This redesign applies it consistently but narrowly:
- **Used for:** brand/action moments — the Home header shell + eyebrow, the next-race countdown banner (solid fill), the active round-selector pill, the P1 podium slot's accent border, Save/Submit buttons, Report's total-points figures and the podium visualization's tallest (P1) block, the Standings view-toggle active segment, editable-state lock banners.
- **Never used for:** correctness/right-wrong signaling. Report's pick-vs-actual comparison and Season Bets' correct/incorrect indicators always use the app's existing semantic `--positive` (green) / `--danger` (red) tokens, never `--f1`. This separation matters because F1's brand red (`#E10600`, Ferrari-saturated) sits close in hue to the semantic danger red (`#B91C1C`, a duller brick) — conflating them would make a correct pick look like an error.
- **Checkered flag motif:** a thin black/white checkerboard CSS strip (`.checker` class — pure CSS, no image asset) recurs as a small decorative accent under the F1 Home header and above the Report's podium visualization — the module's one recurring decorative device, used sparingly.

## Screens

### F1-01 — F1 Home (`/f1/:paddockId`)
**Purpose:** daily-use landing screen; the CAL destination in the bottom nav. Priority 1 screen.
**Layout, desktop (1440):** 220px sidebar + flex-1 column: competition top-bar pill strip (40px) → **dark-shell header** (`--shell` background, padding 18px 26px) with eyebrow "🏎 FORMULA 1 · 2026", paddock name + dropdown chevron, member count + race progress ("13/24 races run"), and an always-visible "ADMIN" pill top-right (white/10% fill, pill border) → thin checkered strip (6px, CSS checkerboard) → secondary tab row (Calendar / Paddocks, F1-red active underline) → scrollable main column, `padding:18px 22px`, `gap:16px`:
  - **Next-race countdown banner**: solid `--f1` fill, white text, rounded 6px. Flex row: flag emoji (30px) + round/GP eyebrow + GP name (Archivo Black 19px) + circuit name, a countdown block (Archivo Black 24px "2d 6h" + "TO RACE" label) pushed right, and a white pill CTA "Submit picks for R{n} →" (F1-red text on white). This is the single highest-priority element on the page — largest type, only solid-color block.
  - **24-race season list** (`.seasonlist`/`.race-row`): each row = round number (mono, muted), flag emoji, GP name (Archivo Black 13px, 190px fixed width), optional "· SPRINT" tag (pill, muted), date (mono), and a right-aligned status: `statuspill` (upcoming=grey/upcoming, open=solid red "Picks open", live=gold, quali=blue-tinted "Qualifying") OR a winner tag (mono, "🏆 {name}") once the race is scored. The **active next-race row** gets a `--f1-bg` tint + 3px left red border. **Past/finished rows are NOT dimmed**; only truly upcoming rows past the next race dim to 42% opacity (`.dim` class) and become non-interactive, matching Tennis's convention.
  - **Paddocks section**: a "🏁 My Picks — R{n} {GP name} →" full-width dark-shell CTA button, then a 2×2 card grid linking to Standings / Season Bets ("Year Bets") / Race Picks / Report (each card: icon in a red-tinted square, title, one-line status subtext), then a "Top of the Paddock" preview — top-5 leaderboard rows with gold/silver/bronze medal circles for 1st–3rd, "You" row tinted/colored red.
**Layout, mobile (390):** 44px top strip (paddock name + gear) → competition pill strip → compact dark-shell header → checkered strip → same 2-tab row → single scroll column: countdown banner (stacked/wrapped layout, CTA full-width below), a 3-row season list preview, the My Picks CTA, a top-2 leaderboard preview → 60px dark bottom nav with **5 items**: CAL · PICKS · STD · REPORT · CLUB.
**Nav decision to flag for engineering:** the brief notes Season Bets currently has no mobile bottom-nav slot (reachable only via a card in Paddocks). This redesign does **not** add a 6th nav slot (5 is the practical max) — Season Bets stays reachable via the Paddocks section's card grid on both desktop and mobile, matching current shipped behavior. If product wants Season Bets promoted to the bottom nav, one of the existing 5 slots (most likely CLUB, since it's clubhouse-global) would need to move to a drawer.

### F1-02 — Race Picks (`/f1/:paddockId/picks/:round?`)
**Purpose:** the core interaction, one per race. Richest form in the module.
**Layout:** round selector strip (horizontal-scroll pills R1–R24; `finished` = outlined/muted, `on` = solid red, default = grey filled `upcoming`) → race header (flag + GP name + round/date/circuit, right-aligned countdown "2d 6h left" in red mono + "Picks close at qualifying" label) → lock-state banner (see below) → four form sections, each a bordered card with a mono eyebrow label + right-aligned point value in red:
  1. **Podium (P1/P2/P3)** — `.podiumrow` 3-column grid, each slot a bordered card (P1 slot gets a red border to mark it as the highest-value pick) containing a driver mini-card (circular initials avatar, name in Archivo Black, team name in mono caps below) + a "Change" link in red. Selecting a driver in one slot must exclude it from the other two (implement as disabled/greyed state in the picker list, not shown in this static mock but same pattern as Tennis's "Used elsewhere" treatment).
  2. **DNF driver (optional)** — same driver mini-card pattern, single row, explicitly labeled "(optional)" in the section eyebrow.
  3. **Team with most points** — horizontal row of pill-shaped team chips, each with a small color dot + team name; selected chip gets red border + tint.
  4. **Special Category** — one flexible component whose interior renders one of three shapes depending on the round's question type (see F1-02b below for all three variants side by side). The question text itself renders as a `.spec-label` sentence above the input.
  Below the four sections: an always-visible **scoring guide strip** (`.scoreguide`) — a horizontally-scrollable row of pill segments, each showing a point value (Archivo Black, red) over a small mono label (P1 exact/P2 exact/P3 exact/right driver wrong spot/correct DNF/correct team/correct special/all-six bonus) — then a full-width **Save button** (`.savebar`, solid red, states below).
**Lock-state banner variants (`.lockbanner`):**
  - `editable` — light red tint background, dark-red text, pencil icon: "Picks saved and editable until qualifying begins."
  - `locked` — neutral grey (`--elev`), lock icon: "Picks locked — qualifying has started. Results post after the race."
  - `finished` — light green tint, checkered-flag icon, inline podium recap: "Race finished. P1 {x} · P2 {y} · P3 {z} — see your score in Report."
**Save button states (`.savebar`):** default = solid red "Save picks →"; `saving` = gold fill (transitional); `locked` = grey/muted, non-interactive, once qualifying starts.
**Mobile (390):** same structure, single column, condensed round strip, podium/DNF cards stacked vertically instead of a 3-col grid, scoring guide strip omitted or scroll-behind (space-constrained — recommend keeping it but collapsed to icon+number chips).

### F1-02b — Special Category variants (documentation panel, not a standalone route)
Three input shapes the Special Category component must support, referenced by the F1RaceBetScreen's question-type field:
- **Variant A — Driver picker:** identical driver mini-card pattern used in Podium/DNF.
- **Variant B — Team picker:** identical team-chip row pattern used in the Team section.
- **Variant C — Multiple choice / toggle buttons:** two (or more) pill buttons side by side (`.spec-toggle`), selected = red border + tint, e.g. Yes/No.
All three must render inside the same form-section slot with no layout shift between rounds — implement as a single component that switches its render function on the question's `type` field, not three conditionally-mounted screens.

### F1-03 — Standings (`/f1/:paddockId/standings`)
**Purpose:** paddock leaderboard, STD tab. Already F1's best red-identity screen today — largely kept as-is, used as the template other screens now match.
**Layout:** screen title + a 3-way segmented **view toggle** (`.viewtoggle`: Total / Race pts / Season pts, active segment solid red pill) that re-sorts the same table rows rather than changing table shape (no layout jump on toggle) → `.ldrtable`: #, Manager, Race pts, Season pts, Total columns; gold/silver/bronze medal circles for top 3; "You" row tinted `--f1-bg` with red name text → a scoring-legend footer strip (mono, all 8 point values, always visible, matches the Race Picks scoring guide copy exactly).

### F1-04 — Report (`/f1/:paddockId/report`)
**Purpose:** accordion, one row per finished race — the "how did I do" moment.
**Layout:** each `.accrow` = collapsed header (round, flag, GP name, date, total points in red Archivo Black, chevron) that expands to:
  - **Podium visualization** (`.podiumviz`) — three bar-chart-style blocks sized by finish position (P1 tallest/red, P2 mid/dark-slate, P3 shortest/bronze), each labeled with driver name + position. Uses **actual race results**, not the user's score, so it reads as "what happened" before the table explains "how you did." A checkered strip sits above it as a section divider.
  - **Pick-by-pick comparison table** (`.cmp-table`): Field / Your pick / Actual / Points columns; correct picks in green with a `+N` green points figure, incorrect in red with `+0`. An all-correct round should show a gold bonus callout beneath the table (not shown as its own state in this mock, but same `.bonuscallout` gold-tint pattern as Tennis's Ace Card).
  - **"No picks submitted"** state: same accordion shape, dimmed (~50% opacity), body replaced with a centered muted message, no points/podium/table.
Collapsed rows for other races just show the header row (round/GP/date/total), no body — clicking expands.

### F1-05 — Season Bets (`/f1/:paddockId/season`)
**Purpose:** 10 once-a-season predictions, framed as a season-long wager rather than a settings form.
**Layout:** lock-state banner (editable-red or finished-green, same component as Race Picks) → a 2-column grid of 10 `.betcard`s, each: mono uppercase question label, Archivo Black answer. Two states:
  - **Open/editable:** plain cards, red editable-tint banner above, a full-width red Save/"Lock in season bets →" button beneath the grid.
  - **Results revealed:** each card gets a green (correct) or red (wrong) border + tint and a top-right result tag ("✓ CORRECT"/"✗ WRONG", **absolutely positioned** in the card's top-right corner — do not use `float`, it will overlap the question label at this line-height). Banner switches to the green "finished" state summarizing "{n} of 10 correct."

### F1-06 — Paddock Lobby (`/f1`)
**Purpose:** create/join/manage paddocks. Low-frequency utility screen.
**Layout:** 3-tab segmented control (My Paddocks / Create / Join, same `.lobbytabs` pill-tab pattern) → for My Paddocks: a card list, each card = icon (red-tinted square), paddock name, member count + your rank, and an invite-code chip pinned right (`FF-8K2M1 ⧉`). Structurally identical to Tennis's Player's Box lobby screen — reuse that exact pattern/component for cross-sport consistency; do not design a new one.

### F1-07 — Admin panel (`/f1/:paddockId/admin`)
**Purpose:** internal ops tool, single operator, gated on `is_admin`, reached only via the Home header's ADMIN pill (not in any nav list). Lower design priority — restyled to match the system, not reimagined.
**Layout:** two bordered sections, each with a `--elev`-shaded header bar:
  - **Race Results:** rows for P1/P2/P3 (with a neutral "Fetched from OpenF1" pill when auto-populated vs. manual entry), DNF driver, special-category answer, then a red "Trigger scoring →" button.
  - **Season Bets:** a lock-toggle row (green "Locked"/red "Unlocked" pill) and a final-results-entry row (green "Locked"/red "Not entered" pill).

## Design Tokens
| Token | Hex/value | Usage |
|---|---|---|
| `--bg` | `#F7F3ED` | Page background |
| `--card` | `#FFFFFF` | Card surface |
| `--elev` | `#EDEAE2` | Elevated panels, section headers |
| `--shell` | `#18202E` | Sidebar + F1 Home header — the one dark surface |
| `--paper` | `#18202E` | Primary text |
| `--mute` | `#8A97A8` | Secondary/muted text, labels |
| `--rule` | `#E2DDD5` | Borders, dividers |
| `--f1` | `#E10600` | F1 brand red — action/identity only, never correctness |
| `--f1-bg` | `rgba(225,6,0,.08)` | Red tint backgrounds/chips |
| `--gold` | `#B8720E` | Bonus callouts, saving-state |
| `--positive` / `--positive-bg` | `#166534` / `rgba(22,101,52,.10)` | Correct picks, finished states |
| `--danger` / `--danger-bg` | `#B91C1C` / `rgba(185,28,28,.08)` | Wrong picks — visually distinct hue from `--f1`, do not conflate |
| `--accent` | `#1A6FA8` | Other sports' nav dots (Football), not used within F1 screens themselves |
| Radius | `6px` | Throughout |
| Type | Archivo Black (headings/large numbers/driver names) · Archivo (body) · JetBrains Mono (uppercase eyebrows/labels/badges, letter-spaced 0.05–0.16em) | Same as rest of app |

## Assets
No image assets — avatars/driver initials are colored circles built inline (no image files). Flags are rendered as **native flag emoji** (🇬🇧, 🇮🇹, etc.), consistent with the rest of the app's existing emoji-as-icon usage (🏠, 🎾, 🏆). The checkered-flag motif (`.checker`) is pure CSS (no SVG/image asset) — a repeating linear-gradient checkerboard, 6px tall.

## Terminology (use exactly)
Paddock (the F1 group), Picks/Predictions (user-facing; DB calls them "bets" — never say "bets" in UI except the literal "Season Bets" screen name), Podium (P1/P2/P3), DNF, Special Category, GP, Round ("R{n}"), Sprint weekend, Constructor/Team (interchangeable).

## Scoring (implemented values — use these, not any older mockup's numbers)
P1 exact 10 · P2 exact 8 · P3 exact 6 · right driver wrong podium spot 3 · correct DNF 5 · correct team 5 · correct special category 5 · all-six-correct bonus 3.

**Important:** picks/bets are global per user, not per paddock — a user in two paddocks makes one shared set of picks; only the leaderboard is paddock-scoped. The paddock switcher in the F1 Home header changes whose leaderboard is shown, not what the user has predicted.

## Files in This Bundle
- `F1 Module Redesign.html` — all 9 frames (rationale doc + F1-01 through F1-07, including the F1-02b variants panel), desktop + mobile pairs where specified, on a pannable canvas. Open directly in a browser.
- `README_F1.md` — the original design brief this redesign was built against (screen specs, states-to-design checklist, terminology glossary, scoring table, and a note on how the older aspirational mockup differs from the real shipped behavior).

## Source Files in the Target Codebase
| File | What it is |
|---|---|
| `src/screens/f1/F1HomeScreen.jsx` | Calendar / paddock home |
| `src/screens/f1/F1RaceBetScreen.jsx` | Per-race prediction form |
| `src/screens/f1/F1SeasonBetsScreen.jsx` | Season-long predictions |
| `src/screens/f1/F1StandingsScreen.jsx` | Paddock leaderboard |
| `src/screens/f1/F1ReportScreen.jsx` | Historical results + score breakdown |
| `src/screens/f1/F1AdminScreen.jsx` | Admin result entry + scoring |
| `src/screens/f1/PaddockLobbyScreen.jsx` | Create/join/manage paddocks |
| `src/hooks/f1/usePaddock.js` | Paddock data hook |
| `src/lib/f1/f1-data.js`, `scoring.js`, `openf1.js` | Driver/team lists, scoring logic, OpenF1 API client |
| `src/components/competition/CompetitionResultsHeader.jsx` | Shared standings table (also used by Football/Tennis) |
| `src/components/CompetitionTopBar.jsx`, `CompetitionScreenNav.jsx` | Global nav chrome F1 plugs into |
