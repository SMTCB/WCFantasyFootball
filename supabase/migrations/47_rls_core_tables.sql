-- Migration 47: Enable RLS on core tables
--
-- Players, fixtures, leagues, squads, users, and league_members have had RLS
-- disabled since migration 00. This was acceptable for alpha. This migration
-- enables RLS with policies calibrated to the exact query patterns observed
-- across all hooks and screens.
--
-- KEY RULE: Edge Functions use SERVICE_ROLE_KEY which bypasses RLS entirely.
-- These policies only affect browser clients using the anon/authenticated role.
--
-- To avoid circular RLS evaluation (leagues → league_members → leagues),
-- membership checks are wrapped in SECURITY DEFINER helper functions that
-- query league_members with elevated privilege.

-- ── Helper: membership check (avoids circular RLS) ────────────────────────────
CREATE OR REPLACE FUNCTION is_league_member(p_league_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM league_members
    WHERE league_id = p_league_id
      AND user_id   = auth.uid()
  );
$$;


-- ── players ───────────────────────────────────────────────────────────────────
-- Players are a global public catalogue (no PII). Any authenticated user can
-- browse them (market, squad builder, scoring breakdowns). All writes go through
-- Edge Functions (service role bypasses RLS).

ALTER TABLE players ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated users can read players"
  ON players FOR SELECT
  TO authenticated
  USING (true);


-- ── fixtures ──────────────────────────────────────────────────────────────────
-- Fixture data (schedule, scores) is public information. All writes go through
-- sync-fixtures / ingest-match-events Edge Functions (service role).

ALTER TABLE fixtures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated users can read fixtures"
  ON fixtures FOR SELECT
  TO authenticated
  USING (true);


-- ── leagues ───────────────────────────────────────────────────────────────────
-- Users can only see leagues they belong to. Invite-code lookups to join a
-- league go through the create_league / join_league RPC (SECURITY DEFINER),
-- which bypasses this policy.

ALTER TABLE leagues ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members can read their leagues"
  ON leagues FOR SELECT
  TO authenticated
  USING (is_league_member(id));

-- Creator can update league settings (name, format, settings).
CREATE POLICY "creator can update league"
  ON leagues FOR UPDATE
  TO authenticated
  USING   (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());


-- ── squads ────────────────────────────────────────────────────────────────────
-- All managers in a league can see each other's squads (needed for:
--   1. Transfer market — useTransfer fetches all squads to build takenMap
--   2. Standings — scoring layer reads squads to compute points
-- Users may only INSERT/UPDATE their own squad row.
-- process-transfer Edge Function uses service role and is unaffected.

ALTER TABLE squads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "league members can read squads in their leagues"
  ON squads FOR SELECT
  TO authenticated
  USING (is_league_member(league_id));

CREATE POLICY "users can create own squad"
  ON squads FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "users can update own squad"
  ON squads FOR UPDATE
  TO authenticated
  USING   (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());


-- ── users (profiles) ──────────────────────────────────────────────────────────
-- Profiles expose only username / avatar / xp — no PII. Shown in standings,
-- chat, and the transfer market. Any authenticated user can read any profile.
-- Users may only create or update their own profile row.

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated users can read all profiles"
  ON users FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "users can create own profile"
  ON users FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid());

CREATE POLICY "users can update own profile"
  ON users FOR UPDATE
  TO authenticated
  USING   (id = auth.uid())
  WITH CHECK (id = auth.uid());


-- ── league_members ────────────────────────────────────────────────────────────
-- Users can see the roster of any league they belong to (needed for standings,
-- transfer market, chat). Users can join a league as themselves (direct insert
-- with invite code). All rank/points updates go through service-role RPCs.

ALTER TABLE league_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members can read league rosters"
  ON league_members FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR is_league_member(league_id)
  );

-- Users can join a league as themselves (invite-code flow inserts their own row).
CREATE POLICY "users can join leagues as themselves"
  ON league_members FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());
