/* global React, LH_BETS, LH_BETTING_PERF, LH_BET_SERIES, lhMgrById,
   MgrTag, HubTopbar, HubActionBar, HubTabs, Spark, HubSectionLabel */

// ───────────────────────────────────────────────────────────────────
// BETS TAB — predictions to make and a history of resolved ones.
// ───────────────────────────────────────────────────────────────────

function BetsTab(){
  const open     = LH_BETS.filter(b => b.state === 'open');
  const pending  = LH_BETS.filter(b => b.state === 'pending');
  const resolved = LH_BETS.filter(b => b.state === 'resolved');

  return (
    <div style={{display:'flex',flexDirection:'column',width:'100%',height:'100%',background:'var(--ink)',color:'var(--paper)',fontFamily:'Archivo,sans-serif'}}>
      <HubTopbar/>
      <HubActionBar/>
      <HubTabs active="bets"/>

      {/* Hero strip */}
      <div style={{
        display:'grid',gridTemplateColumns:'1.6fr 1fr 1fr 1fr',
        borderBottom:'1px solid var(--rule)',background:'var(--ink-2)',
      }}>
        <div style={{padding:'20px 24px',borderRight:'1px solid var(--rule)'}}>
          <div className="mono" style={{fontSize:10,color:'var(--cyan)',letterSpacing:'.22em'}}>BETS &amp; PREDICTIONS · GW28</div>
          <div className="display" style={{fontSize:30,marginTop:6}}>Make your picks before the deadline.</div>
          <div className="mono" style={{fontSize:10,color:'var(--mute)',marginTop:8,letterSpacing:'.16em'}}>WIN BONUS POINTS — STACK THEM ONTO YOUR LEAGUE TOTAL.</div>
        </div>
        <BetsMini label="OPEN"    value={open.length}    sub="Picks required" tone="var(--cyan)"/>
        <BetsMini label="PENDING" value={pending.length} sub="Awaiting result" tone="var(--gold)"/>
        <BetsMini label="THIS GW" value={`+8`} sub="Pts banked from bets" tone="var(--positive)" right/>
      </div>

      {/* Sections */}
      <div style={{flex:1,overflow:'auto'}}>
        <BetSectionHeader title="OPEN" sub="Make your picks" tone="var(--cyan)" count={open.length}/>
        {open.map(b => <BetRow key={b.id} b={b}/>)}

        <BetSectionHeader title="PENDING RESULTS" sub="Waiting on the pitch" tone="var(--gold)" count={pending.length}/>
        {pending.map(b => <BetRow key={b.id} b={b} pending/>)}

        <BetSectionHeader title="RESULTS" sub="History" tone="var(--mute)" count={resolved.length}/>
        {resolved.map(b => <BetRow key={b.id} b={b} resolved/>)}
      </div>
    </div>
  );
}

function BetsMini({ label, value, sub, tone, right }){
  return (
    <div style={{padding:'20px 22px',borderRight: right ? 'none' : '1px solid var(--rule)',display:'flex',flexDirection:'column',justifyContent:'center'}}>
      <div className="mono" style={{fontSize:9,color:'var(--mute)',letterSpacing:'.22em'}}>{label}</div>
      <div style={{fontFamily:'Archivo Black',fontSize:34,color:tone,marginTop:6,letterSpacing:'-0.02em'}}>{value}</div>
      <div className="mono" style={{fontSize:9,color:'var(--mute)',marginTop:6,letterSpacing:'.16em'}}>{sub}</div>
    </div>
  );
}

function BetSectionHeader({ title, sub, tone, count }){
  return (
    <div style={{display:'flex',alignItems:'center',gap:10,padding:'16px 24px 8px',background:'transparent'}}>
      <span style={{width:3,height:14,background:tone}}/>
      <span className="mono" style={{fontSize:11,color:'var(--paper)',letterSpacing:'.22em'}}>{title}</span>
      <span className="mono" style={{fontSize:9,color:'var(--mute)',letterSpacing:'.18em'}}>· {sub}</span>
      <span style={{flex:1}}/>
      <span className="mono" style={{fontSize:9,color:'var(--mute)',letterSpacing:'.18em'}}>{count} TOTAL</span>
    </div>
  );
}

