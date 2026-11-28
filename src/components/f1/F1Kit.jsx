// Shared building blocks for the F1 league screens (direction B, "Race Weekend").
// Styles live in index.css under the .f1-* prefix.
//
// Rolldown TDZ rule: F1HomeScreen imports this file AND F1RacePickForm, so
// F1RacePickForm must never import this file (same module at two depths).
import { formatCountdown, formatWhen, initials, lightsLit } from '../../lib/f1/f1-data';

const CIRCUIT = 'M10 25 L10 15 Q10 10 15 10 L29 10 Q33 10 34.5 13.5 L36.5 18 Q38 21 41 21 Q45 21 45 25 Q45 29 41 29 L14 29 Q10 29 10 25 Z';

// Static circuit outline, the F1 mark everywhere in the league screens.
export function CircuitMark({ width = 44, height = 32 }) {
  return (
    <svg width={width} height={height} viewBox="0 0 55 40" aria-hidden="true" style={{ flex: 'none' }}>
      <rect x=".5" y=".5" width="54" height="39" rx="10" fill="var(--card)" stroke="var(--rule)" />
      <path d={CIRCUIT} fill="none" stroke="var(--f1)" strokeWidth="2.2" strokeLinejoin="round" />
      <path d="M22 26.4v5.2" stroke="var(--paper)" strokeWidth="1.6" />
    </svg>
  );
}

// Large faint circuit for the corner of the navy hero card.
export function CircuitWatermark() {
  return (
    <svg aria-hidden="true" width="220" height="160" viewBox="0 0 55 40"
      style={{ position: 'absolute', right: -36, top: -24, opacity: 0.12, pointerEvents: 'none' }}>
      <path d={CIRCUIT} fill="none" stroke="var(--on-accent)" strokeWidth="2" />
    </svg>
  );
}

export function BackIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>;
}
export function GearIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" /></svg>;
}
export function ChevronDown() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>;
}

// Five start lights counting down to the picks lock. All go out once picks lock.
export function StartLights({ lockAt, now }) {
  const ms = lockAt ? new Date(lockAt).getTime() - now : null;
  const locked = ms != null && ms <= 0;
  const lit = lightsLit(ms);
  const text = formatCountdown(ms);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, position: 'relative' }}>
      <span className="f1-eb">{locked ? 'Lights out' : 'Lights out on your picks in'}</span>
      <span className="f1-mono" style={{ fontSize: 'var(--fs-title)', fontWeight: 600, letterSpacing: '-.02em', color: 'var(--on-accent)', lineHeight: 1.1 }}>
        {locked ? 'PICKS LOCKED' : (text ?? '—')}
      </span>
      <div className="f1-lights" role="img" aria-label={locked ? 'Picks are locked' : `${lit} of 5 lights lit, picks lock in ${text}`}>
        {[0, 1, 2, 3, 4].map(i => <span key={i} className={`f1-lt${i < lit ? ' on' : ''}`} />)}
        {lockAt && (
          <span className="f1-mono" style={{ fontSize: 'var(--fs-micro)', color: 'var(--f1-navy-mute)', marginLeft: 6 }}>
            {locked ? 'Closed' : 'Locks'} {formatWhen(lockAt)}
          </span>
        )}
      </div>
    </div>
  );
}

function gapText(gap) {
  if (gap == null) return '';
  if (gap === 0) return '—';
  return gap > 0 ? `+${gap}` : `−${Math.abs(gap)}`;
}

// One member line: position, initials, name, points, gap. Gold for the viewer.
export function MemberRow({ rank, name, value, gap, gapLabel, me, lead, first, extra }) {
  return (
    <div className={`f1-row${me ? ' me' : ''}${first ? ' first' : ''}`}>
      <span className="p">{rank ?? '—'}</span>
      <span className={`f1-av${lead && !me ? ' lead' : ''}`} aria-hidden="true">{initials(name)}</span>
      <span className="n">{me ? 'You' : name}{extra}</span>
      <span className="v">{value}</span>
      <span className="g">{gapLabel ?? gapText(gap)}</span>
    </div>
  );
}

// Page header: back, circuit mark, eyebrow and title, then any buttons on the right.
export function F1Header({ eyebrow, title, onBack, backLabel = 'Back to leagues', right, onTitleClick, titleLabel }) {
  return (
    <div className="f1-top">
      {onBack && (
        <button type="button" className="f1-ib" aria-label={backLabel} onClick={onBack}><BackIcon /></button>
      )}
      <CircuitMark />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <span className="f1-eb" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{eyebrow}</span>
        {onTitleClick ? (
          <button type="button" className="f1-switch f1-h" onClick={onTitleClick} aria-label={titleLabel}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
            <ChevronDown />
          </button>
        ) : (
          <h1 className="f1-h f1-switch" style={{ cursor: 'default' }}>{title}</h1>
        )}
      </div>
      {right}
    </div>
  );
}
