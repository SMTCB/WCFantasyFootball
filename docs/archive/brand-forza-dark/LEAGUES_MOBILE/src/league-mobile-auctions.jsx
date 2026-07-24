/* global React, LH_AUCTIONS, LH_AUCTION_DETAIL, lhMgrById,
   PhoneShell, AppTopbar, HubLeagueHeader, HubTabPills, MobSection, MgrTag */

const posTone = { GK:'#A855F7', DEF:'#00B4D8', MID:'#E0A800', FWD:'#EF4444' };

// ──────────────────────────────────────────────────────────────────
// MOBILE · AUCTIONS
// ──────────────────────────────────────────────────────────────────

function MobAuctions(){
  const live     = LH_AUCTIONS.filter(a => a.state === 'live');
  const starting = LH_AUCTIONS.filter(a => a.state === 'starting');
  const blocked  = LH_AUCTIONS.filter(a => a.state === 'blocked');
  const resolved = LH_AUCTIONS.filter(a => a.state === 'resolved');

  return (
    <PhoneShell>
      <AppTopbar/>
      <HubLeagueHeader/>
      <HubTabPills active="auctions"/>

      <div style={{flex:1,overflow:'auto'}}>
        {/* Hero */}
        <div style={{padding:'14px 18px 12px',borderBottom:'1px solid var(--rule)'}}>
          <div className="mono" style={{fontSize:9,color:'var(--gold)',letterSpacing:'.22em'}}>AUCTION HOUSE</div>
          <div className="display" style={{fontSize:22,marginTop:4}}>Open bids close every hour.</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:6,marginTop:12}}>
            {[
              {k:'LIVE',v:live.length,t:'var(--danger)'},
              {k:'NEXT',v:starting.length,t:'var(--gold)'},
              {k:'BLKD',v:blocked.length,t:'var(--mute)'},
              {k:'£m',v:'27.5',t:'var(--cyan)'},
            ].map(c => (
              <div key={c.k} style={{padding:'8px',background:'var(--ink-2)',border:'1px solid var(--rule)'}}>
                <div className="mono" style={{fontSize:8,color:'var(--mute)',letterSpacing:'.2em'}}>{c.k}</div>
                <div style={{fontFamily:'Archivo Black',fontSize:18,color:c.t,marginTop:4}}>{c.v}</div>
              </div>
            ))}
          </div>
        </div>

        <MobSection label="LIVE · CLOSING SOON" tone="var(--danger)"/>
        {live.map(a => <MobAuctionCard key={a.id} a={a} mine={a.id==='au2'}/>)}

        <MobSection label="STARTING · OPENS LATER" tone="var(--gold)"/>
        {starting.map(a => <MobAuctionCard key={a.id} a={a} starting/>)}

        <MobSection label="BLOCKED · ALREADY OWNED" tone="var(--mute)"
          sub="LEAGUE EXCLUSIVE"/>
        <div style={{padding:'0 18px 10px',display:'flex',flexDirection:'column',gap:8}}>
          {blocked.map(a => (
            <div key={a.id} style={{
              padding:'10px 12px',background:'var(--ink-2)',border:'1px solid var(--rule)',
              position:'relative',overflow:'hidden',
              display:'flex',gap:10,alignItems:'center',
            }}>
              <div style={{position:'absolute',inset:0,background:'repeating-linear-gradient(135deg, rgba(139,149,161,.04) 0 6px, transparent 6px 12px)',pointerEvents:'none'}}/>
              <span style={{
                position:'relative',
                fontFamily:'Archivo Black',fontSize:10,
                padding:'2px 5px',background:`${posTone[a.pos]}18`,color:posTone[a.pos],border:`1px solid ${posTone[a.pos]}55`,letterSpacing:'.1em',
              }}>{a.pos}</span>
              <div style={{flex:1,minWidth:0,position:'relative'}}>
                <div style={{fontFamily:'Archivo Black',fontSize:13,letterSpacing:'-0.01em'}}>{a.player}</div>
                <div className="mono" style={{fontSize:8,color:'var(--mute)',letterSpacing:'.16em',marginTop:2}}>{a.club} · OWNED BY {lhMgrById(a.ownedBy).name.toUpperCase()}</div>
              </div>
              <div style={{position:'relative'}}><MgrTag id={a.ownedBy} size={20}/></div>
            </div>
          ))}
        </div>

        <MobSection label="RECENT GAVELS" tone="var(--mute)"/>
        <div style={{padding:'0 18px 14px',display:'flex',flexDirection:'column',gap:6}}>
          {resolved.map(a => (
            <div key={a.id} style={{display:'grid',gridTemplateColumns:'auto 1fr auto auto',gap:8,padding:'8px 10px',border:'1px solid var(--rule)',background:'var(--ink)',alignItems:'center'}}>
              <span style={{
                fontFamily:'Archivo Black',fontSize:10,
                padding:'2px 5px',background:`${posTone[a.pos]}18`,color:posTone[a.pos],border:`1px solid ${posTone[a.pos]}55`,letterSpacing:'.1em',
              }}>{a.pos}</span>
              <span style={{fontFamily:'Archivo Black',fontSize:12,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{a.player}</span>
              <MgrTag id={a.ownedBy} size={18}/>
              <span style={{fontFamily:'Archivo Black',fontSize:12,color:'var(--gold)'}}>£{a.current.toFixed(1)}</span>
            </div>
          ))}
        </div>

        <div style={{height:24}}/>
      </div>
    </PhoneShell>
  );
}

