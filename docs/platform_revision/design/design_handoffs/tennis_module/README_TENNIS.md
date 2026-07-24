# Tennis Module — Design Handoff Brief

**For: Claude Design · Prepared July 2026 · Kit Light direction**

**One-line summary:** Design the layout and visual system for FantasyKit's Tennis module — a season-long prediction game built on tiered roster picks, not a live-managed squad. Fully functional in code, never given a real design pass.

---

## What This Is

Tennis is one of three sport modules that plug into a Clubhouse (the other two are Football and F1 — see the separate F1 brief). It is **feature-complete and live in production for the 2026 ATP season**: every screen described below exists, works, and is wired to real data. What it has never had is design craft — it was built directly from a functional spec (`docs/platform_revision/modules/TENNIS_MODULE_IMPLEMENTATION_PLAN.md`) with plain Kit Light styling, and needs the same level of visual attention the Clubhouse core screen is getting in a parallel brief.

**Important structural difference from Football:** Tennis is not a live-managed fantasy squad. There's no transfer market, no live in-play scoring screen, no gameweek-by-gameweek squad tinkering. It's a **prediction/roster game with periodic, admin-driven state changes**: you pick a 7-player tiered squad before a tournament starts, optionally play one power-up card, optionally pick a mid-tournament captain, then wait for the tournament to finish and see your score. Design for that rhythm — calm, checkpoint-based, anticipatory — not a live dashboard that needs refreshing every few minutes.

**No dedicated Tennis mockup exists in the design folder.** `docs/platform_revision/design/screens/Multi-Sport Expansion.html` and the other HTML mocks there are cross-sport/generic — none show tennis-specific screens. The shipped app (described screen-by-screen below) is the only visual reference. Live app: https://wc-fantasy-football.vercel.app.

---

## Read First — Design Tokens

Use the same reconciled Kit Light token table as the Clubhouse brief (`docs/platform_revision/design/design_handoffs/clubhouse_core/README.md`) — do not use the older `BRIEF.md` names. The one token that matters most here:

| Token | Hex | Usage |
|---|---|---|
| `--ten` | `#1B7A52` | Tennis sport colour (Wimbledon green) — top-bar tabs, standings header, nav active states |
| `--tenbg` | `rgba(27,122,82,.08)` | Tennis colour at low opacity — tinted chips/backgrounds |

In the shipped app, `--ten` is used narrowly (standings headers, nav highlights, sport-tab dots) — most primary buttons on Tennis screens still use the generic `--accent` blue, not green. Worth a deliberate call in this pass: should Tennis feel more distinctly green throughout, the way F1 leans hard into red? Or does a quieter, more "clean scoreboard" palette suit a prediction game better than a loud one suits live racing? Recommend the latter, but it's a real design decision, not a given.

Also standard everywhere: Archivo Black (headings), Archivo (body), JetBrains Mono (uppercase eyebrow/label text, letter-spaced) — same as Clubhouse.

---

## Where Tennis Sits in the Navigation

