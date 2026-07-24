/* global React, SideNav, FIXTURES, COMPS, groupByDate, groupByComp, countByComp */

const { useState, useMemo } = React;

// ─── Atoms ───────────────────────────────────────────────────────────────

// Status pill on the far left of a fixture row (FT / LIVE / KO time).
function StatusPill({ f, small }){
  const isLive = f.status==='LIVE';
  const isFT   = f.status==='FT';
  const isKO   = f.status==='KO';
  const bg = isLive? 'rgba(239,68,68,.12)' : isFT? 'var(--ink-3)' : 'transparent';
  const fg = isLive? 'var(--danger)' : isFT? 'var(--mute)' : 'var(--paper)';
  const border = isKO? '1px solid var(--rule)' : 'none';
  return (
    <div style={{
      minWidth: small?40:48, height: small?20:24,
      padding:'0 8px', background:bg, border, color:fg,
      display:'flex',alignItems:'center',justifyContent:'center',gap:5,
      fontFamily:'JetBrains Mono',fontSize: small?9:10,letterSpacing:'.16em',
      flexShrink:0,
    }}>
      {isLive && <span style={{width:5,height:5,background:'var(--danger)',borderRadius:'50%',animation:'fkPulse 1.2s infinite'}}/>}
      <span>{isLive? f.live : isFT? 'FT' : f.kickoff}</span>
    </div>
  );
}

// Score block — the hero. Hot scoreline (3+ goal diff) gets a subtle tone wash.
function Score({ f, big }){
  if(!f.score){
    return (
      <div style={{
        minWidth: big?96:80, textAlign:'center',
        fontFamily:'JetBrains Mono',fontSize: big?12:11,
        letterSpacing:'.18em',color:'var(--mute)',
      }}>{f.kickoff}</div>
    );
  }
  const [h,a] = f.score;
  const isLive = f.status==='LIVE';
  const homeWon = h>a, awayWon = a>h;
  const homeColor = isLive? 'var(--paper)' : homeWon? 'var(--paper)' : 'var(--mute)';
  const awayColor = isLive? 'var(--paper)' : awayWon? 'var(--paper)' : 'var(--mute)';
  return (
    <div style={{
      minWidth: big?96:80,
      display:'flex',alignItems:'center',justifyContent:'center',gap: big?12:10,
      fontFamily:'Archivo Black',fontSize: big?22:18,letterSpacing:'-0.02em',
    }}>
      <span style={{color:homeColor}}>{h}</span>
      <span style={{width:6,height:1,background:'var(--rule)'}}/>
      <span style={{color:awayColor}}>{a}</span>
    </div>
  );
}

// One fixture row. Score is centered, home is right-aligned, away is left-aligned.
function FixtureRow({ f, showComp=false, dense=false }){
  const tone = COMPS[f.comp].tone;
  const homeWon = f.score && f.score[0]>f.score[1];
  const awayWon = f.score && f.score[1]>f.score[0];
  return (
    <div style={{
      display:'grid',
      gridTemplateColumns: showComp
        ? '56px 1fr 96px 1fr 64px 40px'
        : '56px 1fr 96px 1fr 64px',
      gap:16, alignItems:'center',
      padding: dense? '10px 16px' : '14px 18px',
      borderBottom:'1px solid var(--rule)',
      background: f.status==='LIVE'? 'rgba(239,68,68,.04)' : 'transparent',
      borderLeft: f.status==='LIVE'? '2px solid var(--danger)' : '2px solid transparent',
    }}>
      <StatusPill f={f}/>
      {/* Home — right aligned */}
      <div style={{display:'flex',alignItems:'center',gap:10,justifyContent:'flex-end',minWidth:0}}>
        <div style={{textAlign:'right',minWidth:0,overflow:'hidden'}}>
          <div style={{
            fontFamily:'Archivo Black',fontSize: dense?13:14,letterSpacing:'-0.01em',
            color: homeWon? 'var(--paper)' : 'var(--mute)',
            whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',
            textTransform:'uppercase',
          }}>{f.home.name}</div>
          <div className="mono" style={{fontSize:9,color:'var(--mute)',marginTop:2}}>{f.home.code}</div>
        </div>
      </div>
      <Score f={f}/>
      {/* Away — left aligned */}
      <div style={{display:'flex',alignItems:'center',gap:10,minWidth:0}}>
        <div style={{minWidth:0,overflow:'hidden'}}>
          <div style={{
            fontFamily:'Archivo Black',fontSize: dense?13:14,letterSpacing:'-0.01em',
            color: awayWon? 'var(--paper)' : 'var(--mute)',
            whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',
            textTransform:'uppercase',
          }}>{f.away.name}</div>
          <div className="mono" style={{fontSize:9,color:'var(--mute)',marginTop:2}}>{f.away.code}</div>
        </div>
      </div>
      <div className="mono" style={{fontSize:9,color:'var(--mute)',textAlign:'right'}}>{f.kickoff}</div>
      {showComp && (
        <div style={{display:'flex',justifyContent:'flex-end'}}>
          <div title={COMPS[f.comp].name} style={{
            width:32, height:18, border:`1px solid ${tone}`, color:tone,
            fontFamily:'Archivo Black',fontSize:9,letterSpacing:'.04em',
            display:'flex',alignItems:'center',justifyContent:'center',
          }}>{f.comp}</div>
        </div>
      )}
    </div>
  );
}

// Date band header — 3px paper bar + DAY · NUMBER · MONTH + tally.
function DateBand({ g, mini }){
  return (
    <div style={{display:'flex',alignItems:'baseline',gap:14,padding: mini? '12px 18px 6px' : '20px 18px 10px'}}>
      <div style={{width:3,height: mini?14:18,background:'var(--paper)'}}/>
      <div className="display" style={{fontSize: mini?16:20,letterSpacing:'-0.01em'}}>{g.day}</div>
      <div className="mono" style={{fontSize:11,letterSpacing:'.18em',color:'var(--mute)'}}>{g.dlong}</div>
      <div style={{flex:1,height:1,background:'var(--rule)'}}/>
      <div className="mono" style={{fontSize:10,color:'var(--mute)'}}>{g.fixtures.length} MATCH{g.fixtures.length>1?'ES':''}</div>
    </div>
  );
}

