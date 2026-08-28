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

const COMMISSIONER    = 'aaaaaaaa-0000-4000-a000-000000000099';
const USER_A          = 'aaaaaaaa-0000-4000-a000-000000000001';
const USER_B          = 'aaaaaaaa-0000-4000-a000-000000000002';
const LEAGUE_CLS      = 'bbbbbbbb-0000-4000-b000-000000000001';
const BET_INSTANCE    = 'dddddddd-0000-4000-d000-000000000001';
const SQUAD_A_CLASSIC = 'cccccccc-0000-4000-c000-000000000001'; // owned by USER_A
const SQUAD_B_CLASSIC = 'cccccccc-0000-4000-c000-000000000002'; // owned by USER_B

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
  // BUG-RB1 (fixed): resolve_bet used to call aggregate_league_member_points()
  // for each new winner BEFORE UPDATEing bet_instances.status to 'resolved',
  // so the immediate refresh silently summed 0 (aggregate_league_member_points
  // only counts bet rewards WHERE bi.status='resolved'). Already fixed live by
  // migration 232 (232_fix_resolve_bet_points_ordering.sql); supabase/schema.sql
  // just hadn't been regenerated to match until 2026-07-31, which is why this
  // was still marked `.todo`. Flipped back to a normal `it` now that schema.sql
  // reflects the corrected statement order.
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

/**
 * submit_bet — unit tests
 *
 * Real signature (confirmed against supabase/schema.sql):
 *   submit_bet(p_squad_id uuid, p_instance_id uuid, p_answer text) RETURNS jsonb
 * Returns {ok:true} / {ok:false, error:...} in JSON rather than raising — no
 * SAVEPOINT needed, same convention as resolve_bet above. Upserts into
 * bet_submissions on (squad_id, bet_instance_id), resetting is_correct/
 * reward_awarded to NULL on every write (ON CONFLICT ... DO UPDATE).
 *
 * Seed bet_instances row (BET_INSTANCE) is status='open', deadline_at=NOW()+2days.
 */
describe('submit_bet', () => {
  before(async () => { await getClient(); });
  after(async () => { await closeClient(); });

  beforeEach(async () => { await beginTx(); });
  afterEach(async () => { await rollbackTx(); });

  it('happy path: creates a bet_submissions row with is_correct=NULL', async () => {
    const result = await callRpc('submit_bet', {
      p_squad_id:    SQUAD_A_CLASSIC,
      p_instance_id: BET_INSTANCE,
      p_answer:      'England',
    }, { actingUserId: USER_A });

    assert.equal(result?.ok, true, `Expected success, got: ${JSON.stringify(result)}`);

    const row = await queryOne(
      'SELECT answer, is_correct, reward_awarded FROM bet_submissions WHERE bet_instance_id=$1 AND squad_id=$2',
      [BET_INSTANCE, SQUAD_A_CLASSIC]
    );
    assert.equal(row.answer, 'England');
    assert.equal(row.is_correct, null);
    assert.equal(row.reward_awarded, null);
  });

  it('re-submit changes the stored answer and resets is_correct/reward_awarded even if already set', async () => {
    await callRpc('submit_bet', {
      p_squad_id: SQUAD_A_CLASSIC, p_instance_id: BET_INSTANCE, p_answer: 'England',
    }, { actingUserId: USER_A });

    // Simulate a stale resolved state on this submission (as if a prior
    // resolve_bet pass had graded it) without going through resolve_bet
    // itself, since that would flip bet_instances.status to 'resolved' and
    // make a genuine re-submission impossible (BET_CLOSED) — the thing under
    // test here is the ON CONFLICT ... DO UPDATE reset clause itself.
    await query(
      `UPDATE bet_submissions SET is_correct = true, reward_awarded = 5
       WHERE bet_instance_id=$1 AND squad_id=$2`,
      [BET_INSTANCE, SQUAD_A_CLASSIC]
    );

    const result = await callRpc('submit_bet', {
      p_squad_id: SQUAD_A_CLASSIC, p_instance_id: BET_INSTANCE, p_answer: 'France',
    }, { actingUserId: USER_A });
    assert.equal(result?.ok, true);

    const row = await queryOne(
      'SELECT answer, is_correct, reward_awarded FROM bet_submissions WHERE bet_instance_id=$1 AND squad_id=$2',
      [BET_INSTANCE, SQUAD_A_CLASSIC]
    );
    assert.equal(row.answer, 'France', 'answer should be overwritten by the re-submit');
    assert.equal(row.is_correct, null, 'is_correct must reset to NULL on re-submit');
    assert.equal(row.reward_awarded, null, 'reward_awarded must reset to NULL on re-submit');
  });

  // AUDIT-57-02 regression test: submit_bet must reject a squad the acting
  // user doesn't own, not just trust the caller-supplied p_squad_id.
  it('UNAUTHORIZED when the acting user does not own the given squad', async () => {
    const result = await callRpc('submit_bet', {
      p_squad_id:    SQUAD_B_CLASSIC, // owned by USER_B
      p_instance_id: BET_INSTANCE,
      p_answer:      'England',
    }, { actingUserId: USER_A });

    assert.equal(result?.error, 'UNAUTHORIZED', `Expected UNAUTHORIZED, got: ${JSON.stringify(result)}`);
  });

  it('BET_NOT_FOUND for a non-existent bet instance', async () => {
    const result = await callRpc('submit_bet', {
      p_squad_id:    SQUAD_A_CLASSIC,
      p_instance_id: '00000000-0000-4000-a000-000000000000',
      p_answer:      'England',
    }, { actingUserId: USER_A });

    assert.equal(result?.error, 'BET_NOT_FOUND', `Expected BET_NOT_FOUND, got: ${JSON.stringify(result)}`);
  });

  it('BET_CLOSED when the bet instance is not open', async () => {
    await query(`UPDATE bet_instances SET status='closed' WHERE id=$1`, [BET_INSTANCE]);

    const result = await callRpc('submit_bet', {
      p_squad_id: SQUAD_A_CLASSIC, p_instance_id: BET_INSTANCE, p_answer: 'England',
    }, { actingUserId: USER_A });

    assert.equal(result?.error, 'BET_CLOSED', `Expected BET_CLOSED, got: ${JSON.stringify(result)}`);
  });

  it('DEADLINE_PASSED when the bet instance deadline has already elapsed', async () => {
    await query(`UPDATE bet_instances SET deadline_at = now() - interval '1 hour' WHERE id=$1`, [BET_INSTANCE]);

    const result = await callRpc('submit_bet', {
      p_squad_id: SQUAD_A_CLASSIC, p_instance_id: BET_INSTANCE, p_answer: 'England',
    }, { actingUserId: USER_A });

    assert.equal(result?.error, 'DEADLINE_PASSED', `Expected DEADLINE_PASSED, got: ${JSON.stringify(result)}`);
  });
});
