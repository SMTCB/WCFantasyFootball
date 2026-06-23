import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
// HubShared is NOT imported here — LeagueScreen imports it directly, and
// CommissionerPanel→HubShared at depth 2 causes a Rolldown TDZ crash in
// the production bundle. All four exports are inlined below instead.
// BetCreatorPanel is safe: LeagueScreen does NOT import it directly.

// ─────────────────────────────────────────────────────────────────────────────
// Design tokens (mirrors docs/brand/ADMIN TAB/tokens.css)
// ─────────────────────────────────────────────────────────────────────────────
const MONO    = "'JetBrains Mono', monospace";
const DISPLAY = "'Archivo Black', sans-serif";
const BODY    = "'Archivo', sans-serif";

// Group → knockout transition is a normal transfer window (unlimited transfers,
// surviving-nation pool, standard formation rules). No second draft is needed.
// Set to true to re-enable the knockout draft UI if product direction changes.
const KNOCKOUT_DRAFT_ENABLED = false;

// ── Inlined from HubShared (TDZ-safe copies) ─────────────────────────────────
function HubSectionLabel({ label, sub, tone = 'var(--cyan)', right, helpBtn }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 20px', borderBottom: '1px solid var(--rule)', background: 'var(--ink-2)', flexShrink: 0 }}>
      <span style={{ width: 3, height: 14, background: tone, flexShrink: 0 }} />
      <span style={{ fontFamily: MONO, fontSize: 11, color: 'var(--paper)', letterSpacing: '.22em' }}>{label}</span>
      {helpBtn}
      {sub && <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)', letterSpacing: '.18em' }}>· {sub}</span>}
      <span style={{ flex: 1 }} />
      {right}
    </div>
  );
}
function MgrTag({ mono = '???', hue = '#8B95A1', size = 18, dim = false }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: size + 10, height: size, padding: '0 4px', background: dim ? 'transparent' : `${hue}18`, border: `1px solid ${hue}${dim ? '44' : '66'}`, color: hue, fontFamily: MONO, fontSize: size <= 16 ? 9 : 10, letterSpacing: '.12em', fontWeight: 600, lineHeight: 1, flexShrink: 0 }}>{mono}</span>
  );
}

const inputStyle = {
  background: 'var(--ink)', border: '1px solid var(--rule)', color: 'var(--paper)',
  padding: '10px 12px', fontFamily: MONO, fontSize: 12, letterSpacing: '.06em',
  outline: 'none', width: '100%', boxSizing: 'border-box',
};
const btnBase = {
  padding: '11px 16px', border: 0, cursor: 'pointer',
  fontFamily: DISPLAY, fontSize: 11, letterSpacing: '.18em', fontWeight: 400,
};
const ghostBtn = {
  ...btnBase, background: 'transparent', border: '1px solid var(--rule)', color: 'var(--mute)',
  fontFamily: MONO, fontWeight: 600,
};

const helpBtnStyle = {
  background: 'rgba(255,255,255,0.10)',
  border: '1px solid rgba(255,255,255,0.30)',
  color: 'var(--paper)',
  cursor: 'pointer',
  width: 18,
  height: 18,
  borderRadius: '50%',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontFamily: MONO,
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: 0,
  flexShrink: 0,
  padding: 0,
  lineHeight: 1,
};

