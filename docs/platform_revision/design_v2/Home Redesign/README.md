# Handoff: Clubhouse Home Redesign (Frontrow, formerly FantasyKit)

## Overview
Redesign of the Clubhouse — the room every Frontrow user spends most of their time in — plus the global chrome (sidebar, top bar) around it, the multi-Clubhouse switcher, Members, Chat, The FrontRow gazette, the New Competition flow, and Notifications. Source brief: see the original product brief this was designed against (Clubhouse-centric IA — "the Clubhouse is the room, sports are the tables in it").

## About the Design Files
`Clubhouse Home Redesign.html` is a **design reference built in HTML** — a pannable canvas of static, high-fidelity mockups (open it in a browser; pan/scroll to see all 8 screens). It is not production code. The task is to **recreate these designs in the target codebase's existing environment** (the production app is a React codebase — see file paths below) using its existing component patterns, not to ship this HTML directly.

## Fidelity
**High-fidelity.** Exact colors, typography, spacing, and component states are final. Recreate pixel-accurately using the codebase's existing libraries. Copy in the mockups (names, numbers, messages) is placeholder/sample data — wire to real data sources.

## Platform rebrand
The platform is renamed **FantasyKit → Frontrow** ("Your seat to all the action"). Replace any FantasyKit wordmark/logo in the app shell with the Frontrow logo (see `logo/` in this folder). The gazette feature is separately named "The FrontRow" (existing product feature, unrelated naming collision — kept as-is per product brief, not renamed).

## Screens
Each screen below ships as a desktop (≥1024px) + mobile (390px) pair in the HTML canvas, labeled with a code (S-01…S-08).

### S-01 — Clubhouse Home
**Purpose:** the merged daily-use surface — competitions, activity, chat and a FrontRow teaser all visible together, no tab-hopping.
**Layout, desktop:** 220px fixed dark sidebar (global chrome, see S-02) + flex-1 content column. Content column, top to bottom: 40px competition pill strip → dark Clubhouse header (padding 18px 26px) → 5-item tab row (Home/The FrontRow/Members/Find/Settings, Home active) → two-zone body (`display:flex`): **main column** (flex:1, padding 18px 22px, `display:flex;flex-direction:column;gap:16px`) containing a quick-access row of 3 shortcut cards (Coin Wallet, P2P Challenges, Meta Rank), a 2-col competitions grid, a cream FrontRow teaser card, and an activity feed list — plus a **persistent 330px chat rail** (`border-left:1px solid var(--rule)`) with a Channels/DMs toggle, channel list, message thread (grouped consecutive messages under one timestamp; own messages right-aligned accent bubbles with "read" receipt), and a compose bar.
**Layout, mobile (390px):** 44px sticky top strip (username + settings gear) → competition pill strip (horizontal-scroll, `overflow-x:auto`) → compact dark Clubhouse header with a notification icon top-right → horizontal Clubhouse-switcher card strip (only if user has >1 Clubhouse) → secondary scrollable tab row (Home/FrontRow/Chat/Members/Find/Settings) → single scrolling column (shortcuts row horizontal-scroll, competitions stacked 1-col, FrontRow teaser, activity feed) → 60px dark bottom tab bar (Club/Trophy/Coins/Settings — Club always active here, carries the unread badge).
**Key colors:** sport left-bar/badge colors — football `--accent` #1A6FA8, F1 `--f1` #E10600, tennis `--ten` #1B7A52. Feed type badges: GW RESULT/NEWS = accent tint, AUCTION/TRADE = positive tint, DRAFT = neutral `--elev`, CLASSIFIED = gold tint.
**Composition decision:** Home/Recap/Chat merge into one Discord/Slack-style view (persistent rail + main column). The FrontRow gazette keeps its own broadsheet identity but surfaces here as a teaser card only. Inbox is not a tab — it's the Notifications panel (S-08). 8 legacy tabs → 5.

