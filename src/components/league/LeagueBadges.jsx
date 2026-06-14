import { TYPE_COLOR } from './LeagueBadgeHelpers';

// Shared FORZAKIT badges for league lists (Select a League / My Leagues)
export function TypeChip({ type, format }) {
  const c = TYPE_COLOR[type] || 'var(--mute)';
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: '2px 7px',
        border: `1px solid ${c}44`,
        background: `${c}12`,
        color: c,
        fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: '.16em', fontWeight: 600,
        textTransform: 'uppercase', whiteSpace: 'nowrap',
      }}
    >
      {type}{format !== type && ` · ${format}`}
    </span>
  );
}

export function RankBadge({ rank, size = 'sm' }) {
  const medal = rank === 1 ? 'var(--gold)' : rank === 2 ? '#C0C0C0' : rank === 3 ? '#CD7F32' : 'var(--mute)';
  const big = size === 'lg';
  return (
    <div
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        width: big ? 40 : 32, height: big ? 40 : 32,
        border: `1.5px solid ${medal}55`,
        background: `${medal}0E`,
        flexShrink: 0,
      }}
    >
      <span style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: big ? 16 : 13, color: medal, lineHeight: 1 }}>
        {rank ? `#${rank}` : '—'}
      </span>
    </div>
  );
}
