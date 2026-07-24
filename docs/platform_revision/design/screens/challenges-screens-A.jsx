// ============================================================
// SCREENS A — Challenges Tab · Create Flow · Incoming · Live
// ============================================================

// ── Screen 1a: Challenges Tab — Mobile ──────────────────────
function ChallengesTabMobile() {
  const TABS = ['Board','Feed','Bets','Challenges','Squad'];
  return (
    <div style={{ background:T.bg, fontFamily:"'Archivo',sans-serif", display:'flex', flexDirection:'column', minHeight:'100%', position:'relative' }}>

      {/* Shell header */}
      <div style={{ background:T.shell }}>
        <MobileStatusBar/>
        <div style={{ padding:'10px 16px 0' }}>
          <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:8, letterSpacing:'.16em', textTransform:'uppercase', color:'rgba(255,255,255,.38)', marginBottom:4 }}>The Gaffer's Cup · GW31</div>
          <div style={{ fontFamily:"'Archivo Black',sans-serif", fontSize:20, color:'#fff', letterSpacing:'-0.02em' }}>Challenges</div>
        </div>
        <div style={{ display:'flex', marginTop:12, borderBottom:'1px solid rgba(255,255,255,.08)' }}>
          {TABS.map(tab => {
            const active = tab === 'Challenges';
            return (
              <div key={tab} style={{ padding:'8px 11px 10px', position:'relative', flexShrink:0, fontFamily:"'Archivo',sans-serif", fontSize:11, fontWeight:active?600:400, color:active?'#fff':'rgba(255,255,255,.4)', cursor:'pointer' }}>
                {tab}
                {active && <div style={{ position:'absolute', left:11, right:11, bottom:0, height:2, background:T.gold, borderRadius:'2px 2px 0 0' }}/>}
              </div>
            );
          })}
        </div>
      </div>

      {/* Hero strip — coin balance */}
      <div style={{ background:T.card, borderBottom:`1px solid ${T.rule}`, padding:'14px 16px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div>
          <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:7.5, letterSpacing:'.14em', textTransform:'uppercase', color:T.mute, marginBottom:5 }}>My balance</div>
          <CoinAmt amount={1240} size='xl'/>
          <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:8.5, color:T.mute, marginTop:5, letterSpacing:'.03em' }}>400 in active challenges</div>
        </div>
        <button style={{ padding:'8px 13px', borderRadius:T.r, background:'transparent', border:`1px solid ${T.gold}`, cursor:'pointer', fontFamily:"'JetBrains Mono',monospace", fontSize:9, letterSpacing:'.12em', textTransform:'uppercase', color:T.gold, fontWeight:500, alignSelf:'flex-start', marginTop:2 }}>Buy Coins</button>
      </div>

      {/* Content */}
      <div style={{ padding:'16px 16px 90px', display:'flex', flexDirection:'column', gap:16 }}>

        {/* Incoming — most prominent */}
        <div style={{ background:T.goldBg, border:`1px solid ${T.goldBr}`, borderRadius:T.r, padding:'13px 13px 13px' }}>
          <SectionLabel label="Incoming" count={2} urgent/>
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {INCOMING.map(ch => <IncomingCard key={ch.id} ch={ch}/>)}
          </div>
        </div>

        {/* Sent / awaiting */}
        <div>
          <SectionLabel label="Sent · awaiting" count={1}/>
          {OPEN.map(ch => <OpenCard key={ch.id} ch={ch}/>)}
        </div>

        {/* Live */}
        <div>
          <SectionLabel label="Live this round" count={1}/>
          {ACTIVE.map(ch => <ActiveCard key={ch.id} ch={ch}/>)}
        </div>

        {/* Settled */}
        <div>
          <SectionLabel label="Settled this season" count={3}/>
          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            {SETTLED.map(ch => <SettledCard key={ch.id} ch={ch}/>)}
          </div>
        </div>
      </div>

      {/* FAB */}
      <div style={{
        position:'absolute', right:16, bottom:68,
        background:T.gold, color:'#fff', borderRadius:100, padding:'11px 18px',
        fontFamily:"'JetBrains Mono',monospace", fontSize:9.5, letterSpacing:'.12em', textTransform:'uppercase', fontWeight:500,
        display:'flex', alignItems:'center', gap:6,
        boxShadow:`0 6px 24px -4px rgba(184,114,14,.55)`,
      }}>+ New Challenge</div>

      <MobileBottomNav active='league'/>
    </div>
  );
}

