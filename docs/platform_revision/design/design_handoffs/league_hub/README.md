# Handoff — League Hub (Forza Fantasy League)

> ⚠️ **Kit Light porting notes — read before implementing**
>
> This handoff was built in the **dark Forza direction**. Use it for structural reference only — layouts, component anatomy, data shapes, copy. Visual tokens are wrong; use [`TOKEN_MIGRATION.md`](../TOKEN_MIGRATION.md) to substitute all colours and radii.
>
> **Three things that changed in the Kit Light redesign:**
> 1. **`HubActionBar` (MANAGE SQUAD + MARKET strip) is removed.** Do not implement. These are top-level nav destinations — no dual CTA bar inside the league hub. See BRIEF.md.
> 2. **Tab count is TBD.** The dark handoff shows 7 tabs + Admin. Kit Light targets fewer tabs, but the exact count and consolidation of Auctions/Chat/Stats is an open product decision pending multi-sport and P2P architecture. Build structure to accommodate a variable number of tabs. Do not hardcode 7 or 8.
> 3. **DeltaPill colours:** the spec below references `#22C55E` (positive) and `#EF4444` (danger) — these are the old neon dark-background values. In Kit Light use `var(--pos)` (`#166534`) and `var(--neg)` (`#B91C1C`) on light surfaces. On `--shell` dark surfaces use `#4ADE80` / `#F87171`.

## Overview

The **League Hub** is the deepest section of FORZAKIT — the workspace a manager opens when they want to live inside one of their leagues. A single league (e.g. *Office Heroes*) is the unit of attention; everything in this hub is scoped to that league.

The hub has **seven primary tabs** and a small set of secondary drill-in screens that open from rows inside those tabs:

1. **Leaderboard** — standings, current captain per manager, form, live activity rail.
2. **Frontpage** — the *Forza Times*, an in-app newspaper that summarises what's happened in the league. The brand showcase moment.
3. **Bets** — open / pending / resolved predictions that managers make for bonus points.
4. **Betting** — performance dashboard showing who's good at picking, your ROI vs the league.
5. **Auctions** — players currently open for league bidding, plus "blocked" players already owned (no two managers can own the same player).
6. **Chat** — league chat channels with system messages for trades and auctions.
7. **Stats** — league-wide dashboards: weekly chart, captaincy hit rate, position breakdown, biggest GWs.

Plus drill-ins:
- **Manager profile** (from a standings row) — squad readout, H2H vs you, manager habits, recent bets.
- **Make Pick** (from a bet card) — player picker with payout preview.
- **Auction detail** (from an auction card) — bid stage, bid history, auto-bid.
- **Forza Times Article** (from a headline) — long-form read view, paper aesthetic.

A single chrome (topbar + dual-CTA action bar + tab nav) is shared by every tab. Each tab fills the same 1440-wide frame; only the body differs.

## About the Design Files

The files in this bundle are **design references created in HTML/React** — prototypes showing intended look and behaviour, **not production code to copy directly**. The task is to recreate these designs in the target codebase's environment using its established patterns and libraries.

If the live app is React/Next.js, lift the components as-is and rewire data. If it's another framework, the design system is portable — the CSS variables, type pairs, and component anatomies translate cleanly.

The HTML prototype `Leagues Redesigns.html` opens in a "design canvas" (a pannable surface with multiple artboards). Open it in a browser. Click the focus button on any artboard to view it fullscreen; use ←/→ to walk between artboards in a section, ↑/↓ between sections, Esc to exit.

## Fidelity

**High-fidelity.** Exact colours, typography, spacing, border treatments, and interaction states are specified below and implemented in the prototype. Recreate pixel-perfectly using the codebase's component primitives.

---

## Screens

There are **two surfaces** in scope here: Desktop (≥1024px) and Mobile (390px design width). Both are fully designed in this handoff. Tablet is not designed; pick the closer of the two extremes at ~900px.

All desktop artboards are 1440 design width. All mobile artboards are 390 design width. Heights vary because content density does (Frontpage and Bets are taller).

> **Mobile screens** live in `src/league-mobile-*.jsx` and are previewed in `Leagues Mobile.html`. The §Mobile section at the bottom of this document covers anatomy differences and what changed from desktop. Read the desktop sections first — the mobile screens use the same component vocabulary unless explicitly noted.

### 1. Leaderboard

**Purpose:** see where you stand. Quick scan to read the league at a glance, and a deep table for drill-down.

