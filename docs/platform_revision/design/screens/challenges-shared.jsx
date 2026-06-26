// ============================================================
// CHALLENGES SHARED — Kit Light tokens + micro-components
// ============================================================

const T = {
  bg:     '#F7F3ED',
  card:   '#FFFFFF',
  elev:   '#EDEAE2',
  shell:  '#18202E',
  shell2: '#202B3D',
  text:   '#18202E',
  text2:  '#4B5568',
  mute:   '#8A97A8',
  rule:   '#E2DDD5',
  rule2:  '#ECE7DF',
  accent: '#1A6FA8',
  accBg:  'rgba(26,111,168,.08)',
  gold:   '#B8720E',
  goldBg: 'rgba(184,114,14,.07)',
  goldBd: 'rgba(184,114,14,.28)',
  goldBr: 'rgba(184,114,14,.18)',
  pos:    '#166534',
  posBg:  'rgba(22,101,52,.10)',
  neg:    '#B91C1C',
  negBg:  'rgba(185,28,28,.08)',
  r:      6,
};

// ── CoinIcon ────────────────────────────────────────────────
function CoinIcon({ size }) {
  const sz = size || 16;
  return (
    <span style={{
      display:'inline-flex', alignItems:'center', justifyContent:'center',
      width:sz, height:sz, borderRadius:'50%', flexShrink:0,
      background:'linear-gradient(145deg,#D4880F 0%,#B8720E 100%)',
      color:'#fff', fontFamily:"'Archivo Black',sans-serif",
      fontSize:Math.round(sz * 0.5), lineHeight:1,
      boxShadow:'inset 0 -1px 0 rgba(0,0,0,.2)',
    }}>C</span>
  );
}

// ── CoinAmt ─────────────────────────────────────────────────
function CoinAmt({ amount, size, color }) {
  const s = size || 'md';
  const map = { xl:{fs:40,ic:26,gap:9}, lg:{fs:22,ic:18,gap:6}, md:{fs:16,ic:14,gap:5}, sm:{fs:12,ic:11,gap:4} };
  const c = map[s] || map.md;
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:c.gap }}>
      <CoinIcon size={c.ic}/>
      <span style={{ fontFamily:"'Archivo Black',sans-serif", fontSize:c.fs, color:color||T.gold, letterSpacing:'-0.02em', lineHeight:1 }}>
        {typeof amount === 'number' ? amount.toLocaleString() : amount}
      </span>
    </span>
  );
}

// ── PropBadge ────────────────────────────────────────────────
const PROP_META = {
  GW_TOTAL:     { label:'GW Total',    color:T.accent, bg:T.accBg  },
  PLAYER_DUEL:  { label:'Player Duel', color:T.gold,   bg:T.goldBg },
  MATCH_RESULT: { label:'Match Result',color:T.pos,    bg:T.posBg  },
};

function PropBadge({ type, small }) {
  const m = PROP_META[type] || { label:type, color:T.mute, bg:T.elev };
  return (
    <span style={{
      fontFamily:"'JetBrains Mono',monospace", fontWeight:500, display:'inline-block',
      fontSize:small?8:9, letterSpacing:'.1em', textTransform:'uppercase',
      padding:small?'3px 6px':'4px 9px', borderRadius:100,
      color:m.color, background:m.bg, whiteSpace:'nowrap',
    }}>{m.label}</span>
  );
}

// ── LiveDot ──────────────────────────────────────────────────
function LiveDot() {
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:5 }}>
      <style>{`@keyframes ck-pulse{0%,100%{opacity:1}50%{opacity:.3}}`}</style>
      <span style={{
        width:7, height:7, borderRadius:'50%', background:T.pos, flexShrink:0,
        boxShadow:'0 0 0 2px rgba(22,101,52,.2)',
        animation:'ck-pulse 1.8s ease-in-out infinite',
      }}/>
      <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:8.5, letterSpacing:'.12em', textTransform:'uppercase', color:T.pos, fontWeight:500 }}>Live</span>
    </span>
  );
}

// ── RankBadge ────────────────────────────────────────────────
function RankBadge({ rank }) {
  const top = rank <= 3;
  return (
    <span style={{
      fontFamily:"'JetBrains Mono',monospace", fontSize:8.5, letterSpacing:'.06em',
      color:top?T.accent:T.mute, padding:'2px 5px', borderRadius:3,
      background:top?T.accBg:T.elev, fontWeight:500,
    }}>#{rank}</span>
  );
}

