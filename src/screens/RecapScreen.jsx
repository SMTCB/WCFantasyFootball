import { useState, useEffect, useRef, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { domToPng } from 'modern-screenshot';
import RecapCard from '../components/RecapCard';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';

export default function RecapScreen() {
  const { user } = useAuth();
  const [recap,              setRecap]              = useState(null);
  const [loading,            setLoading]            = useState(true);
  const [sharing,            setSharing]            = useState(false);
  const [copied,             setCopied]             = useState(false);
  const [availableMatchdays, setAvailableMatchdays] = useState([]);
  const [selectedMatchdayId, setSelectedMatchdayId] = useState(null);
  const [leagues,            setLeagues]            = useState([]);       // all leagues user belongs to
  const [selectedLeagueId,   setSelectedLeagueId]   = useState(null);     // currently viewed league
  const cardRef = useRef(null);

  // ── Effect 1: Load all leagues the user belongs to ────────────────────────
  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      const { data: rows } = await supabase
        .from('league_members')
        .select('league_id, rank, leagues(name, tournament_id)')
        .eq('user_id', user.id)
        .order('rank', { ascending: true });
      if (!rows?.length) {
        // No leagues yet — stop loading so the "No Recaps Yet" empty state shows
        setLoading(false);
        return;
      }
      const leagueList = rows.map(r => ({
        league_id:     r.league_id,
        name:          r.leagues?.name        ?? 'Unknown League',
        tournament_id: r.leagues?.tournament_id ?? null,
        rank:          r.rank,
      }));
      setLeagues(leagueList);
      // Default to best-ranked league (first row, ascending rank)
      setSelectedLeagueId(prev => prev ?? leagueList[0].league_id);
    })();
  }, [user?.id]);

  // ── Effect 2: Reload matchday list when selected league changes ───────────
  useEffect(() => {
    if (!selectedLeagueId || !leagues.length) return;
    const league       = leagues.find(l => l.league_id === selectedLeagueId);
    const tournamentId = league?.tournament_id ?? null;
    (async () => {
      const q = supabase
        .from('matchday_deadlines')
        .select('matchday_id, deadline_at')
        .lt('deadline_at', new Date().toISOString())
        .order('deadline_at', { ascending: false })
        .limit(20);
      if (tournamentId) q.eq('tournament_id', tournamentId);
      const { data: mds } = await q;
      setAvailableMatchdays(mds?.length ? mds : []);
      // Reset to the first (most recent) matchday of the new league
      setSelectedMatchdayId(mds?.length ? mds[0].matchday_id : null);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLeagueId, leagues]);

  // ── Effect 3: Trigger recap fetch when matchday or league is ready ────────
  useEffect(() => {
    if (!selectedLeagueId) return;
    if (selectedMatchdayId)        fetchRecap(selectedMatchdayId, selectedLeagueId);
    else if (!availableMatchdays.length) fetchRecap(null, selectedLeagueId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, selectedMatchdayId, selectedLeagueId]);

  const fetchRecap = async (forcedMatchdayId, leagueId) => {
    try {
      setLoading(true);
      const userId = user?.id;

      // Resolve selected league info from local state (avoids extra DB round-trip)
      const leagueInfo   = leagues.find(l => l.league_id === leagueId) ?? null;
      const tournamentId = leagueInfo?.tournament_id ?? null;

      // 1. Squad scoped to this league's tournament + membership row for this league
      let squadQuery = supabase.from('squads')
        .select('id, matchday_id, players, captain_id, joker_player_id')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1);
      if (tournamentId) squadQuery = squadQuery.eq('tournament_id', tournamentId);

      const [{ data: squadRow }, { data: memberRow }] = await Promise.all([
        squadQuery.maybeSingle(),
        supabase.from('league_members')
          .select('league_id, rank, total_points, leagues(name, tournament_id)')
          .eq('user_id', userId)
          .eq('league_id', leagueId)
          .maybeSingle(),
      ]);

      if (!squadRow) return; // no squad yet for this league

      // U12/U53: use forced matchday if provided (from historic selector), else derive from DB
      let matchdayId = forcedMatchdayId ?? squadRow.matchday_id;

      if (!forcedMatchdayId) {
        // tournamentId already resolved from leagues state above
        const tidForDeadline = tournamentId ?? memberRow?.leagues?.tournament_id ?? null;
        if (tidForDeadline) {
          const { data: md } = await supabase
            .from('matchday_deadlines')
            .select('matchday_id')
            .eq('tournament_id', tidForDeadline)
            .order('deadline_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (md?.matchday_id) matchdayId = md.matchday_id;
        }
      }

      // Last-resort fallback — only if DB has no deadline rows at all
      if (!matchdayId) matchdayId = squadRow.matchday_id;
      const playerIds   = squadRow.players || [];
      const captainId   = squadRow.captain_id;
      const jokerId     = squadRow.joker_player_id ?? null;

      // 2. Per-player stats across this matchday's finished fixtures
      const { data: fixtures } = await supabase.from('fixtures')
        .select('id').eq('status', 'finished').like('id', `${matchdayId}%`);
      const finishedIds = (fixtures || []).map(f => f.id);

      const [{ data: statsRows }, { data: playerRows }, { data: userRow }] = await Promise.all([
        finishedIds.length
          ? supabase.from('player_match_stats')
              .select('player_id, fantasy_points, fixture_id')
              .in('player_id', playerIds)
              .in('fixture_id', finishedIds)
          : { data: [] },
        supabase.from('players').select('id, name, position, club').in('id', playerIds),
        supabase.from('users').select('username').eq('id', userId).maybeSingle(),
      ]);

      // 3. Sum base points per player across all finished fixtures
      const pointsMap = {};
      for (const s of statsRows || []) {
        pointsMap[s.player_id] = (pointsMap[s.player_id] || 0) + Number(s.fantasy_points);
      }

      const playerMap = Object.fromEntries((playerRows || []).map(p => [p.id, p]));

      // U13: effective points — mirrors calculate-scores multipliers.
      // Captain × 2 (or × 3 for triple-cap, not tracked here); Joker player × 2.
      const effectivePoints = (pid) => {
        const base = pointsMap[pid] || 0;
        let mult = 1;
        if (pid === captainId) mult = 2;
        if (pid === jokerId)   mult = mult === 2 ? 4 : 2; // joker stacks on captain if both
        return base * mult;
      };

      // 4. Derive best player (highest effective points in starting XI)
      const startingIds = playerIds.slice(0, 11);
      let bestPlayerId  = null;
      let bestPts       = -Infinity;
      for (const pid of startingIds) {
        const pts = effectivePoints(pid);
        if (pts > bestPts) { bestPts = pts; bestPlayerId = pid; }
      }

      // 5. Total matchday points from fantasy_points table
      const { data: fpRow } = await supabase.from('fantasy_points')
        .select('total').eq('squad_id', squadRow.id).eq('matchday_id', matchdayId).maybeSingle();
      const totalPoints = fpRow?.total ?? Object.values(pointsMap).reduce((s, v) => s + v, 0);

      const username   = userRow?.username ?? user?.user_metadata?.username ?? 'Manager';
      const rank       = memberRow?.rank     ?? leagueInfo?.rank     ?? null;
      const leagueName = memberRow?.leagues?.name ?? leagueInfo?.name ?? 'My League';

      setRecap({
        matchday:   matchdayId.toUpperCase(),
        leagueName,
        username,
        rank,
        points:     Math.round(totalPoints * 10) / 10,
        rankChange: null, // would need prior-matchday data
        bestPlayer: bestPlayerId && playerMap[bestPlayerId]
          ? { ...playerMap[bestPlayerId], points: effectivePoints(bestPlayerId) }
          : null,
        captain: captainId && playerMap[captainId]
          ? { ...playerMap[captainId], points: pointsMap[captainId] ?? 0 }  // base; ×2 shown in UI
          : null,
        joker: jokerId && playerMap[jokerId]
          ? { ...playerMap[jokerId], points: effectivePoints(jokerId) }
          : null,
        topScorers: startingIds
          .map(id => ({ ...playerMap[id], points: effectivePoints(id) }))
          .filter(p => p.name && p.points > 0)
          .sort((a, b) => b.points - a.points)
          .slice(0, 5),
        date: new Date().toLocaleDateString('en-GB', {
          day: 'numeric', month: 'long', year: 'numeric',
        }),
      });
    } catch (err) {
      console.error('Recap fetch error', err);
    } finally {
      setLoading(false);
    }
  };

  const { rankLabel, rankChangeColor, rankChangeText } = useMemo(() => {
    if (!recap) return { rankLabel: '', rankChangeColor: '', rankChangeText: '' };

    const r = recap.rank;
    const label = r === 1 ? '1st' : r === 2 ? '2nd' : r === 3 ? '3rd' : `${r}th`;
    const color = recap.rankChange > 0 ? 'text-positive' : recap.rankChange < 0 ? 'text-negative' : 'text-text-tertiary';
    const text  = recap.rankChange > 0
      ? `↑ ${recap.rankChange} place${recap.rankChange > 1 ? 's' : ''}`
      : recap.rankChange < 0
      ? `↓ ${Math.abs(recap.rankChange)} place${Math.abs(recap.rankChange) > 1 ? 's' : ''}`
      : '— Same position';

    return { rankLabel: label, rankChangeColor: color, rankChangeText: text };
  }, [recap]);

  // ── Image Generation ───────────────────────────────────────────────────────
  const generateImage = async () => {
    if (!cardRef.current) return null;
    setSharing(true);
    try {
      return await domToPng(cardRef.current, {
        scale: 3,
        backgroundColor: '#0D0D0D',
      });
    } finally {
      setSharing(false);
    }
  };

  // ── Share Handlers ─────────────────────────────────────────────────────────
  const handleSaveImage = async () => {
    const dataUrl = await generateImage();
    if (!dataUrl) return;
    const link = document.createElement('a');
    link.download = `forza-fantasy-league-matchday-${recap.matchday}-recap.png`;
    link.href = dataUrl;
    link.click();
  };

  const handleShareNative = async () => {
    const dataUrl = await generateImage();
    if (!dataUrl) return;
    const blob = await (await fetch(dataUrl)).blob();
    const file  = new File([blob], `forza-fantasy-league-md${recap.matchday}.png`, { type: 'image/png' });

    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: `Forza Fantasy League — Matchday ${recap.matchday} Recap`,
          text: `I scored ${recap.points} pts and finished ${rankLabel} in Matchday ${recap.matchday}! 🏆`,
        });
      } catch (e) {
        if (e.name !== 'AbortError') console.error(e);
      }
    } else {
      // Fallback: copy share text
      try {
        await navigator.clipboard.writeText(
          `I scored ${recap.points} pts in Matchday ${recap.matchday} of Forza Fantasy League! Rank: ${rankLabel} in ${recap.leagueName}.`
        );
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      } catch (err) { console.error('[share]', err); }
    }
  };

  // ── Helper: display points value or dash ──────────────────────────────────
  const pts = (val) => val != null ? `${val} pts` : '— pts';

  if (loading) return (
    <div className="min-h-screen bg-black flex items-center justify-center text-xs font-bold text-text-tertiary">
      GENERATING RECAP...
    </div>
  );

  if (!recap) return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center p-8 text-center">
      <div className="fk-display mb-4" style={{ fontSize: 24, color: 'var(--gold)' }}>FFL</div>
      <div className="text-lg font-black uppercase">No Recaps Yet</div>
      <div className="text-xs text-text-tertiary mt-2">
        Finish a matchday to see your performance summary!
      </div>
      <Link
        to="/"
        className="mt-8 text-positive text-xs font-black uppercase tracking-widest border border-positive/30 px-6 py-3 rounded-sm"
      >
        Back to Home
      </Link>
    </div>
  );

  return (
    <div className="min-h-screen bg-bg">
      <div className="min-h-screen flex flex-col">

        {/* Header */}
        <div className="bg-[#161616] py-3 px-4 border-b border-white/5 sticky top-0 z-40 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[9px] font-black uppercase tracking-[0.2em] text-text-tertiary">
              {recap.leagueName}
            </div>
            <h1 className="text-sm font-black uppercase tracking-wide">
              Matchday {recap.matchday} Recap
            </h1>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* League selector — shown when user belongs to multiple leagues */}
            {leagues.length > 1 && (
              <select
                value={selectedLeagueId ?? ''}
                onChange={e => setSelectedLeagueId(e.target.value)}
                style={{
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: 10,
                  letterSpacing: '.12em',
                  background: 'var(--gold)',
                  color: '#000',
                  border: 'none',
                  padding: '4px 8px',
                  borderRadius: 3,
                  cursor: 'pointer',
                  fontWeight: 900,
                  maxWidth: 120,
                }}
                title="Switch league"
              >
                {leagues.map(lg => (
                  <option key={lg.league_id} value={lg.league_id}>
                    {lg.name}
                  </option>
                ))}
              </select>
            )}

            {/* U53: Historic matchday selector */}
            {availableMatchdays.length > 1 && (
              <select
                value={selectedMatchdayId ?? ''}
                onChange={e => setSelectedMatchdayId(e.target.value)}
                style={{
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: 10,
                  letterSpacing: '.12em',
                  background: 'var(--ink-2)',
                  color: 'var(--paper)',
                  border: '1px solid var(--rule)',
                  padding: '4px 8px',
                  borderRadius: 3,
                  cursor: 'pointer',
                }}
              >
                {availableMatchdays.map(md => {
                  const label = String(md.matchday_id).replace(/^.*-r/, 'GW ');
                  return <option key={md.matchday_id} value={md.matchday_id}>{label}</option>;
                })}
              </select>
            )}
          </div>

          <div className="text-[10px] text-text-tertiary font-semibold shrink-0">{recap.date}</div>
        </div>

        {/* ── Hero Rank Block ──────────────────────────────────── */}
        <div className="flex flex-col items-center justify-center py-10 px-4 border-b border-white/5 bg-[#0a0a0a] text-center">
          <div className="text-[9px] font-black uppercase tracking-[0.2em] text-text-tertiary mb-1">
            {recap.username}
          </div>
          <div className="text-[9px] font-black uppercase tracking-[0.2em] text-text-tertiary mb-2">
            Final Rank
          </div>
          <div className="text-8xl font-black leading-none tracking-tighter">{rankLabel}</div>
          <div className="text-2xl font-black text-positive mt-4 tracking-tight">{recap.points} pts</div>
          <div className={`text-sm font-bold mt-2 ${rankChangeColor}`}>{rankChangeText}</div>
        </div>

        {/* ── Stat Rows ─────────────────────────────────────────── */}
        <div className="divide-y divide-white/5">

          {/* Best Player */}
          {recap.bestPlayer && (
            <div className="flex items-center justify-between px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="fk-mono flex items-center justify-center shrink-0" style={{ width: 36, height: 36, border: '1px solid var(--rule)', color: 'var(--mute)', fontSize: 9 }}>
                  {recap.bestPlayer.name.substring(0, 3)}
                </div>
                <div>
                  <div className="text-[9px] text-text-tertiary font-black uppercase tracking-[0.15em]">Best Player</div>
                  <div className="text-[14px] font-bold">{recap.bestPlayer.name}</div>
                </div>
              </div>
              <div className="bg-white text-black text-[11px] font-black px-2.5 py-1 rounded-[3px]">
                {pts(recap.bestPlayer.points)}
              </div>
            </div>
          )}

          {/* Captain */}
          {recap.captain && (
            <div className="flex items-center justify-between px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="fk-mono flex items-center justify-center shrink-0" style={{ width: 36, height: 36, border: '1px solid var(--gold)', color: 'var(--gold)', fontSize: 11 }}>
                  C
                </div>
                <div>
                  <div className="text-[9px] text-text-tertiary font-black uppercase tracking-[0.15em]">Captain</div>
                  <div className="text-[14px] font-bold">{recap.captain.name}</div>
                </div>
              </div>
              <div className="bg-yellow-500 text-black text-[11px] font-black px-2.5 py-1 rounded-[3px]">
                {recap.captain.points != null
                  ? `×2 = ${recap.captain.points * 2} pts`
                  : '×2'}
              </div>
            </div>
          )}

          {/* Joker (conditional) */}
          {recap.joker && (
            <div className="flex items-center justify-between px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="fk-mono flex items-center justify-center shrink-0" style={{ width: 36, height: 36, border: '1px solid var(--pos-gk)', color: 'var(--pos-gk)', fontSize: 9 }}>
                  JKR
                </div>
                <div>
                  <div className="text-[9px] text-text-tertiary font-black uppercase tracking-[0.15em]">Joker Played</div>
                  <div className="text-[14px] font-bold">{recap.joker.name}</div>
                </div>
              </div>
              <div className="bg-purple-600 text-white text-[11px] font-black px-2.5 py-1 rounded-[3px]">
                {pts(recap.joker.points)}
              </div>
            </div>
          )}

          {/* Top Scorers */}
          {recap.topScorers?.length > 0 && (
            <div className="px-5 py-4">
              <div className="text-[9px] text-text-tertiary font-black uppercase tracking-[0.15em] mb-3">Top Scorers</div>
              <div className="space-y-2">
                {recap.topScorers.map((p, i) => (
                  <div key={p.id ?? i} className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="fk-mono flex items-center justify-center shrink-0" style={{ width: 20, height: 20, border: '1px solid var(--rule)', color: 'var(--mute)', fontSize: 9 }}>
                        {i + 1}
                      </div>
                      <div className="text-[13px] font-bold truncate">{p.name}</div>
                      <div className="text-[10px] text-text-tertiary shrink-0">{p.position}</div>
                    </div>
                    <div className="text-[13px] font-black tabular-nums text-positive ml-3 shrink-0">
                      +{p.points}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Share Actions ──────────────────────────────────────── */}
        <div className="p-4 mt-auto">
          <div className="text-[9px] font-black uppercase tracking-[0.2em] text-text-tertiary text-center mb-4">
            Share your recap
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={handleShareNative}
              disabled={sharing}
              className="col-span-2 py-4 bg-positive text-black font-black text-sm uppercase tracking-widest rounded-sm active:scale-98 transition-all disabled:opacity-50 shadow-[0_4px_20px_rgba(34,197,94,0.3)]"
            >
              {sharing ? '⏳ Generating...' : copied ? '✅ Copied!' : '📱 Share Recap'}
            </button>

            <button
              onClick={handleSaveImage}
              disabled={sharing}
              className="py-3.5 bg-[#161616] border border-white/10 text-white font-bold text-sm uppercase tracking-wider rounded-sm hover:bg-[#1e1e1e] transition-colors disabled:opacity-50"
            >
              💾 Save Image
            </button>

            <button
              onClick={async () => {
                const text = `I scored ${recap.points} pts and finished ${rankLabel} in Matchday ${recap.matchday} of FantasyKit! 🏆 Playing in ${recap.leagueName}.`;
                await navigator.clipboard.writeText(text);
                setCopied(true);
                setTimeout(() => setCopied(false), 2500);
              }}
              className="py-3.5 bg-[#161616] border border-white/10 text-white font-bold text-sm uppercase tracking-wider rounded-sm hover:bg-[#1e1e1e] transition-colors"
            >
              {copied ? '✅ Copied!' : '📋 Copy Text'}
            </button>
          </div>
        </div>

        {/* ── Off-screen Shareable Card (used by modern-screenshot) ──── */}
        <div className="absolute -left-[9999px] top-0 opacity-0 pointer-events-none" aria-hidden="true">
          <RecapCard recap={recap} forwardRef={cardRef} />
        </div>

      </div>
    </div>
  );
}
