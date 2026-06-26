/* global React, MARKET, STATUS_COLOR, CLUB_COLOR, CLUB_INK */

// Shared sidebar (vertical nav) — desktop chrome harmonized across screens.
function SideNav({active='market'}){
  const items = [
    {id:'scores',  label:'Scores'},
    {id:'squad',   label:'My Squad'},
    {id:'league',  label:'League'},
    {id:'live',    label:'Live', dot:true},
    {id:'market',  label:'Market'},
  ];
  return (
    <aside style={{
      width:220,flexShrink:0,
      background:'var(--ink-2)',
      borderRight:'1px solid var(--rule)',
      display:'flex',flexDirection:'column',
      padding:'20px 0',
    }}>
      <div style={{padding:'0 22px 24px'}}>
        <div className="mono" style={{fontSize:9,color:'var(--mute)'}}>FANTASY FOOTBALL</div>
        <div className="display" style={{fontSize:22,marginTop:6}}>FORZA<span style={{color:'var(--cyan)'}}>KIT</span></div>
        <div className="mono" style={{fontSize:9,color:'var(--mute)',marginTop:4}}>FANTASY LEAGUE</div>
      </div>
      <nav style={{display:'flex',flexDirection:'column'}}>
        {items.map(it => (
          <div key={it.id} style={{
            padding:'12px 22px',
            display:'flex',alignItems:'center',justifyContent:'space-between',
            color:active===it.id?'var(--cyan)':'var(--paper)',
            background:active===it.id?'rgba(0,180,216,.08)':'transparent',
            borderLeft:active===it.id?'2px solid var(--cyan)':'2px solid transparent',
            fontFamily:'Archivo',fontSize:14,fontWeight:active===it.id?600:500,
          }}>
            <span>{it.label}</span>
            {it.dot && <span style={{width:6,height:6,borderRadius:'50%',background:'var(--danger)'}}/>}
          </div>
        ))}
      </nav>
      <div style={{marginTop:'auto',padding:'16px 22px'}} className="mono">
        <div style={{fontSize:9,color:'var(--mute)'}}>ALPHA V0.1 · FORZA</div>
        <div style={{fontSize:9,color:'var(--mute)',marginTop:2}}>{'{}'} BUILT IN PUBLIC</div>
      </div>
    </aside>
  );
}

