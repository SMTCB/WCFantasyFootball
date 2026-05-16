# 12-Month Operating Roadmap — Q2 2026 → Q1 2027

**Date:** 2026-05-16
**Owner:** Founder
**Companion to:** `STRATEGIC_PRODUCT_ROADMAP_ASSESSMENT.md`
**Status:** First draft for review

> This document translates Phase 1 (EPL Mastery) and the very start of Phase 2 (Champions League launch) into a quarter-by-quarter operating plan with features, metrics, hiring, infrastructure, BD activity, risks, and dependencies. Each quarter ends with explicit gate criteria.

---

## Year-at-a-glance

| | **Q2 2026** (May–Jul) | **Q3 2026** (Aug–Oct) | **Q4 2026** (Nov 2026–Jan 2027) | **Q1 2027** (Feb–Apr) |
|---|---|---|---|---|
| **Theme** | Foundation polish + store launch | EPL season launch + premium MVP | Retention infrastructure + UCL beta | UCL knockouts + La Liga + first WL pilot |
| **MAU target** | 5K → 10K | 10K → 25K | 25K → 50K | 50K → 100K |
| **MRR target** | £0 | £1K | £8K | £20K |
| **Headcount** | 1 founder + contractor | 1 founder + 1 FTE | 2 FTE + 1 designer (contract) | 3 FTE + BD lead |
| **Capital** | Founder-funded | Founder-funded | Angel round £200–300K | Seed round prep |
| **Key risk** | App store rejection | Premium take-rate <2% | Multi-tenant regressions | First white-label slips |

---

## Q2 2026 (May – July 2026) — "Foundation"

### Theme

Ship what's already built to where users can actually use it. **Mobile apps must reach the stores by 15 July 2026** — the EPL 2026/27 season starts mid-August and missing it is a year lost.

### Features

| # | Feature | Status | Owner | Notes |
|---|---|---|---|---|
| F-Q2-1 | iOS App Store submission | Not started | Founder | TestFlight first, then public |
| F-Q2-2 | Google Play submission | Not started | Founder | Internal track → open beta → public |
| F-Q2-3 | Trade system between managers | In BACKLOG | Claude | Existing backlog item, mid-effort |
| F-Q2-4 | Cup competition mode (knockout within a league) | In BACKLOG | Claude | Existing backlog item, high-effort |
| F-Q2-5 | Refer-a-friend mechanic | Not started | Claude | Required for organic growth in Q3 |
| F-Q2-6 | Push notification scaffolding (Capacitor + Supabase) | Not started | Claude | Needed before season launch |
| F-Q2-7 | Onboarding polish (≤90s from install to first squad) | Partial | Claude | Time-to-value is the lever for store ratings |
| F-Q2-8 | Bug-bash of all 178 E2E flows on real iOS + Android | Not started | Founder + QA contractor | Final pre-store pass |

### Metrics targets

| Metric | Start of Q2 | End of Q2 | How measured |
|---|---|---|---|
| MAU (web + mobile) | 5K (est.) | 10K | Posthog or Mixpanel |
| Day-7 retention | unknown | ≥40% | Cohort dashboard |
| Day-30 retention | unknown | ≥25% (early baseline) | Cohort dashboard |
| App Store rating | n/a | ≥4.3 with ≥50 reviews each platform | App Store Connect / Play Console |
| p95 page load | ~2.5s (est.) | ≤2.2s | Vercel analytics |
| Lighthouse Performance | unknown | ≥85 mobile | Manual run |

### Infrastructure

- **Observability**: install Sentry (errors) + PostHog or Mixpanel (product analytics) — both free tier acceptable at this scale.
- **CI/CD**: extend GitHub Actions to also run Lighthouse against deploy previews.
- **Backups**: confirm Supabase nightly backups enabled and tested (one restore drill).
- **Forza API**: monitor rate limit headroom during pre-season friendlies; document current usage curve.

### Team

- **Founder full-time on product + ops.**
- **1 mobile QA contractor** (3 weeks, target hire date 1 June 2026) for store submission bug-bash.
- No engineering FTE yet — keep burn low until premium tier validates revenue path.

### Business development