### S-02 — Global Chrome: Sidebar, Clubhouse Switcher & Top Bar
**Purpose:** documents the sidebar/switcher/top-bar states that don't have their own "screen" but recur everywhere.
**Sidebar (220px, `--shell` background):** brand row (Frontrow logo mark + wordmark) → Clubhouse switcher (wrapping row of 30×30px rounded-square identity circles, 7px gap; active circle gets a 2-ring accent outline via `box-shadow: 0 0 0 2px var(--shell), 0 0 0 3.5px var(--accent)`; renders **only if the user belongs to >1 Clubhouse** — single-Clubhouse users see no switcher row at all) → active Clubhouse name label → "Clubhouse" nav section (Clubhouse item w/ unread badge, indented "The FrontRow" sub-item) → "Community" nav section (Trophy Cabinet, Coin Challenges [Beta tag], Settings) → user footer pinned to bottom (avatar + name + "Multi-sport" caption).
**Mobile equivalent:** no sidebar. The switcher becomes a horizontal card strip (identity chip + Clubhouse name, active = accent border + tint) at the top of Clubhouse screens. Community-section items collapse into the bottom tab bar; Club is the one always-present item and carries the unread badge.
**Top bar (competition pill strip, horizontal-scroll):** one pill per competition (small sport-colored dot + name). **On Clubhouse Home**, a dedicated leading "🏠 Clubhouse" pill takes the accent-active treatment (colored text + 2px accent bottom border) since no competition is open. **Inside a competition**, that pill goes neutral and the open competition's pill becomes active instead (2px bottom border in that sport's color). Trailing "+" opens New Competition (S-07).

### S-03 — Clubhouse Lobby (empty state)
**Purpose:** first-run screen for a user with zero Clubhouses.
**Layout:** centered card, eyebrow + headline + body copy, then two equal-weight option cards side by side (desktop) / stacked (mobile): "Create a Clubhouse" (primary, dark `--shell` fill) and "Join with an invite code" (secondary, text input + button). No default bias between the two paths.

### S-04 — The FrontRow (gazette)
**Purpose:** AI-generated newspaper edition ("The Forza Times"), regenerable by the owner (4h cooldown).
**Palette — intentional exception:** breaks Kit Light for a cream/dark-ink broadsheet look: background `#F2EEE5`, ink text `#1A1A18`, Georgia serif for headlines/deck/pull-quotes, double-rule masthead. Still sits inside the standard Kit Light chrome (top bar + tab row) above it.
**Layout, desktop:** centered masthead (title + edition/date/regenerate-cooldown line) → centered lead story (headline + italic serif deck) → 3-column section grid (Hot Take / Wooden Spoon / Transfer Desk), each with an emoji reaction row and a "N letters to the editor →" comment-thread link.
**Layout, mobile:** same content, sections stacked vertically instead of 3 columns.

### S-05 — Members
**Purpose:** owner-pinned-first roster.
**Layout:** list of rows, each: avatar, name (owner gets a gold "OWNER" outline tag), join date, cross-sport stats (competitions joined, meta points), and a "Remove" action in `--danger` red — shown **only** for the signed-in owner, and never on the owner's own row. Mobile condenses to single-column cards with identical actions/data.

### S-06 — Chat
**Purpose:** the full-width version of the S-01 persistent rail — what it expands into as its own screen (e.g. on a route like `/clubhouse/:id/chat`).
**Layout, desktop:** two-pane — left list column (290px, Channels/DMs toggle + list) + right thread pane (flex-1, grouped messages + compose bar), reused verbatim from the S-01 rail markup just at full width.
**Layout, mobile:** collapses below ~1024px to a single pane — the thread view shown with a "← Channels" back button in the top strip, returning to the same list markup shown full-screen.
**Behavior:** channels are owner-creatable (default `#general`); consecutive messages from the same sender group under one timestamp; DMs render as bubbles, own messages right-aligned/accent-filled with a "· read" receipt.

### S-07 — New Competition
**Purpose:** create-competition flow, opened from the top-bar "+" or the empty-state CTA in the competitions grid.
**Layout, desktop:** centered modal (460px) over a dimmed Home backdrop: title, a 3-tile sport picker using the **real Frontrow sport marks** (see Assets below — not emoji), competition name text field, format select, Cancel/Create actions.
**Layout, mobile:** same fields in a bottom sheet (rounded top corners, drag handle) instead of a centered modal.
**Behavior:** selected sport tile gets an accent border + tint (`.sportpick-tile.on`).

