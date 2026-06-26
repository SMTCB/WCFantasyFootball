/* global React */
// LEAGUE HUB data — the OFFICE HEROES league (id matches live-data.jsx).
// All names, copy, and figures are illustrative, not real-world managers.

// ── Managers (the people in the league) ────────────────────────────
// `mono` is the 3-char badge tag visible everywhere. `hue` is a personal
// identity tone used in chat, frontpage bylines, and on the manager card.
const LH_MANAGERS = [
  { id:'you',   mono:'YOU', name:'You',          handle:'@you',          hue:'#00B4D8', squad:'Rolling Hooligans',   joined:'GW1', form:['W','W','D','L','W'] },
  { id:'rai',   mono:'RAI', name:'Raï Bezerra',  handle:'@rai',          hue:'#E0A800', squad:'Bezerra United',      joined:'GW1', form:['W','W','W','D','W'] },
  { id:'ade',   mono:'ADE', name:'Adelaide K.',  handle:'@adelaide',     hue:'#A855F7', squad:'Storks Albion',       joined:'GW1', form:['W','L','W','W','D'] },
  { id:'mar',   mono:'MAR', name:'Marcin S.',    handle:'@m.szwed',      hue:'#22C55E', squad:'Pierogi FC',          joined:'GW1', form:['L','W','D','W','W'] },
  { id:'kai',   mono:'KAI', name:'Kai Tanaka',   handle:'@kai',          hue:'#EF4444', squad:'Yokohama Reservoir',  joined:'GW2', form:['D','W','L','L','W'] },
  { id:'ndo',   mono:'NDO', name:'Ndolo Mwangi', handle:'@ndolo',        hue:'#F59E0B', squad:'Equator Express',     joined:'GW1', form:['W','W','L','W','W'] },
  { id:'pao',   mono:'PAO', name:'Paola V.',     handle:'@paolavargas',  hue:'#34D399', squad:'Andes Pumas',         joined:'GW3', form:['L','L','D','W','D'] },
  { id:'rui',   mono:'RUI', name:'Rui Almeida',  handle:'@rui',          hue:'#7DD3FC', squad:'Tagus Reserves',      joined:'GW1', form:['W','D','W','W','L'] },
  { id:'zoe',   mono:'ZOE', name:'Zoë Patel',    handle:'@zo',           hue:'#FB7185', squad:'Park Royal',          joined:'GW2', form:['L','W','W','D','W'] },
  { id:'olu',   mono:'OLU', name:'Olu Adebayo',  handle:'@olu',          hue:'#FCD34D', squad:'Lagos Tide',          joined:'GW1', form:['W','W','D','W','W'] },
  { id:'sas',   mono:'SAS', name:'Saskia Brandt',handle:'@sas',          hue:'#C4B5FD', squad:'Rotweiß Mitte',       joined:'GW2', form:['D','D','W','L','W'] },
  { id:'cas',   mono:'CAS', name:'Cassio Penha', handle:'@cassio',       hue:'#67E8F9', squad:'Brigantine 73',       joined:'GW1', form:['W','L','W','D','W'] },
];

// ── Standings ──────────────────────────────────────────────────────
// MD = current matchday points, TOT = season total. `trend` is rank
// change since last matchday (+up / −down / 0 = unchanged).
const LH_STANDINGS = [
  { id:'rai', rank:1,  trend: 0, md:78,  tot:1024, cap:'Haaland',   capPts:24 },
  { id:'olu', rank:2,  trend:+1, md:71,  tot:1011, cap:'Salah',     capPts:18 },
  { id:'ndo', rank:3,  trend:-1, md:66,  tot: 998, cap:'Saka',      capPts:14 },
  { id:'ade', rank:4,  trend:+2, md:84,  tot: 982, cap:'Palmer',    capPts:30 },
  { id:'rui', rank:5,  trend: 0, md:54,  tot: 947, cap:'Foden',     capPts:12 },
  { id:'you', rank:6,  trend:-2, md:43,  tot: 931, cap:'Abraham',   capPts: 8 },
  { id:'mar', rank:7,  trend:+1, md:67,  tot: 918, cap:'Watkins',   capPts:16 },
  { id:'cas', rank:8,  trend: 0, md:51,  tot: 902, cap:'Isak',      capPts: 9 },
  { id:'kai', rank:9,  trend:-1, md:38,  tot: 884, cap:'Son',       capPts: 6 },
  { id:'zoe', rank:10, trend:+1, md:62,  tot: 871, cap:'Mbeumo',    capPts:13 },
  { id:'sas', rank:11, trend:-1, md:44,  tot: 855, cap:'Núñez',     capPts: 4 },
  { id:'pao', rank:12, trend: 0, md:31,  tot: 802, cap:'Solanke',   capPts: 7 },
];

