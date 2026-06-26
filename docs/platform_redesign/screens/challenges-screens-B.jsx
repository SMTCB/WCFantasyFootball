// ============================================================
// SCREENS B — Resolution · Wallet · Buy Coins · Activity Feed
// ============================================================

// ── Screen 5a: Resolution — Win ──────────────────────────────
function ResolutionWin() {
  return (
    <div style={{ background:T.bg, display:'flex', flexDirection:'column', minHeight:'100%' }}>
      <div style={{ background:T.shell }}>
        <MobileStatusBar/>
        <div style={{ padding:'10px 16px 14px' }}>
          <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:8, letterSpacing:'.16em', textTransform:'uppercase', color:'rgba(255,255,255,.38)', marginBottom:4 }}>Challenge Settled · GW31</div>
          <div style={{ fontFamily:"'Archivo Black',sans-serif", fontSize:17, color:'#fff', letterSpacing:'-0.01em' }}>Result</div>
        </div>
      </div>

      {/* Win hero — goal celebration */}
      <div style={{ background:`linear-gradient(180deg,rgba(184,114,14,.1) 0%,transparent 70%)`, padding:'28px 20px 22px', textAlign:'center', borderBottom:`1px solid ${T.rule}` }}>
        <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:9.5, letterSpacing:'.22em', textTransform:'uppercase', color:T.gold, marginBottom:12 }}>You won</div>
        <div style={{ display:'flex', justifyContent:'center', marginBottom:6 }}>
          <CoinAmt amount={225} size='xl'/>
        </div>
        <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:10, letterSpacing:'.1em', color:T.mute }}>credited to your balance</div>
      </div>

      {/* Details */}
      <div style={{ padding:'16px' }}>
        {/* Matchup + scores */}
        <div style={{ background:T.card, border:`1px solid ${T.rule}`, borderRadius:T.r, overflow:'hidden', marginBottom:12 }}>
          <div style={{ padding:'11px 14px', borderBottom:`1px solid ${T.rule}`, display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ fontFamily:"'Archivo Black',sans-serif", fontSize:14, color:T.text }}>vs GBruschy</span>
            <PropBadge type="GW_TOTAL" small/>
            <span style={{ marginLeft:'auto', fontFamily:"'JetBrains Mono',monospace", fontSize:8.5, color:T.mute }}>GW30</span>
          </div>
          <div style={{ display:'flex' }}>
            <div style={{ flex:1, padding:'14px 12px', textAlign:'center', background:T.posBg }}>
              <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:8, letterSpacing:'.1em', textTransform:'uppercase', color:T.pos, marginBottom:4 }}>You</div>
              <div style={{ fontFamily:"'Archivo Black',sans-serif", fontSize:34, color:T.pos, letterSpacing:'-0.03em', lineHeight:1 }}>68</div>
              <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:7.5, color:T.mute, marginTop:3 }}>pts</div>
            </div>
            <div style={{ width:1, background:T.rule }}/>
            <div style={{ flex:1, padding:'14px 12px', textAlign:'center' }}>
              <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:8, letterSpacing:'.1em', textTransform:'uppercase', color:T.mute, marginBottom:4 }}>GBruschy</div>
              <div style={{ fontFamily:"'Archivo Black',sans-serif", fontSize:34, color:T.text2, letterSpacing:'-0.03em', lineHeight:1 }}>55</div>
              <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:7.5, color:T.mute, marginTop:3 }}>pts</div>
            </div>
          </div>
        </div>

        {/* Payout breakdown */}
        <div style={{ background:T.card, border:`1px solid ${T.rule}`, borderRadius:T.r, overflow:'hidden', marginBottom:12 }}>
          {[
            { l:'Gross win',           v:'250 coins',  hi:false },
            { l:'Platform rake (10%)', v:'−25 coins',  hi:false },
            { l:'Net payout',          v:'+225 coins', hi:true  },
          ].map((row, i, arr) => (
            <div key={i} style={{ padding:'10px 14px', borderBottom:i < arr.length-1?`1px solid ${T.rule}`:'none', display:'flex', justifyContent:'space-between', alignItems:'center', background:row.hi?T.posBg:'transparent' }}>
              <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:9.5, letterSpacing:'.06em', color:row.hi?T.pos:T.mute }}>{row.l}</span>
              <span style={{ fontFamily:"'Archivo Black',sans-serif", fontSize:row.hi?15:13, color:row.hi?T.pos:T.text, letterSpacing:'-0.01em' }}>{row.v}</span>
            </div>
          ))}
        </div>

        {/* New balance */}
        <div style={{ background:T.card, border:`1px solid ${T.rule}`, borderRadius:T.r, padding:'12px 14px', display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
          <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:9.5, letterSpacing:'.06em', color:T.mute }}>New balance</span>
          <CoinAmt amount={MY_WALLET.balance}/>
        </div>

        <button style={{ width:'100%', padding:'14px', borderRadius:T.r, background:T.gold, border:'none', cursor:'pointer', fontFamily:"'JetBrains Mono',monospace", fontSize:10.5, letterSpacing:'.14em', textTransform:'uppercase', color:'#fff', fontWeight:600 }}>View all challenges →</button>
      </div>
    </div>
  );
}