// ─── DESKTOP: HYBRID SQUAD ───────────────────────────────────
function FinalSquadDesktop(){
  return (
    <div style={{display:'flex',width:'100%',height:'100%',background:'var(--ink)',color:'var(--paper)',fontFamily:'Archivo,sans-serif'}}>
      <SideNav active="squad"/>
      <main style={{flex:1,display:'flex',flexDirection:'column',minWidth:0}}>
        {/* Header */}
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-end',padding:'24px 32px 16px',borderBottom:'1px solid var(--rule)'}}>
          <div>
            <div className="mono" style={{fontSize:10,color:'var(--mute)'}}>TACTICAL SHEET</div>
            <div className="display" style={{fontSize:34,marginTop:4}}>My Squad</div>
          </div>
          <div style={{display:'flex',gap:32,alignItems:'flex-end'}}>
            <div style={{textAlign:'right'}}>
              <div className="mono" style={{fontSize:9,color:'var(--mute)'}}>SQUAD</div>
              <div style={{fontFamily:'Archivo Black',fontSize:20,marginTop:2}}>15<span style={{color:'var(--mute)',fontFamily:'JetBrains Mono',fontSize:11,marginLeft:6}}>/15</span></div>
            </div>
            <div style={{textAlign:'right'}}>
              <div className="mono" style={{fontSize:9,color:'var(--mute)'}}>BUDGET</div>
              <div style={{fontFamily:'Archivo Black',fontSize:20,color:'var(--cyan)',marginTop:2}}>£3.2M</div>
            </div>
          </div>
        </div>
        {/* Sub-tabs */}
        <div style={{display:'flex',gap:24,padding:'14px 32px',borderBottom:'1px solid var(--rule)'}}>
          {['PITCH','BENCH','CHIPS','STATUS'].map((t,i) => (
            <div key={t} className="mono" style={{
              fontSize:11,letterSpacing:'.18em',paddingBottom:6,position:'relative',
              color:i===0?'var(--paper)':'var(--mute)',
            }}>
              {t}{t==='STATUS' && <span style={{display:'inline-block',width:5,height:5,borderRadius:'50%',background:'var(--danger)',marginLeft:6,verticalAlign:'middle'}}/>}
              {i===0 && <span style={{position:'absolute',left:0,right:0,bottom:-15,height:2,background:'var(--cyan)'}}/>}
            </div>
          ))}
        </div>
        {/* Pitch area — Hybrid */}
        <div style={{flex:1,position:'relative',padding:'28px 40px 32px',background:'#08090C'}}>
          <div style={{position:'absolute',inset:'28px 40px 32px',background:'linear-gradient(180deg, #0E1218 0%, #0A0D12 100%)',borderRadius:8,overflow:'hidden',boxShadow:'inset 0 0 0 1px var(--rule)'}}>
            {[22,46,70,92].map(y => <div key={y} style={{position:'absolute',left:24,right:24,top:`${y}%`,height:1,background:'rgba(0,180,216,.10)'}}/>)}
            {[
              {y:22,label:'FWD'},{y:46,label:'MID'},{y:70,label:'DEF'},{y:92,label:'GK'}
            ].map(l => (
              <div key={l.label} className="mono" style={{position:'absolute',left:18,top:`${l.y}%`,transform:'translateY(-50%)',fontSize:9,color:'rgba(0,180,216,.5)',background:'#0A0D12',padding:'2px 4px'}}>{l.label}</div>
            ))}
            <div style={{position:'absolute',left:'10%',right:'10%',top:'50%',height:1,background:'rgba(242,238,229,.08)'}}/>
            <div style={{position:'absolute',left:'50%',top:'50%',transform:'translate(-50%,-50%)',width:160,height:160,borderRadius:'50%',border:'1px solid rgba(242,238,229,.06)'}}/>
            <div style={{position:'absolute',top:14,left:18,right:18,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <div className="mono" style={{fontSize:10,color:'var(--mute)',letterSpacing:'.22em'}}>STARTING XI · 4-3-3</div>
              <div className="mono" style={{fontSize:10,color:'var(--mute)',letterSpacing:'.22em'}}>GW 12 · VS RIVALS FC</div>
            </div>
            {SQUAD.map(p => <HybridTokFinal key={p.id} p={p}/>)}
          </div>
        </div>
      </main>
    </div>
  );
}

function HybridTokFinal({p}){
  const sc = STATUS_COLOR[p.status];
  return (
    <div style={{
      position:'absolute',
      left:`${p.x}%`, top:`${p.y}%`,
      transform:'translate(-50%,-50%)',
      display:'flex',alignItems:'center',gap:10,
      padding:'8px 12px 8px 10px',
      background:'rgba(15,18,24,.92)',
      backdropFilter:'blur(4px)',
      border:'1px solid var(--rule)',
      borderRadius:4,
      minWidth:148,
    }}>
      <div style={{
        width:36,height:36,
        background:p.cap?'var(--gold)':'transparent',
        border:`1.5px solid ${p.cap?'var(--gold)':'var(--cyan)'}`,
        color:p.cap?'#0A0A0A':'var(--cyan)',
        fontFamily:'Archivo Black',fontSize:14,
        display:'flex',alignItems:'center',justifyContent:'center',
        flexShrink:0,
      }}>{p.no}</div>
      <div style={{flex:1,minWidth:0}}>
        <div style={{display:'flex',alignItems:'center',gap:6}}>
          <div style={{width:7,height:7,borderRadius:'50%',background:sc,flexShrink:0}}/>
          <span style={{fontFamily:'Archivo Black',fontSize:13,letterSpacing:'-0.01em',textTransform:'uppercase',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{p.last}</span>
        </div>
        <div className="mono" style={{fontSize:9,color:'var(--mute)',letterSpacing:'.14em',marginTop:2}}>{p.club} · {p.pts} PTS</div>
      </div>
      {p.cap && <div style={{position:'absolute',top:-7,right:-7,width:18,height:18,borderRadius:'50%',background:'var(--gold)',color:'#0A0A0A',fontFamily:'Archivo Black',fontSize:9,display:'flex',alignItems:'center',justifyContent:'center',border:'2px solid var(--ink)'}}>C</div>}
    </div>
  );
}

window.FinalSquadDesktop = FinalSquadDesktop;
window.SideNav = SideNav;