const kindGlyph = {
  'top-scorer':{ g:'◉', tone:'var(--cyan)'   },
  'block':     { g:'⛌', tone:'var(--danger)' },
  'over-under':{ g:'≷', tone:'var(--gold)'   },
  'h2h':       { g:'⚔', tone:'var(--purple)' },
  'fixture':   { g:'◈', tone:'var(--paper)'  },
};

function BetRow({ b, pending, resolved }){
  const k = kindGlyph[b.kind] || kindGlyph['fixture'];
  return (
    <div style={{
      margin:'0 24px 10px',background:'var(--ink-2)',
      border:'1px solid var(--rule)',
      borderLeft:`3px solid ${b.won===false ? 'var(--danger)' : b.won===true ? 'var(--positive)' : k.tone}`,
      display:'grid',gridTemplateColumns:'1fr auto',gap:0,
    }}>
      <div style={{padding:'14px 18px',display:'flex',flexDirection:'column',gap:8}}>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <span style={{
            width:22,height:22,display:'inline-flex',alignItems:'center',justifyContent:'center',
            color:k.tone,fontFamily:'Archivo Black',fontSize:13,
            background:`${k.tone}15`,border:`1px solid ${k.tone}55`,
          }}>{k.g}</span>
          <span style={{fontFamily:'Archivo Black',fontSize:15,color:k.tone,letterSpacing:'-0.01em'}}>{b.title.toUpperCase()}</span>
          <span className="mono" style={{fontSize:9,color:'var(--mute)',letterSpacing:'.18em'}}>· {b.code}</span>
          <span style={{flex:1}}/>
          {!resolved && (
            <span style={{
              fontFamily:'JetBrains Mono,monospace',fontSize:10,color:'var(--positive)',
              padding:'3px 7px',border:'1px solid var(--positive)55',background:'rgba(34,197,94,.08)',
              letterSpacing:'.18em',
            }}>+{b.reward} PTS</span>
          )}
        </div>
        <div style={{fontFamily:'Archivo,sans-serif',fontSize:13,color:'var(--paper)',lineHeight:1.5}}>{b.q}</div>

        {/* Body for OPEN: choice chips. PENDING: status note. RESOLVED: answer + pick */}
        {!pending && !resolved && (
          <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:4}}>
            {b.options.map(opt => {
              const picked = b.picked === opt;
              return (
                <span key={opt} style={{
                  padding:'6px 10px',fontFamily:'Archivo Black',fontSize:11,letterSpacing:'-0.01em',
                  border:`1px solid ${picked?'var(--cyan)':'var(--rule)'}`,
                  background:picked?'rgba(0,180,216,.08)':'transparent',
                  color:picked?'var(--cyan)':'var(--paper)',
                }}>
                  {picked && <span style={{marginRight:6}}>✓</span>}{opt}
                </span>
              );
            })}
          </div>
        )}
        {pending && (
          <div className="mono" style={{fontSize:10,color:'var(--gold)',letterSpacing:'.16em',marginTop:2}}>· {b.note}</div>
        )}
        {resolved && (
          <div style={{display:'flex',gap:18,marginTop:4,alignItems:'center'}}>
            <div>
              <span className="mono" style={{fontSize:9,color:'var(--mute)',letterSpacing:'.2em'}}>ANSWER · </span>
              <span style={{fontFamily:'Archivo Black',fontSize:12}}>{b.answer}</span>
            </div>
            <div>
              <span className="mono" style={{fontSize:9,color:'var(--mute)',letterSpacing:'.2em'}}>YOUR PICK · </span>
              <span style={{fontFamily:'Archivo Black',fontSize:12,color:b.won?'var(--positive)':'var(--danger)'}}>{b.myPick}</span>
            </div>
          </div>
        )}

        <div style={{display:'flex',alignItems:'center',gap:14,marginTop:4}}>
          {!resolved && !pending && (
            <span className="mono" style={{fontSize:10,color:'var(--mute)',letterSpacing:'.18em'}}>● {b.closes} left to lock in</span>
          )}
          {!resolved && (
            <span className="mono" style={{fontSize:10,color:'var(--mute)',letterSpacing:'.18em'}}>
              {!pending && '· '}
              {pending ? 'RESOLVES AT FINAL WHISTLE' : (b.picked ? 'PICK LOCKED · YOU CAN STILL CHANGE' : 'NO PICK YET')}
            </span>
          )}
          {resolved && (
            <span className="mono" style={{fontSize:10,color:b.won?'var(--positive)':'var(--danger)',letterSpacing:'.22em'}}>
              {b.won ? `+${b.reward} PTS BANKED` : '0 PTS · BETTER LUCK'}
            </span>
          )}
        </div>
      </div>

      <div style={{
        borderLeft:'1px solid var(--rule)',padding:'14px 18px',
        display:'flex',alignItems:'center',justifyContent:'center',minWidth:160,
      }}>
        {!resolved && !pending && (
          <button style={{
            background:'var(--cyan)',color:'var(--ink)',border:0,
            padding:'10px 18px',fontFamily:'Archivo Black,sans-serif',fontSize:12,letterSpacing:'.16em',cursor:'pointer',
          }}>{b.picked ? 'CHANGE PICK' : 'MAKE PICK →'}</button>
        )}
        {pending && (
          <span className="mono" style={{fontSize:10,color:'var(--gold)',letterSpacing:'.22em'}}>● PENDING</span>
        )}
        {resolved && (
          <span className="mono" style={{
            fontSize:10,letterSpacing:'.22em',
            color:b.won?'var(--positive)':'var(--danger)',
          }}>● {b.won?'WON':'LOST'}</span>
        )}
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────
// MAKE PICK — drill-in for one bet (MD5 Top Scorer in this mock).
// ───────────────────────────────────────────────────────────────────
function MakePickScreen(){
  const b = LH_BETS[0];
  const [pick, setPick] = React.useState(null);
  const odds = [
    { name:'Haaland',  club:'MCI', form:[12,8,18,9,14], pct:'42%', mult:'×1.6' },
    { name:'Palmer',   club:'CHE', form:[ 9,8,14,12,30], pct:'31%', mult:'×2.1' },
    { name:'Watkins',  club:'AVL', form:[ 6,8, 4, 9,12], pct:'12%', mult:'×3.4' },
    { name:'Saka',     club:'ARS', form:[ 9,5,11, 8, 7], pct:'10%', mult:'×4.0' },
    { name:'Other',    club:'—',   form:[ 0,0, 0, 0, 0], pct:' 5%', mult:'×6.0' },
  ];
  return (
    <div style={{display:'flex',flexDirection:'column',width:'100%',height:'100%',background:'var(--ink)',color:'var(--paper)',fontFamily:'Archivo,sans-serif'}}>
      <div style={{padding:'16px 28px',borderBottom:'1px solid var(--rule)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <div className="mono" style={{fontSize:10,color:'var(--mute)',letterSpacing:'.22em'}}>← BETS · MAKE PICK · MD5 TOP SCORER</div>
        <div className="mono" style={{fontSize:10,color:'var(--danger)',letterSpacing:'.22em'}}>● PICKS CLOSE IN 2h 36m</div>
      </div>

      {/* Body */}
      <div style={{flex:1,display:'grid',gridTemplateColumns:'1fr 380px',minHeight:0}}>
        <div style={{padding:'24px 32px',display:'flex',flexDirection:'column',gap:18,minHeight:0,overflow:'auto'}}>
          <div>
            <div className="mono" style={{fontSize:10,color:'var(--cyan)',letterSpacing:'.22em'}}>BET · MDMD5</div>
            <div className="display" style={{fontSize:38,marginTop:4}}>Who tops MD5?</div>
            <div style={{fontFamily:'Archivo,sans-serif',fontSize:14,color:'var(--paper)',marginTop:8,lineHeight:1.5,maxWidth:640}}>
              Pick the player you think will score the most goals across all GW28 fixtures. Tie-break is assists, then minutes played. Resolves at the final whistle of the latest match.
            </div>
          </div>

          <div className="mono" style={{fontSize:10,color:'var(--mute)',letterSpacing:'.22em'}}>SELECT ONE</div>
          <div style={{display:'flex',flexDirection:'column',gap:10}}>
            {odds.map(o => {
              const isPicked = pick === o.name;
              return (
                <button key={o.name} onClick={() => setPick(o.name)} style={{
                  textAlign:'left',cursor:'pointer',
                  background:isPicked?'rgba(0,180,216,.08)':'var(--ink-2)',
                  border:isPicked?'1px solid var(--cyan)':'1px solid var(--rule)',
                  borderLeft:isPicked?'3px solid var(--cyan)':'3px solid transparent',
                  padding:'14px 18px',color:'var(--paper)',
                  display:'grid',gridTemplateColumns:'28px 1fr auto auto 100px 80px',gap:14,alignItems:'center',
                  fontFamily:'Archivo,sans-serif',
                }}>
                  <span style={{
                    width:18,height:18,borderRadius:'50%',
                    border:`2px solid ${isPicked?'var(--cyan)':'var(--rule)'}`,
                    background:isPicked?'var(--cyan)':'transparent',
                  }}/>
                  <div style={{display:'flex',flexDirection:'column',gap:2}}>
                    <span style={{fontFamily:'Archivo Black',fontSize:16,letterSpacing:'-0.01em'}}>{o.name}</span>
                    <span className="mono" style={{fontSize:9,color:'var(--mute)',letterSpacing:'.18em'}}>{o.club} · FORM L5</span>
                  </div>
                  <Spark data={o.form} tone={isPicked?'var(--cyan)':'var(--mute)'} w={80} h={20}/>
                  <span className="mono" style={{fontSize:10,color:'var(--mute)',letterSpacing:'.14em'}}>{o.pct} OF LEAGUE</span>
                  <span style={{textAlign:'right',fontFamily:'Archivo Black',fontSize:14,color:'var(--gold)'}}>{o.mult}</span>
                  <span style={{
                    textAlign:'right',fontFamily:'JetBrains Mono,monospace',fontSize:10,letterSpacing:'.14em',
                    color:isPicked?'var(--cyan)':'var(--mute)',
                  }}>{isPicked?'PICKED':'PICK'}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right rail */}
        <aside style={{borderLeft:'1px solid var(--rule)',padding:'24px 22px',display:'flex',flexDirection:'column',gap:18,background:'var(--ink-2)'}}>
          <div>
            <div className="mono" style={{fontSize:10,color:'var(--mute)',letterSpacing:'.22em'}}>PAYOUT</div>
            <div style={{fontFamily:'Archivo Black',fontSize:44,color:pick?'var(--positive)':'var(--mute)',marginTop:6}}>+{pick==='Watkins'?17:pick==='Other'?30:pick?8:'—'}<span style={{fontSize:14,color:'var(--mute)',marginLeft:8}}>PTS</span></div>
            <div className="mono" style={{fontSize:9,color:'var(--mute)',marginTop:6,letterSpacing:'.16em'}}>BASE 5 PTS × ODDS MULTIPLIER</div>
          </div>
          <hr className="fk-rule"/>
          <div>
            <div className="mono" style={{fontSize:10,color:'var(--mute)',letterSpacing:'.22em'}}>WHO'S PICKED WHAT · 6/12</div>
            <div style={{display:'flex',flexDirection:'column',gap:6,marginTop:8}}>
              {[
                { name:'Haaland', mgrs:['rai','ndo','olu'] },
                { name:'Palmer',  mgrs:['ade','mar']       },
                { name:'Saka',    mgrs:['zoe']             },
              ].map(grp => (
                <div key={grp.name} style={{display:'flex',alignItems:'center',gap:8}}>
                  <span style={{fontFamily:'Archivo Black',fontSize:11,minWidth:70}}>{grp.name}</span>
                  <div style={{display:'flex',gap:4}}>
                    {grp.mgrs.map(m => <MgrTag key={m} id={m}/>)}
                  </div>
                  <span className="mono" style={{fontSize:9,color:'var(--mute)',marginLeft:'auto',letterSpacing:'.14em'}}>{grp.mgrs.length}</span>
                </div>
              ))}
            </div>
          </div>
          <hr className="fk-rule"/>
          <div className="mono" style={{fontSize:9,color:'var(--mute)',letterSpacing:'.16em',lineHeight:1.5}}>
            PICKS ARE PRIVATE UNTIL THE DEADLINE. AFTER LOCK, EVERY MANAGER’S PICK IS SHOWN AND THE RESOLUTION RUNS AT FINAL WHISTLE.
          </div>
          <button disabled={!pick} style={{
            background:pick?'var(--cyan)':'var(--ink-3)',
            color:pick?'var(--ink)':'var(--mute)',border:0,
            padding:'14px 18px',marginTop:'auto',
            fontFamily:'Archivo Black,sans-serif',fontSize:13,letterSpacing:'.18em',
            cursor:pick?'pointer':'not-allowed',
          }}>{pick ? 'LOCK IN PICK →' : 'SELECT A PLAYER'}</button>
        </aside>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────
// BETTING TAB — performance dashboard for the league's bettors.
// ───────────────────────────────────────────────────────────────────

function BettingTab(){
  const ids = ['rai','olu','you','ade','ndo','mar'];
  return (
    <div style={{display:'flex',flexDirection:'column',width:'100%',height:'100%',background:'var(--ink)',color:'var(--paper)',fontFamily:'Archivo,sans-serif'}}>
      <HubTopbar/>
      <HubActionBar/>
      <HubTabs active="betting"/>

      {/* Hero — your stats */}
      <div style={{display:'grid',gridTemplateColumns:'1.4fr 1fr 1fr 1fr 1fr',borderBottom:'1px solid var(--rule)',background:'var(--ink-2)'}}>
        <div style={{padding:'20px 24px',borderRight:'1px solid var(--rule)'}}>
          <div className="mono" style={{fontSize:10,color:'var(--cyan)',letterSpacing:'.22em'}}>YOUR BETTING · GW1 → GW28</div>
          <div className="display" style={{fontSize:30,marginTop:6}}>+22 PTS</div>
          <div className="mono" style={{fontSize:10,color:'var(--mute)',marginTop:8,letterSpacing:'.18em'}}>RANK 3 / 12 IN LEAGUE</div>
        </div>
        {[
          { k:'PLAYED', v:'18',  tone:'var(--paper)' },
          { k:'WON',    v:'11',  tone:'var(--positive)' },
          { k:'WIN %',  v:'61%', tone:'var(--cyan)' },
          { k:'STREAK', v:'3 W', tone:'var(--gold)' },
        ].map((c,i) => (
          <div key={c.k} style={{padding:'20px 22px',borderRight:i<3?'1px solid var(--rule)':'none'}}>
            <div className="mono" style={{fontSize:9,color:'var(--mute)',letterSpacing:'.22em'}}>{c.k}</div>
            <div style={{fontFamily:'Archivo Black',fontSize:32,color:c.tone,marginTop:6,letterSpacing:'-0.02em'}}>{c.v}</div>
          </div>
        ))}
      </div>

      {/* Body */}
      <div style={{flex:1,display:'grid',gridTemplateColumns:'1.4fr 1fr',minHeight:0}}>
        {/* Leaderboard */}
        <div style={{display:'flex',flexDirection:'column',minHeight:0,borderRight:'1px solid var(--rule)'}}>
          <HubSectionLabel label="BETTING LEADERBOARD" sub="POINTS FROM BETS · SEASON"
            right={<span className="mono" style={{fontSize:9,color:'var(--mute)'}}>SORT · PROFIT ↓</span>}/>
          <div style={{display:'grid',gridTemplateColumns:'40px 1fr 110px 70px 70px 70px 100px',gap:14,padding:'10px 22px',borderBottom:'1px solid var(--rule)',color:'var(--mute)'}}>
            <span className="mono" style={{fontSize:9}}>#</span>
            <span className="mono" style={{fontSize:9}}>MANAGER</span>
            <span className="mono" style={{fontSize:9}}>L8 GW</span>
            <span className="mono" style={{fontSize:9,textAlign:'right'}}>W-L</span>
            <span className="mono" style={{fontSize:9,textAlign:'right'}}>WIN %</span>
            <span className="mono" style={{fontSize:9,textAlign:'right'}}>STR</span>
            <span className="mono" style={{fontSize:9,textAlign:'right'}}>PROFIT</span>
          </div>
          <div style={{flex:1,overflow:'auto'}}>
            {ids.map((id, i) => {
              const m = lhMgrById(id);
              const p = LH_BETTING_PERF[id];
              const winPct = Math.round((p.won/(p.played-p.void))*100);
              const isYou = id==='you';
              return (
                <div key={id} style={{
                  display:'grid',gridTemplateColumns:'40px 1fr 110px 70px 70px 70px 100px',gap:14,padding:'12px 22px',
                  borderBottom:'1px solid var(--rule)',alignItems:'center',
                  background: isYou ? 'rgba(0,180,216,.04)' : 'transparent',
                  borderLeft: isYou ? '2px solid var(--cyan)' : '2px solid transparent',
                }}>
                  <span style={{fontFamily:'Archivo Black',fontSize:14}}>{i+1}</span>
                  <div style={{display:'flex',alignItems:'center',gap:10}}>
                    <MgrTag id={id}/>
                    <span style={{fontFamily:'Archivo Black',fontSize:13}}>{isYou?'You':m.name}</span>
                    <span className="mono" style={{fontSize:9,color:'var(--mute)',letterSpacing:'.16em'}}>· {p.bestKind.replace('-',' ').toUpperCase()} TIER</span>
                  </div>
                  <Spark data={LH_BET_SERIES[id]} tone={i===0?'var(--gold)':'var(--cyan)'} w={100} h={22}/>
                  <span style={{textAlign:'right',fontFamily:'Archivo,sans-serif',fontSize:12}}>
                    <span style={{color:'var(--positive)'}}>{p.won}</span>
                    <span style={{color:'var(--mute)'}}> · </span>
                    <span style={{color:'var(--danger)'}}>{p.lost}</span>
                  </span>
                  <span style={{textAlign:'right',fontFamily:'Archivo Black',fontSize:13}}>{winPct}%</span>
                  <span style={{textAlign:'right',fontFamily:'JetBrains Mono,monospace',fontSize:11,color:p.streak>=3?'var(--gold)':'var(--mute)'}}>{p.streak}W</span>
                  <span style={{textAlign:'right',fontFamily:'Archivo Black',fontSize:14,color:'var(--positive)'}}>+{p.profit}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right rail */}
        <aside style={{display:'flex',flexDirection:'column',minHeight:0,background:'var(--ink-2)'}}>
          <HubSectionLabel label="YOUR PERFORMANCE" sub="BY BET TYPE" tone="var(--gold)"/>
          <div style={{padding:'14px 22px',display:'flex',flexDirection:'column',gap:10,borderBottom:'1px solid var(--rule)'}}>
            {[
              { k:'Fixture outcome',  w:5, l:2, pct:71, tone:'var(--positive)' },
              { k:'Top scorer',       w:3, l:1, pct:75, tone:'var(--cyan)' },
              { k:'Over / Under',     w:2, l:1, pct:67, tone:'var(--gold)' },
              { k:'Block opponent',   w:0, l:2, pct: 0, tone:'var(--danger)' },
              { k:'H2H wager',        w:1, l:0, pct:100, tone:'var(--positive)' },
            ].map(r => (
              <div key={r.k} style={{display:'grid',gridTemplateColumns:'1fr auto auto',gap:12,alignItems:'center'}}>
                <div>
                  <div style={{fontFamily:'Archivo Black',fontSize:12}}>{r.k}</div>
                  <div style={{height:4,background:'var(--ink-3)',marginTop:4}}>
                    <div style={{height:'100%',width:`${r.pct}%`,background:r.tone}}/>
                  </div>
                </div>
                <span className="mono" style={{fontSize:10,color:'var(--mute)',letterSpacing:'.14em'}}>{r.w}-{r.l}</span>
                <span style={{fontFamily:'Archivo Black',fontSize:14,color:r.tone,minWidth:42,textAlign:'right'}}>{r.pct}%</span>
              </div>
            ))}
          </div>

          <HubSectionLabel label="RIVALS WATCH" sub="BIGGEST GAP" tone="var(--purple)"/>
          <div style={{padding:'14px 22px',display:'flex',flexDirection:'column',gap:14}}>
            {[
              { id:'rai', diff:-16, note:'Hot on top-scorer · 75% hit rate' },
              { id:'olu', diff:-5,  note:'2 GW streak · Salah-heavy' },
              { id:'ade', diff:+7,  note:'You hold the edge · -3 GW form'  },
            ].map(r => (
              <div key={r.id} style={{display:'flex',alignItems:'center',gap:10}}>
                <MgrTag id={r.id}/>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontFamily:'Archivo Black',fontSize:12}}>{lhMgrById(r.id).name}</div>
                  <div className="mono" style={{fontSize:9,color:'var(--mute)',letterSpacing:'.14em',marginTop:2}}>{r.note}</div>
                </div>
                <span style={{fontFamily:'Archivo Black',fontSize:14,color:r.diff>0?'var(--positive)':'var(--danger)'}}>{r.diff>0?'+':''}{r.diff}</span>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}

window.BetsTab = BetsTab;
window.MakePickScreen = MakePickScreen;
window.BettingTab = BettingTab;
