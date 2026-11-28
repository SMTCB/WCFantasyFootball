import { LoadingRows } from '../../components/Skeleton';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePaddock } from '../../hooks/f1/usePaddock';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import { useShowArchived } from '../../hooks/useShowArchived';
import { ArchivedBadge } from '../../components/league/LeagueBadges';
import CompetitionSettingsModal from '../../components/shared/CompetitionSettingsModal';
import { useNow, picksLockAt, picksLocked, formatCountdown, formatWhen } from '../../lib/f1/f1-data';
import { CircuitMark, GearIcon } from '../../components/f1/F1Kit';

export default function PaddockLobbyScreen() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { myPaddocks, loading, createPaddock, joinPaddockByCode, setActivePaddockId, refresh: refreshPaddocks } = usePaddock();
  const now = useNow(30000);

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(null); // 'create' | 'join' | null
  const [err, setErr] = useState({ create: '', join: '' });
  const [copied, setCopied] = useState(null);
  const [myCircles, setMyCircles] = useState([]);
  const [selectedCircleId, setSelectedCircleId] = useState(null);
  const [showArchived, setShowArchived] = useShowArchived('ffl_show_archived_paddocks');
  const [settingsPaddock, setSettingsPaddock] = useState(null);
  const [nextRace, setNextRace] = useState(null);
  const [picksIn, setPicksIn] = useState(false);
  const [standing, setStanding] = useState({}); // paddock_id -> { rank, pts }

  const archivedCount = myPaddocks.filter(p => p.archived).length;
  const visiblePaddocks = showArchived ? myPaddocks : myPaddocks.filter(p => !p.archived);
  const paddockKey = myPaddocks.map(p => p.paddock_id).join(',');

  useEffect(() => {
    supabase.rpc('get_my_circles').then(({ data }) => {
      if (data?.length) setMyCircles(data);
    });
  }, []);

  // The next race, and whether this user's picks are in (picks are per user, shared by all their leagues).
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    supabase.from('f1_races').select('round_number, gp_name, race_at, status, is_manual_unlock')
      .eq('season', 2026).neq('status', 'finished').order('round_number').limit(1)
      .then(async ({ data }) => {
        const race = data?.[0] ?? null;
        if (cancelled) return;
        setNextRace(race);
        if (!race) return;
        const { data: bet } = await supabase.from('f1_bets_race').select('round_number')
          .eq('user_id', user.id).eq('season', 2026).eq('round_number', race.round_number).maybeSingle();
        if (!cancelled) setPicksIn(!!bet);
      });
    return () => { cancelled = true; };
  }, [user?.id]);

  // My place in each league, for the card.
  useEffect(() => {
    if (!user?.id || !paddockKey) return;
    let cancelled = false;
    Promise.all(paddockKey.split(',').map(id =>
      supabase.rpc('get_paddock_leaderboard', { p_paddock_id: id }).then(({ data }) => {
        const me = (data ?? []).find(r => r.user_id === user.id);
        return [id, me ? { rank: me.rank, pts: me.total_points ?? 0 } : null];
      }),
    )).then(entries => { if (!cancelled) setStanding(Object.fromEntries(entries)); });
    return () => { cancelled = true; };
  }, [paddockKey, user?.id]);

  async function handleCreate(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy('create'); setErr(x => ({ ...x, create: '' }));
    try {
      const id = await createPaddock(name.trim(), selectedCircleId ?? undefined);
      navigate(`/f1/${id}`);
    } catch (e) {
      setErr(x => ({ ...x, create: e.message === 'F1_SPORT_NOT_FOUND' ? 'F1 is not set up yet. Ask the admin.' : e.message }));
    } finally { setBusy(null); }
  }

  async function handleJoin(e) {
    e.preventDefault();
    if (!code.trim()) return;
    setBusy('join'); setErr(x => ({ ...x, join: '' }));
    try {
      const id = await joinPaddockByCode(code.trim());
      navigate(`/f1/${id}`);
    } catch (e) {
      setErr(x => ({ ...x, join: e.message === 'PADDOCK_NOT_FOUND' ? 'No league has that code. Check it and try again.' : e.message }));
    } finally { setBusy(null); }
  }

  function enterPaddock(id) {
    setActivePaddockId(id);
    navigate(`/f1/${id}`);
  }

  function copyCode(c) {
    navigator.clipboard?.writeText(c);
    setCopied(c);
    setTimeout(() => setCopied(null), 2000);
  }

  const lockAt = nextRace ? picksLockAt(nextRace) : null;
  const locked = nextRace ? picksLocked(nextRace, new Date(now)) : false;
  const countdown = lockAt && !locked ? formatCountdown(lockAt.getTime() - now) : null;
  const showCreate = creating || (!loading && myPaddocks.length === 0);

  return (
    <div className="f1-screen">
      <div className="sport-col f1-body">
        <header style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <CircuitMark />
          <div style={{ minWidth: 0 }}>
            <div className="f1-eb">Formula 1 · 2026</div>
            <h1 className="f1-h" style={{ fontSize: 'var(--fs-title)', marginTop: 2 }}>Your F1 leagues</h1>
          </div>
        </header>

        {nextRace && (
          <section className="f1-live" aria-label="Next race"
            style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ minWidth: 0 }}>
              <div className="f1-eb" style={{ color: 'var(--f1-navy-mute)' }}>Next · R{nextRace.round_number}</div>
              <div style={{ fontWeight: 700, fontSize: 'var(--fs-body-lg)', color: 'var(--on-accent)', marginTop: 2 }}>{nextRace.gp_name}</div>
              <div className="f1-mono" style={{ fontSize: 'var(--fs-micro)', color: 'var(--f1-navy-mute)', marginTop: 2 }}>
                {locked ? 'Picks are locked' : lockAt ? `Picks lock ${formatWhen(lockAt)}` : 'Lock time to be confirmed'}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {countdown && <span className="f1-mono" style={{ fontSize: 'var(--fs-body)', fontWeight: 600, color: 'var(--on-accent)' }}>{countdown}</span>}
              {!locked && <span className={`f1-pill ${picksIn ? 'done' : 'red'}`}>{picksIn ? 'Picks in' : 'Picks due'}</span>}
            </div>
          </section>
        )}

        <div className="sport-split">
          <div className="sport-main" style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
            {loading ? (
              <div className="f1-card" style={{ padding: 16 }}><LoadingRows rows={3} /></div>
            ) : myPaddocks.length === 0 ? (
              <div className="f1-card" style={{ padding: '28px 16px', textAlign: 'center', color: 'var(--text-2)', fontSize: 'var(--fs-body)' }}>
                You are not in an F1 league yet. Join one with a code, or create your own.
              </div>
            ) : (
              <>
                <div className="sport-cards" style={{ gap: 12 }}>
                  {visiblePaddocks.map(p => {
                    const s = standing[p.paddock_id];
                    return (
                      <div key={p.paddock_id} className="f1-card" style={{ overflow: 'hidden', opacity: p.archived ? 0.75 : 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px' }}>
                          <CircuitMark width={38} height={28} />
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ fontWeight: 800, fontSize: 'var(--fs-body-lg)', color: 'var(--paper)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                              {p.archived && <ArchivedBadge />}
                            </div>
                            <div style={{ fontSize: 'var(--fs-micro)', color: 'var(--mute)', marginTop: 2 }}>
                              {p.member_count} {p.member_count === 1 ? 'member' : 'members'}{p.role === 'owner' ? ' · you run it' : ''}
                            </div>
                          </div>
                          {p.role === 'owner' && (
                            <button type="button" className="f1-ib" aria-label={`${p.name} settings`} onClick={() => setSettingsPaddock(p)}><GearIcon /></button>
                          )}
                        </div>

                        <div className="f1-kv first" style={{ gridTemplateColumns: 'minmax(0,1fr) auto' }}>
                          <span style={{ fontSize: 'var(--fs-label)', color: 'var(--text-2)' }}>
                            {s ? <>You are <b style={{ color: 'var(--paper)' }}>P{s.rank}</b> of {p.member_count}</> : 'No points yet'}
                          </span>
                          <span className="v">{s ? `${s.pts} PTS` : '—'}</span>
                        </div>

                        <div style={{ display: 'flex', gap: 8, padding: '12px 16px 14px', borderTop: '1px solid var(--elev)' }}>
                          <button type="button" className="f1-btn2" onClick={() => copyCode(p.invite_code)}
                            aria-label={`Copy invite code ${p.invite_code}`} style={{ flex: 1, minHeight: 42 }}>
                            <span className="f1-mono" style={{ letterSpacing: '.12em' }}>{copied === p.invite_code ? 'Copied' : p.invite_code}</span>
                          </button>
                          <button type="button" className="f1-btn" onClick={() => enterPaddock(p.paddock_id)} style={{ flex: 1, minHeight: 42 }}>
                            Open
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {archivedCount > 0 && (
                  <button type="button" className="f1-link" onClick={() => setShowArchived(v => !v)} style={{ alignSelf: 'flex-start' }}>
                    {showArchived ? 'Hide archived' : `Show archived (${archivedCount})`}
                  </button>
                )}
              </>
            )}
          </div>

          <div className="sport-aside" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <form onSubmit={handleJoin} className="f1-card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <label htmlFor="f1-join-code" className="f1-eb">Join with a code</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  id="f1-join-code"
                  className="f1-input code"
                  value={code}
                  onChange={e => setCode(e.target.value.toUpperCase())}
                  placeholder="League code"
                  maxLength={8}
                  autoComplete="off"
                  style={{ flex: 1, minWidth: 0 }}
                />
                <button type="submit" className="f1-btn" disabled={busy === 'join' || code.trim().length < 6} style={{ flex: 'none', width: 'auto', padding: '0 18px' }}>
                  {busy === 'join' ? 'Joining…' : 'Join'}
                </button>
              </div>
              {err.join && <div className="f1-note red" role="alert">{err.join}</div>}
            </form>

            {showCreate ? (
              <form onSubmit={handleCreate} className="f1-card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <label htmlFor="f1-new-name" className="f1-eb">Create a league</label>
                <input
                  id="f1-new-name"
                  className="f1-input"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="League name"
                  maxLength={40}
                />
                {myCircles.length > 0 && (
                  <select
                    className="f1-select"
                    aria-label="Clubhouse"
                    value={selectedCircleId ?? ''}
                    onChange={e => setSelectedCircleId(e.target.value || null)}
                  >
                    <option value="">No clubhouse</option>
                    {myCircles.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                )}
                {err.create && <div className="f1-note red" role="alert">{err.create}</div>}
                <div style={{ display: 'flex', gap: 8 }}>
                  {myPaddocks.length > 0 && (
                    <button type="button" className="f1-btn2" onClick={() => setCreating(false)} style={{ flex: 'none' }}>Cancel</button>
                  )}
                  <button type="submit" className="f1-btn" disabled={busy === 'create' || !name.trim()} style={{ flex: 1 }}>
                    {busy === 'create' ? 'Creating…' : 'Create league'}
                  </button>
                </div>
              </form>
            ) : (
              <button type="button" className="f1-btn2" onClick={() => setCreating(true)}>Create a league</button>
            )}
          </div>
        </div>

        {settingsPaddock && (
          <CompetitionSettingsModal
            competitionType="paddock"
            competitionId={settingsPaddock.paddock_id}
            name={settingsPaddock.name}
            archived={settingsPaddock.archived}
            archivedAt={settingsPaddock.archived_at}
            onUpdated={refreshPaddocks}
            onClose={() => setSettingsPaddock(null)}
          />
        )}
      </div>
    </div>
  );
}
