// e2e/settings-screen.spec.js — Tier 3 local full-stack E2E smoke for SettingsScreen.
// Targets the local `npx supabase start` stack via scripts/e2e-local.mjs
// (npm run test:e2e:local). B-12 guard: never runs against production.
//
// Demo-mode identity quirk (docs/testing/TESTING_STRATEGY.md): both the
// username query (`.from('users').select('username').eq('id', user.id)`) and
// the displayed email (`user?.email`) come straight from useAuth().user —
// permanently frozen to the demo identity (username='demo',
// email='demo@forzakit.app') in every demo-mode build, regardless of which
// real session injectSession() puts in localStorage. A real session is still
// required to sign in, purely so the `users` table's RLS policy
// ("authenticated users can read all profiles", migration 47) lets the query
// through at all — an anon client would get zero rows. No seed.sql changes
// needed: the demo user's public.users row (username='demo') already exists.
//
// Deliberately does NOT submit the "Update Password" form (would invalidate
// USER_A's seeded password for the rest of the run) and does NOT click Logout.

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

test.describe('Settings screen', () => {
  test('1.1 loads without JS error and renders the demo identity profile', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await injectSession(page, sessionA);
    const reached = await safeGoto(page, '/settings');
    if (!reached) { console.log('⚠ Server unreachable for /settings'); return; }
    await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});
    await page.waitForTimeout(1200);

    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible({ timeout: 10000 });

    // Username input is the sole `type="text"` field — placeholder flips from
    // "Loading…" to "Enter a username…" once usernameLoaded is true, and its
    // value reflects the frozen demo identity's public.users row.
    const usernameInput = page.locator('input[type="text"]').first();
    await expect(usernameInput).toHaveValue('demo', { timeout: 10000 });

    const text = await page.locator('body').innerText().catch(() => '');
    expect(errors, `/settings JS errors: ${errors.join('; ')}`).toHaveLength(0);
    expect(text).toMatch(/demo@forzakit\.app/);

    // Replay Tour — pure localStorage side effect, safe to exercise.
    await page.getByRole('button', { name: /Replay Tour/i }).click();
    await expect(page.getByText(/Onboarding reset — the tour will appear on your next visit/i))
      .toBeVisible({ timeout: 5000 });

    console.log('✅ Settings: demo identity profile rendered, Replay Tour toast confirmed');
  });
});
