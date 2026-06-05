-- Migration 145: Remove unique constraint on users.username
--
-- Rationale: username is a display name only. The actual unique identifier
-- for a user is their UUID (users.id), tied to their email in auth.users.
-- Two managers can have the same display name — this is valid and common in
-- private fantasy leagues (e.g. two friends both called "Manager").
--
-- The system references managers by user_id everywhere (squads, league_members,
-- bets, etc.), never by username. Blocking a chosen display name because
-- another account holds it creates unnecessary friction for new users.

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_username_key;
DROP INDEX   IF EXISTS users_username_key;
