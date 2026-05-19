import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { MONO, DISPLAY } from './HubShared';

const TEMPLATES = [
  {
    slug:        'top_scorer',
    label:       'Top Scorer',
    icon:        '🎯',
    description: 'Who scores the most goals?',
    answerType:  'player',
    scopeType:   'matchday',
    promptHint:  'Who will score the most goals this matchday?',
  },
  {
    slug:        'match_result',
    label:       'Match Result',
    icon:        '⚽',
    description: 'Predict the match outcome.',
    answerType:  'fixture',
    scopeType:   'match',
    promptHint:  'Predict the result of this match.',
  },
  {
    slug:        'player_block',
    label:       'Player Block',
    icon:        '🛡️',
    description: 'Pick a player to block — if they flop, you earn points.',
    answerType:  'player',
    scopeType:   'matchday',
    promptHint:  'Pick a player to block this matchday.',
  },
];

function TemplateCard({ t, selected, onClick }) {
  return (
    <button
      onClick={() => onClick(t)}
      style={{
        flex: 1, minWidth: 100, padding: '12px 10px',
        background: selected ? 'rgba(0,196,232,0.12)' : 'rgba(255,255,255,0.03)',
        border: `1px solid ${selected ? 'rgba(0,196,232,0.5)' : 'rgba(255,255,255,0.08)'}`,
        borderRadius: 4, cursor: 'pointer', textAlign: 'center',
        transition: 'all 0.15s',
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
        fontFamily: MONO, fontSize: 8, color: selected ? 'var(--cyan)' : 'var(--mute)',
        fontWeight: 700,
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
          <span style={{ fontFamily: DISPLAY, fontSize: 12, color: selected ? 'var(--cyan)' : 'var(--paper)' }}>{fixture.home_team}</span>
          <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)' }}>vs</span>
          <span style={{ fontFamily: DISPLAY, fontSize: 12, color: selected ? 'var(--cyan)' : 'var(--paper)' }}>{fixture.away_team}</span>
        </div>
        {selected && <span style={{ color: 'var(--cyan)', fontSize: 14, flexShrink: 0 }}>✓</span>}
      </div>
      <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)', marginTop: 3, letterSpacing: '.12em' }}>{dateStr}</div>
    </button>
  );
}

