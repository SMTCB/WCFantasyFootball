# Forza Fantasy League — Technical Documentation

**Complete technical reference for the multi-sport fantasy gaming platform.**

*This document is the detailed companion to the [Technical Overview](TECH_OVERVIEW.md). It is written for an engineering audience evaluating, operating, or extending the platform. It reflects the verified state of branch `v2` at HEAD `2f9aad6` (2026-06-30). The prior 2026-06-26 edition is archived at [docs/archive/superseded-dd-2026-06-30/TECH_DOCUMENTATION.md](../../archive/superseded-dd-2026-06-30/TECH_DOCUMENTATION.md).*

---

## Table of contents

1. Introduction & product scope
2. System architecture
3. Frontend application
4. Backend (Supabase)
5. Data model & key entities
6. Core domain systems
7. The live data & scoring pipeline
8. Edge Functions reference
9. The provider-adapter seam (multi-provider readiness)
10. The multi-sport / Clubhouse model
11. Security model
12. External dependencies
13. Mobile (Capacitor)
14. Build, containerization, CI/CD & deployment
15. Environments & configuration
16. Testing
17. Observability & operations
18. Repository structure
19. Known limitations & hardening roadmap
20. Glossary

---

## 1. Introduction & product scope

Forza Fantasy League is a fantasy-sports platform delivering private-league competition across multiple sports, with a shared social layer ("Clubhouse"). Users build squads, compete on live real-world scoring, and engage through chat, an AI newspaper, trading/auctions, prediction bets, and a virtual-coin economy. It launched as a football game and is now a **clubhouse-centric multi-sport platform**.

**Sports & game modes**

- **Football** — squad of 15 (11 starters + bench), formation rules, captain, transfers, live scoring. League formats: Classic, Draft, Head-to-Head, Cup (knockout). *This is the live pilot (~50 users on `main`).*
- **Formula 1** — "paddocks" (leagues), race-by-race prediction scoring, season bets. *Built on `v2`; 7 screens, OpenF1 provider.*
- **Tennis** — "player boxes" (leagues), tier-based tournament rosters, Ace-card power-ups, an ATP Finals pick'em. *Built on `v2`; 7 screens, RapidAPI/manual provider.*

**Engagement layer (cross-sport)** — Clubhouse (a "circle" that spans sports), cross-league feed, AI-generated daily newspaper ("The FrontRow"), trading/auctions, commissioner-run prediction bets, trophy cabinet, P2P virtual-coin wallet with Stripe top-ups and challenge betting.

> **Pilot vs. platform.** The football product is live in production on `main`. F1, Tennis, the Clubhouse social layer, and the P2P coin economy are **built and routed on the `v2` branch**, which is not yet deployed (Week-12 merge gate). "Built" here means schema + RPCs + Edge Functions + UI screens all exist and are wired; it does not mean live with users.

---

## 2. System architecture

### 2.1 High-level shape

A **client → Supabase** architecture. There is no separate bespoke application server; backend logic lives in (a) PostgreSQL functions invoked as RPCs and (b) Supabase Edge Functions (Deno). The React client talks to Supabase over HTTPS and WebSocket (Realtime).

```
   React 19 SPA  ──┐                         ┌── Forza Football API (football)
   (Vercel)        │                         │
                   ├──► Supabase ────────────┼── OpenF1 (F1) · RapidAPI (tennis)
   iOS / Android   │   • PostgreSQL + RLS     │
   (Capacitor)   ──┘   • Auth                 ├── Groq (LLM — AI newspaper)
                       • Edge Functions       │
                       • Realtime             └── Stripe (coin purchases)
                       • pg_cron
```

### 2.2 Design principles

- **Server-authoritative money & points.** Anything affecting budget, points, coins, or league outcomes is computed server-side (RPC or Edge Function), never trusted from the client.
- **Row-Level Security everywhere on user data**, scoped to `auth.uid()`.
- **Idempotent pipelines.** Scoring and sync jobs are safe to re-run; results converge.
- **Append-only auditability.** Squad mutations, round snapshots, and ledger entries are recorded for recovery and dispute resolution.
- **Additive, pilot-safe migrations.** New capability is added with nullable columns / new tables, never breaking existing live queries (the multi-sport seams in migrations 187–189 are textbook examples).

---

## 3. Frontend application

