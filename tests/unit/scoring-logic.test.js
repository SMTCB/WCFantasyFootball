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
  topScorer, resolveEffectiveCaptain, scoreSquadTotal,
} from '../../supabase/functions/calculate-scores/scoring-logic.js';

const POINTS = {
  GK:  { goal: 5, assist: 3, clean_sheet: 4, penalty_saved: 5, save: 0.5,  tackle: 0,   interception: 0,    penalty_scored: 0, key_pass: 0,    shot_on_target: 0,    big_chance_created: 0, conceded_2plus_penalty: -1 },
  DEF: { goal: 5, assist: 2, clean_sheet: 4, penalty_saved: 0, save: 0,    tackle: 0.5, interception: 0.25, penalty_scored: 0, key_pass: 0,    shot_on_target: 0,    big_chance_created: 0,  conceded_2plus_penalty: -1 },
  MID: { goal: 4, assist: 2, clean_sheet: 0, penalty_saved: 0, save: 0,    tackle: 0,   interception: 0,    penalty_scored: 0, key_pass: 0.25, shot_on_target: 0.5,  big_chance_created: 0 },
  FWD: { goal: 4, assist: 2, clean_sheet: 0, penalty_saved: 0, save: 0,    tackle: 0,   interception: 0,    penalty_scored: 0, key_pass: 0,    shot_on_target: 0.25, big_chance_created: 1.0 },
};

