# Clubhouse Core — Design Handoff Brief

**For: Claude Design · Prepared July 2026 · Kit Light direction**

**One-line summary:** Design the Clubhouse Home screen (desktop + mobile) — the room every FantasyKit user spends most of their time in — plus the sidebar, top bar, and multi-clubhouse switcher that frame it.

---

## What This Is

FantasyKit repositioned its information architecture around a single idea: **the Clubhouse is the room, sports are the tables in it.** A user belongs to one or more Clubhouses (private friend groups); every competition they play — a football league, an F1 paddock, a tennis player box — exists *inside* a Clubhouse, not the other way around. That IA is fully built and live in production. What it has never had is a real design pass — it was shipped in serviceable Kit Light styling to prove the structure works, not to be the best screen in the app.

This brief asks for that design pass. It is scoped to the Clubhouse itself and the global chrome (sidebar, top bar) that surrounds it — not the sport-specific screens (Squad, Market, F1 Picks, etc.), which are a separate, later design pass.

**Live reference app:** https://wc-fantasy-football.vercel.app (production — the redesign work described below is what's currently live and needs a craft pass, not a hypothetical). Demo login from the last design session was `demo@fantasykit.test` / `ForzaDemo2026!` — confirm this still works before relying on it; if not, ask Steve for current credentials.

---

## Read First — Reconciled Design Tokens

⚠️ **This project has two generations of Kit Light token names in circulation.** The design folder's own `BRIEF.md`, top-level `README.md`, `Kit Design System.html`, and `tokens/kit.css` all use an **older naming scheme** from the original redesign brief. The **live production app renamed several tokens** when it shipped. Use the table below — it is pulled directly from the current `src/index.css` — not the older docs, whenever the two disagree.

| Current (live app) | Old docs called this | Hex / value | Usage |
|---|---|---|---|
| `--bg` | `--bg` (same) | `#F7F3ED` | Page background (warm off-white) |
| `--card` | `--card` (same) | `#FFFFFF` | Card surface |
| `--elev` | `--elev` (same) | `#EDEAE2` | Elevated panels, shortcut cards |
| `--shell` | `--shell` (same) | `#18202E` | Sidebar + Clubhouse header — the one dark surface |
| `--paper` | ~~`--text`~~ | `#18202E` | Primary text |
| `--mute` | ~~`--text2` / `--mute`~~ | `#8A97A8` | Secondary/muted text, labels, metadata |
| `--rule` | `--rule` (same) | `#E2DDD5` | Borders, dividers |
| `--accent` | `--accent` (same) | `#1A6FA8` (via `--brand-accent`) | Buttons, active states, primary CTA |
| `--accent-bg` | `--accent-bg` (same) | `color-mix(accent 8%, transparent)` | Accent tint background |
| `--cyan` | n/a (new) | alias for `--accent` | Some components still reference `--cyan` by name — same colour |
| `--gold` | `--gold` (same) | `#B8720E` | Captain-style emphasis, FrontRow/gazette accents |
| `--positive` | ~~`--pos`~~ | `#166534` | Positive deltas, wins, "public" status |
| `--danger` | ~~`--neg`~~ | `#B91C1C` | Negative deltas, destructive actions, live/unread badges |
| `--f1` | n/a (new) | `#E10600` | F1 sport colour (Ferrari red) |
| `--ten` | n/a (new) | `#1B7A52` | Tennis sport colour (Wimbledon green) |
| `--on-shell` | n/a (new) | `#FFFFFF` | Text on the dark `--shell` surface |
| `--on-shell-dim` | n/a (new) | `rgba(255,255,255,.45)` | Muted eyebrow text on `--shell` |

**White-label note:** `--accent` cascades from a single `--brand-accent` custom property — a client re-skin only needs to override that one value. Don't hardcode `#1A6FA8` anywhere in the new designs; reference the token.

