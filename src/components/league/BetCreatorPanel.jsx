import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from '../../lib/supabase';
// Inline font constants — avoids importing HubShared here. LeagueScreen imports HubShared
// directly, and CommissionerPanel→BetCreatorPanel also importing it creates a competing
// module-evaluation path that causes a TDZ crash in Vite/Rolldown's production bundle.
const MONO    = "'JetBrains Mono', monospace";
const DISPLAY = "'Archivo Black', sans-serif";

// ── Category + template catalogue ────────────────────────────────────────────

const CATEGORIES = [
  { key: 'match',   label: 'MATCH',   color: 'var(--paper)', icon: '⚽' },
  { key: 'stats',   label: 'STATS',   color: 'var(--gold)',  icon: '📊' },
  { key: 'players', label: 'PLAYERS', color: 'var(--cyan)',  icon: '🎯' },
  { key: 'custom',  label: 'CUSTOM',  color: 'var(--mute)',  icon: '✏' },
];

// configPanel values:
//   fixture_3way   → [Home Win, Draw, Away Win] — requires fixture selection
//   fixture_2way   → [Home, Away] (+ None when withNone) — requires fixture selection
//   winning_margin → [Home by 1, Home by 2, Home 3+, Draw, Away by 1, Away by 2, Away 3+]
//   binary_yn      → [Yes, No] — optional fixture for context/scope_ref
//   over_under     → [Over N, Under N] — requires ouLine; optional fixture
//   goal_interval  → [0-15, 16-30, …] — optional fixture
//   player_pick    → commissioner selects from player list
//   free_text      → commissioner types up to 6 custom options

const TEMPLATES = [
  // MATCH (12)
  { slug: 'match_result',       label: 'Match Result',               icon: '◈', category: 'match',   configPanel: 'fixture_3way',   promptHint: 'Predict the result of this match.', needsFixture: true,  scopeType: 'match'    },
  { slug: 'first_team_score',   label: 'First Team to Score',        icon: '⚡', category: 'match',   configPanel: 'fixture_2way',   promptHint: 'Which team scores first?', needsFixture: true, scopeType: 'match'                     },
  { slug: 'clean_sheet',        label: 'Clean Sheet',                icon: '🧤', category: 'match',   configPanel: 'fixture_2way',   promptHint: 'Pick a team to keep a clean sheet.', needsFixture: true, withNone: true, scopeType: 'match' },
  { slug: 'lead_at_halftime',   label: 'Lead at Half-time',          icon: '⏱', category: 'match',   configPanel: 'fixture_3way',   promptHint: 'Who leads at half-time?', needsFixture: true, scopeType: 'match'                        },
  { slug: 'second_half_winner', label: 'Second Half Winner',         icon: '▶', category: 'match',   configPanel: 'fixture_3way',   promptHint: 'Who wins the second half?', needsFixture: true, scopeType: 'match'                       },
  { slug: 'winning_margin',     label: 'Winning Margin',             icon: '📏', category: 'match',   configPanel: 'winning_margin', promptHint: 'What will the winning margin be?', needsFixture: true, scopeType: 'match'                 },
  { slug: 'most_corners_team',  label: 'Most Corners — Team',        icon: '⌒', category: 'match',   configPanel: 'fixture_2way',   promptHint: 'Which team wins the corner count?', needsFixture: true, scopeType: 'match'                },
  { slug: 'penalty_in_match',   label: 'Penalty in the Match',       icon: '✋', category: 'match',   configPanel: 'binary_yn',      promptHint: 'Will there be a penalty in this match?', scopeType: 'match'                             },
  { slug: 'red_card_in_match',  label: 'Red Card in the Match',      icon: '🟥', category: 'match',   configPanel: 'binary_yn',      promptHint: 'Will there be a red card in this match?', scopeType: 'match'                           },
  { slug: 'btts',               label: 'Both Teams to Score',        icon: '◉', category: 'match',   configPanel: 'binary_yn',      promptHint: 'Will both teams score?', scopeType: 'match'                                             },
  { slug: 'btts_first_half',    label: 'BTTS — 1st Half',            icon: '◉', category: 'match',   configPanel: 'binary_yn',      promptHint: 'Will both teams score in the first half?', scopeType: 'match'                          },
  { slug: 'comeback_win',       label: 'Comeback Win',               icon: '↩', category: 'match',   configPanel: 'binary_yn',      promptHint: 'Will a team win after going behind?', scopeType: 'match'                               },
  // STATS (8)
  { slug: 'goals_ou',           label: 'Goals O/U',                  icon: '≷', category: 'stats',   configPanel: 'over_under',     promptHint: 'Over or under {line} goals?', scopeType: 'match'                                        },
  { slug: 'first_half_goals_ou',label: '1st Half Goals O/U',         icon: '≷', category: 'stats',   configPanel: 'over_under',     promptHint: 'Over or under {line} goals in the first half?', scopeType: 'match'                       },
  { slug: 'shots_on_target_ou', label: 'Shots on Target O/U',        icon: '≷', category: 'stats',   configPanel: 'over_under',     promptHint: 'Over or under {line} shots on target?', scopeType: 'match'                              },
  { slug: 'total_corners_ou',   label: 'Total Corners O/U',          icon: '≷', category: 'stats',   configPanel: 'over_under',     promptHint: 'Over or under {line} total corners?', scopeType: 'match'                                },
  { slug: 'card_count_ou',      label: 'Card Count O/U',             icon: '≷', category: 'stats',   configPanel: 'over_under',     promptHint: 'Over or under {line} total cards?', scopeType: 'match'                                  },
  { slug: 'total_offsides_ou',  label: 'Total Offsides O/U',         icon: '≷', category: 'stats',   configPanel: 'over_under',     promptHint: 'Over or under {line} offsides?', scopeType: 'match'                                     },
  { slug: 'total_subs_ou',      label: 'Total Substitutions O/U',    icon: '≷', category: 'stats',   configPanel: 'over_under',     promptHint: 'Over or under {line} substitutions?', scopeType: 'match'                                },
  { slug: 'goal_interval',      label: 'Goal Interval',              icon: '⏰', category: 'stats',   configPanel: 'goal_interval',  promptHint: 'In which 15-minute window will the first goal be scored?', scopeType: 'match'            },
  // PLAYERS (4)
  { slug: 'top_scorer',         label: 'Top Scorer',                 icon: '🎯', category: 'players', configPanel: 'player_pick',    promptHint: 'Who will score the most goals this matchday?', defaultPos: 'FWD', scopeType: 'matchday' },
  { slug: 'anytime_goalscorer', label: 'Anytime Goalscorer',         icon: '⚽', category: 'players', configPanel: 'player_pick',    promptHint: 'Pick a player to score in this match.', defaultPos: 'FWD', scopeType: 'match'           },
  { slug: 'yellow_card',        label: 'Player — Yellow Card',       icon: '🟨', category: 'players', configPanel: 'player_pick',    promptHint: 'Pick a player to receive a yellow card.', defaultPos: 'ALL', allPositions: true, scopeType: 'match' },
  { slug: 'man_of_match',       label: 'Man of the Match',           icon: '★', category: 'players', configPanel: 'player_pick',    promptHint: 'Who will be the standout player?', defaultPos: 'ALL', allPositions: true, scopeType: 'match'  },
  // CUSTOM (1)
  { slug: 'free_bet',           label: 'Free Bet',                   icon: '✏', category: 'custom',  configPanel: 'free_text',      promptHint: 'Custom question — write your own options.', scopeType: 'tournament'                      },
];

