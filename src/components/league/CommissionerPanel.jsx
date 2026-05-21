import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { HubSectionLabel, MgrTag, mgrHue, mgrMono } from './HubShared';

// ─────────────────────────────────────────────────────────────────────────────
// Design tokens (mirrors docs/brand/ADMIN TAB/tokens.css)
// ─────────────────────────────────────────────────────────────────────────────
const MONO    = "'JetBrains Mono', monospace";
const DISPLAY = "'Archivo Black', sans-serif";
const BODY    = "'Archivo', sans-serif";

const inputStyle = {
  background: 'var(--ink)', border: '1px solid var(--rule)', color: 'var(--paper)',
  padding: '10px 12px', fontFamily: MONO, fontSize: 12, letterSpacing: '.06em',
  outline: 'none', width: '100%', boxSizing: 'border-box',
};
const btnBase = {
  padding: '11px 16px', border: 0, cursor: 'pointer',
  fontFamily: DISPLAY, fontSize: 11, letterSpacing: '.18em', fontWeight: 400,
};
const ghostBtn = {
  ...btnBase, background: 'transparent', border: '1px solid var(--rule)', color: 'var(--mute)',
  fontFamily: MONO, fontWeight: 600,
};

// ─────────────────────────────────────────────────────────────────────────────
// Mock data — TODO: replace with live fixture / player queries
// ─────────────────────────────────────────────────────────────────────────────
const MOCK_FIXTURES = [
  { id: 'mci-bha', label: 'Man City · Brighton', kickoff: 'Sat 14:00', md: 'MD5' },
  { id: 'che-liv', label: 'Chelsea · Liverpool',  kickoff: 'Sat 16:30', md: 'MD5' },
  { id: 'ars-tot', label: 'Arsenal · Tottenham',  kickoff: 'Sun 16:30', md: 'MD5' },
  { id: 'avl-eve', label: 'Aston Villa · Everton', kickoff: 'Sun 14:00', md: 'MD5' },
  { id: 'whu-new', label: 'West Ham · Newcastle',  kickoff: 'Mon 20:00', md: 'MD5' },
];

const MOCK_PLAYERS = [
  'Haaland (MCI)', 'Palmer (CHE)', 'Salah (LIV)', 'Saka (ARS)',
  'Watkins (AVL)', 'Isak (NEW)', 'Son (TOT)', 'Mitoma (BHA)',
];

const BET_TYPES = [
  { id: 'top-scorer',   label: 'TOP SCORER',   glyph: '◉', tone: 'var(--cyan)',     templateId: 'top_scorer',   hint: 'Who scores the most goals across the fixture / gameweek?', body: 'Auto-resolves at final whistle. Tie-break: assists → minutes.' },
  { id: 'match-result', label: 'MATCH RESULT', glyph: '◈', tone: 'var(--positive)', templateId: 'match_result', hint: 'Predict the outcome of a single fixture.', body: 'Options are auto-generated: HOME · DRAW · AWAY. Resolves at FT.' },
  { id: 'player-block', label: 'PLAYER BLOCK', glyph: '⛌', tone: 'var(--danger)',   templateId: 'player_block', hint: 'Pick a player to BLOCK — if they flop, you earn points.', body: 'A flop = 0 goals + ≤30 min played, OR a red card. Resolves at FT.' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Season stepper (Zone A)
// ─────────────────────────────────────────────────────────────────────────────
function SeasonStepper({ leagueName = 'LEAGUE', memberCount = 0 }) {
  const phases = [
    { id: 'transfers',  label: 'TRANSFER WINDOW', state: 'done',   sub: 'Closed · GW27' },
    { id: 'draft',      label: 'DRAFT DEADLINE',  state: 'done',   sub: '15 Mar 19:00' },
    { id: 'allocation', label: 'ALLOCATION',       state: 'done',   sub: '12 conflicts resolved' },
    { id: 'cup',        label: 'CUP SEEDED',       state: 'active', sub: 'Pool ready · run when set' },
    { id: 'season',     label: 'IN SEASON · GW28', state: 'todo',   sub: 'Live · 2h 36m to lock' },
  ];
  const tone = (s) => s === 'done' ? 'var(--positive)' : s === 'active' ? 'var(--cyan)' : 'var(--mute)';
  return (
    <div style={{ padding: '18px 28px 22px', borderBottom: '1px solid var(--rule)', background: 'var(--ink-2)', flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <span style={{ width: 3, height: 14, background: 'var(--purple)', flexShrink: 0 }} />
        <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '.22em', color: 'var(--paper)' }}>COMMISSIONER CONTROLS</span>
        <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.22em', color: 'var(--mute)' }}>· ADMIN ONLY · CHANGES TAKE EFFECT IMMEDIATELY</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.22em', color: 'var(--mute)' }}>
          {leagueName.toUpperCase()} · {memberCount} MGRS · GW28
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', position: 'relative', gap: 0 }}>
        <div style={{ position: 'absolute', top: 14, left: '10%', right: '10%', height: 1, background: 'var(--rule)' }} />
        {phases.map((p, i) => {
          const t = tone(p.state);
          return (
            <div key={p.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, position: 'relative' }}>
              <span style={{
                width: 28, height: 28, borderRadius: '50%',
                background: p.state === 'done' ? t : 'var(--ink-2)',
                border: `1.5px solid ${t}`,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: MONO, fontSize: 11, fontWeight: 600,
                color: p.state === 'done' ? 'var(--ink)' : t,
                position: 'relative', zIndex: 1,
              }}>{p.state === 'done' ? '✓' : i + 1}</span>
              <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.2em', color: t, textAlign: 'center' }}>{p.label}</span>
              <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.14em', color: 'var(--mute)', textAlign: 'center' }}>{p.sub}</span>
              {p.state === 'active' && (
                <span style={{ fontFamily: MONO, fontSize: 8, letterSpacing: '.22em', color: 'var(--cyan)', border: '1px solid rgba(0,180,216,.33)', padding: '2px 6px', marginTop: 2 }}>● YOU ARE HERE</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Wizard sub-components
// ─────────────────────────────────────────────────────────────────────────────
function WizField({ label, sub, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '.22em', color: 'var(--paper)' }}>{label}</span>
        {sub && <span style={{ fontFamily: BODY, fontSize: 11, color: 'var(--mute)' }}>{sub}</span>}
      </div>
      {children}
    </div>
  );
}

function WizHelp({ num, label, hint }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '.22em', color: 'var(--cyan)' }}>{num}</span>
        <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '.22em', color: 'var(--paper)' }}>{label}</span>
      </div>
      <span style={{ fontFamily: BODY, fontSize: 12, color: 'var(--mute)', lineHeight: 1.5 }}>{hint}</span>
    </div>
  );
}

