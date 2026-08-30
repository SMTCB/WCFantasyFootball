import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useClubhouseContext } from '../context/ClubhouseContext';
import { useSport } from '../context/SportContext';
import { supabase } from '../lib/supabase';
import { ArchivedBadge } from '../components/league/LeagueBadges';

const MONO = { fontFamily: 'JetBrains Mono, monospace' };
const HEAD = { fontFamily: 'Archivo Black, sans-serif' };
const BODY = { fontFamily: 'Archivo, sans-serif' };

// Kept in sync with AppLayout.jsx's ClubhouseSwitcher so a given Clubhouse's
// identity dot is the same color here as it is in the sidebar.
const IDENTITY_COLORS = ['var(--accent)', 'var(--gold)', 'var(--f1)', 'var(--positive)', 'var(--danger)'];

const SPORT_META = {
  football: { label: 'Football', emoji: '⚽', color: 'var(--accent)' },
  f1:       { label: 'F1',       emoji: '🏁', color: 'var(--f1)'    },
  tennis:   { label: 'Tennis',   emoji: '🎾', color: 'var(--ten)'   },
};

// ── Small competition pill, used inside a ClubhouseCard's body grid ──────────
function CompetitionChip({ item, sport, onClick }) {
  const meta = SPORT_META[sport] ?? SPORT_META.football;
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 7, minWidth: 0,
        padding: '8px 10px', background: 'var(--elev)', border: '1px solid var(--rule)',
        borderRadius: 7, cursor: 'pointer', textAlign: 'left',
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: meta.color, flexShrink: 0 }} />
      <span style={{ ...BODY, fontSize: 'var(--fs-label)', color: 'var(--paper)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
        {item.name}
      </span>
      {item.archived && <ArchivedBadge />}
      <span style={{ flexShrink: 0, fontSize: 'var(--fs-micro)' }}>{meta.emoji}</span>
    </button>
  );
}

