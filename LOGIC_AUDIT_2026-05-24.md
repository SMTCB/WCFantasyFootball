# Logic Consistency Audit — Player Rating, Bet Correction, Standings Aggregation
**Date:** 2026-05-24
**Scope:** Deep trace of three intertwined flows:
1. **Rating** — how player points are computed from match events / Forza stats.
2. **Bet correction** — how submitted predictions become rewards.

---
## Sprint 0 Status — updated 2026-05-24

| ID | Status | Notes |
|----|--------|-------|
| L1.1 | ✅ Done | scoring_rules table created with JSONB shape; EPL (426) seeded |
| L1.2–L1.8 | ⏳ Sprint 1 | Scoring math correctness (GK clean sheets, sub events, penalty_missed, mins≥60) |
| L2.1 | ⏳ Sprint 1 | resolve_bet validates correct_answer is in options |
| L2.4 | ⏳ Sprint 1 | Auto-resolver edge function + cron |
| L3.1 | ✅ Done | aggregate_league_member_points UPDATE clause restored |
| L3.2 | ✅ Done | league_members.total_points → NUMERIC(10,2) |
| L3.3 | ⏳ Sprint 1 | recompute_league_ranks trigger on total_points change |
| L3.4 | ⏳ Sprint 1 | rollupSquads hard-fail on missing round_number / tournament_id |
| L3.5 | ⏳ Sprint 1 | Captain-on-bench policy |
| L3.7 | ⏳ Sprint 1 | aggregate_league_member_points filter to reward_type='points' only |
| L5.2 | ✅ Done | run-draft-lottery idempotency gate + crypto-random allocation |
| L5.4 | ✅ Done | run-reverse-standings-draft per-league config (budget, squad_size, tournament_id) |
| L5.6 | ✅ Done | Deterministic tiebreaker (lexicographic user_id when points equal) |
| L5.7 | ✅ Done | Null guard on playerRows in reverse-standings-draft |
| L5.8 | ✅ Done | Uses league budget from DB (not hardcoded 100) |
| L6.1 | ✅ Done | process-transfer enforces relaxation_state.current_repeats_allowed |
| L6.2 | ✅ Done | Pool pressure thresholds corrected to 0–1 ratio; Math.round(pressure*100)% |

---
3. **Aggregation** — how individual player points + bet rewards roll up into league standings.

This is a companion to [CODE_AUDIT_2026-05-24.md](CODE_AUDIT_2026-05-24.md). Findings here are **logic / mathematical correctness** issues — not security, not infrastructure. Many show up as "data looks fine but totals are wrong" — the worst kind of bug.

---

## TL;DR — The Three Logic Killers

