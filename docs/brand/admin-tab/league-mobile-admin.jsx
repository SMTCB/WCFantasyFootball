/* global React, LH_BETS, lhMgrById, MgrTag, PhoneShell, AppTopbar, HubLeagueHeader, HubTabPills, MobSection, PrimaryCTA */

// ───────────────────────────────────────────────────────────────────
// MOBILE — ADMIN TAB
//
// Approach:
//   - The desktop's 2-column "wizard + resolve" splits into stacked sections.
//   - The 4-step wizard becomes a single accordion view: only the current
//     step is expanded; completed steps collapse to a one-line summary.
//   - Lifecycle ops live below as a vertical stack of collapsible cards.
// ───────────────────────────────────────────────────────────────────

const MOB_BET_TYPES = [
  { id:'top-scorer',   label:'TOP SCORER',   glyph:'◉', tone:'var(--cyan)',     hint:'Who scores the most goals?' },
  { id:'match-result', label:'MATCH RESULT', glyph:'◈', tone:'var(--positive)', hint:'Predict H/D/A for one fixture.' },
  { id:'player-block', label:'PLAYER BLOCK', glyph:'⛌', tone:'var(--danger)',   hint:'Block a player — flop = points.' },
];

const MOB_FIXTURES = [
  { id:'mci-bha', label:'MCI · BHA', kickoff:'Sat 14:00' },
  { id:'che-liv', label:'CHE · LIV', kickoff:'Sat 16:30' },
  { id:'ars-tot', label:'ARS · TOT', kickoff:'Sun 16:30' },
  { id:'whu-new', label:'WHU · NEW', kickoff:'Mon 20:00' },
];

// ──────────────────────────────────────────────────────────────────
// Reusable mobile primitives
// ──────────────────────────────────────────────────────────────────
const mobInput = {
  background:'var(--ink)',border:'1px solid var(--rule)',color:'var(--paper)',
  padding:'10px 12px',fontFamily:'JetBrains Mono,monospace',fontSize:12,letterSpacing:'.06em',
  outline:'none',width:'100%',boxSizing:'border-box',
};
const mobBtn = {
  padding:'12px 14px',border:0,cursor:'pointer',width:'100%',
  fontFamily:'Archivo Black,sans-serif',fontSize:12,letterSpacing:'.18em',
};
const mobMonoBtn = {
  ...mobBtn, fontFamily:'JetBrains Mono,monospace',fontWeight:600,fontSize:11,letterSpacing:'.22em',
};

function MobField({ label, sub, children }){
  return (
    <div style={{display:'flex',flexDirection:'column',gap:6}}>
      <span className="mono" style={{fontSize:10,letterSpacing:'.22em',color:'var(--paper)'}}>{label}</span>
      {sub && <span style={{fontSize:11,color:'var(--mute)',fontFamily:'Archivo,sans-serif',lineHeight:1.4}}>{sub}</span>}
      {children}
    </div>
  );
}

