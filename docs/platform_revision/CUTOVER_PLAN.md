# V2 → Main Cutover Plan

**The complete runbook for ending the World Cup pilot, merging `v2` into `main`, validating the merged platform, and reopening — with a tested revert path at every step.**

> **Status: PREPARED — waiting for the World Cup pilot to end.**
> Written 2026-07-17 from a full two-branch assessment. Designed to be executed cold in fresh sessions — every phase lists its exact commands, gates, and abort criteria.
>
> **Read [TRACKER.md](../TRACKER.md) first** for anything that changed after this plan was written.

---

## 0. The four requirements this plan satisfies

1. **Block user access** to the platform during the cutover window.
2. **Merge `v2` → `main`.**
3. **Run automatic tests** on the merged platform before reopening.
4. **Be able to revert** if things go bad.

---

## 1. State assessment snapshot (2026-07-17)

### main
- CI fully green at HEAD (lint, build, E2E, iOS, Android).
- No P0/P1 bugs. Open backlog is P2/P3 features only (B-07 league archive, B-08 multi-competition, B-01, B-04b) — nothing blocks the merge.
- 196 migrations, all applied to prod as they shipped.

### v2
- All feature phases ✅ done (P2P, F1, Tennis, Clubhouse social, Clubhouse-centric redesign A–D, Mobile-first M0–M4). Only Phase 3B (this cutover) open.
- Verified locally 2026-07-17: lint 0 errors · production build clean (no Rolldown TDZ) · `madge` no circular deps · **full `e2e/` Playwright run: 262 passed / 33 conditionally-skipped / 0 failed (8.2 min)**.
- CI was red 2026-07-02 → 2026-07-17 for two stacked reasons, both fixed in **PR #720**:
  1. `package-lock.json` missing the `pg` devDep from PR #694 → `npm ci` failed every job.
  2. `.function-checksums.json` was generated over Windows CRLF bytes; Linux CI hashes LF → Function drift check failed. Both hash scripts now normalize CRLF→LF and `hashShared()` is recursive (covers `_shared/providers/`).

### Git
- v2 is **~151 commits ahead / 0 behind** main after the final sync (was 14 behind; synced 2026-07-17).
- Merge-conflict preview of v2→main: **only `BACKLOG.md`** conflicts; all code auto-merges.
- Migration folder on v2 carried duplicate numbers from past main-syncs. ✅ Deduped 2026-07-17: `192_classic_knockout_unlimited_transfers.sql`, `193_fix_elimination_race_and_window_message.sql`, `194_relax_starting_xi_formation.sql` deleted (byte-identical content to `212_…`/`213_…`/`214_…`, confirmed by diff). `191_clean_sheet_retroactive_fix.sql` (main-native, no renumbered twin), `191_f1_paddocks_schema.sql`, `192_knockout_scoring.sql`, `192_f1_rpcs_and_seed.sql`, `193_clubhouse_social.sql`, `193_cup_elimination_require_loss.sql`, `194_clubhouse_frontpage.sql` are distinct content sharing a number by coincidence — kept as-is (numbering collisions are cosmetic in this repo; DB state doesn't depend on filenames, see CLAUDE.md's migration-numbering note).

