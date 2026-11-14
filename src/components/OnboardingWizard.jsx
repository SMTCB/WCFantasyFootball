/**
 * OnboardingWizard — full-screen 3-step overlay shown to first-time users.
 *
 *   1. Welcome   — what the platform is (the name is asked at sign-up, not here)
 *   2. Clubhouse — start one or join with a code
 *   3. First move — start a bet, or pick a sport
 *
 * Skippable on steps 1 and 2. On skip/complete the wizard never shows again
 * (localStorage flag set via useOnboarding hook). Each step fires one event via lib/analytics.
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { PLATFORM_NAME } from '../lib/brand';
import { track } from '../lib/analytics';

function buildSteps() {
  return [
    {
      id:       'welcome',
      kicker:   'Bets between friends',
      heading:  `Welcome to\n${PLATFORM_NAME}`,
      body:     'One room for every game you play with your group: bets, and fantasy leagues for football, F1 and tennis. Your name is already set from sign-up.',
      cta:      "Let's go",
      skip:     'Skip intro',
    },
    {
      id:               'clubhouse',
      kicker:           'Your group',
      heading:          'Start your\nClubhouse',
      body:             "A Clubhouse is where you and your friends play together. Start one and invite them, or join a friend's with their code.",
      cta:              'Start Clubhouse →',
      skip:             'Skip for now',
      isClubhouseStep:  true,
    },
    {
      id:       'first',
      kicker:   "You're in",
      heading:  'Make your\nfirst move',
      body:     'The quickest start is a bet: ask your friends a question and put coins on it. Or go straight to a sport and set up a league.',
      cta:      'Start a bet →',
      ctaRoute: '/challenges?tab=bets',
      altCta:   'Pick a sport instead',
      altRoute: '/home',
      skip:     null,
    },
  ];
}

function clubhouseErrorText(failure, creating) {
  if (failure === 'INVALID_CODE') return 'Code not found. Check it and try again.';
  return creating
    ? 'Could not create your Clubhouse. Try again, or skip for now.'
    : 'Could not join that Clubhouse. Try again, or skip for now.';
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
            background: i === current ? 'var(--gold)' : 'var(--rule)',
            transition: 'all 0.3s ease',
          }}
        />
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function OnboardingWizard({ onComplete, onSkip }) {
  const STEPS = buildSteps();
  const [step,    setStep]    = useState(0);
  const [exiting, setExiting] = useState(false);
  const [visible, setVisible] = useState(false);
  const navigate = useNavigate();
  const hasKeyboard = typeof window !== 'undefined' && !!window.matchMedia?.('(hover: hover) and (pointer: fine)').matches;

  // Clubhouse step state
  const [clubhouseName,  setClubhouseName]  = useState('');
  const [clubhouseCode,  setClubhouseCode]  = useState('');
  const [clubhouseMode,  setClubhouseMode]  = useState('create'); // 'create' | 'join'
  const [clubhouseBusy,  setClubhouseBusy]  = useState(false);
  const [clubhouseError, setClubhouseError] = useState('');

  // Fade in on mount
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 30);
    return () => clearTimeout(t);
  }, []);

  // Keyboard: → / Enter advance, Escape skip
  useEffect(() => {
    function onKey(e) {
      // Typing in a field must not advance the wizard; the field's own Enter handler does that.
      if (e.target instanceof HTMLElement && e.target.closest('input, textarea')) return;
      if (e.key === 'ArrowRight' || e.key === 'Enter') advance(current.ctaRoute);
      if (e.key === 'Escape' && current.skip) handleSkip();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, exiting]);

  const current = STEPS[step];
  const isLast  = step === STEPS.length - 1;

  async function advance(route) {
    // Clubhouse step: create or join if the field is filled, otherwise fall through (skip).
    // The RPCs report failure in `error` or in `data.error` and never throw, so check both.
    if (current.isClubhouseStep) {
      const wantsCreate = clubhouseMode === 'create' && clubhouseName.trim().length >= 2;
      const wantsJoin   = clubhouseMode === 'join'   && clubhouseCode.trim().length >= 4;
      if (wantsCreate || wantsJoin) {
        setClubhouseBusy(true); setClubhouseError('');
        const { data, error } = wantsCreate
          ? await supabase.rpc('create_circle', { p_name: clubhouseName.trim() })
          : await supabase.rpc('join_circle_by_code', { p_code: clubhouseCode.trim().toUpperCase() });
        setClubhouseBusy(false);
        const failure = error?.message || data?.error;
        if (failure && failure !== 'ALREADY_MEMBER') {
          setClubhouseError(clubhouseErrorText(failure, wantsCreate));
          return; // stay on this step until fixed or skipped
        }
        track(wantsCreate ? 'clubhouse_created' : 'clubhouse_joined', { source: 'welcome' });
      }
    }

    track('welcome_step_done', { step: current.id, index: step + 1 });
    if (isLast) {
      handleFinish(route);
    } else {
      setStep(s => s + 1);
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
        zIndex: 'var(--z-toast)',
        background:    'rgba(247, 243, 237, 0.98)',
        display:       'flex',
        flexDirection: 'column',
        alignItems:    'center',
        justifyContent: 'center',
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
          linear-gradient(rgba(184,114,14,0.02) 1px, transparent 1px),
          linear-gradient(90deg, rgba(184,114,14,0.02) 1px, transparent 1px)
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
          background:   'var(--card)',
          border:       '1px solid var(--rule)',
          borderRadius: '16px',
          padding:      '40px 36px 32px',
          boxShadow:    '0 8px 32px rgba(24,32,46,0.12)',
        }}
      >
        {/* Top bar: progress + skip */}
        <div className="flex items-center justify-between mb-8">
          <ProgressDots current={step} total={STEPS.length} />
          {current.skip && (
            <button className="hit-44"
              onClick={handleSkip}
              style={{
                fontSize: 'var(--fs-label)',
                color:         'var(--mute)',
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
            fontSize: 'var(--fs-title)',
            lineHeight:   1,
            marginBottom: '20px',
            color:        'var(--gold-text)',
          }}
        >
          {current.id === 'welcome' ? PLATFORM_NAME.slice(0, 3).toUpperCase() : current.id === 'clubhouse' ? 'CLB' : 'GO'}
        </div>

        {/* Kicker */}
        <div
          style={{
            fontSize: 'var(--fs-label)',
            fontFamily:    'Archivo Black, sans-serif',
            color:         'var(--gold-text)',
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
            fontSize: 'var(--fs-body)',
            lineHeight:   1.65,
            color:        'var(--text-2)',
            marginBottom: '36px',
          }}
        >
          {current.body}
        </p>

        {/* Clubhouse step UI */}
        {current.isClubhouseStep && (
          <div style={{ width: '100%', marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Mode toggle */}
            <div style={{ display: 'flex', gap: 0, border: '1px solid var(--rule)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
              {['create', 'join'].map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => { setClubhouseMode(m); setClubhouseError(''); }}
                  style={{
                    flex: 1, padding: '9px 0', border: 'none', cursor: 'pointer',
                    fontFamily: 'Archivo Black, sans-serif', fontSize: 'var(--fs-label)',
                    background: clubhouseMode === m ? 'var(--accent)' : 'transparent',
                    color: clubhouseMode === m ? 'var(--on-accent)' : 'var(--mute)',
                  }}
                >
                  {m === 'create' ? 'Create' : 'Join'}
                </button>
              ))}
            </div>

            {clubhouseMode === 'create' ? (
              <input
                type="text"
                value={clubhouseName}
                onChange={e => { setClubhouseName(e.target.value); setClubhouseError(''); }}
                onKeyDown={e => { if (e.key === 'Enter') advance(); }}
                placeholder="e.g. The Sunday League"
                maxLength={40}
                autoFocus
                style={{
                  width: '100%', padding: '12px 14px', fontFamily: 'Archivo, sans-serif', fontSize: 'var(--fs-body)',
                  color: 'var(--paper)', background: 'var(--elev)', border: '1px solid var(--rule)',
                  borderRadius: 'var(--radius)', outline: 'none', boxSizing: 'border-box',
                }}
              />
            ) : (
              <input
                type="text"
                value={clubhouseCode}
                onChange={e => { setClubhouseCode(e.target.value.toUpperCase()); setClubhouseError(''); }}
                placeholder="Invite code"
                maxLength={8}
                autoFocus
                style={{
                  width: '100%', padding: '12px 14px', fontFamily: 'Archivo, sans-serif', fontSize: 'var(--fs-heading)',
                  fontWeight: 700,
                  color: 'var(--paper)', background: 'var(--elev)', border: '1px solid var(--rule)',
                  borderRadius: 'var(--radius)', outline: 'none', boxSizing: 'border-box',
                }}
              />
            )}

            {clubhouseError && (
              <p style={{ fontFamily: 'Archivo, sans-serif', fontSize: 'var(--fs-label)', color: 'var(--danger)', margin: 0 }}>
                {clubhouseError}
              </p>
            )}
          </div>
        )}

        {/* CTA */}
        <button
          onClick={() => advance(current.ctaRoute)}
          disabled={clubhouseBusy}
          style={{
            width:         '100%',
            padding:       '14px 24px',
            background:    'var(--gold)',
            color:         'var(--paper)',
            fontSize: 'var(--fs-body)',
            fontFamily:    'Archivo Black, sans-serif',
            fontWeight:    800,
            border:        'none',
            borderRadius:  '8px',
            cursor:        'pointer',
            transition:    'opacity 0.15s, transform 0.15s',
          }}
          onMouseEnter={e => { e.target.style.opacity = '0.88'; e.target.style.transform = 'translateY(-1px)'; }}
          onMouseLeave={e => { e.target.style.opacity = '1';    e.target.style.transform = 'translateY(0)'; }}
        >
          {clubhouseBusy ? 'Please wait…'
            : current.isClubhouseStep
              ? (clubhouseMode === 'create' ? 'Create Clubhouse →' : 'Join Clubhouse →')
              : current.cta}
        </button>

        {current.altCta && (
          <button
            type="button"
            onClick={() => { track('welcome_step_done', { step: current.id, index: step + 1, choice: 'sport' }); handleFinish(current.altRoute); }}
            style={{
              width: '100%', marginTop: 10, minHeight: 'var(--tap)', background: 'transparent',
              color: 'var(--text-2)', border: '1px solid var(--rule)', borderRadius: '8px',
              fontFamily: 'Archivo Black, sans-serif', fontSize: 'var(--fs-body)', cursor: 'pointer',
            }}
          >
            {current.altCta}
          </button>
        )}

        {/* Step counter */}
        <div
          style={{
            textAlign:     'center',
            marginTop:     '20px',
            fontSize: 'var(--fs-label)',
            color:         'var(--mute)',
            fontFamily:    'Archivo Black, sans-serif',
          }}
        >
          {step + 1} / {STEPS.length}
        </div>
      </div>

      {/* Keyboard hint, only where there is a physical keyboard */}
      {hasKeyboard && (
        <div
          style={{
            marginTop:     '20px',
            fontSize: 'var(--fs-label)',
            color:         'var(--mute)',
            fontFamily:    'Archivo Black, sans-serif',
          }}
        >
          Press <kbd style={{ background: 'var(--rule)', padding: '1px 5px', borderRadius: '3px' }}>→</kbd> to advance
        </div>
      )}
    </div>
  );
}
