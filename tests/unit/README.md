# Unit / Integration Test Harness (B2 — TEST-1)

**Purpose:** Regression tests for the core money/game-logic RPCs. Run against an ephemeral local Postgres — no production reads.

---

## Quick start

```bash
# 1. Start the local Postgres (defined in docker-compose.yml)
docker compose up -d db

# 2. Load the schema into the local DB
psql postgresql://postgres:postgres@localhost:5432/postgres < supabase/schema.sql

# 3. Seed test fixtures
psql postgresql://postgres:postgres@localhost:5432/postgres < tests/unit/seed.sql

# 4. Run the tests
npm run test:unit
```

Or, the single command wrapper:

```bash
npm run test:unit:local   # starts db, loads schema + seed, runs tests, stops db
```

---

## Architecture

```
tests/unit/
├── README.md          ← you are here
├── seed.sql           ← deterministic seed: 2 leagues, 4 squads, fixture set, bet, auction, coin wallet
├── helpers.js         ← DB connection wrapper + RPC call helpers (pg node client)
├── setup.js           ← schema load + seed runner (called by CI before tests)
│
├── transfer.test.js   ← execute_transfer_atomic — budget, club cap, window, penalty, initial-build latch
├── bet.test.js        ← resolve_bet — commissioner override, auto-resolve, re-aggregation
├── lineup.test.js     ← set_lineup — lock, fixture-status, point recompute
├── auction.test.js    ← place_bid / confirm_auction_win — escrow, budget at confirmation
└── coins.test.js      ← credit_coins / debit_coins_to_escrow / release_escrow — no cash-out path
```

---

## Design decisions

- **Node built-in test runner** (`node:test` + `node:assert`) — zero new dependencies.
- **`pg` client** (already a transitive dep via `@supabase/supabase-js`) — raw SQL calls to exercise real RPC/RLS semantics, not a mocked client.
- **Ephemeral DB** — each test file runs inside a transaction that is rolled back after the file completes, so tests are fully isolated and the seed state is restored between files.
- **`--test-concurrency=1`** — Node's test runner parallelizes across files by default. Because every file's transactions operate on the same fixed seed row IDs (e.g. `SQUAD_A`/`SQUAD_B`), two files updating those rows at the same time can deadlock (Postgres error `40P01`) even though each file is internally correct. Running files serially avoids this; it costs ~1.5s total, not worth trading for parallel speed.
- **No Supabase CLI required** — the docker-compose Postgres is vanilla `postgres:15-alpine`. Extensions that Supabase adds (pgcron, pg_net, auth schema) are either stubbed in `seed.sql` or skipped for tests that don't need them. SECURITY DEFINER functions that need `auth.uid()` are tested via a `SET LOCAL role` session variable set in `helpers.js`.
- **Why not Vitest/Jest?** This repo has no bundler config for tests. Node's built-in runner requires no config file, produces TAP-compatible output for CI, and doesn't interact with Vite's module resolution.

---

## CI integration

Tests run in `.github/workflows/ci.yml` as a `unit-tests` job parallel to the existing `security` and `lint` jobs, before `e2e`. Uses GitHub Actions `services: postgres` (no Docker Compose needed in CI — the Postgres service container is faster to start).

See the CI section in `ci.yml` for the full job definition added as part of this PR.

---

## Coverage targets (B2 plan)

| RPC | Happy path | Edge case |
|-----|-----------|-----------|
| `execute_transfer_atomic` | buy/sell success | over-budget, over-club-cap, window closed, over-round-limit, initial-build latch |
| `resolve_bet` | commissioner resolves | auto-resolve cron (auth=null), already-resolved guard, re-aggregation |
| `set_lineup` | swap success | lock (fixture live), deduction on subbing out scored player |
| `place_bid` / `confirm_auction_win` | bid success, confirm success | over-budget at confirm, duplicate guard |
| `credit_coins` / `debit_coins_to_escrow` / `release_escrow` | credit, escrow, release | no cash-out type possible (LEGAL-1 assertion) |
