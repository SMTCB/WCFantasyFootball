# FORZAKIT — Scores / Match Centre: Build Spec

> Hand this to Claude Code (alongside `tokens.css` and `FORZAKIT-UI-Overhaul.md`) to revamp the **Scores** screen.
> This document specifies the build literally — anatomy, controls, components, data shape, and behaviour. Do not invent new patterns. Apply the rules in §3–§5 exactly.
> Reference build: `Scores Redesigns.html` → "V1 — Match Centre (canonical)" → `ScoresV1` artboard (`scores-screens.jsx`).

---

## 0. What's wrong with the current Scores screen

The shipped Scores screen (see the original "MATCH CENTRE" print) has three problems we are fixing:

1. **Infinite scroll** of every fixture in the season. There is no pagination, no sense of "this gameweek", and scanning is exhausting.
2. **No grouping.** Fixtures are listed flat, with no date headers and no competition headers. The user cannot answer "what's on Saturday?" or "what's left in the Champions League?" at a glance.
3. **Visual monotony.** Every row looks identical. Live matches, finished matches, and upcoming kickoffs read the same. The score (the most important number on the screen) is the same weight as the team names.

A first attempt at a **month-view calendar** also missed: equal-treatment cells made 50% of the screen dead space (empty weekdays read identically to packed Saturdays), and match entries collapsed to flat mono text (`ARS 1-2 BOU`) so the score lost its hero status. The month view (§8) fixes this with a surface hierarchy and the same dim-loser score primitive used in the list view.

The build below fixes all of it with one set of mechanics — a **Gameweek pager** for list mode, a **Month pager** for calendar mode, a **view toggle** for date/competition axis, and a **row/strip treatment hierarchy** for match status.

---

## 1. North-star principles

1. **One Gameweek per view (in list mode), one month per view (in calendar mode).** No infinite scroll, ever. The pager — Gameweek or Month — is the only way to move forward/back in time.
2. **Date and Competition are equal axes.** In list mode, the user picks which is primary via a segmented toggle. Don't pick one and bury the other in a filter menu.
3. **The score is the hero.** Archivo Black, with the losing side dimmed to `--mute`. Same rule in the list row, the month-view strip, and anywhere else fixtures appear.
4. **Status drives the row/strip treatment.** FT recedes, KO is neutral, LIVE pops with a red border/bar + pulsing dot. One system, three states, two surface types.
5. **Surface hierarchy in the month view.** Only matchful days get the raised `--ink-2` surface; empty days drop to the page background; out-of-month days fade. The eye lands on the action.
6. **No icons. No crests. No emoji.** Competitions are 3-letter codes in a tone-coloured outlined chip — same vocabulary as position chips in Squad/Market.

---

## 2. Reference build

```
Scores Redesigns.html
├── scores-data.jsx        ← COMPS, FIXTURES, groupByDate/Comp helpers
└── scores-screens.jsx     ← ScoresV1 (canonical list), V2, V3, V4MonthGrid, ScoresMobile
```

Open `Scores Redesigns.html` and look at:
- **V1 desktop** (`ScoresV1`) — the canonical **list** view. Build this first.
- **V4 desktop** (`ScoresV4MonthGrid`) — the canonical **month** view. Build this second.
- **V1 mobile** (`ScoresMobile`) — what the mobile breakpoint looks like.
- V2 and V3 — documented in §9 as alternates; do **not** build them unless explicitly chosen.

V1 and V4 are **peer view modes** of the same screen, switched by a top-level `LIST | MONTH` toggle (see §3.3). Both modes share the comp-chip filter and the underlying `Fixture` data shape.

---

## 3. Anatomy of V1 (the canonical build)

V1 is composed of **six horizontal bands**, stacked top-to-bottom inside the existing app shell. The sidebar (`SideNav active="scores"`) does not change.