**Type system (unchanged from the original brief):** Archivo Black for display/headlines, Archivo 400–600 for body/UI, JetBrains Mono for eyebrows/labels/metadata only — used sparingly, not for every piece of data. 6px border radius. Mixed case, not all-caps (uppercase eyebrows are the one exception).

**One deliberate exception:** The Clubhouse's "FrontRow" tab (see below) is an AI-generated newspaper ("The Forza Times") that intentionally breaks from Kit Light into a warm cream/dark-ink broadsheet palette (`#F2EEE5` / `#1A1A18`, Georgia serif for pull-quotes). This is by design, not an oversight — keep it, but it lives inside the Kit Light chrome around it.

---

## Priority 1 — The Clubhouse Home Screen

This is the screen the whole brief is about. Frame it the way the product does: **this is the sports bar experience.** A user's Clubhouse is where they check in daily — not to play a single game, but to see everyone's results, needle each other in chat, read the AI gazette roasting last week's worst manager, and jump into whichever competition needs attention. If this screen feels like a lobby you pass through, the product has failed at its one differentiating idea. If it feels like the best seat in the house — every screen you want visible, comfortable, alive — it's done its job.

### The actual design problem to solve

The Clubhouse today has all the right *ingredients* but serves them as **eight separate full-page tabs** a user clicks between one at a time: `HOME · THE FRONTROW · RECAP · CHAT · INBOX · MEMBERS · FIND · SETTINGS`. Sitting at the best table in a sports bar means the TVs, the group, and the score are all in view *together* — not in eight different rooms. So the central question for this design pass is:

**How much of Home / Recap / Chat / FrontRow should be composed into one view instead of four competing tabs?** A persistent chat rail alongside a feed-and-competitions main column (Discord/Slack-style) is one obvious direction; there may be better ones. Don't treat the current tab structure as fixed — the brief is to propose the strongest composition, and Members / Find / Settings can reasonably stay as separate, lower-frequency tabs since they're configuration, not the daily-use loop.

### What exists today — full functional inventory (nothing here should be lost, only redesigned)

**Header** — Dark `--shell` band. Eyebrow "🏠 THE CLUBHOUSE", Clubhouse name (large, all-caps), a stacked row of member avatars (first 5, then a `+N` overflow chip), member count + a "· PUBLIC" tag when the Clubhouse is discoverable. Right side: a sports-count / competitions-count stat pair, and an invite-code chip that copies to clipboard on click ("COPIED ✓" confirmation).

**Competitions grid** — Every competition across every sport the Clubhouse runs (football leagues, F1 paddocks, tennis player boxes), flattened into one unified card grid. Each card: a 3px top bar in the sport's colour (accent blue = football, `--f1` red, `--ten` green), competition name, a sport badge with emoji (⚽ 🏁 🎾), format line, "ENTER →". Empty state (no competitions yet) shows a stadium emoji, copy, and a "+ Create a competition" CTA.

**Activity feed** — Reverse-chronological cross-sport feed. Each entry has a type badge + colour (`GW RESULT` cyan, `NEWS` accent, `AUCTION` green, `TRADE` green, `DRAFT` muted, `CLASSIFIED` gold), the source league/paddock name, a relative timestamp, and a headline. Entries with a linked competition are clickable and route straight into it.

**The FrontRow (gazette)** — An AI-generated newspaper edition ("The Forza Times"), regenerable by the Clubhouse owner (rate-limited to once per 4 hours). Broadsheet layout: masthead, edition number/date, lead story with headline + italic serif deck, then Hot Take / Wooden Spoon / Transfer Desk sections. Every section supports **emoji reactions** and a **letters-to-the-editor comment thread** — this is real social interaction on the gazette, not a static article. Empty state before the first edition exists.

**Chat** — Two-pane messaging: a left list toggling between **Channels** (Clubhouse-wide, owner can create new ones, default `#general`) and **DMs** (one-to-one with any other member), and a right thread pane. Channel messages group consecutive posts from the same sender under one timestamp; DMs render as bubbles (own messages right-aligned/accent-filled, "· read" receipt). Collapses to a single pane with a back button below ~1024px.

