// 2026 F1 season constants — ported from FantasyF1/src/lib/f1-data.ts

export const DRIVERS = [
  'Max Verstappen',
  'Sergio Perez',
  'Lewis Hamilton',
  'George Russell',
  'Charles Leclerc',
  'Carlos Sainz',
  'Lando Norris',
  'Oscar Piastri',
  'Fernando Alonso',
  'Lance Stroll',
  'Pierre Gasly',
  'Esteban Ocon',
  'Valtteri Bottas',
  'Zhou Guanyu',
  'Yuki Tsunoda',
  'Daniel Ricciardo',
  'Nico Hulkenberg',
  'Kevin Magnussen',
  'Alexander Albon',
  'Logan Sargeant',
  'Oliver Bearman',
  'Jack Doohan',
  'Liam Lawson',
  'Franco Colapinto',
];

export const TEAMS = [
  'Red Bull Racing',
  'Mercedes',
  'Ferrari',
  'McLaren',
  'Aston Martin',
  'Alpine',
  'Alfa Romeo',
  'Haas',
  'Williams',
  'RB (AlphaTauri)',
];

// Points awarded per prediction field (from FantasyF1 scoring constants)
export const SCORING = {
  p1_exact: 10,
  p2_exact: 8,
  p3_exact: 6,
  p1_wrong_spot: 3,   // predicted driver IS on podium but not in this exact spot
  p2_wrong_spot: 3,
  p3_wrong_spot: 3,
  dnf_correct: 5,
  team_correct: 5,
  special_correct: 5,
  all_correct_bonus: 3,  // bonus when all 6 fields are correct in one race
};

// Special category options lookup (for type='options' races)
// These mirror what was seeded in migration 192
export const SPECIAL_OPTIONS = {
  1:  ['1', '2', '3', '4+'],
  10: ['Under 1 second', '1–5 seconds', '5–10 seconds', '10+ seconds'],
  11: ['0', '1', '2', '3+'],
  13: ['0', '1', '2', '3+'],
  15: ['0', '1', '2', '3+'],
  20: ['0', '1', '2', '3+'],
};

// Flag emoji lookup by country/GP
export const GP_FLAGS = {
  'Australian GP':          '🇦🇺',
  'Chinese GP':             '🇨🇳',
  'Japanese GP':            '🇯🇵',
  'Bahrain GP':             '🇧🇭',
  'Saudi Arabian GP':       '🇸🇦',
  'Miami GP':               '🇺🇸',
  'Canadian GP':            '🇨🇦',
  'Monaco GP':              '🇲🇨',
  'Barcelona-Catalunya GP': '🇪🇸',
  'Austrian GP':            '🇦🇹',
  'British GP':             '🇬🇧',
  'Belgian GP':             '🇧🇪',
  'Hungarian GP':           '🇭🇺',
  'Dutch GP':               '🇳🇱',
  'Italian GP':             '🇮🇹',
  'Spanish GP (Madrid)':    '🇪🇸',
  'Azerbaijan GP':          '🇦🇿',
  'Singapore GP':           '🇸🇬',
  'United States GP':       '🇺🇸',
  'Mexico City GP':         '🇲🇽',
  'Sao Paulo GP':           '🇧🇷',
  'Las Vegas GP':           '🇺🇸',
  'Qatar GP':               '🇶🇦',
  'Abu Dhabi GP':           '🇦🇪',
};

export function getFlag(gpName) {
  return GP_FLAGS[gpName] ?? '🏁';
}
