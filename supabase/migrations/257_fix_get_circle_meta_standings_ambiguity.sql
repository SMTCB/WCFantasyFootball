-- Fix get_circle_meta_standings: RETURNS TABLE(user_id uuid, ...) implicitly declares
-- user_id as a function-body variable, colliding with circle_members.user_id inside the
-- membership-check subquery (ambiguous column, Postgres error 42702). Confirmed by
-- direct execution against production. Breaks Clubhouse standings/meta display.
-- See BACKLOG.md 2026-08-26.
CREATE OR REPLACE FUNCTION public.get_circle_meta_standings(p_circle_id uuid)
 RETURNS TABLE(user_id uuid, username text, trophy_count bigint, gold_count bigint, silver_count bigint, bronze_count bigint, rank bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Caller must be a member of this circle
  IF NOT EXISTS (
    SELECT 1 FROM circle_members
    WHERE circle_id = p_circle_id AND circle_members.user_id = auth.uid()
  ) THEN
    RETURN;
  END IF;

  -- v1 formula: count trophies per user, break ties by gold → silver → bronze
  RETURN QUERY
  SELECT
    cm.user_id,
    u.username,
    COUNT(tl.id)                                              AS trophy_count,
    COUNT(tl.id) FILTER (WHERE tl.tier = 'gold')             AS gold_count,
    COUNT(tl.id) FILTER (WHERE tl.tier = 'silver')           AS silver_count,
    COUNT(tl.id) FILTER (WHERE tl.tier = 'bronze')           AS bronze_count,
    RANK() OVER (
      ORDER BY
        COUNT(tl.id)                                          DESC,
        COUNT(tl.id) FILTER (WHERE tl.tier = 'gold')         DESC,
        COUNT(tl.id) FILTER (WHERE tl.tier = 'silver')       DESC,
        COUNT(tl.id) FILTER (WHERE tl.tier = 'bronze')       DESC
    )                                                         AS rank
  FROM circle_members cm
  JOIN users u ON u.id = cm.user_id
  LEFT JOIN trophy_ledger tl
    ON  tl.circle_id = p_circle_id
    AND tl.user_id   = cm.user_id
  WHERE cm.circle_id = p_circle_id
  GROUP BY cm.user_id, u.username
  ORDER BY rank, u.username;
END;
$function$;
