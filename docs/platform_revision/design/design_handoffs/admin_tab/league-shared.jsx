/* global React, LH_MANAGERS, lhMgrById */
// Shared chrome and primitives for the LEAGUE HUB.

// 3-char monogram badge (matches the "ADM/YOU/DEM" badges from the spec).
function MgrTag({ id, size=18, dim=false }){
  const m = lhMgrById(id);
  return (
    <span style={{
      display:'inline-flex',alignItems:'center',justifyContent:'center',
      minWidth:size+10, height:size, padding:'0 4px',
      background: dim ? 'transparent' : `${m.hue}18`,
      border:`1px solid ${m.hue}${dim?'44':'66'}`,
      color:m.hue,
      fontFamily:'JetBrains Mono,monospace',
      fontSize: size <= 16 ? 9 : 10,
      letterSpacing:'.12em',fontWeight:600,
      lineHeight:1,
    }}>{m.mono}</span>
  );
}

// Big league-hub topbar — "BACK / COMPETITIVE CENTER / OFFICE HEROES".
function HubTopbar({ rightSlot }){
  return (
    <div style={{
      display:'flex',justifyContent:'space-between',alignItems:'center',
      padding:'18px 28px',borderBottom:'1px solid var(--rule)',
      background:'var(--ink)',
    }}>
      <div>
        <div className="mono" style={{fontSize:10,color:'var(--mute)',letterSpacing:'.2em'}}>← BACK · COMPETITIVE CENTER</div>
        <div style={{display:'flex',alignItems:'center',gap:14,marginTop:6}}>
          <span style={{width:8,height:8,borderRadius:'50%',background:'#00B4D8'}}/>
          <div className="display" style={{fontSize:28,letterSpacing:'-0.02em'}}>OFFICE HEROES</div>
          <span className="mono" style={{fontSize:10,color:'var(--mute)',letterSpacing:'.2em'}}>· 14 MEMBERS · GW28</span>
        </div>
      </div>
      <div style={{display:'flex',alignItems:'center',gap:18}}>
        {rightSlot}
        <span className="mono" style={{fontSize:10,color:'var(--mute)',letterSpacing:'.22em'}}>● LIVE</span>
      </div>
    </div>
  );
}

// Manage-squad + Market dual CTA strip
function HubActionBar(){
  return (
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',borderBottom:'1px solid var(--rule)'}}>
      <button style={{
        padding:'14px 18px',background:'transparent',
        borderTop:'none',borderBottom:'none',borderLeft:'none',
        borderRight:'1px solid var(--rule)',color:'var(--purple)',
        fontFamily:'JetBrains Mono,monospace',fontSize:12,letterSpacing:'.22em',
        cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:10,
      }}>
        <span style={{width:14,height:10,border:'1.5px solid currentColor',display:'inline-block'}}/>
        MANAGE SQUAD
      </button>
      <button style={{
        padding:'14px 18px',background:'transparent',border:'none',
        color:'var(--positive)',
        fontFamily:'JetBrains Mono,monospace',fontSize:12,letterSpacing:'.22em',
        cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:10,
      }}>
        <span style={{width:14,height:10,border:'1.5px solid currentColor',display:'inline-block'}}/>
        MARKET
      </button>
    </div>
  );
}