**Inbox** — Per-user notification list (unread badge shown as a red pill on the tab and in the sidebar/bottom-nav), mark-one-read / mark-all-read, deep-links into the relevant competition.

**Members** — Owner-pinned-first roster list; owner can remove members.

**Find** — Search other public Clubhouses and join by invite code.

**Settings** *(owner only)* — Rename Clubhouse, toggle Public/Private discoverability, toggle P2P coin betting on/off for the group, link an existing league into this Clubhouse.

**Coin Wallet shortcut card** — Balance + any amount currently in escrow, links to `/wallet`.

**P2P Challenges shortcut card** — Links to the peer-to-peer coin-betting challenges list.

**Meta Rankings** — A cross-sport leaderboard combining every member's standing across all competitions in the Clubhouse into one ranked list (medal styling for top 3, trophy count, combined points).

**Multi-Clubhouse switcher** — A horizontal pill strip (only rendered if the user is in more than one Clubhouse) letting them jump between Clubhouses; the active pill is accent-highlighted. Currently lives *inside* the Clubhouse screen body, directly under the header — see the dedicated section below on why this may need to move.

### Desktop requirements

- Target ≥1024px. The existing 220px dark sidebar (see Sidebar spec below) is present and does not scroll away — design the Home screen as the content to its right, alongside the global top bar (see Top Bar spec).
- Should read as a real dashboard, not a stretched mobile column: use the available width for at least a two-zone layout (a persistent social/chat surface + a main competitions-and-feed surface is the leading hypothesis — see "the actual design problem" above).
- Every functional element in the inventory above must be reachable without more than one click/tab from Home.

### Mobile requirements

- Target <768px, primary breakpoint 390px. There is no sidebar on mobile — a bottom tab bar takes its place (see Sidebar spec) and a thin sticky top strip sits above the content (see Top Bar spec).
- Chat in particular needs a real mobile pattern — the current two-pane layout already collapses to one pane with a back button; decide whether that's the right mobile chat pattern once Home is composed differently.
- Design for a Clubhouse with 2 competitions and one with 8+ — the competitions grid and feed both need to hold up at both densities.

---

## Reference Materials Already in This Repo

The user's own starting point for this brief is `docs/platform_revision/design/screens/Multi-Sport Expansion.html` (open in a browser — it's an interactive multi-screen canvas, not a static image). It predates the Clubhouse-centric IA and is in the **old sports-centric visual language** (different token names, a sport-first sidebar) — treat it purely as a structural/craft reference, not a literal spec. Two screens in that file matter here, and they are **not the same thing** — both are worth reviewing:

- **Screen 1 — "Multi-Sport Home"** (the one the user pointed to): a *personal* cross-sport dashboard. Greeting header with a stat trio, a 3-column "sport module" card grid (rank/points/next-deadline per sport), an activity gazette feed card, and a right-hand sidebar column with a trophy teaser, a group meta-rank mini-leaderboard, and an "up next" deadlines card. **What to take from it:** the craft of composing a card grid + feed + widget sidebar into one rich screen — this is the best reference in the repo for *density done well*.
- **Screen 7 — "Group Hub"** (further down the same file, `#s-group`): this is structurally the direct ancestor of today's Clubhouse screen — group header with icon, member-avatar row, member/league counts; a main column of "active competition" cards (sport-coloured left bar, leader, live meta-line) plus a cross-sport meta-leaderboard table; a sidebar column with a group activity feed and an "invite to the group" CTA card. It has no chat and no gazette (both were added later), but its accent-colour system (`fb`/`f1`/`ten` sport tones on left-edge bars) is cited in this project's own architecture doc as the canonical reference for how sport colour-coding should read across the product.

