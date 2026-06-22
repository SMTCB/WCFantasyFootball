# F1 Module — Assessment & Implementation Plan

**This is the authoritative source for Phase 1B of the v2 sale-ready build. Read the full assessment before touching any F1 code.**

---

## Part I — Assessment: FantasyF1 Repo Review

**Source repo:** https://github.com/SMTCB/FantasyF1 (assessed 2026-06-22)

### What it is

**Next.js 16 + Supabase + Tailwind 4** — same backend stack as Forza, different frontend framework (Next.js App Router vs Vite/React). TypeScript throughout. No Capacitor/mobile layer.

**Game model: prediction betting.** Not a fantasy squad builder. Every user predicts:
- **Per race (24 races):** P1/P2/P3 podium, DNF driver, team with most constructor points, one special category question (18 unique questions rotated across the calendar)
- **Season-long (once per user):** championship outcomes — driver champion, P2/P3, constructor champion, last constructor, fewest finishers race, most DNFs driver, first driver replaced, most poles, most podiums without a win

Results are entered by admin (manually or auto-fetched from OpenF1 API). Scoring runs in TypeScript (`scoring.ts`) — fully ported to the v2 build.

**Data provider:** OpenF1 (open-source, no API key, free). Used for session lock timing, race results, championship standings.

---

### Schema (3 migrations, clean)

| Table | Purpose |
|---|---|
| `profiles` | Auth users + `is_admin` flag |
| `races` | 24-race 2026 calendar, result fields, `session_start` (from OpenF1), locking |
| `bets_race` | Per-race prediction per user. `UNIQUE(user_id, round)` |
| `bets_year` | Season prediction per user. `UNIQUE(user_id)` |
| `scores` | Calculated points: race + year types. `UNIQUE(user_id, round, score_type)` |
| `year_results` | Final season standings (admin-entered) |
| `leaderboard` | View joining all of the above |

RLS is hardened: bets lock 5 minutes before race `session_start` (from OpenF1). Year bets lock via global `year_results.is_bets_locked`. Admins identified by `profiles.is_admin`.

---

### What is reusable (direct port)

| Asset | Location in FantasyF1 | Status |
|---|---|---|
| **Scoring engine** | `src/lib/scoring.ts` | Port as-is — complete, unit-tested, handles ties |
| **OpenF1 client** | `src/lib/openf1.ts` | Port as-is — session lookup, race results, championship standings, retry/backoff |
| **Season data constants** | `src/lib/f1-data.ts` | Port as-is — 11 teams, 22 drivers, 24-race calendar, special category rotation |
| **Admin result entry** | `src/app/admin/page.tsx` | Port core logic — result entry, OpenF1 auto-fetch, override support |
| **RLS locking pattern** | `supabase/migrations/003_hardened_rls.sql` | Adapt for v2 conventions |

The scoring and OpenF1 files are framework-agnostic TypeScript — they import no Next.js dependencies. They become `.js` files in the Vite/React monorepo.

---

### The core gap: no group/league concept

The repo is one global leaderboard. All users compete together, with no isolation per group.

**Architecture decisions confirmed for the v2 build:**

1. **One prediction per race.** Bets are global per user — if a user is in two paddocks, they make one set of picks per race (shared). This is simpler and more honest. No per-paddock bet tables.
2. **Naming: Paddock.** A paddock is exclusive (paddock passes are hard to get), intimate, and inherently F1. "Join the Paddock" / "Create a Paddock" / "Paddock Standings" all read naturally.
3. **Framework: Vite/React.** Port to the Forza monorepo's `src/screens/` as new routes. One codebase, one deploy — what a B2B buyer expects.
4. **Chat and Gazette: one level up.** F1 paddocks do NOT have their own chat or gazette. Both are Circle-layer features (cross-sport, cross-competition). The Circle feed (`get_circle_feed`) already handles this via migration 188. Football leagues will eventually migrate chat to the same level.
5. **Trophy ledger: holistic.** Already designed at Circle scope in migration 189. F1 race winners and season winners write to `trophy_ledger` — same table as football trophies.

---

### Gap list (what needs to be built)

**DB schema gaps:**