// ── Help overlay — renders on top of the admin panel with section-specific help ──
function HelpOverlay({ topic, onClose }) {
  if (!topic) return null;

  const CONTENT = {
    commissioner: {
      title: 'COMMISSIONER CONTROLS — HOW IT WORKS',
      sections: [
        {
          heading: 'What is this?',
          body: 'The season progress bar shows which stage your league is currently in. It reflects real database state — you do not click it to advance stages. Stages advance automatically as you complete the corresponding lifecycle operations below.',
        },
        {
          heading: 'Season stages',
          rows: [
            ['TRANSFER WINDOW', 'Active from league creation. Open/close via Lifecycle Operations.'],
            ['DRAFT DEADLINE',  'Advances when you set a draft deadline. Draft mode only — hidden for Classic leagues.'],
            ['ALLOCATION',      'Advances once the deadline passes and you run the allocation engine.'],
            ['IN SEASON',       'Active once allocation is complete and the season is underway.'],
          ],
        },
        {
          heading: 'Stage colours',
          body: '✓ Green = done.  ● Cyan = current stage (YOU ARE HERE).  Grey = not yet reached.',
        },
      ],
    },
    lifecycle: {
      title: 'LIFECYCLE OPERATIONS — HOW IT WORKS',
      sections: [
        {
          heading: 'Classic vs Draft Mode',
          body: 'Classic: all managers can hold the same players. No draft — whoever buys first, keeps it. Draft section is hidden for Classic leagues.\n\nDraft: each player belongs to one manager. Season starts with a blind draft — managers submit up to 30 preferred players (no constraints during submission). The allocation engine resolves conflicts and builds squads. After that, transfers are first-come-first-served from the remaining unallocated pool.',
        },
        {
          heading: 'Transfer Window',
          body: 'Open between gameweeks so managers can buy and sell on the market. Close at least 1 hour before the first kickoff. For World Cup / tournament leagues the window is controlled by matchday deadlines — the OPEN/CLOSE buttons have no effect (shown as DEADLINE-CONTROLLED).',
        },
        {
          heading: 'Group Stage Draft',
          body: 'Set a pick deadline, then run allocation after it passes. Assigns 15 players per manager within €100M budget (GK≤2, DEF≤5, MID≤5, FWD≤3). One-way — cannot be undone. If you forget to run it, a cron fires automatically 4 hours before the first match.',
        },
        {
          heading: 'Knockout Draft (cup leagues)',
          body: 'A second draft run at the group → knockout transition. Same mechanics as the group draft. Locked until group allocation is confirmed. Set a new deadline, managers submit 30 new picks from the surviving club pool, then run allocation.',
        },
        {
          heading: 'Cup format rules (automatic)',
          body: 'Eliminated clubs: managers cannot buy players from knocked-out clubs (existing holdings kept — they score 0). Club cap relaxes automatically as clubs exit: max 3 → 4 → 5 → no cap. In Draft mode, the no-repeat rule also relaxes as the player pool shrinks. All of this is automatic — no admin action needed.',
        },
        {
          heading: 'Score Recalculation',
          body: 'Re-fetches stats from Forza Football and reapplies the scoring engine. Safe to run multiple times — idempotent. Use "Score Latest Round" after any completed matchday, or enter a specific fixture ID to fix a single match.',
        },
      ],
    },
  };

  const content = CONTENT[topic];
  if (!content) return null;

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 500,
        background: 'rgba(0,0,0,0.72)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '16px',
      }}
    >
      <div style={{
        background: 'var(--ink-2)',
        border: '1px solid var(--rule)',
        width: '100%', maxWidth: 580,
        maxHeight: '80vh',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 24px 60px rgba(0,0,0,0.6)',
      }}>
        {/* Header */}
        <div style={{
          padding: '14px 18px',
          borderBottom: '1px solid var(--rule)',
          display: 'flex', alignItems: 'center', gap: 10,
          background: 'var(--ink)',
        }}>
          <span style={{ width: 3, height: 12, background: 'var(--cyan)', flexShrink: 0 }} />
          <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '.22em', color: 'var(--paper)', flex: 1 }}>
            {content.title}
          </span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--mute)', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '0 2px' }}>✕</button>
        </div>
        {/* Body */}
        <div style={{ padding: '18px 20px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 18 }}>
          {content.sections.map((s, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.22em', color: 'var(--cyan)' }}>
                {s.heading.toUpperCase()}
              </span>
              {s.body && (
                <p style={{ fontFamily: BODY, fontSize: 12, color: 'var(--paper)', lineHeight: 1.6, margin: 0 }}>
                  {s.body}
                </p>
              )}
              {s.rows && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {s.rows.map(([k, v]) => (
                    <div key={k} style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 10 }}>
                      <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.16em', color: 'var(--mute)', paddingTop: 2 }}>{k}</span>
                      <span style={{ fontFamily: BODY, fontSize: 12, color: 'var(--paper)', lineHeight: 1.5 }}>{v}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
        {/* Footer */}
        <div style={{ padding: '10px 18px', borderTop: '1px solid var(--rule)', display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ ...ghostBtn, fontSize: 9, padding: '6px 14px' }}>CLOSE</button>
        </div>
      </div>
    </div>
  );
}

// Format a kickoff ISO timestamp to a short readable string
function fmtKickoff(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit',
  });
}

// Derive season stepper phases from real league data.
// Returns null if no league data is available (callers fall back to demo phases).
// windowType: 'matchday' (deadline-controlled tournament leagues) | 'manual' | null
function computePhases(league, memberCount = 0, windowType = null) {
  if (!league) return null;

  const now = new Date();
  const hasDraftDeadline = !!league.draft_deadline;
  const deadlinePassed = hasDraftDeadline && new Date(league.draft_deadline) <= now;
  const isDraft = league.format === 'noduplicate';
  const allocationDone = league.cup_phase && league.cup_phase !== 'pre_cup';
  const inSeason = allocationDone; // allocation done = in season

  // Bug #2: tournament leagues have a deadline-controlled window, so
  // `transfers_open` (always false by default) is meaningless for them.
  // Show "Auto-managed" so the stage sub-label isn't misleadingly "Closed".
  const twSub = windowType === 'matchday'
    ? 'Auto-managed · Deadline-controlled'
    : (league.transfers_open ? 'Open · transfers enabled' : 'Closed');

  if (!isDraft) {
    // Classic mode: 2 stages
    return [
      { id: 'transfers', label: 'TRANSFER WINDOW', state: 'active', sub: twSub },
      { id: 'season',    label: `IN SEASON · ${memberCount} MGRS`, state: allocationDone ? 'active' : 'todo', sub: 'Live' },
    ];
  }

  // Draft mode: 4 stages
  let currentIdx = 0;
  if (inSeason)              currentIdx = 3;
  else if (deadlinePassed)   currentIdx = 2;
  else if (hasDraftDeadline) currentIdx = 1;

  const stateFor = (idx) => idx < currentIdx ? 'done' : idx === currentIdx ? 'active' : 'todo';

  return [
    { id: 'transfers',  label: 'TRANSFER WINDOW', state: stateFor(0), sub: twSub },
    { id: 'draft',      label: 'DRAFT DEADLINE',  state: stateFor(1), sub: hasDraftDeadline ? fmtKickoff(league.draft_deadline) : 'Not set' },
    { id: 'allocation', label: 'ALLOCATION',       state: stateFor(2), sub: allocationDone ? 'Squads allocated' : deadlinePassed ? 'Processing…' : 'Awaiting draft' },
    { id: 'season',     label: `IN SEASON · ${memberCount} MGRS`, state: stateFor(3), sub: inSeason ? 'Live' : 'Awaiting allocation' },
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// Season stepper (Zone A)
// ─────────────────────────────────────────────────────────────────────────────
function SeasonStepper({ leagueName = 'LEAGUE', memberCount = 0, league = null, windowType = null, onHelp }) {
  const phases = computePhases(league, memberCount, windowType) ?? [
    { id: 'transfers',  label: 'TRANSFER WINDOW', state: 'done',   sub: 'Closed' },
    { id: 'draft',      label: 'DRAFT DEADLINE',  state: 'done',   sub: '15 Mar 19:00' },
    { id: 'allocation', label: 'ALLOCATION',       state: 'active', sub: 'Squads allocated' },
    { id: 'season',     label: 'IN SEASON · 14 MGRS', state: 'todo', sub: 'Awaiting allocation' },
  ];
  const tone = (s) => s === 'done' ? 'var(--positive)' : s === 'active' ? 'var(--cyan)' : 'var(--mute)';
  return (
    <div data-tour="comm-season-stepper" style={{ padding: '18px 28px 22px', borderBottom: '1px solid var(--rule)', background: 'var(--ink-2)', flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <span style={{ width: 3, height: 14, background: 'var(--purple)', flexShrink: 0 }} />
        <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '.22em', color: 'var(--paper)' }}>COMMISSIONER CONTROLS</span>
        <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.22em', color: 'var(--mute)' }}>· ADMIN ONLY · CHANGES TAKE EFFECT IMMEDIATELY</span>
        {onHelp && (
          <button onClick={onHelp} style={helpBtnStyle} title="How does this work?">?</button>
        )}
        <span style={{ flex: 1 }} />
        <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.22em', color: 'var(--mute)' }}>
          {leagueName.toUpperCase()} · {memberCount} MGRS
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${phases.length}, 1fr)`, position: 'relative', gap: 0 }}>
        <div style={{ position: 'absolute', top: 14, left: '10%', right: '10%', height: 1, background: 'var(--rule)' }} />
        {phases.map((p, i) => {
          const t = tone(p.state);
          return (
            <div key={p.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, position: 'relative' }}>
              <span style={{
                width: 28, height: 28, borderRadius: '50%',
                background: p.state === 'done' ? t : 'var(--ink-2)',
                border: `1.5px solid ${t}`,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: MONO, fontSize: 11, fontWeight: 600,
                color: p.state === 'done' ? 'var(--ink)' : t,
                position: 'relative', zIndex: 1,
              }}>{p.state === 'done' ? '✓' : i + 1}</span>
              <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.2em', color: t, textAlign: 'center' }}>{p.label}</span>
              <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.14em', color: 'var(--mute)', textAlign: 'center' }}>{p.sub}</span>
              {p.state === 'active' && (
                <span style={{ fontFamily: MONO, fontSize: 8, letterSpacing: '.22em', color: 'var(--cyan)', border: '1px solid rgba(0,180,216,.33)', padding: '2px 6px', marginTop: 2 }}>● YOU ARE HERE</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Wizard sub-components
// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// Draft submission tracker — commissioner-only, shown in the DRAFT lifecycle card
// ─────────────────────────────────────────────────────────────────────────────
function DraftSubmissionTracker({ members, submitted }) {
  const total     = members.length;
  const doneCount = members.filter(m => submitted.has(m.user_id)).length;
  const allDone   = doneCount === total;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {/* Summary bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.2em', color: 'var(--mute)' }}>
          SUBMISSIONS
        </span>
        <span style={{
          fontFamily: MONO, fontSize: 9, letterSpacing: '.14em', padding: '2px 7px',
          border: `1px solid ${allDone ? 'rgba(34,197,94,.4)' : 'rgba(245,158,11,.4)'}`,
          background: allDone ? 'rgba(34,197,94,.06)' : 'rgba(245,158,11,.06)',
          color: allDone ? 'var(--positive)' : 'var(--warn)',
        }}>
          {doneCount}/{total} {allDone ? '· ALL IN ✓' : '· WAITING'}
        </span>
      </div>
      {/* Per-manager rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {members.map(m => {
          const done     = submitted.has(m.user_id);
          const username = m.users?.username ?? m.user_id.slice(0, 8);
          return (
            <div key={m.user_id} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '4px 8px',
              background: done ? 'rgba(34,197,94,.04)' : 'var(--ink)',
              border: `1px solid ${done ? 'rgba(34,197,94,.2)' : 'var(--rule)'}`,
            }}>
              <span style={{
                fontFamily: MONO, fontSize: 8, letterSpacing: '.14em',
                color: done ? 'var(--positive)' : 'var(--danger)',
                width: 12, textAlign: 'center', flexShrink: 0,
              }}>
                {done ? '✓' : '✗'}
              </span>
              <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.14em', color: done ? 'var(--paper)' : 'var(--mute)', flex: 1 }}>
                {username}
              </span>
              <span style={{ fontFamily: MONO, fontSize: 8, letterSpacing: '.12em', color: done ? 'var(--positive)' : 'var(--mute)' }}>
                {done ? 'SUBMITTED' : 'PENDING'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WizField({ label, sub, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '.22em', color: 'var(--paper)' }}>{label}</span>
        {sub && <span style={{ fontFamily: BODY, fontSize: 11, color: 'var(--mute)' }}>{sub}</span>}
      </div>
      {children}
    </div>
  );
}

function WizHelp({ num, label, hint }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '.22em', color: 'var(--cyan)' }}>{num}</span>
        <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '.22em', color: 'var(--paper)' }}>{label}</span>
      </div>
      <span style={{ fontFamily: BODY, fontSize: 12, color: 'var(--mute)', lineHeight: 1.5 }}>{hint}</span>
    </div>
  );
}

function SummaryRow({ k, v, sub, tone }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 14, alignItems: 'baseline', padding: '8px 0', borderBottom: '1px solid var(--rule)' }}>
      <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.22em', color: 'var(--mute)' }}>{k}</span>
      <div>
        <div style={{ fontFamily: DISPLAY, fontSize: 13, color: tone || 'var(--paper)' }}>
          {v || <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '.18em', color: 'var(--mute)' }}>NOT SET</span>}
        </div>
        {sub && <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.16em', color: 'var(--mute)' }}>{sub}</span>}
      </div>
    </div>
  );
}

function NextBar({ onBack, onNext, canNext, hint }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 'auto', paddingTop: 14, borderTop: '1px solid var(--rule)' }}>
      {hint && <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.18em', color: 'var(--mute)' }}>{hint}</span>}
      <span style={{ flex: 1 }} />
      {onBack && (
        <button onClick={onBack} style={ghostBtn}>← BACK</button>
      )}
      <button
        disabled={!canNext}
        onClick={onNext}
        style={{
          ...btnBase,
          background: canNext ? 'var(--cyan)' : 'var(--ink-3)',
          color: canNext ? 'var(--ink)' : 'var(--mute)',
          cursor: canNext ? 'pointer' : 'not-allowed',
          fontSize: 12,
        }}
      >NEXT →</button>
    </div>
  );
}

function PlayerChipPool({ selected, onChange, onAddCustom }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {selected.map(p => (
        <button key={p.id} onClick={() => onChange(selected.filter(x => x.id !== p.id))} style={{
          padding: '6px 10px', cursor: 'pointer',
          background: 'rgba(0,180,216,.08)',
          border: '1px solid var(--cyan)',
          color: 'var(--cyan)',
          fontFamily: MONO, fontSize: 10, letterSpacing: '.12em',
          display: 'flex', alignItems: 'center', gap: 4,
        }}>
          <span>✓ {p.name}</span>
          <span style={{ opacity: 0.55, fontSize: 8 }}>{(p.club || '').substring(0, 3).toUpperCase()}</span>
          <span style={{ opacity: 0.5, marginLeft: 2 }}>✕</span>
        </button>
      ))}
      {selected.length < 8 && (
        <button onClick={onAddCustom} style={{
          padding: '6px 10px', cursor: 'pointer',
          background: 'rgba(224,168,0,.04)',
          border: '1px dashed rgba(224,168,0,.5)',
          color: 'var(--gold)',
          fontFamily: MONO, fontSize: 10, letterSpacing: '.12em',
        }}>+ SELECT PLAYER</button>
      )}
    </div>
  );
}

function RewardStepper({ value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 0, border: '1px solid var(--rule)', background: 'var(--ink)', width: 'fit-content' }}>
      <button onClick={() => onChange(Math.max(1, value - 1))} style={{ background: 'transparent', border: 0, color: 'var(--paper)', padding: '8px 14px', fontFamily: MONO, fontSize: 14, cursor: 'pointer', borderRight: '1px solid var(--rule)' }}>−</button>
      <span style={{ padding: '8px 18px', fontFamily: DISPLAY, fontSize: 18, color: 'var(--positive)', minWidth: 60, textAlign: 'center' }}>+{value}</span>
      <button onClick={() => onChange(value + 1)} style={{ background: 'transparent', border: 0, color: 'var(--paper)', padding: '8px 14px', fontFamily: MONO, fontSize: 14, cursor: 'pointer', borderLeft: '1px solid var(--rule)' }}>+</button>
    </div>
  );
}


// ─────────────────────────────────────────────────────────────────────────────
// Toggle switch (on/off control with a label)
// ─────────────────────────────────────────────────────────────────────────────
function ToggleSwitch({ checked, onChange, disabled, labelOn, labelOff }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      disabled={disabled}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
        width: '100%', background: 'transparent', border: 'none', padding: 0,
        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
      }}
    >
      <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '.2em', color: checked ? 'var(--positive)' : 'var(--mute)' }}>
        {checked ? labelOn : labelOff}
      </span>
      <span style={{
        position: 'relative', width: 44, height: 24, borderRadius: 12, flexShrink: 0,
        background: checked ? 'var(--positive)' : 'var(--ink)',
        border: `1px solid ${checked ? 'var(--positive)' : 'var(--rule)'}`,
        transition: 'background 0.15s ease',
      }}>
        <span style={{
          position: 'absolute', top: 2, left: checked ? 22 : 2,
          width: 18, height: 18, borderRadius: '50%',
          background: checked ? 'var(--ink)' : 'var(--mute)',
          transition: 'left 0.15s ease',
        }} />
      </span>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Free transfer window state — emergency "open the market mid-matchday" toggle.
// Shared by the desktop LifecycleOps grid and the mobile lifecycle cards so
// EMERGENCY TRANSFERS is available on both layouts.
// ─────────────────────────────────────────────────────────────────────────────
function useFreeTransferWindow(leagueId, commissioner) {
  const FREE_WINDOW_HOURS = 24;
  const [activeFreeWindow, setActiveFreeWindow] = useState(null); // row or null

  const refreshFreeWindow = useCallback(() => {
    if (!leagueId) return;
    const now = new Date().toISOString();
    supabase
      .from('transfer_windows')
      .select('id, closes_at')
      .eq('league_id', leagueId)
      .eq('window_type', 'unlimited')
      .lte('opens_at', now)
      .gte('closes_at', now)
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setActiveFreeWindow(data ?? null));
  }, [leagueId]);

  useEffect(() => { refreshFreeWindow(); }, [refreshFreeWindow]);

  const openFreeWindow = () => {
    if (!window.confirm(
      'Turn ON emergency transfers?\n\n' +
      'This allows transfers during a live matchday, bypassing the deadline and live-fixture locks (budget, position, club cap, and ownership rules still apply).\n\n' +
      'This can distort the game:\n' +
      '- Managers can sub IN players who have already played this round, banking points they already earned elsewhere.\n' +
      '- Managers can sub OUT underperforming players, erasing points they have already conceded this round.\n\n' +
      `The window stays open for ${FREE_WINDOW_HOURS}h or until you turn it off. Continue?`
    )) return;
    commissioner.commAction(async () => {
      const closesAt = new Date(Date.now() + FREE_WINDOW_HOURS * 3600 * 1000).toISOString();
      const { error } = await supabase.from('transfer_windows').insert({
        league_id:           leagueId,
        window_type:         'unlimited',
        transfers_remaining: null,
        opens_at:            new Date().toISOString(),
        closes_at:           closesAt,
      });
      if (error) throw new Error(error.message);
      refreshFreeWindow();
      commissioner.setCommMsg({ type: 'ok', text: 'Emergency transfers ON — managers can now trade regardless of the matchday lock.' });
    });
  };

  const closeFreeWindow = () => {
    if (!activeFreeWindow) return;
    if (!window.confirm('Turn off emergency transfers now?')) return;
    commissioner.commAction(async () => {
      const { error } = await supabase
        .from('transfer_windows')
        .update({ closes_at: new Date().toISOString() })
        .eq('id', activeFreeWindow.id);
      if (error) throw new Error(error.message);
      setActiveFreeWindow(null);
      commissioner.setCommMsg({ type: 'ok', text: 'Emergency transfers OFF.' });
    });
  };

  return { activeFreeWindow, openFreeWindow, closeFreeWindow };
}

// Free transfers config — toggle that lifts the per-round transfer cap while the
// window is open. Stored in league_config('free_transfers'). Classic leagues only;
// draft leagues already have unlimited transfers via limitMatchdayId=null.
// Follows the same dual-call pattern as useFreeTransferWindow.
// ─────────────────────────────────────────────────────────────────────────────
function useFreeTransfersConfig(leagueId, commissioner) {
  const [freeTransfers, setFreeTransfersState] = useState(false);

  const refresh = useCallback(() => {
    if (!leagueId) return;
    supabase
      .from('league_config')
      .select('config_value')
      .eq('league_id', leagueId)
      .eq('config_key', 'free_transfers')
      .maybeSingle()
      .then(({ data }) => { setFreeTransfersState(data?.config_value === true); });
  }, [leagueId]);

  useEffect(() => { refresh(); }, [refresh]);

  const toggle = (enabled) => {
    commissioner.commAction(async () => {
      const { error } = await supabase
        .from('league_config')
        .upsert(
          { league_id: leagueId, config_key: 'free_transfers', config_value: enabled },
          { onConflict: 'league_id,config_key' }
        );
      if (error) throw new Error(error.message);
      setFreeTransfersState(enabled);
      commissioner.setCommMsg({
        type: 'ok',
        text: enabled
          ? 'Free transfers ON — no per-round limit while the window is open.'
          : 'Free transfers OFF — per-round limit restored.',
      });
    });
  };

  return { freeTransfers, toggleFreeTransfers: toggle };
}

// ─────────────────────────────────────────────────────────────────────────────
// Lifecycle operation card
// ─────────────────────────────────────────────────────────────────────────────
function LifecycleOp({ title, status, statusTone = 'var(--mute)', sub, when, children, primary }) {
  return (
    <div style={{ background: 'var(--ink-2)', border: '1px solid var(--rule)', display: 'flex', flexDirection: 'column', minHeight: 240, flex: 1 }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--rule)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ width: 3, height: 12, background: statusTone, flexShrink: 0 }} />
        <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '.22em', color: 'var(--paper)' }}>{title}</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.22em', color: statusTone }}>● {status}</span>
      </div>
      <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
        {sub && <span style={{ fontFamily: BODY, fontSize: 11, color: 'var(--mute)', lineHeight: 1.5 }}>{sub}</span>}
        {children}
        {when && (
          <div style={{ marginTop: 'auto', padding: '6px 8px', background: 'var(--ink)', border: '1px solid var(--rule)', fontFamily: BODY, fontSize: 10, color: 'var(--mute)', lineHeight: 1.4 }}>
            <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.2em', color: 'var(--paper)' }}>WHEN TO RUN · </span>
            {when}
          </div>
        )}
        {primary}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Lifecycle operations (Zone C)
// ─────────────────────────────────────────────────────────────────────────────
function LifecycleOps({ commissioner, leagueId, tournamentId, league = null, onHelp }) {
  const {
    commLoading,
    windowOpensAt, setWindowOpensAt,
    windowClosesAt, setWindowClosesAt,
    windowTransfers, setWindowTransfers,
    openTransferWindow, closeTransferWindow,
    draftDeadline, setDraftDeadline, setLeagueDraftDeadline,
    triggerDraftAllocation, triggerKnockoutAllocation,
    scoreFixtureId, setScoreFixtureId, triggerScores,
  } = commissioner;

  // Draft submission tracker — shows which managers have submitted their pick list.
  // Reads only user_id + submitted_at (NOT player_ids) so the blind draft stays blind.
  const [draftSubmissions, setDraftSubmissions]   = useState(null); // null = not yet loaded
  const [draftMembers,     setDraftMembers]       = useState([]);   // all league members

  useEffect(() => {
    if (!leagueId || !league || league.format !== 'noduplicate') return;
    let cancelled = false;
    (async () => {
      const [{ data: members }, { data: subs }] = await Promise.all([
        supabase
          .from('league_members')
          .select('user_id, users(username)')
          .eq('league_id', leagueId)
          .order('total_points', { ascending: false }),
        supabase
          .from('draft_submissions')
          .select('user_id, submitted_at, phase')
          .eq('league_id', leagueId),
      ]);
      if (cancelled) return;
      setDraftMembers(members || []);
      // Build a Set of user_ids who have a submitted row (any phase)
      const submittedSet = new Set((subs || []).map(s => s.user_id));
      setDraftSubmissions(submittedSet);
    })();
    return () => { cancelled = true; };
  // Re-run when the league or allocation status changes (e.g. after allocation runs)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueId, league?.format, league?.cup_phase]);

  // Deadline-controlled = league belongs to a tournament with matchday_deadlines
  // (WC/cup leagues). Manual-controlled = EPL/season leagues with no tournamentId,
  // always governed by transfer_windows.
  //
  // NOTE: do NOT derive this from `windowType` (get_transfer_window_status's
  // window_type) — that field reflects the *currently active window's* type
  // ('unlimited' during an emergency window, 'standard'/'cup_group'/etc. for a
  // manual transfer_windows row, 'matchday' only on the deadline fallback path
  // when no manual/emergency row is active). A deadline-controlled league still
  // IS deadline-controlled while an emergency window is open — in fact that's
  // exactly when the commissioner needs to see the EMERGENCY TRANSFERS toggle.
  const isDeadlineControlled = !!tournamentId;

  // Allocation state
  const now = new Date();
  const deadlinePassed = league?.draft_deadline && new Date(league.draft_deadline) <= now;
  const allocationDone = league?.cup_phase && league.cup_phase !== 'pre_cup';

  // Knockout allocation is done once cup_phase moves into an elimination phase.
  // Declared here (before groupStageStarted useEffect) so it's initialised when
  // the dependency array at that useEffect is evaluated — avoids a TDZ crash.
  const knockoutAllocationDone = ['pre_elimination', 'round_of_16', 'quarter_final', 'semi_final', 'final'].includes(league?.cup_phase);

  // Knockout draft local state
  const [knockoutDeadline,    setKnockoutDeadline]    = useState('');
  const [keepSubmissionCount, setKeepSubmissionCount] = useState(null);

  // Free transfer window state — emergency "open the market mid-matchday" toggle.
  // Shared with the mobile layout via useFreeTransferWindow.
  const { activeFreeWindow, openFreeWindow, closeFreeWindow } = useFreeTransferWindow(leagueId, commissioner);
  // Free transfers config — lifts per-round cap while window is open (Classic leagues only).
  const { freeTransfers, toggleFreeTransfers } = useFreeTransfersConfig(leagueId, commissioner);

  // groupStageStarted: true once at least one configured matchday fixture has kicked off.
  // Gating on kickoff_at (not deadline_at or fixture status) ensures the knockout draft
  // section is locked until actual group-stage play begins — not just when the deadline
  // passes or the group draft lottery ran. Scoped to matchday_deadlines so old historical
  // fixtures in the same tournament don't produce false positives.
  const [groupStageStarted,   setGroupStageStarted]   = useState(false);

  useEffect(() => {
    if (!allocationDone || knockoutAllocationDone || !tournamentId) { setGroupStageStarted(false); return; }
    (async () => {
      const { data: mds } = await supabase
        .from('matchday_deadlines').select('matchday_id').eq('tournament_id', tournamentId);
      const mdIds = (mds ?? []).map(r => r.matchday_id);
      if (!mdIds.length) { setGroupStageStarted(false); return; }
      const { count } = await supabase
        .from('fixtures').select('id', { count: 'exact', head: true })
        .eq('tournament_id', tournamentId)
        .in('matchday_id', mdIds)
        .lte('kickoff_at', new Date().toISOString());
      setGroupStageStarted((count ?? 0) > 0);
    })();
  }, [allocationDone, knockoutAllocationDone, tournamentId]);

  // Fetch keep submission count when the keep window is open (group_stage phase)
  useEffect(() => {
    if (league?.cup_phase !== 'group_stage' || !leagueId) { setKeepSubmissionCount(null); return; }
    supabase
      .from('knockout_keep_submissions')
      .select('user_id', { count: 'exact', head: true })
      .eq('league_id', leagueId)
      .then(({ count }) => setKeepSubmissionCount(count ?? 0));
  }, [league?.cup_phase, leagueId]);

  const knockoutStatus = !allocationDone ? 'LOCKED'
    : knockoutAllocationDone ? 'ALLOCATED'
    : league?.knockout_draft_deadline ? 'DEADLINE SET'
    : 'NOT SET';

  const knockoutTone = !allocationDone ? 'var(--mute)'
    : knockoutAllocationDone ? 'var(--positive)'
    : league?.knockout_draft_deadline ? 'var(--positive)'
    : 'var(--warn)';

  // AUDIT-58-A3: derive live status labels for the LifecycleOp cards.
  // Deadline-controlled leagues: show OPEN (OVERRIDE) when manually opened, AUTO-MANAGED otherwise.
  const twStatus  = isDeadlineControlled
                  ? (league?.transfers_open ? 'OPEN (OVERRIDE)' : 'AUTO-MANAGED')
                  : league?.transfers_open ? 'OPEN' : 'CLOSED';
  const twTone    = isDeadlineControlled
                  ? (league?.transfers_open ? 'var(--positive)' : 'var(--warn)')
                  : league?.transfers_open ? 'var(--positive)' : 'var(--danger)';

  const draftStatus = !league?.draft_deadline ? 'NOT SET'
                    : allocationDone          ? 'ALLOCATED'
                    : deadlinePassed          ? 'DEADLINE PASSED'
                    :                           'DEADLINE SET';
  const draftTone   = !league?.draft_deadline ? 'var(--mute)'
                    : allocationDone          ? 'var(--positive)'
                    : deadlinePassed          ? 'var(--warn)'
                    :                           'var(--positive)';

  const handleCloseNow = () => {
    if (!window.confirm('This stops all in-progress transfers immediately. Continue?')) return;
    closeTransferWindow();
  };

  const handleRunAllocation = () => {
    if (!window.confirm('This allocates squads for all managers. It cannot be undone without a manual reset. Continue?')) return;
    triggerDraftAllocation();
  };

  const handleRunKnockoutAllocation = async () => {
    if (!window.confirm('This runs the knockout-phase draft allocation. It cannot be undone. Continue?')) return;
    if (knockoutDeadline) {
      await supabase.from('leagues').update({ knockout_draft_deadline: new Date(knockoutDeadline).toISOString() }).eq('id', leagueId);
    }
    triggerKnockoutAllocation();
  };

  const opBtnStyle = (bg, color = 'var(--ink)') => ({
    ...btnBase, width: '100%', background: commLoading ? 'var(--ink-3)' : bg,
    color: commLoading ? 'var(--mute)' : color,
    cursor: commLoading ? 'not-allowed' : 'pointer', fontSize: 11,
  });

  // Compact inline action button — sits beside an input, replaces full-width CTAs
  const compactBtn = (color, disabled) => ({
    background: 'transparent',
    border: `1px solid ${disabled ? 'var(--rule)' : color}`,
    color: disabled ? 'var(--mute)' : color,
    fontFamily: MONO, fontSize: 9, letterSpacing: '.18em',
    padding: '0 14px', cursor: disabled ? 'not-allowed' : 'pointer',
    flexShrink: 0, whiteSpace: 'nowrap',
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <HubSectionLabel
        label="LIFECYCLE OPERATIONS"
        sub="SEASON-STAGE CONTROLS"
        tone="var(--purple)"
        helpBtn={onHelp && (
          <button onClick={onHelp} style={helpBtnStyle} title="How do these controls work?">?</button>
        )}
      />
      <div style={{ padding: '18px 24px' }}>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3" style={{ gap: 14 }}>

          {/* Transfer Window */}
          <div data-tour="comm-transfer-window" style={{ display: 'flex', flexDirection: 'column' }}>
          <LifecycleOp
            title="TRANSFER WINDOW"
            status={twStatus}
            statusTone={twTone}
            sub="Controls when the transfer market is open. Toggle to open or close manually — combine with FREE TRANSFERS to also remove the per-round limit."
            when="Deadline-controlled leagues auto-open between gameweeks. Toggle to override (e.g. open earlier, or close during a postponement). Price lock and per-round limits still apply unless you also enable FREE TRANSFERS."
            primary={
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {isDeadlineControlled ? (
                  <div style={{ padding: '8px 10px', background: 'var(--ink)', border: '1px solid var(--rule)', fontFamily: BODY, fontSize: 10, color: 'var(--mute)', lineHeight: 1.5 }}>
                    <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.2em', color: 'var(--warn)' }}>AUTO-MANAGED · </span>
                    Opens and closes automatically based on matchday deadlines. Toggle to temporarily override.
                  </div>
                ) : (
                  <>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '.2em', color: 'var(--paper)' }}>OPENS</span>
                        <input type="datetime-local" value={windowOpensAt} onChange={e => setWindowOpensAt(e.target.value)} style={{ ...inputStyle, colorScheme: 'dark', fontSize: 11 }} />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '.2em', color: 'var(--paper)' }}>CLOSES</span>
                        <input type="datetime-local" value={windowClosesAt} onChange={e => setWindowClosesAt(e.target.value)} style={{ ...inputStyle, colorScheme: 'dark', fontSize: 11 }} />
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.2em', color: 'var(--mute)' }}>LIMIT · BLANK = UNLIMITED</span>
                      <input type="number" min="1" value={windowTransfers} onChange={e => setWindowTransfers(e.target.value)} placeholder="e.g. 5" style={inputStyle} />
                    </div>
                  </>
                )}
                <ToggleSwitch
                  checked={!!league?.transfers_open}
                  onChange={league?.transfers_open ? handleCloseNow : openTransferWindow}
                  disabled={commLoading}
                  labelOn="WINDOW OPEN"
                  labelOff="WINDOW CLOSED"
                />
              </div>
            }
          />
          </div>

          {/* Free transfers — Classic leagues only (draft leagues already have unlimited).
              Lifts the per-round transfer cap while the window is open. Does NOT override
              the open/closed window state — acts on top of normal window timing. */}
          {league?.format !== 'noduplicate' && (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
          <LifecycleOp
            title="FREE TRANSFERS"
            status={freeTransfers ? 'ON' : 'OFF'}
            statusTone={freeTransfers ? 'var(--positive)' : 'var(--mute)'}
            sub="Removes the per-round transfer limit (normally 3 free + penalty buys) while the transfer window is open. Budget, position, club cap, and window timing still apply."
            when="Enable mid-window when you want managers to make unlimited transfers — e.g. post-draft squad building or a generous transfer period. Disable to restore normal per-round limits."
            primary={
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {freeTransfers && (
                  <div style={{ padding: '8px 10px', background: 'rgba(24,201,107,0.06)', border: '1px solid rgba(24,201,107,0.25)', fontFamily: BODY, fontSize: 10, color: 'var(--positive)', lineHeight: 1.5 }}>
                    <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.2em' }}>ON · </span>
                    Transfer limit lifted — managers can buy freely while the window is open.
                  </div>
                )}
                <ToggleSwitch
                  checked={freeTransfers}
                  onChange={() => toggleFreeTransfers(!freeTransfers)}
                  disabled={commLoading}
                  labelOn="FREE TRANSFERS ON"
                  labelOff="FREE TRANSFERS OFF"
                />
              </div>
            }
          />
          </div>
          )}

          {/* Emergency mid-matchday transfer toggle — relevant to any deadline-controlled
              league (matchday-deadline lock applies regardless of league_mode). */}
          {isDeadlineControlled && (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
          <LifecycleOp
            title="EMERGENCY TRANSFERS"
            status={activeFreeWindow ? 'ON' : 'OFF'}
            statusTone={activeFreeWindow ? 'var(--positive)' : 'var(--mute)'}
            sub="Forces the market open during a live matchday AND lifts the live-fixture price lock and the per-round transfer limit. Budget, position, club cap, and ownership rules still apply."
            when="Genuine emergencies only — e.g. reversing a manager's mistaken transfer or unblocking someone hit by a bug. For routine schedule fixes, use TRANSFER WINDOW OVERRIDE instead."
            primary={
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ padding: '8px 10px', background: 'rgba(240,180,0,0.06)', border: '1px solid rgba(240,180,0,0.25)', fontFamily: BODY, fontSize: 10, color: 'var(--warn)', lineHeight: 1.5 }}>
                  <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.2em' }}>CAUTION · </span>
                  Managers can sub in players who already scored this round, or sub out players who already conceded points. Past points are NOT recalculated. Turn off as soon as the issue is resolved.
                </div>
                {activeFreeWindow && (
                  <div style={{ padding: '8px 10px', background: 'rgba(24,201,107,0.06)', border: '1px solid rgba(24,201,107,0.25)', fontFamily: BODY, fontSize: 10, color: 'var(--positive)', lineHeight: 1.5 }}>
                    <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.2em' }}>ON · </span>
                    Auto-closes {new Date(activeFreeWindow.closes_at).toLocaleString()}
                  </div>
                )}
                <ToggleSwitch
                  checked={!!activeFreeWindow}
                  onChange={activeFreeWindow ? closeFreeWindow : openFreeWindow}
                  disabled={commLoading}
                  labelOn="EMERGENCY TRANSFERS ON"
                  labelOff="EMERGENCY TRANSFERS OFF"
                />
              </div>
            }
          />
          </div>
          )}

          {/* Draft — draft mode only */}
          {(!league || league.format === 'noduplicate') && (
          <div data-tour="comm-draft-deadline">
          <LifecycleOp
            title="DRAFT"
            status={draftStatus}
            statusTone={draftTone}
            sub="Set the pick deadline, then run the allocation engine. Allocation runs once per season."
            when="After all managers submit picks. Before GW1 kickoff."
            primary={
              allocationDone ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ padding: '8px 10px', background: 'var(--ink)', border: '1px solid var(--rule)', fontFamily: BODY, fontSize: 10, color: 'var(--positive)', lineHeight: 1.5 }}>
                    ✓ Allocation complete — squads are live. The lottery cannot be re-run.
                  </div>
                  {/* Submission tracker still visible after allocation for reference */}
                  {draftMembers.length > 0 && draftSubmissions !== null && (
                    <DraftSubmissionTracker members={draftMembers} submitted={draftSubmissions} />
                  )}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {/* Submission tracker — shows who has/hasn't submitted their pick list */}
                  {draftMembers.length > 0 && draftSubmissions !== null && (
                    <DraftSubmissionTracker members={draftMembers} submitted={draftSubmissions} />
                  )}
                  <div style={{ height: 1, background: 'var(--rule)', margin: '2px 0' }} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.2em', color: 'var(--mute)' }}>DEADLINE (INFORMATIONAL)</span>
                    <input type="datetime-local" value={draftDeadline} onChange={e => setDraftDeadline(e.target.value)} style={inputStyle} />
                  </div>
                  <button onClick={setLeagueDraftDeadline} disabled={commLoading} style={{ ...btnBase, width: '100%', background: 'transparent', border: '1px solid var(--rule)', color: 'var(--paper)', fontSize: 11 }}>SET DEADLINE</button>
                  <div style={{ height: 1, background: 'var(--rule)', margin: '4px 0' }} />
                  <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.18em', color: 'var(--mute)', lineHeight: 1.6 }}>
                    ONCE DONE · 15 PLAYERS / MGR · €100M BUDGET · GK≤2 DEF≤5 MID≤5 FWD≤3
                  </div>
                  <button
                    onClick={handleRunAllocation}
                    disabled={commLoading}
                    style={opBtnStyle('var(--gold)')}
                  >RUN ALLOCATION ↯</button>
                </div>
              )
            }
          />
          </div>
          )}

          {/* Knockout Draft — disabled: group→knockout uses normal transfer window */}
          {KNOCKOUT_DRAFT_ENABLED && (!league || (league.format === 'noduplicate' && (
            (league.cup_phase && league.cup_phase !== 'pre_cup') ||
            !!league.knockout_draft_deadline
          ))) && (
          <div data-tour="comm-knockout-draft" style={{ display: 'flex' }}>
          <LifecycleOp
            title="KNOCKOUT DRAFT"
            status={knockoutStatus}
            statusTone={knockoutTone}
            sub="Second draft for the knockout phase. Same allocation logic as the group draft — managers submit 30 picks, lottery resolves conflicts."
            when="After group stage allocation completes. Set before the first knockout match."
            primary={
              knockoutAllocationDone ? (
                <div style={{ padding: '8px 10px', background: 'var(--ink)', border: '1px solid var(--rule)', fontFamily: BODY, fontSize: 10, color: 'var(--positive)', lineHeight: 1.5 }}>
                  ✓ Knockout squads allocated
                </div>
              ) : !allocationDone ? (
                <div style={{ padding: '8px 10px', background: 'var(--ink)', border: '1px solid var(--rule)', fontFamily: BODY, fontSize: 10, color: 'var(--mute)', lineHeight: 1.5 }}>
                  Locked — complete group allocation first
                </div>
              ) : !groupStageStarted ? (
                <div style={{ padding: '8px 10px', background: 'var(--ink)', border: '1px solid var(--rule)', fontFamily: BODY, fontSize: 10, color: 'var(--mute)', lineHeight: 1.5 }}>
                  Locked — group stage fixtures have not kicked off yet
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {/* Keep submission count — visible during the keep window */}
                  {keepSubmissionCount !== null && (
                    <div style={{ padding: '7px 10px', background: 'rgba(160,108,255,0.07)', border: '1px solid rgba(160,108,255,0.25)', fontFamily: MONO, fontSize: 9, letterSpacing: '.16em', color: '#a855f7', lineHeight: 1.5 }}>
                      🛡️ KEEP SUBMISSIONS · {keepSubmissionCount} manager{keepSubmissionCount !== 1 ? 's' : ''} have protected players
                    </div>
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.2em', color: 'var(--mute)' }}>KNOCKOUT DEADLINE</span>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'stretch' }}>
                      <input
                        type="datetime-local"
                        value={knockoutDeadline}
                        onChange={e => setKnockoutDeadline(e.target.value)}
                        style={{ ...inputStyle, colorScheme: 'dark', fontSize: 11, flex: 1 }}
                      />
                      <button
                        onClick={handleRunKnockoutAllocation}
                        disabled={commLoading}
                        style={compactBtn('var(--gold)', commLoading)}
                      >RUN ↯</button>
                    </div>
                  </div>
                </div>
              )
            }
          />
          </div>
          )}

          {/* Score Recalculation */}
          <div data-tour="comm-score-recalc" style={{ display: 'flex' }}>
          <LifecycleOp
            title="SCORE RECALCULATION"
            status="UTILITY · ON-DEMAND"
            statusTone="var(--mute)"
            sub="Scores run automatically — no action needed under normal conditions."
            when="Use only if a match score looks wrong or a fixture failed to score."
            primary={
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ padding: '8px 10px', background: 'var(--ink)', border: '1px solid var(--rule)', fontFamily: BODY, fontSize: 10, color: 'var(--mute)', lineHeight: 1.6 }}>
                  <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.2em', color: 'var(--positive)' }}>AUTO · </span>
                  Scores recalculate automatically after every match via scheduled jobs (post-match ~22:30 UTC, late finishers ~23:30 UTC, live every 2 min). You do not need to trigger anything.
                  <br /><br />
                  <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.2em', color: 'var(--warn)' }}>WHEN TO USE · </span>
                  Only if a specific match shows incorrect points (e.g. a data correction from the provider arrived after scoring ran). Enter the fixture ID and recalculate — safe to re-run, overwrites with latest data.
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'stretch' }}>
                  <input type="text" value={scoreFixtureId} onChange={e => setScoreFixtureId(e.target.value)} placeholder="Fixture ID — e.g. f-1219435455" style={{ ...inputStyle, flex: 1 }} />
                  <button onClick={triggerScores} disabled={commLoading || !scoreFixtureId} style={compactBtn('var(--warn)', commLoading || !scoreFixtureId)}>RECALC ↯</button>
                </div>
              </div>
            }
          />
          </div>

          {/* H2H Calendar — only for Draft + H2H leagues */}
          {league?.h2h_enabled && (
            <div style={{ display: 'flex' }}>
              <H2HCalendarSection leagueId={leagueId} tournamentId={tournamentId} />
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// H2H Calendar management panel — used in both desktop and mobile commissioner views
// ─────────────────────────────────────────────────────────────────────────────
function H2HCalendarSection({ leagueId, tournamentId, isMobile = false }) {
  const [matchdays,       setMatchdays]       = useState([]);
  const [startMatchday,   setStartMatchday]   = useState('');
  const [scheduleCount,   setScheduleCount]   = useState(null); // null = not yet loaded
  const [generating,      setGenerating]      = useState(false);
  const [msg,             setMsg]             = useState(null);

  // Load available matchday IDs + check if a schedule already exists
  useEffect(() => {
    if (!leagueId || !tournamentId) return;
    let cancelled = false;

    (async () => {
      // Available matchdays from matchday_deadlines for this tournament, ordered by round
      const { data: rows } = await supabase
        .from('matchday_deadlines')
        .select('matchday_id')
        .eq('tournament_id', tournamentId)
        .order('deadline_at', { ascending: true });

      // Deduplicate (multiple leagues share the same tournament deadlines)
      const seen = new Set();
      const mds = (rows ?? [])
        .map(r => r.matchday_id)
        .filter(id => { if (seen.has(id)) return false; seen.add(id); return true; });

      // Count existing h2h_schedule rows for this league
      const { count } = await supabase
        .from('h2h_schedule')
        .select('id', { count: 'exact', head: true })
        .eq('league_id', leagueId);

      if (cancelled) return;
      setMatchdays(mds);
      if (mds.length > 0 && !startMatchday) setStartMatchday(mds[0]);
      setScheduleCount(count ?? 0);
    })();

    return () => { cancelled = true; };
  }, [leagueId, tournamentId]); // eslint-disable-line react-hooks/exhaustive-deps

  const generate = async () => {
    if (!startMatchday) return;
    setGenerating(true);
    setMsg(null);
    try {
      const { data, error } = await supabase.rpc('generate_h2h_schedule', {
        p_league_id:         leagueId,
        p_start_matchday_id: startMatchday,
      });
      if (error) throw error;
      setMsg({ type: 'ok', text: `Calendar generated — ${data.matchdays_scheduled} matchdays scheduled for ${data.managers} managers.` });
      setScheduleCount(data.matchdays_scheduled * Math.ceil(data.managers / 2));
    } catch (err) {
      setMsg({ type: 'err', text: `Failed: ${err.message}` });
    } finally {
      setGenerating(false);
    }
  };

  const isGenerated = scheduleCount !== null && scheduleCount > 0;
  const genDisabled = generating || !startMatchday;

  const infoBox = isGenerated ? (
    <div style={{ padding: '8px 10px', background: 'var(--ink)', border: '1px solid rgba(34,197,94,0.25)', fontFamily: BODY, fontSize: 10, color: 'var(--mute)', lineHeight: 1.6 }}>
      <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.2em', color: 'var(--positive)' }}>ACTIVE · </span>
      H2H schedule is in place. Managers can view it on the H2H tab. Results are calculated automatically once every match in a round finishes.
      <br /><br />
      <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.2em', color: 'var(--warn)' }}>RE-GENERATE · </span>
      To regenerate (e.g. after a new manager joins), pick a new start matchday below. Only unresolved future matchdays are overwritten — completed rounds are preserved.
    </div>
  ) : (
    <div style={{ padding: '8px 10px', background: 'var(--ink)', border: '1px solid rgba(240,180,0,0.2)', fontFamily: BODY, fontSize: 10, color: 'var(--mute)', lineHeight: 1.6 }}>
      <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.2em', color: 'var(--gold)' }}>SETUP REQUIRED · </span>
      Pick the first matchday for H2H play and click Generate. All managers currently in the league will be included. If a new manager joins later, regenerate from the next unplayed matchday.
    </div>
  );

  const selectAndBtn = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.2em', color: 'var(--mute)' }}>START FROM MATCHDAY</span>
      <div style={{ display: 'flex', gap: 6, alignItems: 'stretch' }}>
        {matchdays.length > 0 ? (
          <select
            value={startMatchday}
            onChange={e => setStartMatchday(e.target.value)}
            style={{ ...inputStyle, cursor: 'pointer', flex: 1 }}
          >
            {matchdays.map(md => (
              <option key={md} value={md}>{md}</option>
            ))}
          </select>
        ) : (
          <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--mute)', flex: 1 }}>Loading matchdays…</span>
        )}
        <button
          onClick={generate}
          disabled={genDisabled}
          style={{
            background: 'transparent',
            border: `1px solid ${genDisabled ? 'var(--rule)' : 'var(--gold)'}`,
            color: genDisabled ? 'var(--mute)' : 'var(--gold)',
            fontFamily: MONO, fontSize: 9, letterSpacing: '.18em',
            padding: '0 14px', cursor: genDisabled ? 'not-allowed' : 'pointer',
            flexShrink: 0, whiteSpace: 'nowrap',
          }}
        >
          {generating ? '…' : isGenerated ? 'REGEN ↻' : 'GENERATE ↻'}
        </button>
      </div>
      {msg && (
        <div style={{ padding: '8px 10px', background: msg.type === 'ok' ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)', border: `1px solid ${msg.type === 'ok' ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`, fontFamily: MONO, fontSize: 10, color: msg.type === 'ok' ? 'var(--positive)' : 'var(--danger)', letterSpacing: '.1em' }}>
          {msg.text}
        </div>
      )}
    </div>
  );

  if (!isMobile) {
    return (
      <LifecycleOp
        title="H2H CALENDAR"
        status={isGenerated ? 'GENERATED' : 'NOT YET GENERATED'}
        statusTone={isGenerated ? 'var(--positive)' : 'var(--gold)'}
        when="After all managers join. Regenerate from the next unplayed matchday if a new manager joins later."
      >
        {infoBox}
        {selectAndBtn}
      </LifecycleOp>
    );
  }

  return (
    <div>
      <HubSectionLabel
        label="H2H CALENDAR"
        sub={isGenerated ? 'GENERATED' : 'NOT YET GENERATED'}
        tone={isGenerated ? 'var(--positive)' : 'var(--gold)'}
      />
      <div style={{ padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {infoBox}
        {selectAndBtn}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Mobile accordion variants
// ─────────────────────────────────────────────────────────────────────────────
function MobSeasonStepper({ league = null, memberCount = 0, windowType = null, onHelp }) {
  const computed = computePhases(league, memberCount, windowType);
  const phases = computed
    ? computed.map(p => ({ label: p.id.toUpperCase(), state: p.state }))
    : [
        { label: 'TRANSFERS',  state: 'done' },
        { label: 'DRAFT',      state: 'done' },
        { label: 'ALLOCATION', state: 'active' },
        { label: 'SEASON',     state: 'todo' },
      ];
  return (
    <div style={{ padding: '14px 18px', background: 'var(--ink-2)', borderBottom: '1px solid var(--rule)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <span style={{ width: 3, height: 12, background: 'var(--purple)', flexShrink: 0 }} />
        <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '.22em', color: 'var(--paper)' }}>COMMISSIONER</span>
        <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.18em', color: 'var(--mute)' }}>· ADMIN ONLY</span>
        {onHelp && (
          <button onClick={onHelp} style={helpBtnStyle} title="How does this work?">?</button>
        )}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${phases.length}, 1fr)`, gap: 4, position: 'relative' }}>
        <div style={{ position: 'absolute', top: 11, left: '10%', right: '10%', height: 1, background: 'var(--rule)' }} />
        {phases.map((p, i) => {
          const tone = p.state === 'done' ? 'var(--positive)' : p.state === 'active' ? 'var(--cyan)' : 'var(--mute)';
          return (
            <div key={p.label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, zIndex: 1 }}>
              <span style={{
                width: 22, height: 22, borderRadius: '50%',
                background: p.state === 'done' ? tone : 'var(--ink-2)',
                border: `1.5px solid ${tone}`,
                color: p.state === 'done' ? 'var(--ink)' : tone,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: MONO, fontSize: 9, fontWeight: 600,
              }}>{p.state === 'done' ? '✓' : i + 1}</span>
              <span style={{ fontFamily: MONO, fontSize: 8, letterSpacing: '.16em', color: tone, textAlign: 'center' }}>{p.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── MobLifecycleCard: collapsible with 14px side gutters (matches brand spec) ──
function MobLifecycleCard({ title, status, tone, children, when, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ background: 'var(--ink-2)', border: '1px solid var(--rule)', borderLeft: `3px solid ${tone}`, margin: '0 14px' }}>
      <button onClick={() => setOpen(!open)} style={{ background: 'transparent', border: 0, padding: '12px 14px', width: '100%', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
          <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '.22em', color: 'var(--paper)' }}>{title}</span>
          <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.18em', color: tone }}>● {status}</span>
        </div>
        <span style={{ color: 'var(--mute)', fontFamily: MONO, fontSize: 14 }}>{open ? '−' : '+'}</span>
      </button>
      {open && (
        <div style={{ padding: '4px 14px 14px', display: 'flex', flexDirection: 'column', gap: 10, borderTop: '1px solid var(--rule)' }}>
          {children}
          {when && (
            <div style={{ padding: '6px 8px', background: 'var(--ink)', border: '1px solid var(--rule)', fontFamily: BODY, fontSize: 10, color: 'var(--mute)', lineHeight: 1.4 }}>
              <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.2em', color: 'var(--paper)' }}>WHEN · </span>{when}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Slim section header (matches brand MobSection) ─────────────────────────────
function MobSectionHeader({ label, sub, tone, onHelp }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 18px 6px' }}>
      <span style={{ width: 3, height: 12, background: tone, flexShrink: 0 }} />
      <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '.22em', color: 'var(--paper)' }}>{label}</span>
      {onHelp && (
        <button onClick={onHelp} style={helpBtnStyle} title="How does this work?">?</button>
      )}
      {sub && <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.16em', color: 'var(--mute)' }}>· {sub}</span>}
    </div>
  );
}

// ── League News form — Breaking News / Classified Ad / Pin Quote / Special Edition
function NewsPostForm({ leagueId, setCommMsg, isMobile = false }) {
  const [postType,     setPostType]     = useState('breaking_news');
  const [headline,     setHeadline]     = useState('');
  const [bulletsText,  setBulletsText]  = useState('');
  const [quoteText,    setQuoteText]    = useState('');
  const [quoteAuthor,  setQuoteAuthor]  = useState('');
  const [posting,      setPosting]      = useState(false);
  const [generating,   setGenerating]   = useState(false);

  const POST_TYPES = [
    { key: 'breaking_news', label: 'BREAKING NEWS' },
    { key: 'classified',    label: 'CLASSIFIED AD'  },
    { key: 'pin_quote',     label: 'PIN QUOTE'      },
  ];

  const handlePost = async () => {
    if (postType === 'pin_quote') {
      if (!quoteText.trim()) return;
      setPosting(true);
      const rows = [
        { league_id: leagueId, config_key: 'frontpage_pinned_quote',        config_value: quoteText.trim() },
        { league_id: leagueId, config_key: 'frontpage_pinned_quote_author', config_value: quoteAuthor.trim() || '' },
      ];
      const { error } = await supabase
        .from('league_config')
        .upsert(rows, { onConflict: 'league_id,config_key' });
      setPosting(false);
      if (error) {
        setCommMsg({ type: 'err', text: `Failed to pin quote: ${error.message}` });
      } else {
        setCommMsg({ type: 'ok', text: 'Quote pinned — visible on the Frontpage.' });
        setQuoteText('');
        setQuoteAuthor('');
      }
      return;
    }

    if (!headline.trim()) return;
    setPosting(true);
    const bullets = bulletsText.split('\n').map(l => l.trim()).filter(Boolean);
    const { error } = await supabase.from('gazette_entries').insert({
      league_id:    leagueId,
      entry_type:   postType,
      headline:     headline.trim(),
      bullets:      bullets.length ? bullets : null,
      published_at: new Date().toISOString(),
    });
    setPosting(false);
    if (error) {
      setCommMsg({ type: 'err', text: `Failed to post: ${error.message}` });
    } else {
      setCommMsg({ type: 'ok', text: postType === 'classified' ? 'Classified posted.' : 'News posted to league activity.' });
      setHeadline('');
      setBulletsText('');
    }
  };

  const handleGenerateEdition = async () => {
    setGenerating(true);
    const { error } = await supabase.functions.invoke('generate-frontpage-edition', {
      body: { league_id: leagueId },
    });
    setGenerating(false);
    if (error) {
      const msg = error.message ?? '';
      if (msg.includes('429') || msg.includes('RATE_LIMIT')) {
        setCommMsg({ type: 'err', text: 'Edition generated recently — wait 4h before triggering again.' });
      } else {
        setCommMsg({ type: 'err', text: `Generation failed: ${msg}` });
      }
    } else {
      setCommMsg({ type: 'ok', text: 'Special edition generated — refresh the Frontpage tab to see it.' });
    }
  };

  const pad = isMobile ? '0 14px' : '16px 24px';
  const canPost = postType === 'pin_quote' ? !!quoteText.trim() : !!headline.trim();

  return (
    <div style={{ padding: pad, display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Type selector */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--rule)' }}>
        {POST_TYPES.map(t => (
          <button
            key={t.key}
            onClick={() => setPostType(t.key)}
            style={{
              padding: '6px 12px', border: 'none', cursor: 'pointer',
              fontFamily: MONO, fontSize: 9, letterSpacing: '.16em',
              background: postType === t.key ? 'var(--ink-3)' : 'transparent',
              color: postType === t.key ? 'var(--paper)' : 'var(--mute)',
              borderBottom: postType === t.key ? '2px solid var(--danger)' : '2px solid transparent',
              marginBottom: -1,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Fields */}
      {postType === 'pin_quote' ? (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.2em', color: 'var(--paper)' }}>QUOTE TEXT</span>
            <input
              type="text"
              placeholder="e.g. May the best manager win — good luck everyone"
              value={quoteText}
              onChange={e => setQuoteText(e.target.value)}
              maxLength={280}
              style={{ ...inputStyle, colorScheme: 'dark' }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.2em', color: 'var(--mute)' }}>AUTHOR (OPTIONAL)</span>
            <input
              type="text"
              placeholder="e.g. The Commissioner"
              value={quoteAuthor}
              onChange={e => setQuoteAuthor(e.target.value)}
              maxLength={60}
              style={{ ...inputStyle, colorScheme: 'dark' }}
            />
          </div>
        </>
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.2em', color: 'var(--paper)' }}>
              {postType === 'classified' ? 'AD HEADLINE' : 'HEADLINE'}
            </span>
            <input
              type="text"
              placeholder={postType === 'classified'
                ? 'e.g. WANTED: Left winger, experienced. Contact the market.'
                : 'e.g. Transfer window opens Monday — plan your moves'}
              value={headline}
              onChange={e => setHeadline(e.target.value)}
              maxLength={200}
              style={{ ...inputStyle, colorScheme: 'dark' }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.2em', color: 'var(--mute)' }}>
              DETAILS · ONE LINE EACH (OPTIONAL)
            </span>
            <textarea
              placeholder={postType === 'classified'
                ? 'Budget: €4.5M\nPreference: 4-3-3 roles'
                : 'Deadline: Sunday 22:00\nUse the market to find value\nTop tip: check injuries'}
              value={bulletsText}
              onChange={e => setBulletsText(e.target.value)}
              rows={3}
              style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5, colorScheme: 'dark' }}
            />
          </div>
        </>
      )}

      <button
        onClick={handlePost}
        disabled={posting || !canPost}
        style={{
          ...btnBase, fontSize: 11,
          background: posting || !canPost ? 'var(--ink-3)' : 'var(--danger)',
          color: posting || !canPost ? 'var(--mute)' : 'var(--paper)',
          cursor: posting || !canPost ? 'not-allowed' : 'pointer',
          alignSelf: 'flex-start',
        }}
      >
        {posting ? 'POSTING…' : postType === 'pin_quote' ? 'PIN QUOTE →' : 'POST TO LEAGUE →'}
      </button>

      {/* Special Edition generator */}
      <div style={{ borderTop: '1px solid var(--rule)', paddingTop: 14, marginTop: 4 }}>
        <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.22em', color: 'var(--mute)', marginBottom: 8 }}>
          AI SPECIAL EDITION · FORZA TIMES
        </div>
        <p style={{ fontFamily: MONO, fontSize: 10, color: 'var(--mute)', lineHeight: 1.5, marginBottom: 10 }}>
          Generate a fresh AI-written edition now — headline, hot take, wooden spoon, transfer rumour. Shows immediately on the Frontpage. 4h rate limit.
        </p>
        <button
          onClick={handleGenerateEdition}
          disabled={generating}
          style={{
            ...btnBase, fontSize: 11,
            background: generating ? 'var(--ink-3)' : 'var(--gold)',
            color: generating ? 'var(--mute)' : 'var(--ink)',
            cursor: generating ? 'not-allowed' : 'pointer',
            alignSelf: 'flex-start',
          }}
        >
          {generating ? 'GENERATING…' : 'GENERATE SPECIAL EDITION →'}
        </button>
      </div>
    </div>
  );
}

// ── Mobile accordion wizard step header ───────────────────────────────────────
function MobStepHeader({ n, label, state, onClick, summary }) {
  const tone = state === 'done' ? 'var(--positive)' : state === 'active' ? 'var(--cyan)' : 'var(--mute)';
  return (
    <button onClick={onClick} style={{
      background: 'transparent', border: 0, padding: '12px 16px', width: '100%',
      cursor: state === 'todo' ? 'not-allowed' : 'pointer',
      display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
      borderBottom: '1px solid var(--rule)',
    }}>
      <span style={{
        width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
        border: `1.5px solid ${tone}`,
        background: state === 'done' ? tone : 'transparent',
        color: state === 'done' ? 'var(--ink)' : tone,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: MONO, fontSize: 10, fontWeight: 600,
      }}>{state === 'done' ? '✓' : n}</span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
        <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '.22em', color: tone }}>STEP {n} · {label}</span>
        {summary && <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.16em', color: 'var(--mute)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{summary}</span>}
      </div>
      <span style={{ color: tone, fontFamily: MONO, fontSize: 14 }}>{state === 'active' ? '−' : '+'}</span>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Feedback message
// ─────────────────────────────────────────────────────────────────────────────
function CommMsg({ msg, onDismiss }) {
  if (!msg) return null;
  const ok = msg.type === 'ok';
  return (
    <div style={{
      margin: '12px 16px 0', padding: '10px 14px',
      background: ok ? 'rgba(34,197,94,.08)' : 'rgba(239,68,68,.08)',
      border: `1px solid ${ok ? 'rgba(34,197,94,.3)' : 'rgba(239,68,68,.3)'}`,
      color: ok ? 'var(--positive)' : 'var(--danger)',
      fontFamily: BODY, fontSize: 12,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
    }}>
      <span>{msg.text}</span>
      <button onClick={onDismiss} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', opacity: 0.6, fontSize: 14 }}>✕</button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Root export
// ─────────────────────────────────────────────────────────────────────────────
export default function CommissionerPanel({ commissioner, leagueId, tournamentId, windowType = null, memberCount = 0, leagueName = 'LEAGUE', league = null }) {
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 1024);
  const [helpModal, setHelpModal] = useState(null); // null | 'commissioner' | 'lifecycle'
  const [mobKnockoutDeadline, setMobKnockoutDeadline] = useState('');

  // Mirror of LifecycleOps state — needed by the mobile knockout draft IIFE below.
  const [keepSubmissionCount, setKeepSubmissionCount] = useState(null);
  const [groupStageStarted,   setGroupStageStarted]   = useState(false);

  const _mobAllocDone         = !!(league?.cup_phase && league.cup_phase !== 'pre_cup');
  const _mobKnockoutAllocDone = ['pre_elimination', 'round_of_16', 'quarter_final', 'semi_final', 'final'].includes(league?.cup_phase);

  // Emergency transfers — shared state/handlers across desktop LifecycleOps grid
  // and the mobile lifecycle cards below. Called unconditionally (Rules of Hooks)
  // even though it's only rendered on one of the two layouts per render.
  const { activeFreeWindow, openFreeWindow, closeFreeWindow } = useFreeTransferWindow(leagueId, commissioner);
  // Free transfers config — same dual-call pattern as useFreeTransferWindow above.
  const { freeTransfers: mobFreeTransfers, toggleFreeTransfers: mobToggleFreeTransfers } = useFreeTransfersConfig(leagueId, commissioner);

  useEffect(() => {
    if (!_mobAllocDone || _mobKnockoutAllocDone || !tournamentId) { setGroupStageStarted(false); return; }
    (async () => {
      const { data: mds } = await supabase.from('matchday_deadlines').select('matchday_id').eq('tournament_id', tournamentId);
      const mdIds = (mds ?? []).map(r => r.matchday_id);
      if (!mdIds.length) { setGroupStageStarted(false); return; }
      const { count } = await supabase.from('fixtures').select('id', { count: 'exact', head: true })
        .eq('tournament_id', tournamentId).in('matchday_id', mdIds).lte('kickoff_at', new Date().toISOString());
      setGroupStageStarted((count ?? 0) > 0);
    })();
  }, [_mobAllocDone, _mobKnockoutAllocDone, tournamentId]);

  useEffect(() => {
    if (league?.cup_phase !== 'group_stage' || !leagueId) { setKeepSubmissionCount(null); return; }
    supabase.from('knockout_keep_submissions').select('user_id', { count: 'exact', head: true })
      .eq('league_id', leagueId)
      .then(({ count }) => setKeepSubmissionCount(count ?? 0));
  }, [league?.cup_phase, leagueId]);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 1024);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const { commLoading, commMsg, setCommMsg } = commissioner;

  if (isMobile) {
    // ── Mobile layout ────────────────────────────────────────────────────────
    const {
      windowOpensAt, setWindowOpensAt,
      windowClosesAt, setWindowClosesAt,
      windowTransfers, setWindowTransfers,
      openTransferWindow, closeTransferWindow,
      draftDeadline, setDraftDeadline, setLeagueDraftDeadline,
      triggerDraftAllocation,
      scoreFixtureId, setScoreFixtureId, triggerScores,
    } = commissioner;

    const mobInput = { ...inputStyle };
    const mobBtn = { ...btnBase, width: '100%', fontSize: 12 };

    // Allocation state (mobile)
    const mobNow = new Date();
    const mobDeadlinePassed = league?.draft_deadline && new Date(league.draft_deadline) <= mobNow;
    const mobAllocationDone = league?.cup_phase && league.cup_phase !== 'pre_cup';

    // AUDIT-58-A3: derive live status labels for mobile cards (mirrors desktop LifecycleOps).
    // See the desktop `isDeadlineControlled` definition above for why this must NOT be
    // derived from `windowType` — it reflects the currently-active window's type, not
    // whether this league uses the matchday-deadline lock system at all.
    const mobIsDeadlineControlled = !!tournamentId;
    const mobTwStatus = mobIsDeadlineControlled
                      ? (league?.transfers_open ? 'OPEN (OVERRIDE)' : 'AUTO-MANAGED')
                      : league?.transfers_open ? 'OPEN' : 'CLOSED';
    const mobTwTone   = mobIsDeadlineControlled
                      ? (league?.transfers_open ? 'var(--positive)' : 'var(--warn)')
                      : league?.transfers_open ? 'var(--positive)' : 'var(--danger)';

    const mobDraftStatus = !league?.draft_deadline ? 'NOT SET'
                         : mobAllocationDone       ? 'ALLOCATED'
                         : mobDeadlinePassed        ? 'DEADLINE PASSED'
                         :                           'DEADLINE SET';
    const mobDraftTone   = !league?.draft_deadline ? 'var(--mute)'
                         : mobAllocationDone       ? 'var(--positive)'
                         : mobDeadlinePassed        ? 'var(--warn)'
                         :                           'var(--positive)';

    // Emergency transfers status labels (state/handlers from the top-level hook above).
    const mobEtStatus = activeFreeWindow ? 'ON' : 'OFF';
    const mobEtTone   = activeFreeWindow ? 'var(--positive)' : 'var(--mute)';

    return (
      <div style={{ flex: 1, overflow: 'auto', background: 'var(--ink)', display: 'flex', flexDirection: 'column' }}>
        <HelpOverlay topic={helpModal} onClose={() => setHelpModal(null)} />
        <CommMsg msg={commMsg} onDismiss={() => setCommMsg(null)} />
        <MobSeasonStepper league={league} memberCount={memberCount} windowType={windowType} onHelp={() => setHelpModal('commissioner')} />

        {/* Lifecycle ops (mobile) — moved above bets; cards have margin: 0 14px built in */}
        <MobSectionHeader label="LIFECYCLE OPERATIONS" sub="SEASON CONTROLS" tone="var(--purple)" onHelp={() => setHelpModal('lifecycle')} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 80 }}>
          <div data-tour="comm-transfer-window">
          <MobLifecycleCard title="TRANSFER WINDOW" status={mobTwStatus} tone={mobTwTone} when="Deadline-controlled leagues auto-open between gameweeks. Toggle to override. Combine with FREE TRANSFERS to also remove the per-round limit.">
            {tournamentId ? (
              <div style={{ padding: '8px 10px', background: 'var(--ink)', border: '1px solid var(--rule)', fontFamily: BODY, fontSize: 10, color: 'var(--mute)', lineHeight: 1.5 }}>
                <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.2em', color: 'var(--warn)' }}>AUTO-MANAGED · </span>
                Opens and closes automatically based on matchday deadlines. Toggle to temporarily override.
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '.2em', color: 'var(--paper)' }}>OPENS</span>
                  <input type="datetime-local" value={windowOpensAt} onChange={e => setWindowOpensAt(e.target.value)} style={{ ...mobInput, colorScheme: 'dark', fontSize: 11 }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '.2em', color: 'var(--paper)' }}>CLOSES</span>
                  <input type="datetime-local" value={windowClosesAt} onChange={e => setWindowClosesAt(e.target.value)} style={{ ...mobInput, colorScheme: 'dark', fontSize: 11 }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.2em', color: 'var(--mute)' }}>LIMIT · BLANK = UNLIMITED</span>
                  <input type="number" min="1" value={windowTransfers} onChange={e => setWindowTransfers(e.target.value)} placeholder="e.g. 5" style={mobInput} />
                </div>
              </>
            )}
            <ToggleSwitch
              checked={!!league?.transfers_open}
              onChange={league?.transfers_open
                ? () => { if (window.confirm('Close the transfer window immediately?')) closeTransferWindow(); }
                : openTransferWindow}
              disabled={commLoading}
              labelOn="WINDOW OPEN"
              labelOff="WINDOW CLOSED"
            />
          </MobLifecycleCard>
          </div>

          {/* Free transfers (mobile) — Classic leagues only */}
          {league?.format !== 'noduplicate' && (
          <MobLifecycleCard title="FREE TRANSFERS" status={mobFreeTransfers ? 'ON' : 'OFF'} tone={mobFreeTransfers ? 'var(--positive)' : 'var(--mute)'} when="Enable when you want unlimited transfers — e.g. post-draft building. Disable to restore per-round limits.">
            {mobFreeTransfers && (
              <div style={{ padding: '8px 10px', background: 'rgba(24,201,107,0.06)', border: '1px solid rgba(24,201,107,0.25)', fontFamily: BODY, fontSize: 10, color: 'var(--positive)', lineHeight: 1.5 }}>
                <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.2em' }}>ON · </span>
                Transfer limit lifted — managers can buy freely while the window is open.
              </div>
            )}
            <ToggleSwitch
              checked={mobFreeTransfers}
              onChange={() => mobToggleFreeTransfers(!mobFreeTransfers)}
              disabled={commLoading}
              labelOn="FREE TRANSFERS ON"
              labelOff="FREE TRANSFERS OFF"
            />
          </MobLifecycleCard>
          )}

          {mobIsDeadlineControlled && (
          <div data-tour="comm-emergency-transfers">
          <MobLifecycleCard title="EMERGENCY TRANSFERS" status={mobEtStatus} tone={mobEtTone} when="Genuine emergencies only — e.g. reversing a manager's mistaken transfer or unblocking someone hit by a bug. For routine schedule fixes, use TRANSFER WINDOW OVERRIDE instead.">
            <div style={{ padding: '8px 10px', background: 'rgba(240,180,0,0.06)', border: '1px solid rgba(240,180,0,0.25)', fontFamily: BODY, fontSize: 10, color: 'var(--warn)', lineHeight: 1.5 }}>
              <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.2em' }}>CAUTION · </span>
              Managers can sub in players who already scored this round, or sub out players who already conceded points. Past points are NOT recalculated. Turn off as soon as the issue is resolved.
            </div>
            {activeFreeWindow && (
              <div style={{ padding: '8px 10px', background: 'rgba(24,201,107,0.06)', border: '1px solid rgba(24,201,107,0.25)', fontFamily: BODY, fontSize: 10, color: 'var(--positive)', lineHeight: 1.5 }}>
                <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.2em' }}>ON · </span>
                Auto-closes {new Date(activeFreeWindow.closes_at).toLocaleString()}
              </div>
            )}
            <ToggleSwitch
              checked={!!activeFreeWindow}
              onChange={activeFreeWindow ? closeFreeWindow : openFreeWindow}
              disabled={commLoading}
              labelOn="EMERGENCY TRANSFERS ON"
              labelOff="EMERGENCY TRANSFERS OFF"
            />
          </MobLifecycleCard>
          </div>
          )}

          {(!league || league.format === 'noduplicate') && (
          <div data-tour="comm-draft-deadline">
          <MobLifecycleCard title="DRAFT" status={mobDraftStatus} tone={mobDraftTone} when="After all picks. Before GW1.">
            {mobAllocationDone ? (
              <div style={{ padding: '8px 10px', background: 'var(--ink)', border: '1px solid var(--rule)', fontFamily: BODY, fontSize: 10, color: 'var(--positive)', lineHeight: 1.5 }}>
                ✓ Allocation complete — squads are live
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.2em', color: 'var(--mute)' }}>DEADLINE (INFORMATIONAL)</span>
                  <input type="datetime-local" value={draftDeadline} onChange={e => setDraftDeadline(e.target.value)} style={mobInput} />
                </div>
                <button onClick={setLeagueDraftDeadline} disabled={commLoading} style={{ ...mobBtn, background: 'transparent', color: 'var(--paper)', border: '1px solid var(--rule)' }}>SET DEADLINE</button>
                <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.18em', color: 'var(--mute)', lineHeight: 1.6 }}>15 PLAYERS / MGR · €100M · GK≤2 DEF≤5 MID≤5 FWD≤3</div>
                <button
                  onClick={() => { if (window.confirm('Run allocation for all managers? This cannot be undone without a manual reset.')) triggerDraftAllocation(); }}
                  disabled={commLoading}
                  style={{ ...mobBtn, background: 'var(--gold)', color: 'var(--ink)' }}
                >RUN ALLOCATION ↯</button>
              </>
            )}
          </MobLifecycleCard>
          </div>
          )}

          {/* Knockout Draft — disabled: group→knockout uses normal transfer window */}
          {KNOCKOUT_DRAFT_ENABLED && (!league || (league.format === 'noduplicate' && (
            (league.cup_phase && league.cup_phase !== 'pre_cup') ||
            !!league.knockout_draft_deadline
          ))) && (() => {
            const mobKnockoutAllocationDone = ['pre_elimination', 'round_of_16', 'quarter_final', 'semi_final', 'final'].includes(league?.cup_phase);
            const mobKnockoutStatus = mobKnockoutAllocationDone ? 'ALLOCATED'
              : league?.knockout_draft_deadline ? 'DEADLINE SET'
              : 'NOT SET';
            const mobKnockoutTone = mobKnockoutAllocationDone ? 'var(--positive)'
              : league?.knockout_draft_deadline ? 'var(--positive)'
              : 'var(--warn)';
            return (
              <div data-tour="comm-knockout-draft">
              <MobLifecycleCard title="KNOCKOUT DRAFT" status={mobKnockoutStatus} tone={mobKnockoutTone} when="After group stage allocation. Before first knockout match.">
                {mobKnockoutAllocationDone ? (
                  <div style={{ padding: '8px 10px', background: 'var(--ink)', border: '1px solid var(--rule)', fontFamily: BODY, fontSize: 10, color: 'var(--positive)', lineHeight: 1.5 }}>
                    ✓ Knockout squads allocated
                  </div>
                ) : !groupStageStarted ? (
                  <div style={{ padding: '8px 10px', background: 'var(--ink)', border: '1px solid var(--rule)', fontFamily: BODY, fontSize: 10, color: 'var(--mute)', lineHeight: 1.5 }}>
                    Locked — group stage fixtures have not kicked off yet
                  </div>
                ) : (
                  <>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '.2em', color: 'var(--paper)' }}>KNOCKOUT DEADLINE</span>
                      <input type="datetime-local" value={mobKnockoutDeadline} onChange={e => setMobKnockoutDeadline(e.target.value)} style={{ ...mobInput, colorScheme: 'dark', fontSize: 11 }} />
                    </div>
                    {keepSubmissionCount !== null && (
                      <div style={{ padding: '6px 8px', background: 'rgba(160,108,255,0.07)', border: '1px solid rgba(160,108,255,0.25)', fontFamily: "'JetBrains Mono',monospace", fontSize: 9, letterSpacing: '.14em', color: '#a855f7' }}>
                        🛡️ {keepSubmissionCount} manager{keepSubmissionCount !== 1 ? 's' : ''} have protected players
                      </div>
                    )}
                    <button
                      onClick={() => {
                        if (!window.confirm('Run knockout-phase draft allocation? This cannot be undone.')) return;
                        commissioner.commAction(async () => {
                          if (mobKnockoutDeadline) {
                            await supabase.from('leagues').update({ knockout_draft_deadline: new Date(mobKnockoutDeadline).toISOString() }).eq('id', leagueId);
                          }
                          const { error } = await supabase.functions.invoke('run-draft-lottery', {
                            body: { league_id: leagueId, phase: 'knockout' },
                          });
                          if (error) throw new Error(error.message);
                          setCommMsg({ type: 'ok', text: 'Knockout draft allocation complete.' });
                        });
                      }}
                      disabled={commLoading}
                      style={{ ...mobBtn, background: 'var(--gold)', color: 'var(--ink)' }}
                    >RUN KNOCKOUT ALLOCATION ↯</button>
                  </>
                )}
              </MobLifecycleCard>
              </div>
            );
          })()}

          <div data-tour="comm-score-recalc">
          <MobLifecycleCard title="SCORE RECALCULATION" status="UTILITY" tone="var(--mute)" when="Only if a match shows incorrect points.">
            <div style={{ padding: '8px 10px', background: 'var(--ink)', border: '1px solid var(--rule)', fontFamily: BODY, fontSize: 10, color: 'var(--mute)', lineHeight: 1.6, marginBottom: 8 }}>
              <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.18em', color: 'var(--positive)' }}>AUTO · </span>
              Scores run automatically after every match. No action needed under normal conditions.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '.2em', color: 'var(--paper)' }}>FIXTURE ID</span>
              <input type="text" value={scoreFixtureId} onChange={e => setScoreFixtureId(e.target.value)} placeholder="e.g. f-1219435455" style={mobInput} />
            </div>
            <button onClick={triggerScores} disabled={commLoading || !scoreFixtureId} style={{ ...mobBtn, background: commLoading || !scoreFixtureId ? 'var(--ink-3)' : 'var(--warn)', color: commLoading || !scoreFixtureId ? 'var(--mute)' : 'var(--ink)', cursor: commLoading || !scoreFixtureId ? 'not-allowed' : 'pointer' }}>RECALCULATE ↯</button>
          </MobLifecycleCard>
          </div>
        </div>

        {/* H2H Calendar (mobile) — only for Draft + H2H leagues */}
        {league?.h2h_enabled && (
          <>
            <MobSectionHeader label="H2H CALENDAR" sub="SCHEDULE MANAGEMENT" tone="var(--gold)" />
            <div style={{ padding: '0 14px' }}>
              <H2HCalendarSection leagueId={leagueId} tournamentId={tournamentId} isMobile />
            </div>
          </>
        )}

        {/* League news (mobile) */}
        <MobSectionHeader label="LEAGUE NEWS" sub="POST TO ACTIVITY FEED" tone="var(--danger)" />
        <NewsPostForm leagueId={leagueId} setCommMsg={setCommMsg} isMobile />

      </div>
    );
  }

  // ── Desktop layout ──────────────────────────────────────────────────────────
  return (
    <div style={{ flex: 1, overflow: 'auto', background: 'var(--ink)', display: 'flex', flexDirection: 'column' }}>
      <HelpOverlay topic={helpModal} onClose={() => setHelpModal(null)} />
      <CommMsg msg={commMsg} onDismiss={() => setCommMsg(null)} />

      {/* Zone A — Season stepper */}
      <SeasonStepper
        leagueName={leagueName}
        memberCount={memberCount}
        league={league}
        windowType={windowType}
        onHelp={() => setHelpModal('commissioner')}
      />

      {/* Zone B — Lifecycle ops (moved above bets) */}
      <LifecycleOps
        commissioner={commissioner}
        leagueId={leagueId}
        tournamentId={tournamentId}
        league={league}
        onHelp={() => setHelpModal('lifecycle')}
      />

      {/* League News — breaking news form */}
      <HubSectionLabel label="LEAGUE NEWS" sub="POST TO ACTIVITY FEED" tone="var(--danger)" />
      <NewsPostForm leagueId={leagueId} setCommMsg={setCommMsg} />

    </div>
  );
}
