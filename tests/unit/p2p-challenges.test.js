/**
 * P2P challenge lifecycle — unit tests (test-coverage plan, Task 1)
 *
 * Covers every RPC in the P2P challenge subsystem, using the exact SQL bodies
 * confirmed by direct read of:
 *   - supabase/migrations/239_p2p_freeform_bets.sql — create_p2p_challenge
 *     (current signature/body), declare/confirm/dispute/arbitrate_freeform_result
 *   - supabase/migrations/204_p2p_challenges.sql — accept_p2p_challenge (unmodified since)
 *   - supabase/migrations/235_fix_p2p_decline_cancel_expire_double_refund.sql —
 *     decline_p2p_challenge / cancel_p2p_challenge (post double-refund fix)
 *   - supabase/migrations/224_fix_p2p_resolve_payout.sql — resolve_p2p_challenge
 *     (post tie-double-credit fix, post zero-amount-crash fix)
 *   - supabase/schema.sql — credit_coins / debit_coins_to_escrow (DAILY_STAKE_CAP_EXCEEDED)
 *
 * Two real production bugs this file directly regression-tests:
 *   - migration 205's non-tie resolve path always threw (loser's audit entry used
 *     credit_coins with a zero amount, which hard-guards against non-positive
 *     amounts) — fixed in 224. See 'resolve_p2p_challenge' win/loss tests.
 *   - migration 204's decline/cancel paths double-refunded the challenger (an
 *     extra credit_coins call on top of release_escrow, which already refunds
 *     and logs its own transaction) — fixed in 235. See the "single refund"
 *     assertions below.
 *
 * Conventions: shared client via helpers.js, SAVEPOINT/ROLLBACK TO SAVEPOINT
 * around every RAISE EXCEPTION assertion (a hard throw aborts the whole
 * enclosing beginTx() transaction, not just the statement — see coins.test.js).
 * callRpc(..., { actingUserId: null }) simulates the cron/service-role context
 * (auth.uid() IS NULL) required by resolve_p2p_challenge and (as a negative
 * case) rejected by arbitrate_freeform_result.
 *
 * fantasy_points seeding reuses the workaround documented in lineup.test.js:
 * fantasy_points_matchday_id_format's CHECK (`^[0-9]+-r[0-9]+`) rejects this
 * seed's non-numeric TOURNAMENT_ID ('TEST_429'), so the constraint is dropped
 * inside the test's own transaction (rolled back in afterEach like everything
 * else here) before inserting a total row.
 */

import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { getClient, closeClient, beginTx, rollbackTx, callRpc, query, queryOne } from './helpers.js';

// ── Seed IDs (must match seed.sql) ───────────────────────────────────────────
const USER_A        = 'aaaaaaaa-0000-4000-a000-000000000001'; // circle member, balance 500
const USER_B        = 'aaaaaaaa-0000-4000-a000-000000000002'; // circle member, balance 200
const COMMISSIONER  = 'aaaaaaaa-0000-4000-a000-000000000099'; // circle OWNER, balance 1000
const CIRCLE        = 'ffffffff-0000-4000-f000-000000000001';
const LEAGUE_CLS    = 'bbbbbbbb-0000-4000-b000-000000000001'; // classic — circle_id = CIRCLE, A+B+COMMISSIONER members
const LEAGUE_DRAFT  = 'bbbbbbbb-0000-4000-b000-000000000002'; // draft — circle_id = CIRCLE too, but only A+COMMISSIONER are members
const SQUAD_A       = 'cccccccc-0000-4000-c000-000000000001'; // league_id=LEAGUE_CLS, user_id=USER_A
const SQUAD_B       = 'cccccccc-0000-4000-c000-000000000002'; // league_id=LEAGUE_CLS, user_id=USER_B

// Second circle, created fresh per relevant test — used for NOT_CIRCLE_MEMBER /
// OPPONENT_NOT_CIRCLE_MEMBER / LEAGUE_NOT_IN_CIRCLE, which need a circle whose
// membership or league-linkage doesn't already match CIRCLE's seeded state.
const CIRCLE_2 = 'ffffffff-0000-4000-f000-000000000002';

// ── Local helpers (this file only) ──────────────────────────────────────────

async function wallet(userId) {
  return queryOne('SELECT balance, escrow FROM coin_wallets WHERE user_id=$1', [userId]);
}

async function makeCircle(id, name = 'TEST_Circle_2') {
  await query(
    `INSERT INTO circles (id, name, created_by, invite_code) VALUES ($1,$2,$3,$4)
     ON CONFLICT (id) DO NOTHING`,
    [id, name, COMMISSIONER, id.slice(-8)]
  );
}

async function addCircleMember(circleId, userId, role = 'member') {
  await query(
    `INSERT INTO circle_members (circle_id, user_id, role) VALUES ($1,$2,$3)
     ON CONFLICT (circle_id, user_id) DO NOTHING`,
    [circleId, userId, role]
  );
}