- **Compile target list** of 15 broadcasters / leagues for Phase 2 white-label conversations: BT Sport (TNT Sports), Sky Sports, DAZN, beIN, Premier Sports UK, Now Sports, FloSports, Foxtel (AU), Movistar+ (ES), DAZN Italy, Eurosport / Discovery+, ITV Sport, Sky Sport Germany, Optus Sport (AU), Channel 4 Sports. **Goal: 5 introductory calls by end of Q2.**
- **Forza contract conversation**: open commercial dialogue. Goal: term sheet by end of Q3.
- **Premium pricing research**: 5 user interviews on willingness-to-pay before Q3.

### Risks (Q2-specific)

| Risk | Mitigation |
|---|---|
| App store rejection (most common: privacy manifest, in-app-purchase compliance) | Use Capacitor docs checklist; budget 2 weeks for review iterations |
| Forza API instability during pre-season | Already added timeouts + retry (Phase 1 critical fixes); add provider-side status page monitoring |
| Burnout — founder is the only engineer | Cut F-Q2-3 or F-Q2-4 if behind by mid-June |

### Gate to Q3

- ✅ iOS + Android apps live in stores
- ✅ Day-30 retention ≥25% measured on a real cohort
- ✅ ≥10K MAU
- ✅ At least 1 broadcaster has expressed interest in WL conversation
- ✅ Forza contract negotiations active

If 3 of 5 pass → proceed. If only 1–2 pass → defer EPL season launch features, fix retention root cause first.

---

## Q3 2026 (August – October 2026) — "EPL Season Launch + Premium MVP"

### Theme

The Premier League 2026/27 season starts ~15 August 2026. **This is the year's growth moment.** Everything in Q3 is about converting that traffic into engaged users and validating that some of them will pay.

### Features

| # | Feature | Notes |
|---|---|---|
| F-Q3-1 | Premium subscription tier (Stripe integration, single tier £3.99/mo with £29.99/year intro) | Single feature toggle: ad-free, advanced stats, captain insights |
| F-Q3-2 | Advanced stats package (expected points, ownership %, transfer-in/out trends) | Differentiator vs FPL Official |
| F-Q3-3 | Captain-pick recommender (data-driven suggestion, premium-gated) | Engagement hook for premium |
| F-Q3-4 | Push notifications live: transfer deadline (T-12h, T-2h), gameweek live updates, league chat mention | Retention lever |
| F-Q3-5 | Refer-a-friend live: share link, +5% budget bonus for both parties on first squad | Viral lever |
| F-Q3-6 | League-wide chat: typing indicators, mentions, search (already shipped — confirm stable at 10× current load) | Pre-existing; load-test |
| F-Q3-7 | Editorial / content layer MVP: weekly preview article on home screen | Engagement / SEO |
| F-Q3-8 | Auto-pick / "set my squad" for casual users | Reduces churn from inactive managers |

### Metrics targets

| Metric | Target |
|---|---|
| MAU | 25K |
| New users acquired (Q3) | 18K (~600/day average, peaked around season start) |
| Day-30 retention | ≥35% |
| Premium take-rate (of MAU) | 1.5% |
| MRR | £1K |
| Push notification opt-in rate | ≥65% |
| Refer-a-friend referrals per active user | ≥0.3 per month |
| App store rating | maintain ≥4.4 with ≥250 reviews |

### Infrastructure

- **Supabase**: move to Pro+ tier if needed (£25 → £100/mo). Validate connection pool size for chat realtime under load.
- **Stripe**: production account set up by mid-July, tested in Q2.
- **CDN**: Vercel default, plus image CDN for player avatars if hot path.
- **Backup data provider POC**: technical spike with Opta or Sportradar API to confirm we *could* swap in 30 days if Forza disappears. Not a switch, just a contingency proof.

### Team

- **First full-time engineer** (full-stack, React + Postgres + a bit of mobile). Target start date: 1 August 2026 — ideally onboarded before peak launch. Compensation band: £55–75K + small equity.
- Continue founder full-time.
- **Optional**: part-time content writer for editorial layer, 1 article / week. £200–300 per article.

### Business development

- **5 broadcaster intro calls completed.** Goal: 2 NDA-signed exploratory conversations.
- **Forza contract**: term sheet signed by end of Q3.
- **Affiliate exploratory**: meetings with Sky Bet, William Hill, bet365, DraftKings affiliate desks. Goal: understand CPA / rev-share terms; not yet active.
- **Press**: arrange 2–3 EPL-season-launch press hits (FourFourTwo, The Athletic, Reddit r/FantasyPL AMA).

### Capital

