# B2B Buyout — Technical Due Diligence Assessment

**A Principal Architect's grounded assessment of the Forza Fantasy League codebase against the bar a corporate acquirer (DAZN, Sky, a major broadcaster/aggregator) applies during technical due diligence on an IP / tech-asset purchase.**

> **Framing.** This report does **not** assess product quality, market fit, or the cleverness of the game mechanics — those are strong. It assesses one thing only: *how much risk and remediation cost an acquiring engineering team inherits the day they take the keys.* The buyer's question is never "is this a good app?" — it is "can my team absorb this repo, run it on my infrastructure, plug in my data feeds, and pass my legal/security review **without** a rewrite?"

> **Evidence base.** Every claim below is grounded in the actual repository: file paths, schema, edge functions, and quantified greps are cited inline. Where a design exists only on paper (the multi-sport and P2P design docs), that is stated explicitly — *designed* is not *built*, and a buyer pays for what is built.

---

## Quick Navigation

- [1. Executive Summary — Buyout-Readiness Score](#1-executive-summary--buyout-readiness-score)
- [2. Architectural Weak Points](#2-architectural-weak-points)
  - [2.1 Data Layer — provider lock-in (Objective 1)](#21-data-layer--provider-lock-in-objective-1)
  - [2.2 Infrastructure & Portability (Objective 2)](#22-infrastructure--portability-objective-2)
  - [2.3 Multi-Sport / Meta-Engine Modularity (Objective 3)](#23-multi-sport--meta-engine-modularity-objective-3)
  - [2.4 Legal & Structural Separation — Wager/Ledger (Objective 4)](#24-legal--structural-separation--wagerledger-objective-4)
  - [2.5 Code Quality & Security (Objective 5)](#25-code-quality--security-objective-5)
- [3. Codebase Remediation Plan](#3-codebase-remediation-plan)
- [4. Sample Refactoring Pattern — Sports Data Layer Abstraction](#4-sample-refactoring-pattern--sports-data-layer-abstraction)
- [5. What Strengthens the Asset (the counter-argument for the seller)](#5-what-strengthens-the-asset)

---

## 1. Executive Summary — Buyout-Readiness Score

### Score: **4 / 10**

**Verdict: a strong product on an acquisition-hostile foundation.** The application *works*, the domain logic is sophisticated, and the design intent for generalisation is documented and correct. But as a *transferable technology asset*, the repo today fails the three tests a corporate acquirer cares most about — **portability, provider-independence, and reproducibility** — and carries two security/legal items that would surface in any serious diligence pass.

The single sentence a buyer's CTO will write in their memo: *"This is a Supabase-and-Forza application, not a portable codebase. We would be buying the product and the team, and rebuilding the platform underneath it."*

#### Why 4 and not lower

The product is real and the seams for generalisation have been **identified and documented** (the multi-sport and P2P architecture docs are genuinely good). The bet/ledger engine is — by happy accident of never having built payment rails — **legally clean** today. The scoring layer is config-driven, not code-driven. These are real assets that a rewrite would have to re-earn.

#### Why 4 and not higher

Three structural facts cap the score, and no amount of product polish moves them:

| # | Diligence test | Status | The blocker |
|---|---|---|---|
| **A** | **Environment-agnostic?** (can my team run it on AWS/GCP/Azure/on-prem?) | ❌ **Fail** | **Zero containerization.** No `Dockerfile`, no `docker-compose`, no IaC (Terraform/Pulumi/CDK). The runtime *is* Supabase's managed platform — Postgres, Auth, Edge Functions (Deno), pgcron, Realtime — none of which is portable as-is. The project ref `sssmvihxtqtohisghjet` is hardcoded in **119 files**. |
| **B** | **Provider-agnostic?** (can my team plug in Opta/Sportradar?) | ❌ **Fail** | The data pipeline is **Forza-shaped end to end**. `https://api.forzafootball.com` and `FORZA_ACCESS_TOKEN` are inlined (not shared, not abstracted) across 5 edge functions; Forza's JSON shape is parsed directly into the DB; `tournaments.forza_id text UNIQUE NOT NULL` is the FK spine the *entire* app joins on. **1,389 occurrences of "forza" across 223 files.** |
| **C** | **Reproducible from source?** (can my team stand up a clean environment from the repo?) | ⚠️ **Fail / High Risk** | **205 migration files with 14 duplicate numbers** (16, 63, 90, 96, 112, 140–145, 156, 157, 159), and CLAUDE.md states the DB was applied **out-of-band** (`db query --linked`), *"Supabase migration history is not used in this project."* A buyer **cannot reliably `migrate up` from zero** to reproduce production schema. The schema's source of truth is the live database, not the repo. |

Tests A, B, and C are exactly the three a corporate acquirer runs first, and the asset fails all three. That is the gap between a 4 and an 8.

#### The path to 8/10

Each of the three failures is **fixable without a product rewrite**, because the application logic is already reasonably decoupled from the things that fail. Containerize the dev/runtime surface, introduce a provider-adapter seam (Section 4), and consolidate the schema into a single reproducible baseline migration. These are infrastructure and plumbing tasks — estimated in Section 3 — not a re-architecture of the game. A focused 6–10 week hardening effort moves this asset from "buy the team, rebuild the platform" to "absorb the repo."

---

## 2. Architectural Weak Points

Specific files, schemas, and modules that violate technology-agnostic / enterprise-readiness principles. Ordered by diligence objective.

### 2.1 Data Layer — provider lock-in (Objective 1)

**Finding: there is no data-provider abstraction. Forza is not a dependency — it is woven into the schema, the ingestion code, and the join keys.**

The coupling exists at three depths, each harder to remove than the last:

**Depth 1 — inline API calls (mechanical, easy to abstract).**
Each sync function declares its own Forza client. From `supabase/functions/sync-fixtures/index.js`:
```js
const FORZA_BASE  = 'https://api.forzafootball.com';
const FORZA_TOKEN = Deno.env.get('FORZA_ACCESS_TOKEN');
async function forza(path, retries = 3) {
  const url = `${FORZA_BASE}${path}?access_token=${FORZA_TOKEN}`;
  // ...
}
```
This exact block is **duplicated** (not shared) across `sync-fixtures`, `sync-players`, `sync-player-status`, `ingest-match-events`, and `discover-tournament`. There is no `_shared/providers/` module. A provider swap today means editing five functions.

**Depth 2 — provider JSON shape parsed directly into domain logic (the real coupling).**
The mapping from Forza's response shape to our tables is inline, with no canonical intermediate model. From `sync-fixtures`:
```js
home_team:  m.home_team.name,
score_home: m.score?.current?.[0],
round:      m.round,            // Forza's numbering; null for knockouts
status:     mapStatus(m.status) // Forza status strings → ours
```
And from `ingest-match-events/index.js`, Forza's position vocabulary is hardcoded:
```js
const POSITION_MAP = { goalkeeper:'GK', defender:'DEF', midfielder:'MID', attacker:'FWD' };
```
A different provider (Opta, Sportradar) returns a different JSON shape, different status enums, different position vocabulary, different event taxonomy. Because there is **no canonical event/stat model** between "what the provider sent" and "what the scoring engine reads," every one of these call sites breaks on a provider swap. This is the work that matters — and it is the work Section 4 addresses.

**Depth 3 — the `tournaments.forza_id` spine (the structural blocker).**
From `16_forza_integration.sql`:
```sql
create table tournaments (
  id       uuid primary key default gen_random_uuid(),
  forza_id text unique not null,   -- the spine
  ...
);
-- leagues.tournament_id, squads.tournament_id, players.tournament_id,
-- fixtures.tournament_id, transfers, scoring_rules → all FK to forza_id (TEXT), NOT the uuid PK
```
The entire app joins on a **provider's external id**, not the internal primary key. ~30 RPCs and functions reference it. `NOT NULL UNIQUE` literally encodes "every competition must have a Forza id." This is the highest-leverage coupling in the codebase: it is both a provider lock-in *and* the multi-sport blocker (an F1 season has no Forza id).

> **Acquirer's read:** *"Their data layer is their data provider. We can't evaluate the cost of switching to our feed (Opta) without a spike, and the spike touches the schema."*

---

### 2.2 Infrastructure & Portability (Objective 2)

**Finding: the application is not portable. It is a managed-Supabase + Vercel deployment with no containerization and no infrastructure-as-code.**

| Weak point | Evidence | Acquirer impact |
|---|---|---|
| **No containerization** | No `Dockerfile`, `docker-compose.yml`, or `.dockerignore` anywhere in the repo. | Cannot be handed to a platform team to run on the buyer's orchestration (ECS/EKS/GKE/AKS). "Works on Vercel" is not a deployment story for an enterprise. |
| **No infrastructure-as-code** | No `terraform/`, Pulumi, CDK, or equivalent. Infra is click-configured in the Supabase and Vercel dashboards. | The runtime topology (DB, crons, functions, RLS, secrets) exists only in two SaaS dashboards. It cannot be reviewed, version-controlled, or reproduced. This is an audit red flag on its own. |
| **Hardcoded project ref** | `sssmvihxtqtohisghjet` appears in **119 files** (functions, docs, scripts). | The "environment" is not a variable — it is a string literal scattered across the repo. There is no notion of dev/staging/prod targets. |
| **Single-environment, pilot-is-prod** | CLAUDE.md: "single-environment setup (no dev/staging/prod split)… The live database IS the pilot database. There is no Point-in-Time Recovery." | A buyer's change-management and DR standards (staging gates, PITR, blue/green) are entirely absent. Every change today ships to the only environment that exists. |
| **Runtime lock to Supabase primitives** | Edge Functions are Deno on Supabase's runtime; scheduling is `pgcron`; auth is Supabase Auth; realtime is Supabase Realtime. | None of these is portable without re-platforming. Deno functions ≠ AWS Lambda; pgcron ≠ EventBridge; Supabase Auth ≠ Cognito/Auth0. The buyer inherits a migration project, not just a codebase. |
| **Secrets coupled to Supabase secret store** | `FORZA_ACCESS_TOKEN`, `GROQ_API_KEY`, `STRIPE_*` live as Supabase Edge Function secrets. | No secrets-manager abstraction (Vault/SSM/Secret Manager). Secret rotation and provenance live in a SaaS dashboard. |

**The portability ceiling:** even a perfectly clean application layer cannot move off Supabase without re-implementing auth, scheduling, edge runtime, and realtime on the target cloud. That is the single largest hidden cost in the asset, and it is invisible until a buyer tries to deploy it on their own infrastructure.

> **One positive worth stating:** `vercel.json` ships a genuinely good security-header set (CSP, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`). The frontend deployment posture is sound. The problem is the backend's non-portability, not the web tier.

---

### 2.3 Multi-Sport / Meta-Engine Modularity (Objective 3)

**Finding: multi-sport is designed but not built. Today the platform is single-sport (football), single-provider, with the league bound 1:1 to one football competition. The meta-league engine does not exist in code.**

This is the honest line an acquirer needs: the `docs/architecture/MULTI_SPORT_PLATFORM_ARCHITECTURE.md` and `MULTI_SPORT_TECHNICAL_ASSESSMENT.md` documents are **architecturally sound** and correctly identify the seams — but they describe future migrations (next is `186_`), not shipped capability.

**What is missing in code (all three are net-new containers):**

1. **No `sport` dimension.** Football is implicit everywhere. There is no table, column, or enum that says "this is football vs F1 vs tennis." Adding F1 is not "more rows in `tournaments`" — `tournaments.forza_id NOT NULL` actively rejects a non-football competition.

2. **No social container above the league (`circle`/`group`).** The vision centres on a friend-group that spans sports. Today the **league is the social unit**, and a league is `tournament_id`-bound to exactly one football competition. The cross-sport group does not exist.

3. **No sport-neutral meta-standing (`trophy_ledger`).** `league_members.total_points` is a single integer in *football's* scoring units. It cannot aggregate an F1 prediction score and a tennis bracket score into one master leaderboard. The "Meta-League" the roadmap sells is unbuilt.

**Why the team-vs-individual sport gap is real:** the football tables (`squads`, `fixtures`, `players`, `player_match_stats`, `fantasy_points`) encode GK/DEF/MID/FWD positions, formations, captains/jokers, 11-a-side, clean sheets, club caps. F1 has no squad and no formation; tennis is a per-tournament bracket pick. The design doc correctly says each new sport gets **its own isolated tables** behind a common module contract — but that contract (the `SportModule` interface, the data-provider adapter seam) is **specified, not implemented.**

> **Acquirer's read:** *"The multi-sport story is a roadmap, not a capability. We are buying a football app with a credible plan to become multi-sport. We should price the plan as work, not as an asset."*

---

### 2.4 Legal & Structural Separation — Wager/Ledger (Objective 4)

**Finding: this is the strongest objective for the asset. The existing prediction/bet engine is legally clean today, and the P2P design preserves that cleanliness by construction — *provided the design is followed*.**

**What exists and is clean:**
- `bet_instances` / `bet_submissions` (`28_bets_system.sql`) is a **submit → lock → resolve → award** prediction engine. Critically, it awards **points or budget only** — there is **no payment rail anywhere in the codebase.** No Stripe integration is wired in production. There is no path from in-app value to money. From a conservative corporate legal review, *this is the cleanest possible starting point*: it is unambiguously a game ledger, not gambling infrastructure.
- All value movement is funnelled through `SECURITY DEFINER` RPCs with `FOR UPDATE` locking (the auction `place_bid` / `execute_transfer_atomic` pattern). Value cannot be minted client-side; the `guard_squad_protected_columns` trigger (migration 123) blocks direct client writes to balance-like columns. This is a well-controlled internal ledger.

**What the P2P design proposes (and the legal invariant that must hold):**
The `P2P_BETTING_SYSTEM_DESIGN.md` specifies non-withdrawable virtual coins: `coin_wallets` / `coin_transactions` (modeled on `squad_events`), escrow via `FOR UPDATE` (modeled on `place_bid`), challenge lifecycle (modeled on `trade_proposals`), and **Stripe as the only money-in path.** The load-bearing legal invariant, stated in the doc: **coins NEVER convert back to money.** One-way value flow (money → coins → game outcomes → coins) is what keeps this a digital ledger and not a regulated gambling product.

**The structural risk a buyer will probe:**
- The invariant is currently a *design intention*, not a *schema-enforced constraint*. To pass conservative legal review, the no-cash-out rule should be enforced at the database level (e.g., a `coin_transactions` type CHECK that has no `withdrawal`/`payout` transaction type, and an absence of any RPC that credits a payment processor from a coin balance), not merely documented.
- The wager ledger and the (future) Stripe purchase rail must be **separable modules** so a buyer's legal team can review the ledger in isolation and confirm there is no coin→cash edge. The design's "3-layer separation" (DB RPCs → hooks → thin components) supports this, but again — designed, not built.

> **Acquirer's read:** *"The current bet system is a clean game ledger with no money rails — low legal risk. The P2P coin economy is unbuilt; we must verify the no-cash-out invariant is enforced in schema before we'd let it ship, but the design is sound and conservative."* **This objective is a relative strength.**

---

### 2.5 Code Quality & Security (Objective 5)

**Finding: application-layer security discipline is above average (RLS, SECURITY DEFINER RPCs, write-guard triggers, good CSP), but there are two concrete items a security reviewer will flag, plus structural debt.**

**🔴 Critical — unverified service-role JWT signature.**
`supabase/functions/_shared/auth.ts`, `requireServiceRole()` Path B decodes an old-format service-role JWT and checks the `role` claim **without verifying the signature** — the code comment itself admits *"signature not verified; acceptable since…"*. A forged token with `role: service_role` in the payload would pass this path. Any function relying on Path B for authorization is exploitable if an attacker can reach the endpoint. **This must be closed before any diligence pass** — it is the kind of finding that ends negotiations or knocks a material number off the price.

**🟠 High — schema reproducibility / migration integrity.**
- **205 migration files; 14 duplicate numbers** (16, 63, 90, 96, 112, 140, 141, 142, 143, 144, 145, 156, 157, 159).
- CLAUDE.md states the canonical schema was applied via `npx supabase db query --linked` and *"Supabase migration history is not used in this project."*
- Consequence: **the repo is not the source of truth for the schema — the live DB is.** A buyer cannot stand up an identical environment from `git clone` + `migrate up`. This is both a reproducibility failure (Test C in the summary) and a security/audit failure (no verifiable lineage from source to running schema). It also means the migration files have unknown drift from production.

**🟠 High — backup/DR posture.**
CLAUDE.md: no PITR, and `npx supabase db dump --linked` is broken on the build machine (Docker unavailable). The documented backup procedure (selective row dumps to `backups/*.json`) is manual and partial. A buyer's DR standard is not met.

**🟡 Medium — structural / maintainability debt (not blockers, but cost):**
- **Frontend is JSX, not TypeScript**, despite a `typecheck` script in `package.json`. No compile-time type safety across the React layer — a maintainability cost for an incoming team, and it means the `typecheck` script is misleading.
- **Vite 8 / Rolldown TDZ fragility.** CLAUDE.md documents a production-only crash class (`Cannot access 'X' before initialization`) that has recurred **three times**, triggered by import-depth collisions. This is a sharp edge an incoming team will cut themselves on without the institutional knowledge captured in CLAUDE.md.
- **Duplicated provider client code** across 5 edge functions (no `_shared` HTTP client) — a copy-paste maintenance hazard.
- **Single 1,300-line `CLAUDE.md` migration ledger** as institutional memory — impressive discipline, but it signals that critical knowledge lives in prose, not in the code/tests.

**What is genuinely good (state it, for balance):**
- Row-Level Security is used throughout, with policies added deliberately (migrations 103, 117, 169, 184) and tested via simulated-JWT checks.
- All value mutations route through `SECURITY DEFINER` RPCs with advisory/`FOR UPDATE` locks — the concurrency discipline is real (auction double-claim, transfer races all explicitly handled).
- The `guard_squad_protected_columns` trigger closes a proven self-tamper P0 — evidence of a team that hunts and fixes authorization holes.
- Good CSP and security headers in `vercel.json`.
- No secrets in git; `VITE_`-prefix discipline for client-bundled vars is correct and documented.

> **Acquirer's read:** *"The team writes secure application code and understands authorization. But the platform around it — JWT verification gap, unreproducible schema, no DR — would not pass our security/audit gate without remediation."*

---

## 3. Codebase Remediation Plan

A prioritized checklist to move the asset from **4/10 → 8/10 (buyout-ready)**. Sequenced so football keeps working at every step (pilot-is-prod constraint). Effort bands are engineering-weeks for a small senior team.

### P0 — Diligence blockers (must fix before any buyer's technical review)

- [ ] **Close the JWT signature gap.** Rewrite `_shared/auth.ts` `requireServiceRole()` to **verify the signature** of every service-role token (no decode-only path). Audit all 5+ functions that depend on it. *(0.5 wk — highest ROI item in the entire plan.)*
- [ ] **Establish a single reproducible schema baseline.** Generate one authoritative `000_baseline.sql` from the live DB (`pg_dump --schema-only`), commit it, and make `migrate up` from zero produce an identical schema. Freeze the 205-file history as `migrations/archive/` for lineage. This makes the repo the source of truth again. *(1–1.5 wk.)*
- [ ] **Document & enforce the coin no-cash-out invariant in schema** *(if/when P2P is built)* — `CHECK` constraints on `coin_transactions.type` with no withdrawal/payout type; no RPC that pays a processor from a coin balance. Make the legal invariant a database guarantee, not a doc. *(0.5 wk.)*

### P1 — Portability (the environment-agnostic story)

- [ ] **Containerize the application surface.** Add a `Dockerfile` (multi-stage: build → static-serve the Vite bundle) and a `docker-compose.yml` for local dev (app + a local Postgres + a Deno function runner). Gives a buyer a "clone and `docker compose up`" path. *(1 wk.)*
- [ ] **Externalize the project ref and all endpoints.** Replace the 119 hardcoded `sssmvihxtqtohisghjet` occurrences with a single config source (env var / config module). No infra identifier as a string literal in code. *(0.5–1 wk.)*
- [ ] **Add infrastructure-as-code for the runtime topology.** Terraform (or Supabase config-as-code) capturing DB, functions, crons, RLS policies, and secrets references — so the environment is reviewable and reproducible, not dashboard-click state. *(2–3 wk.)*
- [ ] **Abstract the secrets layer** behind an interface so the buyer can back it with Vault/SSM/Secret Manager instead of the Supabase secret store. *(0.5 wk.)*
- [ ] **Define dev/staging/prod targets** (even if prod stays on Supabase short-term) so change management has a gate. *(0.5 wk.)*

### P2 — Provider-independence (the data-agnostic story)

- [ ] **Introduce the `SportDataAdapter` seam.** Create `_shared/providers/` with a common adapter interface and a `forza.ts` implementation that emits a **canonical, provider-neutral event/stat model** (Section 4). *(1.5–2 wk.)*
- [ ] **Refactor the 5 sync functions to consume the canonical model**, not Forza JSON directly. Forza stays the only adapter, but the scoring engine and DB writes no longer touch provider shape. *(2 wk.)*
- [ ] **Generalise `tournaments.forza_id` → `provider_key` + add `provider` and `sport_id` columns.** Low-blast-radius rename per the existing technical assessment; football rows keep their values. Drop the football-implied `NOT NULL` semantics. *(1–2 wk, additive migration.)*
- [ ] **Write an adapter-conformance test suite** (one fixture set, asserted against the canonical model) so a buyer can drop in an `opta.ts` and prove parity. *(1 wk.)* — *this single deliverable is what lets a buyer say "yes, we can plug in our feed."*

### P3 — Maintainability & enterprise hygiene

- [ ] **Migrate the React layer to TypeScript** (incremental, file-by-file) so the `typecheck` script means something. *(3–5 wk, parallelizable.)*
- [ ] **Extract a shared `_shared/http.ts`** to kill the duplicated provider-client code across edge functions. *(0.5 wk.)*
- [ ] **Add automated DB backup + PITR** (or document the buyer's target DR posture). *(0.5 wk + infra.)*
- [ ] **Document the Rolldown TDZ rule as a lint/CI check** (e.g., `madge --circular` gate) rather than tribal knowledge. *(0.5 wk.)*
- [ ] **Build out multi-sport modularity** per the existing (good) architecture docs — `sport` table, `circle` container, `trophy_ledger`, `SportModule` contract. *(scoped separately — this is product roadmap, priced as new build, not remediation.)*

**Estimated effort to clear P0+P1+P2 (the buyout-readiness bar): ~12–16 engineering-weeks** for a small senior team. None of it requires rewriting the game logic.

---

## 4. Sample Refactoring Pattern — Sports Data Layer Abstraction

The highest-leverage refactor, shown in the repo's actual stack (Deno + TypeScript edge functions, Postgres, React/Vite). The goal: **the scoring engine and DB never see a provider's JSON shape again — they see a canonical model.** A buyer plugs in Opta/Sportradar by writing one new adapter file, and a conformance test proves it.

### 4.1 The canonical model (provider-neutral) — `_shared/providers/types.ts`

```ts
// The shape EVERY provider must emit. The scoring engine reads ONLY this.
// Nothing below this line knows the word "Forza".

export type CanonicalMatchStatus =
  | 'scheduled' | 'live' | 'finished' | 'postponed' | 'cancelled';

export interface CanonicalEvent {
  providerKey: string;          // external match id, e.g. "f-12345" or "opta-987"
  sport: 'football' | 'f1' | 'tennis';
  status: CanonicalMatchStatus;
  startsAt: string;             // ISO 8601, UTC
  roundKey: string | null;      // canonical round id; null only if truly unknown
  home: CanonicalCompetitor;
  away: CanonicalCompetitor;
}

export interface CanonicalCompetitor {
  providerKey: string;          // external team/competitor id
  name: string;
  score: number | null;
}

// Position vocabulary is canonical, not provider-specific.
export type CanonicalPosition = 'GK' | 'DEF' | 'MID' | 'FWD';

export interface CanonicalPlayerStat {
  playerKey: string;            // external player id
  position: CanonicalPosition;
  minutes: number;
  goals: number;
  assists: number;
  cleanSheet: boolean;
  // ...the full canonical stat set the scoring engine consumes
}

// The contract every provider implements. This IS the seam a buyer plugs into.
export interface SportDataAdapter {
  readonly provider: string;            // 'forza' | 'opta' | 'sportradar' | 'manual'
  listEvents(competitionKey: string): Promise<CanonicalEvent[]>;
  getPlayerStats(matchKey: string): Promise<CanonicalPlayerStat[]>;
  health(): Promise<{ ok: boolean; detail?: string }>;
}
```

### 4.2 The Forza adapter — `_shared/providers/forza.ts`

All Forza-specific knowledge (base URL, token, JSON shape, status/position vocabulary) is now isolated in **one file**. This is where today's duplicated inline code goes to live exactly once.

```ts
import {
  SportDataAdapter, CanonicalEvent, CanonicalPlayerStat,
  CanonicalMatchStatus, CanonicalPosition,
} from './types.ts';

const FORZA_BASE = 'https://api.forzafootball.com';

// Forza's vocabulary → canonical. The ONLY place these mappings exist.
const STATUS_MAP: Record<string, CanonicalMatchStatus> = {
  not_started: 'scheduled', in_progress: 'live', finished: 'finished',
  postponed: 'postponed', cancelled: 'cancelled', abandoned: 'finished',
};
const POSITION_MAP: Record<string, CanonicalPosition> = {
  goalkeeper: 'GK', defender: 'DEF', midfielder: 'MID', attacker: 'FWD',
};

export class ForzaAdapter implements SportDataAdapter {
  readonly provider = 'forza';
  constructor(private token = Deno.env.get('FORZA_ACCESS_TOKEN')!) {}

  private async get(path: string): Promise<any> {
    const res = await fetch(`${FORZA_BASE}${path}?access_token=${this.token}`);
    if (!res.ok) throw new Error(`forza ${res.status} ${path}`);
    return res.json();
  }

  async listEvents(competitionKey: string): Promise<CanonicalEvent[]> {
    const data = await this.get(`/v1/competitions/${competitionKey}/matches`);
    // The Forza→canonical mapping that is TODAY scattered inline in sync-fixtures:
    return data.matches.map((m: any): CanonicalEvent => ({
      providerKey: `f-${m.id}`,
      sport: 'football',
      status: STATUS_MAP[m.status] ?? 'scheduled',
      startsAt: m.kickoff_at,
      roundKey: m.round != null ? String(m.round) : null,
      home: { providerKey: `f-${m.home_team.id}`, name: m.home_team.name, score: m.score?.current?.[0] ?? null },
      away: { providerKey: `f-${m.away_team.id}`, name: m.away_team.name, score: m.score?.current?.[1] ?? null },
    }));
  }

  async getPlayerStats(matchKey: string): Promise<CanonicalPlayerStat[]> {
    const id = matchKey.replace(/^f-/, '');
    const data = await this.get(`/v1/matches/${id}/player_statistics`);
    return data.players.map((p: any): CanonicalPlayerStat => ({
      playerKey: `fp-${p.id}`,
      position: POSITION_MAP[p.position] ?? 'MID',
      minutes: p.minutes_played ?? 0,
      goals: p.goals ?? 0,
      assists: p.assists ?? 0,
      cleanSheet: (p.goals_conceded ?? 0) === 0 && (p.minutes_played ?? 0) >= 60,
    }));
  }

  async health() {
    try { await this.get('/v1/health'); return { ok: true }; }
    catch (e) { return { ok: false, detail: String(e) }; }
  }
}
```

### 4.3 The registry — `_shared/providers/index.ts`

```ts
import { SportDataAdapter } from './types.ts';
import { ForzaAdapter } from './forza.ts';
// A BUYER ADDS ONE LINE HERE:  import { OptaAdapter } from './opta.ts';

const ADAPTERS: Record<string, () => SportDataAdapter> = {
  forza: () => new ForzaAdapter(),
  // opta: () => new OptaAdapter(),   ← the entire integration surface for a new provider
};

export function getAdapter(provider: string): SportDataAdapter {
  const make = ADAPTERS[provider];
  if (!make) throw new Error(`No adapter for provider: ${provider}`);
  return make();
}
```

### 4.4 The sync function, after refactor — `sync-fixtures/index.js`

The function no longer knows the word "Forza." It reads the provider from the tournament row and writes the canonical model. **This is the whole payoff:**

```ts
import { getAdapter } from '../_shared/providers/index.ts';

// tournament row now carries: { provider_key, provider, sport_id }
const adapter = getAdapter(tournament.provider);          // 'forza' today, 'opta' tomorrow
const events  = await adapter.listEvents(tournament.provider_key);

for (const ev of events) {                                 // ev is CanonicalEvent — no provider shape
  await db.from('fixtures').upsert({
    id:           ev.providerKey,
    tournament_id: tournament.provider_key,
    status:        ev.status,                              // already canonical
    home_team:     ev.home.name,
    away_team:     ev.away.name,
    score_home:    ev.home.score,
    score_away:    ev.away.score,
    round_number:  ev.roundKey,
    kickoff_at:    ev.startsAt,
  });
}
```

### 4.5 The DB seam (additive, football-safe) — migration `186_provider_generalisation.sql`

```sql
-- Re-interpret the spine generically. Football rows keep their forza_id value verbatim.
alter table tournaments rename column forza_id to provider_key;       -- same values, generic name
alter table tournaments add column provider text not null default 'forza';
alter table tournaments add column sport_id text not null default 'football';
alter table tournaments alter column provider_key drop not null;      -- F1/tennis may synthesize keys

-- No FK changes required: every child table still joins on provider_key (was forza_id).
-- An F1 season can now be inserted:  ('f1-2027', 'openf1', 'f1')  — previously impossible.
```

**Why this pattern wins for a buyer:**
- **Provider swap = one new file + one registry line.** The conformance test (P2 plan) proves parity before go-live.
- **Zero blast radius on football.** The rename preserves every existing FK value; `provider`/`sport_id` default to football.
- **The scoring engine is now provider-agnostic** — it consumes `CanonicalPlayerStat`, and never sees Opta's or Forza's JSON.
- **It is the same pattern the multi-sport design already endorses** — this refactor and the multi-sport seam are the *same* piece of work, done once.

---

## 5. What Strengthens the Asset

For balance — and because a seller's advisor should know which cards to play in the negotiation — these are the genuine strengths a buyer's diligence will (or should) credit:

1. **A legally clean ledger with no payment rails.** The single most valuable accident in the codebase: the bet system awards points/budget only, and **no money path exists anywhere.** A conservative legal review starts from "this is a game ledger," not "this is gambling infrastructure." (Objective 4 — relative strength.)
2. **Config-driven scoring, not code-driven.** `scoring_rules` (keyed by `tournament_id + position`) and `league_config` (schema-less JSONB, RLS-guarded) mean competition/league tuning happens in data, not deploys. A real abstraction a rewrite would have to re-earn.
3. **Disciplined authorization model.** RLS throughout, all value moves through `SECURITY DEFINER` RPCs with `FOR UPDATE` locking, and a write-guard trigger that closes a proven self-tamper hole. The team understands concurrency and authorization.
4. **The generalisation seams are already mapped.** The multi-sport and P2P design docs are architecturally sound and correctly identify exactly the work in Section 3/4. A buyer inherits a *plan*, not just code — and the plan agrees with this assessment.
5. **Good frontend security posture.** Strong CSP and security headers; correct secret-handling discipline (`VITE_`-prefix rule, secrets out of git).
6. **Exceptional institutional memory.** The CLAUDE.md ledger documents every migration, every known sharp edge (Rolldown TDZ, JWT note, scoring approximations) and every architectural decision. Onboarding an external team is materially de-risked by this — most acquired codebases have nothing remotely this thorough.

**The deal-shaping sentence:** *the product, the domain logic, the ledger cleanliness, and the documented seams are real assets; the platform's non-portability, provider lock-in, and schema irreproducibility are the priced-in remediation. The asset is a 4/10 today and a credible 8/10 after ~12–16 weeks of infrastructure hardening that does not touch the game.*

---

## Related Documents

- [Multi-Sport Platform Architecture](MULTI_SPORT_PLATFORM_ARCHITECTURE.md) — the target technical design this assessment's Section 4 aligns with
- [Multi-Sport Technical Assessment](MULTI_SPORT_TECHNICAL_ASSESSMENT.md) — the `forza_id` spine analysis, in depth
- [P2P Betting System Design](P2P_BETTING_SYSTEM_DESIGN.md) — the coin-ledger design behind Objective 4
- [P2P Betting Technical Assessment](P2P_BETTING_TECHNICAL_ASSESSMENT.md) — ledger separation & risk register
- [CLAUDE.md — Pilot Safeguards](../../CLAUDE.md#️-pilot-safeguards--read-before-every-db-operation) — the single-environment / no-PITR constraint cited throughout

---

Last Updated: **2026-06-20**
