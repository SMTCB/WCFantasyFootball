// scoring-logic.js — pure, dependency-free scoring functions extracted from
// calculate-scores/index.js (CODE-7). No DB/network calls; safe to unit-test
// directly with Node's test runner and to import unchanged from the Deno function.

// ─── BPS ranking ───────────────────────────────────────────────────────────────

export function calcBPS(stats) {
  // Pass completion: only calculate if we have both accurate and total passes
  const totalPasses = stats.total_passes ?? 0;
  const accuratePasses = stats.accurate_passes ?? 0;
  const passCompletion = totalPasses > 0
    ? (accuratePasses / totalPasses) * 100
    : 0;

  return (
    (stats.goals            ?? 0) * 30   +
    (stats.assists          ?? 0) * 10   +
    (stats.minutes_played   ?? stats.minutes ?? 0) / 5 +
    (stats.tackles_won      ?? 0) * 1.5  +
    (stats.interceptions    ?? 0) * 1    +
    (stats.shots_on_target  ?? 0) * 3    +
    passCompletion * 0.1
  );
}

export function assignBonus(playerStatsList) {
  const ranked = [...playerStatsList].sort((a, b) => b.bps - a.bps);
  const bonusMap = { 0: 3, 1: 2, 2: 1 };
  ranked.forEach((p, i) => { p.bonus = bonusMap[i] ?? 0; });
}

// ─── Core scoring function ─────────────────────────────────────────────────────

export function scorePlayer(stats, position, POINTS, UNIVERSAL) {
  const pos   = (position || 'MID').toUpperCase();
  const rules = POINTS[pos] || POINTS.MID;
  const mins  = stats.minutes_played ?? stats.minutes ?? 0;
  let pts = 0;

  pts += (mins / 60) * UNIVERSAL.minute_per_90;
  pts += (stats.goals   ?? 0) * rules.goal;
  pts += (stats.assists ?? 0) * rules.assist;

  // GK and DEF clean sheet require 45+ min; MID keeps the 60-min gate
  const csMinThreshold = (pos === 'DEF' || pos === 'GK') ? 45 : 60;
  if (stats.clean_sheet && mins >= csMinThreshold && rules.clean_sheet > 0) {
    pts += rules.clean_sheet;
  }

  // Goals conceded beyond the first incur a penalty for GK/DEF — only if the player actually appeared
  if (mins > 0) {
    const concededBeyondFirst = Math.max(0, (stats.goals_conceded ?? 0) - 1);
    pts += concededBeyondFirst * (rules.conceded_2plus_penalty ?? 0);
  }

  pts += (stats.penalty_saved  ?? 0) * (rules.penalty_saved  ?? 0);
  pts += (stats.own_goals      ?? 0) * UNIVERSAL.own_goal;
  pts += (stats.yellow_cards   ?? 0) * UNIVERSAL.yellow_card;
  pts += (stats.red_cards      ?? 0) * UNIVERSAL.red_card;
  pts += (stats.penalty_missed ?? 0) * UNIVERSAL.penalty_missed;

  pts += (stats.tackles_won        ?? 0) * (rules.tackle            ?? 0);
  pts += (stats.interceptions      ?? 0) * (rules.interception       ?? 0);
  pts += (stats.penalty_scored     ?? 0) * (rules.penalty_scored     ?? 0);
  pts += (stats.saves              ?? 0) * (rules.save               ?? 0);
  pts += (stats.key_passes         ?? 0) * (rules.key_pass           ?? 0);
  pts += (stats.shots_on_target    ?? 0) * (rules.shot_on_target     ?? 0);
  pts += (stats.big_chances_created ?? 0) * (rules.big_chance_created ?? 0);

  // Penalty shootout — separate from regular penalty scoring
  pts += (stats.shootout_scored ?? 0) * (UNIVERSAL.shootout_scored ?? 0);
  pts += (stats.shootout_missed ?? 0) * (UNIVERSAL.shootout_missed ?? 0);
  pts += (stats.shootout_saved  ?? 0) * (UNIVERSAL.shootout_saved  ?? 0);

  return Math.round(pts * 100) / 100;
}

