/* global React, LIVE_SQUAD, LIVE_CLUB_TONE, POS_TONE, FF_LEAGUES, EVENT_KIND, LIVE_EVENTS, LIVE_FIXTURES, playerById, leagueById, liveTotalsByLeague, SideNav */

// ── Shared bits ─────────────────────────────────────────────

function LivePill({size=10}){
  return (
    <span style={{display:'inline-flex',alignItems:'center',gap:6}}>
      <span style={{width:6,height:6,borderRadius:'50%',background:'var(--danger)',animation:'fkPulse 1.4s ease-in-out infinite'}}/>
      <span className="mono" style={{fontSize:size,letterSpacing:'.22em',color:'var(--danger)'}}>LIVE</span>
    </span>
  );
}

function LeagueChip({league, compact=false}){
  const lg = leagueById(league);
  if (!lg) return null;
  return (
    <span style={{
      display:'inline-flex',alignItems:'center',gap:6,
      padding:compact?'2px 6px':'3px 7px 3px 6px',
      border:`1px solid ${lg.tone}55`,
      background:`${lg.tone}12`,
      borderRadius:2,
    }}>
      <span style={{width:5,height:5,borderRadius:'50%',background:lg.tone}}/>
      <span className="mono" style={{fontSize:compact?9:10,letterSpacing:'.14em',color:lg.tone}}>{compact?lg.short:lg.name}</span>
    </span>
  );
}

function DeltaPill({delta, big=false}){
  if (delta === 0){
    return <span className="mono" style={{fontSize:big?13:11,color:'var(--mute)',fontFamily:'Archivo Black'}}>±0</span>;
  }
  const pos = delta > 0;
  const tone = pos ? 'var(--positive)' : 'var(--danger)';
  return (
    <span style={{
      fontFamily:'Archivo Black',
      fontSize:big?18:14,letterSpacing:'-0.02em',
      color:tone,
      display:'inline-flex',alignItems:'baseline',gap:2,
    }}>
      {pos?'+':'−'}{Math.abs(delta)}
    </span>
  );
}

