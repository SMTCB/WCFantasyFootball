/**
 * resolve_bet — unit tests (B2 / TEST-1)
 *
 * Real signature (confirmed against supabase/schema.sql):
 *   resolve_bet(p_instance_id uuid, p_answers text[]) RETURNS jsonb   -- primary
 *   resolve_bet(p_instance_id uuid, p_answer text)   RETURNS jsonb   -- wraps the above as ARRAY[p_answer]
 * There is no p_points_reward parameter — the reward always comes from
 * bet_instances.reward_value. Error identifiers are returned under the key
 * 'error' (not 'code', unlike execute_transfer_atomic).
 *
 * Covers:
 *  ✓ Commissioner resolves a bet (not yet deadline-passed)
 *  ✓ Auto-resolve cron context (auth.uid() IS NULL) is blocked while bet is open
 *    and its deadline hasn't passed (BET_STILL_OPEN)
 *  ✓ Already-resolved guard: a second resolution by a NON-commissioner is
 *    rejected with ALREADY_RESOLVED. (A commissioner calling resolve_bet again
 *    is a supported override — it reverses old rewards and re-resolves — so
 *    that path is intentionally NOT what this test exercises.)
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
      p_instance_id: BET_INSTANCE,
      p_answers:     ['England'],
    }, { actingUserId: COMMISSIONER });

    assert.equal(result?.ok, true, `Expected success, got: ${JSON.stringify(result)}`);
    assert.equal(result?.winners, 1, 'Expected exactly 1 winner');

    const bet = await queryOne('SELECT status FROM bet_instances WHERE id = $1', [BET_INSTANCE]);
    assert.equal(bet.status, 'resolved', 'Bet should be resolved');
  });

  // ── 2. Auto-resolve cron (null auth) is blocked on open bet ─────────────────
  it('cron context (null auth) cannot resolve a bet before its deadline', async () => {
    const result = await callRpc('resolve_bet', {
      p_instance_id: BET_INSTANCE,
      p_answers:     ['England'],
    }, { actingUserId: null });  // null = cron / service-role context

    // Seed deadline_at is NOW()+2 days, so the auto-resolve cron path
    // (auth.uid() IS NULL, not a commissioner) must be blocked.
    assert.equal(result?.error, 'BET_STILL_OPEN',
      `Expected BET_STILL_OPEN, got: ${JSON.stringify(result)}`);
  });

  // ── 3. Already-resolved guard (non-commissioner) ─────────────────────────────
  it('rejects a second resolution attempt by a non-commissioner', async () => {
    await seedSubmission(USER_A, 'England');

    // First resolve — succeeds
    const first = await callRpc('resolve_bet', {
      p_instance_id: BET_INSTANCE,
      p_answers:     ['England'],
    }, { actingUserId: COMMISSIONER });
    assert.equal(first?.ok, true, `Expected first resolve to succeed, got: ${JSON.stringify(first)}`);

    // Second resolve, by a regular league member (not commissioner) — must be
    // rejected. (A second call BY the commissioner would instead succeed as an
    // override, per the real function body — that's a different, intentional
    // code path and not what ALREADY_RESOLVED guards against.)
    const second = await callRpc('resolve_bet', {
      p_instance_id: BET_INSTANCE,
      p_answers:     ['France'],
    }, { actingUserId: USER_A });

    assert.equal(second?.error, 'ALREADY_RESOLVED',
      `Expected ALREADY_RESOLVED, got: ${JSON.stringify(second)}`);
  });

  // ── 4. Points re-aggregated on resolve ──────────────────────────────────────
  // KNOWN BUG (confirmed against supabase/schema.sql, matches migration 167's
  // original code exactly): resolve_bet calls aggregate_league_member_points()
  // for each new winner BEFORE it UPDATEs bet_instances.status to 'resolved'.
  // aggregate_league_member_points sums bet rewards WHERE bi.status='resolved',
  // so at call time the bet is still 'open'/'closed' and the SUM is 0 — the
  // immediate refresh silently no-ops. total_points only picks up the reward
  // later, whenever some other event (next scoring pass, set_captain,
  // set_lineup) happens to re-aggregate this user. This test intentionally
  // encodes the CORRECT/intended behavior (per migration 167's own stated
  // purpose) and is expected to FAIL until resolve_bet's statement order is
  // fixed (move the UPDATE bet_instances status='resolved' before the winner
  // aggregation loop). Do not "fix" this by weakening the assertion.
  it('updates league_members.total_points for the winning manager', async () => {
    await seedSubmission(USER_A, 'England');

    // Seed has no fantasy_points rows for SQUAD_A, so aggregate_league_member_points
    // recomputes total_points as fantasy_points(0) + bet_rewards(reward_value=5) = 5.
    const before = await queryOne(
      'SELECT total_points FROM league_members WHERE league_id=$1 AND user_id=$2',
      [LEAGUE_CLS, USER_A]
    );
    assert.equal(Number(before.total_points), 0, 'Baseline total_points should be 0 (seed default)');

    await callRpc('resolve_bet', {
      p_instance_id: BET_INSTANCE,
      p_answers:     ['England'],
    }, { actingUserId: COMMISSIONER });

    const after = await queryOne(
      'SELECT total_points FROM league_members WHERE league_id=$1 AND user_id=$2',
      [LEAGUE_CLS, USER_A]
    );

    assert.equal(Number(after.total_points), 5,
      'Winner total_points should equal the bet reward_value (5) after resolve');
  });
});
