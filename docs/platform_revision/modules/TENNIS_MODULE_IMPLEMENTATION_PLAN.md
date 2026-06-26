# Tennis Module — Game Dynamics & Implementation Plan

**Authoritative source for Phase 2 of the v2 sale-ready build. Read this in full before touching any tennis code.**

---

## Part I — Game Dynamics Specification

### Overview

The tennis module is a season-long prediction game built around the ATP calendar (January Australian Open → November ATP Finals). Players join **The Player's Box** — the tennis equivalent of The Paddock in F1 — and compete across 13 tournaments per season.

The game is deliberately low-friction: **one login per tournament** to lock your roster, one mid-tournament captain selection, and one seasonal power-up decision. No daily management.

---

### The ATP Season Structure

| Tournament Type | Count | Scoring | Mandatory? |
|---|---|---|---|
| Grand Slams | 4 | Higher points matrix | ✅ All 4 count |
| Masters 1000 | 9 | Lower points matrix | Best 4 of 9 count (**Masters Drop Rule**) |
| ATP Finals | 1 | Prediction slate (different mechanic) | ✅ Counts |

**Total season scoring = 4 Grand Slams + best 4 Masters 1000s + ATP Finals**

The Masters Drop Rule protects players from a bad week or unavoidable clash — the 5 lowest Masters scores are simply ignored.

---

### Part 1A — Standard Season (Grand Slams & Masters 1000s)

#### Step 1: Pre-Tournament Roster Selection

Before the first match of a tournament, each user logs in **once** to select a **7-player squad** constrained by seed tiers. The available player pool is entered by the administrator before roster lock.

| Tier | Seed Range | Slots |
|---|---|---|
| **Tier 1** | Seeds 1–4 | 1 player |
| **Tier 2** | Seeds 5–16 | 2 players |
| **Tier 3** | Seeds 17–32 | 2 players |
| **Tier 4** | Unseeded (Dark Horses) | 2 players |

Rosters lock when the tournament begins. No changes after the first ball is struck.

#### Step 2: Pre-Tournament Ace Card (Optional)

At the start of each season, every user receives **4 Ace Cards** — one per card type. A user may play **at most one card per tournament**. Cards cannot be used at the ATP Finals. Any cards not used by the ATP Finals are forfeited at season end. Cards carry no monetary value.

| Card | Effect |
|---|---|
| **Underdog Boost** | Double all points earned by your 2 Tier 4 Dark Horse players for this tournament |
| **Safety Net** | If your Tier 1 player is eliminated in their 1st or 2nd main-draw match, receive a flat **+200 points** consolation bonus |
| **Surface Specialist** | Double the total points earned by your entire 7-player roster for this tournament |
| **Dark Horse Insurance** | Earn **+50 points** for every round your unseeded Tier 4 players advance past the Round of 32 |

Ace Card selection happens at the same time as roster lock (pre-tournament login). Cards are tracked server-side — one card type per user per season, each usable once.

#### Step 3: Mid-Tournament QF Captain

When the Round of 16 is complete and 8 players remain, the administrator marks the tournament as "QF open." A **48-hour window** then opens for users to assign one of their **surviving** roster players as Tournament Captain.

- The Captain earns **2× points** for their total tournament score.
- "Surviving" means the player is still in the tournament (not yet eliminated).
- If all 7 of a user's players are eliminated before the QF, no captain selection is required — the user simply earns their base points with no bonus.
- If a user does not assign a captain during the 48-hour window, no 2× bonus is awarded.

The administrator feeds round-by-round results (which players are eliminated after each round) so that:
1. The system knows which roster players are still alive.
2. The QF captain window opens automatically when the R16 is fully resolved.

#### Step 4: Scoring

Points are awarded based on the **furthest round a player reaches** in the tournament.

| Round Reached | Masters 1000 Points | Grand Slam Points |
|---|---|---|
| **Champion** | 1,000 | 2,000 |
| **Runner-Up** | 600 | 1,200 |
| **Semifinals** | 360 | 720 |
| **Quarterfinals** | 180 | 360 |
| **Round of 16** | 90 | 180 |
| **Early Rounds (R32 / R64 / R128)** | 45 | 90 |

**Captain 2× application:** if the user's selected captain reached the QF or beyond, their total tournament points are multiplied by 2. If the captain was eliminated before the QF, they earn normal points (2× only applies if the captain actually survived to QF).

**Dark Horse Insurance bonus formula:**
- Compute the number of rounds each Tier 4 player advanced past the Round of 32.
- R32 eliminated = 0 bonus. R16 = +50. QF = +100. SF = +150. Runner-Up = +200. Champion = +250.
- Applied per Tier 4 player; stacks across both Dark Horse picks.

**Tournament total per user** = sum of all 7 players' round-reached points + Ace Card effects + Captain 2× if applicable.

Scoring runs as an Edge Function called by the administrator after the tournament Final is complete and all results are entered.

---

### Part 1B — The ATP Finals

The ATP Finals has a completely different structure — 8 qualified players in 2 round-robin groups (12 group-stage matches) followed by 2 semifinals and 1 final (15 matches total). There is no roster selection or Ace Card mechanic. Instead, users make a **full match-by-match prediction slate** across two login windows.

**No Ace Cards apply at the ATP Finals.** The season ends; unplayed cards are forfeited.

#### Login 1 — Pre-Tournament Group Stage Predictions
Before the ATP Finals begins, users predict the winner of all **12 group-stage matches**. Match assignments (which players play which, in which group) are seeded by the administrator before the first ball.

#### Login 2 — Knockout Predictions
Once all 12 group-stage matches are resolved and the semifinalists are confirmed, users make **3 predictions**: SF1 winner, SF2 winner, and the Grand Final winner.

Login 2 is locked immediately before the first semifinal.

#### Scoring

The system counts total correct predictions out of 15 and awards points on a tier scale:

