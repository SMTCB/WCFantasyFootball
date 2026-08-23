import { TypeChip, RankBadge, ArchivedBadge } from './LeagueBadges';
import { TYPE_COLOR } from './LeagueBadgeHelpers';

const DISPLAY = "'Archivo Black', sans-serif";
const MONO = "'JetBrains Mono', monospace";

const archiveToggleStyle = {
  display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
  fontFamily: MONO, fontSize: 'var(--fs-micro)', letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--mute)',
};

// "Select a League" picker shown on Squad/Market when the user has multiple
// leagues and none is active yet. Renders a desktop table and a mobile card list.
export default function SelectLeaguePicker({ leagues, onSelect, eyebrow, showArchived = false, onToggleShowArchived }) {
  const archivedCount = leagues.filter(l => l.archived).length;
  const visibleLeagues = showArchived ? leagues : leagues.filter(l => !l.archived);
  const sortedLeagues = [...visibleLeagues].sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));

  const archiveToggle = archivedCount > 0 && onToggleShowArchived && (
    <label style={archiveToggleStyle}>
      <input type="checkbox" checked={showArchived} onChange={e => onToggleShowArchived(e.target.checked)} />
      Show archived ({archivedCount})
    </label>
  );
  return (
    <div className="min-h-screen bg-bg" style={{ color: 'var(--paper)' }}>
      {/* Desktop */}
      <div className="hidden lg:flex flex-col">
        <div style={{ padding: '28px 40px 20px', borderBottom: '1px solid var(--rule)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            {eyebrow && (
              <div className="fk-eyebrow" style={{ marginBottom: 6 }}>{eyebrow}</div>
            )}
            <div style={{ fontFamily: DISPLAY, fontWeight: 900, fontSize: 'var(--fs-title)', textTransform: 'uppercase', letterSpacing: '-0.02em' }}>
              Select a League
            </div>
          </div>
          {archiveToggle}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px 100px 90px 100px', gap: 0, padding: '10px 0 10px 40px', borderBottom: '1px solid var(--rule)' }}>
          <span style={{ fontFamily: MONO, fontSize: 'var(--fs-micro)', color: 'var(--mute)', letterSpacing: '.16em', textTransform: 'uppercase' }}>League</span>
          <span style={{ fontFamily: MONO, fontSize: 'var(--fs-micro)', color: 'var(--mute)', letterSpacing: '.16em', textTransform: 'uppercase', textAlign: 'center' }}>Type</span>
          <span style={{ fontFamily: MONO, fontSize: 'var(--fs-micro)', color: 'var(--mute)', letterSpacing: '.16em', textTransform: 'uppercase', textAlign: 'center' }}>Members</span>
          <span style={{ fontFamily: MONO, fontSize: 'var(--fs-micro)', color: 'var(--mute)', letterSpacing: '.16em', textTransform: 'uppercase', textAlign: 'right', paddingRight: 16 }}>Rank</span>
          <span style={{ fontFamily: MONO, fontSize: 'var(--fs-micro)', color: 'var(--mute)', letterSpacing: '.16em', textTransform: 'uppercase', textAlign: 'right', paddingRight: 40 }}>Pts</span>
        </div>
        {sortedLeagues.map(l => {
          const tc = TYPE_COLOR[l.type] || 'var(--mute)';
          return (
            <div
              key={l.id}
              onClick={() => onSelect(l)}
              className="group transition-all"
              style={{
                display: 'grid', gridTemplateColumns: '1fr 140px 100px 90px 100px', gap: 0,
                padding: '0 0 0 40px',
                borderBottom: '1px solid var(--rule)',
                borderLeft: '3px solid transparent',
                cursor: 'pointer', alignItems: 'center',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderLeftColor = tc; e.currentTarget.style.background = 'var(--shell-fill)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderLeftColor = 'transparent'; e.currentTarget.style.background = 'transparent'; }}
            >
              <div style={{ padding: '18px 16px 18px 0', minWidth: 0 }}>
                <div style={{ fontFamily: DISPLAY, fontWeight: 900, fontSize: 'var(--fs-body)', letterSpacing: '-0.01em', textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {l.name}
                </div>
              </div>
              <div style={{ padding: '18px 0', display: 'flex', justifyContent: 'center', gap: 6 }}>
                <TypeChip type={l.type} format={l.format} />
                {l.archived && <ArchivedBadge />}
              </div>
              <div style={{ padding: '18px 0', textAlign: 'center' }}>
                <span style={{ fontFamily: MONO, fontSize: 'var(--fs-label)', color: 'var(--mute)' }}>{l.members ?? '—'}</span>
              </div>
              <div style={{ padding: '18px 0', textAlign: 'right', paddingRight: 16, display: 'flex', justifyContent: 'flex-end' }}>
                <RankBadge rank={l.rank} />
              </div>
              <div style={{ padding: '18px 40px 18px 0', textAlign: 'right' }}>
                <div style={{ fontFamily: DISPLAY, fontWeight: 900, fontSize: 'var(--fs-heading)', color: 'var(--positive)' }}>{Math.round(l.totalPoints ?? 0)}</div>
                <div style={{ fontFamily: MONO, fontSize: 'var(--fs-micro)', color: 'var(--mute)', letterSpacing: '.16em', textTransform: 'uppercase' }}>Pts</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Mobile */}
      <div className="lg:hidden">
        <div style={{ padding: '20px 18px 14px', borderBottom: '1px solid var(--rule)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            {eyebrow && (
              <div className="fk-eyebrow" style={{ marginBottom: 3 }}>{eyebrow}</div>
            )}
            <div style={{ fontFamily: DISPLAY, fontWeight: 900, fontSize: 'var(--fs-title)', textTransform: 'uppercase', letterSpacing: '-0.02em' }}>
              Select a League
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
            <div style={{ fontFamily: MONO, fontSize: 'var(--fs-micro)', color: 'var(--mute)', letterSpacing: '.16em', textTransform: 'uppercase' }}>
              {sortedLeagues.length} {sortedLeagues.length === 1 ? 'LEAGUE' : 'LEAGUES'}
            </div>
            {archiveToggle}
          </div>
        </div>
        {sortedLeagues.map(l => {
          const tc = TYPE_COLOR[l.type] || 'var(--mute)';
          return (
            <div
              key={l.id}
              onClick={() => onSelect(l)}
              className="active:opacity-70"
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '14px 18px',
                borderBottom: '1px solid var(--rule)',
                borderLeft: `3px solid ${tc}`,
                cursor: 'pointer',
              }}
            >
              <RankBadge rank={l.rank} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: DISPLAY, fontWeight: 900, fontSize: 'var(--fs-body)', letterSpacing: '-0.01em', textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {l.name}
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
                  <TypeChip type={l.type} format={l.format} />
                  {l.archived && <ArchivedBadge />}
                  <span style={{ fontFamily: MONO, fontSize: 'var(--fs-micro)', color: 'var(--mute)', letterSpacing: '.1em', textTransform: 'uppercase' }}>
                    {l.members ?? '—'} members
                  </span>
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontFamily: DISPLAY, fontWeight: 900, fontSize: 'var(--fs-heading)', color: 'var(--positive)' }}>{Math.round(l.totalPoints ?? 0)}</div>
                <div style={{ fontFamily: MONO, fontSize: 'var(--fs-micro)', color: 'var(--mute)', letterSpacing: '.16em', textTransform: 'uppercase' }}>Pts</div>
              </div>
              <span style={{ color: 'var(--mute)', fontSize: 'var(--fs-body)', flexShrink: 0 }}>›</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