// ── SectionLabel ─────────────────────────────────────────────
function SectionLabel({ label, count, urgent }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:7, marginBottom:10 }}>
      <span style={{
        fontFamily:"'JetBrains Mono',monospace", fontSize:9, letterSpacing:'.16em',
        textTransform:'uppercase', fontWeight:500, color:urgent?T.gold:T.mute,
      }}>{label}</span>
      {count != null && (
        <span style={{
          fontFamily:"'JetBrains Mono',monospace", fontSize:8.5,
          background:urgent?T.goldBg:T.elev, color:urgent?T.gold:T.mute,
          padding:'1px 7px', borderRadius:100, fontWeight:600,
        }}>{count}</span>
      )}
    </div>
  );
}

// ── IncomingCard ─────────────────────────────────────────────
function IncomingCard({ ch }) {
  return (
    <div style={{
      background:T.card, border:`1px solid ${T.goldBd}`,
      borderLeft:`3px solid ${T.gold}`, borderRadius:T.r,
      padding:'12px 14px', display:'flex', flexDirection:'column', gap:9,
    }}>
      <div style={{ display:'flex', alignItems:'center', gap:7, flexWrap:'wrap' }}>
        <span style={{ fontFamily:"'Archivo Black',sans-serif", fontSize:14, color:T.text, letterSpacing:'-0.01em' }}>{ch.from.name}</span>
        <RankBadge rank={ch.from.rank}/>
        <PropBadge type={ch.type} small/>
        <span style={{ marginLeft:'auto', fontFamily:"'JetBrains Mono',monospace", fontSize:8.5, color:T.gold, letterSpacing:'.04em' }}>⏱ {ch.expiry}</span>
      </div>
      <div style={{ fontSize:13, color:T.text2, lineHeight:1.45 }}>{ch.summary}</div>
      <div style={{ display:'flex', alignItems:'center', gap:18 }}>
        <div>
          <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:7.5, letterSpacing:'.12em', textTransform:'uppercase', color:T.mute, marginBottom:3 }}>Stake each</div>
          <CoinAmt amount={ch.stake}/>
        </div>
        <div>
          <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:7.5, letterSpacing:'.12em', textTransform:'uppercase', color:T.mute, marginBottom:3 }}>Net win</div>
          <CoinAmt amount={ch.netWin} color={T.pos}/>
        </div>
      </div>
      <div style={{ display:'flex', gap:8 }}>
        <button style={{
          flex:1, padding:'10px 0', borderRadius:T.r, cursor:'pointer',
          background:'transparent', border:`1.5px solid ${T.gold}`,
          fontFamily:"'JetBrains Mono',monospace", fontSize:9.5, letterSpacing:'.14em',
          textTransform:'uppercase', fontWeight:600, color:T.gold,
        }}>Accept</button>
        <button style={{
          flex:1, padding:'10px 0', borderRadius:T.r, cursor:'pointer',
          background:'transparent', border:`1px solid ${T.rule}`,
          fontFamily:"'JetBrains Mono',monospace", fontSize:9.5, letterSpacing:'.14em',
          textTransform:'uppercase', fontWeight:500, color:T.text2,
        }}>Decline</button>
      </div>
    </div>
  );
}

// ── OpenCard ─────────────────────────────────────────────────
function OpenCard({ ch }) {
  return (
    <div style={{
      background:T.card, border:`1px solid ${T.rule}`,
      borderLeft:`3px solid ${T.accent}`, borderRadius:T.r,
      padding:'12px 14px', display:'flex', flexDirection:'column', gap:8,
    }}>
      <div style={{ display:'flex', alignItems:'center', gap:7, flexWrap:'wrap' }}>
        <span style={{ fontFamily:"'Archivo Black',sans-serif", fontSize:14, color:T.text }}>→ {ch.to.name}</span>
        <RankBadge rank={ch.to.rank}/>
        <PropBadge type={ch.type} small/>
        <span style={{ marginLeft:'auto', fontFamily:"'JetBrains Mono',monospace", fontSize:8, color:T.mute }}>Awaiting · {ch.expiry}</span>
      </div>
      <div style={{ fontSize:13, color:T.text2, lineHeight:1.45 }}>{ch.summary}</div>
      <div style={{ display:'flex', alignItems:'center', gap:5 }}>
        <CoinAmt amount={ch.stake} size='sm'/>
        <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:8.5, color:T.mute }}>staked</span>
      </div>
    </div>
  );
}