| Correct Picks | Tier Name | Points |
|---|---|---|
| 1–5 | *Unforced Error* | 250 |
| 6–9 | *Deuce* | 750 |
| 10–12 | *Match Point* | 1,800 |
| 13–14 | *Championship Point* | 3,500 |
| **15 / 15** | 🏆 *The Perfect Slate* | **7,500** |

---

### Season Leaderboard

The season leaderboard is a **rolling sum** updated after each tournament completes:

```
Season Score = 
  Grand Slam 1 total
+ Grand Slam 2 total
+ Grand Slam 3 total
+ Grand Slam 4 total
+ BEST 4 of 9 Masters 1000 totals   ← Masters Drop Rule
+ ATP Finals total
```

After each tournament, the leaderboard recomputes. During the Masters season (before all 9 are played), the leaderboard shows the sum of all completed Masters scores without any cap — the "drop 5" only applies to the final tally once all 9 are completed. *(Implementation note: best-4-of-N as N grows, capped at 4 when N >= 4.)*

The Player's Box leaderboard is filtered by Player's Box membership. A user in two Player's Boxes contributes the same picks to both leaderboards.

---

### Ace Card Season Lifecycle

- **Season start:** Australian Open begins → each registered user receives 4 fresh cards (one of each type), tracked server-side.
- **Usage:** one card per tournament, played at roster lock time. Once played, that card type is consumed for the season.
- **ATP Finals:** no cards accepted. Any remaining cards are forfeited when the ATP Finals begins.
- **Season reset:** after the ATP Finals, the system issues 4 new cards for the next season (next January).

---

### 2026 ATP Calendar Seed

The following 13 tournaments form the 2026 season to be seeded into the database:

| # | Tournament | Type | Surface | Draw |
|---|---|---|---|---|
| 1 | Australian Open | Grand Slam | Hard | 128 |
| 2 | Indian Wells | Masters 1000 | Hard | 96 |
| 3 | Miami Open | Masters 1000 | Hard | 96 |
| 4 | Monte-Carlo | Masters 1000 | Clay | 64 |
| 5 | Madrid Open | Masters 1000 | Clay | 64 |
| 6 | Italian Open (Rome) | Masters 1000 | Clay | 96 |
| 7 | French Open | Grand Slam | Clay | 128 |
| 8 | Wimbledon | Grand Slam | Grass | 128 |
| 9 | Canadian Open | Masters 1000 | Hard | 64 |
| 10 | Cincinnati | Masters 1000 | Hard | 64 |
| 11 | US Open | Grand Slam | Hard | 128 |
| 12 | Shanghai | Masters 1000 | Hard | 96 |
| 13 | Paris Masters | Masters 1000 | Hard | 64 |
| 14 | ATP Finals | ATP Finals | Hard (Indoor) | 8 |

*Note: The ATP Finals (14th entry) uses the prediction mechanic, not the roster/scoring mechanic.*

---

## Part II — Architecture Decisions

These decisions are made. Do not re-debate without reading this section.

| Decision | Choice | Rationale |
|---|---|---|
| **Group name** | The Player's Box (`player_boxes` table) | Platform naming: Paddock (F1), Player's Box (tennis) |
| **Picks: global or per-box?** | Global per user | One set of picks per tournament regardless of how many Player's Boxes the user belongs to. Same model as F1 Paddocks. Leaderboard filters by box membership. |
| **Data source** | Manual admin entry | Phase 1 only. Admin enters: (a) player seed list before tournament, (b) eliminated players after each round. Auto-API integration is a Phase 2 enhancement post-sale. |
| **Ace Cards** | Server-side state | `tennis_ace_cards` table, one row per card type per user per season. Cannot be regenerated client-side. |
| **ATP Finals picks** | Two-phase (Login 1: groups; Login 2: knockouts) | Different lock times require separate submission RPCs and separate lock gates. |
| **Season scope** | ATP only (no WTA) | Phase 1. WTA is a future extension requiring no schema changes — just additional `tennis_seasons` and `tennis_tournaments` rows with a `tour` enum column. |
| **Round tracking** | Admin enters per-round eliminations | The administrator calls an RPC after each round completes, specifying which players were eliminated. This advances tournament status and opens/closes the QF captain window. |
| **Scoring timing** | Edge Function called by admin after Final | Same pattern as football: admin-triggered scoring run post-event. |
| **Chat & Gazette** | Circle-level only | No per-Player's-Box chat. Circle feed aggregates tennis gazette entries alongside football and F1. |
| **Trophy ledger** | Season winner per Player's Box | `trophy_ledger` row emitted per Player's Box for the season champion. Same table as football and F1 trophies. |
| **Screens** | Thin UI, ported to Vite/React | Logic lives in RPCs and Edge Functions. UI is disposable. Phase 1C redesign re-skins without touching logic. |
| **Migration numbers** | Start at 194+ (after F1 uses 190–193) | Exact numbers confirmed at Sprint T-0 time based on what F1 consumed. |

---

## Part III — Database Schema

### Migration T-0a: Core Tables

