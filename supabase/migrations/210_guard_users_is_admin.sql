-- ✅ APPLIED TO PRODUCTION 2026-06-28 (TRACKER row 2)
-- Migration 210: Guard users.is_admin from direct client writes (SEC-1)
--
-- Problem: The users UPDATE RLS policy restricts *which row* a user can edit
-- (their own) but not *which columns*. Any authenticated user can run:
--   supabase.from('users').update({ is_admin: true }).eq('id', own_uid)
-- and gain access to the F1 admin panel + score-writing RLS policies.
--
-- Fix: BEFORE UPDATE trigger that raises an exception if a client-role session
-- attempts to change is_admin (or the immutable id). Service-role callers
-- (Supabase dashboard, admin RPCs) pass through unchanged.
--
-- Pattern mirrors guard_squad_protected_columns() from migration 123.
--
-- ⚠️  APPLY FROM SUPABASE-LINKED PC:
--   npx supabase db query --linked < supabase/migrations/210_guard_users_is_admin.sql

CREATE OR REPLACE FUNCTION guard_users_privilege_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Service-role and internal calls are always permitted
  IF current_setting('role', true) NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  -- Block privilege escalation via is_admin
  IF (NEW.is_admin IS DISTINCT FROM OLD.is_admin) THEN
    RAISE EXCEPTION 'Forbidden: direct writes to is_admin are not permitted.';
  END IF;

  -- Block identity mutation
  IF (NEW.id IS DISTINCT FROM OLD.id) THEN
    RAISE EXCEPTION 'Forbidden: user id is immutable.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_users_privilege_columns ON public.users;
CREATE TRIGGER guard_users_privilege_columns
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION guard_users_privilege_columns();
