# Testing Framework & Strategy

Index and overview of all testing documentation for Forza Fantasy League.

---

## Test Architecture

The project uses a **three-tier testing strategy**:

| Tier | Tool | Scope | Trigger | Coverage |
|------|------|-------|---------|----------|
| **Unit** | Vitest (planned) | Functions, hooks, utilities | Local dev + PR check | Individual module logic |
| **Integration** | Playwright | User flows (auth, squad, league, chat, live) | Local dev + PR check | Multi-component interactions |
| **E2E** | Playwright (CI subset) | Full user journeys (login → squad → league → live) | CI auto-run | End-to-end critical paths |

---

## What to Read First

**For QA/Testing**:
1. [TESTING_STRATEGY.md](TESTING_STRATEGY.md) — How we approach testing, frameworks, and coverage goals
2. [../deployment/DRY_RUN_PREP_CHECKLIST.md](../deployment/DRY_RUN_PREP_CHECKLIST.md) — Pre-launch verification checklist

**For Developers**:
1. [TESTING_STRATEGY.md](TESTING_STRATEGY.md) — Running tests locally
2. [../deployment/DRY_RUN_PREP_CHECKLIST.md](../deployment/DRY_RUN_PREP_CHECKLIST.md) — CI/CD verification

**For CI/DevOps**:
1. [TESTING_STRATEGY.md](TESTING_STRATEGY.md) — Framework configuration
2. `.github/workflows/ci.yml` — Automated test execution

---

## Test Files Location

```
e2e/
├── tests/
│   ├── platform.spec.js      # CI-enforced: 36 tests × 2 browsers (~3 min)
│   ├── auth.spec.js          # Auth flows
│   ├── squad.spec.js         # Squad building
│   ├── transfer.spec.js      # Transfers & trades
│   ├── league.spec.js        # League creation & chat
│   ├── live.spec.js          # Live scoring & Joker chip
│   ├── auction.spec.js       # Auction bidding
│   ├── draft.spec.js         # Draft system
│   └── scoring.spec.js       # Points calculation
│
├── playwright.config.js      # Test runner config
└── (generated reports/)
```

---

## Current Test Status

### ✅ CI-Enforced
- **platform.spec.js** (36 tests × 2 browsers: Chromium + Firefox)
  - Runs on every PR merge
  - ~3 minutes total execution
  - Tests critical user flows: login, squad, league, live, chat
  - Must stay green to merge to main

### 🟡 Integration Tests (Manual)
- **auth.spec.js** — Login/signup/password recovery
- **squad.spec.js** — Formation building & validation
- **transfer.spec.js** — Buy/sell players, budget checks
- **league.spec.js** — League creation, standings, H2H
- **live.spec.js** — Match updates, Joker chip
- **auction.spec.js** — Auction bidding mechanics
- **draft.spec.js** — Draft lottery, reverse-order draft
- **scoring.spec.js** — Weekly points calculation

Run manually: `npx playwright test e2e/<spec>.spec.js`  
(These specs query live production data and are not suitable for automated CI)

### ❌ Unit Tests (Planned)
- Not yet implemented
- Target: Vitest (lightweight, Vite-native)
- Priority: Hooks (useAuth, useSquad, useTransfer) + utility functions

---

## Key Commands

```bash
# Run CI-enforced test (platform.spec.js)
npx playwright test e2e/tests/platform.spec.js

# Run all integration tests (requires live Supabase)
npx playwright test e2e/

# Run single test with UI debugging
npx playwright test e2e/tests/auth.spec.js --debug

# View HTML test report
npx playwright show-report e2e-report/

# Record new test (interactive mode)
npx playwright codegen http://localhost:5173
```

---

## Test Coverage Goals

| Component | Coverage | Status |
|-----------|----------|--------|
| Auth flows | 100% | ✅ Done (platform.spec) |
| Squad building | 100% | ✅ Done (squad.spec + platform.spec) |
| Transfers | 100% | ✅ Done (transfer.spec + platform.spec) |
| League creation | 90% | ✅ Done (league.spec + platform.spec) |
| Live scores | 80% | ✅ Done (live.spec + platform.spec) |
| Auction bidding | 70% | 🟡 In progress (auction.spec) |
| Draft system | 70% | 🟡 In progress (draft.spec) |
| Scoring logic | 60% | 🟡 In progress (scoring.spec) |

---

## Related Documents

- [TESTING_STRATEGY.md](TESTING_STRATEGY.md) — Detailed testing approach and frameworks
- [../BACKLOG.md](../BACKLOG.md) — Known test issues and gaps (see P2/P3 tiers)
- [../deployment/DRY_RUN_PREP_CHECKLIST.md](../deployment/DRY_RUN_PREP_CHECKLIST.md) — Pre-launch test verification
- [../.github/workflows/ci.yml](../../.github/workflows/ci.yml) — CI pipeline configuration

---

Last Updated: 2026-05-28
