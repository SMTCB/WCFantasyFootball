import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

const MONO    = 'var(--font-mono, monospace)';
const DISPLAY = 'Archivo Black, sans-serif';

const POSITIONS = [
  {
    pos: 'GK', color: 'var(--gold)',
    rules: [
      { label: 'Goal',               val: '+8' },
      { label: 'Assist',              val: '+3' },
      { label: 'Clean Sheet',         val: '+4', note: '45+ min' },
      { label: 'Save',                val: '+0.5' },
      { label: 'Penalty Saved',       val: '+5' },
      { label: 'Shootout Save',       val: '+0.5', note: 'per opponent miss' },
      { label: 'Tackle Won',          val: '+0.5' },
      { label: 'Interception',        val: '+0.25' },
      { label: 'Key Pass',            val: '+0.25' },
      { label: 'Shot on Target',      val: '+0.5' },
      { label: 'Big Chance Created',  val: '+0.5' },
      { label: 'Goals Conceded',      val: '−0.5', note: '2nd+ conceded' },
    ],
  },
  {
    pos: 'DEF', color: 'var(--cyan)',
    rules: [
      { label: 'Goal',               val: '+6' },
      { label: 'Assist',             val: '+2' },
      { label: 'Clean Sheet',        val: '+4', note: '45+ min' },
      { label: 'Tackle Won',         val: '+0.5' },
      { label: 'Interception',       val: '+0.25' },
      { label: 'Key Pass',           val: '+0.25' },
      { label: 'Shot on Target',     val: '+0.5' },
      { label: 'Big Chance Created', val: '+0.5' },
      { label: 'Goals Conceded',     val: '−0.5', note: '2nd+ conceded' },
    ],
  },
  {
    pos: 'MID', color: 'var(--positive)',
    rules: [
      { label: 'Goal',               val: '+5' },
      { label: 'Assist',             val: '+2' },
      { label: 'Clean Sheet',        val: '+1', note: '60+ min' },
      { label: 'Tackle Won',         val: '+0.5' },
      { label: 'Interception',       val: '+0.25' },
      { label: 'Key Pass',           val: '+0.25' },
      { label: 'Shot on Target',     val: '+0.25' },
      { label: 'Big Chance Created', val: '+0.5' },
    ],
  },
  {
    pos: 'FWD', color: 'var(--danger)',
    rules: [
      { label: 'Goal',               val: '+4' },
      { label: 'Assist',             val: '+2' },
      { label: 'Tackle Won',         val: '+0.5' },
      { label: 'Interception',       val: '+0.25' },
      { label: 'Key Pass',           val: '+0.25' },
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
  { label: 'Shootout Goal',    val: '+1',  neg: false },
  { label: 'Shootout Miss',    val: '−1',  neg: true  },
];

const SQUAD_RULES = [
  { label: 'Squad Size',   val: '15 players' },
  { label: 'Starting XI',  val: '11 players' },
  { label: 'Goalkeepers',  val: 'Exactly 1' },
  { label: 'Defenders',    val: 'At least 1' },
  { label: 'Midfielders',  val: 'At least 1' },
  { label: 'Forwards',     val: 'At least 1' },
  { label: 'Max per Club', val: '3 players' },
  { label: 'Budget',       val: '€50M' },
];

const TABS = [
  { id: 'scoring',    label: 'SCORING'     },
  { id: 'rules',      label: 'SQUAD RULES' },
  { id: 'game_rules', label: 'GAME RULES'  },
];

const TAB_META = {
  scoring:    { title: 'SCORING SYSTEM',  sub: 'V2 — ADDITIVE · EVERY POINT TRACEABLE' },
  rules:      { title: 'SQUAD RULES',     sub: 'FORMATION & LIMITS'                    },
  game_rules: { title: 'GAME RULES',      sub: 'TRANSFERS · LINEUPS · CAPTAIN'         },
};

function Row({ label, val, valColor = 'var(--cyan)', note }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,.04)',
    }}>
      <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--paper)', letterSpacing: '.06em' }}>
        {label}
        {note && <span style={{ marginLeft: 6, fontSize: 8, color: 'var(--mute)', letterSpacing: '.1em' }}>({note})</span>}
      </span>
      <span style={{ fontFamily: DISPLAY, fontSize: 13, color: valColor }}>{val}</span>
    </div>
  );
}