const UNIVERSAL = {
  appearance:       1,
  minutes_60_bonus: 1,
  own_goal:        -2,
  yellow_card:     -1,
  red_card:        -3,
  penalty_missed:  -2,
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
    assert.equal(pts, 1 + 4); // appearance (no 60-min bonus below 60) + clean sheet
  });

  it('withholds DEF clean sheet bonus below the 45-minute threshold', () => {
    const pts = scorePlayer({ minutes_played: 44, clean_sheet: true }, 'DEF', POINTS, UNIVERSAL);
    assert.equal(pts, 1); // appearance only — below both the 45-min CS gate and the 60-min bonus
  });

  it('requires 60+ minutes for a MID clean sheet (no clean_sheet points configured anyway)', () => {
    const pts = scorePlayer({ minutes_played: 60, clean_sheet: true, goals: 1 }, 'MID', POINTS, UNIVERSAL);
    assert.equal(pts, 1 + 1 + 4); // appearance + 60-min bonus + goal, no clean_sheet rule for MID
  });

  it('penalizes goals conceded beyond the first for an outfield player who appeared', () => {
    const pts = scorePlayer({ minutes_played: 90, goals_conceded: 3 }, 'DEF', POINTS, UNIVERSAL);
    // appearance + 60-min bonus + (3-1)*-1 conceded penalty
    assert.equal(pts, 1 + 1 + 2 * -1);
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
    // appearance + 60-min bonus + red card (supersedes yellow) + own goal + penalty missed
    assert.equal(pts, 1 + 1 + (-3) + (-2) + (-2));
  });

  it('scores penalty shootout events independently of in-match penalties', () => {
    const pts = scorePlayer(
      { minutes_played: 90, shootout_scored: 1, shootout_missed: 1 },
      'FWD', POINTS, UNIVERSAL,
    );
    assert.equal(pts, 1 + 1 + 1 + (-1)); // appearance + 60-min bonus + shootout scored/missed
  });

  it('does not subtract penalty_scored from goals — stats.goals already excludes penalty conversions (regression for the MD1 Guirassy/Suárez/Tresoldi bug)', () => {
    const pts = scorePlayer(
      { minutes_played: 90, goals: 1, penalty_scored: 1 },
      'FWD', POINTS, UNIVERSAL,
    );
    // appearance + 60-min bonus + goal (full rate, not zeroed by the penalty) + penalty_scored (rule value 0 in this fixture)
    assert.equal(pts, 1 + 1 + 4 + 0);
  });

  it('rounds to 2 decimal places', () => {
    // key_pass at 0.1 (not a real rule value, chosen to force float imprecision:
    // 3 * 0.1 === 0.30000000000000004 in raw JS arithmetic) exercises the
    // Math.round(pts * 100) / 100 step in scorePlayer.
    const pointsWithFraction = { MID: { ...POINTS.MID, key_pass: 0.1 } };
    const pts = scorePlayer(
      { minutes_played: 90, key_passes: 3 },
      'MID', pointsWithFraction, UNIVERSAL,
    );
    assert.equal(pts, 2.3); // appearance(1) + 60-min bonus(1) + 3*0.1
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

  it('credits full goal points in the breakdown even when penalty_scored is also present', () => {
    const breakdown = buildBreakdown({ minutes_played: 90, goals: 1, penalty_scored: 1 }, 'FWD', POINTS, UNIVERSAL);
    assert.equal(breakdown.goals, 4);
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

// ── Chips: Triple Captain / Max Cap / Joker ×2 ──────────────────────────────

describe('chip maths', () => {
  const xi = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k'];
  const pts = { a: 2, b: 9, c: 4.6, d: 0, e: -2, f: 1, g: 3, h: 3, i: 1, j: 5, k: 0, out: 7.4, outNeg: -3 };

  it('baseline: captain ×2, no chips', () => {
    const { effectiveCaptainId } = resolveEffectiveCaptain({ captainId: 'b', pitchPlayers: xi, roundPoints: pts });
    const { total } = scoreSquadTotal({ pitchPlayers: xi, roundPoints: pts, effectiveCaptainId });
    // sum of rounded = 2+9+5+0-2+1+3+3+1+5+0 = 27, captain b adds another 9
    assert.equal(effectiveCaptainId, 'b');
    assert.equal(total, 36);
  });

  it('Triple Captain: captain ×3', () => {
    const { total } = scoreSquadTotal({ pitchPlayers: xi, roundPoints: pts, effectiveCaptainId: 'b', isTripleCaptain: true });
    assert.equal(total, 27 + 18);
  });

  it('Max Cap ignores the manager\'s captain and picks the top scorer', () => {
    const r = resolveEffectiveCaptain({ captainId: 'a', pitchPlayers: xi, roundPoints: pts, isMaxCap: true });
    assert.deepEqual(r, { effectiveCaptainId: 'b', moved: false });
    assert.equal(scoreSquadTotal({ pitchPlayers: xi, roundPoints: pts, effectiveCaptainId: 'b' }).total, 36);
  });

  it('Max Cap with no manager captain set still works', () => {
    assert.equal(resolveEffectiveCaptain({ captainId: null, pitchPlayers: xi, roundPoints: pts, isMaxCap: true }).effectiveCaptainId, 'b');
  });

  it('Max Cap: nobody above 0 → no captain bonus (never amplifies a loss)', () => {
    const bad = Object.fromEntries(xi.map(id => [id, -1]));
    assert.equal(resolveEffectiveCaptain({ captainId: 'a', pitchPlayers: xi, roundPoints: bad, isMaxCap: true }).effectiveCaptainId, null);
    assert.equal(topScorer(xi, { a: 0 }), null);
  });

  it('Max Cap tie: first starter in XI order wins (deterministic)', () => {
    assert.equal(topScorer(['x', 'y'], { x: 5, y: 5 }), 'x');
  });

  it('captain outside the XI → bonus moves to top positive scorer and is flagged', () => {
    const r = resolveEffectiveCaptain({ captainId: 'benched', pitchPlayers: xi, roundPoints: pts });
    assert.deepEqual(r, { effectiveCaptainId: 'b', moved: true });
  });

  it('Triple Captain + moved captain: ×3 follows the new captain', () => {
    const { effectiveCaptainId } = resolveEffectiveCaptain({ captainId: 'benched', pitchPlayers: xi, roundPoints: pts });
    assert.equal(scoreSquadTotal({ pitchPlayers: xi, roundPoints: pts, effectiveCaptainId, isTripleCaptain: true }).total, 27 + 18);
  });

  it('Joker: outside player counts ×2 on top of the XI (rounded first)', () => {
    const { total } = scoreSquadTotal({ pitchPlayers: xi, roundPoints: pts, effectiveCaptainId: 'b', jokerPid: 'out' });
    assert.equal(total, 36 + Math.round(7.4) * 2);   // +14
  });

  it('Joker can lose points if the picked player scores negatively', () => {
    const { total } = scoreSquadTotal({ pitchPlayers: xi, roundPoints: pts, effectiveCaptainId: 'b', jokerPid: 'outNeg' });
    assert.equal(total, 36 - 6);
  });

  it('Joker who did not play (no stats) adds 0', () => {
    assert.equal(scoreSquadTotal({ pitchPlayers: xi, roundPoints: pts, effectiveCaptainId: 'b', jokerPid: 'ghost' }).total, 36);
  });

  it('legacy guard: a Joker already in the XI is not double counted', () => {
    assert.equal(scoreSquadTotal({ pitchPlayers: xi, roundPoints: pts, effectiveCaptainId: 'b', jokerPid: 'g' }).total, 36);
  });

  it('Triple Captain + Joker together are independent', () => {
    const { total } = scoreSquadTotal({ pitchPlayers: xi, roundPoints: pts, effectiveCaptainId: 'b', isTripleCaptain: true, jokerPid: 'out' });
    assert.equal(total, 45 + 14);
  });

  it('NaN points are treated as 0 and reported', () => {
    const r = scoreSquadTotal({ pitchPlayers: ['a', 'z'], roundPoints: { a: 3, z: NaN }, effectiveCaptainId: 'a' });
    assert.equal(r.total, 6);
    assert.deepEqual(r.nanPlayers, ['z']);
  });

  it('regression: with no chips the new maths equals the pre-chips algorithm on 2,000 random squads', () => {
    // Verbatim copy of the previous in-line logic (captain ×2/×3, reassignment, joker ×1 removed
    // because jokers did not exist in these inputs).
    function legacy({ captainId, pitch, round, triple }) {
      let eff = captainId;
      if (captainId && !pitch.includes(captainId)) {
        let best = null, bestRaw = 0;
        for (const pid of pitch) { const raw = round[pid] ?? 0; if (raw > bestRaw) { bestRaw = raw; best = pid; } }
        eff = best;
      }
      let total = 0;
      for (const pid of pitch) total += Math.round(round[pid] ?? 0) * (pid === eff ? (triple ? 3 : 2) : 1);
      return total;
    }
    let seed = 42; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
    for (let i = 0; i < 2000; i++) {
      const round = {};
      const pitch = Array.from({ length: 11 }, (_, k) => `p${k}`);
      for (const id of [...pitch, 'bench1']) round[id] = rnd() < 0.15 ? 0 : Math.round((rnd() * 24 - 4) * 4) / 4;
      const captainId = rnd() < 0.2 ? 'bench1' : rnd() < 0.1 ? null : pitch[Math.floor(rnd() * 11)];
      const triple = rnd() < 0.3;
      const { effectiveCaptainId } = resolveEffectiveCaptain({ captainId, pitchPlayers: pitch, roundPoints: round });
      const got = scoreSquadTotal({ pitchPlayers: pitch, roundPoints: round, effectiveCaptainId, isTripleCaptain: triple }).total;
      assert.equal(got, legacy({ captainId, pitch, round, triple }), `mismatch at iteration ${i}`);
    }
  });
});
