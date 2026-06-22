# Sale-Ready Platform — Project Plan & Tracker

**The master document for the v2 build: multi-sport + P2P betting + UX redesign. Read this at the start of every session to know exactly where we stand and what comes next.**

> **Goal:** ship a platform that can be presented to a buyer with P2P coin betting, F1 and tennis sport modules, and a redesigned UI already implemented — not on a roadmap.
>
> **Framing context:** [B2B_BUYOUT_TECHNICAL_DUE_DILIGENCE.md](B2B_BUYOUT_TECHNICAL_DUE_DILIGENCE.md) explains what a corporate acquirer (DAZN, Sky, broadcaster) tests in due diligence and why the current asset scores 4/10. This plan moves it to ~8/10 by combining product feature delivery with targeted infrastructure hardening — sequenced so the product work is never blocked by the infrastructure work.

---

## Quick Status — Read This First

| Phase | Track | Weeks | Status |
|---|---|---|---|
| **0** | Foundation seams | W1 | ⬜ Not started |
| **1A** | P2P Betting | W2–W7 | ⬜ Not started |
| **1B** | F1 Module | W2–W5 | ⬜ Not started |
| **1C** | UX Redesign | W1–W9 | 🔄 In progress — Sprint UX-0 ~85% done |
| **1D** | Buyout hygiene — batch 1 | W1–W2 | 🔄 In progress — 1D-A done, 1D-B pending |
| **2** | Tennis Module | W6–W8 | ⬜ Not started |
| **3A** | Buyout hygiene — batch 2 | W9–W11 | ⬜ Not started |
| **3B** | v2 integration & deploy | W10–W12 | ⬜ Not started |

**Current active branch:** `v2` (all redesign + new feature work)
**v2 branch:** active — created off main, merged main regularly to pick up pilot bug fixes

**Next action:** complete Sprint UX-0 (remaining: `platform.spec.js` green pass + `SquadScreen` Kit Light components), then begin Phase 0 foundation seams.

---

## How Claude Should Use This Document

At the start of every v2 session:

1. Read the **Quick Status** table above — identify what's in progress or done
2. Read the **What was done last session** field inside the active phase sprint
3. Check `git log --oneline -10` on the `v2` branch to confirm what merged since last time
4. Verify if `main` was merged into `v2` since the last session (do it if not)
5. Continue with the next unchecked task in the active sprint

Update the status table and sprint task lists as work completes. When a sprint is fully done, mark it `✅ Done` in the table and add a **Session notes** entry at the bottom of the sprint block.

---

## Branch Strategy

**Two branches run in parallel:**

- `main` — the live football pilot. Bug fixes go here, deployed to Vercel immediately. Never touched for v2 feature work.
- `v2` — all new development. Not deployed until Week 12 when it replaces `main`.

**Bug fix flow:** `main` fix → Claude merges `main` into `v2` at the start of each v2 session → fixes propagate forward automatically. Nothing is ever lost. The user never needs to run a git command.

**Merge conflicts are rare** because pilot bug fixes touch existing football files (squads, scoring, lineup) while v2 work is almost entirely new files (new tables, new screens, new Edge Functions).

**At Week 12:** v2 is merged into main, deployed to Vercel, and becomes the new live app. The pilot football users are migrated seamlessly — their data is untouched throughout.

**Branch creation command (run once to start):**
```bash
git checkout main
git pull origin main
git checkout -b v2
git push -u origin v2
```

---

## Sequence Overview

The sequence is driven by one rule: **build the seams before the things that hang on them.** The Foundation seams (Phase 0) are a single week of purely additive migrations that unlock F1, tennis, circles, and the meta-league without any risk of rework. Everything else can run in parallel after that.

```
W1    W2    W3    W4    W5    W6    W7    W8    W9    W10   W11   W12
│
│─── Phase 0: Foundation seams (W1 only) ──────────────────────────────── prerequisite
│
│         └─── Phase 1A: P2P Betting (W2–W7) ──────────────────────── critical path
│         └─── Phase 1B: F1 Module (W2–W5) ──────────────────── parallel
│─── Phase 1C: UX Redesign (W1–W9) ─────────────────────────────── parallel, longest
│─── Phase 1D: Buyout hygiene batch 1 (W1–W2) ──── quick, does not block anything
│                                         └── Phase 2: Tennis (W6–W8) ── parallel
│                                                            └── Phase 3A: Buyout batch 2 (W9–W11)
│                                                                └── Phase 3B: v2 launch (W10–W12)
```

**Why P2P before F1:** P2P is the most complex system (coin ledger, Stripe, escrow, resolution engine) and has the most unknown in the estimate. Starting it earliest gives it the most runway. F1 is simpler (picks, scoring, OpenF1 adapter) and can complete in 4 weeks starting the same week.

**Why UX Redesign from W1:** it does not depend on any foundation work. The new visual identity can be applied to existing football screens immediately. More importantly, weeks 1–4 of the pilot generate the user feedback that should inform the redesign decisions — running the redesign in parallel captures that feedback rather than ignoring it.

---

## Current Baseline — What Exists Today (on `main`)

The full football fantasy platform is live in production with ~50 pilot users. Everything below is **done and deployed**, and forms the foundation the v2 build extends.

**Infrastructure:**
- Supabase project `sssmvihxtqtohisghjet` — PostgreSQL, Auth, Edge Functions, pgcron, Realtime
- React 19 + Vite + Tailwind CSS 4 on Vercel, auto-deployed from `main`
- 185 migrations applied; next migration number is `186_`
- Capacitor iOS/Android native shells (not yet submitted to stores)

**Football product (complete):**
- Draft system (classic + H2H modes) with snake/lottery allocation
- Auction market with two-phase confirm flow
- Player-to-player trade proposals
- Commissioner bet system (points and budget reward types)
- Scoring pipeline (`calculate-scores` v31, edge function with 8 crons)
- Live centre with per-fixture scoring
- Transfer market with basket, club cap, penalty transfers
- Lineup management (set_lineup, captain, bench efficiency)
- H2H round-robin schedule + standings
- Frontpage/gazette engine with AI-generated editions (Groq)
- Squad event audit trail (`squad_events`, migration 183)

