import { useNavigate } from 'react-router-dom';
import { useTennisCalendar } from '../../hooks/tennis/useTennisCalendar';
import { usePlayerBox } from '../../hooks/tennis/usePlayerBox';
import { useTennisLeaderboard } from '../../hooks/tennis/useTennisLeaderboard';

const STATUS_LABEL = {
  upcoming:         { label: 'Upcoming',       color: 'var(--mute)' },
  roster_open:      { label: 'Pick your squad', color: 'var(--pos)' },
  in_progress:      { label: 'In Progress',    color: 'var(--accent)' },
  qf_captain_open:  { label: 'Pick Captain',   color: 'var(--gold)' },
  completed:        { label: 'Completed',       color: 'var(--mute)' },
};

const TYPE_BADGE = {
  grand_slam:  { label: 'Grand Slam', color: 'var(--gold)' },
  masters_1000: { label: 'Masters 1000', color: 'var(--accent)' },
  atp_finals:  { label: 'ATP Finals', color: 'var(--purple)' },
};

const SURFACE_ICON = { hard: '🎾', clay: '🟤', grass: '🌿', hard_indoor: '🏟️' };

function formatDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export default function TennisHomeScreen() {
  const navigate = useNavigate();
  const { tournaments, activeOrNext, loading: calLoading } = useTennisCalendar(2026);
  const { myBoxes, activeBox, setActivePlayerBoxId, loading: boxLoading } = usePlayerBox();
  const { standings, loading: lbLoading } = useTennisLeaderboard(activeBox?.player_box_id, 2026);

  const noBox = !boxLoading && myBoxes.length === 0;

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh', paddingBottom: 32 }}>

      {/* Header */}
      <div style={{ background: 'var(--shell)', padding: '24px 20px 20px' }}>
        <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, letterSpacing: '0.18em', color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', marginBottom: 6 }}>
          🎾 Tennis · 2026 ATP Season
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <h1 style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 26, color: 'var(--on-shell)', margin: 0 }}>
            {activeBox ? activeBox.name : 'Tennis'}
          </h1>
          {myBoxes.length > 1 && (
            <select
              value={activeBox?.player_box_id ?? ''}
              onChange={e => setActivePlayerBoxId(e.target.value)}
              style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 6, padding: '6px 10px', fontFamily: 'Archivo, sans-serif', fontSize: 12, cursor: 'pointer' }}
            >
              {myBoxes.map(b => (
                <option key={b.player_box_id} value={b.player_box_id}>{b.name}</option>
              ))}
            </select>
          )}
        </div>
        {activeBox && (
          <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: 'rgba(255,255,255,0.4)', margin: '6px 0 0', letterSpacing: '0.1em' }}>
            {activeBox.member_count} {activeBox.member_count === 1 ? 'member' : 'members'} · CODE: {activeBox.invite_code}
          </p>
        )}
      </div>

      <div style={{ padding: '16px', maxWidth: 700, margin: '0 auto' }}>

        {/* No-box CTA */}
        {noBox && (
          <div style={{ background: 'var(--card)', border: '1px solid var(--rule)', borderRadius: 6, padding: '24px 20px', textAlign: 'center', marginBottom: 20 }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>🎾</div>
            <p style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 18, color: 'var(--paper)', margin: '0 0 8px' }}>
              Join a Player's Box to start competing
            </p>
            <p style={{ fontFamily: 'Archivo, sans-serif', fontSize: 14, color: 'var(--mute)', margin: '0 0 20px' }}>
              A Player's Box is your private prediction group for the ATP season.
            </p>
            <button
              onClick={() => navigate('/tennis/box')}
              style={{ padding: '11px 28px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, fontFamily: 'Archivo, sans-serif', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
            >
              Create or join a box
            </button>
          </div>
        )}

        {/* Action banner — active tournament */}
        {activeOrNext && (activeOrNext.status === 'roster_open' || activeOrNext.status === 'qf_captain_open') && (
          <div style={{ background: activeOrNext.status === 'qf_captain_open' ? 'var(--gold)' : 'var(--accent)', borderRadius: 6, padding: '14px 16px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 4 }}>
                {activeOrNext.status === 'qf_captain_open' ? 'QF Captain window open' : 'Roster selection open'}
              </div>
              <div style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 16, color: '#fff' }}>
                {activeOrNext.name}
              </div>
            </div>
            <button
              onClick={() => navigate(`/tennis/tournament/${activeOrNext.tournament_id ?? activeOrNext.id}`)}
              style={{ padding: '9px 18px', background: 'rgba(255,255,255,0.2)', color: '#fff', border: '1px solid rgba(255,255,255,0.4)', borderRadius: 6, fontFamily: 'Archivo, sans-serif', fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
            >
              {activeOrNext.status === 'qf_captain_open' ? 'Pick captain →' : 'Pick squad →'}
            </button>
          </div>
        )}

        {/* Leaderboard snapshot */}
        {activeBox && !lbLoading && standings.length > 0 && (
          <div style={{ background: 'var(--card)', border: '1px solid var(--rule)', borderRadius: 6, marginBottom: 20 }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--rule)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 14, color: 'var(--paper)' }}>Season Standings</span>
              <button
                onClick={() => navigate('/tennis/leaderboard')}
                style={{ fontFamily: 'Archivo, sans-serif', fontSize: 12, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}
              >
                Full table →
              </button>
            </div>
            {standings.slice(0, 5).map((row, i) => (
              <div key={row.user_id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: i < Math.min(standings.length, 5) - 1 ? '1px solid var(--rule)' : 'none' }}>
                <span style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 15, color: i === 0 ? 'var(--gold)' : 'var(--mute)', minWidth: 20 }}>
                  {i + 1}
                </span>
                <span style={{ fontFamily: 'Archivo, sans-serif', fontSize: 14, color: 'var(--paper)', flex: 1, fontWeight: 500 }}>
                  {row.username}
                </span>
                <span style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 15, color: 'var(--accent)' }}>
                  {row.season_total.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Tournament calendar */}
        <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 14, color: 'var(--paper)' }}>2026 Calendar</span>
          <button
            onClick={() => navigate('/tennis/box')}
            style={{ fontFamily: 'Archivo, sans-serif', fontSize: 12, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}
          >
            {activeBox ? 'Manage box' : 'Join a box'} →
          </button>
        </div>

        {calLoading ? (
          <div style={{ color: 'var(--mute)', fontFamily: 'JetBrains Mono, monospace', fontSize: 11, textAlign: 'center', padding: 32 }}>Loading…</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {tournaments.map(t => {
              const st = STATUS_LABEL[t.status] ?? STATUS_LABEL.upcoming;
              const tb = TYPE_BADGE[t.tournament_type] ?? TYPE_BADGE.masters_1000;
              const isClickable = t.status !== 'upcoming';
              return (
                <div
                  key={t.tournament_id ?? t.id}
                  onClick={() => isClickable && navigate(`/tennis/tournament/${t.tournament_id ?? t.id}`)}
                  style={{
                    background: 'var(--card)', border: '1px solid var(--rule)', borderRadius: 6,
                    padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12,
                    cursor: isClickable ? 'pointer' : 'default',
                    opacity: t.status === 'upcoming' ? 0.75 : 1,
                  }}
                >
                  <span style={{ fontSize: 20 }}>{SURFACE_ICON[t.surface] ?? '🎾'}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                      <span style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 14, color: 'var(--paper)' }}>
                        {t.name}
                      </span>
                      <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: tb.color, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                        {tb.label}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                      <span style={{ fontFamily: 'Archivo, sans-serif', fontSize: 12, color: 'var(--mute)' }}>
                        {formatDate(t.start_date)} – {formatDate(t.end_date)}
                      </span>
                      {t.player_count > 0 && (
                        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: 'var(--mute)', letterSpacing: '0.08em' }}>
                          {t.player_count} players
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontFamily: 'Archivo, sans-serif', fontSize: 12, fontWeight: 600, color: st.color }}>
                      {st.label}
                    </div>
                    {t.has_my_roster && (
                      <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: 'var(--pos)', letterSpacing: '0.08em', marginTop: 2 }}>
                        Squad set ✓
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
