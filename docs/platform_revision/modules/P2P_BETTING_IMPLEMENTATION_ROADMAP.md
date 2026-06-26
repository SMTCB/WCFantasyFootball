# P2P Coin Betting — Implementation Roadmap

**Sprint-by-sprint delivery plan for the coin-based, manager-vs-manager betting system. Pick this up when development starts.**

---

## Quick Navigation

- **For the developer starting work**: read [Sprint 0](#sprint-0--decisions--stripe-spike) first, then work the sprints in order.
- **For the why behind the architecture**: see [P2P_BETTING_SYSTEM_DESIGN.md](../architecture/P2P_BETTING_SYSTEM_DESIGN.md).
- **For what already exists and what's reusable**: see [P2P_BETTING_TECHNICAL_ASSESSMENT.md](../architecture/P2P_BETTING_TECHNICAL_ASSESSMENT.md).

---

## Context

This roadmap implements a **coin-based, peer-to-peer betting system**: managers challenge each other on in-game propositions ("my GW total beats yours", "my striker outscores your striker", "I call this match result"), stake non-withdrawable virtual coins, and the system auto-resolves from data already in the database.

Three documents make up this package:

| Document | Answers |
|---|---|
| [Technical Assessment](../architecture/P2P_BETTING_TECHNICAL_ASSESSMENT.md) | What do we already have? What's reusable? What are the risks? |
| [System Design](../architecture/P2P_BETTING_SYSTEM_DESIGN.md) | What's the target architecture — data model, RPCs, security, UI layering? |
| **This Roadmap** | In what order do we build it, and how is each piece tested and shipped? |

**The headline from the assessment:** this feature introduces no new infrastructure *categories*. It merges two proven patterns already in production — the `trade_proposals` P2P lifecycle and the auction escrow with `FOR UPDATE` locks — on top of a coin ledger modelled on the existing `squad_events` append-only table. That is why this is a roadmap of incremental slices, not a research project.

---

## Two Critical Constraints (read before planning anything)

1. **Coins are non-withdrawable virtual goods.** This is the legal invariant that keeps the product a software sale, not a gambling operation. No RPC, edge function, admin tool, or future feature may ever convert a coin balance back into money or a money-equivalent payout. Every sprint below is designed to preserve this. If a buyer later wants real-money payouts, that is *their* regulatory decision to make after acquisition — we ship the virtual-goods version.

2. **A design revamp is happening in parallel.** The roadmap therefore enforces a strict **3-layer separation** (DB RPCs → React hooks → thin presentational components). All sprints land their logic and contracts in the bottom two layers, which the revamp does not touch. UI components are deliberately thin and treated as disposable. See [UI-Agnostic Layering](../architecture/P2P_BETTING_SYSTEM_DESIGN.md) in the system design. **Sprint acceptance is defined against hooks and RPCs, never against pixels.**

---

## Delivery Approach — Why Not Pure Waterfall

The user asked whether waterfall is the right shape. It is not, quite. The chosen approach is **dependency-ordered incremental delivery**:

- There *is* a hard spine — the coin ledger (Sprint 1) is a prerequisite for literally everything else, so the early sprints are necessarily sequential. To that extent it looks waterfall.
- But every sprint from 2 onward delivers a **shippable vertical slice behind a feature flag** (`p2p_betting_enabled` league config, default `false`). The system is demonstrable and sellable at the end of each sprint, not only at the end of the project. A broadcaster demo can be cut after Sprint 4.
- This also de-risks the parallel design revamp: thin UI shipped per-sprint can be re-skinned without touching the frozen logic beneath it.

```
Sprint 0  Decisions + Stripe spike        (no production code)
   │
Sprint 1  Coin ledger foundation          ← hard dependency for all below
   │
Sprint 2  Coin purchase (Stripe)          ← first real-money path
   │
Sprint 3  P2P challenge core (escrow)     ← first manager-vs-manager slice
   │
Sprint 4  Auto-resolution engine          ← MVP COMPLETE / DEMO-READY
   │
Sprint 5  Coin sinks & economy            ← recurring-revenue lever
   │
Sprint 6  Hardening & white-label         ← buyer-handoff ready
```

**Suggested cadence:** 1–2 week sprints for a solo developer working the way this codebase has been built so far. Total ≈ 9–13 weeks elapsed. Sprints 1–4 are the critical path to a sellable demo (≈ 6–8 weeks).

---

## Cross-Cutting Conventions (apply to every sprint)

Pulled from [the assessment](../architecture/P2P_BETTING_TECHNICAL_ASSESSMENT.md) and CLAUDE.md — these are not optional:

- **Migrations are append-only and numbered.** Next free number is **186**. Never edit an applied migration.
- **Backup before every migration.** `npx supabase db dump --linked` is broken on this machine (Docker unavailable) — instead `SELECT` the specific rows a migration changes and save to `backups/*.json` first.
- **Value moves only through `SECURITY DEFINER` RPCs.** Direct client writes to any coin column are blocked by RLS + a guard trigger (same pattern as `guard_squad_protected_columns`, migration 123).
- **All non-ASCII in SQL via `chr()`** (emoji, €, arrows) — Windows file encoding corrupts literal Unicode. See migrations 154/183.
- **New `gazette_entry_type` values require `ALTER TYPE ... ADD VALUE IF NOT EXISTS`** in a migration, and registration in `ENTRY_META` in `LeagueDetailView.jsx`.
- **Every modal/bottom-sheet uses `createPortal(node, document.body)`** — `AppLayout#main-content` has `WebkitOverflowScrolling:touch` which breaks `position:fixed`. See PR #448.
- **Never `.catch()` on a Supabase query builder** — use `.then(null, handler)`. The builder has no `.catch`.
- **TDZ rule (Rolldown):** before adding an import to a child of a large screen, grep that the screen doesn't already import the same module at a different depth. Build in production (minified) to surface TDZ crashes.
- **Stripe keys are Supabase Edge Function secrets only** — never `VITE_`-prefixed, never in git.
- **Feature flag:** all UI gated on `league_config.p2p_betting_enabled` (default `false`). Real pilot leagues see zero change until explicitly enabled.
- **Coins are `bigint`**, integer-only, never fractional. Rake is computed as integer division with the remainder burned.

---

## Sprint 0 — Decisions & Stripe Spike

**Goal:** unblock the build by resolving the open product decisions and proving the Stripe path works end-to-end in test mode. No production code ships.

**Deliverables:**
- Resolve **DECISION-1 through DECISION-6** from the [system design](../architecture/P2P_BETTING_SYSTEM_DESIGN.md):
  - DECISION-1: rake percentage + whether it's configurable per-league at launch
  - DECISION-2: coin pack price points and coin amounts (the storefront SKUs)
  - DECISION-3: starting/free coin grant for new managers (acquisition vs. economy integrity)
  - DECISION-4: challenge expiry window (how long an unaccepted challenge stays open)
  - DECISION-5: whether leagues can run coin-entry prize pools at MVP or Sprint 5
  - DECISION-6: minimum/maximum stake bounds
- A Stripe **test-mode** account + test product/price created in the Stripe dashboard.
- A throwaway spike: hardcoded Stripe Checkout session created from a scratch edge function, completed in test mode, webhook received and logged. **Thrown away after** — its only purpose is to confirm the integration shape and surface surprises (webhook signing, redirect URLs, Supabase secret plumbing) before Sprint 2 depends on them.
- A one-page `backups/` note recording the chosen decision values so Sprints 1–5 can reference concrete numbers.

**Testing strategy:** manual — complete one test-mode purchase, confirm webhook fires and is signature-verified.

**Exit criteria:** all six decisions written down; a test Stripe payment round-trips to a logged webhook.

**Rollback/flag:** N/A (no production code).

---

## Sprint 1 — Coin Ledger Foundation

**Goal:** a correct, race-safe, reconcilable coin balance system. No way to earn or spend coins yet except an admin grant — this sprint is the vault, not the storefront.

**Deliverables (migration 186):**
- `coin_wallets` — one row per (user, *scope*). Columns: `balance bigint NOT NULL DEFAULT 0 CHECK (balance >= 0)`, `escrow_balance bigint NOT NULL DEFAULT 0 CHECK (escrow_balance >= 0)`, timestamps. (Scope decision — global vs per-league wallet — is captured in DECISION-5/system design; default to **global per-user** wallet unless Sprint 0 decided otherwise.)
- `coin_transactions` — append-only ledger. Signed `amount bigint`, `balance_after bigint`, `type` (enum: `purchase`, `challenge_stake`, `challenge_payout`, `challenge_refund`, `rake_burn`, `admin_adjust`, `signup_grant`), `ref_type`/`ref_id` for traceability, `created_at`.
- `_apply_coin_delta(p_user_id, p_amount, p_type, p_ref_type, p_ref_id)` — the **single chokepoint** all balance changes flow through. `SECURITY DEFINER`. `SELECT ... FOR UPDATE` on the wallet row, applies delta, writes the `coin_transactions` row with `balance_after`, rejects if it would breach the `>= 0` CHECK. This is the function every later sprint calls — never write `coin_wallets.balance` directly.
- `get_coin_wallet()` — read RPC returning the caller's balance + escrow.
- `admin_adjust_coins(p_user_id, p_amount, p_reason)` — service-role/commissioner-gated manual adjustment (for support, comps, corrections). Goes through `_apply_coin_delta` like everything else.
- **RLS:** `coin_wallets` and `coin_transactions` are SELECT-own-rows only; **zero** client INSERT/UPDATE/DELETE. A guard trigger blocks any direct write to `balance`/`escrow_balance` (mirrors `guard_squad_protected_columns`).
- **Reconciliation invariant** (the financial safety net): `SUM(coin_transactions.amount) per user == coin_wallets.balance + coin_wallets.escrow_balance`. Ship this as a SQL test you can run any time.

**Hooks layer:**
- `useCoinWallet()` — fetches balance + escrow, subscribes to `coin_wallets` Realtime for live updates. This contract is frozen here and reused by every later UI.

**Testing strategy:**
- Unit: `_apply_coin_delta` rejects negative-balance results; CHECK constraints hold.
- **Race test (R1 — double-spend):** fire N concurrent `_apply_coin_delta` debits against a wallet with funds for only some; assert exactly the funded number succeed and the invariant holds. This is the single most important test in the project — it proves the `FOR UPDATE` lock works.
- Reconciliation invariant query returns zero drift after a randomized sequence of credits/debits.

**Exit criteria:** admin can grant coins; balance is correct under concurrency; reconciliation invariant passes; no client can write a balance directly (verified with a simulated-JWT attempt).

**Rollback/flag:** tables are inert until later sprints reference them; nothing user-facing.

---

## Sprint 2 — Coin Purchase (Stripe)

**Goal:** managers can buy coin packs with real money. First real revenue path.

**Deliverables (migration 187):**
- `coin_packs` — storefront SKUs: `coins bigint`, `price_cents int`, `currency`, `stripe_price_id`, `active bool`, display ordering. Seeded from Sprint 0 decisions. **Configurable** (white-label: a buyer changes packs by editing rows, not code).
- `coin_purchases` — `stripe_session_id text UNIQUE` (the idempotency key — see R2), `user_id`, `pack_id`, `coins`, `price_cents`, `status` (`pending`/`completed`/`failed`), timestamps.
- `credit_coin_purchase(p_session_id)` — `SECURITY DEFINER`, called by the webhook function. Idempotent: if the `coin_purchases` row is already `completed`, no-op and return. Otherwise mark completed and call `_apply_coin_delta(..., type='purchase')`. The `UNIQUE` constraint + status check together make double-credit impossible even if Stripe delivers the webhook twice.

**Edge functions (deployed manually — `supabase functions deploy`):**
- `create-coin-checkout` — auth'd user JWT; takes `pack_id`; creates a Stripe Checkout session; inserts the `pending` `coin_purchases` row; returns the checkout URL.
- `stripe-coin-webhook` — `verify_jwt:false`, **verifies the Stripe signature** with the webhook secret; on `checkout.session.completed` calls `credit_coin_purchase`. Logs and 200s on duplicate events.

**Secrets:** `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` via `npx supabase secrets set`. Never in git, never `VITE_`.

**Hooks + thin UI:**
- `useCoinPacks()` — fetches active packs.
- A thin **Buy Coins** sheet (`createPortal`): lists packs, calls `create-coin-checkout`, redirects to Stripe. Deliberately minimal — the design revamp will restyle it. Logic lives in the hook, not the component.

**Testing strategy:**
- Test-mode purchase round-trips: checkout → webhook → balance credited exactly once.
- **R2 double-credit test:** replay the same `checkout.session.completed` event twice; assert balance credited once (UNIQUE + status guard).
- Signature-verification rejects an unsigned/forged webhook body.
- Reconciliation invariant still holds after purchases.

**Exit criteria:** a real test-mode card purchase credits the correct coins, exactly once, idempotently; forged webhooks rejected.

**Rollback/flag:** Buy Coins entry point gated on `p2p_betting_enabled`. Disabling the flag hides the storefront; existing balances untouched.

---

## Sprint 3 — P2P Challenge Core (Escrow)

**Goal:** managers can challenge each other and stake coins into escrow. The full lifecycle exists *except* automatic resolution (Sprint 4). Resolution can be done manually/by admin in the meantime.

**Deliverables (migration 188):**
- `p2p_challenges` — `league_id`, `challenger_id`, `opponent_id`, `proposition_type` (enum: `gw_total`, `player_vs_player`, `match_result_pick`), `proposition_params jsonb` (e.g. the two player IDs, or the picked result + fixture), `stake bigint`, `matchday_id`, `status` (`pending`/`accepted`/`declined`/`cancelled`/`resolved`/`expired`/`voided`), `outcome jsonb`, `winner_id`, timestamps + `expires_at`.
- `create_p2p_challenge(...)` — `SECURITY DEFINER`. Validates stake bounds (DECISION-6), proposition params, self-challenge guard, both are league members, flag enabled. Moves `stake` from challenger's `balance` → `escrow_balance` via `_apply_coin_delta` (type `challenge_stake`). Writes the `pending` challenge. Sets `expires_at` from DECISION-4.
- `accept_p2p_challenge(p_id)` — locks both wallets **in deterministic user_id order** (R7 deadlock prevention, same ordering rule as `accept_trade_proposal`). Validates opponent has funds, flag enabled, not expired, still `pending`. Moves opponent's stake to escrow; sets status `accepted`.
- `decline_p2p_challenge` / `cancel_p2p_challenge` — refund escrow to challenger (and opponent if accepted-then-cancelled per policy); status transitions guarded against double-action.
- `expire_p2p_challenges()` — cron-callable (`auth.uid() IS NULL` path): finds `pending` challenges past `expires_at`, refunds challenger escrow, sets `expired`.
- `void_p2p_challenge(p_id)` — commissioner/service-role escape hatch: refunds both sides, sets `voided`. For unresolvable propositions (abandoned match, data gap).
- Escrow accounting rule: a challenge always conserves coins — `stake` in escrow equals what will be paid out or refunded. Reconciliation invariant must include `escrow_balance`.
- **`gazette_entry_type`** new value `p2p_challenge` (via `ALTER TYPE`), registered in `ENTRY_META`. Optional this sprint; required by Sprint 4 for resolution posts.

**Hooks + thin UI:**
- `useP2PChallenges(leagueId)` — fetches challenges for the league filtered to the user (incoming/outgoing/history), Realtime subscription (merge UPDATE, refetch on INSERT) — same shape as `useBets`/`useTradeProposals`.
- Thin challenge UI: create-challenge form (opponent picker, proposition picker, stake slider), incoming/outgoing lists with accept/decline/cancel. All `createPortal` for any sheet. Disposable styling.
- `league_notifications` entry on challenge create/accept (reuse existing notification pattern).

**Testing strategy:**
- Lifecycle: create → accept → (manual resolve placeholder) and create → decline/cancel/expire all conserve coins.
- **R1/R7 race test:** concurrent accepts and a simultaneous cancel; assert no double-escrow, no deadlock, invariant holds.
- **R9 negative-balance test:** challenge/accept rejected when funds insufficient.
- Expiry cron refunds correctly and is idempotent.

**Exit criteria:** two managers can stake into escrow and the coins are always conserved across every terminal state; flag-gated; reconciliation (incl. escrow) passes under concurrency.

**Rollback/flag:** entire challenge surface gated on `p2p_betting_enabled`. With flag off, no challenges can be created; in-flight ones can still be voided/refunded by admin.

---

## Sprint 4 — Auto-Resolution Engine  ·  MVP COMPLETE

**Goal:** challenges resolve themselves from match data. After this sprint the product is **demo-ready and sellable**.

**Deliverables (migration 189):**
- `resolve_p2p_challenge(p_id, p_outcome jsonb)` — `SECURITY DEFINER`. Idempotent (`ALREADY_RESOLVED` short-circuit, like `resolve_bet`). On a winner: move both stakes out of escrow, compute **rake** (integer; the rake portion is burned via `_apply_coin_delta` type `rake_burn` — coins leave the economy, they are NOT cash revenue), pay the remainder to the winner (`challenge_payout`). On a draw/no-winner: refund both. Writes `outcome` + `winner_id`, sets `resolved`. Posts a `gazette_entry` (`p2p_challenge`) via `chr()`.
- **Three proposition resolvers** (the data-evaluation logic, in the resolution edge function):
  - `gw_total` — compares each manager's `fantasy_points.total` for the challenge `matchday_id`.
  - `player_vs_player` — sums each named player's `player_match_stats.fantasy_points` across the round's fixtures.
  - `match_result_pick` — reads `fixtures` home/away scores for the picked fixture.
- **`roundComplete` gate (R5):** a challenge whose proposition depends on a round only resolves once **every fixture in that round is `status='finished'`** — the exact gate `calculate-scores` uses for gazette/H2H. No mid-round resolution. This prevents paying out on a partial scoreline.

**Edge function + cron:**
- `resolve-p2p-challenges` — decoupled cron (NOT bolted onto `calculate-scores`; keeps the financial path independent of the scoring path so a scoring bug can't mis-pay coins). Selects `accepted` challenges whose round is complete, evaluates the proposition, calls `resolve_p2p_challenge`. Skips incomplete rounds and missing data. Service-role JWT.
- Schedule alongside the existing post-match scoring crons (after late-finishers, e.g. ~00:45 UTC) plus a safety hourly pass.

**Hooks + thin UI:**
- `useP2PChallenges` already surfaces `resolved` + `outcome`; add a resolved/history view and a coins-won indicator. Resolution appears in the gazette feed automatically.

**Testing strategy:**
- Each resolver against real finished-fixture data (use a settled WC round in the live DB, read-only).
- **R4 double-resolve test:** call resolve twice; second is a no-op; payout happens once.
- **R5 gate test:** a challenge on a round with one fixture still `live`/`scheduled` is NOT resolved.
- Rake math: integer rake burned, remainder paid, `stake_challenger + stake_opponent == payout + rake_burn` (coins conserved exactly).
- Full economy reconciliation after a batch of mixed wins/draws.

**Exit criteria:** create → accept → auto-resolve → winner paid, rake burned, gazette posted — with no manual step, exactly once, only after the round completes. **This is the MVP.**

**Rollback/flag:** cron can be disabled (`cron.alter_job active=false`) to halt auto-resolution while leaving manual `void`/admin tools available. Flag-gated end to end.

---

## Sprint 5 — Coin Sinks & Economy

**Goal:** give coins more to do than 1v1 bets, and turn rake/sinks into the recurring-revenue lever (sinks burn coins → managers repurchase). Strengthens the sale narrative ("a living economy, not a one-shot feature").

**Deliverables (migration 190):**
- `league_coin_pools` — optional coin-entry competitions: managers pay a coin entry fee into a pool; the pool pays out to round/season winners. Entry burns from circulation into the pool (a sink); payout returns coins to winners (so the pool nets a configurable rake-to-burn too). Gated behind DECISION-5.
- `enter_coin_pool` / `payout_coin_pool` RPCs — escrow + resolution following the exact patterns from Sprints 1/4.
- Coin **winnings leaderboard** per league (lifetime coins won via challenges + pools) — a social/competitive surface, distinct from the fantasy points leaderboard.

**Hooks + thin UI:**
- `useCoinPools(leagueId)`, extend `useCoinWallet` with a transaction-history fetch.
- **Wallet / transaction-history screen** — lists `coin_transactions` with type labels and running balance. Thin, `createPortal` where modal.

**Testing strategy:**
- Pool entry/payout conserves coins; rake-to-burn math is integer-exact.
- Leaderboard matches summed `challenge_payout` + pool winnings.
- Reconciliation invariant holds with pools in play.

**Exit criteria:** a league can run a coin-entry pool end to end; managers can see their full transaction history; economy still reconciles.

**Rollback/flag:** pools individually flag-gated; can ship Sprint 5 partially (history screen without pools) if DECISION-5 deferred.

---

## Sprint 6 — Hardening & White-Label

**Goal:** make it a buyer can switch on, re-skin, and operate without us. This is the "walk away" sprint.

**Deliverables:**
- **White-label configurability** — verify everything tenant-specific is config, not constant: rake %, stake bounds, pack SKUs/prices/currency, signup grant, expiry window, coin display name + icon, `p2p_betting_enabled` per league. Consolidated in a config table/keys (see the [white-label table in the system design](../architecture/P2P_BETTING_SYSTEM_DESIGN.md)). A buyer changes the economy by editing config rows.
- **Responsible-play guards** — per-manager daily/weekly coin-spend limits (config), a self-exclude toggle, clear "coins have no cash value / non-withdrawable" copy at every purchase point. These both protect users and are a due-diligence checkbox a media-company buyer's legal team will look for.
- **Reconciliation as an operational tool** — a scheduled reconciliation check (cron) that alerts on any drift; an admin reconciliation report. Proves the ledger's integrity on demand during buyer due diligence.
- **Test pass for the full risk register** (R1–R10 from the assessment): double-spend, Stripe double-credit, ledger drift, double-resolve, mid-round resolution, legal reclassification review, deadlock, TDZ build check, negative balance, design-churn isolation check.
- **Buyer-handoff documentation** — an operator runbook: how to set rake, add packs, rotate Stripe keys, run reconciliation, disable a league, interpret the ledger. The point of the whole exercise is that the buyer needs *us* for nothing.

**Testing strategy:**
- Load/soak: many concurrent challenges + purchases + resolutions; assert invariant and no deadlocks at volume.
- A config-only change (e.g. new rake %, new currency) takes effect with no code deploy.
- Legal re-read: confirm no code path converts coins to money or money-equivalent.

**Exit criteria:** every risk-register item has a passing test or documented mitigation; the economy is fully config-driven; an operator runbook exists; reconciliation runs on a schedule and alerts on drift.

**Rollback/flag:** N/A — hardening. The master flag remains the kill switch.

---

## Risk-to-Sprint Map

Each risk from the [assessment's register](../architecture/P2P_BETTING_TECHNICAL_ASSESSMENT.md) is owned by a sprint:

| Risk | Owned by |
|---|---|
| R1 Double-spend | Sprint 1 (lock + race test) |
| R2 Stripe double-credit | Sprint 2 (UNIQUE + idempotent credit) |
| R3 Ledger drift | Sprint 1 (reconciliation invariant), audited Sprint 6 |
| R4 Double-resolve | Sprint 4 (idempotent resolver) |
| R5 Mid-round resolution | Sprint 4 (`roundComplete` gate) |
| R6 Legal reclassification | Sprint 0 + Sprint 6 (non-withdrawable invariant + legal re-read) |
| R7 Deadlock | Sprint 3 (deterministic lock ordering) |
| R8 TDZ build crash | Every sprint (build check), formalized Sprint 6 |
| R9 Negative balance | Sprint 1 (CHECK) + Sprint 3 (insufficient-funds guard) |
| R10 Design churn | All sprints (3-layer isolation; UI is disposable) |

---

## What "Done" Looks Like

After Sprint 4 you can demo to a broadcaster: a manager buys coins with a card, challenges a friend ("my GW beats yours for 100 coins"), the friend accepts, and when the round finishes the winner is paid and it shows up in the league gazette — all automatically, all flag-gated, all reconcilable to the coin.

After Sprint 6 you can hand the keys over: a buyer flips the flag, sets their rake and pack prices in config, re-skins the thin UI with their design system, and runs it without ever calling you.

---

## Related Documents

- [P2P_BETTING_TECHNICAL_ASSESSMENT.md](../architecture/P2P_BETTING_TECHNICAL_ASSESSMENT.md) — what exists, what's reusable, the full risk register
- [P2P_BETTING_SYSTEM_DESIGN.md](../architecture/P2P_BETTING_SYSTEM_DESIGN.md) — target architecture, data model, RPC contracts, security model, open decisions
- [MULTI_SPORT_EXPANSION.md](MULTI_SPORT_EXPANSION.md) — the other value-add workstream for the sale

---

Last Updated: **2026-06-20**