// ── Screen 5b: Resolution — Loss ─────────────────────────────
function ResolutionLoss() {
  return (
    <div style={{ background:T.bg, display:'flex', flexDirection:'column', minHeight:'100%' }}>
      <div style={{ background:T.shell }}>
        <MobileStatusBar/>
        <div style={{ padding:'10px 16px 14px' }}>
          <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:8, letterSpacing:'.16em', textTransform:'uppercase', color:'rgba(255,255,255,.38)', marginBottom:4 }}>Challenge Settled · GW30</div>
          <div style={{ fontFamily:"'Archivo Black',sans-serif", fontSize:17, color:'#fff', letterSpacing:'-0.01em' }}>Result</div>
        </div>
      </div>

      {/* Loss — honest, not brutal */}
      <div style={{ padding:'28px 20px 22px', textAlign:'center', borderBottom:`1px solid ${T.rule}` }}>
        <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:9.5, letterSpacing:'.22em', textTransform:'uppercase', color:T.mute, marginBottom:12 }}>MattP won this round</div>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8, marginBottom:6 }}>
          <CoinIcon size={22}/>
          <span style={{ fontFamily:"'Archivo Black',sans-serif", fontSize:42, color:T.neg, letterSpacing:'-0.03em', lineHeight:1 }}>−90</span>
        </div>
        <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:10, letterSpacing:'.1em', color:T.mute }}>coins deducted</div>
        <div style={{ marginTop:14, fontSize:15, color:T.text2, fontStyle:'italic' }}>Better luck next round.</div>
      </div>

      <div style={{ padding:'16px' }}>
        {/* Matchup + scores */}
        <div style={{ background:T.card, border:`1px solid ${T.rule}`, borderRadius:T.r, overflow:'hidden', marginBottom:12 }}>
          <div style={{ padding:'11px 14px', borderBottom:`1px solid ${T.rule}`, display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ fontFamily:"'Archivo Black',sans-serif", fontSize:14, color:T.text }}>vs MattP</span>
            <PropBadge type="PLAYER_DUEL" small/>
            <span style={{ marginLeft:'auto', fontFamily:"'JetBrains Mono',monospace", fontSize:8.5, color:T.mute }}>GW30</span>
          </div>
          <div style={{ display:'flex' }}>
            <div style={{ flex:1, padding:'14px 12px', textAlign:'center' }}>
              <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:8, letterSpacing:'.08em', textTransform:'uppercase', color:T.mute, marginBottom:4 }}>Haaland (you)</div>
              <div style={{ fontFamily:"'Archivo Black',sans-serif", fontSize:34, color:T.text2, letterSpacing:'-0.03em', lineHeight:1 }}>4</div>
              <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:7.5, color:T.mute, marginTop:3 }}>pts</div>
            </div>
            <div style={{ width:1, background:T.rule }}/>
            <div style={{ flex:1, padding:'14px 12px', textAlign:'center', background:T.negBg }}>
              <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:8, letterSpacing:'.08em', textTransform:'uppercase', color:T.neg, marginBottom:4 }}>Watkins (MattP)</div>
              <div style={{ fontFamily:"'Archivo Black',sans-serif", fontSize:34, color:T.neg, letterSpacing:'-0.03em', lineHeight:1 }}>11</div>
              <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:7.5, color:T.mute, marginTop:3 }}>pts</div>
            </div>
          </div>
        </div>

        <div style={{ background:T.card, border:`1px solid ${T.rule}`, borderRadius:T.r, padding:'12px 14px', display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
          <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:9.5, letterSpacing:'.06em', color:T.mute }}>New balance</span>
          <CoinAmt amount={940}/>
        </div>

        <button style={{ width:'100%', padding:'14px', borderRadius:T.r, background:T.accent, border:'none', cursor:'pointer', fontFamily:"'JetBrains Mono',monospace", fontSize:10.5, letterSpacing:'.14em', textTransform:'uppercase', color:'#fff', fontWeight:600 }}>Challenge again →</button>
      </div>
    </div>
  );
}

