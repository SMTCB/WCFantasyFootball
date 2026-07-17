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

const _HUES = ['#00B4D8','#E0A800','#A855F7','#22C55E','#F59E0B','#34D399','#7DD3FC','#FB7185','#FCD34D','#C4B5FD','#67E8F9'];
function mgrHue(str = '') { let h = 0; for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) & 0xffff; return _HUES[h % _HUES.length]; }
const mgrMono = (u = '') => u.substring(0, 3).toUpperCase() || '???';

const BET_TYPES = [
  { id: 'top-scorer',   label: 'TOP SCORER',   glyph: '◉', tone: 'var(--cyan)',     templateId: 'top_scorer',   hint: 'Who scores the most goals across the fixture / gameweek?', body: 'Auto-resolves at final whistle. Tie-break: assists → minutes.' },
  { id: 'match-result', label: 'MATCH RESULT', glyph: '◈', tone: 'var(--positive)', templateId: 'match_result', hint: 'Predict the outcome of a single fixture.', body: 'Options are auto-generated: HOME · DRAW · AWAY. Resolves at FT.' },
  { id: 'clean-sheet',  label: 'CLEAN SHEET',  glyph: '🧤', tone: 'var(--cyan)',    templateId: 'clean_sheet',  hint: 'Pick a team to keep a clean sheet.', body: 'Select the teams in play. Managers pick one — commissioner resolves after the match.' },
];

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

