import BottomSheet from '../shared/BottomSheet';
import { IconClose, IconWarning } from '../UiIcons';

// LEAGUE-SHEET-1: the trade builder used to be a hand-built dark overlay inside
// LeagueScreen with no focus trap. It lives here so it can use the shared
// BottomSheet: LeagueScreen must not import BottomSheet itself, its children
// already do (Rolldown TDZ rule, CLAUDE.md).

const normalizePos = (pos) => (pos ?? '').toUpperCase().replace('FW', 'FWD');

const offerCard = { background: 'var(--card)', border: '1px solid var(--rule)', borderRadius: 4, padding: '12px 16px', marginBottom: 8 };
const offerRow = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 };
const smallBtn = { fontSize: 'var(--fs-micro)', fontWeight: 900, padding: '6px 14px', borderRadius: 2, border: 'none', cursor: 'pointer' };

function sortByPosMatch(list, other) {
  if (!other) return list;
  const want = normalizePos(other.position);
  return [...list].sort((a, b) => {
    const am = normalizePos(a.position) === want;
    const bm = normalizePos(b.position) === want;
    return am === bm ? 0 : am ? -1 : 1;
  });
}

function PlayerOptions({ list, other }) {
  return sortByPosMatch(list, other).map(p => {
    const posMatch = !other || normalizePos(p.position) === normalizePos(other.position);
    return <option key={p.id} value={p.id} disabled={!posMatch}>{p.position ? `[${p.position}] ` : ''}{p.name}{p.price ? ` · €${p.price}M` : ''}</option>;
  });
}

