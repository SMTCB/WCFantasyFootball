/**
 * execute_transfer_atomic — unit tests (B2 / TEST-1)
 *
 * Covers:
 *  ✓ Happy path: sell + buy (two separate action calls — the real RPC is
 *    action-based and single-player-per-call, confirmed against
 *    supabase/functions/process-transfer/index.js)
 *  ✓ Over-budget: rejected with code INSUFFICIENT_BUDGET
 *  ✓ Club cap: rejected with code CLUB_LIMIT when a 4th player from the same
 *    club would be added (p_club_max is a caller-supplied argument, not read
 *    from league_config — the caller, process-transfer, resolves it via
 *    get_club_cap() and passes it in)
 *  ✓ Window closed: covered via get_transfer_window_status() directly —
 *    execute_transfer_atomic has no awareness of the transfer window at all;
 *    that gate lives entirely in the calling edge function
 *  ✓ Over-round-limit: penalty_transfers incremented (not blocked)
 *  ✓ Initial-build latch: transfer limit bypassed while initial_build_complete=false
 */

import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { getClient, closeClient, beginTx, rollbackTx, callRpc, query, queryOne } from './helpers.js';

// ── Seed IDs (must match seed.sql) ───────────────────────────────────────────
const USER_A      = 'aaaaaaaa-0000-4000-a000-000000000001';
const LEAGUE_CLS  = 'bbbbbbbb-0000-4000-b000-000000000001';
const LEAGUE_DRAFT= 'bbbbbbbb-0000-4000-b000-000000000002';
const SQUAD_A     = 'cccccccc-0000-4000-c000-000000000001';
const SQUAD_DRAFT = 'cccccccc-0000-4000-c000-000000000003';
const MATCHDAY    = 'TEST_429-r1';

// A player NOT in squad A yet (Germany — not at club cap)
const PLAYER_IN    = 'test-gk-ger-01';   // GK, £6.0, CLUB_GER
// A player to sell from squad A
const PLAYER_OUT   = 'test-mid-fra-01';  // MID, £6.0, CLUB_FRA

// 4th German player — would breach a club cap of 3
const GER_FOURTH   = 'test-def-ger-03';  // DEF, £4.5, CLUB_GER

