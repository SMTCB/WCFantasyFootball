/* global React, LIVE_SQUAD, POS_TONE, FF_LEAGUES, EVENT_KIND, LIVE_EVENTS, LIVE_FIXTURES, playerById, leagueById, liveTotalsByLeague, LeagueChip, DeltaPill, LivePill, EventRow */

// Shared phone chrome — matches the squad-mobile.jsx vocabulary.
function LivePhoneShell({children}){
  return (
    <div style={{
      width:'100%',height:'100%',
      background:'var(--ink)',
      display:'flex',flexDirection:'column',
      fontFamily:'Archivo, sans-serif',
      color:'var(--paper)',
      position:'relative',
      overflow:'hidden',
    }}>
      <div style={{height:32,display:'flex',justifyContent:'space-between',alignItems:'center',padding:'0 22px',color:'var(--paper)',fontFamily:'JetBrains Mono',fontSize:11,fontWeight:600,flexShrink:0}}>
        <span>9:41</span><span>●●● ▮</span>
      </div>
      {children}
    </div>
  );
}

function LiveMobileTopbar(){
  return (
    <>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'8px 18px 12px'}}>
        <div style={{fontFamily:'Archivo Black',fontSize:18,letterSpacing:'-0.01em'}}>FORZA<span style={{color:'var(--cyan)'}}>KIT</span></div>
        <LivePill/>
      </div>
      <div style={{display:'flex',gap:18,padding:'10px 18px 0',borderBottom:'1px solid var(--rule)'}}>
        {['SCORES','SQUAD','LEAGUE','LIVE','MARKET'].map(t => (
          <div key={t} className="mono" style={{
            fontSize:10,letterSpacing:'.18em',paddingBottom:8,position:'relative',
            color:t==='LIVE'?'var(--paper)':'var(--mute)',
          }}>
            {t}
            {t==='LIVE' && <span style={{display:'inline-block',width:5,height:5,borderRadius:'50%',background:'var(--danger)',marginLeft:5,verticalAlign:'middle'}}/>}
            {t==='LIVE' && <span style={{position:'absolute',left:0,right:0,bottom:-1,height:2,background:'var(--cyan)'}}/>}
          </div>
        ))}
      </div>
    </>
  );
}