function MobStepHeader({ n, label, state, onClick, summary }){
  // state: 'active' | 'done' | 'todo'
  const tone = state==='done' ? 'var(--positive)' : state==='active' ? 'var(--cyan)' : 'var(--mute)';
  return (
    <button onClick={onClick} style={{
      background:'transparent',border:0,padding:'12px 16px',width:'100%',cursor:'pointer',
      display:'flex',alignItems:'center',gap:10,textAlign:'left',
      borderBottom:'1px solid var(--rule)',
    }}>
      <span style={{
        width:22,height:22,borderRadius:'50%',
        border:`1.5px solid ${tone}`,
        background: state==='done' ? tone : 'transparent',
        color: state==='done' ? 'var(--ink)' : tone,
        display:'inline-flex',alignItems:'center',justifyContent:'center',
        fontFamily:'JetBrains Mono,monospace',fontSize:10,fontWeight:600,flexShrink:0,
      }}>{state==='done' ? '✓' : n}</span>
      <div style={{display:'flex',flexDirection:'column',gap:2,flex:1,minWidth:0}}>
        <span className="mono" style={{fontSize:10,letterSpacing:'.22em',color:tone}}>STEP {n} · {label}</span>
        {summary && <span className="mono" style={{fontSize:9,letterSpacing:'.16em',color:'var(--mute)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{summary}</span>}
      </div>
      <span style={{color:tone,fontFamily:'JetBrains Mono,monospace',fontSize:14}}>{state==='active' ? '−' : '+'}</span>
    </button>
  );
}

// ──────────────────────────────────────────────────────────────────
// Season stepper (compact: 5 dots horizontal)
// ──────────────────────────────────────────────────────────────────
function MobSeasonStepper(){
  const phases = [
    { label:'TRANSFERS',  state:'done' },
    { label:'DRAFT',      state:'done' },
    { label:'ALLOCATION', state:'done' },
    { label:'CUP',        state:'active' },
    { label:'SEASON',     state:'todo' },
  ];
  return (
    <div style={{padding:'14px 18px',background:'var(--ink-2)',borderBottom:'1px solid var(--rule)'}}>
      <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:10}}>
        <span style={{width:3,height:12,background:'var(--purple)'}}/>
        <span className="mono" style={{fontSize:10,letterSpacing:'.22em',color:'var(--paper)'}}>COMMISSIONER</span>
        <span className="mono" style={{fontSize:9,letterSpacing:'.18em',color:'var(--mute)'}}>· ADMIN ONLY</span>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(5, 1fr)',gap:4,position:'relative'}}>
        <div style={{position:'absolute',top:11,left:'10%',right:'10%',height:1,background:'var(--rule)'}}/>
        {phases.map((p, i) => {
          const tone = p.state==='done' ? 'var(--positive)' : p.state==='active' ? 'var(--cyan)' : 'var(--mute)';
          return (
            <div key={p.label} style={{display:'flex',flexDirection:'column',alignItems:'center',gap:6,zIndex:1}}>
              <span style={{
                width:22,height:22,borderRadius:'50%',
                background: p.state==='done' ? tone : 'var(--ink-2)',
                border:`1.5px solid ${tone}`,
                color: p.state==='done' ? 'var(--ink)' : tone,
                display:'inline-flex',alignItems:'center',justifyContent:'center',
                fontFamily:'JetBrains Mono,monospace',fontSize:9,fontWeight:600,
              }}>{p.state==='done' ? '✓' : i+1}</span>
              <span className="mono" style={{fontSize:8,letterSpacing:'.16em',color:tone,textAlign:'center'}}>{p.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Create Bet wizard (mobile)
// ──────────────────────────────────────────────────────────────────
function MobCreateBet(){
  const [step, setStep] = React.useState(1);
  const [type, setType] = React.useState(null);
  const [fixture, setFix] = React.useState('');
  const [blockPlayer, setBlockPlayer] = React.useState('');
  const [reward, setReward] = React.useState(5);
  const [closes, setCloses] = React.useState('Sat 13:30');
  const [title, setTitle]   = React.useState('');

  const typeMeta = MOB_BET_TYPES.find(t => t.id === type);
  const fixtureMeta = MOB_FIXTURES.find(f => f.id === fixture);

  const stepState = (n) => {
    if(step === n) return 'active';
    if(n < step) return 'done';
    return 'todo';
  };
  const canTo = (n) => {
    if(n === 1) return true;
    if(n === 2) return !!type;
    if(n === 3) return !!fixture && (type!=='player-block' || !!blockPlayer);
    if(n === 4) return canTo(3) && !!reward && !!closes;
    return false;
  };

  const autoTitle = (() => {
    if(!typeMeta) return '';
    if(type==='top-scorer')   return fixtureMeta ? `Top scorer · ${fixtureMeta.label}` : 'Top scorer';
    if(type==='match-result') return fixtureMeta ? `Result · ${fixtureMeta.label}` : 'Match result';
    if(type==='player-block') return blockPlayer ? `Block · ${blockPlayer}` : 'Player block';
  })();

  return (
    <div style={{background:'var(--ink-2)',border:'1px solid var(--rule)',margin:'0 14px',display:'flex',flexDirection:'column'}}>
      {/* Step 1 — TYPE */}
      <MobStepHeader n="1" label="TYPE" state={stepState(1)} onClick={() => setStep(1)} summary={typeMeta?.label}/>
      {step === 1 && (
        <div style={{padding:'14px 16px',display:'flex',flexDirection:'column',gap:8,borderBottom:'1px solid var(--rule)'}}>
          {MOB_BET_TYPES.map(t => {
            const picked = type === t.id;
            return (
              <button key={t.id} onClick={() => setType(t.id)} style={{
                background: picked ? `${t.tone}10` : 'var(--ink)',
                border: picked ? `1px solid ${t.tone}` : '1px solid var(--rule)',
                borderLeft: picked ? `3px solid ${t.tone}` : '3px solid transparent',
                padding:'12px 14px',textAlign:'left',cursor:'pointer',
                display:'flex',alignItems:'center',gap:12,
              }}>
                <span style={{
                  width:28,height:28,display:'inline-flex',alignItems:'center',justifyContent:'center',
                  background:`${t.tone}18`,border:`1px solid ${t.tone}55`,
                  fontFamily:'Archivo Black',fontSize:13,color:t.tone,flexShrink:0,
                }}>{t.glyph}</span>
                <div style={{display:'flex',flexDirection:'column',gap:2,flex:1,minWidth:0}}>
                  <span style={{fontFamily:'Archivo Black',fontSize:13,color:'var(--paper)',letterSpacing:'-0.01em'}}>{t.label}</span>
                  <span style={{fontSize:11,color:'var(--mute)',fontFamily:'Archivo,sans-serif'}}>{t.hint}</span>
                </div>
                {picked && <span style={{color:t.tone,fontFamily:'JetBrains Mono,monospace',fontSize:13}}>✓</span>}
              </button>
            );
          })}
          <button disabled={!canTo(2)} onClick={() => setStep(2)} style={{
            ...mobBtn,
            background: canTo(2) ? 'var(--cyan)' : 'var(--ink-3)',
            color: canTo(2) ? 'var(--ink)' : 'var(--mute)',
            cursor: canTo(2) ? 'pointer' : 'not-allowed',
            marginTop:6,
          }}>NEXT →</button>
        </div>
      )}

      {/* Step 2 — CONFIGURE */}
      <MobStepHeader n="2" label="CONFIGURE" state={stepState(2)} onClick={() => canTo(2) && setStep(2)} summary={fixtureMeta?.label}/>
      {step === 2 && (
        <div style={{padding:'14px 16px',display:'flex',flexDirection:'column',gap:14,borderBottom:'1px solid var(--rule)'}}>
          <MobField label="FIXTURE · GW28" sub="Bet resolves at this match's final whistle.">
            <div style={{display:'flex',flexDirection:'column',gap:6}}>
              {MOB_FIXTURES.map(f => {
                const picked = fixture === f.id;
                return (
                  <button key={f.id} onClick={() => setFix(f.id)} style={{
                    background: picked ? 'rgba(0,180,216,.08)' : 'var(--ink)',
                    border: picked ? '1px solid var(--cyan)' : '1px solid var(--rule)',
                    padding:'10px 12px',cursor:'pointer',
                    display:'flex',alignItems:'center',gap:10,textAlign:'left',
                  }}>
                    <span style={{
                      width:14,height:14,borderRadius:'50%',
                      border:`1.5px solid ${picked?'var(--cyan)':'var(--rule)'}`,
                      background: picked ? 'var(--cyan)' : 'transparent',
                    }}/>
                    <span style={{fontFamily:'Archivo Black',fontSize:12,color:'var(--paper)',flex:1}}>{f.label}</span>
                    <span className="mono" style={{fontSize:9,letterSpacing:'.14em',color:'var(--mute)'}}>{f.kickoff}</span>
                  </button>
                );
              })}
            </div>
          </MobField>

          {type === 'player-block' && (
            <MobField label="BLOCK TARGET" sub="Managers will pick this player to block.">
              <select value={blockPlayer} onChange={e => setBlockPlayer(e.target.value)} style={mobInput}>
                <option value="">— Choose a player —</option>
                {['Haaland (MCI)','Palmer (CHE)','Salah (LIV)','Saka (ARS)','Watkins (AVL)'].map(p => <option key={p}>{p}</option>)}
              </select>
            </MobField>
          )}

          {type === 'match-result' && (
            <div style={{
              padding:'10px 12px',background:'var(--ink)',border:'1px solid var(--rule)',
              fontSize:11,lineHeight:1.5,color:'var(--mute)',fontFamily:'Archivo,sans-serif',
            }}>
              <span className="mono" style={{fontSize:9,letterSpacing:'.2em',color:'var(--positive)'}}>● AUTO</span>{' '}
              Options auto-generated: <b style={{color:'var(--paper)'}}>HOME · DRAW · AWAY</b>.
            </div>
          )}

          <div style={{display:'flex',gap:8}}>
            <button onClick={() => setStep(1)} style={{...mobMonoBtn, background:'transparent',color:'var(--mute)',border:'1px solid var(--rule)',width:'auto',padding:'12px 14px'}}>← BACK</button>
            <button disabled={!canTo(3)} onClick={() => setStep(3)} style={{
              ...mobBtn,flex:1,
              background: canTo(3) ? 'var(--cyan)' : 'var(--ink-3)',
              color: canTo(3) ? 'var(--ink)' : 'var(--mute)',
              cursor: canTo(3) ? 'pointer' : 'not-allowed',
            }}>NEXT →</button>
          </div>
        </div>
      )}

      {/* Step 3 — REWARD */}
      <MobStepHeader n="3" label="REWARD & LOCK" state={stepState(3)} onClick={() => canTo(3) && setStep(3)} summary={reward ? `+${reward} pts · locks ${closes}` : null}/>
      {step === 3 && (
        <div style={{padding:'14px 16px',display:'flex',flexDirection:'column',gap:14,borderBottom:'1px solid var(--rule)'}}>
          <MobField label="REWARD · POINTS" sub="Multipliers apply per pick.">
            <div style={{display:'flex',gap:0,border:'1px solid var(--rule)',background:'var(--ink)',width:'fit-content'}}>
              <button onClick={() => setReward(Math.max(1,reward-1))} style={{background:'transparent',border:0,color:'var(--paper)',padding:'10px 16px',fontSize:14,cursor:'pointer'}}>−</button>
              <span style={{padding:'10px 22px',fontFamily:'Archivo Black',fontSize:18,color:'var(--positive)',minWidth:70,textAlign:'center',borderLeft:'1px solid var(--rule)',borderRight:'1px solid var(--rule)'}}>+{reward}</span>
              <button onClick={() => setReward(reward+1)} style={{background:'transparent',border:0,color:'var(--paper)',padding:'10px 16px',fontSize:14,cursor:'pointer'}}>+</button>
            </div>
          </MobField>
          <MobField label="PICKS LOCK AT" sub="Default = 30 min before kickoff.">
            <input type="text" value={closes} onChange={e => setCloses(e.target.value)} style={mobInput}/>
          </MobField>
          <MobField label="TITLE" sub={`Leave blank → "${autoTitle}"`}>
            <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder={autoTitle} style={mobInput}/>
          </MobField>

          <div style={{display:'flex',gap:8}}>
            <button onClick={() => setStep(2)} style={{...mobMonoBtn, background:'transparent',color:'var(--mute)',border:'1px solid var(--rule)',width:'auto',padding:'12px 14px'}}>← BACK</button>
            <button disabled={!canTo(4)} onClick={() => setStep(4)} style={{
              ...mobBtn,flex:1,
              background: canTo(4) ? 'var(--cyan)' : 'var(--ink-3)',
              color: canTo(4) ? 'var(--ink)' : 'var(--mute)',
              cursor: canTo(4) ? 'pointer' : 'not-allowed',
            }}>NEXT →</button>
          </div>
        </div>
      )}

      {/* Step 4 — PUBLISH */}
      <MobStepHeader n="4" label="REVIEW & PUBLISH" state={stepState(4)} onClick={() => canTo(4) && setStep(4)}/>
      {step === 4 && (
        <div style={{padding:'14px 16px',display:'flex',flexDirection:'column',gap:12}}>
          <MobBetPreview type={type} title={title || autoTitle} reward={reward} closes={closes} fixture={fixtureMeta} blockPlayer={blockPlayer}/>
          <div style={{
            padding:'10px 12px',background:'rgba(224,168,0,.06)',border:'1px solid var(--gold)55',
            fontSize:11,lineHeight:1.5,color:'var(--paper)',fontFamily:'Archivo,sans-serif',
          }}>
            <span className="mono" style={{fontSize:9,letterSpacing:'.22em',color:'var(--gold)'}}>● NOTE</span>{' '}
            Publishing notifies <b>14 managers</b> and opens picks immediately.
          </div>
          <div style={{display:'flex',gap:8}}>
            <button onClick={() => setStep(3)} style={{...mobMonoBtn, background:'transparent',color:'var(--mute)',border:'1px solid var(--rule)',width:'auto',padding:'12px 14px'}}>← BACK</button>
            <button style={{...mobBtn,flex:1, background:'var(--positive)',color:'var(--ink)'}}>PUBLISH BET →</button>
          </div>
        </div>
      )}
    </div>
  );
}

function MobBetPreview({ type, title, reward, closes, fixture, blockPlayer }){
  const meta = MOB_BET_TYPES.find(t => t.id === type);
  if(!meta){
    return (
      <div style={{padding:'16px',border:'1px dashed var(--rule)',textAlign:'center',color:'var(--mute)'}}>
        <span className="mono" style={{fontSize:10,letterSpacing:'.22em'}}>NO BET YET</span>
      </div>
    );
  }
  const opts = type==='match-result' ? ['HOME','DRAW','AWAY']
             : type==='top-scorer'   ? ['HAALAND','PALMER','SALAH','SAKA']
             : blockPlayer ? [blockPlayer.split(' (')[0]] : [];
  return (
    <div>
      <span className="mono" style={{fontSize:9,letterSpacing:'.22em',color:'var(--mute)'}}>LIVE PREVIEW · MANAGER VIEW</span>
      <div style={{
        marginTop:8,background:'var(--ink)',border:'1px solid var(--rule)',
        borderLeft:`3px solid ${meta.tone}`,padding:'12px',display:'flex',flexDirection:'column',gap:8,
      }}>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <span style={{
            width:22,height:22,display:'inline-flex',alignItems:'center',justifyContent:'center',
            background:`${meta.tone}15`,border:`1px solid ${meta.tone}55`,
            fontFamily:'Archivo Black',fontSize:12,color:meta.tone,
          }}>{meta.glyph}</span>
          <span style={{fontFamily:'Archivo Black',fontSize:12,color:meta.tone}}>{meta.label}</span>
          <span style={{flex:1}}/>
          <span className="mono" style={{fontSize:9,letterSpacing:'.18em',color:'var(--positive)',padding:'2px 6px',border:'1px solid var(--positive)55'}}>+{reward} PTS</span>
        </div>
        <div style={{fontFamily:'Archivo,sans-serif',fontSize:12,color:'var(--paper)',lineHeight:1.4}}>{title || <span style={{color:'var(--mute)'}}>(title pending)</span>}</div>
        {opts.length > 0 && (
          <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>
            {opts.map(o => (
              <span key={o} style={{padding:'4px 8px',fontFamily:'Archivo Black',fontSize:10,border:'1px solid var(--rule)',color:'var(--paper)'}}>{o}</span>
            ))}
          </div>
        )}
        <span className="mono" style={{fontSize:9,letterSpacing:'.18em',color:'var(--mute)'}}>● LOCKS {closes}</span>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Resolve pending bets (mobile)
// ──────────────────────────────────────────────────────────────────
function MobResolveBets(){
  const pending = LH_BETS.filter(b => b.state === 'pending');
  const [open, setOpen] = React.useState(pending[0]?.id || null);
  const [answer, setAnswer] = React.useState({});

  return (
    <div style={{display:'flex',flexDirection:'column',gap:8,padding:'0 14px'}}>
      {pending.map(b => {
        const isOpen = open === b.id;
        const tone = b.kind === 'block' ? 'var(--danger)' : b.kind === 'top-scorer' ? 'var(--cyan)' : 'var(--positive)';
        return (
          <div key={b.id} style={{background:'var(--ink-2)',border:'1px solid var(--rule)',borderLeft:`3px solid ${tone}`}}>
            <button onClick={() => setOpen(isOpen ? null : b.id)} style={{
              width:'100%',background:'transparent',border:0,color:'var(--paper)',padding:'12px 14px',
              display:'flex',alignItems:'center',gap:10,textAlign:'left',cursor:'pointer',
            }}>
              <div style={{display:'flex',flexDirection:'column',gap:2,flex:1,minWidth:0}}>
                <span style={{fontFamily:'Archivo Black',fontSize:12,color:'var(--paper)'}}>{b.title}</span>
                <span className="mono" style={{fontSize:9,letterSpacing:'.16em',color:'var(--mute)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{b.code}</span>
              </div>
              <span className="mono" style={{fontSize:9,letterSpacing:'.22em',color:'var(--gold)'}}>● PENDING</span>
              <span style={{color:'var(--mute)',fontFamily:'JetBrains Mono,monospace',fontSize:14}}>{isOpen?'−':'+'}</span>
            </button>
            {isOpen && (
              <div style={{padding:'4px 14px 14px',display:'flex',flexDirection:'column',gap:10,borderTop:'1px solid var(--rule)'}}>
                <span style={{fontSize:11,color:'var(--paper)',fontFamily:'Archivo,sans-serif',lineHeight:1.4}}>{b.q}</span>
                <div>
                  <span className="mono" style={{fontSize:9,letterSpacing:'.22em',color:'var(--mute)'}}>WHO PICKED · 12/14</span>
                  <div style={{display:'flex',gap:4,flexWrap:'wrap',marginTop:6}}>
                    {['rai','olu','ade','ndo','mar','zoe','you'].map(m => <MgrTag key={m} id={m}/>)}
                  </div>
                </div>
                <MobField label="ANSWER" sub="Select the winning option.">
                  <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>
                    {(b.options || []).map(opt => {
                      const picked = answer[b.id] === opt;
                      return (
                        <button key={opt} onClick={() => setAnswer({...answer, [b.id]: opt})} style={{
                          padding:'6px 10px',cursor:'pointer',
                          background: picked ? 'rgba(34,197,94,.08)' : 'var(--ink)',
                          border: picked ? '1px solid var(--positive)' : '1px solid var(--rule)',
                          color: picked ? 'var(--positive)' : 'var(--paper)',
                          fontFamily:'Archivo Black',fontSize:11,
                        }}>{picked?'✓ ':''}{opt}</button>
                      );
                    })}
                  </div>
                </MobField>
                <button disabled={!answer[b.id]} style={{
                  ...mobBtn,
                  background: answer[b.id] ? 'var(--gold)' : 'var(--ink-3)',
                  color: answer[b.id] ? 'var(--ink)' : 'var(--mute)',
                  cursor: answer[b.id] ? 'pointer' : 'not-allowed',
                }}>RESOLVE · AWARDS +{b.reward} PTS</button>
              </div>
            )}
          </div>
        );
      })}
      {pending.length === 0 && (
        <div style={{padding:'14px',background:'var(--ink-2)',border:'1px dashed var(--rule)',textAlign:'center'}}>
          <span className="mono" style={{fontSize:10,letterSpacing:'.22em',color:'var(--mute)'}}>NOTHING TO RESOLVE</span>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Lifecycle ops (mobile) — collapsible cards
// ──────────────────────────────────────────────────────────────────
function MobLifecycleCard({ title, status, tone, sub, when, children, defaultOpen=false }){
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <div style={{background:'var(--ink-2)',border:'1px solid var(--rule)',borderLeft:`3px solid ${tone}`,margin:'0 14px'}}>
      <button onClick={() => setOpen(!open)} style={{
        background:'transparent',border:0,padding:'12px 14px',width:'100%',cursor:'pointer',
        display:'flex',alignItems:'center',gap:10,textAlign:'left',
      }}>
        <div style={{display:'flex',flexDirection:'column',gap:2,flex:1,minWidth:0}}>
          <span className="mono" style={{fontSize:10,letterSpacing:'.22em',color:'var(--paper)'}}>{title}</span>
          <span className="mono" style={{fontSize:9,letterSpacing:'.18em',color:tone}}>● {status}</span>
        </div>
        <span style={{color:'var(--mute)',fontFamily:'JetBrains Mono,monospace',fontSize:14}}>{open?'−':'+'}</span>
      </button>
      {open && (
        <div style={{padding:'4px 14px 14px',display:'flex',flexDirection:'column',gap:10,borderTop:'1px solid var(--rule)'}}>
          {sub && <span style={{fontSize:11,color:'var(--mute)',fontFamily:'Archivo,sans-serif',lineHeight:1.5}}>{sub}</span>}
          {children}
          {when && (
            <div style={{
              padding:'6px 8px',background:'var(--ink)',border:'1px solid var(--rule)',
              fontSize:10,color:'var(--mute)',fontFamily:'Archivo,sans-serif',lineHeight:1.4,
            }}>
              <span className="mono" style={{fontSize:9,letterSpacing:'.2em',color:'var(--paper)'}}>WHEN · </span>{when}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MobLifecycle(){
  return (
    <div style={{display:'flex',flexDirection:'column',gap:8}}>
      <MobLifecycleCard
        title="TRANSFER WINDOW" status="CLOSED" tone="var(--danger)"
        sub="Open/close the trading window."
        when="Open between gameweeks. Close 1h before MD kickoff."
      >
        <MobField label="OPENS"><input type="text" defaultValue="Mon 09:00" style={mobInput}/></MobField>
        <MobField label="CLOSES"><input type="text" defaultValue="Sat 13:00" style={mobInput}/></MobField>
        <MobField label="LIMIT · blank = unlimited"><input type="text" defaultValue="5" style={mobInput}/></MobField>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6}}>
          <button style={{...mobBtn, background:'var(--positive)',color:'var(--ink)'}}>OPEN</button>
          <button style={{...mobBtn, background:'transparent',color:'var(--danger)',border:'1px solid var(--danger)55'}}>CLOSE NOW</button>
        </div>
      </MobLifecycleCard>

      <MobLifecycleCard
        title="DRAFT" status="DEADLINE SET" tone="var(--positive)"
        sub="Set deadline, then run allocation."
        when="After all picks. Before GW1."
      >
        <MobField label="DEADLINE"><input type="text" defaultValue="15/03/2026 19:00" style={mobInput}/></MobField>
        <button style={{...mobBtn, background:'transparent',color:'var(--paper)',border:'1px solid var(--rule)'}}>SET DEADLINE</button>
        <div className="mono" style={{fontSize:9,letterSpacing:'.18em',color:'var(--mute)',lineHeight:1.5}}>
          15 PLAYERS / MGR · £100M · GK≤2 DEF≤5 MID≤5 FWD≤3
        </div>
        <button style={{...mobBtn, background:'var(--gold)',color:'var(--ink)'}}>RUN ALLOCATION ↯</button>
      </MobLifecycleCard>

      <MobLifecycleCard
        title="CUP PHASE" status="UNSEEDED" tone="var(--warn)"
        sub="Seed cup clubs into the no-repeat pool."
        when="After allocation."
      >
        <div className="mono" style={{fontSize:9,letterSpacing:'.18em',color:'var(--mute)'}}>20 CLUBS · 14 MGRS · 1 club/mgr/round</div>
        <button style={{...mobBtn, background:'var(--purple)',color:'var(--paper)'}}>SEED CUP CLUBS ↯</button>
      </MobLifecycleCard>

      <MobLifecycleCard
        title="SCORE RECALCULATION" status="UTILITY" tone="var(--mute)"
        sub="Re-run scoring for a fixture after a stat correction."
        when="Anytime. Safe."
      >
        <MobField label="FIXTURE ID"><input type="text" defaultValue="mci-bha · MD5" style={mobInput}/></MobField>
        <div className="mono" style={{fontSize:9,letterSpacing:'.18em',color:'var(--mute)'}}>LAST RUN · GW27 · 2D AGO</div>
        <button style={{...mobBtn, background:'var(--warn)',color:'var(--ink)'}}>RECALCULATE ↯</button>
      </MobLifecycleCard>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Compose
// ──────────────────────────────────────────────────────────────────
function MobAdmin(){
  return (
    <PhoneShell>
      <AppTopbar/>
      <HubLeagueHeader/>
      <HubTabPills active="admin"/>
      <div style={{flex:1,overflow:'auto'}}>
        <MobSeasonStepper/>

        <MobSection label="CREATE BET" sub="GUIDED · 4 STEPS" tone="var(--cyan)"/>
        <MobCreateBet/>

        <MobSection label="RESOLVE PENDING" sub="WAITING ON YOU" tone="var(--gold)"/>
        <MobResolveBets/>

        <MobSection label="LIFECYCLE OPERATIONS" sub="SEASON CONTROLS" tone="var(--purple)"/>
        <MobLifecycle/>

        <div style={{height:24}}/>
      </div>
    </PhoneShell>
  );
}

window.MobAdmin = MobAdmin;
