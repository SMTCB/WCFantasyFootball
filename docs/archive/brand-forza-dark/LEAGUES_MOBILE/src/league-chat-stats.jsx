/* global React, LH_CHAT, LH_STATS, LH_MANAGERS, lhMgrById,
   MgrTag, HubTopbar, HubActionBar, HubTabs, HubSectionLabel */

// ───────────────────────────────────────────────────────────────────
// CHAT TAB — league chat (#league-chat). Side rail with members and
// pinned items; system messages (trade open, auction win) styled
// distinctly.
// ───────────────────────────────────────────────────────────────────

function ChatTab(){
  const pinned = LH_CHAT.filter(m => m.pinned);
  return (
    <div style={{display:'flex',flexDirection:'column',width:'100%',height:'100%',background:'var(--ink)',color:'var(--paper)',fontFamily:'Archivo,sans-serif'}}>
      <HubTopbar/>
      <HubActionBar/>
      <HubTabs active="chat"/>

      <div style={{flex:1,display:'grid',gridTemplateColumns:'240px 1fr 280px',minHeight:0}}>
        {/* Channels rail */}
        <aside style={{borderRight:'1px solid var(--rule)',display:'flex',flexDirection:'column',minHeight:0,background:'var(--ink-2)'}}>
          <div style={{padding:'18px 18px 8px'}}>
            <div className="mono" style={{fontSize:10,color:'var(--mute)',letterSpacing:'.22em'}}>CHANNELS</div>
          </div>
          {[
            { id:'lc', name:'#league-chat',     active:true,  unread:3 },
            { id:'tk', name:'#trash-talk',      active:false, unread:12 },
            { id:'au', name:'#auction-house',   active:false, unread:0  },
            { id:'bx', name:'#bets-and-bonus',  active:false, unread:5  },
            { id:'tn', name:'#tactics-notes',   active:false, unread:0  },
          ].map(c => (
            <div key={c.id} style={{
              padding:'10px 18px',display:'flex',alignItems:'center',gap:10,cursor:'pointer',
              borderLeft:c.active?'2px solid var(--cyan)':'2px solid transparent',
              background:c.active?'rgba(0,180,216,.06)':'transparent',
              color:c.active?'var(--paper)':'var(--mute)',
            }}>
              <span style={{fontFamily:'Archivo Black',fontSize:13,letterSpacing:'-0.01em'}}>{c.name}</span>
              {c.unread > 0 && <span style={{marginLeft:'auto',background:'var(--danger)',color:'#fff',fontFamily:'JetBrains Mono,monospace',fontSize:9,padding:'1px 6px',letterSpacing:'.1em'}}>{c.unread}</span>}
            </div>
          ))}
          <div style={{padding:'18px 18px 8px'}}>
            <div className="mono" style={{fontSize:10,color:'var(--mute)',letterSpacing:'.22em'}}>DIRECT</div>
          </div>
          {['rai','olu','ade','kai'].map(id => (
            <div key={id} style={{padding:'8px 18px',display:'flex',alignItems:'center',gap:10,color:'var(--mute)',cursor:'pointer'}}>
              <MgrTag id={id}/>
              <span style={{fontFamily:'Archivo,sans-serif',fontSize:12,color:'var(--paper)'}}>{lhMgrById(id).name}</span>
              <span style={{width:6,height:6,borderRadius:'50%',background:'var(--positive)',marginLeft:'auto'}}/>
            </div>
          ))}
        </aside>

        {/* Main message list */}
        <main style={{display:'flex',flexDirection:'column',minHeight:0}}>
          <HubSectionLabel label="#LEAGUE-CHAT" tone="var(--cyan)"
            sub="14 MEMBERS · 6 ONLINE"
            right={<span className="mono" style={{fontSize:9,color:'var(--mute)'}}>🔍 SEARCH MESSAGES</span>}/>

          {/* Pinned banner */}
          {pinned.length > 0 && (
            <div style={{padding:'10px 20px',background:'rgba(224,168,0,.06)',borderBottom:'1px solid var(--gold)44',display:'flex',gap:10,alignItems:'center'}}>
              <span style={{fontFamily:'Archivo Black',fontSize:10,color:'var(--gold)',padding:'2px 6px',background:'rgba(224,168,0,.18)',letterSpacing:'.18em'}}>PINNED</span>
              <span style={{fontFamily:'Archivo,sans-serif',fontSize:12,color:'var(--paper)'}}>“{pinned[0].txt}”</span>
              <span className="mono" style={{fontSize:9,color:'var(--mute)',marginLeft:'auto',letterSpacing:'.16em'}}>— @{lhMgrById(pinned[0].who).handle.slice(1)} · {pinned[0].t}</span>
            </div>
          )}

          {/* Date divider */}
          <div style={{display:'flex',alignItems:'center',gap:10,padding:'12px 20px'}}>
            <div style={{flex:1,height:1,background:'var(--rule)'}}/>
            <span className="mono" style={{fontSize:10,color:'var(--mute)',letterSpacing:'.22em'}}>TODAY · SAT MAY 11</span>
            <div style={{flex:1,height:1,background:'var(--rule)'}}/>
          </div>

          <div style={{flex:1,overflow:'auto',padding:'4px 0'}}>
            {LH_CHAT.map(m => <ChatMessage key={m.id} m={m}/>)}
          </div>

          {/* Composer */}
          <div style={{borderTop:'1px solid var(--rule)',padding:'14px 20px',background:'var(--ink-2)',display:'flex',gap:10,alignItems:'center'}}>
            <MgrTag id="you"/>
            <div style={{
              flex:1,padding:'10px 14px',background:'var(--ink)',border:'1px solid var(--rule)',
              fontFamily:'Archivo,sans-serif',fontSize:13,color:'var(--mute)',
            }}>Roast your rivals… (try @username · /bet · /trade)</div>
            <button style={{
              padding:'10px 14px',background:'var(--cyan)',color:'var(--ink)',border:0,
              fontFamily:'Archivo Black,sans-serif',fontSize:12,letterSpacing:'.18em',cursor:'pointer',
            }}>SEND ↵</button>
          </div>
        </main>

        {/* Members rail */}
        <aside style={{borderLeft:'1px solid var(--rule)',display:'flex',flexDirection:'column',minHeight:0,background:'var(--ink-2)'}}>
          <HubSectionLabel label="MEMBERS · 6 ONLINE" tone="var(--positive)"/>
          <div style={{flex:1,overflow:'auto'}}>
            {LH_MANAGERS.map(m => {
              const online = ['rai','kai','ade','you','olu','mar'].includes(m.id);
              return (
                <div key={m.id} style={{padding:'10px 16px',display:'flex',alignItems:'center',gap:10,borderBottom:'1px solid var(--rule)'}}>
                  <div style={{position:'relative'}}>
                    <MgrTag id={m.id} size={22}/>
                    {online && <span style={{position:'absolute',bottom:-2,right:-2,width:7,height:7,borderRadius:'50%',background:'var(--positive)',border:'2px solid var(--ink-2)'}}/>}
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontFamily:'Archivo Black',fontSize:12,letterSpacing:'-0.01em'}}>{m.id==='you'?'You':m.name}</div>
                    <div className="mono" style={{fontSize:9,color:'var(--mute)',letterSpacing:'.14em',marginTop:2}}>{m.handle}</div>
                  </div>
                  {m.id === 'rai' && <span className="mono" style={{fontSize:8,padding:'1px 4px',background:'var(--gold)18',color:'var(--gold)',border:'1px solid var(--gold)66',letterSpacing:'.12em'}}>ADMIN</span>}
                </div>
              );
            })}
          </div>
        </aside>
      </div>
    </div>
  );
}