- **Decision point at end of Q3**: ready to do angel raise of £200–300K to fund Phase 2 build (multi-comp + early white-label foundations)? Recommend: yes, *if* MRR ≥£1K and Day-30 ≥35%.

### Risks (Q3-specific)

| Risk | Mitigation |
|---|---|
| **Premium take-rate <1% after 30 days of launch** | Concierge sales: founder personally onboards top 50 users; test £1 first-month pricing |
| **EPL season launch surge breaks infra** | Pre-load test 5× peak Q2 traffic; Supabase + Vercel both proven to ~50K concurrent at this tier |
| **FPL Official rolls out a competing feature in Aug 2026** | Faster cadence; bet on UX + chat — FPL cannot ship these in 90 days |
| **First engineer hire takes longer than expected** | Start sourcing in early June; have backup contractor option |

### Gate to Q4

- ✅ MRR ≥£1K (≥250 paying users)
- ✅ MAU ≥25K
- ✅ Day-30 retention ≥35% on August launch cohort
- ✅ First engineer onboarded and shipping features
- ✅ 2+ broadcasters in active NDA conversation
- ✅ Forza contract signed

If gate fails on premium revenue: stay in Phase 1, do not start UCL build in Q4. Re-pricing test and product-fit iteration first.

---

## Q4 2026 (November 2026 – January 2027) — "Retention Infrastructure + UCL Beta"

### Theme

This is the **least flashy but most strategically important quarter.** Lock in retention with deep features, prepare for Phase 2 with multi-tenant DB work, and run a private beta of Champions League fantasy with engaged users so the Q1 public launch is de-risked.

### Features

| # | Feature | Notes |
|---|---|---|
| F-Q4-1 | UCL knockouts fantasy (private beta with ~500 users) | Round of 16 starts Feb 2027 — must work before public launch |
| F-Q4-2 | Cross-competition leagues prep (DB schema, scoring normalisation rules drafted) | Required for Phase 2 differentiator |
| F-Q4-3 | League season-end recap / "Year in Review" generator | Massive retention lever; share-worthy |
| F-Q4-4 | Predictive transfer recommender (ML model from match-event history) | Premium-gated stat |
| F-Q4-5 | Mid-season cup competition launch | Mobilises dormant users |
| F-Q4-6 | Multi-tenant DB schema work (tenant_id on every table) | Foundation for white-label, no user-visible change |
| F-Q4-7 | Admin tools for scoring rules editor (we have the schema; need the UI) | Enables white-label customisation later |
| F-Q4-8 | Native widgets (iOS Home Screen, Android home widget): current GW points | Daily-active driver |

### Metrics targets

| Metric | Target |
|---|---|
| MAU | 50K |
| Day-30 retention | ≥40% |
| Premium take-rate | 2.5% |
| MRR | £8K |
| % users invited to UCL beta who accept | ≥30% |
| Mid-season cup participation | ≥15% of MAU |

### Infrastructure

- **Multi-tenant schema migration**: largest infra project of the quarter. Phased: add columns (no-op), backfill, dual-write, cut over. **Zero downtime requirement.**
- **SOC 2 Type 1 prep**: select an auditor (Drata or Vanta common); start evidence collection. Cost: £8–15K for Type 1.
- **CI**: parallelise Playwright suite (currently 178 tests, ~15–20 min) — target ≤10 min CI.
- **Monitoring**: alerting on key flows (login, squad save, transfer, chat send) with PagerDuty or simpler Slack webhook.

### Team

- **Second engineer hire** (target start: 15 November 2026). Focus: backend/DevOps. Compensation: £60–80K.
- **Contract designer** (1 day/week, 3 months): UI design for admin panel + Q1 UCL launch screens.
- **Founder shifts focus**: 50% BD / 50% product. **First time founder is not the bottleneck on engineering.**

### Business development

- **First white-label LOI signed** (non-binding, scope-of-work for pilot). Target: a tier-2 UK or DACH broadcaster. £25–50K pilot fee acceptable for first deal.
- **Affiliate contracts signed**: Sky Bet + at least one other operator. Start serving affiliate widget in Q1.
- **EPL Players' Association data licensing exploratory**: image rights for player photos, NIL-style. £10–25K/year if needed.
- **Investor meetings**: 10 UK / EU consumer-tech seed investors. Goal: term sheet by end of Q1 2027.

### Capital

- **Angel round closes** by end of October at latest (£200–300K). Use of funds: 2 FTE engineers, marketing budget, white-label pilot delivery.
- **Seed round prep** (deck refresh, financial model update with real Q3/Q4 numbers).

