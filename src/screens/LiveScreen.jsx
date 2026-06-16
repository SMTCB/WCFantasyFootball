import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';

// ── Constants ────────────────────────────────────────────────────────────────

const REFRESH_MS = 60 * 1000; // 60s safety-net poll — Realtime handles sub-second updates

const LEAGUE_TONES = ['#00B4D8', '#E0A800', '#A855F7', '#22C55E', '#F59E0B'];

import { POS_ORDER, POS_PITCH_Y as POS_Y } from '../lib/formations';
import ScoringInfoModal from '../components/ScoringInfoModal';
import { teamCode } from '../lib/fixtures';
const POS_TONE = { FWD: 'var(--danger)', MID: 'var(--gold)', DEF: 'var(--cyan)', GK: '#A855F7' };

// ── Shared primitives ────────────────────────────────────────────────────────

function LivePill({ size = 10 }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span className="animate-live-pulse" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--danger)' }} />
      <span className="font-mono" style={{ fontSize: size, letterSpacing: '.22em', color: 'var(--danger)' }}>LIVE</span>
    </span>
  );
}

// delta = current GW fantasy points for this league. null = not yet fetched / no data.
function DeltaPill({ delta, big = false }) {
  const hasData = delta !== null && delta !== undefined;
  const pos     = hasData && delta > 0;
  const tone    = pos ? 'var(--positive)' : 'var(--mute)';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 3 }}>
      <span style={{ fontFamily: 'Archivo Black', fontSize: big ? 16 : 13, letterSpacing: '-0.02em', color: tone }}>
        {!hasData ? '—' : delta === 0 ? '0' : `+${delta}`}
      </span>
      <span className="font-mono" style={{ fontSize: 8, color: 'var(--mute)', letterSpacing: '.14em' }}>GW</span>
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
      <span className="font-mono" style={{ fontSize: compact ? 9 : 10, letterSpacing: '.14em', color: league.tone }}>
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
        <div key={l.label} className="font-mono" style={{ position: 'absolute', left: 10, top: `${l.y}%`, transform: 'translateY(-50%)', fontSize: 8, color: 'rgba(0,180,216,.45)', background: '#0A0D12', padding: '1px 3px' }}>{l.label}</div>
      ))}
      {/* centre circle */}
      <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: '30%', aspectRatio: '1', borderRadius: '50%', border: '1px solid rgba(242,238,229,.04)' }} />
      {/* header */}
      <div style={{ position: 'absolute', top: 10, left: 14, right: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="font-mono" style={{ fontSize: 9, color: 'var(--mute)', letterSpacing: '.22em' }}>STARTING XI · {formation}</div>
        <div className="font-mono" style={{ fontSize: 9, color: activeLeague ? activeLeague.tone : 'var(--mute)', letterSpacing: '.22em' }}>
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
  // Shrink cards when a row is crowded to prevent overlap
  const cardMinW  = (p.rowSize ?? 1) >= 5 ? 58 : (p.rowSize ?? 1) >= 4 ? 66 : 74;
  return (
    <div style={{ position: 'absolute', left: `${p.x}%`, top: `${p.y}%`, transform: 'translate(-50%,-50%)' }}>
      {/* Captain badge lives outside the overflow:hidden card so it isn't clipped */}
      {isCaptain && (
        <span style={{
          position: 'absolute', top: -7, left: -7, zIndex: 2,
          width: 16, height: 16, borderRadius: '50%',
          background: 'var(--gold)', color: 'var(--ink)',
          fontFamily: 'Archivo Black', fontSize: 9,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: '2px solid var(--ink)',
          pointerEvents: 'none',
        }}>{isTriple ? '3' : 'C'}</span>
      )}
      {p.live && (
        <span className="animate-live-pulse" style={{ position: 'absolute', top: -3, right: -3, zIndex: 2, width: 7, height: 7, borderRadius: '50%', background: 'var(--danger)', pointerEvents: 'none' }} />
      )}
      <div style={{
        position: 'relative',
        padding: '4px 6px',
        background: 'rgba(15,18,24,.94)',
        border: `1px solid ${isCaptain ? 'rgba(255,196,0,.5)' : 'var(--rule)'}`,
        borderLeft: `2px solid ${isCaptain ? 'var(--gold)' : tone}`,
        borderRadius: 2,
        minWidth: cardMinW, maxWidth: cardMinW + 10, textAlign: 'center',
        boxShadow: isCaptain ? '0 0 0 1px rgba(255,196,0,.15)' : 'none',
        overflow: 'hidden',
      }}>
        <div style={{ fontFamily: 'Archivo Black', fontSize: (p.rowSize ?? 1) >= 5 ? 9 : 10, letterSpacing: '-0.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {(p.name || '').split(' ').pop().toUpperCase()}
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 3, marginTop: 1 }}>
          {(p.rowSize ?? 1) < 5 && (
            <>
              <span className="font-mono" style={{ fontSize: 7, color: 'var(--mute)', maxWidth: 36, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {(p.club || '').split(' ')[0]}
              </span>
              <span style={{ width: 2, height: 2, borderRadius: '50%', background: 'var(--mute)', flexShrink: 0 }} />
            </>
          )}
          <span style={{ fontFamily: 'Archivo Black', fontSize: 10, color: (p.points ?? 0) >= 0 ? 'var(--paper)' : 'var(--danger)', flexShrink: 0 }}>
            {(() => { const pts = p.displayPoints ?? Math.round(p.points ?? 0); return pts >= 0 ? pts : `−${Math.abs(pts)}`; })()}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── DesktopStatsRow — wider layout for desktop events panel ──────────────────
function DesktopStatsRow({ s }) {
  const pts    = Math.round(s.points ?? 0);
  const ptsPos = pts >= 0;
  const name   = (s.playerName || '').split(' ').pop().toUpperCase();

  const tags = [];
  if (s.goals         > 0) tags.push({ label: `${s.goals}G`,  neg: false });
  if (s.assists       > 0) tags.push({ label: `${s.assists}A`, neg: false });
  if (s.cleanSheet)        tags.push({ label: 'CS',            neg: false });
  if (s.yellowCards   > 0) tags.push({ label: 'YC',            neg: true  });
  if (s.redCards      > 0) tags.push({ label: 'RC',            neg: true  });
  if (s.penaltyScored > 0) tags.push({ label: `${s.penaltyScored}P`, neg: false });
  if (s.penaltyMissed > 0) tags.push({ label: 'PM',            neg: true  });
  if (s.goalsConceded > 0) tags.push({ label: `−${s.goalsConceded}GA`, neg: true });
  if (!tags.length && s.minutesPlayed > 0) tags.push({ label: `${s.minutesPlayed}'`, neg: false });

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '44px 22px 1fr auto auto',
      alignItems: 'center', gap: 12, padding: '10px 16px',
      borderBottom: '1px solid var(--rule)',
    }}>
      {/* Position badge */}
      <span className="font-mono" style={{ fontSize: 9, color: 'var(--mute)' }}>{s.position}</span>
      {/* Captain marker */}
      <span style={{
        width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
        background: s.isCap ? 'var(--gold)' : 'transparent',
        color: 'var(--ink)', fontFamily: 'Archivo Black', fontSize: 9,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>{s.isCap ? (s.isTripleCap ? '3' : 'C') : ''}</span>
      {/* Name + club + tags */}
      <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontFamily: 'Archivo Black', fontSize: 13, letterSpacing: '-0.01em' }}>{name}</span>
          <span className="font-mono" style={{ fontSize: 9, color: 'var(--mute)' }}>{(s.club || '').split(' ').slice(0, 2).join(' ')}</span>
        </div>
        {tags.length > 0 && (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {tags.map(t => (
              <span key={t.label} className="font-mono" style={{
                fontSize: 8, padding: '1px 5px', borderRadius: 2,
                background: t.neg ? 'rgba(239,68,68,.15)' : 'rgba(34,197,94,.12)',
                color: t.neg ? 'var(--danger)' : 'var(--positive)',
                letterSpacing: '.1em',
              }}>{t.label}</span>
            ))}
          </div>
        )}
      </div>
      {/* Points */}
      <span style={{ fontFamily: 'Archivo Black', fontSize: 18, color: ptsPos ? 'var(--paper)' : 'var(--danger)' }}>
        {ptsPos ? pts : `−${Math.abs(pts)}`}
      </span>
      <span />
    </div>
  );
}

// ── StatsLogRow — live points breakdown from player_match_stats ──────────────
// Shown on the Events tab during a live match before match_events are available.
// Each row = one squad player, with their scoring contributions summarised.
function StatsLogRow({ s }) {
  const pts    = Math.round(s.points ?? 0);
  const ptsPos = pts >= 0;
  const name   = (s.playerName || '').split(' ').pop().toUpperCase();

  // Build a compact contribution label (e.g. "2G · 1A · CS")
  const tags = [];
  if (s.goals          > 0) tags.push(`${s.goals}G`);
  if (s.assists        > 0) tags.push(`${s.assists}A`);
  if (s.cleanSheet)          tags.push('CS');
  if (s.saves          > 0) tags.push(`${s.saves}SV`);
  if (s.keyPasses      > 0) tags.push(`${s.keyPasses}KP`);
  if (s.shotsOnTarget  > 0) tags.push(`${s.shotsOnTarget}SoT`);
  if (s.bigChances     > 0) tags.push(`${s.bigChances}BC`);
  if (s.yellowCards    > 0) tags.push('YC');
  if (s.redCards       > 0) tags.push('RC');
  if (s.penaltyMissed  > 0) tags.push('PM');
  if (!tags.length && s.minutesPlayed > 0) tags.push(`${s.minutesPlayed}'`);

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, alignItems: 'center',
      padding: '10px 18px', borderTop: '1px solid var(--rule)',
    }}>
      <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontFamily: 'Archivo Black', fontSize: 13, letterSpacing: '-0.01em' }}>{name}</span>
          <span className="font-mono" style={{ fontSize: 8, color: 'var(--mute)' }}>{s.position}</span>
          <span className="font-mono" style={{ fontSize: 8, color: 'var(--mute)', opacity: .6 }}>{(s.club || '').split(' ')[0]}</span>
          {s.isCap && (
            <span style={{ fontFamily: 'Archivo Black', fontSize: 8, background: 'var(--gold)', color: 'var(--ink)', padding: '1px 4px', lineHeight: 1 }}>
              {s.isTripleCap ? '3×C' : 'C'}
            </span>
          )}
        </div>
        {tags.length > 0 && (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {tags.map(t => (
              <span key={t} className="font-mono" style={{
                fontSize: 8, padding: '1px 5px', borderRadius: 2,
                background: t.startsWith('−') || t === 'YC' || t === 'RC' || t === 'PM'
                  ? 'rgba(239,68,68,.15)' : 'rgba(34,197,94,.12)',
                color: t.startsWith('−') || t === 'YC' || t === 'RC' || t === 'PM'
                  ? 'var(--danger)' : 'var(--positive)',
                letterSpacing: '.1em',
              }}>{t}</span>
            ))}
          </div>
        )}
      </div>
      <span style={{
        fontFamily: 'Archivo Black', fontSize: 18, letterSpacing: '-0.02em',
        color: ptsPos ? 'var(--paper)' : 'var(--danger)',
      }}>
        {ptsPos ? pts : `−${Math.abs(pts)}`}
      </span>
    </div>
  );
}