```
┌───────────────────────────────────────────────────────────────────┐
│ 1.  Page header        MATCH CENTRE / Scores   ◇  Fixtures · Live │
├───────────────────────────────────────────────────────────────────┤
│ 2.  Sub-tabs           SCORES · RESULTS · LIVE● · TABLES          │
├───────────────────────────────────────────────────────────────────┤
│ 3.  Controls strip     [BY DATE | BY COMP] │ ALL EPL UCL …  [‹GW›] │
├───────────────────────────────────────────────────────────────────┤
│ 4.  Section band       │ SAT  13 SEP  ──────────────  6 MATCHES   │
├───────────────────────────────────────────────────────────────────┤
│ 5.  Fixture rows       FT │ LIVERPOOL       4 — 2   BOURNEMOUTH … │
│                        FT │ ASTON VILLA     0 — 0   NEWCASTLE …   │
│                        …                                          │
├───────────────────────────────────────────────────────────────────┤
│ 6.  (repeat 4 + 5 per group)                                      │
└───────────────────────────────────────────────────────────────────┘
```

### 3.1 Page header (band 1)

Identical pattern to Squad / Market. Eyebrow + title on the left, KPIs right-aligned.

- Eyebrow: `MATCH CENTRE` — JetBrains Mono, 10px, `--mute`, 0.22em tracking.
- Title: `Scores` — Archivo Black, 34px, `-0.02em`, sentence case.
- Right KPIs (mono label above Archivo Black value):
  - `FIXTURES` / total count (Archivo Black 20, `--paper`).
  - `LIVE NOW` / live count (Archivo Black 20, `--danger` if > 0, with an 8px pulsing red dot to the left of the number; `--mute` if 0).
- Bottom border `1px solid var(--rule)`.

### 3.2 Sub-tabs (band 2)

`SCORES · RESULTS · LIVE · TABLES`. Same component as on Squad — mono 11px, 0.18em tracking, `--mute` inactive / `--paper` active, 2px cyan underline at the bottom. `LIVE` gets a small `5×5` red dot next to its label.

`SCORES` is the active tab on this screen.

### 3.3 Controls strip (band 3)

Four parts, all on one row. **Order matters** (left → right).

**1. View toggle** (top-level — switches between list view (§3.4–§3.5) and month view (§8)). Mono 9px label `VIEW`, then a segmented control:

```
┌────────┬────────┐
│  LIST  │ MONTH  │
└────────┴────────┘
```

- Same segmented-control styling as the Group-by toggle below.
- Default: `LIST` (Group-by toggle visible, Gameweek pager visible).
- When `MONTH`: the Group-by toggle is hidden (months are always date-grouped), and the right-side pager swaps from Gameweek pager to Month pager (see §8.2).

**2. Group-by toggle** (only when view = LIST). Mono 9px label `GROUP BY`, then a segmented control:

```
┌───────────┬────────────────┐
│   DATE    │  COMPETITION   │
└───────────┴────────────────┘
```

- 1px `--rule` outer border, 1px `--rule` between segments. No radius.
- Active segment: background `rgba(0,180,216,.08)`, text `--cyan`.
- Inactive segment: transparent, text `--mute`.
- Mono 10px, 0.18em tracking, padding `7px 14px`.

**Centre divider.** A 1px × 20px `--rule` bar — separates the toggles from the chips visually.

**3. Comp chips.** A row of outlined competition chips. Each chip:

```
┌────────────────────┐
│ ■ EPL  9           │
└────────────────────┘
```

- Outlined rectangle, 1px border. **Inactive:** `--rule` border, `--paper` label text, `--mute` count.
  **Active:** border = competition tone (cyan/gold/purple/red), text = same tone.
- Inside, left-to-right: 6×6 filled square in the competition tone, then code (`EPL`/`UCL`/`UEL`/`FAC`) in mono 10px, then the count in `--mute` mono.
- Padding `5px 10px`. No radius.
- First chip is `ALL` (no tone square; border = `--paper` when active).
- Count behaviour differs by view mode: in LIST, counts reflect the **current Gameweek**; in MONTH, counts reflect the **current Month**.

