/* global React, LH_FRONTPAGE,
   PhoneShell, AppTopbar, HubLeagueHeader, HubTabPills, MobSection */

const FT_PAPER = '#F2EEE5';
const FT_INK   = '#0A0E14';
const FT_RULE  = '#D8D2C6';
const FT_MUTE  = '#5A6470';
const FT_RED   = '#B0271E';

const ftSerif = "'Playfair Display', 'Times New Roman', serif";
const ftMono  = "'JetBrains Mono', monospace";

// ──────────────────────────────────────────────────────────────────
// MOBILE · FRONTPAGE — Forza Times, phone-format newspaper.
// Keep the print aesthetic (cream paper, serif, mono kickers)
// but stack everything to one column.
// ──────────────────────────────────────────────────────────────────

function MobFrontpage(){
  const fp = LH_FRONTPAGE;
  return (
    <PhoneShell>
      <AppTopbar/>
      <HubLeagueHeader/>
      <HubTabPills active="frontpage"/>

      {/* Dark frame, paper sheet inside */}
      <div style={{flex:1,overflow:'auto',padding:'14px 12px',background:'var(--ink)'}}>
        <div style={{
          background:FT_PAPER,color:FT_INK,
          padding:'22px 18px 16px',
          boxShadow:'0 20px 40px -10px rgba(0,0,0,.6)',
          position:'relative',
        }}>
          {/* Masthead — compressed for phone */}
          <div style={{display:'flex',justifyContent:'space-between',fontFamily:ftMono,fontSize:8,letterSpacing:'.16em',color:FT_INK}}>
            <span>VOL · {fp.vol}</span>
            <span>ED · #{fp.edition}</span>
          </div>
          <div style={{textAlign:'center',marginTop:4}}>
            <div style={{fontFamily:ftSerif,fontStyle:'italic',fontWeight:900,fontSize:42,letterSpacing:'-0.03em',lineHeight:0.9,color:FT_INK}}>FORZA TIMES</div>
            <div style={{fontFamily:ftSerif,fontStyle:'italic',fontSize:10,color:FT_MUTE,marginTop:4}}>{fp.date}</div>
          </div>
          <hr style={{border:0,height:1,background:FT_INK,margin:'10px 0 1px'}}/>
          <hr style={{border:0,height:3,background:FT_INK,margin:'0 0 14px'}}/>

          {/* Lead story */}
          <div style={{fontFamily:ftMono,fontSize:8,letterSpacing:'.2em',color:FT_RED}}>{fp.lead.kicker}</div>
          <h1 style={{fontFamily:ftSerif,fontWeight:900,fontSize:30,lineHeight:1,letterSpacing:'-0.02em',color:FT_INK,marginTop:6,textWrap:'balance'}}>{fp.lead.headline}</h1>

          {/* Lead photo */}
          <div style={{
            marginTop:12,height:140,position:'relative',overflow:'hidden',
            background:`repeating-linear-gradient(135deg, ${FT_INK} 0 1px, transparent 1px 12px), #D6CFBF`,
            border:`1px solid ${FT_INK}`,
            display:'flex',alignItems:'center',justifyContent:'center',
          }}>
            <span style={{fontFamily:ftMono,fontSize:8,letterSpacing:'.22em',color:FT_INK,background:FT_PAPER,padding:'3px 6px',border:`1px solid ${FT_INK}`}}>LEAD PHOTO</span>
          </div>

          <p style={{fontFamily:ftSerif,fontSize:14,lineHeight:1.45,color:FT_INK,marginTop:12,textWrap:'pretty'}}>
            <span style={{
              float:'left',fontFamily:ftSerif,fontWeight:900,fontSize:42,lineHeight:0.85,
              paddingRight:6,paddingTop:2,color:FT_INK,
            }}>{(fp.lead.deck[0]||'').toUpperCase()}</span>
            {fp.lead.deck.slice(1)}
          </p>
          <div style={{fontFamily:ftMono,fontSize:8,letterSpacing:'.18em',color:FT_MUTE,marginTop:10,textTransform:'uppercase'}}>{fp.lead.byline}</div>

          <hr style={{border:0,height:1,background:FT_INK,margin:'18px 0 14px'}}/>

          {/* Standings box */}
          <div style={{border:`2px solid ${FT_INK}`,padding:'10px 12px',background:'#EFEAE0',marginBottom:18}}>
            <div style={{fontFamily:ftMono,fontSize:8,letterSpacing:'.22em',color:FT_INK}}>STANDINGS · GW28</div>
            <div style={{fontFamily:ftSerif,fontWeight:900,fontStyle:'italic',fontSize:16,color:FT_INK,marginTop:2,letterSpacing:'-0.02em'}}>Table at a glance</div>
            <table style={{width:'100%',marginTop:6,borderCollapse:'collapse',fontFamily:ftMono,fontSize:10,color:FT_INK}}>
              <tbody>
                {[
                  { r:1, name:'Bezerra United', pts:1024, mv:'=' },
                  { r:2, name:'Lagos Tide',     pts:1011, mv:'▲1' },
                  { r:3, name:'Equator Express',pts: 998, mv:'▼1' },
                  { r:4, name:'Storks Albion',  pts: 982, mv:'▲2' },
                  { r:5, name:'Tagus Reserves', pts: 947, mv:'=' },
                  { r:6, name:'You',            pts: 931, mv:'▼2' },
                ].map(r => (
                  <tr key={r.r} style={{borderTop:r.r===1?'none':`1px solid ${FT_RULE}`}}>
                    <td style={{padding:'4px 2px',width:14}}>{r.r}</td>
                    <td style={{padding:'4px 2px',fontFamily:ftSerif,fontSize:11,letterSpacing:0}}>{r.name}</td>
                    <td style={{padding:'4px 2px',textAlign:'right',fontWeight:600}}>{r.pts}</td>
                    <td style={{padding:'4px 2px',textAlign:'right',color:r.mv.startsWith('▲')?'#2A7D3F':r.mv.startsWith('▼')?FT_RED:FT_MUTE,width:24}}>{r.mv}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Secondary stories — stacked */}
          {fp.stories.slice(0,3).map((s,i) => (
            <article key={s.id} style={{paddingBottom:i<2?14:0,borderBottom:i<2?`1px solid ${FT_RULE}`:'none',marginBottom:i<2?14:0}}>
              <div style={{fontFamily:ftMono,fontSize:8,letterSpacing:'.22em',color:FT_RED}}>{s.kicker}</div>
              <h2 style={{fontFamily:ftSerif,fontWeight:800,fontSize:20,lineHeight:1.05,letterSpacing:'-0.02em',color:FT_INK,marginTop:4,textWrap:'balance'}}>{s.headline}</h2>
              <p style={{fontFamily:ftSerif,fontSize:13,lineHeight:1.5,color:FT_INK,marginTop:6,textWrap:'pretty'}}>{s.deck}</p>
              <div style={{fontFamily:ftMono,fontSize:8,letterSpacing:'.18em',color:FT_MUTE,marginTop:6,textTransform:'uppercase'}}>{s.byline}</div>
            </article>
          ))}

          <hr style={{border:0,height:1,background:FT_INK,margin:'18px 0 12px'}}/>

          {/* Pull-quote */}
          <div style={{paddingLeft:12,borderLeft:`3px solid ${FT_INK}`,marginBottom:18}}>
            <div style={{fontFamily:ftMono,fontSize:8,letterSpacing:'.22em',color:FT_RED}}>QUOTE · LEAGUE CHAT</div>
            <blockquote style={{fontFamily:ftSerif,fontStyle:'italic',fontSize:18,lineHeight:1.2,color:FT_INK,marginTop:4,textWrap:'pretty'}}>
              “Forza Times says I’m back on top. Quote me on that.”
            </blockquote>
            <div style={{fontFamily:ftMono,fontSize:8,letterSpacing:'.18em',color:FT_MUTE,marginTop:6,textTransform:'uppercase'}}>— Raï Bezerra · 10:33</div>
          </div>

          {/* Classifieds */}
          <div style={{fontFamily:ftMono,fontSize:8,letterSpacing:'.22em',color:FT_INK,paddingBottom:6,borderBottom:`2px solid ${FT_INK}`}}>CLASSIFIEDS</div>
          <div style={{display:'flex',flexDirection:'column',gap:6,marginTop:8}}>
            {fp.classified.map(it => (
              <div key={it.id} style={{padding:'6px 0',borderBottom:`1px dashed ${FT_RULE}`}}>
                <span style={{fontFamily:ftMono,fontSize:8,letterSpacing:'.2em',color:FT_RED,marginRight:6}}>{it.tag}</span>
                <span style={{fontFamily:ftSerif,fontSize:11,color:FT_INK,lineHeight:1.4}}>{it.text}</span>
                <div style={{fontFamily:ftMono,fontSize:8,letterSpacing:'.18em',color:FT_MUTE,marginTop:2}}>— {it.from}</div>
              </div>
            ))}
          </div>

          {/* Colophon */}
          <div style={{display:'flex',justifyContent:'space-between',fontFamily:ftMono,fontSize:7,letterSpacing:'.2em',color:FT_MUTE,marginTop:14}}>
            <span>EDITED BY THE DESK</span>
            <span>P. 01 OF 04</span>
          </div>
        </div>
      </div>
    </PhoneShell>
  );
}

// ──────────────────────────────────────────────────────────────────
// MOBILE · ARTICLE drill-in
// ──────────────────────────────────────────────────────────────────

function MobArticle(){
  return (
    <PhoneShell>
      <AppTopbar/>
      <HubLeagueHeader backable title="FORZA TIMES · #5"/>
      <div style={{flex:1,overflow:'auto',padding:'14px 12px',background:'var(--ink)'}}>
        <div style={{background:FT_PAPER,color:FT_INK,padding:'24px 18px',boxShadow:'0 20px 40px -10px rgba(0,0,0,.6)'}}>
          <div style={{fontFamily:ftMono,fontSize:9,letterSpacing:'.22em',color:FT_RED}}>MATCH REPORT · GW28</div>
          <h1 style={{fontFamily:ftSerif,fontWeight:900,fontSize:36,lineHeight:0.98,letterSpacing:'-0.025em',color:FT_INK,marginTop:8,textWrap:'balance'}}>
            Bezerra strikes late, retakes the throne.
          </h1>
          <p style={{fontFamily:ftSerif,fontStyle:'italic',fontSize:14,lineHeight:1.4,color:FT_MUTE,marginTop:10,textWrap:'pretty'}}>
            Three goals from his back four and a Haaland brace clinch a 78-point Saturday for the table-topper.
          </p>
          <div style={{fontFamily:ftMono,fontSize:9,letterSpacing:'.18em',color:FT_MUTE,marginTop:8,textTransform:'uppercase'}}>By the Forza Times Desk · 11 min read</div>

          <div style={{
            marginTop:16,height:200,position:'relative',overflow:'hidden',
            background:`repeating-linear-gradient(135deg, ${FT_INK} 0 1px, transparent 1px 12px), #D6CFBF`,
            border:`1px solid ${FT_INK}`,
            display:'flex',alignItems:'center',justifyContent:'center',
          }}>
            <span style={{fontFamily:ftMono,fontSize:9,letterSpacing:'.22em',color:FT_INK,background:FT_PAPER,padding:'3px 6px',border:`1px solid ${FT_INK}`}}>LEAD PHOTO</span>
          </div>
          <div style={{fontFamily:ftSerif,fontStyle:'italic',fontSize:11,color:FT_MUTE,marginTop:6}}>Photo · league-supplied · placeholder.</div>

          <p style={{fontFamily:ftSerif,fontSize:15,lineHeight:1.55,color:FT_INK,marginTop:18,textWrap:'pretty'}}>
            <span style={{float:'left',fontFamily:ftSerif,fontWeight:900,fontSize:46,lineHeight:0.85,paddingRight:6,paddingTop:2,color:FT_INK}}>T</span>
            he table-topper rolled out a 4-3-3 with the kind of conviction that suggested the Haaland captaincy was never really up for debate. By the time Mings nodded in at the far post, Bezerra United had already banked twenty-four points before halftime.
          </p>
          <p style={{fontFamily:ftSerif,fontSize:15,lineHeight:1.55,color:FT_INK,marginTop:14,textWrap:'pretty'}}>
            Across town, Storks Albion needed a Palmer hat-trick — and almost got it. Adelaide's gamble on the Triple Captain chip will pay her back in chatter for weeks, even if the two-point margin says it didn't quite land.
          </p>
          <p style={{fontFamily:ftSerif,fontSize:15,lineHeight:1.55,color:FT_INK,marginTop:14,textWrap:'pretty'}}>
            The losers of the weekend, if we're being honest, were the conservative middle of the table. Six managers banked under 50 points.
          </p>

          <hr style={{border:0,height:1,background:FT_RULE,margin:'20px 0'}}/>
          <div style={{fontFamily:ftMono,fontSize:9,letterSpacing:'.22em',color:FT_INK}}>
            ⏵ NEXT · &ldquo;Why we should ban the Triple Captain after GW10&rdquo;
          </div>
        </div>
      </div>
    </PhoneShell>
  );
}

window.MobFrontpage = MobFrontpage;
window.MobArticle = MobArticle;