export function buildBreakdown(stats, pos, POINTS, UNIVERSAL) {
  const p     = (pos || 'MID').toUpperCase();
  const rules = POINTS[p] || POINTS.MID;
  const mins  = stats.minutes_played ?? stats.minutes ?? 0;
  return {
    minutes:           Math.round((mins / 60) * UNIVERSAL.minute_per_90 * 100) / 100,
    goals:             (stats.goals              ?? 0) * rules.goal,
    assists:           (stats.assists            ?? 0) * rules.assist,
    clean_sheet:       (stats.clean_sheet && mins >= ((p === 'DEF' || p === 'GK') ? 45 : 60) && rules.clean_sheet > 0) ? rules.clean_sheet : 0,
    goals_conceded:    mins > 0 ? Math.max(0, (stats.goals_conceded ?? 0) - 1) * (rules.conceded_2plus_penalty ?? 0) : 0,
    own_goals:         (stats.own_goals          ?? 0) * UNIVERSAL.own_goal,
    yellow_cards:      (stats.yellow_cards       ?? 0) * UNIVERSAL.yellow_card,
    red_cards:         (stats.red_cards          ?? 0) * UNIVERSAL.red_card,
    penalty_saved:     (stats.penalty_saved      ?? 0) * (rules.penalty_saved      ?? 0),
    penalty_scored:    (stats.penalty_scored     ?? 0) * (rules.penalty_scored     ?? 0),
    penalty_missed:    (stats.penalty_missed     ?? 0) * UNIVERSAL.penalty_missed,
    tackles:           (stats.tackles_won        ?? 0) * (rules.tackle             ?? 0),
    interceptions:     (stats.interceptions      ?? 0) * (rules.interception       ?? 0),
    saves:             (stats.saves              ?? 0) * (rules.save               ?? 0),
    key_passes:        (stats.key_passes         ?? 0) * (rules.key_pass           ?? 0),
    shots_on_target:   (stats.shots_on_target    ?? 0) * (rules.shot_on_target     ?? 0),
    big_chances:       (stats.big_chances_created ?? 0) * (rules.big_chance_created ?? 0),
    // Penalty shootout
    ...(((stats.shootout_scored ?? 0) || (stats.shootout_missed ?? 0) || (stats.shootout_saved ?? 0)) ? {
      shootout_scored: (stats.shootout_scored ?? 0) * (UNIVERSAL.shootout_scored ?? 0),
      shootout_missed: (stats.shootout_missed ?? 0) * (UNIVERSAL.shootout_missed ?? 0),
      shootout_saved:  (stats.shootout_saved  ?? 0) * (UNIVERSAL.shootout_saved  ?? 0),
    } : {}),
  };
}

// ─── Auto-sub helpers (#17) ────────────────────────────────────────────────────
// Formation: exactly 1 GK, at least 1 DEF/MID/FWD (11 total).

export function isValidFormation(ids, posLookup) {
  const c = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  for (const id of ids) { const p = posLookup[id]; if (c[p] !== undefined) c[p]++; }
  return c.GK === 1 && c.DEF >= 1 && c.MID >= 1
      && c.FWD >= 1 && (c.GK + c.DEF + c.MID + c.FWD) === ids.length;
}

// Replace DNP starters (0 minutes) with the highest-priority bench player who played,
// keeping the formation valid. Bench priority = order in the squad's players array.
export function applyAutoSubs(pitch, bench, minutesLookup, posLookup) {
  const played = (id) => (minutesLookup[id] ?? 0) > 0;
  const xi = [...pitch];
  const usedBench = new Set();
  for (let i = 0; i < xi.length; i++) {
    if (played(xi[i])) continue;                 // starter played — keep
    for (const b of bench) {                     // find a played bench replacement
      if (usedBench.has(b) || !played(b)) continue;
      const candidate = [...xi]; candidate[i] = b;
      if (isValidFormation(candidate, posLookup)) { xi[i] = b; usedBench.add(b); break; }
    }
  }
  return xi;
}
