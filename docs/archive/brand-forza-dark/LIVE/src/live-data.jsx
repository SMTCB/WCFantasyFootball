/* global React */
// Live Centre data — the squad from the user's screenshot (5-4-1) plus a
// realistic event stream with the in-app Forza Fantasy League names
// attached, so the multi-league mechanic is visible.

// Coordinates normalized 0..100 inside the mini-pitch surface.
const LIVE_SQUAD = [
  // FWD (1)
  { id:'abr', last:'ABRAHAM',   club:'AST', pos:'FWD', no:9,  pts:6, status:'fit',   live:true,  x:50, y:14 },

  // MID (4)
  { id:'tie', last:'TIELEMANS', club:'AST', pos:'MID', no:8,  pts:3, status:'fit',   live:false, x:14, y:38 },
  { id:'bue', last:'BUENDÍA',   club:'AST', pos:'MID', no:10, pts:2, status:'fit',   live:false, x:38, y:38 },
  { id:'kul', last:'KULUSEVSKI',club:'TOT', pos:'MID', no:21, pts:1, status:'fit',   live:false, x:62, y:38 },
  { id:'ben', last:'BENTANCUR', club:'TOT', pos:'MID', no:30, pts:0, status:'doubt', live:true,  x:86, y:38 },

  // DEF (5)
  { id:'min', last:'MINGS',     club:'AST', pos:'DEF', no:5,  pts:2, status:'fit',   live:false, x:10, y:64 },
  { id:'kon', last:'KONSA',     club:'AST', pos:'DEF', no:4,  pts:2, status:'fit',   live:false, x:30, y:64 },
  { id:'ada', last:'ADARABIOYO',club:'CHE', pos:'DEF', no:6,  pts:1, status:'fit',   live:false, x:50, y:64 },
  { id:'cha', last:'CHALOBAH',  club:'CHE', pos:'DEF', no:14, pts:-1,status:'doubt', live:true,  x:70, y:64 },
  { id:'udo', last:'UDOGIE',    club:'TOT', pos:'DEF', no:13, pts:2, status:'fit',   live:false, x:90, y:64 },

  // GK (1)
  { id:'pic', last:'PICKFORD',  club:'EVE', pos:'GK',  no:1,  pts:4, status:'fit',   live:true,  x:50, y:88 },
];

// Club tone for the badge dot. Cool: stay subtle, not full kit.
const LIVE_CLUB_TONE = {
  AST:'#95BFE5', // claret? we keep it cool to avoid kit clash
  CHE:'#5AA9FF',
  TOT:'#EEEEEE',
  EVE:'#274488',
};

// Position tone used by the row "+/-" pip and the pitch indent.
const POS_TONE = {
  FWD:'var(--danger)',
  MID:'var(--gold)',
  DEF:'var(--cyan)',
  GK :'var(--purple)',
};

// The Forza Fantasy League names — the IN-APP leagues the user is in.
// Same player can appear in several of these, with different captaincies
// and chips. We display the league name on every event row.
const FF_LEAGUES = [
  // Each league has its own captain + chip context. The XI is the same
  // pool of players in this mock; in production the user could field
  // different squads per league and we'd carry an XI here too.
  { id:'office',  short:'OFC',    name:'Office Heroes',        tone:'#00B4D8', members:14,  captain:'abr', chip:null,             rank:'3 / 14'  },
  { id:'mates',   short:'MATES',  name:'Mates Only',           tone:'#E0A800', members:8,   captain:'pic', chip:null,             rank:'1 / 8'   },
  { id:'sunday',  short:'SUN',    name:'Sunday League Kings',  tone:'#A855F7', members:22,  captain:'abr', chip:'Triple Captain', rank:'7 / 22'  },
  { id:'globals', short:'OPEN',   name:'Global · Open',        tone:'#8B95A1', members:'∞', captain:'bue', chip:null,             rank:'1.2M / 6M' },
];

