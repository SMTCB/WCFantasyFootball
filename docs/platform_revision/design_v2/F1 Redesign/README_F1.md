# F1 Module — Design Handoff Brief

**For: Claude Design · Prepared July 2026 · Kit Light direction**

**One-line summary:** Design the layout and visual system for FantasyKit's F1 module — a per-race and season-long prediction game (podium picks, DNF, team, a rotating special question). Fully functional in code, currently rendering mostly in the platform's generic blue accent instead of a distinct F1 identity.

---

## What This Is

F1 is one of three sport modules that plug into a Clubhouse (the other two are Football and Tennis — see the separate Tennis brief). It is **feature-complete and live in production for the 2026 season** (24 rounds): every screen below exists, works, and is wired to real data, ported from a standalone prior app (`FantasyF1`). What it hasn't had is a real design pass.

**Structural shape of the game:** like Tennis, this is a **prediction game, not a live-managed squad** — no transfers, no in-play live screen. Twice a week/fortnight, a user predicts a race (podium P1/P2/P3, a DNF driver, the team with most points, and one rotating "special category" question), locks it in before qualifying, then finds out how they did once the race is scored. Once a season, they also lock in 10 season-long predictions (champion, runner-up, etc.) that only resolve at year-end. Design for that rhythm: a countdown-driven "get your picks in" urgency around each race, then a calm results/report reveal afterward.

**Live app:** https://wc-fantasy-football.vercel.app. A second reference worth opening directly: **https://fantasy-f1-p3jq.vercel.app/** — the original standalone FantasyF1 app this module was ported from; its Tier 2/3 competition layout is cited in this project's own architecture doc as informing the current F1 build.

---

## Read First — Design Tokens

Use the same reconciled Kit Light token table as the Clubhouse and Tennis briefs (`docs/platform_revision/design/design_handoffs/clubhouse_core/README_CLUBHOUSE.md`) — not the older `BRIEF.md` names. The token that matters most here:

| Token | Hex | Usage |
|---|---|---|
| `--f1` | `#E10600` | F1 sport colour (Ferrari red) — top-bar tabs, nav chrome, standings |
| `--f1bg` | `rgba(225,6,0,.08)` | F1 red at low opacity — tinted chips/backgrounds |

⚠️ **Worth deliberately fixing in this pass:** today, `var(--f1)` red is only actually applied in the global nav chrome (competition top bar, secondary screen nav) and on the Standings screen. The other five F1 screens — Home, Race Picks, Season Bets, Report, Admin — render entirely in the platform's generic blue `--accent`, with no F1-red identity at all once you're inside them. If "F1 = red" is meant to be a real product identity (the way the FrontRow gazette has its own broadsheet identity), this brief should establish where and how red shows up consistently across the whole module, not just the tab strip.

Standard everywhere: Archivo Black (headings/large numbers), Archivo (body), JetBrains Mono (uppercase eyebrow/label/badge text, letter-spaced 0.08–0.2em) — same conventions as the rest of the app.

---

## Where F1 Sits in the Navigation

There are currently **two different tab sets** depending on viewport — worth knowing going in, and worth deciding whether to reconcile:

**Mobile bottom nav** (5 items): `CAL · PICKS · STD · REPORT · CLUB`
**Desktop secondary nav** (5 items, different set): `CALENDAR · PICKS · STANDINGS · REPORT · SEASON`

Notice: **Season Bets has no icon or slot in the mobile bottom bar at all.** On mobile it's reachable only via a card inside F1 Home's "Paddocks" section. On desktop it's a full top-level tab. That's a real gap for a mobile-first product — decide in this pass whether Season Bets deserves a permanent mobile nav slot (likely swapping out one of the five, since five is already the max the bottom bar comfortably holds) or stays a secondary destination reached from Home.

- **Competition top bar** (global chrome): each of the user's Paddocks appears as a red-dotted pill alongside football leagues and tennis boxes.
- **Entry point for a user with no paddock yet**: `/f1` (`PaddockLobbyScreen`) — the F1 equivalent of a league-creation wizard.
- **Admin**: not in either nav list — reached only via an "ADMIN" button in F1 Home's header, gated on `is_admin`.

---

## Screens to Design

