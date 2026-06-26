/* global React, LH_BETS, LH_BETTING_PERF, LH_BET_SERIES, lhMgrById,
   PhoneShell, AppTopbar, HubLeagueHeader, HubTabPills, MobSection, MgrTag, PrimaryCTA */

// Reuse the Spark from desktop shared
function MobSpark({ data, w=72, h=20, tone='var(--cyan)' }){
  const max = Math.max(...data.map(v=>Math.abs(v)),1);
  const pts = data.map((v,i)=>{
    const x = (i/(data.length-1))*w;
    const y = h/2 - (v/max)*(h/2 - 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <line x1="0" y1={h/2} x2={w} y2={h/2} stroke="var(--rule)" strokeDasharray="2,2"/>
      <polyline points={pts} fill="none" stroke={tone} strokeWidth="1.5"/>
      {data.map((v,i) => {
        const x = (i/(data.length-1))*w;
        const y = h/2 - (v/max)*(h/2 - 2);
        return <circle key={i} cx={x} cy={y} r="1.4" fill={tone}/>;
      })}
    </svg>
  );
}

const kindGlyph = {
  'top-scorer':{ g:'◉', tone:'var(--cyan)'   },
  'block':     { g:'⛌', tone:'var(--danger)' },
  'over-under':{ g:'≷', tone:'var(--gold)'   },
  'h2h':       { g:'⚔', tone:'var(--purple)' },
  'fixture':   { g:'◈', tone:'var(--paper)'  },
};

// ──────────────────────────────────────────────────────────────────
// MOBILE · BETS
// ──────────────────────────────────────────────────────────────────

function MobBets(){
  const open     = LH_BETS.filter(b => b.state === 'open');
  const pending  = LH_BETS.filter(b => b.state === 'pending');
  const resolved = LH_BETS.filter(b => b.state === 'resolved');

  return (
    <PhoneShell>
      <AppTopbar/>
      <HubLeagueHeader/>
      <HubTabPills active="bets"/>

      <div style={{flex:1,overflow:'auto'}}>
        {/* Hero */}
        <div style={{padding:'14px 18px 12px',borderBottom:'1px solid var(--rule)'}}>
          <div className="mono" style={{fontSize:9,color:'var(--cyan)',letterSpacing:'.22em'}}>BETS & PREDICTIONS · GW28</div>
          <div className="display" style={{fontSize:22,marginTop:4}}>Make your picks.</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8,marginTop:12}}>
            {[
              {k:'OPEN',v:open.length,t:'var(--cyan)'},
              {k:'PENDING',v:pending.length,t:'var(--gold)'},
              {k:'THIS GW',v:'+8',t:'var(--positive)'},
            ].map(c => (
              <div key={c.k} style={{padding:'8px 10px',background:'var(--ink-2)',border:'1px solid var(--rule)'}}>
                <div className="mono" style={{fontSize:8,color:'var(--mute)',letterSpacing:'.22em'}}>{c.k}</div>
                <div style={{fontFamily:'Archivo Black',fontSize:20,color:c.t,marginTop:4}}>{c.v}</div>
              </div>
            ))}
          </div>
        </div>

        <MobSection label="OPEN" sub="MAKE PICKS" tone="var(--cyan)"/>
        {open.map(b => <MobBetCard key={b.id} b={b}/>)}

        <MobSection label="PENDING" sub="AWAITING RESULTS" tone="var(--gold)"/>
        {pending.map(b => <MobBetCard key={b.id} b={b} pending/>)}

        <MobSection label="HISTORY" sub="RESULTS" tone="var(--mute)"/>
        {resolved.map(b => <MobBetCard key={b.id} b={b} resolved/>)}

        <div style={{height:24}}/>
      </div>
    </PhoneShell>
  );
}

