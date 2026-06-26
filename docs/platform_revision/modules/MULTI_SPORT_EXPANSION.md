# Multi-Sport Expansion — Strategy & Decisions

**Vision, architecture decisions, and open questions from the June 2026 strategic brainstorm.**

---

## The Vision

This platform is not just a fantasy sports application. It is a **social app built around sports events**, where private groups of friends compete together across multiple sports and across the whole year. Fantasy mechanics are the engagement layer; the friend group is the product.

Key design principles agreed:
- **Private leagues built around friends** — the Sleeper model applied to European/global sports
- **Sport modules are isolated** — different sports have different rules, data models, and cadences; no forced unification
- **Shared social layer** — all sports feed into one activity feed, one trophy cabinet, one group identity
- **The gazette model scales** — the gazette/activity narrative layer already built for football extends to all sports

---

## Sports Roadmap

### Football (Existing — Expand Aug/Sep 2026)

The current `tournament_id` abstraction already supports multiple competitions with zero code changes. Expansion is data plumbing, not architecture.

**Planned competitions:** EPL, Champions League, La Liga. Others (Bundesliga, Serie A) on demand.

**Key rule:** When a manager joins a league, they select which football competition it covers. EPL is a league, Champions League is a separate league — managers can be in both simultaneously. A player (e.g. Erling Haaland) appears in both tournament's player pool. Picking him for your EPL squad and your CL squad is allowed and expected — they are scored from different fixtures entirely. No cross-tournament squad concept.

**Estimate:** 3–5 weeks for 2–3 new competitions fully seeded and live.

---

### F1 (Integrate — Target: Jan 2027, ready for 2027 season)