**Reusable patterns the v2 build copies directly** (documented in detail in the assessments):
- `trade_proposals` lifecycle → P2P challenge lifecycle
- `place_bid` / `confirm_auction_win` escrow → coin escrow RPCs
- `squad_events` + `_log_squad_event()` → coin transaction ledger
- `resolve-bets` edge function → P2P auto-resolution
- `gazette_entries` engine → cross-sport narrative
- `league_config` JSONB → per-sport/per-league tunables
- `SECURITY DEFINER` RPC pattern → coin wallet write protection
- `guard_squad_protected_columns` trigger → coin column guard

---

## Phase 0 — Foundation Seams (W1)

**Status: ⬜ Not started**

**Goal:** introduce the three schema primitives that unlock every v2 feature without any risk of rework later. All additive — zero changes to existing football tables or query paths.

**Read first:**
- [MULTI_SPORT_TECHNICAL_ASSESSMENT.md](MULTI_SPORT_TECHNICAL_ASSESSMENT.md) — why these three things are the load-bearing seams
- [MULTI_SPORT_PLATFORM_ARCHITECTURE.md](MULTI_SPORT_PLATFORM_ARCHITECTURE.md) — §1 (Sport Abstraction), §2 (Circle Layer), §4 (Meta-League Engine)
- [MULTI_SPORT_IMPLEMENTATION_PLAN.md](../product/MULTI_SPORT_IMPLEMENTATION_PLAN.md) — Sprint 1, Sprint 2, Sprint 3 (the detailed build specs)

**What to build:**

- [ ] **Migration 186 — Sport abstraction**
  - New `sports` table: `id`, `slug` ('football'|'f1'|'tennis'), `name`, `game_model`, `data_provider`, `active`
  - Seed: football (active), f1 (inactive), tennis (inactive)
  - Add `tournaments.sport_id uuid references sports(id)` + `tournaments.provider text`
  - Backfill all existing tournaments to `sport_id = football, provider = 'forza'`
  - Test: insert a dummy non-football tournament row, confirm it works, confirm all football queries unchanged
  - Delete the dummy row

- [ ] **Migration 187 — Circle layer**
  - New `circles` table: `id`, `name`, `created_by`, `invite_code`, `created_at`
  - New `circle_members` table: `(circle_id, user_id)` PK, `role` ('owner'|'member'), `joined_at`
  - New `circle_leagues` table: `(circle_id, league_id)` PK — links any league to a circle
  - RLS: mirror `leagues`/`league_members` policy patterns
  - `create_circle(p_name)` and `join_circle_by_code(p_code)` RPCs (model on `create_league` / `join_league_by_code`, using `auth.uid()`)
  - `get_circle_feed(p_circle_id, p_limit)` RPC — union of `gazette_entries` across circle's leagues

- [ ] **Migration 188 — Trophy ledger stub**
  - New `trophy_ledger` table: `id`, `circle_id`, `league_id`, `user_id`, `sport_id`, `tournament_id`, `trophy_type` ('round_win'|'event_win'|'season_win'), `tier` (nullable — 'bronze'|'silver'|'gold'), `awarded_at`, `meta jsonb`
  - `get_circle_meta_standings(p_circle_id)` RPC stub (trophy count, v1 formula — body is a swap point)
  - RLS: circle members SELECT, no direct INSERT (modules emit via SECURITY DEFINER helpers)

- [ ] **Smoke test:** `platform.spec.js` green; football league smoke pass clean; no existing queries affected

**Exit check:** a circle can be created and joined; a non-football tournament row can be inserted; `get_circle_feed` returns merged gazette entries; every football screen works identically to pre-phase.

**Next migration after this phase:** `189_`

**Session notes:** *(update when done)*

---

## Phase 1A — P2P Betting (W2–W7)

**Status: ⬜ Not started**

**Goal:** a coin-based, manager-vs-manager challenge system with Stripe purchase ingestion, escrow, and auto-resolution. Gated behind `p2p_betting_enabled` league config key (default false) — no pilot leagues see it until explicitly enabled.

**Read first (in this order):**
1. [P2P_BETTING_TECHNICAL_ASSESSMENT.md](P2P_BETTING_TECHNICAL_ASSESSMENT.md) — what already exists and what's genuinely new
2. [P2P_BETTING_SYSTEM_DESIGN.md](P2P_BETTING_SYSTEM_DESIGN.md) — full data model, RPC contracts, security model, UI layering
3. [P2P_BETTING_IMPLEMENTATION_ROADMAP.md](../product/P2P_BETTING_IMPLEMENTATION_ROADMAP.md) — sprint-by-sprint delivery plan (Sprint 0–6); **this is the authoritative task list for this phase**

The implementation roadmap linked above is comprehensive and self-contained. The tracking below mirrors its sprint structure at a summary level so session status is visible here without re-reading the full roadmap every time.

**Legal invariant (non-negotiable):** coins are non-withdrawable virtual goods. No RPC, function, or admin tool may ever convert a coin balance back into money. Every sprint must preserve this. See [B2B_BUYOUT_TECHNICAL_DUE_DILIGENCE.md §2.4](B2B_BUYOUT_TECHNICAL_DUE_DILIGENCE.md) for why this is a buyout strength.

**UI discipline:** all sprints land logic in DB RPCs and React hooks. UI components are thin and disposable — the UX redesign (Phase 1C) re-skins them without touching any logic. Sprint acceptance is always against hooks and RPCs, never against pixels.

### Sprint P2P-0 — Decisions + Stripe spike
**Status: ⬜ Not started**
- [ ] Confirm coin pack pricing and SKUs (e.g. 500 coins = £1.99, 1,500 = £4.99, 5,000 = £12.99)
- [ ] Confirm rake rate (suggested: 5% of stake, burned — not to house)
- [ ] Confirm spend cap policy (daily, weekly, or none for MVP)
- [ ] Stripe test account spike: confirm `payment_intents` + `webhook` flow works end-to-end in Supabase Edge Function environment
- [ ] Confirm Stripe keys stored as Supabase Edge Function secrets (never `VITE_`-prefixed)
- [ ] Record all decisions in a **Session notes** entry below