| Gap | What's needed |
|---|---|
| No group concept | `paddocks` table + `paddock_members` table |
| No circle ↔ paddock link | `circle_paddocks` junction table |
| No F1 tables in Forza DB | `f1_races`, `f1_bets_race`, `f1_bets_year`, `f1_scores`, `f1_year_results` |
| No paddock leaderboard | `get_paddock_leaderboard(p_paddock_id)` RPC |
| No paddock management RPCs | `create_paddock()`, `join_paddock_by_code()`, `get_my_paddocks()` |

**Frontend gaps (new screens, all ported from Next.js or new):**

| Screen | Source | Type |
|---|---|---|
| `F1HomeScreen` | New | Race calendar + next-race countdown |
| `F1RaceBetScreen` | Port of `bets/race/[round]/page.tsx` | Per-race prediction form |
| `F1SeasonBetsScreen` | Port of `bets/year/page.tsx` | Season prediction form |
| `F1StandingsScreen` | Port of `Leaderboard.tsx` | Paddock leaderboard |
| `F1ReportScreen` | Port of `bets/report/page.tsx` | Historical results + score breakdown |
| `F1AdminScreen` | Port of `admin/page.tsx` | Result entry + OpenF1 fetch + scoring trigger |
| `PaddockLobbyScreen` | New | Create/join paddock, invite code share |

**Integration gaps:**

| Gap | Description |
|---|---|
| Sport switcher | AppLayout needs to route between football and F1 |
| `SportContext.jsx` | Resolves active sport from active competition's `sport_id` |
| Trophy ledger wiring | Race winner + season winner → `trophy_ledger` row |
| Gazette wiring | Post-race scoring → `gazette_entries` → Circle feed |

---

## Part II — Implementation Plan

### Architecture overview

```
Circle (cross-sport group)
  ├── circle_leagues → Football leagues (existing)
  └── circle_paddocks → F1 paddocks (new)

Paddock (F1 competition)
  ├── paddock_members (owner + members)
  ├── bets: f1_bets_race (global per user, filtered by paddock members)
  └── leaderboard: get_paddock_leaderboard() (sums f1_scores for paddock members)

Scores (global per user, not per paddock)
  └── f1_scores(user_id, round_number, score_type, total_points)
      → paddock leaderboard = filter scores WHERE user_id IN paddock_members
```

**Why scores are global and not per-paddock:** bets are one set of predictions per user per race. Scoring a bet produces one score per user per race. A user's leaderboard position in a paddock is simply their global score ranked against their paddock peers — no per-paddock score duplication needed.

---

### Sprint F1-0 — DB Schema Foundation

**Effort: ~4h | Migration numbers: 190–191**

**Goal:** lay the full F1 schema in the v2 DB. All tables are additive — zero football impact.

**Migration 190 — Paddocks + F1 core tables:**

