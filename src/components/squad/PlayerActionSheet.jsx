// The sheet that opens when you tap a player on the Squad pitch or bench.
// Moved out of SquadScreen unchanged (S30, design lock in
// docs/product/LEAGUE_MY_TEAM_PLAN_2026-11-21.md section 0): same markup, same styles.
// ClubCrest and FormStrip come in as props so each module stays at one import depth
// (Rolldown TDZ rule in CLAUDE.md).
import { createPortal } from 'react-dom';

export default function PlayerActionSheet({
  selectedPlayer, captainId, selectedIsBench, saving, squadStatsMap, starterCount, benchCount,
  onClose, onOpenStats, onMakeCaptain, onAddToPitch, onSwap, onReplace, ...components
}) {
  const { ClubCrest, FormStrip } = components;
  return createPortal(
    <>
      {/* Tap-outside dismiss — portaled to body so iOS WebKit stacking context doesn't trap z-index */}
      <div role="presentation"
        className="fixed inset-0 z-[59] lg:left-0"
        onClick={onClose}
      />
    <div
      className="fixed bottom-0 left-0 right-0 lg:left-0 z-[60] animate-slide-up"
      style={{
        background: 'var(--card)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        borderTop: '1px solid var(--rule)',
        boxShadow: '0 -8px 40px rgba(0,0,0,0.12)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      <div className="max-w-2xl mx-auto px-5 pt-4 pb-5">
        {/* Handle */}
        <div className="flex justify-center mb-3">
          <div className="w-10 h-1 rounded-full" style={{ background: 'var(--rule)' }} />
        </div>
        {/* Player info */}
        <div className="flex items-start justify-between mb-4 gap-3">
          <div className="flex items-start gap-3">
            {/* Position badge — matches player list row style */}
            <div style={{
              width: 44,
              height: 44,
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'var(--elev)',
              border: `1.5px solid ${
                selectedPlayer.position === 'GK' ? 'var(--pos-gk)' :
                selectedPlayer.position === 'DEF' ? 'var(--pos-def)' :
                selectedPlayer.position === 'MID' ? 'var(--pos-mid)' :
                'var(--pos-fwd)'
              }`,
              color: selectedPlayer.position === 'GK' ? 'var(--pos-gk)' :
                selectedPlayer.position === 'DEF' ? 'var(--pos-def)' :
                selectedPlayer.position === 'MID' ? 'var(--pos-mid)' :
                'var(--pos-fwd)',
              fontFamily: 'Archivo Black, sans-serif',
              fontSize: 'var(--fs-micro)',
            }}>
              {selectedPlayer.position}
            </div>
            <div>
              <div style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 'var(--fs-heading)', color: 'var(--paper)', lineHeight: 1.1, display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                {selectedPlayer.name}
                {selectedPlayer.price > 0 && (
                  <span style={{ fontFamily: 'Archivo, sans-serif', fontSize: 'var(--fs-label)', color: 'var(--paper)' }}>
                    €{Number(selectedPlayer.price).toFixed(1)}M
                  </span>
                )}
              </div>
              <div style={{ fontSize: 'var(--fs-label)', color: 'var(--mute)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                <ClubCrest name={selectedPlayer.club} size={16} />
                {selectedPlayer.club}
                {selectedPlayer.id === captainId && (
                  <span style={{ color: 'var(--gold-text)', background: 'rgba(184,114,14,0.12)', border: '1px solid rgba(184,114,14,0.3)', padding: '1px 6px', borderRadius: 2 }}>CAPTAIN</span>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ width: 28, height: 28, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--elev)', border: '1px solid var(--rule)', color: 'var(--mute)', fontSize: 'var(--fs-body-lg)', cursor: 'pointer' }}
          >×</button>
        </div>
        {/* Form + next fixture + ownership context strip */}
        <div className="flex items-stretch gap-3 mb-3" style={{ borderTop: '1px solid var(--rule)', borderBottom: '1px solid var(--rule)', padding: '10px 0' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 'var(--fs-label)', color: 'var(--mute)', marginBottom: 6 }}>FORM</div>
            <FormStrip rounds={squadStatsMap[selectedPlayer.id]} />
          </div>
          <div style={{ flex: 1, minWidth: 0, borderLeft: '1px solid var(--rule)', paddingLeft: 12 }}>
            <div style={{ fontSize: 'var(--fs-label)', color: 'var(--mute)', marginBottom: 6 }}>Next fixture</div>
            <div style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 'var(--fs-label)', color: selectedPlayer.fixtureStatus?.color || 'var(--paper)', letterSpacing: '-0.01em' }}>
              {selectedPlayer.fixtureStatus?.label || 'No fixture'}
            </div>
          </div>
        </div>
        {/* View full stats dashboard */}
        <button
          onClick={() => onOpenStats(selectedPlayer)}
          className="w-full mb-3 py-2 rounded-sm transition-all active:scale-95"
          style={{ background: 'var(--accent-soft)', color: 'var(--accent)', border: '1px solid rgba(26,111,168,0.35)', fontFamily: 'Archivo Black, sans-serif', fontSize: 'var(--fs-micro)' }}
        >
          View full stats dashboard ↗
        </button>
        {/* Actions */}
        <div className="flex gap-2 mb-3">
          {!selectedIsBench && (
            <button
              onClick={onMakeCaptain}
              disabled={saving || captainId === selectedPlayer.id}
              className="flex-1 py-3 rounded-sm transition-all active:scale-95 disabled:opacity-30"
              style={{
                background: captainId === selectedPlayer.id ? 'rgba(224,168,0,0.12)' : 'var(--gold)',
                color: captainId === selectedPlayer.id ? 'var(--gold)' : '#0A0A0A',
                border: captainId === selectedPlayer.id ? '1px solid rgba(224,168,0,0.35)' : '1px solid var(--gold)',
                fontFamily: 'Archivo Black, sans-serif', fontSize: 'var(--fs-micro)',
              }}
            >
              {captainId === selectedPlayer.id ? 'Current captain' : 'Make captain'}
            </button>
          )}
          {selectedIsBench && starterCount < 11 ? (
            // Direct promotion: if starters < 11, just add bench player to pitch without swapping anyone out
            <button
              onClick={onAddToPitch}
              disabled={saving}
              className="flex-1 py-3 rounded-sm transition-all active:scale-95 disabled:opacity-40"
              style={{ background: 'var(--accent)', color: '#0A0A0A', border: '1px solid var(--accent)', fontFamily: 'Archivo Black, sans-serif', fontSize: 'var(--fs-micro)' }}
            >
              Add to pitch
            </button>
          ) : (
            // Swap mode: only if starters = 11 and user wants to swap
            <button
              onClick={onSwap}
              disabled={saving || (selectedIsBench && starterCount >= 11 && benchCount === 1)}
              className="flex-1 py-3 rounded-sm transition-all active:scale-95 disabled:opacity-40"
              style={{ background: 'transparent', color: 'var(--accent)', border: '1px solid var(--accent)', fontFamily: 'Archivo Black, sans-serif', fontSize: 'var(--fs-micro)' }}
            >
              {selectedIsBench ? 'Sub in' : 'Sub out'}
            </button>
          )}
        </div>
        {/* S31 (MD-12): optional, only passed while the transfer window is open */}
        {onReplace && (
          <button
            onClick={onReplace}
            disabled={saving}
            data-testid="player-sheet-replace"
            className="w-full py-3 rounded-sm transition-all active:scale-95 disabled:opacity-40"
            style={{ background: 'transparent', color: 'var(--accent)', border: '1px solid var(--accent)', fontFamily: 'Archivo Black, sans-serif', fontSize: 'var(--fs-micro)' }}
          >
            Replace
          </button>
        )}
      </div>
    </div>
    </>,
    document.body
  );
}
