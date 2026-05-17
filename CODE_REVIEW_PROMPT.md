# Comprehensive Code Review Prompt: Forza Fantasy League

## Context & Objectives

You are conducting a **deep architectural and implementation review** of Forza Fantasy League, an elite fantasy football web + mobile app. The goal is to identify opportunities for improvement, uncover hidden production risks, and ensure the platform is architected to scale into **multi-competition mode** (multiple leagues: EPL, La Liga, Serie A, etc.) and **cross-league squad building**.

### Project Overview
- **Stack**: React 19 + Vite + Tailwind + Supabase (PostgreSQL + Auth + Edge Functions + Realtime)
- **Mobile**: Capacitor (iOS/Android)
- **Current State**: Core features built (squad, league, transfers, chat, live scores), ready for multi-competition expansion
- **Live App**: https://wc-fantasy-football.vercel.app
- **Repository**: https://github.com/[repo-path] (full structure in CLAUDE.md)

### Future Roadmap (Inform Your Review)
1. **Phase 2: Multi-Competition Support** → Support EPL, La Liga, Serie A, MLS, etc. simultaneously
2. **Phase 3: Cross-League Mode** → Allow players to build squads from ANY league (e.g., mix EPL + La Liga players)
3. **Scaling**: 10K+ concurrent users, millions of match stats/player records, real-time live updates across multiple competitions

---

## Review Categories & What to Look For

### 1️⃣ IMPROVEMENTS (Optimization, Efficiency, Code Quality)

**Focus Areas:**
- **Performance**: Component render cycles, unnecessary re-renders, bundle size, query efficiency
- **Code Quality**: Naming clarity, single-responsibility principle, DRY violations, dead code
- **Data Fetching**: N+1 queries, over-fetching, caching strategy, Realtime subscription patterns
- **Error Handling**: Missing try-catch blocks, unhandled promise rejections, edge-case validation
- **Testing**: Coverage gaps, brittle tests, missing integration tests
- **Documentation**: Stale docs, missing API/schema documentation, unclear business logic

**Output Format:**
```
## Improvement: [Category] — [Brief Title]
**File(s)**: [file_path.js:line_number, ...]
**Severity**: Low / Medium / High
**Current State**: [What's happening now]
**Issue**: [Why it's suboptimal]
**Recommendation**: [Specific action to take]
**Effort**: 1h / 4h / 1d / 3d
```

---

### 2️⃣ CORNER CASES (Edge Conditions, Boundary Scenarios)

**Focus Areas:**
- **Input Validation**: What happens with empty, null, negative, oversized, malformed inputs?
- **State Transitions**: What if a user is in squad-building and league gets deleted? What if transfer window closes mid-transfer?
- **Concurrency**: Two managers buying the same player simultaneously? Overlapping API calls?
- **Data Integrity**: What if a player is transferred between clubs mid-season? What if match stats arrive out-of-order?
- **Offline/Retry**: App disconnects during chat message? Transfer fails halfway?
- **Boundary Conditions**: 0 leagues, 0 squads, max formation size (12+ players), budget overflow, negative points
- **Time-based**: Daylight saving time, timezone transitions, cron job delays, clock skew
- **Mobile-specific**: App backgrounding, permission denial, low memory, network switching

**Output Format:**
```
## Corner Case: [Scenario Title]
**Affected Area(s)**: [Component/Hook/API/Database]
**Scenario**: [Detailed description of the edge case]
**Current Behavior**: [What actually happens now]
**Risk**: [What could break or go wrong]
**Acceptance Criteria**: [How should it behave?]
**Test Case**: [Example test to verify fix]
```

---

### 3️⃣ SILENT ERRORS (Production Risks, Undetected Failures)