```sql
BEGIN;

-- PADDOCKS (F1 equivalent of leagues)
CREATE TABLE IF NOT EXISTS paddocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  season integer NOT NULL DEFAULT 2026,
  invite_code text NOT NULL UNIQUE DEFAULT substring(gen_random_uuid()::text, 1, 8),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  sport_id uuid NOT NULL REFERENCES sports(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE paddocks ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS paddock_members (
  paddock_id uuid NOT NULL REFERENCES paddocks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (paddock_id, user_id)
);
ALTER TABLE paddock_members ENABLE ROW LEVEL SECURITY;

-- Junction: circles ↔ paddocks
CREATE TABLE IF NOT EXISTS circle_paddocks (
  circle_id uuid NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
  paddock_id uuid NOT NULL REFERENCES paddocks(id) ON DELETE CASCADE,
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (circle_id, paddock_id)
);
ALTER TABLE circle_paddocks ENABLE ROW LEVEL SECURITY;

-- All tables created — now add RLS policies
CREATE POLICY "paddocks_member_read" ON paddocks FOR SELECT
  USING (EXISTS (SELECT 1 FROM paddock_members pm WHERE pm.paddock_id = id AND pm.user_id = auth.uid()));

CREATE POLICY "paddock_members_member_read" ON paddock_members FOR SELECT
  USING (EXISTS (SELECT 1 FROM paddock_members pm WHERE pm.paddock_id = paddock_members.paddock_id AND pm.user_id = auth.uid()));

CREATE POLICY "circle_paddocks_member_read" ON circle_paddocks FOR SELECT
  USING (EXISTS (SELECT 1 FROM circle_members cm WHERE cm.circle_id = circle_paddocks.circle_id AND cm.user_id = auth.uid()));

-- F1 RACES (season calendar + results store)
CREATE TABLE IF NOT EXISTS f1_races (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season integer NOT NULL DEFAULT 2026,
  round_number integer NOT NULL CHECK (round_number BETWEEN 1 AND 24),
  gp_name text NOT NULL,
  circuit text NOT NULL,
  race_date date NOT NULL,
  is_saturday boolean NOT NULL DEFAULT false,
  qualifying_at timestamptz,        -- from OpenF1 sync or manual
  race_at timestamptz,              -- from OpenF1 sync or manual; locks bets 5 min before
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','qualifying','race','finished')),
  special_category_question text,
  special_category_type text CHECK (special_category_type IN ('driver','team','options')),
  special_category_options text[],  -- for type='options'
  result_p1 text,
  result_p2 text,
  result_p3 text,
  result_dnf_drivers text[],
  result_team_most_points text,
  special_category_answer text,
  is_scored boolean NOT NULL DEFAULT false,
  is_manual_unlock boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(season, round_number)
);
ALTER TABLE f1_races ENABLE ROW LEVEL SECURITY;
CREATE POLICY "f1_races_public_read" ON f1_races FOR SELECT USING (true);
CREATE POLICY "f1_races_admin_write" ON f1_races FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

-- F1 BETS — PER RACE (global per user, one set of picks per race regardless of paddocks)
CREATE TABLE IF NOT EXISTS f1_bets_race (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  season integer NOT NULL DEFAULT 2026,
  round_number integer NOT NULL,
  p1 text NOT NULL,
  p2 text NOT NULL,
  p3 text NOT NULL,
  dnf_driver text,
  team_most_points text,
  special_category_answer text,
  is_locked boolean NOT NULL DEFAULT false,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, season, round_number)
);
ALTER TABLE f1_bets_race ENABLE ROW LEVEL SECURITY;
CREATE POLICY "f1_bets_race_public_read" ON f1_bets_race FOR SELECT USING (true);
CREATE POLICY "f1_bets_race_own_insert" ON f1_bets_race FOR INSERT WITH CHECK (
  auth.uid() = user_id AND NOT EXISTS (
    SELECT 1 FROM f1_races r
    WHERE r.season = f1_bets_race.season AND r.round_number = f1_bets_race.round_number
    AND (r.is_manual_unlock = false AND r.race_at IS NOT NULL AND r.race_at - interval '5 minutes' <= now())
  )
);
CREATE POLICY "f1_bets_race_own_update" ON f1_bets_race FOR UPDATE USING (
  auth.uid() = user_id AND NOT is_locked
);

-- F1 BETS — SEASON (once per user per season)
CREATE TABLE IF NOT EXISTS f1_bets_year (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  season integer NOT NULL DEFAULT 2026,
  driver_champion text,
  driver_p2 text,
  driver_p3 text,
  constructor_champion text,
  last_constructor text,
  fewest_finishers_race text,
  most_dnfs_driver text,
  first_driver_replaced text,
  most_poles text,
  most_podiums_no_win text,
  is_locked boolean NOT NULL DEFAULT false,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, season)
);
ALTER TABLE f1_bets_year ENABLE ROW LEVEL SECURITY;
CREATE POLICY "f1_bets_year_public_read" ON f1_bets_year FOR SELECT USING (true);
CREATE POLICY "f1_bets_year_own_write" ON f1_bets_year FOR INSERT WITH CHECK (auth.uid() = user_id AND NOT is_locked);
CREATE POLICY "f1_bets_year_own_update" ON f1_bets_year FOR UPDATE USING (auth.uid() = user_id AND NOT is_locked);

-- F1 SCORES (global per user — paddock leaderboard filters by membership)
CREATE TABLE IF NOT EXISTS f1_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  season integer NOT NULL DEFAULT 2026,
  round_number integer,             -- null for year-bet scores
  score_type text NOT NULL CHECK (score_type IN ('race','year')),
  breakdown jsonb NOT NULL DEFAULT '{}',
  total_points integer NOT NULL DEFAULT 0,
  is_override boolean NOT NULL DEFAULT false,
  override_reason text,
  scored_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, season, round_number, score_type)
);
ALTER TABLE f1_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "f1_scores_public_read" ON f1_scores FOR SELECT USING (true);
CREATE POLICY "f1_scores_admin_write" ON f1_scores FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

-- F1 YEAR RESULTS (admin-entered season-end standings)
CREATE TABLE IF NOT EXISTS f1_year_results (
  id serial PRIMARY KEY,
  season integer NOT NULL UNIQUE,
  driver_champion text,
  driver_p2 text,
  driver_p3 text,
  constructor_champion text,
  last_constructor text,
  fewest_finishers_race text,
  most_dnfs_driver text,
  first_driver_replaced text,
  most_poles text,
  most_podiums_no_win text,
  is_final boolean NOT NULL DEFAULT false,
  is_bets_locked boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE f1_year_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "f1_year_results_public_read" ON f1_year_results FOR SELECT USING (true);
CREATE POLICY "f1_year_results_admin_write" ON f1_year_results FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

INSERT INTO f1_year_results (season, is_bets_locked) VALUES (2026, false) ON CONFLICT (season) DO NOTHING;

COMMIT;
```

