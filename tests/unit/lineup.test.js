/**
 * set_lineup — unit tests (B2 / TEST-1)
 *
 * Real signature (confirmed against supabase/schema.sql):
 *   set_lineup(p_squad_id uuid, p_player_out text, p_player_in text) RETURNS jsonb
 *
 * Validation order inside the function (confirmed by reading the body):
 *   1. squad exists / auth.uid() ownership (UNAUTHORIZED)
 *   2. p_player_in must be in squad.players
 *   3. p_player_in must NOT be in lineup_locks[matchday_id] (PLAYER_LOCKED)
 *   4. p_player_in must NOT already be in starting_xi
 *   5. p_player_out MUST be in starting_xi
 *   6. p_player_in's own fixture must not be live/finished (FIXTURE_COMPLETED)
 *   7. resulting XI must satisfy GK=1, DEF>=1, MID>=1, FWD>=1
 *   8. point recompute (only if a pre-existing fantasy_points total row exists)
 *   9. lineup_locks updated for p_player_out IF p_player_out's own fixture is live/finished
 *
 * Covers:
 *  ✓ Happy path: bench player (no fixture) swapped into the XI
 *  ✓ Lock: subbing out a player whose fixture is live locks them; subbing them
 *    back in later in the same round is rejected with PLAYER_LOCKED
 *  ✓ Point recompute: subbing out a scored starter deducts the difference
 *    between the old and new total (see HARNESS LIMITATION note below)
 *
 * ── HARNESS LIMITATION (not a prod bug) ──────────────────────────────────────
 * fantasy_points.matchday_id has a CHECK constraint
 * ("fantasy_points_matchday_id_format", ~ '^[0-9]+-r[0-9]+$') requiring the
 * tournament-id portion to be purely numeric. This seed's tournament_id is
 * 'TEST_429' (contains letters), so its matchday_id 'TEST_429-r1' can never
 * satisfy that regex — any INSERT into fantasy_points with this seed's
 * matchday_id is rejected by Postgres (23514), confirmed empirically.
 * set_lineup's deduction logic is entirely gated on finding a pre-existing
 * fantasy_points row (`v_old_total IS NOT NULL`), so the deduction test below
 * temporarily drops that CHECK constraint — scoped to this test's own
 * transaction only, which is rolled back in afterEach exactly like every
 * other test here. This has no effect on any other test, the persistent
 * local schema, or (obviously) production. It is a workaround for a
 * seed/schema naming mismatch in the test harness itself, not a fix to any
 * real code path.
 */

import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { getClient, closeClient, beginTx, rollbackTx, callRpc, query, queryOne } from './helpers.js';

// ── Seed IDs (must match seed.sql) ───────────────────────────────────────────
const USER_A     = 'aaaaaaaa-0000-4000-a000-000000000001';
const SQUAD_A    = 'cccccccc-0000-4000-c000-000000000001';
const TOURNAMENT = 'TEST_429';
const MATCHDAY   = 'TEST_429-r1';
const FIXTURE    = 'test-fixture-0001';

// Bench candidate with NO seeded fixture (Germany has no fixture row at all)
const SAFE_BENCH = 'test-def-ger-01'; // DEF, CLUB_GER

