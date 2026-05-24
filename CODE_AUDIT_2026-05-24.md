# Code Audit — Forza Fantasy League
**Date:** 2026-05-24
**Scope:** End-to-end analysis: migrations, edge functions, frontend, security, CI/CD, deployment.
**Methodology:** Five parallel review agents covering different surfaces, cross-referenced against `CLAUDE.md` contracts and recent git history.

---
## Sprint 0 Status — updated 2026-05-24

| ID | Status | Notes |
|----|--------|-------|
| SEC-1 | ✅ Done | Column-restricted squads UPDATE policy |
| SEC-2 | ✅ Done | JWT + commissioner auth on draft-lottery, reverse-draft, eliminate-cup-club |
| SEC-3 | ✅ Done | process-transfer reads price from DB, validates league membership |
| SEC-4 | ✅ Done | place_bid ownership check via auth.uid() |
| SEC-5 | ✅ Done | resolve_bet commissioner check (also fixed param rename: p_instance_id → p_bet_id) |
| SEC-6 | ✅ Done | RLS enabled on 18 gameplay tables (guarded by table-existence checks) |
| SEC-7 | ✅ Done | users SELECT restricted to own row; user_profiles view created |
| DEPLOY-1 | ✅ Done | e2e credentials in env vars; canonical version at scripts/e2e-setup.mjs |
| DATA-1 | ✅ Done | Draft upsert onConflict fixed; tournament_id included |
| DATA-3 | ✅ Done | Duplicate fantasy_points UNIQUE constraint dropped |
| DATA-11 | ✅ Done | bet_submissions FK fixed (column is bet_instance_id not bet_id) |
| DATA-12 | ✅ Done | Invalid cron expression in migration 21 unscheduled |
| FRONT-1 | ✅ Done | HubConstants.js leaf module; TDZ crash eliminated. Note: LeagueScreen import was also fixed in Sprint 1 (import pointed at HubShared instead of HubConstants — was a silent prod build failure) |
| LOW-* | ⏳ Sprint 2+ | Lower-priority items deferred |

---

## Sprint 1 Status — updated 2026-05-24

| ID | Status | Notes |
|----|--------|-------|
| FRONT-2 | ✅ Done | useChatMessages: null subscriptionRef/typingChannelRef in cleanup; deps slimmed to [leagueId, user?.id] |
| FRONT-3 | ✅ Done | LeagueScreen: removeChannel() for standings sub |
| FRONT-4 | ✅ Done | LeagueScreen: user?.id dep instead of user object — stops token-refresh refetches |
| FRONT-7 | ✅ Done | SquadScreen: fetchSquad in useCallback; user→user?.id dep. Full AbortController deferred to Sprint 3 (FRONT-7 remainder) |
| FRONT-9 | ✅ Done | useNotifications: removeChannel() |
| FRONT-10 | ✅ Done (partial) | useAuctions: cancelRef added. Realtime subscription (replacing polling) deferred to Sprint 2 |
| FRONT-11 | ✅ Done | loadLeagueById effect guards on user?.id |
| L3.3 | ✅ Done | migration 69_rank_trigger.sql: recompute_league_ranks() + AFTER UPDATE OF total_points trigger. Applied to Supabase production. |
| L1.2 | ✅ Done | GK conceded_per_goal → floor(n/2)×rule (FPL-style, session 35) |
| L1.3 | ✅ Done | rollupSquads: \|\| → ?? + NaN guard (session 35) |
| L1.4 | ✅ Done | Wildcard 1.1× applied to squad total once, not per-player (session 35) |
| L1.5 | ✅ Done | Joker chip wired: joker_player_id doubles that player's score (session 35) |
| L1.6 | ✅ Done | Path B switch handles both 'sub' and 'sub_off' (session 35) |
| L1.7 | ✅ Done | ingest-match-events typeMap: penalty_missed → 'penalty_missed' not 'goal' (session 35) |
| L1.8 | ✅ Done | Path B clean_sheet derivation includes mins≥60 gate (session 35) |
| DATA-4 | ✅ Done | process-transfer deadline check scoped to league tournament_id (session 35) |
| DATA-5 | ✅ Done | process-transfer squad query filtered by active matchday_id (session 35) |
| DATA-6 | ✅ Done | rollupSquads hard-fail on missing round_number/tournament_id; never writes 'current' (session 35) |
| U10 | ✅ Done | DraftRecoveryScreen derives active matchday from matchday_deadlines (session 35) |
| U11 | ✅ Done | SquadScreen.fetchSquad scoped to active matchday_id (session 35) |
| U12 | ✅ Done | RecapScreen resolves matchday from matchday_deadlines via tournament_id (session 35) |

**Schema corrections discovered during migration:**
- `squads` has no `formation` or `joker_used` columns
- `bet_submissions` column is `bet_instance_id` (not `bet_id`)
- `relaxation_state` table does not yet exist in production instance

---

---

## Executive Summary

| Severity | Count | Headline |
|---|---|---|
| **🔴 CRITICAL** | **9** | Self-mint budget via direct UPDATE on `squads`; client-supplied price in `process-transfer`; `run-draft-lottery` callable unauth; broken upsert constraint after migration 49; missing `scoring_rules` table; duplicate UNIQUE on `fantasy_points`; TDZ time-bomb on 7 `HubShared` imports; production credentials in untracked `e2e-setup.mjs`; bidding via someone else's squad. |
| **🟠 HIGH** | **22** | RLS missing on 18 gameplay tables; `users.email` readable by all; chat realtime channel leak; double-cron sync; `useDeadlineCountdown` hardcoded `'md1'`; CI E2E auth-disabled & runs in dev mode (TDZ invisible); 17+ silent `test.skip()` in draft tests. |
| **🟡 MEDIUM** | **18** | Stale closures in SquadScreen, race conditions on league-switch, `auction_listings` direct UPDATE bypass, `scoring_templates` admin policy fake gate, `eliminate-cup-club` fire-and-forget, CORS wildcard, `*.png` blanket gitignore. |
| **⚪ LOW** | **15** | Doc cleanup, dev script gaps, log redaction, dependency hygiene. |

**Total findings: 64.**