### Sprint P2P-1 — Coin ledger foundation
**Status: ⬜ Not started**
- [ ] Migration 189+: `coin_wallets` (`id`, `user_id` UNIQUE, `balance int NOT NULL DEFAULT 0 CHECK >= 0`, `escrow int NOT NULL DEFAULT 0`)
- [ ] `coin_transactions` append-only ledger (`id`, `user_id`, `type` CHECK IN ('purchase','stake','win','loss','rake','refund','admin'), `amount int`, `challenge_id` nullable, `created_at`)
- [ ] `credit_coins()` and `debit_coins_to_escrow()` SECURITY DEFINER RPCs (model on `place_bid` locking)
- [ ] `guard_coin_columns` trigger (model on `guard_squad_protected_columns`) — blocks direct client writes to `coin_wallets`
- [ ] RLS: users read their own wallet and transactions; no direct INSERT
- [ ] Seed: every registered user gets a starting wallet (0 balance, awaiting first purchase or admin grant)
- [ ] Admin grant RPC for testing: `admin_grant_coins(p_user_id, p_amount)` — service-role only

### Sprint P2P-2 — Coin purchase (Stripe)
**Status: ⬜ Not started**
- [ ] `coin_packs` config table: `(id, coins, price_gbp, stripe_price_id, active)`; seed with agreed SKUs
- [ ] `purchase-coins` Edge Function: validate Stripe `payment_intent`, verify amount, call `credit_coins()`, write `coin_transactions(type='purchase')`
- [ ] Stripe webhook handler (verify signature, idempotent on `payment_intent.id`)
- [ ] `WalletScreen.jsx` (thin UI): current balance, purchase buttons per pack, transaction history
- [ ] Feature flag: `p2p_betting_enabled` league config key; WalletScreen visible to all (not league-gated)

### Sprint P2P-3 — P2P challenge core
**Status: ⬜ Not started**
- [ ] `p2p_challenges` table: `proposer_id`, `target_id`, `league_id`, `proposition_type` ('gw_total'|'player_score'|'match_result'), `proposition_params jsonb`, `stake int`, `escrow_state` ('none'|'proposer_locked'|'both_locked'), `status` ('pending'|'active'|'resolved'|'cancelled'|'expired'), `matchday_id`, `created_at`, `expires_at`, `resolved_at`
- [ ] `create_p2p_challenge()` RPC: validate target is league member, validate stake ≤ available balance, `debit_coins_to_escrow()` for proposer
- [ ] `accept_p2p_challenge()` RPC: validate target has sufficient balance, `debit_coins_to_escrow()` for target, flip to 'active'
- [ ] `decline_p2p_challenge()` / `cancel_p2p_challenge()` RPCs: refund escrow to proposer
- [ ] `expire-p2p-challenges` cron: cancel pending challenges past `expires_at`, refund escrow
- [ ] Notification on challenge sent (model on `league_notifications` used by trades)
- [ ] Gazette entry on challenge accepted (model on `trade_result` gazette entry)
- [ ] `ChallengeScreen.jsx` (thin UI): create challenge, incoming/outgoing list, history

### Sprint P2P-4 — Auto-resolution engine (MVP complete)
**Status: ⬜ Not started**
- [ ] `resolve_p2p_challenge()` RPC: reads `fantasy_points`/`player_match_stats` per proposition type, determines winner, calls `credit_coins(winner, 2*stake - rake)`, writes rake as `coin_transactions(type='rake')` to null sink
- [ ] Idempotent guard: `ALREADY_RESOLVED` error if `status` already 'resolved'
- [ ] Gate on `roundComplete`: resolution only fires after the matchday gazette `activity` entry exists
- [ ] `resolve-p2p-challenges` Edge Function + cron (hourly, model on `resolve-finished-bets`)
- [ ] Gazette entry on resolution: "X beat Y for 200 coins — GW total 48 vs 41" (using `chr()` for emoji)
- [ ] `gazette_entry_type` enum: add `p2p_result` value (`ALTER TYPE ... ADD VALUE IF NOT EXISTS`)
- [ ] Test: create a challenge, advance to 'active', manually mark matchday complete, verify auto-resolve fires and coins credit correctly

**→ MVP COMPLETE: the system is demonstrable and sellable after this sprint**

### Sprint P2P-5 — Coin sinks + economy health
**Status: ⬜ Not started** *(post-demo, before sale)*
- [ ] League entry fee via coin buy-in: commissioner sets `league_config.coin_entry_fee`; `join_league_by_code` debits on join; season-end prize pool RPC
- [ ] Challenge boost (cosmetic): pay coins to send a louder/animated challenge notification
- [ ] Economy health view (admin): total coins in circulation, rake burned to date, purchase volume

### Sprint P2P-6 — Hardening + white-label config
**Status: ⬜ Not started** *(pre-sale)*
- [ ] `p2p_config` table: `commission_rate`, `pack_pricing_override`, `spend_cap_daily`, `currency_symbol` — per-operator in the white-label model
- [ ] Full RLS audit on all coin tables (model on migration 66 + 123 security hardening sessions)
- [ ] Verify no-cash-out invariant in schema: `coin_transactions.type` CHECK has no 'withdrawal'/'payout' type; confirm in `B2B_BUYOUT_TECHNICAL_DUE_DILIGENCE.md §2.4` language
- [ ] Load test: 50 concurrent challenges resolving against the same matchday

**Session notes for Phase 1A:** *(update per session)*

---

## Phase 1B — F1 Module (W2–W5)

**Status: ⬜ Not started**

**Goal:** a prediction-based F1 fantasy module where managers pick constructors/drivers per race, scored from OpenF1 data. Isolated to its own tables, plugs into the shared sport module contract (§3 of the architecture doc).

