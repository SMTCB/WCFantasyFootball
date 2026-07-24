# B2B Buyout — Technical Due Diligence Assessment

**A Principal Architect's re-grounded assessment of the Forza Fantasy League codebase against the bar a corporate acquirer (DAZN, Sky, a major broadcaster/aggregator) applies during technical due diligence on an IP / tech-asset purchase.**

> **This is a re-verification.** The original 2026-06-20 assessment scored the asset **4/10** (archived at [docs/archive/superseded-dd-2026-06-30/B2B_BUYOUT_TECHNICAL_DUE_DILIGENCE.md](../../archive/superseded-dd-2026-06-30/B2B_BUYOUT_TECHNICAL_DUE_DILIGENCE.md)). That report predates a substantial remediation push (PRs #634–#648) and the multi-sport build-out (migrations 187–217). Every finding below has been re-checked against branch `v2` at HEAD `2f9aad6` (**2026-06-30**); where the original report's evidence is now stale, that is stated explicitly with the new evidence inline.

> **Framing (unchanged).** This report assesses one thing: *how much risk and remediation cost an acquiring engineering team inherits the day they take the keys.* The buyer's question is "can my team absorb this repo, run it on my infrastructure, plug in my data feeds, and pass my legal/security review **without** a rewrite?"

> **Evidence base.** Claims are grounded in the actual repository — file paths, schema, edge functions, and quantified greps cited inline. *Designed* is still not *built*; where something is half-built (a real category here), it is labelled as such.

---

## Quick Navigation

- [1. Executive Summary — Buyout-Readiness Score](#1-executive-summary--buyout-readiness-score)
- [2. The three diligence tests, re-run](#2-the-three-diligence-tests-re-run)
- [3. Architectural assessment by objective](#3-architectural-assessment-by-objective)
- [4. Remediation Plan (what's left)](#4-remediation-plan-whats-left)
- [5. What strengthens the asset](#5-what-strengthens-the-asset)

---

## 1. Executive Summary — Buyout-Readiness Score

### Score: **6.5 / 10** (was 4/10 on 2026-06-20)

**Verdict: a strong product that has closed its deal-blocking foundations and is now mid-way through buyout hardening.** The single sentence a buyer's CTO would now write has changed materially. The 2026-06-20 memo read:

> *"This is a Supabase-and-Forza application, not a portable codebase. We'd be buying the product and the team, and rebuilding the platform underneath it."*

The 2026-06-30 memo reads:

> *"This is a Supabase application with a clean security posture, a containerized dev surface, a provider-adapter seam, and a real multi-sport schema. We'd still be running it on Supabase short-term and we'd want the schema reproducible and the money-logic tested before we sign — but the path is absorb-and-harden, not rebuild."*

### Why the score moved (4 → 6.5)

Three things drove the original 4: it failed all three of the tests a corporate acquirer runs first (portability, provider-independence, reproducibility), plus it carried a critical unsigned-JWT security hole. Re-verified status:

| The original blocker | 2026-06-20 | 2026-06-30 | Evidence |
|---|---|---|---|
| **Critical: unsigned service-role JWT** | 🔴 Open | ✅ **Closed** | `_shared/auth.ts` `requireServiceRole()` now HMAC-SHA256-verifies the signature before trusting any claim; no decode-only path. |
| **Test A — Environment-agnostic?** | ❌ Fail (zero containerization) | ◐ **Partial pass** | `Dockerfile` (multi-stage build→nginx), `docker-compose.yml` (app + Postgres + Deno runner), `infra/nginx.conf`, `DOCKER_LOCAL_DEV.md` all present. Project ref externalized (`_shared/config.ts`; 0 in `src/`). *Still no IaC for the prod topology; runtime still Supabase primitives.* |
| **Test B — Provider-agnostic?** | ❌ Fail (Forza woven in) | ◐ **Partial pass** | `_shared/providers/` seam built: canonical `types.ts`, `ForzaAdapter`, `OptaAdapter` stub, `ManualAdapter`, `getAdapter()` registry. 4/5 sync fns use the shared client (duplicated inline client eliminated). *Sync fns still parse raw Forza JSON; DB spine still `forza_id`.* |
| **Test C — Reproducible from source?** | ⚠️ Fail (out-of-band schema) | ⚠️ **Still Fail** | 243 migrations / 19 duplicate prefixes, hand-applied, no `schema.sql`. **This is the one original blocker that has not moved** — and the migration count has grown. |

### Why 6.5 and not higher

Four things hold it below an 8:

1. **Schema irreproducibility (Test C) is unmoved** — and has worsened (229→243 files, 14→19 duplicate prefixes). A buyer still cannot `git clone` + rebuild the schema; the live DB remains the source of truth. *This is now the single highest-leverage gap.*
2. **No automated test coverage of the money/game logic** — the core RPCs (`execute_transfer_atomic`, `resolve_bet`, `calculate-scores`) have ~0 regression protection; the 243-migration history is the bug log. A buyer prices in regression risk.
3. **No operational DR** — single environment, no PITR, manual backups, no staging gate.
4. **Provider/portability is half-done** — the seam exists but isn't fully consumed; the runtime is still Supabase-locked (Deno functions, pgcron, Supabase Auth/Realtime are not portable as-is).

### Why 6.5 and not lower

The two structural blockers the original report called fatal are now **substantially addressed**, the critical security hole is **closed**, and the multi-sport capability the original report called "a roadmap, not an asset" is now **built and routed** (F1 + Tennis, 7 screens each; sport/circle/trophy schema). A buyer's first three diligence tests no longer all fail — two are partial passes and the security gate is clean.

### The path to 8/10

The remaining work is **smaller and more concentrated than the original plan**: a reproducible schema baseline (Test C), a seeded test harness for the hotspot RPCs, PITR + a staging project, and finishing the provider seam's last mile + the cross-sport trophy emission. **Estimated ~6–10 engineering-weeks** (down from the original 12–16), none of it touching the game logic.

---

## 2. The three diligence tests, re-run

### Test A — Environment-agnostic? ◐ **PARTIAL PASS** (was ❌ Fail)

| Dimension | 2026-06-20 | 2026-06-30 |
|---|---|---|
| Containerization | None | ✅ `Dockerfile` (multi-stage: `npm ci` build → `nginx:1.27-alpine` serve, healthcheck) + `docker-compose.yml` (frontend + `postgres:15-alpine` + `supabase/edge-runtime` Deno runner) + `infra/nginx.conf` + `DOCKER_LOCAL_DEV.md`. "clone + `docker compose up`" works. |
| Project-ref hardcoding | "119 files" | ✅ `_shared/config.ts` derives it from `SUPABASE_URL`; **0 occurrences in `src/`**; ~30 total, almost all append-only migration cron URLs + docs. |
| IaC for prod topology | None | ❌ Still none (no Terraform/Pulumi/CDK; DB/crons/functions/RLS/secrets still dashboard state). |
| Runtime portability | Supabase primitives | ❌ Unchanged — Deno functions, pgcron, Supabase Auth/Realtime are not portable without re-platforming. |
| Node pinning | Unpinned | ✅ `.nvmrc`/`engines`/CI = 24 (⚠️ Dockerfile pins node:20 — reconcile). |

> **Acquirer's read (updated):** *"Local dev is containerized and the env identifier is a variable now. We can run the frontend and a local DB on day one. The prod runtime is still Supabase-only and there's no IaC — so 'run it on our cloud' remains a re-platforming project, but 'evaluate and develop it' no longer is."* **Partial pass.**

### Test B — Provider-agnostic? ◐ **PARTIAL PASS** (was ❌ Fail)

The seam the original report's Section 4 *recommended* has been **built** — close to verbatim:

- `_shared/providers/types.ts` — `CanonicalEvent`, `CanonicalPlayerStat`, `CanonicalPosition`, `SportDataAdapter` interface.
- `forza.ts` — `ForzaAdapter` + standalone `forzaFetch`/`mapStatus`/`POSITION_MAP` (Forza vocabulary isolated to one file).
- `opta.ts` — a deliberately-throwing stub (the buyer's plug-in point made visible).
- `manual.ts`, `index.ts` (`getAdapter()` registry).

**But the seam is not fully consumed (the honest half-build):**
- `sync-fixtures`, `ingest-match-events`, `sync-players`, `discover-tournament` import the **shared helpers** (`forzaFetch`/`mapStatus`/`POSITION_MAP`) — which **did** kill the previously-duplicated inline Forza client (original Depth-1 finding: resolved) — but they **still parse Forza's raw JSON inline** (`m.status`, `m.home_team.name`) instead of calling `adapter.listEvents()`/`getPlayerStats()` and consuming the canonical model (original Depth-2 finding: **not yet resolved**).
- `sync-player-status` still declares its own inline `FORZA_BASE`.
- The DB spine is still `tournaments.forza_id text UNIQUE NOT NULL` — no `provider_key` migration exists (original Depth-3 finding: **not resolved**, though migration 187 added nullable `sport_id`/`provider` columns alongside it).

> **Acquirer's read (updated):** *"They built the adapter and the canonical model — the hard, design-level part — and removed the copy-paste client. The mechanical work (route the sync functions through the adapter, rename the join key) is left, and the Opta stub shows exactly where our feed plugs in. We can scope a feed swap now without a schema spike."* **Partial pass — the hardest part is done.**

### Test C — Reproducible from source? ⚠️ **STILL FAIL** (unchanged, slightly worse)

- **243 migration files; 19 duplicate number prefixes** (16, 63, 90, 96, 112, 140–145, 156, 157, 159, 187, 191, 192, 193, 194) — up from 205/14.
- No `supabase/schema.sql` baseline; no `supabase/data-fixes/` separation; data fixes still interleaved with DDL; CLAUDE.md still: *"Supabase migration history is not used in this project."* No `supabase_migrations.schema_migrations` tracking.
- **Doc-drift compounding it:** migrations 209/210/211 are applied to prod (per TRACKER) but their file headers still say "DO NOT APPLY" / "APPLY FROM SUPABASE-LINKED PC". The applied state lives only in a prose tracker — reinforcing that the source of truth is out-of-band.

> **Acquirer's read (unchanged):** *"We still cannot stand up an identical environment from the repo. The schema's source of truth is the live database. This is the one thing that hasn't improved, and it now blocks both our DR standard and our test strategy. It's also the cheapest of the four remaining gaps to fix (one good `pg_dump`)."* **Fail — and the top remediation priority.**

---

## 3. Architectural assessment by objective

### 3.1 Data Layer — provider lock-in (Objective 1) — ◐ Improved

The three-depth coupling from the original report, re-verified:
- **Depth 1 (duplicated inline API client across 5 functions): ✅ RESOLVED** — the client now lives once in `_shared/providers/forza.ts`; sync functions import `forzaFetch`.
- **Depth 2 (provider JSON parsed directly into domain logic): ◐ PARTIAL** — `mapStatus`/`POSITION_MAP` are now shared, but the field-level mapping (`m.home_team.name`, `m.score?.current?.[0]`) is still inline in the sync functions; the canonical `CanonicalEvent`/`CanonicalPlayerStat` model is defined but not the consumption path.
- **Depth 3 (`tournaments.forza_id` spine): ◐ PARTIAL** — still `forza_id text UNIQUE NOT NULL` as the FK spine, but migration 187 added nullable `sport_id`/`provider` columns and an `F1`/`tennis` row can now exist (synthesizing keys). The `forza_id`→`provider_key` rename is designed, not built.

### 3.2 Infrastructure & Portability (Objective 2) — ◐ Improved

| Weak point | 2026-06-20 | 2026-06-30 |
|---|---|---|
| No containerization | ❌ | ✅ Dockerfile + compose + nginx + guide |
| No IaC | ❌ | ❌ Unchanged |
| Hardcoded project ref | ❌ (119 files) | ✅ Externalized (0 in `src/`) |
| Single-env, pilot-is-prod | ❌ | ❌ Unchanged (local dev DB added, but no managed staging/PITR) |
| Runtime lock to Supabase | ❌ | ❌ Unchanged |
| Secrets coupled to Supabase store | ❌ | ◐ Still Supabase secret store, but `_shared/config.ts` is a config seam; `FRONTEND_URL`/`ADMIN_TRIGGER_KEY` added cleanly |

> One positive worth restating: `vercel.json` ships strong security headers (CSP, X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy). Frontend deployment posture is sound. (Minor: CSP allows `'unsafe-inline'`.)

### 3.3 Multi-Sport / Meta-Engine Modularity (Objective 3) — ✅ **Largely built** (was ❌ "designed not built")

**This is the most-changed objective.** The three things the original report said were missing in code are now present, all additively (migrations 187–189, dated after the original report):

1. **Sport dimension — ✅ BUILT.** `sports` table (football/f1/tennis, with `game_model` + `provider`); `tournaments` gained nullable `sport_id`/`provider`, backfilled to football. An F1/tennis competition can now exist.
2. **Social container above the league (`circle`) — ✅ BUILT.** `circles`/`circle_members`/`circle_leagues` with RLS, invite codes, `create_circle`/`join_circle_by_code`/`get_circle_feed`. The app is now clubhouse-centric (`/` → `/clubhouse`).
3. **Sport-neutral meta-standing (`trophy_ledger`) — ◐ SCAFFOLDED.** The `trophy_ledger` table + `get_circle_meta_standings()` RPC exist, **but no scoring path emits trophies** — the cross-sport leaderboard is empty in practice. This is the one piece of the "Meta-League" still unwired.

Plus: **F1 (7 screens, OpenF1) and Tennis (7 screens, RapidAPI/manual) are fully built and routed**, with shared primitives (`CompetitionResultsHeader`, `useActiveCompetition`) reducing the per-sport clone cost the original report flagged.

> **Acquirer's read (updated):** *"The multi-sport story is no longer a roadmap — football, F1, and tennis are all built and navigable, with a real shared schema (sport/circle) and shared UI primitives. The one gap is that the unified cross-sport leaderboard is scaffolding that nothing populates yet. We'd price three working sport modules as an asset, with the meta-standing wiring as a small finish."* **Largely built — a real strength now.**

### 3.4 Legal & Structural Separation — Wager/Ledger (Objective 4) — ✅ Still the strongest, now partly built

The original report's "strongest objective" has been **partly built** (the P2P coin economy, migrations 202–209) while preserving the legal cleanliness:
- `coin_transactions.type` CHECK lists **no withdrawal/payout type**; **no cash-out RPC exists anywhere** (grep clean); coins flow in (purchase/win/admin) or balance↔escrow only. **No money path out.**
- All value movement is through `SECURITY DEFINER` RPCs with `FOR UPDATE` locking; `guard_coin_columns` blocks direct client writes to `coin_wallets`.
- Stripe is the only money-**in** path (`purchase-coins`), now hardened (constant-time verification, mock-safe, DB-idempotent, FRC-denominated).

**The structural risk the original report flagged is now half-addressed:** the no-cash-out invariant is enforced by the type-CHECK (no cash-out type) and by absence (no withdrawal RPC) — but it is **still not a positive schema constraint** that forbids a balance decrease to an external party. To pass conservative legal review before any real-money expansion, make it a hard guarantee (DD item LEGAL-1). The wager ledger and the Stripe rail remain separable.

> **Acquirer's read (updated):** *"They built the coin economy and kept it legally clean — no cash-out path, hardened Stripe-in. We'd want the no-cash-out rule as a schema invariant, not just an absence, before we'd let real-money features ship. Still the lowest-risk subsystem."* **Relative strength, now with working code behind it.**

### 3.5 Code Quality & Security (Objective 5) — ✅ Materially improved

- **🔴→✅ Service-role JWT signature** — **CLOSED.** `requireServiceRole()` HMAC-verifies (plus exact-match key paths). The critical finding that "ends negotiations or knocks a number off the price" is gone.
- **🟠 Schema reproducibility / migration integrity** — **unchanged / worse** (243/19; out-of-band). Still both a reproducibility and an audit-lineage failure. (Objective C above.)
- **🟠 Backup/DR posture** — **unchanged.** No PITR; local dump still broken (Docker unavailable on the build machine); manual partial backups.
- **🟡 Frontend untyped (JSX, not TS)** — unchanged (dead `typecheck` script *removed*, so no longer misleading). Maintainability cost for an incoming team.
- **🟡 Vite 8 / Rolldown TDZ fragility** — **mitigated:** `madge --circular` is now a CI gate and all 27 screens are `React.lazy` (structurally defuses the shared-module TDZ class).
- **🟡 Duplicated provider client** — **resolved** (now `_shared/providers/`).
- **God components** — improved (SquadScreen 2,879→2,219) but 5 files still >1,400 lines.

**Now-genuinely-good (re-verified):** RLS throughout with deliberate policies; all value mutations through `SECURITY DEFINER` RPCs with locks; `guard_squad_protected_columns` + `guard_coin_columns` triggers; `is_admin` client-immutable; constant-time Stripe; strong CSP; 0 npm vulns; CI security gate; no secrets in git; exceptional CLAUDE.md/TRACKER institutional memory.

> **Acquirer's read (updated):** *"The team writes secure application code and has now closed the platform-level security holes we'd have flagged. The remaining objections are reproducibility, DR, and test coverage — process and infrastructure, not code quality."*

---

## 4. Remediation Plan (what's left)

The original P0 was dominated by the JWT fix and a schema baseline. The JWT fix is done; the schema baseline is the headline survivor. Sequenced so football keeps working at every step.

### P0 — Diligence blockers still open

- [ ] **Establish a single reproducible schema baseline (Test C).** `pg_dump --schema-only` from prod → commit `supabase/schema.sql`; freeze the 243-file history as `migrations/archive/`; separate data fixes into `supabase/data-fixes/`; make `migrate up` from zero reproduce prod. *(1–1.5 wk — the single highest-leverage item; TRACKER 1D-B, currently parked.)*
- [ ] **Stamp applied-state into migration headers + reconcile DD docs** so the security posture isn't *under*-read by file-level diligence. *(XS.)*
- [x] ~~Close the JWT signature gap~~ — **DONE** (`_shared/auth.ts` HMAC-verifies).

### P1 — Portability (finish the environment-agnostic story)

- [x] ~~Containerize the application surface~~ — **DONE** (Dockerfile + compose + nginx).
- [x] ~~Externalize the project ref~~ — **DONE** (`_shared/config.ts`; 0 in `src/`). *Residual: template the ~30 append-only migration cron URLs.*
- [ ] **Add IaC for the runtime topology** (Terraform / Supabase config-as-code: DB, functions, crons, RLS, secrets refs) so prod is reviewable and reproducible. *(2–3 wk.)*
- [ ] **Provision PITR + a managed staging project** (now ~1 command once the schema baseline exists). *(M + infra.)*
- [ ] **Reconcile Dockerfile Node 20 → 24** to match `engines`. *(XS.)*

### P2 — Provider-independence (finish the data-agnostic story)

- [x] ~~Introduce the `SportDataAdapter` seam~~ — **DONE** (`_shared/providers/`).
- [ ] **Route the 4 sync functions through `adapter.listEvents()`/`getPlayerStats()`** so they consume the canonical model, not Forza JSON; migrate `sync-player-status` onto the shared client. *(1.5–2 wk.)*
- [ ] **Generalise `tournaments.forza_id` → `provider_key`** (additive: rename + keep values; drop the football-implied `NOT NULL`). *(1–2 wk.)*
- [ ] **Adapter-conformance test suite** so a buyer can drop in `opta.ts` and prove parity. *(1 wk — the deliverable that lets a buyer say "yes, we can plug in our feed.")*

### P3 — De-risk & enterprise hygiene

- [ ] **Automated test harness for the hotspot RPCs** (local Postgres now available via compose) — `execute_transfer_atomic`, `resolve_bet`, `set_lineup`, `place_bid`, `confirm_auction_win`, coin RPCs, `calculate-scores`. *(XL — highest engineering value after the schema baseline.)*
- [ ] **Wire trophy emission** so the cross-sport meta-standing is non-empty (ARCH-1). *(S–M.)*
- [ ] **Make no-cash-out a positive schema constraint** before real-money expansion (LEGAL-1). *(0.5 wk.)*
- [ ] **Activate Sentry** (`VITE_SENTRY_DSN` in Vercel) + add edge error tracking + failed-cron alerting (OPS-2). *(S–M.)*
- [ ] **Data-fetching layer** (TanStack Query) + god-component decomposition + incremental TS. *(L–XL, parallelizable.)*
- [ ] **Ownership-transfer runbook + PAT rotation (SEC-4)** + dry-run. *(M.)*

**Estimated effort to clear P0+P1+P2 (the buyout-readiness bar): ~6–10 engineering-weeks** (was 12–16). None touches the game logic.

---

## 5. What strengthens the asset

Re-verified, with the new build-out folded in:

1. **A legally clean coin economy with no cash-out path** — now *built* (migrations 202–209), not just a future design: bet/coin systems award points/coins only; no withdrawal RPC or transaction type exists. Conservative legal review still starts from "game ledger," not "gambling infrastructure." (Objective 4 — relative strength, now with code.)
2. **Three working sport modules + a real multi-sport schema** — football live, F1 + tennis built and routed, with a `sports`/`circles` dimension and shared UI primitives. The headline differentiator is now an asset, not a roadmap. (Objective 3 — the biggest change.)
3. **Closed Phase-0 security** — HMAC-verified service-role auth, gated scoring functions, client-immutable `is_admin`, hardened constant-time Stripe path, protected-column triggers. The critical finding that capped the original score is gone.
4. **A provider-adapter seam + containerized dev surface** — the two structural buyer-DD blockers are substantially addressed; the Opta stub shows exactly where a buyer's feed plugs in.
5. **Config-driven scoring** (`scoring_rules` by tournament+position; JSONB `league_config`) — tuning in data, not deploys. A real abstraction a rewrite would re-earn.
6. **Disciplined authorization + concurrency** — RLS throughout, `SECURITY DEFINER` + `FOR UPDATE` locking, write-guard triggers closing proven self-tamper holes.
7. **CI security gate + 0 npm vulns + function-drift gate + lazy-loaded screens** — engineering hygiene a buyer's pipeline can adopt.
8. **Exceptional institutional memory** — CLAUDE.md + TRACKER.md document every migration, sharp edge, and decision. Onboarding an external team is materially de-risked.

**The deal-shaping sentence (updated):** *the product, the now-built multi-sport capability, the clean coin ledger, the closed security gate, and the provider seam are real, verifiable assets; the priced-in remediation has narrowed to schema reproducibility, money-logic test coverage, and operational DR. The asset is a credible **6.5/10** today and an **8/10** after ~6–10 weeks of hardening that does not touch the game.*

---

## Related Documents

- [Technical Due Diligence](../due_diligence/TECHNICAL_DUE_DILIGENCE.md) — the full remediation backlog with IDs/efforts/locations
- [Technical Documentation](../due_diligence/TECH_DOCUMENTATION.md) — the engineering reference
- [Multi-Sport Platform Architecture](MULTI_SPORT_PLATFORM_ARCHITECTURE.md) — the target design (now largely built)
- [P2P Betting System Design](P2P_BETTING_SYSTEM_DESIGN.md) — the coin-ledger design (now built, migrations 202–209)
- [TRACKER.md](../TRACKER.md) — the authoritative live-state tracker (applied migrations, pending deploys)

---

Last Updated: **2026-06-30**. Re-verified against branch `v2` HEAD `2f9aad6`. The prior 2026-06-20 edition (scored 4/10) is archived at [docs/archive/superseded-dd-2026-06-30/B2B_BUYOUT_TECHNICAL_DUE_DILIGENCE.md](../../archive/superseded-dd-2026-06-30/B2B_BUYOUT_TECHNICAL_DUE_DILIGENCE.md).