```sql
-- ─────────────────────────────────────────────────────────────
-- Migration: tennis_core
-- The Player's Box group concept + season/tournament scaffolding
-- ─────────────────────────────────────────────────────────────

-- 1. The Player's Box (group concept, analogous to paddocks in F1)
CREATE TABLE player_boxes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,
  invite_code  text UNIQUE NOT NULL DEFAULT upper(substring(gen_random_uuid()::text, 1, 8)),
  created_by   uuid NOT NULL REFERENCES auth.users,
  season_year  int  NOT NULL,
  created_at   timestamptz DEFAULT now()
);

CREATE TABLE player_box_members (
  player_box_id uuid NOT NULL REFERENCES player_boxes ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES auth.users,
  joined_at     timestamptz DEFAULT now(),
  PRIMARY KEY (player_box_id, user_id)
);

-- Circle junction (links Player's Boxes into the cross-sport Circle layer)
CREATE TABLE circle_player_boxes (
  circle_id     uuid NOT NULL REFERENCES circles ON DELETE CASCADE,
  player_box_id uuid NOT NULL REFERENCES player_boxes ON DELETE CASCADE,
  PRIMARY KEY (circle_id, player_box_id)
);

-- 2. Seasons
CREATE TABLE tennis_seasons (
  year               int  PRIMARY KEY,
  ace_cards_per_user int  NOT NULL DEFAULT 4
);

-- Seed 2026 season
INSERT INTO tennis_seasons (year, ace_cards_per_user) VALUES (2026, 4);

-- 3. Tournament type and surface enums
CREATE TYPE tennis_tournament_type AS ENUM ('grand_slam', 'masters_1000', 'atp_finals');
CREATE TYPE tennis_surface        AS ENUM ('hard', 'clay', 'grass', 'hard_indoor');

-- 4. Tournaments
-- status progression: upcoming → roster_open → r1_in_progress → qf_captain_open → completed
-- (admin advances status via RPC after each milestone)
CREATE TABLE tennis_tournaments (
  id               uuid                   PRIMARY KEY DEFAULT gen_random_uuid(),
  season_year      int                    NOT NULL REFERENCES tennis_seasons,
  name             text                   NOT NULL,
  tournament_type  tennis_tournament_type NOT NULL,
  surface          tennis_surface         NOT NULL,
  draw_size        int                    NOT NULL DEFAULT 128,
  start_date       date                   NOT NULL,
  end_date         date                   NOT NULL,
  roster_lock_at   timestamptz,
  qf_window_opens_at timestamptz,
  qf_window_closes_at timestamptz,
  status           text                   NOT NULL DEFAULT 'upcoming'
                   CHECK (status IN ('upcoming','roster_open','in_progress','qf_captain_open','completed')),
  sort_order       int                    NOT NULL,
  created_at       timestamptz            DEFAULT now()
);

-- Seed 2026 ATP calendar (dates approximate — admin can correct before season start)
INSERT INTO tennis_tournaments
  (season_year, name, tournament_type, surface, draw_size, start_date, end_date, sort_order)
VALUES
  (2026, 'Australian Open',   'grand_slam',  'hard',        128, '2026-01-13', '2026-01-26', 1),
  (2026, 'Indian Wells',      'masters_1000','hard',         96, '2026-03-05', '2026-03-16', 2),
  (2026, 'Miami Open',        'masters_1000','hard',         96, '2026-03-19', '2026-03-30', 3),
  (2026, 'Monte-Carlo',       'masters_1000','clay',         64, '2026-04-06', '2026-04-13', 4),
  (2026, 'Madrid Open',       'masters_1000','clay',         64, '2026-04-24', '2026-05-03', 5),
  (2026, 'Italian Open',      'masters_1000','clay',         96, '2026-05-07', '2026-05-17', 6),
  (2026, 'French Open',       'grand_slam',  'clay',        128, '2026-05-25', '2026-06-07', 7),
  (2026, 'Wimbledon',         'grand_slam',  'grass',       128, '2026-06-29', '2026-07-12', 8),
  (2026, 'Canadian Open',     'masters_1000','hard',         64, '2026-07-24', '2026-08-02', 9),
  (2026, 'Cincinnati',        'masters_1000','hard',         64, '2026-08-14', '2026-08-23', 10),
  (2026, 'US Open',           'grand_slam',  'hard',        128, '2026-08-31', '2026-09-13', 11),
  (2026, 'Shanghai',          'masters_1000','hard',         96, '2026-10-04', '2026-10-12', 12),
  (2026, 'Paris Masters',     'masters_1000','hard',         64, '2026-10-30', '2026-11-08', 13),
  (2026, 'ATP Finals',        'atp_finals',  'hard_indoor',   8, '2026-11-15', '2026-11-22', 14);
```

### Migration T-0b: Players, Rosters, Ace Cards