An existing F1 fantasy app lives at [github.com/SMTCB/FantasyF1](https://github.com/SMTCB/FantasyF1).

**What the existing F1 app is:** A prediction game, not squad management. Before each race, managers predict P1/P2/P3, DNF driver, team with most points, and a special category question. There are also season-long predictions (driver champion, constructor champion, etc.). Points awarded per prediction accuracy.

**What it is not:** A driver draft/squad management app. This is important — the scoring model is much simpler than football.

**Integration approach: Port into Vite/React.**

The F1 app is built on Next.js 16, but the football platform runs on Vite + React. The F1 app is small (3 database tables, one prediction form, one leaderboard) and the port is estimated at 3–4 weeks. Migrating the football app to Next.js would be months of risk for no user-facing benefit. Decision: **stay on Vite/React for the unified platform; port F1 logic across.**

Next.js migration can be revisited in 2027 if the platform's scale justifies it (SEO, social sharing, server components).

**What the F1 integration adds:** Private leagues within F1 (the existing app has a single shared global leaderboard with no friend group concept — this is the core addition), and connection to the overarching meta-league.

**Data source:** OpenF1 (free, open API, already integrated in the existing app).

**Estimate:** 3–4 weeks to port + 2 weeks to add private leagues layer.

---

### Tennis (Build New — Target: Australian Open, Jan 2027)

Build from scratch. Start scoped, expand based on traction.

**Launch scope: 4 Grand Slams + 4 flagship Masters 1000**

| Event | Surface | Approx Date |
|---|---|---|
| Australian Open | Hard | January |
| Indian Wells Masters | Hard | March |
| Roland Garros | Clay | May/June |
| Rome Masters | Clay | May |
| Wimbledon | Grass | June/July |
| Canada Masters | Hard | August |
| US Open | Hard | August/Sep |
| Paris Masters | Indoor hard | November |

Total: 8 events per year, well spread, no overlapping events. Adds coverage from January through November.

**Why not GS-only:** 4 events per year is too sparse to sustain engagement — months of silence in the tennis module. 8 events keeps the group active year-round.

**The game model:**
- Before each tournament: each manager picks 5 players
- Score as players advance through rounds
- Example scoring: R1=1pt, R2=2pt, R3=3pt, R16=5pt, QF=8pt, SF=13pt, Final=20pt, Win=30pt
- Captain = 2× multiplier on that player's points
- No live scoring complexity — just round results

**Data strategy — two phases:**

*Phase 1 (pilot — Australian Open Jan 2027):* Semi-manual result entry. After each day of play, a commissioner enters which players from the active squads advanced or were eliminated. For a pilot with 10–15 managers × 5 players each, this is ~40 unique players to track per tournament. 2 minutes of admin per day. Manual entry also fits the gazette model naturally — the commissioner "announcing" results becomes a social moment.

*Phase 2 (if traction):* TheSportsDB (free, community-maintained, covers Grand Slams and Masters 1000, returns JSON). A cron running 10× per day during active tournament weeks = ~6,700 API calls per year across all 8 events. Well within free tiers. No cost.

**Estimate:** 8–12 weeks to build the tennis module from scratch at this scope.

---

## Additional Sports Considered

| Sport | Verdict | Rationale |
|---|---|---|
| **Golf Majors** | Strong yes — Year 2 | 4 events (Masters, US Open, The Open, PGA), identical model to tennis GS, same demographic, fills April gap between football seasons |
| **Cricket (IPL)** | Year 2 conditional | Massive India/UK/South Asia market, currently unserved — depends on whether user base warrants it |
| **UFC/MMA** | Year 2 dark horse | Simple prediction model (pick fight winners), very social, growing younger demographic, weekly events = constant feed activity |
| **NBA / NFL** | No | Dominated by Sleeper, ESPN, FanDuel — no clear edge, US-market focus |

---

## The Overarching Meta-League (OPEN — Decision Deferred)

A "group" of friends that spans all sports, accumulating a standing across the full year. This is the platform's potential core identity and it is not yet decided.

**The central problem:** How do you make 80 football fantasy points meaningfully comparable across different sports on different scales?

**Three candidate directions:**

**Trophy Cabinet (leading candidate)**
Win any round/event in any sport = earn a sport-specific trophy. Year end: most trophies = overall champion.
- No normalization math
- Visually compelling (profile page as a cabinet, shareable)
- Trophy announcement integrates naturally with gazette
- Risk: unequal opportunities if a manager only plays one sport — needs a participation floor rule

**Olympic Points Table**
Each sport contributes fixed meta-points: 1st in any round = 10 meta-pts, 2nd = 8, etc.
- Normalizes cleanly across sports
- Loses the sense that winning a Wimbledon fantasy differs from winning a GW

**Season Championships**
Each sport has its own season champion. Overall winner = most individual sport title wins.
- Cleanest storytelling
- Works even with unequal participation
- Natural year-end climax moment

**Hybrid direction (to explore):**
Bronze/silver/gold weighting: GW win = bronze, Grand Slam tennis win = silver, full sport season win = gold. Year-end ranking is gold-first, then silver, then bronze. Creates meaningful hierarchy between wins.

**This decision is explicitly left open.** It is the platform's core identity and warrants a dedicated brainstorm before committing. See [next steps](#next-steps) below.

---

## Competitive Positioning

**Primary reference: Sleeper**

Sleeper is the best social fantasy platform in existence. They own American sports (NFL, NBA, MLB) with excellent UX, dynasty leagues, and in-app social features.

| Dimension | Sleeper | This platform |
|---|---|---|
| NFL / NBA / MLB | Dominant | Not competing |
| European football (soccer) | Weak | Core product |
| F1 | None | Integrating |
| Tennis | None | Building |
| Golf | None | Year 2 |
| Private leagues | ✅ | ✅ |
| Cross-sport meta-league | ❌ | Building — differentiator |
| Bets within leagues | ❌ | ✅ differentiated |
| Gazette / social narrative layer | ❌ | ✅ differentiated |
| Non-US / European market | Minimal | Primary target |

**The positioning:** Sleeper owns the American sports social fantasy market. This platform's opportunity is to own the equivalent for international/European sports. No platform currently gives a group of European friends one place to play football, F1, and tennis fantasy together with a social layer.

**The risk to name explicitly:** FPL (Fantasy Premier League) has 11 million users. You will not win the public EPL fantasy market against them. The angle must be **private, social, friend-group first** — which is exactly where FPL has no product at all. This is the Sleeper playbook applied to European sports.

---

## Architecture Summary

```
[Shared Social Layer]
  - Users, auth, profiles
  - "Group" concept (overarching meta-league — design TBD)
  - Platform-wide activity feed (gazette from all sports)
  - Trophy cabinet / profile
  - Chat (already exists per football league)
  - Cross-sport bets (extension of existing bet system)

[Sport Modules — Isolated]
  - Football: existing app + EPL / CL / La Liga (Aug/Sep 2026)
  - F1: port of existing Next.js app into Vite/React (Jan 2027)
  - Tennis: new build, GS + 4 Masters 1000 (from Jan 2027)
  - Golf Majors: Year 2 (same model as tennis)

[Meta-League Engine — TBD]
  - Collects results/wins from each sport module
  - Awards trophies or meta-points (model TBD)
  - Drives platform-wide year-end narrative
```

Each sport module uses its own DB tables, Edge Functions, and scoring logic. The shared social layer reads from all of them. No forced schema unification between sports.

---

## Delivery Timeline

| Quarter | Milestone |
|---|---|
| Aug/Sep 2026 | Football expansion: EPL + CL + La Liga live |
| Nov/Dec 2026 | F1 port complete; private leagues added; ready for 2027 season |
| Jan 2027 | Tennis launches with Australian Open |
| Mar–Nov 2027 | Tennis rolling events (Indian Wells through Paris Masters) |
| Apr 2027 | Golf Majors — The Masters (if Year 2 approved) |
| Dec 2027 | First full multi-sport year; overarching league year-end climax |

---

## Open Questions

1. **Overarching meta-league model** — Trophy Cabinet vs Olympic Points vs Season Championships vs Hybrid. Core identity decision, needs dedicated session.

2. **Group/Circle concept** — What is the social container that holds friends across all sports? Is it a "group" you create, or does it emerge from overlapping league membership? How do you invite friends into the full multi-sport experience?

3. **Tennis data Phase 2** — TheSportsDB vs other free APIs. Decision needed before automating (can wait until after Australian Open pilot).

4. **F1 private leagues design** — The existing F1 app has one global leaderboard. How do private leagues work in F1? Same invite-code model as football? Does a manager need separate F1 leagues for each friend group, or can one F1 league span multiple friend groups?

5. **Golf Majors confirmation** — Approve or defer for Year 2 planning.

---

## Next Steps

- [ ] Dedicated brainstorm session on the meta-league identity (question 1 above)
- [ ] Build EPL/CL/La Liga football expansion (Aug/Sep 2026 target)
- [ ] Begin F1 port scoping (target: ready for Mar 2027 Australian GP season opener)
- [ ] Design tennis game model in detail before Australian Open build

---

Last Updated: **2026-06-16**
