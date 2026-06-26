/* global React, LH_CHAT, LH_STATS, LH_MANAGERS, lhMgrById,
   PhoneShell, AppTopbar, HubLeagueHeader, HubTabPills, MobSection, MgrTag */

const reactIcon = { fire:'🔥', shake:'🤝', pray:'🙏', cry:'😭', crown:'👑' };

// ──────────────────────────────────────────────────────────────────
// MOBILE · CHAT — channel switcher rail collapses into a top pill bar.
// ──────────────────────────────────────────────────────────────────

function MobChat(){
  const pinned = LH_CHAT.find(m => m.pinned);
  return (
    <PhoneShell>
      <AppTopbar/>
      <HubLeagueHeader/>
      <HubTabPills active="chat"/>

      {/* Channel pills */}
      <div style={{display:'flex',gap:6,padding:'10px 18px',overflowX:'auto',borderBottom:'1px solid var(--rule)',scrollbarWidth:'none'}}>
        {[
          {id:'lc', name:'#league-chat', active:true, unread:3},
          {id:'tk', name:'#trash-talk', active:false, unread:12},
          {id:'au', name:'#auction-house', active:false, unread:0},
          {id:'bx', name:'#bets-and-bonus', active:false, unread:5},
          {id:'tn', name:'#tactics-notes', active:false, unread:0},
        ].map(c => (
          <span key={c.id} style={{
            flex:'0 0 auto',padding:'6px 10px',
            background: c.active ? 'rgba(0,180,216,.08)' : 'transparent',
            border: c.active ? '1px solid var(--cyan)' : '1px solid var(--rule)',
            color: c.active ? 'var(--cyan)' : 'var(--mute)',
            fontFamily:'Archivo Black,sans-serif',fontSize:11,letterSpacing:'-0.01em',
            display:'inline-flex',alignItems:'center',gap:5,
          }}>
            {c.name}
            {c.unread > 0 && <span style={{background:'var(--danger)',color:'#fff',fontFamily:'JetBrains Mono,monospace',fontSize:8,padding:'0 4px',letterSpacing:'.1em'}}>{c.unread}</span>}
          </span>
        ))}
      </div>

      {/* Pinned banner */}
      {pinned && (
        <div style={{padding:'8px 18px',background:'rgba(224,168,0,.06)',borderBottom:'1px solid var(--gold)44',display:'flex',gap:8,alignItems:'flex-start'}}>
          <span style={{fontFamily:'Archivo Black',fontSize:8,color:'var(--gold)',padding:'2px 5px',background:'rgba(224,168,0,.18)',letterSpacing:'.18em',flexShrink:0}}>PINNED</span>
          <span style={{fontFamily:'Archivo,sans-serif',fontSize:11,color:'var(--paper)',lineHeight:1.4}}>“{pinned.txt}” <span className="mono" style={{color:'var(--mute)',fontSize:9,letterSpacing:'.16em'}}>— @{lhMgrById(pinned.who).handle.slice(1)}</span></span>
        </div>
      )}

      {/* Date divider */}
      <div style={{display:'flex',alignItems:'center',gap:8,padding:'10px 18px 4px'}}>
        <div style={{flex:1,height:1,background:'var(--rule)'}}/>
        <span className="mono" style={{fontSize:9,color:'var(--mute)',letterSpacing:'.22em'}}>TODAY · SAT MAY 11</span>
        <div style={{flex:1,height:1,background:'var(--rule)'}}/>
      </div>

      <div style={{flex:1,overflow:'auto'}}>
        {LH_CHAT.map(m => <MobMessage key={m.id} m={m}/>)}
        <div style={{height:14}}/>
      </div>

      {/* Composer */}
      <div style={{borderTop:'1px solid var(--rule)',padding:'10px 14px',background:'var(--ink-2)',display:'flex',gap:8,alignItems:'center'}}>
        <MgrTag id="you" size={20}/>
        <div style={{
          flex:1,padding:'8px 12px',background:'var(--ink)',border:'1px solid var(--rule)',
          fontFamily:'Archivo,sans-serif',fontSize:12,color:'var(--mute)',
        }}>Roast your rivals…</div>
        <button style={{
          padding:'8px 12px',background:'var(--cyan)',color:'var(--ink)',border:0,
          fontFamily:'Archivo Black,sans-serif',fontSize:11,letterSpacing:'.16em',cursor:'pointer',
        }}>↵</button>
      </div>
    </PhoneShell>
  );
}

