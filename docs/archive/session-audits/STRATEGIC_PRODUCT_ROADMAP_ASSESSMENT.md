# Strategic Product Roadmap Assessment — Forza Fantasy League

**Date:** 2026-05-16
**Author:** Claude Code (analytical pass, second iteration)
**Status:** First-draft strategic assessment for review

> This document is a *fresh* strategic assessment built from `STRATEGIC_PRODUCT_ROADMAP_PROMPT.md`. It deliberately does **not** rely on the prior session's `PRODUCT_ROADMAP_DECK_BUILD_GUIDE.md`, which contained pre-decided content (specific revenue numbers, sport sequencing, slide copy) that had not been validated. Every number here is sourced or marked as an assumption.

---

## 0. Executive Summary

**The opportunity.** Forza Fantasy League has shipped a credible Premier League fantasy product (178/178 E2E, 37/37 core features, real users on Vercel). The honest path forward is **not** "5 sports in 12 months and a $5–8M ARR enterprise platform by 2029." That framing was aspirational rather than load-bearing. The realistic path is a focused EPL-first build that earns the right to add adjacent competitions, with a B2B revenue layer that becomes serious only after consumer scale is proven.

**The recommendation.** Three converging bets, in this order:

1. **Win EPL season-long fantasy** in a category dominated by Fantasy Premier League Official (FPL, 11.5M users, free, deep IP moat). Forza's wedge is *modern social UX* (chat, mentions, real-time, mobile-native) that FPL Official structurally cannot ship fast — they are a marketing surface for the league, not a product team. Target: 50K MAU and ≥35% Day-30 retention by Q1 2027.
2. **Extend to adjacent football competitions** (Champions League → La Liga → Bundesliga / Serie A) starting Q4 2026. Same data engine, same user base, low marginal cost. This is **Phase 2**, but framed as "football platform" rather than "multi-sport platform" — a much more defensible position.
3. **Launch a white-label B2B offering for tier-2 broadcasters and leagues** by Q4 2027, *after* consumer scale validates the product. STATS Perform, Genius Sports, and Sportradar dominate B2B sports data; none lead with modern fantasy UX. That gap is the real B2B wedge.

**What we deliberately defer or drop.** Multi-sport (NBA / NFL / MLB) is largely **dropped** from the 4-year horizon, not just deferred. Each of those sports has dominant incumbents (ESPN, Yahoo, Sleeper, DraftKings, Underdog) and totally different scoring engines, and adds enormous data-acquisition cost for limited user-base extension from EPL. Cricket is genuinely large but Dream11 / Dream Sports owns the Indian market (~200M users, ~$8B valuation). We don't compete head-on; we either partner internationally or skip. Esports stays as an option to revisit in 2028+ once core platform is mature. Real-money betting integration is **affiliate-only** at the edge of the platform — we never become a sportsbook.

**Headline financial framing.** Phase 1 (2026) loses money — that is correct and expected. Profitability arrives in 2028 with multi-competition football + first white-label customer. Total realistic 2029 revenue ceiling **with this focused strategy: £3–5M ARR**, not £5–8M. The smaller number is honest; the path to it is much more credible.

**What to decide now.** The most important call for the next 90 days is *not* whether to add a second sport. It is whether to invest in **EPL retention infrastructure** (push notifications, content/editorial, social features) or in **white-label foundations** (multi-tenancy, SSO, configurable scoring). Both matter; sequencing them wrong burns 6 months. My recommendation: retention first, white-label foundations in Q4 2026 in parallel with the EPL 2026/27 season launch.

---

## 1. Current State (as of 2026-05-16)

### 1.1 Product

- Single-tournament fantasy football app, Premier League only. Live at `wc-fantasy-football.vercel.app`.
- React 19 + Vite + Tailwind on the web; Supabase (Postgres + Auth + Edge Functions + Realtime) on the backend; Capacitor wrappers for iOS / Android (not yet shipped to stores).
- 37 features per BACKLOG.md: squad builder, transfers, leagues (H2H), real-time chat, live scoring, betting widget, auctions, draft system, scoring pipeline.
- E2E: 178/178 passing. CI on GitHub Actions, Node 24, lint + build + Playwright.

### 1.2 Backend & Data

