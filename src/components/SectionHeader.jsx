export default function SectionHeader({ title, action, accent = 'cyan' }) {
  const accentColor = accent === 'gold'
    ? '#F0B400'
    : accent === 'purple'
    ? '#9D5FF5'
    : '#00C4E8';

  return (
    <div
      className="flex items-center gap-2.5 px-4 py-2.5"
      style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}
    >
      <div
        className="w-[3px] h-[14px] shrink-0 rounded-full"
        style={{ background: accentColor }}
      />
      <span
        className="text-[10.5px] font-bold uppercase tracking-[0.18em] flex-1 min-w-0 truncate"
        style={{ color: '#7D8A96', fontFamily: 'Barlow Condensed, sans-serif' }}
      >
        {title}
      </span>
      {action && <div className="ml-auto shrink-0">{action}</div>}
    </div>
  );
}