const reactIcon = { fire:'🔥', shake:'🤝', pray:'🙏', cry:'😭', crown:'👑' };

function ChatMessage({ m }){
  const mgr = lhMgrById(m.who);
  const isYou = m.who === 'you';
  return (
    <div style={{padding:'8px 20px 8px',display:'grid',gridTemplateColumns:'38px 1fr',gap:12,alignItems:'flex-start'}}>
      <div style={{paddingTop:2}}>
        <MgrTag id={m.who} size={22}/>
      </div>
      <div>
        <div style={{display:'flex',alignItems:'baseline',gap:8}}>
          <span style={{fontFamily:'Archivo Black',fontSize:13,color:mgr.hue,letterSpacing:'-0.01em'}}>{isYou?'You':mgr.name}</span>
          <span className="mono" style={{fontSize:9,color:'var(--mute)',letterSpacing:'.16em'}}>{m.t}</span>
          {m.system && <SystemBadge kind={m.system}/>}
        </div>
        <div style={{
          fontFamily:'Archivo,sans-serif',fontSize:13,color:'var(--paper)',marginTop:3,lineHeight:1.45,
        }}>{renderWithMentions(m.txt)}</div>
        {m.react && m.react.length > 0 && (
          <div style={{display:'flex',gap:6,marginTop:6}}>
            {m.react.map((r,i) => (
              <span key={i} style={{
                display:'inline-flex',alignItems:'center',gap:4,
                padding:'2px 8px',background:'var(--ink-2)',border:'1px solid var(--rule)',
                fontFamily:'JetBrains Mono,monospace',fontSize:10,color:'var(--mute)',letterSpacing:'.1em',
              }}>{reactIcon[r.e]} {r.n}</span>
            ))}
            <span style={{
              padding:'2px 8px',background:'transparent',border:'1px dashed var(--rule)',
              fontFamily:'JetBrains Mono,monospace',fontSize:10,color:'var(--mute)',letterSpacing:'.1em',cursor:'pointer',
            }}>+</span>
          </div>
        )}
      </div>
    </div>
  );
}