function Section({ title, children, accent = 'var(--gold)' }) {
  return (
    <div style={{ padding: '14px 20px 0' }}>
      <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.18em', color: accent, marginBottom: 8 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function InfoBox({ children }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.04)', borderRadius: 6, padding: '10px 14px',
      fontFamily: MONO, fontSize: 10, color: 'var(--paper)', lineHeight: 1.8, letterSpacing: '.04em',
    }}>
      {children}
    </div>
  );
}

export default function ScoringInfoModal({ onClose, initialTab }) {
  const [tab, setTab] = useState(initialTab ?? 'scoring');

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const meta = TAB_META[tab];

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
                {meta.title}
              </div>
              <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)', letterSpacing: '.14em', marginTop: 2 }}>
                {meta.sub}
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
            {TABS.map(t => (
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
              <Section key={pos} title={pos} accent={color}>
                {rules.map(({ label, val, note }) => (
                  <Row
                    key={label}
                    label={label}
                    note={note}
                    val={val}
                    valColor={val.startsWith('−') ? 'var(--danger)' : 'var(--positive)'}
                  />
                ))}
              </Section>
            ))}

            <Section title="ALL POSITIONS" accent="var(--mute)">
              {UNIVERSAL.map(({ label, val, neg }) => (
                <Row key={label} label={label} val={val} valColor={neg ? 'var(--danger)' : 'var(--positive)'} />
              ))}
            </Section>

            <div style={{ margin: '16px 20px 0', fontFamily: MONO, fontSize: 8, color: 'var(--mute)', letterSpacing: '.1em', lineHeight: 1.6 }}>
              CAPTAIN ×2 · TRIPLE CAPTAIN ×3 · JOKER ×2 · CHIPS DO NOT STACK — MAX APPLIES
            </div>
          </>
        )}

        {/* ── Squad Rules tab ── */}
        {tab === 'rules' && (
          <>
            <Section title="SQUAD STRUCTURE">
              {SQUAD_RULES.map(({ label, val }) => (
                <Row key={label} label={label} val={val} />
              ))}
            </Section>

            <Section title="CLUB CAP RULES">
              <InfoBox>
                <div>Club cap per round:</div>
                <div style={{ marginTop: 6, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 16px', fontSize: 9 }}>
                  <div style={{ color: 'var(--mute)' }}>Group (MD1–MD3)</div>      <div style={{ color: 'var(--cyan)', fontFamily: DISPLAY }}>3 players</div>
                  <div style={{ color: 'var(--mute)' }}>Round of 32 (MD4)</div>    <div style={{ color: 'var(--cyan)', fontFamily: DISPLAY }}>3 players</div>
                  <div style={{ color: 'var(--mute)' }}>Round of 16 (MD5)</div>    <div style={{ color: 'var(--cyan)', fontFamily: DISPLAY }}>4 players</div>
                  <div style={{ color: 'var(--mute)' }}>QF + SF (MD6–7)</div>      <div style={{ color: 'var(--cyan)', fontFamily: DISPLAY }}>5 players</div>
                  <div style={{ color: 'var(--mute)' }}>Final (MD8)</div>           <div style={{ color: 'var(--cyan)', fontFamily: DISPLAY }}>6 players</div>
                </div>
              </InfoBox>
            </Section>

            <Section title="TRANSFERS">
              <InfoBox>
                <div style={{ marginBottom: 8 }}>
                  <span style={{ color: 'var(--positive)', fontFamily: DISPLAY }}>DRAFT LEAGUES</span>
                  {' — '}<span style={{ color: 'var(--positive)', fontFamily: DISPLAY }}>∞ unlimited</span> buys and sells, no point penalty.
                </div>
                <div>
                  <span style={{ color: 'var(--cyan)', fontFamily: DISPLAY }}>CLASSIC LEAGUES</span>
                  {' — '}Up to <span style={{ color: 'var(--cyan)', fontFamily: DISPLAY }}>3 buys</span> per matchday window. Sells are always free.
                </div>
                <div>Window closes at the <span style={{ color: 'var(--cyan)', fontFamily: DISPLAY }}>matchday deadline</span> and reopens ~8h after the last match.</div>
                <div style={{ marginTop: 6, color: 'var(--mute)', fontSize: 9 }}>
                  Classic leagues only: extra buys beyond 3 are allowed but cost <span style={{ color: 'var(--danger)' }}>−4 pts</span> each. Commissioner free-transfer windows bypass all limits.
                </div>
              </InfoBox>
            </Section>
          </>
        )}

        {/* ── Game Rules tab ── */}
        {tab === 'game_rules' && (
          <>
            <Section title="TRANSFER WINDOW">
              <InfoBox>
                <div style={{ marginBottom: 8 }}>
                  <span style={{ color: 'var(--positive)', fontFamily: DISPLAY }}>OPEN</span>
                  {' — '}Between matchdays. <span style={{ color: 'var(--positive)', fontFamily: DISPLAY }}>Draft leagues: ∞ unlimited</span> buys/sells, no penalty. <span style={{ color: 'var(--cyan)', fontFamily: DISPLAY }}>Classic leagues:</span> up to 3 buys; sells always free; extra buys cost <span style={{ color: 'var(--danger)' }}>−4 pts</span> each.
                </div>
                <div style={{ marginBottom: 8 }}>
                  <span style={{ color: 'var(--gold)', fontFamily: DISPLAY }}>CLOSED</span>
                  {' — '}From the matchday deadline until ~8 hours after the last kick-off of the round. No buys or sells.
                </div>
                <div style={{ fontSize: 9, color: 'var(--mute)' }}>
                  A commissioner free-transfer window bypasses the deadline lock and (for classic leagues) the 3-buy limit entirely.
                </div>
              </InfoBox>
            </Section>

            <Section title="LINEUPS & SUBS">
              <InfoBox>
                <div style={{ marginBottom: 6 }}>
                  <span style={{ color: 'var(--cyan)', fontFamily: DISPLAY }}>SUB OUT</span>
                  {' — '}Tap any starting XI player and choose SUB OUT to move them to the bench. Frees a XI slot for a bench player.
                </div>
                <div style={{ marginBottom: 6 }}>
                  <span style={{ color: 'var(--cyan)', fontFamily: DISPLAY }}>SUB IN</span>
                  {' — '}Tap any bench player and choose SUB IN to bring them into the starting XI.
                </div>
                <div style={{ marginBottom: 6, color: 'var(--gold)' }}>
                  Once a fixture kicks off, any of your players who started that match are <span style={{ fontFamily: DISPLAY }}>LOCKED</span> — they cannot be swapped or benched until the next matchday.
                </div>
                <div style={{ fontSize: 9, color: 'var(--mute)' }}>
                  Auto-subs: at the end of a round, any starter with 0 minutes is automatically replaced by the best-scoring bench player who played, provided formation rules are still valid.
                </div>
              </InfoBox>
            </Section>

            <Section title="CAPTAIN">
              <InfoBox>
                <div style={{ marginBottom: 6 }}>
                  Your captain scores <span style={{ color: 'var(--gold)', fontFamily: DISPLAY }}>×2 points</span>. Set by tapping any player and choosing MAKE CAPTAIN.
                </div>
                <div style={{ marginBottom: 6 }}>
                  You can change your captain anytime the transfer window is <span style={{ color: 'var(--positive)' }}>open</span>.
                </div>
                <div style={{ fontSize: 9, color: 'var(--mute)' }}>
                  If your captain is auto-subbed out (0 minutes played), the ×2 bonus passes to the highest-scoring starter who registered more than 0 points.
                </div>
              </InfoBox>
            </Section>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
