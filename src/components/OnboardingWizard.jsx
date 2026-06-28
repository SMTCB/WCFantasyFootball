/**
 * OnboardingWizard — full-screen 4-step overlay shown to first-time users.
 *
 * Steps:
 *   1. Welcome       — what Forza Fantasy League is, competition context
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
import { supabase } from '../lib/supabase';

function buildSteps({ competitionName, budgetTotal, squadSize }) {
  const comp   = competitionName || 'Fantasy League';
  const budget = budgetTotal     || 100;
  const size   = squadSize       || 15;

  return [
    {
      id:       'username',
      emoji:    '👤',
      kicker:   'First things first',
      heading:  'Choose your\nManager Name',
      body:     'This is how other managers will see you in leaderboards, chat, and bets. Pick something you like — you can change it any time in Settings.',
      cta:      'Continue →',
      skip:     'Skip for now',
      isUsernameStep: true,
    },
    {
      id:       'welcome',
      emoji:    '🏆',
      kicker:   comp,
      heading:  'Welcome to\nForza Fantasy League',
      body:     `The fantasy football league built for ${comp}. Pick your squad, beat your friends, own every matchday.`,
      cta:      "Let's go",
      skip:     'Skip intro',
    },
    {
      id:       'squad',
      emoji:    '⚽',
      kicker:   'Step 1 of 4',
      heading:  'Build your\nDream Squad',
      body:     `You have a $${budget}M budget to pick ${size} players — 1 GK, 3–5 DEF, 2–4 MID, 1–2 FWD in your starting XI, plus bench cover. Every transfer costs budget, so choose wisely.`,
      cta:      'Next →',
      skip:     'Skip for now',
      ctaRoute: '/market',
    },
    {
      id:       'league',
      emoji:    '🥇',
      kicker:   'Step 2 of 4',
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
            background: i === current ? 'var(--gold)' : 'var(--rule)',
            transition: 'all 0.3s ease',
          }}
        />
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function OnboardingWizard({ onComplete, onSkip, config = {}, user = null }) {
  const STEPS = buildSteps(config);
  const [step,    setStep]    = useState(0);
  const [exiting, setExiting] = useState(false);
  const [visible, setVisible] = useState(false);
  const navigate = useNavigate();

  // Username step state
  const [usernameInput,    setUsernameInput]    = useState('');
  const [usernameError,    setUsernameError]    = useState('');
  const [usernameSaving,   setUsernameSaving]   = useState(false);

  // Pre-fill with current username when the wizard mounts (if user is known)
  useEffect(() => {
    if (!user?.id) return;
    supabase
      .from('users')
      .select('username')
      .eq('id', user.id)
      .single()
      .then(({ data }) => { if (data?.username) setUsernameInput(data.username); });
  }, [user?.id]);

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

  async function advance(route) {
    // Save username when leaving the username step
    if (current.isUsernameStep && user?.id) {
      const trimmed = usernameInput.trim();
      if (trimmed && trimmed.length >= 3) {
        setUsernameSaving(true);
        setUsernameError('');
        const { error } = await supabase
          .from('users')
          .update({ username: trimmed })
          .eq('id', user.id);
        setUsernameSaving(false);
        if (error) {
          setUsernameError(error.message || 'Could not save username');
          return; // stay on this step until fixed
        }
      }
    }
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
        zIndex:        9999,
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
            <button
              onClick={handleSkip}
              style={{
                fontSize:      '11px',
                color:         'var(--mute)',
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
            color:        'var(--text-2)',
            marginBottom: '36px',
          }}
        >
          {current.body}
        </p>

        {/* Username input — only on the username step */}
        {current.isUsernameStep && (
          <div style={{ width: '100%', maxWidth: 400, marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input
              type="text"
              value={usernameInput}
              onChange={e => { setUsernameInput(e.target.value); setUsernameError(''); }}
              onKeyDown={e => { if (e.key === 'Enter') advance(current.ctaRoute); }}
              placeholder="e.g. FantasyKing, PilotMgr…"
              maxLength={30}
              autoFocus
              style={{
                width: '100%',
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 16,
                color: 'var(--paper)',
                textAlign: 'center',
                padding: '12px 16px',
                background: 'rgba(24,32,46,0.04)',
                border: `1px solid ${usernameError ? 'var(--danger)' : usernameInput.trim().length >= 3 ? 'var(--gold)' : 'var(--rule)'}`,
                borderRadius: 8,
                outline: 'none',
                boxSizing: 'border-box',
                letterSpacing: '0.04em',
              }}
            />
            {usernameError && (
              <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: 'var(--danger)', textAlign: 'center', letterSpacing: '.08em' }}>
                {usernameError}
              </p>
            )}
            <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: 'var(--mute)', textAlign: 'center', letterSpacing: '.08em' }}>
              3–30 characters · can be changed later in Settings
            </p>
          </div>
        )}

        {/* CTA */}
        <button
          onClick={() => advance(current.ctaRoute)}
          disabled={usernameSaving}
          style={{
            width:         '100%',
            padding:       '14px 24px',
            background:    'var(--gold)',
            color:         'var(--paper)',
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
          {usernameSaving ? 'Saving…' : current.cta}
        </button>

        {/* Step counter */}
        <div
          style={{
            textAlign:     'center',
            marginTop:     '20px',
            fontSize:      '10px',
            color:         'var(--mute)',
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
          color:         'var(--mute)',
          fontFamily:    'Archivo Black, sans-serif',
          letterSpacing: '0.08em',
        }}
      >
        Press <kbd style={{ background: 'var(--rule)', padding: '1px 5px', borderRadius: '3px' }}>→</kbd> to advance
      </div>
    </div>
  );
}