| Aspect | Detail |
|--------|--------|
| Framework | React 19 (functional components + hooks) |
| Build tool | Vite 8 (Rolldown — Rust-based bundler) |
| Styling | Tailwind CSS 4 + a CSS-variable design-token system ("Kit Light") + inline styles for dynamic values |
| Routing | React Router 7 (hash-compatible for Capacitor); **27 route-level screens lazy-loaded via `React.lazy` + `Suspense`** |
| State | React Context (`AuthContext`, `SportContext`, `ClubhouseProvider`, `ClubhouseNotifProvider`) + per-feature hooks; data fetched directly via the Supabase client |
| Real-time | Supabase Realtime subscriptions (chat, live scores) |
| Active competition | `useActiveCompetition()` derives `{sport, competitionId}` from the URL path alone (no global sport state) |

**Structure** — `src/screens/` (route views + `f1/` and `tennis/` subtrees, admin, social), `src/components/` (reusable UI; `components/league/` holds the larger league sub-views; `components/competition/` holds the shared multi-sport `CompetitionResultsHeader`), `src/hooks/` (feature logic + `f1/` and `tennis/` subtrees), `src/lib/` (Supabase client, Capacitor init, payments, helpers), `src/context/` (global providers).

**Resilience** — each route is wrapped in an `ErrorBoundary` with a client-side crash reporter. `@sentry/react` is integrated in `src/main.jsx` (guarded by `VITE_SENTRY_DSN` — see §17 for activation status).

> **Bundler note (institutional knowledge):** Vite 8/Rolldown is strict about module evaluation order; a "Cannot access 'X' before initialization" (TDZ) crash class has occurred when the same module is imported at two depths. This is now guarded by (a) `madge --circular` in CI and (b) the 27-screen `React.lazy` split (dynamic imports leave the static module graph). Documented in CLAUDE.md.

---

## 4. Backend (Supabase)

| Capability | Usage |
|------------|-------|
| **PostgreSQL** | All persistent data; business logic in SQL functions (RPCs) |
| **Auth** | Email/password (OAuth-ready); JWT sessions |
| **Edge Functions** | Deno/TypeScript serverless functions for scoring, syncs, payments, AI generation |
| **Realtime** | LISTEN/NOTIFY → WebSocket for chat & live updates |
| **pg_cron** | Scheduled jobs: fixture/player sync, live ingest, scoring passes, bet/auction resolution |
| **Row-Level Security** | Per-user data isolation enforced at the database layer |

**Business logic in the database.** Critical operations are `SECURITY DEFINER` functions running with owner privileges in a controlled, audited way: `execute_transfer_atomic`, `set_lineup`, `set_captain`, `place_bid`, `confirm_auction_win`, `accept_trade_proposal`, `resolve_bet`, `claim_draft_player`, `credit_coins`/`debit_coins_to_escrow`/`release_escrow`, plus the multi-sport additions `create_circle`/`join_circle_by_code`/`get_circle_feed`/`get_circle_meta_standings`.

---

## 5. Data model & key entities

The schema is defined by **243 migration files** (see §14 for the reproducibility caveat). Principal tables:

**Identity, sport & social containers**
- `users` — profile + flags (incl. `is_admin`, guarded by a trigger — §11).
- `sports` — `(slug, name, game_model, provider)` for football/f1/tennis (migration 187).
- `circles`, `circle_members`, `circle_leagues` — the "Clubhouse": a named group that links leagues across sports (migration 188).
- `trophy_ledger` — append-only cross-sport trophy record + `get_circle_meta_standings()` (migration 189). *Note: table & RPC exist; no module emits trophies yet — see §10 and DD item ARCH-1.*

**Leagues & squads**
- `leagues`, `league_members`, `league_config` — definitions, membership/roles, per-league settings (caps, transfer rules, scoring weights, H2H points). `leagues.circle_id` links a league to a Clubhouse (nullable today; migration 217 to enforce NOT NULL, gated on pilot end).
- `squads` — `players`, `starting_xi`, `captain_id`, `budget_remaining`, `round_transfers`, `lineup_locks`, `initial_build_complete` (column-guarded — §11).
- `draft_submissions`, `draft_allocations`, `knockout_keep_submissions`, `transfer_windows`.

