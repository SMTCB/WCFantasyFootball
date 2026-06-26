# FantasyKit — Claude Code Handoff Package
**Kit (Light) Direction · June 2026**

---

## What This Package Is

This is the complete design handoff for the FantasyKit platform redesign. The platform is repositioning as a white-label SaaS — dark "Forza" aesthetic out, light "Kit" direction in. All design decisions have been made and signed off. Your job is to build them.

**Live app:** https://wc-fantasy-football.vercel.app  
**Demo login:** demo@fantasykit.test / ForzaDemo2026!  
**Tech stack:** React / Next.js (verify against actual repo)

---

## START HERE

**Read in this order:**

1. `Kit Design System.html` ← **NEW** — visual identity doc. Open in browser. This is the single source of truth for all Kit Light tokens, components, and layout patterns.
2. `HANDOFF-STATUS.txt` — full session brief. Covers what exists, what to build, build priority.
3. `BRIEF.md` — original redesign brief with the direction decision and rationale.
4. `screens/FantasyKit UX Analysis.html` — 6 new UX improvements beyond the original audit. Every screen you build must address these.

---

## Package Contents

```
handoff/
├── README.md                                ← you are here
├── BRIEF.md                                 ← redesign brief + direction decision
├── HANDOFF-STATUS.txt                       ← full build brief for fresh sessions
├── Kit Design System.html                   ← NEW visual identity doc
│
├── tokens/
│   └── kit.css                              ← Kit Light CSS custom properties
│
├── screens/                                 ← interactive design canvases (open in browser)
│   ├── Platform Assessment.html             ← original 6-finding audit (context only)
│   ├── Identity Exploration.html            ← Kit vs Stadium direction comparison
│   ├── FantasyKit UX Analysis.html          ← 6 new UX improvements + before/after mockups
│   ├── Coin Challenges.html                 ← Coin challenges feature (8 screens, Kit Light)
│   ├── Multi-Sport Coin Challenges.html     ← Multi-sport + coin challenges combined
│   ├── Multi-Sport Coin Challenges v2.html  ← v2 iteration
│   ├── Multi-Sport Expansion.html           ← Full multi-sport expansion design
│   └── [.jsx deps]                          ← supporting files for canvases
│
└── design_handoffs/                         ← hi-fi component specs (dark Forza, reference)
    ├── league_hub/                          ← League Hub: all tabs + drill-ins (desktop + mobile)
    ├── player_modals/                       ← Player Stats Dashboard + Action Modal
    ├── live_centre/                         ← Live Centre (desktop + mobile)
    ├── admin_tab/                           ← Admin Tab + LOGIC.md behaviour spec
    ├── message_components/                  ← Toast/banner message system
    └── league_select/                       ← League Select & My Leagues screens
```

---

## Visual Direction: Kit (Light)

The complete token set. Use these CSS custom properties. Do **not** invent new colours.

| Token | Value | Usage |
|---|---|---|
| `--bg` | `#F7F3ED` | Page background (warm off-white) |
| `--card` | `#FFFFFF` | Card surface |
| `--elev` | `#EDEAE2` | Elevated panels, table headers |
| `--shell` | `#18202E` | Sidebar + shell — the ONE dark element |
| `--text` | `#18202E` | Primary text |
| `--text-2` | `#4B5568` | Secondary text |
| `--mute` | `#8A97A8` | Muted labels, metadata |
| `--rule` | `#E2DDD5` | All borders and dividers |
| `--accent` | `#1A6FA8` | Buttons, active states, lead numbers |
| `--accent-bg` | `rgba(26,111,168,.08)` | Accent tint for backgrounds |
| `--gold` | `#B8720E` | Captain badge, deadline urgency |
| `--pos` | `#166534` | Positive deltas, wins, fit status |
| `--neg` | `#B91C1C` | Negative deltas, danger, live indicator |

**Position colours (Kit Light):**
- GK: `#8C49C9` (purple)
- DEF: `#1A6FA8` (accent blue)
- MID: `#B8720E` (gold)
- FWD: `#B91C1C` (neg red)

**Typography:**
- Display / names / numbers: `Archivo Black` 900
- Body / UI: `Archivo` 400–600
- Labels / eyebrows / metadata: `JetBrains Mono` — **sparingly only**, not for everything

**Shape:** 6px border radius throughout. Mixed case (not all-caps). No box shadows (depth via surface tone).

---

## Build Priority

### Phase 1 — Build First (high impact, lower complexity)

1. **League Hub — Leaderboard tab** (Kit Light)
   - Dark sidebar `--shell` + warm white content area
   - Deadline action banner (Finding 01): countdown + "Set your squad" CTA
   - Three-tier type hierarchy on standings rows (Finding 03)
   - Tab-only nav — no competing button bar
   - Right panel: deadline card + activity feed + my squad card
   - Desktop (1280px) + Mobile (390px) with cards + FAB
   - Reference: `design_handoffs/league_hub/README.md` + `Leagues Redesigns.html`

2. **Player Market** (Kit Light)
   - Scannable rows: position chip, name, form delta, price
   - Player drawer on tap: full stats + action + impact preview (Finding 04+05)
   - Action feedback: toast + undo after signing (Finding 05)
   - Reference: dark market in live app, structure from `FORZAKIT Final.html`

3. **Action Feedback patterns** (system-wide)
   - Toast component (Finding 05)
   - Points-impact preview chip
   - Squad locked / saved state markers

