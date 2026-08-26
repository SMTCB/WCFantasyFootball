import { useNavigate } from 'react-router-dom';
import { useWishlistDraft } from '../hooks/useWishlistDraft';

// Entry point for the recurring Wishlist Draft — only renders when
// get_wishlist_draft_status (via useWishlistDraft) reports a round currently
// open for submissions in a draft-mode league. Silent no-op for everyone
// else, which is the entire fairness invariant this feature rests on.
export default function WishlistDraftBanner({ leagueId }) {
  const navigate = useNavigate();
  const { shouldShow, roundNumber, submissionStatus, loading } = useWishlistDraft(leagueId);

  if (loading || !shouldShow) return null;

  const hasSubmission = submissionStatus === 'pending';

  return (
    <button
      onClick={() => navigate(`/league/${leagueId}/wishlist`)}
      className="w-full flex items-center justify-between gap-3 px-5 py-2.5 text-left transition-opacity active:opacity-80"
      style={{
        background: hasSubmission ? 'var(--pos-bg)' : 'var(--accent-bg)',
        borderBottom: '1px solid var(--rule)',
      }}
    >
      <div className="flex items-center gap-2">
        <span style={{ fontSize: 'var(--fs-body)' }}>{hasSubmission ? '✅' : '📋'}</span>
        <span className="text-[11px] font-bold" style={{ color: hasSubmission ? 'var(--positive)' : 'var(--cyan)' }}>
          {hasSubmission
            ? `Wishlist submitted for round ${roundNumber} — tap to edit`
            : `Wishlist Draft open for round ${roundNumber} — rank your targets`}
        </span>
      </div>
      <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: 'var(--mute)' }}>
        {hasSubmission ? 'Edit' : 'Open'} ›
      </span>
    </button>
  );
}
