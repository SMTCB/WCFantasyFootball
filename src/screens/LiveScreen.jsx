import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';

// ── Constants ────────────────────────────────────────────────────────────────

const REFRESH_MS = 5 * 60 * 1000;

const LEAGUE_TONES = ['#00B4D8', '#E0A800', '#A855F7', '#22C55E', '#F59E0B'];

const POS_TONE = { FWD: 'var(--danger)', MID: 'var(--gold)', DEF: 'var(--cyan)', GK: '#A855F7' };
const POS_Y    = { FWD: 14, MID: 38, DEF: 64, GK: 88 };
const POS_ORDER = ['GK', 'DEF', 'MID', 'FWD'];

// ── Point estimation ─────────────────────────────────────────────────────────

function approxDelta(type, pos, isCap, isTripleCap) {
  const base = {
    goal:         (pos === 'GK' || pos === 'DEF') ? 6 : pos === 'MID' ? 5 : 4,
    assist:       3,
    clean_sheet:  (pos === 'GK' || pos === 'DEF') ? 4 : pos === 'MID' ? 1 : 0,
    yellow_card:  -1,
    red_card:     -3,
    penalty_save: 5,
    penalty_miss: -2,
    bonus:        1,
    sub_off:      0,
    sub_on:       0,
    conceded:     (pos === 'GK' || pos === 'DEF') ? -1 : 0,
    own_goal:     -2,
  }[type] ?? 0;
  if (isCap && base > 0) return isTripleCap ? base * 3 : base * 2;
  return base;
}

// ── Shared primitives ────────────────────────────────────────────────────────

function LivePill({ size = 10 }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span className="animate-live-pulse" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--danger)' }} />
      <span className="mono" style={{ fontSize: size, letterSpacing: '.22em', color: 'var(--danger)' }}>LIVE</span>
    </span>
  );
}

function DeltaPill({ delta, big = false }) {
  if (delta === 0) {
    return <span className="mono" style={{ fontSize: big ? 13 : 11, color: 'var(--mute)', fontFamily: 'Archivo Black' }}>±0</span>;
  }
  const pos  = delta > 0;
  const tone = pos ? 'var(--positive)' : 'var(--danger)';
  return (
    <span style={{ fontFamily: 'Archivo Black', fontSize: big ? 18 : 14, letterSpacing: '-0.02em', color: tone, display: 'inline-flex', alignItems: 'baseline', gap: 2 }}>
      {pos ? '+' : '−'}{Math.abs(delta)}
    </span>
  );
}

function LeagueChip({ league, compact = false }) {
  if (!league) return null;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: compact ? '2px 6px' : '3px 7px 3px 6px',
      border: `1px solid ${league.tone}55`,
      background: `${league.tone}12`,
      borderRadius: 2,
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: league.tone }} />
      <span className="mono" style={{ fontSize: compact ? 9 : 10, letterSpacing: '.14em', color: league.tone }}>
        {compact ? league.short : league.name}
      </span>
    </span>
  );
}

// ── Mini pitch ────────────────────────────────────────────────────────────────

function MiniPitch({ players, activeLeague, gwLabel }) {
  const formation = buildFormation(players);
  return (
    <div style={{
      position: 'relative', width: '100%', height: '100%',
      background: 'linear-gradient(180deg, #0E1218 0%, #0A0D12 100%)',
      borderRadius: 6, overflow: 'hidden',
      boxShadow: 'inset 0 0 0 1px var(--rule)',
    }}>
      {/* position guide lines */}
      {[14, 38, 64, 88].map(y => (
        <div key={y} style={{ position: 'absolute', left: 18, right: 18, top: `${y}%`, height: 1, background: 'rgba(0,180,216,.08)' }} />
      ))}
      {[{ y: 14, label: 'FWD' }, { y: 38, label: 'MID' }, { y: 64, label: 'DEF' }, { y: 88, label: 'GK' }].map(l => (
        <div key={l.label} className="mono" style={{ position: 'absolute', left: 10, top: `${l.y}%`, transform: 'translateY(-50%)', fontSize: 8, color: 'rgba(0,180,216,.45)', background: '#0A0D12', padding: '1px 3px' }}>{l.label}</div>
      ))}
      {/* centre circle */}
      <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: '30%', aspectRatio: '1', borderRadius: '50%', border: '1px solid rgba(242,238,229,.04)' }} />
      {/* header */}
      <div style={{ position: 'absolute', top: 10, left: 14, right: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="mono" style={{ fontSize: 9, color: 'var(--mute)', letterSpacing: '.22em' }}>STARTING XI · {formation}</div>
        <div className="mono" style={{ fontSize: 9, color: activeLeague ? activeLeague.tone : 'var(--mute)', letterSpacing: '.22em' }}>
          {activeLeague ? activeLeague.name.toUpperCase() : (gwLabel || 'GW —')}
        </div>
      </div>
      {/* player tokens */}
      {players.map(p => (
        <MiniTok key={p.id} p={p} activeLeague={activeLeague} />
      ))}
    </div>
  );
}