function MobMessage({m}){
  const mgr = lhMgrById(m.who);
  const isYou = m.who === 'you';
  return (
    <div style={{padding:'6px 18px 6px',display:'grid',gridTemplateColumns:'30px 1fr',gap:8,alignItems:'flex-start'}}>
      <div style={{paddingTop:2}}>
        <MgrTag id={m.who} size={20}/>
      </div>
      <div>
        <div style={{display:'flex',alignItems:'baseline',gap:6}}>
          <span style={{fontFamily:'Archivo Black',fontSize:12,color:mgr.hue}}>{isYou?'You':mgr.name}</span>
          <span className="mono" style={{fontSize:8,color:'var(--mute)',letterSpacing:'.16em'}}>{m.t}</span>
          {m.system && <SystemBadge kind={m.system}/>}
        </div>
        <div style={{fontFamily:'Archivo,sans-serif',fontSize:12,color:'var(--paper)',marginTop:2,lineHeight:1.4}}>{renderMentions(m.txt)}</div>
        {m.react && m.react.length > 0 && (
          <div style={{display:'flex',gap:4,marginTop:4,flexWrap:'wrap'}}>
            {m.react.map((r,i) => (
              <span key={i} style={{
                display:'inline-flex',alignItems:'center',gap:3,
                padding:'1px 6px',background:'var(--ink-2)',border:'1px solid var(--rule)',
                fontFamily:'JetBrains Mono,monospace',fontSize:9,color:'var(--mute)',
              }}>{reactIcon[r.e]} {r.n}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function renderMentions(txt){
  const parts = [];
  const re = /(@[a-z._]+|\/[a-z]+)/gi;
  let last = 0; let i = 0; let match;
  while ((match = re.exec(txt))){
    if (match.index > last) parts.push(txt.slice(last, match.index));
    parts.push(<span key={`m${i++}`} style={{color:'var(--cyan)',fontFamily:'JetBrains Mono,monospace',fontSize:11,padding:'0 2px',background:'rgba(0,180,216,.08)'}}>{match[0]}</span>);
    last = match.index + match[0].length;
  }
  if (last < txt.length) parts.push(txt.slice(last));
  return parts;
}

function SystemBadge({kind}){
  const map = {
    'h2h':          { txt:'H2H', tone:'var(--cyan)' },
    'auction-open': { txt:'AUCTION', tone:'var(--gold)' },
    'auction-win':  { txt:'WON', tone:'var(--positive)' },
  };
  const m = map[kind];
  if (!m) return null;
  return (
    <span style={{
      fontFamily:'JetBrains Mono,monospace',fontSize:8,
      padding:'1px 4px',color:m.tone,border:`1px solid ${m.tone}55`,background:`${m.tone}10`,
      letterSpacing:'.18em',
    }}>· {m.txt}</span>
  );
}

// ──────────────────────────────────────────────────────────────────
// MOBILE · STATS
// ──────────────────────────────────────────────────────────────────

function MobStats(){
  return (
    <PhoneShell>
      <AppTopbar/>
      <HubLeagueHeader/>
      <HubTabPills active="stats"/>

      <div style={{flex:1,overflow:'auto'}}>
        {/* Hero */}
        <div style={{padding:'14px 18px 12px',borderBottom:'1px solid var(--rule)'}}>
          <div className="mono" style={{fontSize:9,color:'var(--purple)',letterSpacing:'.22em'}}>LEAGUE STATS · 28 GAMEWEEKS</div>
          <div className="display" style={{fontSize:22,marginTop:4}}>Numbers, the way the league reads them.</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:6,marginTop:12}}>
            {[
              {k:'TOTAL',v:'5,196',t:'var(--paper)'},
              {k:'AVG',v:'433',t:'var(--cyan)'},
              {k:'BIG GW',v:'142',t:'var(--gold)'},
            ].map(c => (
              <div key={c.k} style={{padding:'8px 10px',background:'var(--ink-2)',border:'1px solid var(--rule)'}}>
                <div className="mono" style={{fontSize:8,color:'var(--mute)',letterSpacing:'.2em'}}>{c.k}</div>
                <div style={{fontFamily:'Archivo Black',fontSize:18,color:c.t,marginTop:4}}>{c.v}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Weekly chart */}
        <MobSection label="WEEKLY · TOP 3" tone="var(--cyan)"/>
        <div style={{padding:'0 18px 14px'}}>
          <MobWeeklyChart/>
        </div>

        {/* Position donut */}
        <MobSection label="POSITION BREAKDOWN" tone="var(--gold)"/>
        <div style={{padding:'0 18px 14px'}}>
          <MobPositionDonut/>
        </div>

        {/* Captaincy */}
        <MobSection label="CAPTAINCY HIT RATE" tone="var(--positive)"/>
        <div style={{padding:'0 18px 14px',display:'flex',flexDirection:'column',gap:8}}>
          {LH_STATS.captainHits.map(c => (
            <div key={c.who} style={{display:'grid',gridTemplateColumns:'auto 1fr auto',gap:10,alignItems:'center'}}>
              <MgrTag id={c.who} size={20}/>
              <div>
                <div style={{display:'flex',alignItems:'center',gap:6}}>
                  <span style={{fontFamily:'Archivo Black',fontSize:12}}>{lhMgrById(c.who).name}</span>
                  <span className="mono" style={{fontSize:8,color:'var(--mute)',letterSpacing:'.14em'}}>· {c.name.toUpperCase()}</span>
                </div>
                <div style={{height:4,background:'var(--ink-3)',marginTop:4}}>
                  <div style={{height:'100%',width:`${c.hitPct}%`,background:c.hitPct>=70?'var(--positive)':c.hitPct>=50?'var(--gold)':'var(--danger)'}}/>
                </div>
              </div>
              <span style={{fontFamily:'Archivo Black',fontSize:14,color:c.hitPct>=70?'var(--positive)':c.hitPct>=50?'var(--gold)':'var(--danger)',minWidth:40,textAlign:'right'}}>{c.hitPct}%</span>
            </div>
          ))}
        </div>

        {/* Biggest GWs */}
        <MobSection label="BIGGEST GAMEWEEKS" tone="var(--danger)"/>
        <div style={{padding:'0 18px 18px',display:'flex',flexDirection:'column',gap:6}}>
          {LH_STATS.biggestGW.map((b,i) => (
            <div key={i} style={{display:'grid',gridTemplateColumns:'24px auto 1fr auto',gap:10,padding:'10px',background:'var(--ink-2)',border:'1px solid var(--rule)',alignItems:'center'}}>
              <span style={{fontFamily:'Archivo Black',fontSize:14,color:i===0?'var(--gold)':'var(--mute)'}}>{i+1}</span>
              <MgrTag id={b.who} size={20}/>
              <div>
                <div style={{fontFamily:'Archivo Black',fontSize:12}}>{lhMgrById(b.who).name}</div>
                <div className="mono" style={{fontSize:8,color:'var(--mute)',letterSpacing:'.16em',marginTop:2}}>{b.gw}</div>
              </div>
              <span style={{fontFamily:'Archivo Black',fontSize:16,color:i===0?'var(--gold)':'var(--paper)'}}>{b.pts}</span>
            </div>
          ))}
        </div>
      </div>
    </PhoneShell>
  );
}

function MobWeeklyChart(){
  const w = 340, h = 160, pad = {l:24, r:8, t:10, b:20};
  const yMax = 150, yMin = 50;
  const xPos = i => pad.l + (i/(LH_STATS.weekly.length-1))*(w - pad.l - pad.r);
  const yPos = v => pad.t + (1 - (v - yMin)/(yMax - yMin))*(h - pad.t - pad.b);
  const line = (key, color) => {
    const pts = LH_STATS.weekly.map((g,i) => `${xPos(i).toFixed(1)},${yPos(g[key]).toFixed(1)}`).join(' ');
    return (
      <g key={key}>
        <polyline points={pts} fill="none" stroke={color} strokeWidth="1.6"/>
        {LH_STATS.weekly.map((g,i) => (
          <circle key={i} cx={xPos(i)} cy={yPos(g[key])} r="2" fill={color}/>
        ))}
      </g>
    );
  };
  return (
    <>
      <div style={{display:'flex',gap:10,marginBottom:6,flexWrap:'wrap'}}>
        {[
          { id:'rai', color:'#E0A800' },
          { id:'olu', color:'#FCD34D' },
          { id:'ade', color:'#A855F7' },
        ].map(s => (
          <div key={s.id} style={{display:'flex',alignItems:'center',gap:4}}>
            <span style={{width:12,height:2,background:s.color,display:'inline-block'}}/>
            <span style={{fontFamily:'Archivo Black',fontSize:10}}>{lhMgrById(s.id).name.split(' ')[0]}</span>
          </div>
        ))}
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" style={{display:'block'}}>
        {[60,90,120,150].map(v => (
          <g key={v}>
            <line x1={pad.l} x2={w-pad.r} y1={yPos(v)} y2={yPos(v)} stroke="var(--rule)" strokeDasharray="2,3"/>
            <text x={pad.l-4} y={yPos(v)+3} fill="#8B95A1" fontFamily="JetBrains Mono" fontSize="8" textAnchor="end">{v}</text>
          </g>
        ))}
        {LH_STATS.weekly.map((g,i) => (
          i%2===0 && <text key={g.gw} x={xPos(i)} y={h-4} fill="#8B95A1" fontFamily="JetBrains Mono" fontSize="8" textAnchor="middle">G{g.gw}</text>
        ))}
        {line('rai','#E0A800')}
        {line('olu','#FCD34D')}
        {line('ade','#A855F7')}
      </svg>
    </>
  );
}

function MobPositionDonut(){
  const data = LH_STATS.posBreakdown;
  const total = data.reduce((s,d)=>s+d.pct,0);
  const tones = { GK:'#A855F7', DEF:'#00B4D8', MID:'#E0A800', FWD:'#EF4444' };
  let acc = 0;
  const cx = 70, cy = 70, r = 56, ir = 36;
  return (
    <div style={{display:'flex',alignItems:'center',gap:18}}>
      <svg viewBox="0 0 140 140" width={140} height={140} style={{flexShrink:0}}>
        {data.map(d => {
          const a0 = (acc/total)*2*Math.PI - Math.PI/2;
          const a1 = ((acc+d.pct)/total)*2*Math.PI - Math.PI/2;
          acc += d.pct;
          const large = (d.pct/total) > 0.5 ? 1 : 0;
          const x0 = cx + r*Math.cos(a0);
          const y0 = cy + r*Math.sin(a0);
          const x1 = cx + r*Math.cos(a1);
          const y1 = cy + r*Math.sin(a1);
          const xi0 = cx + ir*Math.cos(a1);
          const yi0 = cy + ir*Math.sin(a1);
          const xi1 = cx + ir*Math.cos(a0);
          const yi1 = cy + ir*Math.sin(a0);
          return (
            <path key={d.pos}
              d={`M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} L ${xi0} ${yi0} A ${ir} ${ir} 0 ${large} 0 ${xi1} ${yi1} Z`}
              fill={tones[d.pos]}/>
          );
        })}
        <text x={cx} y={cy+4} fontFamily="Archivo Black" fontSize="11" fill="#F2EEE5" textAnchor="middle">PTS</text>
      </svg>
      <div style={{flex:1,display:'flex',flexDirection:'column',gap:6}}>
        {data.map(d => (
          <div key={d.pos} style={{display:'grid',gridTemplateColumns:'10px auto 1fr auto',gap:8,alignItems:'center'}}>
            <span style={{width:10,height:10,background:tones[d.pos]}}/>
            <span className="mono" style={{fontSize:10,color:'var(--paper)',letterSpacing:'.16em'}}>{d.pos}</span>
            <span style={{flex:1,height:3,background:'var(--ink-3)'}}>
              <span style={{display:'block',height:'100%',width:`${d.pct*2.5}%`,background:tones[d.pos]}}/>
            </span>
            <span style={{fontFamily:'Archivo Black',fontSize:12}}>{d.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

window.MobChat = MobChat;
window.MobStats = MobStats;