function renderWithMentions(txt){
  // Linkify @mentions and slash-commands inline
  const parts = [];
  const re = /(@[a-z._]+|\/[a-z]+)/gi;
  let last = 0; let i = 0; let match;
  while ((match = re.exec(txt))){
    if (match.index > last) parts.push(txt.slice(last, match.index));
    parts.push(<span key={`m${i++}`} style={{color:'var(--cyan)',fontFamily:'JetBrains Mono,monospace',fontSize:12,padding:'0 2px',background:'rgba(0,180,216,.08)'}}>{match[0]}</span>);
    last = match.index + match[0].length;
  }
  if (last < txt.length) parts.push(txt.slice(last));
  return parts;
}

function SystemBadge({ kind }){
  const map = {
    'h2h':          { txt:'H2H REQUEST', tone:'var(--cyan)' },
    'auction-open': { txt:'AUCTION OPEN', tone:'var(--gold)' },
    'auction-win':  { txt:'AUCTION WON',  tone:'var(--positive)' },
  };
  const m = map[kind];
  if (!m) return null;
  return (
    <span style={{
      fontFamily:'JetBrains Mono,monospace',fontSize:9,
      padding:'2px 6px',color:m.tone,border:`1px solid ${m.tone}55`,background:`${m.tone}10`,
      letterSpacing:'.18em',
    }}>· {m.txt}</span>
  );
}

// ───────────────────────────────────────────────────────────────────
// STATS TAB — league-wide stats dashboard.
// Cards: weekly chart, captaincy hits, position breakdown, biggest GW.
// ───────────────────────────────────────────────────────────────────