**Read first:**
- [MULTI_SPORT_PLATFORM_ARCHITECTURE.md](MULTI_SPORT_PLATFORM_ARCHITECTURE.md) — §3 (Sport Module Contract), §5 (Data Provider Adapter)
- [MULTI_SPORT_IMPLEMENTATION_PLAN.md](../product/MULTI_SPORT_IMPLEMENTATION_PLAN.md) — Sprint 4 and Sprint 5 (F1 module detail)
- [MULTI_SPORT_EXPANSION.md](../product/MULTI_SPORT_EXPANSION.md) — F1 vision and open product questions

**Architecture rule:** F1 module owns its tables entirely. It never writes to football tables (`squads`, `fixtures`, `players`, `fantasy_points`, etc.). It emits to shared tables only: `gazette_entries`, `trophy_ledger`. It answers the module contract: `get_module_standings(league_id)` RPC.

### Sprint F1-1 — OpenF1 adapter + F1 tables
**Status: ⬜ Not started**
- [ ] `supabase/functions/_shared/providers/openf1.ts`: OpenF1 API adapter implementing `SportDataAdapter` interface (see [MULTI_SPORT_PLATFORM_ARCHITECTURE.md §5](MULTI_SPORT_PLATFORM_ARCHITECTURE.md))
  - `listEvents(tournamentKey)` → canonical race calendar events
  - `getResults(eventKey)` → qualifying + race classifications (constructor and driver positions)
  - `health()` → OpenF1 API status
- [ ] F1-specific tables (all prefixed `f1_`):
  - `f1_races`: `id`, `tournament_id`, `round_number`, `race_name`, `circuit`, `qualifying_at`, `race_at`, `status` ('scheduled'|'qualifying'|'race'|'finished')
  - `f1_picks`: `id`, `user_id`, `league_id`, `race_id`, `p1_constructor`, `p2_constructor`, `p3_constructor`, `p1_driver`, `p2_driver`, `locked_at` (null = not yet locked)
  - `f1_results`: `id`, `race_id`, `final_constructor_order jsonb`, `final_driver_order jsonb`, `entered_at`
  - `f1_fantasy_points`: `id`, `user_id`, `league_id`, `race_id`, `points numeric`, `breakdown jsonb`
- [ ] `sync-f1-calendar` Edge Function + cron (daily): reads OpenF1 race list, upserts `f1_races`
- [ ] Seed the current F1 season calendar via migration

### Sprint F1-2 — Picks + scoring engine
**Status: ⬜ Not started**
- [ ] `submit_f1_picks(p_league_id, p_race_id, picks jsonb)` RPC: validates picks before `qualifying_at` lock; `SECURITY DEFINER`; enforces no-duplicate driver/constructor picks
- [ ] `lock_f1_picks(p_race_id)` RPC: fired by cron at qualifying start — sets `locked_at` on all `f1_picks` rows for this race; locked picks cannot be changed
- [ ] `score-f1-race` Edge Function: called after race finishes; reads `f1_results`, scores `f1_picks`, writes `f1_fantasy_points`; scoring formula initially stubbed as config in `league_config` (`f1.pts_p1_constructor`, `f1.pts_p1_driver`, etc.)
- [ ] `get_module_standings(p_league_id)` RPC for F1: sums `f1_fantasy_points.points` per user, returns `[{user_id, points, rank}]` — satisfies the sport module contract (C1)
- [ ] `aggregate-f1-points` step: after each race, write `trophy_ledger` row for the race winner (C3)
- [ ] Gazette entry on race complete: "Race N complete — X leads the F1 league with Y pts"
- [ ] Picks screen (`F1PicksScreen.jsx`, thin): race calendar, pick form, standings table

**Dynamics stub note:** F1 scoring weights (`pts_p1_constructor`, etc.) are inserted as `league_config` defaults in the migration. The actual values are a product decision — populate with sensible defaults, flag for a dynamics session.

**Exit check:** picks can be submitted and locked; after manually inserting a dummy race result, `score-f1-race` runs and `f1_fantasy_points` rows are written; standings RPC returns correct data; `trophy_ledger` gets a row; gazette entry appears in circle feed.

**Session notes for Phase 1B:** *(update per session)*

---

## Phase 1C — UX Redesign (W1–W9)

**Status: ⬜ Not started**

**Goal:** apply the new visual identity across all screens (football + new F1/tennis/P2P screens), and restructure the navigation shell to accommodate multiple sports and the circle/group concept.

**Read first:**
- [MULTI_SPORT_PLATFORM_ARCHITECTURE.md §6](MULTI_SPORT_PLATFORM_ARCHITECTURE.md) — frontend architecture seams (SportContext, module screen registry, shared shell)
- [B2B_BUYOUT_TECHNICAL_DUE_DILIGENCE.md](B2B_BUYOUT_TECHNICAL_DUE_DILIGENCE.md) — the buyout doc notes frontend security posture is already good; redesign preserves the CSP and security headers

**Architecture constraint:** the redesign owns pixels and components, not data contracts. React hooks, RPCs, and DB schema are untouched by the redesign. This is enforced by the 3-layer separation documented in [P2P_BETTING_IMPLEMENTATION_ROADMAP.md](../product/P2P_BETTING_IMPLEMENTATION_ROADMAP.md).

**Rolldown TDZ warning:** the redesign will add new imports across screens. Before adding any import to a child component of a large screen, grep whether the large screen already imports that module (CLAUDE.md — Vite v8 / Rolldown TDZ Rule). Run `npm run build` before any PR merge.

### Sprint UX-0 — New visual identity applied to football
**Status: 🔄 In progress (v2 branch, ~85% done)**