- **Mobile bottom nav**, only shown when the active competition is a tennis Player's Box: **`HOME · TABLE · CLUB`** — three items, notably fewer than Football or F1 get (no live tab, no market/squad-management tab — there's nothing to manage day-to-day).
- **Competition top bar** (global chrome, shared across sports): each of the user's Player's Boxes appears as a green-dotted pill alongside football leagues and F1 paddocks.
- **In-competition secondary nav**: `HOME` and `LEADERBOARD` only.
- **Entry point for a user with no box yet**: `/tennis/box` (Player's Box create/join screen) — the tennis equivalent of a league-creation wizard.

This sparse nav (3 items vs. Football's 5) is itself a design signal: Tennis should read as a lighter, calmer surface, not a scaled-down version of the football UI with tabs missing.

---

## Screens to Design

### 1. Tennis Home (`/tennis`) — season overview, the tab a user lands on
The daily-use screen. Priority 1 for this brief.

- **Header**: season eyebrow ("🎾 Tennis · 2026 ATP Season"), Player's Box name as H1 (or a switcher if the user is in more than one box), member count + invite code.
- **No-box state**: full empty-state prompt to create/join a box — this is many users' very first tennis screen, worth real craft.
- **Action banner** — appears only when there's something to act on right now (roster picks open, or a QF captain window open). This is the single most important moment on the screen: it should be impossible to miss, distinct from the rest of the page, and disappear entirely when there's nothing pending.
- **Season standings snapshot** — top 5 of the box, link through to the full table.
- **2026 Calendar list** — all 14 tournaments (4 Grand Slams, 9 Masters 1000, 1 ATP Finals) in date order: surface icon (hard/clay/grass/indoor), tournament name, type badge, dates, and a status label per tournament (Upcoming / Pick your squad / In Progress / Pick Captain / Completed) plus a "Squad set ✓" confirmation chip once the user has picked. Upcoming (not-yet-open) rows are visually de-emphasized and non-interactive.

**Design challenge:** this is a season-long calendar, not a single event — help a user answer "what do I need to do right now, and what's coming next" at a glance, across up to 14 rows, without it reading as a plain table.

### 2. Player's Box (`/tennis/box`) — create/join/manage groups
Three-tab screen: **My Boxes / Create / Join**.
- My Boxes: card list — box name, member count, click-to-copy invite code, "Enter" action. Empty state for a brand-new user.
- Create: requires an existing Clubhouse; simple form (pick Clubhouse, name the box).
- Join: 8-character invite code entry.

This is a low-frequency utility screen (visited once per box, rarely after) — keep it simple and fast, not a design centerpiece.

### 3. Tournament screen (`/tournament/:id`) — the core interaction, one per tournament
This is where the actual game gets played, and it changes shape entirely depending on the tournament's phase — design each state as its own moment, not one form with conditionals bolted on:

- **Roster picker** (when picks are open): build a 7-player squad across 4 tiers — Tier 1 (1 pick from Seeds 1–4), Tier 2 (2 picks from Seeds 5–16), Tier 3 (2 picks from Seeds 17–32), Tier 4 "Dark Horses" (2 picks, unseeded). Each tier is its own picker group; a player already used in another slot can't be picked twice. Below the roster, an **optional Ace Card** — one of four season-long power-ups (see glossary below), at most one played per tournament, each type usable once per season. This picker is the single richest interaction in the whole module — worth the most design attention in this brief after Home.
- **Locked squad view** (once picks are locked): the same 4-tier structure, now read-only, each player showing whether they're still in or which round eliminated them, captain star if set, and the played Ace Card if any.
- **QF Captain picker** (opens once 8 players remain, 48-hour window, non-Grand-Slam-final format): pick one surviving roster player to score double for the rest of the tournament. High-stakes, time-boxed — should feel urgent without being alarming.
- **Final score card** (once complete): total score broken into base + Ace Card bonus + captain bonus pills.
- **Two quiet waiting states**: "roster not yet open" (players haven't been seeded) and "in progress, no QF window yet."

### 4. Leaderboard (`/tennis/leaderboard`) — full season standings
- Standings table: Slams / Masters / Finals / Total columns, medals for top 3, "N played" chip per row.
- A visible **Masters Drop Rule** note — only the best 4 of 9 Masters 1000 results count once 5+ are complete. This rule directly affects how a user reads their own score, so it shouldn't be a buried tooltip.
- **Per-tournament breakdown**: desktop gets a full manager × tournament matrix table; mobile switches to per-manager cards with colour-tinted result chips (a genuine responsive redesign opportunity, not just reflow).

### 5. ATP Finals (`/tennis/finals`) — a special one-off format, distinct from the rest of the season
Season-ending event, 8 players, round-robin then knockout — the *only* tournament where the game is "predict every match winner," not "pick a squad."
- A **scoring tiers reference card**, always visible — 5 tiers from "Unforced Error" (1–5/15 correct, 250 pts) up to "🏆 The Perfect Slate" (15/15, 7,500 pts). This escalating, named-tier structure is a great design opportunity — it's built to feel like a countdown to a huge payoff.
- **Group Stage**: 12 head-to-head match picks, submitted together and locked.
- **Knockout**: 3 more picks (2 semis + final), unlocked after group stage locks.
- Each match pick is a two-player toggle; once a result is in, correct/incorrect/actual-winner all need distinct, legible states.

### 6. Admin panel (`/tennis/admin`)
Commissioner/ops tooling — phase controls, player seeding, round-result entry, ATP Finals result entry. Lower design priority (infrequent, single-operator use) but should still read as part of the same system, not a bare HTML form.

### 7. Tennis history block (embedded in user profile, not its own route)
A compact card inside the profile screen — season total + a scrollable list of scored tournaments. Small surface, worth a pass but not a priority screen.

---

## Glossary — Tennis-Specific Terms (use these exactly; don't invent alternates)

| Term | Meaning |
|---|---|
| **Player's Box** | The tennis group/league — equivalent of a football "league" or F1 "paddock" |
| **Squad / roster** | The 7-player tiered pick-list for one tournament (not a draft — a fresh pick-list every tournament) |
| **Tier 1–4** | Seed bands: T1 = Seeds 1–4 (1 slot), T2 = Seeds 5–16 (2 slots), T3 = Seeds 17–32 (2 slots), T4 "Dark Horses" = unseeded (2 slots) |
| **Ace Card** | One-per-tournament, one-per-type-per-season power-up: **Underdog Boost** (2× your Tier 4 players), **Safety Net** (+200 pts if your Tier 1 pick exits round 1–2), **Surface Specialist** (2× your entire roster), **Dark Horse Insurance** (bonus per round your unseeded picks survive past Round of 32) |
| **QF Captain** | A surviving roster player picked (once 8 players remain, 48h window) to score 2× for the rest of the tournament |
| **Masters Drop Rule** | Only the best 4 of 9 Masters 1000 results count toward season total |
| **Round-reached labels** | R128 / R64 / R32 / R16 / QF / SF / Runner-up / 🏆 Champion |

⚠️ **Naming inconsistency to resolve, not replicate:** the QA test plan refers to "Qualifier Insurance" where the shipped code and UI both say **"Dark Horse Insurance."** Use "Dark Horse Insurance" — flag back to engineering if you see the other name anywhere.

---

## States That Must Be Designed (not just the "happy path")

Because this is a checkpoint game rather than a live dashboard, the *states* matter more than they would for a live-scores screen:

- Tournament: upcoming (locked out) → roster open (picking) → in progress, locked (waiting) → QF captain window (urgent, time-boxed) → completed (scored).
- Zero-box new user (Home + Player's Box empty states).
- Single box vs. multiple boxes (switcher needed).
- ATP Finals: not-yet-seeded → group stage open → group locked / knockout open → fully complete.
- Leaderboard: no scores yet vs. a full 14-tournament season.

---

## What's Out of Scope for This Pass

- The Clubhouse screens around Tennis (Home, Chat, FrontRow, sidebar, top bar) — covered in the separate Clubhouse Core brief; don't redesign those here.
- The Admin panel's data-entry mechanics (fine to restyle to match the new system, but not a priority — it's an internal ops tool).
- Any change to scoring rules, tier sizes, or the Ace Card catalogue — those are game-design decisions already locked in and shipped; this brief is UI/layout only.

---

## What to Send Back

- Tennis Home (desktop + mobile), including a treatment for the "action banner" moment.
- The Tournament screen's roster-picker and locked-roster states.
- The QF Captain picker.
- The Leaderboard, including the mobile per-tournament card fallback.
- ATP Finals, if time allows — it's the most visually distinct moment in the module (escalating scoring tiers, round-robin-to-knockout structure) and could be a real showpiece.

---

## Files Referenced in This Brief

| File | What it is |
|---|---|
| `src/screens/tennis/TennisHomeScreen.jsx` | Season home |
| `src/screens/tennis/PlayerBoxScreen.jsx` | Create/join/manage boxes |
| `src/screens/tennis/TennisTournamentScreen.jsx` | Roster picker, QF captain, score |
| `src/screens/tennis/TennisLeaderboardScreen.jsx` | Season standings |
| `src/screens/tennis/TennisAtpFinalsScreen.jsx` | ATP Finals prediction slate |
| `src/screens/tennis/TennisAdminScreen.jsx` | Commissioner tooling |
| `src/screens/tennis/TennisProfileView.jsx` | Profile embed |
| `src/hooks/tennis/*.js` | Data hooks backing each screen above |
| `src/components/competition/CompetitionResultsHeader.jsx` | Shared standings table component (also used by Football/F1) |
| `src/components/CompetitionTopBar.jsx`, `CompetitionScreenNav.jsx` | Global nav chrome tennis plugs into |
| `docs/platform_revision/modules/TENNIS_MODULE_IMPLEMENTATION_PLAN.md` | Full functional/scoring spec this module was built from |
| `docs/testing/TENNIS_MODULE_TEST_PLAN.md` | QA scenarios, confirms current production state |
| `docs/platform_revision/design/design_handoffs/clubhouse_core/README.md` | Companion brief — token table, Clubhouse chrome |

---

Last Updated: **2026-07-24**
