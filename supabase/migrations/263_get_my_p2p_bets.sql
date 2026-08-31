-- 263_get_my_p2p_bets.sql
-- Consolidated cross-clubhouse "My Bets" read RPC.
--
-- get_clubhouse_bets(p_circle_id) (migration 262) is scoped to a single circle and
-- is not null-safe (is_circle_member(NULL) always raises NOT_CIRCLE_MEMBER), so it
-- cannot serve a "show me every bet across all my clubhouses" view. This adds a
-- dedicated, parameterless RPC for that screen.
--
-- Scope: bets the caller is a joined participant of (including bets they created,
-- since create_p2p_bet auto-joins the creator) — i.e. "my bet history", not bets
-- open for the caller to join but hasn't yet. Discovery of joinable bets stays on
-- the per-clubhouse Group Bets tab (get_clubhouse_bets).

CREATE OR REPLACE FUNCTION get_my_p2p_bets() RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  SELECT jsonb_agg(row_to_json(b) ORDER BY b.created_at DESC) INTO v_result
  FROM (
    SELECT
      bt.*,
      c.name AS circle_name,
      (SELECT jsonb_agg(jsonb_build_object('id', o.id, 'label', o.label, 'sort_order', o.sort_order, 'is_correct', o.is_correct) ORDER BY o.sort_order)
       FROM p2p_bet_options o WHERE o.bet_id = bt.id) AS options,
      (SELECT COUNT(*) FROM p2p_bet_participants pp WHERE pp.bet_id = bt.id AND pp.status = 'joined') AS participant_count,
      TRUE AS is_participant
    FROM p2p_bets bt
    JOIN circles c ON c.id = bt.circle_id
    WHERE EXISTS (
      SELECT 1 FROM p2p_bet_participants pp
      WHERE pp.bet_id = bt.id AND pp.user_id = auth.uid() AND pp.status = 'joined'
    )
  ) b;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION get_my_p2p_bets() FROM public, authenticated, anon;
GRANT EXECUTE ON FUNCTION get_my_p2p_bets() TO authenticated;
