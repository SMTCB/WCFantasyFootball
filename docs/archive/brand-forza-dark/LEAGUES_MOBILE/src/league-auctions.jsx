/* global React, LH_AUCTIONS, LH_AUCTION_DETAIL, lhMgrById,
   MgrTag, HubTopbar, HubActionBar, HubTabs, Spark, HubSectionLabel */

// ───────────────────────────────────────────────────────────────────
// AUCTIONS TAB — players open for league bidding.
// Pool rule: managers in the same league cannot own the same player,
// so we surface BLOCKED players too (who has them).
// ───────────────────────────────────────────────────────────────────

const posTone = { GK:'#A855F7', DEF:'#00B4D8', MID:'#E0A800', FWD:'#EF4444' };

function AuctionsTab(){
  const live     = LH_AUCTIONS.filter(a => a.state === 'live');
  const starting = LH_AUCTIONS.filter(a => a.state === 'starting');
  const blocked  = LH_AUCTIONS.filter(a => a.state === 'blocked');
  const resolved = LH_AUCTIONS.filter(a => a.state === 'resolved');

  return (
    <div style={{display:'flex',flexDirection:'column',width:'100%',height:'100%',background:'var(--ink)',color:'var(--paper)',fontFamily:'Archivo,sans-serif'}}>
      <HubTopbar/>
      <HubActionBar/>
      <HubTabs active="auctions"/>

      {/* Hero strip */}
      <div style={{display:'grid',gridTemplateColumns:'2fr 1fr 1fr 1fr 1fr',borderBottom:'1px solid var(--rule)',background:'var(--ink-2)'}}>
        <div style={{padding:'20px 24px',borderRight:'1px solid var(--rule)'}}>
          <div className="mono" style={{fontSize:10,color:'var(--gold)',letterSpacing:'.22em'}}>AUCTION HOUSE · OFFICE HEROES</div>
          <div className="display" style={{fontSize:30,marginTop:6}}>Open bids close every hour.</div>
          <div className="mono" style={{fontSize:10,color:'var(--mute)',marginTop:8,letterSpacing:'.16em'}}>NO TWO MANAGERS CAN OWN THE SAME PLAYER. SNIPE WISELY.</div>
        </div>
        {[
          { k:'LIVE',     v:live.length,     tone:'var(--danger)'   },
          { k:'STARTING', v:starting.length, tone:'var(--gold)'     },
          { k:'BLOCKED',  v:blocked.length,  tone:'var(--mute)'     },
          { k:'BUDGET',   v:'27.5M',         tone:'var(--cyan)', right:true },
        ].map((c,i) => (
          <div key={c.k} style={{padding:'20px 22px',borderRight: c.right ? 'none' : '1px solid var(--rule)'}}>
            <div className="mono" style={{fontSize:9,color:'var(--mute)',letterSpacing:'.22em'}}>{c.k}</div>
            <div style={{fontFamily:'Archivo Black',fontSize:30,color:c.tone,marginTop:6,letterSpacing:'-0.02em'}}>{c.v}</div>
          </div>
        ))}
      </div>

      {/* Body — grid for live/starting, then blocked rail */}
      <div style={{flex:1,display:'grid',gridTemplateColumns:'1fr 320px',minHeight:0}}>
        <div style={{display:'flex',flexDirection:'column',minHeight:0,borderRight:'1px solid var(--rule)',overflow:'auto'}}>
          <HubSectionLabel label="LIVE · CLOSING SOON" tone="var(--danger)"
            sub="ENDS WITHIN 24H · 3-SECOND ANTI-SNIPE WINDOW"
            right={<span className="mono" style={{fontSize:9,color:'var(--mute)'}}>SORT · CLOSING ↑</span>}/>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,padding:14}}>
            {live.map(a => <AuctionCard key={a.id} a={a} mine={a.id==='au2'}/>)}
          </div>

          <HubSectionLabel label="STARTING · OPENS LATER" tone="var(--gold)"
            sub="QUEUED FOR PUBLIC BIDDING"/>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,padding:14}}>
            {starting.map(a => <AuctionCard key={a.id} a={a} starting/>)}
          </div>

          <HubSectionLabel label="RECENT GAVELS" tone="var(--mute)"/>
          <div style={{padding:14}}>
            {resolved.map(a => (
              <div key={a.id} style={{display:'grid',gridTemplateColumns:'auto 1fr auto auto auto',gap:14,padding:'10px 14px',border:'1px solid var(--rule)',background:'var(--ink-2)',alignItems:'center'}}>
                <span style={{
                  fontFamily:'Archivo Black',fontSize:12,
                  padding:'3px 6px',background:`${posTone[a.pos]}18`,color:posTone[a.pos],border:`1px solid ${posTone[a.pos]}55`,letterSpacing:'.1em',
                }}>{a.pos}</span>
                <span style={{fontFamily:'Archivo Black',fontSize:14,letterSpacing:'-0.01em'}}>{a.player}<span style={{color:'var(--mute)',fontFamily:'JetBrains Mono,monospace',fontSize:10,marginLeft:8,letterSpacing:'.16em'}}>{a.club}</span></span>
                <span className="mono" style={{fontSize:10,color:'var(--mute)',letterSpacing:'.16em'}}>WON BY</span>
                <span style={{display:'inline-flex',gap:6,alignItems:'center'}}>
                  <MgrTag id={a.ownedBy}/>
                  <span style={{fontFamily:'Archivo Black',fontSize:12}}>{lhMgrById(a.ownedBy).name}</span>
                </span>
                <span style={{fontFamily:'Archivo Black',fontSize:14,color:'var(--gold)'}}>£{a.current.toFixed(1)}m</span>
              </div>
            ))}
          </div>
        </div>

        {/* Blocked rail */}
        <aside style={{display:'flex',flexDirection:'column',minHeight:0,background:'var(--ink-2)'}}>
          <HubSectionLabel label="BLOCKED · ALREADY OWNED" tone="var(--mute)"
            sub="CAN'T BE BID ON · LEAGUE EXCLUSIVE"/>
          <div style={{padding:14,display:'flex',flexDirection:'column',gap:10}}>
            {blocked.map(a => (
              <div key={a.id} style={{
                padding:'12px 14px',background:'var(--ink)',border:'1px solid var(--rule)',
                position:'relative',overflow:'hidden',
              }}>
                <div style={{position:'absolute',inset:0,background:'repeating-linear-gradient(135deg, rgba(139,149,161,.04) 0 6px, transparent 6px 12px)',pointerEvents:'none'}}/>
                <div style={{display:'flex',alignItems:'center',gap:10,position:'relative'}}>
                  <span style={{
                    fontFamily:'Archivo Black',fontSize:11,
                    padding:'2px 5px',background:`${posTone[a.pos]}18`,color:posTone[a.pos],border:`1px solid ${posTone[a.pos]}55`,letterSpacing:'.1em',
                  }}>{a.pos}</span>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontFamily:'Archivo Black',fontSize:13,letterSpacing:'-0.01em'}}>{a.player}</div>
                    <div className="mono" style={{fontSize:9,color:'var(--mute)',letterSpacing:'.16em',marginTop:2}}>{a.club} · OWNED BY {lhMgrById(a.ownedBy).name.toUpperCase()}</div>
                  </div>
                  <MgrTag id={a.ownedBy}/>
                </div>
                <button style={{
                  marginTop:8,width:'100%',
                  background:'transparent',border:'1px dashed var(--rule)',color:'var(--mute)',
                  padding:'6px 10px',fontFamily:'JetBrains Mono,monospace',fontSize:9,letterSpacing:'.18em',cursor:'pointer',
                }}>OFFER TRADE TO {lhMgrById(a.ownedBy).mono} →</button>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}