describe('execute_transfer_atomic', () => {
  before(async () => { await getClient(); });
  after(async () => { await closeClient(); });

  // Each test runs inside a rolled-back transaction so the seed state is restored
  beforeEach(async () => { await beginTx(); });
  afterEach(async () => { await rollbackTx(); });

  // ── 1. Happy path — sell + buy (two separate calls) ─────────────────────────
  it('allows a sell then a buy when budget is sufficient', async () => {
    const sellResult = await callRpc('execute_transfer_atomic', {
      p_squad_id:    SQUAD_A,
      p_action:      'sell',
      p_player_id:   PLAYER_OUT,
      p_price:       6.0,
      p_league_id:   LEAGUE_CLS,
      p_matchday_id: MATCHDAY,
    }, { actingUserId: USER_A });
    assert.equal(sellResult?.ok, true, `Expected sell to succeed, got: ${JSON.stringify(sellResult)}`);

    const buyResult = await callRpc('execute_transfer_atomic', {
      p_squad_id:    SQUAD_A,
      p_action:      'buy',
      p_player_id:   PLAYER_IN,
      p_price:       6.0,
      p_league_id:   LEAGUE_CLS,
      p_matchday_id: MATCHDAY,
    }, { actingUserId: USER_A });
    assert.equal(buyResult?.ok, true, `Expected buy to succeed, got: ${JSON.stringify(buyResult)}`);

    // Verify squad array updated
    const squad = await queryOne('SELECT players FROM squads WHERE id = $1', [SQUAD_A]);
    assert.ok(squad.players.includes(PLAYER_IN),  'New player should be in squad');
    assert.ok(!squad.players.includes(PLAYER_OUT), 'Sold player should be removed');
  });

  // ── 2. Over-budget ──────────────────────────────────────────────────────────
  it('rejects a buy when player price exceeds remaining budget', async () => {
    // Drain budget first
    await query('UPDATE squads SET budget_remaining = 1.0 WHERE id = $1', [SQUAD_A]);

    const result = await callRpc('execute_transfer_atomic', {
      p_squad_id:    SQUAD_A,
      p_action:      'buy',
      p_player_id:   PLAYER_IN,  // costs £6.0 (server-priced, not from p_price)
      p_price:       6.0,
      p_league_id:   LEAGUE_CLS,
      p_matchday_id: MATCHDAY,
    }, { actingUserId: USER_A });

    assert.equal(result?.code, 'INSUFFICIENT_BUDGET',
      `Expected INSUFFICIENT_BUDGET, got: ${JSON.stringify(result)}`);
  });

  // ── 3. Club cap ─────────────────────────────────────────────────────────────
  it('rejects a buy that would exceed the caller-supplied club cap (4th player from same club)', async () => {
    // Pre-load 3 German players onto the squad to reach the cap
    await query(`
      UPDATE squads SET players = players
        || ARRAY['test-def-ger-01', 'test-def-ger-02', 'test-gk-ger-01']
      WHERE id = $1
    `, [SQUAD_A]);

    // p_club_max is supplied by the caller (process-transfer reads it from
    // get_club_cap() league_config-based) — the RPC itself does not read
    // league_config's 'club_cap' key.
    const result = await callRpc('execute_transfer_atomic', {
      p_squad_id:    SQUAD_A,
      p_action:      'buy',
      p_player_id:   GER_FOURTH,  // 4th German
      p_price:       4.5,
      p_club_max:    3,
      p_league_id:   LEAGUE_CLS,
      p_matchday_id: MATCHDAY,
    }, { actingUserId: USER_A });

    assert.equal(result?.code, 'CLUB_LIMIT',
      `Expected CLUB_LIMIT, got: ${JSON.stringify(result)}`);
  });

  // ── 4. Transfer window closed ────────────────────────────────────────────────
  // execute_transfer_atomic has no concept of the transfer window — that gate
  // is enforced by get_transfer_window_status(), called separately by the
  // process-transfer edge function before it ever calls this RPC. So this
  // test exercises get_transfer_window_status() directly rather than
  // expecting the RPC itself to reject.
  it('reports the window as not open once the round deadline has passed and no fixture has kicked off', async () => {
    await query(`
      UPDATE matchday_deadlines SET deadline_at = NOW() - INTERVAL '1 day'
      WHERE tournament_id = 'TEST_429' AND matchday_id = $1
    `, [MATCHDAY]);

    const status = await callRpc('get_transfer_window_status', { p_league_id: LEAGUE_CLS });

    assert.notEqual(status?.status, 'open',
      `Expected window to be closed/upcoming, got: ${JSON.stringify(status)}`);
  });

  // ── 5. Over-round-limit: penalty (not blocked) ───────────────────────────────
  it('allows an over-limit buy and records a penalty transfer', async () => {
    // Exhaust the free 3 transfers by faking round_transfers
    await query(`
      UPDATE squads SET round_transfers = $1::jsonb WHERE id = $2
    `, [JSON.stringify({ [MATCHDAY]: 3 }), SQUAD_A]);

    const result = await callRpc('execute_transfer_atomic', {
      p_squad_id:    SQUAD_A,
      p_action:      'buy',
      p_player_id:   PLAYER_IN,
      p_price:       6.0,
      p_league_id:   LEAGUE_CLS,
      p_matchday_id: MATCHDAY,
    }, { actingUserId: USER_A });

    // Should succeed (penalty is deducted at scoring, not here)
    assert.equal(result?.ok, true, `Expected success with penalty, got: ${JSON.stringify(result)}`);
    assert.equal(result?.penalty_buy, true, 'Expected penalty_buy flag to be true');

    const squad = await queryOne('SELECT penalty_transfers FROM squads WHERE id = $1', [SQUAD_A]);
    const penaltyCount = squad.penalty_transfers?.[MATCHDAY] ?? 0;
    assert.equal(penaltyCount, 1, 'penalty_transfers should be 1 after 1 over-limit buy');
  });

  // ── 6. Initial-build latch bypasses round limit ──────────────────────────────
  it('bypasses transfer limit while initial_build_complete is false', async () => {
    // Draft squad has initial_build_complete=false and only 8 players
    const result = await callRpc('execute_transfer_atomic', {
      p_squad_id:    SQUAD_DRAFT,
      p_action:      'buy',
      p_player_id:   'test-fwd-eng-02',
      p_price:       6.5,
      p_league_id:   LEAGUE_DRAFT,
      p_matchday_id: MATCHDAY,
    }, { actingUserId: USER_A });

    // Should succeed despite round_transfers being unset, because the latch is false
    assert.equal(result?.ok, true, `Expected success (latch bypass), got: ${JSON.stringify(result)}`);
  });
});
