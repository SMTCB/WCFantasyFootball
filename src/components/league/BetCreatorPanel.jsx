import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../lib/supabase';
// Inline font constants — avoids importing HubShared here. LeagueScreen imports HubShared
// directly, and CommissionerPanel→BetCreatorPanel also importing it creates a competing
// module-evaluation path that causes a TDZ crash in Vite/Rolldown's production bundle.
const MONO    = "'JetBrains Mono', monospace";
const DISPLAY = "'Archivo Black', sans-serif";


const TEMPLATES = [
  {
    slug:        'top_scorer',
    label:       'Top Scorer',
    icon:        '🎯',
    description: 'Who scores the most goals?',
    answerType:  'player',
    scopeType:   'matchday',
    promptHint:  'Who will score the most goals this matchday?',
    defaultPos:  'FWD',
  },
  {
    slug:        'match_result',
    label:       'Match Result',
    icon:        '⚽',
    description: 'Predict the match outcome.',
    answerType:  'fixture',
    scopeType:   'match',
    promptHint:  'Predict the result of this match.',
    defaultPos:  'ALL',
  },
  {
    slug:        'clean_sheet',
    label:       'Clean Sheet',
    icon:        '🧤',
    description: 'Pick a team — clean sheet earns points.',
    answerType:  'team',
    scopeType:   'match',
    promptHint:  'Pick a team to keep a clean sheet.',
    defaultPos:  'ALL',
  },
];

// ── Sub-components ────────────────────────────────────────────────────────────

function TemplateCard({ t, selected, onClick }) {
  return (
    <button
      onClick={() => onClick(t)}
      style={{
        flex: 1, minWidth: 90, padding: '12px 8px',
        background: selected ? 'rgba(0,196,232,0.12)' : 'rgba(255,255,255,0.03)',
        border: `1px solid ${selected ? 'rgba(0,196,232,0.5)' : 'rgba(255,255,255,0.08)'}`,
        borderRadius: 4, cursor: 'pointer', textAlign: 'center', transition: 'all 0.15s',
      }}
    >
      <div style={{ fontSize: 20, marginBottom: 4 }}>{t.icon}</div>
      <div style={{ fontFamily: DISPLAY, fontSize: 11, color: selected ? 'var(--cyan)' : 'var(--paper)', letterSpacing: '-0.01em' }}>{t.label}</div>
      <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)', marginTop: 3, lineHeight: 1.4 }}>{t.description}</div>
    </button>
  );
}

