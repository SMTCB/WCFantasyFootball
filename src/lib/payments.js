// payments.js — decouples coin purchase UI from the purchase-coins Edge Function.
// All payment flows go through initiatePurchase(); callers never reference the
// function name or route path directly.

import { supabase } from './supabase';

/**
 * Initiate a coin purchase for the given pack ID.
 *
 * Returns one of:
 *   { mock: true,  coinsCredited: N, packName: string }  — MOCK_PAYMENTS mode
 *   { clientSecret: string }                             — Stripe PaymentIntent flow
 *
 * Throws Error with one of these .message values:
 *   'PAYMENTS_NOT_CONFIGURED' — Stripe keys not set; caller should show "coming soon"
 *   'PACK_NOT_FOUND'          — pack_id is invalid or inactive
 *   'UNAUTHORIZED'            — user is not signed in
 *   (other)                   — unexpected server error; show generic retry message
 */
export async function initiatePurchase(packId) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('UNAUTHORIZED');

  const { data, error } = await supabase.functions.invoke(
    'purchase-coins/create-payment-intent',
    { body: { pack_id: packId } },
  );

  if (error) {
    const msg = (error.message ?? '') + (error.context?.status ? ` ${error.context.status}` : '');
    if (msg.includes('503') || msg.includes('STRIPE_NOT_CONFIGURED')) {
      throw new Error('PAYMENTS_NOT_CONFIGURED');
    }
    if (msg.includes('PACK_NOT_FOUND') || msg.includes('404')) {
      throw new Error('PACK_NOT_FOUND');
    }
    throw error;
  }

  if (data?.mock) {
    return { mock: true, coinsCredited: data.coins_credited, packName: data.pack_name };
  }

  return { clientSecret: data.client_secret };
}
