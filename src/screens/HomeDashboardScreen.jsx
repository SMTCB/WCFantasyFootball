import { LoadingRows } from '../components/Skeleton';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useClubhouseContext } from '../context/ClubhouseContext';
import { useSport } from '../context/SportContext';
import { supabase } from '../lib/supabase';
import { useShowArchived } from '../hooks/useShowArchived';
import usePullToRefresh from '../hooks/usePullToRefresh';
import { useYourMove } from '../hooks/useYourMove';
import { YourMoveList } from '../components/YourMove';
import PullToRefreshIndicator from '../components/motion/PullToRefreshIndicator';
import { useViewport } from '../hooks/useViewport';
import { useLivePoints } from '../hooks/useLivePoints';
import { useMyLeaguePositions, summarisePositions } from '../hooks/useMyLeaguePositions';
import { ScoreTicker, HomeHeadline, LiveHero, NextDeadlineCard, WhereYouStand, AcrossYourClubhouses } from '../components/home/Matchday';
import { useRoomAcross, useRoomLatestByCircle, useUserNames } from '../hooks/useRoomPulse';
import { useCircleMembersAcross } from '../hooks/useCircleMembersAcross';
import ClubhouseCard from '../components/home/ClubhouseCard';
import { useHereNowAcross } from '../hooks/useHereNow';
import { useAuth } from '../hooks/useAuth';

const MONO = { fontFamily: 'Archivo, sans-serif' };
const HEAD = { fontFamily: 'Archivo Black, sans-serif' };
const BODY = { fontFamily: 'Archivo, sans-serif' };

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