async function setP2pConfig(leagueId, overrides = {}) {
  const cfg = {
    min_stake: 10, max_stake: 500, daily_challenge_limit: 5, challenges_enabled: true,
    ...overrides,
  };
  await query(
    `INSERT INTO p2p_config (league_id, min_stake, max_stake, daily_challenge_limit, challenges_enabled)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (league_id) DO UPDATE SET
       min_stake = $2, max_stake = $3, daily_challenge_limit = $4, challenges_enabled = $5`,
    [leagueId, cfg.min_stake, cfg.max_stake, cfg.daily_challenge_limit, cfg.challenges_enabled]
  );
}

// Raw-insert fixture rows to pad "existing challenges today" counts without
// paying the escrow/RPC cost of creating each one for real — the daily-limit
// checks are plain COUNT(*) queries, agnostic to how the rows got there.
async function insertDummyGwChallenge(challengerId, opponentId, leagueId, matchdayId) {
  await query(
    `INSERT INTO p2p_challenges
       (circle_id, league_id, challenger_id, opponent_id, bet_type, matchday_id, stake_coins, status, resolution_mode)
     VALUES ($1,$2,$3,$4,'gw_total',$5,10,'pending','auto')`,
    [CIRCLE, leagueId, challengerId, opponentId, matchdayId]
  );
}

async function insertDummyFreeformChallenge(challengerId, opponentId, question) {
  await query(
    `INSERT INTO p2p_challenges
       (circle_id, challenger_id, opponent_id, bet_type, stake_coins, status, resolution_mode, question)
     VALUES ($1,$2,$3,'freeform',10,'pending','manual',$4)`,
    [CIRCLE, challengerId, opponentId, question]
  );
}

async function seedMatchdaySettled(leagueId, matchdayId) {
  await query(
    `INSERT INTO gazette_entries (league_id, entry_type, full_data)
     VALUES ($1, 'activity', jsonb_build_object('matchday_id', $2::text))`,
    [leagueId, matchdayId]
  );
}

async function seedFantasyPointsTotal(squadId, matchdayId, total) {
  await query(`ALTER TABLE fantasy_points DROP CONSTRAINT IF EXISTS fantasy_points_matchday_id_format`);
  await query(
    `INSERT INTO fantasy_points (squad_id, matchday_id, player_id, total) VALUES ($1,$2,NULL,$3)`,
    [squadId, matchdayId, total]
  );
}

async function createGwTotalChallenge(challengerId, opponentId, { matchday, stake = 50, league = LEAGUE_CLS } = {}) {
  const result = await callRpc('create_p2p_challenge', {
    p_circle_id: CIRCLE, p_opponent_id: opponentId, p_bet_type: 'gw_total',
    p_stake_coins: stake, p_league_id: league, p_matchday_id: matchday,
  }, { actingUserId: challengerId });
  return result.challenge_id;
}

async function createFreeformChallenge(challengerId, opponentId, question, stake = 20) {
  const result = await callRpc('create_p2p_challenge', {
    p_circle_id: CIRCLE, p_opponent_id: opponentId, p_bet_type: 'freeform',
    p_stake_coins: stake, p_question: question,
  }, { actingUserId: challengerId });
  return result.challenge_id;
}

async function acceptChallenge(challengeId, opponentId) {
  return callRpc('accept_p2p_challenge', { p_challenge_id: challengeId }, { actingUserId: opponentId });
}

async function expectThrows(fn, expectedSubstring) {
  await query('SAVEPOINT before_throw');
  let threw = false, message = '';
  try {
    await fn();
  } catch (err) {
    threw = true;
    message = err.message || '';
    await query('ROLLBACK TO SAVEPOINT before_throw');
  }
  assert.ok(threw, `Expected an exception containing "${expectedSubstring}", but nothing was thrown`);
  assert.ok(message.includes(expectedSubstring), `Expected "${expectedSubstring}", got: ${message}`);
}