**Focus Areas:**
- **Data Loss**: Incomplete transfers recorded, lost chat messages, orphaned squad records
- **Inconsistent State**: User sees outdated standings, squad doesn't match league rules, points don't add up
- **Security**: RLS bypass, SQL injection risk, exposed secrets, permission escalation
- **API Failures**: Forza Football API timeout → fallback? Supabase connection drop → silent failure?
- **Graceful Degradation**: If component fails, what does user see? (Error boundary, fallback UI, clear error message?)
- **Logging & Monitoring**: Is failure detectable? Do we log errors for diagnosis? Can we trace a user's action through the system?
- **Database Constraints**: Missing unique constraints, orphaned foreign keys, missing cascading deletes
- **Rate Limiting**: What if a user's code triggers 1000 requests/second? API throttle handling?
- **Resource Leaks**: Event listeners not cleaned up, memory leaks in loops, unclosed database connections

**Output Format:**
```
## Silent Error: [Title]
**Location(s)**: [file_path.js:line_number, ...]
**Severity**: Critical / High / Medium / Low
**Failure Mode**: [How it fails silently]
**User Impact**: [What does the user experience?]
**Detection Method**: [How would you catch this in production?]
**Root Cause**: [Why doesn't the code catch this?]
**Fix**: [Specific code change or architectural fix]
**Monitoring**: [How to alert on this in production]
```

---

## Multi-Competition & Cross-League Architectural Review

**In addition to the above, evaluate these future-readiness dimensions:**

### Database Schema Flexibility
- [ ] Is the schema **keyed by competition** throughout (fixtures, players, squads)?
- [ ] Can a user's squad reference players from **multiple competitions**?
- [ ] How does the scoring layer generalize across different competition rules/point systems?
- [ ] Are there hardcoded assumptions about "the league" or "the player pool"?
- [ ] Can season/calendar changes (mid-season transfers, rule changes) be modeled?

### API Integration Assumptions
- [ ] Does the Forza Football API integration assume a single competition (EPL)?
- [ ] How would we handle **multiple API providers** (e.g., ESPN for La Liga, other vendors)?
- [ ] Is player-matching logic (ID mapping across leagues) flexible enough?
- [ ] Can live score updates handle **simultaneous matches across competitions**?

### Component Architecture
- [ ] Are components **competition-aware** or hardcoded to single league?
- [ ] Can the squad builder work with **cross-league player pools**?
- [ ] Does the formation validator generalize (different leagues may have different rules)?
- [ ] Can charts/standings display **multi-competition data** without refactor?

### Business Logic Isolation
- [ ] Scoring rules: Are they **configurable per-competition**, or hardcoded?
- [ ] Transfer window rules: **Parameterized per-competition** or global?
- [ ] Draft rules: Can they vary across competitions?
- [ ] Chip/power-tool rules: Do they generalize to other leagues?

### Suggested Output

For architectural flexibility, provide:

```
## Architecture Fit: [Area]
**Assessment**: [Is this ready for multi-competition? Yes/No/Partial]
**Blocker(s)**: [What prevents multi-competition support?]
**Refactor Path**: [Concrete steps to make it flexible]
**Timeline Estimate**: [Quick win / 1–2 weeks / Month+]
```

---

## Scope & Depth Instructions

### Mandatory Areas to Review
1. **Database Schema** (`supabase/migrations/`) — Ensure tables can support multi-competition
2. **Data Models** (players, squads, leagues, fixtures, standings) — Are they parameterized?
3. **Core Business Logic** (scoring, transfers, formations, draft) — Hardcoded assumptions?
4. **API Integration** (`src/lib/api.js`, Forza Football client) — Generalized or EPL-only?
5. **Component Tree** (squad builder, formation display, standings, market) — Competition-aware?
6. **Error Handling & Validation** — Missing guards, edge cases?
7. **Realtime Subscriptions** — Correct data scoping? Subscription leaks?
8. **State Management** (AuthContext, hooks like useSquad, useLeague) — Generalized?

### Optional Deep-Dives (If Discovering Issues)
- E2E test coverage and brittleness
- Mobile-specific concerns (Capacitor, native plugins)
- CI/CD pipeline health
- Observability & logging strategy

---

## Output Specification

**Organize findings as follows:**

