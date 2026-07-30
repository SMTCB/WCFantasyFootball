-- ── Test harness bootstrap — stand-ins for Supabase platform primitives ──────
--
-- supabase/schema.sql is a public-schema-only pg_dump (see its own header) —
-- it does NOT include the `auth` schema, since that's owned by Supabase's
-- GoTrue service in prod, not by our own migrations. But ~37 FKs across
-- public tables (leagues.created_by, coin_wallets.user_id, etc.) reference
-- auth.users(id), and tests/unit/seed.sql inserts test users directly into
-- auth.users. Neither exists on a vanilla postgres:15-alpine container, so
-- both schema.sql and seed.sql fail without this file loaded first.
--
-- This is NOT an attempt to emulate Supabase Auth — just enough of a stand-in
-- (schema, table, roles) to satisfy FK targets and GRANT statements. Tests
-- connect as the postgres superuser, which bypasses RLS entirely, so no
-- auth.uid()/auth.role() stand-ins are needed.
--
-- Run before schema.sql, which is in turn run before seed.sql.

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN;
  END IF;
END $$;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS extensions;

CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY,
  email text,
  raw_user_meta_data jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- tests/unit/helpers.js's callRpc() sets request.jwt.claim.sub /
-- request.jwt.claims via set_config() to mirror how PostgREST/Supabase
-- populate them from the caller's JWT for each request. These are the real
-- Supabase auth.uid()/auth.role() definitions (not a dumbed-down stand-in),
-- so acting-as-a-specific-user tests behave identically to prod; when
-- callRpc() is called with no actingUserId (simulating cron/service-role),
-- both settings are cleared and these correctly resolve to NULL.
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$
    SELECT COALESCE(
      NULLIF(current_setting('request.jwt.claim.sub', true), ''),
      (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
    )::uuid
  $$;

CREATE OR REPLACE FUNCTION auth.role() RETURNS text
  LANGUAGE sql STABLE
  AS $$
    SELECT COALESCE(
      NULLIF(current_setting('request.jwt.claim.role', true), ''),
      (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
    )::text
  $$;