// Competition band header — 3px tone bar + name + tally.
function CompBand({ comp, count, mini }){
  return (
    <div style={{display:'flex',alignItems:'baseline',gap:14,padding: mini? '12px 18px 6px' : '20px 18px 10px'}}>
      <div style={{width:3,height: mini?14:18,background:comp.tone}}/>
      <div style={{fontFamily:'Archivo Black',fontSize: mini?14:16,letterSpacing:'.04em',color:'var(--paper)'}}>{comp.name}</div>
      <div className="mono" style={{fontSize:10,color:comp.tone,letterSpacing:'.18em'}}>{comp.code}</div>
      <div style={{flex:1,height:1,background:'var(--rule)'}}/>
      <div className="mono" style={{fontSize:10,color:'var(--mute)'}}>{count} MATCH{count>1?'ES':''}</div>
    </div>
  );
}

// Sub-tabs and Gameweek pager and chip-filter for competition.
function CompChip({ comp, active, count, onClick }){
  return (
    <div onClick={onClick} style={{
      display:'inline-flex',alignItems:'center',gap:8,
      padding:'5px 10px',
      border:`1px solid ${active? comp.tone : 'var(--rule)'}`,
      color: active? comp.tone : 'var(--paper)',
      background: active? 'rgba(255,255,255,.02)' : 'transparent',
      fontFamily:'JetBrains Mono',fontSize:10,letterSpacing:'.18em',
      cursor:'pointer',userSelect:'none',
    }}>
      <span style={{width:6,height:6,background:comp.tone,borderRadius:0}}/>
      <span>{comp.code}</span>
      <span style={{color:'var(--mute)'}}>{count}</span>
    </div>
  );
}

function AllChip({ active, count, onClick }){
  return (
    <div onClick={onClick} style={{
      display:'inline-flex',alignItems:'center',gap:8,
      padding:'5px 10px',
      border:`1px solid ${active? 'var(--paper)' : 'var(--rule)'}`,
      color: active? 'var(--paper)' : 'var(--mute)',
      fontFamily:'JetBrains Mono',fontSize:10,letterSpacing:'.18em',
      cursor:'pointer',userSelect:'none',
    }}>
      <span>ALL</span><span style={{color:'var(--mute)'}}>{count}</span>
    </div>
  );
}

function GameweekPager({ gw, dateRange, onPrev, onNext }){
  return (
    <div style={{display:'inline-flex',alignItems:'center',gap:0,border:'1px solid var(--rule)'}}>
      <button onClick={onPrev} style={{
        width:34,height:34,background:'transparent',border:'none',
        borderRight:'1px solid var(--rule)',color:'var(--paper)',
        fontFamily:'JetBrains Mono',fontSize:14,cursor:'pointer',
      }}>‹</button>
      <div style={{padding:'0 16px',height:34,display:'flex',flexDirection:'column',justifyContent:'center',alignItems:'center',minWidth:170}}>
        <div className="mono" style={{fontSize:9,color:'var(--mute)',letterSpacing:'.22em'}}>GAMEWEEK</div>
        <div style={{display:'flex',alignItems:'baseline',gap:8}}>
          <div style={{fontFamily:'Archivo Black',fontSize:14,letterSpacing:'-0.01em'}}>GW {gw}</div>
          <div className="mono" style={{fontSize:9,color:'var(--mute)'}}>{dateRange}</div>
        </div>
      </div>
      <button onClick={onNext} style={{
        width:34,height:34,background:'transparent',border:'none',
        borderLeft:'1px solid var(--rule)',color:'var(--paper)',
        fontFamily:'JetBrains Mono',fontSize:14,cursor:'pointer',
      }}>›</button>
    </div>
  );
}

// ─── Shared page header (eyebrow + title + KPIs) ─────────────────────────
function ScoresHeader({ liveCount, totalCount }){
  return (
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-end',padding:'24px 32px 16px',borderBottom:'1px solid var(--rule)'}}>
      <div>
        <div className="mono" style={{fontSize:10,color:'var(--mute)'}}>MATCH CENTRE</div>
        <div className="display" style={{fontSize:34,marginTop:4}}>Scores</div>
      </div>
      <div style={{display:'flex',gap:32,alignItems:'flex-end'}}>
        <div style={{textAlign:'right'}}>
          <div className="mono" style={{fontSize:9,color:'var(--mute)'}}>FIXTURES</div>
          <div style={{fontFamily:'Archivo Black',fontSize:20,marginTop:2}}>{totalCount}</div>
        </div>
        <div style={{textAlign:'right'}}>
          <div className="mono" style={{fontSize:9,color:'var(--mute)'}}>LIVE NOW</div>
          <div style={{fontFamily:'Archivo Black',fontSize:20,marginTop:2,color: liveCount>0?'var(--danger)':'var(--mute)',display:'flex',alignItems:'center',justifyContent:'flex-end',gap:8}}>
            {liveCount>0 && <span style={{width:8,height:8,background:'var(--danger)',borderRadius:'50%',display:'inline-block',animation:'fkPulse 1.2s infinite'}}/>}
            {liveCount}
          </div>
        </div>
      </div>
    </div>
  );
}