**Migration 191 — Paddock RPCs + 2026 race calendar seed:**

```sql
BEGIN;

-- create_paddock: authenticated user creates a new paddock and becomes owner
CREATE OR REPLACE FUNCTION create_paddock(p_name text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_paddock_id uuid;
  v_sport_id uuid;
BEGIN
  SELECT id INTO v_sport_id FROM sports WHERE slug = 'f1';
  INSERT INTO paddocks (name, created_by, sport_id)
    VALUES (p_name, auth.uid(), v_sport_id)
    RETURNING id INTO v_paddock_id;
  INSERT INTO paddock_members (paddock_id, user_id, role)
    VALUES (v_paddock_id, auth.uid(), 'owner');
  RETURN v_paddock_id;
END;
$$;
GRANT EXECUTE ON FUNCTION create_paddock(text) TO authenticated;

-- join_paddock_by_code: authenticated user joins a paddock by invite code
CREATE OR REPLACE FUNCTION join_paddock_by_code(p_code text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_paddock_id uuid;
BEGIN
  SELECT id INTO v_paddock_id FROM paddocks WHERE invite_code = p_code;
  IF v_paddock_id IS NULL THEN RAISE EXCEPTION 'PADDOCK_NOT_FOUND'; END IF;
  INSERT INTO paddock_members (paddock_id, user_id, role)
    VALUES (v_paddock_id, auth.uid(), 'member')
    ON CONFLICT (paddock_id, user_id) DO NOTHING;
  RETURN v_paddock_id;
END;
$$;
GRANT EXECUTE ON FUNCTION join_paddock_by_code(text) TO authenticated;

-- get_paddock_leaderboard: total + race + year points for each paddock member
CREATE OR REPLACE FUNCTION get_paddock_leaderboard(p_paddock_id uuid)
RETURNS TABLE (
  user_id uuid, display_name text, avatar_emoji text,
  total_points bigint, race_points bigint, year_points bigint,
  races_scored bigint, rank bigint
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT
    pm.user_id,
    pr.display_name,
    pr.avatar_emoji,
    COALESCE(SUM(s.total_points), 0) AS total_points,
    COALESCE(SUM(s.total_points) FILTER (WHERE s.score_type = 'race'), 0) AS race_points,
    COALESCE(SUM(s.total_points) FILTER (WHERE s.score_type = 'year'), 0) AS year_points,
    COUNT(s.id) FILTER (WHERE s.score_type = 'race') AS races_scored,
    RANK() OVER (ORDER BY COALESCE(SUM(s.total_points), 0) DESC) AS rank
  FROM paddock_members pm
  JOIN profiles pr ON pr.id = pm.user_id
  LEFT JOIN f1_scores s ON s.user_id = pm.user_id AND s.season = 2026
  WHERE pm.paddock_id = p_paddock_id
  GROUP BY pm.user_id, pr.display_name, pr.avatar_emoji;
END;
$$;
GRANT EXECUTE ON FUNCTION get_paddock_leaderboard(uuid) TO authenticated;

-- get_my_paddocks: list of paddocks the caller belongs to
CREATE OR REPLACE FUNCTION get_my_paddocks()
RETURNS TABLE (
  paddock_id uuid, name text, invite_code text, role text,
  member_count bigint, season integer
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id, p.name, p.invite_code, pm.role,
    COUNT(*) OVER (PARTITION BY p.id) AS member_count,
    p.season
  FROM paddock_members pm
  JOIN paddocks p ON p.id = pm.paddock_id
  WHERE pm.user_id = auth.uid()
  ORDER BY pm.joined_at;
END;
$$;
GRANT EXECUTE ON FUNCTION get_my_paddocks() TO authenticated;

-- Seed 2026 race calendar (24 races + special categories from FantasyF1)
INSERT INTO f1_races (season, round_number, gp_name, circuit, race_date, is_saturday, special_category_question, special_category_type) VALUES
  (2026, 1,  'Australian GP',         'Albert Park',            '2026-03-08', false, 'Number of pit stops by the 1st place finisher', 'options'),
  (2026, 2,  'Chinese GP',            'Shanghai International', '2026-03-15', false, 'Driver who will receive penalties during the race', 'driver'),
  (2026, 3,  'Japanese GP',           'Suzuka',                 '2026-03-29', false, 'Fastest lap', 'driver'),
  (2026, 4,  'Bahrain GP',            'Sakhir',                 '2026-04-12', false, 'Fastest lap', 'driver'),
  (2026, 5,  'Saudi Arabian GP',      'Jeddah Street',          '2026-04-19', false, 'Last place finisher (excluding DNF)', 'driver'),
  (2026, 6,  'Miami GP',              'Miami Gardens',          '2026-05-03', false, 'Driver of the day', 'driver'),
  (2026, 7,  'Canadian GP',           'Montreal',               '2026-05-24', false, 'Driver of the day', 'driver'),
  (2026, 8,  'Monaco GP',             'Monte Carlo',            '2026-06-07', false, 'Team with the slowest pit stop', 'team'),
  (2026, 9,  'Barcelona-Catalunya GP','Catalunya',              '2026-06-14', false, 'Driver who finishes in a position with the most places recovered', 'driver'),
  (2026, 10, 'Austrian GP',           'Red Bull Ring',          '2026-06-28', false, 'Time between 1st and 2nd place', 'options'),
  (2026, 11, 'British GP',            'Silverstone',            '2026-07-05', false, 'Number of DNFs', 'options'),
  (2026, 12, 'Belgian GP',            'Spa-Francorchamps',      '2026-07-19', false, 'Team with fastest pit stop', 'team'),
  (2026, 13, 'Hungarian GP',          'Hungaroring',            '2026-07-26', false, 'Number of DNFs', 'options'),
  (2026, 14, 'Dutch GP',              'Zandvoort',              '2026-08-23', false, 'Team with fastest pit stop', 'team'),
  (2026, 15, 'Italian GP',            'Monza',                  '2026-09-06', false, 'Number of safety car entries', 'options'),
  (2026, 16, 'Spanish GP (Madrid)',   'Madrid (Debut)',          '2026-09-13', false, 'Team with fewest combined points', 'team'),
  (2026, 17, 'Azerbaijan GP',         'Baku',                   '2026-09-26', true,  'Sprint race winner', 'driver'),
  (2026, 18, 'Singapore GP',          'Marina Bay',             '2026-10-11', false, 'Team with greatest seat distance between drivers', 'team'),
  (2026, 19, 'United States GP',      'COTA',                   '2026-10-25', false, 'Driver who will lead the race at the end of the 1st lap', 'driver'),
  (2026, 20, 'Mexico City GP',        'Hermanos Rodriguez',     '2026-11-01', false, 'Number of safety car entries', 'options'),
  (2026, 21, 'São Paulo GP',          'Interlagos',             '2026-11-08', false, 'First retirement', 'driver'),
  (2026, 22, 'Las Vegas GP',          'Las Vegas',              '2026-11-21', true,  'Sprint race winner', 'driver'),
  (2026, 23, 'Qatar GP',              'Lusail',                 '2026-11-29', false, 'Driver with the most seats lost (excluding DNF)', 'driver'),
  (2026, 24, 'Abu Dhabi GP',          'Yas Marina',             '2026-12-06', false, 'Team with fastest pit stop', 'team')
ON CONFLICT (season, round_number) DO NOTHING;

COMMIT;
```

