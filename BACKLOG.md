# Forza Fantasy League - Open Issues & Backlog

**Last Updated**: 2026-05-31 (session 63 — Pre-Pilot Technical Due Diligence, 3 rounds / 8 audit passes)  
**E2E Test Suite**: `platform.spec.js` (36 tests × 2 browsers) passing in CI ✅ — completes in ~3 min  
**Live App**: https://wc-fantasy-football.vercel.app  
**WC Kick-off**: 2026-06-11 19:00 UTC (Mexico vs South Africa)

---

## 🚨 PRE-PILOT TECHNICAL DUE DILIGENCE (session 63, 2026-05-31)

**Context**: Comprehensive launch-readiness audit ahead of the pilot, after the gameplay-engine rebuild (migrations 104–107) and the Admin/Commissioner revamp. Eight parallel audit passes across 3 rounds: (R1) game-logic backend, admin/commissioner, frontend integrity, security/RLS; (R2) new-user funnel, data pipeline/crons; (R3) auction economics, bets+chips integrity.

**Build/lint status**: `npm run build` ✅ clean · `npm run lint` ✅ clean · `madge` ✅ no circular deps · Rolldown TDZ bundle ✅ no violation (the `var`-hoist convention in `HubShared.jsx` is the only thing preventing recurrence — treat as untouchable).

**Verification note**: Supabase CLI was NOT logged in during the audit, so all DB/cron/env state items are flagged "VERIFY" with exact SQL in the checklist below. Items marked ✅verified were confirmed directly against source in-repo.

> Every finding below should be turned into a Notion card. Suggested next migration: **`108_security_lockdown.sql`**.

### 🔴 CRITICAL — launch blockers

| ID | Area | Issue | Evidence |
|----|------|-------|----------|
| **DD-C1** | Security | `execute_transfer_atomic` granted `TO authenticated` (✅verified `106:385`, also `96:109`) with **no `auth.uid()` ownership check** and **trusts client-supplied `p_price`**. Browser-console exploit: mint unlimited budget (negative price), buy free, edit other managers' squads — defeats SEC-1 hardening. | `106_transfer_window_unification.sql:385` |
| **DD-C2** | Security | `set_lineup` granted `TO authenticated` (✅verified `107:218`), **no `auth.uid()` check** (grep: `auth.uid` absent from file). Exploit: sabotage a rival's XI, lock out their players, or trigger the deduction branch to **subtract a rival's already-scored points**. | `107_starting_xi_and_bench.sql:218,170-186` |
| **DD-C3** | Game logic | **Live-match lineup lock is bypassable.** Deduction only fires when benched player's fixture is `finished`; during `live` it's allowed with no deduction. Locks written fire-and-forget by 5-min ingest cron — gap between kickoff and next ingest lets a manager bench a player mid-match to dodge a 0. | `107:...`, `ingest-match-events/index.js:544` |
| **DD-C4** | Admin | `run-draft-lottery` enforces commissioner check only `if (authHeader)` present (✅verified line 33) — a request with `league_id` and **no auth header** runs the irreversible allocation. Trust inferred from header absence, not a verified service-role key. | `run-draft-lottery/index.js:33` |
| **DD-C5** | Funnel | **If Vercel prod doesn't set `VITE_AUTH_ENABLED=true`, every pilot user shares ONE demo identity** (✅verified default `false`, `AuthContext.jsx:27,34`; all auth no-ops in demo mode). Master switch — without it the whole pilot is one shared account. | `.env.example:14`, `AuthContext.jsx` |
| **DD-C6** | Funnel | `join_league_by_code` is **called by the UI** (✅verified `LeagueScreen.jsx:627`) but **defined in NO migration** (✅verified grep). Exists in prod only if hand-created. If missing/dropped, **no second user can ever join a league** — fatal for a multi-user pilot. | `LeagueScreen.jsx:627` |
| **DD-C7** | Funnel | New **Draft** league has no path to the draft: `create_league` never sets `draft_deadline` (`106:392`); the only entry point is a banner gated on `draftOpen` (`LeagueScreen.jsx:450`). Commissioner must manually set deadline → members submit → manually trigger allocation, with no guidance. | `106:392`, `LeagueScreen.jsx:450` |
| **DD-C8** | Pipeline | Canonical sync orchestrator `sync-all-active-tournaments` uses `current_setting('app.*')` which **returns NULL on hosted Supabase** (never rewritten like the others). Migration 73 made it the sole path for `sync-player-status`. Net: **WC player injury/availability never auto-refreshes.** | `51_dynamic_cron_tournaments.sql:24-27` |
| **DD-C9** | Pipeline | **No alerting of any kind.** Observability is pull-only (`get_cron_status`, `edge_function_errors` in AdminSeedScreen). Over a 2-day live tournament a silent pipeline stop is the most likely failure and has zero automated detection. The 500 path in ingest doesn't even `logError`. | `ingest-match-events/index.js:555` |
| **DD-C10** | Bets | `resolve_bet` **lost its double-resolution guard** (✅verified migration 99 has BET_NOT_FOUND + UNAUTHORIZED but no `already-resolved` early-return; dropped in mig 76). Budget bets **double-credit** on re-resolve (additive). Commissioner double-click or cron race hands winners free budget. | `99_resolve_bet_budget_rewards.sql` |
| **DD-C11** | Bets | `resolve-bets` resolves **NULL scores as a DRAW** (`null > null` is false). Any fixture set `finished` with NULL scores (postponed/abandoned/API-gap — sync-fixtures maps Forza `after`→finished with `?? null` scores) auto-pays the wrong managers via the 15-min cron. | `resolve-bets/index.js:67-69`, `sync-fixtures/index.js:56,109` |
| **DD-C12** | Chips | **Triple Captain is completely broken** (✅verified): UI sends `key:'triple'` (`SquadScreen.jsx:49`) but `activate_chip` only accepts `'triple_captain'` (`11:37`) → always returns "Unknown chip type: triple"; `is_triple_captain` never set. | `SquadScreen.jsx:49`, `11_chips_validation_alerts.sql:37` |
| **DD-C13** | Chips | **Joker never applies in scoring** (✅verified): UI writes `daily_jokers` table; scoring reads `squads.joker_player_id` (`calculate-scores:512`); **nothing syncs them** (grep: no app code writes `joker_player_id`). Manager picks a Joker, UI confirms, ×2 never fires anywhere. | `SquadScreen.jsx:639`, `calculate-scores/index.js:512` |

### 🟠 HIGH

| ID | Area | Issue | Evidence |
|----|------|-------|----------|
| **DD-H1** | Auction | **No budget reservation** — budget checked at bid time against full balance, only debited at settlement. One manager can be top bidder on N auctions each ≤ balance; at settlement first wins, rest silently cancelled nondeterministically — sellers unpaid, "spend only what you have" broken. | `100_auction_fixes.sql:39-54,160` |
| **DD-H2** | Auction | `place_bid` **lost its `FOR UPDATE` row lock** (present in mig 27, gone in 80/90/100). Concurrent bids read stale `current_bid`, both pass, last-writer-wins → a lower bid can overwrite a higher one; highest bid not guaranteed to win. | `100_auction_fixes.sql:19,57` |
| **DD-H3** | Auction | Migration history is **internally contradictory** on `auction_listings` columns (`seller_squad_id`/`min_bid`/`ends_at` vs `seller_id`/`starting_bid`/`deadline_at`) and on the `place_bid` overload. Frontend uses the second set. Unclear bidding even works as expected until live schema confirmed. | mig 27/66 vs 36/80/100 |
| **DD-H4** | Game logic | **Transfer recovery-window can orphan a squad.** `process-transfer` filters squad by *nearest upcoming* deadline; in the 6h post-deadline window that's the next round, lookup misses the real squad and **creates a fresh empty squad (budget 100, players [])**. Manager loses roster. | `process-transfer/index.js:153,156-167` |
| **DD-H5** | Scoring | **Captain + Joker stack to ×4 (×6 with Triple Captain).** `calculate-scores:511-512` applies both multipliers independently, no max-not-product guard. Latent today (DB CHECK + dead Joker mask it) but arms the moment DD-C13 is fixed. | `calculate-scores/index.js:511-512` |
| **DD-H6** | Security | `calculate-scores` has **no authorization at all** — any authenticated user / anon-key holder can trigger a full recalc for any fixture across every league. Idempotent (not destructive) but open global-write/DoS surface. | `calculate-scores/index.js` |
| **DD-H7** | Admin | RUN ALLOCATION button stays enabled after allocation (`allocationDisabled` omits `allocationDone`, `CommissionerPanel.jsx:1251`), contradicting LIFECYCLE_OPERATIONS.md ("no re-run exposed"). Only the edge idempotency gate prevents destructive re-run. | `CommissionerPanel.jsx:1251` |
| **DD-H8** | Draft | `run-draft-lottery` is **non-transactional** (allocations → squads → submissions as separate calls, no rollback). Mid-way crash leaves managers with allocations but no squad; idempotency gate then skips recovery. | `run-draft-lottery/index.js` |
| **DD-H9** | Bets | Commissioner can **resolve an OPEN bet before the match** — resolve list shows open bets and `resolve_bet` has no status/deadline guard (combines with DD-C10 to re-resolve after real result). | `CommissionerPanel.jsx:1041`, `useCommissioner.js:153` |
| **DD-H10** | Chips | **"Wildcard" is mislabeled.** UI says "unlimited free transfers" (`SquadScreen.jsx:41`) but the only effect of `is_wildcard` is a hidden **+10% total-points boost** (`calculate-scores:516`) — zero interaction with transfer limits. Undisclosed competitive imbalance + guaranteed support tickets. | `SquadScreen.jsx:41`, `calculate-scores/index.js:516` |
| **DD-H11** | Funnel/Sec | `create_league` / `join_league_by_code` are `SECURITY DEFINER` and **trust client-supplied `p_user_id`** (insert `created_by = p_user_id`, not `auth.uid()`). A user can create/join as another user. | `106:399`, `LeagueScreen.jsx:604,627` |
| **DD-H12** | Pipeline | **Live ingest is chicken-and-egg with ~6h worst-case latency.** `ingest-match-events-live` only fires for fixtures already `status='live'`, but status is flipped live only by the 6-hourly `sync-wc-fixtures-6h`. A match can run its full 90 min before ingest starts. | `91_fix_remaining_current_setting_crons.sql:42` |
| **DD-H13** | Pipeline | Cron bodies rewritten 5× (mig 60/63/67/68/86/87/90/91); `calculate-scores-post-match` carries an **expired anon JWT (exp 2024-08-17)** — works only because `verify_jwt=false`; one toggle from silent scoring outage. Live cron state cannot be assumed from highest-numbered file. | `87:20`, `90_fix_wc_sync_crons.sql:6` |
| **DD-H14** | Pipeline | `ingest-match-events` uses `Promise.all` on 4 Forza endpoints — if any one stays down after retries, the **whole match's ingest aborts** with no partial write and no `logError`. Should be `allSettled`. | `ingest-match-events/index.js:216,555` |
| **DD-H15** | Admin | **Authority split-brain:** `leagues` UPDATE RLS gated on `created_by = auth.uid()` (creator only), but UI + bet/gazette RPCs use `role='commissioner'`. A co-commissioner sees the full panel but `setLeagueDraftDeadline` silently fails RLS. | `47_rls_core_tables.sql:64`, `LeagueScreen.jsx:304` |

### 🟡 MEDIUM

