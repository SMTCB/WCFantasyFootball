import { useEffect, useRef } from 'react';

// A small picture of the ground each sport is played on (design board). The
// pitch and the court have a ball moving on them; it stops while off screen,
// and stays still for people who ask their phone for less motion. F1 is a
// still circuit line on a white tile: the lapping cars read as clutter
// (F1 redesign, direction B).
const CIRCUIT = 'M10 25 L10 15 Q10 10 15 10 L29 10 Q33 10 34.5 13.5 L36.5 18 Q38 21 41 21 Q45 21 45 25 Q45 29 41 29 L14 29 Q10 29 10 25 Z';
const BALL_PASS = 'M14 19 L26 12 L20 27 L34 25 L26 12 L40 19 L14 19';
const BALL_RALLY = 'M14 25 Q26 1 39 13 Q26 5 14 25';

function useSmilPause(ref) {
  useEffect(() => {
    const svg = ref.current;
    if (!svg?.pauseAnimations) return undefined;
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (still) {
      svg.pauseAnimations();
      svg.setCurrentTime(1.2);
      return undefined;
    }
    if (!('IntersectionObserver' in window)) return undefined;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) svg.unpauseAnimations();
      else svg.pauseAnimations();
    });
    io.observe(svg);
    return () => io.disconnect();
  }, [ref]);
}

export function SportSwatch({ sport }) {
  const ref = useRef(null);
  useSmilPause(ref);
  const line = 'color-mix(in srgb, var(--card) 70%, transparent)';
  const dot = 'color-mix(in srgb, var(--card) 85%, transparent)';
  return (
    <span aria-hidden style={{ width: 52, height: 38, borderRadius: 8, overflow: 'hidden', flex: 'none', display: 'block' }}>
      <svg ref={ref} viewBox="0 0 52 38" width="52" height="38" style={{ display: 'block' }}>
        {sport === 'f1' ? (
          <svg viewBox="0 0 55 40" width="52" height="38" x="0" y="0">
            <rect x=".5" y=".5" width="54" height="39" rx="8" fill="var(--card)" stroke="var(--rule)" />
            <path d={CIRCUIT} fill="none" stroke="var(--f1)" strokeWidth="2.2" strokeLinejoin="round" />
            <path d="M22 26.4v5.2" stroke="var(--paper)" strokeWidth="1.6" />
          </svg>
        ) : sport === 'tennis' ? (
          <>
            <rect width="52" height="38" fill="var(--ten)" />
            <rect x="7" y="6" width="38" height="26" fill="none" stroke={line} strokeWidth="1.5" />
            <path d="M7 19h38M14 6v26M38 6v26" stroke={line} strokeWidth="1" />
            <path d="M26 4v30" stroke="var(--card)" strokeWidth="1.6" />
            <circle cx="12" cy="26" r="1.8" fill={dot} />
            <circle cx="40" cy="12" r="1.8" fill="var(--gold)" />
            <circle r="1.3" fill="var(--gold)" stroke="var(--paper)" strokeWidth=".35">
              <animateMotion dur="2.6s" repeatCount="indefinite" path={BALL_RALLY} />
            </circle>
          </>
        ) : (
          <>
            <rect width="52" height="38" fill="var(--accent)" />
            <rect x="4" y="4" width="44" height="30" fill="none" stroke={line} strokeWidth="1.5" />
            <path d="M26 4v30" stroke={line} strokeWidth="1.2" />
            <circle cx="26" cy="19" r="6" fill="none" stroke={line} strokeWidth="1.2" />
            <rect x="4" y="12" width="6" height="14" fill="none" stroke={line} strokeWidth="1.2" />
            <rect x="42" y="12" width="6" height="14" fill="none" stroke={line} strokeWidth="1.2" />
            {[[14, 19], [26, 12], [20, 27], [34, 25], [40, 19]].map(([x, y]) => (
              <circle key={`${x}-${y}`} cx={x} cy={y} r="1.6" fill={dot} />
            ))}
            <circle r="1.3" fill="var(--card)" stroke="var(--paper)" strokeWidth=".4">
              <animateMotion dur="5.5s" repeatCount="indefinite" path={BALL_PASS} />
            </circle>
          </>
        )}
      </svg>
    </span>
  );
}