// ── Screen 1b: Challenges Tab — Desktop ─────────────────────
function ChallengesTabDesktop() {
  const TABS = ['Leaderboard','Feed','Bets','Challenges','Squad'];
  return (
    <div style={{ display:'flex', height:'100%', minHeight:860, background:T.bg, fontFamily:"'Archivo',sans-serif" }}>
      <DesktopSidebar active='league'/>
      <div style={{ flex:1, display:'flex', flexDirection:'column', minWidth:0 }}>

        {/* Page header */}
        <div style={{ background:T.card, borderBottom:`1px solid ${T.rule}`, padding:'20px 28px 0' }}>
          <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:8.5, letterSpacing:'.16em', textTransform:'uppercase', color:T.mute, marginBottom:6 }}>The Gaffer's Cup · GW31</div>
          <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between', gap:16, marginBottom:16 }}>
            <div style={{ fontFamily:"'Archivo Black',sans-serif", fontSize:26, color:T.text, letterSpacing:'-0.02em' }}>Challenges</div>

            {/* Hero balance strip (desktop inline) */}
            <div style={{ display:'flex', alignItems:'center', gap:16, paddingBottom:4 }}>
              <div style={{ textAlign:'right' }}>
                <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:8, letterSpacing:'.14em', textTransform:'uppercase', color:T.mute, marginBottom:4 }}>Coin balance</div>
                <CoinAmt amount={1240} size='lg'/>
                <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:8.5, color:T.mute, marginTop:3 }}>400 in escrow</div>
              </div>
              <button style={{ padding:'9px 14px', borderRadius:T.r, background:'transparent', border:`1px solid ${T.gold}`, fontFamily:"'JetBrains Mono',monospace", fontSize:9.5, letterSpacing:'.12em', textTransform:'uppercase', color:T.gold, cursor:'pointer', fontWeight:500, alignSelf:'flex-start' }}>Buy Coins →</button>
            </div>
          </div>
          <div style={{ display:'flex' }}>
            {TABS.map(tab => {
              const on = tab === 'Challenges';
              return (
                <div key={tab} style={{ padding:'9px 16px 10px', position:'relative', cursor:'pointer', fontFamily:"'Archivo',sans-serif", fontSize:13, fontWeight:on?600:400, color:on?T.text:T.mute }}>
                  {tab}
                  {on && <div style={{ position:'absolute', left:16, right:16, bottom:-1, height:2, background:T.accent, borderRadius:'2px 2px 0 0' }}/>}
                </div>
              );
            })}
          </div>
        </div>

        {/* Body */}
        <div style={{ flex:1, padding:'24px 28px', display:'flex', gap:20, minWidth:0 }}>

          {/* Main col */}
          <div style={{ flex:1, display:'flex', flexDirection:'column', gap:20, minWidth:0 }}>
            <div style={{ background:T.goldBg, border:`1px solid ${T.goldBr}`, borderRadius:T.r, padding:'16px 18px' }}>
              <SectionLabel label="Incoming" count={2} urgent/>
              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                {INCOMING.map(ch => <IncomingCard key={ch.id} ch={ch}/>)}
              </div>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
              <div>
                <SectionLabel label="Sent · awaiting" count={1}/>
                {OPEN.map(ch => <OpenCard key={ch.id} ch={ch}/>)}
              </div>
              <div>
                <SectionLabel label="Live this round" count={1}/>
                {ACTIVE.map(ch => <ActiveCard key={ch.id} ch={ch}/>)}
              </div>
            </div>
          </div>

          {/* Right col */}
          <div style={{ width:238, flexShrink:0, display:'flex', flexDirection:'column', gap:14 }}>
            <button style={{
              padding:'13px', borderRadius:T.r, background:T.gold, border:'none', cursor:'pointer',
              fontFamily:"'JetBrains Mono',monospace", fontSize:10.5, letterSpacing:'.14em', textTransform:'uppercase',
              color:'#fff', fontWeight:600, width:'100%',
            }}>+ New Challenge</button>
            <div>
              <SectionLabel label="Settled · season" count={3}/>
              <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                {SETTLED.map(ch => <SettledCard key={ch.id} ch={ch}/>)}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Screen 2a: Create — Step 1 Pick Opponent ─────────────────