### 1. F1 Home (`/f1/:paddockId`) — the CAL tab destination, priority 1
- **Header** (dark shell): eyebrow "🏎 Formula 1 · 2026"; clickable paddock name + dropdown switcher (member count, race progress "{finished}/{total} races"); an always-visible "ADMIN" pill top-right.
- **Two internal sections** (its own underline-tab toggle, separate from the bottom nav): **Calendar** and **Paddocks**.
- **Calendar section:**
  - **Next Race countdown card** — flag, GP name, round + circuit, a live "Xd Xh to race" countdown, and a full-width "Submit picks for R{n} →" CTA. This is the single most important element on the screen — the one thing a user needs to act on. It should anchor the page.
  - **Full 24-race season list** — round number, flag, GP name, date, a "· SPRINT" tag on sprint weekends, and a right-aligned status (finished/live/qualifying/upcoming) or the race winner's name once run. The active next-race row is highlighted.
- **Paddocks section:**
  - A "My Picks" CTA, then a 2×2 card grid to Standings / Season Bets ("Year Bets") / Race Picks / Report.
  - A "Top of the Paddock" leaderboard preview (top 5, medals for 1–3).

**Design challenge:** same as Tennis Home — this is a 24-round season calendar plus a leaderboard plus quick links, and it needs to read as "here's what's happening now" at a glance, not a long scrollable list. The countdown card is the emotional center of the screen — give it real presence.

### 2. Race Picks (`/f1/:paddockId/picks/:round?`) — the core interaction, one per race
The richest form in the module — deserves the most craft after Home.
- **Round selector strip**: horizontal scrollable pills, R1–R24, active/finished/upcoming states.
- **Race header**: round + date, flag + GP name, circuit, sprint tag.
- **Lock state banner**: locked (picks closed, qualifying started) vs. saved-and-editable vs. race-finished-with-result-shown (podium recap inline).
- **Prediction form, four sections:**
  1. Podium — P1/P2/P3 driver pickers, each excluding drivers already used in the other two slots.
  2. DNF driver (optional).
  3. Team with most points.
  4. **Special Category** — a rotating bonus question, different every round (18 unique questions across 24 races), rendered as either a driver picker, a team picker, or a set of toggle-button options depending on the question type. This variability is worth a flexible, well-considered component — it's the one part of the form that changes shape every round.
- **Scoring guide strip** — always-visible inline legend of point values.
- **Save button**, with locked/saving/saved states.

