/**
 * Pre-Match Intelligence — Feature 01
 *
 * Provides predicted lineup status and injury alert data for squad players.
 * In production this would call API-Football or similar.
 * For Phase 1, this is a structured mock that mirrors the real data shape.
 *
 * Lineup Status values:
 *   'likely'    - 🟢 Expected to start (≥75% confidence)
 *   'doubtful'  - 🟡 Uncertain — could start, could be benched
 *   'bench'     - 🟠 Expected on the bench
 *   'out'       - 🔴 Confirmed not playing (injured / suspended)
 */

// ─── Status config ────────────────────────────────────────────────────────────
export const LINEUP_STATUS = {
  fit:       { label: 'Fit',        color: '#22c55e', bg: 'rgba(34,197,94,0.12)',  risk: 0 },
  doubt:     { label: 'Doubtful',   color: '#eab308', bg: 'rgba(234,179,8,0.12)',  risk: 1 },
  doubtful:  { label: 'Doubtful',   color: '#eab308', bg: 'rgba(234,179,8,0.12)',  risk: 1 },
  returning: { label: 'Returns',    color: '#f97316', bg: 'rgba(249,115,22,0.12)', risk: 2 },
  injured:   { label: 'Injured',    color: '#ef4444', bg: 'rgba(239,68,68,0.12)',  risk: 3 },
  suspended: { label: 'Suspended',  color: '#ef4444', bg: 'rgba(239,68,68,0.12)',  risk: 3 },
  out:       { label: 'OUT',        color: '#ef4444', bg: 'rgba(239,68,68,0.12)',  risk: 3 },
};

/**
 * Normalizes intelligence data from Supabase or Mock source.
 * @param {object} rawIntel - Row from player_status table
 */
export function normalizeIntelligence(rawIntel) {
  if (!rawIntel) return { status: 'fit', confidence: 100, reason: null, risk: 0 };
  
  return {
    status:     rawIntel.status || 'fit',
    confidence: rawIntel.confidence ?? 100,
    reason:     rawIntel.reason,
    risk:       LINEUP_STATUS[rawIntel.status]?.risk ?? 0,
    returnDate: rawIntel.return_date
  };
}

/**
 * Get the intelligence records that should surface in the Danger Zone:
 * any player with status of 'out', 'doubt', or 'returning'.
 *
 * @param {object[]} playersWithIntel - array of player objects with .intel property already attached
 * @returns {object[]} sorted array of at-risk players
 */
export function getDangerZonePlayers(playersWithIntel) {
  return playersWithIntel
    .filter(p => p.intel && p.intel.status !== 'fit')
    .sort((a, b) => (b.intel.risk || 0) - (a.intel.risk || 0));
}

const SHORT_DATE = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });

/**
 * The "why" line for an unavailable player: the reason from player_status plus the
 * expected return date when the provider gave one, e.g. "Muscle injury · back 20 Dec".
 * Returns null when there is nothing to say.
 */
export function statusDetail(intel) {
  if (!intel || intel.status === 'fit') return null;
  const parts = [];
  if (intel.reason) parts.push(intel.reason);
  if (intel.returnDate) {
    const d = new Date(intel.returnDate);
    if (!Number.isNaN(d.getTime())) parts.push(`back ${SHORT_DATE.format(d)}`);
  }
  return parts.length ? parts.join(' · ') : null;
}
