-- Migration 231: Enable Realtime for clubhouse_messages
--
-- Bug found during v2 cutover dry-run (Clubhouse Chat UI pass). Same bug
-- class as migration 55 (chat_messages): clubhouse_messages has RLS +
-- correct insert/select policies and useClubhouseChat.js subscribes to
-- postgres_changes INSERT events on it, but the table was never added to
-- the supabase_realtime publication. Reproduced live: sending a message in
-- CLUBHOUSE -> CHAT -> #General returns 201 Created and persists correctly
-- (confirmed on reload), but the sender's own message never appears without
-- a manual reload -- because the realtime INSERT event never fires for
-- anyone in the channel, not just the sender. Chat is fully non-live.
--
-- Fix: add clubhouse_messages to the realtime publication, identical fix to
-- migration 55.

ALTER PUBLICATION supabase_realtime ADD TABLE clubhouse_messages;
