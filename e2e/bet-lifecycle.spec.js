// e2e/bet-lifecycle.spec.js — Tier 3 local full-stack E2E for the direct-bet
// creation → submission → resolution cycle. Targets the local
// `npx supabase start` stack via scripts/e2e-local.mjs (npm run test:e2e:local).
// B-12 guard: never runs against production.
//
// Closes the gap where other specs' bet coverage is soft/conditional
// (click-if-visible) and never exercises a guaranteed real flow. This is
// also the right layer (not Tier 1) to prove `bet_instances`' commissioner-
// only INSERT RLS policy ("commissioner manages bet instances",
// supabase/schema.sql) actually holds — Tier 1's harness runs as the DB
// owner and bypasses RLS entirely.
//
// Seed-data adaptation: supabase/seed.sql seeds exactly one squad —
// SQUAD_A_CLASSIC, owned by USER_A on CLASSIC_LEAGUE (USER_A is also that
// league's commissioner). USER_B is a plain member of CLASSIC_LEAGUE with
// NO squad there. submit_bet requires a squad the caller owns, so USER_B
// can't be the "member who submits a pick" without new seed data. USER_A
// therefore doubles as both commissioner (create/resolve) and submitter —
// a legitimate real flow (nothing stops a commissioner from also playing
// their own league's bets). USER_B is still exactly right for the
// negative-RLS test below, which only needs league membership, not a squad.
//
// Points-math note: league_members.total_points is NOT additive — every
// resolve_bet call fully recomputes it via aggregate_league_member_points()
// (SUM(fantasy_points.total) + SUM(resolved points-type bet rewards)) and
// overwrites the column. supabase/seed.sql's literal total_points=45.50 for
// USER_A is a static seed value never actually produced by that formula, so
// this spec never compares against it. Instead it calls
// aggregate_league_member_points() itself (GRANTed to `authenticated`) to
// capture a freshly-computed baseline immediately before resolving, then
// asserts the post-resolve total is exactly baseline + reward_value. This
// stays correct even if a prior run in the same `npm run test:e2e:local`
// invocation (e.g. the desktop-chrome project, before mobile-chrome re-runs
// this same spec against the same shared, not-reset-between-projects DB)
// already resolved a points-type bet for USER_A in this league.

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-target.js';

test.describe.configure({ retries: 0 });

const USER_A = { email: 'e2e_a@fantasykit.test', password: 'E2ePass!99' };
const USER_B = { email: 'e2e_b@fantasykit.test', password: 'E2ePass!99' };
const CLASSIC_LEAGUE   = '11000000-0000-4000-a000-000000000001';
const SQUAD_A_CLASSIC  = 'a0000000-0000-4000-a000-000000000001';
const REWARD_VALUE     = 5;

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

function betPayload(title) {
  return {
    league_id:    CLASSIC_LEAGUE,
    template_id:  null,
    title,
    prompt:       'Will this E2E test pass?',
    options:      [{ key: 'yes', label: 'Yes', meta: {} }, { key: 'no', label: 'No', meta: {} }],
    deadline_at:  new Date(Date.now() + 3600_000).toISOString(),
    reward_value: REWARD_VALUE,
    reward_type:  'points',
    scope_type:   'matchday',
    scope_ref:    null,
  };
}

let sessionA, clientA, sessionB, clientB, betId;

test.beforeAll(async () => {
  if (!sessionA) ({ client: clientA, session: sessionA } = await signIn(USER_A.email, USER_A.password));
  if (!sessionB) ({ client: clientB, session: sessionB } = await signIn(USER_B.email, USER_B.password));
});

