# Testing Strategy — Forza Fantasy League

**Comprehensive approach to test automation, frameworks, and coverage for web + mobile.**

---

## Overview

This project uses **Playwright for end-to-end testing** with a two-tier execution model:

1. **CI-Enforced** — `platform.spec.js` (36 tests × 2 browsers, ~3 min) runs on every PR
2. **Integration** — 8 additional specs (auth, squad, transfer, league, live, auction, draft, scoring) run manually against live Supabase

**Unit tests are planned** (Vitest) but not yet implemented.

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
- League creation & H2H setup
- League standings & chat
- Live match updates & Joker chip selection

### Tier 2: Integration Tests (Manual)
**Files**: `e2e/tests/{auth,squad,transfer,league,live,auction,draft,scoring}.spec.js`  
**Scope**: Feature-specific user journeys with live Supabase queries  
**Trigger**: Developer runs locally or in dedicated test session  
**Duration**: 5–15 minutes each  
**Live Data Requirement**: These tests query production Supabase data; not suitable for automated CI

**Why Manual?**
- Tests depend on specific Supabase state (players, fixtures, leagues)
- Data changes during test execution affect other specs
- Requires human decision on test data setup/teardown
- No CI environment for isolated test database

### Tier 3: Unit Tests (Planned, Not Yet Implemented)
**Framework**: Vitest (lightweight, Vite-native)  
**Scope**: Hooks, utilities, pure functions  
**Trigger**: Developer runs locally + CI check  
**Target**: React hooks (useAuth, useSquad, useTransfer), formatters, validators

---

## Playwright Configuration

**File**: `playwright.config.js`

```javascript
// Key settings
use: {
  baseURL: 'http://localhost:5173',
  trace: 'on-first-retry',              // Capture trace on failure
  screenshot: 'only-on-failure',        // Save screenshot on failure
  video: 'retain-on-failure',           // Save video on failure
},

// Browsers for CI
projects: [
  { name: 'chromium' },
  { name: 'firefox' },
  // Safari omitted (flaky on CI, tested locally)
],

// CI-specific
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
- HTML Report: View with `npx playwright show-report`

---

## Running Tests Locally

### Single Spec (Recommended for Development)
```bash
# Run CI-enforced test
npx playwright test e2e/tests/platform.spec.js

# Run specific integration test
npx playwright test e2e/tests/squad.spec.js

# Run specific test by name
npx playwright test -g "user can build a valid 11-player squad"
```

### All Tests
```bash
# Run all Playwright tests (includes CI + integration specs)
npx playwright test

# Run with debug UI (step through each action)
npx playwright test --debug

# Run with headed browser (watch execution)
npx playwright test --headed
```

### View Test Report
```bash
# After tests complete
npx playwright show-report e2e-report/
```

---

## Test Data & Setup

### Isolation Strategy
- **No shared fixtures** — Each test must be independent
- **Demo league** — Use a fixed demo league (ID `demo-001`) for stable test data
- **Fallback data** — If Supabase unavailable, use `src/data/` JSON files

### Database Reset for Integration Tests
For manual integration spec runs, you may need to reset state:

```bash
# Reset a league (deletes all squads, bets, trades)
npx supabase db query --linked "DELETE FROM squads WHERE league_id = 'demo-001';"

# Reset a user's squad
npx supabase db query --linked "DELETE FROM squads WHERE user_id = 'test-user-123' AND league_id = 'demo-001';"

# Reseed demo data
npx supabase db query --linked < supabase/fixtures/demo-data.sql
```

---

## CI/CD Integration

### GitHub Actions Workflow
**File**: `.github/workflows/ci.yml`

Pipeline stages:
1. **Lint** — ESLint (must pass)
2. **Build** — Vite production build (must succeed)
3. **E2E Test** — `platform.spec.js` (36 tests × 2 browsers, must pass)

**Failure Behavior**:
- If lint fails → PR cannot be merged
- If build fails → PR cannot be merged
- If E2E fails → PR cannot be merged
- Artifacts preserved → PR author can download for debugging

**Local CI Simulation**:
```bash
npm run lint
npm run build
npx playwright test e2e/tests/platform.spec.js
```

---

## Known Test Issues & Limitations

| Issue | Scope | Workaround | Status |
|-------|-------|-----------|--------|
| Safari flaky in CI | platform.spec.js | Run locally only | Known limitation |
| E2E specs need Supabase | integration specs | Run manual, not CI | By design |
| No unit tests | utilities, hooks | Write when needed | Planned (Vitest) |
| Demo data drift | platform.spec.js | Reset yearly or after major schema changes | Managed |

---

## Best Practices for Writing Tests

### 1. **Test User Behavior, Not Implementation**
```javascript
// ❌ Bad: Testing internal state
expect(component.state.squadLoaded).toBe(true);