**Acceptance check:** `SELECT * FROM paddocks`, `SELECT * FROM f1_races ORDER BY round_number` both return expected rows. `create_paddock('Test F1')` from anon returns error; from authenticated returns a UUID.

---

### Sprint F1-1 — Port core screens to Vite/React

**Effort: ~8h**

**Goal:** 5 screens plus the 3 shared lib files ported from Next.js into the Forza monorepo. No new backend work — reads from the schema built in F1-0.

**Lib files (port to `src/lib/f1/`):**

| Source (Next.js) | Dest (Vite/React) | Change |
|---|---|---|
| `src/lib/scoring.ts` | `src/lib/f1/scoring.js` | Drop TS types, keep all logic |
| `src/lib/openf1.ts` | `src/lib/f1/openf1.js` | Drop TS types, keep all fetch logic |
| `src/lib/f1-data.ts` | `src/lib/f1/f1-data.js` | Drop TS types, keep teams/drivers/calendar constants |

**Screens to create (`src/screens/f1/`):**

**`F1HomeScreen.jsx`** — entry point for the F1 module.
- Lists upcoming races from `f1_races` (status ≠ finished), ordered by round
- Shows next race card with countdown (qualifying and race time)
- Shows the current paddock leaderboard top 3 (from `get_paddock_leaderboard`)
- Race calendar strip (all 24 rounds, past = dimmed, current = highlighted, future = default)
- Bottom action: "MY PICKS" button → F1RaceBetScreen for the next unlocked race