function PlayerOption({ player, selected, onClick }) {
  return (
    <button
      onClick={() => onClick(player)}
      style={{
        display: 'flex', alignItems: 'center', gap: 8, width: '100%',
        padding: '8px 10px', textAlign: 'left', cursor: 'pointer',
        background: selected ? 'rgba(0,196,232,0.1)' : 'transparent',
        border: `1px solid ${selected ? 'rgba(0,196,232,0.4)' : 'rgba(255,255,255,0.06)'}`,
        borderRadius: 3, transition: 'all 0.12s',
      }}
    >
      <div style={{
        width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
        background: selected ? 'rgba(0,196,232,0.2)' : 'rgba(255,255,255,0.06)',
        border: `1px solid ${selected ? 'rgba(0,196,232,0.5)' : 'rgba(255,255,255,0.1)'}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: MONO, fontSize: 8, color: selected ? 'var(--cyan)' : 'var(--mute)', fontWeight: 700,
      }}>
        {player.position?.substring(0, 3)}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: DISPLAY, fontSize: 12, color: selected ? 'var(--cyan)' : 'var(--paper)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{player.name}</div>
        <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)', letterSpacing: '.12em' }}>{player.club}</div>
      </div>
      {selected && <span style={{ color: 'var(--cyan)', fontSize: 14, flexShrink: 0 }}>✓</span>}
    </button>
  );
}

function FixtureOption({ fixture, selected, onClick }) {
  const kickoff = fixture.kickoff_at ? new Date(fixture.kickoff_at) : null;
  const dateStr = kickoff
    ? kickoff.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    : '';

  return (
    <button
      onClick={() => onClick(fixture)}
      style={{
        width: '100%', padding: '10px 12px', textAlign: 'left', cursor: 'pointer',
        background: selected ? 'rgba(0,196,232,0.1)' : 'rgba(255,255,255,0.03)',
        border: `1px solid ${selected ? 'rgba(0,196,232,0.4)' : 'rgba(255,255,255,0.06)'}`,
        borderRadius: 3, transition: 'all 0.12s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
          <span style={{ fontFamily: DISPLAY, fontSize: 13, color: selected ? 'var(--cyan)' : 'var(--paper)' }}>{fixture.home_team}</span>
          <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)', flexShrink: 0 }}>vs</span>
          <span style={{ fontFamily: DISPLAY, fontSize: 13, color: selected ? 'var(--cyan)' : 'var(--paper)' }}>{fixture.away_team}</span>
        </div>
        {selected && <span style={{ color: 'var(--cyan)', fontSize: 14, flexShrink: 0 }}>✓</span>}
      </div>
      <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)', marginTop: 3, letterSpacing: '.12em' }}>{dateStr}</div>
    </button>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export default function BetCreatorPanel({ leagueId, tournamentId, onCreated, commLoading, setCommMsg }) {
  const [template,     setTemplate]     = useState(null);
  const [windowFrom,   setWindowFrom]   = useState('');   // optional match window start
  const [deadline,     setDeadline]     = useState('');   // submission cutoff + fixture end
  const [rewardValue,  setRewardValue]  = useState('5');
  const [rewardType,   setRewardType]   = useState('points');
  const [title,        setTitle]        = useState('');
  const [prompt,       setPrompt]       = useState('');
  const [selectedOpts, setSelectedOpts] = useState([]);

  const [players,    setPlayers]    = useState([]);
  const [fixtures,   setFixtures]   = useState([]);
  const [teams,      setTeams]      = useState([]);
  const [loading,    setLoading]    = useState(false);
  const [search,     setSearch]     = useState('');
  const [posFilter,  setPosFilter]  = useState('ALL');
  const [saving,     setSaving]     = useState(false);

  // Track if the user has manually edited title/prompt so we don't overwrite them
  const titleEdited  = useRef(false);
  const promptEdited = useRef(false);
  // 3.2: slug→id cache fetched once on mount; avoids hardcoded UUIDs per environment
  const templateIds  = useRef({});

  const resetForm = (picked) => {
    setTemplate(picked);
    setSelectedOpts([]);
    setSearch('');
    setPosFilter(picked?.defaultPos || 'ALL');
    titleEdited.current  = false;
    promptEdited.current = false;
    if (picked) {
      setTitle(picked.label);
      setPrompt(picked.promptHint);
    }
  };

  // When a fixture is selected for match_result, auto-update title if not manually edited
  const updateTitleFromFixture = useCallback((fixture) => {
    if (!titleEdited.current) {
      setTitle(`${fixture.home_team} vs ${fixture.away_team}`);
    }
    if (!promptEdited.current) {
      setPrompt(`Predict the result of ${fixture.home_team} vs ${fixture.away_team}.`);
    }
  }, []);

  // ── Fetch: players filtered by clubs playing in the window ────────────────
  const fetchPlayers = useCallback(async () => {
    setLoading(true);
    try {
      // If a date window is set and we have a tournament, find clubs with
      // scheduled fixtures in that range then limit players to those clubs
      let clubFilter = null;
      if (tournamentId && (windowFrom || deadline)) {
        let fq = supabase
          .from('fixtures')
          .select('home_team, away_team')
          .eq('tournament_id', tournamentId)
          .eq('status', 'scheduled');
        if (windowFrom) fq = fq.gte('kickoff_at', new Date(windowFrom).toISOString());
        if (deadline)   fq = fq.lte('kickoff_at', new Date(deadline).toISOString());
        const { data: fx } = await fq.limit(30);
        if (fx?.length) {
          clubFilter = [...new Set(fx.flatMap(f => [f.home_team, f.away_team]))];
        }
      }

      let pq = supabase
        .from('players')
        .select('id, name, position, club')
        .in('position', ['FWD', 'MID', 'DEF'])
        .order('price', { ascending: false })
        .limit(80);

      // Only filter by tournament when we have one
      if (tournamentId) pq = pq.eq('tournament_id', tournamentId);
      if (clubFilter?.length) pq = pq.in('club', clubFilter);

      const { data } = await pq;
      setPlayers(data || []);
    } catch (e) {
      console.error('BetCreatorPanel player fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, [tournamentId, windowFrom, deadline]);

  // ── Fetch: fixtures in the window (future only) ──────────────────────────
  const fetchFixtures = useCallback(async () => {
    if (!tournamentId) return;
    setLoading(true);
    try {
      let q = supabase
        .from('fixtures')
        .select('id, home_team, away_team, kickoff_at')
        .eq('tournament_id', tournamentId)
        .eq('status', 'scheduled')
        .gte('kickoff_at', new Date().toISOString())   // only genuinely future matches
        .order('kickoff_at', { ascending: true })
        .limit(20);
      if (windowFrom) q = q.gte('kickoff_at', new Date(windowFrom).toISOString());
      if (deadline)   q = q.lte('kickoff_at', new Date(deadline).toISOString());
      const { data } = await q;
      setFixtures(data || []);
    } catch (e) {
      console.error('BetCreatorPanel fixture fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, [tournamentId, windowFrom, deadline]);

  // ── Fetch: unique teams from upcoming fixtures (for clean_sheet bets) ─────
  const fetchTeams = useCallback(async () => {
    if (!tournamentId) return;
    setLoading(true);
    try {
      let q = supabase
        .from('fixtures')
        .select('home_team, away_team')
        .eq('tournament_id', tournamentId)
        .eq('status', 'scheduled')
        .gte('kickoff_at', new Date().toISOString())
        .order('kickoff_at', { ascending: true })
        .limit(20);
      if (deadline) q = q.lte('kickoff_at', new Date(deadline).toISOString());
      const { data } = await q;
      const sorted = [...new Set((data || []).flatMap(f => [f.home_team, f.away_team]))].sort();
      setTeams(sorted);
    } catch (e) {
      console.error('BetCreatorPanel team fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, [tournamentId, deadline]);

  useEffect(() => {
    if (!template) return;
    if (template.answerType === 'player')  fetchPlayers();
    if (template.answerType === 'fixture') fetchFixtures();
    if (template.answerType === 'team')    fetchTeams();
  }, [template, fetchPlayers, fetchFixtures, fetchTeams]);

  // 3.2: Fetch template slug→id once on mount for environment-portable IDs
  useEffect(() => {
    supabase.from('bet_templates').select('id, slug').then(({ data }) => {
      if (data) templateIds.current = Object.fromEntries(data.map(t => [t.slug, t.id]));
    });
  }, []);

  // ── Option toggles ────────────────────────────────────────────────────────
  const togglePlayer = (player) => {
    setSelectedOpts(prev => {
      const exists = prev.find(o => o.key === player.id);
      if (exists) return prev.filter(o => o.key !== player.id);
      return [...prev, { key: player.id, label: player.name, meta: { club: player.club, pos: player.position } }];
    });
  };

  const toggleTeam = (teamName) => {
    setSelectedOpts(prev => {
      const exists = prev.find(o => o.key === teamName);
      if (exists) return prev.filter(o => o.key !== teamName);
      return [...prev, { key: teamName, label: teamName, meta: {} }];
    });
  };

  const toggleFixture = (fixture) => {
    const homeKey = `${fixture.id}_home`;
    const drawKey = `${fixture.id}_draw`;
    const awayKey = `${fixture.id}_away`;
    const isSelected = selectedOpts.some(o => o.key === homeKey);
    if (isSelected) {
      // deselect — also clear title if it was auto-set from this fixture
      setSelectedOpts(prev => prev.filter(o => o.key !== homeKey && o.key !== drawKey && o.key !== awayKey));
    } else {
      // select — auto-fill title from this fixture
      updateTitleFromFixture(fixture);
      setSelectedOpts(prev => [
        ...prev,
        { key: homeKey, label: `${fixture.home_team} Win`, meta: {} },
        { key: drawKey, label: 'Draw', meta: {} },
        { key: awayKey, label: `${fixture.away_team} Win`, meta: {} },
      ]);
    }
  };

  // ── Create ────────────────────────────────────────────────────────────────
  const handleCreate = async () => {
    try {
      setSaving(true);
      setCommMsg(null);
      if (!template)               throw new Error('Choose a bet type.');
      if (!title.trim())           throw new Error('Enter a title.');
      if (!prompt.trim())          throw new Error('Enter a question/prompt.');
      if (!deadline)               throw new Error('Set a submission deadline.');
      if (selectedOpts.length < 2) throw new Error('Select at least 2 options.');

      // 3.3: derive scope_ref for match_result bets from the first option key ({fixtureId}_home)
      let scopeRef = null;
      if (template.slug === 'match_result' && selectedOpts.length) {
        const firstKey = selectedOpts[0].key ?? '';
        const fixtureId = firstKey.replace(/_home$|_draw$|_away$/, '');
        if (fixtureId) scopeRef = fixtureId;
      }

      // Duplicate-instance guard: prevent commissioner creating the same active bet twice.
      // Checks for any non-resolved, non-cancelled instance with the same template.
      // For match_result bets we also match on scope_ref (fixture) to allow separate
      // bets for different fixtures using the same template.
      const tplId = templateIds.current[template.slug];
      if (tplId) {
        let dupQ = supabase
          .from('bet_instances')
          .select('id, title')
          .eq('league_id', leagueId)
          .eq('template_id', tplId)
          .in('status', ['upcoming', 'open', 'closed'])
          .limit(1);
        if (scopeRef) dupQ = dupQ.eq('scope_ref', scopeRef);
        const { data: dup } = await dupQ.maybeSingle();
        if (dup) {
          throw new Error(
            `An active "${template.label}" bet already exists ("${dup.title}"). ` +
            `Resolve or cancel it before creating a new one.`
          );
        }
      }

      const { error } = await supabase.from('bet_instances').insert({
        league_id:    leagueId,
        template_id:  templateIds.current[template.slug] ?? null,
        title:        title.trim(),
        prompt:       prompt.trim(),
        options:      selectedOpts,
        deadline_at:  new Date(deadline).toISOString(),
        reward_value: Number(rewardValue) || 5,
        reward_type:  rewardType,
        scope_type:   template.scopeType,
        scope_ref:    scopeRef,
      });
      if (error) throw new Error(error.message);

      setCommMsg({ type: 'ok', text: `✓ "${title.trim()}" created with ${selectedOpts.length} options.` });
      resetForm(null);
      setDeadline('');
      setWindowFrom('');
      setRewardValue('5');
      setRewardType('points');
      setPlayers([]);
      setFixtures([]);
      onCreated?.();
    } catch (e) {
      setCommMsg({ type: 'err', text: e.message });
    } finally {
      setSaving(false);
    }
  };

  // ── Filtered player list ──────────────────────────────────────────────────
  const filteredPlayers = players.filter(p => {
    const q = search.toLowerCase();
    const matchesSearch = !q || p.name.toLowerCase().includes(q) || (p.club || '').toLowerCase().includes(q);
    const matchesPos    = posFilter === 'ALL' || p.position === posFilter;
    return matchesSearch && matchesPos;
  });

  const isPlayerSelected  = (id)      => selectedOpts.some(o => o.key === id);
  const isFixtureSelected = (fid)     => selectedOpts.some(o => o.key === `${fid}_home`);
  const isTeamSelected    = (name)    => selectedOpts.some(o => o.key === name);

  const isPlayerBet  = template?.answerType === 'player';
  const isFixtureBet = template?.answerType === 'fixture';
  const isTeamBet    = template?.answerType === 'team';

  const windowHint = (windowFrom && deadline)
    ? `Showing players from clubs with matches ${new Date(windowFrom).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – ${new Date(deadline).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
    : deadline
      ? `Showing players from clubs with matches before ${new Date(deadline).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
      : 'All players shown · set a date window to filter by upcoming matches';

  const canCreate = !saving && !commLoading && !!template && !!deadline && selectedOpts.length >= 2 && !!title.trim();

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

      {/* Step 1 — Bet type */}
      <div>
        <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)', letterSpacing: '.2em', marginBottom: 8 }}>1 · BET TYPE</div>
        <div style={{ display: 'flex', gap: 8 }}>
          {TEMPLATES.map(t => (
            <TemplateCard key={t.slug} t={t} selected={template?.slug === t.slug} onClick={resetForm} />
          ))}
        </div>
      </div>

      {template && (
        <>
          {/* Step 2 — Date window + Reward */}
          <div>
            <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)', letterSpacing: '.2em', marginBottom: 8 }}>
              2 · {isPlayerBet ? 'MATCH WINDOW & DEADLINE' : 'DEADLINE & REWARD'}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: isPlayerBet ? '1fr 1fr 1fr' : '1fr 1fr', gap: 8 }}>


              {/* From date — only relevant for player bets to filter clubs */}
              {isPlayerBet && (
                <div>
                  <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)', letterSpacing: '.15em', marginBottom: 5 }}>FROM (optional)</div>
                  <input
                    type="datetime-local"
                    value={windowFrom}
                    onChange={e => setWindowFrom(e.target.value)}
                    style={{
                      width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
                      color: 'var(--paper)', fontSize: 11, padding: '7px 8px', borderRadius: 3, outline: 'none', colorScheme: 'dark',
                    }}
                  />
                </div>
              )}

              {/* Deadline */}
              <div>
                <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)', letterSpacing: '.15em', marginBottom: 5 }}>
                  {isPlayerBet ? 'PICKS CLOSE' : 'DEADLINE'}
                </div>
                <input
                  type="datetime-local"
                  value={deadline}
                  onChange={e => setDeadline(e.target.value)}
                  style={{
                    width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
                    color: deadline ? 'var(--paper)' : 'var(--danger)',
                    fontSize: 11, padding: '7px 8px', borderRadius: 3, outline: 'none', colorScheme: 'dark',
                  }}
                />
              </div>

              {/* Reward */}
              <div>
                <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)', letterSpacing: '.15em', marginBottom: 5 }}>REWARD</div>
                <div style={{ display: 'flex', gap: 5 }}>
                  <input
                    type="number"
                    value={rewardValue}
                    onChange={e => setRewardValue(e.target.value)}
                    min="1"
                    style={{
                      flex: 1, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
                      color: 'var(--paper)', fontSize: 11, padding: '7px 6px', borderRadius: 3, outline: 'none',
                    }}
                  />
                  <select
                    value={rewardType}
                    onChange={e => setRewardType(e.target.value)}
                    style={{
                      background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
                      color: 'var(--paper)', fontSize: 11, padding: '7px 4px', borderRadius: 3, outline: 'none',
                    }}
                  >
                    <option value="points">pts</option>
                    <option value="budget">€M</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Window hint for player bets */}
            {isPlayerBet && (
              <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)', marginTop: 6, letterSpacing: '.1em' }}>
                {windowHint}
              </div>
            )}
            {(isFixtureBet || isTeamBet) && !deadline && (
              <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)', marginTop: 6, letterSpacing: '.1em' }}>
                Set a deadline to see {isTeamBet ? 'eligible teams' : 'scheduled matches'} before that date.
              </div>
            )}
          </div>

          {/* Step 3 — Options */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)', letterSpacing: '.2em' }}>
                3 · {isPlayerBet ? 'SELECT PLAYERS' : isTeamBet ? 'SELECT TEAMS' : 'SELECT MATCH'}
                {selectedOpts.length > 0 && (
                  <span style={{ color: 'var(--cyan)', marginLeft: 8 }}>
                    {isPlayerBet
                      ? `${selectedOpts.length} selected`
                      : isTeamBet
                        ? `${selectedOpts.length} team${selectedOpts.length !== 1 ? 's' : ''} selected`
                        : `${Math.floor(selectedOpts.length / 3)} match · ${selectedOpts.length} options`}
                  </span>
                )}
              </div>
              {selectedOpts.length > 0 && (
                <button
                  onClick={() => setSelectedOpts([])}
                  style={{
                    fontFamily: MONO, fontSize: 9, color: 'var(--danger)', letterSpacing: '.15em',
                    background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0',
                  }}
                >
                  CLEAR
                </button>
              )}
            </div>

            {loading ? (
              <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--mute)', padding: '20px 0', textAlign: 'center', letterSpacing: '.2em' }}>LOADING…</div>
            ) : isTeamBet ? (
              /* ── Team picker for Clean Sheet ─────────────────────────── */
              <>
                {!deadline ? (
                  <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--mute)', padding: '20px 0', textAlign: 'center', letterSpacing: '.18em' }}>
                    SET A DEADLINE ABOVE TO SEE ELIGIBLE TEAMS
                  </div>
                ) : teams.length === 0 ? (
                  <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--mute)', padding: '20px 0', textAlign: 'center', letterSpacing: '.18em' }}>
                    NO SCHEDULED MATCHES BEFORE THIS DEADLINE
                  </div>
                ) : null}

                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 260, overflowY: 'auto' }}>
                  {teams.map(name => {
                    const sel = isTeamSelected(name);
                    return (
                      <button
                        key={name}
                        onClick={() => toggleTeam(name)}
                        style={{
                          width: '100%', padding: '10px 12px', textAlign: 'left', cursor: 'pointer',
                          background: sel ? 'rgba(0,196,232,0.1)' : 'rgba(255,255,255,0.03)',
                          border: `1px solid ${sel ? 'rgba(0,196,232,0.4)' : 'rgba(255,255,255,0.06)'}`,
                          borderRadius: 3, transition: 'all 0.12s',
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        }}
                      >
                        <span style={{ fontFamily: DISPLAY, fontSize: 13, color: sel ? 'var(--cyan)' : 'var(--paper)' }}>{name}</span>
                        {sel && <span style={{ color: 'var(--cyan)', fontSize: 14 }}>✓</span>}
                      </button>
                    );
                  })}
                </div>

                {selectedOpts.length > 0 && (
                  <div style={{ marginTop: 8, padding: '8px 10px', background: 'rgba(0,196,232,0.06)', border: '1px solid rgba(0,196,232,0.2)', borderRadius: 3 }}>
                    <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--cyan)', letterSpacing: '.18em', marginBottom: 4 }}>OPTIONS CREATED:</div>
                    {selectedOpts.map(o => (
                      <div key={o.key} style={{ fontFamily: "'Archivo', sans-serif", fontSize: 11, color: 'var(--paper)', padding: '2px 0' }}>· {o.label}</div>
                    ))}
                  </div>
                )}
              </>
            ) : isPlayerBet ? (
              <>
                {/* Position filter + search */}
                <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                  <input
                    type="text"
                    placeholder="Search player or club…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    style={{
                      flex: 1, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                      color: 'var(--paper)', fontSize: 11, padding: '7px 10px', borderRadius: 3, outline: 'none',
                    }}
                  />
                  {['ALL', 'FWD', 'MID', 'DEF'].map(pos => (
                    <button
                      key={pos}
                      onClick={() => setPosFilter(pos)}
                      style={{
                        padding: '6px 8px', borderRadius: 3, cursor: 'pointer', fontSize: 9, fontWeight: 700,
                        fontFamily: MONO, letterSpacing: '.1em',
                        background: posFilter === pos ? 'rgba(0,196,232,0.15)' : 'rgba(255,255,255,0.04)',
                        border: `1px solid ${posFilter === pos ? 'rgba(0,196,232,0.4)' : 'rgba(255,255,255,0.08)'}`,
                        color: posFilter === pos ? 'var(--cyan)' : 'var(--mute)',
                      }}
                    >{pos}</button>
                  ))}
                </div>

                {players.length === 0 ? (
                  <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--mute)', padding: '20px 0', textAlign: 'center', letterSpacing: '.18em' }}>
                    NO PLAYERS FOUND FOR THIS WINDOW
                  </div>
                ) : filteredPlayers.length === 0 ? (
                  <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--mute)', padding: '12px 0', textAlign: 'center', letterSpacing: '.18em' }}>
                    NO RESULTS — TRY A DIFFERENT FILTER
                  </div>
                ) : null}

                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 260, overflowY: 'auto' }}>
                  {filteredPlayers.map(p => (
                    <PlayerOption key={p.id} player={p} selected={isPlayerSelected(p.id)} onClick={togglePlayer} />
                  ))}
                </div>
              </>
            ) : (
              /* Fixture picker */
              <>
                {!deadline ? (
                  <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--mute)', padding: '20px 0', textAlign: 'center', letterSpacing: '.18em' }}>
                    SET A DEADLINE ABOVE TO SEE UPCOMING MATCHES
                  </div>
                ) : fixtures.length === 0 ? (
                  <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--mute)', padding: '20px 0', textAlign: 'center', letterSpacing: '.18em' }}>
                    NO SCHEDULED MATCHES BEFORE THIS DEADLINE
                  </div>
                ) : null}

                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 260, overflowY: 'auto' }}>
                  {fixtures.map(f => (
                    <FixtureOption key={f.id} fixture={f} selected={isFixtureSelected(f.id)} onClick={toggleFixture} />
                  ))}
                </div>

                {selectedOpts.length > 0 && (
                  <div style={{ marginTop: 8, padding: '8px 10px', background: 'rgba(0,196,232,0.06)', border: '1px solid rgba(0,196,232,0.2)', borderRadius: 3 }}>
                    <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--cyan)', letterSpacing: '.18em', marginBottom: 4 }}>OPTIONS CREATED:</div>
                    {selectedOpts.map(o => (
                      <div key={o.key} style={{ fontFamily: "'Archivo', sans-serif", fontSize: 11, color: 'var(--paper)', padding: '2px 0' }}>· {o.label}</div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Step 4 — Title + Prompt */}
          <div>
            <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)', letterSpacing: '.2em', marginBottom: 8 }}>4 · TITLE &amp; QUESTION</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <input
                type="text"
                value={title}
                onChange={e => { setTitle(e.target.value); titleEdited.current = true; }}
                placeholder="Bet title (auto-filled from template / match)"
                style={{
                  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
                  color: title ? 'var(--paper)' : 'var(--danger)',
                  fontSize: 11, padding: '8px 10px', borderRadius: 3, outline: 'none',
                }}
              />
              <textarea
                value={prompt}
                onChange={e => { setPrompt(e.target.value); promptEdited.current = true; }}
                placeholder="Question shown to players (auto-filled)"
                rows={2}
                style={{
                  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
                  color: 'var(--paper)', fontSize: 11, padding: '8px 10px', borderRadius: 3, outline: 'none',
                  resize: 'none', fontFamily: "'Archivo', sans-serif",
                }}
              />
            </div>
          </div>

          {/* Create button + inline validation hint */}
          <div>
            {!canCreate && (
              <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)', letterSpacing: '.15em', marginBottom: 8 }}>
                {!deadline          ? '· Set a deadline'           : ''}
                {selectedOpts.length < 2 ? ' · Select at least 2 options' : ''}
                {!title.trim()      ? ' · Add a title'             : ''}
              </div>
            )}
            <button
              onClick={handleCreate}
              disabled={!canCreate}
              style={{
                padding: '13px', borderRadius: 3, cursor: canCreate ? 'pointer' : 'default', width: '100%',
                background: 'var(--cyan)', color: '#000',
                fontFamily: DISPLAY, fontSize: 12, fontWeight: 900, letterSpacing: '.08em',
                border: 'none', transition: 'opacity 0.15s', opacity: canCreate ? 1 : 0.35,
              }}
            >
              {saving ? 'CREATING…' : `CREATE BET · ${selectedOpts.length || 0} OPTIONS`}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