### 3. Season Bets (`/f1/:paddockId/season`)
Once-a-season, 10 predictions (champion, P2, P3, constructors' champion, last-place constructor, fewest-finishers race, most-DNFs driver, first-driver-replaced, most poles, most podiums-without-a-win). Locks for the year once submitted/admin-locked. Once final results are in, each field shows a correct/incorrect indicator against the user's pick. Lower interaction frequency than Race Picks (once per season) but the "10 big bold predictions, revealed at year-end" framing is a nice design moment in its own right — treat it as a season-long wager, not a boring settings form.

### 4. Standings (`/f1/:paddockId/standings`) — STD tab
Paddock leaderboard with a 3-way view toggle: **Total / Race points / Season points** (same rows, re-sorted). Medals for top 3, "you" row highlighted, a scoring-legend footer. This is currently the one screen that actually uses F1 red throughout — a good template for how red should show up elsewhere.

### 5. Report (`/f1/:paddockId/report`) — REPORT tab
An accordion, one row per finished race: collapsed = round/GP/date/total points; expanded = actual podium result, a pick-by-pick comparison (your pick vs. actual, colour-coded right/wrong, points per field), an all-correct bonus callout if earned, and a total. This is the "how did I do" moment right after a race — reward correct picks visually, don't just list them.

### 6. Paddock Lobby (`/f1`) — create/join/manage groups
Three-tab screen: **My Paddocks / Create / Join** — structurally identical in behavior to Tennis's Player's Box screen (card list with invite codes, simple create form, join-by-code). Low-frequency utility screen; keep it simple, reuse whatever pattern you land on for Tennis's equivalent screen for consistency.

### 7. Admin panel (`/f1/:paddockId/admin`)
Two sections: **Race Results** (enter/fetch-from-OpenF1 podium + team + special answer, then trigger scoring) and **Season Bets** (lock toggle + enter final season results). Lower design priority — internal ops tool, single operator — but should read as part of the same system.

---

## Terminology Glossary (use exactly; don't invent alternates)

| Term | Meaning |
|---|---|
| **Paddock** | The F1 group/league — equivalent of football "League" or tennis "Player's Box" |
| **Picks / Predictions** | User-facing term for what the database calls "bets" — never say "bets" in UI copy except the literal "Season Bets" screen name |
| **Podium** | P1/P2/P3 prediction |
| **DNF** | "Did Not Finish" — the retirement-prediction field |
| **Special Category** | The rotating bonus question, unique per round (driver, team, or multiple-choice type) |
| **GP** | Grand Prix — used in every race name ("Australian GP") |
| **Round** | Race number in season, always shown as "R{n}" |
| **Sprint (weekend)** | A race weekend with an added sprint race — flagged with a "· SPRINT" tag |
| **Constructor / Team** | Used interchangeably |

**Scoring (as actually implemented — use these values, not the older mockup's numbers):** P1 exact 10 pts · P2 exact 8 · P3 exact 6 · right driver, wrong podium spot 3 · correct DNF 5 · correct team 5 · correct special category 5 · all-six-correct bonus 3.

**Important — bets are global per user, not per paddock.** A user in two Paddocks makes one shared set of picks; only the leaderboard is paddock-scoped. This is a deliberate architecture decision, not a bug — worth keeping in mind when designing the paddock-switcher UI (switching paddocks changes whose leaderboard you see, not what you've predicted).

---

## Reference Materials — and a discrepancy to flag

Two F1-specific mockups already exist in `docs/platform_revision/design/screens/Multi-Sport - Coin Challenges v2.html` (the most current version — same screens also appear in the earlier v1 and in `Multi-Sport Expansion.html`):

- **"Screen 2 — F1 Prediction Form"** (`#s-f1p`): a race-picks form concept with a countdown, a 6-field prediction grid, and an Open/Submitted toggle state.
- **"Screen 3 — F1 Results"** (`#s-f1r`): a podium visualization (P1/P2/P3 as physical podium blocks), a picks-vs-actual comparison table, a big score callout, a paddock leaderboard, and a "Gazette entry" card showing an auto-generated recap sentence.

**Treat both as aspirational concept references, not documentation of current behavior.** They diverge from what's actually shipped in three ways worth knowing before you start: (1) they use a different scoring scale (P1=15/P2=12/P3=10/DNF=5/Team=8/Special=6) than the real implemented scoring above (10/8/6/3/5/5/3) — use the real numbers; (2) the podium-platform visualization on the Results screen doesn't exist in the real `F1ReportScreen`, which is an accordion instead — it's a genuinely nice idea worth considering for this pass, just not a description of today's build; (3) the "Race Picks / Season Long / Group Picks" in-page tab pattern doesn't match the real app, which splits these across separate routes/screens instead.

**The strongest visual craft reference is the Results screen's podium block and the "your picks vs. actual" comparison table** — both are worth carrying forward into the real Report screen design. The Gazette-entry card is also a nice touch, though gazette generation is a Clubhouse-level feature (see the Clubhouse Core brief), not something F1 screens generate themselves.

---

## States That Must Be Designed

- Race: upcoming → picks open (editable) → locked (qualifying started, waiting) → finished (result + your score shown).
- Season Bets: open/editable → locked (admin-triggered) → final results in (correct/incorrect per field).
- Zero-paddock new user (Home + Lobby empty states).
- Single paddock vs. multiple paddocks (switcher).
- Special Category field: three different input shapes (driver / team / multiple-choice) depending on the round's question — the picks form needs to handle all three gracefully.
- Report: no finished races yet vs. a season's worth of accordion rows vs. a race the user forgot to pick ("No picks submitted").

---

## What's Out of Scope for This Pass

- Clubhouse screens around F1 (Home, Chat, FrontRow, sidebar, top bar) — covered separately in the Clubhouse Core brief.
- The Admin panel's data-entry mechanics (restyle to match, but not a priority).
- Any change to scoring rules or the special-category question set — game design is locked in; this brief is UI/layout only.

---

## What to Send Back

- F1 Home (desktop + mobile), with a strong treatment for the countdown/next-race card.
- The Race Picks form, including all three Special Category input variants.
- The Report accordion — consider whether the old mockup's podium visualization belongs here.
- Standings, including the 3-way view toggle.
- A decision, with rationale, on where F1 red shows up beyond the nav chrome and Standings screen.
- Season Bets and Paddock Lobby if time allows.

---

## Files Referenced in This Brief

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
| `docs/platform_revision/modules/F1_MODULE_IMPLEMENTATION_PLAN.md` | Full functional/scoring spec this module was built from |
| `docs/platform_revision/design/screens/Multi-Sport - Coin Challenges v2.html` | Existing F1 concept mockups (Screens 2 &amp; 3) — aspirational reference, see discrepancy note above |
| `https://fantasy-f1-p3jq.vercel.app/` | Original standalone FantasyF1 app this module was ported from |
| `docs/platform_revision/design/design_handoffs/clubhouse_core/README_CLUBHOUSE.md` | Companion brief — token table, Clubhouse chrome |
| `docs/platform_revision/design/design_handoffs/tennis_module/README.md` | Companion brief — Tennis module (same format) |

---

Last Updated: **2026-07-24**
