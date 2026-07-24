-- Migration 196: Clubhouse notification triggers — Phase 1E Sprint CH-9
-- Three AFTER INSERT triggers fan activity into clubhouse_notifications.
-- Fully additive: no existing table, column, index, or policy is modified.
-- All trigger functions run with table-owner privileges (bypass RLS by default).
-- No prod backup required: clubhouse_notifications created in migration 193 (v2-only).

BEGIN;

-- ─── 1. frontpage_editions INSERT → fan-out to all circle members ─────────────
-- Fires only for circle-scoped editions (circle_id IS NOT NULL).
-- Each member gets one notification; the owner is included (they may be on
-- another device). Uses INSERT … SELECT to avoid a per-row loop.

CREATE OR REPLACE FUNCTION notify_on_frontpage_edition()
RETURNS trigger
LANGUAGE plpgsql
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

DROP TRIGGER IF EXISTS trg_notify_frontpage_edition ON frontpage_editions;
CREATE TRIGGER trg_notify_frontpage_edition
  AFTER INSERT ON frontpage_editions
  FOR EACH ROW EXECUTE FUNCTION notify_on_frontpage_edition();

-- ─── 2. gazette_entries INSERT (breaking_news) → fan-out via circle_leagues ───
-- Fires only for entry_type = 'breaking_news' with a league_id.
-- Finds every circle that has this league linked, then notifies all members of
-- those circles. DISTINCT ON (circle_id, user_id) prevents duplicates when a
-- league is linked to multiple circles.

CREATE OR REPLACE FUNCTION notify_on_gazette_breaking_news()
RETURNS trigger
LANGUAGE plpgsql
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

DROP TRIGGER IF EXISTS trg_notify_gazette_breaking_news ON gazette_entries;
CREATE TRIGGER trg_notify_gazette_breaking_news
  AFTER INSERT ON gazette_entries
  FOR EACH ROW EXECUTE FUNCTION notify_on_gazette_breaking_news();

-- ─── 3. direct_messages INSERT → notify recipient ────────────────────────────
-- One notification per message, for the to_user_id only.
-- preview is capped at 100 chars to keep payload small.

CREATE OR REPLACE FUNCTION notify_on_direct_message()
RETURNS trigger
LANGUAGE plpgsql
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

DROP TRIGGER IF EXISTS trg_notify_direct_message ON direct_messages;
CREATE TRIGGER trg_notify_direct_message
  AFTER INSERT ON direct_messages
  FOR EACH ROW EXECUTE FUNCTION notify_on_direct_message();

COMMIT;
