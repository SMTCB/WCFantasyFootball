# P2P Coin Betting — System Design

**The target architecture for a coin-based, manager-vs-manager betting system: data model, RPC contracts, the escrow/resolution engine, the coin economy, Stripe integration, and the UI-agnostic layering that keeps this work safe during the parallel design revamp.**

Read [P2P_BETTING_TECHNICAL_ASSESSMENT.md](P2P_BETTING_TECHNICAL_ASSESSMENT.md) first — it explains which existing patterns each piece below is copied from.

---

## Quick Navigation

- [Design Principles](#design-principles) — the non-negotiables
- [The Coin Economy](#the-coin-economy) — how money/coins/rake actually flow
- [Data Model](#data-model) — all new tables
- [RPC Contracts](#rpc-contracts) — every function, its guards, its return shape
- [The Resolution Engine](#the-resolution-engine) — how challenges settle
- [Stripe Integration](#stripe-integration) — purchase ingestion
- [Security Model](#security-model) — RLS + locking + invariants
- [UI-Agnostic Layering](#ui-agnostic-layering) — surviving the design revamp
- [White-Label Configurability](#white-label-configurability)

---

## Design Principles

1. **Coins are non-withdrawable virtual goods. Forever.** This single invariant is what keeps the product a software sale and not a regulated gambling operation. There is no code path that converts coins back to money. Stakes are symmetric; propositions are skill-based. (See [The Coin Economy](#the-coin-economy) for why this still monetizes.)

2. **The coin ledger is financial truth.** Every coin movement is a row in `coin_transactions`. `coin_wallets.balance` is a denormalized cache that must always equal the sum of the user's ledger entries. Wallet mutation and ledger insert happen in the **same transaction** — if the ledger write fails, the whole operation rolls back. (This is the one place we deliberately diverge from `_log_squad_event`'s error-swallowing.)

3. **All value movement goes through SECURITY DEFINER RPCs.** Clients can read their own wallet; they can never write to `coin_wallets` or `coin_transactions`. Copies the `guard_squad_protected_columns` posture.

4. **Resolution is idempotent and round-gated.** A challenge resolves exactly once, only after its target round is fully settled. Copies `resolve_bet`'s `ALREADY_RESOLVED` guard and `calculate-scores`'s roundComplete gate.

5. **Logic lives in the database and hooks, never in components.** The design revamp can replace every pixel without touching a line of betting logic. (See [UI-Agnostic Layering](#ui-agnostic-layering).)

6. **Everything tenant-configurable is config, not constant.** Commission rate, pack pricing, currency, spend caps — all rows in a config table, because this is being built to sell to multiple operators.

---

## The Coin Economy

This section is the conceptual core. Get this right and the rest is plumbing.

### Where revenue actually comes from

```
Real money enters ONCE, at purchase:

   User pays £5.99  ──Stripe──►  1,500 coins credited
                                       │
                                       ▼
            coins circulate inside the closed economy
            (stakes move between players, sinks burn them)
                                       │
                                       ▼
            coins NEVER convert back to money
```

**Revenue = coin pack sales.** The commission ("rake") on a P2P bet is **not** revenue in the cash sense — no money moves when two players bet coins. The rake is an **economy lever**: it removes coins from circulation on every bet, which accelerates the rate at which players run out and buy more packs. Rake drives re-purchase; purchase is the revenue.

This distinction matters for the white-label pitch: the operator's revenue line is Stripe coin sales on their branded instance. The rake is a tuning dial for how fast that revenue recurs.

### The coin sink problem

In a pure peer-to-peer system coins only move sideways — total supply never drops, so a winning player never needs to buy again. The economy needs **sinks** (coins that leave circulation permanently):

| Sink | Mechanism | Priority |
|---|---|---|
| **Bet rake** | On payout, winner receives `2 × stake − rake`; the rake is burned (logged as a `commission` ledger entry to a null/house sink) | MVP |
| **League entry fees → prize pool** | Commissioner sets a coin buy-in; coins leave wallets into a league pool; winner takes the pool at season end (pool may itself be raked) | Sprint 5 |
| **Cosmetics** | Profile/trophy-cabinet flair, gazette reaction upgrades — pure vanity, coins burned | Post-MVP |
| **Challenge boosts** | Pay coins to send an animated/loud challenge notification (ties into the "loud, social" broadcast angle) | Post-MVP |

Without at least the rake sink, the economy is non-recurring. The rake is therefore in the MVP.

### Coin flow state machine for one challenge

```
 A creates challenge (stake S)        A.balance -= S ;  A.escrow += S
            │
            ▼
 B accepts (stake S)                  B.balance -= S ;  B.escrow += S
            │                         pot = 2S held in escrow
            ▼
 round settles → resolver runs
            │
   ┌────────┴─────────┐
   ▼                  ▼
 A wins             push (tie/void)
 A.escrow -= S      A.escrow -= S ; A.balance += S   (refund)
 B.escrow -= S      B.escrow -= S ; B.balance += S   (refund)
 rake = round(2S × rate)
 A.balance += (2S − rake)
 burn(rake)
```

If B **declines** or the challenge **expires** before acceptance: `A.escrow -= S ; A.balance += S` (full refund, no rake). Rake only applies to a resolved, accepted bet with a winner.

---

## Data Model

All tables new. SQL is illustrative (final form lives in migrations `186+`). Coins are `bigint`.

### `coin_wallets` — one per user, cross-league

```sql
CREATE TABLE coin_wallets (
  user_id        uuid PRIMARY KEY REFERENCES auth.users(id),
  balance        bigint NOT NULL DEFAULT 0,   -- spendable coins
  escrow_balance bigint NOT NULL DEFAULT 0,   -- coins locked in open challenges
  lifetime_purchased bigint NOT NULL DEFAULT 0, -- analytics / responsible-play caps
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CHECK (balance >= 0),
  CHECK (escrow_balance >= 0)
);
```

> **Wallet scope decision (DECISION-1):** wallet is **user-global**, not per-league — a user buys coins once and spends them across any league. This matches the white-label vision (one balance per user per tenant instance) and the multi-sport roadmap. League-scoped accounting (entry-fee pools) is handled by the pool table, not by fragmenting the wallet. *Confirm in Sprint 0.*

### `coin_transactions` — the ledger (append-only, financial truth)

```sql
CREATE TABLE coin_transactions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id),
  type          text NOT NULL,    -- see enumerated types below
  amount        bigint NOT NULL,  -- signed: +credit / −debit
  balance_after bigint NOT NULL,  -- wallet.balance snapshot after this txn
  ref_type      text,             -- 'challenge' | 'stripe_purchase' | 'league_pool' | 'cosmetic' | 'admin'
  ref_id        uuid,             -- FK-ish pointer to the originating row
  meta          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX coin_tx_user_idx ON coin_transactions (user_id, created_at DESC);
CREATE INDEX coin_tx_ref_idx  ON coin_transactions (ref_type, ref_id);
```

**Transaction types:** `purchase`, `stake_lock`, `stake_refund`, `payout`, `commission` (rake burn), `entry_fee`, `prize_payout`, `cosmetic_spend`, `admin_adjust`, `refund` (Stripe refund reversal).

**Invariant (tested nightly):** for every user, `coin_wallets.balance = SUM(coin_transactions.amount WHERE type affects balance)` and `escrow_balance = SUM(open stake_lock − released)`.

### `coin_packs` — purchasable SKUs (tenant-configurable)

```sql
CREATE TABLE coin_packs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug           text UNIQUE NOT NULL,
  label          text NOT NULL,
  coins          bigint NOT NULL,
  price_cents    int NOT NULL,
  currency       text NOT NULL DEFAULT 'eur',
  stripe_price_id text,             -- Stripe Price object id
  bonus_coins    bigint NOT NULL DEFAULT 0,  -- "best value" marketing
  is_active      boolean NOT NULL DEFAULT true,
  sort_order     int NOT NULL DEFAULT 0
);
```

### `coin_purchases` — Stripe ingestion + idempotency

```sql
CREATE TABLE coin_purchases (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES auth.users(id),
  pack_id             uuid REFERENCES coin_packs(id),
  stripe_session_id   text UNIQUE,          -- idempotency key #1
  stripe_payment_intent text,
  coins               bigint NOT NULL,
  amount_cents        int NOT NULL,
  currency            text NOT NULL,
  status              text NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','completed','refunded','failed')),
  created_at          timestamptz NOT NULL DEFAULT now(),
  completed_at        timestamptz
);
```

The `UNIQUE` on `stripe_session_id` is the hard idempotency guarantee — a replayed webhook cannot create a second purchase row, and the credit RPC checks `status` before crediting.

### `p2p_challenges` — the bet itself (modeled on `trade_proposals` + `bet_instances`)

```sql
CREATE TABLE p2p_challenges (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id          uuid NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  challenger_user_id uuid NOT NULL REFERENCES auth.users(id),
  opponent_user_id   uuid REFERENCES auth.users(id),  -- nullable → future "open challenge"
  proposition_type   text NOT NULL,   -- 'gw_total' | 'player_vs_player' | 'match_result_pick'
  proposition_params jsonb NOT NULL DEFAULT '{}'::jsonb,  -- structured, drives the resolver
  matchday_id        text NOT NULL,   -- the round this resolves against (e.g. '429-r4')
  stake              bigint NOT NULL CHECK (stake > 0),
  status             text NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','accepted','declined','expired','cancelled','resolved','void')),
  outcome            text CHECK (outcome IN ('challenger_win','opponent_win','push','void')),
  winner_user_id     uuid REFERENCES auth.users(id),
  rake               bigint,                 -- coins burned on resolution
  accept_deadline_at timestamptz NOT NULL,   -- challenge expires if not accepted by here
  resolves_at        timestamptz NOT NULL,   -- earliest the proposition can be evaluated
  created_at         timestamptz NOT NULL DEFAULT now(),
  accepted_at        timestamptz,
  resolved_at        timestamptz
);
CREATE INDEX p2p_league_status_idx ON p2p_challenges (league_id, status);
CREATE INDEX p2p_resolve_idx       ON p2p_challenges (status, resolves_at);
```

**`proposition_params` shapes:**

| `proposition_type` | `proposition_params` | Resolves from |
|---|---|---|
| `gw_total` | `{}` (both managers' whole-squad GW total) | `fantasy_points.total` for each user's squad at `matchday_id` |
| `player_vs_player` | `{"challenger_player_id":"fp-…","opponent_player_id":"fp-…"}` | `player_match_stats` summed per player for the round |
| `match_result_pick` | `{"fixture_id":"…","challenger_pick":"home","opponent_pick":"away"}` | `fixtures.home_score/away_score` |

### `league_coin_pools` — entry-fee prize pools (Sprint 5)

```sql
CREATE TABLE league_coin_pools (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id   uuid NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  entry_fee   bigint NOT NULL,
  pool_total  bigint NOT NULL DEFAULT 0,
  status      text NOT NULL DEFAULT 'open' CHECK (status IN ('open','locked','paid_out')),
  payout_rule jsonb NOT NULL DEFAULT '{"first":1.0}'::jsonb,  -- winner-take-all default
  created_at  timestamptz NOT NULL DEFAULT now()
);
-- plus league_pool_entries (league_id, user_id, paid_at) to track who's in
```

---

## RPC Contracts

All `SECURITY DEFINER`. All return `jsonb` with `{ok: bool, …}` or `{ok:false, code, error}` — matching the existing house style. `GRANT EXECUTE` to `authenticated` only where a user legitimately initiates the action; the rest are service-role only.

### Ledger primitives (Sprint 1)

```
_apply_coin_delta(p_user_id, p_amount, p_type, p_ref_type, p_ref_id, p_meta) → void
```
Internal helper. Locks the wallet row `FOR UPDATE`, applies the signed delta to `balance` (or to `escrow_balance` for lock/release types), inserts the ledger row with `balance_after`, updates `updated_at`. **Raises** on constraint violation (negative balance) — caller's transaction rolls back. *Not* error-swallowing. Service-role only; never granted to clients.

```
get_coin_wallet() → {balance, escrow_balance, available}   -- available = balance
admin_adjust_coins(p_user_id, p_amount, p_reason) → {ok}    -- service-role only, for support/testing
```

### Purchase (Sprint 2)

```
create_coin_checkout(p_pack_id) → {ok, checkout_url}
```
Authenticated. Creates a `coin_purchases` row (`status='pending'`) and a Stripe Checkout session (via edge function), returns the redirect URL.

```
credit_coin_purchase(p_stripe_session_id) → {ok, coins}
```
Service-role only (called by the webhook edge function). Idempotent: looks up the purchase by `stripe_session_id`; if already `completed`, returns `{ok:true, coins, already:true}` without re-crediting. Otherwise marks `completed`, calls `_apply_coin_delta(…, 'purchase', …)`, bumps `lifetime_purchased`.

### Challenge lifecycle (Sprint 3) — modeled on `submit_/accept_trade_proposal`

```
create_p2p_challenge(p_league_id, p_opponent_user_id, p_proposition_type,
                     p_proposition_params, p_matchday_id, p_stake) → {ok, challenge_id}
```
Authenticated. Guards (copying trade-proposal validations):
- caller and opponent are both members of `p_league_id`; `opponent ≠ challenger`
- `p_stake > 0`; caller's **available** balance ≥ stake (lock wallet `FOR UPDATE`)
- proposition_params valid for the type (e.g. both player ids belong to the respective squads for `player_vs_player`)
- `matchday_id` round has not started (the bet must be on a future/in-progress round, never a settled one) — reuse the fixture-status check pattern from `set_lineup`
- moves `stake` from `balance` → `escrow_balance` (`stake_lock` ledger entry, `ref_type='challenge'`)
- inserts challenge `status='pending'`, writes `league_notifications` to the opponent

```
accept_p2p_challenge(p_challenge_id) → {ok}
```
Authenticated. Lock challenge `FOR UPDATE`. Guards: caller is `opponent_user_id`; `status='pending'`; `accept_deadline_at > now()`; the round still hasn't started; caller's available balance ≥ stake. Move opponent's stake to escrow, set `status='accepted'`, `accepted_at`. Notify challenger. **Lock both wallets in deterministic `user_id` order** to avoid deadlocks (copies `accept_trade_proposal`).

```
decline_p2p_challenge(p_challenge_id) → {ok}      -- opponent declines → refund challenger stake
cancel_p2p_challenge(p_challenge_id) → {ok}       -- challenger cancels while still pending → refund
```
Both refund via `stake_refund` ledger entries (`escrow → balance`), set terminal status.

### Resolution (Sprint 4)

```
resolve_p2p_challenge(p_challenge_id, p_outcome) → {ok, outcome, payout, rake}
```
Service-role context (`auth.uid() IS NULL`) — called by the resolver cron. Guards: lock challenge `FOR UPDATE`; `status='accepted'`; `ALREADY_RESOLVED` short-circuit. Effects per outcome:
- **challenger_win / opponent_win**: `rake = round(2*stake * rate)`; winner `escrow→balance` of own stake + `balance += (stake − ?)`… concretely: release both escrowed stakes, credit winner `2*stake − rake` to balance, log `payout` (winner) + `commission` (burn). Loser's escrow simply cleared.
- **push / void**: refund each side their own stake (`stake_refund`), no rake.
- set `status='resolved'`, `outcome`, `winner_user_id`, `rake`, `resolved_at`; write `gazette_entries` (`entry_type='coin_bet_result'`, headline via `chr()`).

```
expire_p2p_challenges() → {expired_count}   -- cron: pending past accept_deadline_at → refund + expire
void_p2p_challenge(p_challenge_id) → {ok}    -- commissioner/admin safety valve → refund both
```

---

## The Resolution Engine

A standalone edge function `resolve-p2p-challenges` on a cron (every 15 min during active rounds), copying `resolve-bets`:

```
1. SELECT challenges WHERE status='accepted' AND resolves_at < now()
2. For each: confirm the round (matchday_id) is fully settled
      → roundComplete check: all fixtures for that round status='finished'
        (same query resolve-bets uses; or check the gazette 'activity' marker)
      → if not settled, skip (try again next tick)
3. Evaluate the proposition → outcome:
      gw_total          → compare fantasy_points.total of both squads for matchday_id
      player_vs_player  → SUM(player_match_stats.fantasy_points) per player for the round
      match_result_pick → derive home/draw/away from fixtures, compare picks
4. Call resolve_p2p_challenge(id, outcome)  [service-role]
5. Log resolved/skipped/errors (copy resolve-bets logging)
```

**Why a decoupled cron, not a call inside `calculate-scores`:** isolation. A bug in betting resolution must never be able to break score calculation. The resolver only *reads* scoring outputs. This mirrors how `resolve-bets` already runs independently of `calculate-scores`.

**Idempotency:** `resolve_p2p_challenge`'s `status` guard means a challenge picked up twice (overlapping cron ticks) resolves once. Safe to run aggressively.

---

## Stripe Integration

Two edge functions (new):

1. **`create-coin-checkout`** — authenticated. Input `{pack_id}`. Creates the `coin_purchases` pending row, creates a Stripe Checkout Session with `client_reference_id = purchase.id` and `metadata.user_id`, returns `checkout_url`. The client redirects.

2. **`stripe-coin-webhook`** — public endpoint, **signature-verified** (`stripe-signature` header + webhook secret). Handles:
   - `checkout.session.completed` → `credit_coin_purchase(session.id)` (idempotent).
   - `charge.refunded` / `refund.created` → reverse via a `refund` ledger entry; if the refund would push balance negative, flag the account (do not allow negative — a clawback policy decision for Sprint 6).

**Secrets:** `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` stored as Supabase Edge Function secrets only (same discipline as `GROQ_API_KEY`). Never `VITE_`-prefixed.

**White-label Stripe model (DECISION-2, confirm Sprint 0):** does each tenant connect their own Stripe account (Stripe Connect / per-tenant keys) so revenue lands in *their* bank, or does the platform collect and remit? For a clean "hand over and walk away" sale, **per-tenant Stripe keys** (the buyer plugs in their own account) is strongly preferred — the operator owns their payment relationship and you touch no money. This must be a config value, not a hardcoded key.

---

## Security Model

| Surface | Rule |
|---|---|
| `coin_wallets` RLS | `SELECT` own row only. **No** client INSERT/UPDATE/DELETE. |
| `coin_transactions` RLS | `SELECT` own rows only. No client writes. |
| `coin_purchases` RLS | `SELECT` own rows only. Writes service-role. |
| `p2p_challenges` RLS | `SELECT` where caller is a member of the league (so the league sees the action feed). Writes only via RPCs. |
| `coin_packs` RLS | `SELECT` active packs for any authenticated user. Writes service-role/admin. |
| All money RPCs | `FOR UPDATE` on every wallet/challenge row touched; deterministic lock ordering by `user_id`. |
| Resolution | round-gated + `ALREADY_RESOLVED` guarded + idempotent. |
| Stripe | signature-verified webhook; `stripe_session_id UNIQUE`; status-guarded credit. |

**The reconciliation invariant** (a test, run nightly + in CI against seed data):
```sql
-- must return zero rows
SELECT w.user_id
FROM coin_wallets w
JOIN (SELECT user_id, SUM(amount) bal FROM coin_transactions
      WHERE type IN ('purchase','payout','stake_refund','prize_payout','admin_adjust','refund','cosmetic_spend','entry_fee','stake_lock','commission')
      GROUP BY user_id) l ON l.user_id = w.user_id
WHERE w.balance + w.escrow_balance <> l.bal;
```
(Exact column math finalized in Sprint 1 once the sign conventions are fixed; the point is the test exists from day one.)

---

## UI-Agnostic Layering

**This is the explicit answer to "my design revamp is happening in parallel."** The build is layered so the revamp can replace the entire presentation tier without touching logic:

```
┌─ Layer 3: Components (THIN, SWAPPABLE) ─────────────────┐
│  BuyCoinsSheet, ChallengeComposer, ChallengeCard,       │
│  CoinBalancePill, WalletHistoryView                     │
│  → zero business logic; render props + call hook actions │
│  → the design revamp rewrites these freely               │
├─ Layer 2: Hooks (STABLE DATA CONTRACT) ─────────────────┤
│  useCoinWallet()      → {balance, escrow, available, refetch}        │
│  useCoinPacks()       → {packs, buy(packId)}                         │
│  useP2PChallenges(leagueId) → {incoming, outgoing, history,         │
│       create(), accept(), decline(), cancel()}                       │
│  → these are the integration surface; keep them stable               │
├─ Layer 1: DB — RPCs, tables, crons, RLS (FROZEN ONCE SHIPPED) ──────┤
│  All logic, all guards, all money movement.                          │
└─────────────────────────────────────────────────────────────────────┘
```

**Rules for the engineer:**
- No component calls `supabase.rpc(...)` directly — always through a Layer-2 hook.
- Hooks return **plain data + action callbacks**, never JSX or styling.
- Layer-2 hook signatures are the contract with the design team: agree them early, keep them stable; the revamp builds Layer 3 against them in parallel.
- Reference components in Sprint deliverables are intentionally minimal/unstyled — they prove the hook works; they are *expected* to be replaced by the revamp.
- Respect the Vite/Rolldown TDZ rule: before importing a shared module into any child of `LeagueScreen`, check `LeagueScreen.jsx`'s imports (CLAUDE.md).

---

## White-Label Configurability

Stored in a `platform_config` table (or per-league `league_config` where league-scoped). Nothing tenant-specific is a constant.

| Config | Scope | Example |
|---|---|---|
| `coin_bet_rake_rate` | platform / league | `0.05` (5% of pot burned) |
| Coin packs (SKUs, pricing, currency) | platform | rows in `coin_packs` |
| `stripe_secret_key` / `stripe_webhook_secret` | platform (secret store) | per-tenant Stripe account |
| `coin_bet_enabled` | platform / league | feature flag for staged rollout |
| `coin_daily_spend_cap` | platform | responsible-play guard |
| `coin_min_age_confirmed` | per-user flag | age-gate at first purchase |

---

## Open Decisions — RESOLVED

> **Status (2026-07-01):** the P2P module has shipped (migrations 202–207, PRs #627–#629; see [TRACKER.md](../TRACKER.md) Phase 1A). All six Sprint-0 decisions below were resolved as recommended and are reflected in the built system. The one remaining open item is the *business* Stripe-account confirmation (zero code impact) and the launch-jurisdiction responsible-play scope — both tracked in the TRACKER's "Open Product Decisions" table.

- **DECISION-1** — Wallet scope. ✅ **Resolved: user-global** (one balance per user, spent across leagues; entry-fee pools handled by the pool table). As built in migration 202.
- **DECISION-2** — Stripe model. ✅ **Resolved: per-tenant keys** (config-driven, not hardcoded — clean handover). Payment path built with `MOCK_PAYMENTS` toggle; live Stripe-account connection is a business decision, tracked in the TRACKER.
- **DECISION-3** — Rake destination. ✅ **Resolved: pure burn** (deflationary, no accountable house balance). As built in the resolution engine (migration 205).
- **DECISION-4** — MVP proposition set. ✅ **Resolved:** `gw_total` + `player_vs_player` + `match_result_pick` shipped as the first three challenge types (migration 204).
- **DECISION-5** — Push handling. ✅ **Resolved: full refund both** on a push (no rake on a tie). As built in the resolution engine.
- **DECISION-6** — Responsible-play scope. ⬜ **Deferred** — depends on the target launch jurisdiction; revisit before a real-money go-live. Tracked as an open product decision in the TRACKER.

---

## Related Documents

- [P2P_BETTING_TECHNICAL_ASSESSMENT.md](P2P_BETTING_TECHNICAL_ASSESSMENT.md) — what exists and what's reused
- [P2P_BETTING_IMPLEMENTATION_ROADMAP.md](../product/P2P_BETTING_IMPLEMENTATION_ROADMAP.md) — sprint plan
- [H2H_COMPETITION_DESIGN.md](H2H_COMPETITION_DESIGN.md) — adjacent manager-vs-manager mechanic (reference for league-scoped competition design)

---

Last Updated: **2026-06-20**