**Recommendation:** use Screen 1's layout craft and Screen 7's structural DNA together, then design in the actual chat + gazette + full tab inventory this doc describes — neither old screen has those.

Also worth a skim for tone/quality bar (not literal reference, different feature): `docs/platform_revision/design/screens/Multi-Sport Coin Challenges v2.html` and `Coin Challenges.html`, both already in Kit Light.

---

## Sidebar Spec

Ground truth: `src/components/AppLayout.jsx`. This is **global chrome** — it does not change based on which screen or competition is open, by deliberate design (this was the fix for a prior "three navigation layers" problem).

**Desktop (≥1024px), 220px fixed-width dark rail (`--shell`):**
1. Brand mark (small square glyph + "FantasyKit" wordmark) at the top.
2. **CLUBHOUSE** section: "Clubhouse" (links to Home, carries the unread-notification badge) and "The FrontRow" as an indented sub-item.
3. **COMMUNITY** section: "Trophy Cabinet", "Coin Challenges" (tagged Beta), "Settings".
4. Footer: user avatar initial + username + "Multi-sport" caption, pinned to the bottom.

**What's missing today, and squarely in scope for this brief:** there is currently **no Clubhouse switcher in the sidebar itself.** A user in multiple Clubhouses can only switch between them from inside the Clubhouse screen body (the pill-strip `CircleSelector` — see next section). For a product whose whole IA is "which room am I in," that's a gap worth designing out — a Slack-style workspace switcher near the brand mark, or a dropdown replacing the static "Clubhouse" label, are both reasonable directions. This is one of the explicit asks in this brief.

**Mobile (<768px):** the sidebar is replaced entirely by a **bottom tab bar**, and — this is the part that *does* change per context — its items morph based on the active sport: Football shows `LIVE · SQUAD · LEAGUE · MARKET · CLUB`; an F1 paddock shows `CAL · PICKS · STD · REPORT · CLUB`; Tennis shows `HOME · TABLE · CLUB`. `CLUB` (Clubhouse, with unread badge) is the one constant, always-present item in every variant — it's the anchor back to "the room."

---

## Top Bar Spec

Ground truth: `src/components/CompetitionTopBar.jsx` + `src/components/CompetitionScreenNav.jsx`, both mounted globally in `AppLayout.jsx` above the page content — not part of the Clubhouse screen's own markup, but always visible around it.