// ── Activity ticker (right rail on the Leaderboard) ────────────────
const LH_ACTIVITY = [
  { id:'a1', t:'2m',  kind:'goal',      who:'rai', txt:'Haaland (C) scored — +24 pts banked' },
  { id:'a2', t:'14m', kind:'bid',       who:'kai', txt:'opened auction on Mbeumo · 8m' },
  { id:'a3', t:'31m', kind:'trade',     who:'ade', txt:'requested H2H vs You for GW28' },
  { id:'a4', t:'1h',  kind:'bet',       who:'you', txt:'picked Palmer · MD5 Top Scorer' },
  { id:'a5', t:'2h',  kind:'pin',       who:'rai', txt:'pinned a message in #league-chat' },
  { id:'a6', t:'3h',  kind:'rankup',    who:'ade', txt:'climbed 2 spots — now 4th' },
  { id:'a7', t:'5h',  kind:'auction',   who:'mar', txt:'won Watkins for 12m · sniped at +3s' },
  { id:'a8', t:'8h',  kind:'frontpage', who:'edt', txt:'Forza Times Edition #5 published' },
];

// ── Forza Times: cover stories ─────────────────────────────────────
// One LEAD + a hand of secondaries. `kicker` is the eyebrow.
const LH_FRONTPAGE = {
  edition: 5,
  date: 'Sat · May 11 · 2026',
  vol:'V',
  lead: {
    id:'lead',
    kicker:'MATCHDAY 5 · LATE WINNER',
    headline:'Bezerra strikes late, retakes the throne.',
    deck:'Three goals from his back four and a Haaland brace clinch a 78-point Saturday for the table-topper. Palmer-led Storks Albion lurking, two points behind.',
    byline:'By the Forza Times Desk · 11 minutes ago',
    image:'pitch',
    tag:'top-of-table',
  },
  stories: [
    { id:'s1', kicker:'AUCTION HOUSE', headline:'Watkins gavel falls — Pierogi snipe at +3s', deck:'Twelve million, a four-bid duel, and a quiet weekend victor.', byline:'Auctioneer’s desk', tag:'auction' },
    { id:'s2', kicker:'OPINION', headline:'Why we should ban the Triple Captain after GW10', deck:'A modest proposal for league commissioners everywhere.', byline:'Adelaide K.', tag:'opinion' },
    { id:'s3', kicker:'TRENDING DOWN', headline:'You drop to 6th after a quiet Saturday', deck:'Abraham captaincy fails to fire; eight points off the chip pace.', byline:'Match report', tag:'standings' },
    { id:'s4', kicker:'BETTING DESK', headline:'MD5 Top Scorer market: Palmer favorite, Haaland on the rise', deck:'Picks closing in 2h 36m. Six of twelve managers have locked in.', byline:'Odds room', tag:'bets' },
    { id:'s5', kicker:'INTERVIEW', headline:'“It was always going to be Saka” — Ndolo on his GW4 captaincy gamble', deck:'A retrospective with the league’s most consistent picker.', byline:'Q&A', tag:'interview' },
  ],
  classified: [
    { id:'c1', tag:'WANTED', text:'Premium DEF under £6m. Will trade Saliba.', from:'@kai' },
    { id:'c2', tag:'OFFERED', text:'Watkins (5gw form 8.2) — open to offers.', from:'@mar' },
    { id:'c3', tag:'WAGER',  text:'Twin Bs say Palmer doesn’t outscore Haaland this MD. Stake: lifetime bragging rights.', from:'@rai' },
  ],
};

