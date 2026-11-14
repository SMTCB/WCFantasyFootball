-- J-10: a bet invite link opens a page a friend can read before logging in.
-- Additive only: two new functions, nothing existing is changed.

-- Public preview: only an OPEN bet, only the fields the page shows.
CREATE OR REPLACE FUNCTION public.get_bet_invite_preview(p_bet_id uuid)
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT json_build_object(
    'bet_id',       b.id,
    'question',     b.question,
    'stake_coins',  b.stake_coins,
    'ends_at',      b.ends_at,
    'sender',       u.username,
    'clubhouse',    c.name
  )
  FROM p2p_bets b
  JOIN circles c ON c.id = b.circle_id
  LEFT JOIN users u ON u.id = b.creator_id
  WHERE b.id = p_bet_id AND b.status = 'open';
$$;

-- Accept: puts the signed-in person into the sender's Clubhouse (same effect as
-- joining with the Clubhouse invite code) so they can then take the bet.
CREATE OR REPLACE FUNCTION public.accept_bet_invite(p_bet_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user   uuid := auth.uid();
  v_circle uuid;
BEGIN
  IF v_user IS NULL THEN
    RETURN json_build_object('error', 'UNAUTHENTICATED');
  END IF;

  SELECT circle_id INTO v_circle FROM p2p_bets WHERE id = p_bet_id AND status = 'open';
  IF v_circle IS NULL THEN
    RETURN json_build_object('error', 'BET_NOT_OPEN');
  END IF;

  INSERT INTO circle_members (circle_id, user_id, role)
  VALUES (v_circle, v_user, 'member')
  ON CONFLICT DO NOTHING;

  RETURN json_build_object('circle_id', v_circle, 'bet_id', p_bet_id);
END;
$$;

REVOKE ALL ON FUNCTION public.get_bet_invite_preview(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.accept_bet_invite(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_bet_invite_preview(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accept_bet_invite(uuid) TO authenticated;