// ── Screen 5c: Resolution — Draw / Void ──────────────────────
function ResolutionDraw() {
  return (
    <div style={{ background:T.bg, display:'flex', flexDirection:'column', minHeight:'100%' }}>
      <div style={{ background:T.shell }}>
        <MobileStatusBar/>
        <div style={{ padding:'10px 16px 14px' }}>
          <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:8, letterSpacing:'.16em', textTransform:'uppercase', color:'rgba(255,255,255,.38)', marginBottom:4 }}>Challenge Settled · GW29</div>
          <div style={{ fontFamily:"'Archivo Black',sans-serif", fontSize:17, color:'#fff', letterSpacing:'-0.01em' }}>Result</div>
        </div>
      </div>

      {/* Void state — neutral */}
      <div style={{ padding:'28px 20px 22px', textAlign:'center', borderBottom:`1px solid ${T.rule}` }}>
        <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:9.5, letterSpacing:'.22em', textTransform:'uppercase', color:T.mute, marginBottom:12 }}>Challenge void</div>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8, marginBottom:6 }}>
          <CoinIcon size={22}/>
          <span style={{ fontFamily:"'Archivo Black',sans-serif", fontSize:42, color:T.text, letterSpacing:'-0.03em', lineHeight:1 }}>150</span>
        </div>
        <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:10, letterSpacing:'.1em', color:T.mute }}>coins returned</div>
      </div>

      <div style={{ padding:'16px' }}>
        <div style={{ background:T.card, border:`1px solid ${T.rule}`, borderRadius:T.r, padding:'14px 16px', marginBottom:12 }}>
          <div style={{ fontFamily:"'Archivo Black',sans-serif", fontSize:14, color:T.text, marginBottom:6, letterSpacing:'-0.01em' }}>Match Result vs SaraW</div>
          <div style={{ fontSize:13.5, color:T.text2, lineHeight:1.5, marginBottom:10 }}>Arsenal vs Chelsea was postponed. No result could be determined.</div>
          <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:9.5, color:T.accent, letterSpacing:'.04em' }}>Both managers' stakes have been returned in full.</div>
        </div>

        <div style={{ background:T.card, border:`1px solid ${T.rule}`, borderRadius:T.r, padding:'12px 14px', display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
          <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:9.5, letterSpacing:'.06em', color:T.mute }}>New balance</span>
          <CoinAmt amount={1090}/>
        </div>

        <button style={{ width:'100%', padding:'14px', borderRadius:T.r, background:'transparent', border:`1px solid ${T.rule}`, cursor:'pointer', fontFamily:"'JetBrains Mono',monospace", fontSize:10.5, letterSpacing:'.14em', textTransform:'uppercase', color:T.text2, fontWeight:500 }}>View all challenges</button>
      </div>
    </div>
  );
}

// ── Screen 6a: Coin Wallet — Mobile ──────────────────────────
function WalletMobile() {
  return (
    <div style={{ background:T.bg, display:'flex', flexDirection:'column', minHeight:'100%' }}>
      <div style={{ background:T.shell }}>
        <MobileStatusBar/>
        <div style={{ padding:'10px 16px 14px', display:'flex', alignItems:'center', gap:12 }}>
          <div style={{ width:28, height:28, borderRadius:14, background:'rgba(255,255,255,.08)', display:'flex', alignItems:'center', justifyContent:'center', color:'rgba(255,255,255,.7)', fontSize:14 }}>←</div>
          <div style={{ fontFamily:"'Archivo Black',sans-serif", fontSize:17, color:'#fff', letterSpacing:'-0.01em' }}>My Wallet</div>
        </div>
      </div>

      {/* Balance hero */}
      <div style={{ background:T.card, borderBottom:`1px solid ${T.rule}`, padding:'20px 16px' }}>
        <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:8, letterSpacing:'.14em', textTransform:'uppercase', color:T.mute, marginBottom:6 }}>Available balance</div>
        <CoinAmt amount={MY_WALLET.balance} size='xl'/>
        <div style={{ marginTop:10, display:'flex', alignItems:'center', gap:12 }}>
          <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:9, color:T.mute }}>{MY_WALLET.escrow} in active challenges</span>
          <div style={{ width:1, height:12, background:T.rule }}/>
          <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:9, color:T.mute }}>{(MY_WALLET.balance + MY_WALLET.escrow).toLocaleString()} total</span>
        </div>
        <button style={{ marginTop:14, padding:'11px 20px', borderRadius:T.r, background:T.gold, border:'none', cursor:'pointer', fontFamily:"'JetBrains Mono',monospace", fontSize:10, letterSpacing:'.14em', textTransform:'uppercase', color:'#fff', fontWeight:600 }}>Buy Coins →</button>
      </div>

      {/* Transaction history */}
      <div style={{ padding:'14px 16px 6px' }}>
        <SectionLabel label="Transaction history"/>
      </div>
      <div style={{ background:T.card, borderTop:`1px solid ${T.rule}`, borderBottom:`1px solid ${T.rule}` }}>
        {WALLET_TXS.map((tx, i) => {
          const credit = tx.amt > 0;
          return (
            <div key={tx.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'11px 16px', borderBottom:i < WALLET_TXS.length-1?`1px solid ${T.rule2}`:'none' }}>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:9.5, letterSpacing:'.05em', textTransform:'uppercase', color:T.text, fontWeight:500 }}>{tx.type}</div>
                <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:8.5, color:T.mute, marginTop:2 }}>{tx.party} · {tx.time}</div>
              </div>
              <div style={{ textAlign:'right', flexShrink:0 }}>
                <div style={{ fontFamily:"'Archivo Black',sans-serif", fontSize:14, color:credit?T.pos:T.neg, letterSpacing:'-0.01em' }}>
                  {credit?'+':''}{tx.amt}
                </div>
                <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:8, color:T.mute, marginTop:1 }}>{tx.bal.toLocaleString()}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Screen 6b: Coin Wallet — Desktop ─────────────────────────