describe('create_p2p_challenge', () => {
  before(async () => { await getClient(); });
  after(async () => { await closeClient(); });
  beforeEach(async () => { await beginTx(); });
  afterEach(async () => { await rollbackTx(); });

  it('gw_total happy path: escrows the stake and creates a pending row', async () => {
    const before = await wallet(USER_A);
    const challengeId = await createGwTotalChallenge(USER_A, USER_B, { matchday: 'TEST_429-r1', stake: 50 });

    const after = await wallet(USER_A);
    assert.equal(after.balance, before.balance - 50, 'challenger balance should be debited by the stake');
    assert.equal(after.escrow, before.escrow + 50, 'challenger escrow should hold the stake');

    const row = await queryOne('SELECT * FROM p2p_challenges WHERE id=$1', [challengeId]);
    assert.equal(row.status, 'pending');
    assert.equal(row.bet_type, 'gw_total');
    assert.equal(row.resolution_mode, 'auto');
    assert.equal(row.question, null);
    assert.equal(row.league_id, LEAGUE_CLS);
    assert.equal(row.matchday_id, 'TEST_429-r1');
  });

  it('freeform happy path: stores the question, no league/matchday', async () => {
    const challengeId = await createFreeformChallenge(USER_A, USER_B, 'Who scores first?', 20);

    const row = await queryOne('SELECT * FROM p2p_challenges WHERE id=$1', [challengeId]);
    assert.equal(row.status, 'pending');
    assert.equal(row.bet_type, 'freeform');
    assert.equal(row.resolution_mode, 'manual');
    assert.equal(row.question, 'Who scores first?');
    assert.equal(row.league_id, null);
    assert.equal(row.matchday_id, null);
  });

  it('BET_TYPE_NOT_SUPPORTED for an unrecognized bet_type', async () => {
    await expectThrows(() => callRpc('create_p2p_challenge', {
      p_circle_id: CIRCLE, p_opponent_id: USER_B, p_bet_type: 'coinflip',
      p_stake_coins: 20, p_question: 'x',
    }, { actingUserId: USER_A }), 'BET_TYPE_NOT_SUPPORTED');
  });

  it('NOT_CIRCLE_MEMBER when the challenger is not a member of p_circle_id', async () => {
    await makeCircle(CIRCLE_2);
    // Intentionally do NOT add USER_A to CIRCLE_2.
    await expectThrows(() => callRpc('create_p2p_challenge', {
      p_circle_id: CIRCLE_2, p_opponent_id: USER_B, p_bet_type: 'freeform',
      p_stake_coins: 20, p_question: 'x',
    }, { actingUserId: USER_A }), 'NOT_CIRCLE_MEMBER');
  });

  it('OPPONENT_NOT_CIRCLE_MEMBER when the opponent is not a member of p_circle_id', async () => {
    await makeCircle(CIRCLE_2);
    await addCircleMember(CIRCLE_2, USER_A, 'member');
    // USER_B intentionally left out of CIRCLE_2.
    await expectThrows(() => callRpc('create_p2p_challenge', {
      p_circle_id: CIRCLE_2, p_opponent_id: USER_B, p_bet_type: 'freeform',
      p_stake_coins: 20, p_question: 'x',
    }, { actingUserId: USER_A }), 'OPPONENT_NOT_CIRCLE_MEMBER');
  });

  it('LEAGUE_AND_MATCHDAY_REQUIRED when gw_total is missing league_id or matchday_id', async () => {
    await expectThrows(() => callRpc('create_p2p_challenge', {
      p_circle_id: CIRCLE, p_opponent_id: USER_B, p_bet_type: 'gw_total',
      p_stake_coins: 20, p_league_id: null, p_matchday_id: null,
    }, { actingUserId: USER_A }), 'LEAGUE_AND_MATCHDAY_REQUIRED');
  });

  it('LEAGUE_NOT_IN_CIRCLE when the league belongs to a different circle than p_circle_id', async () => {
    await makeCircle(CIRCLE_2);
    await addCircleMember(CIRCLE_2, USER_A, 'member');
    await addCircleMember(CIRCLE_2, USER_B, 'member');
    // LEAGUE_CLS.circle_id = CIRCLE, not CIRCLE_2.
    await expectThrows(() => callRpc('create_p2p_challenge', {
      p_circle_id: CIRCLE_2, p_opponent_id: USER_B, p_bet_type: 'gw_total',
      p_stake_coins: 20, p_league_id: LEAGUE_CLS, p_matchday_id: 'TEST_429-r1',
    }, { actingUserId: USER_A }), 'LEAGUE_NOT_IN_CIRCLE');
  });

  it('CHALLENGES_DISABLED when p2p_config.challenges_enabled is false for the league', async () => {
    await setP2pConfig(LEAGUE_CLS, { challenges_enabled: false });
    await expectThrows(() => createGwTotalChallenge(USER_A, USER_B, { matchday: 'TEST_429-r1' }),
      'CHALLENGES_DISABLED');
  });

  it('DAILY_LIMIT_REACHED (gw_total) once the per-league daily challenge count is hit', async () => {
    await setP2pConfig(LEAGUE_CLS, { daily_challenge_limit: 1 });
    await insertDummyGwChallenge(USER_A, USER_B, LEAGUE_CLS, 'TEST_429-r1');
    await expectThrows(() => createGwTotalChallenge(USER_A, USER_B, { matchday: 'TEST_429-r2' }),
      'DAILY_LIMIT_REACHED');
  });

  it('NOT_LEAGUE_MEMBER when the challenger is not a member of the target league', async () => {
    // LEAGUE_DRAFT (still in CIRCLE) has only USER_A and COMMISSIONER as members.
    await expectThrows(() => createGwTotalChallenge(USER_B, USER_A, { matchday: 'TEST_429-r1', league: LEAGUE_DRAFT }),
      'NOT_LEAGUE_MEMBER');
  });

  it('OPPONENT_NOT_MEMBER when the opponent is not a member of the target league', async () => {
    await expectThrows(() => createGwTotalChallenge(USER_A, USER_B, { matchday: 'TEST_429-r1', league: LEAGUE_DRAFT }),
      'OPPONENT_NOT_MEMBER');
  });

  it('DUPLICATE_CHALLENGE (gw_total) for the same pair + league + matchday while pending', async () => {
    await createGwTotalChallenge(USER_A, USER_B, { matchday: 'TEST_429-r3' });
    await expectThrows(() => createGwTotalChallenge(USER_A, USER_B, { matchday: 'TEST_429-r3' }),
      'DUPLICATE_CHALLENGE');
  });

  it('QUESTION_REQUIRED when freeform is missing a question', async () => {
    await expectThrows(() => callRpc('create_p2p_challenge', {
      p_circle_id: CIRCLE, p_opponent_id: USER_B, p_bet_type: 'freeform',
      p_stake_coins: 20, p_question: null,
    }, { actingUserId: USER_A }), 'QUESTION_REQUIRED');
  });

  it('QUESTION_TOO_LONG when the freeform question exceeds 140 characters', async () => {
    await expectThrows(() => createFreeformChallenge(USER_A, USER_B, 'x'.repeat(141), 20),
      'QUESTION_TOO_LONG');
  });

  it('DUPLICATE_CHALLENGE (freeform) for the same pair + question while pending', async () => {
    await createFreeformChallenge(USER_A, USER_B, 'Same question twice?', 20);
    await expectThrows(() => createFreeformChallenge(USER_A, USER_B, 'Same question twice?', 20),
      'DUPLICATE_CHALLENGE');
  });

  it('DAILY_LIMIT_REACHED (freeform) once 5 challenges exist for the circle today', async () => {
    for (let i = 0; i < 5; i++) {
      await insertDummyFreeformChallenge(USER_A, USER_B, `dummy question ${i}`);
    }
    await expectThrows(() => createFreeformChallenge(USER_A, USER_B, 'the 6th question', 20),
      'DAILY_LIMIT_REACHED');
  });

  it('STAKE_TOO_LOW when below the configured minimum', async () => {
    await expectThrows(() => createFreeformChallenge(USER_A, USER_B, 'too low?', 5),
      'STAKE_TOO_LOW');
  });

  it('STAKE_TOO_HIGH when above the configured maximum', async () => {
    await expectThrows(() => createFreeformChallenge(USER_A, USER_B, 'too high?', 600),
      'STAKE_TOO_HIGH');
  });

  it('INSUFFICIENT_BALANCE bubbles up from debit_coins_to_escrow', async () => {
    // USER_B has 200 coins; 500 is within [10,500] stake bounds but exceeds their balance.
    await expectThrows(() => createFreeformChallenge(USER_B, USER_A, 'can B afford this?', 500),
      'INSUFFICIENT_BALANCE');
  });

  it('DAILY_STAKE_CAP_EXCEEDED bubbles up from debit_coins_to_escrow (1000/24h, all stakes)', async () => {
    // COMMISSIONER has 1000 balance/500 max-stake headroom individually, but the
    // cap is a rolling 24h SUM across all 'stake' transactions regardless of challenge.
    await query(
      `INSERT INTO coin_transactions (user_id, type, amount) VALUES ($1,'stake',950)`,
      [COMMISSIONER]
    );
    await expectThrows(() => createFreeformChallenge(COMMISSIONER, USER_A, 'cap test?', 60),
      'DAILY_STAKE_LIMIT_EXCEEDED');
  });
});