### Database (shared prod project `sssmvihxtqtohisghjet` — serves the pilot AND v2)
- **Already applied & pilot-proven**: 187–189, 191–201 (F1/Clubhouse/Tennis schemas), 202–216, 220 — weeks of safe coexistence with the live pilot.
- **Pending apply**: 218 (no-cash-out constraint, pure DDL), 219 (GDPR delete RPC, pure DDL), and **226** (see 🔴 note below). 221 verified already live (main's `195`, 2026-06-30); 222 already live (main's `196`, 2026-07-12) — both stamped, do NOT re-apply. F1 data copy (TRACKER row 16) is separate manual work.
- **217 (`circle_id NOT NULL`)**: 🛑 blocked — apply only in Phase 4 (see §5) after the clubhouse backfill and a stability window.
- **🔴 226 (`credit_coins()` overload + `_create_user_wallet()` signup trigger) — CONFIRMED PILOT-IMPACTING, discovered 2026-07-18.** Written to fix a bug surfaced by `scripts/p2p-load-test.js` run locally, initially assumed v2-only (the `coin_wallets`/`coin_transactions` tables are). Read-only production verification found otherwise: `trg_create_wallet_on_signup` fires `AFTER INSERT ON auth.users` — shared infra, not gated by branch — and `supabase_auth_admin`'s `search_path` is hardcoded to `auth` only (`pg_roles.rolconfig`, confirmed), so the trigger's unqualified `credit_coins(...)` call can't resolve. The unhandled exception aborts the whole `auth.users` INSERT, meaning **every new user signup currently fails outright** in production (not just "no wallet" — the account itself is never created). Existing users/logins are unaffected (login doesn't INSERT into `auth.users`). Last successful signup in prod: 2026-06-19 (predates this finding by a month — no confirmed real casualty, but any signup attempted since would very likely fail). Fix is a self-contained `DROP FUNCTION`/`CREATE OR REPLACE`, no data touched: `supabase/migrations/226_fix_credit_coins_overload_and_wallet_trigger.sql`. **User decision 2026-07-18: hold — pilot ends in ~24h, apply at cutover** (see row 9 below and Phase 2 step 6a). Full detail: [TRACKER.md](TRACKER.md) row 28. **If a real user needs to sign up before cutover, this stops being a "deal with it later" item — escalate immediately and consider applying 226 early** (it's low-risk and isolated; there's no reason it strictly has to wait for the merge window other than the user's stated preference to batch it).
- **No PITR, no staging, no dump tooling on this machine** (Docker broken). PITR enablement is Phase 0's most important action.

### 🐛 Known code bug (not a migration) — confirmed live in prod, fix written + verified locally, deferred to cutover

- **`resolve_bet()` statement-ordering bug, confirmed 2026-07-18 via the new `tests/unit/` harness** (`tests/unit/bet.test.js`, test 4 — intentionally written to encode the *correct* behavior and left failing on purpose, with a header comment explaining why). The function calls `aggregate_league_member_points()` for each new winner **before** it UPDATEs `bet_instances.status` to `'resolved'`. `aggregate_league_member_points` sums bet rewards `WHERE bi.status='resolved'`, so at call time the bet is still `'open'`/`'closed'` and the immediate re-aggregation silently sums to 0 instead of the reward value.
- **Impact**: cosmetic/staleness only, not data loss — `league_members.total_points` for the winning manager doesn't reflect the bet reward the instant `resolve_bet` runs. It self-corrects the next time *any* other event re-aggregates that user (next scoring pass, `set_captain`, `set_lineup`), so in practice the lag is usually short, but it is a real, currently-live prod bug on `main`.
- **Fix written and verified locally 2026-07-19**: `supabase/migrations/232_fix_resolve_bet_points_ordering.sql` — reorders `resolve_bet` so `UPDATE bet_instances SET status='resolved', ...` now runs immediately after `v_winners` is computed and `bet_submissions` is updated, but *before* the budget UPDATE / points-type `aggregate_league_member_points()` loop / audit-log loop. Same shape as migration 226 — `CREATE OR REPLACE FUNCTION`, identical signature, no data migration. Applied to the local Docker rebuild and verified two ways: (1) full `tests/unit/*.test.js` suite (32 tests, 7 suites) now passes 100% clean, including the previously-intentionally-failing test 4; (2) a direct RPC simulation — inserted a real `bet_submissions` row, called `resolve_bet(...)` under a simulated commissioner JWT (`SET LOCAL request.jwt.claim.sub`, the same mechanism PostgREST uses per-request), and confirmed `league_members.total_points` for the winner jumped to the full reward value **inside that single call**, with no follow-up aggregation event needed — then rolled the transaction back, leaving the seed DB untouched.
- **Decision (2026-07-18, user call): hold — do not touch prod for this now.** Nothing about the pilot may be touched while it's live. This still stands — migration 232 exists and is verified but **NOT applied to prod**. Apply it **immediately after the pilot ends**, most naturally bundled into the cutover's DB-actions step (Phase 2 step 6a, alongside 218/219/226) since none of these touch the pilot's live data, or as a standalone `main`-branch bug-fix session before cutover if it's cleaner to land separately — either way, do it before relying on `resolve_bet` for any post-pilot production bet.
- Tracked for follow-up in §2 🟢 POST-MERGE below.

---

### 🧪 Local backend dry run (2026-07-19) — validated migrations 218/219/226/217 + Edge Functions against a clean rebuild, NOT prod

**Scope**: this was a Docker-based local Supabase rebuild (fresh `db reset` + full migration replay), never touching the linked prod project. It validates that the pending changes are mechanically sound; it is **not** a substitute for the UI-driven Phase 3B smoke passes (§2 row 6), which still need to run against real browser flows.

- **Migrations 218, 219** — apply cleanly to a clean rebuild, no issues. Confirms the "pure DDL" characterization in §1.
- **Migration 226** — applied cleanly; re-validated end-to-end via `scripts/p2p-load-test.js` (50-user concurrent P2P run, all balance/escrow reconciliation checks passed). One methodology gotcha along the way: the local rebuild's base snapshot (`supabase/schema.sql`) is a `public`-schema-only dump, so it silently omits `trg_create_wallet_on_signup` (the trigger lives on `auth.users`) even though the underlying function is present — the first load-test run failed with `WALLET_NOT_FOUND` for this reason, not because of a real defect. Recreating the trigger to match migration 202's original definition fixed it. **Any future local rebuild used to test signup/wallet behavior needs this trigger added back manually** — flagging so the next person doesn't waste time on the same false alarm. No new information about 226's prod-readiness beyond what §1 already states; the hold decision stands.
- **Migration 217** — confirmed the `ALTER TABLE ... SET NOT NULL` statements apply cleanly once orphan rows have a `circle_id`. Tested against this local DB's own orphans (2 `TEST_`-prefixed dummy leagues, unrelated to and much smaller than prod's 18/7 real orphans) after backfilling them into a placeholder circle. This validates the migration's *mechanics* only — it does **not** touch, resolve, or shortcut the real clubhouse-mapping decision for the 7 real pilot leagues in §3, which remains open and prod-blocked exactly as documented.
- **`tests/unit/*.test.js`** — full suite green against the rebuilt DB, including the intentionally-failing `bet.test.js` test 4 (confirms the `resolve_bet` ordering bug above is still present and correctly encoded).
- **Local-tooling gotcha: `tests/unit/setup.js`'s default `TEST_DATABASE_URL` targets port 5432, but this Docker container (`supabase_db_sssmvihxtqtohisghjet`) exposes Postgres on host port **54322** (confirmed via `docker port supabase_db_sssmvihxtqtohisghjet`, the standard Supabase-CLI local-dev convention).** Running `node --test tests/unit/*.test.js` with no override fails every test with `ECONNREFUSED` on `::1:5432`/`127.0.0.1:5432` — not a code defect. Always set `TEST_DATABASE_URL="postgresql://postgres:postgres@localhost:54322/postgres"` explicitly when running this suite against the local rebuild. (Same "false alarm, note it for next time" spirit as the `trg_create_wallet_on_signup` and `config.toml` gotchas above.)
- **Bets UI dry-run pass (2026-07-19, special-focus item) — `resolve_bet` fix written and verified, held from prod per standing decision.** See "🐛 Known code bug" above for the full root-cause/fix writeup (migration `232_fix_resolve_bet_points_ordering.sql`). Verification done two ways against the local rebuild: (1) `tests/unit/bet.test.js` test 4 flips from intentionally-failing to passing, and the full 32-test suite across all 7 suites stays green with zero regressions; (2) a direct RPC simulation — wrapped in `BEGIN...ROLLBACK` so no seed data was permanently changed — inserted a real `bet_submissions` row against the seeded points-type bet in `TEST_Classic_League`, then called `resolve_bet(...)` under `SET LOCAL request.jwt.claim.sub` / `SET LOCAL role='authenticated'` (the same auth context PostgREST establishes for a real commissioner API call), and confirmed `league_members.total_points` for the winning manager updated to the full reward value **inside that single call**, with `resolve_bet` returning `{"ok":true,"winners":1,"total":1,"no_winner":false,"submissions_updated":1}`. Classic-bet UI flow was judged sufficiently proven by this RPC-layer test (identical code path/auth mechanism the real UI uses) — did not additionally re-verify via a live browser session, since the dry-run test account (`dryrun.tester`) has no `league_members` rows and setting up a full league/bet chain solely to re-confirm an already-proven fix wasn't worth the setup cost. **P2P Coin Challenges (`resolve_p2p_challenge`) UI testing was not attempted** — same blocker, needs a second manager in the same football league to test challenge/accept/escrow/payout. **Fix remains local-only, per the standing hold decision — NOT applied to prod.**
- **Edge Functions served locally** (`npx supabase functions serve`) and smoke-tested with curl against real seeded rows: `calculate-scores` (ran end-to-end against a seeded fixture, handled "no events yet" gracefully), `ingest-match-events`, `process-transfer`, `score-f1-race`, `score-tennis-tournament`, `purchase-coins`, `resolve-bets`, `run-draft-lottery`, `sync-fixtures`, `check-cron-health` — all booted cleanly and returned correct, well-formed responses (param validation, auth checks, expected "disabled"/"not configured" states). No crashes, no import errors.
- **New finding (fixed locally, uncommitted): stale `supabase/config.toml` entry.** `[functions.test-forza-api]` pointed at `./functions/test-forza-api/index.js`, a directory that no longer exists in the repo. This isn't a v2/prod risk (dev tooling config only) but it made `npx supabase functions serve` fail to start **at all** — for every function, not just the missing one — since the CLI precompiles the full function set before serving any of them. Removed the dead block from `config.toml` so local Edge Function dry runs are possible again. Needs to land in a normal PR; harmless to merge any time.
- **F1 and Tennis modules have zero seed data in this local rebuild** — the functions were confirmed to boot and validate input correctly, but a true end-to-end scoring smoke test (real tournament/race data → picks → result entry → score verification) wasn't possible locally without building synthetic season data, which was out of scope for this pass. That gap is exactly what §2 row 6's manual Phase 3B smoke passes are for — this dry run doesn't close that checklist item.