**4. Right-side pager.** A single outlined unit, three cells. Shape is identical between view modes — content swaps.

```
LIST view:                          MONTH view:
┌─────┬──────────────────────┬─────┐  ┌─────┬───────────────────┬─────┐
│  ‹  │  GAMEWEEK            │  ›  │  │  ‹  │   APRIL  2026     │  ›  │
│     │  GW 12   13–18 SEP   │     │  │     │                   │     │
└─────┴──────────────────────┴─────┘  └─────┴───────────────────┴─────┘
```

- 1px `--rule` border. No radius. 34px tall.
- LIST mode centre cell: mono 9px `GAMEWEEK` (`--mute`) above; Archivo Black 14 `GW 12` + mono 9 `13–18 SEP` (`--mute`) side-by-side.
- MONTH mode centre cell: Archivo Black 14 `APRIL` + mono 10 `2026` (`--mute`) side-by-side, vertically centered (no eyebrow label — the word "month" is implicit in MONTH view).
- Arrow buttons (`‹` / `›`): 34×34, transparent background, mono 14px, `--paper`, 1px `--rule` divider between cells.

The controls strip has a `1px solid var(--rule)` bottom border.

### 3.4 Section bands (band 4 / 6)

Two flavours, used depending on the **Group by** mode.

**Date band** (when grouped by date):

```
│  SAT  13 SEP  ─────────────────  6 MATCHES
```

- 3px wide × 18px tall **paper** bar at the left (not a competition tone — date bands are tone-neutral).
- Day name: Archivo Black, 20px, sentence-case (`SAT`, `SUN`, `MON`…).
- Date: Mono 11px, 0.18em tracking, `--mute` (`13 SEP`).
- Long horizontal `1px solid var(--rule)` filling the remaining space.
- Right side: Mono 10px `--mute`, e.g. `6 MATCHES`.
- Padding `20px 18px 10px`.

**Comp band** (when grouped by competition):

- Same shape as the date band, except:
  - 3px bar is the **competition tone** (cyan/gold/purple/red).
  - Title is the full competition name in Archivo Black 16, `.04em` tracking (`PREMIER LEAGUE`, `CHAMPIONS LEAGUE`).
  - Mono 10px **competition code** (`EPL`/`UCL`) in the tone colour, between the title and the rule.
  - Right side same: `6 MATCHES`.

### 3.5 Fixture row (band 5)

This is the most important component. **Build it once** as `<FixtureRow>` and reuse across V1/V2/V3 and mobile.

```
┌────┬────────────────────┬──────────┬────────────────────┬────────┬────┐
│ FT │ LIVERPOOL          │  4 — 2   │ AFC BOURNEMOUTH    │ 12:30  │EPL │
│    │ LIV                │          │ BOU                │        │    │
└────┴────────────────────┴──────────┴────────────────────┴────────┴────┘
```

Six columns, grid: `56px 1fr 96px 1fr 64px 40px`. Gap 16px. Padding `14px 18px`. Bottom border `1px solid var(--rule)`. The last column (`40px`, competition tag) is **only rendered when grouped by date** — when grouped by competition, omit it and use grid `56px 1fr 96px 1fr 64px`.

**Column 1 — Status pill** (48 wide × 24 tall, padding `0 8px`):

| status | bg                   | text colour    | content                          |
|--------|----------------------|----------------|----------------------------------|
| FT     | `var(--ink-3)`       | `var(--mute)`  | mono 10px `FT`                   |
| LIVE   | `rgba(239,68,68,.12)`| `var(--danger)`| 5×5 pulsing red dot + mono `74'` |
| KO     | transparent, 1px `--rule` border | `var(--paper)` | mono 10px `15:00`     |

**Column 2 — Home team** (right-aligned):
- Line 1: team name, Archivo Black 14, `-0.01em`, UPPERCASE.
  - Colour = `--paper` if home won; `--mute` if drew or lost; `--paper` if not yet played.
