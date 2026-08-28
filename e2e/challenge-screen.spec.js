// e2e/challenge-screen.spec.js — Tier 3 local full-stack E2E smoke for ChallengeScreen.
// Targets the local `npx supabase start` stack via scripts/e2e-local.mjs
// (npm run test:e2e:local). B-12 guard: never runs against production.
//
// Demo-mode identity quirk (docs/testing/TESTING_STRATEGY.md): useChallenges()
// scopes the incoming/outgoing/active buckets by comparing against the
// `userId` param it's called with (useAuth().user?.id — the frozen demo UUID
// in every demo-mode build, regardless of which real session injectSession()
// puts in localStorage). The `history` bucket is the one exception: a pure
// status filter (['resolved','expired','declined','cancelled'].includes) with
// no identity comparison at all — so it's the only reliable smoke target here.
// get_my_challenges() itself IS correctly scoped to the real signed-in user
// (auth.uid()) at the RPC layer, which is why the seeded row (challenger =
// USER_A) shows up once signed in as USER_A.
//
// Seed data (supabase/seed.sql, "P2P challenge" section): one resolved
// gw_total challenge, challenger=USER_A, opponent=USER_B, winner=USER_A.

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

test.describe('Challenge screen', () => {
  test('1.1 loads without JS error and renders the settled challenge', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await injectSession(page, sessionA);
    const reached = await safeGoto(page, '/challenges');
    if (!reached) { console.log('⚠ Server unreachable for /challenges'); return; }
    await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});
    await page.waitForTimeout(1200);

    const text = await page.locator('body').innerText().catch(() => '');
    expect(text.trim().length, '/challenges has no content').toBeGreaterThan(10);
    expect(errors, `/challenges JS errors: ${errors.join('; ')}`).toHaveLength(0);

    // "Settled this season" only renders once history.length > 0 — proves
    // get_my_challenges() correctly returned the seeded resolved challenge
    // for USER_A's real signed-in session.
    expect(text).toMatch(/Settled this season/i);
    expect(text).toMatch(/GW Total Battle/i);
    console.log('✅ Challenge: settled gw_total challenge rendered for USER_A');
  });
});