// The same grounds, wide, across the top of a league card inside a clubhouse
// (design board). The sport's name sits in the corner as a small label.
const WIDE_PASS = 'M146 65 L222 48 L146 90 L222 84 L222 48 L338 62 L146 65';
const WIDE_RALLY = 'M76 78 Q180 -14 286 48 Q180 -4 76 78';
const BRIGHT_GOLD = 'var(--on-pitch-gold)';
const TENNIS_BALL = 'color-mix(in srgb, var(--on-pitch-gold) 45%, var(--on-pitch))';
const SPORT_LABEL = { football: 'Football', f1: 'F1', tennis: 'Tennis' };
const shade = (token, pct) => ({ fill: `color-mix(in srgb, var(${token}) ${pct}%, #000)` });

function WideGround({ sport }) {
  if (sport === 'f1') {
    return (
      <>
        <rect width="360" height="130" fill="var(--navy)" />
        <path d={CIRCUIT} transform="translate(-10 -30) scale(7 5)" fill="none" stroke="var(--on-pitch)" strokeOpacity=".08" strokeWidth="16" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        <path d={CIRCUIT} transform="translate(-10 -30) scale(7 5)" fill="none" stroke="var(--f1)" strokeWidth="3" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        <g transform="translate(130 108)" fill="var(--on-pitch)">
          <rect width="5" height="5" /><rect x="5" y="5" width="5" height="5" /><rect x="10" width="5" height="5" />
        </g>
      </>
    );
  }
  if (sport === 'tennis') {
    return (
      <>
        <rect width="360" height="130" style={shade('--ten', 86)} />
        <rect x="40" y="16" width="280" height="98" fill="var(--ten)" />
        <g fill="none" stroke="var(--card)" strokeOpacity=".7" strokeWidth="1.5">
          <rect x="40" y="16" width="280" height="98" />
          <path d="M40 28h280M40 102h280M110 28v74M250 28v74M110 65h140" />
        </g>
        <path d="M180 10v110" stroke="var(--card)" strokeWidth="3" />
        <circle cx="72" cy="82" r="6" fill="var(--bg)" />
        <circle cx="290" cy="46" r="6" fill={BRIGHT_GOLD} />
        <circle r="3.6" fill={TENNIS_BALL} stroke="var(--paper)" strokeWidth=".8">
          <animateMotion dur="2.6s" repeatCount="indefinite" path={WIDE_RALLY} />
        </circle>
      </>
    );
  }
  return (
    <>
      <rect width="360" height="130" style={shade('--accent', 78)} />
      {[0, 80, 160, 240, 320].map(x => <rect key={x} x={x} width="40" height="130" fill="var(--accent)" />)}
      <g fill="none" stroke="var(--card)" strokeOpacity=".5" strokeWidth="1.5">
        <rect x="14" y="12" width="332" height="106" rx="2" />
        <path d="M180 12v106M14 38h34v54H14M346 38h-34v54h34" />
        <circle cx="180" cy="65" r="17" />
      </g>
      <g fill="var(--card)" opacity=".3">
        {[[300, 40], [300, 90], [262, 65], [250, 30], [250, 100]].map(([x, y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r="5" />)}
      </g>
      <g fill="var(--bg)">
        {[[34, 65], [82, 32], [82, 56], [82, 76], [82, 100], [146, 40], [146, 65], [146, 90], [222, 48], [222, 84]].map(([x, y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r="5" />)}
      </g>
      <circle cx="222" cy="48" r="9" fill="none" stroke={BRIGHT_GOLD} strokeWidth="2" />
      <circle r="3.6" fill="var(--card)" stroke="var(--paper)" strokeWidth="1">
        <animateMotion dur="5.5s" repeatCount="indefinite" path={WIDE_PASS} />
      </circle>
    </>
  );
}

export function SportBanner({ sport, height = 92 }) {
  const ref = useRef(null);
  useSmilPause(ref);
  return (
    <div style={{ position: 'relative', height, overflow: 'hidden', flexShrink: 0 }}>
      <svg ref={ref} viewBox="0 0 360 130" preserveAspectRatio="xMidYMid slice" aria-hidden="true" style={{ width: '100%', height: '100%', display: 'block' }}>
        <WideGround sport={sport} />
      </svg>
      <span style={{
        position: 'absolute', left: 12, top: 10,
        fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-micro)', fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase',
        color: 'var(--on-pitch)', background: 'color-mix(in srgb, var(--paper) 35%, transparent)', padding: '3px 7px', borderRadius: 5,
      }}>
        {SPORT_LABEL[sport] ?? SPORT_LABEL.football}
      </span>
    </div>
  );
}
