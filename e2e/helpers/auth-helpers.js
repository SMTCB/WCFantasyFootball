// @ts-check
// Authentication and onboarding helpers for E2E tests.
// The app runs in demo mode for E2E (VITE_AUTH_ENABLED=false), so most helpers
// here manipulate localStorage to skip onboarding/tour overlays rather than
// performing real auth flows. The signature stays auth-friendly so the helpers
// can be upgraded to real Supabase auth later without rewriting call sites.

const TOUR_FLAGS = [
  'forzakit_onboarding_done',
  'forzakit_tour_squad_done',
  'forzakit_tour_market_done',
  'forzakit_tour_league_done',
  'forzakit_tour_bets_done',
  'forzakit_tour_admin_done',
];

/**
 * Skip the onboarding wizard and every per-screen tour overlay.
 * MUST be called before `page.goto()` — uses addInitScript so the flags are
 * present on the very first React render.
 */
export async function skipOnboarding(page) {
  await page.addInitScript((flags) => {
    for (const flag of flags) {
      localStorage.setItem(flag, 'true');
    }
  }, TOUR_FLAGS);
}

/**
 * Simulate logged-out state by clearing all browser storage.
 * Useful for testing redirects, login-required screens, etc.
 */
export async function ensureLoggedOut(page) {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
}

/**
 * Stub the active user identity in localStorage so the app picks a manager
 * up on next render. Demo mode reads the player profile from a fallback —
 * we attach a key here so tests can switch managers when needed.
 */
export async function loginAs(page, manager) {
  await skipOnboarding(page);
  await page.addInitScript((mgr) => {
    localStorage.setItem('forzakit_demo_manager', JSON.stringify(mgr));
  }, manager);
}

/**
 * Open a second browser context tab and apply the same auth setup.
 * Returns the new page handle so the caller can drive it concurrently.
 */
export async function openSecondaryTab(context, manager) {
  const page = await context.newPage();
  if (manager) {
    await loginAs(page, manager);
  } else {
    await skipOnboarding(page);
  }
  return page;
}