**Layout:**
1. **Hub topbar** — `← BACK · COMPETITIVE CENTER` eyebrow + cyan dot + `OFFICE HEROES` display title + `· 14 MEMBERS · GW28` mono. Right: QUICK FILL + INVITE buttons + `● LIVE` indicator.
2. **Action bar** — two equal cells, `MANAGE SQUAD` (purple) and `MARKET` (positive green). `padding: 14px 18px; border-bottom: 1px solid var(--rule)`. Used on every tab.
3. **Tab nav** — 8 tabs (the seven primary + ADMIN). Mono 11px, .22em tracking. Active tab gets cyan underline indicator (2px) + `var(--paper)` colour. BETS and AUCTIONS show notify dots (red, 5px); CHAT shows an unread count in cyan.
4. **Spotlight strip** — 4 equal columns:
   - `GW 28` card with `MATCHDAY 5 · LIVE` eyebrow, deadline mono, right-aligned high score in danger.
   - Three **podium cards** — gold/silver/bronze medal numerals + monogram + name + squad + `+MD` in positive green + `TOT` mute.
5. **Body grid** — `grid-template-columns: 1fr 340px` (table + activity rail):
   - **Standings table** — header row (mono 9, mute): `# · MANAGER · CAPTAIN · GW28 · FORM · L5 · MD · TOT · ⌥`. Each row has rank + trend pill, monogram + name (with `LEADER` chip on rank 1, `You` label and cyan left-edge on your row), captain (gold pip + name + `Xpts · 2× APPLIED`), form dots (5 × W/D/L), MD points (green when ≥70), TOT, and per-row action buttons (`H2H` cyan-outline, `VIEW` mute-outline).
   - **Activity rail** — `LEAGUE ACTIVITY` section header with kicker icon by type (goal / bid / trade / bet / pin / rankup / auction / frontpage). Footer filter chips: `ALL · GAME · BETS · TRADES`.

### 2. Frontpage — *Forza Times*

**Purpose:** the league reads itself like a newspaper. A digestible, narrative recap of what just happened, designed to be looked-at rather than scanned. **This is the brand showcase moment** — the only screen that breaks the dark UI on purpose.

**Layout:**
1. Standard hub chrome (topbar + action bar + tabs).
2. **The paper** — a cream-bg sheet inside the dark frame, with a generous box-shadow to feel "printed". Outer padding `20px 28px 28px`; sheet padding `34px 44px`.
3. **Masthead** — three columns of mono meta (`VOL · V · The Official Gazette · EDITION · #5`), then the `FORZA TIMES` wordmark in Playfair Display 900 italic at 82px, then a serif italic dateline.
4. **Double rule** — 1px + 4px black bars beneath the masthead.
5. **Cover grid** — `grid-template-columns: 2.1fr 1fr 1.2fr`:
   - **Lead story** — kicker (mono red), serif 54px headline (balanced, drop-cap on the deck), striped placeholder lead photo with a mono label tile, deck with drop cap, continuation paragraph, mono byline.
   - **Secondary column** — two stacked sub-stories with light rule between, kicker + 26px serif headline + 14px serif deck + byline. Walled with thin vertical rules.
   - **Sidebar column** — three boxes: a heavy-ruled standings table, an indented pull-quote, a thin-ruled box score.
6. **Below the fold** — 4-column row with three more stories and a `CLASSIFIEDS · TRANSFERS & WAGERS` aside (dashed-rule entries with WANTED/OFFERED/WAGER tags).
7. **Colophon** — three mono spans across the bottom.

### 3. Bets

**Purpose:** the league offers managers prediction markets ("MD5 Top Scorer", "Block an opponent player", "Over/Under your GW total", "Predict outcome", "Your H2H"). Win → bonus points stack onto your league total.

**Layout:**
1. Standard chrome.
2. **Hero strip** — `1.6fr 1fr 1fr 1fr`. Left cell: kicker + Archivo Black display headline + mono support. Three mini-stat cells: OPEN / PENDING / THIS GW.
3. **Three sections** in order: `OPEN · MAKE YOUR PICKS`, `PENDING RESULTS`, `RESULTS`. Each section has a 3px-bar label header (cyan / gold / mute).
4. **Bet row** — a card with `grid: 1fr auto` (body + action panel):
   - Body: square kind icon (`◉ ⛌ ≷ ⚔ ◈`) + title in kind tone + `· CODE` mono + payout chip `+N PTS` (right). Question in 13px Archivo. For OPEN bets, option chips (selected = cyan outline + cyan tint + checkmark). For PENDING, a gold mono note. For RESOLVED, `ANSWER · X` + `YOUR PICK · Y` in green/red. Footer mono with countdown / status copy.
   - Action panel: bordered left-side cell, contains the primary `MAKE PICK →` CTA (cyan), or `● PENDING` mono (gold), or `● WON / LOST` mono.

### 4. Betting

**Purpose:** performance dashboard. How good are you at betting? Where in the league do you rank? Which bet types pay you and which lose you points?