// Compact player row for the mobile team-list (no pitch on mobile).
function MobPlayerRow({p}){
  return (
    <div style={{
      display:'grid',gridTemplateColumns:'22px 1fr auto',gap:10,alignItems:'center',
      padding:'8px 0',
    }}>
      <div className="mono" style={{fontSize:9,color:'var(--mute)'}}>{p.pos}</div>
      <div style={{display:'flex',alignItems:'center',gap:8,minWidth:0}}>
        <span style={{width:6,height:6,borderRadius:'50%',background:p.live?'var(--danger)':'var(--mute)',flexShrink:0,animation:p.live?'fkPulse 1.4s ease-in-out infinite':'none'}}/>
        <span style={{fontFamily:'Archivo Black',fontSize:13,letterSpacing:'-0.01em',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{p.last}</span>
        <span className="mono" style={{fontSize:9,color:'var(--mute)',marginLeft:'auto'}}>{p.club}</span>
      </div>
      <div style={{fontFamily:'Archivo Black',fontSize:14,letterSpacing:'-0.02em',color: p.pts>=0?'var(--cyan)':'var(--danger)'}}>{p.pts>=0?p.pts:`−${Math.abs(p.pts)}`}</div>
    </div>
  );
}

// ── M1 — TEAM LIST + EVENTS FEED ─────────────────────────────
// Squad as a tight roster at the top (matches your mobile squad list),
// then a scrolling events feed. League chip on every event.
function LiveMobileV1(){
  const lines = [
    { label:'FWD', players:LIVE_SQUAD.filter(p=>p.pos==='FWD') },
    { label:'MID', players:LIVE_SQUAD.filter(p=>p.pos==='MID') },
    { label:'DEF', players:LIVE_SQUAD.filter(p=>p.pos==='DEF') },
    { label:'GK',  players:LIVE_SQUAD.filter(p=>p.pos==='GK')  },
  ];
  const totals = liveTotalsByLeague();
  return (
    <LivePhoneShell>
      <LiveMobileTopbar/>
      <div style={{flex:1,overflow:'auto'}}>
        {/* Hero header */}
        <div style={{padding:'14px 18px 12px'}}>
          <div className="mono" style={{fontSize:9,color:'var(--mute)',letterSpacing:'.22em'}}>MATCH DAY · GW 28</div>
          <div className="display" style={{fontSize:26,marginTop:4}}>Live Centre</div>
          <div style={{display:'flex',gap:6,marginTop:10,overflowX:'auto'}}>
            {FF_LEAGUES.map(lg => {
              const t = totals[lg.id];
              return (
                <div key={lg.id} style={{flex:'0 0 auto',padding:'8px 10px',background:'var(--ink-2)',border:`1px solid ${lg.tone}33`,borderLeft:`2px solid ${lg.tone}`,display:'flex',flexDirection:'column',gap:2,minWidth:104}}>
                  <span className="mono" style={{fontSize:8,color:lg.tone,letterSpacing:'.18em'}}>{lg.short}</span>
                  <div style={{display:'flex',alignItems:'baseline',gap:6}}>
                    <span style={{fontFamily:'Archivo Black',fontSize:18,letterSpacing:'-0.02em'}}>{t.total}</span>
                    <DeltaPill delta={t.delta}/>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Live fixtures */}
        <div style={{borderTop:'1px solid var(--rule)',borderBottom:'1px solid var(--rule)'}}>
          {LIVE_FIXTURES.map((f,i) => (
            <div key={f.id} style={{padding:'10px 18px',display:'flex',alignItems:'center',gap:12,borderTop:i?'1px solid var(--rule)':'none'}}>
              <span style={{width:6,height:6,borderRadius:'50%',background:'var(--danger)',animation:'fkPulse 1.4s ease-in-out infinite'}}/>
              <span className="mono" style={{fontSize:10,color:'var(--mute)',letterSpacing:'.18em'}}>{f.clock}</span>
              <span style={{fontFamily:'Archivo Black',fontSize:14,marginLeft:'auto'}}>
                {f.home}<span style={{color:'var(--cyan)',margin:'0 6px'}}>{f.hs}–{f.as}</span>{f.away}
              </span>
            </div>
          ))}
        </div>

        {/* Team list (NO pitch on mobile, per direction) */}
        <div style={{padding:'14px 18px 6px'}}>
          <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}>
            <span style={{width:3,height:14,background:'var(--cyan)'}}/>
            <span className="mono" style={{fontSize:10,color:'var(--paper)',letterSpacing:'.22em'}}>MY SQUAD</span>
            <span className="mono" style={{fontSize:9,color:'var(--mute)',marginLeft:'auto'}}>5-4-1 · GW 28</span>
          </div>
          {lines.map(line => (
            <div key={line.label} style={{borderTop:'1px solid var(--rule)',padding:'4px 0'}}>
              {line.players.map(p => <MobPlayerRow key={p.id} p={p}/>)}
            </div>
          ))}
        </div>

        {/* Events feed */}
        <div style={{padding:'14px 0 0'}}>
          <div style={{display:'flex',alignItems:'center',gap:8,padding:'0 18px 10px'}}>
            <span style={{width:3,height:14,background:'var(--gold)'}}/>
            <span className="mono" style={{fontSize:10,color:'var(--paper)',letterSpacing:'.22em'}}>MATCH EVENTS</span>
            <span className="mono" style={{fontSize:9,color:'var(--mute)',marginLeft:'auto'}}>ALL LEAGUES</span>
          </div>
          {LIVE_EVENTS.map(e => <MobEventRow key={e.id} e={e}/>)}
        </div>

        <div style={{height:40}}/>
      </div>
    </LivePhoneShell>
  );
}

// Mobile event row — stacked: player + league chip on one line,
// event text on the second, time + delta on the right.
function MobEventRow({e}){
  const p = playerById(e.player);
  const kind = EVENT_KIND[e.kind];
  return (
    <div style={{
      display:'grid',gridTemplateColumns:'36px 1fr auto',gap:10,alignItems:'center',
      padding:'10px 18px',
      borderTop:'1px solid var(--rule)',
      background: e.delta<0 ? 'rgba(239,68,68,.04)':'transparent',
    }}>
      <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:2}}>
        <span className="mono" style={{fontSize:10,color:'var(--mute)',letterSpacing:'.14em'}}>{e.t}</span>
        <span style={{color:kind.tone,fontFamily:'Archivo Black',fontSize:14,lineHeight:1}}>{kind.glyph}</span>
      </div>
      <div style={{minWidth:0,display:'flex',flexDirection:'column',gap:4}}>
        <div style={{display:'flex',alignItems:'center',gap:6}}>
          <span style={{fontFamily:'Archivo Black',fontSize:13,letterSpacing:'-0.01em'}}>{p.last}</span>
          <span className="mono" style={{fontSize:9,color:'var(--mute)'}}>{p.club}</span>
          {e.cap && <span style={{fontFamily:'Archivo Black',fontSize:8,background:'var(--gold)',color:'var(--ink)',padding:'1px 4px',lineHeight:1}}>C</span>}
        </div>
        <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
          <span style={{fontSize:11,color:'var(--mute)'}}>{kind.label}</span>
          <LeagueChip league={e.league} compact/>
          {e.note && <span className="mono" style={{fontSize:8,color:'var(--gold)',letterSpacing:'.14em'}}>{e.note}</span>}
        </div>
      </div>
      <DeltaPill delta={e.delta}/>
    </div>
  );
}

// ── MOBILE FINAL — Big league cards + Squad/Events tabs ──────
// Combines M1's big totals cards (clickable league selector) with M2's
// segmented Squad/Events tabs. Picking a league swaps the captain on
// the Squad tab. The Events tab always shows every player in every
// league, regardless of which card is selected.
function LiveMobileFinal({initialLeague='office', initialTab='events'}){
  const [active, setActive] = React.useState(initialLeague);
  const [tab,    setTab]    = React.useState(initialTab);
  const lg = leagueById(active);
  const totals = liveTotalsByLeague();

  // Squad lines, with captain shifted per-league.
  const lines = [
    { label:'FWD', players:LIVE_SQUAD.filter(p=>p.pos==='FWD') },
    { label:'MID', players:LIVE_SQUAD.filter(p=>p.pos==='MID') },
    { label:'DEF', players:LIVE_SQUAD.filter(p=>p.pos==='DEF') },
    { label:'GK',  players:LIVE_SQUAD.filter(p=>p.pos==='GK')  },
  ];

  return (
    <LivePhoneShell>
      <LiveMobileTopbar/>
      {/* Header */}
      <div style={{padding:'12px 18px 10px'}}>
        <div className="mono" style={{fontSize:9,color:'var(--mute)',letterSpacing:'.22em'}}>MATCH DAY · GW 28</div>
        <div className="display" style={{fontSize:24,marginTop:4}}>Live Centre</div>
      </div>

      {/* League selector — horizontal scroll of big totals cards */}
      <div style={{padding:'4px 0 14px'}}>
        <div className="mono" style={{fontSize:9,color:'var(--mute)',letterSpacing:'.18em',padding:'0 18px 8px'}}>YOUR LEAGUES — TAP TO SWITCH</div>
        <div style={{display:'flex',gap:8,overflowX:'auto',padding:'0 18px 4px',scrollbarWidth:'none'}}>
          {FF_LEAGUES.map(l => {
            const t = totals[l.id];
            const isActive = l.id === active;
            return (
              <button
                key={l.id}
                onClick={() => setActive(l.id)}
                style={{
                  flex:'0 0 auto',minWidth:140,
                  padding:'10px 12px',
                  background:isActive?`${l.tone}14`:'var(--ink-2)',
                  border:`1px solid ${isActive?l.tone:'var(--rule)'}`,
                  borderLeft:`2px solid ${l.tone}`,
                  display:'flex',flexDirection:'column',gap:6,
                  textAlign:'left',color:'var(--paper)',
                  fontFamily:'Archivo,sans-serif',cursor:'pointer',
                }}
              >
                <span className="mono" style={{fontSize:9,color:l.tone,letterSpacing:'.18em'}}>{l.short}</span>
                <span style={{fontFamily:'Archivo Black',fontSize:12,letterSpacing:'-0.01em',whiteSpace:'nowrap'}}>{l.name}</span>
                <div style={{display:'flex',alignItems:'baseline',gap:8}}>
                  <span style={{fontFamily:'Archivo Black',fontSize:22,letterSpacing:'-0.02em',color:isActive?l.tone:'var(--paper)'}}>{t.total}</span>
                  <DeltaPill delta={t.delta}/>
                </div>
                <span className="mono" style={{fontSize:8,color:'var(--mute)',letterSpacing:'.14em'}}>{l.rank}{l.chip?` · ${l.chip.toUpperCase()}`:''}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Segmented tabs */}
      <div style={{display:'flex',padding:'0 18px',gap:0,borderBottom:'1px solid var(--rule)'}}>
        {[
          {id:'squad',  label:`MY XI · ${lg.short}`},
          {id:'events', label:`EVENTS · ${LIVE_EVENTS.length}`},
        ].map(t => {
          const isActive = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                flex:1,padding:'10px 0',position:'relative',
                background:'transparent',border:'none',cursor:'pointer',
                color:isActive?'var(--paper)':'var(--mute)',
                fontFamily:'JetBrains Mono,monospace',
                fontSize:11,letterSpacing:'.16em',textTransform:'uppercase',
              }}
            >
              {t.label}
              {isActive && <span style={{position:'absolute',left:0,right:0,bottom:-1,height:2,background:'var(--cyan)'}}/>}
            </button>
          );
        })}
      </div>

      {/* Tab body */}
      <div style={{flex:1,overflow:'auto'}}>
        {tab === 'squad' ? (
          <div style={{padding:'8px 18px 24px'}}>
            <div className="mono" style={{fontSize:9,color:'var(--mute)',padding:'10px 0 8px',letterSpacing:'.18em'}}>
              5-4-1 · CAPTAIN <span style={{color:'var(--gold)'}}>{playerById(lg.captain)?.last}</span>{lg.chip?` · ${lg.chip.toUpperCase()}`:''}
            </div>
            {lines.map(line => (
              <div key={line.label} style={{borderTop:'1px solid var(--rule)',padding:'6px 0'}}>
                <div className="mono" style={{fontSize:9,color:'var(--mute)',margin:'4px 0',letterSpacing:'.16em'}}>{line.label} · {line.players.length}</div>
                {line.players.map(p => <MobSquadRow key={p.id} p={p} captain={lg.captain===p.id} chip={lg.chip}/>)}
              </div>
            ))}
          </div>
        ) : (
          <>
            <div style={{display:'flex',alignItems:'center',gap:8,padding:'12px 18px 8px'}}>
              <span style={{width:3,height:14,background:'var(--gold)'}}/>
              <span className="mono" style={{fontSize:10,color:'var(--paper)',letterSpacing:'.22em'}}>ALL EVENTS</span>
              <span className="mono" style={{fontSize:9,color:'var(--mute)',marginLeft:'auto'}}>EVERY PLAYER · EVERY LEAGUE</span>
            </div>
            {LIVE_EVENTS.map(e => <MobEventRow key={e.id} e={e}/>)}
            <div style={{height:30}}/>
          </>
        )}
      </div>
    </LivePhoneShell>
  );
}

// Squad row used by the Squad tab — shows captain marker + chip when set.
function MobSquadRow({p, captain, chip}){
  return (
    <div style={{
      display:'grid',gridTemplateColumns:'22px 1fr auto',gap:10,alignItems:'center',
      padding:'8px 0',
    }}>
      <div className="mono" style={{fontSize:9,color:'var(--mute)'}}>{p.pos}</div>
      <div style={{display:'flex',alignItems:'center',gap:8,minWidth:0}}>
        <span style={{width:6,height:6,borderRadius:'50%',background:p.live?'var(--danger)':'var(--mute)',flexShrink:0,animation:p.live?'fkPulse 1.4s ease-in-out infinite':'none'}}/>
        <span style={{fontFamily:'Archivo Black',fontSize:13,letterSpacing:'-0.01em',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{p.last}</span>
        {captain && (
          <span style={{fontFamily:'Archivo Black',fontSize:8,background:'var(--gold)',color:'var(--ink)',padding:'2px 5px',letterSpacing:'.04em',lineHeight:1}}>
            {chip === 'Triple Captain' ? '3×C' : 'C'}
          </span>
        )}
        <span className="mono" style={{fontSize:9,color:'var(--mute)',marginLeft:'auto'}}>{p.club}</span>
      </div>
      <div style={{fontFamily:'Archivo Black',fontSize:14,letterSpacing:'-0.02em',color: p.pts>=0?'var(--cyan)':'var(--danger)'}}>{p.pts>=0?p.pts:`−${Math.abs(p.pts)}`}</div>
    </div>
  );
}

// ── M3 — STICKY SUMMARY, INFINITE FEED ───────────────────────
// Tight summary at top (current league total + live count), then the
// feed dominates the screen. Squad lives one tap away.
function LiveMobileV3(){
  const totals = liveTotalsByLeague();
  return (
    <LivePhoneShell>
      <LiveMobileTopbar/>
      <div style={{padding:'14px 18px 10px',borderBottom:'1px solid var(--rule)'}}>
        <div style={{display:'flex',alignItems:'baseline',gap:10}}>
          <div className="display" style={{fontSize:24}}>Live Centre</div>
          <span className="mono" style={{fontSize:9,color:'var(--mute)',marginLeft:'auto'}}>GW 28</span>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:10,marginTop:10}}>
          <div style={{flex:1}}>
            <div className="mono" style={{fontSize:9,color:'var(--mute)',letterSpacing:'.18em'}}>OFFICE HEROES · LIVE PTS</div>
            <div style={{display:'flex',alignItems:'baseline',gap:10,marginTop:4}}>
              <span style={{fontFamily:'Archivo Black',fontSize:34,letterSpacing:'-0.03em'}}>{totals.office.total}</span>
              <DeltaPill delta={totals.office.delta} big/>
            </div>
          </div>
          <div style={{padding:'8px 10px',border:'1px solid var(--rule)',background:'var(--ink-2)'}}>
            <div className="mono" style={{fontSize:9,color:'var(--mute)'}}>VIEW SQUAD</div>
            <div style={{fontFamily:'Archivo Black',fontSize:11,color:'var(--cyan)',marginTop:2}}>5-4-1 ›</div>
          </div>
        </div>
      </div>

      {/* Feed */}
      <div style={{flex:1,overflow:'auto'}}>
        <div style={{display:'flex',alignItems:'center',gap:8,padding:'12px 18px 8px'}}>
          <span style={{width:3,height:14,background:'var(--gold)'}}/>
          <span className="mono" style={{fontSize:10,color:'var(--paper)',letterSpacing:'.22em'}}>EVENTS</span>
          <span className="mono" style={{fontSize:9,color:'var(--mute)',marginLeft:'auto'}}>· ALL LEAGUES</span>
        </div>
        {LIVE_EVENTS.map(e => <MobEventRow key={e.id} e={e}/>)}
      </div>
    </LivePhoneShell>
  );
}

window.LiveMobileV1 = LiveMobileV1;
window.LiveMobileFinal = LiveMobileFinal;
window.LiveMobileV3 = LiveMobileV3;
