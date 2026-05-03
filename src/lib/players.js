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

// Nation colours — covers all likely WC 2026 nations (48 slots) plus common European leagues.
// For club-based competitions the color field falls back to '#7D8A96' (neutral grey),
// since club codes don't match 3-letter nation codes.
const NATION_COLORS = {
  // South America
  ARG: '#74ACDF', BRA: '#FFDF00', URU: '#0038A8', COL: '#FCD116',
  ECU: '#FFD100', CHI: '#D52B1E', BOL: '#007A3D', VEN: '#CF142B',
  PAR: '#D52B1E', PER: '#D91023',
  // CONCACAF
  USA: '#B22234', MEX: '#006847', CAN: '#FF0000', PAN: '#005293',
  CRC: '#002B7F', HON: '#0073CF', JAM: '#000000', SLV: '#0F47AF',
  // Europe
  ENG: '#FFFFFF', FRA: '#002395', GER: '#000000', ESP: '#AA151B',
  POR: '#FF0000', NED: '#FF6600', BEL: '#ED2939', CRO: '#FF0000',
  ITA: '#0064AA', SUI: '#FF0000', AUT: '#ED2939', DEN: '#C60C30',
  NOR: '#EF2B2D', SWE: '#006AA7', POL: '#DC143C', CZE: '#D7141A',
  SRB: '#C6363C', HUN: '#CE2939', ROU: '#002B7F', UKR: '#005BBB',
  WAL: '#D01012', SCO: '#003087', SVN: '#003DA5', SVK: '#FFFFFF',
  GRE: '#0D5EAF', TUR: '#E30A17', GEO: '#FF0000', ALB: '#E41E20',
  FIN: '#003580', ISL: '#003897',
  // Africa
  MAR: '#C1272D', SEN: '#00853F', NGA: '#008751', CMR: '#007A5E',
  GHA: '#006B3F', EGY: '#CE1126', ALG: '#006233', TUN: '#E70013',
  CIV: '#F77F00', MLI: '#14B53A', COD: '#007FFF', ZAF: '#007A4D',
  // Asia / Oceania
  JPN: '#BC002D', KOR: '#003478', IRN: '#239F40', SAU: '#006C35',
  AUS: '#00008B', QAT: '#8D1B3D', IRQ: '#007A3D', JOR: '#007A3D',
  UZB: '#1EB53A', THA: '#A51931', IND: '#FF9933', PHI: '#0038A8',
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
