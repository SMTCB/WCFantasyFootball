// Shared geometry for rendering a squad on a pitch surface — used by both
// PitchView (desktop) and MobilePitchField (mobile Concept-A field view) so
// the two stay in sync instead of drifting into two copies of the same table.

// X positions (% of pitch width) for each row count, spec values, wider spacing
export const X_BY_COUNT = {
  1: [50],
  2: [33, 67],
  3: [22, 50, 78],
  4: [14, 38, 62, 86],
  5: [12, 28, 50, 72, 88],
};

// Y position (% from top) for each position band
export const POS_Y = { FWD: 22, MID: 46, DEF: 70, GK: 92 };

export const STATUS_COLOR = {
  fit:       'var(--positive)',
  doubt:     'var(--gold)',
  out:       'var(--danger)',
  doubtful:  'var(--gold)',
  injured:   'var(--danger)',
  suspended: 'var(--danger)',
};

export function xPositions(n) {
  return X_BY_COUNT[n] ?? Array.from({ length: n }, (_, i) => ((i + 1) * 100) / (n + 1));
}

// Groups players by position, assigns each an x/y slot and a sequential
// shirt number, and derives the formation string (e.g. "4-3-3").
export function buildPitchTokens(players, captainId) {
  const byPos = { GK: [], DEF: [], MID: [], FWD: [] };
  for (const p of (players ?? [])) {
    if (byPos[p.position]) byPos[p.position].push(p);
  }

  const tokens = [];
  let no = 1;
  for (const pos of ['GK', 'DEF', 'MID', 'FWD']) {
    const posPlayers = byPos[pos];
    const y  = POS_Y[pos];
    const xs = xPositions(posPlayers.length);
    posPlayers.forEach((p, i) => {
      tokens.push({
        player:    p,
        no:        no++,
        x:         xs[i],
        y,
        isCaptain: p.id === captainId,
      });
    });
  }

  const formation = [byPos.DEF.length, byPos.MID.length, byPos.FWD.length].filter(n => n > 0).join('-') || '—';

  return { tokens, byPos, formation };
}