- Line 2: 3-letter code, mono 9px `--mute`.
- Ellipsis on overflow.

**Column 3 — Score block** (centered, 96px min-width):
- For finished/live matches: `[H]  ─  [A]` — Archivo Black 18, `-0.02em`, with a 6×1 `--rule` separator dash between numbers, 10px gap each side.
- Winning number `--paper`, losing number `--mute`, draw both `--mute`. (Yes, in a draw both sides recede — keeps the "the score is the hero" rule honest; the day band carries the importance.)
- For not-yet-played (`KO`, no score): mono 11px `15:00` in `--mute`, centered.

**Column 4 — Away team** (left-aligned): same as column 2 but `text-align: left` and `awayWon` controls the colour.

**Column 5 — Kickoff time**: mono 9px `--mute`, right-aligned. (Redundant with the status pill for `KO` matches; that's fine — it gives FT rows a date/time anchor.)

**Column 6 — Comp tag** (only when grouped by date): 32×18 outlined rectangle, border + text = competition tone, Archivo Black 9px, `.04em`, content = `EPL`/`UCL`/etc. Same family as the position chip in Squad.

**Row treatment for LIVE matches:** background `rgba(239,68,68,.04)` + 2px `--danger` left border (replacing the transparent 2px placeholder all rows carry).

### 3.6 Spacing & overflow

- Body scrolls vertically inside its own container — the page itself does not scroll. Header/tabs/controls are sticky.
- Section bands have generous top padding (`20px`) and tight bottom padding (`10px`) so date/comp headers anchor visually.
- Rows are dense at `14px 18px`. Do not pad them more — the data is the show.

---

## 4. Data shape

```ts
type Fixture = {
  id: string;
  date: string;       // ISO "YYYY-MM-DD"
  day: 'MON'|'TUE'|'WED'|'THU'|'FRI'|'SAT'|'SUN';
  dnum: string;       // "13"
  dlong: string;      // "13 SEP" (display)
  kickoff: string;    // "15:00" (24h, local)
  comp: 'EPL'|'UCL'|'UEL'|'FAC';
  status: 'FT'|'LIVE'|'KO';
  live?: string;      // "74'" — required iff status === 'LIVE'
  home: { name: string; code: string };
  away: { name: string; code: string };
  score: [number, number] | null;   // null iff status === 'KO'
};
```

```ts
const COMPS = {
  EPL: { code:'EPL', name:'PREMIER LEAGUE',   tone:'#00B4D8' },  // cyan
  UCL: { code:'UCL', name:'CHAMPIONS LEAGUE', tone:'#E0A800' },  // gold
  UEL: { code:'UEL', name:'EUROPA LEAGUE',    tone:'#A855F7' },  // purple
  FAC: { code:'FAC', name:'FA CUP',           tone:'#EF4444' },  // red
};
```

**Do not add new competitions or new tones inline.** If you need a fifth competition, add it to `COMPS` with a tone justified against `tokens.css` first.

---

## 5. Behaviour

### 5.1 Gameweek pager

- Initial state: current Gameweek (server-driven).
- `‹` / `›` step by 1. Past GW1, disable `‹` (style: arrow `--mute`, cursor default). Past the season's last GW, disable `›`.
- The date-range string (`13–18 SEP`) reflects the selected GW's first → last fixture date.
- Changing GW refetches fixtures and resets the date/comp grouping accordingly. Filter chips and the group-by toggle persist across GW navigation.

### 5.2 Group-by toggle

- Default: `BY DATE`.
- Switching to `BY COMPETITION` re-groups the same filtered fixtures under comp bands. Within each comp band, fixtures are sorted by date then kickoff.
- Inside each date band, fixtures are sorted by kickoff time then by competition.

### 5.3 Comp chips

- Single-select (radio behaviour). Default: `ALL`.
- Selecting a chip filters the fixture list and updates counts? **No — counts always reflect the unfiltered gameweek.** The chip count is "how many fixtures of this competition exist in this GW", not "after applying other filters". Single-select means there are no other filters.
- The `ALL` chip is always present and always shows total GW fixture count.

### 5.4 LIVE updates

- Polling cadence: every 30s for `LIVE` fixtures (only). Don't poll FT or KO.
- On a fixture transitioning `KO → LIVE`, animate the row's left border in over 200ms; on `LIVE → FT`, animate it out and swap the pill.
- Don't auto-scroll to live matches. The user is in control of the view.

---

## 6. Mobile breakpoint

Reference: `ScoresMobile` in `scores-screens.jsx`. Width: 390px.

- Status bar (32px), wordmark + `LIVE NOW` indicator, sub-tabs — identical pattern to Squad mobile.
- Page eyebrow + title rendered **inline** in the scroll area, not in a fixed header (saves vertical space).
- Controls strip becomes **two rows**:
  - Row A: group-by segmented (full-width, flex) + a compact GW pager (28×28 arrows, no date-range string).
  - Row B: horizontally-scrolling chip row (`overflow-x: auto`).
- Fixture row collapses to 4 columns: `40px 1fr 60px 1fr` — status pill, home **code only** (no full name), score block, away **code only** + 2px competition tone bar on the right edge of the row. Drops the kickoff time column (it's already in the KO status pill) and drops the comp tag (replaced by the right-edge tone bar).
- Score block: Archivo Black 16 instead of 18. Otherwise same dim-loser treatment.

Mobile reuses the same `<DateBand>` / `<CompBand>` / `<FixtureRow>` primitives — just pass a `mini` prop. **Do not duplicate components for mobile.**

---

## 7. Component checklist

Build these as standalone primitives in `scores-screens.jsx` (or split into `scores/` directory):

**Shared chrome (both view modes):**
- `<ScoresHeader liveCount totalCount />` — band 1.
- `<SubTabs active />` — band 2 (already exists in your codebase if you've harmonised — reuse).
- `<ViewToggle value onChange />` — left of band 3. Values: `'list' | 'month'`.
- `<GroupByToggle value onChange />` — band 3 (only when `view==='list'`).
- `<CompChip comp count active onClick />` and `<AllChip count active onClick />` — middle of band 3.
- `<GameweekPager gw dateRange onPrev onNext />` — right of band 3 (only when `view==='list'`).
- `<MonthPager year monthIndex onPrev onNext />` — right of band 3 (only when `view==='month'`).

**List view:**
- `<DateBand g mini />` — band 4 (date variant).
- `<CompBand comp count mini />` — band 4 (comp variant).
- `<StatusPill f small />` — col 1 of a row.
- `<Score f big />` — col 3 of a row.
- `<FixtureRow f showComp dense />` — the row itself.
- `<MobileFixtureRow f />` — only if `<FixtureRow>` can't collapse cleanly with a `dense` prop. Prefer the prop.

**Month view:**
- `<MatchStrip f />` — one match inside a day cell (see §8.3).
- `<DayCell cell matches isWeekend />` — one cell of the calendar grid (see §8.4).
- `<ScoresMonthGrid />` — composes the cells into the 7-column grid.

Page composition (`ScoresV1` — list mode):

```jsx
<Shell sidebarActive="scores">
  <ScoresHeader … />
  <SubTabs active="SCORES" />
  <div className="controls">
    <ViewToggle value="list" … />
    <GroupByToggle … />
    <Divider />
    <ChipsRow … />
    <GameweekPager … />
  </div>
  <div className="body">
    {view==='date'
      ? dateGroups.map(g => <DateBand /> + g.fixtures.map(<FixtureRow showComp />))
      : compGroups.map(g => <CompBand /> + g.fixtures.map(<FixtureRow />))}
  </div>
</Shell>
```

---

## 8. Month view

Reference: `ScoresV4MonthGrid` in `scores-screens.jsx`. The month view is a **peer view mode** of the list view — same header, same sub-tabs, same comp chips, swapped pager (Gameweek → Month). It is **not** an alternate or an optional add-on.

### 8.1 Why a month view (and what to avoid)

A first attempt at this view treated all 35–42 calendar cells identically — same border, same background, same day-number weight. The result was 50% dead space because Premier League is weekend-heavy. Match entries were rendered as flat mono text (`ARS 1-2 BOU`), losing the score-as-hero rule.

The build below fixes both with **four moves**:

1. **Surface hierarchy.** Only days with matches get the `--ink-2` surface. Empty in-month days drop to page background. Out-of-month days fade to 35% opacity. The eye lands on the action.
2. **Match strips with real type.** 3px tone bar + Archivo Black codes + Archivo Black score with the dim-loser rule (same as `<FixtureRow>`). No bulleted mono text.
3. **Three statuses, one strip.** FT shows the score with dim-loser. LIVE swaps the tone bar for `--danger` red and adds a pulsing minute marker. KO hides the score and shows the kickoff time on the right.
4. **Weekend + today emphasis.** Sat/Sun column headers in `--paper` (not `--mute`). Today gets a 2px `--cyan` top edge, a cyan day number, and a `TODAY` mono tag.

### 8.2 Anatomy

```
┌─ Page header (§3.1) ────────────────────────────────────────────┐
├─ Sub-tabs (§3.2) ───────────────────────────────────────────────┤
├─ Controls strip (§3.3, MONTH variant) ──────────────────────────┤
├─ Weekday header row (MON TUE WED THU FRI SAT SUN) ──────────────┤
├─ Calendar grid: 5–6 rows × 7 columns, equal-height ─────────────┤
│  ┌───────┬───────┬───────┬───────┬───────┬───────┬───────┐      │
│  │  30   │  31   │   1   │   2   │   3   │   4   │   5   │      │
│  ├───────┼───────┼───────┼───────┼───────┼───────┼───────┤      │
│  │   6   │   7   │   8   │   9   │  10   │  11   │  12   │      │
│  │       │       │       │       │ WHU 4 │ ARS 1 │ SUN 1 │      │
│  │       │       │       │       │ -0 WOL│ -2 BOU│ -0 TOT│      │
│  │       │       │       │       │       │ + 3 …  │ + 3 …  │     │
│  └───────┴───────┴───────┴───────┴───────┴───────┴───────┘      │
└─────────────────────────────────────────────────────────────────┘
```

**Weekday header row.**
- 7 equal columns, each padding `10px 12px`.
- Mon–Fri labels: mono 9px, `--mute`, 0.22em tracking.
- Sat/Sun labels: mono 9px, **`--paper`** (asserts the weekend rhythm).
- 1px `--rule` between columns and below the header.

**Calendar grid.**
- `display: grid; grid-template-rows: repeat(N, 1fr); grid-template-columns: repeat(7, 1fr);` — N is 5 or 6 depending on month.
- Equal row heights — do not let Saturday rows expand. Overflow is handled inside the cell via `+N MORE` (see §8.4).
- 1px `--rule` borders right + bottom on each cell. No outer wrapper border (the controls strip and page edges bound the grid).

### 8.3 Match strip

The atomic unit of the month view. Build as `<MatchStrip f />`.

```
┌──┬──────────────────────────────────────┐
│██│ LIV  4 ─ 2  BOU            12:30     │   ← KO (upcoming): tone bar, no score, time
│██│ LIV  4 ─ 2  BOU                      │   ← FT: tone bar + dim-loser score
│██│ BUR  0 ─ 1  MCI          ● 74'       │   ← LIVE: danger bar + pulsing minute
└──┴──────────────────────────────────────┘
   ↑ 3px tone bar (or danger for LIVE)
```

- Height **22px**, flex row.
- **Left bar**: 3px wide, full-height. Color = competition tone for FT/KO, `--danger` for LIVE.
- **Body**: padding `0 6px`, gap 5px, flex 1, min-width 0.
- **Codes**: home + away in Archivo Black 10px, `.02em` tracking. Color:
  - FT: winner `--paper`, loser `--mute`, draw both `--mute`.
  - KO (no score): both `--paper`.
- **Score**: Archivo Black 10px, `-0.02em` tracking, with a 3×1 `--mute` separator dash. Each number coloured independently by the dim-loser rule.
- **VS (when no score)**: replaces the score block with mono 8px `VS` in `--mute`, 0.18em tracking.
- **Right-side indicator** (after a flex-spacer):
  - LIVE: mono 8px `--danger`, with a 4×4 pulsing `--danger` dot + the minute (`74'`). 0.14em tracking.
  - KO: mono 8px `--mute` kickoff time (`12:30`).
  - FT: nothing — the score is enough.
- **Background**: `rgba(255,255,255,.015)` baseline; LIVE strips get `rgba(239,68,68,.07)`.

### 8.4 Day cell

Build as `<DayCell cell matches isWeekend />`.

**Surface treatment** — the most important rule:

| State                  | Background                       | Opacity | Notes                       |
| ---------------------- | -------------------------------- | ------- | --------------------------- |
| Out-of-month           | transparent                      | 0.35    | Day number visible but dim. |
| In-month, no matches, weekday | transparent               | 1       | Empty placeholder.          |
| In-month, no matches, weekend | `rgba(15,18,24,.35)`      | 1       | Subtle weekend tint.        |
| In-month, has matches  | `var(--ink-2)`                   | 1       | The "raised" surface.       |
| Today                  | (above) + 2px `--cyan` top edge  | 1       | Plus cyan day number + `TODAY` tag. |

**Layout** (padding `8px`):

- Top row (flex, space-between, align baseline):
  - **Left**: a small mono 8px label, 0.22em tracking. `TODAY` (cyan) for today; `4 MATCHES` (`--mute`) for matchful days; empty otherwise.
  - **Right**: day number.
    - Matchful or today: Archivo Black 15px, `-0.01em`, `--paper` (cyan if today).
    - Empty: JetBrains Mono 12px, `.04em`, `--mute`.
- Strip stack: flex column, gap 3px. Each child is a `<MatchStrip>`.

**Overflow rule.** Maximum 4 strips visible per cell. If `matches.length > 4`, show the first 4 and a `+N MORE` line:
- Mono 8px, `--mute`, 0.18em tracking, padding `2px 0 0 6px`.

**Click-through.** The whole cell should be clickable (link to a day-detail or a list-mode-deep-link for that date). Individual strips should also be clickable for match detail.

### 8.5 Behaviour

- Default: current month. Today's cell is auto-emphasized but the view does **not** scroll-to-today (months are short enough; the cell is always visible).
- Month pager (§3.3 part 4) steps by ±1 month. Disable `‹` at the season start month and `›` at the season end month.
- Comp chips filter the **whole month** in place. Counts reflect the month (not the current GW).
- LIVE polling: same cadence as list view (30s). Strips animate the bar swap and the minute number without re-rendering the whole cell.

### 8.6 Mobile note

The month view does **not** ship to mobile at narrow widths. Below ~640px, the calendar grid collapses to unreadable. On mobile, the `LIST | MONTH` toggle should be hidden entirely; mobile is list-only. (If you really need a month view on mobile, switch to a vertical "agenda" — one row per day of the month, hidden days collapsed. Don't try to shrink the 7-column grid.)

---

## 9. Alternates (do not build unless asked)

Two other directions are mocked in `Scores Redesigns.html`. They are listed here so you can recognise them — don't ship them by default.

- **V2 — Split rail** (`ScoresV2`). Replaces the comp-chip row with a 240px left rail listing competitions vertically (single-select, active-state matches sidebar's cyan-bar pattern). Use this if competition is genuinely the primary axis for your users (e.g. they live in one league and dip into others).
- **V3 — Week grid** (`ScoresV3`). One column per day of the gameweek. Each fixture is a `<DayCard>` (compact, two-line score, comp tone as a 2px left border). Use this if your gameweeks routinely span 5+ days with European nights — the calendar is the metaphor. Note: V4 (§8) supersedes this for the "calendar feeling" use case — V3 is essentially a one-week slice of V4 and would only ship if you want to fold week-detail into the list view as a sub-tab.

If you build an alternate, **don't mix it with V1/V4**. Pick one chrome and stick to it for the whole screen.

---

## 10. Anti-patterns — do NOT ship these

- ❌ A vertically scrolling list with no Gameweek pager. Pagination is the point.
- ❌ Crests, club logos, or country flags in the row. Codes only.
- ❌ A coloured pill on the team name to indicate winner. Use the dim-loser rule on the **score**, not on the names.
- ❌ Cyan score numbers. Cyan is reserved for primary action / primary metric (the "your points this GW" elsewhere). The score is `--paper`/`--mute`.
- ❌ Filled status pills. `FT` is on `--ink-3`, `LIVE` is on `rgba(239,68,68,.12)` — both barely-there. Don't slam a solid green/red rectangle in there.
- ❌ Mixing both groupings on the same screen (date headers AND comp headers stacked). That's what the toggle is for.
- ❌ A scrubbable date picker. The pager (Gameweek in list view, Month in calendar view) is the only time navigation.
- ❌ Loading spinners between gameweeks. Use a 100ms skeleton at most — gameweeks are small.

**Month-view-specific anti-patterns:**

- ❌ Equal-treatment cells. Empty Tuesday and packed Saturday must not look the same. If you find yourself drawing the same `--rule` border around every cell, stop — §8.4 is the whole point.
- ❌ Flat mono match entries like `ARS 1-2 BOU` on a single line. Use the strip primitive in §8.3 with the dim-loser rule.
- ❌ Bulleted lists (• or ●) in front of match entries. The tone bar **is** the visual anchor.
- ❌ Variable row heights to fit packed Saturdays. Keep rows equal; use `+N MORE` overflow.
- ❌ Trying to ship the month view to mobile. It's desktop-only — see §8.6.
- ❌ Drawing fixtures across day boundaries (a single bar spanning Sat→Sun). Each match belongs to one day.

---

## 11. Build order

1. Drop `scores-data.jsx` and the typed `Fixture` shape into the project. Wire up the data source (REST/socket) behind it.
2. Build the list-view primitives in §7 in isolation. Get `<FixtureRow>` perfect first — every other list-view component depends on it visually.
3. Compose `<ScoresV1>` (list mode) and check it against the artboard at 1280×840.
4. Build the mobile breakpoint by passing `mini`/`dense` props to the same components.
5. Wire LIVE polling (§5.4).
6. Build the month-view primitives (`<MatchStrip>`, `<DayCell>`, `<MonthPager>`) per §8.
7. Compose `<ScoresV4MonthGrid>` and check against the artboard at 1480×1000.
8. Wire the `<ViewToggle>` to switch the body between list and month modes, keeping the comp-chip filter persistent across the toggle.
9. **Only then** consider alternates from §9 if explicitly requested.

---

## 12. Files in this handoff

- `tokens.css` — design tokens (already in project root)
- `FORZAKIT-UI-Overhaul.md` — base UI rules (sidebar, type, status, etc.)
- `FORZAKIT-Scores-Build.md` — **this document**
- `Scores Redesigns.html` — visual reference, includes V1 (list, canonical), V4 (month, canonical), V2/V3 (alternates), and mobile.
- `scores-data.jsx` — fixtures data + helpers (`COMPS`, `FIXTURES`, `groupByDate`, `groupByComp`).
- `scores-screens.jsx` — `ScoresV1`, `ScoresV2`, `ScoresV3`, `ScoresV4MonthGrid`, `ScoresMobile` React components plus shared primitives.
