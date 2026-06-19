-- Migration 186: Fix trg_fn_snapshot_squads_on_kickoff invalid enum values
--
-- The trigger used 'pre_game' and 'tbd' which are not valid match_status enum values.
-- This caused flip-fixtures-live to fail on every run (AFTER UPDATE fires, enum cast fails).
-- Fix: check only 'scheduled' which is the only valid pre-live status.

CREATE OR REPLACE FUNCTION public.trg_fn_snapshot_squads_on_kickoff()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.status = 'scheduled'
     AND NEW.status = 'live'
     AND NEW.matchday_id IS NOT NULL THEN
    PERFORM snapshot_squads_for_matchday(NEW.matchday_id, 'fixture_live');
  END IF;
  RETURN NEW;
END;
$function$;
