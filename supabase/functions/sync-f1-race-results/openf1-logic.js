// openf1-logic.js — pure helpers for sync-f1-race-results. No DB or network
// calls, so tests/unit/f1-openf1-logic.test.js can run them under node:test,
// and index.ts imports them unchanged.

// The names a player can pick. Scoring compares strings exactly, so a result
// must use this spelling. Copy of DRIVERS in src/lib/f1/f1-data.js (the
// function bundle cannot import from src/); the unit test fails if they drift.
export const PICK_NAMES = [
  'Max Verstappen',
  'Isack Hadjar',
  'Charles Leclerc',
  'Lewis Hamilton',
  'George Russell',
  'Kimi Antonelli',
  'Lando Norris',
  'Oscar Piastri',
  'Fernando Alonso',
  'Lance Stroll',
  'Pierre Gasly',
  'Franco Colapinto',
  'Alex Albon',
  'Carlos Sainz Jr.',
  'Esteban Ocon',
  'Oliver Bearman',
  'Nico Hülkenberg',
  'Gabriel Bortoleto',
  'Liam Lawson',
  'Arvid Lindblad',
  'Valtteri Bottas',
  'Sergio Pérez',
];

// A race session more than this far from our race_at is a different weekend.
const MAX_SESSION_GAP_MS = 36 * 3600_000;

function plain(s) {
  return String(s ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
}

// OpenF1 sessions carry no round number, so the race is found by date: the
// session named 'Race' (sprints are 'Sprint') whose start is closest to our
// race_at, within MAX_SESSION_GAP_MS.
export function pickRaceSession(sessions, raceAt) {
  const target = Date.parse(raceAt);
  if (!Array.isArray(sessions) || Number.isNaN(target)) return null;
  let best = null;
  let bestGap = Infinity;
  for (const s of sessions) {
    if (s?.session_name !== 'Race' || !s.session_key) continue;
    const gap = Math.abs(Date.parse(s.date_start) - target);
    if (gap < bestGap) { best = s; bestGap = gap; }
  }
  return bestGap <= MAX_SESSION_GAP_MS ? best : null;
}

// OpenF1 writes the surname in capitals in full_name ('Max VERSTAPPEN'), and
// first names differ ('Andrea Kimi' vs 'Kimi', 'Alexander' vs 'Alex'), so match
// on the surname: the pick name whose words include OpenF1's last_name.
// Returns null when no pick name, or more than one, matches.
export function toPickName(driver, names = PICK_NAMES) {
  const last = plain(driver?.last_name);
  if (!last) return null;
  const hits = names.filter(n => ` ${plain(n)} `.includes(` ${last} `));
  return hits.length === 1 ? hits[0] : null;
}

// Final top 3 from OpenF1 /position rows: each driver's latest row is their
// finishing place. Rows must be unfiltered; with position<=3 in the query a
// driver who ran third and then fell back would keep a stale third place.
export function finalTop3(positions) {
  const latest = new Map();
  for (const p of positions ?? []) {
    const seen = latest.get(p.driver_number);
    if (!seen || p.date > seen.date) latest.set(p.driver_number, p);
  }
  return [...latest.values()]
    .sort((a, b) => a.position - b.position)
    .slice(0, 3)
    .map(p => p.driver_number);
}
