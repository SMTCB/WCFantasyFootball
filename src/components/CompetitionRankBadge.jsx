const MEDAL_COLORS = ['var(--gold)', '#C0C0C0', '#CD7F32'];
const SIZES = { sm: { box: 24, font: 'var(--fs-micro)' }, lg: { box: 42, font: 'var(--fs-title)' } };

export default function CompetitionRankBadge({ rank, accent = 'var(--accent)', size = 'sm' }) {
  const color = rank <= 3 ? MEDAL_COLORS[rank - 1] : accent;
  const { box, font } = SIZES[size];
  return (
    <div style={{
      width: box, height: box, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: `${color}18`, border: `1px solid ${color}66`,
      fontFamily: "'Archivo Black', sans-serif", fontSize: font, color,
    }}>
      {rank}
    </div>
  );
}
