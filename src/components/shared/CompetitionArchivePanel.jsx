import { useCompetitionArchive } from '../../hooks/useCompetitionArchive';

// Local constants, not imported from CommissionerPanel/HubShared — this panel
// is mounted from F1/tennis screens as well as (eventually) league screens,
// and cross-importing risks the Rolldown TDZ crash pattern documented in
// CLAUDE.md (same module imported at two different depths). See PRs #300s
// history: HubShared's MONO/DISPLAY were inlined into BetCreatorPanel for
// the same reason.
const MONO    = "'JetBrains Mono', monospace";
const BODY    = "'Archivo', sans-serif";

const COPY = {
  paddock:     { noun: 'paddock' },
  player_box:  { noun: "player's box" },
};

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
      <span style={{ fontFamily: MONO, fontSize: 'var(--fs-micro)', letterSpacing: '.2em', color: checked ? 'var(--positive)' : 'var(--mute)' }}>
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

// Shared archive/reactivate control for Paddocks (F1) and Player Boxes
// (tennis) — B-13-F1 / B-13-TENNIS. Parity with League's CommissionerPanel
// archive toggle, but neither sport has background jobs to pause: archiving
// here is purely organizational (hides it from the default switcher/list).
export default function CompetitionArchivePanel({
  competitionType, // 'paddock' | 'player_box'
  competitionId,
  name,
  archived,
  archivedAt,
  onUpdated,
}) {
  const { archive, unarchive, busy, message } = useCompetitionArchive(competitionType, competitionId, onUpdated);
  const noun = COPY[competitionType]?.noun ?? 'competition';

  const handleToggle = () => {
    if (archived) { unarchive(); return; }
    if (!window.confirm(`Archive this ${noun}? It will be hidden from your active list until you reactivate. Nothing is deleted.`)) return;
    archive();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontFamily: MONO, fontSize: 'var(--fs-micro)', letterSpacing: '.2em', color: 'var(--mute)' }}>
        {name ? `${name.toUpperCase()} · ` : ''}ARCHIVE STATUS
      </div>

      {archived ? (
        <div style={{ padding: '8px 10px', background: 'var(--ink)', border: '1px solid var(--rule)', fontFamily: BODY, fontSize: 'var(--fs-micro)', color: 'var(--mute)', lineHeight: 1.5 }}>
          <span style={{ fontFamily: MONO, fontSize: 'var(--fs-micro)', letterSpacing: '.2em' }}>ARCHIVED · </span>
          {archivedAt ? `Since ${new Date(archivedAt).toLocaleDateString()}. ` : ''}Hidden from your active list.
        </div>
      ) : (
        <div style={{ padding: '8px 10px', background: 'rgba(240,180,0,0.06)', border: '1px solid rgba(240,180,0,0.25)', fontFamily: BODY, fontSize: 'var(--fs-micro)', color: 'var(--warn)', lineHeight: 1.5 }}>
          Active — visible in your switcher and lists by default.
        </div>
      )}

      <ToggleSwitch
        checked={!!archived}
        onChange={handleToggle}
        disabled={busy}
        labelOn="ARCHIVED"
        labelOff="ACTIVE"
      />

      {message && (
        <div style={{ fontFamily: BODY, fontSize: 'var(--fs-micro)', color: message.type === 'err' ? 'var(--negative)' : 'var(--positive)' }}>
          {message.text}
        </div>
      )}
    </div>
  );
}
