import { useNavigate } from 'react-router-dom';
import { useClubhouseContext } from '../context/ClubhouseContext';

const BODY = { fontFamily: 'var(--font-body)' };

function useGoTo() {
  const navigate = useNavigate();
  const { setActiveCircleId } = useClubhouseContext();
  return (item) => {
    if (item.to) {
      if (item.circleId) setActiveCircleId(item.circleId);
      navigate(item.to);
      return;
    }
    // Bets to take or pass on are answered on their card in the Room.
    setActiveCircleId(item.circleId);
    navigate(`/clubhouse/${item.circleId}?tab=room`);
  };
}

// Home: a list, one small button per row, each labelled with its clubhouse
// (circleNames: { [circleId]: name }). Renders nothing when nothing is waiting.
export function YourMoveList({ move, circleNames = {}, style }) {
  const go = useGoTo();
  if (!move || move.loading || move.items.length === 0) return null;
  const clubhouseCount = new Set(move.items.map(i => i.circleId).filter(Boolean)).size;
  return (
    <div style={{ marginBottom: 28, ...style }}>
      <h2 style={{ margin: '0 0 12px', fontSize: 'var(--fs-body)', fontWeight: 700, color: 'var(--paper)', display: 'flex', alignItems: 'baseline', gap: 8 }}>
        Your move · {move.count}
        {clubhouseCount > 1 && (
          <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-micro)', fontWeight: 400, color: 'var(--mute)' }}>
            from {clubhouseCount} clubhouses
          </span>
        )}
      </h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {move.items.map(item => (
          <div key={item.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'var(--card)', border: '1px solid var(--rule)', borderRadius: 'var(--radius)' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              {circleNames[item.circleId] && (
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-micro)', letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--gold-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {circleNames[item.circleId]}
                </div>
              )}
              <div style={{ ...BODY, fontSize: 'var(--fs-body)', color: 'var(--paper)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</div>
              <div style={{ ...BODY, fontSize: 'var(--fs-label)', color: 'var(--mute)' }}>{item.sub}</div>
            </div>
            <button
              onClick={() => go(item)}
              style={{ flexShrink: 0, minHeight: 'var(--tap)', padding: '0 14px', background: 'var(--accent)', color: 'var(--on-accent)', border: 'none', borderRadius: 6, ...BODY, fontSize: 'var(--fs-label)', fontWeight: 700, cursor: 'pointer' }}
            >{item.cta}</button>
          </div>
        ))}
      </div>
    </div>
  );
}

// Room: one line at the top. Tapping it opens the first thing waiting (or Bets).
export function YourMoveLine({ move, coinsOnTable = 0, onWallet }) {
  const go = useGoTo();
  const navigate = useNavigate();
  if (!move || move.loading) return null;
  const first = move.items[0];
  const parts = [
    move.count > 0 ? `${move.count} waiting for you` : 'Nothing waiting for you',
    `${move.openBets} open ${move.openBets === 1 ? 'bet' : 'bets'}`,
    `${coinsOnTable.toLocaleString()} coins on the table`,
  ];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', background: 'var(--card)', borderBottom: '1px solid var(--rule)', flexShrink: 0 }}>
      <button
        onClick={() => (first ? go(first) : navigate('/challenges?tab=bets'))}
        style={{ flex: 1, minWidth: 0, minHeight: 'var(--tap)', textAlign: 'left', background: 'transparent', border: 'none', cursor: 'pointer', ...BODY, fontSize: 'var(--fs-label)', color: move.count > 0 ? 'var(--accent)' : 'var(--mute)', fontWeight: move.count > 0 ? 700 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
      >{parts.join(' · ')}</button>
      {onWallet && (
        <button onClick={onWallet} style={{ flexShrink: 0, minHeight: 'var(--tap)', padding: '0 4px', background: 'transparent', border: 'none', color: 'var(--mute)', ...BODY, fontSize: 'var(--fs-label)', textDecoration: 'underline', cursor: 'pointer' }}>Wallet</button>
      )}
    </div>
  );
}
