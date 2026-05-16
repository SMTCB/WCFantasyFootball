import { MgrTag, TrendPill, HubSectionLabel, MONO, DISPLAY, miniBtnStyle, mgrHue, mgrMono } from './HubShared';

export default function LeagueDetailView({ members, currentUser, membersLoading, onH2h, onViewManager }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      {/* Spotlight strip: top 3 podium */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', borderBottom: '1px solid var(--rule)', flexShrink: 0 }}>
        {/* GW card */}
        <div style={{ padding: '18px 22px', borderRight: '1px solid var(--rule)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--cyan)', letterSpacing: '.22em' }}>LEAGUE · SEASON</div>
            <div style={{ fontFamily: DISPLAY, fontSize: 28, marginTop: 4, letterSpacing: '-0.02em' }}>GW —</div>
            <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)', marginTop: 6, letterSpacing: '.16em' }}>{members.length} MANAGERS · STANDINGS</div>
          </div>
          {members[0] && (
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontFamily: DISPLAY, fontSize: 16, color: 'var(--positive)' }}>{members[0].total_points}</div>
              <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)', letterSpacing: '.18em', marginTop: 4 }}>LEAD SCORE</div>
            </div>
          )}
        </div>
        {/* Podium 1-3 */}
        {members.slice(0, 3).map((m, idx) => {
          const mName = (currentUser && m.user_id === currentUser.id) ? 'You' : (m.users?.username || 'Unknown');
          const hue = mgrHue(m.users?.username || '');
          const medal = ['var(--gold)', '#C0C0C0', '#CD7F32'][idx];
          return (
            <div key={m.user_id} style={{ padding: '18px 22px', borderRight: idx < 2 ? '1px solid var(--rule)' : 'none', display: 'flex', gap: 14, alignItems: 'center' }}>
              <div style={{ width: 42, height: 42, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${medal}18`, border: `1px solid ${medal}66`, fontFamily: DISPLAY, fontSize: 22, color: medal }}>
                {idx + 1}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <MgrTag mono={mgrMono(mName)} hue={hue} />
                  <div style={{ fontFamily: DISPLAY, fontSize: 13, letterSpacing: '-0.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{mName}</div>
                </div>
                <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)', marginTop: 4, letterSpacing: '.14em' }}>RANK #{idx + 1}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontFamily: DISPLAY, fontSize: 16, color: 'var(--positive)' }}>{m.total_points}</div>
                <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)', marginTop: 4, letterSpacing: '.18em' }}>TOT</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Body: standings table + activity rail */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 400px', minHeight: 0 }}>
        {/* Standings table */}
        <div data-tour="league-standings" style={{ display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--rule)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '48px 1fr 80px 80px 100px', gap: 14, padding: '12px 24px', borderBottom: '1px solid var(--rule)', color: 'var(--mute)' }}>
            {['#', 'MANAGER', 'MD', 'TOT', ''].map((h, i) => (
              <div key={i} style={{ fontFamily: MONO, fontSize: 9, textAlign: i >= 2 && i < 4 ? 'right' : 'left' }}>{h}</div>
            ))}
          </div>
          <div style={{ flex: 1, overflow: 'auto' }}>
            {membersLoading && members.length === 0 ? (
              <div style={{ padding: '48px 24px', textAlign: 'center' }}>
                <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--mute)', letterSpacing: '.2em' }}>SYNCING STANDINGS…</div>
              </div>
            ) : members.map((m) => {
              const isMe = currentUser && m.user_id === currentUser.id;
              const mName = isMe ? 'You' : (m.users?.username || 'Unknown');
              const hue = mgrHue(m.users?.username || '');
              return (
                <div key={m.user_id} style={{
                  display: 'grid', gridTemplateColumns: '48px 1fr 80px 80px 100px', gap: 14, alignItems: 'center',
                  padding: '12px 24px', borderBottom: '1px solid var(--rule)',
                  borderLeft: isMe ? '2px solid var(--cyan)' : '2px solid transparent',
                  background: isMe ? 'rgba(0,180,216,.04)' : 'transparent',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontFamily: DISPLAY, fontSize: 14, minWidth: 18 }}>{m.rank || '—'}</span>
                    <TrendPill trend={0} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                    <MgrTag mono={mgrMono(mName)} hue={hue} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontFamily: DISPLAY, fontSize: 13, letterSpacing: '-0.01em', whiteSpace: 'nowrap' }}>{mName}</span>
                        {m.rank === 1 && <span style={{ fontFamily: DISPLAY, fontSize: 8, background: 'var(--gold)', color: 'var(--ink)', padding: '1px 4px', letterSpacing: '.1em' }}>LEADER</span>}
                      </div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', fontFamily: DISPLAY, fontSize: 13, color: 'var(--mute)' }}>—</div>
                  <div style={{ textAlign: 'right', fontFamily: DISPLAY, fontSize: 13 }}>{m.total_points}</div>
                  <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                    {!isMe && (
                      <>
                        <button onClick={() => onH2h({ ...m, name: mName })} style={miniBtnStyle('var(--cyan)')}>H2H</button>
                        <button onClick={() => onViewManager({ user_id: m.user_id, name: mName })} style={miniBtnStyle('var(--mute)')}>VIEW</button>
                      </>
                    )}
                    {isMe && <button onClick={() => onViewManager({ user_id: m.user_id, name: mName })} style={miniBtnStyle('var(--cyan)')}>VIEW</button>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Activity rail */}
        <aside style={{ display: 'flex', flexDirection: 'column', background: 'var(--ink-2)' }}>
          <HubSectionLabel label="LEAGUE ACTIVITY" sub="LIVE" tone="var(--gold)" right={<span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)' }}>LAST 24H</span>} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 18px', gap: 8 }}>
            <div style={{ fontSize: 24 }}>⚽</div>
            <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--mute)', letterSpacing: '.2em', textAlign: 'center' }}>NO ACTIVITY YET</div>
            <div style={{ fontFamily: "'Archivo', sans-serif", fontSize: 11, color: 'var(--mute)', opacity: 0.6, textAlign: 'center', lineHeight: 1.5 }}>Match events, rank changes, and league news will appear here once the season starts.</div>
          </div>
          <div style={{ padding: '12px 18px', borderTop: '1px solid var(--rule)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--mute)', letterSpacing: '.18em' }}>FILTER</span>
            <div style={{ display: 'flex', gap: 6 }}>
              {['ALL', 'GAME', 'BETS', 'TRADES'].map((f, i) => (
                <span key={f} style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.18em', padding: '3px 6px', border: `1px solid ${i === 0 ? 'var(--cyan)' : 'var(--rule)'}`, color: i === 0 ? 'var(--cyan)' : 'var(--mute)' }}>{f}</span>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