// ── One Clubhouse's card: header (enter clubhouse) + competition chip grid ──
function ClubhouseCard({ circle, comps, colorIndex, onEnterClubhouse, onEnterCompetition }) {
  const allComps = [
    ...(comps?.football ?? []).map(c => ({ ...c, sport: 'football' })),
    ...(comps?.f1       ?? []).map(c => ({ ...c, sport: 'f1'       })),
    ...(comps?.tennis   ?? []).map(c => ({ ...c, sport: 'tennis'   })),
  ];
  const color = IDENTITY_COLORS[colorIndex % IDENTITY_COLORS.length];

  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--rule)', borderRadius: 10, overflow: 'hidden' }}>
      <button
        onClick={onEnterClubhouse}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 10,
          padding: '14px 16px', background: 'transparent', border: 'none',
          borderBottom: '1px solid var(--rule)', cursor: 'pointer', textAlign: 'left',
        }}
      >
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: color, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ ...HEAD, fontSize: 'var(--fs-body)', color: 'var(--paper)', lineHeight: 1.2 }}>{circle.name}</div>
          <div style={{ ...MONO, fontSize: 'var(--fs-micro)', letterSpacing: '0.1em', color: 'var(--mute)', textTransform: 'uppercase', marginTop: 2 }}>
            {circle.role === 'owner' ? 'OWNER · ' : ''}{allComps.length} {allComps.length === 1 ? 'COMPETITION' : 'COMPETITIONS'}
          </div>
        </div>
        <span style={{ ...MONO, fontSize: 'var(--fs-micro)', color: 'var(--accent)', letterSpacing: '0.08em', flexShrink: 0 }}>ENTER →</span>
      </button>

      <div style={{ padding: 14 }}>
        {allComps.length === 0 ? (
          <div style={{ ...MONO, fontSize: 'var(--fs-micro)', color: 'var(--mute)', textAlign: 'center', padding: '8px 0' }}>
            No competitions yet.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8 }}>
            {allComps.map(item => (
              <CompetitionChip
                key={`${item.sport}-${item.id}`}
                item={item}
                sport={item.sport}
                onClick={() => onEnterCompetition(circle, item, item.sport)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Find / create a Clubhouse — adapted from ClubhouseScreen's FindTab ───────
function FindOrCreatePanel({ searchClubhouses, joinCircleByCode, createCircle }) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [createBusy, setCreateBusy] = useState(false);
  const [createErr, setCreateErr] = useState('');

  const [code, setCode] = useState('');
  const [joinBusy, setJoinBusy] = useState(false);
  const [joinErr, setJoinErr] = useState('');

  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchJoining, setSearchJoining] = useState(null);
  const [searchErr, setSearchErr] = useState('');

  async function handleCreate(e) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreateBusy(true); setCreateErr('');
    try { await createCircle(newName.trim()); setNewName(''); setCreating(false); }
    catch (e) { setCreateErr(e.message === 'NAME_REQUIRED' ? 'Please enter a name.' : e.message); }
    finally { setCreateBusy(false); }
  }

  async function handleJoinByCode(e) {
    e.preventDefault();
    if (code.trim().length < 6) return;
    setJoinBusy(true); setJoinErr('');
    try { await joinCircleByCode(code.trim()); setCode(''); }
    catch (e) { setJoinErr(e.message === 'INVALID_CODE' ? 'Code not found — check and try again.' : e.message); }
    finally { setJoinBusy(false); }
  }

  async function handleSearch(e) {
    e.preventDefault();
    if (query.trim().length < 2) return;
    setSearchBusy(true); setSearchErr('');
    try { setResults(await searchClubhouses(query)); }
    catch (e) { setSearchErr(e.message === 'QUERY_TOO_SHORT' ? 'Enter at least 2 characters.' : e.message); }
    finally { setSearchBusy(false); }
  }

  async function handleSearchJoin(inviteCode) {
    setSearchJoining(inviteCode); setSearchErr('');
    try { await joinCircleByCode(inviteCode); }
    catch (e) { setSearchErr(e.message === 'ALREADY_MEMBER' ? 'You are already a member.' : e.message); }
    finally { setSearchJoining(null); }
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 20 }}>
        {/* Create — primary, dark shell fill */}
        <div style={{ flex: '1 1 240px', background: 'var(--shell)', border: '1px solid var(--shell)', borderRadius: 8, padding: '18px 18px' }}>
          <div style={{ ...MONO, fontSize: 'var(--fs-micro)', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--on-shell-dim)', marginBottom: 8 }}>
            Start fresh
          </div>
          <div style={{ ...HEAD, fontSize: 'var(--fs-body)', color: '#fff', marginBottom: 6 }}>Create a Clubhouse</div>
          <div style={{ fontSize: 'var(--fs-label)', color: 'var(--on-shell-dim)', marginBottom: 14 }}>
            Name it, invite your group, add competitions as you go
          </div>

          {creating ? (
            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <input
                autoFocus
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="e.g. The Friday Night Crew"
                maxLength={40}
                style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--shell-rule-emphasis)', borderRadius: 6, ...BODY, fontSize: 'var(--fs-body)', color: '#fff', background: 'var(--shell-fill-strong)', outline: 'none', boxSizing: 'border-box' }}
              />
              {createErr && <div style={{ ...MONO, fontSize: 'var(--fs-micro)', color: '#FF8A8A' }}>{createErr}</div>}
              <button
                type="submit"
                disabled={createBusy || !newName.trim()}
                style={{ display: 'block', textAlign: 'center', padding: 11, background: '#fff', color: 'var(--shell)', border: 'none', borderRadius: 6, ...MONO, fontSize: 'var(--fs-micro)', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: createBusy || !newName.trim() ? 'default' : 'pointer', opacity: createBusy || !newName.trim() ? 0.6 : 1 }}
              >
                {createBusy ? 'Creating…' : 'Create Clubhouse'}
              </button>
            </form>
          ) : (
            <button
              onClick={() => setCreating(true)}
              style={{ display: 'block', width: '100%', textAlign: 'center', padding: 11, background: '#fff', color: 'var(--shell)', border: 'none', borderRadius: 6, ...MONO, fontSize: 'var(--fs-micro)', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}
            >
              + Create a new Clubhouse
            </button>
          )}
        </div>

        {/* Join by code — secondary */}
        <div style={{ flex: '1 1 240px', background: 'var(--card)', border: '1px solid var(--rule)', borderRadius: 8, padding: '18px 18px' }}>
          <div style={{ ...MONO, fontSize: 'var(--fs-micro)', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--mute)', marginBottom: 8 }}>
            Have a code?
          </div>
          <div style={{ ...HEAD, fontSize: 'var(--fs-body)', color: 'var(--paper)', marginBottom: 6 }}>Join with an invite</div>
          <form onSubmit={handleJoinByCode} style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
            <input
              value={code}
              onChange={e => setCode(e.target.value.toUpperCase())}
              placeholder="FK-XXXXX"
              maxLength={8}
              style={{ width: '100%', padding: '10px 12px', background: 'var(--elev)', border: 'none', borderRadius: 6, ...MONO, fontSize: 'var(--fs-body)', fontWeight: 600, letterSpacing: '0.1em', color: 'var(--paper)', outline: 'none', boxSizing: 'border-box' }}
            />
            {joinErr && <div style={{ ...MONO, fontSize: 'var(--fs-micro)', color: 'var(--danger)' }}>{joinErr}</div>}
            <button
              type="submit"
              disabled={joinBusy || code.trim().length < 6}
              style={{ display: 'block', textAlign: 'center', padding: 11, background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, ...MONO, fontSize: 'var(--fs-micro)', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: joinBusy || code.trim().length < 6 ? 'default' : 'pointer', opacity: joinBusy || code.trim().length < 6 ? 0.6 : 1 }}
            >
              {joinBusy ? 'Joining…' : 'Join Clubhouse'}
            </button>
          </form>
        </div>
      </div>

      {/* Search public clubhouses */}
      <div style={{ background: 'var(--card)', border: '1px solid var(--rule)', borderRadius: 8, padding: '18px 18px' }}>
        <div style={{ ...MONO, fontSize: 'var(--fs-micro)', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--mute)', marginBottom: 10 }}>
          Search public Clubhouses
        </div>
        <form onSubmit={handleSearch} style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search by name…"
            style={{ flex: 1, padding: '10px 12px', border: '1px solid var(--rule)', borderRadius: 6, ...BODY, fontSize: 'var(--fs-body)', color: 'var(--paper)', background: 'var(--elev)', outline: 'none' }}
          />
          <button
            type="submit"
            disabled={searchBusy || query.trim().length < 2}
            style={{ padding: '10px 16px', background: searchBusy || query.trim().length < 2 ? 'var(--mute)' : 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, ...MONO, fontSize: 'var(--fs-micro)', fontWeight: 700, letterSpacing: '0.12em', cursor: 'pointer', whiteSpace: 'nowrap' }}
          >
            {searchBusy ? '…' : 'SEARCH'}
          </button>
        </form>

        {searchErr && <div style={{ ...MONO, fontSize: 'var(--fs-micro)', color: 'var(--danger)', marginBottom: 12 }}>{searchErr}</div>}

        {results !== null && results.length === 0 && (
          <div style={{ textAlign: 'center', padding: '24px 0', ...MONO, fontSize: 'var(--fs-micro)', color: 'var(--mute)' }}>
            No public Clubhouses found for "{query}".
          </div>
        )}

        {results !== null && results.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {results.map(r => (
              <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '12px 14px', background: 'var(--elev)', border: '1px solid var(--rule)', borderRadius: 8 }}>
                <div>
                  <div style={{ ...HEAD, fontSize: 'var(--fs-body)', color: 'var(--paper)' }}>{r.name}</div>
                  <div style={{ ...MONO, fontSize: 'var(--fs-micro)', color: 'var(--mute)', letterSpacing: '0.08em', marginTop: 2 }}>
                    {r.member_count} {r.member_count === 1 ? 'member' : 'members'}
                  </div>
                </div>
                {r.already_member ? (
                  <span style={{ ...MONO, fontSize: 'var(--fs-micro)', color: 'var(--positive)', fontWeight: 700, letterSpacing: '0.1em' }}>JOINED ✓</span>
                ) : (
                  <button
                    onClick={() => handleSearchJoin(r.invite_code)}
                    disabled={searchJoining === r.invite_code}
                    style={{ padding: '8px 14px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, ...MONO, fontSize: 'var(--fs-micro)', fontWeight: 700, letterSpacing: '0.1em', cursor: 'pointer', whiteSpace: 'nowrap' }}
                  >
                    {searchJoining === r.invite_code ? 'JOINING…' : 'JOIN'}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {results === null && !searchBusy && (
          <div style={{ textAlign: 'center', padding: '24px 0', ...MONO, fontSize: 'var(--fs-micro)', color: 'var(--mute)', lineHeight: 1.8 }}>
            Search for public Clubhouses by name.<br />
            Private Clubhouses are invite-code only.
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function HomeDashboardScreen() {
  const { myCircles, setActiveCircleId, searchClubhouses, joinCircleByCode, createCircle, loading } = useClubhouseContext();
  const { setActivePaddockId, setActivePlayerBoxId } = useSport();
  const navigate = useNavigate();

  const [compsByCircle, setCompsByCircle] = useState({});
  const circleIdsKey = myCircles.map(c => c.id).join(',');

  useEffect(() => {
    if (!circleIdsKey) { setCompsByCircle({}); return; }
    let cancelled = false;
    const ids = circleIdsKey.split(',');
    Promise.all(ids.map(id => supabase.rpc('get_clubhouse_competitions', { p_circle_id: id }))).then(results => {
      if (cancelled) return;
      const next = {};
      ids.forEach((id, i) => {
        const res = results[i];
        if (!res.error && !res.data?.error) next[id] = res.data ?? { football: [], f1: [], tennis: [] };
        else next[id] = { football: [], f1: [], tennis: [] };
      });
      setCompsByCircle(next);
    });
    return () => { cancelled = true; };
  }, [circleIdsKey]);

  function enterClubhouse(circle) {
    setActiveCircleId(circle.id);
    navigate(`/clubhouse/${circle.id}`);
  }

  function enterCompetition(circle, item, sport) {
    setActiveCircleId(circle.id);
    if (sport === 'football') navigate(`/league/${item.id}`);
    else if (sport === 'f1') { setActivePaddockId(item.id); navigate(`/f1/${item.id}`); }
    // get_clubhouse_competitions returns player_boxes.id for tennis entries — a Player Box
    // is a container of tournaments, not a single tournament, so it routes through /tennis
    // (which reads the active box from SportContext), never directly to /tennis/tournament/:id.
    else { setActivePlayerBoxId(item.id); navigate('/tennis'); }
  }

  const totalComps = Object.values(compsByCircle).reduce(
    (sum, c) => sum + (c.football?.length ?? 0) + (c.f1?.length ?? 0) + (c.tennis?.length ?? 0),
    0
  );

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', paddingBottom: 40 }}>
      {/* Header */}
      <div style={{ background: 'var(--shell)', padding: '22px 20px 20px' }}>
        <div style={{ ...MONO, fontSize: 'var(--fs-micro)', letterSpacing: '0.18em', color: 'var(--on-shell-dim)', textTransform: 'uppercase', marginBottom: 8 }}>
          🏠 HOME
        </div>
        <h1 style={{ ...HEAD, fontSize: 'var(--fs-title)', color: 'var(--on-shell)', margin: 0, lineHeight: 1.15, letterSpacing: '-0.02em' }}>
          Every Clubhouse, one page.
        </h1>
        <p style={{ ...BODY, fontSize: 'var(--fs-body)', color: 'var(--on-shell-dim)', lineHeight: 1.5, margin: '10px 0 0', maxWidth: 520 }}>
          Jump into any competition across every Clubhouse you're part of, or find a new one to join.
        </p>

        {myCircles.length > 0 && (
          <div style={{ display: 'flex', gap: 24, marginTop: 18 }}>
            <div>
              <div style={{ ...HEAD, fontSize: 'var(--fs-heading)', color: '#fff', letterSpacing: '-0.02em', lineHeight: 1 }}>{myCircles.length}</div>
              <div style={{ ...MONO, fontSize: 'var(--fs-micro)', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--on-shell-faint)', marginTop: 2 }}>
                {myCircles.length === 1 ? 'CLUBHOUSE' : 'CLUBHOUSES'}
              </div>
            </div>
            <div>
              <div style={{ ...HEAD, fontSize: 'var(--fs-heading)', color: '#fff', letterSpacing: '-0.02em', lineHeight: 1 }}>{totalComps}</div>
              <div style={{ ...MONO, fontSize: 'var(--fs-micro)', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--on-shell-faint)', marginTop: 2 }}>
                COMPETITIONS
              </div>
            </div>
          </div>
        )}
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '22px 20px 0' }}>
        {loading && myCircles.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, ...MONO, fontSize: 'var(--fs-micro)', color: 'var(--mute)' }}>
            Loading…
          </div>
        ) : (
          <>
            {myCircles.length > 0 && (
              <div style={{ marginBottom: 28 }}>
                <div style={{ ...MONO, fontSize: 'var(--fs-micro)', letterSpacing: '0.18em', color: 'var(--mute)', textTransform: 'uppercase', marginBottom: 12 }}>
                  Your Clubhouses
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {myCircles.map((circle, i) => (
                    <ClubhouseCard
                      key={circle.id}
                      circle={circle}
                      comps={compsByCircle[circle.id]}
                      colorIndex={i}
                      onEnterClubhouse={() => enterClubhouse(circle)}
                      onEnterCompetition={enterCompetition}
                    />
                  ))}
                </div>
              </div>
            )}

            <div style={{ marginBottom: 28 }}>
              <div style={{ ...MONO, fontSize: 'var(--fs-micro)', letterSpacing: '0.18em', color: 'var(--mute)', textTransform: 'uppercase', marginBottom: 12 }}>
                {myCircles.length > 0 ? 'Find Another Clubhouse' : 'Get Started'}
              </div>
              <FindOrCreatePanel
                searchClubhouses={searchClubhouses}
                joinCircleByCode={joinCircleByCode}
                createCircle={createCircle}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
