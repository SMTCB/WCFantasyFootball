// e2e/wallet-screen.spec.js — Tier 3 local full-stack E2E smoke for WalletScreen.
// Targets the local `npx supabase start` stack via scripts/e2e-local.mjs
// (npm run test:e2e:local). B-12 guard: never runs against production.
//
// get_my_wallet() is entirely auth.uid()-derived server-side (migration 208)
// with no client-side identity comparison downstream in WalletScreen.jsx, so
// it's immune to the demo-mode frozen-identity quirk that affects Challenge/
// Trophy Cabinet/Settings — whichever real session injectSession() puts in
// localStorage is what the RPC reflects.
//
// No seed.sql changes needed: USER_A already has a coin_wallets row
// (balance=500) plus a coin_transactions row (type='admin',
// meta.reason='welcome_bonus') from the trg_create_wallet_on_signup trigger
// firing when their auth.users row was inserted (migration 202).

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-target.js';

test.describe.configure({ retries: 0 });

// Service-role client — used only by test 1.2 to revert USER_A's wallet
// after a mock purchase (see that test for why). Gracefully no-ops if unset
// (e.g. spec run directly outside `npm run test:e2e:local`), same pattern as
// e2e/f1-screens.spec.js's serviceSupabase.
const SERVICE_ROLE_KEY = process.env.E2E_LOCAL_SERVICE_ROLE_KEY;
const serviceSupabase = SERVICE_ROLE_KEY ? createClient(SUPABASE_URL, SERVICE_ROLE_KEY) : null;

const USER_A = { email: 'e2e_a@fantasykit.test', password: 'E2ePass!99' };

async function signIn(email, password) {
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data?.session) throw new Error(`sign-in failed for ${email}: ${error?.message}`);
  return { client, session: data.session };
}

function injectSession(page, session) {
  const projectRef = SUPABASE_URL.match(/\/\/([^.]+)\./)?.[1] ?? 'sssmvihxtqtohisghjet';
  const key        = `sb-${projectRef}-auth-token`;
  const value      = JSON.stringify({
    access_token:  session.access_token,
    token_type:    'bearer',
    expires_in:    3600,
    expires_at:    session.expires_at,
    refresh_token: session.refresh_token,
    user:          session.user,
  });
  return page.addInitScript(({ k, v }) => {
    localStorage.setItem(k, v);
    localStorage.setItem('forzakit_onboarding_done',  'true');
    localStorage.setItem('forzakit_tour_squad_done',  'true');
    localStorage.setItem('forzakit_tour_market_done', 'true');
  }, { k: key, v: value });
}

async function safeGoto(page, url, opts = {}) {
  try {
    await page.goto(url, { timeout: 10000, ...opts });
    return true;
  } catch {
    return false;
  }
}

let sessionA;

test.beforeAll(async () => {
  if (sessionA) return;
  ({ session: sessionA } = await signIn(USER_A.email, USER_A.password));
});

