# Draft System Design
**Status**: Design Complete — Ready for Implementation  
**Last Updated**: 2026-04-23  
**Scope**: Per-league only. All mechanics described here are strictly isolated to a single fantasy league.

---

## 1. Understanding Summary

- **What**: Async team-building and transfer system for League and Cup formats, with a no-duplicate-players rule across squads in the same league
- **Why**: Live drafts are not feasible for an async mobile-first product; managers need a fair, engaging mechanism to claim players without real-time coordination
- **Who**: All league managers (variable size, typically 4–12)
- **Key constraints**: MVP; React + Supabase stack; mobile-first; no synchronous sessions
- **Non-goals**: Live draft room, cross-league transfers, forced squad changes on player elimination

---

## 2. Format Overview

### League Format
| Phase | Mechanic |
|---|---|
| Season start | Blind submission (ranked 25–30 players) → random lottery → gazette report |
| Every round | 5 transfers, position-limited, budget-limited |
| Halfway transition (once) | Unlimited transfer window |
| After halfway | Back to 5 per round |
| Always | Manager-to-manager swaps via existing Trade UI, time-boxed per round |

### Cup Format
| Phase | Mechanic |
|---|---|
| Pre-cup | Blind submission + random lottery (same as league) |
| Group stage — after each round | 3 transfers |
| Group → elimination transition | Unlimited window |
| Post-group contested players | Reverse-standings draft (worst rank picks first) |
| After each elimination round | Unlimited window |
| Player pool | Only players from clubs still in the cup (new picks only) |
| Eliminated players | Can be held indefinitely; score 0 points |

---

## 3. Data Model

### New Tables

```sql
-- Manager's ranked preference submission
draft_submissions (
  id UUID PRIMARY KEY,
  league_id UUID REFERENCES leagues(id),
  user_id UUID REFERENCES auth.users(id),
  player_ids TEXT[],           -- ordered, index 0 = highest priority
  submitted_at TIMESTAMPTZ,
  status ENUM('pending', 'processed'),
  UNIQUE(league_id, user_id)
)

-- Allocated squad post-lottery
draft_allocations (
  id UUID PRIMARY KEY,
  league_id UUID REFERENCES leagues(id),
  user_id UUID REFERENCES auth.users(id),
  allocated_players TEXT[],    -- final 15 after lottery
  unresolved_slots INT DEFAULT 0,
  allocated_at TIMESTAMPTZ
)

-- Transfer window state per league per round
transfer_windows (
  id UUID PRIMARY KEY,
  league_id UUID REFERENCES leagues(id),
  round_number INT,
  opens_at TIMESTAMPTZ,
  closes_at TIMESTAMPTZ,
  window_type ENUM('standard', 'unlimited', 'cup_group', 'cup_elimination'),
  transfers_remaining INT      -- NULL = unlimited
)

-- Individual transfer log
transfers (
  id UUID PRIMARY KEY,
  league_id UUID REFERENCES leagues(id),
  user_id UUID REFERENCES auth.users(id),
  round_number INT,
  player_out TEXT,
  player_in TEXT,
  transferred_at TIMESTAMPTZ
)

-- Cup pool: clubs still active in the cup
cup_active_clubs (
  id UUID PRIMARY KEY,
  league_id UUID REFERENCES leagues(id),
  club_id TEXT,
  eliminated_at TIMESTAMPTZ    -- NULL = still active
)

-- Config: all tunable parameters, readable at runtime
league_config (
  id UUID PRIMARY KEY,
  league_id UUID REFERENCES leagues(id),
  config_key VARCHAR NOT NULL,
  config_value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(league_id, config_key)
)

-- Gazette entries (draft reports, breaking news, auction results)
gazette_entries (
  id UUID PRIMARY KEY,
  league_id UUID REFERENCES leagues(id),
  entry_type ENUM('draft_report', 'breaking_news', 'activity', 'auction_result'),
  headline TEXT,
  bullets JSONB,               -- array of 2-3 story strings
  full_data JSONB,             -- collapsible full allocation table
  published_at TIMESTAMPTZ DEFAULT NOW()
)
```