function WalletDesktop() {
  return (
    <div style={{ display:'flex', height:'100%', minHeight:700, background:T.bg, fontFamily:"'Archivo',sans-serif" }}>
      <DesktopSidebar active='league'/>
      <div style={{ flex:1, display:'flex', flexDirection:'column', minWidth:0 }}>
        <div style={{ padding:'20px 28px 16px', background:T.card, borderBottom:`1px solid ${T.rule}` }}>
          <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:8.5, letterSpacing:'.16em', textTransform:'uppercase', color:T.mute, marginBottom:6 }}>The Gaffer's Cup</div>
          <div style={{ fontFamily:"'Archivo Black',sans-serif", fontSize:26, color:T.text, letterSpacing:'-0.02em' }}>My Wallet</div>
        </div>
        <div style={{ flex:1, padding:'24px 28px', display:'flex', gap:28, minWidth:0 }}>

          {/* Balance panel */}
          <div style={{ width:270, flexShrink:0, display:'flex', flexDirection:'column', gap:14 }}>
            <div style={{ background:T.card, border:`1px solid ${T.rule}`, borderRadius:T.r, padding:'20px' }}>
              <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:8, letterSpacing:'.14em', textTransform:'uppercase', color:T.mute, marginBottom:6 }}>Available balance</div>
              <CoinAmt amount={MY_WALLET.balance} size='lg'/>
              <div style={{ height:1, background:T.rule, margin:'14px 0' }}/>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
                <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:9.5, color:T.mute }}>In active challenges</span>
                <span style={{ fontFamily:"'Archivo Black',sans-serif", fontSize:13, color:T.mute }}>{MY_WALLET.escrow}</span>
              </div>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:9.5, color:T.mute }}>Total</span>
                <span style={{ fontFamily:"'Archivo Black',sans-serif", fontSize:14, color:T.text }}>{(MY_WALLET.balance + MY_WALLET.escrow).toLocaleString()}</span>
              </div>
              <button style={{ width:'100%', marginTop:16, padding:'12px', borderRadius:T.r, background:T.gold, border:'none', cursor:'pointer', fontFamily:"'JetBrains Mono',monospace", fontSize:10, letterSpacing:'.14em', textTransform:'uppercase', color:'#fff', fontWeight:600 }}>Buy Coins →</button>
            </div>
          </div>

          {/* Ledger */}
          <div style={{ flex:1, minWidth:0 }}>
            <SectionLabel label="Transaction history"/>
            <div style={{ background:T.card, border:`1px solid ${T.rule}`, borderRadius:T.r, overflow:'hidden' }}>
              <div style={{ display:'grid', gridTemplateColumns:'140px 1fr 90px 90px', gap:0, padding:'8px 16px', borderBottom:`2px solid ${T.rule}`, background:T.elev }}>
                {['Transaction','Details','Amount','Balance'].map(h => (
                  <span key={h} style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:8.5, letterSpacing:'.12em', textTransform:'uppercase', color:T.mute }}>{h}</span>
                ))}
              </div>
              {WALLET_TXS.map((tx, i) => {
                const credit = tx.amt > 0;
                return (
                  <div key={tx.id} style={{ display:'grid', gridTemplateColumns:'140px 1fr 90px 90px', gap:0, padding:'11px 16px', borderBottom:i < WALLET_TXS.length-1?`1px solid ${T.rule2}`:'none', alignItems:'center' }}>
                    <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:9.5, letterSpacing:'.04em', textTransform:'uppercase', color:T.text, fontWeight:500 }}>{tx.type}</span>
                    <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:9.5, color:T.mute }}>{tx.party} · {tx.time}</span>
                    <span style={{ fontFamily:"'Archivo Black',sans-serif", fontSize:13, color:credit?T.pos:T.neg, letterSpacing:'-0.01em' }}>{credit?'+':''}{tx.amt}</span>
                    <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:9.5, color:T.mute }}>{tx.bal.toLocaleString()}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Screen 7a: Buy Coins — Mobile ────────────────────────────