describe('set_lineup', () => {
  before(async () => { await getClient(); });
  after(async () => { await closeClient(); });

  beforeEach(async () => { await beginTx(); });
  afterEach(async () => { await rollbackTx(); });

  // ── 1. Happy path — bench player (no fixture) swapped into the XI ──────────
  it('swaps a bench player into the starting XI', async () => {
    // Squad A has no bench at seed time (11 players = 11-man starting_xi),
    // so first add a spare player to the roster to swap in.
    await query(`
      UPDATE squads SET players = players || ARRAY[$1] WHERE id = $2
    `, [SAFE_BENCH, SQUAD_A]);

    const result = await callRpc('set_lineup', {
      p_squad_id:   SQUAD_A,
      p_player_out: 'test-mid-fra-01',
      p_player_in:  SAFE_BENCH,
    }, { actingUserId: USER_A });

    assert.equal(result?.ok, true, `Expected success, got: ${JSON.stringify(result)}`);

    const xi = result.starting_xi;
    assert.ok(xi.includes(SAFE_BENCH), 'New player should be in starting_xi');
    assert.ok(!xi.includes('test-mid-fra-01'), 'Benched player should be removed from starting_xi');

    // Formation check: DEF rises to 4, MID drops to 3 — still valid (>=1 each, GK=1)
    const squad = await queryOne('SELECT starting_xi FROM squads WHERE id = $1', [SQUAD_A]);
    assert.ok(squad.starting_xi.includes(SAFE_BENCH));
  });

  // ── 2. Lock: sub-out while live, then rejected on sub-back-in ──────────────
  it('locks a player subbed out while their fixture is live, blocking re-entry this round', async () => {
    await query(`
      UPDATE squads SET players = players || ARRAY[$1] WHERE id = $2
    `, [SAFE_BENCH, SQUAD_A]);

    // England (test-mid-eng-01's club) kicks off — mark the fixture live
    await query(`UPDATE fixtures SET status = 'live' WHERE id = $1`, [FIXTURE]);

    const first = await callRpc('set_lineup', {
      p_squad_id:   SQUAD_A,
      p_player_out: 'test-mid-eng-01',
      p_player_in:  SAFE_BENCH,
    }, { actingUserId: USER_A });

    assert.equal(first?.ok, true, `Expected first swap to succeed, got: ${JSON.stringify(first)}`);
    assert.equal(first?.locked, true, 'Benched player (live fixture) should be locked');

    const second = await callRpc('set_lineup', {
      p_squad_id:   SQUAD_A,
      p_player_out: SAFE_BENCH,
      p_player_in:  'test-mid-eng-01',
    }, { actingUserId: USER_A });

    assert.equal(second?.ok, false, 'Second swap should be rejected');
    assert.equal(second?.code, 'PLAYER_LOCKED',
      `Expected PLAYER_LOCKED, got: ${JSON.stringify(second)}`);
  });

  // ── 3. Point recompute — deduction on subbing out a scored starter ─────────
  it('deducts points when subbing out a starter who already has recorded stats', async () => {
    // See HARNESS LIMITATION note at the top of this file.
    await query(`ALTER TABLE fantasy_points DROP CONSTRAINT fantasy_points_matchday_id_format`);

    const originalXi = [
      'test-gk-arg-01', 'test-def-arg-01', 'test-def-arg-02', 'test-def-bra-01',
      'test-mid-bra-01', 'test-mid-bra-02', 'test-mid-eng-01',
      'test-fwd-eng-01', // captain
      'test-fwd-eng-02', 'test-fwd-fra-01', 'test-mid-fra-01',
    ];

    // 2 pts each for every original starter; captain doubles via the x2 multiplier
    for (const pid of originalXi) {
      await query(`
        INSERT INTO player_match_stats (fixture_id, player_id, fantasy_points)
        VALUES ($1, $2, 2)
      `, [FIXTURE, pid]);
    }

    // Pre-existing round total (as if the round had already been scored once).
    // Chosen higher than the recomputed new total so a positive deduction results.
    await query(`
      INSERT INTO fantasy_points (squad_id, matchday_id, player_id, total)
      VALUES ($1, $2, NULL, 30)
    `, [SQUAD_A, MATCHDAY]);

    await query(`
      UPDATE squads SET players = players || ARRAY[$1] WHERE id = $2
    `, [SAFE_BENCH, SQUAD_A]);

    // Swap out test-mid-fra-01 (2 pts, non-captain) for the bench player (no stats, 0 pts).
    // New total = (9 non-captain starters * 2) + (captain 2 * mult 2) + (bench 0) = 18 + 4 = 22.
    // Deduction = old(30) - new(22) = 8.
    const result = await callRpc('set_lineup', {
      p_squad_id:   SQUAD_A,
      p_player_out: 'test-mid-fra-01',
      p_player_in:  SAFE_BENCH,
    }, { actingUserId: USER_A });

    assert.equal(result?.ok, true, `Expected success, got: ${JSON.stringify(result)}`);
    assert.equal(result?.deduction, 8,
      `Expected deduction of 8 (30 - 22), got: ${JSON.stringify(result)}`);

    const fp = await queryOne(`
      SELECT total FROM fantasy_points
      WHERE squad_id = $1 AND matchday_id = $2 AND player_id IS NULL
    `, [SQUAD_A, MATCHDAY]);
    assert.equal(Number(fp.total), 22, 'Stored fantasy_points.total should be updated to the new total');
  });
});