**What was done pre-kickoff (v2 branch, sessions Jun 2026):**
- [x] Design tokens received and committed — source: `docs/platform_redesign/tokens/kit.css` + `TOKEN_MIGRATION.md`
- [x] Tokens applied to `src/index.css` (full `@theme` + `:root` rewrite to Kit Light)
- [x] `--brand-accent` / `--accent` white-label cascade wired (`--accent: var(--brand-accent)`)
- [x] `AppLayout.jsx` mobile bottom nav updated to `var(--shell)`
- [x] Partial screen pass: Market, Squad, Live, Auth, NotificationPanel, LeagueInviteCard
- [x] Remaining screens token pass: HomeScreen (Scores), LeagueScreen, RecapScreen, SettingsScreen, NotFoundScreen (2026-06-21/22)
- [x] `OnboardingWizard.jsx` — card background set to `var(--shell)` (immersive dark surface, correct for Kit Light one-dark-element principle) (2026-06-22)
- [x] `BrandMark.jsx` — `secondaryColor` for dark theme fixed: `var(--paper)` → `rgba(255,255,255,0.55)` (was invisible on `var(--shell)` surface in Kit Light) (2026-06-22)
- [x] `AppLayout.jsx` desktop sidebar — background moved from `var(--ink-2)` (white in Kit Light) to `var(--shell)` (dark navy); all `var(--mute)`/`var(--paper)` text replaced with `rgba(255,255,255,...)` equivalents for correct light-on-dark contrast (2026-06-22)
- [ ] `platform.spec.js` green after token pass (run before final PR merge)
- [ ] `SquadScreen.jsx` Kit Light components — MiniPitch/MiniTok pitch surface (`#2D5A27`) needs full spec (deferred per design decision above; block on design handoff)

**Deferred decisions (do not block UX-0 continuation):**
- **Tab count inside League Hub** — exact number and which tabs consolidate is TBD, pending multi-sport and P2P architecture decisions. Build tab structure to be variable. Resolve before Sprint UX-1.
- **"Frontpage" vs "Feed" naming** — "Frontpage" is Forza Times newspaper; "Feed" is gazette activity. They are different. Named "Frontpage" in the handoff. The tab label in Kit Light is an open decision tied to tab count.
- **Kit Light pitch surface** — `MiniPitch` and `MiniTok` tokens are dark-specific (hardcoded dark backgrounds). The light-direction pitch needs a full spec on `#2D5A27` green field before My Squad implementation. Deferred to Phase 2 (My Squad Kit Light).
- **Empty states** — no spec exists for empty leaderboard / empty squad / empty market in Kit Light. Improvise per screen during build; standardise in a follow-up pass.
- **Scores and Recap screens** — not in design handoff package (BRIEF says Scores "works and should be kept"). Both need a Kit Light token pass as part of UX-0 but no new layout work required.

**Note:** the first 3–4 weeks of the pilot generate real user feedback on UX pain points. Hold back redesign decisions on navigation patterns and information architecture until that feedback is available (approximately W3–W4). Apply the new visual layer (colors, typography) immediately; restructure layouts after feedback.

### Sprint UX-1 — Multi-sport shell
**Status: ⬜ Not started**
- [ ] `SportContext.jsx`: resolves active sport from active league's `tournament.sport_id`; exposes `{sport, gameModel}` to all screens
- [ ] Module screen registry in `App.jsx`: football routes wrapped as "module #1"; F1 routes registered as "module #2"; URL shape `/:sport/:leagueId/...`; URL-compat shims for existing `/squad`, `/market`, etc.
- [ ] Circle hub screen (`/`): cross-sport feed via `get_circle_feed()`, meta-standings via `get_circle_meta_standings()`, sport cards (football + F1 + tennis)
- [ ] Profile / trophy cabinet screen: `trophy_ledger` filtered by `user_id`; shows all wins across sports

### Sprint UX-2 — P2P and F1 screens (final pass)
**Status: ⬜ Not started**
- [ ] Re-skin `WalletScreen`, `ChallengeScreen` with full new visual identity
- [ ] Re-skin `F1PicksScreen` and F1 standings with full new visual identity
- [ ] Tennis bracket pick screen (thin UI, coordinates with Phase 2)
- [ ] Commissioner panel: extend to cover P2P config, F1 dynamics config, circle management

**Session notes for Phase 1C:**

**2026-06-21/22 — Sprint UX-0 screens + BrandMark + sidebar (sessions 2 and 3):**
- All remaining football screens received Kit Light token pass: `HomeScreen` (Scores), `LeagueScreen`, `RecapScreen`, `SettingsScreen`, `NotFoundScreen`, `OnboardingWizard`
- Key decisions made: (1) OnboardingWizard keeps `var(--shell)` card bg — immersive full-screen is the "one dark element" in Kit Light; all white text inside is correct on that surface. (2) Desktop sidebar moved to `var(--shell)` — aligns with mobile bottom nav, makes BrandMark `theme="dark"` work correctly against a dark surface. (3) `BrandMark.secondaryColor` for dark theme fixed to `rgba(255,255,255,0.55)` — `var(--paper)` is dark navy in Kit Light and was invisible on shell.
- Hardcoded old-dark rgba patterns replaced throughout: `rgba(0,180,216,...)` → `rgba(26,111,168,...)`, `rgba(242,238,229,...)` → `rgba(24,32,46,...)`, `text-white` on light surfaces → `text-[var(--paper)]`, `bg-cyan text-black` → `bg-cyan text-white` (accent is now dark navy, not light teal).
- **Remaining for UX-0 completion:** run `platform.spec.js` to verify no visual regressions; `SquadScreen` Kit Light components (MiniPitch/MiniTok pitch surface) blocked on design spec for `#2D5A27` green field in light context.

---

## Phase 1D — Buyout Hygiene, Batch 1 (W1–W2)

**Status: ⬜ Not started**

**Goal:** close the two P0 diligence blockers from the buyout assessment. Small, independent, zero user impact. Can run simultaneously with Phase 0 foundation seams.

**Read first:** [B2B_BUYOUT_TECHNICAL_DUE_DILIGENCE.md §2.5 and §3 (P0 items)](B2B_BUYOUT_TECHNICAL_DUE_DILIGENCE.md)