```sql
-- ─────────────────────────────────────────────────────────────
-- 5. Players per tournament (admin-seeded before roster lock)
-- ─────────────────────────────────────────────────────────────
-- round_reached uses the "furthest round" naming:
-- 'r128','r64','r32','r16','qf','sf','runner_up','champion'
-- For smaller draws (64/96): r128 will be unused; first round is r64 or r32.
-- rounds_won: number of main-draw matches won (derives Safety Net and Dark Horse Insurance logic)
CREATE TABLE tennis_tournament_players (
  id              uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id   uuid    NOT NULL REFERENCES tennis_tournaments ON DELETE CASCADE,
  player_name     text    NOT NULL,
  nationality     text,
  seed            int,           -- NULL for unseeded
  tier            int     NOT NULL CHECK (tier IN (1,2,3,4)),
                                 -- 1=seeds1-4, 2=seeds5-16, 3=seeds17-32, 4=unseeded
  round_reached   text    CHECK (round_reached IN
                    ('r128','r64','r32','r16','qf','sf','runner_up','champion')),
  rounds_won      int     NOT NULL DEFAULT 0,  -- main-draw matches won; updated by admin after each round
  eliminated      boolean NOT NULL DEFAULT false,
  UNIQUE (tournament_id, player_name)
);

-- 6. User rosters (one per user per tournament — global, not per Player's Box)
CREATE TABLE tennis_rosters (
  id              uuid  PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid  NOT NULL REFERENCES auth.users,
  tournament_id   uuid  NOT NULL REFERENCES tennis_tournaments,
  -- Tier slot assignments (FK to tennis_tournament_players, validated by submit_tennis_roster RPC)
  tier1_player_id uuid  REFERENCES tennis_tournament_players,
  tier2a_player_id uuid REFERENCES tennis_tournament_players,
  tier2b_player_id uuid REFERENCES tennis_tournament_players,
  tier3a_player_id uuid REFERENCES tennis_tournament_players,
  tier3b_player_id uuid REFERENCES tennis_tournament_players,
  tier4a_player_id uuid REFERENCES tennis_tournament_players,  -- Dark Horse 1
  tier4b_player_id uuid REFERENCES tennis_tournament_players,  -- Dark Horse 2
  ace_card_type   text  CHECK (ace_card_type IN
                    ('underdog_boost','safety_net','surface_specialist','dark_horse_insurance')),
  locked_at       timestamptz,
  UNIQUE (user_id, tournament_id)
);

-- 7. QF Captain (one per user per tournament — set during qf_captain_open window)
CREATE TABLE tennis_qf_captains (
  user_id       uuid NOT NULL REFERENCES auth.users,
  tournament_id uuid NOT NULL REFERENCES tennis_tournaments,
  captain_player_id uuid NOT NULL REFERENCES tennis_tournament_players,
  set_at        timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, tournament_id)
);

-- 8. Ace Cards (one row per card type per user per season — issued at season start)
CREATE TABLE tennis_ace_cards (
  user_id           uuid NOT NULL REFERENCES auth.users,
  season_year       int  NOT NULL REFERENCES tennis_seasons,
  card_type         text NOT NULL CHECK (card_type IN
                      ('underdog_boost','safety_net','surface_specialist','dark_horse_insurance')),
  used_tournament_id uuid REFERENCES tennis_tournaments,  -- NULL until played
  used_at           timestamptz,
  PRIMARY KEY (user_id, season_year, card_type)
);

-- 9. Tournament scores (one row per user per tournament — written by scoring Edge Function)
CREATE TABLE tennis_tournament_scores (
  user_id          uuid    NOT NULL REFERENCES auth.users,
  tournament_id    uuid    NOT NULL REFERENCES tennis_tournaments,
  base_points      int     NOT NULL DEFAULT 0,
  ace_card_bonus   int     NOT NULL DEFAULT 0,
  captain_bonus    int     NOT NULL DEFAULT 0,
  total_points     int     NOT NULL DEFAULT 0,
  breakdown        jsonb,         -- per-player detail for UI expansion
  scored_at        timestamptz    DEFAULT now(),
  PRIMARY KEY (user_id, tournament_id)
);
```

### Migration T-0c: ATP Finals

```sql
-- ─────────────────────────────────────────────────────────────
-- 10. ATP Finals prediction tables
-- ─────────────────────────────────────────────────────────────

-- ATP Finals group stage: 12 matches. Admin seeds match_number 1–12 with players.
-- match_number 13–14 = SF1, SF2; match_number 15 = Final.
CREATE TABLE tennis_atp_finals_matches (
  season_year       int  NOT NULL REFERENCES tennis_seasons,
  match_number      int  NOT NULL CHECK (match_number BETWEEN 1 AND 15),
  match_type        text NOT NULL CHECK (match_type IN ('group','sf','final')),
  player_a_id       uuid REFERENCES tennis_tournament_players,  -- seeded by admin
  player_b_id       uuid REFERENCES tennis_tournament_players,
  winner_player_id  uuid REFERENCES tennis_tournament_players,  -- NULL until result entered
  result_entered_at timestamptz,
  PRIMARY KEY (season_year, match_number)
);

-- User predictions (group stage: submit before tournament starts, locked)
-- (knockout: submit before SF, locked separately)
CREATE TABLE tennis_atp_finals_picks (
  user_id           uuid NOT NULL REFERENCES auth.users,
  season_year       int  NOT NULL REFERENCES tennis_seasons,
  match_number      int  NOT NULL CHECK (match_number BETWEEN 1 AND 15),
  picked_player_id  uuid NOT NULL REFERENCES tennis_tournament_players,
  locked_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, season_year, match_number)
);

-- ATP Finals scores (written by scoring Edge Function after all 15 matches resolved)
-- Uses tennis_tournament_scores for consistency (the ATP Finals tournament row IS in tennis_tournaments)
-- No separate table needed — scoring Edge Function writes to tennis_tournament_scores
-- with breakdown containing correct_picks count and tier label.
```

### RLS Summary

All tables follow the platform RLS pattern:

| Table | SELECT | INSERT / UPDATE |
|---|---|---|
| `player_boxes` | All authenticated users | `created_by = auth.uid()` for update; insert via RPC |
| `player_box_members` | Members of the same box | Via `join_player_box_by_code()` RPC only |
| `circle_player_boxes` | Circle members | Commissioner only |
| `tennis_tournament_players` | All authenticated | Service role / admin only (via RPC) |
| `tennis_rosters` | Own rows only | Via `submit_tennis_roster()` RPC only |
| `tennis_qf_captains` | Own rows only | Via `set_tennis_qf_captain()` RPC only |
| `tennis_ace_cards` | Own rows only | Service role only (issued by system) |
| `tennis_tournament_scores` | Player Box members (for leaderboard) | Service role only (written by scoring Edge Function) |
| `tennis_atp_finals_matches` | All authenticated | Service role / admin RPC |
| `tennis_atp_finals_picks` | Own rows only | Via submission RPCs only |

---

## Part IV — RPC Contracts

### Player's Box Management

```
create_player_box(p_name text, p_season_year int, p_circle_id uuid DEFAULT NULL)
  → { player_box_id, invite_code }
  Guard: auth.uid() must exist
  Creates player_box + player_box_members row for creator
  Optionally links to circle via circle_player_boxes

join_player_box_by_code(p_invite_code text)
  → { player_box_id, name }
  Guard: not already a member; box season_year = current season
  Inserts player_box_members row

get_my_player_boxes(p_season_year int)
  → [{ player_box_id, name, member_count, invite_code }]
  Returns all boxes for auth.uid() in this season
```

### Tennis Roster Submission

