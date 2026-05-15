# Code Review: Forza Fantasy League

**Review Date**: 2026-05-16
**Reviewer**: Claude Code (claude-opus-4-7)
**Scope**: Full stack — React 19 frontend, Supabase backend, Edge Functions, E2E tests, multi-competition readiness
**Methodology**: Parallel deep-dive across `supabase/migrations/`, `src/hooks/`, `src/screens/`, `src/components/`, `supabase/functions/`, `e2e/tests/`. Findings rated by severity and effort.

---

## Executive Summary

Forza Fantasy League is a **well-architected MVP** with strong frontend abstraction (competition-agnostic hooks, parameterized league config) but **partial multi-competition readiness at the schema and Edge Function layers**. The app is shippable for single-competition (EPL) production today; expansion to La Liga / Serie A or cross-league squads is **blocked by 6 schema gaps** and **4 UI hardcoding patterns** that need addressing.

**Top 3 Production Risks (must fix before scaling to 10k+ users):**
1. **Event idempotency gap** — `ingest-match-events` deletes-then-inserts events without conflict handling; concurrent runs can drop events.
2. **No Forza API timeouts/retries** — A hanging upstream API stalls every Edge Function indefinitely.
3. **RLS disabled on core tables** (`players`, `fixtures`, `leagues`, `squads`, `users`) — acceptable for alpha, unacceptable at production scale.

**Top 3 Multi-Competition Blockers:**
1. **`squads` table has no `tournament_id`** — Cannot hold cross-league players (CRITICAL refactor, ~40h).
2. **`transfers` table cannot validate cross-tournament ownership** — Critical for trade integrity.
3. **Cron jobs hardcode `tournament_id: "426"` (EPL)** — Adding a new competition requires manual migration.

**Overall Health**: 🟢 MVP-ready · 🟡 Production-ready with fixes · 🔴 Multi-competition requires architectural work

---

## 🟢 Improvements (Organized by Impact)

### Performance & Query Efficiency

#### Improvement 1: N+1 user-metadata fetches on realtime chat messages
- **File**: [`src/hooks/useChatMessages.js:159-165`](src/hooks/useChatMessages.js)
- **Severity**: Medium
- **Current State**: Each new message arriving via Realtime triggers a `supabase.from(...).single()` to fetch poster metadata.
- **Issue**: 50 incoming messages = 50 individual queries; on mobile, this also leaks AbortControllers when unsubscribing mid-fetch.
- **Recommendation**: Cache user metadata in a `useRef` keyed by `user_id`; deduplicate concurrent fetches via a `Set` of in-flight IDs. Batch-fetch user metadata on initial load.
- **Effort**: 4h

#### Improvement 2: Over-fetching in league stats fallback
- **File**: [`src/hooks/useLeagueStats.js:42-56`](src/hooks/useLeagueStats.js)
- **Severity**: Medium
- **Current State**: If the RPC fails, falls back to fetching ALL `league_members` rows.
- **Issue**: 1000-member league fetches 1000 rows just to compute averages.
- **Recommendation**: Use `SELECT COUNT(*), SUM(total_points), AVG(total_points)` aggregate; fall back only on aggregate failure.
- **Effort**: 1h

#### Improvement 3: Realtime subscription refetch storm
- **File**: [`src/hooks/useBets.js:68-90`](src/hooks/useBets.js)
- **Severity**: Medium
- **Current State**: Any `bet_submission` INSERT triggers a full `fetchBets()` refetch for the current league.
- **Issue**: 100 users submitting bets simultaneously = 100 cascade refetches.
- **Recommendation**: Filter Realtime channel by `bet_instance_id` server-side; locally merge new submissions into state without refetch.
- **Effort**: 3h

#### Improvement 4: Missing index on transfer lookup path
- **File**: [`supabase/migrations/`](supabase/migrations/) (recommend new migration)
- **Severity**: Low
- **Current State**: `transfers` table has no index on `(league_id, user_id)`; "transfer history" queries scan.
- **Recommendation**: `CREATE INDEX idx_transfers_user_league ON transfers(league_id, user_id);`
- **Effort**: 15min

