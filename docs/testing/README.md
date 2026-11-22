# Testing docs and test files

The index for everything test-related. The approach itself (tiers, what each one proves, what CI runs) lives in [TESTING_STRATEGY.md](TESTING_STRATEGY.md); this page says where things are.

---

## The docs in this folder

| Doc | What it is |
|---|---|
| [TESTING_STRATEGY.md](TESTING_STRATEGY.md) | The current approach: component tests, Tiers 1 to 4, the CI job map, how to run each layer locally |
| [TENNIS_MODULE_TEST_PLAN.md](TENNIS_MODULE_TEST_PLAN.md) | Manual test plan for the tennis module (Player's Box, rosters, QF captain, ATP Finals) |
| [F1_MODULE_TEST_PLAN.md](F1_MODULE_TEST_PLAN.md) | Manual test plan for the F1 module (Paddock, race picks, season bets, scoring) |

Archived on 2026-11-22, kept as history: the June 2026 manual playbook and its session results, in [../archive/testing-2026-06/](../archive/testing-2026-06/). They describe screens that no longer exist.

---

## Where the tests are

| Folder | Runner | Command | What |
|---|---|---|---|
| `tests/components/` | Vitest, jsdom, React Testing Library | `npm run test:components` | React components and front-end helpers, no database. Config: `vitest.config.js` |
| `tests/unit/` | `node --test` | `npm run test:unit` | SQL functions and pure scoring/draft logic against a throwaway Postgres. Setup: `tests/unit/README.md` |
| `e2e/platform.spec.js` | Playwright | `npx playwright test e2e/platform.spec.js` | Every route renders in demo mode, desktop (1440×900) and phone (375×812). 59 tests × 2 = 118 |
| `e2e/*.spec.js` (the rest) | Playwright against a local Supabase | `npm run test:e2e:local` | Sign-in, RLS, multi-user and Edge Function flows on seeded data |
| `scripts/rehearse-schema.sh` | psql | `bash scripts/rehearse-schema.sh <migration.sql>` | Does a new migration apply on top of production's schema |
| `scripts/TEST_pilot_gate.js` | node | `node scripts/TEST_pilot_gate.js` | Six read-only health checks against production. Never in CI |

### The local full-stack specs (`npm run test:e2e:local`)

`scripts/e2e-local.mjs` runs `npx supabase start` (a no-op if the stack is already up), loads `supabase/schema.sql` and `supabase/seed.sql`, applies the migrations listed in its `PENDING_MIGRATIONS`, and runs Playwright with the local URL and keys.

| Spec | Area |
|---|---|
| `auth-screen.spec.js` | Sign-in form rendering and validation |
| `autofill-draft-classic.spec.js` | Auto-fill on a classic EPL league |
| `bet-lifecycle.spec.js` | League bet: create, answer, resolve, RLS on creation |
| `challenge-screen.spec.js` | Challenge screen smoke |
| `draft-allocation-e2e.spec.js` | Draft league from creation to allocation |
| `draft-and-scoring.spec.js` | Draft player list and scoring views |
| `draft-mode-complete.spec.js` | Draft lottery run as a commissioner |
| `f1-screens.spec.js` | F1 screens, race pick, Paddock join, `score-f1-race` |
| `features.spec.js` | Joker chip and other match-day features |
| `multi-league-and-bets.spec.js` | Switching leagues, bets per league |
| `p2p-challenge-lifecycle.spec.js` | Coin bet between two members: create, accept, declare, confirm |
| `scoring-pipeline.spec.js` | Seeded match events give the hand-worked points |
| `scoring.spec.js` | Live Centre structure |
| `settings-screen.spec.js` | Settings screen smoke |
| `tennis-screens.spec.js` | Tennis screens, roster, QF captain, Player's Box join, `score-tennis-tournament` |
| `trophy-cabinet-screen.spec.js` | Trophy Cabinet smoke |
| `wallet-screen.spec.js` | Wallet, and the mock coin purchase |

Helpers: `e2e/supabase-helpers.js` (clients and sign-in), `e2e/supabase-target.js` (refuses to run without an explicit target, so nothing hits production by default), `e2e/fixtures/` (older seed SQL and the My Team mock).

---

## Before you push

```bash
npm run lint
npm run test:components
npx playwright test e2e/platform.spec.js
npm run build          # the Rolldown TDZ check; see CLAUDE.md
```

CI runs all of these plus the unit tests, the schema rehearsal and the local full-stack specs on every PR. GitHub has no required checks on `main`; the rule is to merge only when every job is green.

---

## Related

- [TESTING_STRATEGY.md](TESTING_STRATEGY.md)
- [../deployment/DOCKER_LOCAL_DEV.md](../deployment/DOCKER_LOCAL_DEV.md) — Docker and Supabase CLI setup for the local stack
- [../../CLAUDE.md](../../CLAUDE.md) — test-before-push steps, DB approval rules
- [../../BACKLOG.md](../../BACKLOG.md) — open test gaps (CODE-4, TEST-P2P-1, DB-260)

Last Updated: 2026-11-22
