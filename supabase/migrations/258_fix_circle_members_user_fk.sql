-- Fix circle_members.user_id FK: it points at auth.users(id), unlike every other
-- membership table in the codebase (league_members, squads, paddock_members, etc.),
-- which correctly reference public.users(id). PostgREST can't resolve the
-- users(username) embed in useClubhouse.js against the wrong-schema FK, so the
-- Members tab query 400s with PGRST200. Confirmed zero orphaned rows before this
-- migration was written (every circle_members.user_id already has a matching
-- public.users row), so this is a pure schema correction with no data impact.
-- See BACKLOG.md 2026-08-26.
ALTER TABLE circle_members
  DROP CONSTRAINT circle_members_user_id_fkey;

ALTER TABLE circle_members
  ADD CONSTRAINT circle_members_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