function SubTabs({ active='SCORES' }){
  const tabs = ['SCORES','RESULTS','LIVE','TABLES'];
  return (
    <div style={{display:'flex',gap:24,padding:'14px 32px',borderBottom:'1px solid var(--rule)'}}>
      {tabs.map(t => (
        <div key={t} className="mono" style={{
          fontSize:11,letterSpacing:'.18em',paddingBottom:6,position:'relative',
          color:t===active?'var(--paper)':'var(--mute)',
        }}>
          {t}
          {t==='LIVE' && <span style={{display:'inline-block',width:5,height:5,borderRadius:'50%',background:'var(--danger)',marginLeft:6,verticalAlign:'middle'}}/>}
          {t===active && <span style={{position:'absolute',left:0,right:0,bottom:-15,height:2,background:'var(--cyan)'}}/>}
        </div>
      ))}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// VARIATION 1 — "Match Centre" (canonical)
// Gameweek pager + view toggle (BY DATE / BY COMPETITION) + comp chips.
// ════════════════════════════════════════════════════════════════════════
function ScoresV1(){
  const [view,setView] = useState('date'); // 'date' | 'comp'
  const [filter,setFilter] = useState('ALL');
  const [gw,setGw] = useState(12);

  const filtered = useMemo(() => filter==='ALL'? FIXTURES : FIXTURES.filter(f=>f.comp===filter), [filter]);
  const counts = useMemo(() => countByComp(FIXTURES), []);
  const liveCount = FIXTURES.filter(f=>f.status==='LIVE').length;

  const dateGroups = useMemo(() => groupByDate(filtered), [filtered]);
  const compGroups = useMemo(() => groupByComp(filtered), [filtered]);

  return (
    <div style={{display:'flex',width:'100%',height:'100%',background:'var(--ink)',color:'var(--paper)',fontFamily:'Archivo,sans-serif'}}>
      <SideNav active="scores"/>
      <main style={{flex:1,display:'flex',flexDirection:'column',minWidth:0}}>
        <ScoresHeader liveCount={liveCount} totalCount={FIXTURES.length}/>
        <SubTabs active="SCORES"/>
        {/* Controls strip */}
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:24,padding:'14px 32px',borderBottom:'1px solid var(--rule)'}}>
          <div style={{display:'flex',alignItems:'center',gap:18}}>
            {/* View toggle */}
            <div className="mono" style={{fontSize:9,color:'var(--mute)',letterSpacing:'.22em'}}>GROUP BY</div>
            <div style={{display:'inline-flex',border:'1px solid var(--rule)'}}>
              {[
                {id:'date',label:'DATE'},
                {id:'comp',label:'COMPETITION'},
              ].map(o => (
                <button key={o.id} onClick={()=>setView(o.id)} style={{
                  padding:'7px 14px',background: view===o.id? 'rgba(0,180,216,.08)' : 'transparent',
                  color: view===o.id? 'var(--cyan)' : 'var(--mute)',
                  border:'none',
                  borderRight: o.id==='date'? '1px solid var(--rule)' : 'none',
                  fontFamily:'JetBrains Mono',fontSize:10,letterSpacing:'.18em',cursor:'pointer',
                }}>{o.label}</button>
              ))}
            </div>
            {/* Comp chips */}
            <div style={{width:1,height:20,background:'var(--rule)',margin:'0 6px'}}/>
            <div style={{display:'flex',gap:8,alignItems:'center'}}>
              <AllChip active={filter==='ALL'} count={FIXTURES.length} onClick={()=>setFilter('ALL')}/>
              {Object.values(COMPS).map(c => (
                <CompChip key={c.code} comp={c} count={counts[c.code]||0} active={filter===c.code} onClick={()=>setFilter(c.code)}/>
              ))}
            </div>
          </div>
          <GameweekPager gw={gw} dateRange="13–18 SEP" onPrev={()=>setGw(g=>Math.max(1,g-1))} onNext={()=>setGw(g=>g+1)}/>
        </div>
        {/* Body */}
        <div style={{flex:1,overflow:'auto'}}>
          {view==='date' && dateGroups.map(g => (
            <section key={g.date}>
              <DateBand g={g}/>
              {g.fixtures.map(f => <FixtureRow key={f.id} f={f} showComp={true}/>)}
            </section>
          ))}
          {view==='comp' && compGroups.map(g => (
            <section key={g.code}>
              <CompBand comp={g} count={g.fixtures.length}/>
              {g.fixtures.map(f => <FixtureRow key={f.id} f={f}/>)}
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// VARIATION 2 — "Split rail"
// Left rail = competition list (single-select). Right = date-grouped body.
// ════════════════════════════════════════════════════════════════════════
function ScoresV2(){
  const [comp,setComp] = useState('ALL');
  const [gw,setGw] = useState(12);

  const filtered = useMemo(() => comp==='ALL'? FIXTURES : FIXTURES.filter(f=>f.comp===comp), [comp]);
  const counts = useMemo(() => countByComp(FIXTURES), []);
  const dateGroups = useMemo(() => groupByDate(filtered), [filtered]);
  const liveCount = FIXTURES.filter(f=>f.status==='LIVE').length;

  return (
    <div style={{display:'flex',width:'100%',height:'100%',background:'var(--ink)',color:'var(--paper)',fontFamily:'Archivo,sans-serif'}}>
      <SideNav active="scores"/>
      <main style={{flex:1,display:'flex',flexDirection:'column',minWidth:0}}>
        <ScoresHeader liveCount={liveCount} totalCount={FIXTURES.length}/>
        <SubTabs active="SCORES"/>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'14px 32px',borderBottom:'1px solid var(--rule)'}}>
          <div className="mono" style={{fontSize:11,color:'var(--paper)',letterSpacing:'.18em'}}>
            {comp==='ALL'? 'ALL COMPETITIONS' : COMPS[comp].name}
            <span style={{color:'var(--mute)',marginLeft:10}}>· {filtered.length} FIXTURES</span>
          </div>
          <GameweekPager gw={gw} dateRange="13–18 SEP" onPrev={()=>setGw(g=>Math.max(1,g-1))} onNext={()=>setGw(g=>g+1)}/>
        </div>
        <div style={{flex:1,display:'flex',minHeight:0}}>
          {/* Competition rail */}
          <aside style={{width:240,flexShrink:0,borderRight:'1px solid var(--rule)',padding:'18px 0',background:'rgba(15,18,24,.4)'}}>
            <div className="mono" style={{fontSize:9,color:'var(--mute)',letterSpacing:'.22em',padding:'0 22px 12px'}}>COMPETITIONS</div>
            <CompRailItem id="ALL" tone="var(--paper)" name="ALL COMPETITIONS" code="ALL" count={FIXTURES.length} active={comp==='ALL'} onClick={()=>setComp('ALL')}/>
            {Object.values(COMPS).map(c => (
              <CompRailItem key={c.code} id={c.code} tone={c.tone} name={c.name} code={c.code} count={counts[c.code]||0} active={comp===c.code} onClick={()=>setComp(c.code)}/>
            ))}
            <div style={{padding:'18px 22px 0',marginTop:18,borderTop:'1px solid var(--rule)'}}>
              <div className="mono" style={{fontSize:9,color:'var(--mute)',letterSpacing:'.22em'}}>YOUR PLAYERS</div>
              <div style={{fontFamily:'Archivo Black',fontSize:14,marginTop:4}}>9 <span className="mono" style={{fontSize:10,color:'var(--mute)',marginLeft:4}}>IN THIS GW</span></div>
            </div>
          </aside>
          {/* Body */}
          <div style={{flex:1,overflow:'auto',minWidth:0}}>
            {dateGroups.map(g => (
              <section key={g.date}>
                <DateBand g={g}/>
                {g.fixtures.map(f => <FixtureRow key={f.id} f={f} showComp={comp==='ALL'}/>)}
              </section>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}

function CompRailItem({ tone, name, code, count, active, onClick }){
  return (
    <div onClick={onClick} style={{
      padding:'11px 22px',display:'flex',alignItems:'center',gap:10,
      borderLeft: active? `2px solid ${tone}` : '2px solid transparent',
      background: active? 'rgba(255,255,255,.03)' : 'transparent',
      cursor:'pointer',
    }}>
      <div style={{width:3,height:14,background:tone}}/>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontFamily:'Archivo Black',fontSize:11,letterSpacing:'.04em',color: active? 'var(--paper)':'var(--paper)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{name}</div>
        <div className="mono" style={{fontSize:9,color:tone,marginTop:3,letterSpacing:'.18em'}}>{code}</div>
      </div>
      <div className="mono" style={{fontSize:10,color: active? 'var(--paper)':'var(--mute)'}}>{count}</div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// VARIATION 3 — "Week grid"
// Calendar-style columns, one per day of the gameweek. Competition tone bar
// on each card. Great when fixtures span many days (PL + UCL + UEL).
// ════════════════════════════════════════════════════════════════════════
function ScoresV3(){
  const [gw,setGw] = useState(12);
  const dateGroups = useMemo(() => groupByDate(FIXTURES), []);
  const liveCount = FIXTURES.filter(f=>f.status==='LIVE').length;

  return (
    <div style={{display:'flex',width:'100%',height:'100%',background:'var(--ink)',color:'var(--paper)',fontFamily:'Archivo,sans-serif'}}>
      <SideNav active="scores"/>
      <main style={{flex:1,display:'flex',flexDirection:'column',minWidth:0}}>
        <ScoresHeader liveCount={liveCount} totalCount={FIXTURES.length}/>
        <SubTabs active="SCORES"/>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'14px 32px',borderBottom:'1px solid var(--rule)'}}>
          <div style={{display:'flex',gap:12,alignItems:'center'}}>
            <div className="mono" style={{fontSize:9,color:'var(--mute)',letterSpacing:'.22em'}}>LEGEND</div>
            {Object.values(COMPS).map(c => (
              <div key={c.code} style={{display:'inline-flex',alignItems:'center',gap:6}}>
                <span style={{width:8,height:2,background:c.tone}}/>
                <span className="mono" style={{fontSize:10,color:'var(--mute)',letterSpacing:'.18em'}}>{c.code}</span>
              </div>
            ))}
          </div>
          <GameweekPager gw={gw} dateRange="13–18 SEP" onPrev={()=>setGw(g=>Math.max(1,g-1))} onNext={()=>setGw(g=>g+1)}/>
        </div>
        <div style={{flex:1,display:'grid',gridTemplateColumns:`repeat(${dateGroups.length}, 1fr)`,minHeight:0,overflow:'hidden'}}>
          {dateGroups.map((g,i) => (
            <div key={g.date} style={{borderRight:i<dateGroups.length-1?'1px solid var(--rule)':'none',display:'flex',flexDirection:'column',minHeight:0}}>
              <div style={{padding:'16px 16px 14px',borderBottom:'1px solid var(--rule)'}}>
                <div className="mono" style={{fontSize:10,color:'var(--mute)',letterSpacing:'.22em'}}>{g.day}</div>
                <div style={{display:'flex',alignItems:'baseline',gap:6,marginTop:2}}>
                  <div className="display" style={{fontSize:28,letterSpacing:'-0.02em'}}>{g.dnum}</div>
                  <div className="mono" style={{fontSize:10,color:'var(--mute)'}}>SEP</div>
                </div>
                <div className="mono" style={{fontSize:9,color:'var(--mute)',marginTop:6}}>{g.fixtures.length} FIXTURE{g.fixtures.length>1?'S':''}</div>
              </div>
              <div style={{flex:1,overflow:'auto',padding:'10px 12px',display:'flex',flexDirection:'column',gap:8}}>
                {g.fixtures.map(f => <DayCard key={f.id} f={f}/>)}
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

function DayCard({ f }){
  const tone = COMPS[f.comp].tone;
  const isLive = f.status==='LIVE';
  const [h,a] = f.score || [null,null];
  const homeWon = f.score && h>a, awayWon = f.score && a>h;
  return (
    <div style={{
      background:'var(--ink-2)',
      borderLeft:`2px solid ${tone}`,
      padding:'10px 12px',
      display:'flex',flexDirection:'column',gap:6,
    }}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <div className="mono" style={{fontSize:9,color:tone,letterSpacing:'.18em'}}>{f.comp}</div>
        {isLive
          ? <div className="mono" style={{fontSize:9,color:'var(--danger)',letterSpacing:'.16em',display:'flex',alignItems:'center',gap:4}}><span style={{width:5,height:5,background:'var(--danger)',borderRadius:'50%',animation:'fkPulse 1.2s infinite'}}/>{f.live}</div>
          : <div className="mono" style={{fontSize:9,color:'var(--mute)',letterSpacing:'.16em'}}>{f.status==='FT'? 'FT' : f.kickoff}</div>}
      </div>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <div style={{minWidth:0,flex:1}}>
          <div style={{fontFamily:'Archivo Black',fontSize:11,letterSpacing:'.02em',color: homeWon?'var(--paper)':f.score?'var(--mute)':'var(--paper)',textTransform:'uppercase',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{f.home.code}</div>
          <div style={{fontFamily:'Archivo Black',fontSize:11,letterSpacing:'.02em',color: awayWon?'var(--paper)':f.score?'var(--mute)':'var(--paper)',textTransform:'uppercase',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',marginTop:3}}>{f.away.code}</div>
        </div>
        <div style={{textAlign:'right'}}>
          {f.score
            ? (<>
                <div style={{fontFamily:'Archivo Black',fontSize:16,color:homeWon?'var(--paper)':'var(--mute)',lineHeight:1}}>{h}</div>
                <div style={{fontFamily:'Archivo Black',fontSize:16,color:awayWon?'var(--paper)':'var(--mute)',lineHeight:1,marginTop:3}}>{a}</div>
              </>)
            : <div className="mono" style={{fontSize:10,color:'var(--paper)',letterSpacing:'.16em'}}>{f.kickoff}</div>}
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// MOBILE — canonical (V1 vocabulary, single column)
// ════════════════════════════════════════════════════════════════════════
function ScoresMobile(){
  const [view,setView] = useState('date');
  const [filter,setFilter] = useState('ALL');
  const filtered = useMemo(() => filter==='ALL'? FIXTURES : FIXTURES.filter(f=>f.comp===filter), [filter]);
  const counts = useMemo(() => countByComp(FIXTURES), []);
  const dateGroups = useMemo(() => groupByDate(filtered), [filtered]);
  const compGroups = useMemo(() => groupByComp(filtered), [filtered]);

  return (
    <div style={{width:'100%',height:'100%',background:'var(--ink)',color:'var(--paper)',display:'flex',flexDirection:'column',fontFamily:'Archivo,sans-serif',overflow:'hidden'}}>
      <div style={{height:32,display:'flex',justifyContent:'space-between',alignItems:'center',padding:'0 22px',color:'var(--paper)',fontFamily:'JetBrains Mono',fontSize:11,fontWeight:600,flexShrink:0}}>
        <span>9:41</span><span>●●● ▮</span>
      </div>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'8px 18px 12px',borderBottom:'1px solid var(--rule)'}}>
        <div style={{fontFamily:'Archivo Black',fontSize:18,letterSpacing:'-0.01em'}}>FORZA<span style={{color:'var(--cyan)'}}>KIT</span></div>
        <div className="mono" style={{fontSize:9,color:'var(--mute)',display:'flex',alignItems:'center',gap:5}}>
          <span style={{width:6,height:6,background:'var(--danger)',borderRadius:'50%',animation:'fkPulse 1.2s infinite'}}/>
          <span>1 LIVE</span>
        </div>
      </div>
      <div style={{display:'flex',gap:18,padding:'10px 18px 0',borderBottom:'1px solid var(--rule)'}}>
        {['SCORES','RESULTS','LIVE','TABLES'].map((t,i) => (
          <div key={t} className="mono" style={{
            fontSize:10,letterSpacing:'.18em',paddingBottom:8,position:'relative',
            color:i===0?'var(--paper)':'var(--mute)',
          }}>
            {t}{t==='LIVE' && <span style={{display:'inline-block',width:4,height:4,borderRadius:'50%',background:'var(--danger)',marginLeft:4,verticalAlign:'middle'}}/>}
            {i===0 && <span style={{position:'absolute',left:0,right:0,bottom:-1,height:2,background:'var(--cyan)'}}/>}
          </div>
        ))}
      </div>
      <div style={{padding:'14px 18px 10px'}}>
        <div className="mono" style={{fontSize:9,color:'var(--mute)',letterSpacing:'.22em'}}>MATCH CENTRE</div>
        <div className="display" style={{fontSize:26,letterSpacing:'-0.02em',marginTop:4}}>Scores</div>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginTop:12,gap:10}}>
          <div style={{display:'inline-flex',border:'1px solid var(--rule)',flex:1}}>
            {[{id:'date',label:'BY DATE'},{id:'comp',label:'BY COMP'}].map(o => (
              <button key={o.id} onClick={()=>setView(o.id)} style={{
                flex:1,padding:'6px 0',background: view===o.id?'rgba(0,180,216,.08)':'transparent',
                color: view===o.id?'var(--cyan)':'var(--mute)',border:'none',
                borderRight: o.id==='date'?'1px solid var(--rule)':'none',
                fontFamily:'JetBrains Mono',fontSize:9,letterSpacing:'.18em',cursor:'pointer',
              }}>{o.label}</button>
            ))}
          </div>
          <div style={{display:'inline-flex',border:'1px solid var(--rule)'}}>
            <button style={{width:28,height:28,background:'transparent',border:'none',borderRight:'1px solid var(--rule)',color:'var(--paper)',fontFamily:'JetBrains Mono',fontSize:12,cursor:'pointer'}}>‹</button>
            <div style={{padding:'0 10px',height:28,display:'flex',alignItems:'center',gap:6}}>
              <div className="mono" style={{fontSize:9,color:'var(--mute)'}}>GW</div>
              <div style={{fontFamily:'Archivo Black',fontSize:11}}>12</div>
            </div>
            <button style={{width:28,height:28,background:'transparent',border:'none',borderLeft:'1px solid var(--rule)',color:'var(--paper)',fontFamily:'JetBrains Mono',fontSize:12,cursor:'pointer'}}>›</button>
          </div>
        </div>
        <div style={{display:'flex',gap:6,marginTop:10,overflowX:'auto',paddingBottom:2}}>
          <AllChip active={filter==='ALL'} count={FIXTURES.length} onClick={()=>setFilter('ALL')}/>
          {Object.values(COMPS).map(c => (
            <CompChip key={c.code} comp={c} count={counts[c.code]||0} active={filter===c.code} onClick={()=>setFilter(c.code)}/>
          ))}
        </div>
      </div>
      <div style={{flex:1,overflow:'auto'}}>
        {view==='date' && dateGroups.map(g => (
          <section key={g.date}>
            <DateBand g={g} mini/>
            {g.fixtures.map(f => <MobileFixtureRow key={f.id} f={f}/>)}
          </section>
        ))}
        {view==='comp' && compGroups.map(g => (
          <section key={g.code}>
            <CompBand comp={g} count={g.fixtures.length} mini/>
            {g.fixtures.map(f => <MobileFixtureRow key={f.id} f={f}/>)}
          </section>
        ))}
      </div>
    </div>
  );
}

function MobileFixtureRow({ f }){
  const homeWon = f.score && f.score[0]>f.score[1];
  const awayWon = f.score && f.score[1]>f.score[0];
  const tone = COMPS[f.comp].tone;
  return (
    <div style={{
      display:'grid',gridTemplateColumns:'40px 1fr 60px 1fr',gap:10,alignItems:'center',
      padding:'11px 18px',borderBottom:'1px solid var(--rule)',
      background: f.status==='LIVE'? 'rgba(239,68,68,.04)' : 'transparent',
      borderLeft: f.status==='LIVE'? '2px solid var(--danger)' : `2px solid transparent`,
    }}>
      <StatusPill f={f} small/>
      <div style={{textAlign:'right',minWidth:0}}>
        <div style={{fontFamily:'Archivo Black',fontSize:11,letterSpacing:'-0.01em',color: homeWon?'var(--paper)':'var(--mute)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',textTransform:'uppercase'}}>{f.home.code}</div>
      </div>
      <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:8,fontFamily:'Archivo Black',fontSize:16,letterSpacing:'-0.02em'}}>
        {f.score
          ? <>
              <span style={{color: homeWon?'var(--paper)':'var(--mute)'}}>{f.score[0]}</span>
              <span style={{width:4,height:1,background:'var(--rule)'}}/>
              <span style={{color: awayWon?'var(--paper)':'var(--mute)'}}>{f.score[1]}</span>
            </>
          : <span className="mono" style={{fontSize:10,letterSpacing:'.16em',color:'var(--mute)'}}>{f.kickoff}</span>}
      </div>
      <div style={{minWidth:0,display:'flex',alignItems:'center',gap:6}}>
        <div style={{minWidth:0}}>
          <div style={{fontFamily:'Archivo Black',fontSize:11,letterSpacing:'-0.01em',color: awayWon?'var(--paper)':'var(--mute)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',textTransform:'uppercase'}}>{f.away.code}</div>
        </div>
        <span style={{width:2,height:14,background:tone,marginLeft:'auto',flexShrink:0}}/>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// VARIATION 4 — "Month grid" (improved)
// Calendar month view. Fixes the "spreadsheet of empty cells" problem with
// three moves: 1) only matchful days get the ink-2 surface — empty days
// recede into the page bg; 2) match strips use real type hierarchy with
// the dim-loser rule; 3) weekend columns are subtly emphasized.
// ════════════════════════════════════════════════════════════════════════

// April 2026 fixtures (mirrors the user's print + adds live + upcoming +
// a midweek UCL pair for legend variety).
const APRIL_2026 = [
  { id:'ap01', date:'2026-04-10', kickoff:'20:00', comp:'EPL', status:'FT',  home:{code:'WHU'}, away:{code:'WOL'}, score:[4,0] },
  { id:'ap02', date:'2026-04-11', kickoff:'12:30', comp:'EPL', status:'FT',  home:{code:'ARS'}, away:{code:'BOU'}, score:[1,2] },
  { id:'ap03', date:'2026-04-11', kickoff:'15:00', comp:'EPL', status:'FT',  home:{code:'BRE'}, away:{code:'EVE'}, score:[2,2] },
  { id:'ap04', date:'2026-04-11', kickoff:'15:00', comp:'EPL', status:'FT',  home:{code:'BUR'}, away:{code:'BHA'}, score:[0,2] },
  { id:'ap05', date:'2026-04-11', kickoff:'17:30', comp:'EPL', status:'FT',  home:{code:'LIV'}, away:{code:'FUL'}, score:[2,0] },
  { id:'ap06', date:'2026-04-12', kickoff:'14:00', comp:'EPL', status:'FT',  home:{code:'SUN'}, away:{code:'TOT'}, score:[1,0] },
  { id:'ap07', date:'2026-04-12', kickoff:'14:00', comp:'EPL', status:'FT',  home:{code:'NFO'}, away:{code:'AVL'}, score:[1,1] },
  { id:'ap08', date:'2026-04-12', kickoff:'14:00', comp:'EPL', status:'FT',  home:{code:'CRY'}, away:{code:'NEW'}, score:[2,1] },
  { id:'ap09', date:'2026-04-12', kickoff:'16:30', comp:'EPL', status:'FT',  home:{code:'CHE'}, away:{code:'MCI'}, score:[0,3] },
  { id:'ap10', date:'2026-04-13', kickoff:'20:00', comp:'EPL', status:'FT',  home:{code:'MUN'}, away:{code:'LEE'}, score:[1,2] },
  { id:'ap11', date:'2026-04-14', kickoff:'21:00', comp:'UCL', status:'FT',  home:{code:'RMA'}, away:{code:'BAR'}, score:[2,1] },
  { id:'ap12', date:'2026-04-15', kickoff:'21:00', comp:'UCL', status:'FT',  home:{code:'MCI'}, away:{code:'INT'}, score:[1,1] },
  { id:'ap13', date:'2026-04-18', kickoff:'12:30', comp:'EPL', status:'FT',  home:{code:'BRE'}, away:{code:'FUL'}, score:[0,0] },
  { id:'ap14', date:'2026-04-18', kickoff:'15:00', comp:'EPL', status:'FT',  home:{code:'NEW'}, away:{code:'BOU'}, score:[1,2] },
  { id:'ap15', date:'2026-04-18', kickoff:'15:00', comp:'EPL', status:'FT',  home:{code:'LEE'}, away:{code:'WOL'}, score:[3,0] },
  { id:'ap16', date:'2026-04-18', kickoff:'15:00', comp:'EPL', status:'FT',  home:{code:'TOT'}, away:{code:'BHA'}, score:[2,2] },
  { id:'ap17', date:'2026-04-18', kickoff:'17:30', comp:'EPL', status:'FT',  home:{code:'CHE'}, away:{code:'MUN'}, score:[0,1] },
  { id:'ap18', date:'2026-04-19', kickoff:'14:00', comp:'EPL', status:'FT',  home:{code:'AVL'}, away:{code:'SUN'}, score:[4,3] },
  { id:'ap19', date:'2026-04-19', kickoff:'14:00', comp:'EPL', status:'FT',  home:{code:'NFO'}, away:{code:'BUR'}, score:[4,1] },
  { id:'ap20', date:'2026-04-19', kickoff:'14:00', comp:'EPL', status:'FT',  home:{code:'EVE'}, away:{code:'LIV'}, score:[1,2] },
  { id:'ap21', date:'2026-04-19', kickoff:'16:30', comp:'EPL', status:'FT',  home:{code:'MCI'}, away:{code:'ARS'}, score:[2,1] },
  { id:'ap22', date:'2026-04-20', kickoff:'20:00', comp:'EPL', status:'FT',  home:{code:'CRY'}, away:{code:'WHU'}, score:[0,0] },
  { id:'ap23', date:'2026-04-21', kickoff:'20:00', comp:'EPL', status:'FT',  home:{code:'BHA'}, away:{code:'CHE'}, score:[3,0] },
  // Apr 22 — TODAY (two live matches)
  { id:'ap24', date:'2026-04-22', kickoff:'19:45', comp:'EPL', status:'LIVE',live:"68'", home:{code:'BOU'}, away:{code:'LEE'}, score:[2,2] },
  { id:'ap25', date:'2026-04-22', kickoff:'20:00', comp:'EPL', status:'LIVE',live:"74'", home:{code:'BUR'}, away:{code:'MCI'}, score:[0,1] },
  // Upcoming (KO)
  { id:'ap26', date:'2026-04-24', kickoff:'20:00', comp:'EPL', status:'KO',  home:{code:'SUN'}, away:{code:'NFO'}, score:null },
  { id:'ap27', date:'2026-04-25', kickoff:'12:30', comp:'EPL', status:'KO',  home:{code:'FUL'}, away:{code:'AVL'}, score:null },
  { id:'ap28', date:'2026-04-25', kickoff:'15:00', comp:'EPL', status:'KO',  home:{code:'LIV'}, away:{code:'CRY'}, score:null },
  { id:'ap29', date:'2026-04-25', kickoff:'15:00', comp:'EPL', status:'KO',  home:{code:'WOL'}, away:{code:'TOT'}, score:null },
  { id:'ap30', date:'2026-04-25', kickoff:'15:00', comp:'EPL', status:'KO',  home:{code:'WHU'}, away:{code:'EVE'}, score:null },
  { id:'ap31', date:'2026-04-25', kickoff:'17:30', comp:'EPL', status:'KO',  home:{code:'ARS'}, away:{code:'NEW'}, score:null },
  { id:'ap32', date:'2026-04-27', kickoff:'20:00', comp:'EPL', status:'KO',  home:{code:'MUN'}, away:{code:'BRE'}, score:null },
  { id:'ap33', date:'2026-04-28', kickoff:'21:00', comp:'UCL', status:'KO',  home:{code:'PSG'}, away:{code:'LIV'}, score:null },
  { id:'ap34', date:'2026-04-29', kickoff:'21:00', comp:'UCL', status:'KO',  home:{code:'ARS'}, away:{code:'RMA'}, score:null },
];
const TODAY_ISO = '2026-04-22';

function buildMonthCells(year, monthIndex){
  // monthIndex: 0-11. Week starts Monday.
  const firstDow = (new Date(year, monthIndex, 1).getDay() + 6) % 7; // 0=Mon
  const daysInMonth = new Date(year, monthIndex+1, 0).getDate();
  const prevDays = new Date(year, monthIndex, 0).getDate();
  const cells = [];
  for(let i = firstDow - 1; i >= 0; i--){
    const d = prevDays - i;
    cells.push({ key:`p${d}`, iso:null, dnum:d, otherMonth:true });
  }
  for(let d = 1; d <= daysInMonth; d++){
    const iso = `${year}-${String(monthIndex+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    cells.push({ key:iso, iso, dnum:d, otherMonth:false, today: iso===TODAY_ISO });
  }
  let n = 1;
  while(cells.length % 7 !== 0){ cells.push({ key:`n${n}`, iso:null, dnum:n, otherMonth:true }); n++; }
  return cells;
}

const MONTH_NAMES = ['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE','JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'];

function MonthPager({ year, monthIndex, onPrev, onNext }){
  return (
    <div style={{display:'inline-flex',alignItems:'stretch',border:'1px solid var(--rule)'}}>
      <button onClick={onPrev} style={{width:34,height:34,background:'transparent',border:'none',borderRight:'1px solid var(--rule)',color:'var(--paper)',fontFamily:'JetBrains Mono',fontSize:14,cursor:'pointer'}}>‹</button>
      <div style={{padding:'0 18px',height:34,display:'flex',alignItems:'center',gap:10,minWidth:170,justifyContent:'center'}}>
        <span style={{fontFamily:'Archivo Black',fontSize:14,letterSpacing:'-0.01em'}}>{MONTH_NAMES[monthIndex]}</span>
        <span className="mono" style={{fontSize:10,color:'var(--mute)'}}>{year}</span>
      </div>
      <button onClick={onNext} style={{width:34,height:34,background:'transparent',border:'none',borderLeft:'1px solid var(--rule)',color:'var(--paper)',fontFamily:'JetBrains Mono',fontSize:14,cursor:'pointer'}}>›</button>
    </div>
  );
}

// One match strip inside a day cell.
function MatchStrip({ f }){
  const isLive = f.status==='LIVE';
  const tone = COMPS[f.comp].tone;
  const barColor = isLive ? 'var(--danger)' : tone;
  const homeWon = f.score && f.score[0]>f.score[1];
  const awayWon = f.score && f.score[1]>f.score[0];
  const codeColor = (won) => f.score ? (won ? 'var(--paper)' : 'var(--mute)') : 'var(--paper)';
  return (
    <div style={{
      display:'flex',alignItems:'stretch',height:22,
      background: isLive ? 'rgba(239,68,68,.07)' : 'rgba(255,255,255,.015)',
    }}>
      <div style={{width:3, background:barColor, flexShrink:0}}/>
      <div style={{display:'flex',alignItems:'center',gap:5,padding:'0 6px',flex:1,minWidth:0}}>
        <span style={{fontFamily:'Archivo Black',fontSize:10,letterSpacing:'.02em',color:codeColor(homeWon)}}>{f.home.code}</span>
        {f.score ? (
          <span style={{display:'inline-flex',alignItems:'center',gap:3,fontFamily:'Archivo Black',fontSize:10,letterSpacing:'-.02em'}}>
            <span style={{color:codeColor(homeWon)}}>{f.score[0]}</span>
            <span style={{width:3,height:1,background:'var(--mute)'}}/>
            <span style={{color:codeColor(awayWon)}}>{f.score[1]}</span>
          </span>
        ) : (
          <span className="mono" style={{fontSize:8,color:'var(--mute)',letterSpacing:'.18em'}}>VS</span>
        )}
        <span style={{fontFamily:'Archivo Black',fontSize:10,letterSpacing:'.02em',color:codeColor(awayWon)}}>{f.away.code}</span>
        <span style={{flex:1}}/>
        {isLive
          ? <span className="mono" style={{fontSize:8,color:'var(--danger)',letterSpacing:'.14em',display:'inline-flex',alignItems:'center',gap:3}}>
              <span style={{width:4,height:4,background:'var(--danger)',borderRadius:'50%',animation:'fkPulse 1.2s infinite'}}/>{f.live}
            </span>
          : !f.score
            ? <span className="mono" style={{fontSize:8,color:'var(--mute)',letterSpacing:'.14em'}}>{f.kickoff}</span>
            : null}
      </div>
    </div>
  );
}

function DayCell({ cell, matches, isWeekend, maxVisible=4 }){
  const isOther = cell.otherMonth;
  const isToday = cell.today;
  const hasMatches = matches.length > 0;
  const visible = matches.slice(0, maxVisible);
  const overflow = matches.length - visible.length;

  // surface: ink-2 for matchful, transparent for empty in-month, fade for other-month
  const bg = isOther
    ? 'transparent'
    : hasMatches
      ? 'var(--ink-2)'
      : isWeekend ? 'rgba(15,18,24,.35)' : 'transparent';

  return (
    <div style={{
      position:'relative',
      padding:'8px',
      background: bg,
      borderRight:'1px solid var(--rule)',
      borderBottom:'1px solid var(--rule)',
      display:'flex',flexDirection:'column',gap:4,
      minHeight:0, minWidth:0,
      opacity: isOther ? .35 : 1,
    }}>
      {/* today bar */}
      {isToday && <div style={{position:'absolute',inset:'0 0 auto 0',height:2,background:'var(--cyan)'}}/>}
      {/* day number */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:2}}>
        {isToday
          ? <span className="mono" style={{fontSize:8,color:'var(--cyan)',letterSpacing:'.22em'}}>TODAY</span>
          : hasMatches
            ? <span className="mono" style={{fontSize:8,color:'var(--mute)',letterSpacing:'.22em'}}>{matches.length} MATCH{matches.length>1?'ES':''}</span>
            : <span/>}
        <span style={{
          fontFamily: hasMatches || isToday ? 'Archivo Black' : 'JetBrains Mono',
          fontSize: hasMatches || isToday ? 15 : 12,
          letterSpacing: hasMatches || isToday ? '-0.01em' : '.04em',
          color: isToday ? 'var(--cyan)' : hasMatches ? 'var(--paper)' : 'var(--mute)',
        }}>{cell.dnum}</span>
      </div>
      {/* strips */}
      <div style={{display:'flex',flexDirection:'column',gap:3,flex:1,minHeight:0}}>
        {visible.map(f => <MatchStrip key={f.id} f={f}/>)}
        {overflow > 0 && (
          <div className="mono" style={{fontSize:8,color:'var(--mute)',letterSpacing:'.18em',padding:'2px 0 0 6px'}}>+{overflow} MORE</div>
        )}
      </div>
    </div>
  );
}

function ScoresV4MonthGrid(){
  const [monthIndex, setMonthIndex] = useState(3); // April
  const [filter, setFilter] = useState('ALL');
  const year = 2026;

  const monthFixtures = APRIL_2026;
  const filtered = useMemo(() => filter==='ALL' ? monthFixtures : monthFixtures.filter(f=>f.comp===filter), [filter]);
  const counts = useMemo(() => {
    const o = {};
    for(const f of monthFixtures) o[f.comp] = (o[f.comp]||0)+1;
    return o;
  }, []);
  const byDate = useMemo(() => {
    const m = new Map();
    for(const f of filtered){
      if(!m.has(f.date)) m.set(f.date, []);
      m.get(f.date).push(f);
    }
    // sort each day by kickoff
    for(const arr of m.values()) arr.sort((a,b)=>a.kickoff.localeCompare(b.kickoff));
    return m;
  }, [filtered]);

  const cells = useMemo(() => buildMonthCells(year, monthIndex), [year, monthIndex]);
  const weeks = useMemo(() => {
    const out = [];
    for(let i=0;i<cells.length;i+=7) out.push(cells.slice(i,i+7));
    return out;
  }, [cells]);

  const liveCount = filtered.filter(f=>f.status==='LIVE').length;

  return (
    <div style={{display:'flex',width:'100%',height:'100%',background:'var(--ink)',color:'var(--paper)',fontFamily:'Archivo,sans-serif'}}>
      <SideNav active="scores"/>
      <main style={{flex:1,display:'flex',flexDirection:'column',minWidth:0}}>
        <ScoresHeader liveCount={liveCount} totalCount={monthFixtures.length}/>
        <SubTabs active="SCORES"/>
        {/* Controls strip */}
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:24,padding:'14px 32px',borderBottom:'1px solid var(--rule)'}}>
          <div style={{display:'flex',alignItems:'center',gap:18}}>
            <div className="mono" style={{fontSize:9,color:'var(--mute)',letterSpacing:'.22em'}}>VIEW</div>
            <div style={{display:'inline-flex',border:'1px solid var(--rule)'}}>
              {[{id:'list',label:'LIST'},{id:'month',label:'MONTH'}].map((o,i) => (
                <button key={o.id} style={{
                  padding:'7px 14px',background: o.id==='month' ? 'rgba(0,180,216,.08)' : 'transparent',
                  color: o.id==='month' ? 'var(--cyan)' : 'var(--mute)',
                  border:'none',
                  borderRight: i===0 ? '1px solid var(--rule)' : 'none',
                  fontFamily:'JetBrains Mono',fontSize:10,letterSpacing:'.18em',cursor:'pointer',
                }}>{o.label}</button>
              ))}
            </div>
            <div style={{width:1,height:20,background:'var(--rule)',margin:'0 6px'}}/>
            <div style={{display:'flex',gap:8,alignItems:'center'}}>
              <AllChip active={filter==='ALL'} count={monthFixtures.length} onClick={()=>setFilter('ALL')}/>
              {Object.values(COMPS).filter(c=>counts[c.code]).map(c => (
                <CompChip key={c.code} comp={c} count={counts[c.code]||0} active={filter===c.code} onClick={()=>setFilter(c.code)}/>
              ))}
            </div>
          </div>
          <MonthPager year={year} monthIndex={monthIndex}
            onPrev={()=>setMonthIndex(m=>Math.max(0,m-1))}
            onNext={()=>setMonthIndex(m=>Math.min(11,m+1))}/>
        </div>
        {/* Weekday header row */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(7, 1fr)',borderBottom:'1px solid var(--rule)'}}>
          {['MON','TUE','WED','THU','FRI','SAT','SUN'].map((d,i) => (
            <div key={d} className="mono" style={{
              padding:'10px 12px',fontSize:9,letterSpacing:'.22em',
              color: i>=5 ? 'var(--paper)' : 'var(--mute)',
              borderRight: i<6 ? '1px solid var(--rule)' : 'none',
            }}>{d}</div>
          ))}
        </div>
        {/* Calendar grid */}
        <div style={{flex:1,display:'grid',gridTemplateRows:`repeat(${weeks.length}, 1fr)`,minHeight:0,borderLeft:'1px solid var(--rule)'}}>
          {weeks.map((week,wi) => (
            <div key={wi} style={{display:'grid',gridTemplateColumns:'repeat(7, 1fr)',minHeight:0}}>
              {week.map((cell,ci) => (
                <DayCell key={cell.key} cell={cell}
                  matches={cell.iso ? (byDate.get(cell.iso) || []) : []}
                  isWeekend={ci>=5}/>
              ))}
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

window.ScoresV4MonthGrid = ScoresV4MonthGrid;
window.ScoresV1 = ScoresV1;
window.ScoresV2 = ScoresV2;
window.ScoresV3 = ScoresV3;
window.ScoresMobile = ScoresMobile;