function BuyCoinsMobile() {
  const selectedId = 'play';
  return (
    <div style={{ background:T.bg, display:'flex', flexDirection:'column', minHeight:'100%' }}>
      <div style={{ background:T.shell }}>
        <MobileStatusBar/>
        <div style={{ padding:'10px 16px 14px', display:'flex', alignItems:'center', gap:12 }}>
          <div style={{ width:28, height:28, borderRadius:14, background:'rgba(255,255,255,.08)', display:'flex', alignItems:'center', justifyContent:'center', color:'rgba(255,255,255,.7)', fontSize:14 }}>←</div>
          <div style={{ fontFamily:"'Archivo Black',sans-serif", fontSize:17, color:'#fff', letterSpacing:'-0.01em' }}>Buy Coins</div>
        </div>
      </div>

      <div style={{ padding:'20px 16px', flex:1, display:'flex', flexDirection:'column', gap:12 }}>
        <div style={{ fontSize:13.5, color:T.text2, lineHeight:1.5 }}>Select a coin pack to continue to secure checkout.</div>

        {COIN_PACKS.map(pack => {
          const sel = pack.id === selectedId;
          return (
            <div key={pack.id} style={{
              background:T.card, cursor:'pointer', position:'relative',
              border:`${sel?2:1}px solid ${sel?T.gold:T.rule}`,
              boxShadow:sel?`0 0 0 1px ${T.gold},0 8px 24px -8px rgba(184,114,14,.25)`:'none',
              borderRadius:T.r, padding:'14px 16px', display:'flex', alignItems:'center', gap:14,
            }}>
              {pack.badge && (
                <div style={{ position:'absolute', top:-10, right:14, fontFamily:"'JetBrains Mono',monospace", fontSize:8, letterSpacing:'.1em', textTransform:'uppercase', color:T.gold, background:T.card, border:`1px solid ${T.goldBd}`, borderRadius:100, padding:'3px 10px' }}>{pack.badge}</div>
              )}
              <div style={{ width:18, height:18, borderRadius:'50%', border:`2px solid ${sel?T.gold:T.rule}`, background:sel?T.gold:'transparent', display:'grid', placeItems:'center', flexShrink:0 }}>
                {sel && <div style={{ width:6, height:6, borderRadius:'50%', background:'#fff' }}/>}
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:9, letterSpacing:'.16em', textTransform:'uppercase', color:sel?T.gold:T.mute, marginBottom:4 }}>{pack.name}</div>
                <CoinAmt amount={pack.coins} size='lg'/>
              </div>
              <div style={{ fontFamily:"'Archivo Black',sans-serif", fontSize:19, color:T.text, letterSpacing:'-0.01em', flexShrink:0 }}>{pack.price}</div>
            </div>
          );
        })}

        <div style={{ padding:'12px 14px', background:T.elev, borderRadius:T.r, marginTop:4 }}>
          <div style={{ fontSize:12, color:T.mute, lineHeight:1.55 }}>
            Coins are virtual and cannot be cashed out. For play use within The Gaffer's Cup only. All purchases are final.
          </div>
        </div>
      </div>

      <div style={{ padding:'12px 16px 24px', borderTop:`1px solid ${T.rule}`, background:T.card }}>
        <button style={{ width:'100%', padding:'16px', borderRadius:T.r, background:T.gold, border:'none', cursor:'pointer', fontFamily:"'Archivo Black',sans-serif", fontSize:15, letterSpacing:'-0.01em', color:'#fff' }}>Proceed to Checkout →</button>
      </div>
    </div>
  );
}

