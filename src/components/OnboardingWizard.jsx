/**
 * OnboardingWizard — full-screen 4-step overlay shown to first-time users.
 *
 * Steps:
 *   1. Welcome       — what ForzaKit is, competition context
 *   2. Build Squad   — budget, squad size, pick on Market
 *   3. Join League   — H2H mini-leagues with friends
 *   4. Ready         — confetti moment, what to do first
 *
 * Accepts an optional `config` prop:
 *   { competitionName, budgetTotal, squadSize, teamCount }
 * Falls back to generic defaults when not provided.
 *
 * Skippable at any step. On skip/complete the wizard never shows again
 * (localStorage flag set via useOnboarding hook).
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

function buildSteps({ competitionName, budgetTotal, squadSize }) {
  const comp   = competitionName || 'Fantasy Football';
  const budget = budgetTotal     || 100;
  const size   = squadSize       || 15;

  return [
    {
      id:       'welcome',
      emoji:    '🏆',
      kicker:   comp,
      heading:  'Welcome to\nForzaKit',
      body:     `The fantasy football league built for ${comp}. Pick your squad, beat your friends, own every matchday.`,
      cta:      "Let's go",
      skip:     'Skip intro',
    },
    {
      id:       'squad',
      emoji:    '⚽',
      kicker:   'Step 1 of 3',
      heading:  'Build your\nDream Squad',
      body:     `You have a $${budget}M budget to pick ${size} players — 1 GK, 4 DEF, 4 MID, 2 FWD in your starting XI, plus bench cover. Every transfer costs budget, so choose wisely.`,
      cta:      'Go to Market →',
      skip:     'Skip for now',
      ctaRoute: '/market',
    },
    {
      id:       'league',
      emoji:    '🥇',
      kicker:   'Step 2 of 3',
      heading:  'Join a\nPrivate League',
      body:     "Create a league or enter a friend's invite code to go head-to-head every matchday. Your points are live — every goal, assist, and clean sheet counts in real time.",
      cta:      'Set up my league →',
      skip:     'Skip for now',
      ctaRoute: '/league',
    },
    {
      id:       'ready',
      emoji:    '🚀',
      kicker:   "You're all set",
      heading:  'First stop:\nthe Market',
      body:     `Pick your ${size} players before the transfer window closes. The deadline countdown is live in your squad header — don't miss it.`,
      cta:      'Open Market',
      skip:     null,
      ctaRoute: '/market',
    },
  ];
}

// ── Confetti particle (pure CSS) ─────────────────────────────────────────────
function Confetti() {
  const pieces = Array.from({ length: 28 }, (_, i) => i);
  const colors = ['var(--gold)', 'var(--positive)', 'var(--danger)', '#3B9EFF', 'var(--paper)'];
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {pieces.map(i => (
        <div
          key={i}
          style={{
            position:        'absolute',
            top:             '-10px',
            left:            `${(i / pieces.length) * 100}%`,
            width:           `${6 + (i % 4) * 3}px`,
            height:          `${6 + (i % 3) * 3}px`,
            borderRadius:    i % 3 === 0 ? '50%' : '2px',
            background:      colors[i % colors.length],
            opacity:         0.85,
            animation:       `confetti-fall ${1.8 + (i % 6) * 0.3}s ease-in ${(i % 8) * 0.12}s forwards`,
            transform:       `rotate(${i * 37}deg)`,
          }}
        />
      ))}
      <style>{`
        @keyframes confetti-fall {
          0%   { transform: translateY(0)   rotate(0deg);    opacity: 0.9; }
          100% { transform: translateY(110vh) rotate(720deg); opacity: 0;   }
        }
      `}</style>
    </div>
  );
}

// ── Progress dots ────────────────────────────────────────────────────────────
function ProgressDots({ current, total }) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          style={{
            width:      i === current ? '20px' : '6px',
            height:     '6px',
            borderRadius: '3px',
            background: i === current ? 'var(--gold)' : 'rgba(255,255,255,0.2)',
            transition: 'all 0.3s ease',
          }}
        />
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function OnboardingWizard({ onComplete, onSkip, config = {} }) {
  const STEPS = buildSteps(config);
  const [step,    setStep]    = useState(0);
  const [exiting, setExiting] = useState(false);
  const [visible, setVisible] = useState(false);
  const navigate = useNavigate();

  // Fade in on mount
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 30);
    return () => clearTimeout(t);
  }, []);

  // Keyboard: → / Enter advance, Escape skip
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'ArrowRight' || e.key === 'Enter') advance(current.ctaRoute);
      if (e.key === 'Escape' && current.skip) handleSkip();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, exiting]);

  const current = STEPS[step];
  const isLast  = step === STEPS.length - 1;

  function advance(route) {
    if (isLast) {
      handleFinish(route);
    } else {
      setStep(s => s + 1);
      // Don't navigate mid-wizard — let user navigate after completing
    }
  }

  function handleFinish(route) {
    setExiting(true);
    setTimeout(() => {
      onComplete(step);
      if (route) navigate(route);
    }, 350);
  }

  function handleSkip() {
    setExiting(true);
    setTimeout(() => onSkip(step), 350);
  }

  return (
    <div
      style={{
        position:      'fixed',
        inset:         0,
        zIndex:        9999,
        background:    'rgba(7, 10, 15, 0.97)',
        display:       'flex',
        flexDirection: 'column',
        alignItems:    'center',
        justifyContent: 'flex-start',
        overflowY:     'auto',
        padding:       '24px',
        paddingTop:    'max(24px, env(safe-area-inset-top))',
        paddingBottom: 'max(24px, env(safe-area-inset-bottom))',
        opacity:       visible && !exiting ? 1 : 0,
        transition:    'opacity 0.35s ease',
        pointerEvents: visible && !exiting ? 'auto' : 'none',
      }}
    >
      {/* Ambient grid */}
      <div style={{
        position:   'absolute',
        inset:      0,
        backgroundImage: `
          linear-gradient(rgba(240,180,0,0.03) 1px, transparent 1px),
          linear-gradient(90deg, rgba(240,180,0,0.03) 1px, transparent 1px)
        `,
        backgroundSize: '48px 48px',
        pointerEvents: 'none',
      }} />

      {/* Confetti on last step */}
      {isLast && <Confetti />}

      {/* Card */}
      <div
        style={{
          position:     'relative',
          width:        '100%',
          maxWidth:     '440px',
          flexShrink:   0,
          background:   'var(--ink-2)',
          border:       '1px solid rgba(255,255,255,0.08)',
          borderRadius: '16px',
          padding:      '40px 36px 32px',
          boxShadow:    '0 32px 80px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.06)',
        }}
      >
        {/* Top bar: progress + skip */}
        <div className="flex items-center justify-between mb-8">
          <ProgressDots current={step} total={STEPS.length} />
          {current.skip && (
            <button
              onClick={handleSkip}
              style={{
                fontSize:      '11px',
                color:         'rgba(255,255,255,0.35)',
                letterSpacing: '0.05em',
                fontFamily:    'Archivo Black, sans-serif',
                background:    'none',
                border:        'none',
                cursor:        'pointer',
                padding:       '4px 0',
              }}
            >
              {current.skip}
            </button>
          )}
        </div>

        {/* Step icon */}
        <div
          className="fk-display"
          style={{
            fontSize:     '36px',
            lineHeight:   1,
            marginBottom: '20px',
            color:        'var(--gold)',
          }}
        >
          {current.id === 'welcome' ? 'FFL' : current.id === 'squad' ? 'SQD' : current.id === 'league' ? 'LGE' : 'GO'}
        </div>

        {/* Kicker */}
        <div
          style={{
            fontSize:      '10px',
            fontFamily:    'Archivo Black, sans-serif',
            letterSpacing: '0.15em',
            color:         'var(--gold)',
            textTransform: 'uppercase',
            marginBottom:  '8px',
          }}
        >
          {current.kicker}
        </div>

        {/* Heading */}
        <h1
          style={{
            fontSize:     'clamp(32px, 8vw, 44px)',
            fontFamily:   'Archivo Black, sans-serif',
            fontWeight:   900,
            lineHeight:   1.05,
            color:        'var(--paper)',
            textTransform: 'uppercase',
            letterSpacing: '-0.01em',
            marginBottom: '20px',
            whiteSpace:   'pre-line',
          }}
        >
          {current.heading}
        </h1>

        {/* Body */}
        <p
          style={{
            fontSize:     '14px',
            lineHeight:   1.65,
            color:        'rgba(240,242,245,0.6)',
            marginBottom: '36px',
          }}
        >
          {current.body}
        </p>

        {/* CTA */}
        <button
          onClick={() => advance(current.ctaRoute)}
          style={{
            width:         '100%',
            padding:       '14px 24px',
            background:    'var(--gold)',
            color:         'var(--ink-2)',
            fontSize:      '13px',
            fontFamily:    'Archivo Black, sans-serif',
            fontWeight:    800,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            border:        'none',
            borderRadius:  '8px',
            cursor:        'pointer',
            transition:    'opacity 0.15s, transform 0.15s',
          }}
          onMouseEnter={e => { e.target.style.opacity = '0.88'; e.target.style.transform = 'translateY(-1px)'; }}
          onMouseLeave={e => { e.target.style.opacity = '1';    e.target.style.transform = 'translateY(0)'; }}
        >
          {current.cta}
        </button>

        {/* Step counter */}
        <div
          style={{
            textAlign:     'center',
            marginTop:     '20px',
            fontSize:      '10px',
            color:         'rgba(255,255,255,0.2)',
            fontFamily:    'Archivo Black, sans-serif',
            letterSpacing: '0.1em',
          }}
        >
          {step + 1} / {STEPS.length}
        </div>
      </div>

      {/* Keyboard hint */}
      <div
        style={{
          marginTop:     '20px',
          fontSize:      '11px',
          color:         'rgba(255,255,255,0.18)',
          fontFamily:    'Archivo Black, sans-serif',
          letterSpacing: '0.08em',
        }}
      >
        Press <kbd style={{ background: 'rgba(255,255,255,0.08)', padding: '1px 5px', borderRadius: '3px' }}>→</kbd> to advance
      </div>
    </div>
  );
}