// ── Bets (open / pending / resolved) ───────────────────────────────
const LH_BETS = [
  { id:'b1', state:'open',     kind:'top-scorer',  code:'MDMD5',  title:'MD5 Top Scorer',
    q:'Who will score the most goals in matchday 5?',
    options:['Haaland','Palmer','Watkins','Saka','Other'],
    reward:5, closes:'2h 36m', picked:null },
  { id:'b2', state:'open',     kind:'block',       code:'BLK28',  title:'Block Opponent Player',
    q:'Pick an opponent player — if they score <5 pts, you earn +4pts.',
    options:['Salah','Son','Mbeumo','Núñez','Isak'],
    reward:4, closes:'1d 04h', picked:null },
  { id:'b3', state:'open',     kind:'over-under',  code:'O/U·MD5', title:'Over/Under — Your GW Total',
    q:'Will you score over 60 in MD5?',
    options:['Over 60','Under 60'],
    reward:3, closes:'1h 12m', picked:'Over 60' },
  { id:'b4', state:'pending',  kind:'top-scorer',  code:'MDMD4',  title:'MD4 Top Scorer · ready to resolve',
    q:'Who scored the most goals in MD4?',
    note:'Deadline passed · no pick submitted', reward:5 },
  { id:'b5', state:'pending',  kind:'h2h',         code:'H2H·28', title:'Your H2H vs Adelaide',
    q:'Awaiting Sunday fixtures · result locks at FT.',
    note:'You: 43 · Adelaide: 84 (live)', reward:6 },
  { id:'b6', state:'resolved', kind:'fixture',     code:'AVL-CHE',title:'AVL vs CHE',
    q:'Predict the outcome of Aston Villa vs Chelsea',
    answer:'AVL Win', myPick:'AVL Win', reward:3, won:true },
  { id:'b7', state:'resolved', kind:'fixture',     code:'TOT-EVE',title:'TOT vs EVE',
    q:'Predict outcome',
    answer:'Draw', myPick:'TOT Win', reward:3, won:false },
  { id:'b8', state:'resolved', kind:'top-scorer',  code:'MDMD3',  title:'MD3 Top Scorer',
    q:'Who topped MD3?',
    answer:'Palmer (3 goals)', myPick:'Palmer', reward:5, won:true },
];

// Betting performance — used by the Betting tab
const LH_BETTING_PERF = {
  you:    { played:18, won:11, lost:5, void:2, profit:+22, streak:3,  bestKind:'fixture',    worstKind:'block' },
  rai:    { played:18, won:14, lost:3, void:1, profit:+38, streak:6,  bestKind:'top-scorer', worstKind:'h2h'   },
  ade:    { played:17, won:10, lost:6, void:1, profit:+15, streak:1,  bestKind:'block',      worstKind:'fixture' },
  olu:    { played:18, won:12, lost:5, void:1, profit:+27, streak:2,  bestKind:'top-scorer', worstKind:'over-under' },
  ndo:    { played:18, won:9,  lost:7, void:2, profit: +8, streak:0,  bestKind:'fixture',    worstKind:'top-scorer' },
  mar:    { played:16, won:8,  lost:7, void:1, profit: +5, streak:1,  bestKind:'h2h',        worstKind:'top-scorer' },
};

// Last 8 GW points-from-betting (a tiny sparkline series)
const LH_BET_SERIES = {
  you:[ +3, +5, -2, +4, -1, +6, +2, +5 ],
  rai:[ +6, +4, +5, +7, +3, +5, +4, +4 ],
  ade:[ +1, +3, +5, -2, +4, +1, +2, +1 ],
  olu:[ +4, +4, +3, +5, +2, +3, +3, +3 ],
  ndo:[ +2, -1, +3, +1, +4, -2, +3, +1 ],
  mar:[ +1, +1, +2, -1, +1, +2, +0, +1 ],
};

