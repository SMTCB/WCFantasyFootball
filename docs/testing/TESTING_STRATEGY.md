# Testing Strategy — Forza Fantasy League

**The authoritative, current testing approach across all layers — unit, schema, local full-stack, and live-platform.**

---

## Why this doc was rewritten (2026-08-27)

The previous version of this doc (dated 2026-06-01) had drifted from reality — it described a "planned, not yet implemented" unit-test tier that had actually existed since PR #694 (2026-07-01), referenced Playwright project names (`chromium`/`firefox`) and a port (5173) that no longer match `playwright.config.js` (`desktop-chrome`/`mobile-chrome`, port 5174), and did not mention Docker or `supabase start` at all. This version replaces it after a full audit of what actually runs where (CI job graph, `tests/unit/`, `e2e/*.spec.js`, `docker-compose.yml`, `supabase/config.toml`, `scripts/rehearse-schema.sh`).

**Guiding principle:** every gap in coverage on this platform has one root cause — most features require a real authenticated user, real RLS, or real Realtime, and until now the only place that existed was production. That's not a testing-discipline failure so much as a missing tier. This doc defines that tier (Tier 3 below) alongside the three that already exist, and is explicit about what each tier does and does **not** cover, so nothing gets tested twice and nothing falls through the cracks between tiers.

---

## The Four Tiers

| Tier | What it tests | Where it runs | Trigger |
|---|---|---|---|
| **1 — Unit / RPC** | Pure SQL-function and calculation logic | Ephemeral Postgres (GitHub Actions service container or local Docker) | Every PR (CI-required) |
| **2 — Schema Rehearsal** | Does a migration apply cleanly against prod's real schema? | Ephemeral Postgres, loaded from `supabase/schema.sql` | Every PR that touches `supabase/migrations/**` (CI-required); ad hoc locally before writing a migration |
| **3 — Local Full-Stack E2E** | Auth, RLS, Realtime, multi-user flows, UI, Edge Function orchestration | `npx supabase start` (full local Supabase: Postgres + GoTrue + PostgREST + Realtime + Edge Runtime) | CI (see rollout plan below) + on demand locally |
| **4 — Live-Platform Verification** | Things that cannot be faked locally: real Forza API data, real wall-clock cron, post-deploy sanity | Production Supabase, explicitly targeted | Manual, pre-launch / pre-pilot gate only — never CI |

Each tier is scoped so it never re-proves what an earlier tier already covers:

- **Tier 3 does not re-test Tier 1's math.** If `transfer.test.js` already proves `execute_transfer_atomic`'s budget arithmetic at the RPC level, a Tier 3 spec exercising the transfer UI should assert the UI reflects the result correctly — not re-derive the arithmetic itself.
- **Tier 2 only checks "does this migration apply."** It does not assert anything about application behavior — that's Tier 1 (for the RPCs the migration adds) and Tier 3 (for the UI/Auth paths that depend on it).
- **Tier 4 is intentionally the smallest tier.** Anything that *can* be verified locally with real (seeded) data belongs in Tier 3 instead — Tier 4 exists only for real external-API freshness and real time-based cron behavior, and as a final pre-launch human sanity check.

---

## Tier 1 — Unit / RPC Tests

**Location**: `tests/unit/*.test.js` · **Runner**: `node --test` (`npm run test:unit`) · **CI job**: `unit-tests`

Real `pg` client against a real (but empty-then-seeded) Postgres — not mocked. In CI this is a native GitHub Actions `services: postgres` container; locally, `docker compose up -d db`. Schema comes from `supabase/schema.sql` (a verified snapshot of prod, not a from-scratch migration replay — see Tier 2 below for why that distinction matters), loaded via `tests/unit/bootstrap.sql` then `tests/unit/seed.sql`.

**Current coverage**: `auction.test.js`, `coins.test.js`, `lineup.test.js`, `transfer.test.js`, `bet.test.js`, `scoring-logic.test.js` — all football/EPL, all RPC-level or pure-JS logic.