// ── ActiveCard ───────────────────────────────────────────────
function ActiveCard({ ch }) {
  const leading = ch.myScore > ch.theirScore;
  const diff = Math.abs(ch.myScore - ch.theirScore);
  return (
    <div style={{
      background:T.card, border:`1px solid rgba(22,101,52,.28)`,
      borderLeft:`3px solid ${T.pos}`, borderRadius:T.r,
      padding:'12px 14px', display:'flex', flexDirection:'column', gap:10,
    }}>
      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
        <LiveDot/>
        <span style={{ flex:1, fontFamily:"'JetBrains Mono',monospace", fontSize:9, color:T.mute, letterSpacing:'.06em' }}>{ch.gw} · vs {ch.opp.name}</span>
        <PropBadge type={ch.type} small/>
      </div>
      <div style={{ display:'flex', borderRadius:T.r, overflow:'hidden', border:`1px solid ${T.rule}` }}>
        <div style={{ flex:1, padding:'10px 12px', textAlign:'center', background:leading?T.posBg:'transparent' }}>
          <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:7.5, letterSpacing:'.12em', textTransform:'uppercase', color:T.mute, marginBottom:4 }}>You</div>
          <div style={{ fontFamily:"'Archivo Black',sans-serif", fontSize:28, color:leading?T.pos:T.text, letterSpacing:'-0.02em', lineHeight:1 }}>{ch.myScore}</div>
          <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:7, color:T.mute, marginTop:2 }}>pts</div>
        </div>
        <div style={{ width:1, background:T.rule, alignSelf:'stretch' }}/>
        <div style={{ flex:1, padding:'10px 12px', textAlign:'center', background:!leading?T.posBg:'transparent' }}>
          <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:7.5, letterSpacing:'.12em', textTransform:'uppercase', color:T.mute, marginBottom:4 }}>{ch.opp.name}</div>
          <div style={{ fontFamily:"'Archivo Black',sans-serif", fontSize:28, color:!leading?T.pos:T.text, letterSpacing:'-0.02em', lineHeight:1 }}>{ch.theirScore}</div>
          <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:7, color:T.mute, marginTop:2 }}>pts</div>
        </div>
      </div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:9, color:leading?T.pos:T.neg, letterSpacing:'.04em' }}>
          {leading ? `↑ You lead by ${diff} pts` : `↓ Trailing by ${diff} pts`}
        </span>
        <CoinAmt amount={ch.stake} size='sm'/>
      </div>
    </div>
  );
}

// ── SettledCard ──────────────────────────────────────────────
function SettledCard({ ch }) {
  const win = ch.result === 'win';
  const loss = ch.result === 'loss';
  const clr = win ? T.pos : loss ? T.neg : T.mute;
  const displayAmt = ch.payout > 0 ? ch.payout : (ch.result === 'draw' ? ch.stake : ch.payout);
  const prefix = win ? '+' : loss ? '−' : '';
  return (
    <div style={{
      background:T.card, border:`1px solid ${T.rule}`, borderRadius:T.r,
      padding:'10px 14px', display:'flex', alignItems:'center', gap:12,
    }}>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:7, marginBottom:3 }}>
          <span style={{ fontFamily:"'Archivo Black',sans-serif", fontSize:13, color:T.text, letterSpacing:'-0.01em' }}>
            {win ? 'You won' : loss ? `${ch.opp.name} won` : 'No result'}
          </span>
          <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:8, color:T.mute }}>vs {ch.opp.name} · {ch.gw}</span>
        </div>
        <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:8, color:T.mute, letterSpacing:'.04em' }}>
          {ch.typeLabel}{ch.note ? ` · ${ch.note}` : (ch.myScore != null ? ` · ${ch.myScore}—${ch.theirScore} pts` : '')}
        </div>
      </div>
      <div style={{ textAlign:'right', flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:4 }}>
          <span style={{ fontFamily:"'Archivo Black',sans-serif", fontSize:15, color:clr, letterSpacing:'-0.02em' }}>
            {prefix}{displayAmt}
          </span>
          <CoinIcon size={11}/>
        </div>
        {win && <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:7.5, color:T.mute, marginTop:1 }}>after rake</div>}
        {ch.result === 'draw' && <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:7.5, color:T.mute }}>returned</div>}
      </div>
    </div>
  );
}