**Layout:**
1. Standard chrome.
2. **Hero strip** — your stats: `YOUR BETTING` headline + total points won; then PLAYED / WON / WIN% / STREAK cards.
3. **Body** — `1.4fr 1fr` (leaderboard + right rail).
   - **Betting leaderboard** — same row pattern as Standings, but columns are tailored: `# · MANAGER · L8 GW · W-L · WIN% · STREAK · PROFIT`. The L8 column shows a tiny sparkline (gold for #1, cyan otherwise).
   - **Right rail** — `YOUR PERFORMANCE BY BET TYPE` (progress bars per type: fixture / top-scorer / over-under / block / h2h, each with `W-L` and `%`); then `RIVALS WATCH` (3 manager cards showing point gap + a note).

### 5. Auctions

**Purpose:** open-market bidding for players. *Rule:* no two managers in a league can own the same player — so the right rail surfaces **BLOCKED** players (who has them) and lets you offer a trade.

**Layout:**
1. Standard chrome.
2. **Hero strip** — `2fr 1fr 1fr 1fr 1fr`: kicker + display headline; LIVE / STARTING / BLOCKED / BUDGET counters.
3. **Body** — `1fr 320px` (auction grid + blocked rail).
   - **Auction cards** — 2-column grid. Card has a position tag (FWD/MID/DEF/GK with position tone), player name (Archivo Black 18px), club + opener mono, then `CURRENT` (gold) and `LEADING` (monogram + name). Footer: `YOUR MAX`, `BID +0.5 →` cyan CTA (or `EDIT MAX` outline when you're leading). Live cards show `● 12m 04s` closing clock top-right; the left edge tints green when you're leading.
   - **Recent gavels** — narrow rows with position chip + player + `WON BY <monogram + name>` + price.
   - **Blocked rail** — cards with a hatched overlay, owner monogram, and a dashed `OFFER TRADE TO XXX →` CTA.

### 6. Chat

**Purpose:** the league talks. Mention, react, pin, and post system messages from auctions/trades.

**Layout:**
1. Standard chrome.
2. **Body** — `240px 1fr 280px` (channels rail + main + members rail).
   - **Channels rail** — `CHANNELS` section: `#league-chat (active), #trash-talk, #auction-house, #bets-and-bonus, #tactics-notes`, each with optional unread count chip. Then `DIRECT` with online dots.
   - **Main** — section label, optional pinned banner (gold tint when present), date divider rule, scrollable message list, composer at bottom (`Roast your rivals…` placeholder with mention/slash-command hint).
   - **Message** — `38px 1fr` grid: 22px monogram + (name in manager hue + time mono + optional `· SYSTEM BADGE`) + message body with auto-linkified `@mentions` and `/commands` (cyan tint), then reaction chips `🔥 3 / 🤝 4 / 🙏 2` and a `+` add-reaction.
   - **Members rail** — full list with online dots, admin tag for league owner.

### 7. Stats

**Purpose:** the dashboard. Numbers and shapes, not lists.

**Layout:**
1. Standard chrome.
2. **Hero strip** — total points / avg per manager / biggest GW.
3. **2×2 card grid** — each card has the section-label header pattern:
   - `WEEKLY TOTALS · TOP 3` — multi-line SVG chart, three coloured legend chips, dashed y-grid, GW labels every other tick.
   - `POSITION BREAKDOWN` — SVG donut (GK/DEF/MID/FWD slices) + legend bars on the right.
   - `CAPTAINCY · HIT RATE` — monogram + manager + favourite captain + progress bar + `hits/captaincies` + percentage (green ≥70%, gold ≥50%, danger <50%).
   - `BIGGEST GAMEWEEKS · LEADERBOARD` — top 4 rows: rank in gold, monogram, manager + GW + chip note, points in Archivo Black.

---

## Drill-in screens

### Manager Profile (from a standings row)
- Mini topbar (`← OFFICE HEROES · MANAGER PROFILE`) + actions (`CHALLENGE H2H · PROPOSE TRADE · @ MENTION IN CHAT`).
- Hero: 96px monogram tile, rank kicker in the manager's hue, name display (44px), squad + handle mono. Right: GW28 in positive green + SEASON in paper.
- Three-column body:
  - **CURRENT XI · 4-3-3** — lined-up player chips by row with position-tone left edge; bench mention.
  - **H2H vs YOU · ALL-TIME** — three stat blocks (Wins/Draws/Losses) + 4 recent matchups list.
  - **MANAGER HABITS** — 2×2 stat cards (Captain hit rate / Avg transfers / Bet ROI / Chips used) + a Recent Bets list (won/lost dot, title, pick, result).

### Make Pick (from a bet card)
- Mini topbar + countdown.
- Body grid `1fr 380px`:
  - Left: bet eyebrow + 38px display question + explainer. Option list — each a clickable row with radio, name (Archivo Black 16) + club + sparkline of last-5 form, `% of league picking` mono, odds multiplier in gold, `PICK` / `PICKED` tag right.
  - Right rail: `PAYOUT` big number (changes with selection), `WHO'S PICKED WHAT · 6/12` (monogram pile per option), fine-print mono, locked `LOCK IN PICK →` CTA.

### Auction Detail (from an auction card)
- Mini topbar + pulsing live indicator with closing countdown.
- Body grid `1.3fr 1fr`:
  - Left: position tag + player name display 54px + meta mono; two cards side by side: `FORM · LAST 5 GW` sparkline + numbered ticks; `BID STAGE` showing current bid in 44px gold + `9 BIDS · 3 ACTIVE BIDDERS` + a bid stepper `−0.5 / £XX.Xm / +0.5` + `PLACE BID` CTA. Below: full `BID HISTORY · NEWEST LAST` with monogram, name, optional note, amount.
  - Right rail: `BIDDERS · 3 ACTIVE` (monogram + name + bid count + max, leading bidder has green left edge); `AUTO-BID · SAFE MAX` ceiling input with `ARM →`; anti-snipe explainer.

### Forza Times Article (from a headline)
- Mini topbar with article-tool affordances (`SHARE · A− A+ · BOOKMARK`).
- Centered paper sheet (max-width 980px). Kicker red mono, serif 62px headline, italic 20px deck (mute), mono byline.
- Lead photo placeholder with caption.
- Two-column serif body with drop cap.
- Footer with tags + "Next article" cue.

---

## Components (specific anatomies)

### `HubTopbar`
- `display: flex; justify-content: space-between; padding: 18px 28px; border-bottom: 1px solid var(--rule); background: var(--ink)`.
- Left: eyebrow (mono 10, .2em, mute) + row: 8px cyan dot, display 28px, mono mute 10 with member/GW count.
- Right: rightSlot (page-specific) + `● LIVE` mono.

### `HubActionBar`
- `grid-template-columns: 1fr 1fr; border-bottom: 1px solid var(--rule)`.
- Left button: purple, square icon glyph + `MANAGE SQUAD`, vertical rule on the right.
- Right button: positive green, square icon glyph + `MARKET`.
- Buttons are visually centred; mono 12, .22em.

### `HubTabs`
- 8 tabs, mono 11, .22em.
- Active: `color: var(--paper); font-weight: 600`, with a 2px cyan underline (`bottom: -1px`, left/right inset 14px so it doesn't span the cell padding).
- Notify dot: 5px red circle inline.
- Unread count: cyan 10px after the label.

### `MgrTag` (the monogram badge)
- Inline flex, default 18px height + 10px min-width padding (sizes scale together).
- `background: <hue>18` (12% alpha), `border: 1px solid <hue>66`, `color: <hue>`, mono 9–10, .12em.
- Used everywhere a manager appears: standings, podium, chat avatar, bidders, classifieds bylines, activity rail, etc.

### `TrendPill`
- `=` for 0 in mute mono.
- `▲ N` or `▼ N` in positive / danger; Archivo Black 8 glyph + mono 10 number.

### `FormDots`
- A row of W/D/L 14×14 cells with `<tone>22` bg, `<tone>55` border, tone-coloured letter; W=positive, D=mute, L=danger.

### `Spark`
- Single-colour polyline with circle markers at each point. Dashed zero line. 88×22 default; opts: width, height, tone, hideZero.

### `HubSectionLabel`
- 3px-tall × 14px-wide tone bar + mono 11 label (.22em) + optional `· SUB` mono.
- Row sits inside `padding: 12px 20px; border-bottom: 1px solid var(--rule); background: var(--ink-2)`.
- Optional `right` slot.

### Newspaper specifics (Forza Times)
- Paper background: `#F2EEE5`. Ink: `#0A0E14`. Rule: `#D8D2C6`. Mute: `#5A6470`. Red accent: `#B0271E`.
- Serif: `'Playfair Display', 'Times New Roman', serif`. Mono: `'JetBrains Mono', monospace`.
- Drop cap: float-left 56px Archivo Black serif, padding-right 8.
- Image slots: 1px ink border, `repeating-linear-gradient(135deg, ink 0 1px, transparent 1px 12px)` over a warm grey, with a mono label tile centred.

---

## Interactions

### Tab switching
- Clicking a tab changes the route inside the league (e.g. `/leagues/office/leaderboard` → `/leagues/office/bets`). Persist the league id, change only the tab segment.
- No transition; instant content swap (consistent with Live Centre).
- The hub chrome (topbar + action bar + tabs) is shared; only the body changes.

### Row → drill-in
- **Standings row** → manager profile page (`/leagues/:id/manager/:mid`). VIEW button or row click. Row click should ignore inner button clicks.
- **Bet row** `MAKE PICK →` → `/leagues/:id/bets/:bid`.
- **Auction card** anywhere outside the BID button → `/leagues/:id/auction/:aid`. The BID button posts immediately at `current + 0.5`.
- **Frontpage headline** → article (`/leagues/:id/frontpage/:storyId`).

### Live updates
- Standings: rank trend, MD points and live activity rail are live — push from the same match-event service as Live Centre.
- Auctions: closing clock updates per second; anti-snipe rule = any bid in the final 30s extends the clock by 30s.
- Chat: typing indicator dots above the composer (not designed yet — keep minimal).
- Frontpage: regenerates per matchday; the `EDITION #` increments. Headlines auto-pick from biggest deltas.

### Anti-snipe & auto-bid
- Auto-bid: store a per-user `safeMax` per auction. On every outbid event, server places `min(currentBid + step, safeMax)` on behalf of the user. Stops the moment the next step would exceed `safeMax` or the user's free budget.
- Snipe extension: see above.

### Bet states
- `open` — picks may be set or changed up to the deadline.
- `pending` — deadline passed, result still computing.
- `resolved` — answer locked, payout banked, row freezes.

### Pulse animation
Same `@keyframes fkPulse` as the Live Centre handoff. Used on live auction dots, the topbar LIVE indicator, and the article CTA.

---

## State Management

Page state for the league hub (shared across tabs):
- `leagueId: string` — derived from URL `/leagues/:id/...`.
- `tab: 'leaderboard' | 'frontpage' | 'bets' | 'betting' | 'auctions' | 'chat' | 'stats' | 'admin'` — derived from URL.

Within tabs:
- `Bets`: optimistic pick state, debounced server commit. Reverts on error.
- `Make Pick`: local selection until `LOCK IN PICK →`. POST → server. Show toast on confirmation.
- `Auction detail`: `bid` value mirrors `current + step`; ±0.5 buttons mutate. `PLACE BID` POSTs to `/auctions/:id/bids`. Live history via socket or polling.
- `Chat`: standard messaging state — channel list, active channel, message page, optimistic send. Reactions are toggled by message-id + emoji.

Data the hub needs from upstream services (substitute real names):
- `useLeague({ id })` → league meta (name, members count, current GW, your rank, your captain choice).
- `useLeagueStandings({ id })` → row per manager with rank, trend, MD, TOT, current captain + points, form L5.
- `useLeagueActivity({ id, since })` → typed activity events.
- `useFrontpage({ id, edition? })` → the *Forza Times* edition: lead, stories, classifieds, standings snapshot, box score.
- `useBets({ id, state })` → bets filtered by state.
- `usePostBetPick({ id, betId })` → mutation.
- `useBettingPerformance({ id })` → per-manager rollups + sparkline series.
- `useAuctions({ id, state })` → live / starting / blocked / resolved.
- `useAuctionDetail({ id, aid })` → player meta, full bid history, eligible bidders.
- `usePlaceBid({ id, aid })` → mutation.
- `useChannel({ id, channel })` → messages, members, pins.
- `useLeagueStats({ id })` → weekly series, captain hits, position breakdown, biggest GWs.

---

## Design Tokens

All defined in `src/tokens.css` and `src/squad-shared.css`. Same tokens as the rest of FORZAKIT.

### Colours
| Token | Hex | Usage |
|---|---|---|
| `--ink` | `#080A0E` | Page background |
| `--ink-2` | `#0F1218` | Card background / side rails |
| `--ink-3` | `#161B25` | Bar tracks / inactive button bg |
| `--rule` | `#1E2530` | Dividers, borders |
| `--paper` | `#F2EEE5` | Primary foreground |
| `--mute` | `#8B95A1` | Secondary foreground |
| `--cyan` | `#00B4D8` | Primary accent (FORZAKIT) |
| `--gold` | `#E0A800` | Captain, leader, deadline highlights |
| `--positive` | `#22C55E` | Positive delta, win |
| `--warn` | `#F59E0B` | Caution states |
| `--danger` | `#EF4444` | Negative delta, live indicator, lost bets |
| `--purple` | `#A855F7` | GK position tone, Manage Squad CTA |

### Manager hues
Twelve managers are seeded with distinct hues; see `LH_MANAGERS` in `src/league-data.jsx`. When the live system assigns hues, pull from the same palette and avoid repeats inside a league.

### Newspaper palette (Frontpage + Article only)
- Paper `#F2EEE5`, Ink `#0A0E14`, Rule `#D8D2C6`, Mute `#5A6470`, Editorial red `#B0271E`.
- Sheet shadow: `0 30px 60px -20px rgba(0,0,0,.5), 0 2px 0 0 #C9C2B3`.

### Spacing (4px base)
`--s-1: 4px` … `--s-8: 40px`. Same as live centre.

### Radii (intentionally sharp)
`--r-sm: 2px`, `--r-md: 4px`, `--r-lg: 8px`. Most chips/cards use 0 (square) or 2px (sharp).

### Typography
- **Archivo Black** — display titles, names, numerals. 900 weight, -0.02em tracking on big sizes, uppercase for headings.
- **Archivo** — body, labels.
- **JetBrains Mono** — eyebrows, monospace metadata, league chips. .14em–.22em tracking, uppercase.
- **Playfair Display** — *Frontpage and Article only*. Headlines (Italic 900) and body (regular). Do not use elsewhere.

### Sizes used in this screen set
- Hub page display title: 28.
- Section eyebrow / sub-label: 10–11 mono.
- Bet hero / drill-in hero display: 30–44.
- Forza Times wordmark: 82 (italic Playfair 900).
- Forza Times lead headline: 54.
- Forza Times secondary headline: 26.
- Forza Times deck body: 14–18.
- Bet card title: 15 Archivo Black.
- Auction player name: 18 (card), 54 (detail).
- Sparkline: 22 tall (rows), 56 tall (auction detail).
- Chat name: 13 Archivo Black; message body: 13 Archivo.
- Stat headline numerals: 30–34 Archivo Black.

### Decoration patterns
- 3px tall × 14px wide tone bar before every section label.
- Section header bar background: `var(--ink-2)`.
- Active tab/card edge: 2px solid tone, no glow.
- "Your row" emphasis: 2px cyan left border + `rgba(0,180,216,.04)` row tint.
- Blocked auction card: hatched overlay `repeating-linear-gradient(135deg, rgba(139,149,161,.04) 0 6px, transparent 6px 12px)`.
- Pinned banner (chat): `rgba(224,168,0,.06)` background + `var(--gold)44` border-bottom.
- Bet won/lost: 3px left border tone (positive / danger) on the bet row, replaces kind tone.

---

## Copy

Treat the prototype as the source of truth. Key strings:

- League title: `OFFICE HEROES` (dynamic — `{league.name.toUpperCase()}`).
- Hub eyebrow: `← BACK · COMPETITIVE CENTER`.
- Manage CTAs: `MANAGE SQUAD`, `MARKET`.
- Tabs: `LEADERBOARD · FRONTPAGE · BETS · BETTING · AUCTIONS · CHAT · STATS · ⚙ ADMIN`.
- Bet section headers: `OPEN · MAKE YOUR PICKS`, `PENDING RESULTS`, `RESULTS`.
- Auction section headers: `LIVE · CLOSING SOON`, `STARTING · OPENS LATER`, `RECENT GAVELS`, `BLOCKED · ALREADY OWNED`.
- Frontpage masthead: `FORZA TIMES` + dateline `“All the points that's fit to print” · {date} · £0.00 to subscribers · Premium tier coming soon`.
- Frontpage sidebar block: `STANDINGS · GW28 — Table at a glance`.
- Chat composer placeholder: `Roast your rivals… (try @username · /bet · /trade)`.
- Stats hero: `Numbers, the way the league reads them.`.

Tone: terse, sports-magazine, all caps for meta, light dry humour. No emoji except in chat reactions.

---

## Assets

No raster assets. All visuals are CSS + Unicode glyphs + SVG (charts/donut).

- Bet kind glyphs: `◉` top-scorer, `⛌` block, `≷` over-under, `⚔` h2h, `◈` fixture.
- Activity icons: same EVENT_KIND map from the Live Centre handoff for goals/assists/etc; here we add `pin`, `rankup`, `bid`, `trade`, `bet`, `frontpage`, `auction` as activity-only kinds (tone-coded via `kindTone`).
- Form W/D/L: square ASCII letters in a tone wash.
- Trend triangles: Unicode `▲ ▼ =`.
- Frontpage placeholder photo: pure CSS stripes; in production replace with real photography or league-uploaded imagery.

---

## Files

```
design_handoff_league_hub/
├── README.md                       ← you are here
├── Leagues Redesigns.html          ← DESKTOP — open in a browser to interact with the prototype
├── Leagues Mobile.html              ← MOBILE — open in a browser to interact with the prototype
├── design-canvas.jsx               ← design-canvas wrapper (host shell, NOT product code)
└── src/
    ├── league-data.jsx             ← shared mock data (managers, standings, frontpage, bets, auctions, chat, stats)
    ├── league-shared.jsx           ← DESKTOP chrome: HubTopbar / HubActionBar / HubTabs / MgrTag / TrendPill / FormDots / Spark / HubSectionLabel
    ├── league-leaderboard.jsx      ← DESKTOP: LeaderboardTab + ManagerProfileScreen
    ├── league-frontpage.jsx        ← DESKTOP: FrontpageTab + ForzaArticleScreen + newspaper subcomponents
    ├── league-bets.jsx             ← DESKTOP: BetsTab + MakePickScreen + BettingTab
    ├── league-auctions.jsx         ← DESKTOP: AuctionsTab + AuctionDetailScreen
    ├── league-chat-stats.jsx       ← DESKTOP: ChatTab + StatsTab + WeeklyChart + PositionDonut
    ├── league-mobile-shared.jsx    ← MOBILE chrome: PhoneShell / AppTopbar / HubLeagueHeader / HubTabPills / PrimaryCTA / MobFormDots / MobSection
    ├── league-mobile-leaderboard.jsx ← MOBILE: MobLeaderboard + MobManagerProfile
    ├── league-mobile-frontpage.jsx ← MOBILE: MobFrontpage + MobArticle (paper preserved)
    ├── league-mobile-bets.jsx      ← MOBILE: MobBets + MobMakePick + MobBetting
    ├── league-mobile-auctions.jsx  ← MOBILE: MobAuctions + MobAuctionDetail
    ├── league-mobile-chat-stats.jsx← MOBILE: MobChat + MobStats + MobWeeklyChart + MobPositionDonut
    ├── tokens.css                  ← canonical CSS custom properties (shared)
    └── squad-shared.css            ← shared chrome classes (shared)
```

**Implement these** (the rest is reference):

*Desktop:*
- `LeaderboardTab`, `ManagerProfileScreen`
- `FrontpageTab`, `ForzaArticleScreen`
- `BetsTab`, `MakePickScreen`, `BettingTab`
- `AuctionsTab`, `AuctionDetailScreen`
- `ChatTab`, `StatsTab`
- The shared primitives from `league-shared.jsx`.

*Mobile:*
- `MobLeaderboard`, `MobManagerProfile`
- `MobFrontpage`, `MobArticle`
- `MobBets`, `MobMakePick`, `MobBetting`
- `MobAuctions`, `MobAuctionDetail`
- `MobChat`, `MobStats`
- The shared mobile primitives from `league-mobile-shared.jsx`.

**Reference only** (don't ship):
- `design-canvas.jsx` — the canvas wrapper, presentation only.
- All `LH_*` mock data — replace with real service hooks.

---

## Notes / Open questions

1. **Frontpage generation.** The prototype shows hand-curated copy. In production the editorial layout should be driven by a small set of templates filled from match data + league events. Recommended rule set: lead = biggest absolute swing in standings + a noteworthy player moment; secondaries = biggest GW score, biggest captain hit/miss, biggest auction outcome, biggest bet streak; classifieds = anyone who has flagged a player as for-trade in the past 7 days.
2. **Chat moderation.** Out of scope. Assume the admin role (visible as `ADMIN` tag in the members rail) has delete/pin/mute powers.
3. **Auctions atomic blocking.** When a manager wins an auction, that player must atomically move from the auction house into their squad AND become blocked for everyone else. Treat as a transaction.
4. **Stats charts.** SVG line + donut are coded inline. If the codebase has a charts library (Recharts, Visx), use that and match the visual treatment (dashed `var(--rule)` gridlines, JetBrains Mono 9 axis labels, no chart frame).
5. **Accessibility.** The tab bar needs `role="tablist"` and `aria-selected`. The bet option chips on Make Pick should be `<button role="radio">` inside a `role="radiogroup"`. The pulse animation should respect `prefers-reduced-motion` (clamp opacity to 1). Manager hues are not sole indicators — the monogram always carries the identity.

---

## Mobile

390 design width. Single column. Same component vocabulary as desktop except where noted below. Mobile preserves the brand DNA (sharp rules, Archivo Black display, monogram identity, position tones, cream-paper Frontpage) but tightens density to fit a phone.

### Shell anatomy
Every mobile screen wraps in `PhoneShell` and stacks:
1. **Status bar** (32px) — `9:41` time + signal/battery glyphs in JetBrains Mono.
2. **App topbar** — `FORZA{KIT}` wordmark left; notification dot + `● LIVE` mono right.
3. **App-level tabs** — `SCORES · SQUAD · LEAGUE · LIVE · MARKET` in mono 10, .18em tracking. LEAGUE is active; cyan 2px underline.
4. **Hub league header** — eyebrow `COMPETITIVE · 14 MGRS · GW 28`, then cyan dot + `OFFICE HEROES` display 22.
5. **Hub tab pills** — horizontal scrollable mono pills for the seven hub tabs (`BOARD · FRONTPAGE · BETS · BETTING · AUCTIONS · CHAT · STATS`). Active pill is cyan-filled, others mute-outline 1px. Notify dots and unread counts ride inline.
6. **Body** — `flex: 1; overflow: auto`. Tab-specific content.

Drill-ins use the same shell but the league header swaps to a `← BACK · <SCREEN TITLE>` row with a smaller (18px) display title.

### What changes vs desktop
- **Hub topbar / action bar / tabs** collapse into the App topbar + Hub league header + Hub tab pills above. The "MANAGE SQUAD" and "MARKET" dual CTA strip is **removed** from inside the hub on mobile — those are top-level destinations already reachable via the app-level tabs and don't need to be repeated in every league tab.
- **Form ticker** shrinks from 5 → 3 dots (`MobFormDots` with `max={3}`).
- **Standings rows** reflow to `# / monogram / name+captain / form / TOT+MD stacked`. The HQ/VIEW action buttons are dropped — tapping the row navigates to the manager profile.
- **Spotlight strips** (4-col on desktop) collapse to 2 hero cards (Your Rank + Leader) on Leaderboard. Bets and Auctions show 3- or 4-up mini cards in the hero.
- **Bet rows** become compact cards (no action panel split — the CTA pinned at the bottom of the card).
- **Auction cards** become full-bleed (1 per row) with a 2-column inner stat grid (`CURRENT / LEADING`).
- **Bid stage** in Auction Detail becomes a vertical stack: current bid number, then `−0.5 / £xx.x / +0.5` stepper, then full-width `PLACE BID` CTA at the bottom.
- **Chat** loses the 3-column rail; channels collapse into a horizontal pill bar at the top, members rail is dropped (accessible via a member icon tap), pinned banner stays. Composer pinned at the bottom.
- **Frontpage** keeps the cream paper but scales: masthead 42px (was 82), lead headline 30px (was 54), single column with stories stacking under the lead photo. The standings, pull-quote, and classifieds appear inline in reading order. **Box score is removed** — it duplicates info available in the Scores tab.
- **Article** scales to 36px headline; single-column serif body, drop cap kept.
- **Stats** charts shrink: weekly chart 340-wide SVG with shorter axis labels (`G1, G3…`), donut 140px paired with the legend bars stacked to the right.
- **Drill-ins** push as full-screen sheets onto the nav stack rather than opening in a side-by-side detail pane. Back arrow returns.

### Mobile-only components
- `PhoneShell({dark})` — 390 frame, dark by default. `dark={false}` switches to a cream-paper variant used inside the Frontpage/Article shells when needed.
- `AppTopbar({active})` — FORZAKIT wordmark + the 5 global tabs. Defaults to LEAGUE active.
- `HubLeagueHeader({backable, title})` — when `backable`, shows `← BACK` instead of meta and a smaller title. Use for drill-ins.
- `HubTabPills({active})` — the horizontal scroll of hub-tab pills.
- `MobFormDots({form, max=3})` — 3-pip form ticker for mobile rows.
- `MobSection({label, sub, tone, right})` — 3px tone bar + mono label, no full-width header background (slimmer than desktop).
- `PrimaryCTA({label, tone, sub})` — full-width sticky-style CTA (used at bottom of detail screens).

### Mobile interactions
- **Tab pills** scroll horizontally; the active pill stays anchored at the start when possible. Tapping a pill changes the tab and resets scroll position to the top.
- **Pull-to-refresh** — recommend wiring on every list tab (Leaderboard / Bets / Auctions / Chat / Stats activity sections). Not depicted in static frames.
- **Drill-in transitions** — push from right (iOS) / slide-up (Android) — match platform convention.
- **Composer (Chat)** — the keyboard pushes the composer up; nothing else moves. Pinned banner remains visible above the keyboard.
- **Bid stage (Auction Detail)** — the stepper buttons grow tap targets to 44×44 minimum; the bid input itself is not directly editable on mobile to avoid keyboard spam (use the ± buttons).
- **Auto-bid input** is a numeric field — invoke the numeric keypad via `inputMode="decimal"`.

### Heights / scroll
Every mobile screen is taller than the viewport on purpose. The shell scrolls; the chrome (App topbar + Hub header + Tab pills) does **not** stick by default to keep implementation simple. If sticky chrome is desired, sticky the App topbar + Hub league header only — let the tab pills scroll away.

### Mobile copy adjustments
- Manage CTAs removed from in-hub.
- Auction hero mini-cards use 3–5 char labels: `LIVE · NEXT · BLKD · £m`.
- Betting hero stat cards use `PLAYED · WON · WIN % · STREAK`.
- Hub tab labels are abbreviated: `BOARD` (was `LEADERBOARD`), others stay full length where they fit.
- Bet card title truncates with `overflow: hidden; text-overflow: ellipsis` if longer than the available width.

### Mobile token usage
Same tokens as desktop — no new colours. Sizes that move:
- Display titles on mobile cap at 30 (was 54 on lead frontpage, 38 on bet drill-in, 44 on profile hero).
- Section eyebrows shrink to 10–11 mono (was 11–12).
- Stat numerals shrink to 14–20 in mini cards (was 22–34).
- Monogram badge fixed at 18–20px everywhere.
- Touch targets at least 44px tall (CTA buttons get 12–14px vertical padding to land here).

---

## Connecting back to Live Centre

The League Hub and the Live Centre share several primitives that should be consolidated when implementing:

| Live Centre | League Hub | Recommendation |
|---|---|---|
| `LivePill` | LIVE indicator on hub topbar | Reuse |
| `DeltaPill` | Used in profile / stats deltas | Reuse |
| `LeagueChip` (live events) | League name strip in hub topbar | Same data, different chrome |
| `MiniTok` | Player chip on manager-profile pitch | Same anatomy; here we render rows of name chips, not a pitch |
| `EventRow` | Activity-rail row | Different data shape, similar visual |

Single source of truth: keep these primitives in a shared `forzakit/components` directory and import from both surfaces.
