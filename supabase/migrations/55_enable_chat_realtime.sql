-- Migration 55: Enable Realtime for chat_messages
--
-- Problem: chat_messages table has RLS enabled and proper insert/select/delete policies,
-- but Realtime (replication) was never enabled. This causes:
--   1. Messages are inserted successfully (user sees input clear)
--   2. But subscribers never receive INSERT events
--   3. Messages appear missing in the UI
--
-- Fix: Enable the table for Realtime publication so INSERT/UPDATE/DELETE events stream to connected clients.

-- Enable replication for chat_messages (add to supabase_realtime publication)
ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;
