// Compact chips strip shown under the pitch in the league's My team tab (S30, MD-11).
// It only summarises: each pill shows the chip's badge, name and state, and tapping
// any pill opens the full ChipsPanel, where chips are played as before.
// Hidden entirely when the commissioner has turned every chip off.
// S31 (MD-12): with `onJoker`, the Joker gets its own button that goes straight to the picker.
import { useChips } from '../../hooks/useChips';
import { CHIPS } from '../../lib/chips';

const STATE_TEXT = {
  active: 'Active',
  used: 'Used',
  locked: 'Locked',
  blocked: 'Blocked',
  available: 'Ready',
};

export default function ChipsRow({ leagueId, userId, onOpen, onJoker }) {
  const { state, loading, error } = useChips(leagueId, userId);
  if (loading || error || !state?.chips) return null;

  const visible = CHIPS.filter(c => state.chips[c.id]?.status !== 'disabled');
  if (visible.length === 0) return null;
  const jokerStatus = state.chips.joker?.status;
  const showJoker = onJoker && (jokerStatus === 'available' || jokerStatus === 'active');

  return (
    <div data-testid="chips-row" style={{ padding: '12px 16px 4px', borderTop: '1px solid var(--rule)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ fontSize: 'var(--fs-label)', color: 'var(--mute)' }}>Your chips</div>
        <button
          type="button"
          onClick={onOpen}
          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'Archivo, sans-serif', fontSize: 'var(--fs-micro)', color: 'var(--accent)' }}
        >
          How chips work ›
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${visible.length}, minmax(0, 1fr))`, gap: 8 }}>
        {visible.map(chip => {
          const status = state.chips[chip.id]?.status ?? 'locked';
          const active = status === 'active';
          const dim = status === 'used' || status === 'locked' || status === 'blocked';
          return (
            <button
              key={chip.id}
              type="button"
              onClick={onOpen}
              aria-label={`${chip.name} chip, ${STATE_TEXT[status] ?? status}`}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2,
                padding: '8px 10px', minHeight: 44, textAlign: 'left', cursor: 'pointer',
                background: active ? 'var(--accent-soft)' : 'var(--card)',
                border: `1px solid ${active ? chip.tone : 'var(--rule)'}`,
                borderRadius: 10,
                opacity: dim ? 0.55 : 1,
              }}
            >
              <span style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 'var(--fs-micro)', color: chip.toneText, letterSpacing: '0.02em' }}>
                {chip.badge}
              </span>
              <span style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 'var(--fs-label)', color: 'var(--paper)', lineHeight: 1.15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>
                {chip.name}
              </span>
              <span style={{ fontFamily: 'Archivo, sans-serif', fontSize: 'var(--fs-micro)', color: active ? chip.toneText : 'var(--mute)' }}>
                {STATE_TEXT[status] ?? status}
              </span>
            </button>
          );
        })}
      </div>
      {showJoker && (
        <button
          type="button"
          onClick={onJoker}
          data-testid="chips-row-joker"
          className="w-full transition-all active:scale-95"
          style={{ marginTop: 8, minHeight: 44, background: 'transparent', color: 'var(--accent)', border: '1px solid var(--accent)', borderRadius: 10, fontFamily: 'Archivo Black, sans-serif', fontSize: 'var(--fs-micro)', cursor: 'pointer' }}
        >
          {jokerStatus === 'active' ? 'Change your Joker' : 'Pick your Joker'}
        </button>
      )}
    </div>
  );
}