function MobSquadRow({ p, activeLeague }) {
  const isCap   = activeLeague && activeLeague.captainId === p.id;
  const isTriple = isCap && activeLeague.chip === 'Triple Captain';
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '22px 1fr auto', gap: 10, alignItems: 'center', padding: '8px 0' }}>
      <div className="font-mono" style={{ fontSize: 9, color: 'var(--mute)' }}>{p.position}</div>
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
        <span className="font-mono" style={{ fontSize: 9, color: 'var(--mute)', marginLeft: 'auto' }}>{p.club || '—'}</span>
      </div>
      <div style={{ fontFamily: 'Archivo Black', fontSize: 14, letterSpacing: '-0.02em', color: (p.points ?? 0) >= 0 ? 'var(--cyan)' : 'var(--danger)' }}>
        {(() => { const pts = p.displayPoints ?? Math.round(p.points ?? 0); return pts >= 0 ? pts : `−${Math.abs(pts)}`; })()}
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildFormation(players) {
  const counts = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  players.forEach(p => { if (counts[p.position] !== undefined) counts[p.position]++; });
  // Only show non-zero outfield lines; GK is always assumed (1)
  const parts = [counts.DEF, counts.MID, counts.FWD].filter(n => n > 0);
  return parts.join('-') || '—';
}

