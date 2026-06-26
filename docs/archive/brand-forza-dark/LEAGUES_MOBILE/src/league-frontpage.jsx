/* global React, LH_FRONTPAGE, lhMgrById, MgrTag, HubTopbar, HubActionBar, HubTabs */

// ───────────────────────────────────────────────────────────────────
// FRONTPAGE TAB — "Forza Times": newspaper cover layout for the league.
// Cream paper background, serif headlines, mono kickers, ink type.
// ───────────────────────────────────────────────────────────────────

const FT_PAPER = '#F2EEE5';
const FT_INK   = '#0A0E14';
const FT_RULE  = '#D8D2C6';
const FT_MUTE  = '#5A6470';
const FT_RED   = '#B0271E'; // editorial accent

const ftSerif = "'Playfair Display', 'Times New Roman', serif";
const ftMono  = "'JetBrains Mono', monospace";

function FrontpageTab(){
  const fp = LH_FRONTPAGE;
  return (
    <div style={{display:'flex',flexDirection:'column',width:'100%',height:'100%',background:'var(--ink)',color:'var(--paper)',fontFamily:'Archivo,sans-serif'}}>
      <HubTopbar/>
      <HubActionBar/>
      <HubTabs active="frontpage"/>

      {/* The paper sits inside the dark hub like a printed sheet */}
      <div style={{flex:1,overflow:'auto',padding:'20px 28px 28px',background:'var(--ink)'}}>
        <Newspaper fp={fp}/>
      </div>
    </div>
  );
}

function Newspaper({ fp }){
  return (
    <div style={{
      background:FT_PAPER,color:FT_INK,
      boxShadow:'0 30px 60px -20px rgba(0,0,0,.5), 0 2px 0 0 #C9C2B3',
      padding:'34px 44px',position:'relative',
    }}>
      <Masthead fp={fp}/>
      <hr style={{border:0,height:1,background:FT_INK,margin:'18px 0 4px'}}/>
      <hr style={{border:0,height:4,background:FT_INK,margin:'0 0 22px'}}/>

      {/* Cover grid */}
      <div style={{display:'grid',gridTemplateColumns:'2.1fr 1fr 1.2fr',gap:28}}>
        <LeadStory s={fp.lead}/>
        <SecondaryColumn stories={fp.stories.slice(0,2)}/>
        <SidebarColumn fp={fp}/>
      </div>

      <hr style={{border:0,height:1,background:FT_INK,margin:'26px 0 18px'}}/>

      {/* Below the fold */}
      <div style={{display:'grid',gridTemplateColumns:'1.2fr 1fr 1fr 1fr',gap:24}}>
        <BelowStory s={fp.stories[2]}/>
        <BelowStory s={fp.stories[3]}/>
        <BelowStory s={fp.stories[4]}/>
        <Classifieds items={fp.classified}/>
      </div>

      <hr style={{border:0,height:1,background:FT_INK,margin:'24px 0 12px'}}/>
      <Colophon fp={fp}/>
    </div>
  );
}

function Masthead({ fp }){
  return (
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-end',fontFamily:ftMono,fontSize:11,letterSpacing:'.18em',color:FT_INK}}>
        <span>VOL · {fp.vol}</span>
        <span style={{fontFamily:ftSerif,fontStyle:'italic',fontSize:14,letterSpacing:'0',color:FT_INK}}>The Official Gazette of Office Heroes</span>
        <span>EDITION · #{fp.edition}</span>
      </div>
      <div style={{textAlign:'center',marginTop:6}}>
        <div style={{fontFamily:ftSerif,fontWeight:900,fontStyle:'italic',fontSize:82,letterSpacing:'-0.03em',lineHeight:0.9,color:FT_INK}}>FORZA TIMES</div>
        <div style={{fontFamily:ftSerif,fontStyle:'italic',fontSize:13,color:FT_MUTE,marginTop:6}}>
          “All the points that's fit to print” · {fp.date} · £0.00 to subscribers · Premium tier coming soon
        </div>
      </div>
    </div>
  );
}

