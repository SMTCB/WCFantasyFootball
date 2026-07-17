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
- **Pending apply**: 218 (no-cash-out constraint, pure DDL) and 219 (GDPR delete RPC, pure DDL) — that's all. 221 verified already live (main's `195`, 2026-06-30); 222 already live (main's `196`, 2026-07-12) — both stamped, do NOT re-apply. F1 data copy (TRACKER row 16) is separate manual work.
- **217 (`circle_id NOT NULL`)**: 🛑 blocked — apply only in Phase 4 (see §5) after the clubhouse backfill and a stability window.
- **No PITR, no staging, no dump tooling on this machine** (Docker broken). PITR enablement is Phase 0's most important action.

---

## 2. Open work classification

### 🔴 PRE-MERGE — CRITICAL (gates; do not open the v2→main PR until all ✅)

| # | Item | Status |
|---|------|--------|
| 1 | Fix v2 CI (lock file + checksum line endings) | ✅ PR #720 (2026-07-17) — all 6 CI jobs green, incl. Unit + E2E for the first time on v2 |
| 2 | Final main→v2 sync (14 commits; migration 196→222 renumber; BACKLOG.md conflict) | ✅ PR #721 (2026-07-17) |
| 3 | **Clubhouse mapping decision + backfill migration for the retained subset of the 7 real pilot leagues (post data-cleansing)** | ⬜ **USER DECISION — see §3** |
| 4 | **Enable PITR on prod Supabase project** (Dashboard → Database → Backups → PITR; needs Pro plan add-on) | ⬜ Supabase-linked PC / dashboard |
| 5 | Full DB backup at cutover (`pg_dump` via connection string from the Supabase-linked PC, or dashboard backup) | ⬜ at Phase 1 |
| 6 | Phase 3B smoke passes: platform.spec ✅ (262/262 on 2026-07-17) · football · P2P (`MOCK_PAYMENTS=true`) · F1 · tennis | ⬜ football/P2P/F1/tennis manual passes at Phase 3 |
| 7 | Access-blocking mechanism chosen & tested (recommended: Vercel password protection — §4 Phase 1) | ⬜ |
| 8 | Verify migration 221 vs main's 195 in prod | ✅ 2026-07-17 — prod `sync_cup_eliminations` contains the v2 shootout logic; 221 stamped APPLIED, do not re-apply |

### 🟡 PRE-MERGE — RECOMMENDED (not blocking)

- ✅ Migration folder dedupe on v2 — done 2026-07-17 (see §1 Git note).
- `000_baseline.sql` schema snapshot (Phase 1D-B): `pg_dump --schema-only` from the Supabase-linked PC at cutover — the exact pre-merge schema as revert reference.
- OPS-2 leftovers: `SENTRY_DSN` secret + Vercel `VITE_SENTRY_DSN` (TRACKER row 11) + the 6 function deploys (rows 20–25 — these happen anyway in Phase 2's deploy-all) + failed-cron alerting (part c, not built).
- Recover git stash `stash@{0}` ("backlog BI-01 close — needs to go on main"); prune ~6 local + ~12 remote stale `claude/*` branches; `git worktree prune` the 5 stale worktrees.
- SEC-4 (rotate GitHub PAT / SSH) — independent, do anytime.

### 🟢 POST-MERGE (deliberately after — most were 🔴 PILOT-IMPACTING and unblock the moment users are blocked)

- **Migration 217** — only after clubhouse backfill + stability window (§5 step 4).
- F1 data migration (row 16) · ARCH-1 trophy emission · ARCH-2 both halves (`forza_id`→`provider_key` migration goes to the next free number) · LOW-3 rate limits · `discover-tournament` redeploy (row 21 — happens in Phase 2 deploy-all anyway).
- DATA-1 schema baseline → OPS-1 staging project → DATA-RECON (all far easier post-merge).
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
2. As part of that cleanup, the user selects **which subset of the 7 real pilot leagues to retain** for historical/reference purposes — explicitly **not all seven**. The rest are cleaned out (deleted/archived) during the same pass, so they never need a `circle_id` at all.
3. The **retained leagues are consolidated into ONE new clubhouse** (not one clubhouse per league — this replaces Option A's 1:1 mapping for whatever subset survives the cleanup).
4. That single clubhouse doubles as the **immediate post-merge sanity-check dataset** — real historical pilot data the user can open right after the cutover to confirm the merge worked, without waiting on fresh v2 activity.

**Still open:** the exact list of which leagues to keep (user is deciding closer to pilot end). The backfill migration can't be finalized until that list exists — a fresh session should ask for it before writing the migration if it isn't already recorded here.

**What this unblocks:** the backfill migration (next free number, `223_`) targeting only the retained subset + migration 217 (`circle_id NOT NULL`) + deletion of both the non-retained real leagues and the 11 test-league orphans (same cleanup pass, §7 Q2 can help spot member overlap if useful context for picking the subset).

---

## 4. The runbook

### Phase 0 — NOW, while the WC finishes (all 🟢 zero pilot risk)

1. ✅ ~~Fix v2 CI~~ (PR #720).
2. ✅ ~~Final main→v2 sync~~ (2026-07-17; repeat step is built into Phase 2 in case late pilot fixes land).
3. ⬜ **Enable PITR** on `sssmvihxtqtohisghjet` (dashboard). Do this immediately — it protects the pilot's final rounds too.
4. ⬜ **Finalize the retained-leagues list** (§3 — the direction is decided, the specific list isn't yet) → write the clubhouse backfill migration on v2 targeting that subset (do not apply; applies in Phase 2 step 6c, after the Phase 2 step 6b data cleansing).
5. ✅ Migration dedupe done 2026-07-17. Still optional: OPS-2 part (c), Sentry secrets, git hygiene, stash recovery.

### Phase 1 — Pilot ends: freeze & block

1. Confirm the final WC round settled: `roundComplete` gazette entries exist and `round_backups` has the final round's row (§7 Q3).
2. **Block access — Vercel password protection**: Vercel dashboard → Project → Settings → Deployment Protection → enable **Password Protection** for Production. Zero code, instant on/off. (There is deliberately no in-app maintenance mode — don't build one for this.)
3. Full DB backup from the Supabase-linked PC: `pg_dump "$(npx supabase --linked db url 2>/dev/null || echo '<connection string from dashboard>')" > backups/pre_cutover_$(date +%Y%m%d).sql` — or a dashboard-triggered backup. Save the `cron.job` list too (§7 Q4).
4. Optional: `000_baseline.sql` schema-only dump (Phase 1D-B) while you're there.
5. Crons can stay running — with no live fixtures the scoring/sync crons no-op.

### Phase 2 — Merge

1. On v2: `git fetch origin main && git merge origin/main` (should be empty or trivial — any late pilot fixes; renumber any new main migration to the next free v2 number).
2. Local gates on v2: `npm run lint` · `npm run build` · `npx madge --circular src/` · `npx playwright test`.
3. Open PR **`v2` → `main`**. CI runs the full suite on the PR.
4. **Merge with a MERGE COMMIT, not squash.** 151 commits / ~79k lines: a merge commit gives one-command revert (`git revert -m 1 <sha>`) and preserves v2 history for bisecting. This intentionally deviates from the repo's squash habit — record the merge SHA in the TRACKER.
5. Vercel auto-deploys behind the password wall. Verify the deployment builds.
6. DB actions from the Supabase-linked PC (per-item approval as usual):
   a. Apply 218, 219 (pure DDL, no data). ~~Verify 221~~ ✅ done 2026-07-17 — already live.
   b. **Data cleansing (user-led)** — per §3's decided direction: user reviews the 7 real pilot leagues and picks which subset to retain for historical/reference purposes (not all 7). Non-retained leagues and their data are cleaned out here (confirm with the user exactly what "cleaned out" means — delete vs. archive-only — before running any DELETE; SELECT-first per the Pilot Safeguards in CLAUDE.md). Do this **after** the Phase 1 full DB backup so the pre-cleanup state is recoverable.
   c. Run the **clubhouse backfill**, scoped only to the leagues retained in step (b), consolidating them into **one new clubhouse** (not one per league — see §3). This clubhouse is also the post-merge sanity-check dataset used in Phase 3 step 2.
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

1. Remove the Vercel password. Announce.
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

**Recommended: Vercel Password Protection** (Production). Zero code, instant toggle, testable in 2 minutes, doesn't disturb deployments, and Phase 3 testers just enter the password.
Alternatives considered: `VITE_MAINTENANCE_MODE` splash (needs code + a redeploy each way; nothing exists in the codebase today) · pausing the Vercel project (blunt; blocks testers too). Note password protection may require a paid Vercel feature — verify on the account before Phase 1; fallback is the maintenance-flag splash (small PR).

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

To resume this work cold: (1) confirm session type = **platform revision (v2)**; (2) read this file top to bottom; (3) check [TRACKER.md](../TRACKER.md) for anything newer; (4) find the current phase — the first unchecked ⬜ in §2-critical / §4 — and continue from there. The §3 decision gates Phase 2 step 6c and Phase 4 step 3; if it's still open, ask the user before touching anything clubhouse-related.

Related: [TRACKER.md](../TRACKER.md) · [V2_BRANCH_PROTECTION.md](architecture/V2_BRANCH_PROTECTION.md) · [CLUBHOUSE_CENTRIC_REDESIGN_IMPLEMENTATION_PLAN.md](architecture/CLUBHOUSE_CENTRIC_REDESIGN_IMPLEMENTATION_PLAN.md) · Phase 3B checklist in TRACKER · `backups/orphans_pre_217_20260629.json`

Last Updated: **2026-07-17** (data-cleansing step + migration dedupe added same day, separate session)