| # | Severity | Pipeline | What's broken | Symptom users see |
|---|---|---|---|---|
| **L1** | 🔴 CRITICAL | Aggregation | `aggregate_league_member_points` (migration 37) replaced the original (migration 29) but **dropped the UPDATE statement**. The function now only computes and returns a number — it never persists anything. | League standings never update. Total points frozen at seed value. Bet rewards never reflected in standings. Captain doubling never reflected in standings. |
| **L2** | 🔴 CRITICAL | Rating | The function reads `scoring_rules` (doesn't exist). Migration 53 creates `scoring_templates` with a completely different shape (`(position, event_type, points, multiplier)` rows, not `(position, rules JSONB)` rows). **Even a table rename won't fix this** — the query expects nested JSON. | Every fixture, every tournament, falls back to hardcoded EPL constants. Cross-tournament scoring (WC vs EPL) is identical. Customising rules through `upsert_scoring_rules` RPC has zero effect. |
| **L3** | 🔴 CRITICAL | Aggregation | `league_members.total_points` column is `INTEGER`. `fantasy_points.total` is `NUMERIC(8,2)`. Bonuses include `tackles_won × 0.5` and `interceptions × 0.25`. | Every decimal is silently truncated/rounded by the implicit cast. Defender tackle/interception bonuses lost. Standings differ from the per-matchday breakdown the user sees. |

Fix **L1 first** — until standings persist, every other fix is invisible.

---

## 1. Player Rating — Logic Issues

### L1.1 (CRITICAL) — `scoring_rules` schema mismatch
**Files:**
- Query: `supabase/functions/calculate-scores/index.js:62-85`
- Table: `supabase/migrations/53_scoring_templates.sql:6-17`

**The code expects this shape:**
```js
.from('scoring_rules').select('position, rules').eq('tournament_id', '426')
// expects rows like:
// { position: 'GK',  rules: { goal:5, assist:0, clean_sheet:4, conceded_per_goal:-1, ... } }
// { position: 'DEF', rules: { goal:4, assist:1, clean_sheet:4, tackle:0.5, ... } }
// { position: 'UNIVERSAL', rules: { minute_per_90:1, own_goal:-2, yellow_card:-1, ... } }
```

**The actual `scoring_templates` table:**
```sql
CREATE TABLE scoring_templates (
  tournament_id TEXT, position TEXT, event_type TEXT,
  points INT, multiplier DECIMAL(4,2)  -- flat, one row per event type
);
-- ('426', 'GK', 'goal', 5, 1.0), ('426', 'ANY', 'yellow_card', -1, 1.0), ...
```

The function calls `.eq('tournament_id', ...)`, gets a `404 relation does not exist` error, logs a warning, and returns `FALLBACK_POINTS`/`FALLBACK_UNIVERSAL`. **Result:** the entire competition-aware scoring engine is fiction. Every league uses hardcoded EPL 2025/26 constants.

**Fix:** Either rewrite `loadScoringRules` to pivot the flat `scoring_templates` rows into the nested shape OR re-seed scoring_rules with the JSONB schema the code expects.

Recommended: create the table the code expects and migrate the seed rows.

```sql
-- migration 66
CREATE TABLE IF NOT EXISTS public.scoring_rules (
  tournament_id TEXT NOT NULL,
  position      TEXT NOT NULL,         -- 'GK','DEF','MID','FWD','UNIVERSAL'
  rules         JSONB NOT NULL,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tournament_id, position)
);
ALTER TABLE public.scoring_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY scoring_rules_read ON public.scoring_rules
  FOR SELECT TO authenticated USING (TRUE);

-- Seed EPL (426)
INSERT INTO scoring_rules (tournament_id, position, rules) VALUES
  ('426','GK',        '{"goal":5,"assist":0,"clean_sheet":4,"conceded_per_goal":-1,"penalty_saved":5,"tackle":0,"interception":0,"penalty_scored":0}'::jsonb),
  ('426','DEF',       '{"goal":4,"assist":1,"clean_sheet":4,"conceded_per_goal":0,"penalty_saved":0,"tackle":0.5,"interception":0.25,"penalty_scored":0}'::jsonb),
  ('426','MID',       '{"goal":5,"assist":1,"clean_sheet":1,"conceded_per_goal":0,"penalty_saved":0,"tackle":0.5,"interception":0.25,"penalty_scored":0}'::jsonb),
  ('426','FWD',       '{"goal":3,"assist":1,"clean_sheet":0,"conceded_per_goal":0,"penalty_saved":0,"tackle":0,"interception":0,"penalty_scored":1}'::jsonb),
  ('426','UNIVERSAL', '{"minute_per_90":1,"own_goal":-2,"yellow_card":-1,"red_card":-3,"penalty_missed":-1}'::jsonb)
ON CONFLICT (tournament_id, position) DO NOTHING;

-- DROP TABLE scoring_templates;  -- once the dead code is removed (see L1.10)
```

**Test:** After deploy, calculate-scores logs must stop printing `[calculate-scores] No scoring_rules found for tournament 426`. Modify the EPL goal rule for GK to 10 in DB, run a scoring pass against a fixture with a GK goal → fantasy_points must reflect the new value, not 5.

---

### L1.2 (HIGH) — GK `conceded_per_goal` applied per goal, not per 2 goals
**File:** `supabase/functions/calculate-scores/index.js:131-133`

```js
if (pos === 'GK' && mins >= 60) {
  pts += Math.floor(stats.goals_conceded ?? 0) * rules.conceded_per_goal;
}
```

The fallback rule is `conceded_per_goal: -1`. A GK conceding 3 goals → `Math.floor(3) × -1 = -3 pts`.

But the **classic FPL rule** (and what most users expect): `−1 per 2 goals conceded` → `floor(3/2) × -1 = -1 pt`.

The `Math.floor` is a no-op since `goals_conceded` is already an INT. If the intent was `floor(goals_conceded/2)`, the formula is wrong.

**Fix options:**
- **Option A** (preserve current behaviour): leave alone, document in the breakdown.
- **Option B** (match FPL): change to `Math.floor(stats.goals_conceded / 2) * rules.conceded_per_goal`. Update the `breakdown` builder identically (line 153–172).

The choice should be a product decision. **Both paths must update simultaneously** (rule + scoring + breakdown + UI label) so users see consistent math.

**Test:** GK plays full 90 min, team concedes 3 → assert per chosen rule. Then GK plays 50 min → assert 0 (≥60 gate works). GK plays 90 min, conceded 1 → 0 pts (floor(1/2) = 0 under option B).

---

### L1.3 (HIGH) — Negative scores survive `||` but NaN silently → 0
**File:** `supabase/functions/calculate-scores/index.js:459`

```js
let pts = fullRoundLookup[pid] || 0;
```

I previously flagged this as zeroing negatives — that was wrong. In JS, `-4 || 0 === -4` because `-4` is truthy. So a red-card-only player keeps their −2/−3 points. Good.

**However:** if `scorePlayer` ever returns `NaN` (e.g., a stat field comes through as the string `'?'` from match_events, or a fixture has `minutes: undefined` in a Forza payload), `NaN || 0 === 0` — silently lost. No log, no warning.

**Fix:** Replace `||` with `??` so only `null`/`undefined` fall through:
```js
let pts = fullRoundLookup[pid] ?? 0;
if (Number.isNaN(pts)) {
  pts = 0;
  await logError('error', 'NaN in points lookup', { fixture_id, player_id: pid });
}
```

**Test:** Insert a `player_match_stats` row with `fantasy_points = 'NaN'` (cast issue) → `aggregate_league_member_points` should still produce a finite number; an error row should appear in `edge_function_errors`.

---

### L1.4 (HIGH) — Wildcard chip stacks multiplicatively with captain
**File:** `supabase/functions/calculate-scores/index.js:458-463`

```js
for (const pid of pitchPlayers) {
  let pts = fullRoundLookup[pid] || 0;
  if (pid === squad.captain_id)  pts *= squad.is_triple_captain ? 3 : 2;
  if (squad.is_wildcard)         pts = Math.round(pts * 1.1 * 100) / 100;
  total += pts;
}
```

Per-player flow when both chips active:
- Base 5 pts → captain → 10 pts → wildcard → 11 pts.

**Three concerns:**
1. **Wildcard in classic FPL** is *not* a points multiplier — it's an unlimited-transfers chip. The 10% bonus here is a custom interpretation. If the product intent is "unlimited transfers", `is_wildcard` should not affect scoring at all; it should gate `process-transfer`. Conversely, if it's intended as a "Bench Boost"-style scoring chip, the 10% scope and stacking with captain need to be documented.
2. **Stacking with captain × 3.3** (triple captain + wildcard) — likely unintended. Captain is doubled, then the doubled value is also +10%'d. A 10-pt player as triple-captain wildcard = 33 pts.
3. **Rounding inside the loop** introduces drift. Each player rounds to 2 dp; summing 11 rounded values vs rounding once at the end can differ by up to 11 × 0.005 = 0.055.

**Fix (assuming wildcard ≠ points multiplier):** delete lines 461 entirely; gate `is_wildcard` in `process-transfer` only.

**Fix (assuming wildcard IS a points multiplier):** apply once at the end:
```js
for (const pid of pitchPlayers) {
  let pts = fullRoundLookup[pid] ?? 0;
  if (pid === squad.captain_id) pts *= squad.is_triple_captain ? 3 : 2;
  total += pts;
}
if (squad.is_wildcard) total *= 1.1;
total = Math.round(total * 100) / 100;
```

**Test:** Squad with 10 base pts, captain = 5 pts, wildcard on. Pre-fix: 10 + 10 + 8×11×(non-captain pts)×1.1 + 11 (captain). Post-fix: (10+10+sum) × 1.1, rounded once. Compare totals against a hand-calculated expectation.

---

### L1.5 (HIGH) — Joker chip schema exists but is never scored
**Files:**
- `supabase/migrations/00_schema.sql:54` — `squads.joker_player_id TEXT`
- `supabase/migrations/10_sprint1_fixes.sql:11-20` — `daily_jokers` table with `points_earned NUMERIC(6,2)`
- `supabase/functions/calculate-scores/index.js:449` — selects `joker_player_id`? **No** — it selects only `is_triple_captain, is_wildcard`. `joker_player_id` is never read.

The frontend has `LiveJokerCard.jsx`, `ChipSelectorModal.jsx`, and Joker UI in `LiveScreen.jsx`. Users can pick a Joker. Their score never changes.

**Fix:** Decide the Joker mechanic:
- If Joker = "pick any one player this matchday and they double on top of normal captain doubling" → add to the per-player loop:
  ```js
  if (pid === squad.joker_player_id) pts *= 2;
  ```
- If Joker = "daily mini-game with separate points pool" → wire `daily_jokers.points_earned` from a separate cron and surface it in `aggregate_league_member_points`.

Currently the table sits unwritten. The chip selector burns a user's chip allowance for no benefit.

**Test:** Activate Joker on player X. Player X scores 5 pts. Confirm squad total reflects the Joker bonus per chosen semantics.

---

### L1.6 (MEDIUM) — Path B `sub_off` event type never emitted
**Files:**
- Emitter: `supabase/functions/ingest-match-events/index.js:423` — writes `'sub'`.
- Consumer: `supabase/functions/calculate-scores/index.js:325` — switches on `'sub_off'`.

Result: Path B (manual / mock match_events ingestion) always treats every player as having played 90 minutes. The substitution minute tracking only works in Path A (where `player_match_stats.minutes_played` is set from E10 / E5).

This affects:
- Test fixtures that seed `match_events` manually
- Any future demo-mode / sandbox league that doesn't ingest from Forza
- Recovery flows where Forza data is delayed and someone re-runs scoring from match_events

**Fix:** Accept both type names:
```js
case 'sub_off':
case 'sub':       s.minutes_played = parseInt(ev.minute) || s.minutes_played; break;
```

Better: standardise on one (`'sub'`) and migrate any legacy `'sub_off'` rows.

**Test:** Seed a fixture with manual `match_events` including a `'sub'` at minute 60 → scoring should reflect 60 min, not 90.

---

### L1.7 (MEDIUM) — `penalty_missed` written to `match_events` as a goal
**File:** `supabase/functions/ingest-match-events/index.js:419-450`

```js
const typeMap = {
  goal: 'goal', yellow: 'yellow', red: 'red', sub: 'sub',
  penalty_missed: 'goal',   // ← stored as goal
};

const outcome = {};
if (ev.type === 'goal') {           // only sets outcome for true goals
  outcome.is_penalty    = ev.is_penalty ?? false;
  outcome.assist_player = ...;
}
// penalty_missed reaches here with outcome = {}, then type = 'goal'
```

The check `if (ev.type === 'goal')` skips the `penalty_missed` branch — outcome is empty. The row is inserted with `type: 'goal'`, no outcome flag distinguishing it from a real goal.

Impact:
- **Live event feed (LiveScreen / EventTimeline)** — shows a goal where none was scored.
- **Path B calculate-scores** — `case 'goal': s.goals++` credits the missed penalty as a goal.

Fix:
```js
const typeMap = {
  goal: 'goal', yellow: 'yellow', red: 'red', sub: 'sub',
  penalty_missed: 'penalty_missed',
};
// ... and ensure Path B handles 'penalty_missed':
case 'penalty_missed': s.penalty_missed++; break;
```

(Path A is unaffected — it reads `penalty_missed` directly from `player_match_stats`.)

**Test:** Force a penalty miss in test data → check `match_events.type = 'penalty_missed'` not `'goal'`. UI timeline shows ✗-style icon, not ⚽.

---

### L1.8 (MEDIUM) — `clean_sheet` derived differently in Path A vs Path B
**Files:**
- Path A: `ingest-match-events/index.js:387` — `clean_sheet: conceded === 0 && mins >= 60`
- Path B: `calculate-scores/index.js:352` — `clean_sheet = goalsAgainst === 0` (no minutes gate)

Path B stores `clean_sheet = true` for a player who came on at minute 80 in a 0-0. `scorePlayer` then re-applies the `mins >= 60` gate when computing points, so the *points* are identical. But:
- The `player_match_stats.clean_sheet` boolean is inconsistent between paths.
- The `breakdown` JSONB (line 161) returns `(stats.clean_sheet && mins >= 60) ? rules.clean_sheet : 0` — math correct, but the player's UI profile may show a "clean sheet" badge that the points don't reflect.

**Fix:** Apply `&& mins >= 60` at derivation in Path B (line 352):
```js
stats.clean_sheet = (goalsAgainst === 0) && (stats.minutes_played >= 60);
```

**Test:** Mock fixture, defender plays 30 min in a 0-0 → `clean_sheet = false`, points = 0, no badge.

---

### L1.9 (MEDIUM) — `calculate_player_points` SQL function is broken dead code
**File:** `supabase/migrations/53_scoring_templates.sql:170-246`

This `SECURITY DEFINER` function has several bugs but is **never called** (grep confirms no caller). Listing them in case anyone tries to invoke it:

1. Param `p_player_id BIGINT` — but `players.id` is `TEXT` (migration 10). Type mismatch.
2. `match_events` rows are counted with no `fixture_id` filter — re-counts every match in history every call.
3. `v_event` declared `RECORD`, used as `INT` (`COUNT(*) INTO v_event` then `v_total_points + ... * v_event`). Will runtime-error on multiplication.
4. Reads `match_events.type = 'yellow_card'` / `'red_card'` / `'clean_sheet'` — but elsewhere `match_events.type` is `'yellow'` / `'red'`, and `'clean_sheet'` is *never* written to match_events (derived only).
5. References `squads_detail` view — not created in any migration.
6. The `multiplier` column from `scoring_templates` is ignored entirely.
7. Returns `INT` — loses decimals.
8. `GREATEST(v_total_points, 0)` — clamps to non-negative. Red-card players never go negative. Inconsistent with `calculate-scores` (which allows negatives).

**Fix:** Drop the function in a new migration:
```sql
DROP FUNCTION IF EXISTS public.calculate_player_points(UUID, BIGINT, TEXT);
DROP FUNCTION IF EXISTS public.calculate_player_points(UUID, TEXT, TEXT);
```
And drop the `get_scoring_template`, `upsert_scoring_rules`, `get_event_points` helpers if no caller exists.

**Test:** `\df calculate_player_points` returns empty.

---

### L1.10 (LOW) — Position default to `'MID'` swallows unknown positions silently
**File:** `supabase/functions/calculate-scores/index.js:118, 240, 360`

```js
const rules = POINTS[pos] || POINTS.MID;
```
And:
```js
position: positionMap[r.player_id] ?? 'MID',
```

If `players.position` is null or contains an unexpected value (e.g., `'GKE'` typo, or `'Goalkeeper'` from Forza without mapping), the player is scored as a midfielder. A keeper without proper position mapping gets 0 clean-sheet points and 5 pts per goal (mid rules), not 5 + 4 (clean sheet) + GK conceded penalty.

**Fix:** Log when an unknown position is encountered, fall back to MID for safety but surface the issue.

---

## 2. Bet Correction — Logic Issues

### L2.1 (HIGH) — `resolve_bet` doesn't validate `p_correct_answer` against the bet's options
**File:** `supabase/migrations/28_bets_system.sql:204-239`

```sql
UPDATE bet_instances SET correct_answer = p_correct_answer ...
UPDATE bet_submissions
SET is_correct = (answer = p_correct_answer), ...
WHERE bet_instance_id = p_instance_id;
```

Nothing checks that `p_correct_answer` is one of `bet_instances.options[*].key`. A typo from the commissioner ("p_1" instead of "p1") → all submissions get `is_correct=false`, nobody wins. Worse, the typo is permanent because the instance is set to `status='resolved'` and the early-exit at line 220 (`status = 'resolved' → error`) prevents reopening.

**Fix:** In `resolve_bet`, validate:
```sql
IF jsonb_array_length(v_instance.options) > 0
   AND NOT EXISTS (
     SELECT 1 FROM jsonb_array_elements(v_instance.options) o
     WHERE o->>'key' = p_correct_answer
   ) THEN
  RETURN jsonb_build_object('ok', false, 'error', 'p_correct_answer not in options');
END IF;
```
(Skip validation for free-text/number bets where `options = '[]'::jsonb`.)

**Test:** Bet with options `[{key:"p1"}, {key:"p2"}]`. Call `resolve_bet` with `p_correct_answer='p3'` → returns error, no UPDATE happens. Status stays `closed`/`open`.

---

### L2.2 (HIGH) — `resolve_bet` claims `submissions_updated` is the winner count — it's the total
**File:** `supabase/migrations/28_bets_system.sql:235-237`

```sql
GET DIAGNOSTICS v_updated = ROW_COUNT;
RETURN jsonb_build_object('ok', true, 'submissions_updated', v_updated);
```

The `UPDATE bet_submissions ... WHERE bet_instance_id = p_instance_id` touches every submission (correct or not). `ROW_COUNT` is therefore the total submission count, not the number of correct picks.

The caller (frontend or commissioner panel) likely uses this number to display "X people got it right". Currently displays total entrants.

**Fix:** Two separate counts:
```sql
SELECT
  COUNT(*) FILTER (WHERE answer = p_correct_answer),
  COUNT(*)
INTO v_winners, v_total
FROM bet_submissions WHERE bet_instance_id = p_instance_id;

RETURN jsonb_build_object('ok', true, 'winners', v_winners, 'total', v_total);
```

**Test:** Bet with 5 submissions, 2 correct. Resolve → returns `{winners: 2, total: 5}`.

---

### L2.3 (HIGH) — Bet rewards never reach standings (chains into L3.1)
The flow is:
1. Commissioner calls `resolve_bet` → updates `bet_submissions.reward_awarded`.
2. Trigger `bet_submissions_reward_update` (from migration 29) fires on the UPDATE.
3. Trigger function calls `aggregate_league_member_points`.
4. **Post-migration 37**: that function no longer UPDATEs anything.

Net effect: `bet_submissions` has correct `reward_awarded` rows. `league_members.total_points` doesn't change. Standings ignore bet rewards.

See **L3.1** for the canonical fix. Once L3.1 is fixed, this chain works end-to-end.

---

### L2.4 (HIGH) — `auto-close-bets` cron has no resolver companion
**File:** `supabase/migrations/34_auto_close_bets_cron.sql:5-14`

```sql
UPDATE bet_instances SET status = 'closed' WHERE status = 'open' AND deadline_at < NOW();
```

Transitions `open → closed`. There is no automated `closed → resolved` path. The `bet_instances.resolves_at TIMESTAMPTZ` column exists (migration 28:40) — never used.

So bets sit in `closed` indefinitely until a commissioner clicks "resolve" manually. If the commissioner forgets (or quits the league), the bet never pays out and nothing in `aggregate_league_member_points` ever fires.

**Fix:** Decide automation policy:
- **Manual** (current) — document it in the commissioner UI ("Bets must be resolved by you"). Add a reminder badge for `closed` bets older than 24h.
- **Automatic** — write a `resolve-bets` edge function that queries `bet_instances` where `status='closed' AND resolves_at < NOW()`, looks up the actual outcome (e.g. from `fixtures.home_score/away_score` for `match_result` bets, or top scorer for `top_scorer`), and calls `resolve_bet` per row. Schedule it hourly.

Either way, the dead `resolves_at` column should be either populated or dropped to remove the confusion.

**Test:** Create a bet with `resolves_at = now() - 1h` and `status='closed'`. After the resolve cron fires, status should be `'resolved'`.

---

### L2.5 (MEDIUM) — `submit_bet` allows answer changes without resetting verdict
**File:** `supabase/migrations/28_bets_system.sql:192-195`

```sql
ON CONFLICT (bet_instance_id, squad_id)
DO UPDATE SET answer = EXCLUDED.answer, submitted_at = NOW();
```

The UPSERT replaces the answer but does not null `is_correct` or `reward_awarded`. In normal flow this doesn't matter — submissions can only be changed before deadline, and resolution only happens after deadline. But there's a race: if `resolve_bet` is called early (commissioner mistake), and a user is editing their pick at the same time, the resolved `is_correct=true/false` row gets a fresh `answer` that contradicts the verdict.

**Fix:**
```sql
ON CONFLICT (bet_instance_id, squad_id)
DO UPDATE SET answer = EXCLUDED.answer, submitted_at = NOW(),
              is_correct = NULL, reward_awarded = NULL;
```

(Combined with the deadline guard in RLS that prevents updates after deadline_at, this is fully safe.)

**Test:** Resolve a bet (commissioner mistake), then have the user's submission still pending UPDATE → final state: `is_correct=null`, `reward_awarded=null`, answer = user's latest. Re-resolve to re-compute.

---

### L2.6 (MEDIUM) — `useBettingLeaderboard` query lacks `!inner` modifier
**File:** `src/hooks/useBettingLeaderboard.js:21-32`

```js
.from('bet_submissions')
.select(`
  user_id, squad_id,
  squads!squad_id(users!user_id(username)),
  bet_instances!bet_instance_id(league_id),
  is_correct, reward_awarded
`)
.filter('bet_instances.league_id', 'eq', leagueId)   // ← silently ignored
.not('is_correct', 'is', null);
```

In PostgREST, filtering on a joined table requires the join to be `!inner`. Without it, the filter does **not** narrow rows — the join's rows just come along for the ride. Combined with `bet_submissions` RLS (which allows any league member of any bet's league to read), users in multiple leagues see cross-league submissions in League A's leaderboard.

