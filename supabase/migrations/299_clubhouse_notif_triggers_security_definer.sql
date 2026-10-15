-- Migration 299: make the clubhouse_notifications fan-out triggers SECURITY DEFINER.
--
-- Migration 196 assumed trigger functions bypass RLS. They don't: a trigger
-- function runs as the invoking role unless it is SECURITY DEFINER. The
-- clubhouse_notifications table has only own-read / own-update policies and no
-- INSERT policy, so any non-service-role writer that fired one of these triggers
-- got: "new row violates row-level security policy for table
-- clubhouse_notifications". Hit in prod 2026-10-15 when a commissioner posted
-- BREAKING NEWS (gazette_entries insert) from the Admin tab.
--
-- Function bodies are unchanged from migration 196; only SECURITY DEFINER is
-- added. search_path stays pinned to public.
-- No data is touched, so no pre-migration backup is required beyond the standard dump.

BEGIN;

CREATE OR REPLACE FUNCTION notify_on_frontpage_edition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.circle_id IS NULL THEN RETURN NEW; END IF;

  INSERT INTO clubhouse_notifications (circle_id, user_id, source_type, source_id, type, payload)
  SELECT
    NEW.circle_id,
    cm.user_id,
    'clubhouse',
    NEW.circle_id,
    'frontpage_edition',
    jsonb_build_object('edition_date', NEW.edition_date, 'headline', NEW.headline)
  FROM circle_members cm
  WHERE cm.circle_id = NEW.circle_id;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION notify_on_gazette_breaking_news()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.entry_type <> 'breaking_news' THEN RETURN NEW; END IF;
  IF NEW.league_id IS NULL THEN RETURN NEW; END IF;

  INSERT INTO clubhouse_notifications (circle_id, user_id, source_type, source_id, type, payload)
  SELECT DISTINCT
    cl.circle_id,
    cm.user_id,
    'league',
    NEW.league_id,
    'breaking_news',
    jsonb_build_object('headline', NEW.headline, 'league_id', NEW.league_id)
  FROM circle_leagues cl
  JOIN circle_members cm ON cm.circle_id = cl.circle_id
  WHERE cl.league_id = NEW.league_id;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION notify_on_direct_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO clubhouse_notifications (circle_id, user_id, source_type, source_id, type, payload)
  VALUES (
    NEW.circle_id,
    NEW.to_user_id,
    'clubhouse',
    NEW.circle_id,
    'direct_message',
    jsonb_build_object(
      'from_user_id', NEW.from_user_id,
      'preview',      left(NEW.content, 100)
    )
  );

  RETURN NEW;
END;
$$;

COMMIT;