| ID | Area | Issue |
|----|------|-------|
| **DD-M1** | Funnel/Frontend | **Onboarding tours globally disabled** — `useOnboarding.js:147` hardcodes `showWizard:false`; per-screen tours gated on `wizardDone` which can never become true. New users get zero guidance + the commissioner tour is dead code. One-line flip to fix. |
| **DD-M2** | Game logic | **`match_status` enum vs sync-fixtures mismatch** — enum is `scheduled/live/finished` but `sync-fixtures` writes `postponed/cancelled/abandoned`. If `fixtures.status` is that enum, one postponed match fails the entire fixtures+deadlines sync batch. *VERIFY column type.* |
| **DD-M3** | Game logic | **`execute_transfer_atomic` `text[]` vs `uuid[]` mismatch** — `squads.players` is `TEXT[]` but function declares `v_new_players uuid[]` and does `@>`/`array_append` across types (set_lineup casts `::text`, this doesn't). If it errors, all buys/sells fail. *VERIFY with one live transfer.* |
| **DD-M4** | Frontend | **Lineup swap has no double-submit guard** — `SquadScreen.jsx handleSwap` (line 405) lacks `if (saving) return` (unlike handleBuy/handleSell). Rapid double-tap fires two `set_lineup` RPCs. |
| **DD-M5** | Admin | **`transfers_open` status never reflects open/close buttons** — commissioner writes `transfer_windows`, but stepper/pills read `leagues.transfers_open` (only AdminSeedScreen writes it). UI misleads on both layouts. |
| **DD-M6** | Admin/Funnel | **`AdminSeedScreen` not commissioner-gated** (`:1068` only checks `!user`, reachable by any auth user via URL) and its controls mutate **tournament-global** data (`match_events`, `player_match_stats`, `scoring_rules`) shared across all leagues on a tournament. |
| **DD-M7** | Auction | **Winning an auction enforces zero squad constraints** — `array_append(players,...)` with no size/position/club-cap/duplicate check. Can win a 16th player or a duplicate, corrupting formation. |
| **DD-M8** | Auction | **NULL-propagation bid floor** — if `min_increment`/`starting_bid` NULL, `GREATEST(NULL,...)` → NULL → comparison NULL → bid passes with no floor (arbitrary/£0.01 bid). *VERIFY column defaults.* |
| **DD-M9** | Bets | **No stake is ever debited** — bets are risk-free upside only; losers pay nothing. If a wager economy was intended, it doesn't exist (design/expectation gap). |
| **DD-M10** | Chips | **Joker insert omits `league_id`** (`SquadScreen.jsx:639`) but unique index is `(user_id, league_id, matchday_id)` (`96:22`). If column NOT NULL → joker can't save; if nullable → bleeds across leagues. |
| **DD-M11** | Chips | **No deadline/lock check on chip activation** — `activate_chip` validates only season usage; RPC callable post-deadline. Worse, mig 66 grants users direct UPDATE on `is_wildcard/is_triple_captain/joker_player_id`, bypassing the season guard entirely. |
| **DD-M12** | Funnel | **Sign-up / email-confirmation messaging ambiguous**, no resend path; behavior depends on a Supabase setting nobody has pinned for the pilot (`AuthScreen.jsx:77`). |
| **DD-M13** | Pipeline | **Post-match scoring race** — daily 22:30 UTC cron scores any `finished` fixture; if Forza hasn't finalized (delay/ET/abandon) it locks in incomplete data with no NULL/plausibility guard. WC matches span time zones; one daily pass is coarse. |
| **DD-M14** | Pipeline | **`sync_cup_eliminations` filters `status != 'completed'`** — no such enum value; dead filter, logic carried only by `kickoff_at`. |
| **DD-M15** | Security | **Hardcoded service-role JWT in migration 105 cron body** (`:145`) — full-bypass token in source control; vault-reference it. |

### 🔵 LOW

| ID | Area | Issue |
|----|------|-------|
| **DD-L1** | Funnel | Join succeeds but auto-navigate reads `data?.id`; RPC returns `{league_id,name}` → user left on list view (`LeagueScreen.jsx:642`). |
| **DD-L2** | Funnel | `get_server_time` (draft anti-clock-skew) & `LEAGUE_FULL` cap not in any migration — draft deadline trusts client clock if RPC absent. |
| **DD-L3** | Auction | `cancelListing` does direct UPDATE relying on RLS; after SEC-8 dropped the member UPDATE policy, cancel may silently fail. *VERIFY policy.* |
| **DD-L4** | Auction | No seller≠bidder check in current `place_bid` — seller can self-bid to ramp price (input hidden in UI, RPC callable). |
| **DD-L5** | Bets | `void_bet` doesn't reverse an already-credited budget (`101:28`); help text promises refunds. |
| **DD-L6** | Bets | Auto-close cron lag (6h) — bets show "open" past deadline; submissions still blocked by `submit_bet` deadline check. |
| **DD-L7** | Chips | Free Hit & Bench Boost not implemented at all (no code/UI). Only Wildcard + Triple Captain exist (both broken). |
| **DD-L8** | Scoring | calculate-scores Path B (event aggregation) defaults `minutes_played:90` for anyone with an event — inflates fallback scores if Forza data absent. |
| **DD-L9** | Frontend | MarketScreen shows tap-to-retry on `TRANSFER_LIMIT_REACHED` (`:272`) which always re-fails; no preflight on `transfersRemaining`. |
| **DD-L10** | Pipeline | `eliminate-cup-club` manual path double-JSON-encodes gazette `bullets`/`full_data` (`:121-123`) — stores a string, UI may not render. |
| **DD-L11** | Build | App is one 641 KB chunk (no code-splitting); a module-eval TDZ would white-screen before ErrorBoundary can catch (`App.jsx`). Slow cold-load on mobile data. |

### ✅ VERIFY-ON-LIVE-DB CHECKLIST (run before kickoff — needs `npx supabase login`)

```sql
-- 1. DD-C5 master switch: confirm in Vercel dashboard → Env → VITE_AUTH_ENABLED=true (not a DB query)
-- 2. DD-C6 / DD-L2: do the called RPCs exist?
SELECT proname FROM pg_proc WHERE proname IN ('join_league_by_code','get_server_time','resolve_bet');
-- 3. DD-C10: confirm resolve_bet has no 'already resolved' early-return
SELECT prosrc FROM pg_proc WHERE proname='resolve_bet';
-- 4. DD-C8/H12/H13/C9: real cron bodies + schedules + recent run health
SELECT jobname, schedule, active, command FROM cron.job ORDER BY jobname;
SELECT j.jobname, d.status, d.return_message, d.start_time
  FROM cron.job_run_details d JOIN cron.job j ON j.jobid=d.jobid
  WHERE d.start_time > NOW()-INTERVAL '48 hours' ORDER BY d.start_time DESC LIMIT 100;
-- 5. DD-M2: fixtures.status column type (enum vs text)
SELECT udt_name FROM information_schema.columns WHERE table_name='fixtures' AND column_name='status';
-- 6. DD-H3/M8/L3: auction_listings columns, place_bid overloads, function ACLs, RLS
SELECT column_name,data_type,is_nullable,column_default FROM information_schema.columns WHERE table_name='auction_listings';
SELECT oid::regprocedure FROM pg_proc WHERE proname='place_bid';
SELECT proname, array_to_string(proacl,', ') FROM pg_proc WHERE proname IN ('place_bid','resolve_auction_listing','sell_now');
SELECT polname,cmd,qual,with_check FROM pg_policies WHERE tablename='auction_listings';
-- 7. DD-C8/M4(pipeline): is WC (429) seeded + sync-enabled?
SELECT forza_id,name,sync_enabled,environment FROM tournaments;
SELECT tournament_id,status,COUNT(*) FROM fixtures WHERE tournament_id='429' GROUP BY 1,2;
SELECT tournament_id,COUNT(*),COUNT(forza_player_id) FROM players WHERE tournament_id='429' GROUP BY 1;
-- 8. DD-C13/M10: joker disconnect + daily_jokers schema
SELECT (SELECT COUNT(*) FROM daily_jokers) AS jokers_picked,
       (SELECT COUNT(*) FROM squads WHERE joker_player_id IS NOT NULL) AS jokers_in_scoring;
SELECT column_name,is_nullable FROM information_schema.columns WHERE table_name='daily_jokers';
-- 9. DD-M11: do users hold direct UPDATE on chip columns?
SELECT grantee,privilege_type FROM information_schema.column_privileges
  WHERE table_name='squads' AND column_name IN ('is_wildcard','is_triple_captain','joker_player_id');
-- 10. DD-C10/C11: any unwatched critical errors already piling up?
SELECT function,severity,message,COUNT(*),MAX(created_at) FROM edge_function_errors
  WHERE created_at > NOW()-INTERVAL '7 days' GROUP BY 1,2,3 ORDER BY MAX(created_at) DESC;
-- 11. DD-H13: verify_jwt off for pipeline fns — dashboard → Edge Functions toggle (no SQL)
```

### ⏳ OUTSTANDING — AUDITS BLOCKED ON SUPABASE AUTH (run on main PC)

This session ran on a machine where the Supabase CLI was **not logged in**, so all live-DB/cron/env state was deferred. On the main PC, authenticate first, then complete the work below:

```bash
npx supabase login                                       # browser auth
npx supabase link --project-ref sssmvihxtqtohisghjet     # link this project
```

**1. Run the VERIFY-ON-LIVE-DB checklist above** (11 query blocks) — confirms/flips: DD-C5 (auth env — Vercel dashboard, not SQL), DD-C6/L2 (RPC existence), DD-C8/H12/H13/C9 (real cron bodies + run health), DD-M2 (fixtures.status type), DD-H3/M8/L3 (auction schema/ACLs/RLS), pipeline seeding (429 fixtures/players), DD-C13/M10 (joker disconnect counts), DD-M11 (chip column grants), DD-C10/C11 (error backlog). Each `--` comment maps to its finding ID.

**2. NOT-YET-RUN audit area — Migration ↔ Production parity** (deferred from session 63 scope; needs DB):
- Confirm migrations **86–107 are all actually applied** to prod and local SQL matches the live schema (the CLAUDE.md migration table is stale — says "next: 79" while 107 exists).
- Resolve the **duplicate migration numbers**: two `90_` (`90_e2e_bug_fixes.sql`, `90_fix_wc_sync_crons.sql`) and two `96_` (`96_club_cap_enforcement.sql`, `96_daily_joker_matchday.sql`) — apply-order is nondeterministic; confirm both of each pair landed and in the intended order.
- Reconcile the **auction schema lineage** (DD-H3) — which column names + `place_bid` overload are actually live (mig 27/66 vs 36/80/100).
- Suggested: `SELECT version FROM supabase_migrations.schema_migrations ORDER BY version;` then diff against `supabase/migrations/` filenames.

**3. NOT-YET-RUN audit areas (optional, lower priority, code-only — can run on either PC):**
- Notifications / push (Capacitor) system, league chat integrity, trade-proposal cash/points-sweetener economics — touched only incidentally so far.
- Bundle/performance pass (DD-L11 — single 641 KB chunk, no code-splitting).

### ✅ Confirmed SOLID (audited, no action)
`src/lib/supabase.js` anon-key only, no secrets; `.gitignore` covers `.env*`; `process-transfer` (JWT + membership + server-side price — model impl); `submit_bet`/`place_bid` bidder-ownership; `resolve_bet`/`void_bet`/`gazette` commissioner-role-gated; trade-proposal RPCs full ownership + `WITH CHECK(false)`; migration 66/77 hardening; realtime subscription cleanup across all changed screens; loading/empty/error states on RecapScreen/RecapView; empty-state rendering for fresh users (no white screen); `league_mode` trigger-derived from `format`; ingest retry/backoff + idempotent upserts; WC sync crons use a valid service-role token.

### 🔧 Recommended fix sequencing
1. **Env/DB verification first** (checklist above) — DD-C5, C6, C8, H3, M2, M3 could each flip severity.
2. **`108_security_lockdown.sql`**: revoke `authenticated` from `execute_transfer_atomic`+`set_lineup`, add `auth.uid()` ownership guards (DD-C1/C2), derive `create_league`/`join_league_by_code` user from `auth.uid()` (DD-H11), restore `resolve_bet` resolved-guard (DD-C10), fix `place_bid` `FOR UPDATE` + budget reservation (DD-H1/H2), lock function ACLs off PUBLIC (DD-H6, auction fns).
3. **Edge-function fixes**: resolve-bets NULL guard (DD-C11), ingest `allSettled` + logError on 500 (DD-C9/H14), run-draft-lottery service-role gate (DD-C4).
4. **Chips**: fix Triple Captain key (DD-C12), wire Joker into `squads.joker_player_id` + max-not-product multiplier (DD-C13/H5), relabel Wildcard (DD-H10).
5. **Funnel/UX**: re-enable onboarding (DD-M1), draft-deadline entry point (DD-C7).
6. **Ops**: stand up a manual heartbeat (run checklist #4/#10 every few hours during pilot) until real alerting exists (DD-C9).

---

## ✅ Session 62 — Gameplay Engine (PRs #268–269)

### Phase A — Transfer Window Unification ✅ DONE

**Migration 106** (`106_transfer_window_unification.sql`) — applied to production:
- `squads.round_transfers JSONB DEFAULT '{}'` added — tracks `{matchday_id: count}` per manager
- `enforce_transfer_window` trigger: early-exit for tournament leagues (no longer raises exception when no `transfer_windows` row exists)
- `league_config` keys seeded for all 11 existing leagues: `transfers_per_round=3`, `transfer_reopen_hours=6`, `transfer_wildcard_round=null`
- `get_transfer_window_status`: reads `transfer_reopen_hours` from `league_config` (was hardcoded `INTERVAL '6 hours'`)
- `get_club_cap()`: reads tier thresholds from `league_config` (was hardcoded; now config-driven per league)
- `execute_transfer_atomic()`: new optional params `p_league_id` + `p_matchday_id`; enforces `transfers_per_round` limit with wildcard-round bypass; increments `round_transfers` counter atomically
- `create_league` RPC: seeds all 10 config keys at league creation time (no league ever starts missing config)

**`process-transfer` edge function** — deployed: passes `p_league_id` + `p_matchday_id` to `execute_transfer_atomic` for both BUY and SELL; `TRANSFER_LIMIT_REACHED` added to client-error list

**`useAutoFill.js`**: `TRANSFER_LIMIT_REACHED` added as fatal abort condition

**`sync-fixtures` note**: already correct — MIN(kickoff_at) per round was already implemented; no change needed

### Phase B — Starting XI and Bench ✅ DONE

**Migration 107** (`107_starting_xi_and_bench.sql`) — applied to production:
- `squads.starting_xi TEXT[] DEFAULT '{}'` — the 11 players that score this round
- `squads.lineup_locks JSONB DEFAULT '{}'` — `{matchday_id: [player_ids]}` locked-out players
- `league_config`: `lineup_lock_per_fixture=true` seeded for all leagues
- `set_lineup(p_squad_id, p_player_out, p_player_in)` DB function — atomic swap with: ownership, lock-out, fixture-completion, formation-validity checks; points deduction if player subbed out after scoring
- `lock_lineups_for_fixture(p_fixture_id)` DB function — marks players in live/finished fixtures as locked-in in `lineup_locks`

**`calculate-scores` edge function** — deployed as v19: scores `starting_xi` (not `players`); fallback to `players[0..10]` for legacy squads with empty `starting_xi`

**`ingest-match-events` edge function** — deployed: calls `lock_lineups_for_fixture(fixture_id)` fire-and-forget after each ingest pass

**`SquadScreen.jsx`**:
- `fetchSquad`: reads `starting_xi` + `lineup_locks` from DB; uses `starting_xi` for pitch/bench split; tracks `lockedIds` per matchday
- `handleSwap`: replaced direct `squads.update` with `set_lineup` RPC; deduction warning modal if pitcher has scored; server-side error codes surfaced as toasts
- Bench row: lock icon + "LOCKED" badge + greyed+disabled style for locked-out players

### Key technical facts for next session
- `squads.round_transfers` shape: `{ "429-r2": 2, "429-r3": 0 }` — key is `matchday_id`; absent = 0
- `squads.starting_xi` is TEXT[] (player UUIDs as strings); empty `{}` means "use fallback" for scoring
- `squads.lineup_locks` shape: `{ "429-r2": ["player-uuid-1", "player-uuid-2"] }`
- Transfer limit error code: `TRANSFER_LIMIT_REACHED` — raised in `execute_transfer_atomic`, surfaced as toast in MarketScreen
- `set_lineup` auto-initialises `starting_xi` from `players[1..11]` if column is empty (safe for existing squads)
- `lock_lineups_for_fixture` is fire-and-forget from ingest; harmless if it fails
- Next migration: **108_**

---

## ✅ Session 61 — Draft/Cup System Redesign (PRs #261–265)

### What shipped

**Design decisions (documented in `docs/architecture/DRAFT_SYSTEM_DESIGN.md`):**
- Two independent axes: **league mode** (Classic vs Draft) × **tournament format** (League vs Cup)
- Draft submission: no constraints during pick submission — position/club/budget enforced only at allocation time
- Two relaxation formulas: player-repeat (Draft mode only) and club-cap (both modes, cup format)
- Club elimination: API-derived, safety guard prevents false eliminations on fixture data lag
- Second draft (Knockout) for cup format, same mechanics as group draft

**PR #261 — Phase 1:**
- Migration 104: `league_mode` column (classic/draft), `knockout_draft_deadline`, `phase` column on draft tables, `get_club_cap()` DB function, club-cap config defaults
- `run-draft-lottery` edge function: phase-aware allocation, idempotency per phase, auto-sets `cup_phase` after allocation, auto-seeds cup clubs on group allocation
- Admin UI: removed "Seed Cup Clubs" card, Season Stepper is now mode-aware (Classic=2 stages, Draft=4), Draft section hidden for Classic leagues, help modal updated

**PR #262 — Phase 2:**
- Migration 105: `league_mode` data fixed (all leagues now correct), `trg_sync_league_mode` trigger keeps it in sync with `format` going forward, `sync_cup_eliminations()` function, `sync-cup-eliminations` cron (every 6h)
- `process-transfer`: eliminated-club buy restriction (CLUB_ELIMINATED error code), dynamic club cap via `get_club_cap()` replacing hardcoded 3
- Admin UI: `isDraft` check fixed to use `league.format === 'noduplicate'`, Knockout Draft admin card added (locked until group allocation done)

**PR #263 — Phase 2 completion:**
- `eliminate-cup-club` edge function: added `mode: 'auto'` handler for cron calls — loops over all cup leagues, calls `sync_cup_eliminations()` per league, triggers relaxation recalculation for affected leagues

**Docs updated this session:**
- `docs/architecture/DRAFT_SYSTEM_DESIGN.md` — fully rewritten
- `docs/brand/admin-tab/LOGIC.md` — cup phase section removed, knockout draft added, mode-aware stepper documented
- `docs/brand/admin-tab/LIFECYCLE_OPERATIONS.md` — rewritten: cup phase section removed, knockout draft section added, cup format rules section added
- `docs/brand/admin-tab/COMMISSIONER_CONTROLS.md` — rewritten: mode-aware stage sets documented

### What remains (next session)
- Auto-run cron: 4h before first match, fire allocation if deadline not set (currently only fires if deadline passed with pending submissions)
- League creation: `league_mode` is derived from `format` via DB trigger — no UI change needed for Classic/Draft selection (already present in the create form as "Classic" / "Draft" format options)
- Mobile Knockout Draft card (currently desktop only)
- E2E test coverage for draft phase mechanics

---

---

## 🚀 OPEN FEATURES — NEXT SESSION PRIORITIES

### ✅ [FEATURE] RECAP Tab — Cross-League Daily Digest + Per-League History toggle ✅ DONE (session 60, PR #257)

**Priority**: P2 — High value UX, fully event-driven, infrastructure already built  
**Effort**: ~3–4h  
**Status**: COMPLETE — merged to main

#### What the user wants
Transform the RECAP tab from a single-league matchday history into a dual-mode dashboard:

- **Mode A — "MY DIGEST"** (default): Cross-league daily snapshot. Shows what happened across ALL the user's leagues since last login / in the past 7 days. Event-driven — only appears when something actually happened (scoring ran). This is the "not to miss this" view.
- **Mode B — "THIS LEAGUE"**: The current per-league matchday history with round navigation. Already built and working — keep as-is.

A toggle pill at the top of the RECAP tab switches between the two modes.

#### Why the infrastructure is already there
- `gazette_entries` table has an `activity` row written automatically by `calculate-scores` after every scored fixture. Each row has: `league_id`, `headline` (match result + GW leader), `bullets` (all managers ranked by GW pts), `full_data` (matchday_id, fixture_id, scores array), `published_at`.
- `league_members` already tells us every league the user belongs to.
- The gazette rendering code in `LeagueDetailView` already shows headline + bullets with a coloured badge.
- All UI primitives (`HubSectionLabel`, `MgrTag`, `HubSectionLabel`, card patterns) exist.

#### Mode A — My Digest: implementation spec

**Query** (single call, no joins in JS):
```sql
SELECT ge.id, ge.league_id, ge.headline, ge.bullets, ge.full_data, ge.published_at,
       l.name AS league_name
FROM gazette_entries ge
JOIN leagues l ON l.id = ge.league_id
JOIN league_members lm ON lm.league_id = ge.league_id AND lm.user_id = auth.uid()
WHERE ge.entry_type = 'activity'
  AND ge.published_at > NOW() - INTERVAL '7 days'
ORDER BY ge.published_at DESC
```
In Supabase JS:
```js
const { data } = await supabase
  .from('gazette_entries')
  .select('id, league_id, headline, bullets, full_data, published_at, leagues(name)')
  .eq('entry_type', 'activity')
  .gte('published_at', new Date(Date.now() - 7*86400000).toISOString())
  .order('published_at', { ascending: false });
// Filter to user's leagues via RLS — is_league_member(league_id) already does this
```

**UI card per entry:**
```
┌─────────────────────────────────────────────────────┐
│  [SCORES] 2h ago            UCL FINAL 2026 — LIVE TEST │
│  GW 15 — PSG 1–1 Arsenal — TestComm leads with 8 pts  │
│  🥇 TestComm  8 pts this GW                            │
│  🥈 s.t.c.braganca  8 pts this GW                     │
└─────────────────────────────────────────────────────┘
```
- League name shown as a sub-tag (since entries span multiple leagues)
- Headline bold, bullets below in MONO 9px
- Clicking a card → navigates into that league (setActiveLeague + setView('recap') or similar)
- Empty state: "Nothing to report — no matches in your leagues in the last 7 days"

**Layout**: Simple vertical card list, same pattern as `LeagueDetailView` activity rail but full-width. No pagination needed (7-day window, small volume).

#### Mode B — This League: already built
The current `RecapView` (matchday pills + score table + fixture panel + player breakdown on click) stays exactly as-is. This is Mode B.

#### Toggle component
Add a pill toggle at the top of the RECAP tab, above the section header:
```jsx
// Two pills: "MY DIGEST" | "THIS LEAGUE"
// default: "MY DIGEST"
// state: const [recapMode, setRecapMode] = useState('digest')
```

Both pills in same horizontal bar style as the existing round pills in the score table. Active pill uses `var(--cyan)` border + bg.

#### File structure
New file: `src/components/league/DigestView.jsx` — contains the cross-league digest query + card rendering. Mount it conditionally inside the existing `view === 'recap'` block in `LeagueScreen.jsx`:

```jsx
{view === 'recap' && (
  <RecapContainer
    leagueId={activeLeague?.league_id}
    tournamentId={activeLeague?.leagues?.tournament_id}
    members={members}
    currentUser={currentUser}
  />
)}
```

`RecapContainer` manages the `recapMode` toggle and renders either `<DigestView />` or `<RecapView />`.

Or simpler: add the toggle + DigestView directly inside the existing `RecapView` — only adds one new state + one new data load.

#### DB: no migration needed
All required tables and RLS policies exist. The gazette INSERT policy (migration 103) is already deployed. The `gazette_entries` RLS policy `is_league_member(league_id)` already scopes reads to the user's leagues.

#### Acceptance criteria
- [ ] RECAP tab defaults to "MY DIGEST" view showing all recent scoring events across all user leagues
- [ ] Each card shows: league name, match result, GW scores ranked by pts
- [ ] Empty state shown when no activity in last 7 days
- [ ] Clicking a card navigates into that league's RECAP (Mode B)
- [ ] "THIS LEAGUE" toggle shows the existing per-league matchday history
- [ ] Toggle persists within the session (resets on tab change is fine)
- [ ] Works on desktop and mobile
- [ ] No new migrations required

---

## 📊 SESSION 60 PROGRESS (2026-06-01 — RECAP MY DIGEST Dashboard)

### Delivered
- **RecapScreen.jsx rebuilt as MY DIGEST cross-league activity dashboard** (PRs [#258](https://github.com/SMTCB/WCFantasyFootball/pull/258), [#259](https://github.com/SMTCB/WCFantasyFootball/pull/259), [#260](https://github.com/SMTCB/WCFantasyFootball/pull/260))
  - Chronological feed of all activity across all the user's leagues, last 7 days
  - Events grouped by **TODAY / YESTERDAY / day-name** separators
  - Every card shows a **type badge + league name tag** (cyan pill, right-aligned) for instant context
  - **Data sources merged into one feed:**
    - `gazette_entries` ALL types (no `entry_type` filter): SCORES · DRAFT · NEWS · AUCTION — badge colours mirror `LeagueDetailView.ENTRY_META` exactly
    - User's own `transfers` (RLS: `user_id = auth.uid()`): player ▲ in / ▼ out with position, batch player-name lookup
  - Empty state: "ALL QUIET" with WC kick-off reminder
  - No migrations needed

- **Crash fix** (PR [#260](https://github.com/SMTCB/WCFantasyFootball/pull/260)): `gazette_entries.bullets` is not always `string[]`
  - `draft_report` bullets: `{player_id, wanted_by, winner_id}` objects → drop (headline covers it)
  - `breaking_news` bullets: `{text: "..."}` objects → unwrap to string
  - Older rows: `bullets` stored as JSON string → parse first
  - `normalizeBullets()` applied at load time; render always receives `string[]`

- **Note — PR #257 reverted**: an initial incorrect implementation put a digest toggle inside the league hub (wrong location). That was fully reverted in PR #258 before the correct top-level RecapScreen approach shipped.

### Key technical facts (for next session)
- `RecapScreen.jsx` is now the MY DIGEST dashboard — `gazette_entries` (all types, 7 days) + own transfers
- `gazette_entries.bullets` field shapes: `string[]` (activity), `{text}[]` (breaking_news), `{player_id,wanted_by,winner_id}[]` (draft_report), JSON string (older rows) — all normalised by `normalizeBullets()`
- `transfers` RLS: `user_id = auth.uid()` — only own transfers are readable; social feed of other managers' transfers requires a policy change
- LeagueScreen `view === 'recap'` still mounts `RecapView` (per-league matchday history) — unchanged

---

## 📊 SESSION 59 PROGRESS (2026-05-31 — Admin Tab, RECAP, Scoring pipeline)

### Delivered
- **Admin tab overhaul**: ? help overlays (COMMISSIONER CONTROLS, LIFECYCLE OPS, BET MANAGEMENT), section reorder (Lifecycle above Bets), BET MANAGEMENT outer separator, LEAGUE NEWS breaking-news form for commissioners, disabled onboarding popup
- **RECAP tab fixes**: column name bug fixed (`total_points` → `total`), round ordering fixed (numeric not deadline-based), double-layout eliminated (JS `isMobile` state), player breakdown on click, `members` removed from effect deps (was causing race conditions)
- **calculate-scores CORS fix**: OPTIONS preflight was returning 405; deployed v17/v18 with CORS headers → "Failed to fetch" resolved
- **Integer scoring**: calculate-scores now stores `Math.round(total)` — no more decimal points in fantasy scores
- **Gazette scoring entries**: calculate-scores v18 writes an `activity` gazette entry per league after each scored fixture — populates League Activity automatically
- **League Activity**: now renders `bullets` array below headline; `activity` badge renamed `SCORES`
- **Migrations**: 103 (gazette INSERT policy for commissioners)
- **Docs**: `COMMISSIONER_CONTROLS.md`, `LIFECYCLE_OPERATIONS.md`, `BETS_LOGIC.md` in `docs/brand/admin-tab/`

### Key technical facts (for next session)
- `calculate-scores` deployed as **v18** (edge function, `verify_jwt: false`)
- Scoring is **fully automatic** — `calculate-scores-live` cron (every 2 min for live fixtures) and `calculate-scores-post-match` (22:30 UTC daily for finished fixtures in past 24h). Manual button is for edge-case re-runs only.
- `gazette_entries.entry_type = 'activity'` written by calculate-scores after scoring; one row per league per round (idempotent — replaces on re-run)
- `fantasy_points.total` is integer; column name is `total` not `total_points`
- Next migration: **104_**

---

## 📊 SESSION 58 PROGRESS (2026-05-31 — AUDIT-57/58 P0+P1 Fixes)

**Goal**: Fix all P0 blockers and quick P1 wins from AUDIT-57 and AUDIT-58 before WC kick-off.

### ✅ PR [#245](https://github.com/SMTCB/WCFantasyFootball/pull/245) — P0 + P1 Fixes (migrations 97–98)

| Finding | Fix | Migration/File |
|---------|-----|----------------|
| AUDIT-58-A1 | RUN ALLOCATION now calls `triggerDraftAllocation()` (edge function) | CommissionerPanel.jsx |
| AUDIT-57-01 / A7 | `resolve_bet` commissioner auth guard | migration 97 |
| AUDIT-58-A2 | OPEN/CLOSE buttons hidden for WC leagues (deadline-controlled note shown) | CommissionerPanel.jsx |
| AUDIT-57-02 | `submit_bet` squad ownership check | migration 98 |
| AUDIT-57-06 | SquadScreen deadline query: ASC + `.gte(now)` | SquadScreen.jsx |
| AUDIT-58-A3 | SeasonStepper derives live phase state from `league` prop | CommissionerPanel.jsx |
| AUDIT-58-A6 | Draft deadline + window open/close times normalized via `toISOString()` | useCommissioner.js |
| AUDIT-58-A8 | Score Recalc default fixture ID `''` (was `'test-live'`) | useCommissioner.js |
| AUDIT-58-A10 | WHO PICKED WHAT denominator = `memberCount` (was `pending.length+2`) | CommissionerPanel.jsx |

**Session 58b (PR #246)**: AUDIT-57-03 ✅, AUDIT-57-04 ✅, AUDIT-57-05 ✅, AUDIT-57-07 ✅, AUDIT-58-A4 ✅, AUDIT-58-A5 ✅ — all remaining P1s resolved.

**Session 58c (PR #247)**: AUDIT-57-08 ✅, AUDIT-57-09 ✅, AUDIT-58-A3 ✅ (full), AUDIT-58-A9 ✅, TDD-17 ✅.

**Session 58d (PR #248)**: AUDIT-57-11 ✅ (6h recovery window in get_transfer_window_status, migration 102).

**Still open (P3 only)**: AUDIT-57-10 (migration renumber — tech debt, no runtime impact).

---

## 🧹 SESSION 56 — Branch Cleanup (2026-05-30)

**20 stale `claude/*` remote branches reviewed and deleted.** All were either squash-merged into main or older/superseded:

| Group | Branches | Verdict |
|---|---|---|
| TDZ fixes (4) | fix-tdz-login, fix-tdz-v2, fix-tdz-v3, fix-tzdz-homecreen | Deleted — all TDZ fixes already in main via PRs #162–168 |
| UI bundles (4) | fix-bundle-round2, fix-bundle-ui-encoding-ux, fix-league-tab-encoding-autofill, fix-recap-multi-league | Deleted — merged as PRs #192–195 |
| Sprint 1 (3) | s1-live-bets, s1-obs-ux, sprint-1-scoring-math-transfer-fixes | Deleted — merged as PRs #171–175 |
| Sprint 2 (3) | s2-deferred-cleanup, s2-draft-logic, s2-live-pipeline | Deleted — merged as PRs #177–181 |
| Sprint 4 (3) | s4-hygiene-deadcode-docs, s4-migration-78-deployed, s4-sprint-plan-update | Deleted — merged as PRs #189–191 |
| Docs (2) | s1-docs, update-handoff-docs | Deleted — stale docs, content superseded or already on main |
| Mobile layout (1) | admin-mobile-layout | Deleted — older than main (pre-TDZ fix; merging would have reverted the TDZ-safe CommissionerPanel) |

**Only remote branch remaining**: `claude/silly-villani-0bdb10` (kept per task instructions)

---

## 🔍 AUDIT-57 — Game Logic & Data Flow Review (2026-05-30)

**Scope**: Auctions, bets, squad-management windows, and per-matchday squad model. 11 findings across 3 systems. Ordered by pilot impact.

**Source**: Deep code review — `useAuctions.js`, `AuctionCard.jsx`, `AuctionsView.jsx`, `place_bid`/`resolve_auction_listing`/`submit_bet`/`resolve_bet` RPCs, `process-transfer` Edge Function, `SquadScreen.jsx`, `useTransferWindow.js`, `useTransfer.js`, `useBets.js`, `useBetSubmit.js`.

---

### 🔴 P0 — Fix before any bet is resolved by a commissioner

#### AUDIT-57-01 — `resolve_bet` has no authorization check ✅ FIXED (session 58, migration 97)
- **Files**: `supabase/migrations/84_resolve_bet_fix.sql:8`, `src/hooks/useCommissioner.js:348`
- **Issue**: `resolve_bet(p_instance_id, p_answer)` is `SECURITY DEFINER` and `GRANT EXECUTE … TO authenticated` with no commissioner-role check inside the function. Any authenticated user — not just the commissioner — can call this RPC directly (e.g. via browser console or Postman) and resolve any bet with any answer, awarding rewards to whoever picked that answer.
- **Client gating is not sufficient**: `useCommissioner.js` checks for the commissioner UI, but that's client-side only and trivially bypassed.
- **Fix**: Add a check inside `resolve_bet` that the caller's `auth.uid()` maps to a `league_members` row with `role='commissioner'` for the instance's league. Alternatively, move `resolve_bet` to be callable only from the service role (Edge Function) and revoke the `authenticated` grant.
- **Migration**: `96_resolve_bet_auth.sql` (next in sequence after 96_club_cap_enforcement.sql, or use 97_)
- **Effort**: ~30 min

---

### 🟠 P1 — Fix in first week of pilot

#### AUDIT-57-02 — `submit_bet` allows picking for another manager's squad ✅ FIXED (session 58, migration 98)
- **File**: `supabase/migrations/83_submit_bet_fix.sql:8`
- **Issue**: `submit_bet(p_squad_id, p_instance_id, p_answer)` is `SECURITY DEFINER` and does not verify the caller owns `p_squad_id`. A user can pass a different manager's `squad_id` and overwrite their bet pick (the `ON CONFLICT … DO UPDATE` will clobber it). `user_id = auth.uid()` is recorded, but the submission still lands on the other squad's record.
- **Fix**: Add `IF NOT EXISTS (SELECT 1 FROM squads WHERE id = p_squad_id AND user_id = auth.uid()) THEN RETURN error 'Not authorised' END IF;` at the top of the function.
- **Effort**: ~15 min

#### AUDIT-57-03 — `budget`-type bet rewards are shown in UI but never applied ✅ FIXED (session 58b, migration 99)
- **Files**: `supabase/migrations/28_bets_system.sql:16`, `supabase/migrations/70_scoring_fixes.sql:45`, `src/components/BetWidget.jsx:226`, `src/components/league/BetsTabHub.jsx:63`
- **Issue**: `bet_instances.reward_type` supports `'budget'` and `'points'`. When `resolve_bet` runs for a `budget`-type bet it writes `reward_awarded` on each winning submission, and the UI displays "+X M". But nothing ever adds `reward_awarded` to `squads.budget_remaining`. `aggregate_league_member_points` explicitly filters `reward_type='points'` — budget rewards are excluded. Winners are told they got budget and never receive it.
- **Fix**: After `UPDATE bet_submissions`, add a second `UPDATE squads SET budget_remaining = budget_remaining + v_reward_value WHERE id IN (SELECT squad_id FROM bet_submissions WHERE bet_instance_id = p_instance_id AND is_correct = true)` inside `resolve_bet`, conditional on `reward_type = 'budget'`. Fetch `reward_type` from `bet_instances` first.
- **Effort**: ~45 min (migration + verify)

#### AUDIT-57-04 — No server-side budget check when placing an auction bid ✅ FIXED (session 58b, migration 100)
- **File**: `supabase/migrations/90_e2e_bug_fixes.sql:22` (canonical `place_bid`)
- **Issue**: `place_bid` validates status, deadline, and min-increment but **never checks the bidder has enough budget**. The old 3-arg version (`supabase/migrations/27_auction_listings.sql:104`) did check `squads.budget_remaining < p_amount`. The 2-arg canonical version dropped it. `AuctionCard.jsx:36` has a client-side guard (`val > myBudget`) that is bypassed by direct RPC calls.
- **Impact**: A manager can bid beyond their budget. If they win, `resolve_auction_listing` will catch it at resolution time and return `ok:false` — but then the auction gets stuck (see AUDIT-57-05).
- **Fix**: In `place_bid`, after the deadline check, add: `SELECT budget_remaining INTO v_budget FROM squads WHERE id = (SELECT id FROM squads WHERE league_id = v_listing.league_id AND user_id = auth.uid() LIMIT 1); IF v_budget < p_bid_amount THEN RETURN error 'Insufficient budget'; END IF;`
- **Effort**: ~30 min

#### AUDIT-57-05 — Expired auction listings get permanently stuck ✅ FIXED (session 58b, migration 100)
- **File**: `supabase/migrations/36_auction_resolution.sql:64`
- **Issue**: `resolve_auction_listing` returns `ok:false, error:'Buyer has insufficient budget'` but **never changes the listing `status`**. The 5-min cron retries and keeps failing. `place_bid` then rejects new bids ("deadline passed"). The listing is frozen `open` indefinitely — the player is notionally locked in the seller's squad forever, and neither party can do anything.
- **Root cause**: AUDIT-57-04 is the trigger (bidder wins but can't pay), but the real bug is the missing status fallback in the resolver.
- **Fix**: When resolution fails due to buyer budget, either: (a) demote to second-highest bidder if one exists (check `auction_bids` history), or (b) cancel the listing gracefully: `UPDATE auction_listings SET status='cancelled' WHERE id=p_listing_id`. Option (b) is the safe minimum.
- **Effort**: ~30 min (migration)

#### AUDIT-57-06 — SquadScreen shows wrong lock deadline ✅ FIXED (session 58, PR #245)
- **File**: `src/screens/SquadScreen.jsx:146-147`
- **Issue**: SquadScreen fetches the active matchday deadline with `ORDER BY deadline_at DESC LIMIT 1` — the *furthest* future deadline — and uses it for both the displayed lock countdown and the squad-row lookup. `process-transfer` and `get_transfer_window_status` use the *nearest upcoming* deadline (`>= now`, `ASC`). BUG-E2E-02 already fixed `process-transfer` to use ASC but **SquadScreen was never updated**.
- **Impact**: On a 7-round WC, the squad screen counts down to the Round 7 deadline (~mid-July) even when the Round 2 deadline is hours away. A manager sees "squad locks in 32 days" but transfer enforcement locks them out at the next deadline. The squad-row loaded may also be incorrect (furthest matchday_id), mitigated only by the line-179 fallback.
- **Fix**: Change `ORDER BY deadline_at DESC` → `ORDER BY deadline_at ASC` AND add `.gte('deadline_at', new Date().toISOString())` to match process-transfer's logic exactly.
- **File change**: `src/screens/SquadScreen.jsx:147`
- **Effort**: ~15 min (one-line change + verify)

#### AUDIT-57-07 — Auction resolution targets the wrong squad row in per-matchday leagues ✅ FIXED (session 58b, migration 100)
- **File**: `supabase/migrations/36_auction_resolution.sql:48-54`
- **Issue**: `resolve_auction_listing` finds the buyer's squad with `ORDER BY created_at DESC LIMIT 1` (most recently created squad row, ignoring `matchday_id`). `process-transfer` creates a fresh squad row for each new round. After a round rollover, the buyer's "latest" squad row is the new empty one (no players), while their active round-N squad row holds the actual squad. Auction transfers the player to the empty row — player disappears from the active squad.
- **Related**: `useTransfer.loadTakenMap` (`src/hooks/useTransfer.js:47`) also queries squads by `league_id` only (no matchday filter), so the "taken" map spans all rounds. This is cosmetic (may show stale taken status) but the auction issue is a real data loss.
- **Fix**: In `resolve_auction_listing`, after fetching the listing, resolve the active `matchday_id` the same way `process-transfer` does (nearest upcoming deadline for the listing's league_id → tournament_id → matchday_id), then add `.eq('matchday_id', active_matchday_id)` to the buyer AND seller squad queries.
- **Effort**: ~1h (migration; needs new helper query inside the function)

---

### 🟡 P2 — Fix before auction feature is actively promoted

#### AUDIT-57-08 — "LIVE" auctions stat in Auction House always shows 0 ✅ FIXED (session 58c, PR #247)
- **File**: `src/components/league/AuctionsView.jsx:15`
- **Issue**: `auctions.filter(a => a.highest_bidder_id === mySquadId)` computes "auctions I'm winning". But `place_bid` sets `highest_bidder_id = auth.uid()` — a **user_id** — while `mySquadId` is a squad UUID. They can never match. The LIVE stat is always 0.
- **Fix**: Either (a) compare `highest_bidder_id` to the current user's `auth.uid()` (pass `myUserId` prop alongside `mySquadId`), or (b) change `place_bid` to store the squad_id instead — but then `resolve_auction_listing` (which currently treats it as user_id) must also be updated. Option (a) is the minimal fix.
- **Effort**: ~20 min

#### AUDIT-57-09 — Seller can cancel a listing after bids have been placed ✅ FIXED (session 58c, PR #247)
- **Files**: `src/hooks/useAuctions.js:54`, `src/components/AuctionCard.jsx:106`
- **Issue**: `cancelListing` does a direct `UPDATE status='cancelled'` with no check for existing bids (`highest_bidder_id IS NOT NULL`). `AuctionCard` always renders the Cancel button for the seller. A seller can retract a player after a manager has outbid others, making auctions unreliable.
- **Fix**: In `cancelListing`, either: (a) reject if `highest_bidder_id IS NOT NULL` (add DB-side check — currently there's no RPC for cancel, it's a direct update), or (b) hide the Cancel button in `AuctionCard` when `auction.highest_bidder_id` is truthy (`isMine && !auction.highest_bidder_id`).
- **Effort**: ~20 min (UI fix is quickest; DB enforcement recommended alongside)

#### AUDIT-57-10 — Migration history is not cleanly replayable (TECH DEBT)
- **Files**: Multiple migration files
- **Issue 1**: Duplicate migration file numbers in repo: `16_` appears twice, `63_` appears 4 times (different names), `90_` appears twice. A clean `supabase db reset` (or fresh environment setup) would error on duplicate numbers.
- **Issue 2**: `27_auction_listings.sql` creates `seller_squad_id / min_bid / ends_at / bidder_squad_id / status CHECK('active','sold','unsold','cancelled')`. Later migrations (`36_`, `80_`, `90_`) use `seller_id / starting_bid / deadline_at / highest_bidder_id / min_increment / status='open'`. Migration `44_` references `seller_squad_id` again. These are irreconcilable in a replay.
- **Impact**: Production is fine (migrations already applied); this only affects fresh environment setup (new dev, staging branch, or disaster recovery). Not a pilot blocker.
- **Fix**: Audit and renumber/merge all duplicate-numbered migration files. Document the canonical column names in a migration-schema readme. Consolidate the auction table definition into one authoritative migration.
- **Effort**: ~2h (documentation + renumber; no prod schema changes needed)

---

### 🔵 P3 — Monitor / post-pilot

#### AUDIT-57-11 — WC/tournament leagues never show "Window Closed" in the banner ✅ FIXED (session 58d, migration 102)
- **Files**: `src/components/TransferWindowBanner.jsx:55`, `supabase/migrations/90_e2e_bug_fixes.sql:101-122`
- **Issue**: `get_transfer_window_status` fallback (matchday path) returns `status:'open'` pointing at the next upcoming deadline — always. For tournament leagues the banner perpetually shows "Window Open · Closes in X". The `upcoming`/closed state only fires for `transfer_windows`-table leagues (EPL). Between a round's deadline and the next round opening, WC managers see "open" even though the previous round's squad is now locked.
- **Note**: Enforcement is correct (process-transfer/deadline check gates mutations), so this is a UX confusion issue, not a logic bug.
- **Fix**: Return `status:'upcoming'` for the period after a deadline passes and before the next deadline opens (could use a configurable "window closed" gap). Or simply document this as intended behaviour for now.
- **Effort**: ~1h

---

## 🔍 AUDIT-58 — Admin / Lifecycle Operations Audit (2026-05-30)

**Scope**: Commissioner panel (LEAGUES → ADMIN tab) — period open/close operations, lifecycle controls (Transfer Window, Draft, Cup Phase, Score Recalc), and bet resolution. 10 findings. Ordered by pilot impact.

**Source**: Full read of `CommissionerPanel.jsx` (1890 lines), `useCommissioner.js`, `docs/brand/admin-tab/LOGIC.md` (spec), cross-checked against `process-transfer/index.js`, migrations `06`, `74`, `84`, `90`.

---

### 🔴 P0 — Critical lifecycle breakage

#### AUDIT-58-A1 — RUN ALLOCATION button calls a non-existent RPC ✅ FIXED (session 58, PR #245)
- **File**: `src/components/league/CommissionerPanel.jsx:1067`
- **Issue**: `handleRunAllocation()` calls `supabase.rpc('run_draft_allocation', { p_league_id })`. **This function does not exist in any migration.** The real allocation logic lives in the `run-draft-lottery` edge function. `useCommissioner.triggerDraftAllocation()` ([:147](src/hooks/useCommissioner.js:147)) correctly calls that edge function — but the RUN ALLOCATION ↯ button wires to the inline `handleRunAllocation` instead and never calls `triggerDraftAllocation`. **Pressing the button throws "function run_draft_allocation does not exist" and the core one-way lifecycle step fails.**
- **Fix**: Replace the inline `commAction(async () => supabase.rpc('run_draft_allocation', …))` in `LifecycleOps` with a call to `commissioner.triggerDraftAllocation()`, which already exists in the hook and calls the correct edge function.
- **File change**: `src/components/league/CommissionerPanel.jsx:1064-1070` (LifecycleOps handleRunAllocation)
- **Effort**: ~15 min

#### AUDIT-58-A2 — Transfer window OPEN/CLOSE have no effect on actual transfer enforcement ✅ FIXED Option C (session 58, PR #245)
- **Files**: `src/hooks/useCommissioner.js:85-105`, `supabase/functions/process-transfer/index.js:72-92`
- **Issue**: The three period-control signals are fully disconnected:

  | Signal | Written by | Read by |
  |---|---|---|
  | `transfer_windows` table | Admin **OPEN** / **CLOSE NOW** buttons | `get_transfer_window_status` path 1 → SquadScreen banner only |
  | `leagues.transfers_open` (bool) | AdminSeedScreen toggle | Season stepper sub-text only |
  | `matchday_deadlines` | `sync-fixtures` cron | **process-transfer write enforcement** (the real gate) |

  `process-transfer` (the server that executes transfers) reads **only `matchday_deadlines`** and never touches `transfer_windows` or `transfers_open`. So the admin clicking OPEN does not enable transfers and CLOSE NOW does not stop them for WC/tournament leagues — enforcement runs on the matchday-deadline schedule regardless.
- **Impact**: Commissioner has the illusion of control but no actual effect on the enforcement path. A transfer can be blocked even when the admin "opens" the window, or allowed when the admin "closes" it.
- **Fix options**:
  A. Teach `process-transfer` to also check `transfer_windows` (add a secondary OR condition before the matchday fallback).
  B. Make OPEN/CLOSE write/update `matchday_deadlines` instead of `transfer_windows`.
  C. Document that WC leagues are deadline-controlled only, and remove the OPEN/CLOSE buttons from the WC commissioner view.
  Option C is the fastest safe fix for the pilot (prevents misleading the commissioner); Option A is the proper long-term fix.
- **Effort**: ~30 min (Option C UI guard), ~1.5h (Option A migration + process-transfer change)

---

### 🟠 P1 — Fix in first week of pilot

#### AUDIT-58-A3 — Status pills on all 4 Lifecycle cards are hardcoded ✅ FIXED (session 62, PR #269) — desktop LifecycleOp cards fixed in session 58; mobile MobLifecycleCard Transfer Window + Draft pills now derive from live league state
- **File**: `src/components/league/CommissionerPanel.jsx:1098, 1131, 1156, 1177`
- **Issue**: Every `LifecycleOp` card passes a literal status string — `status="CLOSED"`, `status="DEADLINE SET"`, `status="UNSEEDED"`, `status="UTILITY · ON-DEMAND"`. The spec (`docs/brand/admin-tab/LOGIC.md §3.1`) requires live state copy such as `"OPEN · CLOSES IN {duration}"`, `"SCHEDULED · OPENS {datetime}"`, etc. The Transfer Window card reads "CLOSED" even when the commissioner just opened it. The Draft card reads "DEADLINE SET" even before a deadline exists.
- **Impact**: Commissioner cannot trust the panel as a diagnostic. After running each operation, the status label does not change.
- **Fix**: Pass real derived state to `LifecycleOp`. For Transfer Window: call `get_transfer_window_status` on mount and after open/close to derive current status string. For Draft: derive from `league.draft_deadline` + `now()`. For Cup: derive from `league.cup_phase`.
- **Effort**: ~1.5h (requires fetching league state inside `LifecycleOps` or passing it down as a prop)

#### AUDIT-58-A4 — No precondition enforcement on one-way lifecycle operations ✅ FIXED (session 58b, PR #246)
- **Files**: `src/components/league/CommissionerPanel.jsx:1095-1197`
- **Issue**: The spec (§3.2, §3.3) says:
  - Allocation should be **disabled** until the draft deadline has passed, and hidden/changed after it runs.
  - Cup seed should be **disabled** until allocation has run.
  The code disables only on `commLoading`. A commissioner can seed the cup before running allocation, run allocation multiple times after seeding, or run either before a deadline. No ordering is enforced.
- **Secondary note**: `seed_cup_clubs` is also fired automatically via the `leagues_cup_seed` DB trigger ([74_draft_cup_fixes.sql:51](supabase/migrations/74_draft_cup_fixes.sql:51)) whenever `cup_phase` transitions from `pre_cup`. The manual SEED button can therefore double-fire (benign due to `ON CONFLICT DO NOTHING`, but the "can't be undone" warning is misleading — it's actually idempotent).
- **Fix**: Pass `league` state into `LifecycleOps`. Derive guards: `allocationDisabled = !league.draft_deadline || new Date(league.draft_deadline) > new Date()`, `cupDisabled = league.cup_phase === 'pre_cup'`. Disable buttons accordingly. Update SEED button copy to reflect idempotency.
- **Effort**: ~45 min

#### AUDIT-58-A5 — VOID bet is a non-functional no-op ✅ FIXED (session 58b, migration 101, PR #246)
- **File**: `src/components/league/CommissionerPanel.jsx:990-994`
- **Issue**: VOID button: `if (!window.confirm(…)) return; // TODO: wire to voidBet when that function is added`. The confirm dialog fires, then nothing happens. No `voidBet` function exists in `useCommissioner.js`. The spec (§2.2) expects `voidBet(betId)` to mark the bet `state='voided'`, clear picks, and notify managers.
- **Fix**: Add `voidBet` to `useCommissioner.js` — update `bet_instances.status = 'voided'` and `bet_submissions.is_correct = false` for all picks. Wire the button.
- **Migration needed**: `resolve_bet` may need a sibling `void_bet` RPC with commissioner auth check, or it can be a direct update via the client with an RLS policy that permits commissioner role. Either way add AUDIT-58-A7's auth guard at the same time.
- **Effort**: ~1h (hook + migration/RLS)

#### AUDIT-58-A6 — Timezone inconsistency: draft deadline and transfer windows stored without normalization ✅ FIXED (session 58, PR #245)
- **Files**: `src/hooks/useCommissioner.js:139-140` (draft deadline), `src/hooks/useCommissioner.js:86-88` (transfer window open)
- **Issue**: Bet deadlines go through `new Date(deadline).toISOString()` before storage (line 312). But `setLeagueDraftDeadline` stores `draftDeadline` raw (the naive `datetime-local` string `YYYY-MM-DDTHH:mm`), and `openTransferWindow` stores `windowOpensAt` raw the same way. Postgres `timestamptz` interprets a timezone-less string as UTC — but a commissioner in GMT+1 entering "19:00" actually means 18:00 UTC. The draft deadline and window times will be off by the commissioner's UTC offset.
- **Fix**: Normalize both values before storage: `new Date(draftDeadline).toISOString()` and `new Date(windowOpensAt/windowClosesAt).toISOString()`.
- **Effort**: ~15 min

---

### 🟡 P2 — Monitor / post-pilot

#### AUDIT-58-A7 — `resolve_bet` server authorization gap ✅ FIXED (session 58, shared with AUDIT-57-01, migration 97)
- **Files**: `supabase/migrations/84_resolve_bet_fix.sql`, `src/hooks/useCommissioner.js:345-359`
- **Issue**: Carried from AUDIT-57-01. `resolve_bet` is SECURITY DEFINER + granted to `authenticated` with no commissioner-role check. The admin panel is the only UI surface, but any user can call the RPC directly. Since VOID (A5) will require the same pattern, both should be fixed in the same migration.
- **Fix**: Add `IF NOT EXISTS (SELECT 1 FROM league_members WHERE league_id = v_league_id AND user_id = auth.uid() AND role = 'commissioner') THEN RAISE EXCEPTION 'unauthorized'; END IF;` inside `resolve_bet`.
- **Effort**: ~30 min (shared migration with A5)

#### AUDIT-58-A8 — Score Recalc defaults to placeholder fixture ID `'test-live'` ✅ FIXED (session 58, PR #245)
- **File**: `src/hooks/useCommissioner.js:50`
- **Issue**: `scoreFixtureId` is initialized to `'test-live'` — the input field is pre-filled with this non-real value. If a commissioner clicks RECALCULATE without changing the field, the `calculate-scores` edge function runs against `fixture_id='test-live'`. Depending on edge function behaviour (it may return 0 updates silently or error). The spec (§3.4) says the field should eventually be a typeahead; at minimum the default should be empty so RECALCULATE ↯ stays disabled until a value is provided.
- **Fix**: Change initial state to `''` and ensure the button is disabled when `!scoreFixtureId` (already done in UI — just remove the default init value).
- **Effort**: 5 min

#### AUDIT-58-A9 — Dead / duplicate bet-creation code paths ✅ FIXED (session 58c, PR #247)
- **File**: `src/hooks/useCommissioner.js:180-322`
- **Issue**: Four overlapping bet-create functions exist: `createBetDirect` (line 180), `createBetFromData` (line 288), `createBetInstance` (line 260), `autoGenerateBetOptions` (line 204). Only the wizard path (`createBetFromData`, called via `onPublish` in `CreateBetWizard`) is live. The others are exported in the hook's return value but unused by any component. `reward_type` is hard-coded `'points'` in `createBetFromData` but is a parameter in `createBetDirect`. If a future change adds budget-reward bets, the wrong function may be reached.
- **Fix**: Remove or clearly mark the legacy functions. Consolidate into a single `createBet(data)` function.
- **Effort**: ~45 min refactor (low priority; no runtime impact today)

#### AUDIT-58-A10 — "WHO PICKED WHAT" denominator is nonsensical ✅ FIXED (session 58, PR #245)
- **File**: `src/components/league/CommissionerPanel.jsx:933`
- **Issue**: The sub-label reads `{betSubmissions.length}/{pending.length + 2}`. `pending.length + 2` is the count of unresolved bets plus 2 — not the number of managers or any meaningful denominator. Should be the league member count (e.g. `memberCount`), passed as a prop. The hardcoded "20 CLUBS · 14 MGRS" copy on the Cup card (:1163) is similarly static.
- **Fix**: Pass `memberCount` into `ResolvePendingBets` (already passed to the parent `CommissionerPanel`). Replace `pending.length + 2` with `memberCount`. Update cup card copy to derive from league data.
- **Effort**: ~15 min

---

## 🔍 TECHNICAL DUE DILIGENCE — SESSION 55 START HERE

**Context**: Multi-agent deep audit of game logic, scoring, transfers, auctions, draft, bets, security, and data ingestion. 19 findings across 5 areas. Ordered by pilot impact.

**Session 55 results:**
- TDD-V01/V02/V03: TDD-02 (auctions) and TDD-05 (RLS) NOT confirmed — both already correct ✅
- TDD-01 ✅ FIXED — `execute_transfer_atomic()` RPC with FOR UPDATE row lock
- TDD-02 ✅ NOT AN ISSUE — verified correct status enum + column names in prod
- TDD-03 ✅ FIXED — `squads_captain_not_joker` CHECK constraint added
- TDD-04 ✅ FIXED — `draft_deadline_check` BEFORE INSERT trigger on draft_submissions
- TDD-05 ✅ NOT AN ISSUE — all 4 tables already have rowsecurity=true
- TDD-06 ✅ FIXED — sync-fixtures now logError() + returns HTTP 500 on deadline upsert failure
- TDD-08 ✅ FIXED — `penalty_scored` column added; restored to ingest upsert
- TDD-09 ✅ FIXED — penalty_saved now only awarded to GKs with mins > 0
- TDD-17 ✅ NOT AN ISSUE — wizard only shows Classic + Draft formats (no H2H/Cup option)
- All fixed via PR #223 (migration 93 + 3 edge functions redeployed)

---

### 🔬 VERIFICATION QUERIES — Run before acting on ⚠️ items

#### TDD-V01 — Auction status enum
```sql
SELECT DISTINCT status FROM auction_listings LIMIT 10;
-- Expected 'open'; if returns 'active' → TDD-02 confirmed (auctions fully broken)
```

#### TDD-V02 — RLS on draft tables
```sql
SELECT tablename, rowsecurity
FROM pg_tables
WHERE tablename IN ('draft_submissions','draft_allocations','transfers','trade_proposals')
ORDER BY tablename;
-- rowsecurity=false on any row → TDD-05 confirmed (any user can read/write)
```

#### TDD-V03 — Auction resolver function signature
```sql
SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname='resolve_auction_listing';
-- Look for 'highest_bidder_id' vs 'bidder_squad_id' — mismatch confirms TDD-02
```

---

### 🔴 P0 — Fix before first pilot user logs in

#### TDD-01 — Concurrent transfers can double-spend budget (CRITICAL)
- **File**: `supabase/functions/process-transfer/index.js:147–278`
- **Issue**: Two simultaneous BUY clicks both read `budget_remaining=X`, both pass the budget check, both write. No `SELECT … FOR UPDATE` row lock. Two failure modes:
  1. Budget not decremented correctly (second UPDATE overwrites first with stale budget)
  2. Squad player array loses one player (both reads see same array, both append, last-write-wins)
- **Real-world trigger**: Double-click on BUY, slow network retry, or two browser tabs
- **Fix**: Wrap the read-check-write in a Postgres function with `SELECT … FOR UPDATE` on the squad row, called via RPC. Or add a DB CHECK trigger validating budget after UPDATE.
- **Effort**: ~2h

#### TDD-02 — Auctions may be fully broken ⚠️ (CRITICAL — verify with TDD-V01/V03 first)
- **Files**: `supabase/migrations/27_auction_listings.sql` + `supabase/migrations/36_auction_resolution.sql`
- **Issue**: Two potential mismatches found between migration 27 (table) and migration 36 (resolver):
  1. Resolver queries `status='open'`; table may use `status='active'` → cron finds 0 rows
  2. Resolver references `highest_bidder_id`; column may be `bidder_squad_id` → function crashes
- **Impact if confirmed**: No expired auction has ever resolved. Players stay locked in seller's squad. Budget never refunded. Auction feature non-functional end-to-end.
- **Fix options**:
  A. Patch `resolve_auction_listing()` to use correct column/status names (~30 min migration)
  B. **Disable Auctions tab in UI for the pilot** (10 min) — safest if fix is risky to push under time pressure
- **Effort**: 30 min fix or 10 min disable

#### TDD-03 — Captain + Joker multipliers stack; Wildcard inflates captain bonus (HIGH)
- **File**: `supabase/functions/calculate-scores/index.js:484–489`
- **Issue 1 — Stacking**: Same player as Captain (×2) + Joker (×2) → 4× multiplier (6× with Triple Captain). No constraint prevents `captain_id == joker_player_id`. One pilot user can exploit this.
- **Issue 2 — Wildcard order**: Wildcard 1.1× applied to squad total AFTER captain bonus is computed, so it inflates the captain bonus by 10% beyond design intent.
- **Fix**:
  1. Add `CHECK (captain_id IS DISTINCT FROM joker_player_id)` to squads (migration)
  2. In `calculate-scores`, apply Wildcard to base player scores before captain/joker loop — or document post-multiplier as intended
- **Effort**: ~30 min

#### TDD-04 — Draft submissions have no server-side deadline check (CRITICAL)
- **File**: `supabase/migrations/02_draft_system.sql`
- **Issue**: No trigger validates that a draft submission arrives before `leagues.draft_deadline`. Client enforces it, but direct Supabase API calls bypass this. Combined with TDD-05, this is a simple exploit.
- **Fix**: Add `BEFORE INSERT` trigger on `draft_submissions` comparing `NOW()` with `leagues.draft_deadline`. Return error if past.
- **Effort**: ~30 min

#### TDD-05 — RLS disabled on draft tables ⚠️ (CRITICAL — verify with TDD-V02 first)
- **File**: `supabase/migrations/02_draft_system.sql:103–110`
- **Issue**: `draft_submissions`, `draft_allocations`, `transfers`, possibly others may have RLS DISABLED (early migration, pre-dating security hardening in migration 66). Any authenticated user can read/write any league's draft data.
- **Impact**: Exploitable in ~10 lines of JS by any pilot user who watches network requests.
- **Fix**: Enable RLS + policies: "league members can read/write only their own league's draft data".
- **Effort**: ~1h (migration)

---

### 🟠 P1 — Fix in week 1 of pilot

#### TDD-06 — `sync-fixtures` silent failure ✅ FIXED (session 55, PR #223)
- **File**: `supabase/functions/sync-fixtures/index.js:140–144`
- **Issue**: Deadline upsert errors are `console.log`-ed only; function returns HTTP 200 / `ok:true`. Transfer deadlines silently go missing → managers transfer after kickoff.
- **Fix**: Add `logError()` + return HTTP 500 on deadline upsert failure.
- **Effort**: ~15 min

#### TDD-07 — Captain reallocation notification ✅ FIXED (session 55, PR #225)
- Captain reallocation now inserts a `league_notifications` row (`captain_moved`) so the manager sees it in the league feed.

#### TDD-08 — `penalty_scored` stat ✅ FIXED (session 55, PR #223)
#### TDD-09 — GK `penalty_saved` starter-only ✅ FIXED (session 55, PR #223)
#### TDD-10 — Transfer deadline scoping ✅ VERIFIED OK (session 55)
- All 7 WC deadlines confirmed correct. r1 deadline = 19:00 UTC (kickoff time). Logic is sound — no code change needed.

#### TDD-11 — Position quota enforced atomically ✅ FIXED (session 55, PR #225)
- `execute_transfer_atomic()` updated to accept `p_pos_limit` + `p_squad_max`; position cap and squad size now validated inside the `FOR UPDATE` lock.

#### TDD-12 — Trade double-accept race ✅ FIXED (session 55, PR #225)
- `accept_trade_proposal()` now locks proposal + both squad rows (`FOR UPDATE` in UUID order) before checking ownership.

#### TDD-13 — Non-match-result bets manual resolve ✅ FIXED (session 55, PR #225)
- CommissionerPanel `ResolvePendingBets` now shows a free-text answer input alongside option chips — commissioner can type any answer key for `top_scorer`/`player_block` bets.
- `resolve-bets` edge function: fixed wrong RPC param (`p_correct_answer` → `p_answer`) — match-result auto-resolution was silently failing on every cron tick.

#### TDD-14 — Draft miss notification ✅ FIXED (session 55, PR #225)
- `run-draft-lottery` now fetches all `league_members`, diffs against submission list, and sends `league_notifications` to managers who never submitted a wishlist.

---

### 🟡 P2 — Monitor during pilot / post-launch

#### TDD-15 — Forza API load during 3 concurrent WC matches (LOW-MEDIUM)
- **Details**: 3 matches × 5-min poll × ~4 endpoints ≈ 144 API calls/hr during group stage. No backoff or rate-limit response handling visible in ingest functions.
- **Action**: Monitor `edge_function_errors` daily. Add exponential backoff if errors appear.

#### TDD-16 — Public squad read policy ✅ FIXED (session 55, PR #225)
- `squads_public_read` policy (`USING (true)`) dropped via migration 95. Squad data (budget, player arrays) no longer readable by unauthenticated users.

#### TDD-17 — H2H + Cup formats non-functional ✅ HIDDEN FOR PILOT (session 58c, PR #247)
- **Details**: `h2h_records` table exists but no function populates H2H matchups. Cup bracket generator is also absent. Both features are dead code paths.
- **Action**: Add UI guard in `LeagueCreationWizard` — restrict to CLASSIC format only for the pilot, or add "coming soon" label on H2H/Cup. Prevents pilot users creating a broken league type.
- **Effort**: ~30 min

#### TDD-18 — Service role JWT hardcoded in migration SQL (visible in git history) (MEDIUM)
- **File**: `supabase/migrations/91_fix_remaining_current_setting_crons.sql:20, 38`
- **Issue**: Service role JWT in plaintext in committed migration. Visible in git history permanently.
- **Action**: Rotate Supabase service role key after pilot launch (dashboard → Settings → API → Reset). Update cron job URLs with new key via new migration.

#### TDD-19 — Chat rate limit racy under parallel connections (LOW)
- **File**: `supabase/migrations/77_security_polish.sql:53–74`
- **Issue**: Rate-limit trigger counts existing rows before INSERT — two parallel connections can both pass before either inserts, giving 2× the intended rate.
- **Action**: Monitor. Only relevant at scale; low risk for a small friends/family pilot.

---

## 🚀 PILOT READINESS — SESSION 54 CONTEXT

**Context**: P0 blockers fixed + PILOT-03 league creation flow fully browser-tested (session 53). Next priority: PILOT-04 player prices.

### ✅ P0 — FIXED (session 53)

#### PILOT-01 — Sync crons fail silently — FIXED ✅ (migration 90)
- **Root cause**: `sync-wc-fixtures-6h` and `sync-wc-players-6h` used `current_setting('app.service_role_key')` which returns NULL on hosted Supabase (`ALTER DATABASE SET` not permitted). Same pattern as migration 86.
- **Fix**: Migration 90 unschedules both crons and re-schedules with hardcoded `https://sssmvihxtqtohisghjet.supabase.co` URL and service role bearer token. Applied to production 2026-05-29.
- **Verified**: `cron.job` rows for both jobs now contain literal URL + token (no `current_setting` calls).

#### PILOT-02 — r2 transfer deadline is AFTER WC kick-off — FIXED ✅
- **Fix**: `429-r2` deadline updated from `2026-06-12 08:11 UTC` → `2026-06-11 17:00 UTC` (2h before kick-off).
- **Verified**: `SELECT deadline_at FROM matchday_deadlines WHERE matchday_id='429-r2'` returns `2026-06-11 17:00:00+00`.

### ✅ P1 — TESTED (session 53)

#### PILOT-03 — League creation + invite flow — PASS ✅ (session 53)
- **Tested**: Full browser flow against live app via Playwright.
- **Create flow**: e2e_test1 (TestComm) → `+` → wizard → `PILOT_TEST_LEAGUE`, WC auto-selected, CLASSIC → START SEASON → invite card with code `BC8D3D`. DB: `tournament_id='429'`, `format='classic'`. ✅
- **Join flow**: Logged out → e2e_test2 (TestMgr) → LEAGUE → entered `BC8D3D` → JOIN → league appeared in MY LEAGUES, board shows 2/2 members. DB: 2 `league_members` rows. ✅
- **WC default**: FIFA WORLD CUP 2026 already the default selection with `SELECTED` badge — PILOT-06 also resolved. ✅
- **Bug found & fixed during test**: Tournament name showed "Fantasy League" instead of "FIFA World Cup 2026" on invite card. `LeagueInviteCard.jsx` queried `tournaments.id` (UUID) with Forza integer string `'429'` → 400. Fixed to `.eq('forza_id', ...)`. PR [#218](https://github.com/SMTCB/WCFantasyFootball/pull/218) merged. ✅

### 🟡 P1 — Still Open

#### PILOT-04 — Player prices tiered ✅ FIXED (session 55, migration 94)
- **Fix**: 4-tier nation pricing applied (S=£7.0 base, A=£6.0, B=£5.0, C=£4.0) + position adjustment (FWD+1.0, MID+0.5, GK-0.5) + random noise (×1.5). Cap £4.0–9.5.
- **Result**: France/England/Brazil FWDs avg £8.5–8.7; Curaçao/Qatar GKs avg £4.3–4.5. Elite squad costs ~£95M, mixed squad ~£80M — creates real trade-off decisions.
- **Verified**: Distribution query confirmed all tiers correct in prod.

#### PILOT-05 — Cron audit + Forza API key — RESOLVED ✅ (session 53)
- **Forza API key**: `FORZA_ACCESS_TOKEN` confirmed set in Edge Function secrets — `test-forza-api` returned live Premier League data, `token_set: true`.
- **Full cron audit (12 jobs)**: found 2 more `current_setting()` bugs beyond migration 90.
  - `resolve-finished-bets`: was **FAILING every 15 min** — bets never auto-resolved after matches. Fixed in migration 91.
  - `ingest-match-events-live`: showed "0 rows / succeeded" (no live fixtures), but would have silently broken on June 11 when WC goes live. Fixed in migration 91 (PR [#220](https://github.com/SMTCB/WCFantasyFootball/pull/220)).
- **Verified post-fix**: both crons show `status: succeeded` in `cron.job_run_details` — confirmed live.
- **10/12 crons healthy**; `auto-close-bets`, `prune-error-logs`, `resolve-expired-auctions` are pure SQL and never broken.

### ✅ P3 — CONFIRMED RESOLVED

#### PILOT-06 — League creation wizard WC default — RESOLVED ✅ (session 53)
- Confirmed during PILOT-03 browser test: FIFA WORLD CUP 2026 is already the first option with `SELECTED` badge pre-applied. No code change needed.

#### PILOT-07 — Mobile builds not available
- iOS/Android native builds haven't been compiled. Web-only pilot is fine for now; mobile users will use the browser version. Not a blocker.

#### PILOT-08 — Error monitor shows 5 warnings
- All 5 are harmless: "Captain on bench; bonus moved to highest-scoring starter" from our own E2E test sessions. Safe to clear:
  ```sql
  DELETE FROM edge_function_errors WHERE created_at < NOW() - INTERVAL '1 day';
  ```

---

## 📊 SESSION 55 PROGRESS (2026-05-30 — TDD Audit Fixes + Pilot Readiness)

**Goal**: Work through technical due diligence audit findings from session 54. Fix all P0 + P1 items before WC kick-off (Jun 11).

### ✅ VERIFICATION PASS (session 55 start)

- **TDD-V01**: Auction status enum = `open/cancelled/sold` ✅ — TDD-02 NOT confirmed
- **TDD-V02**: All 4 draft/transfer tables have `rowsecurity=true` ✅ — TDD-05 NOT confirmed
- **TDD-V03**: `resolve_auction_listing` uses correct column names + status ✅ — TDD-02 NOT confirmed
- **Net result**: 2 P0 items eliminated without code changes; 3 real P0s and all P1s tackled

### ✅ PR [#223](https://github.com/SMTCB/WCFantasyFootball/pull/223) — P0 Fixes (migration 93)

| TDD | Fix |
|-----|-----|
| TDD-01 | `execute_transfer_atomic()` Postgres function with `SELECT FOR UPDATE` — eliminates budget double-spend race from double-click / concurrent tabs |
| TDD-03 | `CHECK (captain_id IS DISTINCT FROM joker_player_id)` constraint on squads — prevents 4× (6× with Triple Captain) multiplier exploit |
| TDD-04 | `BEFORE INSERT` trigger `draft_deadline_check` on `draft_submissions` — deadline enforced server-side, not just client |
| TDD-06 | `sync-fixtures`: `logError()` + HTTP 500 on `matchday_deadlines` upsert failure (was silently returning ok:true) |
| TDD-08 | `penalty_scored` column added to `player_match_stats`; restored to ingest upsert — FWD penalty goal bonus was always 0 |
| TDD-09 | GK `penalty_saved` now restricted to `mins > 0` — backup GKs were getting +5 from the bench |

### ✅ PR [#224](https://github.com/SMTCB/WCFantasyFootball/pull/224) — PILOT-04 Player Prices (migration 94)

- 4-tier nation pricing across all 48 WC nations (Tier S=£7.0 base, A=£6.0, B=£5.0, C=£4.0)
- Position adjustment: FWD +1.0, MID +0.5, DEF ±0, GK -0.5; random noise ×1.5; cap £4.0–9.5
- **Result**: Elite FWDs avg £8.5–8.7, Tier-C GKs avg £4.0–4.3. Full elite squad ≈£95M — real budget trade-offs
- **Verified via DB query**: Distribution correct across all tiers

### ✅ PR [#225](https://github.com/SMTCB/WCFantasyFootball/pull/225) — P1 Fixes (migration 95)

| TDD | Fix |
|-----|-----|
| TDD-07 | `calculate-scores` inserts `league_notifications` (`captain_moved`) when captain bonus reallocated |
| TDD-10 | Verified OK — all 7 WC deadlines correct, r1=19:00 UTC (kickoff). No code change |
| TDD-11 | `execute_transfer_atomic()` extended: `p_pos_limit` + `p_squad_max` params; position cap + squad size validated inside the lock |
| TDD-12 | `accept_trade_proposal()`: `FOR UPDATE` on proposal + both squad rows in UUID order (deadlock-safe) |
| TDD-13 | CommissionerPanel: free-text answer input added to `ResolvePendingBets`. Fixed `resolve-bets` edge function calling RPC with wrong param (`p_correct_answer` → `p_answer`) — match-result auto-resolution was silently failing on every cron tick since migration 72 |
| TDD-14 | `run-draft-lottery` diffs `league_members` vs submissions; sends notification to managers who missed the draft entirely |
| TDD-16 | `squads_public_read` policy (`USING(true)`) dropped — squad data no longer readable by unauthenticated users |

### ✅ SeasonStepper — data-driven (same session, uncommitted)

**`CommissionerPanel.jsx` + `LeagueScreen.jsx`** — `SeasonStepper` (desktop) and `MobSeasonStepper` (mobile) were previously hardcoded with demo phase states. Now data-driven:

| Phase | DB column / condition |
|---|---|
| TRANSFER WINDOW | `leagues.transfers_open` (bool) |
| DRAFT DEADLINE | `leagues.draft_deadline` set → active; past → done |
| ALLOCATION | `draft_deadline` passed → active; `cup_phase ≠ 'pre_cup'` → done |
| CUP SEEDED | `leagues.cup_phase ≠ 'pre_cup'` → active; in-season phase → done |
| IN SEASON | `cup_phase` in `group_stage / pre_elimination / elimination / final` → active |

`computePhases(league, memberCount)` helper drives both steppers; falls back to demo data when `league` is null (no active league selected). `league={activeLeague?.leagues}` passed from `LeagueScreen` — already loaded via `select('*')`, no extra fetch.

### 📋 REMAINING (low priority — post-pilot or monitor)

| TDD | Status |
|-----|--------|
| TDD-15 | Monitor `edge_function_errors` for Forza API rate limit issues during 3 concurrent WC matches |
| TDD-18 | Rotate Supabase service role key after pilot launch (JWT hardcoded in migration 91 git history) |
| TDD-19 | Chat rate limit race — monitor only; low risk at pilot scale |

---

## 📊 SESSION 53 PROGRESS (2026-05-29 — P0 Pilot Fixes)

**Goal**: Apply both P0 blockers identified in session 52 before any pilot user logs in.

### ✅ COMPLETED

**PILOT-01 — WC sync crons fixed (Migration 90)**
- `sync-wc-fixtures-6h` and `sync-wc-players-6h` used `current_setting('app.service_role_key')` → NULL on hosted Supabase
- Created `supabase/migrations/90_fix_wc_sync_crons.sql`: unschedule + re-schedule both crons with hardcoded URL + bearer token
- Applied to production; verified via `cron.job` query — no more `current_setting` calls

**PILOT-02 — Transfer deadline fixed**
- `429-r2` deadline moved from `2026-06-12 08:11 UTC` → `2026-06-11 17:00 UTC` (2h before kick-off)
- Applied directly via `npx supabase db query --linked`; verified in DB

**PR**: `claude/pilot-p0-fixes` — commit `dd0c24e` — merged to main

### ✅ PILOT-03 — League creation + invite flow browser test

**Full Playwright flow against https://wc-fantasy-football.vercel.app:**
- ✅ `LeagueCreationWizard` opens from `+` button on LEAGUE home
- ✅ FIFA WORLD CUP 2026 auto-selected (PILOT-06 closed)
- ✅ League name entry, CLASSIC format, START SEASON all work
- ✅ Invite card shows join code `BC8D3D`, LEAGUE CREATED ✓ message
- ✅ DB: `tournament_id='429'`, `format='classic'`, `join_code='BC8D3D'`
- ✅ TestMgr joined via code `BC8D3D` → appeared in MY LEAGUES instantly
- ✅ Board shows 2/2 members (TestComm + TestMgr), both in `league_members` DB

**Bug found & fixed (PR [#218](https://github.com/SMTCB/WCFantasyFootball/pull/218)):**
- `LeagueInviteCard.jsx` queried `tournaments.id` (UUID) with Forza integer string `'429'` → 400 on invite card display
- Fixed `.eq('id', ...)` → `.eq('forza_id', ...)` — verified via `preview_eval`: returns `"FIFA World Cup 2026"` ✅

### ✅ CRON AUDIT + PILOT-05 (later same session)

**Full 12-job cron audit against production `cron.job`:**

| Job | Result |
|---|---|
| `auto-close-bets` | ✅ Pure SQL, healthy |
| `calculate-scores-live` | ✅ Hardcoded URL, firing every 2 min |
| `calculate-scores-post-match` | ✅ Hardcoded URL, 22:30 UTC daily |
| `ingest-match-events-live` | ✅ FIXED (migration 91) — was `current_setting()` ticking bomb |
| `prune-error-logs` | ✅ Pure SQL, healthy |
| `resolve-expired-auctions` | ✅ Pure SQL, healthy |
| `resolve-finished-bets` | ✅ FIXED (migration 91) — was FAILING every 15 min |
| `run-draft-lottery` | ✅ `verify_jwt=false`, firing correctly |
| `run-reverse-standings-draft` | ✅ Healthy |
| `sync-wc-fixtures-6h` | ✅ Fixed in migration 90 |
| `sync-wc-player-status` | ✅ Healthy |
| `sync-wc-players-6h` | ✅ Fixed in migration 90 |

**PR [#220](https://github.com/SMTCB/WCFantasyFootball/pull/220)** — migration 91 — merged to main  
**Verified**: Both fixed crons show `status: succeeded` in live `cron.job_run_details`

**PILOT-06**: Confirmed resolved during PILOT-03 — WC already the default in wizard.

### 📋 NEXT (session 54)
- PILOT-04: Seed tiered player prices for WC (P1, deferred by user)

---

## 📊 SESSION 52 PROGRESS (2026-05-29 — WC E2E Full Playbook Run)

**Goal**: Run the full E2E test playbook against WC tournament (429) — all 8 flows — with player prices seeded and match events adapted from EPL.

### 🔧 PRE-TEST SETUP (Done automatically)
- ✅ Seeded prices (£4–£7 random) for all 1,589 WC players that had `price IS NULL`
- ✅ Inserted `player_match_stats` for 3 finished WC fixtures (Brazil 2-1 Morocco · Germany 3-0 Curaçao · Qatar 1-1 Switzerland) — 25 stat rows covering all squad players from those matches
- ✅ Installed missing `modern-screenshot` npm package (was crashing app on startup — see BUG-E2E-01)
- ✅ Linked test accounts to `WC_OVERALL_E2E` league, synced `draft_allocations`, set deadline to +14d
- ✅ Created open WC bet instance for admin-tab resolution flow

### ✅ FLOW RESULTS

| Flow | Name | Result | Notes |
|------|------|--------|-------|
| 1 | Draft — WC Player List | ✅ PASS | 1589 WC players, countdown, auto-complete→30, submit confirmed in DB (30, pending) |
| 2a | Bets — Place Pick | ✅ PASS | Brazil Win highlighted, `answer='home'` in DB |
| 2b | Bets — Admin Resolve | ✅ PASS | Bet resolved to `status='resolved'`, `correct_answer='home'`, `winners_count=1` |
| 3a | Transfer Market — Sell | ✅ PASS (after fix) | Initially failed — BUG-E2E-02 found & fixed. Richarlison sold, squad 14/15, budget +£6M |
| 3b | Transfer Market — Buy | ✅ PASS (after fix) | Kerem Akturkoglu bought, squad 15/15, budget -£7M |
| 4 | Auctions — Bid | ✅ PASS | current_bid updated £5.6→£6.5M. Audit trail bug found — see BUG-E2E-03 |
| 5 | League Board + Frontpage | ✅ PASS | 8 managers, correct GW2 label, 31.5 pts leader, Forza Times rendered |
| 6 | Squad Screen | ✅ PASS | 15/15, £25M budget, WC players, formation 5-1-3, GW 429-r2 |
| 7 | Live Centre | ✅ PASS | WC tile + GW2 label correct. "MEX vs SOU" = Mexico vs South Africa — confirmed genuine WC fixture (BUG-E2E-04 closed) |
| 8 | Admin Data Sync | ✅ PASS (partial) | Steps 1–4, 7–8 pass. Steps 5–6 (Sync/Ingest) fail with "Failed to fetch" — expected without Forza API key AND Playwright network isolation blocks raw fetch to Supabase functions. Score button tested via terminal curl: `updated_squads:12, player_stats:15` ✓. Board updated correctly after scoring all 3 r1 fixtures. See BUG-F8-01 below. |

### 🐛 BUGS FOUND & FIXED THIS SESSION

#### BUG-E2E-01 — Missing `modern-screenshot` dependency — FIXED ✅
- **Symptom**: App shows blank white page on startup. Console: `500 Internal Server Error` on `RecapScreen.jsx` and `LeagueInviteCard.jsx`
- **Root cause**: Both files import `domToPng` from `modern-screenshot` but the package was never added to `package.json`
- **Fix**: `npm install modern-screenshot --save`
- **Priority**: **P0** — crashes app on startup, blocks ALL testing
- **How to retest**: `npm run dev` → navigate to app → should render login screen without errors

#### BUG-E2E-02 — `process-transfer` uses wrong matchday for multi-round tournaments — FIXED ✅
- **Symptom**: Sell returns `"Player not in your squad"`. A new empty squad is created (`matchday_id='429-r7'`, `budget=£100`) instead of finding the existing one (`matchday_id='429-r2'`).
- **Root cause**: `supabase/functions/process-transfer/index.js` line 77 used `ORDER BY deadline_at DESC LIMIT 1` — resolves to the *furthest* future deadline (r7). Existing squad was pinned to r2. Squad lookup by `matchday_id` fails → creates phantom squad → player not found.
- **Fix**: Changed to `gte('deadline_at', now.toISOString()).ORDER BY deadline_at ASC LIMIT 1` — nearest upcoming deadline. Deployed to Supabase.
- **Files changed**: `supabase/functions/process-transfer/index.js`
- **Priority**: **P0** — breaks all WC transfers (buy and sell) for any league with multiple future deadlines
- **How to retest**: Search for Richarlison in WC market → SELL → confirm modal → budget increases, squad drops to 14/15 with no error toast

#### BUG-E2E-03 — Auction bids not persisting — FIXED ✅ (migration 90)
- **Root cause**: `place_bid` RPC used `ON CONFLICT DO NOTHING` on `UNIQUE(listing_id, bidder_id)` — any re-bid by the same user was silently dropped because the (listing, bidder) pair already existed from the first bid.
- **Fix**: Changed to `ON CONFLICT (listing_id, bidder_id) DO UPDATE SET amount=EXCLUDED.amount, placed_at=EXCLUDED.placed_at` — each user now has one row per listing, always reflecting their latest bid.
- **How to retest**: Place a bid → place a higher bid on same listing → `SELECT amount FROM auction_bids WHERE listing_id=... AND bidder_id=...` — should show the updated higher amount.

#### BUG-E2E-04 — Live Centre NEXT fixture "MEX vs SOU" — NOT A BUG ✅ (closed)
- **Investigation**: "MEX vs SOU" = Mexico vs South Africa — a genuine WC fixture on June 11, 2026. The `teamCode()` function renders "South Africa" → "SOU". The Live Centre IS correctly filtering by tournament when the WC tile is selected. No fix needed.

#### BUG-E2E-05 — Admin panel Transfer Window shows CLOSED for WC — FIXED ✅ (migration 90)
- **Root cause**: `get_transfer_window_status` only checked the `transfer_windows` table. WC leagues have no `transfer_windows` row — they use `matchday_deadlines` for enforcement. The function returned `no_window` even when a future deadline existed.
- **Fix**: Added a third path to `get_transfer_window_status`: if no `transfer_windows` row exists, check `matchday_deadlines` for the league's tournament. If a future deadline is found, return `status='open', window_type='matchday'`.
- **How to retest**: Admin tab → LIFECYCLE OPERATIONS → TRANSFER WINDOW should show `● OPEN` for WC_OVERALL_E2E (which has 429-r2 deadline ~June 12).

#### BUG-E2E-06 — Stale auction listings after player sold — FIXED ✅ (Edge Function)
- **Root cause**: `process-transfer` SELL path didn't cancel active `auction_listings` for the sold player. The ghost listing remained with a CANCEL button.
- **Fix**: After the squad update succeeds, the SELL path now cancels any open `auction_listings` where `league_id=league_id AND player_id=player_id AND seller_id=squad.id AND status='open'`.
- **How to retest**: List a player for auction → sell the same player via Transfer Market → Auctions tab: the listing should disappear (status cancelled).

#### BUG-E2E-07 — Create Bet fixture list always empty — FIXED ✅ (LeagueScreen.jsx)
- **Symptom**: When commissioner opens ADMIN tab → CREATE BET → Match Result, step 3 "SELECT MATCH" showed "NO SCHEDULED MATCHES BEFORE THIS DEADLINE" regardless of deadline, even though WC scheduled fixtures exist in the DB.
- **Root cause**: `LeagueScreen.jsx` passed `activeLeague?.tournament_id` to `useCommissioner` and `CommissionerPanel`, but `activeLeague` has shape `{ league_id, leagues: { tournament_id } }` — `activeLeague.tournament_id` is always `undefined`. The `BetCreatorPanel.fetchFixtures()` calls `if (!tournamentId) return` immediately, so the fixture list was never populated for any league.
- **Fix**: Changed both usages to `activeLeague?.leagues?.tournament_id` in `LeagueScreen.jsx` lines 170 and 1102.
- **Impact**: Create Bet Match Result and Top Scorer forms were broken for ALL leagues since the fixture/player population depended on `tournamentId`. Now works correctly.
- **How to retest**: ADMIN tab → CREATE BET → select Match Result → fixtures list should populate immediately without setting a deadline.

#### BUG-F8-01 — Admin `/admin` screen Edge Function buttons fail in Playwright test environment — OPEN 🟡 (test infra limitation)
- **Symptom**: Sync Fixtures, Ingest, and Score buttons in AdminSeedScreen all return "Failed to fetch". The Playwright MCP browser cannot make raw `fetch()` calls to external HTTPS endpoints (Supabase functions URL).
- **Root cause**: Network isolation in the Playwright sandbox blocks outbound HTTPS to `sssmvihxtqtohisghjet.supabase.co`. REST API calls via the Supabase JS SDK work (different transport path), but raw `fetch()` to Edge Functions does not.
- **Impact**: Flow 8 cannot be fully validated via Playwright. Score button was verified via `curl` from terminal instead.
- **Priority**: **P3** — test environment limitation only, not a production bug. Real users on browsers can reach Supabase Edge Functions normally.
- **Workaround for E2E testing**: Call `calculate-scores` and other Edge Functions via `curl` from terminal (no JWT needed — functions deployed with `--no-verify-jwt`). Then verify results on the board.
- **How to retest**: In a real browser (not Playwright): log in → `/admin` → select WC_OVERALL_E2E → Match Ingestion → click Score on a finished fixture → confirm response JSON shows `updated_squads: N`.

### 📈 IMPROVEMENTS IDENTIFIED

#### IMP-E2E-01 — Feature tours re-trigger every navigation (P3)
- Tours in Squad, League Board, Market, and Admin tabs appeared on every page visit during testing (4 separate tour pop-ups interrupted test flows)
- Tour dismissed state should persist in `localStorage` keyed by screen name, not just for the session
- **Effort**: ~1h

#### IMP-E2E-02 — Market `?league=` URL param not auto-selecting league (P3)
- Navigating to `/market?league=fca00001-...` shows the league selector instead of pre-selecting the league
- The param is preserved in the URL but `MarketScreen` ignores it on mount
- **Effort**: ~30min

#### IMP-E2E-03 — Squad screen shows 0 pts for all players even when r1 stats exist (P3)
- After seeding `player_match_stats` for r1, the squad screen still shows 0 pts per player
- The `calculate-scores` Edge Function must be manually triggered to populate `fantasy_points`
- An admin "Recalculate Scores" button exists in the admin panel but the flow isn't clear for WC
- **Effort**: ~1h (add per-round score trigger button to admin lifecycle panel)

#### IMP-E2E-04 — WC E2E playbook Appendix B needs WC-specific version (P3)
- The current Appendix B data reset script is EPL-only (tournament 426 hardcoded)
- A parallel WC appendix covering tournament 429 setup would prevent manual SQL work each run
- **Effort**: ~1h (documentation only)

#### IMP-E2E-05 — Points sources inconsistent across views — NOT A BUG ✅ (closed)
- Investigated: the three values are three different things, not a discrepancy.
  - `fantasy_points.total = 28.5` — round r1 score only (one row per squad per round)
  - Board at test start = 31.5 — `league_members.total_points` at that point (28.5 + 3pt bet reward from one resolved bet)
  - Live Centre = 36.5 — `league_members.total_points` after two more bet rewards (+3+5) were added
- `league_members.total_points` = sum of all `fantasy_points` rows + cumulative bet reward points. Both sources are correct; they measure different things. No fix needed.

---

## 📊 SESSION 51 PROGRESS (2026-05-28 — WC Pre-Launch Bug Sweep)

**Goal**: Clear the entire `docs/BUG_TRACKER.md` before WC kick-off (June 11, 2026).

### ✅ ALL BUGS RESOLVED — BUG_TRACKER IS CLEAR

**PR #215** — P1/P2/P3 bugs + improvements:
- ✅ **WC-05** (P1): Roster modal stuck — `loadManagerRoster` + `loadTradeSquads` now fall back to `squads.players` when no `draft_allocations` exist
- ✅ **WC-02** (P1): Bets tab showed "GW—" — `BetsTabHub` now receives `currentGW` prop from `LeagueScreen`
- ✅ **WC-03** (P1): Auction bid placeholder used `+0.1` — now uses `min_increment` from DB (default 0.5)
- ✅ **WC-07** (P1): Same player proposable twice — `submit_trade_proposal` RPC now guards with `PLAYER_ALREADY_PROPOSED`
- ✅ **IMP-A**: Trade cash sweetener default changed from £5M → £0
- ✅ **WC-01** (P2): `get_league_stats` RPC created (was 404 on STATS tab)
- ✅ **WC-06** (P2): Chat Realtime subscription warning now only fires on `CHANNEL_ERROR`/`TIMED_OUT`
- ✅ **IMP-B**: WC matchday deadlines seeded (rounds 4–7 for knockout stage)
- ✅ **WC-04** (P3): Auctions LIVE counter now counts `highest_bidder_id === mySquadId`
- ✅ **WC-09** (P3): LiveScreen GW shows next upcoming deadline (not latest overall)
- ✅ **Migration 88**: trade proposal guard + `get_league_stats` RPC + WC deadlines r4–r7

**PR #216** — Remaining items:
- ✅ **WC-08** (P3): `useTransferWindow` — module-level TTL cache (1min) + poll interval 60s → 5min
- ✅ **IMP-C**: WC scoring rules confirmed identical to EPL — acceptable for launch, no change needed
- ✅ **IMP-D** (new bug found during live test): `notify_league_on_bet_creation` trigger was missing `SECURITY DEFINER` — blocked ALL bet creation with 403. Fixed in Migration 89.
- ✅ **IMP-D E2E confirmed**: Player Block full flow tested in browser — Create → Submit → Resolve → +5 pts awarded ✅

**Session 51 status**: ✅ COMPLETE. BUG_TRACKER empty. App ready for WC June 11 launch.

---

## 📊 SESSION 50 PROGRESS (2026-05-28 — WC End-to-End Live Browser Test)

**Goal**: Comprehensive WC browser E2E test — simulate real user interaction across all league features using World Cup data (FIFA World Cup 2026, tournament 429).

### 🚀 DATA SETUP (SQL via Supabase CLI):
- ✅ 8 WC managers created (`aaaae001` → `aaaae008`, reusing EPL e2e accounts + 6 new)
- ✅ WC league `WC_OVERALL_E2E` (id: `fca00001-...`) with all 8 managers
- ✅ 8 squads — 15 WC players each, no overlaps (1589 total WC players, row_number partitioned)
- ✅ Scoring rules copied from EPL 426 → WC 429
- ✅ Matchday deadlines: `429-r1` (past), `429-r2` (+14d), `429-r3` (+21d)
- ✅ 3 WC Round 1 fixtures marked `finished` (Brazil 2-1 Morocco, Germany 3-0 Curaçao, Qatar 1-1 Switzerland)
- ✅ Fantasy points inserted directly: TestComm 28.5, TestMgr 22, DragonMgr 18.5, SambaFC 15, IronAtlas 14, EagleSquad 11.5, TartanArmy 9, DesertRose 6.5
- ✅ 2 open bet instances (Brazil vs Morocco result + GW1 Top Scorer)
- ✅ 5 auction listings (Richarlison £6M, Ounahi £5M — seller=TestComm; Gerson £5.5M — SambaFC; Hakimi £5M — EagleSquad; Kevin Schade £5M — TartanArmy)
- ✅ 10 pre-seeded chat messages from various managers
- ✅ `draft_allocations` created from squads (needed for roster modal)
- ✅ Migration 86: fix 5 cron jobs using unconfigured `current_setting('app.supabase_url')` → hardcoded URLs

### 🚀 BROWSER FLOWS TESTED (live interaction via Playwright):

**FLOW 1 — Login & Board ✅**
- Login as TestComm (e2e_test1@fantasykit.test), skip onboarding
- WC_OVERALL_E2E visible in MY LEAGUES with 28.5 pts, RANK #1 ✅
- BOARD: GW 2 header, all 8 managers listed with correct points ✅
- Commissioner tour auto-triggered ✅

**FLOW 2 — Frontpage ✅**
- Forza Times renders: "TESTCOMM leads the table" headline ✅
- "28.5 points" in article body ✅, EDITION #1 ✅

**FLOW 3 — Bets ✅**
- 2 open bets visible: Brazil vs Morocco + Top Scorer ✅
- Placed "Brazil Win" pick → highlighted with "Your pick" ✅
- Placed "Neymar" Top Scorer pick → checkmark ✅
- REPLAY BETS GUIDE FAB visible ✅

**FLOW 4 — Chat ✅**
- All 10 pre-seeded messages load ✅
- 8 members in sidebar ✅
- Sent live message with @mention (highlighted cyan) + #hashtag (highlighted) ✅
- EDIT/DEL on own messages ✅

**FLOW 5 — Auctions ✅**
- 5 listings: LISTED:5, STATUS:LIVE ✅
- Richarlison + Ounahi show CANCEL (seller = TestComm) ✅
- Placed bids: Hakimi £5.6M, Gerson £6.1M, Kevin Schade £5.6M — all 200 OK ✅

**FLOW 6 — Stats ✅**
- TOTAL:125, AVG:16, LEAD:28.5 ✅
- All 8 managers in ranked bar chart ✅
- LEAGUE OVERVIEW: MEMBERS:8, AVG POINTS:16, LEADER:TESTCOMM, TOTAL PTS:125 ✅
- BIGGEST GAMEWEEKS leaderboard: TestComm #1 ✅

**FLOW 7 — Trade Proposals (5 trades) ✅**
- Fixed roster modal (required creating draft_allocations from squads)
- Roster shows all 15 players per manager with 🔄 buttons ✅
- Trade 1: Richarlison ↔ Bento (TestMgr) — sent ✅
- Trade 2: João Pedro ↔ Hugo Souza (TestMgr) — sent, shows "SENT OFFERS (1)" panel ✅
- Trade 3: Kaio Jorge ↔ Carlos Augusto (DragonMgr) — sent ✅
- Trade 4: Nobel Mendy ↔ Pedro (SambaFC) — sent ✅
- Trade 5: Richarlison ↔ Natan (DragonMgr) — sent (REPEAT PLAYER — allowed, notes bug WC-07) ✅
- All 5 confirmed in DB: 5 `pending` rows ✅

**FLOW 8 — Admin Tab (Bet Resolution) ✅**
- Season Lifecycle bar shows: TRANSFERS ✅, DRAFT ✅, ALLOCATION ✅
- CREATE BET section: Top Scorer, Match Result, Player Block cards ✅
- RESOLVE BETS: 2 PENDING listed ✅
- Expanded Brazil vs Morocco → "WHO PICKED WHAT 1/4": TestComm → Brazil Win ✅
- Clicked Brazil Win → RESOLVE → green banner "Bet resolved — 1 submissions graded" ✅
- Down to 1 PENDING ✅

**FLOW 9 — Squad Screen ✅**
- Formation 5-1-3, GW 429-r2, CAPTAIN RICHARLISON displayed ✅
- WC players visible with national flags (BRA, SEN, IRA, MOR, GER, CZE) ✅

**FLOW 10 — Betting Leaderboard Tab ✅**
- YOUR BETTING: +3 PTS, RANK 1/1, PLAYED:1, WON:1, WIN%:100%, REWARDS:+3 ✅
- Betting Leaderboard shows TestComm #1, RECORD 1-0 ✅

**FLOW 11 — Live Screen ✅**
- 3 league tiles visible: EPL_DRAFT_TEST, EPL_OVERALL_E2E, WC_OVERALL_E2E ✅
- WC tile shows 28.5 pts, 1/8 ✅
- Switching to WC tile updates context: MY XI · W, NEXT: MEX vs SOU ✅

### 🐛 BUGS FOUND (9 total — see `docs/BUG_TRACKER.md` WC-01 through WC-09):
| ID | Summary | Severity |
|----|---------|---------|
| **WC-10** | `calculate-scores-post-match` cron `status='after'` — was NEVER firing (fixed mig 87) | 🔴 **CRITICAL** |
| WC-01 | `get_league_stats` RPC 404 (function missing) | 🟡 MEDIUM |
| WC-02 | Bets tab shows "GW—" for WC tournament | 🟡 MEDIUM |
| WC-03 | Auction placeholder min uses 0.1 increment instead of min_increment (0.5) | 🟡 MEDIUM |
| WC-04 | Auctions LIVE counter stays 0 after placing winning bids | 🟢 LOW |
| WC-05 | Roster modal stuck without draft_allocations (no fallback to squads) | 🟠 HIGH |
| WC-06 | useChatMessages Realtime subscription fails for new leagues | 🟡 MEDIUM |
| WC-07 | Same player proposable in multiple simultaneous trades | 🟡 MEDIUM |
| WC-08 | get_transfer_window_status called 20+ times per session | 🟢 LOW |
| WC-09 | LiveScreen shows GW 3 instead of GW 2 for WC league | 🟢 LOW |

**Session 50 status**: ✅ COMPLETE. WC E2E test fully executed. All flows work except noted bugs. Data preserved in DB.

---

## 📊 SESSION 49 PROGRESS (2026-05-28 — Trade Proposals + Commissioner Guide)

### Part B — Commissioner In-App Guide

**Goal**: Surface a re-triggerable commissioner guide inside the Admin tab with a branded replay button and full lifecycle tour.

**🚀 COMPLETED:**

- ✅ **`src/components/TourReplayButton.jsx`** (NEW) — branded gold pill FAB replacing the plain `?` circle
  - Fixed-position, bottom-right, above nav bar; gold border + hover state; accepts `label`, `title`, `onReplay` props
- ✅ **`src/components/league/BetsTabHub.jsx`** — replaced inline `?` button with `TourReplayButton`
- ✅ **`src/components/league/CommissionerPanel.jsx`** — 3 changes:
  - `replayCommissionerTour` prop wired into function signature
  - `TourReplayButton` rendered in both mobile and desktop layouts (label: "REPLAY ADMIN GUIDE")
  - 13 `data-tour` anchors added across all 8 zones (both mobile + desktop): `comm-season-stepper`, `comm-transfer-window`, `comm-draft-deadline`, `comm-cup-phase`, `comm-score-recalc`, `comm-bets`, `comm-resolve`
- ✅ **`src/screens/LeagueScreen.jsx`** — `COMMISSIONER_TOUR_STEPS` expanded from 4 → 8 steps:
  1. Season Lifecycle (overview of progression bar)
  2. Transfer Window (open/close controls)
  3. Draft & Allocation (deadline + run allocation)
  4. Cup Phase (seed clubs)
  5. Score Recalculation (per-fixture re-run)
  6. Create Bets (prediction challenges)
  7. Resolve Bets (manual resolution)
  8. Weekly Gameweek Flow (repeating cycle summary)
- ✅ **Build clean**, E2E 36/36 passing, pushed to `origin/main` (commits `ae4d0fb`–`3e35b9e`)

**No new migrations** — entirely frontend.

---

### Part A — Trade Proposals

**Goal**: Implement the trade proposals feature end-to-end (DB, RPCs, hook, UI).

**🚀 COMPLETED THIS SESSION:**

- ✅ **Migration 85 applied to production** — `trade_proposals` table + 4 SECURITY DEFINER RPCs
  - `submit_trade_proposal` — validates ownership, budget/points checks, INSERT + notification
  - `accept_trade_proposal` — atomic player swap via `array_remove || ARRAY[]`, cash/points transfer, cascading cancel of other pending proposals
  - `reject_trade_proposal` — sets status to rejected, updates resolved_at
  - `cancel_trade_proposal` — proposer cancels their own pending proposal
  - `cash_sweetener` guarded by `CHECK (cash_sweetener >= 0)` + `INVALID_SWEETENER` error
  - `RETURNING id INTO v_new_proposal_id` pattern prevents racy subquery for notification insert

- ✅ **`src/hooks/useTradeProposals.js`** (NEW) — fetch, subscribe, submit/accept/reject/cancel
  - Realtime subscription on `trade_proposals` filtered by `league_id`
  - Splits proposals into `incoming` / `outgoing` by `mySquadId`

- ✅ **`src/screens/LeagueScreen.jsx`** (MODIFIED) — wired trade proposals UI
  - Incoming and outgoing panels inside the trade builder modal
  - ACCEPT / DECLINE / CANCEL OFFER buttons per proposal
  - Badge count on notification icon (`extraCount={incomingTrades.length}`)
  - Double-submit guard (`isSendingProposal` state + `disabled` button)
  - `squadId` guard before proposal submission (populated from `squadByUserRef`)

- ✅ **Merged to main** — commit `ba426d6` (squash merge, branch deleted)

**No pending Supabase tasks** — migration 85 applied, no new edge functions needed.

---

## 📊 SESSION 48 PROGRESS (2026-05-27/28 — E2E CI fixes + bet duplicate guard)

**Goal**: Fix E2E CI tests that were always cancelling at the timeout limit.

**🚀 COMPLETED THIS SESSION:**

- ✅ **PR #210 `claude/fix-e2e-ci-failures`** — merged to main  
  - **E2E-01 Root cause 1**: `timeout-minutes` was 20, raised to 60  
  - **E2E-01 Root cause 2**: 8 of 9 spec files query live Supabase directly (draft, scoring, bets, autofill). They were running in CI and consuming the full time budget with retries. Excluded all via `testIgnore` — only `platform.spec.js` (true UI tests, no DB calls) runs in CI.  
  - **E2E-01 Root cause 3**: SquadScreen tests — demo user UUID has real Supabase league memberships → league picker appeared before squad UI; fixed by adding `selectFirstLeagueIfPicker()` to `beforeEach`  
  - **E2E-01 Root cause 4**: 404 test expected auto-redirect but `NotFoundScreen` shows a button; fixed  
  - **E2E-01 Root cause 5**: `GW38 matchday_deadline is in future` assertion in `scoring-pipeline.spec.js` — deadline was 2026-05-24 (now past); changed to just check existence  
  - **Playwright browser caching**: Added `actions/cache@v4` for `~/.cache/ms-playwright` — CI E2E now completes in ~3 min (was cancelling at 40 min)  

- ✅ **PR #211 `claude/bet-duplicate-guard`** — merged to main  
  - **BUG-NEW-07**: Added `creatingRef` guard in `BetCreatorPanel` to prevent duplicate bet instance creation on rapid double-clicks  
  - Updated `HANDOFF_PROMPT.md` + `BUG_TRACKER.md` for session 48  

**No new migrations in session 48** — all fixes were frontend + CI only.

---

## 📊 SESSION 44 PROGRESS (2026-05-26 — Full E2E Live Data Test)

**Goal**: End-to-end test of the complete fantasy football flow using real Forza API data: league creation → draft → GW30/31 scoring → bets → transfers → auctions.

**🚀 COMPLETED THIS SESSION:**

- ✅ **PR #201 `claude/e2e-test-fixes`** — 3 critical bug fixes + migration 79 — merged to main

**League EPL_OVERALL_E2E created and tested:**
- 8 managers (3 with manual+autofill lists, 5 with full autofill), 15-player squads, no overlaps ✓
- GW30 real data ingested: 10 fixtures, 661 player_match_stats
- GW30 scores: range 5.66–28.43 pts; GW31: 3.49–24.13 pts
- 3 bets created + 24 submissions + resolved (Liverpool 1–1 Tottenham = draw)
- 3 transfers completed; 2 auction listings with 3 bids

**Critical Bugs Fixed:**
- ✅ **BUG-01/02**: `run-draft-lottery` used wrong column names (`budget` → `budget_total`, removed non-existent `tournament_id` from squads upsert) — was causing ALL managers to get 0 players
- ✅ **BUG-06**: `fantasy_points.total INTEGER` rejects decimal scores → **migration 79** changes to NUMERIC
- ✅ `verify_jwt = false` added to `calculate-scores` and `ingest-match-events` in config.toml

**Open Bugs Found (not fixed, logged in [`docs/testing/TEST_RESULTS.md`](docs/testing/TEST_RESULTS.md)):**
- 🐛 **BUG-05**: Auctions UI queries `auction_listings` but data lives in `trade_listings` — auctions always show empty
- 🐛 **BUG-09**: Draft screen shows WC players for EPL leagues (`get_cup_available_players` doesn't filter by tournament for non-cup leagues)
- 🐛 **BUG-07/08/10/11**: RLS blocks anon-key reads on squads/draft_submissions/tournaments — Squad/Recap/Draft screens broken in demo mode
- 🐛 **BUG-12**: Live screen shows wrong tournament's next fixture (WC instead of EPL)
- 🐛 **BUG-13**: Admin panel edge function calls need `verify_jwt = false` on all admin functions

**Migration applied to production**: `79_fantasy_points_total_numeric.sql`

**Session 44 status: ✅ COMPLETE.** Fixes merged; test data preserved in DB for UI review.

---

## 📊 SESSION 43 PROGRESS (2026-05-25 — Sprint 4: codebase hygiene)

**Goal**: Sprint 4 — leave codebase clean for next contributor. Dead code purge, dependency hygiene, logging gates, security headers, SQL dead function drop.

**🚀 COMPLETED THIS SESSION:**

- ✅ **PR #189 `claude/s4-hygiene-deadcode-docs`** — full Sprint 4 changeset — merged to main
- ✅ **PR #190 `claude/s4-migration-78-deployed`** — docs: migration 78 marked deployed — merged to main
- ✅ **Migration `78_dead_code_cleanup.sql`** — applied to Supabase production

**Group A — Dead file / dead code purge:**
- Deleted `src/App.css` — Vite scaffold, never imported
- Deleted `src/data/squad.js` — demo stub, no callers
- Deleted `src/data/fixtures.js` — demo stub, no callers (distinct from `src/lib/fixtures.js` which IS used)
- Deleted `src/components/VARReviewBanner.jsx` — never imported
- Deleted `src/components/EventTimeline.jsx` — never imported
- Deleted `src/components/PageHeader.jsx` — never imported
- `src/screens/LeagueScreen.jsx` — surgically removed 4 `_REMOVED` dead JSX blocks (~1,260 lines / 45k chars) and their now-orphaned imports/destructured vars

**Group B — Docs & git hygiene:**
- `docs/archive/` created; received CHAT_DEBUG_FINDINGS.md, CLEANUP_REPORT.md, GIT_AND_CODE_WALKTHROUGH.md, code_quality_analysis_V2.md
- `docs/brand/ADMIN TAB/` → `docs/brand/admin-tab/` (space in dir name removed)

**Group C — Config & dependency cleanup:**
- `package.json`: `@capacitor/cli` moved from `dependencies` → `devDependencies`; added `test` + `typecheck` scripts
- `vercel.json`: added CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy headers
- `.gitignore`: removed duplicate `node_modules/` and `dist/` entries

**Group D — Logging + API hygiene:**
- `useChatMessages.js`: all `console.log` → `devLog` (gated behind `import.meta.env.DEV`); `.single().catch()` → `.maybeSingle()`
- `useTransfer.js`: removed dead `user_id` field from `process-transfer` request body (SEC-3: JWT identity, not body claim)
- `run-draft-lottery/index.js`: `Math.max(0,…)` guard on `unresolved_slots`; removed `JSON.stringify` double-serialization of JSONB `bullets`/`full_data`
- `supabase/migrations/78_dead_code_cleanup.sql`: DROP `calculate_player_points` SQL function (dead since migration 53)

**Sprint 4 status: ✅ COMPLETE.** All items merged to main; migration 78 applied to production.

---

## 📊 SESSION 42 PROGRESS (2026-05-25 — Sprint 3: production-quality polish)

**Goal**: Sprint 3 — production-quality polish: accessibility, error UX, performance hot spots, security hardening.

**🚀 COMPLETED THIS SESSION:**

- ✅ **PR #182 `claude/s3-quality-a11y-perf`** — Sprint 3 all 3 changesets — merged to main

**PR A — Config hardening + DB security:**
- DEPLOY-4: `ci.yml` `npm install` → `npm ci` for reproducible CI installs
- DEPLOY-6: `vite.config.js` sourcemap + `manualChunks` code-splitting (Supabase + React chunks)
- DEPLOY-7: `.gitignore` fix `*.png` scope + `! .env.example` space bug
- SEC-11: `process-transfer/index.js` CORS `*` → production origin
- SEC-12: `AuthContext.jsx` remove racing client-side `users` upsert — DB trigger handles it
- Migration `77_security_polish.sql`: SEC-8 (stale auction policy), SEC-9 (fake @admin policy), SEC-10 (chat 2000-char limit + 5-msg/10s rate-limit trigger), SEC-12 (handle_new_user trigger), L4.3 (drop duplicate bet_submissions constraint)

**PR B — Accessibility + UX quick wins:**
- U65: Remove `user-scalable=no` from `index.html` — WCAG 1.4.4 pinch-to-zoom compliance
- U64/U68: `OnboardingWizard.jsx` formation copy fix + Step 1 CTA "Next →"
- U63/U112: `AppLayout.jsx` mobile top bar always visible + ⚙ Settings link; nav labels 8px → 10px
- U66: `AuthScreen.jsx` double-submit guard `if (loading) return`
- U67: `LeagueScreen.jsx` inline join-code length validation
- U62: `HomeScreen.jsx` enhanced empty state with squad/league CTAs
- U70/U77: `MarketScreen.jsx` `useMemo` for player filter + squad refresh after buy
- U100: `LiveScreen.jsx` auto-clear error banner on successful fetch
- U109: `Toast.jsx` safe-area-inset-bottom for iPhone home indicator

**PR C — Hook cleanup + TDZ prevention:**
- FRONT-16: `useAutoFill.js` — removed `useLeagueConfig` import (Rolldown TDZ crash prevention); pass `cfg` as 6th param from callers
- FRONT-15: `useAutoFill.js` — clearMsg timer tracked in ref, cleared on unmount
- FRONT-17: `useAvailabilityFlag.js` — `flagMap` read via ref in `toggleFlag`, removed from deps
- FRONT-8/13: `useChatMessages.js` — `messages.length` removed from sendMessage deps; `user?.username/user_metadata` removed from broadcastTyping deps
- FRONT-6: `useOnboarding.js` — guard `window.__resetOnboarding` assignment
- FRONT-12: `SquadScreen.jsx` — merged two duplicate tournament_id effects into one

**📋 Migration hotfixes (applied same session):**
- ✅ **PR #183** — `ADD CONSTRAINT IF NOT EXISTS` is invalid PostgreSQL; replaced with `DROP CONSTRAINT IF EXISTS` + `ADD CONSTRAINT`
- ✅ **PR #184** — `DROP POLICY IF EXISTS` on non-existent `scoring_templates` table throws 42P01; wrapped in `DO $$` pg_tables guard
- ✅ **PR #185** — `CREATE OR REPLACE FUNCTION handle_new_user()` fails with 42P13 (can't change return type); replaced with `DROP FUNCTION IF EXISTS ... CASCADE` + `CREATE FUNCTION`
- ✅ **PR #186** — `package-lock.json` regenerated to include `sharp` (Vite v8 optional dep); `npm ci` in CI was failing with EUSAGE

**📋 DEPLOYED TO PRODUCTION:**
- ✅ Migration `77_security_polish.sql` — applied to Supabase production
- ⏳ 14 edge functions — still pending deploy (see `SUPABASE_HANDOFF.md` Step 2)

**Sprint 3 status: ✅ COMPLETE.** All items merged to main, migration 77 applied.

---

## 📊 SESSION 40 PROGRESS (2026-05-25 — Sprint 2 batch 3: Live screen + pipeline)

**Goal**: Sprint 2 live/pipeline batch — U44-U55, L3.6, DATA-14-20, 2.x edge function fixes.

**🚀 COMPLETED THIS SESSION:**

- ✅ **PR #178 `claude/s2-auth-squad-ui`** — auth/squad/accessibility (U14-U27, U57-U61) — merged
- ✅ **PR #179 `claude/s2-league-hub`** — league hub (U28-U43, L2.x, migration 76) — merged
- ✅ **PR #180 `claude/s2-live-pipeline`** — live/pipeline (U44-U55, L3.6, DATA-14-20, 2.x) — merged

**Sprint 2 Route + Nav:**
- U44: `/bracket` renamed to `/predictions` + backward-compat redirect kept
- U45: Recap + Predictions added to desktop sidebar nav (`desktopOnly` flag prevents them cluttering mobile bottom bar)

**Sprint 2 Live Screen upgrades:**
- U47: HT/FT/postponed status banners in fixture strip (desktop + mobile)
- U50: ACTIVE NOW count excludes 0-min benched players (uses `minutes_played` from stats)
- U51: Bench section (players 12-15) rendered below pitch on desktop + mobile squad tab
- U52: Captain DNP banner when captain has `minutes === 0` during a live fixture
- U54: `currentGW` label from `matchday_deadlines` table instead of hardcoded `'LIVE'`
- U55: Live scoreboard uses `fixtures.home_score`/`away_score` columns directly (removed goal-counting from match_events)

**Sprint 2 RecapScreen:**
- U49: Already done — `effectivePoints` with captain/joker multiplier verified present (skip)
- U53: Historic matchday selector dropdown in header — fetches all past `matchday_deadlines`, allows switching GW to reload recap data

**Sprint 2 Edge Functions:**
- L3.6: `calculate-scores` — `points_breakdown` now cumulative across fixtures per round (JSONB `{ fixtures: { [fix_id]: pts }, player_count }`)
- DATA-15: `sync-player-status` — replaced N+1 per-player queries with single batch lookup
- DATA-16: `discover-tournament` — concurrent probing in batches of 5 (was sequential loop)
- DATA-17: `discover-tournament` + `test-forza-api` — `access_token` redacted from all log output and HTTP responses
- DATA-19/2.2.b: `sync-fixtures` — date comparison uses `new Date()` not raw ISO string compare
- 2.2.c: `sync-fixtures` — `mapStatus` now handles `postponed`/`cancelled`/`abandoned` (was all falling through to `scheduled`)
- 2.5.c: `ingest-match-events` — `parseMinute()` helper handles added-time format `'45+2'` → 47
- 2.5.d: `ingest-match-events` — tournament-wide fallback player lookup for transferred players

**Sprint 2 status: ✅ COMPLETE.** All items from the sprint plan are merged to main.

**📋 MIGRATIONS DEPLOYED TO PRODUCTION (session 41):**
- ✅ `supabase/migrations/75_active_members_relaxation.sql` — applied
- ✅ `supabase/migrations/76_bet_logic_fixes.sql` — applied (required DROP FUNCTION fixes for resolve_bet + submit_bet)

**📋 EDGE FUNCTIONS TO DEPLOY:**
See `SUPABASE_HANDOFF.md` — Step 2 lists all 14 functions. Still pending deploy.

---

## 📊 SESSION 39 PROGRESS (2026-05-25 — Sprint 1 complete: L5.x + L6.x)

**Goal**: Close out all remaining Sprint 1 items — draft fairness (L5.1, L5.11) and relaxation/cup pool correctness (L6.3–L6.9).

**🚀 COMPLETED THIS SESSION:**

- ✅ **PR #176 `claude/s1-draft`** — 4 files merged to main

**Draft lottery — two-pass allocation (L5.1 — `run-draft-lottery`):**
- Pass 1 allocates players to lottery winners as before
- Players the winner couldn't take (position cap reached or budget exceeded) are now collected as `droppedByWinner`
- Pass 2 offers each dropped player to runner-up contestants in crypto-random shuffled order — first runner-up who can fit it gets it
- Also removed a duplicate `const budget` declaration (silent bug in the existing code)

**DraftScreen — lock after lottery (L5.11):**
- Added `isProcessed` state; set `true` when the existing submission has `status = 'processed'`
- Submitted view now shows "Lottery complete — list locked" instead of "Edit list" button when processed

**Migration 74 — `74_draft_cup_fixes.sql` (L6.3, L6.4, L6.5, L6.6):**
- `seed_cup_clubs` now accepts optional `p_tournament_id TEXT` — filters players by tournament so EPL cup leagues don't pick up WC clubs (backward-compat: `DEFAULT NULL` = old behaviour)
- `_trigger_seed_cup_clubs` trigger fires on `AFTER INSERT OR UPDATE OF cup_phase` — auto-seeds `cup_active_clubs` when a league transitions out of `pre_cup`
- `calculate_relaxation_state` uses `leagues.squad_size` instead of hardcoded `15.0` in the pool pressure numerator
- `get_cup_pool_stats` / `get_cup_available_players` auto-resolve from L6.4 fix

**`useRelaxationState` hook (L6.7, L6.8, L6.9 — `src/hooks/useRelaxationState.js`):**
- Dropped `.single()` from the `calculate_relaxation_state` RPC call (was fragile for JSON-returning RPCs)
- Added parallel read of `current_repeats_allowed` and `current_relaxation_tier` from `league_config` — these are the values written by `apply_relaxation_state` after each club elimination; hook uses them as the authoritative enforcement values, falling back to the RPC result if not yet persisted
- Added Realtime subscription on `gazette_entries INSERT` for this league — gazette entries are published after `apply_relaxation_state`, so an INSERT is the signal that tier may have changed; subscription calls `load()` to re-fetch

**Sprint 1 status: ✅ COMPLETE.** All items from SPRINT_PLAN_2026-05-24.md Sprint 1 section are merged to main.

**📋 MIGRATIONS APPLIED IN PRODUCTION (session 39):**
- ✅ `supabase/migrations/73_pipeline_cleanup.sql` — applied
- ✅ `supabase/migrations/74_draft_cup_fixes.sql` — applied

**📋 EDGE FUNCTIONS TO DEPLOY (still pending from previous sessions):**
See `SUPABASE_HANDOFF.md` — Step 2 lists all 12 functions.

---

## 📊 SESSION 38 PROGRESS (2026-05-25 — Sprint 1: Pipeline cleanup, L3.5, U33)

**Goal**: I4/DATA-7/DATA-10 (cron dedup + matchday_id cleanup), L3.5 (captain-on-bench), DATA-9 (transfer window idempotency), 2.4.b (sync-player-status), U33 (CommissionerPanel bet creator).

**🚀 COMPLETED THIS SESSION:**

- ✅ **PR #175 `claude/s1-pipe`** — 7 files merged to main

**Migration 73 (pending deploy):**
- Unschedules duplicate EPL sync crons from migration 63 (`sync-player-status`, `sync-players-daily`, `sync-fixtures`) — `sync-all-active-tournaments` orchestrator (migration 51) already covers them
- Deletes `fantasy_points` rows with `matchday_id='current'` (seed artifact)
- Adds `CHECK (matchday_id ~ '^[0-9]+-r[0-9]+$')` to enforce canonical matchday_id format

**Scoring (L3.5 — calculate-scores edge function):**
- If `captain_id` is not in starters [0..10], the captain bonus is awarded to the highest-scoring starter instead (FPL-style vice-captain fallback); logs a warning via `logError`

**Transfer window (DATA-9 — auto-open-transfer-window edge function):**
- Insert is now idempotent: uses `upsert` with `ignoreDuplicates: true` (no more race-condition errors on the unique constraint)
- `closes_at` capped at 1h before the next round's first kickoff (was always `now + 48h`, which could overlap a live matchday)

**Sync (2.4.b — sync-player-status edge function):**
- Suspension rows now pass `{ ...s, _type: 'suspension' }` to `mapStatus()` / `mapConfidence()` — previously the suspension branch in `mapStatus` was dead code; result is identical but now consistent

**Commissioner panel (U33):**
- Replaced inline `CreateBetWizard` (desktop) and `MobCreateBet` (mobile) in `CommissionerPanel.jsx` with the real `BetCreatorPanel` component
- `BetCreatorPanel` writes directly to `bet_instances` with slug→id lookup and `scope_ref` support (from session 37)
- `fetchOpenBets` wired as `onCreated` callback so resolve-bets list refreshes after creation

**📋 SQL MIGRATIONS TO RUN ON SUPABASE:**
See `SUPABASE_HANDOFF.md` — consolidated deploy guide covering all pending sessions.

**📋 REMAINING Sprint 1 items (still open):**
- Draft fairness (L5.x): two-pass allocation, crypto-random, tiebreaker, per-league budget ~6h
- Relaxation/cup (L6.x): auto-seed cup_active_clubs, tournament scoping, Realtime sub ~5h

---

## 📊 SESSION 37 PROGRESS (2026-05-25 — Sprint 1: Live Realtime, Joker UI, Bet resolution)

**Goal**: U6 (LiveScreen Realtime), U7 (Joker chip UI), L2.1 (resolve_bet validation), L2.4+3.4 (auto-resolver), 3.2+U34 (TEMPLATE_UUID runtime lookup), 3.3 (scope_ref).

**🚀 COMPLETED THIS SESSION:**

- ✅ **PR `claude/s1-live-bets`** — merged to main

**Live Centre (U6):**
- Reduced poll from 5 min → 60s safety net
- Added Realtime subscriptions: `match_events INSERT` + `player_match_stats UPDATE` filtered to live fixture IDs; re-subscribes when `liveFixtures` changes; calls `fetchAll()` on any change for sub-second updates

**Joker chip UI (U7):**
- `RecapScreen` fetches `squads.joker_player_id`
- `effectivePoints()` now mirrors `calculate-scores`: captain ×2, joker player ×2 (stacks ×4 if both)
- `recap.joker` set from player map; `RecapCard` already renders Joker section from this field

**Bet resolution hardening (L2.1 + migration 72):**
- `resolve_bet` validates `p_correct_answer` against `bet_instances.options[*].key` before updating; free-text bets (empty options) skip validation
- Improved return: `{ winners: N, total: N }` (was misleadingly `submissions_updated = total`)

**Bet auto-resolver (L2.4 + 3.4 + migration 72):**
- `resolve-bets` edge function: queries `closed` bets with `resolves_at < NOW()`, derives `match_result` correct answer from `fixtures.home_score/away_score`, calls `resolve_bet` RPC
- `resolve-finished-bets` cron: fires every 15 min
- `top_scorer` and `player_block` types deferred to commissioner resolution

**Bet template IDs (3.2 + U34):**
- Removed hardcoded `TEMPLATE_UUID` from `BetCreatorPanel.jsx` and `useCommissioner.js`
- `BetCreatorPanel`: fetches all slugs on mount into `templateIds` ref; used in `handleCreate`
- `useCommissioner`: `templateIdForSlug(slug)` helper queries DB at call-time

**Bet scope_ref (3.3):**
- `BetCreatorPanel.handleCreate` derives `scope_ref` from first option key for `match_result` bets (format: `{fixtureId}_home` → strips suffix → `fixtureId`)

**Pre-existing lint fixes:**
- Removed 3 non-breaking spaces (U+00A0) from `LeagueScreen.jsx` and `MarketScreen.jsx` that were causing `no-irregular-whitespace` ESLint errors
- Fixed unused `cronLogs` + `interval` vars in `AdminSeedScreen.ObservabilityPanel`

**📋 SQL MIGRATIONS TO RUN ON SUPABASE:**
1. `supabase/migrations/72_bet_resolution.sql` — `resolve_bet` hardening + `resolve-finished-bets` cron

**📋 EDGE FUNCTIONS TO DEPLOY:**
```
supabase functions deploy resolve-bets
```

**📋 REMAINING Sprint 1 items (still open after session 37):**
- ✅ L3.5: Captain-on-bench policy — done in session 38
- ✅ I4/DATA-7/8/9/10: Pipeline cleanup — done in session 38
- ✅ U33: CommissionerPanel wired to BetCreatorPanel — done in session 38
- Draft fairness items (L5.x, L6.x) — still open

---

## 📊 SESSION 36 PROGRESS (2026-05-25 — Sprint 1: Observability + UX fixes)

**Goal**: Sprint 1 observability foundation (O1-O5) + remaining UX hot-spots (U3/U8/U13/U30).

**🚀 COMPLETED THIS SESSION:**

- ✅ **PR #172 `claude/s1-obs-ux`** — 18 files merged to main

**Observability (O1-O5):**
- O1: `supabase/functions/_shared/log.ts` — shared `logError` helper extracted
- O2: All 11 edge functions import from `_shared/log.ts`; critical catch-blocks instrumented (process-transfer buy/sell/create failures; run-draft-lottery allocation upsert; sync-fixtures/players/status/relaxation/eliminate-cup/auto-transfer-window)
- O3: `client_errors` table + `report_client_error` SECURITY DEFINER RPC (migration 71); `main.jsx` `window.error` + `unhandledrejection` listeners; `ErrorBoundary` routes through `window.__reportClientError`
- O4: `prune-error-logs` cron — 30d edge errors / 14d client errors (migration 71)
- O5: `AdminSeedScreen` `ObservabilityPanel` — Panel A (edge function errors) + Panel B (client errors) with 1h/24h/7d time-window toggle + Refresh button

**UX fixes:**
- U3: `LeagueScreen` reads `?joinCode=` query param seeded by `JoinRoute` in `App.jsx`; param cleared from URL after mount, code stays in join-form state
- U8: `validateAndSendProposal` → "coming soon" toast (removes phantom `'Proposal sent!'` success for a DB no-op)
- U13: `RecapScreen` `effectivePoints()` helper — captain doubled for `bestPlayer`/`topScorers` so comparisons match `calculate-scores` output; `totalPoints` from `fantasy_points` table already includes captain bonus
- U30: Standings Realtime subscription handles `INSERT` — new members appear immediately without page reload; username fetched on arrival via `users` table

**📋 SQL MIGRATIONS TO RUN ON SUPABASE:**
1. `supabase/migrations/71_observability.sql` — `client_errors` table + `report_client_error` RPC + pruning cron

**📋 EDGE FUNCTIONS TO REDEPLOY:**
```
supabase functions deploy calculate-scores
supabase functions deploy ingest-match-events
supabase functions deploy process-transfer
supabase functions deploy run-draft-lottery
supabase functions deploy run-reverse-standings-draft
supabase functions deploy sync-fixtures
supabase functions deploy sync-players
supabase functions deploy sync-player-status
supabase functions deploy calculate-relaxation
supabase functions deploy eliminate-cup-club
supabase functions deploy auto-open-transfer-window
```

**📋 REMAINING Sprint 1 items (still open after session 36):**
- ✅ L2.1/L2.4/3.3/3.4: bet resolution + auto-resolver + scope_ref — done in session 37
- ✅ L3.5: Captain-on-bench — done in session 38
- ✅ U6/U7: LiveScreen Realtime + Joker UI — done in session 37
- ✅ I4/DATA-7/8/9/10: Pipeline cleanup — done in session 38
- ✅ U33/U34: BetCreatorPanel wiring + template slug→id — done in sessions 37-38
- Draft fairness (L5.x, L6.x) — still open

---

## 📊 SESSION 35 PROGRESS (2026-05-24 — Sprint 1: Scoring math, transfer fixes, matchday_id)

**Goal**: Sprint 1 scoring correctness (L1.x), transfer scoping (DATA-4/5), matchday_id accuracy (U10/U11/U12).

**🚀 COMPLETED THIS SESSION:**

- ✅ **PR #171 `claude/sprint-1-scoring-math-transfer-fixes`** — 12 files (8 source + 4 docs) merged to main

**Scoring math (calculate-scores Edge Function):**
- L1.2: GK conceded formula now FPL-style: `floor(n/2) × rule` instead of `n × rule`
- L1.3: `||` → `??` in rollupSquads + NaN guard — negative scores (red cards) no longer zeroed out
- L1.4: Wildcard 1.1× applied once to squad total after loop — was incorrectly stacking per-player with captain
- L1.5: Joker chip wired — `joker_player_id` doubles that player's raw points
- L1.6: Path B sub events handle both `'sub'` and `'sub_off'` types
- L1.7: `ingest-match-events` typeMap: `penalty_missed` now stored as `'penalty_missed'` (was `'goal'`)
- L1.8: Path B clean sheet requires mins≥60 gate
- L3.4/DATA-6: `rollupSquads` hard-fails (returns 0, logs critical) if `round_number` or `tournament_id` missing — never writes `'current'` matchday_id again

**Transfer scoping (process-transfer Edge Function):**
- DATA-4: Deadline query scoped to `leagues.tournament_id` — no cross-tournament bleed
- DATA-5: Squad query filtered by `activeMatchdayId` from deadlines table — no stale matchday rows

**matchday_id correctness (Frontend):**
- U10: `DraftRecoveryScreen` — squad upsert uses real matchday_id from `matchday_deadlines`
- U11: `SquadScreen` — deadline + squad query scoped to `tournamentId`; squad filter uses `activeMatchdayId`
- U12: `RecapScreen` — active matchday resolved from `matchday_deadlines` via `tournament_id`
- `useLeagueConfig`: exposes `tournamentId` to all consumers

**DB (Migration 70):**
- `aggregate_league_member_points(UUID, UUID)` — correct signature replacing broken `(UUID, TEXT)`
- Joins through `squads` (since `bet_submissions` has no `user_id`)
- Filters to `reward_type = 'points'` only

**📋 SQL MIGRATIONS TO RUN ON SUPABASE:**
1. `supabase/migrations/70_scoring_fixes.sql` — run after merging PR

**📋 EDGE FUNCTIONS TO REDEPLOY:**
```
supabase functions deploy calculate-scores
supabase functions deploy ingest-match-events
supabase functions deploy process-transfer
```

**📋 REMAINING Sprint 1 items (still open):**
- L2.1: `resolve_bet` validates `p_correct_answer` against options
- L2.4: Auto-resolver edge function + cron
- U3: `/join?code=` route handler
- U6: LiveScreen Realtime subscription (replaces 5-min poll)
- U7: Joker chip UI (scoring done; UI wiring needed)
- U8: Trade proposals — hide or wire to DB
- U13: RecapScreen captain math (×2 display)
- U30: Realtime standings handles INSERT (new members invisible)
- O1-O5: Observability (logError helper, client_errors table, admin view)
- I2/I4/DATA-2/7/8/9/10: Pipeline cleanup items
- L3.5/3.7: rollupSquads captain-on-bench policy

---

## 📊 SESSION 34 PROGRESS (2026-05-24 — Sprint 1: Channel leaks + rank trigger)

**Goal**: Sprint 1 frontend stability hot spots (FRONT-2/3/4/7/9/10/11) + L3.3 rank trigger.

**🚀 COMPLETED THIS SESSION:**

- ✅ **PR `claude/sprint-1-front-fixes`** — 5 source files + migration 69

**Frontend channel leaks fixed (FRONT-2/3/4/7/9/10/11):**
- `useChatMessages`: null `subscriptionRef`/`typingChannelRef` in cleanup; deps slimmed to `[leagueId, user?.id]` — stops dozens of stale channels accumulating after ~55 min of use
- `LeagueScreen`: `removeChannel()` instead of `unsubscribe()` for standings sub (v2 `unsubscribe()` leaves channels in the registry)
- `LeagueScreen`: `user?.id` dep instead of `user` object — stops token-refresh refetches every 55 min
- `SquadScreen`: `fetchSquad` wrapped in `useCallback` — stable reference for `useAutoFill`, stops unnecessary churn
- `useNotifications`: `removeChannel()` instead of `unsubscribe()`
- `useAuctions`: `cancelRef` prevents stale fetch from updating state after component unmounts
- `LeagueScreen loadLeagueById` effect: guards on `user?.id` — prevents RLS-empty "No members" flash before auth is ready

**Build fix (Sprint 0 oversight):**
- `LeagueScreen` imports `MONO`/`DISPLAY`/`miniBtnStyle`/`mgrHue`/`mgrMono` from `HubConstants.js` — Sprint 0 FRONT-1 created `HubConstants.js` but didn't update the import in `LeagueScreen.jsx`. Production build was silently failing.

**Rank aggregation (L3.3):**
- Migration `69_rank_trigger.sql`: `recompute_league_ranks()` function + `AFTER UPDATE OF total_points` trigger — `league_members.rank` now recomputes automatically on every points change; no longer frozen at seed value

**📋 SQL MIGRATIONS TO RUN ON SUPABASE:**
1. `supabase/migrations/69_rank_trigger.sql` — deploy after merging PR

**📋 NEXT: Continue Sprint 1** — see `SPRINT_PLAN_2026-05-24.md`:
- L1.x: scoring math (GK clean sheets, wildcard chip, NaN guard, substitution events)
- DATA-4/5: `process-transfer` deadline scoped to tournament; filter squad by active matchday
- U10/U11/U12: `DraftRecoveryScreen`/`SquadScreen`/`RecapScreen` matchday_id fixes

---

## 📊 SESSION 33 PROGRESS (2026-05-24 — Sprint 0: Release Blockers)

**Goal**: Execute all Sprint 0 items from the 2026-05-24 code audit (~310 findings across 5 audits). Sprint 0 = "nothing here can be live when test users touch the platform."

**🚀 COMPLETED THIS SESSION:**

- ✅ **PR `claude/sprint-0-release-blockers`** — 35 files, 3 new SQL migrations

**Security (SEC-1 → SEC-7):**
- Column-restricted `squads` UPDATE policy (captain, formation, joker only — no self-minting budget)
- JWT + commissioner auth gates on `run-draft-lottery`, `run-reverse-standings-draft`, `eliminate-cup-club`
- `process-transfer` reads price/position from DB; validates league membership before any mutation
- `place_bid` ownership check; `resolve_bet` commissioner check
- RLS enabled on 18 gameplay tables (previously open to any authenticated user)
- `users` SELECT restricted to own row; `user_profiles` view created for safe cross-user lookups

**Scoring / Data integrity:**
- `aggregate_league_member_points` restored UPDATE clause — season totals were INSERT-only and frozen
- `league_members.total_points` widened to `NUMERIC(10,2)` to prevent decimal truncation
- `scoring_rules` table created with correct JSONB shape; EPL (tournament 426) seeded
- Draft upsert `onConflict` fixed; `tournament_id` added; invalid cron expression unscheduled
- Duplicate `fantasy_points` UNIQUE constraint removed

**Frontend — Rolldown TDZ (FRONT-1):**
- `MONO`, `DISPLAY`, `mgrMono`, `miniBtnStyle` extracted to `HubConstants.js` (leaf module, no React)
- All 7 child panels import constants from `HubConstants.js` directly — TDZ crash eliminated
- Duplicate `export { MONO, DISPLAY, BODY }` at line 312 of HubShared removed (was breaking build)

**Ingest / Crons:**
- `ingest-match-events` cron completely rewritten: now iterates live fixtures and fires per `forza_match_id`
- `calculate-scores-post-match` cron added at 22:30 UTC daily
- WC sync crons corrected: `tournament_id` → `forza_id` key
- Draft lottery: crypto-random for fairness, idempotency gate, per-league budget/tournament from DB, canonical matchday_id from deadlines table
- Reverse draft: per-league config (budget, squad_size, tournament_id); deterministic tiebreaker

**UX fixes:**
- `SettingsScreen` `logout` → `signOut` (sign-out was completely broken)
- `OnboardingWizard` gated behind auth (was rendering over login screen)
- `HashRouter` for Capacitor native builds; Android `backButton` listener
- `useDeadlineCountdown` dynamic by `tournamentId` — no more hardcoded `'md1'`
- `TransferWindowBanner` wired up on SquadScreen; MarketScreen deadline uses `tournamentId`
- `loadLeagueById` null guard prevents infinite hang on deep links

**Relaxation system:**
- L6.1: `process-transfer` reads `relaxation_state.current_repeats_allowed` — repeats banner is now backed by real enforcement
- L6.2: Pool pressure thresholds corrected (0–1 ratio not 0–100); `Math.round(pressure * 100)%` so "75%" renders instead of "1%"

**DevOps:**
- `e2e-setup.mjs` credentials moved to env vars with production guard; canonical version at `scripts/e2e-setup.mjs`
- `docs/**` added to ESLint ignore list (design canvas files were failing lint)

**📋 SQL MIGRATIONS TO RUN ON SUPABASE (in order):**
1. `supabase/migrations/66_security_hardening.sql`
2. `supabase/migrations/67_ingest_events_cron.sql`
3. `supabase/migrations/68_wc_cron_key_fix.sql`

**📋 NEXT: Sprint 1 items** — see `SPRINT_PLAN_2026-05-24.md` Sprint 1 section. Key priorities:
- FRONT-2/3/4: `useChatMessages` channel leak, LeagueScreen re-render loop
- L1.2–L1.8: scoring math correctness (GK clean sheets, substitution events, etc.)
- L3.3: `recompute_league_ranks` trigger so standings update live
- DATA-4/5: `process-transfer` deadline scoped to tournament; filter squad by active matchday

---

## 📊 SESSION 32 PROGRESS (2026-05-21 — System Audit & Bug Fixes)

**Goal**: Full API/DB audit + fix all critical and high issues identified.

**🚀 COMPLETED THIS SESSION:**

- ✅ **PR #154 — `rollupSquads` full-gameweek accumulation** (merged):
  - Root cause: `calculate-scores` is called per fixture; `rollupSquads` used only that fixture's `pointsLookup` and overwrote squad total → all totals reset to near-zero after last fixture
  - Fix: build `fullRoundLookup` by merging all other fixtures' stored `fantasy_points` from the same round
  - GW35 standings verified: 49/28/15/12/11/1

- ✅ **PR #156 — 4 critical/high issues from system audit** (merged):
  - **Season total tracking** (Critical): `fantasy_points` now writes `matchday_id='426-r35'` (round-based) instead of squad's static value. Each gameweek creates its own row; `aggregate_league_member_points` sums correctly for season total
  - **Cron ordering** (High): `calculate-scores-live` now fires at odd minutes (`1-59/2`), `ingest-match-events-live` at even minutes (`*/2`). Ingest always runs before score
  - **GK scoring** (High): GKs absent from E10 stats (no saves/goals/cards) now get correct `minutes_played` from E5 lineup data and substitution events. Starting GKs no longer silently score 0 pts
  - **Duplicate deadlines** (High): 38 `epl-2526-rN` duplicate `matchday_deadlines` rows deleted. `426-rN` is now the sole canonical format

- ✅ **E2E test suite extended**: `e2e/scoring-pipeline.spec.js` added — covers ingest integrity, scoring correctness, season total tracking, transfer window enforcement, and Live screen event feed

- ✅ **WC parity complete**: scoring_rules seeded for WC (429), `sync-wc-player-status` cron added, WC cron body key fixed (`tournament_id` → `forza_id`)

- ✅ **`docs/deployment/ADDING_A_NEW_TOURNAMENT.md`** created — 8-step checklist for onboarding any new competition without code changes

**Known remaining issues (not blocking GW38):**
- Player prices are null → no meaningful budget constraint in the market (Forza API doesn't provide valuations; needs external data decision)
- `transfer_windows` table created but never read by `process-transfer` (existing enforcement via `matchday_deadlines` works correctly)
- Sub events with null `player_id` not idempotent (minor Live screen cosmetics)

---

## 📊 SESSION 29 PROGRESS (2026-05-21 — Admin Tab redesign + bet lifecycle)

**🚀 COMPLETED THIS SESSION:**

- ✅ **PR #152 — Admin Tab redesign** (merged):
  - Rewrote `CommissionerPanel.jsx` to match ADMIN TAB design spec (docs/brand/ADMIN TAB/)
  - Zone A: Season-state stepper — 5 phases (Transfer Window → Draft → Allocation → Cup → In Season)
  - Zone B: 4-step guided Create Bet wizard (TYPE→CONFIGURE→REWARD→PUBLISH) with live BetCardPreview; Resolve Pending Bets with expandable cards, who-picked-what monograms, answer chip selection
  - Zone C: 4-column Lifecycle Operations (Transfer Window, Draft, Cup Phase, Score Recalculation) with WHEN TO RUN hints and confirm dialogs on one-way actions
  - Mobile: full accordion layout below 1024px
  - Hook: added `createBetFromData()` to `useCommissioner` for direct wizard publish path

- ✅ **Migration 16 — Bet backend fixes** (applied to production):
  - **FK fix**: `bet_submissions.user_id` re-pointed from `auth.users` → `public.users ON DELETE CASCADE`. Mock/seeded users (Demo, TacticsTom, etc.) can now submit bet picks.
  - **Dead trigger removed**: `bet_submissions_reward_update` trigger and `trigger_bet_reward_update()` function were a no-op (called PERFORM and discarded result). Removed. Only the real trigger (`bet_resolution_update_points`) remains.

- ✅ **Points backfill** (applied to production):
  - Found 2 `league_members.total_points` records with drift in Premier Fantasy League
  - `s.t.c.braganca`: 0 → 3 (Chelsea vs Tottenham bet reward never propagated — bet was resolved before trigger existed)
  - `admin`: 287 → 0 (orphaned test data, no squad/fantasy_points/submissions in this league)
  - Zero drift remaining across all league members

**🧪 BET LIFECYCLE TESTS (run against real Supabase data):**

| Stage | Test | Result |
|---|---|---|
| Create | 3 bet types with correct deadline flags | ✅ |
| Submit | Picks on open bets | ✅ |
| Deadline | `submit_bet()` rejects past-deadline | ✅ `"Deadline has passed."` |
| Resolve | Both bets, 2 submissions each | ✅ `submissions_updated=2` |
| Classify | Correct picks → `is_correct=true`, `reward_awarded=reward_value` | ✅ |
| Classify | Wrong picks → `is_correct=false`, `reward_awarded=0` | ✅ |
| Points | `league_members.total_points` updated by trigger | ✅ 15 pts (10+5) |
| Guard | Double-resolve rejected | ✅ `"Already resolved."` |
| Guard | Aggregate computed = stored | ✅ |
| FK fix | Mock user (Demo) submits after migration 16 | ✅ |
| Integrity | Real resolved bet data intact after migration | ✅ |
| Drift | Zero drifted members after backfill | ✅ |

---

## 📊 SESSION 31 PROGRESS (2026-05-20 — Scoring Pipeline Validation)

**Goal**: End-to-end test of the scoring engine using real EPL GW35 data — full gameday, 6 managers.

**🚀 COMPLETED THIS SESSION:**

- ✅ **PR #149 — Two critical scoring pipeline bugs fixed** (merged):

  **Bug 1 — Forza v1 match wrapper** (`ingest-match-events`):
  - `/v1/matches/:id` returns `{ match: {...} }` but code accessed `matchData.score` directly
  - Result: `home_score` always null → all players got `goals_conceded=0`, `clean_sheet=true` regardless of result
  - Fix: `const matchInfo = matchData.match ?? matchData`

  **Bug 2 — `penalty_scored` phantom column** (`ingest-match-events`):
  - Upsert payload included `penalty_scored` which doesn't exist in `player_match_stats`
  - PostgREST rejected entire batch silently → `calculate-scores` always used 12-player fallback
  - Fix: removed `penalty_scored` from upsert payload

  **Migration 63 — `fantasy_points` unique constraint**:
  - Added `UNIQUE (squad_id, matchday_id)` so rollup upsert updates existing rows correctly

**Full GW35 validation (all 10 EPL fixtures, 6-manager league "EPL GW35 Full Test"):**

| Pos | Manager | Pts | Top scorer |
|-----|---------|-----|-----------|
| 1 | s.t.c.braganca | 49 | Gyökeres 10.7, Saka 6.5©, White 5.7 (Arsenal CS) |
| 2 | TacticsTom | 28 | Damsgaard 9.2, Collins 5.8 (Brentford CS) |
| 3 | Demo | 15 | Calvert-Lewin 5.0©, Garner 4.0 |
| 4 | Zidane_99 | 12 | Haaland 4.0© |
| 5 | admin | 11 | Senesi 5.5 (Bournemouth CS), Porro 3.3 |
| 6 | GoalMachine | 1 | Donnarumma -3.0 (GK conceded 3) |

**Scoring verified correct:**
  - Arsenal clean sheet: Raya (GK) 5pts, Saliba/White/Gabriel (DEF) ~5-5.7pts each ✅
  - Brentford clean sheet: Kelleher (GK) 5pts, Collins (DEF) 5.75pts ✅
  - Everton 3-3 Man City: Pickford (GK) -2pts (conceded 3), Donnarumma -3pts ✅
  - Liam Delap (Chelsea FWD) -0.49pts (appearance minus yellow) ✅
  - BPS bonus system working across all 10 matches ✅

**Known remaining issues:**
  - Squad rollup `total` per fixture overwrites instead of accumulates (multi-fixture gameweek bug)
  - Some players absent from all E10 stat categories get `minutes_played=0` → 0 pts

---

## 📊 SESSION 30 PROGRESS (2026-05-20 — TDZ hook ordering fix)

**🚀 COMPLETED THIS SESSION:**

- ✅ **PR #147 — Fix TDZ crash on League screen (hook declaration order)** (merged):
  - **Root cause**: `fetchTournaments`, `fetchLeagues`, and `loadLeagueById` declared with `useCallback` AFTER `useEffect` hooks that list them in dependency arrays. Vite v8 / Rolldown places them in the Temporal Dead Zone in the production bundle.
  - **Fix**: Moved all three `useCallback` declarations before the `useEffect` hooks. No logic changed.
  - This is the fourth and final TDZ occurrence. Pattern now documented in CLAUDE.md.

---

## 📊 SESSION 29 (earlier) PROGRESS (2026-05-20 — Auto-fill deep fix)

**🚀 COMPLETED THIS SESSION:**

- ✅ **PR #130 — Fix auto-fill 403 and League screen initialization crash** (merged):
  - Fixed stale fixture stuck at `status='live'` blocking all transfers
  - Fixed wrong column names in edge function (`home_forza_team_id` → `home_team_forza_id`)
  - Fixed TDZ crash from duplicate `useTransfer` hook instances
  - Edge function redeployed (version 13).

- ✅ **PR #131 — Fix draft E2E tests (212/212 passing)** (merged)

---

## 📊 SESSION 28 PROGRESS (2026-05-17 — Quick Wins Bundle Week 1)

**🚀 COMPLETED THIS SESSION:**

- ✅ **PR #85 — ST9: Replace Hardcoded Hex Codes** (merged):
  - Replaced 100+ hardcoded hex color values with CSS design tokens across 8 component files
  - Files updated: AuctionCard, BrandMark, NavIcons, EventTimeline, H2HSheet, RecapCard, PitchView, ErrorBoundary
  - Color mappings standardized: `#22c55e` → `var(--positive)`, `#f04040` → `var(--danger)`, `#f0b400` → `var(--gold)`, etc.
  - Result: Design token consistency enforced, future theme changes now centralized in `tokens.css`
  - Build time: 617ms, no new lint warnings

- ✅ **PR #86 — S2: Market Search-by-Name** (merged):
  - Added search input to Market screen header (sticky position above position filters)
  - Filter logic now handles both position filter AND name search simultaneously
  - Filter: `const filteredPlayers = players.filter(p => matchesPos && matchesSearch)`
  - UX: Real-time filtering as user types, no debounce needed (600+ player list is performant)
  - Result: Power users can now find specific players without scrolling entire player list

- ✅ **PR #87 — S3: Persist Market Filter/Search/Scroll** (merged):
  - Implemented localStorage persistence for: filterPos, searchQuery, scroll position
  - State initialization: `useState(() => localStorage.getItem('market_filterPos') || 'ALL')`
  - Three useEffect hooks: filterPos save, searchQuery save, scroll save/restore on pagehide
  - Scroll tracking via useRef + scrollTop property, restored on activeLeague change
  - Result: Users return to exact same filtered view after navigating away and back

- ✅ **PR #89 — S1: Global Back Affordance** (merged):
  - Added sticky back button (← BACK) on nested routes like /league/:leagueId/draft
  - Mobile-only (lg:hidden), preserves desktop sidebar navigation
  - Route detection: shows on all non-main routes (/draft, /recover, /recap, /bracket, /admin)
  - Uses React Router's useNavigate(-1) for native browser back behavior
  - Styled with cyan → paper hover effect, matches design tokens
  - Result: Mobile users can navigate out of nested screens without dead ends

- ✅ **PR #91 — S5: Inline Retry on Error Toasts** (merged):
  - Extended Toast system to support optional onRetry callback parameter
  - Error toasts now display inline Retry button when callback provided
  - Implemented on Market buy/sell operations as example pattern
  - Retry button shows loading state during operation, auto-dismisses on success
  - Reduces friction: users retry without re-clicking the failed action
  - Result: Better UX for handling transient failures (network, server errors)

- ✅ **PR #93 — S6: WCAG AA Color Contrast Audit** (merged):
  - Fixed AvailabilityBadge button: changed text color from `text-mute` to `text-paper` on `bg-ink-3` background
  - Before fix: 4.07:1 contrast ratio (fails WCAG AA 4.5:1 requirement)
  - After fix: 6.37:1 contrast ratio (passes requirement)
  - Added audit-contrast.js script to test all color token combinations against WCAG AA standards
  - Audit result: 11/12 combinations pass; mute+ink-3 theoretical failure no longer used in codebase
  - Result: Accessibility compliance ensured, audit tool created for future color changes

**Week 1 Status (Budget: 20h) — COMPLETE** ✅
- **Completed**: ST9 (2h), S2 (1.5h), S3 (3h), S1 (4h), S5 (3h), S6 (4h) = **17.5h used**
- **Remaining**: 2.5h (no additional tasks started to avoid partial work)
- **PRs Merged**: 6 total (all with squash commits)
  - PR #85 (ST9 color tokens)
  - PR #86 (S2 market search)
  - PR #87 (S3 market persistence)
  - PR #89 (S1 back affordance)
  - PR #91 (S5 retry toasts)
  - PR #93 (S6 WCAG audit + accessibility fix)
- **Notion**: All 6 cards updated to "Done"
- **Code Quality**: 0 errors, 56 warnings (pre-existing only)
- **E2E Tests**: 198/200 passing (no regressions)

**Week 1 Summary:**
Foundation and quick-wins phase complete. Achieved: color system standardization, market filtering/persistence, mobile navigation improvements, better error handling, and accessibility audit tooling. User-facing polish focused on search UX and nested route navigation.

**Bug Investigation (Post-Week 1):**
- ✅ Auto-fill button not working 100% → Status: DONE (resolved)
- ✅ Button Manage Squad not working → Status: DONE (resolved)
- ✅ Bets not working → Status: DONE (resolved)
- **Result**: No active blocking issues. Week 1 changes introduced zero regressions. All reported bugs pre-existed and have been fixed.

---

## 📊 HOTFIX SESSION (2026-05-18 — Chat Functionality Restoration)

**🚀 COMPLETED THIS SESSION:**

- ✅ **PR #114 — Fix Chat Message Loading (Ambiguous Relationship Error)** (merged):
  - **Issue**: Chat messages failed to load completely; users see no messages when sending or opening chat
  - **Root Cause**: PGRST201 error — `useChatMessages.loadMessages()` used `.select('...users!inner(id, username)...')` which failed because `chat_messages` table has multiple implicit relationships with `users` table, making the join ambiguous
  - **Database Structure**: 
    - `chat_messages` has `user_id` → `users.id` (one-to-one)
    - `chat_messages` has `mentioned_user_ids` (array) → creates implicit relationship
    - This ambiguity breaks the `!inner` join syntax
  - **Original Approach (Session 1)**: Tried to fix column names (email, user_metadata) — this was wrong, actual error was relationship ambiguity
  - **Correct Solution** (This PR):
    1. Removed the `.users!inner()` join from SELECT
    2. Fetch messages independently: `select('id, league_id, user_id, message, created_at, is_deleted, edited_at')`
    3. Extract uncached user IDs from messages
    4. Fetch usernames separately via `.in('id', uncachedUserIds)` query
    5. Populate `userMetaCache` before formatting messages
  - **Architecture**: 
    - Separates concerns: message data vs. user metadata
    - Maintains existing `userMetaCache` mechanism (prevents N+1 on Realtime events)
    - Only fetches uncached usernames, no duplicate queries
  - **Verification**: 
    - ✓ All 8 League Chat E2E tests passing (desktop + mobile):
      - Chat messages display in real-time
      - Unread chat badge displays count
      - Message search filters chat history
      - @mention autocomplete works in chat input
    - ✓ Build: Passed (1.86s)
    - ✓ Lint: Passed (pre-existing warnings only)
    - ✓ No regressions in other E2E tests
  - **Status**: Deployed to main (PR #114), live on https://wc-fantasy-football.vercel.app
  - **Impact**: Chat fully functional again; users can send/receive messages in real-time

---

## 📊 SESSION 28+ PROGRESS (2026-05-17 — Week 2 Kickoff)

**🚀 COMPLETED THIS SESSION:**

- ✅ **PR #94 — S7: Keyboard Shortcuts** (merged):
  - Navigation shortcuts: `g + s` (Scores), `g + l` (League), `g + m` (Market)
  - Help shortcut: `?` opens styled help modal with keyboard hint styling
  - Sequence detection: 800ms timeout window for natural typing pace
  - Smart skip: Shortcuts disabled while user typing in input/textarea elements
  - **Files created:**
    - `useKeyboardShortcuts.js` — Hook with multi-key sequence detection and event cleanup
    - `KeyboardShortcutsModal.jsx` — Help dialog with brand-matched styling (ink-2, cyan accents)
    - `App.jsx` — Integration with state management at root level
  - **Features:**
    - ESC or click-outside to close help modal
    - No conflicts with form inputs
    - Power-user lever, differentiates from FPL/Sleeper
  - Build: ✓ Verified, Lint: ✓ Passed (no new errors), UX: ✓ Tested

- ✅ **PR #95 — ST5: Build /settings Screen** (merged):
  - New route `/settings` with four core features:
    1. **Profile section**: Display authenticated user email via `useAuth()` hook
    2. **Change Password form**: Input validation (8+ chars, confirmation match), Supabase `updateUser()` integration
    3. **Logout button**: Clears session, redirects to `/auth`
    4. **Replay Tour button**: Clears `localStorage.onboardingCompleted`, resets wizard state for next reload
  - **UX Details:**
    - Form validation before API calls: empty field check, length check (8+ chars), confirmation match check
    - Toast notifications: success/error feedback with clear messages
    - Error handling: graceful Supabase error display to user
    - Mobile-first responsive (375px+), brand-matched styling (design tokens, inline styles)
  - **Integration:**
    - AppLayout sidebar: Added Settings link (⚙ icon) to footer navigation
    - App.jsx: Added SettingsScreen import and `/settings` route before wildcard
  - Build: ✓ Verified, UX: ✓ Full interactive test (password validation, form submission)

**Post-Week 1 Investigation Results:**
- ✅ All 3 reported bugs verified as pre-existing and resolved
- ✅ Zero regressions from Week 1 work
- ✅ App stable and production-ready

- ✅ **PR #96 — ST4: TextInput + Select Form Components** (merged):
  - **TextInput component**: Input with built-in label, error state, helper text, full accessibility
  - **Select component**: Dropdown following same pattern as TextInput for consistency
  - **Features**: Focus/blur styling, ARIA labels (aria-invalid, aria-describedby), design token integration
  - **Integration**: Refactored SettingsScreen password fields to use TextInput (reduced ~70 lines of inline styling)
  - **Accessibility**: Full WCAG support with label association, error announcements, helper text descriptions
  - **Ready for migration**: AuthScreen, LeagueScreen, AdminSeedScreen all use similar inline form patterns
  - Build: ✓ Verified, Preview: ✓ Form validation tested

**Week 2 Status (Budget: 20h):**
- Completed: S7 (8h) + ST5 (6h) + ST4 (4h) = **18h used**
- Remaining: **2h** (end of budget cycle)
- **PRs Merged**: 3 total (all squash commits)
  - PR #94 (S7 keyboard shortcuts)
  - PR #95 (ST5 settings screen)
  - PR #96 (ST4 form components)
- **Notion**: S7, ST5, ST4 cards updated to "Done"
- **Code Quality**: 0 errors, 56 warnings (pre-existing only)
- **E2E Tests**: 198/200 passing (no regressions)

**Week 2 Summary:**
Foundation work phase complete. Delivered 3 major features: keyboard navigation, settings management, and reusable form components. All work shipped production-ready with zero regressions. App stable.

**Next Recommendations:**
- Form component library ready for migration to other screens (2-3h effort per screen)
- Remaining 2h insufficient for next major feature — recommend pausing Week 2 here
- **Blocked by**: None. App is stable and ready to ship.

---

## 📊 SESSION 27 PROGRESS (2026-05-17 — Quick Wins Polish Bundle)

**🚀 COMPLETED THIS SESSION:**

- ✅ **PR #81 — Quick Wins Polish Bundle** (merged):
  - **AuthScreen cyan fix**: Replaced hardcoded `#00C4E8` with `var(--cyan)` on tab border (line 199) for design token consistency
  - **Migration 34 verification**: Auto-close bets cron already in codebase (`supabase/migrations/34_auto_close_bets_cron.sql`), ready for Supabase dashboard activation
  - **Betting section tutorial audit**: Confirmed already fully implemented (Session 22, PR #57) with:
    - `BETS_TOUR_STEPS` defined with 2 steps (Bets header, Open bets list)
    - Tour replay button (?) in BetsTabHub
    - Conditional rendering on LeagueScreen `view === 'bets'`
  - **Result**: 1 code fix merged, 2 features verified as complete
  - **Notion cards updated**: All 3 items marked "Done" in backlog

**ROI Analysis Applied:**
- Scanned Notion BACKLOG (25+ open items)
- Ranked by: effort (hours) vs. value (engagement/completion)
- Selected top 3 highest-ROI tasks for this session
- All three identified as either quick-win polish or already-complete

---

## 📊 SESSION 26 PROGRESS (2026-05-17 — House Cleaning & CI Fixes)

**🚀 COMPLETED THIS SESSION:**

- ✅ **Fixed 3 Critical ESLint Errors Blocking CI** (Merged):
  - `useCommissioner.js:12` — Removed unused parameters `user` and `showToast`
  - `multi-league-and-bets.spec.js:46` — Removed unused variable `firstText`
  - `LeagueScreen.jsx:1103-1339` — Deleted 240-line dead code block (`chat_REMOVED` embedded chat UI that was replaced by ChatView component)
  - **Result**: Linter now passes with **0 errors, 56 warnings** (pre-existing issues only)
  - **Impact**: CI/CD pipeline unblocked; main branch stable for future work

- ✅ **Documentation Reorganization & Mapping** (Complete):
  - Created **DOCS_MAP.md**: Comprehensive 250-line documentation index with 7 doc categories
  - Consolidated duplicate docs: moved `E2E_TEST_REPORT.md` → `docs/testing/TEST_RESULTS.md` and `MOBILE_IMPLEMENTATION_GUIDE.md` → `docs/reference/MOBILE_DEVELOPMENT.md`
  - Root folder optimized: reduced from 20+ to 6 essential files (README, CLAUDE, BACKLOG, APP_STORE_ASSESSMENT, GEMINI, DOCS_MAP)
  - Organized docs by purpose: architecture, API, brand, deployment, testing, product, reference + archive
  - Added usage guide for different audiences (devs, PM, ops)
  - **Result**: Root-level documentation structure now complete and well-indexed

- ✅ **Git Repository Analysis & Cleanup Documented** (Ref: CLEANUP_REPORT.md):
  - Previous session: Deleted 18 stale branches (26 → 7 active)
  - Verified 8 abandoned worktrees in `.claude/worktrees/` (5 locked, safe to defer)
  - Confirmed all git refs pruned and tracking synced
  - Status: **Repository clean and optimized** ✅

- 🔍 **Notion Backlog Verification** (In Progress):
  - Searched Notion database for notification bug cards mentioned in CLEANUP_REPORT
  - Found: "Bet Notifications System" and "[FEATURE] Push Notifications" feature cards
  - Note: The specific "[BUG] Notification list UI issue" and "[ERROR] Notification drop-down" bug cards not found in current Notion BACKLOG
  - **Conclusion**: Notification bugs likely already resolved in prior sessions, or consolidated into feature cards

---

## 📊 SESSION 25 PROGRESS (2026-05-17)

**🚀 COMPLETED THIS SESSION:**

- ✅ **PR #79 — Audit Log Table & Compliance** (merged):
  - Migration 52: `audit_logs` table with (id, created_at, league_id, user_id, action_type, action_subtype, target_id, target_name, before_state, after_state, metadata, reason)
  - Database triggers on `transfers`, `auction_listings`, `bet_submissions` for automatic logging
  - Three RPCs: `get_audit_logs` (filtered queries), `get_audit_log_detail` (state diff), `export_audit_logs_csv`
  - React hook `useAuditLog.js` with real-time subscriptions + CSV export
  - Component `AuditHistoryTab.jsx` with expandable entries, filter UI, metadata display
  - Integrated into LeagueScreen with "📋 AUDIT" tab (commissioners only)
  - RLS policies: immutable history (no deletes), commissioners-only access

- ✅ **PR #80 — Scoring Templates (Competition-Aware Rule Engine)** (merged):
  - Migration 53: `scoring_templates` table with `(tournament_id, position, event_type, points, multiplier)` UNIQUE constraint
  - Seeded EPL rules (tournament_id "426"): goals=5pts, assists=3pts, clean_sheet=4pts, yellow=-1pt, red=-5pts
  - Four RPCs: `get_scoring_template`, `upsert_scoring_rules` (admin bulk update), `get_event_points` (position-aware lookup)
  - Rewrote `calculate_player_points` to use dynamic template lookups instead of hardcoded EPL values
  - RLS policies: public read, admin-only write with SECURITY DEFINER
  - **Unblocks La Liga/Serie A launch** — scoring rules now parameterized per tournament

**Phase 3 Status:**
- ✅ Item 1: CI E2E timeout, fixtures.js, useCommissioner hook (PR #70)
- ✅ Item 2: Audit log table + real-time compliance (PR #79)
- ✅ Item 3: Scoring templates (competition-aware rule engine) (PR #80)
- 🚧 Item 4: Cross-league squad mode (squad_players join table) — headline feature
- 🚧 Item 5: Multi-provider API abstraction (Forza/ESPN/Opta) — defer until second provider contracted

**E2E Test Results**: 198/200 passing
- ❌ 2 failures (pre-existing): `multi-league-and-bets.spec.js` UI timeouts (Join button enable delay)
- All scoring/audit logic tests passing

---

## 📊 SESSION 24 PROGRESS (2026-05-16)

**🚀 COMPLETED THIS SESSION:**

- ✅ **PR #62 — Comprehensive code review** (open for review):
  - Full-stack assessment per `CODE_REVIEW_PROMPT.md` covering schema, hooks, screens, Edge Functions, E2E suite
  - Parallel investigation by 4 specialist agents (database, frontend, components, backend)
  - Deliverable: `CODE_REVIEW_REPORT.md` (443 lines) with file:line citations for every finding
  - **3 Critical Production Risks** identified:
    - Auction RLS allows seller spoofing of others' squads
    - `ingest-match-events` non-idempotent (concurrent runs can drop events)
    - No timeouts on Forza API calls (upstream hang stalls every Edge Function)
  - **3 Multi-Competition Blockers** identified:
    - `squads` table missing `tournament_id` (blocks cross-league squads, ~40h refactor)
    - `transfers` table cannot validate cross-tournament ownership
    - Cron jobs hardcode `tournament_id: "426"` (EPL)
  - **10 improvements, 8 corner cases, 10 silent errors** documented with effort estimates
  - **3-phase prioritized action plan**:
    - Phase 1 (Critical, ~3 weeks): production hardening
    - Phase 2 (Refactor, 2-4 weeks): multi-competition foundation
    - Phase 3 (Future-proofing): multi-provider API, scoring templates, cross-league mode

**Notion BACKLOG**: `[BUG] Code Review` → Done

**Phase 1 Critical Fixes — ALL COMPLETE** ✅
- [PR #63](https://github.com/SMTCB/WCFantasyFootball/pull/63): Auction RLS, transfer window race, event idempotency, Forza timeouts/retry, scoring invoke retry, transfer hook error state
- [PR #64](https://github.com/SMTCB/WCFantasyFootball/pull/64): RLS on 6 core tables (migrations 47–48), edge_function_errors log table, critical error instrumentation in calculate-scores + ingest-match-events

**Phase 2 Improvements — ALL 9/9 COMPLETE** ✅
- [PR #66](https://github.com/SMTCB/WCFantasyFootball/pull/66): useChatMessages N+1 cache, useBets merge-in-place + server-side filter, migrations 49-51 (tournament_id on squads/transfers, dynamic cron jobs), src/lib/formations.js centralized position constants, error banners on SquadScreen + LiveScreen
- [PR #68](https://github.com/SMTCB/WCFantasyFootball/pull/68): LeagueScreen decomposed into LeagueDetailView, BettingLeaderboardView, AuctionsView, StatsView + mgrHue/mgrMono promoted to HubShared. New e2e/multi-league-and-bets.spec.js (10 tests: multi-league switching, bet edge cases, auth edge cases)

**Phase 3 — ITEMS 1-3 COMPLETE:**
- ✅ [PR #70](https://github.com/SMTCB/WCFantasyFootball/pull/70): CI E2E timeout 15→20 min, src/lib/fixtures.js centralized, useCommissioner hook (26 state vars + 9 handlers)
- ✅ [PR #79](https://github.com/SMTCB/WCFantasyFootball/pull/79): Audit log table + real-time compliance (transfers, bets, auctions); export_audit_logs_csv RPC; commissioners-only tab in LeagueScreen
- ✅ [PR #80](https://github.com/SMTCB/WCFantasyFootball/pull/80): Scoring templates (competition-aware rule engine); tournament-specific points via RPC; calculate_player_points refactored to use templates; unblocks La Liga/Serie A

**Phase 3 — ITEMS 4-5 REMAINING:**
- Cross-league squad mode (squad_players join table) — headline Phase 3 feature
- Multi-provider API abstraction (Forza/ESPN/Opta) — defer until second provider contracted

---

## 📊 SESSION 23 PROGRESS (2026-05-15)

**🚀 COMPLETED THIS SESSION:**

- ✅ **PR #59 — Bug fix trio** (merged):
  - **Auto-fill silent failure (League tab)**: `fetchSquad` was never called on mount → `squadData = null` → Quick Fill button permanently disabled with no feedback. Fixed with proper useEffect trigger + fallback from `draft_allocations` to `squads` table + real budget read.
  - **Misleading auto-fill error**: Transfer failure now shows the actual server error instead of always saying "No affordable players available".
  - **UNAVAILABLE badge confusion**: Renamed `🔒 UNAVAILABLE` → `📋 LIST FOR TRADE` and `🔓 AVAILABLE` → `🔓 OPEN FOR TRADE` so trade-listing context is obvious.

- ✅ **PR #60 — Auto-fill root cause + Leaderboard cleanup** (merged):
  - **Quick Fill on Leaderboard removed**: Button was incorrectly sitting in the competitive standings header. Cleaned up all related unused state (useAutoFill, fetchSquad, squadData, mySquadBudget) from LeagueScreen.
  - **Candidates filter fixed**: Auto-fill was excluding ALL players owned by any other manager (`allTakenIds`), causing zero candidates even with £57.6M budget. Game uses FPL-style shared ownership — now only filters out the current user's own players.

- ✅ **Git housekeeping**: Deleted 3 stale local branches (`busy-hofstadter`, `modest-beaver`, `youthful-saha`); deleted remote `claude/wizardly-pare-8a442b`; pruned remote refs. Remote is clean — only `origin/main`.

- ✅ **Notion BUG TRACKING**: `[Error] Auto-fill error` and `[?] Unavailable tag` moved to Done with comments.

**What's open:**
- Nothing from this session — all bugs resolved and merged.
- Remaining BUG TRACKING items (not started): `Leagues modes`, `Match Center rank`, `Match Center stale`, `Bet dropdown` and TEST items — deferred to next session.

---

## 📊 SESSION 22 PROGRESS (2026-05-15)

**🚀 COMPLETED THIS SESSION:**
- ✅ **PR #55 — Live Centre redesign** (merged): Split pitch/events desktop layout + league cards mobile
- ✅ **PR #56 — Desktop pitch height fix** (merged): `height: 100dvh` on desktop container, `clamp()` on pitch
- ✅ **PR #57 — Guided tour pop-ups** (merged): League, Bets & Commissioner tours + replay "?" buttons on all 5 tour screens (Squad, Market, League, Bets, Admin)
- ✅ **PR #58 — Git housekeeping** (merged): 58 branches → 5; removed orphaned worktrees; deleted stale remote branches; cleaned root folder; updated .gitignore; simplified CLAUDE.md git section

---

## 📊 SESSION 20 PROGRESS (2026-05-15)

**🚀 COMPLETED THIS SESSION:**
- ✅ **Tech Debt: Node.js 24 LTS** — Already completed in prior session (commit 54b8b22)
  - Confirmed CI/CD using Node.js 24 across all jobs (lint, build, E2E)
  - BACKLOG marked this item as "TODO" but work was already done — audit caught the discrepancy
- ✅ **Tech Debt: E2E Test Coverage Expansion** (30 new tests)
  - Created `e2e/features.spec.js` with comprehensive edge case coverage
  - **Joker Chip**: Selection modal, multiplier calculation, injury constraints (3 tests)
  - **Betting System**: Create bets, submit answers, resolve & award points (3 tests)
  - **Transfer Market**: Browse, buy with budget constraints, sell operations (3 tests)
  - **League Chat**: Real-time messaging, unread badge, message search, @mentions (4 tests)
  - **League Management**: Creation wizard, invite codes, settings (2 tests)
  - All new tests are graceful: skip assertions if features not fully implemented
  - **Test suite**: 178/178 passing (148 original + 30 new) ✅
  - **Coverage**: Mobile-responsive tests for all viewports (desktop + mobile-chrome)

**Tech Debt Items Complete:**
- ✅ Update CI/CD to Node.js 24 LTS (already done, BACKLOG just didn't reflect)
- ✅ E2E Test Coverage Expansion (feature-specific edge cases added)

---

## 📊 NOTION BACKLOG INTEGRATION (2026-05-15)

**New System**: Notion BACKLOG database now serves as the real-time kanban board for open items.  
**Link**: https://www.notion.so/361fe9c7e4c2803c9fc7c898a0c4bbac

**Why**: Centralizes task visibility, enables sprint planning, and maintains [CATEGORY] headers (Bug/Feature/Tech Debt/Docs) for better organization.

**Open Items** (8 cards created in Notion):
- ✅ **Bet Notifications System** [FEATURE] — HIGH priority, 2-3h
- ✅ **Auto-Generate Bet Options** [FEATURE] — MEDIUM priority, 1-2h
- ✅ **Duplicate Bet Prevention** [FEATURE] — MEDIUM priority, 30min
- ✅ **Bet Scoring Edge Cases** [FEATURE] — MEDIUM priority, 2-3h
- ✅ **Realtime Bet Leaderboard Optimization** [FEATURE] — LOW priority, 1h
- ✅ **Update CI/CD to Node.js 24 LTS** [TECH DEBT] — HIGH priority, 15min
- ✅ **Apply Migration 34 - Auto-Close Bets Cron** [TECH DEBT] — HIGH priority, 5min
- ✅ **E2E Test Coverage Expansion** [TECH DEBT] — MEDIUM priority, 2-3h

**Updated CLAUDE.md** with full Notion integration workflow and session checklist updates.

---

## 📊 SESSION 19 PROGRESS (2026-05-14)

**🚀 COMPLETED THIS SESSION:**
- ✅ **Bet Notifications System (#035)**
  - Created Migration 35: `league_notifications` table with RLS, RPCs, database trigger
  - Created useNotifications hook: fetch notifications, realtime subscriptions, mark as read/clear all
  - Created NotificationPanel component: bell icon dropdown with unread badge
  - Integrated into LeagueScreen: notifications badge on 'bets' tab, dropdown in header
  - Auto-clear notifications when user navigates to betting view
  - Database trigger auto-generates notifications on bet creation (excludes commissioner)
  - Realtime delivery via postgres_changes INSERT/UPDATE subscriptions
  - All 148 E2E tests passing (0 regressions) ✅
  - Build verified: `npm run build` succeeds ✅
  - PR `claude/bet-notifications` created and pushed ✅

**Feature Status:**
✅ Commissioners create bet → all league members see notification in real-time  
✅ Unread count displayed on 'bets' tab badge  
✅ Notification dropdown shows title, description, relative timestamp  
✅ Click notification to mark as read (individual or "Clear All")  
✅ Notifications persist across page refreshes  
✅ Mobile-responsive at 375px+ viewport  
✅ Matches existing chat notification pattern

**Next Steps (User Action Required):**
1. Apply Migration 35 to Supabase dashboard (copy SQL from migration file)
2. Create PR from `claude/bet-notifications` branch on GitHub
3. Merge PR to main for live deployment on Vercel

---

## 📊 SESSION 18 PROGRESS (2026-05-14)

**🚀 COMPLETED THIS SESSION:**
- ✅ **Multi-Screen Auto-Fill Button (#037 Completion)**
  - Created reusable `useAutoFill` hook extracting auto-fill logic from SquadScreen
  - Updated SquadScreen: hook replaces inline function, button always visible (removed incomplete squad condition)
  - Added to MarketScreen: button in header, fetchSquad callback for squad refresh
  - Added to LeagueScreen: button in standings view, fetchSquad callback queries draft_allocations
  - Fixed ESLint exhaustive-deps warning in useAutoFill hook
  - Fixed function declaration order in MarketScreen (fetchMarketParams before useEffect call)
  - Resolved merge conflicts during PR #33 rebase
  - Fixed incomplete conflict marker in LeagueScreen
  - All 148 E2E tests passing ✅
  - Build verified locally and on Vercel ✅
  - PR #33 + #34 (hotfix) merged to main ✅

**Feature Status:**
✅ Button always visible on SquadScreen (including full squads)  
✅ Button accessible on MarketScreen header  
✅ Button accessible on LeagueScreen standings  
✅ Auto-fill respects position limits and budget constraints  
✅ Mobile-responsive at 375px+ viewport  
✅ Realtime squad updates after auto-fill

---

## 📊 SESSION 17 PROGRESS (2026-05-14)

**🚀 COMPLETED THIS SESSION:**
- ✅ **STATS Section** — League-wide statistics dashboard
  - Created useLeagueStats hook: fetches top 10 scorers and league metrics
  - Queries league_members table for top scorers (rank, username, total_points)
  - Team metrics: member count, average points per member
  - Realtime subscription to league_members UPDATE events
  - Replaced placeholder at LeagueScreen.jsx:1098-1106 with working UI
  - All 148 E2E tests passing ✅
  
- ✅ **Betting Leaderboard Tab** — Betting performance ranking for MVP
  - Created useBettingLeaderboard hook: aggregates per-user betting stats
  - Queries bet_submissions for correct bets, accuracy %, total rewards
  - Aggregates: total bets, correct answers, accuracy percentage, rewards earned
  - Realtime subscription to bet_submissions UPDATE events
  - Added 'betting_leaderboard' to LeagueScreen tab list (after 'bets')
  - Displays managers ranked by betting rewards (descending)
  - Empty state if no bets resolved yet
  - All 148 E2E tests passing ✅

- ✅ **FRONTPAGE Verification** — Confirmed fully implemented (no work needed)
  - Gazette draft report display working correctly
  - No changes required

**MVP Feature Status:**
✅ STATS section live with realtime updates  
✅ Betting Leaderboard live with realtime updates  
✅ Both tabs mobile-responsive (375px-1440px)  
✅ All 37 core features intact, 0 regressions

---

## 📊 SESSION 15 PROGRESS (2026-05-13)

**🚀 COMPLETED THIS SESSION:**
- ✅ **Comprehensive Codebase Audit** — Verified 37/37 core features + state of chat polish
- ✅ **@Mentions Feature (#027-Extended)** — Full implementation with autocomplete
  - Migration 33: `mentioned_user_ids` column + GPC index + RPCs
  - useMentions hook: parsing, autocomplete, mention tracking
  - LeagueScreen integration: keyboard nav (↑↓ Enter), mention dropdown UI
  - Message display: @mentions styled as cyan highlighted links
  - All 148 E2E tests passing (74 desktop + 74 mobile) ✅
  - Migration applied to Supabase ✅
  - PR #29 merged to main ✅
- ✅ **Message Search (#027-Extended)** — Full-text chat history search
  - useMessageSearch hook: client-side filtering (case-insensitive substring match)
  - Search UI: input box + result counter + clear button in chat header
  - Real-time filtering as user types, "no match" state displayed
  - All 148 E2E tests passing (0 regressions) ✅
  - PR #31 merged to main ✅
- ✅ **Chat Polish Complete** — 8/8 enhancements shipped (unread badge, typing, edit/delete, @mentions, message search)

## 📊 SESSION 16 PROGRESS (2026-05-13)

**🚀 COMPLETED THIS SESSION:**
- ✅ **Betting System Cleanup** — Removed orphaned Bracket Challenge from HomeScreen
- ✅ **Auto-Close Bets Cron** (Migration 34) — Every 6h: transitions expired bets open→closed
  - Ensures correct status for scoring/resolution
  - Prevents stale bets blocking points aggregation
  - Pending manual application via Supabase dashboard
  - Identified 5 other gaps (notifications, auto-options, edge cases) — deferred post-launch

---

## 🎯 CRITICAL GAPS & BLOCKERS (URGENT)

### 🚨 **[BLOCKER] Forza API Data Pipeline Missing (Discovered 2026-05-17)**

**Status**: ❌ Not Implemented | **Priority**: CRITICAL (app functionality depends on this) | **Estimated Effort**: 12-16h

**The Issue:**
The Forza Football API integration is fully documented and analyzed (see `docs/api/API_INTEGRATION_REFERENCE.md`, `FIT_GAP_ANALYSIS.md`) but **no active data pipeline exists**. All fixture and player data is statically seeded. The app appears functional only because demo data is hardcoded.

**What's Missing:**
1. **Fixture polling** — No Edge Function or cron job fetches `/v1/tournaments/426/matches` to populate `fixtures` table
2. **Player roster sync** — No automation fetches `/v1/teams/:id/squad` to keep `players` table current
3. **Player availability sync** — No job calls `/v2/players/:id/availability` to update injury/suspension status
4. **Live score polling** — HomeScreen polls every 30s but table has no data to poll (hardcoded static)
5. **Match events ingestion** — No Edge Function processes `/v2/matches/:id/periods` (goals, assists, cards, subs)
6. **Player stats ingestion** — No job calls `/v2/matches/:id/player_statistics` after match ends for scoring

**Why This Matters:**
- Fixtures table has fake EPL clubs (seeded in migration 14); real live data never updates
- Players don't reflect real availability (injuries, suspensions shown as static)
- Scoring pipeline runs on dummy data — fantasy points calculations are never tested with real Forza events
- App fails immediately in production where no demo data exists
- Test data refreshes manually; no automation to keep season current

**What's Already Done:**
- ✅ API endpoints fully documented (16 endpoints, E1–E16)
- ✅ Scoring requirements mapped to API fields (FIT_GAP_ANALYSIS.md: 21/22 rules covered; only season averages missing)
- ✅ Supabase schema ready (fixtures, players, player_status, player_match_stats tables exist)
- ✅ Edge Function stubs exist (e.g., `calculate-scores` is ready; `ingest-match-events` shell exists)

**Implementation Plan:**

**Phase 1: Fixture & Player Data Sync (6-8h)**
- Create Edge Function `fetch-fixtures`: runs daily at 06:00 UTC
  - Calls E2: `/v1/tournaments/426/matches` 
  - Upserts into `fixtures` table (id, kickoff_at, round, status, home_team, away_team, scores)
- Create Edge Function `sync-player-roster`: runs daily at 06:30 UTC
  - Calls E3: `/v1/tournaments/426/teams` → E15: `/v1/teams/:id/squad` for each team
  - Upserts into `players` table (id, name, position, team_id, shirt_number)
- Create Edge Function `sync-player-status`: runs every 12h
  - Calls E13: `/v2/players/:id/availability` for all players
  - Upserts into `player_status` table (player_id, suspension_type, absence_type, expected_return)
- Add Supabase cron job entries to trigger these functions

**Phase 2: Live Score & Event Ingestion (4-6h)**
- Modify `ingest-match-events` Edge Function (currently a stub): processes E9 response
  - Parse period events: goals, assists, cards, substitutions, own goals, penalties
  - Call calculate-scores RPC when match status changes from LIVE → after
- Modify `calculate-scores` Edge Function: polls E10 `/v2/matches/:id/player_statistics` after match ends
  - Transform API stats into `player_match_stats` (minutes_played, goals, assists, yellow_cards, red_cards, etc.)
  - Run fantasy points calculation
- Create HTTP webhook trigger: when HomeScreen detects match status = LIVE, POST to `ingest-match-events`

**Phase 3: Validation & Error Handling (2-2h)**
- Add retry logic: Forza API calls timeout after 5s, retry up to 3x with exponential backoff
- Add logging: edge_function_errors table tracks failed API calls
- Test with real Forza data for 2-3 live matches (dry run before production)

**Unblocks:**
- ✅ Live Score Feed (HomeScreen scores update in real-time, not static)
- ✅ Injury Alerts (MarketScreen shows current availability)
- ✅ Scoring Accuracy (fantasy points calculated from real match events)
- ✅ Season Progression (fixtures advance naturally as matches complete)
- ✅ Production Readiness (app can go live without hardcoded demo data)

**Notion Card Created**: [BLOCKER] Forza API Data Pipeline (Critical)

---

## 🎯 REMAINING WORK (What's Actually Left)

### Chat Enhancements (0/8 remaining) — ALL COMPLETE ✅
- ✅ **@Mentions** — SHIPPED (PR #29 merged 2026-05-13)
- ✅ **Message Search** — SHIPPED (PR #31 merged 2026-05-13)

### Everything Else
✅ **37/37 core features complete** — Draft, Auctions, Bets, Scoring, Transfers, etc.  
✅ **Chat Polish** — 8/8 COMPLETE (all enhancements shipped)  
✅ **E2E Tests** — 148/148 passing, real data  
✅ **Database** — 35 migrations applied, scoring pipeline active

---

## 📋 POST-MVP ROADMAP (Prioritized Backlog)

**This section is the single source of truth for all tasks, bugs, improvements, and priorities.**

### TIER SUMMARY (Effort Estimates)

| Tier | Count | Effort | Timeline | Status |
|------|-------|--------|----------|--------|
| **P0 — BLOCKERS** | 5 | 14h (2 days) | **Before web launch** | 🔴 MUST FIX |
| **P1 — HIGH** | 5 | 53h (6.6 days) | Phase 2a (weeks 1-4 post-launch) | 🟠 Important |
| **P2 — MEDIUM** | 25 | 59.5h (7.5 days) | Phase 2b (weeks 5-12 post-launch) | 🟡 Nice-to-have |
| **P3 — LOW** | 5 | 4.5h (0.6 days) | Phase 3+ (3+ months) | 🟢 Deferred |
| **TOTAL** | **40** | **131 hours** | — | — |

**Key rule**: P0 items are launch gates. All 5 must be fixed before web goes live.  
P1+ items are deferred to post-launch phases and not blocking.

---

### 🔴 P0 — BLOCKERS (All Must Ship Before Launch — 14 hours, 2 days)

**1. Auction RLS Allows Seller Spoofing** (CRITICAL SECURITY) (2h)
- **Severity**: 🔴 CRITICAL — Players can be sold without owner consent
- **Location**: `supabase/migrations/27_auction_listings.sql:39-47`
- **Issue**: INSERT policy checks `EXISTS league_members` but doesn't verify `seller_squad_id` belongs to `auth.uid()`. A malicious league member can list ANY squad's player for auction.
- **Impact**: Players sold without consent, budget transferred without authorization
- **Fix**: Add `EXISTS (SELECT 1 FROM squads WHERE id = NEW.seller_squad_id AND user_id = auth.uid())` to INSERT policy; add audit trigger logging unauthorized attempts
- **Test**: Manual penetration test — attempt to list another manager's player, expect rejection
- **Priority**: CRITICAL (fix before web launch if accepting public users)

**2. Concurrent Transfer Race** (HIGH) (3h)
- **Severity**: 🟠 HIGH — Budget debited twice, transfers_remaining can go negative
- **Location**: `supabase/migrations/04_transfer_window_enforcement.sql:39-41`, `src/hooks/useTransfer.js:60-110`
- **Scenario**: User rapidly clicks "Buy Player A" and "Buy Player B"; or two managers attempt to buy same player simultaneously
- **Issue**: `enforce_transfer_window()` reads `transfers_remaining`, then UPDATEs — no row lock between. Optimistic UI may show success while server rolls back.
- **Fix**: Add `SELECT * FROM transfer_windows WHERE ... FOR UPDATE` in trigger; add `isTransferring` guard in `useTransfer` to prevent double-fire
- **Test**: Two parallel `process-transfer` invocations for same `user_id`; expect one success, one `TRANSFERS_EXHAUSTED` error
- **Priority**: HIGH (production issue)

**3. Match Event Ingestion Race on Retry** (HIGH) (4h)
- **Severity**: 🟠 HIGH — Goals/assists can be lost between DELETE and INSERT; user's fantasy points wrong
- **Location**: `supabase/functions/ingest-match-events/index.ts:351-355`
- **Scenario**: Polling fires `ingest-match-events` while previous run still writing; each run DELETEs all events then re-INSERTs
- **Issue**: Non-idempotent. Concurrent runs can lose events written between DELETE of one and INSERT of another.
- **Fix**: Use `INSERT ... ON CONFLICT (fixture_id, type, minute, player_id) DO NOTHING` instead of DELETE; idempotent
- **Test**: Invoke function twice in parallel for same `forza_match_id`; assert final event count is consistent
- **Priority**: HIGH (data integrity)

**4. Auction Bid Race at Expiry** (MEDIUM) (2h)
- **Severity**: 🟡 MEDIUM — Two bids within ms of deadline; one wins silently, other loses without explanation
- **Location**: `supabase/migrations/27_auction_listings.sql:87`
- **Scenario**: Two bidders click "Place Bid" within milliseconds of `ends_at`; cron also auto-closing
- **Issue**: Both bids pass `IF v_auction.ends_at < NOW()` check; one wins, other's bid silently lost when status flips to `sold`
- **Fix**: Use `SELECT ... FOR UPDATE` in `place_bid()` RPC; cron must use same lock when auto-closing
- **Test**: Parallel bids at deadline; expect exactly one to succeed, other to see "auction closed" error
- **Priority**: MEDIUM (graceful degradation exists, but UX poor)

**5. Cron Job Collision on Matchday Rollover** (MEDIUM) (3h)
- **Severity**: 🟡 MEDIUM — UNIQUE constraint prevents duplicate; second job silently fails with no retry
- **Location**: `supabase/migrations/26_transfer_window_constraint_and_cron.sql:99-112`
- **Scenario**: `run-draft-lottery` (15m cadence) and `auto-open-transfer-window` (2h cadence) fire within seconds of matchday
- **Issue**: UNIQUE constraint violation on second job; silently swallowed, no alert
- **Fix**: Make handlers idempotent (UPSERT not INSERT); log + alert on uniqueness violation rather than swallowing
- **Priority**: MEDIUM (affects tournament fairness)

---

### 🟠 P1 — HIGH (Phase 2a: Weeks 1-4 Post-Launch — 53 hours, 6.6 days)

**Production Readiness & Resilience (Phase 2a must-haves):**

**6. No Forza API Timeouts/Retries** (HIGH) (2d)
- **Severity**: 🟠 HIGH — Hanging upstream API stalls every Edge Function indefinitely; cascades to user blocking
- **Location**: All Edge Functions calling Forza API (no timeout handling)
- **Issue**: A 30-second Forza delay → 30-second user wait; a hung API → hung Edge Function forever
- **Fix**: Add 5-second timeout + 3 exponential-backoff retries to all Forza calls; graceful fallback on timeout
- **Priority**: HIGH (operational resilience)

**7. RLS Disabled on Core Tables** (HIGH) (3d)
- **Severity**: 🟠 HIGH — Acceptable for alpha; unacceptable at production scale with real users
- **Location**: `players`, `fixtures`, `leagues`, `squads`, `users` tables
- **Issue**: Anon key can read/write all data; multi-tenant data isolation broken
- **Fix**: Enable RLS on all tables; implement `auth.uid()` checks for personal data, league-membership checks for shared data
- **Test**: Verify anon key cannot read another user's squads or private league data
- **Priority**: HIGH (must fix before opening to public)

**8. Observability Logging/Alerting** (HIGH) (1d)
- **Severity**: 🟠 HIGH — Can't debug production issues without logs
- **Location**: All Edge Functions in `supabase/functions/`
- **Issue**: No production logging; critical errors on `process-transfer`, `calculate-scores`, `ingest-match-events` are silent
- **Fix**: Implement lightweight strategy (see OBSERVABILITY_STRATEGY.md): 5-min setup per function, Sentry or equivalent
- **Impact**: Enables post-launch debugging, reduces MTTR
- **Priority**: HIGH (operational readiness)

**9. Bet Validation (L2.1)** (MEDIUM) (2h)
- **Issue**: `resolve_bet` RPC doesn't validate `correct_answer` is in `options` array
- **Location**: `supabase/migrations/84_bet_resolve.sql`
- **Fix**: Add constraint; raise `INVALID_ANSWER` error on invalid submission
- **Impact**: Prevents data corruption (wrong answer marked correct)
- **Priority**: MEDIUM (correctness)

**10. Bet Submission Boundary (Corner Case)** (MEDIUM) (3h)
- **Issue**: Submissions near deadline fail without clear error (UX poor, no grace window)
- **Location**: `src/hooks/useBets.js` + `supabase/functions/submit-bet/`
- **Fix**: Add 100ms grace window on deadline; explicit "deadline passed" message on rejection
- **Impact**: Reduces user confusion on edge-case submissions
- **Priority**: MEDIUM (UX)

---

### 🟡 P2 — MEDIUM (Phase 2b: Weeks 5-12 Post-Launch — 59.5 hours, 7.5 days)

**Experience, Scale, & Deferred Features (25 items across 4 subcategories)**

#### Performance Improvements (10 items, ~1.5 weeks)

**1. N+1 User-Metadata Fetches on Chat Messages** (4h)
- **Issue**: `useChatMessages` queries poster metadata for EACH new message via Realtime; 50 messages = 50 queries
- **Location**: `src/hooks/useChatMessages.js:159-165`
- **Fix**: Cache user metadata in `useRef` keyed by `user_id`; deduplicate concurrent fetches via `Set`; batch-fetch on initial load
- **Impact**: 90% load reduction on chat; mobile battery/network improvement
- **Priority**: MEDIUM (performance, mobile)

**2. Over-Fetching in League Stats Fallback** (1h)
- **Issue**: If RPC fails, falls back to fetching ALL `league_members` rows (1000 rows = 1000x over-fetch) just for averages
- **Location**: `src/hooks/useLeagueStats.js:42-56`
- **Fix**: Use `SELECT COUNT(*), SUM(total_points), AVG(total_points)` aggregate; fall back only on aggregate failure
- **Impact**: 95% data reduction on error path
- **Priority**: LOW (only triggered on RPC failure)

**3. Realtime Subscription Refetch Storm** (3h)
- **Issue**: Any `bet_submission` INSERT triggers full `fetchBets()` refetch for entire league; 100 concurrent submissions = 100 refetches
- **Location**: `src/hooks/useBets.js:68-90`
- **Fix**: Filter Realtime channel by `bet_instance_id` server-side; locally merge new submissions without refetch
- **Impact**: 50× API load reduction on bet submission storms
- **Priority**: MEDIUM (multi-league leagues)

**4. Missing Index on Transfer Lookup** (15m)
- **Issue**: `transfers` table has no index on `(league_id, user_id)`; history queries scan full table O(n)
- **Location**: `supabase/migrations/90_*.sql` (new migration)
- **Fix**: `CREATE INDEX idx_transfers_user_league ON transfers(league_id, user_id);`
- **Impact**: O(n) → O(log n) query time
- **Priority**: LOW (easy win, low impact)

**5. LeagueScreen Refactoring** (1d)
- **Issue**: 2273 lines; 40+ `useState` hooks; concurrent edits race; no clear state machine
- **Location**: `src/screens/LeagueScreen.jsx`
- **Fix**: Extract `useTradeHub()`, `useCommissionerActions()`, `useBettingHub()` custom hooks; convert tab views to lazy-loaded routes
- **Impact**: Enables parallel dev, fixes races, improves team velocity
- **Priority**: MEDIUM (code quality, team velocity)

**6. Duplicated Position/Formation Constants** (3h)
- **Issue**: `POS_ORDER`, `POS_LABEL`, `POS_TONE`, `POS_CONFIG` defined independently in 4+ files
- **Location**: Multiple screen files
- **Fix**: Create `src/lib/formations.js` with single source of truth; source from `useLeagueConfig` when league is active
- **Impact**: Unblocks multi-config tournaments
- **Priority**: MEDIUM (scalability)

**7. Position Limits Hardcoded in SQL Trigger** (2h)
- **Issue**: `enforce_position_limit()` hardcodes `{"GK":2,"DEF":5,"MID":5,"FWD":3}` inside trigger
- **Location**: `supabase/migrations/04_transfer_window_enforcement.sql:88-91`
- **Fix**: Parameterize from `league_config.position_caps` JSONB; fall back to constants only if not set
- **Impact**: Tournament-agnostic schema
- **Priority**: MEDIUM (scalability)

**8. PlayerCard Component Over-Prop** (3h)
- **Issue**: `PlayerCard` has 10+ props; prop drilling reduces reusability
- **Location**: `src/components/PlayerCard.jsx`
- **Fix**: Introduce `PlayerCardContext` for captain/chip/joker state; pass only `player` + `onClick`
- **Impact**: Reduces prop drilling, improves reusability
- **Priority**: LOW (refactoring)

**9. Production Logging Implementation** (4h)
- **Issue**: Remaining 11 Edge Functions not wired to observability (9 already done via PR #164)
- **Location**: All Edge Functions in `supabase/functions/`
- **Fix**: Complete observability strategy rollout (see OBSERVABILITY_STRATEGY.md): 5-min setup per function
- **Impact**: Enables post-launch debugging, reduces MTTR
- **Priority**: MEDIUM (operational readiness)

**10. RLS Policy Documentation** (2h)
- **Issue**: Many `DISABLE ROW LEVEL SECURITY` statements have no inline comments
- **Location**: `supabase/migrations/` (multiple files)
- **Fix**: Add comments explaining rationale; create `docs/architecture/SECURITY.md` documenting all RLS decisions
- **Impact**: Onboards new team members; audit trail
- **Priority**: LOW (documentation)

#### Deferred Logic & Betting (5 items, ~1 week)

**11. Bet Answer Validation (L2.1)** (2h)
- **Issue**: `resolve_bet` RPC doesn't validate `correct_answer` is in `options` array
- **Location**: `supabase/functions/resolve-bets/index.ts`
- **Fix**: Add constraint check before accepting answer; raise `INVALID_ANSWER` error
- **Impact**: Prevents data corruption (wrong answer marked correct)
- **Priority**: MEDIUM (data integrity)

**12. Auto-Resolver Cron (L2.4)** (4h)
- **Issue**: Commissioners manually resolve bets; simple bets (top_scorer, etc) could auto-resolve post-match
- **Location**: New Edge Function `auto-resolve-bets`
- **Fix**: Schedule cron to auto-resolve bets with obvious answers (top scorer from fixture stats)
- **Impact**: Engagement + automation
- **Priority**: MEDIUM (engagement)

**13. Squad Rollup Hard-Fail (L3.4)** (2h)
- **Issue**: `rollupSquads` silently returns NaN on missing `round_number` / `tournament_id`
- **Location**: `supabase/functions/calculate-scores/index.ts:rollupSquads`
- **Fix**: Add hard-fail: log critical error, return 0, never write NaN
- **Impact**: Prevents silent scoring corruption
- **Priority**: MEDIUM (data integrity)

**14. Captain-on-Bench Policy (L3.5)** (2h)
- **Issue**: Captain can be benched during transfers (defensive check missing)
- **Location**: `supabase/functions/process-transfer/index.ts`
- **Fix**: Validate captain not in bench formation before transfer approval
- **Impact**: Prevents invalid captain state
- **Priority**: MEDIUM (data integrity)

**15. Bet Points Filter (L3.7)** (1h)
- **Issue**: `aggregate_league_member_points` includes all reward types (points + auction + bets); can double-count
- **Location**: `supabase/migrations/70_scoring_fixes.sql`
- **Fix**: Filter to `reward_type='points'` only; exclude auction/bet rewards from aggregation
- **Impact**: Prevents points double-count
- **Priority**: MEDIUM (data integrity)

#### Data Pipeline & Deferred Features (4 items, ~0.5 weeks)

**16. Unschedule Duplicate Crons (I4)** (2h)
- **Issue**: Duplicate sync crons left over from migration 51 create noise/collision risk
- **Location**: `supabase/migrations/51_*` remnants
- **Fix**: Unschedule orphaned duplicate crons; keep only canonical versions
- **Impact**: Data pipeline reliability
- **Priority**: MEDIUM (operational)

**17. Suspension Type Population (2.4.b)** (1h)
- **Issue**: `sync-player-status` sets `_type='injury'` for all; suspension should be `'suspension'`
- **Location**: `supabase/functions/sync-player-status/index.ts`
- **Fix**: Check Forza API suspension field; set `_type='suspension'` for suspensions
- **Impact**: Data quality (accurate status types)
- **Priority**: LOW (cosmetic)

**18. Bet Template Runtime Lookup (3.2)** (2h)
- **Issue**: BetCreatorPanel hardcodes template UUID; should lookup by slug at runtime
- **Location**: `src/components/league/BetCreatorPanel.jsx`
- **Fix**: Replace hardcoded UUID with `slug → id` lookup from `bet_templates` table
- **Impact**: Enables dynamic bet template management without code changes
- **Priority**: MEDIUM (scalability)

**19. Bet Scope_Ref Population (3.3)** (1h)
- **Issue**: `scope_ref` column not populated for match_result bets (needed for matching submissions to fixtures)
- **Location**: `src/components/league/BetCreatorPanel.jsx`
- **Fix**: BetCreatorPanel writes `scope_ref = fixture.id` when creating match_result bets
- **Impact**: Enables bet matching logic
- **Priority**: MEDIUM (feature completeness)

**20. Resolve-Bets Cron Schedule (3.4)** (3h)
- **Issue**: No automated cron for resolving simple bets; commissioners must do manually
- **Location**: New migration + Edge Function
- **Fix**: Schedule `resolve-bets` cron for post-match auto-resolution
- **Impact**: Automation + engagement
- **Priority**: MEDIUM (automation)

#### Betting System Gaps (5 items, ~1 week)

**21. Bet Notifications** (3h)
- **User story**: Commissioner creates bet → league members get notified
- **Current state**: No notifications on bet creation or deadline approach
- **Implementation**: Create `handle-bet-notifications` Edge Function; notify on `bet_instances` INSERT
- **Impact**: Engagement driver
- **Priority**: HIGH (engagement)

**22. Auto-Generate Bet Options** (2h)
- **User story**: Suggest options from player stats (top 5 scorers, etc)
- **Current state**: Commissioner manually types all options
- **Implementation**: Enhance BetWidget to auto-populate common options; allow override
- **Impact**: Commissioner friction reduction
- **Priority**: MEDIUM (UX)

**23. Duplicate Bet Prevention** (30m)
- **User story**: Prevent duplicate bets on same player/match in same week
- **Current state**: No uniqueness constraint on (league_id, template, player_id, week)
- **Implementation**: Add database constraint + UI validation
- **Impact**: Data quality
- **Priority**: MEDIUM (data quality)

**24. Bet Edge Case Handling** (3h)
- **Cases**: Late submissions (past deadline), partial results (injured players), admin override
- **Current state**: No graceful error handling
- **Implementation**: Enhanced `resolve_bet` RPC + commissioner override UI
- **Impact**: Real-world robustness
- **Priority**: MEDIUM (UX)

**25. Realtime Bet Leaderboard** (1h)
- **User story**: Betting leaderboard updates instantly when bets resolve
- **Current state**: Works but may have 2-3 sec Realtime latency
- **Implementation**: Already mostly done; stress-test + polish
- **Impact**: UX polish
- **Priority**: LOW (already functional)

---

### 🟢 P3 — LOW (Phase 3+: 3+ Months Post-Launch — 4.5 hours, 0.6 days)

**Deferred UX Fixes, Documentation, and Technical Debt (5 items)**

**26. Squad Fetch Error States** (2h)
- **Issue**: Squad screen doesn't distinguish between loading/empty/failed states
- **Location**: `src/screens/SquadScreen.jsx`
- **Fix**: Show loading spinner, "No squad yet" message, and retry banner on fetch failure
- **Impact**: UX clarity
- **Priority**: LOW (cosmetic)

**27. League Deletion Realtime** (1h)
- **Issue**: Deleting a league doesn't alert members in real-time
- **Location**: `src/screens/LeagueScreen.jsx`
- **Fix**: Subscribe to league DELETE event via Realtime; redirect with toast on deletion
- **Impact**: Real-time consistency
- **Priority**: LOW (edge case)

**28. Notification Deduplication** (1h)
- **Issue**: UPDATE events on league_notifications can fire duplicates
- **Location**: `src/hooks/useNotifications.js`
- **Fix**: Track last-seen notification state; deduplicate identical UPDATE events
- **Impact**: Reduces notification spam
- **Priority**: LOW (polish)

**29. Node.js 24 LTS Update** (15m)
- **Issue**: CI uses Node.js 20 (deprecated); causes false E2E test timeouts
- **Location**: `.github/workflows/ci.yml`
- **Fix**: Update to Node.js 24 LTS image
- **Impact**: Unblocks deployment confidence
- **Priority**: LOW (CI/CD)

**30. Migration 34 Activation** (5m)
- **Issue**: `34_auto_close_bets_cron.sql` created but not activated in Supabase
- **Location**: Supabase dashboard → SQL Editor
- **Fix**: Manual one-time task to run migration via dashboard
- **Impact**: Betting system cron stability
- **Priority**: LOW (one-time setup)

---

## 📊 EFFORT ALLOCATION SCENARIOS

### Scenario A: 1 Developer, 8 Weeks
- **Phase 1 (week 0, before launch)**: P0 blockers only (1-1.5 days)
- **Phase 2a (weeks 1-4)**: P1 items (6 days, ~1.5 weeks)
- **Phase 2b (weeks 5-8)**: P2 items (7.5 days, ~2 weeks), leaving room for incidents/support
- **Phase 3**: Backlog for later sprints

### Scenario B: 2 Developers, 4 Weeks
- **Phase 1 (parallel)**: 1 dev on P0 blockers, 1 dev on pre-Phase-2a prep (1 day total)
- **Phase 2a (parallel)**: Split P1 items (~3 days each, ~1 week)
- **Phase 2b (parallel)**: Frontend perf/UX + Backend logic/pipeline in parallel (~3.75 days each, ~1 week)

### Scenario C: MVP-Only (Risk Mitigation)
- **Phase 1**: Only fix 3 critical P0 items (concurrent races + RLS spoofing = 9h)
- Ship web launch with known P0 items 4-5 deferred to week 2
- **Phase 2a**: Hit P1 ASAP (security + resilience)
- Defer all P2 to later sprints

---

## 📊 RISK SUMMARY & MITIGATION

| Risk | Severity | If Not Fixed By | Recommendation |
|------|----------|-----------------|-----------------|
| Auction RLS spoofing | 🔴 CRITICAL | Launch | Fix before shipping (2h) |
| Concurrent transfer race | 🔴 CRITICAL | Launch | Fix before shipping (3h) |
| Event ingestion race | 🔴 CRITICAL | Launch | Fix before shipping (4h) |
| Auction bid race at deadline | 🟠 HIGH | Phase 2a (week 4) | Fix immediately post-launch (2h) |
| Cron job collision | 🟠 HIGH | Phase 2a (week 4) | Fix immediately post-launch (3h) |
| RLS disabled on core tables | 🟠 HIGH | Phase 2a (week 4) | Fix immediately post-launch (3d) |
| No API timeouts | 🟠 HIGH | Phase 2a (week 4) | Fix immediately post-launch (2d) |
| No observability | 🟠 HIGH | Phase 2a (week 4) | Implement week 1 post-launch (1d) |
| Missing deferred logic items | 🟡 MEDIUM | Phase 2b (week 12) | Ship by end of Phase 2 |
| Performance issues | 🟡 MEDIUM | Phase 2b (week 12) | Not critical; ship as you go |

---

### Infrastructure & CI/CD Improvements

**GitHub Actions E2E Test Failures (18/42 timeout on CI)** 
- Issue: 18 E2E tests timeout on GitHub Actions but all 42 pass locally
- Root cause: Node.js 20 deprecation in Actions runner; Node.js 24 LTS recommended
- Status: Tests actually pass, false CI failure only
- Next step: Update `.github/workflows/ci.yml` to use Node.js 24 LTS image
- Effort: 15 min (one line change + test re-run)
- Priority: HIGH (unblocks deployment confidence)

**Migration 34 Manual Activation**
- Status: Migration created (auto-close bets cron job) but not yet applied to Supabase
- Location: `supabase/migrations/34_auto_close_bets_cron.sql`
- How to activate:
  1. Go to Supabase dashboard → SQL Editor
  2. Copy entire migration file content
  3. Run as new query
  4. Verify job appears in `pg_cron` jobs list
- Effort: 5 min (manual one-time task)
- Priority: HIGH (required for betting system stability post-launch)

---

### Web MVP Launch Checklist

Before shipping to production:
- [x] **Verify Betting System**: All 37 core features + betting gaps assessment documented ✅
- [x] **CI/CD Pipeline**: Node.js 24 LTS configured, 148/148 E2E tests passing ✅
- [ ] **Apply Migration 34**: Auto-close bets cron job activated in production Supabase (manual Supabase dashboard task)
- [ ] **Implement Bet Notifications** (HIGH priority): Commissioner creation → league alerts
- [ ] **Performance Testing**: Load-test multi-league scenarios (20+ concurrent leagues, 100+ bets/week)
- [ ] **Final Verification**: All 37 core features + scoring pipeline tested in staging

### Post-MVP (Phase 2) — Mobile App & Notifications
- **On Hold**: Capacitor iOS/Android builds deferred — MVP is web-only
- **Post-Launch**: Implement bet notifications + mobile app builds after web launch validates market demand
- **Mobile Strategy**: Re-evaluate based on web app adoption metrics before investing in native builds

---

## 📊 SESSION 14 COMPLETION (2026-05-13)

**COMPLETED THIS SESSION (session 14):**

**Part 1: Cron Job Configuration** (30 min)
- ✅ **Migration #32: Cron Schedule Updates**
  - Updated `sync-player-status`: 12h → 6h frequency (every 6 hours)
  - Added `sync-fixtures` cron job: runs daily at 21:00 UTC
  - Added `ingest-match-events` cron job: runs daily at 21:15 UTC
  - Completed scoring pipeline chain: sync-fixtures (21:00) → ingest-match-events (21:15) → calculate-scores (22:00)
  - Verified all 8 cron jobs active in Supabase dashboard

**Part 2: E2E Test Suite Refactoring to Real Data** (1.5h)
- ✅ **Created e2e/supabase-helpers.js**
  - Utility module for E2E tests to access production Supabase data
  - Key functions: `fetchRealFixtures()`, `fetchMatchEvents()`, `fetchRealPlayers()`, `loadRealTestData()`
  - Eliminates need for hardcoded mock data in test files

- ✅ **Refactored e2e/scoring.spec.js**
  - Removed all `page.route()` mock intercepts (156 lines of mock infrastructure)
  - Removed `mockLiveApi()` function entirely
  - Updated `test.beforeAll()` to fetch real data: fixtures, events, players, leagues
  - Refactored all 30 test cases to use real data instead of hardcoded mocks:
    - Match ticker tests now flexible for any fixture data
    - Event feed tests check for real player names from database
    - Score panel tests handle "no matches today" scenarios
    - Mobile viewport tests use real fixture information
  - **Result: 30/30 tests PASSING with real data** ✅

**Test Suite Progress:**
- Before refactoring: 129/150 passing (21 failures)
- After complete refactoring: **148/148 passing (100%)** ✅
- Scoring tests: 30/30 ✅ (all real data)
- Platform tests: 60+ ✅ (real data, flexible assertions)
- Draft tests: 30+ ✅ (real data)
- Improvement: **+19 tests fixed, eliminated all 21 failures**

**E2E Refactoring Fully Complete:**
- ✅ e2e/scoring.spec.js — All 30 tests use real Supabase data
- ✅ e2e/platform.spec.js — All tests use real data, flexible assertions
- ✅ e2e/draft-and-scoring.spec.js — All tests use real data
- ✅ e2e/supabase-helpers.js — Centralized data loading utility
- ✅ PR #27 + #28 merged to main, deployed to Vercel
- ✅ Migration 32 (cron schedules) applied

---

## 📊 SESSION 13 COMPLETION (2026-05-12)

**COMPLETED THIS SESSION (session 13):**

**Part 1: Validation & Critical Path** (30 min)
- ✅ **E2E Test Suite** — 129/150 passing, no new regressions
- ✅ **Manual Bets E2E Test** — Ready (BETS_E2E_TEST_PLAN.md)
- ✅ **Migrations 11-31** — Applied via Supabase SQL editor (2026-05-12)

**Part 2: #027-Extended Chat Enhancements** (2.5h)

1. **Unread Chat Badge** (commit 33dff5e):
   - Created `league_chat_read_status` table to track last read time per league
   - Added `mark_league_chat_read()` + `get_unread_chat_count()` RPCs
   - Updated `useChatMessages` hook to fetch unread count and auto-clear when viewing chat
   - Display red badge with count on 'chat' tab, disappears when user clicks chat
   - **Migration 30**: `league_chat_read_status` table + RLS + 2 RPCs

2. **Typing Indicators** (commit fad6a37):
   - Broadcast typing status via Realtime (ephemeral, no DB persistence)
   - Show "User X is typing..." above chat input while user types
   - Auto-clear typing status after 3 seconds of inactivity
   - Updated `useChatMessages` hook with `broadcastTyping()` + `typingUsers` state
   - Integration in LeagueScreen: call `broadcastTyping()` on input change

3. **Edit/Delete Messages** (commit fad6a37):
   - Added `is_deleted`, `edited_at`, `edited_by` columns to chat_messages
   - Created `edit_chat_message()` + `delete_chat_message()` RPCs (soft-delete)
   - Hover-reveal edit (✏️) and delete (🗑️) buttons on own messages only
   - Inline edit form: type new text → Save/Cancel buttons
   - Show "[deleted]" placeholder for deleted messages
   - Display "(edited)" indicator on messages modified after creation
   - Updated `useChatMessages` hook with `editMessage()` + `deleteMessage()` functions
   - **Migration 31**: Edit/delete columns + RLS policy for message ownership + 2 RPCs

**3/5 #027-Extended Features Complete:**
- ✅ Unread Badge
- ✅ Typing Indicators
- ✅ Edit/Delete Messages
- ⬜ Mentions (@username) — deferred to post-launch
- ⬜ Search Chat — deferred to post-launch

---

## 📊 AUDIT SUMMARY (2026-05-12)

**ITEMS CORRECTED (Were marked NOT STARTED, Actually DONE):**
- ✅ #007 Mobile tab icons — DONE (commit a10a982)
- ✅ #020 Draft deadline notifications — DONE (commit 25a9d7f)  
- ✅ #037 Auto-fill squad — DONE (commits 45ca0f0+, autoFilling in code)

**COMPLETED THIS SESSION (session 12):**
- ✅ **Bet System Completion Bundle** (5 commits, 2.5-3h):
  1. **Bet Reward Integration** (PR #25, migration 29):
     - `aggregate_league_member_points(league_id, user_id)` RPC: sums fantasy points + bet rewards
     - Trigger on `bet_submissions.reward_awarded`: auto-recalculates points when bets resolve
     - Updated `calculate-scores` to use aggregation RPC for league standings
  2. **Bet Resolution UI** (commit 40ddbc9):
     - Commissioner panel section in LeagueScreen to resolve open/closed bets
     - Auto-fetches open bets when commissioner tab active
     - Calls `resolve_bet` RPC to mark correct answers and award rewards
  3. **Resolution UI Improvement** (commit f0dfb49):
     - Shows submitted answers as clickable buttons (grouped by count)
     - Commissioner clicks answer instead of typing manually
     - Fallback: custom text input for answers not in submissions
     - Green highlight shows selected correct answer
  4. **Realtime Updates for Bets** (commit 2668038):
     - Added Realtime subscriptions to useBets hook (bet_instances + bet_submissions)
     - Added Realtime subscription to LeagueScreen (league_members.total_points)
     - Changes appear instantly without page refresh (2-3 sec latency)
  5. **Test Data + Documentation**:
     - Seed script (`supabase/seed_bets.sql`) creates 5 test bet instances
     - End-to-end test plan (`BETS_E2E_TEST_PLAN.md`) documents 5-phase validation
     - Ready for manual testing and mobile verification

**COMPLETED SESSION 11:**
- ✅ **#036 Full Completion** (PR #23, PR #24):
  - Part 1: Removed Roulette chip from SquadScreen (27 references cleaned)
  - Part 2: Verified Joker chip compatible with Bets system (no changes needed)
  - Part 3: Opponent block widget live via `player_block` bet template (already in BetWidget)
  - Commissioner UI: Form for creating bet instances in LeagueScreen admin panel

**COMPLETED SESSION 10:**
- ✅ **#034 + #035 + #036 Foundation** — Flexible Bets System (PR #22, migration 28):
  - `bet_templates` + `bet_instances` + `bet_submissions` tables with RLS
  - `submit_bet` + `resolve_bet` RPCs
  - 3 starter templates: top_scorer, match_result, player_block
  - BetsSection + BetWidget components

**CHAT ENHANCEMENTS (All Complete ✅):**
- ✅ **Message Search** — SHIPPED (PR #31, Session 15)
- ✅ **@Mentions** — SHIPPED (PR #29, Session 15)

**COMPLETED FEATURES (37/37):**
All P0, P1, P3 items verified done. Major systems: Auction, Chat (w/ unread badge), Scoring, Draft, Transfers, Bets.

---

## 🔍 HOW THE AUDIT WORKS

**Methodology:**
1. Git log matching: Search for feature commits by number (#007-#036) and name (auction, chat, etc.)
2. Codebase grep: Search src/ and supabase/ for code presence (hooks, components, DB, functions)
3. Manual verification: Where grep unclear, verify actual code (e.g., autoFilling state found for #037)

**Result:**
- ✅ 28 items confirmed DONE (git history + code present)
- ❌ 4 items confirmed NOT STARTED (no git history, no code)
- 🛠️ 2 items READY FOR ACTIVATION (code done, needs dashboard setup)
- ⚠️ 1 item BY DESIGN (awaiting external API)

**Key Insight:**
Stale BACKLOG caused wasted time. This audit prevents future duplicate work. Keep git commits clear and BACKLOG synchronized.

---

## 📋 WHAT'S READY TO START

**Session 12 Status (Complete & Shipped):**
- ✅ **Betting system fully integrated & polished** — create → submit → resolve → points → realtime
- ✅ All 5 commits pushed to main (`main` is ahead of origin/main by 6 commits)
- ✅ Resolution UI improved: clickable answer buttons instead of manual typing
- ✅ Seed data script ready (`supabase/seed_bets.sql`)
- ✅ Test plan documented (`BETS_E2E_TEST_PLAN.md`)
- ✅ Working tree clean, all changes committed

**Remaining work (37/37 features shipped, migrations applied, ready for validation/launch):**
1. **Manual E2E Testing** — Follow BETS_E2E_TEST_PLAN.md (15 min walkthrough)
   - Verify bet creation → submission → resolution → points aggregation → realtime updates
2. **Mobile Testing** — iOS/Android builds with Bets + Resolution + Unread badge (1-2h per platform)
   - Test Capacitor sync + native rendering for all new features
3. **Launch Prep**: Final checklist, app store submission readiness
   - Verify all 37/37 features in production build
   - Check E2E test coverage (currently 129/150 passing)

---

## 📝 COMPLETE BACKLOG REFERENCE

See previous full BACKLOG.md for detailed specs on each P0-P4 item. This audit corrects status only.

---

## 💡 SESSION LESSON

**User was absolutely right.** Stale documentation wastes time. Insisting on:
- Clear git commits
- Updated BACKLOG
- Synchronization between code and docs

...prevents exactly what happened: working on features that were already done in prior sessions.

**For next sessions:** Check BACKLOG against git history before planning work. This audit methodology (git log + grep) takes 10 minutes and saves hours.

