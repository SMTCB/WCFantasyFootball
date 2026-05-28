-- Migration 89: Fix notify_league_on_bet_creation trigger — SECURITY DEFINER
-- Root cause: function ran as SECURITY INVOKER; league_notifications has no INSERT
-- RLS policy, so the trigger's INSERT was blocked with 403 whenever a commissioner
-- created a bet instance. Making it SECURITY DEFINER lets it bypass RLS, which is
-- the correct pattern for server-side notification triggers.

CREATE OR REPLACE FUNCTION public.notify_league_on_bet_creation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO league_notifications (
    league_id,
    user_id,
    notification_type,
    triggered_by_user_id,
    title,
    description,
    related_entity_id,
    related_entity_type
  )
  SELECT
    NEW.league_id,
    lm.user_id,
    'bet_created',
    auth.uid(),
    NEW.title,
    CONCAT('Deadline: ', to_char(NEW.deadline_at, 'HH24:MI UTC')),
    NEW.id,
    'bet_instance'
  FROM league_members lm
  WHERE lm.league_id = NEW.league_id
    AND lm.user_id != auth.uid();

  RETURN NEW;
END;
$$;