```
submit_tennis_roster(
  p_tournament_id uuid,
  p_tier1 uuid, p_tier2a uuid, p_tier2b uuid,
  p_tier3a uuid, p_tier3b uuid,
  p_tier4a uuid, p_tier4b uuid,
  p_ace_card text DEFAULT NULL
)
  → { locked_at }
  Guards:
    - tournament.status = 'roster_open'
    - All 7 player IDs reference the correct tournament_id
    - p_tier1 must be a tier=1 player, p_tier2a/b must be tier=2, etc.
    - No duplicate player IDs across slots
    - If p_ace_card provided:
        - Card type must be one of the four valid types
        - User must have this card in tennis_ace_cards (used_tournament_id IS NULL)
        - Marks tennis_ace_cards.used_tournament_id = p_tournament_id
    - Upserts tennis_rosters; re-submitting before lock_at is allowed (overwrites)
    - Sets locked_at = now() on insert/update
```

### QF Captain

```
set_tennis_qf_captain(p_tournament_id uuid, p_captain_player_id uuid)
  → { success }
  Guards:
    - tournament.status = 'qf_captain_open'
    - now() < qf_window_closes_at
    - User has a submitted roster for this tournament
    - p_captain_player_id is one of the 7 players in the user's roster
    - Player is not eliminated (tennis_tournament_players.eliminated = false)
  Upserts tennis_qf_captains
```

### ATP Finals Submission

```
submit_atp_finals_group_picks(p_season_year int, p_picks jsonb)
  -- p_picks: [{match_number: 1, picked_player_id: uuid}, ...]
  → { locked_count }
  Guards:
    - ATP Finals tournament status = 'roster_open' (repurposed: "group picks open")
    - Exactly 12 picks covering match_numbers 1–12
    - Each picked_player_id is one of player_a_id or player_b_id for that match
    - Upserts tennis_atp_finals_picks with locked_at = now()

submit_atp_finals_knockout_picks(p_season_year int, p_picks jsonb)
  -- p_picks: [{match_number: 13, picked_player_id: uuid}, {match_number: 14, ...}, {match_number: 15, ...}]
  → { locked_count }
  Guards:
    - ATP Finals tournament status = 'qf_captain_open' (repurposed: "knockout picks open")
    - All 12 group matches have result_entered_at IS NOT NULL
    - Exactly 3 picks covering match_numbers 13–15
    - Each picked_player_id is a valid semifinalist/finalist for that match slot
    - Upserts tennis_atp_finals_picks
```

### Admin RPCs

```
admin_seed_tournament_players(p_tournament_id uuid, p_players jsonb)
  -- p_players: [{player_name, nationality, seed, tier}, ...]
  → { seeded_count }
  Guards: service role or admin flag
  Bulk-inserts tennis_tournament_players
  Sets tournament.status = 'roster_open' (opens roster selection window)

admin_open_tournament(p_tournament_id uuid)
  → { status: 'roster_open' }
  Sets status='roster_open'; can be called once player list is ready

admin_enter_round_results(p_tournament_id uuid, p_eliminated_player_ids uuid[])
  → { eliminated_count, tournament_status }
  Guards: service role or admin
  For each player_id in array:
    - Sets tennis_tournament_players.eliminated = true
    - Updates round_reached to the LAST round they played (derived from rounds_won)
    - Increments rounds_won for surviving players is NOT done here — see design note below
  After update, checks: if 8 players remain (R16 complete) → set tournament.status='qf_captain_open',
    qf_window_opens_at = now(), qf_window_closes_at = now() + interval '48 hours'
  If 1 player remains → set status='completed', trigger score_tennis_tournament Edge Function

  Design note on round_reached:
    When admin eliminates players after R16 (8 players left), the 8 eliminated players have
    round_reached = 'r16'. After QF (4 left), eliminated players have round_reached = 'qf'. Etc.
    The surviving champion has round_reached = 'champion' when the last elimination fires.
    rounds_won is updated for each surviving player after each round's results are entered —
    specifically incremented by 1 for all non-eliminated players when a round batch is processed.

admin_seed_atp_finals_matches(p_season_year int, p_matches jsonb)
  -- p_matches: [{match_number, match_type, player_a_id, player_b_id}, ...]
  → { seeded_count }
  Bulk-inserts tennis_atp_finals_matches 1–12 (group stage)
  Sets ATP Finals tournament status = 'roster_open'

admin_enter_atp_finals_result(p_season_year int, p_match_number int, p_winner_id uuid)
  → { match_number, tournament_status }
  Updates tennis_atp_finals_matches.winner_player_id, result_entered_at
  If all 12 group matches resolved → set ATP Finals status = 'qf_captain_open' + seed matches 13–15
    (player_a/b for SF based on group standings — admin provides or system derives from results)
  If match 15 resolved → status = 'completed', trigger score_atp_finals Edge Function
```

---

## Part V — Scoring Engine

### `score-tennis-tournament` Edge Function

Called after `admin_enter_round_results` sets `status='completed'` for a standard tournament.