1. **Mobile-only sticky strip** (44px, shown only <1024px, sits above everything else): a back button when not on a "main" route, or the username when on one; a settings gear icon, right-aligned.
2. **Competition top bar** (desktop + mobile, horizontal-scrolling if it overflows): one pill per competition across every sport in the active Clubhouse — small sport-coloured dot + competition name, active pill gets a 2px bottom border in that sport's colour. A trailing "+" button opens the new-competition flow. **This bar is empty/hidden if the Clubhouse has zero competitions.**
3. **Competition screen nav** — a secondary strip beneath, showing the screens available *within* whichever competition is active (not detailed in this brief; out of scope, but its presence affects how much vertical space Home has below the top chrome — assume ~40px when a competition is active, 0px when the user is on the Clubhouse screen itself, which isn't a "competition").

**Worth deciding as part of this brief:** when a user is on the Clubhouse Home screen itself (not inside any specific competition), no pill in the competition top bar is "active" — decide whether that should read as neutral/all-unhighlighted, or whether Home should get its own visual treatment in that strip (e.g. a distinct "🏠 Clubhouse" affordance at the start of the row, since it's the one non-competition, always-present destination).

---

## Multi-Clubhouse Switching

Ground truth: `CircleSelector` inside `src/screens/ClubhouseScreen.jsx`. Today it's a simple horizontal pill row — one pill per Clubhouse the user belongs to, active pill accent-outlined and accent-tinted — rendered directly beneath the Clubhouse header, and **only if the user is in more than one Clubhouse** (a single-Clubhouse user never sees it). Switching a pill updates the whole screen's data and the URL (`/clubhouse/:circleId`).

This is functionally complete but undesigned — genuinely just pills in a row. Given the sidebar gap noted above, this brief should resolve **one coherent answer** to "where and how does a user switch Clubhouses," whether that's:
- promoting the switcher into the sidebar (Slack-style, always visible, one click from anywhere in the app), with the in-page pill row demoted or removed, or
- keeping it in-page but designing it as a first-class moment (Clubhouse identity cards, not text pills) since for many users this actually matters — some pilot users already run more than one friend group.

A user with 1 Clubhouse and a user with 5 should both feel like the product was designed for their case.

---

## Other Screens Worth Including in This Pass

In priority order — Home is the P0 ask; everything below is "if there's room," but flagged now so scope decisions aren't made blind:

1. **Clubhouse Home** (desktop + mobile) — P0, described in full above.
2. **Clubhouse Lobby / empty state** (`ClubhouseLobby` in `ClubhouseScreen.jsx`) — the Create/Join screen shown to a user with zero Clubhouses. It's a first-run moment for the platform's core concept and currently a bare form; worth the same craft pass.
3. **The FrontRow / Forza Times gazette** — explicitly named by the user ("gazette tab"). Already has a distinct, intentional broadsheet identity; needs polish more than reinvention, but its interaction model (reactions + comment threads on an AI-written article) is unusual enough to deserve real design attention.
4. **Chat** (channels + DMs) — the two-pane pattern is functional Discord/Slack-lite; if Home ends up absorbing a persistent chat rail (see "the actual design problem"), this may get redesigned as a byproduct rather than standalone.
5. **Sidebar + multi-Clubhouse switcher** — global chrome, covered above, affects every screen in the app.
6. **Top bar / competition switcher** — global chrome, covered above.
7. **Members / Settings tabs** — lower frequency, mostly forms and lists; lowest priority of the set.

**Explicitly out of scope for this pass:** the sport-specific Tier-3 screens (Squad, Market, F1 Picks, Tennis Leaderboard, Live, etc.) — those belong to a separate, later design pass per `docs/platform_revision/architecture/CLUBHOUSE_CENTRIC_REDESIGN.md`.

---

## What to Send Back

- High-fidelity Clubhouse Home mockups, desktop (≥1024px) and mobile (390px), in the reconciled Kit Light tokens above.
- A clear point of view on the Home/Recap/Chat/FrontRow composition question — which surfaces merge, which stay as tabs, and why.
- A sidebar treatment that resolves the multi-Clubhouse-switcher gap.
- A top bar treatment that handles the "Home has no active competition" state.
- Any of the "other screens" list time allows, in the priority order given.

---

## Files Referenced in This Brief

| File | What it is |
|---|---|
| `src/screens/ClubhouseScreen.jsx` | Current production implementation — every tab, component, and state described above lives here |
| `src/components/ClubhouseChat.jsx` | Chat two-pane implementation (channels + DMs) |
| `src/components/ClubhouseFrontpage.jsx` | The Forza Times gazette (broadsheet palette, reactions, comments) |
| `src/components/AppLayout.jsx` | Sidebar (desktop) + bottom tab bar (mobile) + top-bar mounting |
| `src/components/CompetitionTopBar.jsx` | Competition pill strip (global top bar) |
| `src/index.css` | Source of truth for the current Kit Light tokens (lines ~60–110) |
| `docs/platform_revision/design/screens/Multi-Sport Expansion.html` | Old-IA reference mock — Screen 1 "Multi-Sport Home" + Screen 7 "Group Hub" |
| `docs/platform_revision/architecture/CLUBHOUSE_CENTRIC_REDESIGN.md` | The IA/vision doc this whole product structure is built from |
| `docs/platform_revision/design/BRIEF.md` | Original Kit Light redesign brief — direction rationale, now partly superseded on token names (see table above) |

---

Last Updated: **2026-07-24**
