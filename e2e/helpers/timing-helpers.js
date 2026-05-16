// @ts-check
// Timing utilities used across E2E tests.
// Centralised here so we have one place to tweak waits if the app's loading
// behaviour changes (e.g. faster hydration, different debounce windows).

/**
 * Wait for React to hydrate and any in-flight network calls to settle.
 * Defaults: 8s for networkidle, 600ms for post-hydration tick.
 */
export async function waitForContent(page, { networkIdleMs = 8000, settleMs = 600 } = {}) {
  await page.waitForLoadState('networkidle', { timeout: networkIdleMs }).catch(() => {});
  await page.waitForTimeout(settleMs);
}

/**
 * Wait for a Realtime subscription to deliver a change.
 * Realtime usually completes within 2 seconds; we give 4 to absorb CI jitter.
 */
export async function waitForRealtime(page, { timeoutMs = 4000 } = {}) {
  await page.waitForTimeout(timeoutMs);
}

/**
 * Wait until `predicate` returns truthy or `timeoutMs` elapses. Returns true
 * if the predicate ever passed, false on timeout. Polls every `intervalMs`.
 */
export async function waitForCondition(predicate, { timeoutMs = 5000, intervalMs = 200 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if (await predicate()) return true;
    } catch {
      // ignore — keep polling
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return false;
}

/**
 * Silence noisy console error patterns that aren't actionable.
 * Returns a `getErrors()` accessor so the test can assert on the rest.
 */
export function captureConsoleErrors(page, { ignorePatterns = [/ResizeObserver/, /Warning:/] } = {}) {
  const errors = [];
  page.on('pageerror', (err) => {
    const message = err?.message ?? String(err);
    if (!ignorePatterns.some((pat) => pat.test(message))) {
      errors.push(message);
    }
  });
  return {
    getErrors: () => errors.slice(),
    clear:     () => { errors.length = 0; },
  };
}

/**
 * Race a Playwright locator against a deadline; returns whether it ever
 * became visible. Useful for optional UI elements where the test should
 * adapt to the rendered state.
 */
export async function isVisibleWithin(locator, timeoutMs = 1500) {
  return locator.first().isVisible({ timeout: timeoutMs }).catch(() => false);
}
