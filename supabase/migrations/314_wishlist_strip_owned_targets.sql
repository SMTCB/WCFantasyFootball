-- One-time cleanup: pending wishlists that still list players the manager
-- already owns (drafted/bought after the list was saved). Processed rows are the
-- record of what each draft round was asked for, so they are left untouched.
-- The wishlist screen now hides owned players on load; this clears the stored copy.
UPDATE wishlist_draft_submissions s
   SET target_ids = ARRAY(
         SELECT t FROM unnest(s.target_ids) WITH ORDINALITY AS u(t, ord)
          WHERE NOT (t = ANY (COALESCE(o.players, ARRAY[]::text[])))
          ORDER BY ord)
  FROM (
    SELECT DISTINCT ON (league_id, user_id) league_id, user_id, players
      FROM squads
     ORDER BY league_id, user_id, created_at DESC
  ) o
 WHERE o.league_id = s.league_id
   AND o.user_id   = s.user_id
   AND s.status    = 'pending'
   AND EXISTS (SELECT 1 FROM unnest(s.target_ids) t WHERE t = ANY (o.players));
