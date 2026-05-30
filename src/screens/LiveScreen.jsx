import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';

// ── Constants ────────────────────────────────────────────────────────────────

const REFRESH_MS = 60 * 1000; // 60s safety-net poll — Realtime handles sub-second updates

const LEAGUE_TONES = ['#00B4D8', '#E0A800', '#A855F7', '#22C55E', '#F59E0B'];

import { POS_ORDER, POS_PITCH_Y as POS_Y } from '../lib/formations';
import { teamCode } from '../lib/fixtures';
const POS_TONE = { FWD: 'var(--danger)', MID: 'var(--gold)', DEF: 'var(--cyan)', GK: '#A855F7' };

// ── Point estimation ─────────────────────────────────────────────────────────
// U46: fallback constants match EPL scoring_rules seed; overridden at runtime
// by scoring_rules rows fetched during fetchAll so values are tournament-accurate.

const FALLBACK_POS = {
  GK:  { goal: 5, assist: 0, clean_sheet: 4, conceded_per_goal: -1, penalty_saved: 5 },
  DEF: { goal: 4, assist: 1, clean_sheet: 4, conceded_per_goal:  0, penalty_saved: 0 },
  MID: { goal: 5, assist: 1, clean_sheet: 1, conceded_per_goal:  0, penalty_saved: 0 },
  FWD: { goal: 3, assist: 1, clean_sheet: 0, conceded_per_goal:  0, penalty_saved: 0 },
};
const FALLBACK_UNIV = { own_goal: -2, yellow_card: -1, red_card: -3, penalty_missed: -1 };