**`F1RaceBetScreen.jsx`** — per-race prediction form.
- Fetch active race from `f1_races` (next scheduled, or param `?round=N`)
- Three driver pickers (P1/P2/P3) — dropdown from `f1-data.js` DRIVERS list, no duplicate allowed
- DNF picker (driver, optional)
- Team with most points picker (TEAMS list)
- Special category answer (question text + appropriate input: driver picker / team picker / option buttons)
- Submit via Supabase `.upsert()` on `f1_bets_race` (same anon client as football)
- Lock: if `race_at - 5min <= now()` and `is_manual_unlock = false` → read-only mode with lock notice
- Prior bet pre-fills form if it exists

**`F1SeasonBetsScreen.jsx`** — season prediction form.
- One form per user per season (`f1_bets_year`)
- 10 fields matching the schema (driver champion, P2, P3, constructor champion, last constructor, fewest finishers race, most DNFs driver, first replaced, most poles, most podiums no win)
- Lock gate: `f1_year_results.is_bets_locked = true` → read-only
- Submit via `.upsert()` on `f1_bets_year`

**`F1StandingsScreen.jsx`** — paddock leaderboard.
- Calls `get_paddock_leaderboard(paddockId)`
- Table: RANK / DRIVER (display name) / RACES / RACE PTS / YEAR PTS / TOTAL
- Toggle: race points vs season points vs total
- Highlight caller's own row

**`F1ReportScreen.jsx`** — historical results and score breakdown.
- Lists past races (`status = 'finished'`)
- Per race: actual results (P1/P2/P3/DNF/team/special), user's picks, points breakdown
- Season bet status (pending until `is_final = true`)
- Data: join `f1_races` + `f1_bets_race` + `f1_scores`

**Routes (add to `src/App.jsx`):**
```jsx
// F1 module routes (gated behind sport switcher in UX-1)
<Route path="/f1/:paddockId" element={<F1HomeScreen />} />
<Route path="/f1/:paddockId/picks/:round?" element={<F1RaceBetScreen />} />
<Route path="/f1/:paddockId/season" element={<F1SeasonBetsScreen />} />
<Route path="/f1/:paddockId/standings" element={<F1StandingsScreen />} />
<Route path="/f1/:paddockId/report" element={<F1ReportScreen />} />
<Route path="/f1/:paddockId/admin" element={<F1AdminScreen />} />
```

**Acceptance check:** navigate to `/f1/:paddockId`, see race calendar, submit picks for next unlocked race, verify row in `f1_bets_race`, view standings.

---

### Sprint F1-2 — Paddock management UI

**Effort: ~3h**

**Goal:** create/join flow so users can form and invite each other into paddocks.

