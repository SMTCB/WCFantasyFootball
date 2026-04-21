# ForzaKit — Product Development & Evolution Pipeline
**Operating Document | April 2026 – December 2027**
**Owner:** VP of Product | Status: Living Document — update after each sprint review

---

## Table of Contents

1. [Development Phases & Sprint Plan (7 Weeks to Launch)](#1-development-phases--sprint-plan)
2. [Release Strategy](#2-release-strategy)
3. [During-Tournament Operations Plan](#3-during-tournament-operations-plan)
4. [Post-Tournament Product Evolution (July–December 2026)](#4-post-tournament-product-evolution)
5. [Long-Term Product Vision (2027 and Beyond)](#5-long-term-product-vision)
6. [Team & Process Recommendations](#6-team--process-recommendations)
7. [Success Metrics by Phase](#7-success-metrics-by-phase)

---

## 1. Development Phases & Sprint Plan

### Overview

| Sprint | Dates | Theme |
|--------|-------|-------|
| Sprint 1 | Apr 21 – May 4 | Data Infrastructure & Backend Hardening |
| Sprint 2 | May 5 – May 18 | Real Data Integration & Auth |
| Sprint 3 | May 19 – Jun 1 | Beta Polish, Load Testing & Feature Flags |
| Sprint 4 | Jun 2 – Jun 8 | Launch Readiness & Go-Live |

There is no "slack sprint." Every week of this runway is load-bearing. Features that are not P0 or P1 get cut without debate.

---

### Sprint 1 — Apr 21 – May 4
**Goal:** Replace every mock data source with live Supabase tables and establish the real-time scoring pipeline.

#### P0 — Must Complete
- [ ] **Supabase schema finalized:** `players`, `fixtures`, `squads`, `matchday_scores`, `top_scorer_predictions`, `leagues`, `league_members`, `chat_messages`, `chips_used` tables with RLS policies locked down
- [ ] **Player & fixture seeder:** Ingest all 48 WC2026 squads (736 players) and the full 64-fixture schedule into Supabase via a one-time seed script; store in `players` and `fixtures` tables
- [ ] **Scoring engine (Edge Function):** `calculate-scores` Edge Function that reads player events (goals, assists, clean sheets, cards) and writes to `matchday_scores`; unit-tested with fixture data
- [x] **Supabase Auth built (2026-04-21):** Full email + password auth system complete (AuthContext, useAuth hook, ProtectedRoute, AuthScreen). Intentionally inactive — gated behind `VITE_AUTH_ENABLED=false` for the showcase period. All screens already use `useAuth()` hook; zero hardcoded UUIDs remain. Activate by setting `VITE_AUTH_ENABLED=true` in Vercel env vars — no code changes or redeploy needed.
- [ ] **Real-time subscription baseline:** Supabase Realtime channel subscribed to `matchday_scores` inserts; Live screen updates without page refresh

#### P1 — Target Complete
- [ ] Squad screen reads live `squads` table (not mock); `PlayerCard` status dots fed from real `players.status` field
- [ ] `DangerZone` / injury alerts fed from a manually-curated `player_alerts` table (no external API dependency yet — ops team updates manually pre-match)
- [ ] Transfer cost logic reads from live `fixtures` (locks when fixture kickoff passes)
- [ ] Bracket Challenge reads from `fixtures` table (phase, date, teams)

#### Cut If Behind
- Captain Roulette mode (entertaining but zero retention impact pre-launch)
- League Analytics sparklines (nice-to-have; ships post-launch)
- VAR "Under Review" animation (visual polish only; defer to Sprint 3)

#### Definition of Done
- All P0 items merged to `main`, deployed to Vercel Preview
- `calculate-scores` Edge Function passes 100% of existing E2E test suite against live Supabase (not mocks)
- A real user account can create a team, join a league, and see live scores with zero hardcoded data

#### Key Risks
- **External data dependency:** WC2026 squad data may not be finalized until May. Mitigation: seed with confirmed qualification rosters + placeholder names; update incrementally.
- **RLS complexity:** Row-Level Security bugs are silent — a user could see another league's data. Mitigation: dedicate half a day to RLS audit before Sprint 1 closes.
- **Edge Function cold starts:** Supabase Edge Functions on the free/pro tier can have 2–3 s cold starts. Mitigation: implement a ping cron to keep functions warm during tournament hours.

---

### Sprint 2 — May 5 – May 18
**Goal:** Ship a working closed beta with real auth, real leagues, and a real scoring run-through using simulated match events.

#### P0 — Must Complete
- [ ] **Player data pipeline:** Automated or semi-automated ingestion of injury/lineup news into `player_alerts`; define the ops playbook (who updates, how often, what tool)
- [ ] **League invite flow:** Share link generates a unique code, recipient lands on join page, is prompted to sign up if not authed — full funnel working end-to-end
- [ ] **Transfer deadline enforcement:** Transfers locked at exact fixture kickoff time server-side (not just client-side); confirmed via E2E test
- [ ] **Chips logic server-validated:** Wildcard, Triple Captain activation stored in `chips_used`; server rejects double-activation attempts
- [ ] **Gazette card generation:** `RecapCard` (matchday recap shareable image) reads from real `matchday_scores`; `html2canvas` export working on iOS Safari and Android Chrome
- [ ] **Full scoring simulation:** Run a simulated Matchday 1 (seed fake events, trigger Edge Function, verify scores update in real-time on Live screen) — this is the demo that de-risks launch

#### P1 — Target Complete
- [ ] H2H records calculated from `matchday_scores` (not mock)
- [ ] Chat messages scoped to league via RLS; message history loads on join
- [ ] Top Scorer Prediction locks at first match of the day; result state (correct/wrong) shown post-match
- [ ] Push notification infrastructure spike: evaluate Supabase → web push (service worker) vs. email for match alerts; decision documented
- [ ] Waitlist page live at forzakit.com with email capture (Supabase `waitlist` table + Resend email confirmation)

#### Cut If Behind
- Push notifications (spike only; full implementation moves to Sprint 3 if spike is clean, or drops entirely)
- League Analytics Dashboard (defer to post-launch)
- VAR handling animations

#### Definition of Done
- 10 internal testers have created accounts, built squads, joined a shared beta league, and completed the scoring simulation without a single data-integrity issue
- Waitlist page live and collecting emails
- Zero P0 bugs open at sprint end

#### Key Risks
- **iOS Safari html2canvas:** Canvas-to-image export is notoriously broken on iOS due to CORS and cross-origin resource restrictions. Mitigation: test on real device on Day 1 of sprint, not Day 14.
- **Supabase Realtime fan-out at scale:** With 100+ concurrent users in peak Group Stage matchdays, Realtime connections may hit plan limits. Mitigation: check Supabase Pro plan connection limits; implement polling fallback if connections exceed 200.
- **Invite funnel friction:** Magic link auth adds a second redirect. Mitigation: A/B test magic link vs. OTP code in beta.

---

### Sprint 3 — May 19 – Jun 1
**Goal:** Closed beta with 50–200 real users, performance hardened, feature flags in place, and the app ready to be handed to a journalist on June 5.

#### P0 — Must Complete
- [ ] **Closed beta launched:** 50–200 invite-only users via waitlist; WhatsApp invite group active
- [ ] **Load test:** Simulate 500 concurrent users against production Supabase (k6 or Artillery); identify and fix any query bottlenecks; add DB indexes where needed
- [ ] **Feature flag system:** Implement a lightweight feature flag table in Supabase (`feature_flags: key, enabled, rollout_pct`); all in-development features gated behind flags; no deploy required to toggle
- [ ] **Error tracking:** Sentry (or equivalent) wired to production; every uncaught exception creates a Slack/Discord alert
- [ ] **Mobile performance audit:** Lighthouse score >= 85 on mobile; FCP < 2.5 s on 4G; no layout shift on Live screen during score updates
- [ ] **Onboarding flow:** New user sees a 3-step onboarding (create team → invite friend → join/create league) before landing on Home; skip allowed
- [ ] **Data ops playbook finalized:** Written runbook for: how to update player injuries, how to input match events, how to trigger score recalculation, who is on call during matches

#### P1 — Target Complete
- [ ] Web push notifications for: score update (your player scored), match starting in 15 min, rank change alert
- [ ] VAR "Under Review" state in Live feed
- [ ] League Analytics sparklines (cumulative points chart)
- [ ] SEO meta tags + Open Graph for league invite links (so WhatsApp previews look good)
- [ ] Accessibility pass: keyboard navigation, focus rings, color contrast on all screens
- [ ] App install prompt (PWA `manifest.json` + `beforeinstallprompt` handling)

#### Cut If Behind
- Push notifications (drop entirely; use email fallback)
- VAR animations
- Analytics sparklines

#### Definition of Done
- 50 beta users active, at least one full simulated matchday completed with real users
- Load test passes at 500 concurrent without errors
- Feature flag system deployed; at least 3 features gated behind flags
- Zero P0 bugs; P1 bug count < 5

#### Key Risks
- **Beta user acquisition:** If waitlist is < 100 by May 19, closed beta will be thin. Mitigation: start waitlist promotion now (social posts, football communities, Reddit r/FantasyFootball, Twitter/X).
- **Score input ops bottleneck:** If match event input is manual, a developer is tied up during every match. Mitigation: Sprint 3 must produce either an automated feed or a fast internal admin UI for event entry.
- **PWA install on iOS:** iOS PWA install is a manual "Add to Home Screen" flow with no native prompt. Mitigation: add an in-app coach mark explaining the flow for iOS users.

---

### Sprint 4 — Jun 2 – Jun 8 (Launch Sprint)
**Goal:** Flip to public, execute launch playbook, survive Day 1.

#### P0 — Must Complete
- [ ] **Public launch:** Remove invite gate; forzakit.com open to all users (June 5, 72 hours before kickoff)
- [ ] **Press / influencer seeding:** 3–5 football content creators have accounts, have been briefed, and have agreed to post on June 8
- [ ] **Launch day monitoring:** Vercel Analytics, Supabase Dashboard, and Sentry all open on a dedicated screen; team in a shared Slack/Discord channel for the day
- [ ] **Rollback plan documented:** If a P0 bug hits in the first 2 hours of launch, exactly who does what; rollback to previous Vercel deployment is one command
- [ ] **Match event pipeline live:** First Group Stage fixtures (June 8) have a confirmed data source and operator assigned
- [ ] **All E2E tests green on production:** Run full 84-test suite against production URL before opening the gates

#### P1 — Target Complete
- [ ] Product Hunt launch post scheduled for June 8 (tournament Day 1)
- [ ] Reddit AMA or launch thread in r/WorldCup and r/FantasyFootball
- [ ] WhatsApp share text pre-written for every matchday recap scenario ("My team scored 87 pts — can you beat me?")
- [ ] Gazette cards auto-generated after each matchday and surfaced on Home screen

#### Cut If Behind
- Product Hunt (reschedule to June 10 if team bandwidth is zero)
- Reddit threads (automate or template)

#### Definition of Done
- App is public
- At least 100 users registered by EOD June 5
- First match (June 8, Group A opener) scored correctly within 30 minutes of final whistle
- Zero P0 incidents in first 24 hours

#### Key Risks
- **Traffic spike on June 8:** World Cup Day 1 is unpredictable. Mitigation: Vercel scales automatically; Supabase connection pooling (PgBouncer) enabled; pre-warm Edge Functions.
- **Score data SLA:** If the data feed is delayed or wrong, trust evaporates instantly. Mitigation: have a manual override path and communicate delays proactively in the app's activity feed.
- **Team exhaustion:** 7-week sprint with a 2–3 person team is punishing. Mitigation: schedule a mandatory 24-hour no-code window after launch; rotate on-call during Group Stage.

---

## 2. Release Strategy

### Soft Launch — Closed Beta (May 19 – Jun 4)

- **Access model:** Invite-only via waitlist. Users on the waitlist get a unique join link. Max 500 users in closed beta.
- **Beta cohort composition:**
  - Wave 1 (May 19): 20 internal — team, friends, family
  - Wave 2 (May 26): 80 warm contacts — football communities, newsletter subscribers
  - Wave 3 (Jun 1): 400 from waitlist — FIFO with priority for users who referred others
- **Beta feedback channel:** Dedicated Discord server or WhatsApp group; in-app "Submit Feedback" button that writes to a Supabase `feedback` table
- **Beta SLA:** We fix P0 bugs within 24 hours. P1 bugs within the sprint. We do not promise P2 fixes before launch.
- **Beta graduation criteria:** < 2 P1 bugs open, NPS from beta users >= 40, at least one simulated matchday completed cleanly

### Public Launch — June 5–7

- **Why June 5 (not June 8):** Users need 72 hours to build their squads before the first match locks. Launching on kickoff day means zero time to acquire teams. June 5 is the sweet spot.
- **Launch sequence:**
  - June 5, 09:00 UTC: Remove invite gate; send waitlist "you're in" email blast
  - June 5, 09:00 UTC: Post on Twitter/X, Instagram, LinkedIn, TikTok
  - June 5, 10:00 UTC: Reddit posts in r/WorldCup, r/soccer, r/FantasyFootball
  - June 6: Football influencer posts (pre-arranged; content pre-approved)
  - June 7: "Last chance to build your squad" push notification and email to registered users who haven't set a team
  - June 8, First kick-off: Product Hunt launch; "The tournament is live" in-app banner

- **Squad lock mechanics:**
  - Group Stage squads lock June 8 at first kick-off (15:00 UTC)
  - Users who registered but didn't pick a squad get an auto-generated squad (random 11 from their country of preference, or random if not set) — clearly labelled "Auto squad"
  - Transfer windows open between matchdays

### In-Tournament Release Cadence

**The core rule: no unreviewed code ships to production during a live match.**

- **Freeze windows:** No deploys from 30 minutes before first kick-off until 60 minutes after last final whistle of the day
- **Emergency hotfix protocol:** Any P0 bug during a live match is fixed on a branch, reviewed by a second pair of eyes (even async), and deployed via Vercel's instant rollback-safe deploy. Notify users of the fix in the in-app activity feed.
- **Planned deploy windows:** 08:00–09:00 UTC daily (before first matches) and 01:00–03:00 UTC (overnight, no live matches)
- **Release sizing during tournament:** Ship only bug fixes and content updates (player data, copy). No new features during Group Stage. Feature additions resume in knockout rounds if the team has capacity and the feature is behind a flag.
- **Version tagging:** Every production deploy tagged in git with `tournament/YYYY-MM-DD-vN`; makes rollback unambiguous

### Feature Flag Approach

Feature flags live in a `feature_flags` table in Supabase:

```
feature_flags (
  key TEXT PRIMARY KEY,
  enabled BOOLEAN DEFAULT false,
  rollout_pct INTEGER DEFAULT 0,  -- 0–100, for gradual rollout
  description TEXT,
  updated_at TIMESTAMPTZ
)
```

The React app fetches flags on auth and caches them in context. A Supabase Realtime subscription updates flags in < 1 second without a deploy.

**Flags to implement before launch:**

| Flag Key | What It Controls |
|----------|-----------------|
| `bracket_challenge_enabled` | Show/hide Bracket Challenge tab |
| `captain_roulette_enabled` | Show/hide Roulette toggle in settings |
| `push_notifications_enabled` | Enable/disable web push prompts |
| `var_feed_enabled` | Show VAR "Under Review" in Live feed |
| `analytics_dashboard_enabled` | Show Stats tab in League view |
| `gazette_sharing_enabled` | Show Gazette/recap card generation |
| `maintenance_mode` | Show full-screen maintenance banner |
| `transfer_window_open` | Global transfer window on/off override |

All flags can be toggled by any team member with Supabase Dashboard access. No code change, no deploy required.

---

## 3. During-Tournament Operations Plan

### Monitoring Strategy

**The tournament operations center is a single shared browser tab with 4 panels:**

1. **Vercel Analytics** — real-time page views, unique visitors, top pages, Core Web Vitals
2. **Supabase Dashboard** — active connections, query performance, Edge Function invocation count + error rate, Realtime subscriber count
3. **Sentry** — live error feed, grouped by issue, sorted by frequency; set alert threshold at > 5 same-error occurrences in 10 minutes
4. **Custom ops dashboard** (build this in Sprint 3): a simple internal page at `/admin` showing: match event queue, score calculation status per fixture, last score update timestamp per fixture, manual override buttons

**Alerts to configure (Sentry + Supabase + Vercel):**

| Alert | Threshold | Channel |
|-------|-----------|---------|
| Error rate spike | > 1% of requests erroring | Slack/Discord immediately |
| Edge Function error | Any 5xx from `calculate-scores` | Slack/Discord immediately |
| Realtime connections | > 80% of plan limit | Slack/Discord 15 min warning |
| DB connection pool | > 80% utilization | Slack/Discord 15 min warning |
| Score stale | No score update for a fixture > 20 min after event expected | SMS to on-call |
| User sign-up rate drop | > 50% drop from prior hour during launch days | Slack |

### Incident Response

**P0 Incident Definition:** Any condition where:
- Scores are incorrect or not updating for > 15 minutes during a live match
- Authentication is broken (users cannot log in or their session is lost)
- The app is unreachable (5xx on the root URL)
- User data is visibly wrong (wrong squad, wrong league, wrong points)

**P1 Incident Definition:**
- Feature is broken but workaround exists (e.g., share card fails but scores still update)
- Performance is degraded (load time > 8 s) but the app works

**Response SLA:**

| Severity | Acknowledge | First Update to Users | Resolution Target |
|----------|-------------|----------------------|-------------------|
| P0 | 10 minutes | 20 minutes (in-app banner + social) | 60 minutes |
| P1 | 30 minutes | None required | Next deploy window |
| P2 | Next business day | None | Next sprint |

**Incident runbook:**
1. On-call dev acknowledges in Slack: "I'm on it — [brief description]"
2. Pin a message in the user-facing Discord/activity feed: "We're aware of [issue] and working on it. Scores will be reconciled."
3. Open a Supabase branch for the fix; do not touch production DB directly
4. Fix, review, deploy in freeze-safe window (or emergency deploy if P0 during live match)
5. Post-incident: within 24 hours write a 3-bullet "what happened / what we fixed / what we're changing" post in the app's activity feed. Users respect honesty.

**On-call rotation:** Rotate weekly. One dev is primary on-call (phone on, responds within 10 min). One dev is secondary (responds within 30 min). Product/design is available for user communications. No one is on-call alone for an entire matchday — overlap shifts by 2 hours.

### Content Calendar — Matchday Operations

Each day with live matches follows this rhythm:

| Time (UTC) | Action | Owner |
|------------|--------|-------|
| T-3h | Confirm fixture lineup data in `player_alerts`; flag any late injuries | Ops |
| T-1h | Send "Match starting soon" push/email to users with players in today's fixtures | Automated |
| T-30m | Deploy freeze begins; all hands off keyboard except on-call | All |
| Kick-off | Monitor Sentry + Supabase dashboard; event input begins | On-call dev + ops |
| +15m | First score update should be live; verify on Live screen | On-call dev |
| Full-time | Trigger `calculate-scores` final run; verify all scores settled | On-call dev |
| FT+30m | Gazette cards generated and surfaced on Home screen | Automated |
| FT+45m | Social post: "Today's top scorer was X — did you pick them?" with Gazette card | Product |
| FT+2h | Deploy freeze lifted | All |
| Next morning | Matchday recap email to all league members | Automated |

**Rest days (no matches):** Use for bug fixes, planned deploys, and content — player news updates, bracket predictions, league banter prompts in the chat.

### Player & Fixture Data Update Process

**Two-tier approach:**

**Tier 1 — Automated (target by Sprint 2, fallback to manual):**
- Poll a football data API (API-Football, SportMonks, or Football-Data.org) every 5 minutes during live matches
- Edge Function `ingest-events` writes raw events to `match_events` table
- `calculate-scores` triggers on new inserts via a Postgres trigger or Edge Function cron

**Tier 2 — Manual ops (fallback and pre-match):**
- Internal admin page (`/admin/events`) allows the ops person to input: goal, assist, yellow card, red card, clean sheet, substitution per player
- Pre-match: update `player_alerts` (injury status) manually; takes ~15 minutes per matchday
- Post-match: verify automated events against a reference source (BBC Sport, Sofascore); correct any discrepancies before Gazette cards generate

**Data source decision (must be made by end of Sprint 1):**
- API-Football: ~$30/month for live data, well-documented, used by most competitors
- Football-Data.org: free tier available, limited live data
- **Recommendation:** API-Football paid tier. The $30/month cost is trivial compared to the ops cost of manual input for 64 matches.

---

## 4. Post-Tournament Product Evolution

### July 2026 — Immediately After the Final (July 15+)

The window between July 15 and September 1 is critical. Warm users who just experienced 5 weeks of your product will churn fast if there is nothing to do. The goal is to convert a World Cup audience into a year-round fantasy sports audience.

**Immediate actions (July 15 – July 31):**

- [ ] **Tournament wrap content:** Send every user their full tournament stats ("Your team scored 1,847 points over 64 matches — you finished #3 in your league"). Make this shareable. This is your highest-engagement moment post-tournament.
- [ ] **Season-long league seeds:** Prompt every existing league to "keep your league going" for the upcoming club season (Champions League, Premier League, etc.). One-click opt-in. Pre-populate with same members.
- [ ] **Email list maximization:** Every registered user should receive a post-tournament email sequence: Week 1 recap, Week 3 "what's coming next," Week 6 "Champions League fantasy is here." Build this sequence in Sprint 3 or immediately post-WC.
- [ ] **Trophy room:** Add a permanent "WC2026 Trophy" to each user's profile for tournament participation. Rare trophies for: league winner, top scorer picker, perfect bracket round, etc. These create identity and retention without any new gameplay.

**What NOT to build immediately after the tournament:**
- Do not rush a native app. User energy is high but developer energy is depleted. Take 2 weeks to recover, analyze data, and plan deliberately.
- Do not add a new tournament (Copa América, etc.) until the codebase is hardened for multi-tournament support.

### Champions League Fantasy (August – December 2026)

Champions League 2026–27 group stage begins in mid-September 2026. This is the natural next product.

**Why CL, not Premier League/La Liga:**
- Tournament structure (group stage → knockouts) mirrors World Cup — your product mechanics transfer directly
- Pan-European player pool keeps the international appeal you built during WC2026
- Smaller player pool than FPL (easier to manage data); higher glamour matches (easier to market)
- No competitor dominates CL fantasy specifically (FPL is England-only; La Liga Fantasy is Spain-only)

**CL-specific mechanics to build:**
- [ ] **Group stage pools:** Same structure as WC2026 — pick from all 36 teams, lock by matchday
- [ ] **UCL-specific chips:** "European Nights" chip (double points on Tuesday/Wednesday matches only)
- [ ] **Knockout bracket predictor:** Already built for WC2026; reuse with CL bracket
- [ ] **Club vs Country squad separation:** User has one squad per tournament; data model must support this by launch

**CL launch target:** September 10, 2026 (1 week before first CL matchday)

**Build window:** August 1 – September 9. That is 6 weeks with a rested team. Scope ruthlessly — reuse 80% of existing screens; the delta is data (CL teams + players) and minor UX copy changes.

### Native App (iOS/Android) Decision Framework

**Decision criteria — build native when ALL of the following are true:**

| Criterion | Threshold |
|-----------|-----------|
| Monthly Active Users | > 5,000 MAU post-WC2026 |
| PWA install rate | > 15% of users have added to home screen |
| App Store requests | > 50 user requests captured in feedback |
| Team capacity | A dedicated mobile developer can be hired or contracted |
| Revenue | Sufficient to fund $99/year Apple developer account + build time |

**2026 recommendation: do not build native yet.**
- The PWA approach with `manifest.json`, service workers, and web push covers 85% of the native app UX benefit
- React 19 + Vite produces excellent mobile performance
- A native app requires maintaining two additional codebases (or React Native, which has its own complexity)
- Revisit this decision in January 2027 with real retention data

**If you do go native in 2027:**
- Use React Native (Expo) — maximum code reuse with existing React components and Supabase SDK
- iOS first (higher ARPU in fantasy sports demographics), Android 60 days later
- Retain the web app indefinitely; do not abandon it

### Multi-Tournament Architecture Evolution

The current codebase is implicitly WC2026-specific. The data model needs to generalize before CL launch.

**Required schema changes (August 2026):**

```sql
-- Add tournament context to all core tables
ALTER TABLE fixtures ADD COLUMN tournament_id UUID REFERENCES tournaments(id);
ALTER TABLE squads ADD COLUMN tournament_id UUID REFERENCES tournaments(id);
ALTER TABLE matchday_scores ADD COLUMN tournament_id UUID REFERENCES tournaments(id);
ALTER TABLE chips_used ADD COLUMN tournament_id UUID REFERENCES tournaments(id);

-- Tournament registry
CREATE TABLE tournaments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,           -- 'FIFA World Cup 2026', 'UEFA Champions League 2026-27'
  slug TEXT UNIQUE NOT NULL,    -- 'wc2026', 'ucl2627'
  type TEXT NOT NULL,           -- 'world_cup', 'champions_league', 'euro', 'copa_america'
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  status TEXT DEFAULT 'upcoming' -- 'upcoming', 'active', 'completed'
);
```

**UI changes:**
- Tournament selector on Home and League screens (dropdown or tab)
- User profile shows all tournaments they've participated in
- Leagues scoped to a tournament (a WC2026 league cannot see CL scores)

**This migration must happen in August 2026 before any data is seeded for CL.** Retroactively migrating mid-season is extremely high risk.

---

## 5. Long-Term Product Vision

### 2027 Product Roadmap

#### Copa América 2027 (June–July 2027)

- 16 CONMEBOL nations; smaller tournament than WC but strong Latin American diaspora audience
- **Market opportunity:** No premium fantasy product exists for Copa América
- **Product delta from WC2026:** Minimal. Swap player/fixture data; update branding. Estimate 2–3 weeks of work if multi-tournament architecture is in place.
- **Monetization test:** Consider Copa América as the first paid product (premium league creation, advanced stats). Lower stakes tournament = lower churn risk if paid features disappoint.
- **Launch target:** May 2027 (6 weeks before tournament)

#### FIFA Women's World Cup 2027 (August–September 2027)

- Hosted in Brazil; global audience growing rapidly post-2023 record-breaking edition
- **Strategic value:** First-mover advantage in women's football fantasy is enormous — no competitor has built a serious product
- **Product delta:** Player/fixture data pipeline must support women's football data providers (different APIs, different data quality)
- **Community consideration:** Women's football community has different social dynamics; the chat/social layer may need curation features (moderation, community guidelines)
- **Launch target:** July 2027

#### UEFA Euro 2028 (England, June–July 2028)

- Largest European tournament; England hosting = English-speaking audience peak
- **By 2028, ForzaKit should be the default fantasy platform for international tournaments** — not a challenger
- This is a growth multiplier event, not a launch event. The product should be mature by this point.
- Native apps should be live. Revenue model should be established.

### Platform vs Product Decision

**The question:** Do you remain a consumer product (ForzaKit the app) or do you become the infrastructure that other fantasy games are built on (ForzaKit the platform)?

**The platform play would mean:**
- White-label fantasy engine licensed to sports media companies, broadcasters, betting operators
- API-first: `POST /leagues`, `POST /squads`, `GET /scores` — any front-end can use ForzaKit's scoring and social layer
- Revenue: B2B SaaS (per-active-user licensing) instead of or in addition to B2C

**Decision framework — when to evaluate:**

| Signal | What It Means |
|--------|---------------|
| Inbound from a media company asking to white-label | Platform demand is real; accelerate the decision |
| Consumer MAU plateaus at < 10k after 2 tournaments | B2C ceiling too low; platform may be the path |
| Consumer MAU > 50k and growing | B2C has legs; delay platform work |
| A competitor raises > $5M for a similar product | Competitive moat requires differentiation — platform is one option |

**2026 recommendation:** Stay product-focused. Build the consumer app. Resist the platform temptation until you have at least 2 tournaments of real retention data. Platform work before product-market fit is premature optimization.

**The path if you go platform (2028+):**
- Extract the scoring engine (already in Edge Functions) into a versioned API
- Extract the chat layer into a standalone SDK
- Build a white-label theming system (already partially in place via the visual design system)
- First pilot: license to a regional sports broadcaster for Euro 2028

### Expansion into Other Fantasy Sports

**Prioritized by market size × effort ratio:**

1. **Six Nations Rugby (Feb–Mar 2028):** Tournament structure identical to WC2026; smaller but loyal audience; low data complexity. High fit, low effort.
2. **NBA / Basketball:** Season-long, completely different mechanics, massive market. High effort, high reward. Do not touch until you have a dedicated product team.
3. **Cricket (ICC tournaments):** Large South Asian diaspora market; ICC tournaments have the same "major international event" structure as WC. Viable in 2028 if you have the right data partnerships.
4. **American Football (Super Bowl pools):** One-day bracket product, not season-long. Low complexity, high viral potential. Could be a February standalone product.

**Do not expand into more than one new sport per year.** Data infrastructure, player pool management, and ops playbooks are tournament-specific. Spreading thin kills product quality.

---

## 6. Team & Process Recommendations

### Current Team Structure (April–September 2026)

With 2–3 developers and 1 product/design person, roles must be explicit to avoid ambiguity:

| Role | Primary Responsibilities | Secondary |
|------|-------------------------|-----------|
| **Lead Dev (Full-stack)** | Supabase schema, Edge Functions, scoring engine, auth, API integrations | Code reviews, deployment |
| **Frontend Dev** | React screens, real-time UI, PWA, mobile performance, E2E tests | Design implementation |
| **Product/Design** | Sprint planning, user research, Figma designs, ops playbook, content calendar, user communications | QA, beta coordination |
| **Dev #3 (if available)** | Load testing, monitoring setup, infra hardening, on-call coverage | Feature development |

**The product/design person is also the ops manager during the tournament.** This is not optional — someone needs to own the matchday ops calendar, the social posts, and user communications full-time during June–July.

### When to Hire

| Threshold | Role to Hire | Why |
|-----------|-------------|-----|
| 1,000 MAU after WC2026 | Part-time community manager | Chat moderation, user support, social media — currently eating product/design time |
| 5,000 MAU | Data engineer / backend dev | Automated data pipeline is no longer optional at this scale |
| 10,000 MAU | Mobile developer (React Native/Expo) | Native app is now worth the investment |
| $10k MRR | Head of Growth | User acquisition needs dedicated ownership separate from product |
| 50,000 MAU | Engineering manager | Team coordination overhead exceeds what a VP of Product can absorb |

**Do not hire ahead of these thresholds.** A small, high-trust team with clear roles outperforms a larger team with ambiguity at this stage.

### Process

**Daily Standup (async, not synchronous):**
- Format: Slack/Discord thread at 09:00 every day
- Each person posts: [Done] [Doing] [Blocked]
- Synchronous standups only during tournament operations (5-minute call, matchday mornings)
- Skip standups on rest days during the tournament — team needs recovery time

**Weekly Demo (Friday, 45 minutes):**
- Every Friday, the team demos whatever shipped that week — to each other and to 1–2 beta users if available
- No slides. Show the product.
- Capture feedback in Linear/GitHub Issues immediately
- The demo is also the sprint health check — if nothing is demoable, the sprint is off track

**Monthly Strategy Review (last Monday of each month, 90 minutes):**
- Agenda: Metrics review (30 min) → Roadmap reprioritization (30 min) → Team retro (30 min)
- Owner: Product/Design prepares the deck; all 3+ attend; decisions are written down and not relitigated
- Output: Updated sprint plan for the next 4 weeks

**No meetings outside these three.** All other coordination happens async in Linear/GitHub comments. Protect development time ferociously — a 3-person team cannot afford 4-hour meeting days.

### Tooling

**Recommendation: Linear + GitHub + Notion**

| Tool | Use Case | Why |
|------|----------|-----|
| **Linear** | Sprint planning, issue tracking, bug reports | Best-in-class UI for small eng teams; fast; git integration; not overkill like Jira |
| **GitHub Projects** | PR tracking, release milestones | Already where code lives; use Projects for release checklists only |
| **Notion** | Strategy docs, runbooks, ops playbooks, this PIPELINE.md | Long-form writing and knowledge base; not a task tracker |
| **Slack / Discord** | Real-time comms, async standups, alerts | Discord preferred if your beta community is also there (one less tool) |
| **Figma** | Design, prototyping, component library | Non-negotiable for design; export directly to dev handoff |
| **Sentry** | Error tracking | Free tier covers pre-launch; upgrade to Team plan at 1k MAU |
| **Resend** | Transactional email (waitlist confirms, matchday recaps) | Developer-friendly; Supabase-native integration; cheap |

**What NOT to use:**
- Jira: too heavyweight for a 3-person team; Linear is strictly better
- Trello: too simple for sprint planning with dependencies
- Asana: designed for project management, not product engineering
- GitHub Issues alone: works but lacks the sprint/cycle view that Linear provides

---

## 7. Success Metrics by Phase

All metrics tracked in a shared Notion dashboard updated weekly. Single source of truth.

### Pre-Launch (Now – June 4)

| Metric | Definition | Target | Stretch |
|--------|-----------|--------|---------|
| Waitlist size | Emails captured on forzakit.com | 500 | 2,000 |
| Waitlist conversion rate | % of waitlist who create an account within 48h of invite | 40% | 60% |
| Beta NPS | Net Promoter Score from 20-person Wave 1 beta survey | 35 | 50 |
| Beta D7 retention | % of Wave 1 beta users who return after 7 days | 40% | 60% |
| Invite share rate | % of beta users who share their league invite link | 20% | 40% |
| E2E test pass rate | Automated test suite on production | 100% | 100% |
| Mobile Lighthouse score | Performance score on mobile | 85 | 92 |

### Launch Week (June 5–14)

| Metric | Definition | Target | Stretch |
|--------|-----------|--------|---------|
| Total registrations | Users who complete sign-up | 1,000 | 5,000 |
| First team created rate | % of registrations who build a squad | 60% | 75% |
| League creation rate | % of registrations who create or join a league | 40% | 60% |
| Share rate | % of users who share a Gazette card or league invite | 15% | 30% |
| Social impressions | Reach of launch posts across all channels | 50k | 250k |
| App crashes / P0 incidents | Critical failures during launch week | 0 | 0 |
| Score accuracy | % of match events scored correctly within 30 min of FT | 98% | 100% |
| Onboarding completion | % who complete all 3 onboarding steps | 50% | 70% |

### During Tournament (June 8 – July 15)

| Metric | Definition | Target | Stretch |
|--------|-----------|--------|---------|
| DAU | Daily active users on matchdays | 500 | 3,000 |
| DAU/MAU ratio | Stickiness ratio | 40% | 60% |
| Session length (matchday) | Avg session on a live match day | 8 min | 15 min |
| Session length (non-matchday) | Avg session on a rest day | 3 min | 6 min |
| D7 retention | % of users who return 7 days after sign-up | 35% | 55% |
| D30 retention | % of users who return 30 days after sign-up | 20% | 40% |
| Chat messages per league/matchday | Social engagement signal | 10 | 30 |
| Share rate per matchday | % of active users sharing a Gazette card | 20% | 40% |
| Transfer rate | % of users making at least 1 transfer per matchday | 25% | 45% |
| Score accuracy | % of events scored correctly | 98% | 100% |
| Uptime | System availability during match windows | 99.5% | 99.9% |

### Post-Tournament (July 16 – December 2026)

| Metric | Definition | Target | Stretch |
|--------|-----------|--------|---------|
| D30 retention (from WC2026 sign-up) | % still active 30 days post-tournament | 15% | 30% |
| Email list | Total opted-in email subscribers | 2,000 | 10,000 |
| Email open rate | For the post-tournament recap sequence | 30% | 45% |
| CL 2026-27 early sign-ups | Users who opt into "notify me for CL fantasy" | 20% of WC base | 40% |
| Season-long league opt-in | Existing WC2026 leagues that opt to continue | 30% | 50% |
| Premium conversion (if applicable) | % converting to a paid tier (if launched) | 2% | 5% |
| MAU at Dec 2026 | Monthly actives during off-season | 200 | 1,000 |
| App store rating (if PWA reviews tracked) | User satisfaction signal | 4.2 | 4.6 |
| NPS (post-tournament survey) | Net Promoter Score | 40 | 60 |

---

## Appendix A — Scoring Engine Specification

Agreed scoring system for WC2026 (finalize in Sprint 1; lock before first match):

| Event | GK | DEF | MID | FWD |
|-------|-----|-----|-----|-----|
| Goal | 6 | 6 | 5 | 4 |
| Assist | 3 | 3 | 3 | 3 |
| Clean sheet (90 min) | 6 | 6 | 1 | 0 |
| 60+ min played | 2 | 2 | 2 | 2 |
| Yellow card | -1 | -1 | -1 | -1 |
| Red card | -3 | -3 | -3 | -3 |
| Penalty saved | 5 | 0 | 0 | 0 |
| Penalty missed | -2 | -2 | -2 | -2 |
| Own goal | -2 | -2 | -2 | -2 |
| Captain multiplier | 2× | 2× | 2× | 2× |
| Triple Captain (chip) | 3× | 3× | 3× | 3× |
| Goal conceded (per 2) | -1 | -1 | 0 | 0 |

---

## Appendix B — Critical Path Summary

```
Apr 21  ── Sprint 1 START ──────────────────────────────────────────────────┐
                                                                            │
May 4   ── Sprint 1 END: Live Supabase schema, scoring Edge Function ───────┤
                                                                            │
May 5   ── Sprint 2 START ───────────────────────────────────────────────── │
                                                                            │
May 18  ── Sprint 2 END: Beta launch (20 users), league invites live ────── │
                                                                            │
May 19  ── Sprint 3 START / Closed beta opens (500 users) ──────────────── │
                                                                            │
Jun 1   ── Sprint 3 END: Load tested, feature flags, monitoring live ─────  │
                                                                            │
Jun 2   ── Sprint 4 START / Launch preparations ─────────────────────────  │
                                                                            │
Jun 5   ── PUBLIC LAUNCH ────────────────────────────────────────────────── │
                                                                            │
Jun 8   ── WORLD CUP KICKS OFF / Product Hunt / Deploy freeze begins ─────  │
                                                                            │
Jul 15  ── WORLD CUP FINAL / Post-tournament retention push ─────────────── │
                                                                            │
Aug 1   ── Multi-tournament architecture migration begins ──────────────────┘

Sep 10  ── CHAMPIONS LEAGUE FANTASY LAUNCH
```

---

*Document owner: VP of Product*
*Last updated: April 20, 2026*
*Next review: May 4, 2026 (Sprint 1 close)*
