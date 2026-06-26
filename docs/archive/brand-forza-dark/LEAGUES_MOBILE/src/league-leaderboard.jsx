/* global React, LH_STANDINGS, LH_ACTIVITY, LH_MANAGERS, lhMgrById,
   MgrTag, HubTopbar, HubActionBar, HubTabs, TrendPill, FormDots, Spark, HubSectionLabel */

// ───────────────────────────────────────────────────────────────────
// LEADERBOARD TAB
// Rich standings table — rank trend, manager monogram, current captain,
// MD points, season total, form. Right rail shows live league activity.
// ───────────────────────────────────────────────────────────────────

function LeaderboardTab(){
  return (
    <div style={{display:'flex',flexDirection:'column',width:'100%',height:'100%',background:'var(--ink)',color:'var(--paper)',fontFamily:'Archivo,sans-serif'}}>
      <HubTopbar rightSlot={
        <div style={{display:'flex',alignItems:'center',gap:14}}>
          <button style={{
            border:'1px solid var(--rule)',background:'var(--ink-2)',color:'var(--paper)',
            padding:'8px 12px',fontFamily:'JetBrains Mono,monospace',fontSize:10,letterSpacing:'.2em',cursor:'pointer',
          }}>⚡ QUICK FILL</button>
          <button style={{
            border:'1px solid var(--cyan)',background:'transparent',color:'var(--cyan)',
            padding:'8px 12px',fontFamily:'JetBrains Mono,monospace',fontSize:10,letterSpacing:'.2em',cursor:'pointer',
          }}>+ INVITE</button>
        </div>
      }/>
      <HubActionBar/>
      <HubTabs active="leaderboard"/>

      {/* Spotlight strip: GW + top-3 podium */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',borderBottom:'1px solid var(--rule)'}}>
        <SpotlightCard
          kicker="MATCHDAY 5 · LIVE"
          big="GW 28"
          sub="Sat · 4 fixtures · 2h 36m to deadline"
          tone="var(--cyan)"
          rightTone="var(--danger)"
          stat="78 PTS"
          statSub="HIGH SCORE"
        />
        <PodiumCard pos={1} mgr="rai" pts={78} tot={1024}/>
        <PodiumCard pos={2} mgr="olu" pts={71} tot={1011}/>
        <PodiumCard pos={3} mgr="ndo" pts={66} tot={998}/>
      </div>

      {/* Body: standings table + activity rail */}
      <div style={{flex:1,display:'grid',gridTemplateColumns:'1fr 340px',minHeight:0}}>
        <StandingsTable/>
        <ActivityRail/>
      </div>
    </div>
  );
}

function SpotlightCard({ kicker, big, sub, stat, statSub, tone, rightTone }){
  return (
    <div style={{padding:'18px 22px',borderRight:'1px solid var(--rule)',display:'flex',justifyContent:'space-between',alignItems:'flex-end',gap:12}}>
      <div>
        <div className="mono" style={{fontSize:10,color:tone,letterSpacing:'.22em'}}>{kicker}</div>
        <div className="display" style={{fontSize:32,marginTop:4}}>{big}</div>
        <div className="mono" style={{fontSize:9,color:'var(--mute)',marginTop:6,letterSpacing:'.16em'}}>{sub}</div>
      </div>
      <div style={{textAlign:'right'}}>
        <div style={{fontFamily:'Archivo Black',fontSize:18,color:rightTone}}>{stat}</div>
        <div className="mono" style={{fontSize:9,color:'var(--mute)',letterSpacing:'.18em',marginTop:4}}>{statSub}</div>
      </div>
    </div>
  );
}

function PodiumCard({ pos, mgr, pts, tot }){
  const m = lhMgrById(mgr);
  const medal = ['var(--gold)','#C0C0C0','#CD7F32'][pos-1];
  return (
    <div style={{padding:'18px 22px',borderRight: pos<3 ? '1px solid var(--rule)' : 'none',display:'flex',gap:14,alignItems:'center'}}>
      <div style={{
        width:42,height:42,display:'flex',alignItems:'center',justifyContent:'center',
        background:`${medal}18`,border:`1px solid ${medal}66`,
        fontFamily:'Archivo Black',fontSize:22,color:medal,
      }}>{pos}</div>
      <div style={{flex:1,minWidth:0}}>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <MgrTag id={mgr}/>
          <div style={{fontFamily:'Archivo Black',fontSize:14,letterSpacing:'-0.01em',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{m.name}</div>
        </div>
        <div className="mono" style={{fontSize:9,color:'var(--mute)',marginTop:4,letterSpacing:'.14em',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{m.squad.toUpperCase()}</div>
      </div>
      <div style={{textAlign:'right'}}>
        <div style={{fontFamily:'Archivo Black',fontSize:18,color:'var(--positive)'}}>+{pts}</div>
        <div className="mono" style={{fontSize:9,color:'var(--mute)',marginTop:4,letterSpacing:'.18em'}}>TOT {tot}</div>
      </div>
    </div>
  );
}

function StandingsTable(){
  return (
    <div style={{display:'flex',flexDirection:'column',minHeight:0,borderRight:'1px solid var(--rule)'}}>
      {/* Header */}
      <div style={{
        display:'grid',gridTemplateColumns:'48px 1fr 180px 110px 88px 60px 60px',gap:14,
        padding:'12px 24px',borderBottom:'1px solid var(--rule)',color:'var(--mute)',
      }}>
        <div className="mono" style={{fontSize:9}}>#</div>
        <div className="mono" style={{fontSize:9}}>MANAGER</div>
        <div className="mono" style={{fontSize:9}}>CAPTAIN · GW28</div>
        <div className="mono" style={{fontSize:9}}>FORM · L5</div>
        <div className="mono" style={{fontSize:9,textAlign:'right'}}>MD</div>
        <div className="mono" style={{fontSize:9,textAlign:'right'}}>TOT</div>
        <div/>
      </div>
      <div style={{flex:1,overflow:'auto'}}>
        {LH_STANDINGS.map(s => <StandingRow key={s.id} s={s} isYou={s.id==='you'}/>)}
      </div>
    </div>
  );
}

function StandingRow({ s, isYou }){
  const m = lhMgrById(s.id);
  return (
    <div style={{
      display:'grid',gridTemplateColumns:'48px 1fr 180px 110px 88px 60px 60px',gap:14,alignItems:'center',
      padding:'12px 24px',borderBottom:'1px solid var(--rule)',
      borderLeft: isYou ? '2px solid var(--cyan)' : '2px solid transparent',
      background: isYou ? 'rgba(0,180,216,.04)' : 'transparent',
    }}>
      <div style={{display:'flex',alignItems:'center',gap:8}}>
        <span style={{fontFamily:'Archivo Black',fontSize:14,minWidth:18}}>{s.rank}</span>
        <TrendPill trend={s.trend}/>
      </div>
      <div style={{display:'flex',alignItems:'center',gap:10,minWidth:0}}>
        <MgrTag id={s.id}/>
        <div style={{minWidth:0,display:'flex',flexDirection:'column'}}>
          <div style={{display:'flex',alignItems:'center',gap:6,minWidth:0}}>
            <span style={{fontFamily:'Archivo Black',fontSize:13,letterSpacing:'-0.01em',whiteSpace:'nowrap'}}>{isYou?'You':m.name}</span>
            {s.rank === 1 && <span style={{fontFamily:'Archivo Black',fontSize:8,background:'var(--gold)',color:'var(--ink)',padding:'1px 4px',letterSpacing:'.1em'}}>LEADER</span>}
          </div>
          <span className="mono" style={{fontSize:9,color:'var(--mute)',letterSpacing:'.14em'}}>{m.squad}</span>
        </div>
      </div>
      <div style={{display:'flex',flexDirection:'column'}}>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <span style={{width:6,height:6,background:'var(--gold)',display:'inline-block'}}/>
          <span style={{fontFamily:'Archivo,sans-serif',fontSize:12,fontWeight:600}}>{s.cap}</span>
        </div>
        <span className="mono" style={{fontSize:9,color:'var(--mute)',letterSpacing:'.14em',marginLeft:14}}>{s.capPts} PTS · 2× APPLIED</span>
      </div>
      <FormDots form={m.form}/>
      <div style={{textAlign:'right',fontFamily:'Archivo Black',fontSize:14,color: s.md >= 70 ? 'var(--positive)' : 'var(--paper)'}}>{s.md}</div>
      <div style={{textAlign:'right',fontFamily:'Archivo Black',fontSize:14,letterSpacing:'-0.01em'}}>{s.tot}</div>
      <div style={{display:'flex',gap:4,justifyContent:'flex-end'}}>
        {!isYou && (
          <>
            <button style={miniBtnStyle('var(--cyan)')}>H2H</button>
            <button style={miniBtnStyle('var(--mute)')}>VIEW</button>
          </>
        )}
        {isYou && <button style={miniBtnStyle('var(--cyan)')}>VIEW</button>}
      </div>
    </div>
  );
}

const miniBtnStyle = (color) => ({
  background:'transparent',border:`1px solid ${color}55`,color,
  padding:'4px 8px',fontFamily:'JetBrains Mono,monospace',fontSize:9,letterSpacing:'.18em',
  cursor:'pointer',
});

function ActivityRail(){
  const kindTone = {
    goal:'var(--positive)', bid:'var(--cyan)', trade:'var(--gold)', bet:'var(--purple)',
    pin:'var(--mute)', rankup:'var(--positive)', auction:'var(--gold)', frontpage:'var(--paper)',
  };
  return (
    <aside style={{display:'flex',flexDirection:'column',minHeight:0,background:'var(--ink-2)'}}>
      <HubSectionLabel label="LEAGUE ACTIVITY" sub="LIVE" tone="var(--gold)"
        right={<span className="mono" style={{fontSize:9,color:'var(--mute)'}}>LAST 24H</span>}/>
      <div style={{flex:1,overflow:'auto'}}>
        {LH_ACTIVITY.map(a => {
          const m = a.who === 'edt' ? { mono:'EDT', hue:'var(--paper)', name:'Forza Times Editor' } : lhMgrById(a.who);
          return (
            <div key={a.id} style={{
              padding:'12px 18px',borderBottom:'1px solid var(--rule)',
              display:'grid',gridTemplateColumns:'44px 1fr auto',alignItems:'flex-start',gap:10,
            }}>
              <MgrTag id={a.who === 'edt' ? null : a.who}/>
              <div>
                <div style={{display:'flex',alignItems:'center',gap:6}}>
                  <span style={{fontFamily:'Archivo Black',fontSize:11}}>{m.name}</span>
                  <span style={{width:4,height:4,background:kindTone[a.kind],borderRadius:'50%'}}/>
                  <span className="mono" style={{fontSize:9,color:kindTone[a.kind],letterSpacing:'.16em'}}>{a.kind.toUpperCase()}</span>
                </div>
                <div style={{fontFamily:'Archivo,sans-serif',fontSize:12,color:'var(--paper)',marginTop:4,lineHeight:1.4}}>{a.txt}</div>
              </div>
              <span className="mono" style={{fontSize:9,color:'var(--mute)',letterSpacing:'.14em'}}>{a.t}</span>
            </div>
          );
        })}
      </div>
      <div style={{padding:'12px 18px',borderTop:'1px solid var(--rule)',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <span className="mono" style={{fontSize:10,color:'var(--mute)',letterSpacing:'.18em'}}>FILTER</span>
        <div style={{display:'flex',gap:6}}>
          {['ALL','GAME','BETS','TRADES'].map((f,i) => (
            <span key={f} style={{
              fontFamily:'JetBrains Mono,monospace',fontSize:9,letterSpacing:'.18em',
              padding:'3px 6px',
              border:`1px solid ${i===0?'var(--cyan)':'var(--rule)'}`,
              color: i===0 ? 'var(--cyan)':'var(--mute)',
            }}>{f}</span>
          ))}
        </div>
      </div>
    </aside>
  );
}

// ───────────────────────────────────────────────────────────────────
// MANAGER PROFILE — drill-in (clicked from a standings row).
// ───────────────────────────────────────────────────────────────────
function ManagerProfileScreen({ id='rai' }){
  const m = lhMgrById(id);
  const s = LH_STANDINGS.find(x => x.id === id);
  return (
    <div style={{display:'flex',flexDirection:'column',width:'100%',height:'100%',background:'var(--ink)',color:'var(--paper)',fontFamily:'Archivo,sans-serif'}}>
      {/* Mini topbar */}
      <div style={{padding:'18px 28px',borderBottom:'1px solid var(--rule)',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <div className="mono" style={{fontSize:10,color:'var(--mute)',letterSpacing:'.22em'}}>← OFFICE HEROES · MANAGER PROFILE</div>
        <div style={{display:'flex',gap:10}}>
          <button style={{...miniBtnStyle('var(--cyan)'),padding:'8px 14px',fontSize:10}}>CHALLENGE H2H</button>
          <button style={{...miniBtnStyle('var(--gold)'),padding:'8px 14px',fontSize:10}}>PROPOSE TRADE</button>
          <button style={{...miniBtnStyle('var(--mute)'),padding:'8px 14px',fontSize:10}}>@ MENTION IN CHAT</button>
        </div>
      </div>

      {/* Hero */}
      <div style={{padding:'28px 32px',borderBottom:'1px solid var(--rule)',display:'grid',gridTemplateColumns:'auto 1fr auto',gap:30,alignItems:'center'}}>
        <div style={{
          width:96,height:96,
          display:'flex',alignItems:'center',justifyContent:'center',
          background:`${m.hue}18`,border:`1px solid ${m.hue}66`,
          color:m.hue,
          fontFamily:'Archivo Black',fontSize:32,letterSpacing:'-0.02em',
        }}>{m.mono}</div>
        <div>
          <div className="mono" style={{fontSize:10,color:m.hue,letterSpacing:'.22em'}}>RANK {s.rank} · {s.rank===1?'LEAGUE LEADER':'LEAGUE MANAGER'}</div>
          <div className="display" style={{fontSize:44,marginTop:6}}>{m.name}</div>
          <div className="mono" style={{fontSize:10,color:'var(--mute)',marginTop:8,letterSpacing:'.18em'}}>{m.handle} · {m.squad.toUpperCase()} · JOINED {m.joined}</div>
        </div>
        <div style={{display:'flex',gap:18,textAlign:'right'}}>
          <div>
            <div className="mono" style={{fontSize:9,color:'var(--mute)',letterSpacing:'.2em'}}>GW28</div>
            <div style={{fontFamily:'Archivo Black',fontSize:34,color:'var(--positive)'}}>+{s.md}</div>
          </div>
          <div>
            <div className="mono" style={{fontSize:9,color:'var(--mute)',letterSpacing:'.2em'}}>SEASON</div>
            <div style={{fontFamily:'Archivo Black',fontSize:34}}>{s.tot}</div>
          </div>
        </div>
      </div>

      {/* 3-col body */}
      <div style={{flex:1,display:'grid',gridTemplateColumns:'1fr 1fr 1fr',minHeight:0}}>
        {/* Squad summary */}
        <section style={{borderRight:'1px solid var(--rule)',padding:'18px 22px',display:'flex',flexDirection:'column',gap:14,minHeight:0}}>
          <div className="mono" style={{fontSize:10,color:'var(--cyan)',letterSpacing:'.22em'}}>│ CURRENT XI · 4-3-3</div>
          <div style={{flex:1,minHeight:0,background:'#0E1218',border:'1px solid var(--rule)',position:'relative',padding:14,display:'flex',flexDirection:'column',gap:8}}>
            {[
              { line:'FWD', players:['Haaland (C)','Watkins','Saka'] },
              { line:'MID', players:['Palmer','Rice','Mac Allister'] },
              { line:'DEF', players:['Trippier','Saliba','Van Dijk','Gabriel'] },
              { line:'GK',  players:['Pickford'] },
            ].map(L => (
              <div key={L.line} style={{display:'flex',alignItems:'center',gap:10}}>
                <span className="mono" style={{fontSize:9,color:'var(--mute)',letterSpacing:'.22em',width:30}}>{L.line}</span>
                <div style={{flex:1,display:'flex',flexWrap:'wrap',gap:6}}>
                  {L.players.map(p => (
                    <span key={p} style={{
                      padding:'4px 8px',background:'var(--ink-2)',border:'1px solid var(--rule)',
                      borderLeft:`2px solid ${{FWD:'var(--danger)',MID:'var(--gold)',DEF:'var(--cyan)',GK:'var(--purple)'}[L.line]}`,
                      fontFamily:'Archivo Black',fontSize:11,letterSpacing:'-0.01em',
                    }}>{p}</span>
                  ))}
                </div>
              </div>
            ))}
            <div className="mono" style={{fontSize:9,color:'var(--mute)',marginTop:'auto',letterSpacing:'.16em'}}>BENCH · 4 PLAYERS</div>
          </div>
        </section>

        {/* H2H history vs You */}
        <section style={{borderRight:'1px solid var(--rule)',padding:'18px 22px',display:'flex',flexDirection:'column',gap:14,minHeight:0}}>
          <div className="mono" style={{fontSize:10,color:'var(--gold)',letterSpacing:'.22em'}}>│ H2H vs YOU · ALL-TIME</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:0,border:'1px solid var(--rule)'}}>
            {[
              { label:'WINS', val:8, tone:'var(--positive)' },
              { label:'DRAWS', val:2, tone:'var(--mute)' },
              { label:'LOSSES', val:5, tone:'var(--danger)' },
            ].map((b,i) => (
              <div key={b.label} style={{padding:'14px 16px',borderLeft:i?'1px solid var(--rule)':'none',textAlign:'center'}}>
                <div className="mono" style={{fontSize:9,color:'var(--mute)',letterSpacing:'.2em'}}>{b.label}</div>
                <div style={{fontFamily:'Archivo Black',fontSize:28,color:b.tone,marginTop:4}}>{b.val}</div>
              </div>
            ))}
          </div>
          <div className="mono" style={{fontSize:9,color:'var(--mute)',letterSpacing:'.18em'}}>RECENT MATCHUPS</div>
          {[
            { gw:'GW27', you:54, them:78, won:false },
            { gw:'GW26', you:62, them:58, won:true  },
            { gw:'GW25', you:71, them:71, won:null  },
            { gw:'GW24', you:48, them:84, won:false },
          ].map(r => (
            <div key={r.gw} style={{display:'grid',gridTemplateColumns:'60px 1fr 60px 20px 60px',gap:8,alignItems:'center',padding:'8px 0',borderBottom:'1px solid var(--rule)'}}>
              <span className="mono" style={{fontSize:10,color:'var(--mute)',letterSpacing:'.14em'}}>{r.gw}</span>
              <span style={{fontFamily:'Archivo Black',fontSize:12,color:r.won===true?'var(--positive)':r.won===false?'var(--danger)':'var(--mute)'}}>{r.won===true?'WON':r.won===false?'LOST':'DRAW'}</span>
              <span style={{fontFamily:'Archivo Black',fontSize:14,textAlign:'right'}}>{r.you}</span>
              <span className="mono" style={{fontSize:10,color:'var(--mute)',textAlign:'center'}}>vs</span>
              <span style={{fontFamily:'Archivo Black',fontSize:14,textAlign:'right'}}>{r.them}</span>
            </div>
          ))}
        </section>

        {/* Habits + bets */}
        <section style={{padding:'18px 22px',display:'flex',flexDirection:'column',gap:14,minHeight:0}}>
          <div className="mono" style={{fontSize:10,color:'var(--purple)',letterSpacing:'.22em'}}>│ MANAGER HABITS</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
            {[
              { k:'CAPTAIN HIT RATE', v:'79%', sub:'14 of 18 picks ≥10pts', tone:'var(--positive)' },
              { k:'AVG TRANSFERS/GW',  v:'1.4', sub:'mostly DEF rotation',   tone:'var(--cyan)' },
              { k:'BET ROI',           v:'+38', sub:'best in league',         tone:'var(--gold)' },
              { k:'CHIPS USED',        v:'2/4', sub:'Triple Cap · Wildcard',  tone:'var(--mute)' },
            ].map(card => (
              <div key={card.k} style={{padding:'12px 14px',background:'var(--ink-2)',border:'1px solid var(--rule)'}}>
                <div className="mono" style={{fontSize:9,color:'var(--mute)',letterSpacing:'.2em'}}>{card.k}</div>
                <div style={{fontFamily:'Archivo Black',fontSize:22,color:card.tone,marginTop:4}}>{card.v}</div>
                <div className="mono" style={{fontSize:9,color:'var(--mute)',letterSpacing:'.14em',marginTop:4}}>{card.sub}</div>
              </div>
            ))}
          </div>
          <div className="mono" style={{fontSize:10,color:'var(--mute)',letterSpacing:'.22em',marginTop:6}}>RECENT BETS</div>
          {[
            { ttl:'MD4 Top Scorer',  pick:'Haaland', won:true },
            { ttl:'Block · Salah',   pick:'Salah',   won:true },
            { ttl:'H2H vs Olu',      pick:'Win',     won:false },
          ].map((b,i) => (
            <div key={i} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 0',borderBottom:'1px solid var(--rule)'}}>
              <span style={{width:6,height:6,background:b.won?'var(--positive)':'var(--danger)',display:'inline-block'}}/>
              <span style={{fontFamily:'Archivo Black',fontSize:12}}>{b.ttl}</span>
              <span className="mono" style={{fontSize:9,color:'var(--mute)',marginLeft:'auto'}}>{b.pick.toUpperCase()}</span>
              <span style={{fontFamily:'Archivo Black',fontSize:11,color:b.won?'var(--positive)':'var(--danger)'}}>{b.won?'WON':'LOST'}</span>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}

window.LeaderboardTab = LeaderboardTab;
window.ManagerProfileScreen = ManagerProfileScreen;