**Fixtures & scoring**
- `tournaments` — the competition spine. `forza_id text UNIQUE NOT NULL` is the join key for football; migration 187 added nullable `sport_id`/`provider`. *(A `provider_key` rename to fully de-couple from Forza is designed, not yet built — DD item ARCH-2.)*
- `fixtures`, `match_events`, `player_match_stats`; `scoring_rules`, `matchday_deadlines`, `club_cap_rules`; `fantasy_points` per `(squad_id, matchday_id)`.

**Competition & social**
- `h2h_schedule`, `gazette_entries` (activity & news), `bet_instances`/`bet_submissions`, `auction_listings`, `trade_proposals`.
- `frontpage_editions`/`frontpage_reactions`/`frontpage_comments` — AI newspaper (membership-scoped RLS).

**Money (P2P)**
- `coin_wallets` (guard trigger), `coin_transactions` (audited ledger; type CHECK with **no cash-out type**), `coin_packs`, challenge/escrow tables (migrations 202–209).

**Multi-sport modules**
- F1: `f1_paddocks`, `f1_races`, `f1_scores`, `f1_year_results`, `f1_bets_race`, `f1_bets_year` (migration 191).
- Tennis: `player_boxes`, `tennis_tournaments`, `tennis_rosters`, `tennis_tournament_players`, `tennis_ace_cards`, `tennis_atp_finals_*` (migrations 197–201).

**Audit & recovery**
- `squad_events` (append-only mutation log), `round_backups` (per-round full snapshot), `squad_matchday_snapshots` (XI at round start), `edge_function_error_log`.

---

## 6. Core domain systems

