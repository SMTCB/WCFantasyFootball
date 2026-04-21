// Fallback squad used when the DB returns no data (demo / offline mode).
// Every player conforms to the canonical shape defined in src/lib/players.js.
export const squad = {
  budget: { current: 17.0, total: 100.0 },
  captainId: 'p9',
  players: [
    { id: 'p1',  name: 'Alisson',     position: 'GK',  club: 'BRA', color: '#FFDF00', price: 6.0,  points: 4,  gridClass: 'col-start-3 row-start-4', intel: { status: 'fit',   confidence: 100, risk: 0 }, ownership_pct: 42 },
    { id: 'p2',  name: 'Hakimi',      position: 'DEF', club: 'MAR', color: '#C1272D', price: 5.5,  points: 6,  gridClass: 'col-start-1 row-start-3', intel: { status: 'fit',   confidence: 100, risk: 0 }, ownership_pct: 28 },
    { id: 'p3',  name: 'Rúben Dias',  position: 'DEF', club: 'POR', color: '#FF0000', price: 6.0,  points: 5,  gridClass: 'col-start-2 row-start-3', intel: { status: 'doubt', confidence: 60,  risk: 1, reason: 'Muscle tightness' }, ownership_pct: 31 },
    { id: 'p4',  name: 'Saliba',      position: 'DEF', club: 'FRA', color: '#002395', price: 5.5,  points: 7,  gridClass: 'col-start-4 row-start-3', intel: { status: 'fit',   confidence: 100, risk: 0 }, ownership_pct: 19 },
    { id: 'p5',  name: 'A. Arnold',   position: 'DEF', club: 'ENG', color: '#FFFFFF', price: 6.5,  points: 3,  gridClass: 'col-start-5 row-start-3', intel: { status: 'fit',   confidence: 100, risk: 0 }, ownership_pct: 23 },
    { id: 'p6',  name: 'Bellingham',  position: 'MID', club: 'ENG', color: '#FFFFFF', price: 9.0,  points: 8,  gridClass: 'col-start-1 row-start-2', intel: { status: 'fit',   confidence: 100, risk: 0 }, ownership_pct: 67 },
    { id: 'p7',  name: 'Pedri',       position: 'MID', club: 'ESP', color: '#AA151B', price: 7.5,  points: 5,  gridClass: 'col-start-2 row-start-2', intel: { status: 'doubt', confidence: 80,  risk: 1, reason: 'Flu symptoms' }, ownership_pct: 44 },
    { id: 'p8',  name: 'De Bruyne',   position: 'MID', club: 'BEL', color: '#ED2939', price: 10.0, points: 6,  gridClass: 'col-start-4 row-start-2', intel: { status: 'fit',   confidence: 100, risk: 0 }, ownership_pct: 55 },
    { id: 'p10', name: 'Valverde',    position: 'MID', club: 'URU', color: '#0038A8', price: 7.0,  points: 4,  gridClass: 'col-start-5 row-start-2', intel: { status: 'fit',   confidence: 100, risk: 0 }, ownership_pct: 12 },
    { id: 'p9',  name: 'Mbappé',      position: 'FWD', club: 'FRA', color: '#002395', price: 12.0, points: 12, gridClass: 'col-start-2 row-start-1', intel: { status: 'out',   confidence: 95,  risk: 3, reason: 'Grade 2 hamstring tear' }, ownership_pct: 78 },
    { id: 'p11', name: 'Vinicius Jr.', position: 'FWD', club: 'BRA', color: '#FFDF00', price: 11.0, points: 9, gridClass: 'col-start-4 row-start-1', intel: { status: 'fit',   confidence: 100, risk: 0 }, ownership_pct: 71 },
  ],
  bench: [
    { id: 'b1', name: 'Donnarumma', position: 'GK',  club: 'ITA', color: '#0064AA', price: 5.5,  points: 2,  gridClass: '', intel: { status: 'fit', confidence: 100, risk: 0 }, ownership_pct: 8  },
    { id: 'b2', name: 'Koundé',     position: 'DEF', club: 'FRA', color: '#002395', price: 5.0,  points: 3,  gridClass: '', intel: { status: 'fit', confidence: 100, risk: 0 }, ownership_pct: 14 },
    { id: 'b3', name: 'Rodri',      position: 'MID', club: 'ESP', color: '#AA151B', price: 8.0,  points: 5,  gridClass: '', intel: { status: 'fit', confidence: 100, risk: 0 }, ownership_pct: 33 },
    { id: 'b4', name: 'Haaland',    position: 'FWD', club: 'NOR', color: '#EF2B2D', price: 11.5, points: 10, gridClass: '', intel: { status: 'fit', confidence: 100, risk: 0 }, ownership_pct: 61 },
  ],
};
