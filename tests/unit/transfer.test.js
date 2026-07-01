/**
 * execute_transfer_atomic — unit tests (B2 / TEST-1)
 *
 * Covers:
 *  ✓ Happy path: buy a player into an open squad
 *  ✓ Over-budget: rejected with INSUFFICIENT_BUDGET
 *  ✓ Club cap: rejected with CLUB_CAP_EXCEEDED when 4th player from same club
 *  ✓ Window closed: rejected with WINDOW_CLOSED when deadline is in the past
 *  ✓ Over-round-limit: penalty_transfers incremented (not blocked)
 *  ✓ Initial-build latch: transfer limit bypassed while initial_build_complete=false
 */

import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { getClient, closeClient, beginTx, rollbackTx, callRpc, query, queryOne } from './helpers.js';

// ── Seed IDs (must match seed.sql) ───────────────────────────────────────────
const USER_A      = 'aaaaaaaa-0000-4000-a000-000000000001';
const LEAGUE_CLS  = 'bbbbbbbb-0000-4000-b000-000000000001';
const SQUAD_A     = 'cccccccc-0000-4000-c000-000000000001';
const SQUAD_DRAFT = 'cccccccc-0000-4000-c000-000000000003';
const MATCHDAY    = 'TEST_429-r1';

// A player NOT in squad A yet (Germany — not at club cap)
const PLAYER_IN    = 'test-gk-ger-01';   // GK, £6.0, CLUB_GER
// A player to sell from squad A
const PLAYER_OUT   = 'test-mid-fra-01';  // MID, £6.0, CLUB_FRA

// 4th German player — would breach club cap (cap=3)
const GER_FOURTH   = 'test-def-ger-03';  // already CLUB_GER at limit after 3 in squad

describe('execute_transfer_atomic', () => {
  before(async () => { await getClient(); });
  after(async () => { await closeClient(); });

  // Each test runs inside a rolled-back transaction so the seed state is restored
  beforeEach(async () => { await beginTx(); });
  afterEach(async () => { await rollbackTx(); });

  // ── 1. Happy path — sell + buy ──────────────────────────────────────────────
  it('allows a sell + buy when window is open and budget is sufficient', async () => {
    const result = await callRpc('execute_transfer_atomic', {
      p_squad_id:   SQUAD_A,
      p_player_out: PLAYER_OUT,
      p_player_in:  PLAYER_IN,
      p_matchday_id: MATCHDAY,
    }, { actingUserId: USER_A });

    // Should succeed (no error key or error = null)
    assert.ok(!result?.error, `Expected success, got: ${JSON.stringify(result)}`);

    // Verify squad array updated
    const squad = await queryOne('SELECT players FROM squads WHERE id = $1', [SQUAD_A]);
    assert.ok(squad.players.includes(PLAYER_IN),  'New player should be in squad');
    assert.ok(!squad.players.includes(PLAYER_OUT), 'Sold player should be removed');
  });

  // ── 2. Over-budget ──────────────────────────────────────────────────────────
  it('rejects a buy when player price exceeds remaining budget', async () => {
    // Drain budget first: set budget_remaining to 1.0
    await query('UPDATE squads SET budget_remaining = 1.0 WHERE id = $1', [SQUAD_A]);

    const result = await callRpc('execute_transfer_atomic', {
      p_squad_id:   SQUAD_A,
      p_player_out: PLAYER_OUT,
      p_player_in:  PLAYER_IN,  // costs £6.0
      p_matchday_id: MATCHDAY,
    }, { actingUserId: USER_A });

    assert.equal(result?.error ?? result?.code, 'INSUFFICIENT_BUDGET',
      `Expected INSUFFICIENT_BUDGET, got: ${JSON.stringify(result)}`);
  });

  // ── 3. Club cap ─────────────────────────────────────────────────────────────
  it('rejects a buy that would exceed club cap (4th player from same club)', async () => {
    // First add 3 German players to reach cap
    await query(`
      UPDATE squads SET players = array_append(array_append(players,
        'test-def-ger-01'), 'test-def-ger-02')
      WHERE id = $1
    `, [SQUAD_A]);

    const result = await callRpc('execute_transfer_atomic', {
      p_squad_id:   SQUAD_A,
      p_player_out: PLAYER_OUT,
      p_player_in:  GER_FOURTH,  // 4th German
      p_matchday_id: MATCHDAY,
    }, { actingUserId: USER_A });

    assert.ok(
      (result?.error ?? result?.code ?? '').includes('CLUB_CAP'),
      `Expected CLUB_CAP_EXCEEDED, got: ${JSON.stringify(result)}`
    );
  });

  // ── 4. Transfer window closed ────────────────────────────────────────────────
  it('rejects a transfer when the window deadline has passed', async () => {
    // Move deadline into the past
    await query(`
      UPDATE matchday_deadlines SET deadline_at = NOW() - INTERVAL '1 day'
      WHERE league_id = $1 AND matchday_id = $2
    `, [LEAGUE_CLS, MATCHDAY]);

    const result = await callRpc('execute_transfer_atomic', {
      p_squad_id:   SQUAD_A,
      p_player_out: PLAYER_OUT,
      p_player_in:  PLAYER_IN,
      p_matchday_id: MATCHDAY,
    }, { actingUserId: USER_A });

    assert.ok(
      (result?.error ?? result?.code ?? '').includes('WINDOW'),
      `Expected WINDOW_CLOSED, got: ${JSON.stringify(result)}`
    );
  });

  // ── 5. Over-round-limit: penalty (not blocked) ───────────────────────────────
  it('allows an over-limit buy and records a penalty transfer', async () => {
    // Exhaust the free 3 transfers by faking round_transfers
    await query(`
      UPDATE squads SET round_transfers = $1::jsonb WHERE id = $2
    `, [JSON.stringify({ [MATCHDAY]: 3 }), SQUAD_A]);

    const result = await callRpc('execute_transfer_atomic', {
      p_squad_id:   SQUAD_A,
      p_player_out: PLAYER_OUT,
      p_player_in:  PLAYER_IN,
      p_matchday_id: MATCHDAY,
    }, { actingUserId: USER_A });

    // Should succeed (penalty is deducted at scoring, not here)
    assert.ok(!result?.error, `Expected success with penalty, got: ${JSON.stringify(result)}`);

    // penalty_transfers should be incremented
    const squad = await queryOne('SELECT penalty_transfers FROM squads WHERE id = $1', [SQUAD_A]);
    const penaltyCount = squad.penalty_transfers?.[MATCHDAY] ?? 0;
    assert.equal(penaltyCount, 1, 'penalty_transfers should be 1 after 1 over-limit buy');
  });

  // ── 6. Initial-build latch bypasses round limit ──────────────────────────────
  it('bypasses transfer limit while initial_build_complete is false', async () => {
    // Draft squad has initial_build_complete=false and only 8 players
    const result = await callRpc('execute_transfer_atomic', {
      p_squad_id:   SQUAD_DRAFT,
      p_player_out: null,           // buy-only (no sell)
      p_player_in:  'test-fwd-eng-02',
      p_matchday_id: MATCHDAY,
    }, { actingUserId: USER_A });

    // Should succeed despite no free transfers configured, because latch is false
    assert.ok(!result?.error, `Expected success (latch bypass), got: ${JSON.stringify(result)}`);
  });
});