### 6.1 Scoring engine (`calculate-scores`)
Converts `player_match_stats` into fantasy points using position-specific `scoring_rules` (config-driven). Per-90/per-60 minute scaling, clean-sheet gates, captain multipliers, **auto-substitutions** (a non-playing starter is replaced by the highest-priority bench player who played, keeping the formation valid), and captain reassignment to a scoring starter. Writes integer totals to `fantasy_points`, keyed `(squad_id, matchday_id)`. **Idempotent** per fixture; guarded against re-scoring a settled round. Handles penalty-shootout scoring (PR #678–#680) and knockout-round duplicate-fixture edge cases.

### 6.2 Squad & transfer engine (`execute_transfer_atomic`)
Atomic, server-side, advisory-locked. Enforces budget, squad size (15), position caps, round-aware club caps, and the transfer window. Buys count toward the per-round limit; sells are free; over-limit buys are allowed but recorded as point penalties. A one-way `initial_build_complete` latch exempts the initial build and pre-competition period.

### 6.3 Lineup & captain (`set_lineup`, `set_captain`)
Atomic swaps with per-player fixture-status locking (can't pull a player after their match starts) and live mid-round point recomputation. Captaincy cannot be reassigned to a player whose fixture has started.

### 6.4 Draft system
Lottery (`run-draft-lottery`) and reverse-standings (`run-reverse-standings-draft`) modes; wishlists; club-cap enforcement during allocation; knockout-phase "keep" pre-allocation; late-joiner recovery. Picks go through `claim_draft_player` (advisory-locked, no double-claims).

### 6.5 Trading & auctions
`submit_trade_proposal`/`accept_trade_proposal` (same-position validation, window check, points-sweetener transfer, gazette entry). Auctions are two-phase: a listing resolves to `pending_confirmation` on deadline; the winner confirms during an open window (`confirm_auction_win`) with budget/slot/duplicate checks at confirmation.

### 6.6 Betting (`resolve_bet`, `resolve-bets`)
Commissioner-created prediction bets. Commissioners can resolve any time; an auto-resolve cron handles deadline-passed bets; commissioner override re-aggregates prior winners (PR #672). Winning "points" bets immediately re-aggregate league totals.

### 6.7 Coin wallet & P2P (`credit_coins`, `debit_coins_to_escrow`, `release_escrow`)
`coin_wallets` + audited `coin_transactions` ledger with escrow and a challenge lifecycle (migrations 202–207). Top-ups via Stripe (`purchase-coins`): server-side price lookup, JWT-derived user, webhook-verified fulfilment, DB-idempotent on `reference_id` (UNIQUE, migration 211), coins denominated `FRC`. **No cash-out path exists** (one-way: money → coins → game outcomes → coins). Mutating coin RPCs are revoked from client roles; the wallet table is guard-triggered. Frontend: `useWallet`, `src/lib/payments.js`, `WalletScreen`, `ChallengeScreen`.

### 6.8 AI newspaper (`generate-frontpage-edition`)
A daily per-league/per-circle "front page" generated by a Groq LLM from standings, transfers, chat, fixtures, and gazette entries. Members react (emoji) and comment ("letters to the editor"). Commissioners post special editions and pin a quote.

### 6.9 Multi-sport modules
- **F1** — paddocks, race/season prediction scoring (`score-f1-race`), standings. OpenF1 provider.
- **Tennis** — player boxes, tier-based tournament scoring (`score-tennis-tournament`), Ace-card power-ups, Masters drop rule on the leaderboard, ATP Finals 15-match pick'em (`score-atp-finals`). RapidAPI/manual provider.

### 6.10 Clubhouse / circle layer
A `circle` is a cross-sport social container above the league. `create_circle`/`join_circle_by_code` manage membership; `get_circle_feed` returns the cross-league activity feed; `get_circle_meta_standings` ranks members by trophy count (the trophy emission is not yet wired — §10). The app is **clubhouse-centric**: `/` redirects to `/clubhouse`; competitions are tabs within a Clubhouse.

---

## 7. The live data & scoring pipeline

| Stage | Job(s) | Cadence |
|-------|--------|---------|
| **Sync fixtures/players** | `sync-fixtures`, `sync-players`, `sync-player-status` (football); `sync-tennis-players` (admin) | every 30 min (football) |
| **Flip to live** | `flip-fixtures-live` | every 2 min |
| **Ingest events** | `ingest-match-events` | every ~5 min while live (+ a final post-whistle pass) |
| **Score (live)** | `calculate-scores` (live mode) | every 2 min for live fixtures |
| **Score (post-match / late)** | `calculate-scores` | daily 24h window / nightly 3h window |
| **Settle** | round-complete branch of `calculate-scores` | when all round fixtures finish |
| **Resolve bets / auctions** | `resolve-bets`, auction sweep | hourly / every 5 min |

**Round settlement** writes the activity feed, resolves head-to-head results, applies auto-subs and transfer penalties, and stores a `round_backups` snapshot — gated on every fixture in the round being finished (multi-day rounds handled correctly).

**Resilience** — idempotent upserts + overlapping windowed schedules mean a missed/partial run is recovered by a later pass.

---

## 8. Edge Functions reference

21 Deno/TypeScript functions in `supabase/functions/` (**19 deployable** — `_shared` is a library, `test-forza-api` has no index). All 19 entry points are SHA-256-checksummed in `.function-checksums.json` with a CI drift gate (§14).

| Function | Role |
|----------|------|
| `calculate-scores` | Core fantasy-points engine (football) |
| `calculate-relaxation` | No-repeat relaxation as the cup pool shrinks |
| `ingest-match-events` | Live event ingestion + fixture-status flips |
| `sync-fixtures` / `sync-players` / `sync-player-status` | Football data sync (Forza) |
| `discover-tournament` | Tournament onboarding from the API |
| `process-transfer` | Transfer orchestration wrapper around the atomic RPC |
| `run-draft-lottery` / `run-reverse-standings-draft` | Draft allocation engines |
| `resolve-bets` | Auto-resolution of deadline-passed bets |
| `eliminate-cup-club` | Cup elimination |
| `auto-open-transfer-window` | Scheduled transfer-window opening |
| `generate-frontpage-edition` | AI newspaper (Groq) |
| `purchase-coins` | Stripe coin purchase + webhook fulfilment |
| `score-f1-race` / `score-tennis-tournament` / `score-atp-finals` | Multi-sport scoring |
| `sync-tennis-players` | Tennis roster sync (RapidAPI, admin-triggered) |
| `test-forza-api` | Diagnostic (no index — not deployed) |
| `_shared` | Library: `auth.ts` (`requireServiceRole`, HMAC), `config.ts` (env-derived project ref), `log.ts`, `providers/` (the adapter seam — §9) |

**Deployment note:** Edge Functions are **not** auto-deployed with the frontend; they are deployed manually (`npx supabase functions deploy <name>`). A CI **function-drift gate** now fails any PR that changes function code without updating its checksum (so frontend/backend can't silently skew).

**Auth note for admin-triggered functions:** the four admin/scoring functions require `requireServiceRole` **and** `verify_jwt = false` in `config.toml` **together** (one without the other still 401s) — the HMAC path is supplemented by an `ADMIN_TRIGGER_KEY` exact-match path because this project's current Supabase key system has no `SUPABASE_JWT_SECRET`.

---

## 9. The provider-adapter seam (multi-provider readiness)

`supabase/functions/_shared/providers/` introduces a canonical, provider-neutral data model so a buyer can plug in their own feed (Opta/Sportradar) by writing one adapter file:

- **`types.ts`** — `CanonicalEvent`, `CanonicalPlayerStat`, `CanonicalMatchStatus`, `CanonicalPosition`, and the `SportDataAdapter` interface (`listEvents`, `getPlayerStats`, `health`).
- **`forza.ts`** — `ForzaAdapter` implementing the interface, plus standalone helpers `forzaFetch`, `mapStatus`, `POSITION_MAP` (the Forza vocabulary lives here, once).
- **`opta.ts`** — a stub adapter whose methods throw "awaiting API credentials" and whose `health()` returns false (the visible integration gap for a buyer).
- **`manual.ts`** — manual/no-feed adapter (tennis, synthetic data).
- **`index.ts`** — `getAdapter(provider)` registry. A new provider = one import + one registry line.

**Current wiring (honest):** `sync-fixtures`, `ingest-match-events`, `sync-players`, and `discover-tournament` import the **shared helpers** (`forzaFetch`/`mapStatus`/`POSITION_MAP`) — this eliminated the previously-duplicated inline Forza client across five functions. However, they **still parse Forza's raw JSON shape inline** rather than consuming `adapter.listEvents()`/`getPlayerStats()` and the canonical model; `sync-player-status` still declares its own inline `FORZA_BASE`. The `ForzaAdapter` methods exist but are not yet the call path. Completing this (and renaming the `tournaments.forza_id` spine to `provider_key`) is DD item **ARCH-2** — the canonical types and registry are the hard part and are done; the remaining work is mechanical refactoring of the call-sites plus one additive migration.

---

## 10. The multi-sport / Clubhouse model

The platform has a real sport dimension and a cross-sport social container, all added **additively** (zero breaking changes to football):

- **`sports`** (migration 187) — three seeded rows (football/forza, f1/openf1, tennis/manual); `tournaments` gained nullable `sport_id`/`provider`, backfilled to football.
- **`circles` / `circle_members` / `circle_leagues`** (migration 188) — the Clubhouse: RLS-scoped membership, invite codes, a cross-league feed RPC.
- **`trophy_ledger`** (migration 189) — append-only cross-sport trophy table + `get_circle_meta_standings()` (the "Meta-League" leaderboard).
- **F1 (7 screens)** and **Tennis (7 screens)** are fully built and routed; the Clubhouse is the default landing route.

**Gap to be explicit about:** the `trophy_ledger` is **structurally present but functionally empty** — no scoring path writes trophies, so the cross-sport meta-standing always returns zero today. The infrastructure and the RPC exist; the emission calls do not (DD item ARCH-1). Similarly, `circle_id NOT NULL` enforcement (migration 217) is written but **gated on pilot end** (18 orphan leagues, 7 of them live). So multi-sport is "built, routed, and demoable per-sport," with the *unified meta-standing* being the one headline feature still scaffolding-only.

---

## 11. Security model

| Control | Implementation |
|---------|----------------|
| **Authentication** | Supabase Auth (JWT sessions); frontend gated by `VITE_AUTH_ENABLED === 'true'` (no demo-mode bypass) |
| **Authorization (data)** | Row-Level Security on user tables, scoped to `auth.uid()` |
| **Authorization (logic)** | `SECURITY DEFINER` RPCs run as owner; mutating money/points RPCs REVOKE'd from `anon`/`authenticated` |
| **Protected columns** | `guard_squad_protected_columns` (squads: budget/identity/roster) and `guard_coin_columns` (coin_wallets: balance/escrow) triggers block direct client writes; changes only via RPC |
| **Service-role verification** | `_shared/auth.ts` `requireServiceRole()` — HMAC-SHA256-verifies legacy JWTs (no decode-only trust) + exact-match `SUPABASE_SERVICE_ROLE_KEY` and `ADMIN_TRIGGER_KEY` paths |
| **Scoring-function authz** | All four multi-sport scoring functions + `calculate-scores` call `requireServiceRole` first (with a Supabase-verified user fallback for the admin rescore button) |
| **Admin flag** | `is_admin` is client-immutable via `guard_users_privilege_columns` trigger (migration 210, applied) |
| **Payments** | Stripe webhook signature constant-time-verified; server-side price/coin lookup; user from JWT; DB-idempotent on `reference_id`; coins denominated `FRC`; `MOCK_PAYMENTS` hard-fails alongside a live Stripe key |
| **No cash-out** | No withdrawal/payout RPC or transaction type exists (legally clean game ledger) — *enforced by absence, not yet a positive schema CHECK (DD item LEGAL-1)* |
| **Frontend headers** | `vercel.json`: CSP, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy` (CSP allows `'unsafe-inline'` for Vite/Tailwind — residual hardening item) |
| **XSS** | No `dangerouslySetInnerHTML`/`eval`; user content rendered as escaped JSX |
| **Secrets** | No secrets in tracked source (`.env.example` is placeholders; PAT in CLAUDE.md is a `<PAT>` placeholder; the live PAT in `.git/config` is untracked but should be rotated — SEC-4) |

> **Posture:** The Phase-0 security gate that the prior DD flagged (admin self-promotion, unauthenticated scoring functions, unsigned service-role claim, unhardened payment path) is **closed in code and applied to production**. Residual items: rotate the developer-machine PAT (SEC-4), activate Sentry (OPS-2), make the no-cash-out rule a positive constraint (LEGAL-1), and tighten the CSP (`'unsafe-inline'`). A few `USING (true)` SELECT policies expose non-PII reference data and (notably) F1 prediction bets — low risk, worth an allowlist pass.

---

## 12. External dependencies

| Service | Purpose | Notes |
|---------|---------|-------|
| **Forza Football API** | Football fixtures, players, live events | Core, sole football feed; abstracted behind `_shared/providers/forza.ts` |
| **OpenF1** | F1 race/session data | F1 module provider |
| **RapidAPI (ATP/WTA/ITF Tennis)** | Tennis player/tournament data | Free tier (50 req/day) — admin-triggered, ~28 calls/season; move to paid before scale |
| **Groq** | LLM for the AI newspaper | `llama-3.1`, OpenAI-compatible API |
| **Stripe** | Virtual coin purchases | Webhook-verified, constant-time-signature fulfilment |
| **Supabase** | DB, Auth, Functions, Realtime, cron | Managed backend |
| **Vercel** | Frontend hosting + auto-deploy | From the `main` branch |

All third-party secrets are stored as Supabase Edge Function secrets / Vercel env vars (not in source).

---

## 13. Mobile (Capacitor)

A single web codebase wrapped natively via **Capacitor 8** for iOS and Android.

- App ID: `com.fantasykit.forzaedition`.
- Native plugins: status bar, splash, app-resume (`src/lib/capacitor.js`).
- Build: `npm run build && npx cap sync`. CI (`mobile.yml`) builds iOS simulator + Android debug (unsigned) on `main`/`antigravity/**` (not `v2`).
- A dedicated mobile-first web UX redesign (M0–M4) shipped on `v2` — viewport hook, bottom sheets, tap-target sweep, tablet tier.
- **Status:** near-ready wrapper, **not store-submitted** — signing, provisioning, release builds, and listings are roadmap items.

---

## 14. Build, containerization, CI/CD & deployment

| Stage | Detail |
|-------|--------|
| **Frontend build** | `vite build` → `dist/` |
| **Containerization** | `Dockerfile` (multi-stage: `node:20-alpine` build → `nginx:1.27-alpine` static serve, with healthcheck); `docker-compose.yml` (frontend + `postgres:15-alpine` + `supabase/edge-runtime` Deno runner); `infra/nginx.conf`; `DOCKER_LOCAL_DEV.md` guide. ⚠️ Dockerfile pins Node 20 while `.nvmrc`/`engines`/CI pin Node 24 — reconcile. |
| **CI (GitHub Actions, `ci.yml`)** | 4 jobs on push/PR to `main`+`v2`: **security** (`npm audit --audit-level=high`, `madge --circular`, encoding scan, `check:drift`) → **lint** → **build** → **e2e** (`needs: [security, lint, build]`, Playwright `platform.spec` desktop+mobile). All jobs Node 24 + `npm ci`. |
| **Function drift** | `scripts/check-function-drift.js` SHA-256-checksums all 19 functions vs `.function-checksums.json`; CI fails on un-deployed changes; `npm run update:checksums` after deploy. |
| **Frontend deploy** | Vercel auto-deploys on merge to `main` (~30s). |
| **Edge Function deploy** | Manual (`npx supabase functions deploy <name>`) — gated by the drift check. |
| **DB migrations** | 243 versioned SQL files, **hand-applied** via `npx supabase db query --linked` (no Supabase migration-history tracking — see §19/DATA-1). `migrate.yml` exists as a manual `workflow_dispatch` (default dry-run). |
| **Node pinning** | `.nvmrc` (24), `engines: ">=24.0.0"`, CI `npm ci`. |
| **Branching** | `main` (live football pilot) + `v2` (multi-sport platform); feature branches → PR → squash-merge; protected `main`. |

---

## 15. Environments & configuration

**Single environment today** — the live Supabase project (`sssmvihxtqtohisghjet`) is also the development/pilot database. `docker-compose.yml` provides a *local* dev stack (Postgres + Deno runner), but there is no managed staging project and no PITR (see §19/OPS-1). Standing up staging is the recommended early step for a new owner — and is now one command once the schema baseline (DATA-1) exists.

**Frontend env vars (Vercel):** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_AUTH_ENABLED` (`"true"` in prod), `VITE_SENTRY_DSN` (*not yet set — Sentry inactive*).

**Backend secrets (Supabase):** `FORZA_ACCESS_TOKEN`, `RAPIDAPI_TENNIS_KEY`, `GROQ_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `FRONTEND_URL`, `ADMIN_TRIGGER_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.

**Project-ref externalization:** the project ref is no longer hardcoded in `src/` — `_shared/config.ts` derives it from `SUPABASE_URL`. It remains in ~30 files, almost all append-only migration cron URLs + docs (INFRA-1 residual).

**Ownership transfer** requires: a new Supabase project (+ re-keyed secrets), a new Vercel project, a new GitHub repo, and the buyer's own Forza/OpenF1/Stripe/Groq/RapidAPI accounts. A full transfer runbook is a documented backlog item (INFRA-1).

---

## 16. Testing

| Layer | Coverage |
|-------|----------|
| **E2E (CI)** | `platform.spec.js` — UI render/route smoke (Playwright), desktop + mobile. |
| **E2E (manual)** | 8 integration specs (scoring, draft, bets, autofill) — **run manually against live production data**; `testIgnore`'d in CI. |
| **Unit / RPC / function** | **None automated** — no Vitest/Jest framework configured. |

**This is the largest engineering gap.** The core money/scoring/game-logic RPCs have effectively zero automated regression protection, and the manual specs assert on live prod rows (non-reproducible). The precondition for fixing this — a local Postgres — now exists via `docker-compose.yml`/`supabase start`; building a seeded pgTAP/Deno harness against the fragility-hotspot RPCs is the highest-value next investment (DD items TEST-1, DATA-2).

---

## 17. Observability & operations

- **Logging:** Edge Functions log via `console.*` (Supabase logs).
- **Error capture (frontend):** `@sentry/react` integrated in `src/main.jsx`, guarded by `VITE_SENTRY_DSN`. ⚠️ **`VITE_SENTRY_DSN` is not set in Vercel — Sentry is a no-op in production today; no errors are being captured.** An `edge_function_error_log` table + `cron_job_status()` RPC + an admin error-monitor panel exist (require someone to look).
- **Error capture (edge):** none beyond console (no Deno Sentry SDK).
- **Alerting:** not implemented — no failed-cron/scoring-failure alert path (the OPS-2 gap).
- **Backups:** manual hand-`SELECT`ed JSON to gitignored `backups/`; no PITR, no staging, no automated restore test (OPS-1). Game-state recovery is covered by `round_backups`/`squad_events`/`squad_matchday_snapshots`.
- **Runbooks:** `docs/deployment/` includes data-pipeline, key-rotation, MD-correction, observability-strategy, Docker-local-dev, and new-tournament runbooks (no DR/PITR runbook yet).

---

## 18. Repository structure

```
src/                  React app
  screens/            route views (+ f1/, tennis/ subtrees, admin, social)
  components/league/  large league sub-views
  components/competition/  shared multi-sport CompetitionResultsHeader
  hooks/              feature logic (+ f1/, tennis/)
  lib/                supabase client, capacitor, payments, helpers
  context/            AuthContext, SportContext, ClubhouseProvider, ...
supabase/
  migrations/         243 versioned SQL files (19 duplicate prefixes — see §19)
  functions/          21 Deno Edge Functions (19 deployable) + _shared (auth/config/log/providers)
e2e/                  Playwright specs (1 CI smoke + 8 manual integration)
ios/ android/          Capacitor native projects
infra/                nginx.conf (container serve config)
Dockerfile, docker-compose.yml, .dockerignore
docs/                 architecture, api, brand, deployment, platform_revision (incl. this doc)
.github/workflows/    ci.yml (security/lint/build/e2e), migrate.yml, mobile.yml
scripts/              check-function-drift.js, update-function-checksums.js
.nvmrc .editorconfig .function-checksums.json
```

---

## 19. Known limitations & hardening roadmap

The platform is functional and feature-complete across three sports with a Phase-0-clean security posture. The remaining areas to harden as it moves from pilot to scale (full detail, effort, and file locations in the companion **Remediation Backlog V2**):

- **Data-layer reproducibility (DATA-1, highest leverage):** 243 migrations / 19 duplicate prefixes, hand-applied; no `schema.sql` baseline; data fixes interleaved with DDL. A buyer cannot rebuild the schema from the repo. Capture a `pg_dump --schema-only` baseline + archive the history.
- **Automated testing (TEST-1):** ~0 automated coverage of money/game logic; manual specs assert on prod data. Build a seeded local/staging harness for the hotspot RPCs.
- **Operational DR (OPS-1):** single environment, no PITR, manual backups, no staging gate.
- **Observability activation (OPS-2):** Sentry FE code present but not wired to Vercel; no edge error tracking; no failed-cron alerting.
- **Provider independence finish (ARCH-2):** consume the canonical model in the sync functions; migrate `sync-player-status`; rename `forza_id`→`provider_key`.
- **Cross-sport meta-standing (ARCH-1):** wire trophy emission so the `trophy_ledger`/meta-leaderboard is non-empty.
- **No-cash-out as a positive constraint (LEGAL-1):** before any real-money expansion.
- **Maintainability:** data-fetching layer (CODE-3), god-component decomposition (CODE-2, improved), incremental typing (CODE-5).
- **Ownership transfer (INFRA-1):** template cron URLs, transfer runbook + dry-run; rotate PAT (SEC-4); reconcile Dockerfile Node version (BUILD-1).

None require re-architecting the platform; they are the typical pilot-to-scale cluster.

---

## 20. Glossary

| Term | Meaning |
|------|---------|
| **Clubhouse / Circle** | A cross-sport social container above the league; competitions are tabs within it |
| **Matchday / round** | A scoring period (`{tournament}-r{N}`); points keyed per squad per round |
| **Gazette** | The in-app activity & news feed |
| **Paddock / Player Box** | The F1 / Tennis equivalents of a "league" |
| **Trophy ledger** | The append-only cross-sport trophy table behind the Meta-League standing (table exists; emission unwired) |
| **Provider adapter** | The `_shared/providers/` seam that maps a data feed to a canonical model |
| **RPC** | A PostgreSQL function called from the client (server-authoritative logic) |
| **RLS** | Row-Level Security — per-row access control in PostgreSQL |
| **Edge Function** | A Deno serverless function hosted by Supabase |
| **FRC** | The internal virtual-coin currency code (non-fiat; no cash-out) |
| **Idempotent** | Safe to run multiple times with the same result |

---

*Companion documents: [Technical Overview](TECH_OVERVIEW.md) (high-level) · [Technical Due Diligence](TECHNICAL_DUE_DILIGENCE.md) (engineering remediation backlog) · [B2B Buyout Technical Due Diligence](../architecture/B2B_BUYOUT_TECHNICAL_DUE_DILIGENCE.md) (acquirer lens). Last updated: 2026-06-30.*
