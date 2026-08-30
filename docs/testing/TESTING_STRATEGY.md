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

**Current coverage**: `auction.test.js`, `coins.test.js`, `lineup.test.js`, `transfer.test.js`, `bet.test.js`, `scoring-logic.test.js` — all football/EPL, all RPC-level or pure-JS logic — plus `admin.test.js` (added 2026-08-27), covering the `competition_admins` family (`set_competition_admin`/`remove_competition_admin`/`is_competition_admin`) that gates admin-only actions across all three sports (see [COMPETITION_MODEL.md](../architecture/COMPETITION_MODEL.md)): success, idempotency, and all 5 rejection paths (`UNAUTHENTICATED`, `NOT_OWNER`, `INVALID_TYPE`, `NOT_LINKED_TO_CIRCLE`, `TARGET_NOT_CIRCLE_MEMBER`). Required two new fixture rows in `tests/unit/seed.sql` (`circle_members`, `circle_leagues`) that the original seed never populated.

**Multi-sport Pass 1 (added 2026-08-27)** — closed the four zero-refactor/cheap gaps plus tennis (pulled forward at the user's request):
- `f1-scoring-logic.test.js` — `scoreRaceBet` (P1/P2/P3/DNF/team/special-category picks, all-correct bonus), extracted verbatim from `score-f1-race/index.ts` into `score-f1-race/scoring-logic.js` (pure move, no logic change).
- `tennis-scoring-logic.test.js` — `scorePlayer` (tier-based points + `dark_horse_insurance` floor), `rosterPlayerIds`, and the newly-extracted `scoreRoster` (all four ace-card branches + captain bonus), extracted into `score-tennis-tournament/scoring-logic.ts`. Unlike the F1 extraction, the per-roster scoring loop was previously inline in the `Deno.serve` handler — lifting it into `scoreRoster` was a genuine refactor, verified with a before/after manual trace against a seeded roster (17 pts, baseline case) in addition to the test suite.
- `snakeDraft.test.js` — `runSnakeDraft`/`normalisePosition`/`shuffleOrder` in `supabase/functions/_shared/snakeDraft.ts` (already an extracted pure module, shared by `run-wishlist-draft` and `run-draft-lottery`; needed only a test file, no extraction). Covers turn order (snake alternation), position caps, budget, club caps, and contested-player handling.
- `cup-elimination.test.js` — `eliminate_cup_club` (migration 06) and `sync_cup_eliminations` (migration 221) via the pg-client pattern: both early-return guards (no active clubs; no active club anywhere in the league has a future fixture), the matchday-completeness gate, clear win/loss, penalty-shootout-resolved draws, unresolved draws, and the self-heal reinstatement path.

**P2P challenge lifecycle + `submit_bet` (added 2026-08-28, tracked as `TEST-P2P-1` in BACKLOG.md)**:
- `p2p-challenges.test.js` (new) — full lifecycle coverage: `create_p2p_challenge` (both `gw_total` and `freeform` happy paths, plus every confirmed error code: `NOT_CIRCLE_MEMBER`, `OPPONENT_NOT_CIRCLE_MEMBER`, `STAKE_TOO_LOW`/`STAKE_TOO_HIGH`, `DUPLICATE_CHALLENGE`, `DAILY_LIMIT_REACHED`, `QUESTION_REQUIRED`/`QUESTION_TOO_LONG`, `INSUFFICIENT_BALANCE`), `accept_p2p_challenge`, `decline_p2p_challenge`/`cancel_p2p_challenge` (including a direct regression test asserting the challenger's balance is restored to exactly its pre-stake value — the migration-204/235 double-refund bug), `resolve_p2p_challenge` (win/loss payout math, a direct regression test that the tie path credits no extra coins — the migration-205/224 double-credit bug — plus `ADMIN_ONLY`/`CHALLENGE_NOT_ACCEPTED`/`MATCHDAY_NOT_SETTLED`), and the freeform `declare`/`confirm`/`dispute`/`arbitrate` chain (circle-owner-only arbitration, `CANNOT_CONFIRM_OWN_PROPOSAL`, `NOT_PARTICIPANT`). Writing the dispute/arbitrate tests surfaced a real, previously-unknown production bug — 6 of those tests were initially `.skip()`-marked citing it inline; see **`BUG-P2P-DISPUTE`** in BACKLOG.md (`dispute_freeform_result` inserted a `source_type` value into `clubhouse_notifications` that its own CHECK constraint rejected — every real dispute call had always thrown and rolled back in production; latent only because `p2p_challenges` had 0 prod rows so far). Fixed by migration `261_fix_p2p_dispute_notification_check.sql`; all 6 tests un-skipped and passing.
- `bet.test.js` extended with `submit_bet` coverage: happy path, re-submit (resets `is_correct`/`reward_awarded` to `NULL` even after a prior resolve), `UNAUTHORIZED` (squad-ownership check — the AUDIT-57-02 regression test), `BET_NOT_FOUND`, `BET_CLOSED`, `DEADLINE_PASSED`.

**Confirmed gap, still open**:
- Relaxation formula (`calculate_relaxation_state`/`apply_relaxation_state`, migration 07) — deliberately excluded from Pass 1 at the user's request; the feature itself may be retired. If it survives, this is a cheap zero-refactor addition (same shape as cup elimination) to pick up in a later pass.
- ATP Finals scoring (`score-atp-finals`) and `run-reverse-standings-draft` — both need a refactor first (no extracted pure function exists yet); scoped as "Pass 2" in BACKLOG.md, not dropped.
- Cron-context auto-resolvers not yet covered by `p2p-challenges.test.js`: `auto_resolve_p2p_challenges`, `expire_stale_challenges`, `admin_grant_coins`; also `void_bet`, `process_auction_deadlines`, `sweep_void_auction_confirmations`, `resolve_auction_listing`, `submit_trade_proposal`/`accept`/`reject` — see `TEST-P2P-1` in BACKLOG.md.

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

**Status (2026-08-28, CI wiring + 6-screen gap closed + BUG-DRAFT-SVC fixed)**: `npm run test:e2e:local` now also runs as a new, non-blocking `e2e-tier3` CI job (see CI Job Map below) in addition to on demand locally. The previously-permanent skip on the draft-lottery service-role scenarios (`BUG-DRAFT-SVC`) is fixed — those scenarios now actually execute instead of always skipping (see "BUG-DRAFT-SVC" below). 5 new smoke specs close the Wallet/Challenge/Trophy Cabinet/Settings/Auth coverage gap; Draft's own gap turned out to be `BUG-DRAFT-SVC` blocking the pre-existing `draft-mode-complete.spec.js`/`draft-allocation-e2e.spec.js` coverage, not a missing spec file. Exact current pass/skip counts are whatever the latest `npm run test:e2e:local` run reports locally or in the `e2e-tier3` CI job's artifact — see that job's log rather than relying on a number frozen in this doc. Step 4 of the build order (new coverage for F1/tennis, Wallet/Challenge/Trophy/Settings/Auth) is now **done**.

What actually landed:
- **`supabase/seed.sql`** — a committed synthetic dataset, loaded by `scripts/e2e-local.mjs` (not by `[db.seed]`/`db reset`, and not by migration replay — see next point): 2 deterministic `auth.users` accounts (`e2e_a@fantasykit.test` / `e2e_b@fantasykit.test`, password `E2ePass!99`, matching what `autofill-draft-classic.spec.js` already hardcoded — this made writing the missing `e2e-setup` Edge Function unnecessary), 1 circle with both users as members, a synthetic EPL + WC player pool sized for position-cap/budget logic to have real headroom, one finished EPL fixture with a hand-worked deterministic scoring scenario (`match_events`/`player_match_stats`, expected fantasy-point totals documented inline and asserted in `scoring-pipeline.spec.js`), a classic EPL league and a draft/`noduplicate` WC league, and a `matchday_deadlines` row for the scenario round.
- **`scripts/e2e-local.mjs`** (`npm run test:e2e:local`) — bootstraps the local stack from `supabase/schema.sql` directly (a full migration replay hits a real, uncaptured prod schema mismatch partway through — migration 09 declares a `uuid` FK against `players.id`, which is actually `text` — and CLAUDE.md's append-only migration rule means that can't just be patched), then loads `seed.sql` on top, reads the stack's local URL/anon key, and execs Playwright with both the Node-side (`SUPABASE_URL`/`SUPABASE_ANON_KEY`) and Vite-build-side (`VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`) env vars pointed at the local stack — the latter matters because without it, `playwright.config.js`'s `webServer` step (`npm run build && npm run preview`) falls back to `.env.local`, which points at **production**. `[db.migrations]`/`[db.seed]` are both left `disabled` in `supabase/config.toml` for exactly this reason — this script, not the CLI's own hooks, is what loads schema/seed data now.
- **All 3 previously hard-blocked specs rewritten** onto the seeded data: `autofill-draft-classic.spec.js` (dropped the nonexistent-`e2e-setup`-function dependency, signs in directly against the seeded accounts), `draft-allocation-e2e.spec.js` (hardcoded prod UUIDs swapped for seeded ones), `scoring-pipeline.spec.js` (hardcoded real-match assertions swapped for the seeded scenario's hand-worked expected values).
- **Demo-mode + RLS interaction, worth knowing for any future Tier 3 spec**: `AuthContext.jsx` in demo mode (`VITE_AUTH_ENABLED` unset/false, the default for local runs) freezes React's `user` at a fixed zero-UUID `DEMO_USER` and never restores a session — but `src/lib/supabase.js`'s client still auto-persists/sends whatever session sits in `localStorage`, independent of `AuthContext`. RLS policies keyed off `auth.uid()` (e.g. `is_circle_member()`) see that real injected session; the app's own client-side `.eq('user_id', user.id)` filters see the frozen `DEMO_USER` id. A demo-mode-driven UI spec touching per-user, RLS-gated data therefore needs **both**: a seeded row for `DEMO_USER`'s fixed id (satisfies the client-side filter) **and** an injected real session for some other seeded user with genuine access to the same row (satisfies RLS). Neither alone is sufficient — see `draft-allocation-e2e.spec.js`'s "league creation wizard shows Draft as an option" test for a worked example.
- **Local edge_runtime resource contention under full-suite concurrency**: running all specs across both Playwright projects (desktop-chrome + mobile-chrome) concurrently means both hammer the same single local `edge_runtime` Docker container. A spec making several sequential Edge Function round-trips (e.g. `autofill-draft-classic.spec.js`'s `apiFillSquad`, one call per player bought) can exceed the file's default 20s test timeout under that load even though each individual call is correct — fixed there with a per-test `test.setTimeout(45000)` rather than raising the file-wide default. The same fix was applied to `f1-screens.spec.js` and `tennis-screens.spec.js`'s admin/scoring tests, which each invoke a real Edge Function (`score-f1-race`/`score-tennis-tournament`) and assert `trophy_ledger` afterward.
- **F1/tennis UI coverage (2026-08-28)**: `e2e/f1-screens.spec.js` and `e2e/tennis-screens.spec.js` cover all 14 F1 + tennis screens with smoke assertions (navigate, seeded content renders, no crash), plus real click-driven interaction specs — race-pick submission, paddock join by invite code, tennis roster + QF-captain submission, player-box join by invite code — and admin/scoring specs that invoke the real `score-f1-race`/`score-tennis-tournament` Edge Functions against seeded data and assert both the scores table and an `event_win` row landing in `trophy_ledger`. Deliberately out of scope this pass (call these out explicitly, don't drop silently): the ATP Finals knockout phase (only group-stage smoke covered), and the F1 Season Bets "locked" placeholder view. `supabase/seed.sql` gained an F1 paddock + races (one upcoming/unlocked, one finished-unscored, one finished-and-scored) and a tennis player_box + tournaments (`roster_open`, `qf_captain_open`, `completed`, plus a group-stage-only `atp_finals`) to support this. A new migration, `260_fix_paddock_playerbox_members_rls_recursion.sql` (a `42P17` infinite-recursion fix in the `paddock_members`/`player_box_members` RLS policies, needed for the join-by-invite-code specs to pass), is wired into the local harness via `scripts/e2e-local.mjs`'s `PENDING_MIGRATIONS` allowlist — **not yet applied to production**, a normal reviewable migration file pending its own explicit apply approval.
- **`waitForURL` regex must not match its own starting URL**: a Tier 3 spec that clicks something and then does `page.waitForURL(/pattern/).catch(() => {})` to wait for navigation needs the regex to match *only* the destination URL. `tennis-screens.spec.js`'s player-box-join spec originally used `/\/tennis/`, which also matched its own starting `/tennis/box` URL — the wait resolved instantly instead of waiting for the real post-join navigation, letting the test assert on the DB before the `join_player_box_by_code` RPC had committed (a real, desktop-only flake, not a fluke — visible in a failure screenshot showing the join button still reading "Joining…"). Fixed by narrowing to `/\/tennis\?box=/`, matching only the true post-join URL. Worth checking on any future spec that reuses this `waitForURL(...).catch(() => {})` pattern.
- **Service-role env var scoping**: F1/tennis specs need a service-role client (via `E2E_LOCAL_SERVICE_ROLE_KEY`, set unconditionally by `scripts/e2e-local.mjs` since it's the ephemeral local stack's own key) to reset rows RLS restricts to admin/service-role writes (e.g. `trophy_ledger` has no client-writable policy), keeping cross-project reruns of the same admin-scoring specs idempotent against the one shared local DB. `draft-mode-complete.spec.js`/`draft-allocation-e2e.spec.js` now use this same env var name (previously gated behind a deliberately-different, always-unset `SUPABASE_SERVICE_ROLE_KEY`, which kept their service-role-invoking test bodies permanently skipped — see `BUG-DRAFT-SVC` below, fixed 2026-08-28). Both files now sign in as a real commissioner rather than invoking the function as a service-role caller (which it was never designed to accept), so un-skipping them surfaced real, passing coverage rather than the latent failures the old skip had been masking.

**Direct-bet creation → submission → resolution (added 2026-08-28)**: `e2e/bet-lifecycle.spec.js` — closes the gap where other specs' bet coverage was soft/conditional (click-if-visible). Signs in as the seeded `CLASSIC_LEAGUE` commissioner (`USER_A`, who is also the only user with a seeded squad there) and a non-commissioner member (`USER_B`) via real `signInWithPassword` sessions. Covers: (1) the negative case — `USER_B` attempting a raw `bet_instances` INSERT is rejected by the commissioner-only RLS policy (`"commissioner manages bet instances"`, `supabase/schema.sql`) with a `row-level security` error — this is genuinely a Tier 3-only check, since Tier 1's harness runs as the DB owner and bypasses RLS entirely; (2) the commissioner's INSERT succeeds and the new bet renders on `/league/{id}?tab=bets`; (3) `submit_bet` RPC records an answer that renders as "Your pick" in the UI; (4) `resolve_bet` awards points and the UI flips to "✓ Correct" / "+{reward} pts". Because `league_members.total_points` is fully recomputed (not incremented) by `aggregate_league_member_points()` on every resolve — and both Playwright projects share one un-reset-between-projects local DB — the points assertion reads a fresh baseline via that same RPC immediately before resolving rather than comparing against a hardcoded seed value, so it stays correct on repeated/cross-project runs.

**P2P live cycle + Stripe-free coin purchase (added 2026-08-28)**: `e2e/p2p-challenge-lifecycle.spec.js` — signs in as `USER_A`/`USER_B`, drives `create_p2p_challenge` (freeform) → `accept_p2p_challenge` → `declare_freeform_result` (push, no winner) → `confirm_freeform_result` through the real authenticated-client RLS/RPC-grant path, asserting escrow moves at each step. Deliberately exercises only the push (no-rake) path — see the file's own balance-isolation note — since Tier 1's `p2p-challenges.test.js` already owns win/loss payout-math coverage; this spec's job is proving the UI-facing plumbing, not re-deriving the math. Also covers `4.2 non-participant cannot confirm`. `e2e/wallet-screen.spec.js` gained `1.2 mock-payment purchase-coins credits coins with no Stripe configured` — signs in as `USER_A`, `fetch()`s `purchase-coins`'s `/create-payment-intent` endpoint directly (no UI), asserts the JSON response (`mock:true`, `coins_credited` matching the seeded `coin_packs` row, a `mock_`-prefixed `reference_id`) and that `get_my_wallet`'s balance increased by exactly that amount. Requires `supabase/functions/.env` (gitignored, local-only) setting `MOCK_PAYMENTS=true` — confirmed the installed CLI (2.116.0) picks this up cleanly on `npx supabase start`/`stop` (bind-mounts `supabase/functions/`, injects its `.env` into the `edge_runtime` container at creation), so no CLI-limitation fallback was needed. Because the file is gitignored, `.github/workflows/ci.yml`'s `e2e-tier3` job writes it fresh (`echo "MOCK_PAYMENTS=true" > supabase/functions/.env`) as a step before `npm run test:e2e:local` — a checked-out CI runner never has the developer's local copy, and without this step the test hits real Stripe with no key configured and times out (caught the hard way: it passed against a local stack that already had the file, then failed in CI on the first push). **Cross-project balance race, worth knowing for any future wallet-mutating spec**: `fullyParallel:false` does not stop `desktop-chrome` and `mobile-chrome` from running concurrently in separate workers — an early version of this test ran unrestricted on both projects and raced the same `coin_wallets` row (`+1000` observed instead of two independent `+500`s). Fixed by restricting the test to `desktop-chrome` only (`test.skip(testInfo.project.name !== 'desktop-chrome', ...)`) and reverting the balance via a service-role client afterward, mirroring `f1-screens.spec.js`'s existing idempotency-reset pattern — this also keeps test 1.1's hardcoded `/500/` balance assertion correct regardless of project run order.

**Still open** (tracked in BACKLOG.md):
- Realtime league chat, draft lottery/wishlist-draft timing (allocation math now covered at Tier 1 via `snakeDraft.test.js`, but `run-wishlist-draft`/`WishlistDraftScreen` as UI/orchestration are referenced in zero test files today), cron-driven scoring orchestration (only the *extracted pure logic* of `calculate-scores`/`score-f1-race`/`score-tennis-tournament` is unit-tested — the functions themselves, as HTTP-invoked orchestration, are not), notification delivery, ATP Finals knockout phase, F1 Season Bets locked view.
- **Auth screen** is smoke-only (form rendering + client-side validation, see `e2e/auth-screen.spec.js`) — a real `signInWithPassword` round-trip through the UI would need a second, dedicated `VITE_AUTH_ENABLED=true` build and is out of scope for now.
- `e2e-tier3`'s new CI job is deliberately **non-blocking** (not yet a required check on `main`) until its real-world timing/stability has been observed over a few runs — see CI Job Map below.

**Build order** (tracked in BACKLOG.md, landing as separate PRs):
1. ~~Expand `supabase/config.toml` with the sections needed for the full stack.~~ Done.
2. ~~Write one committed synthetic seed script covering all three sports.~~ Done (`supabase/seed.sql` — EPL + WC foundation, F1/tennis added in step 4 below).
3. ~~Retarget the 8 existing specs to the local stack by default.~~ Done.
4. ~~Add new specs for F1/tennis UI coverage.~~ Done (2026-08-28) — see above. Remaining confirmed gaps (Realtime chat, coins/P2P, draft-timing UI, cron orchestration, notification delivery) are still open, not part of this step.
5. ~~Wire `npm run test:e2e:local` into CI (`e2e-tier3` job, non-blocking).~~ Done.
6. ~~Close the Wallet/Challenge/Trophy Cabinet/Draft/Settings/Auth screen coverage gap.~~ Done — 5 new smoke specs (Draft's gap was `BUG-DRAFT-SVC` blocking pre-existing coverage, not a missing file — see below).
7. ~~Fix `BUG-DRAFT-SVC`.~~ Done (test-only fix, see below).

---

## Tier 4 — Live-Platform Verification

**Scope, deliberately narrow**: real Forza Football API data freshness/shape, real wall-clock cron timing (the 5-minute lineup-lock cron, draft lottery scheduling), post-deploy sanity after a Vercel/Edge Function release, and a final human/product review before a pilot or season kicks off.

**Never runs in CI.** Always targets production explicitly — same B-12-guard principle as Tier 3's specs: no silent default, target named every time.

**Formalized (2026-08-27)**: [`scripts/TEST_pilot_gate.js`](../../scripts/TEST_pilot_gate.js) replaces the ad hoc `TEST_QA_Manager` scratch checks (PR #854) with a committed, repeatable, 100%-read-only script — no query in it is anything but a `SELECT`, so it needs no migration/write approval to run. `node scripts/TEST_pilot_gate.js` runs 6 checks against production via `npx supabase db query --linked`: cron jobs with 3+ consecutive failures (FAIL-level — this is the only check that can fail the gate), cron jobs registered inactive, fixtures stuck `scheduled` well past kickoff (sync staleness), players missing a price, edge-function errors in the last 24h, and a same-day real-league count for pilot-data hygiene (informational only). Exit code 0 unless a FAIL-level check trips. First real run (2026-08-27) returned `GATE: PASS` — 1 PASS, 4 WARN, 1 INFO; the WARN findings (22 inactive cron jobs, 21 stale fixtures, 499 unpriced players, edge-function errors) line up with the site's deliberate post-cutover `MAINTENANCE_MODE=true` pause (see [CLAUDE.md](../../CLAUDE.md)) rather than indicating new defects — re-run this once the maintenance wall comes down, since a WARN that's expected today may mean something different then.

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
| `e2e-tier3` | 3 | every PR (`needs: [security, lint]`) | Runs `npm run test:e2e:local` end-to-end via `supabase/setup-cli@v1` + Playwright's `chrome` channel on a GH-hosted Ubuntu runner (Docker preinstalled). **Non-blocking/informational** — not yet added to `main`'s required-checks list, pending a few runs' worth of real-world timing/stability data. `timeout-minutes: 45`. See exact pass/skip/fail counts in the job's own log/artifact rather than a number frozen in this doc. |

**Local-only, not in CI**: `scripts/rehearse-schema.sh` (Tier 2, interactive), Tier 4 verification (`scripts/TEST_pilot_gate.js`, deliberately prod-only — never CI, per the tier's own scope). `npm run test:e2e:local` (Tier 3) now also runs in CI via `e2e-tier3` above, but remains available to run locally on demand too.

---

## Running Tests Locally

```bash
# Tier 1 — unit/RPC tests
docker compose up -d db
npm run test:unit

# Tier 2 — schema rehearsal (before writing/finishing a migration)
npx supabase start
bash scripts/rehearse-schema.sh supabase/migrations/XXX_new_migration.sql

# Tier 3 — local full-stack E2E (all gated specs, freshly reseeded each run)
npx supabase start   # if not already running
npm run test:e2e:local

# Tier 3 (today, pre-migration) — CI-enforced smoke test only
npx playwright test e2e/platform.spec.js

# Tier 4 — live-platform verification (explicit target required, never a default)
SUPABASE_URL=... SUPABASE_ANON_KEY=... npx playwright test e2e/<spec>.spec.js

# Tier 4 — pre-launch pilot gate (read-only, targets prod explicitly, no env needed)
node scripts/TEST_pilot_gate.js
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

Last Updated: **2026-08-28**
