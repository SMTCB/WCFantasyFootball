# Sale-Ready Platform — Project Plan & Tracker

**The master document for the v2 build: multi-sport + P2P betting + UX redesign. Read this at the start of every session to know exactly where we stand and what comes next.**

> **Goal:** ship a platform that can be presented to a buyer with P2P coin betting, F1 and tennis sport modules, and a redesigned UI already implemented — not on a roadmap.
>
> **Framing context:** [B2B_BUYOUT_TECHNICAL_DUE_DILIGENCE.md](B2B_BUYOUT_TECHNICAL_DUE_DILIGENCE.md) explains what a corporate acquirer (DAZN, Sky, broadcaster) tests in due diligence and why the current asset scores 4/10. This plan moves it to ~8/10 by combining product feature delivery with targeted infrastructure hardening — sequenced so the product work is never blocked by the infrastructure work.

---

## Quick Status — Read This First

| Phase | Track | Weeks | Status |
|---|---|---|---|
| **0** | Foundation seams | W1 | ✅ Done |
| **1A** | P2P Betting | W2–W7 | ⬜ Not started (Stripe deferred; Sprint 0 decisions needed) |
| **1B** | F1 Module | W2–W5 | ✅ Done (Sprints 0–3, PR #606) |
| **1C** | UX Redesign | W1–W9 | 🔄 In progress — Sprint UX-0 ✅ done, UX-1 next |
| **1D** | Buyout hygiene — batch 1 | W1–W2 | 🔄 In progress — 1D-A done, 1D-B pending |
| **1E** | Clubhouse social architecture | W3–W8 | ✅ Done — CH-0–CH-9 complete (PRs #607–#615). Clubhouse shell shipped. |
| **2** | Tennis Module | W6–W8 | 🔄 In progress — T-0–T-3 ✅ (PRs #617–620), T-4 UI next |
| **3A** | Buyout hygiene — batch 2 | W9–W11 | ⬜ Not started |
| **3B** | v2 integration & deploy | W10–W12 | ⬜ Not started |

**Current active branch:** `v2` (all redesign + new feature work)
**v2 branch:** active — created off main, merged main regularly to pick up pilot bug fixes

**Next actions (parallel tracks):**
- **Phase 1E — Clubhouse:** ✅ COMPLETE — CH-0–CH-9 all shipped (PRs #607–#615). Clubhouse shell done.
- **Phase 1A — P2P Betting:** 5 product decisions needed before Sprint 1 (Stripe deferred; see Sprint P2P-0). Can start Sprint 1 (coin ledger) once decisions are made.
- **Phase 1D-B:** schema reproducibility baseline — standalone, can do any session.
- **Phase 2 — Tennis:** T-0–T-3 ✅ (PRs #617–620, migrations 197–201 + 4 Edge Functions). Sprint T-4 next (UI screens + hooks).
- **Phase 1B remaining:** F1-4 smoke tests + F1-5 OpenF1 sync cron — both optional pre-MVP.

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
│         └─── Phase 1A: P2P Betting (W2–W7, Stripe deferred) ─────── critical path
│         └─── Phase 1B: F1 Module (W2–W5) ✅ DONE ──────────── parallel
│─── Phase 1C: UX Redesign (W1–W9) ─────────────────────────────── parallel, longest
│─── Phase 1D: Buyout hygiene batch 1 (W1–W2) ──── quick
│               └─── Phase 1E: Clubhouse social architecture (W3–W8) ── NEW, parallel
│                                         └── Phase 2: Tennis (W6–W8) ── parallel
│                                                            └── Phase 3A: Buyout batch 2 (W9–W11)
│                                                                └── Phase 3B: v2 launch (W10–W12)
```

**Phase 1E dependency note:** CH-0 (DB layer) must land before Tennis Sprint T-0 (which needs `circle_player_boxes`). CH-1 (Clubhouse shell UI) is the prerequisite for Phase 1C Sprint UX-1 (multi-sport shell) — they are the same thing viewed from different angles and should be built together.

**Why P2P before F1:** P2P is the most complex system (coin ledger, Stripe, escrow, resolution engine) and has the most unknown in the estimate. Starting it earliest gives it the most runway. F1 is simpler (picks, scoring, OpenF1 adapter) and can complete in 4 weeks starting the same week.

**Why UX Redesign from W1:** it does not depend on any foundation work. The new visual identity can be applied to existing football screens immediately. More importantly, weeks 1–4 of the pilot generate the user feedback that should inform the redesign decisions — running the redesign in parallel captures that feedback rather than ignoring it.

---

## Current Baseline — What Exists Today (on `main`)

The full football fantasy platform is live in production with ~50 pilot users. Everything below is **done and deployed**, and forms the foundation the v2 build extends.

**Infrastructure:**
- Supabase project `sssmvihxtqtohisghjet` — PostgreSQL, Auth, Edge Functions, pgcron, Realtime
- React 19 + Vite + Tailwind CSS 4 on Vercel, auto-deployed from `main`
- 185 migrations applied to `main`; v2 branch is at migration `201_` — next is `202_`
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

**Status: ✅ Done (v2 branch, 2026-06-22)**

**Goal:** introduce the three schema primitives that unlock every v2 feature without any risk of rework later. All additive — zero changes to existing football tables or query paths.

**What was built:**

- [x] **Migration 187 — Sport abstraction** (`187_sport_abstraction.sql`)
  - `sports` table with 3 seeded rows (football active, f1/tennis inactive) and deterministic IDs
  - `tournaments.sport_id` + `tournaments.provider` added as nullable columns
  - All 4 existing tournaments backfilled to football/forza
  - Note: 186 was already taken by a pilot fix — numbering shifted by 1

- [x] **Migration 188 — Circle layer** (`188_circle_layer.sql`)
  - `circles`, `circle_members`, `circle_leagues` tables with RLS
  - `create_circle(p_name)`, `join_circle_by_code(p_code)`, `get_circle_feed(p_circle_id, p_limit)` RPCs
  - RLS ordering fix: all tables created before any policy (policies reference sibling tables)

- [x] **Migration 189 — Trophy ledger stub** (`189_trophy_ledger.sql`)
  - `trophy_ledger` table with full FK chain (circle→league→user→sport→tournament)
  - `get_circle_meta_standings(p_circle_id)` RPC (v1: trophy count, tiebreak gold→silver→bronze)
  - RPC body is explicit swap point for future formula upgrades

- [x] **Smoke test:** 84/84 `platform.spec.js` green; pilot unaffected

**Next migration:** `190_`

**Session notes (2026-06-22):**
- Migrations applied to live DB (single environment — no staging). All additive, zero pilot impact confirmed.
- Pre-migration backup saved to `backups/pre_phase0_tournaments_20260622.json` (4 tournament rows).
- Branch hygiene incident: migration 189 was accidentally committed to `main` due to undetected branch switch. Caught immediately, undone with `git reset HEAD~1`, recommitted to `v2`. `main` confirmed clean. Pushed both branches. Added branch-switch detection to session awareness.

**Retrospective note (2026-06-23 — Clubhouse social architecture scoped):**
- The "Circle" concept built in Phase 0 is the direct foundation for **The Clubhouse** (the renamed primary social container). No DB rename required — `circles` table stays as-is; "Clubhouse" is a UI label only.
- `circle_paddocks` junction table (migration 191) already links F1 Paddocks to a Clubhouse. Pattern: `circle_leagues` (football) + `circle_paddocks` (F1) + `circle_player_boxes` (Tennis, TBD in Tennis migration).
- Phase 1E builds on top of Phase 0 — the skeleton exists, the social features (chat channels, DMs, clubhouse-level frontpage, P2P flag) are what Phase 1E adds.

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

**Status: ✅ Done (Sprints 0–3, PR #606, 2026-06-22)**

**Goal:** a prediction-based F1 module — managers pick P1/P2/P3 podium, DNF driver, team, and a special category question per race, plus season-long championship bets. Results auto-scored from OpenF1 data. Competitions isolated inside **Paddocks** (F1 equivalent of football leagues). Built on top of the existing FantasyF1 codebase, ported to Vite/React.

**Authoritative plan:** 📋 [F1_MODULE_IMPLEMENTATION_PLAN.md](../product/F1_MODULE_IMPLEMENTATION_PLAN.md)
— read this before touching any F1 code. Contains the full repo assessment, all architecture decisions, sprint-by-sprint task lists with SQL and pseudocode, and open decisions log.

**Key architecture decisions (do not re-debate without reading the plan):**
- **Game model:** prediction bets (P1/P2/P3 + DNF + team + special category), NOT fantasy squad
- **Group concept:** **Paddock** (not league). `paddocks` + `paddock_members` tables, invite code join
- **Bets:** global per user — one set of picks per race regardless of how many paddocks the user belongs to. Leaderboard = filter global scores by paddock membership
- **Framework:** ported to Vite/React in this monorepo (not kept as a separate Next.js app)
- **Chat:** Circle-level only — no per-paddock chat
- **Gazette:** Circle-level only — post-race gazette entries appear in the Circle feed
- **Trophy ledger:** holistic across all sports via `trophy_ledger` (migration 189)
- **Data provider:** OpenF1 (open, no API key, free) — same adapter as assessed in FantasyF1 repo

**Architecture rule:** F1 module owns its tables entirely (`f1_races`, `f1_bets_race`, `f1_bets_year`, `f1_scores`, `f1_year_results`, `paddocks`, `paddock_members`). It never writes to football tables. It emits to shared tables only: `gazette_entries`, `trophy_ledger`. The `circle_paddocks` junction links paddocks into the Circle layer.

### Sprint summary (see plan for full task lists)

| Sprint | Goal | Effort | Migrations |
|---|---|---|---|
| **F1-0** | DB schema — paddocks, F1 tables, RPCs, 2026 calendar seed | ~4h | 190, 191 |
| **F1-1** | Port 5 screens + 3 lib files (scoring, OpenF1 client, data) to Vite/React | ~8h | — |
| **F1-2** | Paddock management UI — create/join/switch, `usePaddock` hook | ~3h | — |
| **F1-3** | Admin panel + `score-f1-race` Edge Function | ~5h | — |
| **F1-4** | AppLayout sport switcher, `SportContext`, circle/gazette wiring | ~2h | 192 |
| **F1-5** | OpenF1 sync cron — auto-populate `qualifying_at`/`race_at` *(optional, pre-sale)* | ~2h | 193 |

**MVP complete after F1-4. Full exit criteria in the plan.**

**Session notes for Phase 1B:**

**2026-06-22 (session 2) — Sprints F1-0 through F1-3 complete:**
- Migrations 191 (paddocks schema + F1 tables + RLS) and 192 (RPCs + 24-race 2026 calendar seed + special options) applied to live DB, verified correct.
- All 7 screens built: PaddockLobbyScreen, F1HomeScreen, F1RaceBetScreen, F1SeasonBetsScreen, F1StandingsScreen, F1ReportScreen, F1AdminScreen.
- Supporting files: SportContext, usePaddock hook, f1-data, scoring, openf1 lib files, 5 F1 nav icons, sport switcher in AppLayout sidebar.
- score-f1-race Edge Function written (not yet deployed — run `npx supabase functions deploy score-f1-race --project-ref sssmvihxtqtohisghjet` before first admin scoring).
- Build: zero errors, 0 lint errors confirmed. PR #606 merged into v2.
- Sprint F1-4 (smoke tests in platform.spec.js) and F1-5 (OpenF1 sync cron) remain; both optional pre-MVP.

**2026-06-22 (session 1) — Phase 1B scoped and plan created:**
- Assessed existing FantasyF1 repo (github.com/SMTCB/FantasyF1). Game model is prediction bets (not fantasy squads): P1/P2/P3 podium + DNF + team + special category per race; 10-field season bets. OpenF1 as data provider (free, no API key). 3 clean migrations; scoring engine and OpenF1 client are framework-agnostic TypeScript, port directly.
- Core gap: no group concept. Architecture decisions confirmed: **Paddock** naming; one set of bets per user per race (global, not per paddock); port to Vite/React (not keep as separate Next.js app); chat and gazette are Circle-level only; trophy ledger holistic via migration 189.
- Full implementation plan written: [F1_MODULE_IMPLEMENTATION_PLAN.md](../product/F1_MODULE_IMPLEMENTATION_PLAN.md) — 5 sprints (~22h), migration SQL for 190–191 fully written, screen specs for all 7 screens, edge function contract, exit criteria checklist.
- Next: Sprint F1-0 — apply migrations 190 and 191 to v2 DB, verify paddock and F1 table creation.

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
**Status: ✅ Done (v2 branch, 2026-06-22)**

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
- [x] **Audit pass — partial-pass screens** (2026-06-22): `MarketScreen`, `LiveScreen`, and `SquadScreen` each had residual old-palette rgba values missed in the initial pass. All identified instances fixed: old-cyan `rgba(0,180,216,...)` → `rgba(26,111,168,...)`, bright-green → `var(--pos-bg)`, bright-red → `var(--neg-bg)`, cream-on-dark-overlay text → `rgba(255,255,255,...)`. `LeagueInviteCard` intentionally untouched — it is a self-contained branded sharing card with hardcoded dark palette, not using CSS tokens.
- [x] `platform.spec.js` green — 84/84 passed (2026-06-22)
- [ ] `SquadScreen.jsx` Kit Light components — MiniPitch/MiniTok pitch surface (`#2D5A27`) needs full spec (deferred per design decision above; block on design handoff)

**Deferred decisions (do not block UX-0 continuation):**
- **Tab count inside League Hub** — exact number and which tabs consolidate is TBD, pending multi-sport and P2P architecture decisions. Build tab structure to be variable. Resolve before Sprint UX-1.
- **"Frontpage" vs "Feed" naming** — "Frontpage" is Forza Times newspaper; "Feed" is gazette activity. They are different. Named "Frontpage" in the handoff. The tab label in Kit Light is an open decision tied to tab count.
- **Kit Light pitch surface** — `MiniPitch` and `MiniTok` tokens are dark-specific (hardcoded dark backgrounds). The light-direction pitch needs a full spec on `#2D5A27` green field before My Squad implementation. Deferred to Phase 2 (My Squad Kit Light).
- **Empty states** — no spec exists for empty leaderboard / empty squad / empty market in Kit Light. Improvise per screen during build; standardise in a follow-up pass.
- **Scores and Recap screens** — not in design handoff package (BRIEF says Scores "works and should be kept"). Both need a Kit Light token pass as part of UX-0 but no new layout work required.

**Note:** the first 3–4 weeks of the pilot generate real user feedback on UX pain points. Hold back redesign decisions on navigation patterns and information architecture until that feedback is available (approximately W3–W4). Apply the new visual layer (colors, typography) immediately; restructure layouts after feedback.

### Sprint UX-1 — Clubhouse shell + multi-sport navigation
**Status: ⬜ Not started — coordinates with Phase 1E Sprint CH-1**

> **Note:** Phase 1E Sprint CH-1 and this sprint are the same screen from different angles. Build them together. `ClubhouseScreen.jsx` IS the multi-sport shell home. Do not build them separately.

- [ ] `SportContext.jsx`: resolves active sport from the active league/paddock/box's `tournament.sport_id`; exposes `{sport, gameModel}` to all screens
- [ ] Module screen registry in `App.jsx`: Clubhouse as home (`/`); football routes as module #1; F1 routes as module #2; Tennis routes as module #3; URL-compat shims for existing `/squad`, `/market`, etc.
- [ ] `ClubhouseScreen.jsx` (`/`): cross-sport feed via `get_circle_feed()`, meta-standings via `get_circle_meta_standings()`, sport cards grouped by type (football leagues / F1 paddocks / tennis boxes), member rail
- [ ] Profile / trophy cabinet screen: `trophy_ledger` filtered by `user_id`; all wins across sports

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

**2026-06-22 — Audit pass on partial-pass screens (session 4):**
- `MarketScreen.jsx`: auto-fill button state colors (old cyan → accent-bg), player row owned/taken border colors.
- `LiveScreen.jsx`: LEAGUE_TONES array (old cyan replaced with `#1A6FA8`), chart canvas overlay colors (correct: stays dark), event tags on light surface (`var(--pos-bg)`/`var(--neg-bg)`), transfer window badge border/bg, bench row divider, inactive player dot.
- `SquadScreen.jsx` (10 changes): DangerList player name (`text-white` → `text-[var(--paper)]`), SQUAD/BENCH badge, cancel-confirm button state (desktop + mobile), swap target borders and SWAP badge (replace_all), Joker section muted text, captain name (`text-white` → `text-[var(--paper)]`), VIEW STATS button, swap banner subtitle and Cancel button (cream on dark overlay → `rgba(255,255,255,...)`), EmptyState sub text.
- `LeagueInviteCard.jsx`: confirmed intentionally dark-themed (hardcoded `#070A0F`/gradient backgrounds, no CSS tokens). No changes — color values are correct for the dark branding card surface.
- ESLint: 79 warnings, 0 errors (pre-existing warnings, no regressions).

---

## Phase 1D — Buyout Hygiene, Batch 1 (W1–W2)

**Status: 🔄 In progress — 1D-A done, 1D-B pending**

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

## Phase 1E — Clubhouse Social Architecture (W3–W8)

**Status: ⬜ Not started — scoped 2026-06-23**

**Goal:** reframe the Circle layer (Phase 0) as **The Clubhouse** — the primary social container and onboarding entry point. Members are invited to a Clubhouse first; leagues in any sport are created within and linked to a Clubhouse. Social features (group chat, 1-to-1 DMs, cross-sport frontpage, P2P betting flag) live at Clubhouse level. League views are stripped to pure competitive mechanics. This is the key feature for a broadcaster wanting live and indirect social interaction around sport.

**Design decisions confirmed (2026-06-23):**
- **Name:** The Clubhouse (UI label). DB table stays `circles` — no migration rename.
- **Social-first model:** the Clubhouse is the product. League membership is optional, not the entry ticket. A member can exist in a Clubhouse purely for chat and P2P betting — never joining any league. This is a first-class use case, not an edge case.
- **Admin model:** Clubhouse owner assigns leagues/paddocks/boxes to the Clubhouse. Each league/paddock/box can have its own admin, who must be a Clubhouse member. Clubhouse owner responsibility scope is an open question — surfaces during build.
- **Chat:** one general all-members channel auto-created per Clubhouse + owner-created additional channels + 1-to-1 DMs between Clubhouse members.
- **Multiple leagues per sport per Clubhouse:** yes, fully supported — e.g. WC League + UCL League both in the same Clubhouse.
- **Notifications:** consolidated to Clubhouse level only. No league-level notification inbox. Two sub-types: (1) activity/news → Clubhouse feed via `get_circle_feed()`; (2) action-required → `clubhouse_notifications` table (replaces `league_notifications` for v2) with `source_type` / `source_id` for deep-link context. Filter chips by sport. `league_notifications` on `main`/pilot is **completely untouched**.
- **Discoverability:** `circles.is_public bool DEFAULT false`. Public Clubhouses are searchable via `search_clubhouses(p_query)` RPC; private ones are invite-code only. Owner toggles the setting.
- **Migration strategy:** pilot football leagues manually linked to a Clubhouse when v2 ships post-WC. No automated migration, no changes to `main`.
- **Commissioner bets:** nothing on pilot is touched. Commissioner bets retire naturally — no force-resolve tool, no migration. Existing pilot bets expire post-WC. Commissioner bet creation/resolution removed from League view in v2 (replaced by Clubhouse-level P2P).
- **P2P challenges are Clubhouse-scoped, not league-scoped:** `p2p_challenges.league_id` is **nullable**. `circle_id` is required. Sport-specific propositions (`gw_total`, `player_vs_player`) still reference a `league_id`; general propositions (`match_result_pick`, custom wagers) only need `circle_id`. Non-playing members can create and accept P2P challenges.
- **Pilot is absolutely untouched:** v2 branch cannot merge into `main` until Week 12. Every change in this plan is invisible to the live ~50-user pilot.

**Foundation already built (Phase 0):**
- `circles`, `circle_members`, `circle_leagues`, `circle_paddocks` tables + RLS ✅
- `create_circle()`, `join_circle_by_code()`, `get_circle_feed()`, `get_circle_meta_standings()` RPCs ✅
- `trophy_ledger` ✅
- `circle_player_boxes` still needed (Tennis migration, Phase 2)

**Architecture rule:** the Clubhouse is the social and navigation home. A league/paddock/player's box is a competitive game running inside a Clubhouse. The three-layer separation (DB → hooks → thin UI) applies here too — `useClubhouse()` is the stable data contract the UX redesign builds against.

---

### Sprint CH-0 — DB layer extensions
**Status: ✅ Done — PR #607, migration 193, 2026-06-23**
- [x] **Migration 193:** `clubhouse_channels` (`id`, `circle_id`, `name`, `is_default bool`, `created_by`, `created_at`) — RLS: circle members read/write
- [x] **Migration 193:** `clubhouse_messages` (`id`, `channel_id`, `user_id`, `content text`, `created_at`) — RLS: circle members read; own-row insert; delete own or owner
- [x] **Migration 193:** `direct_messages` (`id`, `circle_id`, `from_user_id`, `to_user_id`, `content`, `created_at`, `read_at`) — RLS: read own rows only
- [x] **Migration 193:** `ALTER TABLE circles ADD COLUMN p2p_betting_enabled bool NOT NULL DEFAULT false`
- [x] **Migration 193:** `ALTER TABLE circles ADD COLUMN is_public bool NOT NULL DEFAULT false`
- [x] **Migration 193:** `clubhouse_notifications` table (`id`, `circle_id`, `user_id`, `source_type` CHECK IN ('league','paddock','box','clubhouse'), `source_id uuid`, `type text`, `payload jsonb`, `read_at`, `created_at`) — RLS: own rows only
- [x] **Migration 193:** update `create_circle()` RPC to auto-insert a "General" `clubhouse_channels` row on creation
- [x] **Migration 193:** update `create_league()` / `create_paddock()` RPCs to accept `p_circle_id uuid DEFAULT NULL` — if provided, inserts `circle_leagues` / `circle_paddocks` row on creation; validates caller is Clubhouse owner if `p_circle_id` provided
- [x] **Migration 193:** `get_clubhouse_competitions(p_circle_id)` RPC — returns all linked football leagues, F1 paddocks, tennis boxes grouped by sport (unified query across the three junction tables)
- [x] **Migration 193:** `search_clubhouses(p_query text)` RPC — returns public Clubhouses (`is_public=true`) matching name; caller need not be a member
- [x] Verify `platform.spec.js` still green after migration — 84/84 green

**P2P data model note for Sprint P2P-1 (coin ledger):** `p2p_challenges.league_id` must be nullable and `circle_id` must be required (non-nullable FK to `circles`). Sport-specific propositions (`gw_total`, `player_vs_player`) populate both; general propositions (`match_result_pick`, custom) populate only `circle_id`. This is a change from the original system design — update before writing the Sprint P2P-3 migration.

### Sprint CH-1 — Clubhouse shell UI
**Status: ✅ Done — PR #608, 2026-06-23**
- [x] `ClubhouseScreen.jsx` — HOME tab (sport competition cards + gazette feed), MEMBERS tab, FIND tab (search public clubhouses); multi-clubhouse pill selector; empty-state for non-playing members
- [x] `useClubhouse()` hook — circles list, active circle (localStorage), competitions-by-sport, cross-sport feed, members, Realtime gazette subscription; create/join/search actions
- [x] App routing: `/clubhouse` and `/clubhouse/:circleId` routes in `App.jsx`; URL syncs active circle
- [x] AppLayout: CLUBHOUSE nav item (desktopOnly) added to both football and F1 navs; `/clubhouse` included in `isMainRoute` check

### Sprint CH-2 — Chat channels + DMs
**Status: ✅ Done (PR #609, 2026-06-23)**
- [x] `ClubhouseChat.jsx` — two-panel layout: channel list (180px) + message thread (flex-1), mobile-responsive (one panel at a time), owner-only channel creation form, Enter-to-send input
  - General channel auto-selected on load (is_default = true)
  - Custom channels — Clubhouse owner can create via inline form
  - 1-to-1 DMs — opened from member list in DMS tab
- [x] `useClubhouseChat(channelId)` hook — messages + Realtime INSERT subscription, batch username cache
- [x] `useDirectMessages(circleId, toUserId)` hook — DM thread + read receipt auto-mark on load and arrival
- [x] CHAT tab added to ClubhouseScreen, full-width outside max-640 container

### Sprint CH-3 — Frontpage migrates to Clubhouse level
**Status: ✅ Done (PR #610, 2026-06-23)**
- [x] Migration 194: `league_id` nullable on `frontpage_editions/reactions/comments`; `circle_id uuid` added to all three; partial unique indexes per scope; RLS policies for circle members; scope CHECK (league_id OR circle_id must be set)
- [x] `generate-frontpage-edition` Edge Function: circle mode (`{circle_id}`) — owner auth, 4h rate limit, aggregates standings + gazette from all linked leagues + F1 paddock names; `buildCirclePrompt` produces cross-sport tabloid copy; `writeCircleEdition` separate from league write path; cron mode loops circles after leagues
- [x] `useClubhouseFrontpage(circleId)` hook — mirrors `useFrontpageEdition` but circle-scoped; exports `refresh()` for post-generate reload
- [x] `ClubhouseFrontpage.jsx` — cream newspaper layout (FORZA TIMES masthead, edition number, lead/hot-take/wooden-spoon/transfer-desk sections); emoji reactions + letters-to-editor on each section; owner-only Generate/Regenerate button with rate-limit error handling; empty state with publish CTA
- [x] FORZA TIMES tab added to ClubhouseScreen MAIN_TABS (position 2, between HOME and CHAT); rendered full-width outside the 640px container

### Sprint CH-4 — League creation as Clubhouse-first flow
**Status: ✅ Done (2026-06-23)**
- [x] `LeagueScreen.jsx` create flow: Step 0 "Choose Clubhouse" picker — shows user's Clubhouses (name + role), toggle-select with gold highlight; "Continue without Clubhouse" fallback when none exist or user skips
- [x] `selectedCircleId` wired into `create_league` RPC as `p_circle_id` (only sent when non-null)
- [x] Step resets automatically via `useEffect` when leaving the create view
- [x] Circles fetched via direct Supabase query (avoids importing `useClubhouse` into `LeagueScreen` — TDZ risk)
- [x] `useClubhouseFrontpage`: replaced `refreshRef.current` dependency-array pattern with `useState` tick counter — eliminated 2 React Compiler lint errors
- [ ] `OnboardingWizard.jsx` Clubhouse-first rethink — deferred; wizard is rarely hit post-pilot; revisit for CH-5 or standalone session
- [ ] `create_paddock` `p_circle_id` wiring — F1AdminScreen; deferred to Phase 2 Tennis sprint where paddocks become active

### Sprint CH-5 — League view strip-down
**Status: ✅ Done — PR #611**
- [x] `LeagueScreen.jsx`: removed `ChatView`, `useFrontpageEdition`, `FrontpageInteractive`, `BetsSection`, `useBettingLeaderboard`, `BetsTabHub`, `BettingLeaderboardView`, `useChatMessages`, `useMentions`, `useMessageSearch` imports + all associated hooks/effects/view blocks (~721 lines deleted)
- [x] `HubShared.jsx`: removed `unreadChat`/`notifyBets` params; cleaned `frontpage`, `bets`, `betting`, `chat` entries from both `HubTabs` and `HubTabPills`
- [x] 0 lint errors, clean Rolldown build — no TDZ regressions
- [ ] League ACTIVITY tab gazette scoping (competitive events only) — deferred to CH-6
- [ ] Commissioner admin tab bet panels removal — deferred to CH-6

**What moves where:**
| Feature | From | To |
|---|---|---|
| Chat | League tab | Clubhouse (channels + DMs) |
| Forza Times / Frontpage | League tab | Clubhouse home |
| Commissioner bets | League admin | Retired (P2P betting at Clubhouse level replaces this) |
| Gazette / activity | League tab | Stays in League (competitive events only) |
| Standings, squad, market, scoring | League | Stays in League (unchanged) |

**Session notes for Phase 1E:**

**2026-06-23 — CH-0 + CH-1 complete**
- Migration 193 applied to shared Supabase DB (additive only — 4 new tables, 2 new columns on circles, 4 new/updated RPCs). Pilot is unaffected (no existing rows touched, no columns altered, no DROP).
- `useClubhouse.js` and `ClubhouseScreen.jsx` are v2-only new files — nothing on `main` was touched.
- Next: CH-2 (chat channels + DMs). No product decisions needed — schema already exists in migration 193.

**2026-06-23 — CH-2 + CH-3 + CH-4 complete (same session)**
- CH-2: `useClubhouseChat.js` + `useDirectMessages.js` + `ClubhouseChat.jsx` (two-panel channels/DMs, Realtime subscriptions); CHAT tab in ClubhouseScreen.
- CH-3: Migration 194 extends `frontpage_editions/reactions/comments` with `circle_id` (nullable `league_id`); `useClubhouseFrontpage.js` hook; `ClubhouseFrontpage.jsx` cream newspaper layout; FORZA TIMES tab in ClubhouseScreen; `generate-frontpage-edition` Edge Function extended with circle mode.
- CH-4: `LeagueScreen.jsx` create flow gains "Choose Clubhouse" Step 0 picker before the existing league form; `p_circle_id` wired to `create_league` RPC; `useClubhouseFrontpage` refreshRef → useState tick fix (0 lint errors).
- Next: CH-5 — League view strip-down (move Chat + Forza Times out of LeagueScreen).

**2026-06-23 — CH-5 complete**
- `LeagueScreen.jsx`: removed FRONTPAGE (450-line IIFE), BETS (`BetsTabHub`), BETTING (`BettingLeaderboardView`), CHAT (`ChatView`) view blocks + all associated imports, hooks, effects (~721 lines net). Fixed JSX encoding corruption (curly quote U+201D in className attr from Node.js rewrite in prior session).
- `HubShared.jsx`: dropped `unreadChat`/`notifyBets` params; removed frontpage/bets/betting/chat from both `HubTabs` + `HubTabPills` tab arrays.
- Remaining league tabs: Leaderboard, H2H (conditional), Recap, Trading (draft only), Stats, Admin (commissioner).
- CommissionerPanel bet panels NOT removed — deferred to CH-6.
- Next: CH-6 — gazette scoping (competitive events only) + CommissionerPanel bet panels retirement.

**2026-06-23 — CH-6 complete**
- `LeagueDetailView.jsx`: removed `bet_result` from `ENTRY_META`; removed `BETS` filter from activity feed filter bar. Feed now has ALL/GAME/TRADES only.
- `CommissionerPanel.jsx`: removed `BetCreatorPanel` import; removed `BET_TYPES`, `BetCardPreview`, `CreateBetWizard`, `VoidConfirmModal`, `ResolvePendingBets`, `BettingHistory`, `MobBetPreview`, `MobCreateBet`; removed both desktop (Zone C/D) and mobile (BET MANAGEMENT/RESOLVE) render sections; condensed `commissioner` destructuring to `commLoading/commMsg/setCommMsg`. Net: −1681 lines, bundle 930 KB → 889 KB.
- `BetCreatorPanel.jsx` file itself NOT deleted — kept for potential P2P Clubhouse repurposing.
- Next: CH-7 — mobile nav + feed deep-link + classified entries.

#### CH-7 session notes (2026-06-23)
- Option A confirmed: replace LIVE with CLUBHOUSE on mobile nav.
- `AppLayout.jsx`: `live` nav item → `desktopOnly: true`; `clubhouse` → `desktopOnly` removed, `mobileLabel: 'CLUB'` added; mobile render uses `mobileLabel ?? label`.
- `ClubhouseScreen.jsx` `FeedEntry`: now accepts `onEnter` prop; if `entry.league_id` present, row is tappable (role=button, cursor:pointer, → chevron); navigates to `/league/${league_id}`. `classified` added to `typeColor` map (gold).
- `LeagueDetailView.jsx` `ENTRY_META`: `classified` registered (`filter:'GAME'`, badge `CLASSIFIED`, color `var(--gold)`).
- Build clean: 0 errors, 890 KB bundle (unchanged from CH-6).

#### CH-8 session notes (2026-06-23)
- Migration 195 (`195_clubhouse_owner_settings.sql`): 4 new SECURITY DEFINER RPCs — `update_circle_settings` (owner rename/toggle is_public/p2p), `kick_circle_member` (owner-only, cannot kick self), `link_league_to_circle` (validates circle owner AND league commissioner), `get_owner_linkable_leagues` (returns unlinked commissioner leagues for picker).
- No prod backup required: circles/circle_members/circle_leagues created in migration 188 (v2-only, never deployed to prod).
- `useClubhouse.js`: 4 new callbacks — `updateSettings`, `kickMember`, `linkLeague`, `getOwnerLinkableLeagues`.
- `ClubhouseScreen.jsx`: SETTINGS tab added (owner-only, conditionally appended to MAIN_TABS). `SettingsTab` component: rename form, public/P2P toggles (optimistic UI), link-league picker (lazy-loaded). `MembersTab` gains KICK button per non-owner member (owner-only). `useAuth` imported for `user.id` guard on kick.
- Build clean: 0 errors, 896 KB (+6 KB).

---

### Sprint CH-7 — Mobile nav + feed polish
**Status: ✅ Done — PR #613**

**Goal:** Make the Clubhouse reachable on mobile and make the HOME feed interactive.

**Product decision required before building:**
The mobile nav has 5 fixed icons (Scores, Squad, League, Live, Market). The Clubhouse is a 6th item. Options:
- **A** Replace LIVE with CLUBHOUSE on mobile (Live is still reachable via the score strip / league live tab)
- **B** Add a 6th scrollable icon (breaks the grid but no icon lost)
- **C** Show CLUBHOUSE only when the user belongs to at least one circle (conditional)

Recommend **Option A** — LIVE is the least frequently used standalone screen (its content surfaces in the League and Score screens too).

**Tasks:**
- [ ] `NavIcons.jsx` + `AppLayout.jsx`: replace LIVE with CLUBHOUSE on mobile nav (or chosen option from decision above); add Clubhouse SVG nav icon
- [ ] `ClubhouseScreen.jsx` `FeedEntry`: add `onClick` that navigates to `enterLeague()` / `enterPaddock()` for activity entries that have a `league_id` / source; clicking an activity card takes the user into the relevant competition
- [ ] `ClubhouseScreen.jsx` HOME feed: register `classified` gazette type — show with a CLASSIFIED badge (gold, italic) in the feed; for now just headline + `timeAgo`, no body expansion needed

**Rolldown check:** `AppLayout.jsx` already imports `NavIcons` — no new import depth risk.

---

### Sprint CH-9 — Notification badge + inbox
**Status: ✅ Done — PR #615**

#### CH-9 session notes (2026-06-23)
- Migration 196 (`196_clubhouse_notification_triggers.sql`): 3 AFTER INSERT triggers — `notify_on_frontpage_edition` (circle-scoped frontpage editions), `notify_on_gazette_breaking_news` (breaking_news gazette entries via circle_leagues join), `notify_on_direct_message` (notifies to_user_id). All use DROP IF EXISTS + CREATE for idempotency.
- **TDZ-safe badge architecture**: `ClubhouseNotifContext.js` is a pure `createContext()` file (zero risky imports). `ClubhouseNotifProvider.jsx` holds supabase/auth logic. AppLayout imports only the context file — no new shared modules in the AppLayout import chain, zero TDZ risk.
- `App.jsx` wraps tree in `<ClubhouseNotifProvider>` between `SportProvider` and `Router`.
- `ClubhouseNotifProvider`: resolves auth via `supabase.auth.getSession()` (not `useAuth` — TDZ avoidance); Realtime on `clubhouse_notifications` for INSERT (+1) and UPDATE (refetch); provides `{ unreadCount, resetBadge }`.
- `AppLayout`: gold dot badge on CLUBHOUSE desktop nav item and mobile CLUB icon when `unreadCount > 0`; reads via `useContext(ClubhouseNotifContext)`.
- `useClubhouse`: `notifications` state fetched in `fetchCircleData` (limit 50 DESC); Realtime INSERT subscription prepends to state (slice to 50); `markRead` / `markAllRead` optimistic + async DB write; `unreadCount` derived; all exported.
- `ClubhouseScreen`: `InboxTab` component with TYPE_META badge map (`frontpage_edition`, `breaking_news`, `direct_message`); unread dot; MARK ALL READ; tap-to-navigate marks read and routes to `/league/:source_id`; INBOX tab label shows live count; render block wired.
- Build: 0 errors, 195 modules, 0 lint errors.
- **Phase 1E Clubhouse shell complete.** Next: Phase 1A (P2P coin ledger — 5 product decisions gate Sprint 1) or Phase 2 (Tennis Module).

---

### Sprint CH-8 — Owner admin panel
**Status: ✅ Done — PR #614**

**Goal:** Give the Clubhouse owner control over their space. Without this, the owner cannot add existing leagues, change visibility, or manage membership.

**Tasks:**
- [ ] Add SETTINGS tab to `ClubhouseScreen` (owner-only — hidden from regular members)
- [ ] **Visibility toggle**: `UPDATE circles SET is_public = !is_public WHERE id = circleId` — commissioner can make the Clubhouse public (searchable) or private (invite-code only); show current state with PRIVATE / PUBLIC badge in header
- [ ] **P2P toggle**: `UPDATE circles SET p2p_betting_enabled = !p2p_betting_enabled` — gates the P2P sprint (Phase 1A); show status in SETTINGS
- [ ] **Link existing league**: owner can add a league they administer that isn't yet in this Clubhouse — query `league_members WHERE user_id=owner AND role='commissioner'`, filter out already-linked ones, show as a picker; call `INSERT INTO circle_leagues (circle_id, league_id)` (needs a new `link_league_to_circle(p_circle_id, p_league_id)` RPC — validates caller is circle owner AND league commissioner; or a direct INSERT if RLS permits)
- [ ] **Member management**: kick a member — `DELETE FROM circle_members WHERE circle_id=X AND user_id=Y` (commissioner-only RLS); show a KICK button on each member row in MEMBERS tab when viewer is owner
- [ ] **Rename Clubhouse**: inline edit of `circles.name` (UPDATE, owner only)

**Migration needed:** `195_clubhouse_owner_ops.sql`
- `link_league_to_circle(p_circle_id uuid, p_league_id uuid)` RPC — validates caller is circle owner + league commissioner; inserts `circle_leagues`; idempotent (ON CONFLICT DO NOTHING)
- `kick_circle_member(p_circle_id uuid, p_user_id uuid)` RPC — validates caller is circle owner; rejects if target is the owner; DELETE from `circle_members`
- `update_circle_settings(p_circle_id uuid, p_is_public bool, p_p2p_enabled bool, p_name text)` RPC — validates caller is circle owner; partial update (only changes fields that differ)
- RLS: add UPDATE policy on `circles` for owner (`circle_members.role='owner'`) — needed for the above RPCs and any direct client writes

---

### Sprint CH-9 — Notification badge + inbox
**Status: ✅ Done — PR #615**

**Goal:** The `clubhouse_notifications` table from migration 193 is wired to nothing. This sprint makes it the live action-required inbox replacing `league_notifications` for v2.

**What triggers a notification:**
| Event | source_type | type |
|---|---|---|
| New Forza Times edition published for a linked league/circle | `clubhouse` | `forza_times` |
| New breaking news gazette entry in a linked league | `league` | `breaking_news` |
| New DM received | `clubhouse` | `dm` |
| New bet/challenge created (Phase 1A, deferred) | `clubhouse` | `p2p_challenge` |

**Tasks:**
- [ ] **Write path**: DB trigger on `frontpage_editions INSERT` → fan out `INSERT INTO clubhouse_notifications` for every `circle_members.user_id` where the edition's `circle_id` matches; similar trigger on `gazette_entries INSERT` (type=`breaking_news`) for all members of linked circles — write as `195_` or `196_` migration
- [ ] **Write path for DMs**: trigger on `direct_messages INSERT` → insert one notification for `to_user_id` (skip if `from_user_id === to_user_id`)
- [ ] **Read path**: `useClubhouse()` gains `notifications: []` and `unreadCount: number` — query `clubhouse_notifications WHERE user_id=me AND read_at IS NULL ORDER BY created_at DESC LIMIT 20`; Realtime subscription for INSERT
- [ ] **Badge**: CLUBHOUSE nav icon shows a red dot / count when `unreadCount > 0`
- [ ] **INBOX tab** in `ClubhouseScreen` (new tab, shown when `unreadCount > 0` OR always): list of notification cards; tapping one navigates to the source (`source_type + source_id` determines route) and marks it read (`UPDATE clubhouse_notifications SET read_at = NOW() WHERE id = X`)
- [ ] **Mark all read** button in INBOX tab

**Note:** `league_notifications` on `main`/pilot is completely untouched. v2 only reads `clubhouse_notifications`.

---

**CH-7 → CH-8 → CH-9 recommended order.** CH-7 is ~2 hours (mobile nav decision + two small UI wires). CH-8 is ~4 hours (new migration + settings panel). CH-9 is ~6 hours (triggers + Realtime + badge + inbox). All three together complete the Clubhouse as a self-contained product before Phase 1A (P2P) and Phase 2 (Tennis) land inside it.

---

## Phase 2 — Tennis Module (W6–W8)

**Status: 🔄 In progress — T-0 through T-3 ✅ complete, T-4 (UI) next**

**Goal:** a season-long roster prediction game built around the full ATP calendar (14 events: 4 Grand Slams + 9 Masters 1000s + ATP Finals). Players join **The Player's Box** and compete across the season with a low-friction one-login-per-tournament model, Ace Cards, and a QF Captain mechanic.

**Authoritative plan:** 📋 [TENNIS_MODULE_IMPLEMENTATION_PLAN.md](../product/TENNIS_MODULE_IMPLEMENTATION_PLAN.md)
— read this before touching any tennis code. Contains the full game dynamics spec, all architecture decisions, complete schema SQL, RPC contracts, scoring engine pseudocode, and sprint-by-sprint task lists.

**Key architecture decisions (do not re-debate without reading the plan):**
- **Game model:** roster ownership (pick 7 players across 4 seed tiers), earn points based on how far your players advance. NOT a bracket prediction model.
- **Group concept:** **The Player's Box** (`player_boxes` + `player_box_members` tables, invite code join)
- **Picks:** global per user — one roster per tournament regardless of how many Player's Boxes the user belongs to. Leaderboard filters by box membership.
- **Ace Cards:** 4 per user per season (one of each type), server-side state in `tennis_ace_cards`. Not playable at ATP Finals. Forfeited if unused by season end.
- **QF Captain:** mid-tournament window (48h) opens when 8 players remain. Captain earns 2× points.
- **ATP Finals:** separate prediction slate mechanic (15 match winners across 2 login windows). No roster, no Ace Cards.
- **Season:** Australian Open to ATP Finals (Jan–Nov). Best 4 of 9 Masters scores count (Masters Drop Rule, applied when ≥5 completed). All 4 Slams always counted.
- **Data entry:** admin enters player list before tournament and eliminated players after each round. `sync-tennis-players` Edge Function syncs from RapidAPI (1 call per trigger — 50 req/day free plan budget).
- **API:** RapidAPI `tennis-api-atp-wta-itf`, free plan, 50 req/day. All calls are admin-triggered only (never cron). ~28 total calls for a full 14-tournament season.
- **Framework:** Vite/React in this monorepo (same as F1)
- **Chat & Gazette:** Circle-level only — no per-Player's-Box chat. `gazette_entry_type = 'tennis_result'` added.
- **Trophy ledger:** holistic across all sports via `trophy_ledger` (migration 189). Season winner per Player's Box.

### Sprint summary

| Sprint | Goal | PR | Migrations / EF | Status |
|---|---|---|---|---|
| **T-0** | Schema + Player's Box + 2026 ATP calendar | #617 | 197, 198 | ✅ Done |
| **T-1** | Game RPCs (roster, ace card, QF captain, ATP Finals picks, scoring payload) | #618 | 199 | ✅ Done |
| **T-2** | Admin RPCs (tournament lifecycle) + `sync-tennis-players` Edge Function | #619 | 200 + EF | ✅ Done |
| **T-3** | `score-tennis-tournament` + `score-atp-finals` Edge Functions + leaderboard RPCs | #620 | 201 + 2 EF | ✅ Done |
| **T-4** | UI screens (7 screens, 5 hooks) | — | — | ⬜ Next |

**MVP complete after T-4. Backend is 100% built — T-4 is UI only.**

**Session notes for Phase 2:**

**2026-06-24 — Sprints T-0 through T-3 complete (PRs #617–#620):**

**Sprint T-0 (migration 197 + 198, PR #617):**
- `player_boxes`, `player_box_members`, `circle_player_boxes` (links boxes to Circle/Clubhouse layer)
- `tennis_seasons` (2026 seeded), `tennis_tournaments` (14-event calendar: 4 GS + 9 M1000 + ATP Finals)
- `tennis_tournament_type` + `tennis_surface` enums
- `tennis_tournament_players` with `external_player_id INT` + partial unique index (allows manual NULLs, blocks API duplicates)
- `tennis_rosters`, `tennis_qf_captains`, `tennis_ace_cards`, `tennis_tournament_scores`
- `tennis_atp_finals_matches`, `tennis_atp_finals_picks`
- `gazette_entry_type` extended with `'tennis_result'`
- RPCs: `create_player_box`, `join_player_box_by_code`, `get_my_player_boxes`
- RLS on all 12 tables

**Sprint T-1 (migration 199, PR #618):**
- `submit_tennis_roster`: tiered player validation (7 slots across T1/T2/T3/T4), ace card consumption, re-submit idempotency (`used_tournament_id IS NULL OR = p_tournament_id`), card swap support
- `set_tennis_qf_captain`: status/window guards, roster membership, eliminated player check
- `submit_atp_finals_group_picks` + `submit_atp_finals_knockout_picks`: full match-pairing validation
- `get_tennis_tournament_for_user`: rich single-call payload (tournament + players + roster + captain + ace_cards + surviving_players)
- `issue_season_ace_cards`: service_role-only, idempotent 4-card issuance per Player's Box member

**Sprint T-2 (migration 200 + `sync-tennis-players` EF, PR #619):**
- 9 service_role-only admin RPCs: `admin_open_tournament`, `admin_start_tournament`, `admin_seed_tournament_players`, `admin_enter_round_results`, `admin_open_qf_window`, `admin_set_champion`, `admin_complete_tournament`, `admin_seed_atp_finals_matches`, `admin_enter_atp_finals_result`
- All restricted via REVOKE from public/authenticated/anon + GRANT to service_role
- `sync-tennis-players` Edge Function: 1 API call per admin trigger; requires `external_id` set on tournament first; infers tier from seed (T1=1–4, T2=5–16, T3=17–32, T4=unseeded); handles homeTeam/awayTeam and player_home/player_away API naming; upserts via `admin_seed_tournament_players`

**Sprint T-3 (migration 201 + 2 EFs, PR #620):**
- `score-tennis-tournament`: T1=2pts/round, T2=3, T3=4, T4=6; QF captain ×2; ace card bonuses (underdog_boost +15, safety_net +8, surface_specialist +12 proxy, dark_horse_insurance T4 floor=6); writes `tennis_tournament_scores` + gazette + calls `admin_complete_tournament`
- `score-atp-finals`: 15-match pick'em (group=3, SF=5, Final=8 pts, max 54); partial scoring supported; idempotent
- `get_player_box_leaderboard`: season standings with Masters Drop Rule (worst standard score dropped when ≥5 standard tournaments complete); rank, total, best, worst_dropped
- `get_tennis_season_summary`: per-tournament score grid for all box members (history screen)
- `get_tennis_tournament_list`: full 2026 ATP calendar with player counts + `has_my_roster` flag

**What T-4 needs to build (UI only — all data contracts are done):**
- `TennisHomeScreen.jsx` — ATP calendar list with status chips, roster badge, `get_tennis_tournament_list` 
- `TennisTournamentScreen.jsx` — tournament detail: pick 7 players, ace card selector, `submit_tennis_roster`
- `TennisLeaderboardScreen.jsx` — Player's Box standings, per-tournament grid, `get_player_box_leaderboard` + `get_tennis_season_summary`
- `TennisAtpFinalsScreen.jsx` — 15-match pick'em UI, `submit_atp_finals_*_picks`
- `TennisAdminScreen.jsx` — admin panel: open tournament, seed players, enter results, open QF window
- `PlayerBoxScreen.jsx` — create/join Player's Box, member list
- `TennisProfileView.jsx` — user's season summary across all boxes
- Hooks: `useTennisCalendar`, `useTennisTournament`, `useTennisLeaderboard`, `usePlayerBox`, `useTennisAdmin`
- Route wiring in `App.jsx` + sport switcher integration

**2026-06-22 — Game dynamics spec and implementation plan written:**
- Game model confirmed: 7-player tiered roster (Seeds 1–4 / 5–16 / 17–32 / Unseeded), points for round reached, QF Captain 2×, 4 Ace Cards per season. ATP Finals is a separate 15-match prediction slate.
- Architecture decisions confirmed: The Player's Box naming; global picks (one roster per tournament per user); manual admin entry; Ace Cards server-side tracked; Masters Drop Rule (best 4 of 9); season Jan–Nov.
- Full implementation plan written: [TENNIS_MODULE_IMPLEMENTATION_PLAN.md](../product/TENNIS_MODULE_IMPLEMENTATION_PLAN.md) — 5 sprints, complete schema SQL, RPC contracts, scoring pseudocode, 7 UI screens, exit criteria checklist.

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
| Free coin grant for new signups (amount or zero) | Sprint P2P-0 | ⬜ Not decided |
| Challenge expiry window (how long a pending challenge stays open) | Sprint P2P-0 | ⬜ Not decided |
| Min/max stake per challenge | Sprint P2P-0 | ⬜ Not decided |
| Stripe deferred — add when ready | Sprint P2P-2 (Stripe) | ✅ Decided: build without Stripe; add later |
| Meta-league scoring formula (trophy count vs Olympic points vs hybrid) | Phase 3B | ⬜ Deferred — build ledger first, formula is a swappable function |
| Clubhouse commissioner model: who can create leagues within a Clubhouse? | Sprint CH-0 | ✅ Decided: Clubhouse owner only assigns leagues; each league has its own admin (must be Clubhouse member) |
| Notification scope: extend `league_notifications` or add `clubhouse_notifications`? | Sprint CH-0 | ✅ Decided: `clubhouse_notifications` table (v2 only); `league_notifications` on pilot untouched |
| Commissioner bets retirement | Sprint CH-5 | ✅ Decided: freeze/expire naturally post-WC; nothing on pilot touched |
| Clubhouse discoverability | Sprint CH-0 | ✅ Decided: `is_public` toggle on `circles`; `search_clubhouses()` RPC; private = invite-code only |
| Clubhouse admin responsibility scope | During build | ⬜ Open — will surface during CH-1/CH-4 build |
| Non-playing member experience (empty state, P2P without leagues) | Sprint CH-1 | ⬜ UX needs designing — member with no leagues should feel welcome, not broken |
| Tennis scoring weights (pts per correct round pick) | Sprint T-2 | ✅ Decided: use existing TENNIS_MODULE_IMPLEMENTATION_PLAN.md spec |
| F1 scoring weights | Sprint F1-2 | ⬜ Needs dynamics session (F1-4 deferred) |
| Staging environment budget (second Supabase project for buyer demos) | Phase 3A | ⬜ Not decided |

---

## Cross-Cutting Rules (Every Sprint)

These apply throughout the v2 build. They are documented in CLAUDE.md and the assessment docs — collected here for quick reference.

1. **Migrations are append-only.** Next free number on v2 is `202_` (main is at `191_`). Never edit an applied migration.
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

Last Updated: **2026-06-24**
Author: session planning (Claude + user)
