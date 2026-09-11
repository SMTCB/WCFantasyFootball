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

  // Appearance + 60-minute bonus (replaces the old per-90-minute rate)
  if (mins > 0)   pts += UNIVERSAL.appearance ?? 0;
  if (mins >= 60) pts += UNIVERSAL.minutes_60_bonus ?? 0;
  // stats.goals already excludes penalty conversions — ingest-match-events only
  // increments it for non-penalty goals (see ingest-match-events/index.js, the
  // `!isPenalty` guard on goalsMap). Penalty conversions score separately via the
  // flat penalty_scored rate below, so no subtraction is needed here.
  pts += (stats.goals ?? 0) * rules.goal;
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

  // Card Accumulation Rule: a red card always supersedes any yellow(s) in the same
  // match — capped at -3 total, never stacked. Forza's data can't distinguish a
  // two-yellow send-off from a separate straight red, so both collapse to red-only.
  if ((stats.red_cards ?? 0) > 0) {
    pts += UNIVERSAL.red_card;
  } else {
    pts += (stats.yellow_cards ?? 0) * UNIVERSAL.yellow_card;
  }

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
  const hasRed = (stats.red_cards ?? 0) > 0;
  return {
    appearance:        mins > 0 ? (UNIVERSAL.appearance ?? 0) : 0,
    minutes_bonus:     mins >= 60 ? (UNIVERSAL.minutes_60_bonus ?? 0) : 0,
    // See scorePlayer(): stats.goals already excludes penalty conversions, which
    // score separately via penalty_scored below — no subtraction needed here.
    goals:             (stats.goals ?? 0) * rules.goal,
    assists:           (stats.assists            ?? 0) * rules.assist,
    clean_sheet:       (stats.clean_sheet && mins >= ((p === 'DEF' || p === 'GK') ? 45 : 60) && rules.clean_sheet > 0) ? rules.clean_sheet : 0,
    goals_conceded:    mins > 0 ? Math.max(0, (stats.goals_conceded ?? 0) - 1) * (rules.conceded_2plus_penalty ?? 0) : 0,
    own_goals:         (stats.own_goals          ?? 0) * UNIVERSAL.own_goal,
    // Card Accumulation Rule — see scorePlayer(): red supersedes yellow, no stacking.
    yellow_cards:      hasRed ? 0 : (stats.yellow_cards ?? 0) * UNIVERSAL.yellow_card,
    red_cards:         hasRed ? UNIVERSAL.red_card : 0,
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

// Guaranteed-valid XI picker (mirrors LiveScreen.jsx's client-side pickValidStarters).
// Used whenever a stored/derived starting XI is missing or fails isValidFormation —
// e.g. a squad whose starting_xi was never set, so the naive "first 11 owned players"
// fallback landed on a lineup with 0 (or 2+) GKs. Selects exactly 1 GK + 1 each of
// DEF/MID/FWD first, then fills the rest in squad-list order, skipping extra GKs.
export function pickValidStarters(playerIds, posLookup) {
  const byPos = { GK: [], DEF: [], MID: [], FWD: [] };
  for (const id of playerIds) {
    const pos = posLookup[id];
    if (byPos[pos]) byPos[pos].push(id);
  }
  const starters = new Set();
  if (byPos.GK.length)  starters.add(byPos.GK[0]);
  if (byPos.DEF.length) starters.add(byPos.DEF[0]);
  if (byPos.MID.length) starters.add(byPos.MID[0]);
  if (byPos.FWD.length) starters.add(byPos.FWD[0]);
  const gkAlreadyIn = byPos.GK.length > 0;
  for (const id of playerIds) {
    if (starters.size >= 11) break;
    if (starters.has(id)) continue;
    if (posLookup[id] === 'GK' && gkAlreadyIn) continue; // never a second GK
    starters.add(id);
  }
  return [...starters];
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