```typescript
// Pseudocode for scoring one user's tournament
function scoreTournamentForUser(roster, players, captain, tournament, acardType) {
  const matrix = tournament.type === 'grand_slam'
    ? { champion: 2000, runner_up: 1200, sf: 720, qf: 360, r16: 180, early: 90 }
    : { champion: 1000, runner_up: 600,  sf: 360, qf: 180, r16: 90,  early: 45 };

  const roundPoints = (player) => {
    const r = player.round_reached;
    if (r === 'champion')   return matrix.champion;
    if (r === 'runner_up')  return matrix.runner_up;
    if (r === 'sf')         return matrix.sf;
    if (r === 'qf')         return matrix.qf;
    if (r === 'r16')        return matrix.r16;
    return matrix.early;  // r32, r64, r128
  };

  const tier4Players = [roster.tier4a, roster.tier4b];

  let base = rosterPlayers.reduce((sum, p) => sum + roundPoints(p), 0);

  // Ace Card effects
  let aceBonus = 0;
  if (acardType === 'underdog_boost') {
    // Double points for tier4 players only
    const tier4Extra = tier4Players.reduce((s, p) => s + roundPoints(p), 0);
    aceBonus = tier4Extra;  // adds an extra copy (total = 2x)
  }
  if (acardType === 'safety_net') {
    // +200 if tier1 player was eliminated in match 1 or 2 (rounds_won <= 1)
    if (roster.tier1.rounds_won <= 1) aceBonus = 200;
  }
  if (acardType === 'surface_specialist') {
    // Double entire roster total
    aceBonus = base;  // adds an extra copy (total = 2x)
  }
  if (acardType === 'dark_horse_insurance') {
    // +50 per round past R32 for each tier4 player
    // rounds past R32 = max(0, rounds_won - 2) at 128-draw slams (R32 = 3rd main draw match = 2 wins)
    // For consistency across draw sizes, we derive "rounds past R32" from round_reached:
    const roundsPastR32 = (p) => {
      const map = { r128:0, r64:0, r32:0, r16:1, qf:2, sf:3, runner_up:4, champion:5 };
      return map[p.round_reached] ?? 0;
    };
    aceBonus = tier4Players.reduce((s, p) => s + 50 * roundsPastR32(p), 0);
  }

  // QF Captain 2x (if captain reached QF or beyond)
  let captainBonus = 0;
  if (captain) {
    const captainReachedQF = ['qf','sf','runner_up','champion'].includes(captain.round_reached);
    if (captainReachedQF) {
      const captainBase = roundPoints(captain);
      captainBonus = captainBase;  // adds an extra copy (total = 2x for captain's points)
    }
  }

  return {
    base_points: base,
    ace_card_bonus: aceBonus,
    captain_bonus: captainBonus,
    total_points: base + aceBonus + captainBonus,
    breakdown: { ... }  // per-player detail
  };
}
```

After computing scores, the Edge Function:
1. Writes to `tennis_tournament_scores` (upsert per user_id + tournament_id)
2. Emits a `gazette_entries` row (entry_type = `tennis_result`) with headline and top 3 per Player's Box
3. Emits `trophy_ledger` row for the user with highest `total_points` per Player's Box

### `score-atp-finals` Edge Function

Called after match 15 result is entered.

```typescript
function scoreAtpFinalsForUser(picks, results) {
  const correctPicks = picks.filter(p => {
    const match = results.find(r => r.match_number === p.match_number);
    return match?.winner_player_id === p.picked_player_id;
  }).length;

  const tier =
    correctPicks <= 5  ? { label: 'Unforced Error',     points: 250 } :
    correctPicks <= 9  ? { label: 'Deuce',              points: 750 } :
    correctPicks <= 12 ? { label: 'Match Point',        points: 1800 } :
    correctPicks <= 14 ? { label: 'Championship Point', points: 3500 } :
                         { label: 'The Perfect Slate',  points: 7500 };

  return {
    base_points: tier.points,
    total_points: tier.points,
    breakdown: { correct_picks: correctPicks, tier_label: tier.label }
  };
}
```

Writes to `tennis_tournament_scores` with the ATP Finals tournament_id. Uses the same table as standard tournaments, so the season leaderboard RPC queries one table for all 14 events.

### `gazette_entry_type` Extension

```sql
ALTER TYPE gazette_entry_type ADD VALUE IF NOT EXISTS 'tennis_result';
```

Must be added before the scoring Edge Function is first deployed.

---

## Part VI — Season Leaderboard RPC

```sql
CREATE OR REPLACE FUNCTION get_player_box_leaderboard(
  p_player_box_id uuid,
  p_season_year   int DEFAULT date_part('year', now())::int
)
RETURNS TABLE (
  user_id        uuid,
  username       text,
  slam_points    int,
  masters_points int,  -- best 4 of 9
  finals_points  int,
  season_total   int,
  rank           int,
  tournaments_scored int
) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_atp_finals_id uuid;
BEGIN
  SELECT id INTO v_atp_finals_id
  FROM tennis_tournaments
  WHERE season_year = p_season_year AND tournament_type = 'atp_finals';

  RETURN QUERY
  WITH members AS (
    SELECT pbm.user_id, u.raw_user_meta_data->>'username' AS username
    FROM player_box_members pbm
    JOIN auth.users u ON u.id = pbm.user_id
    WHERE pbm.player_box_id = p_player_box_id
  ),
  slams AS (
    SELECT ts.user_id, SUM(ts.total_points)::int AS slam_pts
    FROM tennis_tournament_scores ts
    JOIN tennis_tournaments tt ON tt.id = ts.tournament_id
    WHERE tt.season_year = p_season_year
      AND tt.tournament_type = 'grand_slam'
      AND ts.user_id IN (SELECT user_id FROM members)
    GROUP BY ts.user_id
  ),
  masters_ranked AS (
    -- Rank each Masters score per user, take best 4
    SELECT ts.user_id, ts.total_points,
           ROW_NUMBER() OVER (PARTITION BY ts.user_id ORDER BY ts.total_points DESC) AS rn
    FROM tennis_tournament_scores ts
    JOIN tennis_tournaments tt ON tt.id = ts.tournament_id
    WHERE tt.season_year = p_season_year
      AND tt.tournament_type = 'masters_1000'
      AND ts.user_id IN (SELECT user_id FROM members)
  ),
  masters AS (
    SELECT user_id, SUM(total_points)::int AS masters_pts
    FROM masters_ranked
    WHERE rn <= 4
    GROUP BY user_id
  ),
  finals AS (
    SELECT ts.user_id, ts.total_points AS finals_pts
    FROM tennis_tournament_scores ts
    WHERE ts.tournament_id = v_atp_finals_id
      AND ts.user_id IN (SELECT user_id FROM members)
  ),
  counts AS (
    SELECT ts.user_id, COUNT(*)::int AS t_count
    FROM tennis_tournament_scores ts
    JOIN tennis_tournaments tt ON tt.id = ts.tournament_id
    WHERE tt.season_year = p_season_year
      AND ts.user_id IN (SELECT user_id FROM members)
    GROUP BY ts.user_id
  )
  SELECT
    m.user_id,
    m.username,
    COALESCE(s.slam_pts, 0)    AS slam_points,
    COALESCE(mx.masters_pts, 0) AS masters_points,
    COALESCE(f.finals_pts, 0)  AS finals_points,
    COALESCE(s.slam_pts, 0) + COALESCE(mx.masters_pts, 0) + COALESCE(f.finals_pts, 0) AS season_total,
    RANK() OVER (ORDER BY COALESCE(s.slam_pts,0)+COALESCE(mx.masters_pts,0)+COALESCE(f.finals_pts,0) DESC)::int AS rank,
    COALESCE(c.t_count, 0) AS tournaments_scored
  FROM members m
  LEFT JOIN slams   s  ON s.user_id  = m.user_id
  LEFT JOIN masters mx ON mx.user_id = m.user_id
  LEFT JOIN finals  f  ON f.user_id  = m.user_id
  LEFT JOIN counts  c  ON c.user_id  = m.user_id
  ORDER BY season_total DESC;
END;
$$;
```

