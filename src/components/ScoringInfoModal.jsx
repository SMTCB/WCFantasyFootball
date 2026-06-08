import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

const MONO = 'var(--font-mono, monospace)';
const DISPLAY = 'Archivo Black, sans-serif';

const POSITIONS = [
  {
    pos: 'GK', color: 'var(--gold)',
    rules: [
      { label: 'Save',          val: '+0.5' },
      { label: 'Clean Sheet',   val: '+4', note: '60+ min' },
      { label: 'Goal',          val: '+6' },
      { label: 'Assist',        val: '+3' },
      { label: 'Penalty Saved', val: '+5' },
    ],
  },
  {
    pos: 'DEF', color: 'var(--cyan)',
    rules: [
      { label: 'Clean Sheet',   val: '+4', note: '45+ min' },
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
      { label: 'Shot on Target', val: '+0.25' },
    ],
  },
  {
    pos: 'FWD', color: 'var(--danger)',
    rules: [
      { label: 'Goal',               val: '+4' },
      { label: 'Assist',             val: '+2' },
      { label: 'Shot on Target',     val: '+0.25' },
      { label: 'Big Chance Created', val: '+0.5' },
    ],
  },
];

const UNIVERSAL = [
  { label: 'Minutes (per 60)', val: '+1',  neg: false },
  { label: 'Yellow Card',      val: '−1',  neg: true  },
  { label: 'Red Card',         val: '−3',  neg: true  },
  { label: 'Own Goal',         val: '−2',  neg: true  },
  { label: 'Penalty Missed',   val: '−2',  neg: true  },
];

const SQUAD_RULES = [
  { label: 'Squad Size',         val: '15 players' },
  { label: 'Starting XI',        val: '11 players' },
  { label: 'Goalkeepers',        val: '1 GK' },
  { label: 'Defenders',          val: '3 – 5' },
  { label: 'Midfielders',        val: '2 – 5' },
  { label: 'Forwards',           val: '1 – 3' },
  { label: 'Max per Club',       val: '3 players' },
  { label: 'Budget',             val: '€50M' },
];

export default function ScoringInfoModal({ onClose }) {
  const [tab, setTab] = useState('scoring'); // 'scoring' | 'rules'

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
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
        {/* Sticky header */}
        <div style={{
          position: 'sticky', top: 0, background: 'var(--ink)', zIndex: 1,
          borderBottom: '1px solid var(--rule)',
        }}>
          {/* Title + close */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '18px 20px 12px',
          }}>
            <div>
              <div style={{ fontFamily: DISPLAY, fontSize: 14, letterSpacing: '-0.01em' }}>
                {tab === 'scoring' ? 'SCORING SYSTEM' : 'SQUAD RULES'}
              </div>
              <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)', letterSpacing: '.14em', marginTop: 2 }}>
                {tab === 'scoring' ? 'V2 — ADDITIVE · EVERY POINT TRACEABLE' : 'FORMATION & LIMITS'}
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

          {/* Tab switcher */}
          <div style={{ display: 'flex', padding: '0 20px 12px', gap: 8 }}>
            {[{ id: 'scoring', label: 'SCORING' }, { id: 'rules', label: 'SQUAD RULES' }].map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                style={{
                  flex: 1, padding: '7px 0',
                  background: tab === t.id ? 'var(--gold)' : 'rgba(255,255,255,0.05)',
                  border: 'none', borderRadius: 4, cursor: 'pointer',
                  fontFamily: MONO, fontSize: 9, letterSpacing: '.14em',
                  color: tab === t.id ? '#000' : 'var(--mute)',
                  fontWeight: tab === t.id ? 700 : 400,
                  transition: 'all 0.15s',
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Scoring tab ── */}
        {tab === 'scoring' && (
          <>
            {POSITIONS.map(({ pos, color, rules }) => (
              <div key={pos} style={{ padding: '14px 20px 0' }}>
                <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.18em', color, marginBottom: 8 }}>
                  {pos}
                </div>
                {rules.map(({ label, val, note }) => (
                  <div key={label} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,.04)',
                  }}>
                    <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--paper)', letterSpacing: '.06em' }}>
                      {label}
                      {note && (
                        <span style={{ marginLeft: 6, fontSize: 8, color: 'var(--mute)', letterSpacing: '.1em' }}>
                          ({note})
                        </span>
                      )}
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
              <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.18em', color: 'var(--mute)', marginBottom: 8 }}>
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
                  <span style={{ fontFamily: DISPLAY, fontSize: 13, color: neg ? 'var(--danger)' : 'var(--positive)' }}>
                    {val}
                  </span>
                </div>
              ))}
            </div>

            <div style={{ margin: '16px 20px 0', fontFamily: MONO, fontSize: 8, color: 'var(--mute)', letterSpacing: '.1em', lineHeight: 1.6 }}>
              CAPTAIN ×2 · TRIPLE CAPTAIN ×3 · JOKER ×2 · CHIPS DO NOT STACK — MAX APPLIES
            </div>
          </>
        )}

        {/* ── Squad Rules tab ── */}
        {tab === 'rules' && (
          <>
            <div style={{ padding: '14px 20px 0' }}>
              <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.18em', color: 'var(--gold)', marginBottom: 8 }}>
                SQUAD STRUCTURE
              </div>
              {SQUAD_RULES.map(({ label, val }) => (
                <div key={label} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,.04)',
                }}>
                  <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--paper)', letterSpacing: '.06em' }}>
                    {label}
                  </span>
                  <span style={{ fontFamily: DISPLAY, fontSize: 13, color: 'var(--cyan)' }}>
                    {val}
                  </span>
                </div>
              ))}
            </div>

            <div style={{ padding: '14px 20px 0' }}>
              <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.18em', color: 'var(--gold)', marginBottom: 8 }}>
                CLUB CAP RULES
              </div>
              <div style={{
                background: 'rgba(255,255,255,0.04)', borderRadius: 6, padding: '10px 14px',
                fontFamily: MONO, fontSize: 10, color: 'var(--paper)', lineHeight: 1.8, letterSpacing: '.04em',
              }}>
                <div>Max <span style={{ color: 'var(--cyan)', fontFamily: DISPLAY }}>3 players</span> per club during group stage.</div>
                <div style={{ marginTop: 6, color: 'var(--mute)', fontSize: 9 }}>
                  The club cap does not increase during this pilot competition. All matchdays use the 3-player limit.
                </div>
              </div>
            </div>

            <div style={{ padding: '14px 20px 0' }}>
              <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.18em', color: 'var(--gold)', marginBottom: 8 }}>
                TRANSFERS
              </div>
              <div style={{
                background: 'rgba(255,255,255,0.04)', borderRadius: 6, padding: '10px 14px',
                fontFamily: MONO, fontSize: 10, color: 'var(--paper)', lineHeight: 1.8, letterSpacing: '.04em',
              }}>
                <div>Up to <span style={{ color: 'var(--cyan)', fontFamily: DISPLAY }}>3 transfers</span> per matchday window.</div>
                <div>Window closes at the <span style={{ color: 'var(--cyan)', fontFamily: DISPLAY }}>matchday deadline</span> and reopens ~8h after the last match.</div>
                <div style={{ marginTop: 6, color: 'var(--mute)', fontSize: 9 }}>
                  Sell-free transfers (commissioner) do not count toward your limit.
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
