import { useEffect, useMemo, useRef, useState } from 'react';

// The members display at the top of a clubhouse (MD-4): a C-shaped table with each
// member's face in a seat, you in the gap of the C, a green dot on whoever has the
// clubhouse open right now (MD-5), and the newest Room line popping up as a bubble
// over its sender. Nothing sits on the table: no bets, no chips, no felt.

const SEAT_COLORS = ['var(--accent)', 'var(--f1)', 'var(--ten)', 'var(--gold)', 'var(--positive)', 'var(--mute)'];
const MAX_SEATS = 11;            // seats round the C besides yours
const COMPACT_SEATS = 7;
const ARC_FROM = 62;             // degrees, measured from the gap on the right
const ARC_TO = 298;
const RING_R = 166 / 400;        // seat ring radius as a share of the table width
const BUBBLE_FRESH_MS = 6000;
const BUBBLE_RECENT_MS = 30 * 60 * 1000;

function initial(name) {
  return (name?.trim()?.[0] ?? '?').toUpperCase();
}

function clip(text, n) {
  const t = (text ?? '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

function Face({ name, color, size, me, here, away }) {
  return (
    <span
      aria-hidden
      style={{
        position: 'relative', display: 'grid', placeItems: 'center',
        width: size, height: size, borderRadius: '50%', flex: 'none',
        background: me ? 'var(--paper)' : color,
        color: me ? 'var(--gold)' : 'var(--on-accent)',
        fontFamily: 'Archivo, sans-serif', fontWeight: 800, fontSize: Math.round(size * 0.42) + 'px', lineHeight: 1,
        boxShadow: me ? '0 0 0 2px var(--card), 0 0 0 4px var(--gold)' : '0 0 0 2px var(--card)',
        filter: away ? 'saturate(.3)' : undefined,
        opacity: away ? 0.55 : 1,
        transition: 'opacity .3s, filter .3s',
      }}
    >
      {initial(name)}
      {here && (
        <span
          className="ch-here-dot"
          style={{
            position: 'absolute', right: -1, bottom: -1,
            width: Math.max(size < 24 ? 7 : 10, Math.round(size * 0.28)), height: Math.max(size < 24 ? 7 : 10, Math.round(size * 0.28)),
            borderRadius: '50%', background: 'var(--positive)', border: `${size < 24 ? 1.5 : 2}px solid var(--card)`,
          }}
        />
      )}
    </span>
  );
}

function Bubble({ text, align }) {
  const shift = align === 'start' ? '-18%' : align === 'end' ? '-82%' : '-50%';
  return (
    <span
      role="status"
      className="ch-bubble"
      style={{
        position: 'absolute', left: '50%', bottom: 'calc(100% + 8px)', zIndex: 5,
        transform: `translateX(${shift})`, pointerEvents: 'none',
        background: 'var(--card)', color: 'var(--paper)', borderRadius: 14, padding: '6px 10px',
        fontFamily: 'Archivo, sans-serif', fontWeight: 700, fontSize: 'var(--fs-label)', lineHeight: 1.2,
        whiteSpace: 'nowrap', boxShadow: '0 0 0 1px var(--rule), 0 10px 24px -8px color-mix(in srgb, var(--paper) 30%, transparent)',
      }}
    >
      {text}
    </span>
  );
}

// members: [{ user_id, username }], meId, hereIds: Set, latest: newest Room message
// ({ id, userId, content, createdAt }) or null, size: table width in px.
// compact: the small table on a phone's Home card, with fewer seats, only the
// count in the middle and no bubble (the card shows the latest line itself).
export default function MembersTable({ members, meId, hereIds, latest, size = 290, showNames = false, compact = false }) {
  const maxSeats = compact ? COMPACT_SEATS : MAX_SEATS;
  const [picked, setPicked] = useState(null);
  const [bubble, setBubble] = useState(null);
  const pickTimer = useRef(null);
  const seen = useRef(null);

  const me = (members ?? []).find(m => m.user_id === meId) ?? null;
  const others = useMemo(() => (members ?? []).filter(m => m.user_id !== meId), [members, meId]);
  const colorOf = useMemo(() => {
    const map = new Map((members ?? []).map((m, i) => [m.user_id, SEAT_COLORS[i % SEAT_COLORS.length]]));
    return id => map.get(id) ?? 'var(--mute)';
  }, [members]);

  // Keep seats where they are as people come and go; only a big clubhouse
  // (more than fits) puts the people here now into the seats first.
  const seats = useMemo(() => {
    if (others.length <= maxSeats) return { shown: others, extra: 0 };
    const sorted = [...others].sort((a, b) => Number(hereIds.has(b.user_id)) - Number(hereIds.has(a.user_id)));
    return { shown: sorted.slice(0, maxSeats - 1), extra: others.length - (maxSeats - 1) };
  }, [others, hereIds, maxSeats]);

  const hereCount = [...hereIds].filter(id => (members ?? []).some(m => m.user_id === id)).length;
  const total = (members ?? []).length;

  // A new Room line shows over its sender for a few seconds. On arrival, the newest
  // line shows once too, if it is recent.
  useEffect(() => {
    if (compact || !latest?.id || seen.current === latest.id) return undefined;
    const first = seen.current === null;
    seen.current = latest.id;
    if (first && Date.now() - new Date(latest.createdAt).getTime() > BUBBLE_RECENT_MS) return undefined;
    const show = setTimeout(() => setBubble({ id: latest.id, userId: latest.userId, text: clip(latest.content, size < 260 ? 22 : 30) }), first ? 700 : 0);
    const hide = setTimeout(() => setBubble(b => (b?.id === latest.id ? null : b)), (first ? 700 : 0) + BUBBLE_FRESH_MS);
    return () => { clearTimeout(show); clearTimeout(hide); };
  }, [latest, size, compact]);

  useEffect(() => () => clearTimeout(pickTimer.current), []);

  function pick(m) {
    setPicked(m);
    clearTimeout(pickTimer.current);
    pickTimer.current = setTimeout(() => setPicked(null), 4000);
  }

  const n = seats.shown.length + (seats.extra ? 1 : 0);
  // Seat size shrinks when the C gets crowded, so faces never touch.
  const ringPx = size * RING_R;
  const step = n > 1 ? ((ARC_TO - ARC_FROM) / (n - 1)) * Math.PI / 180 * ringPx : size;
  const seat = compact
    ? Math.round(Math.max(16, Math.min(size * 0.18, step * 0.78)))
    : Math.round(Math.max(24, Math.min(size * 0.14, step * 0.78)));
  const meSeat = Math.round(seat * 1.12);
  const nameMax = Math.max(40, Math.floor(step - 6));
  // Names go under the seats only when there is room between them; a tap still shows any name.
  const namesFit = showNames && step - seat >= 28;

  function placeAt(i) {
    // A lone other seat sits up and left, so its bubble clears the count in the middle.
    const deg = n === 1 ? 145 : ARC_FROM + ((ARC_TO - ARC_FROM) * i) / (n - 1);
    const th = deg * Math.PI / 180;
    return { x: 50 + RING_R * 100 * Math.cos(th), y: 50 - RING_R * 100 * Math.sin(th) };
  }
  const alignFor = x => (x < 30 ? 'start' : x > 70 ? 'end' : 'middle');

  const seatButton = (m, i) => {
    const { x, y } = placeAt(i);
    const here = hereIds.has(m.user_id);
    return (
      <button
        key={m.user_id}
        type="button"
        onClick={() => pick(m)}
        aria-label={`${m.username ?? 'Member'}${here ? ', here now' : ''}`}
        title={m.username ?? 'Member'}
        className="ch-seat"
        style={{
          position: 'absolute', left: `${x}%`, top: `${y}%`, transform: 'translate(-50%, -50%)',
          zIndex: 1, padding: 0, border: 'none', background: 'transparent', cursor: 'pointer',
          display: 'flex', flexDirection: 'column', alignItems: 'center', animationDelay: `${i * 60 + 200}ms`,
        }}
      >
        <Face name={m.username} color={colorOf(m.user_id)} size={seat} here={here} away={!here} />
        {namesFit && (
          <span style={{
            position: 'absolute', top: 'calc(100% + 5px)', maxWidth: nameMax, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 'var(--fs-micro)', color: picked?.user_id === m.user_id ? 'var(--paper)' : 'var(--text-2)',
          }}>
            {m.username ?? 'Member'}
          </span>
        )}
        {bubble?.userId === m.user_id && <Bubble text={bubble.text} align={alignFor(x)} />}
      </button>
    );
  };

  const pickedHere = picked && (picked.user_id === meId || hereIds.has(picked.user_id));

  return (
    <div style={{ position: 'relative', width: size, height: size, flex: 'none' }}>
      <style>{`
        @keyframes chTableDraw { from { stroke-dashoffset: 100 } to { stroke-dashoffset: 0 } }
        @keyframes chSeatIn { from { opacity: 0; transform: translate(-50%,-50%) scale(.4) } to { opacity: 1; transform: translate(-50%,-50%) scale(1) } }
        @keyframes chHerePulse { 0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--positive) 45%, transparent) } 80%,100% { box-shadow: 0 0 0 8px transparent } }
        @keyframes chBubble { 0% { opacity: 0; margin-bottom: -6px } 12% { opacity: 1; margin-bottom: 0 } 85% { opacity: 1 } 100% { opacity: 0; margin-bottom: 6px } }
        .ch-table-ring { stroke-dasharray: 100; animation: chTableDraw 1.2s cubic-bezier(.6,0,.2,1) both }
        .ch-seat { animation: chSeatIn .5s cubic-bezier(.3,1.5,.5,1) both }
        .ch-seat:focus-visible { outline: 3px solid var(--gold); outline-offset: 3px; border-radius: 50% }
        .ch-here-dot { animation: chHerePulse 2s ease-out infinite }
        .ch-bubble { animation: chBubble ${BUBBLE_FRESH_MS}ms both }
        @media (prefers-reduced-motion: reduce) {
          .ch-table-ring, .ch-seat, .ch-here-dot, .ch-bubble { animation: none }
        }
      `}</style>

      <svg viewBox="0 0 400 400" aria-hidden style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible' }}>
        <circle cx="200" cy="200" r="166" fill="none" stroke="var(--rule)" strokeWidth="1.2" strokeDasharray="1 7" strokeLinecap="round" />
        <path className="ch-table-ring" pathLength="100" d="M285.24 108.6A124 124 0 1 0 285.24 291.4" fill="none" stroke="var(--paper)" strokeWidth="13" strokeLinecap="round" />
      </svg>

      {seats.shown.map(seatButton)}

      {seats.extra > 0 && (() => {
        const { x, y } = placeAt(seats.shown.length);
        return (
          <span
            className="ch-seat num"
            aria-label={`${seats.extra} more members`}
            style={{
              position: 'absolute', left: `${x}%`, top: `${y}%`, transform: 'translate(-50%, -50%)',
              width: seat, height: seat, borderRadius: '50%', display: 'grid', placeItems: 'center',
              background: 'var(--elev)', color: 'var(--text-2)', boxShadow: '0 0 0 2px var(--card)',
              fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 'var(--fs-micro)',
            }}
          >
            +{seats.extra}
          </span>
        );
      })()}

      {me && (
        <button
          type="button"
          onClick={() => pick(me)}
          aria-label="You, here now"
          title="You"
          className="ch-seat"
          style={{
            position: 'absolute', left: '82.5%', top: '50%', transform: 'translate(-50%, -50%)', zIndex: 2,
            padding: 0, border: 'none', background: 'transparent', cursor: 'pointer',
            display: 'flex', flexDirection: 'column', alignItems: 'center', animationDelay: `${n * 60 + 200}ms`,
          }}
        >
          <Face name={me.username} size={meSeat} me here />
          {showNames && (
            <span style={{ position: 'absolute', top: 'calc(100% + 5px)', fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 'var(--fs-micro)', color: 'var(--gold-text)' }}>You</span>
          )}
          {bubble?.userId === me.user_id && <Bubble text={bubble.text} align="end" />}
        </button>
      )}

      <div
        aria-live="polite"
        style={{
          position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: '46%',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, textAlign: 'center',
        }}
      >
        {compact ? (
          picked ? (
            <b style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 'var(--fs-micro)', lineHeight: 1.1, color: 'var(--paper)', overflowWrap: 'anywhere' }}>
              {picked.user_id === meId ? 'You' : (picked.username ?? 'Member')}
            </b>
          ) : (
            <b className="num" aria-label={`${total} ${total === 1 ? 'member' : 'members'}`} style={{ fontFamily: 'Archivo, sans-serif', fontWeight: 900, fontSize: Math.round(size * 0.26) + 'px', lineHeight: 0.9, letterSpacing: '-.03em', color: 'var(--paper)' }}>
              {total}
            </b>
          )
        ) : picked ? (
          <>
            <b style={{ fontFamily: 'Archivo, sans-serif', fontWeight: 900, fontSize: 'var(--fs-heading)', lineHeight: 1.05, color: 'var(--paper)', overflowWrap: 'anywhere' }}>
              {picked.user_id === meId ? 'You' : (picked.username ?? 'Member')}
            </b>
            <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 'var(--fs-micro)', color: pickedHere ? 'var(--positive)' : 'var(--mute)' }}>
              {pickedHere ? 'here now' : 'away'}
            </span>
          </>
        ) : (
          <>
            <b className="num" style={{ fontFamily: 'Archivo, sans-serif', fontWeight: 900, fontSize: Math.round(size * 0.2) + 'px', lineHeight: 0.9, letterSpacing: '-.03em', color: 'var(--paper)' }}>
              {total}
            </b>
            <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 'var(--fs-micro)', letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--mute)' }}>
              {total === 1 ? 'member' : 'members'}
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 4, fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 'var(--fs-micro)', color: 'var(--positive)', whiteSpace: 'nowrap' }}>
              <span aria-hidden className="ch-here-dot" style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--positive)' }} />
              {hereCount} here now
            </span>
          </>
        )}
      </div>
    </div>
  );
}
