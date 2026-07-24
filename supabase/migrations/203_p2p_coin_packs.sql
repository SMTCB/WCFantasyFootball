-- ✅ APPLIED TO PRODUCTION 2026-06-28 (v2 session)
-- Migration 203: P2P-2 — coin_packs table (Stripe-ready skeleton)
-- stripe_price_id is NULL until Stripe is configured — purchase-coins Edge Function
-- checks for this and returns a helpful error until keys are set.

CREATE TABLE IF NOT EXISTS coin_packs (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text        NOT NULL,           -- "Starter Pack"
  coins           int         NOT NULL CHECK (coins > 0),
  price_pence     int         NOT NULL CHECK (price_pence > 0),  -- GBP pence, e.g. 199 = £1.99
  stripe_price_id text,       -- NULL until Stripe is configured
  is_active       boolean     NOT NULL DEFAULT true,
  display_order   int         NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE coin_packs ENABLE ROW LEVEL SECURITY;

-- Members can read active packs (needed for buy buttons)
CREATE POLICY "coin_packs_select" ON coin_packs
  FOR SELECT USING (is_active = true);

-- Only service role can write (via Edge Function or admin SQL)
-- No INSERT/UPDATE/DELETE policies for authenticated/anon.

-- Seed the three agreed packs
INSERT INTO coin_packs (name, coins, price_pence, stripe_price_id, is_active, display_order) VALUES
  ('Starter',     500,  199,  NULL, true, 1),
  ('Most Popular', 1500, 499,  NULL, true, 2),
  ('Best Value',  5000, 1299, NULL, true, 3);