### Code Quality / Maintainability

#### Improvement 5: LeagueScreen.jsx is doing too much (2273 lines)
- **File**: [`src/screens/LeagueScreen.jsx`](src/screens/LeagueScreen.jsx)
- **Severity**: Medium
- **Current State**: 40+ `useState` hooks managing league chrome, trades, commissioner forms, betting UI, leaderboards.
- **Issue**: Cognitive load is high; concurrent edits race; no clear state machine.
- **Recommendation**: Extract `useTradeHub()`, `useCommissionerActions()`, `useBettingHub()` custom hooks; convert tab views to lazy-loaded routes via React Router.
- **Effort**: 1d

#### Improvement 6: Duplicated position/formation constants across screens
- **Files**: [`src/screens/SquadScreen.jsx:32-35`](src/screens/SquadScreen.jsx), [`src/screens/MarketScreen.jsx:20-25`](src/screens/MarketScreen.jsx), [`src/screens/LiveScreen.jsx:13`](src/screens/LiveScreen.jsx), [`src/components/PlayerCard.jsx:7-12`](src/components/PlayerCard.jsx)
- **Severity**: Medium
- **Current State**: `POS_ORDER`, `POS_LABEL`, `POS_TONE`, `POS_CONFIG` defined independently in 4+ files.
- **Recommendation**: Create `src/lib/formations.js` exporting a single source of truth; sourced from `useLeagueConfig` (DB-driven) when a league is active.
- **Effort**: 3h

#### Improvement 7: Position limits hardcoded in SQL trigger
- **File**: [`supabase/migrations/04_transfer_window_enforcement.sql:88-91`](supabase/migrations/04_transfer_window_enforcement.sql)
- **Severity**: Medium (Architectural)
- **Current State**: `enforce_position_limit()` hardcodes `{"GK":2,"DEF":5,"MID":5,"FWD":3}` inside the trigger function.
- **Recommendation**: Parameterize from `league_config.position_caps` JSONB; fall back to constants only if not set.
- **Effort**: 2h

#### Improvement 8: PlayerCard has 10+ props — candidate for context
- **File**: [`src/components/PlayerCard.jsx`](src/components/PlayerCard.jsx)
- **Severity**: Low
- **Current State**: `player, isCaptain, isTripleCaptain, isJoker, onClick, isSelected, isSwapTarget, showIntelligence, action, variant`.
- **Recommendation**: Introduce `PlayerCardContext` for captain/chip/joker selection state; pass only `player` + `onClick` directly.
- **Effort**: 3h

### Documentation & Observability

#### Improvement 9: No production logging / alerting strategy
- **Files**: All Edge Functions in `supabase/functions/`
- **Severity**: High (Operational)
- **Current State**: `console.error` everywhere; nothing routed to Sentry/LogRocket/Logflare.
- **Recommendation**: Add Sentry SDK to Edge Functions (Deno-supported); wire critical paths (`process-transfer`, `calculate-scores`, `ingest-match-events`) to alert on failure.
- **Effort**: 1d

#### Improvement 10: RLS policy decisions undocumented
- **Files**: [`supabase/migrations/00_schema.sql`](supabase/migrations/00_schema.sql), various
- **Severity**: Low
- **Current State**: RLS is disabled on many tables with no inline rationale.
- **Recommendation**: Add comments on `ALTER TABLE ... DISABLE ROW LEVEL SECURITY` statements explaining why; track in `docs/architecture/SECURITY.md`.
- **Effort**: 2h

---

## 🟡 Corner Cases (Organized by Severity)

### Critical (could break the app)

