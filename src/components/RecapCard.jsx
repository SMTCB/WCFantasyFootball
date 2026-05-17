/**
 * RecapCard — the "hidden canvas" that gets rendered to a PNG for sharing.
 * This component is rendered off-screen and captured by html2canvas.
 * Design: 1080×1920px portrait, Forza-dark aesthetic with a colour accent stripe.
 */
export default function RecapCard({ recap, forwardRef }) {
  if (!recap) return null;

  const {
    matchday,
    leagueName,
    username,
    rank,
    points,
    rankChange,
    bestPlayer,
    captain,
    joker,
    transfersMade,
    date,
  } = recap;

  const rankChangeText = rankChange > 0
    ? `↑ ${rankChange} place${rankChange > 1 ? 's' : ''}`
    : rankChange < 0
    ? `↓ ${Math.abs(rankChange)} place${Math.abs(rankChange) > 1 ? 's' : ''}`
    : '— Same position';

  const rankChangeColor = rankChange > 0 ? 'var(--positive)' : rankChange < 0 ? 'var(--danger)' : 'var(--mute)';

  return (
    <div
      ref={forwardRef}
      style={{
        width: '360px',
        background: 'var(--ink)',
        color: 'white',
        fontFamily: "'Inter', 'Helvetica Neue', sans-serif",
        position: 'relative',
        overflow: 'hidden',
        borderRadius: '12px',
        border: '1px solid rgba(255,255,255,0.08)',
        padding: '0',
      }}
    >
      {/* Top accent stripe */}
      <div style={{ height: '3px', background: 'linear-gradient(90deg, var(--positive), #16a34a)', width: '100%' }} />

      {/* Header */}
      <div style={{ padding: '24px 24px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ fontSize: '9px', letterSpacing: '0.25em', color: 'var(--mute)', textTransform: 'uppercase', fontWeight: 900, marginBottom: '4px' }}>
          {leagueName}
        </div>
        <div style={{ fontSize: '20px', fontWeight: 900, letterSpacing: '-0.02em', textTransform: 'uppercase' }}>
          Matchday {matchday} Recap
        </div>
        <div style={{ fontSize: '10px', color: 'var(--mute)', marginTop: '4px', fontWeight: 600 }}>{date}</div>
      </div>

      {/* Rank Highlight */}
      <div style={{ padding: '28px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)', textAlign: 'center', background: 'rgba(255,255,255,0.02)' }}>
        <div style={{ fontSize: '9px', letterSpacing: '0.2em', color: 'var(--mute)', textTransform: 'uppercase', fontWeight: 900, marginBottom: '8px' }}>
          Final Rank
        </div>
        <div style={{ fontSize: '64px', fontWeight: 900, lineHeight: 1, letterSpacing: '-0.04em' }}>
          {rank}{rank === 1 ? 'st' : rank === 2 ? 'nd' : rank === 3 ? 'rd' : 'th'}
        </div>
        <div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--positive)', marginTop: '8px', letterSpacing: '0.02em' }}>
          {points} pts this matchday
        </div>
        <div style={{ fontSize: '14px', fontWeight: 700, color: rankChangeColor, marginTop: '6px' }}>
          {rankChangeText}
        </div>
      </div>

      {/* Stat rows */}
      <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {/* Best Player */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--ink-2)', border: '1px solid var(--rule)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 900, color: 'var(--mute)' }}>
              {bestPlayer?.name?.substring(0, 2).toUpperCase()}
            </div>
            <div>
              <div style={{ fontSize: '10px', color: 'var(--mute)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em' }}>Best Player</div>
              <div style={{ fontSize: '13px', fontWeight: 700 }}>{bestPlayer?.name}</div>
            </div>
          </div>
          <div style={{ background: 'white', color: 'var(--ink)', fontSize: '12px', fontWeight: 900, padding: '3px 8px', borderRadius: '3px' }}>
            {bestPlayer?.points != null ? `${bestPlayer.points} pts` : '— pts'}
          </div>
        </div>

        {/* Captain */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(224,168,0,0.15)', border: '1px solid var(--gold)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 900, color: 'var(--gold)' }}>
              C
            </div>
            <div>
              <div style={{ fontSize: '10px', color: 'var(--mute)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em' }}>Captain</div>
              <div style={{ fontSize: '13px', fontWeight: 700 }}>{captain?.name}</div>
            </div>
          </div>
          <div style={{ background: 'var(--gold)', color: 'var(--ink)', fontSize: '12px', fontWeight: 900, padding: '3px 8px', borderRadius: '3px' }}>
            {captain?.points != null ? `×2 = ${captain.points * 2} pts` : '×2'}
          </div>
        </div>

        {/* Joker */}
        {joker && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div className="fk-mono" style={{ width: '32px', height: '32px', border: '1px solid var(--pos-gk)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '8px', color: 'var(--pos-gk)' }}>
                JKR
              </div>
              <div>
                <div style={{ fontSize: '10px', color: '#555', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em' }}>Joker Played</div>
                <div style={{ fontSize: '13px', fontWeight: 700 }}>{joker?.name}</div>
              </div>
            </div>
            <div style={{ background: '#a855f7', color: '#fff', fontSize: '12px', fontWeight: 900, padding: '3px 8px', borderRadius: '3px' }}>
              {joker?.points != null ? `${joker.points} pts` : '— pts'}
            </div>
          </div>
        )}

        {/* Transfers */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '8px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ fontSize: '11px', color: '#555', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em' }}>Transfers made</div>
          <div style={{ fontSize: '13px', fontWeight: 700 }}>{transfersMade}</div>
        </div>
      </div>

      {/* Footer / Branding */}
      <div style={{ padding: '14px 24px', background: '#080808', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: '11px', fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#333' }}>
          Forza Fantasy League
        </div>
        <div style={{ fontSize: '10px', color: '#333', fontWeight: 600 }}>
          {username}
        </div>
      </div>
    </div>
  );
}