**Confirmed gap, to close here (not in a heavier tier, since this is pure logic)**:
- F1 scoring logic (`score-f1-race`'s extracted pure-calculation path) — zero coverage today.
- Tennis scoring logic (`score-tennis-tournament`) — zero coverage today.
- Admin RPCs gated by `competition_admins` — zero coverage today.

**What belongs here**: anything expressible as "given this DB state, call this RPC/function, assert this result" with no Auth session, no HTTP layer, no Realtime, no browser involved.

---

## Tier 2 — Schema Rehearsal

**Script**: `scripts/rehearse-schema.sh` · **CI job**: `schema-rehearsal` (new, gated on `supabase/migrations/**` changes)

Loads `supabase/schema.sql` — a `pg_dump` snapshot of prod's *actual* live schema — into a clean Postgres, then applies the migration file(s) under test on top. This deliberately does **not** replay `supabase/migrations/*.sql` from scratch: a full structural diff on 2026-08-01 found that a from-scratch replay does not reproduce prod (75 of ~271 migration files fail to apply cleanly, because at least one prod schema fix was applied directly and never captured as a committed migration file — full detail in [DOCKER_LOCAL_DEV.md](../deployment/DOCKER_LOCAL_DEV.md#schema-rehearsal-workflow)). `schema.sql` is the trustworthy baseline; migration replay is not.

**Two entry points, not duplicates of each other**:
- **CI** (`schema-rehearsal` job in `ci.yml`): auto-detects which files under `supabase/migrations/` changed in the PR, applies each on top of `schema.sql` with `ON_ERROR_STOP=1`. Fails the PR if any changed migration doesn't apply cleanly. No human has to remember to run this.
- **Local** (`bash scripts/rehearse-schema.sh [path/to/migration.sql]`): same underlying check, but against a full `npx supabase start` stack — meaning you can also *serve and exercise* the Edge Function(s) that depend on the new schema afterward, which CI can't do in this tier. Use this while you're still writing a migration, before it's even a PR.

---

## Tier 3 — Local Full-Stack E2E (the tier that closes the real gap)

**Target**: `npx supabase start` — the Supabase CLI's full local Docker stack (Postgres + GoTrue Auth + PostgREST + Realtime + Storage + Edge Runtime + Studio). This is distinct from the hand-rolled `docker-compose.yml` in this repo, which only ever provided bare Postgres + a single-function Edge runner — it was never a substitute for Auth/RLS/Realtime, and was never meant to be.

**Why this tier didn't exist until now**: `supabase/config.toml` currently only declares `[functions.*]` entrypoints — no `[db]`/`[api]`/`[auth]`/`[studio]`/`[realtime]` sections — so `supabase start` has never been fully wired up for this project. That is the single missing piece blocking every feature that needs a real authenticated, RLS-scoped, multi-user session from being tested anywhere but production.

**What moves here**:
- The 8 Playwright specs currently gated behind `e2e/supabase-target.js`'s "explicit target required, no default, live-prod-capable" guard (added after incident B-12, 2026-07-25) — `classic`/`draft`-mode specs, `scoring-pipeline.spec.js`, `draft-allocation-e2e.spec.js`, `multi-league-and-bets.spec.js`, `features.spec.js`, `autofill-draft-classic.spec.js`. These **move**, not copy, from "manual-only against live prod" to "run against the local stack by default." The B-12 guard itself stays exactly as-is — it's still correct that these specs must never silently default to prod; the fix is giving them a safe default target to use instead.
- All new coverage for the confirmed zero-coverage feature areas: **F1** (zero coverage of any kind today — no unit tests, no e2e specs reference it), **tennis** (same), Realtime league chat, `resolve_bet` write-in UI flow (RPC-level already covered by Tier 1; the UI flow is not), coins/P2P beyond the RPC layer (`purchase-coins` function itself is untested), draft lottery/wishlist-draft timing (`run-wishlist-draft`/`WishlistDraftScreen` are referenced in zero test files today), cron-driven scoring orchestration (only the *extracted pure logic* of `calculate-scores`/`score-f1-race`/`score-tennis-tournament` is unit-tested — the functions themselves, as HTTP-invoked orchestration, are not), `trophy_ledger` emission, notification delivery.

**Build order** (tracked in BACKLOG.md, landing as separate PRs):
1. Expand `supabase/config.toml` with the sections needed for the full stack.
2. Write one committed synthetic seed script covering all three sports (`TEST_`-prefixed users/circles/leagues — enough real structure to exercise Auth + RLS + multi-user flows without needing live Forza API data for setup).
3. Retarget the 8 existing specs to the local stack by default; wire a CI job for this tier once proven stable locally.
4. Add new specs for each confirmed gap above.

---

## Tier 4 — Live-Platform Verification

**Scope, deliberately narrow**: real Forza Football API data freshness/shape, real wall-clock cron timing (the 5-minute lineup-lock cron, draft lottery scheduling), post-deploy sanity after a Vercel/Edge Function release, and a final human/product review before a pilot or season kicks off.

**Never runs in CI.** Always targets production explicitly — same B-12-guard principle as Tier 3's specs: no silent default, target named every time.

**Formalization (open item)**: this session's manual verification pass used an ad hoc `TEST_QA_Manager` account and scratch scripts that live only in a session scratchpad and vanish afterward. That should become a committed, repo-tracked script (`TEST_`-prefixed per the Pilot Safeguards in [CLAUDE.md](../../CLAUDE.md)) that any session can re-run identically as a pre-launch gate, instead of being reinvented each time.

---

## What Runs Where — CI Job Map

**File**: `.github/workflows/ci.yml`

| Job | Tier | Trigger | Notes |
|---|---|---|---|
| `security` | — | every PR | npm audit, circular-import (Rolldown TDZ) check, UTF-8 check, Edge Function drift check |
| `lint` | — | every PR | ESLint |
| `build` | — | every PR | Vite production build, uploads `dist/` |
| `unit-tests` | 1 | every PR | Ephemeral Postgres, `tests/unit/*.test.js` |
| `schema-rehearsal` | 2 | every PR touching `supabase/migrations/**` | Skips (fast no-op) on PRs that don't touch migrations |
| `e2e` | — | every PR | `platform.spec.js` only — demo mode (`VITE_AUTH_ENABLED=false`), no real Supabase target, not part of the tier system above since it makes no DB calls |
| *(planned)* Tier 3 job | 3 | see Build order above | Not yet wired into CI — lands once the local stack + retargeted specs are proven stable |

**Local-only, not in CI**: `scripts/rehearse-schema.sh` (Tier 2, interactive), the 8 currently-manual specs (Tier 3, until retargeted), Tier 4 verification.

---

## Running Tests Locally

```bash
# Tier 1 — unit/RPC tests
docker compose up -d db
npm run test:unit

# Tier 2 — schema rehearsal (before writing/finishing a migration)
npx supabase start
bash scripts/rehearse-schema.sh supabase/migrations/XXX_new_migration.sql

# Tier 3 — local full-stack E2E (once config.toml/seed script land — see Build order)
npx supabase start
npx playwright test e2e/<spec>.spec.js

# Tier 3 (today, pre-migration) — CI-enforced smoke test only
npx playwright test e2e/platform.spec.js

# Tier 4 — live-platform verification (explicit target required, never a default)
SUPABASE_URL=... SUPABASE_ANON_KEY=... npx playwright test e2e/<spec>.spec.js
```

---

## Non-Negotiable Testing Principles

Carried forward unchanged from the previous version of this doc — these apply regardless of tier:

1. **Real data over synthetic, wherever a tier has access to it.** Tier 1/2 use minimal fixture data by necessity (no Auth layer to seed through). Tier 3's seed script should mirror real shapes (real formation rules, real scoring fields) even though the specific players/circles are synthetic and `TEST_`-prefixed. Tier 4 uses only real production data.
2. **Player price exception**: the Forza API doesn't provide prices. Where `price IS NULL`, seed before any budget-dependent test — see the query in [E2E_TEST_PLAYBOOK.md](E2E_TEST_PLAYBOOK.md).
3. **All test leagues/users must be `TEST_`-prefixed** (Pilot Safeguards, [CLAUDE.md](../../CLAUDE.md)) — applies to Tier 3 and Tier 4 alike.
4. **Mode × format coverage**: Classic vs Draft, League vs Cup are two independent axes that change behavior (Market blocking, Admin panels, season stepper stages, FrontPage columns). Any new Tier 3 spec touching one of these areas should state which combination(s) it covers.

---

## Related Documents

- [DOCKER_LOCAL_DEV.md](../deployment/DOCKER_LOCAL_DEV.md) — Docker/Supabase CLI setup paths, schema rehearsal detail
- [E2E_TEST_PLAYBOOK.md](E2E_TEST_PLAYBOOK.md) — Step-by-step flows for the existing mode × format specs
- [../architecture/DRAFT_SYSTEM_DESIGN.md](../architecture/DRAFT_SYSTEM_DESIGN.md) — Draft mechanics
- [../../BACKLOG.md](../../BACKLOG.md) — Tracked build-order items for Tier 3 rollout
- [../../CLAUDE.md](../../CLAUDE.md) — Pilot Safeguards, migration/DB-write approval rules

---

Last Updated: **2026-08-27**