function CreateStep1() {
  const opps = MGRS.filter(m => !m.isMe);
  const selectedId = 'pk'; // PabloK pre-selected
  return (
    <div style={{ background:T.bg, display:'flex', flexDirection:'column', minHeight:'100%' }}>
      <MobileFlowHeader title="New Challenge" step={1} totalSteps={3} subtitle="The Gaffer's Cup · GW31"/>
      <div style={{ padding:'20px 16px', flex:1, display:'flex', flexDirection:'column', gap:16 }}>
        <div style={{ fontFamily:"'Archivo Black',sans-serif", fontSize:19, color:T.text, letterSpacing:'-0.01em' }}>Pick an opponent</div>
        <div style={{ background:T.card, border:`1px solid ${T.rule}`, borderRadius:T.r, overflow:'hidden' }}>
          {opps.map((m, i) => {
            const sel = m.id === selectedId;
            return (
              <div key={m.id} style={{
                display:'flex', alignItems:'center', gap:12, padding:'11px 14px',
                borderBottom:i < opps.length - 1 ? `1px solid ${T.rule}` : 'none',
                background:sel ? T.accBg : 'transparent',
                borderLeft:sel ? `3px solid ${T.accent}` : '3px solid transparent',
                cursor:'pointer',
              }}>
                <div style={{ width:18, height:18, borderRadius:'50%', border:`2px solid ${sel?T.accent:T.rule}`, background:sel?T.accent:'transparent', display:'grid', placeItems:'center', flexShrink:0 }}>
                  {sel && <div style={{ width:6, height:6, borderRadius:'50%', background:'#fff' }}/>}
                </div>
                <div style={{ fontFamily:"'Archivo Black',sans-serif", fontSize:14, color:T.text, letterSpacing:'-0.01em', flex:1 }}>{m.name}</div>
                <div style={{ display:'flex', gap:16, alignItems:'center' }}>
                  <div style={{ textAlign:'right' }}>
                    <div style={{ fontFamily:"'Archivo Black',sans-serif", fontSize:17, color:T.accent, letterSpacing:'-0.02em', lineHeight:1 }}>{m.gw}</div>
                    <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:7.5, letterSpacing:'.08em', textTransform:'uppercase', color:T.mute, marginTop:2 }}>GW pts</div>
                  </div>
                  <div style={{ textAlign:'right' }}>
                    <div style={{ fontFamily:"'Archivo Black',sans-serif", fontSize:13, color:m.rank <= 3 ? T.accent : T.text, letterSpacing:'-0.01em', lineHeight:1 }}>#{m.rank}</div>
                    <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:7.5, letterSpacing:'.08em', textTransform:'uppercase', color:T.mute, marginTop:2 }}>rank</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div style={{ padding:'12px 16px 24px', borderTop:`1px solid ${T.rule}`, background:T.card }}>
        <button style={{ width:'100%', padding:'14px', borderRadius:T.r, background:T.accent, border:'none', cursor:'pointer', fontFamily:"'JetBrains Mono',monospace", fontSize:11, letterSpacing:'.14em', textTransform:'uppercase', color:'#fff', fontWeight:600 }}>Next →</button>
      </div>
    </div>
  );
}