const TMAP = Object.fromEntries(TEMPLATES.map(t => [t.slug, t]));

// ── Sub-components ────────────────────────────────────────────────────────────

function TypeSelector({ onSelect, catExpanded, onToggleCat }) {
  return (
    <div>
      <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)', letterSpacing: '.2em', marginBottom: 8 }}>
        1 · SELECT BET TYPE
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {CATEGORIES.map(cat => {
          const catTemplates = TEMPLATES.filter(t => t.category === cat.key);
          const isOpen = catExpanded.has(cat.key);
          return (
            <div key={cat.key}>
              {/* Category header */}
              <button
                onClick={() => onToggleCat(cat.key)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '8px 10px', background: 'rgba(255,255,255,0.03)',
                  border: `1px solid ${isOpen ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.06)'}`,
                  borderBottom: isOpen ? 'none' : undefined,
                  cursor: 'pointer', transition: 'all 0.12s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span style={{ fontSize: 11 }}>{cat.icon}</span>
                  <span style={{ fontFamily: MONO, fontSize: 9, color: cat.color, letterSpacing: '.18em' }}>{cat.label}</span>
                  <span style={{ fontFamily: MONO, fontSize: 8, color: 'var(--mute)', letterSpacing: '.12em' }}>{catTemplates.length} types</span>
                </div>
                <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--mute)' }}>{isOpen ? '−' : '+'}</span>
              </button>
              {/* Templates grid */}
              {isOpen && (
                <div style={{
                  display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 2,
                  border: '1px solid rgba(255,255,255,0.12)', borderTop: 'none', padding: 4,
                  background: 'rgba(0,0,0,0.2)',
                }}>
                  {catTemplates.map(t => (
                    <button
                      key={t.slug}
                      onClick={() => onSelect(t)}
                      style={{
                        padding: '8px 6px', textAlign: 'center', cursor: 'pointer',
                        background: 'rgba(255,255,255,0.02)',
                        border: '1px solid rgba(255,255,255,0.06)',
                        borderRadius: 2, transition: 'all 0.1s',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'; }}
                    >
                      <div style={{ fontSize: 14, marginBottom: 3 }}>{t.icon}</div>
                      <div style={{ fontFamily: DISPLAY, fontSize: 10, color: 'var(--paper)', letterSpacing: '-0.01em', lineHeight: 1.3 }}>{t.label}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FixturePicker({ fixtures, selectedFixture, onSelect, loading, optional }) {
  if (loading) {
    return <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--mute)', padding: '16px 0', textAlign: 'center', letterSpacing: '.2em' }}>LOADING FIXTURES…</div>;
  }
  if (!fixtures.length) {
    return <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--mute)', padding: '16px 0', textAlign: 'center', letterSpacing: '.18em' }}>NO SCHEDULED MATCHES AVAILABLE</div>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 220, overflowY: 'auto' }}>
      {optional && (
        <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)', letterSpacing: '.12em', marginBottom: 2 }}>
          Optional — select to scope this bet to a specific match
        </div>
      )}
      {fixtures.map(f => {
        const sel = selectedFixture?.id === f.id;
        const kickoff = f.kickoff_at ? new Date(f.kickoff_at) : null;
        const dateStr = kickoff
          ? kickoff.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
          : '';
        return (
          <button
            key={f.id}
            onClick={() => onSelect(f)}
            style={{
              width: '100%', padding: '9px 11px', textAlign: 'left', cursor: 'pointer',
              background: sel ? 'rgba(0,196,232,0.1)' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${sel ? 'rgba(0,196,232,0.4)' : 'rgba(255,255,255,0.06)'}`,
              borderRadius: 3, transition: 'all 0.12s',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, flex: 1, minWidth: 0 }}>
                <span style={{ fontFamily: DISPLAY, fontSize: 12, color: sel ? 'var(--cyan)' : 'var(--paper)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.home_team}</span>
                <span style={{ fontFamily: MONO, fontSize: 8, color: 'var(--mute)', flexShrink: 0 }}>vs</span>
                <span style={{ fontFamily: DISPLAY, fontSize: 12, color: sel ? 'var(--cyan)' : 'var(--paper)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.away_team}</span>
              </div>
              {sel && <span style={{ color: 'var(--cyan)', fontSize: 13, flexShrink: 0 }}>✓</span>}
            </div>
            <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)', marginTop: 2, letterSpacing: '.1em' }}>{dateStr}</div>
          </button>
        );
      })}
    </div>
  );
}

function OptionsPreview({ options }) {
  if (!options.length) return null;
  return (
    <div style={{ marginTop: 8, padding: '8px 10px', background: 'rgba(0,196,232,0.05)', border: '1px solid rgba(0,196,232,0.18)', borderRadius: 3 }}>
      <div style={{ fontFamily: MONO, fontSize: 8, color: 'var(--cyan)', letterSpacing: '.18em', marginBottom: 5 }}>OPTIONS ({options.length}):</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {options.map(o => (
          <span key={o.key} style={{ fontFamily: "'Archivo', sans-serif", fontSize: 10, color: 'var(--paper)', padding: '3px 7px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 2 }}>
            {o.label}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export default function BetCreatorPanel({ leagueId, tournamentId, onCreated, commLoading, setCommMsg }) {
  // ── Type selector state ──────────────────────────────────────────────────
  const [template,     setTemplate]     = useState(null);
  const [catExpanded,  setCatExpanded]  = useState(new Set(['match']));

  // ── Config state (per template) ──────────────────────────────────────────
  const [selectedFixture,  setSelectedFixture]  = useState(null);  // fixture-based + optional
  const [ouLine,           setOuLine]           = useState('2.5'); // over_under
  const [freeOptions,      setFreeOptions]      = useState(['', '', '', '', '', '']); // free_text
  const [selectedPlayers,  setSelectedPlayers]  = useState([]);    // player_pick: [{key,label,meta}]
  const [posFilter,        setPosFilter]        = useState('ALL');
  const [playerSearch,     setPlayerSearch]     = useState('');

  // ── Shared fields ────────────────────────────────────────────────────────
  const [deadline,    setDeadline]    = useState('');
  const [windowFrom,  setWindowFrom]  = useState('');
  const [rewardValue, setRewardValue] = useState('5');
  const [rewardType,  setRewardType]  = useState('points');
  const [title,       setTitle]       = useState('');
  const [prompt,      setPrompt]      = useState('');

  // ── Data state ───────────────────────────────────────────────────────────
  const [fixtures,   setFixtures]   = useState([]);
  const [players,    setPlayers]    = useState([]);
  const [loading,    setLoading]    = useState(false);
  const [saving,     setSaving]     = useState(false);

  // Dirty flags so auto-fill doesn't clobber manual edits
  const titleEdited    = useRef(false);
  const promptEdited   = useRef(false);
  const deadlineEdited = useRef(false);
  // slug→id cache (fetched once on mount; avoids hardcoded UUIDs per environment)
  const templateIds    = useRef({});

  // ── Template selection ───────────────────────────────────────────────────
  const selectTemplate = (t) => {
    setTemplate(t);
    setSelectedFixture(null);
    setSelectedPlayers([]);
    setFreeOptions(['', '', '', '', '', '']);
    setOuLine('2.5');
    setPosFilter(t.defaultPos ?? 'ALL');
    setPlayerSearch('');
    titleEdited.current    = false;
    promptEdited.current   = false;
    deadlineEdited.current = false;
    setTitle(t.label);
    setPrompt(t.promptHint);
  };

  const clearTemplate = () => {
    setTemplate(null);
    setSelectedFixture(null);
    setSelectedPlayers([]);
    setFreeOptions(['', '', '', '', '', '']);
    setFixtures([]);
    setPlayers([]);
    setTitle('');
    setPrompt('');
  };

  const toggleCat = (key) => {
    setCatExpanded(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  // ── Fetch: matchday window ───────────────────────────────────────────────
  const fetchMatchdayWindow = useCallback(async () => {
    if (!tournamentId) return { current: null, next: null };
    const now = new Date().toISOString();
    const [{ data: nextRows }, { data: currentRows }] = await Promise.all([
      supabase.from('matchday_deadlines').select('matchday_id, deadline_at').eq('tournament_id', tournamentId).gt('deadline_at', now).order('deadline_at', { ascending: true }).limit(1),
      supabase.from('matchday_deadlines').select('matchday_id, deadline_at').eq('tournament_id', tournamentId).lte('deadline_at', now).order('deadline_at', { ascending: false }).limit(1),
    ]);
    return { current: currentRows?.[0] ?? null, next: nextRows?.[0] ?? null };
  }, [tournamentId]);

  // ── Fetch: fixtures for next (+ current) matchday ───────────────────────
  const fetchFixtures = useCallback(async () => {
    if (!tournamentId) return;
    setLoading(true);
    try {
      const { current, next } = await fetchMatchdayWindow();
      const primary = next ?? current;
      if (!primary) { setFixtures([]); setLoading(false); return; }

      if (!deadlineEdited.current) {
        const dt = new Date(primary.deadline_at);
        const localIso = new Date(dt.getTime() - dt.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
        setDeadline(localIso);
      }

      const matchdayIds = [next, current].filter(Boolean).map(m => m.matchday_id);
      const { data } = await supabase
        .from('fixtures')
        .select('id, home_team, away_team, kickoff_at, matchday_id')
        .eq('tournament_id', tournamentId)
        .in('matchday_id', matchdayIds)
        .order('kickoff_at', { ascending: true });

      const oneHourFromNow = new Date(Date.now() + 60 * 60 * 1000);
      const filtered = (data || []).filter(f => {
        if (next && f.matchday_id === next.matchday_id) return true;
        if (current && f.matchday_id === current.matchday_id) return new Date(f.kickoff_at) >= oneHourFromNow;
        return false;
      });
      setFixtures(filtered);
    } catch (e) {
      console.error('BetCreatorPanel fixture fetch:', e);
    } finally {
      setLoading(false);
    }
  }, [tournamentId, fetchMatchdayWindow]);

  // ── Fetch: players (with cup_active_clubs elimination filter) ───────────
  const fetchPlayers = useCallback(async () => {
    if (!tournamentId) return;
    setLoading(true);
    try {
      // 1. Active clubs only (no eliminated teams)
      let activeClubFilter = null;
      if (leagueId) {
        const { data: activeClubs } = await supabase
          .from('cup_active_clubs')
          .select('club_id')
          .eq('league_id', leagueId)
          .is('eliminated_at', null);
        if (activeClubs?.length) {
          activeClubFilter = activeClubs.map(c => c.club_id);
        }
      }

      // 2. For matchday-scope player bets (top_scorer): narrow to clubs playing in the window
      let windowClubFilter = null;
      const tpl = TMAP[template?.slug];
      const isMatchday = tpl?.scopeType === 'matchday';
      if (isMatchday && tournamentId && (windowFrom || deadline)) {
        let fq = supabase.from('fixtures').select('home_team, away_team').eq('tournament_id', tournamentId).eq('status', 'scheduled');
        if (windowFrom) fq = fq.gte('kickoff_at', new Date(windowFrom).toISOString());
        if (deadline)   fq = fq.lte('kickoff_at', new Date(deadline).toISOString());
        const { data: fx } = await fq.limit(40);
        if (fx?.length) {
          windowClubFilter = [...new Set(fx.flatMap(f => [f.home_team, f.away_team]))];
        }
      }

      // 3. For match-scope player bets with a selected fixture: filter to those 2 clubs
      let fixtureClubFilter = null;
      if (!isMatchday && selectedFixture) {
        fixtureClubFilter = [selectedFixture.home_team, selectedFixture.away_team];
      }

      // 4. Compose the effective club filter (intersection if multiple sources)
      const effectiveFilter = fixtureClubFilter ?? windowClubFilter ?? activeClubFilter;

      // 5. Position filter
      const allPos = tpl?.allPositions;
      const positions = allPos ? ['GK', 'FWD', 'MID', 'DEF'] : ['FWD', 'MID', 'DEF'];

      let pq = supabase
        .from('players')
        .select('id, name, position, club')
        .in('position', positions)
        .eq('tournament_id', tournamentId)
        .order('price', { ascending: false })
        .limit(1000);

      // Apply active club filter last (already intersection-resolved above)
      if (effectiveFilter?.length) pq = pq.in('club', effectiveFilter);

      const { data } = await pq;
      setPlayers(data || []);
    } catch (e) {
      console.error('BetCreatorPanel player fetch:', e);
    } finally {
      setLoading(false);
    }
  }, [tournamentId, leagueId, template?.slug, windowFrom, deadline, selectedFixture?.id]);

  // ── Trigger data fetches when template or relevant state changes ─────────
  useEffect(() => {
    if (!template) return;
    const panel = template.configPanel;
    const needsFixtureData = panel === 'fixture_3way' || panel === 'fixture_2way' || panel === 'winning_margin' || panel === 'binary_yn' || panel === 'over_under' || panel === 'goal_interval' || (panel === 'player_pick' && template.slug !== 'top_scorer');
    if (needsFixtureData && !fixtures.length) fetchFixtures();
    if (panel === 'player_pick') fetchPlayers();
  }, [template?.slug]); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-fetch players when fixture changes (match-scope player bets)
  useEffect(() => {
    if (template?.configPanel === 'player_pick' && template.slug !== 'top_scorer') {
      fetchPlayers();
    }
  }, [selectedFixture?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-fetch players when window dates change (top_scorer matchday scope)
  useEffect(() => {
    if (template?.configPanel === 'player_pick' && template.slug === 'top_scorer') {
      fetchPlayers();
    }
  }, [windowFrom, deadline]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch slug→id once on mount
  useEffect(() => {
    supabase.from('bet_templates').select('id, slug').then(({ data }) => {
      if (data) templateIds.current = Object.fromEntries(data.map(t => [t.slug, t.id]));
    });
  }, []);

  // ── Auto-fill title/prompt when fixture is selected ──────────────────────
  useEffect(() => {
    if (!selectedFixture || !template) return;
    if (!titleEdited.current) {
      setTitle(`${selectedFixture.home_team} vs ${selectedFixture.away_team}`);
    }
    if (!promptEdited.current) {
      setPrompt(template.promptHint.replace('{line}', ouLine || '2.5') + ` (${selectedFixture.home_team} vs ${selectedFixture.away_team})`);
    }
  }, [selectedFixture?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-update prompt when ou line changes (only for over_under, only if not edited)
  useEffect(() => {
    if (!template || template.configPanel !== 'over_under' || promptEdited.current) return;
    const suffix = selectedFixture ? ` (${selectedFixture.home_team} vs ${selectedFixture.away_team})` : '';
    setPrompt(template.promptHint.replace('{line}', ouLine || '?') + suffix);
  }, [ouLine]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fixture selection toggle ─────────────────────────────────────────────
  const handleFixtureToggle = (f) => {
    setSelectedFixture(prev => prev?.id === f.id ? null : f);
    if (!titleEdited.current) {
      // Will be re-set by the useEffect above
    }
  };

  // ── Player toggles ───────────────────────────────────────────────────────
  const togglePlayer = (p) => {
    setSelectedPlayers(prev => {
      const exists = prev.find(o => o.key === p.id);
      if (exists) return prev.filter(o => o.key !== p.id);
      return [...prev, { key: p.id, label: p.name, meta: { club: p.club, pos: p.position } }];
    });
  };

  const selectedPlayerKeys = useMemo(() => new Set(selectedPlayers.map(p => p.key)), [selectedPlayers]);

  // Filtered + sorted player list: selected players float to top
  const filteredPlayers = useMemo(() => {
    const q = playerSearch.toLowerCase();
    const matched = players.filter(p => {
      const matchesSearch = !q || p.name.toLowerCase().includes(q) || (p.club || '').toLowerCase().includes(q);
      const matchesPos    = posFilter === 'ALL' || p.position === posFilter;
      return matchesSearch && matchesPos;
    });
    // Sort: selected first, then by original price order (already from DB)
    const selected   = matched.filter(p => selectedPlayerKeys.has(p.id));
    const unselected = matched.filter(p => !selectedPlayerKeys.has(p.id));
    return [...selected, ...unselected];
  }, [players, playerSearch, posFilter, selectedPlayerKeys]);

  // ── Computed options (derived from config state) ─────────────────────────
  const computedOptions = useMemo(() => {
    if (!template) return [];
    const f = selectedFixture;
    switch (template.configPanel) {
      case 'fixture_3way':
        if (!f) return [];
        return [
          { key: `${f.id}_home`, label: `${f.home_team} Win`, meta: {} },
          { key: `${f.id}_draw`, label: 'Draw', meta: {} },
          { key: `${f.id}_away`, label: `${f.away_team} Win`, meta: {} },
        ];
      case 'fixture_2way': {
        if (!f) return [];
        const base = [
          { key: `${f.id}_home`, label: f.home_team, meta: {} },
          { key: `${f.id}_away`, label: f.away_team, meta: {} },
        ];
        if (template.withNone) base.push({ key: 'none', label: 'None (no clean sheet)', meta: {} });
        return base;
      }
      case 'winning_margin':
        if (!f) return [];
        return [
          { key: `${f.id}_h1`,  label: `${f.home_team} by 1`, meta: {} },
          { key: `${f.id}_h2`,  label: `${f.home_team} by 2`, meta: {} },
          { key: `${f.id}_h3p`, label: `${f.home_team} by 3+`, meta: {} },
          { key: `${f.id}_d`,   label: 'Draw', meta: {} },
          { key: `${f.id}_a1`,  label: `${f.away_team} by 1`, meta: {} },
          { key: `${f.id}_a2`,  label: `${f.away_team} by 2`, meta: {} },
          { key: `${f.id}_a3p`, label: `${f.away_team} by 3+`, meta: {} },
        ];
      case 'binary_yn':
        return [
          { key: 'yes', label: 'Yes', meta: {} },
          { key: 'no',  label: 'No',  meta: {} },
        ];
      case 'over_under': {
        const line = parseFloat(ouLine);
        if (isNaN(line)) return [];
        return [
          { key: `over_${line}`,  label: `Over ${line}`,  meta: {} },
          { key: `under_${line}`, label: `Under ${line}`, meta: {} },
        ];
      }
      case 'goal_interval':
        return [
          { key: '0_15',  label: '0 – 15 min',   meta: {} },
          { key: '16_30', label: '16 – 30 min',  meta: {} },
          { key: '31_45', label: '31 – 45+ min', meta: {} },
          { key: '46_60', label: '46 – 60 min',  meta: {} },
          { key: '61_75', label: '61 – 75 min',  meta: {} },
          { key: '76_90', label: '76 – 90+ min', meta: {} },
        ];
      case 'player_pick':
        return selectedPlayers;
      case 'free_text':
        return freeOptions
          .filter(o => o.trim())
          .map((o, i) => ({ key: `opt_${i}`, label: o.trim(), meta: {} }));
      default:
        return [];
    }
  }, [template, selectedFixture, ouLine, selectedPlayers, freeOptions]);

  // ── Can create? ──────────────────────────────────────────────────────────
  const canCreate = useMemo(() => {
    if (saving || commLoading || !template || !deadline || !title.trim()) return false;
    const panel = template.configPanel;
    const opts  = computedOptions;
    if (panel === 'fixture_3way' || panel === 'fixture_2way' || panel === 'winning_margin') return !!selectedFixture && opts.length >= 2;
    if (panel === 'over_under')   return opts.length === 2;
    if (panel === 'binary_yn')    return opts.length === 2;
    if (panel === 'goal_interval') return opts.length === 6;
    if (panel === 'player_pick')  return selectedPlayers.length >= 2;
    if (panel === 'free_text')    return opts.length >= 2;
    return false;
  }, [template, selectedFixture, computedOptions, selectedPlayers, deadline, title, saving, commLoading]);

  // ── Create ───────────────────────────────────────────────────────────────
  const handleCreate = async () => {
    try {
      setSaving(true);
      setCommMsg(null);

      const opts = computedOptions;
      if (!template)         throw new Error('Choose a bet type.');
      if (!title.trim())     throw new Error('Enter a title.');
      if (!prompt.trim())    throw new Error('Enter a question/prompt.');
      if (!deadline)         throw new Error('Set a submission deadline.');
      if (opts.length < 2)   throw new Error('At least 2 options are required.');

      const scopeRef = selectedFixture?.id ?? null;

      // Duplicate-instance guard
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
        if (dup) throw new Error(`An active "${template.label}" bet already exists ("${dup.title}"). Resolve or cancel it first.`);
      }

      const { error } = await supabase.from('bet_instances').insert({
        league_id:    leagueId,
        template_id:  tplId ?? null,
        title:        title.trim(),
        prompt:       prompt.trim(),
        options:      opts,
        deadline_at:  new Date(deadline).toISOString(),
        reward_value: Number(rewardValue) || 5,
        reward_type:  rewardType,
        scope_type:   template.scopeType,
        scope_ref:    scopeRef,
      });
      if (error) throw new Error(error.message);

      setCommMsg({ type: 'ok', text: `✓ "${title.trim()}" created with ${opts.length} options.` });
      clearTemplate();
      setDeadline('');
      setWindowFrom('');
      setRewardValue('5');
      setRewardType('points');
      onCreated?.();
    } catch (e) {
      setCommMsg({ type: 'err', text: e.message });
    } finally {
      setSaving(false);
    }
  };

  // ── Helpers ──────────────────────────────────────────────────────────────
  const isMatchdayPlayer = template?.configPanel === 'player_pick' && template?.slug === 'top_scorer';
  const showFixturePanel = template && (
    template.configPanel === 'fixture_3way' ||
    template.configPanel === 'fixture_2way' ||
    template.configPanel === 'winning_margin' ||
    (template.configPanel === 'binary_yn') ||
    (template.configPanel === 'over_under') ||
    (template.configPanel === 'goal_interval') ||
    (template.configPanel === 'player_pick' && !isMatchdayPlayer)
  );
  const fixtureRequired = template?.needsFixture;

  const catColor = CATEGORIES.find(c => c.key === template?.category)?.color ?? 'var(--paper)';

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── Step 1: Type selector or selected-type header ── */}
      {!template ? (
        <TypeSelector onSelect={selectTemplate} catExpanded={catExpanded} onToggleCat={toggleCat} />
      ) : (
        <div>
          <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)', letterSpacing: '.2em', marginBottom: 8 }}>1 · BET TYPE</div>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '10px 12px', background: 'rgba(255,255,255,0.03)',
            border: `1px solid ${catColor}44`, borderLeft: `3px solid ${catColor}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 16 }}>{template.icon}</span>
              <div>
                <div style={{ fontFamily: DISPLAY, fontSize: 13, color: catColor, letterSpacing: '-0.01em' }}>{template.label}</div>
                <div style={{ fontFamily: MONO, fontSize: 8, color: 'var(--mute)', letterSpacing: '.12em', marginTop: 2, textTransform: 'uppercase' }}>{template.category}</div>
              </div>
            </div>
            <button
              onClick={clearTemplate}
              style={{ fontFamily: MONO, fontSize: 8, color: 'var(--mute)', letterSpacing: '.15em', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px' }}
            >
              CHANGE ×
            </button>
          </div>
        </div>
      )}

      {/* ── Steps 2–5 only shown after type is selected ── */}
      {template && (
        <>
          {/* ── Step 2: Deadline + Reward ── */}
          <div>
            <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)', letterSpacing: '.2em', marginBottom: 8 }}>
              2 · {isMatchdayPlayer ? 'MATCH WINDOW & DEADLINE' : 'DEADLINE & REWARD'}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {isMatchdayPlayer && (
                <div>
                  <div style={{ fontFamily: MONO, fontSize: 8, color: 'var(--mute)', letterSpacing: '.15em', marginBottom: 5 }}>FROM (OPTIONAL)</div>
                  <input
                    type="datetime-local"
                    value={windowFrom}
                    onChange={e => setWindowFrom(e.target.value)}
                    style={{ width: '100%', boxSizing: 'border-box', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--paper)', fontSize: 16, padding: '7px 8px', borderRadius: 3, outline: 'none', colorScheme: 'dark' }}
                  />
                </div>
              )}
              {/* Deadline — full width row */}
              <div>
                <div style={{ fontFamily: MONO, fontSize: 8, color: 'var(--mute)', letterSpacing: '.15em', marginBottom: 5 }}>
                  {isMatchdayPlayer ? 'PICKS CLOSE' : 'DEADLINE'}
                </div>
                <input
                  type="datetime-local"
                  value={deadline}
                  onChange={e => { setDeadline(e.target.value); deadlineEdited.current = true; }}
                  style={{ width: '100%', boxSizing: 'border-box', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: deadline ? 'var(--paper)' : 'var(--danger)', fontSize: 16, padding: '7px 8px', borderRadius: 3, outline: 'none', colorScheme: 'dark' }}
                />
              </div>
              {/* Reward — own row below */}
              <div>
                <div style={{ fontFamily: MONO, fontSize: 8, color: 'var(--mute)', letterSpacing: '.15em', marginBottom: 5 }}>REWARD</div>
                <div style={{ display: 'flex', gap: 5 }}>
                  <input
                    type="number"
                    value={rewardValue}
                    onChange={e => setRewardValue(e.target.value)}
                    min="1"
                    style={{ width: 80, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--paper)', fontSize: 16, padding: '7px 6px', borderRadius: 3, outline: 'none' }}
                  />
                  <select
                    value={rewardType}
                    onChange={e => setRewardType(e.target.value)}
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--paper)', fontSize: 16, padding: '7px 6px', borderRadius: 3, outline: 'none' }}
                  >
                    <option value="points">pts</option>
                    <option value="budget">€M</option>
                  </select>
                </div>
              </div>
            </div>
            {!isMatchdayPlayer && deadline && (
              <div style={{ fontFamily: MONO, fontSize: 8, color: 'var(--mute)', marginTop: 5, letterSpacing: '.1em' }}>
                Deadline auto-set from next matchday · adjust if needed
              </div>
            )}
          </div>

          {/* ── Step 3: Config panel (type-specific) ── */}
          <div>
            <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)', letterSpacing: '.2em', marginBottom: 8 }}>
              3 · {template.configPanel === 'player_pick' ? 'SELECT PLAYERS'
                  : template.configPanel === 'free_text'  ? 'WRITE OPTIONS'
                  : template.configPanel === 'over_under' ? 'SET THE LINE'
                  : template.configPanel === 'binary_yn'  ? 'YES / NO BET'
                  : template.configPanel === 'goal_interval' ? 'GOAL INTERVAL'
                  : template.configPanel === 'winning_margin' ? 'SELECT MATCH'
                  : 'SELECT MATCH'}
            </div>

            {/* Fixture picker — required or optional depending on panel */}
            {showFixturePanel && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontFamily: MONO, fontSize: 8, color: 'var(--mute)', letterSpacing: '.12em', marginBottom: 6 }}>
                  {fixtureRequired ? 'SELECT MATCH (REQUIRED)' : 'SELECT MATCH (OPTIONAL — scopes this bet)'}
                </div>
                <FixturePicker
                  fixtures={fixtures}
                  selectedFixture={selectedFixture}
                  onSelect={handleFixtureToggle}
                  loading={loading && !fixtures.length}
                  optional={!fixtureRequired}
                />
              </div>
            )}

            {/* ── Over / Under line input ── */}
            {template.configPanel === 'over_under' && (
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontFamily: MONO, fontSize: 8, color: 'var(--mute)', letterSpacing: '.12em', marginBottom: 5 }}>LINE</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="number"
                    value={ouLine}
                    onChange={e => setOuLine(e.target.value)}
                    step="0.5"
                    min="0"
                    style={{ width: 90, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', color: 'var(--paper)', fontSize: 14, padding: '7px 10px', borderRadius: 3, outline: 'none', fontFamily: MONO, textAlign: 'center' }}
                  />
                  <div style={{ display: 'flex', gap: 4 }}>
                    {['0.5','1.5','2.5','3.5','4.5'].map(v => (
                      <button
                        key={v}
                        onClick={() => setOuLine(v)}
                        style={{
                          padding: '5px 9px', fontFamily: MONO, fontSize: 9, letterSpacing: '.12em', cursor: 'pointer', borderRadius: 2,
                          background: ouLine === v ? 'rgba(201,168,76,0.18)' : 'rgba(255,255,255,0.04)',
                          border: `1px solid ${ouLine === v ? 'rgba(201,168,76,0.5)' : 'rgba(255,255,255,0.08)'}`,
                          color: ouLine === v ? 'var(--gold)' : 'var(--mute)',
                        }}
                      >{v}</button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── Binary Yes/No (auto options, nothing to configure) ── */}
            {template.configPanel === 'binary_yn' && (
              <div style={{ padding: '10px 12px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 3 }}>
                <div style={{ fontFamily: MONO, fontSize: 8, color: 'var(--mute)', letterSpacing: '.14em', marginBottom: 6 }}>OPTIONS (AUTO-GENERATED)</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {['Yes', 'No'].map(l => (
                    <span key={l} style={{ padding: '5px 16px', fontFamily: DISPLAY, fontSize: 11, color: 'var(--paper)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 2 }}>{l}</span>
                  ))}
                </div>
              </div>
            )}

            {/* ── Goal Interval (fixed 6 options) ── */}
            {template.configPanel === 'goal_interval' && (
              <div style={{ padding: '10px 12px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 3 }}>
                <div style={{ fontFamily: MONO, fontSize: 8, color: 'var(--mute)', letterSpacing: '.14em', marginBottom: 6 }}>OPTIONS (AUTO-GENERATED)</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {['0 – 15', '16 – 30', '31 – 45+', '46 – 60', '61 – 75', '76 – 90+'].map(l => (
                    <span key={l} style={{ padding: '4px 10px', fontFamily: MONO, fontSize: 9, color: 'var(--paper)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 2, letterSpacing: '.08em' }}>{l}</span>
                  ))}
                </div>
              </div>
            )}

            {/* ── Player pick ── */}
            {template.configPanel === 'player_pick' && (
              <>
                <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                  <input
                    type="text"
                    placeholder="Search player or club…"
                    value={playerSearch}
                    onChange={e => setPlayerSearch(e.target.value)}
                    style={{ flex: 1, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'var(--paper)', fontSize: 11, padding: '7px 10px', borderRadius: 3, outline: 'none' }}
                  />
                  {['ALL', 'FWD', 'MID', 'DEF', ...(template.allPositions ? ['GK'] : [])].map(pos => (
                    <button
                      key={pos}
                      onClick={() => setPosFilter(pos)}
                      style={{
                        padding: '6px 7px', borderRadius: 3, cursor: 'pointer', fontSize: 9, fontWeight: 700,
                        fontFamily: MONO, letterSpacing: '.1em',
                        background: posFilter === pos ? 'rgba(0,196,232,0.15)' : 'rgba(255,255,255,0.04)',
                        border: `1px solid ${posFilter === pos ? 'rgba(0,196,232,0.4)' : 'rgba(255,255,255,0.08)'}`,
                        color: posFilter === pos ? 'var(--cyan)' : 'var(--mute)',
                      }}
                    >{pos}</button>
                  ))}
                  {selectedPlayers.length > 0 && (
                    <button
                      onClick={() => setSelectedPlayers([])}
                      style={{ fontFamily: MONO, fontSize: 8, color: 'var(--danger)', letterSpacing: '.1em', background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px', flexShrink: 0 }}
                    >CLEAR</button>
                  )}
                </div>

                {loading && !players.length ? (
                  <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--mute)', padding: '16px 0', textAlign: 'center', letterSpacing: '.18em' }}>LOADING PLAYERS…</div>
                ) : filteredPlayers.length === 0 ? (
                  <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--mute)', padding: '16px 0', textAlign: 'center', letterSpacing: '.18em' }}>
                    {players.length === 0 ? 'NO PLAYERS FOUND' : 'NO RESULTS — TRY A DIFFERENT FILTER'}
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 260, overflowY: 'auto' }}>
                    {filteredPlayers.map(p => {
                      const sel = selectedPlayerKeys.has(p.id);
                      return (
                        <button
                          key={p.id}
                          onClick={() => togglePlayer(p)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                            padding: '7px 10px', textAlign: 'left', cursor: 'pointer',
                            background: sel ? 'rgba(0,196,232,0.1)' : 'rgba(255,255,255,0.02)',
                            border: `1px solid ${sel ? 'rgba(0,196,232,0.4)' : 'rgba(255,255,255,0.06)'}`,
                            borderRadius: 3, transition: 'all 0.1s',
                          }}
                        >
                          <div style={{ width: 26, height: 26, borderRadius: '50%', flexShrink: 0, background: sel ? 'rgba(0,196,232,0.2)' : 'rgba(255,255,255,0.06)', border: `1px solid ${sel ? 'rgba(0,196,232,0.5)' : 'rgba(255,255,255,0.1)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: MONO, fontSize: 8, color: sel ? 'var(--cyan)' : 'var(--mute)', fontWeight: 700 }}>
                            {p.position?.substring(0, 3)}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontFamily: DISPLAY, fontSize: 12, color: sel ? 'var(--cyan)' : 'var(--paper)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                            <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)', letterSpacing: '.1em' }}>{p.club}</div>
                          </div>
                          {sel && <span style={{ color: 'var(--cyan)', fontSize: 13, flexShrink: 0 }}>✓</span>}
                        </button>
                      );
                    })}
                  </div>
                )}

                <div style={{ fontFamily: MONO, fontSize: 8, color: selectedPlayers.length >= 2 ? 'var(--cyan)' : 'var(--mute)', letterSpacing: '.12em', marginTop: 5 }}>
                  {selectedPlayers.length} PLAYER{selectedPlayers.length !== 1 ? 'S' : ''} SELECTED{selectedPlayers.length < 2 ? ' · NEED AT LEAST 2' : ''}
                </div>
              </>
            )}

            {/* ── Free text options ── */}
            {template.configPanel === 'free_text' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <div style={{ fontFamily: MONO, fontSize: 8, color: 'var(--mute)', letterSpacing: '.12em', marginBottom: 2 }}>
                  TYPE UP TO 6 OPTIONS (at least 2 required)
                </div>
                {freeOptions.map((val, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontFamily: MONO, fontSize: 8, color: 'var(--mute)', width: 14, textAlign: 'right', flexShrink: 0 }}>{i + 1}</span>
                    <input
                      type="text"
                      value={val}
                      onChange={e => {
                        const next = [...freeOptions];
                        next[i] = e.target.value;
                        setFreeOptions(next);
                      }}
                      placeholder={`Option ${i + 1}…`}
                      style={{ flex: 1, background: 'rgba(255,255,255,0.04)', border: `1px solid ${val.trim() ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.06)'}`, color: 'var(--paper)', fontSize: 12, padding: '7px 9px', borderRadius: 3, outline: 'none' }}
                    />
                    {val.trim() && (
                      <button
                        onClick={() => { const next = [...freeOptions]; next[i] = ''; setFreeOptions(next); }}
                        style={{ fontFamily: MONO, fontSize: 10, color: 'var(--mute)', background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px' }}
                      >×</button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Options preview for computed types */}
            {template.configPanel !== 'player_pick' && template.configPanel !== 'free_text' && computedOptions.length > 0 && (
              <OptionsPreview options={computedOptions} />
            )}
          </div>

          {/* ── Step 4: Title + Prompt ── */}
          <div>
            <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)', letterSpacing: '.2em', marginBottom: 8 }}>4 · TITLE &amp; QUESTION</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <input
                type="text"
                value={title}
                onChange={e => { setTitle(e.target.value); titleEdited.current = true; }}
                placeholder="Bet title (auto-filled)"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: title ? 'var(--paper)' : 'var(--danger)', fontSize: 11, padding: '8px 10px', borderRadius: 3, outline: 'none' }}
              />
              <textarea
                value={prompt}
                onChange={e => { setPrompt(e.target.value); promptEdited.current = true; }}
                placeholder="Question shown to players (auto-filled)"
                rows={2}
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--paper)', fontSize: 11, padding: '8px 10px', borderRadius: 3, outline: 'none', resize: 'none', fontFamily: "'Archivo', sans-serif" }}
              />
            </div>
          </div>

          {/* ── Create button ── */}
          <div>
            {!canCreate && (
              <div style={{ fontFamily: MONO, fontSize: 8, color: 'var(--mute)', letterSpacing: '.13em', marginBottom: 7 }}>
                {!deadline && '· Set a deadline  '}
                {!title.trim() && '· Add a title  '}
                {template.needsFixture && !selectedFixture && '· Select a match  '}
                {template.configPanel === 'player_pick' && selectedPlayers.length < 2 && '· Select at least 2 players  '}
                {template.configPanel === 'free_text' && computedOptions.length < 2 && '· Add at least 2 options  '}
                {template.configPanel === 'over_under' && isNaN(parseFloat(ouLine)) && '· Enter a valid line  '}
              </div>
            )}
            <div style={{ display: 'flex', gap: 6, alignItems: 'stretch' }}>
              <div style={{ flex: 1, padding: '9px 12px', background: 'var(--ink)', border: '1px solid var(--rule)', fontFamily: MONO, fontSize: 9, letterSpacing: '.16em', color: canCreate ? 'var(--paper)' : 'var(--mute)', display: 'flex', alignItems: 'center' }}>
                {computedOptions.length || selectedPlayers.length || 0} OPTIONS
              </div>
              <button
                onClick={handleCreate}
                disabled={!canCreate}
                style={{ background: 'transparent', border: `1px solid ${canCreate ? 'var(--cyan)' : 'var(--rule)'}`, color: canCreate ? 'var(--cyan)' : 'var(--mute)', fontFamily: MONO, fontSize: 9, letterSpacing: '.18em', padding: '0 16px', cursor: canCreate ? 'pointer' : 'not-allowed', flexShrink: 0, whiteSpace: 'nowrap' }}
              >
                {saving ? 'CREATING…' : 'CREATE BET ↯'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
