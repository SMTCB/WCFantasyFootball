import { useState, useMemo } from 'react';
import { useBetSubmit } from '../hooks/useBetSubmit';
import { useToast } from '../hooks/useToast';

// ── helpers ───────────────────────────────────────────────────────────────────

function timeLeft(deadlineAt) {
  const diff = new Date(deadlineAt) - Date.now();
  if (diff <= 0) return { label: 'Deadline passed', expired: true, color: 'var(--danger)' };
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  if (h >= 24) return { label: `${Math.floor(h / 24)}d left`, expired: false, color: 'var(--mute)' };
  if (h > 0)   return { label: `${h}h ${m}m left`, expired: false, color: h < 2 ? 'var(--warning)' : 'var(--mute)' };
  return { label: `${m}m left`, expired: false, color: 'var(--danger)' };
}

function rewardLabel(type, value) {
  if (type === 'budget') return `+£${value}M`;
  return `+${value} pts`;
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

  const correctLabel = bet.correct_answer
    ? (options.find(o => o.key === bet.correct_answer)?.label ?? bet.correct_answer)
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
      <div
        className="rounded-md overflow-hidden"
        style={{ background: 'var(--ink-2)', border: `1px solid ${isResolved ? 'rgba(255,255,255,0.06)' : 'rgba(0,196,232,0.18)'}` }}
      >
        {/* Header */}
        <div
          className="px-4 py-2.5 flex items-center justify-between"
          style={{ background: isResolved ? 'rgba(255,255,255,0.03)' : 'rgba(0,196,232,0.06)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}
        >
          <div className="flex items-center gap-2">
            <span className="text-[13px]">
              {bet.template?.slug === 'player_block' ? '🛡️' : bet.template?.slug === 'match_result' ? '⚽' : '🎯'}
            </span>
            <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: 'var(--cyan)', fontFamily: 'Archivo Black, sans-serif' }}>
              {bet.title}
            </span>
            {bet.scope_ref && (
              <span className="text-[9px] text-white/30 uppercase tracking-wider">· MD{bet.scope_ref}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {resultBadge()}
            {!isResolved && (
              <div className="text-[9px] font-bold px-2 py-0.5 rounded-sm" style={{ color: 'var(--positive)', background: 'rgba(24,201,107,0.1)', fontFamily: 'Archivo Black, sans-serif' }}>
                {rewardLabel(bet.reward_type, bet.reward_value)}
              </div>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="px-4 py-3">
          <div className="text-[12px] mb-3 leading-relaxed" style={{ color: 'var(--mute)' }}>
            {bet.prompt}
          </div>

          {/* Resolved: show correct answer */}
          {isResolved && (
            <div className="flex items-center gap-3 mb-2">
              <div className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--mute)' }}>Answer:</div>
              <div className="text-[13px] font-black" style={{ color: 'var(--paper)' }}>{correctLabel ?? bet.correct_answer}</div>
            </div>
          )}

          {/* Submitted answer */}
          {submission && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-[#1e1e1e] border border-[#333] flex items-center justify-center text-[11px] font-black text-white/40 uppercase">
                  {answerLabel?.substring(0, 2)}
                </div>
                <div>
                  <div className="text-[10px] font-semibold mb-0.5" style={{ color: isResolved ? (submission.is_correct ? 'var(--positive)' : 'var(--danger)') : 'var(--cyan)' }}>
                    {isResolved ? (submission.is_correct ? '✓ Correct' : '✗ Wrong') : 'Your pick'}
                  </div>
                  <div className="text-[14px] font-semibold" style={{ color: 'var(--paper)' }}>{answerLabel}</div>
                </div>
              </div>
              {!isPastDeadline && (
                <button
                  onClick={() => setShowPicker(true)}
                  className="text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-sm transition-all active:scale-95"
                  style={{ color: 'var(--cyan)', border: '1px solid rgba(0,196,232,0.3)', fontFamily: 'Archivo Black, sans-serif' }}
                >
                  Change
                </button>
              )}
            </div>
          )}

          {/* No submission yet + deadline not passed */}
          {!submission && !isPastDeadline && options.length > 0 && (
            <div className="flex items-center justify-between">
              <span style={{ color: deadline.color, fontSize: 10, fontWeight: 600 }}>
                {deadline.label}
              </span>
              <button
                onClick={() => setShowPicker(true)}
                disabled={submitting}
                className="text-[12px] font-black uppercase tracking-widest px-4 py-2 rounded-sm transition-all active:scale-95 disabled:opacity-40"
                style={{ background: 'var(--cyan)', color: '#000', fontFamily: 'Archivo Black, sans-serif' }}
              >
                {submitting ? 'Saving…' : 'Make Pick'}
              </button>
            </div>
          )}

          {/* No submission + deadline passed */}
          {!submission && isPastDeadline && (
            <div className="text-[11px]" style={{ color: 'var(--mute)' }}>
              {isResolved ? 'You did not submit a pick.' : 'Deadline passed — no pick submitted.'}
            </div>
          )}

          {/* Deadline timer when not yet submitted */}
          {!submission && !isPastDeadline && options.length === 0 && (
            <div className="text-[11px]" style={{ color: 'var(--mute)' }}>No options available yet.</div>
          )}
        </div>
      </div>

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
