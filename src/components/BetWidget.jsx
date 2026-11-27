import { useState } from 'react';
import { useBetSubmit } from '../hooks/useBetSubmit';
import { useToast } from '../hooks/useToast';
import { Icon } from './UiIcons';
import { formatBetReward } from '../lib/betRewards';

// ── helpers ───────────────────────────────────────────────────────────────────

function timeLeft(deadlineAt) {
  if (!deadlineAt) return { label: 'Open', expired: false, color: 'var(--mute)' };
  const diff = new Date(deadlineAt) - Date.now();
  if (diff <= 0) return { label: 'Deadline passed', expired: true, color: 'var(--danger)' };
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  if (h >= 24) return { label: `${Math.floor(h / 24)}d left`, expired: false, color: 'var(--mute)' };
  if (h > 0)   return { label: `${h}h ${m}m left`, expired: false, color: h < 2 ? 'var(--warning)' : 'var(--mute)' };
  return { label: `${m}m left`, expired: false, color: 'var(--danger)' };
}

// ── InlineOptions ─────────────────────────────────────────────────────────────
// Renders selectable options directly on the card.
// For 2–3 options (e.g. home/draw/away), shows side-by-side buttons.
// For many options (players), shows a compact scrollable list with search.

function InlineOptions({ options, onSelect, submitting, selectedKey }) {
  const [search, setSearch] = useState('');

  const isMatch = options.length <= 3;

  const filtered = isMatch
    ? options
    : options.filter(o =>
        !search ||
        o.label.toLowerCase().includes(search.toLowerCase()) ||
        (o.meta?.club ?? '').toLowerCase().includes(search.toLowerCase())
      );

  if (isMatch) {
    return (
      <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
        {options.map(opt => {
          const isSelected = selectedKey === opt.key;
          return (
            <button
              key={opt.key}
              onClick={() => onSelect(opt)}
              disabled={submitting}
              style={{
                flex: 1, padding: '9px 6px', borderRadius: 4, cursor: submitting ? 'default' : 'pointer',
                background: isSelected ? 'rgba(0,196,232,0.18)' : 'var(--elev)',
                border: `1px solid ${isSelected ? 'rgba(0,196,232,0.55)' : 'var(--rule)'}`,
                color: isSelected ? 'var(--accent)' : 'var(--paper)',
                fontFamily: 'Archivo Black, sans-serif', fontSize: 'var(--fs-label)', fontWeight: 900,
               textAlign: 'center', transition: 'all 0.12s',
                opacity: submitting ? 0.5 : 1,
              }}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div style={{ marginTop: 6 }}>
      <input
        type="text"
        placeholder="Search player or club…"
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="ffl-input ffl-input--sm" style={{ marginBottom: 6 }}
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 200, overflowY: 'auto' }}>
        {filtered.length === 0 && (
          <div style={{ fontSize: 'var(--fs-label)', color: 'var(--mute)', padding: '10px 0', textAlign: 'center' }}>No results</div>
        )}
        {filtered.map(opt => {
          const isSelected = selectedKey === opt.key;
          return (
            <button
              key={opt.key}
              onClick={() => onSelect(opt)}
              disabled={submitting}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                padding: '7px 9px', textAlign: 'left', cursor: submitting ? 'default' : 'pointer',
                background: isSelected ? 'rgba(0,196,232,0.1)' : 'var(--elev)',
                border: `1px solid ${isSelected ? 'rgba(0,196,232,0.4)' : 'var(--rule)'}`,
                borderRadius: 3, transition: 'all 0.1s', opacity: submitting ? 0.5 : 1,
              }}
            >
              <div style={{
                width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                background: isSelected ? 'rgba(0,196,232,0.2)' : 'var(--elev)',
                border: `1px solid ${isSelected ? 'rgba(0,196,232,0.5)' : 'var(--rule)'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 'var(--fs-label)', color: isSelected ? 'var(--accent)' : 'var(--mute)', fontWeight: 700,
                fontFamily: 'monospace',
              }}>
                {opt.meta?.pos?.substring(0, 3) ?? opt.label.substring(0, 2).toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 'var(--fs-label)', color: isSelected ? 'var(--accent)' : 'var(--paper)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{opt.label}</div>
                {opt.meta?.club && (
                  <div style={{ fontSize: 'var(--fs-label)', color: 'var(--mute)' }}>{opt.meta.club}</div>
                )}
              </div>
              {isSelected && <span style={{ color: 'var(--accent)', fontSize: 'var(--fs-body)', flexShrink: 0 }}>✓</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── BetWidget ─────────────────────────────────────────────────────────────────

export default function BetWidget({ bet, squadId, onSubmitted }) {
  const { submitBet, submitting } = useBetSubmit();
  const { show: showToast } = useToast();

  const deadline = timeLeft(bet.deadline_at);
  const isPastDeadline = deadline.expired || bet.status !== 'open';
  const isResolved = bet.status === 'resolved';
  const submission = bet.mySubmission;
  const options = Array.isArray(bet.options) ? bet.options : [];

  const answerLabel = submission
    ? (options.find(o => o.key === submission.answer)?.label ?? submission.answer)
    : null;

  // Support both new correct_answers[] and legacy correct_answer string
  const correctAnswerKeys = (bet.correct_answers?.length ? bet.correct_answers : null)
    ?? (bet.correct_answer ? [bet.correct_answer] : null);
  const correctLabel = correctAnswerKeys
    ? correctAnswerKeys
        .map(k => options.find(o => o.key === k)?.label ?? k)
        .join(' · ')
    : null;

  const handleSelect = async (opt) => {
    await submitBet(bet.id, squadId, opt.key, {
      onSuccess: () => {
        showToast('success', 'Bet submitted!');
        onSubmitted?.();
      },
      onError: (msg) => showToast('error', msg),
    });
  };

  // ── Result badge ──
  const resultBadge = () => {
    if (!isResolved || !submission) return null;
    if (submission.is_correct) {
      return (
        <div className="text-[11px] font-black px-2 py-0.5 rounded-sm" style={{ color: 'var(--positive)', background: 'rgba(24,201,107,0.1)' }}>
          ✓ {formatBetReward(bet.reward_type, submission.reward_awarded)}
        </div>
      );
    }
    return (
      <div className="text-[11px] font-black px-2 py-0.5 rounded-sm" style={{ color: 'var(--danger)', background: 'rgba(255,80,80,0.1)' }}>
        ✗ Wrong
      </div>
    );
  };

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {/* Resolved: show correct answer */}
        {isResolved && (
          <div className="flex items-center gap-3">
            <div className="text-[11px] uppercase tracking-wider font-semibold" style={{ color: 'var(--mute)' }}>Correct answer:</div>
            <div className="text-[13px] font-black" style={{ color: correctAnswerKeys?.length ? 'var(--paper)' : 'var(--mute)' }}>
              {correctAnswerKeys?.length ? correctLabel : 'No winner'}
            </div>
          </div>
        )}

        {/* Submitted answer */}
        {submission && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-[#1e1e1e] border border-[#333] flex items-center justify-center text-[11px] font-black text-white/40 uppercase">
                {answerLabel?.substring(0, 2)}
              </div>
              <div>
                <div className="text-[11px] font-semibold mb-0.5" style={{ color: isResolved ? (submission.is_correct ? 'var(--positive)' : 'var(--danger)') : 'var(--accent)' }}>
                  {isResolved ? 'Your answer' : 'Your pick'}
                </div>
                <div className="text-[13px] font-semibold" style={{ color: 'var(--paper)' }}>{answerLabel}</div>
              </div>
            </div>
            {resultBadge()}
            {!isPastDeadline && !isResolved && (
              <div className="text-[11px] font-semibold" style={{ color: 'var(--mute)' }}>Tap below to change</div>
            )}
          </div>
        )}

        {/* No-squad guard — user hasn't completed their team setup */}
        {!isPastDeadline && !squadId && options.length > 0 && (
          <div className="text-[11px] font-semibold mt-1 px-3 py-2 rounded" style={{ color: 'var(--mute)', background: 'var(--elev)', border: '1px solid var(--rule)' }}>
            Complete your squad setup to place bets.
          </div>
        )}

        {/* Inline options — shown when open and not yet resolved */}
        {!isPastDeadline && !!squadId && options.length > 0 && (
          <>
            <div className="flex items-center justify-between mt-1">
              <span style={{ color: deadline.color, fontSize: 'var(--fs-label)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 5 }}>{deadline.icon && <Icon name={deadline.icon} />}{deadline.label}</span>
              {submitting && <span style={{ fontSize: 'var(--fs-label)', color: 'var(--mute)' }}>Saving…</span>}
            </div>
            <InlineOptions
              options={options}
              onSelect={handleSelect}
              submitting={submitting}
              selectedKey={submission?.answer ?? null}
            />
          </>
        )}

        {/* No submission + deadline passed */}
        {!submission && isPastDeadline && (
          <div className="text-[11px]" style={{ color: 'var(--mute)' }}>
            {isResolved ? 'You did not submit a pick.' : 'Deadline passed — no pick submitted.'}
          </div>
        )}

        {/* No options available */}
        {!submission && !isPastDeadline && options.length === 0 && (
          <div className="text-[11px]" style={{ color: 'var(--mute)' }}>No options available yet.</div>
        )}
      </div>

    </>
  );
}