### Default `league_config` rows (seeded on league creation)

```json
{ "draft_list_size": 30 }
{ "draft_auto_complete_ratio": { "GK": 4, "DEF": 10, "MID": 10, "FWD": 6 } }
{ "transfer_limit_per_round": 5 }
{ "cup_transfer_limit": 3 }
{ "swap_window_hours": 48 }
{ "relaxation_base": 0.6 }
{ "relaxation_scale": 40 }
{ "relaxation_tier2_mult": 1.4 }
{ "relaxation_tier3_mult": 1.8 }
{ "relaxation_repeats": [0, 1, 3, null] }
```

To adjust any parameter: one SQL update, zero code changes.

---

## 4. Edge Functions

### `run-draft-lottery` (cron — fires at draft deadline)

```
1. Fetch all draft_submissions for the league
2. Build conflict map: player_id → [managers who listed them]
3. For each contested player: randomly select one winner
4. Per manager, walk ranked list sequentially:
   - Skip: player already taken by another manager
   - Skip: position cap would be exceeded (2 GK / 5 DEF / 5 MID / 3 FWD)
   - Skip: cumulative value of already-allocated players exceeds 100M
   - Stop: when 15 players allocated or list exhausted
5. Write results → draft_allocations
6. Flag unresolved_slots for managers with < 15 players
7. Write gazette_entry (headline + bullets + full table)
8. Push notification to all managers
```

### `enforce-transfer-window` (RLS policy)

- RLS on `transfers` table rejects inserts when `NOW()` is outside the active `transfer_windows` row for that `league_id`
- Pre-insert trigger validates position limits (cannot exceed 2 GK / 5 DEF / 5 MID / 3 FWD)
- Decrements `transfers_remaining` on each successful insert (if not null)

### `resolve-swap-proposal` (triggered on Trade acceptance)

```
1. Validate both players still belong to their respective managers
2. Validate position limits hold for both managers post-swap
3. If position change involved: verify active transfer_window exists
4. Atomically update both squads
5. Mark proposal accepted in existing trade proposals table
6. Log both as transfers
7. Expire all other pending proposals involving either player
```

### `auto-complete-draft` (client-triggered)

```
1. Count current submission slots by position
2. Read draft_auto_complete_ratio from league_config
3. Calculate remaining needed per position
4. Fetch available players by position (not already in submission)
5. Randomly fill each position gap
6. Append to draft_submissions.player_ids
```

### `calculate-relaxation` (called before each cup transfer window opens)

```js
const cfg = await getLeagueConfig(league_id)

const available_pool = await countCupActivePlayers(league_id)
const pressure = (n_managers * 15) / available_pool

const threshold = cfg.relaxation_base + (n_managers / cfg.relaxation_scale)

const repeats_allowed =
  pressure <= threshold                      ? cfg.relaxation_repeats[0]  // 0
  : pressure <= threshold * cfg.relaxation_tier2_mult ? cfg.relaxation_repeats[1]  // 1
  : pressure <= threshold * cfg.relaxation_tier3_mult ? cfg.relaxation_repeats[2]  // 3
  :                                                      cfg.relaxation_repeats[3]  // null = unlimited

// If threshold just changed vs. previous round: fire gazette entry
```

**Formula examples:**

| Scenario | Managers | Pool | Pressure | Threshold | Result |
|---|---|---|---|---|---|
| QF, 12 managers | 12 | 200 | 0.90 | 0.90 | 1 repeat |
| SF, 12 managers | 12 | 100 | 1.80 | 0.90 | 3 repeats |
| SF, 4 managers | 4 | 100 | 0.60 | 0.70 | No repeats |
| Final, 12 managers | 12 | 50 | 3.60 | 0.90 | Rule dropped |

---

## 5. UI Flows