// ── Auctions (active and resolved) ─────────────────────────────────
const LH_AUCTIONS = [
  { id:'au1', state:'live',     player:'PALMER',    pos:'MID', club:'CHE', open:'@kai',  current:13.5, bids:9,  closes:'12m 04s', leader:'ade', myMax:14.0, ownedBy:null },
  { id:'au2', state:'live',     player:'GORDON',    pos:'FWD', club:'NEW', open:'@you',  current: 8.0, bids:5,  closes:'1h 21m', leader:'you', myMax: 8.5, ownedBy:null },
  { id:'au3', state:'live',     player:'TRIPPIER',  pos:'DEF', club:'NEW', open:'@olu',  current: 5.5, bids:3,  closes:'4h 02m', leader:'olu', myMax:null, ownedBy:null },
  { id:'au4', state:'live',     player:'MBEUMO',    pos:'FWD', club:'BRE', open:'@kai',  current: 8.0, bids:6,  closes:'7h 48m', leader:'rai', myMax:null, ownedBy:null },
  { id:'au5', state:'starting', player:'GUEHI',     pos:'DEF', club:'CRY', open:'@ndo',  current: 4.5, bids:0,  closes:'in 1d', leader:null,  myMax:null, ownedBy:null },
  { id:'au6', state:'starting', player:'JOÃO PEDRO',pos:'FWD', club:'BHA', open:'@cas',  current: 6.0, bids:0,  closes:'in 1d 6h', leader:null, myMax:null, ownedBy:null },
  { id:'au7', state:'blocked',  player:'SALAH',     pos:'MID', club:'LIV', open:null,    current:null, bids:0,  closes:null,    leader:null,  myMax:null, ownedBy:'rai' },
  { id:'au8', state:'blocked',  player:'HAALAND',   pos:'FWD', club:'MCI', open:null,    current:null, bids:0,  closes:null,    leader:null,  myMax:null, ownedBy:'rai' },
  { id:'au9', state:'blocked',  player:'SAKA',      pos:'MID', club:'ARS', open:null,    current:null, bids:0,  closes:null,    leader:null,  myMax:null, ownedBy:'ndo' },
  { id:'a10', state:'resolved', player:'WATKINS',   pos:'FWD', club:'AVL', open:'@mar',  current:12.0, bids:11, closes:'won 5h ago', leader:'mar', myMax:11.0, ownedBy:'mar' },
];

// Detailed auction (used by drill-in)
const LH_AUCTION_DETAIL = {
  id:'au1',
  player:'PALMER',
  pos:'MID',
  club:'CHE',
  age:23,
  formGW:[ 12, 8, 14, 9, 30 ],
  totalPts:198,
  selectedBy:'58.2%',
  history:[
    { t:'09:14', who:'kai', amt: 7.5, note:'opened' },
    { t:'09:31', who:'rai', amt: 8.0 },
    { t:'10:02', who:'kai', amt: 9.5 },
    { t:'10:18', who:'ade', amt:10.5 },
    { t:'10:44', who:'rai', amt:11.0 },
    { t:'11:09', who:'you', amt:12.0, note:'you' },
    { t:'11:30', who:'ade', amt:13.0 },
    { t:'12:01', who:'ade', amt:13.5, note:'+0.5 outbid' },
  ],
};

