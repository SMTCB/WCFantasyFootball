/**
 * score-tennis-tournament pure scoring logic — unit tests
 *
 * scorePlayer/rosterPlayerIds were already pure; scoreRoster was lifted out
 * of the inline per-roster loop in index.ts's Deno.serve handler (same shape,
 * same output) so the whole scoring model is unit-testable without a
 * Postgres connection — plain node:test against pure functions, imported
 * directly via Node's built-in TypeScript type-stripping (as with
 * snakeDraft.test.js).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  TIER_PTS, DEEP_ROUNDS, EARLY_EXIT,
  rosterPlayerIds, scorePlayer, scoreRoster,
} from '../../supabase/functions/score-tennis-tournament/scoring-logic.ts';

function makePlayer(id, tier, roundsWon, roundReached = null, name = id) {
  return { id, tier, rounds_won: roundsWon, round_reached: roundReached, player_name: name };
}

describe('scorePlayer', () => {
  it('scores each tier at its per-round rate', () => {
    assert.equal(scorePlayer(makePlayer('p', 1, 3), null, false), 3 * TIER_PTS[1]);
    assert.equal(scorePlayer(makePlayer('p', 2, 3), null, false), 3 * TIER_PTS[2]);
    assert.equal(scorePlayer(makePlayer('p', 3, 3), null, false), 3 * TIER_PTS[3]);
    assert.equal(scorePlayer(makePlayer('p', 4, 3), null, false), 3 * TIER_PTS[4]);
  });

  it('scores zero rounds won as zero points with no ace card', () => {
    assert.equal(scorePlayer(makePlayer('p', 4, 0), null, false), 0);
  });

  it('applies the dark_horse_insurance floor only for a T4 dark-horse slot with 0 wins', () => {
    assert.equal(scorePlayer(makePlayer('p', 4, 0), 'dark_horse_insurance', true), 6);
  });

  it('does not apply the dark_horse_insurance floor to a non-dark-horse slot', () => {
    assert.equal(scorePlayer(makePlayer('p', 4, 0), 'dark_horse_insurance', false), 0);
  });

  it('does not apply the dark_horse_insurance floor when the player already scored points', () => {
    assert.equal(scorePlayer(makePlayer('p', 4, 2), 'dark_horse_insurance', true), 2 * TIER_PTS[4]);
  });

  it('does not apply the floor when a different ace card is active', () => {
    assert.equal(scorePlayer(makePlayer('p', 4, 0), 'underdog_boost', true), 0);
  });
});

describe('rosterPlayerIds', () => {
  it('returns all seven slots in tier order, including nulls', () => {
    const roster = {
      tier1_player_id: 't1', tier2a_player_id: 't2a', tier2b_player_id: null,
      tier3a_player_id: 't3a', tier3b_player_id: 't3b',
      tier4a_player_id: 't4a', tier4b_player_id: 't4b',
    };
    assert.deepEqual(rosterPlayerIds(roster), ['t1', 't2a', null, 't3a', 't3b', 't4a', 't4b']);
  });
});

// ─── scoreRoster ────────────────────────────────────────────────────────────

function baseRoster(overrides = {}) {
  return {
    user_id: 'u1',
    tier1_player_id: 'p1', tier2a_player_id: 'p2a', tier2b_player_id: 'p2b',
    tier3a_player_id: 'p3a', tier3b_player_id: 'p3b',
    tier4a_player_id: 'p4a', tier4b_player_id: 'p4b',
    ace_card_type: null,
    ...overrides,
  };
}

function basePlayerMap() {
  return new Map([
    ['p1', makePlayer('p1', 1, 2)],
    ['p2a', makePlayer('p2a', 2, 2)],
    ['p2b', makePlayer('p2b', 2, 1)],
    ['p3a', makePlayer('p3a', 3, 1)],
    ['p3b', makePlayer('p3b', 3, 0)],
    ['p4a', makePlayer('p4a', 4, 0)],
    ['p4b', makePlayer('p4b', 4, 0)],
  ]);
}

describe('scoreRoster — baseline (no ace card, no captain)', () => {
  it('sums each slot at its tier rate with zero captain and ace bonus', () => {
    const roster = baseRoster();
    const playerMap = basePlayerMap();

    const { basePts, captainBonus, aceBonus, total, breakdown } = scoreRoster(roster, playerMap, null);

    const expectedBase =
      2 * TIER_PTS[1] + 2 * TIER_PTS[2] + 1 * TIER_PTS[2] +
      1 * TIER_PTS[3] + 0 * TIER_PTS[3] + 0 * TIER_PTS[4] + 0 * TIER_PTS[4];
    assert.equal(basePts, expectedBase);
    assert.equal(captainBonus, 0);
    assert.equal(aceBonus, 0);
    assert.equal(total, expectedBase);
    assert.equal(breakdown.players.length, 7);
    assert.equal(breakdown.ace_card_type, null);
    assert.equal(breakdown.captain_player_id, null);
  });

  it('skips a roster slot whose player id is not in playerMap', () => {
    const roster = baseRoster({ tier4b_player_id: null });
    const playerMap = basePlayerMap();
    playerMap.delete('p4b');

    const { breakdown } = scoreRoster(roster, playerMap, null);
    assert.equal(breakdown.players.length, 6);
  });
});

describe('scoreRoster — captain bonus', () => {
  it('doubles the captain player’s own contribution via captainBonus', () => {
    const roster = baseRoster();
    const playerMap = basePlayerMap(); // p1: tier 1, 2 rounds won -> 2*TIER_PTS[1]
    const captainId = 'p1';

    const { basePts, captainBonus, total } = scoreRoster(roster, playerMap, captainId);

    const p1Pts = 2 * TIER_PTS[1];
    assert.equal(captainBonus, p1Pts);
    assert.equal(total, basePts + captainBonus);
  });

  it('leaves captainBonus at zero when captainId matches no roster slot', () => {
    const roster = baseRoster();
    const playerMap = basePlayerMap();

    const { captainBonus } = scoreRoster(roster, playerMap, 'not-on-roster');
    assert.equal(captainBonus, 0);
  });
});

describe('scoreRoster — ace card: underdog_boost', () => {
  it('awards +15 when a T3/T4 player reached SF or better', () => {
    const roster = baseRoster({ ace_card_type: 'underdog_boost' });
    const playerMap = basePlayerMap();
    playerMap.set('p3a', makePlayer('p3a', 3, 4, 'sf'));

    const { aceBonus } = scoreRoster(roster, playerMap, null);
    assert.equal(aceBonus, 15);
  });

  it('awards nothing when only a T1/T2 player went deep', () => {
    const roster = baseRoster({ ace_card_type: 'underdog_boost' });
    const playerMap = basePlayerMap();
    playerMap.set('p1', makePlayer('p1', 1, 6, 'champion'));

    const { aceBonus } = scoreRoster(roster, playerMap, null);
    assert.equal(aceBonus, 0);
  });

  it('awards nothing when no T3/T4 player reached SF+', () => {
    const roster = baseRoster({ ace_card_type: 'underdog_boost' });
    const playerMap = basePlayerMap(); // p3/p4 round_reached is null

    const { aceBonus } = scoreRoster(roster, playerMap, null);
    assert.equal(aceBonus, 0);
  });
});

describe('scoreRoster — ace card: safety_net', () => {
  it('awards +8 when the T1 player exited in r128 or r64', () => {
    const roster = baseRoster({ ace_card_type: 'safety_net' });
    const playerMap = basePlayerMap();
    playerMap.set('p1', makePlayer('p1', 1, 0, 'r64'));

    const { aceBonus } = scoreRoster(roster, playerMap, null);
    assert.equal(aceBonus, 8);
  });

  it('awards nothing when the T1 player advanced past the early rounds', () => {
    const roster = baseRoster({ ace_card_type: 'safety_net' });
    const playerMap = basePlayerMap();
    playerMap.set('p1', makePlayer('p1', 1, 2, 'r32'));

    const { aceBonus } = scoreRoster(roster, playerMap, null);
    assert.equal(aceBonus, 0);
  });

  it('awards nothing when there is no tier1 slot filled', () => {
    const roster = baseRoster({ ace_card_type: 'safety_net', tier1_player_id: null });
    const playerMap = basePlayerMap();

    const { aceBonus } = scoreRoster(roster, playerMap, null);
    assert.equal(aceBonus, 0);
  });
});

describe('scoreRoster — ace card: surface_specialist', () => {
  it('awards +12 when the captain reached SF or better', () => {
    const roster = baseRoster({ ace_card_type: 'surface_specialist' });
    const playerMap = basePlayerMap();
    playerMap.set('p2a', makePlayer('p2a', 2, 5, 'runner_up'));

    const { aceBonus } = scoreRoster(roster, playerMap, 'p2a');
    assert.equal(aceBonus, 12);
  });

  it('awards nothing when there is no captain set', () => {
    const roster = baseRoster({ ace_card_type: 'surface_specialist' });
    const playerMap = basePlayerMap();

    const { aceBonus } = scoreRoster(roster, playerMap, null);
    assert.equal(aceBonus, 0);
  });

  it('awards nothing when the captain did not reach SF', () => {
    const roster = baseRoster({ ace_card_type: 'surface_specialist' });
    const playerMap = basePlayerMap();
    playerMap.set('p2a', makePlayer('p2a', 2, 1, 'r16'));

    const { aceBonus } = scoreRoster(roster, playerMap, 'p2a');
    assert.equal(aceBonus, 0);
  });
});

describe('scoreRoster — ace card: dark_horse_insurance', () => {
  it('is applied per-player inside basePts, not as a separate aceBonus', () => {
    const roster = baseRoster({ ace_card_type: 'dark_horse_insurance' });
    const playerMap = basePlayerMap(); // p4a and p4b both 0 rounds won

    const { basePts, aceBonus } = scoreRoster(roster, playerMap, null);

    const nonT4Base =
      2 * TIER_PTS[1] + 2 * TIER_PTS[2] + 1 * TIER_PTS[2] + 1 * TIER_PTS[3] + 0 * TIER_PTS[3];
    assert.equal(basePts, nonT4Base + 6 + 6); // both T4 slots floored to 6
    assert.equal(aceBonus, 0);
  });
});

describe('DEEP_ROUNDS / EARLY_EXIT', () => {
  it('DEEP_ROUNDS covers sf, runner_up, and champion only', () => {
    assert.equal(DEEP_ROUNDS.has('sf'), true);
    assert.equal(DEEP_ROUNDS.has('runner_up'), true);
    assert.equal(DEEP_ROUNDS.has('champion'), true);
    assert.equal(DEEP_ROUNDS.has('qf'), false);
  });

  it('EARLY_EXIT covers r128 and r64 only', () => {
    assert.equal(EARLY_EXIT.has('r128'), true);
    assert.equal(EARLY_EXIT.has('r64'), true);
    assert.equal(EARLY_EXIT.has('r32'), false);
  });
});
