// Shared copy + time helpers for the between-rounds wishlist draft
// (migration 294 modes: manual | auto | disabled).

export const MODE_LABEL = {
  manual:   'Manual',
  auto:     'Auto',
  disabled: 'Disabled',
};

export const MODE_HELP = {
  manual:   'You run the draft from this panel. Safety net: it runs automatically 8h before the first kickoff if you forget.',
  auto:     'The draft runs at the date/time you set. Managers see the time on the league banner.',
  disabled: 'No draft — the market opens straight away, first come, first served. Wishlists are kept for later.',
};

// Rule mirrors set_wishlist_draft_mode: auto times need ≥ 6h notice.
export const MIN_NOTICE_MS = 6 * 60 * 60 * 1000;

// Local, compact: "Sat 12 Oct, 18:00"
export function fmtDraftTime(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

// ISO → value for <input type="datetime-local"> in the viewer's timezone.
export function toLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Suggested auto time when the commissioner switches a round to Auto:
// 48h before kickoff, but never sooner than 6h from now (+ a minute of slack)
// and never after the kickoff − 8h deadline. Mirrors the SQL default.
export function suggestDraftTime({ firstKickoffAt, hardDeadlineAt }) {
  const minT = Date.now() + MIN_NOTICE_MS + 5 * 60 * 1000;
  let t = firstKickoffAt ? new Date(firstKickoffAt).getTime() - 48 * 60 * 60 * 1000 : minT;
  t = Math.max(t, minT);
  if (hardDeadlineAt) t = Math.min(t, new Date(hardDeadlineAt).getTime());
  return new Date(t).toISOString();
}

// Human message for a { ok:false, code, error } result from the draft RPCs /
// run-wishlist-draft. The SQL error text is already user-facing; codes only
// override where the UI can say something more specific.
export function draftErrorMessage(res) {
  switch (res?.code) {
    case 'TOO_SOON':         return 'Pick a time at least 6 hours from now so managers can prepare.';
    case 'AFTER_DEADLINE':   return `The draft must run at least 8h before kickoff${res.hard_deadline_at ? ` — latest ${fmtDraftTime(res.hard_deadline_at)}` : ''}.`;
    case 'TOO_LATE':         return 'Kickoff is too close to bring the draft back this round — it stays a free market. Change the league default for next round.';
    case 'NO_PENDING_ROUND': return 'This round\'s draft has already run. Change the league default to affect the next round.';
    case 'DRAFT_RUNNING':    return 'The draft is running right now — try again in a minute.';
    case 'DISABLED':         return 'The draft is disabled for this round. Switch it to Manual or Auto first.';
    case 'FORBIDDEN':        return 'Only the commissioner can do this.';
    default:                 return res?.error ?? 'Something went wrong — try again.';
  }
}