### Risks (Q4-specific)

| Risk | Mitigation |
|---|---|
| **Multi-tenant migration breaks production** | Feature-flagged rollout; staging environment with copy of production data; rollback plan rehearsed |
| **UCL beta exposes broken cross-competition scoring** | Beta = exactly 500 users, opt-in, with founder-led support; expect to learn here |
| **Second engineer slow to onboard** | 2-week pairing schedule; ship single small feature in week 1 to validate fit |
| **Holiday distraction (Dec/Jan)** | Plan deliberate slow weeks 50–52; resume hard push from week 1 |
| **First LOI delays** | Have 3 active broadcaster conversations in parallel; never depend on a single deal |

### Gate to Q1 2027

- ✅ MAU ≥50K
- ✅ MRR ≥£8K
- ✅ Day-30 retention ≥40%
- ✅ Multi-tenant migration in production with zero data corruption
- ✅ UCL beta running with active participants and bug list ≤10 critical issues
- ✅ At least 1 white-label LOI signed
- ✅ Angel round closed; ≥9 months runway

If gate fails on any single metric: re-plan Q1, do not launch UCL publicly until stable.

---

## Q1 2027 (February – April 2027) — "Phase 2 Launch"

### Theme

**Public launch of Champions League knockout fantasy**, alongside the actual UCL Round of 16 (Feb 2027). **La Liga fantasy goes into public beta in March**, timed with the title run-in. **First white-label customer signed and pilot launched.** This is when Forza becomes "a football platform" publicly.

### Features

| # | Feature | Notes |
|---|---|---|
| F-Q1-1 | UCL fantasy public launch | Tied to Feb 2027 Round of 16 |
| F-Q1-2 | La Liga fantasy public beta | Mid-March |
| F-Q1-3 | Cross-competition leagues (EPL + UCL + La Liga in one league) | THE differentiator. No incumbent offers this. |
| F-Q1-4 | Federated auth / SSO support (for white-label tenants) | Required for first pilot deployment |
| F-Q1-5 | Configurable scoring rules admin UI | Enables tenant-specific rules |
| F-Q1-6 | First white-label production deployment | Tenant: TBD by then. Pilot terms. |
| F-Q1-7 | Affiliate widget live (Sky Bet + one other) | First non-subscription revenue stream live |
| F-Q1-8 | Manager-of-the-month / week competitions across competitions | Drives engagement |

### Metrics targets

| Metric | Target |
|---|---|
| MAU (consumer) | 100K |
| MAU (white-label tenant added) | +20K depending on tenant size |
| Day-30 retention (consumer) | ≥45% |
| Premium take-rate | 3.0% |
| MRR (consumer) | £18K |
| MRR / ARR (B2B pilot) | £8–15K MRR (£100K+ annualised) |
| Total MRR | ≥£25K |
| Number of competitions live | 3 (EPL + UCL + La Liga) |
| White-label customers in production | 1 (pilot) |

### Infrastructure

- **Multi-tenant production**: 2 tenants live (Forza consumer + first white-label customer).
- **Tenant isolation testing**: monthly penetration test to validate RLS prevents cross-tenant data access.
- **SOC 2 Type 1 report**: target completion by end of Q1 2027.
- **API rate limit policy**: published rate limits per tenant; throttling per tier.

### Team

- **Third engineer** (target start: 15 January 2027). Specialisation: front-end / mobile.
- **BD Lead hire** (target start: 1 February 2027). Compensation: £55–75K + commission on signed deals (10% Y1 ACV).
- **Founder shifts focus**: 70% BD + investor relations, 30% product strategy.

### Business development

- **Second white-label LOI** in active negotiation by end of March.
- **Seed round target close**: end of Q1 (£500K–£1.5M). Use of funds: BD scaling, paid marketing experiments, third white-label customer landing.
- **Affiliate Y1 revenue tracking**: aiming for £5–10K MRR via affiliate by end of Q1.
- **Press**: La Liga launch coverage in Spanish football media (Marca, AS, El Confidencial Tech section).

### Risks (Q1-specific)