// ── Mobile shell parts ────────────────────────────────────────
function MobileStatusBar() {
  return (
    <div style={{ background:T.shell, padding:'8px 16px 6px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
      <span style={{ fontFamily:"'Archivo Black',sans-serif", fontSize:12, color:'#fff' }}>9:41</span>
      <div style={{ display:'flex', gap:4, alignItems:'center' }}>
        <div style={{ width:14, height:8, borderRadius:2, background:'rgba(255,255,255,.4)' }}/>
        <div style={{ width:11, height:8, borderRadius:2, background:'rgba(255,255,255,.4)' }}/>
        <div style={{ width:18, height:9, borderRadius:2, border:'1.5px solid rgba(255,255,255,.5)', display:'flex', alignItems:'center', padding:'0 2px' }}>
          <div style={{ height:5, background:'rgba(255,255,255,.75)', borderRadius:1, width:11 }}/>
        </div>
      </div>
    </div>
  );
}

function MobileBottomNav({ active }) {
  const tabs = ['Scores','League','Squad','Live','Market'];
  const act = active || 'league';
  return (
    <div style={{ background:T.shell, borderTop:'1px solid rgba(255,255,255,.07)', padding:'8px 0 10px', display:'flex', justifyContent:'space-around' }}>
      {tabs.map(t => {
        const on = t.toLowerCase() === act;
        return (
          <div key={t} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
            <div style={{ width:5, height:5, borderRadius:'50%', background:on?T.accent:'rgba(255,255,255,.2)' }}/>
            <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:7, letterSpacing:'.06em', textTransform:'uppercase', color:on?'#fff':'rgba(255,255,255,.35)' }}>{t}</span>
          </div>
        );
      })}
    </div>
  );
}

function MobileFlowHeader({ title, step, totalSteps, subtitle }) {
  return (
    <div style={{ background:T.shell }}>
      <MobileStatusBar/>
      <div style={{ padding:'10px 16px 12px', display:'flex', alignItems:'center', gap:12 }}>
        <div style={{ width:28, height:28, borderRadius:14, background:'rgba(255,255,255,.08)', display:'flex', alignItems:'center', justifyContent:'center', color:'rgba(255,255,255,.7)', fontSize:14 }}>←</div>
        <div style={{ flex:1 }}>
          <div style={{ fontFamily:"'Archivo Black',sans-serif", fontSize:17, color:'#fff', letterSpacing:'-0.01em' }}>{title}</div>
          {subtitle && <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:9, color:'rgba(255,255,255,.42)', letterSpacing:'.08em', marginTop:2 }}>{subtitle}</div>}
        </div>
        {step && <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:9, color:'rgba(255,255,255,.42)', letterSpacing:'.08em' }}>Step {step} of {totalSteps}</span>}
      </div>
      {step && (
        <div style={{ display:'flex', gap:4, padding:'0 16px 14px' }}>
          {Array.from({ length:totalSteps }, (_, i) => (
            <div key={i} style={{ flex:1, height:3, borderRadius:3, background:i < step ? T.accent : 'rgba(255,255,255,.15)' }}/>
          ))}
        </div>
      )}
    </div>
  );
}

function DesktopSidebar({ active }) {
  const act = active || 'league';
  const navItems = ['Scores','League','Squad','Live','Market'];
  return (
    <div style={{ width:200, background:T.shell, display:'flex', flexDirection:'column', padding:'16px 12px', flexShrink:0 }}>
      <div style={{ display:'flex', alignItems:'center', gap:8, padding:'0 6px 16px', marginBottom:8, borderBottom:'1px solid rgba(255,255,255,.08)' }}>
        <div style={{ width:24, height:24, borderRadius:5, background:T.accent, display:'grid', placeItems:'center', fontFamily:"'Archivo Black',sans-serif", fontSize:11, color:'#fff' }}>F</div>
        <span style={{ fontFamily:"'Archivo Black',sans-serif", fontSize:13, color:'#fff', letterSpacing:'-0.01em' }}>FantasyKit</span>
      </div>
      <div style={{ display:'flex', flexDirection:'column', gap:2 }}>
        {navItems.map(item => {
          const on = item.toLowerCase() === act;
          return (
            <div key={item} style={{
              display:'flex', alignItems:'center', gap:9, padding:'8px 10px', borderRadius:T.r,
              background:on?'rgba(255,255,255,.07)':'transparent',
              color:on?'#fff':'rgba(255,255,255,.44)',
              fontFamily:"'Archivo',sans-serif", fontSize:13, fontWeight:500, cursor:'pointer',
            }}>
              <div style={{ width:6, height:6, borderRadius:'50%', background:on?T.accent:'currentColor', opacity:on?1:.5 }}/>
              {item}
            </div>
          );
        })}
      </div>
    </div>
  );
}

Object.assign(window, {
  T, CoinIcon, CoinAmt, PropBadge, LiveDot, RankBadge, SectionLabel,
  IncomingCard, OpenCard, ActiveCard, SettledCard,
  MobileStatusBar, MobileBottomNav, MobileFlowHeader, DesktopSidebar,
  PROP_META,
});
