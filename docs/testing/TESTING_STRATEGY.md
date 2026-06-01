# Testing Strategy — Forza Fantasy League

**Comprehensive approach to test automation, frameworks, and coverage for web + mobile.**

---

## Overview

This project uses **Playwright for end-to-end testing** with a two-tier execution model:

1. **CI-Enforced** — `platform.spec.js` (36 tests × 2 browsers, ~3 min) runs on every PR
2. **Integration** — Mode-scoped specs run manually against live Supabase

Unit tests are planned (Vitest) but not yet implemented.

---

## Non-Negotiable Testing Principles

These rules apply to every test session and every spec file.

### 1. Always Use Real API Data

Tests must use real players and real fixtures as served by the Forza Football API and already stored in the `players` and `fixtures` tables. Never hard-code made-up player names, club names, or fixture pairings in test flows.

**Exception**: Player prices. The Forza API does not provide price data. When `price IS NULL` for players in the test tournament, seed random prices **before running any transfer or auction test** (see Price Check below). This is the only case where synthetic data is permitted.

### 2. Player Price Hard Stop

Before any test flow involving buy/sell/auction/budget: run the price coverage query in Appendix D. If any player prices are missing, seed them before proceeding. Tests that run against null-price players produce false confidence — budget enforcement is silently bypassed.

### 3. Minimum 4 Participants Per Test League

Every test league must have at least 4 active managers. This is required to test:
- Standings with a meaningful table (not just 1 or 2 rows)
- Chat @mentions of other managers
- Auction competition (bidding between managers)
- Trade proposals (must have a counterparty)
- Draft allocation conflicts (multiple managers wanting the same player)

### 4. All Mode × Format Combinations Must Be Covered

The platform has two independent axes that produce four distinct game paths. Every test session must cover all four:

| | League format (EPL-style, season-long) | Cup format (WC/UCL-style, knockout) |
|---|---|---|
| **Classic mode** | Classic × League | Classic × Cup |
| **Draft mode** | Draft × League | Draft × Cup |

Features that behave differently across paths:
- **Market**: Classic allows shared player ownership; Draft enforces uniqueness (takenByOther blocks)
- **Admin — Draft section**: hidden for Classic, shown for Draft
- **Admin — Knockout Draft**: hidden for Classic and for Draft × League; visible for Draft × Cup
- **Season stepper**: 2 stages (Classic) vs 4 stages (Draft)
- **FrontPage secondary column**: "LEAGUE ACTIVITY" (Classic) vs "DRAFT REPORT" (Draft)
- **Market — takenByOther indicator**: Classic shows no blocking; Draft blocks owned players
- **Transfer window status**: DEADLINE-CONTROLLED for WC/tournament leagues

---

## Test Tiers & Execution Model

### Tier 1: Platform Tests (CI-Enforced)

**File**: `e2e/tests/platform.spec.js`
**Scope**: Critical user flows required for MVP
**Browsers**: Chromium × Firefox (2 parallel runs)
**Execution**: Automatic on every PR (`.github/workflows/ci.yml`)
**Duration**: ~3 minutes
**Must-Pass Requirement**: Blocks PR merge to main

**Flows Tested** (36 tests):
- Login & session persistence
- Onboarding wizard
- Squad building & formation validation
- Transfer market interaction
- League creation & standing display
- League chat
- Live match updates & Joker chip selection

### Tier 2: Integration Tests (Manual)

**Spec files**: one per game path + shared flows
**Scope**: Full feature coverage for each mode × format combination
**Trigger**: Developer runs locally against live Supabase before releases
**Duration**: 30–60 minutes for a full run across all four paths
**Live Data Requirement**: Requires real players, fixtures, and Supabase state

**Spec organisation** (aligned to game paths):

| File | Scope |
|---|---|
| `platform.spec.js` | CI-enforced: auth, squad, market, league, live (36 tests) |
| `classic-league.spec.js` | Classic × League format — full journey |
| `classic-cup.spec.js` | Classic × Cup format — full journey |
| `draft-league.spec.js` | Draft × League format — full journey |
| `draft-cup.spec.js` | Draft × Cup format — full journey |
| `scoring.spec.js` | Score calculation, points log, recalculation (all modes) |