---

## Part VII — Sprint Plan

### Overview

| Sprint | Goal | Est. Effort | Migrations |
|---|---|---|---|
| **T-0** | Schema foundations + Player's Box RPCs | ~5h | 194, 195 |
| **T-1** | Roster, Ace Card, and QF Captain RPCs | ~5h | — |
| **T-2** | Admin tooling (player seeding + round results) | ~4h | — |
| **T-3** | Scoring Edge Functions + season leaderboard | ~6h | — |
| **T-4** | UI screens (thin, 7 screens) | ~8h | — |

**Total estimate: ~28h across 5 sprints**

MVP is complete after **T-3**. The system is playable and scorable. T-4 is the UI layer that makes it visible to users.

Migration numbers (194, 195) assume F1 uses 190–193. Confirm exact numbers when starting T-0.

---

### Sprint T-0 — Schema Foundations (~5h)
*Prerequisites: Phase 1B (F1) complete. Migrations 190–193 applied.*

- [ ] **Migration 194** — Core tables: `player_boxes`, `player_box_members`, `circle_player_boxes`, `tennis_seasons`, `tennis_tournaments`
  - Seed 2026 season row
  - Seed 14-tournament 2026 ATP calendar (dates approximate)
  - RLS on all tables
- [ ] **Migration 195** — Player and game tables: `tennis_tournament_players`, `tennis_rosters`, `tennis_qf_captains`, `tennis_ace_cards`, `tennis_tournament_scores`, `tennis_atp_finals_matches`, `tennis_atp_finals_picks`
  - `gazette_entry_type` extension: `ALTER TYPE gazette_entry_type ADD VALUE IF NOT EXISTS 'tennis_result'`
  - RLS on all tables
- [ ] **RPCs**: `create_player_box`, `join_player_box_by_code`, `get_my_player_boxes`
- [ ] **Smoke test**: create a Player's Box, join it, verify member row; query tournament calendar

**Exit check:** all 14 tournament rows seeded; Player's Box create/join flow works end-to-end.

---

### Sprint T-1 — Roster, Ace Card & Captain (~5h)
*Prerequisites: T-0 complete. Requires an admin to first call `admin_seed_tournament_players` to have a player pool.*

- [ ] **`submit_tennis_roster` RPC** with all tier validation guards (correct tier, no duplicates, no locked-after-tournament-start, ace card validation and consumption)
- [ ] **`set_tennis_qf_captain` RPC** with window timing, surviving player, and roster membership guards
- [ ] **`submit_atp_finals_group_picks` RPC** (12-match predictions, validates player_a/b per match)
- [ ] **`submit_atp_finals_knockout_picks` RPC** (3-match predictions, validates group stage complete and SF/Final seedings)
- [ ] **`get_tennis_tournament_for_user(p_tournament_id)` RPC** — returns tournament metadata, user's roster, player pool with tier tags, ace card status, surviving players list, captain if set
- [ ] **`issue_season_ace_cards(p_season_year int)` utility RPC** (service-role only) — inserts 4 `tennis_ace_cards` rows per registered user for the season. Called once at season start (Australian Open opener).

**Exit check:** submit a roster with an Ace Card; set a QF captain; card shows as used; second card play attempt rejected.

---

### Sprint T-2 — Admin Tooling (~4h)
*Prerequisites: T-1 complete.*

- [ ] **`admin_open_tournament(p_tournament_id)` RPC** — sets status `roster_open` and optionally sets `roster_lock_at`
- [ ] **`admin_seed_tournament_players(p_tournament_id, p_players jsonb)` RPC** — bulk insert player rows; validates tier assignments; transitions tournament to `roster_open`
- [ ] **`admin_enter_round_results(p_tournament_id, p_eliminated_player_ids uuid[])` RPC**
  - Marks eliminated players; updates `round_reached` and `rounds_won` for all players
  - When 8 remain (QF set): sets `qf_captain_open` + opens 48h window
  - When 1 remains (champion): sets `completed` + emits scoring trigger
- [ ] **`admin_seed_atp_finals_matches(p_season_year, p_matches jsonb)` RPC** — seeds 12 group matches with player assignments; sets ATP Finals to `roster_open`
- [ ] **`admin_enter_atp_finals_result(p_season_year, p_match_number, p_winner_id)` RPC** — writes result; when 12 complete opens knockout picks window; when 15 complete triggers scoring
- [ ] **TennisAdminPanel component** (extends CommissionerPanel) — forms for: seed players, open tournament, enter round results (multi-select of eliminated players), ATP Finals match results toggle

**Exit check:** full admin flow for one tournament: seed players → open roster → enter R1 results → enter R2 results → QF window opens → enter Final results → status = completed.

---

### Sprint T-3 — Scoring Engine + Leaderboard (~6h)
*Prerequisites: T-2 complete.*

