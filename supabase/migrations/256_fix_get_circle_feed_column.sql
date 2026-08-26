-- Fix get_circle_feed: references gazette_entries.created_at, a column that has
-- never existed (the table has always used published_at). Broken since migration 188 —
-- every Clubhouse activity-feed load 400s. See BACKLOG.md 2026-08-26.
CREATE OR REPLACE FUNCTION public.get_circle_feed(p_circle_id uuid, p_limit integer DEFAULT 50)
 RETURNS TABLE(id uuid, league_id uuid, league_name text, entry_type gazette_entry_type, headline text, bullets jsonb, full_data jsonb, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM circle_members
    WHERE circle_id = p_circle_id AND user_id = auth.uid()
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    ge.id,
    ge.league_id,
    l.name AS league_name,
    ge.entry_type,
    ge.headline,
    ge.bullets,
    ge.full_data,
    ge.published_at AS created_at
  FROM gazette_entries ge
  JOIN circle_leagues cl ON cl.league_id = ge.league_id
  JOIN leagues l         ON l.id = ge.league_id
  WHERE cl.circle_id = p_circle_id
  ORDER BY ge.published_at DESC
  LIMIT GREATEST(1, LEAST(p_limit, 200));
END;
$function$;