### S-08 — Notifications
**Purpose:** replaces the Inbox tab. Redesigned trigger icon: a simple two-tone tray/inbox glyph (CSS-built rectangle + divider line, not an emoji bell) with a `--danger`-colored unread count pill — deliberately not gold/yellow.
**Layout, desktop:** dropdown panel (360px) anchored below the header's notification icon, over the Home backdrop: header ("Notifications" + "Mark all read"), list of items (accent dot = unread, row tinted `--accent-bg` if unread; read rows have no dot).
**Layout, mobile:** no dropdown at that width — a dedicated full screen with a back button and the same list/actions.
**Behavior:** tap an item to mark it read and deep-link into its competition/chat thread/gazette edition; "Mark all read" clears all dots.

## Design Tokens
Reconciled Kit Light tokens (current production values — see comment in the HTML `<style>` block for the full set):

| Token | Hex/value | Usage |
|---|---|---|
| `--bg` | `#F7F3ED` | Page background |
| `--card` | `#FFFFFF` | Card surface |
| `--elev` | `#EDEAE2` | Elevated panels, shortcut cards |
| `--shell` | `#18202E` | Sidebar + Clubhouse header — the one dark surface |
| `--paper` | `#18202E` | Primary text |
| `--mute` | `#8A97A8` | Secondary/muted text, labels |
| `--rule` | `#E2DDD5` | Borders, dividers |
| `--accent` | `#1A6FA8` | Buttons, active states, primary CTA — cascades from a single `--brand-accent`, never hardcode the hex |
| `--accent-bg` | `rgba(26,111,168,.08)` | Accent tint background |
| `--gold` | `#B8720E` | Captain-style emphasis, FrontRow/gazette accents |
| `--positive` | `#166534` | Positive deltas, wins |
| `--danger` | `#B91C1C` | Negative deltas, destructive actions, unread badges |
| `--f1` | `#E10600` | F1 sport color |
| `--ten` | `#1B7A52` | Tennis sport color |
| `--on-shell` / `--on-shell-dim` | `#FFFFFF` / `rgba(255,255,255,.45)` | Text on the dark shell surface |

**Type:** Archivo Black (display/headlines), Archivo 400–600 (body/UI), JetBrains Mono (eyebrows/labels/metadata only, used sparingly). Mixed case except uppercase eyebrows. **Radius:** 6px throughout the UI (logo badge chrome is the one exception at 24px, decorative). Gazette exception uses Georgia serif + its own cream/ink palette (see S-04).

## Assets
`logo/` in this folder — the finalized Frontrow logo system (moved from the original logo handoff package):
- `assets/frontrow-logo-primary.svg` / `-live.svg` — the wordmark icon ("The Tiers": 3 stacked bars, gold + accent blue). Use `-primary` everywhere in UI chrome; `-live` (breathing gold halo) is reserved for live-state indicators only.
- `assets/frontrow-football-normal.svg` / `-live.svg`, `frontrow-tennis-normal.svg` / `-live.svg`, `frontrow-f1-normal.svg` / `-live.svg` — per-sport badge glyphs (104×104, white rounded-square chrome, bird's-eye line drawing of each sport's playing surface). Used in the S-07 New Competition sport picker. `-live` variants add a pulsing gold corner dot for in-progress events — recreate the pulse with the codebase's own animation approach, not the SVG's embedded reference animation.
- `logo/README.md` — full construction spec (exact measurements, color values, "adding a new sport later" guidance).

No other external image assets are used — avatars are colored initial circles (inline, no image files), and all icons other than the sport marks are built from CSS/text glyphs.

## Files
- `Clubhouse Home Redesign.html` — all 8 screens, desktop + mobile, on a pannable canvas. Open directly in a browser.
- `logo/` — Frontrow logo + sport mark SVGs and their spec.