function BetCardPreview({ betType, title, reward, closes, fixtureObj, players, blockPlayer }) {
  const meta = BET_TYPES.find(t => t.id === betType);
  if (!meta) {
    return (
      <div style={{ background: 'var(--ink)', border: '1px dashed var(--rule)', padding: '22px 18px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, color: 'var(--mute)' }}>
        <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '.22em' }}>NO BET YET</span>
        <span style={{ fontFamily: BODY, fontSize: 11, textAlign: 'center' }}>Choose a type to see the live preview.</span>
      </div>
    );
  }
  const options = betType === 'match-result'
    ? (fixtureObj ? [`${fixtureObj.home_team} Win`, 'DRAW', `${fixtureObj.away_team} Win`] : ['HOME', 'DRAW', 'AWAY'])
    : betType === 'top-scorer'
      ? players.slice(0, 4).map(p => typeof p === 'object' ? p.name : p.split(' (')[0])
      : blockPlayer ? [typeof blockPlayer === 'object' ? blockPlayer.name : blockPlayer.split(' (')[0]] : [];

  return (
    <div style={{ background: 'var(--ink)', border: '1px solid var(--rule)', borderLeft: `3px solid ${meta.tone}`, padding: '14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 22, height: 22, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: `${meta.tone}15`, border: `1px solid ${meta.tone}55`, fontFamily: DISPLAY, fontSize: 12, color: meta.tone }}>{meta.glyph}</span>
        <span style={{ fontFamily: DISPLAY, fontSize: 13, color: meta.tone, letterSpacing: '-0.01em' }}>{meta.label}</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.18em', color: 'var(--positive)', padding: '2px 6px', border: '1px solid rgba(34,197,94,.33)', background: 'rgba(34,197,94,.08)' }}>+{reward} PTS</span>
      </div>
      <div style={{ fontFamily: BODY, fontSize: 12, color: 'var(--paper)', lineHeight: 1.45 }}>
        {title || <span style={{ color: 'var(--mute)' }}>(title pending)</span>}
      </div>
      {options.length > 0 && (
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {options.map(o => (
            <span key={o} style={{ padding: '4px 8px', fontFamily: DISPLAY, fontSize: 10, letterSpacing: '-0.01em', border: '1px solid var(--rule)', color: 'var(--paper)' }}>{o}</span>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 2 }}>
        <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.18em', color: 'var(--mute)' }}>● LOCKS {closes || '—'}</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.18em', color: 'var(--cyan)' }}>MAKE PICK →</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Create Bet Wizard (Zone B left)
// ─────────────────────────────────────────────────────────────────────────────
function CreateBetWizard({ onPublish, commLoading, memberCount, tournamentId, isMobile = false }) {
  const [step,        setStep]   = useState(1);
  const [betType,     setBetType] = useState(null);
  const [fixture,     setFixture] = useState('');      // single fixture id (match-result / player-block)
  const [selectedFixtures, setSelectedFixtures] = useState([]); // multi-fixture ids for top-scorer (max 4)
  const [players,     setPlayers] = useState([]);      // selected player objects for top-scorer
  const [blockPlayer, setBlock]   = useState(null);    // player object for player-block
  const [reward,      setReward]  = useState(5);
  const [closes,      setCloses]  = useState('');
  const [title,       setTitle]   = useState('');

  // DB data
  const [dbFixtures,    setDbFixtures]    = useState([]);  // next-gameday scheduled fixtures
  const [allDbFixtures, setAllDbFixtures] = useState([]);  // all future scheduled fixtures
  const [allPlayers,    setAllPlayers]    = useState([]);  // all players in tournament
  const [dataLoading,   setDataLoading]   = useState(false);

  // Modal state
  const [showPlayerModal,  setShowPlayerModal]  = useState(false);
  const [playerSearch,     setPlayerSearch]     = useState('');
  const [showFixtureModal, setShowFixtureModal] = useState(false);
  const [fixtureSearch,    setFixtureSearch]    = useState('');

  // Load real fixtures + players from DB when tournamentId is available
  useEffect(() => {
    if (!tournamentId) return;
    setDataLoading(true);
    const now = new Date().toISOString();
    Promise.all([
      supabase.from('fixtures')
        .select('id, home_team, away_team, kickoff_at')
        .eq('tournament_id', tournamentId)
        .eq('status', 'scheduled')
        .gte('kickoff_at', now)
        .order('kickoff_at', { ascending: true })
        .limit(40),
      supabase.from('players')
        .select('id, name, position, club')
        .eq('tournament_id', tournamentId)
        .eq('is_active', true)
        .in('position', ['FWD', 'MID', 'DEF', 'GK'])
        .order('price', { ascending: false })
        .limit(300),
    ]).then(([{ data: fx }, { data: pl }]) => {
      const allFx = fx || [];
      // Group to next gameday: fixtures within 7 days of the first one
      let nextGameday = allFx;
      if (allFx.length > 0) {
        const first = new Date(allFx[0].kickoff_at).getTime();
        const cutoff = first + 7 * 24 * 60 * 60 * 1000;
        nextGameday = allFx.filter(f => new Date(f.kickoff_at).getTime() <= cutoff);
      }
      setDbFixtures(nextGameday);
      setAllDbFixtures(allFx);

      const allPl = pl || [];
      setAllPlayers(allPl);
      // Default top-scorer pool: top 5 FWD+MID by price
      setPlayers(allPl.filter(p => ['FWD', 'MID'].includes(p.position)).slice(0, 5));
    }).catch(e => console.error('[CreateBetWizard] data load error:', e))
      .finally(() => setDataLoading(false));
  }, [tournamentId]);

  const typeMeta    = BET_TYPES.find(t => t.id === betType) || null;
  const fixtureMeta = allDbFixtures.find(f => f.id === fixture) || null;

  const autoTitle = (() => {
    if (!typeMeta) return '';
    if (betType === 'top-scorer') {
      const fxObjs = allDbFixtures.filter(f => selectedFixtures.includes(f.id));
      const scope = fxObjs.length === 1
        ? `${fxObjs[0].home_team} vs ${fxObjs[0].away_team}`
        : fxObjs.length > 1 ? `${fxObjs.length} matches` : 'Matchday';
      return `Top scorer · ${scope}`;
    }
    if (betType === 'match-result') return fixtureMeta ? `Result · ${fixtureMeta.home_team} vs ${fixtureMeta.away_team}` : 'Match result';
    if (betType === 'player-block') return blockPlayer ? `Block · ${blockPlayer.name}` : 'Player block';
    return '';
  })();
  const computedTitle = title || autoTitle;

  const canStep2 = !!betType;
  const canStep3 = betType === 'top-scorer'
    ? players.length >= 2
    : !!fixture && (betType !== 'player-block' || !!blockPlayer);
  const canStep4 = !!reward && !!closes;

  const reset = () => {
    setStep(1); setBetType(null); setFixture(''); setBlock(null);
    setSelectedFixtures([]);
    setReward(5); setCloses(''); setTitle('');
    setPlayers(allPlayers.filter(p => ['FWD', 'MID'].includes(p.position)).slice(0, 5));
  };

  const handlePublish = () => {
    let options = [];
    let scopeType = 'match';
    let scopeRef  = null;

    if (betType === 'match-result') {
      options = [
        { key: `${fixture}_home`, label: `${fixtureMeta?.home_team || 'Home'} Win`, meta: {} },
        { key: `${fixture}_draw`, label: 'Draw', meta: {} },
        { key: `${fixture}_away`, label: `${fixtureMeta?.away_team || 'Away'} Win`, meta: {} },
      ];
      scopeRef = fixture || null;
    } else if (betType === 'top-scorer') {
      options   = players.map(p => ({ key: p.id, label: p.name, meta: { club: p.club, pos: p.position } }));
      scopeType = 'matchday';
      scopeRef  = selectedFixtures.join(',') || null;
    } else if (betType === 'player-block') {
      options  = blockPlayer
        ? [{ key: blockPlayer.id, label: blockPlayer.name, meta: { club: blockPlayer.club, pos: blockPlayer.position } }]
        : [];
      scopeRef = fixture || null;
    }

    onPublish({
      title:       computedTitle,
      prompt:      computedTitle,
      deadline:    closes,
      rewardValue: String(reward),
      scopeType,
      scopeRef,
      templateId:  typeMeta.templateId,
      options,
    });
    reset();
  };

  // Shared fixture picker (single-select) used by match-result and player-block
  const SingleFixturePicker = ({ accentColor = 'var(--cyan)' }) => (
    <WizField label="Fixture · Next gameday" sub="Bet will resolve at this match's final whistle.">
      {dataLoading ? (
        <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--mute)', letterSpacing: '.18em' }}>LOADING FIXTURES…</div>
      ) : dbFixtures.length === 0 ? (
        <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--danger)', letterSpacing: '.16em', padding: '10px 0' }}>
          {allDbFixtures.length > 0 ? 'NO FIXTURES IN NEXT 7 DAYS — TRY A DIFFERENT ROUND' : 'NO UPCOMING SCHEDULED FIXTURES FOUND'}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {dbFixtures.map(f => {
            const picked = fixture === f.id;
            return (
              <button key={f.id} onClick={() => setFixture(f.id)} style={{
                textAlign: 'left', cursor: 'pointer',
                background: picked ? `${accentColor}15` : 'var(--ink)',
                border: picked ? `1px solid ${accentColor}` : '1px solid var(--rule)',
                padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10,
              }}>
                <span style={{ width: 12, height: 12, borderRadius: '50%', border: `1.5px solid ${picked ? accentColor : 'var(--rule)'}`, background: picked ? accentColor : 'transparent', flexShrink: 0 }} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
                  <span style={{ fontFamily: DISPLAY, fontSize: 12, color: 'var(--paper)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.home_team} vs {f.away_team}</span>
                  <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.14em', color: 'var(--mute)' }}>{fmtKickoff(f.kickoff_at)}</span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </WizField>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <HubSectionLabel
        label="CREATE BET"
        sub="A new prediction for the league"
        tone="var(--cyan)"
        right={
          <button onClick={reset} style={{ ...ghostBtn, fontSize: 9, padding: '5px 10px' }}>↻ RESET</button>
        }
      />

      {/* Step rail */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', borderBottom: '1px solid var(--rule)', background: 'var(--ink)', flexShrink: 0 }}>
        {[
          { n: 1, label: 'TYPE',    reached: true,     done: !!betType },
          { n: 2, label: 'CONFIG',  reached: canStep2, done: canStep3  },
          { n: 3, label: 'REWARD',  reached: canStep3, done: canStep4  },
          { n: 4, label: 'PUBLISH', reached: canStep4, done: false     },
        ].map(s => {
          const active = step === s.n;
          const railTone = !s.reached ? 'var(--mute)' : (active ? 'var(--cyan)' : (s.done ? 'var(--positive)' : 'var(--paper)'));
          return (
            <button key={s.n}
              disabled={!s.reached}
              onClick={() => s.reached && setStep(s.n)}
              style={{
                background: 'transparent',
                borderTop: 'none',
                borderBottom: active ? `2px solid ${railTone}` : '2px solid transparent',
                borderLeft: 'none',
                borderRight: s.n < 4 ? '1px solid var(--rule)' : 'none',
                padding: isMobile ? '10px 6px' : '14px 16px',
                cursor: s.reached ? 'pointer' : 'not-allowed',
                color: railTone,
                display: 'flex', alignItems: 'center', justifyContent: isMobile ? 'center' : 'flex-start', gap: isMobile ? 4 : 10,
              }}
            >
              <span style={{
                width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                border: `1.5px solid ${railTone}`,
                background: s.done ? railTone : 'transparent',
                color: s.done ? 'var(--ink)' : railTone,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: MONO, fontSize: 9, fontWeight: 600,
              }}>{s.done ? '✓' : s.n}</span>
              {isMobile ? (
                <span style={{ fontFamily: MONO, fontSize: 8, letterSpacing: '.14em', color: railTone }}>{s.label}</span>
              ) : (
                <span style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.22em', color: 'var(--mute)' }}>STEP {s.n}</span>
                  <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '.18em', color: railTone }}>{s.label}</span>
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Body: form left, live preview right (preview hidden on mobile) */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 300px', minHeight: 0, flex: 1 }}>
        <div style={{ padding: isMobile ? '16px 14px' : '22px 24px', display: 'flex', flexDirection: 'column', gap: 16, borderRight: isMobile ? 'none' : '1px solid var(--rule)', overflow: 'auto' }}>

          {/* ── Step 1: Bet type ── */}
          {step === 1 && (
            <>
              <WizHelp num="01" label="WHAT KIND OF BET?" hint="Each type uses a different resolution rule. Pick one — you can change it before publishing." />
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: 8 }}>
                {BET_TYPES.map(t => {
                  const picked = betType === t.id;
                  return (
                    <button key={t.id} onClick={() => setBetType(t.id)} style={{
                      textAlign: 'left', cursor: 'pointer',
                      background: picked ? `${t.tone}10` : 'var(--ink-2)',
                      border: picked ? `1px solid ${t.tone}` : '1px solid var(--rule)',
                      borderLeft: picked ? `3px solid ${t.tone}` : '3px solid transparent',
                      padding: isMobile ? '12px 14px' : '14px 16px',
                      display: 'flex', flexDirection: isMobile ? 'row' : 'column',
                      alignItems: isMobile ? 'center' : 'flex-start',
                      gap: isMobile ? 12 : 8,
                      minHeight: isMobile ? 0 : 140,
                    }}>
                      <span style={{ width: 30, height: 30, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: `${t.tone}18`, border: `1px solid ${t.tone}55`, fontFamily: DISPLAY, fontSize: 15, color: t.tone }}>{t.glyph}</span>
                      <span style={{ fontFamily: DISPLAY, fontSize: 14, letterSpacing: '-0.01em', color: 'var(--paper)' }}>{t.label}</span>
                      <span style={{ fontFamily: BODY, fontSize: 11, lineHeight: 1.4, color: 'var(--mute)' }}>{t.hint}</span>
                      <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.16em', color: t.tone, marginTop: 'auto' }}>{picked ? '● SELECTED' : 'CHOOSE →'}</span>
                    </button>
                  );
                })}
              </div>
              <NextBar onNext={() => setStep(2)} canNext={canStep2} hint={!betType ? 'Pick a bet type to continue.' : ''} />
            </>
          )}

          {/* ── Step 2: Configure ── */}
          {step === 2 && (
            <>
              <WizHelp num="02" label="CONFIGURE" hint={typeMeta?.body || 'Set up the bet details.'} />

              {/* Match Result: single fixture */}
              {betType === 'match-result' && (
                <>
                  <SingleFixturePicker accentColor="var(--cyan)" />
                  <div style={{ padding: '10px 12px', background: 'var(--ink)', border: '1px solid var(--rule)', fontFamily: BODY, fontSize: 11, lineHeight: 1.5, color: 'var(--mute)' }}>
                    <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.2em', color: 'var(--positive)' }}>● AUTO</span>{' '}
                    Options: <b style={{ color: 'var(--paper)' }}>{fixtureMeta?.home_team || 'HOME'} WIN · DRAW · {fixtureMeta?.away_team || 'AWAY'} WIN</b>
                  </div>
                </>
              )}

              {/* Top Scorer: multi-fixture scope + player pool */}
              {betType === 'top-scorer' && (
                <>
                  <WizField label={`Match scope · ${selectedFixtures.length}/4 selected`} sub="Goals count across these matches. Leave empty for the full matchday.">
                    {dataLoading ? (
                      <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--mute)', letterSpacing: '.18em' }}>LOADING FIXTURES…</div>
                    ) : dbFixtures.length === 0 ? (
                      <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--mute)', letterSpacing: '.16em', padding: '10px 0' }}>NO UPCOMING FIXTURES FOUND</div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {dbFixtures.map(f => {
                          const on     = selectedFixtures.includes(f.id);
                          const atMax  = !on && selectedFixtures.length >= 4;
                          return (
                            <button key={f.id} onClick={() => {
                              if (on) setSelectedFixtures(prev => prev.filter(x => x !== f.id));
                              else if (!atMax) setSelectedFixtures(prev => [...prev, f.id]);
                            }} style={{
                              textAlign: 'left', cursor: atMax ? 'not-allowed' : 'pointer',
                              background: on ? 'rgba(0,180,216,.08)' : 'var(--ink)',
                              border: on ? '1px solid var(--cyan)' : '1px solid var(--rule)',
                              padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 8,
                              opacity: atMax ? 0.4 : 1,
                            }}>
                              <span style={{ width: 14, height: 14, border: `1.5px solid ${on ? 'var(--cyan)' : 'var(--rule)'}`, background: on ? 'var(--cyan)' : 'transparent', flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: MONO, fontSize: 9, color: 'var(--ink)' }}>{on ? '✓' : ''}</span>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontFamily: DISPLAY, fontSize: 12, color: 'var(--paper)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.home_team} vs {f.away_team}</div>
                                <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)', letterSpacing: '.12em' }}>{fmtKickoff(f.kickoff_at)}</div>
                              </div>
                            </button>
                          );
                        })}
                        {selectedFixtures.length < 4 && (
                          <button onClick={() => setShowFixtureModal(true)} style={{
                            padding: '8px 10px', cursor: 'pointer', textAlign: 'left',
                            background: 'rgba(224,168,0,.04)', border: '1px dashed rgba(224,168,0,.4)',
                            color: 'var(--gold)', fontFamily: MONO, fontSize: 10, letterSpacing: '.14em',
                          }}>+ ADD MATCH FROM ANOTHER ROUND</button>
                        )}
                      </div>
                    )}
                  </WizField>

                  <WizField label={`Player pool · ${players.length}/8`} sub="Managers pick one. Click a chip to remove.">
                    <PlayerChipPool selected={players} onChange={setPlayers} onAddCustom={() => setShowPlayerModal(true)} />
                    {players.length < 2 && (
                      <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--danger)', letterSpacing: '.16em', marginTop: 6 }}>ADD AT LEAST 2 PLAYERS</div>
                    )}
                  </WizField>
                </>
              )}

              {/* Player Block: single player + single fixture */}
              {betType === 'player-block' && (
                <>
                  <WizField label="Block target" sub="Managers pick this player to block — if they flop, they earn points.">
                    {blockPlayer ? (
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '10px 12px', background: 'rgba(239,68,68,.06)', border: '1px solid rgba(239,68,68,.3)' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontFamily: DISPLAY, fontSize: 13, color: 'var(--danger)' }}>{blockPlayer.name}</div>
                          <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)', letterSpacing: '.14em' }}>{blockPlayer.club} · {blockPlayer.position}</div>
                        </div>
                        <button onClick={() => setBlock(null)} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>✕</button>
                      </div>
                    ) : (
                      <button onClick={() => setShowPlayerModal(true)} style={{
                        padding: '12px', cursor: 'pointer', width: '100%', textAlign: 'center',
                        background: 'rgba(239,68,68,.04)', border: '1px dashed rgba(239,68,68,.4)',
                        color: 'var(--danger)', fontFamily: MONO, fontSize: 10, letterSpacing: '.18em',
                      }}>SELECT PLAYER TO BLOCK →</button>
                    )}
                  </WizField>
                  <SingleFixturePicker accentColor="var(--danger)" />
                </>
              )}

              <NextBar
                onBack={() => setStep(1)}
                onNext={() => setStep(3)}
                canNext={canStep3}
                hint={
                  betType === 'top-scorer'
                    ? (players.length < 2 ? 'Add at least 2 players to continue.' : '')
                    : !fixture
                      ? 'Pick a fixture to continue.'
                      : (betType === 'player-block' && !blockPlayer ? 'Select a block target too.' : '')
                }
              />
            </>
          )}

          {/* ── Step 3: Reward ── */}
          {step === 3 && (
            <>
              <WizHelp num="03" label="HOW MUCH IS IT WORTH?" hint="Reward in points. Tougher bets pay more. Closes-at locks picks; after that no manager can change." />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <WizField label="Reward · base points" sub="Awarded to every manager who gets it right.">
                  <RewardStepper value={reward} onChange={setReward} />
                </WizField>
                <WizField label="Picks close at" sub="Set before the first kickoff.">
                  <input type="datetime-local" value={closes} onChange={e => setCloses(e.target.value)} style={inputStyle} />
                </WizField>
              </div>
              <WizField label="Bet title" sub={`Shown in BETS tab. Leave blank to use: "${autoTitle}"`}>
                <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder={autoTitle} style={inputStyle} />
              </WizField>
              <NextBar onBack={() => setStep(2)} onNext={() => setStep(4)} canNext={canStep4} />
            </>
          )}

          {/* ── Step 4: Publish ── */}
          {step === 4 && (
            <>
              <WizHelp num="04" label="REVIEW & PUBLISH" hint="The preview on the right is exactly what every manager will see in the BETS tab. Publishing notifies the league." />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <SummaryRow k="TYPE"    v={typeMeta?.label} />
                {betType !== 'top-scorer' && fixtureMeta && (
                  <SummaryRow k="FIXTURE" v={`${fixtureMeta.home_team} vs ${fixtureMeta.away_team}`} sub={fmtKickoff(fixtureMeta.kickoff_at)} />
                )}
                {betType === 'top-scorer' && (
                  <>
                    <SummaryRow k="PLAYER POOL" v={`${players.length} players`} sub={players.map(p => p.name).join(', ')} />
                    <SummaryRow k="MATCH SCOPE" v={selectedFixtures.length === 0 ? 'Full matchday' : `${selectedFixtures.length} match${selectedFixtures.length > 1 ? 'es' : ''}`} />
                  </>
                )}
                {betType === 'player-block' && <SummaryRow k="BLOCK TARGET" v={blockPlayer?.name || '—'} sub={blockPlayer ? `${blockPlayer.club} · ${blockPlayer.position}` : ''} />}
                {betType === 'match-result' && <SummaryRow k="OPTIONS" v={`${fixtureMeta?.home_team || 'Home'} Win · Draw · ${fixtureMeta?.away_team || 'Away'} Win`} />}
                <SummaryRow k="REWARD" v={`+${reward} PTS`} tone="var(--positive)" />
                <SummaryRow k="LOCKS"  v={closes ? new Date(closes).toLocaleString('en-GB') : '—'} />
                <SummaryRow k="TITLE"  v={computedTitle} />
              </div>
              <div style={{ padding: '10px 12px', background: 'rgba(224,168,0,.06)', border: '1px solid rgba(224,168,0,.33)', fontFamily: BODY, fontSize: 11, lineHeight: 1.5, color: 'var(--paper)' }}>
                <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.22em', color: 'var(--gold)' }}>● NOTE</span>{' '}
                Publishing pushes a notification to <b>{memberCount} managers</b> and opens picks immediately.
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => setStep(3)} style={ghostBtn}>← BACK</button>
                <button
                  onClick={handlePublish}
                  disabled={commLoading}
                  style={{ ...btnBase, background: 'var(--positive)', color: 'var(--ink)', flex: 1, fontSize: 12 }}
                >
                  {commLoading ? 'PUBLISHING…' : 'PUBLISH BET →'}
                </button>
              </div>
            </>
          )}
        </div>

        {/* Live preview panel — desktop only */}
        {!isMobile && <aside style={{ padding: '18px', background: 'var(--ink-2)', display: 'flex', flexDirection: 'column', gap: 10, overflow: 'auto' }}>
          <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.22em', color: 'var(--mute)' }}>LIVE PREVIEW · WHAT MANAGERS WILL SEE</span>
          <BetCardPreview
            betType={betType}
            title={computedTitle}
            reward={reward}
            closes={closes}
            fixtureObj={fixtureMeta}
            players={players}
            blockPlayer={blockPlayer}
          />
          <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.16em', color: 'var(--mute)', lineHeight: 1.5 }}>
            UPDATES AS YOU EDIT. THIS CARD APPEARS IN THE <b style={{ color: 'var(--cyan)' }}>BETS TAB</b> FOR EVERY MANAGER ONCE PUBLISHED.
          </span>
        </aside>}
      </div>

      {/* ── Player picker modal ── */}
      {showPlayerModal && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={e => { if (e.target === e.currentTarget) { setShowPlayerModal(false); setPlayerSearch(''); } }}
        >
          <div style={{ background: 'var(--ink)', border: '1px solid var(--rule)', width: isMobile ? 'calc(100vw - 32px)' : 380, maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.6)' }}>
            <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--rule)', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.22em', color: 'var(--cyan)', flex: 1 }}>SELECT PLAYER</span>
              <button onClick={() => { setShowPlayerModal(false); setPlayerSearch(''); }} style={{ background: 'none', border: 'none', color: 'var(--mute)', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>✕</button>
            </div>
            <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--rule)' }}>
              <input
                autoFocus
                type="text"
                placeholder="Search by name or club…"
                value={playerSearch}
                onChange={e => setPlayerSearch(e.target.value)}
                style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--paper)', fontSize: 12, padding: '8px 10px', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {allPlayers
                .filter(p => {
                  const q = playerSearch.toLowerCase();
                  return !q || p.name.toLowerCase().includes(q) || (p.club || '').toLowerCase().includes(q);
                })
                .slice(0, 60)
                .map(p => (
                  <button key={p.id} onClick={() => {
                    if (betType === 'player-block') {
                      setBlock(p);
                    } else {
                      // Top scorer: add to front of list, cap at 8 (last is dropped)
                      setPlayers(prev => {
                        if (prev.find(x => x.id === p.id)) return prev;
                        return [p, ...prev.slice(0, 7)];
                      });
                    }
                    setShowPlayerModal(false);
                    setPlayerSearch('');
                  }} style={{
                    width: '100%', textAlign: 'left', padding: '10px 14px',
                    background: 'transparent', border: 0,
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, color: 'var(--paper)',
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: DISPLAY, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                      <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)', letterSpacing: '.12em' }}>{p.club}</div>
                    </div>
                    <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--cyan)', letterSpacing: '.14em', flexShrink: 0 }}>{p.position}</span>
                  </button>
                ))}
              {allPlayers.length === 0 && !dataLoading && (
                <div style={{ padding: '20px', fontFamily: MONO, fontSize: 10, color: 'var(--mute)', textAlign: 'center', letterSpacing: '.18em' }}>NO PLAYERS FOUND · CHECK TOURNAMENT</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Additional fixture picker modal (for top-scorer "Add Match") ── */}
      {showFixtureModal && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={e => { if (e.target === e.currentTarget) { setShowFixtureModal(false); setFixtureSearch(''); } }}
        >
          <div style={{ background: 'var(--ink)', border: '1px solid var(--rule)', width: isMobile ? 'calc(100vw - 32px)' : 400, maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.6)' }}>
            <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--rule)', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.22em', color: 'var(--gold)', flex: 1 }}>ADD MATCH FROM ANOTHER ROUND</span>
              <button onClick={() => { setShowFixtureModal(false); setFixtureSearch(''); }} style={{ background: 'none', border: 'none', color: 'var(--mute)', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>✕</button>
            </div>
            <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--rule)' }}>
              <input
                autoFocus
                type="text"
                placeholder="Search team…"
                value={fixtureSearch}
                onChange={e => setFixtureSearch(e.target.value)}
                style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--paper)', fontSize: 12, padding: '8px 10px', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {allDbFixtures
                .filter(f => !selectedFixtures.includes(f.id))
                .filter(f => {
                  const q = fixtureSearch.toLowerCase();
                  return !q || f.home_team.toLowerCase().includes(q) || f.away_team.toLowerCase().includes(q);
                })
                .slice(0, 40)
                .map(f => (
                  <button key={f.id} onClick={() => {
                    if (selectedFixtures.length < 4) {
                      setSelectedFixtures(prev => [...prev, f.id]);
                    }
                    setShowFixtureModal(false);
                    setFixtureSearch('');
                  }} style={{
                    width: '100%', textAlign: 'left', padding: '10px 14px',
                    background: 'transparent', border: 0,
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                    cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 2, color: 'var(--paper)',
                  }}>
                    <div style={{ fontFamily: DISPLAY, fontSize: 12 }}>{f.home_team} vs {f.away_team}</div>
                    <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)', letterSpacing: '.12em' }}>{fmtKickoff(f.kickoff_at)}</div>
                  </button>
                ))}
              {allDbFixtures.length === 0 && !dataLoading && (
                <div style={{ padding: '20px', fontFamily: MONO, fontSize: 10, color: 'var(--mute)', textAlign: 'center', letterSpacing: '.18em' }}>NO UPCOMING FIXTURES FOUND</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Resolve pending bets (Zone B right)
// ─────────────────────────────────────────────────────────────────────────────
// ── Void confirmation modal — platform-styled warning, no timer ───────────────
function VoidConfirmModal({ bet, onConfirm, onCancel }) {
  if (!bet) return null;
  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onCancel(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 600,
        background: 'rgba(0,0,0,0.78)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '16px',
      }}
    >
      <div style={{
        background: 'var(--ink-2)',
        border: '1px solid rgba(239,68,68,.45)',
        width: '100%', maxWidth: 440,
        boxShadow: '0 24px 60px rgba(0,0,0,0.7)',
      }}>
        {/* Header */}
        <div style={{
          padding: '14px 18px',
          borderBottom: '1px solid var(--rule)',
          background: 'var(--ink)',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span style={{ width: 3, height: 12, background: 'var(--danger)', flexShrink: 0 }} />
          <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '.22em', color: 'var(--danger)', flex: 1 }}>
            VOID BET — CONFIRM
          </span>
          <button onClick={onCancel} style={{ background: 'none', border: 'none', color: 'var(--mute)', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '0 2px' }}>✕</button>
        </div>
        {/* Body */}
        <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontFamily: DISPLAY, fontSize: 14, color: 'var(--paper)', lineHeight: 1.4 }}>
            {bet.title}
          </div>
          <div style={{ padding: '10px 12px', background: 'rgba(239,68,68,.06)', border: '1px solid rgba(239,68,68,.25)', fontFamily: BODY, fontSize: 12, color: 'var(--paper)', lineHeight: 1.6 }}>
            <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.22em', color: 'var(--danger)' }}>● WARNING · </span>
            All picks will be cleared and no points awarded. This cannot be undone.
          </div>
          <div style={{ fontFamily: BODY, fontSize: 11, color: 'var(--mute)', lineHeight: 1.5 }}>
            Use <b style={{ color: 'var(--warn)' }}>No Winner</b> instead if the bet was valid but nobody got it right.
          </div>
        </div>
        {/* Footer */}
        <div style={{ padding: '12px 18px', borderTop: '1px solid var(--rule)', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={{ ...ghostBtn, fontSize: 9, padding: '8px 16px' }}>CANCEL</button>
          <button
            onClick={onConfirm}
            style={{ ...btnBase, fontSize: 10, background: 'var(--danger)', color: 'var(--paper)', padding: '8px 18px' }}
          >
            VOID BET
          </button>
        </div>
      </div>
    </div>
  );
}

function ResolvePendingBets({ openBets, resolutionBetsLoading, setSelectedBetForResolution, betResolutionAnswers, toggleBetResolutionAnswer, setBetResolutionAnswers, betSubmissions, answerGrouped, fetchBetSubmissions, resolveBet, resolveNoWinner, voidBet, commLoading, commMsg, memberCount = 0 }) {
  const [expandedId, setExpandedId] = useState(null);
  const [voidConfirmBet, setVoidConfirmBet] = useState(null); // {id, title} | null

  // Pending = open/closed bets that need resolution. Resolved = already resolved (override eligible).
  const pending  = (openBets || []).filter(b => b.status !== 'resolved' && b.status !== 'cancelled');
  const resolved = (openBets || []).filter(b => b.status === 'resolved');
  const allActionable = [...pending, ...resolved];

  const toggleCard = (betId) => {
    if (expandedId === betId) {
      setExpandedId(null);
    } else {
      setExpandedId(betId);
      setSelectedBetForResolution(openBets.find(b => b.id === betId) || null);
      setBetResolutionAnswers([]);
      fetchBetSubmissions(betId);
    }
  };

  const typeTone = (templateId) => {
    if (templateId === 'top_scorer')   return 'var(--cyan)';
    if (templateId === 'match_result') return 'var(--positive)';
    if (templateId === 'player_block') return 'var(--danger)';
    return 'var(--paper)';
  };

  const typeGlyph = (templateId) => {
    if (templateId === 'top_scorer')   return '◉';
    if (templateId === 'match_result') return '◈';
    if (templateId === 'player_block') return '⛌';
    return '◈';
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <VoidConfirmModal
        bet={voidConfirmBet}
        onConfirm={() => { voidBet(voidConfirmBet.id); setVoidConfirmBet(null); }}
        onCancel={() => setVoidConfirmBet(null)}
      />
      <HubSectionLabel
        label="RESOLVE BETS"
        sub={`${pending.length} PENDING · ${resolved.length} RESOLVED (OVERRIDE ELIGIBLE)`}
        tone="var(--gold)"
        right={<span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.22em', color: 'var(--mute)' }}>AUTO-RESOLVE IS OFF</span>}
      />
      <div style={{ padding: '14px 22px 6px', fontFamily: BODY, fontSize: 11, color: 'var(--mute)', lineHeight: 1.5 }}>
        Pick a bet, enter the result, hit <b style={{ color: 'var(--gold)' }}>RESOLVE</b>. Points are awarded immediately.
        Auto-resolved bets appear below and can be overridden if the result was set incorrectly.
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '8px 22px 22px', overflow: 'auto', flex: 1 }}>
        {resolutionBetsLoading ? (
          <div style={{ padding: '18px', fontFamily: MONO, fontSize: 10, color: 'var(--mute)', letterSpacing: '.2em' }}>LOADING BETS…</div>
        ) : allActionable.length === 0 ? (
          <div style={{ padding: '18px 14px', background: 'var(--ink-2)', border: '1px dashed var(--rule)', textAlign: 'center' }}>
            <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '.22em', color: 'var(--mute)' }}>NOTHING TO RESOLVE · ALL CAUGHT UP</span>
          </div>
        ) : allActionable.map(b => {
          const isOpen       = expandedId === b.id;
          const isResolved   = b.status === 'resolved';
          const tone         = isResolved ? 'var(--mute)' : typeTone(b.template_id);
          const glyph        = typeGlyph(b.template_id);
          const opts         = Array.isArray(b.options) ? b.options : [];
          const currentAnswers = isOpen ? betResolutionAnswers : [];

          const resolvedLabel = isResolved && b.correct_answer
            ? (opts.find(o => (o.key ?? o) === b.correct_answer)?.label ?? b.correct_answer)
            : null;

          return (
            <div key={b.id} style={{
              background: isResolved ? 'rgba(34,197,94,0.04)' : 'var(--ink-2)',
              border: isResolved ? '1px solid rgba(34,197,94,0.2)' : '1px solid var(--rule)',
              borderLeft: isResolved ? '3px solid rgba(34,197,94,0.6)' : `3px solid ${tone}`,
            }}>
              <button
                onClick={() => toggleCard(b.id)}
                style={{ width: '100%', background: 'transparent', border: 0, color: 'var(--paper)', padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', textAlign: 'left' }}
              >
                <span style={{ width: 22, height: 22, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: `${tone}15`, border: `1px solid ${tone}55`, fontFamily: DISPLAY, fontSize: 12, color: tone }}>{glyph}</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
                  <span style={{ fontFamily: DISPLAY, fontSize: 13, color: isResolved ? 'var(--text-2)' : 'var(--paper)' }}>{b.title}</span>
                  {b.prompt && b.prompt !== b.title && (
                    <span style={{ fontFamily: "'Archivo', sans-serif", fontSize: 11, color: 'var(--text-2)', lineHeight: 1.4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.prompt}</span>
                  )}
                  <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.16em', color: 'var(--mute)' }}>
                    {b.scope_ref || b.scope_type || ''}
                    {resolvedLabel ? ` · RESULT: ${resolvedLabel.toUpperCase()}` : ''}
                  </span>
                </div>
                {isResolved
                  ? <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.18em', color: 'var(--positive)', background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.35)', padding: '2px 7px' }}>✓ RESOLVED</span>
                  : <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.22em', color: 'var(--gold)' }}>● PENDING</span>}
                <span style={{ color: 'var(--mute)', fontFamily: MONO, fontSize: 14 }}>{isOpen ? '−' : '+'}</span>
              </button>

              {isOpen && (
                <div style={{ padding: '4px 14px 14px', display: 'flex', flexDirection: 'column', gap: 12, borderTop: isResolved ? '1px solid rgba(34,197,94,0.15)' : '1px solid var(--rule)' }}>
                  {/* Override notice for already-resolved bets */}
                  {isResolved && (
                    <div style={{ padding: '8px 10px', background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.25)', fontFamily: BODY, fontSize: 11, color: 'var(--positive)', lineHeight: 1.5 }}>
                      This bet was resolved as <b>{resolvedLabel?.toUpperCase() ?? b.correct_answer}</b>. Selecting a different answer will override the result — points already awarded will be reversed and recalculated.
                    </div>
                  )}
                  {/* Who picked what */}
                  {Object.keys(answerGrouped).length > 0 && (
                    <div>
                      <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.22em', color: 'var(--mute)' }}>WHO PICKED WHAT · {betSubmissions.length}/{memberCount}</span>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                        {Object.entries(answerGrouped).map(([optKey, usernames]) => (
                          <div key={optKey} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontFamily: DISPLAY, fontSize: 11, minWidth: 80, color: 'var(--paper)' }}>
                              {opts.find(o => (o.key ?? o) === optKey)?.label ?? optKey}
                            </span>
                            <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                              {usernames.slice(0, 6).map(name => (
                                <MgrTag key={name} mono={mgrMono(name)} hue={mgrHue(name)} size={16} />
                              ))}
                            </div>
                            <span style={{ flex: 1 }} />
                            <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.14em', color: 'var(--mute)' }}>{usernames.length} MGRS</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Multi-select answer chips — click to toggle, multiple allowed for ties */}
                  <WizField
                    label="CORRECT ANSWER(S)"
                    sub={opts.length > 0
                      ? 'Select all correct options — click to toggle. Multiple selections allowed for ties.'
                      : 'No predefined options — type the answer key manually below.'}
                  >
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {opts.map(opt => {
                        const optKey   = opt.key ?? opt;
                        const optLabel = opt.label ?? opt;
                        const picked   = currentAnswers.includes(optKey);
                        const subCount = answerGrouped[optKey]?.length ?? 0;
                        return (
                          <button key={optKey} onClick={() => toggleBetResolutionAnswer(optKey)} style={{
                            padding: '7px 11px', cursor: 'pointer',
                            background: picked ? 'rgba(34,197,94,.08)' : 'var(--ink)',
                            border: picked ? '1px solid var(--positive)' : '1px solid var(--rule)',
                            color: picked ? 'var(--positive)' : 'var(--paper)',
                            fontFamily: DISPLAY, fontSize: 11, letterSpacing: '-0.01em',
                            display: 'flex', flexDirection: 'column', gap: 2, textAlign: 'left',
                          }}>
                            <span>{picked ? '✓ ' : ''}{optLabel}</span>
                            {subCount > 0 && <span style={{ fontFamily: MONO, fontSize: 8, letterSpacing: '.14em', color: picked ? 'var(--positive)' : 'var(--mute)' }}>{subCount} MGRS</span>}
                          </button>
                        );
                      })}
                    </div>
                    {/* Free-text fallback only when there are no predefined options */}
                    {opts.length === 0 && (
                      <input
                        placeholder="Type answer key manually…"
                        value={currentAnswers[0] ?? ''}
                        onChange={e => setBetResolutionAnswers(e.target.value ? [e.target.value] : [])}
                        style={{ ...inputStyle, marginTop: 6, fontSize: 11 }}
                      />
                    )}
                  </WizField>

                  {/* Footer: AWARDS count + action buttons */}
                  {(() => {
                    const totalWinners = currentAnswers.reduce((sum, ak) => sum + (answerGrouped[ak]?.length ?? 0), 0);
                    const canResolve = currentAnswers.length > 0;
                    return (
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.16em', color: 'var(--mute)' }}>
                          {canResolve
                            ? <>AWARDS <b style={{ color: 'var(--positive)' }}>
                                {b.reward_type === 'budget'
                                  ? `+€${b.reward_value}M BUDGET`
                                  : `+${b.reward_value} PTS`}
                              </b> TO {totalWinners} MGR{totalWinners !== 1 ? 'S' : ''}</>
                            : <span style={{ color: 'var(--mute)' }}>SELECT A WINNER OR USE NO WINNER →</span>}
                        </span>
                        <span style={{ flex: 1 }} />
                        {/* VOID — cancels the bet entirely (wrong setup / abandoned fixture) */}
                        <button
                          onClick={() => setVoidConfirmBet({ id: b.id, title: b.title })}
                          disabled={commLoading}
                          style={{ ...ghostBtn, fontSize: 9 }}
                        >VOID</button>
                        {/* NO WINNER — bet was valid but no option was correct (0 pts, stays resolved) */}
                        <button
                          onClick={() => {
                            if (!window.confirm(`Resolve "${b.title}" with no winner? 0 pts will be awarded. This cannot be undone.`)) return;
                            resolveNoWinner();
                          }}
                          disabled={commLoading}
                          style={{ ...ghostBtn, fontSize: 9, borderColor: 'rgba(245,158,11,.4)', color: 'var(--warn)' }}
                        >NO WINNER</button>
                        {/* RESOLVE — awards pts to managers who picked a selected option */}
                        <button
                          disabled={commLoading || !canResolve}
                          onClick={resolveBet}
                          style={{
                            ...btnBase, fontSize: 11,
                            background: canResolve ? 'var(--gold)' : 'var(--ink-3)',
                            color: canResolve ? 'var(--ink)' : 'var(--mute)',
                            cursor: canResolve ? 'pointer' : 'not-allowed',
                          }}
                        >{commLoading ? 'RESOLVING…' : isResolved ? 'OVERRIDE →' : 'RESOLVE →'}</button>
                      </div>
                    );
                  })()}
                  {/* Inline error — visible without scrolling to top */}
                  {commMsg?.type === 'err' && isOpen && (
                    <div style={{ padding: '8px 10px', background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.3)', color: 'var(--danger)', fontFamily: BODY, fontSize: 12 }}>
                      {commMsg.text}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Betting History — all bets (admin read-only, below CREATE / RESOLVE)
// ─────────────────────────────────────────────────────────────────────────────
const BH_STATUS = {
  open:      { label: 'OPEN',     tone: 'var(--cyan)',     bg: 'rgba(0,180,216,.08)'  },
  closed:    { label: 'PENDING',  tone: 'var(--gold)',     bg: 'rgba(224,168,0,.08)'  },
  resolved:  { label: 'RESOLVED', tone: 'var(--positive)', bg: 'rgba(34,197,94,.08)'  },
  cancelled: { label: 'VOIDED',   tone: 'var(--danger)',   bg: 'rgba(239,68,68,.08)'  },
};

function BettingHistory({ allBets, allBetsLoading, fetchAllBets, memberCount = 0, isMobile = false }) {
  const [filter,     setFilter]     = useState('all');
  const [expandedId, setExpandedId] = useState(null);

  // Lazy-load: only fetch on first render, then kept in sync by mutations
  useEffect(() => { fetchAllBets(); }, [fetchAllBets]);

  const counts = {
    all:       allBets.length,
    open:      allBets.filter(b => b.status === 'open').length,
    closed:    allBets.filter(b => b.status === 'closed').length,
    resolved:  allBets.filter(b => b.status === 'resolved').length,
    cancelled: allBets.filter(b => b.status === 'cancelled').length,
  };

  const filtered = filter === 'all' ? allBets : allBets.filter(b => b.status === filter);

  const toggleExpand = (id) => setExpandedId(prev => prev === id ? null : id);

  // Resolve the human-readable label for a given option key within a bet's options array
  const optLabel = (bet, key) => {
    const opts = Array.isArray(bet.options) ? bet.options : [];
    return opts.find(o => (o.key ?? o) === key)?.label ?? key;
  };

  // Correct answer keys: support both correct_answers[] (new) and correct_answer (legacy)
  const correctKeys = (bet) =>
    (Array.isArray(bet.correct_answers) && bet.correct_answers.length ? bet.correct_answers : null)
    ?? (bet.correct_answer ? [bet.correct_answer] : []);

  const FILTER_TABS = [
    { k: 'all',      label: 'ALL',      count: counts.all       },
    { k: 'open',     label: 'OPEN',     count: counts.open      },
    { k: 'closed',   label: 'PENDING',  count: counts.closed    },
    { k: 'resolved', label: 'RESOLVED', count: counts.resolved  },
    { k: 'cancelled',label: 'VOIDED',   count: counts.cancelled },
  ].filter(t => t.k === 'all' || t.count > 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <HubSectionLabel
        label="BETTING HISTORY"
        sub={`${counts.all} TOTAL · ALL STATUSES`}
        tone="var(--purple)"
        right={
          <button
            onClick={fetchAllBets}
            disabled={allBetsLoading}
            style={{ ...ghostBtn, fontSize: 9, padding: '4px 10px', opacity: allBetsLoading ? 0.5 : 1 }}
          >↻ REFRESH</button>
        }
      />

      {/* Filter tabs */}
      <div style={{
        display: 'flex', gap: 0, borderBottom: '1px solid var(--rule)',
        background: 'var(--ink)', overflowX: 'auto', flexShrink: 0,
      }}>
        {FILTER_TABS.map((t, i) => {
          const active = filter === t.k;
          const cfg    = BH_STATUS[t.k] ?? { tone: 'var(--paper)' };
          const tone   = t.k === 'all' ? 'var(--paper)' : cfg.tone;
          return (
            <button
              key={t.k}
              onClick={() => setFilter(t.k)}
              style={{
                background: 'transparent',
                border: 0,
                borderBottom: active ? `2px solid ${tone}` : '2px solid transparent',
                borderRight: i < FILTER_TABS.length - 1 ? '1px solid var(--rule)' : 'none',
                padding: isMobile ? '10px 14px' : '12px 18px',
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
              }}
            >
              <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.18em', color: active ? tone : 'var(--mute)' }}>
                {t.label}
              </span>
              <span style={{
                fontFamily: MONO, fontSize: 8, letterSpacing: '.1em',
                padding: '1px 5px',
                background: active ? `${tone}18` : 'transparent',
                border: `1px solid ${active ? `${tone}44` : 'var(--rule)'}`,
                color: active ? tone : 'var(--mute)',
              }}>{t.count}</span>
            </button>
          );
        })}
      </div>

      {/* List */}
      <div style={{ display: 'flex', flexDirection: 'column', padding: isMobile ? '8px 14px 80px' : '12px 22px 32px', gap: 6 }}>
        {allBetsLoading && (
          <div style={{ padding: '18px', fontFamily: MONO, fontSize: 10, color: 'var(--mute)', letterSpacing: '.2em' }}>LOADING…</div>
        )}
        {!allBetsLoading && filtered.length === 0 && (
          <div style={{ padding: '18px 14px', background: 'var(--ink-2)', border: '1px dashed var(--rule)', textAlign: 'center' }}>
            <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '.22em', color: 'var(--mute)' }}>
              {counts.all === 0 ? 'NO BETS CREATED YET' : 'NO BETS IN THIS CATEGORY'}
            </span>
          </div>
        )}

        {!allBetsLoading && filtered.map(bet => {
          const isOpen  = expandedId === bet.id;
          const cfg     = BH_STATUS[bet.status] ?? BH_STATUS.open;
          const tone    = cfg.tone;
          // Reuse the same glyph/tone helpers defined in ResolvePendingBets scope
          const glyph = bet.template_id
            ? (() => {
                // We don't have the template slug here — derive from title heuristic
                const t = (bet.title || '').toLowerCase();
                if (t.includes('scorer') || t.includes('top'))  return '◉';
                if (t.includes('result') || t.includes('match')) return '◈';
                if (t.includes('clean'))                         return '🧤';
                return '◈';
              })()
            : '◈';

          const cKeys   = correctKeys(bet);
          const stats   = bet.stats ?? { total: 0, winners: 0, byAnswer: {} };
          const opts    = Array.isArray(bet.options) ? bet.options : [];

          return (
            <div
              key={bet.id}
              style={{
                background: 'var(--ink-2)',
                border: '1px solid var(--rule)',
                borderLeft: `3px solid ${tone}`,
              }}
            >
              {/* Collapsed header row */}
              <button
                onClick={() => toggleExpand(bet.id)}
                style={{
                  width: '100%', background: 'transparent', border: 0,
                  padding: '11px 14px', display: 'flex', alignItems: 'center',
                  gap: 10, cursor: 'pointer', textAlign: 'left',
                }}
              >
                {/* Type glyph */}
                <span style={{
                  width: 20, height: 20, display: 'inline-flex', alignItems: 'center',
                  justifyContent: 'center', background: `${tone}15`,
                  border: `1px solid ${tone}55`, fontFamily: DISPLAY, fontSize: 11,
                  color: tone, flexShrink: 0,
                }}>{glyph}</span>

                {/* Title */}
                <span style={{
                  fontFamily: DISPLAY, fontSize: isMobile ? 12 : 13, color: 'var(--paper)',
                  flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{bet.title}</span>

                {/* Picks count */}
                <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.14em', color: 'var(--mute)', flexShrink: 0 }}>
                  {stats.total}/{memberCount}
                </span>

                {/* Status chip */}
                <span style={{
                  fontFamily: MONO, fontSize: 8, letterSpacing: '.18em',
                  padding: '2px 6px', border: `1px solid ${tone}44`,
                  background: cfg.bg, color: tone, flexShrink: 0,
                }}>{cfg.label}</span>

                {/* Expand chevron */}
                <span style={{ color: 'var(--mute)', fontFamily: MONO, fontSize: 12, flexShrink: 0 }}>
                  {isOpen ? '−' : '+'}
                </span>
              </button>

              {/* Expanded detail panel */}
              {isOpen && (
                <div style={{ borderTop: '1px solid var(--rule)', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>

                  {/* Meta row: reward · deadline */}
                  <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ fontFamily: MONO, fontSize: 8, letterSpacing: '.2em', color: 'var(--mute)' }}>REWARD</span>
                      <span style={{ fontFamily: DISPLAY, fontSize: 14, color: 'var(--positive)' }}>+{bet.reward_value} PTS</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ fontFamily: MONO, fontSize: 8, letterSpacing: '.2em', color: 'var(--mute)' }}>DEADLINE</span>
                      <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--paper)', letterSpacing: '.1em' }}>{fmtKickoff(bet.deadline_at)}</span>
                    </div>
                    {bet.scope_ref && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <span style={{ fontFamily: MONO, fontSize: 8, letterSpacing: '.2em', color: 'var(--mute)' }}>SCOPE</span>
                        <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--paper)', letterSpacing: '.1em' }}>{bet.scope_ref}</span>
                      </div>
                    )}
                  </div>

                  {/* Correct answer(s) — resolved bets only */}
                  {bet.status === 'resolved' && (
                    <div style={{ padding: '8px 10px', background: 'rgba(34,197,94,.06)', border: '1px solid rgba(34,197,94,.25)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <span style={{ fontFamily: MONO, fontSize: 8, letterSpacing: '.22em', color: 'var(--positive)' }}>CORRECT ANSWER</span>
                      {cKeys.length > 0 ? (
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {cKeys.map(k => (
                            <span key={k} style={{
                              fontFamily: DISPLAY, fontSize: 12, color: 'var(--positive)',
                              padding: '4px 8px', border: '1px solid rgba(34,197,94,.4)',
                              background: 'rgba(34,197,94,.08)',
                            }}>{optLabel(bet, k)}</span>
                          ))}
                        </div>
                      ) : (
                        <span style={{ fontFamily: DISPLAY, fontSize: 12, color: 'var(--mute)' }}>No winner</span>
                      )}
                      <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.14em', color: 'var(--positive)' }}>
                        {stats.winners} / {stats.total} correct · +{bet.reward_value} pts each
                      </span>
                    </div>
                  )}

                  {/* Voided notice */}
                  {bet.status === 'cancelled' && (
                    <div style={{ padding: '8px 10px', background: 'rgba(239,68,68,.06)', border: '1px solid rgba(239,68,68,.25)' }}>
                      <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.18em', color: 'var(--danger)' }}>
                        VOIDED · All picks cleared — no points awarded
                      </span>
                    </div>
                  )}

                  {/* Pick breakdown — who chose what */}
                  {stats.total > 0 && opts.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <span style={{ fontFamily: MONO, fontSize: 8, letterSpacing: '.22em', color: 'var(--mute)' }}>
                        PICK BREAKDOWN · {stats.total} SUBMISSION{stats.total !== 1 ? 'S' : ''}
                      </span>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {opts.map(opt => {
                          const key      = opt.key ?? opt;
                          const label    = opt.label ?? opt;
                          const pickers  = stats.byAnswer[key] ?? [];
                          const isWinner = bet.status === 'resolved' && cKeys.includes(key);
                          if (pickers.length === 0) return null;
                          return (
                            <div key={key} style={{
                              display: 'flex', alignItems: 'flex-start', gap: 8,
                              padding: '6px 8px',
                              background: isWinner ? 'rgba(34,197,94,.05)' : 'var(--ink)',
                              border: `1px solid ${isWinner ? 'rgba(34,197,94,.25)' : 'var(--rule)'}`,
                            }}>
                              <span style={{
                                fontFamily: DISPLAY, fontSize: 11, color: isWinner ? 'var(--positive)' : 'var(--paper)',
                                minWidth: isMobile ? 80 : 120, flexShrink: 0,
                              }}>
                                {isWinner && <span style={{ marginRight: 4 }}>✓</span>}{label}
                              </span>
                              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', flex: 1 }}>
                                {pickers.map(name => (
                                  <MgrTag key={name} mono={mgrMono(name)} hue={mgrHue(name)} size={16} />
                                ))}
                              </div>
                              <span style={{ fontFamily: MONO, fontSize: 8, letterSpacing: '.12em', color: 'var(--mute)', flexShrink: 0 }}>
                                {pickers.length}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* No submissions yet */}
                  {stats.total === 0 && (
                    <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.18em', color: 'var(--mute)' }}>
                      NO PICKS SUBMITTED YET
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
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
// P2P challenges config — entry fee (league_config) + stake limits (p2p_config)
// ─────────────────────────────────────────────────────────────────────────────
function P2PChallengesConfig({ leagueId, isMobile = false, commLoading }) {
  const [entryFee, setEntryFee] = useState('');
  const [minStake, setMinStake] = useState('10');
  const [maxStake, setMaxStake] = useState('500');
  const [enabled, setEnabled]   = useState(true);
  const [saved, setSaved]       = useState(false);
  const [saving, setSaving]     = useState(false);

  useEffect(() => {
    if (!leagueId) return;
    // Load coin_entry_fee from league_config
    supabase.from('league_config')
      .select('config_value')
      .eq('league_id', leagueId)
      .eq('config_key', 'coin_entry_fee')
      .maybeSingle()
      .then(({ data }) => { if (data?.config_value != null) setEntryFee(String(data.config_value)); });
    // Load stake limits from p2p_config via RPC
    supabase.rpc('get_p2p_config', { p_league_id: leagueId })
      .then(({ data }) => {
        if (!data || data.error) return;
        setMinStake(String(data.min_stake ?? 10));
        setMaxStake(String(data.max_stake ?? 500));
        setEnabled(data.challenges_enabled ?? true);
      });
  }, [leagueId]);

  const save = async () => {
    setSaving(true);
    const fee = parseInt(entryFee, 10);
    // Upsert coin_entry_fee in league_config
    if (!isNaN(fee) && fee >= 0) {
      await supabase.from('league_config').upsert(
        [{ league_id: leagueId, config_key: 'coin_entry_fee', config_value: fee }],
        { onConflict: 'league_id,config_key' }
      );
    } else if (entryFee === '' || entryFee === '0') {
      await supabase.from('league_config').delete()
        .eq('league_id', leagueId).eq('config_key', 'coin_entry_fee');
    }
    // Update p2p_config via RPC
    await supabase.rpc('update_p2p_config', {
      p_league_id: leagueId,
      p_min_stake: parseInt(minStake, 10) || 10,
      p_max_stake: parseInt(maxStake, 10) || 500,
      p_challenges_enabled: enabled,
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const inp = {
    padding: '7px 10px',
    borderRadius: 6,
    border: '1px solid var(--rule)',
    background: 'var(--ink)',
    color: 'var(--paper)',
    fontFamily: MONO,
    fontSize: 12,
    width: '100%',
    boxSizing: 'border-box',
  };

  const row = { display: 'flex', flexDirection: 'column', gap: 4 };
  const lbl = { fontFamily: MONO, fontSize: 9, letterSpacing: '.18em', color: 'var(--mute)' };

  const content = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={row}>
        <span style={lbl}>COIN ENTRY FEE (0 = free)</span>
        <input type="number" min={0} step={10} value={entryFee} onChange={e => setEntryFee(e.target.value)} placeholder="0" style={inp} />
        <span style={{ ...lbl, lineHeight: 1.5 }}>Charged to joiners via join_league_by_code. Leave blank or 0 to disable.</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div style={row}>
          <span style={lbl}>MIN STAKE</span>
          <input type="number" min={1} value={minStake} onChange={e => setMinStake(e.target.value)} style={inp} />
        </div>
        <div style={row}>
          <span style={lbl}>MAX STAKE</span>
          <input type="number" min={1} max={10000} value={maxStake} onChange={e => setMaxStake(e.target.value)} style={inp} />
        </div>
      </div>
      <ToggleSwitch
        checked={enabled}
        onChange={() => setEnabled(v => !v)}
        labelOn="CHALLENGES ENABLED"
        labelOff="CHALLENGES DISABLED"
      />
      <button
        onClick={save}
        disabled={saving || commLoading}
        style={{
          padding: '9px 0',
          borderRadius: 6,
          border: 'none',
          background: saved ? 'var(--positive)' : 'var(--gold)',
          color: 'var(--ink)',
          fontFamily: MONO,
          fontSize: 10,
          letterSpacing: '.18em',
          fontWeight: 700,
          cursor: saving ? 'wait' : 'pointer',
          opacity: saving ? 0.7 : 1,
        }}
      >
        {saved ? 'SAVED ✓' : saving ? 'SAVING…' : 'SAVE P2P CONFIG'}
      </button>
    </div>
  );

  if (isMobile) {
    return (
      <MobLifecycleCard title="P2P CHALLENGES" status={enabled ? 'ON' : 'OFF'} tone={enabled ? 'var(--positive)' : 'var(--mute)'} when="Set entry fee for new joiners and stake limits for challenges.">
        {content}
      </MobLifecycleCard>
    );
  }

  return (
    <div style={{ padding: '18px 24px', borderTop: '1px solid var(--rule)' }}>
      <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '.22em', color: 'var(--mute)', marginBottom: 14 }}>P2P CHALLENGES CONFIG</div>
      {content}
    </div>
  );
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
    triggerDraftAllocation,
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

  // Free transfer window state — emergency "open the market mid-matchday" toggle.
  // Shared with the mobile layout via useFreeTransferWindow.
  const { activeFreeWindow, openFreeWindow, closeFreeWindow } = useFreeTransferWindow(leagueId, commissioner);
  // Free transfers config — lifts per-round cap while window is open (Classic leagues only).
  const { freeTransfers, toggleFreeTransfers } = useFreeTransfersConfig(leagueId, commissioner);

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

  // Emergency transfers — shared state/handlers across desktop LifecycleOps grid
  // and the mobile lifecycle cards below. Called unconditionally (Rules of Hooks)
  // even though it's only rendered on one of the two layouts per render.
  const { activeFreeWindow, openFreeWindow, closeFreeWindow } = useFreeTransferWindow(leagueId, commissioner);
  // Free transfers config — same dual-call pattern as useFreeTransferWindow above.
  const { freeTransfers: mobFreeTransfers, toggleFreeTransfers: mobToggleFreeTransfers } = useFreeTransfersConfig(leagueId, commissioner);

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

          {/* P2P Challenges config (mobile) */}
          <P2PChallengesConfig leagueId={leagueId} isMobile commLoading={commLoading} />

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

      {/* P2P Challenges config */}
      <HubSectionLabel label="P2P CHALLENGES" sub="COIN ENTRY FEE & STAKE LIMITS" tone="var(--gold)" />
      <P2PChallengesConfig leagueId={leagueId} commLoading={commLoading} />

      {/* League News — breaking news form */}
      <HubSectionLabel label="LEAGUE NEWS" sub="POST TO ACTIVITY FEED" tone="var(--danger)" />
      <NewsPostForm leagueId={leagueId} setCommMsg={setCommMsg} />

    </div>
  );
}
