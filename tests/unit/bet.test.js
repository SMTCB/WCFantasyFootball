/**
 * resolve_bet — unit tests (B2 / TEST-1)
 *
 * Covers:
 *  ✓ Commissioner resolves a bet (not yet deadline-passed)
 *  ✓ Auto-resolve cron context (auth.uid() IS NULL) is blocked while bet is open
 *  ✓ Already-resolved guard: double-resolve rejected
 *  ✓ Points are re-aggregated on resolve (league_members.total_points updated)
 */

import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { getClient, closeClient, beginTx, rollbackTx, callRpc, query, queryOne } from './helpers.js';

const COMMISSIONER  = 'aaaaaaaa-0000-4000-a000-000000000099';
const USER_A        = 'aaaaaaaa-0000-4000-a000-000000000001';
const LEAGUE_CLS    = 'bbbbbbbb-0000-4000-b000-000000000001';
const BET_INSTANCE  = 'dddddddd-0000-4000-d000-000000000001';

async function seedSubmission(userId, answer) {
  // Insert a bet submission for the given user
  await query(`
    INSERT INTO bet_submissions (bet_instance_id, user_id, squad_id, answer)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT DO NOTHING
  `, [BET_INSTANCE, userId,
      userId === USER_A
        ? 'cccccccc-0000-4000-c000-000000000001'
        : 'cccccccc-0000-4000-c000-000000000002',
      answer]);
}

describe('resolve_bet', () => {
  before(async () => { await getClient(); });
  after(async () => { await closeClient(); });

  beforeEach(async () => { await beginTx(); });
  afterEach(async () => { await rollbackTx(); });

  // ── 1. Commissioner resolves a bet ──────────────────────────────────────────
  it('commissioner can resolve an open bet and credit the winner', async () => {
    await seedSubmission(USER_A, 'England');

    const result = await callRpc('resolve_bet', {
      p_bet_instance_id: BET_INSTANCE,
      p_winning_answer:  'England',
      p_points_reward:   5,
    }, { actingUserId: COMMISSIONER });

    assert.ok(!result?.error, `Expected success, got: ${JSON.stringify(result)}`);

    const bet = await queryOne('SELECT status FROM bet_instances WHERE id = $1', [BET_INSTANCE]);
    assert.equal(bet.status, 'resolved', 'Bet should be resolved');
  });

  // ── 2. Auto-resolve cron (null auth) is blocked on open bet ─────────────────
  it('cron context (null auth) cannot resolve a bet before its deadline', async () => {
    const result = await callRpc('resolve_bet', {
      p_bet_instance_id: BET_INSTANCE,
      p_winning_answer:  'England',
      p_points_reward:   5,
    }, { actingUserId: null });  // null = cron / service-role context

    // Should get BET_STILL_OPEN (deadline not passed yet)
    assert.ok(
      (result?.error ?? result?.code ?? '').includes('BET_STILL_OPEN') ||
      (result?.error ?? result?.code ?? '').includes('UNAUTHORIZED'),
      `Expected BET_STILL_OPEN or UNAUTHORIZED, got: ${JSON.stringify(result)}`
    );
  });

  // ── 3. Double-resolve guard ─────────────────────────────────────────────────
  it('rejects a second resolution of the same bet', async () => {
    await seedSubmission(USER_A, 'England');

    // First resolve
    await callRpc('resolve_bet', {
      p_bet_instance_id: BET_INSTANCE,
      p_winning_answer:  'England',
      p_points_reward:   5,
    }, { actingUserId: COMMISSIONER });

    // Second resolve — commissioner override should still get ALREADY_RESOLVED
    const result = await callRpc('resolve_bet', {
      p_bet_instance_id: BET_INSTANCE,
      p_winning_answer:  'France',
      p_points_reward:   5,
    }, { actingUserId: COMMISSIONER });

    assert.ok(
      (result?.error ?? result?.code ?? '').includes('ALREADY_RESOLVED'),
      `Expected ALREADY_RESOLVED, got: ${JSON.stringify(result)}`
    );
  });

  // ── 4. Points re-aggregated on resolve ──────────────────────────────────────
  it('updates league_members.total_points for the winning manager', async () => {
    await seedSubmission(USER_A, 'England');

    // Capture baseline
    const before = await queryOne(
      'SELECT total_points FROM league_members WHERE league_id=$1 AND user_id=$2',
      [LEAGUE_CLS, USER_A]
    );

    await callRpc('resolve_bet', {
      p_bet_instance_id: BET_INSTANCE,
      p_winning_answer:  'England',
      p_points_reward:   5,
    }, { actingUserId: COMMISSIONER });

    const after = await queryOne(
      'SELECT total_points FROM league_members WHERE league_id=$1 AND user_id=$2',
      [LEAGUE_CLS, USER_A]
    );

    assert.equal(after.total_points, (before.total_points ?? 0) + 5,
      'Winner total_points should increase by the reward amount');
  });
});