```
# Code Review: Forza Fantasy League
**Review Date**: [Today's date]
**Reviewer**: [Your name/model]
**Scope**: Full stack — React, Supabase, API integration, mobile

## Executive Summary
[1–2 paragraph overview of overall health, major risks, readiness for multi-competition]

---

## 🟢 Improvements (Organized by Impact)

### [Category 1]
[List improvements here, ordered by effort/impact]

### [Category 2]
...

---

## 🟡 Corner Cases (Organized by Severity)

### [Critical Corner Cases]
[Cases that could break the app]

### [Common Edge Cases]
[Cases that degrade experience]

---

## 🔴 Silent Errors (Organized by Severity)

### [Critical — Data Loss / Security]
[Silent errors that users/audits will discover in production]

### [High — Inconsistent State]
[Errors that cause subtle bugs]

### [Medium — Degraded Experience]
[Failures that don't crash but degrade UX]

---

## 🏗️ Multi-Competition Architectural Readiness

### Schema & Data Model
[Readiness assessment]

### API & Integration
[Readiness assessment]

### Component Architecture
[Readiness assessment]

### Business Logic
[Readiness assessment]

---

## 📋 Prioritized Action Plan

### Phase 1: Critical Fixes (Ship Before Production Scale)
1. [Silent Error fix] — [Effort] — [Why it matters]
2. [Security issue] — [Effort]
...

### Phase 2: Improvement & Refactor (Next 2–4 Weeks)
1. [Architectural blocker] — [Effort] — [Unlocks cross-league]
2. [Performance optimization] — [Effort]
...

### Phase 3: Future-Proofing (Post-MVP)
1. [Multi-competition schema redesign] — [Effort]
2. [API abstraction layer] — [Effort]
...

---

## Appendix: Review Questions Used
[List of specific questions/criteria that informed this review]
```

---

## Additional Guidance

### Code Locations to Prioritize
- **Database**: `supabase/migrations/` (schema assumptions)
- **Core Hooks**: `src/hooks/useSquad.js`, `useLeague.js`, `useTransfer.js` (business logic)
- **Components**: `src/screens/SquadScreen.jsx`, `MarketScreen.jsx`, `LeagueScreen.jsx` (user flows)
- **API Client**: `src/lib/api.js` (Forza Football integration)
- **Edge Functions**: `supabase/functions/` (scoring, transfers, live updates)
- **Tests**: `e2e/tests/` (coverage gaps)

### Red Flags to Highlight
- Hardcoded strings like "EPL", "Premier League", competition IDs as magic numbers
- `WHERE competition_id = 1` without parameterization
- Player/fixture queries that don't scope by competition
- Scoring rules embedded in calculations vs. configurable tables
- Missing input validation or error messages
- Unhandled async operations or promise chains
- Comments like "TODO: support multiple leagues" or "HACK: for now..."

### Questions to Answer
1. **If we launch 3 more leagues tomorrow, what breaks?**
2. **If a player is transferred between clubs, what stale data persists?**
3. **If the Forza Football API is down for 2 hours, what does the user see?**
4. **If two managers submit the same transfer simultaneously, what happens?**
5. **If a chat message fails to save, does the user know?**
6. **What happens if someone deletes a league while the app is open?**
7. **Can we currently run an EPL league and a La Liga league simultaneously?**

---

## Deliverables Checklist

- [ ] Improvements identified and prioritized by effort
- [ ] Corner cases documented with test case suggestions
- [ ] Silent errors with detection/monitoring strategies
- [ ] Multi-competition architectural assessment (blocker list)
- [ ] Prioritized action plan (Phase 1, 2, 3)
- [ ] Specific file locations and line numbers for every finding
- [ ] Risk severity levels assigned
- [ ] Effort estimates for remediation

---

## Notes for Reviewer

- **Be Specific**: Point to actual code. "useSquad.js:45 does X" is better than "hooks need work"
- **Be Honest**: If something is unfixable without major refactor, say so
- **Be Forward-Looking**: Ask "will this scale?" for every finding
- **Be Constructive**: Provide concrete fixes, not just criticism
- **Be Prioritized**: Highlight critical blockers first, nice-to-haves last

Good luck with the review! 🚀