// ── Screen 2b: Create — Step 2 Pick Proposition ──────────────
function CreateStep2() {
  const propTypes = [
    {
      type:'GW_TOTAL', title:'GW Total Battle',
      desc:'My gameweek total vs yours. Whoever scores more points wins. Auto-resolved at GW end — no extra setup.',
      selected:true,
      visual: (
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ textAlign:'center' }}>
            <div style={{ fontFamily:"'Archivo Black',sans-serif", fontSize:22, color:T.accent, letterSpacing:'-0.03em', lineHeight:1 }}>54</div>
            <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:7.5, color:T.mute, marginTop:2 }}>You</div>
          </div>
          <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:T.mute, letterSpacing:'.06em' }}>vs</div>
          <div style={{ textAlign:'center' }}>
            <div style={{ fontFamily:"'Archivo Black',sans-serif", fontSize:22, color:T.text2, letterSpacing:'-0.03em', lineHeight:1 }}>61</div>
            <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:7.5, color:T.mute, marginTop:2 }}>PabloK</div>
          </div>
        </div>
      ),
    },
    {
      type:'PLAYER_DUEL', title:'Player Duel',
      desc:'Pick one player from each squad. Whose player scores more this GW wins. Requires player selection.',
      selected:false,
      visual: (
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <div style={{ background:T.accBg, border:`1px solid ${T.accent}`, borderRadius:3, padding:'3px 8px', fontFamily:"'JetBrains Mono',monospace", fontSize:8, letterSpacing:'.08em', color:T.accent }}>MID Salah</div>
          <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:9, color:T.mute }}>vs</div>
          <div style={{ background:T.elev, border:`1px dashed ${T.mute}`, borderRadius:3, padding:'3px 8px', fontFamily:"'JetBrains Mono',monospace", fontSize:8, letterSpacing:'.08em', color:T.mute }}>Pick theirs</div>
        </div>
      ),
    },
    {
      type:'MATCH_RESULT', title:'Match Result Call',
      desc:"Predict the result of a live fixture. If you're right, you win. If not, they win.",
      selected:false,
      visual: (
        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
          <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:9.5, letterSpacing:'.04em', color:T.pos, fontWeight:500 }}>Arsenal</div>
          <div style={{ background:T.posBg, border:`1px solid ${T.pos}`, borderRadius:3, padding:'2px 7px', fontFamily:"'JetBrains Mono',monospace", fontSize:8, color:T.pos }}>Win</div>
          <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:9, color:T.mute }}>vs Chelsea</div>
        </div>
      ),
    },
  ];

  return (
    <div style={{ background:T.bg, display:'flex', flexDirection:'column', minHeight:'100%' }}>
      <MobileFlowHeader title="New Challenge" step={2} totalSteps={3} subtitle="vs PabloK"/>
      <div style={{ padding:'20px 16px', flex:1, display:'flex', flexDirection:'column', gap:14 }}>
        <div style={{ fontFamily:"'Archivo Black',sans-serif", fontSize:19, color:T.text, letterSpacing:'-0.01em' }}>Pick a proposition</div>
        {propTypes.map(p => (
          <div key={p.type} style={{
            background:T.card,
            border:`${p.selected?2:1}px solid ${p.selected?T.accent:T.rule}`,
            boxShadow:p.selected?`0 0 0 1px ${T.accent},0 8px 24px -10px rgba(26,111,168,.3)`:'none',
            borderRadius:T.r, overflow:'hidden',
          }}>
            <div style={{ padding:'13px 14px', display:'flex', alignItems:'flex-start', gap:10 }}>
              <div style={{ width:18, height:18, borderRadius:'50%', border:`2px solid ${p.selected?T.accent:T.rule}`, background:p.selected?T.accent:'transparent', display:'grid', placeItems:'center', flexShrink:0, marginTop:1 }}>
                {p.selected && <div style={{ width:6, height:6, borderRadius:'50%', background:'#fff' }}/>}
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                  <span style={{ fontFamily:"'Archivo Black',sans-serif", fontSize:14, color:T.text, letterSpacing:'-0.01em' }}>{p.title}</span>
                  <PropBadge type={p.type} small/>
                </div>
                <div style={{ fontSize:12.5, color:T.text2, lineHeight:1.45 }}>{p.desc}</div>
              </div>
            </div>

            {/* Visual preview */}
            <div style={{ padding:'10px 14px 12px', borderTop:`1px solid ${T.rule}`, background:p.selected?T.accBg:T.elev, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              {p.visual}
              {p.selected && (
                <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:8, color:T.accent, letterSpacing:'.08em' }}>✓ Auto-resolves at GW end</span>
              )}
            </div>
          </div>
        ))}
      </div>
      <div style={{ padding:'12px 16px 24px', borderTop:`1px solid ${T.rule}`, background:T.card }}>
        <button style={{ width:'100%', padding:'14px', borderRadius:T.r, background:T.accent, border:'none', cursor:'pointer', fontFamily:"'JetBrains Mono',monospace", fontSize:11, letterSpacing:'.14em', textTransform:'uppercase', color:'#fff', fontWeight:600 }}>Next →</button>
      </div>
    </div>
  );
}

