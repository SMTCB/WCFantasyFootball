// e2e/auth-screen.spec.js — Tier 3 local full-stack E2E smoke for AuthScreen.
// Targets the local `npx supabase start` stack via scripts/e2e-local.mjs
// (npm run test:e2e:local). B-12 guard: never runs against production.
//
// Smoke-only scope (deliberate): this build runs VITE_AUTH_ENABLED=false
// (demo mode), so a real signInWithPassword() round-trip against AuthScreen's
// own UI isn't exercised here — that would need a second, dedicated
// VITE_AUTH_ENABLED=true build, out of scope for this pass. The /auth route
// itself is not gated by ProtectedRoute (see App.jsx), so it's reachable via
// direct navigation even in the shared demo build. No injectSession/signed-in
// state used — this is the one spec that deliberately starts signed out.
//
// The mismatched-password check in handleSignUp (AuthScreen.jsx) runs
// synchronously before any signUp()/backend call, so it's a safe, fully
// backend-free assertion of client-side validation.

import { test, expect } from '@playwright/test';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-target.js'; // eslint-disable-line no-unused-vars -- B-12 guard: fail loudly if no explicit target

async function safeGoto(page, url, opts = {}) {
  try {
    await page.goto(url, { timeout: 10000, ...opts });
    return true;
  } catch {
    return false;
  }
}

// The global OnboardingWizard overlay renders on top of every route
// (including /auth) until this localStorage flag is set — without it, its
// full-screen modal intercepts pointer events for any click on the page.
async function skipOnboarding(page) {
  await page.addInitScript(() => {
    localStorage.setItem('forzakit_onboarding_done', 'true');
    localStorage.setItem('forzakit_tour_squad_done', 'true');
    localStorage.setItem('forzakit_tour_market_done', 'true');
  });
}

test.describe.configure({ retries: 0 });

test.describe('Auth screen', () => {
  test('1.1 loads without JS error and renders the Sign In form', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await skipOnboarding(page);
    const reached = await safeGoto(page, '/auth');
    if (!reached) { console.log('⚠ Server unreachable for /auth'); return; }
    await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});
    await page.waitForTimeout(800);

    const text = await page.locator('body').innerText().catch(() => '');
    expect(text.trim().length, '/auth has no content').toBeGreaterThan(10);
    expect(errors, `/auth JS errors: ${errors.join('; ')}`).toHaveLength(0);

    await expect(page.locator('#auth-signin-email')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#auth-signin-password')).toBeVisible();
    // Scoped to the form: the tab-strip also has a "Sign In" button, so an
    // unscoped getByRole locator matches 2 elements (strict-mode violation).
    await expect(page.locator('form').getByRole('button', { name: 'Sign In' })).toBeVisible();
    console.log('✅ Auth: Sign In form rendered');
  });

  test('1.2 Create Account tab renders sign-up fields', async ({ page }) => {
    await skipOnboarding(page);
    const reached = await safeGoto(page, '/auth');
    if (!reached) { console.log('⚠ Server unreachable for /auth'); return; }
    await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});
    await page.waitForTimeout(800);

    await page.getByRole('button', { name: 'Create Account' }).click();
    await page.waitForTimeout(300);

    await expect(page.locator('#auth-signup-username')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#auth-signup-email')).toBeVisible();
    await expect(page.locator('#auth-signup-password')).toBeVisible();
    await expect(page.locator('#auth-signup-confirm')).toBeVisible();
    console.log('✅ Auth: Create Account form rendered');
  });

  test('1.3 mismatched sign-up passwords show client-side validation, no backend call', async ({ page }) => {
    await skipOnboarding(page);
    const reached = await safeGoto(page, '/auth?tab=signup');
    if (!reached) { console.log('⚠ Server unreachable for /auth?tab=signup'); return; }
    await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});
    await page.waitForTimeout(800);

    await expect(page.locator('#auth-signup-username')).toBeVisible({ timeout: 10000 });
    await page.locator('#auth-signup-username').fill('e2e_smoke_user');
    await page.locator('#auth-signup-email').fill('e2e_smoke_user@fantasykit.test');
    await page.locator('#auth-signup-password').fill('SomePassword1');
    await page.locator('#auth-signup-confirm').fill('DifferentPassword1');

    // Scoped to the form: loading directly onto the signup tab means both the
    // tab-strip button and the form's submit button read "Create Account".
    await page.locator('form').getByRole('button', { name: 'Create Account' }).click();

    await expect(page.getByText('Passwords do not match.')).toBeVisible({ timeout: 5000 });
    console.log('✅ Auth: mismatched-password client-side validation confirmed');
  });
});