#### Corner Case 1: Concurrent transfer race
- **Affected Area**: [`supabase/migrations/04_transfer_window_enforcement.sql:39-41`](supabase/migrations/04_transfer_window_enforcement.sql), [`src/hooks/useTransfer.js:60-110`](src/hooks/useTransfer.js)
- **Scenario**: User rapidly clicks "Buy Player A" and "Buy Player B"; or, two managers attempt to buy the same player simultaneously.
- **Current Behavior**: `enforce_transfer_window()` reads `transfers_remaining`, then UPDATEs — no row lock between. Optimistic UI may show transfer success while server rolls back.
- **Risk**: Budget debited twice, "transfers_remaining" goes negative, squad ends in inconsistent state.
- **Acceptance Criteria**: Either both transfers succeed serially (with budget checks) or one fails with clear "transfers remaining = 0" message; UI rolls back optimistic update on failure.
- **Test Case**: Two parallel `process-transfer` invocations for same `user_id`; expect one to succeed and one to fail with `TRANSFERS_EXHAUSTED`.
- **Fix**: Add `SELECT * FROM transfer_windows WHERE ... FOR UPDATE` in the trigger; add `isTransferring` guard in `useTransfer` to prevent double-fire from UI.

#### Corner Case 2: Match event ingestion races on retry
- **Affected Area**: [`supabase/functions/ingest-match-events/index.ts:351-355`](supabase/functions/ingest-match-events/index.ts)
- **Scenario**: Polling fires `ingest-match-events` while a previous run is still writing.
- **Current Behavior**: Each run DELETEs all events for the fixture then re-INSERTs — non-idempotent. Concurrent runs can lose events written between the DELETE of one and the INSERT of another.
- **Risk**: Goals/assists missing from scoring; user's fantasy points wrong.
- **Acceptance Criteria**: Two simultaneous runs produce the same final event set as one run.
- **Test Case**: Invoke function twice in parallel for same `forza_match_id`; assert event count is consistent.
- **Fix**: Use `INSERT ... ON CONFLICT (fixture_id, type, minute, player_id) DO NOTHING`; remove DELETE.

#### Corner Case 3: Auction bid race at expiry
- **Affected Area**: [`supabase/migrations/27_auction_listings.sql:87`](supabase/migrations/27_auction_listings.sql)
- **Scenario**: Two bidders click "Place Bid" within milliseconds of `ends_at`; a cron job is also auto-closing.
- **Current Behavior**: Both bids pass the `IF v_auction.ends_at < NOW()` check; one wins, the other's bid is silently lost when auction status flips to `sold`.
- **Risk**: User loses bid without explanation; budget reservation may leak.
- **Acceptance Criteria**: At most one bid succeeds at deadline; loser sees explicit "auction closed" error.
- **Fix**: `SELECT ... FOR UPDATE` in `place_bid()` RPC; cron job must use same lock when auto-closing.

### Common (degrades experience)

#### Corner Case 4: Squad fetch silently returns empty on error
- **Affected Area**: [`src/screens/SquadScreen.jsx:131-132`](src/screens/SquadScreen.jsx)
- **Scenario**: Network blip or Supabase 5xx; squad fetch fails.
- **Current Behavior**: UI shows `EMPTY_SQUAD`; user thinks they have no squad and may re-draft.
- **Fix**: Distinguish "loading", "loaded-empty", "load-failed" states; show retry banner.

#### Corner Case 5: League deleted while a member's app is open
- **Affected Area**: [`src/screens/LeagueScreen.jsx:769-770`](src/screens/LeagueScreen.jsx)
- **Scenario**: Commissioner deletes the league; member is viewing it on another device.
- **Current Behavior**: League name shows `'SYNCING...'` indefinitely; queries 404 silently.
- **Fix**: Realtime subscription on `leagues` DELETE event; redirect to `/leagues` with toast.

#### Corner Case 6: Notification unread count goes negative
- **Affected Area**: [`src/hooks/useNotifications.js:89-91`](src/hooks/useNotifications.js)
- **Scenario**: Same notification UPDATE fires twice via Realtime (e.g., `is_read: false → true → false`).
- **Current Behavior**: `prev - 1` is bounded by `Math.max(0, ...)`, so no negative — but the count is off by one.
- **Fix**: Track last-seen notification state in a ref; deduplicate UPDATE events by `(id, is_read)` pair.

