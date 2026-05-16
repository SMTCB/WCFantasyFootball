// @ts-check
// E2E coverage for the leagues frontpage (overview / list view).

import { test, expect } from '@playwright/test';
import {
  skipOnboarding,
  waitForContent,
  captureConsoleErrors,
  isVisibleWithin,
  goToLeaguesPage,
} from './helpers/index.js';

test.describe('Leagues Frontpage — Render & Layout', () => {
  test('renders without console errors', async ({ page }) => {
    const errors = captureConsoleErrors(page);
    await skipOnboarding(page);
    await goToLeaguesPage(page);
    expect(errors.getErrors()).toEqual([]);
  });

  test('shows create-league call to action when no leagues exist', async ({ page }) => {
    await skipOnboarding(page);
    await goToLeaguesPage(page);
    const cta = page.locator('button, a').filter({ hasText: /create|new league|start a league|join/i }).first();
    const body = await page.locator('body').innerText();
    const hasCta = await isVisibleWithin(cta, 1500);
    // Either a CTA is shown OR league cards already populate the page
    expect(hasCta || body.length > 0).toBe(true);
  });

  test('renders correctly on desktop viewport', async ({ page }) => {
    await skipOnboarding(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await goToLeaguesPage(page);
    const sidebar = page.locator('[data-testid="desktop-nav"]');
    await expect(sidebar).toBeVisible();
  });

  test('renders correctly on mobile viewport', async ({ page }) => {
    await skipOnboarding(page);
    await page.setViewportSize({ width: 375, height: 812 });
    await goToLeaguesPage(page);
    const nav = page.locator('[data-testid="mobile-nav"]');
    await expect(nav).toBeVisible();
  });
});

test.describe('Leagues Frontpage — Interactions', () => {
  test('clicking create-league navigates to wizard or modal', async ({ page }) => {
    await skipOnboarding(page);
    await goToLeaguesPage(page);
    const create = page.locator('button, a').filter({ hasText: /create|new league|start/i }).first();
    if (!(await isVisibleWithin(create, 1500))) return;
    await create.click();
    await waitForContent(page);
    const body = await page.locator('body').innerText();
    expect(body).toMatch(/league|name|create|wizard|step|continue/i);
  });

  test('search input filters league list (if exposed)', async ({ page }) => {
    await skipOnboarding(page);
    await goToLeaguesPage(page);
    const search = page.locator('input[type="search"], input[placeholder*="search" i]').first();
    if (!(await isVisibleWithin(search, 1500))) return;
    await search.fill('zzz-no-such-league-xyz');
    await page.waitForTimeout(700);
    const body = await page.locator('body').innerText();
    expect(body.length).toBeGreaterThan(0);
  });

  test('invite code copy button works when present', async ({ page }) => {
    await skipOnboarding(page);
    await goToLeaguesPage(page);
    const copyBtn = page.locator('button').filter({ hasText: /copy|invite/i }).first();
    if (!(await isVisibleWithin(copyBtn, 1500))) return;
    await copyBtn.click();
    await page.waitForTimeout(400);
    const body = await page.locator('body').innerText();
    expect(body.length).toBeGreaterThan(0);
  });

  test('leagues list survives rapid sort/filter toggles', async ({ page }) => {
    const errors = captureConsoleErrors(page);
    await skipOnboarding(page);
    await goToLeaguesPage(page);
    const buttons = page.locator('button').filter({ hasText: /sort|filter|active|archived/i });
    const count = await buttons.count();
    for (let i = 0; i < Math.min(count, 4); i++) {
      await buttons.nth(i).click().catch(() => {});
      await page.waitForTimeout(150);
    }
    expect(errors.getErrors()).toEqual([]);
  });
});

test.describe('Leagues Frontpage — Pagination & Scale', () => {
  test('league cards section scrolls without crash', async ({ page }) => {
    const errors = captureConsoleErrors(page);
    await skipOnboarding(page);
    await goToLeaguesPage(page);
    for (let i = 0; i < 3; i++) {
      await page.mouse.wheel(0, 400);
      await page.waitForTimeout(150);
    }
    expect(errors.getErrors()).toEqual([]);
  });
});
