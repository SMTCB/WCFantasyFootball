import { useState } from 'react';
import { MgrTag, HubSectionLabel } from './HubShared';
import { MONO, DISPLAY, mgrHue, mgrMono } from './HubConstants';

const CAT_META = {
  match:   { label: 'MATCH',   color: 'var(--paper)', icon: '⚽' },
  stats:   { label: 'STATS',   color: 'var(--gold)',  icon: '📊' },
  players: { label: 'PLAYERS', color: 'var(--cyan)',  icon: '🎯' },
  custom:  { label: 'CUSTOM',  color: 'var(--mute)',  icon: '✏'  },
};
const CAT_ORDER = ['match', 'stats', 'players', 'custom'];

function PerformanceBetRow({ bt }) {
  const total      = bt.correct + bt.wrong;
  const correctPct = total > 0 ? (bt.correct / total) * 100 : 0;
  const wrongPct   = 100 - correctPct;
  const hasData    = total > 0;
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
        <span style={{ fontFamily: MONO, fontSize: 8, letterSpacing: '.16em', color: hasData ? 'var(--paper)' : 'var(--mute)' }}>
          {bt.label}
        </span>
        {hasData ? (
          <span style={{ fontFamily: MONO, fontSize: 8, color: 'var(--mute)' }}>
            <span style={{ color: 'var(--positive)' }}>{bt.correct}W</span>
            {' · '}
            <span style={{ color: 'var(--danger)' }}>{bt.wrong}L</span>
            {' · '}
            <span style={{ color: correctPct >= 50 ? 'var(--positive)' : 'var(--danger)' }}>
              {Math.round(correctPct)}%
            </span>
          </span>
        ) : (
          <span style={{ fontFamily: MONO, fontSize: 8, color: 'var(--mute)', opacity: 0.4, letterSpacing: '.1em' }}>—</span>
        )}
      </div>
      <div style={{ height: 6, borderRadius: 2, overflow: 'hidden', background: 'var(--ink-3)', display: 'flex' }}>
        {hasData ? (
          <>
            {correctPct > 0 && <div style={{ width: `${correctPct}%`, background: 'var(--positive)', opacity: 0.85, transition: 'width .3s' }} />}
            {wrongPct > 0 && <div style={{ width: `${wrongPct}%`, background: 'var(--danger)', opacity: 0.5, transition: 'width .3s' }} />}
          </>
        ) : (
          <div style={{ width: '100%', background: 'rgba(255,255,255,0.04)' }} />
        )}
      </div>
    </div>
  );
}