// ── Screen 7b: Buy Coins — Desktop ───────────────────────────
function BuyCoinsDesktop() {
  const selectedId = 'play';
  return (
    <div style={{ display:'flex', height:'100%', minHeight:620, background:T.bg, fontFamily:"'Archivo',sans-serif" }}>
      <DesktopSidebar active='league'/>
      <div style={{ flex:1, display:'flex', flexDirection:'column', minWidth:0 }}>
        <div style={{ padding:'20px 28px 16px', background:T.card, borderBottom:`1px solid ${T.rule}` }}>
          <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:8.5, letterSpacing:'.16em', textTransform:'uppercase', color:T.mute, marginBottom:6 }}>The Gaffer's Cup</div>
          <div style={{ fontFamily:"'Archivo Black',sans-serif", fontSize:26, color:T.text, letterSpacing:'-0.02em' }}>Buy Coins</div>
        </div>
        <div style={{ flex:1, padding:'28px', display:'flex', flexDirection:'column', gap:20, maxWidth:900 }}>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:14 }}>
            {COIN_PACKS.map(pack => {
              const sel = pack.id === selectedId;
              return (
                <div key={pack.id} style={{
                  background:T.card, cursor:'pointer', position:'relative',
                  border:`${sel?2:1}px solid ${sel?T.gold:T.rule}`,
                  boxShadow:sel?`0 0 0 1px ${T.gold},0 12px 30px -10px rgba(184,114,14,.3)`:'none',
                  borderRadius:T.r, padding:'18px 16px', display:'flex', flexDirection:'column', gap:10,
                }}>
                  {pack.badge && (
                    <div style={{ position:'absolute', top:-11, left:'50%', transform:'translateX(-50%)', fontFamily:"'JetBrains Mono',monospace", fontSize:8, letterSpacing:'.1em', textTransform:'uppercase', color:T.gold, background:T.card, border:`1px solid ${T.goldBd}`, borderRadius:100, padding:'3px 10px', whiteSpace:'nowrap' }}>{pack.badge}</div>
                  )}
                  <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:9, letterSpacing:'.16em', textTransform:'uppercase', color:sel?T.gold:T.mute }}>{pack.name}</div>
                  <CoinAmt amount={pack.coins} size='lg'/>
                  <div style={{ fontFamily:"'Archivo Black',sans-serif", fontSize:20, color:T.text, letterSpacing:'-0.01em', marginTop:'auto', paddingTop:6 }}>{pack.price}</div>
                </div>
              );
            })}
          </div>

          <div style={{ fontSize:13, color:T.mute, lineHeight:1.6, maxWidth:560 }}>
            Coins are virtual and cannot be cashed out. For play use within The Gaffer's Cup only. All purchases are processed securely via Stripe.
          </div>

          <button style={{ alignSelf:'flex-start', padding:'14px 28px', borderRadius:T.r, background:T.gold, border:'none', cursor:'pointer', fontFamily:"'Archivo Black',sans-serif", fontSize:15, letterSpacing:'-0.01em', color:'#fff' }}>Proceed to Checkout →</button>
        </div>
      </div>
    </div>
  );
}