// ✅ Good: Testing observable behavior
await expect(page.locator('[data-testid="squad-formation"]')).toBeVisible();
```

### 2. **Use Data-Testid for Stable Selectors**
```javascript
// ❌ Bad: Brittle to CSS changes
page.click('.formation-display > div:nth-child(2)');

// ✅ Good: Intent-based selector
page.click('[data-testid="formation-defender-slot-1"]');
```

### 3. **Isolate Tests**
```javascript
// ❌ Bad: Depends on previous test state
test('user can transfer player', async ({ page }) => {
  // assumes squad already built from previous test
});

// ✅ Good: Self-contained setup
test('user can transfer player', async ({ page }) => {
  await loginAs(page, 'test-user@example.com');
  await buildDefaultSquad(page);
  // now transfer player
});
```

### 4. **Use Page Objects for Complex Flows**
```javascript
// ✅ Good: Encapsulate UI interactions
class SquadScreen {
  constructor(page) { this.page = page; }
  async navigateTo() { await this.page.goto('/squad'); }
  async addPlayer(name) { /* ... */ }
  async selectFormation(type) { /* ... */ }
}

test('user can build squad', async ({ page }) => {
  const squad = new SquadScreen(page);
  await squad.navigateTo();
  await squad.addPlayer('Salah');
});
```

---

## Coverage Goals & Roadmap

### Phase 1: CI-Enforced (✅ Complete)
- [x] platform.spec.js (36 tests, 2 browsers)
- [x] GitHub Actions pipeline
- [x] PR blocking on failure

### Phase 2: Integration Tests (🟡 In Progress)
- [x] auth.spec.js
- [x] squad.spec.js
- [x] transfer.spec.js
- [x] league.spec.js
- [x] live.spec.js
- [ ] auction.spec.js (draft in progress)
- [ ] draft.spec.js (draft in progress)
- [ ] scoring.spec.js (draft in progress)

### Phase 3: Unit Tests (📋 Planned)
- [ ] Vitest setup
- [ ] Hook tests (useAuth, useSquad, useTransfer)
- [ ] Utility function tests
- [ ] CI integration

### Phase 4: Performance Testing (📋 Future)
- [ ] Lighthouse CI integration
- [ ] Load testing (chat, live scores)
- [ ] Mobile performance (Capacitor)

---

## Debugging Test Failures

### Step 1: Reproduce Locally
```bash
npx playwright test --debug
# Playwright Inspector opens; step through failing test
```

### Step 2: Check Artifacts
```bash
# View failure trace, screenshot, video
npx playwright show-report e2e-report/
```

### Step 3: Log Page State
```javascript
// Temporary debug log
await page.evaluate(() => {
  console.log('Current URL:', window.location.href);
  console.log('Auth state:', window.__auth_state);
  console.log('DOM:', document.body.innerHTML.substring(0, 500));
});
```

### Step 4: Verify Test Data
```bash
# Check league state in CI failure
npx supabase db query --linked "SELECT * FROM squads WHERE league_id = 'demo-001' LIMIT 5;"
```

---

## Mobile Testing (Capacitor)

**Status**: Manual testing only (Playwright for web app)

### Test on Device
```bash
npm run build && npx cap sync
npx cap open ios    # Run in Xcode simulator or device
npx cap open android # Run in Android Studio emulator or device
```

### Visual Testing Checklist
- [ ] Formation displays correctly at 375px (mobile)
- [ ] Touch interactions responsive (no 300ms delay)
- [ ] Safe area respected (notch, home indicator)
- [ ] App resume/background handling (Capacitor lifecycle)

---

## Related Documents

- [../BACKLOG.md](../BACKLOG.md) — Known test gaps and E2E issues (see E2E-01, P2/P3)
- [README.md](README.md) — Test file index
- [../deployment/DRY_RUN_PREP_CHECKLIST.md](../deployment/DRY_RUN_PREP_CHECKLIST.md) — Pre-launch verification
- [../../CLAUDE.md](../../CLAUDE.md) — Development guidelines (includes E2E section)

---

Last Updated: 2026-05-28
