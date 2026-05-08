/**
 * BrandMark — Editorial Brandmark component
 * Displays the official "FORZA / FANTASY / LEAGUE" logo
 *
 * Props:
 *   theme     'dark' | 'light' — color scheme
 *   scale     number — scale multiplier (default 1)
 *   compact   boolean — compact layout (single line, smaller)
 */

export default function BrandMark({ theme = 'dark', scale = 1, compact = false }) {
  const isDark = theme === 'dark';
  const primaryText = isDark ? 'text-white' : 'text-[#080A0E]';
  const secondaryText = isDark ? 'text-[#F2EEE5]' : 'text-[#8B95A1]';

  if (compact) {
    return (
      <div
        className="flex items-center gap-2"
        style={{ transform: `scale(${scale})`, transformOrigin: 'left' }}
      >
        <span
          className={`text-sm font-black italic uppercase tracking-tighter ${primaryText}`}
          style={{ fontFamily: 'Archivo Black, sans-serif' }}
        >
          FORZA
        </span>
        <div className="w-[2px] h-5 bg-[#00B4D8] rotate-[15deg]" />
        <span
          className={`text-xs font-black uppercase tracking-tighter ${secondaryText}`}
          style={{ fontFamily: 'Archivo Black, sans-serif' }}
        >
          LEAGUE
        </span>
      </div>
    );
  }

  return (
    <div
      className="flex items-baseline gap-3"
      style={{ transform: `scale(${scale})`, transformOrigin: 'left' }}
    >
      <span
        className={`text-4xl font-black italic uppercase tracking-tighter leading-none ${primaryText}`}
        style={{ fontFamily: 'Archivo Black, sans-serif' }}
      >
        FORZA
      </span>
      {/* The Aligned Slash */}
      <div
        className="w-[3px] h-9 bg-[#00B4D8] mx-3 rotate-[15deg] self-center"
      />
      <div className="flex flex-col leading-[0.9]">
        <span
          className={`text-lg font-black uppercase tracking-tighter ${secondaryText}`}
          style={{ fontFamily: 'Archivo Black, sans-serif' }}
        >
          FANTASY
        </span>
        <span
          className={`text-lg font-black uppercase tracking-tighter ${secondaryText}`}
          style={{ fontFamily: 'Archivo Black, sans-serif' }}
        >
          LEAGUE
        </span>
      </div>
    </div>
  );
}