#### Corner Case 7: Bet submission near deadline boundary
- **Affected Area**: [`supabase/migrations/28_bets_system.sql:174`](supabase/migrations/28_bets_system.sql)
- **Scenario**: User submits bet at `deadline_at` ± 1ms.
- **Current Behavior**: Server time comparison can accept or reject depending on clock skew.
- **Fix**: Lock the bet instance with `FOR UPDATE`; use a 100ms grace window with explicit boundary message.

#### Corner Case 8: Cron jobs collide on matchday rollover
- **Affected Area**: [`supabase/migrations/26_transfer_window_constraint_and_cron.sql:99-112`](supabase/migrations/26_transfer_window_constraint_and_cron.sql)
- **Scenario**: `run-draft-lottery` (15min cadence) and `auto-open-transfer-window` (2h cadence) fire within seconds of each other.
- **Current Behavior**: UNIQUE constraint prevents duplicate window rows; the second job silently fails with no retry.
- **Fix**: Make handlers idempotent (UPSERT not INSERT); log + alert on uniqueness violation rather than swallowing.

---

## 🔴 Silent Errors (Organized by Severity)

### Critical — Data Loss / Security

#### Silent Error 1: Auction RLS allows seller spoofing
- **Location**: [`supabase/migrations/27_auction_listings.sql:39-47`](supabase/migrations/27_auction_listings.sql)
- **Severity**: **CRITICAL** (Security)
- **Failure Mode**: INSERT policy checks `EXISTS league_members` but doesn't verify `seller_squad_id` belongs to `auth.uid()`. A league member can list ANY squad's player for auction.
- **User Impact**: Players can be sold without their owner's consent.
- **Detection Method**: SQL audit of policies; manual penetration test.
- **Root Cause**: RLS author assumed `seller_squad_id` would be self-supplied; no defense-in-depth.
- **Fix**:
  ```sql
  ALTER POLICY "league_members_can_insert" ON auction_listings
  USING (
    EXISTS (SELECT 1 FROM league_members WHERE league_id = NEW.league_id AND user_id = auth.uid())
    AND EXISTS (SELECT 1 FROM squads WHERE id = NEW.seller_squad_id AND user_id = auth.uid())
  );
  ```
- **Monitoring**: Add audit trigger logging seller_squad_id ≠ auth.uid() attempts.

#### Silent Error 2: Cross-table writes are not transactional
- **Location**: [`supabase/functions/calculate-scores/index.ts`](supabase/functions/calculate-scores/index.ts), [`supabase/functions/ingest-match-events/index.ts:415`](supabase/functions/ingest-match-events/index.ts)
- **Severity**: **HIGH** (Data Integrity)
- **Failure Mode**: `ingest-match-events` invokes `calculate-scores` fire-and-forget. If the invoke fails, events are written but scoring never runs.
- **User Impact**: Live scoreboard shows match goals but fantasy points don't update; standings out of date.
- **Detection Method**: Compare event count vs. fantasy_points row count per matchday; alert on divergence.
- **Root Cause**: No retry, no dead-letter queue.
- **Fix**: Await the invoke; on failure, write to a `pending_scoring_jobs` table; cron retries every minute with backoff.
- **Monitoring**: Alert if `pending_scoring_jobs` row age > 5 minutes.

#### Silent Error 3: Forza API hangs stall Edge Functions
- **Location**: Every Edge Function calling Forza API (all 5)
- **Severity**: **HIGH**
- **Failure Mode**: No timeout on `fetch()` calls. If Forza API hangs, function times out at Supabase's 60s limit, returning 504 with no useful error.
- **User Impact**: Live scores stale up to 60s before user sees failure; transfer market unresponsive.
- **Detection Method**: Function invocation duration > 30s should alert.
- **Fix**: Wrap every Forza call: `fetch(url, { signal: AbortSignal.timeout(10000) })`; add 3-retry exponential backoff on 408/429/5xx.
- **Monitoring**: Track Forza API p95 latency, error rate, retry count.

