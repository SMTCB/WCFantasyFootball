-- Migration 77: Security polish (Sprint 3)
--
-- SEC-8:  Drop auction_listings direct UPDATE RLS policy — any league member could
--         overwrite current_bid/bidder_squad_id directly, bypassing place_bid RPC.
--         The place_bid SECURITY DEFINER RPC is the only correct mutation path.
--
-- SEC-9:  Drop fake scoring_templates admin policies. The gate
--         (auth.jwt() ->> 'email' LIKE '%@admin%') grants writes to anyone with
--         "@admin" anywhere in their email — not a real guard. Writes must go via
--         service role only.
--
-- SEC-10: Add 2 000-char length constraint on chat_messages + per-user rate-limit
--         trigger (max 5 messages per 10-second window per league).
--
-- SEC-12: Create handle_new_user() trigger so public.users is populated by the DB
--         on auth.users INSERT — eliminating the client-side upsert race in AuthContext.
--
-- L4.3:   Drop the auto-named duplicate UNIQUE constraint on bet_submissions.
--         Migration 28 created the inline constraint
--         bet_submissions_bet_instance_id_squad_id_key; migration 43 added the
--         correctly-named bet_submissions_unique_squad_bet for the same columns.
--         The auto-named one fires first on conflict, so the friendly duplicate-
--         detection message in useBetSubmit.js never triggers.

-- ─────────────────────────────────────────────────────────────────────────────
-- SEC-8: Drop auction_listings direct UPDATE policy
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "members can bid on auctions" ON public.auction_listings;

-- ─────────────────────────────────────────────────────────────────────────────
-- SEC-9: Drop fake scoring_templates admin policies
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "scoring_templates_admin_write"  ON public.scoring_templates;
DROP POLICY IF EXISTS "scoring_templates_admin_update" ON public.scoring_templates;

-- ─────────────────────────────────────────────────────────────────────────────
-- SEC-10: chat_messages length cap + rate-limit trigger
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.chat_messages
  DROP CONSTRAINT IF EXISTS chat_msg_len;
ALTER TABLE public.chat_messages
  ADD CONSTRAINT chat_msg_len
  CHECK (char_length(message) <= 2000);

CREATE OR REPLACE FUNCTION public.check_chat_rate_limit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM public.chat_messages
  WHERE user_id   = NEW.user_id
    AND league_id = NEW.league_id
    AND created_at > NOW() - INTERVAL '10 seconds';

  IF v_count >= 5 THEN
    RAISE EXCEPTION 'Rate limit: max 5 messages per 10 seconds';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS chat_rate_limit ON public.chat_messages;
CREATE TRIGGER chat_rate_limit
  BEFORE INSERT ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.check_chat_rate_limit();

-- ─────────────────────────────────────────────────────────────────────────────
-- SEC-12: handle_new_user trigger — creates public.users row on auth signup
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.users (id, username)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data ->> 'username',
      split_part(NEW.email, '@', 1)
    )
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ─────────────────────────────────────────────────────────────────────────────
-- L4.3: Drop duplicate bet_submissions unique constraint (auto-named one)
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.bet_submissions
  DROP CONSTRAINT IF EXISTS bet_submissions_bet_instance_id_squad_id_key;