### Tier 3: Unit Tests (Planned, Not Yet Implemented)

**Framework**: Vitest (lightweight, Vite-native)
**Target**: React hooks (useAuth, useSquad, useTransfer), formatters, validators
**Trigger**: Developer runs locally + CI check

---

## Playwright Configuration

**File**: `playwright.config.js`

```javascript
use: {
  baseURL: 'http://localhost:5173',
  trace: 'on-first-retry',
  screenshot: 'only-on-failure',
  video: 'retain-on-failure',
},
projects: [
  { name: 'chromium' },
  { name: 'firefox' },
  // Safari omitted (flaky on CI, tested locally)
],
webServer: {
  command: 'npm run dev',
  port: 5173,
  reuseExistingServer: process.env.CI !== 'true',
},
```

**Artifacts**:
- Trace files: `.playwright/trace.zip` (on failure)
- Screenshots: `e2e-report/` (on failure)
- Videos: `e2e-report/` (on failure)
- HTML Report: `npx playwright show-report`

---

## Running Tests Locally

```bash
# CI-enforced test
npx playwright test e2e/tests/platform.spec.js

# Full integration suite (manual, all four paths)
npx playwright test e2e/

# Single path
npx playwright test e2e/tests/draft-cup.spec.js

# Debug specific test
npx playwright test -g "Draft × Cup — Knockout allocation" --debug

# View report
npx playwright show-report e2e-report/
```

---

## Test Data & Isolation

### API Data First

Every test that needs players or fixtures resolves them from the live `players` and `fixtures` tables. Do not use `src/data/*.json` fallbacks in integration tests — those are for offline demo mode only.

### Player Price Fallback

If players in the tournament under test have `price IS NULL`, seed prices before running transfer/auction flows:

```sql
UPDATE players
SET price = ROUND((RANDOM() * 3 + 4)::NUMERIC, 1)  -- £4.0–£7.0
WHERE tournament_id = '<id>' AND price IS NULL;
```

This is the only permitted use of synthetic data.

### League Isolation

Each test path operates on its own dedicated league (see Appendix A of the E2E playbook for IDs). Test accounts are added to all four leagues, but each spec only exercises its own league to avoid cross-contamination.

### Reset Between Runs

Before each test cycle, run the data reset scripts in the playbook Appendix B. This restores league members, open transfer windows, auction listings, and fresh bet instances.

---

## CI/CD Integration

**File**: `.github/workflows/ci.yml`

Pipeline stages:
1. **Lint** — ESLint (must pass)
2. **Build** — Vite production build (must succeed)
3. **E2E Test** — `platform.spec.js` only (36 tests × 2 browsers)

**Local CI Simulation**:
```bash
npm run lint && npm run build && npx playwright test e2e/tests/platform.spec.js
```

---

## Coverage Goals & Status

### Mode × Format Coverage Matrix

| Feature | Classic × League | Classic × Cup | Draft × League | Draft × Cup |
|---|---|---|---|---|
| Auth & onboarding | ✅ | (same) | (same) | (same) |
| Market — open buy/sell | ✅ target | ✅ target | ✅ target | ✅ target |
| Market — Classic no-block | ✅ target | ✅ target | — | — |
| Market — Draft taken-block | — | — | ✅ target | ✅ target |
| Draft submission | — | — | ✅ target | ✅ target |
| Draft allocation (admin) | — | — | ✅ target | ✅ target |
| Knockout draft | — | — | — | ✅ target |
| Auctions | ✅ target | ✅ target | ✅ target | ✅ target |
| Trades | ✅ target | ✅ target | ✅ target | ✅ target |
| Captain & chips | ✅ target | ✅ target | ✅ target | ✅ target |
| Starting XI / bench swap | ✅ target | ✅ target | ✅ target | ✅ target |
| Bets (place/create/resolve) | ✅ target | ✅ target | ✅ target | ✅ target |
| League News post | ✅ target | ✅ target | ✅ target | ✅ target |
| Chat & mentions | ✅ target | (same) | (same) | (same) |
| Admin — season stepper | 2-stage | 2-stage | 4-stage | 4-stage |
| Admin — transfer window | ✅ target | DEADLINE-CONTROLLED | ✅ target | DEADLINE-CONTROLLED |
| Admin — knockout draft | hidden | hidden | hidden | ✅ target |
| Score recalculation | ✅ target | ✅ target | ✅ target | ✅ target |
| Standings & FrontPage | ACTIVITY col | ACTIVITY col | DRAFT REPORT col | DRAFT REPORT col |
| Club cap relaxation | — | ✅ target | — | ✅ target |
| Eliminated club restriction | — | ✅ target | — | ✅ target |
| Player-repeat relaxation | — | — | — | ✅ target |