### Top 5 to fix before any further deploy
1. **SEC-1** — Drop direct `UPDATE` policy on `squads` (anyone can self-mint budget).
2. **SEC-2** — Validate JWT + commissioner role on `run-draft-lottery` (anyone can wipe any league).
3. **SEC-3** — `process-transfer`: read price from DB not request body.
4. **DATA-1** — Fix `squads` upsert `onConflict` target in both draft functions (silent broken drafts post-migration 49).
5. **DATA-2** — Reconcile `scoring_rules` vs `scoring_templates` (live scoring is currently using fallback constants).

---

## How to use this document

Each finding has:
- **ID** (stable for cross-reference)
- **Severity**
- **Location** (file:line)
- **Issue** (what's wrong, with snippet)
- **Fix** (concrete change)
- **Test** (verification step)

Work top-down. The order is: 🔴 Critical → 🟠 High → 🟡 Medium → ⚪ Low. Within each tier the most-exploitable / most-deploy-blocking items come first.

---

# 🔴 CRITICAL

## SEC-1 — `squads` UPDATE policy lets users self-mint budget & rosters
- **File:** `supabase/migrations/47_rls_core_tables.sql:90-94`
- **Issue:** Policy grants UPDATE on the entire row to the owner. Browser-side:
  ```js
  supabase.from('squads').update({ budget_remaining: 9999, players: [...]} ).eq('user_id', me)
  ```
  succeeds. All validation in `process-transfer` is bypassed.
- **Fix:** New migration `66_*.sql`:
  ```sql
  DROP POLICY IF EXISTS "users can update own squad" ON public.squads;
  -- Allow only specific safe columns; route money/roster mutations through the edge function.
  GRANT UPDATE (captain_id, formation, joker_player_id, joker_used) ON public.squads TO authenticated;
  CREATE POLICY squads_update_safe ON public.squads
    FOR UPDATE TO authenticated
    USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  ```
- **Test:** From browser devtools, `supabase.from('squads').update({budget_remaining:9999}).eq('user_id', me)` must return permission denied or 0 rows affected. `process-transfer` flow must still work.

## SEC-2 — `run-draft-lottery` has no auth check
- **File:** `supabase/functions/run-draft-lottery/index.js:17-26`
- **Issue:** No JWT validation, no membership check. Any visitor can re-roll any league's draft via:
  ```
  curl -X POST https://<project>.supabase.co/functions/v1/run-draft-lottery -d '{"league_id":"X"}'
  ```
  Combined with the broken upsert (DATA-1) the effect today is silent failure, but once that's fixed this becomes destructive.
- **Fix:**
  ```js
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({error:'unauthorized'}, 401, corsHeaders);
  const supabaseUser = createClient(URL, ANON, { global: { headers: { Authorization: authHeader } } });
  const { data: { user } } = await supabaseUser.auth.getUser();
  if (!user) return json({error:'unauthorized'}, 401, corsHeaders);
  const { data: lm } = await supabase.from('league_members')
    .select('role').eq('league_id', league_id).eq('user_id', user.id).maybeSingle();
  if (!lm || lm.role !== 'commissioner') return json({error:'forbidden'}, 403, corsHeaders);
  ```
  Apply same pattern to `run-reverse-standings-draft` and `eliminate-cup-club`.
- **Test:** `curl` without Bearer → 401. With non-commissioner Bearer → 403. With commissioner Bearer → 200.

## SEC-3 — `process-transfer` trusts client-supplied `player_price`
- **File:** `supabase/functions/process-transfer/index.js:31, 37, 211`; client at `src/hooks/useTransfer.js:62`
- **Issue:** Function uses `body.player_price` instead of looking it up. User buys Haaland for £0.1M or sells him for £999M.
- **Fix:**
  ```js
  const { data: p, error: pErr } = await supabase
    .from('players').select('price, position').eq('id', player_id).maybeSingle();
  if (pErr || !p) return json({ ok:false, error:'PLAYER_NOT_FOUND' }, 400, corsHeaders);
  const price = Number(p.price);
  // remove `player_price` from useTransfer.js body
  ```
  Also verify caller is a member of `league_id` (`league_members`).
- **Test:** Invoke with `player_price: 0.1` → should charge the real price, or 400/403 if you're not a league member.

## SEC-4 — `place_bid` RPC lets you bid using someone else's squad
- **File:** `supabase/migrations/27_auction_listings.sql:67-116`
- **Issue:** `SECURITY DEFINER` function never checks `v_squad.user_id = auth.uid()`. Attacker burns rival's budget.
- **Fix:** Inside the RPC, after the squad SELECT:
  ```sql
  IF v_squad.user_id <> auth.uid() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NOT_YOUR_SQUAD');
  END IF;
  ```
  Ship as a new migration that does `CREATE OR REPLACE FUNCTION place_bid ...`.
- **Test:** From devtools call `place_bid` with another user's squad id → returns `NOT_YOUR_SQUAD`.

## SEC-5 — `resolve_bet` RPC has no commissioner check
- **File:** `supabase/migrations/28_bets_system.sql:204-239`
- **Issue:** Any authenticated user can force-resolve any league's bet with any answer.
- **Fix:**
  ```sql
  IF NOT EXISTS (SELECT 1 FROM leagues
    WHERE id = v_league_id AND commissioner_id = auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  ```
- **Test:** Non-commissioner caller → exception.

## DATA-1 — Draft upserts target a constraint that no longer exists
- **File:** `supabase/functions/run-draft-lottery/index.js:166`; `run-reverse-standings-draft/index.js:138-144`
- **Issue:** Migration 49 dropped `squads_league_id_user_id_matchday_id_key` and replaced it with `squads_league_tournament_user_matchday_unique (league_id, tournament_id, user_id, matchday_id)`. Both functions still upsert with `onConflict: 'league_id,user_id,matchday_id'` → PostgREST `42P10`, and **neither function checks the error**. Drafts silently fail.
- **Fix:** Read `leagues.tournament_id`, include it in `squadRows`, switch `onConflict: 'league_id,tournament_id,user_id,matchday_id'`. Then:
  ```js
  const { error: upErr } = await supabase.from('squads').upsert(squadRows, { onConflict:'league_id,tournament_id,user_id,matchday_id' });
  if (upErr) throw upErr;
  ```
- **Test:** Run lottery against a real post-migration-49 league; expect `squads` rows = manager count and no error logged in `edge_function_errors`.

## DATA-2 — `scoring_rules` table referenced but never created
- **Files:** `supabase/functions/calculate-scores/index.js:64, 69`; `supabase/migrations/53_scoring_templates.sql` (creates wrong name).
- **Issue:** `CLAUDE.md` says the function uses `scoring_rules`. Migration 53 only creates `scoring_templates`. Function falls back to hardcoded constants. All Premier League scoring data driven by `scoring_templates` is currently dead code.
- **Fix:** New migration `66_rename_scoring_table.sql`:
  ```sql
  ALTER TABLE IF EXISTS public.scoring_templates RENAME TO scoring_rules;
  ALTER INDEX IF EXISTS idx_scoring_templates_tournament RENAME TO idx_scoring_rules_tournament;
  ALTER INDEX IF EXISTS idx_scoring_templates_event_lookup RENAME TO idx_scoring_rules_event_lookup;
  ```
- **Test:** `SELECT count(*) FROM scoring_rules WHERE tournament_id='426';` returns >0; calculate-scores logs no fallback warning.

## DATA-3 — Migration `63_fantasy_points_unique_constraint.sql` is a duplicate that errors on a fresh DB
- **Files:** `supabase/migrations/10_sprint1_fixes.sql:71-81`, `13_scoring_schema_align.sql:37-45`, `63_fantasy_points_unique_constraint.sql:7-9`
- **Issue:** Same `UNIQUE (squad_id, matchday_id)` already exists as `fantasy_points_squad_matchday_key`. Migration 63 adds it again as `fantasy_points_squad_matchday_unique` → `duplicate key` failure on fresh DB.
- **Fix:** New migration `66_*.sql`:
  ```sql
  ALTER TABLE public.fantasy_points DROP CONSTRAINT IF EXISTS fantasy_points_squad_matchday_unique;
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fantasy_points_squad_matchday_key') THEN
      ALTER TABLE public.fantasy_points
        ADD CONSTRAINT fantasy_points_squad_matchday_key UNIQUE (squad_id, matchday_id);
    END IF;
  END $$;
  ```
- **Test:** `supabase db reset` on a clean DB succeeds end-to-end. Exactly one unique constraint on `fantasy_points(squad_id, matchday_id)`.

## FRONT-1 — TDZ time-bomb: `HubShared` imported at depth 1 and depth ≥2 across 7 files
- **Files:**
  - `src/screens/LeagueScreen.jsx:26` (direct, depth 1)
  - `src/components/league/AuctionsView.jsx:2`
  - `src/components/league/BettingLeaderboardView.jsx:1`
  - `src/components/league/BetsTabHub.jsx:3`
  - `src/components/league/ChatView.jsx:2`
  - `src/components/league/CommissionerPanel.jsx:3`
  - `src/components/league/LeagueDetailView.jsx:1`
  - `src/components/league/StatsView.jsx:1`
- **Issue:** CLAUDE.md explicitly documents this exact pattern as production crash #3 (`Cannot access 'X' before initialization`). The previous fix inlined `MONO/DISPLAY` in `BetCreatorPanel`. Six new siblings reintroduced it. Any chunking shift will retrigger TDZ.
- **Fix:** Split `HubShared` into `HubShared/constants.js` (only leaf-export `MONO`, `DISPLAY`, `mgrHue`, `mgrMono`) and `HubShared/index.jsx` (components). Update both LeagueScreen and the children to import constants only from the leaf path. Component imports stay where they are.
- **Test:** `npm run build && npm run preview`; navigate to `/league/<id>` — no `ReferenceError` in console. Also `npx madge --circular src/`.

## DEPLOY-1 — Production Supabase credentials in untracked `e2e-setup.mjs`
- **File:** `e2e-setup.mjs:8-9`
- **Issue:** Hardcodes the production Supabase project ref + publishable key in a script that performs destructive ops (creates leagues, runs lottery, scores fixtures) against that project. Anon key alone isn't a leak, but combined with the deletion logic and the lack of a `--prod` gate, anyone with read access can corrupt the dry-run league. Also, the file is untracked — silently sitting in working copy with no review trail.
- **Fix:**
  - Move to `scripts/e2e-setup.mjs`.
  - Read URL/key from `process.env` (`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`).
  - Add a top-of-file guard:
    ```js
    if (process.env.SUPABASE_URL?.includes('sssmvihxtqtohisghjet') && !process.argv.includes('--allow-prod')) {
      console.error('Refusing to run against production. Pass --allow-prod explicitly.');
      process.exit(1);
    }
    ```
  - Commit after redaction.
- **Test:** `node scripts/e2e-setup.mjs` against prod URL without flag → exits with error.

---

# 🟠 HIGH

## SEC-6 — 18 tables created without RLS enabled
- **Files:** `00_schema.sql`, `02_draft_system.sql`, `05_trade_listings.sql`, `10_sprint1_fixes.sql`, `35_bet_notifications.sql`
- **Affected tables:** `match_events`, `fantasy_points`, `player_match_stats`, `player_status`, `transfers`, `draft_submissions`, `draft_allocations`, `cup_active_clubs`, `transfer_windows`, `daily_jokers`, `top_scorer_predictions`, `gazette_entries`, `trade_listings`, `league_config`, `h2h_records`, `matchday_recaps`, `projection_snapshots`, `league_notifications`. Plus `tournaments` and `teams` are explicitly `DISABLE`d in `16_forza_integration.sql:23, 52`.
- **Issue:** Any of these can be written from a browser. Attacker can self-credit `fantasy_points`, forge `transfers`, flip `tournaments.sync_enabled`, etc.
- **Fix:** New migration `66_enable_rls_remaining.sql` with `ENABLE ROW LEVEL SECURITY` on every table above, plus explicit policies (member-read where appropriate, writes via service role only).
- **Test:** From browser, `supabase.from('fantasy_points').insert({...})` → 0 rows / RLS denied. Same for every table above.

## SEC-7 — `users` profile policy is `USING (true)` — all emails readable
- **File:** `supabase/migrations/47_rls_core_tables.sql:104-107`
- **Issue:** Comment says "no PII" but `users.email` exists. Any authenticated user can `select email from users` and exfiltrate the user list.
- **Fix:** Replace with:
  ```sql
  DROP POLICY IF EXISTS users_read ON public.users;
  CREATE POLICY users_read_self ON public.users FOR SELECT TO authenticated
    USING (id = auth.uid());
  -- Expose a SECURITY DEFINER view `public.user_profiles` that returns id/username/avatar only
  CREATE OR REPLACE VIEW public.user_profiles AS
    SELECT id, username, avatar_url FROM public.users;
  GRANT SELECT ON public.user_profiles TO authenticated;
  ```
  Update client code to query `user_profiles` instead of `users`.
- **Test:** `supabase.from('users').select('email')` returns only the caller's row.

## SEC-8 — `auction_listings` direct UPDATE bypass
- **File:** `supabase/migrations/27_auction_listings.sql:51-59`
- **Issue:** Any league member can UPDATE the row directly, bypassing `place_bid`. Attack: set `current_bid=0, bidder_squad_id=mine`.
- **Fix:** Drop direct UPDATE policy; rely on the SECURITY DEFINER RPC.
- **Test:** `from('auction_listings').update({current_bid:0}).eq('id', x)` → denied.

## SEC-9 — `scoring_templates` admin policy is a fake gate
- **File:** `supabase/migrations/53_scoring_templates.sql:36, 41`
- **Issue:** Policy `auth.jwt() ->> 'email' LIKE '%@admin%'` grants writes to anyone with `@admin` in their email. No real admin domain exists.
- **Fix:** Drop both admin policies. Writes only via service role.
- **Test:** Authenticated insert into `scoring_rules` → denied.

## DATA-4 — `process-transfer` deadline check uses GLOBAL latest deadline
- **File:** `supabase/functions/process-transfer/index.js:41-46`
- **Issue:** Picks the latest deadline across all tournaments. If WC2026 deadline is later than EPL's, EPL transfers compare against the wrong window.
- **Fix:** Read `leagues.tournament_id`, filter by it, pick the next upcoming deadline (`.gte('deadline_at', now)` order asc).
- **Test:** Future EPL + past WC deadline → EPL buy succeeds. Past EPL + future WC → EPL buy returns `WINDOW_CLOSED`.

## DATA-5 — `process-transfer` `maybeSingle()` will throw when a user has multiple squad rows
- **File:** `supabase/functions/process-transfer/index.js:105-110`
- **Issue:** Query `from('squads').eq('user_id').eq('league_id').maybeSingle()` doesn't filter by `matchday_id`. Once rollups write multiple rows per user (one per matchday), this throws `PGRST116`. Already a latent bug.
- **Fix:** Filter by the active matchday_id (read from `matchday_deadlines` for the league's `tournament_id`, pick earliest future deadline).
- **Test:** Insert two squad rows for same user/league with different matchday_id; buy still works against the active one.

## DATA-6 — `calculate-scores` filters squads by empty tournament_id silently
- **File:** `supabase/functions/calculate-scores/index.js:447-452, 459`
- **Issue:** If `tournament_id` is falsy, `.eq('leagues.tournament_id', '')` returns zero squads. Also, `let pts = fullRoundLookup[pid] || 0;` zeroes legitimate negative scores (red-card players).
- **Fix:**
  - Skip the `.eq` filter when tournament_id is falsy (fallback to fixture-team membership). Log a warning.
  - Change `||` to `??` so negative scores survive.
  - Never write `matchday_id: 'current'`; derive `'{tournament_id}-rN'` from the fixture's round, log critical error if unknown.
- **Test:** Red-carded captain with no other stats → fantasy_points = −2 × 2 = −4 (not 0). Fixture with null tournament_id → squads still update.

## DATA-7 — Cron duplication: orchestrator 51 + hardcoded 63 jobs both fire every 6h
- **Files:** `supabase/migrations/51_dynamic_cron_tournaments.sql`, `63_fix_http_cron_signatures.sql`
- **Issue:** `sync-all-active-tournaments` (51) and hardcoded `sync-player-status`, `sync-players-daily`, `sync-fixtures` (63) all fire at the same minute → double sync, double Forza API quota use, double DB writes for the same data.
- **Fix:** New migration:
  ```sql
  SELECT cron.unschedule('sync-all-active-tournaments')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='sync-all-active-tournaments');
  ```
- **Test:** `SELECT jobname, schedule FROM cron.job;` — no two `sync-*` jobs share the same minute.

## DATA-8 — `run-draft-lottery` cron scheduled twice with different cadences
- **Files:** `03_draft_lottery_cron.sql:8` (`*/5`), `26_transfer_window_constraint_and_cron.sql:101` (`*/15`)
- **Issue:** `cron.schedule()` overwrites by jobname — last one wins (`*/15`), but the intent is opaque. Same for `auto-open-transfer-window` (22 + 26 redundant).
- **Fix:** Single migration documenting the canonical schedules + `cron.unschedule` for clarity.
- **Test:** `SELECT * FROM cron.job WHERE jobname IN ('run-draft-lottery','auto-open-transfer-window');` — exactly one row each, schedule as documented.

## DATA-9 — `auto-open-transfer-window` not idempotent + wrong `opens_at`
- **File:** `supabase/functions/auto-open-transfer-window/index.js:78-92`
- **Issue:** (a) Two parallel cron invocations can both pass the existence check then both insert → duplicate windows. (b) `opens_at = now()` even if next round kicks off days later → 48h window expires before users can use it.
- **Fix:** Add `UNIQUE(league_id, round_number)` on `transfer_windows`; switch to `INSERT ... ON CONFLICT DO NOTHING`. Compute `closes_at = greatest(now() + 48h, next_kickoff − 2h)` by joining `matchday_deadlines`.
- **Test:** Trigger cron twice in parallel → exactly one window row. Set next kickoff 7 days out → `closes_at` is 2h before, not `now()+48h`.

## DATA-10 — `matchday_id` format inconsistency violates CLAUDE.md contract
- **Files:** `13_scoring_schema_align.sql:34` adds `NOT NULL DEFAULT 'current'`; `12_dummy_matchday.sql:30` writes `'md2'`; CLAUDE.md says canonical is `'{tournament_id}-rN'`.
- **Issue:** Multiple formats live side-by-side; rows with `matchday_id='current'` collide on every calculate-scores run.
- **Fix:** New migration: `ALTER TABLE fantasy_points ALTER COLUMN matchday_id DROP DEFAULT;` then `DELETE FROM fantasy_points WHERE matchday_id='current';` and add a `NOT VALID` check constraint enforcing the format.
- **Test:** `SELECT DISTINCT matchday_id FROM fantasy_points;` — every row matches `^[0-9]+-r[0-9]+$`.

## DATA-11 — `16_fix_bet_submissions_fk_*` runs BEFORE `bet_submissions` table exists
- **Files:** `16_fix_bet_submissions_fk_and_dead_trigger.sql`, `28_bets_system.sql`
- **Issue:** The "fix" file sorts first lexically but references a table created in migration 28. Fresh DB provisioning crashes here.
- **Fix:** New migration 66 with the same body but `IF EXISTS` guards:
  ```sql
  DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='bet_submissions') THEN
      EXECUTE 'ALTER TABLE public.bet_submissions DROP CONSTRAINT IF EXISTS bet_submissions_user_id_fkey';
      EXECUTE 'ALTER TABLE public.bet_submissions ADD CONSTRAINT bet_submissions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE';
    END IF;
  END $$;
  ```
- **Test:** `supabase db reset` on clean DB succeeds end-to-end.

## DATA-12 — `21_sync_player_status_cron.sql` has invalid cron expression
- **File:** `supabase/migrations/21_sync_player_status_cron.sql:20`
- **Issue:** `'0 *\12 * * *'` (backslash before 12). pg_cron rejects; fresh-DB migrate errors.
- **Fix:** New migration `cron.unschedule('sync-player-status')` then re-schedule with `'0 */6 * * *'` (or whatever is canonical).
- **Test:** Fresh-DB `supabase db reset` succeeds; `SELECT * FROM cron.job WHERE jobname='sync-player-status';` shows correct expression.

## FRONT-2 — `useChatMessages` realtime subscription leak
- **File:** `src/hooks/useChatMessages.js:157-249`
- **Issue:** Effect depends on `loadMessages`, `fetchUnreadCount`, `user?.id` — all rebuild on token refresh (every ~55min). Cleanup calls `removeChannel(subscriptionRef.current)` but **does not null `typingChannelRef.current`**, leaking old channels. After hours: dozens of channels → Supabase quota cap → silent message loss.
- **Fix:**
  ```js
  return () => {
    if (subscriptionRef.current) { supabase.removeChannel(subscriptionRef.current); subscriptionRef.current = null; }
    if (typingChannelRef.current) { supabase.removeChannel(typingChannelRef.current); typingChannelRef.current = null; }
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
  };
  ```
  Strip non-stable deps: `}, [leagueId, user?.id]);`. Read `loadMessages`/`fetchUnreadCount` via refs.
- **Test:** Open chat, leave 65min, watch DevTools → Network → WS for channel join count = 1 (not piling up).

## FRONT-3 — `LeagueScreen` uses `unsubscribe()` instead of `removeChannel()`
- **File:** `src/screens/LeagueScreen.jsx:400-424`
- **Issue:** In supabase-js v2, `unsubscribe()` leaves the channel in the registry. Navigating between leagues accumulates same-topic channels; eventually rate-limit drops new joins.
- **Fix:** `supabase.removeChannel(membersSub);` in cleanup.
- **Test:** Navigate between 5+ leagues → `supabase.getChannels().length === 1`.

## FRONT-4 — `LeagueScreen` re-render loop on user object
- **File:** `src/screens/LeagueScreen.jsx:305-311`
- **Issue:** Effect deps include the `user` object (not `user?.id`). Every token refresh creates a new reference → refetches leagues/tournaments.
- **Fix:** `}, [user?.id]);` and drop `setCurrentUser(user)` (read from `useAuth` directly).
- **Test:** Idle for 1h with `console.log` in `fetchLeagues` — fires once, not periodically.

## FRONT-5 — `useDeadlineCountdown` hardcoded `'md1'`
- **File:** `src/hooks/useDeadlineCountdown.js:29`
- **Issue:** `const MATCHDAY_ID = 'md1';` — never matches real `'426-rN'` rows. Countdown shows "No deadline set" forever.
- **Fix:** Accept `matchdayId` as argument; default from `useLeagueConfig` or the next future deadline.
- **Test:** Mount `SquadScreen` — countdown displays a real time, not "No deadline set".

## FRONT-6 — `useOnboarding` clobbers `window.__resetOnboarding` across instances
- **File:** `src/hooks/useOnboarding.js:123-129`
- **Issue:** Multiple screens use this hook. Each mount overwrites the global; each unmount deletes it.
- **Fix:** Wire only in `App.jsx`, or guard with `if (!window.__resetOnboarding)`.
- **Test:** Open app → `window.__resetOnboarding()` in console → works. Navigate between screens → still works.

## FRONT-7 — `SquadScreen.fetchSquad` race condition + missing `useCallback`
- **Files:** `src/screens/SquadScreen.jsx:151, 316`
- **Issue:** No `ignore`/`AbortController` — switching leagues fast lets stale fetch overwrite current. Also declared as plain function; every render rebuilds and `useAutoFill` memo deps churn constantly.
- **Fix:**
  ```js
  const fetchSquad = useCallback(async () => { ... }, [user?.id, activeLeague]);
  useEffect(() => {
    let cancelled = false;
    if (activeLeague) (async () => { const data = await ...; if (!cancelled) setSquadData(data); })();
    return () => { cancelled = true; };
  }, [user?.id, activeLeague, fetchSquad]);
  ```
- **Test:** Throttle to Slow 3G, rapid-click between two leagues; final squad must match URL.

## FRONT-8 — `useChatMessages.sendMessage` over-renders on every message
- **File:** `src/hooks/useChatMessages.js:294`
- **Issue:** `messages.length` in deps (only for a log). Caret jumps in busy chats.
- **Fix:** Drop `messages.length` from deps and the log.

## FRONT-9 — `useNotifications` same unsubscribe/removeChannel bug as FRONT-3
- **File:** `src/hooks/useNotifications.js:96-100`
- **Fix:** `supabase.removeChannel(subscription);`.

## FRONT-10 — `useAuctions` no abort + double-mounted across screens
- **File:** `src/hooks/useAuctions.js:8-22`
- **Issue:** No cancellation; LeagueScreen and SquadScreen both call it → simultaneous fetch chains; every action chains another `load()`.
- **Fix:** Add cancel flag; replace polling with Realtime subscription on `auction_listings`.

## FRONT-11 — `loadLeagueById` runs before auth is ready
- **File:** `src/screens/LeagueScreen.jsx:317-368`
- **Issue:** Effect doesn't guard on `user?.id`. RLS returns empty → "No members" until manual refresh.
- **Fix:** `if (leagueId && user?.id) loadLeagueById(leagueId);`

## DEPLOY-2 — CI E2E runs in dev mode and auth-disabled
- **Files:** `.github/workflows/ci.yml:67-92`, `playwright.config.js:43`
- **Issue:** Two compounded problems: (a) `VITE_AUTH_ENABLED=false` so demo mode → no real integration checks; (b) `npm run dev` (Vite dev mode) instead of `vite preview` against `dist/` → TDZ class of bugs (CLAUDE.md priority) is invisible.
- **Fix:**
  ```js
  // playwright.config.js
  webServer: { command: 'npm run build && npm run preview -- --port 5174', port: 5174, reuseExistingServer: !process.env.CI },
  ```
  Add a second CI job that runs Playwright against a seeded staging Supabase project with auth enabled.
- **Test:** Intentionally re-introduce the historic `HubShared` TDZ — CI must catch it.

## DEPLOY-3 — Test counts in CLAUDE.md are wrong and tests skip silently
- **Files:** `e2e/*.spec.js` (159 actual tests), `CLAUDE.md` claims "232", "116/116", "82/84".
- **Issue:** Multiple draft tests use `test.skip()` conditionally on env preconditions (no `serviceDb`, no auth). CI reports "passing" when most are skipped.
- **Fix:** Replace conditional `test.skip` with `test.fixme` + reason; emit skipped count to CI job summary; fail CI if `skipped > N`.
- **Test:** Add `npx playwright test --list | wc -l` to CI; record it in BACKLOG.md as truth.

---

# 🟡 MEDIUM

## DATA-13 — `run-reverse-standings-draft` not updated for per-league config
- **File:** `supabase/functions/run-reverse-standings-draft/index.js`
- **Issue:** Uncommitted diff on `run-draft-lottery` adds per-league `squad_size`/`position_limits`. The sibling function still uses hardcoded constants.
- **Fix:** Mirror the lottery pattern.

## DATA-14 — `eliminate-cup-club` fire-and-forget invoke
- **File:** `supabase/functions/eliminate-cup-club/index.js:61`
- **Issue:** `supabase.functions.invoke('calculate-relaxation', ...).catch(console.error);` — no await. Edge runtime may finalize before the HTTP packet sends.
- **Fix:** `await` it, or use `EdgeRuntime.waitUntil(...)`.

## DATA-15 — `sync-player-status` N+1 query per team
- **File:** `supabase/functions/sync-player-status/index.js:128-132, 157-161`
- **Issue:** ~1000 sequential `.single()` lookups per cron run.
- **Fix:** Single batched `select id, forza_player_id from players where tournament_id = X` upfront; build a map.
- **Test:** Time the cron call; target <5s.

## DATA-16 — `discover-tournament` sequential probe will time out
- **File:** `supabase/functions/discover-tournament/index.js:66`
- **Issue:** 130 sequential awaits × up to 30s each → Edge timeout. Also unbatched calls trip Forza 429s.
- **Fix:** Concurrency=5 batching; honor `Retry-After`.

## DATA-17 — Token leakage in logs
- **Files:** `supabase/functions/discover-tournament/index.js:11`, `test-forza-api/index.js:15`
- **Issue:** `console.log(testUrl)` writes Forza access_token to function logs.
- **Fix:** Redact: `.replace(/access_token=[^&]+/, 'access_token=REDACTED')`.

## DATA-18 — Budget rounding silently truncates 2-decimal prices
- **File:** `supabase/functions/process-transfer/index.js`
- **Issue:** `Math.round((budget - price) * 10) / 10` assumes 0.1m resolution.
- **Fix:** Use 100 (2 decimals) or carry full precision and format on read.

## DATA-19 — `sync-fixtures` string-compares ISO timestamps
- **File:** `supabase/functions/sync-fixtures/index.js:123`
- **Issue:** Works for UTC but breaks on offset timezones.
- **Fix:** `new Date(a) < new Date(b)`.

## DATA-20 — `clean_sheet` consistency between Path A and Path B
- **File:** `supabase/functions/calculate-scores/index.js:352, 126`
- **Issue:** Path B sets `clean_sheet=true` ignoring minutes; scoring later applies the `mins >= 60` gate. Breakdown JSON shows inconsistent state.
- **Fix:** Apply `mins >= 60` at derivation in both paths.

## SEC-10 — Chat has no length limit / rate limit / sanitization
- **File:** `supabase/migrations/24_chat_messages.sql:9`
- **Issue:** `message TEXT NOT NULL` — user can paste 10MB. React renders via text node (safe from HTML XSS), but spam vector remains.
- **Fix:** `ALTER TABLE chat_messages ADD CONSTRAINT chat_msg_len CHECK (char_length(message) <= 2000);` + per-user rate limit via trigger.

## SEC-11 — Edge function CORS is wildcard
- **Files:** `process-transfer/index.js:8` and similar
- **Issue:** `Access-Control-Allow-Origin: '*'`. Low risk with Bearer auth but tighten.
- **Fix:** Echo the Vercel domain or use a small allowlist.

## SEC-12 — AuthContext signUp upsert can race the session
- **File:** `src/context/AuthContext.jsx:78-83`
- **Issue:** After signUp, immediately upserts to `public.users`. RLS may reject if session isn't yet propagated → orphan auth user with no profile row.
- **Fix:** Use Supabase trigger `handle_new_user()` on `auth.users` to create the profile row. Remove client-side insert.

## FRONT-12 — `SquadScreen` double-fetches `tournament_id` via two effects
- **File:** `src/screens/SquadScreen.jsx:91-118, 121-134`
- **Issue:** Two effects both write `setTournamentId`. UI double-flashes.
- **Fix:** Merge into a single effect keyed on the resolved league id.

## FRONT-13 — `useChatMessages.broadcastTyping` listens on `user.user_metadata`
- **File:** `src/hooks/useChatMessages.js:154`
- **Issue:** `user.user_metadata` is a new object per Auth callback; handler re-attaches constantly.
- **Fix:** `}, [leagueId, user?.id]);`

## FRONT-14 — `ErrorBoundary` insert blocked by RLS on pre-auth crashes
- **File:** `src/components/ErrorBoundary.jsx:32-39`
- **Fix:** Add a public RPC `report_crash(...)` with `SECURITY DEFINER`.

## FRONT-15 — `useAutoFill` missing setTimeout cleanup
- **File:** `src/hooks/useAutoFill.js:275`
- **Fix:** Track timer in ref; clear on unmount and on next click.

## FRONT-16 — Latent TDZ: `useLeagueConfig` imported by SquadScreen + useAutoFill
- **Files:** `src/screens/SquadScreen.jsx:17`, `src/hooks/useAutoFill.js:3`
- **Issue:** Same pattern as the historic crashes — depth-1 + depth-2 import. Hasn't crashed yet because exports are primitive, but Rolldown gives no guarantee.
- **Fix:** Pass `cfg` from SquadScreen to useAutoFill as a parameter; drop the duplicate import.

## FRONT-17 — `useAvailabilityFlag.toggleFlag` deps include `flagMap`
- **File:** `src/hooks/useAvailabilityFlag.js:50-109`
- **Issue:** Every flag click rebuilds `toggleFlag` → all 15 squad cards re-render.
- **Fix:** Read `flagMap` from a ref inside `toggleFlag`; drop from deps.

## DEPLOY-4 — `npm install` instead of `npm ci` in workflows
- **Files:** `.github/workflows/*.yml`
- **Fix:** `npm ci` everywhere.

## DEPLOY-5 — `eslint.config.js` excludes `supabase/functions/**` and downgrades hook rules
- **File:** `eslint.config.js:11, 31-44`
- **Issue:** Real bugs hide behind warnings. Edge functions completely unlinted.
- **Fix:** Add a Deno lint step; revisit downgraded rules one-by-one and fix the underlying issues (most listed in FRONT-* findings).

## DEPLOY-6 — `vite.config.js` lacks `manualChunks` and `sourcemap` given known TDZ class
- **File:** `vite.config.js`
- **Fix:**
  ```js
  build: {
    sourcemap: true,
    target: 'es2020',
    rollupOptions: { output: { manualChunks: { supabase: ['@supabase/supabase-js'], react: ['react','react-dom','react-router-dom'] } } },
  }
  ```

## DEPLOY-7 — `.gitignore` `*.png` blanket-ignore + `! .env.example` space bug
- **File:** `.gitignore:30, 73`
- **Issue:** `*.png` ignores future PNG assets silently. `! .env.example` with space is a malformed negation.
- **Fix:** Scope to `/test-results/*.png`, `/e2e-report/*.png`. Use `!.env.example`.

---

# ⚪ LOW

## LOW-1 — Stale root docs
`CHAT_DEBUG_FINDINGS.md`, `CLEANUP_REPORT.md`, `GIT_AND_CODE_WALKTHROUGH.md`, `code_quality_analysis_V2.md` — move to `docs/archive/` or delete.

## LOW-2 — Directory name with space — `docs/brand/ADMIN TAB/`
Rename to `docs/brand/admin-tab/`. Breaks shell scripts on POSIX.

## LOW-3 — `@capacitor/cli` in `dependencies`
Move to `devDependencies`.

## LOW-4 — `html2canvas` 1.4.1 unmaintained since 2022
Consider replacement if actively used in screenshot/share flow.

## LOW-5 — `index.html` `maximum-scale=1.0, user-scalable=no`
WCAG 1.4.4 violation; app stores increasingly flag.

## LOW-6 — Missing security headers in `vercel.json`
Add `X-Frame-Options`, `Content-Security-Policy`, `Referrer-Policy`.

## LOW-7 — Migrations 52 and 58 missing from sequence
Cosmetic, but document in BACKLOG.md.

## LOW-8 — `players.id` is TEXT but `calculate_player_points` accepts BIGINT
- **File:** `53_scoring_templates.sql:171, 199, 207`
- **Issue:** Function won't compile against real schema. Tied to DATA-2.

## LOW-9 — `tournament_id` body key inconsistency in cron migrations
- **Files:** `60_setup_wc_sync_cron.sql:20, 36`, `63_fix_http_cron_signatures.sql:97, 110`
- **Issue:** Some pass `tournament_id`, others (per migration 51's comment) expect `forza_id`. Verify both Edge Functions accept either.

## LOW-10 — `useTransfer.js:64` passes `user_id` from client
- **Issue:** Unused server-side (function reads from JWT) — misleading. Remove.

## LOW-11 — Dead `.catch` on PostgrestBuilder chains
- **File:** `src/hooks/useChatMessages.js:184-189`
- **Issue:** `.single().catch(...)` doesn't intercept query errors (they come through `{ error }`).
- **Fix:** Switch to `.maybeSingle()` and check the return shape.

## LOW-12 — Duplicate gitignore entries for `node_modules/` and `dist/`
- **File:** `.gitignore:10-11, 75-76`

## LOW-13 — No `format` / `typecheck` / `test` npm scripts
Add `"test": "playwright test"` at minimum.

## LOW-14 — Shared `forza()` helper duplicated across 4 edge functions
Extract to `supabase/functions/_shared/forza.ts`.

## LOW-15 — `ingest-match-events`: `parseInt('45+2')` truncates added time silently
- **File:** `supabase/functions/ingest-match-events/index.js`
- **Fix:** Parse minutes with a small regex helper.

---

# Correction Plan — Suggested Order of Work

Phase the work into 4 PRs. Each phase should land green CI + the listed verification commands before the next starts.

### PR 1 — Production security holes (CRITICAL block)
Estimated 3-4 hours.
1. SEC-1: Drop `squads` direct UPDATE policy.
2. SEC-2: Auth-gate `run-draft-lottery`, `run-reverse-standings-draft`, `eliminate-cup-club`.
3. SEC-3: `process-transfer` server-side price lookup + league membership check.
4. SEC-4: `place_bid` owner check.
5. SEC-5: `resolve_bet` commissioner check.
6. SEC-7: `users` policy → `id = auth.uid()`; expose `user_profiles` view.
7. SEC-8: Drop `auction_listings` direct UPDATE.
8. SEC-9: Drop fake `scoring_templates` admin policy.

All consolidated into one new migration `66_security_hardening.sql` + a follow-up PR for the edge function changes.

**Verification:**
```sql
-- No table without RLS where it should have RLS
SELECT relname FROM pg_class WHERE relkind='r' AND relrowsecurity=false
  AND relname IN ('squads','tournaments','teams','daily_jokers','player_match_stats','fantasy_points', ...);
```
```sh
curl -X POST <fn>/run-draft-lottery -d '{"league_id":"x"}'   # expect 401
```
Run E2E + manual buy/sell + auction test.

### PR 2 — Data integrity (CRITICAL/HIGH)
Estimated 3-4 hours.
1. DATA-1: Fix draft upserts (`onConflict`, `tournament_id`).
2. DATA-2: Rename `scoring_templates` → `scoring_rules`.
3. DATA-3: Drop duplicate UNIQUE on `fantasy_points`.
4. DATA-4: `process-transfer` deadline scoped to tournament.
5. DATA-5: `process-transfer` filter squad by active matchday_id.
6. DATA-6: `calculate-scores` tournament-id fallback + `??` instead of `||`.
7. DATA-7: Unschedule duplicate cron jobs.
8. DATA-10: Normalize `matchday_id` format + remove `'current'` rows.
9. DATA-11: Idempotent re-application of bet_submissions FK fix.
10. DATA-12: Fix invalid cron expression in migration 21.

Consolidate the SQL into `67_data_integrity_fixes.sql`. Edge function changes in companion PR.

**Verification:**
```sql
SELECT count(*) FROM scoring_rules WHERE tournament_id='426';                            -- > 0
SELECT conname FROM pg_constraint WHERE conrelid='fantasy_points'::regclass AND contype='u'; -- 1 row
SELECT jobname, count(*) FROM cron.job GROUP BY 1 HAVING count(*) > 1;                   -- empty
SELECT DISTINCT matchday_id FROM fantasy_points WHERE matchday_id !~ '^[0-9]+-r[0-9]+$'; -- empty
```
Run a real draft end-to-end against a test league; verify `squads` rows = manager count.

### PR 3 — Frontend stability (HIGH)
Estimated 2-3 hours.
1. FRONT-1: Split `HubShared` to leaf constants module.
2. FRONT-2 → FRONT-11: Channel cleanup, deps fixes, race protection.
3. DEPLOY-2: E2E against `vite preview` of `dist/` in CI.
4. DEPLOY-6: Vite `manualChunks` + sourcemap.

**Verification:**
```sh
npm run build && npm run preview
# Manually exercise /league/<id>, /squad, switch leagues 5×, send 10 chat msgs
# DevTools console: no ReferenceError, supabase.getChannels().length stays ≤ 3
# Profiler: chat input keeps focus during incoming messages
```

### PR 4 — Hygiene & deferred items (MEDIUM/LOW)
Estimated 1-2 hours.
1. DEPLOY-1: Relocate + redact `e2e-setup.mjs`.
2. DEPLOY-3: Replace silent `test.skip` with `test.fixme` + skip-count gate.
3. DEPLOY-4: `npm ci`.
4. DEPLOY-5: Add Deno lint job.
5. DEPLOY-7: Fix `.gitignore` `*.png` scope and `!.env.example` space.
6. LOW-1 through LOW-15: doc cleanup, deps hygiene, helper extraction.

---

# Verification Reference

After all PRs, run these commands. All must pass before declaring the audit closed.

```sh
# Build & E2E
npm run build
npm run lint
npx playwright test
npx playwright test --list | grep -c "^  " > test-count.txt   # record real number

# Bundle check
ls -la dist/assets/*.js
# Look for one large chunk vs. expected react/supabase/route split
```

```sql
-- Schema integrity
SELECT relname, relrowsecurity FROM pg_class
  WHERE relkind='r' AND relnamespace='public'::regnamespace
  ORDER BY relrowsecurity, relname;
-- Every table should have relrowsecurity = true

-- Constraint integrity
SELECT conname FROM pg_constraint WHERE conrelid='fantasy_points'::regclass AND contype='u';

-- Cron health
SELECT jobname, schedule, command FROM cron.job ORDER BY schedule;

-- Data hygiene
SELECT count(*) FROM fantasy_points WHERE matchday_id = 'current';        -- 0
SELECT count(*) FROM matchday_deadlines WHERE matchday_id !~ '^[0-9]+-r[0-9]+$' AND matchday_id !~ '^md[0-9]+$';
```

```sh
# Security spot-checks (as authenticated non-commissioner user)
supabase.from('squads').update({budget_remaining: 9999}).eq('user_id', me) # → denied
supabase.from('users').select('email')                                     # → 1 row (mine)
supabase.from('fantasy_points').insert({squad_id: x, matchday_id: y, total: 999}) # → denied
curl -X POST https://.../functions/v1/run-draft-lottery -d '{"league_id":"x"}'   # → 401
```

---

# Improvement Opportunities (not strictly bugs)

These are non-blocking but recommended cleanups, suitable for a separate `chore:` PR or BACKLOG cards:

1. **Extract `_shared/forza.ts`** — 4 duplicated `forza()` helpers across edge functions (LOW-14).
2. **Adopt `EdgeRuntime.waitUntil`** pattern consistently for chained edge-function invokes.
3. **Centralize matchday id derivation** — a tiny utility `mdId(tournamentId, round)` returning `'{t}-r{r}'`, used by every writer (sync-fixtures, calculate-scores, ingest-match-events, process-transfer). Currently each file constructs it ad-hoc.
4. **`edge_function_errors` table** — only 2 functions use it. Apply across all critical paths (drafts, transfers, scoring).
5. **Replace `useAuctions` polling with Realtime** — fixes FRONT-10 and also enables instant bid UI.
6. **Promote BACKLOG audit to a quick CI script** — the audit methodology in CLAUDE.md ("git log | grep" + "code presence grep") could be a one-line `npm run audit-backlog` that prints stale entries.
7. **Reify `MEMORY` of past TDZ crashes into a lint rule** — write a custom ESLint rule that flags any new import in `src/components/league/` of a module already imported by `LeagueScreen.jsx`. Prevents the FRONT-1 class of bug at PR time.
8. **Replace `html2canvas`** if used (LOW-4) — `modern-screenshot` is a maintained alternative.
9. **Add Vercel headers** — basic CSP, Referrer-Policy, X-Frame-Options.
10. **Replace `*.png` blanket gitignore** with scoped ignores so future asset additions aren't silently dropped.

---

# Appendix — Audit Sources

- Migration audit: 65 files in `supabase/migrations/`, focus on 47, 49, 53, 63 (collisions), and cron-related files.
- Edge function audit: 13 functions in `supabase/functions/`, plus uncommitted diff in `run-draft-lottery`.
- Frontend audit: 12 screens, 22 hooks, 30+ components. Special focus on `src/components/league/` per CLAUDE.md TDZ history.
- Security audit: RLS coverage, edge function caller validation, mass-assignment risks, .env handling.
- CI/CD audit: 3 workflow files, `playwright.config.js`, `vite.config.js`, `vercel.json`, `capacitor.config.ts`, `.gitignore`.

End of audit.
