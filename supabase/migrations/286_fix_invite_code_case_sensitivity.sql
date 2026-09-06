-- Migration 286: fix case-sensitive invite-code matching for Clubhouse + F1 Paddock joins
--
-- Root cause: circles.invite_code and paddocks.invite_code are both generated
-- lowercase (DEFAULT substring(gen_random_uuid()::text, 1, 8), no upper()
-- wrapper — migrations 188 and 191). join_circle_by_code does a case-sensitive
-- exact match against the stored (lowercase) code, while the client
-- (useClubhouse.js) always uppercases user input before sending it — so no
-- clubhouse invite-code join, manual or via shared link, could ever succeed.
-- join_paddock_by_code has the mirror-image version of the same bug: it
-- uppercases the input server-side but still compares it to the lowercase
-- stored column. Tennis (player_boxes.invite_code, migration 197) already
-- wraps its DEFAULT in upper() and is unaffected.
--
-- Fix: make both RPCs compare case-insensitively (lower() on both sides).
-- Everything else — return types, error codes, ON CONFLICT behavior —
-- is preserved verbatim from the live definitions. No backfill needed.

CREATE OR REPLACE FUNCTION public.join_circle_by_code(p_code text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id   uuid := auth.uid();
  v_circle_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN json_build_object('error', 'UNAUTHENTICATED');
  END IF;

  SELECT id INTO v_circle_id
  FROM circles
  WHERE lower(invite_code) = lower(trim(p_code));

  IF v_circle_id IS NULL THEN
    RETURN json_build_object('error', 'INVALID_CODE');
  END IF;

  IF EXISTS (
    SELECT 1 FROM circle_members
    WHERE circle_id = v_circle_id AND user_id = v_user_id
  ) THEN
    RETURN json_build_object('error', 'ALREADY_MEMBER');
  END IF;

  INSERT INTO circle_members (circle_id, user_id, role)
  VALUES (v_circle_id, v_user_id, 'member');

  RETURN json_build_object('circle_id', v_circle_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.join_paddock_by_code(p_code text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_paddock_id uuid;
BEGIN
  SELECT id INTO v_paddock_id FROM paddocks WHERE lower(invite_code) = lower(p_code);
  IF v_paddock_id IS NULL THEN RAISE EXCEPTION 'PADDOCK_NOT_FOUND'; END IF;

  INSERT INTO paddock_members (paddock_id, user_id, role)
    VALUES (v_paddock_id, auth.uid(), 'member')
    ON CONFLICT (paddock_id, user_id) DO NOTHING;

  RETURN v_paddock_id;
END;
$function$;