export default function BetCreatorPanel({ leagueId, tournamentId, onCreated, commLoading, setCommMsg }) {
  const [template,      setTemplate]      = useState(null);
  const [deadline,      setDeadline]      = useState('');
  const [rewardValue,   setRewardValue]   = useState('5');
  const [rewardType,    setRewardType]    = useState('points');
  const [title,         setTitle]         = useState('');
  const [prompt,        setPrompt]        = useState('');
  const [selectedOpts,  setSelectedOpts]  = useState([]);

  // Data for option pickers
  const [players,   setPlayers]   = useState([]);
  const [fixtures,  setFixtures]  = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [search,    setSearch]    = useState('');
  const [posFilter, setPosFilter] = useState('ALL');

  // Submitting state
  const [saving, setSaving] = useState(false);

  // Fetch players or fixtures when template + deadline changes
  const fetchOptions = useCallback(async () => {
    if (!template || !tournamentId) return;
    setLoading(true);
    try {
      if (template.answerType === 'player') {
        const { data } = await supabase
          .from('players')
          .select('id, name, position, club')
          .eq('tournament_id', tournamentId)
          .in('position', ['FWD', 'MID', 'DEF'])
          .order('price', { ascending: false })
          .limit(60);
        setPlayers(data || []);
      } else if (template.answerType === 'fixture') {
        let q = supabase
          .from('fixtures')
          .select('id, home_team, away_team, kickoff_at')
          .eq('tournament_id', tournamentId)
          .eq('status', 'scheduled')
          .order('kickoff_at', { ascending: true })
          .limit(20);
        // Only show fixtures before the deadline if one is set
        if (deadline) q = q.lte('kickoff_at', new Date(deadline).toISOString());
        const { data } = await q;
        setFixtures(data || []);
      }
    } catch (e) {
      console.error('BetCreatorPanel fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, [template, tournamentId, deadline]);

  useEffect(() => { fetchOptions(); }, [fetchOptions]);

  const togglePlayer = (player) => {
    setSelectedOpts(prev => {
      const exists = prev.find(o => o.key === player.id);
      if (exists) return prev.filter(o => o.key !== player.id);
      return [...prev, { key: player.id, label: player.name, meta: { club: player.club, pos: player.position } }];
    });
  };

  // Selecting a fixture adds all 3 outcome options for that fixture
  const toggleFixture = (fixture) => {
    const homeKey = `${fixture.id}_home`;
    const drawKey = `${fixture.id}_draw`;
    const awayKey = `${fixture.id}_away`;
    const isSelected = selectedOpts.some(o => o.key === homeKey);
    if (isSelected) {
      setSelectedOpts(prev => prev.filter(o => o.key !== homeKey && o.key !== drawKey && o.key !== awayKey));
    } else {
      setSelectedOpts(prev => [
        ...prev,
        { key: homeKey, label: `${fixture.home_team} Win`, meta: {} },
        { key: drawKey, label: 'Draw', meta: {} },
        { key: awayKey, label: `${fixture.away_team} Win`, meta: {} },
      ]);
    }
  };

  const handleCreate = async () => {
    try {
      setSaving(true);
      setCommMsg(null);
      if (!template)              throw new Error('Choose a bet type.');
      if (!title.trim())          throw new Error('Enter a title.');
      if (!prompt.trim())         throw new Error('Enter a question/prompt.');
      if (!deadline)              throw new Error('Set a submission deadline.');
      if (selectedOpts.length < 2) throw new Error('Select at least 2 options.');

      const { error } = await supabase.from('bet_instances').insert({
        league_id:    leagueId,
        template_id:  {
          top_scorer:   '912e7b5f-1c15-4747-bc0b-2da9678627ea',
          match_result: '63a7de4f-5153-4e12-b6c5-4d5f3fc199fc',
          player_block: 'b1828846-4ed6-47d6-9430-944768d87ae8',
        }[template.slug] || null,
        title:        title.trim(),
        prompt:       prompt.trim(),
        options:      selectedOpts,
        deadline_at:  new Date(deadline).toISOString(),
        reward_value: Number(rewardValue) || 5,
        reward_type:  rewardType,
        scope_type:   template.scopeType,
        scope_ref:    null,
      });
      if (error) throw new Error(error.message);

      setCommMsg({ type: 'ok', text: `✓ "${title}" created with ${selectedOpts.length} options.` });
      // Reset
      setTemplate(null);
      setDeadline('');
      setRewardValue('5');
      setRewardType('points');
      setTitle('');
      setPrompt('');
      setSelectedOpts([]);
      onCreated?.();
    } catch (e) {
      setCommMsg({ type: 'err', text: e.message });
    } finally {
      setSaving(false);
    }
  };

  const filteredPlayers = players.filter(p => {
    const matchesSearch = !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.club.toLowerCase().includes(search.toLowerCase());
    const matchesPos    = posFilter === 'ALL' || p.position === posFilter;
    return matchesSearch && matchesPos;
  });

  const isPlayerSelected = (id) => selectedOpts.some(o => o.key === id);
  const isFixtureSelected = (fid) => selectedOpts.some(o => o.key === `${fid}_home`);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Step 1: Template */}
      <div>
        <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)', letterSpacing: '.2em', marginBottom: 8 }}>1 · BET TYPE</div>
        <div style={{ display: 'flex', gap: 8 }}>
          {TEMPLATES.map(t => (
            <TemplateCard
            key={t.slug} t={t} selected={template?.slug === t.slug}
            onClick={(picked) => {
              setTemplate(picked);
              setTitle(picked.label);
              setPrompt(picked.promptHint);
              setSelectedOpts([]);
              setSearch('');
              setPosFilter('ALL');
            }}
          />
          ))}
        </div>
      </div>

      {template && (
        <>
          {/* Step 2: Deadline (affects which fixtures appear) */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)', letterSpacing: '.2em', marginBottom: 6 }}>2 · SUBMISSION DEADLINE</div>
              <input
                type="datetime-local"
                value={deadline}
                onChange={e => setDeadline(e.target.value)}
                style={{
                  width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
                  color: 'var(--paper)', fontSize: 11, padding: '8px 10px', borderRadius: 3, outline: 'none',
                  colorScheme: 'dark',
                }}
              />
              <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)', marginTop: 4, letterSpacing: '.1em' }}>
                {template.answerType === 'fixture' ? 'Only matches before this date are shown.' : 'When picks lock.'}
              </div>
            </div>
            <div>
              <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)', letterSpacing: '.2em', marginBottom: 6 }}>REWARD</div>
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  type="number"
                  value={rewardValue}
                  onChange={e => setRewardValue(e.target.value)}
                  min="1"
                  style={{
                    flex: 1, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
                    color: 'var(--paper)', fontSize: 11, padding: '8px 8px', borderRadius: 3, outline: 'none',
                  }}
                />
                <select
                  value={rewardType}
                  onChange={e => setRewardType(e.target.value)}
                  style={{
                    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
                    color: 'var(--paper)', fontSize: 11, padding: '8px 6px', borderRadius: 3, outline: 'none',
                  }}
                >
                  <option value="points">pts</option>
                  <option value="budget">£M</option>
                </select>
              </div>
            </div>
          </div>

          {/* Step 3: Pick options */}
          <div>
            <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)', letterSpacing: '.2em', marginBottom: 8 }}>
              3 · {template.answerType === 'player' ? 'SELECT PLAYERS' : 'SELECT MATCH'}
              {selectedOpts.length > 0 && (
                <span style={{ color: 'var(--cyan)', marginLeft: 8 }}>
                  {template.answerType === 'player' ? `${selectedOpts.length} selected` : `${selectedOpts.length / 3 | 0} match(es) · ${selectedOpts.length} options`}
                </span>
              )}
            </div>

            {loading ? (
              <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--mute)', padding: '20px 0', textAlign: 'center', letterSpacing: '.2em' }}>LOADING…</div>
            ) : template.answerType === 'player' ? (
              <>
                {/* Player search + filter */}
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
                {players.length === 0 && !loading && (
                  <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--mute)', padding: '16px 0', textAlign: 'center', letterSpacing: '.18em' }}>
                    {deadline ? 'NO PLAYERS FOUND FOR THIS TOURNAMENT' : 'SET A DEADLINE FIRST TO LOAD PLAYERS'}
                  </div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 240, overflowY: 'auto' }}>
                  {filteredPlayers.map(p => (
                    <PlayerOption key={p.id} player={p} selected={isPlayerSelected(p.id)} onClick={togglePlayer} />
                  ))}
                </div>
              </>
            ) : (
              <>
                {fixtures.length === 0 && !loading && (
                  <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--mute)', padding: '16px 0', textAlign: 'center', letterSpacing: '.18em' }}>
                    {deadline ? 'NO SCHEDULED MATCHES BEFORE DEADLINE' : 'SET A DEADLINE FIRST TO SEE MATCHES'}
                  </div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 240, overflowY: 'auto' }}>
                  {fixtures.map(f => (
                    <FixtureOption key={f.id} fixture={f} selected={isFixtureSelected(f.id)} onClick={toggleFixture} />
                  ))}
                </div>
                {selectedOpts.length > 0 && (
                  <div style={{ marginTop: 8, padding: '8px 10px', background: 'rgba(0,196,232,0.06)', border: '1px solid rgba(0,196,232,0.2)', borderRadius: 3 }}>
                    <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--cyan)', letterSpacing: '.18em', marginBottom: 4 }}>OPTIONS THAT WILL BE CREATED:</div>
                    {selectedOpts.map(o => (
                      <div key={o.key} style={{ fontFamily: "'Archivo', sans-serif", fontSize: 11, color: 'var(--paper)', padding: '2px 0' }}>· {o.label}</div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Step 4: Title + Prompt */}
          <div>
            <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)', letterSpacing: '.2em', marginBottom: 8 }}>4 · TITLE &amp; QUESTION</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Bet title (auto-filled)"
                style={{
                  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
                  color: 'var(--paper)', fontSize: 11, padding: '8px 10px', borderRadius: 3, outline: 'none',
                }}
              />
              <textarea
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
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

          {/* Validation summary */}
          {selectedOpts.length > 0 && selectedOpts.length < 2 && (
            <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--danger)', letterSpacing: '.15em' }}>Select at least 2 options.</div>
          )}

          {/* Create button */}
          <button
            onClick={handleCreate}
            disabled={saving || commLoading || !template || !deadline || selectedOpts.length < 2 || !title.trim()}
            style={{
              padding: '13px', borderRadius: 3, cursor: 'pointer', width: '100%',
              background: 'var(--cyan)', color: '#000',
              fontFamily: DISPLAY, fontSize: 12, fontWeight: 900, letterSpacing: '.08em',
              border: 'none', transition: 'opacity 0.15s',
              opacity: (saving || commLoading || !template || !deadline || selectedOpts.length < 2 || !title.trim()) ? 0.4 : 1,
            }}
          >
            {saving ? 'CREATING…' : `CREATE BET · ${selectedOpts.length} OPTIONS`}
          </button>
        </>
      )}
    </div>
  );
}
