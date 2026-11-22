import BottomSheet from '../shared/BottomSheet';
import { IconClose } from '../UiIcons';
import Card from '../ui/Card';

// LEAGUE-SHEET-1: a manager's squad, opened from the league table. Moved out of
// LeagueScreen so it can use the shared BottomSheet (focus trap, Escape, one look).
// LeagueScreen already imports ClubCrest and LoadingRows directly, so they come in
// as props rather than imports here (Rolldown TDZ rule, CLAUDE.md).

const POS_COLOR = { GK: 'var(--purple)', DEF: 'var(--accent)', MID: 'var(--gold-text)' };

export default function ManagerTeamSheet({
  name, initials, hue, subtitle, roster, canCompare, onCompare, canTrade, onTrade, onClose,
  crest, loading,
}) {
  const Crest = crest;
  const Loading = loading;
  return (
    <BottomSheet onClose={onClose} ariaLabel={`${name}'s squad`} background="var(--bg)"
      maxHeight="85vh" maxWidth={600} contentStyle={{ height: '85vh', overflowY: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 20px 14px', borderBottom: '1px solid var(--rule)', flexShrink: 0 }}>
        <span aria-hidden="true" style={{ width: 44, height: 44, borderRadius: '50%', background: `${hue}26`, color: hue, display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 'var(--fs-body)', flexShrink: 0 }}>{initials}</span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <h2 style={{ margin: 0, fontFamily: "'Archivo Black', sans-serif", fontSize: 'var(--fs-heading)', color: 'var(--paper)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</h2>
          {subtitle && <div className="num" style={{ fontSize: 'var(--fs-label)', color: 'var(--mute)' }}>{subtitle}</div>}
        </div>
        <button onClick={onClose} aria-label="Close" className="hit-44" style={{ width: 44, height: 44, borderRadius: '50%', border: 'none', background: 'var(--elev)', color: 'var(--mute)', cursor: 'pointer', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
          <IconClose size={18} />
        </button>
      </div>
      {canCompare && (
        <div style={{ padding: '14px 20px 0', flexShrink: 0 }}>
          <button
            onClick={onCompare}
            style={{ width: '100%', minHeight: 'var(--tap)', borderRadius: 'var(--radius)', border: '1px solid var(--rule)', background: 'var(--card)', color: 'var(--paper)', fontFamily: 'inherit', fontSize: 'var(--fs-body)', fontWeight: 600, cursor: 'pointer' }}
          >Compare with me</button>
        </div>
      )}
      <div className="flex-1 overflow-y-auto no-scrollbar" style={{ padding: '16px 20px 20px' }}>
        {!roster.length && <Loading rows={3} />}
        {roster.length > 0 && (
          <Card padded={false} style={{ overflow: 'hidden' }}>
            {roster.map((p, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 56, padding: '8px 14px', borderBottom: i < roster.length - 1 ? '1px solid var(--rule)' : 'none' }}>
                <span style={{ width: 36, textAlign: 'center', padding: '3px 0', borderRadius: 6, fontSize: 'var(--fs-micro)', fontWeight: 700, color: POS_COLOR[p.position] ?? 'var(--danger)', background: 'var(--elev)', flexShrink: 0 }}>{p.position}</span>
                <Crest name={p.club} size={26} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 'var(--fs-body)', fontWeight: 600, color: 'var(--paper)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                  <div style={{ fontSize: 'var(--fs-micro)', color: 'var(--mute)' }}>{p.club}</div>
                </div>
                <div className="num" style={{ fontSize: 'var(--fs-label)', fontWeight: 600, color: 'var(--paper)', flexShrink: 0 }}>€{p.price}M</div>
                {canTrade && (
                  <button className="hit-44"
                    onClick={() => onTrade(p)}
                    style={{ fontFamily: 'inherit', fontSize: 'var(--fs-micro)', fontWeight: 600, color: 'var(--accent)', background: 'transparent', border: '1px solid var(--accent)', borderRadius: 8, padding: '4px 10px', cursor: 'pointer', flexShrink: 0 }}
                  >Trade</button>
                )}
              </div>
            ))}
          </Card>
        )}
      </div>
    </BottomSheet>
  );
}
