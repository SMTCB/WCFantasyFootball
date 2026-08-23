import BottomSheet from './BottomSheet';
import CompetitionArchivePanel from './CompetitionArchivePanel';

const MONO = "'JetBrains Mono', monospace";

// Minimal settings overlay for Paddock/Player Box owners — currently just
// hosts the archive toggle (B-13-F1 / B-13-TENNIS). Reuses BottomSheet for
// portal/backdrop/escape chrome rather than hand-rolling another overlay.
export default function CompetitionSettingsModal({
  competitionType,
  competitionId,
  name,
  archived,
  archivedAt,
  onUpdated,
  onClose,
}) {
  return (
    <BottomSheet onClose={onClose} maxWidth={420}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 16px 12px' }}>
        <span style={{ fontFamily: MONO, fontSize: 'var(--fs-micro)', letterSpacing: '.2em', color: 'var(--text)' }}>SETTINGS</span>
        <button
          type="button"
          onClick={onClose}
          style={{ background: 'transparent', border: 'none', color: 'var(--mute)', fontFamily: MONO, fontSize: 'var(--fs-micro)', letterSpacing: '.1em', cursor: 'pointer', padding: 4 }}
        >
          CLOSE
        </button>
      </div>
      <div style={{ padding: '0 16px 20px' }}>
        <CompetitionArchivePanel
          competitionType={competitionType}
          competitionId={competitionId}
          name={name}
          archived={archived}
          archivedAt={archivedAt}
          onUpdated={() => { onUpdated?.(); onClose?.(); }}
        />
      </div>
    </BottomSheet>
  );
}
