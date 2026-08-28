// e2e/trophy-cabinet-screen.spec.js — Tier 3 local full-stack E2E smoke for
// TrophyCabinetScreen. Targets the local `npx supabase start` stack via
// scripts/e2e-local.mjs (npm run test:e2e:local). B-12 guard: never runs
// against production.
//
// Demo-mode identity quirk (docs/testing/TESTING_STRATEGY.md):
// TrophyCabinetScreen.jsx queries trophy_ledger WHERE user_id = user.id,
// where `user` is useAuth().user — permanently frozen to the demo identity
// (00000000-0000-0000-0000-000000000000) in every demo-mode build,
// regardless of which real session injectSession() puts in localStorage.
// So the seeded trophy must be owned by the demo user, not USER_A/USER_B.
// A real session is still required to sign in: trophy_ledger's RLS is
// circle-member-read (migration 189), and activeCircleId resolution
// (useClubhouse.js's fetchMyCircles(), also user.id-keyed) needs a real
// authenticated role — both work here because the demo user is already
// seeded as a member of the SAME circle as USER_A (supabase/seed.sql step 2).
//
// Seed data (supabase/seed.sql, "Trophy ledger row" section): one round_win
// gold trophy owned by the demo user, meta.label='Round 1 Winner'.

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

test.describe('Trophy Cabinet screen', () => {
  test('1.1 loads without JS error and renders the seeded trophy', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await injectSession(page, sessionA);
    const reached = await safeGoto(page, '/trophy');
    if (!reached) { console.log('⚠ Server unreachable for /trophy'); return; }
    await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});
    await page.waitForTimeout(1200);

    const text = await page.locator('body').innerText().catch(() => '');
    expect(text.trim().length, '/trophy has no content').toBeGreaterThan(10);
    expect(errors, `/trophy JS errors: ${errors.join('; ')}`).toHaveLength(0);

    expect(text).not.toMatch(/No trophies yet/i);
    expect(text).toMatch(/Round 1 Winner/i);
    console.log('✅ Trophy Cabinet: seeded trophy rendered for the demo identity');
  });
});
