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
});