**Fix:**
```js
bet_instances!inner!bet_instance_id(league_id)
```
And keep the `.filter(...)` — it now properly narrows.

**Test:** User is in League A and League B. Open League A's leaderboard. Resolve a bet in League B. Pre-fix: appears in A's leaderboard. Post-fix: doesn't.

---

### L2.7 (MEDIUM) — `useBettingLeaderboard` Realtime has no league filter
**File:** `src/hooks/useBettingLeaderboard.js:82-89`

```js
.channel(`betting_leaderboard:league_id=${leagueId}`)
.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'bet_submissions' }, ...)
```

The channel name embeds the league id but the filter doesn't — every `bet_submissions` UPDATE anywhere in the DB triggers `fetchLeaderboard()` for every user watching any leaderboard. With N concurrent users in M leagues, single resolutions cause N×M refetches.

**Fix:** Add a server-side filter via the joined table (Supabase Realtime supports `filter: 'bet_instance_id=in.(uuid1,uuid2,...)'` if you preload the league's bet instance ids), or accept the over-fetch and switch to row-level merging:
```js
.on('postgres_changes',
  { event: 'UPDATE', schema: 'public', table: 'bet_submissions' },
  (payload) => {
    // Only refetch if this submission belongs to one of *our* league's instances
    if (knownInstanceIds.has(payload.new?.bet_instance_id)) fetchLeaderboard();
  }
)
```

---

## 3. Aggregation into Standings — Logic Issues

### L3.1 (🔴 CRITICAL — the single most impactful logic bug) — `aggregate_league_member_points` no longer writes
**Files:**
- Original (working): `supabase/migrations/29_bets_reward_aggregation.sql:9-46` — contained an `UPDATE league_members SET total_points = ROUND(v_combined_total::numeric, 2)`.
- Replacement (broken): `supabase/migrations/37_fix_aggregate_league_member_points.sql:5-35` — fixed column names, **silently removed the UPDATE statement**.

The "fix" only addressed the `fantasy_points.total_points → .total` rename and the missing `league_id` column join. Whoever rewrote it kept only `RETURN v_total`. So now:
- `calculate-scores` calls this RPC after every scoring pass → receives a number, ignores it.
- `bet_submissions_reward_update` trigger fires on bet resolution → calls this RPC → discards.

**The standings never update.** `league_members.total_points` is frozen at the value it had immediately after migration 37 ran. From the BACKLOG, that's been weeks ago.

UI symptom: Active leagues show no point movement between matchdays. The matchday breakdown in `fantasy_points` is correct; the standings table on `LeagueScreen` is stale.

**Fix:** Restore the UPDATE *and* fix L3.2 (column type) simultaneously:

```sql
-- new migration 66 (companion to scoring_rules migration)
CREATE OR REPLACE FUNCTION public.aggregate_league_member_points(p_league_id uuid, p_user_id uuid)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_fantasy_points NUMERIC := 0;
  v_bet_rewards    NUMERIC := 0;
  v_total          NUMERIC;
BEGIN
  SELECT COALESCE(SUM(fp.total), 0) INTO v_fantasy_points
  FROM fantasy_points fp
  JOIN squads s ON s.id = fp.squad_id
  WHERE s.league_id = p_league_id AND s.user_id = p_user_id;

  SELECT COALESCE(SUM(bs.reward_awarded), 0) INTO v_bet_rewards
  FROM bet_submissions bs
  JOIN bet_instances bi ON bi.id = bs.bet_instance_id
  JOIN squads s         ON s.id = bs.squad_id
  WHERE bi.league_id      = p_league_id
    AND s.user_id          = p_user_id
    AND bs.reward_awarded IS NOT NULL
    AND bi.status          = 'resolved';

  v_total := ROUND((v_fantasy_points + v_bet_rewards)::numeric, 2);

  UPDATE league_members
    SET total_points = v_total
  WHERE league_id = p_league_id AND user_id = p_user_id;

  RETURN v_total;
END;
$$;
```
(Combine with L3.2 type change in the same migration so the UPDATE doesn't immediately re-truncate.)

**Test:**
```sql
-- Manually invoke for any active league/user
SELECT aggregate_league_member_points('<league>', '<user>');
-- Verify league_members.total_points updated to the returned value
SELECT total_points FROM league_members WHERE league_id = '<league>' AND user_id = '<user>';
```

After deploy: a fresh `calculate-scores` invocation should bump standings within seconds.

---

### L3.2 (🔴 CRITICAL) — `league_members.total_points` is INTEGER but values are NUMERIC
**File:** `supabase/migrations/00_schema.sql:32`

```sql
total_points INTEGER DEFAULT 0,
```

Sources of decimal points:
- DEF tackle bonus: 0.5 per tackle
- DEF/MID interception bonus: 0.25 per interception
- Wildcard chip: ×1.1 (introduces 1-dp values)
- Bet reward values configured as `NUMERIC` can be set to e.g. 4.5
- `Math.round(pts * 100) / 100` in calculate-scores produces 2-dp NUMERICs

The implicit cast on `UPDATE league_members SET total_points = <numeric>` rounds-half-to-even (Postgres) and truncates the decimal. A defender with 3 tackles + 2 interceptions accumulates 0.5×3 + 0.25×2 = 2.0 — that one's fine — but a midfielder with 1 tackle + 1 interception = 0.75 gets rounded to 1, gaining 0.25. Across a season, this drift compounds.

**Fix (in the same migration as L3.1):**
```sql
ALTER TABLE public.league_members
  ALTER COLUMN total_points TYPE NUMERIC(10,2) USING (total_points::numeric);
ALTER TABLE public.league_members
  ALTER COLUMN total_points SET DEFAULT 0;
```

Update frontend display code if any place assumes integer (`{m.total_points}` — `react` renders numbers fine; check for explicit `.toFixed(0)`):
- `src/screens/LeagueScreen.jsx:754, 777, 826, 945, 1147, 1188, 1193, 1236, 1237` — should add `.toFixed(1)` or similar.

**Test:** A defender with 0.5 tackle bonus → standings show 0.5, not 1 or 0.

---

### L3.3 (HIGH) — `league_members.rank` is never recomputed
**Files:**
- Set: `supabase/migrations/01_seed_alpha.sql:14, 68` — initial seed.
- Read: `src/screens/LeagueScreen.jsx:319, 826` and `src/hooks/useLeagueStats.js:23`.
- Updated: **nowhere.**

After standings change, `rank` stays at the seed value. Frontend displays `rank` next to `total_points` ordered by `total_points DESC`. The two will visually disagree as soon as anyone moves up or down.

**Fix:** Add a function + trigger to recompute on every `total_points` change:

```sql
-- new migration 66
CREATE OR REPLACE FUNCTION public.recompute_league_ranks(p_league_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  WITH ranked AS (
    SELECT user_id,
           DENSE_RANK() OVER (ORDER BY total_points DESC NULLS LAST) AS new_rank
    FROM league_members WHERE league_id = p_league_id
  )
  UPDATE league_members lm
  SET rank = r.new_rank
  FROM ranked r
  WHERE lm.league_id = p_league_id AND lm.user_id = r.user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_recompute_ranks() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  PERFORM recompute_league_ranks(NEW.league_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS league_members_rank_recompute ON league_members;
CREATE TRIGGER league_members_rank_recompute
  AFTER UPDATE OF total_points ON league_members
  FOR EACH ROW WHEN (NEW.total_points IS DISTINCT FROM OLD.total_points)
  EXECUTE FUNCTION tg_recompute_ranks();
```

⚠️ Watch out: `aggregate_league_member_points` UPDATEs one row → the trigger fires → recompute updates N rows → each row that *also* changes total_points (it doesn't here, only rank) would re-fire. Using `UPDATE OF total_points` plus the `WHEN (NEW.total_points IS DISTINCT FROM OLD.total_points)` guard prevents infinite recursion.

**Test:** Three users at 10/20/30 pts → ranks 3/2/1. Update user1 to 40 → ranks become 2/3/1 (assuming dense rank — re-check the order).

---

### L3.4 (HIGH) — Multi-fixture matchday rollup depends on `player_match_stats` being populated for every other fixture
**File:** `supabase/functions/calculate-scores/index.js:407-444` (`rollupSquads`)

The function reconstructs full-round totals by merging the current fixture's pointsLookup with `player_match_stats.fantasy_points` from all other fixtures in the same round. This works only if:
1. `fixture.round_number` is non-null
2. `tournament_id` is non-null
3. **Every other fixture's `player_match_stats` rows already have `fantasy_points` set**

Edge cases that break it:
- **First fixture of a matchday**: no other fixtures done yet → upsert writes "just this fixture's contribution" to `fantasy_points.total` for this matchday. ✓ (next fixture will merge).
- **Re-running scoring before later fixtures finish**: rolls up partial total. ✓ (will eventually catch up).
- **`round_number` is null** (mock / cup data without rounds): falls back to `squad.matchday_id || 'current'`. If multiple fixtures share `'current'` they'll *overwrite* each other on the upsert because the unique key is `(squad_id, matchday_id)`. **Bug.**
- **Different rounds in same matchday_id** (cross-tournament squads, or league with WC + EPL): same `'current'` collision.

The fallback path is the catastrophic one — silently overwrites earlier fixture contributions.

**Fix (already covered partly in CODE_AUDIT DATA-6):**
- Never fall back to `'current'`. If `round_number` is null, refuse to upsert and `logError('critical', 'cannot derive matchday_id')`.
- Verify `tournament_id` is non-empty before the rollup; otherwise skip and log.
- Add a regression test: 2 fixtures in the same round; run calculate-scores on fixture A first, then B; assert squad fantasy_points = sum of both, not just B.

**Test (manual):**
```sql
-- Pre: round 35 has fixtures A and B. Squad has 2 players: one in A, one in B.
-- Run scoring for A first. fantasy_points row total = A-player's pts.
-- Run scoring for B. fantasy_points row total = A + B.
-- Currently: works ONLY if fixture rows have round_number AND tournament_id.
```

---

### L3.5 (HIGH) — `squad.players` indexing assumption — captain on bench → zero captain bonus
**File:** `supabase/functions/calculate-scores/index.js:454-463`

```js
const pitchPlayers = (squad.players || []).slice(0, 11);
...
for (const pid of pitchPlayers) {
  ...
  if (pid === squad.captain_id)  pts *= ...;
}
```

Implicit contract: `squad.players[0..10]` are the starting XI; `[11..14]` are bench. Nothing in `process-transfer`, `run-draft-lottery`, or the React squad editor enforces this. If a user drags their captain to the bench (via a swap with a starter) and saves, `captain_id` still points to a player at index 12 → captain bonus skipped entirely, captain plays no points to the squad total.

There's also no fallback (no vice-captain), and no warning to the user.

**Fix:**
- Either enforce in DB: a trigger on `squads` UPDATE that requires `captain_id IN squad.players[0..10]`.
- Or compute in scoring: if `captain_id` is on the bench, treat first eligible starter as vice-captain. Match FPL conventions.

**Test:** Edit squad with captain at slot 13, run scoring → expect captain doubling to still apply via vice-captain logic, or expect explicit user warning at squad save.

---

### L3.6 (MEDIUM) — `fantasy_points.points_breakdown` JSONB only records the most recent fixture
**File:** `supabase/functions/calculate-scores/index.js:473-479`

```js
return {
  squad_id, matchday_id,
  total,
  points_breakdown: { fixture_id, player_count: pitchPlayers.length },
};
```

`points_breakdown` is overwritten each call. For a round with 5 fixtures, only the 5th call's breakdown survives. The total is correct (merged) but the audit trail is lost — debugging "where did this 47 come from?" requires guessing.

**Fix:** Make it cumulative:
```js
points_breakdown: { fixtures: [...prevFixtureIds, fixture_id], player_count: pitchPlayers.length }
```
Read the existing row first, append.

Or move the per-fixture detail to a dedicated `fantasy_points_audit` table.

---

### L3.7 (MEDIUM) — Bet `reward_type='budget'` is never honored anywhere
**File:** `supabase/migrations/28_bets_system.sql:16-17, 37-38`

Templates and instances both support `reward_type IN ('points','budget')`. The default is `'points'` and `aggregate_league_member_points` sums `reward_awarded` directly into `total_points` without checking `reward_type`. If a commissioner creates a bet with `reward_type='budget'`:
- The bet resolves: `bet_submissions.reward_awarded = 5`.
- Aggregate adds 5 to standings (wrong — should add 5 to budget, not points).
- `squads.budget_remaining` is never touched.

**Fix (in `aggregate_league_member_points`):**
```sql
-- Only sum 'points' rewards into total_points
SELECT COALESCE(SUM(bs.reward_awarded), 0) INTO v_bet_rewards
FROM bet_submissions bs
JOIN bet_instances bi ON bi.id = bs.bet_instance_id
JOIN squads s         ON s.id = bs.squad_id
WHERE bi.league_id      = p_league_id
  AND s.user_id          = p_user_id
  AND bs.reward_awarded IS NOT NULL
  AND bi.status          = 'resolved'
  AND bi.reward_type     = 'points';

-- New: separate logic for budget rewards in a new RPC or in resolve_bet itself
-- on resolve, also: UPDATE squads SET budget_remaining = budget_remaining + reward_value WHERE id = ...
```

**Test:** Create bet with `reward_type='budget'`, reward_value=5, resolve correctly. User's `total_points` unchanged; `budget_remaining` increases by 5.

---

### L3.8 (LOW) — Aggregate counts only `bi.status = 'resolved'`, but trigger fires on `reward_awarded`
**File:** `supabase/migrations/37_fix_aggregate_league_member_points.sql:30`

```sql
AND bi.status = 'resolved';
```

This is correct guard against partial-resolution. But the trigger from migration 29 fires on `bet_submissions.reward_awarded IS NOT NULL AND OLD.reward_awarded IS NULL` — and `resolve_bet` sets BOTH `bet_instances.status='resolved'` AND `bet_submissions.reward_awarded` in the same transaction. Race-free because both happen in a single SQL UPDATE-then-UPDATE in `resolve_bet`, but a future refactor that splits these could break it. Document the invariant.

---

### L3.9 (LOW) — Bet `reward_awarded` is sumable but contains 0s for losers
**File:** `supabase/migrations/28_bets_system.sql:232`

```sql
SET reward_awarded = CASE WHEN answer = p_correct_answer THEN v_instance.reward_value ELSE 0 END
```

Losers get `reward_awarded = 0` (not NULL). `aggregate` filters `IS NOT NULL` — so 0 rows are included in the SUM but contribute 0. Cosmetic only, but conflates "I bet and lost" with "I bet and won 0 (impossible)" in analytics queries.

**Fix:** Use NULL for losers:
```sql
SET reward_awarded = CASE WHEN answer = p_correct_answer THEN v_instance.reward_value END
```

---

## 4. Cross-Pipeline Inconsistencies

### L4.1 (HIGH) — `matchday_id` format diverges across writers
Already raised in CODE_AUDIT (DATA-10). Recap in this context:
- `calculate-scores` writes `'{tournament_id}-r{round}'` (e.g. `'426-r35'`) or falls back to `squad.matchday_id || 'current'`.
- `matchday_deadlines` (per CLAUDE.md) is canonical `'{tournament_id}-r{round}'`.
- `chips_used.matchday_id` is whatever `squads.matchday_id` was at the time (varies — could be `'md1'`, `'current'`, etc.).
- `daily_jokers` keys on `joker_date DATE`, not matchday_id at all.

Result: `chips_used` consistency check (`matchday_id <> v_squad.matchday_id`) can be foiled if a squad's matchday_id mutated between chip activations.

---

### L4.2 (MEDIUM) — Multiple unique constraints on `fantasy_points` (squad_id, matchday_id)
Already raised in CODE_AUDIT (DATA-3). Logically: the upsert in `rollupSquads` uses `onConflict: 'squad_id,matchday_id'` which matches both `fantasy_points_squad_matchday_key` (migrations 10/13) and `fantasy_points_squad_matchday_unique` (migration 63). Postgres will pick one — usually the first one created. Functionally OK, schematically dirty, fresh-DB-broken.

---

### L4.3 (MEDIUM) — `bet_submissions` has two unique constraints on the same columns
**Files:** `supabase/migrations/28_bets_system.sql:62` and `supabase/migrations/43_bet_submission_unique.sql:5-7`

Migration 28 declares `UNIQUE (bet_instance_id, squad_id)` as an inline table constraint (auto-named `bet_submissions_bet_instance_id_squad_id_key`). Migration 43 adds the same with name `bet_submissions_unique_squad_bet`.

The frontend (`src/hooks/useBetSubmit.js:27`) detects duplicates by checking for the named constraint string. The unnamed one would fire first on conflict, so the friendly message wouldn't trigger in some paths.

**Fix:** Drop the auto-named one:
```sql
ALTER TABLE bet_submissions
  DROP CONSTRAINT IF EXISTS bet_submissions_bet_instance_id_squad_id_key;
```
Keep only `bet_submissions_unique_squad_bet`. Update the upsert `ON CONFLICT (bet_instance_id, squad_id)` — Postgres resolves it by column list regardless of name.

---

### L4.4 (LOW) — `LiveScreen` independently recomputes captain doubling
**File:** `src/screens/LiveScreen.jsx:416-421`

```js
const enrichedPlayers = (playerRows || []).map(p => {
  let pts = pointsMap[p.id] || 0;
  if (p.id === captainId) pts *= isTripleCap ? 3 : 2;
  return { ...p, points: pts, live: livePlayerSet.has(p.id) };
});
```

This is fine on its own, but it's **a parallel implementation** of the captain logic in `calculate-scores`. If the rules change (e.g., wildcard semantics get touched per L1.4), both must update.

**Fix:** Read `fantasy_points.total` (already includes captain multiplier) for the matchday total. Use `player_match_stats.fantasy_points` for individual-player live ticker, but don't re-apply captain on the client. Or extract a single `applyChips(squad, pointsByPlayer)` utility used by both server and client.

---

## 5. Correction Plan (logic-focused)

The first three fixes are mandatory before any further work; everything else can land incrementally.

### Phase 1 — Unblock standings (≈90 min)
One new migration `66_logic_fix_aggregation.sql` containing:
1. **L3.2** — `ALTER COLUMN total_points TYPE NUMERIC(10,2)`.
2. **L3.1** — `CREATE OR REPLACE` `aggregate_league_member_points` with the UPDATE statement restored.
3. **L3.3** — Add `recompute_league_ranks` + trigger.
4. **L3.7** — Filter aggregation to `reward_type='points'`.
5. **L3.9** — Use NULL not 0 for losers (and adjust aggregate filter accordingly).

**Manual verification:**
```sql
-- Force-recompute every league_member and ensure standings reflect history
DO $$
DECLARE r record;
BEGIN
  FOR r IN (SELECT league_id, user_id FROM league_members) LOOP
    PERFORM aggregate_league_member_points(r.league_id, r.user_id);
  END LOOP;
END $$;

-- Spot-check 3 known users in 3 leagues against their fantasy_points + bet_submissions
```

### Phase 2 — Restore tournament-aware scoring (≈90 min)
One migration `67_scoring_rules.sql` containing:
1. **L1.1** — Create `scoring_rules` table with the JSONB shape `calculate-scores` expects.
2. Seed EPL (426) rules.
3. Drop the unused `scoring_templates` / `calculate_player_points` / `upsert_scoring_rules` / `get_event_points` / `get_scoring_template` (after grep-confirming no callers).
4. **L1.9** — Drop the broken `calculate_player_points` function.

**Test:** Edit `scoring_rules` row for GK goal = 10 in DB → re-run scoring → fantasy_points reflects 10.

### Phase 3 — Mechanic fixes in edge functions (≈2 hours, one PR per function)
- **L1.2** — Decide `conceded_per_goal` policy (per-goal vs per-2-goals), update calc + breakdown + UI.
- **L1.3** — Replace `||` with `??` + NaN guard in rollupSquads.
- **L1.4** — Choose wildcard semantics; either move to `process-transfer` gate or apply once at total level.
- **L1.5** — Wire Joker into scoring (or remove from UI if not shipping yet).
- **L1.6** — Accept both `'sub'` and `'sub_off'` event types in Path B.
- **L1.7** — Fix `penalty_missed` event type tagging in ingest.
- **L1.8** — Apply `mins >= 60` at clean_sheet derivation in Path B.
- **L3.4** — Hard-fail (with `logError`) when `round_number` or `tournament_id` is missing in rollupSquads.
- **L3.5** — Decide vice-captain policy; add DB constraint or scoring fallback.
- **L3.6** — Make `points_breakdown` cumulative.

### Phase 4 — Bet resolution polish (≈90 min)
- **L2.1** — Validate `p_correct_answer` is one of options.
- **L2.2** — Return `winners` + `total` separately.
- **L2.4** — Either auto-resolver edge function on `resolves_at` or remove the column.
- **L2.5** — Reset `is_correct/reward_awarded` on `submit_bet` UPSERT.
- **L2.6** — `!inner` in useBettingLeaderboard.
- **L2.7** — Filter Realtime subscription.
- **L4.3** — Drop duplicate `bet_submissions` unique constraint.

### Phase 5 — Frontend chip consolidation (≈45 min)
- **L4.4** — Single `applyChips()` utility, replace inline logic in LiveScreen.

---

## 6. Manual Verification Checklist

Use this after Phase 1+2 land, before Phase 3:

```sql
-- 1. Aggregation works end-to-end
WITH expected AS (
  SELECT s.user_id, s.league_id,
         SUM(fp.total) + COALESCE((
           SELECT SUM(bs.reward_awarded)
           FROM bet_submissions bs JOIN bet_instances bi ON bi.id = bs.bet_instance_id
           WHERE bs.user_id = s.user_id AND bi.league_id = s.league_id
             AND bi.reward_type='points' AND bs.reward_awarded IS NOT NULL
         ), 0) AS expected_total
  FROM squads s JOIN fantasy_points fp ON fp.squad_id = s.id
  GROUP BY s.user_id, s.league_id
)
SELECT e.user_id, e.league_id, e.expected_total, lm.total_points,
       e.expected_total - lm.total_points AS diff
FROM expected e
JOIN league_members lm ON lm.user_id = e.user_id AND lm.league_id = e.league_id
WHERE ABS(e.expected_total - lm.total_points) > 0.01;
-- Expect: 0 rows.

-- 2. Ranks are monotonic with total_points
SELECT league_id,
       BOOL_OR(prev_rank IS NOT NULL AND total_points > prev_pts) AS broken_order
FROM (
  SELECT league_id, total_points, rank,
         LAG(total_points) OVER (PARTITION BY league_id ORDER BY rank) AS prev_pts,
         LAG(rank)         OVER (PARTITION BY league_id ORDER BY rank) AS prev_rank
  FROM league_members
) t
GROUP BY league_id
HAVING BOOL_OR(prev_rank IS NOT NULL AND total_points > prev_pts);
-- Expect: 0 rows.

-- 3. No frozen rows after recompute
SELECT user_id, total_points
FROM league_members
WHERE total_points IS NULL OR total_points = 0
ORDER BY league_id;
-- Investigate any non-trivial leagues with 0 here.

-- 4. scoring_rules populated
SELECT tournament_id, position FROM scoring_rules ORDER BY 1, 2;
-- Expect 5 rows for EPL (426): GK, DEF, MID, FWD, UNIVERSAL.

-- 5. No 'current' matchday_id rows
SELECT count(*) FROM fantasy_points WHERE matchday_id = 'current';
-- Expect 0 after cleanup.
```

```js
// 6. Smoke test from browser console (any league member)
const { data } = await supabase
  .from('league_members')
  .select('total_points, rank, users(username)')
  .order('total_points', { ascending: false });
console.table(data);
// Ranks should be 1, 2, 3, ... in order; total_points monotone-decreasing.
```

---

## 7. Improvement Opportunities (logic-coherence, non-blocking)

1. **Single source of truth for chip math** — extract `applyChips({ basePts, isCaptain, isTripleCaptain, isWildcard, isJoker })` to a shared util. Use server-side AND client-side (LiveScreen, breakdowns). Eliminates L4.4 entirely.

2. **`fantasy_points_audit` log table** — one row per `(squad_id, fixture_id)` instead of per matchday. Solves L3.6 cleanly and makes "explain my 47 pts" trivial.

3. **Move all aggregation to a materialized view** — `league_standings_mv` refreshed on insert/update of `fantasy_points` or `bet_submissions`. Removes the trigger fragility and makes adding new reward types (cup bonuses, achievements) a join, not a code change.

4. **Bet auto-resolver** — once `resolves_at` is honored, multiple template types can self-resolve from existing data:
   - `match_result` → lookup `fixtures.home_score / away_score`.
   - `top_scorer` → `SELECT player_id FROM player_match_stats WHERE fixture_id IN (round fixtures) ORDER BY goals DESC LIMIT 1`.
   - `player_block` (per migration 28 seed) → `fantasy_points` for that player < 5.
   No commissioner action needed for most bets.

5. **Tournament-scoped scoring tests** — once `scoring_rules` works, add a smoke E2E that loads a non-EPL ruleset (e.g. WC) and asserts a goal awards different points than EPL. Catches regressions like "we silently fell back to EPL fallback".

6. **Replace `points_earned` in `daily_jokers` with a write from a Joker resolver** — currently dead column. Either populate it nightly from the prior day's player_match_stats or remove the column.

7. **Constraint: `captain_id IN squad.players[0..10]`** — enforce at write time so L3.5 can't happen.

---

# 8. Draft Player Allocation — Logic Issues (added 2026-05-24)

The draft is a key fairness mechanic. Two functions implement it:
- `run-draft-lottery` (`02_draft_system.sql` + edge function): random tiebreaker for contested picks
- `run-reverse-standings-draft` (`08_reverse_draft_cron.sql` + edge function): worst-standings-wins tiebreaker, used at GROUP_STAGE → PRE_ELIMINATION

I traced both end-to-end. Findings below extend the existing `L1.x` / `L2.x` / `L3.x` schema with `L5.x` (draft) and `L6.x` (relaxation/pool).

## Critical

### L5.1 (CRITICAL) — Lottery awards player to user A but allocation may drop them without re-running the lottery
**File:** `supabase/functions/run-draft-lottery/index.js:86-140`

The flow is:
1. Per contested player, randomly pick a `winner` user.
2. Per user, walk their priority list and skip any player where `awardedTo[pid] !== userId`.
3. Inside that walk, also skip if position cap reached or budget would exceed 100.

If user A wins Haaland in the lottery but, by the time the allocator reaches Haaland in A's list, A's FWD cap is full (already took Mbappé from earlier in their list) or budget is exhausted — **Haaland is silently dropped from A's squad and goes to no one**. The other contestants who wanted Haaland never get a runner-up shot. A's `unresolved_slots` count goes up by one; the pool loses a player that should still have been awarded.

**Fix:** Two-pass allocation. First pass attempts allocation per the current logic. If a lottery-awarded player is skipped due to caps/budget, mark it as "released" and feed it back through a second round of lottery among the original wanters minus user A. Repeat until no released players remain or no eligible wanters left.

**Test:** Construct a scenario — user A has 3 forwards earlier than Haaland in priority list; user B wants Haaland. A wins lottery on Haaland but exhausts FWD cap on his earlier 3. Expected: Haaland goes to B. Today: Haaland goes to no one.

### L5.2 (CRITICAL) — `run-draft-lottery` has no idempotency guard or transaction
**File:** `supabase/functions/run-draft-lottery/index.js:49-190`

The cron mode at lines 28-42 calls `runLottery` in parallel via `Promise.all`. If the cron fires twice (network retry, scheduler hiccup, or manual trigger overlapping with cron), two `runLottery` invocations against the same `league_id` race:
- Both load `submissions` where `status='pending'` (still pending — first hasn't completed the UPDATE yet)
- Both compute independent random allocations (different `Math.random` rolls)
- Both upsert `draft_allocations` (second overwrites first)
- Both upsert `squads` (second overwrites first, but with different player set)
- Both INSERT a `gazette_entries` row (two reports for the same draft, contradictory)
- Both UPDATE `draft_submissions` to `processed` — idempotent

Net: the allocation that "wins" is whichever upsert lands last. The gazette has two contradicting reports. There is **no transaction** wrapping the four writes.

**Fix:** Add a top-of-function idempotency gate:
```js
const { data: claimed, error: claimErr } = await supabase
  .from('draft_submissions')
  .update({ status: 'processing' })
  .eq('league_id', leagueId)
  .eq('status', 'pending')
  .select('user_id, player_ids');
if (claimErr || !claimed?.length) return { message: 'Already processed or claim failed', leagueId };
// Use `claimed` as the working set, not a separate SELECT
```
Wrap the 4 writes in a single PostgreSQL stored procedure (`process_draft(p_league_id UUID)`) called via `rpc()`. PostgreSQL functions are atomic — partial failures roll back.

### L5.3 (CRITICAL) — `Math.random()` is non-cryptographic and non-reproducible
**File:** `supabase/functions/run-draft-lottery/index.js:94`

```js
const winner = wanters[Math.floor(Math.random() * wanters.length)];
```

`Math.random()` in V8 is non-cryptographic. Two issues:
1. **Auditability** — if a user complains "Haaland should have come to me", there's no way to verify the roll. No seed, no log of the random sequence.
2. **Replay disputes** — re-running the same lottery (e.g. for testing) produces different results.

For a fairness-critical mechanic this is weak. **Fix:**
- Use `crypto.getRandomValues()` for the actual randomness.
- Log the random outcome alongside each contested player: `contestedPlayers.push({ pid, wanters, winner, seed: hex })`.
- Persist that to `gazette_entries.full_data` so disputes are auditable.

### L5.4 (CRITICAL) — `run-reverse-standings-draft` uses outdated hardcoded constants
**File:** `supabase/functions/run-reverse-standings-draft/index.js:14-15`

```js
const SQUAD_POS_CAPS = { GK: 2, DEF: 5, MID: 5, FWD: 3 };
const SQUAD_SIZE     = 15;
```

The lottery sibling was updated (uncommitted diff) to read these from `leagues.squad_size` / `leagues.position_limits`. The reverse-standings function still uses hardcoded constants. A league configured with a custom `squad_size = 11` will get a 15-player elimination draft. Allocation lands 4 extra players who can't legally be in the squad.

**Fix:** Mirror the lottery's per-league config lookup pattern (`Promise.all([leagueRow, submissions])`). Apply per-league defaults.

## High

### L5.5 (HIGH) — Submission iteration order is non-deterministic; first submitter wins ties at allocation time
**File:** `supabase/functions/run-draft-lottery/index.js:105`

The `for (const sub of submissions)` loop iterates in DB return order. PostgreSQL doesn't guarantee return order without ORDER BY. If user A and user B both have player X at position 5 of their list, and user A wins X in the lottery, but A's allocation walks past X first — irrelevant. But: if a player Y is uncontested (only B wanted them), and `Y` happens to be position 6 of B's list, B reaches Y first → gets Y. If allocation order flips by DB return order, the position cap calculations can differ.

**Fix:** `ORDER BY user_id` in the submissions select to make the order deterministic. Document the ordering as the tiebreaker.

### L5.6 (HIGH) — Ties in reverse-standings are resolved by JS `reduce` order — non-deterministic
**File:** `supabase/functions/run-reverse-standings-draft/index.js:82-84`

```js
const winner = wanters.reduce((best, uid) =>
  (rankMap[uid] ?? Infinity) < (rankMap[best] ?? Infinity) ? uid : best
);
```

If two wanters have the same `total_points`, `reduce` returns the first one encountered — and `wanters` order comes from submission iteration order (L5.5). So ties are silently broken by whoever's `draft_submissions.user_id` happened to come back first. Reproducible across reruns? No, because PG return order isn't guaranteed.

**Fix:** Explicit secondary tiebreaker. Either:
- Random tiebreaker (with crypto random and audit log)
- Earliest `league_members.created_at` wins
- Sort by `user_id` lexicographically (cheap and reproducible)

### L5.7 (HIGH) — `playerRows.map` in reverse-standings has no null guard
**File:** `supabase/functions/run-reverse-standings-draft/index.js:60`

```js
const playerMap = Object.fromEntries(playerRows.map(p => [p.id, p]));
```

If `playerRows` is null (RLS denial, timeout, network blip), this throws `TypeError: Cannot read properties of null`. The function returns 500. The lottery sibling has `(playerRows ?? [])` in the uncommitted diff — reverse-standings doesn't.

**Fix:** `(playerRows ?? []).map(...)`.

### L5.8 (HIGH) — Hardcoded £100M budget cap ignores league config
**File:** `supabase/functions/run-draft-lottery/index.js:127`; `run-reverse-standings-draft/index.js:108`

```js
if (budgetUsed + player.price > 100) continue;
```

`leagues.budget` (or similar) is not consulted. League configured with £80M or £120M budget gets the wrong cap.

**Fix:** `const BUDGET = leagueRow?.budget ?? 100;` and use `BUDGET` everywhere.

### L5.9 (HIGH) — `squads` upsert uses `matchday_id: 'current'` post-draft
**File:** `supabase/functions/run-draft-lottery/index.js:161`

Already covered in CODE_AUDIT DATA-1 and UI_AUDIT U10. Specifically here: the draft outputs squads tagged `'current'`, which doesn't match the canonical `{tournament_id}-rN` format used by scoring. Squad won't be found when calculate-scores runs.

**Fix:** Resolve active matchday_id from `matchday_deadlines` using the league's tournament_id; write the canonical id.

### L5.10 (HIGH) — `unresolved_slots > 0` users have no recovery path scheduled
**File:** `supabase/functions/run-draft-lottery/index.js:180-188`

After the lottery, users with incomplete squads (`unresolved_slots > 0`) get a gazette mention ("first available picks now open"), but no edge function or cron actually opens free agency or invites them to fill. The frontend `DraftRecoveryScreen` exists but the user must navigate there manually. Many will not realise.

**Fix:** After the lottery, send an in-app notification + email (when wired) to managers with `unresolved_slots > 0`. Optionally auto-open a 24h "free agency window" via `transfer_windows.window_type='unlimited'`.

### L5.11 (HIGH) — `draft_submissions` UNIQUE(league_id, user_id) blocks re-submission after edit
**File:** `02_draft_system.sql:36`; `DraftScreen.jsx:232-273`

DraftScreen lets a user `Edit` after submitting. The upsert re-uses the same row (UNIQUE constraint) and flips `status` back to `pending`. But if the lottery has already processed the league, the user is now `pending` while everyone else is `processed`. The next cron tick on `run-draft-lottery` will find this lone pending submission and run a **second lottery for a single user** against an empty contention pool — awarding them any available player they ranked, potentially overlapping with someone else's already-allocated squad.

**Fix:** Disable Edit after `status='processed'` (covered in UI_AUDIT U25). Alternatively, gate `runLottery` to only process if ALL submissions are pending.

## Medium

### L5.12 (MEDIUM) — No validation of submission player_ids (e.g., player from another tournament)
**File:** `supabase/functions/run-draft-lottery/index.js:69-75`

`playerRows` is loaded with `.in('id', allPlayerIds)`. If a user's submission includes player IDs from a different tournament (e.g., EPL player in a WC draft via stale URL or malicious POST), they appear in `playerMap` and become allocable. No tournament-scoped filter.

**Fix:** `.eq('tournament_id', leagueRow.tournament_id)` on the players select.

### L5.13 (MEDIUM) — `draft_submissions` size not capped
The frontend has `draft_list_size` in league_config (default 30) but `run-draft-lottery` accepts any array length. A malicious or buggy client could submit 10,000 player IDs — the allocator still terminates due to `SQUAD_SIZE` cap, but the cross-product `wantedBy` computation becomes expensive across all submissions.

**Fix:** Cap incoming `player_ids` at `draft_list_size` (read from league_config) and truncate / reject if longer.

### L5.14 (MEDIUM) — Lottery doesn't break the per-user fairness across contested wins
**File:** `supabase/functions/run-draft-lottery/index.js:90-98`

The lottery is independent per contested player. If 10 players are contested between users A and B with equal priority, the binomial distribution can hand A 8 wins out of 10. This is statistically fair per pick but globally unfair across picks. FPL-style snake drafts mitigate this via alternating turn order.

**Fix (optional):** Track per-user "lottery wins" counter during allocation; if user has won > median wins, weight the next contested lottery against them. Or accept current behavior as documented chance.

### L5.15 (MEDIUM) — Gazette stores `bullets` as JSON.stringify of an array, not JSONB array
**File:** `run-draft-lottery/index.js:235`; `run-reverse-standings-draft/index.js:205`

`gazette_entries.bullets` is typed JSONB. The functions do `JSON.stringify(bullets)` and pass the resulting text. Supabase JS will accept this as a JSON string, but the column ends up as a JSON-encoded text wrapper instead of a native JSON array. Frontend rendering may need a double-parse. `full_data` has the same issue.

**Fix:** Pass the array directly without `JSON.stringify` — Supabase will JSON-serialize for JSONB.

### L5.16 (MEDIUM) — `reverse-standings` cron only fires at GROUP_STAGE → PRE_ELIMINATION but no UI shows the transition
**File:** `08_reverse_draft_cron.sql:21`; `src/screens/DraftScreen.jsx`

The cron checks `l.cup_phase = 'group_stage'` AND a deadline condition. Users in those leagues see no countdown, no notification, no "elimination draft starts in X" UI. They'll be surprised when their squad changes.

**Fix:** Surface cup phase transitions in the LeagueScreen header and via notifications.

## Low

### L5.17 — Gazette `bullets` for top 3 contested players doesn't resolve user IDs / player names
**File:** `buildGazetteEntry` in both functions — bullets ship `player_id` and `winner_id` UUIDs. Frontend must do a separate lookup. Could embed labels at write time.

### L5.18 — `unresolved_slots` truncation
If `allocated.length` somehow exceeds SQUAD_SIZE (it can't given the loop guard, but if a future bug allows it), `unresolved_slots = SQUAD_SIZE - allocated.length` goes negative. `Math.max(0, ...)` guard exists in reverse-standings but not in lottery.

---

# 9. Relaxation Formula / Cup Pool — Logic Issues (added 2026-05-24)

The relaxation system is intended to relax the "no-repeat" rule (one copy of each player across all squads in a league) as the available player pool shrinks via cup eliminations. Implemented across:
- `06_cup_pool_management.sql` (cup_active_clubs + RPCs)
- `07_relaxation_formula.sql` (`calculate_relaxation_state`, `apply_relaxation_state`)
- `calculate-relaxation` edge function (broadcaster)
- `eliminate-cup-club` edge function (trigger)
- `useRelaxationState` hook (frontend read)
- `DraftScreen` / `DraftRecoveryScreen` (UI banner)

I traced this end-to-end. **The pipeline is entirely cosmetic.** The UI displays a banner; nothing in transfers, drafts, or auctions enforces `repeats_allowed`.

## Critical

### L6.1 (CRITICAL) — `repeats_allowed` is computed but never enforced anywhere
**Files searched:** `process-transfer/index.js`, `run-draft-lottery/index.js`, `run-reverse-standings-draft/index.js`, `MarketScreen.jsx`, `PlayerPickerSheet.jsx`, `useTransfer.js` — **zero references** to `repeats_allowed`, `relaxation`, or `current_repeats_allowed`.

The whole relaxation system computes a tier, persists it, and broadcasts via gazette — and no code path actually limits how many times a player can be held across squads in the league. The "no-repeat rule" itself isn't enforced either: `process-transfer` doesn't check whether another squad in the league already owns the player being bought.

**Net:** the user sees a banner saying "Pool pressure 80% — 1 repeat allowed per squad", but they could already buy the same player as their rival before AND after this tier change. The banner is a lie.

**Fix:** Two layers:
1. **Per-transfer enforcement.** In `process-transfer`, before allowing a `buy`, check:
   ```sql
   SELECT COUNT(*) FROM squads
   WHERE league_id = $league_id
     AND $player_id = ANY(players)
     AND user_id <> $user_id;
   ```
   If count > `repeats_allowed` (from `league_config.current_repeats_allowed`), reject the buy.
2. **Per-draft enforcement.** The lottery already enforces uniqueness by awarding each player to exactly one user (`awardedTo[pid] = winner`). This is stricter than the relaxation system — relaxation lets multiple users hold the same player as the pool shrinks. The lottery would need to award winners as `[winner1, winner2, ...]` up to `1 + repeats_allowed`. Complex change; for the test phase, lock the lottery to current strict behavior and only relax in post-draft transfers.

### L6.2 (CRITICAL) — UI displays `pressure` as a percentage but SQL returns it as a 0-1+ ratio
**Files:** `07_relaxation_formula.sql:81` (`pressure := (n_managers * 15.0) / available`); `DraftScreen.jsx:349` (`{Math.round(relaxation.pressure)}%`); `DraftRecoveryScreen.jsx:332`

SQL `pressure` for 10 managers and 200 players = `150/200 = 0.75`. UI does `Math.round(0.75)` → renders as **"1%"**. The traffic-light threshold `relaxation.pressure >= 70` requires the raw ratio to be 70+ — i.e., 70× over-subscribed — essentially never. Tier 0 always lights green; users never see the warning.

**Fix:** Either change SQL to return a percentage (`ROUND(pressure * 100, 1)`) — but then the tier thresholds inside the function become `cfg.base * 100`, `* tier2_mult`, etc., requiring re-baselining of config values. OR keep SQL as ratio and fix UI: `Math.round(relaxation.pressure * 100)`. Pick one; recommend the UI fix.

**Test:** With 10 managers and 200 players → UI should show "75%" not "1%". With 10 managers and 100 players → "150%" — clearly tier 1+.

### L6.3 (CRITICAL) — `cup_active_clubs` is never auto-seeded
**Files:** `06_cup_pool_management.sql:10-19` defines `seed_cup_clubs(league_id)`. **Grep finds zero callers** — no migration, edge function, frontend, trigger, or cron calls it.

For relaxation to compute anything meaningful, a league must have `cup_active_clubs` rows. Without them, `get_cup_pool_stats` returns `active_clubs=0, available_players=COUNT(players)` (full pool fallback), so pressure = `n_managers*15 / total_players` — tiny ratio, always tier 0.

**Fix:** Two options:
1. **Trigger on league creation:** add an `AFTER INSERT ON leagues` trigger that calls `seed_cup_clubs(NEW.id)` whenever `format='cup'` (or whatever the cup indicator is).
2. **Manual call in `create_league` RPC** if it exists.

**Test:** Create a new cup league → `SELECT COUNT(*) FROM cup_active_clubs WHERE league_id = $1` should return the full club count.

## High

### L6.4 (HIGH) — `seed_cup_clubs` doesn't scope by tournament
**File:** `06_cup_pool_management.sql:13-17`

```sql
INSERT INTO cup_active_clubs (league_id, club_id)
SELECT DISTINCT p_league_id, club FROM players
WHERE club IS NOT NULL AND club <> '';
```

This grabs every distinct `club` from the entire `players` table — across all tournaments. A WC2026 league would include Manchester City, Arsenal, Liverpool (EPL clubs) in its cup pool. When EPL clubs are eliminated from the EPL, the WC league's pool shrinks too. Cross-contamination.

**Fix:**
```sql
INSERT INTO cup_active_clubs (league_id, club_id)
SELECT DISTINCT p_league_id, p.club
FROM players p
JOIN leagues l ON l.id = p_league_id
WHERE p.tournament_id = l.tournament_id
  AND p.club IS NOT NULL AND p.club <> '';
```

### L6.5 (HIGH) — `get_cup_pool_stats` `available_players` doesn't filter by tournament either
**File:** `06_cup_pool_management.sql:86-87`

```sql
SELECT COUNT(*) INTO total_players FROM get_cup_available_players(p_league_id);
```

`get_cup_available_players` joins `players` ↔ `cup_active_clubs` on club only. Same cross-tournament problem as L6.4. If `cup_active_clubs` has been correctly scoped (L6.4 fix), this resolves automatically. If not, doubles the bug.

### L6.6 (HIGH) — Squad size hardcoded at 15 in the pressure formula
**File:** `07_relaxation_formula.sql:81`

```sql
pressure := (n_managers * 15.0) / available;
```

Leagues with `squad_size != 15` get wrong pressure. League with 11-player squads would see misleadingly low pressure (74% smaller). Tier thresholds never trip.

**Fix:** Read squad_size from `leagues.squad_size` or `league_config`:
```sql
SELECT COALESCE(squad_size, 15) INTO v_squad_size FROM leagues WHERE id = p_league_id;
pressure := (n_managers * v_squad_size) / available;
```

### L6.7 (HIGH) — `useRelaxationState` calls `calculate_relaxation_state` (read-only), but `apply_relaxation_state` is what persists the tier
**Files:** `useRelaxationState.js:20`; `07_relaxation_formula.sql:91`

The hook calls `calculate_relaxation_state` which does NOT write to `league_config`. Only `apply_relaxation_state` (called from `calculate-relaxation` edge function, triggered by `eliminate-cup-club`) persists `current_relaxation_tier` and `current_repeats_allowed`.

Net: the UI's view of "current tier" can differ from what's stored in `league_config` between elimination events. Any enforcement layer (when L6.1 is built) reading `league_config.current_repeats_allowed` would be stale relative to the UI banner.

**Fix:** Standardize on `apply_relaxation_state` for both UI fetch and enforcement reads. OR have the UI fetch the persisted `current_repeats_allowed` from `league_config` instead of recomputing.

### L6.8 (HIGH) — `useRelaxationState` fetches once on mount, never re-subscribes
**File:** `src/hooks/useRelaxationState.js`

When a club is eliminated mid-session, the UI banner stays stale until the user reloads. The `calculate-relaxation` function broadcasts gazette entries but nothing pings the hook.

**Fix:** Add a Realtime subscription on `gazette_entries` filtered by `entry_type='breaking_news'` (or a dedicated channel) that re-fetches the relaxation state when a tier-change entry arrives.

### L6.9 (HIGH) — `useRelaxationState` uses `.single()` on a scalar-returning RPC
**File:** `src/hooks/useRelaxationState.js:21`

`calculate_relaxation_state` returns `JSON` (a scalar), not a TABLE. PostgREST might wrap this as `[{...}]` or `{...}`; calling `.single()` is fragile.

**Fix:** Drop `.single()` and read `data` directly — verify the actual shape in Supabase logs first.

## Medium

### L6.10 (MEDIUM) — `calculate-relaxation` is called fire-and-forget from `eliminate-cup-club`
Already noted in CODE_AUDIT DATA-14. Tier transition can be lost if the edge runtime finalizes before the HTTP call completes.

### L6.11 (MEDIUM) — Tier thresholds don't account for squad_size variability in the multipliers
**File:** `07_relaxation_formula.sql:64-76`

`tier2_mult=1.4`, `tier3_mult=1.8` are absolute multipliers of the base threshold. Once L6.6 (squad_size) is honored, the threshold becomes scaled — but the multiplier constants weren't calibrated for variable squad sizes. With squad_size=11, pressure values shift down by 11/15 = 0.73× — tier transitions happen later than designed.

**Fix:** Document the recalibration once L6.6 lands; consider expressing thresholds as fractions of squad_size rather than absolute ratios.

### L6.12 (MEDIUM) — `n_managers` from `COUNT(*) FROM league_members` counts removed users if rows aren't deleted
**File:** `07_relaxation_formula.sql:45-46`

If a manager quits the league, the convention may be to soft-delete (status flag) rather than delete the row. The relaxation formula sees the same `n_managers` and computes the same pressure. The actual slot demand drops but pressure doesn't.

**Fix:** Filter by `status='active'` if such a column exists, or `LEFT JOIN squads s ON s.user_id = lm.user_id` and count only members with squads.

### L6.13 (MEDIUM) — Gazette message wording promises enforcement that doesn't exist
**File:** `calculate-relaxation/index.js:43-48`

Bullets say "Each manager may now hold up to N repeated player(s)". With L6.1 unfixed, this is a lie — managers can already hold any number of repeats (because nothing prevents it). When L6.1 lands, this message becomes truthful.

**Fix:** Tie the gazette message to actual enforcement deployment. Until L6.1 ships, suppress the bullets that claim enforcement.

## Low

### L6.14 — `TIER_LABELS` regex parse is fragile
**File:** `calculate-relaxation/index.js:48`

`TIER_LABELS[new_tier].match(/\d+/)?.[0]` extracts the integer from the label string. Brittle if labels are translated or restructured.

### L6.15 — Tier-0 message suppressed by check `if (tier_changed && new_tier > 0)`
The user is never gazetted when tier drops back to 0 (no repeats allowed again). That might be intentional (no spam) or a bug (users not told the rule re-tightened). Document the intent.

### L6.16 — `repeats_allowed` integer schema conflict with NULL semantics
`current_repeats_allowed` stored as JSON null vs integer 0 makes downstream queries awkward. JSON `null` vs SQL `NULL` are different in PostgREST. Future enforcement should explicitly check `IS NULL` vs `= 0`.

---

# 10. Combined Sprint Allocation for Draft + Relaxation

Adding to the sprint plan:

## Sprint 0 (release blockers)
- **L5.2** — Draft lottery idempotency gate + transaction wrapping (one cron retry currently produces conflicting allocations)
- **L5.4** — `run-reverse-standings-draft` per-league config (currently hardcoded 15)
- **L6.1** — Decide policy: enforce `repeats_allowed` in `process-transfer`, OR remove the relaxation UI banner until enforcement ships
- **L6.2** — Fix pressure percentage display (currently shows "1%" instead of "75%")

## Sprint 1 (will break shortly)
- **L5.1** — Two-pass allocation so capacity/budget skips don't drop awarded players
- **L5.3** — Crypto-random + audit log for lottery rolls
- **L5.6** — Deterministic tiebreaker in reverse-standings
- **L5.7** — Null guard on `playerRows` in reverse-standings
- **L5.8** — Per-league budget (drop hardcoded 100)
- **L5.9** — Draft writes canonical `matchday_id` (links to U10/DATA-1)
- **L5.11** — Disable `Edit` after `processed` (links to U25)
- **L6.3** — Auto-seed `cup_active_clubs` on cup-league creation
- **L6.4 / L6.5** — Tournament scoping on cup pool RPCs
- **L6.6** — Honor `squad_size` in pressure formula
- **L6.7 / L6.8 / L6.9** — `useRelaxationState` consistency + Realtime + RPC shape

## Sprint 2 (UX polish)
- **L5.5** — Deterministic submission ordering
- **L5.10** — Free-agency auto-window for `unresolved_slots > 0`
- **L5.12** — Tournament-scoped player validation in submission
- **L5.13** — Cap player_ids length at `draft_list_size`
- **L5.16** — Cup phase transition UI banner
- **L6.10** — `await` or `waitUntil` on `calculate-relaxation` invoke (links to DATA-14)
- **L6.11** — Recalibrate tier multipliers post squad_size fix
- **L6.12** — Filter `n_managers` by active members
- **L6.13** — Tie gazette wording to actual enforcement

## Sprint 4 (hygiene)
- **L5.14** — Optional global-fairness weighting in lottery
- **L5.15** — Drop `JSON.stringify` for JSONB columns
- **L5.17** — Embed names in gazette bullets
- **L5.18** — Add `Math.max(0, ...)` guard in lottery `unresolved_slots`
- **L6.14** — Stop parsing tier labels by regex
- **L6.15** — Decide tier-0 transition gazette policy
- **L6.16** — Standardize NULL vs 0 in `repeats_allowed`

---

End of logic audit (extended).
