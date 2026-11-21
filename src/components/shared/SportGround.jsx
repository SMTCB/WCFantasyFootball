import { useEffect, useRef } from 'react';

// A small picture of the ground each sport is played on, with one thing moving
// on it (design board): the ball passing on the pitch, two cars lapping the
// track, the ball crossing the net. It stops while off screen, and stays still
// for people who ask their phone for less motion.
const TRACK = 'M8 28 C8 12 20 8 28 14 S44 10 44 20 S30 32 8 28Z';
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
          <>
            <rect width="52" height="38" fill="var(--paper)" />
            <path d={TRACK} fill="none" stroke="var(--f1)" strokeWidth="2" strokeLinejoin="round" />
            <path d="M8 24 v8" stroke="var(--card)" strokeWidth="2" />
            <rect x="-2.2" y="-1.1" width="4.4" height="2.2" rx=".9" fill="var(--card)">
              <animateMotion dur="6s" begin="-0.7s" repeatCount="indefinite" rotate="auto" path={TRACK} />
            </rect>
            <rect x="-2.2" y="-1.1" width="4.4" height="2.2" rx=".9" fill="var(--gold)" stroke="var(--paper)" strokeWidth=".4">
              <animateMotion dur="6s" repeatCount="indefinite" rotate="auto" path={TRACK} />
            </rect>
          </>
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
const WIDE_TRACK = 'M60 96 C28 96 30 40 70 36 C120 30 140 70 190 64 C240 58 252 22 300 28 C342 33 338 86 300 92 C250 102 150 100 60 96 Z';
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
        <rect width="360" height="130" style={shade('--f1', 92)} />
        <path d={WIDE_TRACK} fill="none" style={{ stroke: 'color-mix(in srgb, var(--f1) 58%, #000)' }} strokeWidth="17" strokeLinejoin="round" />
        <path d={WIDE_TRACK} fill="none" stroke="var(--card)" strokeOpacity=".55" strokeWidth="1.2" strokeDasharray="5 7" />
        <g transform="translate(150 92)" fill="var(--card)">
          <rect width="4" height="4" /><rect x="4" y="4" width="4" height="4" /><rect y="8" width="4" height="4" /><rect x="4" y="12" width="4" height="4" />
        </g>
        <rect x="-7" y="-3.5" width="14" height="7" rx="2.5" fill="var(--card)">
          <animateMotion dur="6s" begin="-0.7s" repeatCount="indefinite" rotate="auto" path={WIDE_TRACK} />
        </rect>
        <rect x="-7" y="-3.5" width="14" height="7" rx="2.5" fill={BRIGHT_GOLD} stroke="var(--paper)" strokeWidth="1">
          <animateMotion dur="6s" repeatCount="indefinite" rotate="auto" path={WIDE_TRACK} />
        </rect>
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
