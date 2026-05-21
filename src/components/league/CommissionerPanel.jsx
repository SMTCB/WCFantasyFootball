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

// Format a kickoff ISO timestamp to a short readable string
function fmtKickoff(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit',
  });
}

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

function PlayerChipPool({ selected, onChange, onAddCustom }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {selected.map(p => (
        <button key={p.id} onClick={() => onChange(selected.filter(x => x.id !== p.id))} style={{
          padding: '6px 10px', cursor: 'pointer',
          background: 'rgba(0,180,216,.08)',
          border: '1px solid var(--cyan)',
          color: 'var(--cyan)',
          fontFamily: MONO, fontSize: 10, letterSpacing: '.12em',
          display: 'flex', alignItems: 'center', gap: 4,
        }}>
          <span>✓ {p.name}</span>
          <span style={{ opacity: 0.55, fontSize: 8 }}>{(p.club || '').substring(0, 3).toUpperCase()}</span>
          <span style={{ opacity: 0.5, marginLeft: 2 }}>✕</span>
        </button>
      ))}
      {selected.length < 8 && (
        <button onClick={onAddCustom} style={{
          padding: '6px 10px', cursor: 'pointer',
          background: 'rgba(224,168,0,.04)',
          border: '1px dashed rgba(224,168,0,.5)',
          color: 'var(--gold)',
          fontFamily: MONO, fontSize: 10, letterSpacing: '.12em',
        }}>+ SELECT PLAYER</button>
      )}
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

function BetCardPreview({ betType, title, reward, closes, fixtureObj, players, blockPlayer }) {
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
    ? (fixtureObj ? [`${fixtureObj.home_team} Win`, 'DRAW', `${fixtureObj.away_team} Win`] : ['HOME', 'DRAW', 'AWAY'])
    : betType === 'top-scorer'
      ? players.slice(0, 4).map(p => typeof p === 'object' ? p.name : p.split(' (')[0])
      : blockPlayer ? [typeof blockPlayer === 'object' ? blockPlayer.name : blockPlayer.split(' (')[0]] : [];

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
function CreateBetWizard({ onPublish, commLoading, memberCount, tournamentId, isMobile = false }) {
  const [step,        setStep]   = useState(1);
  const [betType,     setBetType] = useState(null);
  const [fixture,     setFixture] = useState('');      // single fixture id (match-result / player-block)
  const [selectedFixtures, setSelectedFixtures] = useState([]); // multi-fixture ids for top-scorer (max 4)
  const [players,     setPlayers] = useState([]);      // selected player objects for top-scorer
  const [blockPlayer, setBlock]   = useState(null);    // player object for player-block
  const [reward,      setReward]  = useState(5);
  const [closes,      setCloses]  = useState('');
  const [title,       setTitle]   = useState('');

  // DB data
  const [dbFixtures,    setDbFixtures]    = useState([]);  // next-gameday scheduled fixtures
  const [allDbFixtures, setAllDbFixtures] = useState([]);  // all future scheduled fixtures
  const [allPlayers,    setAllPlayers]    = useState([]);  // all players in tournament
  const [dataLoading,   setDataLoading]   = useState(false);

  // Modal state
  const [showPlayerModal,  setShowPlayerModal]  = useState(false);
  const [playerSearch,     setPlayerSearch]     = useState('');
  const [showFixtureModal, setShowFixtureModal] = useState(false);
  const [fixtureSearch,    setFixtureSearch]    = useState('');

  // Load real fixtures + players from DB when tournamentId is available
  useEffect(() => {
    if (!tournamentId) return;
    setDataLoading(true);
    const now = new Date().toISOString();
    Promise.all([
      supabase.from('fixtures')
        .select('id, home_team, away_team, kickoff_at')
        .eq('tournament_id', tournamentId)
        .eq('status', 'scheduled')
        .gte('kickoff_at', now)
        .order('kickoff_at', { ascending: true })
        .limit(40),
      supabase.from('players')
        .select('id, name, position, club')
        .eq('tournament_id', tournamentId)
        .in('position', ['FWD', 'MID', 'DEF', 'GK'])
        .order('price', { ascending: false })
        .limit(300),
    ]).then(([{ data: fx }, { data: pl }]) => {
      const allFx = fx || [];
      // Group to next gameday: fixtures within 7 days of the first one
      let nextGameday = allFx;
      if (allFx.length > 0) {
        const first = new Date(allFx[0].kickoff_at).getTime();
        const cutoff = first + 7 * 24 * 60 * 60 * 1000;
        nextGameday = allFx.filter(f => new Date(f.kickoff_at).getTime() <= cutoff);
      }
      setDbFixtures(nextGameday);
      setAllDbFixtures(allFx);

      const allPl = pl || [];
      setAllPlayers(allPl);
      // Default top-scorer pool: top 5 FWD+MID by price
      setPlayers(allPl.filter(p => ['FWD', 'MID'].includes(p.position)).slice(0, 5));
    }).catch(e => console.error('[CreateBetWizard] data load error:', e))
      .finally(() => setDataLoading(false));
  }, [tournamentId]);

  const typeMeta    = BET_TYPES.find(t => t.id === betType) || null;
  const fixtureMeta = allDbFixtures.find(f => f.id === fixture) || null;

  const autoTitle = (() => {
    if (!typeMeta) return '';
    if (betType === 'top-scorer') {
      const fxObjs = allDbFixtures.filter(f => selectedFixtures.includes(f.id));
      const scope = fxObjs.length === 1
        ? `${fxObjs[0].home_team} vs ${fxObjs[0].away_team}`
        : fxObjs.length > 1 ? `${fxObjs.length} matches` : 'Matchday';
      return `Top scorer · ${scope}`;
    }
    if (betType === 'match-result') return fixtureMeta ? `Result · ${fixtureMeta.home_team} vs ${fixtureMeta.away_team}` : 'Match result';
    if (betType === 'player-block') return blockPlayer ? `Block · ${blockPlayer.name}` : 'Player block';
    return '';
  })();
  const computedTitle = title || autoTitle;

  const canStep2 = !!betType;
  const canStep3 = betType === 'top-scorer'
    ? players.length >= 2
    : !!fixture && (betType !== 'player-block' || !!blockPlayer);
  const canStep4 = !!reward && !!closes;

  const reset = () => {
    setStep(1); setBetType(null); setFixture(''); setBlock(null);
    setSelectedFixtures([]);
    setReward(5); setCloses(''); setTitle('');
    setPlayers(allPlayers.filter(p => ['FWD', 'MID'].includes(p.position)).slice(0, 5));
  };

  const handlePublish = () => {
    let options = [];
    let scopeType = 'match';
    let scopeRef  = null;

    if (betType === 'match-result') {
      options = [
        { key: `${fixture}_home`, label: `${fixtureMeta?.home_team || 'Home'} Win`, meta: {} },
        { key: `${fixture}_draw`, label: 'Draw', meta: {} },
        { key: `${fixture}_away`, label: `${fixtureMeta?.away_team || 'Away'} Win`, meta: {} },
      ];
      scopeRef = fixture || null;
    } else if (betType === 'top-scorer') {
      options   = players.map(p => ({ key: p.id, label: p.name, meta: { club: p.club, pos: p.position } }));
      scopeType = 'matchday';
      scopeRef  = selectedFixtures.join(',') || null;
    } else if (betType === 'player-block') {
      options  = blockPlayer
        ? [{ key: blockPlayer.id, label: blockPlayer.name, meta: { club: blockPlayer.club, pos: blockPlayer.position } }]
        : [];
      scopeRef = fixture || null;
    }

    onPublish({
      title:       computedTitle,
      prompt:      computedTitle,
      deadline:    closes,
      rewardValue: String(reward),
      scopeType,
      scopeRef,
      templateId:  typeMeta.templateId,
      options,
    });
    reset();
  };

  // Shared fixture picker (single-select) used by match-result and player-block
  const SingleFixturePicker = ({ accentColor = 'var(--cyan)' }) => (
    <WizField label="Fixture · Next gameday" sub="Bet will resolve at this match's final whistle.">
      {dataLoading ? (
        <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--mute)', letterSpacing: '.18em' }}>LOADING FIXTURES…</div>
      ) : dbFixtures.length === 0 ? (
        <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--danger)', letterSpacing: '.16em', padding: '10px 0' }}>
          {allDbFixtures.length > 0 ? 'NO FIXTURES IN NEXT 7 DAYS — TRY A DIFFERENT ROUND' : 'NO UPCOMING SCHEDULED FIXTURES FOUND'}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {dbFixtures.map(f => {
            const picked = fixture === f.id;
            return (
              <button key={f.id} onClick={() => setFixture(f.id)} style={{
                textAlign: 'left', cursor: 'pointer',
                background: picked ? `${accentColor}15` : 'var(--ink)',
                border: picked ? `1px solid ${accentColor}` : '1px solid var(--rule)',
                padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10,
              }}>
                <span style={{ width: 12, height: 12, borderRadius: '50%', border: `1.5px solid ${picked ? accentColor : 'var(--rule)'}`, background: picked ? accentColor : 'transparent', flexShrink: 0 }} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
                  <span style={{ fontFamily: DISPLAY, fontSize: 12, color: 'var(--paper)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.home_team} vs {f.away_team}</span>
                  <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.14em', color: 'var(--mute)' }}>{fmtKickoff(f.kickoff_at)}</span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </WizField>
  );

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
          { n: 1, label: 'TYPE',    reached: true,     done: !!betType },
          { n: 2, label: 'CONFIG',  reached: canStep2, done: canStep3  },
          { n: 3, label: 'REWARD',  reached: canStep3, done: canStep4  },
          { n: 4, label: 'PUBLISH', reached: canStep4, done: false     },
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
                padding: isMobile ? '10px 6px' : '14px 16px',
                cursor: s.reached ? 'pointer' : 'not-allowed',
                color: railTone,
                display: 'flex', alignItems: 'center', justifyContent: isMobile ? 'center' : 'flex-start', gap: isMobile ? 4 : 10,
              }}
            >
              <span style={{
                width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                border: `1.5px solid ${railTone}`,
                background: s.done ? railTone : 'transparent',
                color: s.done ? 'var(--ink)' : railTone,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: MONO, fontSize: 9, fontWeight: 600,
              }}>{s.done ? '✓' : s.n}</span>
              {isMobile ? (
                <span style={{ fontFamily: MONO, fontSize: 8, letterSpacing: '.14em', color: railTone }}>{s.label}</span>
              ) : (
                <span style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.22em', color: 'var(--mute)' }}>STEP {s.n}</span>
                  <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '.18em', color: railTone }}>{s.label}</span>
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Body: form left, live preview right (preview hidden on mobile) */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 300px', minHeight: 0, flex: 1 }}>
        <div style={{ padding: isMobile ? '16px 14px' : '22px 24px', display: 'flex', flexDirection: 'column', gap: 16, borderRight: isMobile ? 'none' : '1px solid var(--rule)', overflow: 'auto' }}>

          {/* ── Step 1: Bet type ── */}
          {step === 1 && (
            <>
              <WizHelp num="01" label="WHAT KIND OF BET?" hint="Each type uses a different resolution rule. Pick one — you can change it before publishing." />
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: 8 }}>
                {BET_TYPES.map(t => {
                  const picked = betType === t.id;
                  return (
                    <button key={t.id} onClick={() => setBetType(t.id)} style={{
                      textAlign: 'left', cursor: 'pointer',
                      background: picked ? `${t.tone}10` : 'var(--ink-2)',
                      border: picked ? `1px solid ${t.tone}` : '1px solid var(--rule)',
                      borderLeft: picked ? `3px solid ${t.tone}` : '3px solid transparent',
                      padding: isMobile ? '12px 14px' : '14px 16px',
                      display: 'flex', flexDirection: isMobile ? 'row' : 'column',
                      alignItems: isMobile ? 'center' : 'flex-start',
                      gap: isMobile ? 12 : 8,
                      minHeight: isMobile ? 0 : 140,
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

          {/* ── Step 2: Configure ── */}
          {step === 2 && (
            <>
              <WizHelp num="02" label="CONFIGURE" hint={typeMeta?.body || 'Set up the bet details.'} />

              {/* Match Result: single fixture */}
              {betType === 'match-result' && (
                <>
                  <SingleFixturePicker accentColor="var(--cyan)" />
                  <div style={{ padding: '10px 12px', background: 'var(--ink)', border: '1px solid var(--rule)', fontFamily: BODY, fontSize: 11, lineHeight: 1.5, color: 'var(--mute)' }}>
                    <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.2em', color: 'var(--positive)' }}>● AUTO</span>{' '}
                    Options: <b style={{ color: 'var(--paper)' }}>{fixtureMeta?.home_team || 'HOME'} WIN · DRAW · {fixtureMeta?.away_team || 'AWAY'} WIN</b>
                  </div>
                </>
              )}

              {/* Top Scorer: multi-fixture scope + player pool */}
              {betType === 'top-scorer' && (
                <>
                  <WizField label={`Match scope · ${selectedFixtures.length}/4 selected`} sub="Goals count across these matches. Leave empty for the full matchday.">
                    {dataLoading ? (
                      <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--mute)', letterSpacing: '.18em' }}>LOADING FIXTURES…</div>
                    ) : dbFixtures.length === 0 ? (
                      <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--mute)', letterSpacing: '.16em', padding: '10px 0' }}>NO UPCOMING FIXTURES FOUND</div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {dbFixtures.map(f => {
                          const on     = selectedFixtures.includes(f.id);
                          const atMax  = !on && selectedFixtures.length >= 4;
                          return (
                            <button key={f.id} onClick={() => {
                              if (on) setSelectedFixtures(prev => prev.filter(x => x !== f.id));
                              else if (!atMax) setSelectedFixtures(prev => [...prev, f.id]);
                            }} style={{
                              textAlign: 'left', cursor: atMax ? 'not-allowed' : 'pointer',
                              background: on ? 'rgba(0,180,216,.08)' : 'var(--ink)',
                              border: on ? '1px solid var(--cyan)' : '1px solid var(--rule)',
                              padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 8,
                              opacity: atMax ? 0.4 : 1,
                            }}>
                              <span style={{ width: 14, height: 14, border: `1.5px solid ${on ? 'var(--cyan)' : 'var(--rule)'}`, background: on ? 'var(--cyan)' : 'transparent', flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: MONO, fontSize: 9, color: 'var(--ink)' }}>{on ? '✓' : ''}</span>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontFamily: DISPLAY, fontSize: 12, color: 'var(--paper)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.home_team} vs {f.away_team}</div>
                                <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)', letterSpacing: '.12em' }}>{fmtKickoff(f.kickoff_at)}</div>
                              </div>
                            </button>
                          );
                        })}
                        {selectedFixtures.length < 4 && (
                          <button onClick={() => setShowFixtureModal(true)} style={{
                            padding: '8px 10px', cursor: 'pointer', textAlign: 'left',
                            background: 'rgba(224,168,0,.04)', border: '1px dashed rgba(224,168,0,.4)',
                            color: 'var(--gold)', fontFamily: MONO, fontSize: 10, letterSpacing: '.14em',
                          }}>+ ADD MATCH FROM ANOTHER ROUND</button>
                        )}
                      </div>
                    )}
                  </WizField>

                  <WizField label={`Player pool · ${players.length}/8`} sub="Managers pick one. Click a chip to remove.">
                    <PlayerChipPool selected={players} onChange={setPlayers} onAddCustom={() => setShowPlayerModal(true)} />
                    {players.length < 2 && (
                      <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--danger)', letterSpacing: '.16em', marginTop: 6 }}>ADD AT LEAST 2 PLAYERS</div>
                    )}
                  </WizField>
                </>
              )}

              {/* Player Block: single player + single fixture */}
              {betType === 'player-block' && (
                <>
                  <WizField label="Block target" sub="Managers pick this player to block — if they flop, they earn points.">
                    {blockPlayer ? (
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '10px 12px', background: 'rgba(239,68,68,.06)', border: '1px solid rgba(239,68,68,.3)' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontFamily: DISPLAY, fontSize: 13, color: 'var(--danger)' }}>{blockPlayer.name}</div>
                          <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)', letterSpacing: '.14em' }}>{blockPlayer.club} · {blockPlayer.position}</div>
                        </div>
                        <button onClick={() => setBlock(null)} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>✕</button>
                      </div>
                    ) : (
                      <button onClick={() => setShowPlayerModal(true)} style={{
                        padding: '12px', cursor: 'pointer', width: '100%', textAlign: 'center',
                        background: 'rgba(239,68,68,.04)', border: '1px dashed rgba(239,68,68,.4)',
                        color: 'var(--danger)', fontFamily: MONO, fontSize: 10, letterSpacing: '.18em',
                      }}>SELECT PLAYER TO BLOCK →</button>
                    )}
                  </WizField>
                  <SingleFixturePicker accentColor="var(--danger)" />
                </>
              )}

              <NextBar
                onBack={() => setStep(1)}
                onNext={() => setStep(3)}
                canNext={canStep3}
                hint={
                  betType === 'top-scorer'
                    ? (players.length < 2 ? 'Add at least 2 players to continue.' : '')
                    : !fixture
                      ? 'Pick a fixture to continue.'
                      : (betType === 'player-block' && !blockPlayer ? 'Select a block target too.' : '')
                }
              />
            </>
          )}

          {/* ── Step 3: Reward ── */}
          {step === 3 && (
            <>
              <WizHelp num="03" label="HOW MUCH IS IT WORTH?" hint="Reward in points. Tougher bets pay more. Closes-at locks picks; after that no manager can change." />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <WizField label="Reward · base points" sub="Awarded to every manager who gets it right.">
                  <RewardStepper value={reward} onChange={setReward} />
                </WizField>
                <WizField label="Picks close at" sub="Set before the first kickoff.">
                  <input type="datetime-local" value={closes} onChange={e => setCloses(e.target.value)} style={inputStyle} />
                </WizField>
              </div>
              <WizField label="Bet title" sub={`Shown in BETS tab. Leave blank to use: "${autoTitle}"`}>
                <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder={autoTitle} style={inputStyle} />
              </WizField>
              <NextBar onBack={() => setStep(2)} onNext={() => setStep(4)} canNext={canStep4} />
            </>
          )}

          {/* ── Step 4: Publish ── */}
          {step === 4 && (
            <>
              <WizHelp num="04" label="REVIEW & PUBLISH" hint="The preview on the right is exactly what every manager will see in the BETS tab. Publishing notifies the league." />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <SummaryRow k="TYPE"    v={typeMeta?.label} />
                {betType !== 'top-scorer' && fixtureMeta && (
                  <SummaryRow k="FIXTURE" v={`${fixtureMeta.home_team} vs ${fixtureMeta.away_team}`} sub={fmtKickoff(fixtureMeta.kickoff_at)} />
                )}
                {betType === 'top-scorer' && (
                  <>
                    <SummaryRow k="PLAYER POOL" v={`${players.length} players`} sub={players.map(p => p.name).join(', ')} />
                    <SummaryRow k="MATCH SCOPE" v={selectedFixtures.length === 0 ? 'Full matchday' : `${selectedFixtures.length} match${selectedFixtures.length > 1 ? 'es' : ''}`} />
                  </>
                )}
                {betType === 'player-block' && <SummaryRow k="BLOCK TARGET" v={blockPlayer?.name || '—'} sub={blockPlayer ? `${blockPlayer.club} · ${blockPlayer.position}` : ''} />}
                {betType === 'match-result' && <SummaryRow k="OPTIONS" v={`${fixtureMeta?.home_team || 'Home'} Win · Draw · ${fixtureMeta?.away_team || 'Away'} Win`} />}
                <SummaryRow k="REWARD" v={`+${reward} PTS`} tone="var(--positive)" />
                <SummaryRow k="LOCKS"  v={closes ? new Date(closes).toLocaleString('en-GB') : '—'} />
                <SummaryRow k="TITLE"  v={computedTitle} />
              </div>
              <div style={{ padding: '10px 12px', background: 'rgba(224,168,0,.06)', border: '1px solid rgba(224,168,0,.33)', fontFamily: BODY, fontSize: 11, lineHeight: 1.5, color: 'var(--paper)' }}>
                <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.22em', color: 'var(--gold)' }}>● NOTE</span>{' '}
                Publishing pushes a notification to <b>{memberCount} managers</b> and opens picks immediately.
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

        {/* Live preview panel — desktop only */}
        {!isMobile && <aside style={{ padding: '18px', background: 'var(--ink-2)', display: 'flex', flexDirection: 'column', gap: 10, overflow: 'auto' }}>
          <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.22em', color: 'var(--mute)' }}>LIVE PREVIEW · WHAT MANAGERS WILL SEE</span>
          <BetCardPreview
            betType={betType}
            title={computedTitle}
            reward={reward}
            closes={closes}
            fixtureObj={fixtureMeta}
            players={players}
            blockPlayer={blockPlayer}
          />
          <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.16em', color: 'var(--mute)', lineHeight: 1.5 }}>
            UPDATES AS YOU EDIT. THIS CARD APPEARS IN THE <b style={{ color: 'var(--cyan)' }}>BETS TAB</b> FOR EVERY MANAGER ONCE PUBLISHED.
          </span>
        </aside>}
      </div>

      {/* ── Player picker modal ── */}
      {showPlayerModal && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={e => { if (e.target === e.currentTarget) { setShowPlayerModal(false); setPlayerSearch(''); } }}
        >
          <div style={{ background: 'var(--ink)', border: '1px solid var(--rule)', width: isMobile ? 'calc(100vw - 32px)' : 380, maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.6)' }}>
            <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--rule)', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.22em', color: 'var(--cyan)', flex: 1 }}>SELECT PLAYER</span>
              <button onClick={() => { setShowPlayerModal(false); setPlayerSearch(''); }} style={{ background: 'none', border: 'none', color: 'var(--mute)', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>✕</button>
            </div>
            <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--rule)' }}>
              <input
                autoFocus
                type="text"
                placeholder="Search by name or club…"
                value={playerSearch}
                onChange={e => setPlayerSearch(e.target.value)}
                style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--paper)', fontSize: 12, padding: '8px 10px', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {allPlayers
                .filter(p => {
                  const q = playerSearch.toLowerCase();
                  return !q || p.name.toLowerCase().includes(q) || (p.club || '').toLowerCase().includes(q);
                })
                .slice(0, 60)
                .map(p => (
                  <button key={p.id} onClick={() => {
                    if (betType === 'player-block') {
                      setBlock(p);
                    } else {
                      // Top scorer: add to front of list, cap at 8 (last is dropped)
                      setPlayers(prev => {
                        if (prev.find(x => x.id === p.id)) return prev;
                        return [p, ...prev.slice(0, 7)];
                      });
                    }
                    setShowPlayerModal(false);
                    setPlayerSearch('');
                  }} style={{
                    width: '100%', textAlign: 'left', padding: '10px 14px',
                    background: 'transparent', border: 0,
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, color: 'var(--paper)',
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: DISPLAY, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                      <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)', letterSpacing: '.12em' }}>{p.club}</div>
                    </div>
                    <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--cyan)', letterSpacing: '.14em', flexShrink: 0 }}>{p.position}</span>
                  </button>
                ))}
              {allPlayers.length === 0 && !dataLoading && (
                <div style={{ padding: '20px', fontFamily: MONO, fontSize: 10, color: 'var(--mute)', textAlign: 'center', letterSpacing: '.18em' }}>NO PLAYERS FOUND · CHECK TOURNAMENT</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Additional fixture picker modal (for top-scorer "Add Match") ── */}
      {showFixtureModal && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={e => { if (e.target === e.currentTarget) { setShowFixtureModal(false); setFixtureSearch(''); } }}
        >
          <div style={{ background: 'var(--ink)', border: '1px solid var(--rule)', width: isMobile ? 'calc(100vw - 32px)' : 400, maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.6)' }}>
            <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--rule)', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.22em', color: 'var(--gold)', flex: 1 }}>ADD MATCH FROM ANOTHER ROUND</span>
              <button onClick={() => { setShowFixtureModal(false); setFixtureSearch(''); }} style={{ background: 'none', border: 'none', color: 'var(--mute)', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>✕</button>
            </div>
            <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--rule)' }}>
              <input
                autoFocus
                type="text"
                placeholder="Search team…"
                value={fixtureSearch}
                onChange={e => setFixtureSearch(e.target.value)}
                style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--paper)', fontSize: 12, padding: '8px 10px', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {allDbFixtures
                .filter(f => !selectedFixtures.includes(f.id))
                .filter(f => {
                  const q = fixtureSearch.toLowerCase();
                  return !q || f.home_team.toLowerCase().includes(q) || f.away_team.toLowerCase().includes(q);
                })
                .slice(0, 40)
                .map(f => (
                  <button key={f.id} onClick={() => {
                    if (selectedFixtures.length < 4) {
                      setSelectedFixtures(prev => [...prev, f.id]);
                    }
                    setShowFixtureModal(false);
                    setFixtureSearch('');
                  }} style={{
                    width: '100%', textAlign: 'left', padding: '10px 14px',
                    background: 'transparent', border: 0,
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                    cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 2, color: 'var(--paper)',
                  }}>
                    <div style={{ fontFamily: DISPLAY, fontSize: 12 }}>{f.home_team} vs {f.away_team}</div>
                    <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)', letterSpacing: '.12em' }}>{fmtKickoff(f.kickoff_at)}</div>
                  </button>
                ))}
              {allDbFixtures.length === 0 && !dataLoading && (
                <div style={{ padding: '20px', fontFamily: MONO, fontSize: 10, color: 'var(--mute)', textAlign: 'center', letterSpacing: '.18em' }}>NO UPCOMING FIXTURES FOUND</div>
              )}
            </div>
          </div>
        </div>
      )}
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
      margin: '12px 16px 0', padding: '10px 14px',
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
export default function CommissionerPanel({ commissioner, leagueId, tournamentId, memberCount = 0, leagueName = 'LEAGUE' }) {
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
        <div style={{ padding: '0' }}>
          <CreateBetWizard onPublish={handlePublish} commLoading={commLoading} memberCount={memberCount} tournamentId={tournamentId} isMobile={true} />
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
          <CreateBetWizard onPublish={handlePublish} commLoading={commLoading} memberCount={memberCount} tournamentId={tournamentId} />
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
