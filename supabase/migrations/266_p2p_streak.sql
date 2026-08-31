-- PR 3: Win-streak badge. New read-only RPC aggregating resolved outcomes
-- across both P2P schemas (1:1 p2p_challenges + group p2p_bets) for the
-- calling user, oldest-first, no time cutoff (unlike get_my_challenges()'s
-- 30-day window, which is fine for an active-bets list but wrong for a
-- lifetime streak). Client reduces this into a current win-streak count
-- using the same walk used for fantasy H2H streaks in H2HSheet.jsx.
CREATE OR REPLACE FUNCTION "public"."get_my_p2p_streak"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_result  jsonb;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;

  SELECT jsonb_agg(
    jsonb_build_object('outcome', outcome, 'resolved_at', resolved_at)
    ORDER BY resolved_at ASC
  )
  INTO v_result
  FROM (
    SELECT
      CASE
        WHEN c.winner_id IS NULL THEN 'push'
        WHEN c.winner_id = v_user_id THEN 'win'
        ELSE 'loss'
      END AS outcome,
      c.resolved_at
    FROM p2p_challenges c
    WHERE c.status = 'resolved'
      AND c.resolved_at IS NOT NULL
      AND (c.challenger_id = v_user_id OR c.opponent_id = v_user_id)

    UNION ALL

    SELECT
      CASE WHEN bp.is_winner THEN 'win' ELSE 'loss' END AS outcome,
      b.resolved_at
    FROM p2p_bet_participants bp
    JOIN p2p_bets b ON b.id = bp.bet_id
    WHERE b.status = 'resolved'
      AND b.resolved_at IS NOT NULL
      AND bp.user_id = v_user_id
      AND bp.status = 'joined'
  ) combined;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

ALTER FUNCTION "public"."get_my_p2p_streak"() OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."get_my_p2p_streak"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_my_p2p_streak"() TO "service_role";
GRANT ALL ON FUNCTION "public"."get_my_p2p_streak"() TO "authenticated";
