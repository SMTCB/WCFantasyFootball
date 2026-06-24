// purchase-coins Edge Function — P2P-2 Stripe-ready skeleton
//
// PLUG-IN CHECKLIST (when Stripe account is ready):
//   1. npx supabase secrets set STRIPE_SECRET_KEY=sk_live_... --project-ref sssmvihxtqtohisghjet
//   2. npx supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_... --project-ref sssmvihxtqtohisghjet
//   3. In each coin_packs row, set stripe_price_id = 'price_...' from Stripe dashboard
//   4. In Stripe dashboard: create webhook → https://<project>.supabase.co/functions/v1/purchase-coins
//      → events: payment_intent.succeeded
//   5. Deploy: npx supabase functions deploy purchase-coins --project-ref sssmvihxtqtohisghjet
//
// Until STRIPE_SECRET_KEY is set this function returns 503 with a clear error.
// Callers (WalletScreen) show a "payments coming soon" message when they receive 503.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const STRIPE_SECRET_KEY    = Deno.env.get('STRIPE_SECRET_KEY');
const STRIPE_WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET');
const SUPABASE_URL         = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, stripe-signature',
};

// ── Stripe helpers (raw fetch — avoids importing stripe npm which pulls Node compat shims)

async function stripeRequest(path: string, body?: Record<string, unknown>) {
  if (!STRIPE_SECRET_KEY) throw new Error('STRIPE_NOT_CONFIGURED');
  const init: RequestInit = {
    headers: {
      'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  };
  if (body) {
    init.method = 'POST';
    init.body = new URLSearchParams(body as Record<string, string>).toString();
  }
  const res = await fetch(`https://api.stripe.com/v1${path}`, init);
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error?.message ?? 'Stripe request failed');
  }
  return res.json();
}

// Verify Stripe webhook signature (HMAC-SHA256 timestamp tolerance: 5 min)
async function verifyStripeSignature(body: string, header: string): Promise<boolean> {
  if (!STRIPE_WEBHOOK_SECRET) return false;
  const parts = Object.fromEntries(header.split(',').map(p => p.split('=')));
  const ts = parts['t'];
  const sig = parts['v1'];
  if (!ts || !sig) return false;
  const payload = `${ts}.${body}`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(STRIPE_WEBHOOK_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  const hex = Array.from(new Uint8Array(mac)).map(b => b.toString(16).padStart(2, '0')).join('');
  if (hex !== sig) return false;
  // Replay-attack tolerance: 5 minutes
  if (Math.abs(Date.now() / 1000 - parseInt(ts)) > 300) return false;
  return true;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  // ── Check Stripe is configured before doing anything
  if (!STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SECRET) {
    return new Response(
      JSON.stringify({ error: 'STRIPE_NOT_CONFIGURED', message: 'Payments are not yet enabled. Set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET.' }),
      { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const url = new URL(req.url);

  // ── Route 1: POST /purchase-coins/create-payment-intent
  //    Called by WalletScreen when user clicks a buy button.
  //    Creates a PaymentIntent for the chosen pack, returns client_secret for Stripe.js.
  if (url.pathname.endsWith('/create-payment-intent')) {
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'UNAUTHORIZED' }), { status: 401, headers: corsHeaders });
    }
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Verify caller JWT
    const jwt = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authErr } = await supabase.auth.getUser(jwt);
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: 'UNAUTHORIZED' }), { status: 401, headers: corsHeaders });
    }

    const { pack_id } = await req.json();
    const { data: pack } = await supabase.from('coin_packs').select('*').eq('id', pack_id).eq('is_active', true).single();
    if (!pack) {
      return new Response(JSON.stringify({ error: 'PACK_NOT_FOUND' }), { status: 404, headers: corsHeaders });
    }

    try {
      const pi = await stripeRequest('/payment_intents', {
        amount: String(pack.price_pence),
        currency: 'gbp',
        metadata: {
          user_id: user.id,
          pack_id: pack.id,
          coins: String(pack.coins),
        },
      });
      return new Response(
        JSON.stringify({ client_secret: pi.client_secret }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    } catch (e) {
      return new Response(
        JSON.stringify({ error: 'STRIPE_ERROR', message: (e as Error).message }),
        { status: 500, headers: corsHeaders },
      );
    }
  }

  // ── Route 2: POST /purchase-coins (Stripe webhook)
  //    Stripe calls this on payment_intent.succeeded.
  //    Fulfills the purchase by crediting coins to the buyer's wallet.
  const rawBody = await req.text();
  const sigHeader = req.headers.get('stripe-signature') ?? '';

  const valid = await verifyStripeSignature(rawBody, sigHeader);
  if (!valid) {
    return new Response(JSON.stringify({ error: 'INVALID_SIGNATURE' }), { status: 400, headers: corsHeaders });
  }

  let event: { type: string; data: { object: Record<string, unknown> } };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new Response(JSON.stringify({ error: 'INVALID_JSON' }), { status: 400, headers: corsHeaders });
  }

  if (event.type !== 'payment_intent.succeeded') {
    // Acknowledge other event types without action
    return new Response(JSON.stringify({ received: true }), { headers: corsHeaders });
  }

  const pi = event.data.object;
  const meta = pi.metadata as { user_id?: string; pack_id?: string; coins?: string };

  if (!meta.user_id || !meta.coins) {
    console.error('purchase-coins: missing metadata on payment_intent', pi.id);
    return new Response(JSON.stringify({ error: 'MISSING_METADATA' }), { status: 400, headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // Idempotency: check if this payment_intent was already processed
  const { data: existing } = await supabase
    .from('coin_transactions')
    .select('id')
    .eq('meta->>stripe_payment_intent_id', pi.id)
    .limit(1);

  if (existing && existing.length > 0) {
    console.log('purchase-coins: duplicate webhook for PI', pi.id, '— skipping');
    return new Response(JSON.stringify({ received: true, duplicate: true }), { headers: corsHeaders });
  }

  // Credit coins
  const coins = parseInt(meta.coins, 10);
  const { error: creditErr } = await supabase.rpc('credit_coins', {
    p_user_id: meta.user_id,
    p_amount: coins,
    p_type: 'purchase',
    p_challenge_id: null,
    p_meta: { stripe_payment_intent_id: pi.id, pack_id: meta.pack_id },
  });

  if (creditErr) {
    console.error('purchase-coins: credit_coins failed', creditErr);
    return new Response(JSON.stringify({ error: 'CREDIT_FAILED', message: creditErr.message }), { status: 500, headers: corsHeaders });
  }

  console.log(`purchase-coins: credited ${coins} coins to user ${meta.user_id} (PI ${pi.id})`);
  return new Response(JSON.stringify({ received: true }), { headers: corsHeaders });
});
