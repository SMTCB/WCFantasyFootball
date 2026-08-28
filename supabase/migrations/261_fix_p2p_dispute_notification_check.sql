-- BUG-P2P-DISPUTE (see BACKLOG.md): dispute_freeform_result (migration 239) inserts
-- source_type='p2p_challenge' into clubhouse_notifications, but the existing CHECK
-- constraint only allowed 'league'|'paddock'|'box'|'clubhouse' — every real dispute
-- call threw 23514 and rolled back. Adds 'p2p_challenge' to the allowed list.
ALTER TABLE clubhouse_notifications
  DROP CONSTRAINT clubhouse_notifications_source_type_check,
  ADD CONSTRAINT clubhouse_notifications_source_type_check
    CHECK (source_type = ANY (ARRAY['league'::text, 'paddock'::text, 'box'::text, 'clubhouse'::text, 'p2p_challenge'::text]));