// ── Screen 2c: Create — Step 3 Set Stake ─────────────────────
function CreateStep3() {
  const stake = 300, min = 50, max = 500, rake = 0.10;
  const netWin = Math.round(stake * (1 - rake));
  const fillPct = ((stake - min) / (max - min)) * 100;
  const balAfter = MY_WALLET.balance - stake;
  return (
    <div style={{ background:T.bg, display:'flex', flexDirection:'column', minHeight:'100%' }}>
      <MobileFlowHeader title="New Challenge" step={3} totalSteps={3} subtitle="GW Total · vs PabloK"/>
      <div style={{ padding:'20px 16px', flex:1, display:'flex', flexDirection:'column', gap:20 }}>
        <div style={{ fontFamily:"'Archivo Black',sans-serif", fontSize:19, color:T.text, letterSpacing:'-0.01em' }}>Set your stake</div>

        {/* Stake display */}
        <div style={{ textAlign:'center', padding:'18px 0 8px' }}>
          <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:9, letterSpacing:'.14em', textTransform:'uppercase', color:T.mute, marginBottom:8 }}>Staking</div>
          <CoinAmt amount={stake} size='xl'/>
          <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:9, color:T.mute, marginTop:6 }}>coins each</div>
        </div>

        {/* Slider */}
        <div>
          <div style={{ position:'relative', height:6, borderRadius:3, background:T.elev }}>
            <div style={{ position:'absolute', left:0, top:0, height:'100%', width:`${fillPct}%`, borderRadius:3, background:T.gold }}/>
            <div style={{ position:'absolute', left:`calc(${fillPct}% - 12px)`, top:-9, width:24, height:24, borderRadius:'50%', background:T.card, border:`2px solid ${T.gold}`, boxShadow:`0 2px 10px rgba(184,114,14,.35)` }}/>
          </div>
          <div style={{ display:'flex', justifyContent:'space-between', marginTop:10 }}>
            <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:9, color:T.mute }}>Min {min}</span>
            <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:9, color:T.mute }}>Max {max}</span>
          </div>
        </div>

        {/* Impact preview — the transparency moment */}
        <div style={{ background:T.card, border:`1px solid ${T.rule}`, borderRadius:T.r, overflow:'hidden' }}>
          <div style={{ padding:'12px 14px', borderBottom:`1px solid ${T.rule}`, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <span style={{ fontSize:13.5, color:T.text2 }}>If you win</span>
            <span style={{ fontFamily:"'Archivo Black',sans-serif", fontSize:17, color:T.pos, letterSpacing:'-0.02em' }}>+{netWin} coins</span>
          </div>
          <div style={{ padding:'12px 14px', borderBottom:`1px solid ${T.rule}`, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <span style={{ fontSize:13.5, color:T.text2 }}>If you lose</span>
            <span style={{ fontFamily:"'Archivo Black',sans-serif", fontSize:17, color:T.neg, letterSpacing:'-0.02em' }}>−{stake} coins</span>
          </div>
          <div style={{ padding:'10px 14px', background:T.elev, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:9.5, color:T.mute, letterSpacing:'.06em' }}>Platform rake · 10%</span>
            <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:9.5, color:T.mute }}>{stake - netWin} coins</span>
          </div>
        </div>

        {/* Balance check */}
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <div style={{ width:16, height:16, borderRadius:'50%', background:T.posBg, display:'grid', placeItems:'center', flexShrink:0 }}>
            <span style={{ fontSize:9, color:T.pos }}>✓</span>
          </div>
          <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:9.5, color:T.mute, letterSpacing:'.04em' }}>
            Balance after staking: {balAfter.toLocaleString()} coins
          </span>
        </div>
      </div>
      <div style={{ padding:'12px 16px 24px', borderTop:`1px solid ${T.rule}`, background:T.card }}>
        <button style={{ width:'100%', padding:'14px', borderRadius:T.r, background:T.accent, border:'none', cursor:'pointer', fontFamily:"'JetBrains Mono',monospace", fontSize:11, letterSpacing:'.14em', textTransform:'uppercase', color:'#fff', fontWeight:600 }}>Review Challenge →</button>
      </div>
    </div>
  );
}