describe('accept_p2p_challenge', () => {
  before(async () => { await getClient(); });
  after(async () => { await closeClient(); });
  beforeEach(async () => { await beginTx(); });
  afterEach(async () => { await rollbackTx(); });

  it('happy path: escrows the opponent stake and moves status to accepted', async () => {
    const challengeId = await createGwTotalChallenge(USER_A, USER_B, { matchday: 'TEST_429-r1', stake: 30 });
    const before = await wallet(USER_B);

    const result = await acceptChallenge(challengeId, USER_B);
    assert.equal(result?.status, 'accepted');

    const after = await wallet(USER_B);
    assert.equal(after.balance, before.balance - 30);
    assert.equal(after.escrow, before.escrow + 30);

    const row = await queryOne('SELECT status FROM p2p_challenges WHERE id=$1', [challengeId]);
    assert.equal(row.status, 'accepted');
  });

  it('NOT_OPPONENT when the challenger tries to accept their own challenge', async () => {
    const challengeId = await createGwTotalChallenge(USER_A, USER_B, { matchday: 'TEST_429-r1' });
    await expectThrows(() => acceptChallenge(challengeId, USER_A), 'NOT_OPPONENT');
  });

  it('CHALLENGE_NOT_PENDING when accepting an already-accepted challenge', async () => {
    const challengeId = await createGwTotalChallenge(USER_A, USER_B, { matchday: 'TEST_429-r1' });
    await acceptChallenge(challengeId, USER_B);
    await expectThrows(() => acceptChallenge(challengeId, USER_B), 'CHALLENGE_NOT_PENDING');
  });

  it('CHALLENGE_EXPIRED when accepting past expires_at', async () => {
    const challengeId = await createGwTotalChallenge(USER_A, USER_B, { matchday: 'TEST_429-r1' });
    await query(`UPDATE p2p_challenges SET expires_at = now() - interval '1 hour' WHERE id=$1`, [challengeId]);
    await expectThrows(() => acceptChallenge(challengeId, USER_B), 'CHALLENGE_EXPIRED');
  });
});

