# E2E Test Suite — Forza Fantasy League

End-to-end tests powered by [Playwright](https://playwright.dev) and the real Supabase production database (read-only).

## Quick Start

```bash
npm install
npx playwright install              # one-time browser download
npx playwright test                 # run the whole suite
npx playwright test e2e/chat.spec.js  # run one file
npx playwright test --headed --debug  # interactive
npx playwright show-report           # view last HTML report
```

The dev server boots automatically on port `5174` with `VITE_AUTH_ENABLED=false`, so tests run against demo mode (no Supabase auth session required).

## Test Structure

```
e2e/
├── fixtures/                       # Deterministic test data
│   ├── managers.js                # 5 manager profiles (risk + budget)
│   ├── leagues.js                 # league scenarios (single + multi)
│   ├── squads.js                  # formation snapshots + rule constants
│   ├── matches.js                 # match scenarios + scoring rules
│   ├── api-mocks.js               # Forza API mock bodies + helpers
│   └── index.js                   # barrel export
├── helpers/                        # Reusable utilities
│   ├── auth-helpers.js            # skipOnboarding, loginAs, openSecondaryTab
│   ├── timing-helpers.js          # waitForContent, captureConsoleErrors, …
│   ├── league-helpers.js          # goToLeaguesPage, switchLeagueTab, …
│   ├── data-helpers.js            # Supabase queries (fixtures, players, bets)
│   └── index.js                   # barrel export
├── auctions.spec.js                # Auction mechanics + bid validation
├── betting.spec.js                 # Bet UI + data layer + edge cases
├── chat.spec.js                    # Single + multi-tab chat scenarios
├── draft-allocation.spec.js        # Squad builder + draft data layer
├── leagues-frontpage.spec.js       # /league overview rendering
├── live-activity.spec.js           # Live screen + Forza API mocking
├── multi-league.spec.js            # League isolation + concurrent tabs
├── draft-and-scoring.spec.js       # (existing) Draft+scoring smoke flow
├── features.spec.js                # (existing) Feature spot-checks
├── multi-league-and-bets.spec.js   # (existing) Phase 2 coverage
├── platform.spec.js                # (existing) Route smoke + nav
├── scoring.spec.js                 # (existing) Scoring with real data
└── supabase-helpers.js             # (existing) Direct Supabase client
```

## Authoring Tests

Use the helpers — they normalise wait behaviour, tour-flag setup, and error capture across the suite.

```js
import { test, expect } from '@playwright/test';
import {
  skipOnboarding,
  waitForContent,
  captureConsoleErrors,
  isVisibleWithin,
  openSecondaryTab,
  goToLeaguesPage,
  switchLeagueTab,
} from './helpers/index.js';

test('manager opens league chat from leagues overview', async ({ page }) => {
  const errors = captureConsoleErrors(page);
  await skipOnboarding(page);
  await goToLeaguesPage(page);
  await switchLeagueTab(page, /^chat$/i);
  expect(errors.getErrors()).toEqual([]);
});
```

### Naming Convention

Describe the user journey, not the feature:

- ❌ `test('chat works', …)`
- ✅ `test('manager joins league chat, misses messages while offline, sees full history on return', …)`

### Graceful Degradation

The app runs in demo mode without a real seeded league context. When a path is gated by data we don't have (e.g. empty league list), assert on the empty/error state rather than failing. Use `isVisibleWithin()` to fall back when an element isn't present.

## Multi-Tab Tests

Use `context.newPage()` (or `openSecondaryTab` from helpers) for two-tab scenarios:

```js
const secondary = await openSecondaryTab(context);
await secondary.goto('/league');
// … perform actions on both tabs …
await secondary.close();
```

## API Mocking

Forza Football API responses can be intercepted per-test:

```js
import { mockForzaEndpoint, forzaApiMocks } from './fixtures/index.js';

test('live screen handles a quiet match window', async ({ page }) => {
  await mockForzaEndpoint(page, '/live-scores', forzaApiMocks.liveScoresQuiet);
  await page.goto('/live');
});
```

## Data Layer Assertions

Some scenarios cannot be fully exercised through demo-mode UI. Verify them at the database layer instead:

```js
import { supabase } from './helpers/index.js';

test('bet_instances table is reachable', async () => {
  const { error } = await supabase.from('bet_instances').select('*').limit(1);
  expect(error?.code).not.toBe('42P01');  // table must exist
});
```

## CI

Pipeline: `.github/workflows/ci.yml` — runs lint + build + this suite. CI uses Node.js 24 LTS and gives Playwright 20 minutes (per Phase 3 #1).

Failures upload trace + screenshot artifacts; see `e2e-report/` locally and the `playwright-report` artifact on GitHub Actions.

## Common Failure Modes

| Symptom | Likely Cause | Fix |
|---|---|---|
| `Timeout waiting for networkidle` | Dev server didn't boot | Check `package.json#scripts.dev` and free port 5174 |
| `Cannot find module './helpers/index.js'` | New spec file in wrong location | Place spec files at `e2e/` root, not in subdirectories |
| Flaky chat tests | Realtime delivery delay | Increase `waitForRealtime` argument |
| Mock not intercepted | Wrong URL substring | Inspect actual requests in `e2e-report/trace.zip` |