// ── Chat (#league-chat) ────────────────────────────────────────────
const LH_CHAT = [
  { id:'m01', who:'rai', t:'08:14', txt:'sleeping on Palmer is a personality choice', react:[{e:'fire',n:3}] },
  { id:'m02', who:'kai', t:'08:15', txt:'@rai you literally have Haaland' },
  { id:'m03', who:'rai', t:'08:15', txt:'and I will continue to' },
  { id:'m04', who:'ade', t:'08:32', txt:'requested H2H vs @you for MD5. Loser pays the lunch on Friday.', system:'h2h', react:[{e:'shake',n:4}] },
  { id:'m05', who:'you', t:'08:34', txt:'accepted. you are buying. anyway.' },
  { id:'m06', who:'mar', t:'09:01', txt:'guys is Watkins still in auction? need a fwd, dying out here', react:[{e:'pray',n:2}] },
  { id:'m07', who:'kai', t:'09:02', txt:'opened it 3 minutes ago, you’re welcome', system:'auction-open' },
  { id:'m08', who:'olu', t:'09:21', txt:'pinned the GW rules — please read before the bet window closes 🙏', pinned:true },
  { id:'m09', who:'ndo', t:'09:48', txt:'sold Saka, broke my heart, league economy intact', react:[{e:'cry',n:5}] },
  { id:'m10', who:'rai', t:'10:33', txt:'Forza Times says I’m back on top. Quote me on that.', react:[{e:'crown',n:7}] },
  { id:'m11', who:'mar', t:'12:08', txt:'WON WATKINS. sniped at +3s. you can all pay your respects in $WAT', system:'auction-win', react:[{e:'fire',n:6},{e:'cry',n:2}] },
];

// ── Stats (used by Stats tab) ──────────────────────────────────────
const LH_STATS = {
  topScorers:[
    { who:'rai', pts:1024 },
    { who:'olu', pts:1011 },
    { who:'ndo', pts: 998 },
    { who:'ade', pts: 982 },
    { who:'rui', pts: 947 },
  ],
  biggestGW:[
    { who:'ade', pts:142, gw:'GW3' },
    { who:'rai', pts:128, gw:'GW1' },
    { who:'olu', pts:121, gw:'GW2' },
    { who:'ndo', pts:118, gw:'GW2' },
  ],
  captainHits:[
    { who:'rai', name:'Haaland',  ct:14, hits:11, hitPct:79 },
    { who:'olu', name:'Salah',    ct:14, hits:9,  hitPct:64 },
    { who:'ade', name:'Palmer',   ct:9,  hits:8,  hitPct:89 },
    { who:'ndo', name:'Saka',     ct:11, hits:7,  hitPct:64 },
    { who:'you', name:'Abraham',  ct:8,  hits:3,  hitPct:38 },
  ],
  weekly:[
    // 12 weeks × top-3 totals — used to draw the chart
    { gw:1, rai: 92, olu: 81, ade: 71 },
    { gw:2, rai: 78, olu:121, ade: 88 },
    { gw:3, rai:104, olu: 71, ade:142 },
    { gw:4, rai: 84, olu: 76, ade: 64 },
    { gw:5, rai: 78, olu: 71, ade: 84 },
    { gw:6, rai: 81, olu: 92, ade: 71 },
    { gw:7, rai: 96, olu: 78, ade: 81 },
    { gw:8, rai: 71, olu: 88, ade: 94 },
    { gw:9, rai: 88, olu: 79, ade: 72 },
    { gw:10,rai: 91, olu: 95, ade: 68 },
    { gw:11,rai: 84, olu: 71, ade: 89 },
    { gw:12,rai:103, olu: 82, ade: 76 },
  ],
  posBreakdown:[
    { pos:'GK',  pct:8,  pts:412  },
    { pos:'DEF', pct:24, pts:1248 },
    { pos:'MID', pct:42, pts:2184 },
    { pos:'FWD', pct:26, pts:1352 },
  ],
};

// ── Helpers ────────────────────────────────────────────────────────
const lhMgrById = (id) => LH_MANAGERS.find(m => m.id === id) || { mono:'???', name:'Unknown', hue:'#8B95A1' };
const lhStanding = (id) => LH_STANDINGS.find(s => s.id === id);
const lhSpark = (arr) => {
  const max = Math.max(...arr.map(v=>Math.abs(v)));
  return { max, arr };
};

Object.assign(window, {
  LH_MANAGERS, LH_STANDINGS, LH_ACTIVITY, LH_FRONTPAGE,
  LH_BETS, LH_BETTING_PERF, LH_BET_SERIES,
  LH_AUCTIONS, LH_AUCTION_DETAIL,
  LH_CHAT, LH_STATS,
  lhMgrById, lhStanding, lhSpark,
});
