import { useState, useEffect, useRef } from 'react';
import { domToPng } from 'modern-screenshot';
import RecapCard from '../components/RecapCard';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';

// ── helpers ──────────────────────────────────────────────────────────────────

const MONO    = "'JetBrains Mono', monospace";
const DISPLAY = "'Archivo Black', sans-serif";
const BODY    = "'Archivo', sans-serif";

function timeAgo(iso) {
  const diff = Math.floor((Date.now() - new Date(iso)) / 1000);
  if (diff < 60)    return `${diff}s ago`;
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// ── DigestCard ────────────────────────────────────────────────────────────────

function DigestCard({ entry, onViewRecap }) {
  return (
    <div style={{
      borderBottom: '1px solid rgba(255,255,255,.07)',
      padding: '16px 20px',
    }}>
      {/* top row: badge + time + league name */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <span style={{
            fontFamily: MONO, fontSize: 8, letterSpacing: '.18em',
            padding: '2px 5px', border: '1px solid var(--positive)',
            color: 'var(--positive)',
          }}>SCORES</span>
          <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)' }}>
            {timeAgo(entry.published_at)}
          </span>
        </div>
        <span style={{
          fontFamily: MONO, fontSize: 8, letterSpacing: '.14em',
          color: 'var(--cyan)', padding: '2px 6px',
          border: '1px solid rgba(0,180,216,.3)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          maxWidth: 200,
        }}>
          {(entry.leagues?.name || '').toUpperCase()}
        </span>
      </div>

      {/* headline */}
      <div style={{
        fontFamily: BODY, fontSize: 13, fontWeight: 700,
        color: 'var(--paper)', lineHeight: 1.35,
        marginBottom: Array.isArray(entry.bullets) && entry.bullets.length ? 8 : 0,
      }}>
        {entry.headline}
      </div>

      {/* bullets */}
      {Array.isArray(entry.bullets) && entry.bullets.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 10 }}>
          {entry.bullets.map((b, i) => (
            <div key={i} style={{
              fontFamily: MONO, fontSize: 9, color: 'var(--mute)',
              letterSpacing: '.1em', lineHeight: 1.4,
            }}>
              {b}
            </div>
          ))}
        </div>
      )}

      {/* my recap CTA */}
      <button
        onClick={() => onViewRecap(entry.league_id, entry.full_data?.matchday_id)}
        style={{
          fontFamily: MONO, fontSize: 9, letterSpacing: '.18em',
          color: 'var(--gold)', background: 'transparent',
          border: '1px solid rgba(240,180,0,.35)', padding: '4px 10px',
          cursor: 'pointer', marginTop: 2,
        }}
      >
        MY RECAP ↗
      </button>
    </div>
  );
}

// ── Personal recap view (drill-in) ────────────────────────────────────────────