describe('decline_p2p_challenge / cancel_p2p_challenge', () => {
  before(async () => { await getClient(); });
  after(async () => { await closeClient(); });
  beforeEach(async () => { await beginTx(); });
  afterEach(async () => { await rollbackTx(); });

  // Regression test for the migration-204 double-refund bug fixed in 235:
  // decline/cancel must restore the challenger's balance to EXACTLY its
  // pre-stake value via a single release_escrow() call, not a second
  // credit_coins('refund', ...) on top.
  it('decline_p2p_challenge refunds the challenger exactly once', async () => {
    const before = await wallet(USER_A);
    const challengeId = await createGwTotalChallenge(USER_A, USER_B, { matchday: 'TEST_429-r1', stake: 40 });

    const result = await callRpc('decline_p2p_challenge', { p_challenge_id: challengeId }, { actingUserId: USER_B });
    assert.equal(result?.status, 'declined');

    const after = await wallet(USER_A);
    assert.equal(after.balance, before.balance, 'challenger balance must be restored to exactly its pre-stake value');
    assert.equal(after.escrow, before.escrow, 'challenger escrow must be back to zero net change');

    const row = await queryOne('SELECT status FROM p2p_challenges WHERE id=$1', [challengeId]);
    assert.equal(row.status, 'declined');
  });

  it('cancel_p2p_challenge refunds the challenger exactly once', async () => {
    const before = await wallet(USER_A);
    const challengeId = await createGwTotalChallenge(USER_A, USER_B, { matchday: 'TEST_429-r1', stake: 40 });

    const result = await callRpc('cancel_p2p_challenge', { p_challenge_id: challengeId }, { actingUserId: USER_A });
    assert.equal(result?.status, 'cancelled');

    const after = await wallet(USER_A);
    assert.equal(after.balance, before.balance, 'challenger balance must be restored to exactly its pre-stake value');
    assert.equal(after.escrow, before.escrow);
  });

  it('decline: NOT_OPPONENT when the challenger tries to decline their own challenge', async () => {
    const challengeId = await createGwTotalChallenge(USER_A, USER_B, { matchday: 'TEST_429-r1' });
    await expectThrows(() => callRpc('decline_p2p_challenge', { p_challenge_id: challengeId }, { actingUserId: USER_A }),
      'NOT_OPPONENT');
  });

  it('cancel: NOT_CHALLENGER when the opponent tries to cancel', async () => {
    const challengeId = await createGwTotalChallenge(USER_A, USER_B, { matchday: 'TEST_429-r1' });
    await expectThrows(() => callRpc('cancel_p2p_challenge', { p_challenge_id: challengeId }, { actingUserId: USER_B }),
      'NOT_CHALLENGER');
  });

  it('decline: CHALLENGE_NOT_PENDING once the challenge has been accepted', async () => {
    const challengeId = await createGwTotalChallenge(USER_A, USER_B, { matchday: 'TEST_429-r1' });
    await acceptChallenge(challengeId, USER_B);
    await expectThrows(() => callRpc('decline_p2p_challenge', { p_challenge_id: challengeId }, { actingUserId: USER_B }),
      'CHALLENGE_NOT_PENDING');
  });

  it('cancel: CANNOT_CANCEL once the challenge has been accepted', async () => {
    const challengeId = await createGwTotalChallenge(USER_A, USER_B, { matchday: 'TEST_429-r1' });
    await acceptChallenge(challengeId, USER_B);
    await expectThrows(() => callRpc('cancel_p2p_challenge', { p_challenge_id: challengeId }, { actingUserId: USER_A }),
      'CANNOT_CANCEL');
  });
});