function MobAuctionCard({a, mine, starting}){
  const t = posTone[a.pos];
  const isLeading = a.leader === 'you';
  return (
    <div style={{
      margin:'0 18px 8px',background:'var(--ink-2)',border:'1px solid var(--rule)',
      borderLeft:`3px solid ${starting?'var(--gold)':isLeading?'var(--positive)':t}`,
      padding:'10px 12px',display:'flex',flexDirection:'column',gap:8,
    }}>
      {/* Header row */}
      <div style={{display:'flex',alignItems:'center',gap:8}}>
        <span style={{
          fontFamily:'Archivo Black',fontSize:10,
          padding:'2px 5px',background:`${t}18`,color:t,border:`1px solid ${t}55`,letterSpacing:'.1em',
        }}>{a.pos}</span>
        <span style={{fontFamily:'Archivo Black',fontSize:14,letterSpacing:'-0.01em',flex:1}}>{a.player}</span>
        {!starting && (
          <span style={{fontFamily:'JetBrains Mono,monospace',fontSize:9,letterSpacing:'.16em',color:'var(--danger)'}}>● {a.closes}</span>
        )}
      </div>
      <div className="mono" style={{fontSize:9,color:'var(--mute)',letterSpacing:'.16em'}}>{a.club} · OPENED BY {a.open || '—'}</div>

      {/* Stats row */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
        <div>
          <div className="mono" style={{fontSize:8,color:'var(--mute)',letterSpacing:'.2em'}}>CURRENT</div>
          <div style={{fontFamily:'Archivo Black',fontSize:18,color:'var(--gold)',marginTop:2}}>£{a.current.toFixed(1)}m</div>
        </div>
        <div>
          <div className="mono" style={{fontSize:8,color:'var(--mute)',letterSpacing:'.2em'}}>{starting?'OPENS':'LEADING'}</div>
          {a.leader ? (
            <div style={{display:'flex',alignItems:'center',gap:6,marginTop:2}}>
              <MgrTag id={a.leader} size={18}/>
              <span style={{fontFamily:'Archivo Black',fontSize:11,color:isLeading?'var(--positive)':'var(--paper)'}}>{isLeading?'YOU':lhMgrById(a.leader).name.split(' ')[0]}</span>
            </div>
          ) : (
            <div style={{fontFamily:'Archivo Black',fontSize:13,color:'var(--mute)',marginTop:2}}>{a.closes}</div>
          )}
        </div>
      </div>

      {/* CTA */}
      {!starting && (
        <button style={{
          background: isLeading ? 'transparent' : 'var(--cyan)',
          color: isLeading ? 'var(--cyan)' : 'var(--ink)',
          border: isLeading ? '1px solid var(--cyan)' : 'none',
          padding:'10px',fontFamily:'Archivo Black,sans-serif',fontSize:11,letterSpacing:'.18em',cursor:'pointer',
        }}>{isLeading ? 'EDIT YOUR MAX →' : 'BID £' + (a.current + 0.5).toFixed(1) + 'M →'}</button>
      )}
      {starting && (
        <button style={{
          background:'transparent',color:'var(--gold)',border:'1px solid var(--gold)55',
          padding:'10px',fontFamily:'JetBrains Mono,monospace',fontSize:10,letterSpacing:'.2em',cursor:'pointer',
        }}>WATCH · NOTIFY ME →</button>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// MOBILE · AUCTION DETAIL drill-in
// ──────────────────────────────────────────────────────────────────

function MobAuctionDetail(){
  const d = LH_AUCTION_DETAIL;
  const [bid, setBid] = React.useState(14.0);
  const t = posTone[d.pos];
  return (
    <PhoneShell>
      <AppTopbar/>
      <HubLeagueHeader backable title={`AUCTION · ${d.player}`}/>

      <div style={{padding:'10px 18px',background:'rgba(239,68,68,.06)',borderBottom:'1px solid var(--rule)',display:'flex',justifyContent:'space-between'}}>
        <span style={{display:'inline-flex',alignItems:'center',gap:6}}>
          <span style={{width:7,height:7,borderRadius:'50%',background:'var(--danger)',animation:'fkPulse 1.4s ease-in-out infinite'}}/>
          <span className="mono" style={{fontSize:10,color:'var(--danger)',letterSpacing:'.22em'}}>LIVE</span>
        </span>
        <span className="mono" style={{fontSize:10,color:'var(--danger)',letterSpacing:'.22em'}}>CLOSES 12m 04s</span>
      </div>

      <div style={{flex:1,overflow:'auto'}}>
        {/* Player hero */}
        <div style={{padding:'14px 18px',borderBottom:'1px solid var(--rule)'}}>
          <div style={{display:'flex',alignItems:'flex-end',gap:10}}>
            <span style={{
              fontFamily:'Archivo Black',fontSize:11,
              padding:'3px 6px',background:`${t}18`,color:t,border:`1px solid ${t}66`,letterSpacing:'.12em',
            }}>{d.pos}</span>
            <div className="display" style={{fontSize:30}}>{d.player}</div>
          </div>
          <div className="mono" style={{fontSize:9,color:'var(--mute)',marginTop:6,letterSpacing:'.16em'}}>{d.club} · AGE {d.age} · SEL {d.selectedBy} · {d.totalPts} PTS SEASON</div>

          {/* Form sparkline */}
          <div style={{display:'flex',justifyContent:'space-between',marginTop:14,padding:'10px',background:'var(--ink-2)',border:'1px solid var(--rule)'}}>
            {d.formGW.map((v,i) => (
              <div key={i} style={{textAlign:'center'}}>
                <div style={{fontFamily:'Archivo Black',fontSize:14,color:v>=20?'var(--gold)':v>=10?'var(--positive)':'var(--paper)'}}>{v}</div>
                <div className="mono" style={{fontSize:8,color:'var(--mute)',letterSpacing:'.16em',marginTop:2}}>GW{24+i}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Bid stage */}
        <div style={{padding:'14px 18px',borderBottom:'1px solid var(--rule)'}}>
          <div className="mono" style={{fontSize:9,color:'var(--gold)',letterSpacing:'.22em'}}>│ CURRENT BID</div>
          <div style={{display:'flex',alignItems:'baseline',gap:12,marginTop:6}}>
            <div style={{fontFamily:'Archivo Black',fontSize:36,color:'var(--gold)'}}>£13.5m</div>
            <span style={{fontFamily:'Archivo Black',fontSize:11,color:'var(--positive)'}}>+0.5</span>
          </div>
          <div className="mono" style={{fontSize:9,color:'var(--mute)',marginTop:4,letterSpacing:'.16em'}}>9 BIDS · 3 ACTIVE BIDDERS</div>

          <div className="mono" style={{fontSize:9,color:'var(--mute)',letterSpacing:'.22em',marginTop:14}}>YOUR NEXT BID</div>
          <div style={{display:'flex',gap:6,alignItems:'center',marginTop:6}}>
            <button onClick={()=>setBid(b=>Math.max(14,b-0.5))} style={bidBtn}>−0.5</button>
            <div style={{flex:1,padding:'10px',background:'var(--ink-2)',border:'1px solid var(--cyan)',textAlign:'center',fontFamily:'Archivo Black,sans-serif',fontSize:18,color:'var(--cyan)'}}>£{bid.toFixed(1)}m</div>
            <button onClick={()=>setBid(b=>b+0.5)} style={bidBtn}>+0.5</button>
          </div>
          <button style={{
            width:'100%',marginTop:10,background:'var(--cyan)',color:'var(--ink)',border:0,
            padding:'12px',fontFamily:'Archivo Black,sans-serif',fontSize:12,letterSpacing:'.18em',cursor:'pointer',
          }}>PLACE BID £{bid.toFixed(1)}M →</button>
        </div>

        {/* Bidders */}
        <MobSection label="BIDDERS · 3 ACTIVE" tone="var(--purple)"/>
        <div style={{padding:'0 18px 14px',display:'flex',flexDirection:'column',gap:6}}>
          {[
            { id:'ade', max:'14.0', bids:3, leading:true },
            { id:'rai', max:'13.5', bids:3, leading:false },
            { id:'kai', max:'10.5', bids:2, leading:false },
            { id:'you', max:'12.0', bids:1, leading:false },
          ].map(p => (
            <div key={p.id} style={{
              display:'grid',gridTemplateColumns:'auto 1fr auto auto',gap:8,padding:'8px 10px',
              border:'1px solid var(--rule)',background:'var(--ink-2)',alignItems:'center',
              borderLeft:p.leading?'2px solid var(--positive)':'2px solid transparent',
            }}>
              <MgrTag id={p.id} size={20}/>
              <span style={{fontFamily:'Archivo Black',fontSize:12,color:p.id==='you'?'var(--cyan)':'var(--paper)'}}>{p.id==='you'?'You':lhMgrById(p.id).name}</span>
              <span className="mono" style={{fontSize:9,color:'var(--mute)',letterSpacing:'.14em'}}>{p.bids} BIDS</span>
              <span style={{fontFamily:'Archivo Black',fontSize:12,color:p.leading?'var(--positive)':'var(--mute)'}}>£{p.max}m</span>
            </div>
          ))}
        </div>

        {/* History */}
        <MobSection label="BID HISTORY" sub="NEWEST LAST" tone="var(--gold)"/>
        <div style={{padding:'0 18px 14px'}}>
          {d.history.slice(-5).map((h,i) => {
            const m = lhMgrById(h.who);
            const isYou = h.who === 'you';
            return (
              <div key={i} style={{
                display:'grid',gridTemplateColumns:'48px auto 1fr auto',gap:8,padding:'8px 0',
                borderBottom:'1px solid var(--rule)',alignItems:'center',
              }}>
                <span className="mono" style={{fontSize:9,color:'var(--mute)',letterSpacing:'.14em'}}>{h.t}</span>
                <MgrTag id={h.who} size={18}/>
                <span style={{fontFamily:'Archivo Black',fontSize:11,color:isYou?'var(--cyan)':'var(--paper)'}}>{isYou?'You':m.name.split(' ')[0]}</span>
                <span style={{fontFamily:'Archivo Black',fontSize:12,color:'var(--gold)'}}>£{h.amt.toFixed(1)}m</span>
              </div>
            );
          })}
        </div>

        {/* Auto-bid */}
        <div style={{margin:'0 18px 18px',padding:'12px',background:'var(--ink-2)',border:'1px solid var(--rule)'}}>
          <div className="mono" style={{fontSize:9,color:'var(--purple)',letterSpacing:'.22em'}}>AUTO-BID · SAFE MAX</div>
          <div style={{fontFamily:'Archivo,sans-serif',fontSize:11,color:'var(--mute)',marginTop:6,lineHeight:1.5}}>
            Set a ceiling. We'll counter-bid in £0.5m steps up to your max.
          </div>
          <div style={{display:'flex',gap:6,alignItems:'center',marginTop:10}}>
            <input type="text" defaultValue="£15.0m" style={{
              flex:1,padding:'8px',background:'var(--ink)',border:'1px solid var(--rule)',color:'var(--paper)',
              fontFamily:'Archivo Black,sans-serif',fontSize:13,textAlign:'center',
            }}/>
            <button style={{
              background:'transparent',color:'var(--purple)',border:'1px solid var(--purple)55',
              padding:'8px 14px',fontFamily:'JetBrains Mono,monospace',fontSize:10,letterSpacing:'.18em',cursor:'pointer',
            }}>ARM →</button>
          </div>
        </div>
      </div>
    </PhoneShell>
  );
}

const bidBtn = {
  background:'transparent',color:'var(--mute)',border:'1px solid var(--rule)',
  padding:'10px 12px',fontFamily:'JetBrains Mono,monospace',fontSize:10,letterSpacing:'.14em',cursor:'pointer',
};

window.MobAuctions = MobAuctions;
window.MobAuctionDetail = MobAuctionDetail;
