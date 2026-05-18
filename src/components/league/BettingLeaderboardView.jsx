import { MgrTag, HubSectionLabel, Spark, MONO, DISPLAY, mgrHue, mgrMono } from './HubShared';

export default function BettingLeaderboardView({ leaderboard, currentUser, betLoading }) {
  const myEntry = leaderboard?.find(e => currentUser && e.user_id === currentUser.id);
  const myIdx   = leaderboard?.findIndex(e => currentUser && e.user_id === currentUser.id) ?? -1;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--ink)' }}>
      {/* Hero strip — responsive */}
      <div style={{ borderBottom: '1px solid var(--rule)', background: 'var(--ink-2)', flexShrink: 0 }}>
        <div style={{ padding: 'clamp(12px, 2vw, 20px) clamp(14px, 3vw, 24px)', borderBottom: '1px solid var(--rule)' }}>
          <div style={{ fontFamily: MONO, fontSize: 'clamp(9px, 1.8vw, 10px)', color: 'var(--cyan)', letterSpacing: '.22em' }}>YOUR BETTING · SEASON</div>
          <div style={{ fontFamily: DISPLAY, fontSize: 'clamp(20px, 4vw, 28px)', marginTop: 6, color: 'var(--paper)' }}>
            {myEntry ? `+${myEntry.total_rewards} PTS` : '—'}
          </div>
          <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--mute)', marginTop: 6, letterSpacing: '.18em' }}>
            {myEntry && leaderboard?.length ? `RANK ${myIdx + 1} / ${leaderboard.length} IN LEAGUE` : 'NO BETS YET'}
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr' }}>
          {[
            { k: 'PLAYED',  v: myEntry?.total_bets    || '—', tone: 'var(--paper)'    },
            { k: 'WON',     v: myEntry?.correct_bets  || '—', tone: 'var(--positive)' },
            { k: 'WIN %',   v: myEntry ? `${myEntry.accuracy_pct}%` : '—', tone: 'var(--cyan)' },
            { k: 'REWARDS', v: myEntry ? `+${myEntry.total_rewards}` : '—', tone: 'var(--gold)' },
          ].map((c, i) => (
            <div key={c.k} style={{ padding: 'clamp(8px, 2vw, 16px) clamp(8px, 2vw, 20px)', borderRight: i < 3 ? '1px solid var(--rule)' : 'none' }}>
              <div style={{ fontFamily: MONO, fontSize: 'clamp(8px, 1.5vw, 9px)', color: 'var(--mute)', letterSpacing: '.22em' }}>{c.k}</div>
              <div style={{ fontFamily: DISPLAY, fontSize: 'clamp(18px, 3.5vw, 28px)', color: c.tone, marginTop: 4, letterSpacing: '-0.02em' }}>{c.v}</div>
            </div>
          ))}
        </div>
      </div>

      {betLoading ? (
        <div style={{ padding: '48px', textAlign: 'center', fontFamily: MONO, fontSize: 10, color: 'var(--mute)', letterSpacing: '.2em' }}>LOADING…</div>
      ) : !leaderboard?.length ? (
        <div style={{ padding: '64px 28px', textAlign: 'center' }}>
          <div style={{ fontFamily: MONO, fontSize: 11, color: 'var(--mute)', letterSpacing: '.2em' }}>NO RESOLVED BETS YET</div>
        </div>
      ) : (
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1.4fr 1fr', minHeight: 0 }}>
          {/* Leaderboard */}
          <div style={{ display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--rule)' }}>
            <HubSectionLabel label="BETTING LEADERBOARD" sub="POINTS FROM BETS · SEASON"
              right={<span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)' }}>SORT · REWARDS ↓</span>}
            />
            <div style={{ display: 'grid', gridTemplateColumns: '40px 1fr 100px 70px 70px 80px', gap: 14, padding: '10px 22px', borderBottom: '1px solid var(--rule)', color: 'var(--mute)' }}>
              {['#', 'MANAGER', 'L8 GW', 'W-L', 'WIN %', 'REWARDS'].map(h => <span key={h} style={{ fontFamily: MONO, fontSize: 9 }}>{h}</span>)}
            </div>
            <div style={{ flex: 1, overflow: 'auto' }}>
              {leaderboard.map((entry, i) => {
                const isMe = currentUser && entry.user_id === currentUser.id;
                const hue  = mgrHue(entry.username || '');
                const lost = entry.total_bets - entry.correct_bets;
                const sparkData = Array.from({ length: 8 }, (_, j) => (j % 3 === 0 ? -2 : j % 2 === 0 ? 4 : 2));
                return (
                  <div key={entry.user_id} style={{ display: 'grid', gridTemplateColumns: '40px 1fr 100px 70px 70px 80px', gap: 14, padding: '12px 22px', borderBottom: '1px solid var(--rule)', alignItems: 'center', background: isMe ? 'rgba(0,180,216,.04)' : 'transparent', borderLeft: isMe ? '2px solid var(--cyan)' : '2px solid transparent' }}>
                    <span style={{ fontFamily: DISPLAY, fontSize: 14 }}>{i + 1}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <MgrTag mono={mgrMono(entry.username || '')} hue={hue} />
                      <span style={{ fontFamily: DISPLAY, fontSize: 13 }}>{isMe ? 'You' : entry.username}</span>
                    </div>
                    <Spark data={sparkData} tone={i === 0 ? 'var(--gold)' : 'var(--cyan)'} w={88} h={22} />
                    <span style={{ fontFamily: "'Archivo', sans-serif", fontSize: 12 }}>
                      <span style={{ color: 'var(--positive)' }}>{entry.correct_bets}</span>
                      <span style={{ color: 'var(--mute)' }}> · </span>
                      <span style={{ color: 'var(--danger)' }}>{lost}</span>
                    </span>
                    <span style={{ textAlign: 'right', fontFamily: DISPLAY, fontSize: 13 }}>{entry.accuracy_pct}%</span>
                    <span style={{ textAlign: 'right', fontFamily: DISPLAY, fontSize: 14, color: 'var(--positive)' }}>+{entry.total_rewards}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right rail */}
          <aside style={{ display: 'flex', flexDirection: 'column', background: 'var(--ink-2)', overflow: 'auto' }}>
            <HubSectionLabel label="YOUR PERFORMANCE" sub="BY BET TYPE" tone="var(--gold)" />
            <div style={{ padding: '14px 22px', display: 'flex', flexDirection: 'column', gap: 12, borderBottom: '1px solid var(--rule)' }}>
              {myEntry ? (
                <div style={{ fontFamily: "'Archivo', sans-serif", fontSize: 11, color: 'var(--mute)', lineHeight: 1.5 }}>
                  Per-bet-type breakdown available once more data is collected.
                </div>
              ) : (
                <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--mute)', letterSpacing: '.18em' }}>NO DATA YET</div>
              )}
            </div>
            <HubSectionLabel label="RIVALS WATCH" sub="BIGGEST GAP" tone="var(--purple)" />
            <div style={{ padding: '14px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              {(leaderboard || []).filter((_, i) => Math.abs(i - myIdx) <= 2 && i !== myIdx).slice(0, 3).map(rival => {
                const diff = (rival.total_rewards || 0) - (myEntry?.total_rewards || 0);
                const hue  = mgrHue(rival.username || '');
                return (
                  <div key={rival.user_id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <MgrTag mono={mgrMono(rival.username || '')} hue={hue} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: DISPLAY, fontSize: 12 }}>{rival.username}</div>
                      <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)', letterSpacing: '.14em', marginTop: 2 }}>{rival.accuracy_pct}% WIN RATE</div>
                    </div>
                    <span style={{ fontFamily: DISPLAY, fontSize: 14, color: diff > 0 ? 'var(--danger)' : 'var(--positive)' }}>{diff > 0 ? '' : '+'}{-diff}</span>
                  </div>
                );
              })}
              {!myEntry && <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--mute)', letterSpacing: '.18em' }}>SUBMIT BETS TO APPEAR ON LEADERBOARD</div>}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