function StatsTab(){
  return (
    <div style={{display:'flex',flexDirection:'column',width:'100%',height:'100%',background:'var(--ink)',color:'var(--paper)',fontFamily:'Archivo,sans-serif'}}>
      <HubTopbar/>
      <HubActionBar/>
      <HubTabs active="stats"/>

      {/* Hero strip */}
      <div style={{display:'grid',gridTemplateColumns:'1.8fr 1fr 1fr 1fr',borderBottom:'1px solid var(--rule)',background:'var(--ink-2)'}}>
        <div style={{padding:'20px 24px',borderRight:'1px solid var(--rule)'}}>
          <div className="mono" style={{fontSize:10,color:'var(--purple)',letterSpacing:'.22em'}}>LEAGUE STATS · 28 GAMEWEEKS</div>
          <div className="display" style={{fontSize:30,marginTop:6}}>Numbers, the way the league reads them.</div>
        </div>
        {[
          { k:'TOTAL POINTS', v:'5,196', tone:'var(--paper)' },
          { k:'AVG / MGR',    v:'433',   tone:'var(--cyan)' },
          { k:'BIGGEST GW',   v:'142',   tone:'var(--gold)' },
        ].map((c,i) => (
          <div key={c.k} style={{padding:'20px 22px',borderRight:i<2?'1px solid var(--rule)':'none'}}>
            <div className="mono" style={{fontSize:9,color:'var(--mute)',letterSpacing:'.22em'}}>{c.k}</div>
            <div style={{fontFamily:'Archivo Black',fontSize:32,color:c.tone,marginTop:6,letterSpacing:'-0.02em'}}>{c.v}</div>
          </div>
        ))}
      </div>

      {/* 2x2 card grid */}
      <div style={{flex:1,display:'grid',gridTemplateColumns:'1.4fr 1fr',gridTemplateRows:'1fr 1fr',minHeight:0,gap:0}}>
        <StatCard label="WEEKLY TOTALS · TOP 3" tone="var(--cyan)" border>
          <WeeklyChart/>
        </StatCard>
        <StatCard label="POSITION BREAKDOWN · WHOLE LEAGUE" tone="var(--gold)">
          <PositionDonut/>
        </StatCard>
        <StatCard label="CAPTAINCY · HIT RATE" tone="var(--positive)" border top>
          <div style={{display:'flex',flexDirection:'column',gap:8,padding:'4px 0'}}>
            {LH_STATS.captainHits.map(c => (
              <div key={c.who} style={{display:'grid',gridTemplateColumns:'auto 1fr 60px 60px',gap:14,alignItems:'center'}}>
                <MgrTag id={c.who}/>
                <div>
                  <div style={{display:'flex',alignItems:'center',gap:8}}>
                    <span style={{fontFamily:'Archivo Black',fontSize:13}}>{lhMgrById(c.who).name}</span>
                    <span className="mono" style={{fontSize:9,color:'var(--mute)',letterSpacing:'.14em'}}>· FAV {c.name.toUpperCase()}</span>
                  </div>
                  <div style={{height:4,background:'var(--ink-3)',marginTop:6}}>
                    <div style={{height:'100%',width:`${c.hitPct}%`,background:c.hitPct>=70?'var(--positive)':c.hitPct>=50?'var(--gold)':'var(--danger)'}}/>
                  </div>
                </div>
                <span className="mono" style={{fontSize:10,color:'var(--mute)',letterSpacing:'.14em',textAlign:'right'}}>{c.hits}/{c.ct}</span>
                <span style={{fontFamily:'Archivo Black',fontSize:14,color:c.hitPct>=70?'var(--positive)':c.hitPct>=50?'var(--gold)':'var(--danger)',textAlign:'right'}}>{c.hitPct}%</span>
              </div>
            ))}
          </div>
        </StatCard>
        <StatCard label="BIGGEST GAMEWEEKS · LEADERBOARD" tone="var(--danger)" top>
          <div style={{display:'flex',flexDirection:'column',gap:10}}>
            {LH_STATS.biggestGW.map((b,i) => (
              <div key={i} style={{display:'grid',gridTemplateColumns:'30px auto 1fr auto auto',gap:12,padding:'10px 12px',background:'var(--ink)',border:'1px solid var(--rule)',alignItems:'center'}}>
                <span style={{fontFamily:'Archivo Black',fontSize:18,color:i===0?'var(--gold)':'var(--mute)'}}>{i+1}</span>
                <MgrTag id={b.who}/>
                <div>
                  <div style={{fontFamily:'Archivo Black',fontSize:13}}>{lhMgrById(b.who).name}</div>
                  <div className="mono" style={{fontSize:9,color:'var(--mute)',letterSpacing:'.16em',marginTop:2}}>{b.gw} · TRIPLE CAPTAIN APPLIED</div>
                </div>
                <span className="mono" style={{fontSize:10,color:'var(--mute)',letterSpacing:'.18em'}}>+{b.pts}</span>
                <span style={{fontFamily:'Archivo Black',fontSize:18,color:i===0?'var(--gold)':'var(--paper)'}}>{b.pts}<span style={{color:'var(--mute)',fontSize:11,marginLeft:4}}>PTS</span></span>
              </div>
            ))}
          </div>
        </StatCard>
      </div>
    </div>
  );
}

function StatCard({ label, tone, border, top, children }){
  return (
    <section style={{
      padding:'16px 22px',
      borderRight:border?'1px solid var(--rule)':'none',
      borderTop:top?'1px solid var(--rule)':'none',
      display:'flex',flexDirection:'column',gap:12,minHeight:0,
    }}>
      <div style={{display:'flex',alignItems:'center',gap:10}}>
        <span style={{width:3,height:14,background:tone}}/>
        <span className="mono" style={{fontSize:11,color:'var(--paper)',letterSpacing:'.22em'}}>{label}</span>
      </div>
      <div style={{flex:1,minHeight:0}}>{children}</div>
    </section>
  );
}