describe('resolve_p2p_challenge', () => {
  before(async () => { await getClient(); });
  after(async () => { await closeClient(); });
  beforeEach(async () => { await beginTx(); });
  afterEach(async () => { await rollbackTx(); });

  it('ADMIN_ONLY when called with a real authenticated user instead of the cron/service-role context', async () => {
    const challengeId = await createGwTotalChallenge(USER_A, USER_B, { matchday: 'TEST_429-r1' });
    await expectThrows(() => callRpc('resolve_p2p_challenge', { p_challenge_id: challengeId }, { actingUserId: USER_A }),
      'ADMIN_ONLY');
  });

  it('CHALLENGE_NOT_ACCEPTED when the challenge is still pending', async () => {
    const challengeId = await createGwTotalChallenge(USER_A, USER_B, { matchday: 'TEST_429-r1' });
    await expectThrows(() => callRpc('resolve_p2p_challenge', { p_challenge_id: challengeId }, { actingUserId: null }),
      'CHALLENGE_NOT_ACCEPTED');
  });

  it('MATCHDAY_NOT_SETTLED when no gazette activity entry exists for the matchday', async () => {
    const challengeId = await createGwTotalChallenge(USER_A, USER_B, { matchday: 'TEST_429-r5' });
    await acceptChallenge(challengeId, USER_B);
    await expectThrows(() => callRpc('resolve_p2p_challenge', { p_challenge_id: challengeId }, { actingUserId: null }),
      'MATCHDAY_NOT_SETTLED');
  });

  // Regression test for migration 205: the non-tie path used to always throw
  // (credit_coins with a zero-amount loss entry), leaving every non-tie
  // challenge stuck 'accepted' forever with both stakes locked in escrow.
  it('win/loss: winner nets (prize - stake), loser forfeits the full stake, 5% rake applied', async () => {
    const matchday = 'TEST_429-r6';
    const stake = 50;
    const beforeA = await wallet(USER_A);
    const beforeB = await wallet(USER_B);

    const challengeId = await createGwTotalChallenge(USER_A, USER_B, { matchday, stake });
    await acceptChallenge(challengeId, USER_B);

    await seedFantasyPointsTotal(SQUAD_A, matchday, 60); // challenger (USER_A) wins
    await seedFantasyPointsTotal(SQUAD_B, matchday, 40);
    await seedMatchdaySettled(LEAGUE_CLS, matchday);

    const result = await callRpc('resolve_p2p_challenge', { p_challenge_id: challengeId }, { actingUserId: null });

    const totalPot = stake * 2;      // 100
    const rake = Math.floor(totalPot * 0.05); // 5
    const prize = totalPot - rake;   // 95

    assert.equal(result.status, 'resolved');
    assert.equal(result.is_tie, false);
    assert.equal(result.winner_id, USER_A);
    assert.equal(result.challenger_pts, 60);
    assert.equal(result.opponent_pts, 40);
    assert.equal(result.prize, prize);
    assert.equal(result.rake, rake);

    const afterA = await wallet(USER_A);
    const afterB = await wallet(USER_B);
    assert.equal(afterA.balance, beforeA.balance + (prize - stake), 'winner nets prize - stake');
    assert.equal(afterA.escrow, beforeA.escrow, 'winner escrow fully released back to zero net change');
    assert.equal(afterB.balance, beforeB.balance - stake, 'loser forfeits their full stake');
    assert.equal(afterB.escrow, beforeB.escrow, 'loser escrow decremented directly, not routed through balance');

    const row = await queryOne('SELECT status, winner_id FROM p2p_challenges WHERE id=$1', [challengeId]);
    assert.equal(row.status, 'resolved');
    assert.equal(row.winner_id, USER_A);
  });

  // Regression test for migration 205: the tie path used to call
  // credit_coins('refund', ...) AGAIN after release_escrow() already refunded
  // and logged its own transaction — a silent full second mint per tied challenge.
  it('tie: both stakes are returned with no extra coins minted (no double credit)', async () => {
    const matchday = 'TEST_429-r7';
    const stake = 50;
    const beforeA = await wallet(USER_A);
    const beforeB = await wallet(USER_B);

    const challengeId = await createGwTotalChallenge(USER_A, USER_B, { matchday, stake });
    await acceptChallenge(challengeId, USER_B);

    await seedFantasyPointsTotal(SQUAD_A, matchday, 30);
    await seedFantasyPointsTotal(SQUAD_B, matchday, 30);
    await seedMatchdaySettled(LEAGUE_CLS, matchday);

    const result = await callRpc('resolve_p2p_challenge', { p_challenge_id: challengeId }, { actingUserId: null });
    assert.equal(result.is_tie, true);
    assert.equal(result.winner_id, null);

    const afterA = await wallet(USER_A);
    const afterB = await wallet(USER_B);
    assert.equal(afterA.balance, beforeA.balance, 'challenger balance must net to exactly its pre-stake value');
    assert.equal(afterA.escrow, beforeA.escrow);
    assert.equal(afterB.balance, beforeB.balance, 'opponent balance must net to exactly its pre-stake value');
    assert.equal(afterB.escrow, beforeB.escrow);

    const row = await queryOne('SELECT status, winner_id FROM p2p_challenges WHERE id=$1', [challengeId]);
    assert.equal(row.status, 'resolved');
    assert.equal(row.winner_id, null);
  });
});