test.describe('Bet lifecycle', () => {
  test('1.1 non-commissioner member cannot create a bet instance (RLS)', async () => {
    const { data, error } = await clientB
      .from('bet_instances')
      .insert(betPayload('E2E Bet RLS Negative Test'))
      .select()
      .single();

    expect(data, 'non-commissioner insert unexpectedly succeeded').toBeNull();
    expect(error, 'non-commissioner insert should be rejected by RLS').toBeTruthy();
    expect(error.message).toMatch(/row-level security/i);
    console.log('✅ Bets: non-commissioner INSERT correctly rejected by RLS');
  });

  test('1.2 commissioner creates, a member submits, and the commissioner resolves a bet — points awarded', async ({ page }) => {
    // Local per-test default is 20000ms (playwright.config.js) — too tight for
    // this test's four sequential steps (RPC create, first nav+networkidle,
    // reload+networkidle for the submission check, reload+networkidle for the
    // resolve check). Any single toContainText timeout below is bounded by
    // this, not the other way around — bumping only the assertion timeout
    // while the test-level budget stays at 20000ms just moves where the same
    // "Test timeout of 20000ms exceeded" fires.
    test.setTimeout(60000);
    const title = `E2E Bet Lifecycle ${Date.now()}`;

    await test.step('commissioner creates the bet instance', async () => {
      const { data, error } = await clientA
        .from('bet_instances')
        .insert(betPayload(title))
        .select()
        .single();

      expect(error, `commissioner insert failed: ${error?.message}`).toBeNull();
      expect(data?.id).toBeTruthy();
      expect(data.status).toBe('open');
      betId = data.id;
    });

    await test.step('the new bet renders on the Bets tab', async () => {
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await injectSession(page, sessionA);
      const reached = await safeGoto(page, `/league/${CLASSIC_LEAGUE}?tab=bets`);
      if (!reached) { console.log('⚠ Server unreachable for /league?tab=bets'); test.skip(); return; }
      await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});
      await page.waitForTimeout(1200);

      const text = await page.locator('body').innerText().catch(() => '');
      expect(errors, `Bets tab JS errors: ${errors.join('; ')}`).toHaveLength(0);
      expect(text).toMatch(new RegExp(title.toUpperCase(), 'i'));
    });

    await test.step('member submits an answer via submit_bet', async () => {
      const { data, error } = await clientA.rpc('submit_bet', {
        p_squad_id:   SQUAD_A_CLASSIC,
        p_instance_id: betId,
        p_answer:     'yes',
      });

      expect(error, `submit_bet errored: ${error?.message}`).toBeNull();
      expect(data?.ok, `submit_bet returned ok:false — ${data?.error}`).toBe(true);

      // LeagueScreen's loadLeagueById() is a long sequential chain of ~9
      // awaited Supabase queries (league, members, draft allocation/subs,
      // squad, player count, all-squads, listings — see LeagueScreen.jsx)
      // gated behind the auth session rehydrating from localStorage after
      // page.reload(). It only fires once `user?.id` resolves, so the Bets
      // tab legitimately renders once with the "complete your squad setup"
      // guard showing (mySquadId still null) before flipping to the real
      // submission a few seconds later. Poll with a generous timeout instead
      // of a fixed sleep so this doesn't flake under load-sharing with other
      // Playwright workers.
      //
      // NB: match the literal-case string 'Your pick', not a /Your pick/i
      // regex — BetWidget's "Your pick" label collides case-insensitively
      // with the unrelated "MAKE YOUR PICKS" nav/summary text that's on the
      // page from initial render, which made this wait a no-op previously.
      await page.reload();
      await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});
      await expect(page.locator('body')).toContainText('Your pick', { timeout: 20000 });
      await expect(page.locator('body')).toContainText('Yes', { timeout: 5000 });
    });

    await test.step('commissioner resolves the bet, awarding points', async () => {
      const { data: before, error: beforeErr } = await clientA.rpc('aggregate_league_member_points', {
        p_league_id: CLASSIC_LEAGUE,
        p_user_id:   sessionA.user.id,
      });
      expect(beforeErr, `baseline aggregate failed: ${beforeErr?.message}`).toBeNull();

      const { data: resolveResult, error: resolveErr } = await clientA.rpc('resolve_bet', {
        p_instance_id: betId,
        p_answer:      'yes',
      });
      expect(resolveErr, `resolve_bet errored: ${resolveErr?.message}`).toBeNull();
      expect(resolveResult?.ok, `resolve_bet returned ok:false — ${resolveResult?.error}`).toBe(true);
      expect(resolveResult.winners).toBe(1);

      const { data: memberRow, error: memberErr } = await clientA
        .from('league_members')
        .select('total_points')
        .eq('league_id', CLASSIC_LEAGUE)
        .eq('user_id', sessionA.user.id)
        .single();
      expect(memberErr, `league_members read failed: ${memberErr?.message}`).toBeNull();
      expect(Number(memberRow.total_points)).toBeCloseTo(Number(before) + REWARD_VALUE, 2);

      await page.reload();
      await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});
      await expect(page.locator('body')).toContainText(/Correct/i, { timeout: 20000 });
      await expect(page.locator('body')).toContainText(new RegExp(`\\+${REWARD_VALUE}`), { timeout: 5000 });
      console.log(`✅ Bets: full lifecycle complete — points ${before} → ${memberRow.total_points}`);
    });
  });
});
