// @ts-check
// League navigation + interaction helpers.

import { waitForContent, isVisibleWithin } from './timing-helpers.js';

/**
 * Navigate to /league and wait for content to be ready.
 */
export async function goToLeaguesPage(page) {
  await page.goto('/league');
  await waitForContent(page);
}

/**
 * Click into the first league card visible on /league.
 * Returns true if a league was opened, false if no league cards exist.
 */
export async function openFirstLeague(page) {
  const card = page.locator('[data-tour="league-card"], [class*="LeagueCard"], button:has-text("League"), a:has-text("League")').first();
  if (!(await isVisibleWithin(card))) return false;
  await card.click();
  await waitForContent(page);
  return true;
}

/**
 * Switch to a named hub tab in the league detail view (standings, chat, bets, etc.).
 * Returns true if the tab was found and clicked, false otherwise.
 */
export async function switchLeagueTab(page, tabLabelRegex) {
  const tab = page
    .locator('[data-tour="league-tabs"] button, nav button, [role="tab"]')
    .filter({ hasText: tabLabelRegex })
    .first();
  if (!(await isVisibleWithin(tab, 2000))) return false;
  await tab.click();
  await page.waitForTimeout(400);
  return true;
}

/**
 * Read aloud the visible standings entries on the current page.
 * Returns an array of plain strings (one per row) — useful for snapshotting.
 */
export async function readStandings(page) {
  const rows = page.locator('[data-testid="standings-row"], [class*="standings"] tr, [class*="StandingsRow"]');
  const count = await rows.count();
  const result = [];
  for (let i = 0; i < count; i++) {
    result.push((await rows.nth(i).innerText()).trim());
  }
  return result;
}

/**
 * Resolve a count of clickable league cards on /league.
 * Used by multi-league tests to gate scenarios on prerequisite data.
 */
export async function countLeagueCards(page) {
  const cards = page.locator('[data-tour="league-card"], [class*="LeagueCard"]');
  return cards.count();
}