function PerformanceByType({ myBetsByType }) {
  const [openCats, setOpenCats] = useState(() => new Set(CAT_ORDER));
  const toggleCat = (cat) => setOpenCats(prev => {
    const next = new Set(prev);
    if (next.has(cat)) next.delete(cat); else next.add(cat);
    return next;
  });

  const groups = {};
  for (const bt of (myBetsByType || [])) {
    const cat = bt.category ?? 'custom';
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(bt);
  }

  const activeCats = CAT_ORDER.filter(c => groups[c]?.length);
  if (!activeCats.length) {
    return (
      <div style={{ padding: '28px 22px', fontFamily: MONO, fontSize: 9, color: 'var(--mute)', letterSpacing: '.2em' }}>
        NO RESOLVED BETS YET
      </div>
    );
  }

  return (
    <div style={{ borderBottom: '1px solid var(--rule)' }}>
      {activeCats.map(cat => {
        const meta    = CAT_META[cat];
        const bets    = groups[cat];
        const withData = bets.filter(b => b.correct + b.wrong > 0);
        const isOpen  = openCats.has(cat);
        return (
          <div key={cat} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
            {/* Category header — clickable to collapse */}
            <button
              onClick={() => toggleCat(cat)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 6,
                padding: '8px 22px', background: 'rgba(255,255,255,0.02)',
                border: 'none', cursor: 'pointer', textAlign: 'left',
              }}
            >
              <span style={{ fontSize: 9 }}>{meta.icon}</span>
              <span style={{ fontFamily: MONO, fontSize: 8, color: meta.color, letterSpacing: '.22em', flex: 1 }}>{meta.label}</span>
              <span style={{ fontFamily: MONO, fontSize: 8, color: 'var(--mute)', letterSpacing: '.1em' }}>
                {withData.length}/{bets.length}
              </span>
              <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--mute)', marginLeft: 8 }}>{isOpen ? '−' : '+'}</span>
            </button>
            {isOpen && (
              <div style={{ padding: '8px 22px 12px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                {bets.map(bt => <PerformanceBetRow key={bt.slug} bt={bt} />)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function BettingLeaderboardView({ leaderboard, myBetsByType, currentUser, betLoading }) {
  const myEntry = leaderboard?.find(e => currentUser && e.user_id === currentUser.id);
  const myIdx   = leaderboard?.findIndex(e => currentUser && e.user_id === currentUser.id) ?? -1;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--ink)' }}>
      {/* Hero strip */}
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
              <div style={{ fontFamily: DISPLAY, fontSize: 'clamp(16px, 3.5vw, 28px)', color: c.tone, marginTop: 4, letterSpacing: '-0.02em' }}>{c.v}</div>
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
        /* Responsive: stack on mobile, 2-col on desktop */
        <div className="flex flex-col lg:grid lg:grid-cols-[1.4fr_1fr]" style={{ flex: 1, minHeight: 0 }}>

          {/* Leaderboard */}
          <div style={{ display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--rule)' }}>
            <HubSectionLabel label="BETTING LEADERBOARD" sub="POINTS FROM BETS · SEASON"
              right={<span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)' }}>SORT · REWARDS ↓</span>}
            />
            {/* Column headers — desktop only */}
            <div className="hidden lg:grid" style={{ gridTemplateColumns: '40px 1fr 70px 70px 80px', gap: 14, padding: '10px 22px', borderBottom: '1px solid var(--rule)', color: 'var(--mute)' }}>
              {['#', 'MANAGER', 'W-L', 'WIN %', 'REWARDS'].map(h => <span key={h} style={{ fontFamily: MONO, fontSize: 9 }}>{h}</span>)}
            </div>

            <div style={{ flex: 1, overflow: 'auto' }}>
              {leaderboard.map((entry, i) => {
                const isMe = currentUser && entry.user_id === currentUser.id;
                const hue  = mgrHue(entry.username || '');
                const lost = entry.total_bets - entry.correct_bets;
                return (
                  <div key={entry.user_id} style={{
                    borderBottom: '1px solid var(--rule)',
                    background: isMe ? 'rgba(0,180,216,.04)' : 'transparent',
                    borderLeft: isMe ? '2px solid var(--cyan)' : '2px solid transparent',
                  }}>
                    {/* Mobile row */}
                    <div className="flex flex-col gap-2 lg:hidden" style={{ padding: '12px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontFamily: DISPLAY, fontSize: 13, color: 'var(--mute)', minWidth: 20 }}>{i + 1}</span>
                        <MgrTag mono={mgrMono(entry.username || '')} hue={hue} />
                        <span style={{ fontFamily: DISPLAY, fontSize: 13, flex: 1 }}>{isMe ? 'You' : entry.username}</span>
                        <span style={{ fontFamily: DISPLAY, fontSize: 14, color: 'var(--positive)' }}>+{entry.total_rewards}</span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, paddingLeft: 30 }}>
                        <div>
                          <div style={{ fontFamily: MONO, fontSize: 8, color: 'var(--mute)', letterSpacing: '.1em' }}>WIN RATE</div>
                          <div style={{ fontFamily: DISPLAY, fontSize: 13, color: 'var(--cyan)' }}>{entry.accuracy_pct}%</div>
                        </div>
                        <div>
                          <div style={{ fontFamily: MONO, fontSize: 8, color: 'var(--mute)', letterSpacing: '.1em' }}>RECORD</div>
                          <div style={{ fontFamily: "'Archivo', sans-serif", fontSize: 12 }}>
                            <span style={{ color: 'var(--positive)' }}>{entry.correct_bets}</span>
                            <span style={{ color: 'var(--mute)' }}> · </span>
                            <span style={{ color: 'var(--danger)' }}>{lost}</span>
                          </div>
                        </div>
                        <div>
                          <div style={{ fontFamily: MONO, fontSize: 8, color: 'var(--mute)', letterSpacing: '.1em' }}>REWARDS</div>
                          <div style={{ fontFamily: DISPLAY, fontSize: 13, color: 'var(--gold)' }}>+{entry.total_rewards}</div>
                        </div>
                      </div>
                    </div>
                    {/* Desktop row */}
                    <div className="hidden lg:grid" style={{ gridTemplateColumns: '40px 1fr 70px 70px 80px', gap: 14, padding: '12px 22px', alignItems: 'center' }}>
                      <span style={{ fontFamily: DISPLAY, fontSize: 14 }}>{i + 1}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <MgrTag mono={mgrMono(entry.username || '')} hue={hue} />
                        <span style={{ fontFamily: DISPLAY, fontSize: 13 }}>{isMe ? 'You' : entry.username}</span>
                      </div>
                      <span style={{ fontFamily: "'Archivo', sans-serif", fontSize: 12 }}>
                        <span style={{ color: 'var(--positive)' }}>{entry.correct_bets}</span>
                        <span style={{ color: 'var(--mute)' }}> · </span>
                        <span style={{ color: 'var(--danger)' }}>{lost}</span>
                      </span>
                      <span style={{ textAlign: 'right', fontFamily: DISPLAY, fontSize: 13 }}>{entry.accuracy_pct}%</span>
                      <span style={{ textAlign: 'right', fontFamily: DISPLAY, fontSize: 14, color: 'var(--positive)' }}>+{entry.total_rewards}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right rail — desktop only */}
          <aside className="hidden lg:flex" style={{ flexDirection: 'column', background: 'var(--ink-2)', overflow: 'auto' }}>
            <HubSectionLabel label="YOUR PERFORMANCE" sub="BY BET TYPE" tone="var(--gold)" />
            <PerformanceByType myBetsByType={myBetsByType} />
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
                    <span style={{ fontFamily: DISPLAY, fontSize: 14, color: diff > 0 ? 'var(--positive)' : diff < 0 ? 'var(--danger)' : 'var(--mute)' }}>{diff > 0 ? '+' : ''}{diff}</span>
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