### High — Inconsistent State

#### Silent Error 4: Transfer load failure leaves takenMap empty
- **Location**: [`src/hooks/useTransfer.js:46-50`](src/hooks/useTransfer.js)
- **Severity**: High
- **Failure Mode**: `catch (err) { console.error(...) }` swallows the error; `takenMap` remains `{}`.
- **User Impact**: Squad screen shows zero "taken" players → user attempts to buy a player who is already owned → server rejects → confusing error.
- **Fix**: Add `takenMapError` state; surface in UI with a retry button.

#### Silent Error 5: Cron jobs hardcoded to EPL tournament_id
- **Location**: [`supabase/migrations/26_transfer_window_constraint_and_cron.sql:45,94`](supabase/migrations/26_transfer_window_constraint_and_cron.sql)
- **Severity**: High (Architectural)
- **Failure Mode**: `sync-player-status` and `sync-players-daily` use `tournament_id: "426"` literal.
- **User Impact**: Adding La Liga requires a new manual migration per cron job; easy to forget; new league has stale player data until noticed.
- **Fix**: Edge Function reads `SELECT forza_id FROM tournaments WHERE sync_enabled = true` and loops.

#### Silent Error 6: process-transfer uses global deadline query
- **Location**: [`supabase/functions/process-transfer/index.ts:42-45`](supabase/functions/process-transfer/index.ts)
- **Severity**: Medium (becomes High at multi-competition)
- **Failure Mode**: Queries `matchday_deadlines` without `tournament_id` filter; picks the first matching matchday regardless of which competition the squad belongs to.
- **User Impact**: Once 2+ tournaments are active, transfer windows enforced against the wrong deadline.
- **Fix**: Filter by `tournament_id` derived from the squad's league.

### Medium — Degraded Experience

#### Silent Error 7: Chat error swallowed without UI signal
- **Location**: [`src/hooks/useChatMessages.js:33-35,65-68`](src/hooks/useChatMessages.js)
- **Severity**: Medium
- **Failure Mode**: Unread count fetch fails; error logged only.
- **User Impact**: Badge stuck at old value; user misses new messages.
- **Fix**: Add `chatError` state; show "Chat unavailable" subtle toast.

#### Silent Error 8: useBets error not exposed to UI
- **Location**: [`src/hooks/useBets.js:51-56,96`](src/hooks/useBets.js)
- **Severity**: Medium
- **Failure Mode**: Error state is set but the hook doesn't return it; `squadId` missing from effect deps causes stale closure.
- **Fix**: Add `error` to return; add `squadId` to dependency array.

#### Silent Error 9: ErrorBoundary's audit log can fail silently
- **Location**: [`src/components/ErrorBoundary.jsx:30-43`](src/components/ErrorBoundary.jsx)
- **Severity**: Medium
- **Failure Mode**: `error_logs` insert fails (network/RLS); the boundary still renders its fallback but the crash is never recorded.
- **Fix**: Buffer to `localStorage` on insert failure; replay on next successful boot.

#### Silent Error 10: XSS surface in bet prompts
- **Location**: [`src/components/league/BetsTabHub.jsx:56`](src/components/league/BetsTabHub.jsx)
- **Severity**: Medium-High (Security)
- **Failure Mode**: `bet.prompt` rendered with React's default escaping — generally safe, but if anywhere it's passed to `dangerouslySetInnerHTML` or innerHTML, malicious commissioners could inject scripts.
- **Fix**: Audit all places `bet.prompt` flows; enforce server-side allowlist on bet creation (alphanumerics + basic punctuation, max length 200).

---

## 🏗️ Multi-Competition Architectural Readiness

