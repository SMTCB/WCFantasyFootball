# Coin Challenges → Clubhouse Scope — Technical Specification

**For: Claude Code (implementation) · Prepared July 2026**

**One-line summary:** Re-scope P2P coin challenges from single-football-league to Clubhouse (`circle`) level, and add a manually-resolved "freeform" bet type for prop bets that aren't tied to any competition.

This is a spec to implement against, not a request to run anything yet. Every migration and RPC change listed below needs the exact-item chat approval CLAUDE.md requires before it touches the shared production database, and none of it should start until [Pending Prerequisite](#pending-prerequisite) is cleared.

---

## Quick Navigation

- [Decision & Why](#decision--why) — the product call this implements
- [Current State (grounded in code)](#current-state-grounded-in-code) — what's actually built today
- [Target Data Model](#target-data-model) — the schema this becomes
- [RPC Contract Changes](#rpc-contract-changes) — every function, old vs new
- [Migration Plan](#migration-plan) — phased, numbered, in order
- [Frontend Changes](#frontend-changes) — hooks, screens, routing
- [Open Product Decisions](#open-product-decisions) — need a call before Phase 2 starts
- [Pending Prerequisite](#pending-prerequisite)

---

## Decision & Why

Per discussion 2026-07-24: coin challenges move from **competition-scoped** (today: one football league) to **Clubhouse-scoped** (a `circle` — any member can challenge any other member, regardless of which competitions either plays). Read [P2P_BETTING_SYSTEM_DESIGN.md](P2P_BETTING_SYSTEM_DESIGN.md) and [P2P_BETTING_TECHNICAL_ASSESSMENT.md](P2P_BETTING_TECHNICAL_ASSESSMENT.md) first — those cover the original coin-economy design (rake, escrow, ledger invariants) that this spec does not repeat or change. This document is the delta on top of that design, informed by [CLUBHOUSE_CENTRIC_REDESIGN.md](CLUBHOUSE_CENTRIC_REDESIGN.md)'s "the Clubhouse is the room, sports are the tables" IA.

This isn't a new direction — it's closing a gap between what already shipped and what the schema allows:

- The Clubhouse **Settings tab** already has a toggle labeled *"Enable peer-to-peer bets across this Clubhouse"* (`src/screens/ClubhouseScreen.jsx:413`) — the product copy already promises Clubhouse-wide betting.
- The Clubhouse **Home tab** already surfaces a "Coin Wallet" shortcut and a "P2P Challenges" shortcut as Clubhouse-level entry points (`ClubhouseScreen.jsx:921–964`).
- The **wallet is already global per-user** (`coin_wallets.user_id UNIQUE`, one balance — not scoped to a league or circle at all), so the money layer needs zero changes for this move.
- Only `p2p_challenges` itself is over-scoped: hard-locked to one `leagues` row, one bet type, one sport.

## Current State (grounded in code)

| Fact | Evidence |
|---|---|
| `p2p_challenges.league_id` is `NOT NULL REFERENCES leagues(id)` | `supabase/migrations/204_p2p_challenges.sql:13` |
| `bet_type` accepts exactly one value: `'gw_total'` | `204_p2p_challenges.sql:16-17` |
| `create_p2p_challenge()` requires **both** challenger and opponent to be `league_members` of `p_league_id` | `204_p2p_challenges.sql:82-93` |
| `p2p_challenges_select` RLS policy gates read access on `league_members` | `204_p2p_challenges.sql:39-47` |
| `coin_wallets` is one row per user, globally — no league/circle scoping | `supabase/migrations/202_p2p_coin_ledger.sql:7-13` |
| Clubhouse membership already exists as `circles` / `circle_members (circle_id, user_id, role)` | `supabase/migrations/188_circle_layer.sql:15-30` |
| Per-sport competitions already join to a circle via junction tables: `circle_leagues`, `circle_paddocks`, `circle_player_boxes` | `188_circle_layer.sql:32-37`, `191_f1_paddocks_schema.sql:28`, `197_tennis_core_schema.sql:26` |
| **The current standalone `/challenges` screen is already broken for creation.** `ChallengeScreen.jsx:953` hardcodes `leagueId={null}` when opening the create-challenge modal (it's the global sidebar entry point, not opened from inside a specific league). `useChallenges(user?.id)` on line 687 likewise passes no `leagueId`. `create_p2p_challenge` inserts into a `NOT NULL` column and checks `league_members WHERE league_id = NULL`, so any challenge created from this screen today throws `NOT_LEAGUE_MEMBER` (or a not-null constraint violation) unconditionally. | `src/screens/ChallengeScreen.jsx:687,948-955`; `204_p2p_challenges.sql:13,82-93` |
| The "New Challenge" opponent field is a raw paste-a-user-ID text input, not a member picker | `ChallengeScreen.jsx:499-506` |

The last row matters for scoping this work: the global entry point is not a working feature today that Clubhouse-scoping would "migrate" — it's a dead end that Clubhouse-scoping actually fixes, because a `circle_id` gives the create flow a real, bounded set of eligible opponents to pick from for the first time.

## Target Data Model

### `p2p_challenges` — altered

```sql
-- New / changed columns
circle_id         uuid        NOT NULL REFERENCES circles(id) ON DELETE CASCADE,   -- new, primary scope
league_id         uuid        REFERENCES leagues(id) ON DELETE CASCADE,             -- now NULLABLE
paddock_id        uuid        REFERENCES paddocks(id) ON DELETE CASCADE,            -- new, nullable
player_box_id     uuid        REFERENCES player_boxes(id) ON DELETE CASCADE,        -- new, nullable
bet_type          text        NOT NULL DEFAULT 'gw_total'
                              CHECK (bet_type IN ('gw_total', 'freeform')),          -- widened
resolution_mode   text        NOT NULL DEFAULT 'auto'
                              CHECK (resolution_mode IN ('auto', 'manual')),        -- new
matchday_id       text,                                                            -- now NULLABLE (only for auto-resolve)
question          text        CHECK (char_length(question) <= 140),                -- new, required for freeform
proposed_winner_id uuid       REFERENCES auth.users(id),                            -- new, manual resolution
proposed_by       uuid        REFERENCES auth.users(id),                            -- new
proposed_at       timestamptz,                                                     -- new
status            text        NOT NULL DEFAULT 'pending'
                              CHECK (status IN (
                                'pending','accepted','declined','cancelled',
                                'resolved','expired','disputed'                     -- 'disputed' added
                              )),

-- New constraint: exactly one or zero competition references, and it must match bet_type
CONSTRAINT p2p_competition_shape CHECK (
  (bet_type = 'freeform' AND league_id IS NULL AND paddock_id IS NULL AND player_box_id IS NULL AND question IS NOT NULL)
  OR
  (bet_type = 'gw_total' AND league_id IS NOT NULL AND paddock_id IS NULL AND player_box_id IS NULL AND matchday_id IS NOT NULL)
);
```

**Why three nullable per-sport FKs instead of one polymorphic `(competition_type, competition_id)` pair:** the codebase already solved "attach a competition to a circle" this way — `circle_leagues` / `circle_paddocks` / `circle_player_boxes` — three real FKs with real referential integrity, not a polymorphic pointer. Matching that precedent means no new pattern to learn and the DB still enforces the reference is valid. `gw_total` is the only auto-resolve type today (football-only); F1/tennis auto-resolve competitor bets are Phase 3 (see below) and would add `'f1_points_total'` / `'tennis_box_total'` to the `bet_type` CHECK when built, each pairing with its own FK.

**Backfill for existing rows:** every existing `p2p_challenges` row has a `league_id`; `circle_id` backfills via `circle_leagues WHERE league_id = p2p_challenges.league_id` (a league can only belong to one circle in the current model — confirm this with a `SELECT league_id, COUNT(DISTINCT circle_id) FROM circle_leagues GROUP BY 1 HAVING COUNT(DISTINCT circle_id) > 1` before writing the backfill; if that returns zero rows the backfill is a clean single UPDATE).

### RLS — `p2p_challenges_select` rewritten

```sql
DROP POLICY "p2p_challenges_select" ON p2p_challenges;

CREATE POLICY "p2p_challenges_select" ON p2p_challenges
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM circle_members
      WHERE circle_members.circle_id = p2p_challenges.circle_id
        AND circle_members.user_id = auth.uid()
    )
  );
```

Caution: `circle_members`'s own read policy was patched for a recursion bug in `supabase/migrations/230_fix_circle_members_rls_recursion.sql`. Read that migration before touching anything that joins through `circle_members` in a policy — don't reintroduce the same recursive shape.

## RPC Contract Changes

| RPC | Old signature | New signature | Behavior change |
|---|---|---|---|
| `create_p2p_challenge` | `(p_league_id, p_opponent_id, p_matchday_id, p_stake_coins, p_message)` | `(p_circle_id, p_opponent_id, p_bet_type, p_stake_coins, p_message, p_league_id DEFAULT NULL, p_matchday_id DEFAULT NULL, p_question DEFAULT NULL)` | Eligibility check becomes `circle_members` (both parties). For `bet_type='gw_total'`, additionally require both parties be `league_members` of `p_league_id` **and** that league be linked to `p_circle_id` via `circle_leagues` — a competitor bet still needs both people to actually have a score. For `bet_type='freeform'`, no competition check at all, `p_question` required. |
| `accept_p2p_challenge` | `(p_challenge_id)` | unchanged | No signature change — opponent-only, status-only gate, unaffected by scope. |
| `decline_p2p_challenge` | `(p_challenge_id)` | unchanged | Same. |
| `cancel_p2p_challenge` | `(p_challenge_id)` | unchanged | Same. |
| `get_my_challenges` | `(p_league_id DEFAULT NULL)` | `(p_circle_id DEFAULT NULL)` | Filters by circle instead of league. Passing `NULL` still returns challenges across every circle the user is in (mirrors today's all-leagues behavior when called with no arg). |
| `expire_stale_challenges` | `()` | unchanged | Still applies to any `status='pending'` row past `expires_at`, regardless of `bet_type`. |
| `auto_resolve_p2p_challenges` | `()` | unchanged, add one guard | Add `WHERE resolution_mode = 'auto'` to the existing query so it never touches freeform rows. (This function was already patched once for an invalid `DISTINCT` — migration 234 / PR [#745](https://github.com/SMTCB/WCFantasyFootball/pull/745) — read it before editing again.) |
| `declare_freeform_result` | *(new)* | `(p_challenge_id uuid, p_winner_id uuid)` | Either party on an `accepted` freeform challenge proposes a winner (`p_winner_id` may be neither party, i.e. a push/no-winner — model as nullable). Sets `proposed_winner_id`, `proposed_by = auth.uid()`, `proposed_at = now()`. No coin movement yet. |
| `confirm_freeform_result` | *(new)* | `(p_challenge_id)` | The **other** party (not `proposed_by`) confirms. Pays out exactly like `auto_resolve_p2p_challenges` does today (95% to winner, 5% rake burned; even split / refund if `proposed_winner_id IS NULL`). Sets `status='resolved'`. |
| `dispute_freeform_result` | *(new)* | `(p_challenge_id)` | The other party disputes instead of confirming. Sets `status='disputed'`. No coin movement — stakes stay in escrow. |
| `arbitrate_freeform_result` | *(new)* | `(p_challenge_id, p_winner_id)` | **Circle owner only** (`circle_members.role='owner'` for this challenge's `circle_id`). Resolves a `disputed` challenge unilaterally, same payout mechanics as `confirm_freeform_result`. |

All new RPCs follow the existing `SECURITY DEFINER`, `SET search_path = public`, `REVOKE ALL ... GRANT EXECUTE TO authenticated` pattern already used by every RPC in `204_p2p_challenges.sql` — no new security posture to invent.

## Migration Plan

Numbered from **235** (last applied migration is 234, per `supabase/migrations/`). Each file below is a proposed unit of work — split further if a single-item review is easier that way. **None of these run without the exact filename being named in chat and getting an explicit "yes, run it."**

1. **`235_p2p_circle_scope.sql`** — add `circle_id` (nullable first), backfill from `circle_leagues`, then `ALTER COLUMN circle_id SET NOT NULL`; make `league_id` nullable; add `paddock_id`, `player_box_id`; drop and recreate `p2p_challenges_select` RLS policy on `circle_members`. Purely additive/backfill — no existing row changes meaning, no RPC changes yet, so the current app keeps working unmodified while this lands.
2. **`236_p2p_create_challenge_circle_scoped.sql`** — `CREATE OR REPLACE FUNCTION create_p2p_challenge(...)` with the new signature and eligibility logic above; `CREATE OR REPLACE FUNCTION get_my_challenges(p_circle_id uuid DEFAULT NULL)`. This is the breaking change — must ship in the same PR as the frontend changes below (`useChallenges.js`, `ChallengeScreen.jsx`), not separately, since the old and new signatures aren't simultaneously compatible with one deployed frontend.
3. **`237_p2p_freeform_bets.sql`** — widen `bet_type` and `status` CHECKs, add `resolution_mode`, `question`, `proposed_winner_id`, `proposed_by`, `proposed_at`, the `p2p_competition_shape` CHECK constraint; add `declare_freeform_result`, `confirm_freeform_result`, `dispute_freeform_result`, `arbitrate_freeform_result`; patch `auto_resolve_p2p_challenges` with the `resolution_mode='auto'` guard.

Phase 3 (cross-sport auto-resolved competitor bets — comparing an F1 pick score to a tennis box score) is **not** in this plan. It needs a product decision on what "fair comparison" means across sports before any schema work; flagged in [Open Product Decisions](#open-product-decisions) but deliberately left unscheduled.

Per [Pilot Safeguards](../../../CLAUDE.md#-pilot-safeguards--read-before-every-db-operation): dump affected rows before 235's backfill UPDATE, show the row count and a sample to the user, and wait for confirmation before running it — this table now holds real users' staked coins.

## Frontend Changes

| File | Change |
|---|---|
| `src/hooks/useChallenges.js` | `useChallenges(userId, circleId = null)` replaces `leagueId` param; `p_league_id` → `p_circle_id` in the `get_my_challenges` call; `createChallenge()` passes `circleId`, `betType`, and (conditionally) `leagueId`/`matchdayId` or `question`. |
| `src/screens/ChallengeScreen.jsx` | Needs a `circleId` — currently the route is a global `/challenges` with no circle context; this must become circle-aware the same way every other Clubhouse-scoped screen is (active-circle context/localStorage, same pattern `ClubhouseScreen.jsx` already uses). `CreateChallengeModal`'s hardcoded `leagueId={null}` (line 953) goes away entirely, replaced by real circle-scoped data. |
| `CreateChallengeModal` (in `ChallengeScreen.jsx`) | Opponent field: replace the raw user-ID text input with a picker sourced from `circle_members` for the active circle. Add a bet-type toggle (Competitor / Freeform). Competitor path: competition picker scoped to `circle_leagues`/`circle_paddocks`/`circle_player_boxes` for this circle, then a matchday/round picker for the chosen competition. Freeform path: replace the matchday field with a required "Question" field; existing "Message" field stays as optional flavor text. |
| `LiveCard`, `HistoryItem` (in `ChallengeScreen.jsx`) | Freeform rows: show the `question` text instead of `GW Total · GW{n}`; add a "Freeform" type badge distinct from the existing `GW Total` badge. `LiveCard` for freeform+`accepted` status needs a "Declare result" affordance calling `declare_freeform_result`; a proposed-but-unconfirmed state needs "Confirm" / "Dispute" affordances for the non-proposing party calling `confirm_freeform_result` / `dispute_freeform_result`. |
| New: owner arbitration surface | A `disputed`-status challenge needs to reach the circle owner somewhere — simplest is an Inbox notification (existing `league_notifications`-style pattern, see [P2P_BETTING_TECHNICAL_ASSESSMENT.md](P2P_BETTING_TECHNICAL_ASSESSMENT.md) reuse map) with Award-to-A / Award-to-B actions calling `arbitrate_freeform_result`. Full UI treatment belongs in the design doc, not here. |
| `src/screens/ClubhouseScreen.jsx` | No functional change required — the Settings toggle copy and Home shortcut cards already describe the target state correctly (see [Decision & Why](#decision--why)). Worth a pass to confirm the toggle actually gates challenge creation once circle-scoping ships (check whether it currently does anything at all — not confirmed in this spec). |

## Open Product Decisions

Not mine to decide — flag for the user before Phase 2/3 implementation starts:

1. **Rake on freeform bets** — same 5% as `gw_total`, or different (freeform has no "house data" backing it, purely social)?
2. **Dispute timeout** — if the non-proposing party never confirms or disputes, does it auto-escalate to owner arbitration after N hours, or sit forever? (`gw_total` has `expires_at` for the *pending→accepted* step only; freeform's *declare→confirm* step has no analogous timer today.)
3. **Owner-less circles / owner inactivity** — what happens to a `disputed` challenge if the circle owner never acts? No fallback exists in this spec.
4. **Should a `gw_total` competitor bet still require the opponent to be a member of that specific league/paddock/box**, or is circle membership alone sufficient? This spec assumes yes (a bet on someone's score requires them to have a score) — confirm that's still the intent.
5. **Freeform spend limits** — `debit_coins_to_escrow`'s existing 1,000-coin/24h daily cap applies globally per user already, so freeform doesn't need a new cap, but confirm freeform bets should share that same cap rather than get their own (freeform has no natural "one per gameweek pair" duplicate-challenge guard the way `gw_total` does via `DUPLICATE_CHALLENGE`).

## Pending Prerequisite

Per the current session's task list, the v2→main cutover is **mid-flight**: the cutover merge landed but Phase 3 (smoke test behind the maintenance wall) is still in progress and Phase 4 (reopen + apply migration 217) hasn't run. This spec's migrations (235+) should not be written or applied until that cutover is confirmed stable and the app is back open to real traffic — `p2p_challenges` already holds live users' staked coins, and stacking a schema change on top of an in-progress cutover is exactly the kind of compounding risk the Pilot Safeguards rules exist to prevent.

---

Last Updated: **2026-07-24**