function MobBetCard({b, pending, resolved}){
  const k = kindGlyph[b.kind] || kindGlyph['fixture'];
  return (
    <div style={{
      margin:'0 18px 8px',background:'var(--ink-2)',
      border:'1px solid var(--rule)',
      borderLeft:`3px solid ${b.won===false ? 'var(--danger)' : b.won===true ? 'var(--positive)' : k.tone}`,
      padding:'10px 12px',display:'flex',flexDirection:'column',gap:6,
    }}>
      <div style={{display:'flex',alignItems:'center',gap:8}}>
        <span style={{
          width:20,height:20,display:'inline-flex',alignItems:'center',justifyContent:'center',
          color:k.tone,fontFamily:'Archivo Black',fontSize:12,
          background:`${k.tone}15`,border:`1px solid ${k.tone}55`,
        }}>{k.g}</span>
        <span style={{fontFamily:'Archivo Black',fontSize:12,color:k.tone,letterSpacing:'-0.01em',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',flex:1}}>{b.title.toUpperCase()}</span>
        {!resolved && (
          <span style={{
            fontFamily:'JetBrains Mono,monospace',fontSize:9,color:'var(--positive)',
            padding:'2px 5px',border:'1px solid var(--positive)55',background:'rgba(34,197,94,.08)',
            letterSpacing:'.16em',
          }}>+{b.reward}</span>
        )}
        {resolved && (
          <span style={{fontFamily:'JetBrains Mono,monospace',fontSize:9,letterSpacing:'.18em',color:b.won?'var(--positive)':'var(--danger)'}}>
            ● {b.won?'WON':'LOST'}
          </span>
        )}
      </div>
      <div style={{fontFamily:'Archivo,sans-serif',fontSize:12,color:'var(--paper)',lineHeight:1.4}}>{b.q}</div>

      {!pending && !resolved && (
        <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
          {b.options.slice(0,4).map(opt => {
            const picked = b.picked === opt;
            return (
              <span key={opt} style={{
                padding:'4px 8px',fontFamily:'Archivo Black',fontSize:10,letterSpacing:'-0.01em',
                border:`1px solid ${picked?'var(--cyan)':'var(--rule)'}`,
                background:picked?'rgba(0,180,216,.08)':'transparent',
                color:picked?'var(--cyan)':'var(--paper)',
              }}>
                {picked && '✓ '}{opt}
              </span>
            );
          })}
          {b.options.length > 4 && <span style={{padding:'4px 8px',fontFamily:'JetBrains Mono,monospace',fontSize:9,color:'var(--mute)'}}>+{b.options.length-4}</span>}
        </div>
      )}
      {pending && (
        <div className="mono" style={{fontSize:9,color:'var(--gold)',letterSpacing:'.16em'}}>· {b.note}</div>
      )}
      {resolved && (
        <div style={{display:'flex',gap:14,fontSize:11,fontFamily:'Archivo,sans-serif'}}>
          <span><span className="mono" style={{fontSize:8,color:'var(--mute)',letterSpacing:'.2em'}}>ANS </span><b>{b.answer}</b></span>
          <span><span className="mono" style={{fontSize:8,color:'var(--mute)',letterSpacing:'.2em'}}>PICK </span><b style={{color:b.won?'var(--positive)':'var(--danger)'}}>{b.myPick}</b></span>
        </div>
      )}

      <div style={{display:'flex',alignItems:'center',gap:8,marginTop:2}}>
        {!resolved && !pending && (
          <>
            <span className="mono" style={{fontSize:9,color:'var(--mute)',letterSpacing:'.16em',flex:1}}>● {b.closes} LEFT</span>
            <button style={{
              background:'var(--cyan)',color:'var(--ink)',border:0,
              padding:'7px 12px',fontFamily:'Archivo Black,sans-serif',fontSize:10,letterSpacing:'.16em',cursor:'pointer',
            }}>{b.picked ? 'CHANGE →' : 'MAKE PICK →'}</button>
          </>
        )}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// MOBILE · MAKE PICK drill-in
// ──────────────────────────────────────────────────────────────────

function MobMakePick(){
  const [pick, setPick] = React.useState(null);
  const odds = [
    { name:'Haaland',  club:'MCI', form:[12,8,18,9,14], pct:'42%', mult:'×1.6' },
    { name:'Palmer',   club:'CHE', form:[ 9,8,14,12,30],pct:'31%', mult:'×2.1' },
    { name:'Watkins',  club:'AVL', form:[ 6,8, 4, 9,12],pct:'12%', mult:'×3.4' },
    { name:'Saka',     club:'ARS', form:[ 9,5,11, 8, 7],pct:'10%', mult:'×4.0' },
    { name:'Other',    club:'—',   form:[ 0,0, 0, 0, 0],pct:' 5%', mult:'×6.0' },
  ];
  return (
    <PhoneShell>
      <AppTopbar/>
      <HubLeagueHeader backable title="MAKE PICK · MD5 TOP SCORER"/>

      <div style={{padding:'10px 18px',background:'rgba(239,68,68,.06)',borderBottom:'1px solid var(--rule)',display:'flex',justifyContent:'space-between'}}>
        <span className="mono" style={{fontSize:10,color:'var(--danger)',letterSpacing:'.22em'}}>● CLOSES IN 2h 36m</span>
        <span className="mono" style={{fontSize:10,color:'var(--mute)',letterSpacing:'.22em'}}>6 / 12 PICKED</span>
      </div>

      <div style={{flex:1,overflow:'auto'}}>
        <div style={{padding:'14px 18px'}}>
          <div className="mono" style={{fontSize:9,color:'var(--cyan)',letterSpacing:'.22em'}}>BET · MDMD5</div>
          <div className="display" style={{fontSize:24,marginTop:4}}>Who tops MD5?</div>
          <div style={{fontFamily:'Archivo,sans-serif',fontSize:12,color:'var(--mute)',marginTop:8,lineHeight:1.5}}>
            Pick the player you think will score the most goals in GW28. Tie-break: assists, then minutes.
          </div>
        </div>

        <MobSection label="SELECT ONE" tone="var(--cyan)"/>
        <div style={{padding:'0 18px 14px',display:'flex',flexDirection:'column',gap:8}}>
          {odds.map(o => {
            const isPicked = pick === o.name;
            return (
              <button key={o.name} onClick={() => setPick(o.name)} style={{
                textAlign:'left',cursor:'pointer',
                background:isPicked?'rgba(0,180,216,.08)':'var(--ink-2)',
                border:isPicked?'1px solid var(--cyan)':'1px solid var(--rule)',
                borderLeft:isPicked?'3px solid var(--cyan)':'3px solid transparent',
                padding:'10px 12px',color:'var(--paper)',
                display:'grid',gridTemplateColumns:'20px 1fr auto auto',gap:10,alignItems:'center',
                fontFamily:'Archivo,sans-serif',
              }}>
                <span style={{
                  width:16,height:16,borderRadius:'50%',
                  border:`2px solid ${isPicked?'var(--cyan)':'var(--rule)'}`,
                  background:isPicked?'var(--cyan)':'transparent',
                }}/>
                <div>
                  <div style={{display:'flex',alignItems:'center',gap:6}}>
                    <span style={{fontFamily:'Archivo Black',fontSize:14,letterSpacing:'-0.01em'}}>{o.name}</span>
                    <span className="mono" style={{fontSize:9,color:'var(--mute)',letterSpacing:'.14em'}}>{o.club}</span>
                  </div>
                  <div style={{display:'flex',alignItems:'center',gap:6,marginTop:4}}>
                    <MobSpark data={o.form} tone={isPicked?'var(--cyan)':'var(--mute)'} w={56} h={16}/>
                    <span className="mono" style={{fontSize:8,color:'var(--mute)',letterSpacing:'.14em'}}>{o.pct} OF LEAGUE</span>
                  </div>
                </div>
                <span style={{fontFamily:'Archivo Black',fontSize:13,color:'var(--gold)'}}>{o.mult}</span>
                <span className="mono" style={{fontSize:9,letterSpacing:'.14em',color:isPicked?'var(--cyan)':'var(--mute)'}}>{isPicked?'PICKED':''}</span>
              </button>
            );
          })}
        </div>

        {/* Payout box */}
        <div style={{margin:'0 18px 14px',padding:'14px',background:'var(--ink-2)',border:'1px solid var(--rule)'}}>
          <div className="mono" style={{fontSize:9,color:'var(--mute)',letterSpacing:'.22em'}}>PAYOUT</div>
          <div style={{fontFamily:'Archivo Black',fontSize:32,color:pick?'var(--positive)':'var(--mute)',marginTop:4}}>
            +{pick==='Watkins'?17:pick==='Other'?30:pick?8:'—'}
            <span style={{fontSize:12,color:'var(--mute)',marginLeft:6}}>PTS</span>
          </div>
          <div className="mono" style={{fontSize:8,color:'var(--mute)',marginTop:6,letterSpacing:'.16em'}}>BASE 5 PTS × ODDS MULTIPLIER</div>
        </div>
      </div>

      <div style={{padding:14,borderTop:'1px solid var(--rule)'}}>
        <button disabled={!pick} style={{
          width:'100%',padding:'14px',
          background:pick?'var(--cyan)':'var(--ink-3)',
          color:pick?'var(--ink)':'var(--mute)',border:0,
          fontFamily:'Archivo Black,sans-serif',fontSize:13,letterSpacing:'.18em',
          cursor:pick?'pointer':'not-allowed',
        }}>{pick ? 'LOCK IN PICK →' : 'SELECT A PLAYER'}</button>
      </div>
    </PhoneShell>
  );
}

// ──────────────────────────────────────────────────────────────────
// MOBILE · BETTING (performance dashboard)
// ──────────────────────────────────────────────────────────────────

function MobBetting(){
  const ids = ['rai','olu','you','ade','ndo','mar'];
  return (
    <PhoneShell>
      <AppTopbar/>
      <HubLeagueHeader/>
      <HubTabPills active="betting"/>

      <div style={{flex:1,overflow:'auto'}}>
        {/* Your stats */}
        <div style={{padding:'14px 18px',borderBottom:'1px solid var(--rule)'}}>
          <div className="mono" style={{fontSize:9,color:'var(--cyan)',letterSpacing:'.22em'}}>YOUR BETTING · GW1→GW28</div>
          <div style={{display:'flex',alignItems:'baseline',gap:10,marginTop:6}}>
            <span style={{fontFamily:'Archivo Black',fontSize:30,color:'var(--positive)'}}>+22</span>
            <span className="mono" style={{fontSize:10,color:'var(--mute)',letterSpacing:'.14em'}}>PTS · RANK 3 / 12</span>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:6,marginTop:12}}>
            {[
              {k:'PLAYED',v:'18',t:'var(--paper)'},
              {k:'WON',v:'11',t:'var(--positive)'},
              {k:'WIN %',v:'61%',t:'var(--cyan)'},
              {k:'STREAK',v:'3W',t:'var(--gold)'},
            ].map(c => (
              <div key={c.k} style={{padding:'8px',background:'var(--ink-2)',border:'1px solid var(--rule)'}}>
                <div className="mono" style={{fontSize:8,color:'var(--mute)',letterSpacing:'.2em'}}>{c.k}</div>
                <div style={{fontFamily:'Archivo Black',fontSize:16,color:c.t,marginTop:4}}>{c.v}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Leaderboard */}
        <MobSection label="BETTING LEADERBOARD" sub="PTS FROM BETS" tone="var(--gold)"/>
        <div>
          {ids.map((id, i) => {
            const m = lhMgrById(id);
            const p = LH_BETTING_PERF[id];
            const winPct = Math.round((p.won/(p.played-p.void))*100);
            const isYou = id === 'you';
            return (
              <div key={id} style={{
                display:'grid',gridTemplateColumns:'24px auto 1fr auto auto',gap:8,padding:'10px 18px',
                borderBottom:'1px solid var(--rule)',alignItems:'center',
                background:isYou?'rgba(0,180,216,.04)':'transparent',
                borderLeft:isYou?'2px solid var(--cyan)':'2px solid transparent',
              }}>
                <span style={{fontFamily:'Archivo Black',fontSize:13}}>{i+1}</span>
                <MgrTag id={id} size={20}/>
                <div>
                  <div style={{fontFamily:'Archivo Black',fontSize:12}}>{isYou?'You':m.name}</div>
                  <div style={{marginTop:3}}><MobSpark data={LH_BET_SERIES[id]} tone={i===0?'var(--gold)':'var(--cyan)'}/></div>
                </div>
                <span style={{fontFamily:'Archivo Black',fontSize:12,textAlign:'right'}}>{winPct}%</span>
                <span style={{fontFamily:'Archivo Black',fontSize:14,color:'var(--positive)',minWidth:36,textAlign:'right'}}>+{p.profit}</span>
              </div>
            );
          })}
        </div>

        {/* Your perf by type */}
        <MobSection label="YOUR PERFORMANCE" sub="BY TYPE" tone="var(--purple)"/>
        <div style={{padding:'0 18px 14px',display:'flex',flexDirection:'column',gap:8}}>
          {[
            { k:'Fixture outcome',  pct:71, wl:'5-2', tone:'var(--positive)' },
            { k:'Top scorer',       pct:75, wl:'3-1', tone:'var(--cyan)' },
            { k:'Over / Under',     pct:67, wl:'2-1', tone:'var(--gold)' },
            { k:'Block opponent',   pct: 0, wl:'0-2', tone:'var(--danger)' },
            { k:'H2H wager',        pct:100,wl:'1-0', tone:'var(--positive)' },
          ].map(r => (
            <div key={r.k} style={{display:'grid',gridTemplateColumns:'1fr auto auto',gap:10,alignItems:'center'}}>
              <div>
                <div style={{fontFamily:'Archivo Black',fontSize:12}}>{r.k}</div>
                <div style={{height:4,background:'var(--ink-3)',marginTop:4}}>
                  <div style={{height:'100%',width:`${r.pct}%`,background:r.tone}}/>
                </div>
              </div>
              <span className="mono" style={{fontSize:9,color:'var(--mute)',letterSpacing:'.14em'}}>{r.wl}</span>
              <span style={{fontFamily:'Archivo Black',fontSize:13,color:r.tone,minWidth:40,textAlign:'right'}}>{r.pct}%</span>
            </div>
          ))}
        </div>
        <div style={{height:24}}/>
      </div>
    </PhoneShell>
  );
}

window.MobBets = MobBets;
window.MobMakePick = MobMakePick;
window.MobBetting = MobBetting;