**`PaddockLobbyScreen.jsx`** — pre-paddock entry point (shown when user has no active paddock selected).
- "CREATE A PADDOCK" flow: name input → calls `create_paddock(name)` → shows 8-char invite code with copy button
- "JOIN A PADDOCK" flow: invite code input → calls `join_paddock_by_code(code)`
- "MY PADDOCKS" list: calls `get_my_paddocks()` → each card shows paddock name, member count, role badge, ENTER button

**`PaddockInviteCard.jsx`** — reusable invite code share card (parallel to football's `LeagueInviteCard.jsx`).
- Shows paddock name, invite code in large monospace
- Copy button, share button (native share API on mobile)
- Branded F1 styling

**Paddock selector:** a compact paddock picker at the top of `F1HomeScreen` (same UX as `LeagueSelector.jsx` in football). Users who belong to multiple paddocks can switch between them. Active paddock stored in `localStorage` as `activePaddockId`.

**Hook: `usePaddock.js`** (`src/hooks/f1/usePaddock.js`)
- `myPaddocks`: result of `get_my_paddocks()` RPC
- `activePaddock`: the currently selected paddock (from localStorage + validation)
- `setActivePaddock(id)`: updates localStorage
- `createPaddock(name)`, `joinPaddockByCode(code)`: wraps RPC calls

**Acceptance check:** create a paddock, copy invite code, log in as a second test user, join via code, both users appear in `get_paddock_leaderboard()` result.

---

### Sprint F1-3 — Admin panel + scoring engine

**Effort: ~5h**

**Goal:** admin can enter race results and trigger scoring. `f1_scores` rows are written and the paddock leaderboard updates.

**`F1AdminScreen.jsx`** — gated on `profiles.is_admin = true`.

Sections:

1. **Race results entry:**
   - Dropdown: select race (shows rounds with `is_scored = false` first)
   - P1/P2/P3 driver pickers, DNF driver picker (multi-select), team with most points picker, special category answer input
   - "FETCH FROM OpenF1" button: calls `openf1.js` → `fetchRaceSession` → `fetchSessionResult` → maps positions to driver names → auto-fills the form
   - "SAVE RESULTS" button: writes to `f1_races` result columns; sets `status = 'finished'`; triggers scoring

2. **Scoring trigger:**
   - "SCORE THIS RACE" button: calls Edge Function `score-f1-race` (or can be a direct RPC) → reads `f1_bets_race` for all users for this round, applies `scoreRaceBet()` logic, writes `f1_scores` rows, sets `f1_races.is_scored = true`
   - Shows scoring summary after run: N bets scored, top scorer, points distribution

3. **Year results entry (season end only):**
   - All 10 season prediction fields
   - "LOCK YEAR BETS" button: sets `f1_year_results.is_bets_locked = true`
   - "SCORE YEAR BETS" button: applies `scoreYearBet()` to all `f1_bets_year` rows

4. **Bet lock override:**
   - Toggle `is_manual_unlock` on any race (unlocks bets after race start for admin correction)

**Edge Function: `score-f1-race`** (`supabase/functions/score-f1-race/index.js`)
- Accepts `{ race_id }` body + service-role auth
- Reads `f1_races` result for the race
- Reads all `f1_bets_race` rows for that round + season
- Applies `scoreRaceBet()` (ported from `scoring.js`)
- Upserts `f1_scores` per user
- Writes `gazette_entries(entry_type='activity')` per circle that has a paddock with at least one user in this race: "Race N complete — {display_name} leads with {N} pts"
- For the race winner (highest scorer): writes `trophy_ledger(trophy_type='round_win', sport_id=f1_sport_id)` row
- Returns `{ scored: N, winner: display_name, winner_pts: N }`

**Acceptance check:** admin enters Monaco GP results → clicks SCORE → `f1_scores` has rows for all users who submitted picks → paddock leaderboard updates → `gazette_entries` row appears → `trophy_ledger` row for winner.

---

### Sprint F1-4 — Integration + wiring

**Effort: ~2h**

**Goal:** F1 screens are reachable from the main app. Sport switcher works. Trophy and gazette wiring confirmed end-to-end.

**Tasks:**

- [ ] `AppLayout.jsx`: sport switcher button (top of sidebar / header) — shows "Football" or "F1" based on active context; tapping switches to the other sport's home screen. Initially simple: two modes, hardcoded. `SportContext.jsx` handles the state. (Full dynamic version in Sprint UX-1.)
- [ ] `SportContext.jsx` (`src/context/SportContext.jsx`): `activeSport` state ('football'|'f1'), `setActiveSport(slug)` — persisted in localStorage. `App.jsx` uses `activeSport` to show the correct home screen on the root route `/`.
- [ ] F1 nav tab labels: Calendar / Picks / Standings / Report (not the football tabs). Rendered by `AppLayout` when `activeSport === 'f1'`.
- [ ] `circle_paddocks` junction: when `create_paddock()` is called and the user is in a circle, optionally link the paddock to the circle. Add a param `p_circle_id` to `create_paddock()` (optional, nullable).
- [ ] `get_circle_feed()` update (migration): include `gazette_entries` rows from races within paddocks linked to the circle. The existing function already reads `league_id` — extend to also join `circle_paddocks`.
- [ ] `platform.spec.js`: add 2 F1 smoke tests (navigate to `/f1/:paddockId` renders without error; F1 picks form renders for the next unlocked race).
- [ ] `npm run build` passes with F1 routes registered — no Rolldown TDZ errors.

**Acceptance check (end-to-end):** switch to F1 mode → enter paddock → submit race picks → admin scores race → paddock leaderboard updates → circle feed shows "Race N complete" gazette entry → trophy cabinet shows winner's badge.

---

### Sprint F1-5 — OpenF1 sync cron (optional, pre-sale)

**Effort: ~2h | Status: ⬜ deferred to after MVP**

**Goal:** auto-fetch qualifying/race start times from OpenF1 so the bet lock triggers correctly without manual admin input.

- Edge Function `sync-f1-sessions` + cron (every 6h): for all upcoming races in the current season, calls `openf1.js` → `fetchRaceSession` + `fetchQualifyingSession` → upserts `f1_races.qualifying_at` + `f1_races.race_at`; skips already-finished races
- Flip cron: when `race_at - 5min <= now()` and race status still 'scheduled', flip to 'race' → all client checks use `f1_races.race_at` directly, so the lock is automatic

**Note:** MVP is fully functional without this cron — admin can set `qualifying_at`/`race_at` manually for each race in the admin panel. Add this cron when you want zero-admin operation.

---

## Delivery Summary

| Sprint | What | Effort | Migrations |
|---|---|---|---|
| **F1-0** | DB schema — paddocks, F1 tables, RPCs, calendar seed | ~4h | 190, 191 |
| **F1-1** | Port 5 screens + 3 lib files to Vite/React | ~8h | — |
| **F1-2** | Paddock management UI (create/join/switch) | ~3h | — |
| **F1-3** | Admin panel + `score-f1-race` Edge Function | ~5h | — |
| **F1-4** | AppLayout sport switcher + circle/gazette wiring | ~2h | 192 (circle_paddocks patch) |
| **F1-5** | OpenF1 sync cron (optional, pre-sale) | ~2h | 193 |
| **Total** | **MVP complete after F1-4** | **~22h** | |

**MVP exit criteria (F1-4 complete):**
1. User can create a paddock and share invite code
2. Other users can join via code
3. Race picks can be submitted before qualifying lock
4. Admin can enter results and trigger scoring
5. Paddock leaderboard shows correct standings
6. Circle feed shows post-race gazette entry
7. Trophy ledger gets race winner row
8. Season bets can be submitted and scored at year end
9. Sport switcher takes user between Football and F1 modes
10. `platform.spec.js` still 84/84 green

---

## Open Decisions (record answers in session notes below)

| Decision | Default | Status |
|---|---|---|
| Scoring weights (pts per exact P1, P2, P3, wrong-spot, DNF, team, special) | Copy from FantasyF1 scoring constants | ⬜ Confirm |
| All-correct bonus (all categories right in one race) | 3 pts (from FantasyF1) | ⬜ Confirm |
| Can a user be in multiple paddocks? | Yes — picks shared across all | ✅ Confirmed |
| Chat in paddock? | No — chat is Circle-level (future) | ✅ Confirmed |
| Gazette/frontpage in paddock? | No — gazette is Circle-level | ✅ Confirmed |
| Trophy ledger scope | Circle-level holistic, all sports | ✅ Confirmed |

---

## Session Notes

*(Update per session. Date + what was done + next action.)*

---

Last updated: **2026-06-22**