| Risk | Mitigation |
|---|---|
| **Cross-competition scoring inconsistency confuses users** | Detailed onboarding screen; clear "how scoring works" docs; in-app help articles |
| **First white-label customer delays go-live** | Hard contract milestones; weekly call; pilot fee tied to delivery dates |
| **La Liga launch lands without enough Spanish-football user volume** | Pre-launch SEO; partner with Spanish football podcasts; consider Spanish-language UI in beta |
| **Seed round market is bad (e.g., wider tech downturn)** | Bridge from angels; cut spend; extend runway by 6 months |

### Gate to Phase 2 (Q2 2027 onward)

This is the **Phase 1 → Phase 2 hard gate**:

- ✅ Total MAU ≥100K
- ✅ Total MRR ≥£25K
- ✅ Day-30 retention ≥40% across all competitions blended
- ✅ ≥3 competitions stable in production
- ✅ ≥1 white-label customer in production with NRR data >100%
- ✅ Seed round closed OR clear path to one within 60 days

If gate passes: commit to full Phase 2 (Bundesliga, more WL customers, scaling team). If gate fails: extend Phase 1 by 1 quarter and re-test.

---

## Cross-quarter operational themes

### Hiring sequence (recap)

| Hire | Quarter | Role | Comp band | Why now |
|---|---|---|---|---|
| Mobile QA contractor (3 weeks) | Q2 2026 | Store-submission bug-bash | £100/day | One-off |
| Full-stack engineer #1 | Q3 2026 | Build velocity | £55–75K | Before EPL season peak |
| Full-stack engineer #2 | Q4 2026 | Multi-tenant + UCL | £60–80K | Phase 2 prep |
| Contract designer | Q4 2026 | Admin UI + UCL screens | £400/day, 1 day/week | Visual quality for B2B pitches |
| BD Lead | Q1 2027 | Sales pipeline | £55–75K + 10% comm. | White-label scaling |
| Front-end / mobile engineer | Q1 2027 | UCL + La Liga frontend | £55–75K | Multi-competition velocity |

Total Q1 2027 headcount: **4 FTE + 1 contractor + founder**. Burn rate at peak Q1: ~£35K / month opex (loaded). Revenue at gate: £25K MRR → ~£300K ARR. **Burn-vs-revenue is tight; seed round is critical to extending runway through Q2-Q3 2027.**

### Capital plan (recap)

| Quarter | Source | Amount | Purpose |
|---|---|---|---|
| Q2 2026 | Founder savings | £0 raised | Bootstrap through store launch |
| Q3 2026 | Founder + minor angels (TBD) | Up to £100K | Cover hire #1 + premium tier launch costs |
| Q4 2026 | **Angel round closes** | £200–300K | Hires #2, marketing, WL pilot |
| Q1 2027 | **Seed round closes** | £500K–£1.5M | BD team, paid acquisition, multi-WL |
| **Cumulative through Q1 2027** | | **£700K–£1.9M** | |

### Critical path

```
Forza contract → premium tier → EPL season launch →
   ↓                                       ↓
Multi-tenant schema → angel round → UCL beta →
   ↓                                       ↓
First WL pilot deploy → UCL public launch → seed round →
   ↓
Phase 2 gate (Q2 2027)
```

**Single-point-of-failure dependencies:**

1. **iOS / Android store approval by 15 July 2026** — slipping past EPL season is the single biggest schedule risk.
2. **Forza contract signed by end of Q3 2026** — without a contract we have undefined supplier risk and cannot pitch white-label customers credibly.
3. **First white-label LOI by end of Q4 2026** — without this, Phase 2 framing has no proof point for seed investors.
4. **Angel round closes by Halloween 2026** — without it, we cannot make the 2nd engineering hire and Phase 2 slips by 6 months.

### Decision log (commitments made by this roadmap)

1. ✅ Phase 1 = EPL only, no second sport until Q1 2027 UCL launch.
2. ✅ "Football platform" public positioning, not "multi-sport platform."
3. ✅ Premium tier launches at £3.99/mo, single tier.
4. ✅ Mobile apps in stores by 15 July 2026 — hard deadline.
5. ✅ Multi-tenant DB work happens Q4 2026 — *not* deferred to Phase 2 proper.
6. ✅ First white-label customer is a *pilot* (small fee, big learning) — not a flagship logo deal.
7. ✅ No India entry. No NFL. No college sports in this 12-month window.
8. ✅ Founder + 4 FTE by end of Q1 2027. Not more.

---

**End of 12-month roadmap.**

Re-review this document at the end of each quarter. Re-plan, don't rigidly execute. The numbers will be wrong; the structure is what matters.
