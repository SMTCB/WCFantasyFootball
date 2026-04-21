/**
 * Canonical player shape used across every screen:
 *
 * {
 *   id:            string   — unique player ID
 *   name:          string   — display name
 *   position:      string   — 'GK' | 'DEF' | 'MID' | 'FWD'
 *   club:          string   — three-letter nation code e.g. 'BRA'
 *   color:         string   — nation primary colour hex (used for accents)
 *   price:         number   — value in £M
 *   points:        number   — total fantasy points accumulated
 *   gridClass:     string   — Tailwind grid placement for PitchView
 *   intel:         object   — fitness/risk info (see default below)
 *   ownership_pct: number   — % of managers who own this player (0–100)
 * }
 */

const DEFAULT_INTEL = { status: 'fit', confidence: 100, risk: 0, reason: null };

// Nation colours — extend as needed for all 48 WC 2026 nations
const NATION_COLORS = {
  ARG: '#74ACDF', BEL: '#ED2939', BRA: '#FFDF00', CRO: '#FF0000',
  ENG: '#FFFFFF', ESP: '#AA151B', FRA: '#002395', GER: '#000000',
  ITA: '#0064AA', MAR: '#C1272D', NED: '#FF6600', NOR: '#EF2B2D',
  POR: '#FF0000', SEN: '#00853F', URU: '#0038A8', USA: '#B22234',
};

/**
 * Normalise any raw player object (from DB, fallback data, or mock) into
 * the canonical shape. Safe to call multiple times on the same object.
 */
export function normalisePlayer(raw = {}) {
  return {
    id:            String(raw.id ?? raw.player_id ?? ''),
    name:          raw.name ?? raw.player_name ?? 'Unknown',
    position:      raw.position ?? 'MID',
    club:          raw.club ?? raw.team ?? raw.nationality ?? '',
    color:         raw.color ?? NATION_COLORS[raw.club ?? raw.team ?? ''] ?? '#7D8A96',
    price:         Number(raw.price ?? 0),
    points:        Number(raw.points ?? raw.total_points ?? 0),
    gridClass:     raw.gridClass ?? raw.grid_class ?? '',
    intel:         raw.intel ? { ...DEFAULT_INTEL, ...raw.intel } : { ...DEFAULT_INTEL },
    ownership_pct: Number(raw.ownership_pct ?? raw.ownership ?? 0),
  };
}

/**
 * Normalise an array of raw players. Filters out any nullish entries.
 */
export function normalisePlayers(rawArray = []) {
  return rawArray.filter(Boolean).map(normalisePlayer);
}