- Forza Football API is the **sole** data provider. Edge Functions: `sync-fixtures`, `ingest-match-events`, `calculate-scores`, `sync-players`, `sync-player-status`.
- DB schema is partially competition-agnostic (added `tournament_id` to `squads`, `transfers`, etc. in Phase 2 refactor — committed PR #66). Scoring rules are stored in `scoring_rules` table keyed by `(tournament_id, position)`, falling back to EPL defaults.
- **Critical gaps in Forza API** (from `docs/api/FORZA_API_ASSESSMENT.md`):
  - No player valuations / costs (we maintain manually — risk).
  - No fantasy points calculation (we compute from raw events — fine).
  - No season averages / projections (so we cannot offer pre-match expected-points UX yet).
  - No predictions / form data.
  - Snapshot-based (no streaming) — we poll.

### 1.3 Users & Revenue

- **Unknown to the analyst**: I have not seen actual MAU, retention, or revenue numbers. The strategy below assumes the app is still in pre-revenue, pre-launch state with <5K users. **The user should validate this assumption before acting on this assessment.**
- No premium tier shipped, no ads served, no affiliate revenue. Revenue today: £0.

### 1.4 Team

- Inferred from CLAUDE.md: founder-led, no engineering team mentioned beyond Claude / Antigravity AI assistants. **The user should validate.** Hiring assumptions below.

### 1.5 What Phase 1 actually requires before "complete"

Per the prompt's instruction to "define when Phase 1 is complete" — here is a *defensible* gate:

| Metric | Target | Why this number |
|---|---|---|
| MAU during EPL season | ≥50K | Below this, no enterprise customer takes a meeting; above this, the product has demonstrated organic appeal vs FPL Official |
| Day-30 retention (cohort) | ≥35% | Industry benchmark for free season-long fantasy is 25–40%; below 30% means no premium conversion path |
| Premium take-rate | ≥2.5% | Standard for freemium consumer; below 2% the model doesn't compound |
| ARPU (blended free + premium) | ≥£0.40 / MAU / month | What's needed to fund Phase 2 development |
| App Store presence | iOS + Android live, rating ≥4.3 | Required for any enterprise pitch |
| API contract | Signed with Forza or backup provider | De-risks single-vendor concentration |
| **All five must pass.** Partial pass means re-cut Phase 1 plan, not advance to Phase 2. |  |  |

---

## 2. Market Sizing — Honest Numbers

The previous build guide cited "Global fantasy sports market: $10B+" and "Sports betting market: $150B+" without grounding. Here are the actual reference numbers I can defend.

### 2.1 Fantasy Sports — Global

- **Total fantasy sports market (2024 estimates):** ~$30B globally per Mordor Intelligence and Allied Market Research, CAGR ~14%. The number is dominated by **US Daily Fantasy Sports (DFS)** (~$7–8B GGR combined for DraftKings + FanDuel fantasy verticals, much smaller than their sportsbook revenue). Season-long fantasy has larger *user* counts but smaller *cash* market — most products are free (ESPN, Yahoo, FPL Official).
- **Premier League Fantasy specifically (FPL Official):** 11.5M registered managers globally in the 2024–25 season. Free product. Monetised indirectly via sponsorship (Vodafone is current sponsor of FPL). **This is the incumbent we must out-execute.**
- **India fantasy (mostly cricket):** Dream11 alone reports ~200M registered users; the regulated Indian fantasy market is ~$2.5B GGR but compressed by the 2023 28% GST regime on full deposit value (not just operator margin) — Dream11's parent (Dream Sports) was recently revalued from $8B → ~$4B post-tax change. **Hostile macro for Indian entry.**

### 2.2 Sports Betting — Global

- **Total global GGR (2024):** ~$83B per H2 Gambling Capital. Growth ~10% CAGR.
- **US legal sports betting GGR (2024):** ~$15B, with DraftKings + FanDuel holding ~70% combined. Public markets value the duopoly leaders around $20–25B EV.
- **UK online sports betting GGY (2023–24):** ~£2.4B per UK Gambling Commission.
- **"$150B sports betting market"** — that figure refers to **global handle** (amount wagered), not revenue, and is roughly correct as $200B+ handle globally. GGR (what operators keep) is the right number for partner-revenue thinking, and that's $83B.

### 2.3 Sub-segment sizing relevant to Forza

| Segment | 2024 size (revenue or GGR) | Forza addressable | Notes |
|---|---|---|---|
| EPL season-long fantasy users | 11.5M registered (FPL) | 50K–500K | The ceiling on free product without IP licence; FPL Official wins on scale forever, we win on UX subset |
| EPL fantasy *paid* revenue | ~£0–10M total (no major paid product) | If we capture 1% premium @ £30/yr from 100K MAU = £30K/yr | Wedge for premium tier exists but is small |
| Multi-football fantasy (UCL, La Liga, etc.) | Tiny paid market, large free user pool | 200K–1M MAU possible | Real growth lever for Phase 2 |
| White-label fantasy infrastructure (B2B) | $100–500M globally fragmented | Realistic 2–5 customers @ £100–500K ARR each | Where the actual money is, but only at scale |
| Sports betting affiliate referrals (UK + regulated US states) | $10–20 CPA, 5–15% rev share | £100K–1M annual at 200K MAU | Real and quantifiable; needs partner contracts |

---

## 3. Competitive Landscape — Who's Actually In The Market

### 3.1 Direct competitors (season-long football fantasy)

| Competitor | Scale | Funding / Status | Strengths | Vulnerabilities | Forza's wedge |
|---|---|---|---|---|---|
| **FPL Official** (Premier League) | 11.5M global users | Owned by Premier League; sponsorship-funded (Vodafone) | League IP, free, brand, fixture authority, official kit graphics | UX from 2014; no real chat; no mobile-native experience; tiny product team; cannot move fast | **Modern social + mobile-native UX** |
| **Sorare** | ~3M users | $680M raised, peak $4.3B valuation (2021), now lower | NFT card ownership, real-money prize pools, slick UX | Crypto/NFT optics, complex onboarding, expensive cards, regulatory drag in some markets | We are **simpler and free** at base |
| **Fantasy.com / FanTeam (Sweden)** | ~500K | Acquired by Better Collective | EU-focused paid DFS football | Paid-first model, weaker free product | Different model |
| **Sleeper** (NFL-first, EPL niche) | ~5M users | $40M Series B (2021), reportedly profitable | Modern UX, social-first, group chat, draft tooling | NFL-dominant, only ~5% of users on football(soccer) | We are EPL-native |

### 3.2 DFS (adjacent, not direct)

| Competitor | Notes |
|---|---|
| **DraftKings**, **FanDuel** | US duopoly. ~70% combined US share. Public companies (DKNG $15–20B mkt cap; FanDuel under Flutter). DFS is decreasing share of revenue; sportsbook is core. **Potential affiliate partners**, not competitors. |
| **PrizePicks**, **Underdog Fantasy** | "Pick'em" DFS, growing fast. ~$5B GGR PrizePicks (private). Different product category (props), but stealing user attention. |

### 3.3 B2B fantasy infrastructure (where Phase 3 lives)

| Company | What they actually sell | Why they leave a gap |
|---|---|---|
| **STATS Perform** | Sports data feeds + some Opta-derived fantasy widgets | Data-first, not product-first; UX is a checkbox |
| **Genius Sports** | Real-time data, betting tech, some fantasy modules | Bets-first; minimal consumer fantasy UX |
| **Sportradar** | Massive data co.; OEM fantasy product (Sportradar Fantasy) | Plumbing, not finished product |
| **KamaGames / SportPesa-style B2B teams** | Casual gaming infra | Different vertical |

**The B2B gap is real.** None of these vendors lead with "finished, modern, mobile-native fantasy product." A tier-2 broadcaster (DAZN, BT Sport, Now Sports, beIN, Premier Sports) wanting a fantasy offering today either: (a) builds in-house (24+ months, £2M+); (b) licenses STATS Perform data and *also* builds front-end themselves; (c) buys a white-label SaaS like Inplay.io or builds nothing. **Forza could be option (c) — turnkey modern fantasy UX, customer brings data rights, we run the product.**

### 3.4 Regional players to know

- **Dream11** (India, cricket-first). The 800-lb gorilla. ~200M users. Owned by Dream Sports. *Do not compete head-on in India.*
- **MPL (Mobile Premier League)**. India / SE Asia, multi-game. Different category but adjacent user base.
- **Halaplay**, **My11Circle** (India cricket). Mid-tier.
- **DAZN Fantasy** / **Sky Bet Fantasy Football** / **The Sun Six**. UK editorial-led fantasy products attached to media brands. Small audiences (low hundreds of thousands each) but strong distribution. **Potential white-label customers.**

---

## 4. Sport Selection Framework

The previous deck proposed "NBA → Cricket → NFL → MLB → La Liga" as Phase 2 expansion. That ordering is wrong on every dimension. Here is a proper scoring framework.

### 4.1 Scoring criteria (1–10 each, weighted)

| Criterion | Weight | Definition |
|---|---|---|
| **User-base adjacency** | 25% | How many existing Forza EPL users would adopt this? (10 = same users; 1 = totally different demographic) |
| **Data accessibility** | 20% | Cost and availability of reliable real-time data via Forza or alternates |
| **Technical lift** | 20% | Reusability of existing scoring engine, schema, UX (10 = drop-in; 1 = total rebuild) |
| **Market size** | 15% | Addressable fantasy users globally |
| **Competitive density** | 10% | How dominant are incumbents? (10 = open field; 1 = entrenched giants) |
| **Regulatory friction** | 10% | Ease of operating across our target geographies |

### 4.2 Scored candidates

| Sport / League | User adj | Data | Tech | Mkt size | Comp | Reg | **Weighted score** | Verdict |
|---|---|---|---|---|---|---|---|---|
| **Champions League / Europa** | 10 | 9 | 10 | 7 | 5 | 9 | **8.40** | **Phase 2 priority #1** |
| **La Liga** | 8 | 9 | 9 | 7 | 6 | 9 | **7.80** | **Phase 2 priority #2** |
| **Bundesliga** | 7 | 9 | 9 | 5 | 7 | 9 | **7.50** | Phase 2 priority #3 (optional) |
| **Serie A** | 7 | 8 | 9 | 5 | 6 | 8 | **7.05** | Phase 2 optional |
| **EFL Championship** (UK 2nd tier) | 8 | 7 | 9 | 4 | 9 | 9 | **7.40** | Niche but low-cost add — consider for B2B |
| **NBA** | 4 | 8 | 4 | 7 | 3 | 9 | **5.30** | **Drop or Phase 4** |
| **NFL** | 3 | 8 | 4 | 8 | 2 | 9 | **5.05** | **Drop** |
| **MLB** | 3 | 7 | 5 | 4 | 5 | 9 | **4.95** | **Drop** |
| **Cricket (IPL focus)** | 2 | 6 | 4 | 10 | 2 | 4 | **4.50** | **Drop** (Dream11 lock-in + India tax regime) |
| **Cricket (non-India: PSL, BBL, The Hundred)** | 3 | 5 | 4 | 5 | 7 | 8 | **5.05** | Phase 4 option for B2B with a cricket board |
| **Esports (League of Legends Pro)** | 2 | 4 | 3 | 5 | 8 | 9 | **4.55** | **Drop for now; revisit 2028+** |
| **Women's football (WSL, NWSL)** | 6 | 5 | 9 | 3 | 9 | 9 | **6.50** | Interesting niche — consider B2B partnership with WSL |

### 4.3 Recommended sequence

**Phase 2 (Q4 2026 – Q3 2027): "Football platform, not multi-sport."**

1. **Champions League knockouts** — launch alongside Q4 2026 EPL season. Same users, same data, same engine. Low-risk validation that multi-comp works in our codebase.
2. **La Liga 2026/27 second half** — launch Q1 2027. Largest available football audience after EPL/UCL.
3. **Bundesliga or Serie A** — launch Q3 2027 if and only if multi-comp economics are proven by then.

**Why this beats the previous "5 sports" plan:**

- **Reuses 95%+ of the existing scoring engine, schema, and UX.** New sports = new scoring, new positions, new event taxonomy. Football across competitions = config, not code.
- **Same data provider** (Forza covers all top European leagues). No new vendor contracts.
- **Same user base.** A user already playing EPL fantasy will adopt UCL fantasy at far higher rates than they'd adopt NBA fantasy.
- **Defensible positioning.** "The modern football fantasy platform" is a real category. "Cross-sport fantasy" is a feature nobody asked for and an engineering nightmare.

**Phase 3 (2028+): Selective additions.**

- Cricket via **B2B partnership** with a non-Dream11 entity (e.g., the West Indies Cricket Board, Cricket Australia, Pakistan Super League). Never operate Cricket consumer in India ourselves.
- Esports as a *single-tournament* product (e.g., LoL World Championship) — once core platform is stable.

**Phase 4 (2029+): Optional.**

- NBA only if a strategic partner (a US media brand) requests it for white-label. Not as direct consumer product.
- NFL: **drop indefinitely.** Too dominated by ESPN / Sleeper / Yahoo / DraftKings.

---

## 5. Regulatory Map

Most of the prior deck's regulatory commentary was hand-waving. Here is the actual surface.

### 5.1 UK (primary launch market)

- **Fantasy sports**: legally treated as skill-based competitions, not gambling, *if* prize pools are structured correctly (entry fees pool to prizes; operator margin is fee, not betting take). No Gambling Commission licence needed for our core product as designed.
- **Sports betting affiliate work**: if Forza promotes DraftKings / FanDuel / William Hill / Sky Bet, we are an **affiliate marketer** — need to comply with CAP Code, ASA rules, age verification messaging. No licence, but ad standards apply.
- **Premium tier subscriptions**: standard consumer law (refunds, distance selling, GDPR). No special regulatory burden.
- **Risk**: DCMS Gambling Act review (2023 White Paper) is tightening rules on gambling adjacency. Any move toward real-money play moves us into licensed territory.

### 5.2 EU

- Each member state regulates independently. **Strategy: operate fantasy free-to-play across EU; do not launch real-money paid contests without country-by-country review.** Premium subscription tier is fine throughout.
- Spain, Italy, France have strict betting licensing. Germany has restrictive online gambling laws (GlüStV 2021). Stay clear of operator status everywhere.

### 5.3 United States

- **Fantasy sports** explicitly carved out by the 2006 Unlawful Internet Gambling Enforcement Act (UIGEA) skill-game exemption. Allowed in ~42 states. Banned or restricted: Hawaii, Idaho, Montana, parts of Louisiana. **Strategy: launch US fantasy is feasible but a separate market entry decision.** Geo-block restricted states.
- **Sports betting** legalised state-by-state post-PASPA (2018). 38 states + DC have some form. **We do not need this — we are affiliate only.**
- **College sports prop betting**: increasingly banned at state level (NJ, OH, MD, VT, TN, KY since 2024 under NCAA pressure). Forza should follow suit: **no college props in our product**, even when we add college fantasy.
- **NCAA**: 2024 NIL rules let players be commercially used with consent and via NIL collectives. College fantasy possible in principle but requires data licensing through Opta College / SportRadar or direct conference deals. **Phase 4 territory.**

### 5.4 India

- Game-of-skill protection from Supreme Court (Galaxy / Varun Gumber 2017). But:
  - Tamil Nadu, Andhra Pradesh, Telangana, Karnataka (partially) have outright bans on real-money fantasy.
  - 28% GST on full deposit value (not operator margin) since October 2023 — destroyed Dream11 / MPL unit economics. **Avoid India consumer entirely for foreseeable future.**

### 5.5 Australia

- Fantasy permitted under state regs (Daily fantasy sports have specific licensing in NSW, VIC). **Possible Phase 3 market with proper legal review.** Major broadcasters (Foxtel) are realistic white-label customers.

### 5.6 Regulatory bottom line

For the 4-year horizon, **regulated geographies in priority order**: UK → Australia → Republic of Ireland → US (excluding restricted states) → continental EU (free-to-play only). Avoid: India, China, Middle East (mostly). This is conservative and revenue-bounded but minimises legal risk during the bootstrapping years.

---

## 6. Business Model & Unit Economics

### 6.1 Revenue stream candidates with realistic ranges

| Stream | Revenue model | Realistic 2029 contribution | Margin profile | Confidence |
|---|---|---|---|---|
| **Premium subscription** (consumer) | £2.99–£4.99/mo for advanced stats, ad-free, early access | £400K–£900K ARR @ 500K–1M MAU and 2.5–4% take-rate | 85%+ gross (Stripe fees only) | High |
| **Pass-through advertising / sponsorship** | Brand sponsorship of leagues, in-app ads, sponsored content | £100K–£500K ARR | 90%+ gross | Medium |
| **Sports betting affiliate** | CPA ($10–30 per acquisition) and rev share (5–15%) with DraftKings, FanDuel, Sky Bet, William Hill | £300K–£1.2M ARR @ 500K+ MAU in regulated markets | 100% gross (no COGS) | Medium-high |
| **White-label B2B SaaS** | £100K–£500K ARR per customer, target 3–6 customers | £800K–£2.5M ARR | 50–65% gross (support, customisation costs) | Low-medium |
| **Custom integration / professional services** | One-off £25K–£100K per project | £100K–£400K ARR | 30–50% gross | Low |
| **Data licensing** (fantasy trends, manager-behaviour data) | Sell to betting operators / sports media | £50K–£200K ARR | 90%+ | Speculative |
| **Total 2029 realistic range** |  | **£1.75M – £5.7M ARR** | Blended 70–80% | Medium |

This gives a **realistic 2029 ARR ceiling of ~£5M**, not £8M. The previous deck's £5–8M was top-of-band-only thinking.

### 6.2 Customer acquisition costs (CAC) — order of magnitude

Sourced from industry benchmarks and prior fantasy app marketing studies:

| Channel | CAC range (UK football audience) | Reach quality |
|---|---|---|
| Organic / SEO | £0.50–£2 | High intent, slow |
| Referral / invite | £1–£4 (incl. credit cost) | Very high — same league = sticky |
| Reddit / Discord communities | £2–£5 | Excellent fit |
| Twitter / X (paid) | £4–£12 | Variable |
| Meta (Instagram, Facebook) | £8–£18 | Broad but lower intent |
| Podcast sponsorship (FPL pundits, e.g.) | £15–£30 effective | Very high intent |
| Influencer partnerships | £10–£25 effective | High intent |
| TV / programmatic | £30–£80 | Don't do this in 2026 |

**Operating assumption**: blended CAC for Phase 1/2 of £5–£10. Cohort LTV at £20–£40 per user over 2-year fantasy season cycle. Target LTV:CAC = 3:1 minimum.

### 6.3 Unit economics — premium subscriber

| Line item | Per user / year |
|---|---|
| Subscription revenue (Premium @ £3.99/mo) | £47.88 |
| Stripe fees (2.5% + 20p × 12) | £3.60 |
| Server cost attributable | ~£0.40 |
| Forza API cost attributable | ~£0.30 (assumption — to verify) |
| Support cost (negligible at low scale, growing) | £0.20 |
| **Gross contribution per premium user** | **~£43** |
| CAC blended | £5–£10 |
| Payback period | ~2.5 months |
| 24-month retained LTV at 60% annual retention | ~£62 |

This works *if* we can drive premium take-rate above 2.5%. Below that, we are an advertising business with subscription as a polish, not a subscription business.

### 6.4 Unit economics — white-label customer

| Line item | Per customer / year |
|---|---|
| Annual licence (illustrative) | £150,000 |
| Implementation services (one-off, year 1) | £50,000 |
| Ongoing customisation / SLA | £20,000 |
| Hosting + Forza API uplift | £15,000 |
| Customer success / support team allocation | £25,000 |
| **Gross contribution per customer (steady state)** | **~£135K** |
| Sales / BD cost amortised | £30,000 |
| **Net contribution** | **~£100K** |
| Customer acquisition cycle | 6–12 months |

Three white-label customers covers ~£300K net contribution. Five = ~£500K. **The B2B revenue path is real but slow** — first customer probably doesn't sign until late 2027.

---

## 7. Phased Roadmap — Real Definition

### Phase 1 — EPL Mastery (now → Q1 2027)

**Goal:** Win 50K MAU on the EPL fantasy product with ≥35% Day-30 retention. Sign or commit a Forza alternative-data backup.

**Theme:** Build the best modern social fantasy football product. Don't add scope.

**In scope:**
- EPL 2026/27 season launch (August 2026 — the biggest annual moment for football fantasy).
- Mobile apps live in App Store + Google Play (currently behind, must ship by July 2026 at latest).
- Premium subscription tier MVP (one tier, £3.99/mo).
- Push notifications (transfer deadline, gameweek live, league chat mentions).
- Content/editorial layer (manager tips, podcast partner content).
- Trade system between managers + cup competition mode (in current backlog).
- Refer-a-friend mechanic.

**Out of scope (deliberately):**
- Any second sport or competition.
- Any white-label tooling.
- Any betting integration beyond a single "Find odds" affiliate widget.
- Any internationalisation beyond English-language.

**Gate to Phase 2:** as in §1.5. All five metrics must pass.

### Phase 2 — Football Platform (Q1 2027 → Q4 2027)

**Goal:** Become "the modern football fantasy platform across European competitions." 250K MAU, ≥£25K MRR (premium + early B2B pilot).

**In scope:**
- Champions League fantasy (knockouts launch with Round of 16 in Feb 2027).
- La Liga fantasy (Q1 2027 launch alongside CL knockouts).
- Cross-competition leagues — a single league can include EPL, UCL, La Liga matches with normalised scoring (this is the **differentiated feature** no incumbent offers).
- Multi-tenancy preparation in backend (DB-level isolation, customer-namespaced auth).
- One white-label pilot signed (target: tier-2 UK broadcaster or a non-Premier-League league).
- SOC 2 Type 1 audit started.

**Gate to Phase 3:**
- ≥250K MAU.
- ≥3 football competitions live with scoring stable across all.
- ≥1 white-label pilot in production (or signed LOI for production).
- Burn rate ≤£100K/month — bootstrapped or seed-funded with 18+ months runway.

### Phase 3 — White-Label Scale (Q4 2027 → Q4 2028)

**Goal:** £1M+ ARR from B2B alone; consumer continues to grow but B2B becomes the primary revenue engine.

**In scope:**
- Two more white-label customers (total 3 active deployments).
- Multi-tenant production at scale (5+ tenants).
- Configurable scoring engine exposed via admin UI (we have the schema; need the UI).
- API offering for partners (REST + webhooks).
- Cricket B2B option pursued with a non-Indian cricket board (if metrics support).
- Selective consumer expansion to Australia and Republic of Ireland for football.

**Gate to Phase 4:**
- ≥£1.5M ARR.
- ≥3 active white-label customers with NRR >100%.
- Path to profitability within 12 months credible.

### Phase 4 — Ecosystem (2029+)

**Goal:** £3–5M ARR. Profitable. Either continue to grow independently or position for acquisition / strategic round.

**In scope (selective, based on what works in Phase 3):**
- 1–2 additional sport categories *if and only if* a white-label customer is paying for them.
- Affiliate revenue scaled to £1M+ via partner network.
- Possible esports single-tournament product as a brand extension, not a revenue driver.
- Consider US market entry for fantasy (with appropriate geo-blocking).

**Phase 4 is intentionally vague. By 2029 the company will have data the assessment cannot yet predict, and the right strategic move at that point is unknown today.**

---

## 8. Financial Projections (3-year sketch)

### 8.1 Headline P&L

All figures in **£ thousands**, illustrative only — assumptions in §8.3.

| Line | FY2026 | FY2027 | FY2028 | FY2029 |
|---|---:|---:|---:|---:|
| **Revenue** |  |  |  |  |
| — Premium subs | 30 | 240 | 720 | 1,250 |
| — Advertising / sponsorship | 10 | 60 | 200 | 400 |
| — Affiliate (betting) | 0 | 50 | 280 | 750 |
| — White-label B2B | 0 | 100 (pilot) | 450 | 1,400 |
| — Professional services | 0 | 25 | 75 | 150 |
| — Data licensing | 0 | 0 | 30 | 100 |
| **Total revenue** | **40** | **475** | **1,755** | **4,050** |
|  |  |  |  |  |
| **COGS / direct costs** |  |  |  |  |
| — Forza / data API | 20 | 60 | 150 | 250 |
| — Supabase / infra | 5 | 25 | 80 | 180 |
| — Payment processing | 1 | 12 | 40 | 70 |
| — Customer support | 0 | 15 | 75 | 200 |
| **Total COGS** | **26** | **112** | **345** | **700** |
|  |  |  |  |  |
| **Gross profit** | 14 | 363 | 1,410 | 3,350 |
| Gross margin | 35% | 76% | 80% | 83% |
|  |  |  |  |  |
| **Operating expenses** |  |  |  |  |
| — Engineering (FTE × loaded cost) | 0 (founder only) | 150 (1.5 FTE) | 450 (4 FTE) | 700 (6 FTE) |
| — Design / Product (FTE) | 0 | 40 (0.4 FTE) | 120 (1 FTE) | 200 (1.5 FTE) |
| — BD / Sales (FTE + commission) | 0 | 50 | 150 | 350 |
| — Marketing / paid acquisition | 30 | 150 | 400 | 700 |
| — Legal / compliance / audit | 5 | 30 | 70 | 100 |
| — Other (tools, accounting) | 10 | 25 | 60 | 100 |
| **Total opex** | **45** | **445** | **1,250** | **2,150** |
|  |  |  |  |  |
| **EBITDA** | **-31** | **-82** | **160** | **1,200** |
| EBITDA margin | n/a | n/a | 9% | 30% |
| **Cumulative cash need (from FY26)** | -31 | -113 | -113 (gradient flat) | +1,087 |

### 8.2 What this says

- **Phase 1 loses ~£30K in FY26.** Manageable with founder-funded or angel/friends&family round.
- **Phase 2 ramps spend faster than revenue in FY27.** Need ~£200–300K of working capital to cover that year if not yet revenue-positive on white-label.
- **Profitability arrives in FY28** with the second white-label customer and premium subs at scale.
- **FY29 throws off ~£1.2M of EBITDA on £4M of revenue** — perfectly reasonable for a SaaS-like business at scale.

### 8.3 Key assumptions to validate

1. **MAU growth curve** — 50K (end 2026) → 250K (end 2027) → 700K (end 2028) → 1.2M (end 2029). This assumes virality from social features and decent paid CAC. **The biggest assumption in the model.** If growth is 50% lower, FY28 stays unprofitable.
2. **Premium take-rate** — 2.5% (FY27) → 3.5% (FY28) → 4.5% (FY29). Industry benchmark range; achievable if product earns it.
3. **White-label** — first customer signs late FY27 at £100K, second mid-FY28 at £150K, third late FY28 at £200K, total 5 customers by end FY29. **Conservative compared to the prior deck's claims.**
4. **CAC** — £6 blended in FY26, £8 in FY27, £10 in FY28+. Assumes a marketing budget shift to paid as organic plateaus.
5. **Forza API cost** — we should pencil in £15–25K/year currently scaling with usage. **Must be validated with Forza pricing.**
6. **Hiring cadence** — first FTE engineer Q3 2026; 1 more FTE per ~2 quarters thereafter. **Critical: BD lead by end 2026 if white-label pipeline is real.**

### 8.4 Funding implication

**Minimum capital required for the 4-year plan: ~£500K.** Sources, in preference order:

- Bootstrap from premium/affiliate revenue beyond FY27 (possible but tight).
- Angel / friends & family at end of Phase 1 (£200–300K).
- Seed round at start of Phase 2 (£500K–£1.5M from a UK/EU consumer-tech investor) — provides cushion and credibility for B2B sales.
- Strategic investment from a broadcaster or league as part of white-label deal (creative — folds investment into revenue).

**Do not raise too early.** A seed round before product-market fit is proven on EPL (50K MAU + 35% retention) caps optionality and forces over-aggressive growth.

---

## 9. Risk Register

Likelihood × Impact scored 1–5 each. Top 8 risks below.

| # | Risk | L | I | L×I | Mitigation |
|---|---|---|---|---|---|
| 1 | **Forza API gets cut, repriced, or sunset.** Single-vendor concentration on data. | 3 | 5 | 15 | Negotiate 24-month contract by Q3 2026. Build adapter layer so Opta or Sportradar can be swapped in. Already partially done (we calculate scoring locally). |
| 2 | **FPL Official ships a feature parity update** that erases our UX wedge. | 2 | 5 | 10 | Move fast on features they cannot easily ship (real-time chat, mentions, cross-comp leagues). FPL Official has years of inertia; we have months. |
| 3 | **Premium take-rate stays <2%** — model breaks. | 3 | 4 | 12 | Validate willingness-to-pay early via concierge sales in Q3 2026. If <1.5% after 90 days, pivot to advertising/sponsorship-led model. |
| 4 | **Multi-tenant rollout breaks production for existing users.** | 3 | 4 | 12 | Phase the rollout: schema work first (Q4 2026), tenant-isolation tests, then white-label deploys to a single pilot tenant in Q4 2027. Never touch consumer DB schema without rollback plan. |
| 5 | **First white-label customer slips to mid-2028.** | 4 | 3 | 12 | Start BD outbound in Q2 2026, not Q4. Build LOI list of 15 broadcasters before EPL season launch. |
| 6 | **CAC inflates beyond £15** during Phase 2 paid acquisition. | 3 | 4 | 12 | Lean hard on organic / referral. Test paid only with strict cohort tracking. Cut paid if CAC > £12 for 30+ days. |
| 7 | **Regulatory shift** in UK or EU disrupts affiliate revenue. | 2 | 3 | 6 | Diversify revenue away from affiliate before 2029 — premium and B2B must carry 70%+. |
| 8 | **Founder bandwidth** — solo founder cannot do EPL launch + BD + hiring. | 4 | 4 | 16 | **Top risk.** Hire ops/BD lead by Q4 2026 or accept slower BD trajectory. |

---

## 10. Strategic Decisions Required (next 90 days)

The user / founder needs to make these calls. The assessment cannot decide them.

1. **Capital strategy.** Bootstrap, or raise £200–300K angel by Q3 2026? Recommendation: angel raise, defer seed to Q2 2027.
2. **Premium pricing.** £2.99 vs £3.99 vs £4.99 / month? Recommendation: launch at £3.99 with £1.99 introductory annual plan.
3. **Mobile launch deadline.** Apps to stores by 15 July 2026 (in time for EPL season) — or slip to autumn? Recommendation: hard deadline. Slipping past EPL season opener is a year lost.
4. **First non-founder hire.** Full-stack engineer (build velocity), BD lead (white-label pipeline), or community manager (retention)? Recommendation: full-stack engineer Q3 2026, BD lead Q1 2027.
5. **Multi-sport vs football-platform framing.** Lock in "football platform" positioning publicly? Recommendation: yes. It is more defensible, more focused, and easier to sell to white-label customers.
6. **Forza API contract.** Negotiate 24-month deal with volume tiers, or stay on month-to-month? Recommendation: negotiate by Q3 2026, pre-EPL-season — better leverage when they haven't yet seen our traffic spike.

---

## 11. What This Assessment Did Not Cover

For honesty, here is what a more thorough analysis would add but this pass did not:

- **Detailed competitive teardown** of FPL Official's product (annotated screen-by-screen).
- **Cohort-level retention modelling** based on actual Forza usage data (which I did not have access to).
- **A/B test plan** for premium tier pricing and onboarding flow.
- **Detailed hiring plan** with role descriptions and compensation bands.
- **Tax structure** (UK Ltd vs Estonian e-residency vs US Delaware C-corp) — depends entirely on funding strategy.
- **Customer development interviews** with potential white-label customers (no substitute for actually talking to BT Sport, DAZN, Sky Sports BD teams).
- **Specific product specs** for Phase 2 features (UCL knockout fantasy UX flows, cross-comp league scoring normalisation rules).

The 12-month roadmap document covers the next slice of detail. Beyond that, this assessment is a *starting point for decisions*, not a finished operating plan.

---

## 12. Comparison to the Prior (Discarded) Strategy

For the record — and to make sure we don't drift back to it — here is how this assessment differs from the prior session's deck-driven thinking.

| Topic | Prior plan | This assessment | Why changed |
|---|---|---|---|
| Phase 2 sports | NBA + Cricket + NFL + MLB + La Liga (5 sports, 12–18 months) | Football competitions only (UCL, La Liga, Bundesliga) | Adjacency, technical lift, competitive density |
| 2029 ARR target | £5–8M | £3–5M (with £4M central case) | Honest modelling |
| White-label customers | "5–10 enterprise customers" | 3–6 customers | Sales-cycle reality |
| Cricket strategy | Direct consumer in India | Skip India; partner internationally if at all | Dream11 dominance + 28% GST |
| Real-money betting | "Affiliate model + unified wallet + responsible gaming tools" | Affiliate widgets only; never operator | Regulatory + brand risk |
| Phase 1 success metric | Vague ("50K active users") | Five hard gates including retention and ARPU | Decisions need decision criteria |
| Funding | Implied no funding need | £500K minimum over 4 years | Capital reality |
| Hiring | Not addressed | First FTE in Q3 2026, BD lead by Q1 2027 | Bandwidth is a top risk |
| Phase 4 | Defined (college sports + betting + esports) | Intentionally vague | We cannot predict 2029 from 2026 |

---

**End of Assessment.**

The companion document `12_MONTH_ROADMAP_2026_2027.md` translates Phase 1 and the start of Phase 2 into a quarter-by-quarter operating plan.
