# Forza Fantasy League — Platform Brief for Independent Valuation

**A self-contained functional and technical description of the platform, prepared so an independent expert can form their own valuation.** This document intentionally contains **no asking price, target range, or negotiating position** — those are deliberately withheld so your estimate is independent. Where a valuation input is needed (build scope, risk register, what is and isn't finished), it is given factually.

*Prepared 2026-07-01. Reflects the `v2` development branch of the codebase. Companion technical detail (optional deeper read): [TECH_DOCUMENTATION.md](TECH_DOCUMENTATION.md) and [TECHNICAL_DUE_DILIGENCE.md](TECHNICAL_DUE_DILIGENCE.md).*

---

## How to read this document

- **§1–§4** describe **what the product does** (functional) — for a commercial/market view.
- **§5–§9** describe **how it is built** (technical) — for an engineering/asset view.
- **§10** is an **honest state map** — what is production-grade, what is half-finished, what is not started. A credible valuation depends on these being on the table.
- **§11** lists the **valuation inputs** we can supply on request (build history, cost basis, integrations, legal posture) and the **open questions** a buyer's diligence would raise.

If you have limited time: read §1, §4, §7, and §10.

---

## 1. What the platform is (one paragraph)

Forza Fantasy League is a **multi-sport fantasy gaming platform** — a web app plus native iOS/Android shells — where friends form private leagues, build or draft squads, and compete on **live, real-world match scoring**. Around the core fantasy loop sits a social layer (a "Clubhouse" that groups competitions across sports, group chat, direct messages, and an AI-generated league "newspaper"), a set of competition formats (classic, draft, head-to-head, cup), player trading and auctions, commissioner-run prediction bets, and a virtual-coin economy with a Stripe top-up path and peer-to-peer challenge betting. It began as a **football product with a live ~50-user pilot** and has been extended into a **three-sport platform (Football, Formula 1, Tennis)** with a shared social and competition spine.

---

## 2. Product at a glance

| | |
|---|---|
| **Product type** | Fantasy sports — responsive web app + iOS/Android (Capacitor native wrapper) |
| **Sports covered** | Football (live pilot), Formula 1, Tennis (both built and routed) |
| **Core loop** | Build/draft a squad → real players score fantasy points from live matches → compete in leagues → transfer/trade/bet between rounds |
| **Social layer** | "Clubhouse" cross-sport groups · league chat · direct messages · AI-generated daily league newspaper with reactions & comments |
| **Monetisation primitive** | Virtual coin wallet + Stripe coin purchases + peer-to-peer challenge betting (built; not yet switched on for real money) |
| **Current live status** | Football live with a ~50-user pilot; Formula 1, Tennis, coins, and the Clubhouse layer are built on the development branch, not yet released |
| **Business stage** | Pre-revenue; small closed pilot; no marketing spend to date |

---

## 3. Feature inventory (functional)

Grouped by area. Everything listed is **built** unless explicitly flagged.

### 3.1 Football (the mature module — live in the pilot)
- Squad building with formation validation, budget, and per-club caps
- Transfer market with buy/sell, transfer windows, and per-round free-transfer limits + point penalties for extra transfers
- Draft leagues (lottery and reverse-standings order), ranked wishlists, and knockout-phase "keeps"
- Head-to-head and cup competition formats alongside classic leagues
- Player-for-player trades and two-phase auction listings
- Commissioner-created prediction "side bets" auto-resolved against real results
- Live scoring: position-specific rules, captain multipliers, automatic substitutions, clean-sheet and minutes logic, penalty-shootout handling
- League standings, ranks, and an activity feed ("gazette")
- Lineup/captain management with mid-round locking rules

### 3.2 Formula 1 module (built, not yet released)
- "Paddocks" (F1 leagues), race and season prediction picks, championship standings
- Race scoring engine fed by live F1 timing data

### 3.3 Tennis module (built, not yet released)
- "Player's Box" leagues, tournament roster picks with player tiers, "Ace Cards" (special one-shot boosts), a QF captain mechanic, and an ATP Finals pick'em
- Tournament and ATP-Finals scoring engines; season leaderboard with a "Masters Drop Rule"

### 3.4 Clubhouse & social layer (built, not yet released)
- "Clubhouse" — a cross-sport container that groups a user's football/F1/tennis competitions in one place
- Group chat, direct messages, an inbox/notifications surface
- An **AI-generated daily league newspaper** ("The FrontRow") with headline/hot-take/transfer-rumour sections, emoji reactions, and reader comments
- A scaffolded **cross-sport meta-standing** (a unified "who's winning across all sports" leaderboard) — the ledger table and query exist; see §10 for the gap

### 3.5 Coin economy & payments (built, not yet switched on)
- A virtual coin wallet with an audited transaction ledger and escrow
- Stripe purchase path for coin packs (per-tenant key model — a buyer plugs in their own Stripe account)
- Peer-to-peer challenge betting (stake coins on a fantasy outcome, auto-resolved, rake burned)
- **One-way value flow by design: there is no cash-out path** — coins never convert back to money (a deliberate legal simplification)

### 3.6 Cross-cutting
- Onboarding wizard, settings/profile, commissioner admin panel
- Mobile-first responsive UX across all screens; native iOS/Android shells wrapped and ready

---

## 4. The core systems (what makes it hard to build)

The value is concentrated in a handful of server-side systems that took significant domain iteration:

| System | What it does | Why it matters to a valuation |
|--------|--------------|-------------------------------|
| **Live scoring engine** | Converts real-world match stats into fantasy points per position; handles captains, auto-subs, per-round rules; idempotent and re-runnable | The hardest and most differentiated component; encodes years-equivalent of sport-specific rule tuning |
| **Squad & transfer engine** | Server-side **atomic** transfers enforcing budget, club caps, formation, and windows | Money/points integrity; concurrency-safe |
| **Draft system** | Lottery and reverse-standings drafts, wishlists, knockout keeps | Non-trivial allocation logic |
| **Trading, auctions & bets** | P2P trades, two-phase auctions, commissioner prediction bets | Multiple competition monetisation/engagement loops |
| **Coin wallet** | Escrowed virtual currency, Stripe top-ups, audited ledger, no cash-out | The monetisation primitive; legally clean |
| **AI newspaper** | Daily LLM-generated league front page | Distinctive engagement/retention hook |
| **Multi-sport modules** | F1 + Tennis, each with their own picks and scoring | The headline strategic differentiator — most competitors are single-sport |

**The live data pipeline** (sync → ingest → score → settle) runs on scheduled jobs, is idempotent (safe to re-run), and has overlapping schedules so a missed run is caught by the next, plus game-state recovery snapshots.

---

## 5. Technology stack (technical)

| Layer | Technology |
|-------|------------|
| **Frontend** | React 19, Vite 8 (Rolldown bundler), Tailwind CSS 4, React Router 7 — ~27 screens, all lazy-loaded |
| **Mobile** | Capacitor 8 — single web codebase wrapped as native iOS & Android |
| **Backend** | Supabase — PostgreSQL, Auth, Deno Edge Functions, Realtime (WebSocket), pg_cron scheduler |
| **Server logic** | PostgreSQL `SECURITY DEFINER` functions (RPCs) + Deno/TypeScript Edge Functions (19 deployable) |
| **Data feeds** | Forza (football), OpenF1 (Formula 1), RapidAPI (tennis) — behind a provider-adapter abstraction |
| **AI** | Groq (`llama-3.1`) for the generated league newspaper |
| **Payments** | Stripe (virtual coin packs) |
| **Hosting / CI** | Vercel (frontend, auto-deploy) · GitHub Actions (security → lint → build → E2E smoke) |
| **Local dev** | Multi-stage Dockerfile + docker-compose (frontend + Postgres + Deno runner) |

---

## 6. Architecture (technical, one paragraph)

A single-page React client (also wrapped natively for mobile) talks directly to **Supabase** for data, auth, and real-time channels. **All money- and points-sensitive logic runs server-side** in PostgreSQL `SECURITY DEFINER` functions and Deno Edge Functions, with **Row-Level Security** isolating each user's data and protected-column triggers preventing clients from writing balances or rosters directly. **Scheduled jobs** drive the live pipeline: sync fixtures/players from the sports APIs, ingest live match events, and run the idempotent scoring engine. A **provider-adapter seam** abstracts the three data feeds behind a canonical model. The frontend auto-deploys to Vercel; Edge Functions deploy manually behind a CI drift-detection gate.

---

## 7. Scale & footprint (technical)

| Metric | Value |
|--------|-------|
| Frontend code | ~41,000 lines (React/JSX) |
| Edge Functions | 21 (19 deployable; Deno/TypeScript) |
| Database migrations | 243 SQL files (game logic + schema evolution) |
| Screens / routes | ~27 (football, F1, tennis, Clubhouse, social, admin) |
| Sport modules | 3 (Football, F1, Tennis) |
| Largest components | SquadScreen ~2,200 lines · LeagueScreen ~1,900 · CommissionerPanel ~1,800 |
| Current users | ~50 (football pilot) |
| Recurring revenue | £0 (monetisation built but not switched on) |

---

## 8. Security & data posture (technical)

- **Authentication/authorisation:** Supabase Auth; Row-Level Security on user data; server-verified admin flag (clients cannot self-promote); HMAC-verified service-role auth on privileged functions.
- **Money integrity:** all coin/points movement goes through `SECURITY DEFINER` RPCs; clients cannot write balances or rosters directly; Stripe webhook uses constant-time signature verification and idempotent credit; coin ledger has **no cash-out transaction type**.
- **Data protection:** a field-level data-classification inventory exists ([DATA_CLASSIFICATION.md](DATA_CLASSIFICATION.md)); a GDPR "delete my data" routine is written; third-party data flows are documented (see §11 for the open item on the AI provider).
- **App security:** strong Content-Security-Policy and security headers; 0 known npm dependency vulnerabilities; a CI security gate (dependency audit, circular-import check, encoding scan, function-drift check).

---

## 9. Engineering practices (technical)

- **Source control & process:** GitHub, feature-branch + pull-request workflow, protected main branch. A two-branch model separates the live football pilot from the multi-sport development branch.
- **CI:** GitHub Actions runs security → lint → build → a Playwright UI smoke test on every PR.
- **Portability:** containerized local dev; a provider-adapter registry so a new data feed is a single adapter file (a stub for an alternative football provider is included to show where a buyer's own feed plugs in).
- **Documentation:** an unusually thorough in-repo knowledge base for an asset this size — architecture docs, API references, deployment runbooks, scoring-rule specs, and a central live tracker of all open work.

---

## 10. Honest state map — what is and isn't finished

**A valuation is only as good as the candour behind it. This is the real state.**

### ✅ Production-grade / done
- Core security hardening complete (verified service-role auth, gated scoring functions, immutable admin flag, hardened Stripe path, no-cash-out ledger, protected-column triggers).
- Idempotent live-scoring pipeline with auto-subs, captain reassignment, settled-round guards, and recovery snapshots.
- CI security gate; 0 dependency vulnerabilities; lazy-loaded screens; pinned Node; containerized local dev; strong CSP/headers.
- Three sport modules (Football live; F1 + Tennis built and routed) and the Clubhouse social layer.
- Provider-adapter seam (canonical model + registry).

### ◐ Half-built / scaffolded (works, with a known gap)
- **Provider independence:** the shared client + canonical types exist, but sync functions still parse raw provider JSON inline and the database still keys on the football provider's IDs; a full rename to a provider-neutral key is designed but not built.
- **Cross-sport meta-standing:** the ledger table and query exist, but no scoring path writes to it yet — so the unified cross-sport leaderboard is empty today.
- **Observability:** error-tracking (Sentry) is wired in code but not switched on in production (the DSN secrets are not set), and there is no failed-job alerting yet.
- **Large components:** a handful of screen files exceed ~1,400 lines mixing data, logic, and UI (improved from worse, but a maintainability item).

### ☐ Open / not started (the buyer's likely discount drivers)
- **Reproducible schema baseline:** 243 hand-applied migrations with some duplicate numbering and data-fixes interleaved with schema changes; there is no single `schema.sql`, so a clean environment cannot be rebuilt purely from the repo. **This is the single most material remaining engineering item.**
- **Automated test coverage of money/game logic:** essentially none in CI (only a UI render smoke); a test harness skeleton exists but activates only once the schema baseline lands.
- **Operational disaster recovery:** single environment, no point-in-time recovery, manual backups, no staging gate.
- **Ownership-transfer hygiene:** a data-feed licence transferability confirmation is outstanding; an ownership-transfer runbook is not yet written.

*The complete, itemised backlog with effort estimates lives in [TECHNICAL_DUE_DILIGENCE.md](TECHNICAL_DUE_DILIGENCE.md).*

---

## 11. Valuation inputs & open diligence questions

### 11.1 What we can provide on request (to support your estimate)
- **Build history** — full git history and a dated development tracker showing the sequence and effort of the multi-sport build-out.
- **Cost basis** — the platform was built primarily with AI-assisted development; we can characterise the actual elapsed time and cost if a cost-to-recreate method is useful to you.
- **Live pipeline evidence** — the football pilot is running; scoring, standings, and the data pipeline can be demonstrated live.
- **Integration terms** — the external data feeds are Forza (football), OpenF1, and RapidAPI (tennis); Stripe for payments; Groq for the AI newspaper. Commercial terms and transferability can be shared.
- **Full technical DD pack** — [TECH_DOCUMENTATION.md](TECH_DOCUMENTATION.md), [TECHNICAL_DUE_DILIGENCE.md](TECHNICAL_DUE_DILIGENCE.md), and an acquirer-lens buyout assessment.

### 11.2 Open questions a buyer's diligence would raise (so you can weight them)
- **Data-feed transferability** — do the Forza / OpenF1 / RapidAPI commercial terms transfer on acquisition? (An unresolved feed dependency is a material cap on value; the provider-adapter seam mitigates but does not remove it.)
- **Backend portability** — the runtime is built on Supabase primitives. For a buyer who must run on their own cloud, the realistic re-platforming cost is a genuine input.
- **Regulatory posture of the coin economy** — the no-cash-out design keeps it a virtual-goods model rather than gambling, but the responsible-play / jurisdiction question is open before any real-money launch.
- **AI-provider data handling** — the newspaper feature sends league and chat-excerpt data to a third-party LLM; a data-processing review is flagged before handling real user PII at scale.
- **Demand proof** — the pilot is small and pre-revenue; there is no retention or monetisation curve yet.

### 11.3 What is deliberately NOT in this document
- **No asking price, target range, or floor.** We want your estimate to be independent. Our own internal valuation reasoning is kept separate and is not shared with valuers or buyers.

---

*Prepared for independent valuation, 2026-07-01. Factual claims are drawn from the current `v2` codebase and the project's technical due-diligence pack. For engineering depth, read [TECH_DOCUMENTATION.md](TECH_DOCUMENTATION.md); for the itemised remediation backlog, read [TECHNICAL_DUE_DILIGENCE.md](TECHNICAL_DUE_DILIGENCE.md).*
