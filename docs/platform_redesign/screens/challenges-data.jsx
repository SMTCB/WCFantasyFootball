// ============================================================
// CHALLENGES DATA — mock data for the coin challenges feature
// ============================================================

const MGRS = [
  { id:'rt', name:'RTrocado',  rank:1, gw:67, total:1024 },
  { id:'pk', name:'PabloK',    rank:2, gw:61, total:978  },
  { id:'me', name:'Gbruzzy',   rank:3, gw:54, total:892, isMe:true },
  { id:'cf', name:'CarlosF',   rank:4, gw:58, total:871  },
  { id:'mp', name:'MattP',     rank:5, gw:48, total:844  },
  { id:'sw', name:'SaraW',     rank:6, gw:52, total:820  },
  { id:'gb', name:'GBruschy',  rank:7, gw:39, total:793  },
  { id:'th', name:'TomH',      rank:8, gw:44, total:761  },
];

const MY_WALLET = { balance:1240, escrow:400 };

const INCOMING = [
  {
    id:'i1', from:MGRS[0], type:'GW_TOTAL', typeLabel:'GW Total Battle',
    summary:'RTrocado thinks his GW total will beat yours this round',
    stake:300, netWin:270, rake:30, expiry:'18 hrs',
  },
  {
    id:'i2', from:MGRS[4], type:'PLAYER_DUEL', typeLabel:'Player Duel',
    summary:"Salah (MattP's pick) vs Saka (yours) — whose player scores more?",
    stake:150, netWin:135, rake:15, expiry:'6 hrs',
  },
];

const OPEN = [
  {
    id:'o1', to:MGRS[6], type:'MATCH_RESULT', typeLabel:'Match Result',
    summary:'Arsenal vs Chelsea — you called Arsenal win',
    stake:200, expiry:'2 days',
  },
];

const ACTIVE = [
  {
    id:'a1', opp:MGRS[1], type:'GW_TOTAL', typeLabel:'GW Total Battle',
    myScore:47, theirScore:39, stake:250, gw:'GW31',
  },
];

const SETTLED = [
  {
    id:'s1', opp:MGRS[6], type:'GW_TOTAL', typeLabel:'GW Total Battle',
    result:'win',  myScore:68, theirScore:55, payout:225, stake:250, gw:'GW30',
  },
  {
    id:'s2', opp:MGRS[4], type:'PLAYER_DUEL', typeLabel:'Player Duel',
    result:'loss', myScore:4,  theirScore:11, payout:90,  stake:100, gw:'GW30',
  },
  {
    id:'s3', opp:MGRS[5], type:'MATCH_RESULT', typeLabel:'Match Result',
    result:'draw', payout:0, stake:150, gw:'GW29', note:'Postponed — stakes returned',
  },
];

const MY_PLAYERS = [
  { id:'sal', name:'Salah',   club:'LIV', pos:'MID', pts:14 },
  { id:'haa', name:'Haaland', club:'MCI', pos:'FWD', pts:0  },
  { id:'sak', name:'Saka',    club:'ARS', pos:'MID', pts:8  },
  { id:'trr', name:'Trent',   club:'LIV', pos:'DEF', pts:6  },
  { id:'all', name:'Alisson', club:'LIV', pos:'GKP', pts:6  },
];

const OPP_PLAYERS = [
  { id:'wat', name:'Watkins',   club:'AVL', pos:'FWD', pts:11 },
  { id:'dbr', name:'De Bruyne', club:'MCI', pos:'MID', pts:9  },
  { id:'isa', name:'Isak',      club:'NEW', pos:'FWD', pts:7  },
];

const FIXTURES = [
  { id:'f1', home:'Arsenal',  away:'Chelsea',   time:'Sat 15:00' },
  { id:'f2', home:'Man City', away:'Liverpool', time:'Sat 17:30' },
  { id:'f3', home:'Spurs',    away:'Man Utd',   time:'Sun 14:00' },
];

const WALLET_TXS = [
  { id:'t1', type:'CHALLENGE WIN',    party:'vs GBruschy', amt:+225, bal:1240, time:'GW31 · 2h ago'  },
  { id:'t2', type:'CHALLENGE STAKE',  party:'vs PabloK',   amt:-250, bal:1015, time:'GW31 · 1d ago'  },
  { id:'t3', type:'CHALLENGE STAKE',  party:'vs RTrocado', amt:-300, bal:1265, time:'GW31 · 1d ago'  },
  { id:'t4', type:'CHALLENGE STAKE',  party:'vs MattP',    amt:-150, bal:1565, time:'GW31 · 2d ago'  },
  { id:'t5', type:'PURCHASE',         party:'Play Pack',   amt:+1000,bal:1715, time:'GW30 · 5d ago'  },
  { id:'t6', type:'CHALLENGE WIN',    party:'vs TomH',     amt:+90,  bal:715,  time:'GW30 · 7d ago'  },
  { id:'t7', type:'CHALLENGE LOSS',   party:'vs MattP',    amt:-100, bal:625,  time:'GW30 · 7d ago'  },
  { id:'t8', type:'CHALLENGE REFUND', party:'vs SaraW',    amt:+150, bal:725,  time:'GW29 · 14d ago' },
];

const COIN_PACKS = [
  { id:'starter', name:'STARTER', coins:200,  price:'£1.99',  badge:null },
  { id:'play',    name:'PLAY',    coins:1000, price:'£7.99',  badge:'Best value' },
  { id:'plus',    name:'PLUS',    coins:2500, price:'£17.99', badge:null },
  { id:'pro',     name:'PRO',     coins:5000, price:'£29.99', badge:null },
];

Object.assign(window, {
  MGRS, MY_WALLET, INCOMING, OPEN, ACTIVE, SETTLED,
  MY_PLAYERS, OPP_PLAYERS, FIXTURES, WALLET_TXS, COIN_PACKS,
});