### Implementation Status

| Spec | Status |
|---|---|
| `platform.spec.js` | ✅ Green (CI) |
| `classic-league.spec.js` | 📋 New — see Playbook PART B |
| `classic-cup.spec.js` | 📋 New — see Playbook PART C |
| `draft-league.spec.js` | 🟡 Partially covered (old playbook FLOW 1–14) — needs rewrite |
| `draft-cup.spec.js` | 🟡 Partially covered (old playbook WC addendum) — needs rewrite |
| `scoring.spec.js` | 🟡 In progress |

---

## Known Limitations

| Issue | Scope | Workaround |
|---|---|---|
| Safari flaky in CI | `platform.spec.js` | Run locally only |
| Integration specs need live Supabase | All integration specs | Manual only; not CI |
| Lineup lock cron (5-min interval) | Starting XI tests | Mark fixture as `live` in SQL directly to trigger lock |
| process-transfer JWT requirement | Buy transfer | Use user's JWT from `localStorage` (not anon key) if direct fetch needed |
| Player prices not from Forza API | Any budget test | Seed with random £4–£7 before running |
| No unit tests | Hooks, utilities | Planned (Vitest) |

---

## Best Practices for Writing Tests

### Test User Behaviour, Not Implementation

```javascript
// ❌ Bad: Testing internal state
expect(component.state.squadLoaded).toBe(true);

// ✅ Good: Testing observable behaviour
await expect(page.locator('[data-testid="squad-formation"]')).toBeVisible();
```

### Self-Contained Setup

```javascript
// ❌ Bad: Depends on previous test state
test('user can transfer player', async ({ page }) => {
  // assumes squad already built
});

// ✅ Good: Self-contained
test('user can transfer player', async ({ page }) => {
  await loginAs(page, 'e2e_test1@fantasykit.test', 'Test2026!!');
  // now do the transfer
});
```

### Use Page Objects for Complex Flows

```javascript
class LeagueHub {
  constructor(page, leagueId) {
    this.page = page;
    this.leagueId = leagueId;
  }
  async navigateTo(tab = 'leaderboard') {
    await this.page.goto(`/league/${this.leagueId}?tab=${tab}`);
  }
  async openAdminTab() { await this.navigateTo('admin'); }
}
```

---

## Related Documents

- [E2E_TEST_PLAYBOOK.md](E2E_TEST_PLAYBOOK.md) — Step-by-step test flows for all four game paths
- [../brand/admin-tab/LOGIC.md](../brand/admin-tab/LOGIC.md) — Admin panel behaviour spec
- [../architecture/DRAFT_SYSTEM_DESIGN.md](../architecture/DRAFT_SYSTEM_DESIGN.md) — Draft mechanics
- [../architecture/TRANSFER_WINDOW_SYSTEM.md](../architecture/TRANSFER_WINDOW_SYSTEM.md) — Transfer rules
- [../architecture/STARTING_XI_AND_BENCH.md](../architecture/STARTING_XI_AND_BENCH.md) — Lineup rules
- [../../CLAUDE.md](../../CLAUDE.md) — Development guidelines (includes E2E section)

---

Last Updated: **2026-06-01**