function SummaryRow({ k, v, sub, tone }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 14, alignItems: 'baseline', padding: '8px 0', borderBottom: '1px solid var(--rule)' }}>
      <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.22em', color: 'var(--mute)' }}>{k}</span>
      <div>
        <div style={{ fontFamily: DISPLAY, fontSize: 13, color: tone || 'var(--paper)' }}>
          {v || <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '.18em', color: 'var(--mute)' }}>NOT SET</span>}
        </div>
        {sub && <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.16em', color: 'var(--mute)' }}>{sub}</span>}
      </div>
    </div>
  );
}

function NextBar({ onBack, onNext, canNext, hint }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 'auto', paddingTop: 14, borderTop: '1px solid var(--rule)' }}>
      {hint && <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.18em', color: 'var(--mute)' }}>{hint}</span>}
      <span style={{ flex: 1 }} />
      {onBack && (
        <button onClick={onBack} style={ghostBtn}>← BACK</button>
      )}
      <button
        disabled={!canNext}
        onClick={onNext}
        style={{
          ...btnBase,
          background: canNext ? 'var(--cyan)' : 'var(--ink-3)',
          color: canNext ? 'var(--ink)' : 'var(--mute)',
          cursor: canNext ? 'pointer' : 'not-allowed',
          fontSize: 12,
        }}
      >NEXT →</button>
    </div>
  );
}

function PlayerChipPool({ selected, onChange }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {MOCK_PLAYERS.map(p => {
        const on = selected.includes(p);
        return (
          <button key={p} onClick={() => onChange(on ? selected.filter(x => x !== p) : [...selected, p])} style={{
            padding: '6px 10px', cursor: 'pointer',
            background: on ? 'rgba(0,180,216,.08)' : 'var(--ink)',
            border: on ? '1px solid var(--cyan)' : '1px solid var(--rule)',
            color: on ? 'var(--cyan)' : 'var(--paper)',
            fontFamily: MONO, fontSize: 10, letterSpacing: '.12em',
          }}>{on ? '✓ ' : '+ '}{p}</button>
        );
      })}
    </div>
  );
}

function RewardStepper({ value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 0, border: '1px solid var(--rule)', background: 'var(--ink)', width: 'fit-content' }}>
      <button onClick={() => onChange(Math.max(1, value - 1))} style={{ background: 'transparent', border: 0, color: 'var(--paper)', padding: '8px 14px', fontFamily: MONO, fontSize: 14, cursor: 'pointer', borderRight: '1px solid var(--rule)' }}>−</button>
      <span style={{ padding: '8px 18px', fontFamily: DISPLAY, fontSize: 18, color: 'var(--positive)', minWidth: 60, textAlign: 'center' }}>+{value}</span>
      <button onClick={() => onChange(value + 1)} style={{ background: 'transparent', border: 0, color: 'var(--paper)', padding: '8px 14px', fontFamily: MONO, fontSize: 14, cursor: 'pointer', borderLeft: '1px solid var(--rule)' }}>+</button>
    </div>
  );
}