export default function TradeBuilderSheet({
  target, onClose, showToast,
  incomingTrades, outgoingTrades, acceptProposal, rejectProposal, cancelProposal,
  mySquadPlayers, theirSquadPlayers,
  myPlayer, setMyPlayer, theirPlayer, setTheirPlayer,
  myListings, toggleListing,
  cash, setCash, points, setPoints,
  error, sending, onSend,
}) {
  const run = async (fn, ok, kind) => {
    try { await fn(); showToast(ok, kind); } catch (err) { showToast(err.message, 'error'); }
  };
  const mismatch = myPlayer && theirPlayer && normalizePos(myPlayer.position) !== normalizePos(theirPlayer.position);

  return (
    <BottomSheet onClose={onClose} ariaLabel={`Trade with ${target.name}`} background="var(--bg)"
      maxHeight="90vh" maxWidth={600} contentStyle={{ height: '90vh', overflowY: 'hidden' }}>
      <div className="px-6 py-4 border-b border-[var(--rule)] flex justify-between items-center shrink-0">
        <div>
          <div className="text-[length:var(--fs-micro)] font-black uppercase tracking-[.14em] mb-1" style={{ color: 'var(--accent)' }}>Negotiation table</div>
          <h2 className="text-[length:var(--fs-heading)] font-bold text-[var(--paper)]">Trade with {target.name}</h2>
        </div>
        <button onClick={onClose} aria-label="Close" className="hit-44 text-[var(--mute)] hover:text-[var(--paper)] transition-colors" style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'grid', placeItems: 'center' }}>
          <IconClose size={20} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-6 py-8 flex flex-col gap-8 no-scrollbar">
        {incomingTrades.length > 0 && (
          <div>
            <h3 style={{ color: 'var(--gold-text)', fontSize: 'var(--fs-label)', fontWeight: 900, letterSpacing: 2, marginBottom: 12 }}>
              INCOMING OFFERS ({incomingTrades.length})
            </h3>
            {incomingTrades.map(p => (
              <div key={p.id} style={offerCard}>
                <div style={offerRow}>
                  <span style={{ color: 'var(--paper)', fontSize: 'var(--fs-label)', fontWeight: 700 }}>
                    {p.proposer_player?.name} <span style={{ color: 'var(--mute)' }}>for</span> {p.target_player?.name}
                  </span>
                  <span style={{ color: 'var(--mute)', fontSize: 'var(--fs-micro)' }}>
                    {new Date(p.created_at).toLocaleDateString()}
                  </span>
                </div>
                {(p.cash_sweetener !== 0 || p.points_sweetener > 0) && (
                  <div style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
                    {p.cash_sweetener !== 0 && (
                      <span style={{ color: p.cash_sweetener > 0 ? 'var(--positive)' : 'var(--danger)', fontSize: 'var(--fs-micro)', fontWeight: 700 }}>
                        {p.cash_sweetener > 0 ? `+€${p.cash_sweetener}M (you receive)` : `-€${Math.abs(p.cash_sweetener)}M (you pay)`}
                      </span>
                    )}
                    {p.points_sweetener > 0 && (
                      <span style={{ color: 'var(--gold-text)', fontSize: 'var(--fs-micro)', fontWeight: 700 }}>
                        +{p.points_sweetener} pts sweetener
                      </span>
                    )}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="hit-44" onClick={() => run(() => acceptProposal(p.id), 'Trade accepted! Squads updated.', 'success')}
                    style={{ ...smallBtn, background: 'var(--positive)', color: 'var(--on-accent)' }}>ACCEPT</button>
                  <button className="hit-44" onClick={() => run(() => rejectProposal(p.id), 'Trade rejected.', 'info')}
                    style={{ ...smallBtn, background: 'var(--elev)', color: 'var(--mute)' }}>DECLINE</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {outgoingTrades.length > 0 && (
          <div>
            <h3 style={{ color: 'var(--mute)', fontSize: 'var(--fs-label)', fontWeight: 900, letterSpacing: 2, marginBottom: 12 }}>
              SENT OFFERS ({outgoingTrades.length})
            </h3>
            {outgoingTrades.map(p => (
              <div key={p.id} style={offerCard}>
                <div style={offerRow}>
                  <span style={{ color: 'var(--paper)', fontSize: 'var(--fs-label)', fontWeight: 700 }}>
                    {p.proposer_player?.name} <span style={{ color: 'var(--mute)' }}>for</span> {p.target_player?.name}
                  </span>
                  <span style={{ color: 'var(--mute)', fontSize: 'var(--fs-micro)' }}>awaiting response</span>
                </div>
                <button className="hit-44" onClick={() => run(() => cancelProposal(p.id), 'Offer cancelled.', 'info')}
                  style={{ background: 'transparent', color: 'var(--danger)', fontSize: 'var(--fs-micro)', fontWeight: 700, padding: '4px 10px', borderRadius: 2, border: '1px solid var(--danger)', cursor: 'pointer' }}>
                  Cancel offer
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-[1fr_40px_1fr] items-center gap-2">
          <div className="flex flex-col gap-2">
            <label htmlFor="trade-my-player" className="text-[length:var(--fs-micro)] font-black text-[var(--mute)] uppercase tracking-widest text-center">My player</label>
            {/* The other side is not cleared on change: the mismatch warning and the send check handle it */}
            <select id="trade-my-player" value={myPlayer?.id || ''} onChange={(e) => setMyPlayer(mySquadPlayers.find(p => p.id === e.target.value))}
              className="bg-[var(--elev)] border border-[var(--rule)] p-3 rounded-sm text-[var(--paper)] text-[length:var(--fs-micro)] font-bold outline-none text-center">
              <option value="">{mySquadPlayers.length ? '(None)' : 'Loading…'}</option>
              <PlayerOptions list={mySquadPlayers} other={theirPlayer} />
            </select>
            {myPlayer && (
              <button
                onClick={() => toggleListing(myPlayer.id)}
                className={`text-[length:var(--fs-micro)] font-black uppercase tracking-widest px-2 py-1 rounded border transition-all ${
                  myListings.has(myPlayer.id)
                    ? 'border-[var(--pos)]/40 text-[var(--pos)] bg-[var(--pos-bg)]'
                    : 'border-[var(--rule)] text-[var(--mute)]'
                }`}
              >
                {myListings.has(myPlayer.id) ? '✓ Listed for trade' : '+ List for trade'}
              </button>
            )}
          </div>
          <div aria-hidden="true" className="text-xl mt-6 flex justify-center" style={{ color: 'var(--mute)' }}>↔</div>
          <div className="flex flex-col gap-2">
            <label htmlFor="trade-their-player" className="text-[length:var(--fs-micro)] font-black text-[var(--mute)] uppercase tracking-widest text-center">Their player</label>
            <select id="trade-their-player" value={theirPlayer?.id || ''} onChange={(e) => setTheirPlayer(theirSquadPlayers.find(p => p.id === e.target.value))}
              className="bg-[var(--elev)] border border-[var(--rule)] p-3 rounded-sm text-[var(--paper)] text-[length:var(--fs-micro)] font-bold outline-none text-center text-ellipsis overflow-hidden">
              <option value="">{theirSquadPlayers.length ? '(None)' : 'Loading…'}</option>
              <PlayerOptions list={theirSquadPlayers} other={myPlayer} />
            </select>
          </div>
        </div>

        <div className="space-y-4 pt-6 border-t border-[var(--rule)]">
          <div className="flex justify-between items-center mb-2">
            <span className="text-[length:var(--fs-micro)] font-bold text-[var(--paper)]">Add Cash Sweetener</span>
            <span className="text-[length:var(--fs-label)] font-black text-positive">€{cash.toFixed(1)}M</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-[length:var(--fs-micro)] text-[var(--mute)]">€0M</span>
            <input type="range" aria-label="Cash sweetener" min="-10" max="10" step="0.5" value={cash} onChange={e => setCash(parseFloat(e.target.value))} className="flex-1 accent-cyan" />
            <span className="text-[length:var(--fs-micro)] text-[var(--mute)]">€10M</span>
          </div>
          <p className="text-[length:var(--fs-micro)] text-[var(--mute)] italic text-center">Shift budget caps to balance unequal player values.</p>
        </div>

        <div className="space-y-4 pt-6 border-t border-[var(--rule)]">
          <div className="flex justify-between items-center mb-2">
            <span className="text-[length:var(--fs-micro)] font-bold text-[var(--paper)]">Add Points Penalty</span>
            <span className="text-[length:var(--fs-label)] font-black" style={{ color: 'var(--danger)' }}>{points} pts</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-[length:var(--fs-micro)] text-[var(--mute)]">0</span>
            <input type="range" aria-label="Points penalty" min="0" max="50" step="1" value={points} onChange={e => setPoints(parseInt(e.target.value))} className="flex-1" style={{ accentColor: 'var(--danger)' }} />
            <span className="text-[length:var(--fs-micro)] text-[var(--mute)]">50</span>
          </div>
          <p className="text-[length:var(--fs-micro)] text-[var(--mute)] italic text-center">Give up raw ranking points to secure a star player.</p>
        </div>
      </div>
      <div className="p-6 border-t border-[var(--rule)] bg-[var(--bg)] space-y-3 shrink-0">
        {mismatch && (
          <div className="text-[length:var(--fs-micro)] font-bold text-center" style={{ color: 'var(--danger)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <IconWarning size={14} />
            <span>Position mismatch — trades must swap same-position players ({normalizePos(myPlayer.position)} ↔ {normalizePos(theirPlayer.position)})</span>
          </div>
        )}
        {error && <div className="text-[length:var(--fs-micro)] font-bold text-center" style={{ color: 'var(--danger)' }}>{error}</div>}
        <button
          disabled={sending}
          onClick={onSend}
          className="w-full py-4 text-white text-[length:var(--fs-label)] font-black uppercase tracking-widest rounded active:scale-95"
          style={{ backgroundColor: 'var(--accent)' }}
        >
          Broadcast Proposal
        </button>
      </div>
    </BottomSheet>
  );
}
