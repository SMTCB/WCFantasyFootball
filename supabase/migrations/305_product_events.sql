-- supabase/migrations/305_product_events.sql
-- Product funnel events (J-09, CODE-5): welcome steps, Clubhouse created/joined, one app_open per day.
-- Sign-up date and first bet are read from auth.users and the bets tables, not duplicated here.

CREATE TABLE IF NOT EXISTS product_events (
  id         BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id    UUID        NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  event      TEXT        NOT NULL CHECK (event ~ '^[a-z0-9_]{2,40}$'),
  props      JSONB       NOT NULL DEFAULT '{}'::jsonb CHECK (pg_column_size(props) <= 1024),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_product_events_event_time ON product_events (event, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_product_events_user_time  ON product_events (user_id, created_at DESC);

ALTER TABLE product_events ENABLE ROW LEVEL SECURITY;

-- Signed-in users may add events for themselves only. No read policy: nobody reads
-- events from the app; they are read by the owner through the database directly.
CREATE POLICY "product_events_insert_own"
  ON product_events FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