### Draft Submission Screen (`/league/:id/draft`)
- Search/filter players, add to ranked list
- Drag-to-reorder for priority management
- AUTO-COMPLETE button fills remaining slots using position ratio from config
- Budget indicator hidden (unlimited during draft)
- SUBMIT locked until ≥15 players in list
- Deadline countdown prominent at top

### Incomplete Squad Recovery (`/league/:id/draft/recover`)
- Shown only to managers with `unresolved_slots > 0`
- Filtered to available (unallocated) players only
- Position gaps clearly labelled
- Supabase realtime subscription: taken players disappear instantly
- Normal 100M budget applies

### Swap Marketplace
- **Leverages existing Trade UI in LeagueScreen.jsx** — no new screen needed
- Additions only:
  1. "List for trade" flag on player cards (sets `listed_for_trade: true`)
  2. Transfer window enforcement wrapper — disables Trade builder outside windows
  3. Position limit pre-check before "Broadcast Proposal"

---

## 6. Gazette Integration

Draft report fires automatically from `run-draft-lottery` and writes a `gazette_entries` row.

**Format (Hybrid):**
```
HEADLINE:  "DRAFT SETTLED: Salah, Haaland & Mbappé decided by the lottery gods"

BULLETS:
• Salah (wanted by 4 managers) → allocated to [Manager X]
• Haaland (3 managers) → allocated to [Manager Y]
• 2 managers enter with incomplete squads — first-come picks now open

[Full Results ▼]  ← collapsible table: Manager | Players | Gaps
```

Rendered in the existing gazette component using serif headline, pull-quote bullets, and a toggle for the full table. No wall of text on the surface.

Relaxation threshold crossings also fire a gazette entry automatically:
> *"RULE UPDATE: Pool pressure has reached 90% — managers may now hold up to 1 repeated player."*

---

## 7. Decision Log

| # | Decision | Alternatives Considered | Why |
|---|---|---|---|
| 1 | Async blind submission + random lottery | Live draft, auction bidding, FCFS | MVP feasibility; fairest for async play across timezones |
| 2 | Post-submission conflict resolution | Pre-lock enforcement, sequential turns | Most flexible; no coordination required |
| 3 | Reverse-standings draft post-group (Cup) | Lottery again, auction | Balances competition; rewards poor performance |
| 4 | FCFS for post-elimination windows | Fixed auction windows | Speed rewards engagement; simpler |
| 5 | Pool = cup-active clubs only (new picks) | All EPL players | Most realistic cup mechanic; creates meaningful scarcity |
| 6 | Managers never forced to sell eliminated players | Auto-remove on elimination | Budget constraints make forced removal punishing |
| 7 | Math-driven relaxation formula, league-size-scaled | Fixed rule, admin toggle, per-manager opt-in | Self-adjusting, fair, transparent — zero admin burden |
| 8 | All constants in `league_config` DB table | Hardcoded, env vars, constants file | Runtime-adjustable without redeploy; per-league tunable |
| 9 | Leverage existing Trade UI | Build new swap screen | Trade builder already handles player selection, sweeteners, accept/decline |
| 10 | Gazette hybrid report | Full text, visual card, separate screen | Preserves aesthetic; surfaces drama without wall of text |
| 11 | Draft budget unlimited; 100M applies post-allocation | 100M during draft | Managers need freedom to rank preferences |
| 12 | Auto-complete 4/10/10/6 ratio (30 slots) | Equal distribution | Mirrors standard fantasy formation; avoids invalid squads |
| 13 | Transfer window enforced via RLS | Client-side only | RLS is tamper-proof; cannot be bypassed by client |

---

## 8. Open Items (tracked in BACKLOG.md)

- **Issue #012**: Gazette component extension for draft report rendering
- **Issue #013**: In-league player auction system (bids via budget + points)
- Cup phase state machine: exact `cup_phase` enum values to confirm with product
- Fixed cup change limit per round: **3** (configurable via `cup_transfer_limit` in `league_config`)
- Swap window duration: **48 hours** (configurable via `swap_window_hours`)