function BetCardPreview({ betType, title, reward, closes, fixture, players, blockPlayer }) {
  const meta = BET_TYPES.find(t => t.id === betType);
  if (!meta) {
    return (
      <div style={{ background: 'var(--ink)', border: '1px dashed var(--rule)', padding: '22px 18px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, color: 'var(--mute)' }}>
        <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '.22em' }}>NO BET YET</span>
        <span style={{ fontFamily: BODY, fontSize: 11, textAlign: 'center' }}>Choose a type to see the live preview.</span>
      </div>
    );
  }
  const options = betType === 'match-result'
    ? (fixture ? [fixture.label.split(' · ')[0], 'DRAW', fixture.label.split(' · ')[1]] : ['HOME', 'DRAW', 'AWAY'])
    : betType === 'top-scorer'
      ? players.slice(0, 4).map(p => p.split(' (')[0])
      : blockPlayer ? [blockPlayer.split(' (')[0]] : [];

  return (
    <div style={{ background: 'var(--ink)', border: '1px solid var(--rule)', borderLeft: `3px solid ${meta.tone}`, padding: '14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 22, height: 22, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: `${meta.tone}15`, border: `1px solid ${meta.tone}55`, fontFamily: DISPLAY, fontSize: 12, color: meta.tone }}>{meta.glyph}</span>
        <span style={{ fontFamily: DISPLAY, fontSize: 13, color: meta.tone, letterSpacing: '-0.01em' }}>{meta.label}</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.18em', color: 'var(--positive)', padding: '2px 6px', border: '1px solid rgba(34,197,94,.33)', background: 'rgba(34,197,94,.08)' }}>+{reward} PTS</span>
      </div>
      <div style={{ fontFamily: BODY, fontSize: 12, color: 'var(--paper)', lineHeight: 1.45 }}>
        {title || <span style={{ color: 'var(--mute)' }}>(title pending)</span>}
      </div>
      {options.length > 0 && (
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {options.map(o => (
            <span key={o} style={{ padding: '4px 8px', fontFamily: DISPLAY, fontSize: 10, letterSpacing: '-0.01em', border: '1px solid var(--rule)', color: 'var(--paper)' }}>{o}</span>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 2 }}>
        <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.18em', color: 'var(--mute)' }}>● LOCKS {closes || '—'}</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.18em', color: 'var(--cyan)' }}>MAKE PICK →</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Create Bet Wizard (Zone B left)
// ─────────────────────────────────────────────────────────────────────────────
function CreateBetWizard({ onPublish, commLoading, memberCount }) {
  const [step,        setStep]   = useState(1);
  const [betType,     setBetType] = useState(null);
  const [fixture,     setFixture] = useState('');
  const [players,     setPlayers] = useState(['Haaland (MCI)', 'Palmer (CHE)', 'Salah (LIV)', 'Saka (ARS)', 'Watkins (AVL)']);
  const [blockPlayer, setBlock]   = useState('');
  const [reward,      setReward]  = useState(5);
  const [closes,      setCloses]  = useState('');
  const [title,       setTitle]   = useState('');

  const typeMeta    = BET_TYPES.find(t => t.id === betType) || null;
  const fixtureMeta = MOCK_FIXTURES.find(f => f.id === fixture) || null;

  const autoTitle = (() => {
    if (!typeMeta) return '';
    if (betType === 'top-scorer')   return fixtureMeta ? `Top scorer · ${fixtureMeta.label}` : 'Top scorer · GW28';
    if (betType === 'match-result') return fixtureMeta ? `Result · ${fixtureMeta.label}` : 'Match result';
    if (betType === 'player-block') return blockPlayer ? `Block · ${blockPlayer}` : 'Player block';
    return '';
  })();
  const computedTitle = title || autoTitle;

  const canStep2 = !!betType;
  const canStep3 = !!fixture && (betType !== 'player-block' || !!blockPlayer);
  const canStep4 = !!reward && !!closes;

  const reset = () => {
    setStep(1); setBetType(null); setFixture(''); setBlock('');
    setReward(5); setCloses(''); setTitle('');
  };

  const handlePublish = () => {
    const options =
      betType === 'match-result' ? [{ key: 'home', label: 'HOME' }, { key: 'draw', label: 'DRAW' }, { key: 'away', label: 'AWAY' }]
      : betType === 'top-scorer' ? players.map(p => ({ key: p.toLowerCase().replace(/[^a-z0-9]/g, '_'), label: p }))
      : [{ key: 'block', label: blockPlayer }];

    onPublish({
      title:      computedTitle,
      prompt:     computedTitle,
      deadline:   closes,
      rewardValue: String(reward),
      scopeType:  'match',
      scopeRef:   fixture || null,
      templateId: typeMeta.templateId,
      options,
    });
    reset();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <HubSectionLabel
        label="CREATE BET"
        sub="A new prediction for the league"
        tone="var(--cyan)"
        right={
          <button onClick={reset} style={{ ...ghostBtn, fontSize: 9, padding: '5px 10px' }}>↻ RESET</button>
        }
      />

      {/* Step rail */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', borderBottom: '1px solid var(--rule)', background: 'var(--ink)', flexShrink: 0 }}>
        {[
          { n: 1, label: 'TYPE',      reached: true,     done: !!betType },
          { n: 2, label: 'CONFIGURE', reached: canStep2, done: !!fixture },
          { n: 3, label: 'REWARD',    reached: canStep3, done: canStep4  },
          { n: 4, label: 'PUBLISH',   reached: canStep4, done: false     },
        ].map(s => {
          const active = step === s.n;
          const railTone = !s.reached ? 'var(--mute)' : (active ? 'var(--cyan)' : (s.done ? 'var(--positive)' : 'var(--paper)'));
          return (
            <button key={s.n}
              disabled={!s.reached}
              onClick={() => s.reached && setStep(s.n)}
              style={{
                background: 'transparent',
                borderTop: 'none',
                borderBottom: active ? `2px solid ${railTone}` : '2px solid transparent',
                borderLeft: 'none',
                borderRight: s.n < 4 ? '1px solid var(--rule)' : 'none',
                padding: '14px 16px', cursor: s.reached ? 'pointer' : 'not-allowed',
                color: railTone, textAlign: 'left',
                display: 'flex', alignItems: 'center', gap: 10,
              }}
            >
              <span style={{
                width: 22, height: 22, borderRadius: '50%',
                border: `1.5px solid ${railTone}`,
                background: s.done ? railTone : 'transparent',
                color: s.done ? 'var(--ink)' : railTone,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: MONO, fontSize: 10, fontWeight: 600, flexShrink: 0,
              }}>{s.done ? '✓' : s.n}</span>
              <span style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.22em', color: 'var(--mute)' }}>STEP {s.n}</span>
                <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '.18em', color: railTone }}>{s.label}</span>
              </span>
            </button>
          );
        })}
      </div>

      {/* Body: form left, live preview right */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', minHeight: 0, flex: 1 }}>
        <div style={{ padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: 18, borderRight: '1px solid var(--rule)', overflow: 'auto' }}>

          {step === 1 && (
            <>
              <WizHelp num="01" label="WHAT KIND OF BET?" hint="Each type uses a different resolution rule. Pick one — you can change it before publishing." />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                {BET_TYPES.map(t => {
                  const picked = betType === t.id;
                  return (
                    <button key={t.id} onClick={() => setBetType(t.id)} style={{
                      textAlign: 'left', cursor: 'pointer',
                      background: picked ? `${t.tone}10` : 'var(--ink-2)',
                      border: picked ? `1px solid ${t.tone}` : '1px solid var(--rule)',
                      borderLeft: picked ? `3px solid ${t.tone}` : '3px solid transparent',
                      padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8, minHeight: 140,
                    }}>
                      <span style={{ width: 30, height: 30, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: `${t.tone}18`, border: `1px solid ${t.tone}55`, fontFamily: DISPLAY, fontSize: 15, color: t.tone }}>{t.glyph}</span>
                      <span style={{ fontFamily: DISPLAY, fontSize: 14, letterSpacing: '-0.01em', color: 'var(--paper)' }}>{t.label}</span>
                      <span style={{ fontFamily: BODY, fontSize: 11, lineHeight: 1.4, color: 'var(--mute)' }}>{t.hint}</span>
                      <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.16em', color: t.tone, marginTop: 'auto' }}>{picked ? '● SELECTED' : 'CHOOSE →'}</span>
                    </button>
                  );
                })}
              </div>
              <NextBar onNext={() => setStep(2)} canNext={canStep2} hint={!betType ? 'Pick a bet type to continue.' : ''} />
            </>
          )}

          {step === 2 && (
            <>
              <WizHelp num="02" label="WHICH FIXTURE?" hint={typeMeta?.body || 'Configure the resolution scope.'} />
              <WizField label="Fixture · GW28" sub="Bet will resolve at this match's final whistle.">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {MOCK_FIXTURES.map(f => {
                    const picked = fixture === f.id;
                    return (
                      <button key={f.id} onClick={() => setFixture(f.id)} style={{
                        textAlign: 'left', cursor: 'pointer',
                        background: picked ? 'rgba(0,180,216,.08)' : 'var(--ink)',
                        border: picked ? '1px solid var(--cyan)' : '1px solid var(--rule)',
                        padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10,
                      }}>
                        <span style={{ width: 14, height: 14, borderRadius: '50%', border: `1.5px solid ${picked ? 'var(--cyan)' : 'var(--rule)'}`, background: picked ? 'var(--cyan)' : 'transparent', flexShrink: 0 }} />
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
                          <span style={{ fontFamily: DISPLAY, fontSize: 12, color: 'var(--paper)' }}>{f.label}</span>
                          <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.16em', color: 'var(--mute)' }}>{f.md} · {f.kickoff}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </WizField>

              {betType === 'top-scorer' && (
                <WizField label="Player pool" sub="Managers pick one. Add or remove — 3 to 8 work best.">
                  <PlayerChipPool selected={players} onChange={setPlayers} />
                </WizField>
              )}

              {betType === 'player-block' && (
                <WizField label="Block target" sub="Managers will pick this player to block (flop = points).">
                  <select value={blockPlayer} onChange={e => setBlock(e.target.value)} style={inputStyle}>
                    <option value="">— Choose a player —</option>
                    {MOCK_PLAYERS.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </WizField>
              )}

              {betType === 'match-result' && (
                <div style={{ padding: '10px 12px', background: 'var(--ink)', border: '1px solid var(--rule)', fontFamily: BODY, fontSize: 11, lineHeight: 1.5, color: 'var(--mute)' }}>
                  <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.2em', color: 'var(--positive)' }}>● AUTO</span>{' '}
                  Options are generated from the fixture: <b style={{ color: 'var(--paper)' }}>HOME · DRAW · AWAY</b>. No further config needed.
                </div>
              )}

              <NextBar onBack={() => setStep(1)} onNext={() => setStep(3)} canNext={canStep3} hint={!fixture ? 'Pick a fixture to continue.' : ''} />
            </>
          )}

          {step === 3 && (
            <>
              <WizHelp num="03" label="HOW MUCH IS IT WORTH?" hint="Reward in points. Tougher bets pay more. Closes-at locks picks; after that no manager can change." />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <WizField label="Reward · base points" sub="Multipliers apply per-pick based on league spread.">
                  <RewardStepper value={reward} onChange={setReward} />
                </WizField>
                <WizField label="Picks close at" sub="Default = 30 min before kickoff.">
                  <input type="datetime-local" value={closes} onChange={e => setCloses(e.target.value)} style={inputStyle} />
                </WizField>
              </div>
              <WizField label="Bet title" sub={`Shown in BETS tab. Leave blank to use: "${autoTitle}"`}>
                <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder={autoTitle} style={inputStyle} />
              </WizField>
              <NextBar onBack={() => setStep(2)} onNext={() => setStep(4)} canNext={canStep4} />
            </>
          )}

          {step === 4 && (
            <>
              <WizHelp num="04" label="REVIEW & PUBLISH" hint="The preview on the right is exactly what every manager will see in the BETS tab. Publishing notifies the league." />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <SummaryRow k="TYPE"    v={typeMeta?.label} />
                <SummaryRow k="FIXTURE" v={fixtureMeta?.label} sub={fixtureMeta && `${fixtureMeta.md} · ${fixtureMeta.kickoff}`} />
                {betType === 'top-scorer'   && <SummaryRow k="PLAYER POOL" v={`${players.length} players`} />}
                {betType === 'player-block' && <SummaryRow k="BLOCK TARGET" v={blockPlayer} />}
                {betType === 'match-result' && <SummaryRow k="OPTIONS" v="HOME · DRAW · AWAY" />}
                <SummaryRow k="REWARD" v={`+${reward} PTS`} tone="var(--positive)" />
                <SummaryRow k="LOCKS"  v={closes} />
                <SummaryRow k="TITLE"  v={computedTitle} />
              </div>
              <div style={{ padding: '10px 12px', background: 'rgba(224,168,0,.06)', border: '1px solid rgba(224,168,0,.33)', fontFamily: BODY, fontSize: 11, lineHeight: 1.5, color: 'var(--paper)' }}>
                <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.22em', color: 'var(--gold)' }}>● NOTE</span>{' '}
                Publishing pushes a notification to <b>{memberCount} managers</b> and opens picks immediately. You can edit until the first manager picks.
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => setStep(3)} style={ghostBtn}>← BACK</button>
                <button
                  onClick={handlePublish}
                  disabled={commLoading}
                  style={{ ...btnBase, background: 'var(--positive)', color: 'var(--ink)', flex: 1, fontSize: 12 }}
                >
                  {commLoading ? 'PUBLISHING…' : 'PUBLISH BET →'}
                </button>
              </div>
            </>
          )}
        </div>

        {/* Live preview panel */}
        <aside style={{ padding: '18px', background: 'var(--ink-2)', display: 'flex', flexDirection: 'column', gap: 10, overflow: 'auto' }}>
          <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.22em', color: 'var(--mute)' }}>LIVE PREVIEW · WHAT MANAGERS WILL SEE</span>
          <BetCardPreview
            betType={betType}
            title={computedTitle}
            reward={reward}
            closes={closes}
            fixture={fixtureMeta}
            players={players}
            blockPlayer={blockPlayer}
          />
          <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.16em', color: 'var(--mute)', lineHeight: 1.5 }}>
            UPDATES AS YOU EDIT. THIS CARD APPEARS IN THE <b style={{ color: 'var(--cyan)' }}>BETS TAB</b> FOR EVERY MANAGER ONCE PUBLISHED.
          </span>
        </aside>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Resolve pending bets (Zone B right)
// ─────────────────────────────────────────────────────────────────────────────
function ResolvePendingBets({ openBets, resolutionBetsLoading, setSelectedBetForResolution, betResolutionAnswer, setBetResolutionAnswer, betSubmissions, answerGrouped, fetchBetSubmissions, resolveBet, commLoading }) {
  const [expandedId, setExpandedId] = useState(null);

  const pending = (openBets || []).filter(b => b.status !== 'resolved');

  const toggleCard = (betId) => {
    if (expandedId === betId) {
      setExpandedId(null);
    } else {
      setExpandedId(betId);
      setSelectedBetForResolution(openBets.find(b => b.id === betId) || null);
      setBetResolutionAnswer('');
      fetchBetSubmissions(betId);
    }
  };

  const typeTone = (templateId) => {
    if (templateId === 'top_scorer')   return 'var(--cyan)';
    if (templateId === 'match_result') return 'var(--positive)';
    if (templateId === 'player_block') return 'var(--danger)';
    return 'var(--paper)';
  };

  const typeGlyph = (templateId) => {
    if (templateId === 'top_scorer')   return '◉';
    if (templateId === 'match_result') return '◈';
    if (templateId === 'player_block') return '⛌';
    return '◈';
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <HubSectionLabel
        label="RESOLVE BETS"
        sub={`${pending.length} PENDING · WAITING ON YOU`}
        tone="var(--gold)"
        right={<span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.22em', color: 'var(--mute)' }}>AUTO-RESOLVE IS OFF</span>}
      />
      <div style={{ padding: '14px 22px 6px', fontFamily: BODY, fontSize: 11, color: 'var(--mute)', lineHeight: 1.5 }}>
        Pick a bet, enter the result, hit <b style={{ color: 'var(--gold)' }}>RESOLVE</b>. Points are awarded immediately.
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '8px 22px 22px', overflow: 'auto', flex: 1 }}>
        {resolutionBetsLoading ? (
          <div style={{ padding: '18px', fontFamily: MONO, fontSize: 10, color: 'var(--mute)', letterSpacing: '.2em' }}>LOADING BETS…</div>
        ) : pending.length === 0 ? (
          <div style={{ padding: '18px 14px', background: 'var(--ink-2)', border: '1px dashed var(--rule)', textAlign: 'center' }}>
            <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '.22em', color: 'var(--mute)' }}>NOTHING TO RESOLVE · ALL CAUGHT UP</span>
          </div>
        ) : pending.map(b => {
          const isOpen = expandedId === b.id;
          const tone   = typeTone(b.template_id);
          const glyph  = typeGlyph(b.template_id);
          const opts   = Array.isArray(b.options) ? b.options : [];
          const currentAnswer = isOpen ? betResolutionAnswer : '';

          return (
            <div key={b.id} style={{ background: 'var(--ink-2)', border: '1px solid var(--rule)', borderLeft: `3px solid ${tone}` }}>
              <button
                onClick={() => toggleCard(b.id)}
                style={{ width: '100%', background: 'transparent', border: 0, color: 'var(--paper)', padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', textAlign: 'left' }}
              >
                <span style={{ width: 22, height: 22, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: `${tone}15`, border: `1px solid ${tone}55`, fontFamily: DISPLAY, fontSize: 12, color: tone }}>{glyph}</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
                  <span style={{ fontFamily: DISPLAY, fontSize: 13, color: 'var(--paper)' }}>{b.title}</span>
                  <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.16em', color: 'var(--mute)' }}>{b.scope_ref || b.scope_type || ''}</span>
                </div>
                <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.22em', color: 'var(--gold)' }}>● PENDING</span>
                <span style={{ color: 'var(--mute)', fontFamily: MONO, fontSize: 14 }}>{isOpen ? '−' : '+'}</span>
              </button>

              {isOpen && (
                <div style={{ padding: '4px 14px 14px', display: 'flex', flexDirection: 'column', gap: 12, borderTop: '1px solid var(--rule)' }}>
                  {/* Who picked what */}
                  {Object.keys(answerGrouped).length > 0 && (
                    <div>
                      <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.22em', color: 'var(--mute)' }}>WHO PICKED WHAT · {betSubmissions.length}/{pending.length + 2}</span>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                        {Object.entries(answerGrouped).map(([optKey, usernames]) => (
                          <div key={optKey} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontFamily: DISPLAY, fontSize: 11, minWidth: 80, color: 'var(--paper)' }}>
                              {opts.find(o => (o.key ?? o) === optKey)?.label ?? optKey}
                            </span>
                            <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                              {usernames.slice(0, 6).map(name => (
                                <MgrTag key={name} mono={mgrMono(name)} hue={mgrHue(name)} size={16} />
                              ))}
                            </div>
                            <span style={{ flex: 1 }} />
                            <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.14em', color: 'var(--mute)' }}>{usernames.length} MGRS</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Answer chips */}
                  <WizField label="ANSWER" sub="Select the winning option.">
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {opts.map(opt => {
                        const optKey   = opt.key ?? opt;
                        const optLabel = opt.label ?? opt;
                        const picked   = currentAnswer === optKey;
                        const subCount = answerGrouped[optKey]?.length ?? 0;
                        return (
                          <button key={optKey} onClick={() => setBetResolutionAnswer(optKey)} style={{
                            padding: '7px 11px', cursor: 'pointer',
                            background: picked ? 'rgba(34,197,94,.08)' : 'var(--ink)',
                            border: picked ? '1px solid var(--positive)' : '1px solid var(--rule)',
                            color: picked ? 'var(--positive)' : 'var(--paper)',
                            fontFamily: DISPLAY, fontSize: 11, letterSpacing: '-0.01em',
                            display: 'flex', flexDirection: 'column', gap: 2, textAlign: 'left',
                          }}>
                            <span>{picked ? '✓ ' : ''}{optLabel}</span>
                            {subCount > 0 && <span style={{ fontFamily: MONO, fontSize: 8, letterSpacing: '.14em', color: picked ? 'var(--positive)' : 'var(--mute)' }}>{subCount} MGRS</span>}
                          </button>
                        );
                      })}
                    </div>
                  </WizField>

                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.16em', color: 'var(--mute)' }}>
                      AWARDS <b style={{ color: 'var(--positive)' }}>+{b.reward_value} PTS</b> TO {currentAnswer ? (answerGrouped[currentAnswer]?.length ?? 0) : '—'} MANAGERS
                    </span>
                    <span style={{ flex: 1 }} />
                    <button
                      onClick={() => {
                        if (!window.confirm(`Void "${b.title}"? No points will be awarded and all picks will be marked VOIDED.`)) return;
                        // TODO: wire to voidBet when that function is added
                      }}
                      style={{ ...ghostBtn, fontSize: 9 }}
                    >VOID</button>
                    <button
                      disabled={commLoading || !currentAnswer}
                      onClick={resolveBet}
                      style={{
                        ...btnBase, fontSize: 11,
                        background: currentAnswer ? 'var(--gold)' : 'var(--ink-3)',
                        color: currentAnswer ? 'var(--ink)' : 'var(--mute)',
                        cursor: currentAnswer ? 'pointer' : 'not-allowed',
                      }}
                    >{commLoading ? 'RESOLVING…' : 'RESOLVE →'}</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Lifecycle operation card
// ─────────────────────────────────────────────────────────────────────────────
function LifecycleOp({ title, status, statusTone = 'var(--mute)', sub, when, children, primary }) {
  return (
    <div style={{ background: 'var(--ink-2)', border: '1px solid var(--rule)', display: 'flex', flexDirection: 'column', minHeight: 240 }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--rule)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ width: 3, height: 12, background: statusTone, flexShrink: 0 }} />
        <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '.22em', color: 'var(--paper)' }}>{title}</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.22em', color: statusTone }}>● {status}</span>
      </div>
      <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
        {sub && <span style={{ fontFamily: BODY, fontSize: 11, color: 'var(--mute)', lineHeight: 1.5 }}>{sub}</span>}
        {children}
        {when && (
          <div style={{ marginTop: 'auto', padding: '6px 8px', background: 'var(--ink)', border: '1px solid var(--rule)', fontFamily: BODY, fontSize: 10, color: 'var(--mute)', lineHeight: 1.4 }}>
            <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.2em', color: 'var(--paper)' }}>WHEN TO RUN · </span>
            {when}
          </div>
        )}
        {primary}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Lifecycle operations (Zone C)
// ─────────────────────────────────────────────────────────────────────────────
function LifecycleOps({ commissioner, leagueId }) {
  const {
    commLoading, commAction, setCommMsg,
    windowOpensAt, setWindowOpensAt,
    windowClosesAt, setWindowClosesAt,
    windowTransfers, setWindowTransfers,
    openTransferWindow, closeTransferWindow,
    draftDeadline, setDraftDeadline, setLeagueDraftDeadline,
    scoreFixtureId, setScoreFixtureId, triggerScores,
  } = commissioner;

  const handleCloseNow = () => {
    if (!window.confirm('This stops all in-progress transfers immediately. Continue?')) return;
    closeTransferWindow();
  };

  const handleRunAllocation = () => {
    if (!window.confirm('This allocates squads for all managers. It cannot be undone without a manual reset. Continue?')) return;
    commAction(async () => {
      const { error } = await supabase.rpc('run_draft_allocation', { p_league_id: leagueId });
      if (error) throw new Error(error.message);
      setCommMsg({ type: 'ok', text: 'Draft allocation complete.' });
    });
  };

  const handleSeedCup = () => {
    if (!window.confirm('Seeding the cup pool prevents repeat picks across cup rounds. It cannot be undone for this season. Continue?')) return;
    commAction(async () => {
      const { error } = await supabase.rpc('seed_cup_clubs', { p_league_id: leagueId });
      if (error) throw new Error(error.message);
      setCommMsg({ type: 'ok', text: 'Cup clubs seeded.' });
    });
  };

  const opBtnStyle = (bg, color = 'var(--ink)') => ({
    ...btnBase, width: '100%', background: commLoading ? 'var(--ink-3)' : bg,
    color: commLoading ? 'var(--mute)' : color,
    cursor: commLoading ? 'not-allowed' : 'pointer', fontSize: 11,
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <HubSectionLabel label="LIFECYCLE OPERATIONS" sub="SEASON-STAGE CONTROLS" tone="var(--purple)" />
      <div style={{ padding: '18px 24px' }}>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4" style={{ gap: 14 }}>

          {/* Transfer Window */}
          <LifecycleOp
            title="TRANSFER WINDOW"
            status="CLOSED"
            statusTone="var(--danger)"
            sub="Open and close the trading window. While open, managers swap players from the market."
            when="Open between gameweeks. Close 1h before the first MD kickoff."
            primary={
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.2em', color: 'var(--mute)' }}>OPENS</span>
                    <input type="datetime-local" value={windowOpensAt} onChange={e => setWindowOpensAt(e.target.value)} style={inputStyle} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.2em', color: 'var(--mute)' }}>CLOSES</span>
                    <input type="datetime-local" value={windowClosesAt} onChange={e => setWindowClosesAt(e.target.value)} style={inputStyle} />
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.2em', color: 'var(--mute)' }}>LIMIT · BLANK = UNLIMITED</span>
                  <input type="number" min="1" value={windowTransfers} onChange={e => setWindowTransfers(e.target.value)} placeholder="e.g. 5" style={inputStyle} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 4 }}>
                  <button onClick={openTransferWindow} disabled={commLoading} style={opBtnStyle('var(--positive)')}>OPEN</button>
                  <button onClick={handleCloseNow}     disabled={commLoading} style={{ ...btnBase, width: '100%', background: 'transparent', border: '1px solid rgba(239,68,68,.33)', color: 'var(--danger)', cursor: commLoading ? 'not-allowed' : 'pointer', fontSize: 11 }}>CLOSE NOW</button>
                </div>
              </div>
            }
          />

          {/* Draft */}
          <LifecycleOp
            title="DRAFT"
            status="DEADLINE SET"
            statusTone="var(--positive)"
            sub="Set the pick deadline, then run the allocation engine. Allocation runs once per season."
            when="After all managers submit picks. Before GW1 kickoff."
            primary={
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.2em', color: 'var(--mute)' }}>DEADLINE</span>
                  <input type="datetime-local" value={draftDeadline} onChange={e => setDraftDeadline(e.target.value)} style={inputStyle} />
                </div>
                <button onClick={setLeagueDraftDeadline} disabled={commLoading} style={{ ...btnBase, width: '100%', background: 'transparent', border: '1px solid var(--rule)', color: 'var(--paper)', fontSize: 11 }}>SET DEADLINE</button>
                <div style={{ height: 1, background: 'var(--rule)', margin: '4px 0' }} />
                <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.18em', color: 'var(--mute)', lineHeight: 1.6 }}>
                  ONCE DONE · 15 PLAYERS / MGR · £100M BUDGET · GK≤2 DEF≤5 MID≤5 FWD≤3
                </div>
                <button onClick={handleRunAllocation} disabled={commLoading} style={opBtnStyle('var(--gold)')}>RUN ALLOCATION ↯</button>
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
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ padding: '8px 10px', background: 'var(--ink)', border: '1px solid var(--rule)', fontFamily: BODY, fontSize: 10, color: 'var(--mute)', lineHeight: 1.5 }}>
                  <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.2em', color: 'var(--purple)' }}>20 CLUBS · 14 MGRS</span><br />
                  Each mgr will use a club at most once during cup rounds.
                </div>
                <button onClick={handleSeedCup} disabled={commLoading} style={{ ...opBtnStyle('var(--purple)', 'var(--paper)'), marginTop: 'auto' }}>SEED CUP CLUBS ↯</button>
              </div>
            }
          />

          {/* Score Recalculation */}
          <LifecycleOp
            title="SCORE RECALCULATION"
            status="UTILITY · ON-DEMAND"
            statusTone="var(--mute)"
            sub="Re-run scoring for a specific fixture. Use when a stat-provider correction lands or after a manual override."
            when="Anytime. Safe — only re-applies the latest data."
            primary={
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.2em', color: 'var(--mute)' }}>FIXTURE ID</span>
                  <input type="text" value={scoreFixtureId} onChange={e => setScoreFixtureId(e.target.value)} placeholder="e.g. mci-bha · MD5" style={inputStyle} />
                </div>
                <button onClick={triggerScores} disabled={commLoading || !scoreFixtureId} style={{ ...opBtnStyle('var(--warn)'), marginTop: 'auto', cursor: (commLoading || !scoreFixtureId) ? 'not-allowed' : 'pointer' }}>RECALCULATE SCORES ↯</button>
              </div>
            }
          />

        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Mobile accordion variants
// ─────────────────────────────────────────────────────────────────────────────
function MobSeasonStepper() {
  const phases = [
    { label: 'TRANSFERS',  state: 'done' },
    { label: 'DRAFT',      state: 'done' },
    { label: 'ALLOCATION', state: 'done' },
    { label: 'CUP',        state: 'active' },
    { label: 'SEASON',     state: 'todo' },
  ];
  return (
    <div style={{ padding: '14px 18px', background: 'var(--ink-2)', borderBottom: '1px solid var(--rule)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <span style={{ width: 3, height: 12, background: 'var(--purple)', flexShrink: 0 }} />
        <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '.22em', color: 'var(--paper)' }}>COMMISSIONER</span>
        <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.18em', color: 'var(--mute)' }}>· ADMIN ONLY</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4, position: 'relative' }}>
        <div style={{ position: 'absolute', top: 11, left: '10%', right: '10%', height: 1, background: 'var(--rule)' }} />
        {phases.map((p, i) => {
          const tone = p.state === 'done' ? 'var(--positive)' : p.state === 'active' ? 'var(--cyan)' : 'var(--mute)';
          return (
            <div key={p.label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, zIndex: 1 }}>
              <span style={{
                width: 22, height: 22, borderRadius: '50%',
                background: p.state === 'done' ? tone : 'var(--ink-2)',
                border: `1.5px solid ${tone}`,
                color: p.state === 'done' ? 'var(--ink)' : tone,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: MONO, fontSize: 9, fontWeight: 600,
              }}>{p.state === 'done' ? '✓' : i + 1}</span>
              <span style={{ fontFamily: MONO, fontSize: 8, letterSpacing: '.16em', color: tone, textAlign: 'center' }}>{p.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MobLifecycleCard({ title, status, tone, children, when, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ background: 'var(--ink-2)', border: '1px solid var(--rule)', borderLeft: `3px solid ${tone}` }}>
      <button onClick={() => setOpen(!open)} style={{ background: 'transparent', border: 0, padding: '12px 16px', width: '100%', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
          <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '.22em', color: 'var(--paper)' }}>{title}</span>
          <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.18em', color: tone }}>● {status}</span>
        </div>
        <span style={{ color: 'var(--mute)', fontFamily: MONO, fontSize: 14 }}>{open ? '−' : '+'}</span>
      </button>
      {open && (
        <div style={{ padding: '4px 16px 16px', display: 'flex', flexDirection: 'column', gap: 10, borderTop: '1px solid var(--rule)' }}>
          {children}
          {when && (
            <div style={{ padding: '6px 8px', background: 'var(--ink)', border: '1px solid var(--rule)', fontFamily: BODY, fontSize: 10, color: 'var(--mute)', lineHeight: 1.4 }}>
              <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.2em', color: 'var(--paper)' }}>WHEN · </span>{when}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MobSectionHeader({ label, sub, tone }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 18px', borderBottom: '1px solid var(--rule)', background: 'var(--ink-2)' }}>
      <span style={{ width: 3, height: 12, background: tone, flexShrink: 0 }} />
      <div>
        <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '.22em', color: 'var(--paper)' }}>{label}</span>
        {sub && <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.18em', color: 'var(--mute)', marginLeft: 8 }}>{sub}</span>}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Feedback message
// ─────────────────────────────────────────────────────────────────────────────
function CommMsg({ msg, onDismiss }) {
  if (!msg) return null;
  const ok = msg.type === 'ok';
  return (
    <div style={{
      margin: '12px 24px 0', padding: '10px 14px',
      background: ok ? 'rgba(34,197,94,.08)' : 'rgba(239,68,68,.08)',
      border: `1px solid ${ok ? 'rgba(34,197,94,.3)' : 'rgba(239,68,68,.3)'}`,
      color: ok ? 'var(--positive)' : 'var(--danger)',
      fontFamily: BODY, fontSize: 12,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
    }}>
      <span>{msg.text}</span>
      <button onClick={onDismiss} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', opacity: 0.6, fontSize: 14 }}>✕</button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Root export
// ─────────────────────────────────────────────────────────────────────────────
export default function CommissionerPanel({ commissioner, leagueId, memberCount = 0, leagueName = 'LEAGUE' }) {
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 1024);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 1024);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const {
    commLoading, commMsg, setCommMsg, commAction,
    openBets, resolutionBetsLoading,
    selectedBetForResolution, setSelectedBetForResolution,
    betResolutionAnswer, setBetResolutionAnswer,
    betSubmissions, answerGrouped,
    fetchBetSubmissions, resolveBet,
    createBetFromData,
  } = commissioner;

  const handlePublish = (wizardData) => {
    createBetFromData(wizardData);
  };

  if (isMobile) {
    // ── Mobile layout ────────────────────────────────────────────────────────
    const {
      windowOpensAt, setWindowOpensAt,
      windowClosesAt, setWindowClosesAt,
      windowTransfers, setWindowTransfers,
      openTransferWindow, closeTransferWindow,
      draftDeadline, setDraftDeadline, setLeagueDraftDeadline,
      scoreFixtureId, setScoreFixtureId, triggerScores,
    } = commissioner;

    const mobInput = { ...inputStyle };
    const mobBtn = { ...btnBase, width: '100%', fontSize: 12 };

    return (
      <div style={{ flex: 1, overflow: 'auto', background: 'var(--ink)', display: 'flex', flexDirection: 'column' }}>
        <CommMsg msg={commMsg} onDismiss={() => setCommMsg(null)} />
        <MobSeasonStepper />

        {/* Create bet (mobile) */}
        <MobSectionHeader label="CREATE BET" sub="GUIDED · 4 STEPS" tone="var(--cyan)" />
        <div style={{ padding: '14px 18px' }}>
          <CreateBetWizard onPublish={handlePublish} commLoading={commLoading} memberCount={memberCount} />
        </div>

        {/* Resolve bets (mobile) */}
        <MobSectionHeader label="RESOLVE PENDING" sub="WAITING ON YOU" tone="var(--gold)" />
        <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <ResolvePendingBets
            openBets={openBets}
            resolutionBetsLoading={resolutionBetsLoading}
            selectedBetForResolution={selectedBetForResolution}
            setSelectedBetForResolution={setSelectedBetForResolution}
            betResolutionAnswer={betResolutionAnswer}
            setBetResolutionAnswer={setBetResolutionAnswer}
            betSubmissions={betSubmissions}
            answerGrouped={answerGrouped}
            fetchBetSubmissions={fetchBetSubmissions}
            resolveBet={resolveBet}
            commLoading={commLoading}
          />
        </div>

        {/* Lifecycle ops (mobile) */}
        <MobSectionHeader label="LIFECYCLE OPERATIONS" sub="SEASON CONTROLS" tone="var(--purple)" />
        <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 80 }}>
          <MobLifecycleCard title="TRANSFER WINDOW" status="CLOSED" tone="var(--danger)" when="Open between gameweeks. Close 1h before MD kickoff.">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.2em', color: 'var(--mute)' }}>OPENS</span>
              <input type="datetime-local" value={windowOpensAt} onChange={e => setWindowOpensAt(e.target.value)} style={mobInput} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.2em', color: 'var(--mute)' }}>CLOSES</span>
              <input type="datetime-local" value={windowClosesAt} onChange={e => setWindowClosesAt(e.target.value)} style={mobInput} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.2em', color: 'var(--mute)' }}>LIMIT · BLANK = UNLIMITED</span>
              <input type="number" min="1" value={windowTransfers} onChange={e => setWindowTransfers(e.target.value)} placeholder="e.g. 5" style={mobInput} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <button onClick={openTransferWindow} disabled={commLoading} style={{ ...mobBtn, background: 'var(--positive)', color: 'var(--ink)' }}>OPEN</button>
              <button onClick={() => { if (window.confirm('Close the transfer window immediately?')) closeTransferWindow(); }} disabled={commLoading} style={{ ...mobBtn, background: 'transparent', color: 'var(--danger)', border: '1px solid rgba(239,68,68,.33)' }}>CLOSE NOW</button>
            </div>
          </MobLifecycleCard>

          <MobLifecycleCard title="DRAFT" status="DEADLINE SET" tone="var(--positive)" when="After all picks. Before GW1.">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.2em', color: 'var(--mute)' }}>DEADLINE</span>
              <input type="datetime-local" value={draftDeadline} onChange={e => setDraftDeadline(e.target.value)} style={mobInput} />
            </div>
            <button onClick={setLeagueDraftDeadline} disabled={commLoading} style={{ ...mobBtn, background: 'transparent', color: 'var(--paper)', border: '1px solid var(--rule)' }}>SET DEADLINE</button>
            <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.18em', color: 'var(--mute)', lineHeight: 1.6 }}>15 PLAYERS / MGR · £100M · GK≤2 DEF≤5 MID≤5 FWD≤3</div>
            <button onClick={() => { if (window.confirm('Run allocation for all managers? This cannot be undone without a manual reset.')) { commAction(async () => { const { error } = await supabase.rpc('run_draft_allocation', { p_league_id: leagueId }); if (error) throw new Error(error.message); setCommMsg({ type: 'ok', text: 'Allocation complete.' }); }); } }} disabled={commLoading} style={{ ...mobBtn, background: 'var(--gold)', color: 'var(--ink)' }}>RUN ALLOCATION ↯</button>
          </MobLifecycleCard>

          <MobLifecycleCard title="CUP PHASE" status="UNSEEDED" tone="var(--warn)" when="After allocation.">
            <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.18em', color: 'var(--mute)' }}>20 CLUBS · 14 MGRS · 1 CLUB / MGR / ROUND</div>
            <button onClick={() => { if (window.confirm('Seed cup clubs? This cannot be undone for this season.')) { commAction(async () => { const { error } = await supabase.rpc('seed_cup_clubs', { p_league_id: leagueId }); if (error) throw new Error(error.message); setCommMsg({ type: 'ok', text: 'Cup clubs seeded.' }); }); } }} disabled={commLoading} style={{ ...mobBtn, background: 'var(--purple)', color: 'var(--paper)' }}>SEED CUP CLUBS ↯</button>
          </MobLifecycleCard>

          <MobLifecycleCard title="SCORE RECALCULATION" status="UTILITY" tone="var(--mute)" when="Anytime. Safe.">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.2em', color: 'var(--mute)' }}>FIXTURE ID</span>
              <input type="text" value={scoreFixtureId} onChange={e => setScoreFixtureId(e.target.value)} placeholder="e.g. mci-bha · MD5" style={mobInput} />
            </div>
            <button onClick={triggerScores} disabled={commLoading || !scoreFixtureId} style={{ ...mobBtn, background: 'var(--warn)', color: 'var(--ink)' }}>RECALCULATE ↯</button>
          </MobLifecycleCard>
        </div>
      </div>
    );
  }

  // ── Desktop layout ──────────────────────────────────────────────────────────
  return (
    <div style={{ flex: 1, overflow: 'auto', background: 'var(--ink)', display: 'flex', flexDirection: 'column' }}>
      <CommMsg msg={commMsg} onDismiss={() => setCommMsg(null)} />

      {/* Zone A — Season stepper */}
      <SeasonStepper leagueName={leagueName} memberCount={memberCount} />

      {/* Zone B — Bet management (two columns) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', borderBottom: '1px solid var(--rule)', minHeight: 600 }}>
        <div style={{ borderRight: '1px solid var(--rule)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <CreateBetWizard onPublish={handlePublish} commLoading={commLoading} memberCount={memberCount} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <ResolvePendingBets
            openBets={openBets}
            resolutionBetsLoading={resolutionBetsLoading}
            selectedBetForResolution={selectedBetForResolution}
            setSelectedBetForResolution={setSelectedBetForResolution}
            betResolutionAnswer={betResolutionAnswer}
            setBetResolutionAnswer={setBetResolutionAnswer}
            betSubmissions={betSubmissions}
            answerGrouped={answerGrouped}
            fetchBetSubmissions={fetchBetSubmissions}
            resolveBet={resolveBet}
            commLoading={commLoading}
          />
        </div>
      </div>

      {/* Zone C — Lifecycle ops */}
      <LifecycleOps commissioner={commissioner} leagueId={leagueId} />
    </div>
  );
}