function realDelta(type, pos, isCap, isTripleCap, PR, UR) {
  const r = PR[pos] ?? {};
  const base = {
    goal:         r.goal              ?? 0,
    assist:       r.assist            ?? 0,
    clean_sheet:  r.clean_sheet       ?? 0,
    yellow_card:  UR.yellow_card      ?? -1,
    red_card:     UR.red_card         ?? -3,
    penalty_save: r.penalty_saved     ?? 0,
    penalty_miss: UR.penalty_missed   ?? -1,
    own_goal:     UR.own_goal         ?? -2,
    conceded:     r.conceded_per_goal ?? 0,
    bonus:        1,
    sub_off:      0,
    sub_on:       0,
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
      const x = n === 1 ? 50 : Math.round(20 + (i / (n - 1)) * 60);
      positioned.push({ ...p, x, y: POS_Y[pos] || 50 });
    });
  }
  return positioned;
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function LiveScreen() {
  const { user } = useAuth();

  const [loading,      setLoading]      = useState(true);
  const [liveError,    setLiveError]    = useState(null);
  const [liveFixtures, setLiveFixtures] = useState([]);
  const [nextFixture,  setNextFixture]  = useState(null);
  const [userLeagues,  setUserLeagues]  = useState([]);
  const [squadPlayers, setSquadPlayers] = useState([]);
  const [events,       setEvents]       = useState([]);
  const [activeLeague, setActiveLeague] = useState(null);
  const [mobileTab,    setMobileTab]    = useState('squad');
  const [currentGW,    setCurrentGW]    = useState('—');
  const [benchPlayers, setBenchPlayers] = useState([]);

  const initialSet = useRef(false);

  const fetchAll = useCallback(async () => {
    try {
      // 0. Current matchday label — prefer next upcoming deadline, fall back to most recent past.
      // Filtered by active league's tournament (BUG-12 fix).
      const activeTournamentId = activeLeague?.tournamentId ?? null;
      const now = new Date().toISOString();
      let upcomingQuery = supabase.from('matchday_deadlines').select('matchday_id')
        .gt('deadline_at', now).order('deadline_at', { ascending: true }).limit(1);
      if (activeTournamentId) upcomingQuery = upcomingQuery.eq('tournament_id', activeTournamentId);
      let { data: mdRow } = await upcomingQuery.maybeSingle();
      if (!mdRow?.matchday_id) {
        let pastQuery = supabase.from('matchday_deadlines').select('matchday_id')
          .lte('deadline_at', now).order('deadline_at', { ascending: false }).limit(1);
        if (activeTournamentId) pastQuery = pastQuery.eq('tournament_id', activeTournamentId);
        ({ data: mdRow } = await pastQuery.maybeSingle());
      }
      if (mdRow?.matchday_id) {
        const label = String(mdRow.matchday_id).replace(/^.*-r/, '');
        setCurrentGW(label || mdRow.matchday_id);
      }

      // 1. Live fixtures — U55: use home_score/away_score columns directly
      const { data: fixData = [] } = await supabase
        .from('fixtures')
        .select('id, home_team, away_team, status, kickoff_at, minute, home_score, away_score, tournament_id')
        .eq('status', 'live')
        .order('kickoff_at', { ascending: true });

      const activeFixIds = (fixData || []).map(f => f.id);

      // U55: use stored score columns instead of counting events
      const enrichedFix = (fixData || []).map(f => ({
        ...f,
        homeGoals: f.home_score ?? 0,
        awayGoals: f.away_score ?? 0,
      }));
      setLiveFixtures(enrichedFix);

      // Fetch next upcoming fixture — filtered by active league's tournament (BUG-12 fix)
      if (!activeFixIds.length) {
        let upcomingQ = supabase.from('fixtures')
          .select('id, home_team, away_team, status, kickoff_at, tournament_id')
          .eq('status', 'scheduled')
          .gt('kickoff_at', new Date().toISOString())
          .order('kickoff_at', { ascending: true })
          .limit(1);
        if (activeTournamentId) upcomingQ = upcomingQ.eq('tournament_id', activeTournamentId);
        const { data: upcomingData = [] } = await upcomingQ;
        if (upcomingData?.length) setNextFixture(upcomingData[0]);
      } else {
        setNextFixture(null);
      }

      if (!user?.id) { setLoading(false); return; }

      // 2. User leagues
      const { data: memberships = [] } = await supabase
        .from('league_members')
        .select('league_id, total_points, rank, leagues(id, name, tournament_id)')
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

      // 4. Squad — U48: fetch per league so chip state is league-scoped
      const { data: squadRows = [] } = leagueIds.length
        ? await supabase
            .from('squads')
            .select('league_id, players, captain_id, is_triple_captain')
            .eq('user_id', user.id)
            .in('league_id', leagueIds)
        : { data: [] };

      // Build a map of league_id → squad row for chip lookup
      const squadByLeague = Object.fromEntries((squadRows || []).map(s => [s.league_id, s]));

      // Use the active league's squad for pitch display; fall back to first available
      const activeLeagueId = initialSet.current && activeLeague?.id
        ? activeLeague.id
        : (memberships?.[0]?.league_id ?? null);
      const squadRow       = squadByLeague[activeLeagueId] ?? (squadRows?.[0] ?? null);

      const squadPlayerIds = squadRow?.players || [];
      const captainId      = squadRow?.captain_id;
      const isTripleCap    = squadRow?.is_triple_captain ?? false;

      // 5. Player details + live stats in parallel — U50/U52: fetch minutes_played
      const [{ data: playerRows = [] }, { data: statsData = [] }] = await Promise.all([
        squadPlayerIds.length
          ? supabase.from('players').select('id, name, position, club').in('id', squadPlayerIds)
          : Promise.resolve({ data: [] }),
        activeFixIds.length && squadPlayerIds.length
          ? supabase.from('player_match_stats')
              .select('player_id, fantasy_points, fixture_id, minutes_played')
              .in('player_id', squadPlayerIds)
              .in('fixture_id', activeFixIds)
          : Promise.resolve({ data: [] }),
      ]);

      // Live player set (has stats in a live fixture with > 0 minutes — U50)
      const minutesMap = {};
      (statsData || []).forEach(s => {
        minutesMap[s.player_id] = (minutesMap[s.player_id] || 0) + (s.minutes_played ?? 0);
      });
      const livePlayerSet = new Set(
        (statsData || [])
          .filter(s => (minutesMap[s.player_id] ?? 0) > 0)
          .map(s => s.player_id)
      );
      const pointsMap = {};
      (statsData || []).forEach(s => {
        pointsMap[s.player_id] = (pointsMap[s.player_id] || 0) + Number(s.fantasy_points);
      });

      // Apply captain multiplier; tag bench players (index >= 11 in squadPlayerIds)
      const benchSet = new Set(squadPlayerIds.slice(11));
      const enrichedPlayers = (playerRows || []).map(p => {
        let pts = pointsMap[p.id] || 0;
        const isBench = benchSet.has(p.id);
        if (!isBench && p.id === captainId) pts *= isTripleCap ? 3 : 2;
        return { ...p, points: pts, live: livePlayerSet.has(p.id), isBench, minutes: minutesMap[p.id] ?? null };
      });

      // Starters only on pitch; bench tracked separately
      const starters = enrichedPlayers.filter(p => !p.isBench);
      const bench    = squadPlayerIds.slice(11).map(id => enrichedPlayers.find(p => p.id === id)).filter(Boolean);
      const positioned = positionPlayers(starters);
      setSquadPlayers(positioned);
      setBenchPlayers(bench);

      // 6. Enrich leagues with tones + totals
      // U48: use per-league squad row so chip state is scoped to each league
      const enrichedLeagues = (memberships || []).map((m, idx) => {
        const tone          = LEAGUE_TONES[idx % LEAGUE_TONES.length];
        const nameParts     = (m.leagues?.name || 'League').split(' ');
        const short         = nameParts.map(w => w[0]).join('').toUpperCase().slice(0, 5);
        const members       = countMap[m.league_id] || '—';
        const total         = m.total_points || 0;
        const rankLabel     = m.rank ? `${m.rank} / ${members}` : '—';
        const leagueSquad   = squadByLeague[m.league_id];
        const lgTripleCap   = leagueSquad?.is_triple_captain ?? false;
        return {
          id:           m.league_id,
          name:         m.leagues?.name || 'League',
          tournamentId: m.leagues?.tournament_id ?? null,
          short,
          tone,
          members,
          captainId: leagueSquad?.captain_id ?? captainId,
          chip:      lgTripleCap ? 'Triple Captain' : null,
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

      // BUG-12: on first load activeTournamentId was null because activeLeague
      // hadn't been set yet. Now that we know the user's leagues, correct the
      // next-fixture display if it was fetched without a tournament filter.
      const resolvedTId = activeTournamentId ?? enrichedLeagues[0]?.tournamentId ?? null;
      if (!activeFixIds.length && !activeTournamentId && resolvedTId) {
        const { data: corrected = [] } = await supabase
          .from('fixtures')
          .select('id, home_team, away_team, status, kickoff_at, tournament_id')
          .eq('status', 'scheduled')
          .gt('kickoff_at', new Date().toISOString())
          .eq('tournament_id', resolvedTId)
          .order('kickoff_at', { ascending: true })
          .limit(1);
        if (corrected?.length) setNextFixture(corrected[0]);
      }

      // 7. Match events → fan out per league (delta differs per captain/chip)
      if (activeFixIds.length && squadPlayerIds.length) {
        // U46: fetch events and scoring_rules in parallel
        const activeTournamentIds = [...new Set((fixData || []).map(f => f.tournament_id).filter(Boolean))];
        const [{ data: evData = [] }, { data: ruleRows = [] }] = await Promise.all([
          supabase
            .from('match_events')
            .select('id, fixture_id, player_id, type, minute, team')
            .in('fixture_id', activeFixIds)
            .in('player_id', squadPlayerIds)
            .order('minute', { ascending: false })
            .limit(100),
          activeTournamentIds.length
            ? supabase.from('scoring_rules').select('position, rules').in('tournament_id', activeTournamentIds)
            : Promise.resolve({ data: [] }),
        ]);

        // Build per-position scoring lookup from DB rows, falling back to EPL defaults
        const posRules = { ...FALLBACK_POS };
        let   univRules = { ...FALLBACK_UNIV };
        for (const r of ruleRows || []) {
          if (r.position === 'UNIVERSAL') univRules = { ...FALLBACK_UNIV, ...r.rules };
          else if (FALLBACK_POS[r.position]) posRules[r.position] = { ...FALLBACK_POS[r.position], ...r.rules };
        }

        const playerMap = Object.fromEntries((playerRows || []).map(p => [p.id, p]));
        const fanned = [];
        for (const ev of evData || []) {
          const p     = playerMap[ev.player_id];
          if (!p) continue;
          const isCap = p.id === captainId;
          for (const lg of enrichedLeagues) {
            const isTripleForLeague = isCap && lg.chip === 'Triple Captain';
            const delta = realDelta(ev.type, p.position, isCap, isTripleForLeague, posRules, univRules);
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

      setLiveError(null);
    } catch (err) {
      console.error('LiveScreen fetch error', err);
      setLiveError('Live data could not be loaded. Scores may be stale.');
    } finally {
      setLoading(false);
    }
  // activeLeague?.id in deps so the squad re-fetches whenever the user switches leagues
  }, [user?.id, activeLeague?.id]);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, REFRESH_MS);
    return () => clearInterval(interval);
  }, [fetchAll]);

  // U101: refresh immediately when user returns to this tab after backgrounding
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') fetchAll();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [fetchAll]);

  // U6: Realtime subscriptions — match_events INSERT and player_match_stats UPDATE
  // filtered to currently-live fixtures. Re-subscribes whenever liveFixtures changes.
  useEffect(() => {
    const ids = liveFixtures.map(f => f.id);
    if (!ids.length) return;

    const idList = ids.join(',');
    const evCh = supabase
      .channel(`live-match-events-${idList}`)
      .on('postgres_changes', {
        event:  'INSERT',
        schema: 'public',
        table:  'match_events',
        filter: `fixture_id=in.(${idList})`,
      }, () => fetchAll())
      .subscribe();

    const statsCh = supabase
      .channel(`live-player-stats-${idList}`)
      .on('postgres_changes', {
        event:  'UPDATE',
        schema: 'public',
        table:  'player_match_stats',
        filter: `fixture_id=in.(${idList})`,
      }, () => fetchAll())
      .subscribe();

    return () => {
      supabase.removeChannel(evCh);
      supabase.removeChannel(statsCh);
    };
  }, [liveFixtures, fetchAll]);

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

      {/* Live data error banner */}
      {liveError && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 20px', background: 'rgba(240,58,58,0.12)', borderBottom: '1px solid rgba(240,58,58,0.25)' }}>
          <span style={{ color: 'var(--danger)', fontSize: 12 }}>⚠ {liveError}</span>
          <button
            onClick={() => { setLiveError(null); fetchAll(); }}
            style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--danger)', background: 'rgba(240,58,58,0.18)', border: '1px solid rgba(240,58,58,0.35)', borderRadius: 4, padding: '3px 10px', cursor: 'pointer', letterSpacing: '.1em' }}
          >RETRY</button>
        </div>
      )}

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
            <div style={{ padding: '12px 20px', fontSize: 11, color: 'var(--paper)', display: 'flex', alignItems: 'center', gap: 12, width: '100%' }}>
              {loading ? (
                <span className="mono" style={{ color: 'var(--mute)' }}>Connecting…</span>
              ) : nextFixture ? (
                <>
                  <span className="mono" style={{ color: 'var(--mute)', fontSize: 10, letterSpacing: '.18em' }}>NEXT</span>
                  <span style={{ fontFamily: 'Archivo Black', fontSize: 14, letterSpacing: '-0.01em' }}>
                    {teamCode(nextFixture.home_team)}
                    <span style={{ color: 'var(--mute)', margin: '0 8px' }}>vs</span>
                    {teamCode(nextFixture.away_team)}
                  </span>
                  <span className="mono" style={{ color: 'var(--mute)', fontSize: 10, marginLeft: 'auto' }}>
                    {nextFixture.kickoff_at ? new Date(nextFixture.kickoff_at).toLocaleDateString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}
                  </span>
                </>
              ) : (
                <span className="mono" style={{ color: 'var(--mute)' }}>No upcoming matches</span>
              )}
            </div>
          ) : liveFixtures.map((f, i) => {
            // U47: status transition labels
            const isHT         = f.minute === 45 || f.status === 'halftime';
            const isFT         = f.status === 'finished';
            const isPostponed  = f.status === 'postponed' || f.status === 'cancelled' || f.status === 'abandoned';
            const statusLabel  = isPostponed ? 'PST' : isFT ? 'FT' : isHT ? 'HT' : f.minute ? `${f.minute}'` : '—';
            const statusColor  = isPostponed ? 'var(--gold)' : isFT ? 'var(--mute)' : 'var(--mute)';
            return (
              <div key={f.id} style={{ flex: 1, padding: '10px 16px', borderLeft: i ? '1px solid var(--rule)' : 'none', display: 'flex', alignItems: 'center', gap: 14 }}>
                {isPostponed ? (
                  <span className="mono" style={{ fontSize: 9, color: 'var(--gold)', letterSpacing: '.18em', background: 'rgba(240,180,0,.1)', padding: '2px 5px' }}>PST</span>
                ) : isFT ? (
                  <span className="mono" style={{ fontSize: 9, color: 'var(--mute)', letterSpacing: '.18em' }}>FT</span>
                ) : (
                  <LivePill />
                )}
                <span className="mono" style={{ fontSize: 11, color: statusColor, letterSpacing: '.18em' }}>{isHT ? 'HT' : statusLabel}</span>
                <span style={{ fontFamily: 'Archivo Black', fontSize: 14, letterSpacing: '-0.01em', marginLeft: 'auto' }}>
                  {teamCode(f.home_team)}
                  <span style={{ color: 'var(--cyan)', margin: '0 8px' }}>{f.homeGoals ?? 0}–{f.awayGoals ?? 0}</span>
                  {teamCode(f.away_team)}
                </span>
              </div>
            );
          })}
        </div>

        {/* League selector */}
        {desktopLeagueSelector}

        {/* Body — two columns */}
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'minmax(0, 520px) 1fr', minHeight: 0 }}>

          {/* Left: mini pitch + bench */}
          <div style={{ padding: '20px 24px', borderRight: '1px solid var(--rule)', display: 'flex', flexDirection: 'column', gap: 14, minHeight: 0, overflowY: 'auto' }}>
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

            {/* U52: Captain DNP banner */}
            {(() => {
              const cap = squadPlayers.find(p => activeLeague && p.id === activeLeague.captainId);
              if (cap && liveFixtures.length > 0 && cap.live === false && cap.minutes === 0) {
                return (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', background: 'rgba(240,180,0,.08)', border: '1px solid rgba(240,180,0,.25)', borderRadius: 3 }}>
                    <span style={{ fontFamily: 'Archivo Black', fontSize: 9, background: 'var(--gold)', color: 'var(--ink)', padding: '1px 5px' }}>C</span>
                    <span className="mono" style={{ fontSize: 9, color: 'var(--gold)', letterSpacing: '.14em' }}>
                      {(cap.name || '').split(' ').pop().toUpperCase()} — DID NOT PLAY YET
                    </span>
                  </div>
                );
              }
              return null;
            })()}

            <div style={{ minHeight: 'clamp(280px, calc(100dvh - 380px), 620px)' }}>
              {loading ? (
                <div className="mono" style={{ fontSize: 10, color: 'var(--mute)', padding: 20 }}>Loading squad…</div>
              ) : squadPlayers.length === 0 ? (
                <div className="mono" style={{ fontSize: 10, color: 'var(--mute)', padding: 20 }}>No squad data</div>
              ) : (
                <MiniPitch players={squadPlayers} activeLeague={activeLeague} gwLabel={`GW ${currentGW}`} />
              )}
            </div>

            {/* U51: Bench section */}
            {benchPlayers.length > 0 && (
              <div style={{ borderTop: '1px solid var(--rule)', paddingTop: 12 }}>
                <div className="mono" style={{ fontSize: 9, color: 'var(--mute)', letterSpacing: '.18em', marginBottom: 8 }}>BENCH</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {benchPlayers.map((p, idx) => (
                    <div key={p.id} style={{
                      flex: 1, padding: '6px 8px',
                      background: 'var(--ink-2)',
                      border: `1px solid ${p.live ? 'var(--danger)' : 'var(--rule)'}`,
                      borderLeft: `2px solid ${POS_TONE[p.position] || 'var(--mute)'}`,
                      borderRadius: 2, minWidth: 0,
                    }}>
                      <div className="mono" style={{ fontSize: 8, color: 'var(--mute)', letterSpacing: '.12em', marginBottom: 2 }}>{idx + 1} · {p.position}</div>
                      <div style={{ fontFamily: 'Archivo Black', fontSize: 10, letterSpacing: '-0.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {(p.name || '').split(' ').pop().toUpperCase()}
                      </div>
                      <div style={{ fontFamily: 'Archivo Black', fontSize: 11, color: (p.points ?? 0) >= 0 ? 'var(--mute)' : 'var(--danger)', marginTop: 2 }}>
                        {(p.points ?? 0) >= 0 ? (p.points ?? 0) : `−${Math.abs(p.points)}`}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

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
              {loading ? (
                <span className="mono" style={{ fontSize: 10, color: 'var(--mute)' }}>Connecting…</span>
              ) : nextFixture ? (
                <>
                  <span className="mono" style={{ fontSize: 9, color: 'var(--mute)', letterSpacing: '.18em' }}>NEXT</span>
                  <span style={{ fontFamily: 'Archivo Black', fontSize: 12, letterSpacing: '-0.01em' }}>
                    {teamCode(nextFixture.home_team)} vs {teamCode(nextFixture.away_team)}
                  </span>
                  {nextFixture.kickoff_at && (
                    <span className="mono" style={{ fontSize: 9, color: 'var(--mute)', marginLeft: 'auto' }}>
                      {new Date(nextFixture.kickoff_at).toLocaleDateString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </>
              ) : (
                <span className="mono" style={{ fontSize: 10, color: 'var(--mute)' }}>No upcoming matches</span>
              )}
            </div>
          ) : liveFixtures.map((f, i) => {
            const isHT        = f.minute === 45 || f.status === 'halftime';
            const isFT        = f.status === 'finished';
            const isPostponed = f.status === 'postponed' || f.status === 'cancelled' || f.status === 'abandoned';
            const statusLabel = isPostponed ? 'PST' : isFT ? 'FT' : isHT ? 'HT' : f.minute ? `${f.minute}'` : '—';
            return (
              <div key={f.id} style={{ padding: '10px 18px', display: 'flex', alignItems: 'center', gap: 12, borderTop: i ? '1px solid var(--rule)' : 'none' }}>
                {isPostponed ? (
                  <span className="mono" style={{ fontSize: 8, color: 'var(--gold)', letterSpacing: '.18em', background: 'rgba(240,180,0,.1)', padding: '1px 4px' }}>PST</span>
                ) : isFT ? (
                  <span className="mono" style={{ fontSize: 9, color: 'var(--mute)', letterSpacing: '.1em' }}>FT</span>
                ) : (
                  <span className="animate-live-pulse" style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: 'var(--danger)' }} />
                )}
                <span className="mono" style={{ fontSize: 10, color: isPostponed ? 'var(--gold)' : 'var(--mute)', letterSpacing: '.18em' }}>{isHT ? 'HT' : statusLabel}</span>
                <span style={{ fontFamily: 'Archivo Black', fontSize: 14, marginLeft: 'auto' }}>
                  {teamCode(f.home_team)}
                  <span style={{ color: 'var(--cyan)', margin: '0 6px' }}>{f.homeGoals ?? 0}–{f.awayGoals ?? 0}</span>
                  {teamCode(f.away_team)}
                </span>
              </div>
            );
          })}
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

                  {/* U52: Captain DNP banner — mobile */}
                  {(() => {
                    const cap = squadPlayers.find(p => activeLeague && p.id === activeLeague.captainId);
                    if (cap && liveFixtures.length > 0 && cap.live === false && cap.minutes === 0) {
                      return (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', marginBottom: 8, background: 'rgba(240,180,0,.08)', border: '1px solid rgba(240,180,0,.25)', borderRadius: 3 }}>
                          <span style={{ fontFamily: 'Archivo Black', fontSize: 9, background: 'var(--gold)', color: 'var(--ink)', padding: '1px 4px' }}>C</span>
                          <span className="mono" style={{ fontSize: 9, color: 'var(--gold)', letterSpacing: '.12em' }}>
                            {(cap.name || '').split(' ').pop().toUpperCase()} — DNP
                          </span>
                        </div>
                      );
                    }
                    return null;
                  })()}

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

                  {/* U51: Bench — mobile */}
                  {benchPlayers.length > 0 && (
                    <div style={{ borderTop: '1px solid var(--rule)', paddingTop: 8, marginTop: 4 }}>
                      <div className="mono" style={{ fontSize: 9, color: 'var(--mute)', letterSpacing: '.16em', margin: '4px 0 8px' }}>BENCH · {benchPlayers.length}</div>
                      {benchPlayers.map((p, idx) => (
                        <div key={p.id} style={{ display: 'grid', gridTemplateColumns: '18px 1fr auto', gap: 10, alignItems: 'center', padding: '7px 0', borderTop: idx ? '1px solid rgba(242,238,229,.04)' : 'none' }}>
                          <div className="mono" style={{ fontSize: 8, color: 'var(--mute)', opacity: .6 }}>{idx + 1}</div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ width: 5, height: 5, borderRadius: '50%', background: p.live ? 'var(--danger)' : 'rgba(242,238,229,.2)', flexShrink: 0 }} className={p.live ? 'animate-live-pulse' : ''} />
                            <span style={{ fontFamily: 'Archivo Black', fontSize: 12, letterSpacing: '-0.01em' }}>{(p.name || '').split(' ').pop().toUpperCase()}</span>
                            <span className="mono" style={{ fontSize: 8, color: 'var(--mute)' }}>{p.position}</span>
                          </div>
                          <div style={{ fontFamily: 'Archivo Black', fontSize: 13, color: 'var(--mute)' }}>{p.points ?? 0}</div>
                        </div>
                      ))}
                    </div>
                  )}
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