- [ ] **`score-tennis-tournament` Edge Function**
  - Reads all rosters for a tournament
  - Applies round-reached points matrix (Slam vs Masters)
  - Applies Ace Card effect (Underdog Boost, Safety Net, Surface Specialist, Dark Horse Insurance)
  - Applies QF Captain 2× if captain reached QF+
  - Writes `tennis_tournament_scores` per user
  - Emits `gazette_entries(entry_type='tennis_result')` per Player's Box: headline + top 3 ranked users
  - Emits `trophy_ledger` row for top-scoring user per Player's Box
  - Idempotent (re-running overwrites scores, does not double-write gazette/trophy)
- [ ] **`score-atp-finals` Edge Function** (can share code module with above)
  - Counts correct picks out of 15 per user
  - Maps to tier → points
  - Writes to `tennis_tournament_scores` (ATP Finals tournament_id)
  - Emits gazette + trophy
- [ ] **`get_player_box_leaderboard(p_player_box_id, p_season_year)` RPC** (SQL as per Part VI above)
- [ ] **`get_tennis_season_summary(p_user_id, p_season_year)` RPC** — per-tournament score breakdown for profile/history view
- [ ] **Manual trigger hook**: `admin_enter_round_results` calls scoring Edge Function via `net.http_post` when `status='completed'` (same pattern as football's `calculate-scores-post-match`)

**Exit check:** run a full simulated tournament (seed players → rosters → results → scoring). Verify: base points correct, Ace Card bonus applied, captain 2× fires for QF+ survivors only, leaderboard ranks correctly with Masters Drop Rule.

---

### Sprint T-4 — UI Screens (~8h)
*Prerequisites: T-3 complete. All logic lives in RPCs; screens are thin.*

All screens follow the platform's `src/screens/` conventions. Mobile-first. No new modals or components that aren't already in the component library unless strictly necessary.

**7 screens / views:**

| Screen | Route | Description |
|---|---|---|
| `PlayerBoxScreen` | `/tennis/box` | Create / join / switch Player's Box; member list; season invite code |
| `TennisHomeScreen` | `/tennis` | Tournament calendar (upcoming + completed cards); current season leaderboard; quick-nav to active tournament |
| `TennisTournamentScreen` | `/tennis/tournament/:id` | Roster picker (7 tier slots); Ace Card selector; QF Captain picker (visible in qf_captain_open phase); personal score once completed |
| `TennisLeaderboardScreen` | `/tennis/leaderboard` | Full season standings (Slam / Masters / Finals breakdown per user); Masters Drop Rule explained inline |
| `TennisAtpFinalsScreen` | `/tennis/finals` | Group stage pick form (12 toggles); knockout pick form (3 matches, opens after group stage); personal result once scored |
| `TennisAdminScreen` | `/tennis/admin` | Player seeding; round result entry; ATP Finals match management; tournament phase controls. Commissioner/admin role only. |
| `TennisProfileView` | Embedded in profile | Trophy cabinet entry for tennis; per-tournament score history |

**Hooks to write:**
- `useTennisCalendar(season_year)` — tournament list with status
- `useTennisTournament(tournament_id)` — player pool, user's roster, surviving players, captain
- `useTennisLeaderboard(player_box_id, season_year)` — season standings
- `useAtpFinalsPicks(season_year)` — user's picks + match results
- `usePlayerBox()` — current user's boxes, create/join actions

**Integration points:**
- AppLayout sport switcher (Phase 1C Sprint UX-1) registers `/tennis` as module #3
- Circle feed (`get_circle_feed`) already handles `tennis_result` gazette entries via migration 188

**Exit check:** full user journey in browser — join a Player's Box → pick a roster with an Ace Card → admin enters results → QF captain window opens → user sets captain → final results entered → score appears → leaderboard updates.

---

## Part VIII — Exit Criteria (MVP Complete)

Phase 2 is shippable when all of the following pass:

- [ ] All 14 ATP 2026 tournaments seeded with correct type, surface, dates
- [ ] Player's Box create/join/invite flow works end-to-end
- [ ] Roster submission validates all 7 tier slots; rejects wrong-tier picks; rejects post-lock submissions
- [ ] Ace Cards: each type applies the correct bonus; each can be used once per season; ATP Finals correctly rejects card play
- [ ] QF Captain window opens when 8 players remain; closes after 48h; only surviving players selectable; no captain = no bonus (not an error)
- [ ] Admin round-result entry correctly updates `eliminated`, `round_reached`, `rounds_won`; transitions tournament status at the right thresholds
- [ ] Scoring: all 4 Ace Card types produce correct point values on known test inputs; captain 2× fires only for QF+ survivors
- [ ] ATP Finals: group picks locked before first match; knockout picks locked before SF; correct picks tallied correctly across all 15 matches; tier mapping matches spec
- [ ] Season leaderboard: Grand Slam sum correct; Masters sum takes best 4 of played (capped at 4); ATP Finals added; ranks update after each tournament
- [ ] Trophy ledger row emitted for each Player's Box's season leader after each tournament
- [ ] `platform.spec.js` 84/84 green (tennis is additive; football untouched)
- [ ] `npm run build` clean (no Rolldown TDZ crashes)

---

## Open Decisions Log

| Decision | Status | Notes |
|---|---|---|
| WTA module | Deferred post-sale | No schema changes needed — `tennis_seasons.tour` enum column to add when ready |
| Auto-API data entry | Deferred post-sale | Manual admin entry for Phase 1; TheSportsDB or ATP Open Data adapter is a drop-in replacement for admin RPCs |
| Push notification on QF window open | Deferred | Same push infrastructure as football notifications; wired in Phase 3A |
| Multi-season carryover | Not applicable for Phase 1 | Season is self-contained Jan–Nov; Ace Cards reset fully |

---

Last Updated: **2026-06-22**
Author: v2 session planning (Claude + user)