### Schema & Data Model

#### Architecture Fit: Squads (CRITICAL BLOCKER)
- **Assessment**: ❌ Not ready for cross-league squads
- **Blocker(s)**: `squads` table has no `tournament_id`. Players from different tournaments share the same TEXT[] array with no disambiguation. If both EPL and La Liga have a player with `forza_id = 'p1'`, ownership is undefined.
- **Refactor Path**:
  1. Add `tournament_id TEXT NOT NULL REFERENCES tournaments(forza_id)` to `squads`.
  2. Backfill from `leagues.tournament_id`.
  3. Update UNIQUE constraint: `(league_id, user_id, matchday_id, tournament_id)`.
  4. Update all hooks/components to thread `tournament_id` through the player resolution path.
  5. For **cross-league mode** (Phase 3): change `squads.players` from `TEXT[]` to a `squad_players` join table with `(squad_id, player_forza_id, tournament_id)` composite key.
- **Timeline Estimate**: 40h (2 weeks with testing)

#### Architecture Fit: Transfers (CRITICAL BLOCKER)
- **Assessment**: ❌ Not ready
- **Blocker(s)**: `transfers` table joins `players` by ID only; trigger `enforce_position_limit()` cannot validate that `player_in` belongs to the squad's tournament.
- **Refactor Path**: Add `tournament_id` to `transfers`; update trigger to filter `players p ON p.id = pid AND p.tournament_id = NEW.tournament_id`.
- **Timeline Estimate**: 1 week

#### Architecture Fit: Scoring Layer (HIGH PRIORITY)
- **Assessment**: 🟡 Partial
- **Blocker(s)**: `calculate_player_points()` (migration 09) hardcodes EPL scoring rules (goal multipliers per position, clean sheet thresholds). New competitions can't have different point values without a code change.
- **Refactor Path**: Introduce `scoring_templates(tournament_id, position, event_type, points)`; rewrite `calculate_player_points()` to look up rules dynamically.
- **Timeline Estimate**: 2 weeks

#### Architecture Fit: League Config (READY)
- **Assessment**: ✅ Ready
- **Notes**: [`src/hooks/useLeagueConfig.js`](src/hooks/useLeagueConfig.js) already fetches per-league `position_limits`, `squad_size`, `budget_total` from DB. `COMPS` registry supports EPL/UCL/UEL/FAC. Falls back to sensible EPL defaults — these are overrides, not assumptions.

### API & Integration

#### Architecture Fit: Forza API Client (READY)
- **Assessment**: ✅ Ready
- **Notes**: `sync-fixtures`, `sync-player-status`, `ingest-match-events` all accept `forza_id` (tournament param). The integration is generic; only the **cron schedulers** hardcode EPL.

#### Architecture Fit: Multi-Provider API Layer (NOT STARTED)
- **Assessment**: ❌ Not ready
- **Blocker(s)**: All Edge Functions assume Forza Football API endpoint shapes. If La Liga is sourced from ESPN or Opta, there's no abstraction layer.
- **Refactor Path**: Introduce a `DataProvider` interface in Edge Functions with `forzaProvider`, `espnProvider`, etc. implementations. Tournament row gains a `provider` column.
- **Timeline Estimate**: 3 weeks

### Component Architecture

#### Architecture Fit: Hooks Layer (READY)
- **Assessment**: ✅ Ready
- **Notes**: All business-logic hooks (`useSquad`, `useLeague`, `useTransfer`, `useBets`, etc.) accept `leagueId` and source rules from `useLeagueConfig`. **No hardcoded EPL strings found in `src/hooks/`.**

#### Architecture Fit: Screen Components (PARTIAL BLOCKER)
- **Assessment**: 🟡 Partial
- **Blocker(s)**: Position arrays (`POS_ORDER`, `POS_LABEL`, `POS_TONE`) hardcoded in `SquadScreen.jsx:32-35`, `MarketScreen.jsx:20-25`, `LiveScreen.jsx:13`, `PlayerCard.jsx:7-12`.
- **Refactor Path**: Centralize in `src/lib/formations.js`; drive from `useLeagueConfig`.
- **Timeline Estimate**: 3 days

