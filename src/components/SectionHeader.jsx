export default function SectionHeader({ title, action, accent = 'cyan' }) {
  const accentColor = accent === 'gold' ? '#E0A800' : '#00B4D8';
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="w-0.5 h-4 shrink-0 rounded-full" style={{ background: accentColor }} />
      <span
        className="font-black text-[11px] uppercase tracking-[0.2em] text-text-secondary"
        style={{ fontFamily: 'Barlow Condensed, sans-serif' }}
      >
        {title}
      </span>
      {action && <div className="ml-auto">{action}</div>}
    </div>
  );
}
