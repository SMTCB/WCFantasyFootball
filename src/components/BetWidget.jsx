import { useState, useMemo } from 'react';
import { useBetSubmit } from '../hooks/useBetSubmit';
import { useToast } from '../hooks/useToast';

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

// ── PlayerPicker ──────────────────────────────────────────────────────────────
// Bottom-sheet player/team picker shared by player_pick and team_pick bets.

function OptionPicker({ options, onSelect, onClose }) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() =>
    options.filter(o =>
      o.label.toLowerCase().includes(search.toLowerCase()) ||
      (o.meta?.club ?? '').toLowerCase().includes(search.toLowerCase())
    ), [options, search]
  );

  return (
    <>
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50" onClick={onClose} />
      <div className="fixed bottom-0 left-0 right-0 z-50 max-w-md mx-auto bg-[#111] border-t border-white/10 rounded-t-2xl pb-safe shadow-2xl">
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-white/10" />
        </div>

        <div className="px-5 pt-3 pb-4 border-b border-white/5">
          <h2 className="text-[15px] font-black uppercase tracking-tight">Make your pick</h2>
        </div>

        <div className="px-4 py-3 border-b border-white/5">
          <input
            type="text"
            placeholder="Search…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            autoFocus
            className="w-full bg-[#1a1a1a] border border-white/10 rounded-sm px-4 py-2.5 text-[13px] text-white placeholder:text-white/30 focus:outline-none focus:border-white/20"
          />
        </div>

        <div className="overflow-y-auto max-h-[45vh]">
          {filtered.length === 0 && (
            <div className="px-5 py-8 text-center text-[13px] text-white/30">No results</div>
          )}
          {filtered.map(opt => (
            <button
              key={opt.key}
              onClick={() => onSelect(opt)}
              className="w-full flex items-center justify-between px-5 py-3.5 border-b border-white/5 hover:bg-white/5 transition-colors text-left"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-[#1e1e1e] border border-[#333] flex items-center justify-center text-[11px] font-black text-white/40 uppercase">
                  {opt.label.substring(0, 2)}
                </div>
                <div>
                  <div className="text-[13px] font-bold">{opt.label}</div>
                  {opt.meta?.club && (
                    <div className="text-[10px] text-white/40 uppercase tracking-wider">{opt.meta.club}{opt.meta?.pos ? ` · ${opt.meta.pos}` : ''}</div>
                  )}
                </div>
              </div>
              {opt.meta?.flag && <span className="text-xl">{opt.meta.flag}</span>}
            </button>
          ))}
        </div>
      </div>
    </>
  );
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
                background: isSelected ? 'rgba(0,196,232,0.18)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${isSelected ? 'rgba(0,196,232,0.55)' : 'rgba(255,255,255,0.1)'}`,
                color: isSelected ? 'var(--cyan)' : 'var(--paper)',
                fontFamily: 'Archivo Black, sans-serif', fontSize: 11, fontWeight: 900,
                letterSpacing: '.04em', textAlign: 'center', transition: 'all 0.12s',
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
        style={{
          width: '100%', marginBottom: 6, background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.1)', borderRadius: 3,
          color: 'var(--paper)', fontSize: 11, padding: '7px 10px', outline: 'none',
          boxSizing: 'border-box',
        }}
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 200, overflowY: 'auto' }}>
        {filtered.length === 0 && (
          <div style={{ fontSize: 11, color: 'var(--mute)', padding: '10px 0', textAlign: 'center' }}>No results</div>
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
                background: isSelected ? 'rgba(0,196,232,0.1)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${isSelected ? 'rgba(0,196,232,0.4)' : 'rgba(255,255,255,0.07)'}`,
                borderRadius: 3, transition: 'all 0.1s', opacity: submitting ? 0.5 : 1,
              }}
            >
              <div style={{
                width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                background: isSelected ? 'rgba(0,196,232,0.2)' : 'rgba(255,255,255,0.06)',
                border: `1px solid ${isSelected ? 'rgba(0,196,232,0.5)' : 'rgba(255,255,255,0.1)'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 8, color: isSelected ? 'var(--cyan)' : 'var(--mute)', fontWeight: 700,
                fontFamily: 'monospace',
              }}>
                {opt.meta?.pos?.substring(0, 3) ?? opt.label.substring(0, 2).toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, color: isSelected ? 'var(--cyan)' : 'var(--paper)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{opt.label}</div>
                {opt.meta?.club && (
                  <div style={{ fontSize: 9, color: 'var(--mute)', letterSpacing: '.1em' }}>{opt.meta.club}</div>
                )}
              </div>
              {isSelected && <span style={{ color: 'var(--cyan)', fontSize: 13, flexShrink: 0 }}>✓</span>}
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
  const [showPicker, setShowPicker] = useState(false);

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
    setShowPicker(false);
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
        <div className="text-[9px] font-black px-2 py-0.5 rounded-sm" style={{ color: 'var(--positive)', background: 'rgba(24,201,107,0.1)' }}>
          ✓ +{submission.reward_awarded} {bet.reward_type === 'budget' ? 'M' : 'pts'}
        </div>
      );
    }
    return (
      <div className="text-[9px] font-black px-2 py-0.5 rounded-sm" style={{ color: 'var(--danger)', background: 'rgba(255,80,80,0.1)' }}>
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
            <div className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--mute)' }}>Answer:</div>
            <div className="text-[13px] font-black" style={{ color: correctAnswerKeys?.length ? 'var(--paper)' : 'var(--mute)' }}>
              {correctAnswerKeys?.length ? correctLabel : 'No winner'}
            </div>
            {resultBadge()}
          </div>
        )}

        {/* Submitted answer */}
        {submission && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-[#1e1e1e] border border-[#333] flex items-center justify-center text-[10px] font-black text-white/40 uppercase">
                {answerLabel?.substring(0, 2)}
              </div>
              <div>
                <div className="text-[10px] font-semibold mb-0.5" style={{ color: isResolved ? (submission.is_correct ? 'var(--positive)' : 'var(--danger)') : 'var(--cyan)' }}>
                  {isResolved ? (submission.is_correct ? '✓ Correct' : '✗ Wrong') : 'Your pick'}
                </div>
                <div className="text-[13px] font-semibold" style={{ color: 'var(--paper)' }}>{answerLabel}</div>
              </div>
            </div>
            {!isPastDeadline && !isResolved && (
              <div className="text-[9px] font-semibold" style={{ color: 'var(--mute)' }}>Tap below to change</div>
            )}
          </div>
        )}

        {/* No-squad guard — user hasn't completed their team setup */}
        {!isPastDeadline && !squadId && options.length > 0 && (
          <div className="text-[10px] font-semibold mt-1 px-3 py-2 rounded" style={{ color: 'var(--mute)', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--rule)' }}>
            Complete your squad setup to place bets.
          </div>
        )}

        {/* Inline options — shown when open and not yet resolved */}
        {!isPastDeadline && !!squadId && options.length > 0 && (
          <>
            <div className="flex items-center justify-between mt-1">
              <span style={{ color: deadline.color, fontSize: 10, fontWeight: 600 }}>{deadline.label}</span>
              {submitting && <span style={{ fontSize: 10, color: 'var(--mute)' }}>Saving…</span>}
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

      {/* Legacy picker — kept for "Change" flow when many options exist and submission already made */}
      {showPicker && options.length > 0 && (
        <OptionPicker
          options={options}
          onSelect={handleSelect}
          onClose={() => setShowPicker(false)}
        />
      )}
    </>
  );
}