### Business Logic

#### Architecture Fit: Transfer Window Rules (PARTIAL)
- **Assessment**: 🟡 Partial
- **Blocker(s)**: Stored in `league_config` per league, but enforcement triggers reference fixed magic numbers.
- **Refactor Path**: Parameterize trigger functions; read from `league_config` JSONB.
- **Timeline Estimate**: 1 week

#### Architecture Fit: Draft Rules (READY)
- **Assessment**: ✅ Ready
- **Notes**: Draft logic is league-scoped; no tournament coupling.

#### Architecture Fit: Chip / Power-Tool Rules (READY)
- **Assessment**: ✅ Ready
- **Notes**: Joker / captain multipliers calculated per-squad in `rollupSquads()`; no league-pool assumption.

---

## 📋 Prioritized Action Plan

### Phase 1: Critical Fixes (Ship Before Production Scale) — ~3 weeks

| # | Item | File(s) | Effort | Why It Matters |
|---|------|---------|--------|----------------|
| 1 | Fix auction RLS seller spoofing | `27_auction_listings.sql` | 1h | Security: users can sell players they don't own |
| 2 | Add `ON CONFLICT DO NOTHING` to match_events insert | `ingest-match-events/index.ts:351-355` | 1h | Data integrity: concurrent ingest drops events |
| 3 | Add timeouts + retry to all Forza API calls | All Edge Functions | 4h | Reliability: API hang stalls everything |
| 4 | Make `ingest → calculate-scores` invoke awaitable + retryable | `ingest-match-events/index.ts:415` | 4h | Data integrity: scoring can silently skip |
| 5 | Add transfer race lock (`FOR UPDATE`) | `04_transfer_window_enforcement.sql` | 2h | Data integrity: double-spend risk |
| 6 | Fix transfer hook silent failure (`takenMap` empty on error) | `src/hooks/useTransfer.js:46` | 2h | UX: confusing "player already taken" errors |
| 7 | Enable RLS on `players`, `fixtures`, `leagues`, `squads`, `users`, `league_members` | New migration | 6h | Security: production readiness |
| 8 | Wire Edge Function errors to monitoring (Sentry or Logflare) | All Edge Functions | 1d | Observability: can't fix what you can't see |
| 9 | Add `FOR UPDATE` to `place_bid()` and auction auto-close | `27_auction_listings.sql` | 2h | Data integrity: bid race condition |

**Phase 1 Total**: ~3 weeks for one engineer; ~1 week with focused effort.

### Phase 2: Improvement & Refactor (Next 2–4 Weeks)

| # | Item | Effort | Unlocks |
|---|------|--------|---------|
| 1 | Add `tournament_id` to `squads` table + backfill + cascade updates | 2 weeks | Multi-competition |
| 2 | Add `tournament_id` to `transfers` + update validation triggers | 1 week | Multi-competition |
| 3 | Refactor cron jobs to loop over active tournaments | 3 days | Multi-competition (drop the hardcoded "426") |
| 4 | Centralize position constants in `src/lib/formations.js` | 3 days | Cleaner code; multi-competition prep |
| 5 | Extract `LeagueScreen.jsx` into hub + tab sub-components | 1 week | Maintainability |
| 6 | Cache user metadata in `useChatMessages` (eliminate N+1) | 4h | Perf at scale |
| 7 | Refactor `useBets` Realtime to merge in place (no refetch storm) | 3h | Perf at scale |
| 8 | Add error states + retry banners to fetch-heavy screens | 1 week | UX polish |
| 9 | Add E2E coverage for auth, late bets, multi-league switching | 3 days | Test confidence |

### Phase 3: Future-Proofing (Post-MVP)