function WeeklyChart(){
  // Render a simple multi-line chart
  const w = 580, h = 220, pad = { l:32, r:12, t:14, b:24 };
  const xs = LH_STATS.weekly.map(g => g.gw);
  const yMax = 150, yMin = 50;
  const xPos = i => pad.l + (i/(xs.length-1))*(w - pad.l - pad.r);
  const yPos = v => pad.t + (1 - (v - yMin)/(yMax - yMin))*(h - pad.t - pad.b);
  const line = (key, color) => {
    const pts = LH_STATS.weekly.map((g,i) => `${xPos(i).toFixed(1)},${yPos(g[key]).toFixed(1)}`).join(' ');
    return (
      <>
        <polyline points={pts} fill="none" stroke={color} strokeWidth="2"/>
        {LH_STATS.weekly.map((g,i) => (
          <circle key={i} cx={xPos(i)} cy={yPos(g[key])} r="2.5" fill={color}/>
        ))}
      </>
    );
  };
  return (
    <div style={{display:'flex',flexDirection:'column',gap:8,height:'100%'}}>
      <div style={{display:'flex',gap:18,alignItems:'center'}}>
        {[
          { id:'rai', color:'#E0A800' },
          { id:'olu', color:'#FCD34D' },
          { id:'ade', color:'#A855F7' },
        ].map(s => (
          <div key={s.id} style={{display:'flex',alignItems:'center',gap:6}}>
            <span style={{width:18,height:2,background:s.color,display:'inline-block'}}/>
            <span style={{fontFamily:'Archivo Black',fontSize:11}}>{lhMgrById(s.id).name}</span>
          </div>
        ))}
        <span style={{flex:1}}/>
        <span className="mono" style={{fontSize:9,color:'var(--mute)',letterSpacing:'.18em'}}>POINTS / GAMEWEEK</span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" preserveAspectRatio="none" style={{flex:1}}>
        {/* y-grid */}
        {[60,80,100,120,140].map(v => (
          <g key={v}>
            <line x1={pad.l} x2={w-pad.r} y1={yPos(v)} y2={yPos(v)} stroke="var(--rule)" strokeDasharray="2,3"/>
            <text x={pad.l-6} y={yPos(v)+3} fill="#8B95A1" fontFamily="JetBrains Mono" fontSize="9" textAnchor="end">{v}</text>
          </g>
        ))}
        {/* x-labels */}
        {LH_STATS.weekly.map((g,i) => (
          i%2===0 && <text key={g.gw} x={xPos(i)} y={h-6} fill="#8B95A1" fontFamily="JetBrains Mono" fontSize="9" textAnchor="middle">GW{g.gw}</text>
        ))}
        {line('rai','#E0A800')}
        {line('olu','#FCD34D')}
        {line('ade','#A855F7')}
      </svg>
    </div>
  );
}

function PositionDonut(){
  const data = LH_STATS.posBreakdown;
  const total = data.reduce((s,d)=>s+d.pct,0);
  const tones = { GK:'#A855F7', DEF:'#00B4D8', MID:'#E0A800', FWD:'#EF4444' };
  let acc = 0;
  const cx = 90, cy = 90, r = 70, ir = 44;
  return (
    <div style={{display:'flex',alignItems:'center',gap:24,height:'100%'}}>
      <svg viewBox="0 0 180 180" width={180} height={180}>
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
        <text x={cx} y={cy-2} fontFamily="JetBrains Mono" fontSize="10" fill="#8B95A1" textAnchor="middle" letterSpacing="3">PTS BY</text>
        <text x={cx} y={cy+14} fontFamily="Archivo Black" fontSize="20" fill="#F2EEE5" textAnchor="middle">POSITION</text>
      </svg>
      <div style={{flex:1,display:'flex',flexDirection:'column',gap:10}}>
        {data.map(d => (
          <div key={d.pos} style={{display:'grid',gridTemplateColumns:'auto auto 1fr auto',gap:10,alignItems:'center'}}>
            <span style={{width:12,height:12,background:tones[d.pos]}}/>
            <span className="mono" style={{fontSize:11,color:'var(--paper)',letterSpacing:'.18em'}}>{d.pos}</span>
            <span style={{flex:1,height:4,background:'var(--ink-3)'}}>
              <span style={{display:'block',height:'100%',width:`${d.pct*2.5}%`,background:tones[d.pos]}}/>
            </span>
            <span style={{fontFamily:'Archivo Black',fontSize:13}}>{d.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

window.ChatTab = ChatTab;
window.StatsTab = StatsTab;
