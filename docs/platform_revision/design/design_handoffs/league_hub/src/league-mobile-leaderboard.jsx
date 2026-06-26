/* global React, LH_STANDINGS, LH_ACTIVITY, lhMgrById,
   PhoneShell, AppTopbar, HubLeagueHeader, HubTabPills, PrimaryCTA, MobFormDots, MobSection, MgrTag */

// ──────────────────────────────────────────────────────────────────
// MOBILE · LEADERBOARD
// ──────────────────────────────────────────────────────────────────

function MobLeaderboard(){
  return (
    <PhoneShell>
      <AppTopbar/>
      <HubLeagueHeader/>
      <HubTabPills active="leaderboard"/>
      <div style={{flex:1,overflow:'auto'}}>
        {/* Spotlight: GW + top of table */}
        <div style={{padding:'14px 18px 10px',display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,borderBottom:'1px solid var(--rule)'}}>
          <div style={{padding:'10px 12px',background:'var(--ink-2)',border:'1px solid var(--rule)',borderLeft:'2px solid var(--cyan)'}}>
            <div className="mono" style={{fontSize:9,color:'var(--cyan)',letterSpacing:'.2em'}}>YOUR RANK</div>
            <div style={{display:'flex',alignItems:'baseline',gap:6,marginTop:4}}>
              <span style={{fontFamily:'Archivo Black',fontSize:24}}>6</span>
              <span className="mono" style={{fontSize:9,color:'var(--mute)'}}>/ 14</span>
              <span className="mono" style={{fontSize:9,color:'var(--danger)',marginLeft:'auto'}}>▼ 2</span>
            </div>
            <div className="mono" style={{fontSize:9,color:'var(--mute)',marginTop:4,letterSpacing:'.14em'}}>+43 MD · 931 TOT</div>
          </div>
          <div style={{padding:'10px 12px',background:'var(--ink-2)',border:'1px solid var(--rule)',borderLeft:'2px solid var(--gold)'}}>
            <div className="mono" style={{fontSize:9,color:'var(--gold)',letterSpacing:'.2em'}}>LEADER · RAI</div>
            <div style={{display:'flex',alignItems:'baseline',gap:6,marginTop:4}}>
              <span style={{fontFamily:'Archivo Black',fontSize:24}}>1024</span>
            </div>
            <div className="mono" style={{fontSize:9,color:'var(--positive)',marginTop:4,letterSpacing:'.14em'}}>+78 THIS MD</div>
          </div>
        </div>

        {/* Standings list */}
        <MobSection label="STANDINGS" sub="GW28" tone="var(--cyan)"
          right={<span className="mono" style={{fontSize:9,color:'var(--mute)'}}>SORT · TOT</span>}/>
        <div>
          {LH_STANDINGS.map(s => {
            const m = lhMgrById(s.id);
            const isYou = s.id === 'you';
            return (
              <div key={s.id} style={{
                display:'grid',gridTemplateColumns:'28px auto 1fr auto auto',gap:10,alignItems:'center',
                padding:'10px 18px',borderBottom:'1px solid var(--rule)',
                borderLeft:isYou?'2px solid var(--cyan)':'2px solid transparent',
                background:isYou?'rgba(0,180,216,.04)':'transparent',
              }}>
                <div style={{display:'flex',flexDirection:'column',alignItems:'center'}}>
                  <span style={{fontFamily:'Archivo Black',fontSize:14}}>{s.rank}</span>
                  {s.trend !== 0 && (
                    <span className="mono" style={{fontSize:8,letterSpacing:'.12em',
                      color:s.trend>0?'var(--positive)':'var(--danger)'}}>{s.trend>0?'▲':'▼'}{Math.abs(s.trend)}</span>
                  )}
                </div>
                <MgrTag id={s.id} size={20}/>
                <div style={{minWidth:0}}>
                  <div style={{display:'flex',alignItems:'center',gap:6}}>
                    <span style={{fontFamily:'Archivo Black',fontSize:13,letterSpacing:'-0.01em',whiteSpace:'nowrap'}}>{isYou?'You':m.name}</span>
                    {s.rank === 1 && <span style={{fontFamily:'Archivo Black',fontSize:7,background:'var(--gold)',color:'var(--ink)',padding:'1px 4px',letterSpacing:'.1em'}}>1st</span>}
                  </div>
                  <div style={{display:'flex',alignItems:'center',gap:6,marginTop:2}}>
                    <span style={{width:5,height:5,background:'var(--gold)',display:'inline-block'}}/>
                    <span className="mono" style={{fontSize:9,color:'var(--mute)',letterSpacing:'.12em'}}>C · {s.cap.toUpperCase()}</span>
                  </div>
                </div>
                <MobFormDots form={m.form}/>
                <div style={{textAlign:'right'}}>
                  <div style={{fontFamily:'Archivo Black',fontSize:14}}>{s.tot}</div>
                  <div className="mono" style={{fontSize:9,color:s.md>=70?'var(--positive)':'var(--mute)',letterSpacing:'.14em',marginTop:2}}>+{s.md}</div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Activity */}
        <MobSection label="LEAGUE ACTIVITY" sub="LAST 24H" tone="var(--gold)"/>
        {LH_ACTIVITY.slice(0,6).map(a => {
          const m = a.who === 'edt' ? null : a.who;
          return (
            <div key={a.id} style={{display:'grid',gridTemplateColumns:'auto 1fr auto',gap:10,padding:'10px 18px',borderBottom:'1px solid var(--rule)',alignItems:'flex-start'}}>
              {m ? <MgrTag id={m} size={20}/> : (
                <span style={{minWidth:30,height:20,padding:'0 4px',display:'inline-flex',alignItems:'center',justifyContent:'center',border:'1px solid var(--paper)44',color:'var(--paper)',fontFamily:'JetBrains Mono,monospace',fontSize:9,letterSpacing:'.12em'}}>EDT</span>
              )}
              <div>
                <div className="mono" style={{fontSize:9,color:'var(--mute)',letterSpacing:'.16em'}}>{a.kind.toUpperCase()}</div>
                <div style={{fontFamily:'Archivo,sans-serif',fontSize:12,color:'var(--paper)',marginTop:2,lineHeight:1.4}}>{a.txt}</div>
              </div>
              <span className="mono" style={{fontSize:9,color:'var(--mute)',letterSpacing:'.14em'}}>{a.t}</span>
            </div>
          );
        })}
        <div style={{height:20}}/>
      </div>
    </PhoneShell>
  );
}

// ──────────────────────────────────────────────────────────────────
// MOBILE · MANAGER PROFILE drill-in
// ──────────────────────────────────────────────────────────────────

function MobManagerProfile({id='rai'}){
  const m = lhMgrById(id);
  const s = LH_STANDINGS.find(x => x.id === id);
  return (
    <PhoneShell>
      <AppTopbar/>
      <HubLeagueHeader backable title={`PROFILE · ${m.name.toUpperCase()}`}/>

      <div style={{flex:1,overflow:'auto'}}>
        {/* Hero */}
        <div style={{padding:'18px',display:'flex',gap:14,alignItems:'center',borderBottom:'1px solid var(--rule)'}}>
          <div style={{
            width:64,height:64,
            display:'flex',alignItems:'center',justifyContent:'center',
            background:`${m.hue}18`,border:`1px solid ${m.hue}66`,
            color:m.hue,
            fontFamily:'Archivo Black',fontSize:22,
          }}>{m.mono}</div>
          <div style={{flex:1,minWidth:0}}>
            <div className="mono" style={{fontSize:9,color:m.hue,letterSpacing:'.22em'}}>RANK {s.rank} · {s.rank===1?'LEADER':'MANAGER'}</div>
            <div className="display" style={{fontSize:22,marginTop:4}}>{m.name}</div>
            <div className="mono" style={{fontSize:9,color:'var(--mute)',marginTop:4,letterSpacing:'.14em'}}>{m.handle} · {m.squad}</div>
          </div>
        </div>

        {/* Stat strip */}
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',borderBottom:'1px solid var(--rule)'}}>
          {[
            {k:'GW28', v:`+${s.md}`, tone:'var(--positive)'},
            {k:'SEASON', v:s.tot, tone:'var(--paper)'},
            {k:'CAP %', v:'79%', tone:'var(--gold)'},
          ].map((c,i) => (
            <div key={c.k} style={{padding:'12px 14px',borderLeft: i ? '1px solid var(--rule)' : 'none'}}>
              <div className="mono" style={{fontSize:9,color:'var(--mute)',letterSpacing:'.2em'}}>{c.k}</div>
              <div style={{fontFamily:'Archivo Black',fontSize:20,color:c.tone,marginTop:4}}>{c.v}</div>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div style={{padding:14,display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,borderBottom:'1px solid var(--rule)'}}>
          <button style={{padding:'12px',background:'transparent',border:'1px solid var(--cyan)',color:'var(--cyan)',fontFamily:'JetBrains Mono,monospace',fontSize:10,letterSpacing:'.2em',cursor:'pointer'}}>CHALLENGE H2H</button>
          <button style={{padding:'12px',background:'transparent',border:'1px solid var(--gold)',color:'var(--gold)',fontFamily:'JetBrains Mono,monospace',fontSize:10,letterSpacing:'.2em',cursor:'pointer'}}>PROPOSE TRADE</button>
        </div>

        {/* H2H block */}
        <MobSection label="H2H vs YOU · ALL TIME" tone="var(--gold)"/>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',padding:'0 18px 14px',gap:8}}>
          {[
            { k:'W',  v:8, tone:'var(--positive)' },
            { k:'D',  v:2, tone:'var(--mute)' },
            { k:'L',  v:5, tone:'var(--danger)' },
          ].map(b => (
            <div key={b.k} style={{padding:'10px',background:'var(--ink-2)',border:'1px solid var(--rule)',textAlign:'center'}}>
              <div className="mono" style={{fontSize:9,color:'var(--mute)',letterSpacing:'.2em'}}>{b.k}</div>
              <div style={{fontFamily:'Archivo Black',fontSize:22,color:b.tone,marginTop:4}}>{b.v}</div>
            </div>
          ))}
        </div>

        {/* Recent matchups */}
        <div style={{padding:'0 18px 8px'}}>
          {[
            { gw:'GW27', you:54, them:78, won:false },
            { gw:'GW26', you:62, them:58, won:true  },
            { gw:'GW25', you:71, them:71, won:null  },
            { gw:'GW24', you:48, them:84, won:false },
          ].map(r => (
            <div key={r.gw} style={{display:'grid',gridTemplateColumns:'50px 60px 1fr 36px 1fr 36px',gap:8,alignItems:'center',padding:'10px 0',borderBottom:'1px solid var(--rule)'}}>
              <span className="mono" style={{fontSize:10,color:'var(--mute)',letterSpacing:'.14em'}}>{r.gw}</span>
              <span style={{fontFamily:'Archivo Black',fontSize:10,color:r.won===true?'var(--positive)':r.won===false?'var(--danger)':'var(--mute)'}}>{r.won===true?'WON':r.won===false?'LOST':'DRAW'}</span>
              <div style={{height:4,background:'var(--ink-3)',position:'relative'}}>
                <div style={{position:'absolute',right:0,top:0,bottom:0,width:`${(r.you/100)*100}%`,background:'var(--cyan)'}}/>
              </div>
              <span style={{fontFamily:'Archivo Black',fontSize:12,textAlign:'center'}}>{r.you}<span style={{color:'var(--mute)',fontFamily:'JetBrains Mono,monospace',fontSize:9,margin:'0 4px'}}>:</span>{r.them}</span>
              <div style={{height:4,background:'var(--ink-3)',position:'relative'}}>
                <div style={{position:'absolute',left:0,top:0,bottom:0,width:`${(r.them/100)*100}%`,background:m.hue}}/>
              </div>
              <span/>
            </div>
          ))}
        </div>

        {/* Squad summary */}
        <MobSection label="CURRENT XI · 4-3-3" tone="var(--cyan)"/>
        <div style={{padding:'0 18px 14px'}}>
          {[
            { line:'FWD', players:['Haaland (C)','Watkins','Saka'], tone:'var(--danger)' },
            { line:'MID', players:['Palmer','Rice','Mac Allister'],  tone:'var(--gold)' },
            { line:'DEF', players:['Trippier','Saliba','VVD','Gabriel'], tone:'var(--cyan)' },
            { line:'GK',  players:['Pickford'], tone:'var(--purple)' },
          ].map(L => (
            <div key={L.line} style={{padding:'8px 0',borderBottom:'1px solid var(--rule)',display:'flex',gap:10,alignItems:'flex-start'}}>
              <span className="mono" style={{fontSize:9,color:'var(--mute)',letterSpacing:'.2em',width:28,paddingTop:2}}>{L.line}</span>
              <div style={{flex:1,display:'flex',flexWrap:'wrap',gap:4}}>
                {L.players.map(p => (
                  <span key={p} style={{
                    padding:'3px 7px',background:'var(--ink-2)',border:'1px solid var(--rule)',
                    borderLeft:`2px solid ${L.tone}`,
                    fontFamily:'Archivo Black',fontSize:10,letterSpacing:'-0.01em',
                  }}>{p}</span>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div style={{height:30}}/>
      </div>
    </PhoneShell>
  );
}

window.MobLeaderboard = MobLeaderboard;
window.MobManagerProfile = MobManagerProfile;