// ── Screen 8a: Activity Feed — Mobile ────────────────────────
function ActivityFeedMobile() {
  const TABS = ['Board','Feed','Bets','Challenges','Squad'];
  const feed = [
    { id:'f1', dot:T.accent, bold:'GBruschy',    msg:'challenged RTrocado — GW Total Battle — 200 coins each',   time:'14:22', isChallenge:false },
    { id:'f2', dot:T.pos,    bold:'RTrocado',    msg:'accepted. Challenge is live.',                             time:'14:25', isChallenge:false },
    { id:'f3', dot:T.gold,   bold:'RTrocado',    msg:'beat GBruschy · 61 pts vs 39 pts · +180 coins',           time:'21:58', isResult:true },
    { id:'f4', dot:T.gold,   bold:'PabloK',      msg:'challenged you — Player Duel — 150 coins each · 6 hrs',   time:'22:04', isIncoming:true },
  ];
  return (
    <div style={{ background:T.bg, display:'flex', flexDirection:'column', minHeight:'100%' }}>
      <div style={{ background:T.shell }}>
        <MobileStatusBar/>
        <div style={{ padding:'10px 16px 0' }}>
          <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:8, letterSpacing:'.16em', textTransform:'uppercase', color:'rgba(255,255,255,.38)', marginBottom:4 }}>The Gaffer's Cup · GW31</div>
          <div style={{ fontFamily:"'Archivo Black',sans-serif", fontSize:20, color:'#fff', letterSpacing:'-0.02em' }}>Feed</div>
        </div>
        <div style={{ display:'flex', marginTop:12, borderBottom:'1px solid rgba(255,255,255,.08)' }}>
          {TABS.map(tab => {
            const on = tab === 'Feed';
            return (
              <div key={tab} style={{ padding:'8px 11px 10px', position:'relative', flexShrink:0, fontFamily:"'Archivo',sans-serif", fontSize:11, fontWeight:on?600:400, color:on?'#fff':'rgba(255,255,255,.4)' }}>
                {tab}{on&&<div style={{ position:'absolute', left:11, right:11, bottom:0, height:2, background:T.accent, borderRadius:'2px 2px 0 0' }}/>}
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ padding:'14px 16px 8px' }}>
        <SectionLabel label="Challenge activity · GW31"/>
      </div>

      <div style={{ display:'flex', flexDirection:'column' }}>
        {feed.map((item, i) => (
          <div key={item.id} style={{
            display:'flex', gap:12, padding:'12px 16px',
            borderBottom:`1px solid ${T.rule}`,
            background:item.isIncoming ? T.goldBg : (item.isResult ? 'rgba(184,114,14,.04)' : T.card),
            borderLeft:item.isIncoming ? `3px solid ${T.gold}` : '3px solid transparent',
          }}>
            <div style={{ display:'flex', flexDirection:'column', alignItems:'center', flexShrink:0, marginTop:4 }}>
              <div style={{ width:10, height:10, borderRadius:'50%', background:item.dot }}/>
              {i < feed.length - 1 && <div style={{ width:2, flex:1, background:T.rule, marginTop:4, minHeight:18 }}/>}
            </div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:13.5, color:T.text, lineHeight:1.4, marginBottom:item.isIncoming?8:0 }}>
                <strong style={{ fontFamily:"'Archivo Black',sans-serif", letterSpacing:'-0.01em' }}>{item.bold}</strong>{' '}{item.msg}
              </div>
              {item.isIncoming && (
                <div style={{ display:'flex', gap:8 }}>
                  <button style={{ padding:'7px 14px', borderRadius:T.r, background:'transparent', border:`1.5px solid ${T.gold}`, fontFamily:"'JetBrains Mono',monospace", fontSize:9, letterSpacing:'.1em', textTransform:'uppercase', color:T.gold, cursor:'pointer', fontWeight:600 }}>Accept</button>
                  <button style={{ padding:'7px 14px', borderRadius:T.r, background:'transparent', border:`1px solid ${T.rule}`, fontFamily:"'JetBrains Mono',monospace", fontSize:9, letterSpacing:'.1em', textTransform:'uppercase', color:T.text2, cursor:'pointer' }}>Decline</button>
                </div>
              )}
            </div>
            <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:8.5, color:T.mute, flexShrink:0, marginTop:4 }}>{item.time}</span>
          </div>
        ))}
      </div>

      {/* Challenge prompt */}
      <div style={{ padding:'14px 16px', display:'flex', alignItems:'center', gap:10 }}>
        <div style={{ flex:1, fontFamily:"'JetBrains Mono',monospace", fontSize:9.5, color:T.mute, letterSpacing:'.04em' }}>GBruschy just lost one. Now's your chance.</div>
        <button style={{ padding:'8px 14px', borderRadius:T.r, background:T.gold, border:'none', cursor:'pointer', fontFamily:"'JetBrains Mono',monospace", fontSize:9, letterSpacing:'.1em', textTransform:'uppercase', color:'#fff', fontWeight:600, whiteSpace:'nowrap' }}>Challenge →</button>
      </div>

      <MobileBottomNav active='league'/>
    </div>
  );
}