// ── Screen 2d: Create — Confirm ──────────────────────────────
function CreateConfirm() {
  return (
    <div style={{ background:T.bg, display:'flex', flexDirection:'column', minHeight:'100%' }}>
      <MobileFlowHeader title="New Challenge" subtitle="Review & send"/>
      <div style={{ padding:'20px 16px', flex:1, display:'flex', flexDirection:'column', gap:16 }}>
        <div style={{ fontFamily:"'Archivo Black',sans-serif", fontSize:19, color:T.text, letterSpacing:'-0.01em' }}>Review & send</div>

        {/* Summary card */}
        <div style={{ background:T.card, border:`1px solid ${T.rule}`, borderRadius:T.r, overflow:'hidden' }}>
          {/* Opponent header */}
          <div style={{ background:T.shell, padding:'14px 16px' }}>
            <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:8, letterSpacing:'.14em', textTransform:'uppercase', color:'rgba(255,255,255,.38)', marginBottom:4 }}>Challenging</div>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <div style={{ fontFamily:"'Archivo Black',sans-serif", fontSize:21, color:'#fff', letterSpacing:'-0.02em' }}>PabloK</div>
              <RankBadge rank={2}/>
              <div style={{ marginLeft:'auto', textAlign:'right' }}>
                <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:8, color:'rgba(255,255,255,.38)', marginBottom:2 }}>GW31 score</div>
                <div style={{ fontFamily:"'Archivo Black',sans-serif", fontSize:17, color:'rgba(255,255,255,.8)' }}>61 pts</div>
              </div>
            </div>
          </div>

          {/* Details rows */}
          {[
            { label:'Proposition', content:<span style={{ fontFamily:"'Archivo',sans-serif", fontSize:13.5, color:T.text, fontWeight:500 }}>GW Total Battle · GW31</span> },
            { label:'Stake each',  content:<CoinAmt amount={300}/> },
            { label:'If you win',  content:<CoinAmt amount={270} color={T.pos}/> },
            { label:'If you lose', content:<span style={{ fontFamily:"'Archivo Black',sans-serif", fontSize:16, color:T.neg, letterSpacing:'-0.02em' }}>−300</span> },
          ].map((row, i, arr) => (
            <div key={i} style={{ padding:'12px 16px', borderBottom:i < arr.length-1?`1px solid ${T.rule}`:'none', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:9.5, letterSpacing:'.08em', textTransform:'uppercase', color:T.mute }}>{row.label}</span>
              {row.content}
            </div>
          ))}

          {/* Footer note */}
          <div style={{ padding:'10px 16px', background:T.elev }}>
            <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:9, color:T.mute, letterSpacing:'.04em' }}>⏱ Expires in 24 hrs · Platform rake 10%</span>
          </div>
        </div>
      </div>

      <div style={{ padding:'12px 16px 24px', borderTop:`1px solid ${T.rule}`, background:T.card }}>
        <button style={{
          width:'100%', padding:'16px', borderRadius:T.r, background:T.gold, border:'none', cursor:'pointer',
          fontFamily:"'Archivo Black',sans-serif", fontSize:15, letterSpacing:'-0.01em', color:'#fff',
        }}>Send Challenge →</button>
      </div>
    </div>
  );
}

// ── Screen 3a: Incoming — Notification Toast ─────────────────
function IncomingToast() {
  return (
    <div style={{ background:'#0D1219', padding:'20px 16px', display:'flex', flexDirection:'column', gap:10, justifyContent:'center', alignItems:'center', minHeight:'100%' }}>
      <div style={{ background:T.card, borderRadius:T.r + 4, padding:'13px 15px', width:'100%', maxWidth:343, boxShadow:'0 16px 40px -10px rgba(0,0,0,.6)', border:`1px solid ${T.rule}` }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:9 }}>
          <div style={{ width:34, height:34, borderRadius:8, background:T.goldBg, border:`1px solid ${T.goldBd}`, display:'grid', placeItems:'center', flexShrink:0, fontSize:17 }}>⚔</div>
          <div style={{ flex:1 }}>
            <div style={{ fontFamily:"'Archivo Black',sans-serif", fontSize:13.5, color:T.text, letterSpacing:'-0.01em' }}>New challenge</div>
            <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:8.5, letterSpacing:'.06em', color:T.mute }}>The Gaffer's Cup</div>
          </div>
          <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:8.5, color:T.mute }}>now</span>
        </div>
        <div style={{ fontSize:13.5, color:T.text2, lineHeight:1.45, marginBottom:11 }}>
          <strong style={{ color:T.text, fontFamily:"'Archivo Black',sans-serif", letterSpacing:'-0.01em' }}>RTrocado</strong> challenged you to a GW Total Battle — <CoinAmt amount={300} size='sm'/> each
        </div>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:8.5, color:T.gold }}>⏱ 18 hrs to respond</span>
          <button style={{ padding:'7px 13px', borderRadius:T.r, background:T.gold, border:'none', cursor:'pointer', fontFamily:"'JetBrains Mono',monospace", fontSize:8.5, letterSpacing:'.1em', textTransform:'uppercase', color:'#fff', fontWeight:600 }}>View →</button>
        </div>
      </div>
      <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:8.5, letterSpacing:'.12em', textTransform:'uppercase', color:'rgba(255,255,255,.2)', textAlign:'center' }}>
        Activity feed notification
      </div>
    </div>
  );
}