### Task 1D-A — Close the JWT signature gap (🔴 Critical)
**Status: ✅ Done (code on v2 — deploy deferred to Week 12 merge)**
- [x] In `supabase/functions/_shared/auth.ts`, rewrote `requireServiceRole()` to verify HMAC-SHA256 signature via `crypto.subtle` using `SUPABASE_JWT_SECRET`; made the function `async`; removed the signature-skipping decode-only Path B (2026-06-22)
- [x] Audited all callers — 4 functions import it: `discover-tournament`, `sync-fixtures`, `sync-player-status`, `sync-players`; all updated with `await requireServiceRole(req)` (2026-06-22)
- [ ] *(deferred to W12)* Deploy all affected functions: `npx supabase functions deploy discover-tournament sync-fixtures sync-player-status sync-players --project-ref sssmvihxtqtohisghjet`
- [ ] *(deferred to W12)* Test: a request with a valid-shaped but forged service-role JWT is rejected with 401

**Note:** these 4 functions are not deployed to prod from v2. Deploy happens at Week 12 merge. The pilot's live `_shared/auth.ts` on `main` is unchanged — pilot is unaffected.

**Why this matters:** [B2B_BUYOUT_TECHNICAL_DUE_DILIGENCE.md §2.5](B2B_BUYOUT_TECHNICAL_DUE_DILIGENCE.md) — "A forged token with `role: service_role` in the payload would pass this path. This is the kind of finding that ends negotiations or knocks a material number off the price."