function PersonalRecapView({ leagueId, matchdayId, leagues, user, onBack }) {
  const [recap,   setRecap]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [copied,  setCopied]  = useState(false);
  const cardRef = useRef(null);

  useEffect(() => {
    if (!leagueId || !user?.id) return;
    fetchRecap();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueId, matchdayId]);

  const fetchRecap = async () => {
    try {
      setLoading(true);
      const userId     = user.id;
      const leagueInfo = leagues.find(l => l.league_id === leagueId) ?? null;
      const tournamentId = leagueInfo?.tournament_id ?? null;

      let squadQuery = supabase.from('squads')
        .select('id, matchday_id, players, captain_id, joker_player_id, is_triple_captain')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1);
      if (tournamentId) squadQuery = squadQuery.eq('tournament_id', tournamentId);

      const [{ data: squadRow }, { data: memberRow }] = await Promise.all([
        squadQuery.maybeSingle(),
        supabase.from('league_members')
          .select('league_id, rank, total_points, leagues(name, tournament_id)')
          .eq('user_id', userId).eq('league_id', leagueId).maybeSingle(),
      ]);

      if (!squadRow) { setLoading(false); return; }

      const resolvedMatchdayId = matchdayId ?? squadRow.matchday_id ?? (() => {
        // fallback: most recent deadline
        return null;
      })();

      const playerIds = squadRow.players || [];
      const captainId = squadRow.captain_id;
      const jokerId   = squadRow.joker_player_id ?? null;

      const { data: fixtures } = await supabase.from('fixtures')
        .select('id').eq('status', 'finished').like('id', `${resolvedMatchdayId}%`);
      const finishedIds = (fixtures || []).map(f => f.id);

      const [{ data: statsRows }, { data: playerRows }, { data: userRow }] = await Promise.all([
        finishedIds.length
          ? supabase.from('player_match_stats')
              .select('player_id, fantasy_points, fixture_id')
              .in('player_id', playerIds).in('fixture_id', finishedIds)
          : { data: [] },
        supabase.from('players').select('id, name, position, club').in('id', playerIds),
        supabase.from('users').select('username').eq('id', userId).maybeSingle(),
      ]);

      const pointsMap = {};
      for (const s of statsRows || []) {
        pointsMap[s.player_id] = (pointsMap[s.player_id] || 0) + Number(s.fantasy_points);
      }
      const playerMap = Object.fromEntries((playerRows || []).map(p => [p.id, p]));

      const effectivePoints = (pid) => {
        const base = pointsMap[pid] || 0;
        let mult = 1;
        if (pid === captainId) mult = 2;
        if (pid === jokerId)   mult = mult === 2 ? 4 : 2;
        return base * mult;
      };

      const startingIds = playerIds.slice(0, 11);
      let bestPlayerId = null, bestPts = -Infinity;
      for (const pid of startingIds) {
        const pts = effectivePoints(pid);
        if (pts > bestPts) { bestPts = pts; bestPlayerId = pid; }
      }

      const { data: fpRow } = await supabase.from('fantasy_points')
        .select('total').eq('squad_id', squadRow.id)
        .eq('matchday_id', resolvedMatchdayId).maybeSingle();
      const totalPoints = fpRow?.total ?? Object.values(pointsMap).reduce((s, v) => s + v, 0);

      const username   = userRow?.username ?? user?.user_metadata?.username ?? 'Manager';
      const rank       = memberRow?.rank ?? leagueInfo?.rank ?? null;
      const leagueName = memberRow?.leagues?.name ?? leagueInfo?.name ?? 'My League';
      const r = rank;
      const rankLabel  = r === 1 ? '1st' : r === 2 ? '2nd' : r === 3 ? '3rd' : r ? `${r}th` : '—';

      setRecap({
        matchday: resolvedMatchdayId ? String(resolvedMatchdayId).toUpperCase() : '—',
        leagueName, username, rank, rankLabel,
        points: Math.round(totalPoints),
        bestPlayer: bestPlayerId && playerMap[bestPlayerId]
          ? { ...playerMap[bestPlayerId], points: effectivePoints(bestPlayerId) } : null,
        captain: captainId && playerMap[captainId]
          ? { ...playerMap[captainId], points: pointsMap[captainId] ?? 0 } : null,
        joker: jokerId && playerMap[jokerId]
          ? { ...playerMap[jokerId], points: effectivePoints(jokerId) } : null,
        isTripleCap: squadRow?.is_triple_captain ?? false,
        topScorers: startingIds
          .map(id => ({ ...playerMap[id], points: effectivePoints(id) }))
          .filter(p => p.name && p.points > 0)
          .sort((a, b) => b.points - a.points)
          .slice(0, 5),
        date: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
      });
    } catch (err) {
      console.error('[PersonalRecap] fetch error', err);
    } finally {
      setLoading(false);
    }
  };

  const generateImage = async () => {
    if (!cardRef.current) return null;
    setSharing(true);
    try { return await domToPng(cardRef.current, { scale: 3, backgroundColor: '#0D0D0D' }); }
    finally { setSharing(false); }
  };

  const handleSaveImage = async () => {
    const dataUrl = await generateImage();
    if (!dataUrl) return;
    const link = document.createElement('a');
    link.download = `forza-recap-${recap.matchday}.png`;
    link.href = dataUrl; link.click();
  };

  const handleShareNative = async () => {
    const dataUrl = await generateImage();
    if (!dataUrl) return;
    const blob = await (await fetch(dataUrl)).blob();
    const file  = new File([blob], `forza-recap-${recap.matchday}.png`, { type: 'image/png' });
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: `Forza Fantasy League — ${recap.matchday} Recap` }); }
      catch (e) { if (e.name !== 'AbortError') console.error(e); }
    } else {
      try {
        await navigator.clipboard.writeText(
          `I scored ${recap.points} pts in ${recap.matchday} of Forza Fantasy League! Rank: ${recap.rankLabel} in ${recap.leagueName}.`
        );
        setCopied(true); setTimeout(() => setCopied(false), 2500);
      } catch (err) { console.error(err); }
    }
  };

  const pts = (val) => val != null ? `${val} pts` : '— pts';

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {/* back bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '10px 20px', borderBottom: '1px solid rgba(255,255,255,.07)',
        background: 'var(--ink)', flexShrink: 0,
      }}>
        <button onClick={onBack} style={{
          fontFamily: MONO, fontSize: 9, letterSpacing: '.18em',
          color: 'var(--mute)', background: 'none', border: 'none', cursor: 'pointer',
        }}>← BACK TO DIGEST</button>
        {recap && (
          <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)', letterSpacing: '.14em' }}>
            {recap.leagueName.toUpperCase()} · {recap.matchday}
          </span>
        )}
      </div>

      {loading ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--mute)', letterSpacing: '.2em' }}>LOADING…</span>
        </div>
      ) : !recap ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 24px', textAlign: 'center' }}>
          <div style={{ fontFamily: MONO, fontSize: 11, color: 'var(--mute)', letterSpacing: '.18em' }}>NO SQUAD DATA</div>
        </div>
      ) : (
        <div style={{ flex: 1, overflow: 'auto' }}>
          {/* Hero rank */}
          <div style={{ padding: '32px 24px', borderBottom: '1px solid rgba(255,255,255,.07)', textAlign: 'center', background: '#0a0a0a' }}>
            <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.2em', color: 'var(--mute)', marginBottom: 4 }}>{recap.username}</div>
            <div style={{ fontFamily: DISPLAY, fontSize: 72, lineHeight: 1, color: 'var(--paper)' }}>{recap.rankLabel}</div>
            <div style={{ fontFamily: DISPLAY, fontSize: 24, color: 'var(--positive)', marginTop: 12 }}>{recap.points} pts</div>
          </div>

          {/* stat rows */}
          <div style={{ borderBottom: '1px solid rgba(255,255,255,.07)' }}>
            {recap.bestPlayer && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,.04)' }}>
                <div>
                  <div style={{ fontFamily: MONO, fontSize: 8, color: 'var(--mute)', letterSpacing: '.15em', marginBottom: 3 }}>BEST PLAYER</div>
                  <div style={{ fontFamily: DISPLAY, fontSize: 14 }}>{recap.bestPlayer.name}</div>
                </div>
                <div style={{ fontFamily: DISPLAY, fontSize: 13, color: 'var(--paper)', background: 'rgba(255,255,255,.1)', padding: '4px 10px' }}>
                  {pts(recap.bestPlayer.points)}
                </div>
              </div>
            )}
            {recap.captain && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,.04)' }}>
                <div>
                  <div style={{ fontFamily: MONO, fontSize: 8, color: 'var(--mute)', letterSpacing: '.15em', marginBottom: 3 }}>CAPTAIN</div>
                  <div style={{ fontFamily: DISPLAY, fontSize: 14 }}>{recap.captain.name}</div>
                </div>
                <div style={{ fontFamily: DISPLAY, fontSize: 13, color: 'var(--gold)', background: 'rgba(240,180,0,.1)', padding: '4px 10px' }}>
                  ×{recap.isTripleCap ? 3 : 2} = {recap.captain.points * (recap.isTripleCap ? 3 : 2)} pts
                </div>
              </div>
            )}
            {recap.joker && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,.04)' }}>
                <div>
                  <div style={{ fontFamily: MONO, fontSize: 8, color: 'var(--mute)', letterSpacing: '.15em', marginBottom: 3 }}>JOKER PLAYED</div>
                  <div style={{ fontFamily: DISPLAY, fontSize: 14 }}>{recap.joker.name}</div>
                </div>
                <div style={{ fontFamily: DISPLAY, fontSize: 13, color: 'var(--purple)', background: 'rgba(140,80,200,.12)', padding: '4px 10px' }}>
                  {pts(recap.joker.points)}
                </div>
              </div>
            )}
            {recap.topScorers?.length > 0 && (
              <div style={{ padding: '14px 20px' }}>
                <div style={{ fontFamily: MONO, fontSize: 8, color: 'var(--mute)', letterSpacing: '.15em', marginBottom: 10 }}>TOP SCORERS</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {recap.topScorers.map((p, i) => (
                    <div key={p.id ?? i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                        <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)', width: 14 }}>{i + 1}</span>
                        <span style={{ fontFamily: DISPLAY, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                        <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)', flexShrink: 0 }}>{p.position}</span>
                      </div>
                      <span style={{ fontFamily: DISPLAY, fontSize: 13, color: 'var(--positive)', flexShrink: 0, marginLeft: 8 }}>+{p.points}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* share */}
          <div style={{ padding: '20px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <button
                onClick={handleShareNative} disabled={sharing}
                style={{ gridColumn: '1 / -1', padding: '14px', background: 'var(--positive)', color: '#000', fontFamily: MONO, fontSize: 11, letterSpacing: '.18em', fontWeight: 700, cursor: 'pointer', border: 'none' }}
              >
                {sharing ? 'GENERATING…' : copied ? 'COPIED ✓' : '📱 SHARE RECAP'}
              </button>
              <button
                onClick={handleSaveImage} disabled={sharing}
                style={{ padding: '12px', background: 'transparent', border: '1px solid rgba(255,255,255,.1)', color: 'var(--paper)', fontFamily: MONO, fontSize: 10, letterSpacing: '.15em', cursor: 'pointer' }}
              >
                💾 SAVE IMAGE
              </button>
              <button
                onClick={async () => {
                  await navigator.clipboard.writeText(
                    `I scored ${recap.points} pts in ${recap.matchday} — ${recap.rankLabel} in ${recap.leagueName}. #ForzaFantasyLeague`
                  );
                  setCopied(true); setTimeout(() => setCopied(false), 2500);
                }}
                style={{ padding: '12px', background: 'transparent', border: '1px solid rgba(255,255,255,.1)', color: 'var(--paper)', fontFamily: MONO, fontSize: 10, letterSpacing: '.15em', cursor: 'pointer' }}
              >
                {copied ? 'COPIED ✓' : '📋 COPY TEXT'}
              </button>
            </div>
          </div>

          {/* off-screen shareable card */}
          <div style={{ position: 'absolute', left: -9999, top: 0, opacity: 0, pointerEvents: 'none' }} aria-hidden>
            <RecapCard recap={recap} forwardRef={cardRef} />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main: RecapScreen ─────────────────────────────────────────────────────────

export default function RecapScreen() {
  const { user } = useAuth();
  const [entries,  setEntries]  = useState([]);
  const [leagues,  setLeagues]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [drillIn,  setDrillIn]  = useState(null);   // { leagueId, matchdayId } | null

  // Load all user's leagues + gazette activity entries in parallel
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    setLoading(true);

    const since = new Date(Date.now() - 7 * 86400000).toISOString();

    Promise.all([
      supabase
        .from('league_members')
        .select('league_id, rank, leagues(name, tournament_id)')
        .eq('user_id', user.id),
      supabase
        .from('gazette_entries')
        .select('id, league_id, headline, bullets, full_data, published_at, leagues(name)')
        .eq('entry_type', 'activity')
        .gte('published_at', since)
        .order('published_at', { ascending: false }),
    ]).then(([{ data: memberRows }, { data: gazetteRows }]) => {
      if (cancelled) return;
      const leagueList = (memberRows ?? []).map(r => ({
        league_id:     r.league_id,
        name:          r.leagues?.name ?? 'Unknown League',
        tournament_id: r.leagues?.tournament_id ?? null,
        rank:          r.rank,
      }));
      setLeagues(leagueList);
      setEntries(gazetteRows ?? []);
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [user?.id]);

  // ── Drill-in to personal recap ─────────────────────────────────────────────
  if (drillIn) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <PersonalRecapView
          leagueId={drillIn.leagueId}
          matchdayId={drillIn.matchdayId}
          leagues={leagues}
          user={user}
          onBack={() => setDrillIn(null)}
        />
      </div>
    );
  }

  // ── Digest view (default) ──────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--ink)' }}>
      {/* header */}
      <div style={{
        padding: '16px 20px 12px',
        borderBottom: '1px solid rgba(255,255,255,.07)',
        flexShrink: 0,
      }}>
        <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.2em', color: 'var(--mute)', marginBottom: 4 }}>
          LAST 7 DAYS · ALL LEAGUES
        </div>
        <div style={{ fontFamily: DISPLAY, fontSize: 22, letterSpacing: '-0.01em', color: 'var(--paper)' }}>
          MY DIGEST
        </div>
      </div>

      {loading ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--mute)', letterSpacing: '.2em' }}>LOADING…</span>
        </div>
      ) : !entries.length ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 14 }}>📋</div>
          <div style={{ fontFamily: DISPLAY, fontSize: 18, color: 'var(--paper)', marginBottom: 8 }}>
            NOTHING TO REPORT
          </div>
          <div style={{ fontFamily: BODY, fontSize: 13, color: 'var(--mute)', lineHeight: 1.55, maxWidth: 280 }}>
            No matches have been scored in your leagues in the last 7 days.{' '}
            {leagues.length === 0
              ? 'Join a league first to see activity here.'
              : 'Check back after the next round scores.'}
          </div>
          {/* preview demo — only shown when leagues exist but no entries yet */}
          {leagues.length > 0 && (
            <button
              onClick={() => setDrillIn({ leagueId: leagues[0].league_id, matchdayId: null })}
              style={{
                marginTop: 24, fontFamily: MONO, fontSize: 9, letterSpacing: '.18em',
                color: 'var(--cyan)', background: 'transparent',
                border: '1px solid rgba(0,180,216,.3)', padding: '8px 18px', cursor: 'pointer',
              }}
            >
              VIEW MY LATEST RECAP ↗
            </button>
          )}
        </div>
      ) : (
        <div style={{ flex: 1, overflow: 'auto' }}>
          {entries.map(e => (
            <DigestCard
              key={e.id}
              entry={e}
              onViewRecap={(leagueId, matchdayId) => setDrillIn({ leagueId, matchdayId })}
            />
          ))}
          <div style={{ height: 32 }} />
        </div>
      )}
    </div>
  );
}
