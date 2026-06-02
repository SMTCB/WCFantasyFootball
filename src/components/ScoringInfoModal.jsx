import { useEffect } from 'react';

const MONO = 'var(--font-mono, monospace)';
const DISPLAY = 'Archivo Black, sans-serif';

const POSITIONS = [
  {
    pos: 'GK', color: 'var(--gold)',
    rules: [
      { label: 'Save',          val: '+0.5' },
      { label: 'Clean Sheet',   val: '+4' },
      { label: 'Goal',          val: '+5' },
      { label: 'Assist',        val: '+3' },
      { label: 'Penalty Saved', val: '+5' },
    ],
  },
  {
    pos: 'DEF', color: 'var(--cyan)',
    rules: [
      { label: 'Clean Sheet',   val: '+4' },
      { label: 'Goal',          val: '+5' },
      { label: 'Assist',        val: '+2' },
      { label: 'Tackle Won',    val: '+0.5' },
      { label: 'Interception',  val: '+0.25' },
    ],
  },
  {
    pos: 'MID', color: 'var(--positive)',
    rules: [
      { label: 'Goal',           val: '+4' },
      { label: 'Assist',         val: '+2' },
      { label: 'Key Pass',       val: '+0.25' },
      { label: 'Shot on Target', val: '+0.5' },
    ],
  },
  {
    pos: 'FWD', color: 'var(--danger)',
    rules: [
      { label: 'Goal',              val: '+4' },
      { label: 'Assist',            val: '+2' },
      { label: 'Shot on Target',    val: '+0.25' },
      { label: 'Big Chance Created', val: '+1' },
    ],
  },
];

const UNIVERSAL = [
  { label: 'Minutes (per 90)', val: '+1', neg: false },
  { label: 'Yellow Card',      val: '−1', neg: true  },
  { label: 'Red Card',         val: '−3', neg: true  },
  { label: 'Own Goal',         val: '−2', neg: true  },
  { label: 'Penalty Missed',   val: '−1', neg: true  },
];

export default function ScoringInfoModal({ onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,.7)', display: 'flex',
        alignItems: 'flex-end', justifyContent: 'center',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 480,
          background: 'var(--ink)', borderRadius: '16px 16px 0 0',
          padding: '0 0 32px', maxHeight: '85vh', overflowY: 'auto',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '18px 20px 14px', borderBottom: '1px solid var(--rule)',
          position: 'sticky', top: 0, background: 'var(--ink)', zIndex: 1,
        }}>
          <div>
            <div style={{ fontFamily: DISPLAY, fontSize: 14, letterSpacing: '-0.01em' }}>
              SCORING SYSTEM
            </div>
            <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)', letterSpacing: '.14em', marginTop: 2 }}>
              V2 — ADDITIVE · EVERY POINT TRACEABLE
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', color: 'var(--mute)',
              fontFamily: MONO, fontSize: 10, letterSpacing: '.1em', cursor: 'pointer', padding: 4,
            }}
          >
            CLOSE
          </button>
        </div>

        {/* Position blocks */}
        {POSITIONS.map(({ pos, color, rules }) => (
          <div key={pos} style={{ padding: '14px 20px 0' }}>
            <div style={{
              fontFamily: MONO, fontSize: 9, letterSpacing: '.18em',
              color, marginBottom: 8,
            }}>
              {pos}
            </div>
            {rules.map(({ label, val }) => (
              <div key={label} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,.04)',
              }}>
                <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--paper)', letterSpacing: '.06em' }}>
                  {label}
                </span>
                <span style={{
                  fontFamily: DISPLAY, fontSize: 13,
                  color: val.startsWith('−') ? 'var(--danger)' : 'var(--positive)',
                }}>
                  {val}
                </span>
              </div>
            ))}
          </div>
        ))}

        {/* Universal */}
        <div style={{ padding: '14px 20px 0' }}>
          <div style={{
            fontFamily: MONO, fontSize: 9, letterSpacing: '.18em',
            color: 'var(--mute)', marginBottom: 8,
          }}>
            ALL POSITIONS
          </div>
          {UNIVERSAL.map(({ label, val, neg }) => (
            <div key={label} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,.04)',
            }}>
              <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--paper)', letterSpacing: '.06em' }}>
                {label}
              </span>
              <span style={{
                fontFamily: DISPLAY, fontSize: 13,
                color: neg ? 'var(--danger)' : 'var(--positive)',
              }}>
                {val}
              </span>
            </div>
          ))}
        </div>

        <div style={{
          margin: '16px 20px 0',
          fontFamily: MONO, fontSize: 8, color: 'var(--mute)', letterSpacing: '.1em', lineHeight: 1.6,
        }}>
          CHIP MULTIPLIERS: CAPTAIN ×2 · TRIPLE CAPTAIN ×3 · JOKER ×2 · CHIPS DO NOT STACK — MAX APPLIES
        </div>
      </div>
    </div>
  );
}
