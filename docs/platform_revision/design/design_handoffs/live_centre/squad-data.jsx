/* global React */
// Shared squad data — the same XI shown across all directions.
// Coordinates are normalized 0..100 (x left→right, y top→bottom inside the pitch).

const SQUAD = [
  // GK
  { id:'all', name:'Alisson',   short:'ALI', last:'ALISSON', club:'LIV', country:'BRA', pos:'GK',  no:1,  pts:4,  status:'fit',   cap:false, x:50, y:92 },
  // DEF (4)
  { id:'hak', name:'Hakimi',    short:'HAK', last:'HAKIMI',  club:'PSG', country:'MAR', pos:'DEF', no:2,  pts:6,  status:'fit',   cap:false, x:14, y:70 },
  { id:'dia', name:'Rúben Dias',short:'DIA', last:'DIAS',    club:'MCI', country:'POR', pos:'DEF', no:3,  pts:5,  status:'doubt', cap:false, x:38, y:70 },
  { id:'sal', name:'Saliba',    short:'SAL', last:'SALIBA',  club:'ARS', country:'FRA', pos:'DEF', no:4,  pts:7,  status:'fit',   cap:false, x:62, y:70 },
  { id:'arn', name:'Arnold',    short:'ARN', last:'ARNOLD',  club:'LIV', country:'ENG', pos:'DEF', no:66, pts:3,  status:'fit',   cap:false, x:86, y:70 },
  // MID (3)
  { id:'bel', name:'Bellingham',short:'BEL', last:'BELLING.',club:'RMA', country:'ENG', pos:'MID', no:5,  pts:4,  status:'fit',   cap:false, x:22, y:46 },
  { id:'ped', name:'Pedri',     short:'PED', last:'PEDRI',   club:'BAR', country:'ESP', pos:'MID', no:8,  pts:5,  status:'doubt', cap:false, x:50, y:46 },
  { id:'kdb', name:'De Bruyne', short:'KDB', last:'BRUYNE',  club:'MCI', country:'BEL', pos:'MID', no:17, pts:6,  status:'fit',   cap:false, x:78, y:46 },
  // FWD (3)
  { id:'val', name:'Valverde',  short:'VAL', last:'VALVERDE',club:'RMA', country:'URU', pos:'FWD', no:15, pts:4,  status:'fit',   cap:false, x:14, y:22 },
  { id:'mba', name:'Mbappé',    short:'MBA', last:'MBAPPÉ',  club:'RMA', country:'FRA', pos:'FWD', no:9,  pts:12, status:'out',   cap:true,  x:50, y:22 },
  { id:'vin', name:'Vinicius',  short:'VIN', last:'VINI JR.',club:'RMA', country:'BRA', pos:'FWD', no:7,  pts:8,  status:'fit',   cap:false, x:86, y:22 },
];

// Club color map (used by Direction 4 and accents elsewhere)
const CLUB_COLOR = {
  RMA:'#FFFFFF', LIV:'#C8102E', BAR:'#A50044', MCI:'#6CABDD',
  ARS:'#EF0107', PSG:'#004170',
};
const CLUB_INK = {
  RMA:'#0A2240', LIV:'#FFFFFF', BAR:'#FFED02', MCI:'#1C2C5B',
  ARS:'#FFFFFF', PSG:'#DA291C',
};

const STATUS_COLOR = { fit:'var(--positive)', doubt:'var(--gold)', out:'var(--danger)' };

// Tiny inline SVG pitch (chalk lines) used by several directions.
function PitchLines({ stroke='rgba(242,238,229,.18)', strokeWidth=1.5 }){
  return (
    <svg viewBox="0 0 600 900" preserveAspectRatio="none"
         style={{position:'absolute',inset:0,width:'100%',height:'100%'}}>
      <g fill="none" stroke={stroke} strokeWidth={strokeWidth}>
        <rect x="20" y="20" width="560" height="860" />
        <line x1="20" y1="450" x2="580" y2="450" />
        <circle cx="300" cy="450" r="78" />
        <circle cx="300" cy="450" r="3" fill={stroke} stroke="none" />
        {/* Top box */}
        <rect x="160" y="20" width="280" height="120" />
        <rect x="220" y="20" width="160" height="50" />
        <circle cx="300" cy="120" r="3" fill={stroke} stroke="none" />
        <path d="M 240 140 A 70 70 0 0 0 360 140" />
        {/* Bottom box */}
        <rect x="160" y="760" width="280" height="120" />
        <rect x="220" y="830" width="160" height="50" />
        <circle cx="300" cy="780" r="3" fill={stroke} stroke="none" />
        <path d="M 240 760 A 70 70 0 0 1 360 760" />
        {/* Corners */}
        <path d="M 20 32 A 12 12 0 0 0 32 20" />
        <path d="M 568 20 A 12 12 0 0 0 580 32" />
        <path d="M 20 868 A 12 12 0 0 1 32 880" />
        <path d="M 568 880 A 12 12 0 0 1 580 868" />
      </g>
    </svg>
  );
}

window.SQUAD = SQUAD;
window.CLUB_COLOR = CLUB_COLOR;
window.CLUB_INK = CLUB_INK;
window.STATUS_COLOR = STATUS_COLOR;
window.PitchLines = PitchLines;