// ── Screen 3b: Incoming — Full Challenge Sheet ───────────────
function IncomingSheet() {
  const ch = INCOMING[0];
  return (
    <div style={{ background:'rgba(14,19,25,.85)', display:'flex', flexDirection:'column', minHeight:'100%', justifyContent:'flex-end' }}>
      {/* Dim overlay */}
      <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center' }}>
        <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:8.5, letterSpacing:'.14em', textTransform:'uppercase', color:'rgba(255,255,255,.25)' }}>Tap outside to dismiss</span>
      </div>

      {/* Bottom sheet */}
      <div style={{ background:T.card, borderRadius:'16px 16px 0 0', overflow:'hidden' }}>
        {/* Grab handle */}
        <div style={{ display:'flex', justifyContent:'center', padding:'10px 0 4px' }}>
          <div style={{ width:36, height:4, borderRadius:2, background:T.rule }}/>
        </div>

        {/* Sheet header */}
        <div style={{ padding:'8px 20px 14px', borderBottom:`1px solid ${T.rule}`, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:9, letterSpacing:'.14em', textTransform:'uppercase', color:T.mute }}>Incoming Challenge</div>
          <div style={{ width:26, height:26, borderRadius:13, background:T.elev, display:'grid', placeItems:'center', cursor:'pointer', fontSize:13, color:T.text2 }}>×</div>
        </div>

        {/* Challenger */}
        <div style={{ background:T.shell, padding:'14px 20px', display:'flex', alignItems:'center', gap:14 }}>
          <div style={{ width:44, height:44, borderRadius:'50%', background:`linear-gradient(135deg,${T.accent},#0d4f7a)`, display:'grid', placeItems:'center', flexShrink:0 }}>
            <span style={{ fontFamily:"'Archivo Black',sans-serif", fontSize:17, color:'#fff' }}>R</span>
          </div>
          <div style={{ flex:1 }}>
            <div style={{ fontFamily:"'Archivo Black',sans-serif", fontSize:20, color:'#fff', letterSpacing:'-0.02em', marginBottom:4 }}>{ch.from.name}</div>
            <div style={{ display:'flex', gap:8, alignItems:'center' }}>
              <RankBadge rank={ch.from.rank}/>
              <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:9, color:'rgba(255,255,255,.45)', letterSpacing:'.06em' }}>GW31 · {ch.from.gw} pts</span>
            </div>
          </div>
          <PropBadge type={ch.type}/>
        </div>

        {/* Proposition */}
        <div style={{ padding:'14px 20px', borderBottom:`1px solid ${T.rule}` }}>
          <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:8.5, letterSpacing:'.12em', textTransform:'uppercase', color:T.mute, marginBottom:7 }}>The proposition</div>
          <div style={{ fontSize:15, color:T.text, lineHeight:1.5, fontWeight:500 }}>{ch.summary}</div>
        </div>

        {/* Stakes */}
        <div style={{ padding:'14px 20px', borderBottom:`1px solid ${T.rule}` }}>
          <div style={{ display:'flex', alignItems:'center', gap:20 }}>
            <div>
              <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:8, letterSpacing:'.12em', textTransform:'uppercase', color:T.mute, marginBottom:6 }}>Stake each</div>
              <CoinAmt amount={ch.stake} size='xl'/>
            </div>
            <div style={{ width:1, background:T.rule, alignSelf:'stretch' }}/>
            <div>
              <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:8, letterSpacing:'.12em', textTransform:'uppercase', color:T.mute, marginBottom:6 }}>You'd win</div>
              <CoinAmt amount={ch.netWin} size='lg' color={T.pos}/>
              <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:8, color:T.mute, marginTop:3 }}>after 10% rake</div>
            </div>
          </div>
        </div>

        {/* Expiry urgency */}
        <div style={{ padding:'10px 20px', background:T.goldBg, borderBottom:`1px solid ${T.goldBd}`, display:'flex', alignItems:'center', gap:7 }}>
          <span style={{ fontSize:12 }}>⏱</span>
          <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:9.5, color:T.gold, letterSpacing:'.06em' }}>Challenge expires in {ch.expiry} — respond now</span>
        </div>

        {/* Action buttons */}
        <div style={{ padding:'14px 20px 28px', display:'flex', flexDirection:'column', gap:10 }}>
          <button style={{
            width:'100%', padding:'17px', borderRadius:T.r, background:T.gold, border:'none', cursor:'pointer',
            fontFamily:"'Archivo Black',sans-serif", fontSize:16, letterSpacing:'-0.01em', color:'#fff',
          }}>Accept Challenge</button>
          <button style={{
            width:'100%', padding:'13px', borderRadius:T.r, background:'transparent', border:`1px solid ${T.rule}`, cursor:'pointer',
            fontFamily:"'JetBrains Mono',monospace", fontSize:10, letterSpacing:'.14em', textTransform:'uppercase', color:T.text2, fontWeight:500,
          }}>Decline</button>
        </div>
      </div>
    </div>
  );
}