### Task 1D-B — Schema reproducibility baseline
**Status: ⬜ Not started**
- [ ] Generate a `000_baseline.sql` from the live DB: `pg_dump --schema-only` via Supabase dashboard (Docker is unavailable, so use the dashboard's SQL export feature)
- [ ] Commit as `supabase/migrations/000_baseline.sql`
- [ ] Move the 185 existing migration files to `supabase/migrations/archive/` — kept for lineage, not applied during a fresh setup
- [ ] Add a `README.md` to `supabase/migrations/` explaining: "Fresh setup runs `000_baseline.sql` then any migrations above `185_`. The `archive/` folder is historical lineage only."
- [ ] Verify: `000_baseline.sql` + all v2 migrations from `186_` onwards produce an identical schema to the live DB

**Why this matters:** [B2B_BUYOUT_TECHNICAL_DUE_DILIGENCE.md §2.5](B2B_BUYOUT_TECHNICAL_DUE_DILIGENCE.md) — "The repo is not the source of truth for the schema — the live DB is. A buyer cannot stand up an identical environment from `git clone` + `migrate up`."

**Session notes for Phase 1D:**

**2026-06-22 — Task 1D-A complete (code only, deploy deferred):**
- `requireServiceRole()` in `_shared/auth.ts` rewritten as async; Path B now verifies HMAC-SHA256 signature via `crypto.subtle` using `SUPABASE_JWT_SECRET` before trusting any claim. Old Path B decoded the JWT payload without any signature check — a forged `{"role":"service_role"}` payload would have passed.
- All 4 callers updated: `discover-tournament`, `sync-fixtures`, `sync-player-status`, `sync-players`.
- None of these functions are deployed from v2 to prod — deploy happens at Week 12 merge alongside all other v2 changes. Pilot is unaffected.
- Task 1D-B (schema reproducibility baseline) still pending — requires Docker-free pg_dump via Supabase dashboard SQL export; deferred to a standalone session.

---

## Phase 2 — Tennis Module (W6–W8)

**Status: ⬜ Not started**

**Goal:** a bracket-pick tennis module using manual result entry (Phase 1 of the tennis strategy — TheSportsDB integration is Phase 2, post-sale). Commissioners enter match results; managers pick who advances each round of a Grand Slam.

**Read first:**
- [MULTI_SPORT_PLATFORM_ARCHITECTURE.md §5](MULTI_SPORT_PLATFORM_ARCHITECTURE.md) — manual result entry pattern (`manual_results` table, `manual` adapter)
- [MULTI_SPORT_IMPLEMENTATION_PLAN.md](../product/MULTI_SPORT_IMPLEMENTATION_PLAN.md) — Sprint 6 and Sprint 7 (Tennis module detail)
- [MULTI_SPORT_EXPANSION.md](../product/MULTI_SPORT_EXPANSION.md) — tennis vision and open product questions

**Why manual entry first:** the data coverage is the bottleneck, not the game mechanic. Manual entry ships something playable for the 2027 Australian Open. TheSportsDB integration is an enhancement that can be added later without changing any game tables.

### Sprint T-1 — Manual result entry + tennis tables
**Status: ⬜ Not started**
- [ ] `manual_results` table: `id`, `tournament_id`, `event_key` (e.g. 'ao-2027-r2'), `entered_by uuid references users`, `payload jsonb` (`{player_id, round_reached, eliminated_by}`)
- [ ] `tennis_tournaments` table: `id`, `provider_key`, `name`, `surface`, `grand_slam boolean`, `draw_size`, `start_date`, `end_date`, `status`
- [ ] `tennis_bracket_picks`: `id`, `user_id`, `league_id`, `tournament_id`, `picks jsonb` (`{round: player_id_picked_to_advance}`), `locked_at`
- [ ] `tennis_fantasy_points`: `id`, `user_id`, `league_id`, `tournament_id`, `points numeric`, `breakdown jsonb`
- [ ] `enter_tennis_result(p_tournament_id, p_event_key, p_payload)` RPC: commissioner-only, upserts `manual_results`
- [ ] Gazette moment on result entry: "Commissioner: [Player] eliminated in Round 2 — [Player] advances"
- [ ] Seed: 2027 Australian Open bracket (128-draw singles) as a `tennis_tournaments` row + initial empty `manual_results`

### Sprint T-2 — Pick submission + scoring
**Status: ⬜ Not started**
- [ ] `submit_tennis_picks(p_league_id, p_tournament_id, picks jsonb)` RPC: validates picks before tournament start; picks locked once the first match result is entered
- [ ] `score-tennis-round` Edge Function: after each `manual_results` insert, scores `tennis_bracket_picks` against it; writes `tennis_fantasy_points`; scoring formula in `league_config` (`tennis.pts_correct_round_pick`, `tennis.pts_champion_pick`, etc.)
- [ ] `get_module_standings()` for tennis: sums `tennis_fantasy_points.points` per user
- [ ] `trophy_ledger` row emitted for tournament winner (C3 contract)
- [ ] Tennis pick screen (`TennisPicksScreen.jsx`, thin): bracket display, pick form, result feed

**Exit check:** picks submitted; commissioner enters a round result; scoring runs; standings update; trophy ledger row written; gazette entry appears in circle feed.

**Session notes for Phase 2:** *(update per session)*

---

## Phase 3A — Buyout Hygiene, Batch 2 (W9–W11)

**Status: ⬜ Not started**

**Goal:** move from buyout score ~6 to ~8 by addressing the portability and provider-independence gaps. These are infrastructure tasks that do not affect any game logic — safe to do after all product features are complete.

**Read first:** [B2B_BUYOUT_TECHNICAL_DUE_DILIGENCE.md §3 (P1 and P2 items)](B2B_BUYOUT_TECHNICAL_DUE_DILIGENCE.md)

### Task 3A-A — Provider adapter seam
**Status: ⬜ Not started** *(happens naturally as part of F1/tennis work — verify at this point)*
- [ ] Confirm `supabase/functions/_shared/providers/` exists with at minimum:
  - `types.ts` — canonical model (`CanonicalEvent`, `CanonicalPlayerStat`, `SportDataAdapter` interface) as specified in [B2B_BUYOUT_TECHNICAL_DUE_DILIGENCE.md §4](B2B_BUYOUT_TECHNICAL_DUE_DILIGENCE.md)
  - `openf1.ts` — F1 adapter (built in Phase 1B)
  - `manual.ts` — manual adapter for tennis (built in Phase 2)
- [ ] Extract Forza-specific code from `sync-fixtures`, `sync-players`, `ingest-match-events` into `providers/forza.ts`
- [ ] Update the 5 sync functions to call `getAdapter(tournament.provider)` rather than inlining Forza calls
- [ ] Verify a new provider can be added by writing one file + one registry line (confirm with a stub `opta.ts` adapter — implement `health()` only, no real API calls)

### Task 3A-B — Externalize the project reference
**Status: ⬜ Not started**
- [ ] Create `supabase/functions/_shared/config.ts`: exports `PROJECT_REF`, `SUPABASE_URL`, etc. from `Deno.env` rather than hardcoded
- [ ] Replace all 119 occurrences of `sssmvihxtqtohisghjet` in `supabase/functions/` with `config.PROJECT_REF`
- [ ] Replace in docs and scripts (grep-and-replace; verify none remain in code files)
- [ ] Confirm environment works with the ref as a variable

### Task 3A-C — Containerization
**Status: ⬜ Not started**
- [ ] `Dockerfile` (multi-stage): stage 1 = `node:20-alpine`, `npm run build` → `dist/`; stage 2 = `nginx:alpine`, serve `dist/` with the same security headers as `vercel.json`
- [ ] `docker-compose.yml`: app container + local Postgres (for frontend dev without Supabase CLI); document that Edge Functions still need Supabase CLI locally
- [ ] `.dockerignore`: exclude `node_modules/`, `dist/`, `.env.local`, `.claude/`
- [ ] Verify: `docker build -t forzafantasy .` succeeds; `docker run -p 3000:80` serves the built app
- [ ] Add to README: "Run locally with Docker: `docker compose up`"

### Task 3A-D — Dev/staging/prod environments defined
**Status: ⬜ Not started**
- [ ] Document the three environments and their current state:
  - `prod`: Supabase project `sssmvihxtqtohisghjet` + Vercel `wc-fantasy-football.vercel.app`
  - `staging`: to be provisioned by buyer (or create a second Supabase project for demo purposes)
  - `local`: Docker compose + Supabase local dev CLI
- [ ] Commit a `.env.example` that covers all three deployment targets
- [ ] Add `staging` Vercel environment (if budget allows before sale — nice-to-have, not blocking)

**Session notes for Phase 3A:** *(update per session)*

---

## Phase 3B — v2 Integration & Deploy (W10–W12)

**Status: ⬜ Not started**

**Goal:** merge v2 into main, run a full platform smoke test, and deploy to production. The pilot football users are migrated seamlessly — their data is unchanged.

### Pre-merge checklist
**Status: ⬜ Not started**
- [ ] All v2 phase sprints marked complete in this document
- [ ] `platform.spec.js` green on v2 branch (36 tests × 2 browsers)
- [ ] Football smoke pass on v2: login → squad → transfer → league → live → recap
- [ ] P2P smoke pass: create wallet, purchase test coins, create challenge, resolve challenge
- [ ] F1 smoke pass: create F1 league, submit picks, enter test result, verify scores
- [ ] Tennis smoke pass: submit picks, enter result, verify scores
- [ ] No Rolldown TDZ crashes: `npm run build` clean, `npx madge --circular src/` no new cycles
- [ ] `npm run lint` clean
- [ ] All `supabase/functions/` deployed to production project ref

### Deploy sequence
**Status: ⬜ Not started**
- [ ] Merge `main` into `v2` one final time (pick up any last pilot fixes)
- [ ] Open PR: `v2` → `main`
- [ ] Review PR diff: confirm no football data or auth paths are broken
- [ ] Merge PR (squash)
- [ ] Vercel auto-deploys main → verify deployment succeeds
- [ ] Post-deploy smoke: login with a real pilot user account, verify squad/points are intact
- [ ] Deploy all Edge Functions manually (Vercel only deploys the React frontend):
  ```bash
  npx supabase functions deploy <each function> --project-ref sssmvihxtqtohisghjet
  ```
- [ ] Verify all crons are running: `SELECT jobname, schedule, active FROM cron.job ORDER BY jobname;`

**Session notes for Phase 3B:** *(update per session)*

---

## Open Decisions — Require Input Before Building

These are product decisions that cannot be defaulted away. They must be made before the relevant sprint starts.

| Decision | Needed by | Current status |
|---|---|---|
| Coin pack SKUs and pricing | Sprint P2P-0 | ⬜ Not decided |
| Rake rate (% of stake burned) | Sprint P2P-0 | ⬜ Not decided |
| Spend cap policy (daily/weekly/none for MVP) | Sprint P2P-0 | ⬜ Not decided |
| Meta-league scoring formula (trophy count vs Olympic points vs hybrid) | Phase 3B | ⬜ Deferred — build ledger first, formula is a swappable function |
| F1 scoring weights (pts per constructor position, per driver position) | Sprint F1-2 | ⬜ Needs dynamics session |
| Circle invite fan-out policy (auto-join leagues vs opt-in per league) | Sprint UX-1 | ⬜ Not decided |
| Tennis scoring weights (pts per correct round pick) | Sprint T-2 | ⬜ Needs dynamics session |
| Staging environment budget (second Supabase project for buyer demos) | Phase 3A | ⬜ Not decided |
| New visual identity spec (design tokens, typography, component library) | Sprint UX-0 | ⬜ Not received yet |

---

## Cross-Cutting Rules (Every Sprint)

These apply throughout the v2 build. They are documented in CLAUDE.md and the assessment docs — collected here for quick reference.

1. **Migrations are append-only.** Next free number is `186_`. Never edit an applied migration.
2. **Backup before every migration.** `npx supabase db dump --linked` is broken on this machine (Docker unavailable) — `SELECT` the specific rows being changed and save to `backups/*.json` first.
3. **Football stays green.** `platform.spec.js` and a manual football smoke pass at the end of every sprint that touches shared infrastructure.
4. **Value moves only through `SECURITY DEFINER` RPCs.** Clients never write directly to coin or budget columns.
5. **All non-ASCII in SQL via `chr()`** — Windows encoding corrupts literal emoji/arrows. See migrations 154 and 183.
6. **`gazette_entry_type` new values require `ALTER TYPE ... ADD VALUE IF NOT EXISTS`** + registration in `ENTRY_META` in `LeagueDetailView.jsx`.
7. **All modals/bottom-sheets use `createPortal(node, document.body)`** — `AppLayout#main-content` breaks `position:fixed`. See PR #448.
8. **Never `.catch()` on a Supabase query builder** — use `.then(null, handler)`.
9. **Rolldown TDZ rule:** before adding any import to a child of a large screen, grep whether the screen already imports that module at a different depth. Always run `npm run build` before merging. See CLAUDE.md — Vite v8 / Rolldown rule.
10. **Stripe keys are Edge Function secrets only** — never `VITE_`-prefixed, never in git.
11. **Edge Functions are NOT auto-deployed by Vercel** — after any PR that touches `supabase/functions/`, manually deploy: `npx supabase functions deploy <name> --project-ref sssmvihxtqtohisghjet`.

---

## Reference Documents Index

All documents this plan is built on — read these for design detail before starting any sprint.

### Architecture (this folder)
| Document | Purpose | Relevant to |
|---|---|---|
| [B2B_BUYOUT_TECHNICAL_DUE_DILIGENCE.md](B2B_BUYOUT_TECHNICAL_DUE_DILIGENCE.md) | What an acquirer tests; gap analysis; remediation plan; buyout score | Phases 1D, 3A, overall goal |
| [MULTI_SPORT_PLATFORM_ARCHITECTURE.md](MULTI_SPORT_PLATFORM_ARCHITECTURE.md) | Target data model for circles, sport abstraction, trophy ledger, module contract, provider adapter | Phase 0, 1B, 2 |
| [MULTI_SPORT_TECHNICAL_ASSESSMENT.md](MULTI_SPORT_TECHNICAL_ASSESSMENT.md) | Current-state grounding: what generalises already, what is football-coupled | Phase 0 context |
| [P2P_BETTING_SYSTEM_DESIGN.md](P2P_BETTING_SYSTEM_DESIGN.md) | Full P2P data model, RPC contracts, coin economy, Stripe, security, UI layering | Phase 1A |
| [P2P_BETTING_TECHNICAL_ASSESSMENT.md](P2P_BETTING_TECHNICAL_ASSESSMENT.md) | What's reusable, what's new, risk register for P2P | Phase 1A |
| [H2H_COMPETITION_DESIGN.md](H2H_COMPETITION_DESIGN.md) | Example of how an isolated competition layer was added cleanly — template for F1/tennis | Phase 1B, 2 |
| [FANTASY_POINTS_SCORING_LAYER.md](FANTASY_POINTS_SCORING_LAYER.md) | Football scoring pipeline internals — referenced by P2P auto-resolution | Phase 1A Sprint 4 |
| [DRAFT_SYSTEM_DESIGN.md](DRAFT_SYSTEM_DESIGN.md) | Draft mechanics — context for what the v2 platform inherits | Background |

### Product (../product/)
| Document | Purpose | Relevant to |
|---|---|---|
| [P2P_BETTING_IMPLEMENTATION_ROADMAP.md](../product/P2P_BETTING_IMPLEMENTATION_ROADMAP.md) | Sprint-by-sprint P2P delivery plan with conventions and acceptance criteria | Phase 1A (authoritative task list) |
| [MULTI_SPORT_IMPLEMENTATION_PLAN.md](../product/MULTI_SPORT_IMPLEMENTATION_PLAN.md) | Sprint-by-sprint multi-sport delivery plan with exit checks | Phases 0, 1B, 2 (authoritative task list) |
| [MULTI_SPORT_EXPANSION.md](../product/MULTI_SPORT_EXPANSION.md) | Vision, strategy, and open product questions for multi-sport | Context for decisions |
| [12_MONTH_ROADMAP_2026_2027.md](../product/12_MONTH_ROADMAP_2026_2027.md) | Broader product roadmap and timeline targets | Strategic alignment |

---

Last Updated: **2026-06-21**
Author: session planning (Claude + user)