// Compact pitch (used by V1 & V3). NOT full-bleed.
// `league` (optional) gives us the league context so the captain marker
// and any per-league chip rendering can shift when the user picks one.
function MiniPitch({ height='100%', highlightLive=true, league }){
  const lg = league ? leagueById(league) : null;
  return (
    <div style={{
      position:'relative',width:'100%',height,
      background:'linear-gradient(180deg, #0E1218 0%, #0A0D12 100%)',
      borderRadius:6,overflow:'hidden',boxShadow:'inset 0 0 0 1px var(--rule)',
    }}>
      {/* faint position rules */}
      {[14,38,64,88].map(y => <div key={y} style={{position:'absolute',left:18,right:18,top:`${y}%`,height:1,background:'rgba(0,180,216,.08)'}}/>)}
      {[{y:14,label:'FWD'},{y:38,label:'MID'},{y:64,label:'DEF'},{y:88,label:'GK'}].map(l => (
        <div key={l.label} className="mono" style={{position:'absolute',left:10,top:`${l.y}%`,transform:'translateY(-50%)',fontSize:8,color:'rgba(0,180,216,.45)',background:'#0A0D12',padding:'1px 3px'}}>{l.label}</div>
      ))}
      {/* centre circle hint */}
      <div style={{position:'absolute',left:'50%',top:'50%',transform:'translate(-50%,-50%)',width:'30%',aspectRatio:'1',borderRadius:'50%',border:'1px solid rgba(242,238,229,.04)'}}/>
      <div style={{position:'absolute',top:10,left:14,right:14,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <div className="mono" style={{fontSize:9,color:'var(--mute)',letterSpacing:'.22em'}}>STARTING XI · 5-4-1</div>
        <div className="mono" style={{fontSize:9,color:lg?lg.tone:'var(--mute)',letterSpacing:'.22em'}}>
          {lg ? `${lg.name.toUpperCase()} · GW 28` : 'GW 28'}
        </div>
      </div>
      {LIVE_SQUAD.map(p => (
        <MiniTok
          key={p.id} p={p}
          live={highlightLive && p.live}
          captain={lg && lg.captain === p.id}
          tripleCap={lg && lg.captain === p.id && lg.chip === 'Triple Captain'}
        />
      ))}
    </div>
  );
}

function MiniTok({p, live, captain, tripleCap}){
  const tone = POS_TONE[p.pos];
  return (
    <div style={{
      position:'absolute',
      left:`${p.x}%`, top:`${p.y}%`,
      transform:'translate(-50%,-50%)',
    }}>
      <div style={{
        position:'relative',
        padding:'4px 8px',
        background:'rgba(15,18,24,.94)',
        border:`1px solid ${live?'var(--danger)':'var(--rule)'}`,
        borderLeft:`2px solid ${tone}`,
        borderRadius:2,
        minWidth:78,textAlign:'center',
        boxShadow:live?'0 0 0 2px rgba(239,68,68,.18)':'none',
      }}>
        {live && <span style={{position:'absolute',top:-3,right:-3,width:6,height:6,borderRadius:'50%',background:'var(--danger)',animation:'fkPulse 1.4s ease-in-out infinite'}}/>}
        {captain && (
          <span style={{
            position:'absolute',top:-7,left:-7,
            width:16,height:16,borderRadius:'50%',
            background:'var(--gold)',color:'var(--ink)',
            fontFamily:'Archivo Black',fontSize:9,
            display:'flex',alignItems:'center',justifyContent:'center',
            border:'2px solid var(--ink)',
          }}>{tripleCap?'3':'C'}</span>
        )}
        <div style={{fontFamily:'Archivo Black',fontSize:10,letterSpacing:'-0.01em'}}>{p.last}</div>
        <div style={{display:'flex',justifyContent:'center',alignItems:'center',gap:4,marginTop:1}}>
          <span className="mono" style={{fontSize:8,color:'var(--mute)'}}>{p.club}</span>
          <span style={{width:2,height:2,borderRadius:'50%',background:'var(--mute)'}}/>
          <span style={{fontFamily:'Archivo Black',fontSize:10,color: p.pts>=0?'var(--paper)':'var(--danger)'}}>{p.pts>=0?p.pts:`−${Math.abs(p.pts)}`}</span>
        </div>
      </div>
    </div>
  );
}

// Event row — used by feeds across the variants.
function EventRow({e, showLeague=true, showPlayer=true, dense=false}){
  const p = playerById(e.player);
  const kind = EVENT_KIND[e.kind];
  if (!p) return null;
  return (
    <div style={{
      display:'grid',
      gridTemplateColumns: showPlayer ? '44px 22px 1fr auto auto' : '44px 22px 1fr auto',
      alignItems:'center',gap:14,
      padding: dense ? '8px 14px' : '12px 16px',
      borderBottom:'1px solid var(--rule)',
      background: e.delta < 0 ? 'rgba(239,68,68,.04)' : 'transparent',
    }}>
      <span className="mono" style={{fontSize:10,color:'var(--mute)',letterSpacing:'.14em'}}>{e.t}</span>
      <span style={{display:'inline-flex',alignItems:'center',justifyContent:'center',width:18,height:18,color:kind.tone,fontFamily:'Archivo Black',fontSize:12,lineHeight:1}}>{kind.glyph}</span>
      <div style={{minWidth:0,display:'flex',flexDirection:'column',gap:2}}>
        <div style={{display:'flex',alignItems:'center',gap:8,minWidth:0}}>
          {showPlayer && (
            <>
              <span style={{fontFamily:'Archivo Black',fontSize:13,letterSpacing:'-0.01em',whiteSpace:'nowrap'}}>{p.last}</span>
              <span className="mono" style={{fontSize:9,color:'var(--mute)',letterSpacing:'.14em'}}>{p.club}</span>
            </>
          )}
          <span style={{fontFamily:'Archivo',fontSize:12,color: showPlayer?'var(--mute)':'var(--paper)',marginLeft: showPlayer?2:0}}>· {kind.label}</span>
          {e.note && <span className="mono" style={{fontSize:9,color:'var(--gold)',letterSpacing:'.14em',marginLeft:4}}>· {e.note}</span>}
          {e.cap && <span style={{fontFamily:'Archivo Black',fontSize:8,background:'var(--gold)',color:'var(--ink)',padding:'1px 4px',lineHeight:1}}>C</span>}
        </div>
      </div>
      {showLeague && <LeagueChip league={e.league}/>}
      <DeltaPill delta={e.delta}/>
    </div>
  );
}

function LiveTotalsBar(){
  const totals = liveTotalsByLeague();
  return (
    <div style={{display:'flex',gap:0,borderTop:'1px solid var(--rule)',borderBottom:'1px solid var(--rule)'}}>
      {FF_LEAGUES.map((lg,i) => {
        const t = totals[lg.id];
        const delta = t.delta;
        return (
          <div key={lg.id} style={{
            flex:1,padding:'14px 18px',
            borderLeft:i?'1px solid var(--rule)':'none',
            display:'flex',flexDirection:'column',gap:6,
          }}>
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              <span style={{width:6,height:6,borderRadius:'50%',background:lg.tone}}/>
              <span className="mono" style={{fontSize:10,color:'var(--mute)',letterSpacing:'.18em'}}>{lg.name}</span>
            </div>
            <div style={{display:'flex',alignItems:'baseline',gap:10}}>
              <span style={{fontFamily:'Archivo Black',fontSize:24,letterSpacing:'-0.02em'}}>{t.total}</span>
              {delta !== 0 && <DeltaPill delta={delta}/>}
              <span className="mono" style={{fontSize:9,color:'var(--mute)',marginLeft:'auto'}}>{lg.members} MEMBERS</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Live fixtures strip
function FixturesStrip(){
  return (
    <div style={{display:'flex',gap:0,borderBottom:'1px solid var(--rule)'}}>
      {LIVE_FIXTURES.map((f,i) => (
        <div key={f.id} style={{
          flex:1,padding:'10px 16px',
          borderLeft:i?'1px solid var(--rule)':'none',
          display:'flex',alignItems:'center',gap:14,
        }}>
          <LivePill/>
          <span className="mono" style={{fontSize:11,color:'var(--mute)',letterSpacing:'.18em'}}>{f.clock}</span>
          <span style={{fontFamily:'Archivo Black',fontSize:14,letterSpacing:'-0.01em',marginLeft:'auto'}}>
            {f.home}<span style={{color:'var(--cyan)',margin:'0 8px'}}>{f.hs}–{f.as}</span>{f.away}
          </span>
        </div>
      ))}
    </div>
  );
}

// Topbar shared header — keeps the FORZAKIT chrome consistent
function LiveTopHeader({rightSlot}){
  return (
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-end',padding:'24px 32px 16px',borderBottom:'1px solid var(--rule)'}}>
      <div>
        <div className="mono" style={{fontSize:10,color:'var(--mute)'}}>MATCH DAY · GW 28</div>
        <div style={{display:'flex',alignItems:'center',gap:14,marginTop:4}}>
          <div className="display" style={{fontSize:34}}>Live Centre</div>
          <LivePill size={11}/>
        </div>
      </div>
      {rightSlot}
    </div>
  );
}

// ── V1 — Split (mini pitch · feed) ──────────────────────────
// Click a league card on the LEFT rail to swap which team is shown on
// the pitch (captain, chip badge change). The feed on the right always
// shows every event across every league — that's the cross-league
// "what's happening to my players" view.
function LiveV1Desktop(){
  const [active, setActive] = React.useState('office');
  const lg = leagueById(active);
  const totals = liveTotalsByLeague();

  return (
    <div style={{display:'flex',width:'100%',height:'100%',background:'var(--ink)',color:'var(--paper)',fontFamily:'Archivo,sans-serif'}}>
      <SideNav active="live"/>
      <main style={{flex:1,display:'flex',flexDirection:'column',minWidth:0}}>
        <LiveTopHeader rightSlot={
          <div style={{textAlign:'right'}}>
            <div className="mono" style={{fontSize:9,color:'var(--mute)'}}>FOCUSED LEAGUE</div>
            <div style={{display:'flex',alignItems:'center',gap:8,marginTop:2,justifyContent:'flex-end'}}>
              <span style={{width:8,height:8,borderRadius:'50%',background:lg.tone}}/>
              <span style={{fontFamily:'Archivo Black',fontSize:20,letterSpacing:'-0.01em'}}>{lg.name}</span>
            </div>
            <div className="mono" style={{fontSize:9,color:'var(--mute)',marginTop:2}}>
              RANK {lg.rank} · {lg.chip ? lg.chip.toUpperCase() : 'NO CHIP'}
            </div>
          </div>
        }/>
        <FixturesStrip/>

        {/* League selector — click to scope the pitch */}
        <div style={{display:'flex',borderBottom:'1px solid var(--rule)'}}>
          {FF_LEAGUES.map((l,i) => {
            const t = totals[l.id];
            const isActive = l.id === active;
            return (
              <button
                key={l.id}
                onClick={() => setActive(l.id)}
                style={{
                  flex:1,padding:'14px 18px',
                  borderLeft:i?'1px solid var(--rule)':'none',
                  borderTop:'none',borderRight:'none',borderBottom:'none',
                  background:isActive?`${l.tone}10`:'transparent',
                  borderBottom:isActive?`2px solid ${l.tone}`:'2px solid transparent',
                  cursor:'pointer',color:'var(--paper)',
                  display:'flex',flexDirection:'column',gap:6,alignItems:'flex-start',
                  fontFamily:'Archivo,sans-serif',textAlign:'left',
                }}
              >
                <div style={{display:'flex',alignItems:'center',gap:8,width:'100%'}}>
                  <span style={{width:6,height:6,borderRadius:'50%',background:l.tone}}/>
                  <span className="mono" style={{fontSize:10,color:isActive?l.tone:'var(--mute)',letterSpacing:'.18em'}}>{l.name.toUpperCase()}</span>
                  <span className="mono" style={{fontSize:9,color:'var(--mute)',marginLeft:'auto'}}>{l.members} MEMBERS</span>
                </div>
                <div style={{display:'flex',alignItems:'baseline',gap:10,width:'100%'}}>
                  <span style={{fontFamily:'Archivo Black',fontSize:26,letterSpacing:'-0.02em',color:isActive?l.tone:'var(--paper)'}}>{t.total}</span>
                  <DeltaPill delta={t.delta}/>
                  {l.chip && <span className="mono" style={{fontSize:9,color:'var(--gold)',letterSpacing:'.14em',marginLeft:'auto'}}>· {l.chip.toUpperCase()}</span>}
                </div>
              </button>
            );
          })}
        </div>

        {/* Body — two columns */}
        <div style={{flex:1,display:'grid',gridTemplateColumns:'minmax(0, 520px) 1fr',minHeight:0}}>
          {/* Mini pitch — scoped to selected league */}
          <div style={{padding:'20px 24px',borderRight:'1px solid var(--rule)',display:'flex',flexDirection:'column',gap:14,minHeight:0}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                <span style={{width:3,height:14,background:lg.tone}}/>
                <span className="mono" style={{fontSize:11,color:'var(--paper)',letterSpacing:'.22em'}}>MY XI</span>
                <span className="mono" style={{fontSize:9,color:'var(--mute)',letterSpacing:'.14em'}}>· {lg.name.toUpperCase()}</span>
              </div>
              <div className="mono" style={{fontSize:9,color:'var(--mute)'}}>3 ACTIVE NOW</div>
            </div>
            <div style={{flex:1,minHeight:0}}>
              <MiniPitch league={active}/>
            </div>
            <div className="mono" style={{fontSize:9,color:'var(--mute)',lineHeight:1.6}}>
              ● PULSE = PLAYER IN A LIVE FIXTURE · <span style={{color:'var(--gold)'}}>C</span> = CAPTAIN FOR {lg.short} · NUMBERS ARE NEUTRAL GW POINTS
            </div>
          </div>

          {/* Events feed — ALL leagues, regardless of pitch selection */}
          <div style={{display:'flex',flexDirection:'column',minHeight:0}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'14px 20px',borderBottom:'1px solid var(--rule)'}}>
              <div style={{display:'flex',alignItems:'center',gap:10}}>
                <span style={{width:3,height:14,background:'var(--gold)'}}/>
                <span className="mono" style={{fontSize:11,color:'var(--paper)',letterSpacing:'.22em'}}>MATCH EVENTS</span>
                <span className="mono" style={{fontSize:9,color:'var(--mute)',letterSpacing:'.14em'}}>· EVERY PLAYER · EVERY LEAGUE</span>
              </div>
              <span className="mono" style={{fontSize:9,color:'var(--mute)'}}>{LIVE_EVENTS.length} TOTAL</span>
            </div>
            <div style={{flex:1,overflow:'auto'}}>
              {LIVE_EVENTS.map(e => <EventRow key={e.id} e={e}/>)}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

// ── V2 — Banner pitch · grouped feed below ──────────────────
function LiveV2Desktop(){
  // Group by event burst (minute) so users see "what happened at 82'" together.
  const groups = [];
  for (const e of LIVE_EVENTS){
    const last = groups[groups.length-1];
    if (last && last.t === e.t && last.player === e.player && last.kind === e.kind){
      last.events.push(e);
    } else {
      groups.push({ t:e.t, min:e.min, player:e.player, kind:e.kind, note:e.note, cap:e.cap, events:[e] });
    }
  }

  return (
    <div style={{display:'flex',width:'100%',height:'100%',background:'var(--ink)',color:'var(--paper)',fontFamily:'Archivo,sans-serif'}}>
      <SideNav active="live"/>
      <main style={{flex:1,display:'flex',flexDirection:'column',minWidth:0,overflow:'auto'}}>
        <LiveTopHeader rightSlot={
          <div style={{textAlign:'right'}}>
            <div className="mono" style={{fontSize:9,color:'var(--mute)'}}>LIVE NET</div>
            <div style={{fontFamily:'Archivo Black',fontSize:24,color:'var(--positive)'}}>+25 PTS</div>
            <div className="mono" style={{fontSize:9,color:'var(--mute)'}}>ACROSS 4 LEAGUES</div>
          </div>
        }/>
        <FixturesStrip/>

        {/* Banner pitch — full width but capped height */}
        <div style={{padding:'18px 32px 6px',display:'flex',gap:18}}>
          <div style={{flex:1,height:280}}>
            <MiniPitch/>
          </div>
          <div style={{width:260,display:'flex',flexDirection:'column',gap:8}}>
            <div className="mono" style={{fontSize:10,color:'var(--mute)',letterSpacing:'.22em'}}>TOP GAINERS · THIS GW</div>
            {LIVE_SQUAD.slice().sort((a,b)=>b.pts-a.pts).slice(0,4).map(p => (
              <div key={p.id} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 10px',background:'var(--ink-2)',border:'1px solid var(--rule)',borderLeft:`2px solid ${POS_TONE[p.pos]}`}}>
                <div style={{fontFamily:'Archivo Black',fontSize:13}}>{p.last}</div>
                <div className="mono" style={{fontSize:9,color:'var(--mute)',marginLeft:'auto'}}>{p.club}</div>
                <DeltaPill delta={p.pts}/>
              </div>
            ))}
          </div>
        </div>

        <LiveTotalsBar/>

        {/* Grouped feed */}
        <div style={{padding:'8px 0 24px'}}>
          <div style={{display:'flex',alignItems:'center',gap:10,padding:'14px 32px'}}>
            <span style={{width:3,height:14,background:'var(--gold)'}}/>
            <span className="mono" style={{fontSize:11,color:'var(--paper)',letterSpacing:'.22em'}}>MATCH EVENTS</span>
            <span className="mono" style={{fontSize:9,color:'var(--mute)',letterSpacing:'.14em'}}>· GROUPED · ALL LEAGUES</span>
          </div>
          {groups.map((g,gi) => <EventGroupCard key={gi} g={g}/>)}
        </div>
      </main>
    </div>
  );
}

function EventGroupCard({g}){
  const p = playerById(g.player);
  const kind = EVENT_KIND[g.kind];
  const net = g.events.reduce((s,e)=>s+e.delta,0);
  return (
    <div style={{margin:'0 32px 10px',border:'1px solid var(--rule)',background:'var(--ink-2)',display:'grid',gridTemplateColumns:'90px 1fr 320px',alignItems:'stretch'}}>
      <div style={{padding:'14px 16px',borderRight:'1px solid var(--rule)',display:'flex',flexDirection:'column',gap:4,justifyContent:'center'}}>
        <span className="mono" style={{fontSize:11,color:'var(--paper)',letterSpacing:'.18em'}}>{g.t}</span>
        <span style={{color:kind.tone,fontFamily:'Archivo Black',fontSize:14}}>{kind.glyph} {kind.label}</span>
      </div>
      <div style={{padding:'14px 18px',display:'flex',flexDirection:'column',gap:6,justifyContent:'center'}}>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <span style={{fontFamily:'Archivo Black',fontSize:20,letterSpacing:'-0.01em'}}>{p.last}</span>
          <span className="mono" style={{fontSize:10,color:'var(--mute)',letterSpacing:'.14em'}}>{p.club} · {p.pos}</span>
        </div>
        <div className="mono" style={{fontSize:10,color:'var(--mute)'}}>
          APPEARS IN {g.events.length} OF YOUR LEAGUES
        </div>
      </div>
      <div style={{borderLeft:'1px solid var(--rule)',display:'flex',flexDirection:'column'}}>
        {g.events.map((e,i) => (
          <div key={e.id} style={{flex:1,padding:'8px 14px',display:'flex',alignItems:'center',gap:10,borderTop:i?'1px solid var(--rule)':'none'}}>
            <LeagueChip league={e.league} compact/>
            {e.note && <span className="mono" style={{fontSize:8,color:'var(--gold)',letterSpacing:'.14em'}}>{e.note}</span>}
            <span style={{marginLeft:'auto'}}><DeltaPill delta={e.delta}/></span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── V3 — Three pane: league rail · pitch · feed ─────────────
function LiveV3Desktop(){
  const totals = liveTotalsByLeague();
  const activeLeague = 'office';
  const filtered = LIVE_EVENTS.filter(e => e.league === activeLeague);

  return (
    <div style={{display:'flex',width:'100%',height:'100%',background:'var(--ink)',color:'var(--paper)',fontFamily:'Archivo,sans-serif'}}>
      <SideNav active="live"/>
      <main style={{flex:1,display:'flex',flexDirection:'column',minWidth:0}}>
        <LiveTopHeader rightSlot={
          <div style={{textAlign:'right'}}>
            <div className="mono" style={{fontSize:9,color:'var(--mute)'}}>FOCUSED LEAGUE</div>
            <div style={{fontFamily:'Archivo Black',fontSize:20,color:'var(--cyan)',marginTop:2}}>OFFICE HEROES</div>
            <div className="mono" style={{fontSize:9,color:'var(--mute)'}}>RANK 3 / 14</div>
          </div>
        }/>
        <FixturesStrip/>

        {/* Three columns */}
        <div style={{flex:1,display:'grid',gridTemplateColumns:'240px 1fr 1fr',minHeight:0}}>
          {/* League rail */}
          <aside style={{borderRight:'1px solid var(--rule)',padding:'18px 0',display:'flex',flexDirection:'column'}}>
            <div className="mono" style={{fontSize:10,color:'var(--mute)',letterSpacing:'.22em',padding:'0 18px 12px'}}>YOUR LEAGUES</div>
            {FF_LEAGUES.map(lg => {
              const t = totals[lg.id];
              const active = lg.id === activeLeague;
              return (
                <div key={lg.id} style={{
                  padding:'14px 18px',
                  borderLeft:active?`2px solid ${lg.tone}`:'2px solid transparent',
                  background:active?`${lg.tone}10`:'transparent',
                  display:'flex',flexDirection:'column',gap:6,
                  borderBottom:'1px solid var(--rule)',
                }}>
                  <div style={{display:'flex',alignItems:'center',gap:8}}>
                    <span style={{width:6,height:6,borderRadius:'50%',background:lg.tone}}/>
                    <span style={{fontFamily:'Archivo Black',fontSize:13,letterSpacing:'-0.01em'}}>{lg.name}</span>
                  </div>
                  <div style={{display:'flex',alignItems:'baseline',gap:10}}>
                    <span style={{fontFamily:'Archivo Black',fontSize:20,color:active?lg.tone:'var(--paper)'}}>{t.total}</span>
                    <DeltaPill delta={t.delta}/>
                    <span className="mono" style={{fontSize:9,color:'var(--mute)',marginLeft:'auto'}}>{LIVE_EVENTS.filter(e=>e.league===lg.id).length} EVTS</span>
                  </div>
                </div>
              );
            })}
            <div style={{marginTop:'auto',padding:'14px 18px',borderTop:'1px solid var(--rule)'}} className="mono">
              <div style={{fontSize:9,color:'var(--mute)',letterSpacing:'.18em'}}>SWITCH LEAGUE</div>
              <div style={{fontSize:11,color:'var(--cyan)',marginTop:4}}>← / → ARROWS</div>
            </div>
          </aside>

          {/* Pitch */}
          <div style={{padding:'18px 20px',borderRight:'1px solid var(--rule)',display:'flex',flexDirection:'column',gap:14,minHeight:0}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
              <div className="mono" style={{fontSize:10,color:'var(--cyan)',letterSpacing:'.22em'}}>│ MY XI · OFFICE HEROES</div>
              <span style={{fontFamily:'Archivo Black',fontSize:12,background:'var(--gold)',color:'var(--ink)',padding:'2px 6px'}}>C · ABRAHAM</span>
            </div>
            <div style={{flex:1,minHeight:0}}>
              <MiniPitch/>
            </div>
          </div>

          {/* Feed scoped to active league */}
          <div style={{display:'flex',flexDirection:'column',minHeight:0}}>
            <div style={{display:'flex',alignItems:'center',gap:10,padding:'14px 20px',borderBottom:'1px solid var(--rule)'}}>
              <span style={{width:3,height:14,background:leagueById(activeLeague).tone}}/>
              <span className="mono" style={{fontSize:11,color:'var(--paper)',letterSpacing:'.22em'}}>EVENTS · OFFICE HEROES</span>
              <span className="mono" style={{fontSize:9,color:'var(--mute)',marginLeft:'auto'}}>{filtered.length} TOTAL</span>
            </div>
            <div style={{flex:1,overflow:'hidden'}}>
              {filtered.map(e => <EventRow key={e.id} e={e} showLeague={false}/>)}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

window.LiveV1Desktop = LiveV1Desktop;
window.LiveV2Desktop = LiveV2Desktop;
window.LiveV3Desktop = LiveV3Desktop;
window.MiniPitch = MiniPitch;
window.EventRow = EventRow;
window.LeagueChip = LeagueChip;
window.DeltaPill = DeltaPill;
window.LivePill = LivePill;
window.LiveTotalsBar = LiveTotalsBar;
window.FixturesStrip = FixturesStrip;
