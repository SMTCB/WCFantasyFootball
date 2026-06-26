/* global React, LH_BETS, lhMgrById, MgrTag, HubTopbar, HubActionBar, HubTabs, HubSectionLabel */

// ───────────────────────────────────────────────────────────────────
// ADMIN TAB — Commissioner controls for the LEAGUE HUB.
//
// Design priorities (function first, decoration last):
//   1. Every control says WHAT it does, WHEN it's safe, and WHAT CHANGES after.
//   2. Bet creation is the headline workflow — a 4-step wizard with a live
//      preview of the BetRow the league will actually see.
//   3. Season state is shown as a stepper at the top so the admin always
//      knows where in the lifecycle they are before they pull a lever.
//   4. Color coding signals criticality, not decoration:
//        cyan    = safe / configure
//        gold    = one-way / season-changing
//        purple  = lifecycle stage transition
//        danger  = stop / close / hard halt
//        positive= go / open / publish
// ───────────────────────────────────────────────────────────────────

// ──────────────────────────────────────────────────────────────────
// 1. SEASON STATE STEPPER
// ──────────────────────────────────────────────────────────────────
function SeasonStepper(){
  // 5 phases. "active" = current step. "done" = completed. "todo" = ahead.
  const phases = [
    { id:'transfers',  label:'TRANSFER WINDOW', state:'done', sub:'Closed · GW27' },
    { id:'draft',      label:'DRAFT DEADLINE',  state:'done', sub:'15 Mar 19:00' },
    { id:'allocation', label:'ALLOCATION',      state:'done', sub:'12 conflicts resolved' },
    { id:'cup',        label:'CUP SEEDED',      state:'active', sub:'Pool ready · run when set' },
    { id:'season',     label:'IN SEASON · GW28', state:'todo', sub:'Live · 2h 36m to lock' },
  ];
  const tone = (s) => s==='done' ? 'var(--positive)' : s==='active' ? 'var(--cyan)' : 'var(--mute)';
  return (
    <div style={{padding:'18px 28px 22px',borderBottom:'1px solid var(--rule)',background:'var(--ink-2)'}}>
      <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:14}}>
        <span style={{width:3,height:14,background:'var(--purple)'}}/>
        <span className="mono" style={{fontSize:11,letterSpacing:'.22em',color:'var(--paper)'}}>COMMISSIONER CONTROLS</span>
        <span className="mono" style={{fontSize:9,letterSpacing:'.22em',color:'var(--mute)'}}>· ADMIN ONLY · CHANGES TAKE EFFECT IMMEDIATELY</span>
        <span style={{flex:1}}/>
        <span className="mono" style={{fontSize:9,letterSpacing:'.22em',color:'var(--mute)'}}>OFFICE HEROES · 14 MGRS · GW28</span>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'repeat(5, 1fr)',position:'relative',gap:0}}>
        {/* connecting line */}
        <div style={{position:'absolute',top:14,left:'10%',right:'10%',height:1,background:'var(--rule)'}}/>
        {phases.map((p, i) => {
          const t = tone(p.state);
          return (
            <div key={p.id} style={{display:'flex',flexDirection:'column',alignItems:'center',gap:8,position:'relative'}}>
              <span style={{
                width:28,height:28,borderRadius:'50%',
                background: p.state==='done' ? t : 'var(--ink-2)',
                border:`1.5px solid ${t}`,
                display:'inline-flex',alignItems:'center',justifyContent:'center',
                fontFamily:'JetBrains Mono,monospace',fontSize:11,fontWeight:600,
                color: p.state==='done' ? 'var(--ink)' : t,
                position:'relative',zIndex:1,
              }}>
                {p.state==='done' ? '✓' : i+1}
              </span>
              <span className="mono" style={{fontSize:9,letterSpacing:'.2em',color:t,textAlign:'center'}}>{p.label}</span>
              <span className="mono" style={{fontSize:9,letterSpacing:'.14em',color:'var(--mute)',textAlign:'center'}}>{p.sub}</span>
              {p.state==='active' && (
                <span className="mono" style={{
                  fontSize:8,letterSpacing:'.22em',color:'var(--cyan)',
                  border:'1px solid var(--cyan)55',padding:'2px 6px',marginTop:2,
                }}>● YOU ARE HERE</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// 2. CREATE BET WIZARD
//    Steps: TYPE → CONFIGURE → REWARD → PUBLISH
// ──────────────────────────────────────────────────────────────────

const BET_TYPES = [
  {
    id:'top-scorer',
    label:'TOP SCORER',
    glyph:'◉',
    tone:'var(--cyan)',
    hint:'Who scores the most goals across the fixture / gameweek?',
    body:'Auto-resolves at final whistle. Tie-break: assists → minutes.',
  },
  {
    id:'match-result',
    label:'MATCH RESULT',
    glyph:'◈',
    tone:'var(--positive)',
    hint:'Predict the outcome of a single fixture.',
    body:'Options are auto-generated: HOME · DRAW · AWAY. Resolves at FT.',
  },
  {
    id:'player-block',
    label:'PLAYER BLOCK',
    glyph:'⛌',
    tone:'var(--danger)',
    hint:'Pick a player to BLOCK — if they flop, you earn points.',
    body:'A flop = 0 goals + ≤30 min played, OR a red card. Resolves at FT.',
  },
];

const MOCK_FIXTURES = [
  { id:'mci-bha', label:'Man City · Brighton', kickoff:'Sat 14:00', md:'MD5' },
  { id:'che-liv', label:'Chelsea · Liverpool',  kickoff:'Sat 16:30', md:'MD5' },
  { id:'ars-tot', label:'Arsenal · Tottenham',  kickoff:'Sun 16:30', md:'MD5' },
  { id:'avl-eve', label:'Aston Villa · Everton', kickoff:'Sun 14:00', md:'MD5' },
  { id:'whu-new', label:'West Ham · Newcastle',  kickoff:'Mon 20:00', md:'MD5' },
];

const MOCK_PLAYERS = ['Haaland (MCI)','Palmer (CHE)','Salah (LIV)','Saka (ARS)','Watkins (AVL)','Isak (NEW)','Son (TOT)','Mitoma (BHA)'];

function CreateBetWizard(){
  const [step, setStep]   = React.useState(1);
  const [type, setType]   = React.useState(null);
  const [fixture, setFix] = React.useState('');
  const [players, setPlayers] = React.useState(['Haaland (MCI)','Palmer (CHE)','Salah (LIV)','Saka (ARS)','Watkins (AVL)']);
  const [blockPlayer, setBlockPlayer] = React.useState('');
  const [reward, setReward] = React.useState(5);
  const [closes, setCloses] = React.useState('Sat 13:30');
  const [title,  setTitle]  = React.useState('');

  // helpers
  const typeMeta = BET_TYPES.find(t => t.id === type) || null;
  const fixtureMeta = MOCK_FIXTURES.find(f => f.id === fixture) || null;
  const autoTitle = (() => {
    if(!typeMeta) return '';
    if(type==='top-scorer')   return fixtureMeta ? `Top scorer · ${fixtureMeta.label}` : 'Top scorer · GW28';
    if(type==='match-result') return fixtureMeta ? `Result · ${fixtureMeta.label}` : 'Match result';
    if(type==='player-block') return blockPlayer ? `Block · ${blockPlayer}` : 'Player block';
    return '';
  })();
  const computedTitle = title || autoTitle;

  const canStep2 = !!type;
  const canStep3 = type==='player-block' ? !!fixture : (type ? !!fixture : false);
  const canStep4 = !!reward && !!closes;

  const reset = () => { setStep(1); setType(null); setFix(''); setBlockPlayer(''); setReward(5); setCloses('Sat 13:30'); setTitle(''); };

  return (
    <div style={{display:'flex',flexDirection:'column',minHeight:0}}>
      <HubSectionLabel
        label="CREATE BET"
        sub="A new prediction for the league"
        tone="var(--cyan)"
        right={
          <button onClick={reset} style={{
            background:'transparent',border:'1px solid var(--rule)',color:'var(--mute)',
            fontFamily:'JetBrains Mono,monospace',fontSize:9,letterSpacing:'.22em',
            padding:'5px 10px',cursor:'pointer',
          }}>↻ RESET</button>
        }
      />

      {/* Step rail */}
      <div style={{
        display:'grid',gridTemplateColumns:'repeat(4, 1fr)',
        borderBottom:'1px solid var(--rule)',background:'var(--ink)',
      }}>
        {[
          { n:1, label:'TYPE',      reached:true,     done:!!type    },
          { n:2, label:'CONFIGURE', reached:canStep2, done:!!fixture },
          { n:3, label:'REWARD',    reached:canStep3, done:canStep4  },
          { n:4, label:'PUBLISH',   reached:canStep4, done:false     },
        ].map(s => {
          const active = step === s.n;
          const tone = !s.reached ? 'var(--mute)' : (active ? 'var(--cyan)' : (s.done ? 'var(--positive)' : 'var(--paper)'));
          return (
            <button key={s.n}
              disabled={!s.reached}
              onClick={() => s.reached && setStep(s.n)}
              style={{
                background:'transparent',
                borderTop:'none',borderBottom: active ? `2px solid ${tone}` : '2px solid transparent',
                borderLeft:'none',borderRight: s.n<4 ? '1px solid var(--rule)' : 'none',
                padding:'14px 16px',cursor:s.reached?'pointer':'not-allowed',
                color:tone,textAlign:'left',
                display:'flex',alignItems:'center',gap:10,
              }}>
              <span style={{
                width:22,height:22,borderRadius:'50%',
                border:`1.5px solid ${tone}`,
                background: s.done ? tone : 'transparent',
                color: s.done ? 'var(--ink)' : tone,
                display:'inline-flex',alignItems:'center',justifyContent:'center',
                fontFamily:'JetBrains Mono,monospace',fontSize:10,fontWeight:600,
              }}>{s.done ? '✓' : s.n}</span>
              <span style={{display:'flex',flexDirection:'column'}}>
                <span className="mono" style={{fontSize:9,letterSpacing:'.22em',color:'var(--mute)'}}>STEP {s.n}</span>
                <span className="mono" style={{fontSize:11,letterSpacing:'.18em',color:tone}}>{s.label}</span>
              </span>
            </button>
          );
        })}
      </div>

      {/* Wizard body: form on left, live preview on right */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 320px',minHeight:0}}>
        <div style={{padding:'22px 24px',display:'flex',flexDirection:'column',gap:18,borderRight:'1px solid var(--rule)'}}>

          {step === 1 && (
            <>
              <FieldHelp num="01" label="WHAT KIND OF BET?" hint="Each type uses a different resolution rule. Pick one — you can change it before publishing."/>
              <div style={{display:'grid',gridTemplateColumns:'repeat(3, 1fr)',gap:10}}>
                {BET_TYPES.map(t => {
                  const picked = type === t.id;
                  return (
                    <button key={t.id} onClick={() => setType(t.id)} style={{
                      textAlign:'left',cursor:'pointer',
                      background: picked ? `${t.tone}10` : 'var(--ink-2)',
                      border: picked ? `1px solid ${t.tone}` : '1px solid var(--rule)',
                      borderLeft: picked ? `3px solid ${t.tone}` : '3px solid transparent',
                      padding:'14px 16px',display:'flex',flexDirection:'column',gap:8,minHeight:140,
                    }}>
                      <span style={{
                        width:30,height:30,display:'inline-flex',alignItems:'center',justifyContent:'center',
                        background:`${t.tone}18`,border:`1px solid ${t.tone}55`,
                        fontFamily:'Archivo Black',fontSize:15,color:t.tone,
                      }}>{t.glyph}</span>
                      <span style={{fontFamily:'Archivo Black',fontSize:14,letterSpacing:'-0.01em',color:'var(--paper)'}}>{t.label}</span>
                      <span style={{fontSize:11,lineHeight:1.4,color:'var(--mute)',fontFamily:'Archivo,sans-serif'}}>{t.hint}</span>
                      <span className="mono" style={{fontSize:9,letterSpacing:'.16em',color:t.tone,marginTop:'auto'}}>{picked ? '● SELECTED' : 'CHOOSE →'}</span>
                    </button>
                  );
                })}
              </div>
              <NextBar onNext={() => setStep(2)} canNext={canStep2} hint={!type && 'Pick a bet type to continue.'}/>
            </>
          )}

          {step === 2 && (
            <>
              <FieldHelp num="02" label="WHICH FIXTURE?" hint={typeMeta?.body || 'Configure the resolution scope.'}/>
              <Field label="Fixture · GW28" sub="Bet will resolve at this match's final whistle.">
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                  {MOCK_FIXTURES.map(f => {
                    const picked = fixture === f.id;
                    return (
                      <button key={f.id} onClick={() => setFix(f.id)} style={{
                        textAlign:'left',cursor:'pointer',
                        background: picked ? 'rgba(0,180,216,.08)' : 'var(--ink)',
                        border: picked ? '1px solid var(--cyan)' : '1px solid var(--rule)',
                        padding:'10px 12px',display:'flex',alignItems:'center',gap:10,
                      }}>
                        <span style={{
                          width:14,height:14,borderRadius:'50%',
                          border:`1.5px solid ${picked?'var(--cyan)':'var(--rule)'}`,
                          background: picked ? 'var(--cyan)' : 'transparent',
                        }}/>
                        <div style={{display:'flex',flexDirection:'column',gap:2,flex:1,minWidth:0}}>
                          <span style={{fontFamily:'Archivo Black',fontSize:12,color:'var(--paper)'}}>{f.label}</span>
                          <span className="mono" style={{fontSize:9,letterSpacing:'.16em',color:'var(--mute)'}}>{f.md} · {f.kickoff}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </Field>

              {type === 'top-scorer' && (
                <Field label="Player pool" sub="Managers pick one. Add or remove — 3 to 8 work best.">
                  <PlayerChipPool selected={players} onChange={setPlayers}/>
                </Field>
              )}

              {type === 'player-block' && (
                <Field label="Block target" sub="Managers will pick this player to block (flop = points).">
                  <select value={blockPlayer} onChange={e => setBlockPlayer(e.target.value)} style={selectStyle}>
                    <option value="">— Choose a player —</option>
                    {MOCK_PLAYERS.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </Field>
              )}

              {type === 'match-result' && (
                <div style={{
                  padding:'10px 12px',background:'var(--ink)',border:'1px solid var(--rule)',
                  fontSize:11,lineHeight:1.5,color:'var(--mute)',fontFamily:'Archivo,sans-serif',
                }}>
                  <span className="mono" style={{fontSize:9,letterSpacing:'.2em',color:'var(--positive)'}}>● AUTO</span>{' '}
                  Options are generated from the fixture: <b style={{color:'var(--paper)'}}>HOME · DRAW · AWAY</b>. No further config needed.
                </div>
              )}

              <NextBar onBack={() => setStep(1)} onNext={() => setStep(3)} canNext={!!fixture && (type!=='player-block' || !!blockPlayer)} hint={!fixture && 'Pick a fixture to continue.'}/>
            </>
          )}

          {step === 3 && (
            <>
              <FieldHelp num="03" label="HOW MUCH IS IT WORTH?" hint="Reward in points. Tougher bets pay more. Closes-at locks picks; after that no manager can change."/>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
                <Field label="Reward · base points" sub="Multipliers apply per-pick based on league spread.">
                  <RewardStepper value={reward} onChange={setReward}/>
                </Field>
                <Field label="Picks close at" sub="Default = 30 min before kickoff.">
                  <input type="text" value={closes} onChange={e => setCloses(e.target.value)} style={inputStyle}/>
                </Field>
              </div>
              <Field label="Bet title" sub={`Shown in BETS tab. Leave blank to use: "${autoTitle}"`}>
                <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder={autoTitle} style={inputStyle}/>
              </Field>

              <NextBar onBack={() => setStep(2)} onNext={() => setStep(4)} canNext={canStep4}/>
            </>
          )}

          {step === 4 && (
            <>
              <FieldHelp num="04" label="REVIEW & PUBLISH" hint="The preview on the right is exactly what every manager will see in the BETS tab. Publishing notifies the league."/>
              <div style={{display:'flex',flexDirection:'column',gap:8}}>
                <SummaryRow k="TYPE"    v={typeMeta?.label}/>
                <SummaryRow k="FIXTURE" v={fixtureMeta?.label} sub={fixtureMeta && `${fixtureMeta.md} · ${fixtureMeta.kickoff}`}/>
                {type==='top-scorer'   && <SummaryRow k="PLAYER POOL" v={`${players.length} players`}/>}
                {type==='player-block' && <SummaryRow k="BLOCK TARGET" v={blockPlayer}/>}
                {type==='match-result' && <SummaryRow k="OPTIONS" v="HOME · DRAW · AWAY"/>}
                <SummaryRow k="REWARD"  v={`+${reward} PTS`} tone="var(--positive)"/>
                <SummaryRow k="LOCKS"   v={closes}/>
                <SummaryRow k="TITLE"   v={computedTitle}/>
              </div>

              <div style={{
                padding:'10px 12px',background:'rgba(224,168,0,.06)',border:'1px solid var(--gold)55',
                fontSize:11,lineHeight:1.5,color:'var(--paper)',fontFamily:'Archivo,sans-serif',
              }}>
                <span className="mono" style={{fontSize:9,letterSpacing:'.22em',color:'var(--gold)'}}>● NOTE</span>{' '}
                Publishing pushes a notification to <b>14 managers</b> and opens picks immediately. You can edit until the first manager picks.
              </div>

              <div style={{display:'flex',gap:10}}>
                <button onClick={() => setStep(3)} style={{...btnBaseStyle, background:'transparent',border:'1px solid var(--rule)',color:'var(--mute)'}}>← BACK</button>
                <button style={{...btnBaseStyle, background:'var(--positive)',color:'var(--ink)',flex:1,fontFamily:'Archivo Black',letterSpacing:'.18em'}}>
                  PUBLISH BET →
                </button>
              </div>
            </>
          )}
        </div>

        {/* Live preview */}
        <aside style={{padding:'18px 18px',background:'var(--ink-2)',display:'flex',flexDirection:'column',gap:10}}>
          <span className="mono" style={{fontSize:9,letterSpacing:'.22em',color:'var(--mute)'}}>LIVE PREVIEW · WHAT MANAGERS WILL SEE</span>
          <BetCardPreview
            type={type}
            title={computedTitle}
            reward={reward}
            closes={closes}
            fixture={fixtureMeta}
            players={players}
            blockPlayer={blockPlayer}
          />
          <span className="mono" style={{fontSize:9,letterSpacing:'.16em',color:'var(--mute)',lineHeight:1.5}}>
            UPDATES AS YOU EDIT. THIS CARD APPEARS IN THE <b style={{color:'var(--cyan)'}}>BETS TAB</b> FOR EVERY MANAGER ONCE PUBLISHED.
          </span>
        </aside>
      </div>
    </div>
  );
}

function FieldHelp({ num, label, hint }){
  return (
    <div style={{display:'flex',flexDirection:'column',gap:4}}>
      <div style={{display:'flex',alignItems:'baseline',gap:10}}>
        <span className="mono" style={{fontSize:10,letterSpacing:'.22em',color:'var(--cyan)'}}>{num}</span>
        <span className="mono" style={{fontSize:11,letterSpacing:'.22em',color:'var(--paper)'}}>{label}</span>
      </div>
      <span style={{fontSize:12,color:'var(--mute)',fontFamily:'Archivo,sans-serif',lineHeight:1.5}}>{hint}</span>
    </div>
  );
}

function Field({ label, sub, children }){
  return (
    <div style={{display:'flex',flexDirection:'column',gap:8}}>
      <div style={{display:'flex',flexDirection:'column',gap:2}}>
        <span className="mono" style={{fontSize:10,letterSpacing:'.22em',color:'var(--paper)'}}>{label}</span>
        {sub && <span style={{fontSize:11,color:'var(--mute)',fontFamily:'Archivo,sans-serif'}}>{sub}</span>}
      </div>
      {children}
    </div>
  );
}

const inputStyle = {
  background:'var(--ink)',border:'1px solid var(--rule)',color:'var(--paper)',
  padding:'10px 12px',fontFamily:'JetBrains Mono,monospace',fontSize:12,letterSpacing:'.06em',
  outline:'none',
};
const selectStyle = { ...inputStyle, appearance:'none' };
const btnBaseStyle = {
  padding:'12px 16px',border:0,cursor:'pointer',
  fontFamily:'JetBrains Mono,monospace',fontSize:11,letterSpacing:'.22em',fontWeight:600,
};

function PlayerChipPool({ selected, onChange }){
  return (
    <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
      {MOCK_PLAYERS.map(p => {
        const on = selected.includes(p);
        return (
          <button key={p} onClick={() => onChange(on ? selected.filter(x => x !== p) : [...selected, p])} style={{
            padding:'6px 10px',cursor:'pointer',
            background: on ? 'rgba(0,180,216,.08)' : 'var(--ink)',
            border: on ? '1px solid var(--cyan)' : '1px solid var(--rule)',
            color: on ? 'var(--cyan)' : 'var(--paper)',
            fontFamily:'JetBrains Mono,monospace',fontSize:10,letterSpacing:'.12em',
          }}>
            {on ? '✓ ' : '+ '}{p}
          </button>
        );
      })}
    </div>
  );
}

function RewardStepper({ value, onChange }){
  return (
    <div style={{display:'flex',gap:0,border:'1px solid var(--rule)',background:'var(--ink)',width:'fit-content'}}>
      <button onClick={() => onChange(Math.max(1, value-1))} style={{...stepBtn, borderRight:'1px solid var(--rule)'}}>−</button>
      <span style={{padding:'8px 18px',fontFamily:'Archivo Black',fontSize:18,color:'var(--positive)',minWidth:60,textAlign:'center'}}>+{value}</span>
      <button onClick={() => onChange(value+1)} style={{...stepBtn, borderLeft:'1px solid var(--rule)'}}>+</button>
    </div>
  );
}
const stepBtn = { background:'transparent',border:0,color:'var(--paper)',padding:'8px 14px',fontFamily:'JetBrains Mono,monospace',fontSize:14,cursor:'pointer' };

function SummaryRow({ k, v, sub, tone }){
  return (
    <div style={{
      display:'grid',gridTemplateColumns:'140px 1fr',gap:14,alignItems:'baseline',
      padding:'8px 0',borderBottom:'1px solid var(--rule)',
    }}>
      <span className="mono" style={{fontSize:9,letterSpacing:'.22em',color:'var(--mute)'}}>{k}</span>
      <div>
        <div style={{fontFamily:'Archivo Black',fontSize:13,color:tone||'var(--paper)'}}>{v || <span style={{color:'var(--mute)',fontFamily:'JetBrains Mono,monospace',fontSize:11,letterSpacing:'.18em'}}>NOT SET</span>}</div>
        {sub && <span className="mono" style={{fontSize:9,letterSpacing:'.16em',color:'var(--mute)'}}>{sub}</span>}
      </div>
    </div>
  );
}

function NextBar({ onBack, onNext, canNext, hint }){
  return (
    <div style={{display:'flex',alignItems:'center',gap:10,marginTop:'auto',paddingTop:14,borderTop:'1px solid var(--rule)'}}>
      {hint && <span className="mono" style={{fontSize:9,letterSpacing:'.18em',color:'var(--mute)'}}>{hint}</span>}
      <span style={{flex:1}}/>
      {onBack && <button onClick={onBack} style={{...btnBaseStyle, background:'transparent',border:'1px solid var(--rule)',color:'var(--mute)'}}>← BACK</button>}
      <button disabled={!canNext} onClick={onNext} style={{
        ...btnBaseStyle,
        background: canNext ? 'var(--cyan)' : 'var(--ink-3)',
        color: canNext ? 'var(--ink)' : 'var(--mute)',
        cursor: canNext ? 'pointer' : 'not-allowed',
        fontFamily:'Archivo Black',letterSpacing:'.18em',fontSize:12,
      }}>NEXT →</button>
    </div>
  );
}

// Mini-preview of the bet card managers will see (mirrors BetRow from league-bets.jsx).
function BetCardPreview({ type, title, reward, closes, fixture, players, blockPlayer }){
  const meta = BET_TYPES.find(t => t.id === type);
  if(!meta){
    return (
      <div style={{
        background:'var(--ink)',border:'1px dashed var(--rule)',padding:'22px 18px',
        display:'flex',flexDirection:'column',alignItems:'center',gap:6,color:'var(--mute)',
      }}>
        <span className="mono" style={{fontSize:10,letterSpacing:'.22em'}}>NO BET YET</span>
        <span style={{fontSize:11,fontFamily:'Archivo,sans-serif',textAlign:'center'}}>Choose a type to see the live preview.</span>
      </div>
    );
  }
  const options = type==='match-result'
    ? (fixture ? fixture.label.split(' · ').flatMap((c,i,arr) => i===0?[c,'DRAW']:[arr[1]]) : ['HOME','DRAW','AWAY'])
    : type==='top-scorer'
      ? players.slice(0,4).map(p => p.split(' (')[0])
      : blockPlayer ? [blockPlayer.split(' (')[0]] : [];

  return (
    <div style={{
      background:'var(--ink)',
      border:'1px solid var(--rule)',
      borderLeft:`3px solid ${meta.tone}`,
      padding:'14px 14px',display:'flex',flexDirection:'column',gap:10,
    }}>
      <div style={{display:'flex',alignItems:'center',gap:8}}>
        <span style={{
          width:22,height:22,display:'inline-flex',alignItems:'center',justifyContent:'center',
          background:`${meta.tone}15`,border:`1px solid ${meta.tone}55`,
          fontFamily:'Archivo Black',fontSize:12,color:meta.tone,
        }}>{meta.glyph}</span>
        <span style={{fontFamily:'Archivo Black',fontSize:13,color:meta.tone,letterSpacing:'-0.01em'}}>{meta.label}</span>
        <span style={{flex:1}}/>
        <span className="mono" style={{
          fontSize:9,letterSpacing:'.18em',color:'var(--positive)',
          padding:'2px 6px',border:'1px solid var(--positive)55',background:'rgba(34,197,94,.08)',
        }}>+{reward} PTS</span>
      </div>
      <div style={{fontFamily:'Archivo,sans-serif',fontSize:12,color:'var(--paper)',lineHeight:1.45}}>
        {title || <span style={{color:'var(--mute)'}}>(title pending)</span>}
      </div>
      {options.length > 0 && (
        <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>
          {options.map(o => (
            <span key={o} style={{
              padding:'4px 8px',fontFamily:'Archivo Black',fontSize:10,letterSpacing:'-0.01em',
              border:'1px solid var(--rule)',color:'var(--paper)',
            }}>{o}</span>
          ))}
        </div>
      )}
      <div style={{display:'flex',gap:10,alignItems:'center',marginTop:2}}>
        <span className="mono" style={{fontSize:9,letterSpacing:'.18em',color:'var(--mute)'}}>● LOCKS {closes}</span>
        <span style={{flex:1}}/>
        <span className="mono" style={{fontSize:9,letterSpacing:'.18em',color:'var(--cyan)'}}>MAKE PICK →</span>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// 3. RESOLVE PENDING BETS
//    A list of pending bets. Click → expand → enter answer → resolve.
// ──────────────────────────────────────────────────────────────────
function ResolvePendingBets(){
  const pending = LH_BETS.filter(b => b.state === 'pending');
  const [open, setOpen] = React.useState(pending[0]?.id || null);
  const [answer, setAnswer] = React.useState({});

  return (
    <div style={{display:'flex',flexDirection:'column',minHeight:0}}>
      <HubSectionLabel
        label="RESOLVE BETS"
        sub={`${pending.length} PENDING · WAITING ON YOU`}
        tone="var(--gold)"
        right={
          <span className="mono" style={{fontSize:9,letterSpacing:'.22em',color:'var(--mute)'}}>AUTO-RESOLVE IS OFF</span>
        }
      />
      <div style={{padding:'14px 22px 6px',fontSize:11,color:'var(--mute)',fontFamily:'Archivo,sans-serif',lineHeight:1.5}}>
        Pick a bet, enter the result, hit <b style={{color:'var(--gold)'}}>RESOLVE</b>. Points are awarded immediately and managers see the outcome in their BETS tab.
      </div>

      <div style={{display:'flex',flexDirection:'column',gap:8,padding:'8px 22px 22px'}}>
        {pending.map(b => {
          const isOpen = open === b.id;
          const meta = BET_TYPES.find(t => t.id === b.kind) ||
                       BET_TYPES.find(t => b.kind === 'block') && BET_TYPES[2] ||
                       { tone:'var(--paper)', glyph:'◈', label:'BET' };
          const tone = meta.tone;
          return (
            <div key={b.id} style={{
              background:'var(--ink-2)',
              border:'1px solid var(--rule)',
              borderLeft:`3px solid ${tone}`,
            }}>
              <button onClick={() => setOpen(isOpen ? null : b.id)} style={{
                width:'100%',background:'transparent',border:0,color:'var(--paper)',
                padding:'12px 14px',display:'flex',alignItems:'center',gap:10,cursor:'pointer',textAlign:'left',
              }}>
                <span style={{
                  width:22,height:22,display:'inline-flex',alignItems:'center',justifyContent:'center',
                  background:`${tone}15`,border:`1px solid ${tone}55`,
                  fontFamily:'Archivo Black',fontSize:12,color:tone,
                }}>{meta.glyph}</span>
                <div style={{display:'flex',flexDirection:'column',gap:2,flex:1,minWidth:0}}>
                  <span style={{fontFamily:'Archivo Black',fontSize:13,color:'var(--paper)'}}>{b.title}</span>
                  <span className="mono" style={{fontSize:9,letterSpacing:'.16em',color:'var(--mute)'}}>{b.code} · {b.q}</span>
                </div>
                <span className="mono" style={{fontSize:9,letterSpacing:'.22em',color:'var(--gold)'}}>● PENDING</span>
                <span style={{color:'var(--mute)',fontFamily:'JetBrains Mono,monospace',fontSize:14}}>{isOpen?'−':'+'}</span>
              </button>

              {isOpen && (
                <div style={{padding:'4px 14px 14px',display:'flex',flexDirection:'column',gap:12,borderTop:'1px solid var(--rule)'}}>
                  {/* who picked what */}
                  <div>
                    <span className="mono" style={{fontSize:9,letterSpacing:'.22em',color:'var(--mute)'}}>WHO PICKED WHAT · 12/14</span>
                    <div style={{display:'flex',flexDirection:'column',gap:6,marginTop:8}}>
                      {(b.options || []).slice(0,3).map((opt, i) => (
                        <div key={opt} style={{display:'flex',alignItems:'center',gap:8}}>
                          <span style={{fontFamily:'Archivo Black',fontSize:11,minWidth:80,color:'var(--paper)'}}>{opt}</span>
                          <div style={{display:'flex',gap:3}}>
                            {['rai','olu','ade','ndo','mar','zoe'].slice(0, [4,3,2][i]||1).map(m => <MgrTag key={m} id={m}/>)}
                          </div>
                          <span style={{flex:1}}/>
                          <span className="mono" style={{fontSize:9,letterSpacing:'.14em',color:'var(--mute)'}}>{[4,3,2][i]||1} MGRS</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* answer entry */}
                  <Field label="ANSWER" sub="Select the winning option (or enter a custom result).">
                    <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                      {(b.options || []).map(opt => {
                        const picked = answer[b.id] === opt;
                        return (
                          <button key={opt} onClick={() => setAnswer({...answer, [b.id]: opt})} style={{
                            padding:'7px 11px',cursor:'pointer',
                            background: picked ? 'rgba(34,197,94,.08)' : 'var(--ink)',
                            border: picked ? '1px solid var(--positive)' : '1px solid var(--rule)',
                            color: picked ? 'var(--positive)' : 'var(--paper)',
                            fontFamily:'Archivo Black',fontSize:11,letterSpacing:'-0.01em',
                          }}>{picked ? '✓ ' : ''}{opt}</button>
                        );
                      })}
                    </div>
                  </Field>

                  <div style={{display:'flex',gap:8,alignItems:'center'}}>
                    <span className="mono" style={{fontSize:9,letterSpacing:'.16em',color:'var(--mute)'}}>
                      AWARDS <b style={{color:'var(--positive)'}}>+{b.reward} PTS</b> TO {answer[b.id] ? '4 MANAGERS' : '— '}
                    </span>
                    <span style={{flex:1}}/>
                    <button style={{...btnBaseStyle, background:'transparent',border:'1px solid var(--rule)',color:'var(--mute)'}}>VOID</button>
                    <button disabled={!answer[b.id]} style={{
                      ...btnBaseStyle,
                      background: answer[b.id] ? 'var(--gold)' : 'var(--ink-3)',
                      color: answer[b.id] ? 'var(--ink)' : 'var(--mute)',
                      cursor: answer[b.id] ? 'pointer' : 'not-allowed',
                      fontFamily:'Archivo Black',letterSpacing:'.18em',
                    }}>RESOLVE →</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {pending.length === 0 && (
          <div style={{padding:'18px 14px',background:'var(--ink-2)',border:'1px dashed var(--rule)',textAlign:'center'}}>
            <span className="mono" style={{fontSize:10,letterSpacing:'.22em',color:'var(--mute)'}}>NOTHING TO RESOLVE · ALL CAUGHT UP</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// 4. LIFECYCLE OPERATIONS
// ──────────────────────────────────────────────────────────────────
function LifecycleOp({ title, status, statusTone='var(--mute)', sub, when, children, primary }){
  return (
    <div style={{
      background:'var(--ink-2)',border:'1px solid var(--rule)',
      display:'flex',flexDirection:'column',minHeight:240,
    }}>
      <div style={{padding:'12px 16px',borderBottom:'1px solid var(--rule)',display:'flex',alignItems:'center',gap:10}}>
        <span style={{width:3,height:12,background:statusTone}}/>
        <span className="mono" style={{fontSize:10,letterSpacing:'.22em',color:'var(--paper)'}}>{title}</span>
        <span style={{flex:1}}/>
        <span className="mono" style={{fontSize:9,letterSpacing:'.22em',color:statusTone}}>● {status}</span>
      </div>
      <div style={{padding:'14px 16px',display:'flex',flexDirection:'column',gap:10,flex:1}}>
        {sub && <span style={{fontSize:11,color:'var(--mute)',fontFamily:'Archivo,sans-serif',lineHeight:1.5}}>{sub}</span>}
        {children}
        {when && (
          <div style={{
            marginTop:'auto',padding:'6px 8px',background:'var(--ink)',border:'1px solid var(--rule)',
            fontSize:10,color:'var(--mute)',fontFamily:'Archivo,sans-serif',lineHeight:1.4,
          }}>
            <span className="mono" style={{fontSize:9,letterSpacing:'.2em',color:'var(--paper)'}}>WHEN TO RUN · </span>
            {when}
          </div>
        )}
        {primary}
      </div>
    </div>
  );
}

function LifecycleOps(){
  return (
    <div style={{display:'flex',flexDirection:'column',minHeight:0}}>
      <HubSectionLabel label="LIFECYCLE OPERATIONS" sub="SEASON-STAGE CONTROLS" tone="var(--purple)"/>
      <div style={{padding:'18px 24px',display:'grid',gridTemplateColumns:'repeat(4, 1fr)',gap:14}}>

        {/* Transfer Window */}
        <LifecycleOp
          title="TRANSFER WINDOW"
          status="CLOSED"
          statusTone="var(--danger)"
          sub="Open and close the trading window. While open, managers swap players from the market."
          when="Open between gameweeks. Close 1h before the first MD kickoff."
          primary={
            <div style={{display:'flex',flexDirection:'column',gap:8}}>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6}}>
                <Field label="OPENS"><input type="text" defaultValue="Mon 09:00" style={inputStyle}/></Field>
                <Field label="CLOSES"><input type="text" defaultValue="Sat 13:00" style={inputStyle}/></Field>
              </div>
              <Field label="LIMIT" sub="Blank = unlimited.">
                <input type="text" defaultValue="5" style={inputStyle}/>
              </Field>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6,marginTop:4}}>
                <button style={{...btnBaseStyle, background:'var(--positive)',color:'var(--ink)',fontFamily:'Archivo Black',letterSpacing:'.18em'}}>OPEN</button>
                <button style={{...btnBaseStyle, background:'transparent',color:'var(--danger)',border:'1px solid var(--danger)55',fontFamily:'Archivo Black',letterSpacing:'.18em'}}>CLOSE NOW</button>
              </div>
            </div>
          }
        />

        {/* Draft Deadline + Run Allocation */}
        <LifecycleOp
          title="DRAFT"
          status="DEADLINE SET · 15 MAR"
          statusTone="var(--positive)"
          sub="Set the pick deadline, then run the allocation engine. Allocation runs once per season."
          when="After all managers submit picks. Before GW1 kickoff."
          primary={
            <div style={{display:'flex',flexDirection:'column',gap:8}}>
              <Field label="DEADLINE">
                <input type="text" defaultValue="15/03/2026 19:00" style={inputStyle}/>
              </Field>
              <button style={{...btnBaseStyle, background:'transparent',color:'var(--paper)',border:'1px solid var(--rule)',fontFamily:'Archivo Black',letterSpacing:'.18em'}}>SET DEADLINE</button>
              <div style={{height:1,background:'var(--rule)',margin:'4px 0'}}/>
              <div className="mono" style={{fontSize:9,letterSpacing:'.18em',color:'var(--mute)'}}>
                ONCE DONE · ALLOCATES 15 PLAYERS / MGR · £100M BUDGET · POSITION LIMITS GK≤2 / DEF≤5 / MID≤5 / FWD≤3
              </div>
              <button style={{...btnBaseStyle, background:'var(--gold)',color:'var(--ink)',fontFamily:'Archivo Black',letterSpacing:'.18em'}}>RUN ALLOCATION ↯</button>
            </div>
          }
        />

        {/* Cup Phase */}
        <LifecycleOp
          title="CUP PHASE"
          status="UNSEEDED"
          statusTone="var(--warn)"
          sub="Seed cup clubs into the no-repeat pool. Each manager picks one cup club per week without repeats."
          when="After Run Allocation is complete. Before the cup-phase rounds begin."
          primary={
            <div style={{display:'flex',flexDirection:'column',gap:8}}>
              <div style={{
                padding:'8px 10px',background:'var(--ink)',border:'1px solid var(--rule)',
                fontSize:10,color:'var(--mute)',fontFamily:'Archivo,sans-serif',lineHeight:1.5,
              }}>
                <span className="mono" style={{fontSize:9,letterSpacing:'.2em',color:'var(--purple)'}}>20 CLUBS · 14 MGRS</span><br/>
                Each mgr will use a club at most once during cup rounds.
              </div>
              <button style={{...btnBaseStyle, background:'var(--purple)',color:'var(--paper)',fontFamily:'Archivo Black',letterSpacing:'.18em',marginTop:'auto'}}>SEED CUP CLUBS ↯</button>
            </div>
          }
        />

        {/* Score Recalc */}
        <LifecycleOp
          title="SCORE RECALCULATION"
          status="UTILITY · ON-DEMAND"
          statusTone="var(--mute)"
          sub="Re-run scoring for a specific fixture. Use when a stat-provider correction lands or after a manual override."
          when="Anytime. Safe — only re-applies the latest data."
          primary={
            <div style={{display:'flex',flexDirection:'column',gap:8}}>
              <Field label="FIXTURE ID">
                <input type="text" defaultValue="mci-bha · MD5" style={inputStyle}/>
              </Field>
              <div style={{
                padding:'8px 10px',background:'var(--ink)',border:'1px solid var(--rule)',
                fontSize:10,color:'var(--mute)',fontFamily:'Archivo,sans-serif',lineHeight:1.5,
              }}>
                <span className="mono" style={{fontSize:9,letterSpacing:'.2em',color:'var(--paper)'}}>LAST RUN · </span>
                GW27 · 2 days ago · 4 pts diff
              </div>
              <button style={{...btnBaseStyle, background:'var(--warn)',color:'var(--ink)',fontFamily:'Archivo Black',letterSpacing:'.18em',marginTop:'auto'}}>RECALCULATE SCORES ↯</button>
            </div>
          }
        />
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Compose the tab
// ──────────────────────────────────────────────────────────────────
function AdminTab(){
  return (
    <div style={{display:'flex',flexDirection:'column',width:'100%',height:'100%',background:'var(--ink)',color:'var(--paper)',fontFamily:'Archivo,sans-serif'}}>
      <HubTopbar/>
      <HubActionBar/>
      <HubTabs active="admin"/>

      <SeasonStepper/>

      <div style={{display:'grid',gridTemplateColumns:'1.4fr 1fr',borderBottom:'1px solid var(--rule)',minHeight:0}}>
        <div style={{borderRight:'1px solid var(--rule)',display:'flex',flexDirection:'column'}}>
          <CreateBetWizard/>
        </div>
        <div style={{display:'flex',flexDirection:'column'}}>
          <ResolvePendingBets/>
        </div>
      </div>

      <LifecycleOps/>
    </div>
  );
}

window.AdminTab = AdminTab;