function MiniTok({ p, activeLeague }) {
  const tone      = POS_TONE[p.position] || 'var(--mute)';
  const isCaptain = activeLeague && activeLeague.captainId === p.id;
  const isTriple  = isCaptain && activeLeague.chip === 'Triple Captain';
  return (
    <div style={{ position: 'absolute', left: `${p.x}%`, top: `${p.y}%`, transform: 'translate(-50%,-50%)' }}>
      <div style={{
        position: 'relative',
        padding: '4px 8px',
        background: 'rgba(15,18,24,.94)',
        border: `1px solid ${p.live ? 'var(--danger)' : 'var(--rule)'}`,
        borderLeft: `2px solid ${tone}`,
        borderRadius: 2,
        minWidth: 78, textAlign: 'center',
        boxShadow: p.live ? '0 0 0 2px rgba(239,68,68,.18)' : 'none',
      }}>
        {p.live && (
          <span className="animate-live-pulse" style={{ position: 'absolute', top: -3, right: -3, width: 6, height: 6, borderRadius: '50%', background: 'var(--danger)' }} />
        )}
        {isCaptain && (
          <span style={{
            position: 'absolute', top: -7, left: -7,
            width: 16, height: 16, borderRadius: '50%',
            background: 'var(--gold)', color: 'var(--ink)',
            fontFamily: 'Archivo Black', fontSize: 9,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '2px solid var(--ink)',
          }}>{isTriple ? '3' : 'C'}</span>
        )}
        <div style={{ fontFamily: 'Archivo Black', fontSize: 10, letterSpacing: '-0.01em' }}>
          {(p.name || '').split(' ').pop().toUpperCase()}
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 4, marginTop: 1 }}>
          <span className="mono" style={{ fontSize: 8, color: 'var(--mute)' }}>{p.club || '—'}</span>
          <span style={{ width: 2, height: 2, borderRadius: '50%', background: 'var(--mute)' }} />
          <span style={{ fontFamily: 'Archivo Black', fontSize: 10, color: (p.points ?? 0) >= 0 ? 'var(--paper)' : 'var(--danger)' }}>
            {(p.points ?? 0) >= 0 ? (p.points ?? 0) : `−${Math.abs(p.points ?? 0)}`}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Event rows ────────────────────────────────────────────────────────────────

const EVENT_GLYPH = {
  goal: { glyph: '●', tone: 'var(--positive)', label: 'Goal' },
  assist: { glyph: '◆', tone: 'var(--cyan)', label: 'Assist' },
  clean_sheet: { glyph: '▲', tone: 'var(--positive)', label: 'Clean sheet' },
  yellow_card: { glyph: '■', tone: 'var(--gold)', label: 'Yellow card' },
  red_card: { glyph: '■', tone: 'var(--danger)', label: 'Red card' },
  penalty_save: { glyph: '★', tone: 'var(--cyan)', label: 'Penalty save' },
  penalty_miss: { glyph: '✕', tone: 'var(--danger)', label: 'Penalty miss' },
  bonus: { glyph: '+', tone: 'var(--gold)', label: 'Bonus pts' },
  sub_off: { glyph: '↓', tone: 'var(--mute)', label: 'Subbed off' },
  sub_on: { glyph: '↑', tone: 'var(--mute)', label: 'Subbed on' },
  conceded: { glyph: '−', tone: 'var(--danger)', label: 'Conceded' },
  own_goal: { glyph: '●', tone: 'var(--danger)', label: 'Own goal' },
};

