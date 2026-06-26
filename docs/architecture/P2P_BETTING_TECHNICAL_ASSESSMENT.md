# P2P Coin Betting — Technical Assessment

**A deep audit of the existing codebase against the requirements for a coin-based, manager-vs-manager betting system. Read this first; it explains what we already have, what is reusable, and where the genuine new work is.**

---

## Quick Navigation

- **For the product owner**: read [The Headline](#the-headline) and [Reuse Map](#reuse-map)
- **For the engineer picking this up**: read [Existing Infrastructure In Detail](#existing-infrastructure-in-detail) → [Gaps & New Work](#gaps--new-work) → [Risk Register](#risk-register)
- **Then** continue to [P2P_BETTING_SYSTEM_DESIGN.md](P2P_BETTING_SYSTEM_DESIGN.md) (the target architecture) and [P2P_BETTING_IMPLEMENTATION_ROADMAP.md](../product/P2P_BETTING_IMPLEMENTATION_ROADMAP.md) (the sprint plan).

---

## The Headline

The platform already contains **every structural pattern** the coin-based P2P betting system needs. We are not inventing new mechanisms — we are combining two existing, battle-tested ones and adding a coin ledger.

1. **Manager-vs-manager challenge lifecycle** already exists as `trade_proposals` — a proposer offers, a target accepts/declines, proposals expire, both parties get notifications. This is the exact shape of a P2P bet challenge.

2. **Escrow with atomic, race-safe balance handling** already exists as the auction system — `place_bid` and `confirm_auction_win` use `FOR UPDATE` row locks, validate balances, reserve funds, run a two-phase commit, and guard against double-claims.

3. **An append-only financial-grade audit ledger** already exists as `squad_events` + the `_log_squad_event()` SECURITY DEFINER helper. The coin ledger is a near-copy.

4. **Idempotent auto-resolution from match data** already exists as the `resolve-bets` edge function — it reads `fixtures`, derives an outcome, and calls a resolution RPC on a cron.

The genuinely new work is: a **coin wallet + ledger**, **Stripe purchase ingestion**, a **P2P challenge table**, and a **resolution engine** that evaluates propositions against data the scoring pipeline already produces (`fantasy_points`, `player_match_stats`). None of it requires new infrastructure categories.

**Confidence:** High. The hard problems (race-safe money movement, idempotent resolution, audit trails, RLS lockdown of value columns) are already solved elsewhere in this codebase and can be copied with adaptation rather than designed from scratch.

---

## Reuse Map

| New component | Built by adapting | Reuse level |
|---|---|---|
| `coin_wallets` + `coin_transactions` ledger | `squad_events` + `_log_squad_event()` | **Copy pattern** (~90%) |
| Coin debit/credit/escrow RPCs | `place_bid` / `confirm_auction_win` locking model | **Copy pattern** (~70%) |
| `p2p_challenges` table + create/accept/decline RPCs | `trade_proposals` + `submit_trade_proposal` / `accept_trade_proposal` | **Copy pattern** (~75%) |
| Challenge expiry cron | `resolve-bets` / `auto-close-bets` cron pattern | **Copy pattern** (~80%) |
| Auto-resolution engine | `resolve-bets` edge function + `calculate-scores` roundComplete gate | **Copy pattern** (~60%) |
| Notifications on challenge | `league_notifications` (used by trades) | **Direct reuse** |
| Social narrative ("X beat Y for 200 coins") | `gazette_entries` (`entry_type` enum, `chr()` rule) | **Direct reuse** |
| Value-column write protection | `guard_squad_protected_columns` trigger model | **Copy pattern** |
| Stripe purchase ingestion | *(none — genuinely new)* | **New** |
| Coin packs / SKUs | *(none — genuinely new)* | **New** |

---

## Existing Infrastructure In Detail

### 1. The commissioner betting framework (the prior generation)

Migrations 28 → 167 built a complete prediction-bet system:

- **`bet_templates`** — reusable archetypes. `answer_type ∈ {player_pick, team_pick, number, yes_no}`, `scope_type ∈ {match, matchday, season}`, `reward_type ∈ {points, budget}`.
- **`bet_instances`** — one live bet per league. `options` JSONB, `correct_answer(s)`, `deadline_at`, `resolves_at`, `status ∈ {upcoming, open, closed, resolved, cancelled}`.
- **`bet_submissions`** — one row per squad per bet, `UNIQUE (bet_instance_id, squad_id)`, marked `is_correct` + `reward_awarded` on resolution.
- **`submit_bet`** / **`resolve_bet(uuid, text[])`** — SECURITY DEFINER RPCs. `resolve_bet` evolved through 9 migrations and now: checks commissioner authorization, gates on deadline (only for the cron, `auth.uid() IS NULL`), supports multiple correct answers, "no winner" resolution, points **and** budget rewards, and immediately refreshes `league_members.total_points` via `aggregate_league_member_points`.

**What this teaches us:** the resolution authorization and idempotency model is mature. `resolve_bet`'s guard ordering (commissioner-before-deadline, `ALREADY_RESOLVED` short-circuit, service-role context detection via `auth.uid() IS NULL`) is exactly the pattern the P2P resolver needs.

**Key distinction:** these bets are **commissioner-mediated and reward points/budget**. P2P coin bets are **peer-initiated and stake/transfer coins**. The existing `bet_*` tables are *not* extended — the P2P system is a parallel structure. (Trying to overload `bet_instances` with a two-party staking model would corrupt a working system.)

### 2. The auction system — our escrow blueprint

`place_bid` and `confirm_auction_win` (current versions in [183_squad_events.sql](supabase/migrations/183_squad_events.sql)) demonstrate every technique the coin escrow needs:

- **Row locking**: `SELECT * INTO v_listing FROM auction_listings WHERE id = p_listing_id FOR UPDATE;` — prevents concurrent bid races.
- **Balance validation against a value column** (`budget_remaining`).
- **Budget reservation** (migration 111): sums all of a user's open winning bids before accepting a new one, rejecting if it would exceed available (unreserved) funds. **This is exactly the "don't let a manager stake coins they've already committed elsewhere" problem.**
- **Two-phase commit**: deadline → `pending_confirmation`, then `confirm_auction_win` does the actual transfer with re-validation (squad slot, budget, duplicate) at confirmation time.
- **Defensive cancellation**: `SELLER_GONE`, `BUYER_GONE`, `DUPLICATE`, `SQUAD_FULL` — graceful handling of state that changed between phases.

**What this teaches us:** how to move value between two parties atomically and safely. The coin escrow RPCs are a direct descendant. Note the lock-ordering discipline in `accept_trade_proposal` (locks squads in `id` order to avoid deadlocks) — the coin RPCs must do the same on wallet rows.

### 3. `trade_proposals` — our challenge lifecycle blueprint

`submit_trade_proposal` / `accept_trade_proposal` ([183_squad_events.sql:489](supabase/migrations/183_squad_events.sql)) already implement peer-to-peer offer/accept:

- Proposer creates an offer targeting another member's squad.
- Validations: ownership, both players exist, position match, sweetener affordability.
- `trade_proposals.status ∈ {pending, accepted, declined, expired, cancelled}`, `expires_at`.
- Target accepts → atomic swap with re-validation + window check + `league_notifications` + `gazette_entries`.
- Accepting one proposal auto-cancels conflicting pending proposals.

**What this teaches us:** the P2P challenge state machine is already proven. A challenge = a trade proposal where the "asset" is a coin stake and a proposition rather than a player swap. We copy: the create/accept/decline/expire lifecycle, the notification wiring, the conflicting-offer cleanup, and the re-validation-at-accept discipline.

### 4. `squad_events` — our ledger blueprint

[183_squad_events.sql](supabase/migrations/183_squad_events.sql) is an append-only audit table written exclusively through `_log_squad_event()`, a SECURITY DEFINER helper called from inside other SECURITY DEFINER RPCs, with `EXCEPTION WHEN OTHERS THEN NULL` so an audit failure can never break the underlying operation.

**What this teaches us:** the coin ledger (`coin_transactions`) is built the same way — but with one critical difference: **the coin ledger is financial truth, not just an audit trail.** Where `_log_squad_event` swallows errors, the coin ledger write must be *part of the transaction* and must fail the operation if it fails. The denormalized `coin_wallets.balance` must always equal the sum of that user's ledger entries (a reconciliation invariant we test).

### 5. Resolution timing — the `roundComplete` gate

`calculate-scores` only fires gazette entries, H2H resolution, and auto-subs once **all fixtures in a round are `finished`** (`roundComplete = true`). The `resolve-bets` cron independently checks `fixtures.status = 'finished'` before resolving.

**What this teaches us:** P2P challenges that resolve against a round's outcome must wait for the same gate. The resolver reads the same `fantasy_points` / `player_match_stats` rows the scoring pipeline produces, so it must run *after* scoring settles the round. Decoupled cron (recommended) + an explicit roundComplete check is the safe pattern — never resolve a coin bet mid-round.

### 6. Security baseline already in place

- **Value columns are write-locked**: `guard_squad_protected_columns` (migration 123) blocks direct client writes to `squads.budget_remaining` etc.; only SECURITY DEFINER RPCs (which bypass the guard as owner) can move value. The coin wallet must adopt the identical posture — RLS allows a user to *read* their own wallet, but **no** client INSERT/UPDATE/DELETE; all mutation through RPCs.
- **RLS membership checks** are standardized (the `EXISTS (SELECT 1 FROM league_members …)` idiom).
- **Service-role vs. user context** is detected via `auth.uid() IS NULL` throughout.

---

## Gaps & New Work

Everything below is genuinely new (no existing analogue to copy):

1. **Coin as a currency.** Coins are **not** `squad.budget_remaining` (that is per-squad fantasy budget, tournament-scoped, and reset per league). Coins are a **user-level, cross-league, real-money-purchased** balance. New tables, new RPCs, new RLS.

2. **Stripe purchase ingestion.** Checkout session creation (edge function), webhook handler with **idempotency** (a webhook can fire more than once — crediting coins twice is a financial bug), refund handling, and SKU configuration. This is the most external-dependency-heavy piece and the one with the least in-repo precedent.

3. **Proposition resolution logic.** The three MVP propositions (`gw_total`, `player_vs_player`, `match_result_pick`) each need an evaluator that reads existing scoring data and returns `challenger_win | opponent_win | push`. The data exists; the evaluation functions are new.

4. **The coin economy itself.** Sinks (entry fees, prize pools, cosmetics), the commission/rake model, and the relationship between rake and revenue (see design doc — rake is an *economy lever*, real revenue is coin sales).

5. **White-label configurability.** Per-tenant commission rate, pack SKUs/pricing, currency, and responsible-play caps. The platform is currently single-tenant; selling this means these must be config, not constants.

---

## Risk Register

| # | Risk | Severity | Mitigation (where proven in-repo) |
|---|---|---|---|
| R1 | **Double-spend** — a manager stakes the same coins on two challenges via a race | P0 | `FOR UPDATE` wallet-row locks + denormalized `escrow_balance`, copying `place_bid`'s reservation model (migration 111) |
| R2 | **Stripe double-credit** — webhook fires twice, coins credited twice | P0 | `stripe_session_id UNIQUE` + status guard before credit; idempotent handler |
| R3 | **Ledger drift** — `coin_wallets.balance` ≠ sum of ledger | P0 | Wallet mutation and ledger insert in the **same** transaction (unlike `_log_squad_event`, do NOT swallow errors here); nightly reconciliation query |
| R4 | **Double-resolve** — a challenge pays out twice | P0 | `status` guard (`ALREADY_RESOLVED` pattern from `resolve_bet`) + `FOR UPDATE` on the challenge row |
| R5 | **Mid-round resolution** — resolving before scores settle | P1 | roundComplete gate, copying `calculate-scores` / `resolve-bets` discipline |
| R6 | **Legal reclassification** — coins become withdrawable → gambling operator | P0 (business) | **Hard invariant: coins are non-withdrawable.** Symmetric stakes + skill-based propositions only. No cash-out path, ever. Documented in design doc. |
| R7 | **Deadlock** between two wallet locks during a transfer | P1 | Lock wallets in deterministic `user_id` order, copying `accept_trade_proposal`'s squad-id ordering |
| R8 | **TDZ build crash** from new shared imports | P1 | Follow the Vite/Rolldown TDZ rule in CLAUDE.md — check `LeagueScreen.jsx` imports before adding shared modules to children |
| R9 | **Negative balance** | P1 | `CHECK (balance >= 0 AND escrow_balance >= 0)` constraints |
| R10 | **Design revamp churn** invalidates UI work | P2 | Strict layering — all logic in RPCs + hooks; components thin and swappable (see design doc) |

---

## Currency & Conventions Notes (carried from CLAUDE.md)

- **Coins are integers** (`bigint`). No fractional coins. Display formatting is a presentation concern.
- **Non-ASCII in SQL** (emoji/symbols in gazette headlines) **must** use `chr()` — literal characters get corrupted by Windows file encoding (see migrations 154/183).
- **`gazette_entry_type` is a Postgres ENUM** — a new value (e.g. `'coin_bet_result'`) requires `ALTER TYPE … ADD VALUE IF NOT EXISTS` in a migration **and** registration in `ENTRY_META` in `LeagueDetailView.jsx`.
- **Migrations are append-only**; next number is **186**.
- **All modals use `createPortal`** (iOS Safari stacking-context rule).
- **Supabase query builder** has no `.catch()` — use `.then(null, handler)`.

---

## Related Documents

- [P2P_BETTING_SYSTEM_DESIGN.md](P2P_BETTING_SYSTEM_DESIGN.md) — target architecture, data model, RPC contracts, economy design
- [P2P_BETTING_IMPLEMENTATION_ROADMAP.md](../product/P2P_BETTING_IMPLEMENTATION_ROADMAP.md) — sprint-by-sprint delivery plan
- [MULTI_SPORT_EXPANSION.md](../product/MULTI_SPORT_EXPANSION.md) — the broader platform vision this feature sits within

---

Last Updated: **2026-06-20**