// Event taxonomy. Keep glyphs to plain shapes / single letters so we
// avoid emoji and SVG slop.
const EVENT_KIND = {
  goal:    { label:'Goal',           glyph:'●', tone:'var(--positive)' },
  assist:  { label:'Assist',         glyph:'◆', tone:'var(--cyan)'     },
  clean:   { label:'Clean sheet',    glyph:'▲', tone:'var(--positive)' },
  yellow:  { label:'Yellow card',    glyph:'■', tone:'var(--gold)'     },
  red:     { label:'Red card',       glyph:'■', tone:'var(--danger)'   },
  pen_save:{ label:'Penalty save',   glyph:'★', tone:'var(--cyan)'     },
  pen_miss:{ label:'Penalty miss',   glyph:'✕', tone:'var(--danger)'   },
  motm:    { label:'Bonus pts',      glyph:'+', tone:'var(--gold)'     },
  sub_off: { label:'Subbed off',     glyph:'↓', tone:'var(--mute)'     },
  sub_on:  { label:'Subbed on',      glyph:'↑', tone:'var(--mute)'     },
  conceded:{ label:'Conceded',       glyph:'−', tone:'var(--danger)'   },
};

// Events, newest first. `delta` is the points delta in THAT league;
// because chips/captains differ per league the same real event can
// show different deltas across leagues.
const LIVE_EVENTS = [
  { id:'e15', t:"82'", min:82, kind:'goal',    player:'abr', delta:+4, league:'office',  cap:true  },
  { id:'e14', t:"82'", min:82, kind:'goal',    player:'abr', delta:+4, league:'mates',   cap:false },
  { id:'e13', t:"82'", min:82, kind:'goal',    player:'abr', delta:+8, league:'sunday',  cap:true, note:'Triple Captain' },

  { id:'e12', t:"71'", min:71, kind:'yellow',  player:'cha', delta:-1, league:'office'  },
  { id:'e11', t:"71'", min:71, kind:'yellow',  player:'cha', delta:-1, league:'sunday'  },

  { id:'e10', t:"68'", min:68, kind:'sub_off', player:'ben', delta:0,  league:'office'  },
  { id:'e09', t:"68'", min:68, kind:'sub_off', player:'ben', delta:0,  league:'mates'   },

  { id:'e08', t:"63'", min:63, kind:'assist',  player:'tie', delta:+3, league:'office'  },
  { id:'e07', t:"63'", min:63, kind:'assist',  player:'tie', delta:+3, league:'sunday'  },

  { id:'e06', t:"HT",  min:45, kind:'clean',   player:'pic', delta:+1, league:'office'  },
  { id:'e05', t:"HT",  min:45, kind:'clean',   player:'pic', delta:+1, league:'mates'   },
  { id:'e04', t:"HT",  min:45, kind:'clean',   player:'pic', delta:+1, league:'sunday'  },
  { id:'e03', t:"HT",  min:45, kind:'clean',   player:'pic', delta:+1, league:'globals' },

  { id:'e02', t:"22'", min:22, kind:'pen_save',player:'pic', delta:+5, league:'office'  },
  { id:'e01', t:"22'", min:22, kind:'pen_save',player:'pic', delta:+5, league:'sunday'  },
];

// Live fixtures backing the events (lightweight - just enough to read).
const LIVE_FIXTURES = [
  { id:'AVL-CHE', home:'AST', away:'CHE', hs:1, as:0, status:'LIVE', clock:"82'" },
  { id:'TOT-EVE', home:'TOT', away:'EVE', hs:0, as:0, status:'LIVE', clock:"71'" },
];

// Helpers ─────────────────────────────────────────────────────
const playerById  = (id) => LIVE_SQUAD.find(p => p.id === id);
const leagueById  = (id) => FF_LEAGUES.find(l => l.id === id);

// Aggregate live points per league. Same fixture, different deltas because
// of captains / chips, so this is per-league not a single number.
function liveTotalsByLeague(){
  const totals = {};
  for (const lg of FF_LEAGUES){
    const baseline = { office:42, mates:48, sunday:51, globals:39 }[lg.id] || 0;
    const delta = LIVE_EVENTS
      .filter(e => e.league === lg.id)
      .reduce((s,e) => s + e.delta, 0);
    totals[lg.id] = { baseline, delta, total: baseline + delta };
  }
  return totals;
}

window.LIVE_SQUAD = LIVE_SQUAD;
window.LIVE_CLUB_TONE = LIVE_CLUB_TONE;
window.POS_TONE = POS_TONE;
window.FF_LEAGUES = FF_LEAGUES;
window.EVENT_KIND = EVENT_KIND;
window.LIVE_EVENTS = LIVE_EVENTS;
window.LIVE_FIXTURES = LIVE_FIXTURES;
window.playerById = playerById;
window.leagueById = leagueById;
window.liveTotalsByLeague = liveTotalsByLeague;