function EventRow({ ev }) {
  const kind = EVENT_GLYPH[ev.type] || { glyph: '?', tone: 'var(--mute)', label: ev.type };
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '44px 22px 1fr auto auto',
      alignItems: 'center', gap: 12,
      padding: '11px 16px',
      borderBottom: '1px solid var(--rule)',
      background: ev.delta < 0 ? 'rgba(239,68,68,.04)' : 'transparent',
    }}>
      <span className="mono" style={{ fontSize: 10, color: 'var(--mute)', letterSpacing: '.14em' }}>
        {ev.minute != null ? `${ev.minute}'` : '—'}
      </span>
      <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18, color: kind.tone, fontFamily: 'Archivo Black', fontSize: 12, lineHeight: 1 }}>
        {kind.glyph}
      </span>
      <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <span style={{ fontFamily: 'Archivo Black', fontSize: 13, letterSpacing: '-0.01em', whiteSpace: 'nowrap' }}>
            {(ev.playerName || '').split(' ').pop().toUpperCase()}
          </span>
          <span className="mono" style={{ fontSize: 9, color: 'var(--mute)', letterSpacing: '.14em' }}>{ev.club || ''}</span>
          <span style={{ fontFamily: 'Archivo', fontSize: 12, color: 'var(--mute)', marginLeft: 2 }}>· {kind.label}</span>
          {ev.isCap && (
            <span style={{ fontFamily: 'Archivo Black', fontSize: 8, background: 'var(--gold)', color: 'var(--ink)', padding: '1px 4px', lineHeight: 1 }}>C</span>
          )}
        </div>
      </div>
      <LeagueChip league={ev.league} />
      <DeltaPill delta={ev.delta ?? 0} />
    </div>
  );
}

function MobEventRow({ ev }) {
  const kind = EVENT_GLYPH[ev.type] || { glyph: '?', tone: 'var(--mute)', label: ev.type };
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '36px 1fr auto', gap: 10, alignItems: 'center',
      padding: '10px 18px',
      borderTop: '1px solid var(--rule)',
      background: ev.delta < 0 ? 'rgba(239,68,68,.04)' : 'transparent',
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
        <span className="mono" style={{ fontSize: 10, color: 'var(--mute)', letterSpacing: '.14em' }}>
          {ev.minute != null ? `${ev.minute}'` : '—'}
        </span>
        <span style={{ color: kind.tone, fontFamily: 'Archivo Black', fontSize: 14, lineHeight: 1 }}>{kind.glyph}</span>
      </div>
      <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontFamily: 'Archivo Black', fontSize: 13, letterSpacing: '-0.01em' }}>
            {(ev.playerName || '').split(' ').pop().toUpperCase()}
          </span>
          <span className="mono" style={{ fontSize: 9, color: 'var(--mute)' }}>{ev.club || ''}</span>
          {ev.isCap && (
            <span style={{ fontFamily: 'Archivo Black', fontSize: 8, background: 'var(--gold)', color: 'var(--ink)', padding: '1px 4px', lineHeight: 1 }}>C</span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: 'var(--mute)' }}>{kind.label}</span>
          <LeagueChip league={ev.league} compact />
        </div>
      </div>
      <DeltaPill delta={ev.delta ?? 0} />
    </div>
  );
}

