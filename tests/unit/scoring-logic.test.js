/**
 * calculate-scores pure scoring logic — unit tests (CODE-7)
 *
 * These functions have zero DB/network calls (extracted verbatim from
 * supabase/functions/calculate-scores/index.js into scoring-logic.js), so unlike
 * the other tests/unit/*.test.js files, no Postgres connection is needed here —
 * plain node:test against pure functions.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calcBPS, assignBonus, scorePlayer, buildBreakdown,
  isValidFormation, applyAutoSubs,
} from '../../supabase/functions/calculate-scores/scoring-logic.js';

const POINTS = {
  GK:  { goal: 5, assist: 3, clean_sheet: 4, penalty_saved: 5, save: 0.5,  tackle: 0,   interception: 0,    penalty_scored: 0, key_pass: 0,    shot_on_target: 0,    big_chance_created: 0, conceded_2plus_penalty: -1 },
  DEF: { goal: 5, assist: 2, clean_sheet: 4, penalty_saved: 0, save: 0,    tackle: 0.5, interception: 0.25, penalty_scored: 0, key_pass: 0,    shot_on_target: 0,    big_chance_created: 0,  conceded_2plus_penalty: -1 },
  MID: { goal: 4, assist: 2, clean_sheet: 0, penalty_saved: 0, save: 0,    tackle: 0,   interception: 0,    penalty_scored: 0, key_pass: 0.25, shot_on_target: 0.5,  big_chance_created: 0 },
  FWD: { goal: 4, assist: 2, clean_sheet: 0, penalty_saved: 0, save: 0,    tackle: 0,   interception: 0,    penalty_scored: 0, key_pass: 0,    shot_on_target: 0.25, big_chance_created: 1.0 },
};

const UNIVERSAL = {
  minute_per_90:   1,
  own_goal:        -2,
  yellow_card:     -1,
  red_card:        -3,
  penalty_missed:  -1,
  shootout_scored: 1,
  shootout_missed: -1,
  shootout_saved:  0.5,
};

describe('calcBPS', () => {
  it('weighs goals, assists, minutes, defensive actions, and pass completion', () => {
    const bps = calcBPS({
      goals: 1, assists: 1, minutes_played: 90,
      tackles_won: 2, interceptions: 1, shots_on_target: 1,
      total_passes: 50, accurate_passes: 45,
    });
    // 30 + 10 + 18 + 3 + 1 + 3 + (90*0.1=9) = 74
    assert.equal(bps, 74);
  });

  it('treats missing stats as zero and skips pass completion when total_passes is 0', () => {
    assert.equal(calcBPS({}), 0);
  });

  it('falls back to `minutes` when `minutes_played` is absent', () => {
    assert.equal(calcBPS({ minutes: 30 }), 6); // 30/5
  });
});

describe('assignBonus', () => {
  it('awards 3/2/1 to the top three BPS scores', () => {
    const list = [{ id: 'a', bps: 10 }, { id: 'b', bps: 30 }, { id: 'c', bps: 20 }, { id: 'd', bps: 5 }];
    assignBonus(list);
    assert.equal(list.find(p => p.id === 'b').bonus, 3);
    assert.equal(list.find(p => p.id === 'c').bonus, 2);
    assert.equal(list.find(p => p.id === 'a').bonus, 1);
    assert.equal(list.find(p => p.id === 'd').bonus, 0);
  });

  it('breaks ties by original list order (stable sort)', () => {
    const list = [{ id: 'first', bps: 15 }, { id: 'second', bps: 15 }];
    assignBonus(list);
    assert.equal(list.find(p => p.id === 'first').bonus, 3);
    assert.equal(list.find(p => p.id === 'second').bonus, 2);
  });

  it('does not mutate the input array order (sorts a copy)', () => {
    const list = [{ id: 'a', bps: 1 }, { id: 'b', bps: 99 }];
    assignBonus(list);
    assert.equal(list[0].id, 'a');
    assert.equal(list[1].id, 'b');
  });
});

describe('scorePlayer', () => {
  it('scores a DEF clean sheet at 45+ minutes', () => {
    const pts = scorePlayer({ minutes_played: 45, clean_sheet: true }, 'DEF', POINTS, UNIVERSAL);
    assert.equal(pts, 0.75 + 4); // 45/60 minute credit + clean sheet
  });

  it('withholds DEF clean sheet bonus below the 45-minute threshold', () => {
    const pts = scorePlayer({ minutes_played: 44, clean_sheet: true }, 'DEF', POINTS, UNIVERSAL);
    assert.equal(pts, Math.round((44 / 60) * 100) / 100);
  });

  it('requires 60+ minutes for a MID clean sheet (no clean_sheet points configured anyway)', () => {
    const pts = scorePlayer({ minutes_played: 60, clean_sheet: true, goals: 1 }, 'MID', POINTS, UNIVERSAL);
    assert.equal(pts, 1 + 4); // minute credit (60/60) + goal, no clean_sheet rule for MID
  });

  it('penalizes goals conceded beyond the first for an outfield player who appeared', () => {
    const pts = scorePlayer({ minutes_played: 90, goals_conceded: 3 }, 'DEF', POINTS, UNIVERSAL);
    // minute credit 90/60=1.5 + (3-1)*-1 conceded penalty
    assert.equal(pts, 1.5 + 2 * -1);
  });

  it('applies no conceded penalty for a player with 0 minutes (did not play)', () => {
    const pts = scorePlayer({ minutes_played: 0, goals_conceded: 5 }, 'DEF', POINTS, UNIVERSAL);
    assert.equal(pts, 0);
  });

  it('applies cards, own goals, and missed penalties as universal deductions', () => {
    const pts = scorePlayer(
      { minutes_played: 90, yellow_cards: 1, red_cards: 1, own_goals: 1, penalty_missed: 1 },
      'MID', POINTS, UNIVERSAL,
    );
    assert.equal(pts, 1.5 + (-1) + (-3) + (-2) + (-1));
  });

  it('scores penalty shootout events independently of in-match penalties', () => {
    const pts = scorePlayer(
      { minutes_played: 90, shootout_scored: 1, shootout_missed: 1 },
      'FWD', POINTS, UNIVERSAL,
    );
    assert.equal(pts, 1.5 + 1 + (-1));
  });

  it('rounds to 2 decimal places', () => {
    const pts = scorePlayer({ minutes_played: 37 }, 'MID', POINTS, UNIVERSAL);
    assert.equal(pts, Math.round((37 / 60) * 100) / 100);
  });
});

describe('buildBreakdown', () => {
  it('produces a per-category breakdown consistent with scorePlayer for the same stats', () => {
    const stats = { minutes_played: 90, goals: 2, assists: 1, clean_sheet: true, yellow_cards: 1 };
    const total = scorePlayer(stats, 'FWD', POINTS, UNIVERSAL);
    const breakdown = buildBreakdown(stats, 'FWD', POINTS, UNIVERSAL);
    const summed = Object.values(breakdown).reduce((a, b) => a + b, 0);
    assert.equal(Math.round(summed * 100) / 100, total);
  });

  it('omits shootout keys entirely when no shootout stats are present', () => {
    const breakdown = buildBreakdown({ minutes_played: 90 }, 'MID', POINTS, UNIVERSAL);
    assert.equal('shootout_scored' in breakdown, false);
    assert.equal('shootout_missed' in breakdown, false);
    assert.equal('shootout_saved' in breakdown, false);
  });

  it('includes shootout keys when any shootout stat is present', () => {
    const breakdown = buildBreakdown({ minutes_played: 90, shootout_saved: 2 }, 'GK', POINTS, UNIVERSAL);
    assert.equal(breakdown.shootout_saved, 1); // 2 * 0.5
    assert.equal(breakdown.shootout_scored, 0);
  });
});

// ─── Formation / auto-subs ──────────────────────────────────────────────────────

const posLookup = {
  gk1: 'GK',
  d1: 'DEF', d2: 'DEF', d3: 'DEF', d4: 'DEF', d5: 'DEF',
  m1: 'MID', m2: 'MID', m3: 'MID', m4: 'MID',
  f1: 'FWD', f2: 'FWD', f3: 'FWD',
};

describe('isValidFormation', () => {
  it('accepts a valid 1-4-4-2', () => {
    const xi = ['gk1', 'd1', 'd2', 'd3', 'd4', 'm1', 'm2', 'm3', 'm4', 'f1', 'f2'];
    assert.equal(isValidFormation(xi, posLookup), true);
  });

  it('rejects a formation with 2 goalkeepers', () => {
    const xi = ['gk1', 'd1', 'd2', 'd3', 'd4', 'm1', 'm2', 'm3', 'm4', 'f1', 'd5'];
    // d5 relabeled as GK-count won't apply since posLookup says DEF — use a genuine 2-GK case instead
    const posLookupTwoGk = { ...posLookup, d5: 'GK' };
    assert.equal(isValidFormation(xi, posLookupTwoGk), false);
  });

  it('rejects a formation with zero forwards', () => {
    const posLookupExtraMid = { ...posLookup, m5: 'MID' };
    const xi = ['gk1', 'd1', 'd2', 'd3', 'd4', 'd5', 'm1', 'm2', 'm3', 'm4', 'm5'];
    assert.equal(isValidFormation(xi, posLookupExtraMid), false);
  });
});

describe('applyAutoSubs', () => {
  it('replaces a DNP starter with the first played bench player that keeps a valid formation', () => {
    const pitch = ['gk1', 'd1', 'd2', 'd3', 'd4', 'm1', 'm2', 'm3', 'm4', 'f1', 'f2'];
    const bench = ['f3', 'd5'];
    const minutesLookup = { gk1: 90, d1: 90, d2: 90, d3: 90, d4: 90, m1: 90, m2: 90, m3: 90, m4: 90, f1: 0, f2: 90, f3: 90, d5: 0 };
    const result = applyAutoSubs(pitch, bench, minutesLookup, posLookup);
    assert.deepEqual(result, ['gk1', 'd1', 'd2', 'd3', 'd4', 'm1', 'm2', 'm3', 'm4', 'f3', 'f2']);
  });

  it('leaves a DNP starter in place when the only played bench player would drop that position below the 1-player minimum', () => {
    // f1 is the squad's only forward — subbing in a MID for it would leave FWD=0, invalid.
    const extendedPosLookup = { ...posLookup, x1: 'MID' };
    const pitch = ['gk1', 'd1', 'd2', 'd3', 'd4', 'd5', 'm1', 'm2', 'm3', 'm4', 'f1'];
    const bench = ['x1'];
    const minutesLookup = {
      gk1: 90, d1: 90, d2: 90, d3: 90, d4: 90, d5: 90,
      m1: 90, m2: 90, m3: 90, m4: 90, f1: 0, x1: 90,
    };
    const result = applyAutoSubs(pitch, bench, minutesLookup, extendedPosLookup);
    assert.deepEqual(result, pitch);
  });

  it('does not reuse the same bench player for two DNP starters', () => {
    const pitch = ['gk1', 'd1', 'd2', 'd3', 'd4', 'm1', 'm2', 'm3', 'm4', 'f1', 'f2'];
    const bench = ['f3'];
    const minutesLookup = { gk1: 90, d1: 90, d2: 90, d3: 90, d4: 90, m1: 90, m2: 90, m3: 90, m4: 90, f1: 0, f2: 0, f3: 90 };
    const result = applyAutoSubs(pitch, bench, minutesLookup, posLookup);
    // only one of f1/f2 can be replaced by the single played bench forward
    const dnpStillOut = ['f1', 'f2'].filter(id => !result.includes(id));
    assert.equal(dnpStillOut.length, 1);
    assert.equal(result.includes('f3'), true);
  });

  it('leaves starters who played untouched', () => {
    const pitch = ['gk1', 'd1', 'd2', 'd3', 'd4', 'm1', 'm2', 'm3', 'm4', 'f1', 'f2'];
    const bench = ['f3'];
    const minutesLookup = { gk1: 90, d1: 90, d2: 90, d3: 90, d4: 90, m1: 90, m2: 90, m3: 90, m4: 90, f1: 90, f2: 90, f3: 90 };
    const result = applyAutoSubs(pitch, bench, minutesLookup, posLookup);
    assert.deepEqual(result, pitch);
  });
});
