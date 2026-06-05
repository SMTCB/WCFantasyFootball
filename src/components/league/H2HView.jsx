import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

// Inlined to avoid Rolldown TDZ — do NOT import from HubShared or HubConstants here
const MONO    = "'JetBrains Mono', monospace";
const DISPLAY = "'Archivo Black', sans-serif";

function mgrHue(str = '') {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) & 0xffff;
  const HUES = ['#00B4D8','#E0A800','#A855F7','#22C55E','#F59E0B','#34D399','#7DD3FC','#FB7185','#FCD34D','#C4B5FD','#67E8F9'];
  return HUES[h % HUES.length];
}
const mgrMono = (u = '') => u.substring(0, 3).toUpperCase() || '???';

function outcomeColor(h2hPts, winPts) {
  if (h2hPts === winPts) return 'var(--positive)';
  if (h2hPts === 0)      return 'var(--danger)';
  return 'var(--mute)';
}
function outcomeLetter(h2hPts, winPts) {
  if (h2hPts === winPts) return 'W';
  if (h2hPts === 0)      return 'L';
  return 'D';
}

export default function H2HView({ leagueId, currentUser, members }) {
  const [standings, setStandings]         = useState([]);
  const [schedule,  setSchedule]          = useState([]);
  const [loading,   setLoading]           = useState(true);
  const [winPts,    setWinPts]            = useState(5);

  // Build username map from members prop
  const usernameOf = (uid) => {
    const m = members?.find(m => m.user_id === uid);
    if (!m) return uid?.slice(0, 6) ?? '?';
    const name = m.users?.username ?? '?';
    if (currentUser && uid === currentUser.id) return 'You';
    return name;
  };

  useEffect(() => {
    if (!leagueId) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        // H2H standings via RPC
        const { data: stRows } = await supabase.rpc('get_h2h_standings', { p_league_id: leagueId });

        // Full schedule (all matchdays, resolved + unresolved)
        const { data: schRows } = await supabase
          .from('h2h_schedule')
          .select('*')
          .eq('league_id', leagueId)
          .order('matchday_id', { ascending: true })
          .order('created_at', { ascending: true });

        // Load win_pts config for outcome colouring
        const { data: cfgRow } = await supabase
          .from('league_config')
          .select('config_value')
          .eq('league_id', leagueId)
          .eq('config_key', 'h2h_win_pts')
          .maybeSingle();

        if (cancelled) return;
        setStandings(stRows ?? []);
        setSchedule(schRows ?? []);
        setWinPts(cfgRow ? Number(cfgRow.config_value) : 5);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [leagueId]);

  // Group schedule rows by matchday_id
  const byMatchday = {};
  for (const row of schedule) {
    if (!byMatchday[row.matchday_id]) byMatchday[row.matchday_id] = [];
    byMatchday[row.matchday_id].push(row);
  }
  const matchdayKeys = Object.keys(byMatchday).sort((a, b) => {
    const na = parseInt(a.replace(/^.*-r/, ''), 10);
    const nb = parseInt(b.replace(/^.*-r/, ''), 10);
    return na - nb;
  });

  const hasCalendar = schedule.length > 0;

  if (loading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--mute)', fontFamily: MONO, fontSize: 11, letterSpacing: '.18em' }}>
        LOADING…
      </div>
    );
  }

  if (!hasCalendar) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '40px 24px', textAlign: 'center' }}>
        <span style={{ fontSize: 32 }}>⚔️</span>
        <div style={{ fontFamily: DISPLAY, fontSize: 18, color: 'var(--paper)' }}>CALENDAR NOT YET AVAILABLE</div>
        <div style={{ fontFamily: MONO, fontSize: 11, color: 'var(--mute)', letterSpacing: '.14em', maxWidth: 280, lineHeight: 1.6 }}>
          THE COMMISSIONER WILL SET UP THE H2H SCHEDULE — CHECK BACK SOON.
        </div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 0 }}>

      {/* ── H2H Standings ─────────────────────────────────────────────── */}
      <div style={{ borderBottom: '1px solid var(--rule)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 20px', background: 'var(--ink-2)' }}>
          <span style={{ width: 3, height: 14, background: 'var(--gold)', flexShrink: 0 }} />
          <span style={{ fontFamily: MONO, fontSize: 11, color: 'var(--paper)', letterSpacing: '.22em' }}>H2H STANDINGS</span>
        </div>

        {standings.length === 0 ? (
          <div style={{ padding: '16px 20px', fontFamily: MONO, fontSize: 11, color: 'var(--mute)', letterSpacing: '.14em' }}>
            NO RESULTS YET — FIRST MATCHDAY PENDING
          </div>
        ) : (
          <>
            {/* Header row */}
            <div style={{ display: 'grid', gridTemplateColumns: '36px 1fr 80px 60px', padding: '8px 20px', borderBottom: '1px solid var(--rule)' }}>
              {['#', 'MANAGER', 'W-D-L', 'H2H'].map((h, i) => (
                <div key={i} style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)', textAlign: i >= 2 ? 'right' : 'left' }}>{h}</div>
              ))}
            </div>
            {standings.map((row, idx) => {
              const isMe = currentUser && row.user_id === currentUser.id;
              const hue  = mgrHue(row.username ?? '');
              return (
                <div key={row.user_id} style={{
                  display: 'grid', gridTemplateColumns: '36px 1fr 80px 60px',
                  padding: '10px 20px', borderBottom: '1px solid var(--rule)',
                  background: isMe ? 'rgba(0,180,216,0.04)' : 'transparent',
                }}>
                  <span style={{ fontFamily: DISPLAY, fontSize: 16, color: idx < 3 ? ['var(--gold)','#C0C0C0','#CD7F32'][idx] : 'var(--mute)' }}>{row.h2h_rank}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 28, height: 18, background: `${hue}18`, border: `1px solid ${hue}66`, color: hue, fontFamily: MONO, fontSize: 9, letterSpacing: '.12em' }}>{mgrMono(row.username ?? '')}</span>
                    <span style={{ fontFamily: DISPLAY, fontSize: 13, color: isMe ? 'var(--cyan)' : 'var(--paper)' }}>{isMe ? 'You' : (row.username ?? '?')}</span>
                  </div>
                  <div style={{ textAlign: 'right', fontFamily: MONO, fontSize: 11, color: 'var(--mute)' }}>
                    <span style={{ color: 'var(--positive)' }}>{row.wins}</span>
                    <span>-{row.draws}-</span>
                    <span style={{ color: 'var(--danger)' }}>{row.losses}</span>
                  </div>
                  <div style={{ textAlign: 'right', fontFamily: DISPLAY, fontSize: 16, color: 'var(--gold)' }}>{row.total_h2h_pts}</div>
                </div>
              );
            })}
          </>
        )}
      </div>

      {/* ── Schedule ──────────────────────────────────────────────────── */}
      <div style={{ flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 20px', background: 'var(--ink-2)', borderBottom: '1px solid var(--rule)' }}>
          <span style={{ width: 3, height: 14, background: 'var(--cyan)', flexShrink: 0 }} />
          <span style={{ fontFamily: MONO, fontSize: 11, color: 'var(--paper)', letterSpacing: '.22em' }}>SCHEDULE</span>
        </div>

        {matchdayKeys.map(mdId => {
          const roundNum = mdId.replace(/^.*-r/, '');
          const rows = byMatchday[mdId];
          const resolved = rows.some(r => r.resolved_at);

          return (
            <div key={mdId} style={{ borderBottom: '1px solid var(--rule)' }}>
              <div style={{ padding: '8px 20px', background: 'var(--ink-2)', display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)', letterSpacing: '.2em' }}>ROUND {roundNum}</span>
                {resolved && (
                  <span style={{ fontFamily: MONO, fontSize: 8, color: 'var(--positive)', border: '1px solid var(--positive)44', padding: '1px 5px', letterSpacing: '.14em' }}>DONE</span>
                )}
              </div>

              {rows.map(row => {
                const isResolved = !!row.resolved_at;

                if (row.is_bye) {
                  const byeName = usernameOf(row.bye_user_id);
                  return (
                    <div key={row.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 20px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--gold)', letterSpacing: '.18em' }}>BYE</span>
                      <span style={{ fontFamily: DISPLAY, fontSize: 13, color: 'var(--paper)' }}>{byeName}</span>
                      {isResolved && (
                        <span style={{ marginLeft: 'auto', fontFamily: MONO, fontSize: 10, color: 'var(--positive)', fontWeight: 700 }}>+{row.home_h2h_pts}</span>
                      )}
                    </div>
                  );
                }

                const homeName = usernameOf(row.home_user_id);
                const awayName = usernameOf(row.away_user_id);
                const homeColor = isResolved ? outcomeColor(row.home_h2h_pts, winPts) : 'var(--paper)';
                const awayColor = isResolved ? outcomeColor(row.away_h2h_pts, winPts) : 'var(--paper)';

                return (
                  <div key={row.id} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 1fr', alignItems: 'center', padding: '10px 20px', borderBottom: '1px solid rgba(255,255,255,0.04)', gap: 4 }}>
                    {/* Home */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {isResolved && (
                        <span style={{ fontFamily: MONO, fontSize: 9, color: homeColor, fontWeight: 700 }}>{outcomeLetter(row.home_h2h_pts, winPts)}</span>
                      )}
                      <span style={{ fontFamily: DISPLAY, fontSize: 13, color: homeColor }}>{homeName}</span>
                    </div>

                    {/* Score / vs */}
                    <div style={{ textAlign: 'center' }}>
                      {isResolved ? (
                        <span style={{ fontFamily: DISPLAY, fontSize: 14, color: 'var(--paper)' }}>
                          {Math.round(row.home_score ?? 0)} – {Math.round(row.away_score ?? 0)}
                        </span>
                      ) : (
                        <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)', letterSpacing: '.18em' }}>VS</span>
                      )}
                    </div>

                    {/* Away */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
                      <span style={{ fontFamily: DISPLAY, fontSize: 13, color: awayColor }}>{awayName}</span>
                      {isResolved && (
                        <span style={{ fontFamily: MONO, fontSize: 9, color: awayColor, fontWeight: 700 }}>{outcomeLetter(row.away_h2h_pts, winPts)}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