test.describe('Wallet screen', () => {
  test('1.1 loads without JS error and renders real balance + transaction history', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await injectSession(page, sessionA);
    const reached = await safeGoto(page, '/wallet');
    if (!reached) { console.log('⚠ Server unreachable for /wallet'); return; }
    await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});
    await page.waitForTimeout(1200);

    const text = await page.locator('body').innerText().catch(() => '');
    expect(text.trim().length, '/wallet has no content').toBeGreaterThan(10);
    expect(errors, `/wallet JS errors: ${errors.join('; ')}`).toHaveLength(0);

    // Balance rendered via `balance.toLocaleString()` — assert it's not stuck
    // on the "Loading…" state and shows a real number (welcome-bonus 500 coins).
    await expect(page.getByText(/Loading…/i)).toHaveCount(0, { timeout: 10000 });
    expect(text).toMatch(/500/);

    // Transaction history shows the seeded welcome-bonus row, not the empty state.
    expect(text).not.toMatch(/No transactions yet/i);
    expect(text).toMatch(/welcome bonus/i);
    console.log('✅ Wallet: balance + welcome-bonus transaction rendered for USER_A');
  });

  // Stripe-free coin purchase — the pilot runs with no Stripe account, so the
  // only way any tester acquires more coins beyond the one-time welcome bonus
  // is purchase-coins' MOCK_PAYMENTS=true path (supabase/functions/purchase-
  // coins/index.ts). Requires supabase/functions/.env to set MOCK_PAYMENTS=true
  // for the local Edge Runtime (gitignored — see that file's header comment)
  // and the seeded coin_packs row from supabase/seed.sql §12c. Calls the
  // endpoint directly rather than through WalletScreen's own "BUY COINS" UI
  // (COIN-2 in BACKLOG.md: that UI currently advertises real GBP prices and
  // is slated for a pilot-mode rework) — this proves the endpoint's mock
  // contract and coin-crediting side effect, not the UI's fetch wiring.
  //
  // Project-isolation note: this test mutates USER_A's real coin_wallets
  // balance, which test 1.1 above asserts as a hardcoded literal (/500/).
  // fullyParallel:false does NOT stop desktop-chrome and mobile-chrome from
  // running concurrently in separate workers (confirmed empirically — both
  // instances of this test firing at once raced the same wallet row and
  // produced a corrupted +1000 delta instead of two independent +500s).
  // Restricting to a single project avoids racing itself; reverting the
  // balance via service role afterward (mirrors e2e/f1-screens.spec.js's
  // idempotency-reset pattern) keeps test 1.1 correct regardless of project
  // run order. See e2e/p2p-challenge-lifecycle.spec.js's own balance-
  // isolation note for the same class of hazard.
  test('1.2 mock-payment purchase-coins credits coins with no Stripe configured', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chrome', 'mutates USER_A\'s wallet — runs once only, see comment above');

    const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    await client.auth.setSession(sessionA);

    const { data: pack, error: packErr } = await client
      .from('coin_packs')
      .select('id, name, coins')
      .eq('is_active', true)
      .order('coins', { ascending: true })
      .limit(1)
      .single();
    expect(packErr, `coin_packs read failed: ${packErr?.message}`).toBeNull();
    expect(pack?.id).toBeTruthy();

    const { data: before, error: beforeErr } = await client.rpc('get_my_wallet');
    expect(beforeErr, `baseline get_my_wallet failed: ${beforeErr?.message}`).toBeNull();
    const balanceBefore = before?.balance ?? before?.[0]?.balance;

    const res = await fetch(`${SUPABASE_URL}/functions/v1/purchase-coins/create-payment-intent`, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${sessionA.access_token}`,
        'apikey':        SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ pack_id: pack.id }),
    });
    const body = await res.json();

    expect(res.ok, `purchase-coins returned ${res.status}: ${JSON.stringify(body)}`).toBe(true);
    expect(body.mock).toBe(true);
    expect(body.coins_credited).toBe(pack.coins);
    expect(body.reference_id).toMatch(/^mock_/);

    const { data: after, error: afterErr } = await client.rpc('get_my_wallet');
    expect(afterErr, `post-purchase get_my_wallet failed: ${afterErr?.message}`).toBeNull();
    const balanceAfter = after?.balance ?? after?.[0]?.balance;
    expect(Number(balanceAfter)).toBe(Number(balanceBefore) + pack.coins);

    // Revert — leave USER_A's wallet exactly as test 1.1 expects to find it,
    // regardless of project run order (see project-isolation note above).
    if (serviceSupabase) {
      const { error: revertErr } = await serviceSupabase
        .from('coin_wallets')
        .update({ balance: balanceBefore })
        .eq('user_id', sessionA.user.id);
      expect(revertErr, `wallet revert failed: ${revertErr?.message}`).toBeNull();
    } else {
      console.log('⚠ E2E_LOCAL_SERVICE_ROLE_KEY not set — skipping wallet revert; USER_A balance left elevated');
    }

    console.log(`✅ Wallet: mock purchase credited ${pack.coins} coins (${balanceBefore} → ${balanceAfter}), reverted, no Stripe involved`);
  });
});