function LeadStory({ s }){
  return (
    <article>
      <div style={{fontFamily:ftMono,fontSize:10,letterSpacing:'.22em',color:FT_RED,marginBottom:8}}>{s.kicker}</div>
      <h1 style={{
        fontFamily:ftSerif,fontWeight:900,fontSize:54,lineHeight:0.98,letterSpacing:'-0.025em',
        color:FT_INK,textWrap:'balance',marginBottom:14,
      }}>{s.headline}</h1>

      {/* Lead image — striped placeholder */}
      <ImageSlot label="LEAD PHOTO · BEZERRA AT FT" h={220}/>

      <p style={{fontFamily:ftSerif,fontSize:18,lineHeight:1.45,color:FT_INK,marginTop:14,textWrap:'pretty'}}>
        <span style={{
          float:'left',fontFamily:ftSerif,fontWeight:900,fontSize:56,lineHeight:0.85,
          paddingRight:8,paddingTop:4,color:FT_INK,
        }}>{(s.deck[0]||'').toUpperCase()}</span>
        {s.deck.slice(1)}
      </p>
      <p style={{fontFamily:ftSerif,fontSize:14,lineHeight:1.55,color:FT_INK,marginTop:12,textWrap:'pretty'}}>
        Continued analysis on page 2 with a tactics breakdown, the Storks Albion response,
        and a captain’s table showing the seven choices that paid off across the league.
      </p>
      <div style={{fontFamily:ftMono,fontSize:10,letterSpacing:'.18em',color:FT_MUTE,marginTop:12,textTransform:'uppercase'}}>{s.byline}</div>
    </article>
  );
}

function SecondaryColumn({ stories }){
  return (
    <div style={{borderLeft:`1px solid ${FT_RULE}`,borderRight:`1px solid ${FT_RULE}`,padding:'0 22px',display:'flex',flexDirection:'column',gap:24}}>
      {stories.map((s,i) => (
        <article key={s.id} style={{paddingBottom:i<stories.length-1?20:0,borderBottom:i<stories.length-1?`1px solid ${FT_RULE}`:'none'}}>
          <div style={{fontFamily:ftMono,fontSize:9,letterSpacing:'.22em',color:FT_RED}}>{s.kicker}</div>
          <h2 style={{fontFamily:ftSerif,fontWeight:800,fontSize:26,lineHeight:1.02,letterSpacing:'-0.02em',color:FT_INK,marginTop:6,textWrap:'balance'}}>{s.headline}</h2>
          <p style={{fontFamily:ftSerif,fontSize:14,lineHeight:1.5,color:FT_INK,marginTop:8,textWrap:'pretty'}}>{s.deck}</p>
          <div style={{fontFamily:ftMono,fontSize:9,letterSpacing:'.18em',color:FT_MUTE,marginTop:8,textTransform:'uppercase'}}>{s.byline}</div>
        </article>
      ))}
    </div>
  );
}