// ── Screen 4: Live Challenge Tracker ─────────────────────────
function LiveTracker() {
  const ch = ACTIVE[0];
  const leading = ch.myScore > ch.theirScore;
  const diff = Math.abs(ch.myScore - ch.theirScore);
  return (
    <div style={{ background:T.bg, padding:'16px', display:'flex', flexDirection:'column', gap:12, minHeight:'100%' }}>
      <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:8.5, letterSpacing:'.14em', textTransform:'uppercase', color:T.mute }}>Live challenge · GW31</div>

      <div style={{ background:T.card, border:`1px solid rgba(22,101,52,.28)`, borderRadius:T.r, overflow:'hidden' }}>
        {/* Header */}
        <div style={{ padding:'10px 14px', borderBottom:`1px solid ${T.rule}`, display:'flex', alignItems:'center', gap:10 }}>
          <LiveDot/>
          <span style={{ flex:1, fontFamily:"'JetBrains Mono',monospace", fontSize:9, color:T.mute, letterSpacing:'.06em' }}>vs {ch.opp.name} · GW Total Battle · {ch.gw}</span>
          <CoinAmt amount={ch.stake} size='sm'/>
        </div>

        {/* Live score — the emotional core */}
        <div style={{ display:'flex' }}>
          <div style={{ flex:1, padding:'16px 14px', textAlign:'center', background:leading?T.posBg:'transparent' }}>
            <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:9, letterSpacing:'.12em', textTransform:'uppercase', color:leading?T.pos:T.mute, marginBottom:6 }}>You</div>
            <div style={{ fontFamily:"'Archivo Black',sans-serif", fontSize:46, color:leading?T.pos:T.text, letterSpacing:'-0.03em', lineHeight:1 }}>{ch.myScore}</div>
            <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:8, color:T.mute, marginTop:4 }}>pts</div>
            {leading && <div style={{ marginTop:8, display:'inline-block', background:T.pos, color:'#fff', borderRadius:100, padding:'3px 10px', fontFamily:"'JetBrains Mono',monospace", fontSize:7.5, letterSpacing:'.08em' }}>Leading</div>}
          </div>
          <div style={{ width:1, background:T.rule }}/>
          <div style={{ flex:1, padding:'16px 14px', textAlign:'center', background:!leading?T.posBg:'transparent' }}>
            <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:9, letterSpacing:'.12em', textTransform:'uppercase', color:!leading?T.pos:T.mute, marginBottom:6 }}>{ch.opp.name}</div>
            <div style={{ fontFamily:"'Archivo Black',sans-serif", fontSize:46, color:!leading?T.pos:T.text, letterSpacing:'-0.03em', lineHeight:1 }}>{ch.theirScore}</div>
            <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:8, color:T.mute, marginTop:4 }}>pts</div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding:'10px 14px', borderTop:`1px solid ${T.rule}`, background:T.elev, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:9, color:leading?T.pos:T.neg, letterSpacing:'.04em' }}>
            {leading ? `↑ +${diff} lead` : `↓ −${diff} behind`} · 3 fixtures left
          </span>
          <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:8.5, color:T.mute }}>Updates every 2 min</span>
        </div>
      </div>

      {/* Contributing players */}
      <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
        <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:8, letterSpacing:'.12em', textTransform:'uppercase', color:T.mute }}>Contributing this GW</div>
        <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
          {MY_PLAYERS.map(p => (
            <div key={p.id} style={{ display:'flex', alignItems:'center', gap:5, background:T.card, border:`1px solid ${T.rule}`, borderRadius:3, padding:'4px 8px' }}>
              <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:7.5, color:T.mute, letterSpacing:'.04em' }}>{p.pos}</span>
              <span style={{ fontFamily:"'Archivo Black',sans-serif", fontSize:11, color:T.text, letterSpacing:'-0.01em' }}>{p.name}</span>
              <span style={{ fontFamily:"'Archivo Black',sans-serif", fontSize:12, color:p.pts>0?T.accent:T.mute }}>{p.pts}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, {
  ChallengesTabMobile, ChallengesTabDesktop,
  CreateStep1, CreateStep2, CreateStep3, CreateConfirm,
  IncomingToast, IncomingSheet,
  LiveTracker,
});
