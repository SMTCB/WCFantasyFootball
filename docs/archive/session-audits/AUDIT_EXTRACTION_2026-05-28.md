# Audit File Extraction — May 24 Documents
**Date**: 2026-05-28  
**Action**: Analysis before archiving audit files from 2026-05-24  
**Result**: Items to be moved to BACKLOG, then archive originals

---

## ✅ UNIQUE INSIGHTS FOUND — Worth Preserving

### 1. CODE_REVIEW_REPORT (2026-05-16) — 10 Improvements + Corner Cases + Security Issues

**10 Actionable Improvements** (with effort estimates):
1. **N+1 user-metadata fetches on chat** (4h) — `useChatMessages` queries metadata per message; batch fetch + cache by user_id
2. **Over-fetching in league stats fallback** (1h) — Use aggregate SQL instead of fetching 1000 rows; `COUNT(*), SUM, AVG`
3. **Realtime subscription refetch storm** (3h) — Filter `bet_submission` channel by `bet_instance_id` server-side; merge locally
4. **Missing index on transfer lookup** (15m) — `CREATE INDEX idx_transfers_user_league ON transfers(league_id, user_id)`
5. **LeagueScreen too large** (1d) — 2273 lines; extract `useTradeHub()`, `useCommissionerActions()`, `useBettingHub()` hooks
6. **Duplicated position constants** (3h) — Consolidate `POS_ORDER`, `POS_LABEL`, `POS_TONE`, `POS_CONFIG` to `src/lib/formations.js`
7. **Position limits hardcoded in SQL trigger** (2h) — Parameterize from `league_config.position_caps` JSONB
8. **PlayerCard has 10+ props** (3h) — Introduce `PlayerCardContext` for captain/chip/joker selection state
9. **No production logging/alerting** (1d) — Add Sentry SDK to Edge Functions; wire `process-transfer`, `calculate-scores`, `ingest-match-events`
10. **RLS policy decisions undocumented** (2h) — Add comments to `DISABLE ROW LEVEL SECURITY` statements; create `docs/architecture/SECURITY.md`

**8 Corner Cases** (detailed in source; includes critical race conditions):
- Concurrent transfer race (same user, rapid clicks)
- Match event ingestion races (concurrent retry, DELETE/INSERT non-idempotent)
- Auction bid race at expiry (two bids within ms of deadline)
- Squad fetch silently returns empty on error
- League deleted while member viewing
- Notification unread count goes negative
- Bet submission near deadline boundary
- Cron jobs collide on matchday rollover

**3 Silent Errors** (including CRITICAL security):
- **Auction RLS allows seller spoofing** (CRITICAL) — INSERT policy doesn't verify `seller_squad_id` belongs to `auth.uid()`; players can be sold without owner consent
- Cross-table writes not transactional — `calculate-scores`, `ingest-match-events` can partially fail
- Forza API hanging stalls all Edge Functions (no timeout/retries)

### 2. OBSERVABILITY_STRATEGY_2026-05-24 — Concrete Design (Not Implemented Yet)

**Current gap**: ~15% done. `edge_function_errors` table exists (2 callers). Frontend/crons/most functions have no logging.

**Proposed design** (lightweight, no external SaaS):
- Single `error_logs` table (similar to existing `edge_function_errors`)
- 5-minute install per function: `logError(context, error)`
- Self-pruning via cron (old rows auto-delete)
- Pull-based (query when suspicious), not push (no email/Slack)

**Gap assessment**:
- ✅ Edge function errors table
- 🟡 Only 2 of 13 functions use `logError` helper
- 🔴 Frontend errors: none captured (ErrorBoundary only)
- 🔴 Cron failures: postgres `cron.job_run_details` not queried
- 🔴 Alerting: none
- 🔴 Dashboards: none

### 3. Deferred Sprint Items (marked "⏳ Sprint 1" in audits, not in BACKLOG)

**From LOGIC_AUDIT:**
- L2.1: `resolve_bet` validates `correct_answer` is in options
- L2.4: Auto-resolver Edge Function + cron
- L3.4: `rollupSquads` hard-fail on missing round_number / tournament_id
- L3.5: Captain-on-bench policy
- L3.7: `aggregate_league_member_points` filter to `reward_type='points'` only

**From UI_AUDIT:**
- U10: DraftRecoveryScreen — stop writing `matchday_id='current'`
- U11: SquadScreen.fetchSquad — filter by active matchday
- U6–U8, U12–U120: (80+ items deferred to Sprint 1+, not detailed here)

**From INGESTION_AUDIT:**
- I4: Unschedule duplicate orchestrator + hardcoded sync crons
- 2.4.b: sync-player-status set `_type='suspension'`
- 3.2: Bet TEMPLATE_UUID slug→id runtime lookup
- 3.3: BetCreatorPanel writes `scope_ref = fixture.id` for match_result
- 3.4: Schedule resolve-bets cron

---

## ❌ DUPLICATE / SUPERSEDED CONTENT

- **SPRINT_PLAN_2026-05-24** — Consolidated view of 310 findings; Sprints 0–4 now complete (as of 2026-05-25). Use BACKLOG instead going forward.
- **SUPABASE_HANDOFF** — Deployment guide; marked "✅ NO PENDING SUPABASE TASKS" as of 2026-05-28. Info moved to CLAUDE.md and BACKLOG.
- **HANDOFF_PROMPT** — Session template; copy content to CLAUDE.md Session Start Checklist if needed, then archive.
- **CODE_AUDIT_2026-05-24, LOGIC_AUDIT, UI_AUDIT, INGESTION_AUDIT** — Status tables show ✅ Sprint 0 complete, ⏳ Sprints 1+ deferred. Specific findings above should be extracted; audit files archived.

---

## RECOMMENDATION

**Move to BACKLOG.md:**
1. The 10 improvements from CODE_REVIEW_REPORT (with effort + priority)
2. The 8 corner cases (prioritize race conditions P1)
3. The 3 silent errors (auction RLS spoofing is CRITICAL)
4. The 5 deferred logic items (L2.1, L2.4, L3.4-3.7)
5. The 4 deferred ingestion items (I4, 2.4.b, 3.2-3.4)

**Move to docs/deployment/ or docs/architecture/:**
1. OBSERVABILITY_STRATEGY_2026-05-24 → `docs/deployment/OBSERVABILITY_STRATEGY.md` (actionable design)

**Archive (docs/archive/):**
1. CODE_AUDIT_2026-05-24.md
2. CODE_REVIEW_REPORT.md (after extracting items above)
3. LOGIC_AUDIT_2026-05-24.md
4. UI_AUDIT_2026-05-24.md
5. INGESTION_AUDIT_2026-05-24.md
6. SPRINT_PLAN_2026-05-24.md
7. SUPABASE_HANDOFF.md
8. HANDOFF_PROMPT.md

**Result**: Root folder cleaned, BACKLOG expanded with specific improvements, observability strategy preserved as guidance.

