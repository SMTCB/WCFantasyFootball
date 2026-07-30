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