// Tab nav for the 7 hub tabs.
function HubTabs({ active='leaderboard' }){
  const tabs = [
    {id:'leaderboard', label:'LEADERBOARD'},
    {id:'frontpage',   label:'FRONTPAGE'},
    {id:'bets',        label:'BETS', notify:true},
    {id:'betting',     label:'BETTING'},
    {id:'auctions',    label:'AUCTIONS', notify:true},
    {id:'chat',        label:'CHAT', count:3},
    {id:'stats',       label:'STATS'},
    {id:'admin',       label:'⚙ ADMIN', dim:true},
  ];
  return (
    <div style={{display:'flex',borderBottom:'1px solid var(--rule)',padding:'0 28px'}}>
      {tabs.map(t => (
        <div key={t.id} style={{
          padding:'14px 22px',position:'relative',
          fontFamily:'JetBrains Mono,monospace',fontSize:11,letterSpacing:'.22em',
          color: t.id === active ? 'var(--paper)' : (t.dim ? 'var(--mute)' : 'var(--mute)'),
          fontWeight: t.id === active ? 600 : 400,
          cursor:'pointer',
        }}>
          {t.label}
          {t.count && <span style={{marginLeft:8,color:'var(--cyan)',fontSize:10}}>{t.count}</span>}
          {t.notify && <span style={{display:'inline-block',width:5,height:5,borderRadius:'50%',background:'var(--danger)',marginLeft:6,verticalAlign:'middle'}}/>}
          {t.id === active && <span style={{position:'absolute',left:14,right:14,bottom:-1,height:2,background:'var(--cyan)'}}/>}
        </div>
      ))}
    </div>
  );
}

// Trend chip (▲ +2 / ▼ -1 / =)
function TrendPill({ trend }){
  if (trend === 0) return <span style={{color:'var(--mute)',fontFamily:'JetBrains Mono,monospace',fontSize:10}}>=</span>;
  const up = trend > 0;
  return (
    <span style={{
      fontFamily:'JetBrains Mono,monospace',fontSize:10,letterSpacing:'.12em',
      color: up ? 'var(--positive)' : 'var(--danger)',
      display:'inline-flex',alignItems:'center',gap:3,
    }}>
      <span style={{fontFamily:'Archivo Black,sans-serif',fontSize:8}}>{up?'▲':'▼'}</span>
      {Math.abs(trend)}
    </span>
  );
}

// W/D/L form dots
function FormDots({ form }){
  const tone = { W:'var(--positive)', D:'var(--mute)', L:'var(--danger)' };
  return (
    <span style={{display:'inline-flex',gap:3}}>
      {form.map((r,i) => (
        <span key={i} style={{
          width:14,height:14,
          display:'inline-flex',alignItems:'center',justifyContent:'center',
          background:`${tone[r]}22`,border:`1px solid ${tone[r]}55`,
          fontFamily:'JetBrains Mono,monospace',fontSize:8,color:tone[r],fontWeight:600,
        }}>{r}</span>
      ))}
    </span>
  );
}

// Tiny sparkline (used for betting performance and stats).
function Spark({ data, w=88, h=22, tone='var(--cyan)', zero=true }){
  const max = Math.max(...data.map(v=>Math.abs(v)),1);
  const pts = data.map((v,i)=>{
    const x = (i/(data.length-1))*w;
    const y = h/2 - (v/max)*(h/2 - 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      {zero && <line x1="0" y1={h/2} x2={w} y2={h/2} stroke="var(--rule)" strokeDasharray="2,2"/>}
      <polyline points={pts} fill="none" stroke={tone} strokeWidth="1.5"/>
      {data.map((v,i) => {
        const x = (i/(data.length-1))*w;
        const y = h/2 - (v/max)*(h/2 - 2);
        return <circle key={i} cx={x} cy={y} r="1.5" fill={tone}/>;
      })}
    </svg>
  );
}

// Section header bar
function HubSectionLabel({ label, sub, tone='var(--cyan)', right }){
  return (
    <div style={{
      display:'flex',alignItems:'center',gap:10,
      padding:'12px 20px',borderBottom:'1px solid var(--rule)',
      background:'var(--ink-2)',
    }}>
      <span style={{width:3,height:14,background:tone}}/>
      <span className="mono" style={{fontSize:11,color:'var(--paper)',letterSpacing:'.22em'}}>{label}</span>
      {sub && <span className="mono" style={{fontSize:9,color:'var(--mute)',letterSpacing:'.18em'}}>· {sub}</span>}
      <span style={{flex:1}}/>
      {right}
    </div>
  );
}

Object.assign(window, {
  MgrTag, HubTopbar, HubActionBar, HubTabs, TrendPill, FormDots, Spark, HubSectionLabel,
});
