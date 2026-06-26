/* global React, lhMgrById, LH_STANDINGS, MgrTag */

// ──────────────────────────────────────────────────────────────────
// MOBILE — Shared shell + hub chrome for the LEAGUE HUB.
// 390 design width. Matches the LivePhoneShell vocabulary
// (FORZAKIT wordmark, status bar, mono tab strip).
// ──────────────────────────────────────────────────────────────────

function PhoneShell({children, dark=true}){
  return (
    <div style={{
      width:'100%',height:'100%',
      background: dark ? 'var(--ink)' : '#F2EEE5',
      display:'flex',flexDirection:'column',
      fontFamily:'Archivo, sans-serif',
      color: dark ? 'var(--paper)' : '#0A0E14',
      position:'relative',
      overflow:'hidden',
    }}>
      <div style={{height:32,display:'flex',justifyContent:'space-between',alignItems:'center',padding:'0 22px',color: dark ? 'var(--paper)' : '#0A0E14',fontFamily:'JetBrains Mono',fontSize:11,fontWeight:600,flexShrink:0}}>
        <span>9:41</span><span>●●● ▮</span>
      </div>
      {children}
    </div>
  );
}

// Top app strip — FORZAKIT wordmark + global tabs (Scores/Squad/LEAGUE/Live/Market).
// We're inside LEAGUE.
function AppTopbar({active='LEAGUE'}){
  return (
    <>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'8px 18px 12px'}}>
        <div style={{fontFamily:'Archivo Black',fontSize:18,letterSpacing:'-0.01em'}}>FORZA<span style={{color:'var(--cyan)'}}>KIT</span></div>
        <div style={{display:'flex',alignItems:'center',gap:14}}>
          <span style={{display:'inline-flex',alignItems:'center',gap:5}}>
            <span style={{width:6,height:6,borderRadius:'50%',background:'var(--warn)'}}/>
            <span className="mono" style={{fontSize:9,color:'var(--mute)',letterSpacing:'.18em'}}>3</span>
          </span>
          <span className="mono" style={{fontSize:9,color:'var(--positive)',letterSpacing:'.18em'}}>● LIVE</span>
        </div>
      </div>
      <div style={{display:'flex',gap:18,padding:'10px 18px 0',borderBottom:'1px solid var(--rule)'}}>
        {['SCORES','SQUAD','LEAGUE','LIVE','MARKET'].map(t => (
          <div key={t} className="mono" style={{
            fontSize:10,letterSpacing:'.18em',paddingBottom:8,position:'relative',
            color:t===active?'var(--paper)':'var(--mute)',
          }}>
            {t}
            {t==='LIVE' && <span style={{display:'inline-block',width:5,height:5,borderRadius:'50%',background:'var(--danger)',marginLeft:5,verticalAlign:'middle'}}/>}
            {t===active && <span style={{position:'absolute',left:0,right:0,bottom:-1,height:2,background:'var(--cyan)'}}/>}
          </div>
        ))}
      </div>
    </>
  );
}

// Header that says "you are inside OFFICE HEROES" — sits below the top
// app strip on every hub tab.
function HubLeagueHeader({backable=false, title}){
  return (
    <div style={{padding:'12px 18px 8px',borderBottom:'1px solid var(--rule)'}}>
      <div style={{display:'flex',alignItems:'center',gap:8}}>
        {backable ? (
          <span className="mono" style={{fontSize:10,color:'var(--mute)',letterSpacing:'.22em'}}>← BACK</span>
        ) : (
          <>
            <span className="mono" style={{fontSize:9,color:'var(--mute)',letterSpacing:'.22em'}}>COMPETITIVE</span>
            <span className="mono" style={{fontSize:9,color:'var(--mute)'}}>·</span>
            <span className="mono" style={{fontSize:9,color:'var(--mute)',letterSpacing:'.22em'}}>14 MGRS</span>
            <span className="mono" style={{fontSize:9,color:'var(--mute)',marginLeft:'auto',letterSpacing:'.22em'}}>GW 28</span>
          </>
        )}
      </div>
      <div style={{display:'flex',alignItems:'center',gap:10,marginTop:6}}>
        <span style={{width:7,height:7,borderRadius:'50%',background:'#00B4D8'}}/>
        <span className="display" style={{fontSize: backable ? 18 : 22,letterSpacing:'-0.02em'}}>{title || 'OFFICE HEROES'}</span>
      </div>
    </div>
  );
}