function SidebarColumn({ fp }){
  return (
    <aside style={{display:'flex',flexDirection:'column',gap:18}}>
      {/* Standings box */}
      <div style={{border:`2px solid ${FT_INK}`,padding:'14px 16px',background:'#EFEAE0'}}>
        <div style={{fontFamily:ftMono,fontSize:9,letterSpacing:'.22em',color:FT_INK}}>STANDINGS · GW28</div>
        <div style={{fontFamily:ftSerif,fontWeight:900,fontStyle:'italic',fontSize:22,color:FT_INK,marginTop:2,letterSpacing:'-0.02em'}}>Table at a glance</div>
        <table style={{width:'100%',marginTop:8,borderCollapse:'collapse',fontFamily:ftMono,fontSize:11,color:FT_INK}}>
          <tbody>
            {[
              { r:1, name:'Bezerra United',   pts:1024, mv:'='  },
              { r:2, name:'Lagos Tide',       pts:1011, mv:'▲1' },
              { r:3, name:'Equator Express',  pts: 998, mv:'▼1' },
              { r:4, name:'Storks Albion',    pts: 982, mv:'▲2' },
              { r:5, name:'Tagus Reserves',   pts: 947, mv:'='  },
              { r:6, name:'Rolling Hooligans',pts: 931, mv:'▼2' },
            ].map(r => (
              <tr key={r.r} style={{borderTop:r.r===1?'none':`1px solid ${FT_RULE}`}}>
                <td style={{padding:'5px 4px',width:18}}>{r.r}</td>
                <td style={{padding:'5px 4px',fontFamily:ftSerif,fontSize:12,letterSpacing:0}}>{r.name}</td>
                <td style={{padding:'5px 4px',textAlign:'right',fontWeight:600}}>{r.pts}</td>
                <td style={{padding:'5px 4px',textAlign:'right',color:r.mv.startsWith('▲')?'#2A7D3F':r.mv.startsWith('▼')?FT_RED:FT_MUTE,width:24}}>{r.mv}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Quote of the day */}
      <div style={{paddingLeft:16,borderLeft:`4px solid ${FT_INK}`}}>
        <div style={{fontFamily:ftMono,fontSize:9,letterSpacing:'.22em',color:FT_RED}}>QUOTE · LEAGUE CHAT</div>
        <blockquote style={{fontFamily:ftSerif,fontStyle:'italic',fontSize:22,lineHeight:1.2,color:FT_INK,marginTop:6,textWrap:'pretty'}}>
          “Forza Times says I’m back on top. Quote me on that.”
        </blockquote>
        <div style={{fontFamily:ftMono,fontSize:9,letterSpacing:'.18em',color:FT_MUTE,marginTop:8,textTransform:'uppercase'}}>— Raï Bezerra · #league-chat · 10:33</div>
      </div>

      {/* Box score: today's fixtures */}
      <div style={{border:`1px solid ${FT_INK}`,padding:'12px 14px'}}>
        <div style={{fontFamily:ftMono,fontSize:9,letterSpacing:'.22em',color:FT_INK}}>BOX SCORE · SATURDAY</div>
        <table style={{width:'100%',marginTop:6,borderCollapse:'collapse',fontFamily:ftMono,fontSize:11,color:FT_INK}}>
          <tbody>
            {[
              ['AVL','CHE','1','0','FT'],
              ['TOT','EVE','2','2','FT'],
              ['ARS','LIV','0','1','FT'],
              ['CRY','NEW','1','3','FT'],
            ].map(g => (
              <tr key={g[0]+g[1]} style={{borderTop:`1px solid ${FT_RULE}`}}>
                <td style={{padding:'4px 4px',fontFamily:ftSerif,fontSize:12}}>{g[0]}</td>
                <td style={{padding:'4px 4px',width:30,textAlign:'right',fontWeight:600}}>{g[2]}</td>
                <td style={{padding:'4px 4px',width:14,textAlign:'center',color:FT_MUTE}}>—</td>
                <td style={{padding:'4px 4px',width:30,fontWeight:600}}>{g[3]}</td>
                <td style={{padding:'4px 4px',fontFamily:ftSerif,fontSize:12}}>{g[1]}</td>
                <td style={{padding:'4px 4px',textAlign:'right',color:FT_MUTE,fontSize:9,letterSpacing:'.16em'}}>{g[4]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </aside>
  );
}

function BelowStory({ s }){
  return (
    <article>
      <div style={{fontFamily:ftMono,fontSize:9,letterSpacing:'.22em',color:FT_RED}}>{s.kicker}</div>
      <h3 style={{fontFamily:ftSerif,fontWeight:800,fontSize:20,lineHeight:1.05,letterSpacing:'-0.02em',color:FT_INK,marginTop:6,textWrap:'balance'}}>{s.headline}</h3>
      <p style={{fontFamily:ftSerif,fontSize:13,lineHeight:1.5,color:FT_INK,marginTop:6,textWrap:'pretty'}}>{s.deck}</p>
      <div style={{fontFamily:ftMono,fontSize:9,letterSpacing:'.18em',color:FT_MUTE,marginTop:6,textTransform:'uppercase'}}>{s.byline}</div>
    </article>
  );
}

function Classifieds({ items }){
  return (
    <aside>
      <div style={{fontFamily:ftMono,fontSize:9,letterSpacing:'.22em',color:FT_INK,paddingBottom:6,borderBottom:`2px solid ${FT_INK}`}}>CLASSIFIEDS · TRANSFERS &amp; WAGERS</div>
      <div style={{display:'flex',flexDirection:'column',gap:8,marginTop:8}}>
        {items.map(it => (
          <div key={it.id} style={{padding:'8px 0',borderBottom:`1px dashed ${FT_RULE}`}}>
            <span style={{fontFamily:ftMono,fontSize:9,letterSpacing:'.2em',color:FT_RED,marginRight:6}}>{it.tag}</span>
            <span style={{fontFamily:ftSerif,fontSize:12,color:FT_INK,lineHeight:1.4}}>{it.text}</span>
            <div style={{fontFamily:ftMono,fontSize:9,letterSpacing:'.18em',color:FT_MUTE,marginTop:2}}>— {it.from}</div>
          </div>
        ))}
      </div>
    </aside>
  );
}

function Colophon({ fp }){
  return (
    <div style={{display:'flex',justifyContent:'space-between',fontFamily:ftMono,fontSize:9,letterSpacing:'.22em',color:FT_MUTE}}>
      <span>EDITED BY THE FORZA TIMES DESK · NO HUMANS HARMED IN COMPILATION</span>
      <span>NEXT EDITION · WED · MAY 14 · 2026</span>
      <span>P. 01 OF 04</span>
    </div>
  );
}

// Generic placeholder image with diagonal stripes + mono label.
function ImageSlot({ label, h=180 }){
  return (
    <div style={{
      height:h,position:'relative',overflow:'hidden',
      background:`repeating-linear-gradient(135deg, ${FT_INK} 0 1px, transparent 1px 12px), #D6CFBF`,
      border:`1px solid ${FT_INK}`,
      display:'flex',alignItems:'center',justifyContent:'center',
    }}>
      <span style={{fontFamily:ftMono,fontSize:10,letterSpacing:'.22em',color:FT_INK,background:FT_PAPER,padding:'4px 8px',border:`1px solid ${FT_INK}`}}>{label}</span>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────
// ARTICLE DETAIL — drill-in when a headline is clicked.
// ───────────────────────────────────────────────────────────────────
function ForzaArticleScreen(){
  return (
    <div style={{display:'flex',flexDirection:'column',width:'100%',height:'100%',background:'var(--ink)',color:'var(--paper)',fontFamily:'Archivo,sans-serif'}}>
      <div style={{padding:'16px 28px',borderBottom:'1px solid var(--rule)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <div className="mono" style={{fontSize:10,color:'var(--mute)',letterSpacing:'.22em'}}>← FORZA TIMES · LEAD STORY · EDITION #5</div>
        <div className="mono" style={{fontSize:10,color:'var(--cyan)',letterSpacing:'.22em'}}>SHARE · A− A+ · BOOKMARK</div>
      </div>
      <div style={{flex:1,overflow:'auto',padding:'20px 28px',background:'var(--ink)'}}>
        <div style={{background:FT_PAPER,color:FT_INK,padding:'42px 60px',maxWidth:980,margin:'0 auto',boxShadow:'0 30px 60px -20px rgba(0,0,0,.5)'}}>
          <div style={{fontFamily:ftMono,fontSize:10,letterSpacing:'.22em',color:FT_RED}}>MATCHDAY 5 · MATCH REPORT</div>
          <h1 style={{fontFamily:ftSerif,fontWeight:900,fontSize:62,lineHeight:0.98,letterSpacing:'-0.025em',color:FT_INK,marginTop:8,textWrap:'balance'}}>
            Bezerra strikes late, retakes the throne.
          </h1>
          <p style={{fontFamily:ftSerif,fontStyle:'italic',fontSize:20,lineHeight:1.4,color:FT_MUTE,marginTop:12,textWrap:'pretty'}}>
            Three goals from his back four and a Haaland brace clinch a 78-point Saturday for the table-topper. Palmer-led Storks Albion lurking, two points behind.
          </p>
          <div style={{fontFamily:ftMono,fontSize:10,letterSpacing:'.18em',color:FT_MUTE,marginTop:8,textTransform:'uppercase'}}>By the Forza Times Desk · 11 min read</div>

          <div style={{marginTop:22}}>
            <ImageSlot label="LEAD PHOTO · BEZERRA UNITED LINE-UP, GW28" h={320}/>
            <div style={{fontFamily:ftSerif,fontStyle:'italic',fontSize:12,color:FT_MUTE,marginTop:6}}>Photo · league-supplied · placeholder until press release.</div>
          </div>

          <div style={{columnCount:2,columnGap:30,marginTop:24,fontFamily:ftSerif,fontSize:16,lineHeight:1.55,color:FT_INK,textWrap:'pretty'}}>
            <p style={{marginBottom:14}}>
              <span style={{float:'left',fontFamily:ftSerif,fontWeight:900,fontSize:54,lineHeight:0.85,paddingRight:8,paddingTop:4,color:FT_INK}}>T</span>
              he table-topper rolled out a 4-3-3 with the kind of conviction that suggested the
              Haaland captaincy was never really up for debate. By the time Mings nodded in at the
              far post, Bezerra United had already banked twenty-four points before halftime.
            </p>
            <p style={{marginBottom:14}}>
              Across town, Storks Albion needed a Palmer hat-trick — and almost got it. Adelaide's
              gamble on the Triple Captain chip will pay her back in chatter for weeks, even if the
              two-point margin says it didn't quite land.
            </p>
            <p style={{marginBottom:14}}>
              The losers of the weekend, if we’re being honest, were the conservative middle of the
              table. Six managers banked under 50 points. Rui Almeida’s “quiet game” approach has
              now lasted three matchdays and counting.
            </p>
            <p>
              Up next: Tuesday's Champions League knockouts, two captaincy pivots already telegraphed
              in #league-chat, and a Wednesday auction window that Pierogi FC is reportedly preparing
              to dominate.
            </p>
          </div>

          <hr style={{border:0,height:1,background:FT_RULE,margin:'24px 0'}}/>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <div style={{display:'flex',gap:18,fontFamily:ftMono,fontSize:10,letterSpacing:'.22em',color:FT_MUTE}}>
              <span>FILED UNDER · MATCH REPORT</span>
              <span>TAGS · GW28 · BEZERRA · CAPTAINCY</span>
            </div>
            <div style={{fontFamily:ftMono,fontSize:10,letterSpacing:'.22em',color:FT_INK}}>
              ⏵ NEXT · &ldquo;Why we should ban the Triple Captain after GW10&rdquo;
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

window.FrontpageTab = FrontpageTab;
window.ForzaArticleScreen = ForzaArticleScreen;