function MobSquadRow({ p, activeLeague }) {
  const isCap   = activeLeague && activeLeague.captainId === p.id;
  const isTriple = isCap && activeLeague.chip === 'Triple Captain';
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '22px 1fr auto', gap: 10, alignItems: 'center', padding: '8px 0' }}>
      <div className="mono" style={{ fontSize: 9, color: 'var(--mute)' }}>{p.position}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <span style={{
          width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
          background: p.live ? 'var(--danger)' : 'var(--mute)',
        }} className={p.live ? 'animate-live-pulse' : ''} />
        <span style={{ fontFamily: 'Archivo Black', fontSize: 13, letterSpacing: '-0.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {(p.name || '').split(' ').pop().toUpperCase()}
        </span>
        {isCap && (
          <span style={{ fontFamily: 'Archivo Black', fontSize: 8, background: 'var(--gold)', color: 'var(--ink)', padding: '2px 5px', letterSpacing: '.04em', lineHeight: 1 }}>
            {isTriple ? '3×C' : 'C'}
          </span>
        )}
        <span className="mono" style={{ fontSize: 9, color: 'var(--mute)', marginLeft: 'auto' }}>{p.club || '—'}</span>
      </div>
      <div style={{ fontFamily: 'Archivo Black', fontSize: 14, letterSpacing: '-0.02em', color: (p.points ?? 0) >= 0 ? 'var(--cyan)' : 'var(--danger)' }}>
        {(p.points ?? 0) >= 0 ? (p.points ?? 0) : `−${Math.abs(p.points ?? 0)}`}
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildFormation(players) {
  const counts = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  players.forEach(p => { if (counts[p.position] !== undefined) counts[p.position]++; });
  return `${counts.DEF}-${counts.MID}-${counts.FWD}`;
}

function positionPlayers(players) {
  const byPos = { GK: [], DEF: [], MID: [], FWD: [] };
  players.forEach(p => { if (byPos[p.position]) byPos[p.position].push(p); });
  const positioned = [];
  for (const pos of POS_ORDER) {
    const grp = byPos[pos] || [];
    grp.forEach((p, i) => {
      const n = grp.length;
      const x = n === 1 ? 50 : Math.round(10 + (i / (n - 1)) * 80);
      positioned.push({ ...p, x, y: POS_Y[pos] || 50 });
    });
  }
  return positioned;
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function LiveScreen() {
  const { user } = useAuth();

  const [loading,      setLoading]      = useState(true);
  const [liveFixtures, setLiveFixtures] = useState([]);
  const [userLeagues,  setUserLeagues]  = useState([]);
  const [squadPlayers, setSquadPlayers] = useState([]);
  const [events,       setEvents]       = useState([]);
  const [activeLeague, setActiveLeague] = useState(null);
  const [mobileTab,    setMobileTab]    = useState('events');
  const [currentGW,    setCurrentGW]    = useState('—');

  const initialSet = useRef(false);

  const fetchAll = useCallback(async () => {
    try {
      // 1. Live fixtures
      const { data: fixData = [] } = await supabase
        .from('fixtures')
        .select('id, home_team, away_team, status, kickoff_at, minute')
        .eq('status', 'live')
        .order('kickoff_at', { ascending: true });

      const activeFixIds = (fixData || []).map(f => f.id);

      // Score map from goal events
      const scoreMap = {};
      (fixData || []).forEach(f => { scoreMap[f.id] = { homeGoals: 0, awayGoals: 0 }; });
      if (activeFixIds.length) {
        const { data: goalEvs = [] } = await supabase
          .from('match_events')
          .select('fixture_id, team, type')
          .in('fixture_id', activeFixIds)
          .in('type', ['goal', 'own_goal']);
        for (const ev of goalEvs || []) {
          const fix = (fixData || []).find(f => f.id === ev.fixture_id);
          if (!fix) continue;
          const isHome = ev.team === fix.home_team;
          const isOwn  = ev.type === 'own_goal';
          if (isHome !== isOwn) scoreMap[ev.fixture_id].homeGoals++;
          else scoreMap[ev.fixture_id].awayGoals++;
        }
      }
      const enrichedFix = (fixData || []).map(f => ({ ...f, ...scoreMap[f.id] }));
      setLiveFixtures(enrichedFix);

      // Set GW label from fixture data (use earliest kickoff year/month as proxy)
      if (fixData?.length) setCurrentGW('LIVE');

      if (!user?.id) { setLoading(false); return; }

      // 2. User leagues
      const { data: memberships = [] } = await supabase
        .from('league_members')
        .select('league_id, total_points, rank, leagues(id, name)')
        .eq('user_id', user.id);

      if (!memberships?.length) { setLoading(false); return; }

      // 3. Member counts per league
      const leagueIds = (memberships || []).map(m => m.league_id).filter(Boolean);
      const { data: memberCounts = [] } = leagueIds.length
        ? await supabase
            .from('league_members')
            .select('league_id')
            .in('league_id', leagueIds)
        : { data: [] };
      const countMap = {};
      (memberCounts || []).forEach(r => { countMap[r.league_id] = (countMap[r.league_id] || 0) + 1; });

      // 4. Squad (single squad shared across leagues)
      const { data: squadRow } = await supabase
        .from('squads')
        .select('players, captain_id, is_triple_captain')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const squadPlayerIds = squadRow?.players || [];
      const captainId      = squadRow?.captain_id;
      const isTripleCap    = squadRow?.is_triple_captain ?? false;

      // 5. Player details + live stats in parallel
      const [{ data: playerRows = [] }, { data: statsData = [] }] = await Promise.all([
        squadPlayerIds.length
          ? supabase.from('players').select('id, name, position, club').in('id', squadPlayerIds)
          : Promise.resolve({ data: [] }),
        activeFixIds.length && squadPlayerIds.length
          ? supabase.from('player_match_stats')
              .select('player_id, fantasy_points, fixture_id')
              .in('player_id', squadPlayerIds)
              .in('fixture_id', activeFixIds)
          : Promise.resolve({ data: [] }),
      ]);

      // Live player set (has stats in a live fixture)
      const livePlayerSet = new Set((statsData || []).map(s => s.player_id));
      const pointsMap = {};
      (statsData || []).forEach(s => {
        pointsMap[s.player_id] = (pointsMap[s.player_id] || 0) + Number(s.fantasy_points);
      });

      // Apply captain multiplier
      const enrichedPlayers = (playerRows || []).map(p => {
        let pts = pointsMap[p.id] || 0;
        if (p.id === captainId) pts *= isTripleCap ? 3 : 2;
        return { ...p, points: pts, live: livePlayerSet.has(p.id) };
      });

      // Position players on pitch
      const positioned = positionPlayers(enrichedPlayers);
      setSquadPlayers(positioned);

      // 6. Enrich leagues with tones + totals
      const enrichedLeagues = (memberships || []).map((m, idx) => {
        const tone       = LEAGUE_TONES[idx % LEAGUE_TONES.length];
        const nameParts  = (m.leagues?.name || 'League').split(' ');
        const short      = nameParts.map(w => w[0]).join('').toUpperCase().slice(0, 5);
        const members    = countMap[m.league_id] || '—';
        const total      = m.total_points || 0;
        const rankLabel  = m.rank ? `${m.rank} / ${members}` : '—';
        return {
          id:        m.league_id,
          name:      m.leagues?.name || 'League',
          short,
          tone,
          members,
          captainId,
          chip:      isTripleCap ? 'Triple Captain' : null,
          rank:      rankLabel,
          total,
          delta:     0,
        };
      });
      setUserLeagues(enrichedLeagues);

      if (!initialSet.current && enrichedLeagues.length) {
        setActiveLeague(enrichedLeagues[0]);
        initialSet.current = true;
      }

      // 7. Match events → fan out per league (delta differs per captain/chip)
      if (activeFixIds.length && squadPlayerIds.length) {
        const { data: evData = [] } = await supabase
          .from('match_events')
          .select('id, fixture_id, player_id, type, minute, team')
          .in('fixture_id', activeFixIds)
          .in('player_id', squadPlayerIds)
          .order('minute', { ascending: false })
          .limit(100);

        const playerMap = Object.fromEntries((playerRows || []).map(p => [p.id, p]));
        const fanned = [];
        for (const ev of evData || []) {
          const p     = playerMap[ev.player_id];
          if (!p) continue;
          const isCap = p.id === captainId;
          for (const lg of enrichedLeagues) {
            const isTripleForLeague = isCap && lg.chip === 'Triple Captain';
            const delta = approxDelta(ev.type, p.position, isCap, isTripleForLeague);
            fanned.push({
              key:        `${ev.id}-${lg.id}`,
              type:       ev.type,
              minute:     ev.minute,
              playerName: p.name,
              club:       p.club,
              position:   p.position,
              isCap,
              league:     lg,
              delta,
            });
          }
        }
        setEvents(fanned);
      } else {
        setEvents([]);
      }

    } catch (err) {
      console.error('LiveScreen fetch error', err);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, REFRESH_MS);
    return () => clearInterval(interval);
  }, [fetchAll]);

  // ── Desktop layout ─────────────────────────────────────────────────────────

  const desktopLeagueSelector = (
    <div style={{ display: 'flex', borderBottom: '1px solid var(--rule)' }}>
      {userLeagues.length === 0 ? (
        <div className="mono" style={{ padding: '14px 20px', fontSize: 10, color: 'var(--mute)' }}>
          {loading ? 'Loading leagues…' : 'No leagues found'}
        </div>
      ) : userLeagues.map((lg, i) => {
        const isActive = activeLeague?.id === lg.id;
        return (
          <button
            key={lg.id}
            onClick={() => setActiveLeague(lg)}
            style={{
              flex: 1, padding: '14px 18px',
              borderLeft: i ? '1px solid var(--rule)' : 'none',
              borderTop: 'none', borderRight: 'none',
              borderBottom: isActive ? `2px solid ${lg.tone}` : '2px solid transparent',
              background: isActive ? `${lg.tone}10` : 'transparent',
              cursor: 'pointer', color: 'var(--paper)',
              display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start',
              fontFamily: 'Archivo, sans-serif', textAlign: 'left',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: lg.tone }} />
              <span className="mono" style={{ fontSize: 10, color: isActive ? lg.tone : 'var(--mute)', letterSpacing: '.18em' }}>
                {lg.name.toUpperCase()}
              </span>
              <span className="mono" style={{ fontSize: 9, color: 'var(--mute)', marginLeft: 'auto' }}>{lg.members} MEMBERS</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, width: '100%' }}>
              <span style={{ fontFamily: 'Archivo Black', fontSize: 26, letterSpacing: '-0.02em', color: isActive ? lg.tone : 'var(--paper)' }}>
                {lg.total}
              </span>
              <DeltaPill delta={lg.delta} />
              {lg.chip && (
                <span className="mono" style={{ fontSize: 9, color: 'var(--gold)', letterSpacing: '.14em', marginLeft: 'auto' }}>· {lg.chip.toUpperCase()}</span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flex: 1, flexDirection: 'column', background: 'var(--ink)', color: 'var(--paper)', fontFamily: 'Archivo, sans-serif', minHeight: 0 }}>

      {/* ── DESKTOP ─────────────────────────────────────────────────────────── */}
      <div className="hidden lg:flex flex-col" style={{ height: '100dvh', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', padding: '24px 32px 16px', borderBottom: '1px solid var(--rule)' }}>
          <div>
            <div className="mono" style={{ fontSize: 10, color: 'var(--mute)' }}>MATCH DAY · GW {currentGW}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 4 }}>
              <div className="display" style={{ fontSize: 34 }}>Live Centre</div>
              <LivePill size={11} />
            </div>
          </div>
          {activeLeague && (
            <div style={{ textAlign: 'right' }}>
              <div className="mono" style={{ fontSize: 9, color: 'var(--mute)' }}>FOCUSED LEAGUE</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2, justifyContent: 'flex-end' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: activeLeague.tone }} />
                <span style={{ fontFamily: 'Archivo Black', fontSize: 20, letterSpacing: '-0.01em' }}>{activeLeague.name}</span>
              </div>
              <div className="mono" style={{ fontSize: 9, color: 'var(--mute)', marginTop: 2 }}>
                RANK {activeLeague.rank} · {activeLeague.chip ? activeLeague.chip.toUpperCase() : 'NO CHIP'}
              </div>
            </div>
          )}
        </div>

        {/* Fixtures strip */}
        <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--rule)' }}>
          {liveFixtures.length === 0 ? (
            <div className="mono" style={{ padding: '12px 20px', fontSize: 10, color: 'var(--mute)' }}>
              {loading ? 'Connecting…' : 'No live fixtures'}
            </div>
          ) : liveFixtures.map((f, i) => (
            <div key={f.id} style={{ flex: 1, padding: '10px 16px', borderLeft: i ? '1px solid var(--rule)' : 'none', display: 'flex', alignItems: 'center', gap: 14 }}>
              <LivePill />
              <span className="mono" style={{ fontSize: 11, color: 'var(--mute)', letterSpacing: '.18em' }}>{f.minute ? `${f.minute}'` : '—'}</span>
              <span style={{ fontFamily: 'Archivo Black', fontSize: 14, letterSpacing: '-0.01em', marginLeft: 'auto' }}>
                {(f.home_team || '').substring(0, 3).toUpperCase()}
                <span style={{ color: 'var(--cyan)', margin: '0 8px' }}>{f.homeGoals ?? 0}–{f.awayGoals ?? 0}</span>
                {(f.away_team || '').substring(0, 3).toUpperCase()}
              </span>
            </div>
          ))}
        </div>

        {/* League selector */}
        {desktopLeagueSelector}

        {/* Body — two columns */}
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'minmax(0, 520px) 1fr', minHeight: 0 }}>

          {/* Left: mini pitch */}
          <div style={{ padding: '20px 24px', borderRight: '1px solid var(--rule)', display: 'flex', flexDirection: 'column', gap: 14, minHeight: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 3, height: 14, background: activeLeague?.tone || 'var(--cyan)' }} />
                <span className="mono" style={{ fontSize: 11, color: 'var(--paper)', letterSpacing: '.22em' }}>MY XI</span>
                {activeLeague && (
                  <span className="mono" style={{ fontSize: 9, color: 'var(--mute)', letterSpacing: '.14em' }}>· {activeLeague.name.toUpperCase()}</span>
                )}
              </div>
              <div className="mono" style={{ fontSize: 9, color: 'var(--mute)' }}>
                {squadPlayers.filter(p => p.live).length} ACTIVE NOW
              </div>
            </div>
            <div style={{ flex: 1, minHeight: 'clamp(340px, calc(100dvh - 340px), 700px)' }}>
              {loading ? (
                <div className="mono" style={{ fontSize: 10, color: 'var(--mute)', padding: 20 }}>Loading squad…</div>
              ) : squadPlayers.length === 0 ? (
                <div className="mono" style={{ fontSize: 10, color: 'var(--mute)', padding: 20 }}>No squad data</div>
              ) : (
                <MiniPitch players={squadPlayers} activeLeague={activeLeague} gwLabel={`GW ${currentGW}`} />
              )}
            </div>
            <div className="mono" style={{ fontSize: 9, color: 'var(--mute)', lineHeight: 1.6 }}>
              ● PULSE = PLAYER IN A LIVE FIXTURE · <span style={{ color: 'var(--gold)' }}>C</span> = CAPTAIN · NUMBERS ARE GW POINTS
            </div>
          </div>

          {/* Right: events feed (all leagues) */}
          <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid var(--rule)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 3, height: 14, background: 'var(--gold)' }} />
                <span className="mono" style={{ fontSize: 11, color: 'var(--paper)', letterSpacing: '.22em' }}>MATCH EVENTS</span>
                <span className="mono" style={{ fontSize: 9, color: 'var(--mute)', letterSpacing: '.14em' }}>· EVERY PLAYER · EVERY LEAGUE</span>
              </div>
              <span className="mono" style={{ fontSize: 9, color: 'var(--mute)' }}>{events.length} TOTAL</span>
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {loading ? (
                <div className="mono" style={{ fontSize: 10, color: 'var(--mute)', padding: 20 }}>Connecting to live feed…</div>
              ) : events.length === 0 ? (
                <div style={{ padding: '32px 20px', textAlign: 'center' }}>
                  <div className="mono" style={{ fontSize: 10, color: 'var(--mute)', letterSpacing: '.22em' }}>AWAITING KICKOFF…</div>
                  <div className="mono" style={{ fontSize: 9, color: 'var(--rule)', marginTop: 8 }}>Events will appear here as your players act</div>
                </div>
              ) : (
                events.map(ev => <EventRow key={ev.key} ev={ev} />)
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── MOBILE ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-col lg:hidden" style={{ flex: 1, overflowY: 'auto' }}>

        {/* Hero header */}
        <div style={{ padding: '14px 18px 10px' }}>
          <div className="mono" style={{ fontSize: 9, color: 'var(--mute)', letterSpacing: '.22em' }}>MATCH DAY · GW {currentGW}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 4 }}>
            <div className="display" style={{ fontSize: 26 }}>Live Centre</div>
            <LivePill />
          </div>
        </div>

        {/* League selector cards */}
        <div style={{ padding: '4px 0 14px' }}>
          <div className="mono" style={{ fontSize: 9, color: 'var(--mute)', letterSpacing: '.18em', padding: '0 18px 8px' }}>YOUR LEAGUES — TAP TO SWITCH</div>
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '0 18px 4px', scrollbarWidth: 'none' }}>
            {loading ? (
              <div className="mono" style={{ fontSize: 10, color: 'var(--mute)', padding: '10px 0' }}>Loading…</div>
            ) : userLeagues.length === 0 ? (
              <div className="mono" style={{ fontSize: 10, color: 'var(--mute)', padding: '10px 0' }}>No leagues</div>
            ) : userLeagues.map(lg => {
              const isActive = activeLeague?.id === lg.id;
              return (
                <button
                  key={lg.id}
                  onClick={() => setActiveLeague(lg)}
                  style={{
                    flex: '0 0 auto', minWidth: 140,
                    padding: '10px 12px',
                    background: isActive ? `${lg.tone}14` : 'var(--ink-2)',
                    border: `1px solid ${isActive ? lg.tone : 'var(--rule)'}`,
                    borderLeft: `2px solid ${lg.tone}`,
                    display: 'flex', flexDirection: 'column', gap: 6,
                    textAlign: 'left', color: 'var(--paper)',
                    fontFamily: 'Archivo, sans-serif', cursor: 'pointer',
                  }}
                >
                  <span className="mono" style={{ fontSize: 9, color: lg.tone, letterSpacing: '.18em' }}>{lg.short}</span>
                  <span style={{ fontFamily: 'Archivo Black', fontSize: 12, letterSpacing: '-0.01em', whiteSpace: 'nowrap' }}>{lg.name}</span>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ fontFamily: 'Archivo Black', fontSize: 22, letterSpacing: '-0.02em', color: isActive ? lg.tone : 'var(--paper)' }}>
                      {lg.total}
                    </span>
                    <DeltaPill delta={lg.delta} />
                  </div>
                  <span className="mono" style={{ fontSize: 8, color: 'var(--mute)', letterSpacing: '.14em' }}>
                    {lg.rank}{lg.chip ? ` · ${lg.chip.toUpperCase()}` : ''}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Live fixtures */}
        <div style={{ borderTop: '1px solid var(--rule)', borderBottom: '1px solid var(--rule)' }}>
          {liveFixtures.length === 0 ? (
            <div style={{ padding: '10px 18px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="mono" style={{ fontSize: 10, color: 'var(--mute)' }}>
                {loading ? 'Connecting…' : 'No live fixtures right now'}
              </span>
            </div>
          ) : liveFixtures.map((f, i) => (
            <div key={f.id} style={{ padding: '10px 18px', display: 'flex', alignItems: 'center', gap: 12, borderTop: i ? '1px solid var(--rule)' : 'none' }}>
              <span className="animate-live-pulse" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--danger)' }} />
              <span className="mono" style={{ fontSize: 10, color: 'var(--mute)', letterSpacing: '.18em' }}>{f.minute ? `${f.minute}'` : '—'}</span>
              <span style={{ fontFamily: 'Archivo Black', fontSize: 14, marginLeft: 'auto' }}>
                {(f.home_team || '').substring(0, 3).toUpperCase()}
                <span style={{ color: 'var(--cyan)', margin: '0 6px' }}>{f.homeGoals ?? 0}–{f.awayGoals ?? 0}</span>
                {(f.away_team || '').substring(0, 3).toUpperCase()}
              </span>
            </div>
          ))}
        </div>

        {/* Segmented tabs */}
        <div style={{ display: 'flex', padding: '0 18px', borderBottom: '1px solid var(--rule)' }}>
          {[
            { id: 'squad',  label: `MY XI · ${activeLeague?.short || '—'}` },
            { id: 'events', label: `EVENTS · ${events.length}` },
          ].map(t => {
            const isActive = mobileTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setMobileTab(t.id)}
                style={{
                  flex: 1, padding: '10px 0', position: 'relative',
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  color: isActive ? 'var(--paper)' : 'var(--mute)',
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: 11, letterSpacing: '.16em', textTransform: 'uppercase',
                }}
              >
                {t.label}
                {isActive && (
                  <span style={{ position: 'absolute', left: 0, right: 0, bottom: -1, height: 2, background: 'var(--cyan)' }} />
                )}
              </button>
            );
          })}
        </div>

        {/* Tab body */}
        <div style={{ flex: 1 }}>
          {mobileTab === 'squad' ? (
            <div style={{ padding: '8px 18px 24px' }}>
              {loading ? (
                <div className="mono" style={{ fontSize: 10, color: 'var(--mute)', padding: '20px 0' }}>Loading squad…</div>
              ) : squadPlayers.length === 0 ? (
                <div className="mono" style={{ fontSize: 10, color: 'var(--mute)', padding: '20px 0' }}>No squad found — sign in to see your players</div>
              ) : (
                <>
                  <div className="mono" style={{ fontSize: 9, color: 'var(--mute)', padding: '10px 0 8px', letterSpacing: '.18em' }}>
                    {buildFormation(squadPlayers)} · CAPTAIN{' '}
                    <span style={{ color: 'var(--gold)' }}>
                      {(() => {
                        const cap = squadPlayers.find(p => p.id === activeLeague?.captainId);
                        return cap ? (cap.name || '').split(' ').pop().toUpperCase() : '—';
                      })()}
                    </span>
                    {activeLeague?.chip ? ` · ${activeLeague.chip.toUpperCase()}` : ''}
                  </div>
                  {POS_ORDER.slice().reverse().map(pos => {
                    const line = squadPlayers.filter(p => p.position === pos);
                    if (!line.length) return null;
                    return (
                      <div key={pos} style={{ borderTop: '1px solid var(--rule)', padding: '6px 0' }}>
                        <div className="mono" style={{ fontSize: 9, color: 'var(--mute)', margin: '4px 0', letterSpacing: '.16em' }}>{pos} · {line.length}</div>
                        {line.map(p => <MobSquadRow key={p.id} p={p} activeLeague={activeLeague} />)}
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 18px 8px' }}>
                <span style={{ width: 3, height: 14, background: 'var(--gold)' }} />
                <span className="mono" style={{ fontSize: 10, color: 'var(--paper)', letterSpacing: '.22em' }}>ALL EVENTS</span>
                <span className="mono" style={{ fontSize: 9, color: 'var(--mute)', marginLeft: 'auto' }}>EVERY PLAYER · EVERY LEAGUE</span>
              </div>
              {loading ? (
                <div className="mono" style={{ fontSize: 10, color: 'var(--mute)', padding: '12px 18px' }}>Connecting to live feed…</div>
              ) : events.length === 0 ? (
                <div style={{ padding: '32px 18px', textAlign: 'center' }}>
                  <div className="mono" style={{ fontSize: 10, color: 'var(--mute)', letterSpacing: '.22em' }}>AWAITING KICKOFF…</div>
                  <div className="mono" style={{ fontSize: 9, color: 'var(--rule)', marginTop: 8 }}>Events appear here as your players act</div>
                </div>
              ) : (
                events.map(ev => <MobEventRow key={ev.key} ev={ev} />)
              )}
              <div style={{ height: 30 }} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