### Phase 2 — Build Next

4. **My Squad — pitch view** in Kit Light
   - Light pitch surface (NOT just inverted — redesign the pitch on `#2D5A27` field)
   - Player tokens: warm white bg + box shadow for separation (see Kit Design System)
   - Captain marker: gold circle badge
   - Reference: `FORZAKIT Final.html` for dark pitch structure

5. **Mobile patterns** across all screens
   - Card-based leaderboard (Finding 06)
   - Bottom tab bar replacing sidebar
   - Thumb-reachable FAB for primary action

### Phase 3 — Launch Prep

6. **Onboarding / First-run** (Finding 02) — net new, no dark reference
7. **All League Hub tabs** in Kit Light (Feed, Bets, Auctions, Chat, Stats)
8. **Player Modal** in Kit Light
9. **Live Centre** in Kit Light
10. **White-label validation** — confirm 3-token swap end-to-end

---

## Design Handoff Reference Files

These are hi-fi prototypes in the **old dark direction**. Use them for **structural reference only** — layouts, component anatomy, data shapes, copy. The visual tokens are wrong; apply Kit Light tokens when implementing.

| Folder | What it covers | Key file |
|---|---|---|
| `design_handoffs/league_hub/` | All 7 hub tabs + 4 drill-ins, desktop + mobile | `README.md` (full spec), `Leagues Redesigns.html` |
| `design_handoffs/player_modals/` | PlayerStatsDashboard, PlayerActionModal full + minimal | `README.md`, `Player Modals.html` |
| `design_handoffs/live_centre/` | Live Centre desktop + mobile, event feed, mini pitch | `README.md`, `Live Center Redesigns.html` |
| `design_handoffs/admin_tab/` | Admin Tab, Create-Bet wizard, Resolve flow, Lifecycle ops | `README.md`, `LOGIC.md` |
| `design_handoffs/message_components/` | Toast, inline banner, system banner, mobile action sheet | `Message Components.html`, `README.md` |
| `design_handoffs/league_select/` | League Select + My Leagues screens | `League Select & My Leagues Redesigns.html` |

---

## New Feature Designs (Kit Light — use as spec)

These are in `screens/` and are already designed in the Kit Light direction:

| File | What it is |
|---|---|
| `Coin Challenges.html` | 8-screen coin challenges feature: challenges tab, create flow, accept/decline, live scoring, history |
| `Multi-Sport Coin Challenges.html` | Coin challenges adapted for a multi-sport context |
| `Multi-Sport Coin Challenges v2.html` | Second iteration — use this as the primary reference |
| `Multi-Sport Expansion.html` | Full multi-sport expansion: sport selector, cross-sport dashboard, per-sport league hub |

---

## Key Decisions (Do Not Revisit)

These are locked. Do not reconsider them without explicit sign-off.

- **Kit (Light) is the default direction.** Stadium (Dark) is dark mode only — a user toggle.
- **"FantasyKit" is the platform name.** "Forza" brand is retired. Wordmark is a placeholder.
- **Archivo Black + Archivo + JetBrains Mono.** This type pairing is kept. No substitutions.
- **JetBrains Mono is used sparingly.** Labels and metadata only — not for all data.
- **6px border radius.** Throughout. Not the old 2–4px sharp style.
- **Mixed case.** Not all-caps. (Eyebrow labels in UPPERCASE are the exception.)
- **White-label = 3-token swap.** --accent + brand name + data. Nothing else changes per client.
- **Navigation:** Left sidebar (desktop) + bottom tab bar (mobile). No dual CTA bar inside league tabs.
- **Inside League: 5 tabs max.** Leaderboard · Feed · Bets · Squad · Market. Not 8.
- **Frontpage (Forza Times)** keeps its cream paper inside the Kit Light chrome.

---

## The Six UX Improvements (from FantasyKit UX Analysis.html)

Every screen must address the relevant ones:

| # | Finding | Fix |
|---|---|---|
| 01 | No clear next action | Deadline-driven primary CTA banner (see Kit Design System) |
| 02 | No onboarding | First-run checklist + empty-state coaching |
| 03 | Flat visual hierarchy | Three type roles: lead (accent, Archivo Black) / support / label (mono muted) |
| 04 | Density without focus | Player drawer + progressive disclosure |
| 05 | Silent system | Toast + undo + impact preview on every action |
| 06 | Mobile = shrunk desktop | Card patterns, thumb-reach FAB, bottom tab bar |

---

## Implementation Notes

- All design canvases in `screens/` require an internet connection (Google Fonts + React CDN). Open in browser, not VS Code preview.
- The design canvas supports pan/zoom (scroll + pinch). Click any artboard's focus button for fullscreen. ←/→ walks artboards within a section.
- Data interfaces and scoring engine plugin points are documented in the individual `README.md` files inside each handoff folder.
- Shared primitives across League Hub and Live Centre (LivePill, DeltaPill, LeagueChip, MiniTok) should be consolidated in one shared components directory.
- The `LOGIC.md` in `design_handoffs/admin_tab/` is the behaviour spec for the admin tab — read before implementing any admin functionality.
- For the Forza Times (Frontpage) newspaper: it keeps the cream paper aesthetic (`#F2EEE5` background) inside the Kit Light chrome. The serif font (Playfair Display) is used here only.

---

*FantasyKit · Design Handoff · Kit (Light) · June 2026*