// Enforce valid starting XI: exactly 1 GK, at least 1 DEF/MID/FWD, total 11.
// Takes the full squad id array and a {id→player} lookup.
// Returns a Set of the 11 valid starter ids.
function pickValidStarters(squadIds, playerLookup) {
  const byPos = { GK: [], DEF: [], MID: [], FWD: [] };
  for (const id of squadIds) {
    const p = playerLookup[id];
    if (p && byPos[p.position]) byPos[p.position].push(id);
  }

  const starters = new Set();

  // Step 1 — mandatory minimums (1 GK + 1 each outfield)
  if (byPos.GK.length)  starters.add(byPos.GK[0]);
  if (byPos.DEF.length) starters.add(byPos.DEF[0]);
  if (byPos.MID.length) starters.add(byPos.MID[0]);
  if (byPos.FWD.length) starters.add(byPos.FWD[0]);

  // Step 2 — fill remaining slots in squad-array order, skip extra GKs
  for (const id of squadIds) {
    if (starters.size >= 11) break;
    if (starters.has(id)) continue;
    const p = playerLookup[id];
    if (!p) continue;
    // Only allow 1 GK in the starting XI
    const gkAlreadyIn = [...starters].some(sid => playerLookup[sid]?.position === 'GK');
    if (p.position === 'GK' && gkAlreadyIn) continue;
    starters.add(id);
  }

  return starters;
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
      // rowSize drives dynamic card width in MiniTok to prevent overlap
      positioned.push({ ...p, x, y: POS_Y[pos] || 50, rowSize: n });
    });
  }
  return positioned;
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function LiveScreen() {
  const { user } = useAuth();

  const [loading,      setLoading]      = useState(true);
  const [liveError,    setLiveError]    = useState(null);
  const [liveFixtures,  setLiveFixtures]  = useState([]);
  const [nextFixture,   setNextFixture]   = useState(null);
  const [userLeagues,   setUserLeagues]   = useState([]);
  const [squadPlayers,  setSquadPlayers]  = useState([]);
  const [liveStatsLog,  setLiveStatsLog]  = useState([]); // live pts breakdown from player_match_stats
  const [showScoringModal, setShowScoringModal] = useState(false);
  const [activeLeague,  setActiveLeague]  = useState(null);
  const [mobileTab,     setMobileTab]     = useState('squad');
  const [currentGW,     setCurrentGW]     = useState('—');
  const [benchPlayers,  setBenchPlayers]  = useState([]);

  const initialSet = useRef(false);

  const fetchAll = useCallback(async () => {
    try {
      // 0. Current matchday label — prefer the most recent past deadline (the round
      // currently being played, even after its deadline passes but before it completes),
      // fall back to the next upcoming deadline (pre-competition). Filtered by active
      // league's tournament (BUG-12 fix).
      const activeTournamentId = activeLeague?.tournamentId ?? null;
      const now = new Date().toISOString();
      let pastQuery = supabase.from('matchday_deadlines').select('matchday_id')
        .lte('deadline_at', now).order('deadline_at', { ascending: false }).limit(1);
      if (activeTournamentId) pastQuery = pastQuery.eq('tournament_id', activeTournamentId);
      let { data: mdRow } = await pastQuery.maybeSingle();
      if (!mdRow?.matchday_id) {
        let upcomingQuery = supabase.from('matchday_deadlines').select('matchday_id')
          .gt('deadline_at', now).order('deadline_at', { ascending: true }).limit(1);
        if (activeTournamentId) upcomingQuery = upcomingQuery.eq('tournament_id', activeTournamentId);
        ({ data: mdRow } = await upcomingQuery.maybeSingle());
      }
      if (mdRow?.matchday_id) {
        const label = String(mdRow.matchday_id).replace(/^.*-r/, '');
        setCurrentGW(label || mdRow.matchday_id);
      }

      // 1a. User leagues — fetched early so we can filter the score strip to relevant tournaments.
      // Non-logged-in users (user?.id is null) get an empty array → no filter applied → show all live.
      const { data: memberships = [] } = user?.id ? await supabase
        .from('league_members')
        .select('league_id, total_points, rank, leagues(id, name, tournament_id)')
        .eq('user_id', user.id) : { data: [] };
      memberships.sort((a, b) => (a.leagues?.name ?? '').localeCompare(b.leagues?.name ?? ''));
      const userTournamentIds = [...new Set((memberships || []).map(m => m.leagues?.tournament_id).filter(Boolean))];

      // 1b. Active matchday_ids — find the most recent matchday deadline per tournament.
      // This scopes the live strip to only the current round's fixtures, preventing
      // unrelated matches (e.g. other nations in a large tournament) from appearing.
      let activeMatchdayIds = [];
      const matchdayIdByTournament = {}; // tournament_id → active matchday_id
      if (userTournamentIds.length) {
        const { data: mdRows = [] } = await supabase
          .from('matchday_deadlines')
          .select('matchday_id, tournament_id, deadline_at')
          .in('tournament_id', userTournamentIds)
          .lte('deadline_at', new Date().toISOString())  // deadline has passed = round is live/recent
          .order('deadline_at', { ascending: false });
        // One matchday_id per tournament (the most recent past deadline)
        const seen = new Set();
        for (const row of (mdRows || [])) {
          if (!seen.has(row.tournament_id)) {
            seen.add(row.tournament_id);
            activeMatchdayIds.push(row.matchday_id);
            matchdayIdByTournament[row.tournament_id] = row.matchday_id;
          }
        }
      }

      // 1c. Live fixtures — scoped to the active matchday(s) when possible, otherwise all user tournaments.
      let liveQ = supabase
        .from('fixtures')
        .select('id, home_team, away_team, status, kickoff_at, minute, home_score, away_score, tournament_id, matchday_id')
        .eq('status', 'live')
        .order('kickoff_at', { ascending: true });
      if (activeMatchdayIds.length) {
        liveQ = liveQ.in('matchday_id', activeMatchdayIds);
      } else if (userTournamentIds.length) {
        liveQ = liveQ.in('tournament_id', userTournamentIds);
      }
      const { data: liveFixData = [] } = await liveQ;

      const enrichedFix = (liveFixData || []).map(f => ({
        ...f,
        homeGoals: f.home_score ?? 0,
        awayGoals: f.away_score ?? 0,
      }));
      setLiveFixtures(enrichedFix);

      // Stats window: live fixtures + all finished fixtures in the active matchday(s).
      // Using matchday scope (not a time window) so multi-day WC matchdays stay visible
      // throughout the round — e.g. an Argentina game at 00:30 UTC shows correct pts
      // for the rest of the day while Portugal plays the same evening.
      let statsFixIds = (liveFixData || []).map(f => f.id);
      if (activeMatchdayIds.length) {
        const { data: mdFinished = [] } = await supabase
          .from('fixtures')
          .select('id')
          .in('matchday_id', activeMatchdayIds)
          .eq('status', 'finished');
        statsFixIds = [...new Set([...statsFixIds, ...(mdFinished || []).map(f => f.id)])];
      }
      if (!statsFixIds.length) {
        // Fallback when no active matchday is known: 6h window based on kickoff_at.
        const cutoff = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
        let recentQ = supabase
          .from('fixtures')
          .select('id')
          .eq('status', 'finished')
          .gte('kickoff_at', cutoff);
        if (activeTournamentId) recentQ = recentQ.eq('tournament_id', activeTournamentId);
        const { data: recentFix = [] } = await recentQ;
        statsFixIds = (recentFix || []).map(f => f.id);
      }
      // Keep a backward-compatible alias so the rest of the function uses statsFixIds
      const activeFixIds = statsFixIds;


      // Fetch next upcoming fixture — filtered by active league's tournament (BUG-12 fix)
      if (!liveFixData.length) {
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

      // 2. User leagues — already fetched above (1a) to filter the score strip.
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

      // 3b. Transfer window status per league — fetched in parallel so each
      // league selector card can show open/closed + closing time independently.
      const windowResults = leagueIds.length
        ? await Promise.all(
            leagueIds.map(lid =>
              supabase.rpc('get_transfer_window_status', { p_league_id: lid })
                .then(({ data }) => [lid, data])
                .catch(() => [lid, null])
            )
          )
        : [];
      const windowByLeague = Object.fromEntries(windowResults);

      // 4. Squad — U48: fetch per league so chip state is league-scoped
      const { data: squadRows = [] } = leagueIds.length
        ? await supabase
            .from('squads')
            .select('id, league_id, players, starting_xi, captain_id, is_triple_captain')
            .eq('user_id', user.id)
            .in('league_id', leagueIds)
        : { data: [] };

      // Build a map of league_id → squad row for chip lookup
      const squadByLeague = Object.fromEntries((squadRows || []).map(s => [s.league_id, s]));

      // 4b. Current GW points per league — fetched from fantasy_points for the active matchday.
      // This powers the GW pill on each league card (shows running total as fixtures score).
      const gwPtsByLeague = {};
      const allSquadIds = (squadRows || []).map(s => s.id).filter(Boolean);
      const gwMatchdayIds = [...new Set(Object.values(matchdayIdByTournament))];
      if (allSquadIds.length && gwMatchdayIds.length) {
        const squadIdToLeague = Object.fromEntries((squadRows || []).map(s => [s.id, s.league_id]));
        const { data: fpRows = [] } = await supabase
          .from('fantasy_points')
          .select('squad_id, total, matchday_id')
          .in('squad_id', allSquadIds)
          .in('matchday_id', gwMatchdayIds);
        for (const fp of fpRows || []) {
          const lid = squadIdToLeague[fp.squad_id];
          if (lid) gwPtsByLeague[lid] = Number(fp.total ?? 0);
        }
      }

      // Use the active league's squad only — no cross-league fallback.
      // If the active league has no squad, show no players (empty XI).
      const activeLeagueId = initialSet.current && activeLeague?.id
        ? activeLeague.id
        : (memberships?.[0]?.league_id ?? null);
      const squadRow = squadByLeague[activeLeagueId] ?? null;

      const squadPlayerIds  = squadRow?.players || [];
      const startingXi      = squadRow?.starting_xi?.length > 0 ? squadRow.starting_xi : null;
      // Fall back to first starter when captain_id is null — mirrors SquadScreen behaviour.
      const captainId       = squadRow?.captain_id ?? (startingXi?.[0] ?? squadPlayerIds[0] ?? null);
      const isTripleCap     = squadRow?.is_triple_captain ?? false;

      // 5. Player details + live stats in parallel — U50/U52: fetch minutes_played
      const [{ data: playerRows = [] }, { data: statsData = [] }] = await Promise.all([
        squadPlayerIds.length
          ? supabase.from('players').select('id, name, position, club').in('id', squadPlayerIds)
          : Promise.resolve({ data: [] }),
        activeFixIds.length && squadPlayerIds.length
          ? supabase.from('player_match_stats')
              .select('player_id, fantasy_points, fixture_id, minutes_played, goals, assists, clean_sheet, yellow_cards, red_cards, penalty_missed, saves, key_passes, shots_on_target, big_chances_created')
              .in('player_id', squadPlayerIds)
              .in('fixture_id', activeFixIds)
          : Promise.resolve({ data: [] }),
      ]);

      // Live player set (has stats in a fixture that is CURRENTLY live with > 0 minutes).
      // statsData spans the whole active matchday (live + finished fixtures) so the
      // points total stays correct across multi-day rounds — but the "live" pulse
      // must only fire for fixtures still in progress, not ones that finished
      // hours/days ago. Scope to liveFixData (status='live'), not the full matchday.
      const minutesMap = {};
      (statsData || []).forEach(s => {
        minutesMap[s.player_id] = (minutesMap[s.player_id] || 0) + (s.minutes_played ?? 0);
      });
      const liveFixtureIdSet = new Set((liveFixData || []).map(f => f.id));
      const livePlayerSet = new Set(
        (statsData || [])
          .filter(s => liveFixtureIdSet.has(s.fixture_id) && (s.minutes_played ?? 0) > 0)
          .map(s => s.player_id)
      );
      const pointsMap = {};
      (statsData || []).forEach(s => {
        pointsMap[s.player_id] = (pointsMap[s.player_id] || 0) + Number(s.fantasy_points);
      });

      // Apply captain multiplier; tag bench players.
      // Use starting_xi when set (respects user's lineup); fall back to pickValidStarters
      // for legacy squads that have never had set_lineup called.
      const playerLookup = Object.fromEntries((playerRows || []).map(p => [p.id, p]));
      const starterIdSet = startingXi
        ? new Set(startingXi.filter(id => playerLookup[id]))
        : pickValidStarters(squadPlayerIds, playerLookup);
      const benchSet = new Set(squadPlayerIds.filter(id => !starterIdSet.has(id)));
      const enrichedPlayers = (playerRows || []).map(p => {
        let pts = pointsMap[p.id] || 0;
        const isBench = benchSet.has(p.id);
        // Round the raw score BEFORE applying the captain multiplier so e.g.
        // 1.4 pts doubled reads as 1*2=2, not round(1.4*2)=3.
        if (!isBench && p.id === captainId) pts = Math.round(pts) * (isTripleCap ? 3 : 2);
        return { ...p, points: pts, live: livePlayerSet.has(p.id), isBench, minutes: minutesMap[p.id] ?? null };
      });

      // Starters only on pitch; bench ordered by squad array position after the first 11
      const starters = startingXi
        ? startingXi.map(id => enrichedPlayers.find(p => p.id === id)).filter(Boolean)
        : enrichedPlayers.filter(p => !p.isBench);
      const bench = squadPlayerIds.filter(id => benchSet.has(id)).map(id => enrichedPlayers.find(p => p.id === id)).filter(Boolean);

      // Each player's displayPoints is simply Math.round(raw points) (captain
      // multiplier already applied above) — so the same player always shows
      // the same score regardless of which squad/league they're viewed in.
      // The sum may occasionally differ from the GW total by ±1 due to
      // independent rounding, which is preferable to a per-squad "largest
      // remainder" distribution that made the same player's score vary
      // across leagues.
      const withDisplayPoints = (group) => group.map(p => ({ ...p, displayPoints: Math.round(p.points ?? 0) }));

      const positioned = positionPlayers(withDisplayPoints(starters));
      setSquadPlayers(positioned);
      setBenchPlayers(withDisplayPoints(bench));

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
        const win           = windowByLeague[m.league_id];
        return {
          id:              m.league_id,
          name:            m.leagues?.name || 'League',
          tournamentId:    m.leagues?.tournament_id ?? null,
          short,
          tone,
          members,
          captainId:       leagueSquad?.captain_id ?? captainId,
          chip:            lgTripleCap ? 'Triple Captain' : null,
          rank:            rankLabel,
          total,
          delta:           gwPtsByLeague[m.league_id] ?? null,
          windowStatus:    win?.status   ?? null,
          windowClosesAt:  win?.closes_at ?? null,
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

      // 7. Points Log — built from player_match_stats (fetched in step 5).
      // match_events timeline was removed; Points Log is the only display on this tab.

      const playerMap = Object.fromEntries((playerRows || []).map(p => [p.id, p]));

      if (activeFixIds.length && squadPlayerIds.length) {
        // Build stats breakdown per player for the Points Log
        // Aggregates per player across all active fixtures and shows what's scoring / why.
        const statsByPlayer = {};
        for (const s of statsData || []) {
          if (!statsByPlayer[s.player_id]) {
            statsByPlayer[s.player_id] = { goals: 0, assists: 0, cleanSheet: false, yellowCards: 0, redCards: 0, minutesPlayed: 0, penaltyMissed: 0, saves: 0, keyPasses: 0, shotsOnTarget: 0, bigChances: 0 };
          }
          const acc = statsByPlayer[s.player_id];
          acc.goals         += s.goals              ?? 0;
          acc.assists       += s.assists             ?? 0;
          acc.cleanSheet     = acc.cleanSheet || (s.clean_sheet ?? false);
          acc.yellowCards   += s.yellow_cards        ?? 0;
          acc.redCards      += s.red_cards           ?? 0;
          acc.minutesPlayed  = Math.max(acc.minutesPlayed, s.minutes_played ?? 0);
          acc.penaltyMissed += s.penalty_missed      ?? 0;
          acc.saves         += s.saves               ?? 0;
          acc.keyPasses     += s.key_passes          ?? 0;
          acc.shotsOnTarget += s.shots_on_target     ?? 0;
          acc.bigChances    += s.big_chances_created ?? 0;
        }

        const log = [];
        for (const [pid, stats] of Object.entries(statsByPlayer)) {
          const p = playerMap[pid];
          if (!p) continue;
          const isCap = pid === captainId;
          const pts   = pointsMap[pid] ?? 0;
          log.push({ key: `stat-${pid}`, playerName: p.name, club: p.club,
                     position: p.position, isCap, isTripleCap, points: pts, ...stats });
        }
        log.sort((a, b) => b.points - a.points);
        setLiveStatsLog(log);

      } else {
        setLiveStatsLog([]);
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

  // U6: Realtime subscription — player_match_stats UPDATE triggers Points Log refresh.
  // `fetchAll` rebuilds `liveFixtures` (new array ref) on every poll, so depending the
  // effect on the array re-created/tore-down the channel every cycle — churning the
  // WebSocket and dropping the very stat events it watches. Depend on a *stable* id
  // string instead, and call the latest fetchAll via a ref so it isn't a dep.
  const liveFixtureIdList = useMemo(
    () => liveFixtures.map(f => f.id).sort().join(','),
    [liveFixtures],
  );
  const fetchAllRef = useRef(fetchAll);
  useEffect(() => { fetchAllRef.current = fetchAll; }, [fetchAll]);

  useEffect(() => {
    if (!liveFixtureIdList) return;

    const statsCh = supabase
      .channel(`live-player-stats-${liveFixtureIdList}`)
      .on('postgres_changes', {
        event:  'UPDATE',
        schema: 'public',
        table:  'player_match_stats',
        filter: `fixture_id=in.(${liveFixtureIdList})`,
      }, () => fetchAllRef.current())
      .subscribe();

    return () => { supabase.removeChannel(statsCh); };
  }, [liveFixtureIdList]);

  // Whether the active league's tournament has a live match right now.
  // Derived from liveFixtures (global) filtered to activeLeague's tournamentId.
  // Used instead of hasLiveForActiveTournament for the Points Log / MATCH IN PROGRESS
  // states so EPL leagues don't show "Match in progress" when UCL is live.
  const hasLiveForActiveTournament = liveFixtures.some(
    f => !activeLeague?.tournamentId || f.tournament_id === activeLeague?.tournamentId
  );

  // ── Desktop layout ─────────────────────────────────────────────────────────

  const desktopLeagueSelector = (
    <div style={{ display: 'flex', borderBottom: '1px solid var(--rule)' }}>
      {userLeagues.length === 0 ? (
        <div className="font-mono" style={{ padding: '14px 20px', fontSize: 10, color: 'var(--mute)' }}>
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
              <span className="font-mono" style={{ fontSize: 10, color: isActive ? lg.tone : 'var(--mute)', letterSpacing: '.18em' }}>
                {lg.name.toUpperCase()}
              </span>
              <span className="font-mono" style={{ fontSize: 9, color: 'var(--mute)', marginLeft: 'auto' }}>{lg.members} MEMBERS</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, width: '100%' }}>
              <span style={{ fontFamily: 'Archivo Black', fontSize: 26, letterSpacing: '-0.02em', color: isActive ? lg.tone : 'var(--paper)' }}>
                {Math.round(lg.total)}
              </span>
              <DeltaPill delta={lg.delta} />
              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
                {lg.chip && (
                  <span className="font-mono" style={{ fontSize: 9, color: 'var(--gold)', letterSpacing: '.14em' }}>· {lg.chip.toUpperCase()}</span>
                )}
                {lg.windowStatus && (
                  <span className="font-mono" style={{
                    fontSize: 8, letterSpacing: '.12em', padding: '1px 5px',
                    border: `1px solid ${lg.windowStatus === 'open' ? 'rgba(34,197,94,.35)' : 'var(--rule)'}`,
                    color: lg.windowStatus === 'open' ? 'var(--positive)' : 'var(--mute)',
                    background: lg.windowStatus === 'open' ? 'rgba(34,197,94,.07)' : 'transparent',
                  }}>
                    {lg.windowStatus === 'open'
                      ? `OPEN${lg.windowClosesAt ? ' · ' + new Date(lg.windowClosesAt).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' }) : ''}`
                      : 'CLOSED'}
                  </span>
                )}
              </div>
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
            <div className="font-mono" style={{ fontSize: 10, color: 'var(--mute)' }}>MATCH DAY · GW {currentGW}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 4 }}>
              <div className="font-display" style={{ fontSize: 34 }}>Live Centre</div>
              <LivePill size={11} />
              <button onClick={() => setShowScoringModal(true)} title="Scoring & game rules" style={{ background: 'none', border: '1px solid var(--rule)', color: 'var(--mute)', fontFamily: 'Archivo Black, sans-serif', fontSize: 9, width: 20, height: 20, borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>?</button>
            </div>
          </div>
          {activeLeague && (
            <div style={{ textAlign: 'right' }}>
              <div className="font-mono" style={{ fontSize: 9, color: 'var(--mute)' }}>FOCUSED LEAGUE</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2, justifyContent: 'flex-end' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: activeLeague.tone }} />
                <span style={{ fontFamily: 'Archivo Black', fontSize: 20, letterSpacing: '-0.01em' }}>{activeLeague.name}</span>
              </div>
              <div className="font-mono" style={{ fontSize: 9, color: 'var(--mute)', marginTop: 2 }}>
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
                <span className="font-mono" style={{ color: 'var(--mute)' }}>Connecting…</span>
              ) : nextFixture ? (
                <>
                  <span className="font-mono" style={{ color: 'var(--mute)', fontSize: 10, letterSpacing: '.18em' }}>NEXT</span>
                  <span style={{ fontFamily: 'Archivo Black', fontSize: 14, letterSpacing: '-0.01em' }}>
                    {teamCode(nextFixture.home_team)}
                    <span style={{ color: 'var(--mute)', margin: '0 8px' }}>vs</span>
                    {teamCode(nextFixture.away_team)}
                  </span>
                  <span className="font-mono" style={{ color: 'var(--mute)', fontSize: 10, marginLeft: 'auto' }}>
                    {nextFixture.kickoff_at ? new Date(nextFixture.kickoff_at).toLocaleDateString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}
                  </span>
                </>
              ) : (
                <span className="font-mono" style={{ color: 'var(--mute)' }}>No upcoming matches</span>
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
                  <span className="font-mono" style={{ fontSize: 9, color: 'var(--gold)', letterSpacing: '.18em', background: 'rgba(240,180,0,.1)', padding: '2px 5px' }}>PST</span>
                ) : isFT ? (
                  <span className="font-mono" style={{ fontSize: 9, color: 'var(--mute)', letterSpacing: '.18em' }}>FT</span>
                ) : (
                  <LivePill />
                )}
                <span className="font-mono" style={{ fontSize: 11, color: statusColor, letterSpacing: '.18em' }}>{isHT ? 'HT' : statusLabel}</span>
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
                <span className="font-mono" style={{ fontSize: 11, color: 'var(--paper)', letterSpacing: '.22em' }}>MY XI</span>
                {activeLeague && (
                  <span className="font-mono" style={{ fontSize: 9, color: 'var(--mute)', letterSpacing: '.14em' }}>· {activeLeague.name.toUpperCase()}</span>
                )}
              </div>
              <div className="font-mono" style={{ fontSize: 9, color: 'var(--mute)' }}>
                {squadPlayers.filter(p => p.live).length} ACTIVE NOW
              </div>
            </div>

            {/* U52: Captain DNP banner */}
            {(() => {
              const cap = squadPlayers.find(p => activeLeague && p.id === activeLeague.captainId);
              if (cap && hasLiveForActiveTournament && cap.live === false && cap.minutes === 0) {
                return (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', background: 'rgba(240,180,0,.08)', border: '1px solid rgba(240,180,0,.25)', borderRadius: 3 }}>
                    <span style={{ fontFamily: 'Archivo Black', fontSize: 9, background: 'var(--gold)', color: 'var(--ink)', padding: '1px 5px' }}>C</span>
                    <span className="font-mono" style={{ fontSize: 9, color: 'var(--gold)', letterSpacing: '.14em' }}>
                      {(cap.name || '').split(' ').pop().toUpperCase()} — DID NOT PLAY YET
                    </span>
                  </div>
                );
              }
              return null;
            })()}

            <div style={{ minHeight: 'clamp(280px, calc(100dvh - 380px), 620px)' }}>
              {loading ? (
                <div className="font-mono" style={{ fontSize: 10, color: 'var(--mute)', padding: 20 }}>Loading squad…</div>
              ) : squadPlayers.length === 0 ? (
                <div className="font-mono" style={{ fontSize: 10, color: 'var(--mute)', padding: 20 }}>No squad data</div>
              ) : (
                <MiniPitch players={squadPlayers} activeLeague={activeLeague} gwLabel={`GW ${currentGW}`} />
              )}
            </div>

            {/* U51: Bench section */}
            {benchPlayers.length > 0 && (
              <div style={{ borderTop: '1px solid var(--rule)', paddingTop: 12 }}>
                <div className="font-mono" style={{ fontSize: 9, color: 'var(--mute)', letterSpacing: '.18em', marginBottom: 8 }}>BENCH</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {benchPlayers.map((p, idx) => (
                    <div key={p.id} style={{
                      flex: 1, padding: '6px 8px',
                      background: 'var(--ink-2)',
                      border: `1px solid ${p.live ? 'var(--danger)' : 'var(--rule)'}`,
                      borderLeft: `2px solid ${POS_TONE[p.position] || 'var(--mute)'}`,
                      borderRadius: 2, minWidth: 0,
                    }}>
                      <div className="font-mono" style={{ fontSize: 8, color: 'var(--mute)', letterSpacing: '.12em', marginBottom: 2 }}>{idx + 1} · {p.position}</div>
                      <div style={{ fontFamily: 'Archivo Black', fontSize: 10, letterSpacing: '-0.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {(p.name || '').split(' ').pop().toUpperCase()}
                      </div>
                      <div style={{ fontFamily: 'Archivo Black', fontSize: 11, color: (p.points ?? 0) >= 0 ? 'var(--mute)' : 'var(--danger)', marginTop: 2 }}>
                        {(() => { const pts = p.displayPoints ?? Math.round(p.points ?? 0); return pts >= 0 ? pts : `−${Math.abs(pts)}`; })()}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="font-mono" style={{ fontSize: 9, color: 'var(--mute)', lineHeight: 1.6 }}>
              ● PULSE = PLAYER IN A LIVE FIXTURE · <span style={{ color: 'var(--gold)' }}>C</span> = CAPTAIN · NUMBERS ARE GW POINTS
            </div>
          </div>

          {/* Right: Points Log — always player_match_stats, never match_events timeline */}
          <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>

            <div style={{ padding: '14px 20px 10px', borderBottom: '1px solid var(--rule)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 3, height: 14, background: 'var(--gold)', flexShrink: 0 }} />
                  <span className="font-mono" style={{ fontSize: 11, color: 'var(--paper)', letterSpacing: '.22em' }}>POINTS LOG</span>
                  {hasLiveForActiveTournament ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                      <span className="animate-live-pulse" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--danger)', flexShrink: 0 }} />
                      <span className="font-mono" style={{ fontSize: 9, color: 'var(--mute)', letterSpacing: '.14em' }}>LIVE · EVERY 60S</span>
                    </span>
                  ) : liveStatsLog.length > 0 ? (
                    <span className="font-mono" style={{ fontSize: 9, color: 'var(--mute)', letterSpacing: '.14em' }}>· FINAL</span>
                  ) : null}
                </div>
                {liveStatsLog.length > 0 && (
                  <span className="font-mono" style={{ fontSize: 9, color: 'var(--mute)' }}>{liveStatsLog.length} PLAYERS</span>
                )}
              </div>
              {/* Preliminary disclaimer — shown only during a live match */}
              {hasLiveForActiveTournament && liveStatsLog.length > 0 && (
                <div className="font-mono" style={{ fontSize: 8, color: 'var(--mute)', letterSpacing: '.12em', marginTop: 5, paddingLeft: 13, opacity: .7 }}>
                  PRELIMINARY — FINAL POINTS CALCULATED AFTER THE MATCH
                </div>
              )}
            </div>

            <div style={{ flex: 1, overflowY: 'auto' }}>
              {loading ? (
                <div className="font-mono" style={{ fontSize: 10, color: 'var(--mute)', padding: 20 }}>Connecting to live feed…</div>

              ) : liveStatsLog.length > 0 ? (
                liveStatsLog.map(s => <DesktopStatsRow key={s.key} s={s} />)

              ) : hasLiveForActiveTournament ? (
                <div style={{ padding: '32px 20px', textAlign: 'center' }}>
                  <div className="font-mono" style={{ fontSize: 10, color: 'var(--mute)', letterSpacing: '.22em' }}>MATCH IN PROGRESS</div>
                  <div className="font-mono" style={{ fontSize: 9, color: 'var(--rule)', marginTop: 8 }}>Points will appear once stats are available</div>
                </div>

              ) : (
                <div style={{ padding: '32px 20px', textAlign: 'center' }}>
                  <div className="font-mono" style={{ fontSize: 10, color: 'var(--mute)', letterSpacing: '.22em' }}>NO MATCH ONGOING</div>
                  <div className="font-mono" style={{ fontSize: 9, color: 'var(--rule)', marginTop: 8 }}>Points Log will appear here when a match is live</div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── MOBILE ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-col lg:hidden" style={{ flex: 1, overflowY: 'auto' }}>

        {/* Hero header */}
        <div style={{ padding: '14px 18px 10px' }}>
          <div className="font-mono" style={{ fontSize: 9, color: 'var(--mute)', letterSpacing: '.22em' }}>MATCH DAY · GW {currentGW}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 4 }}>
            <div className="font-display" style={{ fontSize: 26 }}>Live Centre</div>
            <LivePill />
          </div>
        </div>

        {/* League selector cards */}
        <div style={{ padding: '4px 0 14px' }}>
          <div className="font-mono" style={{ fontSize: 9, color: 'var(--mute)', letterSpacing: '.18em', padding: '0 18px 8px' }}>YOUR LEAGUES — TAP TO SWITCH</div>
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '0 18px 4px', scrollbarWidth: 'none' }}>
            {loading ? (
              <div className="font-mono" style={{ fontSize: 10, color: 'var(--mute)', padding: '10px 0' }}>Loading…</div>
            ) : userLeagues.length === 0 ? (
              <div className="font-mono" style={{ fontSize: 10, color: 'var(--mute)', padding: '10px 0' }}>No leagues</div>
            ) : userLeagues.map(lg => {
              const isActive = activeLeague?.id === lg.id;
              return (
                <button
                  key={lg.id}
                  onClick={() => setActiveLeague(lg)}
                  style={{
                    flex: '0 0 auto', width: 140,
                    padding: '10px 12px',
                    background: isActive ? `${lg.tone}14` : 'var(--ink-2)',
                    border: `1px solid ${isActive ? lg.tone : 'var(--rule)'}`,
                    borderLeft: `2px solid ${lg.tone}`,
                    display: 'flex', flexDirection: 'column', gap: 6,
                    textAlign: 'left', color: 'var(--paper)',
                    fontFamily: 'Archivo, sans-serif', cursor: 'pointer',
                  }}
                >
                  <span className="font-mono" style={{ fontSize: 9, color: lg.tone, letterSpacing: '.18em' }}>{lg.short}</span>
                  <span style={{ fontFamily: 'Archivo Black', fontSize: 12, letterSpacing: '-0.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{lg.name}</span>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ fontFamily: 'Archivo Black', fontSize: 22, letterSpacing: '-0.02em', color: isActive ? lg.tone : 'var(--paper)' }}>
                      {Math.round(lg.total)}
                    </span>
                    <DeltaPill delta={lg.delta} />
                  </div>
                  <span className="font-mono" style={{ fontSize: 8, color: 'var(--mute)', letterSpacing: '.14em' }}>
                    {lg.rank}{lg.chip ? ` · ${lg.chip.toUpperCase()}` : ''}
                  </span>
                  {lg.windowStatus && (
                    <span className="font-mono" style={{
                      fontSize: 8, letterSpacing: '.12em',
                      color: lg.windowStatus === 'open' ? 'var(--positive)' : 'var(--mute)',
                    }}>
                      {lg.windowStatus === 'open'
                        ? `⬤ MARKET OPEN${lg.windowClosesAt ? ' · closes ' + new Date(lg.windowClosesAt).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' }) : ''}`
                        : '○ MARKET CLOSED'}
                    </span>
                  )}
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
                <span className="font-mono" style={{ fontSize: 10, color: 'var(--mute)' }}>Connecting…</span>
              ) : nextFixture ? (
                <>
                  <span className="font-mono" style={{ fontSize: 9, color: 'var(--mute)', letterSpacing: '.18em' }}>NEXT</span>
                  <span style={{ fontFamily: 'Archivo Black', fontSize: 12, letterSpacing: '-0.01em' }}>
                    {teamCode(nextFixture.home_team)} vs {teamCode(nextFixture.away_team)}
                  </span>
                  {nextFixture.kickoff_at && (
                    <span className="font-mono" style={{ fontSize: 9, color: 'var(--mute)', marginLeft: 'auto' }}>
                      {new Date(nextFixture.kickoff_at).toLocaleDateString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </>
              ) : (
                <span className="font-mono" style={{ fontSize: 10, color: 'var(--mute)' }}>No upcoming matches</span>
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
                  <span className="font-mono" style={{ fontSize: 8, color: 'var(--gold)', letterSpacing: '.18em', background: 'rgba(240,180,0,.1)', padding: '1px 4px' }}>PST</span>
                ) : isFT ? (
                  <span className="font-mono" style={{ fontSize: 9, color: 'var(--mute)', letterSpacing: '.1em' }}>FT</span>
                ) : (
                  <span className="animate-live-pulse" style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: 'var(--danger)' }} />
                )}
                <span className="font-mono" style={{ fontSize: 10, color: isPostponed ? 'var(--gold)' : 'var(--mute)', letterSpacing: '.18em' }}>{isHT ? 'HT' : statusLabel}</span>
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
            { id: 'events', label: liveStatsLog.length > 0 ? `POINTS · ${liveStatsLog.length}` : 'POINTS' },
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
                <div className="font-mono" style={{ fontSize: 10, color: 'var(--mute)', padding: '20px 0' }}>Loading squad…</div>
              ) : squadPlayers.length === 0 ? (
                <div className="font-mono" style={{ fontSize: 10, color: 'var(--mute)', padding: '20px 0' }}>No squad found — sign in to see your players</div>
              ) : (
                <>
                  <div className="font-mono" style={{ fontSize: 9, color: 'var(--mute)', padding: '10px 0 8px', letterSpacing: '.18em' }}>
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
                    if (cap && hasLiveForActiveTournament && cap.live === false && cap.minutes === 0) {
                      return (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', marginBottom: 8, background: 'rgba(240,180,0,.08)', border: '1px solid rgba(240,180,0,.25)', borderRadius: 3 }}>
                          <span style={{ fontFamily: 'Archivo Black', fontSize: 9, background: 'var(--gold)', color: 'var(--ink)', padding: '1px 4px' }}>C</span>
                          <span className="font-mono" style={{ fontSize: 9, color: 'var(--gold)', letterSpacing: '.12em' }}>
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
                        <div className="font-mono" style={{ fontSize: 9, color: 'var(--mute)', margin: '4px 0', letterSpacing: '.16em' }}>{pos} · {line.length}</div>
                        {line.map(p => <MobSquadRow key={p.id} p={p} activeLeague={activeLeague} />)}
                      </div>
                    );
                  })}

                  {/* U51: Bench — mobile */}
                  {benchPlayers.length > 0 && (
                    <div style={{ borderTop: '1px solid var(--rule)', paddingTop: 8, marginTop: 4 }}>
                      <div className="font-mono" style={{ fontSize: 9, color: 'var(--mute)', letterSpacing: '.16em', margin: '4px 0 8px' }}>BENCH · {benchPlayers.length}</div>
                      {benchPlayers.map((p, idx) => (
                        <div key={p.id} style={{ display: 'grid', gridTemplateColumns: '18px 1fr auto', gap: 10, alignItems: 'center', padding: '7px 0', borderTop: idx ? '1px solid rgba(242,238,229,.04)' : 'none' }}>
                          <div className="font-mono" style={{ fontSize: 8, color: 'var(--mute)', opacity: .6 }}>{idx + 1}</div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ width: 5, height: 5, borderRadius: '50%', background: p.live ? 'var(--danger)' : 'rgba(242,238,229,.2)', flexShrink: 0 }} className={p.live ? 'animate-live-pulse' : ''} />
                            <span style={{ fontFamily: 'Archivo Black', fontSize: 12, letterSpacing: '-0.01em' }}>{(p.name || '').split(' ').pop().toUpperCase()}</span>
                            <span className="font-mono" style={{ fontSize: 8, color: 'var(--mute)' }}>{p.position}</span>
                          </div>
                          <div style={{ fontFamily: 'Archivo Black', fontSize: 13, color: 'var(--mute)' }}>{p.displayPoints ?? Math.round(p.points ?? 0)}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          ) : (
            <>
              <div style={{ padding: '12px 18px 0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 3, height: 14, background: 'var(--gold)', flexShrink: 0 }} />
                  <span className="font-mono" style={{ fontSize: 10, color: 'var(--paper)', letterSpacing: '.22em' }}>POINTS LOG</span>
                  {hasLiveForActiveTournament ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginLeft: 'auto' }}>
                      <span className="animate-live-pulse" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--danger)', flexShrink: 0 }} />
                      <span className="font-mono" style={{ fontSize: 9, color: 'var(--mute)', letterSpacing: '.14em' }}>LIVE · UPDATES EVERY 60S</span>
                    </span>
                  ) : liveStatsLog.length > 0 ? (
                    <span className="font-mono" style={{ fontSize: 9, color: 'var(--mute)', marginLeft: 'auto' }}>FINAL</span>
                  ) : null}
                </div>
                {/* Preliminary disclaimer — shown only during a live match */}
                {hasLiveForActiveTournament && liveStatsLog.length > 0 && (
                  <div className="font-mono" style={{ fontSize: 8, color: 'var(--mute)', letterSpacing: '.12em', marginTop: 5, paddingLeft: 11, opacity: .7 }}>
                    PRELIMINARY — FINAL POINTS CALCULATED AFTER THE MATCH
                  </div>
                )}
              </div>

              {loading ? (
                <div className="font-mono" style={{ fontSize: 10, color: 'var(--mute)', padding: '12px 18px' }}>Connecting…</div>

              ) : liveStatsLog.length > 0 ? (
                liveStatsLog.map(s => <StatsLogRow key={s.key} s={s} />)

              ) : hasLiveForActiveTournament ? (
                <div style={{ padding: '32px 18px', textAlign: 'center' }}>
                  <div className="font-mono" style={{ fontSize: 10, color: 'var(--mute)', letterSpacing: '.22em' }}>MATCH IN PROGRESS</div>
                  <div className="font-mono" style={{ fontSize: 9, color: 'var(--rule)', marginTop: 8 }}>Points will appear once stats are available</div>
                </div>

              ) : (
                <div style={{ padding: '32px 18px', textAlign: 'center' }}>
                  <div className="font-mono" style={{ fontSize: 10, color: 'var(--mute)', letterSpacing: '.22em' }}>NO MATCH ONGOING</div>
                  <div className="font-mono" style={{ fontSize: 9, color: 'var(--rule)', marginTop: 8 }}>Points Log will appear here when a match is live</div>
                </div>
              )}
              <div style={{ height: 30 }} />
            </>
          )}
        </div>
      </div>
      {showScoringModal && <ScoringInfoModal onClose={() => setShowScoringModal(false)} />}
    </div>
  );
}
