import { MgrTag, HubSectionLabel, MONO, DISPLAY, mgrHue, mgrMono } from './HubShared';

export default function StatsView({ topScorers, teamMetrics, members, currentUser, statsLoading }) {
  const totalPts  = (topScorers || []).reduce((s, m) => s + (m.total_points || 0), 0);
  const avgPts    = teamMetrics?.avg_points?.toFixed(0) || (members.length ? Math.round(totalPts / members.length) : '—');
  const biggestGW = topScorers?.[0]?.total_points || '—';

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--ink)' }}>
      {/* Hero strip */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.8fr 1fr 1fr 1fr', borderBottom: '1px solid var(--rule)', background: 'var(--ink-2)', flexShrink: 0 }}>
        <div style={{ padding: '20px 24px', borderRight: '1px solid var(--rule)' }}>
          <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--purple)', letterSpacing: '.22em' }}>LEAGUE STATS · {members.length} GAMEWEEKS</div>
          <div style={{ fontFamily: DISPLAY, fontSize: 26, marginTop: 6, lineHeight: 1.1 }}>Numbers, the way the league reads them.</div>
        </div>
        {[
          { k: 'TOTAL POINTS', v: totalPts.toLocaleString(), tone: 'var(--paper)'   },
          { k: 'AVG / MGR',    v: avgPts,                    tone: 'var(--cyan)'    },
          { k: 'LEAD SCORE',   v: biggestGW,                 tone: 'var(--gold)'    },
        ].map((c, i) => (
          <div key={c.k} style={{ padding: '20px 22px', borderRight: i < 2 ? '1px solid var(--rule)' : 'none' }}>
            <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)', letterSpacing: '.22em' }}>{c.k}</div>
            <div style={{ fontFamily: DISPLAY, fontSize: 30, color: c.tone, marginTop: 6, letterSpacing: '-0.02em' }}>{c.v}</div>
          </div>
        ))}
      </div>

      {statsLoading ? (
        <div style={{ padding: '48px', textAlign: 'center', fontFamily: MONO, fontSize: 10, color: 'var(--mute)', letterSpacing: '.2em' }}>LOADING…</div>
      ) : (
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1.4fr 1fr', gridTemplateRows: '1fr 1fr', minHeight: 0 }}>
          {/* Top scorers */}
          <section style={{ padding: '16px 22px', borderRight: '1px solid var(--rule)', borderBottom: '1px solid var(--rule)', display: 'flex', flexDirection: 'column', gap: 8, overflow: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 3, height: 14, background: 'var(--cyan)' }} />
              <span style={{ fontFamily: MONO, fontSize: 11, color: 'var(--paper)', letterSpacing: '.22em' }}>SEASON TOTALS · TOP SCORERS</span>
            </div>
            {(topScorers || []).map((scorer, i) => {
              const hue  = mgrHue(scorer.username || '');
              const isMe = currentUser && scorer.user_id === currentUser.id;
              const maxPts = topScorers?.[0]?.total_points || 1;
              return (
                <div key={scorer.user_id} style={{ display: 'grid', gridTemplateColumns: 'auto auto 1fr auto auto', gap: 12, alignItems: 'center' }}>
                  <MgrTag mono={mgrMono(scorer.username || '')} hue={hue} />
                  <div>
                    <div style={{ fontFamily: DISPLAY, fontSize: 12 }}>{isMe ? 'You' : scorer.username}</div>
                    <div style={{ height: 4, background: 'var(--ink-3)', marginTop: 4, width: 120 }}>
                      <div style={{ height: '100%', width: `${(scorer.total_points / maxPts) * 100}%`, background: i === 0 ? 'var(--gold)' : 'var(--cyan)' }} />
                    </div>
                  </div>
                  <span style={{ flex: 1 }} />
                  <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--mute)' }}>#{i + 1}</span>
                  <span style={{ fontFamily: DISPLAY, fontSize: 14, color: i === 0 ? 'var(--gold)' : 'var(--paper)' }}>
                    {scorer.total_points}<span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)', marginLeft: 4 }}>PTS</span>
                  </span>
                </div>
              );
            })}
          </section>

          {/* League overview */}
          <section style={{ padding: '16px 22px', borderBottom: '1px solid var(--rule)', display: 'flex', flexDirection: 'column', gap: 12, overflow: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 3, height: 14, background: 'var(--gold)' }} />
              <span style={{ fontFamily: MONO, fontSize: 11, color: 'var(--paper)', letterSpacing: '.22em' }}>LEAGUE OVERVIEW</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {[
                { k: 'MEMBERS',    v: teamMetrics?.member_count || members.length, tone: 'var(--paper)'   },
                { k: 'AVG POINTS', v: avgPts,                                       tone: 'var(--cyan)'   },
                { k: 'LEADER',     v: topScorers?.[0]?.username?.substring(0, 8).toUpperCase() || '—', tone: 'var(--gold)' },
                { k: 'TOTAL PTS',  v: totalPts.toLocaleString(),                    tone: 'var(--paper)'  },
              ].map(c => (
                <div key={c.k} style={{ padding: '12px 14px', background: 'var(--ink-2)', border: '1px solid var(--rule)', textAlign: 'center' }}>
                  <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)', letterSpacing: '.22em' }}>{c.k}</div>
                  <div style={{ fontFamily: DISPLAY, fontSize: 22, color: c.tone, marginTop: 4, letterSpacing: '-0.02em' }}>{c.v}</div>
                </div>
              ))}
            </div>
          </section>

          {/* Biggest GWs */}
          <section style={{ padding: '16px 22px', borderRight: '1px solid var(--rule)', display: 'flex', flexDirection: 'column', gap: 8, overflow: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 3, height: 14, background: 'var(--danger)' }} />
              <span style={{ fontFamily: MONO, fontSize: 11, color: 'var(--paper)', letterSpacing: '.22em' }}>BIGGEST GAMEWEEKS · LEADERBOARD</span>
            </div>
            {(topScorers || []).slice(0, 4).map((scorer, i) => {
              const hue = mgrHue(scorer.username || '');
              return (
                <div key={scorer.user_id} style={{ display: 'grid', gridTemplateColumns: '30px auto 1fr auto auto', gap: 12, padding: '10px 12px', background: 'var(--ink-2)', border: '1px solid var(--rule)', alignItems: 'center' }}>
                  <span style={{ fontFamily: DISPLAY, fontSize: 16, color: i === 0 ? 'var(--gold)' : 'var(--mute)' }}>{i + 1}</span>
                  <MgrTag mono={mgrMono(scorer.username || '')} hue={hue} />
                  <div>
                    <div style={{ fontFamily: DISPLAY, fontSize: 12 }}>{scorer.username}</div>
                    <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)', letterSpacing: '.16em', marginTop: 2 }}>SEASON TOTAL</div>
                  </div>
                  <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--mute)' }}>+{scorer.total_points}</span>
                  <span style={{ fontFamily: DISPLAY, fontSize: 16, color: i === 0 ? 'var(--gold)' : 'var(--paper)' }}>
                    {scorer.total_points}<span style={{ color: 'var(--mute)', fontSize: 10, marginLeft: 4 }}>PTS</span>
                  </span>
                </div>
              );
            })}
          </section>

          {/* Captaincy placeholder */}
          <section style={{ padding: '16px 22px', display: 'flex', flexDirection: 'column', gap: 8, overflow: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 3, height: 14, background: 'var(--positive)' }} />
              <span style={{ fontFamily: MONO, fontSize: 11, color: 'var(--paper)', letterSpacing: '.22em' }}>CAPTAINCY · HIT RATE</span>
            </div>
            <div style={{ fontFamily: "'Archivo', sans-serif", fontSize: 12, color: 'var(--mute)', lineHeight: 1.5 }}>
              Captain data available once matchday scoring is active.
            </div>
            <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--mute)', letterSpacing: '.18em', marginTop: 4 }}>SEASON HASN'T STARTED YET</div>
          </section>
        </div>
      )}
    </div>
  );
}