// ── Screen 8b: Activity Feed — Desktop ───────────────────────
function ActivityFeedDesktop() {
  const TABS = ['Leaderboard','Feed','Bets','Challenges','Squad'];
  const feed = [
    { id:'f1', dot:T.accent, bold:'GBruschy',  msg:'challenged RTrocado — GW Total Battle — 200 coins each',  time:'GW31 · 14:22' },
    { id:'f2', dot:T.pos,    bold:'RTrocado',  msg:'accepted the challenge. Game on.',                        time:'GW31 · 14:25' },
    { id:'f3', dot:T.gold,   bold:'RTrocado',  msg:'beat GBruschy · 61 pts vs 39 pts · +180 coins',          time:'GW31 · 21:58' },
  ];
  return (
    <div style={{ display:'flex', height:'100%', minHeight:500, background:T.bg, fontFamily:"'Archivo',sans-serif" }}>
      <DesktopSidebar active='league'/>
      <div style={{ flex:1, display:'flex', flexDirection:'column', minWidth:0 }}>
        <div style={{ background:T.card, borderBottom:`1px solid ${T.rule}`, padding:'20px 28px 0' }}>
          <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:8.5, letterSpacing:'.16em', textTransform:'uppercase', color:T.mute, marginBottom:6 }}>The Gaffer's Cup · GW31</div>
          <div style={{ fontFamily:"'Archivo Black',sans-serif", fontSize:26, color:T.text, letterSpacing:'-0.02em', marginBottom:16 }}>Feed</div>
          <div style={{ display:'flex' }}>
            {TABS.map(tab => {
              const on = tab === 'Feed';
              return (
                <div key={tab} style={{ padding:'9px 16px 10px', position:'relative', cursor:'pointer', fontFamily:"'Archivo',sans-serif", fontSize:13, fontWeight:on?600:400, color:on?T.text:T.mute }}>
                  {tab}{on&&<div style={{ position:'absolute', left:16, right:16, bottom:-1, height:2, background:T.accent, borderRadius:'2px 2px 0 0' }}/>}
                </div>
              );
            })}
          </div>
        </div>
        <div style={{ flex:1, padding:'24px 28px', display:'flex', gap:24, minWidth:0 }}>

          {/* Feed column */}
          <div style={{ flex:1, minWidth:0 }}>
            <SectionLabel label="Challenge activity · GW31"/>
            <div style={{ background:T.card, border:`1px solid ${T.rule}`, borderRadius:T.r, overflow:'hidden' }}>
              {feed.map((item, i) => (
                <div key={item.id} style={{ display:'flex', gap:14, padding:'15px 18px', borderBottom:i < feed.length-1?`1px solid ${T.rule2}`:'none', alignItems:'flex-start' }}>
                  <div style={{ display:'flex', flexDirection:'column', alignItems:'center', flexShrink:0 }}>
                    <div style={{ width:10, height:10, borderRadius:'50%', background:item.dot, marginTop:3 }}/>
                    {i < feed.length-1 && <div style={{ width:2, flex:1, background:T.rule, marginTop:6, minHeight:22 }}/>}
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:14, color:T.text, lineHeight:1.45 }}>
                      <strong style={{ fontFamily:"'Archivo Black',sans-serif", letterSpacing:'-0.01em' }}>{item.bold}</strong>{' '}{item.msg}
                    </div>
                  </div>
                  <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:9, color:T.mute, flexShrink:0, marginTop:4 }}>{item.time}</div>
                </div>
              ))}
            </div>
            <div style={{ marginTop:12, display:'flex', alignItems:'center', gap:10 }}>
              <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:9.5, color:T.mute }}>GBruschy just lost one. Now's your chance.</span>
              <button style={{ padding:'7px 14px', borderRadius:T.r, background:T.gold, border:'none', cursor:'pointer', fontFamily:"'JetBrains Mono',monospace", fontSize:9, letterSpacing:'.1em', textTransform:'uppercase', color:'#fff', fontWeight:600 }}>Challenge GBruschy →</button>
            </div>
          </div>

          {/* Standings panel */}
          <div style={{ width:240, flexShrink:0 }}>
            <SectionLabel label="Standing · GW31"/>
            <div style={{ background:T.card, border:`1px solid ${T.rule}`, borderRadius:T.r, overflow:'hidden' }}>
              {MGRS.map((m, i) => (
                <div key={m.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 12px', borderBottom:i < MGRS.length-1?`1px solid ${T.rule2}`:'none', background:m.isMe?T.accBg:'transparent' }}>
                  <span style={{ fontFamily:"'Archivo Black',sans-serif", fontSize:11, color:m.rank<=2?T.accent:T.mute, width:16 }}>#{m.rank}</span>
                  <span style={{ fontFamily:"'Archivo Black',sans-serif", fontSize:13, color:T.text, flex:1, letterSpacing:'-0.01em' }}>{m.name}{m.isMe?' ·':''}</span>
                  <span style={{ fontFamily:"'Archivo Black',sans-serif", fontSize:13, color:T.accent }}>{m.gw}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, {
  ResolutionWin, ResolutionLoss, ResolutionDraw,
  WalletMobile, WalletDesktop,
  BuyCoinsMobile, BuyCoinsDesktop,
  ActivityFeedMobile, ActivityFeedDesktop,
});