---

## 2. Open work classification

### 🔴 PRE-MERGE — CRITICAL (gates; do not open the v2→main PR until all ✅)

| # | Item | Status |
|---|------|--------|
| 1 | Fix v2 CI (lock file + checksum line endings) | ✅ PR #720 (2026-07-17) — all 6 CI jobs green, incl. Unit + E2E for the first time on v2 |
| 2 | Final main→v2 sync (14 commits; migration 196→222 renumber; BACKLOG.md conflict) | ✅ PR #721 (2026-07-17) |
| 3 | **Clubhouse mapping decision (✅ resolved 2026-07-23 — keep all 7 leagues, see §3) + write/apply the `223_` backfill migration** | ⬜ decision resolved; migration not yet written — needs per-item approval before writing/applying |
| 4 | **Enable PITR on prod Supabase project** (Dashboard → Database → Backups → PITR; needs Pro plan add-on) | ⬜ Supabase-linked PC / dashboard |
| 5 | Full DB backup at cutover (`pg_dump` via connection string from the Supabase-linked PC, or dashboard backup) | ⬜ at Phase 1 |
| 6 | Phase 3B smoke passes: platform.spec ✅ (262/262 on 2026-07-17) · football · P2P (`MOCK_PAYMENTS=true`) · F1 · tennis | ⬜ football/P2P/F1/tennis manual passes at Phase 3 |
| 7 | Access-blocking mechanism chosen & tested | ✅ **resolved 2026-07-23**: Vercel Password Protection is Pro/Enterprise-only (confirmed — not on this account's Hobby plan), so the custom maintenance-mode middleware is the mechanism. `middleware.js` merged to `main` via PR #736 (2026-07-23) — dormant by default (`MAINTENANCE_MODE` unset), activates only when that env var is set to `"true"` in Vercel + redeployed. See §4 Phase 1 step 2 and §6. |
| 8 | Verify migration 221 vs main's 195 in prod | ✅ 2026-07-17 — prod `sync_cup_eliminations` contains the v2 shootout logic; 221 stamped APPLIED, do not re-apply |
| 9 | **Apply migration 226 — fixes signup-breaking `credit_coins()`/`_create_user_wallet()` bug, CONFIRMED live in prod** | ⬜ **held by user 2026-07-18, apply at Phase 2 step 6a** — see §1 Database note above and [TRACKER.md](TRACKER.md) row 28. Escalate/apply early if a real signup is needed before cutover. |
| 10 | `create_league()` overload ambiguity (migration 229, TRACKER row 31) — possibly already live-broken on `main` (migration 215's ambiguous overload is already in prod; `main`'s `LeagueScreen.jsx` sends the exact param shape that reproduces it locally). | ✅ **decision 2026-07-19: no separate verification — pilot ends in ~12h, not worth investigating pre-merge.** Just include migration 229 in the normal Phase 2 step 6a DB-actions bundle; it's a pure `DROP FUNCTION` on a stale overload, safe regardless of whether it was already broken on `main`. |

### 🟡 PRE-MERGE — RECOMMENDED (not blocking)

- ✅ Migration folder dedupe on v2 — done 2026-07-17 (see §1 Git note).
- **Migrations 227/228/230/231** (Tennis `get_my_circles()` RPC, Tennis leaderboard `user_id` ambiguity, Clubhouse `circle_members` RLS recursion, `clubhouse_messages` realtime) — all found during the 2026-07-19 Tennis/Chat UI dry run, all v2-only (no shared function/table with `main`), zero pilot exposure either way. Bundle at Phase 2 step 6a alongside 218/219/226 for convenience — not gated on anything. See [TRACKER.md](TRACKER.md) rows 29/30/32/33.
- `000_baseline.sql` schema snapshot (Phase 1D-B): `pg_dump --schema-only` from the Supabase-linked PC at cutover — the exact pre-merge schema as revert reference.
- OPS-2 leftovers: `SENTRY_DSN` secret + Vercel `VITE_SENTRY_DSN` (TRACKER row 11) + the 6 function deploys (rows 20–25 — these happen anyway in Phase 2's deploy-all) + failed-cron alerting (part c, not built).
- Recover git stash `stash@{0}` ("backlog BI-01 close — needs to go on main"); prune ~6 local + ~12 remote stale `claude/*` branches; `git worktree prune` the 5 stale worktrees.
- SEC-4 (rotate GitHub PAT / SSH) — independent, do anytime.

### 🟢 POST-MERGE (deliberately after — most were 🔴 PILOT-IMPACTING and unblock the moment users are blocked)

- **Migration 217** — only after clubhouse backfill + stability window (§5 step 4).
- F1 data migration (row 16) · ARCH-1 trophy emission · ARCH-2 both halves (`forza_id`→`provider_key` migration goes to the next free number) · LOW-3 rate limits · `discover-tournament` redeploy (row 21 — happens in Phase 2 deploy-all anyway).
- DATA-1 schema baseline → OPS-1 staging project → DATA-RECON (all far easier post-merge).
- **`resolve_bet` statement-order fix (migration 232)** — total_points lag on bet resolution; see §1 "Known code bug" note above; confirmed via `tests/unit/bet.test.js`, held by user 2026-07-18, apply at Phase 2 step 6a alongside 218/219/226 (shared function with `main` — see [TRACKER.md](TRACKER.md) row 34, same risk class as row 28/migration 226, just lower urgency since the bug is cosmetic/self-correcting rather than blocking).
- P2P-LOAD · GDPR-2/3 · CODE-2/4/5/6 · DEPS-2 · INFRA-1 · LOW-2/9 · M0-BOTTOMSHEET · UX-DESKTOP-1.
- Business: Stripe confirmation · Forza licence transferability · GDPR-1 Groq DPA · meta-league formula · F1 scoring weights.
- main's P2/P3 backlog (B-07 league archive, B-08 multi-competition, B-01, B-04b).

---

## 3. 🟠 THE ONE OPEN PRODUCT DECISION — clubhouse mapping for the 7 pilot leagues

**Why this matters:** on v2, the Clubhouse is the room and every competition is a table inside it. The sidebar is the clubhouse spine; the competition top bar is populated by `get_clubhouse_competitions(circle_id)`. The 7 real pilot leagues have `circle_id = NULL` and their members belong to no clubhouse. After the merge, a returning pilot user would land on the **"create your clubhouse" lobby with an empty competition bar** — their league, points history, and trophies still exist in the DB and the routes (`/league`, `/squad`, `/recap`) still work if typed, but **nothing in the UI leads to them**. This is the single biggest UX-continuity risk of the cutover.

**The 7 leagues** (orphan snapshot: `backups/orphans_pre_217_20260629.json`; 11 more NULL rows are test/E2E leftovers, plus `TEST_1_F1` paddock and `TEST_WIMBLEDON_1` player box):
Mundial do Eder · Mundial Gordo Vai a Baliza · RANKS FC World Cup Fantasy · Draft Mundial 26 · Munaial '26 · FIXO DRAFT MUNDIAL 26 · Miami WC Fantasy Testers

**Decision options (superseded — see "Decided direction" below):**

| Option | What happens | Pros | Cons |
|--------|--------------|------|------|
| **A. One clubhouse per league** | Backfill migration creates one circle named after each league, sets `circle_id`, inserts every `league_members` row into `circle_members` (commissioner → clubhouse owner) | Zero user action needed; everyone returns to a working room; matches the "friends gather" vision 1-to-1 | If the same friend group ran 2 leagues they get 2 clubhouses (they can consolidate later) |
| **B. Merge overlapping member groups into shared clubhouses** | Analyse member overlap first; leagues sharing ≥N members share one clubhouse | Fewer, more natural rooms | Needs a manual review pass; naming is ambiguous; more complex migration |
| **C. Let users self-organise** | No backfill; pilot users see the create-clubhouse lobby; league discovery relies on them creating/joining and… nothing re-attaches old leagues automatically | No migration | **Breaks continuity — old leagues unreachable from UI. Not viable without extra "claim your league" code. Avoid.** |
| **D. Archive the pilot** | Pilot leagues stay orphaned; users start fresh in the new platform; history preserved in DB only | Simplest | Pilot users lose visible history/trophies — bad for the ~50 pilot users' trust |

**Decided direction (2026-07-17, user call):** a hybrid of B/D scoped down by a manual **data-cleansing pass at pilot end**, not a pure A/B/C/D pick:

1. The pilot ends ~2026-07-20 (WC final, ~3 days out from when this note was written). The user will then do a **big DB cleanup** by hand.
2. As part of that cleanup, the user selects **which subset of the 7 real pilot leagues to retain** for historical/reference purposes. The rest are cleaned out (deleted/archived) during the same pass, so they never need a `circle_id` at all.
3. The **retained leagues are consolidated into ONE new clubhouse** (not one clubhouse per league — this replaces Option A's 1:1 mapping for whatever subset survives the cleanup).
4. That single clubhouse doubles as the **immediate post-merge sanity-check dataset** — real historical pilot data the user can open right after the cutover to confirm the merge worked, without waiting on fresh v2 activity.

**✅ RESOLVED (2026-07-23, user call): keep all 7 real pilot leagues — no further pruning.** The data-cleansing pass ran today: 11 dummy/test leagues were deleted from prod (full row-data backups taken first per Pilot Safeguards, `backups/` — leagues/members/squads/squad_events/bet_instances/bet_submissions/gazette_entries/draft_submissions/auction_listings/auction_bids/trade_proposals for each deleted league). Post-delete verification confirms exactly 7 leagues remain: **Mundial do Eder · Mundial Gordo Vai a Baliza · RANKS FC World Cup Fantasy · Draft Mundial 26 · Munaial '26 · FIXO DRAFT MUNDIAL 26 · Miami WC Fantasy Testers.** The user is keeping all of them — "which subset to retain" (point 2 above) is answered as "all of them," not a further-pruned list.

**What this unblocks:** the backfill migration (next free number, `223_`) can now be written targeting **all 7 leagues**, consolidating them into the single new clubhouse per point 3 above, followed by migration 217 (`circle_id NOT NULL`). The 11 test-league orphans (unrelated to the 7 real leagues) still need their own delete-vs-map call at Phase 4 step 3 (§7 Q5). **Not yet done:** the `223_` backfill migration itself hasn't been written — per CLAUDE.md, do not write or apply it without naming it explicitly and getting per-item approval in a live session.

---

## 4. The runbook

### Phase 0 — NOW, while the WC finishes (all 🟢 zero pilot risk)

1. ✅ ~~Fix v2 CI~~ (PR #720).
2. ✅ ~~Final main→v2 sync~~ (2026-07-17; repeat step is built into Phase 2 in case late pilot fixes land).
3. ⬜ **Enable PITR** on `sssmvihxtqtohisghjet` (dashboard). Do this immediately — it protects the pilot's final rounds too.
4. ⬜ **Retained-leagues list is finalized** (§3 — resolved 2026-07-23: all 7 leagues, no further pruning; the 11 dummy/test leagues were already deleted from prod today, backups taken) → write the clubhouse backfill migration (`223_`) on v2 targeting all 7 (do not apply; applies in Phase 2 step 6c — step 6b's data-cleansing is now already done, nothing further to clean).
5. ✅ Migration dedupe done 2026-07-17. Still optional: OPS-2 part (c), Sentry secrets, git hygiene, stash recovery.

### Phase 1 — Pilot ends: freeze & block

1. Confirm the final WC round settled: `roundComplete` gazette entries exist and `round_backups` has the final round's row (§7 Q3).
2. **Block access — maintenance-mode middleware**: Vercel dashboard → Project → Settings → Environment Variables (Production) → set `MAINTENANCE_MODE="true"` and `MAINTENANCE_BYPASS_TOKEN=<random secret>` → `vercel deploy --prod` (env var changes need a redeploy to take effect, per `.env.example`). Blocks page loads with a branded "work in progress" screen; commissioner/tester access via `https://<domain>/unlock?token=<the secret>` (sets a 30-day bypass cookie). To reopen: set `MAINTENANCE_MODE="false"` (or remove it) and redeploy. Does **not** block direct Supabase REST/Realtime calls from a browser that already holds the anon key — page-load gating only.
3. Full DB backup from the Supabase-linked PC: `pg_dump "$(npx supabase --linked db url 2>/dev/null || echo '<connection string from dashboard>')" > backups/pre_cutover_$(date +%Y%m%d).sql` — or a dashboard-triggered backup. Save the `cron.job` list too (§7 Q4).
4. Optional: `000_baseline.sql` schema-only dump (Phase 1D-B) while you're there.
5. Crons can stay running — with no live fixtures the scoring/sync crons no-op.

### Phase 2 — Merge

1. On v2: `git fetch origin main && git merge origin/main` (should be empty or trivial — any late pilot fixes; renumber any new main migration to the next free v2 number).
2. Local gates on v2: `npm run lint` · `npm run build` · `npx madge --circular src/` · `npx playwright test`.
3. Open PR **`v2` → `main`**. CI runs the full suite on the PR.
4. **Merge with a MERGE COMMIT, not squash.** 151 commits / ~79k lines: a merge commit gives one-command revert (`git revert -m 1 <sha>`) and preserves v2 history for bisecting. This intentionally deviates from the repo's squash habit — record the merge SHA in the TRACKER.
5. Vercel auto-deploys behind the maintenance-mode wall (already merged, just needs `MAINTENANCE_MODE="true"` + redeploy per Phase 1 step 2). Verify the deployment builds.
6. DB actions from the Supabase-linked PC (per-item approval as usual):
   a. Apply 218, 219, **226**, **227, 228, 229, 230, 231, 232** (pure DDL/`CREATE OR REPLACE`, no data — TRACKER rows 29–34, found during the 2026-07-19 Tennis/Chat/Bets dry run). ~~Verify 221~~ ✅ done 2026-07-17 — already live. **226 fixes a confirmed signup-breaking bug (§1 Database note, TRACKER row 28) — do not skip this one**, and if it hasn't already been applied earlier (see §2 row 9 — it can be applied any time before this step if a real signup is needed sooner), apply it here at the latest. **232 fixes a confirmed live `resolve_bet` bug shared with `main` (TRACKER row 34)** — same rationale, lower urgency (cosmetic/self-correcting, not blocking). 227/228/230/231 are v2-only and purely additive/corrective — no ordering constraints, apply anytime in this step. 229 needs no pre-check per row 10 above — just run it.
   b. ✅ ~~Data cleansing (user-led)~~ — **done 2026-07-23**: user reviewed the 18 NULL-`circle_id` leagues and kept all 7 real pilot leagues; the 11 dummy/test leagues were deleted (backups taken first, per-table, `backups/dummy_*_pre_delete_20260723.json`). Nothing further to clean here — this step is now a no-op, kept for audit-trail continuity.
   c. Run the **clubhouse backfill** (`223_`), scoped to all 7 retained leagues, consolidating them into **one new clubhouse** (not one per league — see §3). This clubhouse is also the post-merge sanity-check dataset used in Phase 3 step 2.
   d. **Hold 217** until Phase 4 step 3 (needs a zero-orphan check first — §7 Q5 — which now only has to account for the non-retained leagues being gone, not mapped).
7. **Deploy ALL 19 Edge Functions** — the authoritative list is `.function-checksums.json` (don't trust older hand-written lists):
   `auto-open-transfer-window calculate-relaxation calculate-scores discover-tournament eliminate-cup-club generate-frontpage-edition ingest-match-events process-transfer purchase-coins resolve-bets run-draft-lottery run-reverse-standings-draft score-atp-finals score-f1-race score-tennis-tournament sync-fixtures sync-player-status sync-players sync-tennis-players`
   Then `npm run update:checksums` + commit.
8. Secrets/env: `SENTRY_DSN` (Supabase) · `VITE_SENTRY_DSN` (Vercel, then `vercel deploy --prod`) · confirm `VITE_AUTH_ENABLED=true` still present.

### Phase 3 — Test behind the wall

1. `platform.spec.js` already ran in the PR's CI; re-run locally if anything was deployed after the merge.
2. Manual smoke passes (Phase 3B checklist): **football** (login as a real pilot user whose league was retained in the Phase 2 data cleansing — verify squad, points history, trophies, and that their league appears inside the new consolidated clubhouse; this is the sanity-check dataset from §3) · **P2P** (wallet → mock coins → challenge → resolve) · **F1** (paddock → picks → test result → scores) · **tennis** (picks → result → scores).
3. `SELECT * FROM cron_job_status();` — no failing jobs.
4. Watch Sentry / `edge_function_errors` for anything new.

**Abort criteria → go to §5:** football pilot data wrong (points/squads/trophies), auth broken, any crash-loop screen, cron failures on the football spine.

### Phase 4 — Reopen (or revert)

1. Set `MAINTENANCE_MODE="false"` (or remove the var) in Vercel Production env vars, `vercel deploy --prod`. Announce.
2. Stability window (suggest 3–7 days) with Sentry watch.
3. Then, and only then: apply **migration 217** (pre-flight orphan check §7 Q5 must return zero rows first — the backfill in Phase 2 handles the 7 real leagues; decide delete-vs-map for the 11 test orphans at the same time).
4. Start the post-merge queue (§2 🟢).

---

## 5. Revert playbook (escalating; stop at the first level that fixes it)

| Level | Action | Scope restored | Cost |
|-------|--------|----------------|------|
| 1 | Vercel dashboard → Deployments → previous production deployment → **Promote to Production** | Frontend only | Instant, nothing else touched |
| 2 | `git revert -m 1 <merge-sha>` on `main` (via PR) → Vercel auto-deploys old app | Frontend + repo state | Minutes; v2 stays intact for a retry |
| 3 | Redeploy Edge Functions from the reverted tree (`git checkout <pre-merge-sha> -- supabase/functions` on a branch, or deploy from the reverted main) | Backend functions | The old function code is all in git |
| 4 | DB, targeted: the additive migrations are pilot-proven and can stay; the only cutover-specific writes are the clubhouse backfill (nullable column — `UPDATE ... SET circle_id = NULL` + delete the created circles) and 217 (`ALTER TABLE ... ALTER COLUMN circle_id DROP NOT NULL`) | Data | Small, scripted |
| 5 | **PITR restore** to the pre-cutover timestamp | Everything | Last resort — loses any writes since the restore point; only exists if Phase 0 step 3 was done |

Key design choices that make this safe: **additive first, constraint (217) last, PITR before anything, merge commit not squash.**

---

## 6. Access-blocking decision record

**✅ RESOLVED (2026-07-23): custom maintenance-mode middleware**, not Vercel Password Protection.

Verified 2026-07-23: Vercel Password Protection requires Pro + the Advanced Deployment Protection add-on (~$150/mo) or Enterprise — it is **not** available on the Hobby (free) plan this project is on. Hobby's "Vercel Authentication" only gates *preview* deployments, not production. So the originally-recommended approach doesn't work here.

Built instead: Vercel Edge Middleware (`middleware.js`, root of the repo) that gates every production page load behind a branded "work in progress" screen when `MAINTENANCE_MODE="true"` (Production env var), with a cookie-based bypass at `/unlock?token=<MAINTENANCE_BYPASS_TOKEN>` for commissioners/testers. Merged to `main` via PR #736 (2026-07-23) — dormant until the env var is set, so merging it carried zero pilot risk. Needs a `vercel deploy --prod` both to activate (Phase 1 step 2) and to deactivate (Phase 4 step 1). Config documented in `.env.example`. Does not block direct Supabase API calls — page-load gating only, same limitation any client-side approach would have.

---

## 7. Verification queries (run with `npx supabase db query --linked`)

```sql
-- Q1: is migration 221 / main's 195 (sync_cup_eliminations v2) live?
SELECT proname, md5(prosrc) FROM pg_proc WHERE proname = 'sync_cup_eliminations';
-- compare prosrc against supabase/migrations/221_sync_cup_eliminations_v2.sql

-- Q2: member overlap between the 7 pilot leagues (for the §3 decision)
SELECT l1.name, l2.name, COUNT(*) AS shared_members
FROM league_members m1 JOIN league_members m2 ON m1.user_id = m2.user_id AND m1.league_id < m2.league_id
JOIN leagues l1 ON l1.id = m1.league_id JOIN leagues l2 ON l2.id = m2.league_id
WHERE l1.circle_id IS NULL AND l2.circle_id IS NULL AND l1.name NOT LIKE 'TEST%' AND l2.name NOT LIKE 'TEST%'
GROUP BY 1,2 ORDER BY 3 DESC;

-- Q3: final round settled?
SELECT matchday_id, created_at FROM round_backups ORDER BY created_at DESC LIMIT 3;
SELECT league_id, full_data->>'matchday_id' FROM gazette_entries WHERE entry_type='activity' ORDER BY created_at DESC LIMIT 10;

-- Q4: cron snapshot (save before cutover)
SELECT jobname, schedule, active FROM cron.job ORDER BY jobname;

-- Q5: pre-217 orphan check (must be zero rows before applying 217)
SELECT 'leagues' t, id, name FROM leagues WHERE circle_id IS NULL
UNION ALL SELECT 'paddocks', id, name FROM paddocks WHERE circle_id IS NULL
UNION ALL SELECT 'player_boxes', id, name FROM player_boxes WHERE circle_id IS NULL;
```

---

## 8. Fresh-session pickup guide

To resume this work cold: (1) confirm session type = **platform revision (v2)**; (2) read this file top to bottom; (3) check [TRACKER.md](../TRACKER.md) for anything newer; (4) find the current phase — the first unchecked ⬜ in §2-critical / §4 — and continue from there. The §3 decision is **resolved** (2026-07-23 — keep all 7 leagues); what's still open is writing the `223_` backfill migration itself (Phase 0 step 4 / Phase 2 step 6c) — do not write or apply it without per-item approval in a live session.

Related: [TRACKER.md](../TRACKER.md) · [V2_BRANCH_PROTECTION.md](architecture/V2_BRANCH_PROTECTION.md) · [CLUBHOUSE_CENTRIC_REDESIGN_IMPLEMENTATION_PLAN.md](architecture/CLUBHOUSE_CENTRIC_REDESIGN_IMPLEMENTATION_PLAN.md) · Phase 3B checklist in TRACKER · `backups/orphans_pre_217_20260629.json`

Last Updated: **2026-07-23** (✅ §2 row 7 / §6 access-blocking mechanism resolved — Vercel Password Protection confirmed unavailable on this account's Hobby plan (Pro+add-on or Enterprise only); switched to the custom `middleware.js` maintenance-mode gate, merged to `main` via PR #736, dormant until `MAINTENANCE_MODE="true"` is set + redeployed. §4 Phase 1 step 2, Phase 2 step 5, Phase 4 step 1, §6 all updated. **The v2→main merge itself was explicitly NOT performed this session** — critical gates (§2 rows 3-6, 9: `223_` migration unwritten, PITR not enabled, no cutover backup, Phase 3B smoke tests not run, migration 226 not applied) remain open; user asked to "proceed with the main deploy from v2" but this was declined per CLAUDE.md's merge-gate rule pending those items.)

Previous: **2026-07-23** (✅ §3 clubhouse decision resolved — user confirmed keeping all 7 real pilot leagues, no further pruning. Data-cleansing pass executed same day: 11 dummy/test leagues deleted from prod with per-table backups (`backups/dummy_*_pre_delete_20260723.json`); verified exactly 7 leagues remain with original member counts. §2 row 3, §3, §4 Phase 0 step 4, §4 Phase 2 step 6b, §8 all updated to reflect this. `223_` backfill migration still not written — unblocked now, needs per-item approval before writing/applying.)

Previous: **2026-07-19** (🧪 local backend dry run — migrations 218/219/226/217 + `tests/unit/*` + `p2p-load-test.js` + 10 Edge Functions re-validated against a clean Docker rebuild, all clean; new local-only `supabase/config.toml` stale-entry fix (uncommitted); no change to any hold decision below. §1 "Local backend dry run" note. This does NOT satisfy §2 row 6's UI-level Phase 3B smoke passes — those still need a running frontend.)

Previous: **2026-07-18** (🐛 `resolve_bet` statement-ordering bug flagged — confirmed live on `main` via the new `tests/unit/bet.test.js` harness; total_points lags after bet resolution until an unrelated re-aggregation event. §1 "Known code bug" note, §2 🟢 POST-MERGE. User held it — no prod touch during the pilot; fix at cutover alongside the other DB actions.)

Previous: **2026-07-18** (🔴 migration 226 flagged — signup-breaking `credit_coins()`/`_create_user_wallet()` bug confirmed live in prod, not v2-only as first assumed; §1 Database, §2 row 9, Phase 2 step 6a. User held it — pilot ends in ~24h, apply at cutover. See [TRACKER.md](TRACKER.md) row 28 for full technical detail.)

Previous: **2026-07-17** (data-cleansing step + migration dedupe added same day, separate session)

Previous: **2026-07-17** (data-cleansing step + migration dedupe added same day, separate session)
