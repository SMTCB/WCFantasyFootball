import { useNavigate } from 'react-router-dom';
import { useWishlistDraft } from '../hooks/useWishlistDraft';
import { fmtDraftTime } from '../lib/wishlistDraft';

// Entry point for the recurring Wishlist Draft — only renders in draft-mode
// leagues (get_wishlist_draft_status available). Copy follows the round's
// mode/phase (migration 294) so managers always know when the draft runs.
export default function WishlistDraftBanner({ leagueId }) {
  const navigate = useNavigate();
  const { shouldShow, roundNumber, submissionStatus, draft, loading } = useWishlistDraft(leagueId);

  if (loading || !shouldShow) return null;

  const hasSubmission = submissionStatus === 'pending';
  const { phase, mode, scheduledAt, hardDeadlineAt } = draft;

  let icon = hasSubmission ? '✅' : '📋';
  let tone = hasSubmission ? 'var(--positive)' : 'var(--cyan)';
  let bg   = hasSubmission ? 'var(--pos-bg)' : 'var(--accent-bg)';
  let msg;

  if (phase === 'running') {
    icon = '⏳'; tone = 'var(--gold)'; bg = 'var(--accent-bg)';
    msg = `Round ${roundNumber} wishlist draft running — market opens in a moment`;
  } else if (phase === 'free_market') {
    icon = '🛒'; tone = 'var(--mute)'; bg = 'var(--card)';
    msg = `No draft for round ${roundNumber} — free market, first come first served. Your wishlist is kept.`;
  } else if (phase === 'pre_draft') {
    const when = mode === 'auto'
      ? (scheduledAt ? `Draft runs ${fmtDraftTime(scheduledAt)}` : 'Draft time being set')
      : `Commissioner runs the draft${hardDeadlineAt ? ` — latest ${fmtDraftTime(hardDeadlineAt)}` : ''}`;
    msg = hasSubmission ? `${when} · wishlist submitted — tap to edit` : `${when} · rank your targets`;
  } else {
    // awaiting_round: previous draft done, list is for the next round
    msg = hasSubmission
      ? `Wishlist saved for round ${roundNumber} — tap to edit`
      : `Start your wishlist for round ${roundNumber}`;
  }

  return (
    <button
      onClick={() => navigate(`/league/${leagueId}/wishlist`)}
      className="w-full flex items-center justify-between gap-3 px-5 py-2.5 text-left transition-opacity active:opacity-80"
      style={{ background: bg, borderBottom: '1px solid var(--rule)' }}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span style={{ fontSize: 'var(--fs-body)' }}>{icon}</span>
        <span className="text-[11px] font-bold" style={{ color: tone }}>{msg}</span>
      </div>
      <span className="text-[10px] font-black uppercase tracking-widest shrink-0" style={{ color: 'var(--mute)' }}>
        {hasSubmission ? 'Edit' : 'Open'} ›
      </span>
    </button>
  );
}