function AuctionCard({ a, mine, starting }){
  const t = posTone[a.pos];
  const leader = a.leader ? lhMgrById(a.leader) : null;
  const isLeading = a.leader === 'you';
  return (
    <div style={{
      background:'var(--ink-2)',border:'1px solid var(--rule)',
      borderLeft:`3px solid ${starting?'var(--gold)':isLeading?'var(--positive)':t}`,
      padding:'14px 16px',display:'flex',flexDirection:'column',gap:10,position:'relative',
    }}>
      {!starting && (
        <span style={{
          position:'absolute',top:10,right:12,
          fontFamily:'JetBrains Mono,monospace',fontSize:9,letterSpacing:'.18em',
          color:'var(--danger)',
        }}>● {a.closes}</span>
      )}
      <div style={{display:'flex',alignItems:'flex-end',gap:12}}>
        <span style={{
          fontFamily:'Archivo Black',fontSize:11,
          padding:'3px 6px',background:`${t}18`,color:t,border:`1px solid ${t}55`,letterSpacing:'.1em',
        }}>{a.pos}</span>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontFamily:'Archivo Black',fontSize:18,letterSpacing:'-0.01em'}}>{a.player}</div>
          <div className="mono" style={{fontSize:9,color:'var(--mute)',letterSpacing:'.18em',marginTop:2}}>{a.club} · OPENED BY {a.open}</div>
        </div>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginTop:2}}>
        <div>
          <div className="mono" style={{fontSize:9,color:'var(--mute)',letterSpacing:'.2em'}}>CURRENT</div>
          <div style={{fontFamily:'Archivo Black',fontSize:22,color:'var(--gold)',marginTop:4}}>£{a.current.toFixed(1)}m</div>
        </div>
        <div>
          <div className="mono" style={{fontSize:9,color:'var(--mute)',letterSpacing:'.2em'}}>{starting?'OPENS':'LEADING'}</div>
          {leader ? (
            <div style={{display:'flex',alignItems:'center',gap:8,marginTop:4}}>
              <MgrTag id={leader.id}/>
              <span style={{fontFamily:'Archivo Black',fontSize:13,color:isLeading?'var(--positive)':'var(--paper)'}}>{isLeading?'YOU':leader.name.split(' ')[0]}</span>
            </div>
          ) : (
            <div style={{fontFamily:'Archivo Black',fontSize:14,color:'var(--mute)',marginTop:4}}>{a.closes}</div>
          )}
        </div>
      </div>

      {!starting && (
        <div style={{display:'flex',alignItems:'center',gap:8,paddingTop:6,borderTop:'1px solid var(--rule)'}}>
          <span className="mono" style={{fontSize:9,color:'var(--mute)',letterSpacing:'.16em'}}>YOUR MAX</span>
          <span style={{fontFamily:'Archivo Black',fontSize:13,color:a.myMax?'var(--cyan)':'var(--mute)'}}>{a.myMax ? `£${a.myMax.toFixed(1)}m` : 'NOT SET'}</span>
          <span style={{flex:1}}/>
          <button style={{
            background: isLeading ? 'transparent' : 'var(--cyan)',
            color: isLeading ? 'var(--cyan)' : 'var(--ink)',
            border: isLeading ? '1px solid var(--cyan)' : 'none',
            padding:'6px 12px',fontFamily:'JetBrains Mono,monospace',fontSize:10,letterSpacing:'.2em',cursor:'pointer',
          }}>{isLeading ? 'EDIT MAX' : 'BID +0.5 →'}</button>
        </div>
      )}
      {starting && (
        <button style={{
          marginTop:4,background:'transparent',color:'var(--gold)',border:'1px solid var(--gold)55',
          padding:'7px 12px',fontFamily:'JetBrains Mono,monospace',fontSize:10,letterSpacing:'.2em',cursor:'pointer',
        }}>WATCH · NOTIFY ME →</button>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────
// AUCTION DETAIL — drill-in for a single auction.
// ───────────────────────────────────────────────────────────────────
function AuctionDetailScreen(){
  const d = LH_AUCTION_DETAIL;
  const [bid, setBid] = React.useState(14.0);
  const t = posTone[d.pos];
  return (
    <div style={{display:'flex',flexDirection:'column',width:'100%',height:'100%',background:'var(--ink)',color:'var(--paper)',fontFamily:'Archivo,sans-serif'}}>
      <div style={{padding:'16px 28px',borderBottom:'1px solid var(--rule)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <div className="mono" style={{fontSize:10,color:'var(--mute)',letterSpacing:'.22em'}}>← AUCTIONS · LOT #AU1</div>
        <div style={{display:'flex',gap:14,alignItems:'center'}}>
          <span style={{width:8,height:8,borderRadius:'50%',background:'var(--danger)',animation:'fkPulse 1.4s ease-in-out infinite'}}/>
          <span className="mono" style={{fontSize:10,color:'var(--danger)',letterSpacing:'.22em'}}>LIVE · CLOSES IN 12m 04s</span>
        </div>
      </div>

      <div style={{flex:1,display:'grid',gridTemplateColumns:'1.3fr 1fr',minHeight:0}}>
        {/* Left: player + bid stage */}
        <div style={{padding:'28px 32px',display:'flex',flexDirection:'column',gap:22,borderRight:'1px solid var(--rule)',minHeight:0,overflow:'auto'}}>
          <div style={{display:'flex',alignItems:'flex-end',gap:18}}>
            <span style={{
              fontFamily:'Archivo Black',fontSize:14,
              padding:'4px 8px',background:`${t}18`,color:t,border:`1px solid ${t}66`,letterSpacing:'.12em',
            }}>{d.pos}</span>
            <div>
              <div className="display" style={{fontSize:54}}>{d.player}</div>
              <div className="mono" style={{fontSize:10,color:'var(--mute)',marginTop:6,letterSpacing:'.18em'}}>{d.club} · AGE {d.age} · SEL {d.selectedBy} · SEASON {d.totalPts} PTS</div>
            </div>
          </div>

          {/* Form chart */}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:18}}>
            <div style={{background:'var(--ink-2)',border:'1px solid var(--rule)',padding:'14px 18px'}}>
              <div className="mono" style={{fontSize:10,color:'var(--mute)',letterSpacing:'.22em'}}>FORM · LAST 5 GW</div>
              <div style={{marginTop:10}}>
                <Spark data={d.formGW} tone="var(--cyan)" w={300} h={56} zero={false}/>
              </div>
              <div style={{display:'flex',justifyContent:'space-between',marginTop:8}}>
                {d.formGW.map((v,i) => (
                  <div key={i} style={{textAlign:'center'}}>
                    <div style={{fontFamily:'Archivo Black',fontSize:14,color:v>=20?'var(--gold)':v>=10?'var(--positive)':'var(--paper)'}}>{v}</div>
                    <div className="mono" style={{fontSize:8,color:'var(--mute)',letterSpacing:'.18em'}}>GW{24+i}</div>
                  </div>
                ))}
              </div>
            </div>
            <div style={{background:'var(--ink-2)',border:'1px solid var(--rule)',padding:'14px 18px',display:'flex',flexDirection:'column',gap:6}}>
              <div className="mono" style={{fontSize:10,color:'var(--mute)',letterSpacing:'.22em'}}>BID STAGE</div>
              <div style={{display:'flex',alignItems:'baseline',gap:14,marginTop:4}}>
                <div style={{fontFamily:'Archivo Black',fontSize:44,color:'var(--gold)',letterSpacing:'-0.02em'}}>£13.5m</div>
                <span style={{fontFamily:'Archivo Black',fontSize:13,color:'var(--positive)'}}>+0.5 vs prev</span>
              </div>
              <div className="mono" style={{fontSize:9,color:'var(--mute)',letterSpacing:'.16em',marginTop:2}}>9 BIDS · OPENED 09:14 · 3 ACTIVE BIDDERS</div>
              <hr className="fk-rule" style={{margin:'10px 0'}}/>
              <div className="mono" style={{fontSize:10,color:'var(--mute)',letterSpacing:'.22em'}}>YOUR NEXT BID</div>
              <div style={{display:'flex',gap:8,alignItems:'center',marginTop:6}}>
                <button onClick={()=>setBid(b=>Math.max(14,b-0.5))} style={bidStep}>−0.5</button>
                <input type="text" value={`£${bid.toFixed(1)}m`} onChange={()=>{}} style={{
                  flex:1,padding:'10px 12px',background:'var(--ink)',border:'1px solid var(--cyan)',color:'var(--paper)',
                  fontFamily:'Archivo Black,sans-serif',fontSize:18,textAlign:'center',
                }}/>
                <button onClick={()=>setBid(b=>b+0.5)} style={bidStep}>+0.5</button>
              </div>
              <button style={{
                marginTop:10,background:'var(--cyan)',color:'var(--ink)',border:0,
                padding:'12px 18px',fontFamily:'Archivo Black,sans-serif',fontSize:13,letterSpacing:'.18em',cursor:'pointer',
              }}>PLACE BID £{bid.toFixed(1)}M →</button>
            </div>
          </div>

          {/* Bid history */}
          <div>
            <div className="mono" style={{fontSize:10,color:'var(--gold)',letterSpacing:'.22em',marginBottom:8}}>│ BID HISTORY · NEWEST LAST</div>
            <div style={{border:'1px solid var(--rule)',background:'var(--ink-2)'}}>
              {d.history.map((h,i) => {
                const m = lhMgrById(h.who);
                const isYou = h.who === 'you';
                return (
                  <div key={i} style={{
                    display:'grid',gridTemplateColumns:'70px auto 1fr auto auto',gap:14,padding:'10px 14px',
                    borderTop:i?'1px solid var(--rule)':'none',alignItems:'center',
                    background:isYou?'rgba(0,180,216,.06)':'transparent',
                  }}>
                    <span className="mono" style={{fontSize:10,color:'var(--mute)',letterSpacing:'.14em'}}>{h.t}</span>
                    <MgrTag id={h.who}/>
                    <span style={{fontFamily:'Archivo Black',fontSize:12,color:isYou?'var(--cyan)':'var(--paper)'}}>{isYou?'You':m.name}</span>
                    {h.note && <span className="mono" style={{fontSize:9,color:'var(--gold)',letterSpacing:'.16em'}}>· {h.note}</span>}
                    <span style={{fontFamily:'Archivo Black',fontSize:14,color:'var(--gold)',textAlign:'right'}}>£{h.amt.toFixed(1)}m</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right: peers + auto-bid */}
        <aside style={{padding:'22px 22px',display:'flex',flexDirection:'column',gap:18,background:'var(--ink-2)',minHeight:0,overflow:'auto'}}>
          <div>
            <div className="mono" style={{fontSize:10,color:'var(--mute)',letterSpacing:'.22em'}}>BIDDERS · 3 ACTIVE</div>
            <div style={{display:'flex',flexDirection:'column',gap:8,marginTop:10}}>
              {[
                { id:'ade', max:'14.0', bids:3, leading:true },
                { id:'rai', max:'13.5', bids:3, leading:false },
                { id:'kai', max:'10.5', bids:2, leading:false },
                { id:'you', max:'12.0', bids:1, leading:false },
              ].map(p => (
                <div key={p.id} style={{
                  display:'grid',gridTemplateColumns:'auto 1fr auto auto',gap:10,padding:'8px 12px',
                  border:'1px solid var(--rule)',background:'var(--ink)',alignItems:'center',
                  borderLeft:p.leading?'2px solid var(--positive)':'2px solid transparent',
                }}>
                  <MgrTag id={p.id}/>
                  <span style={{fontFamily:'Archivo Black',fontSize:12,color:p.id==='you'?'var(--cyan)':'var(--paper)'}}>{p.id==='you'?'You':lhMgrById(p.id).name}</span>
                  <span className="mono" style={{fontSize:10,color:'var(--mute)',letterSpacing:'.14em'}}>{p.bids} BIDS</span>
                  <span style={{fontFamily:'Archivo Black',fontSize:12,color:p.leading?'var(--positive)':'var(--mute)'}}>£{p.max}m</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{padding:'14px 16px',background:'var(--ink)',border:'1px solid var(--rule)'}}>
            <div className="mono" style={{fontSize:10,color:'var(--purple)',letterSpacing:'.22em'}}>AUTO-BID · SAFE MAX</div>
            <div style={{fontFamily:'Archivo,sans-serif',fontSize:12,color:'var(--paper)',marginTop:8,lineHeight:1.5}}>
              Set a ceiling. We'll counter-bid up to your max in £0.5m steps when somebody outbids you. Stops the moment your budget would be busted.
            </div>
            <div style={{display:'flex',gap:8,alignItems:'center',marginTop:10}}>
              <input type="text" defaultValue="£15.0m" style={{
                flex:1,padding:'8px 10px',background:'var(--ink-2)',border:'1px solid var(--rule)',color:'var(--paper)',
                fontFamily:'Archivo Black,sans-serif',fontSize:14,textAlign:'center',
              }}/>
              <button style={{
                background:'transparent',color:'var(--purple)',border:'1px solid var(--purple)55',
                padding:'8px 12px',fontFamily:'JetBrains Mono,monospace',fontSize:10,letterSpacing:'.18em',cursor:'pointer',
              }}>ARM →</button>
            </div>
          </div>

          <div className="mono" style={{fontSize:9,color:'var(--mute)',letterSpacing:'.16em',lineHeight:1.55}}>
            ANTI-SNIPE · ANY BID IN THE FINAL 30s ADDS 30s TO THE CLOCK. KEEP REFRESHING IS A STRATEGY, BUT AUTO-BID PROBABLY BEATS IT.
          </div>
        </aside>
      </div>
    </div>
  );
}

const bidStep = {
  background:'transparent',color:'var(--mute)',border:'1px solid var(--rule)',
  padding:'10px 12px',fontFamily:'JetBrains Mono,monospace',fontSize:11,letterSpacing:'.14em',cursor:'pointer',
};

window.AuctionsTab = AuctionsTab;
window.AuctionDetailScreen = AuctionDetailScreen;
