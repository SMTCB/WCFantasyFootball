/* global React */
// Fixtures data for the Match Centre / Scores screen.
// One gameweek = Sat→Mon block of league play, optionally with midweek European matches.

const COMPS = {
  EPL: { code:'EPL', name:'PREMIER LEAGUE',     tone:'#00B4D8' }, // cyan
  UCL: { code:'UCL', name:'CHAMPIONS LEAGUE',   tone:'#E0A800' }, // gold
  UEL: { code:'UEL', name:'EUROPA LEAGUE',      tone:'#A855F7' }, // purple
  FAC: { code:'FAC', name:'FA CUP',             tone:'#EF4444' }, // red
};

// Gameweek 12 — 13 Sep → 17 Sep (PL Sat/Sun/Mon + UCL midweek)
const FIXTURES = [
  // SAT 13 SEP — PL
  { id:'f01', date:'2025-09-13', day:'SAT', dnum:'13', dlong:'13 SEP', kickoff:'12:30', comp:'EPL', status:'FT',  home:{name:'Liverpool',         code:'LIV'}, away:{name:'AFC Bournemouth',  code:'BOU'}, score:[4,2] },
  { id:'f02', date:'2025-09-13', day:'SAT', dnum:'13', dlong:'13 SEP', kickoff:'15:00', comp:'EPL', status:'FT',  home:{name:'Aston Villa',       code:'AVL'}, away:{name:'Newcastle United', code:'NEW'}, score:[0,0] },
  { id:'f03', date:'2025-09-13', day:'SAT', dnum:'13', dlong:'13 SEP', kickoff:'15:00', comp:'EPL', status:'FT',  home:{name:'Tottenham Hotspur', code:'TOT'}, away:{name:'Burnley',          code:'BUR'}, score:[3,0] },
  { id:'f04', date:'2025-09-13', day:'SAT', dnum:'13', dlong:'13 SEP', kickoff:'15:00', comp:'EPL', status:'FT',  home:{name:'Brighton & Hove',   code:'BHA'}, away:{name:'Fulham',           code:'FUL'}, score:[1,1] },
  { id:'f05', date:'2025-09-13', day:'SAT', dnum:'13', dlong:'13 SEP', kickoff:'15:00', comp:'EPL', status:'FT',  home:{name:'Sunderland',        code:'SUN'}, away:{name:'West Ham',         code:'WHU'}, score:[3,0] },
  { id:'f06', date:'2025-09-13', day:'SAT', dnum:'13', dlong:'13 SEP', kickoff:'17:30', comp:'EPL', status:'FT',  home:{name:'Wolves',            code:'WOL'}, away:{name:'Manchester City',  code:'MCI'}, score:[0,4], hot:true },

  // SUN 14 SEP — PL
  { id:'f07', date:'2025-09-14', day:'SUN', dnum:'14', dlong:'14 SEP', kickoff:'14:00', comp:'EPL', status:'FT',  home:{name:'Chelsea',           code:'CHE'}, away:{name:'Crystal Palace',   code:'CRY'}, score:[0,0] },
  { id:'f08', date:'2025-09-14', day:'SUN', dnum:'14', dlong:'14 SEP', kickoff:'14:00', comp:'EPL', status:'FT',  home:{name:'Nottingham Forest', code:'NFO'}, away:{name:'Brentford',        code:'BRE'}, score:[3,1] },
  { id:'f09', date:'2025-09-14', day:'SUN', dnum:'14', dlong:'14 SEP', kickoff:'16:30', comp:'EPL', status:'FT',  home:{name:'Manchester United', code:'MUN'}, away:{name:'Arsenal',          code:'ARS'}, score:[0,1], hot:true },

  // MON 15 SEP — PL
  { id:'f10', date:'2025-09-15', day:'MON', dnum:'15', dlong:'15 SEP', kickoff:'20:00', comp:'EPL', status:'LIVE', live:'74\'', home:{name:'Leeds United', code:'LEE'}, away:{name:'Everton', code:'EVE'}, score:[1,0] },

  // TUE 16 SEP — UCL
  { id:'f11', date:'2025-09-16', day:'TUE', dnum:'16', dlong:'16 SEP', kickoff:'18:45', comp:'UCL', status:'KO',  home:{name:'Real Madrid',       code:'RMA'}, away:{name:'Marseille',        code:'OM'},  score:null },
  { id:'f12', date:'2025-09-16', day:'TUE', dnum:'16', dlong:'16 SEP', kickoff:'21:00', comp:'UCL', status:'KO',  home:{name:'Manchester City',   code:'MCI'}, away:{name:'Inter Milan',      code:'INT'}, score:null },

  // WED 17 SEP — UCL
  { id:'f13', date:'2025-09-17', day:'WED', dnum:'17', dlong:'17 SEP', kickoff:'18:45', comp:'UCL', status:'KO',  home:{name:'Atlético Madrid',   code:'ATM'}, away:{name:'Liverpool',        code:'LIV'}, score:null },
  { id:'f14', date:'2025-09-17', day:'WED', dnum:'17', dlong:'17 SEP', kickoff:'21:00', comp:'UCL', status:'KO',  home:{name:'PSG',               code:'PSG'}, away:{name:'Arsenal',          code:'ARS'}, score:null },

  // THU 18 SEP — UEL
  { id:'f15', date:'2025-09-18', day:'THU', dnum:'18', dlong:'18 SEP', kickoff:'20:00', comp:'UEL', status:'KO',  home:{name:'AS Roma',           code:'ROM'}, away:{name:'Tottenham',        code:'TOT'}, score:null },
  { id:'f16', date:'2025-09-18', day:'THU', dnum:'18', dlong:'18 SEP', kickoff:'20:00', comp:'UEL', status:'KO',  home:{name:'Aston Villa',       code:'AVL'}, away:{name:'Feyenoord',        code:'FEY'}, score:null },
];

// helpers --------------------------------------------------------------------
function groupByDate(fixtures){
  const m = new Map();
  for(const f of fixtures){
    if(!m.has(f.date)) m.set(f.date,{date:f.date,day:f.day,dnum:f.dnum,dlong:f.dlong,fixtures:[]});
    m.get(f.date).fixtures.push(f);
  }
  return [...m.values()];
}
function groupByComp(fixtures){
  const m = new Map();
  for(const f of fixtures){
    if(!m.has(f.comp)) m.set(f.comp,{...COMPS[f.comp],fixtures:[]});
    m.get(f.comp).fixtures.push(f);
  }
  return [...m.values()];
}
function countByComp(fixtures){
  const out = {};
  for(const f of fixtures) out[f.comp] = (out[f.comp]||0)+1;
  return out;
}

window.COMPS = COMPS;
window.FIXTURES = FIXTURES;
window.groupByDate = groupByDate;
window.groupByComp = groupByComp;
window.countByComp = countByComp;