// Scrollable hub-tab pills — 7 hub tabs don't fit on 390 width so we
// scroll horizontally. Active = cyan filled, others = muted outline.
function HubTabPills({active='leaderboard'}){
  const tabs = [
    {id:'leaderboard', label:'BOARD'},
    {id:'frontpage',   label:'FRONTPAGE'},
    {id:'bets',        label:'BETS', notify:true},
    {id:'betting',     label:'BETTING'},
    {id:'auctions',    label:'AUCTIONS', notify:true},
    {id:'chat',        label:'CHAT', count:3},
    {id:'stats',       label:'STATS'},
    {id:'admin',       label:'⚙ ADMIN'},
  ];
  return (
    <div style={{display:'flex',gap:6,padding:'10px 18px',overflowX:'auto',borderBottom:'1px solid var(--rule)',scrollbarWidth:'none'}}>
      {tabs.map(t => {
        const isActive = t.id === active;
        return (
          <span key={t.id} style={{
            flex:'0 0 auto',padding:'7px 12px',
            background: isActive ? 'var(--cyan)' : 'transparent',
            border: isActive ? '1px solid var(--cyan)' : '1px solid var(--rule)',
            color: isActive ? 'var(--ink)' : 'var(--mute)',
            fontFamily:'JetBrains Mono,monospace',fontSize:10,letterSpacing:'.18em',fontWeight:600,
            display:'inline-flex',alignItems:'center',gap:5,
          }}>
            {t.label}
            {t.notify && !isActive && <span style={{width:5,height:5,borderRadius:'50%',background:'var(--danger)'}}/>}
            {t.count && !isActive && <span style={{color:'var(--cyan)',fontSize:9}}>{t.count}</span>}
          </span>
        );
      })}
    </div>
  );
}

// Big primary CTA chip (used at the bottom of some screens)
function PrimaryCTA({label, tone='var(--cyan)', sub}){
  return (
    <button style={{
      width:'100%',padding:'14px',
      background:tone,color:'var(--ink)',border:0,
      fontFamily:'Archivo Black,sans-serif',fontSize:13,letterSpacing:'.16em',cursor:'pointer',
      display:'flex',alignItems:'center',justifyContent:'center',gap:8,
    }}>
      {label} {sub && <span style={{fontFamily:'JetBrains Mono,monospace',fontSize:10,color:'rgba(8,10,14,.6)',letterSpacing:'.14em',fontWeight:600}}>· {sub}</span>}
    </button>
  );
}

// Tiny W/D/L pills (3 last instead of 5 to fit mobile width)
function MobFormDots({form, max=3}){
  const tone = { W:'var(--positive)', D:'var(--mute)', L:'var(--danger)' };
  return (
    <span style={{display:'inline-flex',gap:2}}>
      {form.slice(0, max).map((f,i) => (
        <span key={i} style={{
          width:12,height:12,
          display:'inline-flex',alignItems:'center',justifyContent:'center',
          background:`${tone[f]}22`,border:`1px solid ${tone[f]}55`,
          fontFamily:'JetBrains Mono,monospace',fontSize:8,color:tone[f],fontWeight:600,
        }}>{f}</span>
      ))}
    </span>
  );
}

// Section header — same vocabulary as desktop but smaller
function MobSection({label, sub, tone='var(--cyan)', right}){
  return (
    <div style={{
      display:'flex',alignItems:'center',gap:8,
      padding:'14px 18px 6px',
    }}>
      <span style={{width:3,height:12,background:tone}}/>
      <span className="mono" style={{fontSize:10,color:'var(--paper)',letterSpacing:'.22em'}}>{label}</span>
      {sub && <span className="mono" style={{fontSize:9,color:'var(--mute)',letterSpacing:'.16em'}}>· {sub}</span>}
      <span style={{flex:1}}/>
      {right}
    </div>
  );
}

Object.assign(window, {
  PhoneShell, AppTopbar, HubLeagueHeader, HubTabPills,
  PrimaryCTA, MobFormDots, MobSection,
});
