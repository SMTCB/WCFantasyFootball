import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useClubhouseContext } from '../context/ClubhouseContext';
import { useSport } from '../context/SportContext';
import { supabase } from '../lib/supabase';
import { ArchivedBadge, FinishedBadge } from '../components/league/LeagueBadges';
import { useShowArchived } from '../hooks/useShowArchived';
import usePullToRefresh from '../hooks/usePullToRefresh';
import PullToRefreshIndicator from '../components/motion/PullToRefreshIndicator';

const MONO = { fontFamily: 'Archivo, sans-serif' };
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
        minHeight: 'var(--tap)', padding: '8px 10px', background: 'var(--elev)', border: '1px solid var(--rule)',
        borderRadius: 'var(--radius)', cursor: 'pointer', textAlign: 'left',
      }}
    >
      <span style={{ width: 4, height: 18, borderRadius: 2, background: meta.color, flexShrink: 0 }} />
      <span style={{ ...BODY, fontSize: 'var(--fs-label)', color: 'var(--paper)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
        {item.name}
      </span>
      {item.finished && <FinishedBadge />}
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
    <div style={{ background: 'var(--card)', border: '1px solid var(--rule)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
      <button
        onClick={onEnterClubhouse}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 10,
          minHeight: 'var(--tap)', padding: '14px 16px', background: 'transparent', border: 'none',
          borderBottom: '1px solid var(--rule)', cursor: 'pointer', textAlign: 'left',
        }}
      >
        <span style={{ width: 4, height: 24, borderRadius: 2, background: color, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ ...HEAD, fontSize: 'var(--fs-body)', color: 'var(--paper)', lineHeight: 1.2 }}>{circle.name}</div>
            {circle.archived && <ArchivedBadge />}
          </div>
          <div className="num" style={{ fontSize: 'var(--fs-label)', color: 'var(--mute)', marginTop: 2 }}>
            {circle.role === 'owner' ? 'Owner · ' : ''}{allComps.length} {allComps.length === 1 ? 'competition' : 'competitions'}
          </div>
        </div>
        <span style={{ fontSize: 'var(--fs-label)', fontWeight: 700, color: 'var(--accent)', flexShrink: 0 }}>Enter →</span>
      </button>

      <div style={{ padding: 14 }}>
        {allComps.length === 0 ? (
          <div style={{ ...BODY, fontSize: 'var(--fs-label)', color: 'var(--mute)', textAlign: 'center', padding: '8px 0' }}>
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
function FindOrCreatePanel({ searchClubhouses, joinCircleByCode, createCircle, creating, setCreating }) {
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
        {/* Create — primary */}
        <div style={{ flex: '1 1 240px', background: 'var(--card)', border: '1px solid var(--rule)', borderLeft: '4px solid var(--accent)', borderRadius: 'var(--radius)', padding: '18px 18px' }}>
          <div style={{ fontSize: 'var(--fs-label)', color: 'var(--mute)', marginBottom: 8 }}>
            Start fresh
          </div>
          <div style={{ ...HEAD, fontSize: 'var(--fs-body)', color: 'var(--paper)', marginBottom: 6 }}>Create a Clubhouse</div>
          <div style={{ fontSize: 'var(--fs-label)', color: 'var(--mute)', marginBottom: 14 }}>
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
                style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--rule)', borderRadius: 'var(--radius)', ...BODY, fontSize: 'var(--fs-body)', color: 'var(--paper)', background: 'var(--elev)', minHeight: 'var(--tap)', outline: 'none', boxSizing: 'border-box' }}
              />
              {createErr && <div style={{ ...BODY, fontSize: 'var(--fs-label)', color: 'var(--danger)' }}>{createErr}</div>}
              <button
                type="submit"
                disabled={createBusy || !newName.trim()}
                style={{ display: 'block', textAlign: 'center', padding: 11, background: 'var(--accent)', color: 'var(--on-accent)', border: 'none', borderRadius: 'var(--radius)', ...BODY, fontSize: 'var(--fs-label)', fontWeight: 700, minHeight: 'var(--tap)', cursor: createBusy || !newName.trim() ? 'default' : 'pointer', opacity: createBusy || !newName.trim() ? 0.6 : 1 }}
              >
                {createBusy ? 'Creating…' : 'Create Clubhouse'}
              </button>
            </form>
          ) : (
            <button
              onClick={() => setCreating(true)}
              style={{ display: 'block', width: '100%', textAlign: 'center', padding: 11, background: 'var(--accent)', color: 'var(--on-accent)', border: 'none', borderRadius: 'var(--radius)', ...BODY, fontSize: 'var(--fs-label)', fontWeight: 700, minHeight: 'var(--tap)', cursor: 'pointer' }}
            >
              Create a new Clubhouse
            </button>
          )}
        </div>

        {/* Join by code — secondary */}
        <div style={{ flex: '1 1 240px', background: 'var(--card)', border: '1px solid var(--rule)', borderRadius: 'var(--radius)', padding: '18px 18px' }}>
          <div style={{ fontSize: 'var(--fs-label)', color: 'var(--mute)', marginBottom: 8 }}>
            Have a code?
          </div>
          <div style={{ ...HEAD, fontSize: 'var(--fs-body)', color: 'var(--paper)', marginBottom: 6 }}>Join with an invite</div>
          <form onSubmit={handleJoinByCode} style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
            <input
              value={code}
              onChange={e => setCode(e.target.value.toUpperCase())}
              placeholder="FK-XXXXX"
              maxLength={8}
              style={{ width: '100%', padding: '10px 12px', background: 'var(--elev)', border: 'none', borderRadius: 'var(--radius)', minHeight: 'var(--tap)', ...MONO, fontSize: 'var(--fs-body)', fontWeight: 600, letterSpacing: '0.1em', color: 'var(--paper)', outline: 'none', boxSizing: 'border-box' }}
            />
            {joinErr && <div style={{ ...BODY, fontSize: 'var(--fs-label)', color: 'var(--danger)' }}>{joinErr}</div>}
            <button
              type="submit"
              disabled={joinBusy || code.trim().length < 6}
              style={{ display: 'block', textAlign: 'center', padding: 11, background: 'var(--accent)', color: 'var(--on-accent)', border: 'none', borderRadius: 'var(--radius)', ...BODY, fontSize: 'var(--fs-label)', fontWeight: 700, minHeight: 'var(--tap)', cursor: joinBusy || code.trim().length < 6 ? 'default' : 'pointer', opacity: joinBusy || code.trim().length < 6 ? 0.6 : 1 }}
            >
              {joinBusy ? 'Joining…' : 'Join Clubhouse'}
            </button>
          </form>
        </div>
      </div>

      {/* Search public clubhouses */}
      <div style={{ background: 'var(--card)', border: '1px solid var(--rule)', borderRadius: 'var(--radius)', padding: '18px 18px' }}>
        <div style={{ fontSize: 'var(--fs-label)', color: 'var(--mute)', marginBottom: 10 }}>
          Search public Clubhouses
        </div>
        <form onSubmit={handleSearch} style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search by name…"
            style={{ flex: 1, padding: '10px 12px', border: '1px solid var(--rule)', borderRadius: 'var(--radius)', minHeight: 'var(--tap)', ...BODY, fontSize: 'var(--fs-body)', color: 'var(--paper)', background: 'var(--elev)', outline: 'none' }}
          />
          <button
            type="submit"
            disabled={searchBusy || query.trim().length < 2}
            style={{ minHeight: 'var(--tap)', padding: '10px 16px', background: searchBusy || query.trim().length < 2 ? 'var(--mute)' : 'var(--accent)', color: 'var(--on-accent)', border: 'none', borderRadius: 'var(--radius)', ...BODY, fontSize: 'var(--fs-label)', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}
          >
            {searchBusy ? '…' : 'Search'}
          </button>
        </form>

        {searchErr && <div style={{ ...BODY, fontSize: 'var(--fs-label)', color: 'var(--danger)', marginBottom: 12 }}>{searchErr}</div>}

        {results !== null && results.length === 0 && (
          <div style={{ textAlign: 'center', padding: '24px 0', ...BODY, fontSize: 'var(--fs-label)', color: 'var(--mute)' }}>
            No public Clubhouses found for "{query}".
          </div>
        )}

        {results !== null && results.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {results.map(r => (
              <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '12px 14px', background: 'var(--elev)', border: '1px solid var(--rule)', borderRadius: 'var(--radius)' }}>
                <div>
                  <div style={{ ...HEAD, fontSize: 'var(--fs-body)', color: 'var(--paper)' }}>{r.name}</div>
                  <div style={{ ...BODY, fontSize: 'var(--fs-label)', color: 'var(--mute)', marginTop: 2 }}>
                    {r.member_count} {r.member_count === 1 ? 'member' : 'members'}
                  </div>
                </div>
                {r.already_member ? (
                  <span style={{ fontSize: 'var(--fs-label)', color: 'var(--positive)', fontWeight: 700 }}>Joined ✓</span>
                ) : (
                  <button
                    onClick={() => handleSearchJoin(r.invite_code)}
                    disabled={searchJoining === r.invite_code}
                    style={{ minHeight: 'var(--tap)', padding: '8px 16px', background: 'var(--accent)', color: 'var(--on-accent)', border: 'none', borderRadius: 'var(--radius)', ...BODY, fontSize: 'var(--fs-label)', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}
                  >
                    {searchJoining === r.invite_code ? 'Joining…' : 'Join'}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {results === null && !searchBusy && (
          <div style={{ textAlign: 'center', padding: '24px 0', ...BODY, fontSize: 'var(--fs-label)', color: 'var(--mute)', lineHeight: 1.8 }}>
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
  const { myCircles, setActiveCircleId, searchClubhouses, joinCircleByCode, createCircle, loading, refresh } = useClubhouseContext();
  const { setActivePaddockId, setActivePlayerBoxId } = useSport();
  const navigate = useNavigate();

  const [compsByCircle, setCompsByCircle] = useState({});
  const [creatingClubhouse, setCreatingClubhouse] = useState(false);
  const findOrCreateRef = useRef(null);
  const circleIdsKey = myCircles.map(c => c.id).join(',');
  const [showArchived, setShowArchived] = useShowArchived('ffl_show_archived_clubhouses');
  const archivedCount = myCircles.filter(c => c.archived).length;
  const visibleCircles = showArchived ? myCircles : myCircles.filter(c => !c.archived);

  function openCreateClubhouse() {
    setCreatingClubhouse(true);
    findOrCreateRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  const fetchCompetitions = useCallback(async (ids) => {
    if (!ids.length) { setCompsByCircle({}); return; }
    const results = await Promise.all(ids.map(id => supabase.rpc('get_clubhouse_competitions', { p_circle_id: id })));
    const next = {};
    ids.forEach((id, i) => {
      const res = results[i];
      if (!res.error && !res.data?.error) next[id] = res.data ?? { football: [], f1: [], tennis: [] };
      else next[id] = { football: [], f1: [], tennis: [] };
    });
    setCompsByCircle(next);
  }, []);

  useEffect(() => {
    fetchCompetitions(circleIdsKey ? circleIdsKey.split(',') : []);
  }, [circleIdsKey, fetchCompetitions]);

  // Pull-to-refresh reads/writes the shared #main-content scroll container
  // (AppLayout's mainRef) — this screen renders no scroll pane of its own.
  // The ref-population effect must commit before usePullToRefresh's effect
  // runs, so it's declared first.
  const mainContentRef = useRef(null);
  useEffect(() => { mainContentRef.current = document.getElementById('main-content'); }, []);

  const refreshDashboard = useCallback(async () => {
    await refresh();
    await fetchCompetitions(circleIdsKey ? circleIdsKey.split(',') : []);
  }, [refresh, fetchCompetitions, circleIdsKey]);

  const pullToRefresh = usePullToRefresh(mainContentRef, refreshDashboard);

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
      <PullToRefreshIndicator progress={pullToRefresh.progress} refreshing={pullToRefresh.refreshing} />
      {/* Header */}
      <div style={{ background: 'var(--card)', borderBottom: '1px solid var(--rule)', padding: '20px 20px 16px' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              <span aria-hidden style={{ width: 4, height: 28, borderRadius: 2, background: 'var(--accent)', flexShrink: 0 }} />
              <h1 style={{ ...HEAD, fontSize: 'var(--fs-title)', color: 'var(--paper)', margin: 0, lineHeight: 1.15 }}>Home</h1>
            </div>
            <button
              onClick={openCreateClubhouse}
              title="Create a Clubhouse"
              aria-label="Create a Clubhouse"
              style={{
                flexShrink: 0, width: 'var(--tap)', height: 'var(--tap)', borderRadius: '50%',
                background: 'var(--accent-soft)', border: '1px solid var(--rule)',
                color: 'var(--accent)', fontSize: 'var(--fs-heading)', fontWeight: 700, lineHeight: 1,
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              +
            </button>
          </div>
          <p style={{ ...BODY, fontSize: 'var(--fs-body)', color: 'var(--mute)', lineHeight: 1.5, margin: '10px 0 0', maxWidth: 520 }}>
            Jump into any competition across every Clubhouse you are part of, or find a new one to join.
          </p>

          {myCircles.length > 0 && (
            <div style={{ display: 'flex', gap: 24, marginTop: 16 }}>
              <div>
                <div className="num" style={{ ...HEAD, fontSize: 'var(--fs-heading)', color: 'var(--paper)', lineHeight: 1 }}>{myCircles.length}</div>
                <div style={{ fontSize: 'var(--fs-label)', color: 'var(--mute)', marginTop: 2 }}>
                  {myCircles.length === 1 ? 'Clubhouse' : 'Clubhouses'}
                </div>
              </div>
              <div>
                <div className="num" style={{ ...HEAD, fontSize: 'var(--fs-heading)', color: 'var(--paper)', lineHeight: 1 }}>{totalComps}</div>
                <div style={{ fontSize: 'var(--fs-label)', color: 'var(--mute)', marginTop: 2 }}>Competitions</div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '22px 20px 0' }}>
        {loading && myCircles.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, ...BODY, fontSize: 'var(--fs-label)', color: 'var(--mute)' }}>
            Loading…
          </div>
        ) : (
          <>
            {myCircles.length > 0 && (
              <div style={{ marginBottom: 28 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <h2 style={{ margin: 0, fontSize: 'var(--fs-body)', fontWeight: 700, color: 'var(--paper)' }}>
                    Your Clubhouses
                  </h2>
                  {archivedCount > 0 && (
                    <button
                      onClick={() => setShowArchived(v => !v)}
                      style={{ minHeight: 'var(--tap)', padding: '0 4px', border: 'none', background: 'transparent', color: 'var(--mute)', ...BODY, fontSize: 'var(--fs-label)', cursor: 'pointer' }}
                    >
                      {showArchived ? '▾ Hide archived' : `▸ Show archived (${archivedCount})`}
                    </button>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {visibleCircles.map((circle, i) => (
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

            <div ref={findOrCreateRef} style={{ marginBottom: 28, scrollMarginTop: 20 }}>
              <h2 style={{ margin: '0 0 12px', fontSize: 'var(--fs-body)', fontWeight: 700, color: 'var(--paper)' }}>
                {myCircles.length > 0 ? 'Find another Clubhouse' : 'Get started'}
              </h2>
              <FindOrCreatePanel
                searchClubhouses={searchClubhouses}
                joinCircleByCode={joinCircleByCode}
                createCircle={createCircle}
                creating={creatingClubhouse}
                setCreating={setCreatingClubhouse}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