describe('freeform result chain: declare / confirm / dispute / arbitrate', () => {
  before(async () => { await getClient(); });
  after(async () => { await closeClient(); });
  beforeEach(async () => { await beginTx(); });
  afterEach(async () => { await rollbackTx(); });

  async function acceptedFreeform(question, stake = 20) {
    const challengeId = await createFreeformChallenge(USER_A, USER_B, question, stake);
    await acceptChallenge(challengeId, USER_B);
    return challengeId;
  }

  // ── declare_freeform_result ─────────────────────────────────────────────
  it('declare: a participant can propose a winner without changing status', async () => {
    const challengeId = await acceptedFreeform('Will it rain?');
    const result = await callRpc('declare_freeform_result',
      { p_challenge_id: challengeId, p_winner_id: USER_A }, { actingUserId: USER_A });
    assert.equal(result.ok, true);

    const row = await queryOne('SELECT status, proposed_winner_id, proposed_by FROM p2p_challenges WHERE id=$1', [challengeId]);
    assert.equal(row.status, 'accepted', 'status stays accepted while a proposal is pending confirmation');
    assert.equal(row.proposed_winner_id, USER_A);
    assert.equal(row.proposed_by, USER_A);
  });

  it('declare: a NULL winner proposes a push', async () => {
    const challengeId = await acceptedFreeform('Will it rain 2?');
    await callRpc('declare_freeform_result',
      { p_challenge_id: challengeId, p_winner_id: null }, { actingUserId: USER_B });

    const row = await queryOne('SELECT proposed_winner_id, proposed_by FROM p2p_challenges WHERE id=$1', [challengeId]);
    assert.equal(row.proposed_winner_id, null);
    assert.equal(row.proposed_by, USER_B);
  });

  it('declare: NOT_PARTICIPANT for a non-participant (e.g. the circle owner)', async () => {
    const challengeId = await acceptedFreeform('Will it rain 3?');
    await expectThrows(() => callRpc('declare_freeform_result',
      { p_challenge_id: challengeId, p_winner_id: USER_A }, { actingUserId: COMMISSIONER }),
      'NOT_PARTICIPANT');
  });

  it('declare: INVALID_WINNER when the proposed winner is neither party', async () => {
    const challengeId = await acceptedFreeform('Will it rain 4?');
    await expectThrows(() => callRpc('declare_freeform_result',
      { p_challenge_id: challengeId, p_winner_id: COMMISSIONER }, { actingUserId: USER_A }),
      'INVALID_WINNER');
  });

  it('declare: INVALID_STATUS when the challenge is still pending (not yet accepted)', async () => {
    const challengeId = await createFreeformChallenge(USER_A, USER_B, 'Will it rain 5?');
    await expectThrows(() => callRpc('declare_freeform_result',
      { p_challenge_id: challengeId, p_winner_id: USER_A }, { actingUserId: USER_A }),
      'INVALID_STATUS');
  });

  // ── confirm_freeform_result ─────────────────────────────────────────────
  it('confirm: non-proposer confirms a win — payout math matches resolve_p2p_challenge', async () => {
    const stake = 20;
    const beforeA = await wallet(USER_A);
    const beforeB = await wallet(USER_B);
    const challengeId = await acceptedFreeform('Confirm win test', stake);
    await callRpc('declare_freeform_result', { p_challenge_id: challengeId, p_winner_id: USER_A }, { actingUserId: USER_A });

    const result = await callRpc('confirm_freeform_result', { p_challenge_id: challengeId }, { actingUserId: USER_B });
    const totalPot = stake * 2, rake = Math.floor(totalPot * 0.05), prize = totalPot - rake;

    assert.equal(result.status, 'resolved');
    assert.equal(result.winner_id, USER_A);

    const afterA = await wallet(USER_A);
    const afterB = await wallet(USER_B);
    assert.equal(afterA.balance, beforeA.balance + (prize - stake));
    assert.equal(afterB.balance, beforeB.balance - stake);
  });

  it('confirm: a push (NULL winner) refunds both sides in full, no rake', async () => {
    const stake = 20;
    const beforeA = await wallet(USER_A);
    const beforeB = await wallet(USER_B);
    const challengeId = await acceptedFreeform('Confirm push test', stake);
    await callRpc('declare_freeform_result', { p_challenge_id: challengeId, p_winner_id: null }, { actingUserId: USER_B });

    const result = await callRpc('confirm_freeform_result', { p_challenge_id: challengeId }, { actingUserId: USER_A });
    assert.equal(result.winner_id, null);

    const afterA = await wallet(USER_A);
    const afterB = await wallet(USER_B);
    assert.equal(afterA.balance, beforeA.balance, 'push refunds challenger stake in full');
    assert.equal(afterB.balance, beforeB.balance, 'push refunds opponent stake in full');
  });

  it('confirm: CANNOT_CONFIRM_OWN_PROPOSAL when the proposer tries to confirm their own proposal', async () => {
    const challengeId = await acceptedFreeform('Confirm own proposal test');
    await callRpc('declare_freeform_result', { p_challenge_id: challengeId, p_winner_id: USER_A }, { actingUserId: USER_A });
    await expectThrows(() => callRpc('confirm_freeform_result', { p_challenge_id: challengeId }, { actingUserId: USER_A }),
      'CANNOT_CONFIRM_OWN_PROPOSAL');
  });

  it('confirm: NO_PROPOSAL when nobody has declared a result yet', async () => {
    const challengeId = await acceptedFreeform('No proposal test');
    await expectThrows(() => callRpc('confirm_freeform_result', { p_challenge_id: challengeId }, { actingUserId: USER_B }),
      'NO_PROPOSAL');
  });

  it('confirm: NOT_PARTICIPANT for a non-participant', async () => {
    const challengeId = await acceptedFreeform('Confirm not participant test');
    await callRpc('declare_freeform_result', { p_challenge_id: challengeId, p_winner_id: USER_A }, { actingUserId: USER_A });
    await expectThrows(() => callRpc('confirm_freeform_result', { p_challenge_id: challengeId }, { actingUserId: COMMISSIONER }),
      'NOT_PARTICIPANT');
  });

  // ── dispute_freeform_result ─────────────────────────────────────────────
  it('dispute: non-proposer moves the challenge to disputed and notifies circle owners', async () => {
    const challengeId = await acceptedFreeform('Dispute test');
    await callRpc('declare_freeform_result', { p_challenge_id: challengeId, p_winner_id: USER_A }, { actingUserId: USER_A });

    const result = await callRpc('dispute_freeform_result', { p_challenge_id: challengeId }, { actingUserId: USER_B });
    assert.equal(result.ok, true);

    const row = await queryOne('SELECT status, dispute_deadline FROM p2p_challenges WHERE id=$1', [challengeId]);
    assert.equal(row.status, 'disputed');
    assert.ok(row.dispute_deadline, 'dispute_deadline should be set');

    const notif = await queryOne(
      `SELECT * FROM clubhouse_notifications WHERE source_id=$1 AND type='arbitration_needed' AND user_id=$2`,
      [challengeId, COMMISSIONER]
    );
    assert.ok(notif, 'circle owner should receive an arbitration_needed notification');
  });

  it('dispute: CANNOT_DISPUTE_OWN_PROPOSAL when the proposer tries to dispute their own proposal', async () => {
    const challengeId = await acceptedFreeform('Dispute own proposal test');
    await callRpc('declare_freeform_result', { p_challenge_id: challengeId, p_winner_id: USER_A }, { actingUserId: USER_A });
    await expectThrows(() => callRpc('dispute_freeform_result', { p_challenge_id: challengeId }, { actingUserId: USER_A }),
      'CANNOT_DISPUTE_OWN_PROPOSAL');
  });

  it('dispute: NO_PROPOSAL when nobody has declared a result yet', async () => {
    const challengeId = await acceptedFreeform('Dispute no proposal test');
    await expectThrows(() => callRpc('dispute_freeform_result', { p_challenge_id: challengeId }, { actingUserId: USER_B }),
      'NO_PROPOSAL');
  });

  it('dispute: NOT_PARTICIPANT for a non-participant', async () => {
    const challengeId = await acceptedFreeform('Dispute not participant test');
    await callRpc('declare_freeform_result', { p_challenge_id: challengeId, p_winner_id: USER_A }, { actingUserId: USER_A });
    await expectThrows(() => callRpc('dispute_freeform_result', { p_challenge_id: challengeId }, { actingUserId: COMMISSIONER }),
      'NOT_PARTICIPANT');
  });

  // ── arbitrate_freeform_result ───────────────────────────────────────────
  async function disputedFreeform(question, stake = 20) {
    const challengeId = await acceptedFreeform(question, stake);
    await callRpc('declare_freeform_result', { p_challenge_id: challengeId, p_winner_id: USER_A }, { actingUserId: USER_A });
    await callRpc('dispute_freeform_result', { p_challenge_id: challengeId }, { actingUserId: USER_B });
    return challengeId;
  }

  it('arbitrate: UNAUTHORIZED when called from the cron/service-role context (auth.uid() IS NULL)', async () => {
    const challengeId = await disputedFreeform('Arbitrate unauthorized test');
    await expectThrows(() => callRpc('arbitrate_freeform_result',
      { p_challenge_id: challengeId, p_winner_id: USER_A }, { actingUserId: null }),
      'UNAUTHORIZED');
  });

  it('arbitrate: NOT_CIRCLE_OWNER when a non-owner participant attempts to arbitrate', async () => {
    const challengeId = await disputedFreeform('Arbitrate not owner test');
    await expectThrows(() => callRpc('arbitrate_freeform_result',
      { p_challenge_id: challengeId, p_winner_id: USER_A }, { actingUserId: USER_A }),
      'NOT_CIRCLE_OWNER');
  });

  it('arbitrate: INVALID_STATUS when the challenge is not disputed', async () => {
    const challengeId = await acceptedFreeform('Arbitrate invalid status test');
    await expectThrows(() => callRpc('arbitrate_freeform_result',
      { p_challenge_id: challengeId, p_winner_id: USER_A }, { actingUserId: COMMISSIONER }),
      'INVALID_STATUS');
  });

  it('arbitrate: INVALID_WINNER when the arbitrated winner is neither party', async () => {
    const challengeId = await disputedFreeform('Arbitrate invalid winner test');
    await expectThrows(() => callRpc('arbitrate_freeform_result',
      { p_challenge_id: challengeId, p_winner_id: COMMISSIONER }, { actingUserId: COMMISSIONER }),
      'INVALID_WINNER');
  });

  it('arbitrate: circle owner resolves a win with the same payout math as confirm', async () => {
    const stake = 20;
    const beforeA = await wallet(USER_A);
    const beforeB = await wallet(USER_B);
    const challengeId = await disputedFreeform('Arbitrate win test', stake);

    const result = await callRpc('arbitrate_freeform_result',
      { p_challenge_id: challengeId, p_winner_id: USER_A }, { actingUserId: COMMISSIONER });
    const totalPot = stake * 2, rake = Math.floor(totalPot * 0.05), prize = totalPot - rake;

    assert.equal(result.status, 'resolved');
    assert.equal(result.winner_id, USER_A);

    const afterA = await wallet(USER_A);
    const afterB = await wallet(USER_B);
    assert.equal(afterA.balance, beforeA.balance + (prize - stake));
    assert.equal(afterB.balance, beforeB.balance - stake);
  });

  it('arbitrate: circle owner can void a disputed challenge (NULL winner), refunding both sides', async () => {
    const stake = 20;
    const beforeA = await wallet(USER_A);
    const beforeB = await wallet(USER_B);
    const challengeId = await disputedFreeform('Arbitrate void test', stake);

    const result = await callRpc('arbitrate_freeform_result',
      { p_challenge_id: challengeId, p_winner_id: null }, { actingUserId: COMMISSIONER });
    assert.equal(result.winner_id, null);

    const afterA = await wallet(USER_A);
    const afterB = await wallet(USER_B);
    assert.equal(afterA.balance, beforeA.balance);
    assert.equal(afterB.balance, beforeB.balance);
  });
});