// ── Main screen: the Matchday Home (MD-1) ────────────────────────────────────
// Headline across all your leagues, a live hero while one of your matches is on
// (else the next deadline), Your move labelled by clubhouse, "Where you stand",
// then the clubhouse cards and find/create. Beside "Where you stand", the latest
// Room lines from every clubhouse and who is in one right now (MD-10).
export default function HomeDashboardScreen() {
  const { myCircles, setActiveCircleId, searchClubhouses, joinCircleByCode, createCircle, loading, refresh } = useClubhouseContext();
  const { setActivePaddockId, setActivePlayerBoxId } = useSport();
  const navigate = useNavigate();
  const move = useYourMove();
  const { isMobile, isDesktop } = useViewport();
  const twoColumns = isDesktop;

  const [compsByCircle, setCompsByCircle] = useState({});
  const [compsLoaded, setCompsLoaded] = useState(false);
  const [creatingClubhouse, setCreatingClubhouse] = useState(false);
  const findOrCreateRef = useRef(null);
  const circleIdsKey = myCircles.map(c => c.id).join(',');
  const [showArchived, setShowArchived] = useShowArchived('ffl_show_archived_clubhouses');
  const archivedCount = myCircles.filter(c => c.archived).length;
  const visibleCircles = showArchived ? myCircles : myCircles.filter(c => !c.archived);
  const activeCircles = useMemo(() => myCircles.filter(c => !c.archived), [myCircles]);

  const live = useLivePoints();
  const refreshLive = live.refresh;
  const { positions, loading: positionsLoading, refresh: refreshPositions } = useMyLeaguePositions(activeCircles, compsByCircle);
  const summary = useMemo(() => summarisePositions(positions), [positions]);

  const { user } = useAuth();
  const activeIds = useMemo(() => activeCircles.map(c => c.id), [activeCircles]);
  const roomAcross = useRoomAcross(activeIds, { limit: 6 });
  const refreshAcross = roomAcross.refresh;
  const hereByCircle = useHereNowAcross(activeIds);
  const friendIdsHere = useMemo(() => {
    const ids = new Set();
    hereByCircle.forEach(set => set.forEach(id => { if (id !== user?.id) ids.add(id); }));
    return [...ids];
  }, [hereByCircle, user?.id]);
  const friendNames = useUserNames(friendIdsHere);
  const visibleIds = useMemo(() => visibleCircles.map(c => c.id), [visibleCircles]);
  const membersAcross = useCircleMembersAcross(visibleIds);
  const refreshMembers = membersAcross.refresh;
  const latestByCircle = useRoomLatestByCircle(visibleIds);
  const refreshLatest = latestByCircle.refresh;

  function openCreateClubhouse() {
    setCreatingClubhouse(true);
    findOrCreateRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  const fetchCompetitions = useCallback(async (ids) => {
    if (!ids.length) { setCompsByCircle({}); setCompsLoaded(true); return; }
    const results = await Promise.all(ids.map(id => supabase.rpc('get_clubhouse_competitions', { p_circle_id: id })));
    const next = {};
    ids.forEach((id, i) => {
      const res = results[i];
      if (!res.error && !res.data?.error) next[id] = res.data ?? { football: [], f1: [], tennis: [] };
      else next[id] = { football: [], f1: [], tennis: [] };
    });
    setCompsByCircle(next);
    setCompsLoaded(true);
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
    await Promise.all([
      fetchCompetitions(circleIdsKey ? circleIdsKey.split(',') : []),
      refreshLive(),
      refreshPositions(),
    ]);
    refreshAcross();
    refreshMembers();
    refreshLatest();
  }, [refresh, fetchCompetitions, circleIdsKey, refreshLive, refreshPositions, refreshAcross, refreshMembers, refreshLatest]);

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

  function openPosition(p) {
    enterCompetition({ id: p.circleId }, { id: p.leagueId }, p.sport);
  }

  const circleNames = useMemo(() => Object.fromEntries(myCircles.map(c => [c.id, c.name])), [myCircles]);
  // Football league id → clubhouse name, for the live hero's league chips.
  const circleByLeague = useMemo(() => {
    const out = {};
    for (const c of myCircles) for (const l of (compsByCircle[c.id]?.football ?? [])) out[l.id] = c.name;
    return out;
  }, [myCircles, compsByCircle]);
  const positionByLeague = useMemo(
    () => Object.fromEntries(positions.filter(p => p.sport === 'football').map(p => [p.leagueId, p])),
    [positions],
  );

  const liveLeagues = useMemo(
    () => live.leagues.filter(l => l.hasLive).sort((a, b) => b.liveCount - a.liveCount),
    [live.leagues],
  );
  const liveLeagueIds = useMemo(() => new Set(liveLeagues.map(l => l.leagueId)), [liveLeagues]);
  const liveByLeague = useMemo(() => Object.fromEntries(live.leagues.map(l => [l.leagueId, l])), [live.leagues]);
  const deadlineLeagues = useMemo(() => {
    const ids = new Set(live.nextDeadline?.leagueIds ?? []);
    return positions.filter(p => p.sport === 'football' && ids.has(p.leagueId));
  }, [live.nextDeadline, positions]);

  const headlineReady = compsLoaded && !positionsLoading;
  const gutter = isMobile ? 16 : 24;

  const hero = liveLeagues.length > 0 ? (
    <LiveHero
      leagues={liveLeagues}
      fixtures={live.liveFixtures}
      positionByLeague={positionByLeague}
      circleByLeague={circleByLeague}
      isMobile={isMobile}
    />
  ) : live.nextDeadline ? (
    <NextDeadlineCard nextDeadline={live.nextDeadline} leagues={deadlineLeagues} onOpen={openPosition} />
  ) : null;

  const standings = (
    <WhereYouStand positions={positions} liveLeagueIds={liveLeagueIds} onOpen={openPosition} />
  );

  const hereNow = activeCircles
    .map(c => ({
      circleId: c.id,
      circleName: c.name,
      names: [...(hereByCircle.get(c.id) ?? [])].filter(id => id !== user?.id).map(id => friendNames.get(id)).filter(Boolean),
    }))
    .filter(h => h.names.length > 0);
  const hasAcross = roomAcross.items.length > 0 || hereNow.length > 0;
  const across = hasAcross && (
    <AcrossYourClubhouses
      items={roomAcross.items}
      here={hereNow}
      circleNames={circleNames}
      onOpen={(circleId, msgId) => {
        setActiveCircleId(circleId);
        navigate(`/clubhouse/${circleId}?tab=room${msgId ? `&msg=${msgId}` : ''}`);
      }}
    />
  );

  const clubhouses = myCircles.length > 0 && (
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? 12 : 14 }}>
        {visibleCircles.map(circle => (
          <ClubhouseCard
            key={circle.id}
            circle={circle}
            comps={compsByCircle[circle.id]}
            members={membersAcross.byCircle ? (membersAcross.byCircle.get(circle.id) ?? []) : null}
            meId={user?.id}
            hereIds={hereByCircle.get(circle.id)}
            latest={latestByCircle.byCircle.get(circle.id) ?? null}
            positions={positions.filter(p => p.circleId === circle.id)}
            liveByLeague={liveByLeague}
            compact={isMobile}
            onEnter={() => enterClubhouse(circle)}
            onEnterCompetition={enterCompetition}
            onOpenRoom={msgId => {
              setActiveCircleId(circle.id);
              navigate(`/clubhouse/${circle.id}?tab=room${msgId ? `&msg=${msgId}` : ''}`);
            }}
          />
        ))}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', border: '1.5px dashed var(--rule)', borderRadius: isMobile ? 16 : 18, padding: isMobile ? 16 : '18px 22px' }}>
          <div style={{ flex: 1, minWidth: 180 }}>
            <b style={{ display: 'block', ...BODY, fontWeight: 800, fontSize: 'var(--fs-body)', color: 'var(--paper)' }}>Another group of friends?</b>
            <p style={{ margin: '2px 0 0', ...BODY, fontSize: 'var(--fs-label)', color: 'var(--text-2)' }}>
              {isMobile ? 'Start one, or join with a code.' : 'Start a clubhouse for them, or join one with an invite code.'}
            </p>
          </div>
          <button
            onClick={openCreateClubhouse}
            style={{ minHeight: 'var(--tap)', padding: '0 16px', background: 'var(--paper)', color: 'var(--card)', border: 'none', borderRadius: 999, ...BODY, fontSize: 'var(--fs-label)', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}
          >
            Start or join
          </button>
        </div>
      </div>
    </div>
  );

  const findPanel = (
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
  );

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', paddingBottom: 40 }}>
      <PullToRefreshIndicator progress={pullToRefresh.progress} refreshing={pullToRefresh.refreshing} />
      <ScoreTicker fixtures={live.liveFixtures} />

      <div style={{ maxWidth: 1180, margin: '0 auto', padding: `${isMobile ? 4 : 24}px ${gutter}px 0` }}>
        {loading && myCircles.length === 0 ? (
          <div style={{ padding: '24px 0' }}><LoadingRows rows={4} /></div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0, minHeight: isMobile ? 120 : 160 }}>
                {headlineReady && (
                  <HomeHeadline
                    summary={summary}
                    clubhouseCount={activeCircles.length}
                    liveLeagueCount={liveLeagues.length}
                    isMobile={isMobile}
                  />
                )}
              </div>
              <button
                onClick={openCreateClubhouse}
                title="Create a Clubhouse"
                aria-label="Create a Clubhouse"
                style={{
                  flexShrink: 0, marginTop: isMobile ? 14 : 0, width: 'var(--tap)', height: 'var(--tap)', borderRadius: '50%',
                  background: 'var(--accent-soft)', border: '1px solid var(--rule)',
                  color: 'var(--accent)', fontSize: 'var(--fs-heading)', fontWeight: 700, lineHeight: 1,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                +
              </button>
            </div>

            {twoColumns && (positions.length > 0 || hasAcross) ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 340px', gap: 28, alignItems: 'start', marginTop: 20 }}>
                <div style={{ minWidth: 0 }}>
                  {hero && <div style={{ marginBottom: 28 }}>{hero}</div>}
                  <YourMoveList move={move} circleNames={circleNames} />
                  {clubhouses}
                  {findPanel}
                </div>
                <aside style={{ position: 'sticky', top: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {positions.length > 0 && standings}
                  {across}
                </aside>
              </div>
            ) : (
              <div style={{ marginTop: 16 }}>
                {hero && <div style={{ marginBottom: 24 }}>{hero}</div>}
                <YourMoveList move={move} circleNames={circleNames} />
                {positions.length > 0 && <div style={{ marginBottom: 28 }}>{standings}</div>}
                {across && <div style={{ marginBottom: 28 }}>{across}</div>}
                {clubhouses}
                {findPanel}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