| # | Item | Effort | Notes |
|---|------|--------|-------|
| 1 | Multi-provider API abstraction (Forza/ESPN/Opta) | 3 weeks | Required for La Liga / Serie A |
| 2 | `scoring_templates` table — competition-aware rule engine | 2 weeks | Different leagues, different rules |
| 3 | Cross-league squad mode: `squad_players` join table | 1 week | Phase 3 cross-league feature |
| 4 | Audit log table for transfers, bets, auctions | 1 week | Compliance + debugging |
| 5 | Wire React Compiler memoization warnings to errors | 1 day | Performance baseline |
| 6 | Increase CI E2E timeout from 15 → 20 min | 5 min | Margin for slowdown |
| 7 | Centralize fixture normalization in `src/lib/fixtures.js` | 1 day | DRY |

---

## Appendix: Review Questions Answered

### 1. If we launch 3 more leagues tomorrow, what breaks?
- `squads` cannot disambiguate players from different tournaments (CRITICAL).
- Cron jobs only sync tournament_id "426" → new leagues have stale player data.
- Position arrays in UI are EPL-hardcoded; some leagues use 5-3-2 formations.
- `process-transfer` deadline query picks wrong tournament.
- Forza API client is OK, but rule engine and validation triggers need parameterization.

### 2. If a player is transferred between clubs, what stale data persists?
- `players.club_id` updates correctly (sync runs daily).
- But `match_events.club` and `fixtures.home_club_id` may already reference the player's prior club for historical matches — by design; not a bug.
- Issue: `useAvailabilityFlag` data may be stale if club affiliation drives availability rules.

### 3. If the Forza Football API is down for 2 hours, what does the user see?
- Live scores stall (last update timestamp on `LiveScreen.jsx` isn't shown).
- Player availability flags remain at last known state.
- No banner notifies the user of API unavailability.
- **Fix needed**: "Last updated X min ago" indicator + "API unavailable, scores may be stale" banner.

### 4. If two managers submit the same transfer simultaneously, what happens?
- Race condition exists today (see Corner Case 1). One will succeed; the other's optimistic UI may flicker between success and failure.
- Server-side RLS prevents true double-ownership but leaves transient inconsistency.

### 5. If a chat message fails to save, does the user know?
- **No.** Errors logged silently. Message disappears from UI on send; user assumes it was sent.
- **Fix needed**: Optimistic message gets `failed` state with retry icon.

### 6. What happens if someone deletes a league while the app is open?
- League name stays as `'SYNCING...'` in the UI.
- All subsequent queries return empty/404 silently.
- **Fix needed**: Realtime DELETE listener on `leagues`; redirect with toast.

### 7. Can we currently run an EPL league and a La Liga league simultaneously?
- **Partial yes**, with caveats:
  - Tournament/player/fixture tables: ✅ Ready
  - Squad → tournament mapping: ❌ Not yet (squad table lacks `tournament_id`)
  - Cron jobs: ❌ Hardcoded to EPL
  - UI position labels: ❌ EPL-only
  - Scoring rules: ⚠️ EPL defaults hardcoded; need template-driven engine

---

## Deliverables Checklist

- [x] Improvements identified and prioritized by effort
- [x] Corner cases documented with test case suggestions
- [x] Silent errors with detection/monitoring strategies
- [x] Multi-competition architectural assessment (blocker list)
- [x] Prioritized action plan (Phase 1, 2, 3)
- [x] Specific file locations and line numbers for every finding
- [x] Risk severity levels assigned
- [x] Effort estimates for remediation

---

**Reviewer notes**: This review draws on parallel deep-dives across the schema, frontend hooks, screens, Edge Functions, and E2E suite. The codebase shows strong discipline at the hook layer (DB-driven config, well-cleaned subscriptions) but production hardening — particularly transactional integrity, API resilience, and RLS coverage — is the highest-leverage area for the next sprint. Multi-competition expansion is achievable but requires schema work that should be sequenced before the first non-EPL league launches.
